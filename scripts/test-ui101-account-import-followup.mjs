import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';

const built = await build({stdin:{contents:`export {default as Inbox} from './src/components/NotificationInbox.jsx';export {default as ImportReview} from './src/features/deferredViews/InventoryImportContent.jsx';`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic',loader:{'.css':'empty'},external:['react','react/jsx-runtime'],define:{'import.meta.env':'{}'},logLevel:'silent'});
const compiled={exports:{}};
new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),compiled,compiled.exports);
const {Inbox,ImportReview}=compiled.exports;

async function environment(run){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid',pretendToBeVisual:true});
 const prior=new Map();
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){prior.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));
 const button=label=>[...document.querySelectorAll('button')].find(node=>(node.getAttribute('aria-label')||node.textContent.trim())===label);
 const click=async label=>{assert.ok(button(label),label);await act(async()=>button(label).click());};
 const field=label=>[...document.querySelectorAll('label')].find(node=>node.textContent.startsWith(label))?.querySelector('input,select,textarea');
 const change=async(node,value)=>{assert.ok(node);const props=node[Object.keys(node).find(key=>key.startsWith('__reactProps'))];await act(async()=>props.onChange({target:{value}}));};
 try{await run({root,click,field,change,dom});}finally{await act(async()=>root.unmount());dom.window.close();for(const[key,value]of prior)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
}

function importScope(rows,setRows){return {preferenceScope:'followup-fixture',BATCH_INTAKE_MODES:{BULK_ADD:'bulk',TRANSFER:'transfer'},Field:({label,children})=>React.createElement('label',null,label,children),IMPORT_CONDITION_OPTIONS:['Sealed'],IMPORT_DESTINATION_OPTIONS:[{value:'Vault',label:'Collection'}],IMPORT_DUPLICATE_ACTIONS:[{value:'new_copy',label:'Keep separate'}],IMPORT_FIELD_OPTIONS:[{value:'itemName',label:'Name'}],IMPORT_SOURCE_GUIDES:[{mode:'transfer',value:'spreadsheet_csv',label:'CSV'}],batchIntakeMode:'transfer',importSourceType:'spreadsheet_csv',importAssistantOpen:true,importRows:rows,importBulkApply:{},importColumnHeaders:[],importColumnMapping:{},importText:'',importOptions:{duplicateAction:'new_copy'},importManualRow:{},importCatalogSearch:'',importCatalogSearchResults:[],importLink:'',importFileName:'',importSaving:false,getImportSourceGuide:()=>({label:'CSV'}),defaultImportDestination:()=> 'Vault',findImportDuplicate:()=>null,findImportDuplicateCandidates:()=>[],importConfidenceLabel:()=> 'Review',catalogTitle:row=>row.itemName,setImportRows:setRows,updateImportRow:(id,patch)=>setRows(current=>current.map(row=>row.importedItemId===id?{...row,...patch}:row)),setImportBulkApply:()=>{},applyImportBulkUpdates:()=>{throw Error('Unexpected bulk write');},setImportColumnMapping:()=>{},setImportText:()=>{},closeFlowModal:()=>{},confirmInventoryImport:()=>{throw Error('Unexpected import');},setImportOptions:()=>{},setImportCatalogSearch:()=>{},setImportManualRow:()=>{}};}

test('181 error navigation focuses once; subsequent filtering and row browsing keep user focus',()=>environment(async({root,field,change})=>{
 const original=Array.from({length:80},(_,index)=>Object.freeze({importedItemId:String(index+1),itemName:'Box '+(index+1),sourceLine:index+2,quantity:index===69?'bad':1,costPaid:12.34,marketValue:98.76,msrp:'',destination:'Vault',importStatus:'reviewed',needsReview:false,originalText:'Original '+index,condition:'Sealed',notes:''}));
 const before=JSON.stringify(original);let current;
 function Harness(){const[rows,setRows]=useState(original);current=rows;return React.createElement(ImportReview,{scope:importScope(rows,setRows)});}
 await act(async()=>root.render(React.createElement(Harness)));
 const jump=[...document.querySelectorAll('.import-issue-link')].find(node=>node.textContent.includes('(Box 70)'));
 await act(async()=>jump.click());assert.equal(document.activeElement.id,'import-70-quantity');
 const search=field('Find a review row');search.focus();await change(search,'Box');assert.equal(document.activeElement,search,'Typing in search must not jump back to the previous error');
 const filter=field('Review status');filter.focus();await change(filter,'needs_fix');assert.equal(document.activeElement,filter,'Changing the review filter retains focus');
 await act(async()=>jump.click());assert.equal(document.activeElement.id,'import-70-quantity','Requesting the error again still works');
 assert.equal(JSON.stringify(current),before);assert.equal(JSON.stringify(original),before);
}));

test('164 hidden selected alerts are named before bulk actions and clearing selection never writes',()=>environment(async({root,click,field,change})=>{
 const rows=Object.freeze([{id:'store',title:'Target restock',category:'favorite_store_alert',createdAt:'2026-11-14T12:00:00Z'},{id:'account',title:'Account security notice',category:'account_update',createdAt:'2026-11-14T11:00:00Z',dismissible:false}].map(Object.freeze));
 const before=JSON.stringify(rows),writes=[];
 await act(async()=>root.render(React.createElement(Inbox,{notifications:rows,now:Date.parse('2026-11-14T13:00:00Z'),onRead:id=>writes.push(id),onArchive:id=>writes.push(id)})));
 await click('Select alerts');await click('Select shown alerts');await change(field('Alert type'),'stores');
 assert.match(document.querySelector('.notification-bulk').textContent,/1 selected alert is outside this view/);
 const review=document.querySelector('.notification-selected-review');assert.ok(review);assert.match(review.textContent,/Account security notice/);assert.match(review.textContent,/Protected/);
 await click('Clear selection');assert.match(document.querySelector('.notification-bulk').textContent,/0 selected/);assert.deepEqual(writes,[]);assert.equal(JSON.stringify(rows),before);
}));
