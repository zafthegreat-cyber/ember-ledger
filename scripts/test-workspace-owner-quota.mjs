import assert from "node:assert/strict";
import { claimWorkspaceOwner, readWorkspaceBinding, switchWorkspaceOwner, recoverWorkspaceOwnerSwitch, WORKSPACE_BINDING_KEY, WORKSPACE_SWITCH_KEY, WORKSPACE_ARCHIVE_REFERENCE_PREFIX } from "../src/features/persistence/workspaceOwnerBinding.js";
import { preserveWorkspaceConflictCopy, readWorkspaceConflictCopy, listWorkspaceConflictCopies } from "../src/features/persistence/cloudWorkspaceRecoveryCopies.js";
import { createWorkspacePayloadStore, WorkspacePayloadError } from "../src/features/persistence/workspacePayloadStore.js";
import { canonicalStringify, hashCanonicalJson } from "../src/features/backup/canonicalJson.js";

class Storage {
  constructor(initial = {}, quota = Infinity) { this.data = new Map(Object.entries(initial)); this.quota = quota; this.writes = []; this.block = () => false; }
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) {
    if (this.block(key)) throw new Error("Synthetic storage unavailable");
    const next = new Map(this.data).set(key, String(value));
    if ([...next].reduce((size, [k, v]) => size + k.length + v.length, 0) > this.quota) throw new DOMException("Synthetic quota full", "QuotaExceededError");
    this.data = next; this.writes.push(key);
  }
  removeItem(key) { if (this.block(key)) throw new Error("Synthetic storage unavailable"); this.data.delete(key); this.writes.push(key); }
}
class PayloadStore {
  constructor() { this.data = new Map(); this.afterPut = () => {}; this.afterGet = () => {}; this.corrupt = false; }
  async put(key, raw, { assertCurrent = () => {} } = {}) {
    assertCurrent();
    if (this.data.has(key) && this.data.get(key) !== raw) throw new WorkspacePayloadError("PAYLOAD_IMMUTABLE_CONFLICT", "Immutable copy differs");
    this.data.set(key, raw); await this.afterPut(key, raw);
  }
  async get(key) { await this.afterGet(key); return this.corrupt ? "corrupt" : this.data.get(key) ?? null; }
}
const unavailable = createWorkspacePayloadStore({ indexedDB: null });
const locks = { request: async (_name, _options, callback) => callback({ name: "synthetic-exclusive" }) };
const ownerId = "10000000-0000-4000-8000-000000000001";
const otherId = "10000000-0000-4000-8000-000000000002";
const copyId = "10000000-0000-4000-8000-000000000003";
const copy2 = "10000000-0000-4000-8000-000000000004";
const core = "et-tcg-beta-data";
const auth = "sb-synthetic-auth-token";
const raw = ` \n${JSON.stringify({ items: [{ id: "original", notes: "Stored exact bytes. ".repeat(10000) }] })}\n`;
const legacyKey = (id) => `code3.workspace-device-archive.v1:${id}`;
const referenceKey = (id) => `${WORKSPACE_ARCHIVE_REFERENCE_PREFIX}${id}`;
const conflictKey = (id = copyId) => `code3.workspace-conflict-copy.v1:${ownerId}:${id}`;
const sources = { "legacy-core-business": { schemaVersion: 0, data: { items: [{ id: "original", quantity: 2, notes: "Safety copy. ".repeat(5000) }] } } };
const claim = (storage, payloadStore, extra = {}) => claimWorkspaceOwner({ storage, ownerId, confirmed: true, locks, payloadStore, ...extra });
const switchTo = (storage, payloadStore, nextOwner = otherId, extra = {}) => switchWorkspaceOwner({ storage, ownerId: nextOwner, confirmed: true, locks, payloadStore, ...extra });
const preserve = (storage, payloadStore, extra = {}) => preserveWorkspaceConflictCopy({ storage, ownerId, copyId, sources, cloudRevision: 3, payloadStore, ...extra });
let checks = 0;
async function check(name, run) { await run(); checks++; process.stdout.write(`PASS ${name}\n`); }

await check("quota-full legacy records claim with verified compact reference and exact bytes", async () => {
  const storage = new Storage({ [core]: raw, [auth]: "keep-token" }, raw.length + 5000);
  assert.throws(() => storage.setItem("duplicate", raw), { name: "QuotaExceededError" });
  const payloadStore = new PayloadStore();
  await claim(storage, payloadStore);
  const ref = JSON.parse(storage.getItem(referenceKey(ownerId)));
  const { hash, ...body } = JSON.parse(payloadStore.data.get(ref.payloadKey));
  assert.equal(body.raws[core], raw); assert.equal(hash, await hashCanonicalJson(body)); assert.equal(ref.hash, hash);
  assert.equal(storage.getItem(core), raw); assert.equal(storage.getItem(auth), "keep-token");
  assert.equal(storage.getItem(legacyKey(ownerId)), null);
  assert.equal(storage.writes.at(-1), WORKSPACE_BINDING_KEY);
  assert.equal(readWorkspaceBinding(storage).ownerId, ownerId);
});
await check("existing inline archives remain byte-for-byte when new references are written", async () => {
  const storage = new Storage({ [core]: '{ "items":[{"id":"old"}] }' });
  await claim(storage, unavailable);
  const previous = storage.getItem(legacyKey(ownerId));
  storage.setItem(core, raw);
  const payloadStore = new PayloadStore();
  await switchTo(storage, payloadStore);
  assert.equal(storage.getItem(legacyKey(ownerId)), previous);
  await switchTo(storage, payloadStore, ownerId);
  assert.equal(storage.getItem(core), raw);
});
await check("account switches isolate both archives and preserve unrelated authentication", async () => {
  const storage = new Storage({ [core]: raw, [auth]: "keep-token" }, raw.length + 8000);
  const payloadStore = new PayloadStore();
  await claim(storage, payloadStore); await switchTo(storage, payloadStore);
  assert.equal(storage.getItem(core), null);
  const otherRaw = '{ "items": [{"id":"other-owned-record"}] }';
  storage.setItem(core, otherRaw);
  await switchTo(storage, payloadStore, ownerId); assert.equal(storage.getItem(core), raw);
  await switchTo(storage, payloadStore); assert.equal(storage.getItem(core), otherRaw);
  assert.equal(storage.getItem(auth), "keep-token");
});
await check("unavailable IndexedDB retains compatible verified inline saves when they fit", async () => {
  const storage = new Storage({ [core]: '{ "items":[] }' });
  await claim(storage, unavailable);
  assert.ok(storage.getItem(legacyKey(ownerId))); assert.equal(storage.getItem(referenceKey(ownerId)), null);
  await switchTo(storage, unavailable); await switchTo(storage, unavailable, ownerId);
  assert.equal(storage.getItem(core), '{ "items":[] }');
});
await check("both stores unavailable fail closed without changing business data or owner", async () => {
  const storage = new Storage({ [core]: raw }, raw.length + 5000);
  await assert.rejects(claim(storage, unavailable), { code: "DEVICE_SAVE_FAILED" });
  assert.equal(storage.getItem(core), raw); assert.equal(readWorkspaceBinding(storage), null); assert.equal(storage.getItem(referenceKey(ownerId)), null);
});
await check("failed compact marker writes retain originals without accepting ownership", async () => {
  for (const blocked of [referenceKey(ownerId), WORKSPACE_BINDING_KEY]) {
    const storage = new Storage({ [core]: raw }); const payloadStore = new PayloadStore();
    storage.block = (key) => key === blocked;
    await assert.rejects(claim(storage, payloadStore), { code: "DEVICE_SAVE_FAILED" });
    assert.equal(storage.getItem(core), raw); assert.equal(readWorkspaceBinding(storage), null); assert.equal(payloadStore.data.size, 1);
  }
});
await check("archive readback corruption cannot produce a trusted owner marker", async () => {
  const storage = new Storage({ [core]: raw }); const payloadStore = new PayloadStore(); payloadStore.corrupt = true;
  await assert.rejects(claim(storage, payloadStore), { code: "DEVICE_SAVE_FAILED" });
  assert.equal(storage.getItem(core), raw); assert.equal(readWorkspaceBinding(storage), null); assert.equal(storage.getItem(referenceKey(ownerId)), null);
});
await check("session change during async archive save leaves owner and reference untouched", async () => {
  const storage = new Storage({ [core]: raw }); const payloadStore = new PayloadStore(); let current = true;
  payloadStore.afterPut = () => { current = false; };
  await assert.rejects(claim(storage, payloadStore, { assertCurrent() { if (!current) throw Object.assign(new Error("Session changed"), { code: "SESSION_CHANGED" }); } }), { code: "SESSION_CHANGED" });
  assert.equal(storage.getItem(core), raw); assert.equal(readWorkspaceBinding(storage), null); assert.equal(storage.getItem(referenceKey(ownerId)), null);
});
await check("concurrent source change during archive readback is detected before metadata writes", async () => {
  const storage = new Storage({ [core]: raw }); const payloadStore = new PayloadStore();
  payloadStore.afterGet = () => storage.setItem(core, "newer-tab-records");
  await assert.rejects(claim(storage, payloadStore), { code: "STALE_DEVICE_DATA" });
  assert.equal(storage.getItem(core), "newer-tab-records"); assert.equal(readWorkspaceBinding(storage), null); assert.equal(storage.getItem(referenceKey(ownerId)), null);
});
await check("referenced archives never fall back to stale inline data when payload is missing", async () => {
  const storage = new Storage({ [core]: '{"items":[{"id":"old"}]}' }); await claim(storage, unavailable);
  const payloadStore = new PayloadStore(); storage.setItem(core, raw); await switchTo(storage, payloadStore);
  const ref = JSON.parse(storage.getItem(referenceKey(ownerId))); payloadStore.data.delete(ref.payloadKey);
  await assert.rejects(switchTo(storage, payloadStore, ownerId), { code: "ARCHIVE_UNAVAILABLE" });
  assert.equal(readWorkspaceBinding(storage).ownerId, otherId); assert.equal(storage.getItem(core), null); assert.ok(storage.getItem(legacyKey(ownerId)));
});
await check("new snapshots never overwrite immutable previous archive payloads", async () => {
  const storage = new Storage({ [core]: raw }); const payloadStore = new PayloadStore(); await claim(storage, payloadStore);
  const ref = JSON.parse(storage.getItem(referenceKey(ownerId))); const originalArchive = payloadStore.data.get(ref.payloadKey);
  storage.setItem(core, '{"items":[{"id":"newer"}]}'); await switchTo(storage, payloadStore);
  assert.equal(payloadStore.data.get(ref.payloadKey), originalArchive); assert.equal(payloadStore.data.size, 2);
});
await check("prepared interrupted switch restores exact IDB before image and original owner", async () => {
  const storage = new Storage({ [core]: raw }); const payloadStore = new PayloadStore(); await claim(storage, payloadStore);
  storage.setItem(WORKSPACE_SWITCH_KEY, canonicalStringify({ version: 1, from: ownerId, to: otherId, state: "PREPARED" }));
  storage.setItem(core, '{"items":[]}'); storage.setItem(WORKSPACE_BINDING_KEY, JSON.stringify({ version: 1, ownerId: otherId }));
  const result = await recoverWorkspaceOwnerSwitch({ storage, payloadStore, locks });
  assert.equal(result.status, "ROLLED_BACK"); assert.equal(storage.getItem(core), raw); assert.equal(readWorkspaceBinding(storage).ownerId, ownerId); assert.equal(storage.getItem(WORKSPACE_SWITCH_KEY), null);
});
await check("missing IDB payload retains interrupted switch journal for review", async () => {
  const storage = new Storage({ [core]: raw }); const payloadStore = new PayloadStore(); await claim(storage, payloadStore);
  storage.setItem(WORKSPACE_SWITCH_KEY, canonicalStringify({ version: 1, from: ownerId, to: otherId, state: "PREPARED" })); payloadStore.data.clear();
  await assert.rejects(recoverWorkspaceOwnerSwitch({ storage, payloadStore, locks }), { code: "ARCHIVE_UNAVAILABLE" });
  assert.ok(storage.getItem(WORKSPACE_SWITCH_KEY)); assert.equal(storage.getItem(core), raw);
});
await check("large conflict copies fit as refs, verify payloads, and list by account", async () => {
  const storage = new Storage({ [core]: raw }, raw.length + 5000); const payloadStore = new PayloadStore();
  await preserve(storage, payloadStore);
  const ref = JSON.parse(storage.getItem(conflictKey())); assert.equal(ref.format, "code3-workspace-conflict-reference");
  const restored = await readWorkspaceConflictCopy({ storage, ownerId, copyId, payloadStore });
  assert.deepEqual(restored.sources, sources); assert.equal(restored.cloudRevision, 3); assert.equal(storage.getItem(core), raw);
  assert.equal((await listWorkspaceConflictCopies({ storage, ownerId, payloadStore })).length, 1);
  assert.deepEqual(await listWorkspaceConflictCopies({ storage, ownerId: otherId, payloadStore }), []);
});
await check("legacy inline conflict copies still verify without IndexedDB", async () => {
  const storage = new Storage(); await preserve(storage, unavailable);
  assert.equal(JSON.parse(storage.getItem(conflictKey())).format, "code3-workspace-conflict-copy");
  assert.deepEqual((await readWorkspaceConflictCopy({ storage, ownerId, copyId, payloadStore: unavailable })).sources, sources);
});
await check("conflict copies are immutable and both stores unavailable fail closed", async () => {
  const storage = new Storage(); const payloadStore = new PayloadStore(); await preserve(storage, payloadStore);
  const saved = storage.getItem(conflictKey());
  await assert.rejects(preserve(storage, payloadStore), { code: "RECOVERY_COPY_EXISTS" }); assert.equal(storage.getItem(conflictKey()), saved);
  const full = new Storage({ [core]: raw }, raw.length + 5000);
  await assert.rejects(preserve(full, unavailable), { code: "RECOVERY_COPY_FAILED" }); assert.equal(full.getItem(core), raw); assert.equal(full.getItem(conflictKey()), null);
});
await check("conflict save lifecycle and concurrent metadata changes cannot replace a recovery copy", async () => {
  const storage = new Storage(); const payloadStore = new PayloadStore(); let current = true;
  payloadStore.afterPut = () => { current = false; };
  await assert.rejects(preserve(storage, payloadStore, { assertCurrent() { if (!current) throw Object.assign(new Error("Session changed"), { code: "SESSION_CHANGED" }); } }), { code: "SESSION_CHANGED" });
  assert.equal(storage.getItem(conflictKey()), null);
  payloadStore.afterPut = () => storage.setItem(conflictKey(copy2), "existing-copy");
  await assert.rejects(preserve(storage, payloadStore, { copyId: copy2 }), { code: "RECOVERY_COPY_EXISTS" }); assert.equal(storage.getItem(conflictKey(copy2)), "existing-copy");
});
await check("missing or corrupt conflict payloads do not return an unverified backup", async () => {
  const storage = new Storage(); const payloadStore = new PayloadStore(); await preserve(storage, payloadStore);
  const ref = JSON.parse(storage.getItem(conflictKey())); const saved = payloadStore.data.get(ref.payloadKey);
  payloadStore.data.delete(ref.payloadKey);
  await assert.rejects(readWorkspaceConflictCopy({ storage, ownerId, copyId, payloadStore }), { code: "RECOVERY_COPY_MISSING" });
  const modified = JSON.parse(saved); modified.cloudRevision++; payloadStore.data.set(ref.payloadKey, JSON.stringify(modified));
  await assert.rejects(readWorkspaceConflictCopy({ storage, ownerId, copyId, payloadStore }), { code: "RECOVERY_COPY_INVALID" });
  assert.ok(storage.getItem(conflictKey()));
});
process.stdout.write(`Verified ${checks} quota, ownership, and conflict-copy safety checks.\n`);
