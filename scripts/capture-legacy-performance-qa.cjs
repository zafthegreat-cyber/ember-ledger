const path = require("node:path");
const fs = require("node:fs/promises");
const { chromium } = require("@playwright/test");

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4173";
const OUTPUT_DIR = path.join(process.cwd(), "artifacts", "qa", "legacy-route-performance-2026-08-14", "screenshots");

function qaState() {
  const now = new Date().toISOString();
  return {
    schemaVersion: 2, updatedAt: now,
    deals: [{ id: "qa-deal", marketplace: "Manual URL", source: "Manual URL", title: "QA binder opportunity", askingPrice: 145, purchaseShipping: 15, projectedResaleLow: 210, projectedResaleMid: 245, projectedResaleHigh: 280, projectedProfit: 52, projectedRoi: .32, confidence: "Medium", riskLevel: "Medium", status: "Needs Review", dataSourceExplanation: "Local visual QA record; not a live marketplace result.", createdAt: now, updatedAt: now }],
    appraisals: [],
    auctions: [{ id: "qa-auction", title: "QA local auction", source: "Manual auction", auctionType: "Local auction", currentBid: 80, myMaximumBid: 135, estimatedResaleMid: 240, riskLevel: "Medium", watchStatus: "Watching", endDateTime: new Date(Date.now() + 86400000).toISOString(), createdAt: now, updatedAt: now }],
    searchRules: [],
    purchases: [{ id: "qa-purchase", title: "QA collection purchase", source: "Local seller", purchaseDate: now.slice(0, 10), totalPurchaseCost: 120, createdAt: now, updatedAt: now }],
    lots: [],
    inventory: [{ id: "qa-item", purchaseId: "qa-purchase", name: "QA collection binder", quantity: 1, productClassification: "Binder or collection", ownedItemPurpose: "PERSONAL_COLLECTION", allocatedItemCost: 70, projectedResaleMid: 140, status: "In stock", purposeHistory: [], createdAt: now, updatedAt: now }],
    sales: [], expenses: [], mileage: [], providerListings: [],
    activity: [{ id: "qa-activity", title: "QA records prepared", detail: "Local screenshot fixture", createdAt: now }],
  };
}

async function newPage(browser, viewport, theme, state = qaState()) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: theme });
  await context.addInitScript(({ data, selectedTheme }) => {
    localStorage.setItem("ember-and-tide.flip-scout.v1", JSON.stringify(data));
    localStorage.setItem("et-tcg-app-theme", selectedTheme);
  }, { data: state, selectedTheme: theme });
  return { context, page: await context.newPage() };
}

async function load(page, route, theme, settle = 850) {
  const url = new URL(route, APP_URL);
  url.searchParams.set("betaLocalMode", "true");
  url.searchParams.set("themeInspect", theme);
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.locator("body").waitFor({ state: "visible" });
  await page.waitForTimeout(settle);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) throw new Error(`${route} overflows horizontally by ${overflow}px`);
}

async function capture(browser, viewport, theme, route, filename, prepare, state) {
  try { await fs.access(path.join(OUTPUT_DIR, filename)); return; } catch { /* capture missing artifact */ }
  const { context, page } = await newPage(browser, viewport, theme, state);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await load(page, route, theme);
    if (prepare) await prepare(page);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUTPUT_DIR, filename), fullPage: true });
    if (errors.length) throw new Error(`${filename}: ${errors.join(" | ")}`);
  } finally { await context.close(); }
}

async function openGlobalAdd(page) {
  const buttons = page.locator('button[aria-label="Open global Add menu"]');
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if (await button.isVisible()) { await button.click(); return; }
  }
  throw new Error("Global Add control unavailable");
}

async function clickUnique(page, role, name) {
  const target = page.getByRole(role, { name, exact: true });
  if (await target.count() !== 1) throw new Error(`Expected one ${role} named ${name}`);
  await target.click();
}

async function clickVisible(page, role, name, exact = true) {
  const targets = page.getByRole(role, { name, exact });
  const count = await targets.count();
  for (let index = 0; index < count; index += 1) {
    const target = targets.nth(index);
    if (await target.isVisible()) { await target.click(); return; }
  }
  throw new Error(`No visible ${role} named ${name}`);
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const routes = [
    ["home", "/"], ["find", "/find/deals"], ["collection", "/collection"], ["business", "/business"],
    ["owner-center", "/owner-center/overview"], ["deal-analysis", "/find/deal-analysis"],
    ["restocks", "/owner-center/restocks/live"],
  ];
  try {
    for (const [device, viewport] of [["mobile", { width: 360, height: 800 }], ["desktop", { width: 1440, height: 960 }]]) {
      for (const theme of ["light", "dark"]) {
        for (const [name, route] of routes) await capture(browser, viewport, theme, route, `${device}-${theme}-${name}.png`);
        await capture(browser, viewport, theme, "/", `${device}-${theme}-global-add.png`, openGlobalAdd);
      }
    }
    const mobile = { width: 360, height: 800 };
    await capture(browser, mobile, "light", "/find/deal-analysis", "mobile-light-long-guided-form.png");
    await capture(browser, mobile, "dark", "/collection", "mobile-dark-bottom-sheet.png", (page) => clickUnique(page, "button", "Search & Filters"));
    await capture(browser, mobile, "light", "/collection", "mobile-light-record-dialog.png", (page) => clickVisible(page, "button", "Add Collection Item", false));
    await capture(browser, mobile, "light", "/settings/help", "mobile-light-feedback-dialog-clean.png", (page) => clickVisible(page, "button", "Bug", false));
    await capture(browser, mobile, "dark", "/find/ebay", "mobile-dark-error-state.png", async (page) => {
      const refresh = page.getByRole("button", { name: "Check Connection", exact: false });
      if (await refresh.count() === 1) await refresh.click();
    });
    await capture(browser, mobile, "light", "/find/deals", "mobile-light-empty-state.png", null, { ...qaState(), deals: [], activity: [] });

    const loading = await newPage(browser, mobile, "dark");
    try {
      await loading.page.route(/AppraiserScreen-.*\.js/, async (route) => { await new Promise((resolve) => setTimeout(resolve, 2400)); await route.continue(); });
      await load(loading.page, "/find/deal-analysis", "dark", 300);
      await loading.page.screenshot({ path: path.join(OUTPUT_DIR, "mobile-dark-loading-state.png"), fullPage: true });
    } finally { await loading.context.close(); }
  } finally { await browser.close(); }
  console.log(`Captured legacy/performance QA screenshots in ${OUTPUT_DIR}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
