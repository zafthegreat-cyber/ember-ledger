import { getApiBase } from "../native/nativeRuntime.js";

// TCGCSV forbids requests from user-facing apps. Its quotes come ONLY from our
// generated daily snapshot endpoint; TCGdex permits its public card API.
const TIMEOUT_MS = 12_000;
const MAX_BYTES = 1_000_000;
const CACHE_MS = 5 * 60_000;
const caches = new WeakMap();
const clean = value => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100) : "";
const productId = value => /^[1-9]\d{0,9}$/.test(String(value ?? "")) ? String(value) : "";
const cardId = value => /^[a-zA-Z0-9.]{1,32}-[a-zA-Z0-9.]{1,16}$/.test(String(value ?? "")) ? String(value) : "";
const positive = value => (typeof value === "number" || typeof value === "string") && String(value).trim() !== ""
  && Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 1_000_000_000 ? Number(value) : null;
const normalized = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
const iso = value => {
  // A missing timezone is ambiguous. Product metadata dates are never used here.
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
};
const finish = value => ({ holo: "holofoil", reverse: "reverseholofoil", reverseholo: "reverseholofoil", nonholo: "normal", nonfoil: "normal", firstedition: "1stedition" }[normalized(value)] || normalized(value));

export function resolveMarketSourceIdentity(item = {}) {
  const languageValue = normalized(item.language || item.cardLanguage || item.productLanguage);
  const language = ["en", "eng", "english"].includes(languageValue) ? "en" : languageValue;
  const gradeValues = [item.grade, item.gradingGrade, item.gradingCompany, item.grader].map(value => normalized(String(value ?? "")));
  const graded = item.isGraded === true || item.is_graded === true || gradeValues.some(value => value && !["raw", "ungraded", "none", "0"].includes(value))
    || /graded|slab|psa|beckett|cgc|bgs/.test(normalized(item.condition));
  const identity = {
    tcgplayerProductId: productId(item.tcgplayerProductId ?? item.tcgplayer_product_id),
    tcgplayerGroupId: productId(item.tcgplayerGroupId ?? item.tcgplayer_group_id ?? item.groupId),
    tcgplayerCategoryId: productId(item.tcgplayerCategoryId ?? item.tcgplayer_category_id ?? item.categoryId)
      || (/^pok[eé]mon(?:\s+tcg)?$/i.test(String(item.game || item.category || "").trim()) ? "3" : ""),
    tcgdexCardId: cardId(item.tcgdexCardId ?? item.tcgdexId ?? item.tcgdex_card_id),
    language, condition: clean(item.condition), variant: clean(item.variant || item.finish || item.printing),
    graded, catalogType: clean(item.catalogType || item.catalogItemType || (item.isSealed ? "sealed" : "")),
  };
  identity.key = JSON.stringify(identity);
  return identity;
}

function abortError() { return Object.assign(new Error("Request cancelled"), { name: "AbortError" }); }

async function readBoundedJson(response) {
  if (Number(response.headers?.get?.("content-length") || 0) > MAX_BYTES) throw new Error("Response too large");
  let body;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let length = 0;
    body = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_BYTES) throw new Error("Response too large");
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  } else {
    body = await response.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BYTES) throw new Error("Response too large");
  }
  return JSON.parse(body);
}

function subscribe(entry, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  const token = Symbol();
  entry.subscribers.add(token);
  return new Promise((resolve, reject) => {
    const finishRequest = (callback, result) => {
      signal?.removeEventListener("abort", onAbort);
      entry.subscribers.delete(token);
      callback(result);
    };
    const onAbort = () => {
      finishRequest(reject, abortError());
      if (!entry.settled && !entry.subscribers.size) entry.controller.abort();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    entry.promise.then(value => finishRequest(resolve, value), error => finishRequest(reject, error));
  });
}

function requestJson(url, fetchImpl, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  let cache = caches.get(fetchImpl);
  if (!cache) { cache = new Map(); caches.set(fetchImpl, cache); }
  const cached = cache.get(url);
  if (cached && !cached.controller.signal.aborted && (!cached.settled || cached.expiresAt > Date.now())) return subscribe(cached, signal);
  // Bound memory while comparing many different collection records.
  if (cache.size >= 60) cache.delete(cache.keys().next().value);
  const controller = new AbortController();
  const entry = { controller, subscribers: new Set(), settled: false, expiresAt: 0, promise: null };
  let timeout;
  const timedOut = new Promise((_, reject) => {
    timeout = setTimeout(() => { controller.abort(); reject(new Error("Source request timed out")); }, TIMEOUT_MS);
  });
  entry.promise = Promise.race([
    Promise.resolve().then(async () => {
      const response = await fetchImpl(url, { method: "GET", credentials: "omit", redirect: "error", signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
      return readBoundedJson(response);
    }),
    timedOut,
  ]).then(data => {
    entry.expiresAt = Date.now() + CACHE_MS;
    return data;
  }).catch(error => {
    if (cache.get(url) === entry) cache.delete(url);
    throw error;
  }).finally(() => { clearTimeout(timeout); entry.settled = true; });
  cache.set(url, entry);
  return subscribe(entry, signal);
}

function apiSnapshotUrl(id) {
  const path = `${getApiBase()}/api/market/sources/${id}`;
  const url = new URL(path, globalThis.location?.href || "https://code3tcg.app/");
  if (url.username || url.password || url.hash || !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("Invalid application API address");
  return path;
}

function compatibility(identity, variant) {
  if (identity.graded) return { marketEligible: false, matchNote: "Raw product reference; this is not a graded-card quote." };
  if (identity.language && identity.language !== "en") return { marketEligible: false, matchNote: "English-market reference; the recorded language differs." };
  if (identity.variant && finish(identity.variant) !== finish(variant)) return { marketEligible: false, matchNote: "Different printing; review the selected variant before comparing." };
  if (identity.condition && !["raw", "ungraded", "sealed", "new", "unknown", "unspecified"].includes(normalized(identity.condition))) return { marketEligible: false, matchNote: "Aggregate across conditions; this is not a quote for the recorded condition." };
  return { marketEligible: true, matchNote: "Exact provider identity; aggregate across conditions, not a condition-specific quote." };
}

const state = (id, label, status, message) => ({
  id, label, status, message,
  quoteSourceId: id === "tcgplayer-tcgdex" ? "tcgplayer" : id,
  via: id === "tcgplayer" ? "TCGCSV daily snapshot" : "TCGdex",
});
function failedState(id, label, error, signal) {
  return signal?.aborted || error?.name === "AbortError"
    ? state(id, label, "aborted", "Price comparison cancelled.")
    : state(id, label, "unavailable", "This source could not be reached. Your saved value is unchanged.");
}

async function snapshotQuotes(identity, fetchImpl, signal, checkedAt) {
  if (!identity.tcgplayerProductId) return { quotes: [], source: state("tcgplayer", "TCGplayer", "match_required", "Choose an exact catalog match with a TCGplayer product ID.") };
  try {
    const data = await requestJson(apiSnapshotUrl(identity.tcgplayerProductId), fetchImpl, signal);
    if (data.productId !== identity.tcgplayerProductId || !Array.isArray(data.quotes) || data.quotes.length > 20) throw new Error("Unexpected product response");
    const quotes = data.quotes.flatMap((quote, index) => {
      const amount = positive(quote.amount);
      if (amount === null || quote.currency !== "USD" || !["market", "listing"].includes(quote.kind)) return [];
      const variant = clean(quote.variant) || "Unspecified printing";
      const match = compatibility(identity, variant);
      const priceBasis = ["market", "mid"].includes(quote.priceBasis) ? quote.priceBasis : "unknown";
      const observedAt = iso(quote.observedAt);
      const specificMatch = match.marketEligible && priceBasis === "market" && Boolean(observedAt);
      return [{ id: `tcgcsv:${identity.tcgplayerProductId}:${index}`, sourceId: "tcgplayer", sourceLabel: "TCGplayer", via: "TCGCSV daily snapshot",
        kind: quote.kind, amount, currency: "USD", variant, condition: "Product-level aggregate", observedAt, checkedAt,
        snapshotLastImportedAt: iso(quote.snapshotLastImportedAt || data.snapshotLastImportedAt), priceBasis,
        sourceUrl: `https://www.tcgplayer.com/product/${identity.tcgplayerProductId}`, marketEligible: specificMatch,
        matchNote: !match.marketEligible ? match.matchNote : priceBasis === "unknown" ? "Cached reference; upstream price basis and observation date were not recorded." : priceBasis === "mid" ? "Median asking price; this is not a completed-sale price." : match.matchNote,
      }];
    });
    return { quotes, source: state("tcgplayer", "TCGplayer", quotes.length ? "ready" : "no_quote", quotes.length ? "Daily TCGCSV snapshot; product-level reference prices." : "No valid quote is available for this exact product in the daily snapshot.") };
  } catch (error) { return { quotes: [], source: failedState("tcgplayer", "TCGplayer", error, signal) }; }
}

async function dexQuotes(identity, fetchImpl, signal, checkedAt) {
  const labels = [["tcgplayer-tcgdex", "TCGplayer via TCGdex"], ["cardmarket", "Cardmarket"]];
  if (!identity.tcgdexCardId) return { quotes: [], sources: [state("cardmarket", "Cardmarket", "match_required", "An exact TCGdex card ID is needed for this source.")] };
  try {
    const url = `https://api.tcgdex.net/v2/en/cards/${identity.tcgdexCardId}`;
    const card = await requestJson(url, fetchImpl, signal);
    if (card.id !== identity.tcgdexCardId || !card.pricing || typeof card.pricing !== "object") {
      if (card.id !== identity.tcgdexCardId) throw new Error("Unexpected card identity");
      return { quotes: [], sources: labels.map(([id, label]) => state(id, label, "no_quote", "No price was supplied for this exact card.")) };
    }
    const quotes = [];
    const tcg = card.pricing.tcgplayer;
    if (tcg?.unit === "USD") {
      const variants = ["normal", "holofoil", "reverse-holofoil", "reverse", "1st-edition", "1st-edition-holofoil", "unlimited", "unlimited-holofoil"];
      for (const variant of variants) {
        const amount = positive(tcg[variant]?.marketPrice);
        if (amount === null) continue;
        const match = compatibility(identity, variant);
        const observedAt = iso(tcg.updated);
        quotes.push({ id: `tcgdex:tcgplayer:${identity.tcgdexCardId}:${variant}`, sourceId: "tcgplayer", sourceLabel: "TCGplayer", via: "TCGdex", kind: "market", amount, currency: "USD", variant,
          condition: "Product-level aggregate", observedAt, checkedAt, priceBasis: "market", sourceUrl: identity.tcgplayerProductId ? `https://www.tcgplayer.com/product/${identity.tcgplayerProductId}` : url,
          marketEligible: match.marketEligible && Boolean(observedAt), matchNote: match.matchNote });
      }
    }
    const cm = card.pricing.cardmarket;
    if (cm?.unit === "EUR") {
      for (const [field, variant] of [["trend", "Normal"], ["trend-holo", "Holofoil"]]) {
        const amount = positive(cm[field]);
        if (amount === null) continue;
        const match = compatibility(identity, variant);
        const observedAt = iso(cm.updated);
        quotes.push({ id: `tcgdex:cardmarket:${identity.tcgdexCardId}:${field}`, sourceId: "cardmarket", sourceLabel: "Cardmarket", via: "TCGdex", kind: "trend", amount, currency: "EUR", variant,
          condition: "Product-level aggregate", observedAt, checkedAt, priceBasis: "trend", sourceUrl: url,
          marketEligible: match.marketEligible && Boolean(observedAt), matchNote: `${match.matchNote} EUR reference; no currency conversion applied.` });
      }
    }
    return { quotes, sources: labels.map(([id, label]) => {
      const found = quotes.some(quote => quote.sourceId === (id === "tcgplayer-tcgdex" ? "tcgplayer" : id));
      return state(id, label, found ? "ready" : "no_quote", found ? "Provider pricing delivered by TCGdex; keep currency and printing separate." : "No valid quote was supplied for this exact card.");
    }) };
  } catch (error) { return { quotes: [], sources: labels.map(([id, label]) => failedState(id, label, error, signal)) }; }
}

/** Read-only comparisons. This never writes saved values, local storage, costs or portfolio records. */
export async function fetchMarketSourceQuotes(item, { fetchImpl = globalThis.fetch, signal, now = new Date() } = {}) {
  const identity = resolveMarketSourceIdentity(item);
  const date = new Date(typeof now === "function" ? now() : now);
  const checkedAt = Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
  if (typeof fetchImpl !== "function") return { checkedAt, quotes: [], sources: [state("tcgplayer", "TCGplayer", "unavailable", "Price lookup is unavailable in this browser.")] };
  const [snapshot, dex] = await Promise.all([snapshotQuotes(identity, fetchImpl, signal, checkedAt), dexQuotes(identity, fetchImpl, signal, checkedAt)]);
  return { checkedAt, quotes: [...snapshot.quotes, ...dex.quotes], sources: [snapshot.source, ...dex.sources] };
}
