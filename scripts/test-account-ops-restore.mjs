import assert from "node:assert/strict";
import { ACCOUNT_OPS_STORAGE_KEY } from "../src/features/accountOps/constants.js";
import { createEmptyAccountOpsState, normalizeAccountOpsState } from "../src/features/accountOps/repository.js";
import { createVerifiedBackup, sealBackupEnvelope } from "../src/features/backup/backupFormat.js";
import { getBackupSource } from "../src/features/backup/backupSourceRegistry.js";
import { canonicalStringify, hashCanonicalJson } from "../src/features/backup/canonicalJson.js";
import {
  ACCOUNT_OPS_RESTORE_JOURNAL_KEY as JOURNAL,
  ACCOUNT_OPS_RESTORE_LOCK,
  ACCOUNT_OPS_RECEIPT_PREFIX,
  createAccountOpsRestoreExecutor,
  planAccountOpsRestore,
} from "../src/features/backup/accountOpsRestore.js";

// All restore writes in this test go to these disposable Maps. No browser, real
// owner storage, network, or filesystem restore operation is involved.
const TARGET = ACCOUNT_OPS_STORAGE_KEY;
const NOW = "2026-09-15T12:00:00.000Z";
const sentinel = { "synthetic.auth.session": "do-not-change", "unrelated.business.records": "keep-this" };
class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
    this.writes = [];
    this.checkpoints = [];
    this.hook = () => undefined;
  }
  getItem(key) {
    const result = this.hook({ op: "get", key, phase: "before", storage: this });
    if (result && Object.hasOwn(result, "value")) return result.value;
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    const event = { op: "set", key, value, storage: this };
    this.hook({ ...event, phase: "before" });
    this.values.set(key, value);
    this.writes.push({ op: "set", key, value });
    this.checkpoints.push(this.snapshot());
    this.hook({ ...event, phase: "after" });
  }
  removeItem(key) {
    const event = { op: "remove", key, storage: this };
    this.hook({ ...event, phase: "before" });
    this.values.delete(key);
    this.writes.push({ op: "remove", key });
    this.checkpoints.push(this.snapshot());
    this.hook({ ...event, phase: "after" });
  }
  snapshot() { return Object.fromEntries(this.values); }
}
function createLock() {
  let tail = Promise.resolve();
  return (name, callback) => {
    assert.equal(name, ACCOUNT_OPS_RESTORE_LOCK);
    const result = tail.then(callback);
    tail = result.catch(() => undefined);
    return result;
  };
}
function executor(storage, overrides = {}) {
  return createAccountOpsRestoreExecutor({ storage, authorize: () => true, runExclusive: createLock(), ...overrides });
}
function intactUnrelated(storage) {
  for (const [key, value] of Object.entries(sentinel)) assert.equal(storage.values.get(key), value);
  assert.ok(storage.writes.every(({ key }) => key === TARGET || key === JOURNAL || key.startsWith(ACCOUNT_OPS_RECEIPT_PREFIX)), "Only Account Ops, its journal and minimized durable receipts may change");
}
function failure(code) {
  return (error) => { assert.equal(error.code, code, error.stack); return true; };
}
async function apply(engine, raw, plan) {
  if (!plan) plan = await engine.plan(raw);
  return engine.apply({ raw, plan, confirmedPlanHash: plan.planHash });
}
const empty = createEmptyAccountOpsState(() => NOW);
const incoming = normalizeAccountOpsState({
  ...empty,
  profileGroups: [...empty.profileGroups, {
    id: "group.synthetic", displayName: "Synthetic collector", description: "Fixture only", status: "ACTIVE",
    recordVersion: 1, createdAt: NOW, updatedAt: NOW, archivedAt: null,
  }],
  profiles: [{
    id: "profile.synthetic", profileGroupId: "group.synthetic", displayName: "Test collector",
    recordVersion: 1, createdAt: NOW, updatedAt: NOW, archivedAt: null,
  }],
}, { now: () => NOW });
const baseline = await createVerifiedBackup({
  localStorage: new MemoryStorage({ [TARGET]: JSON.stringify(incoming) }),
  sessionStorage: new MemoryStorage(), sourceRegistry: [getBackupSource("account-ops")], createdAt: NOW,
});
assert.equal(baseline.coverageStatus, "COMPLETE");
assert.equal(baseline.integrityVerified, true);
const raw = baseline.json;
const expectedAfter = canonicalStringify(incoming);
async function mutatedBackup(mutator) {
  const envelope = JSON.parse(raw);
  mutator(envelope);
  return JSON.stringify(await sealBackupEnvelope(envelope));
}
const tests = [];
function test(name, callback) { tests.push({ name, callback }); }

test("planning reads only and contains hashes/counts rather than records", async () => {
  const storage = new MemoryStorage(sentinel);
  const plan = await planAccountOpsRestore(raw, { storage });
  assert.equal(plan.sourceId, "account-ops");
  assert.equal(plan.strategy, "EMPTY_TARGET_ONLY");
  assert.equal(plan.recordCounts.profiles, 1);
  assert.equal(plan.targetWasAbsent, true);
  assert.ok(!JSON.stringify(plan).includes("Test collector"));
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.recordCounts));
  assert.deepEqual(storage.snapshot(), sentinel);
  assert.equal(storage.writes.length, 0);
});
let successCheckpoints;
test("absent target restores exactly one source with verified write-ahead journal", async () => {
  const storage = new MemoryStorage(sentinel);
  const authorizations = [];
  const engine = executor(storage, { authorize: (request) => { authorizations.push(request); return true; } });
  const plan = await engine.plan(raw);
  assert.equal((await apply(engine, raw, plan)).status, "APPLIED");
  assert.equal(storage.values.get(TARGET), expectedAfter);
  assert.equal(storage.getItem(JOURNAL), null);
  assert.deepEqual(storage.writes.map(({ key }) => key), [JOURNAL, TARGET, JOURNAL, `${ACCOUNT_OPS_RECEIPT_PREFIX}${plan.planHash}`, JOURNAL]);
  assert.deepEqual(storage.writes.filter(({ op }) => op === "set").map(({ key, value }) => key === JOURNAL ? JSON.parse(value).status : key === TARGET ? "DATA" : "RECEIPT"), ["PREPARED", "DATA", "COMMITTED", "RECEIPT"]);
  assert.equal(authorizations.length, 2, "authorization is rechecked after asynchronous journal hashes");
  assert.equal(authorizations[0].operation, "APPLY");
  assert.equal(authorizations[0].planHash, plan.planHash);
  assert.deepEqual(engine.read(), incoming);
  intactUnrelated(storage);
  successCheckpoints = storage.checkpoints;
});
test("preset-only target succeeds and preserves unrelated state", async () => {
  const storage = new MemoryStorage({ ...sentinel, [TARGET]: JSON.stringify(empty, null, 2) });
  const engine = executor(storage);
  const plan = await engine.plan(raw);
  assert.equal(plan.targetWasAbsent, false);
  assert.equal((await apply(engine, raw, plan)).status, "APPLIED");
  assert.equal(storage.getItem(TARGET), expectedAfter);
  intactUnrelated(storage);
});
test("nonempty, corrupt, and modified-preset targets are never normalized to empty", async () => {
  const modifiedPreset = structuredClone(empty);
  modifiedPreset.profileGroups[0].description = "Owner data must survive";
  for (const [value, code] of [[JSON.stringify(incoming), "TARGET_NOT_EMPTY"], ["{broken", "INVALID_STATE"], ["", "INVALID_STATE"], [JSON.stringify(modifiedPreset), "TARGET_NOT_EMPTY"]]) {
    const storage = new MemoryStorage({ ...sentinel, [TARGET]: value });
    await assert.rejects(planAccountOpsRestore(raw, { storage }), failure(code));
    assert.equal(storage.getItem(TARGET), value);
    assert.equal(storage.writes.length, 0);
  }
});
test("unsupported and duplicate sources, source index, schemas, and extra section fields fail closed", async () => {
  const cases = [
    [(backup) => { backup.sections.push(structuredClone(backup.sections[0])); }, "UNSUPPORTED_SOURCES"],
    [(backup) => { backup.sections[0].sourceId = "owner-center"; }, "UNSUPPORTED_SOURCES"],
    [(backup) => { backup.sections[0].schemaVersion = 99; }, "UNSUPPORTED_SECTION"],
    [(backup) => { backup.sections[0].destinationKey = "synthetic.auth.session"; }, "UNSUPPORTED_SECTION"],
  ];
  for (const [mutator, code] of cases) {
    const storage = new MemoryStorage(sentinel);
    await assert.rejects(planAccountOpsRestore(await mutatedBackup(mutator), { storage }), failure(code));
    assert.equal(storage.writes.length, 0);
  }
  const envelope = JSON.parse(raw);
  envelope.manifest.includedSources = [];
  const storage = new MemoryStorage(sentinel);
  await assert.rejects(planAccountOpsRestore(JSON.stringify(envelope), { storage }), failure("INVALID_SOURCE_INDEX"));
  assert.deepEqual(storage.snapshot(), sentinel);
});
test("tampered hashes, broken references, prohibited fields, and warning-bearing backups are rejected", async () => {
  const tampered = JSON.parse(raw);
  tampered.sections[0].data.profiles[0].displayName = "tampered";
  const variants = [
    JSON.stringify(tampered),
    await mutatedBackup((backup) => { backup.sections[0].data.profiles[0].profileGroupId = "group.missing"; }),
    await mutatedBackup((backup) => { backup.sections[0].data.accessToken = "fake-prohibited-token"; }),
    await mutatedBackup((backup) => { backup.coverageStatus = "PARTIAL"; }),
    await mutatedBackup((backup) => { backup.sections[0].warnings = ["Review this source first"]; }),
  ];
  for (const variant of variants) {
    const storage = new MemoryStorage(sentinel);
    await assert.rejects(planAccountOpsRestore(variant, { storage }), failure("BACKUP_NOT_READY"));
    assert.equal(storage.writes.length, 0);
  }
});
test("approval is bound to the exact input, target bytes, and unmodified plan", async () => {
  const storage = new MemoryStorage({ ...sentinel, [TARGET]: JSON.stringify(empty) });
  const engine = executor(storage);
  const plan = await engine.plan(raw);
  await assert.rejects(engine.apply({ raw, plan }), failure("CONFIRMATION_REQUIRED"));
  await assert.rejects(apply(engine, `${raw}\n`, plan), failure("STALE_PLAN"));
  await assert.rejects(apply(engine, raw, { ...plan, targetKey: "synthetic.auth.session" }), failure("STALE_PLAN"));
  storage.values.set(TARGET, JSON.stringify(empty, null, 2));
  await assert.rejects(apply(engine, raw, plan), failure("STALE_PLAN"));
  assert.equal(storage.writes.length, 0);
});
test("oversized snapshots are rejected before any write", async () => {
  const oversized = await mutatedBackup((backup) => {
    const section = backup.sections[0];
    const template = section.data.profileGroups.at(-1);
    section.data.profileGroups.push(...Array.from({ length: 300 }, (_, index) => ({
      ...template, id: `group.large-${index}`, description: "x".repeat(900),
    })));
    section.recordCount += 300;
  });
  const storage = new MemoryStorage(sentinel);
  await assert.rejects(planAccountOpsRestore(oversized, { storage }), failure("STATE_LIMIT"));
  assert.deepEqual(storage.snapshot(), sentinel);
  assert.equal(storage.writes.length, 0);
});
test("current owner authorization is mandatory and post-authorization changes are caught", async () => {
  const storage = new MemoryStorage(sentinel);
  const denied = executor(storage, { authorize: () => false });
  await assert.rejects(apply(denied, raw), failure("NOT_AUTHORIZED"));
  const engine = executor(storage, { authorize: () => { storage.values.set(TARGET, JSON.stringify(empty)); return true; } });
  await assert.rejects(apply(engine, raw), failure("STALE_TARGET"));
  assert.equal(storage.writes.length, 0);
  assert.throws(() => createAccountOpsRestoreExecutor({ storage }), failure("HOST_GATES_REQUIRED"));
  assert.throws(() => createAccountOpsRestoreExecutor(), failure("STORAGE_REQUIRED"));
  await assert.rejects(planAccountOpsRestore(raw), failure("STORAGE_REQUIRED"));
});
test("journal quota failure does not touch target or other data", async () => {
  const storage = new MemoryStorage(sentinel);
  const engine = executor(storage);
  const plan = await engine.plan(raw);
  storage.hook = ({ op }) => { if (op === "set") throw new Error("QuotaExceededError"); };
  await assert.rejects(apply(engine, raw, plan), failure("RESTORE_ROLLED_BACK"));
  assert.deepEqual(storage.snapshot(), sentinel);
  assert.equal(storage.writes.length, 0);
});
test("target quota/write failure rolls back to exact previous bytes", async () => {
  const before = JSON.stringify(empty, null, 2);
  const storage = new MemoryStorage({ ...sentinel, [TARGET]: before });
  const engine = executor(storage);
  const plan = await engine.plan(raw);
  storage.hook = ({ op, key, value }) => { if (op === "set" && key === TARGET && value === expectedAfter) throw new Error("QuotaExceededError"); };
  await assert.rejects(apply(engine, raw, plan), failure("RESTORE_ROLLED_BACK"));
  assert.equal(storage.getItem(TARGET), before);
  assert.equal(storage.getItem(JOURNAL), null);
  intactUnrelated(storage);
});
test("unverified prepared journal prevents the target write", async () => {
  const storage = new MemoryStorage(sentinel);
  const engine = executor(storage);
  const plan = await engine.plan(raw);
  let once = true;
  storage.hook = ({ op, key }) => {
    if (once && op === "get" && key === JOURNAL && storage.values.has(JOURNAL)) {
      once = false;
      return { value: null };
    }
  };
  await assert.rejects(apply(engine, raw, plan), failure("RESTORE_ROLLED_BACK"));
  assert.ok(storage.writes.every(({ op, key }) => !(op === "set" && key === TARGET)));
  assert.deepEqual(storage.snapshot(), sentinel);
});
test("adapters throwing after durable writes/removals are resolved by exact readback", async () => {
  const storage = new MemoryStorage(sentinel);
  const engine = executor(storage);
  const plan = await engine.plan(raw);
  storage.hook = ({ phase }) => { if (phase === "after") throw new Error("Ambiguous durable result"); };
  assert.equal((await apply(engine, raw, plan)).status, "APPLIED");
  assert.equal(storage.getItem(TARGET), expectedAfter);
  assert.equal(storage.getItem(JOURNAL), null);
  intactUnrelated(storage);
});
test("one failed target readback rolls back without losing preexisting empty target bytes", async () => {
  const before = JSON.stringify(empty, null, 2);
  const storage = new MemoryStorage({ ...sentinel, [TARGET]: before });
  const engine = executor(storage);
  const plan = await engine.plan(raw);
  let failed = false;
  storage.hook = ({ op, key }) => {
    if (!failed && op === "get" && key === TARGET && storage.values.get(TARGET) === expectedAfter) {
      failed = true;
      return { value: "incorrect-readback" };
    }
  };
  await assert.rejects(apply(engine, raw, plan), failure("RESTORE_ROLLED_BACK"));
  assert.equal(storage.getItem(TARGET), before);
  assert.equal(storage.getItem(JOURNAL), null);
  intactUnrelated(storage);
});
test("failure to mark committed rolls back an otherwise written target", async () => {
  const storage = new MemoryStorage(sentinel);
  const engine = executor(storage);
  const plan = await engine.plan(raw);
  storage.hook = ({ op, key, value }) => {
    if (op === "set" && key === JOURNAL && JSON.parse(value).status === "COMMITTED") throw new Error("Commit marker quota failure");
  };
  await assert.rejects(apply(engine, raw, plan), failure("RESTORE_ROLLED_BACK"));
  assert.deepEqual(storage.snapshot(), sentinel);
});
test("rollback failure keeps the journal and blocks reads/plans/applies until explicit recovery", async () => {
  const storage = new MemoryStorage(sentinel);
  const engine = executor(storage);
  const plan = await engine.plan(raw);
  let firstRead = true;
  storage.hook = ({ op, key }) => {
    if (op === "get" && key === TARGET && storage.values.get(TARGET) === expectedAfter && firstRead) {
      firstRead = false;
      throw new Error("Transient readback failure");
    }
    if (op === "remove" && key === TARGET) throw new Error("Rollback unavailable");
  };
  await assert.rejects(apply(engine, raw, plan), failure("RECOVERY_REQUIRED"));
  assert.ok(storage.values.get(JOURNAL));
  assert.throws(() => engine.read(), failure("RECOVERY_REQUIRED"));
  await assert.rejects(engine.plan(raw), failure("RECOVERY_REQUIRED"));
  await assert.rejects(apply(engine, raw, plan), failure("RECOVERY_REQUIRED"));
  storage.hook = () => undefined;
  assert.equal((await engine.recover()).status, "RECOVERED_ROLLBACK");
  assert.equal(engine.read(), null);
  assert.deepEqual(storage.snapshot(), sentinel);
});
test("unreadable storage never falls back to an empty writable target", async () => {
  const storage = new MemoryStorage(sentinel);
  storage.hook = ({ op }) => { if (op === "get") throw new Error("Access denied"); };
  await assert.rejects(planAccountOpsRestore(raw, { storage }), failure("STORAGE_READ_FAILED"));
  assert.equal(storage.writes.length, 0);
});
test("every durable interruption point is recoverable after recreating the executor", async () => {
  for (let index = 0; index < successCheckpoints.length; index += 1) {
    const storage = new MemoryStorage(successCheckpoints[index]);
    const engine = executor(storage);
    const journal = JSON.parse(storage.getItem(JOURNAL) || "null");
    if (journal) assert.throws(() => engine.read(), failure("RECOVERY_REQUIRED"));
    const result = await engine.recover();
    assert.equal(result.status, journal?.status === "PREPARED" ? "RECOVERED_ROLLBACK" : journal?.status === "COMMITTED" ? "RECOVERED_COMMIT" : "NO_RECOVERY");
    assert.equal(storage.getItem(TARGET), index < 2 ? null : expectedAfter);
    assert.equal(storage.getItem(JOURNAL), null);
    assert.equal((await engine.recover()).status, "NO_RECOVERY");
    intactUnrelated(storage);
  }
});
test("committed cleanup failure blocks until restart recovery finishes", async () => {
  const storage = new MemoryStorage(sentinel);
  const engine = executor(storage);
  const plan = await engine.plan(raw);
  storage.hook = ({ op, key }) => { if (op === "remove" && key === JOURNAL) throw new Error("Journal cleanup denied"); };
  await assert.rejects(apply(engine, raw, plan), failure("RECOVERY_REQUIRED"));
  assert.equal(JSON.parse(storage.values.get(JOURNAL)).status, "COMMITTED");
  assert.throws(() => engine.read(), failure("RECOVERY_REQUIRED"));
  storage.hook = () => undefined;
  assert.equal((await executor(storage).recover()).status, "RECOVERED_COMMIT");
  assert.equal(storage.getItem(TARGET), expectedAfter);
  intactUnrelated(storage);
});
test("interrupted recovery can retry and recovery authorization is enforced", async () => {
  const storage = new MemoryStorage(successCheckpoints[1]);
  const denied = executor(storage, { authorize: () => false });
  await assert.rejects(denied.recover(), failure("NOT_AUTHORIZED"));
  assert.equal(storage.writes.length, 0);
  storage.hook = ({ op, key }) => { if (op === "remove" && key === JOURNAL) throw new Error("Interrupted cleanup"); };
  await assert.rejects(executor(storage).recover(), failure("STORAGE_WRITE_FAILED"));
  assert.equal(storage.getItem(TARGET), null);
  assert.ok(storage.getItem(JOURNAL));
  storage.hook = () => undefined;
  assert.equal((await executor(storage).recover()).status, "RECOVERED_ROLLBACK");
  assert.deepEqual(storage.snapshot(), sentinel);
});
test("tampered journals cannot change arbitrary keys or restore a nonempty before image", async () => {
  for (const [field, value] of [["targetKey", "synthetic.auth.session"], ["sourceId", "owner-center"], ["beforeRaw", JSON.stringify(incoming)], ["afterRaw", "{}"]]) {
    const journal = JSON.parse(successCheckpoints[1][JOURNAL]);
    journal[field] = value;
    // Even a recomputed unkeyed checksum must not bypass the scope/empty-target gate.
    journal.beforeHash = await hashCanonicalJson(journal.beforeRaw);
    journal.afterHash = await hashCanonicalJson(journal.afterRaw);
    const payload = { ...journal };
    delete payload.journalHash;
    journal.journalHash = await hashCanonicalJson(payload);
    const storage = new MemoryStorage({ ...successCheckpoints[1], [JOURNAL]: JSON.stringify(journal) });
    const before = storage.snapshot();
    await assert.rejects(executor(storage).recover(), failure("INVALID_JOURNAL"));
    assert.deepEqual(storage.snapshot(), before);
    assert.equal(storage.writes.length, 0);
  }
});
test("recovery never overwrites records changed outside the pending transaction", async () => {
  for (const index of [1, 2]) {
    const changed = `${expectedAfter}\n`;
    const storage = new MemoryStorage({ ...successCheckpoints[index], [TARGET]: changed });
    await assert.rejects(executor(storage).recover(), failure("RECOVERY_CONFLICT"));
    assert.equal(storage.getItem(TARGET), changed);
    assert.ok(storage.getItem(JOURNAL));
    assert.equal(storage.writes.length, 0);
  }
});
test("a missing journal cannot clear uncertain state when the target has also changed", async () => {
  const storage = new MemoryStorage(sentinel);
  const engine = executor(storage);
  const plan = await engine.plan(raw);
  const unrelatedChange = `${expectedAfter}\n`;
  storage.hook = ({ op, key, phase }) => {
    if (op === "set" && key === TARGET && phase === "after") {
      storage.values.delete(JOURNAL);
      storage.values.set(TARGET, unrelatedChange);
    }
  };
  await assert.rejects(apply(engine, raw, plan), failure("RECOVERY_REQUIRED"));
  storage.hook = () => undefined;
  await assert.rejects(engine.recover(), failure("RECOVERY_REQUIRED"));
  assert.throws(() => engine.read(), failure("RECOVERY_REQUIRED"));
  await assert.rejects(apply(engine, raw, plan), failure("RECOVERY_REQUIRED"));
  assert.equal(storage.getItem(TARGET), unrelatedChange);
  assert.equal(storage.getItem(JOURNAL), null);
  intactUnrelated(storage);
});
test("parallel restore attempts serialize under the supplied host lock", async () => {
  const storage = new MemoryStorage(sentinel);
  const runExclusive = createLock();
  const first = executor(storage, { runExclusive });
  const second = executor(storage, { runExclusive });
  const plan = await first.plan(raw);
  const result = await Promise.allSettled([apply(first, raw, plan), apply(second, raw, plan)]);
  assert.equal(result[0].status, "fulfilled");
  assert.equal(result[1].status, "rejected");
  assert.equal(result[1].reason.code, "TARGET_NOT_EMPTY");
  assert.equal(storage.getItem(TARGET), expectedAfter);
  intactUnrelated(storage);
});

for (const { name, callback } of tests) {
  await callback();
  console.log(`PASS ${name}`);
}
console.log(`Account Ops isolated restore passed (${tests.length} scenarios; injected synthetic storage only; no app Apply action).`);
