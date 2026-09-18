const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("@playwright/test");

const APP_BASE_URL = new URL(process.env.APP_URL || "http://127.0.0.1:5200/");
const STORAGE_KEY = "code3.account-ops.v1";
const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "qa", "code3-phase2a-account-ops", "current");
const DARK_FIXTURES = new Set([
  "empty-account-ops",
  "problem-account",
  "long-alias-mobile",
  "password-generation-workflow",
  "several-open-tasks",
]);

const SECTION_BY_FIXTURE = Object.freeze({
  "empty-account-ops": "overview",
  "healthy-profile-account": "overview",
  "multiple-retailers": "accounts",
  "alias-generated-not-provisioned": "emails",
  "alias-provisioned-metadata": "emails",
  "awaiting-email-verification": "accounts",
  "awaiting-phone-verification": "accounts",
  "ready-account": "accounts",
  "problem-account": "accounts",
  "missing-credential-reference": "accounts",
  "disabled-alias": "emails",
  "duplicate-conflict-warning": "accounts",
  "several-open-tasks": "tasks",
  "archived-account": "accounts",
  "long-alias-mobile": "emails",
  "password-generation-workflow": "accounts",
  "account-setup-workflow": "accounts",
  "search-filter-result": "profiles",
  "profile-many-accounts": "profiles",
  "retailer-many-profiles": "accounts",
});

const FOUNDATION_FIXTURES = Object.freeze([
  { id: "provider-not-configured", section: "connections", theme: "light", configurationState: "NOT_CONFIGURED" },
  { id: "trusted-preview-not-configured", section: "connections", theme: "light", configurationState: "NOT_CONFIGURED", hostedRuntimeVerified: true },
  { id: "provider-healthy-metadata", section: "connections", theme: "light", configurationState: "AVAILABLE", healthy: true },
  { id: "inbox-foundation", section: "inbox", theme: "light" },
  { id: "orders-foundation", section: "orders", theme: "light" },
  { id: "orders-foundation-dark", section: "orders", theme: "dark" },
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

function fixtureRoute(id) {
  const section = SECTION_BY_FIXTURE[id] || "overview";
  return section === "overview" ? "/account-ops" : `/account-ops/${section}`;
}

function appUrl(pathname, theme = "light") {
  const url = new URL(pathname, APP_BASE_URL);
  url.searchParams.set("betaLocalMode", "true");
  url.searchParams.set("themeInspect", theme);
  url.searchParams.set("phase2aQa", "true");
  return url.toString();
}

function relativeArtifact(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll("\\", "/");
}

async function loadFixtures() {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), "src", "features", "accountOps", "fixtures", "phase2aQaFixtures.js")).href;
  const fixtures = await import(moduleUrl);
  return fixtures.PHASE_2A_QA_FIXTURES.map(({ id, title }) => ({ id, title, state: fixtures.getPhase2aQaFixture(id).state }));
}

async function seedContext(context, state) {
  await context.addInitScript(({ storageKey, fixtureState }) => {
    localStorage.setItem(storageKey, JSON.stringify(fixtureState));
    Object.defineProperty(window, "open", {
      configurable: true,
      value: () => null,
    });
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

async function assertMinimumTarget(locator, label) {
  const box = await locator.boundingBox();
  ok(Boolean(box) && box.height >= 44 && box.width >= 44, `${label} should expose at least a 44px target`);
}

async function verifyFixtureScenario(page, fixture, consoleMessages) {
  const body = await page.locator("body").innerText();
  const section = SECTION_BY_FIXTURE[fixture.id];

  if (section !== "overview") {
    await page.getByRole("heading", { name: section === "accounts" ? "Store Accounts" : section[0].toUpperCase() + section.slice(1), exact: true }).waitFor();
  }

  switch (fixture.id) {
    case "empty-account-ops":
      match(body, /Store Accounts\s*0[\s\S]*Email Aliases\s*0[\s\S]*Tasks\s*0/, "empty overview should derive zero metrics");
      match(body, /No account issues need attention/i, "empty overview should use a compact success line");
      break;
    case "healthy-profile-account":
      match(body, /Store Accounts\s*1[\s\S]*Ready\s*1/, "healthy fixture should report one ready account");
      break;
    case "multiple-retailers":
      match(body, /Target/, "retailer-grouped accounts should show the preset retailer");
      match(body, /Local Card Shop With A Deliberately Long Name/, "retailer-grouped accounts should show the custom retailer");
      break;
    case "alias-generated-not-provisioned":
      match(body, /Generated Only[\s\S]*not claimed to be provisioned or receiving mail/i, "generated alias should not be represented as live");
      break;
    case "alias-provisioned-metadata":
      match(body, /Receiving Confirmed[\s\S]*valid receiving or provider evidence/i, "provisioned metadata should retain its evidence distinction");
      break;
    case "awaiting-email-verification":
      match(body, /Email verification[\s\S]*Pending/i, "email-verification attention should remain visible");
      break;
    case "awaiting-phone-verification":
      match(body, /Phone[\s\S]*Pending/i, "phone-verification attention should remain visible");
      break;
    case "ready-account":
      match(body, /Ready[\s\S]*Email verification[\s\S]*Verified/, "ready state should reflect owner-confirmed verification");
      break;
    case "problem-account":
      match(body, /Problem|Locked|Password reset/i, "problem health should be explicit and explainable");
      break;
    case "missing-credential-reference":
      match(body, /credential|password manager/i, "missing credential references should produce a visible reason");
      break;
    case "disabled-alias":
      match(body, /Disabled/i, "disabled aliases should retain their state");
      break;
    case "duplicate-conflict-warning": {
      match(body, /Problem[\s\S]*connected email address conflicts with another alias record/i, "duplicate aliases should surface an explainable Problem state");
      const conflictReason = page.getByRole("listitem").filter({ hasText: "The connected email address conflicts with another alias record." });
      ok(await conflictReason.count() >= 1, "duplicate alias conflict should be visible in the accessible account-health reason list");
      break;
    }
    case "several-open-tasks":
      ok(await page.getByRole("button", { name: "Complete", exact: true }).count() >= 3, "open tasks should expose owner-controlled completion actions");
      break;
    case "archived-account": {
      await page.locator(".account-ops-toolbar details > summary").click();
      await page.locator(".account-ops-filter-row select").first().selectOption("archived");
      await page.locator(".account-ops-card h3", { hasText: /^Business 01$/ }).first().waitFor();
      match(await page.locator("body").innerText(), /Archived/i, "archived accounts should remain discoverable through filters");
      break;
    }
    case "long-alias-mobile":
      match(body, /very-long-retailer-business-profile-reference-abcdefghijklmnop@example\.test/, "long aliases should remain readable rather than truncated data");
      break;
    case "password-generation-workflow": {
      await page.getByRole("button", { name: "Setup", exact: true }).first().click();
      const dialog = page.getByRole("dialog", { name: "Assisted account setup" });
      await dialog.waitFor();
      match(await dialog.innerText(), /never submits signup forms, bypasses CAPTCHA or OTP/i, "setup should disclose human verification boundaries");
      await dialog.getByRole("button", { name: "Generate Password", exact: true }).click();
      const output = dialog.getByLabel("Generated password");
      const secret = await output.innerText();
      ok(secret.length >= 16, "ephemeral generated passwords should have sufficient length");
      const persisted = await page.evaluate((key) => localStorage.getItem(key) || "", STORAGE_KEY);
      excludes(persisted, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "generated passwords must not enter Account Ops persistence");
      excludes(consoleMessages.join("\n"), new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "generated passwords must not be logged");
      break;
    }
    case "account-setup-workflow": {
      await page.getByRole("button", { name: "Setup", exact: true }).first().click();
      const dialog = page.getByRole("dialog", { name: "Assisted account setup" });
      await dialog.waitFor();
      match(await dialog.innerText(), /You complete signup and every verification step/i, "setup should remain owner-assisted");
      ok(await dialog.getByRole("checkbox").count() >= 6, "setup should expose the actual state checklist");
      ok(await dialog.getByRole("button", { name: "Open Legitimate Signup Page", exact: true }).isVisible(), "the legitimate retailer page action should stay explicit and owner-triggered");
      break;
    }
    case "search-filter-result": {
      const search = page.getByLabel("Search Profiles", { exact: true });
      await search.fill("Personal Search Match");
      await page.getByText("Personal Search Match", { exact: true }).first().waitFor();
      equal(await page.getByText("Business 01", { exact: true }).count(), 0, "search should narrow the visible profile results");
      break;
    }
    case "profile-many-accounts":
      match(body, /Retailer Accounts\s*12/, "profiles should summarize many linked retailer accounts without a squeezed table");
      break;
    case "retailer-many-profiles":
      ok(await page.locator(".account-ops-card").count() >= 12, "retailer group should handle many profiles at mobile width");
      break;
    default:
      throw new Error(`No browser expectations registered for ${fixture.id}`);
  }
}

async function inspectFixture(browser, fixture, theme, { scenario = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 1, colorScheme: theme });
  await seedContext(context, fixture.state);
  const page = await context.newPage();
  const browserErrors = [];
  const consoleMessages = [];
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(45000);
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("popup", (popup) => popup.close().catch(() => {}));
  page.on("console", (message) => {
    const text = message.text();
    consoleMessages.push(`${message.type()}: ${text}`);
    const sourceUrl = message.location()?.url || "";
    const expectedFrontendOnlyHealthCheck = /\/api\/ebay\/health(?:\?|$)/i.test(sourceUrl);
    if (message.type() === "error" && !expectedFrontendOnlyHealthCheck && !/favicon|ResizeObserver/i.test(text)) {
      browserErrors.push(`console: ${text}${sourceUrl ? ` (${sourceUrl})` : ""}`);
    }
  });
  page.on("dialog", (dialog) => dialog.accept());

  try {
    const route = fixtureRoute(fixture.id);
    await page.goto(appUrl(route, theme), { waitUntil: "domcontentloaded" });
    const root = page.getByTestId("account-ops");
    await root.waitFor();
    equal(await page.locator("html").getAttribute("data-theme"), theme, `${fixture.id} should render the requested ${theme} theme`);
    equal(await root.locator("h1", { hasText: /^Account Ops$/ }).count(), 1, "Account Ops should have one workspace content heading");
    await page.getByText("Local development identity", { exact: true }).waitFor();
    const nav = page.locator("nav[aria-label='Account Ops sections']");
    await nav.waitFor();
    await assertMinimumTarget(nav.getByRole("button", { name: "Overview", exact: true }), "Overview tab");
    const moreControl = nav.getByText("More", { exact: true });
    await assertMinimumTarget(moreControl, "More section control");
    await moreControl.click();
    const expandedNavText = await nav.innerText();
    match(expandedNavText, /Connections[\s\S]*Inbox[\s\S]*Orders/, "provider foundations should remain secondary Account Ops navigation");
    await moreControl.click();

    if (scenario) await verifyFixtureScenario(page, fixture, consoleMessages);
    const metrics = await assertNoHorizontalOverflow(page, `${fixture.id} (${theme}) at 360px`);
    excludes(await page.locator("body").innerText(), /\{\s*"(?:schemaVersion|profiles|storeAccounts)"/, "ordinary Account Ops UI should not expose raw JSON");
    equal(browserErrors.length, 0, browserErrors.join("\n"));

    const screenshotPath = path.join(ARTIFACT_DIR, `mobile-${theme}-${fixture.id}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return {
      fixtureId: fixture.id,
      title: fixture.title,
      theme,
      route,
      viewport: { width: 360, height: 800 },
      screenshot: relativeArtifact(screenshotPath),
      scrollWidth: metrics.scrollWidth,
      clientWidth: metrics.clientWidth,
      pageHeight: metrics.scrollHeight,
      horizontalOverflow: metrics.scrollWidth - metrics.clientWidth,
      browserErrors: [],
    };
  } finally {
    await context.close();
  }
}

async function inspectFoundation(browser, fixture, emptyState) {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 1, colorScheme: fixture.theme });
  await seedContext(context, emptyState);
  const page = await context.newPage();
  const browserErrors = [];
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(45000);
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|ResizeObserver/i.test(message.text())) browserErrors.push(`console: ${message.text()}`);
  });
  if (fixture.section === "connections") {
    await page.route("**/api/account-ops/provider-connections", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        configurationState: fixture.configurationState,
        connections: fixture.healthy ? [{
          connectionId: "connection:synthetic-qa-0001",
          provider: "gmail",
          connectedAccountLabel: "Synthetic QA mailbox",
          status: "HEALTHY",
          connectedAt: "2026-08-27T12:00:00.000Z",
          lastHealthyAt: "2026-08-27T14:00:00.000Z",
          grantedScopesSummary: ["Read-only order metadata"],
          capabilityFlags: { listBoundedMessageMetadata: true, sendMail: false },
        }] : [],
        providerCapabilities: [
          {
            providerId: "gmail",
            displayName: "Gmail",
            configurationStatus: "NOT_CONFIGURED",
            authorizationStatus: "UNAVAILABLE",
            capabilities: { connect: false, listBoundedMessageMetadata: false },
          },
          {
            providerId: "microsoft-outlook",
            displayName: "Outlook / Microsoft",
            configurationStatus: "NOT_CONFIGURED",
            authorizationStatus: "UNAVAILABLE",
            capabilities: { connect: false, listBoundedMessageMetadata: false },
          },
        ],
        warnings: fixture.healthy ? [] : ["No live provider is configured."],
        runtime: {
          available: fixture.configurationState === "AVAILABLE",
          hostedRuntimeVerified: fixture.hostedRuntimeVerified === true || fixture.configurationState === "AVAILABLE",
          serverExecutionVerified: fixture.hostedRuntimeVerified === true || fixture.configurationState === "AVAILABLE",
          authenticatedOwnerVerified: fixture.hostedRuntimeVerified === true || fixture.configurationState === "AVAILABLE",
          managedStorageVerified: fixture.hostedRuntimeVerified === true || fixture.configurationState === "AVAILABLE",
          trustedRuntimeProof: {
            proofVersion: "code3.preview-runtime-proof.v1",
            execution: "SERVER",
            environment: fixture.hostedRuntimeVerified === true || fixture.configurationState === "AVAILABLE" ? "PREVIEW" : "UNKNOWN",
            previewEnvironment: fixture.hostedRuntimeVerified === true || fixture.configurationState === "AVAILABLE",
            productionEnvironment: false,
            providerRuntimeLoaded: true,
            providerNetworkAccessEnabled: false,
            serverExecutionVerified: fixture.hostedRuntimeVerified === true || fixture.configurationState === "AVAILABLE",
            hostedRuntimeVerified: fixture.hostedRuntimeVerified === true || fixture.configurationState === "AVAILABLE",
          },
          oauthStateStorage: { available: false, kind: "UNAVAILABLE" },
          secretStorage: { available: false, kind: "UNAVAILABLE" },
        },
      }),
    }));
  }

  try {
    const route = `/account-ops/${fixture.section}`;
    await page.goto(appUrl(route, fixture.theme), { waitUntil: "domcontentloaded" });
    await page.getByTestId("account-ops").waitFor();
    const expectedHeading = fixture.section === "connections" ? "Provider Connections" : fixture.section === "inbox" ? "Inbox" : "Order Candidates";
    await page.getByRole("heading", { name: expectedHeading, exact: true }).waitFor();
    if (fixture.id === "provider-not-configured") await page.getByText("No mailbox connected", { exact: true }).waitFor();
    if (fixture.id === "trusted-preview-not-configured") await page.getByText("Trusted runtime", { exact: true }).waitFor();
    if (fixture.id === "provider-healthy-metadata") {
      await page.getByText("Synthetic QA mailbox", { exact: true }).waitFor();
      await page.getByText("Granted permission summary", { exact: true }).click();
    }
    const body = await page.locator("body").innerText();
    if (fixture.id === "provider-not-configured") match(body, /No mailbox connected[\s\S]*not configured/i, "unconfigured provider QA must remain honest");
    if (fixture.id === "trusted-preview-not-configured") match(body, /Trusted runtime[\s\S]*Available[\s\S]*Gmail[\s\S]*Not Configured[\s\S]*Outlook \/ Microsoft[\s\S]*Not Configured[\s\S]*No mailbox connected/i, "trusted Preview QA must remain separate from provider configuration");
    if (fixture.id === "provider-healthy-metadata") match(body, /Synthetic QA mailbox[\s\S]*Healthy[\s\S]*Read-only order metadata/i, "synthetic provider metadata should render without credential material");
    if (fixture.section === "inbox") match(body, /Code 3 is not reading a mailbox[\s\S]*No mailbox messages/i, "Inbox foundation must not claim live ingestion");
    if (fixture.section === "orders") match(body, /evidence, not a Business Purchase[\s\S]*No order candidates/i, "Order Candidate foundation must remain review-only");
    excludes(body, /access.?token|refresh.?token|client.?secret|\bOTP\s*[:=]|Import Purchase/i, "foundation QA must not expose secrets or Purchase mutation");
    const metrics = await assertNoHorizontalOverflow(page, `${fixture.id} (${fixture.theme}) at 360px`);
    equal(browserErrors.length, 0, browserErrors.join("\n"));
    const screenshotPath = path.join(ARTIFACT_DIR, `mobile-${fixture.theme}-${fixture.id}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return {
      fixtureId: fixture.id,
      title: expectedHeading,
      theme: fixture.theme,
      route,
      viewport: { width: 360, height: 800 },
      screenshot: relativeArtifact(screenshotPath),
      scrollWidth: metrics.scrollWidth,
      clientWidth: metrics.clientWidth,
      pageHeight: metrics.scrollHeight,
      horizontalOverflow: metrics.scrollWidth - metrics.clientWidth,
      browserErrors: [],
      syntheticProviderFixture: fixture.section === "connections",
    };
  } finally {
    await context.close();
  }
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const fixtures = await loadFixtures();
  equal(fixtures.length, 20, "the deterministic browser matrix should cover all 20 Phase 2A fixtures");
  const browser = await chromium.launch({ headless: true });
  const captures = [];

  try {
    for (const fixture of fixtures) captures.push(await inspectFixture(browser, fixture, "light"));
    for (const fixture of fixtures.filter(({ id }) => DARK_FIXTURES.has(id))) {
      captures.push(await inspectFixture(browser, fixture, "dark", { scenario: false }));
    }
    for (const fixture of FOUNDATION_FIXTURES) {
      captures.push(await inspectFoundation(browser, fixture, fixtures[0].state));
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    format: "code3-account-ops-qa",
    version: 1,
    createdAt: new Date().toISOString(),
    appUrl: APP_BASE_URL.origin,
    storageKey: STORAGE_KEY,
    fixtureCount: fixtures.length,
    captureCount: captures.length,
    assertions,
    notes: [
      "Generated passwords were verified as ephemeral and absent from local persistence and browser logs.",
      "Retailer signup windows were suppressed; the test performs no external account creation or verification.",
      "Generated aliases remain distinct from confirmed receiving/provisioned aliases.",
      "Provider, Inbox, and Order Candidate foundation captures use deterministic synthetic metadata only; no mailbox or provider was contacted.",
    ],
    captures,
  };
  const manifestPath = path.join(ARTIFACT_DIR, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Code 3 Account Ops browser QA passed: ${fixtures.length} fixtures, ${captures.length} captures, ${assertions} assertions.`);
  console.log(`QA manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
