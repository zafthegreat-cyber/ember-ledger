export const SUGGESTION_STORAGE_KEY = "et-tcg-beta-suggestions";
export const ADMIN_REVIEW_LOG_STORAGE_KEY = "et-tcg-beta-admin-review-log";

export const SUGGESTION_STATUSES = [
  "Draft",
  "Submitted",
  "Under Review",
  "Approved",
  "Rejected",
  "Needs More Info",
  "Merged",
];

export const OPEN_SUGGESTION_STATUSES = new Set(["Draft", "Submitted", "Under Review", "Needs More Info"]);

export const SUGGESTION_TYPES = {
  ADD_MISSING_STORE: "add_missing_store",
  EDIT_STORE_DETAILS: "edit_store_details",
  FLAG_DUPLICATE_STORE: "flag_duplicate_store",
  REPORT_CLOSED_STORE: "report_closed_store",
  SUGGEST_STORE_NICKNAME: "suggest_store_nickname",
  SUGGEST_STORE_REGION_CORRECTION: "suggest_store_region_correction",
  SUGGEST_POKEMON_STOCK_LIKELIHOOD: "suggest_pokemon_stock_likelihood",
  ADD_MISSING_CATALOG_PRODUCT: "add_missing_catalog_product",
  CORRECT_CATALOG_PRODUCT: "correct_catalog_product",
  ADD_UPC_SKU: "add_upc_sku",
  ADD_BEST_BUY_SKU: "add_best_buy_sku",
  CORRECT_MSRP: "correct_msrp",
  CORRECT_PRODUCT_METADATA: "correct_product_metadata",
  SUGGEST_RESTOCK_PATTERN: "suggest_restock_pattern",
  SUGGEST_PURCHASE_LIMIT: "suggest_purchase_limit",
  SCOUT_REPORT_REVIEW: "scout_report_review",
};

export const SUGGESTION_TYPE_LABELS = {
  [SUGGESTION_TYPES.ADD_MISSING_STORE]: "Suggest Missing Store",
  [SUGGESTION_TYPES.EDIT_STORE_DETAILS]: "Suggest Store Correction",
  [SUGGESTION_TYPES.FLAG_DUPLICATE_STORE]: "Flag Duplicate Store",
  [SUGGESTION_TYPES.REPORT_CLOSED_STORE]: "Report Closed Store",
  [SUGGESTION_TYPES.SUGGEST_STORE_NICKNAME]: "Suggest Store Nickname",
  [SUGGESTION_TYPES.SUGGEST_STORE_REGION_CORRECTION]: "Suggest City / Region Correction",
  [SUGGESTION_TYPES.SUGGEST_POKEMON_STOCK_LIKELIHOOD]: "Suggest Pokemon Stock Likelihood",
  [SUGGESTION_TYPES.ADD_MISSING_CATALOG_PRODUCT]: "Suggest Missing Product",
  [SUGGESTION_TYPES.CORRECT_CATALOG_PRODUCT]: "Suggest Product Correction",
  [SUGGESTION_TYPES.ADD_UPC_SKU]: "Suggest UPC / SKU",
  [SUGGESTION_TYPES.ADD_BEST_BUY_SKU]: "Suggest Best Buy SKU",
  [SUGGESTION_TYPES.CORRECT_MSRP]: "Correct MSRP",
  [SUGGESTION_TYPES.CORRECT_PRODUCT_METADATA]: "Correct Product Info",
  [SUGGESTION_TYPES.SUGGEST_RESTOCK_PATTERN]: "Suggest Restock Pattern",
  [SUGGESTION_TYPES.SUGGEST_PURCHASE_LIMIT]: "Suggest Purchase Limit",
  [SUGGESTION_TYPES.SCOUT_REPORT_REVIEW]: "Scout Report Review",
};

export const REVIEW_SECTION_LABELS = {
  store: "Missing Store / Store Corrections",
  catalog: "Catalog Suggestions",
  sku: "SKU / UPC Suggestions",
  bestBuy: "Best Buy Product Suggestions",
  reports: "Scout Report Review",
  intelligence: "Store Intelligence Suggestions",
  flagged: "Duplicate / Closed Store Reports",
};

function safeParse(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function makeSuggestionId() {
  return `suggestion-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function loadSuggestions() {
  if (typeof localStorage === "undefined") return [];
  const parsed = safeParse(localStorage.getItem(SUGGESTION_STORAGE_KEY), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveSuggestions(suggestions = []) {
  if (typeof localStorage === "undefined") return suggestions;
  localStorage.setItem(SUGGESTION_STORAGE_KEY, JSON.stringify(suggestions));
  return suggestions;
}

export function makeSuggestion(input = {}) {
  const now = new Date().toISOString();
  return {
    id: input.id || makeSuggestionId(),
    userId: input.userId || "local-beta-user",
    displayName: input.displayName || "Local Beta User",
    suggestionType: input.suggestionType || SUGGESTION_TYPES.EDIT_STORE_DETAILS,
    targetTable: input.targetTable || "shared_data",
    targetRecordId: input.targetRecordId || null,
    submittedData: input.submittedData || {},
    currentDataSnapshot: input.currentDataSnapshot || null,
    notes: input.notes || "",
    proofUrl: input.proofUrl || "",
    source: input.source || "local-beta",
    status: input.status || "Submitted",
    adminNote: input.adminNote || "",
    reviewedBy: input.reviewedBy || "",
    reviewedAt: input.reviewedAt || "",
    confidence: input.confidence || input.confidenceScore || "user-submitted",
    confirmationOf: input.confirmationOf || "",
    visibility: input.visibility || input.submittedData?.visibility || "",
    adminReviewVisible: input.adminReviewVisible === false ? false : true,
    admin_review_visible: input.admin_review_visible === false ? false : true,
    adminVisibilityDisclosedAt: input.adminVisibilityDisclosedAt || input.admin_visibility_disclosed_at || now,
    admin_visibility_disclosed_at: input.admin_visibility_disclosed_at || input.adminVisibilityDisclosedAt || now,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function suggestionIdentityParts(suggestion = {}) {
  const data = suggestion.submittedData || {};
  return [
    suggestion.suggestionType,
    suggestion.targetTable,
    suggestion.targetRecordId || "",
    data.storeId || data.id || data.catalogItemId || data.productId || data.bestBuySku || "",
    data.upc || data.UPC || data.barcode || "",
    data.sku || data.SKU || "",
    data.address || "",
    data.zip || "",
    data.name || data.storeName || data.productName || data.cardName || data.itemName || "",
  ].map(normalizeText);
}

export function findSimilarSuggestion(suggestions = [], suggestion = {}) {
  const incoming = suggestionIdentityParts(suggestion);
  return suggestions.find((existing) => {
    if (!OPEN_SUGGESTION_STATUSES.has(existing.status)) return false;
    if (existing.suggestionType !== suggestion.suggestionType) return false;
    if (existing.targetTable !== suggestion.targetTable) return false;
    if (existing.targetRecordId && suggestion.targetRecordId && existing.targetRecordId === suggestion.targetRecordId) return true;

    const current = suggestionIdentityParts(existing);
    const sharedStrongValue = [3, 4, 5].some((index) => incoming[index] && current[index] && incoming[index] === current[index]);
    const sameNamedAddress =
      incoming[8] &&
      current[8] &&
      incoming[8] === current[8] &&
      ((incoming[6] && current[6] && incoming[6] === current[6]) ||
        (incoming[7] && current[7] && incoming[7] === current[7]));
    return sharedStrongValue || sameNamedAddress;
  });
}

export function submitSuggestion(input = {}, options = {}) {
  const suggestions = loadSuggestions();
  const suggestion = makeSuggestion(input);
  const duplicate = findSimilarSuggestion(suggestions, suggestion);
  if (duplicate && !options.allowDuplicate) {
    return { ok: false, reason: "duplicate", duplicate, suggestion, suggestions };
  }
  const next = [suggestion, ...suggestions];
  saveSuggestions(next);
  return { ok: true, suggestion, suggestions: next };
}

export function updateSuggestionRecord(id, updates = {}) {
  const now = new Date().toISOString();
  const next = loadSuggestions().map((suggestion) =>
    suggestion.id === id ? { ...suggestion, ...updates, updatedAt: now } : suggestion
  );
  saveSuggestions(next);
  return next;
}

export function appendAdminReviewLog(entry = {}) {
  if (typeof localStorage === "undefined") return [];
  const current = safeParse(localStorage.getItem(ADMIN_REVIEW_LOG_STORAGE_KEY), []);
  const now = new Date().toISOString();
  const next = [
    {
      id: entry.id || `review-log-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      action: entry.action || "review",
      suggestionId: entry.suggestionId || "",
      reviewedBy: entry.reviewedBy || "local-beta-admin",
      notes: entry.notes || "",
      createdAt: now,
    },
    ...(Array.isArray(current) ? current : []),
  ];
  localStorage.setItem(ADMIN_REVIEW_LOG_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function getSuggestionReviewSection(suggestion = {}) {
  const type = suggestion.suggestionType;
  if ([SUGGESTION_TYPES.ADD_MISSING_STORE, SUGGESTION_TYPES.EDIT_STORE_DETAILS, SUGGESTION_TYPES.SUGGEST_STORE_NICKNAME, SUGGESTION_TYPES.SUGGEST_STORE_REGION_CORRECTION].includes(type)) return "store";
  if ([SUGGESTION_TYPES.ADD_MISSING_CATALOG_PRODUCT, SUGGESTION_TYPES.CORRECT_CATALOG_PRODUCT, SUGGESTION_TYPES.CORRECT_MSRP, SUGGESTION_TYPES.CORRECT_PRODUCT_METADATA].includes(type)) return "catalog";
  if (type === SUGGESTION_TYPES.ADD_UPC_SKU) return "sku";
  if (type === SUGGESTION_TYPES.ADD_BEST_BUY_SKU) return "bestBuy";
  if (type === SUGGESTION_TYPES.SCOUT_REPORT_REVIEW) return "reports";
  if ([SUGGESTION_TYPES.SUGGEST_RESTOCK_PATTERN, SUGGESTION_TYPES.SUGGEST_PURCHASE_LIMIT, SUGGESTION_TYPES.SUGGEST_POKEMON_STOCK_LIKELIHOOD].includes(type)) return "intelligence";
  if ([SUGGESTION_TYPES.FLAG_DUPLICATE_STORE, SUGGESTION_TYPES.REPORT_CLOSED_STORE].includes(type)) return "flagged";
  return "flagged";
}

export function suggestionTitle(suggestion = {}) {
  const data = suggestion.submittedData || {};
  return (
    data.name ||
    data.storeName ||
    data.productName ||
    data.cardName ||
    data.itemName ||
    SUGGESTION_TYPE_LABELS[suggestion.suggestionType] ||
    "Shared data suggestion"
  );
}
