const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217/");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Synthetic keyboard journeys are loopback only");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/workspace-keyboard/browser");
const dataKey = "ember-and-tide.flip-scout.v1";
const draftKey = "private-business-hub.form-draft.expense.new";
const labels = ["Expenses", "Mileage", "Reports"];
const results = [];

async function settleFrames(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function journey(browser, theme, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", locale: "en-US", serviceWorkers: "block" });
  const blocked = [];
  await context.route("**/*", route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base.origin || request.method() !== "GET") {
      blocked.push({ origin: url.origin, pathname: url.pathname, method: request.method() });
      return route.abort();
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ configured: false, healthy: false, error: "Synthetic local keyboard review: server not configured" }) });
    return route.continue();
  });
  await context.addInitScript(theme => localStorage.setItem("et-tcg-app-theme", theme), theme);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && !/Failed to load resource|net::ERR_|favicon/i.test(message.text())) errors.push(message.text());
  });
  const checks = [];
  let step = "initial load";
  const workspace = () => page.getByTestId("business-workspace");
  const tabs = () => workspace().getByRole("tablist", { name: "Money sections", exact: true });
  const tab = label => tabs().getByRole("tab", { name: label, exact: true });
  const panel = label => workspace().getByRole("tabpanel", { name: label, exact: true });
  const records = () => page.evaluate(key => localStorage.getItem(key), dataKey);
  const routeIs = async view => {
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/business/money/${view}`);
    await settleFrames(page);
  };
  const selectedIs = async label => {
    for (const candidate of labels) await expect(tab(candidate)).toHaveAttribute("aria-selected", String(candidate === label));
    await expect(panel(label)).toBeVisible();
    await expect(workspace().getByRole("tabpanel")).toHaveCount(1);
  };
  const capture = async name => {
    assert.equal(await page.locator(".app").getAttribute("data-theme"), theme, "Saved theme remains selected");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name}: no horizontal overflow`);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    await page.screenshot({ path: path.join(output, `${name}-${theme}-${width}.png`), fullPage: true });
  };
  try {
    await page.goto(new URL("/business/money/expenses?betaLocalMode=true", base).href);
    await tabs().waitFor();
    await page.waitForFunction(() => localStorage.getItem("et-tcg-phase2-data") !== null);
    const beforeRecords = await records();
    await selectedIs("Expenses");
    const associations = await tabs().getByRole("tab").evaluateAll(nodes => nodes.map(node => {
      const panel = document.getElementById(node.getAttribute("aria-controls"));
      return { label: node.textContent.trim(), id: node.id, panelId: panel?.id, role: panel?.getAttribute("role"), labelledBy: panel?.getAttribute("aria-labelledby"), hidden: panel?.hidden, childCount: panel?.childElementCount, tabIndex: node.tabIndex };
    }));
    assert.equal(new Set(associations.map(row => row.id)).size, 3, "Tab IDs are unique");
    assert.equal(new Set(associations.map(row => row.panelId)).size, 3, "Every tab owns its own panel");
    for (const row of associations) {
      assert.ok(row.id && row.panelId, `${row.label} has a concrete linked panel`);
      assert.equal(row.role, "tabpanel");
      assert.equal(row.labelledBy, row.id);
      assert.equal(row.hidden, row.label !== "Expenses");
      if (row.hidden) assert.equal(row.childCount, 0, "Inactive panels do not mount forms or report state");
      assert.equal(row.tabIndex, row.label === "Expenses" ? 0 : -1);
    }
    checks.push("Unique reciprocal tab/panel associations with one selected tab and unmounted inactive content");

    step = "focus-only navigation";
    await tab("Expenses").focus();
    const initialHistory = await page.evaluate(() => history.length);
    for (const [key, destination] of [["ArrowRight", "Mileage"], ["End", "Reports"], ["ArrowRight", "Expenses"], ["ArrowLeft", "Reports"], ["Home", "Expenses"], ["ArrowRight", "Mileage"]]) {
      await page.keyboard.press(key);
      await expect(tab(destination)).toBeFocused();
      await selectedIs("Expenses");
      await routeIs("expenses");
      assert.equal(await page.evaluate(() => history.length), initialHistory, "Roving focus does not add browser history");
      assert.equal(await tabs().getByRole("tab").evaluateAll(nodes => nodes.filter(node => node.tabIndex === 0).length), 1);
    }
    const ring = await tab("Mileage").evaluate(node => ({ width: parseFloat(getComputedStyle(node).outlineWidth), style: getComputedStyle(node).outlineStyle, color: getComputedStyle(node).outlineColor }));
    assert.ok(ring.width >= 2 && ring.style !== "none" && ring.color !== "rgba(0, 0, 0, 0)", "Keyboard focus remains visibly outlined");
    const targets = await tabs().getByRole("tab").evaluateAll(nodes => nodes.map(node => ({ label: node.textContent, height: node.getBoundingClientRect().height, width: node.getBoundingClientRect().width })));
    for (const target of targets) assert.ok(target.height >= 43.5 && target.width >= 43.5, `${target.label} has a 44px touch target`);
    await capture("money-keyboard-focus");
    checks.push("Arrow wrap, Home/End, one roving tab stop, visible focus, 44px targets, no arrow route/history changes");

    step = "manual activation and browser history";
    await page.keyboard.press("Tab");
    await expect(workspace().locator(".everyday-more-menu summary")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(tab("Expenses")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(tab("Mileage")).toBeFocused();
    await page.keyboard.press("Enter");
    await routeIs("mileage"); await selectedIs("Mileage"); await expect(tab("Mileage")).toBeFocused();
    assert.equal(await page.evaluate(() => history.length), initialHistory + 1, "Enter creates only the chosen navigation entry");
    await page.keyboard.press("ArrowLeft"); await expect(tab("Expenses")).toBeFocused();
    await page.keyboard.press("Space");
    await routeIs("expenses"); await selectedIs("Expenses"); await expect(tab("Expenses")).toBeFocused();
    await tab("Reports").click();
    await routeIs("reports"); await selectedIs("Reports"); await expect(tab("Reports")).toBeFocused();
    await expect(panel("Reports").getByRole("heading", { name: "Booth & channel statement", exact: true })).toBeVisible();
    await expect(panel("Reports").getByLabel("Channel / booth", { exact: true })).toBeVisible();
    await expect(workspace().getByRole("heading", { name: "Booth & channel statement", exact: true })).toHaveCount(1);
    await capture("money-reports");
    await page.goBack(); await routeIs("expenses"); await selectedIs("Expenses");
    await page.goBack(); await routeIs("mileage"); await selectedIs("Mileage");
    await page.goForward(); await routeIs("expenses"); await selectedIs("Expenses");
    await page.goForward(); await routeIs("reports"); await selectedIs("Reports");
    checks.push("Tab re-entry returns to the selected tab; Enter, Space, and click activate one route; activation retains tab focus; browser Back/Forward restore selection");
    checks.push("Reports and booth statement belong to the selected Reports panel");

    step = "reconciliation overflow navigation";
    const more = workspace().locator(".everyday-more-menu");
    await tab("Reports").focus(); await page.keyboard.press("Tab");
    await expect(more.locator("summary")).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(more.getByRole("button", { name: "Reconciliation", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(more).toHaveJSProperty("open", false);
    await expect(more.locator("summary")).toBeFocused();
    await routeIs("reports");
    await page.keyboard.press("Enter"); await page.keyboard.press("Tab");
    await expect(more.getByRole("button", { name: "Reconciliation", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await routeIs("reconciliation");
    await expect(more).toHaveJSProperty("open", false);
    await expect(workspace().getByRole("region", { name: "Reconciliation", exact: true })).toBeVisible();
    await expect(workspace().getByRole("tabpanel")).toHaveCount(0);
    for (const label of labels) await expect(tab(label)).toHaveAttribute("aria-selected", "false");
    await expect(tab("Expenses")).toHaveAttribute("tabindex", "0");
    assert.equal(await tabs().getByRole("tab").evaluateAll(nodes => nodes.filter(node => node.tabIndex === 0).length), 1);
    await capture("money-reconciliation");
    await page.goBack(); await routeIs("reports"); await selectedIs("Reports");
    await page.goForward(); await routeIs("reconciliation");
    await tab("Expenses").focus(); await page.keyboard.press("Space");
    await routeIs("expenses"); await selectedIs("Expenses");
    checks.push("More is keyboard reachable, Escape restores summary focus, selection closes the disclosure; Reconciliation has its own named region and a reachable primary tab fallback");

    step = "real expense draft cancellation and reload";
    await panel("Expenses").getByRole("button", { name: "Add Expense", exact: true }).first().click();
    const draftText = `Synthetic keyboard draft ${theme} ${width}`;
    await page.getByLabel(/^Description(?:\s|$)/).fill(draftText);
    await page.getByLabel("Merchant", { exact: true }).fill("Synthetic keyboard review");
    await expect.poll(() => page.evaluate(key => JSON.parse(sessionStorage.getItem(key) || "null")?.description, draftKey)).toBe(draftText);
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByLabel(/^Description(?:\s|$)/)).toHaveValue(draftText);
    await page.reload(); await tabs().waitFor(); await selectedIs("Expenses");
    await panel("Expenses").getByRole("button", { name: "Add Expense", exact: true }).first().click();
    await expect(page.getByLabel(/^Description(?:\s|$)/)).toHaveValue(draftText);
    await expect(page.getByLabel("Merchant", { exact: true })).toHaveValue("Synthetic keyboard review");
    await capture("money-preserved-draft");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await selectedIs("Expenses");
    assert.equal(await page.evaluate(key => sessionStorage.getItem(key), draftKey), null, "Confirmed discard clears only the temporary form draft");
    assert.equal(await records(), beforeRecords, "Navigation, reports and discarded drafts preserve saved business records");
    checks.push("Real expense draft survives declined cancellation and reload; confirmed discard returns to the selected panel without saved-record writes");

    step = "shared Collection More regression";
    await page.goto(new URL("/collection?betaLocalMode=true", base).href);
    const collection = page.getByTestId("collection-workspace");
    const collectionMore = collection.locator(".everyday-more-menu");
    await collection.getByLabel("Search collection", { exact: true }).fill("Synthetic keyboard filter");
    await collectionMore.locator("summary").focus(); await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(collectionMore.getByRole("button", { name: "Sets & Binders", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(collectionMore).toHaveJSProperty("open", false);
    await expect(collectionMore.locator("summary")).toBeFocused();
    await page.keyboard.press("Enter"); await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
    await expect(collectionMore.getByRole("button", { name: "Wishlist", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/collection/wishlist");
    await expect(collection.getByRole("heading", { name: "Wishlist", exact: true }).first()).toBeVisible();
    await expect(collectionMore).toHaveJSProperty("open", false);
    await collection.getByRole("button", { name: "Back to Collection", exact: true }).click();
    await expect(collection.getByLabel("Search collection", { exact: true })).toHaveValue("Synthetic keyboard filter");
    await capture("collection-more-preserved-search");
    assert.equal(await records(), beforeRecords, "Shared disclosure navigation preserves saved collection and business records");
    assert.deepEqual(errors, [], "No browser runtime or React errors");
    checks.push("Shared Collection More preserves keyboard Escape/selection, Back, search state, and saved records");
    results.push({ theme, width, passed: true, checks, blockedRequests: blocked, screenshots: ["money-keyboard-focus", "money-reports", "money-reconciliation", "money-preserved-draft", "collection-more-preserved-search"].map(name => `${name}-${theme}-${width}.png`) });
    console.log(`PASS workspace keyboard ${theme} ${width}: ${checks.length} contract groups`);
  } catch (error) {
    await page.screenshot({ path: path.join(output, `failure-${theme}-${width}.png`), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(output, `failure-${theme}-${width}.txt`), `${step}\n${error.stack}\n\n${await page.locator("body").innerText().catch(() => "")}`);
    throw error;
  } finally { await context.close(); }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) await journey(browser, theme, width);
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ passed: results.length, expected: 4, results }, null, 2));
  }
  console.log(`Workspace keyboard browser: ${results.length}/4 contexts passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
