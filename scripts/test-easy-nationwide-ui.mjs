import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';

test('city search filters actual report cards, syncs the nearby control, and needs no state selection',async()=>{
 const bundle=await build({entryPoints:['src/components/RestockReportBrowser.jsx'],bundle:true,platform:'node',format:'cjs',write:false,loader:{'.css':'empty'},external:['react','react-dom','react/jsx-runtime'],jsx:'automatic',define:{'import.meta.env':'{}'},logLevel:'silent'});
 const dom=new JSDOM('<main id="root"></main>',{url:'https://fixture.invalid/'}),old=new Map();
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 let root;
 try{
  const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const Browser=module.exports.default,{createRoot}=await import('react-dom/client');root=createRoot(document.getElementById('root'));
  const reports=[{id:'tx',city:'Austin',state:'TX',observedAt:new Date().toISOString()},{id:'mn',city:'Austin',state:'MN',observedAt:new Date().toISOString()}];
  await act(async()=>root.render(React.createElement(Browser,{reports,getStore:r=>r,renderReport:r=>React.createElement('article',{'data-report':r.id,key:r.id},r.id),onReport:()=>{}})));
  const visible=()=>[...document.querySelectorAll('[data-report]')].map(n=>n.dataset.report);
  assert.deepEqual(visible().sort(),['mn','tx']);assert.ok(document.querySelector('select[id$="-state"]').closest('details'));
  const input=document.querySelector('input[role="combobox"]');
  await act(async()=>{input.dispatchEvent(new dom.window.FocusEvent('focusin',{bubbles:true}));Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'Austin TX');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  const option=[...document.querySelectorAll('[role="option"] button')].find(n=>n.textContent==='Austin, TX');assert.ok(option,'matching city appears directly');
  await act(async()=>option.click());assert.deepEqual(visible(),['tx']);assert.match(document.querySelector('.nationwide-location__summary').textContent,/Austin, TX/);
  const nationwide=[...document.querySelectorAll('button')].find(n=>n.textContent==='Nationwide');await act(async()=>nationwide.click());assert.deepEqual(visible().sort(),['mn','tx']);
  await act(async()=>root.render(React.createElement(Browser,{reports:[],getStore:r=>r,renderReport:()=>null,onReport:()=>{}})));assert.ok(document.querySelector('input[role="combobox"]'),'area search remains usable with no reports');
 }finally{if(root)await act(async()=>root.unmount());dom.window.close();for(const [key,value] of old){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});
