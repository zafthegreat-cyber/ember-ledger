const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
const output = process.env.QA_OUTPUT_DIR ? path.resolve(process.env.QA_OUTPUT_DIR) : path.resolve(__dirname, "../artifacts/qa/backup-review-accessibility/migration");

async function fixture(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-US", timezoneId: "America/New_York", ...options });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== base.origin || route.request().method() !== "GET") return route.abort();
    if (url.pathname === "/__qa/migration-review") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div class="app" id="theme"><main id="fixture" style="max-width:1000px;padding:20px;margin:auto"></main></div></body></html>' });
    return route.continue();
  });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(new URL("/__qa/migration-review", base).href);
  await page.evaluate(async () => {
    const main = await (await fetch("/src/main.jsx")).text();
    const imports = [...main.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]);
    const dependency = name => imports.find(value => new URL(value, location.href).pathname.endsWith("/" + name));
    const react = await import(dependency("react.js")), React = react.default || react;
    const dom = await import(dependency("react-dom_client.js")), { createRoot } = dom.default || dom;
    const runtime = (await import("/@react-refresh")).default;
    runtime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;
    window.IS_REACT_ACT_ENVIRONMENT = true;
    const { default: Panel } = await import("/src/features/backup/MigrationReadinessPanel.jsx");
    await import("/src/index.css");
    await import("/src/App.css");
    await import("/src/features/ownerCenter/owner-center.css");
    const writes = [];
    for (const method of ["setItem", "removeItem", "clear"]) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) { writes.push({ method, key: args[0] }); return original.apply(this, args); };
    }
    const button = (host, text) => [...host.querySelectorAll("button")].find(node => node.textContent.trim() === text);
    const click = node => React.act(async () => { if (!node) throw Error("Expected control missing"); node.click(); });
    const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
    const ready = { status: "READY", localRecordCount: 2, remoteStatus: "AVAILABLE", remoteRecordCount: 1, domainsReady: 1, domainsWithWarnings: [], blockers: [], moneyConversions: [], moneyIssues: [], referenceProblems: [], conflicts: [], warnings: [], domains: [], lastPreviewAt: "2026-09-23T12:00:00.000Z", previewHash: "a".repeat(64), plan: { planHash: "b".repeat(64), actions: [{ input: { forbiddenRawRecord: "RAW_RECORD_MUST_NOT_EXPORT" } }] }, writesPerformed: 0 };
    const blocked = { status: "BLOCKED", createdAt: "2026-09-23T13:00:00.000Z", canonicalStatus: "UNAVAILABLE", rollbackVerified: false, writesPerformed: 0, blockers: [], conflicts: [], warnings: [{ code: "REMOTE_UNAVAILABLE", message: "Canonical records have not been inspected." }], exclusions: [{ domain: "SALE", recordId: "synthetic-sale", action: "REQUIRES_DECISION" }], sourceCounts: { "deal-finder": 2 }, sourceSchemas: { "deal-finder": 8 }, backupHash: "c".repeat(64), planHash: "d".repeat(64), activationAllowed: false };
    window.qa = { React, Panel, createRoot, writes, ready, blocked, button, click, deferred };
    window.qa.mount = async (strict, initialProps = {}) => {
      const host = document.createElement("div"); document.querySelector("#fixture").append(host);
      const root = createRoot(host), calls = [];
      const request = kind => options => { const gate = deferred(); calls.push({ kind, options, ...gate }); return gate.promise; };
      let props = { previewRunner: request("preview"), rehearsalRunner: request("rehearsal"), remoteAdapter: { inspect() {} }, ...initialProps }, closed = false;
      const render = async changes => { props = { ...props, ...changes }; await React.act(async () => { const child = React.createElement(Panel, props); root.render(strict ? React.createElement(React.StrictMode, null, child) : child); }); };
      const close = async () => { if (closed) return; closed = true; await React.act(async () => root.unmount()); host.remove(); };
      await render();
      return { host, calls, render, close, settle: (call, result) => React.act(async () => call.resolve(result)), reject: (call, message) => React.act(async () => call.reject(Error(message))), preview: () => click(button(host, "Run migration preview")), rehearse: () => click(button(host, "Rehearse mapped changes and rollback")) };
    };
  });
  return { context, page, errors };
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  try {
    const f = await fixture(browser);
    const lifecycle = await f.page.evaluate(async () => {
      const { React, ready, blocked, mount, button } = window.qa, results = [];
      const check = (name, ok) => { results.push({ name, passed: Boolean(ok) }); if (!ok) throw Error(name); };
      for (const strict of [false, true]) {
        const tag = strict ? "StrictMode" : "normal";
        let p = await mount(strict);
        const previewRegion = () => p.host.querySelector('[aria-label="Migration readiness result"]');
        const rehearsalRegion = () => p.host.querySelector('[aria-label="Migration rehearsal result"]');
        check("Unrun counts do not imply zero checks: " + tag, p.calls.length === 0 && previewRegion().textContent.includes("BlockersNot run") && !button(p.host, "Download migration preview report"));
        const preview = button(p.host, "Run migration preview"), rehearse = button(p.host, "Rehearse mapped changes and rollback");
        await React.act(async () => { preview.click(); preview.click(); rehearse.click(); });
        check("One operation survives same-tick double clicks and cross-operation click: " + tag, p.calls.length === 1 && preview.disabled && rehearse.disabled && p.host.textContent.includes("Checking migration preview…"));
        await p.settle(p.calls[0], ready);
        check("Completed preview displays real zero blockers and timestamp: " + tag, previewRegion().textContent.includes("Blockers0") && previewRegion().textContent.includes("READY") && previewRegion().textContent.includes("9/23/2026"));
        await p.rehearse();
        check("Rehearsal pending keeps separately labelled prior preview: " + tag, previewRegion().textContent.includes("READY") && rehearsalRegion().textContent.includes("Rehearsing in memory"));
        await p.settle(p.calls[1], blocked);
        check("Blocked empty rehearsal exposes unavailable server and real warning: " + tag, rehearsalRegion().textContent.includes("BLOCKED") && rehearsalRegion().textContent.includes("UNAVAILABLE") && rehearsalRegion().textContent.includes("Canonical records have not been inspected.") && previewRegion().textContent.includes("READY"));
        check("Exclusions keep exact affected record and action: " + tag, rehearsalRegion().textContent.includes("synthetic-sale") && rehearsalRegion().textContent.includes("REQUIRES_DECISION"));
        await p.preview(); await p.reject(p.calls.at(-1), "Synthetic failure");
        check("Failed rerun clears previous success and reports zero writes: " + tag, !previewRegion().textContent.includes("READY") && p.host.textContent.includes("could not finish safely") && !button(p.host, "Download migration preview report"));
        await p.preview(); await p.settle(p.calls.at(-1), ready);
        check("Failure releases operation guard for retry: " + tag, previewRegion().textContent.includes("READY"));
        await p.render({ remoteAdapter: { inspect() {} } });
        check("Adapter change clears completed results and reports immediately: " + tag, !previewRegion().textContent.includes("READY") && !rehearsalRegion().textContent.includes("BLOCKED") && !button(p.host, "Download migration rehearsal report"));
        await p.close();
        for (const kind of ["preview", "rehearsal"]) {
          for (const change of ["adapter", "runner", "unmount"]) {
            p = await mount(strict); await (kind === "preview" ? p.preview() : p.rehearse()); const old = p.calls[0];
            if (change === "unmount") await p.close();
            else await p.render(change === "adapter" ? { remoteAdapter: { inspect() {} } } : { previewRunner: async () => ({ ...ready, status: "READY_WITH_WARNINGS" }) });
            check(`${kind} ${change} aborts obsolete signal: ${tag}`, old.options.signal.aborted);
            await p.settle(old, kind === "preview" ? ready : blocked);
            check(`${kind} ${change} ignores obsolete success: ${tag}`, !p.host.textContent.includes("READY") && !p.host.textContent.includes("BLOCKED") && !p.host.textContent.includes("finished"));
            await p.close();
          }
        }
        p = await mount(strict); await p.rehearse();
        const exact = { ...blocked, status: "REHEARSED_IN_MEMORY", canonicalStatus: "AVAILABLE", rollbackVerified: true, before: { counts: { DEAL: 1 }, amountMinorByDomainAndCurrency: { "DEAL:USD": "9007199254740991", "DEAL:JPY": "1" } }, after: { counts: { DEAL: 2 }, amountMinorByDomainAndCurrency: { "DEAL:USD": "9007199254740993", "DEAL:JPY": "3" } } };
        await p.settle(p.calls[0], exact);
        check("Exact aggregates above safe integer remain exact with currency-specific digits: " + tag, p.host.textContent.includes("90,071,992,547,409.91 USD") && p.host.textContent.includes("90,071,992,547,409.93 USD") && p.host.textContent.includes("+0.02 USD change") && p.host.textContent.includes("1 JPY before → 3 JPY after (+2 JPY change)"));
        await p.close();
      }
      check("Normal and StrictMode component checks never write browser storage", window.qa.writes.length === 0);
      return results;
    });
    results.push(...lifecycle); assert.deepEqual(f.errors, []); await f.context.close();
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) {
      const f = await fixture(browser, { viewport: { width, height: 1000 } });
      try {
        await f.page.evaluate(async ({ theme }) => {
          document.querySelector("#theme").setAttribute("data-theme", theme); document.documentElement.setAttribute("data-theme", theme);
          const { CANONICAL_DOMAINS } = await import("/src/features/persistence/migrationSourceRegistry.js");
          const { runLocalMigrationPreview } = await import("/src/features/persistence/migrationPreview.js");
          const { rehearseLocalMigration } = await import("/src/features/persistence/migrationRehearsal.js");
          const { createEmptyFlipScoutState, FLIP_SCOUT_STORAGE_KEY } = await import("/src/features/flipScout/constants.js");
          window.qa.remote = { status: "UNAVAILABLE", domains: {}, recordCount: 0, reason: "Synthetic canonical server is unavailable. Its records have not been inspected." };
          const remoteAdapter = { inspect: async () => window.qa.remote };
          const domains = Object.fromEntries(Object.values(CANONICAL_DOMAINS).map(domain => [domain, []]));
          window.qa.completeRemote = { status: "AVAILABLE", included: true, coverageStatus: "COMPLETE", recordCount: 0, truncatedDomains: [], domains };
          localStorage.setItem(FLIP_SCOUT_STORAGE_KEY, JSON.stringify({ ...createEmptyFlipScoutState(), deals: [{ id: "11111111-1111-4111-8111-111111111111", title: "Synthetic migration deal", providerId: "ebay", externalListingId: "synthetic-mapping", listingUrl: "https://example.test/item", status: "Needs Review", askingPrice: 12.34, currency: "USD", recordVersion: 1 }] }));
          window.qa.sourceBefore = localStorage.getItem(FLIP_SCOUT_STORAGE_KEY); window.qa.sourceKey = FLIP_SCOUT_STORAGE_KEY; window.qa.writes.length = 0;
          window.qa.mounted = await window.qa.mount(true, { previewRunner: runLocalMigrationPreview, rehearsalRunner: rehearseLocalMigration, remoteAdapter });
        }, { theme });
        await f.page.getByRole("button", { name: "Rehearse mapped changes and rollback", exact: true }).focus();
        await f.page.keyboard.press("Enter");
        const rehearsal = f.page.getByRole("region", { name: "Migration rehearsal result", exact: true });
        await expect(rehearsal.getByText("Synthetic canonical server is unavailable. Its records have not been inspected.", { exact: true })).toBeVisible();
        await expect(rehearsal.locator(".ops-badge")).toHaveText("BLOCKED");
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await f.page.screenshot({ path: path.join(output, `blocked-${theme}-${width}.png`), fullPage: true });
        const blockedDownload = f.page.waitForEvent("download");
        await rehearsal.getByRole("button", { name: "Download migration rehearsal report" }).click();
        const blockedFile = path.join(output, `blocked-report-${theme}-${width}.json`); await (await blockedDownload).saveAs(blockedFile);
        const blockedReport = JSON.parse(fs.readFileSync(blockedFile, "utf8"));
        assert.equal(blockedReport.metadata.canonicalStatus, "UNAVAILABLE"); assert.equal(blockedReport.activationAllowed, false); assert.equal(blockedReport.writesPerformed, 0); assert.ok(JSON.stringify(blockedReport).includes("Synthetic canonical server is unavailable")); assert.ok(!JSON.stringify(blockedReport).includes("Synthetic migration deal"));
        await f.page.evaluate(() => { window.qa.remote = window.qa.completeRemote; });
        await f.page.getByRole("button", { name: "Run migration preview", exact: true }).click();
        await expect(f.page.getByRole("button", { name: "Download migration preview report" })).toBeVisible();
        await f.page.getByRole("button", { name: "Rehearse mapped changes and rollback", exact: true }).click();
        await expect(rehearsal.locator(".ops-badge")).toHaveText("REHEARSED IN MEMORY");
        await rehearsal.getByText("Changes rehearsed in memory", { exact: true }).click();
        await expect(rehearsal.getByText(/0.00 USD before → 12.34 USD after/)).toBeVisible();
        const successDownload = f.page.waitForEvent("download");
        await rehearsal.getByRole("button", { name: "Download migration rehearsal report" }).click();
        const successFile = path.join(output, `success-report-${theme}-${width}.json`); await (await successDownload).saveAs(successFile);
        const report = JSON.parse(fs.readFileSync(successFile, "utf8"));
        assert.equal(report.metadata.rollbackVerified, true); assert.equal(report.metadata.beforeHash, report.metadata.rollbackHash); assert.equal(report.after.amountMinorByDomainAndCurrency.find(row => row.name === "DEAL:USD").amountMinor, "1234"); assert.equal(report.activationAllowed, false);
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.ok(await f.page.evaluate(() => [...document.querySelectorAll("button")].every(node => node.getBoundingClientRect().height >= 44)));
        assert.deepEqual(await f.page.evaluate(() => window.qa.writes), []);
        assert.equal(await f.page.evaluate(() => localStorage.getItem(window.qa.sourceKey) === window.qa.sourceBefore), true);
        assert.deepEqual(f.errors, []);
        await f.page.screenshot({ path: path.join(output, `rehearsed-${theme}-${width}.png`), fullPage: true });
        results.push({ name: `Real domain preview/rehearsal, keyboard, downloads, exact totals, zero writes and overflow: ${theme} ${width}`, passed: true });
      } catch (error) {
        results.push({ name: `Real domain/browser ${theme} ${width}`, passed: false, error: error.stack, pageErrors: f.errors });
        await f.page.screenshot({ path: path.join(output, `failure-${theme}-${width}.png`), fullPage: true });
      } finally { await f.context.close(); }
    }
  } finally {
    await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2));
  }
  console.log(`${results.filter(row => row.passed).length}/${results.length} migration review checks passed`);
  assert.ok(results.length > 40 && results.every(row => row.passed), JSON.stringify(results.filter(row => !row.passed), null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
