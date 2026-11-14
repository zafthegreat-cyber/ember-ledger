import test from "node:test";
import assert from "node:assert/strict";
import {reconcileLegacyQuoteEdit,mergeLegacySavedQuoteRecord} from "../src/utils/legacyQuoteEdit.mjs";

const baseline=Object.freeze({marketPrice:10,lowPrice:8,midPrice:9,highPrice:12,msrpPrice:5});
const current=Object.freeze({id:"same-record",quantity:2,unitCost:3,marketPrice:15,marketValue:15,lowPrice:11,midPrice:13,highPrice:20,msrpPrice:5,lastPriceChecked:"2026-11-13T18:00:00Z",priceCheckedAt:"2026-11-13T18:00:00Z",marketSource:"Provider",marketValueSource:"catalog"});
const localUpdate={...current,name:"Reviewed name",...baseline,marketValue:10,lastPriceChecked:"2030-01-01T00:00:00Z"};
const serverUpdate={name:"Reviewed name",quantity:2,market_price:10,low_price:8,mid_price:9,high_price:12,msrp_price:5,last_price_checked:"2030-01-01T00:00:00Z"};

test("identity edit preserves a newer quote received after edit start and excludes server quote fields",()=>{
  const before=JSON.stringify({baseline,current,localUpdate,serverUpdate});const result=reconcileLegacyQuoteEdit({baseline,current,draft:{...baseline,marketPrice:"10.00"},localUpdate,serverUpdate});
  assert.deepEqual(result.changedFields,[]);for(const key of ["marketPrice","marketValue","lowPrice","midPrice","highPrice","lastPriceChecked","priceCheckedAt","marketSource"])assert.equal(result.localUpdate[key],current[key]);
  assert.deepEqual(result.serverUpdate,{name:"Reviewed name",quantity:2});assert.equal(result.localUpdate.id,current.id);assert.equal(result.localUpdate.unitCost,3);assert.equal(JSON.stringify({baseline,current,localUpdate,serverUpdate}),before);
});
test("deliberate manual estimate edit is explicit and never claims a new provider check",()=>{
  const reviewedAt="2026-11-13T19:00:00Z";const result=reconcileLegacyQuoteEdit({baseline,current,draft:{...baseline,marketPrice:"17.50"},localUpdate,serverUpdate,reviewedAt});
  assert.deepEqual(result.changedFields,["marketPrice"]);assert.equal(result.localUpdate.marketPrice,17.5);assert.equal(result.localUpdate.lowPrice,11);assert.equal(result.localUpdate.lastPriceChecked,current.lastPriceChecked);assert.equal(result.localUpdate.priceCheckedAt,current.priceCheckedAt);assert.equal(result.localUpdate.marketSource,"Manual saved estimate");assert.equal(result.localUpdate.manualPriceUpdatedAt,reviewedAt);
  assert.equal(result.serverUpdate.market_price,17.5);assert.equal(result.serverUpdate.market_value,17.5);assert.equal(result.serverUpdate.market_value_source,"manual");assert.equal(result.serverUpdate.last_price_checked,undefined);assert.equal(result.serverUpdate.low_price,undefined);
});
test("clearing an estimate remains unknown while an explicit zero stays zero",()=>{
  const cleared=reconcileLegacyQuoteEdit({baseline,current,draft:{...baseline,marketPrice:""},localUpdate,serverUpdate});assert.equal(cleared.localUpdate.marketPrice,null);assert.equal(cleared.serverUpdate.market_price,null);
  const zero=reconcileLegacyQuoteEdit({baseline,current,draft:{...baseline,marketPrice:"0"},localUpdate,serverUpdate});assert.equal(zero.localUpdate.marketPrice,0);assert.equal(zero.serverUpdate.market_price,0);
});
test("cost-only or missing-price edits cannot manufacture zero quotes or fresh timestamps",()=>{
  const result=reconcileLegacyQuoteEdit({baseline:{},current:{id:"original",marketPrice:null},draft:{},localUpdate:{id:"original",unitCost:8,marketPrice:0,lastPriceChecked:"2030-01-01"},serverUpdate:{unit_cost:8,market_price:0,last_price_checked:"2030-01-01"}});assert.deepEqual(result.localUpdate,{id:"original",unitCost:8,marketPrice:null});assert.deepEqual(result.serverUpdate,{unit_cost:8});
});
test("invalid edited monetary values fail before returning any save payload",()=>{
  for(const value of [-1,"abc",Infinity,"$5"] )assert.throws(()=>reconcileLegacyQuoteEdit({baseline,current,draft:{marketPrice:value},localUpdate,serverUpdate}),/valid nonnegative/);
});

test('pending-response merge keeps the complete newer quote snapshot while accepting saved grading',()=>{
 const atSave={...current},latest={...current,marketPrice:22,marketValue:22,lowPrice:18,marketSource:'New provider',marketPriceSource:'New provider',lastPriceChecked:'2026-11-14T20:00:00Z',priceReviewNote:'Fresh import'};
 const saved={...current,name:'Reviewed name',grade:'10',marketPrice:17,marketValue:17,lastPriceChecked:'older server quote'};
 const before=JSON.stringify({atSave,latest,saved});const result=mergeLegacySavedQuoteRecord({atSave,current:latest,saved});
 assert.equal(result.name,'Reviewed name');assert.equal(result.grade,'10');assert.equal(result.marketPrice,22);assert.equal(result.marketValue,22);assert.equal(result.lowPrice,18);assert.equal(result.marketSource,'New provider');assert.equal(result.lastPriceChecked,latest.lastPriceChecked);assert.equal(result.priceReviewNote,'Fresh import');assert.equal(result.unitCost,current.unitCost);assert.equal(result.id,current.id);assert.equal(JSON.stringify({atSave,latest,saved}),before);
});
test('no concurrent quote change accepts intentional server estimates and changed metadata alone preserves the newer snapshot',()=>{
 const saved={...current,marketPrice:0,marketValue:0,marketSource:'Manual saved estimate'};
 assert.equal(mergeLegacySavedQuoteRecord({atSave:current,current:{...current,grade:'9'},saved}).marketPrice,0);
 const latest={...current,lastPriceChecked:'newest provider check'};const result=mergeLegacySavedQuoteRecord({atSave:current,current:latest,saved});assert.equal(result.marketPrice,current.marketPrice);assert.equal(result.lastPriceChecked,latest.lastPriceChecked);assert.equal(result.marketSource,current.marketSource);
});
test('pending-response merge preserves unknown versus zero, deleted aliases and identity guards',()=>{
 for(const value of [null,0]){const latest={...current,marketPrice:value,marketValue:value};delete latest.marketSource;const result=mergeLegacySavedQuoteRecord({atSave:current,current:latest,saved:{...current,marketSource:'stale'}});assert.equal(result.marketPrice,value);assert.equal(Object.hasOwn(result,'marketSource'),false);}
 assert.equal(mergeLegacySavedQuoteRecord({atSave:current,current,saved:{...current,id:'wrong'}}),current);
 assert.equal(mergeLegacySavedQuoteRecord({atSave:current,current:undefined,saved:current}),undefined);
});
