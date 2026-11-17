export const INBOUND_API_URL="https://gxsfququorfczvhrkudl.supabase.co/functions/v1/code3-stock-inbound";
export const INBOUND_STAGES=Object.freeze([
  {key:"ordered",label:"Ordered",description:"A purchase order or retailer replenishment order has been reported."},
  {key:"en_route",label:"En route",description:"A reported shipment is moving toward a warehouse."},
  {key:"arrived_warehouse",label:"Arrived",description:"A shipment is reported to have reached a warehouse."},
  {key:"in_warehouse",label:"In warehouse",description:"Inventory is reported as physically stored inside a warehouse."},
  {key:"warehouse_processing",label:"Processing",description:"Receiving, counting or sorting is reportedly underway."},
  {key:"allocated",label:"Allocated",description:"Inventory is reportedly assigned for later distribution."},
  {key:"distribution_en_route",label:"Store transfer",description:"Inventory is reportedly on its way toward stores or fulfillment."},
  {key:"retail_available",label:"Retail availability",description:"An availability report, not necessarily an active checkout."},
  {key:"delayed",label:"Delayed",description:"A reported logistics delay."},
  {key:"unknown",label:"Unknown",description:"No reliable current stage identified."},
]);
const knownStages=new Set(INBOUND_STAGES.map(x=>x.key));
const names=new Set(["Target","Walmart","Pokémon Center","Best Buy","Sam's Club","Costco"]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseInboundEvents(payload,now=Date.now()){
  if(payload?.version!==1||!Array.isArray(payload.events)||payload.events.length>40)
    throw new Error("Warehouse reports unavailable.");
  const events=payload.events.map(record=>{
    if(!uuid.test(record.id)||!names.has(record.retailer)||!knownStages.has(record.stage)||
        !["staff_report","authorized_supplier_feed","retailer_notice"].includes(record.sourceType)||
        !["reported","verified"].includes(record.evidenceLevel)||
        (record.evidenceLevel==="reported") !== (record.sourceType==="staff_report")||
        typeof record.headline!=="string"||record.headline.length<8||record.headline.length>180)
      throw new Error("Invalid warehouse report.");
    const observed=Date.parse(record.observedAt),expires=Date.parse(record.expiresAt);
    if(!Number.isFinite(observed)||!Number.isFinite(expires)||observed>now+60_000||
        expires<=observed||expires>observed+14*86400_000)
      throw new Error("Invalid warehouse report dates.");
    if(record.sku && !/^[A-Za-z0-9_-]{1,64}$/.test(record.sku))throw new Error("Invalid warehouse product.");
    return{
      id:record.id,retailer:record.retailer,stage:record.stage,headline:record.headline,
      evidenceLevel:record.evidenceLevel,sourceType:record.sourceType,
      observedAt:new Date(observed).toISOString(),expiresAt:new Date(expires).toISOString(),
      sku:record.sku||"",product:record.product||"",active:expires>now
    };
  });
  return events;
}
async function requestInbound({accessToken,method,body,fetchImpl=fetch}){
  if(typeof accessToken!=="string"||accessToken.length<20)throw new Error("Staff sign-in is required.");
  const response=await fetchImpl(INBOUND_API_URL,{
    method,credentials:"omit",redirect:"error",cache:"no-store",
    headers:{
      "Content-Type":"application/json",
      "apikey":import.meta.env?.VITE_SUPABASE_ANON_KEY||"",
      "Authorization":"Bearer "+accessToken
    },
    ...(body ? {body:JSON.stringify(body)} : {})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(typeof result.error==="string"?result.error:"Warehouse request failed.");
  return result;
}
export async function loadPrivateInbound({accessToken,fetchImpl,now=Date.now()}={}){
  return parseInboundEvents(await requestInbound({accessToken,method:"GET",fetchImpl}),now);
}
export async function submitPrivateInbound({accessToken,report,fetchImpl}={}){
  const result=await requestInbound({accessToken,method:"POST",body:report,fetchImpl});
  if(result.ok!==true||!uuid.test(result.id||""))throw new Error("Warehouse report could not be confirmed.");
  return result;
}
