import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';

test('screenshot review keeps private source collapsed, requires time, and preserves an existing draft', async()=>{
  const bundle=await build({entryPoints:['src/components/StockScreenshotImport.jsx'],bundle:true,platform:'node',format:'cjs',write:false,loader:{'.css':'empty'},external:['react','react-dom','react/jsx-runtime'],jsx:'automatic',define:{'import.meta.env':'{}'},logLevel:'silent'});
  const dom=new JSDOM('<main id="root"></main>',{url:'https://fixture.invalid/'}),previous=new Map();
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true})){
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  let root;const patches=[];
  try{
    const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
    const Screenshot=module.exports.default,{createRoot}=await import('react-dom/client');root=createRoot(document.getElementById('root'));
    const stores=[{id:'target-red',name:'Target Red Mill',city:'Virginia Beach',state:'VA'}];
    const reportDraft=Object.freeze({storeId:'target-red',productName:'Existing product',productCategory:'Pokemon TCG',reportType:'low_stock',reportTypeTouched:true,notes:'Private existing note',photos:Object.freeze(['private-photo']),marketPrice:81.05});
    const original=JSON.stringify(reportDraft);
    await act(async()=>root.render(React.createElement(Screenshot,{stores,reportDraft,onApply:patch=>patches.push(patch)})));
    const button=label=>[...document.querySelectorAll('button')].find(node=>node.textContent===label);
    const click=async label=>{const node=button(label);assert.ok(node,label);await act(async()=>node.click());};
    const setValue=async(node,value)=>{await act(async()=>{Object.getOwnPropertyDescriptor(node instanceof dom.window.HTMLTextAreaElement?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});};
    await click('Use a screenshot');
    assert.equal(document.querySelector('.stock-screenshot-source').open,true);
    const text=document.querySelector('.stock-screenshot-source-text textarea');
    await setValue(text,'Target Red Mill\nPrismatic Evolutions ETBs in stock');
    await click('Find report details');
    assert.equal(document.querySelector('.stock-screenshot-source').open,false);
    assert.equal(document.activeElement.textContent,'Review screenshot details');
    assert.equal(patches.length,0);
    const timeField=document.querySelector('input[type="datetime-local"]');
    assert.equal(timeField.getAttribute('aria-required'),'true');
    assert.ok(document.getElementById(timeField.getAttribute('aria-describedby')),'time helper is connected');
    const storeSelect=document.querySelector('.stock-screenshot-review-fields select');
    assert.match(document.getElementById(storeSelect.getAttribute('aria-describedby')).textContent,/Current draft: Target Red Mill · Virginia Beach · VA/);
    assert.equal(storeSelect.options[0].textContent,'Keep current store');
    await click('Use reviewed details');
    assert.match(document.querySelector('[role="alert"]').textContent,/Confirm when the stock was actually observed/);
    assert.equal(patches.length,0);
    assert.equal(timeField.getAttribute('aria-invalid'),'true');
    assert.match(document.querySelector('.stock-screenshot-field-error').textContent,/Enter when the stock was actually seen/);
    await setValue(document.querySelector('input[type="datetime-local"]'),'2026-10-19T11:30');
    assert.equal(timeField.hasAttribute('aria-invalid'),false,'required error clears when a time is entered');
    document.querySelector('.stock-screenshot-source').open=true;
    await setValue(document.querySelector('.stock-screenshot-source-text textarea'),'Target Red Mill\nPrismatic Evolutions ETBs sold out');
    assert.equal(button('Use reviewed details').disabled,true,'changing source requires another review');
    await click('Find report details');
    await click('Use reviewed details');
    assert.equal(patches.length,1);
    assert.equal(patches[0].visibility,'private_from_map');
    assert.equal(patches[0].needsReview,true);
    assert.equal(patches[0].verified,false);
    assert.equal(patches[0].screenshotObservedTimeConfirmed,true);
    for(const field of ['notes','photos','marketPrice','productName','reportType','rawText','screenshot'])assert.equal(Object.hasOwn(patches[0],field),false,field+' stays private or unchanged');
    assert.equal(JSON.stringify(reportDraft),original);
    assert.equal(document.querySelector('.stock-screenshot-source'),null);
    assert.equal(document.activeElement.textContent,'Edit details');
    await click('Edit details');
    assert.equal(document.querySelector('.stock-screenshot-source').open,false);
    assert.equal(document.querySelector('input[type="datetime-local"]').value,'2026-10-19T11:30');
  }finally{
    if(root)await act(async()=>root.unmount());dom.window.close();
    for(const [key,value] of previous)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];
  }
});
