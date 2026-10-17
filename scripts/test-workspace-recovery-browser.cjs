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
    const routeLocalFixture = (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== base.origin || route.request().method() !== "GET") return route.abort();
      if (url.pathname === "/__qa/workspace-recovery") return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Disposable recovery verification</title><main>Workspace recovery verification</main>" });
      return route.continue();
    };
    await context.route("**/*", routeLocalFixture);
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

    // This separate disposable profile uses real Chromium localStorage quota and
    // real IndexedDB. Only synthetic QA records are ever filled or recovered.
    const quotaContext = await browser.newContext();
    await quotaContext.route("**/*", routeLocalFixture);
    const quotaTab = await quotaContext.newPage();
    await quotaTab.goto(fixture);
    const quotaApplied = await quotaTab.evaluate(async () => {
      const api = await import("/src/features/backup/workspaceRecovery.js");
      const { createWorkspacePayloadStore } = await import("/src/features/persistence/workspacePayloadStore.js");
      const original = { items: Array.from({ length: 1000 }, (_, index) => ({ id: `quota-${index}`, name: `Synthetic ${"x".repeat(160)}`, quantity: 2 })) };
      localStorage.setItem("et-tcg-beta-data", JSON.stringify(original));
      let fillerCount = 0;
      for (; fillerCount < 100; fillerCount += 1) {
        try { localStorage.setItem(`qa-quota-filler-${fillerCount}`, "x".repeat(100 * 1024)); }
        catch (error) { if (error.name !== "QuotaExceededError") throw error; break; }
      }
      if (fillerCount === 100 || fillerCount < 2) throw new Error("Native browser quota fixture was not bounded as expected.");
      // Leave space for compact metadata, but insufficient room to duplicate the
      // recovery before/after payload in this storage area.
      localStorage.removeItem(`qa-quota-filler-${fillerCount - 1}`);
      let inlineRejected = false;
      try { localStorage.setItem("qa-inline-journal-probe", "x".repeat(JSON.stringify(original).length * 2)); }
      catch (error) { if (error.name !== "QuotaExceededError") throw error; inlineRejected = true; }
      localStorage.removeItem("qa-inline-journal-probe");
      const expectedSources = api.captureRecoverySources(localStorage);
      const next = { items: original.items.map((item) => ({ ...item, quantity: 3 })) };
      const applied = await api.applyWorkspaceSources({ storage: localStorage, expectedSources, nextSources: { "legacy-core-business": { schemaVersion: 0, data: next } }, ownerId: "synthetic-quota-account", locks: navigator.locks });
      const markerRaw = localStorage.getItem(api.WORKSPACE_CHECKPOINT_KEY);
      const marker = JSON.parse(markerRaw);
      const payloadRaw = await createWorkspacePayloadStore().get(marker.payloadKey);
      return { inlineRejected, applied, markerBytes: markerRaw.length, markerFormat: marker.format, payloadCharacters: payloadRaw?.length, records: JSON.parse(localStorage.getItem("et-tcg-beta-data")).items.length, quantities: [...new Set(JSON.parse(localStorage.getItem("et-tcg-beta-data")).items.map((item) => item.quantity))], pending: api.hasPendingWorkspaceRecovery(localStorage) };
    });
    assert.equal(quotaApplied.inlineRejected, true);
    assert.equal(quotaApplied.applied.status, "APPLIED");
    assert.equal(quotaApplied.markerFormat, "code3-workspace-recovery-reference");
    assert.ok(quotaApplied.markerBytes < 600);
    assert.ok(quotaApplied.payloadCharacters > 128 * 1024);
    assert.equal(quotaApplied.records, 1000);
    assert.deepEqual(quotaApplied.quantities, [3]);
    assert.equal(quotaApplied.pending, false);
    results.push({ check: "native near-full localStorage uses verified IndexedDB before-image and compact markers", passed: true });

    await quotaTab.evaluate(async () => {
      const api = await import("/src/features/backup/workspaceRecovery.js");
      localStorage.setItem(api.WORKSPACE_RECOVERY_KEY, localStorage.getItem(api.WORKSPACE_CHECKPOINT_KEY));
    });
    await quotaTab.reload();
    const quotaResumed = await quotaTab.evaluate(async () => {
      const api = await import("/src/features/backup/workspaceRecovery.js");
      const result = await api.recoverWorkspaceSources({ storage: localStorage, ownerId: "synthetic-quota-account", locks: navigator.locks });
      const saved = JSON.parse(localStorage.getItem("et-tcg-beta-data"));
      return { result, records: saved.items.length, quantities: [...new Set(saved.items.map((item) => item.quantity))], pending: api.hasPendingWorkspaceRecovery(localStorage) };
    });
    assert.equal(quotaResumed.result.status, "ROLLED_BACK");
    assert.equal(quotaResumed.records, 1000);
    assert.deepEqual(quotaResumed.quantities, [2]);
    assert.equal(quotaResumed.pending, false);
    results.push({ check: "fresh page resolves durable IndexedDB checkpoint and restores all originals under native quota", passed: true });
    await quotaContext.close();
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, "native-recovery-results.json"), JSON.stringify({ createdAt: new Date().toISOString(), results, failures: 0 }, null, 2));
    console.log(`Native workspace recovery: ${results.length} checks passed.`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
