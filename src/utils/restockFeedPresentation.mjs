const STOCK_SEEN_STATUSES = new Set(["in_stock", "stock_on_shelf", "stock_seen", "leftover_stock", "behind_counter", "vendor_stocking", "restock_happening_now"]);

export const RESTOCK_FEED_FILTERS = [
  { value: "all", label: "All reports" },
  { value: "stock", label: "Stock seen" },
  { value: "low", label: "Low stock" },
  { value: "empty", label: "Empty shelves" },
];

export function restockReportStockGroup(report = {}) {
  const status = String(report.stockStatus || report.stock_status || report.reportStatus || report.report_status || "").toLowerCase();
  if (STOCK_SEEN_STATUSES.has(status)) return "stock";
  if (status === "low_stock") return "low";
  if (["empty", "no_stock", "out_of_stock", "sold_out"].includes(status)) return "empty";
  return "other";
}

// Cloud report context retains the quick-report code, while older local reports
// use shelf-status aliases. Both describe the same observation, not verification.
export function restockReportStockLabel(report = {}) {
  const status = String(report.stockStatus || report.stock_status || report.reportStatus || report.report_status || "").toLowerCase();
  if (status === "restock_happening_now") return "Vendor stocking";
  return { stock: "Stock seen", low: "Low stock", empty: "Empty shelves" }[restockReportStockGroup(report)] || "Stock not specified";
}

export function restockReportObservedTimestamp(report = {}) {
  const raw = report.observedAt || report.observed_at || report.reportedAt || report.reported_at || report.reportDate || report.report_date || report.submittedAt || report.submitted_at || report.createdAt || report.created_at;
  if (!raw) return null;
  const value = String(raw);
  const timestamp = Date.parse(value.includes("T") ? value : `${value.slice(0, 10)}T${report.reportTime || report.report_time || "00:00"}`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function restockReportObservedLabel(report = {}, now = Date.now()) {
  const timestamp = restockReportObservedTimestamp(report);
  if (timestamp === null) return "Observation time unavailable";
  const date = new Date(timestamp);
  const dateLabel = date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  if (timestamp > now) return `Future observation date · ${dateLabel}`;
  const minutes = Math.floor((now - timestamp) / 60000);
  if (minutes < 1) return "Observed just now";
  if (minutes < 60) return `Observed ${minutes} min ago`;
  if (date.toDateString() === new Date(now).toDateString()) return `Observed today at ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  return `Observed ${dateLabel}`;
}

export function restockReportTrustLabel(report = {}, hasPhoto = false) {
  if (String(report.sourceType || report.source_type || "").toLowerCase() === "historical_import" || report.importedByAdmin || report.imported_by_admin) return "Historical import";
  const status = String(report.verificationStatus || report.verification_status || "").toLowerCase().trim();
  if (report.verified === true || status === "verified") return "Verified";
  return hasPhoto ? "Photo attached" : "Needs confirmation";
}

export function restockReportSearchText(report = {}, store = {}) {
  const items = Array.isArray(report.itemsSeen) ? report.itemsSeen : Array.isArray(report.items_seen) ? report.items_seen : [];
  const snapshot = report.catalogProductSnapshot || report.catalog_product_snapshot || {};
  return [
    store.nickname, store.name, store.chain, store.retailer, store.city, store.region,
    report.storeName, report.store_name, report.retailer, report.city, report.region,
    report.itemName, report.item_name, report.productName, report.product_name, report.manualItemName,
    report.productCategory, report.product_category, report.productType, report.product_type,
    snapshot.name, snapshot.productName, snapshot.product_name, snapshot.cardName, snapshot.card_name, snapshot.title,
    report.note, report.notes, report.reportText, report.report_text,
    ...items.flatMap((item) => [item.productName, item.product_name, item.name]),
  ].filter(Boolean).join(" ").toLocaleLowerCase();
}

const filterKey = (value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
const filterLabel = (value) => String(value || "").trim().replace(/\s+/g, " ");

// Only use the same permitted reports and store summaries supplied to the feed.
// Do not populate these options from the wider store directory or private reports.
export function prepareRestockFeedEntries(reports = [], getStore = () => ({})) {
  return reports.map((report) => {
    const store = getStore(report) || {};
    const retailerLabel = filterLabel(store.chain || store.retailer || report.retailer);
    const city = filterLabel(store.city || report.city);
    const region = filterLabel(store.region || report.region);
    return {
      report,
      stockGroup: restockReportStockGroup(report),
      observedAt: restockReportObservedTimestamp(report),
      searchText: restockReportSearchText(report, store),
      retailer: filterKey(retailerLabel),
      retailerLabel,
      city: city ? JSON.stringify([filterKey(city), filterKey(region)]) : "",
      cityLabel: city ? [city, region].filter(Boolean).join(", ") : "",
    };
  }).sort((a, b) => (b.observedAt ?? -Infinity) - (a.observedAt ?? -Infinity));
}

export function restockFeedLocationOptions(entries = []) {
  function options(key, label) {
    const unique = new Map();
    for (const entry of entries) {
      if (entry[key] && !unique.has(entry[key])) unique.set(entry[key], { value: entry[key], label: entry[label] });
    }
    return [...unique.values()].sort((a, b) => a.label.localeCompare(b.label));
  }
  return { retailers: options("retailer", "retailerLabel"), cities: options("city", "cityLabel") };
}

// This operates only on reports already permitted by Scout's existing visibility checks.
export function filterRestockFeed(entries = [], { search = "", stock = "all", period = "all", retailer = "", city = "" } = {}, now = Date.now()) {
  const terms = String(search).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const windowMs = period === "24h" ? 24 * 60 * 60 * 1000 : period === "7d" ? 7 * 24 * 60 * 60 * 1000 : null;
  return entries.filter((entry) => {
    if (stock !== "all" && entry.stockGroup !== stock) return false;
    if (retailer && entry.retailer !== retailer) return false;
    if (city && entry.city !== city) return false;
    if (terms.some((term) => !entry.searchText.includes(term))) return false;
    if (windowMs !== null && (!Number.isFinite(entry.observedAt) || entry.observedAt > now || now - entry.observedAt > windowMs)) return false;
    return true;
  });
}

export function restockFeedBrowseState(entries = [], filters = {}, now = Date.now()) {
  // Counts describe what each stock button would show with the other filters kept.
  // These are report counts, never available inventory or a confidence score.
  const base = filterRestockFeed(entries, { ...filters, stock: "all" }, now);
  const counts = { all: base.length, stock: 0, low: 0, empty: 0 };
  for (const entry of base) if (Object.hasOwn(counts, entry.stockGroup) && entry.stockGroup !== "all") counts[entry.stockGroup] += 1;
  const matches = filters.stock && filters.stock !== "all" ? base.filter((entry) => entry.stockGroup === filters.stock) : base;
  return {
    matches,
    counts,
    recentCount: matches.filter((entry) => Number.isFinite(entry.observedAt) && entry.observedAt <= now && now - entry.observedAt <= 24 * 60 * 60 * 1000).length,
    undatedCount: matches.filter((entry) => !Number.isFinite(entry.observedAt)).length,
  };
}
