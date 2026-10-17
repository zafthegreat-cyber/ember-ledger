export const BETA_LOCAL_STORAGE_KEYS = {
  app: "et-tcg-beta-data",
  scout: "et-tcg-beta-scout",
  tidepool: "et-tcg-beta-tidepool",
  feedback: "et-tcg-beta-feedback",
  suggestions: "et-tcg-beta-suggestions",
  adminReviewLog: "et-tcg-beta-admin-review-log",
  marketPrices: "et-tcg-market-price-cache",
  whatDidISee: "tide_tradr_what_did_i_see_reports",
  theme: "et-tcg-app-theme",
  dailyTide: "et-tcg-daily-tide",
  routeState: "et-tcg-route-state",
  catalogView: "et-tcg-beta-catalog-view",
  catalogPageSize: "et-tcg-beta-catalog-page-size",
  vaultShowcaseView: "et-tcg-beta-vault-showcase-view",
  forgeModeSettings: "et-tcg-forge-mode-settings",
  gradeAssist: "et-grade-assist-checklists",
  emberAssistThread: "et-ember-assist-thread",
  betaReadiness: "et-tcg-beta-readiness",
  phase2: "et-tcg-phase2-data",
};

export const BETA_LOCAL_STORAGE_KEY_AUDIT = [
  { key: BETA_LOCAL_STORAGE_KEYS.app, area: "Core app beta data", owner: "Vault, Forge, Market, Spark, Hearth, settings" },
  { key: BETA_LOCAL_STORAGE_KEYS.scout, area: "Scout beta data", owner: "Scout stores, reports, watch stores, alert settings" },
  { key: BETA_LOCAL_STORAGE_KEYS.tidepool, area: "Tidepool beta data", owner: "Tidepool posts, comments, reactions, Trusted Circle" },
  { key: BETA_LOCAL_STORAGE_KEYS.feedback, area: "Feedback queue", owner: "Feedback and public beta forms" },
  { key: BETA_LOCAL_STORAGE_KEYS.suggestions, area: "Suggestion queue", owner: "Catalog/store/market correction suggestions" },
  { key: BETA_LOCAL_STORAGE_KEYS.adminReviewLog, area: "Admin review log", owner: "Local admin review activity" },
  { key: BETA_LOCAL_STORAGE_KEYS.marketPrices, area: "Market price cache", owner: "Market Watch cached/manual price records" },
  { key: BETA_LOCAL_STORAGE_KEYS.whatDidISee, area: "What Did I See reports", owner: "Local catalog sighting lists" },
  { key: BETA_LOCAL_STORAGE_KEYS.theme, area: "Theme preference", owner: "Appearance settings and onboarding" },
  { key: BETA_LOCAL_STORAGE_KEYS.dailyTide, area: "Daily Tide progress", owner: "Hearth local daily checklist" },
  { key: BETA_LOCAL_STORAGE_KEYS.routeState, area: "Route state", owner: "Last utility route and page state" },
  { key: BETA_LOCAL_STORAGE_KEYS.catalogView, area: "Catalog view preference", owner: "Market catalog view mode" },
  { key: BETA_LOCAL_STORAGE_KEYS.catalogPageSize, area: "Catalog page size", owner: "Market catalog pagination" },
  { key: BETA_LOCAL_STORAGE_KEYS.vaultShowcaseView, area: "Vault display preference", owner: "Vault showcase/list mode" },
  { key: BETA_LOCAL_STORAGE_KEYS.forgeModeSettings, area: "Forge mode settings", owner: "Seller/personal Forge display controls" },
  { key: BETA_LOCAL_STORAGE_KEYS.gradeAssist, area: "Grade Assist checklists", owner: "Manual condition and grade-readiness checklist" },
  { key: BETA_LOCAL_STORAGE_KEYS.emberAssistThread, area: "Ember Assist thread", owner: "Local helper-preview messages" },
  { key: BETA_LOCAL_STORAGE_KEYS.betaReadiness, area: "Beta readiness", owner: "Onboarding, beta feedback, launch readiness" },
  { key: BETA_LOCAL_STORAGE_KEYS.phase2, area: "Phase 2 local fallback", owner: "Local fallback for later connected workflows" },
];

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

export function safeReadBrowserJson(storage, key, fallback) {
  try {
    if (!storage || typeof storage.getItem !== "function") return fallback;
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback;
    if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
    }
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function safeWriteBrowserJson(storage, key, value) {
  try {
    if (!storage || typeof storage.setItem !== "function") return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
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

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function emptyTidepoolData() {
  return { posts: [], comments: [], reactions: [], trustedCircle: [] };
}

export function sanitizeTidepoolLocalData(value = {}) {
  const data = safeObject(value);
  return {
    posts: filterDemoArray(data.posts),
    comments: filterDemoArray(data.comments),
    reactions: filterDemoArray(data.reactions),
    trustedCircle: filterDemoArray(data.trustedCircle),
  };
}

export function sanitizeScoutLocalData(value = {}) {
  const data = safeObject(value);
  return {
    ...data,
    stores: filterDemoArray(data.stores),
    reports: filterDemoArray(data.reports),
    tidepoolReports: filterDemoArray(data.tidepoolReports),
    tidepoolEvents: filterDemoArray(data.tidepoolEvents),
    bestBuyStockResults: filterDemoArray(data.bestBuyStockResults),
    bestBuyStockHistory: filterDemoArray(data.bestBuyStockHistory),
    bestBuyStoreStock: filterDemoArray(data.bestBuyStoreStock),
    bestBuyAlerts: filterDemoArray(data.bestBuyAlerts),
    bestBuyNightlyReports: filterDemoArray(data.bestBuyNightlyReports),
    restockIntel: filterDemoArray(data.restockIntel),
    restockPatterns: filterDemoArray(data.restockPatterns),
    intelImportReviews: filterDemoArray(data.intelImportReviews),
    storeAliases: Array.isArray(data.storeAliases) ? data.storeAliases : [],
    items: filterDemoArray(data.items),
    routes: filterDemoArray(data.routes),
  };
}

export function sanitizeMarketPriceCache(value = {}) {
  const data = safeObject(value);
  return {
    prices: filterDemoArray(data.prices),
    lastSync: data.lastSync || "",
    failedMatches: Array.isArray(data.failedMatches) ? data.failedMatches : [],
  };
}

export function sanitizeAppLocalData(value = {}) {
  const data = safeObject(value);
  return {
    ...data,
    items: filterDemoArray(data.items),
    catalogProducts: filterDemoArray(data.catalogProducts),
    tideTradrWatchlist: filterDemoArray(data.tideTradrWatchlist),
    marketplaceListings: filterDemoArray(data.marketplaceListings),
    marketplaceReports: filterDemoArray(data.marketplaceReports),
    marketPriceMemories: filterDemoArray(data.marketPriceMemories),
    itemComparisons: filterDemoArray(data.itemComparisons),
    vaultCollectionSets: filterDemoArray(data.vaultCollectionSets),
    vaultDisplayCase: filterDemoArray(data.vaultDisplayCase),
    tradeRecords: filterDemoArray(data.tradeRecords || data.trades),
    sparkGifts: filterDemoArray(data.sparkGifts),
    sparkKidPacks: filterDemoArray(data.sparkKidPacks),
    sparkEventPlans: filterDemoArray(data.sparkEventPlans),
    collectorEventPlans: filterDemoArray(data.collectorEventPlans),
    expenses: filterDemoArray(data.expenses),
    sales: filterDemoArray(data.sales),
    vehicles: filterDemoArray(data.vehicles),
    mileageTrips: filterDemoArray(data.mileageTrips),
    workspaces: filterDemoArray(data.workspaces),
    workspaceMembers: filterDemoArray(data.workspaceMembers),
    workspaceInvites: filterDemoArray(data.workspaceInvites),
    activeWorkspaceId: data.activeWorkspaceId || "",
    marketPriceCache: sanitizeMarketPriceCache(data.marketPriceCache || {}),
  };
}

function isRecordObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRecordArray(value) {
  return Array.isArray(value) && value.every(isRecordObject);
}

// Presentation fallbacks are deliberately forgiving. Cleanup is a write, so it
// must first establish that the original bytes describe a supported envelope.
function isCleanupEnvelope(value, sanitize) {
  if (sanitize === filterDemoArray) return isRecordArray(value);
  if (!isRecordObject(value)) return false;
  const defaults = sanitize({});
  for (const [field, fallback] of Object.entries(defaults)) {
    if (!Array.isArray(fallback) || !Object.hasOwn(value, field)) continue;
    const valid = field === "storeAliases" || field === "failedMatches"
      ? Array.isArray(value[field])
      : isRecordArray(value[field]);
    if (!valid) return false;
  }
  if (sanitize === sanitizeAppLocalData) {
    if (Object.hasOwn(value, "trades") && !isRecordArray(value.trades)) return false;
    if (Object.hasOwn(value, "marketPriceCache") && !isCleanupEnvelope(value.marketPriceCache, sanitizeMarketPriceCache)) return false;
  }
  return true;
}

export function isSupportedAppLocalData(value) {
  if (!isCleanupEnvelope(value, sanitizeAppLocalData)) return false;
  for (const field of ["purchasers", "userSearchAliases"]) {
    if (Object.hasOwn(value, field) && !isRecordArray(value[field])) return false;
  }
  if (Object.hasOwn(value, "marketplaceSavedIds") && (!Array.isArray(value.marketplaceSavedIds)
    || !value.marketplaceSavedIds.every((id) => typeof id === "string" || (typeof id === "number" && Number.isFinite(id))))) return false;
  for (const field of ["settings", "forgeModeSettings", "dealForm", "homeStatsEnabled", "dashboardLayout", "appSetupPersonalization", "locationSettings", "subscriptionProfile", "profile"]) {
    if (Object.hasOwn(value, field) && !isRecordObject(value[field])) return false;
  }
  if (value.dashboardLayout && Object.hasOwn(value.dashboardLayout, "sections") && !isRecordArray(value.dashboardLayout.sections)) return false;
  if (value.locationSettings && Object.hasOwn(value.locationSettings, "savedLocations") && (!Array.isArray(value.locationSettings.savedLocations)
    || !value.locationSettings.savedLocations.every((location) => typeof location === "string"))) return false;
  return true;
}

export function cleanupBrowserBetaStorage(storage = globalThis.localStorage) {
  if (!storage) return { changed: false, summary: [] };
  const summary = [];
  const targets = [
    [BETA_LOCAL_STORAGE_KEYS.app, sanitizeAppLocalData],
    [BETA_LOCAL_STORAGE_KEYS.scout, sanitizeScoutLocalData],
    [BETA_LOCAL_STORAGE_KEYS.tidepool, sanitizeTidepoolLocalData],
    [BETA_LOCAL_STORAGE_KEYS.marketPrices, sanitizeMarketPriceCache],
    [BETA_LOCAL_STORAGE_KEYS.suggestions, filterDemoArray],
    [BETA_LOCAL_STORAGE_KEYS.feedback, filterDemoArray],
    [BETA_LOCAL_STORAGE_KEYS.adminReviewLog, filterDemoArray],
    [BETA_LOCAL_STORAGE_KEYS.whatDidISee, filterDemoArray],
  ];
  for (const [key, sanitize] of targets) {
    let raw;
    try {
      raw = storage.getItem(key);
    } catch {
      summary.push({ key, status: "read-failed" });
      continue;
    }
    if (raw === null || raw === undefined) {
      summary.push({ key, status: "absent" });
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      summary.push({ key, status: "invalid" });
      continue;
    }
    let next;
    let unchanged;
    try {
      if (!(sanitize === sanitizeAppLocalData ? isSupportedAppLocalData(parsed) : isCleanupEnvelope(parsed, sanitize))) {
        summary.push({ key, status: "invalid" });
        continue;
      }
      const sanitized = sanitize(parsed);
      next = Array.isArray(parsed) ? sanitized : { ...parsed, ...sanitized };
      if (sanitize === sanitizeAppLocalData && isRecordObject(parsed.marketPriceCache)) {
        next.marketPriceCache = { ...parsed.marketPriceCache, ...sanitized.marketPriceCache };
      }
      unchanged = JSON.stringify(next) === JSON.stringify(parsed);
    } catch {
      summary.push({ key, status: "invalid" });
      continue;
    }
    // Do not rewrite formatting alone, and do not replace a newer snapshot.
    if (unchanged) {
      summary.push({ key, status: "unchanged" });
      continue;
    }
    try {
      if (storage.getItem(key) !== raw) {
        summary.push({ key, status: "changed-during-read" });
        continue;
      }
    } catch {
      summary.push({ key, status: "read-failed" });
      continue;
    }
    summary.push({ key, status: safeWriteBrowserJson(storage, key, next) ? "sanitized" : "write-failed" });
  }
  return { changed: summary.some(({ status }) => status === "sanitized"), summary };
}
