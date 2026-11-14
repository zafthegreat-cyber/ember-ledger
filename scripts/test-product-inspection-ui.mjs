import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const output = await build({ stdin: { contents: 'export { default } from "./src/components/ProductInspectViewer.jsx"; export { default as ProductDetail } from "./src/components/CollectionProductDetail.jsx"; export { default as Content } from "./src/components/ProductInspectionContent.jsx"; export { RecordDetailPage } from "./src/components/operations/RecordExperience.jsx";', resolveDir: process.cwd(), loader: "jsx" }, bundle: true, platform: "node", format: "cjs", write: false, jsx: "automatic", loader: { ".css": "empty" }, external: ["react", "react/jsx-runtime"], define: { "import.meta.env": "{}" }, plugins:[{name:'fixture-catalog-directory',setup(api){api.onResolve({filter:/^virtual:code3-set-catalog$/},()=>({path:'directory',namespace:'fixture'}));api.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default {}',loader:'js'}));}}], logLevel: "silent" });
const module = { exports: {} }; new Function("require", "module", "exports", output.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const Viewer = module.exports.default;
const product = Object.freeze({ id: "card", catalogType: "card", game:"Pokemon", language:"English", finish: "Reverse Holo", marketPrice: 22, quantity: 2 });

test("box uses six consistent photographed faces and box-only light/shadow without altering card surfaces", async () => environment(async ({render,click,flush}) => {
  await render({product:{tcgplayerProductId:672401,catalogType:"sealed",productType:"Elite Trainer Box"}});
  const stage = document.querySelector('.product-inspect__stage'), object = document.querySelector('.product-inspect__object');
  assert.equal(stage.dataset.shape,"box"); assert.equal(document.querySelectorAll('.product-inspect__box-material').length,6);
  assert.ok(document.querySelector('.product-inspect__box-shadow'));
  assert.equal(object.style.getPropertyValue('--inspect-pitch'),'0deg');
  assert.equal(object.style.getPropertyValue('--gloss-power'),'');
  for(const img of object.querySelectorAll('img'))assert.match(img.getAttribute('src'),/^\/assets\/inspection\/perfect-order\//);
  const initialShadow=stage.style.getPropertyValue('--box-shadow-bottom');
  await act(async()=>{click('Top');flush();});
  assert.notEqual(stage.style.getPropertyValue('--box-shadow-bottom'),initialShadow);
  assert.ok(Number(object.style.getPropertyValue('--box-top-shade'))<.205);
  await render(); assert.equal(document.querySelectorAll('.product-inspect__box-material').length,0);
  assert.equal(document.querySelector('.product-inspect__box-shadow'),null);
  assert.ok(document.querySelector('.product-inspect__object').style.getPropertyValue('--gloss-power'));
}));

async function environment(run) {
  const dom = new JSDOM('<main id="root"></main>', { url: "https://fixture.invalid/", pretendToBeVisual: true });
  const previous = new Map(), frames = new Map(); let sequence = 0;
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: callback => { frames.set(++sequence, callback); return sequence; }, cancelAnimationFrame: id => frames.delete(id) };
  for (const [key, value] of Object.entries(globals)) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); }
  const root = createRoot(document.getElementById("root"));
  const render = props => act(async () => root.render(React.createElement(Viewer, { product, src: "/card.jpg", title: "Test card", ...props })));
  const flush = (time = 0) => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(time)); };
  const click = label => [...document.querySelectorAll("button")].find(button => (button.getAttribute("aria-label") || button.textContent) === label).click();
  try { await run({ render, flush, click, root, dom, frames }); }
  finally { await act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
}

test("actual version metadata drives foil; the viewer never offers invented finish variants", async () => environment(async ({ render }) => {
  const before = JSON.stringify(product); await render();
  assert.equal(document.querySelector('[data-finish]').dataset.finish, "reverse");
  await render({product:{...product,finish:"Holofoil"}}); assert.equal(document.querySelector('[data-finish]').dataset.finish, "holo");
  assert.equal(document.querySelector('.product-inspect__finishes'),null);
  assert.equal(JSON.stringify(product), before);
  await render({ product: { catalogType: "sealed", productType: "Elite Trainer Box", frontImageUrl:"/front.jpg", backImageUrl:"/back.jpg" }, src: "/box.jpg" });
  assert.equal(document.querySelector('[data-shape]').dataset.shape, "box"); assert.equal(document.querySelector('.product-inspect__finishes'), null);
}));

test("keyboard and buttons rotate through the real back, reset, and preserve Escape for the parent modal", async () => environment(async ({ render, click, flush, dom }) => {
  await render(); const stage = document.querySelector('[aria-label="Rotate Test card"]');
  let escaped = false; stage.parentElement.addEventListener("keydown", event => { if (event.key === "Escape") escaped = true; });
  await act(async () => { for (let i = 0; i < 4; i++) click("Rotate right"); flush(); });
  assert.equal(document.querySelector('[role="status"]').textContent, "Back view"); assert.doesNotMatch(document.body.textContent, /photo not supplied|Side photo|Unphotographed/);
  await act(async () => { stage.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Home", bubbles: true })); flush(); });
  assert.equal(document.querySelector('.product-inspect__object').style.getPropertyValue('--inspect-yaw'), "0deg");
  assert.equal(document.querySelector('[role="status"]').textContent, "Front view");
  stage.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); assert.equal(escaped, true);
}));

test("touch drag batches frames, ignores secondary pointers and releases cleanly on cancel", async () => environment(async ({ render, flush, dom, frames }) => {
  await render(); const stage = document.querySelector('.product-inspect__stage'); let captured;
  stage.setPointerCapture = id => { captured = id; }; stage.hasPointerCapture = id => captured === id; stage.releasePointerCapture = () => { captured = null; };
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 340 });
  const send = (type, fields = {}) => { const event = new dom.window.Event(type, { bubbles: true }); for (const [key, value] of Object.entries({ pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 0, clientY: 0, ...fields })) Object.defineProperty(event, key, { value }); stage.dispatchEvent(event); };
  await act(async () => { send("pointerdown"); send("pointermove", { pointerId: 2, clientX: 200 }); }); assert.equal(frames.size, 0);
  await act(async () => { send("pointermove", { clientX: 50 }); send("pointermove", { clientX: 200 }); send("pointermove", { clientX: 200 }); });
  assert.equal(frames.size, 1); flush(); assert.equal(stage.dataset.dragging, "true");
  assert.equal(document.querySelector('.product-inspect__object').style.getPropertyValue('--inspect-yaw'), "140deg");
  await act(async () => send("pointercancel")); assert.equal(stage.dataset.dragging, "false"); assert.equal(captured, null); assert.equal(document.querySelector('[role="status"]').textContent, "Back view");
}));

test("still-image mode supports scrolling, cancels drag and keeps explicit controls usable", async () => environment(async ({ render, click, flush }) => {
  await render(); await act(async () => { click("Still image"); flush(); });
  assert.equal(document.querySelector('.product-inspect__stage').dataset.interactive, "false");
  assert.equal(document.querySelector('.product-inspect__object').style.getPropertyValue('--inspect-yaw'), "0deg");
  await act(async () => { click("Rotate left"); flush(); }); assert.equal(document.querySelector('.product-inspect__object').style.getPropertyValue('--inspect-yaw'), "-45deg");
}));

test("failed photos remove foil and selecting another item resets the viewer without leaking previous artwork", async () => environment(async ({ render, dom }) => {
  await render(); const front = document.querySelector('.product-inspect__front img');
  await act(async () => front.dispatchEvent(new dom.window.Event("load"))); assert.equal(document.querySelector('[data-art-ready]').dataset.artReady, "true");
  await act(async () => front.dispatchEvent(new dom.window.Event("error"))); assert.equal(document.querySelector('[data-art-ready]').dataset.artReady, "false"); assert.match(document.body.textContent, /Photo unavailable/);
  await render({ src: "/other.jpg", product: { catalogType: "card", finish: "Regular", backImageUrl: "/real-back.jpg" } });
  assert.equal(document.querySelector('[data-finish]').dataset.finish, "regular"); assert.equal(document.querySelector('[data-art-ready]').dataset.artReady, "false");
  assert.equal(document.querySelector('.product-inspect__back img').getAttribute('src'), "/real-back.jpg");
}));

test("closing/unmounting cancels pending animation work and reduced motion never auto-spins", async () => environment(async ({ render, click, root, frames }) => {
  await render(); await act(async () => click("Rotate right")); assert.equal(frames.size, 1);
  await act(async () => root.render(null)); assert.equal(frames.size, 0);
  const css = readFileSync("src/components/product-inspect.css", "utf8"); assert.match(css, /prefers-reduced-motion:reduce/); assert.doesNotMatch(css, /@keyframes/);
}));

test("grouped collection opens the same viewer and keeps each original copy accessible afterward", async () => environment(async ({ root, click }) => {
  const original = Object.freeze({ ...product, name: "Saved card", imageUrl: "/saved-card.jpg", allocatedItemCost: 8, purchaseDate: "2026-10-01" });
  const group = { item: original, records: [original], quantity: 2, purposeCounts: [{ purpose: "PERSONAL_COLLECTION", shortLabel: "PC", label: "Personal collection", quantity: 2 }], valuation: { value: 44, knownCount: 1 } };
  const before = JSON.stringify(group);
  await act(async () => root.render(React.createElement(module.exports.ProductDetail, { group, resolveItemImage: item => item.imageUrl, activeTab: "overview" })));
  await act(async () => click("Inspect Saved card in 3D"));
  assert.ok(document.querySelector('[aria-label="Saved card interactive preview"]')); assert.equal(document.querySelector('[data-finish]').dataset.finish, "reverse");
  await act(async () => click("Rotate right")); await act(async () => click("Close"));
  assert.equal(document.querySelector('[role="dialog"]'), null); assert.match(document.body.textContent, /Total quantity2/);
  await act(async () => root.render(React.createElement(module.exports.ProductDetail, { group, activeTab: "copies" })));
  assert.match(document.body.textContent, /Recorded cost\$8.00/); assert.equal(JSON.stringify(group), before);
}));

test("inventory detail opens box geometry and preserves existing summary/actions", async () => environment(async ({ root, click }) => {
  const box = Object.freeze({ id: "saved-box", catalogType: "sealed", productType: "Elite Trainer Box", frontImageUrl:"/front.jpg", backImageUrl:"/back.jpg", quantity: 3, marketPrice: 70.3 });
  const before = JSON.stringify(box); let action = 0;
  await act(async () => root.render(React.createElement(module.exports.RecordDetailPage, { title: "Saved box", image: "/box.jpg", imageProduct: box, summary: [{ label: "Quantity", value: box.quantity }], primaryAction: React.createElement("button", { onClick: () => action++ }, "Existing action") })));
  await act(async () => click("Inspect Saved box in 3D")); assert.equal(document.querySelector('[data-shape]').dataset.shape, "box");
  await act(async () => click("Close")); await act(async () => click("Existing action"));
  assert.equal(action, 1); assert.match(document.body.textContent, /Quantity3/); assert.equal(JSON.stringify(box), before);
}));

test("saved cards load exact current versions only when opened and cancel obsolete requests",async()=>environment(async({root})=>{
  const saved={...product,finish:'Normal',setName:'Aquapolis',tcgGame:'pokemon',tcgplayerProductId:'101',versions:[]};let release,signal,requested;
  const loadCatalog=(key,options)=>{requested=key;signal=options.signal;return new Promise(resolve=>release=resolve);};
  await act(async()=>root.render(React.createElement(module.exports.Content,{product:saved,src:'/saved.jpg',title:'Saved card',loadCatalog})));
  assert.equal(requested,'pokemon:aquapolis');assert.match(document.body.textContent,/Loading card versions/);
  const versions=[{key:'normal',variant:'Normal',label:'Normal',marketPrice:10},{key:'reverse holo',variant:'Reverse Holofoil',label:'Reverse Holo',marketPrice:18}];
  await act(async()=>release({available:true,products:[{tcgplayerProductId:'999',versions:[{...versions[0],marketPrice:999}]},{tcgplayerProductId:'101',versions}]}));
  assert.equal(document.querySelectorAll('[aria-label="Available versions"] button').length,2);assert.doesNotMatch(document.body.textContent,/\$999/);
  await act(async()=>root.render(null));assert.equal(signal.aborted,true);
}));

test("verified box opens all six unique faces and announces direct face selection, including top and bottom", async () => environment(async ({render,click,flush})=>{
  const saved=Object.freeze({id:"etb",tcgplayerProductId:"672401",catalogType:"sealed",productType:"Elite Trainer Box",marketPrice:70.3,quantity:2,allocatedItemCost:48});
  const before=JSON.stringify(saved);await render({product:saved});
  assert.equal(document.querySelectorAll('.product-inspect__face img').length,6);
  for(const [face,pitch,yaw] of [["Top",-90,0],["Bottom",90,0],["Right",0,-90],["Back",0,-180],["Left",0,90],["Front",0,0]]){
    await act(async()=>{click(face);flush();});
    const node=document.querySelector('.product-inspect__object');
    assert.equal(node.style.getPropertyValue('--inspect-pitch'),pitch+'deg');assert.equal(node.style.getPropertyValue('--inspect-yaw'),yaw+'deg');
    assert.equal(document.querySelector('[role="status"]').textContent,face+" view");
    assert.equal([...document.querySelectorAll('[aria-label="Box faces"] button')].find(b=>b.textContent===face).getAttribute('aria-pressed'),'true');
  }
  assert.equal(JSON.stringify(saved),before);
}));

test("official back is upright on its own face, with non-foil lighting and direct front/back controls",async()=>environment(async({render,click,flush,dom})=>{
 const item=Object.freeze({catalogType:"card",game:"Pokemon",language:"English",setName:"Aquapolis",variant:"Reverse Holofoil",quantity:2,marketPrice:70,allocatedItemCost:18,purchaseDate:"2026-10-01"});const before=JSON.stringify(item);
 await render({product:item});const back=document.querySelector('.product-inspect__back img');
 assert.equal(back.getAttribute('src'),'/assets/inspection/pokemon-standard-back.jpg');assert.equal(back.getAttribute('alt'),'Standard Pokémon card back');
 assert.equal(document.querySelector('.product-inspect__back .product-inspect__foil'),null);
 await act(async()=>{click('Back');flush();back.dispatchEvent(new dom.window.Event('load'));});
 const object=document.querySelector('.product-inspect__object');assert.equal(object.style.getPropertyValue('--inspect-yaw'),'-180deg');assert.equal(object.dataset.backReady,'true');assert.ok(Number(object.style.getPropertyValue('--back-gloss-power'))>.025);assert.equal(Number(object.style.getPropertyValue('--foil-power')),0);
 await render({product:{...item,variant:'Normal'}});assert.equal(document.querySelector('.product-inspect__object').style.getPropertyValue('--inspect-yaw'),'-180deg');
 await act(async()=>{click('Front');flush();});assert.equal(document.querySelector('.product-inspect__object').style.getPropertyValue('--inspect-yaw'),'0deg');assert.equal(JSON.stringify(item),before);
}));

const motionCard = Object.freeze({catalogType:"card",game:"Pokemon",language:"English",finish:"Reverse Holofoil",quantity:2,marketPrice:70,allocatedItemCost:18,purchaseDate:"2026-10-01"});
function mediaPreference(dom, reduced = false) {const listeners=new Set();const media={matches:reduced,addEventListener:(_event,fn)=>listeners.add(fn),removeEventListener:(_event,fn)=>listeners.delete(fn)};dom.window.matchMedia=()=>media;return {media,listeners,change(value){media.matches=value;listeners.forEach(fn=>fn());}};}

test("face turns ease between poses, can reverse mid-turn, and stop requesting frames when finished",async()=>environment(async({render,click,flush,dom,frames})=>{
 mediaPreference(dom);await render({product:motionCard});const object=document.querySelector('.product-inspect__object');
 await act(async()=>click('Back'));assert.equal(object.dataset.moving,'true');assert.equal(frames.size,1);
 flush(0);flush(130);const midway=parseFloat(object.style.getPropertyValue('--inspect-yaw'));assert.ok(midway > 0 && midway < 180);
 await act(async()=>click('Front'));flush(130);assert.equal(parseFloat(object.style.getPropertyValue('--inspect-yaw')),midway);
 flush(500);assert.equal(object.style.getPropertyValue('--inspect-yaw'),'0deg');assert.equal(object.dataset.moving,'false');assert.equal(frames.size,0);
 const before=JSON.stringify(motionCard);await act(async()=>click('Back'));flush(600);flush(1000);assert.equal(object.style.getPropertyValue('--inspect-yaw'),'-180deg');assert.equal(JSON.stringify(motionCard),before);
}));
test("grabbing an in-progress flip starts at the visible pose instead of jumping to its destination",async()=>environment(async({render,click,flush,dom,frames})=>{
 mediaPreference(dom);await render({product:motionCard});await act(async()=>click('Back'));flush(0);flush(130);
 const object=document.querySelector('.product-inspect__object'),stage=document.querySelector('.product-inspect__stage');const visible=parseFloat(object.style.getPropertyValue('--inspect-yaw'));
 stage.getBoundingClientRect=()=>({left:0,top:0,width:300,height:340});
 const send=(type,x=0)=>{const e=new dom.window.Event(type,{bubbles:true});for(const[k,v]of Object.entries({pointerId:1,pointerType:'touch',isPrimary:true,clientX:x,clientY:0}))Object.defineProperty(e,k,{value:v});stage.dispatchEvent(e);};
 await act(async()=>{send('pointerdown');send('pointermove',30);flush(146);});assert.ok(Math.abs(parseFloat(object.style.getPropertyValue('--inspect-yaw'))-(visible+21))<.001);assert.equal(object.dataset.moving,'false');assert.equal(frames.size,0);
 await act(async()=>send('pointercancel'));
}));
test("reduced-motion changes finish an active turn immediately and still-image mode stays static",async()=>environment(async({render,click,flush,dom,frames})=>{
 const preference=mediaPreference(dom);await render({product:motionCard});await act(async()=>click('Back'));flush(0);flush(100);
 preference.change(true);flush(110);assert.equal(document.querySelector('.product-inspect__object').style.getPropertyValue('--inspect-yaw'),'-180deg');assert.equal(frames.size,0);
 await act(async()=>click('Front'));flush(120);assert.equal(document.querySelector('.product-inspect__object').style.getPropertyValue('--inspect-yaw'),'0deg');assert.equal(frames.size,0);
 preference.change(false);await act(async()=>click('Still image'));flush(140);await act(async()=>click('Back'));flush(150);assert.equal(document.querySelector('.product-inspect__object').dataset.moving,'false');assert.equal(frames.size,0);
}));
test("closer view preserves the chosen face and finish and never changes saved purchase data",async()=>environment(async({render,click,flush})=>{
 const before=JSON.stringify(motionCard);await render({product:motionCard});await act(async()=>{click('Back');flush();click('Closer view');});
 assert.equal(document.querySelector('.product-inspect__stage').dataset.detail,'true');assert.equal(document.querySelector('.product-inspect__object').style.getPropertyValue('--inspect-yaw'),'-180deg');
 await render({product:{...motionCard,finish:'Holofoil'}});assert.equal(document.querySelector('.product-inspect__stage').dataset.detail,'true');assert.equal(document.querySelector('[data-finish]').dataset.finish,'holo');
 await act(async()=>click('Standard view'));assert.equal(document.querySelector('.product-inspect__stage').dataset.detail,'false');assert.equal(JSON.stringify(motionCard),before);
 await act(async()=>click('Closer view'));await render({product:{...motionCard,id:'another-card'}});assert.equal(document.querySelector('.product-inspect__stage').dataset.detail,'false');
}));
test("hover lighting settles, returns to the studio light on exit, and stops on unmount",async()=>environment(async({render,flush,dom,frames,root})=>{
 mediaPreference(dom);await render({product:motionCard});const object=document.querySelector('.product-inspect__object'),stage=document.querySelector('.product-inspect__stage');const initial=parseFloat(object.style.getPropertyValue('--reflection-x'));
 stage.getBoundingClientRect=()=>({left:0,top:0,width:300,height:340});
 const send=(type)=>{const e=new dom.window.Event(type,{bubbles:true});for(const[k,v]of Object.entries({pointerType:'mouse',buttons:0,clientX:299,clientY:339,relatedTarget:null}))Object.defineProperty(e,k,{value:v});stage.dispatchEvent(e);};
 send('pointermove');let time=0;for(let i=0;i<100&&frames.size;i++)flush(time+=16);assert.equal(frames.size,0);assert.ok(Math.abs(parseFloat(object.style.getPropertyValue('--reflection-x'))-initial)>1);
 send('pointerout');for(let i=0;i<100&&frames.size;i++)flush(time+=16);assert.equal(frames.size,0);assert.ok(Math.abs(parseFloat(object.style.getPropertyValue('--reflection-x'))-initial)<.1);
 send('pointermove');assert.equal(frames.size,1);await act(async()=>root.render(null));assert.equal(frames.size,0);
}));


test("a vertical touch scrolls without rotating or capturing, while a sideways touch starts a controlled turn",async()=>environment(async({render,flush,dom,frames})=>{
 await render();const stage=document.querySelector('.product-inspect__stage');let captures=0;stage.setPointerCapture=()=>captures++;stage.getBoundingClientRect=()=>({left:0,top:0,width:300,height:340});
 const send=(type,x,y)=>{const event=new dom.window.Event(type,{bubbles:true});for(const[k,v]of Object.entries({pointerId:1,pointerType:'touch',isPrimary:true,clientX:x,clientY:y}))Object.defineProperty(event,k,{value:v});stage.dispatchEvent(event);};
 await act(async()=>{send('pointerdown',0,0);send('pointermove',2,6);});assert.equal(captures,0);assert.equal(frames.size,0);
 await act(async()=>{send('pointermove',4,50);send('pointermove',80,60);});assert.equal(captures,0);assert.equal(frames.size,0);assert.equal(document.querySelector('.product-inspect__object').style.getPropertyValue('--inspect-yaw'),'0deg');
 await act(async()=>{send('pointerdown',0,0);send('pointermove',30,2);flush();});assert.equal(captures,1);assert.equal(document.querySelector('.product-inspect__object').style.getPropertyValue('--inspect-yaw'),'21deg');
}));

test("single packaging photographs keep their aspect and cannot turn into invented blank boxes",async()=>environment(async({render,click,flush,dom})=>{
 const original=Object.freeze({catalogType:'sealed',productType:'Elite Trainer Box',frontImageUrl:'/front.jpg',marketPrice:70,quantity:2});const before=JSON.stringify(original);await render({product:original,src:'/front.jpg'});const node=document.querySelector('.product-inspect__object');assert.equal(node.dataset.shape,'photo');assert.equal(node.dataset.hasBack,'false');assert.equal(document.querySelectorAll('[aria-label="Box faces"] button').length,0);
 const photo=node.querySelector('img');Object.defineProperty(photo,'naturalWidth',{value:1000});Object.defineProperty(photo,'naturalHeight',{value:600});await act(async()=>photo.dispatchEvent(new dom.window.Event('load')));assert.equal(node.style.getPropertyValue('--photo-aspect'),'0.6');
 await act(async()=>{for(let i=0;i<8;i++)click('Rotate right');flush();});assert.equal(node.style.getPropertyValue('--inspect-yaw'),'32deg');assert.equal(JSON.stringify(original),before);
}));

test("unverified foil regions retain the real scan without borrowing Pokemon artwork masks",async()=>environment(async({render})=>{
 await render({product:{catalogType:'card',game:'Magic: The Gathering',finish:'Foil',language:'English'}});const node=document.querySelector('.product-inspect__object');assert.equal(node.dataset.foilLayout,'unknown');assert.equal(node.style.getPropertyValue('--foil-mask'),'none');assert.equal(node.querySelector('.product-inspect__back img'),null);
}));

test("higher-resolution front images fall back without replacing photographed box faces",async()=>environment(async({render,dom})=>{
 await render({product:{...product,images:{large:'/large-card.jpg',small:'/small-card.jpg'}},src:'/small-card.jpg'});let front=document.querySelector('.product-inspect__front img');assert.equal(front.getAttribute('src'),'/large-card.jpg');await act(async()=>front.dispatchEvent(new dom.window.Event('error')));front=document.querySelector('.product-inspect__front img');assert.equal(front.getAttribute('src'),'/small-card.jpg');
 await render({product:{catalogType:'sealed',frontImageUrl:'/front-face.jpg',backImageUrl:'/back-face.jpg',images:{large:'/composite.jpg'}},src:'/composite.jpg'});assert.equal(document.querySelector('.product-inspect__front img').getAttribute('src'),'/front-face.jpg');
}));

test("reduced motion suppresses incidental hover lighting but explicit controls still work",async()=>environment(async({render,dom,frames,click,flush})=>{
 mediaPreference(dom,true);await render({product:motionCard});const stage=document.querySelector('.product-inspect__stage');stage.getBoundingClientRect=()=>({left:0,top:0,width:300,height:340});const e=new dom.window.Event('pointermove',{bubbles:true});for(const[k,v]of Object.entries({pointerType:'mouse',buttons:0,clientX:299,clientY:339}))Object.defineProperty(e,k,{value:v});stage.dispatchEvent(e);assert.equal(frames.size,0);await act(async()=>{click('Back');flush();});assert.equal(document.querySelector('.product-inspect__object').style.getPropertyValue('--inspect-yaw'),'-180deg');assert.equal(frames.size,0);
}));

test("recorded version-specific front art follows version selection without changing saved records or prices",async()=>environment(async({root,click})=>{
 const original=Object.freeze({...product,finish:'Normal',versions:[{key:'normal',variant:'Normal',label:'Normal',marketPrice:10,imageUrl:'/normal.jpg'},{key:'reverse holo',variant:'Reverse Holofoil',label:'Reverse',marketPrice:18,imageUrl:'/reverse.jpg'}]});const before=JSON.stringify(original);await act(async()=>root.render(React.createElement(module.exports.Content,{product:original,src:'/saved.jpg',title:'Version test'})));assert.equal(document.querySelector('.product-inspect__front img').getAttribute('src'),'/normal.jpg');await act(async()=>[...document.querySelectorAll('[aria-label="Available versions"] button')][1].click());assert.equal(document.querySelector('.product-inspect__front img').getAttribute('src'),'/reverse.jpg');assert.equal(document.querySelector('[data-finish]').dataset.finish,'reverse');assert.equal(JSON.stringify(original),before);
}));
