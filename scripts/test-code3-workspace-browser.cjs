const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const APP_BASE_URL = new URL(process.env.APP_URL || "http://127.0.0.1:5200/");
const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "qa", "code3-phase2a5-workspaces", "current");
const APP_STORAGE_KEY = "et-tcg-beta-data";
const FLIP_SCOUT_STORAGE_KEY = "ember-and-tide.flip-scout.v1";
const WORKSPACE_PREFERENCE_KEY = "code3.workspace-preference.v1";
const ACCOUNT_OPS_STORAGE_KEY = "code3.account-ops.v1";
const FIXED_NOW = "2026-08-26T16:00:00.000Z";
const PUBLIC_WORKSPACES = ["Collect", "Find", "Sell", "Business"];
const OWNER_WORKSPACES = ["Collect", "Find", "Sell", "Bot", "Business"];
const REPRESENTATIVE_DARK = new Set([
  "collect-populated",
  "find-populated",
  "business-populated",
  "bot-owner-only",
]);

const FIXTURES = Object.freeze([
  { id: "collect-empty", route: "/collect" },
  { id: "collect-populated", route: "/collect", populated: true },
  { id: "find-empty", route: "/find/home" },
  { id: "find-populated", route: "/find/home", populated: true },
  { id: "sell-empty", route: "/sell/home" },
  { id: "sell-populated", route: "/sell/home", populated: true },
  { id: "business-empty", route: "/business" },
  { id: "business-populated", route: "/business", populated: true },
  { id: "bot-owner-only", route: "/bot" },
  { id: "workspace-switcher", route: "/find/home", openSwitcher: true },
  { id: "non-owner-workspace-list", route: "/", guest: true, openSwitcher: true },
  { id: "owner-workspace-list", route: "/", openSwitcher: true },
  { id: "deep-linked-auction", route: "/find/auctions", populated: true },
  { id: "deep-linked-account-ops", route: "/account-ops/accounts", guest: true },
  { id: "legacy-route-redirect", route: "/sell", populated: true },
  { id: "remembered-workspace", route: "/", preference: "SELL" },
  { id: "invalid-remembered-workspace", route: "/", invalidPreference: true },
  { id: "cross-workspace-action", route: "/find/home", populated: true },
  { id: "light-mobile", route: "/collect", populated: true },
  { id: "dark-mobile", route: "/find/home", populated: true, theme: "dark" },
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

function baseAppState(populated = false) {
  const common = {
    userType: "seller",
    dashboardPreset: "seller",
    activeWorkspaceId: "workspace-personal-local-beta",
    items: [],
    sales: [],
    expenses: [],
    mileageTrips: [],
  };
  if (!populated) return common;
  return {
    ...common,
    items: [
      {
        id: "owned-item-workspace-001",
        name: "Moonlit Dragon Card",
        ownedItemPurpose: "PERSONAL_COLLECTION",
        status: "Personal Collection",
        setName: "Twilight Set",
        quantity: 1,
        allocatedItemCost: 34,
        projectedResaleMid: 58,
        sourceDealId: "deal-workspace-001",
        purchaseId: "purchase-workspace-001",
        createdAt: "2026-08-24T14:00:00.000Z",
        updatedAt: FIXED_NOW,
      },
      {
        id: "owned-item-workspace-002",
        name: "Holo Starter Card",
        ownedItemPurpose: "FOR_RESALE",
        status: "Ready to list",
        quantity: 1,
        allocatedItemCost: 22,
        projectedResaleMid: 49,
        sourceDealId: "deal-workspace-001",
        purchaseId: "purchase-workspace-001",
        createdAt: "2026-08-25T14:00:00.000Z",
        updatedAt: FIXED_NOW,
      },
      {
        id: "owned-item-workspace-003",
        name: "Collector Tin",
        ownedItemPurpose: "FOR_RESALE",
        status: "Listed",
        quantity: 1,
        allocatedItemCost: 18,
        projectedResaleMid: 38,
        createdAt: "2026-08-23T14:00:00.000Z",
        updatedAt: FIXED_NOW,
      },
    ],
    sales: [{
      id: "sale-workspace-001",
      title: "Holo Starter Card",
      itemName: "Holo Starter Card",
      status: "Completed",
      saleDate: "2026-08-25",
      grossSalePrice: 49,
      netProceeds: 43,
      realizedProfit: 21,
      createdAt: "2026-08-25T18:00:00.000Z",
      updatedAt: FIXED_NOW,
    }],
    expenses: [{
      id: "expense-workspace-001",
      merchant: "Shipping Supply Co",
      category: "Packaging",
      amount: 7,
      date: "2026-08-25",
      receiptReference: "",
      createdAt: "2026-08-25T17:00:00.000Z",
      updatedAt: FIXED_NOW,
    }],
  };
}

function flipScoutState(populated = false) {
  const empty = {
    schemaVersion: 2,
    updatedAt: FIXED_NOW,
    deals: [],
    appraisals: [],
    auctions: [],
    searchRules: [],
    purchases: [],
    lots: [],
    costAllocations: [],
    inventory: [],
    sales: [],
    returns: [],
    expenses: [],
    mileage: [],
    activity: [],
    providerListings: [],
  };
  if (!populated) return empty;
  return {
    ...empty,
    deals: [{
      id: "deal-workspace-001",
      title: "Vintage binder opportunity",
      source: "Manual URL",
      marketplace: "Manual URL",
      status: "WATCH",
      askingPrice: 125,
      projectedProfit: 54,
      confidence: "MEDIUM",
      createdAt: "2026-08-25T15:00:00.000Z",
      updatedAt: FIXED_NOW,
    }],
    auctions: [{
      id: "lot-workspace-001",
      title: "Local card collection auction",
      source: "Owner-entered auction",
      status: "WATCHING",
      watchStatus: "Watching",
      outcome: "Pending",
      riskLevel: "Medium",
      currentBid: 80,
      maximumRecommendedBid: 132,
      endDateTime: "2026-08-27T18:00:00.000Z",
      createdAt: "2026-08-25T16:00:00.000Z",
      updatedAt: FIXED_NOW,
    }],
    purchases: [{
      id: "purchase-workspace-001",
      title: "Local collection purchase",
      source: "Local seller",
      status: "RECEIVED",
      totalPurchaseCost: 74,
      purchaseDate: "2026-08-25",
      createdAt: "2026-08-25T16:30:00.000Z",
      updatedAt: FIXED_NOW,
    }],
    lots: [{
      id: "purchase-lot-workspace-001",
      purchaseId: "purchase-workspace-001",
      title: "Card purchase lot",
      totalLotCost: 74,
      allocationMethod: "MANUAL",
      createdAt: "2026-08-25T16:35:00.000Z",
      updatedAt: FIXED_NOW,
    }],
    inventory: [{
      id: "inventory-workspace-001",
      purchaseId: "purchase-workspace-001",
      lotId: "purchase-lot-workspace-001",
      name: "Resale card group",
      ownedItemPurpose: "FOR_RESALE",
      status: "READY_TO_LIST",
      quantity: 2,
      allocatedItemCost: 54,
      projectedResaleMid: 110,
      createdAt: "2026-08-25T16:40:00.000Z",
      updatedAt: FIXED_NOW,
    }],
  };
}

function preferenceForFixture(fixture) {
  if (fixture.invalidPreference) {
    return {
      schemaVersion: 1,
      lastProductWorkspace: "OWNER",
      lastSelectedWorkspace: "BOT",
      ownerAuthorized: true,
      role: "OWNER",
      updatedAt: FIXED_NOW,
    };
  }
  if (!fixture.preference) return null;
  return {
    schemaVersion: 1,
    lastProductWorkspace: fixture.preference,
    lastSelectedWorkspace: fixture.preference,
    updatedAt: FIXED_NOW,
  };
}

function appUrl(pathname, theme = "light", owner = true) {
  const url = new URL(pathname, APP_BASE_URL);
  if (owner) url.searchParams.set("betaLocalMode", "true");
  url.searchParams.set("themeInspect", theme);
  url.searchParams.set("phase2a5Qa", "true");
  return url.toString();
}

function relativeArtifact(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll("\\", "/");
}

async function seedContext(context, fixture) {
  const appState = baseAppState(Boolean(fixture.populated));
  const sourceState = flipScoutState(Boolean(fixture.populated));
  const preference = preferenceForFixture(fixture);
  await context.addInitScript(({ appKey, sourceKey, preferenceKey, accountOpsKey, nextAppState, nextSourceState, nextPreference }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(appKey, JSON.stringify(nextAppState));
    localStorage.setItem(sourceKey, JSON.stringify(nextSourceState));
    if (nextPreference) localStorage.setItem(preferenceKey, JSON.stringify(nextPreference));
    window.__code3WorkspaceQa = { accountOpsReads: 0 };
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function getItem(key) {
      if (this === localStorage && key === accountOpsKey) window.__code3WorkspaceQa.accountOpsReads += 1;
      return originalGetItem.call(this, key);
    };
    Object.defineProperty(window, "open", { configurable: true, value: () => null });
  }, {
    appKey: APP_STORAGE_KEY,
    sourceKey: FLIP_SCOUT_STORAGE_KEY,
    preferenceKey: WORKSPACE_PREFERENCE_KEY,
    accountOpsKey: ACCOUNT_OPS_STORAGE_KEY,
    nextAppState: appState,
    nextSourceState: sourceState,
    nextPreference: preference,
  });
}

async function openGuestPreview(page, theme) {
  await page.goto(appUrl("/", theme, false), { waitUntil: "domcontentloaded" });
  const preview = page.getByRole("button", { name: "Preview the app", exact: true }).first();
  await preview.waitFor();
  await preview.click();
  await page.getByTestId("workspace-switcher").waitFor();
}

async function spaNavigate(page, pathname) {
  await page.evaluate((nextPath) => {
    history.pushState({ code3Qa: true }, "", `${nextPath}${location.search}`);
    dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  }, pathname);
  await page.waitForTimeout(250);
}

async function openSwitcher(page) {
  const switcher = page.getByTestId("workspace-switcher");
  await switcher.waitFor();
  const summary = switcher.locator("summary");
  if (!(await switcher.evaluate((node) => node.open))) await summary.click();
  await switcher.locator(".code3-workspace-switcher__menu").waitFor();
  return switcher;
}

async function switcherLabels(switcher) {
  return switcher.locator(".code3-workspace-switcher__menu > button strong").allInnerTexts();
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

async function assertMobileTargets(page, label) {
  const nav = page.getByRole("navigation", { name: "Primary navigation" }).filter({ visible: true });
  if (!(await nav.count())) return;
  const buttons = nav.getByRole("button");
  ok(await buttons.count() <= 5, `${label} should keep mobile navigation to five actions or fewer`);
  const boxes = await buttons.evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  ok(boxes.every((box) => box.width >= 44 && box.height >= 44), `${label} mobile navigation targets should be at least 44px`);
}

async function assertSwitcherContext(page, expected) {
  const summary = page.getByTestId("workspace-switcher").locator("summary");
  match(await summary.getAttribute("aria-label"), new RegExp(`^${expected}\\. Switch Code 3 workspace$`, "i"), `route should expose ${expected} workspace context`);
}

async function assertSwitcherList(page, expected, label) {
  const switcher = await openSwitcher(page);
  const labels = await switcherLabels(switcher);
  equal(labels.join("|"), expected.join("|"), `${label} workspace list`);
  excludes(labels.join(" "), /Owner Center/, "Owner Center must remain outside the product switcher");
  return switcher;
}

async function verifyFixture(page, fixture) {
  const body = () => page.locator("body").innerText();
  switch (fixture.id) {
    case "collect-empty":
      await page.getByTestId("collect-workspace-home").waitFor();
      match(await body(), /No cards in your collection yet/i, "Collect empty state should be honest");
      await assertSwitcherContext(page, "Collect");
      break;
    case "collect-populated":
      await page.getByTestId("collect-workspace-home").waitFor();
      match(await body(), /Items\s*1[\s\S]*Moonlit Dragon Card/i, "Collect populated state should use shared collection records");
      await page.getByRole("button", { name: "Sets", exact: true }).first().click();
      await page.getByRole("heading", { name: "Sets & Binders", exact: true }).waitFor();
      equal(new URL(page.url()).pathname, "/collection/sets", "Collect Sets action should update the visible route");
      await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: "Collection", exact: true }).click();
      await page.getByLabel("Search collection", { exact: true }).waitFor();
      equal(new URL(page.url()).pathname, "/collection", "Collection dock action should update the visible view and URL");
      await page.goBack();
      await page.getByRole("heading", { name: "Sets & Binders", exact: true }).waitFor();
      equal(new URL(page.url()).pathname, "/collection/sets", "browser Back should restore the Sets view");
      await page.goBack();
      await page.getByTestId("collect-workspace-home").waitFor();
      equal(new URL(page.url()).pathname, "/collect", "browser Back should return to Collect Home without a redirect loop");
      break;
    case "light-mobile":
      await page.getByTestId("collect-workspace-home").waitFor();
      match(await body(), /Items\s*1[\s\S]*Moonlit Dragon Card/i, "light mobile state should retain populated Collect content");
      break;
    case "find-empty":
      await page.getByTestId("find-workspace-home").waitFor();
      match(await body(), /No watched opportunities yet/i, "Find empty state should be honest");
      await assertSwitcherContext(page, "Find");
      break;
    case "find-populated":
    case "dark-mobile":
      await page.getByTestId("find-workspace-home").waitFor();
      match(await body(), /Watched\s*1[\s\S]*Active auctions\s*1/i, "Find populated state should derive real fixture counts");
      match(await body(), /Vintage binder opportunity|Local card collection auction/i, "Find populated state should show sourced records");
      break;
    case "sell-empty":
      await page.getByTestId("sell-workspace-home").waitFor();
      match(await body(), /No items ready to sell/i, "Sell empty state should be honest");
      await assertSwitcherContext(page, "Sell");
      break;
    case "sell-populated":
      await page.getByTestId("sell-workspace-home").waitFor();
      match(await body(), /Ready to list\s*1[\s\S]*Listed\s*1/i, "Sell populated state should derive resale workload");
      await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: "Inventory", exact: true }).click();
      await page.getByText("Current inventory", { exact: true }).waitFor();
      equal(new URL(page.url()).pathname, "/business/inventory", "Sell Inventory dock action should update the visible Business view and URL");
      await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: "Sales", exact: true }).click();
      await page.getByText("Recent sales", { exact: true }).waitFor();
      equal(new URL(page.url()).pathname, "/business/sales", "Sell Sales dock action should update the visible Business view and URL");
      await page.goBack();
      await page.getByText("Current inventory", { exact: true }).waitFor();
      equal(new URL(page.url()).pathname, "/business/inventory", "browser Back should restore the Inventory view");
      await page.goBack();
      await page.getByTestId("sell-workspace-home").waitFor();
      equal(new URL(page.url()).pathname, "/sell/home", "browser Back should return to Sell Home without a redirect loop");
      break;
    case "business-empty":
      await page.getByTestId("business-workspace").waitFor();
      match(await body(), /Purchases[\s\S]*Inventory[\s\S]*Sales[\s\S]*Money/i, "Business home should expose its four real destinations");
      excludes(await body(), /Needs Attention/i, "empty Business home should not invent attention records");
      await assertSwitcherContext(page, "Business");
      break;
    case "business-populated":
      await page.getByTestId("business-workspace").waitFor();
      match(await body(), /Needs Attention/i, "populated Business home should show derived attention");
      break;
    case "bot-owner-only":
      await page.getByTestId("bot-workspace-home").waitFor();
      match(await body(), /Owner only[\s\S]*No bot integrations are connected/i, "Bot should remain an honest owner-only foundation");
      excludes(await body(), /tasks completed|orders placed|checkout success/i, "Bot must not fabricate operational results");
      await assertSwitcherContext(page, "Bot");
      break;
    case "workspace-switcher":
      await page.getByTestId("find-workspace-home").waitFor();
      {
        const switcher = await assertSwitcherList(page, OWNER_WORKSPACES, "owner");
        await switcher.getByRole("button", { name: /^Find\b/ }).click();
        ok(await switcher.locator("summary").evaluate((node) => document.activeElement === node), "choosing the current workspace should return focus to the visible switcher control");
        equal(new URL(page.url()).pathname, "/find/home", "choosing the current workspace should preserve the current canonical home route");
      }
      break;
    case "owner-workspace-list":
      await assertSwitcherList(page, OWNER_WORKSPACES, "owner");
      break;
    case "non-owner-workspace-list": {
      await assertSwitcherList(page, PUBLIC_WORKSPACES, "non-owner");
      await spaNavigate(page, "/bot");
      await page.getByTestId("owner-workspace-access-state").waitFor();
      match(await body(), /Sign In Required|Owner Access Required/i, "direct Bot navigation must remain denied after logout/session downgrade");
      excludes(await body(), /\bBot\b/i, "denied direct navigation must not reveal the private workspace name");
      excludes(await body(), /Private route and authorization boundary/i, "denied Bot must not leak private capability content");
      await spaNavigate(page, "/");
      await assertSwitcherList(page, PUBLIC_WORKSPACES, "non-owner after denied direct Bot");
      break;
    }
    case "deep-linked-auction":
      await page.getByRole("heading", { name: "Auction Watch", exact: true }).waitFor();
      await assertSwitcherContext(page, "Find");
      equal(new URL(page.url()).pathname, "/find/auctions", "auction deep link should resolve to the implemented canonical Auctions surface");
      break;
    case "deep-linked-account-ops": {
      await page.locator(".account-ops--denied").waitFor();
      match(await body(), /Sign In Required|Owner Access Required/i, "Account Ops deep link should preserve its owner gate");
      await assertSwitcherContext(page, "Business");
      equal(await page.evaluate(() => window.__code3WorkspaceQa.accountOpsReads), 0, "Account Ops storage must not load before verified owner authorization");
      break;
    }
    case "legacy-route-redirect":
      await page.getByTestId("business-workspace").waitFor();
      equal(new URL(page.url()).pathname, "/business/sales", "legacy /sell should redirect to the canonical sales route");
      match(await body(), /Recent sales/i, "legacy redirect should resolve to a real page, not a blank surface");
      break;
    case "remembered-workspace": {
      const switcher = await openSwitcher(page);
      equal((await switcher.locator('button[aria-current="page"] strong').innerText()), "Sell", "safe remembered workspace should select Sell on a global route");
      break;
    }
    case "invalid-remembered-workspace": {
      const switcher = await openSwitcher(page);
      equal((await switcher.locator('button[aria-current="page"] strong').innerText()), "Collect", "invalid authority-bearing preference should fall back to Collect");
      excludes(await switcher.innerText(), /Owner Center/, "invalid preference must not expose Owner Center");
      break;
    }
    case "cross-workspace-action": {
      await page.getByTestId("find-workspace-home").waitFor();
      const before = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).deals.map((record) => record.id), FLIP_SCOUT_STORAGE_KEY);
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" }));
      const switcher = await openSwitcher(page);
      await switcher.getByRole("button", { name: /^Sell\b/ }).click();
      await page.getByTestId("sell-workspace-home").waitFor();
      equal(new URL(page.url()).pathname, "/sell/home", "workspace switch action should navigate directly to Sell Home without changing the shared workspaceHome tab");
      await page.waitForFunction(() => window.scrollY === 0 && document.activeElement?.matches("main.main"));
      equal(await page.evaluate(() => window.scrollY), 0, "same-tab workspace switching should reset scroll to the new workspace home");
      ok(await page.evaluate(() => document.activeElement?.matches("main.main")), "same-tab workspace switching should restore focus to the application main landmark");
      const after = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).deals.map((record) => record.id), FLIP_SCOUT_STORAGE_KEY);
      equal(after.join("|"), before.join("|"), "workspace switching must not clone or rewrite the source opportunity");
      const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), WORKSPACE_PREFERENCE_KEY);
      equal(stored.lastProductWorkspace, "SELL", "cross-workspace navigation should remember only the public product workspace");
      break;
    }
    default:
      throw new Error(`Missing workspace browser expectations for ${fixture.id}`);
  }
}

async function inspectFixture(browser, fixture, theme) {
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: theme,
    reducedMotion: "reduce",
  });
  await seedContext(context, fixture);
  const page = await context.newPage();
  const browserErrors = [];
  const ignoredNotices = [];
  page.setDefaultTimeout(25000);
  page.setDefaultNavigationTimeout(45000);
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("popup", (popup) => popup.close().catch(() => {}));
  page.on("dialog", (dialog) => dialog.accept());
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
    if (fixture.guest) {
      await openGuestPreview(page, theme);
      if (fixture.route !== "/") await spaNavigate(page, fixture.route);
    } else if (fixture.id === "legacy-route-redirect") {
      await page.goto(appUrl("/collect", theme), { waitUntil: "domcontentloaded" });
      await page.getByTestId("collect-workspace-home").waitFor();
      await page.goto(appUrl(fixture.route, theme), { waitUntil: "domcontentloaded" });
    } else {
      await page.goto(appUrl(fixture.route, theme), { waitUntil: "domcontentloaded" });
    }

    await page.getByTestId("workspace-switcher").waitFor();
    equal(await page.locator("html").getAttribute("data-theme"), theme, `${fixture.id} should render ${theme}`);
    await verifyFixture(page, fixture);
    if (fixture.openSwitcher && !(await page.getByTestId("workspace-switcher").evaluate((node) => node.open))) await openSwitcher(page);
    const metrics = await assertNoHorizontalOverflow(page, `${fixture.id} (${theme}) at 360px`);
    await assertMobileTargets(page, fixture.id);
    excludes(await page.locator("body").innerText(), /\{\s*"(?:schemaVersion|lastProductWorkspace|deals|items)"/, "ordinary workspace UI should not expose raw JSON");
    equal(await page.locator("vite-error-overlay").count(), 0, `${fixture.id} should not show a Vite error overlay`);
    equal(browserErrors.length, 0, browserErrors.join("\n"));

    const screenshotPath = path.join(ARTIFACT_DIR, `mobile-${theme}-${fixture.id}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return {
      fixtureId: fixture.id,
      theme,
      route: fixture.route,
      finalPath: new URL(page.url()).pathname,
      viewport: { width: 360, height: 800 },
      screenshot: relativeArtifact(screenshotPath),
      pageHeight: metrics.scrollHeight,
      horizontalOverflow: metrics.scrollWidth - metrics.clientWidth,
      browserErrors: [],
      ignoredNoticeCount: ignoredNotices.length,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  equal(FIXTURES.length, 20, "workspace browser QA should retain exactly 20 deterministic fixtures");
  equal(new Set(FIXTURES.map((fixture) => fixture.id)).size, 20, "workspace browser fixture ids should be unique");
  const browser = await chromium.launch({ headless: true });
  const captures = [];
  try {
    for (const fixture of FIXTURES) captures.push(await inspectFixture(browser, fixture, fixture.theme || "light"));
    for (const fixture of FIXTURES.filter(({ id }) => REPRESENTATIVE_DARK.has(id))) {
      captures.push(await inspectFixture(browser, fixture, "dark"));
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    format: "code3-phase2a5-workspace-qa",
    version: 1,
    createdAt: new Date().toISOString(),
    appUrl: APP_BASE_URL.origin,
    fixtureCount: FIXTURES.length,
    captureCount: captures.length,
    assertions,
    notes: [
      "All captures use 360x800 mobile viewports and reduced-motion mode.",
      "Owner fixtures use only the existing loopback-only local development identity; non-owner fixtures use the existing guest Preview action.",
      "Bot and Account Ops remained owner-gated, and the denied Account Ops deep link performed zero Account Ops storage reads.",
      "Workspace switching changed navigation preference only; the shared source opportunity retained its stable id.",
    ],
    captures,
  };
  const manifestPath = path.join(ARTIFACT_DIR, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Code 3 workspace browser QA passed: ${FIXTURES.length}/20 fixtures, ${captures.length} captures, ${assertions} assertions.`);
  console.log(`QA manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
