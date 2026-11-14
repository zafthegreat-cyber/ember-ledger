import test from 'node:test';
import assert from 'node:assert/strict';
import {readProductPhotoText,parseProductPhotoText,normalizeProductPhotoQuery,validateProductPhotoFile,PRODUCT_PHOTO_LIMITS} from '../src/utils/productPhotoLookup.mjs';
const file={type:'image/png',size:1500};

test('only supported bounded still-image inputs reach the lazy reader',async()=>{
 let loads=0;const loadExtractor=async()=>{loads++;throw Error('must not load');};
 for(const source of [null,'https://external/image.jpg',{type:'image/heic',size:12},{type:'image/svg+xml',size:123},{type:'image/gif',size:123},{type:'image/png',size:0},{type:'image/jpeg',size:PRODUCT_PHOTO_LIMITS.maxBytes+1}]){
  assert.ok(validateProductPhotoFile(source));assert.equal((await readProductPhotoText(source,{loadExtractor})).status,'invalid');
 }
 assert.equal(loads,0);for(const type of ['image/jpeg','image/png','image/webp'])assert.equal(validateProductPhotoFile({type,size:300}),'');
});
test('valid printed barcode is offered without repairing or inventing an OCR digit',()=>{
 const value=parseProductPhotoText('Journey Together\nBooster Bundle\nUPC 0 196214 108417\nModel 100-10341');
 assert.equal(value.query,'0196214108417');assert.equal(value.suggestions.find(x=>x.type==='barcode')?.value,'0196214108417');
 assert.equal(value.suggestions.some(x=>x.type==='text'),false,'barcode review does not clutter suggestions with packaging legal/address text');
 assert.equal(parseProductPhotoText('UPC 0 196214 108418').suggestions.some(x=>x.type==='barcode'),false);
 assert.equal(parseProductPhotoText('UPC 0 I96214 I084I7').suggestions.some(x=>x.type==='barcode'),false);
 assert.equal(parseProductPhotoText('0196214\n\n111387').query,'0196214111387');
 assert.equal(parseProductPhotoText('0196214\n111388').suggestions.some(x=>x.type==='barcode'),false);
 assert.equal(parseProductPhotoText('0196214\nintervening text\n111387').suggestions.some(x=>x.type==='barcode'),false);
});
test('card title and printed card number remain reviewable text, with no grade or foil inference',()=>{
 const result=parseProductPhotoText('Pikachu HP 60\nBase Set\n58/102\nThunder Jolt 30');
 assert.equal(result.query,'Pikachu 58/102');assert.ok(result.suggestions.some(x=>x.value==='58/102'));
 assert.deepEqual(Object.keys(result).sort(),['query','suggestions','text']);
 assert.equal(parseProductPhotoText('Pokémon Journey Together Booster Bundle').query,'Pokémon Journey Together Booster Bundle');
 assert.ok(parseProductPhotoText('TG04 / TG30').suggestions.some(x=>x.value==='TG04/TG30'));
});
test('multiple printed GTINs stay choices rather than silently choosing the first barcode',()=>{
 const value=parseProductPhotoText('Journey Together\n0196214108417\n0196214111387');
 assert.equal(value.suggestions.filter(x=>x.type==='barcode').length,2);assert.equal(value.query,'Journey Together');
});
test('untrusted OCR text stays bounded plain text and the reviewed query is bounded separately',()=>{
 const result=parseProductPhotoText('\u0000<script>not executable</script>\r\n'+ 'a'.repeat(25000));
 assert.ok(result.text.includes('<script>'));assert.equal(result.text.includes('\u0000'),false);assert.ok(result.text.length<=20000);
 assert.equal(normalizeProductPhotoQuery(' a\n b\t c '),'a b c');assert.equal(normalizeProductPhotoQuery('a'.repeat(1000)).length,180);
});
test('cancellation before and during lazy loading never starts image recognition',async()=>{
 let loaded=0,read=0;const controller=new AbortController();controller.abort();
 assert.equal((await readProductPhotoText(file,{signal:controller.signal,loadExtractor:async()=>{loaded++;}})).status,'cancelled');assert.equal(loaded,0);
 let release;const next=new AbortController();const promise=readProductPhotoText(file,{signal:next.signal,loadExtractor:()=>new Promise(resolve=>{release=resolve;})});next.abort();release({extractScoutScreenshotText:async()=>{read++;}});
 assert.equal((await promise).status,'cancelled');assert.equal(read,0);
});
test('reader forwards cancellation/progress and preserves the source object',async()=>{
 const controller=new AbortController(),events=[];const frozen=Object.freeze({...file,owner:'fixture',marketPrice:54.32,quantity:2});
 const result=await readProductPhotoText(frozen,{signal:controller.signal,onProgress:event=>events.push(event),loadExtractor:async()=>({extractScoutScreenshotText:async(input,options)=>{assert.equal(input,frozen);assert.equal(options.signal,controller.signal);options.onProgress({stage:'reading',progress:.5});return{status:'complete',confidence:91,text:'Journey Together\n0196214108417'};}})});
 assert.equal(result.query,'0196214108417');assert.equal(events[0].label,'Reading printed text…');assert.equal(frozen.marketPrice,54.32);assert.equal(frozen.quantity,2);
});
test('empty/low-confidence, unsupported, timeout and lazy-load failure retain manual fallback',async()=>{
 for(const result of [{status:'low_confidence',text:'',confidence:12},{status:'unsupported',code:'unsupported'},{status:'timeout',code:'timeout'}]){
  const parsed=await readProductPhotoText(file,{loadExtractor:async()=>({extractScoutScreenshotText:async()=>result})});assert.match(parsed.message,/type/i);assert.equal(parsed.query,'');
 }
 const failed=await readProductPhotoText(file,{loadExtractor:async()=>{throw Error('module unavailable');}});assert.equal(failed.status,'failed');assert.match(failed.message,/type/i);
});
