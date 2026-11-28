import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  defaultStockAlertPreferences,normalizeStockAlertPreferences,
  isInQuietHours,wouldMatchStockAlert
} from "../src/services/stockAlertPreferences.mjs";
const NOW=Date.parse("2026-11-24T20:00:00Z");
const target={retailer:"Target",sku:"1012850572"};
const sources=[{retailer:"Target",mode:"official-api",connected:true,lastSuccessAt:new Date(NOW).toISOString()}];
const base={
  enabled:true,retailers:["Target"],signal_types:["available_now"],product_keys:[],
  quiet_hours_enabled:false,quiet_start:"22:00",quiet_end:"08:00",time_zone:"UTC"
};
const stock={
  retailer:"Target",sku:"1012850572",signalType:"available_now",evidenceLevel:"official",
  sourceUrl:"https://www.target.com/p/hoc2/A-1012850572",
  observedAt:new Date(NOW-10000).toISOString(),
  expiresAt:new Date(NOW+5*60000).toISOString()
};
test("Stock alert preferences never opt users in by default",()=>{
  const defaults=defaultStockAlertPreferences();
  assert.equal(defaults.enabled,false);
  assert.deepEqual(defaults.retailers,[]);
  const migration=readFileSync(new URL("../supabase/migrations/20261124221500_stock_alert_preferences.sql",import.meta.url),"utf8");
  assert.match(migration,/enabled boolean not null default false/);
  assert.match(migration,/user_id=\(select auth.uid\(\)\)/);
  assert.match(migration,/code3_current_session_valid/);
  assert.match(migration,/for select to authenticated/);
  assert.match(migration,/for insert to authenticated/);
  assert.match(migration,/for update to authenticated/);
  assert.match(migration,/for delete to authenticated/);
});
test("Retainers and specific products require approved watch targets",()=>{
  const p=normalizeStockAlertPreferences({...base,product_keys:["Target|1012850572"]},{targets:[target]});
  assert.deepEqual(p.product_keys,["Target|1012850572"]);
  assert.throws(()=>normalizeStockAlertPreferences({...base,product_keys:["Target|notlisted"]},{targets:[target]}),/approved products/);
  assert.throws(()=>normalizeStockAlertPreferences({...base,retailers:["Mystery Store"]}),/Unknown retailer/);
  assert.throws(()=>normalizeStockAlertPreferences({...base,retailers:[]}),/at least one retailer/);
  assert.throws(()=>normalizeStockAlertPreferences({...base,signal_types:["checkout_queue_bypass"]}),/Unknown stock signal/);
  assert.throws(()=>normalizeStockAlertPreferences({...base,time_zone:"Planet/Mars"}),/Invalid quiet hours/);
});
test("Only opted-in retailer, signal and product combinations match",()=>{
  assert.equal(wouldMatchStockAlert(base,stock,{sources,now:NOW}),true);
  assert.equal(wouldMatchStockAlert({...base,enabled:false},stock,{sources,now:NOW}),false);
  assert.equal(wouldMatchStockAlert({...base,retailers:["Walmart"]},stock,{sources,now:NOW}),false);
  assert.equal(wouldMatchStockAlert({...base,signal_types:["possible_drop"]},stock,{sources,now:NOW}),false);
  assert.equal(wouldMatchStockAlert({...base,product_keys:["Target|99999"]},stock,{sources,now:NOW}),false);
  assert.equal(wouldMatchStockAlert({...base,product_keys:["Target|1012850572"]},stock,{sources,now:NOW}),true);
});
test("Source health and genuine confirmation are mandatory for available-now alerts",()=>{
  assert.equal(wouldMatchStockAlert(base,stock,{sources:[],now:NOW}),false);
  assert.equal(wouldMatchStockAlert(base,{...stock,evidenceLevel:"reported"},{sources,now:NOW}),false);
  assert.equal(wouldMatchStockAlert(base,{...stock,expiresAt:new Date(NOW-100).toISOString()},{sources,now:NOW}),false);
  assert.equal(wouldMatchStockAlert(base,{...stock,expiresAt:new Date(NOW+20*60000).toISOString()},{sources,now:NOW}),false);
  const stale=[{...sources[0],lastSuccessAt:new Date(NOW-25*60000).toISOString()}];
  assert.equal(wouldMatchStockAlert(base,stock,{sources:stale,now:NOW}),false);
});
test("Possible-drop or queue signals never masquerade as purchase availability",()=>{
  const possible={...stock,signalType:"possible_drop",evidenceLevel:"reported"};
  assert.equal(wouldMatchStockAlert({...base,signal_types:["possible_drop"]},possible,{sources,now:NOW}),true);
  const queue={...possible,retailer:"Costco",signalType:"queue_detected"};
  assert.equal(wouldMatchStockAlert({...base,retailers:["Costco"],signal_types:["queue_detected"]},queue,{sources,now:NOW}),false);
});
test("Quiet hours correctly handle crossing midnight and an unknown time zone",()=>{
  const p={...base,quiet_hours_enabled:true,quiet_start:"22:00",quiet_end:"08:00",time_zone:"UTC"};
  assert.equal(isInQuietHours(p,Date.parse("2026-11-24T23:00:00Z")),true);
  assert.equal(isInQuietHours(p,Date.parse("2026-11-24T03:00:00Z")),true);
  assert.equal(isInQuietHours(p,Date.parse("2026-11-24T12:00:00Z")),false);
  assert.equal(isInQuietHours({...p,time_zone:"Invalid/TZ"},NOW),true);
  assert.equal(wouldMatchStockAlert(p,stock,{sources,now:NOW}),true);
  assert.equal(wouldMatchStockAlert({...p,quiet_start:"19:00",quiet_end:"21:00"},stock,{sources,now:NOW}),false);
});
