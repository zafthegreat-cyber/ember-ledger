import { MARKET_STATUS } from "../data/marketSources";

export const MARKET_PRICE_CACHE_KEY = "et-tcg-market-price-cache";

export function loadPriceCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(MARKET_PRICE_CACHE_KEY) || "{}");
    return {
      prices: Array.isArray(saved.prices) ? saved.prices : [],
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
    currency: price.currency || "USD",
    price: Number(price.price ?? marketPrice),
    lowPrice: Number(price.lowPrice || 0),
    midPrice: Number(price.midPrice || marketPrice || 0),
    highPrice: Number(price.highPrice || 0),
    marketPrice,
    directLow: Number(price.directLow || price.directLowPrice || 0),
    buylistMarketPrice: Number(price.buylistMarketPrice || 0),
    timestamp: price.timestamp || price.priceDate || now,
    marketStatus: price.marketStatus || price.status || MARKET_STATUS.MANUAL,
    confidenceScore: Number(price.confidenceScore || 60),
    createdAt: price.createdAt || now,
    updatedAt: price.updatedAt || now,
  };
}

export function updateCachedMarketPrice(cache, priceData) {
  const normalized = normalizeMarketPrice(priceData);
  const prices = Array.isArray(cache.prices) ? cache.prices : [];
  const nextPrices = [
    normalized,
    ...prices.filter((price) =>
      !(
        String(price.catalogItemId) === String(normalized.catalogItemId) &&
        String(price.catalogType) === String(normalized.catalogType) &&
        String(price.priceType || "market") === String(normalized.priceType || "market") &&
        String(price.condition || "") === String(normalized.condition || "") &&
        String(price.variant || "") === String(normalized.variant || "")
      )
    ),
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
