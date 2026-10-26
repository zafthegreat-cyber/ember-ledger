const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5271/");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Collection portfolio checks require disposable loopback data");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/collection-portfolio-browser");
const appKey = "et-tcg-beta-data";
const repositoryKey = "ember-and-tide.flip-scout.v1";
const metadataPrefix = "code3-collection-portfolios-v1:";
const cases = (process.env.QA_WIDTHS || "320,390,1440").split(",").map(Number).flatMap(width => ["light", "dark"].filter(theme => !process.env.QA_THEME || process.env.QA_THEME === theme).map(theme => ({ width, height: width === 320 ? 568 : width === 390 ? 844 : 900, theme })));
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

function fixtureRecords() {
  const common = { workspaceId: "workspace-personal-local-beta", ownedItemPurpose: "PERSONAL_COLLECTION", status: "Personal Collection", productType: "Supply", productClassification: "Supply", allocatedItemCost: 10, purchaseDate: "2026-10-01", customMetadata: { preserve: "original device records" } };
  return {
    legacy: [
      { ...common, id: "qa-portfolio-legacy", name: "Aurora legacy collectible", quantity: 2, marketPrice: 25, condition: "Near Mint", setName: "QA Aurora Set", itemImage: `${base.origin}/__qa/portfolio/aurora.svg` },
      { ...common, id: "qa-portfolio-unknown", name: "Unknown estimate collectible", quantity: 1, projectedResaleMid: "", condition: "Good", itemImage: `${base.origin}/__qa/portfolio/unknown.svg` },
      { ...common, id: "qa-portfolio-resale", name: "Excluded resale item", quantity: 1, ownedItemPurpose: "FOR_RESALE", marketPrice: 999 },
    ],
    inventory: [
      { ...common, id: "qa-portfolio-repository", name: "Zenith repository collectible", quantity: 1, projectedResaleMid: 50, condition: "Mint", setName: "QA Zenith Set", item_image: `${base.origin}/__qa/portfolio/zenith.svg` },
      { ...common, id: "qa-portfolio-hold", name: "Excluded held item", quantity: 1, ownedItemPurpose: "HOLD", projectedResaleMid: 777 },
    ],
  };
}

function fixtureExpense() {
  return { id: "qa-portfolio-expense", expenseId: "qa-portfolio-expense", date: "2026-10-01", vendor: "Original expense preserved", category: "Supplies", subcategory: "Saved fixture reference", buyer: "", amount: 3.5, paymentMethod: "", linkedItemId: "", linkedSaleId: "", notes: "Preserve the original expense notes", receiptImage: "", receiptPhoto: "", receiptImageUrl: "", receiptId: "", rawReceiptText: "", receiptSplitMode: "expense_only", receiptTax: "", receiptPersonalTotal: "", taxDeductible: false, campaignName: "", platform: "", goal: "", startDate: "", endDate: "", linkedSales: "", resultsNotes: "", workspaceId: "workspace-personal-local-beta", workspace_id: "workspace-personal-local-beta", workspaceName: "My Personal Space" };
}

async function setup(browser, testCase, options = {}) {
  const { legacy, inventory } = fixtureRecords();
  const expense = fixtureExpense();
  const context = await browser.newContext({ viewport: { width: testCase.width, height: testCase.height }, reducedMotion: "reduce", serviceWorkers: "block", acceptDownloads: true });
  const safety = { blockedWrites: [], blockedExternal: [], blockedWebSockets: [], pageErrors: [] };
  await context.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    if (!["GET", "HEAD"].includes(request.method())) { safety.blockedWrites.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    if (url.origin !== base.origin) { safety.blockedExternal.push(url.origin + url.pathname); return route.abort(); }
    if (url.pathname.startsWith("/__qa/portfolio/")) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="220" viewBox="0 0 160 220"><rect x="8" y="8" width="144" height="204" rx="12" fill="#0f766e"/><rect x="22" y="24" width="116" height="130" rx="6" fill="#67c8bb"/><text x="80" y="190" text-anchor="middle" fill="white" font-size="15">QA COLLECTIBLE</text></svg>' });
    if (url.pathname.endsWith("/sealedProducts.json") && request.resourceType() === "fetch") return route.fulfill({ contentType: "application/json", body: JSON.stringify([{ id: "qa-portfolio-catalog", name: "Synthetic current catalog price", productName: "Synthetic current catalog price", productType: "Supply", sourceType: "manual", marketPrice: 37.25, imageUrl: `${base.origin}/__qa/portfolio/catalog.svg` }]) });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: '{"configured":false}' });
    return route.continue();
  });
  await context.routeWebSocket("**/*", socket => { safety.blockedWebSockets.push(socket.url()); socket.close(); });
  await context.addInitScript(({ theme, legacy, inventory, expense, appKey, repositoryKey, options }) => {
    if (localStorage.getItem("__qa_collection_portfolio_seeded")) return;
    localStorage.setItem("__qa_collection_portfolio_seeded", "true");
    localStorage.setItem("et-tcg-app-theme", theme);
    const plan = options.free ? "free" : "collector";
    localStorage.setItem(appKey, JSON.stringify({
      userType: "collector", dashboardPreset: "simple", appThemeChoice: theme,
      profile: { userId: "local-beta", email: "portfolio-qa@example.test", displayName: "Synthetic portfolio collector", appRole: options.free ? "owner" : "user", ...(options.free ? { app_role: "owner", userRole: "owner" } : {}), appAccess: "approved" },
      subscriptionProfile: { tier: plan, featureTier: plan, subscriptionPlan: plan, subscriptionStatus: "active", ...(options.free ? { appRole: "owner", app_role: "owner", isAdmin: true } : {}) },
      appSetupPersonalization: { experiencePersona: "collector", optionalTools: { community: false, family: false, assistant: false } },
      activeWorkspaceId: "workspace-personal-local-beta", items: legacy,
      sales: [{ id: "qa-portfolio-sale", workspaceId: "workspace-personal-local-beta", itemName: "Original sale preserved", quantity: 1, salePrice: 19.75 }],
      expenses: [expense],
      catalogProducts: [{ id: "qa-portfolio-preserved-price", name: "Preserved manual price", productName: "Preserved manual price", sourceType: "manual", marketValue: 37.25 }],
    }));
    localStorage.setItem(repositoryKey, JSON.stringify({ schemaVersion: 8, updatedAt: "2026-10-19T12:00:00.000Z", inventory, sales: [], purchases: [], lots: [], expenses: [], mileage: [] }));
    // Local beta intentionally unlocks paid tools for ordinary fixtures. The
    // app's existing administrator Free-plan preview disables that beta bypass.
    if (options.free) localStorage.setItem("et-tcg-admin-mode:local-beta", JSON.stringify({ viewMode: "regular", editMode: false, previewTier: "free", previewPersona: "collector" }));
    localStorage.setItem("code3-collection-portfolios-v1:unrelated-user%3Aunrelated-workspace", JSON.stringify({ version: 1, selectedPortfolioId: "main", portfolios: [{ id: "main", name: "Main", favorite: true }, { id: "private-other", name: "Unrelated private portfolio", favorite: false }], memberships: {}, snapshots: [] }));
    if (options.metadataKey && options.metadataRaw !== undefined) localStorage.setItem(options.metadataKey, options.metadataRaw);
    if (options.quotaFailure) {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key, value) {
        if (String(key).startsWith("code3-collection-portfolios-v1:") && !String(key).includes("unrelated-user")) throw new DOMException("Synthetic portfolio-only quota failure", "QuotaExceededError");
        return originalSetItem.call(this, key, value);
      };
    }
  }, { theme: testCase.theme, legacy, inventory, expense, appKey, repositoryKey, options });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", error => safety.pageErrors.push(error.message));
  page.on("dialog", dialog => { safety.pageErrors.push(`Unexpected native ${dialog.type()} dialog: ${dialog.message()}`); void dialog.dismiss(); });
  return { context, page, safety, legacy, inventory };
}

async function recordBytes(page) {
  return page.evaluate(({ appKey, repositoryKey }) => {
    const data = JSON.parse(localStorage.getItem(appKey));
    return JSON.stringify({ items: data.items, sales: data.sales, expenses: data.expenses, catalogProducts: data.catalogProducts, repository: localStorage.getItem(repositoryKey) });
  }, { appKey, repositoryKey });
}

function assertSeededRecords(original) {
  const data = JSON.parse(original);
  const records = fixtureRecords();
  assert.deepEqual(data.items, records.legacy, "Startup retains every original legacy item field, price and custom metadata");
  assert.deepEqual(JSON.parse(data.repository).inventory, records.inventory, "Startup retains every original repository item field, price and custom metadata");
  assert.deepEqual(data.sales, [{ id: "qa-portfolio-sale", workspaceId: "workspace-personal-local-beta", itemName: "Original sale preserved", quantity: 1, salePrice: 19.75 }]);
  assert.deepEqual(data.expenses, [fixtureExpense()]);
  assert.equal(data.catalogProducts.find(row => row.id === "qa-portfolio-preserved-price").marketValue, 37.25, "Catalog hydration retains the latest saved manual price");
}

async function metadata(page) {
  return page.evaluate(prefix => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key => [key, localStorage.getItem(key)])), metadataPrefix);
}

async function warmCatalog(page) {
  const add = page.getByRole("button", { name: "Open global Add menu", exact: true }).filter({ visible: true }).first();
  await add.click();
  await expect.poll(() => page.evaluate(appKey => {
    const rows = JSON.parse(localStorage.getItem(appKey)).catalogProducts || [];
    return rows.some(row => row.id === "qa-portfolio-preserved-price" && row.marketValue === 37.25) && rows.some(row => row.id === "qa-portfolio-catalog");
  }, appKey), { timeout: 30000 }).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator('.flow-modal[data-flow="addActionSheet"]')).toHaveCount(0);
  await settle(page);
}

async function checkGeometry(page, region, { width }) {
  const metrics = await region.evaluate(element => {
    const rect = node => { const box = node.getBoundingClientRect(); return { name: node.getAttribute("aria-label") || node.textContent.trim().slice(0, 80), width: box.width, height: box.height, left: box.left, right: box.right }; };
    return {
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      regionOverflow: element.scrollWidth - element.clientWidth,
      controls: [...element.querySelectorAll('button,input:not([type="checkbox"]),select,summary,[role="tab"]')].filter(node => {
        const collapsed = node.closest("details:not([open])");
        return (!collapsed || collapsed.querySelector(":scope > summary")?.contains(node)) && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden";
      }).map(rect),
    };
  });
  assert.ok(Math.max(metrics.pageOverflow, metrics.regionOverflow) <= 1, `No horizontal overflow: ${JSON.stringify(metrics)}`);
  assert.deepEqual(metrics.controls.filter(control => control.width < 43.9 || control.height < 43.9), [], "All portfolio touch targets are at least 44px");
  assert.deepEqual(metrics.controls.filter(control => control.left < -1 || control.right > width + 1), [], "Every portfolio control fits the viewport");
  return metrics;
}

async function openApp(page, testCase) {
  await page.goto(new URL(`/collection?betaLocalMode=true&themeInspect=${testCase.theme}`, base).href);
  const region = page.getByRole("region", { name: "Collection portfolio", exact: true });
  await expect(region).toBeVisible({ timeout: 45000 });
  await expect(page.locator(".app[data-theme]")).toHaveAttribute("data-theme", testCase.theme);
  return region;
}

async function ordinaryCase(browser, testCase) {
  const { context, page, safety } = await setup(browser, testCase);
  const name = `${testCase.width}-${testCase.theme}`;
  const result = { ...testCase, actualApp: true };
  try {
    const region = await openApp(page, testCase);
    await warmCatalog(page);
    const before = await recordBytes(page);
    assertSeededRecords(before);
    if (process.env.QA_INSPECT === "1") {
      fs.writeFileSync(path.join(output, `${name}-inspect.txt`), await region.innerText());
      fs.writeFileSync(path.join(output, `${name}-metadata.json`), JSON.stringify(await metadata(page), null, 2));
      await page.screenshot({ path: path.join(output, `${name}-inspect.png`), fullPage: true });
      return { ...result, inspected: true };
    }
    // Actual feature assertions are kept together so UI changes cannot weaken
    // the shared network guard or the byte-for-byte preservation boundary.
    await exercisePortfolio(page, region, testCase, result);
    assert.equal(await recordBytes(page), before, "Portfolio organization, browsing, history and export preserve every original item, sale, expense, price and repository byte");
    assert.deepEqual(safety.blockedWrites, [], "The app does not attempt writes during local portfolio checks");
    assert.deepEqual(safety.pageErrors, [], "No browser errors or unexpected deletion/confirmation prompts");
    result.recordsAndPricesPreserved = true;
    result.network = safety;
    await page.screenshot({ path: path.join(output, `${name}-overview.png`), fullPage: true });
    return result;
  } catch (error) {
    await page.screenshot({ path: path.join(output, `${name}-failure.png`), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(output, `${name}-failure-metrics.json`), JSON.stringify(await page.locator('.collection-portfolio').evaluate(element => [...element.querySelectorAll('*')].filter(node => node.getClientRects().length && (node.scrollWidth - node.clientWidth > 1 || node.getBoundingClientRect().right > innerWidth + 1)).map(node => ({ tag: node.tagName, class: node.className?.baseVal ?? node.className, text: node.textContent.trim().slice(0, 100), scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, width: node.getBoundingClientRect().width, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right }))).catch(() => []), null, 2));
    fs.writeFileSync(path.join(output, `${name}-failure.txt`), `${error.stack}\n\n${await page.locator("body").innerText().catch(() => "No body")}\n\n${JSON.stringify(safety, null, 2)}`);
    throw error;
  } finally { await context.close(); }
}

async function choosePortfolio(page, region, name) {
  await region.getByRole("button", { name: "Choose portfolio", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choose portfolio", exact: true });
  await expect(dialog).toBeVisible();
  const row = dialog.locator(".collection-portfolio-chooser-row").filter({ has: page.locator("strong").filter({ hasText: new RegExp(`^${name}$`) }) });
  await row.locator(".collection-portfolio-chooser-select").click();
  await expect(dialog).toHaveCount(0);
  await settle(page);
}

async function checkSheetKeyboard(page, region, testCase, result) {
  const opener = region.getByRole("button", { name: "Choose portfolio", exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Choose portfolio", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press(i % 3 === 0 ? "Shift+Tab" : "Tab");
    assert.ok(await dialog.evaluate(element => element.contains(document.activeElement)), "Keyboard focus stays in the open portfolio chooser");
  }
  result.chooserMetrics = await checkGeometry(page, dialog, testCase);
  await page.screenshot({ path: path.join(output, `${testCase.width}-${testCase.theme}-chooser.png`), fullPage: true });
  const url = page.url();
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  assert.equal(page.url(), url, "Phone Back closes the chooser without leaving the collection");
  await expect(opener).toBeFocused();
  await page.goForward();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  const focus = await opener.evaluate(element => ({ width: parseFloat(getComputedStyle(element).outlineWidth), style: getComputedStyle(element).outlineStyle }));
  assert.ok(focus.width >= 2 && focus.style !== "none", "The keyboard focused portfolio control has a visible focus ring");
  result.chooserFocusTrappedAndRestored = true;
}

async function exercisePortfolio(page, region, testCase, result) {
  await expect(region.getByRole("button", { name: "Overview", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(region).toContainText("USD");
  await expect(region.locator(".collection-portfolio-value")).toHaveText("$877.00");
  const grid = region.getByRole("list", { name: "Collection items", exact: true });
  await expect(grid.locator(".collection-portfolio-item")).toHaveCount(4);
  await expect(region).not.toContainText("Excluded resale item");
  await expect(grid).toContainText("Excluded held item"); // Historical fixture name; Hold now belongs in Collection.
  await expect(region.getByRole("list", { name: "Most valuable items", exact: true }).locator("button")).toHaveCount(3);
  result.metrics = await checkGeometry(page, region, testCase);
  const more = region.locator(".everyday-more-menu");
  await more.locator(":scope > summary").click();
  result.moreMenuMetrics = await checkGeometry(page, more, testCase);
  await more.locator(":scope > summary").focus();
  await page.keyboard.press("Escape");
  await expect(more).not.toHaveAttribute("open", "");

  await region.getByRole("button", { name: "Hide values", exact: true }).click();
  await expect(region).not.toContainText("$877.00");
  await expect(region).not.toContainText("$777.00");
  await expect(region).not.toContainText("$50.00");
  await expect(grid.locator(".collection-portfolio-item-value")).toHaveText(["Value hidden", "Value hidden", "Value hidden", "Value hidden"]);
  await region.getByRole("button", { name: "Show values", exact: true }).click();
  await expect(region.locator(".collection-portfolio-value")).toHaveText("$877.00");
  result.hideValuesCoversTotalsGridAndRanking = true;

  const search = region.getByRole("searchbox", { name: "Search collection", exact: true });
  await search.fill("aurora");
  await expect(grid.locator("button")).toHaveCount(1);
  await expect(grid).toContainText("Aurora legacy collectible");
  await expect(region.locator(".collection-portfolio-value")).toHaveText("$877.00");
  await search.fill("");
  await region.getByRole("button", { name: "Filter", exact: true }).click();
  const filters = page.getByRole("dialog", { name: "Filter collection", exact: true });
  await filters.getByLabel("Condition", { exact: true }).selectOption("Mint");
  await filters.getByRole("button", { name: "Close", exact: true }).click();
  await expect(grid.locator("button")).toHaveCount(1);
  await expect(grid).toContainText("Zenith repository collectible");
  await expect(region.locator(".collection-portfolio-value")).toHaveText("$877.00");
  await region.getByRole("button", { name: "Filter", exact: true }).click();
  await filters.getByRole("button", { name: "Clear Filter", exact: true }).click();
  await expect(grid.locator("button")).toHaveCount(4);
  await region.getByRole("combobox", { name: "Sort collection", exact: true }).selectOption("value");
  await expect(grid.locator(".collection-portfolio-item-name")).toHaveText(["Excluded held item", "Aurora legacy collectible", "Zenith repository collectible", "Unknown estimate collectible"]);
  await region.getByRole("combobox", { name: "Sort collection", exact: true }).selectOption("name");
  await region.getByRole("button", { name: "List", exact: true }).click();
  await expect(grid).toHaveAttribute("data-mode", "list");
  await expect(region.getByRole("button", { name: "List", exact: true })).toHaveAttribute("aria-pressed", "true");
  await grid.getByRole("button", { name: "Open Zenith repository collectible", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Zenith repository collectible", exact: true })).toBeVisible();
  let product = page.getByTestId("collection-product-detail");
  await expect(product.getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(product).toContainText("QA Zenith Set");
  await product.getByRole("tab", { name: "Copies", exact: true }).click();
  await expect(product.getByRole("tab", { name: "Copies", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(product).toContainText("Recorded cost");
  await expect(product).toContainText("$10.00");
  await product.getByRole("button", { name: "Open copy record 1: Personal collection, quantity 1", exact: true }).click();
  await expect(page.locator(".ops-record-detail")).toContainText("QA Zenith Set");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(product.getByRole("tab", { name: "Copies", exact: true })).toHaveAttribute("aria-selected", "true");
  await product.getByRole("button", { name: "Back to collection", exact: true }).click();
  await expect(region).toBeVisible();
  await expect(grid).toHaveAttribute("data-mode", "list");
  await region.getByRole("button", { name: "Grid", exact: true }).click();
  await expect(grid).toHaveAttribute("data-mode", "grid");
  await region.getByRole("list", { name: "Most valuable items", exact: true }).getByRole("button", { name: "Open Aurora legacy collectible", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Aurora legacy collectible", exact: true })).toBeVisible();
  product = page.getByTestId("collection-product-detail");
  await product.getByRole("tab", { name: "Copies", exact: true }).click();
  await expect(product).toContainText("Qty 2 across 1 purchase record");
  await expect(product).toContainText("$10.00");
  await product.getByRole("button", { name: "Open copy record 1: Personal collection, quantity 2", exact: true }).click();
  await expect(page.locator(".ops-record-detail")).toContainText("QA Aurora Set");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(product.getByRole("tab", { name: "Copies", exact: true })).toHaveAttribute("aria-selected", "true");
  await product.getByRole("button", { name: "Back to collection", exact: true }).click();
  await expect(region).toBeVisible();
  result.searchAndConditionKeepTotalSortAndBothLayoutsOpenExactRecords = true;
  result.productCopiesKeepPerRecordCostAndQuantity = true;

  await checkSheetKeyboard(page, region, testCase, result);
  await choosePortfolio(page, region, "All portfolios");
  await expect(region.locator(".collection-portfolio-value")).toHaveText("$877.00");
  await exerciseOrganization(page, region, testCase, result);
  await exerciseHistoryAndExport(page, region, testCase, result);
  if (testCase.width === 320) {
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    result.textScale200Metrics = await checkGeometry(page, region, testCase);
    await page.screenshot({ path: path.join(output, `${testCase.width}-${testCase.theme}-text-200.png`), fullPage: true });
    await checkSheetKeyboard(page, region, testCase, {});
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    result.textScale200 = true;
  }
}

async function createPortfolio(page, region, name, itemNames) {
  await region.getByRole("button", { name: "Choose portfolio", exact: true }).click();
  const chooser = page.getByRole("dialog", { name: "Choose portfolio", exact: true });
  await chooser.getByRole("button", { name: "Add portfolio", exact: false }).click();
  const form = page.getByRole("dialog", { name: "New portfolio", exact: true });
  await expect(form).toBeVisible();
  await form.getByLabel("Portfolio name", { exact: true }).fill(name);
  for (const item of itemNames) await form.getByRole("checkbox", { name: item, exact: true }).check();
  await form.getByRole("button", { name: "Save portfolio", exact: true }).click();
  await expect(form).toHaveCount(0);
  await settle(page);
}

async function exerciseOrganization(page, region, testCase, result) {
  const privateKey = `${metadataPrefix}unrelated-user%3Aunrelated-workspace`;
  const privateBefore = (await metadata(page))[privateKey];
  await createPortfolio(page, region, "Trade shelf", ["Aurora legacy collectible"]);
  await expect(region.locator('[data-testid="portfolio-total"]')).toHaveText("$50.00");
  await expect(region.getByRole("list", { name: "Collection items", exact: true }).locator("button")).toHaveCount(1);
  await expect(region.getByRole("button", { name: "Choose portfolio", exact: true })).toContainText("Trade shelf");
  const scopedRows = await metadata(page);
  const scopeKeys = Object.keys(scopedRows).filter(key => key !== privateKey);
  assert.equal(scopeKeys.length, 1, "The active account/workspace writes one separate portfolio metadata key");
  const scopeKey = scopeKeys[0];
  result.scopeKey = scopeKey;
  const firstState = JSON.parse(scopedRows[scopeKey]);
  const custom = firstState.portfolios.find(row => row.name === "Trade shelf");
  assert.ok(custom && custom.id !== "main");
  assert.equal(firstState.memberships["legacy:qa-portfolio-legacy"], custom.id);
  assert.equal(firstState.selectedPortfolioId, custom.id);

  await region.getByRole("button", { name: "Choose portfolio", exact: true }).click();
  let chooser = page.getByRole("dialog", { name: "Choose portfolio", exact: true });
  await expect(chooser).not.toContainText("Unrelated private portfolio");
  await chooser.getByRole("button", { name: "Mark Trade shelf as favorite", exact: true }).click();
  await expect(chooser.getByRole("button", { name: "Remove Trade shelf from favorites", exact: true })).toHaveAttribute("aria-pressed", "true");
  await chooser.getByRole("button", { name: "Manage Trade shelf", exact: true }).click();
  let form = page.getByRole("dialog", { name: "Manage portfolio", exact: true });
  await expect(form.getByRole("checkbox", { name: "Aurora legacy collectible", exact: true })).toBeChecked();
  await form.getByLabel("Portfolio name", { exact: true }).fill("Weekend collection");
  await form.getByRole("checkbox", { name: "Unknown estimate collectible", exact: true }).check();
  result.manageMetrics = await checkGeometry(page, form, testCase);
  const labels = await form.locator(".collection-portfolio-checkbox").evaluateAll(elements => elements.map(element => ({ name: element.textContent.trim(), height: element.getBoundingClientRect().height, width: element.getBoundingClientRect().width })));
  assert.ok(labels.every(label => label.height >= 44 && label.width >= 44), "Portfolio item checkbox labels provide usable touch targets");
  await form.getByRole("button", { name: "Save portfolio", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(region.getByRole("button", { name: "Choose portfolio", exact: true })).toContainText("Weekend collection");
  await expect(region.getByRole("list", { name: "Collection items", exact: true }).locator("button")).toHaveCount(2);
  await expect(region.locator('[data-testid="portfolio-total"]')).toHaveText("$50.00");
  await page.screenshot({ path: path.join(output, `${testCase.width}-${testCase.theme}-custom.png`), fullPage: true });
  await page.reload();
  await expect(region).toBeVisible({ timeout: 30000 });
  await expect(region.getByRole("button", { name: "Choose portfolio", exact: true })).toContainText("Weekend collection");
  await expect(region.getByRole("list", { name: "Collection items", exact: true }).locator("button")).toHaveCount(2);
  assert.equal(JSON.parse((await metadata(page))[scopeKey]).portfolios.find(row => row.id === custom.id).favorite, true, "Favorite and renamed portfolio persist on reload");

  await createPortfolio(page, region, "Binder picks", ["Zenith repository collectible"]);
  await region.getByRole("button", { name: "Choose portfolio", exact: true }).click();
  chooser = page.getByRole("dialog", { name: "Choose portfolio", exact: true });
  await chooser.getByRole("button", { name: "Move Binder picks up", exact: true }).click();
  assert.deepEqual(JSON.parse((await metadata(page))[scopeKey]).portfolios.map(row => row.name), ["Main", "Binder picks", "Weekend collection"]);
  await chooser.getByRole("button", { name: "Manage Binder picks", exact: true }).click();
  form = page.getByRole("dialog", { name: "Manage portfolio", exact: true });
  await form.getByRole("button", { name: "Remove portfolio", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Remove portfolio?", exact: true });
  await expect(confirm).toContainText("Original item records are not deleted");
  await confirm.getByRole("button", { name: "Keep portfolio", exact: true }).click();
  await expect(form).toBeVisible();
  await form.getByRole("button", { name: "Remove portfolio", exact: true }).click();
  await confirm.getByRole("button", { name: "Remove portfolio", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  const afterRemove = JSON.parse((await metadata(page))[scopeKey]);
  assert.deepEqual(afterRemove.portfolios.map(row => row.name), ["Main", "Weekend collection"]);
  assert.equal(afterRemove.memberships["repository:qa-portfolio-repository"], undefined, "Removing metadata returns an item to Main");
  await choosePortfolio(page, region, "Main");
  await expect(region.getByRole("list", { name: "Collection items", exact: true }).getByRole("button", { name: "Open Zenith repository collectible", exact: true })).toBeVisible();
  await choosePortfolio(page, region, "All portfolios");
  await expect(region.locator('[data-testid="portfolio-total"]')).toHaveText("$877.00");
  assert.equal((await metadata(page))[privateKey], privateBefore, "Organization never reads or changes another account/workspace's metadata");
  result.createRenameAssignFavoriteOrderRemoveAndReload = true;
  result.unrelatedScopeKept = true;
}

async function exerciseHistoryAndExport(page, region, testCase, result) {
  await region.getByRole("button", { name: "Performance", exact: true }).click();
  await expect(region.getByRole("button", { name: "Performance", exact: true })).toHaveAttribute("aria-pressed", "true");
  const history = region.getByRole("region", { name: "Portfolio value history", exact: true });
  await expect(history).toContainText("No value history yet");
  await expect(history.locator("svg[role=img]")).toHaveCount(0);
  const started = Date.now();
  await history.getByRole("button", { name: "Save value snapshot", exact: true }).click();
  await expect(region.getByRole("status")).toContainText("Value snapshot saved on this device");
  let state = JSON.parse((await metadata(page))[result.scopeKey]);
  assert.equal(state.snapshots.length, 1);
  const first = state.snapshots[0];
  assert.equal(first.portfolioId, "all");
  assert.equal(first.total, 877); assert.equal(first.knownCount, 3); assert.equal(first.totalCount, 4); assert.equal(first.quantity, 5);
  assert.ok(Date.parse(first.at) >= started && Date.parse(first.at) <= Date.now() + 1000, "A snapshot records the actual present, not invented historical prices");
  await expect(history).toContainText("No value history yet");
  await history.getByRole("button", { name: "Save value snapshot", exact: true }).click();
  await expect(history.locator("svg[role=img]")).toHaveCount(1);
  state = JSON.parse((await metadata(page))[result.scopeKey]);
  assert.equal(state.snapshots.length, 2);
  assert.ok(state.snapshots.every(point => point.total === 877 && Date.parse(point.at) >= started), "The curve contains only the two user-saved current totals");
  for (const label of ["1D", "7D", "1M", "3M", "6M", "MAX"]) {
    await history.getByRole("button", { name: label, exact: true }).click();
    await expect(history.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(history.locator("svg[role=img]")).toHaveCount(1);
  }
  await history.locator("summary").filter({ hasText: "View snapshot values" }).click();
  await expect(history.locator("tbody tr")).toHaveCount(2);
  await expect(history).toContainText("not investment return");
  await page.screenshot({ path: path.join(output, `${testCase.width}-${testCase.theme}-performance.png`), fullPage: true });
  result.historyMetrics = await checkGeometry(page, history, testCase);
  await region.getByRole("button", { name: "Hide values", exact: true }).click();
  await expect(history).toContainText("Value history hidden");
  await expect(history.locator("table")).toHaveCount(0);
  await expect(history.getByRole("button", { name: "Save value snapshot", exact: true })).toBeDisabled();
  const hiddenDownload = page.waitForEvent("download");
  await region.getByRole("button", { name: "Export", exact: true }).click();
  const hiddenCsv = fs.readFileSync(await (await hiddenDownload).path(), "utf8");
  assert.ok(!hiddenCsv.includes("estimate USD") && !hiddenCsv.includes("50.00") && !hiddenCsv.includes("877.00") && !hiddenCsv.includes("777.00"), "Hidden-value CSV omits all monetary columns");
  assert.ok(hiddenCsv.includes("Aurora legacy collectible") && hiddenCsv.includes("Zenith repository collectible") && hiddenCsv.includes("Unknown estimate collectible"));
  await region.getByRole("button", { name: "Show values", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await region.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "code3-tcg-portfolio.csv");
  const csv = fs.readFileSync(await download.path(), "utf8");
  assert.ok(csv.includes('"Unit estimate USD"') && csv.includes('"Total estimate USD"'));
  assert.ok(csv.includes('"Aurora legacy collectible","Game not recorded","Supply","QA Aurora Set","2","25","50"'));
  assert.ok(csv.includes('"Zenith repository collectible","Game not recorded","Supply","QA Zenith Set","1","50","50"'));
  assert.ok(!csv.includes("Excluded resale item") && csv.includes('"Excluded held item","Game not recorded","Supply","","1","777","777"'));
  await region.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(region.getByRole("list", { name: "Collection items", exact: true }).locator("button")).toHaveCount(4);
  result.actualCurrentSnapshotsAccessibleHistoryPeriodsAndCsv = true;
}

async function variantCase(browser, kind, scopeKey) {
  const testCase = { width: 390, height: 844, theme: "dark" };
  const preservedRaw = "{synthetic-original-corrupt-copy:do-not-overwrite";
  const options = kind === "free" ? { free: true } : kind === "quota" ? { quotaFailure: true } : { metadataKey: scopeKey, metadataRaw: preservedRaw };
  const { context, page, safety } = await setup(browser, testCase, options);
  const downloads = [];
  page.on("download", download => downloads.push(download.suggestedFilename()));
  try {
    const region = await openApp(page, testCase);
    await warmCatalog(page);
    const before = await recordBytes(page);
    assertSeededRecords(before);
    if (kind === "boot") {
      await expect(region.locator('[data-testid="portfolio-total"]')).toHaveText("$877.00");
      await expect(region.getByRole("list", { name: "Collection items", exact: true }).locator("button")).toHaveCount(4);
    } else if (kind === "free") {
      await expect(region.getByRole("region", { name: "Portfolio value history", exact: true })).toHaveCount(0);
      await region.getByRole("button", { name: "Performance", exact: true }).click();
      const locked = page.getByRole("dialog", { name: "Feature Locked", exact: true });
      await expect(locked).toBeVisible();
      await expect(locked).toContainText("Portfolio Value");
      await locked.getByRole("button", { name: "Close locked feature notice", exact: true }).click();
      await expect(locked).toHaveCount(0);
      await expect(region.getByRole("button", { name: "Overview", exact: true })).toHaveAttribute("aria-pressed", "true");
      await region.getByRole("button", { name: "Export", exact: true }).click();
      await expect(locked).toBeVisible();
      await expect(locked).toContainText("Collection Export");
      await locked.getByRole("button", { name: "Close locked feature notice", exact: true }).click();
      assert.deepEqual(downloads, [], "A free account cannot bypass export entitlement");
      assert.deepEqual(Object.keys(await metadata(page)).filter(key => !key.includes("unrelated-user")), [], "Locked actions do not write snapshots or portfolio settings");
    } else if (kind === "corrupt") {
      await expect(region.getByRole("alert")).toContainText("original device copy was kept");
      await region.getByRole("button", { name: "Reload portfolio settings", exact: true }).click();
      assert.equal((await metadata(page))[scopeKey], preservedRaw, "The corrupted original metadata remains byte-for-byte preserved");
      await region.getByRole("button", { name: "Choose portfolio", exact: true }).click();
      await page.getByRole("dialog", { name: "Choose portfolio", exact: true }).getByRole("button", { name: "Add portfolio", exact: false }).click();
      const form = page.getByRole("dialog", { name: "New portfolio", exact: true });
      await form.getByLabel("Portfolio name", { exact: true }).fill("Must not overwrite original metadata");
      await expect(form.getByRole("button", { name: "Save portfolio", exact: true })).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(form).toHaveCount(0);
      assert.equal((await metadata(page))[scopeKey], preservedRaw);
    } else {
      await region.getByRole("button", { name: "Choose portfolio", exact: true }).click();
      await page.getByRole("dialog", { name: "Choose portfolio", exact: true }).getByRole("button", { name: "Add portfolio", exact: false }).click();
      const form = page.getByRole("dialog", { name: "New portfolio", exact: true });
      await form.getByLabel("Portfolio name", { exact: true }).fill("Quota-failure portfolio");
      await form.getByRole("checkbox", { name: "Aurora legacy collectible", exact: true }).check();
      await form.getByRole("button", { name: "Save portfolio", exact: true }).click();
      await expect(form.getByRole("alert")).toContainText("Existing item records are unchanged");
      await expect(form.getByRole("alert")).toContainText("Synthetic portfolio-only quota failure");
      assert.deepEqual(Object.keys(await metadata(page)).filter(key => !key.includes("unrelated-user")), [], "Failed metadata writes do not leave partial portfolio state");
      await expect(form.getByLabel("Portfolio name", { exact: true })).toHaveValue("Quota-failure portfolio");
      await page.keyboard.press("Escape");
      await expect(form).toHaveCount(0);
    }
    assert.equal(await recordBytes(page), before, `${kind} guards preserve every original record and price byte`);
    assert.deepEqual(safety.blockedWrites, []);
    assert.deepEqual(safety.pageErrors, []);
    await page.screenshot({ path: path.join(output, `guard-${kind}.png`), fullPage: true });
    return { kind, passed: true, originalRecordsAndPricesPreserved: true, network: safety };
  } catch (error) {
    await page.screenshot({ path: path.join(output, `guard-${kind}-failure.png`), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(output, `guard-${kind}-failure.txt`), `${error.stack}\n\n${await page.locator("body").innerText().catch(() => "No body")}\n\n${JSON.stringify(safety, null, 2)}`);
    throw error;
  } finally { await context.close(); }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const guards = [];
  try {
    if (!process.env.QA_ONLY_VARIANTS) for (const testCase of cases) {
      results.push(await ordinaryCase(browser, testCase));
      console.log(`PASS collection portfolio ${testCase.width}px ${testCase.theme}`);
    }
    if (process.env.QA_VARIANTS !== "0" && process.env.QA_INSPECT !== "1") {
      for (const kind of (process.env.QA_ONLY_VARIANTS || "free,corrupt,quota").split(",")) {
        const scopeKey = results[0]?.scopeKey || process.env.QA_SCOPE_KEY;
        assert.ok(kind !== "corrupt" || scopeKey, "A corruption test needs the actual app's scoped metadata key");
        guards.push(await variantCase(browser, kind, scopeKey));
        console.log(`PASS collection portfolio guard ${kind}`);
      }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ actualApp: true, syntheticOnly: true, results, guards }, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
