import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

test('61–64: source comparison, searchable stores, individual product edits and exact draft preview preserve private data',async()=>{
  const bundle=await build({entryPoints:['src/components/StockScreenshotImport.jsx'],bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic',loader:{'.css':'empty'},external:['react','react/jsx-runtime'],define:{'import.meta.env':'{}'},logLevel:'silent'});
  const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid/',pretendToBeVisual:true}),previous=new Map();
  for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  let root;
  try{
    const {createRoot}=await import('react-dom/client');root=createRoot(document.getElementById('root'));
    const stores=Object.freeze([{id:'keep',name:'Target Original',city:'Norfolk',state:'VA',address:'1 Main St'},{id:'next',name:'Target Hill',city:'Austin',state:'TX',address:'52 High Street'},{id:'other',name:'Walmart',city:'Miami',state:'FL',address:'2 Beach St'}].map(Object.freeze));
    const reportDraft=Object.freeze({storeId:'keep',productName:'Existing product',productCategory:'Pokemon TCG',reportType:'low_stock',reportTypeTouched:true,notes:'Private owner note',photos:Object.freeze(['owner-receipt']),marketPrice:81.05});
    const before=JSON.stringify({stores,reportDraft});let patch;
    await act(async()=>root.render(React.createElement(module.exports.default,{stores,reportDraft,onApply:value=>patch=value})));
    const button=label=>[...document.querySelectorAll('button')].find(node=>(node.getAttribute('aria-label')||node.textContent.trim())===label);
    const click=async label=>{assert.ok(button(label),label);await act(async()=>button(label).click());};
    const change=async(node,value)=>{assert.ok(node);await act(async()=>{const prototype=node.tagName==='SELECT'?window.HTMLSelectElement.prototype:node.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);node.dispatchEvent(new window.Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));});};
    await click('Use a screenshot');await change(document.querySelector('.stock-screenshot-source-text textarea'),'Target Hill\nPokemon Prismatic Evolutions ETBs in stock\nPokemon 151 booster bundles in stock');await click('Find report details');
    assert.ok(document.querySelector('.stock-screenshot-compare-source pre'));await click('View source while reviewing');assert.equal(button('Hide source').getAttribute('aria-expanded'),'true');
    await change(document.querySelector('input[type="search"]'),'Austin High');const select=document.querySelector('.stock-screenshot-review-fields select');assert.ok(select.querySelector('option[value="keep"]'),'current draft remains selectable');assert.ok(select.querySelector('option[value="next"]'));assert.equal(select.querySelector('option[value="other"]'),null);
    await change(select,'next');
    const productInputs=()=>[...document.querySelectorAll('.stock-screenshot-product-rows input')];assert.ok(productInputs().length>=2);
    while(productInputs().length>1)await click('Remove product 2');
    await change(productInputs()[0],'Reviewed Elite Trainer Box');await click('Add product');await change(productInputs()[1],'Reviewed Booster Bundle');
    await change(document.querySelector('input[type="datetime-local"]'),'2026-10-19T11:30');
    const comparison=document.querySelector('.stock-screenshot-change-table');assert.ok(comparison);assert.match(comparison.textContent,/Current/);assert.match(comparison.textContent,/Existing product.*Existing product/s);assert.equal(patch,undefined);
    await act(async()=>document.querySelector('.stock-screenshot-replace input').click());assert.match(document.querySelector('.stock-screenshot-change-table').textContent,/Target Hill.*Will change/s);assert.match(document.querySelector('.stock-screenshot-change-table').textContent,/Reviewed Elite Trainer Box/);assert.equal(patch,undefined);
    await click('Use reviewed details');assert.equal(patch.storeId,'next');assert.equal(patch.productName,'Reviewed Elite Trainer Box; Reviewed Booster Bundle');assert.equal(patch.visibility,'private_from_map');assert.equal(patch.verified,false);assert.equal(patch.needsReview,true);
    for(const key of ['notes','photos','marketPrice','rawText','screenshot'])assert.equal(Object.hasOwn(patch,key),false,key);
    assert.equal(JSON.stringify({stores,reportDraft}),before);
  }finally{if(root)await act(async()=>root.unmount());dom.window.close();for(const[key,descriptor]of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
});
