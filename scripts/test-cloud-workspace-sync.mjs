import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { captureWorkspaceSources, reconcileWorkspaceSources, workspaceSourceHashes } from "../src/features/persistence/cloudWorkspaceSources.js";
import { createCloudWorkspaceSync, createSupabaseWorkspaceTransport } from "../src/features/persistence/cloudWorkspaceSync.js";
import { claimWorkspaceOwner, readWorkspaceBinding, switchWorkspaceOwner } from "../src/features/persistence/workspaceOwnerBinding.js";
import { applyWorkspaceSources } from "../src/features/backup/workspaceRecovery.js";

class Storage {
  constructor(initial = {}) { this.data = new Map(Object.entries(initial)); this.block = null; }
  get length() { return this.data.size; }
  key(i) { return [...this.data.keys()][i] ?? null; }
  getItem(k) { return this.data.get(k) ?? null; }
  setItem(k, v) { if (this.block?.(k)) throw new Error("quota"); this.data.set(k, String(v)); }
  removeItem(k) { if (this.block?.(k)) throw new Error("quota"); this.data.delete(k); }
}
const locks = { request: async (_name, _options, callback) => callback({ name: "synthetic-exclusive" }) };
const owner = "00000000-0000-4000-8000-000000000001";
const another = "00000000-0000-4000-8000-000000000002";
const core = "et-tcg-beta-data";
const feedback = "et-tcg-beta-feedback";
const sources = (id, title) => ({ "legacy-core-business": { schemaVersion: 0, data: { items: [{ id, title, quantity: 2 }] } } });
let checks = 0;
const sessionFor = (id = owner) => ({ data: { session: { user: { id }, access_token: `synthetic-token-${id}` } } });
const requestWithHeaders = (promise) => Object.assign(promise, { setHeader() { return this; } });
async function check(name, test) { await test(); checks++; process.stdout.write(`PASS ${name}\n`); }

function server() {
  const state = { revision: 0, sources: {}, updatedAt: null, fail: false, writes: 0, versions: [] };
  const transport = {
    async authorize() {},
    async read() { if (state.fail) throw Object.assign(new Error("Offline"), { code: "OFFLINE" }); return structuredClone({ format: "code3-workspace-v1", ...state }); },
    async write({ expectedRevision, sources: next }) {
      if (state.fail) throw Object.assign(new Error("Offline"), { code: "OFFLINE" });
      if (expectedRevision !== state.revision) throw Object.assign(new Error("Conflict"), { code: "REVISION_CONFLICT" });
      state.revision++; state.sources = structuredClone(next); state.updatedAt = new Date().toISOString(); state.writes++;
      state.versions.push(structuredClone(next));
      return this.read();
    },
    history: async () => state.versions.map((_, index) => ({ revision: index + 1, updatedAt: state.updatedAt })),
  };
  return { state, transport };
}
async function device(remote, initial = {}, identity = owner) {
  const storage = new Storage(initial);
  await claimWorkspaceOwner({ storage, ownerId: identity, confirmed: true, locks });
  return { storage, sync: createCloudWorkspaceSync({ storage, ownerId: identity, transport: remote.transport, applySources: applyWorkspaceSources, locks, idFactory: randomUUID }) };
}

await check("capture preserves original bytes and omits security metadata without rewriting records", () => {
  const raw = '{ "profile": { "role": "admin" }, "items": [{"id":"original-id","quantity":2,"customField":"kept"}] }';
  const storage = new Storage({ [core]: raw, "sb-project-auth-token": "keep-auth" });
  const captured = captureWorkspaceSources(storage);
  assert.equal(captured["legacy-core-business"].data.items[0].customField, "kept");
  assert.equal(captured["legacy-core-business"].data.profile, undefined);
  assert.equal(storage.getItem(core), raw);
  assert.equal(storage.getItem("sb-project-auth-token"), "keep-auth");
});
await check("malformed and credential-bearing sources pause rather than erase values", () => {
  const bad = new Storage({ [core]: "{bad" });
  assert.throws(() => captureWorkspaceSources(bad), { code: "INVALID_LOCAL_DATA" });
  assert.equal(bad.getItem(core), "{bad");
  const secret = new Storage({ [core]: JSON.stringify({ items: [{ id: "x", password: "not-uploaded" }] }) });
  assert.throws(() => captureWorkspaceSources(secret), { code: "SECURITY_REVIEW_REQUIRED" });
});
await check("unbound records require explicit ownership confirmation", async () => {
  const storage = new Storage({ [core]: '{"items":[{"id":"existing"}]}' });
  await assert.rejects(claimWorkspaceOwner({ storage, ownerId: owner, locks }), { code: "OWNER_CONFIRMATION_REQUIRED" });
  assert.equal(readWorkspaceBinding(storage), null);
  await claimWorkspaceOwner({ storage, ownerId: owner, confirmed: true, locks });
  await assert.rejects(claimWorkspaceOwner({ storage, ownerId: another, confirmed: true, locks }), { code: "OWNER_SWITCH_REQUIRED" });
});
await check("account switches retain exact private records and isolate the next account", async () => {
  const raw = '{ "profile":{"display_name":"original"}, "items":[{"id":"owned-item"}] }';
  const storage = new Storage({ [core]: raw, "sb-project-auth-token": "auth-unchanged" });
  await claimWorkspaceOwner({ storage, ownerId: owner, confirmed: true, locks });
  await switchWorkspaceOwner({ storage, ownerId: another, confirmed: true, locks });
  assert.equal(storage.getItem(core), null);
  storage.setItem(core, '{"items":[{"id":"other-item"}]}');
  await switchWorkspaceOwner({ storage, ownerId: owner, confirmed: true, locks });
  assert.equal(storage.getItem(core), raw);
  assert.equal(storage.getItem("sb-project-auth-token"), "auth-unchanged");
  await switchWorkspaceOwner({ storage, ownerId: another, confirmed: true, locks });
  assert.equal(JSON.parse(storage.getItem(core)).items[0].id, "other-item");
});
await check("archive quota failure changes no business keys or ownership", async () => {
  const storage = new Storage({ [core]: '{"items":[{"id":"original"}]}' });
  await claimWorkspaceOwner({ storage, ownerId: owner, confirmed: true, locks });
  storage.setItem(core, '{"items":[{"id":"original","quantity":2}]}');
  storage.block = (key) => key.includes("device-archive");
  await assert.rejects(switchWorkspaceOwner({ storage, ownerId: another, confirmed: true, locks }), { code: "DEVICE_SAVE_FAILED" });
  assert.equal(readWorkspaceBinding(storage).ownerId, owner);
  assert.equal(JSON.parse(storage.getItem(core)).items[0].id, "original");
});
await check("account changes during asynchronous archive hashing cancel before any ownership write", async () => {
  const raw = '{"items":[{"id":"kept-before-session-change"}]}';
  const storage = new Storage({ [core]: raw });
  let assertions = 0;
  await assert.rejects(claimWorkspaceOwner({ storage, ownerId: owner, confirmed: true, locks, assertCurrent() {
    if (++assertions > 1) throw Object.assign(new Error("Session changed"), { code: "SESSION_CHANGED" });
  } }), { code: "SESSION_CHANGED" });
  assert.equal(readWorkspaceBinding(storage), null);
  assert.equal(storage.getItem(core), raw);
  assert.equal(storage.length, 1);
});
await check("two devices upload and hydrate the same original IDs", async () => {
  const remote = server();
  const first = await device(remote, { [core]: JSON.stringify(sources("stable-id", "Original")["legacy-core-business"].data) });
  assert.equal((await first.sync.sync({ allowApply: true })).status, "SYNCED");
  const second = await device(remote);
  assert.equal((await second.sync.sync()).status, "REMOTE_AVAILABLE");
  assert.equal(second.storage.getItem(core), null);
  assert.equal((await second.sync.sync({ allowApply: true })).status, "SYNCED");
  assert.equal(JSON.parse(second.storage.getItem(core)).items[0].id, "stable-id");
  assert.equal(remote.state.writes, 1);
});
await check("offline changes remain durable and sync after reconnect", async () => {
  const remote = server();
  const first = await device(remote, { [core]: '{"items":[{"id":"offline"}]}' });
  remote.state.fail = true;
  assert.equal((await first.sync.sync()).status, "OFFLINE");
  assert.equal(JSON.parse(first.storage.getItem(core)).items[0].id, "offline");
  remote.state.fail = false;
  assert.equal((await first.sync.sync()).status, "SYNCED");
});
await check("independent source edits merge without overwriting either device", async () => {
  const remote = server();
  const first = await device(remote, { [core]: '{"items":[{"id":"shared"}]}' });
  await first.sync.sync();
  const second = await device(remote); await second.sync.sync({ allowApply: true });
  first.storage.setItem(core, '{"items":[{"id":"shared","quantity":3}]}');
  await first.sync.sync();
  second.storage.setItem(feedback, '[{"id":"new-feedback","title":"Kept"}]');
  assert.equal((await second.sync.sync()).status, "REMOTE_AVAILABLE");
  assert.equal((await second.sync.sync({ allowApply: true })).status, "SYNCED");
  assert.equal(remote.state.sources["legacy-core-business"].data.items[0].quantity, 3);
  assert.equal(remote.state.sources["legacy-feedback"].data[0].id, "new-feedback");
});
await check("concurrent same-source changes stop until reviewed and preserve discarded version", async () => {
  const remote = server();
  const first = await device(remote, { [core]: '{"items":[{"id":"shared","quantity":1}]}' });
  await first.sync.sync();
  const second = await device(remote); await second.sync.sync({ allowApply: true });
  first.storage.setItem(core, '{"items":[{"id":"shared","quantity":2}]}'); await first.sync.sync();
  second.storage.setItem(core, '{"items":[{"id":"shared","quantity":3}]}');
  assert.equal((await second.sync.sync()).status, "CONFLICT");
  assert.equal(remote.state.sources["legacy-core-business"].data.items[0].quantity, 2);
  assert.equal(JSON.parse(second.storage.getItem(core)).items[0].quantity, 3);
  const review = await second.sync.previewConflicts();
  await assert.rejects(second.sync.resolveConflicts({ reviewId: review.reviewId, choices: { "legacy-core-business": "CLOUD" } }), { code: "CONFLICT_REVIEW_REQUIRED" });
  assert.equal((await second.sync.resolveConflicts({ reviewId: review.reviewId, confirmed: true, choices: { "legacy-core-business": "CLOUD" } })).status, "SYNCED");
  const copies = await second.sync.listDeviceRecoveryCopies();
  assert.equal(copies.length, 1);
  assert.equal((await second.sync.readDeviceRecoveryCopy(copies[0].copyId)).sources["legacy-core-business"].data.items[0].quantity, 3);
  assert.equal(JSON.parse(second.storage.getItem(core)).items[0].quantity, 2);
});
await check("stale conflict review cannot replace newer edits", async () => {
  const remote = server(); remote.state.sources = sources("remote", "Remote"); remote.state.revision = 1; remote.state.updatedAt = new Date().toISOString();
  const first = await device(remote, { [core]: '{"items":[{"id":"local"}]}' });
  const review = await first.sync.previewConflicts();
  first.storage.setItem(core, '{"items":[{"id":"new-local"}]}');
  await assert.rejects(first.sync.resolveConflicts({ reviewId: review.reviewId, confirmed: true, choices: { "legacy-core-business": "CLOUD" } }), { code: "STALE_CONFLICT_REVIEW" });
  assert.equal(JSON.parse(first.storage.getItem(core)).items[0].id, "new-local");
});
await check("source deletion never silently clears a cloud source", async () => {
  const original = sources("x", "X");
  const result = await reconcileWorkspaceSources({ baselineHashes: await workspaceSourceHashes(original), localSources: {}, remoteSources: original });
  assert.deepEqual(result.conflicts, ["legacy-core-business"]);
});
await check("switching the binding prevents a stale tab from pushing", async () => {
  const remote = server(); const first = await device(remote, { [core]: '{"items":[]}' });
  await switchWorkspaceOwner({ storage: first.storage, ownerId: another, confirmed: true, locks });
  assert.equal((await first.sync.sync()).status, "OWNER_BINDING_REQUIRED");
  assert.equal(remote.state.writes, 0);
});
await check("production transport verifies real account and never sends owner selector", async () => {
  let rpcArgs; let identity = owner;
  const client = { auth: { getSession: async () => sessionFor(identity), getUser: async () => ({ data: { user: { id: identity } } }) }, rpc: (name, args) => requestWithHeaders((async () => {
    rpcArgs = { name, args }; return { data: { format: "code3-workspace-v1", revision: 0, updatedAt: null, sources: {} } };
  })()) };
  const transport = createSupabaseWorkspaceTransport({ client, ownerId: owner });
  await transport.read();
  assert.deepEqual(rpcArgs, { name: "code3_workspace_read", args: { p_revision: null } });
  identity = another;
  await assert.rejects(transport.read(), { code: "AUTH_REQUIRED" });
});
await check("closed transport discards in-flight response after sign-out", async () => {
  let finish;
  const client = { auth: { getSession: async () => sessionFor(), getUser: async () => ({ data: { user: { id: owner } } }) }, rpc: () => requestWithHeaders(new Promise((resolve) => { finish = resolve; })) };
  const transport = createSupabaseWorkspaceTransport({ client, ownerId: owner });
  const pending = transport.read();
  await new Promise((resolve) => setTimeout(resolve, 0));
  transport.close(); finish({ data: { format: "code3-workspace-v1", revision: 0, updatedAt: null, sources: {} } });
  await assert.rejects(pending, { code: "SESSION_CHANGED" });
});
await check("an account switch before lazy dispatch cannot upload records under the next account token", async () => {
  let identity = owner; let authorization;
  const client = { auth: {
    getSession: async () => sessionFor(identity),
    getUser: async (token) => ({ data: { user: { id: token.replace("synthetic-token-", "") } } }),
  }, rpc: (_name, args) => ({
    setHeader(name, value) { assert.equal(name, "Authorization"); authorization = value; return this; },
    then(resolve) {
      identity = another;
      return Promise.resolve({ data: { format: "code3-workspace-v1", revision: 1, updatedAt: new Date().toISOString(), sources: args.p_sources } }).then(resolve);
    },
  }) };
  const transport = createSupabaseWorkspaceTransport({ client, ownerId: owner });
  await assert.rejects(transport.write({ expectedRevision: 0, sources: sources("private-record", "Private"), mutationId: randomUUID() }), { code: "AUTH_REQUIRED" });
  assert.equal(authorization, `Bearer synthetic-token-${owner}`);
});
await check("temporary provider connectivity failures retain the offline editing session", async () => {
  const client = { auth: { getSession: async () => sessionFor(), getUser: async () => ({ error: { name: "AuthRetryableFetchError", status: 0 } }) }, rpc: async () => assert.fail("No database request should follow failed verification") };
  const transport = createSupabaseWorkspaceTransport({ client, ownerId: owner });
  await assert.rejects(transport.read(), { code: "OFFLINE" });
});
await check("pending account approval remains distinct from a revoked sign-in", async () => {
  let remoteError = { code: "42501", message: "workspace_access_required" };
  const client = { auth: { getSession: async () => sessionFor(), getUser: async () => ({ data: { user: { id: owner } } }) },
    rpc: () => requestWithHeaders(Promise.resolve({ error: remoteError })),
  };
  const transport = createSupabaseWorkspaceTransport({ client, ownerId: owner });
  await assert.rejects(transport.read(), { code: "ACCESS_REQUIRED" });
  remoteError = { code: "28000", message: "A current confirmed sign-in is required." };
  await assert.rejects(transport.read(), { code: "AUTH_REQUIRED" });
});
await check("a stalled cloud request times out without dropping device changes", async () => {
  const client = { auth: { getSession: async () => sessionFor(), getUser: async () => ({ data: { user: { id: owner } } }) }, rpc: () => requestWithHeaders(new Promise(() => {})) };
  const transport = createSupabaseWorkspaceTransport({ client, ownerId: owner, timeoutMs: 10 });
  await assert.rejects(transport.read(), { code: "OFFLINE" });
  transport.close();
});
await check("explicit safe reload waits for an in-flight background check and applies the newer version", async () => {
  const remote = server();
  remote.state.sources = sources("remote-id", "Remote"); remote.state.revision = 1; remote.state.updatedAt = new Date().toISOString();
  const originalRead = remote.transport.read;
  let release;
  remote.transport.read = async () => { await new Promise((resolve) => { release = resolve; }); remote.transport.read = originalRead; return originalRead.call(remote.transport); };
  const local = await device(remote);
  const background = local.sync.sync();
  const detachedSync = local.sync.sync;
  const load = detachedSync({ allowApply: true });
  assert.equal(local.storage.getItem(core), null);
  release();
  assert.equal((await background).status, "REMOTE_AVAILABLE");
  assert.equal((await load).status, "SYNCED");
  assert.equal(JSON.parse(local.storage.getItem(core)).items[0].id, "remote-id");
});
process.stdout.write(`${checks} cloud workspace checks passed.\n`);
