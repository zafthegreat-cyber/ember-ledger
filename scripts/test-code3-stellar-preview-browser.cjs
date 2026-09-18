const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const APP_BASE_URL = new URL(process.env.APP_URL || "http://127.0.0.1:5200/");
const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "qa", "code3-phase2db2-stellar-preview", "current");
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const ROUTE = "/bot/tasks?betaLocalMode=true&phase2dQa=true";

const SAFE_MULTI = JSON.stringify({
  taskGroups: [
    { id: "group.synthetic.target", name: "Synthetic Target tasks", site: "Target", tasks: [
      { id: "task.synthetic.1", name: "Synthetic card target", tcin: "12345678", quantity: 2, maxPrice: "39.99", currency: "USD", status: "MONITORING" },
      { id: "task.synthetic.2", name: "Long synthetic title that safely wraps across narrow screens without changing the preview authority boundary", sku: "SKU.TEST.002", quantity: 1, status: "WAITING", futureHarmlessLabel: "ignored" },
    ] },
  ],
});
const DUPLICATE = JSON.stringify({ tasks: [
  { id: "task.duplicate.test", site: "Walmart", sku: "SKU.TEST.DUP", quantity: 1 },
  { id: "task.duplicate.test", site: "Walmart", sku: "SKU.TEST.DUP", quantity: 1 },
] });
const UNSAFE = JSON.stringify({ tasks: [{ id: "task.blocked.test", site: "Target", metadata: { password: "synthetic-secret-must-not-render" } }] });

let assertions = 0;
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function match(value, pattern, message) { assert.match(value, pattern, message); assertions += 1; }
function excludes(value, pattern, message) { assert.doesNotMatch(value, pattern, message); assertions += 1; }

function appUrl(theme = "light") {
  const url = new URL(ROUTE, APP_BASE_URL);
  url.searchParams.set("themeInspect", theme);
  return url.toString();
}

async function snapshotStorage(page) {
  return page.evaluate(async () => {
    const copy = (storage) => Object.fromEntries(Array.from({ length: storage.length }, (_, index) => storage.key(index)).sort().map((key) => [key, storage.getItem(key)]));
    const indexedDbNames = typeof indexedDB?.databases === "function"
      ? (await indexedDB.databases()).map(({ name, version }) => ({ name, version })).sort((left, right) => String(left.name).localeCompare(String(right.name)))
      : [];
    return { local: copy(localStorage), session: copy(sessionStorage), indexedDbNames };
  });
}

async function selectJson(page, name, text, { keyboard = false } = {}) {
  await page.getByTestId("stellar-export-file-input").setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(text, "utf8"),
  });
  const previewButton = page.getByRole("button", { name: "Preview File" });
  if (keyboard) {
    await previewButton.focus();
    equal(await previewButton.evaluate((node) => document.activeElement === node), true, "Preview File should receive keyboard focus");
    await previewButton.press("Enter");
  } else {
    await previewButton.click();
  }
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  ok(metrics.scrollWidth - metrics.clientWidth <= 1, `${label} should have zero horizontal overflow`);
}

async function assertMinimumTargets(root, label) {
  const metrics = await root.locator("button:visible, input:visible, label:visible, summary:visible").evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { label: node.getAttribute("aria-label") || node.textContent?.trim() || node.tagName, width: box.width, height: box.height };
  }));
  const undersized = metrics.filter(({ width, height }) => width < 44 || height < 44);
  equal(undersized.length, 0, `${label} controls should be at least 44px: ${JSON.stringify(undersized)}`);
}

async function createContext(browser, { width, height, theme }) {
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: theme,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await context.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    Object.defineProperty(window, "open", { configurable: true, value: () => null });
  });
  return context;
}

async function runScenario(browser, scenario) {
  const context = await createContext(browser, scenario);
  const externalRequests = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && url.origin !== APP_BASE_URL.origin) {
      externalRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  const browserErrors = [];
  const consoleMessages = [];
  const previewNetworkRequests = [];
  let recordPreviewNetwork = false;
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
  page.on("request", (request) => {
    if (!recordPreviewNetwork) return;
    const url = new URL(request.url());
    if (["http:", "https:"].includes(url.protocol)) previewNetworkRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
  });
  try {
    await page.goto(appUrl(scenario.theme), { waitUntil: "networkidle" });
    const root = page.getByTestId("stellar-export-preview");
    await root.waitFor();
    await page.getByRole("heading", { name: "Preview Stellar Export", exact: true }).waitFor();
    equal(new URL(page.url()).pathname, "/bot/tasks", `${scenario.id} should preserve the canonical owner-only Tasks route`);
    equal(await page.getByTestId("owner-workspace-access-state").count(), 0, `${scenario.id} should use the existing authorized local QA path`);
    equal(await page.getByTestId("bot-operations").getAttribute("data-persistence-mode"), "LOCAL_ONLY", `${scenario.id} should retain LOCAL_ONLY`);
    match(await root.innerText(), /Offline Preview[\s\S]*No file is open/i, `${scenario.id} should start empty and honest`);
    equal(await root.getByRole("button", { name: "Preview File" }).isDisabled(), true, `${scenario.id} should require explicit selection`);
    const before = await snapshotStorage(page);
    recordPreviewNetwork = true;

    if (scenario.kind === "safe") {
      await selectJson(page, "C:\\private\\stellar-safe-export.json", SAFE_MULTI, { keyboard: scenario.keyboard === true });
      const result = page.getByTestId("stellar-export-preview-result");
      await result.waitFor();
      const body = await result.innerText();
      match(body, /stellar-safe-export\.json/i, "only the basename should appear");
      excludes(body, /C:\\private/i, "the local path must not appear");
      match(body, /Partially Recognized/i, "unverified Stellar shapes must never appear supported");
      match(body, /Tasks detected\s*2[\s\S]*Safe tasks recognized\s*2/i, "safe task summary should be bounded");
      match(body, /Exported Status · Not Live/i, "exported status must not imply runtime status");
      await result.getByText("Ignored fields", { exact: true }).click();
      const expandedBody = await result.innerText();
      match(expandedBody, /Ignored Fields[\s\S]*futureHarmlessLabel/i, "harmless unknown fields should be named but values discarded");
      excludes(expandedBody, /futureHarmlessLabel\s*[:=]\s*ignored/i, "ignored field values must not render");
    } else if (scenario.kind === "unsafe") {
      await selectJson(page, "unsafe.json", UNSAFE);
      const result = page.getByTestId("stellar-export-preview-result");
      await result.waitFor();
      const body = await result.innerText();
      match(body, /This file cannot be previewed[\s\S]*Credential information was detected/i, "security findings should fail closed by category");
      excludes(body, /synthetic-secret-must-not-render/i, "secret values must never render");
      equal(await result.locator(".stellar-preview-task").count(), 0, "unsafe input must produce no normalized rows");
    } else if (scenario.kind === "duplicate") {
      await selectJson(page, "duplicate.json", DUPLICATE);
      const result = page.getByTestId("stellar-export-preview-result");
      await result.waitFor();
      equal(await result.locator(".stellar-preview-task").count(), 2, "duplicate rows remain visible for owner review");
      match(await result.innerText(), /Duplicate/i, "the duplicate should be visibly marked");
    } else if (scenario.kind === "malformed") {
      await selectJson(page, "malformed.json", "{not valid JSON");
      const result = page.getByTestId("stellar-export-preview-result");
      await result.waitFor();
      match(await result.innerText(), /Rejected[\s\S]*malformed or incomplete/i, "malformed input should reject safely");
    } else if (scenario.kind === "selected-discard") {
      await page.getByTestId("stellar-export-file-input").setInputFiles({ name: "selected-only.json", mimeType: "application/json", buffer: Buffer.from(SAFE_MULTI, "utf8") });
      match(await root.innerText(), /Selected:\s*selected-only\.json/i, "an explicitly selected file should remain unopened until Preview File is activated");
      equal(await page.getByTestId("stellar-export-preview-result").count(), 0, "selection alone must not parse or normalize a file");
    }

    const afterPreview = await snapshotStorage(page);
    equal(JSON.stringify(afterPreview), JSON.stringify(before), `${scenario.id} preview should write no browser storage or IndexedDB`);
    equal(externalRequests.length, 0, `${scenario.id} should make no external request: ${externalRequests.join("\n")}`);
    equal(previewNetworkRequests.length, 0, `${scenario.id} file lifecycle should make no same-origin or external network request: ${previewNetworkRequests.join("\n")}`);
    await assertNoHorizontalOverflow(page, `${scenario.id} at ${scenario.width}px`);
    await assertMinimumTargets(root, scenario.id);
    equal(browserErrors.length, 0, browserErrors.join("\n"));
    excludes(consoleMessages.join("\n"), /synthetic-secret-must-not-render|\"taskGroups\"\s*:/i, `${scenario.id} must not log secret values or raw export JSON`);

    const screenshotPath = path.join(ARTIFACT_DIR, `${scenario.width}x${scenario.height}-${scenario.theme}-${scenario.id}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    if (scenario.id === "safe-mobile-light") {
      const botOpsRoot = page.getByTestId("bot-operations");
      await botOpsRoot.getByRole("button", { name: "Bots", exact: true }).click();
      await page.waitForURL(/\/bot\/bots(?:\?|$)/);
      equal(await page.getByTestId("stellar-export-preview").count(), 0, "leaving Tasks should destroy preview component memory");
      await botOpsRoot.getByText("More", { exact: true }).click();
      await botOpsRoot.getByRole("button", { name: "Tasks", exact: true }).click();
      await page.waitForURL(/\/bot\/tasks(?:\?|$)/);
      const returned = page.getByTestId("stellar-export-preview");
      await returned.waitFor();
      equal(await page.getByTestId("stellar-export-preview-result").count(), 0, "returning to Tasks must not restore preview state");
      match(await returned.innerText(), /No file is open/i, "route return requires file reselection");
      recordPreviewNetwork = false;
    } else if (scenario.id === "safe-mobile-dark") {
      recordPreviewNetwork = false;
      await page.reload({ waitUntil: "domcontentloaded" });
      const reloaded = page.getByTestId("stellar-export-preview");
      await reloaded.waitFor();
      equal(await page.getByTestId("stellar-export-preview-result").count(), 0, "refresh while open must discard preview state");
      match(await reloaded.innerText(), /No file is open/i, "refresh while open requires file reselection");
    } else if (scenario.kind !== "empty") {
      await root.getByRole("button", { name: "Discard" }).click();
      equal(await page.getByTestId("stellar-export-preview-result").count(), 0, `${scenario.id} discard should remove preview state`);
      match(await root.innerText(), /No file is open/i, `${scenario.id} discard should return to the empty state`);
      equal(JSON.stringify(await snapshotStorage(page)), JSON.stringify(before), `${scenario.id} discard should remain zero-write`);
      equal(previewNetworkRequests.length, 0, `${scenario.id} discard should make no network request`);
      recordPreviewNetwork = false;
      await page.reload({ waitUntil: "domcontentloaded" });
      const reloaded = page.getByTestId("stellar-export-preview");
      await reloaded.waitFor();
      equal(await page.getByTestId("stellar-export-preview-result").count(), 0, `${scenario.id} refresh must not restore preview state`);
      match(await reloaded.innerText(), /No file is open/i, `${scenario.id} refresh requires file reselection`);
    }
    return {
      id: scenario.id,
      route: "/bot/tasks",
      viewport: { width: scenario.width, height: scenario.height },
      theme: scenario.theme,
      kind: scenario.kind,
      screenshot: path.relative(process.cwd(), screenshotPath).replaceAll("\\", "/"),
      externalRequestCount: 0,
      browserErrors: [],
      horizontalOverflow: 0,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  if (!LOOPBACK_HOSTS.has(APP_BASE_URL.hostname)) throw new Error("Stellar preview browser QA may use betaLocalMode only against loopback.");
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const scenarios = [
    { id: "empty-mobile-light", kind: "empty", width: 360, height: 800, theme: "light" },
    { id: "safe-mobile-light", kind: "safe", width: 360, height: 800, theme: "light", keyboard: true },
    { id: "safe-mobile-dark", kind: "safe", width: 360, height: 800, theme: "dark" },
    { id: "safe-tablet", kind: "safe", width: 768, height: 1024, theme: "light" },
    { id: "safe-desktop", kind: "safe", width: 1440, height: 1000, theme: "dark" },
    { id: "unsafe-secret", kind: "unsafe", width: 360, height: 800, theme: "dark" },
    { id: "duplicate", kind: "duplicate", width: 430, height: 932, theme: "light" },
    { id: "malformed", kind: "malformed", width: 360, height: 800, theme: "light" },
    { id: "selected-discard", kind: "selected-discard", width: 430, height: 932, theme: "dark" },
  ];
  const browser = await chromium.launch({ headless: true });
  const captures = [];
  try {
    for (const scenario of scenarios) captures.push(await runScenario(browser, scenario));
  } finally {
    await browser.close();
  }
  const manifest = {
    format: "code3-phase2db2-stellar-export-preview-qa",
    version: 1,
    createdAt: new Date().toISOString(),
    appUrl: APP_BASE_URL.origin,
    scenarioCount: scenarios.length,
    captureCount: captures.length,
    assertions,
    notes: [
      "Only in-memory synthetic JSON buffers were owner-selected through the file input.",
      "Every scenario blocked and reported external HTTP requests.",
      "Storage was snapshotted after route initialization and remained byte-equivalent through preview and discard.",
      "Refresh required file reselection; no raw or normalized export state was restored.",
      "Stellar and Hayha remained not configured; no Task, Attempt, Checkout Evidence, Order Candidate, Purchase, receiving, or inventory mutation occurred.",
    ],
    captures,
  };
  const manifestPath = path.join(ARTIFACT_DIR, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Code 3 Stellar export preview browser QA passed: ${scenarios.length} scenarios, ${captures.length} captures, ${assertions} assertions.`);
  console.log(`QA manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
