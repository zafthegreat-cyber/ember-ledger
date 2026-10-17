import assert from "node:assert/strict";
import { ACCOUNT_OPS_STORAGE_KEY } from "../src/features/accountOps/constants.js";
import { createAccountOpsRepository, createEmptyAccountOpsState } from "../src/features/accountOps/repository.js";
import { ACCOUNT_OPS_RESTORE_JOURNAL_KEY } from "../src/features/accountOps/recoveryState.js";

const now = () => "2026-09-15T12:00:00.000Z";
const original = JSON.stringify(createEmptyAccountOpsState(now));
let assertions = 0;
for (const cached of [false, true]) for (const failure of ["json", "empty", "schema", "read"]) {
  let raw = original;
  let unreadable = false;
  let writes = 0;
  const storage = {
    getItem(key) {
      if (key === ACCOUNT_OPS_RESTORE_JOURNAL_KEY) return null;
      assert.equal(key, ACCOUNT_OPS_STORAGE_KEY);
      if (unreadable) throw new Error("Synthetic read failure");
      return raw;
    },
    setItem(key, value) { assert.equal(key, ACCOUNT_OPS_STORAGE_KEY); writes += 1; raw = value; },
  };
  const repository = createAccountOpsRepository(storage, { now });
  if (cached) repository.load();
  if (failure === "json") raw = '{"profiles":';
  if (failure === "empty") raw = "";
  if (failure === "schema") raw = '{"schemaVersion":999,"profiles":[]}';
  if (failure === "read") unreadable = true;
  const preserved = raw;
  const fallback = repository.load();
  assert.ok(repository.getLastError());
  const supplied = structuredClone(fallback);
  assert.throws(() => repository.save(supplied), error => error.code === "LOCAL_READ_FAILED");
  assert.equal(writes, 0, "Cached or empty fallback cannot authorize a write");
  assert.equal(raw, preserved, "The original unreadable bytes must remain recoverable");
  assert.deepEqual(supplied, fallback, "Failed save must not mutate the caller's snapshot");
  unreadable = false;
  raw = original;
  const result = repository.save(createEmptyAccountOpsState(now));
  assert.equal(result.error, null);
  assert.equal(writes, 1, "A valid restored/readable target can save again");
  assert.equal(repository.getLastError(), null);
  assertions += 8;
  console.log(`PASS ${cached ? "cached" : "fresh"} repository rejects ${failure} fallback writes and recovers`);
}
console.log(`Account Ops storage safety passed (${assertions} assertions; synthetic storage only).`);
