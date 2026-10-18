import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import express from "express";
const require = createRequire(import.meta.url);
const { createAccountDeletionService } = require("../dist/accountDeletion/service.js");
const { createAccountDeletionRouter } = require("../dist/routes/accountDeletion.routes.js");
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const foreign = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const lease = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const now = Date.now();
const token = (extra = {}) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, amr: [{ method: "password", timestamp: Math.floor(now / 1000) }], ...extra })).toString("base64url")}.test`;
const identity = { id, email: "synthetic@example.test", token: "original", pending: false };
function harness(options = {}) {
  const events = [];
  const user = { id, email: identity.email, email_confirmed_at: new Date(now).toISOString(), is_anonymous: false };
  const state = { state: options.pending ? "pending" : "ready", blockers: options.blockers || [] };
  const admin = {
    rpc: async (name, args) => {
      events.push({ name, args });
      if (options.fail === name) return { error: { message: "never expose server-secret" } };
      if (name === "code3_account_deletion_status") return { data: state };
      if (name === "code3_begin_account_deletion") return { data: options.busy ? { busy: true } : { lease, files: options.files || [{ bucket: "receipts", path: "synthetic.pdf" }] } };
      if (name === "code3_finish_account_data_deletion") return { data: { readyForAuthDeletion: true } };
      return { data: true };
    },
    auth: { admin: {
      signOut: async (value, scope) => { events.push({ name: "signOut", scope }); return { error: options.fail === "signOut" ? {} : null }; },
      deleteUser: async (target, soft) => { events.push({ name: "deleteUser", target, soft }); return { error: options.fail === "deleteUser" ? {} : null }; },
    } },
    storage: { from: bucket => ({ remove: async paths => { events.push({ name: "remove", bucket, paths }); options.onRemove?.(); return { error: options.fail === "remove" ? {} : null }; } }) },
  };
  const clientFactory = () => ({
    auth: {
      getUser: async () => ({ data: { user: options.invalidUser ? null : user }, error: null }),
      signInWithPassword: async credentials => { events.push({ name: "password", email: credentials.email }); return options.badPassword ? { error: {}, data: {} } : { data: { user: { ...user, id: options.foreignUser ? foreign : id }, session: { access_token: token(options.claims) } } }; },
    },
    rpc: async () => ({ data: !options.revoked, error: null }),
  });
  const env = { SUPABASE_URL: "https://synthetic.supabase.co", SUPABASE_ANON_KEY: "public-test", CODE3_ACCOUNT_DELETION_ENABLED: "true", ...options.env };
  const service = createAccountDeletionService({ env, admin, clientFactory, now: options.now || (() => now) });
  return { service, events, state };
}
test("deletion is unavailable until explicitly enabled; no requests run", async () => {
  const h = harness({ env: { CODE3_ACCOUNT_DELETION_ENABLED: "false" } });
  await assert.rejects(h.service.identify("token"), { code: "account_deletion_unavailable" });
  assert.equal(h.events.length, 0);
});
test("identification requires a verified Auth user and current session; pending retry is narrowly permitted", async () => {
  await assert.rejects(harness({ invalidUser: true }).service.identify("token"), { code: "account_sign_in_required" });
  await assert.rejects(harness({ revoked: true }).service.identify("token"), { code: "account_sign_in_required" });
  assert.equal((await harness({ revoked: true, pending: true }).service.identify("token")).pending, true);
});
test("configured app owner and shared workspace blockers run before password or mutation", async () => {
  for (const options of [{ env: { CODE3_OWNER_SUBJECTS: `supabase:${id}` } }, { blockers: [{ code: "account_shared_workspace", message: "Transfer shared records." }] }]) {
    const h = harness(options);
    await assert.rejects(h.service.remove(identity, "synthetic-secret"), error => error.status === 409);
    assert.deepEqual(h.events.map(x => x.name), ["code3_account_deletion_status"]);
  }
});
test("wrong password, other user, stale AMR and token refresh cannot authorize deletion", async () => {
  for (const options of [{ badPassword: true }, { foreignUser: true }, { claims: { amr: [{ method: "password", timestamp: Math.floor(now / 1000) - 300 }] } }, { claims: { amr: [{ method: "token_refresh", timestamp: Math.floor(now / 1000) }] } }]) {
    const h = harness(options);
    await assert.rejects(h.service.remove(identity, "synthetic-secret"), { code: "account_reauthentication_failed" });
    assert.equal(h.events.some(x => x.name === "code3_begin_account_deletion"), false);
    assert.equal(h.events.some(x => x.name === "deleteUser"), false);
  }
});
test("successful deletion revokes sessions, removes only manifest files, then records and Auth last", async () => {
  const h = harness();
  await h.service.remove(identity, "synthetic-secret");
  assert.deepEqual(h.events.map(x => x.name), ["code3_account_deletion_status", "password", "code3_begin_account_deletion", "signOut", "remove", "code3_finish_account_data_deletion", "deleteUser", "code3_complete_account_deletion", "code3_release_account_deletion"]);
  assert.equal(h.events.find(x => x.name === "deleteUser").target, id);
  assert.equal(h.events.find(x => x.name === "deleteUser").soft, false);
  assert.equal(h.events.find(x => x.name === "signOut").scope, "global");
  assert.equal(JSON.stringify(h.events).includes("synthetic-secret"), false);
});
test("cleanup errors keep durable pending state and never falsely report untouched data", async () => {
  for (const fail of ["code3_begin_account_deletion", "signOut", "remove", "code3_finish_account_data_deletion", "deleteUser"]) {
    const h = harness({ fail });
    await assert.rejects(h.service.remove(identity, "synthetic-secret"), error => error.code === "account_deletion_pending" && /already be removed/.test(error.message) && !error.message.includes("server-secret"));
    assert.equal(h.events.some(x => x.name === "code3_complete_account_deletion"), false);
    if (fail !== "code3_begin_account_deletion") assert.equal(h.events.at(-1).name, "code3_release_account_deletion");
    if (fail !== "deleteUser") assert.equal(h.events.some(x => x.name === "deleteUser"), false);
  }
});
test("long-running attachment cleanup stops before the durable lease expires", async () => {
  let clock = now;
  const h = harness({ now: () => clock, onRemove: () => { clock += 121_000; }, files: Array.from({ length: 101 }, (_, index) => ({ bucket: "receipts", path: `synthetic-${index}.pdf` })) });
  await assert.rejects(h.service.remove(identity, "synthetic-secret"), { code: "account_deletion_pending" });
  assert.equal(h.events.filter(x => x.name === "remove").length, 1);
  assert.equal(h.events.some(x => x.name === "deleteUser"), false);
});
test("unreviewed storage buckets, oversized manifests and concurrent lease claims fail closed", async () => {
  for (const options of [{ files: [{ bucket: "catalog-images", path: "shared.jpg" }] }, { files: Array(10001).fill({ bucket: "receipts", path: "file" }) }, { busy: true }]) {
    const h = harness(options);
    await assert.rejects(h.service.remove(identity, "synthetic-secret"));
    assert.equal(h.events.some(x => x.name === "remove" || x.name === "deleteUser"), false);
  }
});
test("successful Auth deletion is not misreported when completion-marker cleanup fails", async () => {
  const h = harness({ fail: "code3_complete_account_deletion" });
  await h.service.remove(identity, "synthetic-secret");
  assert.equal(h.events.some(x => x.name === "deleteUser"), true);
});
test("HTTP routes reject unauthed requests, client target IDs, missing confirmation and invalid bodies", async t => {
  const calls = [];
  const app = express();
  app.use("/api/account/deletion", createAccountDeletionRouter({ env: { NODE_ENV: "development" }, service: { identify: async () => identity, status: async () => ({ state: "ready", blockers: [] }), remove: async (who, password) => calls.push({ id: who.id, length: password.length }) } }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/account/deletion`;
  const send = (body, path = "") => fetch(url + path, { method: "POST", headers: { Authorization: "Bearer synthetic", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await fetch(url + "/status")).status, 401);
  const status = await fetch(url + "/status", { headers: { Authorization: "Bearer synthetic" } });
  assert.equal(status.headers.get("cache-control"), "no-store");
  assert.equal((await status.json()).accountEmail, identity.email);
  for (const body of [{ password: "test", confirmation: "DELETE MY ACCOUNT", userId: foreign }, { password: "test" }, { password: 1, confirmation: "DELETE MY ACCOUNT" }, []]) assert.equal((await send(body)).status, 400);
  assert.equal((await send({ password: "test", confirmation: "DELETE MY ACCOUNT" }, "?userId=other")).status, 400);
  assert.equal(calls.length, 0);
});
