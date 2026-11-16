import test from "node:test";
import assert from "node:assert/strict";
import {parseStockIntelligence,filterStockIntelligence,loadStockIntelligence} from "../src/services/stockIntelligence.mjs";
import {createStockIntelHandler} from "../supabase/functions/code3-stock-intel-feed/core.mjs";

const NOW = Date.parse("2026-11-15T20:00:00Z");
const TARGET_URL = "https://www.target.com/p/hoc2/A-1012850572";
function feed(signals=[]) {
  return {
    version:1,
    generatedAt:new Date(NOW).toISOString(),
    sources:[
      {retailer:"Target",mode:"manual-watch",connected:false,lastSuccessAt:null},
      {retailer:"Walmart",mode:"manual-watch",connected:false,lastSuccessAt:null},
      {retailer:"Pokémon Center",mode:"manual-watch",connected:false,lastSuccessAt:null},
      {retailer:"Best Buy",mode:"manual-watch",connected:false,lastSuccessAt:null},
    ],
    targets:[{retailer:"Target",sku:"1012850572",name:"Pokémon 30th Night",url:TARGET_URL}],
    signals,
  };
}
function signal(fields={}) {
  return {
    id:"00000000-0000-4000-8000-000000000001",
    retailer:"Target",signalType:"reported_stock",evidenceLevel:"reported",
    sourceType:"community_report",headline:"Target inventory was reported",
    sourceUrl:TARGET_URL, observedAt:new Date(NOW-60_000).toISOString(),
    expiresAt:new Date(NOW+60_000).toISOString(),
    product:"Pokémon 30th Night",productUrl:TARGET_URL,sku:"1012850572",
    ...fields,
  };
}
test("Watch targets do not imply available inventory",()=>{
  const result=parseStockIntelligence(feed(),NOW);
  assert.equal(result.targets.length,1);
  assert.equal(result.signals.length,0);
  assert.equal(result.sources.filter(s=>s.connected).length,0);
});
test("Reported stock cannot be described as available to purchase",()=>{
  assert.throws(()=>parseStockIntelligence(feed([signal({signalType:"available_now"})]),NOW),/Unconfirmed stock/);
  const checked=signal({signalType:"available_now",evidenceLevel:"admin_checked",sourceType:"admin_review"});
  assert.equal(parseStockIntelligence(feed([checked]),NOW).signals[0].signalType,"available_now");
});
test("Unverified third-party source cannot impersonate official or admin",()=>{
  assert.throws(()=>parseStockIntelligence(feed([signal({evidenceLevel:"official"})]),NOW),/Unverified official/);
  assert.throws(()=>parseStockIntelligence(feed([signal({evidenceLevel:"admin_checked"})]),NOW),/Unverified admin/);
});
test("Expired stock reports disappear",()=>{
  const old=signal({observedAt:new Date(NOW-3600_000).toISOString(),expiresAt:new Date(NOW-60_000).toISOString()});
  assert.equal(parseStockIntelligence(feed([old]),NOW).signals.length,0);
});
test("Unsafe product URLs and duplicated watch targets are rejected",()=>{
  const bad=feed();bad.targets[0].url="https://target.com.bad-domain.test/shop";
  assert.throws(()=>parseStockIntelligence(bad,NOW),/Invalid retailer watch target/);
  const duplicate=feed();duplicate.targets.push({...duplicate.targets[0]});
  assert.throws(()=>parseStockIntelligence(duplicate,NOW),/Duplicate retailer target/);
});
test("Filtered search preserves SKU and retailer accuracy",()=>{
  const result=parseStockIntelligence(feed([signal()]),NOW);
  assert.equal(filterStockIntelligence(result,{retailer:"Target",query:"1012850572"}).targets.length,1);
  assert.equal(filterStockIntelligence(result,{retailer:"Walmart"}).targets.length,0);
});
test("Unknown statuses, too many rows, and future observations are rejected",()=>{
  const bad=feed([signal({signalType:"guaranteed_checkout"})]);
  assert.throws(()=>parseStockIntelligence(bad,NOW),/Invalid retailer stock signal/);
  const future=feed([signal({observedAt:new Date(NOW+3600_000).toISOString()})]);
  assert.throws(()=>parseStockIntelligence(future,NOW),/Invalid stock intelligence timestamp/);
  const tooMany=feed();tooMany.targets=Array(81).fill(tooMany.targets[0]);
  assert.throws(()=>parseStockIntelligence(tooMany,NOW),/feed unavailable/);
});
test("Client feed reads only a validated JSON response without cookies",async()=>{
  let request;
  const fakeFetch=async(url,options)=>{
    request={url,options};
    return {ok:true,headers:{get:()=>"application/json"},json:async()=>feed()};
  };
  const result=await loadStockIntelligence({publicGatewayKey:"test-public",now:NOW,fetchImpl:fakeFetch});
  assert.equal(result.targets.length,1);
  assert.equal(request.options.credentials,"omit");
  assert.equal(request.options.headers.Authorization,"Bearer test-public");
  assert.match(request.url,/functions\/v1\/code3-stock-intel-feed$/);
});
test("Edge handler exposes only GET and HEAD and refuses unsafe requests",async()=>{
  const handler=createStockIntelHandler({load:async()=>feed()});
  const url="https://gxsfququorfczvhrkudl.supabase.co/functions/v1/code3-stock-intel-feed";
  const result=await handler(new Request(url));
  assert.equal(result.status,200);
  assert.equal((await result.json()).targets.length,1);
  const head=await handler(new Request(url,{method:"HEAD"}));
  assert.equal(head.status,200);
  assert.equal(await head.text(),"");
  const options=await handler(new Request(url,{method:"OPTIONS"}));
  assert.equal(options.status,204);
  const post=await handler(new Request(url,{method:"POST"}));
  assert.equal(post.status,405);
  const unsupported=await handler(new Request(url+"?take=all"));
  assert.equal(unsupported.status,400);
});
test("An upstream failure never becomes a false empty feed",async()=>{
  const handler=createStockIntelHandler({load:async()=>{throw new Error("Storage down");}});
  const r=await handler(new Request("https://app.test/functions/v1/code3-stock-intel-feed"));
  assert.equal(r.status,503);
  assert.match(await r.text(),/temporarily unavailable/);
});
