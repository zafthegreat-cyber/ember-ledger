const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("@playwright/test");

const BASE_URL = new URL(process.env.APP_URL || "http://127.0.0.1:5200/");
const ACCOUNT_OPS_STORAGE_KEY = "code3.account-ops.v1";
const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "qa", "code3-phase2a6a-account-ops-foundation", "current");
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

const AREAS = Object.freeze([
  { key: "overview", label: "Overview", heading: "Operations overview" },
  { key: "accounts", label: "Accounts", heading: "Store Accounts" },
  { key: "identity", label: "Profiles & identity", heading: "Profiles, aliases, and phone resources" },
  { key: "payment", label: "Payment Metadata", heading: "Virtual Cards & Billing Profiles" },
  { key: "network", label: "Network", heading: "Proxy Groups" },
  { key: "verification", label: "Verification", heading: "Verification Inbox" },
  { key: "automation", label: "Automation", heading: "Bot Export Center" },
  { key: "orders", label: "Orders", heading: "Order Candidates" },
  { key: "infrastructure", label: "Infrastructure", heading: "Servers & Remote Workspaces" },
  { key: "activity", label: "Activity", heading: "Attention Center" },
]);

const VIEWPORTS = Object.freeze([
  { label: "mobile-light", width: 360, height: 800, theme: "light" },
  { label: "phone-dark", width: 430, height: 900, theme: "dark" },
  { label: "tablet-light", width: 768, height: 1024, theme: "light" },
  { label: "desktop-dark", width: 1440, height: 1000, theme: "dark" },
]);

let assertions = 0;
function ok(value, message) {
  assertions += 1;
  assert.ok(value, message);
}
function equal(actual, expected, message) {
  assertions += 1;
  assert.equal(actual, expected, message);
}
function match(value, pattern, message) {
  assertions += 1;
  assert.match(value, pattern, message);
}
function excludes(value, pattern, message) {
  assertions += 1;
  assert.doesNotMatch(value, pattern, message);
}

function accountOpsUrl({ owner = true, theme = "light", area = "overview" } = {}) {
  const pathname = area === "overview" ? "/account-ops" : `/account-ops/${encodeURIComponent(area)}`;
  const url = new URL(pathname, BASE_URL);
  if (owner) {
    url.searchParams.set("betaLocalMode", "true");
  } else {
    // These values are intentionally untrusted. They must never establish OWNER authority.
    url.searchParams.set("role", "OWNER");
    url.searchParams.set("ownerAuthorized", "true");
    url.searchParams.set("isOwner", "true");
  }
  url.searchParams.set("themeInspect", theme);
  url.searchParams.set("phase2a6aQa", "true");
  return url.toString();
}

async function loadSyntheticAccountOpsState() {
  const moduleUrl = pathToFileURL(path.join(
    process.cwd(),
    "src",
    "features",
    "accountOps",
    "operationsFoundation",
    "fixtures",
    "phase2a6aFixtures.js",
  )).href;
  const fixtures = await import(moduleUrl);
  const fixture = fixtures.getPhase2a6aQaFixture("captcha-required");
  equal(fixture.expectsRejection, false, "the browser fixture is an accepted synthetic metadata fixture");
  return fixture.accountOps;
}

async function seedAndInstrument(context, accountOpsState) {
  await context.addInitScript(({ storageKey, fixtureState }) => {
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    const originalClear = Storage.prototype.clear;
    const serializedFixture = JSON.stringify(fixtureState);

    originalSetItem.call(localStorage, storageKey, serializedFixture);
    window.__phase2a6aBrowserQa = {
      accountOpsReads: 0,
      accountOpsWrites: 0,
      accountOpsRemoves: 0,
      localStorageClears: 0,
      externalOpenAttempts: 0,
      serializedFixture,
    };

    Storage.prototype.getItem = function patchedGetItem(key) {
      if (this === localStorage && key === storageKey) window.__phase2a6aBrowserQa.accountOpsReads += 1;
      return originalGetItem.call(this, key);
    };
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      if (this === localStorage && key === storageKey) window.__phase2a6aBrowserQa.accountOpsWrites += 1;
      return originalSetItem.call(this, key, value);
    };
    Storage.prototype.removeItem = function patchedRemoveItem(key) {
      if (this === localStorage && key === storageKey) window.__phase2a6aBrowserQa.accountOpsRemoves += 1;
      return originalRemoveItem.call(this, key);
    };
    Storage.prototype.clear = function patchedClear() {
      if (this === localStorage) window.__phase2a6aBrowserQa.localStorageClears += 1;
      return originalClear.call(this);
    };

    Object.defineProperty(window, "open", {
      configurable: true,
      value: () => {
        window.__phase2a6aBrowserQa.externalOpenAttempts += 1;
        return null;
      },
    });
  }, { storageKey: ACCOUNT_OPS_STORAGE_KEY, fixtureState: accountOpsState });
}

function observe(page, label, externalRequests, browserErrors) {
  page.on("request", (request) => {
    try {
      const requestUrl = new URL(request.url());
      if (["http:", "https:"].includes(requestUrl.protocol) && !LOOPBACK_HOSTS.has(requestUrl.hostname.toLowerCase())) {
        externalRequests.push(`${label}: ${requestUrl.origin}${requestUrl.pathname}`);
      }
    } catch {
      externalRequests.push(`${label}: unparseable request URL`);
    }
  });
  page.on("pageerror", (error) => browserErrors.push(`${label} page: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const sourceUrl = message.location()?.url || "";
    const knownNonFeatureNoise = /favicon|ResizeObserver/i.test(text)
      || /\/api\/ebay\/health(?:\?|$)/i.test(sourceUrl);
    if (!knownNonFeatureNoise) browserErrors.push(`${label} console: ${text}`);
  });
  page.on("popup", (popup) => popup.close().catch(() => {}));
}

async function storageSnapshot(page) {
  return page.evaluate((storageKey) => ({
    bytes: localStorage.getItem(storageKey),
    counters: { ...window.__phase2a6aBrowserQa },
  }), ACCOUNT_OPS_STORAGE_KEY);
}

async function assertNoHorizontalOverflow(page, root, label) {
  const documentMetrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  ok(documentMetrics.scrollWidth - documentMetrics.clientWidth <= 1, `${label} has no document-level horizontal overflow`);
  const rootMetrics = await root.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  ok(rootMetrics.scrollWidth - rootMetrics.clientWidth <= 1, `${label} has no Account Ops horizontal overflow`);
}

async function assertMinimumTarget(locator, label) {
  const box = await locator.boundingBox();
  ok(Boolean(box) && box.width >= 43.5 && box.height >= 43.5, `${label} exposes a 44px pointer target`);
}

async function assertKeyboardFocusable(locator, label) {
  await locator.focus();
  equal(await locator.evaluate((element) => document.activeElement === element), true, `${label} accepts keyboard focus`);
}

async function accessibilityAudit(root, label) {
  const result = await root.evaluate((scope) => {
    const controls = [...scope.querySelectorAll("button, a[href], select, input:not([type='hidden']), textarea, summary, [role='button']")]
      .filter((control) => {
        const closedDetails = control.closest("details:not([open])");
        if (closedDetails && !closedDetails.querySelector("summary")?.contains(control)) return false;
        const box = control.getBoundingClientRect();
        const style = getComputedStyle(control);
        return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      });
    const unlabeled = controls.filter((control) => {
      const text = (control.textContent || "").trim();
      const label = control.getAttribute("aria-label")
        || control.getAttribute("aria-labelledby")
        || control.getAttribute("title")
        || control.labels?.length;
      return !text && !label;
    }).map((control) => control.outerHTML.slice(0, 180));
    const undersized = controls.filter((control) => {
      const effectiveTarget = control.matches("input[type='checkbox'], input[type='radio']")
        ? control.closest("label") || control
        : control;
      const box = effectiveTarget.getBoundingClientRect();
      return box.width < 43.5 || box.height < 43.5;
    }).map((control) => {
      const box = control.getBoundingClientRect();
      return { tag: control.tagName, label: (control.textContent || control.getAttribute("aria-label") || "").trim(), width: box.width, height: box.height };
    });
    const ids = [...scope.querySelectorAll("[id]")].map((element) => element.id).filter(Boolean);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    const imagesWithoutAlt = scope.querySelectorAll("img:not([alt])").length;
    return { unlabeled, undersized, duplicateIds, imagesWithoutAlt };
  });

  equal(result.unlabeled.length, 0, `${label} has no unlabeled controls: ${JSON.stringify(result.unlabeled)}`);
  equal(result.undersized.length, 0, `${label} controls meet the 44px target: ${JSON.stringify(result.undersized)}`);
  equal(result.duplicateIds.length, 0, `${label} has no duplicate IDs`);
  equal(result.imagesWithoutAlt, 0, `${label} has no images missing alt text`);
}

async function navigateToArea(page, root, scenario, area, { keyboard = false } = {}) {
  const picker = root.getByRole("combobox", { name: "Section", exact: true });
  const rail = root.getByRole("navigation", { name: "Account Ops areas navigation", exact: true });

  if (scenario.width < 1100) {
    equal(await picker.isVisible(), true, `${scenario.label} exposes the compact area picker`);
    equal(await rail.isVisible(), false, `${scenario.label} hides the desktop area rail`);
    if (keyboard) await assertKeyboardFocusable(picker, `${scenario.label} area picker`);
    await picker.selectOption(area.key);
    equal(await picker.inputValue(), area.key, `${scenario.label} selects ${area.label} from the area picker`);
  } else {
    equal(await picker.isVisible(), false, `${scenario.label} hides the compact area picker`);
    equal(await rail.isVisible(), true, `${scenario.label} exposes the desktop area rail`);
    const button = rail.getByRole("button", { name: area.label, exact: true });
    await button.waitFor();
    if (keyboard) {
      await assertKeyboardFocusable(button, `${scenario.label} ${area.label} rail item`);
      await page.keyboard.press("Enter");
    } else {
      await button.click();
    }
    equal(await button.getAttribute("aria-current"), "page", `${scenario.label} marks ${area.label} current in the desktop rail`);
  }

  await root.getByRole("heading", { name: area.heading, exact: true }).first().waitFor();
  await assertNoHorizontalOverflow(page, root, `${scenario.label} ${area.label}`);
}

async function verifyTextContrast(root, scenario) {
  const contrastFailures = await root.evaluate((map) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const luminance = (color) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    return [...map.querySelectorAll(".account-ops-operations-map button strong, .account-ops-operations-map button span, .ops-button--primary:not(:disabled)")].filter((text) => text.checkVisibility()).flatMap((text) => {
      const foreground = luminance(getComputedStyle(text).color);
      const background = luminance(getComputedStyle(text.closest("button")).backgroundColor);
      const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      return ratio < 4.5 ? [{ text: text.textContent, ratio }] : [];
    });
  });
  equal(contrastFailures.length, 0, `${scenario.label} navigation and primary-action text meets 4.5:1 contrast: ${JSON.stringify(contrastFailures)}`);
}

async function verifyOverview(root, scenario) {
  const content = await root.locator(".account-ops-area-content").innerText();
  match(content, /No Live Connections/i, `${scenario.label} labels the foundation as disconnected`);
  match(content, /does not create retailer accounts, solve verification challenges, connect providers, send exports, provision servers, or authorize purchases/i, `${scenario.label} states the offline automation boundary`);
  match(content, /What needs me\?/i, `${scenario.label} exposes the owner Attention summary`);
  ok(await root.locator('[aria-label="Account Ops attention items"] .account-ops-operations-attention').count() >= 1, `${scenario.label} derives at least one synthetic owner-attention item`);
}

async function verifyCreationAssistant(page, root, scenario) {
  const action = root.getByRole("button", { name: "Create Account Draft", exact: true });
  await assertMinimumTarget(action, `${scenario.label} Create Account Draft`);
  await assertKeyboardFocusable(action, `${scenario.label} Create Account Draft`);
  const before = await storageSnapshot(page);
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Create store account", exact: true });
  await dialog.waitFor();
  const dialogText = await dialog.innerText();
  match(dialogText, /Prepare one legitimate retailer account/i, `${scenario.label} opens a local retailer-account metadata dialog`);
  match(dialogText, /Verification, CAPTCHA, OTP, and submission remain owner-controlled/i, `${scenario.label} keeps human verification owner-controlled`);
  match(dialogText, /Optional ephemeral password/i, `${scenario.label} labels password generation as ephemeral`);
  equal(await dialog.getByRole("button", { name: /Create Retailer Account|Submit Signup|Open Signup|Sign Up Now/i }).count(), 0, `${scenario.label} exposes no live signup action`);
  equal(await dialog.locator("a[href]").count(), 0, `${scenario.label} exposes no retailer navigation from the draft dialog`);

  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  equal(await dialog.count(), 0, `${scenario.label} closes the metadata dialog with Escape`);
  equal(await action.evaluate((element) => document.activeElement === element), true, `${scenario.label} restores focus after the dialog closes`);

  const after = await storageSnapshot(page);
  equal(after.bytes, before.bytes, `${scenario.label} opening and discarding the draft leaves Account Ops storage byte-equivalent`);
  equal(after.counters.accountOpsWrites, before.counters.accountOpsWrites, `${scenario.label} opening the draft performs no Account Ops write`);
  equal(after.counters.accountOpsRemoves, before.counters.accountOpsRemoves, `${scenario.label} opening the draft performs no Account Ops removal`);
  equal(after.counters.externalOpenAttempts, 0, `${scenario.label} opening the draft launches no external signup page`);
}

async function verifyVerification(root, scenario) {
  const content = await root.locator(".account-ops-area-content").innerText();
  match(content, /Human Action Only/i, `${scenario.label} labels verification as human-controlled`);
  match(content, /does not solve challenges, intercept codes, reuse tokens, accept terms, or bypass account security/i, `${scenario.label} states the anti-bypass boundary`);
  match(content, /Human verification challenge[\s\S]*Captcha Required/i, `${scenario.label} renders the synthetic CAPTCHA-required workflow`);
  match(content, /Complete the challenge yourself in the retailer interface; automation remains paused/i, `${scenario.label} gives human-only CAPTCHA guidance`);
}

async function verifyAutomation(root, scenario) {
  const area = root.locator(".account-ops-area-content");
  const content = await area.innerText();
  for (const provider of ["Stellar", "Hayha", "Polar", "Sniped", "Swooper", "Shikari", "Valor", "Refract"]) {
    match(content, new RegExp(`\\b${provider}\\b`, "i"), `${scenario.label} shows ${provider} compatibility metadata`);
    const card = area.locator(".account-ops-operations-card").filter({ has: area.page().getByRole("heading", { name: provider, exact: true }) });
    match(await card.innerText(), /Not Ready/, `${scenario.label} ${provider} native export remains not ready`);
  }
  match(content, /cannot connect a bot, create a task, send an export, configure a webhook endpoint, or store a bot license/i, `${scenario.label} preserves the export and webhook boundary`);
  equal(await area.getByRole("button", { name: /Send|Connect|Sync|Create Tasks?|Configure Webhook|Export to/i }).count(), 0, `${scenario.label} exposes no send, connect, sync, task-create, or webhook action`);
}

async function verifyOrders(root, scenario) {
  const relationship = root.locator('[aria-label="Order relationship boundary"]');
  await relationship.waitFor();
  match(await relationship.innerText(), /Retailer Account[\s\S]*Order Candidate[\s\S]*Purchase[\s\S]*Shipment[\s\S]*Receiving[\s\S]*Inventory/i, `${scenario.label} shows the complete read-only order relationship`);
  const content = await root.locator(".account-ops-area-content").innerText();
  match(content, /Order Candidate is not Purchase\. Delivery is not Receiving\./i, `${scenario.label} preserves the order, Purchase, and Receiving boundaries`);
  match(content, /Read only/i, `${scenario.label} labels the order tracker as read only`);
  await root.getByRole("button", { name: "Show sample order", exact: true }).click();
  match(await root.locator("#account-ops-sample-order").innerText(), /SAMPLE DATA · NOT SAVED[\s\S]*Weekend collection order[\s\S]*Confirm receipt/i, `${scenario.label} renders an explicitly synthetic order example`);
}

async function verifyInfrastructure(root, scenario) {
  const area = root.locator(".account-ops-area-content");
  const content = await area.innerText();
  match(content, /No Live Control/i, `${scenario.label} labels infrastructure as non-live metadata`);
  match(content, /does not create cloud instances, start or stop machines, open remote access, harvest browser state, or randomize fingerprints/i, `${scenario.label} preserves infrastructure and anti-evasion boundaries`);
  match(content, /Cloud Instance Templates[\s\S]*Bot runner[\s\S]*Lightweight monitor[\s\S]*Automation worker/i, `${scenario.label} shows all three planning-only cloud templates`);
  match(content, /Provisioning[\s\S]*Disabled/i, `${scenario.label} keeps cloud provisioning disabled`);
  equal(await area.getByRole("button", { name: /Provision|Start|Stop|Connect|Open Remote|Launch/i }).count(), 0, `${scenario.label} exposes no infrastructure control action`);
}

async function verifyActivitySearch(page, root, scenario) {
  const content = root.locator(".account-ops-area-content");
  match(await content.innerText(), /Attention Center[\s\S]*what needs your attention/i, `${scenario.label} presents the unified Attention Center`);
  const search = root.getByLabel("Search Account Ops", { exact: true });
  await assertMinimumTarget(search, `${scenario.label} Account Ops search`);
  await assertKeyboardFocusable(search, `${scenario.label} Account Ops search`);
  const before = await storageSnapshot(page);
  await search.fill("Business 01");
  const result = root.locator(".account-ops-operations-search-result").first();
  await result.waitFor();
  match(await result.innerText(), /Business 01[\s\S]*Review/i, `${scenario.label} search returns a review-only local navigation result`);
  await assertKeyboardFocusable(result, `${scenario.label} Account Ops search result`);
  await page.keyboard.press("Enter");
  await root.getByRole("heading", { name: "Store Accounts", exact: true }).waitFor();
  const after = await storageSnapshot(page);
  equal(after.bytes, before.bytes, `${scenario.label} internal search navigation leaves Account Ops storage byte-equivalent`);
  equal(after.counters.accountOpsWrites, before.counters.accountOpsWrites, `${scenario.label} internal search navigation performs no Account Ops write`);
  equal(after.counters.accountOpsRemoves, before.counters.accountOpsRemoves, `${scenario.label} internal search navigation performs no Account Ops removal`);
  equal(after.counters.externalOpenAttempts, 0, `${scenario.label} internal search opens no external destination`);
}

async function verifyScenario(browser, scenario, accountOpsState, externalRequests, browserErrors) {
  const context = await browser.newContext({
    viewport: { width: scenario.width, height: scenario.height },
    colorScheme: scenario.theme,
    reducedMotion: "reduce",
  });
  await seedAndInstrument(context, accountOpsState);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(45000);
  observe(page, scenario.label, externalRequests, browserErrors);

  try {
    await page.goto(accountOpsUrl({ owner: true, theme: scenario.theme }), { waitUntil: "domcontentloaded" });
    const root = page.getByTestId("account-ops");
    await root.waitFor();
    await page.getByText("Local development identity", { exact: true }).waitFor();
    equal(await page.locator("html").getAttribute("data-theme"), scenario.theme, `${scenario.label} renders the requested theme`);
    equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true, `${scenario.label} honors reduced-motion preference`);
    equal(await root.getByRole("heading", { name: "Account Ops", exact: true }).count(), 1, `${scenario.label} renders one Account Ops page heading`);

    for (const area of AREAS) {
      await navigateToArea(page, root, scenario, area, { keyboard: scenario.width >= 1100 && area.key === "activity" });
      if (area.key === "accounts") await root.getByRole("button", { name: "Setup & health", exact: true }).click();
      if (area.key === "orders") await root.getByText("Order relationships & receiving", { exact: true }).click();
      for (const help of await root.locator(".account-ops-help:not(.account-ops-summary-details) > summary").all()) await help.click();
      const areaText = await root.locator(".account-ops-area-content").innerText();
      excludes(areaText, /\b(?:access token|refresh token|authorization bearer|captcha solution|full card number|security code value)\b/i, `${scenario.label} ${area.label} does not expose prohibited secret material`);
      if (area.key === "overview") await verifyOverview(root, scenario);
      if (area.key === "accounts") await verifyCreationAssistant(page, root, scenario);
      if (area.key === "accounts") {
        excludes(await root.locator(".account-ops-operations-stack").first().innerText(), /retailer-preset:|emailAliases:|profile:/, `${scenario.label} account cards use readable names`);
        await root.getByRole("button", { name: "All Accounts", exact: true }).click();
        equal(await page.evaluate(() => document.activeElement?.id), "account-ops-store-accounts", `${scenario.label} All Accounts focuses the actual record list`);
      }
      if (area.key === "verification") await verifyVerification(root, scenario);
      if (area.key === "automation") await verifyAutomation(root, scenario);
      if (area.key === "orders") await verifyOrders(root, scenario);
      if (area.key === "infrastructure") await verifyInfrastructure(root, scenario);
      for (const help of await root.locator(".account-ops-help[open]:not(.account-ops-summary-details) > summary").all()) await help.click();
      await accessibilityAudit(root, `${scenario.label} ${area.label}`);
      await verifyTextContrast(root, scenario);
      const filters = root.locator(".account-ops-toolbar > details");
      if (await filters.count()) {
        await filters.locator("summary").click();
        await accessibilityAudit(root, `${scenario.label} ${area.label} expanded filters`);
        await assertNoHorizontalOverflow(page, root, `${scenario.label} ${area.label} expanded filters`);
        await filters.locator("summary").click();
      }
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `${scenario.label}-${area.key}.png`), fullPage: true });
      const areaStorage = await storageSnapshot(page);
      equal(areaStorage.bytes, areaStorage.counters.serializedFixture, `${scenario.label} ${area.label} preserves fixture bytes before navigation`);
      equal(areaStorage.counters.accountOpsWrites + areaStorage.counters.accountOpsRemoves + areaStorage.counters.localStorageClears + areaStorage.counters.externalOpenAttempts, 0, `${scenario.label} ${area.label} stays zero-write and opens no external window`);
      await page.goto(accountOpsUrl({ owner: true, theme: scenario.theme, area: area.key }), { waitUntil: "domcontentloaded" });
      await root.getByRole("heading", { name: area.heading, exact: true }).first().waitFor();
      equal(await root.getByRole("heading", { name: area.heading, exact: true }).first().isVisible(), true, `${scenario.label} ${area.label} supports direct loading`);
    }

    await navigateToArea(page, root, scenario, AREAS.find((area) => area.key === "activity"), { keyboard: scenario.width < 1100 });
    await verifyActivitySearch(page, root, scenario);
    await navigateToArea(page, root, scenario, AREAS[0]);

    const picker = root.getByRole("combobox", { name: "Section", exact: true });
    const rail = root.getByRole("navigation", { name: "Account Ops areas navigation", exact: true });
    if (scenario.width < 1100) await assertMinimumTarget(picker, `${scenario.label} compact area picker`);
    else await assertMinimumTarget(rail.locator("button").first(), `${scenario.label} desktop area rail item`);
    await accessibilityAudit(root, scenario.label);
    await assertNoHorizontalOverflow(page, root, scenario.label);

    const finalStorage = await storageSnapshot(page);
    equal(finalStorage.bytes, finalStorage.counters.serializedFixture, `${scenario.label} preserves the seeded Account Ops fixture byte-for-byte`);
    equal(finalStorage.counters.accountOpsWrites, 0, `${scenario.label} performs no Account Ops persistence write`);
    equal(finalStorage.counters.accountOpsRemoves, 0, `${scenario.label} performs no Account Ops persistence removal`);
    equal(finalStorage.counters.localStorageClears, 0, `${scenario.label} performs no localStorage clear`);
    equal(finalStorage.counters.externalOpenAttempts, 0, `${scenario.label} opens no external signup, provider, or infrastructure window`);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${scenario.label}.png`), fullPage: true });
  } finally {
    await context.close();
  }
}

async function verifySpoofedOwnerDenied(browser, accountOpsState, externalRequests, browserErrors) {
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await seedAndInstrument(context, accountOpsState);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(45000);
  observe(page, "query-owner-spoof-denied", externalRequests, browserErrors);

  try {
    await page.goto(accountOpsUrl({ owner: false, theme: "light" }), { waitUntil: "domcontentloaded" });
    await page.getByText(/Sign In Required|Owner Access Required|Owner access unavailable|Sign in/i).first().waitFor();
    const body = await page.locator("body").innerText();
    match(body, /Sign In Required|Owner Access Required|Owner access unavailable|Sign in/i, "query-string OWNER claims cannot bypass verified authorization");
    equal(await page.getByTestId("account-ops").count(), 0, "the denied browser cannot mount Account Ops records");
    equal(await page.getByRole("heading", { name: "Account Creation Assistant", exact: true }).count(), 0, "the denied browser cannot render Account Ops operating areas");
    const counters = await page.evaluate(() => ({ ...window.__phase2a6aBrowserQa }));
    equal(counters.accountOpsReads, 0, "OWNER denial occurs before Account Ops storage access");
    equal(counters.accountOpsWrites, 0, "OWNER denial performs no Account Ops write");
    equal(counters.accountOpsRemoves, 0, "OWNER denial performs no Account Ops removal");
    equal(counters.localStorageClears, 0, "OWNER denial performs no localStorage clear");
    equal(counters.externalOpenAttempts, 0, "OWNER denial opens no external destination");
    await assertNoHorizontalOverflow(page, page.locator("body"), "query-owner-spoof-denied");
  } finally {
    await context.close();
  }
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  equal(AREAS.length, 10, "the browser matrix covers all 10 Account Ops operating areas");
  const accountOpsState = await loadSyntheticAccountOpsState();
  const browser = await chromium.launch({ headless: true });
  const externalRequests = [];
  const browserErrors = [];

  try {
    for (const scenario of VIEWPORTS) {
      await verifyScenario(browser, scenario, accountOpsState, externalRequests, browserErrors);
    }
    await verifySpoofedOwnerDenied(browser, accountOpsState, externalRequests, browserErrors);
    equal(browserErrors.length, 0, `browser errors: ${browserErrors.join(" | ")}`);
    equal(externalRequests.length, 0, `non-loopback requests: ${externalRequests.join(" | ")}`);
    fs.writeFileSync(path.join(ARTIFACT_DIR, "manifest.json"), JSON.stringify({
      phase: "2A.6-A", completedAt: new Date().toISOString(), status: "PASS",
      appUrl: BASE_URL.origin, scenarios: 5, assertions,
      areas: AREAS.map(({ key }) => key), viewports: VIEWPORTS,
      captures: VIEWPORTS.flatMap(({ label }) => [...AREAS.map(({ key }) => `${label}-${key}.png`), `${label}.png`]),
      browserErrors, externalRequests,
      checks: ["owner denial", "zero writes", "keyboard", "reduced motion", "44px controls", "expanded filters", "navigation and primary-action contrast", "no horizontal overflow", "all-area direct loading"],
    }, null, 2));
    console.log(`Code 3 Account Ops foundation browser: 5 scenarios, ${assertions} assertions passed; captures ignored at ${path.relative(process.cwd(), ARTIFACT_DIR).replaceAll("\\", "/")}.`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
