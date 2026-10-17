const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");

// Disposable browser state only. No account, sync transport, or real server is used.
const base = new URL("http://127.0.0.1:5238");
const output = path.resolve("artifacts/qa/workspace-sync-notice");
const original = ' {"items":[{"id":"synthetic-existing-record","quantity":2}]} ';
const conflicts = ["beta-readiness-records", "safe-ui-preferences"];
const conflictStatus = (revision = 7, sourceIds = conflicts) => ({
  status: "CONFLICT", revision, conflicts: sourceIds,
  message: "Both copies are preserved. Review the changes before continuing.",
});
const remoteStatus = (revision = 9) => ({
  status: "REMOTE_AVAILABLE", revision, conflicts: [],
  message: "A newer saved version is available.",
});

const authModule = `
export const isSupabaseConfigured = false;
const unexpected = () => { window.qaCalls.provider++; throw new Error('Unexpected provider call in isolated notice fixture'); };
export const supabase = { auth: { getUser: unexpected, getSession: unexpected }, rpc: unexpected };
export const createIsolatedAuthClient = unexpected;
`;
const entry = `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import './src/index.css';
import './src/App.css';
import './src/features/persistence/cloud-workspace.css';
import WorkspaceSyncNotice from './src/features/persistence/WorkspaceSyncNotice.jsx';
import CloudSyncPanel from './src/features/persistence/CloudSyncPanel.jsx';
import {CloudWorkspaceContext} from './src/features/persistence/CloudWorkspaceContext.js';
function Fixture() {
  const [status, setStatus] = useState(${JSON.stringify(conflictStatus())});
  const [ownerId, setOwnerId] = useState('synthetic-owner-a');
  window.qa = {setStatus, setOwnerId, status, ownerId};
  const workspace = {
    // The real session panel intentionally omits itself for a local synthetic user.
    user: {id: 'local-beta'}, enabled: true, status,
    syncNow: async () => {window.qaCalls.sync++;},
    setEnabled: () => {window.qaCalls.enabled++;},
    loadNewer: async () => {window.qaCalls.load++;},
    resolveConflicts: async () => {window.qaCalls.resolve++;},
    reviewConflicts: async () => {window.qaCalls.review++; return {reviewId:'synthetic',conflicts:[]};},
    history: async () => {window.qaCalls.history++; return [];},
    listDeviceRecoveryCopies: async () => {window.qaCalls.recovery++; return [];},
    openRecovery: () => {window.qaCalls.recovery++;},
  };
  const theme = document.documentElement.dataset.theme;
  return <CloudWorkspaceContext.Provider value={workspace}>
    <main className={'app app-command-shell app-settings app-theme-'+theme} data-theme={theme} style={{padding:16,minHeight:'100dvh'}}>
      <div style={{width:'100%',maxWidth:760,margin:'0 auto'}}>
        <h1 style={{fontSize:24,margin:'12px 0 20px'}}>Settings</h1>
        <CloudSyncPanel />
        <button id="keyboard-start" type="button" style={{minHeight:44,marginTop:24}}>Keyboard navigation start</button>
      </div>
    </main>
    <WorkspaceSyncNotice status={status} ownerId={ownerId} onLoadNewer={workspace.loadNewer} />
  </CloudWorkspaceContext.Provider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
`;

(async () => {
  fs.mkdirSync(output, { recursive: true });
  await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "jsx" },
    bundle: true, jsx: "automatic", format: "esm", outfile: path.join(output, "fixture.js"),
    define: { "import.meta.env": "{}" }, external: ["/assets/*"],
    plugins: [{ name: "no-provider", setup(plugin) {
      plugin.onResolve({ filter: /supabaseClient(?:\.js)?$/ }, () => ({ path: "supabaseClient", namespace: "fixture" }));
      plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: authModule, loader: "js" }));
    } }],
  });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  let checks = 0;
  try {
    for (const width of [360, 390, 1440]) for (const theme of ["light", "dark"]) {
      const label = `${width}-${theme}`;
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
      const unexpectedRequests = [];
      await context.route("**/*", (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== base.origin || request.method() !== "GET") {
          unexpectedRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
          return route.abort();
        }
        if (url.pathname === "/__qa/notice") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html data-theme="${theme}"><head><title>Sync notice verification</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__qa/fixture.css"></head><body><div id="root"></div><script type="module" src="/__qa/fixture.js"></script></body></html>` });
        if (url.pathname === "/__qa/fixture.js") return route.fulfill({ contentType: "text/javascript", body: fs.readFileSync(path.join(output, "fixture.js")) });
        if (url.pathname === "/__qa/fixture.css") return route.fulfill({ contentType: "text/css", body: fs.readFileSync(path.join(output, "fixture.css")) });
        // Static artwork/fonts are irrelevant to this fixture; never fall through to a real server.
        return route.fulfill({ status: 404, body: "Isolated fixture asset" });
      });
      await context.addInitScript((bytes) => {
        localStorage.setItem("et-tcg-beta-data", bytes);
        sessionStorage.setItem("synthetic-auth-token", "exact synthetic session bytes");
        window.qaCalls = { sync: 0, enabled: 0, load: 0, resolve: 0, review: 0, history: 0, recovery: 0, provider: 0, storage: 0, indexedDB: 0 };
        for (const name of ["setItem", "removeItem", "clear"]) {
          const originalMethod = Storage.prototype[name];
          Storage.prototype[name] = function (...args) { window.qaCalls.storage++; return originalMethod.apply(this, args); };
        }
        const open = IDBFactory.prototype.open;
        IDBFactory.prototype.open = function (...args) { window.qaCalls.indexedDB++; return open.apply(this, args); };
      }, original);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(new URL("/__qa/notice", base).href);
      const notice = page.getByRole("complementary", { name: "Cloud saving notice" });
      const dismiss = page.getByRole("button", { name: "Dismiss sync notice", exact: true });
      const settingsStatus = page.locator(".cloud-workspace-status");
      await notice.waitFor({ state: "visible" });

      async function setStatus(status) {
        await page.evaluate((next) => window.qa.setStatus(next), status);
        await page.waitForFunction((next) => JSON.stringify(window.qa.status) === JSON.stringify(next), status);
      }
      async function assertVisible() { assert.equal(await notice.count(), 1, label); checks++; }
      async function assertDismissed() { assert.equal(await notice.count(), 0, label); checks++; }
      async function assertLayout() {
        const geometry = await page.evaluate(() => {
          const node = document.querySelector(".cloud-workspace-notice");
          const box = node.getBoundingClientRect();
          return { pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
            noticeOverflow: node.scrollWidth > node.clientWidth + 1,
            inside: box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1 };
        });
        assert.deepEqual(geometry, { pageOverflow: false, noticeOverflow: false, inside: true }, label); checks++;
      }
      const initialCalls = await page.evaluate(() => window.qaCalls);
      assert.ok(Object.values(initialCalls).every((count) => count === 0)); checks++;
      assert.match(await settingsStatus.innerText(), /Review conflicting changes/); checks++;
      const size = await dismiss.boundingBox();
      assert.ok(size.width >= 44 && size.height >= 44, JSON.stringify({ label, size })); checks++;
      await assertLayout();

      // Tab from the preceding real button exercises native keyboard reachability and focus styling.
      await page.locator("#keyboard-start").focus();
      await page.keyboard.press("Tab");
      const focus = await dismiss.evaluate((node) => ({ focused: document.activeElement === node,
        visible: node.matches(":focus-visible"), outline: getComputedStyle(node).outlineStyle,
        width: parseFloat(getComputedStyle(node).outlineWidth) }));
      assert.deepEqual(focus, { focused: true, visible: true, outline: "solid", width: 3 }, label); checks++;
      await page.screenshot({ path: path.join(output, `${label}-conflict.png`), fullPage: true });
      await page.keyboard.press(theme === "light" ? "Enter" : "Space");
      await assertDismissed();
      assert.deepEqual(await page.evaluate(() => window.qaCalls), initialCalls); checks++;
      assert.match(await settingsStatus.innerText(), /Review conflicting changes/); checks++;
      assert.equal(await page.getByRole("button", { name: "Review both saved versions", exact: true }).isVisible(), true); checks++;

      await setStatus({ status: "SYNCING", revision: 7 });
      await assertDismissed();
      await setStatus(conflictStatus(7, [...conflicts].reverse()));
      await assertDismissed();
      assert.match(await settingsStatus.innerText(), /Review conflicting changes/); checks++;
      await page.screenshot({ path: path.join(output, `${label}-dismissed.png`), fullPage: true });

      await setStatus(conflictStatus(8));
      await assertVisible();
      await dismiss.click();
      await assertDismissed();
      await setStatus(conflictStatus(8, ["beta-readiness-records"]));
      await assertVisible();
      await dismiss.click();
      await assertDismissed();
      await page.evaluate(() => window.qa.setOwnerId("synthetic-owner-b"));
      await notice.waitFor({ state: "visible" });
      await assertVisible();
      await dismiss.click();
      await assertDismissed();
      assert.deepEqual(await page.evaluate(() => window.qaCalls), initialCalls); checks++;

      await setStatus(remoteStatus());
      await assertVisible();
      await assertLayout();
      await page.screenshot({ path: path.join(output, `${label}-newer-changes.png`), fullPage: true });
      await notice.getByRole("button", { name: "Load saved changes", exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.qaCalls), { ...initialCalls, load: 1 }); checks++;
      // The existing Settings load control also remains available after dismissing the floating notice.
      await dismiss.click();
      await assertDismissed();
      await setStatus({ status: "SYNCING", revision: 9 });
      await assertDismissed();
      await setStatus(remoteStatus());
      await assertDismissed();
      await page.getByRole("button", { name: "Load changes from another device", exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.qaCalls), { ...initialCalls, load: 2 }); checks++;
      await setStatus(remoteStatus(10));
      await assertVisible();
      await setStatus({ status: "SYNCED", revision: 10, conflicts: [], message: "All changes saved." });
      await assertDismissed();
      assert.match(await settingsStatus.innerText(), /Saved to your account/); checks++;

      const preserved = await page.evaluate(() => ({ core: localStorage.getItem("et-tcg-beta-data"), session: sessionStorage.getItem("synthetic-auth-token") }));
      assert.deepEqual(preserved, { core: original, session: "exact synthetic session bytes" }); checks++;
      assert.deepEqual(await page.evaluate(() => window.qaCalls), { ...initialCalls, load: 2 }); checks++;
      assert.deepEqual(errors, []); checks++;
      assert.deepEqual(unexpectedRequests, []); checks++;
      results.push({ viewport: width, theme, touchTarget: "44px", keyboardDismissal: true,
        pollingDoesNotReopenDismissedNotice: true, changedRevisionConflictSetOrAccountReopens: true,
        settingsStatusPreserved: true, loadCallbacks: 2, storageMutations: 0, externalRequests: 0, overflow: false });
      await context.close();
    }
    const report = { passed: checks, realComponents: ["WorkspaceSyncNotice", "CloudSyncPanel"],
      syntheticStatusAndCallbacks: true, realAccountsOrRecordsUsed: false, results };
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
