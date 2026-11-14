import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { inspectionDetailSize } from '../src/utils/inspectionMotion.mjs';

const registry=JSON.parse(readFileSync('src/data/productInspectionFaces.json','utf8'));
const catalog=JSON.parse(readFileSync('src/data/generated/sealedProducts.json','utf8'));
const row=id=>catalog.find(product=>String(product.tcgplayerProductId)===String(id));
const perfect=row('672401'),pack=row('504467');
const output=await build({stdin:{contents:'export {default as Tile} from "./src/components/CatalogItemDisplay.jsx";export {default as Viewer} from "./src/components/ProductInspectViewer.jsx";',resolveDir:process.cwd(),loader:'jsx'},bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic',loader:{'.css':'empty'},external:['react','react/jsx-runtime'],define:{'import.meta.env':'{}'},logLevel:'silent'});
const module={exports:{}};
new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);

async function environment(run){
 const dom=new JSDOM('<main id="root"></main>',{url:'https://fixture.invalid/',pretendToBeVisual:true});
 const previous=new Map(),frames=new Map();let sequence=0,now=0;
 dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 Object.defineProperty(dom.window.HTMLElement.prototype,'clientWidth',{configurable:true,get(){return this.classList.contains('product-inspect__stage')?390:parseFloat(this.style.width)||240;}});
 Object.defineProperty(dom.window.HTMLElement.prototype,'clientHeight',{configurable:true,get(){return this.classList.contains('product-inspect__stage')?440:parseFloat(this.style.height)||240;}});
 const globals={window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:fn=>{frames.set(++sequence,fn);return sequence;},cancelAnimationFrame:id=>frames.delete(id)};
 for(const[key,value]of Object.entries(globals)){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 const root=createRoot(document.getElementById('root'));
 const render=(component,product,src=product.imageUrl)=>act(async()=>root.render(React.createElement(module.exports[component],{product,src,title:product.name,alt:product.name})));
 const flush=()=>{for(let guard=0;frames.size&&guard<10;guard++){const queued=[...frames.values()];frames.clear();now+=400;queued.forEach(fn=>fn(now));}};
 const click=label=>act(async()=>{const button=[...document.querySelectorAll('button')].find(node=>(node.getAttribute('aria-label')||node.textContent)===label);assert.ok(button,`Control ${label} exists`);button.click();flush();});
 const imageEvent=(image,type,size)=>act(async()=>{if(size){Object.defineProperty(image,'naturalWidth',{value:size[0],configurable:true});Object.defineProperty(image,'naturalHeight',{value:size[1],configurable:true});}image.dispatchEvent(new dom.window.Event(type));});
 try{await run({dom,render,click,imageEvent,flush,frames});}finally{await act(async()=>root.unmount());dom.window.close();for(const[key,descriptor]of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}

test('actual catalog tile uses the verified front despite a stock photoUrl alias, with lazy native-pixel projection',async()=>environment(async({render,imageEvent})=>{
 const product=Object.freeze({...perfect,marketPrice:987.65,priceCheckedAt:'2026-11-14T23:00:00Z',quantity:3,purchaseCost:42.25});const before=JSON.stringify(product);
 assert.equal(product.photoUrl,product.imageUrl,'real generated alias reproduces prior bug');
 await render('Tile',product);
 const surface=document.querySelector('.catalog-item-display__surface'),image=surface.querySelector('img');
 assert.equal(surface.dataset.projected,'true');assert.equal(image.getAttribute('src'),registry['tcgplayer:672401'].faces.front.src);assert.equal(image.getAttribute('loading'),'lazy');
 await imageEvent(image,'load',[1600,1600]);
 assert.equal(image.style.getPropertyValue('--face-source-width'),'1600px');assert.equal(image.style.getPropertyValue('--face-source-height'),'1600px');assert.match(image.style.transform,/^matrix3d\(/);
 assert.equal(JSON.stringify(product),before,'tile never changes identity, quotes, cost or quantity');
}));

test('a stock card photoUrl alias retains the rounded-card surface, while a personal photo keeps its own framing',async()=>environment(async({render})=>{
 const source='https://images.pokemontcg.io/base1/58.png';
 const card={id:'card',catalogType:'card',name:'Pikachu',game:'Pokemon',language:'English',imageUrl:source,photoUrl:source};
 await render('Tile',card);assert.equal(document.querySelector('.catalog-item-display__surface').dataset.card,'true');
 const personal={...card,displayImage:'/owner-full-scene.jpg',photoUrl:'/owner-full-scene.jpg'};
 await render('Tile',personal,personal.displayImage);assert.equal(document.querySelector('.catalog-item-display__surface').dataset.card,'false');assert.equal(document.querySelector('img').getAttribute('src'),personal.displayImage);
}));

test('actual tile preserves an explicit personal box photo even with a valid stock catalog identity',async()=>environment(async({render,imageEvent})=>{
 const product=Object.freeze({...perfect,displayImage:'/owner-box.jpg',photoUrl:'/owner-box.jpg'});const before=JSON.stringify(product);
 await render('Tile',product,product.displayImage);const image=document.querySelector('img');
 assert.equal(image.getAttribute('src'),'/owner-box.jpg');assert.equal(image.getAttribute('loading'),'lazy');assert.equal(document.querySelector('.catalog-item-display__surface').dataset.projected,'false');
 await imageEvent(image,'load',[1200,600]);assert.equal(document.querySelector('.catalog-item-display__surface').style.height,'120px');assert.equal(JSON.stringify(product),before);
}));

test('a failed registry front falls back, then changing product or source resets failure and prior aspect',async()=>environment(async({render,imageEvent})=>{
 await render('Tile',perfect);await imageEvent(document.querySelector('img'),'error');
 assert.equal(document.querySelector('.catalog-item-display__surface').dataset.projected,'false');assert.match(document.querySelector('img').getAttribute('src'),/672401/);
 await render('Tile',pack);assert.equal(document.querySelector('.catalog-item-display__surface').dataset.projected,'true');assert.equal(document.querySelector('img').getAttribute('src'),registry['tcgplayer:504467'].faces.front.src);
 await imageEvent(document.querySelector('img'),'error');assert.equal(document.querySelector('.catalog-item-display__surface').dataset.projected,'false');
 await render('Tile',pack,'https://tcgplayer-cdn.tcgplayer.com/product/504467_in_1000x1000.jpg');assert.equal(document.querySelector('.catalog-item-display__surface').dataset.projected,'true','same product with new source resets its registry failure');
 const first={id:'custom',name:'Owner item',catalogType:'sealed',displayImage:'/personal-a.jpg',photoUrl:'/personal-a.jpg'};
 await render('Tile',first,first.displayImage);await imageEvent(document.querySelector('img'),'load',[1200,600]);assert.equal(document.querySelector('.catalog-item-display__surface').style.height,'120px');
 const next={...first,displayImage:'/personal-b.jpg',photoUrl:'/personal-b.jpg'};await render('Tile',next,next.displayImage);
 assert.equal(document.querySelector('.catalog-item-display__surface').style.height,'240px','old2:1 aspect is reset before next photo loads');assert.equal(document.querySelector('img').getAttribute('src'),next.displayImage);
}));

test('actual151 wrapper has two distinct genuine eager faces, thin geometry and working front/back controls',async()=>environment(async({render,click})=>{
 const product=Object.freeze({...pack,marketPrice:765.43,quantity:2,cost:18.50});const before=JSON.stringify(product);
 await render('Viewer',product);const object=document.querySelector('.product-inspect__object'),model=registry['tcgplayer:504467'];
 assert.equal(object.dataset.shape,'pack');assert.deepEqual([...new Set([...object.querySelectorAll('img')].map(img=>img.getAttribute('src')))].sort(),[model.faces.front.src,model.faces.back.src].sort());
 assert.equal(object.querySelectorAll('[data-wrapper-face="front"] img').length,5);assert.equal(object.querySelectorAll('[data-wrapper-face="back"] img').length,5);
 assert.equal(object.querySelectorAll('.product-inspect__left img,.product-inspect__right img,.product-inspect__top img,.product-inspect__bottom img').length,0,'neutral thin edges never borrow fake side photographs');
 assert.equal(document.querySelectorAll('.product-inspect__box-material').length,0);
 assert.ok([...object.querySelectorAll('img')].every(image=>image.getAttribute('loading')==='eager'));
 assert.equal(Number(object.style.getPropertyValue('--box-depth')),model.dimensions.depth/model.dimensions.width);assert.ok(Number(object.style.getPropertyValue('--box-depth'))<.06);
 assert.deepEqual([...document.querySelector('[aria-label="Wrapper faces"]').querySelectorAll('button')].map(button=>button.textContent),['Front','Back']);
 await click('Back');assert.equal(document.querySelector('[role="status"]').textContent,'Back view');assert.equal(Math.abs(Number(object.style.getPropertyValue('--inspect-yaw').replace('deg',''))),180);
 await click('Front');assert.equal(object.style.getPropertyValue('--inspect-yaw'),'0deg');assert.equal(JSON.stringify(product),before);
}));

test('a failed151 back falls back to the genuine front photograph without blank rotating walls',async()=>environment(async({render,imageEvent})=>{
 await render('Viewer',pack);await imageEvent(document.querySelector('[data-wrapper-face="back"] img'),'error');
 assert.equal(document.querySelector('.product-inspect__stage').dataset.shape,'photo');assert.equal(document.querySelectorAll('.product-inspect__face').length,1);
 assert.equal(document.querySelector('.product-inspect__front img').getAttribute('src'),registry['tcgplayer:504467'].faces.front.src);
 assert.equal(document.querySelector('[aria-label="Wrapper faces"]'),null);assert.equal(document.querySelectorAll('.product-inspect__back').length,0);
}));

test('actual wrapper Closer view allocates enough height for its registered1.846 aspect on phone and desktop',async()=>environment(async({render,click})=>{
 await render('Viewer',pack);await click('Closer view');
 const stage=document.querySelector('.product-inspect__stage'),dimensions=registry['tcgplayer:504467'].dimensions;
 assert.equal(stage.dataset.detail,'true');const width=parseFloat(stage.style.getPropertyValue('--detail-width')),height=parseFloat(stage.style.getPropertyValue('--detail-stage-height'));
 assert.ok(height>=width*dimensions.height/dimensions.width+39,'actual viewer passes dimensions into stage sizing');
 for(const viewport of [320,390,768,1440]){const size=inspectionDetailSize(viewport,'pack',dimensions);assert.ok(size.height>=size.width*dimensions.height/dimensions.width+39,`fits ${viewport}px`);}
}));
