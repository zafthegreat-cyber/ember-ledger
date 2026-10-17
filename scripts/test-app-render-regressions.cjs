const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const espree = require("espree");
const { transformSync } = require("esbuild");
const React = require("react");
const { chromium, expect } = require("@playwright/test");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(process.env.APP_RENDER_SOURCE || path.join(root, "src/App.jsx"), "utf8");
// Follow the active lazy import so the renderer assertion still executes the
// shipped body after its code-split; an unreferenced fixture cannot satisfy it.
const deferredAdminPath = path.join(root, "src/features/deferredViews/AdminReviewContent.jsx");
const source = !process.env.APP_RENDER_SOURCE && appSource.includes('import("./features/deferredViews/AdminReviewContent")')
  ? `${appSource}\n${fs.readFileSync(deferredAdminPath, "utf8").replace("export default function AdminReviewContent", "function ShippedAdminRendererBoundary")}`
  : appSource;
const ast = espree.parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
const functions = new Map();
function visit(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration") functions.set(node.id.name, node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value?.type) visit(value);
  }
}
visit(ast);

// Execute the actual JSX render function with isolated data and child-component
// boundaries. This never changes application authentication or accesses a server.
function renderFunction(name, bindings) {
  const node = functions.get(name);
  assert.ok(node, `Missing ${name}`);
  const code = transformSync(source.slice(...node.range), { loader: "jsx", jsx: "transform" }).code;
  return vm.runInNewContext(`${code}\n${name}()`, { React, ...bindings });
}
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children)];
}

async function checkRenderers() {
  const { betaAccessAllowedForProfile } = await import(pathToFileURL(path.join(root, "src/utils/betaAccessUtils.js")));
  const pageHeader = () => null;
  const commandBoard = () => null;
  const selectedQueues = [];
  const admin = {
    adminToolsVisible: true, moderatorToolsVisible: true, betaAdminVisible: true,
    ADMIN_COMMAND_CENTER_FILTERS: ["All"], REVIEW_SECTION_LABELS: {}, BETA_REVIEW_SECTIONS: [],
    suggestions: [], adminReviewFilter: "All", workspaceMarketplaceListings: [], scoutNeedsReviewReports: [], scoutGuessRows: [], tidepoolPosts: [],
    shorelineState: { adminProfileUsers: [{ betaStatus: "approved" }, { appAccess: true }, { betaStatus: "pending" }, { isAdmin: true }] },
    betaReadinessData: { appErrorLogs: [{ id: "synthetic-error" }], auditLogs: [{ id: "synthetic-audit-1" }, { id: "synthetic-audit-2" }] },
    betaAccessAllowedForProfile, buildStoreMapRows: () => [], tidepoolPostNeedsModeration: () => false,
    getPagedItems: (items) => ({ items }), adminReviewPage: 1, marketplaceReviewPage: 1, LONG_LIST_PAGE_SIZE: 20,
    setAdminReviewFilter: (filter) => selectedQueues.push(filter), actualAdminRole: "admin", adminEditModeActive: false,
    adminReviewIdentityLabel: "Synthetic admin renderer", adminReviewIdentityDetail: "Local test only", currentUserProfile: { source: "synthetic fixture" },
    roleManagementVisible: true, getHeaderCardClass: (value) => value, PageHeader: pageHeader, CommandBoardV4: commandBoard,
    renderAdminOperationsDashboard: () => null, renderBetaAdminReviewQueues: () => null,
    renderAdminScoutReportQueue: () => null, renderAdminCommunityGuessQueue: () => null,
    renderAdminTidepoolModerationQueue: () => null, renderEmberAssistAdminInbox: () => null,
  };
  const tree = renderFunction("renderAdminReviewPage", admin);
  const board = elements(tree).find((entry) => entry.type === commandBoard);
  assert.ok(board, "Authorized renderer reaches the real command-board element");
  const people = board.props.routes.find((route) => route.key === "people");
  const health = board.props.routes.find((route) => route.key === "health");
  assert.equal(people.detail, "2 approved");
  assert.equal(health.detail, "3 notes");
  people.action(); health.action();
  assert.deepEqual(selectedQueues, ["Beta Users", "System Health / Logs"]);
  const denied = elements(renderFunction("renderAdminReviewPage", { ...admin, adminToolsVisible: false }));
  assert.equal(denied.find((entry) => entry.type === pageHeader).props.title, "Permission Denied");
  assert.ok(!denied.some((entry) => entry.type === commandBoard));
  const moderator = elements(renderFunction("renderAdminReviewPage", { ...admin, betaAdminVisible: false }));
  assert.equal(moderator.find((entry) => entry.type === pageHeader).props.title, "Moderator Command Center");
  assert.ok(!moderator.some((entry) => entry.type === commandBoard));

  const sale = { id: "synthetic-sale", itemName: "Synthetic render card" };
  const renderedSales = [];
  const sales = renderFunction("renderForgeSalesList", {
    salesViewMode: "date", salesReviewView: { filteredSales: [sale], dateGroups: [{ key: "2026-09-15", label: "September 15, 2026", records: [sale], quantitySold: 1, grossSales: 25, estimatedProfitLoss: 10 }] },
    money: (value) => `$${value}`, renderForgeSaleCard: (record) => { renderedSales.push(record.id); return React.createElement("article", { key: record.id }, record.itemName); },
  });
  assert.deepEqual(renderedSales, [sale.id]);
  assert.ok(elements(sales).some((entry) => entry.props.children === "Forge Sales by Date"));
  const delegate = { marker: "active Quick Add" };
  assert.equal(renderFunction("renderAddActionSheetContent", { renderAddAnythingFlowContent: () => delegate }), delegate);
  assert.equal(functions.get("renderAddActionSheetContent").body.body.length, 1, "Only the active Quick Add delegation remains");
  assert.ok(functions.has("applyCatalogProductToDeal"));
  assert.ok(!source.includes("useCatalogProductInDeal"));
  const market = fs.readFileSync(path.join(root, "src/pages/Market.jsx"), "utf8");
  assert.match(market, /onClick=\{\(\) => applyCatalogProductToDeal\(product\.productId \|\| product\.id\)\}/);
  console.log("PASS actual JSX renderers: admin counts/actions, denied and moderator gates, populated date sales, active Quick Add, catalog action naming");
}

async function checkBrowser() {
  const baseUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5217/");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(baseUrl.hostname), "Disposable regression is local-only");
  const output = process.env.QA_OUTPUT_DIR ? path.resolve(root, process.env.QA_OUTPUT_DIR) : path.join(root, "artifacts/qa/release-readiness/app-render");
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 360 ? 800 : 900 } });
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        return url.origin === baseUrl.origin || !["http:", "https:"].includes(url.protocol) ? route.continue() : route.abort();
      });
      await context.addInitScript(() => {
        if (localStorage.getItem("synthetic-render-fixture")) return;
        localStorage.setItem("synthetic-render-fixture", "true");
        localStorage.setItem("et-tcg-beta-data", JSON.stringify({
          userType: "seller", dashboardPreset: "seller", forgeModeSettings: { personalForgeEnabled: true, lockToEmberTide: false },
          catalogProducts: [{ id: "synthetic-compare-product", name: "Synthetic compare product", sourceType: "manual", catalogType: "sealed", marketPrice: 30, msrpPrice: 20 }],
          tideTradrWatchlist: [{ id: "synthetic-compare-watch", productId: "synthetic-compare-product", name: "Synthetic compare product", workspaceId: "workspace-personal-local-beta" }],
          sales: [{ id: "synthetic-render-sale", itemName: "Synthetic render card", quantitySold: 1, salePrice: 25, finalSalePrice: 25, grossSales: 25, saleDate: "2026-09-15", soldAt: "2026-09-15T12:00:00Z", workspaceId: "workspace-personal-local-beta", createdAt: "2026-09-15T12:00:00Z" }],
        }));
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const result = { theme, width };
      try {
        await page.goto(new URL(`/forge/sales?betaLocalMode=true&themeInspect=${theme}`, baseUrl).href);
        await expect(page.getByRole("group", { name: "Sales view mode" })).toBeVisible({ timeout: 30000 });
        await page.getByRole("group", { name: "Sales view mode" }).getByRole("button", { name: /^By date/ }).click();
        await expect(page.getByRole("heading", { name: "Forge Sales by Date", exact: true })).toBeVisible();
        await expect(page.locator(".sales-grouped-list")).toContainText("Synthetic render card");
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("et-tcg-beta-data")).sales);
        assert.equal(stored.length, 1);
        await page.screenshot({ path: path.join(output, `sales-date-${theme}-${width}.png`), fullPage: true });
        await page.goto(new URL(`/?betaLocalMode=true&themeInspect=${theme}`, baseUrl).href);
        await expect(page.locator(".ops-home-page")).toBeVisible();
        await page.locator('button[aria-label="Open global Add menu"]:visible').first().click();
        const quickAdd = page.locator('.flow-modal[data-flow="addActionSheet"]');
        await expect(quickAdd).toBeVisible();
        await expect(quickAdd.getByRole("button", { name: /^Scan Listing\./ })).toBeVisible();
        await expect(quickAdd.getByRole("button", { name: /^Add Collection Item / })).toBeVisible();
        await quickAdd.getByText("More", { exact: true }).click();
        await expect(quickAdd.getByRole("button", { name: /^Add Resale Inventory / })).toBeVisible();
        await quickAdd.getByRole("button", { name: /^Analyze Deal\./ }).click();
        await expect(quickAdd).toHaveCount(0);
        await page.waitForURL(/\/find\/deal-analysis\?/);
        await expect(page.locator(".flip-scout-main .route-loading-card")).toHaveCount(0);
        await page.goto(new URL(`/exchange/market?betaLocalMode=true&themeInspect=${theme}`, baseUrl).href);
        const marketResult = page.locator(".market-v4-result-row").filter({ hasText: "Synthetic compare product" });
        await expect(marketResult).toBeVisible({ timeout: 30000 });
        await marketResult.getByRole("button", { name: "Compare", exact: true }).click();
        const comparison = page.locator(".deal-finder-modal");
        await expect(comparison).toBeVisible();
        await expect(comparison.getByLabel("Deal Title", { exact: true })).toHaveValue("Synthetic compare product");
        await expect(comparison.getByRole("combobox").first()).toHaveValue("synthetic-compare-product");
        await comparison.getByRole("button", { name: "Close Deal Finder", exact: true }).click();
        await page.goto(new URL(`/admin?betaLocalMode=true&themeInspect=${theme}`, baseUrl).href);
        await expect(page.getByRole("heading", { name: "Permission Denied", exact: true })).toBeVisible({ timeout: 30000 });
        assert.deepEqual(errors, []);
        result.passed = true;
        console.log(`PASS local sales date grouping, active Quick Add, Market Compare, and admin denial: ${theme} ${width}`);
      } catch (error) {
        result.passed = false; result.error = error.message; result.pageErrors = errors;
        await page.screenshot({ path: path.join(output, `failure-${theme}-${width}.png`) }).catch(() => {});
        console.error(`FAIL ${theme} ${width}: ${error.message}`);
      } finally { results.push(result); await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2)); }
  assert.ok(results.length === 4 && results.every((entry) => entry.passed), "See app-render/results.json");
}

(async () => {
  await checkRenderers();
  if (process.env.APP_RENDER_UNIT_ONLY !== "1") await checkBrowser();
})().catch((error) => { console.error(error); process.exitCode = 1; });
