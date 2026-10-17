import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";
import express from "express";
const require = createRequire(import.meta.url);
const { FilesystemOwnerSecurityStore, securityDigest } = require("../dist/auth/sessionLedger.js");
const { OwnerSessionService } = require("../dist/auth/ownerSessionService.js");
const { createOwnerSessionsRouter, createOwnerSessionGuard } = require("../dist/routes/ownerSessions.routes.js");
const { createOwnerSecurity, ownerViewIdentityKey } = require("../dist/auth/ownerAuthorization.js");
const { createProtectedCors } = require("../dist/security/corsPolicy.js");
const NOW = Date.parse("2026-09-16T12:00:00Z");
const SID_A = "10000000-0000-4000-8000-000000000001";
const SID_B = "20000000-0000-4000-8000-000000000002";
const PLAN = "a".repeat(64);
function context(id = SID_A, subject = "owner", overrides = {}) {
  const principal = { provider: "supabase", subject, issuedAt: NOW / 1000 - 60, expiresAt: NOW / 1000 + 3600, ...overrides };
  return { owner: { ownerSubject: `supabase:${subject}`, principal }, providerSessionId: id };
}
const err = (code) => (error) => error.code === code;

test("opaque view identity remains stable across refresh/name changes and separates masked-name collisions", () => {
  const first = context().owner.principal;
  const key = ownerViewIdentityKey({ ...first, email: "owner@example.test" });
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(ownerViewIdentityKey({ ...first, email: "other-name@example.test", issuedAt: NOW / 1000, expiresAt: NOW / 1000 + 7200 }), key);
  assert.notEqual(ownerViewIdentityKey({ ...first, subject: "another-owner", email: "other@example.test" }), key);
  assert.notEqual(ownerViewIdentityKey({ ...first, provider: "local-development" }), key);
});
async function fixture(run, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "code3-owner-security-test-"));
  let clock = NOW;
  const now = () => clock;
  const store = new FilesystemOwnerSecurityStore(root);
  const verifyFreshOwner = async (session, intent, proof) => proof === "fresh-owner-proof" ? {
    ownerSubject: session.owner.ownerSubject, providerSessionId: session.providerSessionId, verifiedAt: now(), intentDigest: intent.intentDigest, verificationId: randomUUID(),
  } : null;
  const service = new OwnerSessionService({ store, now, verifyFreshOwner, ...options });
  try { await run({ root, store, service, now, setTime: (time) => { clock = time; }, verifyFreshOwner }); }
  finally {
    const target = resolve(root);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes("code3-owner-security-test-"));
    await rm(target, { recursive: true, force: true });
  }
}

test("session registration survives restart and exposes safe device summaries only", () => fixture(async ({ service, root, now, store }) => {
  const first = await service.register(context(), "Desktop");
  await service.register(context(SID_B), "Phone");
  const restarted = new OwnerSessionService({ store: new FilesystemOwnerSecurityStore(root), now });
  const list = await restarted.list(context());
  assert.equal(list.length, 2);
  assert.equal(list[0].id, first.id);
  assert.equal(list[0].current, true);
  assert.equal(list[1].current, false);
  assert.equal(JSON.stringify(list).includes(SID_A), false);
  assert.equal(JSON.stringify(list).includes("sessionHash"), false);
  assert.equal((await store.read(context().owner)).audit.length, 2);
}));

test("refreshed JWT keeps one provider session identity and cannot revive a revoked session", () => fixture(async ({ service }) => {
  const first = await service.register(context());
  const refreshed = context(SID_A, "owner", { issuedAt: NOW / 1000, expiresAt: NOW / 1000 + 7200 });
  assert.equal((await service.register(refreshed)).id, first.id);
  assert.equal((await service.list(refreshed)).length, 1);
  const grant = await service.issueGrant(refreshed, "SESSION_REVOKE", service.revokeIntent(first.id), "fresh-owner-proof");
  await service.revoke(refreshed, first.id, grant.grant);
  await assert.rejects(service.register(refreshed), err("owner_session_revoked"));
  await assert.rejects(service.assertActive(refreshed), err("owner_session_revoked"));
}));

test("unverified, expired and caller-forged identities never create security data", () => fixture(async ({ service, root }) => {
  await assert.rejects(service.register(context("short")), err("verified_session_required"));
  await assert.rejects(service.register(context(SID_A, "owner", { expiresAt: NOW / 1000 })), err("verified_session_required"));
  const forged = context(); forged.owner.ownerSubject = "supabase:other";
  await assert.rejects(service.register(forged), err("verified_session_required"));
  assert.deepEqual(await readdir(root), []);
}));

test("another owner has no access to device list, grants or audit", () => fixture(async ({ service }) => {
  await service.register(context());
  const other = context(SID_A, "other");
  await assert.rejects(service.list(other), err("owner_session_revoked"));
  await assert.rejects(service.audit(other), err("owner_session_revoked"));
  await service.register(other, "Other owner device");
  assert.equal((await service.list(other)).length, 1);
  assert.equal((await service.audit(other)).entries.length, 1);
}));

test("fresh proof is required even when current JWT was just issued", () => fixture(async ({ service, store }) => {
  const freshJwt = context(SID_A, "owner", { issuedAt: NOW / 1000 });
  await service.register(freshJwt);
  const before = await store.read(freshJwt.owner);
  await assert.rejects(service.issueGrant(freshJwt, "ACCOUNT_OPS_RESTORE", PLAN, "current-jwt"), err("fresh_owner_verification_required"));
  assert.deepEqual(await store.read(freshJwt.owner), before);
}));

test("missing fresh-verification adapter fails closed", () => fixture(async ({ service }) => {
  await service.register(context());
  await assert.rejects(service.issueGrant(context(), "ACCOUNT_OPS_RESTORE", PLAN, "anything"), err("fresh_owner_verification_unavailable"));
}, { verifyFreshOwner: undefined }));

test("stale, future, wrong-owner, wrong-session and wrong-intent verification all fail", async () => {
  for (const override of [{ verifiedAt: NOW - 120001 }, { verifiedAt: NOW + 1 }, { ownerSubject: "supabase:other" }, { providerSessionId: SID_B }, { intentDigest: "b".repeat(64) }, { verificationId: undefined }]) {
    await fixture(async ({ service, store }) => {
      await service.register(context());
      const before = await store.read(context().owner);
      await assert.rejects(service.issueGrant(context(), "PRIVATE_FILE_RESTORE", PLAN, "proof"), err("fresh_owner_verification_required"));
      assert.deepEqual(await store.read(context().owner), before);
    }, { verifyFreshOwner: async (session, intent) => ({ ownerSubject: session.owner.ownerSubject, providerSessionId: SID_A, verifiedAt: NOW, intentDigest: intent.intentDigest, verificationId: randomUUID(), ...override }) });
  }
});

test("verification challenge replay cannot mint a second grant", () => fixture(async ({ service }) => {
  await service.register(context());
  await service.issueGrant(context(), "PRIVATE_FILE_RESTORE", PLAN, "proof");
  await assert.rejects(service.issueGrant(context(), "PRIVATE_FILE_RESTORE", PLAN, "proof"), err("fresh_verification_already_used"));
}, { verifyFreshOwner: async (session, intent) => ({ ownerSubject: session.owner.ownerSubject, providerSessionId: SID_A, verifiedAt: NOW, intentDigest: intent.intentDigest, verificationId: "same-proof-identifier-123" }) }));

test("one-use grants bind owner, provider session, purpose and exact plan", () => fixture(async ({ service, store }) => {
  await service.register(context()); await service.register(context(SID_B));
  const confirmation = await service.issueGrant(context(), "ACCOUNT_OPS_RESTORE", PLAN, "fresh-owner-proof");
  for (const args of [[context(SID_B), "ACCOUNT_OPS_RESTORE", PLAN], [context(), "PRIVATE_FILE_RESTORE", PLAN], [context(), "ACCOUNT_OPS_RESTORE", "b".repeat(64)]]) {
    await assert.rejects(service.consumeGrant(...args, confirmation.grant), err("owner_grant_invalid"));
  }
  assert.equal(await service.consumeGrant(context(), "ACCOUNT_OPS_RESTORE", PLAN, confirmation.grant), true);
  await assert.rejects(service.consumeGrant(context(), "ACCOUNT_OPS_RESTORE", PLAN, confirmation.grant), err("owner_grant_invalid"));
  const raw = JSON.stringify(await store.read(context().owner));
  assert.equal(raw.includes(confirmation.grant), false);
  assert.equal(raw.includes("fresh-owner-proof"), false);
  assert.equal(raw.includes(SID_A), false);
}));

test("grant expiry survives restart and token refresh does not extend its lifetime", () => fixture(async ({ service, root, now, setTime }) => {
  await service.register(context());
  const grant = await service.issueGrant(context(), "ACCOUNT_OPS_RESTORE", PLAN, "fresh-owner-proof");
  setTime(NOW + 300001);
  const restarted = new OwnerSessionService({ store: new FilesystemOwnerSecurityStore(root), now });
  await assert.rejects(restarted.consumeGrant(context(), "ACCOUNT_OPS_RESTORE", PLAN, grant.grant), err("owner_grant_invalid"));
}));

test("revoking another device is durable, grants from it stop working, and owner current device remains valid", () => fixture(async ({ service, root, now }) => {
  await service.register(context(), "Desktop"); const phone = await service.register(context(SID_B), "Phone");
  const phoneGrant = await service.issueGrant(context(SID_B), "ACCOUNT_OPS_RESTORE", PLAN, "fresh-owner-proof");
  const grant = await service.issueGrant(context(), "SESSION_REVOKE", service.revokeIntent(phone.id), "fresh-owner-proof");
  const result = await service.revoke(context(), phone.id, grant.grant);
  assert.equal(result.scope, "CODE3_APP"); assert.equal(result.current, false);
  const restarted = new OwnerSessionService({ store: new FilesystemOwnerSecurityStore(root), now });
  await restarted.assertActive(context());
  await assert.rejects(restarted.assertActive(context(SID_B)), err("owner_session_revoked"));
  await assert.rejects(restarted.consumeGrant(context(SID_B), "ACCOUNT_OPS_RESTORE", PLAN, phoneGrant.grant), err("owner_session_revoked"));
}));

test("audit carries linked minimized recovery receipts and a validated hash chain", () => fixture(async ({ service, store }) => {
  await service.register(context());
  const grant = await service.issueGrant(context(), "ACCOUNT_OPS_RESTORE", PLAN, "fresh-owner-proof");
  await service.consumeGrant(context(), "ACCOUNT_OPS_RESTORE", PLAN, grant.grant);
  await service.recordRecoveryOutcome(context(), PLAN, "COMPLETED", 8);
  await service.recordRecoveryOutcome(context(), PLAN, "FAILED", 0);
  const audit = await service.audit(context());
  assert.equal(audit.entries.length, 5);
  assert.equal(audit.entries[3].count, 8);
  assert.equal(audit.entries[3].planDigest, PLAN);
  assert.equal(audit.entries[4].previousHash, audit.entries[3].sha256);
  assert.equal(JSON.stringify(audit).includes("supabase:owner"), false);
  await assert.rejects(service.recordRecoveryOutcome(context(), PLAN, "COMPLETED", -1), err("invalid_audit_summary"));
  assert.equal((await store.read(context().owner)).audit.length, 5);
}));

test("corrupt audit/ledger never becomes an empty writable fallback", () => fixture(async ({ service, root }) => {
  await service.register(context());
  const path = join(root, securityDigest(context().owner.ownerSubject), "security.json");
  const state = JSON.parse(await readFile(path, "utf8")); state.audit[0].action = "RECOVERY_COMPLETED";
  const raw = JSON.stringify(state); await writeFile(path, raw);
  await assert.rejects(service.assertActive(context()), err("session_store_unreadable"));
  await assert.rejects(service.register(context(SID_B)), err("session_store_unreadable"));
  assert.equal(await readFile(path, "utf8"), raw);
}));

test("cross-instance lock excludes overlapping operations and stale locks fail closed", () => fixture(async ({ store, service, root }) => {
  await service.register(context());
  let enter; let release;
  const ready = new Promise((resolve) => { enter = resolve; });
  const pending = store.transaction(context().owner, async () => { enter(); await new Promise((resolve) => { release = resolve; }); });
  await ready;
  await assert.rejects(new FilesystemOwnerSecurityStore(root).read(context().owner), err("session_operation_pending"));
  release(); await pending;
  await writeFile(join(root, securityDigest(context().owner.ownerSubject), "operation.lock"), "interrupted");
  await assert.rejects(service.assertActive(context()), err("session_operation_pending"));
}));

test("grant consumption and failed operations do not partially alter the security ledger", () => fixture(async ({ service, store }) => {
  await service.register(context());
  const before = await store.read(context().owner);
  await assert.rejects(store.transaction(context().owner, async (state) => { state.sessions[0].revokedAt = new Date(NOW).toISOString(); throw new Error("Injected write fault"); }), /Injected write fault/);
  assert.deepEqual(await store.read(context().owner), before);
}));

async function withServer(service, run, { resolve = true } = {}) {
  const contexts = { "owner-a": context(), "owner-b": context(SID_B), other: context(SID_A, "other") };
  const security = createOwnerSecurity({ env: { CODE3_OWNER_SUBJECTS: "supabase:owner" }, runtimeKind: "production", now: () => NOW,
    identityProvider: { providerId: "supabase", isConfigured: () => true, async verifyAccessToken(token) { return contexts[token] ? { ok: true, principal: contexts[token].owner.principal } : { ok: false, reason: "invalid" }; } } });
  const options = { requireOwner: security.requireOwner, service, ...(resolve ? { resolveSession: async (request) => contexts[String(request.headers.authorization || "").replace("Bearer ", "")] || null } : {}) };
  const app = express();
  app.use("/sessions", createProtectedCors({ env: { CODE3_CORS_ALLOWED_ORIGINS: "https://code3.example.test" }, runtimeKind: "production" }), createOwnerSessionsRouter(options));
  app.get("/guarded", security.requireOwner, createOwnerSessionGuard(options), (_request, response) => response.json({ ok: true }));
  app.use((error, _request, response, _next) => response.status(error.status || 503).json({ error: error.code }));
  const server = await new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("session routes authorize before parsing and remain unavailable by default", () => withServer(undefined, async (base) => {
  const anonymous = await fetch(`${base}/sessions/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{bad" });
  assert.equal(anonymous.status, 401);
  assert.equal((await fetch(`${base}/sessions`, { headers: { Authorization: "Bearer other" } })).status, 403);
  assert.equal((await fetch(`${base}/sessions`, { headers: { Authorization: "Bearer owner-a" } })).status, 503);
  assert.equal((await fetch(`${base}/sessions`, { headers: { Authorization: "Bearer owner-a", Origin: "https://hostile.example" } })).status, 403);
}));

test("registered HTTP sessions require fresh plan confirmation and revocation blocks guarded routes", () => fixture(async ({ service }) => withServer(service, async (base) => {
  const headers = { Authorization: "Bearer owner-a", "Content-Type": "application/json" };
  const first = await (await fetch(`${base}/sessions/register`, { method: "POST", headers, body: JSON.stringify({ label: "Desktop" }) })).json();
  assert.ok(first.session.id);
  assert.equal((await fetch(`${base}/guarded`, { headers })).status, 200);
  const issue = await fetch(`${base}/sessions/confirmation`, { method: "POST", headers, body: JSON.stringify({ purpose: "SESSION_REVOKE", planDigest: service.revokeIntent(first.session.id), proof: "fresh-owner-proof" }) });
  assert.equal(issue.status, 200); const { confirmation } = await issue.json();
  const revoked = await fetch(`${base}/sessions/${first.session.id}/revoke`, { method: "POST", headers, body: JSON.stringify({ grant: confirmation.grant }) });
  assert.equal(revoked.status, 200);
  assert.equal((await fetch(`${base}/guarded`, { headers })).status, 401);
  assert.equal((await fetch(`${base}/sessions/register`, { method: "POST", headers, body: "{}" })).status, 401);
})));

test("missing trusted session resolver cannot be bypassed with a request session ID", () => fixture(async ({ service }) => withServer(service, async (base) => {
  const response = await fetch(`${base}/sessions/register`, { method: "POST", headers: { Authorization: "Bearer owner-a", "Content-Type": "application/json" }, body: JSON.stringify({ providerSessionId: SID_A }) });
  assert.equal(response.status, 503);
}, { resolve: false })));
