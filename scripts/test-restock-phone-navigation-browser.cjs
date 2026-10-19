const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5264/");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Phone navigation checks use disposable loopback data only");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/restock-phone-navigation");
fs.mkdirSync(output, { recursive: true });
const cases = (process.env.QA_PHONE_WIDTHS || "320,390,1440").split(",").map(Number).flatMap(width => ["light", "dark"].filter(theme => !process.env.QA_PHONE_THEME || process.env.QA_PHONE_THEME === theme).map(theme => ({ width, height: width === 320 ? 568 : width === 390 ? 844 : 900, theme })));
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function recordBytes(page) {
  return page.evaluate(() => {
    const scout = JSON.parse(localStorage.getItem("et-tcg-beta-scout"));
    const data = JSON.parse(localStorage.getItem("et-tcg-beta-data"));
    return JSON.stringify({ stores: scout.stores, reports: scout.reports, items: scout.items, collection: data.items, sales: data.sales, expenses: data.expenses, catalog: data.catalogProducts });
  });
}

async function setup(browser, testCase, admin = false) {
  const context = await browser.newContext({ viewport: { width: testCase.width, height: testCase.height }, reducedMotion: "reduce", serviceWorkers: "block" });
  const safety = { blockedWrites: [], blockedExternal: [], pageErrors: [] };
  await context.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    if (!["GET", "HEAD"].includes(request.method())) { safety.blockedWrites.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    if (url.origin !== base.origin) { safety.blockedExternal.push({ origin: url.origin, path: url.pathname, blocked: true }); return route.abort(); }
    if (url.pathname === "/__qa-phone-predecessor") return route.fulfill({ contentType: "text/html", body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><h1>Safe history predecessor</h1>' });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: '{"configured":false}' });
    return route.continue();
  });
  await context.addInitScript(({ theme, admin }) => {
    if (localStorage.getItem("__qa_phone_seeded")) return;
    localStorage.setItem("__qa_phone_seeded", "true");
    localStorage.setItem("et-tcg-app-theme", theme);
    const observed = new Date(Date.now() - 3600000).toISOString();
    const reference = { id: "phone-preserved-price", name: "Preserved manual price", productName: "Preserved manual price", sourceType: "manual", marketValue: 37.25 };
    const report = { id: "phone-original-report", storeId: "phone-north", storeName: "North Collectibles", reportType: "Store Restock Report", stockStatus: "low_stock", visibility: "public", sourceType: "user_report", reportedBy: "Synthetic collector", productName: "Aurora phone navigation fixture", itemName: "Aurora phone navigation fixture", quantitySeen: "2", price: "8.50", note: "Preserve this original observation byte for byte.", observedAt: observed, reportedAt: observed, photoUrls: [], itemsSeen: [{ productName: "Aurora phone navigation fixture", quantity: "2", price: "8.50", note: "Preserved item note" }] };
    const legacyZero = { id: "phone-legacy-zero", storeId: "phone-north", storeName: "North Collectibles", reportType: "Store Restock Report", stockStatus: "empty", visibility: "public", sourceType: "user_report", reportedBy: "Synthetic collector", itemName: "Legacy zero-value fixture", quantitySeen: 0, price: 0, observedAt: observed, reportedAt: observed };
    localStorage.setItem("et-tcg-beta-scout", JSON.stringify({ dropRadarSeedDisabled: true, stores: [{ id: "phone-north", name: "North Collectibles", nickname: "North Collectibles", retailer: "Target", chain: "Target", city: "Norfolk", region: "Hampton Roads", state: "VA", address: "1 Synthetic Lane", active: true }], reports: [report, legacyZero], items: [{ id: "phone-tracked-item", storeId: "phone-north", name: "Preserved tracked pack" }] }));
    localStorage.setItem("et-tcg-beta-data", JSON.stringify({ userType: "collector", dashboardPreset: "simple", ...(admin ? { profile: { userId: "local-beta", email: "phone-qa@example.test", displayName: "Synthetic owner", appRole: "owner", app_role: "owner", userRole: "owner", appAccess: "approved" }, subscriptionProfile: { tier: "admin", featureTier: "admin", subscriptionPlan: "admin", appRole: "owner", app_role: "owner", isAdmin: true, lifetimeAccess: true, subscriptionStatus: "active" } } : {}), items: [{ id: "phone-card", name: "Preserved collection", quantity: 3, marketValue: 51.75 }], sales: [{ id: "phone-sale", salePrice: 12.25 }], expenses: [{ id: "phone-expense", amount: 3.5 }], catalogProducts: [reference] }));
  }, { theme: testCase.theme, admin });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => safety.pageErrors.push(error.message));
  return { context, page, safety };
}

async function warmCatalog(page) {
  await page.getByRole("button", { name: "Open global Add menu", exact: true }).filter({ visible: true }).first().click();
  await expect.poll(() => page.evaluate(() => {
    const catalog = JSON.parse(localStorage.getItem("et-tcg-beta-data")).catalogProducts;
    return Boolean(catalog.find(row => row.id === "phone-preserved-price" && row.marketValue === 37.25) && catalog.find(row => row.id === "sealed-pokemon-booster-box-assorted"));
  }), { timeout: 30000 }).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator('.flow-modal[data-flow="addActionSheet"]')).toHaveCount(0);
  await settle(page);
}

async function filterFeed(page) {
  const feed = page.locator(".scout-reports-landing");
  await expect(feed.getByRole("heading", { name: "Recent restock reports", exact: true })).toBeVisible({ timeout: 30000 });
  await feed.getByRole("searchbox", { name: "Search reports", exact: true }).fill("NORFOLK aurora");
  await feed.getByRole("button", { name: "Low stock", exact: true }).click();
  await feed.getByLabel("Observed", { exact: true }).selectOption("24h");
  await expect(feed.locator(".scout-feed-report-card")).toHaveCount(1);
  return { feed, launch: feed.getByRole("button", { name: "View details", exact: true }) };
}

async function feedUnchanged(page, feed, url) {
  assert.equal(page.url(), url, "Closing a child detail retains the exact route and query");
  await expect(feed.getByRole("searchbox", { name: "Search reports", exact: true })).toHaveValue("NORFOLK aurora");
  await expect(feed.getByRole("button", { name: "Low stock", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(feed.getByLabel("Observed", { exact: true })).toHaveValue("24h");
  await expect(feed.locator(".scout-feed-report-card")).toHaveCount(1);
}

async function assertDialogMetrics(page, dialog, testCase) {
  const metrics = await dialog.evaluate(element => {
    const rect = node => { const value = node.getBoundingClientRect(); return { label: node.getAttribute("aria-label") || node.textContent.trim().slice(0, 60), width: value.width, height: value.height, left: value.left, right: value.right }; };
    return { pageOverflow: document.documentElement.scrollWidth - innerWidth, overflow: element.scrollWidth - element.clientWidth, controls: [...element.querySelectorAll("button")].filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden").map(rect) };
  });
  assert.ok(Math.max(metrics.pageOverflow, metrics.overflow) <= 1, "Dialog fits phone and desktop width");
  for (const control of metrics.controls) { assert.ok(control.width >= 44 && control.height >= 44, `44px target: ${JSON.stringify(control)}`); assert.ok(control.left >= -1 && control.right <= testCase.width + 1, `Control stays inside viewport: ${JSON.stringify(control)}`); }
  return metrics;
}

async function ordinaryCase(browser, testCase) {
  const { context, page, safety } = await setup(browser, testCase);
  const result = { ...testCase, kind: "actual-app-history-and-handoffs", ...safety };
  const url = new URL(`/scout/reports?betaLocalMode=true&themeInspect=${testCase.theme}&phoneQa=retained`, base).href;
  const detail = page.getByRole("dialog", { name: "North Collectibles", exact: true });
  try {
    await page.goto(new URL("/__qa-phone-predecessor", base).href);
    await page.goto(url);
    await expect(page.locator(".scout-reports-landing")).toBeVisible({ timeout: 30000 });
    await warmCatalog(page);
    // Establish a fresh predecessor after seed hydration. The existing global
    // Add flow has its own history owner and is outside this child-detail check.
    await page.goto(new URL("/__qa-phone-predecessor", base).href);
    await page.goto(url);
    await expect(page.locator(".scout-reports-landing")).toBeVisible({ timeout: 30000 });
    const original = await recordBytes(page), initialOverflow = await page.evaluate(() => document.body.style.overflow);
    const zeroLaunch = page.locator(".scout-feed-report-card").filter({ hasText: "Legacy zero-value fixture" }).getByRole("button", { name: "View details", exact: true });
    await zeroLaunch.click(); await expect(detail).toBeVisible();
    await expect(detail.locator(".scout-report-details__item-facts dd")).toHaveText(["0", "0"]);
    await detail.getByRole("button", { name: "Close report details", exact: true }).click();
    await expect(detail).toHaveCount(0); await settle(page);
    assert.equal(await recordBytes(page), original, "Viewing legacy numeric-zero facts cannot normalize or rewrite the stored report");
    result.legacyTopLevelZerosVisibleAndRawBytesPreserved = true;
    let { feed, launch } = await filterFeed(page);
    await launch.focus(); await page.keyboard.press("Enter"); await expect(detail).toBeVisible();
    await expect(detail.getByRole("button", { name: "Close report details", exact: true })).toBeFocused();
    result.metrics = await assertDialogMetrics(page, detail, testCase);
    await page.screenshot({ path: path.join(output, `${testCase.width}-${testCase.theme}-detail.png`) });
    await page.goBack(); await expect(detail).toHaveCount(0); await settle(page);
    await feedUnchanged(page, feed, url); await expect(launch).toBeFocused();
    assert.equal(await page.evaluate(() => document.body.style.overflow), initialOverflow, "Back restores the original body scroll policy");
    await page.goForward(); await expect(detail).toBeVisible();
    await expect(detail).toContainText("Aurora phone navigation fixture");
    await detail.getByRole("button", { name: "Close report details", exact: true }).click();
    await expect(detail).toHaveCount(0); await settle(page); await feedUnchanged(page, feed, url); await expect(launch).toBeFocused();
    await page.goBack(); await expect(page.getByRole("heading", { name: "Safe history predecessor", exact: true })).toBeVisible();
    result.backForwardAndCloseWithoutGhostEntries = true;

    await page.goForward(); ({ feed, launch } = await filterFeed(page));
    await launch.click(); await expect(detail).toBeVisible();
    await page.keyboard.press("Escape"); await expect(detail).toHaveCount(0); await settle(page);
    await feedUnchanged(page, feed, url); await expect(launch).toBeFocused();
    await page.goBack(); await expect(page.getByRole("heading", { name: "Safe history predecessor", exact: true })).toBeVisible();
    result.escapeWithoutGhostEntries = true;

    await page.goForward(); ({ feed, launch } = await filterFeed(page));
    await launch.click(); await expect(detail).toBeVisible();
    await detail.getByRole("button", { name: "Report a new visit", exact: true }).click();
    const report = page.locator('.flow-modal[data-flow="scoutSubmit"]');
    await expect(report.locator(".scout-where-step")).toBeVisible(); await expect(detail).toHaveCount(0);
    await expect(report.locator(".scout-where-step")).toContainText("North Collectibles");
    await settle(page); assert.equal(page.url(), url, "New visit handoff cannot race into a previous page");
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden", "New visit keeps the page scroll locked");
    const observed = await report.locator('input[type="datetime-local"]').inputValue();
    const observedAt = await page.evaluate(value => new Date(value).getTime(), observed);
    assert.ok(Math.abs(Date.now() - observedAt) < 5 * 60000, "New visit starts with the current observation time");
    await report.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(report.getByLabel("Product name (optional)", { exact: true })).toHaveValue("");
    await expect(report.getByLabel("Useful details (optional)", { exact: true })).toHaveValue("");
    await expect(report.locator(".scout-photo-preview")).toHaveCount(0);
    await report.locator(".modal-close-button").click(); await expect(report).toHaveCount(0); await settle(page);
    assert.equal(await recordBytes(page), original, "Cancelling a fresh new visit preserves every old record and price byte");
    result.newVisitFreshAndNonRacing = true;

    await expect(feed).toBeVisible(); await launch.click(); await expect(detail).toBeVisible();
    await detail.getByRole("button", { name: "Add details", exact: true }).click();
    await expect(detail).toHaveCount(0); await settle(page);
    const cancelEdit = page.getByRole("button", { name: "Cancel / Clear", exact: true });
    await expect(cancelEdit).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Report", exact: true })).toBeVisible();
    assert.equal(page.url(), url, "Add details handoff cannot race out of its existing route");
    assert.equal(await recordBytes(page), original, "Opening Add details preserves original observations and prices");
    await cancelEdit.click(); await settle(page);
    assert.equal(await recordBytes(page), original, "Cancelling Add details preserves original observations and prices");
    result.addDetailsNonRacingAndCancelPreservesData = true;
    assert.deepEqual(safety.blockedWrites, []); assert.deepEqual(safety.pageErrors, []);
    result.escapedExternalRequests = 0; result.sourceRecordsAndPricesBytePreserved = true; result.passed = true;
    console.log(`PASS phone history ${testCase.width}/${testCase.theme}`);
  } catch (error) {
    result.passed = false; result.error = error.message;
    fs.writeFileSync(path.join(output, `${testCase.width}-${testCase.theme}-failure.html`), await page.content());
    await page.screenshot({ path: path.join(output, `${testCase.width}-${testCase.theme}-failure.png`) }).catch(() => {});
    console.error(`FAIL phone history ${testCase.width}/${testCase.theme}: ${error.message}`);
  } finally { await context.close(); }
  return result;
}

async function adminCancellationCase(browser, testCase) {
  const { context, page, safety } = await setup(browser, testCase, true);
  const result = { ...testCase, kind: "actual-app-admin-cancellation-only", ...safety, confirmedDelete: false };
  try {
    result.lastStep = "startup";
    await page.goto(new URL(`/scout/reports?betaLocalMode=true&themeInspect=${testCase.theme}&phoneQa=admin-cancel-only`, base).href);
    const controls = page.getByRole("region", { name: "Admin display controls", exact: true });
    await expect(controls).toBeVisible({ timeout: 30000 });
    await controls.getByRole("button", { name: "Admin", exact: true }).click();
    await controls.getByRole("button", { name: "On", exact: true }).click();
    await warmCatalog(page);
    const original = await recordBytes(page);
    const { launch } = await filterFeed(page);
    await launch.click();
    const detail = page.locator(".scout-report-detail-sheet");
    const deleteOpener = detail.getByRole("button", { name: "Delete", exact: true });
    await expect(deleteOpener).toBeVisible();
    await deleteOpener.click();
    const confirmation = page.locator(".scout-delete-confirm-sheet");
    await expect(confirmation).toBeVisible(); await expect(confirmation).toHaveAttribute("aria-modal", "true");
    await expect(confirmation.getByRole("heading", { name: "Delete this report?", exact: true })).toBeVisible();
    const descriptionId = await confirmation.getAttribute("aria-describedby");
    assert.ok(descriptionId, "Delete confirmation exposes an accessible description");
    await expect(page.locator(`[id="${descriptionId}"]`)).toContainText("North Collectibles");
    const cancel = confirmation.getByRole("button", { name: "Cancel", exact: true });
    const destructive = confirmation.getByRole("button", { name: "Delete Report", exact: true });
    await expect(destructive).toBeVisible();
    result.lastStep = "initial Cancel focus";
    await settle(page); await expect(cancel).toBeFocused();
    result.metrics = await assertDialogMetrics(page, confirmation, testCase);
    const focusables = confirmation.locator('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]');
    const nodes = await focusables.elementHandles();
    const visible = [];
    for (const node of nodes) if (await node.isVisible()) visible.push(node);
    assert.ok(visible.length >= 3, "Confirmation keeps explicit Close, Cancel and Delete controls");
    result.lastStep = "keyboard containment";
    await visible.at(-1).focus(); await page.keyboard.press("Tab");
    assert.ok(await visible[0].evaluate(node => node === document.activeElement), "Tab wraps within the confirmation");
    const focusStyle = await visible[0].evaluate(node => ({ style: getComputedStyle(node).outlineStyle, width: parseFloat(getComputedStyle(node).outlineWidth) }));
    assert.ok(focusStyle.style !== "none" && focusStyle.width >= 2, "Confirmation has a visible keyboard focus indicator");
    await page.keyboard.press("Shift+Tab");
    assert.ok(await visible.at(-1).evaluate(node => node === document.activeElement), "Shift+Tab wraps within the confirmation");
    await page.screenshot({ path: path.join(output, `${testCase.width}-${testCase.theme}-admin-cancel-only.png`) });
    if (testCase.width === 320 && testCase.theme === "dark") {
      await confirmation.evaluate(element => {
        const sizes = [...element.querySelectorAll("h2,p,strong,button")].map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
        for (const [node, size] of sizes) node.style.setProperty("font-size", `${size * 2}px`, "important");
      });
      result.text200Metrics = await assertDialogMetrics(page, confirmation, testCase);
      const footer = await confirmation.locator("footer").boundingBox();
      assert.ok(footer.y >= 0 && footer.y + footer.height <= testCase.height + 1, "200% text keeps the cancellation footer reachable");
      await page.screenshot({ path: path.join(output, "320-dark-admin-200percent.png") });
    }
    result.lastStep = "Escape focus return";
    await page.keyboard.press("Escape"); await expect(confirmation).toHaveCount(0); await settle(page);
    await expect(detail).toBeVisible(); await expect(deleteOpener).toBeFocused();
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden", "Escape dismisses only the confirmation and retains parent scroll lock");
    assert.equal(await recordBytes(page), original, "Escape cannot delete or rewrite a record");
    result.lastStep = "explicit Cancel focus return";
    await deleteOpener.click(); await expect(confirmation).toBeVisible(); await settle(page); await expect(cancel).toBeFocused();
    await cancel.click(); await expect(confirmation).toHaveCount(0); await settle(page); await expect(deleteOpener).toBeFocused();
    await expect(detail).toBeVisible();
    assert.equal(await recordBytes(page), original, "Explicit Cancel cannot delete or rewrite a record");
    result.lastStep = "parent Escape focus return";
    await page.keyboard.press("Escape"); await expect(detail).toHaveCount(0); await settle(page); await expect(launch).toBeFocused();
    assert.equal(await recordBytes(page), original, "Closing the parent retains every report, collection and price byte");
    assert.deepEqual(safety.blockedWrites, []); assert.deepEqual(safety.pageErrors, []);
    result.focusTrap = true; result.cancelInitiallyFocused = true; result.escapeAndCancelRestoreOpener = true; result.sourceRecordsAndPricesBytePreserved = true; result.escapedExternalRequests = 0; result.passed = true;
    console.log(`PASS admin cancellation ${testCase.width}/${testCase.theme}`);
  } catch (error) {
    result.passed = false; result.error = error.message;
    result.focusAtFailure = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim().slice(0, 120), parentInert: document.querySelector(".scout-report-detail-sheet")?.inert }));
    fs.writeFileSync(path.join(output, `${testCase.width}-${testCase.theme}-admin-failure.html`), await page.content());
    await page.screenshot({ path: path.join(output, `${testCase.width}-${testCase.theme}-admin-failure.png`) }).catch(() => {});
    console.error(`FAIL admin cancellation ${testCase.width}/${testCase.theme}: ${error.message}`);
  } finally { await context.close(); }
  return result;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const testCase of cases) results.push(await ordinaryCase(browser, testCase));
    if (process.env.QA_PHONE_SKIP_ADMIN !== "true") for (const testCase of cases) results.push(await adminCancellationCase(browser, testCase));
  }
  finally { await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ syntheticOnly: true, actualApp: true, results }, null, 2)); }
  assert.ok(results.every(result => result.passed), `Phone navigation checks failed; see ${path.join(output, "results.json")}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
