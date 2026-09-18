const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("@playwright/test");

const BASE_URL = new URL(process.env.APP_URL || "http://127.0.0.1:5200/");
const PURCHASE_KEY = "code3.purchase-receiving.v1";
const INVENTORY_KEY = "ember-and-tide.flip-scout.v1";
const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "qa", "code3-phase2ce-accountant-review", "current");
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
let assertions = 0;
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const notEqual = (actual, expected, message) => { assert.notEqual(actual, expected, message); assertions += 1; };
const match = (value, pattern, message) => { assert.match(value, pattern, message); assertions += 1; };
const excludes = (value, pattern, message) => { assert.doesNotMatch(value, pattern, message); assertions += 1; };

async function syntheticStates() {
  const helper = await import(pathToFileURL(path.join(process.cwd(), "scripts", "inventory-reconciliation-test-helpers.mjs")).href);
  let clock = "2026-01-01T14:00:00.000Z";
  const harness = await helper.createSoldManagedInventory({
    id: "phase2ce-browser",
    quantity: 3,
    totalMinorUnits: 1000,
    now: () => clock,
    sales: [{
      id: "sale.phase2ce-browser-prior.test",
      quantity: 1,
      saleDate: "2025-12-31",
      grossSalePrice: 20,
      netProceeds: 20,
    }, {
      id: "sale.phase2ce-browser-current.test",
      quantity: 1,
      saleDate: "2026-08-15",
      grossSalePrice: 25,
      netProceeds: 25,
    }],
  });
  clock = "2026-01-02T14:00:00.000Z";
  await helper.confirmReconciliation(
    harness.service,
    harness.inventoryItem,
    helper.costProposal("phase2ce-browser", 1300),
  );
  return {
    purchase: JSON.parse(harness.purchaseStorage.values.get(PURCHASE_KEY)),
    inventory: JSON.parse(harness.inventoryStorage.values.get(INVENTORY_KEY)),
  };
}

function url(owner = true, theme = "light") {
  const value = new URL("/business/purchases", BASE_URL);
  if (owner) value.searchParams.set("betaLocalMode", "true");
  else {
    value.searchParams.set("role", "OWNER");
    value.searchParams.set("ownerAuthorized", "true");
    value.searchParams.set("isOwner", "true");
  }
  value.searchParams.set("themeInspect", theme);
  return value.toString();
}

async function seed(context, states) {
  await context.addInitScript(({ purchaseKey, inventoryKey, seeded }) => {
    if (!localStorage.getItem(purchaseKey)) localStorage.setItem(purchaseKey, JSON.stringify(seeded.purchase));
    if (!localStorage.getItem(inventoryKey)) localStorage.setItem(inventoryKey, JSON.stringify(seeded.inventory));
    window.__phase2ce = {
      purchaseReads: 0,
      purchaseWrites: 0,
      purchaseRemoves: 0,
      inventoryReads: 0,
      inventoryWrites: 0,
      inventoryRemoves: 0,
      clears: 0,
    };
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    const originalRemove = Storage.prototype.removeItem;
    const originalClear = Storage.prototype.clear;
    Storage.prototype.getItem = function patchedGetItem(key) {
      if (this === localStorage && key === purchaseKey) window.__phase2ce.purchaseReads += 1;
      if (this === localStorage && key === inventoryKey) window.__phase2ce.inventoryReads += 1;
      return originalGet.call(this, key);
    };
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      if (this === localStorage && key === purchaseKey) window.__phase2ce.purchaseWrites += 1;
      if (this === localStorage && key === inventoryKey) window.__phase2ce.inventoryWrites += 1;
      return originalSet.call(this, key, value);
    };
    Storage.prototype.removeItem = function patchedRemoveItem(key) {
      if (this === localStorage && key === purchaseKey) window.__phase2ce.purchaseRemoves += 1;
      if (this === localStorage && key === inventoryKey) window.__phase2ce.inventoryRemoves += 1;
      return originalRemove.call(this, key);
    };
    Storage.prototype.clear = function patchedClear() {
      if (this === localStorage) window.__phase2ce.clears += 1;
      return originalClear.call(this);
    };
  }, { purchaseKey: PURCHASE_KEY, inventoryKey: INVENTORY_KEY, seeded: states });
}

function observe(page, label, externalRequests, browserErrors) {
  page.on("request", (request) => {
    try {
      const requestUrl = new URL(request.url());
      if (["http:", "https:"].includes(requestUrl.protocol) && !LOOPBACK.has(requestUrl.hostname)) externalRequests.push(`${label}: ${request.url()}`);
    } catch {
      externalRequests.push(`${label}: ${request.url()}`);
    }
  });
  page.on("pageerror", (error) => browserErrors.push(`${label} page: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`${label} console: ${message.text()}`);
  });
}

async function canonicalSnapshot(page) {
  return page.evaluate(({ purchaseKey, inventoryKey }) => ({
    purchase: localStorage.getItem(purchaseKey),
    inventory: localStorage.getItem(inventoryKey),
    counters: { ...window.__phase2ce },
    reviewKeys: Object.keys(localStorage).filter((key) => /accountant.?review/i.test(key)),
  }), { purchaseKey: PURCHASE_KEY, inventoryKey: INVENTORY_KEY });
}

async function noOverflow(page, locator, label) {
  const documentMetrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  ok(documentMetrics.scrollWidth - documentMetrics.clientWidth <= 1, `${label} has no document-level horizontal overflow`);
  const elementMetrics = await locator.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  ok(elementMetrics.scrollWidth - elementMetrics.clientWidth <= 1, `${label} has no Accountant Review horizontal overflow`);
}

async function metricValue(review, label) {
  return review.locator(".accountant-review-summary .ops-metric-card")
    .filter({ hasText: label })
    .locator("strong")
    .first()
    .innerText();
}

async function openReview(page, { keyboard = false } = {}) {
  const root = page.locator('[data-testid="purchase-receiving-page"]');
  const tab = root.getByRole("button", { name: "Accountant Review", exact: true });
  if (keyboard) {
    await tab.focus();
    equal(await tab.evaluate((element) => document.activeElement === element), true, "Accountant Review tab receives keyboard focus");
    await page.keyboard.press("Enter");
  } else {
    await tab.click();
  }
  const review = root.locator('[data-accountant-review="read-only"]');
  await review.waitFor();
  return { root, review };
}

async function accessibilityChecks(review, label) {
  const audit = await review.evaluate((root) => {
    const controls = [...root.querySelectorAll("button, select, input, textarea, a[href]")];
    const unlabeled = controls.filter((control) => {
      const text = (control.textContent || "").trim();
      const labelled = control.getAttribute("aria-label") || control.getAttribute("aria-labelledby") || control.labels?.length;
      return !text && !labelled;
    }).map((control) => control.outerHTML.slice(0, 160));
    const undersized = controls.filter((control) => {
      const box = control.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && (box.height < 43.5 || box.width < 43.5);
    }).map((control) => ({ tag: control.tagName, text: (control.textContent || "").trim(), width: control.getBoundingClientRect().width, height: control.getBoundingClientRect().height }));
    const ids = [...root.querySelectorAll("[id]")].map((element) => element.id);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    const imagesMissingAlt = [...root.querySelectorAll("img:not([alt])")].length;
    return { unlabeled, undersized, duplicateIds, imagesMissingAlt, selectCount: root.querySelectorAll("select").length };
  });
  equal(audit.unlabeled.length, 0, `${label} has no unlabeled interactive controls: ${JSON.stringify(audit.unlabeled)}`);
  equal(audit.undersized.length, 0, `${label} interactive controls meet the 44px target: ${JSON.stringify(audit.undersized)}`);
  equal(audit.duplicateIds.length, 0, `${label} has no duplicate IDs`);
  equal(audit.imagesMissingAlt, 0, `${label} has no images missing alt text`);
  equal(audit.selectCount, 8, `${label} exposes all eight review filters as labeled selects`);
}

(async () => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const states = await syntheticStates();
  const browser = await chromium.launch({ headless: true });
  const externalRequests = [];
  const browserErrors = [];
  try {
    const scenarios = [
      { label: "mobile-light", width: 360, height: 800, theme: "light", exerciseFilters: true, keyboard: true },
      { label: "phone-dark", width: 430, height: 900, theme: "dark" },
      { label: "tablet-light", width: 768, height: 1024, theme: "light" },
      { label: "desktop-dark", width: 1440, height: 1000, theme: "dark" },
    ];

    for (const scenario of scenarios) {
      const context = await browser.newContext({
        viewport: { width: scenario.width, height: scenario.height },
        colorScheme: scenario.theme,
        reducedMotion: "reduce",
      });
      await seed(context, states);
      const page = await context.newPage();
      observe(page, scenario.label, externalRequests, browserErrors);
      await page.goto(url(true, scenario.theme), { waitUntil: "networkidle" });
      const canonicalBefore = await canonicalSnapshot(page);
      const { root, review } = await openReview(page, { keyboard: scenario.keyboard });

      equal(await root.getAttribute("data-owner-gate"), "authorized", `${scenario.label} remains behind the verified OWNER gate`);
      equal(await review.getAttribute("data-accounting-mutation"), "false", `${scenario.label} is explicitly non-mutating`);
      equal(await review.getAttribute("data-filing-status"), "FILING_STATUS_UNKNOWN", `${scenario.label} does not infer filed-tax status`);
      equal(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), scenario.theme, `${scenario.label} renders the requested ${scenario.theme} theme`);
      equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true, `${scenario.label} honors reduced-motion preference`);

      const body = await review.innerText();
      match(body, /Read-only accounting review/i, `${scenario.label} labels the workflow read only`);
      match(body, /Original Transaction Period != Correction Period/i, `${scenario.label} distinguishes historical and correction periods`);
      match(body, /Original COGS != Reconciliation Adjustment/i, `${scenario.label} distinguishes original COGS from the append-only delta`);
      match(body, /Historical Record != Current Effective Projection/i, `${scenario.label} distinguishes recorded history from current projection`);
      match(body, /Accountant Review != Accounting Mutation/i, `${scenario.label} preserves the non-mutation invariant`);
      match(body, /Original COGS[\s\S]*COGS adjustment[\s\S]*Effective COGS/i, `${scenario.label} presents original, adjustment, and effective COGS separately`);
      match(body, /prior reporting period and may warrant accountant review/i, `${scenario.label} uses cautious prior-period wording`);
      match(body, /Filing status unknown/i, `${scenario.label} displays unknown filing status`);
      match(body, /historical Sale remains unchanged/i, `${scenario.label} explains Sale immutability`);
      match(body, /Current projection including later corrections/i, `${scenario.label} labels period totals as current projections`);
      match(body, /not tax or legal conclusions|does not infer filing status or provide tax treatment/i, `${scenario.label} avoids tax or legal conclusions`);
      excludes(body, /\b(?:must amend|tax violation|IRS requires|mark deductible)\b/i, `${scenario.label} makes no unsupported tax claim`);

      const buttons = (await review.getByRole("button").allTextContents()).map((value) => value.trim()).filter(Boolean);
      equal(buttons.every((value) => /^Clear Filters$/i.test(value)), true, `${scenario.label} exposes no accounting mutation, export, or note button: ${buttons.join(" | ")}`);
      equal(await review.locator('input, textarea, [contenteditable="true"]').count(), 0, `${scenario.label} exposes no mutable note or accounting-entry input`);
      equal(await review.locator('a[download], input[type="file"]').count(), 0, `${scenario.label} exposes no export/upload control`);
      equal(await review.getByRole("button", { name: /Post|Journal|Book|Amend|File Return|Sync|Export|Save|Confirm|Apply|Create/i }).count(), 0, `${scenario.label} exposes no canonical accounting action`);

      const firstSelect = review.getByRole("combobox").first();
      await firstSelect.focus();
      equal(await firstSelect.evaluate((element) => document.activeElement === element), true, `${scenario.label} filter controls are keyboard focusable`);
      await accessibilityChecks(review, scenario.label);
      await noOverflow(page, review, scenario.label);

      const canonicalAfterReview = await canonicalSnapshot(page);
      equal(canonicalAfterReview.purchase, canonicalBefore.purchase, `${scenario.label} leaves Purchase storage byte-equivalent`);
      equal(canonicalAfterReview.inventory, canonicalBefore.inventory, `${scenario.label} leaves Inventory storage byte-equivalent`);
      equal(canonicalAfterReview.counters.purchaseWrites, canonicalBefore.counters.purchaseWrites, `${scenario.label} performs zero Purchase writes`);
      equal(canonicalAfterReview.counters.inventoryWrites, canonicalBefore.counters.inventoryWrites, `${scenario.label} performs zero Inventory writes`);
      equal(canonicalAfterReview.counters.purchaseRemoves, canonicalBefore.counters.purchaseRemoves, `${scenario.label} performs zero Purchase removals`);
      equal(canonicalAfterReview.counters.inventoryRemoves, canonicalBefore.counters.inventoryRemoves, `${scenario.label} performs zero Inventory removals`);
      equal(canonicalAfterReview.counters.clears, canonicalBefore.counters.clears, `${scenario.label} performs no localStorage clear`);
      equal(canonicalAfterReview.reviewKeys.length, 0, `${scenario.label} persists no Accountant Review key`);

      if (scenario.exerciseFilters) {
        equal(await metricValue(review, "Sales affected"), "2", "the unfiltered summary counts both affected Sales exactly once");
        const unfilteredCogsAdjustment = await metricValue(review, "Net COGS adjustment");
        const saleFilter = review.locator("select").nth(5);
        await saleFilter.selectOption("sale.phase2ce-browser-prior.test");
        equal(await saleFilter.inputValue(), "sale.phase2ce-browser-prior.test", "the owner can filter the ephemeral projection to one Sale");
        match(await review.innerText(), /1 review item shown/i, "the in-memory Sale filter keeps only its matching review item visible");
        equal(await metricValue(review, "Sales affected"), "1", "the filtered summary recomputes its affected-Sale count");
        notEqual(await metricValue(review, "Net COGS adjustment"), unfilteredCogsAdjustment, "the filtered COGS summary is recomputed from visible event deltas rather than the whole preview");
        equal(await review.locator('section[aria-label="Reporting period summaries"]').count(), 0, "whole-period summary cards are hidden while record filters are active");
        const filteredStorage = await canonicalSnapshot(page);
        equal(filteredStorage.purchase, canonicalBefore.purchase, "filtering leaves Purchase bytes unchanged");
        equal(filteredStorage.inventory, canonicalBefore.inventory, "filtering leaves Inventory bytes unchanged");
        equal(filteredStorage.counters.purchaseWrites, canonicalBefore.counters.purchaseWrites, "filtering performs zero Purchase writes");
        equal(filteredStorage.counters.inventoryWrites, canonicalBefore.counters.inventoryWrites, "filtering performs zero Inventory writes");
        equal(filteredStorage.reviewKeys.length, 0, "filtering creates no persistent review-preference key");

        await page.reload({ waitUntil: "networkidle" });
        const reopened = await openReview(page, { keyboard: true });
        equal(await reopened.review.locator("select").nth(5).inputValue(), "", "refresh discards the ephemeral Accountant Review Sale filter");
        const refreshedStorage = await canonicalSnapshot(page);
        equal(refreshedStorage.purchase, canonicalBefore.purchase, "refresh and regeneration preserve Purchase bytes");
        equal(refreshedStorage.inventory, canonicalBefore.inventory, "refresh and regeneration preserve Inventory bytes");
        equal(refreshedStorage.reviewKeys.length, 0, "refresh does not restore Accountant Review from persistence");
      }

      await page.screenshot({ path: path.join(ARTIFACT_DIR, `${scenario.label}.png`), fullPage: true });
      await context.close();
    }

    const deniedContext = await browser.newContext({ viewport: { width: 360, height: 800 }, reducedMotion: "reduce" });
    await seed(deniedContext, states);
    const deniedPage = await deniedContext.newPage();
    observe(deniedPage, "query-role-spoof-denied", externalRequests, browserErrors);
    await deniedPage.goto(url(false, "light"), { waitUntil: "networkidle" });
    match(await deniedPage.locator("body").innerText(), /Sign in|Owner Access Required|Owner access unavailable/i, "query-role spoofing cannot bypass OWNER authorization");
    equal(await deniedPage.locator('[data-testid="purchase-receiving-page"]').count(), 0, "the denied browser cannot mount the Purchase/Accountant Review workspace");
    equal(await deniedPage.locator('[data-accountant-review="read-only"]').count(), 0, "the denied browser cannot render accounting review data");
    const deniedCounters = await deniedPage.evaluate(() => ({ ...window.__phase2ce }));
    equal(deniedCounters.purchaseReads, 0, "OWNER denial occurs before Purchase storage access");
    equal(deniedCounters.inventoryReads, 0, "OWNER denial occurs before Inventory storage access");
    equal(deniedCounters.purchaseWrites + deniedCounters.inventoryWrites, 0, "OWNER denial performs no canonical writes");
    await deniedContext.close();

    equal(browserErrors.length, 0, `browser errors: ${browserErrors.join(" | ")}`);
    equal(externalRequests.length, 0, `external requests: ${externalRequests.join(" | ")}`);
    console.log(`Code 3 Accountant Review browser: 5 scenarios, ${assertions} assertions passed; captures ignored at ${path.relative(process.cwd(), ARTIFACT_DIR).replaceAll("\\", "/")}.`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
