const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217/");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Collection fixtures must stay local");
const output = path.resolve(__dirname, "../artifacts/qa/release-readiness/legacy-collection-presentation");
fs.mkdirSync(output, { recursive: true });
const key = "et-tcg-beta-data";
const fixtureItems = [
  { id: "Collection-Exact-A", name: "Archive Binder", ownedItemPurpose: "PERSONAL_COLLECTION", status: "Personal Collection", quantity: 2, condition: "Near Mint", conditionNotes: "Sleeves and outer cover reviewed by the collector.", productType: "Supply", projectedResaleMid: 24, allocatedItemCost: 18, buyer: "Family collector", workspaceId: "workspace-personal-local-beta", customMetadata: { keep: [1, 2] } },
  { id: "Collection-Exact-B", name: "Travel Storage Case with Removable Dividers", ownedItemPurpose: "PERSONAL_COLLECTION", status: "Personal Collection", quantity: 1, condition: "Lightly Played", productType: "Supply", workspaceId: "workspace-personal-local-beta" },
];
const results = [];

async function assertControls(scope) {
  const controls = await scope.locator("button:visible, input:visible, select:visible, summary:visible").evaluateAll((nodes) => nodes.map((node) => { const r = node.getBoundingClientRect(); return { name: node.getAttribute("aria-label") || node.textContent.trim().slice(0, 80), width: r.width, height: r.height }; }));
  assert.deepEqual(controls.filter((r) => r.width < 43.9 || r.height < 43.9), [], "Visible controls must be at least 44px in each dimension");
  return controls.length;
}
async function assertFrame(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "No page horizontal overflow");
  const clipped = await page.locator(".vault-collection-summary > div, .vault-home-preview-card, .vault-card-facts p").evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => node.textContent));
  assert.deepEqual(clipped, [], "Collection metrics and facts must not clip text");
}
async function assertFocus(locator) {
  await expect(locator).toBeFocused();
  const css = await locator.evaluate((node) => { const style = getComputedStyle(node); return { width: parseFloat(style.outlineWidth), style: style.outlineStyle }; });
  assert.ok(css.width >= 2 && css.style !== "none", "Keyboard focus must be visible");
}
async function assertMetricAndFactLayout(panel) {
  const groups = await panel.locator(".vault-collection-summary > div, .vault-home-preview-card").evaluateAll((nodes) => nodes.map((node) => {
    const children = [...node.children].map((child) => { const r = child.getBoundingClientRect(); return { tag: child.tagName, top: r.top, bottom: r.bottom, text: child.textContent }; });
    return { display: getComputedStyle(node).display, children };
  }));
  assert.equal(groups.length, 8);
  for (const group of groups) {
    assert.equal(group.display, "grid");
    assert.ok(group.children[1].top >= group.children[0].bottom + 4, "Each metric label is separate from its value");
    assert.ok(group.children[2].top >= group.children[1].bottom + 4, "Each helper is separate from its value");
  }
  const facts = await panel.locator(".vault-item-card .vault-card-facts p").evaluateAll((nodes) => nodes.map((node) => { const label = node.querySelector("span").getBoundingClientRect(), value = node.querySelector("strong").getBoundingClientRect(); return value.top - label.bottom; }));
  assert.ok(facts.length >= 4); assert.ok(facts.every((gap) => gap >= 4), "Record facts have distinct label/value rows");
}
async function assertReadability(panel, populated) {
  const styles = await panel.evaluate((scope, populated) => {
    const canvas = document.createElement("canvas").getContext("2d");
    function rgb(color) { canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = color; canvas.fillRect(0, 0, 1, 1); return [...canvas.getImageData(0, 0, 1, 1).data]; }
    function luminance(color) { return color.slice(0, 3).map((n) => { const c = n / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0); }
    const selectors = [".vault-collection-heading p:last-child", ".vault-heading-actions > button:not(.secondary-button)", ".vault-heading-actions > .secondary-button", ...(populated ? [".vault-collection-summary small", ".vault-home-preview-card small", ".vault-card-facts span", ".inventory-data-prompt.warning"] : [".vault-empty-action-card p"])];
    return selectors.map((selector) => {
      const node = scope.querySelector(selector), css = getComputedStyle(node); let backgroundNode = node;
      while (backgroundNode.parentElement && rgb(getComputedStyle(backgroundNode).backgroundColor)[3] === 0) backgroundNode = backgroundNode.parentElement;
      const background = getComputedStyle(backgroundNode).backgroundColor;
      const a = luminance(rgb(background)), b = luminance(rgb(css.color));
      return { selector, fontSize: parseFloat(css.fontSize), color: css.color, background, contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
    });
  }, populated);
  for (const style of styles) { assert.ok(style.fontSize >= 13, `${style.selector} font size`); assert.ok(style.contrast >= 4.5, `${style.selector} contrast ${style.contrast}`); }
  assert.notEqual(styles[1].background, styles[2].background, "Primary and secondary actions must look different");
  return styles;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) for (const populated of [true, false]) {
      const context = await browser.newContext({ viewport: { width, height: width === 360 ? 800 : 1000 }, hasTouch: width === 360 });
      await context.route("**/*", (route) => { const url = new URL(route.request().url()); return ["GET", "HEAD"].includes(route.request().method()) && (url.origin === base.origin || !["http:", "https:"].includes(url.protocol)) ? route.continue() : route.abort(); });
      await context.addInitScript(({ key, items }) => {
        localStorage.setItem(key, JSON.stringify({ items, userType: "seller", dashboardPreset: "seller", activeWorkspaceId: "workspace-personal-local-beta", customEnvelopeMetadata: { retain: true } }));
        localStorage.setItem("et-tcg-beta-vault-showcase-view", "standard");
      }, { key, items: populated ? fixtureItems : [] });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const name = `${populated ? "populated" : "empty"}-${theme}-${width}`;
      try {
        await page.goto(new URL(`/vault/cards?betaLocalMode=true&themeInspect=${theme}`, base).href, { waitUntil: "networkidle" });
        const panel = page.locator(".vault-collection-panel");
        await expect(panel.getByRole("heading", { name: "Your protected collection", exact: true })).toBeVisible({ timeout: 30000 });
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator(".app[data-theme]")).toHaveAttribute("data-theme", theme);
        await expect(page.locator(".local-storage-save-warning")).toHaveCount(0);
        const before = await page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
        if (populated) {
          await expect(panel.locator(".vault-item-card")).toHaveCount(2);
          await assertMetricAndFactLayout(panel);
        } else {
          await expect(panel.getByRole("heading", { name: "Start with one reviewed item.", exact: true })).toBeVisible();
          await expect(panel.getByRole("button", { name: "Add first item", exact: true })).toBeVisible();
          await expect(panel.locator(".vault-collection-summary")).toHaveCount(0);
        }
        const controls = await assertControls(panel); await assertFrame(page); const readability = await assertReadability(panel, populated);
        await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
        if (populated) {
          const search = panel.getByRole("textbox", { name: "Search collection", exact: true });
          await search.fill("no matching local record");
          await expect(panel.getByRole("heading", { name: "No matching Vault items.", exact: true })).toBeVisible();
          await panel.getByRole("button", { name: "Reset Filters", exact: true }).click();
          await expect(search).toHaveValue(""); await expect(panel.locator(".vault-item-card")).toHaveCount(2);
          const filters = panel.locator(".vault-mobile-filter-drawer > summary");
          await filters.focus(); await page.keyboard.press("Enter"); await assertFocus(filters);
          await expect(panel.getByRole("combobox", { name: "Status", exact: true })).toBeVisible();
          await assertControls(panel); await assertFrame(page);
          await page.screenshot({ path: path.join(output, `filters-${theme}-${width}.png`), fullPage: true });
          await page.keyboard.press("Enter");
          const insights = panel.locator(".vault-detail-disclosure > summary").first();
          await insights.focus(); await page.keyboard.press("Enter"); await assertFocus(insights);
          await expect(panel.locator(".vault-insight-panel")).toBeVisible(); await assertFrame(page);
          await panel.locator(".vault-insight-panel").screenshot({ path: path.join(output, `insights-${theme}-${width}.png`) });
          await page.keyboard.press("Enter");
          const card = panel.locator(".vault-item-card").filter({ has: page.getByRole("heading", { name: "Archive Binder", exact: true }) });
          const more = card.getByRole("button", { name: "More actions", exact: true });
          await more.focus(); await page.keyboard.press("Enter"); await assertFocus(more);
          await expect(more).toHaveAttribute("aria-expanded", "true"); await page.keyboard.press("Tab");
          await assertFocus(card.getByRole("menuitem", { name: "Edit", exact: true }));
          await assertControls(card); await assertFrame(page);
          await page.screenshot({ path: path.join(output, `more-${theme}-${width}.png`) });
          const remove = card.getByRole("menuitem", { name: "Remove from Collection", exact: true });
          await remove.focus(); await assertFocus(remove);
          assert.ok(await remove.evaluate((node) => { const r = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), "Menu scroll reaches its final destructive action without activating it");
          const danger = await remove.evaluate((node) => { const css = getComputedStyle(node); const swatch = document.createElement("span"); swatch.style.color = css.getPropertyValue("--status-danger"); node.append(swatch); const expected = getComputedStyle(swatch).color; swatch.remove(); return { color: css.color, border: css.borderColor, expected }; });
          assert.equal(danger.color, danger.expected); assert.equal(danger.border, danger.expected);
          await page.keyboard.press("Escape"); await expect(more).toHaveAttribute("aria-expanded", "false");
          await card.getByRole("button", { name: "Open Item Profile for Archive Binder", exact: true }).click();
          await expect(panel.locator(".vault-detail-card")).toBeVisible();
          await panel.locator(".vault-detail-card").getByRole("button", { name: "Close", exact: true }).click();
          await expect(panel.locator(".vault-detail-card")).toHaveCount(0);
          const lastAction = panel.locator(".vault-item-card").last().getByRole("button", { name: "More actions", exact: true });
          await lastAction.scrollIntoViewIfNeeded();
          assert.ok(await lastAction.evaluate((node) => { const r = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), "Last item actions stay above fixed navigation");
        }
        assert.equal(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key), before, "Read-only navigation/search/disclosure/profile actions preserve stored records byte-for-byte");
        assert.deepEqual(errors, []);
        results.push({ theme, width, populated, controls, readability, passed: true }); console.log(`PASS ${name}: ${controls} visible controls; layout and storage checks`);
      } catch (error) { await page.screenshot({ path: path.join(output, `failure-${name}.png`), fullPage: true }); fs.writeFileSync(path.join(output, `failure-${name}.json`), JSON.stringify({ message: error.message, errors }, null, 2)); throw error; }
      finally { await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
