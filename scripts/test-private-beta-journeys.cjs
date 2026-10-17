const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217/");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Synthetic acceptance is loopback only");
const mode = process.env.PRIVATE_BETA_MODE || "journeys";
assert.ok(["journeys", "production-smoke"].includes(mode));
const output = path.resolve(process.env.PRIVATE_BETA_QA_DIR || process.env.QA_OUTPUT_DIR || "artifacts/qa/private-beta-candidate/acceptance");
const key = "ember-and-tide.flip-scout.v1";
const results = [];
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
let lastPage;
let currentStep = "initialization";

async function isolate(context, theme) {
  const blocked = [];
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base.origin || request.method() !== "GET") {
      blocked.push({ origin: url.origin, pathname: url.pathname, method: request.method() });
      return route.abort();
    }
    // These journeys exercise local state. A configured/live provider response
    // must never make a local acceptance run appear to verify integration.
    if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ configured: false, healthy: false, status: "Not Configured" }) });
    return route.continue();
  });
  await context.addInitScript(({ theme }) => {
    if (!localStorage.getItem("private-beta-acceptance-initialized")) {
      localStorage.setItem("et-tcg-app-theme", theme);
      localStorage.setItem("private-beta-acceptance-initialized", "1");
    }
  }, { theme });
  return blocked;
}

async function denial(context, label, query = "") {
  const page = await context.newPage(); lastPage = page;
  await page.goto(new URL(`/owner-center/records?recordQ=Synthetic${query}`, base).href);
  await expect(page.locator("body")).toContainText(/Log In|Log in|Sign in|Sign In|Owner access|owner access|Verified owner/);
  await expect(page.getByRole("region", { name: "Private record search", exact: true })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Synthetic Aurora acceptance");
  await page.screenshot({ path: path.join(output, `${label}.png`), fullPage: true });
  await page.close();
}

async function journey(browser, theme, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", locale: "en-US", timezoneId: "America/New_York", serviceWorkers: "block" });
  const blocked = await isolate(context, theme);
  const page = await context.newPage(); lastPage = page; page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !/Failed to load resource|net::ERR_|favicon/i.test(message.text())) errors.push(message.text()); });
  page.on("dialog", (dialog) => dialog.accept());
  const go = async (route) => {
    await page.goto(new URL(`${route}${route.includes("?") ? "&" : "?"}betaLocalMode=true`, base).href);
    await page.locator(".app[data-theme]").waitFor();
  };
  const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  const next = () => page.getByRole("button", { name: "Continue", exact: true }).click();
  const manual = () => page.locator(".manual-lifecycles").first();
  const form = () => page.locator(".manual-lifecycle-form");
  const review = () => page.locator(".manual-lifecycle-review");
  const saveManual = async () => { await form().getByRole("button", { name: "Save record", exact: true }).click(); await review().waitFor(); };
  const capture = async (name) => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name}: no horizontal overflow`);
    assert.equal(await page.locator(".app").getAttribute("data-theme"), theme);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    await page.screenshot({ path: path.join(output, `${name}-${theme}-${width}.png`), fullPage: true });
  };
  const addItem = async ({ collector, name, quantity, cost }) => {
    await go(collector ? "/collection" : "/business/inventory");
    await page.getByRole("button", { name: collector ? "Add Item" : "Add Resale Inventory", exact: true }).first().click();
    await page.getByLabel(/^Item name/).fill(name);
    await page.getByLabel("Quantity", { exact: true }).fill(String(quantity));
    await page.getByLabel("Set", { exact: true }).fill("Synthetic acceptance set");
    await page.getByLabel("Card number", { exact: true }).fill(collector ? "001" : "002");
    await next();
    await page.getByLabel("Purchase source", { exact: true }).fill("Synthetic acceptance intake");
    await page.getByLabel("Allocated item cost", { exact: true }).fill(String(cost));
    await next();
    await page.getByLabel("Storage location", { exact: true }).fill(collector ? "SYN-BINDER" : "SYN-BIN");
    await page.getByRole("button", { name: collector ? "Save Item" : "Save Inventory", exact: true }).click();
    if (collector) {
      await expect(page.locator(".ops-record-detail")).toContainText(name);
      await page.getByRole("button", { name: "Back", exact: true }).click();
    }
    await page.getByRole("button", { name: `Open ${name}`, exact: true }).waitFor();
    const state = await saved();
    const record = state.inventory.find((row) => row.name === name);
    assert.ok(record?.id, "Actual form save assigned an identity");
    assert.equal(record.ownedItemPurpose, collector ? "PERSONAL_COLLECTION" : "FOR_RESALE");
    return record;
  };

  currentStep = `${theme}/${width}: collector intake`;
  await go("/collection");
  assert.equal((await saved())?.inventory?.length || 0, 0, "Start with no pre-seeded owned records");
  const collector = await addItem({ collector: true, name: "Synthetic Aurora acceptance", quantity: 1, cost: 12 });
  await page.reload(); await page.getByRole("button", { name: `Open ${collector.name}`, exact: true }).waitFor();
  await page.getByLabel("Search collection", { exact: true }).fill("Aurora acceptance");
  await page.getByRole("button", { name: `Open ${collector.name}`, exact: true }).click();
  await expect(page.locator(".ops-record-detail")).toContainText("SYN-BINDER");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Search collection", { exact: true })).toHaveValue("Aurora acceptance");
  await capture("collector-saved");

  currentStep = `${theme}/${width}: binder and wishlist`;
  await go("/collection/sets");
  await manual().getByRole("button", { name: "Add Binder", exact: true }).click();
  await form().getByLabel("Title", { exact: true }).fill("Synthetic acceptance binder");
  await form().getByLabel("Pages", { exact: true }).fill("2"); await saveManual();
  await review().getByRole("button", { name: "Back to Binder records", exact: true }).click();
  await manual().getByRole("button", { name: "Slot assignment", exact: true }).click();
  await manual().getByRole("button", { name: "Add Slot assignment", exact: true }).click();
  await form().getByLabel("Owned item", { exact: true }).selectOption(collector.id);
  await form().getByLabel("Binder", { exact: true }).selectOption({ label: "Synthetic acceptance binder" });
  await form().getByLabel("Slot", { exact: true }).fill("3"); await saveManual();
  await go("/collection/sets");
  await manual().locator(".manual-lifecycle-card").filter({ hasText: "Synthetic acceptance binder" }).click();
  await expect(review().locator(".manual-binder-preview")).toContainText(collector.name);
  await capture("collector-organized");
  await go("/collection/wishlist");
  await manual().getByRole("button", { name: "Add Wishlist target", exact: true }).click();
  await form().getByLabel("Title", { exact: true }).fill("Synthetic acceptance wanted card");
  await form().getByLabel("Set name", { exact: true }).fill("Synthetic acceptance set");
  await form().getByLabel("Collector number", { exact: true }).fill("001"); await saveManual();
  await expect(review()).toContainText(collector.name);
  assert.equal((await saved()).inventory.length, 1, "Wishlist and organization create no duplicate owned stock");

  currentStep = `${theme}/${width}: exact record search and Back`;
  await go("/owner-center/records?recordQ=Aurora%20acceptance");
  await page.locator(".record-search__group a").filter({ hasText: collector.name }).click();
  await expect(page.locator(".ops-record-detail")).toContainText(collector.id);
  const exactRecordUrl = page.url();
  assert.equal(new URL(exactRecordUrl).searchParams.get("record"), collector.id);
  await page.reload(); await expect(page.locator(".ops-record-detail")).toContainText(collector.id);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Search saved records", { exact: true })).toHaveValue("Aurora acceptance");
  await capture("collector-search");

  currentStep = `${theme}/${width}: seller intake and sale`;
  const stock = await addItem({ collector: false, name: "Synthetic resale acceptance pair", quantity: 2, cost: 20 });
  await page.getByRole("button", { name: `Open ${stock.name}`, exact: true }).click();
  await manual().getByRole("button", { name: "Add Processing & storage", exact: true }).click();
  await form().getByLabel("Status", { exact: true }).selectOption("Stored");
  await form().getByLabel("Storage location", { exact: true }).fill("SYN-BIN-VERIFIED"); await saveManual();
  await go("/business/sales");
  await page.getByRole("button", { name: "Record Sale", exact: true }).first().click();
  await page.getByLabel(/^Inventory item/).selectOption(stock.id);
  await page.getByLabel("Quantity sold", { exact: true }).fill("1");
  await page.getByLabel("Gross sale price", { exact: true }).fill("50");
  await page.getByLabel("Sales channel", { exact: true }).fill("Synthetic acceptance booth");
  await next(); await next(); await page.getByRole("button", { name: "Save Sale", exact: true }).click();
  await expect(page.locator(".everyday-record-card")).toHaveCount(1);
  const originalSale = (await saved()).sales[0];
  assert.equal(originalSale.netProceeds, 50); assert.equal(originalSale.allocatedCostOfGoodsSold, 10);
  fs.writeFileSync(path.join(output, `seller-intake-${theme}-${width}.json`), JSON.stringify({ inventory: stock, sale: originalSale }, null, 2));
  await page.locator(".everyday-record-card").click();
  await manual().getByRole("button", { name: "Add Manual shipment", exact: true }).click(); await saveManual();
  await review().getByRole("button", { name: "Edit record", exact: true }).click();
  await form().getByLabel("Status", { exact: true }).selectOption("Shipped");
  await form().getByLabel("Carrier or handoff method", { exact: true }).fill("Synthetic manual handoff");
  await form().getByLabel("Tracking / handoff reference", { exact: true }).fill("SYN-HANDOFF-ACCEPTANCE");
  await form().getByLabel("Shipped", { exact: true }).fill("2026-09-23T10:00"); await saveManual();
  await capture("seller-shipped");

  currentStep = `${theme}/${width}: inspected return`;
  await review().getByRole("button", { name: "Back to Manual shipment records", exact: true }).click();
  await manual().getByRole("button", { name: "Inspected return", exact: true }).click();
  await manual().getByRole("button", { name: "Add Inspected return", exact: true }).click(); await saveManual();
  await review().getByRole("button", { name: "Edit record", exact: true }).click();
  await form().getByLabel("Status", { exact: true }).selectOption("Received"); await saveManual();
  await review().getByRole("button", { name: "Edit record", exact: true }).click();
  await form().getByLabel("Status", { exact: true }).selectOption("Inspected");
  await form().getByLabel("Inspected disposition", { exact: true }).selectOption("Restock review");
  await form().getByLabel("Inspection findings", { exact: true }).fill("Synthetic same unit received and resale condition checked.");
  await form().getByLabel("Additional refund amount", { exact: true }).fill("40.00");
  await form().getByLabel("Manual refund reference", { exact: true }).fill("SYN-REFUND-ACCEPTANCE"); await saveManual();
  const inspected = await saved();
  const settlement = page.getByRole("region", { name: "Return settlement", exact: true });
  await settlement.getByRole("button", { name: "Review stock & refund", exact: true }).click();
  await settlement.getByRole("button", { name: "Cancel review", exact: true }).click();
  assert.deepEqual(await saved(), inspected, "Preview cancellation does not mutate stock or refund");
  await settlement.getByRole("button", { name: "Review stock & refund", exact: true }).click();
  const confirmation = settlement.getByRole("checkbox");
  await confirmation.focus(); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab"); await expect(confirmation).toBeFocused();
  assert.notEqual(await confirmation.evaluate((node) => getComputedStyle(node).outlineStyle), "none");
  await page.keyboard.press("Space");
  await settlement.getByRole("button", { name: "Apply return & close record", exact: true }).click();
  await expect(page.getByText("Return applied on this device.", { exact: false })).toBeVisible();
  const applied = await saved();
  assert.deepEqual(applied.inventory.find((row) => row.id === stock.id), stock, "Original acquisition retained");
  const sale = applied.sales.find((row) => row.id === originalSale.id);
  for (const field of Object.keys(originalSale)) assert.deepEqual(sale[field], originalSale[field], `Historical sale ${field}`);
  assert.equal(sale.returnApplications.length, 1);
  assert.equal(applied.manualLifecycles.find((row) => row.type === "shipment").status, "Shipped");
  assert.equal(applied.manualLifecycles.find((row) => row.type === "saleReturn").status, "Closed");
  await capture("seller-returned");

  currentStep = `${theme}/${width}: reports and fresh reader`;
  await go("/business/money/reports");
  await manual().getByLabel("Channel / booth").selectOption("Synthetic acceptance booth");
  const [download] = await Promise.all([page.waitForEvent("download"), manual().getByRole("button", { name: "Download statement CSV", exact: true }).click()]);
  const csv = fs.readFileSync(await download.path(), "utf8");
  assert.match(csv, /"50\.00","10\.00","40\.00","10\.00"/, "Report shows original gross, current net, manual refund, current profit once");
  fs.writeFileSync(path.join(output, `seller-statement-${theme}-${width}.csv`), csv);
  await capture("seller-report");
  const fresh = await context.newPage();
  await fresh.goto(exactRecordUrl); await expect(fresh.locator(".ops-record-detail")).toContainText(collector.id);
  const raw = await fresh.evaluate((key) => localStorage.getItem(key), key);
  assert.deepEqual(JSON.parse(raw), applied, "Independent new page sees all fulfilled saved records and no duplicated application");
  await fresh.close();
  await page.reload(); await manual().getByLabel("Channel / booth").waitFor();
  assert.deepEqual(await saved(), applied, "Reload and reporting perform no extra writes");
  assert.deepEqual(errors, [], "No unhandled application errors");
  await denial(context, `unauthenticated-denial-${theme}-${width}`);
  results.push({ theme, width, passed: true, source: "empty local storage plus actual UI saves", collectorId: collector.id, inventoryId: stock.id, saleId: sale.id, savedStateSha256: sha(raw), blockedRequests: blocked, checks: ["create collector record", "reload and search with Back", "binder exact unit assignment", "wishlist exact match without duplicate stock", "private record stable URL and Back", "manual resale intake and storage", "complete sale with exact cost", "manual shipment", "receipt and inspection", "zero-write cancelled review", "keyboard-confirmed manual refund and restock", "original acquisition/sale preserved", "report CSV", "independent fresh reader", "unauthenticated private-search denial"] });
  await context.close();
}

async function productionSmoke(browser, theme, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
  const blocked = await isolate(context, theme);
  const page = await context.newPage(); lastPage = page;
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  const assets = [];
  page.on("response", (response) => { if (new URL(response.url()).origin === base.origin && /\/assets\/.*\.(js|css)(?:\?|$)/.test(response.url())) assets.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  currentStep = `production/${theme}/${width}: built login and denial`;
  await page.goto(base.href);
  await expect(page.locator("body")).toContainText(/Code 3 TCG/);
  await expect(page.locator("body")).toContainText(/Log In|Log in|Sign in|Sign In/);
  assert.equal(await page.locator('script[src*="/@vite/client"]').count(), 0, "Production smoke must not use Vite dev server");
  assert.ok(assets.some((asset) => asset.path.endsWith(".js")), "Built JS asset loaded");
  assert.ok(assets.every((asset) => asset.status === 200), "Built assets load successfully");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.screenshot({ path: path.join(output, `production-login-${theme}-${width}.png`), fullPage: true });
  await denial(context, `production-denial-${theme}-${width}`, "&betaLocalMode=true");
  assert.deepEqual(errors, []);
  results.push({ theme, width, passed: true, assets, blockedRequests: blocked, checks: ["built login renders", "built assets load", "mobile overflow", "owner query spoof remains denied"], limits: "No authenticated hosted/provider or owner mutation proof" });
  await context.close();
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) {
      if (mode === "production-smoke") await productionSmoke(browser, theme, width);
      else await journey(browser, theme, width);
    }
  } catch (error) {
    if (lastPage && !lastPage.isClosed()) {
      await lastPage.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
      fs.writeFileSync(path.join(output, "failure.txt"), await lastPage.locator("body").innerText());
      const localState = await lastPage.evaluate((key) => localStorage.getItem(key), key).catch(() => null);
      if (localState) fs.writeFileSync(path.join(output, "failure-synthetic-state.json"), localState);
    }
    throw error;
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ mode, appUrl: base.href, generatedAt: new Date().toISOString(), passed: results.length, results }, null, 2));
  console.log(`Private beta ${mode}: ${results.length}/4 contexts passed.`);
}
main().catch((error) => { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, "failure.json"), JSON.stringify({ mode, step: currentStep, completed: results, error: error.stack }, null, 2)); console.error(currentStep, error); process.exitCode = 1; });
