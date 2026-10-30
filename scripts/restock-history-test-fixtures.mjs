import { sha256Text } from "../src/features/backup/canonicalJson.js";
import { historicalRestockSummary } from "../src/features/restockHistory/historyArchive.mjs";

export const syntheticOwner = "11111111-1111-4111-8111-111111111111";
export const source = () => ({ batchId: `user-feed-${"a".repeat(16)}`, kind: "user_supplied_feed_transcript", platform: "another_app_or_website", platformName: null,
  suppliedLocalDate: "2026-10-29", file: "synthetic-source.txt", sha256: "a".repeat(64), byteLength: 1234,
  originalReportIdsAvailable: false, originalPermalinksAvailable: false, independentlyVerified: false,
  reportAppearances: 35, distinctReportsWithinSource: 35, repeatedWithinSource: 0, matchedEarlierReports: 0,
  addedDistinctObservations: 35, snapshotAppearances: 0 });

export async function syntheticHistory(count = 35, start = 0) {
  const batch = source(), rows = [];
  for (let i = start; i < start + count; i++) {
    const status = i % 2 ? "Restock reported" : "No stock found", note = `Synthetic shelf note ${i + 1}`;
    const at = `2026-10-${i < 20 ? "12" : "13"}T11:${String(i % 20).padStart(2, "0")}:00-04:00`;
    const store = { retailer: "Synthetic Cards", branch: i % 2 ? "Harbor" : "North", city: "Synthetic Town", state: "VA", storeId: null };
    store.identityKey = [store.retailer, store.branch, store.city, store.state].map(value => value.toLowerCase()).join("|");
    const observedAtUtc = new Date(at).toISOString(), occurrenceKey = `${store.identityKey}|${observedAtUtc}`;
    const quantity = i % 2 ? "2" : "0 observed", line = "Not reported";
    const contentKey = await sha256Text(JSON.stringify([occurrenceKey, status, note, quantity, line]));
    const originalReportText = `${status}\n● Needs a check · 17 days ago\n\n${note}\n\nSynthetic Cards · ${store.branch}\nSynthetic Town, VA\nChecked · Oct 12, 2026, 11:00 AM ET\n\nQuantity ${quantity}\nLine ${line}\nView report\nDirections`;
    rows.push({ id: `history-${contentKey.slice(0, 24)}`, ordinal: i + 1, contentKey, occurrenceKey,
      sourceReportId: null, sourceUrl: null, store, observedAt: at, observedAtUtc, timeZone: "America/New_York",
      originalTimeLabel: "Checked", originalTimeText: "Oct 12, 2026, 11:00 AM ET", reportedStatus: status,
      reportedOutcome: i % 2 ? "stock_reported" : "no_stock_reported", originalNote: note, reportedQuantityText: quantity,
      reportedQueueText: line, reportedAbsenceScope: null, photoReferences: [], verificationStatus: "unverified",
      historicalOnly: true, shouldTrainPredictions: false, restockArrivalTimeEstablished: false, reviewFlags: [], historySnapshots: [],
      sourceStartLine: 1, sourceEndLine: 14, copiedFreshnessLabel: "● Needs a check · 17 days ago", originalReportText,
      sourceOccurrences: [{ batchId: batch.batchId, sourceOrdinal: i + 1, sourceStartLine: 1, sourceEndLine: 14,
        copiedFreshnessLabel: "● Needs a check · 17 days ago", originalReportText }] });
  }
  const archive = { schemaVersion: 2, archiveId: "code3-owner-supplied-restock-history", sources: [batch],
    storage: { location: "local_workspace_only", uploadedToApp: false, uploadedToCloud: false, public: false },
    constraints: ["Synthetic historical source claims only; not current stock."], summary: {}, observations: rows, snapshotOnlyClaims: [] };
  archive.summary = historicalRestockSummary(archive);
  return archive;
}

export class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  snapshot() { return JSON.stringify([...this.values].sort(([a], [b]) => a.localeCompare(b))); }
}

export const syntheticScout = () => ({ stores: [{ id: "synthetic-existing-store", name: "Existing store" }],
  reports: [{ id: "synthetic-existing-report", stockStatus: "in_stock", quantity: 2 }],
  restockIntel: [{ id: "synthetic-existing-intel", confidence: "possible" }],
  restockPatterns: [{ id: "synthetic-existing-pattern" }], alertSettings: { enabled: true },
  futureField: { untouched: "original" } });

export const syntheticStorage = scout => new MemoryStorage({
  "code3.workspace-owner.v1": { version: 1, ownerId: syntheticOwner },
  "et-tcg-beta-scout": scout || syntheticScout(),
  "et-tcg-beta-data": { items: [{ id: "retained-item", name: "Synthetic retained item", quantity: 2, marketValue: 81.05 }],
    sales: [{ id: "retained-sale", salePrice: 15 }], expenses: [{ id: "retained-expense", amount: 7 }] },
  "et-tcg-market-price-cache": { prices: [{ id: "retained-price", marketValue: 81.05, checkedAt: "2026-10-29T12:00:00.000Z" }] },
});
