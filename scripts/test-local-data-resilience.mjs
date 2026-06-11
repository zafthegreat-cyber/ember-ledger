import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  BETA_LOCAL_STORAGE_KEY_AUDIT,
  BETA_LOCAL_STORAGE_KEYS,
  cleanupBrowserBetaStorage,
  safeReadBrowserJson,
  safeWriteBrowserJson,
  sanitizeAppLocalData,
  sanitizeScoutLocalData,
  sanitizeTidepoolLocalData,
} from "../src/utils/betaDataCleanup.js";

const root = process.cwd();
const read = (filePath) => fs.readFileSync(path.join(root, filePath), "utf8");

class MemoryStorage {
  constructor(entries = {}) {
    this.map = new Map(Object.entries(entries));
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }
}

const fallbackObject = { safe: true };
const fallbackArray = [{ fallback: true }];
const storage = new MemoryStorage({
  goodObject: JSON.stringify({ ok: true }),
  goodArray: JSON.stringify([{ ok: true }]),
  invalidJson: "{not-json",
  wrongObjectShape: JSON.stringify(["not", "object"]),
  wrongArrayShape: JSON.stringify({ not: "array" }),
  emptyString: "",
});

assert.deepEqual(safeReadBrowserJson(storage, "goodObject", fallbackObject), { ok: true });
assert.deepEqual(safeReadBrowserJson(storage, "goodArray", fallbackArray), [{ ok: true }]);
assert.deepEqual(safeReadBrowserJson(storage, "invalidJson", fallbackObject), fallbackObject);
assert.deepEqual(safeReadBrowserJson(storage, "missing", fallbackObject), fallbackObject);
assert.deepEqual(safeReadBrowserJson(storage, "emptyString", fallbackObject), fallbackObject);
assert.deepEqual(safeReadBrowserJson(storage, "wrongObjectShape", fallbackObject), fallbackObject);
assert.deepEqual(safeReadBrowserJson(storage, "wrongArrayShape", fallbackArray), fallbackArray);
assert.equal(safeWriteBrowserJson(storage, "written", { saved: true }), true);
assert.deepEqual(JSON.parse(storage.getItem("written")), { saved: true });

const auditKeys = new Set(BETA_LOCAL_STORAGE_KEY_AUDIT.map((entry) => entry.key));
[
  "app",
  "scout",
  "tidepool",
  "feedback",
  "suggestions",
  "adminReviewLog",
  "marketPrices",
  "whatDidISee",
  "theme",
  "dailyTide",
  "routeState",
  "catalogView",
  "catalogPageSize",
  "vaultShowcaseView",
  "forgeModeSettings",
  "gradeAssist",
  "emberAssistThread",
  "betaReadiness",
  "phase2",
].forEach((keyName) => {
  assert.ok(BETA_LOCAL_STORAGE_KEYS[keyName], `Missing local storage key constant: ${keyName}`);
  assert.ok(auditKeys.has(BETA_LOCAL_STORAGE_KEYS[keyName]), `Audit registry missing key: ${BETA_LOCAL_STORAGE_KEYS[keyName]}`);
});

const cleanupStorage = new MemoryStorage({
  [BETA_LOCAL_STORAGE_KEYS.app]: JSON.stringify({
    items: [{ id: "real-vault", name: "Real Vault Item" }, { id: "demo-vault", name: "Demo Product" }],
    trades: [{ id: "trade-real", itemName: "Real Trade" }, { id: "demo-trade", name: "Demo trade" }],
    sparkGifts: [{ id: "gift-real", name: "Support Pack" }, { id: "gift-demo", name: "Demo gift" }],
    sparkKidPacks: [{ id: "pack-real", name: "Starter Pack" }, { id: "pack-demo", name: "Demo kid pack" }],
    sparkEventPlans: [{ id: "event-real", name: "League Night" }, { id: "event-demo", name: "Demo event" }],
    collectorEventPlans: [{ id: "collector-real", name: "Binder Night" }, { id: "collector-demo", name: "Demo collector event" }],
  }),
  [BETA_LOCAL_STORAGE_KEYS.scout]: JSON.stringify({
    stores: [{ id: "store-real", name: "Real Store" }, { id: "demo-store", name: "Demo Store" }],
    reports: [{ id: "report-real", note: "Real report" }, { id: "demo-report", note: "Demo report" }],
  }),
  [BETA_LOCAL_STORAGE_KEYS.tidepool]: JSON.stringify({
    posts: [{ postId: "post-real", title: "Real post" }, { postId: "demo-post", title: "Demo post" }],
    comments: [],
    reactions: [],
    trustedCircle: [{ id: "circle-real", name: "Known Shop" }, { id: "demo-circle", name: "Demo helper" }],
  }),
  [BETA_LOCAL_STORAGE_KEYS.marketPrices]: "{bad-json",
  [BETA_LOCAL_STORAGE_KEYS.feedback]: JSON.stringify([{ id: "feedback-real", title: "Real feedback" }, { id: "demo-feedback", title: "Demo feedback" }]),
});

const cleanup = cleanupBrowserBetaStorage(cleanupStorage);
assert.equal(cleanup.changed, true);

const cleanedApp = safeReadBrowserJson(cleanupStorage, BETA_LOCAL_STORAGE_KEYS.app, {});
assert.deepEqual(cleanedApp.items.map((item) => item.id), ["real-vault"]);
assert.deepEqual(cleanedApp.tradeRecords.map((item) => item.id), ["trade-real"]);
assert.deepEqual(cleanedApp.sparkGifts.map((item) => item.id), ["gift-real"]);
assert.deepEqual(cleanedApp.sparkKidPacks.map((item) => item.id), ["pack-real"]);
assert.deepEqual(cleanedApp.sparkEventPlans.map((item) => item.id), ["event-real"]);
assert.deepEqual(cleanedApp.collectorEventPlans.map((item) => item.id), ["collector-real"]);

const cleanedScout = safeReadBrowserJson(cleanupStorage, BETA_LOCAL_STORAGE_KEYS.scout, {});
assert.deepEqual(cleanedScout.stores.map((store) => store.id), ["store-real"]);
assert.deepEqual(cleanedScout.reports.map((report) => report.id), ["report-real"]);

const cleanedTidepool = safeReadBrowserJson(cleanupStorage, BETA_LOCAL_STORAGE_KEYS.tidepool, {});
assert.deepEqual(cleanedTidepool.posts.map((post) => post.postId), ["post-real"]);
assert.deepEqual(cleanedTidepool.trustedCircle.map((entry) => entry.id), ["circle-real"]);

const cleanedMarketCache = safeReadBrowserJson(cleanupStorage, BETA_LOCAL_STORAGE_KEYS.marketPrices, {});
assert.deepEqual(cleanedMarketCache, { prices: [], lastSync: "", failedMatches: [] });

assert.deepEqual(sanitizeAppLocalData("bad input").items, []);
assert.deepEqual(sanitizeScoutLocalData("bad input").stores, []);
assert.deepEqual(sanitizeTidepoolLocalData("bad input").trustedCircle, []);

const appSource = read("src/App.jsx");
const scoutSource = read("src/pages/Scout.jsx");
const whatDidISeeSource = read("src/components/WhatDidISee.jsx");

assert.equal(/JSON\.parse\(localStorage\.getItem/i.test(appSource), false, "App should use safe local JSON reads for browser storage.");
assert.equal(/JSON\.parse\(localStorage\.getItem/i.test(scoutSource), false, "Scout should use safe local JSON reads for browser storage.");
assert.equal(/JSON\.parse\(localStorage\.getItem/i.test(whatDidISeeSource), false, "What Did I See should use safe local JSON reads for browser storage.");

assert.match(appSource, /stored locally in this browser/i);
assert.match(appSource, /Clearing browser data may remove it/i);
assert.match(appSource, /Cloud sync requires backend support later/i);
assert.match(appSource, /Checklist storage is local to this browser for now\. Cloud sync needs backend Grade Assist storage\./);
assert.doesNotMatch(
  appSource,
  /permanent cloud backup|restored from cloud|secure encrypted storage|automatic cloud recovery/i,
  "App copy should not imply unavailable cloud backup, account recovery, or encrypted storage guarantees."
);
assert.match(
  appSource,
  /saveResult\.source === "supabase" \? "Listing draft saved to your account\." : "Listing draft saved locally\."/,
  "Account-saved copy should remain gated behind a real Supabase save result."
);

console.log("Local data resilience tests passed.");
