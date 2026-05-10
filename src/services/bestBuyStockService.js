import { BEST_BUY_MOCK_PRODUCTS, BEST_BUY_SOURCE_STATUS } from "../data/bestBuyStockSeed";

const BEST_BUY_CACHE_TTL_MS = 1000 * 60 * 30;

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/pok[eé]mon/g, "pokemon")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function statusFromAvailability(result = {}) {
  if (/available for pickup/i.test(result.pickupAvailability || result.storeAvailability || "")) return "Available for Pickup";
  if (/shipping available|in stock/i.test(result.shippingAvailability || result.onlineAvailability || "")) return "Shipping Available";
  if (/limited/i.test(result.pickupAvailability || result.storeAvailability || "")) return "Limited Availability";
  if (/out of stock/i.test(`${result.onlineAvailability} ${result.pickupAvailability} ${result.shippingAvailability}`)) return "Out of Stock";
  return result.stockStatus || "Unknown";
}

function confidenceFromMatch(match) {
  if (!match) return 0;
  if (match.reason?.includes("SKU") || match.reason?.includes("UPC")) return 95;
  if (match.reason?.includes("Exact")) return 88;
  return 62;
}

export function searchBestBuyProducts(query, products = BEST_BUY_MOCK_PRODUCTS) {
  const needle = normalizeText(query);
  if (!needle) return products;
  return products.filter((product) =>
    normalizeText(`${product.productName} ${product.bestBuySku} ${product.productUrl}`).includes(needle)
  );
}

export function getBestBuyProductBySku(sku, products = BEST_BUY_MOCK_PRODUCTS) {
  return products.find((product) => String(product.bestBuySku || "").toLowerCase() === String(sku || "").toLowerCase()) || null;
}

export function checkBestBuyOnlineAvailability(sku, products = BEST_BUY_MOCK_PRODUCTS) {
  const product = getBestBuyProductBySku(sku, products);
  return product ? normalizeBestBuyStockResult(product) : normalizeBestBuyStockResult({ bestBuySku: sku, productName: "Unknown Best Buy item", sourceStatus: BEST_BUY_SOURCE_STATUS.UNKNOWN });
}

export function checkBestBuyStoreAvailability(sku, zipOrStoreId, products = BEST_BUY_MOCK_PRODUCTS) {
  const product = checkBestBuyOnlineAvailability(sku, products);
  return {
    ...product,
    zipChecked: zipOrStoreId || product.zipChecked,
    storeAvailability: product.storeAvailability || "Check Store",
    stockStatus: statusFromAvailability(product),
  };
}

export function normalizeBestBuyStockResult(result = {}) {
  const checkedAt = result.lastChecked || nowIso();
  return {
    retailer: "Best Buy",
    bestBuySku: result.bestBuySku || result.sku || "",
    productName: result.productName || result.name || "Unknown Best Buy product",
    productUrl: result.productUrl || result.url || "",
    imageUrl: result.imageUrl || "",
    price: Number(result.price || result.regularPrice || result.salePrice || 0),
    salePrice: Number(result.salePrice || result.price || 0),
    onlineAvailability: result.onlineAvailability || "Unknown",
    pickupAvailability: result.pickupAvailability || result.storeAvailability || "Unknown",
    shippingAvailability: result.shippingAvailability || "Unknown",
    storeAvailability: result.storeAvailability || result.pickupAvailability || "Unknown",
    storeId: result.storeId || "",
    storeName: result.storeName || "",
    storeAddress: result.storeAddress || "",
    city: result.city || "",
    state: result.state || "VA",
    zipChecked: result.zipChecked || "",
    lastChecked: checkedAt,
    lastStatusChange: result.lastStatusChange || checkedAt,
    sourceType: result.sourceType || "unavailable",
    sourceStatus: result.sourceStatus || result.marketStatus || BEST_BUY_SOURCE_STATUS.UNKNOWN,
    matchedCatalogItemId: result.matchedCatalogItemId || "",
    matchedStoreId: result.matchedStoreId || "",
    matchConfidence: Number(result.matchConfidence || 0),
    stockStatus: result.stockStatus || statusFromAvailability(result),
  };
}

export function matchBestBuyProductToTideTradrCatalog(bestBuyProduct = {}, catalogItems = []) {
  const sku = normalizeText(bestBuyProduct.bestBuySku);
  const name = normalizeText(bestBuyProduct.productName);
  const exactSku = catalogItems.find((item) => normalizeText(`${item.sku} ${item.upc} ${item.barcode} ${item.externalProductId}`) === sku);
  if (exactSku) return { item: exactSku, confidenceScore: 96, reason: "Exact Best Buy SKU / UPC match" };

  const exactName = catalogItems.find((item) => normalizeText(item.name || item.productName || item.cardName) === name);
  if (exactName) return { item: exactName, confidenceScore: 88, reason: "Exact product name match" };

  const fuzzy = catalogItems.find((item) => {
    const haystack = normalizeText(`${item.name} ${item.productName} ${item.cardName} ${item.setName} ${item.productType}`);
    return name.split(" ").filter((token) => token.length > 2).slice(0, 5).every((token) => haystack.includes(token));
  });
  return fuzzy
    ? { item: fuzzy, confidenceScore: 62, reason: "Fuzzy product name match - needs review" }
    : { item: null, confidenceScore: 0, reason: "No TideTradr catalog match found" };
}

export function matchBestBuyStoreToScoutStore(bestBuyStore = {}, scoutStores = []) {
  const storeId = String(bestBuyStore.storeId || bestBuyStore.storeID || "");
  const city = normalizeText(bestBuyStore.city);
  const address = normalizeText(bestBuyStore.storeAddress || bestBuyStore.address);
  const exact = scoutStores.find((store) => normalizeText(`${store.bestBuyStoreId || store.storeId || ""}`) === normalizeText(storeId));
  if (exact) return { store: exact, confidenceScore: 95, reason: "Exact Best Buy store ID match" };
  const byAddress = scoutStores.find((store) => /best buy/i.test(store.chain || store.name || "") && address && normalizeText(store.address).includes(address));
  if (byAddress) return { store: byAddress, confidenceScore: 88, reason: "Best Buy address match" };
  const byCity = scoutStores.find((store) => /best buy/i.test(store.chain || store.name || "") && city && normalizeText(store.city) === city);
  return byCity
    ? { store: byCity, confidenceScore: 65, reason: "Best Buy city match - needs review" }
    : { store: null, confidenceScore: 0, reason: "No Scout store match found" };
}

export function cacheBestBuyStockResult(cache = [], result = {}) {
  const normalized = normalizeBestBuyStockResult(result);
  const next = cache.filter((item) =>
    !(String(item.bestBuySku) === String(normalized.bestBuySku) && String(item.storeId || item.zipChecked) === String(normalized.storeId || normalized.zipChecked))
  );
  return [{ ...normalized, sourceStatus: normalized.sourceStatus || BEST_BUY_SOURCE_STATUS.CACHED }, ...next];
}

export function saveBestBuyStockHistory(history = [], result = {}, previous = {}) {
  const normalized = normalizeBestBuyStockResult(result);
  const previousStatus = previous.stockStatus || previous.currentStatus || "";
  const priceChanged = Number(previous.salePrice || previous.price || 0) !== Number(normalized.salePrice || normalized.price || 0);
  const changeType = !previousStatus
    ? "unknown"
    : previousStatus !== normalized.stockStatus
      ? normalized.stockStatus === "Out of Stock" ? "sold_out" : "new_in_stock"
      : priceChanged ? "price_change" : normalized.stockStatus === "Out of Stock" ? "unknown" : "still_in_stock";
  return [
    {
      stockHistoryId: makeId("bestbuy-history"),
      bestBuySku: normalized.bestBuySku,
      catalogItemId: normalized.matchedCatalogItemId || "",
      storeId: normalized.matchedStoreId || normalized.storeId || "",
      storeName: normalized.storeName || "",
      zipChecked: normalized.zipChecked || "",
      stockStatus: normalized.stockStatus,
      onlineAvailability: normalized.onlineAvailability,
      pickupAvailability: normalized.pickupAvailability,
      shippingAvailability: normalized.shippingAvailability,
      price: normalized.price,
      salePrice: normalized.salePrice,
      checkedAt: normalized.lastChecked,
      sourceType: normalized.sourceType,
      changeType,
      previousStatus,
      currentStatus: normalized.stockStatus,
      notes: normalized.sourceStatus === "mock" ? "Beta mock/cached Best Buy availability. Confirm before driving." : "",
    },
    ...history,
  ];
}

export function calculateBestBuyDeadStockScore(records = [], result = {}) {
  const normalized = normalizeBestBuyStockResult(result);
  const sameItem = records.filter((record) =>
    String(record.bestBuySku) === String(normalized.bestBuySku) &&
    String(record.storeId || record.zipChecked || "") === String(normalized.storeId || normalized.zipChecked || "")
  );
  const stillAvailable = sameItem.filter((record) => /in stock|available|limited/i.test(record.stockStatus || record.currentStatus || "")).length;
  const soldOut = sameItem.filter((record) => /sold_out|out of stock/i.test(`${record.changeType} ${record.stockStatus}`)).length;
  return Math.max(0, Math.min(100, stillAvailable * 18 - soldOut * 22));
}

export function updateStoreStockFromBestBuy(storeStock = [], result = {}, history = []) {
  const normalized = normalizeBestBuyStockResult(result);
  const key = `${normalized.bestBuySku}-${normalized.matchedStoreId || normalized.storeId || normalized.zipChecked}`;
  const existing = storeStock.find((stock) => stock.storeStockId === key);
  const nextRecord = {
    storeStockId: key,
    retailer: "Best Buy",
    storeId: normalized.matchedStoreId || normalized.storeId || "",
    catalogItemId: normalized.matchedCatalogItemId || "",
    bestBuySku: normalized.bestBuySku,
    productName: normalized.productName,
    productType: "Pokemon / TCG",
    setName: "",
    quantitySeen: "",
    quantityConfidence: normalized.stockStatus === "Limited Availability" ? "estimated" : "unknown",
    stockStatus: normalized.stockStatus,
    firstSeenAt: existing?.firstSeenAt || normalized.lastChecked,
    lastSeenAt: /available|in stock|limited/i.test(normalized.stockStatus) ? normalized.lastChecked : existing?.lastSeenAt || "",
    lastChecked: normalized.lastChecked,
    timesSeen: (existing?.timesSeen || 0) + (/available|in stock|limited/i.test(normalized.stockStatus) ? 1 : 0),
    timesUnavailable: (existing?.timesUnavailable || 0) + (/out of stock/i.test(normalized.stockStatus) ? 1 : 0),
    deadStockScore: calculateBestBuyDeadStockScore(history, normalized),
    sourceType: normalized.sourceType || "unavailable",
    lastUpdated: normalized.lastChecked,
  };
  return [nextRecord, ...storeStock.filter((stock) => stock.storeStockId !== key)];
}

export function createBestBuyStockAlert(result = {}) {
  const normalized = normalizeBestBuyStockResult(result);
  if (!/in stock|available|limited|price/i.test(`${normalized.stockStatus} ${normalized.onlineAvailability} ${normalized.pickupAvailability}`)) return null;
  return {
    alertId: makeId("bestbuy-alert"),
    type: normalized.stockStatus === "Available for Pickup" ? "Best Buy product available for pickup near you" : "Best Buy product in stock online",
    title: normalized.productName,
    message: `${normalized.stockStatus} via Best Buy (${normalized.sourceStatus}). Last checked ${new Date(normalized.lastChecked).toLocaleString()}.`,
    url: normalized.productUrl,
    productUrl: normalized.productUrl,
    bestBuySku: normalized.bestBuySku,
    productName: normalized.productName,
    sourceStatus: normalized.sourceStatus,
    createdAt: nowIso(),
  };
}

export function createTidepoolReportFromBestBuyAvailability(result = {}) {
  const normalized = normalizeBestBuyStockResult(result);
  return {
    reportId: makeId("bestbuy-tidepool"),
    userId: "best-buy-source",
    displayName: "Best Buy Source",
    anonymous: false,
    storeId: normalized.matchedStoreId || "",
    storeName: normalized.storeName || "Best Buy online/local availability",
    catalogItemId: normalized.matchedCatalogItemId || "",
    productName: normalized.productName,
    reportType: "Online drop alert",
    reportText: `Best Buy availability found: ${normalized.stockStatus}. Confirm before driving; stock is not guaranteed.`,
    photoUrl: normalized.imageUrl || "",
    quantitySeen: "",
    price: normalized.salePrice || normalized.price || "",
    purchaseLimit: "Unknown",
    reportTime: normalized.lastChecked,
    city: normalized.city || "",
    state: normalized.state || "VA",
    zip: normalized.zipChecked || "",
    verificationStatus: "pending",
    confidenceScore: normalized.sourceStatus === "live" ? 72 : normalized.sourceStatus === "cached" ? 58 : 42,
    verifiedByCount: 0,
    disputedByCount: 0,
    helpfulVotes: 0,
    sourceType: normalized.sourceStatus === "live" ? "best_buy_api" : normalized.sourceStatus || "unavailable",
    lastUpdated: normalized.lastChecked,
  };
}

export function pullBestBuyStockData({ query = "pokemon", zip = "", products = BEST_BUY_MOCK_PRODUCTS, catalogItems = [], scoutStores = [] } = {}) {
  return searchBestBuyProducts(query, products).map((product) => {
    const result = normalizeBestBuyStockResult({ ...product, zipChecked: zip || product.zipChecked });
    const productMatch = matchBestBuyProductToTideTradrCatalog(result, catalogItems);
    const storeMatch = matchBestBuyStoreToScoutStore(result, scoutStores);
    return {
      ...result,
      matchedCatalogItemId: productMatch.item?.id || "",
      matchedStoreId: storeMatch.store?.id || "",
      matchConfidence: Math.max(confidenceFromMatch(productMatch), confidenceFromMatch(storeMatch), result.matchConfidence || 0),
      matchReason: productMatch.reason,
      storeMatchReason: storeMatch.reason,
    };
  });
}

export function syncBestBuyPokemonProducts(options = {}) {
  return pullBestBuyStockData({ ...options, query: options.query || "pokemon" });
}

export function syncBestBuyAvailabilityForWatchlist(watchlist = [], options = {}) {
  const names = watchlist.map((item) => item.name || item.productName).filter(Boolean);
  return names.length
    ? names.flatMap((name) => pullBestBuyStockData({ ...options, query: name }))
    : pullBestBuyStockData(options);
}

export function syncBestBuyAvailabilityForNearbyStores(options = {}) {
  return pullBestBuyStockData(options);
}

export function syncBestBuyAvailabilityForFavoriteStores(options = {}) {
  return pullBestBuyStockData(options).filter((result) => result.favoriteStore || result.matchedStoreId || /pickup|limited/i.test(result.stockStatus));
}

export function generateNightlyBestBuyStockReport({ results = [], history = [], settings = {} } = {}) {
  const checkedAt = nowIso();
  const inStock = results.filter((item) => /in stock|shipping available/i.test(`${item.stockStatus} ${item.onlineAvailability} ${item.shippingAvailability}`));
  const pickup = results.filter((item) => /pickup|limited/i.test(`${item.stockStatus} ${item.pickupAvailability}`));
  const priceChanges = history.filter((item) => item.changeType === "price_change").slice(0, 8);
  const soldOut = history.filter((item) => item.changeType === "sold_out").slice(0, 8);
  const deadStock = results
    .map((item) => ({ ...item, deadStockScore: calculateBestBuyDeadStockScore(history, item) }))
    .filter((item) => item.deadStockScore >= 40);
  return {
    reportId: makeId("bestbuy-nightly"),
    retailer: "Best Buy",
    generatedAt: checkedAt,
    reportDate: checkedAt.slice(0, 10),
    zip: settings.zip || "",
    radiusMiles: settings.radiusMiles || 25,
    sourceStatus: results.some((item) => item.sourceStatus === "live") ? "live" : results.some((item) => item.sourceStatus === "cached") ? "cached" : "mock",
    inStock,
    pickup,
    watchlistMatches: results.filter((item) => item.matchedCatalogItemId),
    favoriteStoreMatches: results.filter((item) => item.favoriteStore),
    priceChanges,
    newInStock: history.filter((item) => item.changeType === "new_in_stock").slice(0, 8),
    soldOut,
    deadStock,
    needsReview: results.filter((item) => item.matchConfidence < 70),
    lastChecked: checkedAt,
    deliveryMethods: [settings.deliveryMethod || "in-app"],
    summary: `${inStock.length} online/shipping matches, ${pickup.length} pickup/limited matches, ${deadStock.length} possible still-sitting items.`,
  };
}

export function sendNightlyBestBuyStockReport(report) {
  return {
    ok: true,
    deliveryMethod: "in-app",
    message: "In-app nightly report saved. Email, push, and Discord/webhook delivery are placeholders.",
    report,
  };
}
