export const BETA_LOCAL_STORAGE_KEYS = {
  app: "et-tcg-beta-data",
  scout: "et-tcg-beta-scout",
  tidepool: "et-tcg-beta-tidepool",
  feedback: "et-tcg-beta-feedback",
  suggestions: "et-tcg-beta-suggestions",
  adminReviewLog: "et-tcg-beta-admin-review-log",
  marketPrices: "et-tcg-market-price-cache",
  whatDidISee: "tide_tradr_what_did_i_see_reports",
};

const DEMO_SOURCE_VALUES = new Set(["demo", "mock", "fake", "dummy", "sample", "seed-demo", "local-beta-fake"]);
const DEMO_TEXT_MARKERS = [
  "beta sample",
  "demo ",
  "demo:",
  "mock ",
  "mock:",
  "fake ",
  "dummy ",
  "lorem",
  "test product",
  "placeholder product",
  "demo sale",
  "demo expense",
  "demo mileage",
  "sample report",
];

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(storage, key, value) {
  storage.setItem(key, JSON.stringify(value));
}

function textIncludesDemoMarker(value) {
  const text = String(value || "").toLowerCase();
  return DEMO_TEXT_MARKERS.some((marker) => text.includes(marker));
}

export function isDemoLikeRecord(record = {}) {
  if (!record || typeof record !== "object") return false;
  if (record.isDemo === true || record.is_demo === true || record.demo === true) return true;

  const sourceValues = [
    record.source,
    record.sourceType,
    record.source_type,
    record.sourceStatus,
    record.source_status,
    record.marketSource,
    record.market_source,
    record.marketStatus,
    record.market_status,
    record.verificationStatus,
    record.verification_status,
  ];
  if (sourceValues.some((value) => DEMO_SOURCE_VALUES.has(String(value || "").toLowerCase()))) return true;

  const identityValues = [
    record.id,
    record.postId,
    record.post_id,
    record.commentId,
    record.comment_id,
    record.userId,
    record.user_id,
    record.createdBy,
    record.created_by,
  ];
  if (identityValues.some((value) => /(^|[-_\s])(demo|mock|fake|dummy|sample)([-_\s]|$)/i.test(String(value || "")))) return true;

  const displayValues = [
    record.title,
    record.name,
    record.itemName,
    record.item_name,
    record.productName,
    record.product_name,
    record.body,
    record.notes,
    record.reportText,
    record.report_text,
    record.description,
    record.eventTitle,
    record.event_title,
    record.eventDescription,
    record.event_description,
  ];
  return displayValues.some(textIncludesDemoMarker);
}

function filterDemoArray(value) {
  return Array.isArray(value) ? value.filter((record) => !isDemoLikeRecord(record)) : [];
}

export function emptyTidepoolData() {
  return { posts: [], comments: [], reactions: [] };
}

export function sanitizeTidepoolLocalData(value = {}) {
  return {
    posts: filterDemoArray(value.posts),
    comments: filterDemoArray(value.comments),
    reactions: filterDemoArray(value.reactions),
  };
}

export function sanitizeScoutLocalData(value = {}) {
  return {
    ...value,
    stores: filterDemoArray(value.stores),
    reports: filterDemoArray(value.reports),
    tidepoolReports: filterDemoArray(value.tidepoolReports),
    tidepoolEvents: filterDemoArray(value.tidepoolEvents),
    bestBuyStockResults: filterDemoArray(value.bestBuyStockResults),
    bestBuyStockHistory: filterDemoArray(value.bestBuyStockHistory),
    bestBuyStoreStock: filterDemoArray(value.bestBuyStoreStock),
    bestBuyAlerts: filterDemoArray(value.bestBuyAlerts),
    bestBuyNightlyReports: filterDemoArray(value.bestBuyNightlyReports),
    items: filterDemoArray(value.items),
    routes: filterDemoArray(value.routes),
  };
}

export function sanitizeMarketPriceCache(value = {}) {
  return {
    prices: filterDemoArray(value.prices),
    lastSync: value.lastSync || "",
    failedMatches: Array.isArray(value.failedMatches) ? value.failedMatches : [],
  };
}

export function sanitizeAppLocalData(value = {}) {
  return {
    ...value,
    items: filterDemoArray(value.items),
    catalogProducts: filterDemoArray(value.catalogProducts),
    tideTradrWatchlist: filterDemoArray(value.tideTradrWatchlist),
    marketplaceListings: filterDemoArray(value.marketplaceListings),
    marketplaceReports: filterDemoArray(value.marketplaceReports),
    expenses: filterDemoArray(value.expenses),
    sales: filterDemoArray(value.sales),
    vehicles: filterDemoArray(value.vehicles),
    mileageTrips: filterDemoArray(value.mileageTrips),
    marketPriceCache: sanitizeMarketPriceCache(value.marketPriceCache || {}),
  };
}

export function cleanupBrowserBetaStorage(storage = globalThis.localStorage) {
  if (!storage) return { changed: false, summary: [] };
  const summary = [];

  const appData = sanitizeAppLocalData(readJson(storage, BETA_LOCAL_STORAGE_KEYS.app, {}));
  writeJson(storage, BETA_LOCAL_STORAGE_KEYS.app, appData);
  summary.push({ key: BETA_LOCAL_STORAGE_KEYS.app, status: "sanitized" });

  const scoutData = sanitizeScoutLocalData(readJson(storage, BETA_LOCAL_STORAGE_KEYS.scout, {}));
  writeJson(storage, BETA_LOCAL_STORAGE_KEYS.scout, scoutData);
  summary.push({ key: BETA_LOCAL_STORAGE_KEYS.scout, status: "sanitized" });

  const tidepoolData = sanitizeTidepoolLocalData(readJson(storage, BETA_LOCAL_STORAGE_KEYS.tidepool, emptyTidepoolData()));
  writeJson(storage, BETA_LOCAL_STORAGE_KEYS.tidepool, tidepoolData);
  summary.push({ key: BETA_LOCAL_STORAGE_KEYS.tidepool, status: "sanitized" });

  const marketPrices = sanitizeMarketPriceCache(readJson(storage, BETA_LOCAL_STORAGE_KEYS.marketPrices, {}));
  writeJson(storage, BETA_LOCAL_STORAGE_KEYS.marketPrices, marketPrices);
  summary.push({ key: BETA_LOCAL_STORAGE_KEYS.marketPrices, status: "sanitized" });

  const suggestions = filterDemoArray(readJson(storage, BETA_LOCAL_STORAGE_KEYS.suggestions, []));
  writeJson(storage, BETA_LOCAL_STORAGE_KEYS.suggestions, suggestions);
  summary.push({ key: BETA_LOCAL_STORAGE_KEYS.suggestions, status: "sanitized" });

  const feedback = filterDemoArray(readJson(storage, BETA_LOCAL_STORAGE_KEYS.feedback, []));
  writeJson(storage, BETA_LOCAL_STORAGE_KEYS.feedback, feedback);
  summary.push({ key: BETA_LOCAL_STORAGE_KEYS.feedback, status: "sanitized" });

  const adminReviewLog = filterDemoArray(readJson(storage, BETA_LOCAL_STORAGE_KEYS.adminReviewLog, []));
  writeJson(storage, BETA_LOCAL_STORAGE_KEYS.adminReviewLog, adminReviewLog);
  summary.push({ key: BETA_LOCAL_STORAGE_KEYS.adminReviewLog, status: "sanitized" });

  const whatDidISee = filterDemoArray(readJson(storage, BETA_LOCAL_STORAGE_KEYS.whatDidISee, []));
  writeJson(storage, BETA_LOCAL_STORAGE_KEYS.whatDidISee, whatDidISee);
  summary.push({ key: BETA_LOCAL_STORAGE_KEYS.whatDidISee, status: "sanitized" });

  return { changed: true, summary };
}
