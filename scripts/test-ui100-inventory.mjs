import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';
import { availableQuantity, remainingStockCost } from '../src/utils/businessInventoryTotals.mjs';
import { soldQuantityForInventory } from '../src/features/flipScout/inventory.js';
import { filterInventoryRows, inventoryGroups, inventoryStockLabel, saleInventoryChoices, filterSalesHistory, sortInventoryGroups } from '../src/utils/inventoryBrowse.mjs';
import { recordNotePresentation } from '../src/utils/recordNotes.mjs';
import { buildCatalogMatchDraft } from '../src/utils/collectionBrowse.mjs';
import { applyReviewedCatalogMatch } from '../src/utils/catalogMatchSave.mjs';
import { createFlipScoutRepository } from '../src/features/flipScout/storageRepository.js';

const base = { name:'Collector Box', catalogProductId:'box', tcgGame:'pokemon', productClassification:'Sealed', condition:'Sealed', projectedResaleMid:30.15, marketPrice:41.22, _recordOrigin:'repository' };
const rows = Object.freeze([
  Object.freeze({...base,id:'a',quantity:3,allocatedItemCost:30,status:'Sold',purchaseDate:'2026-01-01',storageLocation:'Shelf A'}),
  Object.freeze({...base,id:'b',quantity:2,allocatedItemCost:40,status:'Listed',purchaseDate:'2026-02-01',storageLocation:'Shelf B',barcode:'820650999333'}),
  Object.freeze({...base,id:'sold',catalogProductId:'sold',name:'Sold product',quantity:1,allocatedItemCost:8,status:'Listed'}),
  Object.freeze({...base,id:'zero',catalogProductId:'zero',name:'Gift item',quantity:1,allocatedItemCost:0}),
  Object.freeze({...base,id:'missing1',catalogProductId:'missing1',name:'First cost review',quantity:1,allocatedItemCost:null}),
  Object.freeze({...base,id:'missing2',catalogProductId:'missing2',name:'Second cost review',quantity:1,allocatedItemCost:null}),
]);
const sales = Object.freeze([Object.freeze({id:'sale-a',inventoryItemId:'a',quantitySold:1,status:'Completed',saleDate:'2026-01-04',grossSalePrice:55}),Object.freeze({id:'sale-sold',inventoryItemId:'sold',quantitySold:1,status:'Completed',saleDate:'2026-02-01',grossSalePrice:20}),Object.freeze({id:'draft',inventoryItemId:'b',quantitySold:2,status:'Draft',saleDate:'2026-02-03'})]);
const available = row => availableQuantity(row,soldQuantityForInventory(row.id,sales));
const cost = row => remainingStockCost(row,soldQuantityForInventory(row.id,sales));

test('1–4,28–32: grouped stock preserves every acquisition and current price; sold labels use authoritative remaining quantity',()=>{
  const before=JSON.stringify({rows,sales});
  const visible=filterInventoryRows(rows,{available,cost});
  assert.equal(visible.includes(rows[2]),false,'Available is the default');
  const groups=inventoryGroups(visible,{available,cost}), box=groups.find(group=>group.item.id==='a');
  assert.equal(box.quantity,4);assert.equal(box.cost,60);assert.deepEqual(box.records,[rows[0],rows[1]]);assert.equal(box.records[1],rows[1]);
  assert.equal(inventoryStockLabel([rows[0]],available),'Available');assert.equal(inventoryStockLabel([rows[2]],available),'Sold out');
  assert.deepEqual(filterInventoryRows(rows,{stock:'all',missingCost:true,available,cost}).map(row=>row.id),['missing1','missing2']);
  assert.deepEqual(filterInventoryRows(rows,{storage:'Shelf B',available,cost}),[rows[1]]);
  assert.deepEqual(filterInventoryRows(rows,{game:'magic',available,cost}),[]);
  assert.equal(sortInventoryGroups(groups,'quantity')[0],box);assert.equal(sortInventoryGroups(groups,'cost')[0],box);
  assert.equal(JSON.stringify({rows,sales}),before);
});

test('9,51,54: sale choices mark unavailable rows but preserve editable history; history filters are read only',()=>{
  const before=JSON.stringify({rows,sales});
  const choices=saleInventoryChoices(rows,{available});assert.equal(choices.find(row=>row.value==='sold').disabled,true);
  assert.equal(saleInventoryChoices(rows,{available,editingItemId:'sold'}).find(row=>row.value==='sold').disabled,false);
  assert.deepEqual(saleInventoryChoices(rows,{available,query:'820650999333'}).map(row=>row.value),['b']);
  assert.deepEqual(filterSalesHistory(sales,{status:'draft'},rows),[sales[2]]);
  assert.deepEqual(filterSalesHistory(sales,{from:'2026-02-01',to:'2026-02-01'},rows),[sales[1]]);
  assert.deepEqual(filterSalesHistory(sales,{query:'Collector Box',status:'completed'},rows),[sales[0]]);
  assert.equal(JSON.stringify({rows,sales}),before);
});

test('99: importer provenance is presented separately without dropping personal notes or changing the record',()=>{
  const record=Object.freeze({importSourceType:'spreadsheet_csv',notes:'Keep for birthday | Imported from spreadsheet_csv. Original: Box,2,9.99'});
  assert.deepEqual(recordNotePresentation(record),{notes:'Keep for birthday',source:'spreadsheet_csv',original:'Box,2,9.99'});
  assert.deepEqual(recordNotePresentation({notes:'Imported from a friend personally'}),{notes:'Imported from a friend personally',source:'',original:''});
  assert.equal(record.notes,'Keep for birthday | Imported from spreadsheet_csv. Original: Box,2,9.99');
});

async function compile(options){const result=await build({...options,bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic',loader:{'.css':'empty'},external:['react','react/jsx-runtime','virtual:code3-set-catalog'],define:{'import.meta.env':'{}'},logLevel:'silent'});const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);return module.exports;}
const {default:InventoryBrowser}=await compile({entryPoints:['src/components/InventoryBrowser.jsx']});
const {GuidedFormPage,RecordDetailPage,DetailSection}=await compile({entryPoints:['src/components/operations/RecordExperience.jsx']});
const {RecordForm,useBusinessRepository}=await compile({stdin:{contents:readFileSync('src/pages/EverydayWorkspaces.jsx','utf8')+'\nexport { RecordForm, useBusinessRepository };',loader:'jsx',resolveDir:fileURLToPath(new URL('../src/pages/',import.meta.url))}});
async function environment(run){const dom=new JSDOM('<main id="root"></main>',{url:'https://fixture.invalid/',pretendToBeVisual:true}),previous=new Map();for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,sessionStorage:dom.window.sessionStorage,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));try{await run(root);}finally{await act(async()=>root.unmount());dom.window.close();for(const[key,descriptor]of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
const buttons=()=>[...document.querySelectorAll('button')];
const button=label=>buttons().find(node=>(node.getAttribute('aria-label')||node.textContent.trim())===label);
const click=async label=>{const target=button(label);assert.ok(target,label);await act(async()=>target.click());};
const field=label=>[...document.querySelectorAll('label')].find(node=>node.textContent.startsWith(label))?.querySelector('input,select,textarea');
async function setValue(node,value){assert.ok(node);await act(async()=>{const prototype=node.tagName==='SELECT'?window.HTMLSelectElement.prototype:node.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);node.dispatchEvent(new window.Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));});}

test('1,2,4,30: real Inventory UI starts available, expands original lots, offers each missing-cost item and alternate table',()=>environment(async root=>{
  let opened;const before=JSON.stringify({rows,sales});
  await act(async()=>root.render(React.createElement(InventoryBrowser,{records:rows,available,cost,onOpen:row=>opened=row,onAdd:()=>{},resolveItemImage:()=>''})));
  assert.equal(document.querySelector('[aria-label="Inventory stock filters"] button[aria-pressed="true"]').textContent,'Available 4');
  assert.equal(document.querySelectorAll('.inventory-product').length,4);
  await click('Open Collector Box, 4 available, 2 purchase records');
  const lots=document.querySelectorAll('.inventory-lots > button');assert.equal(lots.length,2);
  await act(async()=>lots[1].click());assert.equal(opened,rows[1]);
  await click('Review missing costs');assert.equal(document.querySelectorAll('.inventory-product').length,2);
  assert.match(document.body.textContent,/Second cost review/);
  await click('Table');assert.equal(document.querySelectorAll('tbody tr').length,2);
  assert.equal(JSON.stringify({rows,sales}),before);assert.equal(localStorage.length,0);
}));

test('9–12,51–53: actual sale wizard prevents overselling early and saves only original inventory linkage after complete review',()=>environment(async root=>{
  const state={inventory:rows,sales,purchases:[],lots:[]};let saved;
  await act(async()=>root.render(React.createElement(RecordForm,{type:'sale',seed:{inventoryItemId:'a'},state,onSave:async(collection,record)=>{saved={collection,record};return record;},onCancel:()=>{}})));
  assert.equal(field('Inventory item').querySelector('option[value="sold"]').disabled,true);
  assert.match(field('Inventory item').options[field('Inventory item').selectedIndex].textContent,/2026-01-01 · Shelf A/);
  await setValue(field('Quantity sold'),'3');assert.match(document.querySelector('.ops-field-error').textContent,/Only 2/);assert.equal(button('Continue').disabled,true);assert.equal(saved,undefined);
  await setValue(field('Quantity sold'),'2');await setValue(field('Sale price — transaction total'),'100');await setValue(field('Sales channel'),'Local event');
  assert.match(document.body.textContent,/\$50\.00 per item × 2/);
  await click('Continue');assert.ok(document.querySelector('.sale-additional-costs'));assert.equal(document.querySelector('.sale-additional-costs').open,false);
  await setValue(field('Selling fees'),'5');await click('Continue');
  const review=document.querySelector('.sale-review-summary').textContent;for(const text of ['Collector Box','Quantity sold2','Local event','$100.00','$5.00'])assert.ok(review.includes(text),text);
  assert.equal(saved,undefined);await click('Save sale');assert.equal(saved.collection,'sales');assert.equal(saved.record.inventoryItemId,'a');assert.equal(saved.record.quantitySold,'2');assert.equal(saved.record.grossSalePrice,'100');assert.equal(saved.record.allocatedCostOfGoodsSold,20);
}));

test('44,45,47: future steps disabled, completed steps remain usable, Edit direct and sections independently open',()=>environment(async root=>{
  function Harness(){const [step,setStep]=useState(0);return React.createElement(GuidedFormPage,{title:'Test',steps:['First','Second','Review'],activeStep:step,onStepChange:setStep,onCancel:()=>{}},'Fields');}
  await act(async()=>root.render(React.createElement(Harness)));assert.equal(button('2Second').disabled,true);await click('Continue');await click('Continue');await click('1First');assert.equal(button('3Review').disabled,false);await click('3Review');
  await act(async()=>root.render(React.createElement(RecordDetailPage,{title:'Item',secondaryActions:React.createElement(React.Fragment,null,React.createElement('button',null,'Edit'),React.createElement('button',null,'Delete')),sections:[{title:'Acquisition',children:'Cost'},{title:'Storage',children:'Shelf'}],onBack:()=>{}})));
  assert.equal(button('Edit').closest('details'),null);const details=document.querySelectorAll('.ops-detail-section');assert.equal(details[0].hasAttribute('name'),false);details[0].open=true;details[1].open=true;assert.equal(details[0].open,true);assert.equal(details[1].open,true);assert.equal(typeof DetailSection,'function');
}));

test('37: reviewed catalog match preserves a price refresh while the actual form is open and changes only reviewed fields',()=>environment(async root=>{
  const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_name,_options,action)=>action()}}});
  try {
    const repository=createFlipScoutRepository(localStorage);
    const original={...rows[0],id:'catalog-match-original',notes:'Original private note',priceSource:'Older quote source',priceCheckedAt:'2026-11-01T12:00:00Z'};
    repository.upsert('inventory',original);
    const matched=buildCatalogMatchDraft(original,{id:'catalog-product-correct',name:'Correct catalog box',setName:'Correct set',marketPrice:0.01});
    const baseline={...matched,purchaseId:'',lotId:'',pokemonName:'',purchaseSource:'',intendedSalesChannel:'',projectedResaleLow:'',projectedResaleHigh:''};
    let saved;
    function Harness(){const data=useBusinessRepository();return React.createElement(RecordForm,{type:'collection',seed:baseline,draftScope:'catalog-match-refresh-test',initialStep:2,state:data.state,onSave:async(collection,record,message)=>{saved=await data.saveRecord(collection,record,message,{catalogMatchBaseline:baseline});return saved;},onCancel:()=>{}});}
    await act(async()=>root.render(React.createElement(Harness)));
    const fresh={...repository.load().inventory[0],marketPrice:99.42,priceSource:'Latest provider quote',priceCheckedAt:'2026-11-13T22:00:00Z',priceMetadata:{provider:'current',currency:'USD'},allocatedItemCost:44,notes:'Newer private note'};
    repository.upsert('inventory',fresh);
    await setValue(field('Projected resale midpoint'),'64');
    await click('Save changes');
    assert.ok(saved);assert.equal(saved.id,original.id);assert.equal(saved.catalogProductId,'catalog-product-correct');assert.equal(saved.name,'Correct catalog box');
    for(const key of ['marketPrice','priceSource','priceCheckedAt','priceMetadata','allocatedItemCost','notes'])assert.deepEqual(saved[key],fresh[key],key);
    assert.equal(saved.projectedResaleMid,'64','deliberate editable estimate remains editable');
    const persisted=repository.load().inventory;assert.equal(persisted.length,1);assert.equal(persisted[0].marketPrice,99.42);assert.equal(persisted[0].catalogProductId,'catalog-product-correct');
    assert.throws(()=>applyReviewedCatalogMatch(null,baseline,baseline),/no longer available/,'a removed original cannot be recreated');
    assert.throws(()=>applyReviewedCatalogMatch({...fresh,provenanceManaged:true},baseline,baseline),/correction workflow/);
  } finally {if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator;}
}));
