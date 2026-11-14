import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";
import { browseSetCatalog, buildCatalogMatchDraft, catalogFinishOptions, catalogMatchIdentityPatch, copyRecognition, priceMetadataLabel, savedPriceMetadata, sortCollectionGroups } from "../src/utils/collectionBrowse.mjs";
import { buildSetCatalogEntries } from "../src/utils/setCatalog.mjs";

const output = await build({stdin:{contents:`export {default as Portfolio} from './src/components/CollectionPortfolio.jsx'; export {default as Catalog} from './src/components/CollectionSetCatalog.jsx'; export {default as Product} from './src/components/CollectionProductDetail.jsx'; export {default as Content} from './src/components/ProductInspectionContent.jsx'; export {default as Viewer} from './src/components/ProductInspectViewer.jsx'; export {default as Add} from './src/features/deferredViews/MultiDestinationContent.jsx';`,resolveDir:process.cwd(),loader:"jsx"},bundle:true,platform:"node",format:"cjs",write:false,jsx:"automatic",loader:{".css":"empty"},external:["react","react/jsx-runtime"],define:{"import.meta.env":"{}"},logLevel:"silent",plugins:[{name:"fixtures",setup(api){api.onResolve({filter:/^virtual:code3-set-catalog$/},()=>({path:"catalog",namespace:"fixture"}));api.onResolve({filter:/nativeFiles\.js$/},()=>({path:"files",namespace:"fixture"}));api.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:args.path==="files"?`export async function exportFile({blob,filename}) { globalThis.__uiExports.push({text:await blob.text(),filename});return {status:'downloaded'}; } export const exportFileStatus=()=>"Export ready";export const exportFileError=e=>e.message;`:`export default {}`,loader:"js"}));}}]});
const compiled={exports:{}};new Function("require","module","exports",output.outputFiles[0].text)(createRequire(import.meta.url),compiled,compiled.exports);
const {Portfolio,Catalog,Product,Content,Viewer,Add}=compiled.exports;
const record = Object.freeze({id:"original",_recordOrigin:"repository",catalogProductId:"c1",name:"Card one",tcgGame:"pokemon",catalogType:"card",cardNumber:"1",setName:"Set",quantity:2,ownedItemPurpose:"PERSONAL_COLLECTION",allocatedItemCost:13.2,marketPrice:42,priceCheckedAt:"2026-10-18T14:22:00Z",marketSource:"Saved provider",purchaseDate:"2026-09-10",storageLocation:"Binder A",variant:"Reverse Holofoil"});
const catalogProduct=Object.freeze({id:"c1",name:"Card one",tcgGame:"pokemon",catalogType:"card",cardNumber:"1",setName:"Set",marketPrice:999,versions:[{key:"normal",variant:"Normal",label:"Normal",marketPrice:7},{key:"reverse holo",variant:"Reverse Holofoil",label:"Reverse Holo",marketPrice:9}]});

async function environment(run){
  const dom=new JSDOM('<div id="root"></div>',{url:"https://fixture.invalid",pretendToBeVisual:true});const prior=new Map();
  const globals={window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},__uiExports:[]};
  dom.window.scrollTo=()=>{};
  for(const [key,value] of Object.entries(globals)){prior.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  const {createRoot}=await import("react-dom/client");const root=createRoot(document.getElementById("root"));
  const button=name=>[...document.querySelectorAll("button")].find(node=>(node.getAttribute("aria-label")||node.textContent.trim())===name);
  const click=async name=>{assert.ok(button(name),name);await act(async()=>button(name).click());};
  const change=async(node,value)=>{assert.ok(node);const props=node[Object.keys(node).find(key=>key.startsWith("__reactProps"))];await act(async()=>props.onChange({target:{value}}));};
  try{await run({root,click,change,button,dom});}finally{await act(async()=>root.unmount());dom.window.close();for(const[key,d]of prior)if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key];}
}

test("price context only uses explicit quote metadata and never invents freshness",()=>{
  assert.deepEqual(savedPriceMetadata({marketPrice:10,updatedAt:"2026-11-13T12:00:00Z"}),{source:"",checkedAt:""});
  assert.deepEqual(savedPriceMetadata({marketPrice:10,marketSource:"Provider",priceCheckedAt:"not-a-date"}),{source:"Provider",checkedAt:""});
  assert.equal(savedPriceMetadata({priceCheckedAt:"2026"}).checkedAt,"");assert.equal(savedPriceMetadata({priceCheckedAt:"2026-02-30"}).checkedAt,"");assert.doesNotMatch(priceMetadataLabel([{priceCheckedAt:"2026-11-01"}]),/12:00/);
  assert.match(priceMetadataLabel([record]),/Saved provider.*2026/);assert.match(priceMetadataLabel([record,{marketPrice:12}]),/incomplete/);
  assert.equal(savedPriceMetadata({...record,projectedResaleMid:5}).checkedAt,"");
});

test("group sorts are deterministic and never mutate grouped records or prices",()=>{
  const groups=Object.freeze([{key:"a",item:{name:"A",setName:"Z"},records:[{createdAt:"2026-01-01"}],quantity:1,valuation:{value:9}},{key:"b",item:{name:"B",setName:"A"},records:[{createdAt:"2026-02-01"}],quantity:3,valuation:{value:2}}]);const before=JSON.stringify(groups);
  for(const sort of ["recent","quantity","set"])assert.equal(sortCollectionGroups(groups,sort)[0].key,"b");
  assert.equal(sortCollectionGroups(groups,"value")[0].key,"a");assert.equal(JSON.stringify(groups),before);
});

test("missing view, finish options and catalog ordering use recorded ownership and versions",()=>{
  const entries=buildSetCatalogEntries({catalogRecords:[catalogProduct,{id:"c2",name:"Card two",cardNumber:"2",tcgGame:"pokemon",catalogType:"card",finish:"Holofoil"}],ownedItems:[record]});
  assert.deepEqual(browseSetCatalog(entries,{ownership:"missing"}).map(row=>row.product.id),["c2"]);
  assert.equal(browseSetCatalog(entries,{finish:"reverse holo"}).length,1);assert.equal(catalogFinishOptions(entries).length,3);
});

test("reviewed catalog patch preserves acquisition, IDs, quantities and latest saved quotes",()=>{
  const before=JSON.stringify(record),candidate={...catalogProduct,id:"new-catalog",name:"Confirmed match",quantity:999,allocatedItemCost:0,marketPrice:1,priceCheckedAt:"2030-01-01"};
  const draft=buildCatalogMatchDraft(record,candidate);for(const field of ["id","quantity","allocatedItemCost","marketPrice","priceCheckedAt","purchaseDate"])assert.equal(draft[field],record[field]);
  assert.equal(draft.catalogProductId,"new-catalog");assert.equal(draft.name,"Confirmed match");assert.equal(JSON.stringify(record),before);assert.equal(catalogMatchIdentityPatch({tcgplayerProductId:"123"}).catalogProductId,undefined);
  assert.doesNotMatch(copyRecognition(record,{hidden:true}).detail,/13\.20/);
});

test("catalog missing filter and expanded results survive item navigation state",async()=>environment(async({root,click})=>{
  const products=Array.from({length:51},(_,index)=>({...catalogProduct,id:`c${index+1}`,name:`Card ${index+1}`,cardNumber:String(index+1),versions:[]}));let savedView={};
  function Harness(){const[view,setView]=useState(savedView),[detail,setDetail]=useState(false);savedView=view;return detail?React.createElement("button",{onClick:()=>setDetail(false)},"Return to catalog"):React.createElement(Catalog,{row:{key:"set",name:"Set",ownedItems:[record]},viewState:view,onViewStateChange:setView,loadCatalog:async()=>({available:true,products}),onOpenItem:()=>setDetail(true)});}
  await act(async()=>root.render(React.createElement(Harness)));await click("Show more (27 remaining)");await act(async()=>document.querySelector('.set-catalog-product').click());await act(async()=>document.querySelector(".set-catalog-copy-link").click());await click("Return to catalog");assert.equal(document.querySelectorAll('.set-catalog-product').length,48);
  await click("Missing from collection");assert.equal(savedView.ownership,"missing");assert.equal(document.querySelectorAll('[data-owned="true"]').length,0);await click("Clear filters");assert.equal(savedView.ownership,"all");
}));

test("copy shortcuts target original objects and honor management guards",async()=>environment(async({root,click})=>{
  let opened;const group={item:record,records:[record],quantity:2,purposeCounts:[{purpose:"PERSONAL_COLLECTION",label:"Personal collection",shortLabel:"PC",quantity:2}],valuation:{value:84,knownCount:1,unknownCount:0}};
  await act(async()=>root.render(React.createElement(Product,{group,activeTab:"copies",onEditRecord:(...args)=>opened=args})));await click("Edit purchase details");assert.strictEqual(opened[0],record);assert.equal(opened[1],"purchase");await click("Change purpose");assert.equal(opened[1],"purpose");
  await act(async()=>root.render(React.createElement(Product,{group,activeTab:"copies",hiddenValues:true,onEditRecord:()=>{},canEditRecord:()=>false})));assert.equal(document.body.textContent.includes("Edit purchase details"),false);assert.equal(document.body.textContent.includes("$13.20"),false);
}));

test("purpose filter, filtered subtotal, accessible summary and scoped exports keep every record",async()=>environment(async({root,click,change})=>{
  const records=[record,{...record,id:"other",catalogProductId:"c2",name:"Other",quantity:1,marketPrice:7,ownedItemPurpose:"HOLD"}];const before=JSON.stringify(records);
  function Harness(){const[view,setView]=useState({section:"overview",period:"max",hidden:false,display:"grid",sort:"name"});return React.createElement(Portfolio,{items:records,visibleItems:records,query:"",viewState:view,onViewStateChange:setView,features:{value:true,export:true},preferenceScope:"ui100-test"});}
  await act(async()=>root.render(React.createElement(Harness)));await change(document.querySelector('[aria-label="Collection purpose"]'),"HOLD");assert.equal(document.querySelectorAll('.collection-portfolio-item').length,1);assert.match(document.querySelector('.collection-portfolio-filtered-total').textContent,/\$7\.00/);assert.match(document.querySelector('.collection-portfolio-filtered-total').textContent,/1 product ·/);assert.equal(document.querySelector('.collection-portfolio-active-filters').textContent.includes("Game filter applied"),false);assert.match(document.querySelector('.collection-portfolio-item').getAttribute('aria-label'),/quantity 1.*Hold: 1/);
  await click("Export these results (1 record)");await click("Export whole portfolio");assert.equal(globalThis.__uiExports.length,2);assert.ok(globalThis.__uiExports[1].text.length>globalThis.__uiExports[0].text.length);assert.equal(JSON.stringify(records),before);
}));

test("saved image remains usable during version loading and failed version fetch can retry",async()=>environment(async({root,click})=>{
  let reject,requests=0;const loadCatalog=()=>{requests++;return requests===1?new Promise((_,failure)=>{reject=failure;}):Promise.resolve({products:[catalogProduct]});};
  await act(async()=>root.render(React.createElement(Content,{product:record,src:"/fixture-card.jpg",title:"Card",loadCatalog})));assert.ok(document.querySelector('.product-inspect__stage'));assert.match(document.body.textContent,/Loading card versions/);
  await act(async()=>reject(Error("offline")));assert.ok(document.querySelector('.product-inspect__stage'));await click("Retry versions");assert.equal(requests,2);assert.equal(document.body.textContent.includes("Retry versions"),false);
}));

test("inspection opens a full-screen dialog and returns to the unchanged preview",async()=>environment(async({root,click})=>{
  await act(async()=>root.render(React.createElement(Viewer,{product:record,src:"/fixture-card.jpg",title:"Card"})));await click("Full screen");assert.ok(document.querySelector('dialog[open]'));await click("Close full screen");assert.equal(document.querySelector('dialog'),null);assert.equal(document.querySelectorAll('.product-inspect__stage').length,1);
}));

function addScope(overrides={}) {
  const noop=()=>{};return new Proxy({AI_REVIEW_DISCLAIMER:"",multiDestinationMessage:"",forgeWorkspaceUnavailableMessage:"",catalogProducts:[],items:[],MULTI_DESTINATION_STEPS:["item","destination","details","review"],MULTI_DESTINATION_STEP_LABELS:{item:"Choose item"},ADD_ITEM_QUICK_SEARCH_CHIPS:[],ADD_ITEM_NO_RESULT_HINTS:[],multiDestinationStep:"item",multiDestinationMatchSearchOpen:true,multiDestinationForm:{itemName:"",productType:"card",destinations:{},forge:{},wishlist:{},notes:"",marketPrice:""},getMultiDestinationValidationErrors:()=>[],selectedMultiDestinationKeys:()=>[],isMarketAddFlowSource:()=>false,defaultWorkspaceIdForDestination:()=>"",supabaseCatalogStatus:{loading:false},Field:({label,children})=>React.createElement('label',null,label,children),LazySmartCatalogSearchBox:()=>React.createElement('input',{'aria-label':'Catalog search'}),getCatalogPickerResults:()=>[],catalogTitle:p=>p.name,catalogExpansionName:p=>p.setName,catalogImage:()=>"",getCatalogIdentifiers:()=>[],getTideTradrMarketInfo:()=>({}),hasCatalogMarketPrice:()=>false,isCatalogCardProduct:()=>true,isCatalogSealedProduct:()=>false,renderProductImageFallback:()=>null,...overrides},{get:(obj,key)=>key in obj?obj[key]:noop});
}

test("barcode entry works from an empty search and specialist tools are collapsible",async()=>environment(async({root,click,change})=>{
  let searched;await act(async()=>root.render(React.createElement(Add,{scope:addScope({runMultiDestinationCatalogSearch:(...args)=>searched=args})})));await click("Enter UPC/SKU");const input=document.querySelector('.add-item-barcode-entry input');assert.ok(input);await change(input,"0820650123456");await click("Look up barcode");assert.equal(searched[0],"0820650123456");assert.equal(document.querySelector('.add-item-more-tools').open,false);assert.ok(document.querySelector('.add-item-primary-tools'));
}));

test("selected catalog details collapse and finish suggestions only use known catalog versions",async()=>environment(async({root})=>{
  const scope=addScope({catalogProducts:[catalogProduct],multiDestinationMatchSearchOpen:false,multiDestinationForm:{itemName:"Card one",catalogProductId:"c1",destinations:{},forge:{},notes:"",marketPrice:999}});await act(async()=>root.render(React.createElement(Add,{scope})));assert.equal(document.querySelector('.add-item-identification').open,false);assert.deepEqual([...document.querySelectorAll('datalist option')].map(node=>node.value),["Normal","Reverse Holofoil"]);assert.match(document.body.textContent,/catalog's market quote is kept/);
}));

test("catalog matching requires explicit review and only passes the chosen original and candidate",async()=>environment(async({root,click})=>{
  const original=Object.freeze({...record,catalogProductId:"stale-catalog",name:"My saved card"}),before=JSON.stringify(original);let reviewed;
  await act(async()=>root.render(React.createElement(Catalog,{row:{key:"set",name:"Set",ownedItems:[original]},loadCatalog:async()=>({available:true,products:[catalogProduct]}),onReviewCatalogMatch:(...args)=>reviewed=args})));
  const savedButton=[...document.querySelectorAll('.set-catalog-product')].find(node=>node.textContent.includes("My saved card"));await act(async()=>savedButton.click());
  await act(async()=>document.querySelector('.set-catalog-match-actions button').click());assert.equal(reviewed,undefined);
  await act(async()=>document.querySelector('.catalog-match-options button').click());assert.match(document.querySelector('.catalog-match-comparison').textContent,/My saved card/);assert.equal(reviewed,undefined);
  await click("Review match in editor");assert.strictEqual(reviewed[0],original);assert.equal(reviewed[1].id,catalogProduct.id);assert.equal(JSON.stringify(original),before);
}));

test("portfolio membership search keeps selections and distinguishes otherwise identical copies",async()=>environment(async({root,click,change})=>{
  const records=[record,{...record,id:"second-copy",purchaseDate:"2026-08-20",storageLocation:"Box B",allocatedItemCost:17}];const before=JSON.stringify(records);
  function Harness(){const[view,setView]=useState({section:"overview",period:"max",hidden:false,display:"grid",sort:"name"});return React.createElement(Portfolio,{items:records,visibleItems:records,query:"",viewState:view,onViewStateChange:setView,preferenceScope:"ui100-membership"});}
  await act(async()=>root.render(React.createElement(Harness)));await click("Choose portfolio");await click("Add portfolio +");
  const fieldset=document.querySelector('.collection-portfolio-form fieldset');assert.match(fieldset.textContent,/Binder A/);assert.match(fieldset.textContent,/Box B/);assert.match(fieldset.textContent,/13\.20/);assert.match(fieldset.textContent,/17\.00/);
  await change(fieldset.querySelector('input[type="search"]'),"Box B");assert.equal(fieldset.querySelectorAll('input[type="checkbox"]').length,1);await act(async()=>fieldset.querySelector('input[type="checkbox"]').click());await change(fieldset.querySelector('input[type="search"]'),"");assert.equal(fieldset.querySelectorAll('input[type="checkbox"]:checked').length,1);assert.equal(JSON.stringify(records),before);
}));

test("capped Add search says top ten and gives ways to refine the query",async()=>environment(async({root})=>{
  const ten=Array.from({length:10},(_,index)=>({id:String(index),name:`Demo ${index}`}));await act(async()=>root.render(React.createElement(Add,{scope:addScope({multiDestinationCatalogQuery:"Demo",getCatalogPickerResults:()=>ten,renderCatalogPickerCard:item=>React.createElement('button',{key:item.id},item.name)})})));assert.match(document.body.textContent,/Top 10 matches/);assert.match(document.body.textContent,/Shorten your search to explore more/);
}));
