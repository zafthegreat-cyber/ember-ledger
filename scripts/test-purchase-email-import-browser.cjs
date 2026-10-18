const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5243").origin;
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/purchase-email-import");
const fixtureFile = path.join(output, "fixture.html");
const key = "code3.purchase-receiving.v1";
const mailboxAddress = "synthetic-receipts@aol.com";
const syntheticPassword = "synthetic-app-password-for-tests";
const protectedData = JSON.stringify({ items: [{ id: "qa-existing-item", title: "Existing collector box", quantity: 3 }], sales: [{ id: "qa-existing-sale", total: 42 }], prices: [{ id: "qa-existing-price", market: 54.99 }] });
const candidates = [{ sourceId: `email:${"a".repeat(64)}`, provider: "aol", accountReference: `mailbox:${"b".repeat(64)}`, retailerId: "target", retailerLabel: "Target", orderId: "TCG-QA-2026-123", receivedAt: "2026-10-17T12:00:00.000Z", orderedAt: "2026-10-16", currency: "USD", totalMinorUnits: 2599, items: [{ description: "Collector sleeves", quantity: 2, unitPriceMinorUnits: 1199, lineTotalMinorUnits: 2398 }], warnings: ["Review this receipt before saving a purchase."] }];
const preview = { ok: true, format: "code3.purchase-email-preview.v1", candidates, scannedMessages: 12, skippedMessages: 11, truncated: false, days: 30 };
const status = { ok: true, available: true, providers: ["aol", "gmail", "yahoo"], mode: "ONE_TIME_READ", credentialStored: false, mailboxReadOnly: true };
const cases = [320, 390, 1440].flatMap(width => ["light", "dark"].map(theme => ({ width, height: width === 320 ? 720 : 900, theme })));
let step = "initialization";

function writeFixture() {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(fixtureFile, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic email purchase verification</title></head><body><div id="root"></div><script type="module">
import React from "react"; import {createRoot} from "react-dom/client";
import "/src/index.css"; import "/src/App.css";
import PurchaseReceivingPage from "/src/features/purchaseReceiving/PurchaseReceivingPage.jsx";
const theme = new URLSearchParams(location.search).get("theme") || "light";
document.documentElement.dataset.theme = theme;
const root = createRoot(document.getElementById("root"));
window.qaRender = (status = "authorized", identityKey = "qa-owner-initial") => root.render(React.createElement("div", {className:"app app-command-shell", "data-theme":theme, style:{padding:"16px", minHeight:"100dvh"}}, React.createElement(PurchaseReceivingPage, {session:{status, authenticated:status==="authorized", ownerAuthorized:status==="authorized", provider:"synthetic-browser-test", userId:identityKey, identityKey}})));
window.qaUnmount = () => root.render(null);
window.qaRender(new URLSearchParams(location.search).get("status") || "authorized");
</script></body></html>`, "utf8");
}

async function seedState() {
  const { createPurchaseReceivingService } = await import(pathToFileURL(path.resolve("src/features/purchaseReceiving/service.js")).href);
  const { createMemoryPurchaseReceivingStorage } = await import(pathToFileURL(path.resolve("src/features/purchaseReceiving/repository.js")).href);
  const { buildEmailPurchaseDraft } = await import(pathToFileURL(path.resolve("src/features/purchaseReceiving/emailImport.js")).href);
  const storage = createMemoryPurchaseReceivingStorage(); let sequence = 0;
  const service = createPurchaseReceivingService({ storage, now: () => "2026-10-15T12:00:00.000Z", idFactory: prefix => `${prefix}:qa-original-${++sequence}`, isOwnerAuthorized: () => true });
  const receipt = { ...candidates[0], sourceId: `email:${"c".repeat(64)}`, accountReference: `mailbox:${"d".repeat(64)}`, orderId: "TCG-ORIGINAL-456" };
  await service.createDraft(buildEmailPurchaseDraft({ receipt, retailerLabel: "Target", externalOrderId: receipt.orderId, purchasedAt: "2026-10-14", currency: "USD", total: "25.99", tax: "2.01", shipping: "", fees: "", discount: "", items: [{ title: "Existing sleeves", quantity: "2", unitPrice: "11.99" }] }));
  return storage.getItem(key);
}

const fixtureUrl = (theme, statusValue = "authorized") => `${base}/${path.relative(process.cwd(), fixtureFile).replaceAll(path.sep, "/")}?theme=${theme}&status=${statusValue}`;
const importer = page => page.getByTestId("purchase-email-import");
const state = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const rawState = page => page.evaluate(key => localStorage.getItem(key), key);

async function contextFor(browser, testCase, initialState) {
  const context = await browser.newContext({ viewport: { width: testCase.width, height: testCase.height }, colorScheme: testCase.theme, timezoneId: "America/New_York", reducedMotion: "reduce", serviceWorkers: "block" });
  const external = []; const apiRequests = []; const errors = []; const modes = { status: "normal", preview: "normal", pending: null };
  await context.route("**/*", async route => {
    const req = route.request(); const url = new URL(req.url());
    if (url.origin !== base) { external.push(`${req.method()} ${url.origin}${url.pathname}`); return route.abort(); }
    // This isolated fixture has no real session. Stub only its credential getter;
    // the production API client, component, purchase mapper/service/storage are real.
    if (url.pathname === "/src/services/ownerSession.js") return route.fulfill({ contentType: "text/javascript", body: `export const OWNER_SESSION_STATES={LOADING:"loading",SIGN_IN_REQUIRED:"sign_in_required",OWNER_ACCESS_REQUIRED:"owner_access_required",AUTHORIZED:"authorized",UNAVAILABLE:"unavailable"}; export async function getOwnerRequestHeaders(){return window.__qaNoHeaders ? {} : {Authorization:"Bearer synthetic-browser-qa"};} export function isLoopbackHostname(){return true;} export function isLocalDevelopmentIdentityEnabled(){return true;} export async function resolveOwnerSession(){return {status:"authorized",authenticated:true,ownerAuthorized:true,provider:"synthetic-browser-test",userId:"qa-owner",identityKey:"qa-owner",displayIdentity:"Synthetic owner",localDevelopment:true};}` });
    if (url.pathname.startsWith("/api/account-ops/mailbox-import/")) {
      assert.equal(req.headers().authorization, "Bearer synthetic-browser-qa");
      const isPreview = url.pathname === "/api/account-ops/mailbox-import/preview";
      assert.equal(url.pathname, `/api/account-ops/mailbox-import/${isPreview ? "preview" : "status"}`);
      assert.equal(req.method(), isPreview ? "POST" : "GET");
      apiRequests.push({ type: isPreview ? "preview" : "status", url: `${url.origin}${url.pathname}`, method: req.method() });
      if (isPreview) {
        const data = req.postDataJSON();
        assert.deepEqual(Object.keys(data).sort(), ["provider", "mailboxAddress", "appPassword", "days"].sort());
        assert.equal(data.appPassword, syntheticPassword); assert.equal(data.mailboxAddress, mailboxAddress);
        assert.ok(["aol", "gmail", "yahoo"].includes(data.provider)); assert.ok([7, 30, 90].includes(data.days));
        if (modes.preview === "hold") { modes.pending = route; return; }
        if (modes.preview === "error") return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ ok: false, code: "MAILBOX_UNAVAILABLE", message: `unsafe server detail ${syntheticPassword} ${mailboxAddress}` }) });
        if (modes.preview === "malformed") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...preview, rawEmail: "SHOULD NOT BE DISPLAYED" }) });
        return route.fulfill({ contentType: "application/json", body: JSON.stringify(preview) });
      }
      if (modes.status === "unavailable") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...status, available: false }) });
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(status) });
    }
    assert.equal(req.method(), "GET", "No other network writes");
    if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: '{"configured":false}' });
    return route.continue();
  });
  await context.addInitScript(({ initialState, protectedData, key, theme, forceLuhnUuid }) => {
    if (!localStorage.getItem("__qa_email_seeded")) {
      localStorage.setItem("__qa_email_seeded", "true"); localStorage.setItem(key, initialState);
      localStorage.setItem("et-tcg-beta-data", protectedData); localStorage.setItem("code3.bot-ops.v1", '{"existing":"synthetic bot data"}'); localStorage.setItem("et-tcg-app-theme", theme);
    }
    window.__qaStorageWrites = []; window.__qaPurchaseReads = 0;
    if (forceLuhnUuid) {
      window.__qaUuidCalls = 0;
      Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: () => `${String(++window.__qaUuidCalls).padStart(8, "0")}-aaaa-4aaa-8411-111111111119` });
    }
    const originalSet = Storage.prototype.setItem; const originalGet = Storage.prototype.getItem;
    Storage.prototype.setItem = function(k, value) { if (window.__qaBlockWrites && k === key) { window.__qaBlockedWrites = (window.__qaBlockedWrites || 0) + 1; throw new Error("Synthetic quota failure"); } window.__qaStorageWrites.push(k); return originalSet.call(this, k, value); };
    Storage.prototype.getItem = function(k) { if (k === key) window.__qaPurchaseReads++; return originalGet.call(this, k); };
  }, { initialState, protectedData, key, theme: testCase.theme, forceLuhnUuid: testCase.forceLuhnUuid || false });
  const page = await context.newPage(); page.setDefaultTimeout(12000); page.on("pageerror", error => errors.push(error.message));
  return { context, page, modes, external, apiRequests, errors };
}

async function openImport(page) {
  await page.getByRole("button", { name: "Pull purchase emails", exact: true }).click();
  await expect(importer(page).getByRole("form", { name: "Pull purchase emails", exact: true })).toBeVisible();
}
async function enterAndPull(page, provider = "aol", days = 30) {
  const form = importer(page).getByRole("form", { name: "Pull purchase emails", exact: true });
  await form.getByRole("combobox", { name: "Email provider", exact: true }).selectOption(provider);
  await form.getByRole("combobox", { name: "Look back", exact: true }).selectOption(String(days));
  await form.getByLabel("Mailbox email address", { exact: true }).fill(mailboxAddress);
  await form.getByLabel("App password", { exact: true }).fill(syntheticPassword);
  const passwordInput = await form.getByLabel("App password", { exact: true }).elementHandle();
  await form.getByRole("button", { name: "Pull purchase emails", exact: true }).click();
  assert.equal(await passwordInput.evaluate(node => node.value), "", "Password cleared even if the setup form was removed after a fast response");
}
async function openReview(page) {
  const row = importer(page).locator('.ops-record-browser__row').filter({ hasText: candidates[0].orderId });
  await expect(row).toBeVisible();
  await row.click();
  await importer(page).getByRole("button", { name: "Review receipt", exact: true }).click();
  const form = importer(page).getByRole("form", { name: "Review receipt", exact: true });
  await expect(form.getByRole("heading", { name: "Review receipt", exact: true })).toBeFocused();
  return form;
}
async function reviewed(page) {
  const form = await openReview(page);
  await expect(form.getByLabel("Purchase date", { exact: true })).toHaveValue("2026-10-16");
  await expect(form.getByLabel("Item 1 unit price", { exact: true })).toHaveValue("11.99");
  await expect(form.getByRole("button", { name: "Save purchase draft", exact: true })).toBeDisabled();
  await form.getByLabel("Tax", { exact: true }).fill("2.01");
  await expect(form.getByRole("button", { name: "Save purchase draft", exact: true })).toBeEnabled();
  return form;
}
async function assertLayout(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "No horizontal overflow");
  const undersized = await importer(page).locator("button:visible,input:visible,select:visible").evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { name: node.getAttribute("aria-label") || node.name || node.textContent?.trim(), width: box.width, height: box.height }; }).filter(row => row.width < 43.9 || row.height < 43.9));
  assert.deepEqual(undersized, [], "44px touch targets");
}
async function assertPreserved(page, initialState) {
  const current = await state(page); const before = JSON.parse(initialState);
  for (const collection of ["purchaseDrafts", "purchases", "purchaseEvents", "receivingEvents", "activity"]) for (const record of before[collection]) assert.deepEqual(current[collection].find(row => row.id === record.id), record, `Existing ${collection} preserved`);
  assert.equal(await page.evaluate(() => localStorage.getItem("et-tcg-beta-data")), protectedData);
  assert.equal(await page.evaluate(() => localStorage.getItem("code3.bot-ops.v1")), '{"existing":"synthetic bot data"}');
  const saved = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  assert.ok(!saved.includes(syntheticPassword) && !saved.includes(mailboxAddress), "No credentials or mailbox address stored");
  assert.deepEqual(await page.evaluate(() => [...new Set(window.__qaStorageWrites)].filter(k => k !== "code3.purchase-receiving.v1")), [], "No collateral storage writes");
}
async function capture(page, id) { await page.screenshot({ path: path.join(output, `${id}.png`), fullPage: true }); }
async function failure(page, id, error) { await capture(page, `${id}-failure`).catch(() => {}); fs.writeFileSync(path.join(output, `${id}-failure.txt`), `${step}\n${error.stack}\n${await page.locator("body").innerText().catch(() => "")}`); }

async function responsiveCase(browser, initialState, testCase) {
  const env = await contextFor(browser, testCase, initialState); const { page, context, modes, external, errors, apiRequests } = env; const id = `${testCase.width}-${testCase.theme}${testCase.forceLuhnUuid ? "-luhn-uuid" : ""}`;
  try {
    step = `${id}: connect`; await page.goto(fixtureUrl(testCase.theme));
    await page.getByRole('searchbox', { name: 'Search drafts' }).fill('no matching original order');
    await expect(page.locator('.ops-record-browser__row')).toHaveCount(0);
    await openImport(page); await assertLayout(page);
    const form = importer(page).getByRole("form", { name: "Pull purchase emails", exact: true });
    assert.deepEqual(await form.getByRole("combobox", { name: "Email provider" }).locator("option").evaluateAll(nodes => nodes.map(node => node.value)), ["aol", "gmail", "yahoo"]);
    await form.getByLabel("App password", { exact: true }).fill(syntheticPassword);
    await form.getByRole("combobox", { name: "Email provider" }).selectOption("gmail");
    await expect(form.getByLabel("App password", { exact: true })).toHaveValue("");
    await form.getByRole("combobox", { name: "Email provider" }).selectOption("aol");
    await form.getByRole("combobox", { name: "Email provider" }).focus(); await page.keyboard.press("Tab"); await expect(form.getByRole("combobox", { name: "Look back" })).toBeFocused();
    const focus = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { outline: s.outlineStyle, shadow: s.boxShadow, width: s.outlineWidth }; });
    assert.ok(focus.outline !== "none" && focus.width !== "0px" || focus.shadow !== "none", "Visible keyboard focus");
    await capture(page, `${id}-connect`);
    modes.preview = "hold"; await enterAndPull(page); await expect.poll(() => Boolean(modes.pending)).toBe(true);
    assert.equal(await rawState(page), initialState, "Pull does not save records"); await assertPreserved(page, initialState);
    await modes.pending.fulfill({ contentType: "application/json", body: JSON.stringify(preview) }); modes.pending = null; modes.preview = "normal";
    await expect(importer(page).locator('.ops-record-browser__row')).toBeVisible();
    await expect(form).toHaveCount(0);
    await expect(importer(page).getByRole("heading", { name: "Review receipts", exact: true })).toBeFocused();
    await expect(importer(page)).toContainText("Oct 16, 2026"); await assertLayout(page); await capture(page, `${id}-receipts`);
    step = `${id}: review`; const review = await reviewed(page); await assertLayout(page); await capture(page, `${id}-review`);
    await review.getByLabel("Item 1 name", { exact: true }).fill("Collector sleeves reviewed");
    await review.getByRole("button", { name: "Back to receipts", exact: true }).click(); await openReview(page); await expect(importer(page).getByLabel("Item 1 name", { exact: true })).toHaveValue("Collector sleeves reviewed");
    await importer(page).getByRole("button", { name: "Save purchase draft", exact: true }).click();
    await importer(page).locator('.ops-record-browser__row').filter({ hasText: candidates[0].orderId }).click();
    await expect(importer(page).getByRole("button", { name: "Open purchase draft", exact: true })).toBeVisible();
    const drafted = await state(page); assert.equal(drafted.purchaseDrafts.length, 2); assert.equal(drafted.purchases.length, 0); assert.equal(drafted.receivingEvents.length, 0);
    const newDraft = drafted.purchaseDrafts.find(row => row.externalOrderId === candidates[0].orderId); assert.equal(newDraft.money.grandTotal.minorUnits, 2599); assert.equal(newDraft.lineItems[0].title, "Collector sleeves reviewed");
    await assertPreserved(page, initialState);
    await importer(page).getByRole("button", { name: "Open purchase draft", exact: true }).click(); await expect(importer(page)).toHaveCount(0);
    const draftCard = page.locator(`[id="purchase-draft-${newDraft.id}"]`); await expect(draftCard).toBeFocused();
    await expect(draftCard).toContainText("Oct 16, 2026");
    await expect(draftCard).toContainText("Email receipt");
    await draftCard.getByRole("button", { name: "Confirm Purchase", exact: true }).click();
    await expect.poll(async () => (await state(page)).purchases.length).toBe(1);
    if (testCase.forceLuhnUuid) assert.ok(await page.evaluate(() => window.__qaUuidCalls > 0), "The reproducing UUID source was exercised");
    await page.locator('[data-purchase-section="purchases"]').click();
    await page.getByRole("region", { name: "Confirmed Purchases", exact: true }).locator('.ops-record-browser__row').filter({ hasText: candidates[0].orderId }).click();
    await expect(page.getByRole("region", { name: "Confirmed Purchases" })).toContainText(candidates[0].orderId); await capture(page, `${id}-confirmed`);
    step = `${id}: reload and dedupe`; await page.reload(); await openImport(page); await enterAndPull(page);
    await importer(page).locator('.ops-record-browser__row').filter({ hasText: candidates[0].orderId }).click();
    await expect(importer(page)).toContainText("Purchase already saved");
    await expect(importer(page).getByRole("button", { name: "Review receipt", exact: true })).toHaveCount(0);
    assert.equal((await state(page)).purchaseDrafts.length, 2); assert.equal((await state(page)).purchases.length, 1); assert.equal((await state(page)).receivingEvents.length, 0);
    await assertPreserved(page, initialState); assert.deepEqual(external, []); assert.deepEqual(errors, []);
    console.log(`PASS ${id}: review, exact totals, draft, explicit confirmation, reload/dedupe, password clearing, keyboard/touch/overflow, existing data.`);
    return { ...testCase, flow: "pull-review-draft-confirm-reload-dedupe", passwordClearedBeforeResponse: true, dataPreserved: true, apiRequests, externalRequests: external, browserErrors: errors };
  } catch (error) { await failure(page, id, error); throw error; } finally { await context.close(); }
}

async function failureCases(browser, initialState) {
  const env = await contextFor(browser, { width: 390, height: 844, theme: "dark" }, initialState); const { page, context, modes, errors, external, apiRequests } = env;
  try {
    step = "denied sessions";
    for (const denied of ["loading", "sign_in_required", "owner_access_required", "unavailable"]) {
      await page.goto(fixtureUrl("dark", denied)); await expect(page.locator('[data-page="purchase-receiving"]')).toBeVisible();
      await expect(page.getByRole("button", { name: "Pull purchase emails", exact: true })).toHaveCount(0); assert.equal(await page.evaluate(() => window.__qaPurchaseReads), 0); assert.equal(apiRequests.length, 0);
    }
    await page.evaluate(() => { window.__qaNoHeaders = true; window.qaRender(); });
    await page.getByRole("button", { name: "Pull purchase emails", exact: true }).click();
    await expect(importer(page).getByRole("alert")).toContainText("verified signed-in owner"); assert.equal(apiRequests.length, 0);
    await importer(page).getByRole("button", { name: "Close purchase email import", exact: true }).click(); await page.evaluate(() => { window.__qaNoHeaders = false; });
    modes.status = "unavailable"; await page.getByRole("button", { name: "Pull purchase emails", exact: true }).click();
    await expect(importer(page).getByRole("alert")).toContainText("not available"); await expect(importer(page).getByLabel("App password", { exact: true })).toHaveCount(0);
    modes.status = "normal"; await importer(page).getByRole("button", { name: "Check again", exact: true }).click(); await expect(importer(page).getByLabel("App password", { exact: true })).toBeVisible();
    for (const mode of ["error", "malformed"]) {
      step = `safe failure: ${mode}`; modes.preview = mode; await enterAndPull(page);
      await expect(importer(page).getByRole("alert")).toBeVisible(); assert.equal(await rawState(page), initialState); await assertPreserved(page, initialState);
      assert.doesNotMatch(await importer(page).innerText(), /unsafe server detail|synthetic-app-password-for-tests|SHOULD NOT BE DISPLAYED/);
    }
    step = "unmount clears password reference";
    await importer(page).getByLabel("App password", { exact: true }).fill(syntheticPassword);
    await page.evaluate(() => { window.__qaOldPassword = document.querySelector('input[type="password"]'); });
    await importer(page).getByRole("button", { name: "Close purchase email import", exact: true }).click();
    assert.equal(await page.evaluate(() => window.__qaOldPassword.value), ""); await openImport(page); await expect(importer(page).getByLabel("App password", { exact: true })).toHaveValue("");
    step = "identity change aborts in-flight pull"; modes.preview = "hold"; await enterAndPull(page); await expect.poll(() => Boolean(modes.pending)).toBe(true);
    await page.evaluate(() => window.qaRender("authorized", "qa-second-owner")); await expect(importer(page)).toHaveCount(0);
    await modes.pending.fulfill({ contentType: "application/json", body: JSON.stringify(preview) }).catch(() => {}); modes.pending = null;
    await openImport(page); await expect(importer(page).getByRole("region", { name: "Review receipts" })).toHaveCount(0); assert.equal(await rawState(page), initialState);
    step = "storage failure preserves receipt review"; modes.preview = "normal"; await enterAndPull(page); const review = await reviewed(page);
    await page.evaluate(() => { window.__qaBlockWrites = true; }); await review.getByRole("button", { name: "Save purchase draft", exact: true }).click();
    await expect(review.getByRole("alert")).toBeVisible(); assert.equal(await rawState(page), initialState); assert.ok(await page.evaluate(() => window.__qaBlockedWrites > 0));
    await expect(review.getByLabel("Tax", { exact: true })).toHaveValue("2.01"); await page.evaluate(() => { window.__qaBlockWrites = false; });
    step = "queued save cancelled on owner change";
    await page.evaluate(() => { window.__qaLockHeld = false; window.__qaLockPromise = navigator.locks.request("code3:owner-confirmed-purchase-inventory:v1", () => new Promise(resolve => { window.__qaReleaseLock = resolve; window.__qaLockHeld = true; })); });
    await page.waitForFunction(() => window.__qaLockHeld); await review.getByRole("button", { name: "Save purchase draft", exact: true }).click();
    await expect(importer(page).getByLabel('Search receipts', { exact: true })).toBeDisabled();
    await expect(importer(page).getByLabel('Receipts retailer', { exact: true })).toBeDisabled();
    await expect(importer(page).getByLabel('Receipts status', { exact: true })).toBeDisabled();
    await expect(importer(page).getByRole('button', { name: 'Back to receipts', exact: true }).first()).toBeDisabled();
    await expect.poll(async () => page.evaluate(async () => (await navigator.locks.query()).pending.length)).toBeGreaterThan(0);
    await page.evaluate(() => window.qaRender("owner_access_required")); await expect(importer(page)).toHaveCount(0);
    await page.evaluate(async () => { window.__qaReleaseLock(); await window.__qaLockPromise; });
    await expect.poll(async () => page.evaluate(async () => (await navigator.locks.query()).pending.length)).toBe(0); assert.equal(await rawState(page), initialState);
    await assertPreserved(page, initialState); assert.deepEqual(external, []); assert.deepEqual(errors, []);
    console.log("PASS owner deny, safe errors, password unmount cleanup, in-flight owner change, quota preservation, queued save cancellation.");
    return { ownerDenied: true, safeErrors: true, passwordUnmountCleared: true, identityAbort: true, quotaPreserved: true, queuedOwnerCancelled: true, externalRequests: external, browserErrors: errors };
  } catch (error) { await failure(page, "safety", error); throw error; } finally { await context.close(); }
}

async function actualAppCase(browser, initialState) {
  const testCase = { width: 320, height: 720, theme: "dark" };
  const { context, page, errors, external, apiRequests } = await contextFor(browser, testCase, initialState);
  const appData = { userType: "collector", dashboardPreset: "simple", profile: { userId: "local-beta", email: "synthetic-owner@example.test", displayName: "Synthetic owner", appRole: "owner", app_role: "owner", userRole: "owner", appAccess: "approved" }, subscriptionProfile: { tier: "admin", featureTier: "admin", subscriptionPlan: "admin", appRole: "owner", app_role: "owner", isAdmin: true, lifetimeAccess: true, subscriptionStatus: "active" }, ...JSON.parse(protectedData) };
  await context.addInitScript(data => { if (!localStorage.getItem("__qa_full_app_seeded")) { localStorage.setItem("__qa_full_app_seeded", "true"); localStorage.setItem("et-tcg-beta-data", JSON.stringify(data)); } }, appData);
  try {
    step = "actual App /business/purchases"; await page.goto(`${base}/business/purchases?betaLocalMode=true`);
    const controls = page.getByRole("region", { name: "Admin display controls", exact: true });
    await expect(controls).toBeVisible({ timeout: 45000 }); await controls.getByRole("button", { name: "Admin", exact: true }).click();
    await expect(page.getByTestId("purchase-receiving-page")).toBeVisible();
    const appBaseline = JSON.parse(await page.evaluate(() => localStorage.getItem("et-tcg-beta-data")));
    for (const field of ["items", "sales"]) for (const record of appData[field]) for (const [property, value] of Object.entries(record)) assert.deepEqual(appBaseline[field].find(row => row.id === record.id)[property], value);
    await openImport(page); await assertLayout(page);
    await enterAndPull(page); await reviewed(page); await assertLayout(page);
    await importer(page).getByRole("form", { name: "Review receipt", exact: true }).scrollIntoViewIfNeeded();
    await capture(page, "320-dark-actual-app"); await page.screenshot({ path: path.join(output, "320-dark-actual-app-viewport.png") });
    await importer(page).getByRole("button", { name: "Save purchase draft", exact: true }).click();
    await importer(page).locator('.ops-record-browser__row').filter({ hasText: candidates[0].orderId }).click();
    await expect(importer(page).getByRole("button", { name: "Open purchase draft", exact: true })).toBeVisible();
    assert.equal((await state(page)).purchaseDrafts.length, 2); assert.equal((await state(page)).purchases.length, 0);
    await importer(page).getByRole("button", { name: "Open purchase draft", exact: true }).click(); await expect(importer(page)).toHaveCount(0);
    await page.reload(); await expect(page.getByTestId("purchase-receiving-page")).toBeVisible();
    await expect(page.getByRole("region", { name: "Purchase Drafts", exact: true })).toContainText(candidates[0].orderId);
    const stored = JSON.parse(await page.evaluate(() => localStorage.getItem("et-tcg-beta-data")));
    for (const field of ["items", "sales"]) assert.deepEqual(stored[field], appBaseline[field]);
    assert.equal(await page.evaluate(() => localStorage.getItem("code3.bot-ops.v1")), '{"existing":"synthetic bot data"}');
    assert.ok(!(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).includes(syntheticPassword));
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log("PASS actual App 320 dark: route, global navigation/styles, receipt review, draft, reopen/reload, data preserved.");
    return { actualApp: true, ...testCase, route: "/business/purchases", draftReload: true, existingDataPreserved: true, apiRequests, externalRequests: external, browserErrors: errors };
  } catch (error) { await failure(page, "actual-app", error); throw error; } finally { await context.close(); }
}

(async () => {
  writeFixture(); const initialState = await seedState(); const browser = await chromium.launch({ headless: true }); const results = [];
  try {
    const uuidCase = { width: 390, height: 900, theme: "dark", forceLuhnUuid: true };
    if (!process.argv.includes("--safety-only") && !process.argv.includes("--app-only") && !process.argv.includes("--uuid-only")) for (const testCase of process.argv.includes("--single") ? cases.slice(0, 1) : cases) results.push(await responsiveCase(browser, initialState, testCase));
    if ((!process.argv.includes("--single") && !process.argv.includes("--safety-only") && !process.argv.includes("--app-only")) || process.argv.includes("--uuid-only")) results.push(await responsiveCase(browser, initialState, uuidCase));
    if (!process.argv.includes("--single") && !process.argv.includes("--app-only") && !process.argv.includes("--uuid-only")) results.push(await failureCases(browser, initialState));
    if (!process.argv.includes("--single") && !process.argv.includes("--safety-only") && !process.argv.includes("--uuid-only")) results.push(await actualAppCase(browser, initialState));
    const suffix = process.argv.includes("--single") ? "-single" : process.argv.includes("--safety-only") ? "-safety" : process.argv.includes("--app-only") ? "-app" : process.argv.includes("--uuid-only") ? "-uuid" : "";
    fs.writeFileSync(path.join(output, `results${suffix}.json`), `${JSON.stringify({ generatedAt: new Date().toISOString(), syntheticOnly: true, liveMailboxTested: false, realAccountTested: false, mockedBoundary: "owner session module and mailbox HTTP responses", results }, null, 2)}\n`);
  } finally { await browser.close(); }
})().catch(error => { console.error(`FAILED ${step}`); console.error(error); process.exitCode = 1; });
