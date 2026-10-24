const text = value => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";

// These shortcuts reuse a directory location, never somebody else's sighting.
export function recentReportedStoreRows({ reports = [], storeRows = [], ownerId = "", limit = 3 } = {}) {
  const owner = text(ownerId);
  if (!owner) return [];
  const stores = new Map(storeRows.filter(row => row?.id && row.store?.active !== false).map(row => [text(row.id), row]));
  const seen = new Set();
  const timestamp = report => Date.parse(report.submittedAt || report.submitted_at || report.createdAt || report.created_at || report.reportedAt || report.reported_at || "") || 0;
  return reports
    .filter(report => report && text(report.userId || report.user_id) === owner && !/deleted|archived|rejected/.test(text(report.status).toLowerCase()))
    .slice().sort((a, b) => timestamp(b) - timestamp(a))
    .flatMap(report => {
      const id = text(report.storeId || report.store_id || report.selectedStoreId || report.selected_store_id);
      if (!stores.has(id) || seen.has(id)) return [];
      seen.add(id);
      return [stores.get(id)];
    }).slice(0, Math.max(0, Math.min(3, Number(limit) || 0)));
}

// The next visit must get new facts and proof. Only the privacy choice is reused.
export function freshRestockVisitDefaults(report = {}) {
  return {
    reportType: "",
    reportTypeTouched: false,
    visibility: ["public", "private_from_map", "admin_only"].includes(report.visibility) ? report.visibility : "private_from_map",
  };
}
