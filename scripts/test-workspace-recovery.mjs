import assert from "node:assert/strict";
import { createVerifiedBackup } from "../src/features/backup/backupFormat.js";
import { getBackupSource } from "../src/features/backup/backupSourceRegistry.js";
import { createInitialBusinessComplianceState } from "../src/features/businessCompliance/businessComplianceModel.js";
import { planWorkspaceRestore, createVerifiedWorkspaceSnapshotBackup } from "../src/features/backup/workspaceRestorePlan.js";
import { applyWorkspaceSources, captureRecoverySources, hasPendingWorkspaceRecovery, recoverWorkspaceSources, acquireWorkspaceReadLease, WORKSPACE_RECOVERY_KEY, WORKSPACE_CHECKPOINT_KEY } from "../src/features/backup/workspaceRecovery.js";

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])); this.failure = null; }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.failure?.(key, value)) throw new Error("simulated quota failure"); this.values.set(key, String(value)); }
  removeItem(key) { if (this.failure?.(key, null)) throw new Error("simulated remove failure"); this.values.delete(key); }
}
function createLocks() {
  let shared = 0; let exclusive = false;
  return { async request(name, options, callback) {
    const available = options.mode === "shared" ? !exclusive : !exclusive && !shared;
    if (!available) return callback(null);
    if (options.mode === "shared") shared++; else exclusive = true;
    try { return await callback({ name }); }
    finally { if (options.mode === "shared") shared--; else exclusive = false; }
  } };
}
function payloadStore() {
  const values = new Map();
  return { values, async get(key) { return values.get(key) ?? null; }, async put(key, raw, { assertCurrent = () => {} } = {}) { assertCurrent(); if (values.has(key) && values.get(key) !== raw) throw Object.assign(new Error("immutable"), { code: "PAYLOAD_IMMUTABLE_CONFLICT" }); values.set(key, raw); } };
}
function quotaStorage(initial, quota) {
  const storage = new MemoryStorage(initial);
  storage.failure = (key, raw) => raw !== null && [...storage.values].reduce((total, [storedKey, value]) => total + (storedKey === key ? 0 : storedKey.length + value.length), 0) + key.length + raw.length > quota;
  return storage;
}
const largeData = () => ({ items: Array.from({ length: 1000 }, (_, index) => ({ id: `synthetic-${index}`, name: "x".repeat(160), quantity: 1 })) });
const CORE = "et-tcg-beta-data";
const COMMUNITY = "et-tcg-beta-tidepool";
const core = (data) => ({ "legacy-core-business": { schemaVersion: 0, data } });
const ownerId = "fixture-account-one";
const otherOwner = "fixture-account-two";
let checks = 0;
async function check(name, operation) { await operation(); checks++; console.log(`PASS ${name}`); }

await check("additive recovery retains original records, conflicting versions, catalogue products and permissions", async () => {
  const existing = { items: [{ id: "owned", name: "Current", quantity: 2 }], catalogProducts: [{ id: "manual", name: "Manual product" }], profile: { role: "owner", username: "Private" }, workspaceMembers: [{ id: "member" }] };
  const destination = new MemoryStorage({ [CORE]: existing, "sb-fixture-auth-token": "untouched-session" });
  const incoming = new MemoryStorage({ [CORE]: { items: [{ id: "owned", name: "Older", quantity: 1 }, { id: "recovered", name: "Recovered", quantity: 1 }], catalogProducts: [{ id: "manual-new", name: "Second manual product" }] } });
  const backup = await createVerifiedBackup({ localStorage: incoming, sourceRegistry: [getBackupSource("legacy-core-business")] });
  assert.equal(backup.verified, true);
  const reviewed = await planWorkspaceRestore(backup.json, { storage: destination });
  assert.equal(reviewed.plan.addedRecords, 2);
  assert.equal(reviewed.plan.preservedConflicts, 1);
  await applyWorkspaceSources({ storage: destination, ...reviewed, ownerId, locks: createLocks() });
  const saved = JSON.parse(destination.getItem(CORE));
  assert.deepEqual(saved.items[0], existing.items[0]);
  assert.deepEqual(saved.profile, existing.profile);
  assert.deepEqual(saved.workspaceMembers, existing.workspaceMembers);
  assert.equal(saved.items.length, 2);
  assert.equal(saved.catalogProducts.length, 2);
  assert.equal(destination.getItem("sb-fixture-auth-token"), "untouched-session");
  assert.equal(destination.getItem(WORKSPACE_RECOVERY_KEY), null);
  assert.ok(destination.getItem(WORKSPACE_CHECKPOINT_KEY));
  assert.ok(!destination.getItem(WORKSPACE_CHECKPOINT_KEY).includes("Private"), "checkpoint does not copy excluded profile");
  const again = await planWorkspaceRestore(backup.json, { storage: destination });
  assert.equal(again.plan.addedRecords, 0);
});

await check("stale review refuses all writes", async () => {
  const storage = new MemoryStorage({ [CORE]: { items: [{ id: "one" }] } });
  const expectedSources = captureRecoverySources(storage);
  storage.setItem(CORE, JSON.stringify({ items: [{ id: "one" }, { id: "newer" }] }));
  await assert.rejects(applyWorkspaceSources({ storage, expectedSources, nextSources: core({ items: [{ id: "other" }] }), ownerId, locks: createLocks() }), { code: "STALE_SNAPSHOT" });
  assert.equal(JSON.parse(storage.getItem(CORE)).items[1].id, "newer");
  assert.equal(storage.getItem(WORKSPACE_RECOVERY_KEY), null);
});

await check("empty target receives cloud sources with absent expected entry", async () => {
  const storage = new MemoryStorage();
  const result = await applyWorkspaceSources({ storage, expectedSources: {}, nextSources: core({ items: [{ id: "from-cloud" }] }), ownerId, locks: createLocks() });
  assert.equal(result.status, "APPLIED");
  assert.equal(JSON.parse(storage.getItem(CORE)).items[0].id, "from-cloud");
});

await check("failed later write rolls back earlier source and retains checkpoint", async () => {
  const storage = new MemoryStorage({ [CORE]: { items: [{ id: "one" }], profile: { username: "Keep" } }, [COMMUNITY]: { posts: [{ id: "post-one" }] } });
  const expectedSources = captureRecoverySources(storage);
  const nextSources = { ...core({ items: [{ id: "one" }, { id: "two" }] }), "legacy-community": { schemaVersion: 0, data: { posts: [{ id: "post-two" }] } } };
  storage.failure = (key, value) => key === COMMUNITY && value?.includes("post-two");
  await assert.rejects(applyWorkspaceSources({ storage, expectedSources, nextSources, ownerId, locks: createLocks() }), { code: "STORAGE_WRITE_FAILED" });
  assert.deepEqual(JSON.parse(storage.getItem(CORE)), { items: [{ id: "one" }], profile: { username: "Keep" } });
  assert.deepEqual(JSON.parse(storage.getItem(COMMUNITY)), { posts: [{ id: "post-one" }] });
  assert.equal(hasPendingWorkspaceRecovery(storage), false);
});

await check("journal capacity failure cannot change records", async () => {
  const storage = new MemoryStorage({ [CORE]: { items: [{ id: "one" }] } });
  storage.failure = (key) => key === WORKSPACE_RECOVERY_KEY;
  await assert.rejects(applyWorkspaceSources({ storage, expectedSources: captureRecoverySources(storage), nextSources: core({ items: [{ id: "two" }] }), ownerId, locks: createLocks() }), { code: "STORAGE_WRITE_FAILED" });
  assert.deepEqual(JSON.parse(storage.getItem(CORE)), { items: [{ id: "one" }] });
});

await check("startup rolls back prepared partial transaction for same account", async () => {
  const storage = new MemoryStorage({ [CORE]: { items: [{ id: "one" }], profile: { username: "Current metadata" } } });
  await applyWorkspaceSources({ storage, expectedSources: captureRecoverySources(storage), nextSources: core({ items: [{ id: "one" }, { id: "two" }] }), ownerId, locks: createLocks() });
  storage.setItem(WORKSPACE_RECOVERY_KEY, storage.getItem(WORKSPACE_CHECKPOINT_KEY));
  const result = await recoverWorkspaceSources({ storage, ownerId, locks: createLocks() });
  assert.equal(result.status, "ROLLED_BACK");
  assert.deepEqual(JSON.parse(storage.getItem(CORE)), { items: [{ id: "one" }], profile: { username: "Current metadata" } });
});

await check("startup never restores another account checkpoint", async () => {
  const storage = new MemoryStorage();
  await applyWorkspaceSources({ storage, expectedSources: {}, nextSources: core({ items: [{ id: "one" }] }), ownerId, locks: createLocks() });
  storage.setItem(WORKSPACE_RECOVERY_KEY, storage.getItem(WORKSPACE_CHECKPOINT_KEY));
  await assert.rejects(recoverWorkspaceSources({ storage, ownerId: otherOwner, locks: createLocks() }), { code: "INVALID_RECOVERY" });
  assert.equal(JSON.parse(storage.getItem(CORE)).items.length, 1);
  assert.ok(hasPendingWorkspaceRecovery(storage));
});

await check("recovery does not overwrite uncoordinated newer edits", async () => {
  const storage = new MemoryStorage();
  await applyWorkspaceSources({ storage, expectedSources: {}, nextSources: core({ items: [{ id: "one" }] }), ownerId, locks: createLocks() });
  storage.setItem(WORKSPACE_RECOVERY_KEY, storage.getItem(WORKSPACE_CHECKPOINT_KEY));
  storage.setItem(CORE, JSON.stringify({ items: [{ id: "one" }, { id: "newer" }] }));
  await assert.rejects(recoverWorkspaceSources({ storage, ownerId, locks: createLocks() }), { code: "RECOVERY_CONFLICT" });
  assert.equal(JSON.parse(storage.getItem(CORE)).items[1].id, "newer");
});

await check("another app tab lease prevents recovery and writes", async () => {
  const locks = createLocks(); const storage = new MemoryStorage();
  const release = await acquireWorkspaceReadLease(locks);
  await assert.rejects(applyWorkspaceSources({ storage, expectedSources: {}, nextSources: core({ items: [{ id: "one" }] }), ownerId, locks }), { code: "WORKSPACE_BUSY" });
  assert.equal(storage.getItem(CORE), null);
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((await applyWorkspaceSources({ storage, expectedSources: {}, nextSources: core({ items: [{ id: "one" }] }), ownerId, locks })).status, "APPLIED");
});

await check("unsupported keys, credentials, and tampered files fail closed", async () => {
  const storage = new MemoryStorage();
  const options = { storage, expectedSources: {}, ownerId, locks: createLocks() };
  await assert.rejects(applyWorkspaceSources({ ...options, nextSources: { "authentication-state": { schemaVersion: 0, data: {} } } }), { code: "SOURCE_NOT_SUPPORTED" });
  await assert.rejects(applyWorkspaceSources({ ...options, nextSources: core({ profile: { role: "owner" } }) }), { code: "UNSUPPORTED_FIELDS" });
  await assert.rejects(applyWorkspaceSources({ ...options, nextSources: core({ items: [{ id: "one", password: "never-import" }] }) }), { code: "PRIVATE_FIELDS" });
  await assert.rejects(planWorkspaceRestore('{"format":"code-3-backup"}', { storage }), { code: "BACKUP_NOT_READY" });
  assert.equal(storage.length, 0);
});

await check("business compliance exports, validates, and recovers original timestamps", async () => {
  const data = createInitialBusinessComplianceState(new Date("2026-10-17T12:00:00.000Z"));
  data.profile.legalName = "Synthetic Collector";
  const incoming = new MemoryStorage({ "code3.business-compliance.v1": data });
  const backup = await createVerifiedBackup({ localStorage: incoming, sourceRegistry: [getBackupSource("business-compliance")] });
  assert.equal(backup.verified, true);
  const storage = new MemoryStorage();
  const reviewed = await planWorkspaceRestore(backup.json, { storage });
  assert.ok(reviewed.plan.addedRecords > 0);
  await applyWorkspaceSources({ storage, ...reviewed, ownerId, locks: createLocks() });
  assert.deepEqual(JSON.parse(storage.getItem("code3.business-compliance.v1")), data);
  const invalid = structuredClone(data); invalid.version = 2;
  await assert.rejects(applyWorkspaceSources({ storage, expectedSources: captureRecoverySources(storage), nextSources: { "business-compliance": { schemaVersion: 1, data: invalid } }, ownerId, locks: createLocks() }), { code: "INVALID_SOURCE" });
});

await check("pending committed cleanup resumes without undoing restored records", async () => {
  const storage = new MemoryStorage();
  storage.failure = (key, value) => key === WORKSPACE_RECOVERY_KEY && value === null;
  await assert.rejects(applyWorkspaceSources({ storage, expectedSources: {}, nextSources: core({ items: [{ id: "committed" }] }), ownerId, locks: createLocks() }), { code: "STORAGE_WRITE_FAILED" });
  assert.equal(hasPendingWorkspaceRecovery(storage), true);
  storage.failure = null;
  assert.equal((await recoverWorkspaceSources({ storage, ownerId, locks: createLocks() })).status, "RECOVERED_COMMIT");
  assert.equal(JSON.parse(storage.getItem(CORE)).items[0].id, "committed");
});

await check("checkpoint tampering or altered excluded metadata cannot be applied", async () => {
  const storage = new MemoryStorage({ [CORE]: { items: [{ id: "one" }], profile: { username: "Original" } } });
  await applyWorkspaceSources({ storage, expectedSources: captureRecoverySources(storage), nextSources: core({ items: [{ id: "one" }, { id: "two" }] }), ownerId, locks: createLocks() });
  const checkpoint = storage.getItem(WORKSPACE_CHECKPOINT_KEY);
  storage.setItem(WORKSPACE_RECOVERY_KEY, checkpoint.replace("one", "tampered"));
  await assert.rejects(recoverWorkspaceSources({ storage, ownerId, locks: createLocks() }), { code: "INVALID_RECOVERY" });
  storage.setItem(WORKSPACE_RECOVERY_KEY, checkpoint);
  const changed = JSON.parse(storage.getItem(CORE)); changed.profile.username = "Changed after transaction";
  storage.setItem(CORE, JSON.stringify(changed));
  await assert.rejects(recoverWorkspaceSources({ storage, ownerId, locks: createLocks() }), { code: "RECOVERY_CONFLICT" });
  assert.equal(JSON.parse(storage.getItem(CORE)).profile.username, "Changed after transaction");
});

await check("partial write with failed rollback leaves a recoverable journal", async () => {
  const storage = new MemoryStorage({ [CORE]: { items: [{ id: "one" }] }, [COMMUNITY]: { posts: [{ id: "post-one" }] } });
  let didWriteCore = false;
  storage.failure = (key, value) => {
    if (key === CORE && value?.includes("two")) { didWriteCore = true; return false; }
    return key === COMMUNITY || key === CORE && didWriteCore;
  };
  await assert.rejects(applyWorkspaceSources({ storage, expectedSources: captureRecoverySources(storage), nextSources: { ...core({ items: [{ id: "one" }, { id: "two" }] }), "legacy-community": { schemaVersion: 0, data: { posts: [{ id: "post-two" }] } } }, ownerId, locks: createLocks() }), { code: "RECOVERY_REQUIRED" });
  assert.equal(hasPendingWorkspaceRecovery(storage), true);
  storage.failure = null;
  assert.equal((await recoverWorkspaceSources({ storage, ownerId, locks: createLocks() })).status, "ROLLED_BACK");
  assert.deepEqual(JSON.parse(storage.getItem(CORE)), { items: [{ id: "one" }] });
  assert.deepEqual(JSON.parse(storage.getItem(COMMUNITY)), { posts: [{ id: "post-one" }] });
});

await check("account changes after asynchronous preparation prevent every storage write", async () => {
  const storage = new MemoryStorage({ [CORE]: { items: [{ id: "original" }] } });
  const before = [...storage.values]; let calls = 0;
  const assertCurrent = () => { if (++calls === 2) throw new Error("account changed during hashing"); };
  await assert.rejects(applyWorkspaceSources({ storage, expectedSources: captureRecoverySources(storage), nextSources: core({ items: [{ id: "recovered" }] }), ownerId, locks: createLocks(), assertCurrent }), /account changed during hashing/);
  assert.equal(calls, 2);
  assert.deepEqual([...storage.values], before);
  await applyWorkspaceSources({ storage, expectedSources: captureRecoverySources(storage), nextSources: core({ items: [{ id: "recovered" }] }), ownerId, locks: createLocks() });
  storage.setItem(WORKSPACE_RECOVERY_KEY, storage.getItem(WORKSPACE_CHECKPOINT_KEY));
  const pending = [...storage.values]; calls = 0;
  await assert.rejects(recoverWorkspaceSources({ storage, ownerId, locks: createLocks(), assertCurrent }), /account changed during hashing/);
  assert.deepEqual([...storage.values], pending);
});

await check("downloaded cloud revisions become recoverable verified backups with honest coverage", async () => {
  const sources = { ...core({ items: [{ id: "cloud-version", name: "Selected cloud revision" }] }), "safe-ui-preferences": { schemaVersion: 1, data: { "et-tcg-app-theme": "dark" } } };
  const exported = await createVerifiedWorkspaceSnapshotBackup(sources);
  assert.equal(exported.verified, true);
  const storage = new MemoryStorage({ [CORE]: { items: [{ id: "original" }] } });
  const reviewed = await planWorkspaceRestore(exported.json, { storage });
  assert.equal(reviewed.plan.addedRecords, 1);
  assert.deepEqual(reviewed.nextSources["legacy-core-business"].data.items.map((item) => item.id), ["original", "cloud-version"]);
  assert.ok(exported.backup.manifest.excludedSources.some((source) => source.sourceId === "supabase-owner-data"));
  assert.equal(storage.getItem("et-tcg-app-theme"), null, "preview never stages selected cloud values in real storage");
  await assert.rejects(createVerifiedWorkspaceSnapshotBackup({ "authentication-state": { schemaVersion: 0, data: {} } }), { code: "UNSUPPORTED_SOURCE" });
});

await check("large recovery uses compact verified references when inline safety copies cannot fit", async () => {
  const initial = largeData(); const raw = JSON.stringify(initial);
  const storage = quotaStorage({ [CORE]: raw }, raw.length + 3000); const payloads = payloadStore();
  const next = structuredClone(initial); next.items[0].quantity = 2;
  await applyWorkspaceSources({ storage, expectedSources: captureRecoverySources(storage), nextSources: core(next), ownerId, locks: createLocks(), payloadStore: payloads });
  assert.equal(JSON.parse(storage.getItem(CORE)).items[0].quantity, 2);
  const checkpoint = storage.getItem(WORKSPACE_CHECKPOINT_KEY);
  assert.equal(JSON.parse(checkpoint).format, "code3-workspace-recovery-reference");
  assert.ok(checkpoint.length < 600); assert.equal(payloads.values.size, 2);
  storage.setItem(WORKSPACE_RECOVERY_KEY, checkpoint);
  assert.equal((await recoverWorkspaceSources({ storage, ownerId, locks: createLocks(), payloadStore: payloads })).status, "ROLLED_BACK");
  assert.deepEqual(JSON.parse(storage.getItem(CORE)), initial);
});

await check("small journals fall back after quota without leaving a redundant large checkpoint", async () => {
  const initial = { items: [{ id: "kept", name: "x".repeat(900) }] };
  const raw = JSON.stringify(initial); const storage = quotaStorage({ [CORE]: raw, [WORKSPACE_CHECKPOINT_KEY]: "previous checkpoint bytes" }, raw.length + 3100);
  const next = structuredClone(initial); next.items.push({ id: "new" }); const payloads = payloadStore();
  await applyWorkspaceSources({ storage, expectedSources: captureRecoverySources(storage), nextSources: core(next), ownerId, locks: createLocks(), payloadStore: payloads });
  assert.equal(JSON.parse(storage.getItem(WORKSPACE_CHECKPOINT_KEY)).format, "code3-workspace-recovery-reference");
  assert.equal(JSON.parse(storage.getItem(CORE)).items.length, 2);
  assert.equal(storage.getItem(WORKSPACE_RECOVERY_KEY), null);
});

await check("unavailable payload storage and quota preserve original bytes and previous checkpoint", async () => {
  const raw = JSON.stringify(largeData()); const storage = quotaStorage({ [CORE]: raw, [WORKSPACE_CHECKPOINT_KEY]: "previous" }, raw.length + 3000);
  const before = [...storage.values]; const next = JSON.parse(raw); next.items[0].quantity = 2;
  const unavailable = { async put() { throw Object.assign(new Error("unavailable"), { code: "PAYLOAD_STORE_UNAVAILABLE" }); } };
  await assert.rejects(applyWorkspaceSources({ storage, expectedSources: captureRecoverySources(storage), nextSources: core(next), ownerId, locks: createLocks(), payloadStore: unavailable }), { code: "STORAGE_WRITE_FAILED" });
  assert.deepEqual([...storage.values], before);
});

await check("missing or tampered external payloads retain records and the recovery marker", async () => {
  const initial = largeData(); const storage = new MemoryStorage({ [CORE]: initial }); const payloads = payloadStore();
  const next = structuredClone(initial); next.items[0].quantity = 2;
  await applyWorkspaceSources({ storage, expectedSources: captureRecoverySources(storage), nextSources: core(next), ownerId, locks: createLocks(), payloadStore: payloads });
  const checkpoint = storage.getItem(WORKSPACE_CHECKPOINT_KEY); storage.setItem(WORKSPACE_RECOVERY_KEY, checkpoint);
  const key = JSON.parse(checkpoint).payloadKey; const savedPayload = payloads.values.get(key); payloads.values.delete(key);
  const before = [...storage.values];
  await assert.rejects(recoverWorkspaceSources({ storage, ownerId, locks: createLocks(), payloadStore: payloads }), { code: "RECOVERY_PAYLOAD_UNAVAILABLE" });
  assert.deepEqual([...storage.values], before);
  payloads.values.set(key, savedPayload.replace("synthetic-0", "modified-00"));
  await assert.rejects(recoverWorkspaceSources({ storage, ownerId, locks: createLocks(), payloadStore: payloads }), { code: "RECOVERY_PAYLOAD_UNAVAILABLE" });
  assert.deepEqual([...storage.values], before);
  await assert.rejects(recoverWorkspaceSources({ storage, ownerId: otherOwner, locks: createLocks(), payloadStore: payloads }), { code: "INVALID_RECOVERY" });
});

await check("account changes, newer edits, or another checkpoint during payload persistence cannot install recovery markers", async () => {
  const initial = largeData(); const next = structuredClone(initial); next.items[0].quantity = 2;
  for (const mode of ["account", "edit", "checkpoint"]) {
    const storage = new MemoryStorage({ [CORE]: initial }); const payloads = payloadStore(); const originalPut = payloads.put; let active = true;
    payloads.put = async (...args) => { await originalPut(...args); if (mode === "account") active = false; else if (mode === "checkpoint") storage.setItem(WORKSPACE_CHECKPOINT_KEY, "newer safety copy"); else storage.setItem(CORE, JSON.stringify({ ...initial, items: [...initial.items, { id: "newer" }] })); };
    const assertCurrent = () => { if (!active) throw new Error("account changed while storing payload"); };
    await assert.rejects(applyWorkspaceSources({ storage, expectedSources: captureRecoverySources(storage), nextSources: core(next), ownerId, locks: createLocks(), payloadStore: payloads, assertCurrent }), mode === "account" ? /account changed/ : { code: "STALE_SNAPSHOT" });
    assert.equal(storage.getItem(WORKSPACE_CHECKPOINT_KEY), mode === "checkpoint" ? "newer safety copy" : null); assert.equal(storage.getItem(WORKSPACE_RECOVERY_KEY), null);
    assert.equal(JSON.parse(storage.getItem(CORE)).items[0].quantity, 1);
  }
});

await check("a journal larger than the individual source budget remains readable and recoverable", async () => {
  const initial = { items: Array.from({ length: 1000 }, (_, index) => ({ id: `large-${index}`, name: "x".repeat(6000), quantity: 1 })) };
  const storage = new MemoryStorage({ [CORE]: initial }); const payloads = payloadStore(); const next = structuredClone(initial); next.items[0].quantity = 2;
  await applyWorkspaceSources({ storage, expectedSources: captureRecoverySources(storage), nextSources: core(next), ownerId, locks: createLocks(), payloadStore: payloads });
  const checkpoint = storage.getItem(WORKSPACE_CHECKPOINT_KEY); const marker = JSON.parse(checkpoint);
  assert.ok(payloads.values.get(marker.payloadKey).length > 10 * 1024 * 1024);
  storage.setItem(WORKSPACE_RECOVERY_KEY, checkpoint);
  assert.equal((await recoverWorkspaceSources({ storage, ownerId, locks: createLocks(), payloadStore: payloads })).status, "ROLLED_BACK");
  assert.deepEqual(JSON.parse(storage.getItem(CORE)), initial);
});

await check("external COMMITTED marker resumes cleanup without undoing a durable save", async () => {
  const initial = largeData(); const storage = new MemoryStorage({ [CORE]: initial }); const payloads = payloadStore(); const next = structuredClone(initial); next.items[0].quantity = 2;
  storage.failure = (key, raw) => key === WORKSPACE_RECOVERY_KEY && raw === null;
  await assert.rejects(applyWorkspaceSources({ storage, expectedSources: captureRecoverySources(storage), nextSources: core(next), ownerId, locks: createLocks(), payloadStore: payloads }), { code: "STORAGE_WRITE_FAILED" });
  assert.equal(JSON.parse(storage.getItem(WORKSPACE_RECOVERY_KEY)).status, "COMMITTED");
  storage.failure = null;
  assert.equal((await recoverWorkspaceSources({ storage, ownerId, locks: createLocks(), payloadStore: payloads })).status, "RECOVERED_COMMIT");
  assert.equal(JSON.parse(storage.getItem(CORE)).items[0].quantity, 2);
});

console.log(`Workspace recovery: ${checks} checks passed.`);
