import { MARKET_STATUS, MARKET_STATUS_LABELS } from "../data/marketSources";
import { matchExternalCardId, matchExternalProductId, syncPokemonTcgPrices, syncTcgCsvProductPrices } from "./catalogSyncService";
import { getCachedPricesForItem, normalizeMarketPrice, updateCachedMarketPrice } from "./priceCacheService";

export function calculateMarketConfidence(item = {}, price = {}) {
  if (!price || !Number(price.marketPrice || price.price || 0)) return { score: 0, label: "Low", needsReview: true };
  let score = Number(price.confidenceScore || 50);
  if (price.marketStatus === MARKET_STATUS.LIVE) score += 18;
  if (price.marketStatus === MARKET_STATUS.CACHED) score += 8;
  if (price.marketStatus === MARKET_STATUS.MANUAL) score += 2;
  if (price.marketStatus === MARKET_STATUS.MOCK) score -= 20;
  if (price.externalId || item.externalSourceId || item.tcgplayerProductId) score += 8;
  if (item.upc || item.barcode || item.sku || item.cardNumber) score += 5;
  score = Math.max(0, Math.min(99, score));
  return {
    score,
    label: score >= 80 ? "High" : score >= 55 ? "Medium" : "Low",
    needsReview: score < 65 || price.marketStatus === MARKET_STATUS.UNKNOWN,
  };
}

export function getBestAvailableMarketPrice(item = {}, cache = { prices: [] }) {
  const cached = getCachedPricesForItem(cache, item.id).sort((a, b) => new Date(b.timestamp || b.updatedAt || 0) - new Date(a.timestamp || a.updatedAt || 0))[0];
  const manualOrCatalog = normalizeMarketPrice({
    catalogItemId: item.id,
    catalogType: item.catalogType || "sealed",
    externalSource: item.marketSource || "Manual / catalog",
    externalId: item.externalSourceId || item.externalProductId || item.tcgplayerProductId || "",
    sourceUrl: item.externalSourceUrl || item.marketUrl || "",
    marketPrice: Number(item.marketPrice || item.marketValue || item.marketValueNearMint || item.marketValueRaw || item.midPrice || 0),
    lowPrice: Number(item.lowPrice || item.marketLow || 0),
    midPrice: Number(item.midPrice || item.marketMid || item.marketPrice || item.marketValueNearMint || 0),
    highPrice: Number(item.highPrice || item.marketHigh || item.marketValueGraded || 0),
    timestamp: item.marketLastUpdated || item.lastMarketUpdate || item.lastUpdated || item.updatedAt || "",
    marketStatus: item.marketStatus || item.sourceType || (item.marketSource ? MARKET_STATUS.MANUAL : MARKET_STATUS.MOCK),
    confidenceScore: item.marketConfidenceLevel === "High" ? 80 : item.marketConfidenceLevel === "Medium" ? 62 : item.marketConfidenceLevel === "Low" ? 42 : 50,
  });
  const fallbackMock = normalizeMarketPrice({
    catalogItemId: item.id,
    catalogType: item.catalogType || "sealed",
    externalSource: "Mock / demo fallback",
    marketPrice: Number(item.msrpPrice || item.msrp || 0),
    timestamp: item.createdAt || new Date().toISOString(),
    marketStatus: Number(item.msrpPrice || item.msrp || 0) > 0 ? MARKET_STATUS.MOCK : MARKET_STATUS.UNKNOWN,
    confidenceScore: Number(item.msrpPrice || item.msrp || 0) > 0 ? 25 : 0,
  });

  const candidates = [cached, manualOrCatalog, fallbackMock].filter(Boolean).filter((price) => Number(price.marketPrice || price.price || 0) > 0 || price.marketStatus === MARKET_STATUS.UNKNOWN);
  const priority = { live: 5, manual: 4, cached: 3, mock: 2, unknown: 1 };
  const best = candidates.sort((a, b) => {
    const statusDiff = (priority[b.marketStatus] || 0) - (priority[a.marketStatus] || 0);
    if (statusDiff) return statusDiff;
    return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
  })[0] || fallbackMock;
  const confidence = calculateMarketConfidence(item, best);
  return {
    ...best,
    statusLabel: MARKET_STATUS_LABELS[best.marketStatus] || "Unknown",
    confidence,
  };
}

export function getMarketPriceForCatalogItem(catalogItemId, catalog = [], cache = { prices: [] }) {
  const item = catalog.find((entry) => String(entry.id) === String(catalogItemId));
  return item ? getBestAvailableMarketPrice(item, cache) : null;
}

export function getMarketPriceForCard(cardId, catalog = [], cache = { prices: [] }) {
  const item = catalog.find((entry) => String(entry.id) === String(cardId) || String(entry.cardId) === String(cardId));
  return item ? getBestAvailableMarketPrice(item, cache) : null;
}

export function getMarketPriceForSealedProduct(productId, catalog = [], cache = { prices: [] }) {
  const item = catalog.find((entry) => String(entry.id) === String(productId) || String(entry.productId) === String(productId));
  return item ? getBestAvailableMarketPrice(item, cache) : null;
}

export function matchExternalId(item = {}, externalData = []) {
  return item.catalogType === "card"
    ? matchExternalCardId(item, externalData)
    : matchExternalProductId(item, externalData);
}

export function applyMarketPriceToCatalogItem(item = {}, price = {}) {
  const normalized = normalizeMarketPrice(price);
  return {
    ...item,
    marketValue: normalized.marketPrice,
    marketPrice: normalized.marketPrice,
    marketLow: normalized.lowPrice,
    marketMid: normalized.midPrice,
    marketHigh: normalized.highPrice,
    lowPrice: normalized.lowPrice,
    midPrice: normalized.midPrice,
    highPrice: normalized.highPrice,
    marketSource: normalized.externalSource,
    marketStatus: normalized.marketStatus,
    sourceType: normalized.marketStatus,
    marketLastUpdated: normalized.timestamp,
    marketConfidenceLevel: calculateMarketConfidence(item, normalized).label,
    externalSourceId: normalized.externalId || item.externalSourceId || "",
    externalSourceUrl: normalized.sourceUrl || item.externalSourceUrl || "",
    updatedAt: new Date().toISOString(),
  };
}

export function refreshCatalogMarketItems(catalog = [], cache = { prices: [] }, type = "all") {
  const cardSync = type === "sealed" ? { prices: [], failedMatches: [] } : syncPokemonTcgPrices(catalog);
  const sealedSync = type === "card" ? { prices: [], failedMatches: [] } : syncTcgCsvProductPrices(catalog);
  let nextCache = { ...cache, failedMatches: [...(cache.failedMatches || []), ...cardSync.failedMatches, ...sealedSync.failedMatches] };
  [...cardSync.prices, ...sealedSync.prices].forEach((price) => {
    nextCache = updateCachedMarketPrice(nextCache, price);
  });
  const nextCatalog = catalog.map((item) => {
    const best = getBestAvailableMarketPrice(item, nextCache);
    return applyMarketPriceToCatalogItem(item, best);
  });
  return { catalog: nextCatalog, cache: { ...nextCache, lastSync: new Date().toISOString() } };
}

export function refreshWatchlistMarketItems(watchlist = [], catalog = [], cache = { prices: [] }) {
  return watchlist.map((watch) => {
    const item = catalog.find((product) => String(product.id) === String(watch.productId));
    if (!item) return watch;
    const best = getBestAvailableMarketPrice(item, cache);
    const previousMarketValue = Number(watch.marketValue || 0);
    return {
      ...watch,
      previousMarketValue,
      marketValue: Number(best.marketPrice || 0),
      msrp: Number(item.msrpPrice || item.msrp || watch.msrp || 0),
      sourceName: `${best.statusLabel} - ${best.externalSource}`,
      marketStatus: best.marketStatus,
      confidenceLabel: best.confidence.label,
      needsReview: best.confidence.needsReview,
      lastUpdated: best.timestamp || new Date().toISOString(),
    };
  });
}

export function refreshPinnedMarketItems(watchlist = [], catalog = [], cache = { prices: [] }) {
  return refreshWatchlistMarketItems(watchlist, catalog, cache);
}
