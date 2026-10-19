const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5271/");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Set browser checks require disposable loopback data");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/collection-sets-browser");
const appKey = "et-tcg-beta-data";
const repositoryKey = "ember-and-tide.flip-scout.v1";
const cases = (process.env.QA_WIDTHS || "320,390,1440").split(",").map(Number).flatMap(width => ["light", "dark"].filter(theme => !process.env.QA_THEME || process.env.QA_THEME === theme).map(theme => ({ width, height: width === 320 ? 568 : width === 390 ? 844 : 900, theme })));
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="140"><rect width="220" height="140" rx="12" fill="#0f766e"/><text x="110" y="75" text-anchor="middle" fill="white" font-size="20">SYNTHETIC SET</text></svg>';

function fixtureRecords() {
  const common = { workspaceId: "workspace-personal-local-beta", ownedItemPurpose: "PERSONAL_COLLECTION", status: "Personal Collection", productType: "Single Card", productClassification: "Single", allocatedItemCost: 10, purchaseDate: "2026-10-01", condition: "Near Mint", customMetadata: { preserve: "original device records" } };
  return {
    legacy: [
      { ...common, id: "qa-sets-card", name: "Aurora first card", quantity: 2, marketPrice: 10, setName: "Fusion Strike", cardNumber: "1", itemImage: `${base.origin}/__qa/sets/card.svg` },
      { ...common, id: "qa-sets-duplicate", name: "Aurora duplicate card", quantity: 1, marketPrice: 5, setName: "Fusion Strike", cardNumber: "001", itemImage: `${base.origin}/__qa/sets/duplicate.svg` },
      { ...common, id: "qa-sets-unknown", name: "Unknown saved value card", quantity: 1, projectedResaleMid: "", marketPrice: "", setName: "Fusion Strike", cardNumber: "2" },
      { ...common, id: "qa-sets-zero", name: "Explicit zero card", quantity: 1, marketPrice: 0, setName: "Celebrations", cardNumber: "1" },
      { ...common, id: "qa-sets-resale", name: "Excluded resale card", quantity: 1, ownedItemPurpose: "FOR_RESALE", marketPrice: 999, setName: "Fusion Strike", cardNumber: "4" },
      { ...common, id: "qa-sets-binder", name: "Family binder record", quantity: 1, productType: "Binder", productClassification: "Binder", marketPrice: 12 },
    ],
    inventory: [
      { ...common, id: "qa-sets-sealed", name: "Fusion sealed box", quantity: 2, productType: "Booster Box", productClassification: "Sealed", projectedResaleMid: 25, setName: "Fusion Strike", item_image: `${base.origin}/__qa/sets/sealed.svg` },
      { ...common, id: "qa-sets-repository-card", name: "Zenith third card", quantity: 1, projectedResaleMid: 15, setName: "Fusion Strike", cardNumber: "3", item_image: `${base.origin}/__qa/sets/zenith.svg` },
      { ...common, id: "qa-sets-celebration", name: "Celebration saved card", quantity: 1, projectedResaleMid: 3, setName: "Celebrations", cardNumber: "2" },
      { ...common, id: "qa-sets-custom", name: "Custom set card", quantity: 1, projectedResaleMid: 7, setName: "Nebula custom set", cardNumber: "A1" },
      { ...common, id: "qa-sets-unpriced-only", name: "Unpriced custom card", quantity: 1, projectedResaleMid: "", setName: "Unknown custom set", cardNumber: "U1" },
      { ...common, id: "qa-sets-zero-only", name: "Zero custom card", quantity: 1, projectedResaleMid: 0, setName: "Zero custom set", cardNumber: "Z1" },
      { ...common, id: "qa-sets-held", name: "Excluded held card", quantity: 1, ownedItemPurpose: "HOLD", projectedResaleMid: 777, setName: "Celebrations", cardNumber: "3" },
    ],
  };
}

function fixtureExpense() {
  return { id: "qa-sets-expense", expenseId: "qa-sets-expense", date: "2026-10-01", vendor: "Original expense preserved", category: "Supplies", subcategory: "Saved fixture reference", buyer: "", amount: 3.5, paymentMethod: "", linkedItemId: "", linkedSaleId: "", notes: "Preserve original expense notes", receiptImage: "", receiptPhoto: "", receiptImageUrl: "", receiptId: "", rawReceiptText: "", receiptSplitMode: "expense_only", receiptTax: "", receiptPersonalTotal: "", taxDeductible: false, campaignName: "", platform: "", goal: "", startDate: "", endDate: "", linkedSales: "", resultsNotes: "", workspaceId: "workspace-personal-local-beta", workspace_id: "workspace-personal-local-beta", workspaceName: "My Personal Space" };
}

async function setup(browser, testCase) {
  const { legacy, inventory } = fixtureRecords();
  const context = await browser.newContext({ viewport: { width: testCase.width, height: testCase.height }, reducedMotion: "reduce", serviceWorkers: "block" });
  const safety = { blockedWrites: [], blockedExternal: [], blockedWebSockets: [], pageErrors: [], syntheticSetCatalog: false };
  await context.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    if (!["GET", "HEAD"].includes(request.method())) { safety.blockedWrites.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    if (url.origin !== base.origin) { safety.blockedExternal.push(url.origin + url.pathname); return route.abort(); }
    if (url.pathname === "/src/data/generated/pokemonTcgSets.json") {
      safety.syntheticSetCatalog = true;
      const sets = [
        { id: "swsh8", name: "Fusion Strike", setCode: "FST", series: "Sword & Shield", releaseDate: "2021-11-12", total: 4, printedTotal: 4, logoUrl: `${base.origin}/__qa/sets/logo.svg` },
        { id: "cel25", name: "Celebrations", setCode: "CEL", series: "Sword & Shield", releaseDate: "2021-10-08", total: 3, printedTotal: 3, logoUrl: `${base.origin}/__qa/sets/broken.svg` },
      ];
      return route.fulfill({ contentType: "application/javascript", body: `export default ${JSON.stringify(sets)};` });
    }
    if (url.pathname === "/__qa/sets/broken.svg") return route.fulfill({ status: 404, body: "Synthetic missing artwork" });
    if (url.pathname.startsWith("/__qa/sets/")) return route.fulfill({ contentType: "image/svg+xml", body: svg });
    if (url.pathname.endsWith("/sealedProducts.json") && request.resourceType() === "fetch") return route.fulfill({ contentType: "application/json", body: JSON.stringify([{ id: "qa-sets-catalog", name: "Synthetic current catalog price", productName: "Synthetic current catalog price", productType: "Supply", sourceType: "manual", marketPrice: 37.25, imageUrl: `${base.origin}/__qa/sets/catalog.svg` }]) });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: '{"configured":false}' });
    return route.continue();
  });
  await context.routeWebSocket("**/*", socket => { safety.blockedWebSockets.push(socket.url()); socket.close(); });
  await context.addInitScript(({ theme, legacy, inventory, expense, appKey, repositoryKey }) => {
    if (localStorage.getItem("__qa_collection_sets_seeded")) return;
    localStorage.setItem("__qa_collection_sets_seeded", "true");
    localStorage.setItem("et-tcg-app-theme", theme);
    localStorage.setItem(appKey, JSON.stringify({
      userType: "collector", dashboardPreset: "simple", appThemeChoice: theme,
      profile: { userId: "local-beta", email: "sets-qa@example.test", displayName: "Synthetic set collector", appRole: "user", appAccess: "approved" },
      subscriptionProfile: { tier: "collector", featureTier: "collector", subscriptionPlan: "collector", subscriptionStatus: "active" },
      appSetupPersonalization: { experiencePersona: "collector", optionalTools: { community: false, family: false, assistant: false } },
      activeWorkspaceId: "workspace-personal-local-beta", items: legacy,
      sales: [{ id: "qa-sets-sale", workspaceId: "workspace-personal-local-beta", itemName: "Original sale preserved", quantity: 1, salePrice: 19.75 }], expenses: [expense],
      catalogProducts: [{ id: "qa-sets-preserved-price", name: "Preserved manual price", productName: "Preserved manual price", sourceType: "manual", marketValue: 37.25 }],
    }));
    localStorage.setItem(repositoryKey, JSON.stringify({ schemaVersion: 8, updatedAt: "2026-10-19T12:00:00.000Z", inventory, sales: [], purchases: [], lots: [], expenses: [], mileage: [] }));
  }, { theme: testCase.theme, legacy, inventory, expense: fixtureExpense(), appKey, repositoryKey });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", error => safety.pageErrors.push(error.message));
  page.on("dialog", dialog => { safety.pageErrors.push(`Unexpected ${dialog.type()}: ${dialog.message()}`); void dialog.dismiss(); });
  return { context, page, safety };
}

async function recordBytes(page) {
  return page.evaluate(({ appKey, repositoryKey }) => {
    const data = JSON.parse(localStorage.getItem(appKey));
    return JSON.stringify({ items: data.items, sales: data.sales, expenses: data.expenses, catalogProducts: data.catalogProducts, repository: localStorage.getItem(repositoryKey) });
  }, { appKey, repositoryKey });
}

function assertSeededRecords(original) {
  const data = JSON.parse(original), fixture = fixtureRecords();
  assert.deepEqual(data.items, fixture.legacy, "Startup preserves all original legacy item fields");
  assert.deepEqual(JSON.parse(data.repository).inventory, fixture.inventory, "Startup preserves all original repository fields");
  assert.deepEqual(data.sales, [{ id: "qa-sets-sale", workspaceId: "workspace-personal-local-beta", itemName: "Original sale preserved", quantity: 1, salePrice: 19.75 }]);
  assert.deepEqual(data.expenses, [fixtureExpense()]);
  assert.equal(data.catalogProducts.find(row => row.id === "qa-sets-preserved-price").marketValue, 37.25, "Existing catalog price survives startup hydration");
}

async function warmCatalog(page) {
  await page.getByRole("button", { name: "Open global Add menu", exact: true }).filter({ visible: true }).first().click();
  await expect.poll(() => page.evaluate(appKey => (JSON.parse(localStorage.getItem(appKey)).catalogProducts || []).some(row => row.id === "qa-sets-catalog"), appKey), { timeout: 30000 }).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator('.flow-modal[data-flow="addActionSheet"]')).toHaveCount(0);
  await settle(page);
}

async function geometry(page, region, testCase) {
  const metrics = await region.evaluate(element => ({
    pageOverflow: document.documentElement.scrollWidth - innerWidth,
    regionOverflow: element.scrollWidth - element.clientWidth,
    controls: [...element.querySelectorAll('button,input:not([type="checkbox"]),select,summary,a')].filter(node => {
      const collapsed = node.closest("details:not([open])");
      return (!collapsed || collapsed.querySelector(":scope > summary")?.contains(node)) && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden";
    }).map(node => { const rect = node.getBoundingClientRect(); return { name: node.getAttribute("aria-label") || node.textContent.trim().slice(0, 70), width: rect.width, height: rect.height, left: rect.left, right: rect.right }; }),
  }));
  assert.ok(Math.max(metrics.pageOverflow, metrics.regionOverflow) <= 1, `No horizontal overflow ${JSON.stringify(metrics)}`);
  assert.deepEqual(metrics.controls.filter(row => row.width < 43.9 || row.height < 43.9), [], "All set controls offer 44px targets");
  assert.deepEqual(metrics.controls.filter(row => row.left < -1 || row.right > testCase.width + 1), [], "All set controls fit the viewport");
  return metrics;
}

async function runCase(browser, testCase) {
  const { context, page, safety } = await setup(browser, testCase);
  const name = `${testCase.width}-${testCase.theme}`;
  const result = { ...testCase, actualApp: true, syntheticOnly: true };
  try {
    await page.goto(new URL(`/collection?betaLocalMode=true&themeInspect=${testCase.theme}`, base).href);
    const portfolio = page.getByRole("region", { name: "Collection portfolio", exact: true });
    await expect(portfolio).toBeVisible({ timeout: 45000 });
    await expect(page.locator(".app[data-theme]")).toHaveAttribute("data-theme", testCase.theme);
    await warmCatalog(page);
    const before = await recordBytes(page);
    assertSeededRecords(before);
    // Deliberately leave the collection's independent query active. Set totals
    // must use all personal records, not this previously filtered product list.
    await portfolio.getByRole("searchbox", { name: "Search collection", exact: true }).fill("no-such-collection-record");
    const more = portfolio.locator(".everyday-more-menu");
    await more.locator(":scope > summary").click();
    await more.getByRole("button", { name: "Sets & Binders", exact: true }).click();
    const region = page.getByRole("region", { name: "Collection sets", exact: true });
    await expect(region).toBeVisible();
    await expect(page).toHaveURL(/\/collection\/sets/);
    if (process.env.QA_CAPTURE_ONLY === "1") {
      await region.getByRole("button", { name: "Your sets", exact: true }).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await settle(page);
      await page.screenshot({ path: path.join(output, `${name}-your-sets.png`), fullPage: true });
      await page.screenshot({ path: path.join(output, `${name}-your-sets-viewport.png`) });
      const gridTop = await region.locator(".collection-sets-grid").evaluate(element => element.getBoundingClientRect().top + scrollY);
      assert.equal(await recordBytes(page), before, "Screenshot capture preserves original records and prices");
      assert.deepEqual(safety.blockedWrites, []);
      assert.deepEqual(safety.blockedExternal, []);
      assert.deepEqual(safety.pageErrors, []);
      return { ...result, screenshotOnly: true, gridTop, network: safety };
    }
    if (process.env.QA_INSPECT === "1") {
      fs.writeFileSync(path.join(output, `${name}-inspect.txt`), await region.innerText());
      await page.screenshot({ path: path.join(output, `${name}-inspect.png`), fullPage: true });
      return { ...result, inspected: true, network: safety };
    }
    await exercise(page, region, testCase, result);
    assert.equal(await recordBytes(page), before, "Set browsing preserves every original item, sale, expense, catalog price and repository byte");
    assert.equal(safety.syntheticSetCatalog, true, "The fixture catalog supplies known dates, logos and checklist totals");
    assert.deepEqual(safety.blockedWrites, [], "Set browsing attempts no server writes");
    assert.deepEqual(safety.blockedExternal, [], "Set browsing attempts no outside-origin requests");
    assert.deepEqual(safety.pageErrors, [], "No page errors or unexpected dialogs");
    result.recordsAndPricesPreserved = true;
    result.network = safety;
    return result;
  } catch (error) {
    await page.screenshot({ path: path.join(output, `${name}-failure.png`), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(output, `${name}-failure.txt`), `${error.stack}\n\n${await page.locator("body").innerText().catch(() => "No body")}\n\n${JSON.stringify(safety, null, 2)}`);
    throw error;
  } finally { await context.close(); }
}

async function exercise(page, region, testCase, result) {
  const name = `${testCase.width}-${testCase.theme}`;
  const grid = region.getByRole("list", { name: "Trading card sets", exact: true });
  const fusion = grid.getByRole("button", { name: "Open Fusion Strike", exact: true });
  const celebrations = grid.getByRole("button", { name: "Open Celebrations", exact: true });
  const detail = region.locator(".collection-set-detail");
  await expect(fusion).toBeVisible();
  await expect(fusion).toContainText("$90.00");
  await expect(fusion).toContainText("3/4");
  await expect(fusion).toContainText("4 of 5 records valued");
  await expect(fusion.locator("time")).toHaveAttribute("datetime", "2021-11-12");
  await expect.poll(() => fusion.locator("img").evaluateAll(images => images.some(img => img.complete && img.naturalWidth > 0))).toBe(true);
  await celebrations.scrollIntoViewIfNeeded();
  await expect(celebrations).toContainText("$3.00");
  await expect(celebrations).toContainText("2/3");
  await expect(celebrations.locator(".collection-sets-artwork")).toHaveAttribute("data-artwork", "fallback");
  result.realProgressSavedValuesArtworkDatesAndBrokenFallback = true;
  result.gridMetrics = await geometry(page, region, testCase);
  await page.screenshot({ path: path.join(output, `${name}-sets.png`), fullPage: true });

  await region.getByRole("button", { name: "Your sets", exact: true }).click();
  await expect(grid.locator(".collection-sets-card")).toHaveCount(5);
  await expect(grid).not.toContainText("Family binder record");
  await region.getByRole("button", { name: "Your sets", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, `${name}-your-sets.png`), fullPage: true });
  const search = region.getByRole("searchbox", { name: "Search sets", exact: true });
  await search.fill("nebula");
  await expect(grid.locator("button")).toHaveCount(1);
  await expect(grid).toContainText("Nebula custom set");
  await expect(grid).toContainText("Checklist unavailable");
  await region.getByRole("button", { name: "Clear search", exact: true }).click();
  await region.getByRole("combobox", { name: "Sort sets", exact: true }).selectOption("newest");
  await expect(grid.locator(".collection-sets-card-name")).toHaveText(["Fusion Strike", "Celebrations", "Nebula custom set", "Unknown custom set", "Zero custom set"]);
  await search.fill("does not exist");
  await expect(grid).toHaveCount(0);
  await expect(region).toContainText("No matching sets");
  await region.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(grid.locator("button")).toHaveCount(5);
  await region.getByRole("combobox", { name: "Sort sets", exact: true }).selectOption("name");
  await expect(grid.locator(".collection-sets-card-name")).toHaveText(["Celebrations", "Fusion Strike", "Nebula custom set", "Unknown custom set", "Zero custom set"]);
  result.searchOwnedFilterSortAndHonestMissingChecklist = true;

  await search.fill("Unknown custom set");
  const unpriced = grid.getByRole("button", { name: "Open Unknown custom set", exact: true });
  await expect(unpriced).toContainText("No saved value");
  await expect(unpriced).not.toContainText("$0.00");
  await unpriced.click();
  await expect(detail).toBeVisible();
  await expect(detail).not.toContainText("$0.00");
  await expect(detail).toContainText("Not recorded");
  await detail.getByRole("button", { name: /Back to sets$/ }).click();
  await search.fill("Zero custom set");
  const zero = grid.getByRole("button", { name: "Open Zero custom set", exact: true });
  await expect(zero).toContainText("$0.00");
  await expect(zero).not.toContainText("No saved value");
  await zero.click();
  await expect(detail).toContainText("$0.00");
  await detail.getByRole("button", { name: /Back to sets$/ }).click();
  result.missingAndExplicitZeroRemainDistinctInGridAndDetail = true;

  await search.fill("fusion");
  await page.keyboard.press("Tab");
  await fusion.focus();
  const focus = await fusion.evaluate(element => ({ width: parseFloat(getComputedStyle(element).outlineWidth), style: getComputedStyle(element).outlineStyle }));
  assert.ok(focus.width >= 2 && focus.style !== "none", "The keyboard-focused set has a visible focus ring");
  await page.keyboard.press("Enter");
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Fusion Strike", exact: true })).toBeFocused();
  await expect(detail).toContainText("$90.00");
  await expect(detail).not.toContainText("Excluded resale card");
  await expect(detail).not.toContainText("Excluded held card");
  const items = detail.getByRole("list", { name: "Collection items", exact: true });
  await expect(items.locator("button")).toHaveCount(5);
  await expect(items).toContainText("Unknown saved value card");
  await expect(items).toContainText("Not valued");
  result.detailMetrics = await geometry(page, region, testCase);
  await page.screenshot({ path: path.join(output, `${name}-detail.png`), fullPage: true });
  const detailUrl = page.url();
  await items.getByRole("button", { name: "Open Zenith third card", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Zenith third card", exact: true })).toBeVisible();
  await expect(page.locator(".ops-record-detail")).toContainText("Fusion Strike");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(detail).toBeVisible();
  assert.equal(page.url(), detailUrl);
  await expect(items.getByRole("button", { name: "Open Zenith third card", exact: true })).toBeFocused();
  await items.getByRole("button", { name: "Open Zenith third card", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Zenith third card", exact: true })).toBeVisible();
  await page.goBack();
  await expect(detail).toBeVisible();
  await expect(items.getByRole("button", { name: "Open Zenith third card", exact: true })).toBeFocused();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Zenith third card", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(detail).toBeVisible();
  await page.goBack();
  await expect(detail).toHaveCount(0);
  await expect(search).toHaveValue("fusion");
  await expect(region.getByRole("button", { name: "Your sets", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(fusion).toBeFocused();
  await page.goForward();
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Fusion Strike", exact: true })).toBeFocused();
  await detail.getByRole("button", { name: /Back to sets$/ }).click();
  await expect(detail).toHaveCount(0);
  await expect(fusion).toBeFocused();
  result.exactRecordBackBrowserBackForwardFocusAndQueryPreserved = true;

  await search.fill("");
  await region.getByRole("button", { name: "All sets", exact: true }).click();
  if (testCase.width === 320) {
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    result.textScale200Metrics = await geometry(page, region, testCase);
    await page.screenshot({ path: path.join(output, `${name}-text-200.png`), fullPage: true });
    await search.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `${name}-text-200-viewport.png`) });
    await fusion.click();
    await expect(detail).toBeVisible();
    result.textScale200DetailMetrics = await geometry(page, region, testCase);
    await detail.getByRole("button", { name: /Back to sets$/ }).click();
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    result.textScale200 = true;
  }
  const binder = page.locator("details.collection-sets-binders");
  await expect(binder).toHaveCount(1);
  await expect(binder).not.toHaveAttribute("open", "");
  await binder.locator(":scope > summary").click();
  await expect(binder).toHaveAttribute("open", "");
  await expect(binder.getByRole("button", { name: "Add Binder", exact: true })).toBeVisible();
  await binder.locator(":scope > summary").click();
  result.existingBinderToolsRetainedCollapsed = true;
  // The existing privacy toggle applies consistently to set summaries and
  // item values, including when navigating from an active collection filter.
  await page.getByRole("button", { name: "Back to Collection", exact: true }).click();
  const portfolio = page.getByRole("region", { name: "Collection portfolio", exact: true });
  await expect(portfolio).toBeVisible();
  await portfolio.getByRole("button", { name: "Hide values", exact: true }).click();
  const more = portfolio.locator(".everyday-more-menu");
  await more.locator(":scope > summary").click();
  await more.getByRole("button", { name: "Sets & Binders", exact: true }).click();
  await expect(fusion).toContainText("Value hidden");
  await expect(region).not.toContainText("$90.00");
  await fusion.click();
  await expect(detail).toBeVisible();
  await expect(detail).not.toContainText("$90.00");
  await expect(detail).toContainText("Hidden");
  await expect(items.locator(".collection-portfolio-item-value")).toHaveText(Array(5).fill("Value hidden"));
  await detail.getByRole("button", { name: /Back to sets$/ }).click();
  result.collectionValuePrivacyRespected = true;
  await page.reload();
  await expect(region).toBeVisible({ timeout: 30000 });
  await expect(fusion).toContainText("$90.00");
  result.deepRouteReloadWorks = true;
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const testCase of cases) {
      results.push(await runCase(browser, testCase));
      console.log(`PASS collection sets ${testCase.width}px ${testCase.theme}`);
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ actualApp: true, syntheticOnly: true, catalogFixture: "Loopback module response adds synthetic Fusion Strike/Celebrations checklist totals, dates and logos; no original files changed", results }, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
