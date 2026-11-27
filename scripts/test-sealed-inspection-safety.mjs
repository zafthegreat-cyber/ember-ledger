import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { inspectionGeometry, productInspectionProfile, resolveInspectionArtwork, validInspectionQuad } from '../src/utils/productInspection.mjs';

const registry=JSON.parse(readFileSync('src/data/productInspectionFaces.json','utf8'));
const sealedCatalog=JSON.parse(readFileSync('src/data/generated/sealedProducts.json','utf8'));
const catalog=[...sealedCatalog,...JSON.parse(readFileSync('src/data/generated/pokemonTcgCards.json','utf8'))];
const perfect=catalog.find(row=>row.tcgplayerProductId==='672401');
const prismatic=catalog.find(row=>row.tcgplayerProductId==='593355');
const model=registry['tcgplayer:672401'];
test('exact provider identity accepts missing optional metadata but rejects contradictory edition, name, language and game',()=>{
 assert.equal(resolveInspectionArtwork(perfect,registry),model);
 assert.equal(resolveInspectionArtwork({tcgplayerProductId:672401},registry),model);
 assert.equal(resolveInspectionArtwork({...perfect,language:'en',game:'Pokémon TCG'},registry),model);
 for(const change of [{name:'Perfect Order Elite Trainer Box Case'},{name:'Perfect Order Pokemon Center Elite Trainer Box'},{name:'Code Card Perfect Order Elite Trainer Box'},{name:'Prismatic Evolutions Elite Trainer Box'},{language:'Japanese'},{languageCode:'ja'},{game:'Magic: The Gathering'},{edition:'Pokemon Center'},{variant:'Case'},{upc:'111111111111'}])assert.equal(resolveInspectionArtwork({...perfect,...change},registry),null,JSON.stringify(change));
 for(const id of ['616163','644852','598487','670607','670608','593324','600697','672402','672404','672405']){
  const artwork=resolveInspectionArtwork({tcgplayerProductId:id},registry);assert.notEqual(artwork,model,id);assert.notEqual(artwork,registry['tcgplayer:593355'],id);
  if(artwork)assert.equal(artwork.name,catalog.find(row=>row.tcgplayerProductId===id)?.name,id);
 }
 assert.equal(resolveInspectionArtwork({name:model.name,upc:model.upc},registry),null,'Name/UPC similarity alone cannot grant faces');
});
test('all catalog lookups preserve record content and never give a code card or a case another product’s stock faces',()=>{
 for(const row of catalog){
  const original=JSON.stringify(row);const artwork=resolveInspectionArtwork(Object.freeze(row),registry);const profile=productInspectionProfile(row,artwork);inspectionGeometry(profile);
  assert.equal(JSON.stringify(row),original,row.id);
  if(artwork)assert.equal(artwork.name,row.name,row.id);
  if(/\bcode card\b/i.test(row.name))assert.equal(artwork,null,row.name);
 }
 // The production catalog grows independently of these visual fixtures.
 // About 900 single cards (Dratini, Fighting Energy: "tin" in the name) left the sealed file for the
 // cards file when the catalog stopped filing cards as sealed products; the combined count below holds.
 assert.ok(sealedCatalog.length>=3800);
 assert.ok(catalog.length>=33125);
});
test('non-ETB nested identity metadata rejects a contradictory UPC or physical model',()=>{
 const product=catalog.find(row=>row.tcgplayerProductId==='502005'),artwork=registry['tcgplayer:502005'];
 assert.ok(artwork.identity.upc);assert.ok(artwork.identity.model);
 assert.equal(resolveInspectionArtwork({...product,upc:artwork.identity.upc,model:artwork.identity.model},registry),artwork);
 assert.equal(resolveInspectionArtwork({...product,upc:'0001111111111'},registry),null);
 assert.equal(resolveInspectionArtwork({...product,modelNumber:'wrong-model'},registry),null);
});
test('printed UPC separators preserve exact product matching without accepting different digits or letters',()=>{
 const product=sealedCatalog.find(row=>row.tcgplayerProductId==='221312'),artwork=registry['tcgplayer:221312'];
 assert.ok(artwork);
 for(const upc of ['0-820650-807497','0 820650 807497','0820650807497','820650807497'])assert.equal(resolveInspectionArtwork({...product,upc},registry),artwork,upc);
 for(const upc of ['0-820650-807498','0820650807497x'])assert.equal(resolveInspectionArtwork({...product,upc},registry),null,upc);
 assert.equal(resolveInspectionArtwork({...product,language:'Japanese'},registry),null);
});

test('cuboids require six distinct valid face crops and explicit finite positive dimensions',()=>{
 const profile=productInspectionProfile(perfect,model);assert.equal(inspectionGeometry(profile),'box');
 for(const name of ['front','back','left','right','top','bottom']){
  const faces={...profile.faces};delete faces[name];assert.equal(inspectionGeometry({...profile,faces}),'photo',name);
 }
 for(const dimensions of [undefined,{width:1,height:1,depth:0},{width:Infinity,height:1,depth:1},{width:1,height:NaN,depth:1},{width:-1,height:1,depth:1}])assert.equal(inspectionGeometry({...profile,dimensions}),'photo');
 for(const quad of [[[0,0],[1,1],[1,0],[0,1]],[[0,0],[0,1],[1,1],[1,0]],[[0,0],[1,0],[1,1],[0,-.01]],[[0,0],[0,0],[0,0],[0,0]]]){
  assert.equal(validInspectionQuad(quad),false);assert.equal(inspectionGeometry({...profile,faces:{...profile.faces,front:{...profile.faces.front,quad}}}),'photo');
 }
 assert.equal(inspectionGeometry({...profile,faces:Object.fromEntries(Object.keys(profile.faces).map(face=>[face,profile.faces.front]))}),'photo','Never reuse one face on six sides');
 for(const productType of ['Mini Tin','Poké Ball Tin','Collector Chest','Booster Pack','Blister Pack'])assert.equal(inspectionGeometry(productInspectionProfile({catalogType:'sealed',productType},model)),'photo',productType);
});
test('every registered photographed face retains its source bytes and a usable clockwise crop',()=>{
 for(const [key,entry] of Object.entries(registry))for(const [face,texture] of Object.entries(entry.faces)){
  assert.equal(createHash('sha256').update(readFileSync('public'+texture.src)).digest('hex'),texture.sha256,`${key}:${face}`);
  if(texture.quad!==undefined)assert.ok(validInspectionQuad(texture.quad),`${key}:${face}`);assert.match(texture.sourcePage,/^https:\/\//);assert.match(texture.sourceImage,/^https:\/\//);
 }
});

const output=await build({stdin:{contents:'export {default} from "./src/components/ProductInspectViewer.jsx";',resolveDir:process.cwd(),loader:'jsx'},bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic',loader:{'.css':'empty'},external:['react','react/jsx-runtime'],define:{'import.meta.env':'{}'},logLevel:'silent'});
const module={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
async function environment(run){
 const dom=new JSDOM('<main id="root"></main>',{url:'https://fixture.invalid/',pretendToBeVisual:true});const descriptors=new Map(),frames=new Map();let seq=0;
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:fn=>{frames.set(++seq,fn);return seq;},cancelAnimationFrame:id=>frames.delete(id)})){descriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 const root=createRoot(document.getElementById('root'));const render=product=>act(async()=>root.render(React.createElement(module.exports.default,{product,src:'/original-product.jpg',title:product.name||'Box'})));
 const click=label=>act(async()=>{[...document.querySelectorAll('button')].find(button=>button.textContent===label).click();const queued=[...frames.values()];frames.clear();queued.forEach(fn=>fn(0));});
 try{await run({dom,render,click,frames});}finally{await act(async()=>root.unmount());dom.window.close();for(const[key,descriptor]of descriptors)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}
test('actual viewer rejects stale retail IDs on conflicting products and keeps their original images',async()=>environment(async({render})=>{
 for(const product of [{...prismatic,name:'Prismatic Evolutions Pokemon Center Elite Trainer Box Exclusive'},{...prismatic,language:'Japanese'},{...perfect,name:'Perfect Order Elite Trainer Box Case'}]){
  await render(product);assert.equal(document.querySelector('.product-inspect__stage').dataset.shape,'photo');assert.equal(document.querySelectorAll('.product-inspect__box-material').length,0);assert.equal(document.querySelector('.product-inspect__front img').getAttribute('src'),'/original-product.jpg');
 }
 await render(perfect);assert.equal(document.querySelector('.product-inspect__stage').dataset.shape,'box');
}));
test('partial real photos remain individually viewable without blank walls or borrowed dimensions',async()=>environment(async({render,click})=>{
 const product=Object.freeze({name:'Owner box',catalogType:'sealed',productType:'Elite Trainer Box',frontImageUrl:'/owner-front.jpg',backImageUrl:'/owner-back.jpg',leftImageUrl:'/owner-left.jpg',marketPrice:129.54,unitCost:45,quantity:2});const before=JSON.stringify(product);
 await render(product);assert.equal(document.querySelector('.product-inspect__stage').dataset.shape,'photo');assert.equal(document.querySelectorAll('.product-inspect__face').length,1);
 assert.deepEqual([...document.querySelector('[aria-label="Product photos"]').querySelectorAll('button')].map(button=>button.textContent),['Front','Back','Left']);
 await click('Back');assert.equal(document.querySelector('.product-inspect__front img').getAttribute('src'),'/owner-back.jpg');assert.match(document.querySelector('[role="status"]').textContent,/Back photo/);
 await click('Left');assert.equal(document.querySelector('.product-inspect__front img').getAttribute('src'),'/owner-left.jpg');assert.equal(JSON.stringify(product),before);
}));
test('a failed cuboid side degrades to real photo choices instead of a blank fabricated side',async()=>environment(async({render,dom,click})=>{
 await render(perfect);await click('Back');
 await act(async()=>document.querySelector('.product-inspect__right img').dispatchEvent(new dom.window.Event('error')));
 assert.equal(document.querySelector('.product-inspect__stage').dataset.shape,'photo');assert.equal(document.querySelectorAll('.product-inspect__face').length,1);assert.equal(document.querySelectorAll('.product-inspect__box-material').length,0);
 assert.ok(document.querySelector('[aria-label="Product photos"]'));assert.equal([...document.querySelector('[aria-label="Product photos"]').querySelectorAll('button')].some(button=>button.textContent==='Right'),false);
 await click('Back');assert.equal(document.querySelector('.product-inspect__front img').getAttribute('src'),model.faces.back.src);
}));
test('a failed partial-gallery photo returns to another real image and removes the broken choice',async()=>environment(async({render,dom,click})=>{
 await render({catalogType:'sealed',productType:'Elite Trainer Box',frontImageUrl:'/front.jpg',backImageUrl:'/back.jpg',leftImageUrl:'/left.jpg'});await click('Back');
 await act(async()=>document.querySelector('.product-inspect__front img').dispatchEvent(new dom.window.Event('error')));
 assert.equal(document.querySelector('.product-inspect__front img').getAttribute('src'),'/front.jpg');assert.equal(document.querySelector('.product-inspect__stage').dataset.shape,'photo');
 assert.deepEqual([...document.querySelector('[aria-label="Product photos"]').querySelectorAll('button')].map(button=>button.textContent),['Front','Left']);
}));
test('gallery reset, Home and angle controls keep the selected photo and announce its real label',async()=>environment(async({render,dom,click})=>{
 await render({catalogType:'sealed',productType:'Elite Trainer Box',frontImageUrl:'/front.jpg',rightImageUrl:'/right.jpg'});await click('Right');
 const stage=document.querySelector('.product-inspect__stage');
 assert.match(document.querySelector('.product-inspect__hint').textContent,/tilt this photo/);assert.doesNotMatch(document.querySelector('.product-inspect__hint').textContent,/sideways to turn/);
 for(const action of [()=>click('Reset view'),()=>act(async()=>stage.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Home',bubbles:true}))),()=>act(async()=>stage.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))),()=>click('Still image')]){
  await action();assert.equal(document.querySelector('.product-inspect__front img').getAttribute('src'),'/right.jpg');assert.equal(document.querySelector('[role="status"]').textContent,'Right photo');
  assert.equal([...document.querySelector('[aria-label="Product photos"]').querySelectorAll('button')].find(button=>button.textContent==='Right').getAttribute('aria-pressed'),'true');
 }
}));

test('each complete registered catalog model exposes its own six real images and working face controls',async()=>environment(async({render,click})=>{
 for(const [key,artwork] of Object.entries(registry)){
  if(Object.keys(artwork.faces||{}).length!==6||!artwork.dimensions)continue;
  const product=catalog.find(row=>key.startsWith('tcgplayer:')?row.tcgplayerProductId===key.slice('tcgplayer:'.length):row.id===key.slice('catalog:'.length));
  assert.ok(product,key);const before=JSON.stringify(product);
  await render(Object.freeze(product));
  assert.equal(document.querySelector('.product-inspect__stage').dataset.shape,'box',key);
  assert.equal(document.querySelector('.product-inspect__object').dataset.finish,'regular','Sealed wrapping never acquires card foil');
  for(const face of ['front','left','back','right','top','bottom']){
   assert.equal(document.querySelector(`.product-inspect__${face} img`).getAttribute('src'),artwork.faces[face].src,`${key}:${face}`);
   const name=face[0].toUpperCase()+face.slice(1);await click(name);
   assert.equal(document.querySelector('[role="status"]').textContent,`${name} view`);
   assert.equal([...document.querySelectorAll('[aria-label="Box faces"] button')].find(button=>button.textContent===name).getAttribute('aria-pressed'),'true');
  }
  assert.equal(JSON.stringify(product),before,key);
 }
}));
