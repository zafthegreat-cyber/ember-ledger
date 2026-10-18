const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5242").origin;
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname), "Synthetic test must stay on loopback");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/adaptive-restock-home");
fs.mkdirSync(output, { recursive: true });
const fixturePath = path.join(output, "fixture.html");
const fixtureRelativePath = path.relative(process.cwd(), fixturePath).replaceAll(path.sep, "/");
fs.writeFileSync(fixturePath, `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Synthetic adaptive Home fixture</title></head><body><div id="root"></div><script type="module">
import React from "react";
import { createRoot } from "react-dom/client";
import "/src/index.css";
import "/src/App.css";
import Home from "/src/pages/OperationsHome.jsx";
import Add from "/src/features/deferredViews/AddAnythingContent.jsx";
import Forge from "/src/pages/Forge.jsx";
import { AppNavIcon } from "/src/components/command-system/AppNavIcon.jsx";
import { createEmptyFlipScoutState, FLIP_SCOUT_STORAGE_KEY } from "/src/features/flipScout/constants.js";
import { selectOwnAdaptiveReports } from "/src/utils/adaptivePageItems.js";
import { resolveExperiencePresentation } from "/src/utils/experiencePresentation.js";
const h = React.createElement; const root = createRoot(document.getElementById("root")); let revision = 0;
window.qaCalls = [];
window.qaRender = ({ screen = "home", theme = "dark", props = {}, repository = {}, reports } = {}) => {
  revision += 1; window.qaCalls = [];
  const call = (...args) => window.qaCalls.push(args);
  localStorage.setItem(FLIP_SCOUT_STORAGE_KEY, JSON.stringify({ ...createEmptyFlipScoutState(), ...repository }));
  const activity = { ...props.adaptiveActivity };
  props = { ...props, experiencePresentation: resolveExperiencePresentation({ personaPreference: props.persona || "collector" }), onOpenSellTrade: () => call("sell-trade"), onOpenExperienceSettings: () => call("customize") };
  if (reports) activity.reports = selectOwnAdaptiveReports(reports, { userIds: ["qa-account"], email: "qa@example.test" });
  const child = screen === "trade" ? h(Forge, { ...props, setActiveTab: value => call("navigate", value), openTradeCompassFlow: value => call("trade", value), openMarketplaceCreate: (...args) => call("listing", ...args), editMarketplaceListing: value => call("edit-listing", value.id), openExchangeSection: value => call("exchange", value), renderMarketplaceSection: () => h("p", {}, "Existing listing workflow"), openProductAddFlow: value => call("product", value), setForgeSubTab: value => call("forge", value) }) : screen === "home" ? h(Home, { ...props, adaptiveActivity: activity, setActiveTab: value => call("navigate", value), onOpenBusiness: value => call("business", value), onOpenFind: (...args) => call("find", ...args), onReportRestock: () => call("report"), onOpenRestockReports: () => call("browse") }) : h("div", { className: "flow-modal", "data-flow": "addActionSheet", role: "dialog", "aria-label": "Add" },
    h("div", { className: "modal-title-row" }, h("h2", {}, "Add"), h("button", { className: "modal-close-button", "aria-label": "Close", onClick: () => call("close") }, "×")),
    h("div", { className: "flow-modal-body" }, h(Add, { scope: { ...props, adaptiveActivity: activity, quickAddWizard: { screen: "entry" }, quickAddSellerToolsEnabled: () => Boolean(props.seller), ownerFeatureControls: { kidsCommunity: Boolean(props.kids) }, getCatalogPickerResults: () => [], CommandGlyphIcon: ({seed}) => h(AppNavIcon, { kind: seed }), OWNED_ITEM_PURPOSES: { PERSONAL_COLLECTION: "PERSONAL_COLLECTION", FOR_RESALE: "FOR_RESALE" }, runAddSheetAction: value => call("add", value), closeFlowModal: () => call("close"), openFlipScoutView: (...args) => call("find", ...args), openProductAddFlow: value => call("product", value), openSparkKidPackFlow: value => call("pack", value), setQuickAddPath: value => call("path", value) } })));
  root.render(h("div", { key: revision, className: "app app-command-shell", "data-theme": theme, style: { padding: "16px", minHeight: "100dvh" } }, child));
};
window.qaReady = true;
</script></body></html>`);

const requestedWidths = process.env.QA_ADAPTIVE_WIDTHS?.split(",").map(Number);
const restockEntryOnly = process.env.QA_RESTOCK_ENTRY_ONLY === "1";
const componentsOnly = process.env.QA_COMPONENTS_ONLY === "1";
const cases = restockEntryOnly ? [{ width: 320, height: 568, theme: "dark" }, { width: 390, height: 844, theme: "dark" }, { width: 1440, height: 900, theme: "light" }] : [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]
  .flatMap(viewport => ["light", "dark"].map(theme => ({ ...viewport, theme })))
  .filter(item => !requestedWidths || requestedWidths.includes(item.width));
const now = new Date().toISOString();
const records = (prefix, count = 1) => Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`, createdAt: now }));
const defaultHomeKeys = ["scoutSignals", "vaultSnapshot", "marketWatch", "forgeSummary"];
const primaryAdd = page => page.locator(".add-anything-entry > .add-anything-option-grid > button strong");
const homeKeys = page => page.locator("[data-home-card]").evaluateAll(rows => rows.map(row => row.dataset.homeCard));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = []; let lastPage; let step = "start";
  try {
    for (const testCase of cases) {
      const { width, height, theme } = testCase;
      const prefix = `${width}-${theme}`;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
      const writes = []; const external = []; const errors = [];
      await context.route("**/*", route => {
        const request = route.request(); const url = new URL(request.url());
        if (request.method() !== "GET") { writes.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
        if (url.origin !== base) { external.push(`${url.origin}${url.pathname}`); return route.abort(); }
        if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: '{"configured":false}' });
        return route.continue();
      });
      await context.addInitScript(({ theme, now }) => {
        if (localStorage.getItem("__qa_adaptive_seeded")) return;
        localStorage.setItem("__qa_adaptive_seeded", "true"); localStorage.setItem("et-tcg-app-theme", theme);
        localStorage.setItem("et-tcg-beta-data", JSON.stringify({ items: [{ id: "qa-preserved", name: "Synthetic preserved card", quantity: 2 }], sales: [], expenses: [] }));
        localStorage.setItem("et-tcg-beta-scout", JSON.stringify({ stores: [{ id: "qa-adaptive-store", name: "QA Corner Store", chain: "Local Card Shops", city: "Suffolk", region: "Hampton Roads", state: "VA", zip: "23435", address: "1 Synthetic Lane" }], reports: [{ id: "qa-preserved-restock", reportId: "qa-preserved-restock", storeId: "qa-adaptive-store", storeName: "QA Corner Store", userId: "qa-account", reportType: "Store Restock Report", stockStatus: "in_stock", visibility: "public", status: "active", productName: "Synthetic collector packs", itemName: "Synthetic collector packs", items: [{ productName: "Synthetic collector packs" }], reportDate: now.slice(0, 10), reportTime: "12:00", observedAt: now, createdAt: now, sourceType: "manual", note: "Synthetic report retained for QA" }] }));
      }, { theme, now });
      const page = await context.newPage(); lastPage = page; page.on("pageerror", error => errors.push(error.message));
      if (!componentsOnly) {
      step = `${prefix}: direct Find restocks report, community browse and Back`;
      await page.goto(`${base}/find/restocks?betaLocalMode=true`);
      const restocks = page.locator(".restock-start");
      await expect(restocks.getByRole("heading", { name: "Restocks", exact: true })).toBeVisible({ timeout: 30000 });
      assert.equal(new URL(page.url()).pathname, "/find/restocks");
      const originalRestockData = await page.evaluate(() => { const value = JSON.parse(localStorage.getItem("et-tcg-beta-data")); return JSON.stringify([value.items, value.sales, value.expenses]); });
      const originalScoutReports = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("et-tcg-beta-scout")).reports));
      const directReport = restocks.getByRole("button", { name: "Report a restock", exact: true });
      await expect(directReport).toBeEnabled();
      await directReport.click();
      const reportModal = page.locator('.flow-modal[data-flow="scoutSubmit"]');
      await expect(reportModal).toBeVisible();
      await expect(reportModal.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
      await page.keyboard.press("Escape"); await expect(reportModal).toHaveCount(0);
      await expect(restocks).toBeVisible();
      await page.screenshot({ path: path.join(output, `${prefix}-actual-find-restocks.png`), fullPage: true });
      await restocks.getByRole("button", { name: "Browse reports", exact: true }).click();
      await expect(page).toHaveURL(/\/scout\/reports(?:\?|$)/);
      const reportFeed = page.getByRole("heading", { name: "Recent restock reports", exact: true });
      await expect(reportFeed).toBeVisible({ timeout: 20000 });
      const preservedReport = page.locator(".scout-reports-landing__feed .scout-page-report-card").filter({ has: page.getByRole("heading", { name: "QA Corner Store", exact: true }) });
      await expect(preservedReport).toHaveCount(1); await expect(preservedReport).toContainText("Synthetic collector packs");
      const textGroups = await preservedReport.evaluate(element => [".scout-report-human-summary", ".scout-report-meta", ".scout-signal-badge-row"].map(selector => ({ selector, children: [...element.querySelector(selector).children].map(node => { const rect = node.getBoundingClientRect(); return { text: node.textContent, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }; }) })));
      for (const group of textGroups) {
        for (let index = 1; index < group.children.length; index += 1) {
          const before = group.children[index - 1]; const current = group.children[index];
          assert.ok(current.left - before.right >= 3 || current.top - before.bottom >= 3 || before.left - current.right >= 3, `${group.selector}: adjacent report text has readable separation (${before.text} / ${current.text})`);
        }
      }
      const moreBox = await preservedReport.getByRole("button", { name: "More actions", exact: true }).boundingBox();
      assert.ok(moreBox.width >= 44 && moreBox.height >= 44, "Saved report More action has a 44px touch target");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Community report feed has no horizontal overflow");
      await expect(page.getByRole("heading", { name: "Submit Store Report", exact: true })).toHaveCount(0);
      await expect(page.locator('.flow-modal[data-flow="scoutSubmit"]')).toHaveCount(0);
      await expect(page.getByText("Owner Access Required", { exact: true })).toHaveCount(0);
      await page.reload(); await expect(reportFeed).toBeVisible({ timeout: 20000 });
      await expect(preservedReport).toHaveCount(1); await expect(preservedReport).toContainText("Synthetic collector packs");
      assert.equal(new URL(page.url()).pathname, "/scout/reports", "Refresh preserves the community report feed route");
      await expect(page.getByRole("heading", { name: "Submit Store Report", exact: true })).toHaveCount(0);
      await preservedReport.getByRole("button", { name: "View details", exact: true }).click();
      const savedReportDetail = page.locator(".scout-report-detail-sheet");
      await expect(savedReportDetail).toBeVisible(); await expect(savedReportDetail).toContainText("Synthetic collector packs");
      await savedReportDetail.getByRole("button", { name: "Close report details", exact: true }).click();
      await expect(savedReportDetail).toHaveCount(0); await expect(reportFeed).toBeVisible();
      await preservedReport.getByRole("button", { name: "More actions", exact: true }).click();
      await preservedReport.getByRole("menuitem", { name: "Add details", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Submit Store Report", exact: true })).toBeVisible();
      await expect(page.getByText("Editing mode is open in the report form above.", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Cancel / Clear", exact: true }).click();
      await expect(reportFeed).toBeVisible(); await expect(preservedReport).toContainText("Synthetic collector packs");
      await page.getByRole("button", { name: "Report a restock", exact: true }).click();
      await expect(reportModal).toBeVisible();
      await page.goBack(); await expect(reportModal).toHaveCount(0); await expect(reportFeed).toBeVisible();
      await page.screenshot({ path: path.join(output, `${prefix}-actual-community-reports.png`), fullPage: true });
      await page.goBack(); await expect(restocks).toBeVisible();
      assert.equal(new URL(page.url()).pathname, "/find/restocks", "Back returns to the originating Restocks page");
      const afterRestockData = await page.evaluate(() => { const value = JSON.parse(localStorage.getItem("et-tcg-beta-data")); return JSON.stringify([value.items, value.sales, value.expenses]); });
      assert.equal(afterRestockData, originalRestockData, "Direct report/browse/Back keeps original records");
      assert.equal(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("et-tcg-beta-scout")).reports)), originalScoutReports, "Existing saved report bytes stay unchanged through browse, refresh, report cancellation and Back");
      if (restockEntryOnly) {
        assert.deepEqual(writes, [], "No network mutation was attempted"); assert.deepEqual(errors, [], "No browser runtime errors");
        results.push({ ...testCase, directFindRestocksReport: true, browseCommunityReports: true, feedRefreshPreserved: true, feedReportUsesModal: true, savedReportVisible: "qa-preserved-restock", reportTextSeparated: true, moreActionTouchTarget: moreBox, savedReportViewAndEditPreserved: true, modalBackClosesFirst: true, backToRestocks: true, savedDataUnchanged: true, writes, external, errors });
        console.log(`PASS ${prefix}: /find/restocks opens the normal report form; Browse and refresh show the community feed; feed reporting opens the modal; Back returns; records unchanged.`);
        await context.close(); continue;
      }
      step = `${prefix}: actual app Home and Add report entry`;
      await page.goto(`${base}/?betaLocalMode=true`);
      await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible({ timeout: 30000 });
      const original = await page.evaluate(() => { const value = JSON.parse(localStorage.getItem("et-tcg-beta-data")); return JSON.stringify([value.items, value.sales, value.expenses]); });
      const navigation = async () => page.locator("nav").filter({ visible: true }).evaluateAll(nodes => nodes.map(node => node.textContent));
      const initialNavigation = await navigation();
      const report = page.getByRole("button", { name: "Report a restock", exact: true });
      await expect(report).toBeVisible();
      const reportBox = await report.boundingBox(); assert.ok(reportBox.width >= 44 && reportBox.height >= 44, "Home report touch target is at least 44px");
      await expect(report).toBeInViewport({ ratio: 1 });
      const mobileNav = page.locator(".ops-mobile-nav").filter({ visible: true });
      if (await mobileNav.count()) {
        const navBox = await mobileNav.boundingBox();
        assert.ok(reportBox.y + reportBox.height <= navBox.y, "The initial Report action is fully above the mobile navigation without scrolling");
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Actual Home has no horizontal overflow");
      await page.screenshot({ path: path.join(output, `${prefix}-actual-home.png`), fullPage: true });
      await report.click(); await expect(page.locator('.flow-modal[data-flow="scoutSubmit"]')).toBeVisible();
      await page.keyboard.press("Escape"); await expect(page.locator('.flow-modal[data-flow="scoutSubmit"]')).toHaveCount(0);
      const opener = page.getByRole("button", { name: "Open global Add menu", exact: true }).filter({ visible: true }).first();
      await opener.click(); const modal = page.locator('.flow-modal[data-flow="addActionSheet"]'); await expect(modal).toBeVisible();
      const addReport = modal.getByRole("button", { name: /^Report a restock\./ }); await expect(addReport).toBeVisible();
      assert.equal(await modal.locator(".add-anything-entry button").first().getAttribute("aria-label"), "Report a restock. Share what you saw at a store.");
      await page.screenshot({ path: path.join(output, `${prefix}-actual-add.png`) });
      await addReport.click(); await expect(page.locator('.flow-modal[data-flow="scoutSubmit"]')).toBeVisible();
      await page.keyboard.press("Escape"); await expect(page.locator('.flow-modal[data-flow="scoutSubmit"]')).toHaveCount(0);
      assert.deepEqual(await navigation(), initialNavigation, "Opening reporting never reorders navigation");
      step = `${prefix}: actual collector Sell or trade`;
      await page.getByRole("button", { name: "Sell or trade", exact: true }).click();
      await expect(page.locator(".collector-sell-trade")).toBeVisible();
      await page.getByRole("button", { name: "Compare a trade", exact: true }).click();
      await expect(page.locator('.flow-modal[data-flow="tradeCompass"]')).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator('.flow-modal[data-flow="tradeCompass"]')).toHaveCount(0);
      await page.getByRole("button", { name: "Prepare a listing", exact: true }).click();
      await expect(page.locator('.flow-modal[data-flow="createListing"]')).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator('.flow-modal[data-flow="createListing"]')).toHaveCount(0);
      await page.getByRole("button", { name: "Browse listings", exact: true }).click();
      await expect(page.locator(".collector-trade-listings")).toBeVisible();
      await page.getByRole("button", { name: "Back to Sell or trade", exact: true }).click();
      await expect(page.locator(".collector-trade-records")).toBeVisible();
      await page.screenshot({ path: path.join(output, `${prefix}-actual-collector-sell-trade.png`), fullPage: true });
      const after = await page.evaluate(() => { const value = JSON.parse(localStorage.getItem("et-tcg-beta-data")); return JSON.stringify([value.items, value.sales, value.expenses]); });
      assert.equal(after, original, "Actual App preserves seeded data when opening and cancelling report flows");
      }

      step = `${prefix}: isolated real component behavior`;
      await page.goto(`${base}/${fixtureRelativePath}`); await page.waitForFunction(() => window.qaReady === true);
      let fixtureRevision = 0;
      const render = async (screen, props = {}, repository = {}, reports) => {
        const expectedRevision = ++fixtureRevision;
        await page.evaluate(config => { window.qaRender(config); window.qaRequestedRevision = config.revision; }, { screen, theme, props, repository, reports, revision: expectedRevision });
        await page.waitForFunction(revision => window.qaRequestedRevision === revision && document.querySelector(revision ? ".ops-home-page, .add-anything-entry, .collector-sell-trade, .exchange-page-final" : "never"), expectedRevision);
        // React commits before the next animation frame; two frames also settle CSS layout.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      };
      const seller = { persona: "seller" };
      await render("home", seller); assert.deepEqual(await homeKeys(page), defaultHomeKeys);
      await render("home", { ...seller, adaptiveActivity: { collection: records("collection") } }); assert.equal((await homeKeys(page))[0], "vaultSnapshot");
      await render("home", { ...seller, adaptiveActivity: { sales: records("sale") } }); assert.equal((await homeKeys(page))[0], "forgeSummary");
      await render("home", { ...seller, adaptiveActivity: { sales: [], inventory: [], expenses: [] } }, { sales: records("native-sale") }); assert.equal((await homeKeys(page))[0], "forgeSummary", "New Business records remain activity evidence even when legacy arrays are empty");
      const publicReports = records("public", 8).map(row => ({ ...row, userId: "other-account" }));
      await render("home", { ...seller, adaptiveActivity: { collection: records("collection") } }, {}, publicReports); assert.equal((await homeKeys(page))[0], "vaultSnapshot", "Public feed activity must not be attributed to this user");
      await render("home", { ...seller, adaptiveActivity: { collection: records("collection") } }, {}, records("own", 4).map(row => ({ ...row, userId: "qa-account" }))); assert.equal((await homeKeys(page))[0], "scoutSignals");
      await render("home", { ...seller, adaptiveActivity: { sales: records("sale", 4) }, personalizationPreferences: { smartRecommendationsEnabled: false } }); assert.deepEqual(await homeKeys(page), defaultHomeKeys);
      await render("home", { ...seller, adaptiveActivity: { sales: records("sale", 4) }, personalizationPreferences: { pagePreferences: { hearth: { visibleKeys: ["marketWatch", "vaultSnapshot"], updatedAt: now } } } }); assert.deepEqual(await homeKeys(page), ["marketWatch", "vaultSnapshot"]);
      await page.getByRole("button", { name: "Report a restock", exact: true }).click(); assert.deepEqual(await page.evaluate(() => window.qaCalls), [["report"]], "Reporting stays available independently of hidden Home cards");
      await render("home", { adaptiveActivity: { sales: records("sale", 4) } }); assert.ok(!(await homeKeys(page)).includes("forgeSummary"), "Activity never enables seller-only Home cards");
      await render("home", { ...seller, adaptiveActivity: { collection: records("collection") } });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Home fixture fits viewport");
      await page.screenshot({ path: path.join(output, `${prefix}-adaptive-collection-home.png`), fullPage: true });

      step = `${prefix}: adaptive Add choices and manual preferences`;
      await render("add"); const defaultAdd = await primaryAdd(page).allTextContents(); assert.deepEqual(defaultAdd, ["Add Collection Item", "Search cards & products", "Scan or review", "Enter UPC/SKU", "Sell or trade"]);
      await render("add", { adaptiveActivity: { collection: records("collection") } }); assert.equal((await primaryAdd(page).allTextContents())[0], "Add Collection Item");
      await render("add", { ...seller, adaptiveActivity: { sales: records("sale") } }); assert.equal((await primaryAdd(page).allTextContents())[0], "Record Sale");
      await render("add", { ...seller, adaptiveActivity: { sales: [] } }, { sales: records("native-sale") }); assert.equal((await primaryAdd(page).allTextContents())[0], "Record Sale");
      await render("add", { adaptiveActivity: { sales: records("sale", 4) }, personalizationPreferences: { smartRecommendationsEnabled: false } }); assert.deepEqual(await primaryAdd(page).allTextContents(), defaultAdd);
      await render("add", { ...seller, adaptiveActivity: { reports: records("report", 4) }, personalizationPreferences: { pagePreferences: { quickAdd: { visibleKeys: ["addSale", "addVaultItem"], updatedAt: now } } } });
      assert.deepEqual(await primaryAdd(page).allTextContents(), ["Record Sale", "Add Collection Item"], "Only explicitly chosen actions remain primary, in saved order");
      await expect(page.locator(".add-anything-more")).not.toHaveAttribute("open", "");
      await page.locator(".add-anything-more > summary").click();
      await expect(page.getByRole("button", { name: /^Scan Listing\./ })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Add Kids Pack/ })).toHaveCount(0);
      assert.equal(await page.locator(".add-anything-entry > button").first().innerText(), "Report a restock\nStore, what you saw, and review. A photo is optional.");
      await page.getByRole("button", { name: /^Report a restock\./ }).click(); assert.deepEqual(await page.evaluate(() => window.qaCalls), [["add", "storeReport"]]);
      const beforeFixture = await page.evaluate(() => localStorage.getItem("ember-and-tide.flip-scout.v1"));
      await page.getByRole("button", { name: /^Record Sale with/ }).click();
      await expect.poll(() => page.evaluate(() => window.qaCalls)).toEqual([["add", "storeReport"], ["close"], ["find", "records", "sales"]]);
      assert.equal(await page.evaluate(() => localStorage.getItem("ember-and-tide.flip-scout.v1")), beforeFixture, "Adaptive rendering and opening a destination never modify saved records");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Add fixture fits viewport");
      await page.screenshot({ path: path.join(output, `${prefix}-adaptive-manual-add.png`) });
      await render("add", { personalizationPreferences: { pagePreferences: { quickAdd: { visibleKeys: ["searchCard", "scanUpc", "scanScreenshot", "scanCards", "requestMissingItem"], updatedAt: now } } } });
      assert.deepEqual(await primaryAdd(page).allTextContents(), ["Search cards & products", "Enter UPC/SKU", "Review a restock screenshot", "Scan page of cards", "Request Missing Item"], "Saved preferences point to their exact working actions");
      for (const [name, destination] of [[/^Search cards/, "search"], [/^Enter UPC/, "upc"], [/^Review a restock screenshot/, "scoutScreenshotReview"], [/^Scan page of cards/, "cardPageReview"]]) {
        await page.getByRole("button", { name }).click();
        assert.deepEqual(await page.evaluate(() => window.qaCalls.at(-1)), ["path", destination]);
      }
      await render("add", { kids: true });
      await page.locator(".add-anything-more > summary").click();
      await expect(page.getByRole("button", { name: /^Add a parent-guided/ })).toHaveCount(0);
      await render("add", { kids: true, showFamilyExperience: true });
      await page.locator(".add-anything-more > summary").click();
      await page.getByRole("button", { name: /^Add a parent-guided/ }).click();
      await expect.poll(() => page.evaluate(() => window.qaCalls.at(-1))).toEqual(["pack", { source: "global-add" }]);
      await render("add", { kids: false, showFamilyExperience: true });
      await page.locator(".add-anything-more > summary").click();
      await expect(page.getByRole("button", { name: /^Add a parent-guided/ })).toHaveCount(0);
      step = `${prefix}: collector, seller and store presentation`;
      const businessRepository = { sales: records("owned-sale", 3), activity: [{ id: "owned-expense", title: "Private expense record", createdAt: now }], deals: [{ id: "owned-find", title: "Saved collector find", status: "strong", askingPrice: 20, projectedProfit: 10, createdAt: now }] };
      await render("home", { adaptiveActivity: { sales: records("sale", 4) } }, businessRepository);
      await expect(page.getByRole("heading", { name: "A saved find", exact: true })).toBeVisible();
      await expect(page.getByText("Projected profit", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Private expense record", { exact: true })).toHaveCount(0);
      await expect(page.locator('[data-home-card="forgeSummary"]')).toHaveCount(0);
      await page.getByRole("button", { name: "Sell or trade", exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.qaCalls.at(-1)), ["sell-trade"]);
      await page.getByRole("button", { name: "Search cards & products", exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.qaCalls.at(-1)), ["navigate", "market"]);
      await page.screenshot({ path: path.join(output, `${prefix}-collector-home.png`), fullPage: true });
      await render("add", { adaptiveActivity: { sales: records("sale", 8) }, personalizationPreferences: { pagePreferences: { quickAdd: { visibleKeys: ["addSale", "addExpense", "addVaultItem"], updatedAt: now } } } }, businessRepository);
      assert.deepEqual(await primaryAdd(page).allTextContents(), ["Add Collection Item"], "Manual choices are filtered through collector-eligible actions");
      await page.locator(".add-anything-more > summary").click();
      for (const name of [/^Analyze Deal/, /^Record Purchase/, /^Record Sale/, /^Add Auction/, /^Add selling inventory/, /^Add Expense/, /^Add Mileage/, /^Add Receipt/]) await expect(page.getByRole("button", { name })).toHaveCount(0);
      await page.getByRole("button", { name: /^Sell or trade\./ }).click();
      await expect.poll(() => page.evaluate(() => window.qaCalls.at(-1))).toEqual(["sell-trade"]);
      await page.screenshot({ path: path.join(output, `${prefix}-collector-add.png`) });
      for (const persona of ["seller", "store"]) {
        await render("home", { persona }, businessRepository);
        await expect(page.getByRole("heading", { name: persona === "store" ? "Your store records" : "Your selling records", exact: true })).toBeVisible();
        const inventoryName = persona === "store" ? "Store inventory" : "Selling inventory";
        await page.getByRole("button", { name: inventoryName, exact: true }).click();
        assert.deepEqual(await page.evaluate(() => window.qaCalls.at(-1)), ["business", "inventory"]);
        await expect(page.getByText("Projected profit", { exact: true })).toBeVisible();
        await page.screenshot({ path: path.join(output, `${prefix}-${persona}-home.png`), fullPage: true });
        await render("add", { persona });
        assert.equal((await primaryAdd(page).allTextContents())[0], persona === "store" ? "Add store inventory" : "Add selling inventory");
        await expect(page.getByRole("button", { name: /^Record Sale with/ })).toBeVisible();
        await page.getByRole("button", { name: /^Record Sale with/ }).click();
        await expect.poll(() => page.evaluate(() => window.qaCalls.at(-1))).toEqual(["find", "records", "sales"]);
        await page.locator(".add-anything-more > summary").click();
        await expect(page.getByRole("button", { name: /^Add Expense/ })).toBeVisible();
        await expect(page.getByRole("button", { name: /^Add Mileage/ })).toBeVisible();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${persona} Add fits viewport`);
        await page.screenshot({ path: path.join(output, `${prefix}-${persona}-add.png`) });
      }
      step = `${prefix}: collector Sell or trade uses existing workflows`;
      const listing = { id: "qa-listing", title: "Synthetic saved listing", status: "Draft" };
      const trade = { id: "qa-trade", sourceItemName: "Synthetic card A", receivedName: "Synthetic card B", resultLabel: "Reviewed trade", tradeDate: "2026-10-17" };
      await render("trade", { workspaceMarketplaceListings: [listing], workspaceTradeRecords: [trade], forgeInventoryItems: [{ id: "qa-business", name: "Synthetic business record", unitCost: 40 }], workspaceSales: [{ total: 999 }] });
      await expect(page.getByRole("heading", { name: "Sell or trade", exact: true })).toBeVisible();
      await expect(page.locator(".exchange-page-final")).toHaveCount(0);
      await page.getByRole("button", { name: "Compare a trade", exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.qaCalls.at(-1)), ["trade", { source: "collector-sell-trade" }]);
      await page.getByRole("button", { name: "Prepare a listing", exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.qaCalls.at(-1)), ["listing", "manual", {}]);
      await page.getByRole("button", { name: "Check market prices", exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.qaCalls.at(-1)), ["navigate", "market"]);
      await page.getByRole("button", { name: /Synthetic saved listing/ }).click();
      assert.deepEqual(await page.evaluate(() => window.qaCalls.at(-1)), ["edit-listing", "qa-listing"]);
      await page.locator(".collector-trade-saved > summary").click();
      await expect(page.getByText("Reviewed trade", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Browse listings", exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.qaCalls.at(-1)), ["exchange", "harbor"]);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Collector Sell or trade fits viewport");
      const tradeTargets = await page.locator(".collector-sell-trade button, .collector-sell-trade summary").evaluateAll(nodes => nodes.map(node => ({ label: node.textContent.trim(), height: node.getBoundingClientRect().height })));
      assert.ok(tradeTargets.every(target => target.height >= 44), `Collector touch targets: ${JSON.stringify(tradeTargets)}`);
      await page.screenshot({ path: path.join(output, `${prefix}-collector-sell-trade.png`), fullPage: true });
      await render("trade", { exchangeSection: "harbor" });
      await expect(page.getByText("Existing listing workflow", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Back to Sell or trade", exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.qaCalls.at(-1)), ["exchange", "overview"]);
      for (const persona of ["seller", "store"]) {
        await render("trade", { persona, exchangeSection: "forge" });
        await expect(page.locator(".exchange-page-final")).toBeVisible();
        await expect(page.locator(".exchange-command-board")).toHaveAttribute("aria-label", persona === "store" ? "Your store records" : "Your selling records");
      }
      assert.deepEqual(writes, [], "No network mutation was attempted"); assert.deepEqual(errors, [], "No browser runtime errors");
      results.push({ ...testCase, directFindRestocksReport: !componentsOnly, browseCommunityReports: !componentsOnly, backToRestocks: !componentsOnly, actualAppReportRouting: !componentsOnly, actualCollectorSellTradeFlows: !componentsOnly, initialReportAboveNavigation: !componentsOnly, stableNavigation: !componentsOnly, savedDataUnchanged: true, adaptiveHomeAndAddVerified: true, personaPresentationVerified: ["collector", "seller", "store"], collectorBusinessExtrasExcluded: true, familyAddOptInRespectsFeatureGate: true, collectorSellTradeCallbacksPreserved: true, collectorTouchTargets: tradeTargets, publicReportExclusion: true, manualPreferencePrecedence: true, sellerEligibilityPreserved: true, writes, external, errors });
      console.log(`PASS ${prefix}: ${componentsOnly ? "isolated Home/Add components" : "actual Home/Add report routing"}, adaptive shortcuts, collector/seller/store presentation, manual preferences, ownership, permissions and preserved records.`);
      await context.close();
    }
    fs.writeFileSync(path.join(output, restockEntryOnly ? "restock-entry-results.json" : requestedWidths ? `results-${requestedWidths.join("-")}.json` : "results.json"), JSON.stringify({ createdAt: new Date().toISOString(), actualAppPlusIsolatedComponents: !restockEntryOnly && !componentsOnly, syntheticOnly: true, results }, null, 2));
  } catch (error) {
    console.error(`FAILED ${step}`);
    if (lastPage && !lastPage.isClosed()) { await lastPage.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {}); fs.writeFileSync(path.join(output, "failure.txt"), `${step}\n${await lastPage.locator("body").innerText().catch(() => "Unavailable")}`); }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
