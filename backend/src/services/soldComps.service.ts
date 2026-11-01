const API_URL = "https://api.compsapi.com/v1/sold";
const LOOKBACK_DAYS = 90;
const MINIMUM_SALES = 3;
const MAX_BODY_BYTES = 2_000_000;
const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];
const GRADERS = ["PSA", "BGS", "CGC", "SGC", "TAG"];
const PRINTINGS = ["non_holo", "holo", "reverse_holo", "first_edition", "shadowless"];
const LANGUAGES = ["en", "ja", "ko", "zh", "de", "fr", "it", "es", "pt"];

export class SoldCompsError extends Error {
  constructor(public code: string, message: string, public status: number, public retryAfterSeconds?: number) {
    super(message); this.name = "SoldCompsError";
  }
}
type Identity = { name: string; setName: string; cardNumber: string; printing: string; language: string; condition: string; grader: string; grade: string };
type Dependencies = { fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number };
type Comparable = { id: string; title: string; amount: number; currency: "USD"; soldAt: string; sourceUrl: string; condition: string };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 100) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
const words = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9]+/g) || [];
const numberKey = (value: string) => value.toUpperCase().split("/").map(part => part.replace(/^0+(?=\d)/, "")).join("/");

export function soldCompsHealth(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.COMPSAPI_ENABLED === "true" && Boolean(env.COMPSAPI_API_KEY?.trim());
  return { ok: true, configured, providerId: "compsapi", sourceLabel: "eBay sales via CompsAPI", message: configured ? "Sold-data provider is configured; a search verifies live access." : "Sold-price estimates are not connected." };
}

function identityFrom(value: unknown): Identity {
  const data = record(value);
  const identity = {
    name: text(data.name, 80), setName: text(data.setName, 80), cardNumber: text(data.cardNumber, 24),
    printing: text(data.printing, 24), language: text(data.language, 8), condition: text(data.condition, 8),
    grader: text(data.grader, 8), grade: text(data.grade, 8),
  };
  if (!words(identity.name).length || !words(identity.setName).length || !/^[A-Za-z0-9-]+(?:\/[A-Za-z0-9-]+)?$/.test(identity.cardNumber)
    || !PRINTINGS.includes(identity.printing) || !LANGUAGES.includes(identity.language)
    || (identity.grader ? !GRADERS.includes(identity.grader) || !/^(?:[1-9](?:\.5)?|10)$/.test(identity.grade) || Boolean(identity.condition)
      : !CONDITIONS.includes(identity.condition) || Boolean(identity.grade))) {
    throw new SoldCompsError("match_required", "Choose a card name, set, card number, printing, language, and raw condition or exact slab grade.", 400);
  }
  return identity;
}

function printingMatches(title: string, printing: string, firstEdition: unknown) {
  const reverse = /\breverse\b/i.test(title);
  const nonHolo = /\bnon[ -]?holo(?:foil|graphic)?\b/i.test(title);
  const holo = /\bholo(?:foil|graphic)?\b/i.test(title) && !nonHolo;
  const first = /\b(?:1st|first)\s*(?:ed(?:ition)?\b)/i.test(title) || firstEdition === true;
  const shadowless = /\bshadowless\b/i.test(title);
  if (printing === "first_edition") return first && firstEdition === true;
  if (first || firstEdition !== false) return false;
  if (printing === "shadowless") return shadowless;
  if (shadowless) return false;
  if (printing === "reverse_holo") return reverse && holo;
  if (printing === "holo") return holo && !reverse;
  return nonHolo && !reverse;
}

function cents(value: unknown) {
  if ((typeof value !== "number" && typeof value !== "string") || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) return null;
  const amount = Math.round(Number(value) * 100);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 100_000_000_000 ? amount : null;
}

/** Provider-reported sales only, with explicit title/printing/condition matches.
 * No seller identities, images, account data, or provider payloads are stored. */
export function normalizeSoldComps(value: unknown, input: unknown, now = Date.now()) {
  const identity = identityFrom(input);
  const payload = record(value);
  if (payload.ok !== true || payload.source !== "ebay" || !Array.isArray(payload.items) || payload.items.length > 300) {
    throw new SoldCompsError("invalid_response", "The sold-data provider returned an unreadable response.", 502);
  }
  const requiredWords = [...words(identity.name), ...words(identity.setName)];
  const comparables: Comparable[] = [];
  const seen = new Set<string>();
  for (const value of payload.items) {
    const row = record(value); const card = record(row.card);
    const id = text(row.item_id, 24); const title = text(row.title, 500);
    const soldTime = text(row.last_sold, 60);
    const amount = cents(row.price); const soldAt = /(?:Z|[+-]\d{2}:\d{2})$/.test(soldTime) ? Date.parse(soldTime) : NaN;
    const titleWords = new Set(words(title));
    if (!/^\d{8,20}$/.test(id) || seen.has(id) || !title || amount === null || !Number.isFinite(soldAt)
      || soldAt > now || now - soldAt > LOOKBACK_DAYS * 86_400_000 || row.us_sale !== true || row.units_sold !== 1
      || !requiredWords.every(word => titleWords.has(word))
      || numberKey(text(card.card_number, 24)) !== numberKey(identity.cardNumber)
      || text(card.language, 8) !== identity.language
      || !Array.isArray(card.flags) || card.flags.length > 0
      || /\b(?:lot|bundle|replica|proxy|custom|repack|mystery|jumbo)\b/i.test(title)
      || !printingMatches(title, identity.printing, card.first_edition)) continue;
    if (identity.grader ? card.graded !== true || text(card.grader, 8) !== identity.grader || text(card.grade, 8) !== identity.grade
      : card.graded !== false || text(card.condition, 8).toUpperCase() !== identity.condition) continue;
    seen.add(id);
    comparables.push({ id, title, amount: amount / 100, currency: "USD", soldAt: new Date(soldAt).toISOString(), sourceUrl: `https://www.ebay.com/itm/${id}`, condition: identity.grader ? `${identity.grader} ${identity.grade}` : identity.condition });
  }
  // IQR filtering uses exact cents. A small sample is kept intact and reported
  // as limited evidence rather than statistically trimming it to a desired value.
  const sorted = comparables.map(row => Math.round(row.amount * 100)).sort((a, b) => a - b);
  const q1 = sorted[Math.floor((sorted.length - 1) * .25)] || 0;
  const q3 = sorted[Math.ceil((sorted.length - 1) * .75)] || 0;
  const kept = sorted.length < 8 ? comparables : comparables.filter(row => Math.round(row.amount * 100) >= q1 - 1.5 * (q3 - q1) && Math.round(row.amount * 100) <= q3 + 1.5 * (q3 - q1));
  const prices = kept.map(row => Math.round(row.amount * 100)).sort((a, b) => a - b);
  const midpoint = Math.floor(prices.length / 2);
  const median = prices.length ? Math.round(prices.length % 2 ? prices[midpoint] : prices[midpoint - 1] / 2 + prices[midpoint] / 2) / 100 : null;
  const marketEligible = prices.length >= MINIMUM_SALES;
  return {
    ok: true, providerId: "compsapi", sourceLabel: "eBay sales via CompsAPI", checkedAt: new Date(now).toISOString(), identity,
    status: marketEligible ? "ready" : "insufficient_sales", marketEligible, estimatedMarketPrice: marketEligible ? median : null,
    currency: "USD", priceBasis: "median_matched_sold_prices", shippingTreatment: "EXCLUDE_SHIPPING", lookbackDays: LOOKBACK_DAYS,
    sampleSize: prices.length, fetchedRows: payload.items.length, matchedRows: comparables.length, outliersRemoved: comparables.length - kept.length,
    moreSalesAvailable: payload.next_page === true, comparables: kept.slice(0, 100),
    limitations: ["Provider-reported US sales matched from listing titles; review the card identity and printing.", "Prices exclude shipping, tax, and fees. Only single-unit sales with a stated matching language and condition/grade are counted.", "This is a sample from one independent provider, not an official eBay valuation or a guaranteed sale price."],
  };
}

export async function searchSoldComps(input: unknown, env: NodeJS.ProcessEnv = process.env, dependencies: Dependencies = {}) {
  if (!soldCompsHealth(env).configured) throw new SoldCompsError("sold_data_not_configured", "Sold-price estimates are not connected.", 503);
  const identity = identityFrom(input);
  const url = new URL(API_URL);
  url.search = new URLSearchParams({
    q: `${identity.name} ${identity.setName} ${identity.cardNumber}`, days: String(LOOKBACK_DAYS), size: "100", page: "1", site: "US", cards: "1", exclude: "junk,sealed", lang: identity.language,
    first_edition: String(identity.printing === "first_edition"),
    ...(identity.grader ? { grader: identity.grader, grade: identity.grade } : { graded: "false", card_condition: identity.condition.toLowerCase() }),
  }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(10_000, dependencies.timeoutMs || 10_000));
  try {
    const response = await (dependencies.fetchImpl || fetch)(url, { signal: controller.signal, redirect: "error", headers: { Accept: "application/json", "X-API-Key": env.COMPSAPI_API_KEY!.trim(), "User-Agent": "Code3TCG-SoldComps/1.0" } });
    if (response.status === 429) {
      const retry = Number(response.headers.get("retry-after"));
      throw new SoldCompsError("rate_limited", "The sold-data provider limit was reached. Try again later.", 429, Number.isFinite(retry) && retry > 0 ? Math.min(86_400, Math.ceil(retry)) : 60);
    }
    if (response.status === 401 || response.status === 403) throw new SoldCompsError("provider_access_failed", "The sold-data provider could not authorize this request.", 502);
    if (!response.ok) throw new SoldCompsError("provider_unavailable", "The sold-data provider is temporarily unavailable.", 502);
    // Read at most 2 MB, including when Content-Length is absent or untrusted.
    const reader = response.body?.getReader();
    if (!reader) throw new SoldCompsError("invalid_response", "The sold-data provider returned an empty response.", 502);
    let length = 0; const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        length += part.value.byteLength;
        if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new SoldCompsError("invalid_response", "The sold-data provider response was too large.", 502); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    return normalizeSoldComps(JSON.parse(Buffer.concat(chunks).toString("utf8")), identity, (dependencies.now || Date.now)());
  } catch (error) {
    if (error instanceof SoldCompsError) throw error;
    if (controller.signal.aborted) throw new SoldCompsError("timeout", "The sold-data search timed out. Try again later.", 504);
    throw new SoldCompsError("provider_unavailable", "The sold-data provider could not be read.", 502);
  } finally { clearTimeout(timeout); }
}
