const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217/");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Synthetic UI checks must stay local");
const output = path.resolve(__dirname, "../artifacts/qa/release-readiness/scout-store-presentation");
fs.mkdirSync(output, { recursive: true });
const key = "et-tcg-beta-scout";
const id = "seed-target-4554-virginia-beach-blvd-virginia-beach-23462";
const otherId = "store-target-4554-virginia-beach-blvd-23462";
const fixture = {
  dropRadarSeedDisabled: true,
  stores: [{ id, storeId: id, store_id: id, name: "Target - Pembroke", nickname: "Pembroke Target", chain: "Target", address: "4554 Virginia Beach Blvd", city: "Virginia Beach", zip: "23462", active: true, favorite: false, watched: false, customMetadata: { retain: [1, 2] } }],
  reports: [id, otherId].map((storeId, index) => ({ id: `presentation-report-${index}`, storeId, storeName: "Pembroke Target", itemName: index ? "Separate exact-ID report" : "Collector starter supplies", reportDate: "2026-09-14", reportTime: "09:00", visibility: "public", stockStatus: "in_stock", reportedBy: "Local Scout" })),
  items: [id, otherId].map((storeId, index) => ({ id: `presentation-item-${index}`, storeId, name: index ? "Separate exact-ID sighting" : "Trading card storage binder", retailerItemNumber: "QA-LOCAL-482105", sku: "SYNTHETIC-BINDER-120", upc: "000000000000", status: "Unknown" })),
  routes: [{ id: "retained-route", selectedStoreIds: [id] }],
  customEnvelopeMetadata: { unchanged: true },
};

async function assertControls(root) {
  const targets = await root.locator("button:visible, a:visible, summary:visible").evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { text: node.getAttribute("aria-label") || node.textContent.trim(), width: box.width, height: box.height };
  }));
  assert.ok(targets.length > 0);
  assert.deepEqual(targets.filter((target) => target.height < 43.9 || target.width < 43.9), [], "Every visible control must be at least 44 × 44 CSS pixels");
  return targets.length;
}

async function assertNoOverflow(page) {
  const metrics = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
  assert.ok(metrics.scroll <= metrics.width + 1, `Horizontal overflow: ${JSON.stringify(metrics)}`);
}

async function assertFocus(locator) {
  await expect(locator).toBeFocused();
  const style = await locator.evaluate((element) => { const css = getComputedStyle(element); return { style: css.outlineStyle, width: parseFloat(css.outlineWidth) }; });
  assert.notEqual(style.style, "none");
  assert.ok(style.width >= 2, "Keyboard focus must have a visible outline");
}

async function assertReadability(page) {
  const values = await page.evaluate(() => {
    const canvas = document.createElement("canvas").getContext("2d");
    function rgb(value) { canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = value; canvas.fillRect(0, 0, 1, 1); return [...canvas.getImageData(0, 0, 1, 1).data]; }
    function luminance(channels) { return channels.slice(0, 3).map((channel) => { const c = channel / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0); }
    function inspect(selector) {
      const element = document.querySelector(selector), css = getComputedStyle(element);
      let surface = element; while (surface.parentElement && rgb(getComputedStyle(surface).backgroundColor)[3] === 0) surface = surface.parentElement;
      const background = getComputedStyle(surface).backgroundColor, foreground = css.color;
      const a = luminance(rgb(background)), b = luminance(rgb(foreground));
      return { selector, foreground, background, border: css.borderColor, fontSize: parseFloat(css.fontSize), contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
    }
    return [".scout-store-record-breadcrumb", ".scout-metric-label", ".scout-report-meta", ".scout-report-side", ".scout-signal-badge-row .mini-badge", ".scout-tracked-item-card > p", ".scout-store-record-sightings > p", ".scout-store-action-primary", ".scout-store-action-secondary", ".scout-store-action-danger"].map(inspect);
  });
  for (const value of values) { assert.ok(value.fontSize >= 13, `${value.selector} text is too small`); assert.ok(value.contrast >= 4.5, `${value.selector} text contrast ${value.contrast}`); }
  assert.notEqual(values.at(-3).background, values.at(-2).background, "Primary actions must look different from secondary actions");
  assert.notEqual(values.at(-1).foreground, values.at(-2).foreground, "Destructive actions must use danger text");
  const tokens = await page.evaluate(() => { const css = getComputedStyle(document.querySelector(".app[data-theme]")); const swatch = document.createElement("span"); document.body.append(swatch); const result = {}; for (const name of ["action-primary", "on-primary", "status-danger"]) { swatch.style.color = css.getPropertyValue(`--${name}`); result[name] = getComputedStyle(swatch).color; } swatch.remove(); return result; });
  assert.equal(values.at(-3).background, tokens["action-primary"]);
  assert.equal(values.at(-3).foreground, tokens["on-primary"]);
  assert.equal(values.at(-1).foreground, tokens["status-danger"]);
  assert.equal(values.at(-1).border, tokens["status-danger"]);
  return values;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 360 ? 800 : 1000 }, hasTouch: width === 360, colorScheme: theme });
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        return ["GET", "HEAD"].includes(route.request().method()) && (url.origin === base.origin || !["http:", "https:"].includes(url.protocol)) ? route.continue() : route.abort();
      });
      await context.addInitScript(({ storageKey, value }) => { if (!sessionStorage.getItem("scout-presentation-fixture")) { sessionStorage.setItem("scout-presentation-fixture", "1"); localStorage.setItem(storageKey, value); } }, { storageKey: key, value: JSON.stringify(fixture) });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.goto(new URL(`/scout/stores/${id}?betaLocalMode=true&themeInspect=${theme}`, base).href);
        const record = page.locator(".scout-store-record");
        await expect(record.locator(".scout-store-record-heading h2")).toHaveText("Pembroke Target", { timeout: 30000 });
        await expect(record.locator(".scout-tracked-item-card")).toContainText("Trading card storage binder");
        await expect(record.getByText("Separate exact-ID sighting")).toHaveCount(0);
        await expect(record.getByText("Separate exact-ID report")).toHaveCount(0);
        await expect(record.getByText("Admin Edit Store Metadata", { exact: true })).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator(".app[data-theme]")).toHaveAttribute("data-theme", theme);
        const before = await page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
        const controlCount = await assertControls(record);
        const readability = await assertReadability(page);
        await assertNoOverflow(page);
        const meta = await record.locator(".scout-report-meta").first().evaluate((element) => ({ display: getComputedStyle(element).display, gap: getComputedStyle(element).columnGap }));
        assert.equal(meta.display, "flex"); assert.ok(parseFloat(meta.gap) >= 12);
        await page.screenshot({ path: path.join(output, `store-${theme}-${width}.png`), fullPage: true });

        const more = record.locator(".scout-store-record-reports .overflow-menu-button").first();
        await more.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab"); await assertFocus(more);
        await page.keyboard.press("Enter");
        await expect(more).toHaveAttribute("aria-expanded", "true");
        await page.keyboard.press("Tab");
        const view = record.getByRole("menuitem", { name: "View", exact: true });
        await assertFocus(view); await assertControls(record); await assertNoOverflow(page);
        await page.screenshot({ path: path.join(output, `more-${theme}-${width}.png`) });
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog", { name: "Pembroke Target", exact: true });
        await expect(dialog).toBeVisible();
        await assertControls(dialog); await assertNoOverflow(page);
        const details = dialog.locator("summary").filter({ hasText: /^Details/ });
        await expect(dialog.locator(".scout-report-detail-section").first()).toHaveAttribute("open", "");
        await details.focus(); await page.keyboard.press("Enter");
        await expect(dialog.locator(".scout-report-detail-section").first()).not.toHaveAttribute("open", "");
        await page.keyboard.press("Enter");
        await expect(dialog.locator(".scout-report-detail-section").first()).toHaveAttribute("open", "");
        const close = dialog.getByRole("button", { name: "Close", exact: true });
        await close.focus(); await assertFocus(close);
        await page.screenshot({ path: path.join(output, `report-dialog-${theme}-${width}.png`) });
        await page.keyboard.press("Enter"); await expect(dialog).toHaveCount(0);
        const bottom = record.locator(".scout-store-record-history").getByRole("button", { name: "View details", exact: true });
        await bottom.scrollIntoViewIfNeeded(); await expect(bottom).toBeInViewport();
        const bounds = await bottom.boundingBox(); assert.ok(bounds.y + bounds.height <= (width === 360 ? 800 : 1000));
        const bottomVisible = await bottom.evaluate((element) => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); });
        assert.ok(bottomVisible, "Bottom action must remain above the fixed mobile navigation");
        assert.equal(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key), before, "Read-only UI actions must leave all Scout records byte-for-byte unchanged");
        await page.evaluate((storageKey) => { const data = JSON.parse(localStorage.getItem(storageKey)); data.reports = []; data.items = []; localStorage.setItem(storageKey, JSON.stringify(data)); }, key);
        await page.reload();
        await expect(record.getByText("No tracked Scout items yet.", { exact: true })).toBeVisible();
        await expect(record.getByRole("button", { name: "Submit First Report", exact: true })).toBeVisible();
        await assertControls(record); await assertNoOverflow(page);
        const emptyHelperStyles = await record.locator(".scout-store-record-section > p, .scout-store-record-reports > div > p").evaluateAll((elements) => {
          const swatch = document.createElement("span"); swatch.style.color = getComputedStyle(elements[0]).getPropertyValue("--text-secondary"); elements[0].append(swatch); const expected = getComputedStyle(swatch).color; swatch.remove();
          return elements.map((element) => ({ color: getComputedStyle(element).color, expected, fontSize: parseFloat(getComputedStyle(element).fontSize) }));
        });
        for (const style of emptyHelperStyles) { assert.equal(style.color, style.expected); assert.ok(style.fontSize >= 13); }
        await page.screenshot({ path: path.join(output, `empty-${theme}-${width}.png`), fullPage: true });
        assert.deepEqual(errors, []);
        results.push({ theme, width, passed: true, controlCount, metadataGap: meta.gap, readability, checks: ["real exact-ID content", "theme", "44px controls", "no horizontal overflow", "separated metadata", "13px minimum helper text and 4.5:1 text contrast", "primary/secondary/destructive hierarchy", "native keyboard More/View/dialog disclosure/Close", "visible focus", "bottom action reachable and unobscured", "records byte-for-byte unchanged", "empty reports and sightings", "no page errors"] });
        console.log(`PASS ${theme} ${width}: ${controlCount} controls; record, More and dialog checks`);
      } catch (error) {
        await page.screenshot({ path: path.join(output, `failure-${theme}-${width}.png`), fullPage: true });
        throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
