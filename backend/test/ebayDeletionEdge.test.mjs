import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { createEbayNotificationHandler, createEbayNotificationRuntimeHandler, NOTIFICATION_ENDPOINT, PROJECT_URL } from "../../supabase/functions/ebay-account-deletion/handler.ts";

const env = { SUPABASE_URL: PROJECT_URL, SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key-not-real",
  EBAY_DELETION_VERIFICATION_TOKEN: "synthetic-verification-token-for-tests-only", EBAY_CLIENT_ID: "synthetic-id", EBAY_CLIENT_SECRET: "synthetic-client-secret" };
const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
function event() { return { metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "1.0", deprecated: false },
  notification: { notificationId: "synthetic-id-1", eventDate: "2026-10-20T14:00:00.000Z", publishDate: "2026-10-20T14:00:01.000Z", publishAttemptCount: 1,
    data: { userId: "synthetic-ebay-user", username: "synthetic-username" } } }; }
function signedRequest(payload = event(), headers = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  const signatureHeader = Buffer.from(JSON.stringify({ alg: "ECDSA", kid: "key-1", digest: "SHA1", signature: sign("sha1", body, keys.privateKey).toString("base64") })).toString("base64");
  return new Request(NOTIFICATION_ENDPOINT, { method: "POST", body, headers: { "content-type": "application/json", "x-ebay-signature": signatureHeader, ...headers } });
}
function setup({ environment = env, overrides = {}, now, runtime = false } = {}) {
  const calls = [];
  const accepted = new Map();
  const transport = async (url, init) => {
    const body = init.body ? JSON.parse(String(init.body).startsWith("{") ? String(init.body) : "{}") : {};
    calls.push({ url, init, body });
    const name = url.split("/").at(-1);
    if (overrides[name]) return overrides[name]({ url, init, body, accepted });
    if (url.endsWith("/identity/v1/oauth2/token")) return Response.json({ access_token: "synthetic-application-token", expires_in: 7200 });
    if (url.includes("/public_key/")) return Response.json({ algorithm: "ECDSA", digest: "SHA1", key: publicKey });
    if (name === "code3_ebay_runtime_config") return Response.json({ endpoint: NOTIFICATION_ENDPOINT, verificationToken: env.EBAY_DELETION_VERIFICATION_TOKEN, environment: "production", clientId: env.EBAY_CLIENT_ID, clientSecret: env.EBAY_CLIENT_SECRET, ownerId: "do-not-expose-owner" });
    if (name === "code3_ebay_accept_notification") {
      const exists = accepted.has(body.p_event_id); accepted.set(body.p_event_id, body);
      return Response.json({ status: exists ? "duplicate" : "accepted", event_id: body.p_event_id, durableReceipt: true });
    }
    if (name === "code3_ebay_process_notification") return Response.json({ status: "processed", event_id: body.p_event_id, matched_records: 1 });
    if (name === "code3_ebay_notification_status") return Response.json({ events: [{ event_id: "private-event", state: "needs_review", userId: "private-user", payload: event(), secret: "private-secret" }, { state: "processed" }, { state: "processed" }] });
    if (name === "code3_ebay_retry_notifications") return Response.json({ results: [{ status: "processed", event_id: "private-event-a", payload: event() }, { status: "needs_review", event_id: "private-event-b" }] });
    throw new Error("unexpected synthetic URL");
  };
  const options = { env: environment, fetchImpl: transport, now };
  return { handler: runtime ? createEbayNotificationRuntimeHandler(options) : createEbayNotificationHandler(options), calls, accepted };
}
const serviceHeaders = { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

test("deployed protocol copy matches backend-tested source except explicit Deno Buffer import", () => {
  const source = readFileSync(new URL("../src/ebayNotifications/protocol.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const edge = readFileSync(new URL("../../supabase/functions/ebay-account-deletion/protocol.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal(edge, 'import { Buffer } from "node:buffer";\n' + source);
});

test("Deno entrypoint reads only reviewed environment names and registers the runtime handler", () => {
  const source = readFileSync(new URL("../../supabase/functions/ebay-account-deletion/index.ts", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/m, "");
  const names = []; let registered; let options;
  runInNewContext(source, {
    Deno: { env: { get: (name) => { names.push(name); return env[name]; } }, serve: (handler) => { registered = handler; } },
    createEbayNotificationRuntimeHandler: (input) => { options = input; return "synthetic-handler"; },
    fetch: () => { throw new Error("must not fetch during registration"); },
  });
  assert.equal(registered, "synthetic-handler");
  assert.deepEqual(names, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "EBAY_DELETION_VERIFICATION_TOKEN", "EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"]);
  assert.equal(options.env.SUPABASE_URL, PROJECT_URL);
});

test("GET challenge works without eBay API keys and hashes configured HTTPS endpoint, not incoming Host", async () => {
  const { handler, calls } = setup({ environment: { ...env, EBAY_CLIENT_ID: undefined, EBAY_CLIENT_SECRET: undefined } });
  const response = await handler(new Request("https://attacker.example/functions/v1/ebay-account-deletion?challenge_code=fixture"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^application\/json/);
  assert.deepEqual(await response.json(), { challengeResponse: createHash("sha256").update("fixture" + env.EBAY_DELETION_VERIFICATION_TOKEN + NOTIFICATION_ENDPOINT).digest("hex") });
  assert.equal(calls.length, 0);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("GET rejects missing or duplicate challenge and never exposes secrets", async () => {
  const { handler } = setup();
  for (const suffix of ["", "?challenge_code=", "?challenge_code=a&challenge_code=b", "?challenge_code=a&secret=b"]) {
    const response = await handler(new Request(NOTIFICATION_ENDPOINT + suffix));
    assert.equal(response.status, 400);
    assert.doesNotMatch(await response.text(), /synthetic-verification|synthetic-client-secret/);
  }
});

test("server/configuration absence fails closed", async () => {
  for (const environment of [{ ...env, SUPABASE_URL: "https://attacker.example" }, { ...env, SUPABASE_SERVICE_ROLE_KEY: undefined }, { ...env, EBAY_DELETION_VERIFICATION_TOKEN: "short" }]) {
    const { handler, calls } = setup({ environment });
    assert.equal((await handler(new Request(NOTIFICATION_ENDPOINT + "?challenge_code=fixture"))).status, 503);
    assert.equal((await handler(signedRequest())).status, 503);
    assert.equal(calls.length, 0);
  }
});

test("POST without provider keys returns503 and performs no eBay or database calls", async () => {
  const { handler, calls } = setup({ environment: { ...env, EBAY_CLIENT_ID: undefined, EBAY_CLIENT_SECRET: undefined } });
  assert.deepEqual(await (await handler(signedRequest())).json(), { code: "processing_unavailable" });
  assert.equal(calls.length, 0);
});

test("valid signed delivery obtains server OAuth, durably accepts and processes before202", async () => {
  const { handler, calls, accepted } = setup();
  const response = await handler(signedRequest());
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { code: "accepted_for_processing" });
  assert.deepEqual(calls.map(x => x.url.split("/").at(-1)), ["token", "key-1", "code3_ebay_accept_notification", "code3_ebay_process_notification"]);
  const stored = accepted.get("synthetic-id-1");
  assert.equal(stored.p_payload.notification.data.userId, "synthetic-ebay-user");
  assert.match(stored.p_payload_sha256, /^[a-f0-9]{64}$/);
  assert.equal(calls[2].init.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal(calls[2].init.headers.Authorization, `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
  assert.match(calls[0].init.body, /grant_type=client_credentials/);
  assert.ok(calls.every(x => x.init.redirect === "error"));
});

test("invalid signature never reaches inbox or processor", async () => {
  const { handler, accepted } = setup();
  const input = signedRequest();
  const modified = new Request(NOTIFICATION_ENDPOINT, { method: "POST", headers: input.headers, body: JSON.stringify(event()) + " " });
  assert.equal((await handler(modified)).status, 412);
  assert.equal(accepted.size, 0);
});

test("inbox errors and ambiguous receipts never produce202", async () => {
  for (const receipt of [{ status: "accepted", event_id: "wrong", durableReceipt: true }, { status: "accepted", event_id: "synthetic-id-1" }, { status: "ok", event_id: "synthetic-id-1", durableReceipt: true }]) {
    const { handler, calls } = setup({ overrides: { code3_ebay_accept_notification: async () => Response.json(receipt) } });
    assert.equal((await handler(signedRequest())).status, 503);
    assert.ok(!calls.some(x => x.url.endsWith("code3_ebay_process_notification")));
  }
});

test("processor failure retains durable work and returns503 for eBay redelivery", async () => {
  const { handler, accepted } = setup({ overrides: { code3_ebay_process_notification: async ({ body }) => Response.json({ status: "failed", event_id: body.p_event_id, privateError: "do-not-expose" }) } });
  const response = await handler(signedRequest());
  assert.equal(response.status, 503);
  assert.equal(accepted.size, 1);
  assert.doesNotMatch(await response.text(), /private|synthetic-ebay-user|do-not-expose/);
});

test("needs_review may be durably acknowledged and is never labeled completed deletion", async () => {
  const { handler } = setup({ overrides: { code3_ebay_process_notification: async ({ body }) => Response.json({ status: "needs_review", event_id: body.p_event_id }) } });
  const response = await handler(signedRequest());
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { code: "accepted_for_processing" });
});

test("retry deliveries reuse cached OAuth/key and preserve event identity", async () => {
  const { handler, calls, accepted } = setup();
  assert.equal((await handler(signedRequest())).status, 202);
  const next = event(); next.notification.publishAttemptCount = 2;
  assert.equal((await handler(signedRequest(next))).status, 202);
  assert.equal(accepted.size, 1);
  assert.equal(calls.filter(x => x.url.endsWith("/token")).length, 1);
  assert.equal(calls.filter(x => x.url.includes("/public_key/")).length, 1);
});

test("request body limit, encoding and method boundaries reject before transport", async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(signedRequest(event(), { "content-length": "65537" }))).status, 413);
  assert.equal((await handler(signedRequest(event(), { "content-encoding": "gzip" }))).status, 400);
  assert.equal((await handler(new Request(NOTIFICATION_ENDPOINT, { method: "POST", body: "x".repeat(65537), headers: { "content-type": "application/json" } }))).status, 413);
  for (const method of ["PUT", "DELETE", "OPTIONS"]) assert.equal((await handler(new Request(NOTIFICATION_ENDPOINT, { method }))).status, 405);
  assert.equal((await handler(new Request(NOTIFICATION_ENDPOINT + "/unknown"))).status, 404);
  assert.equal(calls.length, 0);
});

test("status/retry require exact service credentials; query tokens and forged JWTs do not authorize", async () => {
  const { handler, calls } = setup();
  for (const headers of [{}, { Authorization: "Bearer forged.jwt.signature" }, { Authorization: "Bearer sb_publishable_not_service" }, { Authorization: "Bearer wrong-key" }]) {
    assert.equal((await handler(new Request(NOTIFICATION_ENDPOINT + "/status?token=" + env.SUPABASE_SERVICE_ROLE_KEY, { headers }))).status, 401);
    assert.equal((await handler(new Request(NOTIFICATION_ENDPOINT + "/retry", { method: "POST", headers }))).status, 401);
  }
  assert.equal(calls.length, 0);
});

test("authorized status returns only opaque allowlisted state/counts", async () => {
  const { handler } = setup();
  const response = await handler(new Request(NOTIFICATION_ENDPOINT + "/status", { headers: serviceHeaders }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { code: "notification_status", transportConfigured: true, challengeConfigured: true, total: 3, pending: 0, processed: 2, needs_review: 1, failed: 0 });
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal((await handler(new Request(NOTIFICATION_ENDPOINT + "/status?event_id=../x", { headers: serviceHeaders }))).status, 400);
});

test("authorized retry uses bounded batch RPC without eBay keys and filters private fields", async () => {
  const { handler, calls } = setup({ environment: { ...env, EBAY_CLIENT_ID: undefined, EBAY_CLIENT_SECRET: undefined } });
  const response = await handler(new Request(NOTIFICATION_ENDPOINT + "/retry", { method: "POST", headers: serviceHeaders, body: JSON.stringify({ limit: 5 }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { code: "retry_attempted", attempted: 2, processed: 1, needs_review: 1, failed: 0 });
  assert.deepEqual(calls[0].body, { p_limit: 5 });
  for (const input of [{ limit: 0 }, { limit: 26 }, { eventId: "unbounded" }, { limit: 1.5 }]) assert.equal((await handler(new Request(NOTIFICATION_ENDPOINT + "/retry", { method: "POST", headers: serviceHeaders, body: JSON.stringify(input) }))).status, 400);
});

test("actual SQL status envelope exposes failed/review counts without event IDs or payloads", async () => {
  const { handler } = setup({ overrides: { code3_ebay_notification_status: async () => Response.json({ events: [{ event_id: "do-not-return", state: "failed", workspace_rows: 1, history_rows: 2, canonical_rows: 3, matched_records: 6, last_error_code: "private-diagnostic", privatePayload: event() }] }) } });
  const response = await handler(new Request(NOTIFICATION_ENDPOINT + "/status?event_id=synthetic-id-1", { headers: serviceHeaders }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { code: "notification_status", transportConfigured: true, challengeConfigured: true, total: 1, pending: 0, processed: 0, needs_review: 0, failed: 1, workspace_rows: 1, history_rows: 2, canonical_rows: 3, matched_records: 6, state: "failed" });
});

test("actual SQL retry results report partial failure with503 and safe counts", async () => {
  const { handler } = setup({ overrides: { code3_ebay_retry_notifications: async () => Response.json({ results: [{ status: "already_processed", event_id: "private-a" }, { status: "failed", event_id: "private-b", privateError: "secret" }] }) } });
  const response = await handler(new Request(NOTIFICATION_ENDPOINT + "/retry", { method: "POST", headers: serviceHeaders }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "retry_incomplete", attempted: 2, processed: 1, needs_review: 0, failed: 1 });
});

test("status bounds100 actual SQL rows beyond16KiB without exposing identities", async () => {
  const events = Array.from({ length: 100 }, () => ({ event_id: "private-event-".repeat(15), state: "processed", received_at: "2026-10-20T10:00:00.000Z", processed_at: "2026-10-20T10:00:01.000Z", workspace_rows: 1, history_rows: 1, canonical_rows: 0, matched_records: 2 }));
  const { handler } = setup({ overrides: { code3_ebay_notification_status: async () => Response.json({ events }) } });
  const response = await handler(new Request(NOTIFICATION_ENDPOINT + "/status", { headers: serviceHeaders }));
  assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.total, 100); assert.equal(result.processed, 100); assert.equal(result.matched_records, 200);
  assert.doesNotMatch(JSON.stringify(result), /private-event/);
});

test("malformed or excessive SQL status/retry results fail closed", async () => {
  for (const value of [{ events: [{ state: "unexpected" }] }, { events: Array(101).fill({ state: "processed" }) }, { events: [{ state: "processed", matched_records: -1 }] }]) {
    const { handler } = setup({ overrides: { code3_ebay_notification_status: async () => Response.json(value) } });
    assert.equal((await handler(new Request(NOTIFICATION_ENDPOINT + "/status", { headers: serviceHeaders }))).status, 503);
  }
  const { handler } = setup({ overrides: { code3_ebay_retry_notifications: async () => Response.json({ results: [{ status: "unknown" }] }) } });
  assert.equal((await handler(new Request(NOTIFICATION_ENDPOINT + "/retry", { method: "POST", headers: serviceHeaders }))).status, 503);
});

test("runtime loads private Vault config through service RPC and coalesces requests for30s", async () => {
  let now = 0;
  const { handler, calls } = setup({ runtime: true, now: () => now, environment: { SUPABASE_URL: PROJECT_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY } });
  const query = () => new Request(NOTIFICATION_ENDPOINT + "?challenge_code=fixture");
  assert.deepEqual((await Promise.all([handler(query()), handler(query())])).map(x => x.status), [200, 200]);
  assert.equal(calls.filter(x => x.url.endsWith("code3_ebay_runtime_config")).length, 1);
  now = 29999; assert.equal((await handler(query())).status, 200);
  now = 30000; assert.equal((await handler(query())).status, 200);
  assert.equal(calls.filter(x => x.url.endsWith("code3_ebay_runtime_config")).length, 2);
});

test("runtime bootstrap GET works without eBay keys, then notices newly configured keys after cache expiry", async () => {
  let now = 0; let configured = false;
  const { handler } = setup({ runtime: true, now: () => now, environment: { SUPABASE_URL: PROJECT_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY }, overrides: {
    code3_ebay_runtime_config: async () => Response.json({ endpoint: NOTIFICATION_ENDPOINT, environment: "production", verificationToken: env.EBAY_DELETION_VERIFICATION_TOKEN, clientId: configured ? env.EBAY_CLIENT_ID : null, clientSecret: configured ? env.EBAY_CLIENT_SECRET : null }),
  } });
  assert.equal((await handler(new Request(NOTIFICATION_ENDPOINT + "?challenge_code=fixture"))).status, 200);
  assert.equal((await handler(signedRequest())).status, 503);
  configured = true; now = 30000;
  assert.equal((await handler(signedRequest())).status, 202);
});

test("unchanged runtime refresh preserves OAuth/key caches instead of reminting every30s", async () => {
  let now = 0;
  const { handler, calls } = setup({ runtime: true, now: () => now });
  assert.equal((await handler(signedRequest())).status, 202);
  now = 30000;
  assert.equal((await handler(signedRequest())).status, 202);
  assert.equal(calls.filter(x => x.url.endsWith("code3_ebay_runtime_config")).length, 2);
  assert.equal(calls.filter(x => x.url.endsWith("/token")).length, 1);
  assert.equal(calls.filter(x => x.url.includes("/public_key/")).length, 1);
});

test("runtime rejects wrong endpoint/environment/config and redacts upstream diagnostics", async () => {
  for (const result of [{ endpoint: "https://attacker.example", environment: "production", verificationToken: env.EBAY_DELETION_VERIFICATION_TOKEN }, { endpoint: NOTIFICATION_ENDPOINT, environment: "sandbox", verificationToken: env.EBAY_DELETION_VERIFICATION_TOKEN }]) {
    const { handler } = setup({ runtime: true, overrides: { code3_ebay_runtime_config: async () => Response.json(result) } });
    const response = await handler(new Request(NOTIFICATION_ENDPOINT + "?challenge_code=fixture"));
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { code: "service_unavailable" });
  }
});

test("authorized retries remain usable when private runtime config is unavailable", async () => {
  const { handler, calls } = setup({ runtime: true, overrides: { code3_ebay_runtime_config: async () => { throw new Error("PRIVATE_VAULT_DIAGNOSTIC"); } } });
  assert.equal((await handler(new Request(NOTIFICATION_ENDPOINT + "/retry", { method: "POST", headers: serviceHeaders }))).status, 200);
  assert.ok(calls.every(x => !x.url.endsWith("code3_ebay_runtime_config")));
});

test("unauthorized runtime admin calls do not load Vault or execute database work", async () => {
  const { handler, calls } = setup({ runtime: true });
  assert.equal((await handler(new Request(NOTIFICATION_ENDPOINT + "/status"))).status, 401);
  assert.equal((await handler(new Request(NOTIFICATION_ENDPOINT + "/retry", { method: "POST" }))).status, 401);
  assert.equal(calls.length, 0);
});
