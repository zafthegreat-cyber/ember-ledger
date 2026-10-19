const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5264/");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Store observation fixtures must stay local");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/restock-store-details-upgrade/store-observations");
fs.mkdirSync(output, { recursive: true });
const cases = [{ width: 320, height: 568, theme: "light" }, { width: 390, height: 844, theme: "dark" }, { width: 1440, height: 900, theme: "dark" }];
const storageKey = "et-tcg-beta-scout";
const storeId = "qa-observation-exact-store";

async function records(page) {
  return page.evaluate(() => JSON.stringify({ scout: localStorage.getItem("et-tcg-beta-scout"), data: localStorage.getItem("et-tcg-beta-data") }));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const testCase of cases) {
      const { width, height, theme } = testCase;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
      const requests = { mutations: [], external: [] }, errors = [];
      await context.route("**/*", route => {
        const request = route.request(), url = new URL(request.url());
        if (!["GET", "HEAD"].includes(request.method())) { requests.mutations.push(`${request.method()} ${url.pathname}`); return route.abort(); }
        if (url.origin !== base.origin) { requests.external.push(url.origin); return route.abort(); }
        if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: '{"configured":false}' });
        return route.continue();
      });
      await context.addInitScript(({ theme, storeId }) => {
        if (localStorage.getItem("__qa_store_observation_seeded")) return;
        localStorage.setItem("__qa_store_observation_seeded", "true");
        localStorage.setItem("et-tcg-app-theme", theme);
        const store = { id: storeId, name: "Observation Test Store", nickname: "Observation Test Store", chain: "Target", city: "Norfolk", region: "Hampton Roads", state: "VA", address: "2 Synthetic Lane", active: true };
        localStorage.setItem("et-tcg-beta-scout", JSON.stringify({ dropRadarSeedDisabled: true, stores: [store, { ...store, id: "qa-observation-other-store", customMarker: "same address, separate exact ID" }], reports: [], items: [], routes: [], customMetadata: { preserve: "entire fixture" } }));
        localStorage.setItem("et-tcg-beta-data", JSON.stringify({ items: [{ id: "preserve-card", name: "Saved card", quantity: 3 }], sales: [{ id: "preserve-sale", salePrice: 12.25 }], expenses: [{ id: "preserve-expense", amount: 3.5 }], catalogProducts: [{ id: "preserve-price", name: "Saved price", marketValue: 37.25 }] }));
      }, { theme, storeId });
      const page = await context.newPage();
      page.setDefaultTimeout(10000); page.on("pageerror", error => errors.push(error.message));
      const result = { ...testCase, requests, errors, states: [] };
      try {
        await page.goto(new URL(`/scout/stores/${storeId}?betaLocalMode=true&themeInspect=${theme}`, base).href);
        const summary = page.locator(".scout-store-observation");
        await expect(summary).toBeVisible({ timeout: 30000 });
        await expect(page.locator(".app[data-theme]")).toHaveAttribute("data-theme", theme);
        const now = Date.now(), date = hours => new Date(now + hours * 3600000).toISOString();
        const report = (id, overrides = {}) => ({ id, storeId, storeName: "Observation Test Store", visibility: "public", stockStatus: "in_stock", productName: id, reportedBy: "Fixture collector", ...overrides });
        const wrongStore = report("Other store must stay separate", { storeId: "qa-observation-other-store", observedAt: date(-0.5), submittedAt: date(-0.1), verified: true });
        const states = [
          { name: "latest-past-exact-id", reports: [report("Old upload must stay old", { observedAt: date(-240), submittedAt: date(-0.1) }), report("Future date must stay future", { observedAt: date(24), submittedAt: date(-0.2), verified: true }), report("Latest empty shelf", { stockStatus: "empty", observedAt: date(-2), submittedAt: date(-2), verificationStatus: "unverified", quantitySeen: "99" }), wrongStore], title: "Latest dated observation", product: "Latest empty shelf", label: "Empty", trust: "Needs confirmation", action: "View report", reportId: "Latest empty shelf" },
          { name: "historical", reports: [report("Historical collector bundle", { observedAt: date(-240), submittedAt: date(-0.1), sourceType: "historical_import", verified: true }), wrongStore], title: "Latest dated observation", product: "Historical collector bundle", label: "In stock", trust: "Historical import · Not live verified", action: "View report", reportId: "Historical collector bundle" },
          { name: "future-only", reports: [report("Future-only pack", { observedAt: date(24), submittedAt: date(-1), verified: true }), wrongStore], title: "No dated observation available", product: "Future-only pack", observed: "Future observation date", action: "View saved report", reportId: "Future-only pack" },
          { name: "unknown-only", reports: [report("Undated collector pack", { observedAt: "not-a-date", submittedAt: date(-0.1) }), wrongStore], title: "No dated observation available", product: "Undated collector pack", observed: "Observation time unavailable", action: "View saved report", reportId: "Undated collector pack" },
          { name: "empty-exact-id", reports: [wrongStore], title: "No stock observations yet" },
        ];
        for (const state of states) {
          await page.evaluate(({ key, reports }) => { const fixture = JSON.parse(localStorage.getItem(key)); fixture.reports = reports; localStorage.setItem(key, JSON.stringify(fixture)); }, { key: storageKey, reports: state.reports });
          await page.reload();
          await expect(summary.getByRole("heading", { name: state.title, exact: true })).toBeVisible({ timeout: 30000 });
          const before = await records(page);
          await expect(summary).not.toContainText("Other store must stay separate");
          await expect(summary).not.toContainText("99");
          if (state.product) await expect(summary).toContainText(state.product);
          if (state.label) await expect(summary.locator(".scout-store-observation__stock")).toHaveText(state.label);
          if (state.trust) await expect(summary.locator(".scout-store-observation__footer p")).toHaveText(state.trust);
          if (state.observed) {
            await expect(summary.locator(".scout-store-observation__signal")).toContainText(state.observed);
            await expect(summary.locator(".scout-store-observation__stock")).toHaveClass(/--other$/);
            await expect(summary).not.toContainText("Observed just now");
          }
          if (state.name === "latest-past-exact-id") { await expect(summary).not.toContainText("Old upload must stay old"); await expect(summary).not.toContainText("Future date must stay future"); }
          if (state.action) {
            const open = summary.getByRole("button", { name: new RegExp(`^${state.action}`) });
            await open.focus(); await page.keyboard.press("Enter");
            const dialog = page.getByRole("dialog", { name: "Observation Test Store", exact: true });
            await expect(dialog).toBeVisible(); await expect(dialog).toContainText(state.reportId);
            await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
            await expect(open).toBeFocused();
          } else await expect(summary.getByRole("button")).toHaveCount(0);
          const metrics = await summary.evaluate(element => {
            const box = element.getBoundingClientRect();
            return { pageOverflow: document.documentElement.scrollWidth - innerWidth, width: box.width, buttons: [...element.querySelectorAll("button")].map(button => { const rect = button.getBoundingClientRect(); return { width: rect.width, height: rect.height, x: rect.x, right: rect.right }; }) };
          });
          assert.ok(metrics.pageOverflow <= 1, `${state.name}: no horizontal overflow`);
          for (const button of metrics.buttons) assert.ok(button.width >= 44 && button.height >= 44 && button.x >= -1 && button.right <= width + 1, `${state.name}: usable in-viewport touch target`);
          assert.equal(await records(page), before, `${state.name}: opening/closing summary preserves every stored byte`);
          await summary.scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(output, `${width}-${theme}-${state.name}.png`) });
          result.states.push({ name: state.name, passed: true, metrics });
        }
        assert.deepEqual(requests, { mutations: [], external: [] }); assert.deepEqual(errors, []);
        result.passed = true;
        console.log(`PASS store observations ${width}/${theme}: exact IDs, observation/upload dates, historical/future/unknown/empty states and unchanged data`);
      } catch (error) {
        result.passed = false; result.error = error.message;
        await page.screenshot({ path: path.join(output, `${width}-${theme}-failure.png`), fullPage: true }).catch(() => {});
      } finally { results.push(result); await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ syntheticOnly: true, actualApp: true, results }, null, 2)); }
  assert.ok(results.every(result => result.passed), `Store observation browser checks failed; see ${path.join(output, "results.json")}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
