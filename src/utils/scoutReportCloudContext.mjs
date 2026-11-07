import { normalizeStoreStateCode } from "../data/storeStates.js";

// The deployed reports table predates dedicated source/location columns. Keep only
// non-authoritative report context in a versioned notes footer; moderation and
// sharing always come from the server's own columns. No OCR text/image is added.
const PREFIX = "\n\n[Code 3 report context v1:";
const STOCK_STATUSES = new Set([
  "stock_on_shelf", "low_stock", "no_stock", "restock_happening_now",
  "vendor_seen", "leftover_stock", "stock_seen", "other", "reported",
  "limit_posted", "behind_counter", "customer_service", "unsure", "truck_vendor_seen",
  "shelf_tag_only", "line_queue_seen", "online_stock_changed", "confirmed_purchase", "other_intel", "employee_restock_coming",
]);
const PLATFORM_LABELS = { facebook: "Facebook screenshot", discord: "Discord screenshot", other: "Community screenshot" };

export function decodeScoutReportCloudNotes(value) {
  const notes = typeof value === "string" ? value : "";
  const start = notes.lastIndexOf(PREFIX);
  const empty = { notes, sourceType: "", sourceLabel: "", reportStatus: "" };
  if (start < 0 || !notes.endsWith("]")) return empty;
  const encoded = notes.slice(start + PREFIX.length, -1);
  if (encoded.length > 600) return empty;
  try {
    const context = JSON.parse(encoded);
    if (!context || typeof context !== "object" || Array.isArray(context)
      || Object.keys(context).some((key) => !["source", "platform", "stockStatus", "city", "state", "region"].includes(key))
      || (context.source !== undefined && context.source !== "text_screenshot")
      || (context.platform !== undefined && !Object.hasOwn(PLATFORM_LABELS, context.platform))
      || (context.stockStatus !== undefined && !STOCK_STATUSES.has(context.stockStatus))
      || (context.state !== undefined && (!normalizeStoreStateCode(context.state) || context.state !== normalizeStoreStateCode(context.state)))
      || (context.city !== undefined && (typeof context.city !== "string" || context.city.length > 80 || /[\u0000-\u001f]/.test(context.city)))
      || (context.region !== undefined && (typeof context.region !== "string" || context.region.length > 100 || /[\u0000-\u001f]/.test(context.region)))) return empty;
    return {
      notes: notes.slice(0, start),
      sourceType: context.source === "text_screenshot" ? "text_screenshot" : "",
      sourceLabel: context.source === "text_screenshot" ? PLATFORM_LABELS[context.platform] || PLATFORM_LABELS.other : "",
      reportStatus: context.stockStatus || "",
      ...(context.state ? { storeLocation: { city: context.city || "", state: context.state, region: context.region || "" } } : {}),
    };
  } catch {
    return empty;
  }
}

export function encodeScoutReportCloudNotes(report = {}) {
  const { notes } = decodeScoutReportCloudNotes(report.notes || report.note || report.proofText || "");
  const screenshot = report.sourceType === "text_screenshot" || report.source_type === "text_screenshot"
    || report.screenshotImportReviewed === true || report.proofType === "text_screenshot";
  const context = {};
  if (screenshot) {
    const label = report.sourceLabel || report.source_label;
    const platform = report.screenshotSourcePlatform || (label === PLATFORM_LABELS.facebook ? "facebook" : label === PLATFORM_LABELS.discord ? "discord" : "other");
    context.source = "text_screenshot";
    context.platform = Object.hasOwn(PLATFORM_LABELS, platform) ? platform : "other";
  }
  const stockStatus = report.reportStatus || report.report_status || report.quickReportType;
  if (STOCK_STATUSES.has(stockStatus)) context.stockStatus = stockStatus;
  const state = normalizeStoreStateCode(report.state);
  if (state) {
    context.state = state;
    for (const [key, max] of [["city", 80], ["region", 100]]) {
      const value = typeof report[key] === "string" ? report[key].replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "";
      if (value) context[key] = value;
    }
  }
  return Object.keys(context).length ? `${notes}${PREFIX}${JSON.stringify(context)}]` : notes;
}

// Preserve reviewed device details in the account-synced envelope after the
// server assigns its ID. Copy only known report fields, never transient OCR data.
export function mergeScoutReportCloudSave(local = {}, cloud = {}) {
  const details = {};
  for (const key of [
    "itemsSeen", "photoUrls", "catalogProductId", "catalog_product_id", "catalogProductName",
    "productImageUrl", "product_image_url", "productCategory", "product_category",
    "manualLocation", "state", "zip", "stockLeft", "storeFollowPreference", "store_follow_preference",
    "needsStoreReview", "needsReview", "needs_review", "quickReportType", "quickReportLabel",
    "scoutPointsValue", "scout_points_value", "displayName", "username", "publicUsername", "public_username",
  ]) if (Object.hasOwn(local, key)) details[key] = local[key];
  const merged = { ...details, ...cloud };
  for (const key of ["city", "state", "address", "region", "retailer", "chain"]) {
    if (!merged[key] && local[key]) merged[key] = local[key];
  }
  return merged;
}
