const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5238");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Recovery probes must use disposable local browser storage.");
const output = path.resolve(process.env.WORKSPACE_RECOVERY_QA_DIR || "artifacts/qa/workspace-recovery-2026-10-17");
const fixture = new URL("/__qa/workspace-recovery", base).href;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    const context = await browser.newContext();
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== base.origin || route.request().method() !== "GET") return route.abort();
      if (url.pathname === "/__qa/workspace-recovery") return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Disposable recovery verification</title><main>Workspace recovery verification</main>" });
      return route.continue();
    });
    const appTab = await context.newPage();
    const recoveryTab = await context.newPage();
    await Promise.all([appTab.goto(fixture), recoveryTab.goto(fixture)]);
    for (const page of [appTab, recoveryTab]) await page.evaluate(async () => { window.recovery = await import("/src/features/backup/workspaceRecovery.js"); });

    await appTab.evaluate(async () => {
      localStorage.setItem("et-tcg-beta-data", JSON.stringify({ items: [{ id: "phone-record", name: "Original", quantity: 2 }] }));
      window.releaseLease = await window.recovery.acquireWorkspaceReadLease(navigator.locks);
    });
    const locked = await recoveryTab.evaluate(async () => {
      const { applyWorkspaceSources, captureRecoverySources } = window.recovery;
      try {
        await applyWorkspaceSources({ storage: localStorage, expectedSources: captureRecoverySources(localStorage), nextSources: { "legacy-core-business": { schemaVersion: 0, data: { items: [{ id: "new-record" }] } } }, ownerId: "synthetic-account", locks: navigator.locks });
        return { code: "UNEXPECTED_SUCCESS" };
      } catch (error) { return { code: error.code, saved: JSON.parse(localStorage.getItem("et-tcg-beta-data")) }; }
    });
    assert.equal(locked.code, "WORKSPACE_BUSY");
    assert.equal(locked.saved.items[0].id, "phone-record");
    results.push({ check: "native independent-tab shared lease refuses recovery", passed: true });

    await appTab.close();
    const recovered = await recoveryTab.evaluate(async () => {
      const { createVerifiedBackup } = await import("/src/features/backup/backupFormat.js");
      const { getBackupSource } = await import("/src/features/backup/backupSourceRegistry.js");
      const { planWorkspaceRestore } = await import("/src/features/backup/workspaceRestorePlan.js");
      const backup = await createVerifiedBackup({ localStorage: { getItem: (key) => key === "et-tcg-beta-data" ? JSON.stringify({ items: [{ id: "desktop-record", name: "Recovered", quantity: 1 }] }) : null }, sourceRegistry: [getBackupSource("legacy-core-business")] });
      const review = await planWorkspaceRestore(backup.json, { storage: localStorage });
      const applied = await window.recovery.applyWorkspaceSources({ storage: localStorage, ...review, ownerId: "synthetic-account", locks: navigator.locks });
      return { applied, added: review.plan.addedRecords, saved: JSON.parse(localStorage.getItem("et-tcg-beta-data")) };
    });
    assert.equal(recovered.applied.status, "APPLIED");
    assert.equal(recovered.added, 1);
    assert.deepEqual(recovered.saved.items.map((item) => item.id), ["phone-record", "desktop-record"]);
    await recoveryTab.reload();
    assert.equal(await recoveryTab.evaluate(() => JSON.parse(localStorage.getItem("et-tcg-beta-data")).items.length), 2);
    results.push({ check: "closing peer permits additive restore with native durable storage and reload", passed: true });

    const interrupted = await recoveryTab.evaluate(async () => {
      const api = await import("/src/features/backup/workspaceRecovery.js");
      localStorage.setItem(api.WORKSPACE_RECOVERY_KEY, localStorage.getItem(api.WORKSPACE_CHECKPOINT_KEY));
      return api.hasPendingWorkspaceRecovery(localStorage);
    });
    assert.equal(interrupted, true);
    await recoveryTab.reload();
    const resumed = await recoveryTab.evaluate(async () => {
      const api = await import("/src/features/backup/workspaceRecovery.js");
      const result = await api.recoverWorkspaceSources({ storage: localStorage, ownerId: "synthetic-account", locks: navigator.locks });
      return { result, saved: JSON.parse(localStorage.getItem("et-tcg-beta-data")), pending: api.hasPendingWorkspaceRecovery(localStorage) };
    });
    assert.equal(resumed.result.status, "ROLLED_BACK");
    assert.equal(resumed.pending, false);
    assert.deepEqual(resumed.saved.items.map((item) => item.id), ["phone-record"]);
    results.push({ check: "fresh-page startup recovers interrupted transaction without losing original records", passed: true });
    await context.close();
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, "native-recovery-results.json"), JSON.stringify({ createdAt: new Date().toISOString(), results, failures: 0 }, null, 2));
    console.log(`Native workspace recovery: ${results.length} checks passed.`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
