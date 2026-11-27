import {stockProjectOrigin} from "../_shared/stockProject.mjs";
import {createApprovedStockAdapter} from "../_shared/stockAdapter.mjs";
import {RETAILER_NAMES,sourceHealth} from "../_shared/stockContract.mjs";

const MAX_BODY=4096;
const MAX_SKEW=300000;
const SKU=/^[A-Za-z0-9_-]{1,64}$/u;
const EVENT_ID=/^[A-Za-z0-9_-]{1,96}$/u;
const SOURCE_ID=/^[A-Za-z0-9_-]{3,64}$/u;
const AGREEMENT=/^[A-Za-z0-9_-]{3,96}$/u;
const HEX=/^v1=[0-9a-f]{64}$/u;
const EVIDENCE={
  ordered:"purchase_order",
  en_route:"advance_shipping_notice",
  arrived_warehouse:"receiving_confirmation",
  in_warehouse:"warehouse_putaway",
  warehouse_processing:"receiving_activity",
  allocated:"distribution_allocation",
  distribution_en_route:"outbound_shipping_notice",
  retail_available:"retailer_availability_notice",
  delayed:"shipping_exception",
};
const STAGE_TTL_MIN={
  ordered:10080,en_route:2880,arrived_warehouse:1440,in_warehouse:10080,
  warehouse_processing:2880,allocated:2880,distribution_en_route:1440,
  retail_available:15,delayed:4320,
};
const respond=(status,body)=>new Response(JSON.stringify(body),{
  status,headers:{"Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"},
});
const validKeys=(value,allowed)=>value&&typeof value==="object"&&!Array.isArray(value)&&
  Object.keys(value).every(k=>allowed.includes(k));
const inRange=(date,now)=>Number.isFinite(date)&&date<=now&&now-date<=15*60000;
const hexToBytes=hex=>Uint8Array.from(hex.match(/.{2}/g),x=>parseInt(x,16));

async function boundedBody(request){
  if(Number(request.headers.get("content-length")||0)>MAX_BODY)throw Error("oversize");
  const reader=request.body?.getReader();
  if(!reader)throw Error("missing body");
  const chunks=[];let total=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>MAX_BODY)throw Error("oversize");
      chunks.push(value);
    }
  }finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(total);let off=0;
  for(const chunk of chunks){bytes.set(chunk,off);off+=chunk.byteLength;}
  return new TextDecoder("utf-8",{fatal:true}).decode(bytes);
}
async function verifySignature({secret,sourceId,timestamp,body,signature}){
  if(!HEX.test(signature||"")||typeof secret!=="string"||secret.length<32)return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),
    {name:"HMAC",hash:"SHA-256"},false,["verify"]);
  return crypto.subtle.verify("HMAC",key,hexToBytes(signature.slice(3)),
    new TextEncoder().encode(sourceId+"\n"+timestamp+"\n"+body));
}
async function eventHash(sourceId,sku,eventId){
  const digest=await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode([sourceId,sku,eventId].join("|")));
  return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
function sameProductUrl(one,two){
  try{
    const a=new URL(one),b=new URL(two);
    return a.protocol==="https:"&&a.hostname===b.hostname&&
      a.pathname.replace(/\/+$/u,"")===b.pathname.replace(/\/+$/u,"");
  }catch{return false;}
}

// Configuration must be provisioned by staff and stored as encrypted Edge secrets.
// Nothing in the incoming request can authorize a source or extend its capabilities.
export function parseApprovedSourceConfig(raw,resolveSecret){
  if(!raw)return new Map();
  let registrations;
  try{registrations=JSON.parse(raw);}catch{throw Error("Invalid private source configuration");}
  if(!Array.isArray(registrations)||registrations.length>24)
    throw Error("Invalid private source configuration");
  const result=new Map();
  for(const entry of registrations){
    const originKind=entry?.originKind||"retailer";
    if(!entry||!["retailer","supplier","discord"].includes(originKind)||
      (originKind==="discord"&&(entry.mode!=="authorized-feed"||
        !Array.isArray(entry.inboundStages)||entry.inboundStages.length!==0))||
      !SOURCE_ID.test(entry.id||"")||
      !RETAILER_NAMES.includes(entry.retailer)||
      !["official-api","authorized-feed"].includes(entry.mode)||
      entry.approved!==true||!AGREEMENT.test(entry.agreementRef||"")||
      !/^CODE3_STOCK_HMAC_[A-Z0-9_]{3,50}$/u.test(entry.secretEnv||"")||
      !Array.isArray(entry.inboundStages)||entry.inboundStages.length>9||
      !entry.inboundStages.every(x=>Object.hasOwn(EVIDENCE,x))||
      new Set(entry.inboundStages).size!==entry.inboundStages.length||
      typeof entry.publishStock!=="boolean"||result.has(entry.id))
      throw Error("Invalid private source configuration");
    const secret=resolveSecret(entry.secretEnv);
    if(typeof secret!=="string"||secret.length<32||secret.length>256)
      throw Error("Source signature secret unavailable");
    result.set(entry.id,Object.freeze({...entry,originKind,inboundStages:Object.freeze([...entry.inboundStages]),secret}));
  }
  return result;
}

export function createStockSourceHandler({
  registrations,getSource,getProduct,getTarget,saveStock,saveInbound,
  clock=()=>Date.now(),
}){
  if(!(registrations instanceof Map))throw TypeError("Private registrations required");
  return async request=>{
    if(request.method!=="POST"||request.headers.has("origin")||request.url.includes("?"))
      return respond(405,{error:"Private source ingestion accepts signed server POST only"});
    const pathname=new URL(request.url).pathname;
    if(!/^\/(?:functions\/v1\/)?code3-stock-source-intake$/u.test(pathname))
      return respond(404,{error:"Not found"});
    const sourceId=request.headers.get("x-code3-source-id");
    const timestamp=request.headers.get("x-code3-timestamp");
    const signature=request.headers.get("x-code3-signature");
    const now=clock();
    if(!SOURCE_ID.test(sourceId||"")||!/^\d{10}$/u.test(timestamp||"")||
      !Number.isFinite(now)||Math.abs(now-Number(timestamp)*1000)>MAX_SKEW)
      return respond(401,{error:"Source authentication failed"});
    const registration=registrations.get(sourceId);
    if(!registration)return respond(401,{error:"Source authentication failed"});
    if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type")||"")||
      request.headers.get("content-encoding"))
      return respond(415,{error:"JSON source payload required"});
    let raw;
    try{raw=await boundedBody(request);}catch{return respond(413,{error:"Source payload rejected"});}
    if(!await verifySignature({secret:registration.secret,sourceId,timestamp,body:raw,signature}))
      return respond(401,{error:"Source authentication failed"});
    let event;
    try{event=JSON.parse(raw);}catch{return respond(400,{error:"Invalid source observation"});}
    const kind=event?.kind;
    const keys=kind==="stock"
      ?["kind","eventId","sku","observedAt","signalType","productUrl"]
      :["kind","eventId","sku","observedAt","stage","evidenceType","productUrl"];
    if(!["stock","inbound"].includes(kind)||!validKeys(event,keys)||
      !EVENT_ID.test(event.eventId||"")||!SKU.test(event.sku||"")||
      typeof event.productUrl!=="string"||typeof event.observedAt!=="string"||
      !inRange(Date.parse(event.observedAt),now))
      return respond(400,{error:"Invalid source observation"});
    if(kind==="stock"&&!registration.publishStock)
      return respond(403,{error:"Public source publication not approved"});
    if(kind==="inbound"&&(!registration.inboundStages.includes(event.stage)||
      EVIDENCE[event.stage]!==event.evidenceType))
      return respond(403,{error:"Inbound evidence type not authorized"});
    let source,product,watched;
    try{
      [source,product,watched]=await Promise.all([
        getSource(registration.retailer),getProduct(registration.retailer,event.sku),
        getTarget(registration.retailer,event.sku)
      ]);
    }catch{return respond(503,{error:"Source validation unavailable"});}
    if(!source||source.retailer!==registration.retailer||source.mode!==registration.mode||
      !sourceHealth({retailer:source.retailer,mode:source.mode,connected:source.connected,
        lastSuccessAt:source.last_success_at},now).healthy)
      return respond(503,{error:"Source has not passed current validation"});
    if(!product?.id||product.retailer!==registration.retailer||
      product.external_id!==event.sku||!sameProductUrl(product.url,event.productUrl)||
      watched!==true)
      return respond(422,{error:"Product must match an enabled verified watch target"});
    if(kind==="stock"){
      let normalized;
      try{
        const adapter=createApprovedStockAdapter(registration);
        normalized=await adapter(event,{now,lastSuccessAt:source.last_success_at});
      }catch{return respond(400,{error:"Source observation failed validation"});}
      const record={
        retailer:registration.retailer,product_id:product.id,
        signal_type:normalized.signalType,evidence_level:normalized.evidenceLevel,
        source_type:normalized.sourceType,headline:normalized.headline,
        source_url:product.url,event_key:normalized.eventKey,
        observed_at:normalized.observedAt,expires_at:normalized.expiresAt,
      };
      try{
        const saved=await saveStock(record);
        if(saved?.duplicate)return respond(200,{status:"duplicate",published:false});
        if(!saved?.id)throw Error("No receipt");
        // The public read-only feed can display this observation. No push or Discord send.
        return respond(201,{status:"accepted",kind:"stock",published:true});
      }catch{return respond(503,{error:"Could not persist source observation"});}
    }
    const record={
      retailer:registration.retailer,product_id:product.id,
      stage:event.stage,
      summary:"Authorized source reported "+event.stage.replace(/_/gu," ")+" for "+registration.retailer,
      evidence_level:"verified",
      source_type:registration.mode==="official-api"?"retailer_notice":"authorized_supplier_feed",
      observed_at:new Date(Date.parse(event.observedAt)).toISOString(),
      expires_at:new Date(Date.parse(event.observedAt)+STAGE_TTL_MIN[event.stage]*60000).toISOString(),
      event_key:await eventHash(registration.id,event.sku,event.eventId),
    };
    try{
      const saved=await saveInbound(record);
      if(saved?.duplicate)return respond(200,{status:"duplicate",published:false});
      if(!saved?.id)throw Error("No receipt");
      // Warehouse data never enters the public stock-signal feed.
      return respond(201,{status:"accepted",kind:"inbound",published:false});
    }catch{return respond(503,{error:"Could not persist inbound evidence"});}
  };
}

export function createStockSourceDependencies({project,serviceKey,fetchImpl=fetch}){
  const origin=stockProjectOrigin(project);
  if(!serviceKey)throw Error("Private storage credentials not configured");
  const headers={apikey:serviceKey,Authorization:"Bearer "+serviceKey};
  async function rows(resource,params){
    const url=new URL(origin+"/rest/v1/"+resource);
    for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
    const response=await fetchImpl(url,{method:"GET",headers,redirect:"error",signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error("Private source read failed");
    const parsed=await response.json();
    if(!Array.isArray(parsed))throw Error("Private source read failed");
    return parsed;
  }
  async function write(table,record){
    const response=await fetchImpl(origin+"/rest/v1/"+table+"?select=id",{
      method:"POST",headers:{...headers,"Content-Type":"application/json","Prefer":"return=representation"},
      redirect:"error",signal:AbortSignal.timeout(8000),body:JSON.stringify(record)
    });
    if(response.status===409)return {duplicate:true};
    if(!response.ok)throw Error("Private source write failed");
    const result=await response.json();
    return Array.isArray(result)&&result.length===1?result[0]:null;
  }
  return {
    getSource:async retailer=>(await rows("retailer_intel_sources",{
      select:"retailer,mode,connected,last_success_at",retailer:"eq."+retailer,limit:"1"
    }))[0]||null,
    getProduct:async(retailer,sku)=>(await rows("retailer_products",{
      select:"id,retailer,external_id,url",retailer:"eq."+retailer,external_id:"eq."+sku,limit:"1"
    }))[0]||null,
    getTarget:async(retailer,sku)=>Boolean((await rows("retailer_monitor_targets",{
      select:"id",retailer:"eq."+retailer,enabled:"eq.true",
      or:"(external_id.eq."+sku+",sku.eq."+sku+")",limit:"1"
    })).length),
    saveStock:record=>write("retailer_intelligence_signals",record),
    saveInbound:record=>write("retailer_inbound_events",record),
  };
}
