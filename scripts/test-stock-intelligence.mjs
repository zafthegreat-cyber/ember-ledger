import test from "node:test";
import assert from "node:assert/strict";
import {parseStockIntelligence,filterStockIntelligence,loadStockIntelligence} from "../src/services/stockIntelligence.mjs";
import {createStockIntelHandler} from "../supabase/functions/code3-stock-intel-feed/core.mjs";
import {createReviewHandler} from "../supabase/functions/code3-stock-intel-review/core.mjs";
import {createInboundHandler} from "../supabase/functions/code3-stock-inbound/core.mjs";
import {INBOUND_STAGES,parseInboundEvents} from "../src/services/warehouseInbound.mjs";

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
      {retailer:"Sam's Club",mode:"manual-watch",connected:false,lastSuccessAt:null},
      {retailer:"Costco",mode:"manual-watch",connected:false,lastSuccessAt:null},
    ],
    discoveryWatches:[
      {retailer:"Sam's Club",query:"Pokémon Trading Card Game"},
      {retailer:"Costco",query:"Pokémon Trading Card Game"},
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
  assert.equal(result.sources.length,6);
  assert.equal(result.discoveryWatches.length,2);
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
  assert.equal(filterStockIntelligence(result,{retailer:"Costco"}).discoveryWatches.length,1);
  assert.equal(filterStockIntelligence(result,{retailer:"Sam's Club",query:"Trading Card"}).discoveryWatches.length,1);
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

const staffId="00000000-0000-4000-8000-000000000009";
const createStaffRequest=(body, options={})=>new Request("https://gxsfququorfczvhrkudl.supabase.co/functions/v1/code3-stock-intel-review",{
  method:"POST",
  headers:{"authorization":"Bearer "+"x".repeat(64),"content-type":"application/json",...(options.headers||{})},
  body:JSON.stringify(body),
});
const review={
  retailer:"Target",sku:"1012850572",signalType:"reported_stock",evidence:"reported",
  headline:"Reported inventory change on Target",sourceUrl:TARGET_URL,
};
test("Staff review requires a server-verified admin",async()=>{
  let touched=false;
  const handler=createReviewHandler({authorize:async()=>({id:staffId,admin:false}),findProduct:async()=>{touched=true;},write:async()=>{touched=true;}});
  const result=await handler(createStaffRequest(review));
  assert.equal(result.status,403);assert.equal(touched,false);
  const anonymous=await handler(new Request("https://app.test/code3-stock-intel-review",{method:"POST",body:JSON.stringify(review)}));
  assert.equal(anonymous.status,401);
});
test("Reported alerts preserve evidence level and are time-limited",async()=>{
  let saved;
  const handler=createReviewHandler({
    authorize:async()=>({id:staffId,admin:true}),
    findProduct:async()=>({id:"00000000-0000-4000-8000-000000000002"}),
    write:async item=>{saved=item;return{id:"00000000-0000-4000-8000-000000000003"};},
    clock:()=>new Date(NOW),
  });
  const result=await handler(createStaffRequest(review));
  assert.equal(result.status,201);
  assert.equal(saved.evidence_level,"reported");
  assert.equal(saved.source_type,"admin_review");
  assert.equal(saved.product_id,"00000000-0000-4000-8000-000000000002");
  assert.equal(Date.parse(saved.expires_at)-Date.parse(saved.observed_at),90*60_000);
  assert.match(saved.event_key,/^[a-f0-9]{64}$/);
  assert.equal(saved.created_by,staffId);
});
test("Discord links cannot be claimed to be admin-checked retailer availability",async()=>{
  const handler=createReviewHandler({
    authorize:async()=>({id:staffId,admin:true}),
    findProduct:async()=>({id:"00000000-0000-4000-8000-000000000002"}),
    write:async()=>{throw Error("Must not reach write");},
  });
  const input={...review,evidence:"admin_checked",signalType:"available_now",sourceUrl:"https://discord.com/channels/1558588508204179611/1563700460802670662/1563700485582749717"};
  const result=await handler(createStaffRequest(input));
  assert.equal(result.status,400);
});
test("Unknown SKU and malicious source host are not accepted",async()=>{
  const handler=createReviewHandler({
    authorize:async()=>({id:staffId,admin:true}),
    findProduct:async()=>null,
    write:async()=>{throw Error("Must not write");},
  });
  const missing=await handler(createStaffRequest(review));
  assert.equal(missing.status,422);
  const bad=await handler(createStaffRequest({...review,sourceUrl:"https://target.com.attacker.test/stock"}));
  assert.equal(bad.status,400);
});
test("Queue signals require Pokémon Center and can omit SKU",async()=>{
  let saved;
  const handler=createReviewHandler({
    authorize:async()=>({id:staffId,admin:true}),findProduct:async()=>null,
    write:async item=>{saved=item;return{id:"00000000-0000-4000-8000-000000000003"};},
    clock:()=>new Date(NOW),
  });
  assert.equal((await handler(createStaffRequest({...review,sku:"",signalType:"queue_detected"}))).status,400);
  const result=await handler(createStaffRequest({retailer:"Pokémon Center",sku:"",signalType:"queue_detected",evidence:"admin_checked",headline:"Waiting room appeared on Pokémon Center",sourceUrl:"https://www.pokemoncenter.com"}));
  assert.equal(result.status,201);
  assert.equal(saved.product_id,null);
  assert.equal(Date.parse(saved.expires_at)-Date.parse(saved.observed_at),20*60_000);
});
test("Review API rejects unauthorized origins and duplicate posts",async()=>{
  const handler=createReviewHandler({
    authorize:async()=>({id:staffId,admin:true}),
    findProduct:async()=>({id:"00000000-0000-4000-8000-000000000002"}),
    write:async()=>({duplicate:true}),
    clock:()=>new Date(NOW),
  });
  assert.equal((await handler(createStaffRequest(review,{headers:{origin:"https://attacker.example"}}))).status,403);
  assert.equal((await handler(createStaffRequest(review,{headers:{origin:"https://code3tcg.app"}}))).status,409);
});

test("Sam's Club and Costco accept appropriate official product domains",()=>{
  const clubs=[
    {retailer:"Sam's Club",sku:"212121",name:"Pokémon Club bundle",url:"https://www.samsclub.com/p/pokemon-cards/212121"},
    {retailer:"Costco",sku:"313131",name:"Pokémon Warehouse bundle",url:"https://www.costco.com/pokemon-collection.product.313131.html"},
  ];
  const valid=feed();valid.targets.push(...clubs);
  assert.equal(parseStockIntelligence(valid,NOW).targets.length,3);
  const mismatched=feed();mismatched.targets.push({...clubs[0],url:clubs[1].url});
  assert.throws(()=>parseStockIntelligence(mismatched,NOW),/Invalid retailer watch target/);
  const hostile=feed();hostile.targets.push({...clubs[1],url:"https://www.costco.com.attacker.example/item"});
  assert.throws(()=>parseStockIntelligence(hostile,NOW),/Invalid retailer watch target/);
});
test("Discovery watches cannot invent retailers, exceed limits or repeat categories",()=>{
  const unknown=feed();unknown.discoveryWatches.push({retailer:"Mystery Store",query:"Pokémon"});
  assert.throws(()=>parseStockIntelligence(unknown,NOW),/Invalid discovery watch/);
  const duplicate=feed();duplicate.discoveryWatches.push({...duplicate.discoveryWatches[0]});
  assert.throws(()=>parseStockIntelligence(duplicate,NOW),/Duplicate discovery watch/);
  const excessive=feed();excessive.discoveryWatches=Array(21).fill({retailer:"Costco",query:"Pokémon"});
  assert.throws(()=>parseStockIntelligence(excessive,NOW),/Invalid discovery watches/);
});
test("Sam's Club and Costco can log SKU-free possible-drop signals, not queue claims",async()=>{
  const saved=[];
  const handler=createReviewHandler({
    authorize:async()=>({id:staffId,admin:true}),
    findProduct:async()=>null,
    write:async item=>{saved.push(item);return{id:"00000000-0000-4000-8000-000000000003"};},
    clock:()=>new Date(NOW),
  });
  const cases=[
    {retailer:"Sam's Club",url:"https://www.samsclub.com",signalType:"possible_drop"},
    {retailer:"Costco",url:"https://www.costco.com",signalType:"possible_drop"},
  ];
  for(const entry of cases){
    const res=await handler(createStaffRequest({...review,retailer:entry.retailer,sku:"",signalType:entry.signalType,sourceUrl:entry.url,headline:"Possible Pokémon drop reported for "+entry.retailer}));
    assert.equal(res.status,201);
  }
  assert.equal(saved.length,2);
  assert.ok(saved.every(s=>s.evidence_level==="reported"&&s.product_id===null));
  const bad=await handler(createStaffRequest({...review,retailer:"Costco",sku:"",signalType:"queue_detected",sourceUrl:"https://www.costco.com"}));
  assert.equal(bad.status,400);
  const untrusted=await handler(createStaffRequest({...review,retailer:"Costco",sku:"",signalType:"possible_drop",sourceUrl:"https://www.samsclub.com"}));
  assert.equal(untrusted.status,400);
});

const ACTOR_ID="00000000-0000-4000-8000-000000000009";
const INBOUND_URL="https://gxsfququorfczvhrkudl.supabase.co/functions/v1/code3-stock-inbound";
function inboundRequest(report,headers={}){
  return new Request(INBOUND_URL,{method:"POST",headers:{
    authorization:"Bearer "+"z".repeat(64),"content-type":"application/json",...headers
  },body:JSON.stringify(report)});
}
const inboundReport={
  retailer:"Sam's Club",sku:"",stage:"in_warehouse",
  headline:"Warehouse storage reported, awaiting source confirmation"
};
test("Warehouse stages include arrived separately from stored in warehouse",()=>{
  const stages=INBOUND_STAGES.map(item=>item.key);
  assert.ok(stages.indexOf("arrived_warehouse")!==stages.indexOf("in_warehouse"));
  assert.ok(stages.includes("ordered")&&stages.includes("en_route"));
  assert.ok(stages.includes("warehouse_processing")&&stages.includes("distribution_en_route"));
});
test("Warehouse endpoint rejects unsigned and non-admin users before reading data",async()=>{
  let touched=false;
  const handler=createInboundHandler({
    authorize:async()=>({id:ACTOR_ID,admin:false}),
    list:async()=>{touched=true;return[];},
    findProduct:async()=>{touched=true;return null;},
    save:async()=>{touched=true;return{};}
  });
  assert.equal((await handler(new Request(INBOUND_URL))).status,401);
  const denied=await handler(new Request(INBOUND_URL,{headers:{authorization:"Bearer "+"z".repeat(64)}}));
  assert.equal(denied.status,403);
  assert.equal((await handler(inboundRequest(inboundReport))).status,403);
  assert.equal(touched,false);
});
test("Warehouse reports are staff-only, unverified, and expire",async()=>{
  let saved;
  const handler=createInboundHandler({
    authorize:async()=>({id:ACTOR_ID,admin:true}),
    list:async()=>[],
    findProduct:async()=>null,
    save:async row=>{saved=row;return {id:"00000000-0000-4000-8000-000000000021"};},
    clock:()=>new Date(NOW)
  });
  const response=await handler(inboundRequest(inboundReport));
  assert.equal(response.status,201);
  assert.equal(saved.stage,"in_warehouse");
  assert.equal(saved.evidence_level,"reported");
  assert.equal(saved.source_type,"staff_report");
  assert.equal(saved.product_id,null);
  assert.equal(saved.retailer,"Sam's Club");
  assert.equal(saved.created_by,ACTOR_ID);
  assert.equal(Date.parse(saved.expires_at)-Date.parse(saved.observed_at),7*86400_000);
  assert.match(saved.event_key,/^[a-f0-9]{64}$/);
  const now=new Date(NOW);
  const row={
    id:"00000000-0000-4000-8000-000000000021",retailer:"Sam's Club",
    stage:"in_warehouse",headline:inboundReport.headline,evidenceLevel:"reported",
    sourceType:"staff_report",observedAt:now.toISOString(),
    expiresAt:new Date(NOW+7*86400_000).toISOString(),sku:"",product:""
  };
  const validated=parseInboundEvents({version:1,events:[row]},NOW);
  assert.equal(validated[0].active,true);
  assert.equal(parseInboundEvents({version:1,events:[row]},NOW+8*86400_000)[0].active,false);
});
test("Inbound tracking validates retailer and known stages and does not allow forged evidence",async()=>{
  let writes=0;
  const handler=createInboundHandler({
    authorize:async()=>({id:ACTOR_ID,admin:true}),
    list:async()=>[],
    findProduct:async()=>null,
    save:async()=>{writes++;return{id:ACTOR_ID};}
  });
  for(const report of [
    {...inboundReport,stage:"warehouse_full"},
    {...inboundReport,retailer:"Other retailer"},
    {...inboundReport,sku:"unapproved-sku"},
    {...inboundReport,headline:"oops",evidenceLevel:"verified",sourceType:"authorized_supplier_feed"},
  ]){
    const response=await handler(inboundRequest(report));
    assert.ok([400,422].includes(response.status));
  }
  assert.equal(writes,0);
  const authorizedAttempt=await handler(inboundRequest({...inboundReport,evidenceLevel:"verified",sourceType:"retailer_notice"}));
  assert.equal(authorizedAttempt.status,201);
  assert.equal(writes,1);
});
test("Warehouse records cannot be fetched by anonymous users, and only admin sees filtered fields",async()=>{
  const userId=ACTOR_ID;
  const handler=createInboundHandler({
    authorize:async()=>({id:userId,admin:true}),
    list:async()=>[{
      id:"00000000-0000-4000-8000-000000000031",retailer:"Costco",
      stage:"arrived_warehouse",summary:"Shipment arrival reported privately",
      observed_at:new Date(NOW).toISOString(),expires_at:new Date(NOW+86400000).toISOString(),
      evidence_level:"reported",source_type:"staff_report",
      retailer_products:null,created_by:userId,
      internal_shipment_route:"never expose"
    }],
    findProduct:async()=>null,save:async()=>({id:userId})
  });
  const admin=await handler(new Request(INBOUND_URL,{headers:{authorization:"Bearer "+"z".repeat(64)}}));
  assert.equal(admin.status,200);
  const payload=await admin.json();
  assert.equal(payload.events.length,1);
  assert.equal(payload.events[0].stage,"arrived_warehouse");
  assert.equal(payload.events[0].internal_shipment_route,undefined);
  assert.equal(payload.events[0].created_by,undefined);
  assert.equal((await handler(new Request(INBOUND_URL,{method:"PUT",headers:{authorization:"Bearer "+"z".repeat(64)}}))).status,405);
});
test("Reject unsafe cross-origin warehouse reports",async()=>{
  const handler=createInboundHandler({
    authorize:async()=>({id:ACTOR_ID,admin:true}),list:async()=>[],
    findProduct:async()=>null,save:async()=>({id:ACTOR_ID})
  });
  assert.equal((await handler(inboundRequest(inboundReport,{origin:"https://attacker.example"}))).status,403);
});
