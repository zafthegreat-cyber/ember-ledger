import {gtinKey, normalizeBarcodeValue} from './barcodeIdentity.mjs';

export const PRODUCT_PHOTO_LIMITS=Object.freeze({maxBytes:12*1024*1024,maxTextLength:20_000,maxQueryLength:180});
const allowedTypes=new Set(['image/jpeg','image/png','image/webp']);
const cancelled=()=>({status:'cancelled',code:'cancelled',message:'Reading stopped. You can type the product details below.',text:'',suggestions:[],query:''});

export function validateProductPhotoFile(file){
 if(!file||!allowedTypes.has(String(file.type||'').toLowerCase()))return 'Choose a JPG, PNG or WebP photo. HEIC, GIF and documents are not supported.';
 if(!Number.isFinite(file.size)||file.size<=0)return 'That image is empty. Choose another photo.';
 if(file.size>PRODUCT_PHOTO_LIMITS.maxBytes)return 'Choose a photo no larger than 12 MB. A closer view of the printed name or barcode helps.';
 return '';
}

export function normalizeProductPhotoQuery(value=''){
 return String(value).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,PRODUCT_PHOTO_LIMITS.maxQueryLength);
}

// These are text suggestions, not artwork recognition or an identity decision.
// Never infer a finish, grade, language, ownership, quantity or market price.
export function parseProductPhotoText(value=''){
 const text=String(value).replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,PRODUCT_PHOTO_LIMITS.maxTextLength);
 const lines=text.split('\n').map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean);
 const codes=[],numbers=[],names=[];
 const seen=new Set();
 const add=(list,type,value,label)=>{const query=normalizeProductPhotoQuery(value);if(!query||seen.has(query.toLowerCase()))return;seen.add(query.toLowerCase());list.push({type,value:query,label});};
 // Printed barcode digits may be split into adjacent OCR lines. Join only
 // digit-only fragments and still require the exact printed GTIN checksum.
 // No letters, punctuation, missing digits or checksum digits are repaired.
 for(let index=0;index<lines.length;index++){
  let joined='';
  for(let part=index;part<Math.min(index+3,lines.length);part++){
   if(!/^\d[\d\t ]*$/.test(lines[part]))break;
   joined+=lines[part].replace(/\s+/g,'');
   if(joined.length>14)break;
   if(part>index&&[12,13,14].includes(joined.length)&&gtinKey(joined))add(codes,'barcode',joined,'Printed barcode');
  }
 }
 for(const line of lines){
  for(const match of line.matchAll(/(?:^|[^\d])((?:\d[\t -]*){7,13}\d)(?!\d)/g)){
   const code=normalizeBarcodeValue(match[1]);
   const modelLine=/^(?:SKU|model|item\s*(?:no|number)|product\s*(?:no|number))\b/i.test(line);
   const shortCodeLabel=code.length!==8||/\b(?:UPC|EAN|GTIN|barcode)\b/i.test(line);
   if(!modelLine&&shortCodeLabel&&gtinKey(code))add(codes,'barcode',code,'Printed barcode');
  }
  for(const match of line.matchAll(/\b(?:[A-Z]{1,4}\s*)?\d{1,4}[a-z]?\s*\/\s*(?:[A-Z]{1,4}\s*)?\d{1,4}[a-z]?\b/gi))add(numbers,'card-number',match[0].replace(/\s+/g,''),'Card number');
  const title=line.replace(/\s+HP\s*\d{1,4}\b.*$/i,'').trim();
  const boilerplate=/^(?:pok[eé]mon(?: trading card game)?$|trading card game$|(?:the )?pok[eé]mon company\b|[a-z ]+ company(?: international)?$|www\.|https?:|copyright|©|all rights reserved|warning|made in|printed in|retain these|[0-9]+\s*\+|HP\s*\d|(?:UPC|EAN|GTIN|SKU|model)\b)/i;
  if(title.length>=3&&title.length<=85&&/[a-zà-ž]/i.test(title)&&!boilerplate.test(title)&&!/^\W*\d[\d\s/-]+$/.test(title))add(names,'text',title,'Visible text');
 }
 // A usable barcode is more useful than the address/legal text around it.
 // The complete transcript remains available for manual correction.
 const suggestions=[...codes.slice(0,3),...numbers.slice(0,3),...(codes.length?[]:names.slice(0,4))].slice(0,8);
 const query=codes.length===1?codes[0].value:normalizeProductPhotoQuery([names[0]?.value,numbers[0]?.value].filter(Boolean).join(' '));
 return{text,suggestions,query};
}

const messages={
 timeout:'Reading took too long. Try a closer photo or type the name, card number or barcode.',
 image_dimensions:'This photo is too large to read safely on a phone. Choose a smaller image or type the details.',
 invalid_image:'This image could not be read. Choose a still JPG, PNG or WebP photo, or type the details.',
 animated_image:'Choose a still JPG, PNG or WebP photo, or type the details.',
 unsupported:'This device cannot read photo text automatically. Type the name, card number or barcode below.',
};

export async function readProductPhotoText(file,{signal,onProgress,loadExtractor=()=>import('./scoutScreenshotOcr.mjs')}={}){
 const invalid=validateProductPhotoFile(file);
 if(invalid)return{status:'invalid',code:'file_invalid',message:invalid,text:'',suggestions:[],query:''};
 if(signal?.aborted)return cancelled();
 try{
  const {extractScoutScreenshotText}=await loadExtractor();
  if(signal?.aborted)return cancelled();
  const result=await extractScoutScreenshotText(file,{signal,onProgress:event=>{
   if(!signal?.aborted)onProgress?.({...event,label:event.stage==='reading'?'Reading printed text…':event.stage==='preparing'?'Preparing photo on this device…':'Loading the private text reader…'});
  }});
  if(signal?.aborted||result.status==='cancelled')return cancelled();
  if(['complete','low_confidence'].includes(result.status)){
   const parsed=parseProductPhotoText(result.text);
   return{...parsed,status:result.status,confidence:result.confidence,code:result.code,message:parsed.text?(result.status==='low_confidence'?'Some text was unclear. Correct the search text before continuing.':'Text read. Check the name, set and numbers before searching.'):'No readable text found. Try a closer photo or type the details below.'};
  }
  return{status:result.status||'failed',code:result.code||'read_failed',message:messages[result.code]||'The photo could not be read. You can still type the product details below.',text:'',suggestions:[],query:''};
 }catch{
  return signal?.aborted?cancelled():{status:'failed',code:'read_failed',message:'The text reader could not load. Try again or type the product details below.',text:'',suggestions:[],query:''};
 }
}
