import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { TEST_BUCKETS } from "./lib/hostedDeletionGuard.mjs";
import { browserEnvironment, buildReceiptComponentFixtureHtml, seedBrowserPreservationRecord } from "./lib/hostedDeletionBrowserAcceptance.mjs";

// Execute the real in-memory component bundle in a fresh browser. Only the
// authored fixture document is served; every possible network request is
// aborted. No accounts, credentials, provider replies, images or app modules
// are substituted, and no browser state, traces or screenshots are saved.
const require = createRequire(import.meta.url);
const { chromium, expect } = require("@playwright/test");
const providerOrigin = "https://abcdefghijklmnopqrst.supabase.co";
const fixtureUrl = "https://code3-component.invalid/__synthetic_component.html";
const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const runId = "11111111-1111-4111-8111-111111111111";
const attachments = TEST_BUCKETS.map(bucket => {
  const path = `users/${ownerId}/code3-delete-${runId}/${bucket}.png`;
  return { bucket, path, reference: `${providerOrigin}/storage/v1/object/public/${bucket}/${path}` };
});
const html = await buildReceiptComponentFixtureHtml({ providerOrigin, publicAnonKey: "public-synthetic-anon-key", attachments });
const browser = await chromium.launch({ headless: true, env: browserEnvironment() });
let unexpectedRequests = 0, pageErrors = 0;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", acceptDownloads: false });
  await context.routeWebSocket("**/*", socket => { unexpectedRequests++; socket.close(); });
  await context.route("**/*", route => {
    if (route.request().url() === fixtureUrl && route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "text/html", body: html, headers: { "Cache-Control": "no-store" } });
    }
    unexpectedRequests++;
    return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", () => { pageErrors++; });
  await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(() => typeof window.__code3ReceiptQa?.recordBytes === "function")).toBe(true);
  // This mount fails with the default classic JSX transform even though
  // esbuild succeeds and the helper object above is already initialized.
  await expect(page.getByRole("heading", { name: "Synthetic private attachment integration", exact: true })).toBeVisible();
  await expect(page.locator("main > section")).toHaveCount(TEST_BUCKETS.length);
  await expect(page.getByRole("status")).toHaveCount(TEST_BUCKETS.length + 1);
  for (const status of await page.getByRole("status").all()) await expect(status).toContainText("current account");
  await expect(page.locator("img")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Private synthetic receipt link", exact: true })).toHaveCount(0);
  const preserved = await page.evaluate(() => JSON.parse(window.__code3ReceiptQa.recordBytes()));
  assert.deepEqual(preserved, { receiptReferences: attachments.map(file => file.reference), marketPrice: 123.45, quantity: 2 });
  assert.equal(pageErrors, 0, "Actual components must mount without any runtime error");
  assert.equal(unexpectedRequests, 0, "Signed-out components must not contact any network destination");
  await context.close();

  // Reproduce the deployed sequence: create the first tab, install the actual
  // initializer, then open another tab. The latter starts at opaque about:blank
  // before navigation, where an unscoped localStorage access throws.
  const tabContext = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
  const unrelatedUrl = "https://code3-unrelated.invalid/__synthetic_initializer.html";
  tabContext.on("page", current => current.on("pageerror", () => { pageErrors++; }));
  await tabContext.routeWebSocket("**/*", socket => { unexpectedRequests++; socket.close(); });
  await tabContext.route("**/*", route => {
    if ([fixtureUrl, unrelatedUrl].includes(route.request().url()) && route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Synthetic initializer test</title><p>Ready</p>" });
    }
    unexpectedRequests++;
    return route.abort();
  });
  const first = await tabContext.newPage();
  const key = "code3-https-acceptance-preserve";
  const original = JSON.stringify(preserved);
  await tabContext.addInitScript(seedBrowserPreservationRecord, { appOrigin: new URL(fixtureUrl).origin, key, value: original });
  await first.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
  assert.equal(await first.evaluate(storageKey => localStorage.getItem(storageKey), key), original);
  const existing = JSON.stringify({ ...preserved, quantity: 3 });
  await first.evaluate(({ storageKey, value }) => localStorage.setItem(storageKey, value), { storageKey: key, value: existing });
  const second = await tabContext.newPage();
  assert.equal(await second.evaluate(() => location.href), "about:blank");
  assert.equal(pageErrors, 0, "The actual initializer must not throw on the second tab's opaque initial document");
  await second.goto(unrelatedUrl, { waitUntil: "domcontentloaded" });
  assert.equal(await second.evaluate(storageKey => localStorage.getItem(storageKey), key), null, "Unrelated origins must receive no seed or saved references");
  await second.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
  assert.equal(await second.evaluate(storageKey => localStorage.getItem(storageKey), key), existing, "The second tab must preserve the existing app-origin copy");
  assert.equal(await first.evaluate(storageKey => localStorage.getItem(storageKey), key), existing);
  assert.equal(pageErrors, 0, "Both tabs must finish with no runtime errors; no SecurityError is suppressed");
  assert.equal(unexpectedRequests, 0, "The initializer regression must perform zero network requests");
  await tabContext.close();
  console.log("PASS actual attachment component mount and two-tab exact-origin initializer; original references/prices preserved, unrelated origins untouched, zero network requests or runtime errors.");
} finally {
  await browser.close();
}
