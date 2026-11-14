import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';

const bundle=await build({entryPoints:['src/components/ProductPhotoLookup.jsx'],bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic',loader:{'.css':'empty'},external:['react','react/jsx-runtime'],define:{'import.meta.env':'{}'},logLevel:'silent'});
const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const ProductPhotoLookup=module.exports.default;

async function environment(run){
 const dom=new JSDOM('<main id="root"></main>',{url:'https://fixture.invalid/',pretendToBeVisual:true}),previous=new Map(),revoked=[];
 let serial=0;const fakeURL={createObjectURL:()=>`blob:fixture-${++serial}`,revokeObjectURL:value=>revoked.push(value)};
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,URL:fakeURL,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));
 try{await run(root,revoked);}finally{await act(async()=>root.unmount());dom.window.close();for(const[key,descriptor]of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];}
}
function deferredReader(){const calls=[];return{calls,reader:(file,options)=>new Promise(resolve=>calls.push({file,...options,resolve}))};}
async function choose(name='sample.png'){const input=document.querySelector('input[aria-label="Choose a product image"]'),file=new window.File(['fixture bytes'],name,{type:'image/png'});Object.defineProperty(input,'files',{value:[file],configurable:true});await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));return file;}
const query=()=>document.querySelector('.product-photo-lookup__query input');
async function type(value){await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(query(),value);query().dispatchEvent(new window.Event('input',{bubbles:true}));});}
async function click(text){const button=[...document.querySelectorAll('button')].find(node=>node.textContent===text);assert.ok(button,text);await act(async()=>button.click());}
const complete=value=>({status:'complete',text:value,query:value,suggestions:[{type:'text',label:'Visible text',value}],message:'Check the text.'});

test('replacing a photo aborts its reader, revokes its URL, and ignores late results',()=>environment(async(root,revoked)=>{
 const pending=deferredReader(),reviewed=[];await act(async()=>root.render(React.createElement(ProductPhotoLookup,{reader:pending.reader,onQuery:value=>reviewed.push(value)})));
 const first=await choose('first.png');await choose('second.png');assert.equal(pending.calls[0].file,first);assert.equal(pending.calls[0].signal.aborted,true);assert.deepEqual(revoked,['blob:fixture-1']);
 await act(async()=>pending.calls[0].resolve(complete('Stale photo')));assert.equal(query().value,'');assert.match(document.body.textContent,/Preparing photo/);
 await act(async()=>pending.calls[1].resolve(complete('Current photo')));assert.equal(query().value,'Current photo');assert.equal(document.body.textContent.includes('Stale photo'),false);assert.deepEqual(reviewed,[]);
 await click('Review catalog matches');assert.deepEqual(reviewed,['Current photo']);
}));

test('manual corrections entered while reading survive completion, and Enter explicitly reviews only text',()=>environment(async root=>{
 const pending=deferredReader(),reviewed=[];await act(async()=>root.render(React.createElement(ProductPhotoLookup,{reader:pending.reader,onQuery:value=>reviewed.push(value)})));
 await choose();await type('My correction 58/102');await act(async()=>pending.calls[0].resolve(complete('Wrong OCR name')));assert.equal(query().value,'My correction 58/102');assert.deepEqual(reviewed,[]);
 let prevented=false;await act(async()=>{const event=new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});query().dispatchEvent(event);prevented=event.defaultPrevented;});assert.equal(prevented,true);assert.deepEqual(reviewed,['My correction 58/102']);
}));

test('stop and remove keep manual lookup usable without accepting a stale result',()=>environment(async(root,revoked)=>{
 const pending=deferredReader();await act(async()=>root.render(React.createElement(ProductPhotoLookup,{reader:pending.reader,onQuery:()=>{}})));
 await choose();await type('Keep this');await click('Stop reading');assert.equal(pending.calls[0].signal.aborted,true);assert.equal(document.activeElement,query());assert.equal(query().value,'Keep this');await act(async()=>pending.calls[0].resolve(complete('late')));assert.equal(query().value,'Keep this');
 await click('Remove photo');assert.deepEqual(revoked,['blob:fixture-1']);assert.equal(document.querySelector('.product-photo-lookup__source'),null);assert.equal(query().value,'Keep this');
}));

test('unmount cancels the actual in-flight reader signal and releases its preview',()=>environment(async(root,revoked)=>{
 const pending=deferredReader();await act(async()=>root.render(React.createElement(ProductPhotoLookup,{reader:pending.reader,onQuery:()=>{}})));await choose();await act(async()=>root.render(null));assert.equal(pending.calls[0].signal.aborted,true);assert.deepEqual(revoked,['blob:fixture-1']);await act(async()=>pending.calls[0].resolve(complete('late')));assert.equal(document.body.textContent,'');
}));

test('failed search preserves reviewed text and enables retry; suggestion selection never searches',()=>environment(async root=>{
 let calls=0;await act(async()=>root.render(React.createElement(ProductPhotoLookup,{reader:async()=>complete('Pikachu 58/102'),onQuery:async()=>{calls++;throw Error('offline');}})));await choose();await click('Visible textPikachu 58/102');assert.equal(calls,0);await click('Review catalog matches');assert.equal(calls,1);assert.equal(query().value,'Pikachu 58/102');assert.match(document.querySelector('[role="alert"]').textContent,/still here/);assert.equal([...document.querySelectorAll('button')].find(node=>node.textContent==='Review catalog matches').disabled,false);
}));

test('photo, query, suggestion, stop, remove and OCR draft changes invalidate the previous parent review',()=>environment(async root=>{
 const pending=deferredReader();let review='Previous confirmed product',changes=0;
 await act(async()=>root.render(React.createElement(ProductPhotoLookup,{reader:pending.reader,onDraftChange:()=>{review=null;changes++;},onQuery:value=>{review=value;}})));
 assert.equal(changes,0,'initial render does not clear a parent review');
 await choose();assert.equal(review,null);assert.equal(changes,1);
 review='Previous confirmed product';await act(async()=>pending.calls[0].resolve(complete('Pikachu 58/102')));assert.equal(review,null);assert.equal(changes,2,'accepted OCR autofill invalidates too');
 await click('Review catalog matches');assert.equal(review,'Pikachu 58/102');
 await type('Pikachu 59/102');assert.equal(review,null);assert.equal(changes,3);
 await click('Review catalog matches');assert.equal(review,'Pikachu 59/102');
 await click('Visible textPikachu 58/102');assert.equal(review,null);assert.equal(changes,4);
 await click('Review catalog matches');assert.equal(review,'Pikachu 58/102');
 await click('Remove photo');assert.equal(review,null);assert.equal(changes,5);
 await click('Review catalog matches');assert.equal(review,'Pikachu 58/102');
 await choose('next.png');assert.equal(review,null);assert.equal(changes,6);
 review='Externally selected result';await click('Stop reading');assert.equal(review,null);assert.equal(changes,7);
 await act(async()=>pending.calls[1].resolve(complete('stale')));assert.equal(changes,7,'cancelled OCR completion must not notify');
 await act(async()=>root.render(null));assert.equal(changes,7,'unmount must not notify');
}));

test('cancelling the file picker is not a draft change, but an unsupported replacement invalidates review',()=>environment(async root=>{
 let changes=0;await act(async()=>root.render(React.createElement(ProductPhotoLookup,{onDraftChange:()=>changes++,onQuery:()=>{}})));
 const input=document.querySelector('input[aria-label="Choose a product image"]');Object.defineProperty(input,'files',{value:[],configurable:true});await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));assert.equal(changes,0);
 Object.defineProperty(input,'files',{value:[new window.File(['x'],'not-supported.heic',{type:'image/heic'})],configurable:true});await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));assert.equal(changes,1);assert.match(document.querySelector('[role="alert"]').textContent,/Choose a JPG/);
}));
