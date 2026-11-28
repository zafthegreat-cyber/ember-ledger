import {stockApiUrl} from "./stockApi.mjs";
import {parseStockIntelligence} from "../../supabase/functions/_shared/stockContract.mjs";
export {RETAILER_NAMES,SIGNAL_KINDS,EVIDENCE_LABELS,parseStockIntelligence,sourceHealth,currentStockSignals} from "../../supabase/functions/_shared/stockContract.mjs";
export async function loadStockIntelligence({
  signal, fetchImpl=fetch, now,
  publicGatewayKey=import.meta.env?.VITE_SUPABASE_ANON_KEY,
  project=import.meta.env?.VITE_SUPABASE_URL,
}={}) {
  if (typeof publicGatewayKey !== "string" || !publicGatewayKey) throw new Error("Stock intelligence connection is not configured.");
  const result = await fetchImpl(stockApiUrl("code3-stock-intel-feed",project), {
    method:"GET", credentials:"omit", redirect:"error", cache:"no-store", signal,
    headers:{Accept:"application/json",apikey:publicGatewayKey,Authorization:"Bearer "+publicGatewayKey},
  });
  if (!result.ok || !result.headers.get("content-type")?.includes("application/json")) throw new Error("Stock intelligence feed is unavailable.");
  return parseStockIntelligence(await result.json(),now??Date.now());
}
export function filterStockIntelligence(snapshot,{retailer="All",query=""}={}) {
  const term = query.trim().normalize("NFKC").toLocaleLowerCase();
  const matches = x => (retailer === "All" || x.retailer === retailer) &&
    (!term || [x.name||x.headline||x.query||"",x.product||"",x.sku||"",x.retailer].join(" ").normalize("NFKC").toLocaleLowerCase().includes(term));
  return {targets:snapshot.targets.filter(matches),signals:snapshot.signals.filter(matches),discoveryWatches:(snapshot.discoveryWatches||[]).filter(matches)};
}

export async function submitStockReview({accessToken,review,fetchImpl=fetch,project=import.meta.env?.VITE_SUPABASE_URL}) {
  if (!accessToken || typeof accessToken !== "string") throw new Error("Sign in as an admin before submitting.");
  const response=await fetchImpl(stockApiUrl("code3-stock-intel-review",project),{
    method:"POST",credentials:"omit",redirect:"error",cache:"no-store",
    headers:{
      "Content-Type":"application/json",
      "apikey":import.meta.env?.VITE_SUPABASE_ANON_KEY || "",
      "Authorization":"Bearer "+accessToken,
    },
    body:JSON.stringify(review),
  });
  const result=await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(typeof result.error==="string"?result.error:"Review could not be saved.");
  if (result.ok!==true || typeof result.id!=="string") throw new Error("Review could not be confirmed.");
  return result;
}
