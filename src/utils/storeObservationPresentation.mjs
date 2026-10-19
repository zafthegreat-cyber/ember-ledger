import { restockReportObservedTimestamp } from "./restockFeedPresentation.mjs";

function savedTimestamp(report) {
  const raw = report.submittedAt || report.submitted_at || report.createdAt || report.created_at || report.reportedAt || report.reported_at;
  const timestamp = raw ? Date.parse(String(raw)) : NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

// Callers supply only reports the viewer may see for this exact store.
export function selectStoreObservation(reports = [], now) {
  const entries = reports.filter((report) => report && typeof report === "object" && !Array.isArray(report)).map((report, index) => ({
    report,
    index,
    observedAt: restockReportObservedTimestamp(report),
    savedAt: savedTimestamp(report),
  }));
  const latestDated = entries.filter((entry) => Number.isFinite(entry.observedAt) && entry.observedAt <= now)
    .sort((left, right) => right.observedAt - left.observedAt || left.index - right.index)[0];
  if (latestDated) return { report: latestDated.report, observedAt: latestDated.observedAt, isDatedPast: true };
  const latestSaved = [...entries].sort((left, right) => (right.savedAt ?? -Infinity) - (left.savedAt ?? -Infinity) || left.index - right.index)[0];
  return { report: latestSaved?.report || null, observedAt: latestSaved?.observedAt ?? null, isDatedPast: false };
}

export function storeObservationProductSummary(report = {}) {
  const items = Array.isArray(report.itemsSeen) ? report.itemsSeen : Array.isArray(report.items_seen) ? report.items_seen : [];
  const snapshot = report.catalogProductSnapshot || report.catalog_product_snapshot || {};
  const names = items.map((item) => item?.productName || item?.product_name || item?.name).filter(Boolean);
  if (!names.length) names.push(report.itemName || report.item_name || report.productName || report.product_name || report.manualItemName || snapshot.name || snapshot.productName || snapshot.product_name || snapshot.cardName || snapshot.card_name || snapshot.title || "");
  const unique = [...new Set(names.map((name) => String(name).trim()).filter(Boolean))];
  return unique.length ? `${unique.slice(0, 3).join(" · ")}${unique.length > 3 ? ` · +${unique.length - 3} more` : ""}` : "No product details added";
}
