import {stockProjectOrigin} from "../_shared/stockProject.mjs";
import {stockStaffAuthorizer,stockAllowedOrigins} from "../_shared/stockStaff.mjs";
const retailers = {
  Target: "target.com",
  Walmart: "walmart.com",
  "Pokémon Center": "pokemoncenter.com",
  "Best Buy": "bestbuy.com",
  "Sam's Club": "samsclub.com",
  Costco: "costco.com",
};
const ttl = {
  reported_stock: 90, available_now: 15, out_of_stock: 30, possible_drop: 120,
  queue_detected: 20, queue_ended: 20, raffle_open: 360, new_listing: 1440,
};
const allowedOrigins=stockAllowedOrigins();
function corsFor(req,origins) {
  const origin = req.headers.get("origin");
  return origin && origins.has(origin) ? origin : null;
}
const json = (status,body,origin) => new Response(JSON.stringify(body), {
  status,headers:{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff",
    ...(origin ? {
      "Access-Control-Allow-Origin":origin,
      "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods":"POST, OPTIONS",
      "Vary":"Origin",
    } : {}),
  },
});
function validUrl(raw,retailer) {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  try {
    const u=new URL(raw);
    if (u.protocol!=="https:"||u.username||u.password) return null;
    const host=u.hostname.toLowerCase(), retailerDomain=retailers[retailer];
    const official=host===retailerDomain||host.endsWith("."+retailerDomain);
    // Approved-channel intake is a separate, private integration.
    if (!official) return null;
    return {url:u.href,official};
  } catch {return null;}
}
async function digest(value) {
  const result=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(result)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export function createReviewHandler({authorize,findProduct,write,clock=()=>new Date(),origins=allowedOrigins}) {
  return async (req) => {
    const origin=corsFor(req,origins);
    if (req.headers.has("origin")&&!origin) return json(403,{error:"Origin not allowed"},null);
    if (req.method==="OPTIONS") return new Response(null,{status:204,headers:{
      "Access-Control-Allow-Origin":origin||"null",
      "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Max-Age":"600","Vary":"Origin",
    }});
    if (req.method!=="POST") return json(405,{error:"Use POST"},origin);
    const requestUrl=new URL(req.url);
    if(requestUrl.search||!/^\/(?:functions\/v1\/)?code3-stock-intel-review$/.test(requestUrl.pathname)) return json(400,{error:"Unsupported request"},origin);
    const header=req.headers.get("authorization")||"";
    const match=/^Bearer ([A-Za-z0-9._-]{50,4096})$/.exec(header);
    if (!match) return json(401,{error:"Sign in required"},origin);
    const actor=await authorize(match[1]).catch(()=>null);
    if (!actor?.id || actor.admin!==true) return json(403,{error:"Staff review required"},origin);
    let input;
    try {
      if (Number(req.headers.get("content-length")||0)>4096) throw Error();
      const body=await req.text();
      if (body.length>4096) throw Error();
      input=JSON.parse(body);
    } catch {return json(400,{error:"Invalid review request"},origin);}
    if (!input||typeof input!=="object"||Array.isArray(input)) return json(400,{error:"Invalid review request"},origin);
    const {retailer,sku="",signalType,evidence,headline,sourceUrl}=input;
    if (!Object.hasOwn(retailers,retailer)||!Object.hasOwn(ttl,signalType)||
        !["reported","admin_checked"].includes(evidence) ||
        typeof headline!=="string"||headline.trim().length<8||headline.length>180||
        typeof sku!=="string"||(sku&&!/^[A-Za-z0-9_-]{1,64}$/.test(sku)) ||
        (!sku&&!["possible_drop","queue_detected","queue_ended","raffle_open"].includes(signalType)) ||
        (signalType.startsWith("queue_")&&retailer!=="Pokémon Center")) {
      return json(400,{error:"Check product, signal, and source fields"},origin);
    }
    const source=validUrl(sourceUrl,retailer);
    if (!source||!source.official||(signalType==="available_now"&&evidence!=="admin_checked")||(evidence==="admin_checked"&&!source.official)) return json(400,{error:"Use the matching retailer URL for a checked claim"},origin);
    const product=sku?await findProduct(retailer,sku).catch(()=>null):null;
    if (sku&&!product?.id) return json(422,{error:"Add this SKU to the approved watchlist first"},origin);
    if(signalType==="available_now") {
      const tracked=validUrl(product?.url,retailer);
      if(!tracked || new URL(tracked.url).pathname!==new URL(source.url).pathname)
        return json(400,{error:"Check availability on this watched product's retailer page"},origin);
    }
    const now=clock(),eventKey=await digest([retailer,sku,signalType,evidence,source.url,Math.floor(now.getTime()/1_800_000)].join("|"));
    const item={
      retailer,product_id:product?.id||null,
      signal_type:signalType,evidence_level:evidence,source_type:"admin_review",
      headline:headline.trim(),source_url:source.url,event_key:eventKey,
      observed_at:now.toISOString(),expires_at:new Date(now.getTime()+ttl[signalType]*60_000).toISOString(),
      created_by:actor.id,
    };
    const saved=await write(item).catch(()=>({error:true}));
    if (saved?.duplicate) return json(409,{error:"A matching signal was already reviewed recently"},origin);
    if (!saved?.id||saved.error) return json(503,{error:"Review could not be saved"},origin);
    return json(201,{ok:true,id:saved.id,expiresAt:item.expires_at,evidenceLevel:evidence},origin);
  };
}
export function createDependencies({project,key,anon,fetchImpl=fetch}) {
  const origin=stockProjectOrigin(project);
  if (!key||!anon) throw new Error("Service configuration unavailable");
  const serviceHeaders={"apikey":key,"Authorization":"Bearer "+key};
  return {
    authorize:stockStaffAuthorizer({project,anon,fetchImpl}),
    findProduct:async (retailer,sku)=>{
      const url=origin+"/rest/v1/retailer_products?select=id,url&retailer=eq."+encodeURIComponent(retailer)+"&external_id=eq."+encodeURIComponent(sku)+"&limit=1";
      const res=await fetchImpl(url,{method:"GET",redirect:"error",signal:AbortSignal.timeout(8000),headers:serviceHeaders});
      if (!res.ok) throw new Error("Product read failed");
      const rows=await res.json();
      return rows[0]||null;
    },
    write:async item=>{
      const res=await fetchImpl(origin+"/rest/v1/retailer_intelligence_signals?select=id",{
        method:"POST",redirect:"error",signal:AbortSignal.timeout(8000),
        headers:{...serviceHeaders,"Content-Type":"application/json","Prefer":"return=representation"},
        body:JSON.stringify(item),
      });
      if (res.status===409) return {duplicate:true};
      if (!res.ok) throw new Error("Signal write failed");
      const rows=await res.json();
      return rows[0]||null;
    },
  };
}
