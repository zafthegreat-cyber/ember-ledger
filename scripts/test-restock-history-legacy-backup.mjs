import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { syntheticHistory, syntheticScout, syntheticStorage } from "./restock-history-test-fixtures.mjs";
import { HISTORY_FIELD, prepareHistoricalRestockImport, readHistoricalRestockHistory } from "../src/features/restockHistory/historyArchive.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
const modelUrl = pathToFileURL(path.join(root, "src/features/restockHistory/historyArchive.mjs")).href;
const start = app.indexOf('    let nextScout = mode === "replace"');
const end = app.indexOf('    const tidepoolImport = data.tidepoolCommunity || {};', start);
assert.ok(start > 0 && end > start, "The actual legacy import block must remain available for behavior verification.");
const body = app.slice(start, end).replace('import("./features/restockHistory/historyArchive.mjs")', `import(${JSON.stringify(modelUrl)})`);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const execute = new AsyncFunction("context", `
  const { mode, scoutImport, scoutSnapshot, localStorage, setBackupImportMessage } = context;
  const SCOUT_STORAGE_KEY = 'et-tcg-beta-scout';
  const mergeById = (oldRows, newRows) => [...new Map([...oldRows, ...newRows].map(row => [row.id, row])).values()];
  ${body}
  return nextScout;
`);

async function contextFor({ incoming = {}, mode = "merge", count = 3 } = {}) {
  const scout = (await prepareHistoricalRestockImport(syntheticScout(), await syntheticHistory(count))).nextScout;
  const storage = syntheticStorage(scout), messages = [];
  return { mode, scoutImport: incoming, scoutSnapshot: scout, localStorage: storage,
    setBackupImportMessage: message => messages.push(message), messages };
}

test("actual legacy import preserves existing history when an older merge or replacement backup has none", async () => {
  for (const mode of ["merge", "replace"]) {
    const ctx = await contextFor({ mode, incoming: { stores: [], reports: [{ id: "incoming-report" }] } });
    const raw = ctx.localStorage.getItem("et-tcg-beta-scout"), prepared = await execute(ctx);
    assert.equal(readHistoricalRestockHistory(prepared).observations.length, 3);
    assert.equal(ctx.localStorage.getItem("et-tcg-beta-scout"), raw, "Preparation may not write business storage.");
    assert.equal(ctx.messages.length, 0);
    assert.equal(prepared.reports.some(row => row.id === "incoming-report"), true);
  }
});

test("actual legacy merge combines incoming history and deduplicates original historical identities", async () => {
  const incoming = (await prepareHistoricalRestockImport({}, await syntheticHistory(5))).nextScout;
  const ctx = await contextFor({ incoming });
  const result = await execute(ctx);
  assert.equal(readHistoricalRestockHistory(result).observations.length, 5);
  assert.equal(ctx.messages.length, 0);
  assert.equal(result.reports.length, 1);
});

test("actual legacy import preserves durable history even when App's Scout projection omits that field", async () => {
  const ctx = await contextFor({ incoming: { reports: [{ id: "incoming-from-old-backup" }] } });
  // App.loadScoutSnapshot historically builds only its operational fields.
  // The independent history panel reads the durable envelope directly.
  delete ctx.scoutSnapshot[HISTORY_FIELD];
  assert.ok(Object.hasOwn(JSON.parse(ctx.localStorage.getItem("et-tcg-beta-scout")), HISTORY_FIELD));
  const result = await execute(ctx);
  assert.equal(readHistoricalRestockHistory(result)?.observations.length, 3);
  assert.equal(ctx.messages.length, 0);
});

test("actual legacy import rejects malformed history and concurrent Scout edits before existing records change", async () => {
  const malformed = await contextFor({ incoming: { [HISTORY_FIELD]: { version: 999 } } });
  const before = malformed.localStorage.snapshot();
  assert.equal(await execute(malformed), undefined);
  assert.match(malformed.messages[0], /Backup import stopped/);
  assert.equal(malformed.localStorage.snapshot(), before);

  const concurrent = await contextFor();
  const originalGet = concurrent.localStorage.getItem.bind(concurrent.localStorage);
  let reads = 0;
  concurrent.localStorage.getItem = key => key === "et-tcg-beta-scout" && ++reads > 1 ? '{"changedElsewhere":true}' : originalGet(key);
  assert.equal(await execute(concurrent), undefined);
  assert.match(concurrent.messages[0], /Restock records changed during this review/);
  assert.equal(concurrent.localStorage.values.get("et-tcg-beta-scout"), originalGet("et-tcg-beta-scout"));
});

test("actual older backup exporter includes the saved historical field for a new device", async () => {
  const ctx = await contextFor();
  const exportStart = app.indexOf("  function createBetaBackup() {");
  const exportEnd = app.indexOf("  function countBackupItems(value)", exportStart);
  assert.ok(exportStart > 0 && exportEnd > exportStart);
  const exportContext = {
    localStorage: ctx.localStorage, SCOUT_STORAGE_KEY: "et-tcg-beta-scout", scoutSnapshot: ctx.scoutSnapshot,
    LOCAL_STORAGE_KEY: "et-tcg-beta-data", TIDEPOOL_STORAGE_KEY: "et-tcg-beta-tidepool", MARKET_PRICE_CACHE_KEY: "et-tcg-market-price-cache", SUGGESTION_STORAGE_KEY: "et-tcg-beta-suggestions",
    safeReadBrowserJson: (storage, key, fallback) => storage.getItem(key) === null ? fallback : JSON.parse(storage.getItem(key)),
    loadSuggestions: () => [], appPersonalizationContext: () => ({}), normalizeAppPersonalizationPreferences: value => value, normalizeForgeModeSettings: value => value,
  };
  for (const field of ["items", "purchasers", "catalogProducts", "expenses", "sales", "vehicles", "mileageTrips", "workspaces", "workspaceMembers", "workspaceInvites", "tidepoolPosts", "tidepoolComments", "tidepoolReactions", "tideTradrWatchlist", "marketplaceListings", "marketplaceReports", "marketplaceSavedIds", "marketPriceMemories", "itemComparisons"]) exportContext[field] = [];
  for (const field of ["activeWorkspaceId", "tideTradrLookupId", "userType", "dashboardPreset", "dashboardCardStyle"]) exportContext[field] = "synthetic";
  for (const field of ["marketPriceCache", "homeStatsEnabled", "dashboardLayout", "appSetupPersonalization", "forgeModeSettings", "locationSettings", "userSearchAliases", "dealForm"]) exportContext[field] = {};
  const run = new Function("context", `with (context) { ${app.slice(exportStart, exportEnd)} return createBetaBackup(); }`);
  const exported = run(exportContext);
  assert.ok(Object.hasOwn(exported.data.scout, HISTORY_FIELD), "The older exporter must include private history, not only preserve history already on this device.");
  assert.equal(readHistoricalRestockHistory(exported.data.scout).observations.length, 3);
});
