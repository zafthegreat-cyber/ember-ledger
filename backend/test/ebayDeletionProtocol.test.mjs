import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { createEbayDeletionProtocol } = require("../dist/ebayNotifications/protocol.js");
const configuration = { endpoint: "https://app.code3tcg.example/api/ebay/deletion", verificationToken: "synthetic-token-for-local-protocol-tests-only", environment: "production", timeoutMs: 100 };
const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const alternateKeys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
const message = () => ({
  metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "1.0", deprecated: false },
  notification: { notificationId: "synthetic-event-1", eventDate: "2026-10-20T14:00:00.000Z", publishDate: "2026-10-20T14:00:01.000Z", publishAttemptCount: 1,
    data: { userId: "synthetic-ebay-user", username: "synthetic-collector", eiasToken: "synthetic-legacy-identity" } },
});
function request(body = Buffer.from(JSON.stringify(message())), { kid = "test-key-1", key = keys.privateKey, digest = "SHA1", alg = "ECDSA" } = {}) {
  const signature = sign(digest === "SHA256" ? "sha256" : "sha1", body, key).toString("base64");
  return { rawBody: body, signatureHeader: Buffer.from(JSON.stringify({ alg, kid, digest, signature })).toString("base64"), contentType: "application/json; charset=utf-8" };
}
function setup(overrides = {}, config = configuration) {
  const calls = { token: 0, fetch: [], accepts: [] };
  const protocol = createEbayDeletionProtocol(config, {
    getApplicationToken: async () => { calls.token += 1; return "synthetic-application-token"; },
    fetchPublicKey: async (url, init) => {
      calls.fetch.push({ url, init });
      return Response.json({ algorithm: "ECDSA", digest: "SHA1", key: publicKey });
    },
    acceptVerifiedNotification: async (event) => { calls.accepts.push(event); return { status: "durably_accepted", receiptId: "synthetic-receipt" }; },
    ...overrides,
  });
  return { protocol, calls };
}

test("challenge hashes exact challenge, token and configured endpoint in required order", () => {
  const { protocol } = setup();
  // Independently computed with .NET SHA256.HashData, not the module under test.
  const expected = "ef5e365148c92e8887fafe1225f2986c36cca40f87d53cef731d1434706045cc";
  assert.deepEqual(protocol.challenge("fixture-challenge"), { challengeResponse: expected });
  assert.notDeepEqual(setup({}, { ...configuration, endpoint: configuration.endpoint + "/" }).protocol.challenge("fixture-challenge"), protocol.challenge("fixture-challenge"));
});

test("challenge rejects missing, duplicate, non-string, control-character and excessive input", () => {
  const { protocol } = setup();
  for (const invalid of [undefined, null, "", ["a", "b"], {}, "x\n", "x".repeat(1025)]) assert.throws(() => protocol.challenge(invalid), /challenge is invalid/);
});

test("configuration rejects nonpublic endpoint forms, credentials, query, fragment and invalid tokens", () => {
  for (const endpoint of ["http://app.example.com/a", "https://127.0.0.1/a", "https://[::1]/a", "https://localhost/a", "https://app.local/a", "https://user:secret@example.com/a", "https://example.com/a?q=b", "https://example.com/a#b", "https://example.com:8080/a", " https://example.com/a"]) {
    assert.throws(() => setup({}, { ...configuration, endpoint }), /^Error: eBay notification configuration is invalid\.$/);
  }
  for (const verificationToken of ["short", "a".repeat(81), "a".repeat(31) + "+", "a".repeat(31) + "\n"]) assert.throws(() => setup({}, { ...configuration, verificationToken }));
  for (const timeoutMs of [0, 99, 5001, 100.5]) assert.throws(() => setup({}, { ...configuration, timeoutMs }));
  assert.throws(() => setup({}, { ...configuration, environment: "attacker" }));
});

test("valid real EC signature reaches explicit durable acceptance, without claiming deletion completed", async () => {
  const { protocol, calls } = setup();
  const input = request();
  assert.deepEqual(await protocol.receive(input), { status: 202, code: "accepted_for_processing" });
  assert.equal(calls.accepts.length, 1);
  assert.equal(calls.accepts[0].data.userId, "synthetic-ebay-user");
  assert.equal(calls.accepts[0].payloadSha256, createHash("sha256").update(input.rawBody).digest("hex"));
  assert.ok(Object.isFrozen(calls.accepts[0]) && Object.isFrozen(calls.accepts[0].data));
  assert.equal(calls.fetch[0].url, "https://api.ebay.com/commerce/notification/v1/public_key/test-key-1");
  assert.equal(calls.fetch[0].init.redirect, "error");
  assert.equal(calls.fetch[0].init.headers.Authorization, "Bearer synthetic-application-token");
});

test("sandbox uses only fixed sandbox origin", async () => {
  const { protocol, calls } = setup({}, { ...configuration, environment: "sandbox" });
  assert.equal((await protocol.receive(request())).status, 202);
  assert.match(calls.fetch[0].url, /^https:\/\/api\.sandbox\.ebay\.com\/commerce\/notification\/v1\/public_key\//);
});

test("supported labels accept case variations and eBay single-line PEM wrappers", async () => {
  const { protocol } = setup({ fetchPublicKey: async () => Response.json({ algorithm: "ecdsa", digest: "sha1", key: publicKey.replace(/\r?\n/g, "") }) });
  const input = request(undefined, { alg: "ecdsa" });
  const header = JSON.parse(Buffer.from(input.signatureHeader, "base64").toString("utf8"));
  header.digest = "sha1";
  input.signatureHeader = Buffer.from(JSON.stringify(header)).toString("base64");
  assert.equal((await protocol.receive(input)).status, 202);
});

test("missing durable receiver or transport never acknowledges or fetches anything", async () => {
  for (const missing of ["acceptVerifiedNotification", "fetchPublicKey", "getApplicationToken"]) {
    const { protocol, calls } = setup({ [missing]: undefined });
    assert.deepEqual(await protocol.receive(request()), { status: 503, code: "processing_unavailable" });
    assert.equal(calls.fetch.length, 0);
    assert.equal(calls.accepts.length, 0);
  }
});

test("changed bytes and wrong signing key fail without processing", async () => {
  const { protocol, calls } = setup();
  const changed = request();
  changed.rawBody = Buffer.concat([changed.rawBody, Buffer.from(" ")]);
  assert.equal((await protocol.receive(changed)).status, 412);
  assert.equal((await protocol.receive(request(undefined, { key: alternateKeys.privateKey }))).status, 412);
  assert.equal(calls.accepts.length, 0);
});

test("raw whitespace and UTF-8 are verified as received, not reserialized", async () => {
  const { protocol, calls } = setup();
  const payload = message(); payload.notification.data.username = "collecteur-étoile";
  assert.equal((await protocol.receive(request(Buffer.from(JSON.stringify(payload, null, 2) + "\n")))).status, 202);
  assert.equal(calls.accepts[0].data.username, "collecteur-étoile");
});

test("malformed, duplicate, oversized and unsupported signature headers fail before key lookup", async () => {
  const { protocol, calls } = setup();
  for (const signatureHeader of [undefined, "", ["a", "b"], "not base64", "e30=", "x".repeat(4097), Buffer.from("{bad").toString("base64")]) {
    assert.equal((await protocol.receive({ ...request(), signatureHeader })).status, 412);
  }
  for (const options of [{ kid: "../private" }, { kid: "https://evil.example/key" }, { kid: "%2F" }, { kid: "a".repeat(201) }, { alg: "RSA" }, { digest: "SHA256" }]) {
    assert.equal((await protocol.receive(request(undefined, options))).status, 412);
  }
  assert.equal(calls.fetch.length, 0);
});

test("raw input and content type limits reject before processing", async () => {
  const { protocol, calls } = setup();
  assert.equal((await protocol.receive({ ...request(), rawBody: "{}" })).status, 400);
  assert.equal((await protocol.receive({ ...request(), rawBody: Buffer.alloc(0) })).status, 400);
  assert.equal((await protocol.receive({ ...request(), rawBody: Buffer.alloc(65537) })).status, 413);
  for (const contentType of [undefined, "text/plain", "application/json; charset=utf-16", "application/json, application/json"]) assert.equal((await protocol.receive({ ...request(), contentType })).status, 415);
  assert.equal(calls.fetch.length, 0);
});

test("invalid signed schema and malformed JSON never reach durable receiver", async () => {
  const { protocol, calls } = setup();
  const mutations = [
    (x) => { x.metadata.topic = "OTHER_TOPIC"; },
    (x) => { x.metadata.schemaVersion = "2.0"; },
    (x) => { x.metadata.deprecated = true; },
    (x) => { delete x.notification.data.userId; },
    (x) => { x.notification.publishAttemptCount = 0; },
    (x) => { x.notification.eventDate = "invalid-date"; },
    (x) => { x.notification.notificationId = "a\n"; },
  ];
  for (const mutate of mutations) { const payload = message(); mutate(payload); assert.equal((await protocol.receive(request(Buffer.from(JSON.stringify(payload))))).status, 400); }
  assert.equal((await protocol.receive(request(Buffer.from("{bad")))).status, 400);
  assert.equal((await protocol.receive(request(Buffer.from([0xff])))).status, 400);
  assert.equal(calls.accepts.length, 0);
});

test("trusted public-key metadata and EC key type must match supported signature protocol", async () => {
  const rsaKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" });
  for (const body of [
    { algorithm: "RSA", digest: "SHA1", key: publicKey },
    { algorithm: "ECDSA", digest: "SHA256", key: publicKey },
    { algorithm: "ECDSA", digest: "SHA1", key: "not-a-key" },
    { algorithm: "ECDSA", digest: "SHA1", key: rsaKey },
    { algorithm: "ECDSA", digest: "SHA1", key: "k".repeat(16385) },
  ]) {
    const { protocol, calls } = setup({ fetchPublicKey: async () => Response.json(body) });
    assert.deepEqual(await protocol.receive(request()), { status: 503, code: "verification_unavailable" });
    assert.equal(calls.accepts.length, 0);
  }
});

test("upstream error, redirect, response type and oversized response are generic and do not leak payload", async () => {
  for (const response of [new Response("secret-upstream-diagnostic", { status: 500 }), new Response(null, { status: 302, headers: { location: "https://evil.example" } }), new Response("<html>private</html>", { headers: { "content-type": "text/html" } }), new Response("x".repeat(16385), { headers: { "content-type": "application/json" } })]) {
    const { protocol } = setup({ fetchPublicKey: async () => response });
    assert.deepEqual(await protocol.receive(request()), { status: 503, code: "verification_unavailable" });
  }
});

test("token and key failures are redacted and timeout aborts the token dependency", async () => {
  const failed = setup({ getApplicationToken: async () => { throw new Error("PRIVATE_CREDENTIAL_VALUE"); } });
  assert.deepEqual(await failed.protocol.receive(request()), { status: 503, code: "verification_unavailable" });
  let signal;
  const hanging = setup({ getApplicationToken: async (inputSignal) => { signal = inputSignal; return new Promise(() => {}); } });
  assert.deepEqual(await hanging.protocol.receive(request()), { status: 503, code: "verification_unavailable" });
  assert.equal(signal.aborted, true);
});

test("cache coalesces concurrent key retrieval and expires at one hour", async () => {
  let time = 0;
  const { protocol, calls } = setup({ now: () => time });
  assert.deepEqual((await Promise.all([protocol.receive(request()), protocol.receive(request())])).map(x => x.status), [202, 202]);
  assert.equal(calls.fetch.length, 1);
  time = 3599999;
  assert.equal((await protocol.receive(request())).status, 202);
  assert.equal(calls.fetch.length, 1);
  time = 3600000;
  assert.equal((await protocol.receive(request())).status, 202);
  assert.equal(calls.fetch.length, 2);
});

test("cache is bounded and evicts old keys", async () => {
  const { protocol, calls } = setup();
  for (let i = 0; i < 33; i += 1) assert.equal((await protocol.receive(request(undefined, { kid: `key-${i}` }))).status, 202);
  assert.equal((await protocol.receive(request(undefined, { kid: "key-0" }))).status, 202);
  assert.equal(calls.fetch.length, 34);
});

test("distinct in-flight key requests are bounded", async () => {
  let fetchCount = 0;
  const { protocol } = setup({ fetchPublicKey: async () => { fetchCount += 1; return new Promise(() => {}); } });
  const results = await Promise.all(Array.from({ length: 9 }, (_, i) => protocol.receive(request(undefined, { kid: `key-${i}` }))));
  assert.equal(results.filter(x => x.status === 503).length, 9);
  assert.equal(fetchCount, 8);
});

test("durable storage failure, timeout and ambiguous receipt never produce successful ack", async () => {
  for (const acceptVerifiedNotification of [async () => { throw new Error("PRIVATE_STORAGE_CREDENTIAL"); }, async () => undefined, async () => ({ status: "done", receiptId: "fake" }), async () => ({ status: "durably_accepted", receiptId: "" }), async () => new Promise(() => {})]) {
    const { protocol } = setup({ acceptVerifiedNotification });
    assert.deepEqual(await protocol.receive(request()), { status: 503, code: "processing_unavailable" });
  }
});

test("idempotent receiver can acknowledge retries without duplicate work; module does not claim an in-memory inbox", async () => {
  const receipts = new Map(); let processingItems = 0;
  const { protocol } = setup({ acceptVerifiedNotification: async (notification) => {
    if (receipts.has(notification.notificationId)) return { status: "already_accepted", receiptId: receipts.get(notification.notificationId) };
    processingItems += 1; receipts.set(notification.notificationId, "test-receipt-only");
    return { status: "durably_accepted", receiptId: "test-receipt-only" };
  } });
  assert.equal((await protocol.receive(request())).status, 202);
  const retry = message(); retry.notification.publishAttemptCount = 2; retry.notification.publishDate = "2026-10-20T14:01:00.000Z";
  assert.equal((await protocol.receive(request(Buffer.from(JSON.stringify(retry))))).status, 202);
  assert.equal(processingItems, 1);
});

test("caller mutation during key lookup cannot change the verified or accepted bytes", async () => {
  let release;
  const pause = new Promise(resolve => { release = resolve; });
  const { protocol, calls } = setup({ getApplicationToken: async () => { await pause; return "synthetic-token"; } });
  const input = request(); const outcome = protocol.receive(input);
  input.rawBody.fill(0); release();
  assert.equal((await outcome).status, 202);
  assert.equal(calls.accepts[0].data.userId, "synthetic-ebay-user");
});
