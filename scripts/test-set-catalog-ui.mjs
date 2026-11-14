import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createSetCatalogItemSeed } from "../src/utils/setCatalog.mjs";
import { createEmptyFlipScoutState } from "../src/features/flipScout/constants.js";

async function compile(options) {
  const result = await build({ ...options, bundle: true, platform: "node", format: "cjs", write: false, jsx: "automatic", loader: { ".css": "empty" }, external: ["react", "react/jsx-runtime", "virtual:code3-set-catalog"], define: { "import.meta.env": "{}" }, logLevel: "silent" });
  const module = { exports: {} }; new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports); return module.exports;
}
const { default: Catalog } = await compile({ entryPoints: ["src/components/CollectionSetCatalog.jsx"] });
async function environment(run) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/", pretendToBeVisual: true }); const previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true })) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis,key)); Object.defineProperty(globalThis,key,{ value,writable:true,configurable:true }); }
  const { createRoot } = await import("react-dom/client"); const root = createRoot(document.getElementById("root"));
  try { await run(root); } finally { await act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key]; }
}
const card = Object.freeze({ id: "qa-card", tcgplayerProductId: "101", tcgGame: "pokemon", name: "Test Card", setName: "Aquapolis", language: "English", cardNumber: "1", catalogType: "card", imageUrl: "/card.jpg", marketPrice: 12.5 });
const sealed = Object.freeze({ ...card, id: "qa-box", tcgplayerProductId: "202", name: "Test Box", cardNumber: "", catalogType: "sealed" });
const record = Object.freeze({ id: "copy", _recordOrigin: "repository", name: card.name, tcgplayerProductId: "101", tcgGame: "pokemon", productClassification: "Raw card", quantity: 2, marketPrice: 8, allocatedItemCost: 3 });
const row = Object.freeze({ id: "set:aquapolis", key: "pokemon:aquapolis", name: "Aquapolis", gameId: "pokemon", ownedItems: [record], catalogRecords: [] });
const loader = async () => ({ available: true, products: [card, sealed] });
const render = (root, props) => act(async () => root.render(React.createElement(Catalog,{ row, loadCatalog: loader, ...props })));
const click = label => [...document.querySelectorAll("button")].find(button => (button.getAttribute("aria-label") || button.textContent.trim()) === label)?.click();

test("real catalog starts with all products, owned badges, combined filters and name/number search", async () => environment(async root => {
  await render(root); assert.equal(document.querySelectorAll(".set-catalog-product").length, 2); assert.equal(document.querySelector('[data-owned="true"]').textContent.includes("Owned · Qty 2"), true);
  await act(async () => click("Cards")); assert.equal(document.querySelectorAll(".set-catalog-product").length, 1);
  await act(async () => click("Owned only")); assert.match(document.querySelector('.set-catalog-result-count').textContent,/1 item you own/);
  await act(async () => click("Sealed")); assert.equal(document.querySelectorAll(".set-catalog-product").length,0); assert.match(document.body.textContent,/No owned items match/);
  await act(async () => click("Show all items")); assert.equal(document.querySelectorAll(".set-catalog-product").length,2);
  await act(async () => click("Sealed")); assert.equal(document.querySelector('.set-catalog-result-count').textContent,'1 item shown'); await act(async () => click("All"));
  const input=document.querySelector('input[type="search"]'); await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(input,"Test Box");input.dispatchEvent(new window.Event("input",{bubbles:true}));});
  assert.equal(document.querySelectorAll(".set-catalog-product").length,1); assert.match(document.querySelector('.set-catalog-product').textContent,/Test Box/);
}));

test("product modal retains original copies; Add passes only the selected catalog item and never writes", async () => environment(async root => {
  let added, opened; const before=JSON.stringify({row,card,sealed});
  await render(root,{onAddCatalogItem:(set,product)=>{added={set,product};},onOpenItem:item=>{opened=item;}});
  await act(async()=>document.querySelector('.set-catalog-product').click()); assert.ok(document.querySelector('[role="dialog"]')); assert.match(document.querySelector('[role="dialog"]').textContent,/Owned · Qty 2/);
  await act(async()=>document.querySelector(".set-catalog-copy-link").click()); assert.equal(opened,record); assert.equal(document.querySelector('[role="dialog"]'),null);
  await act(async()=>document.querySelectorAll('.set-catalog-product')[1].click()); await act(async()=>click("Add to collection"));
  assert.equal(added.set,row); assert.equal(added.product,sealed); assert.equal(document.querySelector('[role="dialog"]'),null); assert.equal(JSON.stringify({row,card,sealed}),before);
}));

test("long catalogs render 24 entries, expand without duplicates and reset the limit for filters", async () => environment(async root => {
  const products=Array.from({length:51},(_,i)=>({...card,id:`card${i}`,tcgplayerProductId:String(1000+i),cardNumber:String(i+1)}));
  await render(root,{loadCatalog:async()=>({available:true,products}),row:{...row,ownedItems:[]}});
  assert.equal(document.querySelectorAll('.set-catalog-product').length,24);
  await act(async()=>click("Show more (27 remaining)")); assert.equal(document.querySelectorAll('.set-catalog-product').length,48);
  await act(async()=>click("Cards")); assert.equal(document.querySelectorAll('.set-catalog-product').length,24);
}));

test("failed/offline catalog keeps saved items visible and supports a successful retry", async () => environment(async root => {
  let count=0; await render(root,{loadCatalog:async()=>{if(count++===0)throw Error("Offline");return loader();}});
  assert.match(document.querySelector('[role="alert"]').textContent,/Offline/); assert.equal(document.querySelectorAll('[data-owned="true"]').length,1);
  await act(async()=>click("Retry catalog")); assert.equal(document.querySelector('[role="alert"]'),null); assert.equal(document.querySelectorAll('.set-catalog-product').length,2);
}));

test("changing sets cancels the old request and cannot leak the previous set response", async () => environment(async root => {
  let release, signal; const delayed=(_key,options)=>{signal=options.signal;return new Promise(resolve=>{release=resolve;});};
  await act(async()=>root.render(React.createElement(Catalog,{key:'first',row,loadCatalog:delayed})));
  await act(async()=>root.render(React.createElement(Catalog,{key:'second',row:{...row,id:'other',key:'magic:other',name:'Other',ownedItems:[]},loadCatalog:async()=>({available:false,products:[]})})));
  assert.equal(signal.aborted,true); await act(async()=>release({available:true,products:[card]})); assert.equal(document.querySelectorAll('.set-catalog-product').length,0); assert.match(document.body.textContent,/not connected/);
}));

test("actual existing record wizard isolates catalog drafts and saves a new linked item only after review", async () => environment(async root => {
  const source=readFileSync('src/pages/EverydayWorkspaces.jsx','utf8')+'\nexport { RecordForm };';
  const {RecordForm}=await compile({stdin:{contents:source,loader:'jsx',resolveDir:fileURLToPath(new URL('../src/pages/',import.meta.url))}});
  const legacyDraft='private-business-hub.form-draft.collection.new';sessionStorage.setItem(legacyDraft,JSON.stringify({name:'Unrelated draft',quantity:9}));
  const seed=createSetCatalogItemSeed({name:'Aquapolis',gameId:'pokemon'},{...card,variant:'Reverse Holofoil',finish:'Reverse Holofoil'});let saved,closed=0;
  const props={type:'collection',seed,draftScope:'set-catalog.qa-account.pokemon:aquapolis.tcgplayer:101',state:createEmptyFlipScoutState(),onSave:async(collection,record)=>{saved={collection,record};return {...record,id:'new-owned-id'};},onCancel:()=>closed++};
  await act(async()=>root.render(React.createElement(RecordForm,props)));
  const name=[...document.querySelectorAll('label')].find(label=>label.textContent.startsWith('Item name'))?.querySelector('input'); assert.equal(name?.value,'Test Card');assert.equal(saved,undefined);
  await act(async()=>click('Continue'));assert.equal(saved,undefined);await act(async()=>click('Continue'));assert.equal(saved,undefined);await act(async()=>click('Save item'));
  assert.equal(saved.collection,'inventory');assert.equal(saved.record.id,undefined);assert.equal(saved.record.catalogProductId,'qa-card');assert.equal(saved.record.tcgplayerProductId,'101');assert.equal(saved.record.quantity,1);assert.equal(saved.record.marketPrice,12.5);assert.equal(saved.record.allocatedItemCost,'');assert.equal(closed,1);
  assert.equal(saved.record.variant,'Reverse Holofoil');assert.equal(saved.record.finish,'Reverse Holofoil');
  assert.equal(JSON.parse(sessionStorage.getItem(legacyDraft)).name,'Unrelated draft');assert.equal(sessionStorage.getItem('private-business-hub.form-draft.collection.'+props.draftScope),null);
}));

test("real version choices keep prices and quantities separate and carry the exact printing into Add",async()=>environment(async root=>{
  const normal={key:'normal',variant:'Normal',label:'Normal',marketPrice:10,source:'TCGCSV',checkedAt:'2026-11-09'};
  const reverse={...normal,key:'reverse holo',variant:'Reverse Holofoil',label:'Reverse Holo',marketPrice:18};
  const exactCard={...card,versions:[normal,reverse]};const copies=[{...record,variant:'Normal',quantity:2},{...record,id:'reverse-copy',variant:'Reverse Holo',quantity:1},{...record,id:'unknown-copy',quantity:3}];
  const before=JSON.stringify({exactCard,copies});let selected;
  await render(root,{row:{...row,ownedItems:copies},loadCatalog:async()=>({available:true,products:[exactCard]}),onAddCatalogItem:(_set,product)=>selected=product});
  await act(async()=>document.querySelector('.set-catalog-product').click());assert.match(document.body.textContent,/You own 2 · Normal/);assert.match(document.body.textContent,/3 saved copies have no version recorded/);
  await act(async()=>[...document.querySelectorAll('[aria-label="Available versions"] button')].find(button=>button.textContent.startsWith('Reverse Holo')).click());
  assert.match(document.body.textContent,/You own 1 · Reverse Holo/);assert.equal(document.querySelector('[data-finish]').dataset.finish,'reverse');
  await act(async()=>click('Add another copy'));assert.equal(selected.variant,'Reverse Holofoil');assert.equal(selected.marketPrice,18);assert.equal(JSON.stringify({exactCard,copies}),before);
}));
