import assert from "node:assert/strict";
import fs from "node:fs";
import {
  HISTORICAL_SCOUT_IMPORT_2026_05_NOTEBOOK,
  buildHistoricalScoutImportRows,
  historicalScoutImportKey,
  matchHistoricalScoutStore,
  shouldSkipHistoricalScoutRow,
  validateHistoricalScoutImportRows,
} from "./import-historical-scout-reports.mjs";
import {
  buildDropRadarPredictions,
  isDropRadarConfirmedTrainingEntry,
} from "../src/utils/dropRadarUtils.mjs";

const rows = buildHistoricalScoutImportRows();
assert.equal(rows.length, HISTORICAL_SCOUT_IMPORT_2026_05_NOTEBOOK.length, "starter import should only contain stock-positive rows");

const validation = validateHistoricalScoutImportRows(rows);
assert.equal(validation.duplicateKeys.length, 0, "historical import keys should be unique");
assert.equal(validation.negativeRows.length, 0, "historical import should not include empty/no-stock rows");

assert.equal(
  shouldSkipHistoricalScoutRow({ date: "2026-01-09", store_name: "Hampton Target", notes: "Empty", report_status: "stock_seen" }),
  true,
  "empty sightings must be skipped"
);
assert.equal(
  shouldSkipHistoricalScoutRow({ date: "2026-01-09", store_name: "Hampton Target", notes: "Still had stock", report_status: "leftover_stock" }),
  false,
  "leftover stock is stock-positive and should be kept"
);
assert.equal(
  matchHistoricalScoutStore("RM T", [{ id: "red-mill-target", name: "Red Mill Target", chain: "Target" }])?.id,
  "red-mill-target",
  "store alias matching should preserve Red Mill Target shorthand"
);
assert.equal(
  matchHistoricalScoutStore("GB B&N", [{ id: "greenbrier-bn", name: "Greenbrier Barnes & Noble", chain: "Barnes & Noble" }])?.id,
  "greenbrier-bn",
  "store alias matching should preserve Greenbrier Barnes & Noble shorthand"
);

const withEmptyRows = buildHistoricalScoutImportRows([
  ...HISTORICAL_SCOUT_IMPORT_2026_05_NOTEBOOK,
  { date: "2026-01-09", time: "10:00", store_name: "Hampton Target", notes: "Empty shelf", report_status: "stock_seen" },
]);
assert.equal(withEmptyRows.length, rows.length, "adding an empty shelf note should not add an import row");

const unknownTimeRow = rows.find((row) => row.store_name === "Sam's Club Hampton Roads Area");
assert.ok(unknownTimeRow, "unknown-time row should be kept");
assert.match(unknownTimeRow.notes, /Exact time unknown/i, "unknown times should be clearly noted");
assert.match(unknownTimeRow.observed_at, /T17:00:00\.000Z|T16:00:00\.000Z/i, "unknown local noon should be converted to a stable timestamp");

for (const row of rows) {
  assert.equal(row.source_type, "historical_import");
  assert.equal(row.source_label, "Facebook groups / friends / admin notes");
  assert.equal(row.submitted_by_display, "official admin ember");
  assert.equal(row.confidence, "unverified_historical");
  assert.equal(row.imported_by_admin, true);
  assert.equal(row.scout_points_awarded, false);
  assert.ok(["stock_seen", "vendor_seen", "leftover_stock"].includes(row.report_status), "only stock-positive statuses are imported");
  assert.doesNotMatch(`${row.store_name} ${row.notes}`, /\bempty\b/i, "no imported row should contain empty");
}

const repeatKeys = new Set(rows.map((row) => historicalScoutImportKey({
  date: String(row.observed_at || "").slice(0, 10),
  time: row.import_key.split("|")[2] === "time_unknown" ? null : row.import_key.split("|")[2],
  store_name: row.store_name,
  report_status: row.report_status,
  notes: row.notes.replace(/\s*Exact time unknown\.\s*$/i, ""),
})));
assert.equal(repeatKeys.size, rows.length, "running import key generation again should remain idempotent");

const migration = fs.readFileSync("supabase/migrations/20260523213000_historical_scout_imports.sql", "utf8");
assert.match(migration, /source_type text/i, "migration should add source_type");
assert.match(migration, /import_key text/i, "migration should add import_key");
assert.match(migration, /store_reports_import_key_uidx/i, "migration should make import keys unique");
assert.match(migration, /scout_points_awarded boolean not null default true/i, "migration should preserve normal Scout point behavior while allowing imported rows to opt out");

const historicalReport = {
  storeName: "Red Mill Target",
  observedAt: rows[0].observed_at,
  reportStatus: "stock_seen",
  report_status: "stock_seen",
  sourceType: "historical_import",
  source_type: "historical_import",
  confidence: "unverified_historical",
  notes: "Historical note",
};
assert.equal(isDropRadarConfirmedTrainingEntry(historicalReport), true, "stock-positive historical imports may train low-confidence Drop Radar history");
assert.equal(
  isDropRadarConfirmedTrainingEntry({ ...historicalReport, report_status: "empty_shelf", stockStatus: "empty", notes: "Empty shelf" }),
  false,
  "empty shelf rows must not train Drop Radar"
);

const predictionRows = buildDropRadarPredictions({
  stores: [],
  reports: rows
    .filter((row) => row.store_name === "Red Mill Target")
    .slice(0, 3)
    .map((row) => ({
      storeName: row.store_name,
      observedAt: row.observed_at,
      reportStatus: row.report_status,
      report_status: row.report_status,
      sourceType: row.source_type,
      source_type: row.source_type,
      confidence: row.confidence,
      notes: row.notes,
    })),
});
assert.ok(predictionRows.length >= 1, "historical rows should build a low-confidence pattern once enough observations exist");
assert.match(predictionRows[0].sourceLabel, /Historical/i, "historical prediction source should be labeled as historical");

console.log("Historical Scout import checks passed.");
