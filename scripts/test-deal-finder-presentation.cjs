const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

function contrastRatio(foreground, background) {
  const luminance = (color) => {
    const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function checkPresentation(modal, theme) {
  const metrics = await modal.evaluate((dialog) => {
    const visible = (element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
    const helpers = [...dialog.querySelectorAll("p, small, .status-badge, .field-label-row > span")].filter(visible);
    const controls = [...dialog.querySelectorAll("button, input, select, summary")].filter(visible);
    const footer = dialog.querySelector(".modal-sticky-footer");
    const calculate = dialog.querySelector(".tidetradr-deal-panel > .form > button");
    const primary = getComputedStyle(calculate);
    const surfaceBehind = (element) => {
      let current = element;
      while (current) {
        const color = getComputedStyle(current).backgroundColor;
        if (color !== "transparent" && color !== "rgba(0, 0, 0, 0)") return color;
        current = current.parentElement;
      }
      return "rgb(255, 255, 255)";
    };
    return {
      overflow: dialog.scrollWidth - dialog.clientWidth,
      helpers: helpers.map((element) => ({ text: element.textContent.trim(), size: parseFloat(getComputedStyle(element).fontSize), foreground: getComputedStyle(element).color, background: surfaceBehind(element), overflowX: element.scrollWidth - element.clientWidth, overflowY: element.scrollHeight - element.clientHeight })),
      controls: controls.map((element) => {
        const bounds = element.getBoundingClientRect();
        return { label: element.getAttribute("aria-label") || element.textContent.trim() || element.type, width: bounds.width, height: bounds.height, left: bounds.left, right: bounds.right };
      }),
      surfaces: [...dialog.querySelectorAll(".status-badge, .empty-state, .deal-results-grid .card, details, .modal-sticky-footer")].filter(visible).map((element) => getComputedStyle(element).backgroundImage),
      primary: { background: primary.backgroundColor, color: primary.color },
      footer: { top: footer.getBoundingClientRect().top, background: getComputedStyle(footer).backgroundColor, buttonBackground: getComputedStyle(footer.querySelector("button")).backgroundColor },
      titlesAndActions: [dialog.querySelector("#deal-finder-title"), calculate].map((element) => {
        const bounds = element.getBoundingClientRect();
        return { text: element.textContent.trim(), top: bounds.top, bottom: bounds.bottom, overflowX: element.scrollWidth - element.clientWidth, overflowY: element.scrollHeight - element.clientHeight };
      }),
      viewportWidth: innerWidth,
    };
  });
  assert.ok(metrics.overflow <= 1, `Dialog horizontal overflow: ${metrics.overflow}px`);
  for (const helper of metrics.helpers) {
    assert.ok(helper.size >= 13, `${helper.text} helper is too small: ${helper.size}px`);
    helper.contrast = contrastRatio(helper.foreground, helper.background);
    assert.ok(helper.contrast >= 4.5, `${helper.text} lacks readable contrast: ${helper.contrast.toFixed(2)}:1`);
    assert.ok(helper.overflowX <= 1 && helper.overflowY <= 1, `${helper.text} must wrap without clipping`);
  }
  for (const control of metrics.controls) {
    assert.ok(control.width >= 44 && control.height >= 44, `${control.label} is smaller than 44px (${control.width}x${control.height})`);
    assert.ok(control.left >= -1 && control.right <= metrics.viewportWidth + 1, `${control.label} exceeds the viewport`);
  }
  assert.ok(metrics.surfaces.every((image) => image === "none"), "Dialog surfaces must not retain decorative gradients");
  const surface = theme === "dark" ? "rgb(26, 34, 45)" : "rgb(255, 255, 255)";
  assert.equal(metrics.footer.background, surface, "Sticky footer must be opaque");
  assert.equal(metrics.footer.buttonBackground, surface, "Close remains a secondary action");
  assert.equal(metrics.primary.background, theme === "dark" ? "rgb(103, 200, 187)" : "rgb(15, 118, 110)");
  assert.equal(metrics.primary.color, theme === "dark" ? "rgb(16, 44, 39)" : "rgb(255, 255, 255)");
  metrics.primary.contrast = contrastRatio(metrics.primary.color, metrics.primary.background);
  assert.ok(metrics.primary.contrast >= 4.5, "Primary action label must maintain readable contrast");
  assert.ok(metrics.titlesAndActions.every((element) => element.overflowX <= 1 && element.overflowY <= 1), "Dialog title and Calculate action must render their full text");
  return metrics;
}

async function assertFocusClear(locator, modal) {
  await expect(locator).toBeFocused();
  const focus = await locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const dialog = element.closest(".deal-finder-modal");
    return {
      top: bounds.top, bottom: bounds.bottom,
      footerTop: dialog.querySelector(".modal-sticky-footer").getBoundingClientRect().top,
      outline: parseFloat(getComputedStyle(element).outlineWidth),
    };
  });
  assert.ok(focus.outline >= 2, "Keyboard focus must be visible");
  assert.ok(focus.top >= 0 && focus.bottom + focus.outline <= focus.footerTop, "Focused control must clear the sticky footer");
  await expect(modal).toBeVisible();
  return focus;
}

(async () => {
  const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217/");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Synthetic Deal Finder verification is local-only");
  const output = path.resolve(__dirname, "../artifacts/qa/release-readiness/deal-finder");
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 360 ? 800 : 900 } });
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (!["GET", "HEAD"].includes(route.request().method())) return route.abort();
        return url.origin === base.origin || !["http:", "https:"].includes(url.protocol) ? route.continue() : route.abort();
      });
      await context.addInitScript(() => {
        if (localStorage.getItem("synthetic-deal-presentation")) return;
        localStorage.setItem("synthetic-deal-presentation", "1");
        localStorage.setItem("et-tcg-beta-data", JSON.stringify({
          userType: "seller", dashboardPreset: "seller", forgeModeSettings: { personalForgeEnabled: true, lockToEmberTide: false },
          catalogProducts: [{ id: "synthetic-deal-product", name: "Synthetic comparison booster bundle", sourceType: "manual", catalogType: "sealed", marketPrice: 30, msrpPrice: 20 }],
          tideTradrWatchlist: [{ id: "synthetic-deal-watch", productId: "synthetic-deal-product", name: "Synthetic comparison booster bundle", workspaceId: "workspace-personal-local-beta" }],
        }));
        localStorage.setItem("et-tcg-phase2-data", JSON.stringify({ dealFinderSessions: [], dealFinderItems: [] }));
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const result = { theme, width };
      const screenshot = (state) => page.screenshot({ path: path.join(output, `${state}-${theme}-${width}.png`) });
      try {
        await page.goto(new URL(`/exchange/market?betaLocalMode=true&themeInspect=${theme}`, base).href);
        const product = page.locator(".market-v4-result-row").filter({ hasText: "Synthetic comparison booster bundle" });
        await expect(product).toBeVisible({ timeout: 30000 });
        await product.getByRole("button", { name: "Compare", exact: true }).click();
        const modal = page.locator(".deal-finder-modal");
        await expect(modal).toBeVisible();
        await expect(modal.getByLabel("Deal Title", { exact: true })).toHaveValue("Synthetic comparison booster bundle");
        await expect(modal.getByRole("combobox").first()).toHaveValue("synthetic-deal-product");
        await expect(modal.getByRole("heading", { name: "Enter a product and asking price to see if it is a good deal.", exact: true })).toBeVisible();
        result.empty = await checkPresentation(modal, theme);
        assert.ok(result.empty.titlesAndActions.every((element) => element.top >= 0 && element.bottom <= result.empty.footer.top), "On initial open, both the full dialog title and Calculate action must be visible above the sticky footer");
        await screenshot("empty");

        await modal.getByRole("button", { name: "Close Deal Finder", exact: true }).focus();
        await page.keyboard.press("Tab");
        await expect(modal.getByRole("combobox").first()).toBeFocused();
        const calculate = modal.getByRole("button", { name: "Calculate & Save Deal", exact: true });
        await calculate.focus();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
        result.calculateFocus = await assertFocusClear(calculate, modal);
        await page.keyboard.press("Enter");
        await expect(page.getByText("Add asking price and market total before saving a deal session.", { exact: true })).toBeVisible();
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("et-tcg-phase2-data")).dealFinderSessions.length), 0);
        await screenshot("validation");

        const details = modal.locator("details");
        await details.locator("summary").focus();
        await page.keyboard.press("Enter");
        await expect(details).toHaveAttribute("open", "");
        await modal.getByLabel("Quantity", { exact: true }).fill("2");
        await expect(modal.getByLabel("Market Total", { exact: true })).toHaveValue("60");
        await expect(modal.getByLabel("Retail / MSRP Total", { exact: true })).toHaveValue("40");
        await modal.getByLabel("Asking Price", { exact: true }).fill("25");
        await modal.getByLabel("Notes", { exact: true }).fill("Synthetic draft only. No purchase or external save.");
        await expect(modal.locator(".deal-results-grid .card")).toHaveCount(6);
        result.populated = await checkPresentation(modal, theme);
        await modal.evaluate((dialog) => { dialog.scrollTop = 0; });
        await screenshot("details");
        await modal.getByRole("button", { name: "Add item from this deal", exact: true }).focus();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
        result.resultFocus = await assertFocusClear(modal.getByRole("button", { name: "Add item from this deal", exact: true }), modal);
        await screenshot("results");

        await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("et-tcg-beta-data")).dealForm?.notes)).toBe("Synthetic draft only. No purchase or external save.");
        await page.keyboard.press("Escape");
        await expect(modal).toHaveCount(0);
        await page.getByRole("button", { name: /^Check deal/i }).first().click();
        await expect(modal.getByLabel("Asking Price", { exact: true })).toHaveValue("25");
        await expect(modal.getByLabel("Quantity", { exact: true })).toHaveValue("2");
        await details.locator("summary").click();
        await expect(modal.getByLabel("Notes", { exact: true })).toHaveValue("Synthetic draft only. No purchase or external save.");
        await modal.getByRole("button", { name: "Close Deal Finder", exact: true }).click();
        await page.reload();
        await expect(product).toBeVisible({ timeout: 30000 });
        await page.getByRole("button", { name: /^Check deal/i }).first().click();
        await expect(modal.getByLabel("Deal Title", { exact: true })).toHaveValue("Synthetic comparison booster bundle");
        await expect(modal.getByLabel("Asking Price", { exact: true })).toHaveValue("25");
        await expect(modal.getByLabel("Quantity", { exact: true })).toHaveValue("2");
        await details.locator("summary").click();
        await expect(modal.getByLabel("Notes", { exact: true })).toHaveValue("Synthetic draft only. No purchase or external save.");
        await screenshot("draft-restored");
        const stored = await page.evaluate(() => ({ beta: JSON.parse(localStorage.getItem("et-tcg-beta-data")), phase2: JSON.parse(localStorage.getItem("et-tcg-phase2-data")) }));
        assert.equal(stored.phase2.dealFinderSessions.length, 0, "Invalid save and preview must not create a deal session");
        assert.equal(stored.phase2.dealFinderItems.length, 0);
        assert.equal(stored.beta.catalogProducts.find((entry) => entry.id === "synthetic-deal-product").marketPrice, 30);
        await modal.getByRole("button", { name: "Close", exact: true }).click();
        await expect(modal).toHaveCount(0);
        assert.deepEqual(errors, []);
        result.passed = true;
        console.log(`PASS Deal Finder ${theme} ${width}: Compare seed, empty/error, 44px controls, readable helpers, keyboard/disclosure, results, Escape/Close/reload draft, no saved deals`);
      } catch (error) {
        result.passed = false; result.error = error.message; result.pageErrors = errors;
        await screenshot("failure").catch(() => {});
        console.error(`FAIL Deal Finder ${theme} ${width}: ${error.message}`);
      } finally { results.push(result); await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2)); }
  assert.ok(results.length === 4 && results.every((result) => result.passed), "See deal-finder/results.json");
})().catch((error) => { console.error(error); process.exitCode = 1; });
