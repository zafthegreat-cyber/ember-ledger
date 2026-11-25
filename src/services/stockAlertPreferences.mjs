import {sourceHealth} from "../../supabase/functions/_shared/stockContract.mjs";

export const STOCK_ALERT_RETAILERS=Object.freeze(["Target","Walmart","Pokémon Center","Best Buy","Sam's Club","Costco"]);
export const STOCK_ALERT_SIGNAL_OPTIONS=Object.freeze([
  {key:"available_now",label:"Confirmed purchase availability"},
  {key:"possible_drop",label:"Possible drops"},
  {key:"queue_detected",label:"Pokémon Center queues"},
  {key:"reported_stock",label:"Reported inventory (unverified)"},
  {key:"new_listing",label:"New product listings"},
  {key:"raffle_open",label:"Drawings and raffles"},
  {key:"out_of_stock",label:"Sold out updates"},
]);
const SIGNALS=new Set(STOCK_ALERT_SIGNAL_OPTIONS.map(item=>item.key));
const RETAILERS=new Set(STOCK_ALERT_RETAILERS);
const HH_MM=/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/u;
const SKU=/^[A-Za-z0-9_-]{1,64}$/u;
const MINUTE=60000;

export function defaultStockAlertPreferences(timeZone="America/New_York"){
  return {
    enabled:false,retailers:[],signal_types:["available_now"],product_keys:[],
    quiet_hours_enabled:false,quiet_start:"22:00",quiet_end:"08:00",time_zone:timeZone,
  };
}
function strings(input,max,label){
  if(!Array.isArray(input)||input.length>max||input.some(x=>typeof x!=="string"))
    throw new Error("Invalid "+label+" list.");
  return [...new Set(input)];
}
function isValidZone(zone){
  if(typeof zone!=="string"||!zone||zone.length>64)return false;
  try{new Intl.DateTimeFormat("en-US",{timeZone:zone}).format(0);return true;}
  catch{return false;}
}
export function normalizeStockAlertPreferences(raw,{targets=[],timeZone="America/New_York"}={}){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Invalid preferences.");
  const enabled=raw.enabled===true;
  const retailers=strings(raw.retailers||[],6,"retailer");
  if(retailers.some(r=>!RETAILERS.has(r)))throw new Error("Unknown retailer.");
  const signal_types=strings(raw.signal_types||[],7,"signal");
  if(signal_types.some(s=>!SIGNALS.has(s)))throw new Error("Unknown stock signal.");
  const product_keys=strings(raw.product_keys||[],80,"product");
  const known=new Set(targets.map(p=>p.retailer+"|"+p.sku));
  if(product_keys.some(key=>{
    const index=key.lastIndexOf("|");
    if(index<1||!SKU.test(key.slice(index+1))||!known.has(key))return true;
    return !retailers.includes(key.slice(0,index));
  }))throw new Error("Choose only approved products from selected retailers.");
  const quiet_hours_enabled=raw.quiet_hours_enabled===true;
  const quiet_start=raw.quiet_start||"22:00",quiet_end=raw.quiet_end||"08:00";
  const time_zone=raw.time_zone||timeZone;
  if(!HH_MM.test(quiet_start)||!HH_MM.test(quiet_end)||!isValidZone(time_zone))
    throw new Error("Invalid quiet hours or time zone.");
  if(enabled&&(!retailers.length||!signal_types.length))
    throw new Error("Choose at least one retailer and alert type before opting in.");
  return {enabled,retailers,signal_types,product_keys,
    quiet_hours_enabled,quiet_start,quiet_end,time_zone};
}
function minuteOfDay(clock,zone){
  try{
    const p=new Intl.DateTimeFormat("en-US",{
      timeZone:zone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"
    }).formatToParts(new Date(clock));
    const hour=Number(p.find(x=>x.type==="hour")?.value);
    const minute=Number(p.find(x=>x.type==="minute")?.value);
    return Number.isInteger(hour)&&Number.isInteger(minute)?hour*60+minute:null;
  }catch{return null;}
}
export function isInQuietHours(preferences,now=Date.now()){
  if(!preferences?.quiet_hours_enabled)return false;
  const start=preferences.quiet_start,end=preferences.quiet_end;
  if(!HH_MM.test(start||"")||!HH_MM.test(end||""))return true;
  const at=minuteOfDay(now,preferences.time_zone);
  if(at===null)return true;
  const parse=value=>Number(value.slice(0,2))*60+Number(value.slice(3,5));
  const a=parse(start),b=parse(end);
  if(a===b)return true;
  return a<b?(at>=a&&at<b):(at>=a||at<b);
}
// Pure, fail-closed predicate for a FUTURE opt-in dispatcher. No messages are sent.
export function wouldMatchStockAlert(preferences,signal,{sources=[],now=Date.now()}={}){
  if(preferences?.enabled!==true||!signal||!RETAILERS.has(signal.retailer)||
      !SIGNALS.has(signal.signalType)||!preferences.retailers?.includes(signal.retailer)||
      !preferences.signal_types?.includes(signal.signalType)||
      typeof signal.sourceUrl!=="string"||!signal.sourceUrl.startsWith("https://"))return false;
  const observed=Date.parse(signal.observedAt),expires=Date.parse(signal.expiresAt);
  if(!Number.isFinite(observed)||!Number.isFinite(expires)||observed>now+MINUTE||
      observed<now-24*60*MINUTE||expires<=now)return false;
  if(signal.signalType==="available_now"){
    if(!["official","admin_checked"].includes(signal.evidenceLevel)||
      expires-observed>15*MINUTE)return false;
  }
  if(signal.evidenceLevel==="official"){
    const source=sources.find(x=>x.retailer===signal.retailer);
    if(!sourceHealth(source,now).healthy||source.mode!=="official-api")return false;
  }
  const keys=preferences.product_keys||[];
  if(keys.length&&!keys.includes(signal.retailer+"|"+signal.sku))return false;
  if(signal.signalType==="queue_detected"&&signal.retailer!=="Pokémon Center")return false;
  return !isInQuietHours(preferences,now);
}