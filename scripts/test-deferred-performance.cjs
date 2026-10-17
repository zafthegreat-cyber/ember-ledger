const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname));
const output = path.resolve("artifacts/qa/private-beta-candidate/performance/browser");
const newChunks = ["ScoutSubmitContent", "MultiDestinationContent", "AddAnythingContent", "CollectionsContent", "DailyOverviewContent", "MenuDrawerContent", "VaultWorkspaceContent", "CatalogWorkspaceContent", "LegacyReportsContent"];
const results = [];

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  let currentPage;
  try {
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
      const requested = [], errors = [];
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== base.origin || route.request().method() !== "GET") return route.abort();
        if (newChunks.some((name) => url.pathname.endsWith(`/${name}.jsx`))) await new Promise((resolve) => setTimeout(resolve, 650));
        return route.continue();
      });
      await context.addInitScript(({ theme }) => {
        localStorage.setItem("et-tcg-app-theme", theme);
        if (!localStorage.getItem("et-tcg-beta-scout")) localStorage.setItem("et-tcg-beta-scout", JSON.stringify({ stores: [{ id: "performance-store", name: "Synthetic Performance Store", nickname: "Synthetic Performance Store", retailer: "Target", chain: "Target", city: "Norfolk", state: "VA", address: "1 Synthetic Way", zip: "23510" }], reports: [], items: [], dropRadarSeedDisabled: true }));
      }, { theme });
      const page = await context.newPage(); currentPage = page;
      page.setDefaultTimeout(30000);
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => requested.push(new URL(request.url()).pathname));
      const go = async (pathname) => { await page.goto(new URL(`${pathname}?betaLocalMode=true`, base).href); await page.locator(".app[data-theme]").waitFor(); };
      const recordBytes = () => page.evaluate(() => { const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}"); return JSON.stringify(Object.fromEntries(["items", "sales", "expenses", "mileageTrips", "tradeRecords"].map((key) => [key, data[key] || []]))); });
      const record = (name) => results.push({ theme, width, name, passed: true });
      await go("/");
      await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible();
      assert.ok(!requested.some((url) => newChunks.some((chunk) => url.endsWith(`/${chunk}.jsx`))), "Home must not request inactive renderer chunks.");
      const before = await recordBytes(); record("Home does not fetch nine inactive renderers");

      const add = page.getByRole("button", { name: "Open global Add menu", exact: true }).first();
      await add.click();
      const modal = page.locator(".flow-modal");
      await expect(modal.locator("[data-deferred-modal-loading]")).toBeFocused();
      await expect(modal.getByRole("button", { name: /Add Collection Item with/ })).toBeVisible();
      assert.equal(await modal.locator(".flow-modal-body").evaluate((node) => node.contains(document.activeElement)), true, "Late-loaded action sheet receives keyboard focus.");
      await page.keyboard.press("Escape"); await expect(modal).toHaveCount(0); await expect(add).toBeFocused();
      record("Cold action sheet transfers focus and Escape restores opener");
      await add.click();
      await modal.getByRole("button", { name: /Add Collection Item with/ }).click();
      const intake = page.locator('.flow-modal[data-flow="multiDestinationAdd"]');
      await expect(intake.locator("[data-deferred-modal-loading]")).toBeFocused();
      await expect(intake.locator("[data-deferred-modal-loading]")).toHaveCount(0);
      assert.equal(await intake.locator(".flow-modal-body").evaluate((node) => node.contains(document.activeElement)), true, "Late-loaded intake receives keyboard focus.");
      const itemName = intake.getByLabel("Item Name", { exact: true });
      await itemName.fill("Synthetic retained deferred draft");
      page.once("dialog", (dialog) => dialog.dismiss()); await page.keyboard.press("Escape");
      await expect(itemName).toHaveValue("Synthetic retained deferred draft");
      await page.goBack(); await expect(intake).toHaveCount(0);
      assert.equal(await recordBytes(), before, "Unsubmitted draft and browser Back write no records.");
      record("Cold intake preserves dirty draft on cancellation and Back closes without save");

      await go("/scout/stores/performance-store");
      await expect(page.getByRole("heading", { name: "Synthetic Performance Store", exact: true }).first()).toBeVisible();
      const reportButton = page.getByRole("button", { name: "Submit Report", exact: true }).first();
      await reportButton.click();
      const scout = page.locator('.flow-modal[data-flow="scoutSubmit"]');
      await expect(scout.locator("[data-deferred-modal-loading]")).toBeFocused();
      await expect(scout.locator("[data-deferred-modal-loading]")).toHaveCount(0);
      assert.equal(await scout.locator(".flow-modal-body").evaluate((node) => node.contains(document.activeElement)), true);
      await scout.getByRole("button", { name: "Next", exact: true }).click();
      await scout.getByRole("button", { name: "Back", exact: true }).click();
      await expect(scout).toContainText("Synthetic Performance Store");
      page.once("dialog", (dialog) => dialog.accept()); await page.keyboard.press("Escape");
      await expect(scout).toHaveCount(0); await expect(reportButton).toBeFocused();
      record("Cold Scout report transfers focus, retains step state and restores opener");

      for (const [pathname, chunk] of [["/settings/workspaces", "CollectionsContent"], ["/today", "DailyOverviewContent"], ["/vault/cards", "VaultWorkspaceContent"]]) {
        await go("/"); await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible();
        await go(pathname); await expect.poll(() => requested.some((url) => url.endsWith(`/${chunk}.jsx`))).toBe(true);
        await expect(page.locator("main .route-loading-card")).toHaveCount(0);
        assert.equal(await recordBytes(), before);
        await expect(page.locator(".app[data-theme]")).toHaveAttribute("data-theme", theme);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: path.join(output, `${chunk}-${theme}-${width}.png`) });
        await page.goBack(); await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible();
        record(`${chunk} direct load, Back, theme and record preservation`);
      }
      if (width === 360) {
      await page.getByRole("button", { name: "Open profile and menu", exact: true }).first().click();
      await expect.poll(() => requested.some((url) => url.endsWith("/MenuDrawerContent.jsx"))).toBe(true);
      await expect(page.locator(".menu-drawer")).toBeVisible();
      assert.equal(await recordBytes(), before); record("Menu drawer loads on demand and retains App data");
      } else { assert.ok(!requested.some((url) => url.endsWith("/MenuDrawerContent.jsx"))); record("Desktop navigation keeps the inactive drawer deferred"); }
      assert.deepEqual(errors, []);
      await context.close();
    }
  } catch (error) {
    if (currentPage && !currentPage.isClosed()) { await currentPage.screenshot({ path: path.join(output, "failure.png"), fullPage: true }); fs.writeFileSync(path.join(output, "failure.txt"), await currentPage.locator("body").innerText()); }
    results.push({ passed: false, error: error.message }); throw error;
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2)); }
  console.log(`Deferred performance browser: ${results.length}/${results.length} passed.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
