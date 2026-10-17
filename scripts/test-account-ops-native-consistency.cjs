const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5227");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Synthetic probes are local only.");
const output = path.resolve(process.env.ACCOUNT_OPS_QA_DIR || "artifacts/qa/reliability-returns/cross-tab");
const KEY = "code3.account-ops.v1";
const fingerprint = raw => crypto.createHash("sha256").update(JSON.stringify(raw)).digest("hex");
const summarize = raw => {
  const data = raw ? JSON.parse(raw) : { profileGroups: [], activity: [] };
  return { rawHash: fingerprint(raw), groups: data.profileGroups.length, activities: data.activity.length, ids: data.profileGroups.map(row => row.id), activityIds: data.activity.map(row => row.id) };
};
const read = page => page.evaluate(key => localStorage.getItem(key), KEY);

async function localOnly(context) {
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== base.origin || route.request().method() !== "GET") return route.abort();
    if (url.pathname === "/__qa/account-ops-observer") return route.fulfill({
      headers: { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" },
      contentType: "text/html", body: "<html><body>Synthetic Account Ops native observation fixture</body></html>",
    });
    return route.continue();
  });
}

async function staleObservation(browser) {
  const context = await browser.newContext(); await localOnly(context);
  try {
    const observer = await context.newPage(), writer = await context.newPage();
    const fixtureUrl = new URL("/__qa/account-ops-observer", base).href;
    await Promise.all([observer.goto(fixtureUrl), writer.goto(fixtureUrl)]);
    // No Storage overrides: both caches are native and warmed before any writes.
    for (const page of [observer, writer]) await page.evaluate(async () => {
      const { createAccountOpsService } = await import("/src/features/accountOps/service.js");
      window.accountOps = createAccountOpsService(); window.accountOps.snapshot(); localStorage.getItem("code3.account-ops.v1");
    });
    await observer.evaluate(async () => {
      window.flag = new Int32Array(new SharedArrayBuffer(4));
      const workerUrl = URL.createObjectURL(new Blob([
        "onmessage = event => { const flag = new Int32Array(event.data); const channel = new BroadcastChannel('account-ops-completed'); channel.onmessage = () => Atomics.store(flag, 0, 1); postMessage('ready'); };",
      ], { type: "text/javascript" }));
      window.worker = new Worker(workerUrl); URL.revokeObjectURL(workerUrl);
      await new Promise((resolve, reject) => { window.worker.onmessage = resolve; window.worker.onerror = reject; window.worker.postMessage(window.flag.buffer); });
      window.lastPeerSnapshotEvent = new Promise(resolve => {
        const changed = event => {
          if (event.storageArea !== localStorage || event.key !== "code3.account-ops.v1" || !event.newValue) return;
          if (JSON.parse(event.newValue).profileGroups.length !== 20) return;
          removeEventListener("storage", changed); resolve({ raw: localStorage.getItem(event.key), eventRaw: event.newValue });
        };
        addEventListener("storage", changed);
      });
    });
    await observer.exposeFunction("startPeerWrites", () => writer.evaluate(async () => {
      window.returned = await Promise.all(Array.from({ length: 16 }, (_, index) => window.accountOps.createProfileGroup({ displayName: `Synthetic observer ${index}` }).then(result => result.record.id)));
      window.doneAt = Date.now(); window.doneChannel = new BroadcastChannel("account-ops-completed"); window.doneChannel.postMessage("done");
      return window.returned;
    }));
    const immediate = await observer.evaluate(() => {
      window.startPeerWrites(); const deadline = performance.now() + 10000;
      // A bounded diagnostic task deliberately holds this renderer busy. The
      // completion signal is independent of its task queue; this is not a save
      // delay, retry, mocked getItem, or proposed production synchronization fix.
      while (Atomics.load(window.flag, 0) === 0 && performance.now() < deadline) { /* diagnostic boundary */ }
      return { completed: Atomics.load(window.flag, 0) === 1, raw: localStorage.getItem("code3.account-ops.v1"), readAt: Date.now() };
    });
    const returned = await writer.evaluate(() => ({ ids: window.returned, doneAt: window.doneAt }));
    assert.equal(immediate.completed, true, "Writer must finish before the immediate observer read.");
    assert.ok(returned.doneAt <= immediate.readAt);
    const yielded = await observer.evaluate(() => window.lastPeerSnapshotEvent);
    const fresh = await context.newPage(); await fresh.goto(fixtureUrl); const freshRaw = await read(fresh);
    const freshSummary = summarize(freshRaw);
    assert.equal(freshSummary.groups, 20); assert.equal(freshSummary.activities, 16);
    assert.ok(returned.ids.every(id => freshSummary.ids.includes(id)), "Every fulfilled write must be present in the independent fresh page.");
    assert.equal(yielded.raw, freshRaw, "Storage-event delivery must converge to the independent observer.");
    assert.equal(yielded.eventRaw, freshRaw);
    const result = { name: "native stale observation is separated from persisted state", completedBeforeObservation: true,
      staleObservationReproduced: immediate.raw !== freshRaw, immediate: summarize(immediate.raw), yielded: summarize(yielded.raw), fresh: freshSummary, returnedIds: returned.ids,
      bounds: "Test-only isolated headers and a worker completion signal hold one renderer task. This demonstrates a mechanism; it does not establish the historical incident's cause." };
    fs.writeFileSync(path.join(output, "observer-raw-evidence.json"), JSON.stringify({ immediate, yielded, returned, freshRaw }, null, 2));
    return result;
  } finally { await context.close(); }
}

async function concurrentFullApp(browser, theme, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } }); await localOnly(context);
  const evidence = { theme, width, batches: [] }; const errors = [];
  try {
    const one = await context.newPage(), two = await context.newPage();
    for (const page of [one, two]) page.on("pageerror", error => errors.push(error.message));
    const appUrl = new URL(`/account-ops/profiles?betaLocalMode=true&themeInspect=${theme}`, base).href;
    await Promise.all([one.goto(appUrl), two.goto(appUrl)]);
    await Promise.all([one.getByTestId("account-ops").waitFor(), two.getByTestId("account-ops").waitFor()]);
    for (const page of [one, two]) await page.evaluate(async () => {
      const { createAccountOpsService } = await import("/src/features/accountOps/service.js");
      window.accountOps = createAccountOpsService();
      if (window.accountOps.snapshot() instanceof Promise) throw Error("The synchronous read contract changed.");
    });
    const allReturned = [];
    for (let batch = 0; batch < 3; batch++) {
      const create = (page, label) => page.evaluate(label => Promise.all(Array.from({ length: 8 }, (_, index) => window.accountOps.createProfileGroup({ displayName: `${label} group ${index}` }).then(result => result.record.id))), label);
      const returned = (await Promise.all([create(one, `Synthetic ${batch} A`), create(two, `Synthetic ${batch} B`)])).flat(); allReturned.push(...returned);
      const immediateRaw = await Promise.all([read(one), read(two)]);
      // A fresh independent page is authoritative evidence for this browser
      // session. No retries or timeout sleeps are used to turn a failure green.
      const fresh = await context.newPage(); await fresh.goto(new URL("/__qa/account-ops-observer", base).href); const freshRaw = await read(fresh);
      const laterRaw = await Promise.all([read(one), read(two)]);
      const snapshot = summarize(freshRaw);
      const row = { batch, returnedIds: returned, immediate: immediateRaw.map(summarize), fresh: snapshot, later: laterRaw.map(summarize) };
      evidence.batches.push(row);
      fs.writeFileSync(path.join(output, `full-app-${theme}-${width}.json`), JSON.stringify(evidence, null, 2));
      if (snapshot.groups !== 4 + allReturned.length || snapshot.activities !== allReturned.length || !allReturned.every(id => snapshot.ids.includes(id)) || laterRaw.some(raw => raw !== freshRaw)) {
        fs.writeFileSync(path.join(output, `failure-${theme}-${width}-${batch}.json`), JSON.stringify({ allReturned, immediateRaw, freshRaw, laterRaw }, null, 2));
      }
      assert.equal(snapshot.groups, 4 + allReturned.length); assert.equal(snapshot.activities, allReturned.length);
      assert.ok(allReturned.every(id => snapshot.ids.includes(id)), "A fulfilled create is absent from the independent fresh observer.");
      assert.ok(laterRaw.every(raw => raw === freshRaw), "Writer tabs differ after the independent observation.");
      assert.equal(new Set(snapshot.ids).size, snapshot.ids.length); assert.equal(new Set(snapshot.activityIds).size, snapshot.activityIds.length);
      await fresh.close();
    }
    assert.equal(await one.evaluate(async () => { const { createAccountOpsRepository } = await import("/src/features/accountOps/repository.js"); const repository = createAccountOpsRepository(); try { repository.save(repository.load()); return "BYPASSED"; } catch (error) { return error.code; } }), "COORDINATED_WRITE_REQUIRED");
    assert.deepEqual(errors, []);
    return evidence;
  } finally { await context.close(); }
}

async function mountedUi(browser, theme, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } }); await localOnly(context);
  const errors = [];
  try {
    const page = await context.newPage(), peer = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error" && /validateDOMNesting|cannot be a descendant|cannot contain a nested/i.test(message.text())) errors.push(message.text());
    });
    const fixtureUrl = new URL("/__qa/account-ops-observer", base).href;
    await Promise.all([page.goto(fixtureUrl), peer.goto(fixtureUrl)]);
    await page.evaluate(async theme => {
      document.body.innerHTML = '<div id="fixture"></div>';
      const main = await (await fetch("/src/main.jsx")).text();
      const imports = [...main.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]);
      const dependency = name => imports.find(value => new URL(value, location.href).pathname.endsWith(`/${name}`));
      const react = await import(dependency("react.js")), React = react.default || react;
      const dom = await import(dependency("react-dom_client.js")), { createRoot } = dom.default || dom;
      const runtime = (await import("/@react-refresh")).default;
      runtime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;
      await import("/src/index.css"); await import("/src/App.css");
      const { default: AccountOpsPage } = await import("/src/features/accountOps/AccountOpsPage.jsx");
      const getItem = Storage.prototype.getItem;
      window.privateReads = [];
      Storage.prototype.getItem = function (key) { if (["code3.account-ops.v1", "code3.account-ops.restore-journal.v1"].includes(key)) window.privateReads.push(key); return getItem.call(this, key); };
      const root = createRoot(document.getElementById("fixture"));
      window.mountAccountOps = (status = "authorized", identityKey = "a".repeat(64)) => root.render(React.createElement(React.StrictMode, null,
        React.createElement("div", { className: "app", "data-theme": theme, style: { minHeight: "100vh", padding: "16px" } }, React.createElement(AccountOpsPage, {
          initialSection: "profiles", session: { status, ownerAuthorized: status === "authorized", provider: "synthetic", identityKey, displayIdentity: "same masked owner", localDevelopment: true },
        }))));
      window.mountAccountOps();
    }, theme);
    await page.getByTestId("account-ops").waitFor();
    await peer.evaluate(async () => { const { createAccountOpsService } = await import("/src/features/accountOps/service.js"); window.accountOps = createAccountOpsService(); });
    const profile = await peer.evaluate(async () => (await window.accountOps.createProfile({ displayName: "Synthetic peer profile" })).record);
    const card = page.locator(".account-ops-card").filter({ has: page.getByRole("heading", { name: "Synthetic peer profile", exact: true }) });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Open", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Display name", { exact: true }).fill("Synthetic unsaved draft");
    await peer.evaluate(async profile => window.accountOps.updateProfile(profile.id, { displayName: "Synthetic peer updated" }, profile.recordVersion), profile);
    await expect(page.locator(".account-ops-card h3")).toHaveText("Synthetic peer updated");
    await expect(page.getByRole("dialog").getByLabel("Display name", { exact: true })).toHaveValue("Synthetic unsaved draft");
    const beforeConflict = await read(peer);
    await page.getByRole("button", { name: "Save Profile", exact: true }).click();
    await expect(page.getByText("The record changed after it was loaded.", { exact: true })).toHaveCount(1);
    assert.equal(await read(peer), beforeConflict, "A stale open draft must not overwrite the peer update.");
    await expect(page.getByRole("dialog").getByLabel("Display name", { exact: true })).toHaveValue("Synthetic unsaved draft");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await peer.evaluate(profile => window.accountOps.archiveProfile(profile.id), profile);
    await expect(page.locator(".account-ops-card h3")).toHaveCount(0);
    await peer.evaluate(key => localStorage.removeItem(key), KEY);
    await expect(page.getByRole("heading", { name: "No profiles found", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Create Profile", exact: true }).first().click();
    await page.getByRole("dialog").getByLabel("Display name", { exact: true }).fill("Synthetic after remove");
    await page.getByRole("button", { name: "Save Profile", exact: true }).click();
    await expect(page.locator(".account-ops-card h3")).toHaveText("Synthetic after remove");
    const recreated = JSON.parse(await read(page)); assert.equal(recreated.profiles.length, 1); assert.equal(recreated.activity.length, 1);
    await peer.evaluate(() => localStorage.clear());
    await expect(page.locator(".account-ops-card h3")).toHaveCount(0);
    await page.getByRole("button", { name: "Create Profile", exact: true }).first().click();
    await page.getByRole("dialog").getByLabel("Display name", { exact: true }).fill("Synthetic preserved on peer create");
    await peer.evaluate(() => window.accountOps.createProfile({ displayName: "Synthetic after clear" }));
    await expect(page.locator(".account-ops-card h3")).toHaveText("Synthetic after clear");
    await expect(page.getByRole("dialog").getByLabel("Display name", { exact: true })).toHaveValue("Synthetic preserved on peer create");
    await page.screenshot({ path: path.join(output, `live-refresh-${theme}-${width}.png`), fullPage: true });
    await page.evaluate(() => window.mountAccountOps("authorized", "b".repeat(64)));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.evaluate(() => {
      window.privateReads = [];
      dispatchEvent(new StorageEvent("storage", { key: "code3.account-ops.v1", storageArea: sessionStorage, newValue: "not local data" }));
    });
    assert.deepEqual(await page.evaluate(() => window.privateReads), [], "A sessionStorage event cannot trigger private local reads.");
    await peer.evaluate(() => localStorage.setItem("code3.account-ops.restore-journal.v1", "synthetic pending recovery"));
    await expect(page.getByRole("heading", { name: "Account Ops recovery required", exact: true })).toBeVisible();
    await peer.evaluate(() => localStorage.removeItem("code3.account-ops.restore-journal.v1"));
    await expect(page.getByRole("heading", { name: "Account Ops recovery required", exact: true })).toBeVisible();
    await page.evaluate(() => {
      window.privateReads = [];
      dispatchEvent(new StorageEvent("storage", { key: "code3.account-ops.v1", storageArea: localStorage, newValue: "old queued event" }));
    });
    assert.deepEqual(await page.evaluate(() => window.privateReads), [], "A latched recovery failure requires Reload before further private reads.");
    await page.getByRole("button", { name: "Reload Account Ops", exact: true }).click();
    await expect(page.locator(".account-ops-card h3")).toHaveText("Synthetic after clear");
    await page.evaluate(() => window.mountAccountOps("sign_in_required"));
    await expect(page.getByRole("heading", { name: "Sign In Required", exact: true })).toBeVisible();
    await page.evaluate(() => {
      window.privateReads = [];
      window.revokedPeerEvent = new Promise(resolve => {
        const listener = event => { if (event.storageArea === localStorage && event.key === "code3.account-ops.v1") { removeEventListener("storage", listener); resolve(); } };
        addEventListener("storage", listener);
      });
    });
    await peer.evaluate(() => window.accountOps.createProfile({ displayName: "Synthetic after revocation" }));
    await page.evaluate(() => window.revokedPeerEvent);
    assert.deepEqual(await page.evaluate(() => window.privateReads), [], "Revoked views must not read private storage when a peer changes it.");
    assert.equal(await page.getByText("Synthetic after revocation", { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    return { theme, width, createUpdateArchiveRefresh: true, removeClearWithoutResurrection: true, draftPreserved: true, staleDraftRejected: true, identityLifetime: true, foreignStorageIgnored: true, recoveryGuard: true, revokedZeroPrivateReads: true };
  } finally { await context.close(); }
}

(async () => {
  fs.mkdirSync(output, { recursive: true }); const browser = await chromium.launch(); const results = { createdAt: new Date().toISOString(), origin: base.origin, chromium: browser.version(), fullApp: [], ui: [] };
  try {
    results.observer = await staleObservation(browser);
    console.log(`PASS native observer: immediate ${results.observer.immediate.groups}, yielded ${results.observer.yielded.groups}, fresh ${results.observer.fresh.groups}; stale=${results.observer.staleObservationReproduced}`);
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) {
      results.fullApp.push(await concurrentFullApp(browser, theme, width));
      console.log(`PASS full app ${theme}/${width}: three concurrent two-tab batches, 48 records and 48 activities retained.`);
      results.ui.push(await mountedUi(browser, theme, width));
      console.log(`PASS live Account Ops UI ${theme}/${width}: peer refresh, draft conflict, clear, recovery and revoked view.`);
    }
    results.passed = true;
  } catch (error) { results.passed = false; results.error = error.stack; throw error; }
  finally { fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
