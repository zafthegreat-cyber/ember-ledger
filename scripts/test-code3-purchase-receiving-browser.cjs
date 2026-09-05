const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("@playwright/test");

const APP_BASE_URL = new URL(process.env.APP_URL || "http://127.0.0.1:5200/");
const STORAGE_KEY = "code3.purchase-receiving.v1";
const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "qa", "code3-phase2ca-purchase-receiving", "current");
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const FIXED_NOW = "2026-08-31T16:00:00.000Z";

let assertions = 0;
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function match(value, pattern, message) { assert.match(value, pattern, message); assertions += 1; }
function excludes(value, pattern, message) { assert.doesNotMatch(value, pattern, message); assertions += 1; }

function appUrl(theme, owner = true) {
  const url = new URL("/business/purchases", APP_BASE_URL);
  if (owner) url.searchParams.set("betaLocalMode", "true");
  url.searchParams.set("themeInspect", theme);
  url.searchParams.set("phase2cQa", "true");
  if (!owner) {
    url.searchParams.set("role", "OWNER");
    url.searchParams.set("owner", "true");
    url.searchParams.set("ownerAuthorized", "true");
  }
  return url.toString();
}

function safePart(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function relativeArtifact(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll("\\", "/");
}

async function loadDomain() {
  const featureRoot = path.join(process.cwd(), "src", "features", "purchaseReceiving");
  const [{ createPurchaseReceivingService }, { createMemoryPurchaseReceivingStorage }, fixtures] = await Promise.all([
    import(pathToFileURL(path.join(featureRoot, "service.js")).href),
    import(pathToFileURL(path.join(featureRoot, "repository.js")).href),
    import(pathToFileURL(path.join(featureRoot, "fixtures", "phase2caFixtures.js")).href),
  ]);
  return {
    createPurchaseReceivingService,
    createMemoryPurchaseReceivingStorage,
    createFixtureDraftInput: fixtures.createFixtureDraftInput,
    createFixtureLineItem: fixtures.createFixtureLineItem,
  };
}

function readStoredState(storage) {
  const raw = storage.snapshot()[STORAGE_KEY];
  if (!raw) throw new Error("Synthetic Purchase/Receiving state was not persisted by the domain service.");
  return JSON.parse(raw);
}

function scenarioIdFactory(label) {
  let sequence = 0;
  return (prefix) => `${prefix}.${label}.${String(sequence += 1).padStart(3, "0")}.test`;
}

async function buildState(domain, kind) {
  const storage = domain.createMemoryPurchaseReceivingStorage();
  const idFactory = scenarioIdFactory(kind);
  const service = domain.createPurchaseReceivingService({
    storage,
    now: () => FIXED_NOW,
    idFactory,
    isOwnerAuthorized: () => true,
  });
  const money = (minorUnits, currency = "USD") => ({ minorUnits, currency });
  const baseLine = domain.createFixtureLineItem({
    id: `purchase-line.${kind}.test`,
    lineItemId: `purchase-line.${kind}.test`,
    title: `Synthetic ${kind.replaceAll("-", " ")} TCG product`,
    sku: `SKU-${kind.toUpperCase()}.TEST`,
    retailerItemId: `retailer-item.${kind}.test`,
  });
  const quantity = kind === "partial-receiving" ? 2 : 1;
  const lineItem = {
    ...baseLine,
    quantityOrdered: quantity,
    unitPrice: money(4000),
    lineAmount: money(4000 * quantity),
    taxAllocation: money(240 * quantity),
    shippingAllocation: money(500),
    cancellationQuantity: 0,
    refundedQuantity: 0,
    receivedQuantity: 0,
    remainingQuantity: quantity,
  };
  const draftInput = domain.createFixtureDraftInput({
    id: `purchase-draft.${kind}.test`,
    sourceReference: `source.${kind}.test:v1`,
    sourceIdentityKey: `source-identity.${kind}.test`,
    retailerId: `retailer.synthetic-${kind}.test`,
    retailerLabel: kind === "corrected-draft" ? "Synthetic Original Retailer" : "Synthetic Target",
    externalOrderId: `ORDER-${kind.toUpperCase()}.TEST`,
    lineItems: [lineItem],
    subtotal: money(4000 * quantity),
    discount: money(0),
    tax: money(240 * quantity),
    shipping: money(500),
    fees: money(0),
    total: money((4240 * quantity) + 500),
  });
  const created = await service.createDraft(draftInput);

  if (kind === "corrected-draft") {
    await service.correctDraft(created.draft.id, {
      patch: { retailerLabel: "Synthetic Corrected Retailer" },
      reason: "Synthetic owner correction for browser QA.",
    }, created.draft.recordVersion);
    return readStoredState(storage);
  }
  if (kind === "rejected-draft") {
    await service.rejectDraft(created.draft.id, "Synthetic owner rejection for browser QA.", created.draft.recordVersion);
    return readStoredState(storage);
  }
  if (kind === "populated-draft") return readStoredState(storage);

  const readied = await service.markDraftReady(created.draft.id, created.draft.recordVersion);
  const confirmed = await service.confirmDraft(created.draft.id, { expectedVersion: readied.draft.recordVersion });
  if (["confirmed-draft", "purchase-desktop", "receiving-dialog-damaged", "receiving-dialog-missing", "receiving-dialog-wrong-item"].includes(kind)) {
    return readStoredState(storage);
  }

  const lineItemId = confirmed.purchase.lineItems[0].lineItemId;
  const quantityReceived = kind === "partial-receiving" ? 1 : confirmed.purchase.lineItems[0].quantityOrdered;
  await service.recordReceivingEvent(confirmed.purchase.id, {
    idempotencyKey: `receiving.${kind}.test`,
    occurredAt: FIXED_NOW,
    locationReference: "storage.synthetic-browser-qa.test",
    entries: [{
      lineItemId,
      quantityReceived,
      quantityAffected: quantityReceived,
      condition: "NEW",
      discrepancy: "NONE",
      note: "Synthetic browser QA receiving only.",
    }],
  });
  return readStoredState(storage);
}

async function buildScenarioStates() {
  const domain = await loadDomain();
  const kinds = [
    "populated-draft",
    "corrected-draft",
    "rejected-draft",
    "confirmed-draft",
    "purchase-desktop",
    "partial-receiving",
    "full-receiving",
    "receiving-dialog-damaged",
    "receiving-dialog-missing",
    "receiving-dialog-wrong-item",
    "inventory-handoff-preview",
  ];
  return new Map(await Promise.all(kinds.map(async (kind) => [kind, await buildState(domain, kind)])));
}

async function seedContext(context, state, { owner = true } = {}) {
  await context.addInitScript(({ storageKey, fixtureState, authorized }) => {
    localStorage.clear();
    sessionStorage.clear();
    window.__phase2caBrowserQa = { purchaseReceivingReads: 0 };
    if (fixtureState) localStorage.setItem(storageKey, JSON.stringify(fixtureState));
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function getItem(key) {
      if (this === localStorage && key === storageKey) window.__phase2caBrowserQa.purchaseReceivingReads += 1;
      return originalGetItem.call(this, key);
    };
    Object.defineProperty(window, "open", { configurable: true, value: () => null });
    Object.defineProperty(window, "__phase2caExpectedOwner", { configurable: false, value: authorized });
  }, { storageKey: STORAGE_KEY, fixtureState: state, authorized: owner });
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  ok(metrics.scrollWidth - metrics.clientWidth <= 1, `${label} should have zero horizontal overflow (${metrics.scrollWidth - metrics.clientWidth}px)`);
  return metrics;
}

async function assertMinimumTargets(root, label) {
  const targets = await root.locator("button:visible, a:visible, input:visible, select:visible, textarea:visible, summary:visible").evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return {
      label: node.getAttribute("aria-label") || node.textContent?.trim() || node.getAttribute("name") || node.tagName,
      width: Math.round(box.width * 100) / 100,
      height: Math.round(box.height * 100) / 100,
    };
  }));
  ok(targets.length > 0, `${label} should expose interactive controls`);
  const undersized = targets.filter(({ width, height }) => width < 44 || height < 44);
  equal(undersized.length, 0, `${label} controls should be at least 44px: ${JSON.stringify(undersized)}`);
}

async function assertSafetySurface(page, root, label) {
  const body = await root.innerText();
  equal(await root.getAttribute("data-owner-gate"), "authorized", `${label} should use the existing authorized OWNER boundary`);
  equal(await root.getAttribute("data-inventory-writer"), "owner-confirmed-only", `${label} must expose only the explicit owner-confirmed inventory boundary`);
  match(body, /Order Candidate != Purchase/i, `${label} should preserve the Order Candidate boundary`);
  match(body, /Checkout Evidence != Purchase/i, `${label} should preserve the Checkout Evidence boundary`);
  match(body, /Purchase Draft != Purchase/i, `${label} should preserve the draft boundary`);
  match(body, /Receiving != Inventory/i, `${label} should preserve the inventory boundary`);
  excludes(body, /(?:automatically create inventory|import purchase|auto(?:matic)? checkout|place order|pay now)/i, `${label} must not offer automatic downstream mutation or checkout actions`);
  excludes(body, /synthetic-secret-must-not-render|(?:bearer|basic)\s+[a-z0-9._~+/=-]{12,}/i, `${label} must not render secret material`);
  equal(await root.locator('[data-inventory-writer="true"], [data-remote-active="true"]').count(), 0, `${label} must not expose automatic or remote inventory mutation authority`);
  equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true, `${label} should honor the reduced-motion browser preference`);
}

async function selectSection(root, section) {
  const button = root.getByRole("button", { name: section, exact: true });
  await button.focus();
  equal(await button.evaluate((node) => document.activeElement === node), true, `${section} section control should receive keyboard focus`);
  await button.press("Enter");
  equal(await button.getAttribute("aria-current"), "page", `${section} should become the active workflow section`);
}

async function prepareScenario(page, scenario, root) {
  const body = () => root.innerText();
  switch (scenario.kind) {
    case "empty":
      match(await body(), /No Purchase Drafts/i, "empty state should disclose that no draft exists");
      match(await body(), /Drafts\s*0[\s\S]*Purchases\s*0[\s\S]*Awaiting receipt\s*0[\s\S]*Receiving events\s*0/i, "empty summary should remain zero throughout the workflow");
      break;
    case "populated-draft":
      match(await body(), /Synthetic Target[\s\S]*ORDER-POPULATED-DRAFT\.TEST/i, "populated synthetic draft should render its bounded order metadata");
      match(await body(), /Confirm Purchase/i, "explicit confirmation should be available only on the owner-reviewed draft surface");
      await root.getByRole("button", { name: "Correct", exact: true }).focus();
      await page.keyboard.press("Enter");
      await page.getByRole("dialog").waitFor();
      match(await page.getByRole("dialog").innerText(), /Correct Purchase Draft[\s\S]*Corrections append provenance/i, "keyboard correction should open the append-only review dialog");
      break;
    case "corrected-draft":
      match(await body(), /Synthetic Corrected Retailer[\s\S]*Needs Review/i, "corrected draft should retain an explicit review state");
      break;
    case "rejected-draft":
      match(await body(), /Synthetic Target[\s\S]*Rejected/i, "rejected draft should remain visible without creating a Purchase");
      equal(await root.getByRole("button", { name: "Confirm Purchase", exact: true }).isDisabled(), true, "rejected draft cannot be confirmed");
      break;
    case "confirmed-draft":
      match(await body(), /Synthetic Target[\s\S]*Confirmed/i, "confirmed source draft should preserve its terminal review state");
      await selectSection(root, "Purchases");
      match(await body(), /Owner-confirmed Purchase[\s\S]*Not Received/i, "explicit confirmation should create one Purchase that remains unreceived");
      break;
    case "purchase-desktop":
      await selectSection(root, "Purchases");
      match(await body(), /Confirmed Purchases[\s\S]*Owner-confirmed Purchase[\s\S]*Not Received/i, "desktop Purchase view should disclose receipt remains separate");
      break;
    case "partial-receiving":
      await selectSection(root, "Receiving");
      match(await body(), /Partially Received[\s\S]*1 remaining/i, "partial receiving should preserve the outstanding quantity");
      break;
    case "full-receiving":
      await selectSection(root, "Purchases");
      match(await body(), /Fully Received[\s\S]*0 remaining/i, "full receiving should be derived only after all accountable units are confirmed");
      break;
    case "receiving-dialog-damaged":
    case "receiving-dialog-missing":
    case "receiving-dialog-wrong-item": {
      await selectSection(root, "Receiving");
      await root.getByRole("button", { name: "Receive Items", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      const option = {
        "receiving-dialog-damaged": "DAMAGED_ITEM",
        "receiving-dialog-missing": "MISSING_ITEM",
        "receiving-dialog-wrong-item": "WRONG_ITEM",
      }[scenario.kind];
      await dialog.getByLabel("Discrepancy").selectOption(option);
      match(await dialog.innerText(), new RegExp(option.replaceAll("_", " "), "i"), `${scenario.kind} should expose the selected discrepancy without changing source Purchase evidence`);
      match(await dialog.innerText(), /Delivery evidence alone does not prove receipt/i, `${scenario.kind} should preserve physical receipt confirmation`);
      break;
    }
    case "inventory-handoff-preview":
      await selectSection(root, "Purchases");
      await root.getByRole("button", { name: "Preview Inventory Handoff", exact: true }).click();
      await root.getByRole("heading", { name: "Inventory Handoff Preview", exact: true }).waitFor();
      match(await body(), /Preview only[\s\S]*separate candidate[\s\S]*Receiving != Inventory/i, "handoff remains a derived preview before separate candidate confirmation");
      equal(await root.locator('.purchase-receiving-handoff[data-inventory-writer="owner-confirmed-only"]').count(), 1, "handoff exposes only the owner-confirmed candidate writer");
      break;
    default:
      throw new Error(`Unknown browser QA scenario kind: ${scenario.kind}`);
  }
}

async function inspectAuthorizedScenario(browser, scenario) {
  const context = await browser.newContext({
    viewport: scenario.viewport,
    colorScheme: scenario.theme,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await seedContext(context, scenario.state, { owner: true });
  const externalRequests = [];
  await context.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (["http:", "https:"].includes(requestUrl.protocol) && requestUrl.origin !== APP_BASE_URL.origin) {
      externalRequests.push(`${route.request().method()} ${requestUrl.origin}${requestUrl.pathname}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(45000);
  const consoleMessages = [];
  page.setDefaultTimeout(25000);
  page.setDefaultNavigationTimeout(45000);
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    consoleMessages.push(`${message.type()}: ${message.text()}`);
    if (message.type() !== "error") return;
    const text = message.text();
    const sourceUrl = message.location()?.url || "";
    if (/favicon|ResizeObserver/i.test(text) || /\/api\/ebay\/health(?:\?|$)/i.test(sourceUrl)) return;
    browserErrors.push(`console: ${text}${sourceUrl ? ` (${sourceUrl})` : ""}`);
  });
  page.on("dialog", (dialog) => dialog.dismiss());
  page.on("popup", (popup) => popup.close().catch(() => {}));
  try {
    await page.goto(appUrl(scenario.theme, true), { waitUntil: "domcontentloaded" });
    const root = page.getByTestId("purchase-receiving-page");
    await root.waitFor();
    await page.getByRole("heading", { name: "Purchases & Receiving", exact: true }).waitFor();
    equal(new URL(page.url()).pathname, "/business/purchases", `${scenario.id} should preserve the canonical Purchase/Receiving route`);
    equal(await page.locator("html").getAttribute("data-theme"), scenario.theme, `${scenario.id} should render the requested ${scenario.theme} theme`);
    await assertSafetySurface(page, root, scenario.id);
    await prepareScenario(page, scenario, root);
    await assertMinimumTargets(root, scenario.id);
    const metrics = await assertNoHorizontalOverflow(page, `${scenario.id} at ${scenario.viewport.width}px`);
    equal(externalRequests.length, 0, `${scenario.id} must make no external request: ${externalRequests.join("\n")}`);
    equal(await page.locator("vite-error-overlay").count(), 0, `${scenario.id} should not show a Vite error overlay`);
    equal(browserErrors.length, 0, browserErrors.join("\n"));
    excludes(consoleMessages.join("\n"), /"?(?:password|accessToken|refreshToken|authorization|cookie|cvv|cardNumber)"?\s*[:=]/i, `${scenario.id} must not log credential-bearing data`);
    const persisted = await page.evaluate((key) => localStorage.getItem(key) || "", STORAGE_KEY);
    excludes(persisted, /"?(?:password|accessToken|refreshToken|authorization|cookie|cvv|cardNumber)"?\s*[:=]/i, `${scenario.id} fixture persistence must contain no prohibited credential field`);
    const screenshotPath = path.join(ARTIFACT_DIR, `${scenario.viewport.width}x${scenario.viewport.height}-${scenario.theme}-${safePart(scenario.id)}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return {
      id: scenario.id,
      kind: scenario.kind,
      route: "/business/purchases",
      ownerAuthorized: true,
      viewport: scenario.viewport,
      theme: scenario.theme,
      screenshot: relativeArtifact(screenshotPath),
      pageHeight: metrics.scrollHeight,
      horizontalOverflow: metrics.scrollWidth - metrics.clientWidth,
      externalRequestCount: 0,
      browserErrors: [],
    };
  } finally {
    await context.close();
  }
}

async function inspectOwnerGate(browser, state) {
  const scenario = { id: "owner-gate-query-spoof", kind: "owner-gate", viewport: { width: 360, height: 800 }, theme: "light" };
  const context = await browser.newContext({ viewport: scenario.viewport, colorScheme: scenario.theme, reducedMotion: "reduce", serviceWorkers: "block" });
  await seedContext(context, state, { owner: false });
  const externalRequests = [];
  await context.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (["http:", "https:"].includes(requestUrl.protocol) && requestUrl.origin !== APP_BASE_URL.origin) {
      externalRequests.push(`${route.request().method()} ${requestUrl.origin}${requestUrl.pathname}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const sourceUrl = message.location()?.url || "";
    if (/favicon|ResizeObserver/i.test(message.text()) || /\/api\/ebay\/health(?:\?|$)/i.test(sourceUrl)) return;
    browserErrors.push(`console: ${message.text()}`);
  });
  try {
    await page.goto(appUrl(scenario.theme, false), { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(750);
    const body = await page.locator("body").innerText();
    match(body, /Sign in to review|Welcome back|Sign In Required|Owner Access Required|Owner access unavailable/i, "query/header-like OWNER strings must not bypass the verified owner gate");
    excludes(body, /Synthetic Target|ORDER-POPULATED-DRAFT\.TEST|Confirm Purchase|Receiving events/i, "denied navigation must not expose protected Purchase/Receiving records or controls");
    equal(await page.getByTestId("purchase-receiving-page").count(), 0, "unauthorized navigation must not mount the authorized Purchase/Receiving page");
    equal(await page.evaluate(() => window.__phase2caBrowserQa.purchaseReceivingReads), 0, "Purchase/Receiving storage must not be read before owner authorization");
    equal(externalRequests.length, 0, `owner gate must make no external request: ${externalRequests.join("\n")}`);
    equal(browserErrors.length, 0, browserErrors.join("\n"));
    await assertNoHorizontalOverflow(page, "owner gate query spoof at 360px");
    const screenshotPath = path.join(ARTIFACT_DIR, "360x800-light-owner-gate-query-spoof.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return {
      id: scenario.id,
      kind: scenario.kind,
      route: "/business/purchases",
      ownerAuthorized: false,
      viewport: scenario.viewport,
      theme: scenario.theme,
      screenshot: relativeArtifact(screenshotPath),
      horizontalOverflow: 0,
      externalRequestCount: 0,
      browserErrors: [],
      preAuthorizationStorageReads: 0,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  if (!LOOPBACK_HOSTS.has(APP_BASE_URL.hostname)) throw new Error("Purchase/Receiving browser QA may use betaLocalMode only against a loopback APP_URL.");
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const states = await buildScenarioStates();
  const mobile = { width: 360, height: 800 };
  const scenarios = [
    { id: "empty-drafts-mobile-light", kind: "empty", state: null, viewport: mobile, theme: "light" },
    { id: "empty-drafts-mobile-dark", kind: "empty", state: null, viewport: mobile, theme: "dark" },
    { id: "populated-draft-mobile", kind: "populated-draft", state: states.get("populated-draft"), viewport: mobile, theme: "light" },
    { id: "corrected-draft-mobile", kind: "corrected-draft", state: states.get("corrected-draft"), viewport: mobile, theme: "dark" },
    { id: "rejected-draft-large-phone", kind: "rejected-draft", state: states.get("rejected-draft"), viewport: { width: 430, height: 932 }, theme: "light" },
    { id: "confirmed-draft-tablet", kind: "confirmed-draft", state: states.get("confirmed-draft"), viewport: { width: 768, height: 1024 }, theme: "dark" },
    { id: "purchases-desktop", kind: "purchase-desktop", state: states.get("purchase-desktop"), viewport: { width: 1440, height: 1000 }, theme: "light" },
    { id: "partial-receiving-mobile", kind: "partial-receiving", state: states.get("partial-receiving"), viewport: mobile, theme: "light" },
    { id: "full-receiving-desktop", kind: "full-receiving", state: states.get("full-receiving"), viewport: { width: 1440, height: 1000 }, theme: "dark" },
    { id: "damaged-item-mobile", kind: "receiving-dialog-damaged", state: states.get("receiving-dialog-damaged"), viewport: mobile, theme: "dark" },
    { id: "missing-item-large-phone", kind: "receiving-dialog-missing", state: states.get("receiving-dialog-missing"), viewport: { width: 430, height: 932 }, theme: "light" },
    { id: "wrong-item-tablet", kind: "receiving-dialog-wrong-item", state: states.get("receiving-dialog-wrong-item"), viewport: { width: 768, height: 1024 }, theme: "dark" },
    { id: "inventory-handoff-preview-mobile", kind: "inventory-handoff-preview", state: states.get("inventory-handoff-preview"), viewport: mobile, theme: "light" },
    { id: "populated-draft-desktop-dark", kind: "populated-draft", state: states.get("populated-draft"), viewport: { width: 1440, height: 1000 }, theme: "dark" },
  ];
  equal(scenarios.length, 14, "Purchase/Receiving QA should include fourteen authorized responsive scenarios");
  ok(scenarios.filter(({ viewport }) => viewport.width === 360).length >= 6, "Purchase/Receiving QA should prioritize 360px owner workflows");
  const browser = await chromium.launch({ headless: true });
  const captures = [];
  try {
    for (const scenario of scenarios) captures.push(await inspectAuthorizedScenario(browser, scenario));
    captures.push(await inspectOwnerGate(browser, states.get("populated-draft")));
  } finally {
    await browser.close();
  }
  const manifest = {
    format: "code3-phase2ca-purchase-receiving-qa",
    version: 1,
    createdAt: new Date().toISOString(),
    appUrl: APP_BASE_URL.origin,
    storageKey: STORAGE_KEY,
    scenarioCount: captures.length,
    captureCount: captures.length,
    assertionCount: assertions,
    notes: [
      "All populated states were generated through the local Phase 2C-A domain service from reserved synthetic fixtures.",
      "Every browser context blocked and reported external HTTP requests; no mailbox, bot, retailer, payment, Supabase, Upstash, or provider network was contacted.",
      "The unauthenticated query-spoof scenario verified the owner gate before Purchase/Receiving storage access.",
      "Draft confirmation, Receiving, and Inventory Handoff remained separate; the preview exposed no inventory writer.",
      "Mobile, larger-phone, tablet, desktop, light, dark, keyboard, reduced-motion, 44px-target, and horizontal-overflow checks are included.",
    ],
    captures,
  };
  const manifestPath = path.join(ARTIFACT_DIR, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Code 3 Purchase/Receiving browser QA passed: ${captures.length} scenarios, ${captures.length} captures, ${assertions} assertions.`);
  console.log(`QA manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
