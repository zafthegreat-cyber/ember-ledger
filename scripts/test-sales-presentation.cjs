const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

// Real local Sales route, isolated synthetic records, no external requests.
const root = path.resolve(__dirname, "..");
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname));
const output = path.join(root, "artifacts/qa/sales-presentation");
fs.mkdirSync(output, { recursive: true });
const sale = {
  id: "synthetic-render-sale", itemName: "Synthetic render card", quantitySold: 1,
  salePrice: 25, finalSalePrice: 25, grossSales: 25, grossSale: 25, saleDate: "2026-09-15",
  costBasis: 10, itemCost: 10, netProceeds: 25, netProfit: 15, estimatedProfitLoss: 15,
  soldAt: "2026-09-15T12:00:00Z", workspaceId: "workspace-personal-local-beta",
  createdAt: "2026-09-15T12:00:00Z",
};
const scope = ".forge-sales-context, .sales-records-summary-panel, .sales-grouped-list, .sales-record-card, .panel:has(> .small-empty-state)";

async function contextFor(browser, width, theme, populated) {
  const context = await browser.newContext({ viewport: { width, height: width === 360 ? 800 : 900 } });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === base.origin || !["http:", "https:"].includes(url.protocol) ? route.continue() : route.abort();
  });
  await context.addInitScript(({ sale, populated }) => {
    if (localStorage.getItem("sales-presentation-fixture")) return;
    localStorage.setItem("sales-presentation-fixture", "true");
    localStorage.setItem("et-tcg-beta-data", JSON.stringify({
      userType: "seller", dashboardPreset: "seller",
      forgeModeSettings: { personalForgeEnabled: true, lockToEmberTide: false },
      sales: populated ? [sale] : [],
    }));
  }, { sale, populated });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL(`/forge/sales?betaLocalMode=true&themeInspect=${theme}`, base).href);
  await expect(page.getByRole("group", { name: "Sales view mode" })).toBeVisible({ timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  return { context, page, errors };
}

async function inspect(page, label) {
  const metrics = await page.evaluate((scope) => {
    const roots = [...document.querySelectorAll(scope)];
    const all = [...new Set(roots.flatMap((node) => [node, ...node.querySelectorAll("*")]))];
    const visible = (node) => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden";
    const failures = [];
    for (const node of all.filter(visible)) {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      if (style.backgroundImage.includes("gradient")) failures.push(`Gradient: ${node.className}`);
      if (node.matches("button, input, summary") && (rect.width < 43.9 || rect.height < 43.9)) failures.push(`Small control: ${node.textContent.trim()} ${rect.width}x${rect.height}`);
      for (const text of node.childNodes) {
        if (text.nodeType !== Node.TEXT_NODE || !text.textContent.trim()) continue;
        if (Number.parseFloat(style.fontSize) < 12) failures.push(`Small text: ${text.textContent.trim()} ${style.fontSize}`);
        const range = document.createRange(); range.selectNodeContents(text);
        for (const textRect of range.getClientRects()) {
          if (textRect.right > document.documentElement.clientWidth + 1 || textRect.left < -1) failures.push(`Offscreen text: ${text.textContent.trim()}`);
          for (let parent = node; parent && !parent.matches("body"); parent = parent.parentElement) {
            const parentStyle = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
            if (/hidden|clip/.test(parentStyle.overflowX) && (textRect.left < bounds.left - 1 || textRect.right > bounds.right + 1)) failures.push(`Clipped text: ${text.textContent.trim()}`);
            if (/hidden|clip/.test(parentStyle.overflowY) && (textRect.top < bounds.top - 1 || textRect.bottom > bounds.bottom + 1)) failures.push(`Clipped text vertically: ${text.textContent.trim()}`);
          }
        }
      }
    }
    const header = document.querySelector(".forge-sales-context");
    const hero = document.querySelector(".et-mockup-page-hero");
    const paragraph = document.querySelector(".sales-records-summary-panel .compact-card-header p");
    const tabs = [...document.querySelectorAll(".forge-section-tab")];
    const sort = [...document.querySelectorAll(".sales-view-mode-grid button")];
    return {
      failures: [...new Set(failures)],
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      headerHeight: header.getBoundingClientRect().height, heroHeight: hero.getBoundingClientRect().height,
      paragraphFont: getComputedStyle(paragraph).fontSize,
      paragraphWhiteSpace: getComputedStyle(paragraph).whiteSpace,
      tabLabels: tabs.map((node) => node.querySelector(".forge-overview-title").textContent),
      tabHeights: tabs.map((node) => node.getBoundingClientRect().height),
      sortHeights: sort.map((node) => node.getBoundingClientRect().height),
    };
  }, scope);
  assert.deepEqual(metrics.failures, [], `${label}: presentation defects`);
  assert.ok(metrics.overflow <= 1, `${label}: document horizontal overflow ${metrics.overflow}`);
  assert.deepEqual(metrics.tabLabels, ["Inventory", "Sales", "Receipts / Expenses", "Mileage", "Taxes"]);
  return metrics;
}

async function checkControls(page) {
  const controls = page.locator(scope).locator("button, input, summary");
  for (let index = 0; index < await controls.count(); index++) {
    const control = controls.nth(index);
    if (!await control.isVisible()) continue;
    await control.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
    const result = await control.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { text: node.textContent.trim() || node.type, hit: hit === node || node.contains(hit), top: rect.top, bottom: rect.bottom, viewport: innerHeight };
    });
    assert.ok(result.hit && result.top >= 0 && result.bottom <= result.viewport, `Control covered: ${JSON.stringify(result)}`);
  }
  // Real keyboard traversal from the receipt action into the lower More action.
  const receipt = page.getByRole("button", { name: "Attach receipt", exact: true }).first();
  if (await receipt.count()) {
    await receipt.focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "More actions", exact: true }).first()).toBeFocused();
    const focus = await page.evaluate(() => {
      const node = document.activeElement, rect = node.getBoundingClientRect(), style = getComputedStyle(node);
      return { top: rect.top, bottom: rect.bottom, height: innerHeight, outline: style.outlineStyle, width: style.outlineWidth };
    });
    assert.ok(focus.top >= 0 && focus.bottom <= focus.height && focus.outline !== "none" && parseFloat(focus.width) >= 2, `Keyboard focus: ${JSON.stringify(focus)}`);
  }
}

async function checkOverview(page, theme, width) {
  const overview = page.locator(".forge-sales-overview");
  await expect(overview).not.toHaveAttribute("open", "");
  const initial = await page.evaluate(() => {
    const title = document.querySelector(".sales-records-summary-panel h1");
    const add = document.querySelector(".sales-records-summary-panel .drawer-inline-actions button");
    const dock = document.querySelector(".ops-mobile-nav");
    const limit = dock?.getClientRects().length ? dock.getBoundingClientRect().top : innerHeight;
    return { contextHeight: document.querySelector(".forge-sales-context").getBoundingClientRect().height, titleBottom: title.getBoundingClientRect().bottom, addBottom: add.getBoundingClientRect().bottom, limit };
  });
  assert.ok(initial.titleBottom < initial.limit && initial.addBottom < initial.limit, `Sales title/Add Sale must appear before the fold: ${JSON.stringify(initial)}`);
  await page.screenshot({ path: path.join(output, `default-${theme}-${width}.png`) });
  const summary = overview.locator(":scope > summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(overview).toHaveAttribute("open", "");
  await expect(page.getByRole("heading", { name: "Forge Decision Desk", exact: true })).toBeVisible();
  await expect(overview.locator(".forge-mockup-summary-grid > article")).toHaveCount(4);
  await expect(overview.locator(".forge-mockup-guardrail-strip > span")).toHaveCount(4);
  await expect(overview.locator(".et-mockup-pill-row > .et-mockup-pill")).toHaveCount(3);
  await expect(overview.locator(".et-mockup-today-action")).toContainText("Add inventory");
  await expect(overview.getByRole("button", { name: "Business Records", exact: true })).toBeVisible();
  const expanded = await inspect(page, "expanded Business overview");
  await checkControls(page);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, `overview-${theme}-${width}.png`), fullPage: true });
  await summary.focus();
  await page.keyboard.press("Space");
  await expect(overview).not.toHaveAttribute("open", "");
  await page.evaluate(() => scrollTo(0, 0));
  return { initial, expanded };
}

async function main() {
  const results = [];
  const browser = await chromium.launch({ headless: true });
  try {
    for (const theme of ["light", "dark"]) for (const width of [360, 768, 1440]) {
      const result = { theme, width, states: [] };
      let context, page;
      try {
        ({ context, page, errors: result.pageErrors } = await contextFor(browser, width, theme, true));
        const original = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("et-tcg-beta-data")).sales));
        result.overview = await checkOverview(page, theme, width);
        for (const [button, heading] of [["Newest", "Forge Sales"], ["Oldest", "Forge Sales"], ["By date", "Forge Sales by Date"], ["Same items", "Forge Sales by Item"]]) {
          await page.getByRole("group", { name: "Sales view mode" }).getByRole("button", { name: new RegExp(`^${button}`) }).click();
          await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
          if (button === "Same items") {
            const toggle = page.locator(".sales-group-toggle");
            await toggle.click();
            await expect(toggle).toHaveAttribute("aria-expanded", "true");
            await expect(page.locator(".sales-group-details")).toContainText("Synthetic render card");
          }
          const metrics = await inspect(page, `${theme} ${width} ${button}`);
          await checkControls(page);
          result.states.push({ state: button, ...metrics });
          if (["By date", "Same items"].includes(button)) {
            await page.evaluate(() => scrollTo(0, 0));
            await page.screenshot({ path: path.join(output, `${button === "By date" ? "date" : "item"}-${theme}-${width}.png`), fullPage: true });
          }
        }
        await page.getByRole("button", { name: "More actions", exact: true }).first().click();
        await expect(page.getByRole("menuitem", { name: "Edit", exact: true })).toBeVisible();
        await expect(page.getByRole("menuitem", { name: "Delete", exact: true })).toBeVisible();
        await inspect(page, "open record menu");
        await checkControls(page);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("menu")).toHaveCount(0);
        await page.locator(".sales-analytics-disclosure summary").click();
        await inspect(page, "analytics disclosure");
        await page.locator(".sales-date-range-controls input").first().fill("2027-01-01");
        await expect(page.getByText("No sales in this date range.", { exact: true })).toBeVisible();
        await inspect(page, "filtered empty");
        await page.getByRole("button", { name: "Clear date range", exact: true }).click();
        await expect(page.getByText("No sales in this date range.", { exact: true })).toHaveCount(0);
        assert.equal(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("et-tcg-beta-data")).sales)), original, "Reviewing does not mutate records");
        assert.deepEqual(result.pageErrors, []);
        await context.close();
        ({ context, page, errors: result.emptyPageErrors } = await contextFor(browser, width, theme, false));
        await expect(page.getByText("No sales records yet.", { exact: true })).toBeVisible();
        result.states.push({ state: "Empty", ...await inspect(page, "empty sales") });
        await checkControls(page);
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: path.join(output, `empty-${theme}-${width}.png`), fullPage: true });
        assert.deepEqual(result.emptyPageErrors, []);
        result.passed = true;
        console.log(`PASS ${theme} ${width}: four views, empty/filter, analytics, More, keyboard, sizing/text/gradient/overflow`);
      } catch (error) {
        result.passed = false; result.error = error.stack;
        await page?.screenshot({ path: path.join(output, `failure-${theme}-${width}.png`), fullPage: true }).catch(() => {});
        console.error(`FAIL ${theme} ${width}: ${error.message}`);
      } finally { await context?.close(); results.push(result); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2)); }
  assert.ok(results.length === 6 && results.every((entry) => entry.passed), "See sales-presentation/results.json");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
