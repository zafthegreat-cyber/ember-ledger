import assert from "node:assert/strict";
import { createOfflineMutationQueue } from "../src/features/persistence/offlineQueue.js";

const recordId = "11111111-1111-4111-8111-111111111111";
const create = { operation: "CREATE", domain: "DEAL", recordId, input: { source: "MANUAL", status: "NEW" } };
const update = { operation: "UPDATE", domain: "DEAL", recordId, input: { expectedVersion: 1, status: "SAVED" } };
let passed = 0;
async function check(name, test) { await test(); passed++; console.log(`PASS ${name}`); }
function fixture(responder = (request) => ({ status: 200, record: { id: request.recordId, recordVersion: request.operation === "CREATE" ? 1 : request.input.expectedVersion + 1 } })) {
  const values = new Map(); const requests = []; let time = 1_800_000_000_000; let count = 0; let writes = 0;
  const store = { runExclusive: async (_key, fn) => fn(), read: async (key) => values.get(key) ?? null, write: async (key, raw) => { writes++; values.set(key, raw); } };
  const queue = createOfflineMutationQueue({ store, authorize: async () => ({ authorized: true, identity: "synthetic-owner", epoch: "test-login" }), transport: { protocol: "code3-idempotent-mutations-v1", send: async (request) => { requests.push(request); return responder(request); } }, now: () => time, random: () => 0, idFactory: () => `synthetic-operation-${++count}` });
  return { queue, values, requests, get writes() { return writes; }, advance(ms) { time += ms; } };
}

await check("dependencies wait for exact acknowledgement and preserve operation identities", async () => {
  const f = fixture(); const parent = await f.queue.enqueue(create);
  const child = await f.queue.enqueue({ ...update, dependencies: [parent.id] });
  assert.equal((await f.queue.enqueue(create)).id, parent.id);
  assert.equal((await f.queue.list()).length, 2);
  assert.equal((await f.queue.flushOne()).id, parent.id);
  assert.equal((await f.queue.flushOne()).id, child.id);
  assert.deepEqual(f.requests.map(row => row.idempotencyKey), [parent.id, child.id]);
  assert.equal((await f.queue.flushOne()).status, "IDLE");
});
await check("conflicted dependencies cannot send or be silently discarded", async () => {
  const f = fixture(() => ({ status: 409 })); const parent = await f.queue.enqueue(create);
  await f.queue.enqueue({ ...update, dependencies: [parent.id] });
  assert.equal((await f.queue.flushOne()).state, "CONFLICT");
  assert.equal((await f.queue.flushOne()).status, "IDLE");
  await assert.rejects(f.queue.resolve(parent.id, { decision: "KEEP_SERVER" }), { code: "DEPENDENTS_REQUIRE_REVIEW" });
  assert.equal(f.requests.length, 1);
});
await check("rate-limit delay is honored and excessive delay requires review", async () => {
  const f = fixture(() => ({ status: 429, retryAfterMs: 60_000 })); await f.queue.enqueue(create);
  assert.equal((await f.queue.flushOne()).error, "RATE_LIMITED");
  f.advance(59_999); assert.equal((await f.queue.flushOne()).status, "IDLE");
  f.advance(1); assert.equal((await f.queue.flushOne()).attempts, 2);
  const excessive = fixture(() => ({ status: 429, retryAfterMs: 86_400_001 })); await excessive.queue.enqueue(create);
  assert.equal((await excessive.queue.flushOne()).error, "RETRY_DELAY_REQUIRES_REVIEW");
  excessive.advance(1_000_000_000); assert.equal((await excessive.queue.flushOne()).status, "IDLE");
});
await check("six connectivity failures stop retry without multiplying server identity", async () => {
  const f = fixture(() => ({ status: 503 })); const original = await f.queue.enqueue(create);
  for (let attempt = 1; attempt <= 6; attempt++) { const result = await f.queue.flushOne(); assert.equal(result.attempts, attempt); assert.equal(result.state, attempt === 6 ? "ERROR" : "PENDING"); f.advance(300_000); }
  assert.equal((await f.queue.flushOne()).status, "IDLE");
  assert.equal(new Set(f.requests.map(row => row.idempotencyKey)).size, 1);
  assert.equal(f.requests[0].idempotencyKey, original.id);
});
for (const [status, state, error] of [[401, "AUTH_REQUIRED", "SIGN_IN_REQUIRED"], [403, "ERROR", "OWNER_ACCESS_REQUIRED"], [422, "ERROR", "VALIDATION_FAILED"]]) {
  await check(`${status} stops safely with a readable state`, async () => { const f = fixture(() => ({ status })); await f.queue.enqueue(create); const result = await f.queue.flushOne(); assert.equal(result.state, state); assert.equal(result.error, error); assert.equal((await f.queue.flushOne()).status, "IDLE"); assert.equal(f.requests.length, 1); });
}
await check("mismatched success is not accepted and reviewed replacement gets a new identity", async () => {
  const f = fixture(() => ({ status: 200, record: { id: recordId, recordVersion: 99 } })); const original = await f.queue.enqueue(create);
  assert.equal((await f.queue.flushOne()).error, "INVALID_ACKNOWLEDGEMENT");
  await assert.rejects(f.queue.resolve(original.id, {}), { code: "EXPLICIT_DECISION_REQUIRED" });
  await f.queue.resolve(original.id, { decision: "REVIEWED_REPLACEMENT", replacement: create });
  const replacement = (await f.queue.list())[0]; assert.notEqual(replacement.id, original.id); assert.equal(replacement.state, "PENDING"); assert.equal(replacement.attempts, 0);
});
await check("unsupported schema and corrupt dependency graph remain untouched", async () => {
  for (const corrupt of ["not json", JSON.stringify({ schemaVersion: 99, entries: [] }), null]) {
    const f = fixture(); await f.queue.enqueue(create); const key = [...f.values.keys()][0];
    let raw = corrupt;
    if (raw === null) { const state = JSON.parse(f.values.get(key)); state.entries[0].command.dependencies = [state.entries[0].id]; raw = JSON.stringify(state); }
    f.values.set(key, raw); const before = f.writes;
    await assert.rejects(f.queue.flushOne()); assert.equal(f.values.get(key), raw); assert.equal(f.writes, before); assert.equal(f.requests.length, 0);
  }
});
console.log(`${passed}/${passed} offline queue contract checks passed; transport is synthetic and not activated.`);
