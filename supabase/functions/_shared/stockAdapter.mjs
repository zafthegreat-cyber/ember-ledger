import {RETAILER_NAMES,SIGNAL_KINDS,parseStockIntelligence,sourceHealth} from "./stockContract.mjs";

// A pure adapter boundary, not a connected source, scraper, scheduler or webhook.
// Registration comes from server-controlled configuration after permission review.
export function createApprovedStockAdapter(registration) {
  if(!registration || !RETAILER_NAMES.includes(registration.retailer) ||
      !["official-api","authorized-feed"].includes(registration.mode) ||
      registration.approved!==true || !/^[A-Za-z0-9_-]{3,64}$/.test(registration.id||"") ||
      !/^[A-Za-z0-9_-]{3,96}$/.test(registration.agreementRef||""))
    throw new Error("Approved source registration required");
  const config=Object.freeze({...registration});
  return async function normalize(event,{now=Date.now(),lastSuccessAt}={}) {
    if(!event || !/^[A-Za-z0-9_-]{1,96}$/.test(event.eventId||"") ||
        !Object.hasOwn(SIGNAL_KINDS,event.signalType) || typeof event.sku!=="string" ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(event.sku))throw new Error("Invalid adapter observation");
    const source={retailer:config.retailer,mode:config.mode,connected:true,lastSuccessAt};
    if(!sourceHealth(source,now).healthy)throw new Error("Successful source validation required");
    const observedAt=Date.parse(event.observedAt);
    if(!Number.isFinite(observedAt)||observedAt>now || now-observedAt>15*60_000)
      throw new Error("Fresh source observation required");
    // A forwarded/community lead can never become official purchase availability.
    const official=config.mode==="official-api";
    const signalType=!official&&event.signalType==="available_now"?"reported_stock":event.signalType;
    if(signalType.startsWith("queue_")&&config.retailer!=="Pokémon Center")throw new Error("Unsupported queue source");
    const headline=SIGNAL_KINDS[signalType].label+" at "+config.retailer;
    const signal={
      id:"00000000-0000-4000-8000-000000000001",retailer:config.retailer,sku:event.sku,
      signalType,evidenceLevel:official?"official":"reported",
      sourceType:official?"official_api":"retailer_notice",headline,
      sourceUrl:event.productUrl,productUrl:event.productUrl,product:null,
      observedAt:new Date(observedAt).toISOString(),expiresAt:new Date(observedAt+15*60_000).toISOString()
    };
    const checked=parseStockIntelligence({version:1,generatedAt:new Date(now).toISOString(),sources:[source],targets:[],signals:[signal],discoveryWatches:[]},now);
    if(checked.signals.length!==1)throw new Error("Observation already expired");
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode([config.id,config.retailer,event.sku,event.eventId].join("|")));
    const eventKey=[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,"0")).join("");
    // Identity, raw text, quantities, warehouse details and authorization never come from event data.
    const {id:ignored,...projection}=checked.signals[0];
    return {eventKey,...projection};
  };
}
