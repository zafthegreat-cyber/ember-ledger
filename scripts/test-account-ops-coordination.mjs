import assert from "node:assert/strict";
import { createAccountOpsRepository } from "../src/features/accountOps/repository.js";
import { createAccountOpsService, ACCOUNT_OPS_MUTATION_NAMES } from "../src/features/accountOps/service.js";
import { createAccountOpsPersistence } from "../src/features/accountOps/persistence.js";
import { accountOpsExclusive } from "../src/features/accountOps/operationCoordinator.js";
import { ACCOUNT_OPS_RESTORE_LOCK, ACCOUNT_OPS_RESTORE_JOURNAL_KEY } from "../src/features/accountOps/recoveryState.js";
import { ACCOUNT_OPS_STORAGE_KEY } from "../src/features/accountOps/constants.js";

function storage() {
  const rows = new Map(); let writes = 0; let fail = false;
  return { getItem: (key) => rows.get(key) ?? null, setItem(key, raw) { writes++; if (fail) throw Error("quota"); rows.set(key, raw); }, removeItem: (key) => rows.delete(key), get writes() { return writes; }, set fail(value) { fail = value; } };
}
const store = storage();
let id = 0;
const options = { storage: store, now: () => "2026-09-16T12:00:00.000Z", idFactory: (collection) => `${collection}:coord-${++id}` };
const first = createAccountOpsService(options);
const second = createAccountOpsService(options);
assert.equal(ACCOUNT_OPS_MUTATION_NAMES.length, 38);
await Promise.all(Array.from({ length: 30 }, (_, index) => (index % 2 ? first : second).createProfileGroup({ displayName: `Group ${index}` })));
assert.equal(first.snapshot().profileGroups.length, 34);
assert.equal(first.snapshot().activity.length, 30);
assert.equal(store.writes, 30, "each complete service operation commits one snapshot");
assert.equal(first.snapshot() instanceof Promise, false, "public reads stay synchronous");
const before = store.getItem(ACCOUNT_OPS_STORAGE_KEY);
const repo = createAccountOpsRepository(store, options);
let leaked;
await assert.rejects(repo.transact(async (scoped) => {
  leaked = scoped;
  scoped.save({ ...scoped.load(), profileGroups: [] });
  assert.equal(store.getItem(ACCOUNT_OPS_STORAGE_KEY), before, "staged records are not visible to peers");
  throw Error("linked operation validation failed");
}), /validation failed/);
assert.equal(store.getItem(ACCOUNT_OPS_STORAGE_KEY), before);
assert.throws(() => leaked.load(), { code: "OPERATION_CLOSED" });
store.fail = true;
await assert.rejects(first.createProfileGroup({ displayName: "Quota failure" }), { code: "LOCAL_SAVE_FAILED" });
assert.equal(store.getItem(ACCOUNT_OPS_STORAGE_KEY), before);
store.fail = false;
const stale = first.snapshot().profileGroups.find((row) => row.id.startsWith("profileGroups:"));
await first.updateProfileGroup(stale.id, { displayName: "New version" }, stale.recordVersion);
await assert.rejects(second.updateProfileGroup(stale.id, { displayName: "Stale version" }, stale.recordVersion), { code: "VERSION_CONFLICT" });
const collection = createAccountOpsPersistence(options).collections.profileGroups;
await Promise.all([collection.create({ displayName: "Direct A" }), collection.create({ displayName: "Direct B" })]);
assert.equal(first.snapshot().profileGroups.length, 36);
const order = [];
const exclusive = accountOpsExclusive(store);
const restore = exclusive(ACCOUNT_OPS_RESTORE_LOCK, async () => {
  order.push("restore-start");
  store.setItem(ACCOUNT_OPS_RESTORE_JOURNAL_KEY, "synthetic pending journal");
  await Promise.resolve();
  assert.throws(() => first.snapshot(), { code: "RECOVERY_REQUIRED" });
  store.removeItem(ACCOUNT_OPS_RESTORE_JOURNAL_KEY);
  order.push("restore-end");
});
const write = first.createProfileGroup({ displayName: "After restore" }).then(() => order.push("save-end"));
await Promise.all([restore, write]);
assert.deepEqual(order, ["restore-start", "restore-end", "save-end"]);
const strict = createAccountOpsRepository(store, { ...options, requireCrossTabLock: true });
assert.throws(() => strict.save(first.snapshot()), { code: "COORDINATED_WRITE_REQUIRED" });
await assert.rejects(strict.transact(() => {}), { code: "LOCK_UNAVAILABLE" });
const last = store.getItem(ACCOUNT_OPS_STORAGE_KEY);
await assert.rejects(repo.transact(async (scoped) => {
  scoped.save(scoped.load());
  store.setItem(ACCOUNT_OPS_STORAGE_KEY, `${last} `);
}), { code: "VERSION_CONFLICT" });
assert.equal(store.getItem(ACCOUNT_OPS_STORAGE_KEY), `${last} `, "nonparticipating writer is preserved");
console.log("Account Ops coordination passed: 38 service names, staged atomic commit, concurrent instances, collection writers, rollback, stale versions, closed leases, shared restore lock and unavailable-lock denial.");
