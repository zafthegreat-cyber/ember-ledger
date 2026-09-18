const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("@playwright/test");

const APP_BASE_URL = new URL(process.env.APP_URL || "http://127.0.0.1:5200/");
const STORAGE_KEY = "code3.bot-ops.v1";
const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "qa", "code3-phase2da-bot-operations", "current");
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

const MOBILE_VIEWPORT = Object.freeze({ width: 360, height: 800 });
const VIEWPORT_MATRIX = Object.freeze([
  { id: "empty-mobile-light", fixtureKey: null, section: "overview", theme: "light", viewport: MOBILE_VIEWPORT },
  { id: "empty-mobile-dark", fixtureKey: null, section: "overview", theme: "dark", viewport: MOBILE_VIEWPORT },
  { id: "healthy-large-phone", fixtureKey: "healthy-mock-bot", section: "bots", theme: "light", viewport: { width: 430, height: 932 } },
  { id: "task-groups-tablet", fixtureKey: "target-pokemon-task-group", section: "task-groups", theme: "dark", viewport: { width: 768, height: 1024 } },
  { id: "checkout-review-desktop", fixtureKey: "checkout-evidence-review", section: "activity", theme: "light", viewport: { width: 1440, height: 1000 } },
]);

const SECTION_BY_FIXTURE = Object.freeze({
  "hayha-disconnected": "bots",
  "stellar-disconnected": "bots",
  "healthy-mock-bot": "bots",
  "degraded-mock-bot": "bots",
  "target-pokemon-task-group": "task-groups",
  "walmart-pokemon-task-group": "task-groups",
  "one-piece-task-group": "task-groups",
  "task-waiting": "tasks",
  "task-monitoring": "tasks",
  "carted-synthetic-task": "tasks",
  "synthetic-checkout-success": "activity",
  "account-error": "activity",
  "proxy-error": "activity",
  "retailer-block": "activity",
  "payment-error": "activity",
  "rate-limit": "activity",
  "duplicate-provider-event": "tasks",
  "conflicting-task-state": "tasks",
  "checkout-evidence-review": "activity",
  "same-product-two-bots": "tasks",
  "account-multiple-groups": "accounts",
  "disabled-account": "accounts",
  "disabled-proxy-group": "proxies",
  "missing-profile": "task-groups",
  "malformed-provider-payload": "bots",
  "secret-bearing-provider-payload-rejected": "bots",
  "checkout-evidence-order-reconciled": "activity",
});

const REPRESENTATIVE_DARK = new Set([
  "hayha-disconnected",
  "degraded-mock-bot",
  "synthetic-checkout-success",
  "payment-error",
  "disabled-proxy-group",
]);

const EXPECTED_TEXT = Object.freeze({
  "hayha-disconnected": /Hayha foundation[\s\S]*Disconnected/i,
  "stellar-disconnected": /Stellar foundation[\s\S]*Disconnected/i,
  "healthy-mock-bot": /Synthetic bot runtime[\s\S]*Healthy/i,
  "degraded-mock-bot": /Synthetic bot runtime[\s\S]*Degraded/i,
  "target-pokemon-task-group": /Target Pok.mon synthetic/i,
  "walmart-pokemon-task-group": /Walmart Pok.mon synthetic/i,
  "one-piece-task-group": /Target One Piece synthetic/i,
  "task-waiting": /Synthetic Pok.mon product[\s\S]*Waiting/i,
  "task-monitoring": /Synthetic Pok.mon product[\s\S]*Monitoring/i,
  "carted-synthetic-task": /Synthetic Pok.mon product[\s\S]*Carted/i,
  "synthetic-checkout-success": /Checkout Succeeded[\s\S]*Checkout Evidence[\s\S]*Owner review required/i,
  "account-error": /Account Error[\s\S]*Synthetic account error/i,
  "proxy-error": /Proxy Error[\s\S]*Synthetic proxy error/i,
  "retailer-block": /Retailer Block[\s\S]*Synthetic retailer block/i,
  "payment-error": /Payment Error[\s\S]*Synthetic payment error/i,
  "rate-limit": /Rate Limited[\s\S]*Synthetic rate limit/i,
  "duplicate-provider-event": /Synthetic Pok.mon product[\s\S]*Waiting/i,
  "conflicting-task-state": /Synthetic Pok.mon product[\s\S]*Success/i,
  "checkout-evidence-review": /Checkout Evidence[\s\S]*Needs Review[\s\S]*Purchase not created/i,
  "same-product-two-bots": /Synthetic Pok.mon product/i,
  "account-multiple-groups": /Synthetic Target account/i,
  "disabled-account": /Synthetic Target account[\s\S]*Disabled/i,
  "disabled-proxy-group": /Synthetic proxy metadata[\s\S]*Disabled/i,
  "missing-profile": /Target Pok.mon synthetic[\s\S]*Bot Profile Missing/i,
  "malformed-provider-payload": /Hayha[\s\S]*Not Configured[\s\S]*Stellar[\s\S]*Not Configured/i,
  "secret-bearing-provider-payload-rejected": /Hayha[\s\S]*Not Configured[\s\S]*Stellar[\s\S]*Not Configured/i,
  "checkout-evidence-order-reconciled": /Checkout Evidence[\s\S]*Reconciled[\s\S]*Inventory not created/i,
});

const SECTION_HEADING = Object.freeze({
  overview: "No bot integrations are connected",
  bots: "Bots",
  "task-groups": "Task Groups",
  tasks: "Tasks",
  accounts: "Accounts",
  profiles: "Profiles",
  proxies: "Proxies",
  targets: "Product Targets",
  activity: "Activity",
});

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

function appUrl(section, theme) {
  const pathname = section === "overview" ? "/bot" : `/bot/${section}`;
  const url = new URL(pathname, APP_BASE_URL);
  url.searchParams.set("betaLocalMode", "true");
  url.searchParams.set("themeInspect", theme);
  url.searchParams.set("phase2dQa", "true");
  return url.toString();
}

function relativeArtifact(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll("\\", "/");
}

function safeFilePart(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

async function loadFixtures() {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), "src", "features", "botOps", "fixtures", "phase2dQaFixtures.js")).href;
  const fixtures = await import(moduleUrl);
  return fixtures.PHASE_2D_QA_FIXTURES.map(({ key, label }) => ({
    key,
    label,
    state: fixtures.getPhase2dQaFixture(key).state,
  }));
}

async function seedContext(context, state) {
  await context.addInitScript(({ storageKey, fixtureState }) => {
    localStorage.clear();
    sessionStorage.clear();
    if (fixtureState) localStorage.setItem(storageKey, JSON.stringify(fixtureState));
    Object.defineProperty(window, "open", { configurable: true, value: () => null });
  }, { storageKey: STORAGE_KEY, fixtureState: state });
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  ok(metrics.scrollWidth - metrics.clientWidth <= 1, `${label} should not overflow horizontally (${metrics.scrollWidth - metrics.clientWidth}px)`);
  return metrics;
}

async function assertMinimumTargets(root, label) {
  const targetMetrics = await root.locator("button:visible, a:visible, summary:visible").evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return {
      label: node.getAttribute("aria-label") || node.textContent?.trim() || node.tagName,
      width: Math.round(box.width * 100) / 100,
      height: Math.round(box.height * 100) / 100,
    };
  }));
  ok(targetMetrics.length > 0, `${label} should expose keyboard/touch controls`);
  const undersized = targetMetrics.filter((target) => target.width < 44 || target.height < 44);
  equal(undersized.length, 0, `${label} controls should be at least 44px: ${JSON.stringify(undersized)}`);
}

async function assertNoActionControls(root, label) {
  const labels = await root.locator("button:visible, a:visible, input:visible, summary:visible").evaluateAll((nodes) => nodes.map((node) => (
    node.getAttribute("aria-label") || node.textContent?.trim() || node.getAttribute("value") || ""
  )));
  const prohibited = labels.filter((value) => /^(?:start|stop|restart|run|cart|checkout|buy|purchase|place order|submit order|connect)(?:\b|\s)/i.test(value));
  equal(prohibited.length, 0, `${label} must not expose live bot, checkout, purchase, or provider connection controls: ${prohibited.join(", ")}`);
}

async function assertNoSecrets(page, root, label) {
  const body = await root.innerText();
  const persisted = await page.evaluate((key) => localStorage.getItem(key) || "", STORAGE_KEY);
  const credentialFieldPattern = /"(?:accessToken|refreshToken|apiKey|clientSecret|password|passphrase|otp|securityCode|cvv|cardNumber|sessionCookie|proxyPassword|proxyUrl|authorization)"\s*:/i;
  excludes(body, /synthetic-value-must-be-rejected/i, `${label} must not render the rejected synthetic secret value`);
  excludes(body, /\{\s*"(?:schemaVersion|installations|tasks|checkoutEvidence)"/i, `${label} should not expose raw state JSON`);
  excludes(body, /(?:bearer|basic)\s+[a-z0-9._~+/=-]{12,}/i, `${label} must not render authorization material`);
  excludes(persisted, credentialFieldPattern, `${label} persistence must not contain credential-bearing fields`);
  excludes(persisted, /synthetic-value-must-be-rejected/i, `${label} persistence must exclude rejected secret material`);
}

async function assertProviderHonesty(page) {
  const root = page.getByTestId("bot-operations");
  const currentPath = new URL(page.url()).pathname;
  if (currentPath !== "/bot/bots") return;
  const body = await root.innerText();
  match(body, /Hayha[\s\S]*Not Configured/i, "Hayha must remain visibly not configured");
  match(body, /Stellar[\s\S]*Not Configured/i, "Stellar must remain visibly not configured");
  ok((body.match(/Provider network\s*Disabled/gi) || []).length >= 2, "both provider definitions should show provider network disabled");
  equal(
    await root.locator(".bot-ops-record .ops-status-badge").filter({ hasText: /^Connected$/i }).count(),
    0,
    "provider cards must not report a connected status",
  );
  excludes(body, /Live adapter ready|Provider network\s*Enabled/i, "provider cards must not imply a live capability");
}

async function verifyFixtureScenario(page, fixture, section) {
  const root = page.getByTestId("bot-operations");
  const body = await root.innerText();
  const expected = EXPECTED_TEXT[fixture.key];
  ok(Boolean(expected), `browser expectations should exist for ${fixture.key}`);
  match(body, expected, `${fixture.label} should render its bounded synthetic state`);

  if (fixture.key === "same-product-two-bots") {
    equal(await root.getByRole("heading", { name: /Synthetic Pok.mon product/i }).count(), 2, "the same target may be projected into two tasks without duplicating the target record");
  }
  if (fixture.key === "duplicate-provider-event") {
    equal(await root.locator(".bot-ops-record").count(), 1, "a duplicate provider-event fixture should not render duplicate task records");
  }
  if (fixture.key === "synthetic-checkout-success" || fixture.key === "checkout-evidence-review" || fixture.key === "checkout-evidence-order-reconciled") {
    match(body, /Owner review required[\s\S]*Purchase not created[\s\S]*Inventory not created/i, "checkout evidence must preserve the owner-review and no-mutation invariant");
  }
  if (fixture.key === "secret-bearing-provider-payload-rejected") {
    excludes(body, /synthetic-value-must-be-rejected/i, "secret-bearing provider input must never reach the UI");
  }
  if (section === "activity") {
    equal(
      await root.locator("pre, code, [data-raw-provider-payload], [data-raw-provider-log]").count(),
      0,
      "Activity should not render raw provider payload or log surfaces",
    );
  }
}

async function inspectScenario(browser, scenario) {
  const context = await browser.newContext({
    viewport: scenario.viewport,
    deviceScaleFactor: 1,
    colorScheme: scenario.theme,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await seedContext(context, scenario.state);
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
  const ignoredNotices = [];
  page.setDefaultTimeout(25000);
  page.setDefaultNavigationTimeout(45000);
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("popup", (popup) => popup.close().catch(() => {}));
  page.on("dialog", (dialog) => dialog.dismiss());
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const sourceUrl = message.location()?.url || "";
    if (/favicon|ResizeObserver/i.test(text) || /\/api\/ebay\/health(?:\?|$)/i.test(sourceUrl)) {
      ignoredNotices.push(`${text}${sourceUrl ? ` (${sourceUrl})` : ""}`);
      return;
    }
    browserErrors.push(`console: ${text}${sourceUrl ? ` (${sourceUrl})` : ""}`);
  });

  try {
    await page.goto(appUrl(scenario.section, scenario.theme), { waitUntil: "domcontentloaded" });
    const root = page.getByTestId("bot-operations");
    await root.waitFor();
    await page.getByRole("heading", { name: "Bot Operations", exact: true }).waitFor();
    await root.getByRole("heading", { name: SECTION_HEADING[scenario.section], exact: true }).first().waitFor();

    equal(await page.locator("html").getAttribute("data-theme"), scenario.theme, `${scenario.id} should render the requested ${scenario.theme} theme`);
    equal(await root.getAttribute("data-persistence-mode"), "LOCAL_ONLY", `${scenario.id} should expose LOCAL_ONLY as the Bot Operations persistence mode`);
    equal(new URL(page.url()).pathname, scenario.section === "overview" ? "/bot" : `/bot/${scenario.section}`, `${scenario.id} should preserve the canonical Bot route`);
    equal(await root.locator("h1", { hasText: /^Bot Operations$/ }).count(), 1, `${scenario.id} should expose one Bot Operations content heading`);
    equal(await page.getByTestId("owner-workspace-access-state").count(), 0, `${scenario.id} should reach Bot Operations only through the existing authorized owner path`);

    const nav = root.getByRole("navigation", { name: "Bot Operations sections" });
    await nav.waitFor();
    await assertMinimumTargets(root, scenario.id);
    await assertNoActionControls(root, scenario.id);
    await assertNoSecrets(page, root, scenario.id);
    await assertProviderHonesty(page);

    if (!scenario.fixture) {
      const body = await root.innerText();
      match(body, /No bot integrations are connected/i, "normal Bot runtime should use the honest disconnected state");
      match(body, /Providers configured\s*0[\s\S]*Running tasks\s*0[\s\S]*Checkout evidence\s*0/i, "normal Bot runtime must not invent providers, tasks, or evidence");
      match(body, /No live bot, proxy, retailer, or checkout connection is active/i, "normal Bot runtime should disclose the live-integration boundary");
    } else if (scenario.expect) {
      match(await root.innerText(), scenario.expect, `${scenario.id} should render its selected domain projection`);
    } else {
      await verifyFixtureScenario(page, scenario.fixture, scenario.section);
    }

    const metrics = await assertNoHorizontalOverflow(page, `${scenario.id} (${scenario.theme}) at ${scenario.viewport.width}px`);
    equal(externalRequests.length, 0, `${scenario.id} must not attempt any external provider request: ${externalRequests.join("\n")}`);
    equal(await page.locator("vite-error-overlay").count(), 0, `${scenario.id} should not show a Vite error overlay`);
    equal(browserErrors.length, 0, browserErrors.join("\n"));

    const screenshotPath = path.join(ARTIFACT_DIR, `${scenario.viewport.width}x${scenario.viewport.height}-${scenario.theme}-${safeFilePart(scenario.id)}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return {
      scenarioId: scenario.id,
      fixtureKey: scenario.fixture?.key || null,
      theme: scenario.theme,
      section: scenario.section,
      route: scenario.section === "overview" ? "/bot" : `/bot/${scenario.section}`,
      viewport: scenario.viewport,
      screenshot: relativeArtifact(screenshotPath),
      pageHeight: metrics.scrollHeight,
      horizontalOverflow: metrics.scrollWidth - metrics.clientWidth,
      browserErrors: [],
      externalRequestCount: 0,
      ignoredNoticeCount: ignoredNotices.length,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  if (!LOOPBACK_HOSTS.has(APP_BASE_URL.hostname)) {
    throw new Error("Bot Operations browser QA may use betaLocalMode only against a loopback APP_URL.");
  }
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const fixtures = await loadFixtures();
  equal(fixtures.length, 27, "Bot Operations browser QA should cover all 27 deterministic Phase 2D-A fixtures");
  equal(new Set(fixtures.map(({ key }) => key)).size, fixtures.length, "Bot Operations fixture keys should be unique");
  equal(Object.keys(SECTION_BY_FIXTURE).length, fixtures.length, "every Bot Operations fixture should have an explicit UI section");

  const fixtureMap = new Map(fixtures.map((fixture) => [fixture.key, fixture]));
  const scenarios = [
    ...VIEWPORT_MATRIX.map((entry) => ({
      ...entry,
      fixture: entry.fixtureKey ? fixtureMap.get(entry.fixtureKey) : null,
      state: entry.fixtureKey ? fixtureMap.get(entry.fixtureKey)?.state : null,
    })),
    ...fixtures.map((fixture) => ({
      id: fixture.key,
      fixture,
      state: fixture.state,
      section: SECTION_BY_FIXTURE[fixture.key],
      theme: "light",
      viewport: MOBILE_VIEWPORT,
    })),
    ...fixtures.filter(({ key }) => REPRESENTATIVE_DARK.has(key)).map((fixture) => ({
      id: `${fixture.key}-dark`,
      fixture,
      state: fixture.state,
      section: SECTION_BY_FIXTURE[fixture.key],
      theme: "dark",
      viewport: MOBILE_VIEWPORT,
    })),
    { id: "profile-reference-mobile", fixture: fixtureMap.get("healthy-mock-bot"), state: fixtureMap.get("healthy-mock-bot").state, section: "profiles", theme: "light", viewport: MOBILE_VIEWPORT, expect: /Synthetic checkout profile[\s\S]*Account Ops profile/i },
    { id: "product-target-mobile", fixture: fixtureMap.get("healthy-mock-bot"), state: fixtureMap.get("healthy-mock-bot").state, section: "targets", theme: "dark", viewport: MOBILE_VIEWPORT, expect: /Synthetic Pok.mon product[\s\S]*SKU-TEST-001/i },
  ];

  ok(scenarios.every((scenario) => scenario.fixtureKey === null || Boolean(scenario.fixture)), "all viewport fixture references should resolve");
  const browser = await chromium.launch({ headless: true });
  const captures = [];
  try {
    for (const scenario of scenarios) captures.push(await inspectScenario(browser, scenario));
  } finally {
    await browser.close();
  }

  const manifest = {
    format: "code3-phase2da-bot-operations-qa",
    version: 1,
    createdAt: new Date().toISOString(),
    appUrl: APP_BASE_URL.origin,
    storageKey: STORAGE_KEY,
    fixtureCount: fixtures.length,
    scenarioCount: scenarios.length,
    captureCount: captures.length,
    assertions,
    notes: [
      "All owner QA uses only the existing loopback-only local development identity.",
      "Normal runtime was verified empty and disconnected; synthetic data was injected only through the local test fixture storage key.",
      "Every scenario blocks and reports external HTTP requests; no bot, retailer, proxy, mailbox, or provider network was contacted.",
      "Hayha and Stellar remained NOT_CONFIGURED, with no live control, checkout, Purchase, receiving, or inventory action.",
      "Mobile, larger-phone, tablet, desktop, light, dark, reduced-motion, 44px-target, and horizontal-overflow checks are included.",
    ],
    captures,
  };
  const manifestPath = path.join(ARTIFACT_DIR, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Code 3 Bot Operations browser QA passed: ${fixtures.length}/27 fixtures, ${captures.length} captures, ${assertions} assertions.`);
  console.log(`QA manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
