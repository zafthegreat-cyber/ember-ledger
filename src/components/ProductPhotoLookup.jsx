import {lazy,Suspense,useEffect,useId,useRef,useState} from 'react';
// Live camera with a card-shaped frame; loads only when opened.
const CardCameraFrame=lazy(()=>import('./CardCameraFrame.jsx'));
import {normalizeProductPhotoQuery,readProductPhotoText,validateProductPhotoFile,PRODUCT_PHOTO_LIMITS} from '../utils/productPhotoLookup.mjs';
// Card mode uses the card reader (name strip + number strip); it loads only when a card photo is chosen.
const readCardPhoto=(file,options)=>import('../utils/cardPhotoReader.mjs').then(module=>module.readCardPhoto(file,options));
// Graded slabs: reads the label for grader, grade, cert number and the card.
const readSlabPhoto=(file,options)=>import('../utils/cardPhotoReader.mjs').then(module=>module.readSlabPhoto(file,options));
// Listing screenshots (eBay, Marketplace, Mercari…): screenshot text reader, then the listing parser.
const readListingScreenshot=async(file,options)=>{
 const [{extractScoutScreenshotText},{parseListingScreenshot}]=await Promise.all([import('../utils/scoutScreenshotOcr.mjs'),import('../utils/listingScreenshotText.mjs')]);
 const read=await extractScoutScreenshotText(file,options);
 if(!read?.text)return {...read,suggestions:[],query:''};
 const listing=parseListingScreenshot(read.text);
 const found=[listing.site,listing.title&&'title',listing.price!==null&&'price'].filter(Boolean);
 const suggestions=[listing.number&&{type:'card-number',value:listing.number,label:'Card number'},listing.title&&{type:'text',value:listing.title,label:'Listing title'}].filter(Boolean);
 return {...listing,listing:true,status:found.length?'complete':'low_confidence',suggestions,message:found.length?`Read ${found.join(', ')}. Check the details, then review the matches.`:'Could not read this screenshot. Crop to the listing title and price, or type the details.'};
};
const LISTING_FIELDS=[['site','Site'],['price','Price'],['shipping','Shipping']];
const money=value=>value===null||value===undefined||value===''?'':String(value);
const SLAB_FIELDS=[['gradingCompany','Grader'],['grade','Grade'],['certificationNumber','Cert number']];
import PictureMatches from './PictureMatches.jsx';
import { aiScanQuery, aiScanSuggestions, describeAiScan } from '../utils/aiScanText.mjs';
// Start loading the text model when the card screen opens, so the first scan skips the load.
const warmCardReader=()=>import('../utils/cardPhotoReader.mjs').then(module=>module.warmCardReader?.()).catch(()=>{});
import './product-photo-lookup.css';

// Only the explicitly reviewed query leaves this component. The selected file,
// preview URL and complete OCR text are never sent to a parent or saved.
// Card mode may also hand `onPicture` a 16-character fingerprint of the photo
// (made on this device) so earlier confirmed scans can be suggested.
const fingerprintCard=file=>import("../utils/cardPictureFingerprint.js").then(module=>module.fingerprintCardFile(file)).catch(()=>"");
export default function ProductPhotoLookup({onQuery,onDraftChange,onSlabDetails,initialSlab=false,initialQuery='',disabled=false,kind='item',onListingDetails,onPicture,pictureMemory,ai,autoCamera=false,autoSearch=kind==='card',reader=kind==='card'?readCardPhoto:kind==='listing'?readListingScreenshot:readProductPhotoText,slabReader=readSlabPhoto}){
 const fileRef=useRef(null),[aiBusy,setAiBusy]=useState(false),[aiResult,setAiResult]=useState(null),[aiError,setAiError]=useState(''),[aiRemaining,setAiRemaining]=useState(null);
 const id=useId(),sequence=useRef(0),controller=useRef(null),previewRef=useRef(''),edited=useRef(false),queryRef=useRef(null);
 const [preview,setPreview]=useState(''),[fileName,setFileName]=useState(''),[query,setQuery]=useState(initialQuery),[text,setText]=useState(''),[suggestions,setSuggestions]=useState([]),[busy,setBusy]=useState(false),[searching,setSearching]=useState(false),[progress,setProgress]=useState(null),[message,setMessage]=useState(''),[error,setError]=useState(''),[cameraOpen,setCameraOpen]=useState(Boolean(autoCamera&&kind==='card')),[slab,setSlab]=useState(initialSlab),[slabDetails,setSlabDetails]=useState(initialSlab?{gradingCompany:'',grade:'',certificationNumber:''}:null),[listingDetails,setListingDetails]=useState(null);
 useEffect(()=>{if(kind==='card'&&reader===readCardPhoto)void warmCardReader();},[kind,reader]);
 useEffect(()=>()=>{sequence.current++;controller.current?.abort();if(previewRef.current)URL.revokeObjectURL(previewRef.current);},[]);
 function stop(){sequence.current++;controller.current?.abort();controller.current=null;setBusy(false);setProgress(null);}
 function clearPreview(){if(previewRef.current)URL.revokeObjectURL(previewRef.current);previewRef.current='';fileRef.current=null;setAiResult(null);setAiError('');setPreview('');setFileName('');}
 async function choose(event){
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  await readFile(file);
 }
 // framed: the photo is the area inside the card-shaped camera frame.
 async function readFile(file,{framed=false}={}){
  onDraftChange?.();
  stop();clearPreview();setError('');setMessage('');setText('');setSuggestions([]);setQuery('');edited.current=false;
  const invalid=validateProductPhotoFile(file);if(invalid){setError(invalid);return;}
  const request=sequence.current,abort=new AbortController();controller.current=abort;
  previewRef.current=URL.createObjectURL(file);fileRef.current=file;setPreview(previewRef.current);setFileName(file.name);setBusy(true);
  if(kind==='card'&&!slab&&typeof onPicture==='function'){onPicture('');void fingerprintCard(file).then(hash=>{if(request===sequence.current&&hash)onPicture(hash);});}
  try{
   const result=await (slab?slabReader:reader)(file,{signal:abort.signal,framed,onProgress:value=>{if(request===sequence.current)setProgress(value);}});
   if(request!==sequence.current||abort.signal.aborted)return;
   setText(result.text||'');setSuggestions(result.suggestions||[]);if(!edited.current){onDraftChange?.();setQuery(result.query||'');}
   if(result.listing){const details={site:result.site||'',price:money(result.price),shipping:money(result.shipping),sold:Boolean(result.sold),title:result.title||'',condition:result.condition||'',graded:Boolean(result.graded),gradingCompany:result.gradingCompany||'',grade:result.grade||''};setListingDetails(details);onListingDetails?.(details);}
   if(slab){const details={gradingCompany:result.gradingCompany||'',grade:result.grade||'',certificationNumber:result.certificationNumber||''};setSlabDetails(details);onSlabDetails?.(details);}
   // Nov 27 2026: a slab scanned with the card frame. The reader found its label, so the slab box is ticked and filled in.
   else if(kind==='card'&&result.gradedSlab){const details={gradingCompany:result.gradedSlab.gradingCompany||'',grade:result.gradedSlab.grade||'',certificationNumber:result.gradedSlab.certificationNumber||''};setSlab(true);setSlabDetails(details);onSlabDetails?.(details);}
   setMessage(result.message||'Review the text before searching.');
   // A card read with both name and number (or a slab with its card number) is searched straight away; the person still picks the match.
   const confident=result.certainty==='name-and-number'||(slab&&result.number&&result.name);
   if(autoSearch&&confident&&!edited.current&&result.query){setBusy(false);setProgress(null);controller.current=null;await runSearch(result.query,request);}
   if(['invalid','failed','unsupported','timeout'].includes(result.status))setError(result.message||'Type the details below to continue.');
  }catch{if(request===sequence.current&&!abort.signal.aborted)setError('The photo could not be read. Type the product details below.');}
  finally{if(request===sequence.current){setBusy(false);setProgress(null);controller.current=null;}}
 }
 // Paid plans: ask AI what the photo shows, then search the catalog with its answer.
 async function identifyWithAi(){
  const file=fileRef.current;if(!file||!ai?.allowed||typeof ai.onIdentify!=='function'||aiBusy)return;
  const aiKind=kind==='listing'?'listing':slab?'slab':kind==='card'?'card':kind==='sealed'?'sealed':'item';
  stop();setAiBusy(true);setAiError('');setAiResult(null);
  try{
   const reply=await ai.onIdentify(file,{kind:aiKind,hint:normalizeProductPhotoQuery(query)});
   if(fileRef.current!==file)return;
   if(Number.isFinite(reply?.remaining))setAiRemaining(reply.remaining);
   if(!reply?.ok){setAiError(reply?.message||'AI scan did not finish. Try again.');return;}
   const result=reply.result;setAiResult(result);
   if(!result.found){setAiError(result.notes||'AI could not find a trading card item in this photo. Try a closer, brighter photo.');return;}
   if(slab&&(result.gradingCompany||result.grade||result.certNumber)){const details={gradingCompany:result.gradingCompany||slabDetails?.gradingCompany||'',grade:result.grade||slabDetails?.grade||'',certificationNumber:result.certNumber||slabDetails?.certificationNumber||''};setSlabDetails(details);onSlabDetails?.(details);}
   setSuggestions(aiScanSuggestions(result));setAiBusy(false);pickQuery(aiScanQuery(result));
  }catch{setAiError('AI scan did not finish. Check your connection and try again.');}
  finally{setAiBusy(false);}
 }
 // A card picked from picture memory: stop reading the photo and search for it.
 function pickQuery(text){
  const value=normalizeProductPhotoQuery(text||'');if(!value||disabled||searching||typeof onQuery!=='function')return;
  stop();edited.current=true;setQuery(value);setError('');setMessage('');
  const request=sequence.current;setSearching(true);
  Promise.resolve().then(()=>onQuery(value)).catch(()=>{if(request===sequence.current)setError('Catalog search did not finish. Your search text is still here; try again.');}).finally(()=>{if(request===sequence.current)setSearching(false);});
 }
 async function runSearch(text,request=sequence.current){
  const value=normalizeProductPhotoQuery(text);if(!value||disabled||typeof onQuery!=='function')return;
  setSearching(true);setError('');
  try{await onQuery(value);}
  catch{if(request===sequence.current)setError('Catalog search did not finish. Your search text is still here; try again.');}
  finally{if(request===sequence.current)setSearching(false);}
 }
 async function search(){
  if(busy||searching)return;
  await runSearch(query);
 }
  const subject=kind==='card'?'card':kind==='sealed'?'sealed product':'card or sealed product';
 const isListing=kind==='listing';
 return <section className="product-photo-lookup" aria-labelledby={`${id}-title`}>
  <header><h3 id={`${id}-title`}>{isListing?'Read a listing screenshot':'Find from a photo'}</h3><p>{isListing?'Screenshot a listing on eBay, Facebook Marketplace, Mercari, TCGplayer, Whatnot or OfferUp. We read the title, price, shipping and condition.':`Photograph the printed name, card number or barcode on your ${subject}.`}</p></header>
  {kind==='card'?<label className="product-photo-lookup__slab"><input type="checkbox" checked={slab} disabled={disabled||busy||searching} onChange={event=>{const on=event.target.checked;setSlab(on);const next=on?{gradingCompany:'',grade:'',certificationNumber:''}:null;setSlabDetails(next);onSlabDetails?.(next);}}/>This is a graded slab (PSA, CGC, Beckett…)</label>:null}
  {slab&&slabDetails?<div className="product-photo-lookup__slab-fields" aria-label="Slab label details">{SLAB_FIELDS.map(([key,label])=><label key={key}>{label}<input value={slabDetails[key]} autoComplete="off" maxLength={40} disabled={disabled||searching} onChange={event=>{const next={...slabDetails,[key]:event.target.value};setSlabDetails(next);onSlabDetails?.(next);}}/></label>)}</div>:null}
  {kind==='card'&&cameraOpen?<Suspense fallback={<p role="status">Opening the camera…</p>}><CardCameraFrame slab={slab} onCancel={()=>setCameraOpen(false)} onCapture={async file=>{setCameraOpen(false);await readFile(file,{framed:true});}}/></Suspense>:null}
  {kind==='card'&&!cameraOpen?<button type="button" className="product-photo-lookup__camera" disabled={disabled||searching||busy} onClick={()=>setCameraOpen(true)}>{slab?'Scan with the slab frame':'Scan with the card frame'}</button>:null}
  {isListing?<div className="product-photo-lookup__pickers"><label className="product-photo-lookup__picker">Choose screenshot<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a listing screenshot" disabled={disabled||searching} onChange={choose}/></label></div>:<div className="product-photo-lookup__pickers">
   <label className="product-photo-lookup__picker">Take photo<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Take a product photo" disabled={disabled||searching} onChange={choose}/></label>
   <label className="product-photo-lookup__picker">Choose image<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a product image" disabled={disabled||searching} onChange={choose}/></label>
  </div>}
  {listingDetails?<div className="product-photo-lookup__slab-fields" aria-label="Listing details">{LISTING_FIELDS.map(([key,label])=><label key={key}>{label}<input value={listingDetails[key]} inputMode={key==='site'?'text':'decimal'} autoComplete="off" maxLength={40} disabled={disabled||searching} onChange={event=>{const next={...listingDetails,[key]:event.target.value};setListingDetails(next);onListingDetails?.(next);}}/></label>)}{listingDetails.sold?<p className="product-photo-lookup__note">This listing shows a sold price.</p>:null}{listingDetails.graded?<p className="product-photo-lookup__note">Graded: {listingDetails.gradingCompany} {listingDetails.grade}</p>:null}</div>:null}
  <p className="product-photo-lookup__privacy">{ai?.allowed?'Your photo stays on this device unless you tap Identify with AI.':'Your photo stays on this device.'} Text reading does not identify artwork, foil, condition or grade.</p>
  {preview&&<div className="product-photo-lookup__source"><img src={preview} alt="Selected product photo"/><div><span>{fileName}</span><button type="button" disabled={disabled||searching} onClick={()=>{onDraftChange?.();onPicture?.('');stop();clearPreview();setText('');setSuggestions([]);setMessage('Photo removed. You can use the search text below.');}}>Remove photo</button></div></div>}
  {ai&&preview?<div className="product-photo-lookup__ai">
   {ai.allowed?<button type="button" className="product-photo-lookup__ai-button" disabled={disabled||searching||aiBusy} onClick={identifyWithAi}>{aiBusy?'Identifying…':'Identify with AI'}</button>
   :<button type="button" className="product-photo-lookup__ai-button is-locked" onClick={()=>ai.onUpgrade?.()}>Identify with AI · paid plans</button>}
   {aiBusy?<p role="status">Asking AI what this is…</p>:null}
   {aiResult?.found?<p className="product-photo-lookup__ai-result" role="status"><strong>AI read:</strong> {describeAiScan(aiResult)} <small>({aiResult.confidence} confidence)</small>{aiResult.notes?<><br/><small>{aiResult.notes}</small></>:null}</p>:null}
   {aiError?<p role="alert" className="product-photo-lookup__error">{aiError}</p>:null}
   <p className="product-photo-lookup__note">{ai.allowed?`AI sends a smaller copy of this photo to Anthropic to identify it. It is not stored. Check the match before saving.${Number.isFinite(aiRemaining)?` ${aiRemaining} AI scans left today.`:''}`:'Paid plans can identify cards, slabs and sealed products from the picture with AI.'}</p>
  </div>:null}
  {pictureMemory?<PictureMatches {...pictureMemory} disabled={disabled||searching} onPick={match=>pickQuery(pictureMemory.onPick?.(match))}/>:null}
  {busy&&<div className="product-photo-lookup__progress"><p role="status">{progress?.label||'Preparing photo on this device…'}</p><progress aria-label="Reading photo text" max="1" value={Number.isFinite(progress?.progress)?progress.progress:undefined}/><button type="button" onClick={()=>{onDraftChange?.();stop();setMessage('Reading stopped. You can type the details below.');queryRef.current?.focus();}}>Stop reading</button></div>}
  {!busy&&message&&!error&&<p role="status">{message}</p>}
  {error&&<p role="alert" className="product-photo-lookup__error">{error}</p>}
  {suggestions.length>0&&<div className="product-photo-lookup__suggestions" aria-label="Text suggestions">{suggestions.map(row=><button key={`${row.type}:${row.value}`} type="button" disabled={disabled||searching} onClick={()=>{onDraftChange?.();edited.current=true;setQuery(row.value);queryRef.current?.focus();}}><small>{row.label}</small>{row.value}</button>)}</div>}
  <label className="product-photo-lookup__query" htmlFor={`${id}-query`}>Search text<input ref={queryRef} id={`${id}-query`} value={query} maxLength={PRODUCT_PHOTO_LIMITS.maxQueryLength} autoComplete="off" disabled={disabled||searching} placeholder="Name, set, card number or barcode" aria-describedby={`${id}-review`} onChange={event=>{onDraftChange?.();edited.current=true;setQuery(event.target.value);}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void search();}}}/></label>
  <p id={`${id}-review`}>Correct any misread text, then review the matches. Full catalog search needs internet; offline results may be limited.</p>
  <button className="product-photo-lookup__search" type="button" onClick={search} disabled={disabled||busy||searching||!normalizeProductPhotoQuery(query)||typeof onQuery!=='function'}>{searching?'Searching…':'Review catalog matches'}</button>
  {text&&<details><summary>Text read from image</summary><pre>{text}</pre></details>}
 </section>;
}
