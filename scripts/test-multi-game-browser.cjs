const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5271/");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Multi-game checks use disposable loopback data only");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/multi-game-browser");
const appKey = "et-tcg-beta-data", repositoryKey = "ember-and-tide.flip-scout.v1";
const cases = (process.env.QA_WIDTHS || "320,390,1440").split(",").map(Number).flatMap(width => ["light", "dark"].filter(theme => !process.env.QA_THEME || process.env.QA_THEME === theme).map(theme => ({ width, height: width === 320 ? 568 : width === 390 ? 844 : 900, theme })));
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="140"><rect width="220" height="140" rx="12" fill="#0f766e"/><text x="110" y="75" text-anchor="middle" fill="white" font-size="18">SYNTHETIC TCG</text></svg>';
const gameNames = ["Pokémon", "Magic: The Gathering", "Yu-Gi-Oh!", "One Piece", "Disney Lorcana"];

function fixtureRecords({ blankNonPokemon = false, legacyGameEdit = false } = {}) {
  const common = { workspaceId: "workspace-personal-local-beta", ownedItemPurpose: "PERSONAL_COLLECTION", status: "Personal Collection", productType: "Single Card", productClassification: "Single", allocatedItemCost: 10, purchaseDate: "2026-10-01", condition: "Near Mint", customMetadata: { preserve: "Original multi-game record" }, itemImage: `${base.origin}/__qa/multi-game/card.svg` };
  if (legacyGameEdit) return { legacy: [], inventory: [{ ...common, id: "qa-multi-legacy-game", game: "MTG", name: "Legacy imported game label", quantity: 1, projectedResaleMid: 12, setName: "Shared Custom Set", cardNumber: "001" }] };
  const legacy = [
    { ...common, id: "qa-multi-pokemon", tcgGame: "pokemon", name: "Aurora Pokémon card", quantity: 2, marketPrice: 20, setName: "Fusion Strike", cardNumber: "001" },
    { ...common, id: "qa-multi-magic", tcgGame: "magic", name: "Arcane Magic card", quantity: 1, marketPrice: 30, setName: "Fusion Strike", cardNumber: "001", itemImage: "", catalogProductId: "qa-multi-wrong-game-image" },
    { ...common, id: "qa-multi-magic-duplicate", tcgGame: "magic", name: "Arcane duplicate Magic card", quantity: 1, marketPrice: 5, setName: "Fusion Strike", cardNumber: "1" },
    { ...common, id: "qa-multi-onepiece", tcgGame: "one-piece", name: "Captain One Piece card", quantity: 1, marketPrice: 50, setName: "East Blue custom set", cardNumber: "001" },
    { ...common, id: "qa-multi-lorcana", tcgGame: "lorcana", name: "Story Lorcana card", quantity: 1, marketPrice: 0, setName: "Azure custom set", cardNumber: "001" },
    { ...common, id: "qa-multi-missing", name: "Unspecified saved card", quantity: 1, marketPrice: 7, setName: "Shared Custom Set", cardNumber: "001" },
    { ...common, id: "qa-multi-unsupported", tcgGame: "digimon", name: "Unsupported saved card", quantity: 1, marketPrice: 9, setName: "Fusion Strike", cardNumber: "001" },
    { ...common, id: "qa-multi-resale", tcgGame: "magic", name: "Excluded Magic resale card", quantity: 1, ownedItemPurpose: "FOR_RESALE", marketPrice: 999, setName: "Fusion Strike", cardNumber: "004" },
  ];
  const inventory = [
    { ...common, id: "qa-multi-yugioh", tcgGame: "yugioh", name: "Duel Yu-Gi-Oh card", quantity: 1, projectedResaleMid: 10, setName: "Duel custom set", cardNumber: "001" },
    { ...common, id: "qa-multi-sealed", tcgGame: "pokemon", name: "Fusion Pokémon sealed box", quantity: 2, projectedResaleMid: 25, productType: "Booster Box", productClassification: "Sealed", setName: "Fusion Strike" },
  ];
  return blankNonPokemon ? { legacy: legacy.filter(row => row.tcgGame === "pokemon"), inventory: inventory.filter(row => row.tcgGame === "pokemon") } : { legacy, inventory };
}

function fixtureExpense() {
  return { id: "qa-multi-expense", expenseId: "qa-multi-expense", date: "2026-10-01", vendor: "Original expense preserved", category: "Supplies", subcategory: "Saved fixture reference", buyer: "", amount: 3.5, paymentMethod: "", linkedItemId: "", linkedSaleId: "", notes: "Preserve original expense notes", receiptImage: "", receiptPhoto: "", receiptImageUrl: "", receiptId: "", rawReceiptText: "", receiptSplitMode: "expense_only", receiptTax: "", receiptPersonalTotal: "", taxDeductible: false, campaignName: "", platform: "", goal: "", startDate: "", endDate: "", linkedSales: "", resultsNotes: "", workspaceId: "workspace-personal-local-beta", workspace_id: "workspace-personal-local-beta", workspaceName: "My Personal Space" };
}

async function setup(browser, testCase, options = {}) {
  const records = fixtureRecords(options);
  const context = await browser.newContext({ viewport: { width: testCase.width, height: testCase.height }, reducedMotion: "reduce", serviceWorkers: "block" });
  const safety = { blockedWrites: [], blockedExternal: [], blockedWebSockets: [], pageErrors: [], syntheticSetCatalog: false };
  await context.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    if (!["GET", "HEAD"].includes(request.method())) { safety.blockedWrites.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    if (url.origin !== base.origin) { safety.blockedExternal.push(url.origin + url.pathname); return route.abort(); }
    if (url.pathname === "/src/data/generated/pokemonTcgSets.json") {
      safety.syntheticSetCatalog = true;
      return route.fulfill({ contentType: "application/javascript", body: `export default ${JSON.stringify([
        { id: "swsh8", name: "Fusion Strike", setCode: "FST", series: "Sword & Shield", releaseDate: "2021-11-12", total: 4, printedTotal: 4, logoUrl: `${base.origin}/__qa/multi-game/logo.svg` },
        { id: "cel25", name: "Celebrations", setCode: "CEL", series: "Sword & Shield", releaseDate: "2021-10-08", total: 3, printedTotal: 3 },
      ])};` });
    }
    if (url.pathname.startsWith("/__qa/multi-game/")) return route.fulfill({ contentType: "image/svg+xml", body: svg });
    if (url.pathname.endsWith("/sealedProducts.json") && request.resourceType() === "fetch") return route.fulfill({ contentType: "application/json", body: JSON.stringify([{ id: "qa-multi-catalog", name: "Synthetic current catalog price", productName: "Synthetic current catalog price", productType: "Supply", sourceType: "manual", marketPrice: 37.25, imageUrl: `${base.origin}/__qa/multi-game/catalog.svg` }]) });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: '{"configured":false}' });
    return route.continue();
  });
  await context.routeWebSocket("**/*", socket => { safety.blockedWebSockets.push(socket.url()); socket.close(); });
  await context.addInitScript(({ theme, legacy, inventory, expense, appKey, repositoryKey }) => {
    if (localStorage.getItem("__qa_multi_game_seeded")) return;
    localStorage.setItem("__qa_multi_game_seeded", "true");
    localStorage.setItem("et-tcg-app-theme", theme);
    localStorage.setItem(appKey, JSON.stringify({
      userType: "collector", dashboardPreset: "simple", appThemeChoice: theme,
      profile: { userId: "local-beta", email: "multi-game-qa@example.test", displayName: "Synthetic TCG collector", appRole: "user", appAccess: "approved" },
      subscriptionProfile: { tier: "collector", featureTier: "collector", subscriptionPlan: "collector", subscriptionStatus: "active" },
      appSetupPersonalization: { experiencePersona: "collector", optionalTools: { community: false, family: false, assistant: false } },
      activeWorkspaceId: "workspace-personal-local-beta", items: legacy,
      sales: [{ id: "qa-multi-sale", workspaceId: "workspace-personal-local-beta", itemName: "Original sale preserved", quantity: 1, salePrice: 19.75 }], expenses: [expense],
      catalogProducts: [{ id: "qa-multi-preserved-price", name: "Preserved manual price", productName: "Preserved manual price", sourceType: "manual", marketValue: 37.25 }, { id: "qa-multi-wrong-game-image", tcgGame: "pokemon", name: "Pokémon catalog image must not decorate Magic", productName: "Pokémon catalog image must not decorate Magic", sourceType: "manual", imageUrl: `${location.origin}/__qa/multi-game/wrong-pokemon-image.svg`, marketValue: 17.25 }],
    }));
    localStorage.setItem(repositoryKey, JSON.stringify({ schemaVersion: 8, updatedAt: "2026-10-19T12:00:00.000Z", inventory, sales: [], purchases: [], lots: [], expenses: [], mileage: [] }));
  }, { theme: testCase.theme, ...records, expense: fixtureExpense(), appKey, repositoryKey });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on("pageerror", error => safety.pageErrors.push(error.message));
  page.on("dialog", dialog => {
    if (safety.allowDraftDiscard && dialog.type() === "confirm" && dialog.message() === "Discard this draft? Saved records will not be changed.") { safety.allowDraftDiscard = false; safety.expectedDraftDiscards = (safety.expectedDraftDiscards || 0) + 1; void dialog.accept(); return; }
    safety.pageErrors.push(`Unexpected ${dialog.type()}: ${dialog.message()}`); void dialog.dismiss();
  });
  return { context, page, safety, records };
}

async function recordBytes(page) {
  return page.evaluate(({ appKey, repositoryKey }) => {
    const data = JSON.parse(localStorage.getItem(appKey));
    return JSON.stringify({ items: data.items, sales: data.sales, expenses: data.expenses, catalogProducts: data.catalogProducts, repository: localStorage.getItem(repositoryKey) });
  }, { appKey, repositoryKey });
}

function assertSeededRecords(original, fixture) {
  const data = JSON.parse(original);
  assert.deepEqual(data.items, fixture.legacy, "Startup preserves every original legacy field, including missing and unsupported game identities");
  assert.deepEqual(JSON.parse(data.repository).inventory, fixture.inventory, "Startup preserves all original repository fields");
  assert.deepEqual(data.sales, [{ id: "qa-multi-sale", workspaceId: "workspace-personal-local-beta", itemName: "Original sale preserved", quantity: 1, salePrice: 19.75 }]);
  assert.deepEqual(data.expenses, [fixtureExpense()]);
  assert.equal(data.catalogProducts.find(row => row.id === "qa-multi-preserved-price").marketValue, 37.25);
}

async function warmCatalog(page) {
  await page.getByRole("button", { name: "Open global Add menu", exact: true }).filter({ visible: true }).first().click();
  await expect.poll(() => page.evaluate(appKey => (JSON.parse(localStorage.getItem(appKey)).catalogProducts || []).some(row => row.id === "qa-multi-catalog"), appKey), { timeout: 30000 }).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator('.flow-modal[data-flow="addActionSheet"]')).toHaveCount(0);
  await settle(page);
}

async function chooseGame(region, game) {
  const summary = region.locator('summary[aria-label^="Filter by game:"]');
  if (!await summary.evaluate(element => element.parentElement.open)) await summary.click();
  const group = region.getByRole("group", { name: "Trading card game", exact: true });
  await group.getByRole("button", { name: game, exact: true }).click();
  await expect(summary).toHaveAttribute("aria-label", `Filter by game: ${game}`);
  if (await summary.evaluate(element => element.parentElement.open)) await summary.click();
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
  assert.deepEqual(metrics.controls.filter(row => row.width < 43.9 || row.height < 43.9), [], "All visible game, collection and set controls offer 44px targets");
  assert.deepEqual(metrics.controls.filter(row => row.left < -1 || row.right > testCase.width + 1), [], "All controls fit the viewport");
  return metrics;
}

async function enterSets(page, portfolio) {
  const more = portfolio.locator(".everyday-more-menu");
  await more.locator(":scope > summary").click();
  await more.getByRole("button", { name: "Sets & Binders", exact: true }).click();
  const region = page.getByRole("region", { name: "Collection sets", exact: true });
  await expect(region).toBeVisible();
  await expect(page.getByRole("heading", { name: "Card sets", exact: true })).toBeVisible();
  return region;
}

async function runCase(browser, testCase) {
  const { context, page, safety, records } = await setup(browser, testCase);
  const name = `${testCase.width}-${testCase.theme}`, result = { ...testCase, actualApp: true, syntheticOnly: true };
  try {
    await page.goto(new URL(`/collection?betaLocalMode=true&themeInspect=${testCase.theme}`, base).href);
    const portfolio = page.getByRole("region", { name: "Collection portfolio", exact: true });
    await expect(portfolio).toBeVisible({ timeout: 45000 });
    await expect(page.locator(".app[data-theme]")).toHaveAttribute("data-theme", testCase.theme);
    await warmCatalog(page);
    const before = await recordBytes(page); assertSeededRecords(before, records);
    const items = portfolio.getByRole("list", { name: "Collection items", exact: true });
    await expect(items.locator("button")).toHaveCount(9);
    await expect(portfolio.getByTestId("portfolio-total")).toHaveText("$201.00");
    await expect(items.getByRole("button", { name: "Open Arcane Magic card", exact: true }).locator("img")).toHaveCount(0);
    result.pokemonCatalogIdentityDoesNotSupplyMagicArtwork = true;
    for (const [game, count] of [["Pokémon", 2], ["Magic: The Gathering", 2], ["Yu-Gi-Oh!", 1], ["One Piece", 1], ["Disney Lorcana", 1], ["Unspecified / other", 2]]) {
      await chooseGame(portfolio, game);
      await expect(items.locator("button")).toHaveCount(count);
      await expect(portfolio.getByTestId("portfolio-total")).toHaveText("$201.00");
    }
    await chooseGame(portfolio, "Magic: The Gathering");
    const search = portfolio.getByRole("searchbox", { name: "Search collection", exact: true });
    await search.fill("duplicate");
    await expect(items.locator("button")).toHaveCount(1);
    await expect(items).toContainText("Arcane duplicate Magic card");
    await search.fill("pokemon");
    await expect(items).toHaveCount(0);
    await portfolio.getByRole("button", { name: "Clear search & filters", exact: true }).click();
    await expect(search).toHaveValue("");
    await expect(items.locator("button")).toHaveCount(9);
    await chooseGame(portfolio, "Magic: The Gathering");
    await items.getByRole("button", { name: "Open Arcane Magic card", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Arcane Magic card", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(portfolio.locator('summary[aria-label^="Filter by game:"]')).toHaveAttribute("aria-label", "Filter by game: Magic: The Gathering");
    await expect(items.locator("button")).toHaveCount(2);
    result.collectionFiltersSearchResetAndExactRecordBack = true;
    result.wholePortfolioTotalUnchanged = true;
    await chooseGame(portfolio, "All games");
    const filterSummary = portfolio.locator('summary[aria-label^="Filter by game:"]');
    await filterSummary.click();
    result.collectionMetrics = await geometry(page, portfolio, testCase);
    await page.screenshot({ path: path.join(output, `${name}-game-picker.png`), fullPage: true });
    await filterSummary.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `${name}-game-picker-viewport.png`) });
    await filterSummary.click();
    const region = await enterSets(page, portfolio);
    const setGrid = region.getByRole("list", { name: "Trading card sets", exact: true });
    const detail = region.locator(".collection-set-detail");
    await chooseGame(region, "Magic: The Gathering");
    const magicFusion = setGrid.getByRole("button", { name: "Open Fusion Strike", exact: true });
    await expect(setGrid.locator("button")).toHaveCount(1);
    await expect(magicFusion).toContainText("$35.00");
    await expect(magicFusion).toContainText("Checklist unavailable");
    await expect(magicFusion.locator("time")).toHaveCount(0);
    await magicFusion.click();
    await expect(detail).toContainText("$35.00");
    await expect(detail).not.toContainText("Aurora Pokémon card");
    await expect(detail).not.toContainText("Unsupported saved card");
    const setItems = detail.getByRole("list", { name: "Collection items", exact: true });
    await expect(setItems.locator("button")).toHaveCount(2);
    await setItems.getByRole("button", { name: "Open Arcane Magic card", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Arcane Magic card", exact: true })).toBeVisible();
    await page.goBack();
    await expect(detail).toBeVisible();
    await expect(setItems.getByRole("button", { name: "Open Arcane Magic card", exact: true })).toBeFocused();
    await detail.getByRole("button", { name: "Add an item", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Add Collection Item", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Trading card game", exact: true })).toHaveValue("magic");
    await expect(page.getByRole("textbox", { name: "Set", exact: true })).toHaveValue("Fusion Strike");
    await expect(page.getByRole("textbox", { name: "Character or subject", exact: true })).toBeVisible();
    result.formMetrics = await geometry(page, page.locator(".ops-guided-form"), testCase);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(detail).toBeVisible();
    await detail.getByRole("button", { name: /Back to sets$/ }).click();
    result.sameNameSetNamespacesDuplicateCardIdentityAndPrefill = true;
    await chooseGame(region, "Pokémon");
    const pokemonFusion = setGrid.getByRole("button", { name: "Open Fusion Strike", exact: true });
    await expect(pokemonFusion).toContainText("$90.00");
    await expect(pokemonFusion).toContainText("1/4");
    await expect(pokemonFusion.locator("time")).toHaveAttribute("datetime", "2021-11-12");
    await expect(setGrid.getByRole("button", { name: "Open Celebrations", exact: true })).toBeVisible();
    await chooseGame(region, "Unspecified / other");
    await expect(setGrid.locator("button")).toHaveCount(2);
    await expect(setGrid.getByRole("button", { name: "Open Fusion Strike", exact: true })).toContainText("$9.00");
    await expect(setGrid.getByRole("button", { name: "Open Fusion Strike", exact: true })).toContainText("Checklist unavailable");
    await expect(setGrid.getByRole("button", { name: "Open Shared Custom Set", exact: true })).toContainText("$7.00");
    for (const [game, set, amount] of [["Yu-Gi-Oh!", "Duel custom set", "$10.00"], ["One Piece", "East Blue custom set", "$50.00"], ["Disney Lorcana", "Azure custom set", "$0.00"]]) {
      await chooseGame(region, game);
      await expect(setGrid.locator("button")).toHaveCount(1);
      await expect(setGrid.getByRole("button", { name: `Open ${set}`, exact: true })).toContainText(amount);
    }
    result.fiveGameSetFiltersAndHonestUnknownBucket = true;
    await chooseGame(region, "All games");
    await region.getByRole("button", { name: "Your sets", exact: true }).click();
    await expect(setGrid.locator("button")).toHaveCount(7);
    await region.getByRole("searchbox", { name: "Search sets", exact: true }).fill("fusion");
    await expect(setGrid.locator("button")).toHaveCount(3);
    const ambiguousMagic = setGrid.getByRole("button", { name: "Open Fusion Strike (Magic: The Gathering)", exact: true });
    const ambiguousPokemon = setGrid.getByRole("button", { name: "Open Fusion Strike (Pokémon)", exact: true });
    const ambiguousOther = setGrid.getByRole("button", { name: "Open Fusion Strike (digimon)", exact: true });
    await expect(ambiguousMagic).toBeVisible(); await expect(ambiguousPokemon).toBeVisible(); await expect(ambiguousOther).toBeVisible();
    const magicSetId = await ambiguousMagic.getAttribute("data-set-id");
    await ambiguousMagic.click();
    await expect(detail).toContainText("$35.00");
    await detail.getByRole("button", { name: /Back to sets$/ }).click();
    await expect(ambiguousMagic).toBeFocused();
    assert.equal(await ambiguousMagic.getAttribute("data-set-id"), magicSetId, "Back focuses the exact game namespace, not the first equal set name");
    await ambiguousOther.click();
    await expect(detail).toContainText("$9.00");
    await detail.getByRole("button", { name: "Add an item", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Trading card game", exact: true })).toHaveValue("unspecified");
    await expect(page.getByRole("textbox", { name: "Set", exact: true })).toHaveValue("Fusion Strike");
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("private-business-hub.form-draft.collection.new") || "{}").tcgGame)).toBe("digimon");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await detail.getByRole("button", { name: /Back to sets$/ }).click();
    await expect(ambiguousOther).toBeFocused();
    result.ambiguousSetsHaveGameQualifiedNamesExactIdFocusAndPreservedCustomGameDraft = true;
    await region.getByRole("button", { name: "Clear search", exact: true }).click();
    await region.getByRole("button", { name: "All sets", exact: true }).click();
    const setsSummary = region.locator('summary[aria-label^="Filter by game:"]');
    await setsSummary.click();
    result.setMetrics = await geometry(page, region, testCase);
    await page.screenshot({ path: path.join(output, `${name}-sets-game-picker.png`), fullPage: true });
    await page.evaluate(() => window.scrollTo(0, 0)); await settle(page);
    await page.screenshot({ path: path.join(output, `${name}-sets-game-picker-viewport.png`) });
    await setsSummary.click();
    await chooseGame(region, "Magic: The Gathering");
    await page.screenshot({ path: path.join(output, `${name}-magic-sets.png`), fullPage: true });
    if (testCase.width === 320) {
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await setsSummary.click();
      result.textScale200SetMetrics = await geometry(page, region, testCase);
      await page.screenshot({ path: path.join(output, `${name}-text-200.png`), fullPage: true });
      await setsSummary.click();
      await page.getByRole("button", { name: "Back to Collection", exact: true }).click();
      await filterSummary.click();
      result.textScale200CollectionMetrics = await geometry(page, portfolio, testCase);
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
      result.textScale200 = true;
    }
    assert.equal(await recordBytes(page), before, "Browsing and cancelled manual drafts preserve original items, sales, expenses, catalog prices and exact repository bytes");
    assert.equal(safety.syntheticSetCatalog, true);
    assert.deepEqual(safety.blockedWrites, []);
    assert.deepEqual(safety.blockedExternal, []);
    assert.deepEqual(safety.pageErrors, []);
    result.originalRecordsAndPricesPreserved = true; result.network = safety;
    return result;
  } catch (error) {
    await page.screenshot({ path: path.join(output, `${name}-failure.png`), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(output, `${name}-failure.txt`), `${error.stack}\n\n${await page.locator("body").innerText().catch(() => "No body")}\n\n${JSON.stringify(safety, null, 2)}`);
    throw error;
  } finally { await context.close(); }
}

async function runEmptyGame(browser) {
  const testCase = { width: 390, height: 844, theme: "dark" };
  const { context, page, safety, records } = await setup(browser, testCase, { blankNonPokemon: true });
  try {
    await page.goto(new URL("/collection?betaLocalMode=true&themeInspect=dark", base).href);
    const portfolio = page.getByRole("region", { name: "Collection portfolio", exact: true });
    await expect(portfolio).toBeVisible({ timeout: 45000 }); await warmCatalog(page);
    const before = await recordBytes(page); assertSeededRecords(before, records);
    await chooseGame(portfolio, "Magic: The Gathering");
    await expect(portfolio.getByRole("list", { name: "Collection items", exact: true })).toHaveCount(0);
    await portfolio.getByRole("button", { name: "Add Item", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Trading card game", exact: true })).toHaveValue("magic");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(portfolio).toBeVisible();
    assert.equal(await recordBytes(page), before, "Empty filtered collection opens a game-prefilled draft without editing records");
    const region = await enterSets(page, portfolio);
    await chooseGame(region, "Magic: The Gathering");
    await expect(region.getByRole("list", { name: "Trading card sets", exact: true })).toHaveCount(0);
    await expect(region).not.toContainText("Celebrations");
    await expect(region).not.toContainText("1/4");
    await region.getByRole("button", { name: "Add an item", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Trading card game", exact: true })).toHaveValue("magic");
    await expect(page.getByRole("textbox", { name: "Set", exact: true })).toHaveValue("");
    const options = await page.getByRole("combobox", { name: "Trading card game", exact: true }).locator("option").allTextContents();
    for (const game of gameNames) assert.ok(options.includes(game), `Manual collection form supports ${game}`);
    await expect(page.getByRole("textbox", { name: "Character or subject", exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(output, "390-dark-manual-magic.png"), fullPage: true });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(region).toBeVisible();
    assert.equal(await recordBytes(page), before);
    // Save exactly one disposable new record in this isolated browser context.
    // The preserved projection below excludes only that deliberate addition.
    await region.getByRole("button", { name: "Add an item", exact: true }).click();
    await page.getByRole("textbox", { name: "Item name", exact: true }).fill("Disposable new Magic card");
    await page.getByRole("textbox", { name: "Set", exact: true }).fill("Fusion Strike");
    await page.getByRole("textbox", { name: "Card number", exact: true }).fill("001");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Save Item", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Disposable new Magic card", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(region).toBeVisible();
    const after = JSON.parse(await recordBytes(page)), original = JSON.parse(before);
    assert.deepEqual(after.items, original.items);
    assert.deepEqual(after.sales, original.sales);
    assert.deepEqual(after.expenses, original.expenses);
    assert.deepEqual(after.catalogProducts, original.catalogProducts);
    const repoAfter = JSON.parse(after.repository), repoBefore = JSON.parse(original.repository);
    const created = repoAfter.inventory.filter(row => !records.inventory.some(saved => saved.id === row.id));
    assert.equal(created.length, 1, "The manual form adds only its deliberate disposable record");
    assert.equal(created[0].name, "Disposable new Magic card");
    assert.equal(created[0].tcgGame, "magic");
    assert.equal(created[0].setName, "Fusion Strike");
    assert.equal(created[0].cardNumber, "001");
    assert.equal(created[0].ownedItemPurpose, "PERSONAL_COLLECTION");
    for (const row of records.inventory) assert.deepEqual(repoAfter.inventory.find(saved => saved.id === row.id), row);
    for (const field of ["sales", "purchases", "lots", "expenses", "mileage"]) assert.deepEqual(repoAfter[field], repoBefore[field]);
    const magicSet = region.getByRole("list", { name: "Trading card sets", exact: true }).getByRole("button", { name: "Open Fusion Strike", exact: true });
    await expect(magicSet).toBeVisible();
    await expect(magicSet).toContainText("Checklist unavailable");
    await expect(magicSet.locator("time")).toHaveCount(0);
    assert.deepEqual(safety.blockedWrites, []); assert.deepEqual(safety.blockedExternal, []); assert.deepEqual(safety.pageErrors, []);
    return { test: "Empty non-Pokémon library remains honest; game-prefilled manual draft can be cancelled and one disposable Magic record saved", passed: true, newDisposableRecordOnly: true, originalRecordsAndPricesPreserved: true, network: safety };
  } catch (error) {
    await page.screenshot({ path: path.join(output, "empty-game-failure.png"), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(output, "empty-game-failure.txt"), `${error.stack}\n\n${await page.locator("body").innerText().catch(() => "No body")}\n\n${JSON.stringify(safety, null, 2)}`);
    throw error;
  } finally { await context.close(); }
}

async function runLegacyGameCorrection(browser) {
  const testCase = { width: 390, height: 844, theme: "light" };
  const { context, page, safety, records } = await setup(browser, testCase, { legacyGameEdit: true });
  try {
    await page.goto(new URL("/collection?betaLocalMode=true&themeInspect=light", base).href);
    const portfolio = page.getByRole("region", { name: "Collection portfolio", exact: true });
    await expect(portfolio).toBeVisible({ timeout: 45000 }); await warmCatalog(page);
    const before = await recordBytes(page); assertSeededRecords(before, records);
    await chooseGame(portfolio, "Magic: The Gathering");
    await portfolio.getByRole("list", { name: "Collection items", exact: true }).getByRole("button", { name: "Open Legacy imported game label", exact: true }).click();
    await page.locator(".ops-detail-more > summary").click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const game = page.getByRole("combobox", { name: "Trading card game", exact: true });
    await expect(game).toHaveValue("magic");
    await game.selectOption("pokemon");
    await expect(game).toHaveValue("pokemon");
    await expect(page.getByRole("textbox", { name: "Pokémon", exact: true })).toBeVisible();
    const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem("private-business-hub.form-draft.collection.qa-multi-legacy-game") || "{}"));
    assert.equal(draft.tcgGame, "pokemon");
    assert.equal(Object.hasOwn(draft, "game"), false, "The explicit new selection is not left in conflict with imported aliases");
    assert.equal(draft.tcgGameAssignmentHistory.at(-1).previousLabels.game, "MTG", "The exact imported label is archived in the unsaved draft");
    assert.equal(draft.tcgGameAssignmentHistory.at(-1).game, "pokemon");
    assert.equal(await recordBytes(page), before, "Changing the selector alone does not edit original stored records");
    await page.screenshot({ path: path.join(output, "390-light-legacy-game-draft.png"), fullPage: true });
    safety.allowDraftDiscard = true;
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Legacy imported game label", exact: true })).toBeVisible();
    assert.equal(safety.expectedDraftDiscards, 1);
    assert.equal(await recordBytes(page), before, "Discarding the draft retains every exact original label, field, price and repository byte");
    assert.deepEqual(safety.blockedWrites, []); assert.deepEqual(safety.blockedExternal, []); assert.deepEqual(safety.pageErrors, []);
    return { test: "Explicit correction of an imported MTG game alias archives prior labels only in the draft and cancels without modifying original data", passed: true, originalRecordsAndPricesPreserved: true, network: safety };
  } catch (error) {
    await page.screenshot({ path: path.join(output, "legacy-game-failure.png"), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(output, "legacy-game-failure.txt"), `${error.stack}\n\n${await page.locator("body").innerText().catch(() => "No body")}\n\n${JSON.stringify(safety, null, 2)}`);
    throw error;
  } finally { await context.close(); }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true }), results = [], guards = [];
  try {
    for (const testCase of cases) { results.push(await runCase(browser, testCase)); console.log(`PASS multi-game ${testCase.width}px ${testCase.theme}`); }
    guards.push(await runEmptyGame(browser)); console.log("PASS empty non-Pokémon manual guard");
    guards.push(await runLegacyGameCorrection(browser)); console.log("PASS legacy imported game correction guard");
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ actualApp: true, syntheticOnly: true, catalogFixture: "Disposable loopback Pokémon catalog metadata; no original catalogs changed; no live non-Pokémon catalogs claimed", results, guards }, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
