const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const espree = require("espree");
const { pathToFileURL } = require("node:url");
const { chromium, expect } = require("@playwright/test");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "artifacts/qa/release-readiness/legacy-app-storage");
fs.mkdirSync(output, { recursive: true });
const key = "et-tcg-beta-data";
const fixture = {
  items: [{ id: "Exact-Item-A", name: "Archive Binder", ownedItemPurpose: "PERSONAL_COLLECTION", status: "Personal Collection", quantity: 2, condition: "Near Mint", workspaceId: "workspace-personal-local-beta", customItemMetadata: { keep: [1, 2] } }],
  sales: [{ id: "Exact-Sale-A", itemName: "Archive card sale", quantitySold: 1, salePrice: 25, finalSalePrice: 25, grossSales: 25, saleDate: "2026-09-15", soldAt: "2026-09-15T12:00:00Z", workspaceId: "workspace-personal-local-beta" }],
  expenses: [{ id: "Exact-Expense-A", description: "Archive supplies", amount: 4, date: "2026-09-15", workspaceId: "workspace-personal-local-beta" }],
  userType: "seller", dashboardPreset: "seller", activeWorkspaceId: "workspace-personal-local-beta",
  locationSettings: { mode: "manual", manualLocation: "Norfolk, Virginia", savedLocations: [], trackingEnabled: false },
  customEnvelopeMetadata: { preserve: ["Exact-Item-A", 9], nested: { unknown: true } },
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const results = [];
async function check(name, run) { await run(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }

function memoryStorage(raw = JSON.stringify(fixture)) {
  let bytes = raw;
  const writes = [], reads = [], faults = { read: false, write: false };
  return {
    storage: {
      getItem(name) { assert.equal(name, key); reads.push(name); if (faults.read) throw new DOMException("Synthetic read denial", "SecurityError"); return bytes; },
      setItem(name, value) { assert.equal(name, key); if (faults.write) throw new DOMException("Synthetic quota reached", "QuotaExceededError"); writes.push(value); bytes = String(value); },
    }, faults, writes, reads, bytes: () => bytes, replace: (value) => { bytes = value; },
  };
}

async function checkGuard() {
  const { createLegacyAppStorageGuard } = await import(pathToFileURL(path.join(root, "src/features/persistence/legacyAppStorage.js")));
  await check("missing key alone is a writable fresh start", () => {
    const h = memoryStorage(null), guard = createLegacyAppStorageGuard();
    assert.deepEqual(guard.load(h.storage), { data: {}, error: "" });
    assert.equal(h.writes.length, 0);
    assert.deepEqual(guard.save(h.storage, fixture), { ok: true, changed: true });
    assert.deepEqual(JSON.parse(h.bytes()), fixture); assert.equal(h.writes.length, 1);
  });
  await check("valid load preserves original formatted bytes and exact IDs", () => {
    const raw = JSON.stringify(fixture, null, 3), h = memoryStorage(raw), guard = createLegacyAppStorageGuard();
    const loaded = guard.load(h.storage);
    assert.deepEqual(loaded.data, fixture); assert.equal(loaded.error, "");
    assert.equal(h.bytes(), raw); assert.equal(h.writes.length, 0);
    const next = clone(loaded.data); next.items[0].quantity = 4;
    assert.equal(guard.save(h.storage, next).ok, true);
    const persisted = JSON.parse(h.bytes()); assert.equal(persisted.items[0].id, "Exact-Item-A"); assert.equal(persisted.items[0].quantity, 4);
    assert.deepEqual(persisted.items[0].customItemMetadata, fixture.items[0].customItemMetadata);
    assert.deepEqual(persisted.sales, fixture.sales); assert.deepEqual(persisted.expenses, fixture.expenses);
    assert.deepEqual(persisted.customEnvelopeMetadata, fixture.customEnvelopeMetadata);
  });
  await check("automatic save merges unknown envelope data and serializes once", () => {
    const h = memoryStorage(), guard = createLegacyAppStorageGuard(); guard.load(h.storage);
    const next = { items: [{ ...fixture.items[0], quantity: 8 }] }, copy = clone(next);
    assert.equal(guard.save(h.storage, next).ok, true); assert.deepEqual(next, copy);
    const saved = JSON.parse(h.bytes()); assert.deepEqual(saved.customEnvelopeMetadata, fixture.customEnvelopeMetadata);
    assert.deepEqual(saved.sales, fixture.sales); assert.equal(h.writes.length, 1);
    assert.deepEqual(guard.save(h.storage, next), { ok: true, changed: false }); assert.equal(h.writes.length, 1);
  });
  for (const [label, raw] of [
    ["malformed JSON", "{broken"], ["empty present value", ""], ["null root", "null"], ["array root", "[]"], ["primitive root", "12"],
    ["string root", '"keep these bytes"'], ["invalid record row", '{"items":[null]}'], ["invalid legacy trades", '{"trades":{}}'],
    ["invalid market-price cache", '{"marketPriceCache":{"prices":{}}}'],
  ]) await check(`${label} blocks writes until a fresh controller reload`, () => {
    const h = memoryStorage(raw), guard = createLegacyAppStorageGuard();
    const loaded = guard.load(h.storage); assert.ok(loaded.error); assert.deepEqual(loaded.data, {});
    assert.equal(guard.save(h.storage, fixture).ok, false); assert.equal(h.bytes(), raw); assert.equal(h.writes.length, 0);
    h.replace(JSON.stringify(fixture)); guard.load(h.storage);
    assert.equal(guard.save(h.storage, { items: [] }).ok, false); assert.equal(h.writes.length, 0);
    const reloaded = createLegacyAppStorageGuard(); assert.equal(reloaded.load(h.storage).error, "");
    assert.equal(reloaded.save(h.storage, { items: [{ ...fixture.items[0], quantity: 3 }] }).ok, true);
  });
  const recordArrays = ["items", "purchasers", "catalogProducts", "tideTradrWatchlist", "marketplaceListings", "marketplaceReports", "marketPriceMemories", "itemComparisons", "vaultCollectionSets", "vaultDisplayCase", "userSearchAliases", "expenses", "sales", "tradeRecords", "sparkGifts", "sparkKidPacks", "sparkEventPlans", "collectorEventPlans", "vehicles", "mileageTrips", "workspaces", "workspaceMembers", "workspaceInvites"];
  for (const field of [...recordArrays, "marketplaceSavedIds"]) await check(`unsupported ${field} envelope is never converted to writable defaults`, () => {
    const raw = JSON.stringify({ ...fixture, [field]: {} }), h = memoryStorage(raw), guard = createLegacyAppStorageGuard();
    assert.ok(guard.load(h.storage).error, `${field} must be an array when present`);
    assert.equal(guard.save(h.storage, fixture).ok, false); assert.equal(h.bytes(), raw); assert.equal(h.writes.length, 0);
  });
  for (const field of ["settings", "forgeModeSettings", "dealForm", "dashboardLayout", "homeStatsEnabled", "appSetupPersonalization", "locationSettings", "subscriptionProfile", "profile"]) await check(`unsupported ${field} object shape blocks writes`, () => {
    const raw = JSON.stringify({ ...fixture, [field]: [] }), h = memoryStorage(raw), guard = createLegacyAppStorageGuard();
    assert.ok(guard.load(h.storage).error); assert.equal(guard.save(h.storage, fixture).ok, false);
    assert.equal(h.bytes(), raw); assert.equal(h.writes.length, 0);
  });
  for (const [label, patch] of [
    ["null purchaser", { purchasers: [null] }], ["null alias", { userSearchAliases: [null] }],
    ["object saved ID", { marketplaceSavedIds: [{}] }], ["invalid dashboard sections", { dashboardLayout: { sections: {} } }],
    ["object saved location", { locationSettings: { savedLocations: [{}] } }],
    ["primitive home stats", { homeStatsEnabled: "preserve-me" }], ["null home stats", { homeStatsEnabled: null }],
  ]) await check(`${label} cannot be normalized into writable defaults`, () => {
    const raw = JSON.stringify({ ...fixture, ...patch }), h = memoryStorage(raw), guard = createLegacyAppStorageGuard();
    assert.ok(guard.load(h.storage).error); assert.equal(guard.save(h.storage, fixture).ok, false); assert.equal(h.bytes(), raw);
  });
  await check("supported legacy aliases, purchaser rows and scalar IDs remain valid", () => {
    const data = { ...fixture, purchasers: [{ id: "Exact-Purchaser", name: "Family collector" }], userSearchAliases: [{ alias: "binder", canonicalName: "Archive Binder" }], marketplaceSavedIds: ["Listing-A", 42], dashboardLayout: { sections: [{ key: "collection", enabled: true }] }, homeStatsEnabled: { collection: true, futureMetric: false }, locationSettings: { savedLocations: ["Norfolk, Virginia"] }, customUnknownField: { records: [null, 4, "future schema"] } };
    const h = memoryStorage(JSON.stringify(data)), guard = createLegacyAppStorageGuard();
    assert.deepEqual(guard.load(h.storage), { data, error: "" });
    assert.equal(guard.save(h.storage, { userType: "collector" }).ok, true);
    for (const field of ["purchasers", "userSearchAliases", "marketplaceSavedIds", "homeStatsEnabled", "customUnknownField"]) assert.deepEqual(JSON.parse(h.bytes())[field], data[field]);
  });
  await check("mutable presentation data cannot mutate the committed merge baseline", () => {
    const h = memoryStorage(), guard = createLegacyAppStorageGuard(), loaded = guard.load(h.storage);
    loaded.data.customEnvelopeMetadata.nested.unknown = false;
    assert.equal(guard.save(h.storage, { items: [{ ...fixture.items[0], quantity: 3 }] }).ok, true);
    assert.deepEqual(JSON.parse(h.bytes()).customEnvelopeMetadata, fixture.customEnvelopeMetadata);
  });
  await check("initial storage read denial remains latched after storage recovers", () => {
    const h = memoryStorage(), guard = createLegacyAppStorageGuard(), raw = h.bytes(); h.faults.read = true;
    assert.ok(guard.load(h.storage).error); h.faults.read = false;
    assert.equal(guard.save(h.storage, { items: [] }).ok, false); guard.load(h.storage);
    assert.equal(guard.save(h.storage, { items: [] }).ok, false); assert.equal(h.bytes(), raw); assert.equal(h.writes.length, 0);
  });
  await check("unavailable storage establishes a stable blocked error", () => {
    const guard = createLegacyAppStorageGuard(); assert.ok(guard.load(undefined).error);
    const error = guard.getError(); assert.equal(guard.getError(), error);
    assert.equal(guard.save(memoryStorage().storage, fixture).ok, false); assert.equal(guard.getError(), error);
  });
  await check("later read denial latches instead of writing a stale snapshot", () => {
    const h = memoryStorage(), guard = createLegacyAppStorageGuard(), raw = h.bytes(); guard.load(h.storage); h.faults.read = true;
    assert.equal(guard.save(h.storage, { items: [] }).ok, false); h.faults.read = false;
    assert.equal(guard.save(h.storage, { items: [] }).ok, false); assert.equal(h.bytes(), raw); assert.equal(h.writes.length, 0);
  });
  for (const [label, replacement] of [["another tab replaces data", JSON.stringify({ ...fixture, customEnvelopeMetadata: { newer: true } })], ["another tab deletes data", null], ["another tab corrupts data", "{external-corruption"]]) await check(`${label}: baseline conflict latches and preserves the newer bytes`, () => {
    const h = memoryStorage(), guard = createLegacyAppStorageGuard(), original = h.bytes(); guard.load(h.storage); h.replace(replacement);
    assert.equal(guard.save(h.storage, { items: [] }).ok, false); assert.equal(h.bytes(), replacement); assert.equal(h.writes.length, 0);
    assert.match(guard.getError(), /changed outside this page/);
    h.replace(original); assert.equal(guard.save(h.storage, { items: [] }).ok, false); assert.equal(h.writes.length, 0);
  });
  await check("another tab creates a formerly absent key before first save", () => {
    const h = memoryStorage(null), guard = createLegacyAppStorageGuard(); guard.load(h.storage); const latest = JSON.stringify(fixture); h.replace(latest);
    assert.equal(guard.save(h.storage, { items: [] }).ok, false); assert.equal(h.bytes(), latest); assert.equal(h.writes.length, 0);
  });
  await check("quota failure retains saved bytes and draft, notifies once, and can retry", () => {
    const h = memoryStorage(), guard = createLegacyAppStorageGuard(), raw = h.bytes(), notifications = [];
    const unsubscribe = guard.subscribe(() => notifications.push(guard.getError()));
    guard.load(h.storage); h.faults.write = true;
    const draft = { items: [{ ...fixture.items[0], quantity: 7 }] }, before = clone(draft);
    assert.equal(guard.save(h.storage, draft).ok, false); assert.equal(h.bytes(), raw); assert.deepEqual(draft, before);
    const error = guard.getError(); assert.match(error, /could not be saved/); assert.equal(guard.getError(), error);
    assert.equal(guard.save(h.storage, draft).ok, false); assert.equal(notifications.length, 1); assert.equal(h.writes.length, 0);
    h.faults.write = false; assert.equal(guard.save(h.storage, draft).ok, true); assert.equal(h.writes.length, 1);
    assert.equal(guard.getError(), ""); assert.deepEqual(notifications, [error, ""]); assert.deepEqual(draft, before);
    unsubscribe(); h.faults.write = true; guard.save(h.storage, { items: [] }); assert.equal(notifications.length, 2);
  });
  await check("unsupported next values fail without writing or mutating the draft", () => {
    const h = memoryStorage(), guard = createLegacyAppStorageGuard(), raw = h.bytes(); guard.load(h.storage);
    const draft = { items: [null] }; assert.equal(guard.save(h.storage, draft).ok, false);
    assert.deepEqual(draft, { items: [null] }); assert.equal(h.bytes(), raw); assert.equal(h.writes.length, 0);
    assert.equal(guard.save(h.storage, { items: [{ ...fixture.items[0], quantity: 6 }] }).ok, true);
  });
  await check("serialization failure leaves original bytes and can recover", () => {
    const h = memoryStorage(), guard = createLegacyAppStorageGuard(), raw = h.bytes(); guard.load(h.storage);
    const draft = {}; draft.circular = draft;
    assert.equal(guard.save(h.storage, { customEnvelopeMetadata: draft }).ok, false); assert.equal(h.bytes(), raw); assert.equal(h.writes.length, 0);
    assert.equal(draft.circular, draft); assert.equal(guard.save(h.storage, { items: [] }).ok, true);
  });
  await check("confirmed reset is accepted only after the key is actually absent", () => {
    const h = memoryStorage("{broken"), guard = createLegacyAppStorageGuard(); guard.load(h.storage);
    assert.equal(guard.acceptConfirmedReset(h.storage, true), false); h.replace(null);
    assert.equal(guard.acceptConfirmedReset(h.storage, false), false); assert.equal(guard.save(h.storage, fixture).ok, false);
    assert.equal(guard.acceptConfirmedReset(h.storage, true), true); assert.equal(guard.getError(), "");
    assert.equal(guard.save(h.storage, fixture).ok, true);
  });
  await check("actual render-time storage size reader reports denial as Unavailable", () => {
    const source = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
    const ast = espree.parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
    let node;
    function visit(value) { if (!value || typeof value !== "object") return; if (value.type === "FunctionDeclaration" && value.id?.name === "storageSizeLabelForKey") node = value; for (const child of Object.values(value)) { if (Array.isArray(child)) child.forEach(visit); else if (child?.type) visit(child); } }
    visit(ast); assert.ok(node, "Actual storage status reader must exist");
    const h = memoryStorage("x".repeat(1025));
    const context = vm.createContext({ Blob, localStorage: h.storage });
    vm.runInContext(source.slice(...node.range), context);
    assert.equal(context.storageSizeLabelForKey(key), "2 KB"); h.faults.read = true;
    assert.equal(context.storageSizeLabelForKey(key), "Unavailable"); assert.equal(h.writes.length, 0);
  });
}

async function checkBrowser() {
  const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217/");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Startup fixtures must be local-only");
  const browser = await chromium.launch({ headless: true });
  const browserResults = [];
  try {
    for (const [mode, width, theme] of [["corrupt", 360, "light"], ["read-denied", 1440, "dark"], ["unsupported", 360, "dark"], ["valid", 1440, "light"], ["quota", 360, "light"]]) {
      if (process.env.LEGACY_BROWSER_CASES && !process.env.LEGACY_BROWSER_CASES.split(",").includes(mode)) continue;
      const raw = mode === "corrupt" ? "{broken-startup-records" : mode === "unsupported" ? JSON.stringify({ ...fixture, purchasers: {} }) : JSON.stringify(fixture);
      const context = await browser.newContext({ viewport: { width, height: width === 360 ? 800 : 900 }, hasTouch: width === 360 });
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        return ["GET", "HEAD"].includes(route.request().method()) && (url.origin === base.origin || !["http:", "https:"].includes(url.protocol)) ? route.continue() : route.abort();
      });
      await context.addInitScript(({ storageKey, raw, mode }) => {
        const read = Storage.prototype.getItem, write = Storage.prototype.setItem;
        if (!sessionStorage.getItem("core-guard-fixture")) {
          sessionStorage.setItem("core-guard-fixture", "1");
          write.call(localStorage, storageKey, raw);
          write.call(localStorage, "et-tcg-phase2-data", JSON.stringify({ receiptRecords: [{ id: "Retained-Receipt-A", note: "Keep receipt" }], receiptLineItems: [{ id: "Retained-Line-A", receiptId: "Retained-Receipt-A" }], customEnvelopeMetadata: { keep: true } }));
          write.call(localStorage, "et-tcg-beta-tidepool", JSON.stringify({ posts: [{ id: "Retained-Post-A", text: "Collector meetup note", authorId: "local-beta" }], comments: [], customEnvelopeMetadata: { keep: true } }));
        }
        window.__coreWrites = [];
        window.__coreDeniedReads = [];
        window.__coreReadDenied = mode === "read-denied";
        window.__readCoreOriginal = () => read.call(localStorage, storageKey);
        Storage.prototype.getItem = function (name) { if (this === localStorage && name === storageKey && window.__coreReadDenied) { const error = new DOMException("Synthetic core read denial", "SecurityError"); window.__coreDeniedReads.push(error.stack); throw error; } return read.call(this, name); };
        Storage.prototype.setItem = function (name, value) {
          if (this === localStorage && name === storageKey) {
            const observation = { bytes: String(value).length, committed: false }; window.__coreWrites.push(observation);
            if (mode === "quota") throw new DOMException("Synthetic core quota", "QuotaExceededError");
            write.call(this, name, value); observation.committed = true; return;
          }
          return write.call(this, name, value);
        };
      }, { storageKey: key, raw, mode });
      const page = await context.newPage(), errors = [], consoleErrors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      try {
        await page.goto(new URL(`/?betaLocalMode=true&themeInspect=${theme}`, base).href, { waitUntil: "networkidle" });
        const boundary = page.getByRole("heading", { name: "We couldn't load this screen", exact: true });
        if (await boundary.isVisible()) throw new Error(`App error boundary: ${await page.locator("body").textContent()}`);
        await expect(page.locator(".ops-home-page")).toBeVisible({ timeout: 30000 });
        const warning = page.locator(".local-storage-save-warning[role='alert']");
        if (mode === "valid") await expect(warning).toHaveCount(0);
        else {
          await expect(warning).toBeVisible();
          await expect(warning).toContainText(mode === "quota" ? "could not be saved" : "Automatic saving is paused");
        }
        const boot = await page.evaluate(() => ({ bytes: window.__readCoreOriginal(), writes: window.__coreWrites }));
        if (mode === "valid") {
          const saved = JSON.parse(boot.bytes);
          assert.equal(saved.items[0].id, fixture.items[0].id); assert.equal(saved.items[0].quantity, fixture.items[0].quantity);
          assert.equal(saved.sales[0].id, fixture.sales[0].id); assert.equal(saved.expenses[0].id, fixture.expenses[0].id);
          assert.deepEqual(saved.items[0].customItemMetadata, fixture.items[0].customItemMetadata);
          assert.deepEqual(saved.customEnvelopeMetadata, fixture.customEnvelopeMetadata);
        } else {
          assert.equal(boot.bytes, raw, `${mode} boot must preserve exact saved bytes`);
          assert.equal(boot.writes.filter((write) => write.committed).length, 0);
        }
        await page.screenshot({ path: path.join(output, `startup-${mode}-${width}.png`), fullPage: true });
        await page.goto(new URL(`/settings?betaLocalMode=true&themeInspect=${theme}`, base).href, { waitUntil: "networkidle" });
        await expect(page.locator(".settings-layout")).toBeVisible({ timeout: 30000 });
        await page.getByRole("button", { name: /Archive & backups/i }).click();
        const backup = page.locator(".backup-recovery");
        await expect(backup.getByRole("heading", { name: "Data & Backup", exact: true })).toBeVisible();
        await expect(backup.getByRole("button", { name: "Export verified backup", exact: true })).toBeVisible();
        if (mode !== "valid") {
          await expect(warning).toBeVisible();
          assert.equal(await page.evaluate(() => window.__readCoreOriginal()), raw, "Opening backup tools must not replace failed source data");
        }
        const retained = await page.evaluate(() => ({ phase2: JSON.parse(localStorage.getItem("et-tcg-phase2-data")), tidepool: JSON.parse(localStorage.getItem("et-tcg-beta-tidepool")) }));
        assert.equal(retained.phase2.receiptRecords[0].id, "Retained-Receipt-A"); assert.equal(retained.phase2.receiptLineItems[0].id, "Retained-Line-A");
        assert.deepEqual(retained.phase2.customEnvelopeMetadata, { keep: true });
        assert.equal(retained.tidepool.posts[0].id, "Retained-Post-A"); assert.deepEqual(retained.tidepool.customEnvelopeMetadata, { keep: true });
        await page.screenshot({ path: path.join(output, `backup-access-${mode}-${width}.png`), fullPage: true });
        if (mode === "valid") {
          await page.goto(new URL(`/vault/cards?betaLocalMode=true&themeInspect=${theme}`, base).href);
          await expect(page.getByRole("heading", { name: "Archive Binder", exact: true })).toBeVisible({ timeout: 30000 });
          await expect(warning).toHaveCount(0);
        }
        assert.deepEqual(errors, []); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        browserResults.push({ mode, width, theme, passed: true, bootWrites: boot.writes.length, committedBootWrites: boot.writes.filter((write) => write.committed).length, preserved: mode !== "valid" ? boot.bytes === raw : "valid records and unknown metadata retained", settingsAndBackupReachable: true, unrelatedDatasetsPreserved: true });
        console.log(`PASS native ${mode} ${width}: protected startup, Settings and backup access`);
      } catch (error) {
        await page.screenshot({ path: path.join(output, `failure-${mode}-${width}.png`), fullPage: true });
        fs.writeFileSync(path.join(output, `failure-${mode}.json`), JSON.stringify({ error: error.message, pageErrors: errors, consoleErrors, state: await page.evaluate(() => ({ bytes: window.__readCoreOriginal?.(), writes: window.__coreWrites, deniedReads: window.__coreDeniedReads })) }, null, 2));
        throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "browser-results.json"), JSON.stringify(browserResults, null, 2)); }
}

async function main() {
  try { if (!process.argv.includes("--browser-only")) await checkGuard(); if (!process.argv.includes("--unit-only")) await checkBrowser(); }
  finally { if (!process.argv.includes("--browser-only")) fs.writeFileSync(path.join(output, "guard-results.json"), JSON.stringify({ passed: results.length, results }, null, 2)); }
  if (!process.argv.includes("--browser-only")) console.log(`PASS ${results.length}/${results.length} actual core storage guard checks`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
