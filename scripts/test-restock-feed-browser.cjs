const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5264/");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Synthetic report browsing must stay local");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/restock-feed-upgrade");
fs.mkdirSync(output, { recursive: true });
const widths = (process.env.QA_FEED_WIDTHS || "320,390,1440").split(",").map(Number);
const cases = widths.flatMap(width => ["light", "dark"].map(theme => ({ width, height: width === 320 ? 568 : width === 390 ? 844 : 900, theme })));

async function records(page) {
  return page.evaluate(() => {
    const scout = JSON.parse(localStorage.getItem("et-tcg-beta-scout"));
    const data = JSON.parse(localStorage.getItem("et-tcg-beta-data"));
    return JSON.stringify({ reports: scout.reports, items: scout.items, collection: data.items, sales: data.sales, expenses: data.expenses, catalog: data.catalogProducts });
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const testCase of cases) {
      const { width, height, theme } = testCase;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
      const writes = [], external = [], errors = [];
      await context.route("**/*", route => {
        const request = route.request(), url = new URL(request.url());
        if (!["GET", "HEAD"].includes(request.method())) { writes.push(`${request.method()} ${url.pathname}`); return route.abort(); }
        if (url.origin !== base.origin) { external.push(url.origin); return route.abort(); }
        if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: '{"configured":false}' });
        return route.continue();
      });
      await context.addInitScript(({ theme }) => {
        if (localStorage.getItem("__qa_feed_seeded")) return;
        localStorage.setItem("__qa_feed_seeded", "true");
        localStorage.setItem("et-tcg-app-theme", theme);
        const now = Date.now(), date = hours => new Date(now + hours * 3600000).toISOString();
        const report = (id, stockStatus, hours, name) => ({ id, storeId: "qa-feed-store", storeName: "North Collectibles", reportType: "Store Restock Report", stockStatus, visibility: "public", sourceType: "user_report", reportedBy: "Fixture collector", productName: name, itemName: name, observedAt: date(hours), reportedAt: date(hours), reportDate: date(hours).slice(0, 10), reportTime: "09:00", note: "Synthetic observation notes retained", quantitySeen: "2", price: "8.50" });
        const reports = [
          ...Array.from({ length: 8 }, (_, i) => report(`recent-${i}`, "in_stock", -2 - i / 60, `Aurora Pack ${i}`)),
          ...Array.from({ length: 5 }, (_, i) => report(`low-${i}`, "low_stock", -10 - i / 60, `Collector Tin ${i}`)),
          ...Array.from({ length: 5 }, (_, i) => report(`empty-${i}`, "empty", -48 - i / 60, `Empty shelf observation ${i}`)),
          ...Array.from({ length: 6 }, (_, i) => ({ ...report(`old-${i}`, "stock_seen", -240 - i / 60, `Vintage Pack ${i}`), submittedAt: date(-1), createdAt: date(-1) })),
          { id: "unknown-date", storeId: "qa-feed-store", storeName: "North Collectibles", stockStatus: "unknown", visibility: "public", productName: "Undated collector supplies", reportedBy: "Fixture collector" },
          report("future", "in_stock", 24, "Future dated fixture"),
        ];
        reports[0].photoUrls = ["/assets/brand/code3tcg-app-icon.svg"];
        localStorage.setItem("et-tcg-beta-scout", JSON.stringify({ dropRadarSeedDisabled: true, stores: [{ id: "qa-feed-store", name: "North Collectibles", nickname: "North Collectibles", chain: "Target", city: "Norfolk", region: "Hampton Roads", state: "VA", address: "1 Synthetic Lane", active: true }], reports, items: [{ id: "retained-sighting", storeId: "qa-feed-store", name: "Retained tracked pack" }] }));
        localStorage.setItem("et-tcg-beta-data", JSON.stringify({ items: [{ id: "retained-card", name: "Retained collection", quantity: 3 }], sales: [], expenses: [], catalogProducts: [{ id: "retained-price", name: "Retained price fixture", sourceType: "manual", marketValue: 37.25 }] }));
      }, { theme });
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      page.setDefaultTimeout(10000);
      try {
        await page.goto(new URL(`/scout/reports?betaLocalMode=true&themeInspect=${theme}`, base).href);
        const feed = page.locator(".scout-reports-landing"), cards = feed.locator(".scout-feed-report-card");
        await expect(feed.getByRole("heading", { name: "Recent restock reports", exact: true })).toBeVisible({ timeout: 30000 });
        await expect(page.locator(".app[data-theme]")).toHaveAttribute("data-theme", theme);
        await expect(cards).toHaveCount(20);
        // Finish the existing deferred seed hydration before comparing saved
        // values. The manual fixture price must survive alongside that seed.
        await page.getByRole("button", { name: "Open global Add menu", exact: true }).filter({ visible: true }).first().click();
        await expect.poll(() => page.evaluate(() => {
          const catalog = JSON.parse(localStorage.getItem("et-tcg-beta-data")).catalogProducts;
          return Boolean(catalog.find(row => row.id === "retained-price" && row.marketValue === 37.25) && catalog.find(row => row.id === "sealed-pokemon-booster-box-assorted"));
        }), { timeout: 30000 }).toBe(true);
        await page.keyboard.press("Escape");
        await expect(page.locator('.flow-modal[data-flow="addActionSheet"]')).toHaveCount(0);
        const original = await records(page);
        await expect(feed.getByRole("status")).toContainText("20 of 26 reports shown");
        await feed.getByRole("button", { name: "Show more reports", exact: true }).click(); await expect(cards).toHaveCount(26);
        await feed.getByRole("button", { name: "Show fewer reports", exact: true }).click(); await expect(cards).toHaveCount(20);
        await feed.getByRole("button", { name: "Stock seen", exact: true }).click(); await expect(cards).toHaveCount(15);
        await expect(feed.getByRole("button", { name: "Stock seen", exact: true })).toHaveAttribute("aria-pressed", "true");
        await feed.getByLabel("Observed", { exact: true }).selectOption("24h"); await expect(cards).toHaveCount(8);
        await feed.getByRole("searchbox", { name: "Search reports", exact: true }).fill("NORFOLK aurora"); await expect(cards).toHaveCount(8);
        const first = cards.first(); await expect(first).toContainText("Aurora Pack 0"); await expect(first).toContainText("Photo attached");
        const button = first.getByRole("button", { name: "View details", exact: true });
        await button.focus(); await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog", { name: "North Collectibles", exact: true });
        await expect(dialog).toBeVisible(); await expect(dialog).toContainText("Aurora Pack 0");
        await dialog.getByRole("button", { name: "Close report details", exact: true }).click(); await expect(dialog).toHaveCount(0);
        await expect(feed.getByRole("searchbox", { name: "Search reports", exact: true })).toHaveValue("NORFOLK aurora"); await expect(cards).toHaveCount(8);
        await feed.getByRole("button", { name: "Low stock", exact: true }).click(); await expect(cards).toHaveCount(0);
        await expect(feed.getByRole("heading", { name: "Try a wider search", exact: true })).toBeVisible();
        await feed.getByRole("button", { name: "Show all reports", exact: true }).click(); await expect(cards).toHaveCount(20);
        await expect(feed.getByRole("searchbox", { name: "Search reports", exact: true })).toBeFocused();
        await feed.getByRole("button", { name: "Low stock", exact: true }).click(); await expect(cards).toHaveCount(5);
        await feed.getByRole("button", { name: "Empty shelves", exact: true }).click(); await expect(cards).toHaveCount(5);
        await feed.getByLabel("Observed", { exact: true }).selectOption("24h"); await expect(cards).toHaveCount(0);
        await feed.getByRole("button", { name: "Clear filters", exact: true }).click(); await expect(cards).toHaveCount(20);
        await expect(feed.getByRole("searchbox", { name: "Search reports", exact: true })).toBeFocused();
        const search = feed.getByRole("searchbox", { name: "Search reports", exact: true });
        await search.focus();
        const focusStyle = await search.evaluate(element => { const css = getComputedStyle(element.parentElement); return { style: css.outlineStyle, width: parseFloat(css.outlineWidth) }; });
        assert.notEqual(focusStyle.style, "none"); assert.ok(focusStyle.width >= 2);
        const metrics = await feed.evaluate(element => {
          const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden";
          const rect = node => { const value = node.getBoundingClientRect(); return { text: node.getAttribute("aria-label") || node.textContent.trim().slice(0, 60), width: value.width, height: value.height, right: value.right, x: value.x }; };
          return { overflow: document.documentElement.scrollWidth - innerWidth, controls: [...element.querySelectorAll("button,input,select")].filter(visible).map(rect), cardHeight: element.querySelector(".scout-feed-report-card").getBoundingClientRect().height };
        });
        assert.ok(metrics.overflow <= 1, `No horizontal overflow: ${metrics.overflow}`);
        for (const control of metrics.controls) { assert.ok(control.width >= 44 && control.height >= 44, `44px touch target: ${JSON.stringify(control)}`); assert.ok(control.x >= -1 && control.right <= width + 1, `Control stays in viewport: ${JSON.stringify(control)}`); }
        await page.screenshot({ path: path.join(output, `${width}-${theme}.png`), fullPage: false });
        if (width === 320 && theme === "dark") {
          await feed.evaluate(element => {
            const textStyles = [...element.querySelectorAll("h2,h3,p,label,button,strong,span,small,input,select")].map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
            for (const [node, size] of textStyles) node.style.setProperty("font-size", `${size * 2}px`, "important");
          });
          await expect(search).toBeVisible();
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(overflow <= 1, `200% report text has no horizontal overflow (${overflow}px)`);
          await page.screenshot({ path: path.join(output, "320-dark-200percent.png") });
        }
        assert.equal(await records(page), original, "Browse/filter/details preserve every report, item and price");
        assert.deepEqual(writes, []); assert.deepEqual(external, []); assert.deepEqual(errors, []);
        results.push({ ...testCase, pagination: true, composedFilters: true, observationNotUploadTime: true, unknownFutureExcludedFromRecent: true, fullDetailsPreserved: true, sourceRecordsUnchanged: true, keyboardFocus: true, metrics, writes, external, errors });
      } catch (error) {
        await page.screenshot({ path: path.join(output, `${width}-${theme}-failure.png`), fullPage: true }).catch(() => {});
        throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ syntheticOnly: true, actualApp: true, results }, null, 2)); }
  console.log(`Restock feed browser passed: ${results.map(row => `${row.width}/${row.theme}`).join(", ")}`);
  console.log(`Evidence: ${output}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
