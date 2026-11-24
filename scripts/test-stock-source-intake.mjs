import test from "node:test";
import assert from "node:assert/strict";
import {
  parseApprovedSourceConfig,createStockSourceHandler,createStockSourceDependencies
} from "../supabase/functions/code3-stock-source-intake/core.mjs";
import {createStockIntelHandler} from "../supabase/functions/code3-stock-intel-feed/core.mjs";

const API="https://gxsfququorfczvhrkudl.supabase.co/functions/v1/code3-stock-source-intake";
const URL="https://www.target.com/p/hoc2/A-1012850572";
const NOW=Date.parse("2026-11-24T20:00:00.000Z");
const NOW_ISO=new Date(NOW).toISOString();
const SECRET="stock-integration-fixture-not-a-real-credential-0001";
const STOCK_EVENT={
  kind:"stock",eventId:"retailer-msg-0001",sku:"1012850572",signalType:"available_now",
  observedAt:new Date(NOW-20000).toISOString(),productUrl:URL,
};
const INBOUND_EVENT={
  kind:"inbound",eventId:"asn-0001",sku:"1012850572",stage:"in_warehouse",
  evidenceType:"warehouse_putaway",observedAt:new Date(NOW-20000).toISOString(),
  productUrl:URL,
};
function configured({mode="official-api",publishStock=true,inboundStages=["in_warehouse"],approved=true}={}){
  return parseApprovedSourceConfig(JSON.stringify([{
    id:"target-owned-feed",retailer:"Target",mode,agreementRef:"contract-001",
    approved,secretEnv:"CODE3_STOCK_HMAC_TARGET_TEST",publishStock,inboundStages
  }]),()=>SECRET);
}
async function request(event,{sourceId="target-owned-feed",secret=SECRET,stamp=Math.floor(NOW/1000),body,signature,headers}={}){
  const raw=body??JSON.stringify(event);
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signed=await crypto.subtle.sign("HMAC",key,
    new TextEncoder().encode(sourceId+"\n"+stamp+"\n"+raw));
  const hex=[...new Uint8Array(signed)].map(n=>n.toString(16).padStart(2,"0")).join("");
  return new Request(API,{
    method:"POST",headers:{
      "Content-Type":"application/json",
      "x-code3-source-id":sourceId,"x-code3-timestamp":String(stamp),
      "x-code3-signature":signature??"v1="+hex,...headers
    },body:raw
  });
}
function backend(options={}){
  const savedStock=new Map(),savedInbound=new Map();
  const source={
    retailer:"Target",mode:options.mode||"official-api",
    connected:options.connected??true,last_success_at:options.lastSuccessAt??NOW_ISO,
  };
  const product={
    id:"00000000-0000-4000-8000-000000000002",
    retailer:"Target",external_id:"1012850572",url:URL
  };
  const actions=[];
  const save=(kind,rows)=>async record=>{
    actions.push(kind);
    if(rows.has(record.event_key))return {duplicate:true};
    const id="00000000-0000-4000-8000-"+String(rows.size+1).padStart(12,"0");
    rows.set(record.event_key,{...record,id});return{id};
  };
  const handler=createStockSourceHandler({
    registrations:options.registrations||configured({mode:source.mode}),
    getSource:async()=>source,
    getProduct:async()=>options.product??product,
    getTarget:async()=>options.watched??true,
    saveStock:save("stock",savedStock),
    saveInbound:save("inbound",savedInbound),
    clock:()=>NOW
  });
  return {handler,savedStock,savedInbound,actions,source,product};
}
test("A signed official observation reaches private storage and the public-safe feed",async()=>{
  const db=backend();
  const res=await db.handler(await request(STOCK_EVENT));
  assert.equal(res.status,201);
  assert.deepEqual(await res.json(),{status:"accepted",kind:"stock",published:true});
  const saved=[...db.savedStock.values()][0];
  assert.equal(saved.retailer,"Target");
  assert.equal(saved.product_id,db.product.id);
  assert.equal(saved.signal_type,"available_now");
  assert.equal(saved.evidence_level,"official");
  assert.equal(saved.source_type,"official_api");
  assert.match(saved.event_key,/^[a-f0-9]{64}$/);
  assert.equal(saved.source_url,URL);
  const publicView=async()=>({
    version:1,generatedAt:NOW_ISO,
    sources:[{retailer:"Target",mode:"official-api",connected:true,lastSuccessAt:NOW_ISO}],
    targets:[{retailer:"Target",sku:"1012850572",name:"Pokémon Night",url:URL}],
    discoveryWatches:[],
    signals:[{
      id:saved.id,retailer:saved.retailer,signalType:saved.signal_type,
      evidenceLevel:saved.evidence_level,sourceType:saved.source_type,headline:saved.headline,
      sourceUrl:saved.source_url,productUrl:URL,sku:"1012850572",product:"Pokémon Night",
      observedAt:saved.observed_at,expiresAt:saved.expires_at,
      created_by:"should-be-removed",raw_payload:{warehouseQuantity:50000}
    }]
  });
  const feed=createStockIntelHandler({load:publicView,clock:()=>NOW});
  const visible=await feed(new Request("https://example.test/code3-stock-intel-feed"));
  assert.equal(visible.status,200);
  const body=await visible.json();
  assert.equal(body.signals.length,1);
  assert.equal(body.signals[0].signalType,"available_now");
  assert.equal(body.signals[0].evidenceLevel,"official");
  assert.ok(!JSON.stringify(body).includes("50000"));
  assert.ok(!JSON.stringify(body).includes("created_by"));
  assert.ok(!JSON.stringify(body).includes("raw_payload"));
});
test("Replays with a new signed timestamp are deduplicated by stable event identity",async()=>{
  const db=backend();
  assert.equal((await db.handler(await request(STOCK_EVENT))).status,201);
  const retried=await db.handler(await request(STOCK_EVENT,{stamp:Math.floor(NOW/1000)+120}));
  assert.equal(retried.status,200);
  assert.equal((await retried.json()).status,"duplicate");
  assert.equal(db.savedStock.size,1);
});
test("Bad signatures, unknown sources, old signatures and browser origins cannot write",async()=>{
  const db=backend();
  const cases=[
    request(STOCK_EVENT,{secret:"wrong-integration-fixture-secret-000000"}),
    request(STOCK_EVENT,{sourceId:"unknown-source"}),
    request(STOCK_EVENT,{stamp:Math.floor(NOW/1000)-900}),
    request(STOCK_EVENT,{headers:{origin:"https://code3tcg.app"}})
  ];
  const statuses=[];
  for(const pending of cases){const res=await db.handler(await pending);statuses.push(res.status);}
  assert.deepEqual(statuses,[401,401,401,405]);
  assert.equal(db.savedStock.size,0);
  assert.equal(db.actions.length,0);
});
test("Tampering with an event after signing causes authentication failure",async()=>{
  const db=backend();
  const valid=await request(STOCK_EVENT);
  const headers=new Headers(valid.headers);
  const raw=JSON.stringify({...STOCK_EVENT,signalType:"possible_drop"});
  const tampered=new Request(API,{method:"POST",headers,body:raw});
  assert.equal((await db.handler(tampered)).status,401);
  assert.equal(db.savedStock.size,0);
});
test("Non-connected and overdue sources cannot claim live inventory",async()=>{
  for(const options of [{connected:false},{lastSuccessAt:new Date(NOW-20*60000).toISOString()}]){
    const db=backend(options);
    const result=await db.handler(await request(STOCK_EVENT));
    assert.equal(result.status,503);
    assert.equal(db.savedStock.size,0);
  }
});
test("Unwatched SKUs, mismatched product URLs, and foreign retailer pages are rejected",async()=>{
  const missing=backend({watched:false});
  assert.equal((await missing.handler(await request(STOCK_EVENT))).status,422);
  const wrongUrl=backend();
  const other={...STOCK_EVENT,productUrl:"https://www.target.com/p/hoc2/A-1012850573"};
  assert.equal((await wrongUrl.handler(await request(other))).status,422);
  const hostile=backend();
  const attacker={...STOCK_EVENT,productUrl:"https://target.com.attacker.example/stock"};
  assert.equal((await hostile.handler(await request(attacker))).status,422);
  assert.equal(hostile.savedStock.size,0);
});
test("Partner feeds can report leads but never confirm purchasability",async()=>{
  const db=backend({mode:"authorized-feed",registrations:configured({mode:"authorized-feed"})});
  const result=await db.handler(await request(STOCK_EVENT));
  assert.equal(result.status,201);
  const saved=[...db.savedStock.values()][0];
  assert.equal(saved.signal_type,"reported_stock");
  assert.equal(saved.evidence_level,"reported");
  assert.equal(saved.source_type,"retailer_notice");
});
test("A private inbound putaway record does not publish an available-stock signal",async()=>{
  const db=backend();
  const response=await db.handler(await request(INBOUND_EVENT));
  assert.equal(response.status,201);
  assert.equal((await response.json()).published,false);
  const saved=[...db.savedInbound.values()][0];
  assert.equal(saved.stage,"in_warehouse");
  assert.equal(saved.source_type,"retailer_notice");
  assert.equal(saved.evidence_level,"verified");
  assert.equal(saved.product_id,db.product.id);
  assert.equal(db.savedStock.size,0);
  assert.ok(!JSON.stringify(saved).includes("warehouseQuantity"));
});
test("Warehouse stages require the correct authorized evidence and stage allowlist",async()=>{
  const db=backend();
  const mismatch={...INBOUND_EVENT,evidenceType:"advance_shipping_notice"};
  assert.equal((await db.handler(await request(mismatch))).status,403);
  const unauthorized={...INBOUND_EVENT,stage:"ordered",evidenceType:"purchase_order"};
  assert.equal((await db.handler(await request(unauthorized))).status,403);
  const invented={...INBOUND_EVENT,stage:"in_warehouse",evidenceType:"shopify_stock"};
  assert.equal((await db.handler(await request(invented))).status,403);
  assert.equal(db.savedInbound.size,0);
});
test("No publishing permission, unknown fields, false data and oversized messages fail closed",async()=>{
  const noPublish=backend({registrations:configured({publishStock:false})});
  assert.equal((await noPublish.handler(await request(STOCK_EVENT))).status,403);
  const db=backend();
  const withQuantity={...STOCK_EVENT,warehouseQuantity:40000};
  assert.equal((await db.handler(await request(withQuantity))).status,400);
  const stale={...STOCK_EVENT,observedAt:new Date(NOW-3600*1000).toISOString()};
  assert.equal((await db.handler(await request(stale))).status,400);
  const future={...STOCK_EVENT,observedAt:new Date(NOW+1000).toISOString()};
  assert.equal((await db.handler(await request(future))).status,400);
  const oversized=JSON.stringify({...STOCK_EVENT,signalType:"available_now",extra:"x".repeat(5000)});
  assert.equal((await db.handler(await request(STOCK_EVENT,{body:oversized}))).status,413);
  assert.equal(db.actions.length,0);
});
test("Configuration cannot enable a source without approval, agreement or strong secret",()=>{
  assert.throws(()=>configured({approved:false}),/Invalid private source/);
  assert.throws(()=>parseApprovedSourceConfig(JSON.stringify([{
    id:"fake",retailer:"Target",mode:"official-api",approved:true,agreementRef:"contract-1",
    secretEnv:"CODE3_STOCK_HMAC_TARGET_TEST",publishStock:true,inboundStages:[]
  }]),()=>"short"),/secret unavailable/);
  assert.equal(parseApprovedSourceConfig("",()=>SECRET).size,0);
  assert.throws(()=>parseApprovedSourceConfig("{oops",()=>SECRET),/Invalid private source/);
});
test("Data-access helpers use strict server-only queries and store only permitted fields",async()=>{
  const traces=[];
  const server=({url,method,body})=>{
    traces.push({url,method,body:body&&JSON.parse(body)});
    if(method==="GET")return {ok:true,json:async()=>[{id:"ok"}]};
    return {ok:true,status:201,json:async()=>[{id:"00000000-0000-4000-8000-000000000010"}]};
  };
  const deps=createStockSourceDependencies({
    project:"https://gxsfququorfczvhrkudl.supabase.co",serviceKey:"fixture-service-key",
    fetchImpl:async(u,opts)=>server({url:String(u),method:opts.method,body:opts.body})
  });
  assert.equal(await deps.getTarget("Target","1012850572"),true);
  assert.equal((await deps.saveStock({retailer:"Target",event_key:"x"})).id,"00000000-0000-4000-8000-000000000010");
  assert.ok(traces[0].url.includes("retailer_monitor_targets"));
  assert.ok(traces[0].url.includes("enabled=eq.true"));
  assert.ok(!JSON.stringify(traces).includes("fixture-service-key"));
});
