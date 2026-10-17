import assert from "node:assert/strict";
import fs from "node:fs";
import { createAccountOpsService } from "../src/features/accountOps/service.js";
import { createAccountOpsRecoveryHost } from "../src/features/backup/accountOpsRecoveryHost.js";
import { createOfflineMutationQueue } from "../src/features/persistence/offlineQueue.js";

const results = [];
const check = async (name, callback) => { await callback(); results.push({ name, passed: true }); };
const deferred = () => { let resolve; const promise = new Promise((value) => { resolve = value; }); return { promise, resolve }; };
class MemoryStorage { rows = new Map(); writes = 0; getItem(key) { return this.rows.get(key) ?? null; } setItem(key, value) { this.writes++; this.rows.set(key, value); } removeItem(key) { this.writes++; this.rows.delete(key); } }
const locks = () => { let tail = Promise.resolve(); return { request(_name, _options, callback) { const next = tail.then(callback); tail = next.catch(() => {}); return next; } }; };
const command = { operation: "CREATE", domain: "DEAL", recordId: "11111111-1111-4111-8111-111111111111", input: { source: "MANUAL", status: "NEW", metadata: { title: "Synthetic boundary fixture" } } };
function queueHarness() {
  const records = new Map(); const mutex = locks(); let session = { authorized: true, identity: "synthetic-owner", epoch: "first-login" }; let readGate; let authorizeGate; let counter = 0; let sends = 0;
  const store = { runExclusive: (partition, fn) => mutex.request(partition, {}, fn), async read(key) { if (readGate && readGate.skip-- === 0) { const gate = readGate; readGate = null; gate.entered.resolve(); await gate.release.promise; } return records.get(key) ?? null; }, async write(key, raw) { records.set(key, raw); } };
  const queue = createOfflineMutationQueue({ store, authorize: async () => { const snapshot = { ...session }; if (authorizeGate) { const gate = authorizeGate; authorizeGate = null; gate.entered.resolve(); await gate.release.promise; } return snapshot; }, idFactory: () => `boundary-${++counter}`, now: () => 1000, transport: { protocol: "code3-idempotent-mutations-v1", send: async () => { sends++; return { status: 200, record: { id: command.recordId, recordVersion: 1 } }; } } });
  return { queue, records, get sends() { return sends; }, signOut() { session = { authorized: false }; }, switchOwner() { session = { authorized: true, identity: "another-owner", epoch: "second-login" }; }, holdRead(skip = 0) { readGate = { entered: deferred(), release: deferred(), skip }; return readGate; }, holdAuthorize() { authorizeGate = { entered: deferred(), release: deferred() }; return authorizeGate; } };
}
for (const mode of ["close", "signout", "switch-owner"]) await check(`queue ${mode} during delayed read causes no send or write`, async () => {
  const harness = queueHarness(); await harness.queue.enqueue(command); const before = JSON.stringify([...harness.records]); const gate = harness.holdRead();
  const pending = harness.queue.flushOne(); const rejection = assert.rejects(pending, /closed|Sign in|session changed/i); await gate.entered.promise;
  if (mode === "close") harness.queue.close(); else if (mode === "signout") harness.signOut(); else harness.switchOwner();
  gate.release.resolve(); await rejection; assert.equal(harness.sends, 0); assert.equal(JSON.stringify([...harness.records]), before);
});
await check("queue list discards private records when closed during delayed read", async () => {
  const harness = queueHarness(); await harness.queue.enqueue(command); const gate = harness.holdRead(); const pending = harness.queue.list(); const rejection = assert.rejects(pending, /closed/); await gate.entered.promise; harness.queue.close(); gate.release.resolve(); await rejection;
});
for (const boundary of ["authorize", "inner-save-read"]) for (const mode of ["close", "signout"]) await check(`queue ${mode} during paused ${boundary} rejects stale authorization with zero writes/sends`, async () => {
  const harness = queueHarness(); await harness.queue.enqueue(command); const before = JSON.stringify([...harness.records]);
  const gate = boundary === "authorize" ? harness.holdAuthorize() : harness.holdRead(1);
  const pending = boundary === "authorize" ? harness.queue.flushOne() : harness.queue.enqueue({ ...command, recordId: "33333333-3333-4333-8333-333333333333" });
  const rejected = assert.rejects(pending, /closed|Sign in|session changed/i); await gate.entered.promise;
  if (mode === "close") harness.queue.close(); else harness.signOut();
  gate.release.resolve(); await rejected; assert.equal(harness.sends, 0); assert.equal(JSON.stringify([...harness.records]), before);
});
for (const fault of ["missing", "wrong-version", "old-timestamp"]) await check(`persisted SYNCED dependency with ${fault} acknowledgement cannot send dependent work`, async () => {
  const harness = queueHarness(); const first = await harness.queue.enqueue(command); await harness.queue.enqueue({ ...command, recordId: "22222222-2222-4222-8222-222222222222", dependencies: [first.id] });
  const [key, raw] = [...harness.records][0]; const state = JSON.parse(raw); const row = state.entries[0]; row.state = "SYNCED";
  if (fault !== "missing") { row.acknowledgedVersion = fault === "wrong-version" ? 99 : 1; row.lastSyncedAt = fault === "old-timestamp" ? 999 : 1000; }
  harness.records.set(key, JSON.stringify(state)); const before = harness.records.get(key); await assert.rejects(harness.queue.flushOne(), /acknowledgement/); assert.equal(harness.sends, 0); assert.equal(harness.records.get(key), before);
});
const source = new MemoryStorage(); await createAccountOpsService({ storage: source }).createProfileGroup({ displayName: "Synthetic recovery boundary" });
const owner = { authorized: true, identity: "synthetic-owner" }; let time = 1800000000000;
const makeHost = (storage) => createAccountOpsRecoveryHost({ storage, locks: locks(), authorizeOwner: async () => ({ ...owner }), challengeOwner: async ({ identity, planHash }) => ({ verified: true, identity, planHash, authenticatedAt: time }), now: () => time });
const exported = await makeHost(source).export();
async function withPausedDigest(predicate, action) {
  const original = crypto.subtle.digest;
  const entered = deferred(); const release = deferred(); let paused = false;
  crypto.subtle.digest = async function (algorithm, input) {
    if (!paused && predicate(new TextDecoder().decode(input))) { paused = true; entered.resolve(); await release.promise; }
    return original.call(this, algorithm, input);
  };
  try { await action({ entered: entered.promise, release: () => release.resolve() }); assert.ok(paused, "The intended asynchronous hash boundary was reached"); }
  finally { release.resolve(); crypto.subtle.digest = original; }
}
for (const mode of ["cancel", "owner-change", "expiry"]) await check(`restore ${mode} after first authorization but during journal hashing causes zero writes`, async () => {
  owner.identity = "synthetic-owner"; time = 1800000000000; const target = new MemoryStorage(); const host = makeHost(target); const plan = await host.plan(exported.json); const proof = await host.confirm(plan);
  await withPausedDigest((text) => text.includes('"format":"code3.account-ops.restore-journal"'), async (gate) => {
    const pending = host.apply({ raw: exported.json, plan, ...proof }); const rejected = assert.rejects(pending, { code: "NOT_AUTHORIZED" }); await gate.entered;
    if (mode === "cancel") host.cancel(); else if (mode === "owner-change") owner.identity = "different-owner"; else time += 60001;
    gate.release(); await rejected; assert.equal(target.writes, 0); assert.equal(target.rows.size, 0);
  });
});
for (const mode of ["cancel", "owner-change"]) await check(`scoped export ${mode} during hashing discards sensitive result`, async () => {
  owner.identity = "synthetic-owner"; const host = makeHost(source); const before = source.writes;
  await withPausedDigest(() => true, async (gate) => {
    const pending = host.export(); const rejected = assert.rejects(pending, /session changed during export/); await gate.entered;
    if (mode === "cancel") host.cancel(); else owner.identity = "different-owner";
    gate.release(); await rejected; assert.equal(source.writes, before);
  });
});
fs.mkdirSync("artifacts/qa/next-ten/independent-boundaries", { recursive: true });
fs.writeFileSync("artifacts/qa/next-ten/independent-boundaries/results.json", JSON.stringify({ passed: results.length, results }, null, 2));
console.log(`Independent reviewed boundaries: ${results.length}/${results.length} passed.`);
