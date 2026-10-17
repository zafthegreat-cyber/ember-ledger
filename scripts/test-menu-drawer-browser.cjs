const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/menu-polish");
fs.mkdirSync(output, { recursive: true });
const appUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5217");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(appUrl.hostname), "Synthetic menu checks are loopback only");
const base = appUrl.origin;
(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const width of [360, 390, 1440]) for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
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
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${base}/?betaLocalMode=true`);
      await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible({ timeout: 30000 });
      const snapshot = () => page.evaluate(() => { const data = JSON.parse(localStorage.getItem("et-tcg-beta-data")); return JSON.stringify([data.items, data.sales, data.expenses]); });
      const before = await snapshot();
      const opener = page.getByRole("button", { name: "Open profile and menu", exact: true });
      // Desktop uses the existing sidebar, so open the real mobile entry point
      // before checking that the drawer survives a responsive desktop resize.
      const open = async () => { if (width > 520) await page.setViewportSize({ width: 390, height: 900 }); await opener.click(); await expect(page.getByRole("dialog", { name: "Menu", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Close menu", exact: true })).toBeFocused(); if (width > 520) await page.setViewportSize({ width, height: 900 }); };
      await open();
      const drawer = page.getByRole("dialog", { name: "Menu", exact: true });
      const layout = await drawer.evaluate(element => {
        const box = element.getBoundingClientRect();
        const rows = [...element.querySelectorAll(".menu-command-link")].map(row => {
          const label = row.querySelector("strong").getBoundingClientRect();
          const helper = row.querySelector("small").getBoundingClientRect();
          return { height: row.getBoundingClientRect().height, separateLines: helper.top >= label.bottom + 1, icon: row.querySelector(".menu-command-icon svg").getBoundingClientRect().width };
        });
        return { position: getComputedStyle(element).position, x: box.x, right: box.right, height: box.height, viewport: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth, rows, locked: document.body.style.overflow === "hidden", labels: [...element.querySelectorAll("[data-menu-key]")].map(row => row.dataset.menuKey) };
      });
      assert.equal(layout.position, "fixed"); assert.equal(layout.overflow, false); assert.ok(layout.x >= 0 && layout.right <= width + 1 && layout.height <= 900);
      assert.equal(layout.locked, true); assert.ok(layout.rows.length >= 15);
      assert.ok(layout.rows.every(row => row.separateLines && row.height >= 44 && row.height < 140 && row.icon <= 20));
      await page.screenshot({ path: path.join(output, `${width}-${theme}-menu-top.png`) });
      await page.keyboard.press("Shift+Tab"); await expect(drawer.locator(".drawer-footer-card button")).toBeFocused();
      await page.keyboard.press("Tab"); await expect(drawer.getByRole("button", { name: "Close menu" })).toBeFocused();
      await drawer.locator(".drawer-menu-stack").evaluate(element => { element.scrollTop = element.scrollHeight; });
      await expect(drawer.locator("[data-menu-section='roadmap']")).toBeInViewport();
      await expect(drawer.getByRole("button", { name: "Close menu" })).toBeInViewport();
      await expect(drawer.locator(".drawer-footer-card")).toBeInViewport();
      await page.screenshot({ path: path.join(output, `${width}-${theme}-menu-bottom.png`) });
      await page.keyboard.press("Escape"); await expect(drawer).toHaveCount(0); if (width <= 520) await expect(opener).toBeFocused();
      assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden");
      if (width > 520) { await open(); await page.locator(".code3-menu-backdrop").click({ position: { x: 20, y: 200 } }); await expect(drawer).toHaveCount(0); }
      await open(); await drawer.locator('[data-menu-key="settings"]').click(); await page.waitForURL(/\/settings/); await expect(drawer).toHaveCount(0);
      await open(); await expect(drawer.locator('[data-menu-key="settings"]')).toHaveAttribute("aria-current", "page");
      assert.deepEqual(await drawer.locator("[data-menu-key]").evaluateAll(rows => rows.map(row => row.dataset.menuKey)), layout.labels);
      await page.screenshot({ path: path.join(output, `${width}-${theme}-menu-active.png`) });
      await page.keyboard.press("Escape"); await page.goBack(); await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible();
      await open(); await drawer.locator(".menu-quick-add").click();
      const quickAdd = page.locator('.flow-modal[data-flow="addActionSheet"]');
      await expect(quickAdd).toBeVisible(); await expect(drawer).toHaveCount(0);
      await page.waitForFunction(() => Boolean(document.activeElement?.closest('.flow-modal[data-flow="addActionSheet"]')));
      await page.screenshot({ path: path.join(output, `${width}-${theme}-quick-add.png`) });
      await page.keyboard.press("Escape"); await expect(quickAdd).toHaveCount(0);
      assert.equal(await snapshot(), before); assert.deepEqual(errors, []);
      results.push({ width, theme, navigationItems: layout.rows.length, fixedLayout: true, separateLabelAndHelper: true, compactTouchRows: true, closeAndFocusTrap: true, pinnedHeaderFooter: true, settingsActiveAndBack: true, quickAddHandoff: true, recordsUnchanged: true, errors });
      console.log(`PASS real menu ${width} ${theme}: ${layout.rows.length} destinations, layout, focus, navigation, Back, Quick Add and data preservation.`);
      await context.close();
    }
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ createdAt: new Date().toISOString(), realApp: true, syntheticOnly: true, results }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

