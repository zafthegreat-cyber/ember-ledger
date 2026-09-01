const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("@playwright/test");

const BASE_URL = new URL(process.env.APP_URL || "http://127.0.0.1:5200/");
const PURCHASE_KEY = "code3.purchase-receiving.v1";
const INVENTORY_KEY = "ember-and-tide.flip-scout.v1";
const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "qa", "code3-phase2cc-inventory-correction", "current");
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
let assertions = 0;
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const match = (value, pattern, message) => { assert.match(value, pattern, message); assertions += 1; };

async function syntheticStates() {
  const helper = await import(pathToFileURL(path.join(process.cwd(), "scripts", "inventory-correction-test-helpers.mjs")).href);
  const harness = await helper.createManagedInventory({ id: "phase2cc-browser", quantity: 2, totalMinorUnits: 1001 });
  return {
    purchase: JSON.parse(harness.purchaseStorage.values.get(PURCHASE_KEY)),
    inventory: JSON.parse(harness.inventoryStorage.values.get(INVENTORY_KEY)),
  };
}

async function syntheticReplacementStates() {
  const helper = await import(pathToFileURL(path.join(process.cwd(), "scripts", "inventory-correction-test-helpers.mjs")).href);
  const constants = await import(pathToFileURL(path.join(process.cwd(), "src", "features", "purchaseReceiving", "inventoryCorrection", "constants.js")).href);
  const harness = await helper.createManagedInventory({ id: "phase2cc-browser-replacement", quantity: 2, totalMinorUnits: 1001 });
  await helper.confirmCorrection(
    harness.service,
    harness.created.inventoryItem,
    helper.correctionProposal(constants.INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, "phase2cc-browser-replacement", { quantity: 1 }),
  );
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
    window.__phase2cc = { inventoryReads: 0 };
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function patchedGetItem(key) {
      if (this === localStorage && key === inventoryKey) window.__phase2cc.inventoryReads += 1;
      return original.call(this, key);
    };
  }, { purchaseKey: PURCHASE_KEY, inventoryKey: INVENTORY_KEY, seeded: states });
}

async function noOverflow(page, label) {
  const metrics = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  ok(metrics.scrollWidth - metrics.clientWidth <= 1, `${label} has no horizontal overflow`);
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
      const root = page.locator('[data-testid="purchase-receiving-page"]');
      await root.waitFor();
      equal(await root.getAttribute("data-owner-gate"), "authorized", `${scenario.label} is owner gated`);
      await root.getByRole("button", { name: "Corrections & Returns", exact: true }).click();
      match(await root.innerText(), /Refunds alone never remove Inventory/i, `${scenario.label} preserves refund/return separation`);
      const review = root.getByRole("button", { name: "Review Correction or Return", exact: true });
      equal(await review.count(), 1, `${scenario.label} shows one canonical managed item`);
      await review.click();
      await page.getByRole("button", { name: "Review Correction", exact: true }).click();
      match(await page.locator("body").innerText(), /Current State[\s\S]*Proposed Change[\s\S]*Downstream Effect/i, `${scenario.label} previews impact before mutation`);
      await noOverflow(page, scenario.label);
      equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true, `${scenario.label} honors reduced motion`);
      if (scenario.mutate) {
        const confirm = page.getByRole("button", { name: "Confirm Correction", exact: true });
        await confirm.focus();
        await confirm.press("Enter");
        await page.getByText(/Inventory correction recorded once/i).waitFor();
        const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), INVENTORY_KEY);
        equal(saved.schemaVersion, 4, "correction state uses schema 4");
        equal(saved.inventory.length, 1, "correction does not create a second Inventory record");
        equal(saved.inventory[0].condition, "DAMAGED", "condition correction updates current projection");
        equal(saved.inventory[0].quantity, 2, "condition correction preserves quantity");
        equal(saved.inventoryAdjustments.length, 1, "one append-only correction event is recorded");
        equal(saved.inventoryAdjustments[0].previousState.condition, "SEALED", "original condition remains in history");
        await page.reload({ waitUntil: "networkidle" });
        await page.locator('[data-testid="purchase-receiving-page"]').getByRole("button", { name: "Corrections & Returns", exact: true }).click();
        match(await page.locator('[data-testid="purchase-receiving-page"]').innerText(), /Damaged/i, "refresh replays the canonical correction state");
        equal((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), INVENTORY_KEY)).inventoryAdjustments.length, 1, "refresh does not duplicate the correction");
      }
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `${scenario.label}.png`), fullPage: true });
      await context.close();
    }

    {
      const replacementStates = await syntheticReplacementStates();
      const context = await browser.newContext({ viewport: { width: 430, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
      await seed(context, replacementStates);
      const page = await context.newPage();
      page.on("request", (request) => { const requestUrl = new URL(request.url()); if (!LOOPBACK.has(requestUrl.hostname)) external.push(request.url()); });
      page.on("pageerror", (error) => browserErrors.push(`replacement-workflow: ${error.message}`));
      await page.goto(url(true, "light"), { waitUntil: "networkidle" });
      const root = page.locator('[data-testid="purchase-receiving-page"]');
      await root.getByRole("button", { name: "Corrections & Returns", exact: true }).click();
      await root.getByRole("button", { name: "Record Replacement Receiving", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Record Replacement Receiving" });
      await dialog.getByLabel("Replacement reference").fill("replacement-browser.synthetic.test");
      await dialog.getByRole("button", { name: "Record Replacement Receiving", exact: true }).click();
      await page.getByText(/Replacement Receiving recorded/i).waitFor();
      match(await root.innerText(), /Replacement Cost Reused From Returned Inventory/i, "replacement candidate discloses exact returned-cost reuse");
      const create = root.getByRole("button", { name: "Confirm Inventory Creation", exact: true });
      equal(await create.count(), 1, "replacement requires one separate Inventory creation confirmation");
      await create.click();
      await page.getByText(/Inventory was created once/i).waitFor();
      const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), INVENTORY_KEY);
      equal(saved.inventory.length, 2, "replacement creates a new canonical acquisition lot");
      equal(saved.inventory.reduce((sum, entry) => sum + entry.quantity, 0), 2, "return then replacement restores quantity without duplicate units");
      equal(saved.inventory.reduce((sum, entry) => sum + entry.acquisitionCostMinorUnits, 0), 1001, "replacement cost is transferred exactly without duplication or loss");
      equal(saved.inventoryAdjustments.length, 1, "original return disposition remains append-only");
      equal(saved.inventoryCreationEvents.length, 2, "original and replacement creation histories remain separate");
      await noOverflow(page, "replacement-workflow");
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "replacement-workflow.png"), fullPage: true });
      await context.close();
    }

    const deniedContext = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await seed(deniedContext, states);
    const denied = await deniedContext.newPage();
    await denied.goto(url(false), { waitUntil: "networkidle" });
    match(await denied.locator("body").innerText(), /Sign in|Owner Access Required/i, "query authority spoofing remains denied");
    equal(await denied.locator('[data-testid="purchase-receiving-page"]').count(), 0, "denied browser cannot mount correction UI");
    equal(await denied.evaluate(() => window.__phase2cc.inventoryReads), 0, "denied browser performs no Inventory storage read");
    await deniedContext.close();

    equal(browserErrors.length, 0, `browser errors: ${browserErrors.join(" | ")}`);
    equal(external.length, 0, `external requests: ${external.join(" | ")}`);
    console.log(`Code 3 Inventory Correction browser: 6 scenarios, ${assertions} assertions passed; captures ignored at ${path.relative(process.cwd(), ARTIFACT_DIR).replaceAll("\\", "/")}.`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
