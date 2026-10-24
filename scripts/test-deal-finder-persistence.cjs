const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const espree = require("espree");
const { chromium, expect } = require("@playwright/test");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "artifacts/qa/release-readiness/deal-finder-persistence");
fs.mkdirSync(output, { recursive: true });
const source = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
const ast = espree.parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
const functions = new Map();
let preferenceEffect;
function visit(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration") functions.set(node.id.name, node);
  if (node.type === "VariableDeclarator" && node.id?.name === "updatePhase2Status") functions.set(node.id.name, node);
  if (node.type === "CallExpression" && node.callee?.name === "useEffect" && node.arguments[0]?.range
    && source.slice(...node.arguments[0].range).includes("saveAppPreferences(phase2Context()")) preferenceEffect = node.arguments[0];
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit); else if (value?.type) visit(value);
  }
}
visit(ast);
const code = ["buildDealFinderSessionRecord", "saveDealFinderWorkflow", "openDealFinderAddItem"].map((name) => source.slice(...functions.get(name).range)).join("\n")
  + "\nconst " + source.slice(...functions.get("updatePhase2Status").range) + ";";
const storageKey = "et-tcg-phase2-data";
const initial = {
  dealFinderSessions: [{ id: "Prior-Deal-ID", title: "Prior synthetic deal", askingPrice: 7 }],
  dealFinderItems: [{ id: "Prior-Item-ID", sessionId: "Prior-Deal-ID", quantity: 1 }],
  receiptRecords: [{ id: "prior-receipt" }], receiptLineItems: [{ id: "prior-line", receiptId: "prior-receipt" }],
  appPreferences: { dashboardPreset: "seller", unknownPreference: "retain" }, customData: { preserve: [1, 2] },
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const results = [];
async function check(label, run) { await run(); results.push(label); console.log(`PASS ${label}`); }

async function checkHandlers() {
  const services = await import(pathToFileURL(path.join(root, "src/services/phase2Persistence.js")));
  function harness({ raw = JSON.stringify(initial), readError = false, writeError = false } = {}) {
    let bytes = raw, writes = 0, sequence = 0;
    const faults = { read: readError, write: writeError }, toasts = [], statuses = [], handoffs = [], closed = [];
    const storage = {
      getItem: () => { if (faults.read) throw new DOMException("Synthetic read denial", "SecurityError"); return bytes; },
      setItem: (key, value) => { assert.equal(key, storageKey); if (faults.write) throw new DOMException("Synthetic quota reached", "QuotaExceededError"); writes += 1; bytes = value; },
    };
    global.localStorage = storage;
    const context = vm.createContext({
      ...services, blockGuestSave: () => false, phase2Context: () => ({}), phase2Data: clone(initial),
      dealForm: { title: "Synthetic durable deal", quantity: 2, marketTotal: 60, retailTotal: 40, notes: "Keep this draft", condition: "Sealed" },
      selectedDealProduct: null, dealAskingPrice: 25, dealMarketTotal: 60, dealRetailTotal: 40, dealPotentialProfit: 27.8,
      dealRoi: 111.2, dealScore: 90, dealRecommendation: "Buy", dealRecommendationReason: "Synthetic fixture",
      makeId: (prefix) => `${prefix}-Exact-${++sequence}`, setVaultToast: (value) => toasts.push(value),
      setPhase2SyncStatus: (value) => statuses.push(value),
      openProductAddFlow: (value) => handoffs.push(value), setDealFinderOpen: (value) => closed.push(value),
    });
    context.setPhase2Data = (value) => {
      assert.ok(writes > 0, "React state must not update before a successful local write");
      context.phase2Data = typeof value === "function" ? value(context.phase2Data) : value;
    };
    vm.runInContext(code, context);
    return { context, faults, toasts, statuses, handoffs, closed, storage, bytes: () => bytes, replace: (value) => { bytes = value; }, writes: () => writes };
  }

  for (const [label, options] of [
    ["quota", { writeError: true }], ["read denial", { readError: true }],
    ["malformed JSON", { raw: "{broken" }], ["empty existing value", { raw: "" }],
    ["null envelope", { raw: "null" }], ["array envelope", { raw: "[]" }],
    ["invalid sessions", { raw: '{"dealFinderSessions":{}}' }],
  ]) await check(`${label}: actual Deal save fails without phantom state and recovers`, async () => {
    const h = harness(options), before = h.bytes(), state = clone(h.context.phase2Data), draft = clone(h.context.dealForm);
    assert.equal(await h.context.saveDealFinderWorkflow(), null);
    assert.equal(h.writes(), 0); assert.equal(h.bytes(), before);
    assert.deepEqual(clone(h.context.phase2Data), state); assert.deepEqual(clone(h.context.dealForm), draft);
    assert.match(h.toasts.at(-1), /Deal was not saved/); assert.equal(h.statuses.at(-1).kind, "storage_error");
    h.faults.read = false; h.faults.write = false; h.replace(JSON.stringify(initial));
    const saved = await h.context.saveDealFinderWorkflow();
    assert.ok(saved); assert.equal(h.writes(), 1); assert.equal(h.context.phase2Data.dealFinderSessions[0].id, saved.id);
    const persisted = JSON.parse(h.bytes());
    assert.equal(persisted.dealFinderSessions[0].id, saved.id);
    assert.equal(persisted.dealFinderItems[0].id, saved.items[0].id);
    assert.equal(persisted.dealFinderItems[0].sessionId, saved.id);
    assert.deepEqual(persisted.receiptRecords, initial.receiptRecords); assert.deepEqual(persisted.customData, initial.customData);
    assert.deepEqual(clone(h.context.dealForm), draft); assert.equal(h.toasts.at(-1), "Deal session saved locally.");
  });

  await check("unavailable local storage fails explicitly", async () => {
    const h = harness(); delete global.localStorage;
    assert.equal(await h.context.saveDealFinderWorkflow(), null);
    assert.equal(h.writes(), 0); assert.match(h.toasts.at(-1), /was not saved/);
  });
  await check("only absent storage initializes defaults", async () => {
    const h = harness({ raw: null });
    const saved = await h.context.saveDealFinderWorkflow();
    assert.ok(saved); assert.equal(h.writes(), 1); assert.equal(JSON.parse(h.bytes()).dealFinderItems.length, 1);
  });
  await check("existing exact session/item IDs upsert in one write and preserve other records", async () => {
    const h = harness();
    const session = { id: "Prior-Deal-ID", title: "Updated exact deal", items: [{ id: "Prior-Item-ID", quantity: 3 }] };
    await services.saveDealFinderSession({}, session);
    const saved = JSON.parse(h.bytes());
    assert.equal(h.writes(), 1); assert.equal(saved.dealFinderSessions.length, 1); assert.equal(saved.dealFinderItems.length, 1);
    assert.equal(saved.dealFinderSessions[0].id, session.id); assert.equal(saved.dealFinderItems[0].id, session.items[0].id);
    assert.equal(saved.dealFinderItems[0].quantity, 3); assert.deepEqual(saved.customData, initial.customData);
    assert.deepEqual(saved.receiptLineItems, initial.receiptLineItems);
  });
  await check("Add item handoff keeps the dialog and draft on failure; succeeds after durable save", async () => {
    const h = harness({ writeError: true }), draft = clone(h.context.dealForm);
    await h.context.openDealFinderAddItem();
    assert.equal(h.handoffs.length, 0); assert.equal(h.closed.length, 0); assert.deepEqual(clone(h.context.dealForm), draft);
    h.faults.write = false; await h.context.openDealFinderAddItem();
    assert.equal(h.writes(), 1); assert.equal(h.handoffs.length, 1); assert.deepEqual(h.closed, [false]);
    assert.equal(h.handoffs[0].source, "deal-finder-manual"); assert.equal(h.handoffs[0].seed.itemName, draft.title);
  });
  await check("startup preferences failure is caught without overwriting corrupt data", async () => {
    const h = harness({ raw: "{invalid" }); let scheduled;
    Object.assign(h.context, {
      localDataLoaded: true, guestPreviewActive: false, user: { id: "local-beta" },
      dashboardPreset: "seller", homeStatsEnabled: {}, dashboardLayout: { sections: {} },
      window: { setTimeout: (callback) => { scheduled = callback; return 1; }, clearTimeout() {} },
    });
    assert.ok(preferenceEffect);
    vm.runInContext(`(${source.slice(...preferenceEffect.range)})()`, h.context);
    scheduled(); await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.bytes(), "{invalid"); assert.equal(h.writes(), 0);
    assert.equal(h.statuses.at(-1).kind, "storage_error"); assert.match(h.statuses.at(-1).message, /backup tools remain available/);
  });

  const callers = [
    ["preferences", () => services.saveAppPreferences({}, { dashboardPreset: "collector" })],
    ["notification", () => services.saveNotificationPreference({}, { key: "priceDrop", enabled: true })],
    ["deal", () => services.saveDealFinderSession({}, { id: "new-deal", items: [{ id: "new-deal-item" }] })],
    ["scanner", () => services.saveScannerIntakeSession({}, { id: "new-scan" })],
    ["listing channels", () => services.saveMarketplaceListingChannels({}, { id: "new-listing" }, [{ id: "new-channel", platform: "other" }])],
    ["receipt", () => services.saveReceiptRecord({}, { id: "new-receipt", lines: [{ id: "new-line" }] })],
    ["kid project", () => services.saveKidCommunityProject({}, { id: "new-project", items: [{ id: "new-project-item" }] })],
    ["AI log", () => services.saveAiAssistEvent({}, { id: "new-event" })],
  ];
  for (const [label, save] of callers) await check(`shared writer: ${label} keeps valid contract and rejects corrupt reads`, async () => {
    const h = harness(); const result = await save(); assert.equal(result.source, "local");
    assert.equal(h.writes(), 1); assert.deepEqual(JSON.parse(h.bytes()).customData, initial.customData);
    h.replace("{corrupt"); await assert.rejects(save); assert.equal(h.writes(), 1); assert.equal(h.bytes(), "{corrupt");
  });
  delete global.localStorage;
}

async function checkBrowser() {
  const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217/");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [theme, width] of [["light", 360], ["dark", 1440]]) await check(`browser ${theme} ${width}: quota failure, recovery, durable save/reload`, async () => {
      const context = await browser.newContext({ viewport: { width, height: width === 360 ? 800 : 900 } });
      await context.route("**/*", (route) => {
        const request = route.request(), url = new URL(request.url());
        return ["GET", "HEAD"].includes(request.method()) && (url.origin === base.origin || !["http:", "https:"].includes(url.protocol)) ? route.continue() : route.abort();
      });
      await context.addInitScript(({ initial, storageKey }) => {
        if (localStorage.getItem("synthetic-deal-persistence")) return;
        localStorage.setItem("synthetic-deal-persistence", "true");
        localStorage.setItem(storageKey, JSON.stringify(initial));
        localStorage.setItem("et-tcg-beta-data", JSON.stringify({
          userType: "seller", dashboardPreset: "seller", forgeModeSettings: { personalForgeEnabled: true, lockToEmberTide: false },
          catalogProducts: [{ id: "synthetic-persistence-product", name: "Synthetic persistence bundle", sourceType: "manual", catalogType: "sealed", marketPrice: 30, msrpPrice: 20 }],
          tideTradrWatchlist: [{ id: "synthetic-persistence-watch", productId: "synthetic-persistence-product", name: "Synthetic persistence bundle", workspaceId: "workspace-personal-local-beta" }],
        }));
      }, { initial, storageKey });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.goto(new URL(`/exchange/market?betaLocalMode=true&themeInspect=${theme}`, base).href);
        const product = page.locator(".market-v4-result-row").filter({ hasText: "Synthetic persistence bundle" });
        await expect(product).toBeVisible({ timeout: 30000 }); await product.getByRole("button", { name: "Compare", exact: true }).click();
        const modal = page.locator(".deal-finder-modal"); await expect(modal).toBeVisible();
        await modal.getByLabel("Asking Price", { exact: true }).fill("10");
        const original = await page.evaluate((key) => localStorage.getItem(key), storageKey);
        await page.evaluate((key) => {
          const originalSetItem = Storage.prototype.setItem;
          window.syntheticRestoreStorage = () => { Storage.prototype.setItem = originalSetItem; };
          Storage.prototype.setItem = function (name, value) {
            if (name === key) throw new DOMException("Synthetic quota failure", "QuotaExceededError");
            return originalSetItem.call(this, name, value);
          };
        }, storageKey);
        await modal.getByRole("button", { name: "Calculate & Save Deal", exact: true }).click();
        await expect(page.getByText(/^Deal was not saved because local storage/)).toBeVisible();
        await expect(modal.locator(".home-list-row")).toHaveCount(1);
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), original);
        await modal.getByRole("button", { name: "Add item from this deal", exact: true }).click();
        await expect(modal).toBeVisible(); await expect(modal.getByLabel("Asking Price", { exact: true })).toHaveValue("10");
        await page.screenshot({ path: path.join(output, `blocked-${theme}-${width}.png`) });
        await page.evaluate(() => window.syntheticRestoreStorage());
        await modal.getByRole("button", { name: "Calculate & Save Deal", exact: true }).click();
        // The durable saved record and its visible history row are the success
        // contract; short-lived global toasts need not survive modal rendering.
        await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).dealFinderSessions.length, storageKey), { timeout: 30000 }).toBe(2);
        await expect(modal.locator(".home-list-row")).toHaveCount(2, { timeout: 30000 });
        await expect(modal.locator(".home-list-row").filter({ hasText: "Synthetic persistence bundle" })).toBeVisible();
        const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
        assert.equal(saved.dealFinderSessions.length, 2); assert.equal(saved.dealFinderItems.length, 2);
        assert.equal(saved.dealFinderItems[0].sessionId, saved.dealFinderSessions[0].id);
        assert.deepEqual(saved.receiptRecords, initial.receiptRecords); assert.deepEqual(saved.customData, initial.customData);
        await page.reload(); await expect(product).toBeVisible({ timeout: 30000 });
        await page.getByRole("button", { name: /^Check deal/i }).first().click();
        await expect(modal.locator(".home-list-row").filter({ hasText: "Synthetic persistence bundle" })).toBeVisible();
        const reloaded = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
        assert.deepEqual(reloaded.dealFinderSessions, saved.dealFinderSessions); assert.deepEqual(reloaded.dealFinderItems, saved.dealFinderItems);
        await page.screenshot({ path: path.join(output, `saved-reloaded-${theme}-${width}.png`) });
        assert.deepEqual(errors, []);
      } catch (error) {
        await page.screenshot({ path: path.join(output, `failure-${theme}-${width}.png`) }).catch(() => {});
        const diagnostic = await page.evaluate((key) => ({ text: document.body.innerText, saved: localStorage.getItem(key) }), storageKey).catch(() => ({}));
        fs.writeFileSync(path.join(output, `failure-${theme}-${width}.json`), JSON.stringify({ error: error.message, errors, ...diagnostic }, null, 2));
        throw error;
      } finally { await context.close(); }
    });
  } finally { await browser.close(); }
}

(async () => {
  try { await checkHandlers(); if (!process.env.DEAL_PERSISTENCE_UNIT_ONLY) await checkBrowser(); }
  finally {
    delete global.localStorage;
    fs.writeFileSync(path.join(output, process.env.DEAL_PERSISTENCE_UNIT_ONLY ? "unit-results.json" : "results.json"), JSON.stringify({ count: results.length, checks: results }, null, 2));
  }
  console.log(`Deal Finder persistence: ${results.length} checks passed.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
