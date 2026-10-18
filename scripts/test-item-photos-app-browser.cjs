const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5243").origin;
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname), "Photo fixtures must use disposable local state");
const output = path.resolve("artifacts/qa/item-photos-app");
const appKey = "et-tcg-beta-data";
const repositoryKey = "ember-and-tide.flip-scout.v1";
const catalogPhoto = `${base}/__qa/photos/catalog.svg`;
const personalPhoto = `${base}/__qa/photos/personal.svg`;
const snakePhoto = `${base}/__qa/photos/snake.svg`;
const catalogId = "qa-photo-catalog-product";
const catalogRows = [{ id: catalogId, name: "QA catalog reference", productName: "QA catalog reference", setName: "QA photo set", productType: "Supply", imageUrl: catalogPhoto, marketPrice: 999 }];
const cases = [
  ...["collection", "legacy-inventory", "repository-inventory"].flatMap(screen => [{ screen, width: 320, theme: "dark" }, { screen, width: 1440, theme: "light" }]),
  { screen: "collection", width: 390, theme: "light" },
  { screen: "collection", width: 1440, theme: "dark" },
];

function recordsFor(screen) {
  const ownedItemPurpose = screen === "collection" ? "PERSONAL_COLLECTION" : "FOR_RESALE";
  const shared = { quantity: 1, ownedItemPurpose, status: screen === "collection" ? "Personal Collection" : "In stock", productType: "Supply", workspaceId: "workspace-personal-local-beta", allocatedItemCost: 12, projectedResaleMid: 25, customMetadata: { preserved: true } };
  return [
    { ...shared, id: `qa-${screen}-personal`, name: "QA personal item photo", itemImage: personalPhoto, catalogProductId: catalogId },
    { ...shared, id: `qa-${screen}-snake`, name: "QA saved item photo", item_image: snakePhoto },
    { ...shared, id: `qa-${screen}-catalog`, name: "QA matched catalog photo", catalogProductId: catalogId },
  ];
}

async function snapshot(page) {
  return page.evaluate(({ appKey, repositoryKey }) => {
    const data = JSON.parse(localStorage.getItem(appKey));
    return { items: JSON.stringify(data.items), sales: JSON.stringify(data.sales), expenses: JSON.stringify(data.expenses), repository: localStorage.getItem(repositoryKey) };
  }, { appKey, repositoryKey });
}

async function checkPhoto(locator, expectedSource) {
  await expect(locator).toBeVisible();
  await expect(locator).toHaveAttribute("src", expectedSource);
  await expect.poll(() => locator.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  const geometry = await locator.evaluate(image => ({ width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height, fit: getComputedStyle(image).objectFit }));
  assert.ok(geometry.width >= 44 && geometry.height >= 44, "Photos remain visible at usable dimensions");
  assert.equal(geometry.fit, "contain", "The full collectible artwork remains visible");
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const testCase of cases) {
      const { screen, width, theme } = testCase;
      const records = recordsFor(screen);
      const context = await browser.newContext({ viewport: { width, height: 940 }, reducedMotion: "reduce", serviceWorkers: "block" });
      const attemptedWrites = []; const externalRequests = []; let catalogRequests = 0;
      await context.route("**/*", route => {
        const request = route.request(); const url = new URL(request.url());
        if (!["GET", "HEAD"].includes(request.method())) { attemptedWrites.push(`${request.method()} ${url.pathname}`); return route.abort(); }
        if (url.origin !== base) { externalRequests.push(url.hostname); return route.abort(); }
        if (url.pathname.startsWith("/__qa/photos/")) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="220" viewBox="0 0 160 220"><rect x="8" y="8" width="144" height="204" rx="12" fill="#0f766e"/><rect x="22" y="24" width="116" height="130" rx="6" fill="#67c8bb"/><text x="80" y="190" text-anchor="middle" fill="white" font-size="18">TEST ITEM</text></svg>' });
        if (url.pathname.endsWith("/sealedProducts.json") && request.resourceType() === "fetch") { catalogRequests += 1; return route.fulfill({ contentType: "application/json", body: JSON.stringify(catalogRows) }); }
        if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: '{"configured":false}' });
        return route.continue();
      });
      await context.addInitScript(({ theme, records, screen, appKey, repositoryKey }) => {
        if (localStorage.getItem("__qa_item_photos_seeded")) return;
        localStorage.setItem("__qa_item_photos_seeded", "true");
        localStorage.setItem("et-tcg-app-theme", theme);
        const repositoryOnly = screen === "repository-inventory";
        localStorage.setItem(appKey, JSON.stringify({
          userType: "seller", dashboardPreset: "seller", appThemeChoice: theme,
          profile: { userId: "local-beta", email: "qa-photos@example.test", displayName: "Synthetic photo test", appRole: "user", appAccess: "approved" },
          subscriptionProfile: { tier: "seller", featureTier: "seller", subscriptionPlan: "seller", subscriptionStatus: "active" },
          appSetupPersonalization: { experiencePersona: "seller", optionalTools: { community: false, family: false, assistant: false } },
          activeWorkspaceId: "workspace-personal-local-beta",
          items: repositoryOnly ? [] : records,
          sales: [{ id: "qa-photo-preserved-sale", itemName: "Preserved sale", quantity: 1, salePrice: 19 }],
          expenses: [{ id: "qa-photo-preserved-expense", description: "Preserved supplies", amount: 3 }],
        }));
        localStorage.setItem(repositoryKey, JSON.stringify({ schemaVersion: 8, updatedAt: "2026-10-17T12:00:00.000Z", inventory: repositoryOnly ? records : [], sales: [], purchases: [], lots: [], expenses: [], mileage: [] }));
      }, { theme, records, screen, appKey, repositoryKey });
      const page = await context.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
      const name = `${screen}-${width}-${theme}`;
      try {
        await page.goto(`${base}${screen === "collection" ? "/collection" : "/business/inventory"}?betaLocalMode=true&themeInspect=${theme}`);
        const cards = page.locator(".everyday-record-list .everyday-record-card");
        await expect(cards).toHaveCount(3, { timeout: 45000 });
        await expect(page.locator(".app[data-theme]")).toHaveAttribute("data-theme", theme);
        const before = await snapshot(page);
        assert.equal(before.items, JSON.stringify(screen === "repository-inventory" ? [] : records), "Startup retains each original photo field and price");
        if (screen === "repository-inventory") assert.deepEqual(JSON.parse(before.repository).inventory, records, "Repository-only fixtures retain their original data");
        const expected = [[records[0], personalPhoto], [records[1], snakePhoto], [records[2], catalogPhoto]];
        for (const [record, source] of expected) {
          const card = page.getByRole("button", { name: `Open ${record.name}`, exact: true });
          await checkPhoto(card.locator("img"), source);
          await card.click();
          await expect(page.locator(".ops-record-detail")).toBeVisible();
          await checkPhoto(page.locator(".ops-detail-hero img"), source);
          await expect(page.locator(".ops-record-detail")).not.toContainText("$999.00");
          await page.getByRole("button", { name: "Back", exact: true }).click();
          await expect(cards).toHaveCount(3);
        }
        assert.ok(catalogRequests >= 1, "The current workspace warms the catalog without requiring a visit to legacy Vault or Market");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "No horizontal overflow");
        assert.deepEqual(await snapshot(page), before, "Opening photos, catalog matching, and Back preserve all saved records");
        assert.deepEqual(attemptedWrites, []); assert.deepEqual(errors, []);
        await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
        results.push({ ...testCase, passed: true, photos: 3, details: 3, catalogRequests, externalRequestsBlocked: externalRequests.length, dataPreserved: true });
        console.log(`PASS ${name}: stored and catalog photos, details, Back, data preservation`);
      } catch (error) {
        await page.screenshot({ path: path.join(output, `failure-${name}.png`), fullPage: true });
        fs.writeFileSync(path.join(output, `failure-${name}.json`), JSON.stringify({ error: error.message, errors, attemptedWrites, catalogRequests }, null, 2));
        throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
