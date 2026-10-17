const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("@playwright/test");

const BASE_URL = new URL(process.env.APP_URL || "http://127.0.0.1:5200/");
const PURCHASE_KEY = "code3.purchase-receiving.v1";
const INVENTORY_KEY = "ember-and-tide.flip-scout.v1";
const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "qa", "code3-phase2cb-inventory-creation", "current");
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
let assertions = 0;
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const match = (value, pattern, message) => { assert.match(value, pattern, message); assertions += 1; };

async function syntheticPurchaseState() {
  const root = path.join(process.cwd(), "src", "features", "purchaseReceiving");
  const [{ createPurchaseReceivingService }, { createMemoryPurchaseReceivingStorage }, fixtures] = await Promise.all([
    import(pathToFileURL(path.join(root, "service.js")).href),
    import(pathToFileURL(path.join(root, "repository.js")).href),
    import(pathToFileURL(path.join(root, "fixtures", "phase2caFixtures.js")).href),
  ]);
  const storage = createMemoryPurchaseReceivingStorage();
  let sequence = 0;
  const service = createPurchaseReceivingService({ storage, isOwnerAuthorized: () => true, idFactory: (prefix) => `${prefix}.phase2cb-browser-${sequence += 1}.test`, now: () => "2026-09-01T14:00:00.000Z" });
  const created = await service.createDraft(fixtures.createFixtureDraftInput({ id: "purchase-draft.phase2cb-browser.test", sourceReference: "source.phase2cb-browser.test", externalOrderId: "ORDER-PHASE2CB-BROWSER.TEST" }));
  const ready = await service.markDraftReady(created.draft.id, created.draft.recordVersion);
  const confirmed = await service.confirmDraft(ready.draft.id, { expectedVersion: ready.draft.recordVersion });
  await service.recordReceivingEvent(confirmed.purchase.id, { idempotencyKey: "receiving.phase2cb-browser.test", entries: [{ lineItemId: confirmed.purchase.lineItems[0].lineItemId, quantityReceived: 1, quantityAffected: 1, condition: "SEALED", discrepancy: "NONE", note: "Synthetic browser-only Receiving." }] });
  return JSON.parse(storage.snapshot()[PURCHASE_KEY]);
}

function url(pathname = "/business/purchases", owner = true, theme = "light") {
  const value = new URL(pathname, BASE_URL);
  if (owner) value.searchParams.set("betaLocalMode", "true");
  else { value.searchParams.set("role", "OWNER"); value.searchParams.set("ownerAuthorized", "true"); }
  value.searchParams.set("themeInspect", theme);
  return value.toString();
}

async function seed(context, purchaseState) {
  await context.addInitScript(({ purchaseKey, inventoryKey, state }) => {
    if (!localStorage.getItem(purchaseKey)) {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(purchaseKey, JSON.stringify(state));
    }
    window.__phase2cb = { inventoryReads: 0 };
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function patchedGetItem(key) {
      if (this === localStorage && key === inventoryKey) window.__phase2cb.inventoryReads += 1;
      return original.call(this, key);
    };
  }, { purchaseKey: PURCHASE_KEY, inventoryKey: INVENTORY_KEY, state: purchaseState });
}

async function noOverflow(page, label) {
  const metrics = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  ok(metrics.scrollWidth - metrics.clientWidth <= 1, `${label} has no horizontal overflow`);
}

(async () => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const purchaseState = await syntheticPurchaseState();
  const browser = await chromium.launch({ headless: true });
  const external = [];
  const browserErrors = [];
  try {
    for (const scenario of [
      { label: "mobile-light", width: 360, height: 800, theme: "light", mutate: true },
      { label: "tablet-dark", width: 768, height: 1024, theme: "dark" },
      { label: "desktop-light", width: 1440, height: 1000, theme: "light" },
    ]) {
      const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height }, colorScheme: scenario.theme, reducedMotion: "reduce" });
      await seed(context, purchaseState);
      const page = await context.newPage();
      page.on("request", (request) => { const requestUrl = new URL(request.url()); if (!LOOPBACK.has(requestUrl.hostname)) external.push(request.url()); });
      page.on("pageerror", (error) => browserErrors.push(`${scenario.label}: ${error.message}`));
      await page.goto(url("/business/purchases", true, scenario.theme), { waitUntil: "networkidle" });
      const root = page.locator('[data-testid="purchase-receiving-page"]');
      await root.waitFor();
      equal(await root.getAttribute("data-owner-gate"), "authorized", `${scenario.label} uses OWNER boundary`);
      equal(await root.getAttribute("data-inventory-writer"), "owner-confirmed-only", `${scenario.label} advertises only explicit creation`);
      const purchasesTab = root.getByRole("button", { name: "Purchases", exact: true });
      await purchasesTab.focus();
      await purchasesTab.press("Enter");
      await root.getByRole("button", { name: "Preview Inventory Handoff", exact: true }).click();
      match(await root.innerText(), /Inventory Creation Candidates[\s\S]*Inventory Creation Candidate != Inventory/i, `${scenario.label} shows the non-authoritative review boundary`);
      const confirm = root.getByRole("button", { name: "Confirm Inventory Creation", exact: true });
      equal(await confirm.count(), 1, `${scenario.label} has one explicit candidate confirmation`);
      equal(await confirm.isDisabled(), false, `${scenario.label} synthetic matched candidate is reviewable`);
      await noOverflow(page, scenario.label);
      equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true, `${scenario.label} honors reduced motion`);
      if (scenario.mutate) {
        await confirm.focus();
        await confirm.press("Enter");
        await page.getByText(/Inventory was created once/i).waitFor();
        const state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), INVENTORY_KEY);
        equal(state.schemaVersion, 5, "canonical local Business Inventory uses schema v5");
        equal(state.inventory.length, 1, "one Inventory record is created");
        equal(state.inventoryLots.length, 1, "one acquisition lot is created");
        equal(state.inventoryCreationApplications.length, 1, "one idempotency application is created");
        equal(state.inventoryCreationEvents.length, 1, "one append-only creation event is created");
        equal(state.inventory[0].provenanceManaged, true, "created Inventory is provenance managed");
        equal(state.inventory[0].acquisitionCostMinorUnits, 4740, "exact minor-unit cost is canonical");
        equal(state.inventory[0].allocatedItemCost, undefined, "no floating-point cost is persisted");
        equal(state.inventory[0].quantity, 1, "only physically received quantity is created");
        await page.reload({ waitUntil: "networkidle" });
        const refreshed = page.locator('[data-testid="purchase-receiving-page"]');
        await refreshed.getByRole("button", { name: "Purchases", exact: true }).click();
        await refreshed.getByRole("button", { name: "Preview Inventory Handoff", exact: true }).click();
        match(await refreshed.innerText(), /Inventory created/i, "refresh re-derives an already-confirmed candidate");
        equal(await refreshed.getByRole("button", { name: "Confirm Inventory Creation", exact: true }).count(), 0, "refresh cannot duplicate the Inventory confirmation");
        equal((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), INVENTORY_KEY)).inventory.length, 1, "refresh leaves exactly one Inventory record");
      }
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `${scenario.label}.png`), fullPage: true });
      await context.close();
    }

    const deniedContext = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await seed(deniedContext, purchaseState);
    const denied = await deniedContext.newPage();
    await denied.goto(url("/business/purchases", false, "light"), { waitUntil: "networkidle" });
    match(await denied.locator("body").innerText(), /Sign in|Owner Access Required/i, "query role spoofing cannot establish OWNER authority");
    equal(await denied.locator('[data-testid="purchase-receiving-page"]').count(), 0, "denied browser cannot mount the authorized Inventory workflow");
    equal(await denied.evaluate(() => window.__phase2cb.inventoryReads), 0, "denied browser performs no Inventory storage read");
    await deniedContext.close();

    equal(browserErrors.length, 0, `browser errors: ${browserErrors.join(" | ")}`);
    equal(external.length, 0, `external requests: ${external.join(" | ")}`);
    console.log(`Code 3 Inventory Creation browser: 4 scenarios, ${assertions} assertions passed; captures ignored at ${path.relative(process.cwd(), ARTIFACT_DIR).replaceAll("\\", "/")}.`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
