// Two-tap restock report (SHOULD 18, 2026-11-14).
//
// The full report keeps its four required fields (store, observed time, shelf
// status, item/details — the trust minimum, A86/A87). This makes the common
// case fast without weakening it: tap a store you follow, tap a status, and
// the review step opens already filled with "now" and the product category
// you used last time. Posting is the third tap, and the person can still
// change anything first.

export const QUICK_REPORT_MEMORY_KEY = "code3-quick-restock-v1";

export const QUICK_REPORT_STATUSES = [
  { value: "stock_on_shelf", label: "Stock seen", short: "In stock", tone: "positive" },
  { value: "low_stock", label: "Low stock", short: "Low", tone: "caution" },
  { value: "no_stock", label: "No stock", short: "Empty", tone: "neutral" },
];

export const DEFAULT_QUICK_CATEGORY = "Pokémon TCG sealed";
// Build-11 simulated beta: 43% of first-time quick reports were singles
// hunters who had to change the pre-filled category. Offer the choice up front
// and remember it per store.
export const QUICK_REPORT_CATEGORIES = [
  { value: "Pokémon TCG sealed", label: "Sealed" },
  { value: "Pokémon TCG singles", label: "Singles" },
  { value: "Pokémon TCG sealed and singles", label: "Both" },
];

export function readQuickReportMemory(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(QUICK_REPORT_MEMORY_KEY) || "{}");
    return {
      lastStoreId: String(parsed.lastStoreId || ""),
      lastStoreName: String(parsed.lastStoreName || ""),
      lastCategory: String(parsed.lastCategory || ""),
      lastStatus: String(parsed.lastStatus || ""),
      categoryByStore: parsed.categoryByStore && typeof parsed.categoryByStore === "object" ? parsed.categoryByStore : {},
    };
  } catch { return { lastStoreId: "", lastStoreName: "", lastCategory: "", lastStatus: "", categoryByStore: {} }; }
}

export function rememberQuickReportChoice(choice = {}, storage = globalThis.localStorage) {
  const current = readQuickReportMemory(storage);
  const storeKey = String(choice.storeId || choice.storeName || current.lastStoreId || current.lastStoreName || "");
  const categoryByStore = { ...(current.categoryByStore || {}) };
  if (storeKey && choice.category) categoryByStore[storeKey] = String(choice.category);
  const next = {
    lastStoreId: String(choice.storeId ?? current.lastStoreId ?? ""),
    lastStoreName: String(choice.storeName ?? current.lastStoreName ?? ""),
    lastCategory: String(choice.category ?? current.lastCategory ?? ""),
    lastStatus: String(choice.status ?? current.lastStatus ?? ""),
    categoryByStore: Object.fromEntries(Object.entries(categoryByStore).slice(-20)),
  };
  try { storage?.setItem(QUICK_REPORT_MEMORY_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  return next;
}

function storeId(store = {}) { return String(store.id || store.storeId || store.store_id || ""); }
function storeName(store = {}) { return String(store.storeName || store.store_name || store.nickname || store.name || ""); }

/**
 * Stores to offer as the first tap: the remembered one first, then followed
 * stores, then suggested directory stores (so people who follow nothing yet
 * still get the fast path) — never more than `limit`, no duplicates.
 */
export function quickReportStoreChoices({ followed = [], nearby = [], memory = {}, limit = 4 } = {}) {
  const seen = new Set();
  const out = [];
  const push = (store, reason) => {
    const id = storeId(store);
    const key = id || storeName(store).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ id, name: storeName(store) || "Store", retailer: String(store.retailer || store.chain || ""), reason, store });
  };
  if (memory.lastStoreId || memory.lastStoreName) {
    const remembered = [...followed, ...nearby].find((store) => (memory.lastStoreId && storeId(store) === memory.lastStoreId) || (memory.lastStoreName && storeName(store) === memory.lastStoreName));
    if (remembered) push(remembered, "Last reported");
  }
  followed.forEach((store) => push(store, "Followed"));
  nearby.forEach((store) => push(store, "Suggested"));
  return out.slice(0, Math.max(1, limit));
}

/** The category to pre-select for a store: this store's last, then the last anywhere, then Sealed. */
export function categoryForStore(store = {}, memory = {}) {
  const key = storeId(store) || storeName(store);
  return (memory.categoryByStore && memory.categoryByStore[key]) || memory.lastCategory || DEFAULT_QUICK_CATEGORY;
}

/** Options for openScoutSubmitFlow: lands on the review step with time = now. */
export function buildQuickReportOptions({ store, status, category = "", memory = {}, now = new Date() } = {}) {
  const chosen = QUICK_REPORT_STATUSES.find((entry) => entry.value === status) || QUICK_REPORT_STATUSES[0];
  return {
    source: "home-quick-report",
    store,
    reportType: chosen.value,
    productCategory: category || categoryForStore(store, memory),
    observedAt: now.toISOString(),
    startStep: "review",
    quick: true,
  };
}
