import assert from "node:assert/strict";
import { ACCOUNT_OPS_STORAGE_KEY } from "../src/features/accountOps/constants.js";
import { createAccountOpsService } from "../src/features/accountOps/service.js";
import { createAccountOpsRepository } from "../src/features/accountOps/repository.js";
import { ACCOUNT_OPS_RESTORE_JOURNAL_KEY } from "../src/features/accountOps/recoveryState.js";

for (const clear of [false, true]) {
  const values = new Map(); let writes = 0;
  const storage = { getItem: key => values.get(key) ?? null, setItem(key, raw) { writes++; values.set(key, raw); } };
  let sequence = 0;
  const service = createAccountOpsService({ storage, idFactory: collection => `${collection}:synthetic-cache-${++sequence}` });
  const first = await service.createProfile({ displayName: "Synthetic removed profile" });
  assert.equal(service.snapshot().profiles[0].id, first.record.id);
  if (clear) values.clear(); else values.delete(ACCOUNT_OPS_STORAGE_KEY);
  const beforeReads = writes;
  const empty = service.snapshot();
  assert.equal(empty instanceof Promise, false); assert.equal(empty.profiles.length, 0); assert.equal(empty.activity.length, 0);
  assert.equal(writes, beforeReads, "A read after removal must not write defaults or resurrect cached records.");
  const second = await service.createProfile({ displayName: "Synthetic after removal" });
  const persisted = JSON.parse(values.get(ACCOUNT_OPS_STORAGE_KEY));
  assert.deepEqual(persisted.profiles.map(row => row.id), [second.record.id]); assert.equal(persisted.activity.length, 1);
  const repository = createAccountOpsRepository(storage); repository.load();
  values.set(ACCOUNT_OPS_RESTORE_JOURNAL_KEY, "pending synthetic recovery"); values.delete(ACCOUNT_OPS_STORAGE_KEY);
  assert.throws(() => repository.load(), { code: "RECOVERY_REQUIRED" }, "Missing data cannot bypass an outstanding recovery journal.");
  console.log(`PASS ${clear ? "clear" : "remove"}: synchronous empty read, zero-write observation, no resurrection, recovery guard retained`);
}
