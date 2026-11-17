export const STOCK_INTELLIGENCE_URL = "https://gxsfququorfczvhrkudl.supabase.co/functions/v1/code3-stock-intel-feed";
export const RETAILER_NAMES = Object.freeze(["Target", "Walmart", "Pokémon Center", "Best Buy", "Sam's Club", "Costco"]);
export const SIGNAL_KINDS = Object.freeze({
  reported_stock: { label: "Inventory reported", explanation: "Third-party inventory report; not proof an item can be purchased.", tone: "reported" },
  available_now: { label: "Available to purchase", explanation: "Official feed or admin-checked availability. Recheck before checkout.", tone: "available" },
  out_of_stock: { label: "Sold out", explanation: "An observed out-of-stock status; stock may change.", tone: "muted" },
  possible_drop: { label: "Possible drop", explanation: "An early signal, not a confirmed launch.", tone: "watch" },
  queue_detected: { label: "Queue detected", explanation: "A waiting room is present; this does not prove a Pokémon release.", tone: "watch" },
  queue_ended: { label: "Queue ended", explanation: "A queue is no longer reported; availability is unconfirmed.", tone: "muted" },
  raffle_open: { label: "Drawing open", explanation: "Check official retailer rules and deadlines before entering.", tone: "watch" },
  new_listing: { label: "New listing", explanation: "A product page was discovered; purchase availability is unconfirmed.", tone: "reported" },
});
export const EVIDENCE_LABELS = Object.freeze({
  reported: "Community-reported",
  admin_checked: "Admin-checked",
  official: "Official source",
});
const allowedSourceTypes = new Set(["authorized_discord","community_report","admin_review","official_api","retailer_notice"]);
const modes = new Set(["manual-watch","authorized-feed","official-api"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const skus = /^[A-Za-z0-9_-]{1,64}$/;
const isString = (value,max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const retailerOrigins = Object.freeze({
  Target: ["target.com"],
  Walmart: ["walmart.com"],
  "Pokémon Center": ["pokemoncenter.com"],
  "Best Buy": ["bestbuy.com"],
  "Sam's Club": ["samsclub.com"],
  Costco: ["costco.com"],
});
function allowedUrl(input, domains) {
  if (!isString(input,2048)) return false;
  try {
    const u = new URL(input);
    return u.protocol === "https:" && !u.username && !u.password &&
      domains.some(domain => u.hostname === domain || u.hostname.endsWith("." + domain));
  } catch { return false; }
}
function parseDate(raw,now,optional=false,allowFuture=false) {
  if (optional && (raw === null || raw === undefined)) return null;
  if (!isString(raw,64)) throw new Error("Invalid stock intelligence timestamp.");
  const n = Date.parse(raw);
  if (!Number.isFinite(n) || (!allowFuture && n > now + 60_000)) throw new Error("Invalid stock intelligence timestamp.");
  return new Date(n).toISOString();
}
export function parseStockIntelligence(payload, now=Date.now()) {
  if (!payload || payload.version !== 1 || !Array.isArray(payload.sources) ||
      !Array.isArray(payload.targets) || !Array.isArray(payload.signals) ||
      payload.sources.length > RETAILER_NAMES.length || payload.targets.length > 80 || payload.signals.length > 40) {
    throw new Error("Stock intelligence feed unavailable.");
  }
  const discovery = payload.discoveryWatches ?? [];
  if (!Array.isArray(discovery) || discovery.length > 20) throw new Error("Invalid discovery watches.");
  const generatedAt = parseDate(payload.generatedAt, now);
  if (Date.parse(generatedAt) < now - 10 * 60_000) throw new Error("Stock intelligence feed is stale.");
  const sources = payload.sources.map(source => {
    if (!RETAILER_NAMES.includes(source.retailer) || !modes.has(source.mode) ||
        typeof source.connected !== "boolean" || (source.connected && source.mode === "manual-watch")) {
      throw new Error("Stock intelligence feed unavailable.");
    }
    return {
      retailer: source.retailer, mode: source.mode, connected: source.connected,
      lastSuccessAt: parseDate(source.lastSuccessAt,now,true),
    };
  });
  if (new Set(sources.map(x=>x.retailer)).size !== sources.length) throw new Error("Duplicate retailer source.");
  const discoveryWatches = discovery.map(watch => {
    if (!watch || !RETAILER_NAMES.includes(watch.retailer) || !isString(watch.query,80) ||
        watch.query.trim().length < 3) throw new Error("Invalid discovery watch.");
    return {retailer:watch.retailer,query:watch.query.trim()};
  });
  if (new Set(discoveryWatches.map(x=>x.retailer+"|"+x.query)).size !== discoveryWatches.length) throw new Error("Duplicate discovery watch.");
  const targets = payload.targets.map(product => {
    if (!RETAILER_NAMES.includes(product.retailer) || !skus.test(product.sku) ||
        !isString(product.name,180) || !allowedUrl(product.url, retailerOrigins[product.retailer])) {
      throw new Error("Invalid retailer watch target.");
    }
    return {retailer: product.retailer, sku: product.sku, name: product.name, url: product.url};
  });
  if (new Set(targets.map(x=>x.retailer+"|"+x.sku)).size !== targets.length) throw new Error("Duplicate retailer target.");
  const signals = payload.signals.map(signal => {
    if (!uuid.test(signal.id) || !RETAILER_NAMES.includes(signal.retailer) ||
        !Object.hasOwn(SIGNAL_KINDS,signal.signalType) ||
        !Object.hasOwn(EVIDENCE_LABELS,signal.evidenceLevel) ||
        !allowedSourceTypes.has(signal.sourceType) ||
        !isString(signal.headline,180) ||
        !allowedUrl(signal.sourceUrl,[...retailerOrigins[signal.retailer],"discord.com","pokemon.com"])) {
      throw new Error("Invalid retailer stock signal.");
    }
    if (signal.signalType === "available_now" && signal.evidenceLevel === "reported") throw new Error("Unconfirmed stock cannot be shown as available.");
    if (signal.evidenceLevel === "official" && signal.sourceType !== "official_api") throw new Error("Unverified official signal.");
    if (signal.evidenceLevel === "admin_checked" && signal.sourceType !== "admin_review") throw new Error("Unverified admin signal.");
    const observedAt = parseDate(signal.observedAt,now);
    const expiresAt = parseDate(signal.expiresAt,now,false,true);
    if (Date.parse(expiresAt) <= Date.parse(observedAt) || Date.parse(expiresAt) > Date.parse(observedAt) + 48*3600_000) throw new Error("Invalid signal lifetime.");
    if (signal.product !== null && signal.product !== undefined && !isString(signal.product,180)) throw new Error("Invalid signal product.");
    if (signal.productUrl !== null && signal.productUrl !== undefined &&
      !allowedUrl(signal.productUrl,retailerOrigins[signal.retailer])) throw new Error("Invalid signal product URL.");
    if (signal.sku !== null && signal.sku !== undefined && !skus.test(signal.sku)) throw new Error("Invalid signal product ID.");
    return {
      id:signal.id, retailer:signal.retailer, signalType:signal.signalType,
      evidenceLevel:signal.evidenceLevel, sourceType:signal.sourceType, headline:signal.headline,
      sourceUrl:signal.sourceUrl, observedAt, expiresAt, product:signal.product || "",
      productUrl:signal.productUrl || "", sku:signal.sku || "",
    };
  }).filter(signal => Date.parse(signal.expiresAt) > now && Date.parse(signal.observedAt) >= now - 24*3600_000);
  return {generatedAt,sources,targets,signals,discoveryWatches};
}
export async function loadStockIntelligence({
  signal, fetchImpl=fetch, now=Date.now(),
  publicGatewayKey=import.meta.env?.VITE_SUPABASE_ANON_KEY,
}={}) {
  if (typeof publicGatewayKey !== "string" || !publicGatewayKey) throw new Error("Stock intelligence connection is not configured.");
  const result = await fetchImpl(STOCK_INTELLIGENCE_URL, {
    method:"GET", credentials:"omit", redirect:"error", cache:"no-store", signal,
    headers:{Accept:"application/json",apikey:publicGatewayKey,Authorization:"Bearer "+publicGatewayKey},
  });
  if (!result.ok || !result.headers.get("content-type")?.includes("application/json")) throw new Error("Stock intelligence feed is unavailable.");
  return parseStockIntelligence(await result.json(),now);
}
export function filterStockIntelligence(snapshot,{retailer="All",query=""}={}) {
  const term = query.trim().normalize("NFKC").toLocaleLowerCase();
  const matches = x => (retailer === "All" || x.retailer === retailer) &&
    (!term || [x.name||x.headline||x.query||"",x.product||"",x.sku||"",x.retailer].join(" ").normalize("NFKC").toLocaleLowerCase().includes(term));
  return {targets:snapshot.targets.filter(matches),signals:snapshot.signals.filter(matches),discoveryWatches:(snapshot.discoveryWatches||[]).filter(matches)};
}

export const STOCK_REVIEW_URL = "https://gxsfququorfczvhrkudl.supabase.co/functions/v1/code3-stock-intel-review";
export async function submitStockReview({accessToken,review,fetchImpl=fetch}) {
  if (!accessToken || typeof accessToken !== "string") throw new Error("Sign in as an admin before submitting.");
  const response=await fetchImpl(STOCK_REVIEW_URL,{
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
