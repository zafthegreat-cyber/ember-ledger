import assert from "node:assert/strict";
import { createAccountOpsService } from "../src/features/accountOps/service.js";
import { createAccountOpsRecoveryHost } from "../src/features/backup/accountOpsRecoveryHost.js";
import { ACCOUNT_OPS_RECEIPT_PREFIX } from "../src/features/backup/accountOpsRestore.js";
import { ACCOUNT_OPS_STORAGE_KEY } from "../src/features/accountOps/constants.js";
import { ACCOUNT_OPS_RESTORE_JOURNAL_KEY } from "../src/features/accountOps/recoveryState.js";
import { buildRecordIndex, queryRecordIndex, readAuthorizedRecordIndex, recordSearchUrl } from "../src/features/recordSearch/recordIndex.js";
import { rehearseLocalMigration } from "../src/features/persistence/migrationRehearsal.js";
import { CANONICAL_DOMAINS } from "../src/features/persistence/migrationSourceRegistry.js";
import { createOfflineMutationQueue } from "../src/features/persistence/offlineQueue.js";
import { createEmptyFlipScoutState, FLIP_SCOUT_STORAGE_KEY } from "../src/features/flipScout/constants.js";

class Storage {
  rows = new Map(); writes = 0; failReceipt = false;
  getItem(key) { return this.rows.get(key) ?? null; }
  setItem(key, value) { if (this.failReceipt && key.startsWith(ACCOUNT_OPS_RECEIPT_PREFIX)) throw Error("quota"); this.writes++; this.rows.set(key, value); }
  removeItem(key) { this.writes++; this.rows.delete(key); }
}
function locks() { let tail = Promise.resolve(); return { request(_name, _options, fn) { const next = tail.then(fn); tail = next.catch(() => {}); return next; } }; }
const source = new Storage();
const sourceLocks = locks();
const service = createAccountOpsService({ storage: source, locks: sourceLocks });
await service.createProfileGroup({ displayName: "Synthetic collection" });
const owner = { authorized: true, identity: "synthetic-owner" };
let time = 1_800_000_000_000;
const authorizeOwner = async () => ({ ...owner });
const challengeOwner = async (request) => ({ verified: true, identity: request.identity, planHash: request.planHash, authenticatedAt: time });
const makeHost = (storage, override = {}) => createAccountOpsRecoveryHost({ storage, locks: locks(), authorizeOwner, challengeOwner, now: () => time, ...override });
const exported = await makeHost(source).export();
assert.equal(exported.scope, "ACCOUNT_OPS_ONLY");
const target = new Storage(); target.rows.set("unrelated", "keep");
const host = makeHost(target);
const plan = await host.plan(exported.json);
assert.equal(target.writes, 0);
await assert.rejects(host.apply({ raw: exported.json, plan, confirmedPlanHash: plan.planHash }), { code: "NOT_AUTHORIZED" });
const confirmation = await host.confirm(plan);
assert.equal((await host.apply({ raw: exported.json, plan, ...confirmation })).status, "APPLIED");
const restored = createAccountOpsService({ storage: target });
assert.deepEqual(restored.snapshot(), service.snapshot());
await restored.createProfileGroup({ displayName: "Saved after recovery" });
assert.equal(restored.snapshot().profileGroups.length, 6);
assert.equal(target.getItem("unrelated"), "keep");
const receipts = [...target.rows].filter(([key]) => key.startsWith(ACCOUNT_OPS_RECEIPT_PREFIX));
assert.equal(receipts.length, 1);
assert.equal(receipts[0][1].includes("Synthetic collection"), false);
assert.equal(receipts[0][1].includes("synthetic-owner"), false);
for (const kind of ["cancel", "expiry", "owner", "old-proof", "no-proof"]) {
  const storage = new Storage();
  const candidate = makeHost(storage, kind === "old-proof" ? { challengeOwner: async (r) => ({ ...await challengeOwner(r), authenticatedAt: time - 1 }) } : kind === "no-proof" ? { challengeOwner: async () => null } : {});
  const planned = await candidate.plan(exported.json);
  if (["old-proof", "no-proof"].includes(kind)) await assert.rejects(candidate.confirm(planned), /could not be verified/);
  else {
    await candidate.confirm(planned);
    if (kind === "cancel") candidate.cancel();
    if (kind === "expiry") time += 60_001;
    if (kind === "owner") owner.identity = "other-owner";
    await assert.rejects(candidate.apply({ raw: exported.json, plan: planned, confirmedPlanHash: planned.planHash }), { code: "NOT_AUTHORIZED" });
    owner.identity = "synthetic-owner";
  }
  assert.equal(storage.writes, 0, `${kind} must cause no recovery writes`);
}
const failedStore = new Storage(); const failureHost = makeHost(failedStore);
const failurePlan = await failureHost.plan(exported.json); await failureHost.confirm(failurePlan); failedStore.failReceipt = true;
await assert.rejects(failureHost.apply({ raw: exported.json, plan: failurePlan, confirmedPlanHash: failurePlan.planHash }), { code: "RECOVERY_REQUIRED" });
assert.ok(failedStore.getItem(ACCOUNT_OPS_RESTORE_JOURNAL_KEY));
failedStore.failReceipt = false;
const restart = makeHost(failedStore); const pending = await restart.pendingPlan(); await restart.confirm(pending);
assert.equal((await restart.recover()).status, "RECOVERED_COMMIT");
assert.equal(failedStore.getItem(ACCOUNT_OPS_RESTORE_JOURNAL_KEY), null);
assert.ok([...failedStore.rows.keys()].some((key) => key.startsWith(ACCOUNT_OPS_RECEIPT_PREFIX)));
console.log("PASS scoped recovery round trip, subsequent save, receipt restart, cancel/expiry/identity/fresh-proof gates");

const privateId = "11111111-1111-4111-8111-111111111111";
const canonicalDomains = Object.fromEntries(Object.values(CANONICAL_DOMAINS).map((domain) => [domain, [{ id: `${domain}-id`, metadata: { title: "Synthetic shared title", secret: "NEVER_INDEX" }, notes: "NEVER_INDEX", password: "NEVER_INDEX", status: "ACTIVE" }]]));
const index = buildRecordIndex({ canonicalDomains, sources: { "account-ops": { profiles: [{ id: "profile/exact", displayName: "Synthetic shared title", credentialReference: "NEVER_INDEX" }] } } });
assert.equal(queryRecordIndex(index, "shared title").total, Object.keys(CANONICAL_DOMAINS).length + 1);
assert.equal(queryRecordIndex(index, "NEVER_INDEX").total, 0);
assert.equal(JSON.stringify(index).includes("NEVER_INDEX"), false);
assert.equal(queryRecordIndex(index, "profile/exact").groups[0].records[0].id, "profile/exact");
assert.equal(new URL(recordSearchUrl({ source: "account-ops", collection: "profiles", id: "profile/exact" }, "hello", { search: "?betaLocalMode=true" }), "http://localhost").searchParams.get("record"), "profile/exact");
let reads = 0;
assert.throws(() => readAuthorizedRecordIndex({ session: { status: "authorized", ownerAuthorized: false }, localStorage: { getItem() { reads++; } } }), /owner access/);
assert.equal(reads, 0);
const ambiguous = buildRecordIndex({ sources: { "account-ops": { profiles: [{ id: "same", displayName: "First" }, { id: "same", displayName: "Second" }] } } });
assert.equal(ambiguous.records.length, 0);
console.log("PASS every canonical record type, grouped exact IDs, secret exclusions, duplicate ambiguity and denied zero reads");

const empty = new Storage();
const remote = { status: "AVAILABLE", included: true, coverageStatus: "COMPLETE", recordCount: 0, truncatedDomains: [], domains: Object.fromEntries(Object.values(CANONICAL_DOMAINS).map((domain) => [domain, []])) };
const rehearsal = await rehearseLocalMigration({ localStorage: empty, sessionStorage: new Storage(), remoteAdapter: { inspect: async () => remote } });
assert.equal(rehearsal.writesPerformed, 0); assert.equal(empty.writes, 0); assert.equal(rehearsal.activationAllowed, false);
assert.equal(rehearsal.legacyCloudStatus, "NOT_INSPECTED_SEPARATELY");
assert.equal((await rehearseLocalMigration({ localStorage: empty, sessionStorage: new Storage() })).status, "BLOCKED");
const migrated = new Storage();
migrated.rows.set(FLIP_SCOUT_STORAGE_KEY, JSON.stringify({ ...createEmptyFlipScoutState(), deals: [{ id: privateId, title: "Synthetic mapped deal", providerId: "ebay", externalListingId: "synthetic-mapping", listingUrl: "https://example.test/item", status: "Needs Review", askingPrice: 12.34, currency: "USD", recordVersion: 1 }] }));
const populatedRehearsal = await rehearseLocalMigration({ localStorage: migrated, sessionStorage: new Storage(), remoteAdapter: { inspect: async () => remote } });
assert.equal(populatedRehearsal.rollbackVerified, true, JSON.stringify(populatedRehearsal.blockers));
assert.equal(populatedRehearsal.appliedActions, 1);
assert.equal(populatedRehearsal.after.amountMinorByDomainAndCurrency["DEAL:USD"], "1234");
assert.equal(populatedRehearsal.beforeHash, populatedRehearsal.rollbackHash);
assert.notEqual(populatedRehearsal.afterHash, populatedRehearsal.beforeHash);
assert.equal(migrated.writes, 0);
console.log("PASS migration source bindings, separate legacy cloud coverage and zero-write rehearsal/unavailable blocking");

const queueStorage = new Map(); const lock = locks();
const store = { runExclusive: (partition, fn) => lock.request(partition, {}, fn), read: async (key) => queueStorage.get(key) ?? null, write: async (key, value) => queueStorage.set(key, value) };
let session = { authorized: true, identity: "synthetic-owner", epoch: "login-1" }; let counter = 0; let sends = 0; let reply = 0;
const acknowledged = new Map();
const transport = { protocol: "code3-idempotent-mutations-v1", async send(command) {
  sends++;
  if (reply) return { status: reply };
  if (!acknowledged.has(command.idempotencyKey)) acknowledged.set(command.idempotencyKey, { id: command.recordId, recordVersion: 1 });
  if (sends === 1) throw Error("Connection lost after server commit");
  return { status: 200, record: acknowledged.get(command.idempotencyKey) };
} };
const queueOptions = { store, authorize: async () => session, transport, now: () => time, random: () => 0, idFactory: () => `operation-${++counter}` };
const queue = createOfflineMutationQueue(queueOptions);
const command = { operation: "CREATE", domain: "DEAL", recordId: privateId, input: { source: "MANUAL", status: "NEW", metadata: { title: "Synthetic deal" } } };
await queue.enqueue(command);
assert.equal((await queue.flushOne()).state, "PENDING");
assert.equal(acknowledged.size, 1);
time += 10_000;
const restartedQueue = createOfflineMutationQueue(queueOptions);
assert.equal((await restartedQueue.flushOne()).state, "SYNCED");
assert.equal(acknowledged.size, 1, "lost acknowledgement retries same idempotency key");
reply = 409;
const queued = await restartedQueue.enqueue({ ...command, operation: "UPDATE", input: { expectedVersion: 1, status: "SAVED" } });
assert.equal((await restartedQueue.flushOne()).state, "CONFLICT");
const beforeConflictSend = sends;
assert.equal((await restartedQueue.flushOne()).status, "IDLE"); assert.equal(sends, beforeConflictSend);
await restartedQueue.resolve(queued.id, { decision: "KEEP_SERVER" });
session = { authorized: true, identity: "other-owner", epoch: "login-2" };
await assert.rejects(restartedQueue.list(), { code: "SESSION_CHANGED" });
assert.equal((await createOfflineMutationQueue(queueOptions).list()).length, 0);
session = { authorized: true, identity: "synthetic-owner", epoch: "login-3" };
assert.equal((await createOfflineMutationQueue(queueOptions).list()).length, 1);
const invalid = { ...command, input: { ...command.input, password: "never-persist" } };
assert.throws(() => queue.enqueue(invalid), { code: "INVALID_INPUT" });
assert.equal(JSON.stringify([...queueStorage]).includes("never-persist"), false);
console.log("PASS durable pending restart, interrupted acknowledgement idempotency, stopped stale-version conflicts, owner resolution, sign-out and account isolation");
