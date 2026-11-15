// Restock push alerts (Nov 15, 2026): the app saves watched stores and reports
// with the directory's store key, and the server rules keep alerts polite.
// The database behavior itself was verified against Supabase in rolled-back
// transactions (watcher alerted once, reporter not alerted, 6-hour repeat
// skipped, opted-out member skipped, quiet hours in-app only, queue server-only).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readAppSource } from "./helpers/read-deferred-app-source.mjs";

const app = readAppSource(fileURLToPath(new URL("../src/App.jsx", import.meta.url)));
assert.match(app, /store_key: storeKey,[\s\S]{0,200}onConflict: storeId \? "user_id,store_id" : "user_id,store_key"/, "watched stores save by store_key when the id is not a uuid");
assert.match(app, /store_key: storeId \? null : \(String\(rawStoreId \|\| ""\)\.slice\(0, 160\) \|\| null\)/, "store reports carry the directory store key");

const sql = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const alerts = sql("20261115041000_store_keys_for_alerts.sql");
for (const rule of [
  /w\.user_id is distinct from new\.user_id/, // never alert the reporter
  /alert_type = 'in_store_report' and p\.enabled = false\) or p\.stock_alerts = false/, // opt-outs
  /interval '6 hours'/, // one alert per store per 6 hours
  /interval '24 hours'\) < 5/, // daily cap
  /code3_in_quiet_hours\(r\)/, // quiet hours skip the push
  /exception when others then/, // alerts never block confirming a report
]) assert.match(alerts, rule);
const outbox = sql("20261115040000_restock_push_alerts.sql");
assert.match(outbox, /revoke all on public\.push_outbox from anon, authenticated/);
assert.match(outbox, /revoke all on function public\.claim_push_outbox\(integer\) from public, anon, authenticated/);

const devices = readFileSync(new URL("../src/utils/deviceNotifications.js", import.meta.url), "utf8");
assert.match(devices, /"stock_alert"/, "browser device alerts announce server restock alerts");
console.log("restock alerts: ok");
