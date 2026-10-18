const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5243").origin;
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname), "Use disposable loopback state only");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/experience-menu-app");
const cases = [{ width: 320, theme: "dark" }, { width: 390, theme: "light" }, { width: 1440, theme: "dark" }];
const privateKeys = ["owner-center", "account-ops", "admin", "betaUsers", "invites", "reportReview", "moderation", "storeProductAdmin"];
const tiers = ["free", "collector", "family", "seller", "shop"];

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = []; let lastPage; let step = "start";
  try {
    for (const { width, theme } of cases) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
      const attemptedWrites = [];
      await context.route("**/*", route => {
        const request = route.request(); const url = new URL(request.url());
        if (request.method() !== "GET") { attemptedWrites.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
        if (url.origin !== base) return route.abort();
        if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: '{"configured":false}' });
        return route.continue();
      });
      await context.addInitScript(({ theme }) => {
        if (localStorage.getItem("__qa_experience_menu")) return;
        localStorage.setItem("__qa_experience_menu", "true");
        localStorage.setItem("et-tcg-app-theme", theme);
        localStorage.setItem("et-tcg-beta-data", JSON.stringify({ userType: "collector", dashboardPreset: "simple", profile: { userId: "local-beta", email: "qa-experience@example.test", displayName: "Synthetic account", appRole: "owner", app_role: "owner", userRole: "owner", appAccess: "approved" }, subscriptionProfile: { tier: "admin", featureTier: "admin", subscriptionPlan: "admin", appRole: "owner", app_role: "owner", isAdmin: true, lifetimeAccess: true, subscriptionStatus: "active" }, items: [{ id: "qa-preserved-card", name: "QA preserved card", quantity: 2 }], sales: [{ id: "qa-preserved-sale", title: "QA preserved sale", grossSalePrice: 30 }], expenses: [{ id: "qa-preserved-expense", description: "QA preserved expense", amount: 4 }] }));
      }, { theme });
      const page = await context.newPage(); lastPage = page; const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const snapshot = () => page.evaluate(() => { const state = JSON.parse(localStorage.getItem("et-tcg-beta-data")); return JSON.stringify([state.items, state.sales, state.expenses, state.subscriptionProfile, state.profile?.appRole, state.appSetupPersonalization]); });
      step = `${width} ${theme}: actual App startup`;
      await page.goto(`${base}/?betaLocalMode=true`);
      const controls = page.getByRole("region", { name: "Admin display controls", exact: true });
      await expect(controls).toBeVisible({ timeout: 45000 });
      const actualRole = await controls.locator(".admin-mode-role-pill").innerText();
      const original = await snapshot();
      const drawer = page.getByRole("dialog", { name: "Menu", exact: true });
      const openMenu = async () => {
        if (width > 520) await page.setViewportSize({ width: 390, height: 900 });
        await page.getByRole("button", { name: "Open profile and menu", exact: true }).click();
        await expect(drawer).toBeVisible();
        if (width > 520) await page.setViewportSize({ width, height: 900 });
      };
      const closeMenu = async () => { await drawer.getByRole("button", { name: "Close menu", exact: true }).click(); await expect(drawer).toHaveCount(0); };
      await controls.getByRole("button", { name: "Admin", exact: true }).click();
      await openMenu();
      const originalAdminKeys = await drawer.locator("[data-menu-key]").evaluateAll(elements => elements.map(element => element.dataset.menuKey).sort());
      const originalAdminWorkspaces = await drawer.locator("[data-menu-workspace]").evaluateAll(elements => elements.map(element => element.dataset.menuWorkspace));
      await closeMenu();
      await controls.getByRole("button", { name: "Regular", exact: true }).click();
      const plan = page.getByRole("combobox", { name: "Preview plan", exact: true });
      await expect(plan).toBeVisible();
      for (const tier of tiers) {
        step = `${width} ${theme}: ${tier} actual menu`;
        await plan.selectOption(tier);
        await expect(plan).toHaveValue(tier);
        await openMenu();
        const search = drawer.getByRole("searchbox", { name: "Search menu", exact: true });
        const keys = await drawer.locator("[data-menu-key]").evaluateAll(elements => elements.map(element => element.dataset.menuKey));
        for (const key of ["scout", "reportRestock", "exchange", "vault", "watchList", "account", "settings", "privacySafety", "help"]) assert.ok(keys.includes(key), `${tier} keeps ${key}`);
        await expect(drawer.locator("[data-menu-report='restock']")).toBeInViewport({ ratio: 1 });
        await search.fill("empty shelves");
        await expect(drawer.locator('[data-menu-key="reportRestock"]')).toBeVisible();
        await search.fill("");
        for (const key of privateKeys) assert.equal(keys.includes(key), false, `${tier} hides private ${key}`);
        const shortcutKeys = await drawer.locator("[data-menu-shortcut]").evaluateAll(elements => elements.map(element => element.dataset.menuShortcut));
        assert.equal(shortcutKeys[0], "scout");
        const workspaceIds = await drawer.locator("[data-menu-workspace]").evaluateAll(elements => elements.map(element => element.dataset.menuWorkspace));
        assert.equal(workspaceIds.includes("BOT"), false);
        if (["free", "collector", "family"].includes(tier)) {
          assert.deepEqual(workspaceIds, ["COLLECT", "FIND"]);
          await expect(drawer.locator('[data-menu-key="exchange"]')).toContainText("Sell or trade");
          for (const key of ["emberAssist", "shopPortal", "feedback", "comingSoon", "tidepool"]) assert.equal(keys.includes(key), false, `${tier} hides optional ${key}`);
          if (tier !== "family") assert.equal(keys.includes("parentCenter"), false);
        }
        for (const query of ["Bot", "Owner Center", "Account Ops", "Admin Command"]) {
          await search.fill(query);
          await expect(drawer.locator("[data-menu-workspace], [data-menu-key]")).toHaveCount(0);
        }
        await search.fill("");
        assert.equal(await drawer.evaluate(element => element.scrollWidth > element.clientWidth + 1), false);
        if (tier === "free" || tier === "seller") await page.screenshot({ path: path.join(output, `${width}-${theme}-${tier}-menu.png`) });
        await closeMenu();
        assert.equal(await controls.locator(".admin-mode-role-pill").innerText(), actualRole, "Preview never changes actual role");
        assert.equal(await snapshot(), original, "Preview preserves original record arrays");
      }
      step = `${width} ${theme}: settings and saved records`;
      await plan.selectOption("free"); await openMenu();
      await drawer.locator(".menu-settings-shortcut").click();
      await page.waitForURL("**/settings*");
      await expect(page.locator(".settings-layout")).toBeVisible();
      const preferences = page.getByRole("region", { name: "Make it yours", exact: true });
      if (!await preferences.isVisible()) await page.locator("summary").filter({ hasText: "Appearance & preferences" }).click();
      await expect(preferences).toBeVisible();
      for (const input of await preferences.locator("input").all()) await expect(input).toBeDisabled();
      await page.goBack();
      step = `${width} ${theme}: direct private routes remain outside preview`;
      for (const route of ["/bot", "/owner-center", "/account-ops/accounts"]) {
        await page.goto(`${base}${route}?betaLocalMode=true`);
        await expect(page.getByRole("heading", { name: "Outside the user preview", exact: true })).toBeVisible({ timeout: 30000 });
        const dock = page.locator(".ops-mobile-nav");
        assert.ok(await dock.count() <= 1, "Protected pages may omit the mobile dock");
        const dockText = await dock.allTextContents();
        assert.doesNotMatch(dockText.join(" "), /Bots|Groups|Tasks/);
        await expect(page.locator('[data-testid="bot-workspace-home"]')).toHaveCount(0);
        assert.equal(await snapshot(), original);
      }
      step = `${width} ${theme}: return to actual admin`;
      await controls.getByRole("button", { name: "Admin", exact: true }).click();
      await expect(controls.getByRole("button", { name: "Admin", exact: true })).toHaveAttribute("aria-pressed", "true");
      await openMenu();
      assert.deepEqual(await drawer.locator("[data-menu-key]").evaluateAll(elements => elements.map(element => element.dataset.menuKey).sort()), originalAdminKeys);
      assert.deepEqual(await drawer.locator("[data-menu-workspace]").evaluateAll(elements => elements.map(element => element.dataset.menuWorkspace)), originalAdminWorkspaces);
      await closeMenu();
      assert.equal(await snapshot(), original); assert.deepEqual(errors, []); assert.deepEqual(attemptedWrites, []);
      results.push({ width, theme, actualApp: true, tiers, restocksAndOccasionalSellingRetained: true, privilegedMenuAndSearchHiddenInPreview: true, directOwnerRoutesSuppressedInPreview: true, settingsAvailable: true, actualRoleAndRecordsUnchanged: true, adminToolsRestore: true, errors });
      console.log(`PASS actual menu ${width} ${theme}: 5 tiers, owner previews, settings, restored admin and preserved records.`);
      await context.close();
    }
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ syntheticOnly: true, results }, null, 2));
  } catch (error) {
    console.error(`FAILED ${step}`);
    if (lastPage && !lastPage.isClosed()) {
      await lastPage.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
      fs.writeFileSync(path.join(output, "failure.txt"), `${step}\n${lastPage.url()}\n${await lastPage.locator("body").innerText().catch(() => "No body")}`);
    }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
