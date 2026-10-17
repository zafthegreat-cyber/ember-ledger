const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname));
const output = path.resolve("artifacts/qa/private-beta-candidate/performance/modal-lifetime");

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch(); const results = [];
  try {
    for (const width of [360, 1440]) for (const action of ["close-before-arrival", "retain-chosen-focus"]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
      let release; const held = new Promise((resolve) => { release = resolve; });
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== base.origin || route.request().method() !== "GET") return route.abort();
        if (url.pathname.endsWith("/AddAnythingContent.jsx")) await held;
        return route.continue();
      });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.goto(new URL("/?betaLocalMode=true", base).href);
        await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible({ timeout: 30000 });
        const add = page.getByRole("button", { name: "Open global Add menu", exact: true }).first();
        await add.click();
        const modal = page.locator(".flow-modal");
        await expect(modal.locator("[data-deferred-modal-loading]")).toBeFocused();
        if (action === "close-before-arrival") {
          await page.keyboard.press("Escape"); await expect(modal).toHaveCount(0); await expect(add).toBeFocused();
          release(); await page.waitForTimeout(800);
          await expect(modal).toHaveCount(0); await expect(add).toBeFocused();
        } else {
          const close = modal.locator(".modal-close-button");
          await close.focus(); release();
          await expect(modal.getByRole("button", { name: /Add Collection Item with/ })).toBeVisible();
          await expect(close).toBeFocused();
          await page.keyboard.press("Escape"); await expect(add).toBeFocused();
        }
        assert.deepEqual(errors, []); results.push({ width, action, passed: true });
      } finally { release(); await context.close(); }
    }
  } catch (error) { results.push({ passed: false, error: error.message }); throw error; }
  finally { await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2)); }
  console.log(`Deferred modal lifetime: ${results.length}/${results.length} passed.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
