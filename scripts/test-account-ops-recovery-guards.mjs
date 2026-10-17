import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { ACCOUNT_OPS_STORAGE_KEY as KEY, ACCOUNT_OPS_COLLECTIONS } from "../src/features/accountOps/constants.js";
import { createAccountOpsRepository, createEmptyAccountOpsState } from "../src/features/accountOps/repository.js";
import { createAccountOpsPersistence } from "../src/features/accountOps/persistence.js";
import { createAccountOpsService } from "../src/features/accountOps/service.js";
import { ACCOUNT_OPS_RESTORE_JOURNAL_KEY as JOURNAL, ACCOUNT_OPS_RESTORE_LOCK, assertAccountOpsRecoveryClear, readAccountOpsRecoveryGuardedRaw } from "../src/features/accountOps/recoveryState.js";
import * as restore from "../src/features/backup/accountOpsRestore.js";
import { createVerifiedBackup, readCurrentBackupSources } from "../src/features/backup/backupFormat.js";
import { BACKUP_SOURCE_REGISTRY } from "../src/features/backup/backupSourceRegistry.js";
import { getPhase2aQaFixture } from "../src/features/accountOps/fixtures/phase2aQaFixtures.js";

const now = () => "2026-09-15T12:00:00.000Z";
const original = JSON.stringify(getPhase2aQaFixture("healthy-profile-account").state);
const empty = JSON.stringify(createEmptyAccountOpsState(now));
const artifacts = path.resolve(process.env.ACCOUNT_OPS_GUARD_QA_DIR
  || (process.env.QA_OUTPUT_DIR ? path.join(process.env.QA_OUTPUT_DIR, "account-ops-recovery-guards") : "artifacts/qa/reliability-returns/cross-tab/recovery-guards"));
fs.mkdirSync(artifacts, { recursive: true });
const results = [];
async function test(name, action) {
  try { await action(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); throw error; }
  finally { fs.writeFileSync(path.join(artifacts, "results.json"), JSON.stringify(results, null, 2)); }
}
class MemoryStorage {
  constructor(raw = original) { this.values = new Map([["qa.unrelated", "keep exact bytes"], ...(raw === null ? [] : [[KEY, raw]])]); this.writes = []; this.reads = []; }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { this.reads.push(key); this.onRead?.(key); return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes.push(key); this.values.set(key, String(value)); }
  snapshot() { return JSON.stringify([...this.values.entries()].sort()); }
}
const recoveryRequired = (error) => error.code === "RECOVERY_REQUIRED";
const statusUnavailable = (error) => error.code === "RECOVERY_STATUS_UNAVAILABLE";

await test("shared journal/lock exports remain compatible; clear absent target is read-only", () => {
  assert.equal(restore.ACCOUNT_OPS_RESTORE_JOURNAL_KEY, JOURNAL);
  assert.equal(restore.ACCOUNT_OPS_RESTORE_LOCK, ACCOUNT_OPS_RESTORE_LOCK);
  const storage = new MemoryStorage(null);
  assertAccountOpsRecoveryClear(storage);
  assert.equal(readAccountOpsRecoveryGuardedRaw(storage), null);
  assert.equal(createAccountOpsRepository(storage, { now }).load().profiles.length, 0);
  assert.deepEqual(storage.writes, []);
});
for (const cached of [false, true]) for (const raw of ["", "null", "{}", "{broken", '{"phase":"PREPARED"}', '{"phase":"COMMITTED"}']) {
  await test(`${cached ? "cached" : "fresh"} repository blocks journal ${JSON.stringify(raw)}`, () => {
    const storage = new MemoryStorage(cached ? original : null);
    const repository = createAccountOpsRepository(storage, { now });
    if (cached) repository.load();
    storage.values.set(JOURNAL, raw);
    const before = storage.snapshot();
    assert.throws(() => repository.load(), recoveryRequired);
    assert.throws(() => repository.save(JSON.parse(empty)), recoveryRequired);
    assert.equal(repository.getLastError().code, "RECOVERY_REQUIRED");
    assert.equal(storage.snapshot(), before);
    assert.deepEqual(storage.writes, []);
  });
}
for (const cached of [false, true]) await test(`${cached ? "cached" : "fresh"} repository rejects unreadable journal`, () => {
  const storage = new MemoryStorage();
  const repository = createAccountOpsRepository(storage, { now });
  if (cached) repository.load();
  storage.onRead = (key) => { if (key === JOURNAL) throw new Error("Synthetic read denial"); };
  const before = storage.snapshot();
  assert.throws(() => repository.load(), statusUnavailable);
  assert.throws(() => repository.save(JSON.parse(empty)), statusUnavailable);
  assert.equal(storage.snapshot(), before);
  assert.deepEqual(storage.writes, []);
});
for (const stage of ["target-read", "pre-write", "post-read-denial"]) await test(`journal guard catches ${stage} transition without writes`, () => {
  const storage = new MemoryStorage();
  const repository = createAccountOpsRepository(storage, { now });
  let journalReads = 0;
  storage.onRead = (key) => {
    if (key === JOURNAL) journalReads += 1;
    if (stage === "target-read" && key === KEY) storage.values.set(JOURNAL, "pending");
    if (stage === "pre-write" && key === JOURNAL && journalReads === 3) storage.values.set(JOURNAL, "pending");
    if (stage === "post-read-denial" && key === JOURNAL && journalReads === 2) throw new Error("Synthetic late read denial");
  };
  assert.throws(() => stage === "pre-write" ? repository.save(JSON.parse(empty)) : repository.load(), stage === "post-read-denial" ? statusUnavailable : recoveryRequired);
  assert.equal(storage.values.get(KEY), original);
  assert.equal(storage.values.get("qa.unrelated"), "keep exact bytes");
  assert.deepEqual(storage.writes, []);
});
for (const cached of [false, true]) for (const fault of ["pending", "unreadable"]) await test(`${cached ? "cached" : "fresh"} target-read failure still checks ${fault} post-read journal`, () => {
  const storage = new MemoryStorage();
  const repository = createAccountOpsRepository(storage, { now });
  if (cached) repository.load();
  let journalReads = 0;
  storage.onRead = (key) => {
    if (key === JOURNAL) {
      journalReads += 1;
      if (journalReads === 2 && fault === "unreadable") throw new Error("Synthetic post-read journal denial");
    }
    if (key === KEY) {
      if (fault === "pending") storage.values.set(JOURNAL, "pending-after-target-failure");
      throw new Error("Synthetic target read failure");
    }
  };
  assert.throws(() => repository.load(), fault === "pending" ? recoveryRequired : statusUnavailable);
  assert.equal(journalReads, 2);
  assert.equal(repository.getLastError().code, fault === "pending" ? "RECOVERY_REQUIRED" : "RECOVERY_STATUS_UNAVAILABLE");
  assert.equal(storage.values.get(KEY), original);
  assert.equal(storage.values.get("qa.unrelated"), "keep exact bytes");
  assert.deepEqual(storage.writes, []);
});
await test("ordinary valid repository save remains synchronous and preserves unrelated storage", () => {
  const storage = new MemoryStorage(empty);
  const repository = createAccountOpsRepository(storage, { now });
  const result = repository.save(repository.load());
  assert.equal(result?.then, undefined);
  assert.equal(result.error, null);
  assert.deepEqual(storage.writes, [KEY]);
  assert.equal(storage.values.get("qa.unrelated"), "keep exact bytes");
});

const inputs = {
  profileGroups: { displayName: "QA group" }, profiles: { displayName: "QA profile" },
  emailDomains: { domain: "guard.test" }, emailAliases: { aliasAddress: "qa@guard.test", domainId: "domain:qa" },
  retailers: { displayName: "QA retailer", website: "https://example.test" },
  storeAccounts: { profileId: "profile:qa", retailerId: "retailer:qa" },
  tasks: { title: "QA task" }, activity: { type: "QA", title: "QA activity" },
};
for (const collection of ACCOUNT_OPS_COLLECTIONS) await test(`${collection} direct create/update/archive and reads cannot bypass pending journal`, async () => {
  const storage = new MemoryStorage(empty);
  let sequence = 0;
  const persistence = createAccountOpsPersistence({ storage, now, idFactory: () => `qa:${++sequence}` });
  const gateway = persistence.collections[collection];
  const existing = await gateway.create(inputs[collection]);
  storage.values.set(JOURNAL, "pending");
  storage.writes.length = 0;
  const before = storage.snapshot();
  await assert.rejects(gateway.create(inputs[collection]), recoveryRequired);
  await assert.rejects(gateway.update(existing.id, {}), recoveryRequired);
  await assert.rejects(gateway.archive(existing.id), recoveryRequired);
  await assert.rejects(gateway.list(), recoveryRequired);
  await assert.rejects(gateway.getById(existing.id), recoveryRequired);
  assert.throws(() => persistence.repository.save(JSON.parse(empty)), recoveryRequired);
  assert.equal(storage.snapshot(), before);
  assert.deepEqual(storage.writes, []);
});
await test("service reads, metadata export, mutation, activity and bulk entry points are guarded", async () => {
  const storage = new MemoryStorage();
  const service = createAccountOpsService({ storage, now });
  const profileId = service.loadSnapshot().profiles[0].id;
  storage.values.set(JOURNAL, "pending");
  const before = storage.snapshot();
  for (const read of [() => service.loadSnapshot(), () => service.snapshot(), () => service.listRetailers(), () => service.summary(), () => service.search("QA"), () => service.exportSelectedMetadata("profiles", [profileId])]) assert.throws(read, recoveryRequired);
  await assert.rejects(service.createProfileGroup({ displayName: "Blocked group" }), recoveryRequired);
  await assert.rejects(service.updateProfile(profileId, { displayName: "Blocked edit" }), recoveryRequired);
  await assert.rejects(service.createTask({ title: "Blocked task" }), recoveryRequired);
  await assert.rejects(service.bulkArchive("profiles", [profileId]), recoveryRequired);
  await assert.rejects(service.bulkCreateTasks({ targets: [{ profileId }], task: { title: "Blocked task" } }), recoveryRequired);
  assert.equal(storage.snapshot(), before);
  assert.deepEqual(storage.writes, []);
});
await test("late journal after atomic record/activity commit blocks the returned snapshot and further reads", async () => {
  const storage = new MemoryStorage(empty);
  const setItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => { setItem(key, value); if (key === KEY) storage.values.set(JOURNAL, "pending-after-record"); };
  const service = createAccountOpsService({ storage, now, idFactory: () => "qa:partial" });
  await assert.rejects(service.createProfile({ displayName: "Already durable" }), recoveryRequired);
  const saved = JSON.parse(storage.values.get(KEY));
  assert.equal(saved.profiles[0].displayName, "Already durable");
  assert.equal(saved.activity.length, 1, "record and activity now commit in the same snapshot");
  assert.deepEqual(storage.writes, [KEY]);
  assert.throws(() => service.loadSnapshot(), recoveryRequired);
});
await test("service success retains record plus activity and result snapshot contracts", async () => {
  const storage = new MemoryStorage(empty);
  let sequence = 0;
  const service = createAccountOpsService({ storage, now, idFactory: () => `qa:${++sequence}` });
  const result = await service.createProfile({ displayName: "Successful profile" });
  assert.equal(result.record.displayName, "Successful profile");
  assert.equal(result.snapshot.profiles.length, 1);
  assert.equal(result.snapshot.activity.length, 1);
  assert.deepEqual(service.loadSnapshot(), result.snapshot);
});
for (const cached of [false, true]) for (const fault of ["malformed-target", "unreadable-target"]) await test(`${cached ? "cached" : "fresh"} service rejects ${fault} instead of usable fallback`, async () => {
  const storage = new MemoryStorage();
  const service = createAccountOpsService({ storage, now });
  if (cached) service.loadSnapshot();
  if (fault === "malformed-target") storage.values.set(KEY, '{"profiles":');
  else storage.onRead = (key) => { if (key === KEY) throw new Error("Synthetic target denial"); };
  const before = storage.snapshot();
  for (const read of [() => service.loadSnapshot(), () => service.listRetailers(), () => service.summary(), () => service.search("QA")]) assert.throws(read, (error) => error.code === "LOCAL_READ_FAILED");
  await assert.rejects(service.createProfile({ displayName: "Must not write" }), (error) => error.code === "LOCAL_READ_FAILED");
  assert.equal(storage.snapshot(), before);
  assert.deepEqual(storage.writes, []);
});

const backupRegistry = BACKUP_SOURCE_REGISTRY.filter((source) => ["account-ops", "legacy-core-business"].includes(source.sourceId));
assert.equal(backupRegistry.length, 2);
for (const fault of ["pending", "empty", "read-denied", "appears-during-read"]) await test(`backup omits Account Ops and reports unavailable coverage for ${fault}`, async () => {
  const storage = new MemoryStorage();
  if (fault === "pending" || fault === "empty") storage.values.set(JOURNAL, fault === "empty" ? "" : "pending");
  if (fault === "read-denied") storage.onRead = (key) => { if (key === JOURNAL) throw new Error("Synthetic denial"); };
  if (fault === "appears-during-read") storage.onRead = (key) => { if (key === KEY) storage.values.set(JOURNAL, "late-pending"); };
  const current = readCurrentBackupSources({ localStorage: storage, sourceRegistry: backupRegistry });
  assert.equal(current.sources["account-ops"], undefined);
  assert.ok(current.sources["legacy-core-business"]);
  assert.ok(current.warnings.some((warning) => warning.sourceId === "account-ops"));
  const backup = await createVerifiedBackup({ localStorage: storage, sourceRegistry: backupRegistry, createdAt: now() });
  assert.equal(backup.backup.sections.some((section) => section.sourceId === "account-ops"), false);
  assert.ok(backup.backup.sections.some((section) => section.sourceId === "legacy-core-business"));
  assert.ok(backup.backup.manifest.excludedSources.some((source) => source.sourceId === "account-ops"));
  assert.equal(backup.coverageStatus, "FAILED");
  assert.equal(backup.verified, false);
  assert.equal(storage.values.get(KEY), original);
  assert.equal(storage.values.get("qa.unrelated"), "keep exact bytes");
  assert.deepEqual(storage.writes, []);
});
await test("clear backup still includes Account Ops and excludes recovery journal bytes", async () => {
  const storage = new MemoryStorage();
  const backup = await createVerifiedBackup({ localStorage: storage, sourceRegistry: backupRegistry, createdAt: now() });
  assert.equal(backup.verified, true);
  assert.equal(backup.backup.sections.find((section) => section.sourceId === "account-ops").data.profiles[0].displayName, JSON.parse(original).profiles[0].displayName);
  assert.equal(backup.json.includes(JOURNAL), false);
  assert.deepEqual(storage.writes, []);
});

async function browserChecks() {
  const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217");
  assert.ok(["127.0.0.1", "localhost"].includes(base.hostname), "Synthetic QA must use a local server");
  const browser = await chromium.launch({ headless: true });
  const captures = [];
  async function contextFor(width, theme, journal = null, denyJournal = false, targetRaw = original) {
    const context = await browser.newContext({ viewport: { width, height: width === 360 ? 800 : 1000 }, colorScheme: theme });
    await context.route("**/*", (route) => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
    await context.addInitScript(({ KEY, JOURNAL, original, journal, denyJournal }) => {
      const rawGet = Storage.prototype.getItem;
      const rawSet = Storage.prototype.setItem;
      rawSet.call(localStorage, KEY, original);
      rawSet.call(localStorage, "qa.unrelated", "keep exact bytes");
      if (journal !== null) rawSet.call(localStorage, JOURNAL, journal);
      window.__guardPrivateWrites = [];
      window.__guardPrivateReads = [];
      Storage.prototype.getItem = function (key) {
        if ([KEY, JOURNAL, "qa.unrelated"].includes(key)) window.__guardPrivateReads.push(key);
        if (denyJournal && key === JOURNAL) throw new DOMException("Synthetic journal denial", "SecurityError");
        return rawGet.call(this, key);
      };
      Storage.prototype.setItem = function (key, value) {
        if ([KEY, JOURNAL, "qa.unrelated"].includes(key)) window.__guardPrivateWrites.push(key);
        return rawSet.call(this, key, value);
      };
    }, { KEY, JOURNAL, original: targetRaw, journal, denyJournal });
    return context;
  }
  function url(theme) { return `${base.origin}/account-ops/profiles?betaLocalMode=true&themeInspect=${theme}`; }
  async function evidence(page, name) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "No horizontal overflow");
    const filename = `${name}.png`;
    await page.screenshot({ path: path.join(artifacts, filename), fullPage: true });
    captures.push(filename);
  }
  async function unchanged(page, expected = original) {
    const state = await page.evaluate(({ KEY, JOURNAL }) => ({ target: localStorage.getItem(KEY), unrelated: localStorage.getItem("qa.unrelated"), writes: window.__guardPrivateWrites, journal: localStorage.getItem(JOURNAL) }), { KEY, JOURNAL });
    assert.equal(state.target, expected);
    assert.equal(state.unrelated, "keep exact bytes");
    assert.deepEqual(state.writes, []);
  }
  try {
    for (const [width, theme] of [[360, "light"], [1440, "dark"]]) {
      await test(`native ${theme}-${width} pending startup stays blocked after clear until explicit reload`, async () => {
        const context = await contextFor(width, theme, "synthetic-pending");
        const page = await context.newPage();
        const errors = []; page.on("pageerror", (error) => errors.push(error.message));
        try {
          await page.goto(url(theme));
          await page.getByRole("heading", { name: "Account Ops recovery required", exact: true }).waitFor();
          assert.equal(await page.getByRole("button", { name: "Create Profile", exact: true }).count(), 0);
          await unchanged(page);
          await evidence(page, `pending-${theme}-${width}`);
          const peer = await context.newPage();
          await peer.route("**/__guard-peer", (route) => route.fulfill({ contentType: "text/html", body: "<title>Synthetic peer</title>" }));
          await peer.goto(`${base.origin}/__guard-peer`);
          const replacement = JSON.parse(original); replacement.profiles[0].displayName = "Fresh recovered synthetic profile";
          await peer.evaluate(({ KEY, JOURNAL, replacement }) => { localStorage.setItem(KEY, replacement); localStorage.removeItem(JOURNAL); }, { KEY, JOURNAL, replacement: JSON.stringify(replacement) });
          await page.waitForTimeout(150);
          assert.equal(await page.getByRole("heading", { name: "Account Ops recovery required", exact: true }).isVisible(), true);
          await page.getByRole("button", { name: "Reload Account Ops", exact: true }).click();
          await page.getByRole("heading", { name: "Profiles", exact: true }).waitFor();
          assert.ok((await page.locator(".account-ops").innerText()).includes("Fresh recovered synthetic profile"));
          await unchanged(page, JSON.stringify(replacement));
          await evidence(page, `reloaded-${theme}-${width}`);
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      });
      await test(`native ${theme}-${width} cross-tab journal and simultaneous filter update reach handled error`, async () => {
        const context = await contextFor(width, theme);
        const page = await context.newPage();
        const errors = []; page.on("pageerror", (error) => errors.push(error.message));
        try {
          await page.goto(url(theme));
          await page.getByRole("heading", { name: "Profiles", exact: true }).waitFor();
          const peer = await context.newPage();
          await peer.route("**/__guard-peer", (route) => route.fulfill({ contentType: "text/html", body: "<title>Synthetic peer</title>" }));
          await peer.goto(`${base.origin}/__guard-peer`);
          await peer.evaluate((JOURNAL) => localStorage.setItem(JOURNAL, "cross-tab-pending"), JOURNAL);
          await page.getByRole("heading", { name: "Account Ops recovery required", exact: true }).waitFor();
          await unchanged(page);
          await evidence(page, `cross-tab-${theme}-${width}`);
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
        // Same-document changes do not emit native storage events. Deliver both
        // events in one turn to force search recomputation beside the guard.
        const batched = await contextFor(width, theme);
        const batchedPage = await batched.newPage();
        const batchedErrors = []; batchedPage.on("pageerror", (error) => batchedErrors.push(error.message));
        try {
          await batchedPage.goto(url(theme));
          await batchedPage.getByRole("heading", { name: "Profiles", exact: true }).waitFor();
          await batchedPage.evaluate((JOURNAL) => {
            localStorage.setItem(JOURNAL, "batched-pending");
            window.__guardPrivateWrites = [];
            const input = document.querySelector('.account-ops input[type="search"]');
            if (!input) throw new Error("Expected Account Ops search field");
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "QA");
            input.dispatchEvent(new Event("input", { bubbles: true }));
            window.dispatchEvent(new StorageEvent("storage", { key: JOURNAL, newValue: "batched-pending", storageArea: localStorage }));
          }, JOURNAL);
          await batchedPage.getByRole("heading", { name: "Account Ops recovery required", exact: true }).waitFor();
          await unchanged(batchedPage);
          assert.deepEqual(batchedErrors, []);
        } finally { await batched.close(); }
      });
    }
    await test("native unreadable journal renders handled unavailable state without private writes", async () => {
      const context = await contextFor(360, "light", null, true);
      const page = await context.newPage(); const errors = []; page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.goto(url("light"));
        await page.getByRole("heading", { name: "Account Ops unavailable", exact: true }).waitFor();
        assert.deepEqual(await page.evaluate(() => window.__guardPrivateWrites), []);
        assert.equal(await page.evaluate((KEY) => localStorage.getItem(KEY), KEY), original);
        await evidence(page, "unavailable-light-360");
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
    await test("native rapid peer journal set/remove latches; sessionStorage and unproven event history do not", async () => {
      const context = await contextFor(1440, "dark");
      const page = await context.newPage(); const errors = []; page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.goto(url("dark"));
        await page.getByRole("heading", { name: "Profiles", exact: true }).waitFor();
        await page.evaluate((JOURNAL) => {
          window.dispatchEvent(new StorageEvent("storage", { key: JOURNAL, newValue: "session-only", storageArea: sessionStorage }));
          window.dispatchEvent(new StorageEvent("storage", { key: JOURNAL, newValue: "unproven-history" }));
        }, JOURNAL);
        await page.waitForTimeout(100);
        assert.equal(await page.getByRole("heading", { name: "Profiles", exact: true }).isVisible(), true);
        const peer = await context.newPage();
        await peer.route("**/__guard-peer", (route) => route.fulfill({ contentType: "text/html", body: "<title>Synthetic peer</title>" }));
        await peer.goto(`${base.origin}/__guard-peer`);
        await peer.evaluate((JOURNAL) => { localStorage.setItem(JOURNAL, "briefly-pending"); localStorage.removeItem(JOURNAL); }, JOURNAL);
        await page.getByRole("heading", { name: "Account Ops recovery required", exact: true }).waitFor();
        assert.equal(await page.evaluate((JOURNAL) => localStorage.getItem(JOURNAL), JOURNAL), null);
        await unchanged(page);
        await page.getByRole("button", { name: "Reload Account Ops", exact: true }).click();
        await page.getByRole("heading", { name: "Profiles", exact: true }).waitFor();
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
    await test("native corrupt target boot preserves bytes and requires explicit reload after external correction", async () => {
      const corrupt = '{"profiles":';
      const context = await contextFor(360, "light", null, false, corrupt);
      const page = await context.newPage(); const errors = []; page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.goto(url("light"));
        await page.getByRole("heading", { name: "Account Ops unavailable", exact: true }).waitFor();
        await unchanged(page, corrupt);
        await evidence(page, "corrupt-target-light-360");
        const peer = await context.newPage();
        await peer.route("**/__guard-peer", (route) => route.fulfill({ contentType: "text/html", body: "<title>Synthetic peer</title>" }));
        await peer.goto(`${base.origin}/__guard-peer`);
        await peer.evaluate(({ KEY, original }) => localStorage.setItem(KEY, original), { KEY, original });
        await page.waitForTimeout(100);
        assert.equal(await page.getByRole("heading", { name: "Account Ops unavailable", exact: true }).isVisible(), true);
        await page.getByRole("button", { name: "Reload Account Ops", exact: true }).click();
        await page.getByRole("heading", { name: "Profiles", exact: true }).waitFor();
        await unchanged(page);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
    await test("native pending journal before Save Profile preserves bytes and reaches handled error", async () => {
      const context = await contextFor(360, "light");
      const page = await context.newPage(); const errors = []; page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.goto(url("light"));
        await page.getByRole("heading", { name: "Profiles", exact: true }).waitFor();
        await page.getByRole("button", { name: "Create Profile", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("Display name", { exact: true }).fill("Unsaved synthetic profile");
        await page.evaluate((JOURNAL) => { localStorage.setItem(JOURNAL, "pending-before-save"); window.__guardPrivateWrites = []; }, JOURNAL);
        await dialog.getByRole("button", { name: "Save Profile", exact: true }).click();
        await page.getByRole("heading", { name: "Account Ops recovery required", exact: true }).waitFor();
        await unchanged(page);
        assert.equal(await page.getByRole("dialog").count(), 0);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
    await test("actual denied AccountOpsPage states never read or write private storage", async () => {
      const context = await contextFor(1440, "dark", "private-pending");
      const page = await context.newPage(); const errors = []; page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.route("**/__guard-denied", (route) => route.fulfill({ contentType: "text/html", body: '<html><body><div id="root"></div></body></html>' }));
        await page.goto(`${base.origin}/__guard-denied`);
        await page.evaluate(async () => {
          const { default: refreshRuntime } = await import("/@react-refresh");
          refreshRuntime.injectIntoGlobalHook(window);
          window.$RefreshReg$ = () => {};
          window.$RefreshSig$ = () => (type) => type;
          window.__vite_plugin_react_preamble_installed__ = true;
          const reactModule = await import("/node_modules/.vite/deps/react.js");
          const clientModule = await import("/node_modules/.vite/deps/react-dom_client.js");
          const React = reactModule.default || reactModule;
          const { createRoot } = clientModule.default || clientModule;
          const { default: AccountOpsPage } = await import("/src/features/accountOps/AccountOpsPage.jsx");
          window.__guardRender = (status) => window.__guardRoot.render(React.createElement(AccountOpsPage, { session: { status } }));
          window.__guardRoot = createRoot(document.getElementById("root"));
          window.__guardPrivateReads = []; window.__guardPrivateWrites = [];
          window.__guardRender("sign_in_required");
        });
        for (const [status, title] of [["sign_in_required", "Sign In Required"], ["owner_access_required", "Owner Access Required"], ["unavailable", "Owner access unavailable"]]) {
          await page.evaluate((status) => window.__guardRender(status), status);
          await page.getByRole("heading", { name: title, exact: true }).waitFor();
          assert.deepEqual(await page.evaluate(() => ({ reads: window.__guardPrivateReads, writes: window.__guardPrivateWrites })), { reads: [], writes: [] });
        }
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  } finally {
    fs.writeFileSync(path.join(artifacts, "captures.json"), JSON.stringify(captures, null, 2));
    await browser.close();
  }
}
if (!process.argv.includes("--unit-only")) await browserChecks();
console.log(`Account Ops recovery guards passed: ${results.length} scenarios. This verifies recovery gates, not writer locking, automatic recovery, reauthentication, or restore Apply.`);
