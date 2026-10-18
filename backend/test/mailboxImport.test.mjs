import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import express from "express";

process.env.NODE_ENV = "test";
delete process.env.VERCEL;
delete process.env.VERCEL_ENV;
const require = createRequire(import.meta.url);
const { validateMailboxImportInput, MAILBOX_IMPORT_LIMITS } = require("../dist/mailboxImport/contracts.js");
const { createMailboxPull, mailboxAccountReference, mailboxMessageSourceId } = require("../dist/mailboxImport/imapPull.js");
const { createMailboxImportRouter, mailboxTransportAllowed } = require("../dist/routes/mailboxImport.routes.js");
const { createOwnerSecurity } = require("../dist/auth/ownerAuthorization.js");
const { createProtectedCors } = require("../dist/security/corsPolicy.js");
const NOW = Date.now();
const PATH = "/api/account-ops/mailbox-import";
const APP_PASSWORD = "mailbox-test-app-secret";
const RAW = Buffer.from("Content-Type: text/plain; charset=utf-8\r\n\r\nOrder confirmation. Item: Test booster. Total: $10.00.");
const owner = (subject = "owner-subject") => ({ provider: "supabase", subject, expiresAt: Math.floor(Date.now() / 1_000) + 3_600, issuedAt: Math.floor(NOW / 1_000) - 60 });
const input = (patch = {}) => ({ provider: "aol", mailboxAddress: "owner@aol.com", appPassword: APP_PASSWORD, days: 30, ...patch });
const header = (uid = 1, patch = {}) => ({ uid, size: RAW.length, internalDate: new Date(NOW - 1_000), envelope: { subject: "Order confirmation", from: [{ address: "orders@target.com" }] }, ...patch });
const receipt = (value) => ({
  sourceId: value.sourceId, provider: value.provider, accountReference: value.accountReference,
  retailerId: "retailer-preset:target", retailerLabel: "Target", orderId: "test-order", receivedAt: value.receivedAt,
  orderedAt: null, currency: "USD", totalMinorUnits: 1_000,
  items: [{ description: "Test booster", quantity: 1, unitPriceMinorUnits: 1_000, lineTotalMinorUnits: 1_000 }], warnings: ["Review required"],
});

function harness(options = {}) {
  const calls = [];
  const config = [];
  const errors = [];
  const headers = options.headers || [header()];
  let closed = 0;
  const client = {
    mailbox: { exists: options.exists ?? headers.length, uidValidity: options.uidValidity || 999n, readOnly: options.readOnly ?? true },
    async connect() { calls.push(["connect"]); if (options.connect) return options.connect(); },
    async getMailboxLock(path, flags) { calls.push(["lock", path, flags]); return { release: () => calls.push(["release"]) }; },
    async *fetch(range, query) { calls.push(["headers", range, query]); for (const row of headers) yield row; },
    async fetchOne(uid, query, flags) {
      calls.push(["body", uid, query, flags]);
      return options.fetchOne ? options.fetchOne(uid) : { uid, source: RAW };
    },
    close() { closed += 1; calls.push(["close"]); },
    on(event, handler) { errors.push(handler); calls.push(["on", event]); },
  };
  const parseInputs = [];
  const pull = createMailboxPull({
    now: () => NOW,
    clientFactory: (value) => { config.push(value); return client; },
    parseMime: options.parseMime || (async () => ({ text: "safe normalized receipt text", html: false })),
    isReceiptHeader: options.isReceiptHeader || ((value) => value.senderAddress.endsWith("@target.com") && value.subject === "Order confirmation"),
    parseReceipt: (value) => { parseInputs.push(value); return options.parseReceipt ? options.parseReceipt(value) : receipt(value); },
    ...(options.maximumDurationMs ? { maximumDurationMs: options.maximumDurationMs } : {}),
  });
  return { pull, calls, config, parseInputs, errors, client, get closed() { return closed; } };
}

test("request accepts only explicit supported provider/date and bounded credentials", () => {
  assert.deepEqual(validateMailboxImportInput(input({ mailboxAddress: "OWNER@AOL.COM" })), input());
  for (const bad of [null, [], {}, input({ provider: "outlook" }), input({ provider: "" }), input({ days: "30" }), input({ days: 365 }), input({ host: "127.0.0.1" }), input({ appPassword: "short" }), input({ appPassword: "validpassword\r\nAUTH" }), input({ mailboxAddress: "name@example.test/path" })]) {
    assert.throws(() => validateMailboxImportInput(bad), { code: "mailbox_request_invalid" });
  }
});

test("all three providers use fixed TLS hosts and read-only UID body reads without retaining credentials", async () => {
  for (const [provider, host] of [["aol", "imap.aol.com"], ["gmail", "imap.gmail.com"], ["yahoo", "imap.mail.yahoo.com"]]) {
    const h = harness();
    const request = input({ provider });
    const result = await h.pull(owner(), request);
    const settings = h.config[0];
    assert.equal(settings.host, host);
    assert.equal(settings.port, 993);
    assert.equal(settings.secure, true);
    assert.deepEqual(settings.tls, { rejectUnauthorized: true, minVersion: "TLSv1.2" });
    for (const name of ["logger", "logRaw", "emitLogs"]) assert.equal(settings[name], false);
    assert.equal(settings.auth.pass, "");
    assert.equal(request.appPassword, "");
    assert.ok(h.calls.some((call) => call[0] === "lock" && call[1] === "INBOX" && call[2].readOnly === true));
    assert.deepEqual(h.calls.find((call) => call[0] === "body"), ["body", 1, { source: { start: 0, maxLength: 524_288 } }, { uid: true }]);
    assert.ok(h.closed > 0);
    assert.equal(result.format, "code3.purchase-email-preview.v1");
    assert.equal(result.candidates.length, 1);
    assert.equal(result.scannedMessages, 1);
    assert.equal(result.skippedMessages, 0);
    assert.equal(result.truncated, false);
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(APP_PASSWORD));
    assert.ok(!serialized.includes("owner@aol.com"));
    assert.ok(!serialized.includes("Order confirmation"));
    assert.ok(!serialized.includes("safe normalized receipt text"));
    assert.match(result.candidates[0].sourceId, /^email:[a-f0-9]{64}$/);
    assert.match(result.candidates[0].accountReference, /^mailbox:[a-f0-9]{64}$/);
  }
});

test("source identities are stable per verified owner/mailbox/UIDVALIDITY/UID", () => {
  const account = mailboxAccountReference(owner(), "aol", "owner@aol.com");
  assert.equal(account, mailboxAccountReference(owner(), "aol", "OWNER@AOL.COM"));
  assert.notEqual(account, mailboxAccountReference(owner("other"), "aol", "owner@aol.com"));
  assert.notEqual(account, mailboxAccountReference(owner(), "gmail", "owner@aol.com"));
  assert.notEqual(account, mailboxAccountReference(owner(), "aol", "other@aol.com"));
  const id = mailboxMessageSourceId(account, "999", 1);
  assert.equal(id, mailboxMessageSourceId(account, "999", 1));
  assert.notEqual(id, mailboxMessageSourceId(account, "1000", 1));
  assert.notEqual(id, mailboxMessageSourceId(account, "999", 2));
});

test("real MIME/parser boundary returns minimized receipt fields and excludes protected bodies", async () => {
  for (const [text, expected] of [
    ["Thanks for your order!\nOrder number: T123-456789\nOrder date: 2026-10-17\nOrder total: $54.99", 1],
    ["Verification code: 123456\nOrder total: $54.99", 0],
  ]) {
    const source = Buffer.from(`From: orders@target.com\r\nSubject: Order confirmation\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}`);
    const h = harness({ headers: [header(1, { size: source.length })], fetchOne: async (uid) => ({ uid, source }) });
    const pull = createMailboxPull({ now: () => NOW, clientFactory: () => h.client });
    const preview = await pull(owner(), input());
    assert.equal(preview.candidates.length, expected);
    if (expected) {
      assert.equal(preview.candidates[0].orderId, "T123-456789");
      assert.equal(preview.candidates[0].totalMinorUnits, 5499);
      assert.equal(preview.candidates[0].retailerId, "target");
    }
    assert.doesNotMatch(JSON.stringify(preview), /123456|appPassword|orders@target.com|Content-Type|subject|html|textAsHtml/);
  }
});

test("headers are bounded to latest 500 and only up to 25 matching recent bodies are fetched", async () => {
  const h = harness({ exists: 10_000, headers: Array.from({ length: 500 }, (_, index) => header(index + 1)) });
  const result = await h.pull(owner(), input());
  assert.equal(h.calls.find((call) => call[0] === "headers")[1], "9501:10000");
  assert.equal(h.calls.filter((call) => call[0] === "body").length, 25);
  assert.equal(result.scannedMessages, 500);
  assert.equal(result.candidates.length, 25);
  assert.equal(result.skippedMessages, 475);
  assert.equal(result.truncated, true);
});

test("date, unrelated, ambiguous sender, oversized MIME and byte-budget cases do not fetch excess bodies", async () => {
  const h = harness({ headers: [
    header(1, { internalDate: new Date(NOW - 31 * 86_400_000) }),
    header(2, { envelope: { subject: "Personal message", from: [{ address: "friend@example.test" }] } }),
    header(3, { size: MAILBOX_IMPORT_LIMITS.bodyBytes + 1 }),
    header(4, { envelope: { subject: "Order confirmation", from: [{ address: "orders@target.com" }, { address: "friend@example.test" }] } }),
    header(5),
  ] });
  const result = await h.pull(owner(), input());
  assert.deepEqual(h.calls.filter((call) => call[0] === "body").map((call) => call[1]), [5]);
  assert.equal(result.skippedMessages, 4);
  assert.equal(result.truncated, true);
  const large = Buffer.alloc(MAILBOX_IMPORT_LIMITS.bodyBytes, "x");
  const limited = harness({ headers: Array.from({ length: 10 }, (_, index) => header(index + 1, { size: large.length })), fetchOne: async (uid) => ({ uid, source: large }) });
  const bounded = await limited.pull(owner(), input());
  assert.equal(limited.calls.filter((call) => call[0] === "body").length, 8);
  assert.equal(bounded.truncated, true);
  const inconsistent = harness({ headers: Array.from({ length: 25 }, (_, index) => header(index + 1)), fetchOne: async (uid) => ({ uid: uid + 100, source: large }) });
  const ignored = await inconsistent.pull(owner(), input());
  assert.equal(inconsistent.calls.filter((call) => call[0] === "body").length, 8);
  assert.equal(ignored.candidates.length, 0);
  assert.equal(ignored.truncated, true);
});

test("truncated, wrong-UID and invalid MIME do not create receipts", async () => {
  for (const fetchOne of [async (uid) => ({ uid, source: RAW.subarray(0, 20) }), async (uid) => ({ uid: uid + 1, source: RAW })]) {
    const h = harness({ fetchOne });
    const result = await h.pull(owner(), input());
    assert.equal(result.candidates.length, 0);
    assert.equal(h.parseInputs.length, 0);
  }
  const invalid = harness({ parseMime: async () => { throw new Error("unsafe MIME content"); } });
  assert.equal((await invalid.pull(owner(), input())).candidates.length, 0);
});

test("read-only confirmation, real owner and session expiry fail closed", async () => {
  const h = harness({ readOnly: false });
  await assert.rejects(h.pull(owner(), input()), { code: "mailbox_unavailable" });
  assert.equal(h.calls.some((call) => call[0] === "headers"), false);
  for (const principal of [{ ...owner(), provider: "local-development" }, { ...owner(), provider: "automated-test" }, { ...owner(), expiresAt: 1 }]) {
    const denied = harness();
    await assert.rejects(denied.pull(principal, input()), { code: "mailbox_owner_required" });
    assert.equal(denied.config.length, 0);
  }
});

test("provider authentication and transport errors never echo provider text or secrets", async () => {
  for (const error of [Object.assign(new Error(`AUTH ${APP_PASSWORD} owner@aol.com`), { authenticationFailed: true }), new Error(`raw body ${APP_PASSWORD}`)]) {
    const h = harness({ connect: async () => { throw error; } });
    await assert.rejects(h.pull(owner(), input()), (caught) => {
      assert.ok(!caught.message.includes(APP_PASSWORD));
      assert.ok(!caught.message.includes("owner@aol.com"));
      assert.ok(!caught.message.includes("raw body"));
      return true;
    });
    assert.ok(h.closed > 0);
  }
});

test("deadline and request abort close the socket and prevent late parsing", async () => {
  const hanging = harness({ connect: () => new Promise(() => {}), maximumDurationMs: 15 });
  await assert.rejects(hanging.pull(owner(), input()), { code: "mailbox_timeout" });
  assert.ok(hanging.closed > 0);
  let release;
  let started;
  const parsing = new Promise((resolve) => { started = resolve; });
  const h = harness({ parseMime: () => { started(); return new Promise((resolve) => { release = resolve; }); } });
  const controller = new AbortController();
  const pending = h.pull(owner(), input(), controller.signal);
  await parsing;
  controller.abort();
  await assert.rejects(pending, { code: "mailbox_cancelled" });
  release({ text: "late receipt" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.parseInputs.length, 0);
  assert.ok(h.closed > 0);
});

function testSecurity() {
  return createOwnerSecurity({
    env: { CODE3_OWNER_SUBJECTS: "supabase:owner-subject" }, runtimeKind: "production",
    identityProvider: {
      providerId: "supabase", isConfigured: () => true,
      async verifyAccessToken(token) {
        if (token === "owner-token") return { ok: true, principal: owner() };
        if (token === "non-owner-token") return { ok: true, principal: owner("other-subject") };
        if (token === "unavailable-token") return { ok: false, reason: "unavailable" };
        return { ok: false, reason: "invalid" };
      },
    },
  });
}

function createApp(pull, options = {}) {
  const app = express();
  app.use(PATH, createProtectedCors({ env: { CODE3_CORS_LOCAL_ORIGINS: "https://app.example.test" }, runtimeKind: "automated-test" }),
    createMailboxImportRouter({ requireOwner: testSecurity().requireOwner, pull, env: { NODE_ENV: "test" }, maximumRequests: 100, ...options }));
  return app;
}

async function withServer(app, action) {
  const server = await new Promise((resolve) => { const value = app.listen(0, "127.0.0.1", () => resolve(value)); });
  try { await action(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

const auth = (token = "owner-token") => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json", Origin: "https://app.example.test" });
const emptyPreview = () => ({ format: "code3.purchase-email-preview.v1", candidates: [], scannedMessages: 0, skippedMessages: 0, truncated: false, days: 30 });

test("route authenticates before body parsing and never calls pull for nonowners", async () => {
  let pulls = 0;
  await withServer(createApp(async () => { pulls += 1; return emptyPreview(); }), async (base) => {
    for (const [token, status] of [[null, 401], ["non-owner-token", 403], ["bad-token", 401], ["unavailable-token", 503]]) {
      const response = await fetch(`${base}${PATH}/preview`, { method: "POST", headers: token ? auth(token) : { "Content-Type": "application/json" }, body: "{" });
      assert.equal(response.status, status);
      assert.ok(!JSON.stringify(await response.json()).includes("parse"));
    }
    assert.equal(pulls, 0);
    const blocked = await fetch(`${base}${PATH}/preview`, { method: "POST", headers: { ...auth(), Origin: "https://evil.example.test" }, body: JSON.stringify(input()) });
    assert.equal(blocked.status, 403);
    assert.equal(pulls, 0);
  });
});

test("route returns exact transient status and preview with no-store, validates bounded input", async () => {
  let delivered;
  await withServer(createApp(async (_owner, value) => { delivered = value; return emptyPreview(); }), async (base) => {
    const status = await fetch(`${base}${PATH}/status`, { headers: auth() });
    assert.equal(status.status, 200);
    assert.equal(status.headers.get("cache-control"), "no-store");
    const capabilities = await status.json();
    assert.equal(capabilities.credentialStored, false);
    assert.equal(capabilities.mailboxReadOnly, true);
    assert.equal(capabilities.mode, "ONE_TIME_READ");
    assert.deepEqual(capabilities.providers, ["aol", "gmail", "yahoo"]);
    const response = await fetch(`${base}${PATH}/preview`, { method: "POST", headers: auth(), body: JSON.stringify(input()) });
    assert.deepEqual(await response.json(), { ok: true, ...emptyPreview() });
    assert.equal(delivered.appPassword, "");
    for (const [body, expected] of [["{", 400], [JSON.stringify(input({ host: "127.0.0.1" })), 400], ["x".repeat(5_000), 413]]) {
      const invalid = await fetch(`${base}${PATH}/preview`, { method: "POST", headers: auth(), body });
      assert.equal(invalid.status, expected);
      const text = await invalid.text();
      assert.ok(!text.includes(APP_PASSWORD));
      assert.ok(!text.includes("owner@aol.com"));
    }
  });
});

test("route rejects development pseudo-owner and untrusted forwarded transport", async () => {
  const requireOwner = (_request, response, next) => { response.locals.authPrincipal = { ...owner(), provider: "local-development" }; next(); };
  await withServer(createApp(async () => { throw new Error("Must not pull"); }, { requireOwner }), async (base) => {
    const response = await fetch(`${base}${PATH}/status`, { headers: auth() });
    assert.equal(response.status, 403);
  });
  const request = { secure: false, headers: { "x-forwarded-proto": "https" }, hostname: "app.example.test", socket: { remoteAddress: "203.0.113.4" } };
  assert.equal(mailboxTransportAllowed(request, { NODE_ENV: "production" }), false);
  assert.equal(mailboxTransportAllowed(request, { VERCEL: "1", VERCEL_ENV: "production" }), true);
  assert.equal(mailboxTransportAllowed({ ...request, headers: { "x-forwarded-proto": "https,http" } }, { VERCEL: "1" }), false);
  assert.equal(mailboxTransportAllowed({ ...request, hostname: "localhost" }, { NODE_ENV: "test" }), false);
  assert.equal(mailboxTransportAllowed({ ...request, hostname: "localhost", socket: { remoteAddress: "127.0.0.1" } }, { NODE_ENV: "test" }), true);
});

test("route rejects overlapping pulls, clears credentials, and aborts on response disconnect", async () => {
  let release;
  let started;
  let observedAbort;
  const didStart = new Promise((resolve) => { started = resolve; });
  const didAbort = new Promise((resolve) => { observedAbort = resolve; });
  const app = createApp(async (_principal, _input, signal) => {
    started();
    signal.addEventListener("abort", () => { observedAbort(); release(emptyPreview()); }, { once: true });
    return new Promise((resolve) => { release = resolve; });
  });
  await withServer(app, async (base) => {
    const controller = new AbortController();
    const first = fetch(`${base}${PATH}/preview`, { method: "POST", headers: auth(), body: JSON.stringify(input()), signal: controller.signal });
    await didStart;
    const overlapping = await fetch(`${base}${PATH}/preview`, { method: "POST", headers: auth(), body: JSON.stringify(input()) });
    assert.equal(overlapping.status, 409);
    controller.abort();
    await assert.rejects(first, { name: "AbortError" });
    await Promise.race([didAbort, new Promise((_resolve, reject) => setTimeout(() => reject(new Error("Request abort not forwarded")), 1_000))]);
  });
});
