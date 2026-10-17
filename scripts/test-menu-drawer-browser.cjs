const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/menu-refinement");
fs.mkdirSync(output, { recursive: true });
const appUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5217");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(appUrl.hostname), "Synthetic menu checks are loopback only");
const base = appUrl.origin;
const requiredDestinationKeys = [
  "profile", "account", "collections", "membership", "privacySafety", "settings",
  "vault", "exchange", "watchList", "quickAdd", "scout", "tidepool", "parentCenter",
  "shopPortal", "announcements", "scanProduct", "publicBetaFeedback", "help", "feedback", "comingSoon",
];
const requestedWidths = process.env.QA_MENU_WIDTHS?.split(",").map(Number);
const viewports = [{ width: 320, height: 568 }, ...[360, 390, 1440].map(width => ({ width, height: 900 }))].filter(viewport => !requestedWidths || requestedWidths.includes(viewport.width));
assert.ok(viewports.length > 0, "At least one supported viewport must be selected");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  let lastPage;
  let lastStep = "Starting synthetic menu checks";
  try {
    for (const { width, height } of viewports) for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
      await context.route("**/*", (route) => {
        const request = route.request(); const url = new URL(request.url());
        if (url.origin !== base || request.method() !== "GET") return route.abort();
        if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: '{"configured":false}' });
        return route.continue();
      });
      await context.addInitScript(({ theme }) => {
        if (!localStorage.getItem("__qa_menu_seeded")) {
          localStorage.setItem("__qa_menu_seeded", "true");
          localStorage.setItem("et-tcg-app-theme", theme);
          localStorage.setItem("et-tcg-beta-data", JSON.stringify({ items: [{ id: "qa-original-card", name: "Synthetic preserved card", quantity: 2 }], sales: [], expenses: [] }));
        }
      }, { theme });
      const page = await context.newPage(); const errors = [];
      lastPage = page;
      lastStep = `${width} ${theme}: load home and check menu presentation`;
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${base}/?betaLocalMode=true`);
      await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible({ timeout: 30000 });
      const snapshot = () => page.evaluate(() => { const data = JSON.parse(localStorage.getItem("et-tcg-beta-data")); return JSON.stringify([data.items, data.sales, data.expenses]); });
      const before = await snapshot();
      const opener = page.getByRole("button", { name: "Open profile and menu", exact: true });
      // Desktop uses the existing sidebar, so open the real mobile entry point
      // before checking that the drawer survives a responsive desktop resize.
      const open = async () => { if (width > 520) await page.setViewportSize({ width: 390, height }); await opener.click(); await expect(page.getByRole("dialog", { name: "Menu", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Close menu", exact: true })).toBeFocused(); if (width > 520) await page.setViewportSize({ width, height }); };
      await open();
      const drawer = page.getByRole("dialog", { name: "Menu", exact: true });
      const search = drawer.getByRole("searchbox", { name: "Search menu", exact: true });
      const scrollArea = drawer.locator(".drawer-menu-stack");
      const destinationKeys = async () => [...new Set(await drawer.locator("[data-menu-key]").evaluateAll(rows => rows.map(row => row.dataset.menuKey)))].sort();
      const originalKeys = await destinationKeys();
      for (const key of requiredDestinationKeys) assert.ok(originalKeys.includes(key), `Original destination ${key} remains available`);
      await expect(search).toBeVisible();
      for (const key of ["vault", "scanProduct", "scout", "watchList"]) await expect(drawer.locator(`[data-menu-shortcut="${key}"]`)).toBeInViewport({ ratio: 1 });
      assert.equal(await scrollArea.evaluate(element => element.scrollTop), 0, "Quick access requires no scrolling");
      await page.screenshot({ path: path.join(output, `${width}-${theme}-menu-top.png`) });

      const firstSection = drawer.locator("[data-menu-section]").first();
      const firstToggle = firstSection.locator(".menu-section-toggle");
      const initiallyExpanded = await firstToggle.getAttribute("aria-expanded") === "true";
      await firstToggle.click();
      await expect(firstToggle).toHaveAttribute("aria-expanded", String(!initiallyExpanded));
      if (!initiallyExpanded) await page.screenshot({ path: path.join(output, `${width}-${theme}-menu-expanded.png`) });
      await firstToggle.click();
      await expect(firstToggle).toHaveAttribute("aria-expanded", String(initiallyExpanded));
      for (const toggle of await drawer.locator(".menu-section-toggle").all()) {
        if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
      }
      const layout = await drawer.evaluate(element => {
        const box = element.getBoundingClientRect();
        const rows = [...element.querySelectorAll(".menu-command-link")].map(row => {
          const label = row.querySelector("strong").getBoundingClientRect();
          const helper = row.querySelector("small").getBoundingClientRect();
          return { height: row.getBoundingClientRect().height, separateLines: helper.top >= label.bottom + 1, icon: row.querySelector(".menu-command-icon svg").getBoundingClientRect().width };
        });
        return { position: getComputedStyle(element).position, x: box.x, right: box.right, height: box.height, viewport: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth || element.scrollWidth > element.clientWidth, rows, locked: document.body.style.overflow === "hidden" };
      });
      assert.equal(layout.position, "fixed"); assert.equal(layout.overflow, false); assert.ok(layout.x >= 0 && layout.right <= width + 1 && layout.height <= height);
      assert.equal(layout.locked, true); assert.ok(layout.rows.length >= 15);
      assert.ok(layout.rows.every(row => row.separateLines && row.height >= 44 && row.height < 140 && row.icon <= 20));
      await drawer.getByRole("button", { name: "Close menu", exact: true }).focus();
      await page.keyboard.press("Shift+Tab"); await expect(drawer.locator(".drawer-footer-card button").last()).toBeFocused();
      await page.keyboard.press("Tab"); await expect(drawer.getByRole("button", { name: "Close menu" })).toBeFocused();
      await scrollArea.evaluate(element => { element.scrollTop = element.scrollHeight; });
      await expect(drawer.locator("[data-menu-section='roadmap']")).toBeInViewport();
      await expect(drawer.getByRole("button", { name: "Close menu" })).toBeInViewport();
      await expect(search).toBeInViewport({ ratio: 1 });
      await expect(drawer.locator(".drawer-footer-card")).toBeInViewport();
      await page.screenshot({ path: path.join(output, `${width}-${theme}-menu-bottom.png`) });

      await search.fill("cloud");
      await expect(drawer.locator('[data-menu-key="settings"]')).toBeVisible();
      const cloudMatches = await destinationKeys();
      assert.ok(cloudMatches.includes("settings"), "Cloud saving can be found through Settings keywords");
      await search.fill("   ClOuD    SAVING   ");
      assert.deepEqual(await destinationKeys(), cloudMatches, "Search ignores case and repeated whitespace");
      await page.screenshot({ path: path.join(output, `${width}-${theme}-menu-search.png`) });
      await search.fill("qa-no-such-destination-92841");
      await expect(drawer.getByText("No matching pages", { exact: true })).toBeVisible();
      await expect(drawer.locator("[data-menu-key]")).toHaveCount(0);
      await drawer.getByRole("button", { name: "Clear search", exact: true }).click();
      await expect(search).toHaveValue(""); await expect(search).toBeFocused();
      assert.deepEqual(await destinationKeys(), originalKeys, "Clearing search restores every authorized destination");
      await search.fill("alerts");
      await drawer.getByRole("button", { name: "Clear menu search", exact: true }).click();
      await expect(search).toHaveValue(""); await expect(search).toBeFocused();
      await page.keyboard.press("Escape"); await expect(drawer).toHaveCount(0); if (width <= 520) await expect(opener).toBeFocused();
      assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden");
      await open(); await drawer.getByRole("button", { name: "Close menu", exact: true }).click(); await expect(drawer).toHaveCount(0);
      if (width <= 520) await expect(opener).toBeFocused();
      if (width > 520) { await open(); await page.locator(".code3-menu-backdrop").click({ position: { x: 20, y: 200 } }); await expect(drawer).toHaveCount(0); }
      await open(); await drawer.locator(".drawer-footer-card").getByRole("button", { name: /Settings/ }).click(); await page.waitForURL(/\/settings/); await expect(drawer).toHaveCount(0);
      await open(); await expect(drawer.locator('[data-menu-key="settings"]')).toHaveAttribute("aria-current", "page");
      await expect(drawer.locator('[data-menu-section="account"] .menu-section-toggle')).toHaveAttribute("aria-expanded", "true");
      assert.deepEqual(await destinationKeys(), originalKeys);
      await page.screenshot({ path: path.join(output, `${width}-${theme}-menu-active.png`) });
      await page.keyboard.press("Escape"); await page.goBack(); await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible();

      for (const { key, route } of [
        { key: "vault", route: /\/collection(?:\/|\?|$)/ },
        { key: "scout", route: /\/find\/restocks(?:\?|$)/ },
        { key: "watchList", route: /\/scout\/calendar(?:\?|$)/ },
        { key: "exchange", route: /\/exchange(?:\/|\?|$)/ },
      ]) {
        lastStep = `${width} ${theme}: navigate ${key}, reopen menu, and check active route and Back`;
        const previousPath = new URL(page.url()).pathname;
        await open();
        if (key === "exchange") {
          const row = drawer.locator(`[data-menu-key="${key}"]`);
          const section = row.locator("xpath=ancestor::section[@data-menu-section][1]");
          const toggle = section.locator(".menu-section-toggle");
          if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
          await row.click();
        } else await drawer.locator(`[data-menu-shortcut="${key}"]`).click();
        await page.waitForURL(route); await expect(drawer).toHaveCount(0);
        if (key === "vault") await expect(page.getByTestId("collection-workspace")).toBeVisible({ timeout: 30000 });
        if (key === "scout") await expect(page.getByRole("heading", { name: "Open restock intelligence", exact: true })).toBeVisible({ timeout: 30000 });
        if (key === "exchange") {
          await expect(page.getByRole("heading", { name: "Exchange decision desk", exact: true })).toBeVisible({ timeout: 30000 });
          await page.screenshot({ path: path.join(output, `${width}-${theme}-sell-research.png`) });
        }
        if (key === "watchList") {
          const alertsHeading = page.getByRole("heading", { name: "Alerts", exact: true });
          await expect(alertsHeading).toBeVisible({ timeout: 30000 });
          if (width <= 520) {
            await expect(opener).toBeVisible(); await expect(opener).toBeInViewport();
            const header = await page.locator(".topbar").boundingBox();
            const heading = await alertsHeading.boundingBox();
            assert.ok(header && heading && heading.y >= header.y + header.height, "Settled Alerts content does not overlap the retained menu header");
          }
          await page.screenshot({ path: path.join(output, `${width}-${theme}-saved-alerts.png`) });
        }
        await open();
        const activeRow = drawer.locator(`[data-menu-key="${key}"]`);
        await expect(activeRow).toHaveAttribute("aria-current", "page");
        await expect(activeRow).toBeVisible();
        await expect(activeRow.locator("xpath=ancestor::section[@data-menu-section][1]").locator(".menu-section-toggle")).toHaveAttribute("aria-expanded", "true");
        if (key !== "exchange") await expect(drawer.locator(`[data-menu-shortcut="${key}"]`)).toHaveAttribute("aria-current", "page");
        await page.keyboard.press("Escape");
        await page.goBack();
        await expect.poll(() => new URL(page.url()).pathname, { message: `${key} preserves browser Back` }).toBe(previousPath);
      }
      await open(); await drawer.locator(".menu-quick-add").click();
      const quickAdd = page.locator('.flow-modal[data-flow="addActionSheet"]');
      await expect(quickAdd).toBeVisible(); await expect(drawer).toHaveCount(0);
      await page.waitForFunction(() => Boolean(document.activeElement?.closest('.flow-modal[data-flow="addActionSheet"]')));
      await page.screenshot({ path: path.join(output, `${width}-${theme}-quick-add.png`) });
      await page.keyboard.press("Escape"); await expect(quickAdd).toHaveCount(0);
      assert.equal(await snapshot(), before); assert.deepEqual(errors, []);
      results.push({ width, height, theme, navigationItems: originalKeys.length, allOriginalDestinations: true, quickAccessWithoutScrolling: true, groupExpansion: true, searchKeywordsAndClear: true, fixedLayout: true, separateLabelAndHelper: true, compactTouchRows: true, closeAndFocusTrap: true, pinnedSearchHeaderFooter: true, settingsActiveAndBack: true, collectionRestocksAlertsSellActiveAndBack: true, quickAddHandoff: true, recordsUnchanged: true, errors });
      console.log(`PASS real menu ${width}x${height} ${theme}: ${originalKeys.length} destinations, shortcuts, groups, search, layout, focus, navigation, Back, Quick Add and data preservation.`);
      await context.close();
    }
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ createdAt: new Date().toISOString(), realApp: true, syntheticOnly: true, results }, null, 2));
  } catch (error) {
    console.error(`FAILED ${lastStep}`);
    if (lastPage && !lastPage.isClosed()) {
      await lastPage.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
      fs.writeFileSync(path.join(output, "failure-state.txt"), `${lastStep}\n${lastPage.url()}\n${await lastPage.locator("body").innerText().catch(() => "Body unavailable")}`);
    }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

