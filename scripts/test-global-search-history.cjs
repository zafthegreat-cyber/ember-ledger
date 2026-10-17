const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium, expect } = require("@playwright/test");

(async () => {
  const root = path.resolve(__dirname, "..");
  const { APP_ROUTE_STORAGE_KEY } = await import(pathToFileURL(path.join(root, "src/utils/appRouteState.js")));
  const baseUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5217/");
  assert.ok(["http:", "https:"].includes(baseUrl.protocol) && ["127.0.0.1", "localhost", "[::1]"].includes(baseUrl.hostname), "Disposable history regression is local-only");
  const output = path.join(root, "artifacts/qa/global-search-history");
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
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      const result = { theme, width, checks: [] };
      try {
        const settingsUrl = new URL("/settings", baseUrl);
        settingsUrl.search = new URLSearchParams({ betaLocalMode: "true", themeInspect: theme, historyProbe: "preserve" }).toString();
        settingsUrl.hash = "history-origin";
        await page.goto(settingsUrl.href, { waitUntil: "domcontentloaded" });
        const settings = page.locator(".settings-layout");
        await expect(settings).toBeVisible();
        const initial = await page.evaluate((key) => ({ length: history.length, url: location.href, route: JSON.parse(localStorage.getItem(key)) }), APP_ROUTE_STORAGE_KEY);
        assert.equal(initial.route.activeTab, "settings");

        for (const query of ["", "synthetic-history-check"]) {
          await settings.getByRole("button", { name: "Search the app", exact: true }).click();
          const search = page.locator(".app-search.expanded");
          await expect(search).toBeVisible();
          await search.getByRole("textbox", { name: "Search across Code 3 TCG", exact: true }).fill(query);
          assert.equal(await page.evaluate(() => history.length), initial.length + (query ? 1 : 0), "Opening Search must not create a route entry");
          await search.getByRole("button", { name: /^Search Collection/ }).click();
          await expect(search).toHaveCount(0);
          await page.waitForFunction(() => location.pathname === "/vault/cards");
          await expect(page.locator(".vault-v4-dashboard, .vault-v4-detail-surface").first()).toBeVisible({ timeout: 20000 });
          const destination = await page.evaluate((key) => ({ length: history.length, url: location.href, route: JSON.parse(localStorage.getItem(key)) }), APP_ROUTE_STORAGE_KEY);
          assert.equal(destination.length, initial.length + 1, "Search Collection must push a destination without replacing direct-entry Settings");
          assert.equal(new URL(destination.url).searchParams.get("vaultQ") || "", query);
          assert.equal(destination.route.activeWorkspaceId, initial.route.activeWorkspaceId, "Search navigation preserves the saved data workspace");

          await page.goBack();
          await expect(settings).toBeVisible({ timeout: 20000 });
          assert.equal(page.url(), initial.url, "Back restores the exact Settings URL, including its query and fragment");
          assert.equal(await page.locator(".app").getAttribute("data-theme"), theme);
          assert.equal(await page.evaluate(() => history.length), initial.length + 1, "Back must not add or replace a history entry");
          assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).activeTab, APP_ROUTE_STORAGE_KEY), "settings");

          await page.goForward();
          await page.waitForFunction(() => location.pathname === "/vault/cards");
          await expect(page.locator(".vault-v4-dashboard, .vault-v4-detail-surface").first()).toBeVisible({ timeout: 20000 });
          assert.equal(page.url(), destination.url, "Forward restores the collection destination and search query");
          assert.equal(await page.locator(".app").getAttribute("data-theme"), theme);
          assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).activeWorkspaceId, APP_ROUTE_STORAGE_KEY), initial.route.activeWorkspaceId);
          await page.goBack();
          await expect(settings).toBeVisible();
          assert.equal(page.url(), initial.url);
          result.checks.push(query ? "query-bearing navigation, Back and Forward" : "direct-entry navigation, Back and Forward");
        }
        assert.deepEqual(pageErrors, []);
        await page.screenshot({ path: path.join(output, `${theme}-${width}-settings-restored.png`) });
        result.passed = true;
        console.log(`PASS direct Settings search history: ${theme} ${width}`);
      } catch (error) {
        result.passed = false;
        result.error = error.message;
        result.pageErrors = pageErrors;
        await page.screenshot({ path: path.join(output, `${theme}-${width}-failure.png`) }).catch(() => {});
        console.error(`FAIL direct Settings search history: ${theme} ${width}: ${error.message}`);
      } finally {
        results.push(result);
        await context.close();
      }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2));
  }
  assert.ok(results.length === 4 && results.every((result) => result.passed), "See artifacts/qa/global-search-history/results.json for failures");
})().catch((error) => { console.error(error); process.exitCode = 1; });
