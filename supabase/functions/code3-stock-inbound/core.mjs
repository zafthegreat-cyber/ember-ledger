const PROJECT='https://gxsfququorfczvhrkudl.supabase.co';
const RETAILERS=Object.freeze(["Target","Walmart","Pokémon Center","Best Buy","Sam's Club","Costco"]);
export const INBOUND_STAGES=Object.freeze({
  ordered: "Ordered",
  en_route: "En route to warehouse",
  arrived_warehouse: "Arrived at warehouse",
  in_warehouse: "In warehouse",
  warehouse_processing: "Warehouse processing",
  allocated: "Allocated for distribution",
  distribution_en_route: "En route to stores",
  retail_available: "Retail availability reported",
  delayed: "Delayed",
  unknown: "Unknown",
});
const TTL_MINUTES=Object.freeze({
  ordered:10080,en_route:2880,arrived_warehouse:1440,in_warehouse:10080,
  warehouse_processing:2880,allocated:2880,distribution_en_route:1440,
  retail_available:15,delayed:4320,unknown:720,
});
const allowedOrigins=new Set([
  "https://code3tcg.app","https://code3.anchorandwingllc.com",
  "https://code3tcg.anchorandwingllc.com","http://localhost:5173"
]);
const headersFor=origin=>({
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff",
  ...(origin?{
    "Access-Control-Allow-Origin":origin,
    "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
    "Vary":"Origin"
  }:{})
});
function reply(status,body,origin=null){return new Response(JSON.stringify(body),{status,headers:headersFor(origin)});}
async function sha(value){
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
export function createInboundHandler({authorize,list,findProduct,save,clock=()=>new Date()}) {
  return async req=>{
    const requestOrigin=req.headers.get("origin");
    const origin=requestOrigin&&allowedOrigins.has(requestOrigin)?requestOrigin:null;
    if(requestOrigin&&!origin)return reply(403,{error:"Origin not allowed"});
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{
      ...headersFor(origin),"Access-Control-Max-Age":"600"
    }});
    if(!["GET","POST"].includes(req.method))return reply(405,{error:"Unsupported method"},origin);
    const url=new URL(req.url);
    if(url.search||!/^\/(?:functions\/v1\/)?code3-stock-inbound$/.test(url.pathname))
      return reply(400,{error:"Unsupported request"},origin);
    const auth=req.headers.get("authorization")||"";
    const match=/^Bearer ([A-Za-z0-9._-]{50,4096})$/.exec(auth);
    if(!match)return reply(401,{error:"Sign in required"},origin);
    const actor=await authorize(match[1]).catch(()=>null);
    if(!actor?.id||actor.admin!==true)return reply(403,{error:"Staff access required"},origin);
    if(req.method==="GET"){
      try{
        const records=await list();
        if(!Array.isArray(records)||records.length>40)throw new Error("Data error");
        const events=records.map(x=>({
          id:x.id,retailer:x.retailer,stage:x.stage,headline:x.summary,
          evidenceLevel:x.evidence_level,sourceType:x.source_type,
          observedAt:x.observed_at,expiresAt:x.expires_at,
          sku:x.retailer_products?.external_id||"",product:x.retailer_products?.name||""
        }));
        return reply(200,{version:1,events},origin);
      }catch{return reply(503,{error:"Warehouse records unavailable"},origin);}
    }
    let input;
    try{
      if(Number(req.headers.get("content-length")||0)>4096)throw new Error();
      const body=await req.text();
      if(body.length>4096)throw new Error();
      input=JSON.parse(body);
    }catch{return reply(400,{error:"Invalid warehouse report"},origin);}
    if(!input||typeof input!=="object"||Array.isArray(input))
      return reply(400,{error:"Invalid warehouse report"},origin);
    const {retailer,sku="",stage,headline}=input;
    if(!RETAILERS.includes(retailer)||!Object.hasOwn(INBOUND_STAGES,stage)||
        typeof sku!=="string"||(sku&&!/^[A-Za-z0-9_-]{1,64}$/.test(sku))||
        typeof headline!=="string"||headline.trim().length<8||headline.length>180)
      return reply(400,{error:"Check retailer, stage, SKU and headline"},origin);
    const product=sku?await findProduct(retailer,sku).catch(()=>null):null;
    if(sku&&!product?.id)return reply(422,{error:"Add SKU to the approved product watchlist first"},origin);
    const now=clock();
    const eventKey=await sha([actor.id,retailer,sku,stage,Math.floor(now.getTime()/1800000)].join("|"));
    const item={
      retailer,product_id:product?.id||null,
      stage,summary:headline.trim(),
      evidence_level:"reported",source_type:"staff_report",
      observed_at:now.toISOString(),
      expires_at:new Date(now.getTime()+TTL_MINUTES[stage]*60000).toISOString(),
      created_by:actor.id,event_key:eventKey
    };
    try{
      const record=await save(item);
      if(record?.duplicate)return reply(409,{error:"This stage was already recorded recently"},origin);
      if(!record?.id)return reply(503,{error:"Warehouse report could not be saved"},origin);
      return reply(201,{ok:true,id:record.id,evidenceLevel:"reported",expiresAt:item.expires_at},origin);
    }catch{return reply(503,{error:"Warehouse report could not be saved"},origin);}
  };
}
export function createInboundDependencies({project,key,anon,fetchImpl=fetch}){
  if(project!==PROJECT||!key||!anon)throw new Error("Inbound credentials unavailable");
  const serviceHeaders={apikey:key,Authorization:"Bearer "+key};
  const doFetch=async(url,opts)=>{
    const res=await fetchImpl(url,{redirect:"error",signal:AbortSignal.timeout(8000),...opts});
    return res;
  };
  return {
    authorize:async token=>{
      const userResp=await doFetch(PROJECT+"/auth/v1/user",{method:"GET",headers:{apikey:anon,Authorization:"Bearer "+token}});
      if(!userResp.ok)return null;
      const user=await userResp.json();
      if(!/^[a-f0-9-]{36}$/i.test(user.id||"")||user.is_anonymous)return null;
      const roleResp=await doFetch(PROJECT+"/rest/v1/profiles?select=app_role,user_role&id=eq."+encodeURIComponent(user.id)+"&limit=1",{method:"GET",headers:serviceHeaders});
      if(!roleResp.ok)return null;
      const roles=await roleResp.json();
      return {id:user.id,admin:roles.length===1&&roles[0].app_role==="admin"&&roles[0].user_role==="admin"};
    },
    findProduct:async(retailer,sku)=>{
      const url=PROJECT+"/rest/v1/retailer_products?select=id&retailer=eq."+encodeURIComponent(retailer)+"&external_id=eq."+encodeURIComponent(sku)+"&limit=1";
      const response=await doFetch(url,{method:"GET",headers:serviceHeaders});
      if(!response.ok)throw new Error("Product unavailable");
      return(await response.json())[0]||null;
    },
    list:async()=>{
      const url=PROJECT+"/rest/v1/retailer_inbound_events?select=id,retailer,stage,summary,observed_at,expires_at,evidence_level,source_type,retailer_products(external_id,name)&order=observed_at.desc&limit=40";
      const response=await doFetch(url,{method:"GET",headers:serviceHeaders});
      if(!response.ok)throw new Error("Events unavailable");
      return response.json();
    },
    save:async item=>{
      const response=await doFetch(PROJECT+"/rest/v1/retailer_inbound_events?select=id",{
        method:"POST",headers:{...serviceHeaders,"Content-Type":"application/json","Prefer":"return=representation"},
        body:JSON.stringify(item)
      });
      if(response.status===409)return {duplicate:true};
      if(!response.ok)throw new Error("Insert failure");
      return(await response.json())[0]||null;
    }
  };
}