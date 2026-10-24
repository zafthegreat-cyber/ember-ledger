import assert from "node:assert/strict";
import { freshRestockVisitDefaults, recentReportedStoreRows } from "../src/utils/restockShortcuts.mjs";

const stores = ["a", "b", "c", "d"].map(id => ({ id, name: `Store ${id}`, store: { id, active: true } }));
stores.push({ id: "closed", store: { id: "closed", active: false } });
const reports = [
  { userId: "me", storeId: "a", submittedAt: "2026-10-21" },
  { user_id: "me", store_id: "b", submitted_at: "2026-10-24" },
  { userId: "other", storeId: "c", submittedAt: "2026-10-25" },
  { storeId: "c", submittedAt: "2026-10-26" },
  { userId: "me", storeId: "a", submittedAt: "2026-10-23" },
  { userId: "me", storeId: "missing", submittedAt: "2026-10-28" },
  { userId: "me", storeId: "closed", submittedAt: "2026-10-28" },
  { userId: "me", storeId: "d", submittedAt: "2026-10-29", status: "deleted" },
];
const original = JSON.stringify({ stores, reports });
assert.deepEqual(recentReportedStoreRows({ reports, storeRows: stores, ownerId: "me" }).map(row => row.id), ["b", "a"]);
assert.deepEqual(recentReportedStoreRows({ reports, storeRows: stores, ownerId: "other" }).map(row => row.id), ["c"]);
assert.deepEqual(recentReportedStoreRows({ reports, storeRows: stores }), []);
assert.deepEqual(recentReportedStoreRows({ reports, storeRows: stores, ownerId: "me", limit: 1 }).map(row => row.id), ["b"]);
assert.equal(JSON.stringify({ stores, reports }), original, "Shortcuts must never edit existing reports or stores");
assert.equal(recentReportedStoreRows({ reports: stores.slice(0, 4).map(row => ({ userId: "me", storeId: row.id })), storeRows: stores, ownerId: "me", limit: 99 }).length, 3);

for (const visibility of ["public", "private_from_map", "admin_only"]) {
  const prior = { visibility, reportType: "no_stock", sourceType: "text_screenshot", note: "Previous observation", photoUrl: "private-proof", productCategory: "Pokemon TCG", reportDate: "2026-01-01" };
  assert.deepEqual(freshRestockVisitDefaults(prior), { reportType: "", reportTypeTouched: false, visibility });
}
assert.equal(freshRestockVisitDefaults({ visibility: "unknown" }).visibility, "private_from_map");
console.log("PASS restock shortcuts: owner isolation, directory-only stores, deduplication, limit, immutable records and fresh visit facts/privacy.");
