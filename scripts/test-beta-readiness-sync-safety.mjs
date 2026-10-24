import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createEmptyBetaReadinessData, saveBetaReadinessData } from "../src/services/betaReadinessService.js";
import { createEmptyPhase2Data, saveAppPreferences, saveLocalPhase2Data } from "../src/services/phase2Persistence.js";
import { hashCanonicalJson } from "../src/features/backup/canonicalJson.js";
import { findProhibitedData } from "../src/features/backup/backupSecurity.js";
import { getBackupSource } from "../src/features/backup/backupSourceRegistry.js";
import { createVerifiedBackup } from "../src/features/backup/backupFormat.js";
import { createVerifiedWorkspaceSnapshotBackup, planWorkspaceRestore } from "../src/features/backup/workspaceRestorePlan.js";
import { projectSourceData } from "../src/features/backup/sourceProjection.js";
import { applyWorkspaceSources, captureRecoverySources, recoverWorkspaceSources, WORKSPACE_RECOVERY_KEY } from "../src/features/backup/workspaceRecovery.js";
import { captureWorkspaceSources, validateWorkspaceSources } from "../src/features/persistence/cloudWorkspaceSources.js";
import { createCloudWorkspaceSync, createSupabaseWorkspaceTransport } from "../src/features/persistence/cloudWorkspaceSync.js";
import { claimWorkspaceOwner } from "../src/features/persistence/workspaceOwnerBinding.js";
import { preserveWorkspaceConflictCopy, readWorkspaceConflictCopy } from "../src/features/persistence/cloudWorkspaceRecoveryCopies.js";

const betaKey = "et-tcg-beta-readiness";
const sourceId = "beta-readiness-records";
const coreKey = "et-tcg-beta-data";
const ownerId = "11111111-1111-4111-8111-111111111111";
const locks = { request: async (_name, _options, callback) => callback({ name: "synthetic-exclusive" }) };
const logs = label => [{ id: `app-error-${label}`, action: "synthetic_unavailable_resource", errorMessage: "Synthetic unavailable catalog", metadata: { password: `synthetic-private-${label}` }, createdAt: "2026-10-23T12:00:00.000Z" }];
const beta = label => ({ ...createEmptyBetaReadinessData(), appErrorLogs: logs(label) });
const core = () => ({ items: [{ id: "existing-item", name: "Keep existing", quantity: 2, marketValue: 42.75 }], catalogProducts: [{ id: "existing-catalog", name: "Keep current catalog", marketPrice: 88.5 }] });
class Storage {
  constructor(values = {}) { this.values = new Map(Object.entries(values).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])); this.failRemove = false; }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { if (this.failRemove && key === WORKSPACE_RECOVERY_KEY) throw new Error("synthetic cleanup unavailable"); this.values.delete(key); }
}
const envelope = data => ({ [sourceId]: { schemaVersion: 0, data } });
let checks = 0;
async function check(name, run) { await run(); checks++; console.log(`PASS ${name}`); }
function withDeviceStorage(storage, run) {
  const original = globalThis.localStorage;
  globalThis.localStorage = storage;
  try { return run(); }
  finally { if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original; }
}

await check("actual default readiness plus startup diagnostic keys sync without rewriting original bytes", () => {
  const readiness = beta("capture");
  const raw = JSON.stringify(readiness, null, 2);
  assert.ok(findProhibitedData(readiness).some(match => match.path === "$.appErrorLogs[0].errorMessage"));
  const storage = new Storage({ [betaKey]: raw, [coreKey]: core() });
  const captured = captureWorkspaceSources(storage);
  assert.equal(Object.hasOwn(captured[sourceId].data, "appErrorLogs"), false);
  assert.deepEqual(captured[sourceId].data, projectSourceData(sourceId, readiness));
  assert.equal(captured["legacy-core-business"].data.items[0].marketValue, 42.75);
  assert.equal(storage.getItem(betaKey), raw);
});

await check("the actual readiness saver keeps diagnostic-only writes from creating business timestamps", () => {
  for (const timestamp of [undefined, "2026-10-23T12:00:00.000Z"]) {
    const readiness = { ...beta("service"), ...(timestamp ? { updatedAt: timestamp } : {}) };
    const storage = new Storage({ [betaKey]: readiness, [coreKey]: core() });
    const before = captureWorkspaceSources(storage);
    const result = withDeviceStorage(storage, () => saveBetaReadinessData(current => ({
      ...current, appErrorLogs: [...logs("actual-log-updater"), ...current.appErrorLogs],
    })));
    assert.deepEqual(captureWorkspaceSources(storage), before);
    assert.equal(result.updatedAt, timestamp);
    assert.deepEqual(result.appErrorLogs, [...logs("actual-log-updater"), ...readiness.appErrorLogs]);
    const changed = withDeviceStorage(storage, () => saveBetaReadinessData(current => ({
      ...current, onboarding: { ...current.onboarding, preferences: ["Real business setting"] },
    })));
    assert.ok(Number.isFinite(Date.parse(changed.updatedAt)));
    assert.notEqual(changed.updatedAt, timestamp);
    assert.deepEqual(changed.onboarding.preferences, ["Real business setting"]);
    assert.deepEqual(changed.appErrorLogs, result.appErrorLogs);
    assert.deepEqual(JSON.parse(storage.getItem(coreKey)), core());
    storage.setItem(betaKey, JSON.stringify(readiness));
    const mutated = withDeviceStorage(storage, () => saveBetaReadinessData(current => {
      current.onboarding.preferences = ["Mutating business update"];
      return current;
    }));
    assert.notEqual(mutated.updatedAt, timestamp);
    assert.deepEqual(JSON.parse(storage.getItem(betaKey)).onboarding.preferences, ["Mutating business update"]);
  }
});

await check("actual dashboard preference re-saves preserve bytes and timestamps while changed values advance them", async () => {
  const key = "et-tcg-phase2-data";
  const preferences = { dashboardPreset: "collector", enabledHomeCards: { collection: true, restocks: true }, defaultVisibility: "private" };
  const initial = { ...createEmptyPhase2Data(), appPreferences: preferences, updatedAt: "2026-10-23T12:00:00.000Z" };
  const storage = new Storage({ [key]: JSON.stringify(initial, null, 2), [coreKey]: core() });
  const original = storage.getItem(key); const captured = captureWorkspaceSources(storage);
  for (let index = 0; index < 3; index++) {
    const result = await withDeviceStorage(storage, () => saveAppPreferences({}, preferences));
    assert.equal(result.source, "local");
    assert.equal(storage.getItem(key), original);
    assert.deepEqual(captureWorkspaceSources(storage), captured);
  }
  withDeviceStorage(storage, () => saveLocalPhase2Data(current => ({ ...current, appPreferences: { defaultVisibility: "private", enabledHomeCards: { restocks: true, collection: true }, dashboardPreset: "collector" } })));
  assert.equal(storage.getItem(key), original, "object-key order is not a business edit");
  await withDeviceStorage(storage, () => saveAppPreferences({}, { dashboardPreset: "restock_scout" }));
  const changed = JSON.parse(storage.getItem(key));
  assert.equal(changed.appPreferences.dashboardPreset, "restock_scout");
  assert.notEqual(changed.updatedAt, initial.updatedAt);
  assert.deepEqual(JSON.parse(storage.getItem(coreKey)), core());
  storage.setItem(key, original);
  const mutated = withDeviceStorage(storage, () => saveLocalPhase2Data(current => {
    current.appPreferences.dashboardPreset = "seller";
    return current;
  }));
  assert.notEqual(mutated.updatedAt, initial.updatedAt);
  assert.equal(JSON.parse(storage.getItem(key)).appPreferences.dashboardPreset, "seller");
  storage.setItem(key, "{invalid json");
  assert.throws(() => withDeviceStorage(storage, () => saveLocalPhase2Data({ appPreferences: preferences })));
  assert.equal(storage.getItem(key), "{invalid json");
});

await check("dashboard debounce no-ops during review are accepted but actual preference edits still block Apply", async () => {
  const key = "et-tcg-phase2-data"; const id = "phase2-local-fallback";
  const preferences = { dashboardPreset: "collector", defaultVisibility: "private" };
  const storage = new Storage({ [key]: { ...createEmptyPhase2Data(), appPreferences: preferences, updatedAt: "2026-10-23T12:00:00.000Z" }, [coreKey]: core() });
  await claimWorkspaceOwner({ storage, ownerId, confirmed: true, locks });
  let state = { format: "code3-workspace-v1", revision: 0, sources: {}, updatedAt: null };
  const remote = { authorize: async () => {}, read: async () => structuredClone(state), async write({ expectedRevision, sources }) { assert.equal(expectedRevision, state.revision); state = { ...state, revision: state.revision + 1, sources: structuredClone(sources), updatedAt: "2026-10-23T12:00:00Z" }; return this.read(); } };
  const sync = createCloudWorkspaceSync({ storage, ownerId, transport: remote, locks, applySources: applyWorkspaceSources, idFactory: randomUUID });
  assert.equal((await sync.sync({ allowApply: true })).status, "SYNCED");
  await withDeviceStorage(storage, () => saveAppPreferences({}, { dashboardPreset: "seller" }));
  state.sources[id].data.appPreferences.dashboardPreset = "restock_scout"; state.revision++;
  assert.equal((await sync.sync()).status, "CONFLICT");
  const review = await sync.previewConflicts();
  for (let index = 0; index < 3; index++) await withDeviceStorage(storage, () => saveAppPreferences({}, { ...preferences, dashboardPreset: "seller" }));
  assert.equal((await sync.resolveConflicts({ reviewId: review.reviewId, confirmed: true, choices: { [id]: "CLOUD" } })).status, "SYNCED");
  assert.equal(JSON.parse(storage.getItem(key)).appPreferences.dashboardPreset, "restock_scout");
  await withDeviceStorage(storage, () => saveAppPreferences({}, { dashboardPreset: "seller" }));
  state.sources[id].data.appPreferences.dashboardPreset = "collector"; state.revision++;
  assert.equal((await sync.sync()).status, "CONFLICT");
  const staleReview = await sync.previewConflicts();
  await withDeviceStorage(storage, () => saveAppPreferences({}, { defaultVisibility: "workspace" }));
  const original = storage.getItem(key); const remoteRevision = state.revision;
  await assert.rejects(sync.resolveConflicts({ reviewId: staleReview.reviewId, confirmed: true, choices: { [id]: "CLOUD" } }), { code: "STALE_CONFLICT_REVIEW" });
  assert.equal(storage.getItem(key), original); assert.equal(state.revision, remoteRevision);
  assert.deepEqual(JSON.parse(storage.getItem(coreKey)), core()); sync.close();
});

await check("arbitrary error messages, credentials and payment values outside the one diagnostic source field remain blocked", () => {
  for (const patch of [
    { errorMessage: "Arbitrary raw content" },
    { password: "synthetic-private-root" },
    { onboarding: { errorMessage: "Nested raw content" } },
    { onboarding: { notes: "4111111111111111" } },
    { readiness: { appErrorLogs: logs("nested") } },
  ]) assert.throws(() => captureWorkspaceSources(new Storage({ [betaKey]: { ...beta("strict"), ...patch } })), { code: "SECURITY_REVIEW_REQUIRED" });
  assert.throws(() => captureWorkspaceSources(new Storage({ "et-tcg-beta-scout": { reports: [{ id: "report", appErrorLogs: logs("other-source") }] } })), { code: "SECURITY_REVIEW_REQUIRED" });
  assert.ok(findProhibitedData({ errorMessage: "Still prohibited" }).length);
  assert.equal(Object.hasOwn(projectSourceData("legacy-restock-scout", { appErrorLogs: logs("other") }), "appErrorLogs"), true);
});

await check("legacy remote diagnostic payloads are omitted from a copy and cannot relax any other validation", () => {
  const original = envelope(beta("remote"));
  const before = JSON.stringify(original);
  const checked = validateWorkspaceSources(original);
  assert.equal(Object.hasOwn(checked[sourceId].data, "appErrorLogs"), false);
  assert.equal(JSON.stringify(original), before);
  assert.throws(() => validateWorkspaceSources(envelope({ ...beta("remote"), apiKey: "synthetic-root-key" })), { code: "SECURITY_REVIEW_REQUIRED" });
});

await check("production transport sends the projected copy and keeps its account/session safeguards", async () => {
  const calls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: ownerId }, access_token: "synthetic-owner-token" } } }), getUser: async () => ({ data: { user: { id: ownerId } } }) },
    rpc(name, args) {
      calls.push({ name, args });
      return { setHeader() { return this; }, abortSignal() { return this; }, then(resolve) { return Promise.resolve({ data: { format: "code3-workspace-v1", revision: 1, updatedAt: "2026-10-23T12:00:00Z", sources: args.p_sources } }).then(resolve); } };
    },
  };
  const original = envelope(beta("transport")); const before = JSON.stringify(original);
  const transport = createSupabaseWorkspaceTransport({ client, ownerId });
  const saved = await transport.write({ expectedRevision: 0, mutationId: randomUUID(), sources: original });
  assert.equal(calls.length, 1); assert.equal(calls[0].name, "code3_workspace_write");
  assert.equal(Object.hasOwn(calls[0].args.p_sources[sourceId].data, "appErrorLogs"), false);
  assert.equal(Object.hasOwn(saved.sources[sourceId].data, "appErrorLogs"), false);
  assert.equal(JSON.stringify(original), before); transport.close();
});

await check("two devices hydrate reverse edits and preserve their own diagnostics, item IDs and latest value fields", async () => {
  const state = { revision: 0, sources: {}, updatedAt: null };
  const remote = {
    authorize: async () => {},
    read: async () => structuredClone({ format: "code3-workspace-v1", ...state }),
    async write({ expectedRevision, sources }) { assert.equal(expectedRevision, state.revision); state.revision++; state.sources = structuredClone(sources); state.updatedAt = "2026-10-23T12:00:00Z"; return this.read(); },
  };
  async function device(label, includeCore) {
    const storage = new Storage({ [betaKey]: beta(label), ...(includeCore ? { [coreKey]: core() } : {}) });
    await claimWorkspaceOwner({ storage, ownerId, confirmed: true, locks });
    return { storage, sync: createCloudWorkspaceSync({ storage, ownerId, transport: remote, locks, applySources: applyWorkspaceSources, idFactory: randomUUID }) };
  }
  const a = await device("phone", true), b = await device("computer", false);
  const aLogs = logs("phone"), bLogs = logs("computer");
  assert.equal((await a.sync.sync({ allowApply: true })).status, "SYNCED");
  assert.equal((await b.sync.sync({ allowApply: true })).status, "SYNCED");
  const changed = JSON.parse(a.storage.getItem(betaKey)); changed.onboarding.preferences = ["Collector"]; a.storage.setItem(betaKey, JSON.stringify(changed));
  await a.sync.sync({ allowApply: true }); await b.sync.sync({ allowApply: true });
  assert.deepEqual(JSON.parse(b.storage.getItem(betaKey)).onboarding.preferences, ["Collector"]);
  const reverse = JSON.parse(b.storage.getItem(betaKey)); reverse.notificationPreferences.quiet_hours_enabled = true; b.storage.setItem(betaKey, JSON.stringify(reverse));
  await b.sync.sync({ allowApply: true }); assert.equal((await a.sync.sync({ allowApply: true })).status, "SYNCED");
  assert.equal(JSON.parse(a.storage.getItem(betaKey)).notificationPreferences.quiet_hours_enabled, true);
  assert.deepEqual(JSON.parse(a.storage.getItem(betaKey)).appErrorLogs, aLogs);
  assert.deepEqual(JSON.parse(b.storage.getItem(betaKey)).appErrorLogs, bLogs);
  assert.deepEqual(JSON.parse(a.storage.getItem(coreKey)), core()); assert.deepEqual(JSON.parse(b.storage.getItem(coreKey)), core());
  assert.equal(Object.hasOwn(state.sources[sourceId].data, "appErrorLogs"), false);
  const revision = state.revision; const diagnostic = JSON.parse(a.storage.getItem(betaKey)); diagnostic.appErrorLogs.push(...logs("new-local-error")); a.storage.setItem(betaKey, JSON.stringify(diagnostic));
  assert.equal((await a.sync.sync({ allowApply: true })).status, "SYNCED"); assert.equal(state.revision, revision, "device-only diagnostics do not create cloud mutations");
  const ours = JSON.parse(a.storage.getItem(betaKey)); ours.onboarding.preferences = ["Phone conflict"]; a.storage.setItem(betaKey, JSON.stringify(ours));
  const theirs = JSON.parse(b.storage.getItem(betaKey)); theirs.onboarding.preferences = ["Computer conflict"]; b.storage.setItem(betaKey, JSON.stringify(theirs));
  await b.sync.sync({ allowApply: true }); assert.equal((await a.sync.sync()).status, "CONFLICT");
  const review = await a.sync.previewConflicts();
  const duringReview = withDeviceStorage(a.storage, () => saveBetaReadinessData(current => ({
    ...current, appErrorLogs: [...logs("background-error-during-review"), ...current.appErrorLogs],
  })));
  assert.equal((await a.sync.resolveConflicts({ reviewId: review.reviewId, confirmed: true, choices: { [sourceId]: "CLOUD" } })).status, "SYNCED");
  assert.deepEqual(JSON.parse(a.storage.getItem(betaKey)).onboarding.preferences, ["Computer conflict"]);
  assert.deepEqual(JSON.parse(a.storage.getItem(betaKey)).appErrorLogs, duringReview.appErrorLogs);
  const copies = await a.sync.listDeviceRecoveryCopies(); assert.equal(copies.length, 1);
  const preserved = await a.sync.readDeviceRecoveryCopy(copies[0].copyId);
  assert.deepEqual(preserved.sources[sourceId].data.onboarding.preferences, ["Phone conflict"]);
  assert.equal(Object.hasOwn(preserved.sources[sourceId].data, "appErrorLogs"), false);
  assert.deepEqual(JSON.parse(a.storage.getItem(coreKey)), core());
  const staleLocal = JSON.parse(a.storage.getItem(betaKey)); staleLocal.onboarding.preferences = ["Second device conflict"]; a.storage.setItem(betaKey, JSON.stringify(staleLocal));
  const staleRemote = JSON.parse(b.storage.getItem(betaKey)); staleRemote.onboarding.preferences = ["Second cloud conflict"]; b.storage.setItem(betaKey, JSON.stringify(staleRemote));
  await b.sync.sync({ allowApply: true }); assert.equal((await a.sync.sync()).status, "CONFLICT");
  const staleReview = await a.sync.previewConflicts();
  const pendingBusinessEdit = withDeviceStorage(a.storage, () => saveBetaReadinessData(current => ({
    ...current, notificationPreferences: { ...current.notificationPreferences, quiet_hours_enabled: false },
  })));
  const untouchedRemoteRevision = state.revision;
  await assert.rejects(a.sync.resolveConflicts({ reviewId: staleReview.reviewId, confirmed: true, choices: { [sourceId]: "CLOUD" } }), { code: "STALE_CONFLICT_REVIEW" });
  assert.equal(state.revision, untouchedRemoteRevision);
  assert.deepEqual(JSON.parse(a.storage.getItem(betaKey)), pendingBusinessEdit);
  assert.deepEqual(JSON.parse(a.storage.getItem(coreKey)), core());
  a.sync.close(); b.sync.close();
});

await check("direct hydration and conflict safety copies cannot replace or inject device diagnostic records", async () => {
  const storage = new Storage({ [betaKey]: beta("local"), [coreKey]: core() });
  const expectedSources = captureRecoverySources(storage); const incoming = structuredClone(expectedSources);
  incoming[sourceId].data.onboarding.preferences = ["Imported setting"];
  incoming[sourceId].data.appErrorLogs = logs("remote-injection");
  await applyWorkspaceSources({ storage, expectedSources, nextSources: incoming, ownerId, locks });
  assert.deepEqual(JSON.parse(storage.getItem(betaKey)).appErrorLogs, logs("local"));
  assert.deepEqual(JSON.parse(storage.getItem(coreKey)), core());
  const payloads = new Map(); const payloadStore = { async put(key, value) { payloads.set(key, value); }, async get(key) { return payloads.get(key) ?? null; } };
  const copyId = randomUUID();
  await preserveWorkspaceConflictCopy({ storage, ownerId, copyId, sources: envelope(beta("copy")), cloudRevision: 2, payloadStore });
  const copy = await readWorkspaceConflictCopy({ storage, ownerId, copyId, payloadStore });
  assert.equal(Object.hasOwn(copy.sources[sourceId].data, "appErrorLogs"), false);
  assert.ok([...payloads.values()].every(value => !value.includes("appErrorLogs")));
  const oldCopyId = randomUUID();
  const oldPayload = { format: "code3-workspace-conflict-copy", version: 1, ownerId, copyId: oldCopyId, createdAt: "2026-10-23T12:00:00Z", cloudRevision: 1, sources: envelope(beta("old-copy")) };
  const oldRaw = JSON.stringify({ ...oldPayload, hash: await hashCanonicalJson(oldPayload) });
  const oldKey = `code3.workspace-conflict-copy.v1:${ownerId}:${oldCopyId}`; storage.setItem(oldKey, oldRaw);
  const oldCopy = await readWorkspaceConflictCopy({ storage, ownerId, copyId: oldCopyId, payloadStore });
  assert.equal(Object.hasOwn(oldCopy.sources[sourceId].data, "appErrorLogs"), false);
  assert.equal(storage.getItem(oldKey), oldRaw, "reading a historical copy cannot rewrite its original bytes");
  const empty = new Storage();
  await applyWorkspaceSources({ storage: empty, expectedSources: {}, nextSources: incoming, ownerId, locks });
  assert.equal(Object.hasOwn(JSON.parse(empty.getItem(betaKey)), "appErrorLogs"), false);
});

await check("verified backup coverage stays intact while restore and cloud-revision export keep diagnostics device-local", async () => {
  const source = getBackupSource(sourceId); const incoming = new Storage({ [betaKey]: beta("backup") });
  const raw = incoming.getItem(betaKey);
  const backup = await createVerifiedBackup({ localStorage: incoming, sourceRegistry: [source] });
  assert.equal(backup.verified, true); assert.equal(incoming.getItem(betaKey), raw);
  const exported = backup.backup.sections.find(section => section.sourceId === sourceId).data;
  assert.equal(exported.appErrorLogs.length, 1); assert.equal(exported.appErrorLogs[0].id, "app-error-backup");
  assert.equal(Object.hasOwn(exported.appErrorLogs[0], "errorMessage"), false);
  const current = new Storage({ [betaKey]: beta("current"), [coreKey]: core() });
  const restore = await planWorkspaceRestore(backup.json, { storage: current });
  assert.equal(Object.hasOwn(restore.nextSources[sourceId].data, "appErrorLogs"), false);
  await applyWorkspaceSources({ storage: current, ...restore, ownerId, locks });
  assert.deepEqual(JSON.parse(current.getItem(betaKey)).appErrorLogs, logs("current"));
  assert.deepEqual(JSON.parse(current.getItem(coreKey)), core());
  const cloud = await createVerifiedWorkspaceSnapshotBackup(envelope(beta("cloud-revision")));
  assert.equal(Object.hasOwn(cloud.backup.sections[0].data, "appErrorLogs"), false);
});

await check("interrupted checkpoint recovery preserves local diagnostic text and all business records", async () => {
  const storage = new Storage({ [betaKey]: beta("checkpoint"), [coreKey]: core() });
  const expectedSources = captureRecoverySources(storage); const nextSources = structuredClone(expectedSources);
  nextSources[sourceId].data.onboarding.preferences = ["Saved before interruption"];
  storage.failRemove = true;
  await assert.rejects(applyWorkspaceSources({ storage, expectedSources, nextSources, ownerId, locks }));
  assert.ok(storage.getItem(WORKSPACE_RECOVERY_KEY));
  assert.equal(storage.getItem(WORKSPACE_RECOVERY_KEY).includes("Synthetic unavailable catalog"), false);
  const legacyJournal = JSON.parse(storage.getItem(WORKSPACE_RECOVERY_KEY));
  delete legacyJournal.integrity;
  for (const entry of legacyJournal.entries.filter(entry => entry.sourceId === sourceId)) {
    entry.beforeValue.appErrorLogs = [{ id: "historical-device-log", action: "old-safe-diagnostic" }];
    entry.afterValue.appErrorLogs = [{ id: "historical-device-log", action: "old-safe-diagnostic" }];
  }
  storage.setItem(WORKSPACE_RECOVERY_KEY, JSON.stringify({ ...legacyJournal, integrity: await hashCanonicalJson(legacyJournal) }));
  storage.failRemove = false;
  assert.equal((await recoverWorkspaceSources({ storage, ownerId, locks })).status, "RECOVERED_COMMIT");
  assert.deepEqual(JSON.parse(storage.getItem(betaKey)).appErrorLogs, logs("checkpoint"));
  assert.deepEqual(JSON.parse(storage.getItem(coreKey)), core());
});
console.log(`Beta readiness sync safety: ${checks} groups passed; synthetic storage/transports only, no live requests.`);
