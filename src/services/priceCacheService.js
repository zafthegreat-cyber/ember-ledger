import { MARKET_STATUS } from "../data/marketSources";

export const MARKET_PRICE_CACHE_KEY = "et-tcg-market-price-cache";

export function loadPriceCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(MARKET_PRICE_CACHE_KEY) || "{}");
    const savedPrices = Array.isArray(saved.prices) ? saved.prices : [];
    return {
      prices: savedPrices,
      lastSync: saved.lastSync || "",
      failedMatches: Array.isArray(saved.failedMatches) ? saved.failedMatches : [],
    };
  } catch {
    return { prices: [], lastSync: "", failedMatches: [] };
  }
}

export function savePriceCache(cache) {
  localStorage.setItem(MARKET_PRICE_CACHE_KEY, JSON.stringify({
    prices: Array.isArray(cache.prices) ? cache.prices : [],
    lastSync: cache.lastSync || new Date().toISOString(),
    failedMatches: Array.isArray(cache.failedMatches) ? cache.failedMatches : [],
  }));
}

export function normalizeMarketPrice(price = {}) {
  const now = new Date().toISOString();
  const marketPrice = Number(price.marketPrice ?? price.price ?? price.midPrice ?? 0);
  return {
    id: price.id || price.priceId || `price-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    catalogItemId: price.catalogItemId || price.productId || price.cardId || "",
    catalogType: price.catalogType || price.itemType || "sealed",
    externalSource: price.externalSource || price.source || "Manual",
    externalId: price.externalId || price.tcgplayerProductId || price.productId || price.cardId || "",
    sourceUrl: price.sourceUrl || price.marketUrl || "",
    priceType: price.priceType || "market",
    condition: price.condition || "",
    variant: price.variant || "",
    currency: String(price.currency || "USD").toUpperCase(),
    price: Number(price.price ?? marketPrice),
    lowPrice: Number(price.lowPrice || 0),
    midPrice: Number(price.midPrice || marketPrice || 0),
    highPrice: Number(price.highPrice || 0),
    marketPrice,
    directLow: Number(price.directLow || price.directLowPrice || 0),
    buylistMarketPrice: Number(price.buylistMarketPrice || 0),
    // An explicitly unknown source date must stay unknown. Only a new manual
    // entry with no timestamp field receives the time it was entered.
    timestamp: Object.hasOwn(price, "timestamp") ? price.timestamp || "" : price.priceDate || now,
    marketStatus: price.marketStatus || price.status || MARKET_STATUS.MANUAL,
    confidenceScore: Number(price.confidenceScore || 60),
    createdAt: price.createdAt || now,
    updatedAt: price.updatedAt || now,
  };
}

export function updateCachedMarketPrice(cache, priceData) {
  const normalized = normalizeMarketPrice(priceData);
  if (!Number.isFinite(normalized.marketPrice) || normalized.marketPrice <= 0) return cache;
  const prices = Array.isArray(cache.prices) ? cache.prices : [];
  const sameReference = (price) => (
    String(price.catalogItemId) === String(normalized.catalogItemId) &&
    String(price.catalogType) === String(normalized.catalogType) &&
    String(price.externalSource || "Manual") === String(normalized.externalSource) &&
    String(price.externalId || "") === String(normalized.externalId) &&
    String(price.currency || "USD").toUpperCase() === normalized.currency &&
    String(price.priceType || "market") === String(normalized.priceType || "market") &&
    String(price.condition || "") === String(normalized.condition || "") &&
    String(price.variant || "") === String(normalized.variant || "")
  );
  const previous = prices.filter(sameReference).sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0))[0];
  if (previous) {
    const incomingDate = Date.parse(normalized.timestamp);
    const previousDate = Date.parse(previous.timestamp);
    if (!Number.isFinite(incomingDate) || (Number.isFinite(previousDate) && incomingDate < previousDate)) return cache;
    normalized.id = previous.id || normalized.id;
  }
  const nextPrices = [
    normalized,
    ...prices.filter((price) => !sameReference(price)),
  ];
  return {
    ...cache,
    prices: nextPrices,
    lastSync: new Date().toISOString(),
  };
}

export function getCachedPricesForItem(cache, catalogItemId) {
  return (cache.prices || []).filter((price) => String(price.catalogItemId) === String(catalogItemId));
}
