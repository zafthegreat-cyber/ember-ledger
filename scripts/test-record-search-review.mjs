import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { rehearseLocalMigration } from "../src/features/persistence/migrationRehearsal.js";
import { CANONICAL_DOMAINS } from "../src/features/persistence/migrationSourceRegistry.js";
import { createEmptyFlipScoutState, FLIP_SCOUT_STORAGE_KEY } from "../src/features/flipScout/constants.js";
import { hashCanonicalJson } from "../src/features/backup/canonicalJson.js";

const recordId = "a9bf211e-a261-4d11-8db1-baf013ab459f";
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
const output = fileURLToPath(new URL("../artifacts/qa/next-ten/record-search-review/", import.meta.url));
const emptyDomains = () => Object.fromEntries(Object.values(CANONICAL_DOMAINS).map((domain) => [domain, []]));
const remote = () => ({ status: "AVAILABLE", included: true, coverageStatus: "COMPLETE", recordCount: 0, truncatedDomains: [], domains: emptyDomains() });
const localData = (amount, title = "Synthetic saved deal") => JSON.stringify({ ...createEmptyFlipScoutState(), deals: [{ id: recordId, title, providerId: "ebay", externalListingId: "synthetic-review", listingUrl: "https://example.test/item", status: "Needs Review", askingPrice: amount, currency: "USD", recordVersion: 1 }] });
const first = localData(9.99), changed = localData(12.34);

function sourceFixture(read) {
  let reads = 0;
  const storage = { getItem(key) { return key === FLIP_SCOUT_STORAGE_KEY ? read(++reads) : null; }, setItem() { throw new Error("Saved-data writes are prohibited in this fixture."); }, removeItem() { throw new Error("Saved-data writes are prohibited in this fixture."); } };
  return { localStorage: storage, sessionStorage: { getItem: () => null }, remoteAdapter: { inspect: async () => remote() } };
}

const domainChecks = [];
const stable = await rehearseLocalMigration(sourceFixture(() => first));
assert.equal(stable.status, "REHEARSED_IN_MEMORY"); assert.equal(stable.rollbackVerified, true);
assert.equal(stable.after.amountMinorByDomainAndCurrency["DEAL:USD"], "999"); assert.equal(stable.activationAllowed, false); assert.equal(stable.writesPerformed, 0);
domainChecks.push("stable verified source remains a zero-write in-memory rehearsal");
await assert.rejects(rehearseLocalMigration(sourceFixture((read) => read === 2 ? changed : first)), /changed while the backup was created/);
domainChecks.push("A -> B during backup -> A is rejected against actual backup section data");
let current = first;
const duringInspection = sourceFixture(() => current);
duringInspection.remoteAdapter.inspect = async () => { current = changed; return remote(); };
await assert.rejects(rehearseLocalMigration(duringInspection), /source changed during rehearsal/i);
domainChecks.push("source changes during remote inspection are rejected");
current = first;
await assert.rejects(rehearseLocalMigration(sourceFixture((read) => {
  const result = current;
  // Initial capture, backup capture, immediate binding check, then pre-hash check.
  if (read === 4) queueMicrotask(() => { current = changed; });
  return result;
})), /source changed during rehearsal/i);
domainChecks.push("source changes during awaited candidate/rollback hashes are rejected at final return");
const blocked = sourceFixture(() => first); delete blocked.remoteAdapter;
assert.equal((await rehearseLocalMigration(blocked)).status, "BLOCKED");
domainChecks.push("unavailable canonical coverage stays blocked without activating persistence");

async function serverExport(title) {
  const domains = emptyDomains();
  domains.DEAL = [{ id: recordId, domain: "DEAL", status: "NEW", metadata: { title }, recordVersion: 1, archivedAt: null }];
  return { format: "code-3-server-export", formatVersion: 1, createdAt: "2026-09-16T12:00:00Z", coverageStatus: "COMPLETE", coverageExplanation: "Synthetic complete canonical snapshot", truncatedDomains: [], domains, recordCount: 1, sourceHash: await hashCanonicalJson(domains) };
}

async function bootstrap(page, theme, identityKey = "a".repeat(64)) {
  await page.evaluate(async ({ theme, identityKey, localKey, data }) => {
    const main = await (await fetch("/src/main.jsx")).text();
    const imports = [...main.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
    const dependency = (name) => imports.find((value) => new URL(value, location.href).pathname.endsWith(`/${name}`));
    const react = await import(dependency("react.js")), React = react.default || react;
    const dom = await import(dependency("react-dom_client.js")), { createRoot } = dom.default || dom;
    const runtime = (await import("/@react-refresh")).default;
    runtime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;
    await import("/src/index.css"); await import("/src/App.css");
    const { default: RecordSearchPanel } = await import("/src/features/recordSearch/RecordSearchPanel.jsx");
    localStorage.setItem(localKey, data);
    const getItem = Storage.prototype.getItem;
    window.privateReads = 0;
    Storage.prototype.getItem = function (key) { window.privateReads++; return getItem.call(this, key); };
    const root = createRoot(document.getElementById("fixture"));
    window.mountSearch = (key, authorized = true) => root.render(React.createElement(React.StrictMode, null,
      React.createElement("main", { className: "app", "data-theme": theme, style: { padding: "20px", background: "var(--app-background)", color: "var(--text-primary)", minHeight: "100vh" } },
        React.createElement(RecordSearchPanel, { fullPage: true, query: "synthetic", session: { status: authorized ? "authorized" : "sign_in_required", ownerAuthorized: authorized, identityKey: key, provider: "supabase", displayIdentity: "o***@example.test", localDevelopment: true } }))));
    window.mountSearch(identityKey);
  }, { theme, identityKey, localKey: FLIP_SCOUT_STORAGE_KEY, data: first });
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch(); const cases = [];
try {
  for (const theme of ["light", "dark"]) for (const width of [360, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const pending = []; const errors = [];
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/code3/export") { pending.push(route); return; }
      if (url.pathname.startsWith("/api/code3/private-files/")) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "private_files_not_active", message: "Private attachment storage is not active." } }) });
      if (url.origin !== base.origin || route.request().method() !== "GET") return route.abort();
      if (url.pathname === "/owner-center/records") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="fixture"></div></body></html>' });
      return route.continue();
    });
    const page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/owner-center/records?recordQ=synthetic&betaLocalMode=true", base).href);
    await bootstrap(page, theme, "");
    await page.getByRole("alert").filter({ hasText: "Owner identity could not be verified" }).waitFor();
    assert.equal(await page.evaluate(() => window.privateReads), 0);
    assert.equal(pending.length, 0);
    await page.evaluate(() => window.mountSearch(["a".repeat(64)]));
    assert.equal(await page.getByRole("alert").count(), 1);
    assert.equal(await page.evaluate(() => window.privateReads), 0);
    await page.evaluate(() => window.mountSearch("a".repeat(64)));
    await page.getByRole("link", { name: /Synthetic saved deal/ }).waitFor();
    const detailUrl = await page.getByRole("link", { name: /Synthetic saved deal/ }).getAttribute("href");
    const popupEvent = page.waitForEvent("popup");
    await page.evaluate((url) => window.open(url, "_blank"), detailUrl);
    const popup = await popupEvent; popup.on("pageerror", (error) => errors.push(error.message));
    await popup.waitForLoadState("domcontentloaded"); await bootstrap(popup, theme);
    await popup.getByRole("heading", { name: "Synthetic saved deal", exact: true }).waitFor();
    assert.equal(await popup.evaluate(() => history.length), 1);
    assert.equal(new URL(await popup.evaluate(() => document.referrer)).pathname, "/owner-center/records");
    await popup.getByRole("button", { name: "Back", exact: true }).click();
    await popup.waitForURL((url) => url.pathname === "/owner-center/records" && !url.searchParams.has("record"));
    assert.equal(new URL(popup.url()).searchParams.get("recordQ"), "synthetic");
    assert.equal(new URL(popup.url()).searchParams.get("betaLocalMode"), "true");
    await popup.close();

    await page.goto(new URL(`/owner-center/records?recordQ=synthetic&source=canonical&collection=DEAL&record=${recordId}&betaLocalMode=true`, base).href);
    await bootstrap(page, theme);
    await page.evaluate(() => {
      window.falseUnavailableMessages = [];
      new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node.textContent?.includes("This exact record is unavailable")) window.falseUnavailableMessages.push(node.textContent);
        }
      }).observe(document.getElementById("fixture"), { childList: true, subtree: true });
    });
    await page.getByRole("status").filter({ hasText: "Loading this record from the canonical server" }).waitFor();
    assert.equal(await page.getByRole("alert").filter({ hasText: "This exact record is unavailable" }).count(), 0);
    assert.ok(pending.length > 0);
    const priorRequests = pending.splice(0);
    await page.evaluate(() => window.mountSearch("b".repeat(64)));
    await page.waitForFunction(() => document.querySelector(".record-search")?.textContent.includes("Loading this record from the canonical server"));
    // Fulfill responses from the old identity after the identity changed.
    for (const route of priorRequests) await route.fulfill({ contentType: "application/json", body: JSON.stringify(await serverExport("Synthetic previous owner secret")) }).catch(() => undefined);
    await page.waitForFunction(() => document.querySelector(".record-search")?.textContent.includes("Loading this record from the canonical server"));
    assert.equal(await page.getByText("Synthetic previous owner secret", { exact: true }).count(), 0);
    await expect.poll(() => pending.length).toBeGreaterThan(0);
    for (const route of pending.splice(0)) await route.fulfill({ contentType: "application/json", body: JSON.stringify(await serverExport("Synthetic current owner record")) }).catch(() => undefined);
    await page.getByRole("heading", { name: "Synthetic current owner record", exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.falseUnavailableMessages), []);
    await page.screenshot({ path: `${output}/record-search-${theme}-${width}.png`, fullPage: true });
    assert.equal(await page.getByText("Synthetic previous owner secret", { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    cases.push({ theme, width, missingIdentityZeroPrivateReads: true, malformedIdentityRejected: true, maskedNameCollisionSeparated: true, newTabBackPreservesQuery: true, canonicalLoadingHonest: true, lateIdentityResponseDiscarded: true });
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(`${output}/results.json`, JSON.stringify({ domainChecks, browserCases: cases }, null, 2));
console.log(`PASS ${domainChecks.length} migration binding checks and ${cases.length} actual Record Search viewport/theme contexts.`);
