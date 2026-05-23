import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.jsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260523204500_scout_reports_manual_store_saves.sql", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

assert.match(app, /const rawStoreId = report\.storeId/, "Scout cloud save should preserve the original store id for diagnostics");
assert.doesNotMatch(app, /if \(!storeId\) return null;/, "Scout cloud save must not silently skip directory/manual store reports");
assert.match(app, /store_id: storeId,/, "Scout reports should submit nullable store_id when no Supabase store UUID exists");
assert.match(app, /store_name: report\.storeName/, "Scout reports should submit store_name for directory/manual store reports");
assert.match(app, /backend_save_failed/, "Scout cloud save failures should return an explicit failure result");
assert.match(app, /backend_unavailable/, "Scout submit flow should distinguish unavailable backend from successful cloud save");
assert.match(app, /await persistScoutReportToSupabase\(report\)/, "Scout submit should await the backend save before showing final save status");
assert.doesNotMatch(app, /void persistScoutReportToSupabase\(report\)\.then/, "Scout submit should not fire-and-forget report saves");
assert.match(app, /reports: mergeScoutRows\(current\.reports \|\| \[\], \[report\]/, "Scout submit should merge the new report into current visible state");
assert.match(app, /Scout report saved locally\./, "Scout submit should show a visible local-save fallback");
assert.match(app, /Couldn't save Scout report\./, "Scout submit should show a visible save error");

assert.match(migration, /alter column store_id drop not null/i, "store_reports should allow directory/manual reports without a stores.id UUID");
assert.match(migration, /store_reports_store_name_time_idx/i, "manual store reports should be indexable by store name and time");
assert.match(migration, /store_name when submitted against generated directory\/manual stores/i, "migration should document why store_id is optional");

assert.equal(
  pkg.scripts["test:scout-report-save-flow"],
  "node --no-warnings scripts/test-scout-report-save-flow.mjs",
  "package script should expose Scout report save-flow checks",
);

console.log("Scout report save-flow checks passed.");
