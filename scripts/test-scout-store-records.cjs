const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const espree = require("espree");
const { buildSync } = require("esbuild");
const { chromium, expect } = require("@playwright/test");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src/pages/Scout.jsx"), "utf8");
const ast = espree.parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
const declarations = new Map();
function visit(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration") declarations.set(node.id.name, node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit); else if (value?.type) visit(value);
  }
}
visit(ast);
const actualCode = ["resolveScoutStoreRecord", "findStoreRecord", "readScoutLocalStorage", "readScoutStoreEnvelope", "normalizeStoreDetailRecord", "loadStores", "saveLocalScout", "saveStoreDetailPatch", "toggleStoreFavorite", "handleUpdateStore", "buildStorePayloadFromForm"].map((name) => {
  assert.ok(declarations.has(name), `Missing actual Scout function ${name}`);
  return source.slice(...declarations.get(name).range);
}).join("\n");
const bundled = buildSync({
  stdin: { contents: [
    'export * from "./src/utils/storeImportUtils.js";',
    'export * from "./src/utils/storeExpansionUtils.js";',
    'export * from "./src/utils/storeGroupingUtils.js";',
    'export * from "./src/utils/betaDataCleanup.js";',
    'export * from "./src/data/storeGroups.js";',
  ].join("\n"), resolveDir: root },
  bundle: true, format: "cjs", platform: "node", write: false,
}).outputFiles[0].text;
const utilityModule = { exports: {} };
new Function("module", "exports", "require", bundled)(utilityModule, utilityModule.exports, require);
const utilities = utilityModule.exports;
const copy = (value) => JSON.parse(JSON.stringify(value));
const key = "et-tcg-beta-scout";
const canonical = { id: "store-target-4554-virginia-beach-blvd-23462", name: "Target - Pembroke", nickname: "Pembroke Target", chain: "Target", address: "4554 Virginia Beach Blvd", city: "Virginia Beach", zip: "23462", active: true };
const savedRecord = { ...canonical, id: "seed-target-4554-virginia-beach-blvd-virginia-beach-23462", favorite: false, watched: false, customMetadata: { retain: [1, 2] } };
savedRecord.storeId = savedRecord.id;
savedRecord.store_id = savedRecord.id;
const initial = {
  stores: [savedRecord, { ...savedRecord, id: "Other-Exact-ID", storeId: "Other-Exact-ID", store_id: "Other-Exact-ID", notes: "Preserve the same-address row" }],
  reports: [{ id: "report-original", storeId: savedRecord.id }],
  items: [{ id: "item-original", storeId: savedRecord.id }],
  routes: [{ id: "route-original", selectedStoreIds: [savedRecord.id] }],
  customEnvelopeMetadata: { untouched: true },
};
const results = [];
async function check(name, run) { await run(); results.push(name); console.log(`PASS ${name}`); }
function harness({ raw = JSON.stringify(initial), admin = false, savedOrigin = true } = {}) {
  let bytes = raw, writes = 0, reading = false;
  const errors = [], suggestions = [], faults = { read: false, write: false };
  const context = vm.createContext({
    ...utilities, SCOUT_STORAGE_KEY: key, BETA_LOCAL_SCOUT: true, adminMode: admin,
    stores: [utilities.normalizeImportedStore(canonical)],
    storeDetailRecords: [{ record: utilities.normalizeImportedStore(savedRecord), saved: savedOrigin }],
    selectedStoreId: savedRecord.id, editStoreForm: { ...utilities.normalizeImportedStore(savedRecord), city: "Norfolk" }, isEditingStore: true,
    SUGGESTION_TYPES: { EDIT_STORE_DETAILS: "edit-store-details" },
    submitSharedDataSuggestion: (suggestion) => { suggestions.push(suggestion); return { ok: true }; },
    loadVirginiaStoresSeed: async () => [canonical], STATEWIDE_SEED_STORES: [canonical],
    BEST_BUY_NIGHTLY_DEFAULTS: {}, createDefaultScoutProfile: () => ({}), createDefaultAlertSettings: () => ({}),
    shouldUseDropRadarSeed: () => false, buildScoutRestockPatterns: () => [], SCOUT_STORE_ALIASES: [],
    localStorage: {
      getItem: () => { if (faults.read) throw new DOMException("Synthetic read denial", "SecurityError"); return bytes; },
      setItem: (name, value) => { assert.equal(name, key); if (faults.write) throw new DOMException("Synthetic quota", "QuotaExceededError"); writes += 1; bytes = String(value); },
    },
    setError: (value) => errors.push(value),
  });
  const loadSource = source.slice(...declarations.get("loadStores").range);
  for (const [, setter] of loadSource.matchAll(/\b(set[A-Z]\w*)\(/g)) context[setter] = () => {};
  for (const [setter, field] of [["setStoreDetailRecords", "storeDetailRecords"], ["setStores", "stores"], ["setIsEditingStore", "isEditingStore"]]) {
    context[setter] = (value) => {
      if (!reading && field !== "isEditingStore") assert.ok(writes > 0, `${field} must change only after durable save`);
      context[field] = typeof value === "function" ? value(context[field]) : value;
    };
  }
  context.setError = (value) => errors.push(value);
  vm.runInContext(actualCode, context);
  return { context, errors, suggestions, faults, bytes: () => bytes, replace: (value) => { bytes = value; }, writes: () => writes, saved: () => JSON.parse(bytes),
    load: async () => { reading = true; try { await context.loadStores(); } finally { reading = false; } } };
}

async function main() {
  await check("exact IDs resolve both deduped and saved records without reassociation", () => {
    const h = harness();
    for (const id of [canonical.id, savedRecord.id]) assert.equal(h.context.findStoreRecord(id).id, id);
    assert.equal(h.context.findStoreRecord("unknown-store"), undefined);
    assert.equal(h.context.findStoreRecord(""), undefined);
    assert.equal(h.context.findStoreRecord(savedRecord.id.toUpperCase()).id, savedRecord.id);
    assert.equal(h.writes(), 0);
  });
  await check("case-insensitive lookup refuses ambiguous IDs but preserves exact matches", () => {
    const h = harness();
    h.context.stores = [{ id: "Case-Id" }, { id: "case-id" }];
    h.context.storeDetailRecords = [];
    assert.equal(h.context.findStoreRecord("CASE-ID"), undefined);
    assert.equal(h.context.findStoreRecord("Case-Id").id, "Case-Id");
    assert.equal(h.context.findStoreRecord("case-id").id, "case-id");
  });
  for (const status of [{ active: false }, { status: "Closed" }, { status: "Removed" }]) await check(`viewer policy applies to dropped record: ${JSON.stringify(status)}`, () => {
    const h = harness(); Object.assign(h.context.storeDetailRecords[0].record, status);
    assert.equal(h.context.findStoreRecord(savedRecord.id), undefined);
    h.context.toggleStoreFavorite(savedRecord.id);
    assert.equal(h.writes(), 0); assert.match(h.errors.at(-1), /unavailable/);
    h.context.adminMode = true;
    assert.equal(h.context.findStoreRecord(savedRecord.id).id, savedRecord.id);
  });
  for (const status of [{ active: false }, { is_active: false }, { reviewStatus: "inactive" }, { review_status: "removed" }]) await check(`current raw eligibility blocks Watch and survives detail normalization: ${JSON.stringify(status)}`, () => {
    const h = harness(); const latest = copy(initial);
    if (status.is_active !== undefined) delete latest.stores[0].active;
    Object.assign(latest.stores[0], status); h.replace(JSON.stringify(latest));
    const before = h.bytes(); h.context.toggleStoreFavorite(savedRecord.id);
    assert.equal(h.writes(), 0); assert.equal(h.bytes(), before); assert.match(h.errors.at(-1), /unavailable/);
    const normalized = h.context.normalizeStoreDetailRecord(latest.stores[0]);
    assert.equal(utilities.isStoreActiveForViewer(normalized), false);
    assert.equal(utilities.isStoreActiveForViewer(normalized, { admin: true }), true);
  });
  await check("watched-only saved row actually unwatches on its first click", () => {
    const h = harness(); const saved = copy(initial); saved.stores[0].watched = true; h.replace(JSON.stringify(saved));
    h.context.toggleStoreFavorite(savedRecord.id);
    assert.equal(h.saved().stores[0].favorite, false); assert.equal(h.saved().stores[0].watched, false);
  });
  await check("saved rows with generated IDs match their existing raw row without creating duplicates", () => {
    const row = { ...savedRecord }; delete row.id; delete row.storeId; delete row.store_id;
    const h = harness({ raw: JSON.stringify({ ...initial, stores: [row, initial.stores[1]] }) });
    const record = utilities.normalizeImportedStore(row);
    h.context.stores = []; h.context.storeDetailRecords = [{ record, saved: true }];
    h.context.toggleStoreFavorite(record.id);
    assert.equal(h.writes(), 1); assert.equal(h.saved().stores.length, 2); assert.equal(h.saved().stores[0].favorite, true);
    assert.equal(h.saved().stores[0].id, undefined); assert.equal(h.saved().stores[0].storeId, undefined);
  });
  await check("Watch patches only the original saved row and survives reload", () => {
    const h = harness(); h.context.toggleStoreFavorite(savedRecord.id);
    assert.equal(h.writes(), 1); assert.equal(h.saved().stores[0].favorite, true);
    assert.equal(h.saved().stores[0].watched, true);
    for (const alias of ["id", "storeId", "store_id"]) assert.equal(h.saved().stores[0][alias], savedRecord[alias]);
    assert.deepEqual(h.saved().stores[0].customMetadata, savedRecord.customMetadata);
    assert.deepEqual(h.saved().stores.slice(1), initial.stores.slice(1));
    for (const name of Object.keys(initial).filter((name) => name !== "stores")) assert.deepEqual(h.saved()[name], initial[name]);
    assert.equal(h.context.findStoreRecord(savedRecord.id).favorite, true);
    const reloaded = harness({ raw: h.bytes() });
    reloaded.context.storeDetailRecords[0].record = utilities.normalizeImportedStore(reloaded.saved().stores[0]);
    assert.equal(reloaded.context.findStoreRecord(savedRecord.id).favorite, true);
  });
  await check("admin metadata patch uses exact ID and retains unrelated raw rows and fields", async () => {
    const h = harness({ admin: true });
    const latest = h.saved(); latest.stores[0].customMetadata.updatedElsewhere = true; h.replace(JSON.stringify(latest));
    await h.context.handleUpdateStore({ preventDefault() {} });
    assert.equal(h.writes(), 1); assert.equal(h.saved().stores[0].city, "Norfolk");
    assert.equal(h.saved().stores[0].customMetadata.updatedElsewhere, true);
    assert.deepEqual(h.saved().stores.slice(1), latest.stores.slice(1));
    assert.equal(h.context.isEditingStore, false);
    assert.deepEqual(h.saved().reports, initial.reports); assert.deepEqual(h.saved().items, initial.items);
  });
  await check("non-admin direct invocation submits existing suggestion instead of modifying the store", async () => {
    const h = harness(); const before = h.bytes();
    await h.context.handleUpdateStore({ preventDefault() {} });
    assert.equal(h.writes(), 0); assert.equal(h.bytes(), before); assert.equal(h.suggestions.length, 1);
    assert.equal(h.suggestions[0].targetRecordId, savedRecord.id);
  });
  await check("listed Watch and admin edit preserve alternate raw IDs and synchronize both views", async () => {
    const original = { ...initial, stores: [canonical, ...initial.stores] };
    const h = harness({ raw: JSON.stringify(original), admin: true });
    h.context.storeDetailRecords.push({ record: utilities.normalizeImportedStore(canonical), saved: true });
    h.context.toggleStoreFavorite(canonical.id);
    assert.equal(h.context.stores[0].favorite, true); assert.equal(h.context.findStoreRecord(canonical.id).favorite, true);
    h.context.selectedStoreId = canonical.id;
    h.context.editStoreForm = { ...utilities.normalizeImportedStore(canonical), city: "Suffolk" };
    await h.context.handleUpdateStore({ preventDefault() {} });
    assert.equal(h.context.stores[0].city, "Suffolk");
    assert.equal(h.context.storeDetailRecords.find((entry) => entry.record.id === canonical.id).record.city, "Suffolk");
    assert.deepEqual(h.saved().stores.slice(1), initial.stores);
    assert.deepEqual(h.saved().reports, initial.reports); assert.deepEqual(h.saved().items, initial.items);
  });
  await check("new listed local row missing from registry may update only its persisted exact row", () => {
    const h = harness({ raw: JSON.stringify({ ...initial, stores: [canonical, ...initial.stores] }) });
    h.context.toggleStoreFavorite(canonical.id);
    assert.equal(h.writes(), 1); assert.equal(h.context.findStoreRecord(canonical.id).favorite, true);
    assert.deepEqual(h.saved().stores.slice(1), initial.stores);
    h.replace(JSON.stringify(initial)); h.context.toggleStoreFavorite(canonical.id);
    assert.equal(h.writes(), 1); assert.match(h.errors.at(-1), /removed/);
  });
  for (const [name, prepare] of [
    ["read denial", (h) => { h.faults.read = true; }],
    ["quota", (h) => { h.faults.write = true; }],
    ["malformed JSON", (h) => h.replace("{broken")],
    ["empty existing value", (h) => h.replace("")],
    ["null envelope", (h) => h.replace("null")],
    ["array envelope", (h) => h.replace("[]")],
    ["invalid stores", (h) => h.replace('{"stores":{}}')],
    ["null store row", (h) => h.replace(JSON.stringify({ ...initial, stores: [...initial.stores, null] }))],
    ["array store row", (h) => h.replace(JSON.stringify({ ...initial, stores: [...initial.stores, []] }))],
    ["primitive store row", (h) => h.replace(JSON.stringify({ ...initial, stores: [...initial.stores, 4] }))],
    ["duplicate exact ID", (h) => h.replace(JSON.stringify({ ...initial, stores: [...initial.stores, savedRecord] }))],
    ["removed saved target", (h) => h.replace(JSON.stringify({ ...initial, stores: initial.stores.slice(1) }))],
  ]) await check(`${name}: Watch and admin save retain bytes, record state and the editing draft`, async () => {
    const h = harness({ admin: true }); prepare(h);
    const before = h.bytes(), records = copy(h.context.storeDetailRecords), draft = copy(h.context.editStoreForm);
    h.context.toggleStoreFavorite(savedRecord.id);
    await h.context.handleUpdateStore({ preventDefault() {} });
    assert.equal(h.writes(), 0); assert.equal(h.bytes(), before);
    assert.deepEqual(copy(h.context.storeDetailRecords), records); assert.deepEqual(copy(h.context.editStoreForm), draft);
    assert.equal(h.context.isEditingStore, true); assert.ok(h.errors.every((error) => /not saved/.test(error)));
  });
  await check("known seed-only detail may create its exact local override without replacing other rows", () => {
    const h = harness({ raw: JSON.stringify({ ...initial, stores: initial.stores.slice(1) }), savedOrigin: false });
    h.context.toggleStoreFavorite(savedRecord.id);
    assert.equal(h.writes(), 1); assert.deepEqual(h.saved().stores[0], initial.stores[1]);
    assert.equal(h.saved().stores[1].id, savedRecord.id); assert.equal(h.saved().stores[1].favorite, true);
    assert.deepEqual(h.saved().reports, initial.reports);
  });
  for (const [name, setup] of [
    ["corrupt", (h) => h.replace("{broken")], ["denied", (h) => { h.faults.read = true; }],
    ["invalid row", (h) => h.replace('{"stores":[null]}')], ["quota", (h) => { h.replace(null); h.faults.write = true; }],
  ]) await check(`${name} startup keeps raw data intact and still loads public stores without rejection`, async () => {
    const h = harness(); setup(h); const before = h.bytes(); await h.load();
    assert.equal(h.bytes(), before); assert.equal(h.writes(), 0); assert.ok(h.context.stores.length);
    assert.match(h.errors.at(-1), /left unchanged/);
  });
  await check("startup reads the latest envelope after asynchronous seed loading", async () => {
    const h = harness({ raw: null }); let release;
    h.context.loadVirginiaStoresSeed = () => new Promise((resolve) => { release = resolve; });
    const pending = h.load(); h.replace(JSON.stringify(initial)); release([canonical]); await pending;
    assert.deepEqual(h.saved(), initial); assert.equal(h.writes(), 0);
    assert.equal(h.context.findStoreRecord(savedRecord.id).id, savedRecord.id);
  });
  const output = path.join(root, "artifacts/qa/release-readiness/scout-store-records");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "handler-results.json"), JSON.stringify({ passed: results.length, results }, null, 2));
  console.log(`PASS ${results.length}/${results.length} actual Scout record/handler checks`);
  if (!process.argv.includes("--handlers-only")) await checkBrowser(output);
}

async function checkBrowser(output) {
  const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217/");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Browser fixtures must be local-only");
  const browser = await chromium.launch({ headless: true });
  const browserResults = [];
  try {
    for (const mode of ["records", "corrupt-boot"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        return ["GET", "HEAD"].includes(route.request().method()) && (url.origin === base.origin || !["http:", "https:"].includes(url.protocol)) ? route.continue() : route.abort();
      });
      await context.addInitScript(({ value, key: storageKey }) => {
        if (sessionStorage.getItem("scout-record-fixture")) return;
        sessionStorage.setItem("scout-record-fixture", "1"); localStorage.setItem(storageKey, value);
        if (value === "{broken-at-startup") {
          window.__scoutStartupWrites = [];
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function (name, data) {
            if (this === localStorage && name === storageKey) window.__scoutStartupWrites.push(new Error("Scout startup write").stack);
            return original.call(this, name, data);
          };
        }
      }, { key, value: mode === "corrupt-boot" ? "{broken-at-startup" : JSON.stringify({
        ...initial, dropRadarSeedDisabled: true,
        reports: [savedRecord.id, canonical.id].map((id, index) => ({ id: `association-report-${index}`, storeId: id, storeName: "Pembroke Target", itemName: `Exact report ${index}`, reportDate: "2026-09-14", reportTime: "09:00", visibility: "public", stockStatus: "in_stock", reportedBy: "Local Scout" })),
        items: [savedRecord.id, canonical.id].map((id, index) => ({ id: `association-item-${index}`, storeId: id, name: `Exact sighting ${index}`, status: "Unknown" })),
      }) });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const urlFor = (id) => new URL(`/scout/stores/${encodeURIComponent(id)}?betaLocalMode=true`, base).href;
      try {
        if (mode === "corrupt-boot") {
          await page.goto(urlFor(canonical.id));
          await expect(page.getByRole("heading", { name: "Pembroke Target", exact: true }).first()).toBeVisible({ timeout: 30000 });
          const startup = await page.evaluate((storageKey) => ({ bytes: localStorage.getItem(storageKey), writes: window.__scoutStartupWrites }), key);
          fs.writeFileSync(path.join(output, "corrupt-boot-diagnostics.json"), JSON.stringify({ unchanged: startup.bytes === "{broken-at-startup", byteLength: startup.bytes?.length, preview: startup.bytes?.slice(0, 120), writes: startup.writes }, null, 2));
          await page.screenshot({ path: path.join(output, "corrupt-boot-observed.png"), fullPage: true });
          assert.ok(startup.bytes === "{broken-at-startup", "A corrupt native Scout value must remain byte-for-byte unchanged");
          await expect(page.getByText(/Saved Scout data could not be loaded or updated/)).toBeVisible();
          assert.equal(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key), "{broken-at-startup");
          await page.screenshot({ path: path.join(output, "corrupt-boot-preserved.png"), fullPage: true });
        } else {
          let snapshot;
          for (const [index, id] of [savedRecord.id, canonical.id].entries()) {
            await page.goto(urlFor(id));
            for (let refresh = 0; refresh < 2; refresh += 1) {
              await expect(page.getByRole("heading", { name: "Pembroke Target", exact: true }).first()).toBeVisible({ timeout: 30000 });
              await expect(page.locator(".scout-tracked-item-card").filter({ hasText: `Exact sighting ${index}` })).toBeVisible();
              await expect(page.locator(".scout-tracked-item-card").filter({ hasText: `Exact sighting ${1 - index}` })).toHaveCount(0);
              await expect(page.locator(".scout-report-compact-card").filter({ hasText: `Exact report ${index}` }).first()).toBeVisible();
              await expect(page.locator(".scout-report-compact-card").filter({ hasText: `Exact report ${1 - index}` })).toHaveCount(0);
              await expect(page.getByText("Admin Edit Store Metadata", { exact: true })).toHaveCount(0);
              if (!refresh) await page.reload();
            }
            await page.screenshot({ path: path.join(output, `${index ? "canonical" : "saved"}-exact-id.png`), fullPage: true });
            const saved = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)), key);
            if (!snapshot) snapshot = saved; else assert.deepEqual(saved, snapshot, "Read-only record navigation must not remap or mutate data");
          }
          await page.goto(urlFor(savedRecord.id));
          await page.getByRole("button", { name: "Watch / Favorite", exact: true }).click();
          await page.reload();
          await expect(page.getByRole("button", { name: "Unwatch", exact: true })).toBeVisible({ timeout: 30000 });
          const saved = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)), key);
          assert.equal(saved.stores[0].favorite, true); assert.deepEqual(saved.stores.slice(1), snapshot.stores.slice(1));
          for (const name of Object.keys(snapshot).filter((name) => name !== "stores")) assert.deepEqual(saved[name], snapshot[name]);
          await page.screenshot({ path: path.join(output, "saved-id-watch-reloaded.png"), fullPage: true });
          await page.goto(urlFor("synthetic-unavailable-id"));
          await expect(page.getByRole("heading", { name: "Store unavailable", exact: true })).toBeVisible({ timeout: 30000 });
          await page.reload();
          await expect(page.getByRole("heading", { name: "Store unavailable", exact: true })).toBeVisible({ timeout: 30000 });
        }
        assert.deepEqual(errors, []);
        browserResults.push({ mode, passed: true }); console.log(`PASS native browser ${mode}`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "browser-results.json"), JSON.stringify(browserResults, null, 2)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
