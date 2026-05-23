import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.jsx", "utf8");
const dropRadar = fs.readFileSync("src/utils/dropRadarUtils.mjs", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260523201500_scout_report_observed_at.sql", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

assert.match(app, /Visit date &amp; time/, "Scout report flow should label the visit datetime field");
assert.match(app, /Use this if you are backfilling a store visit from earlier\./, "Scout flow should explain backfill use");
assert.match(app, /type="datetime-local"/, "Scout report creation/editing should use native datetime-local inputs");
assert.match(app, /function validateScoutVisitDateTime/, "Scout report datetime validation helper should exist");
assert.match(app, /SCOUT_VISIT_TIME_FUTURE_GRACE_MS/, "future visit times should use a small grace window");
assert.match(app, /function scoutReportObservedAt/, "Scout reports should have an observed-time resolver");
assert.match(app, /function scoutReportSubmittedAt/, "Scout reports should preserve submitted/created time separately");
assert.match(app, /function canEditScoutReportDateTime/, "Scout report datetime edits should be permission-gated");
assert.match(app, /adminEditModeActive/, "datetime edits should be limited to admin/moderator mode");
assert.match(app, /scout_report_datetime_updated/, "datetime edits should be audit-tracked when possible");
assert.match(app, /observed_at: observedAt/, "Supabase Scout report writes should include observed_at");
assert.match(app, /\.order\("observed_at"/, "Scout backend load should sort by observed_at");
assert.match(app, /return scoutReportSortTime\(b\) - scoutReportSortTime\(a\)/, "Scout report sorting should use observed-at helper");
assert.match(app, /createdAt: submittedAt/, "Scout create flow should preserve created/submitted time separately from observed time");
assert.match(app, /Submitted: \{submittedLabel\}/, "admin/detail views should expose submitted time separately");

assert.match(dropRadar, /observedAt \|\| entry\.observed_at/, "Drop Radar should read observed_at before reported_at");
assert.match(dropRadar, /localDateKeyFromTimestamp/, "Drop Radar should derive local observed dates from timestamps");
assert.match(dropRadar, /isDropRadarConfirmedTrainingEntry/, "Drop Radar prediction eligibility should still be guarded");

assert.match(migration, /add column if not exists observed_at timestamptz/i, "migration should add observed_at");
assert.match(migration, /set observed_at = coalesce\(observed_at, created_at, report_time, reported_at, now\(\)\)/i, "migration should backfill observed_at from existing created_at/submission timestamps");
assert.match(migration, /store_reports_observed_at_idx/i, "migration should index observed_at timeline sorting");
assert.match(migration, /created_at remains the time the report was submitted/i, "migration should document created_at preservation");

assert.equal(
  pkg.scripts["test:scout-report-datetime"],
  "node --no-warnings scripts/test-scout-report-datetime.mjs",
  "package script should expose Scout datetime checks",
);

console.log("Scout report datetime/backfill checks passed.");
