const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("@playwright/test");

const BASE_URL = new URL(process.env.APP_URL || "http://127.0.0.1:5200/");
const PURCHASE_KEY = "code3.purchase-receiving.v1";
const INVENTORY_KEY = "ember-and-tide.flip-scout.v1";
const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "qa", "code3-phase2cd-inventory-reconciliation", "current");
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
let assertions = 0;
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const match = (value, pattern, message) => { assert.match(value, pattern, message); assertions += 1; };

async function syntheticStates() {
  const helper = await import(pathToFileURL(path.join(process.cwd(), "scripts", "inventory-correction-test-helpers.mjs")).href);
  const repositoryModule = await import(pathToFileURL(path.join(process.cwd(), "src", "features", "flipScout", "storageRepository.js")).href);
  const exactCost = await import(pathToFileURL(path.join(process.cwd(), "src", "features", "flipScout", "exactInventoryCost.js")).href);
  const harness = await helper.createManagedInventory({ id: "phase2cd-browser", quantity: 2, totalMinorUnits: 1001 });
  const repository = repositoryModule.createFlipScoutRepository(harness.inventoryStorage);
  const state = repository.load();
  const item = state.inventory.find((entry) => entry.id === harness.created.inventoryItem.id);
  const cogsMinorUnits = exactCost.suggestedInventorySaleCogsMinorUnits(item, state.sales, 1);
  const saved = repository.upsert("sales", {
    id: "sale.phase2cd-browser.test",
    inventoryItemId: item.id,
    lotId: item.inventoryLotId,
    quantitySold: 1,
    status: "Completed",
    saleDate: "2026-08-15",
    salesChannel: "Synthetic browser channel",
    grossSalePrice: 20,
    allocatedCostOfGoodsSoldMinorUnits: cogsMinorUnits,
    allocatedCostOfGoodsSold: cogsMinorUnits / 100,
    costAuthority: "INTEGER_MINOR_UNITS",
    netProceeds: 20,
    realizedProfit: 20 - (cogsMinorUnits / 100),
  });
  if (saved.error) throw new Error(saved.error);
  return {
    purchase: JSON.parse(harness.purchaseStorage.values.get(PURCHASE_KEY)),
    inventory: JSON.parse(harness.inventoryStorage.values.get(INVENTORY_KEY)),
  };
}

function url(owner = true, theme = "light") {
  const value = new URL("/business/purchases", BASE_URL);
  if (owner) value.searchParams.set("betaLocalMode", "true");
  else { value.searchParams.set("role", "OWNER"); value.searchParams.set("ownerAuthorized", "true"); }
  value.searchParams.set("themeInspect", theme);
  return value.toString();
}

async function seed(context, states) {
  await context.addInitScript(({ purchaseKey, inventoryKey, seeded }) => {
    if (!localStorage.getItem(purchaseKey)) localStorage.setItem(purchaseKey, JSON.stringify(seeded.purchase));
    if (!localStorage.getItem(inventoryKey)) localStorage.setItem(inventoryKey, JSON.stringify(seeded.inventory));
    window.__phase2cd = { inventoryReads: 0, inventoryWrites: 0, lockRequests: 0, lockPatchInstalled: false };
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.getItem = function patchedGetItem(key) {
      if (this === localStorage && key === inventoryKey) window.__phase2cd.inventoryReads += 1;
      return originalGet.call(this, key);
    };
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      if (this === localStorage && key === inventoryKey) window.__phase2cd.inventoryWrites += 1;
      return originalSet.call(this, key, value);
    };
    if (navigator.locks?.request) {
      const originalRequest = navigator.locks.request.bind(navigator.locks);
      const patchedRequest = (...args) => {
        window.__phase2cd.lockRequests += 1;
        return originalRequest(...args);
      };
      try {
        Object.defineProperty(navigator.locks, "request", { configurable: true, value: patchedRequest });
        window.__phase2cd.lockPatchInstalled = navigator.locks.request === patchedRequest;
      } catch {
        window.__phase2cd.lockPatchInstalled = false;
      }
    }
  }, { purchaseKey: PURCHASE_KEY, inventoryKey: INVENTORY_KEY, seeded: states });
}

async function noOverflow(page, label) {
  const metrics = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  ok(metrics.scrollWidth - metrics.clientWidth <= 1, `${label} has no horizontal overflow`);
}

async function openCostReconciliation(page) {
  const root = page.locator('[data-testid="purchase-receiving-page"]');
  await root.getByRole("button", { name: "Corrections & Returns", exact: true }).click();
  await root.getByRole("button", { name: "Review Correction or Return", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Review Inventory Correction" });
  await dialog.getByLabel("Correction or disposition").selectOption("ACQUISITION_COST_CORRECTION");
  await dialog.getByLabel("Corrected total cost (minor units)").fill("1101");
  await dialog.getByLabel("Owner reason").fill("Synthetic owner-reviewed historical COGS correction.");
  await dialog.getByRole("button", { name: "Review Correction", exact: true }).click();
  await dialog.getByRole("button", { name: "Review Historical Effect", exact: true }).click();
  await dialog.getByRole("heading", { name: "Historical Reconciliation", exact: true }).waitFor();
  return { root, dialog };
}

(async () => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const states = await syntheticStates();
  const browser = await chromium.launch({ headless: true });
  const external = [];
  const browserErrors = [];
  try {
    for (const scenario of [
      { label: "mobile-light", width: 360, height: 800, theme: "light", mutate: true },
      { label: "phone-dark", width: 430, height: 900, theme: "dark" },
      { label: "tablet-light", width: 768, height: 1024, theme: "light" },
      { label: "desktop-dark", width: 1440, height: 1000, theme: "dark" },
    ]) {
      const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height }, colorScheme: scenario.theme, reducedMotion: "reduce" });
      await seed(context, states);
      const page = await context.newPage();
      page.on("request", (request) => { const requestUrl = new URL(request.url()); if (!LOOPBACK.has(requestUrl.hostname)) external.push(request.url()); });
      page.on("pageerror", (error) => browserErrors.push(`${scenario.label}: ${error.message}`));
      await page.goto(url(true, scenario.theme), { waitUntil: "networkidle" });
      const { root, dialog } = await openCostReconciliation(page);
      equal(await root.getAttribute("data-owner-gate"), "authorized", `${scenario.label} is owner gated`);
      const body = await dialog.innerText();
      match(body, /Original Historical State[\s\S]*Proposed Correction[\s\S]*Accounting & Inventory Consequences[\s\S]*Affected Records/i, `${scenario.label} shows the full historical impact sequence`);
      match(body, /Original COGS[\s\S]*Corrected COGS[\s\S]*Adjustment/i, `${scenario.label} shows exact Sale COGS comparison`);
      match(body, /Inventory Reconciliation Candidate != Historical Mutation/i, `${scenario.label} preserves non-authoritative preview copy`);
      await noOverflow(page, scenario.label);
      equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true, `${scenario.label} honors reduced motion`);

      if (scenario.mutate) {
        const originalSale = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).sales[0], INVENTORY_KEY);
        const countersBefore = await page.evaluate(() => ({ ...window.__phase2cd }));
        equal(countersBefore.lockPatchInstalled, true, "browser lock-request probe is installed");
        const confirm = dialog.getByRole("button", { name: "Confirm COGS Adjustment", exact: true });
        await confirm.focus();
        await confirm.evaluate((button) => { button.click(); button.click(); });
        await page.getByText(/Historical reconciliation recorded once/i).waitFor();
        const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), INVENTORY_KEY);
        assert.deepEqual(saved.sales[0], originalSale, "completed Sale bytes remain unchanged after reconciliation"); assertions += 1;
        equal(saved.inventoryReconciliationEvents.length, 1, "one append-only reconciliation event is recorded");
        equal(saved.inventory[0].quantity, 2, "COGS reconciliation does not change physical quantity");
        equal(saved.inventory[0].acquisitionCostMinorUnits, 1101, "remaining and realized cost projections reconcile to the corrected exact basis");
        const countersAfter = await page.evaluate(() => ({ ...window.__phase2cd }));
        equal(countersAfter.lockRequests - countersBefore.lockRequests, 1, "same-turn double click enters exactly one locked mutation");
        equal(countersAfter.inventoryWrites - countersBefore.inventoryWrites, 1, "one canonical Inventory document write is committed");
        await page.reload({ waitUntil: "networkidle" });
        const refreshed = page.locator('[data-testid="purchase-receiving-page"]');
        await refreshed.getByRole("button", { name: "Corrections & Returns", exact: true }).click();
        match(await refreshed.innerText(), /Historical reconciliations[\s\S]*1/i, "refresh replays one canonical reconciliation event");
        equal((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), INVENTORY_KEY)).inventoryReconciliationEvents.length, 1, "refresh cannot duplicate reconciliation");
      }
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `${scenario.label}.png`), fullPage: true });
      await context.close();
    }

    const deniedContext = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await seed(deniedContext, states);
    const denied = await deniedContext.newPage();
    await denied.goto(url(false), { waitUntil: "networkidle" });
    match(await denied.locator("body").innerText(), /Sign in|Owner Access Required/i, "query authority spoofing remains denied");
    equal(await denied.locator('[data-testid="purchase-receiving-page"]').count(), 0, "denied browser cannot mount reconciliation UI");
    equal(await denied.evaluate(() => window.__phase2cd.inventoryReads), 0, "denied browser performs no Inventory storage read");
    await deniedContext.close();

    equal(browserErrors.length, 0, `browser errors: ${browserErrors.join(" | ")}`);
    equal(external.length, 0, `external requests: ${external.join(" | ")}`);
    console.log(`Code 3 Inventory Reconciliation browser: 5 scenarios, ${assertions} assertions passed; captures ignored at ${path.relative(process.cwd(), ARTIFACT_DIR).replaceAll("\\", "/")}.`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
