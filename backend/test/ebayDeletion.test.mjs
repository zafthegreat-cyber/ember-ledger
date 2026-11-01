import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import express from "express";

const require = createRequire(import.meta.url);
const { createEbayDeletionRouter } = require("../dist/routes/ebayDeletion.routes.js");
const { createNotificationVerifier, deletionConfig, parseDeletionNotice, createPostgresDeletionStore } = require("../dist/ebayDeletion/service.js");
const endpoint = "https://app.example.test/api/ebay/account-deletion";
const env = { EBAY_DELETION_ENDPOINT_URL: endpoint, EBAY_DELETION_VERIFICATION_TOKEN: "test-only-verification-value-1234567890" };
const hash = value => createHash("sha256").update(value).digest("hex");
const payload = () => ({ metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "1.0" }, notification: {
  notificationId: "synthetic-notice-1", eventDate: "2026-10-24T10:00:00Z", publishDate: "2026-10-24T10:00:01Z", publishAttemptCount: 1,
  data: { username: "ClosingSeller", userId: "opaque-user-id", eiasToken: "opaque+eias==" },
} });
const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
function signature(raw, overrides = {}) {
  return Buffer.from(JSON.stringify({ alg: "ecdsa", digest: "SHA1", kid: "synthetic-key-1", signature: sign("sha1", raw, keys.privateKey).toString("base64"), ...overrides })).toString("base64");
}
function verifier(options = {}) {
  return createNotificationVerifier({ env: {}, token: async () => "synthetic-app-token", fetch: async () => new Response(JSON.stringify({ algorithm: "ECDSA", digest: "SHA1", key: publicKey })), ...options });
}
async function withServer(options, run) {
  const app = express();
  app.use("/api/ebay/account-deletion", createEbayDeletionRouter({ env, ...options }));
  // Emulate the production middleware order: webhook terminates before owner auth.
  app.use((_req, res) => res.sendStatus(401));
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  try { await run(`http://127.0.0.1:${server.address().port}/api/ebay/account-deletion`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test("GET challenge hashes exact configured endpoint, ignoring spoofed host", async () => {
  await withServer({}, async url => {
    const response = await fetch(`${url}?challenge_code=a%2Bb`, { headers: { "x-forwarded-host": "attacker.example", Origin: "https://unrelated.test" } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { challengeResponse: hash("a+b" + env.EBAY_DELETION_VERIFICATION_TOKEN + endpoint) });
    for (const suffix of ["", "?challenge_code=", "?challenge_code=a&challenge_code=b", "?challenge_code=a&extra=b"]) assert.equal((await fetch(url + suffix)).status, 400);
  });
});

test("configuration rejects wrong tokens, URLs, and missing storage", async () => {
  for (const token of ["", "x".repeat(31), "x".repeat(81), "x".repeat(31) + "+"]) assert.throws(() => deletionConfig({ ...env, EBAY_DELETION_VERIFICATION_TOKEN: token }));
  for (const url of ["http://example.test/api/ebay/account-deletion", "https://localhost/api/ebay/account-deletion", endpoint + "/", endpoint + "?x=1", "https://example.test/"]) assert.throws(() => deletionConfig({ ...env, EBAY_DELETION_ENDPOINT_URL: url }));
  await assert.rejects(createPostgresDeletionStore({}).process(parseDeletionNotice(payload())), /unconfigured/);
});

test("POST validates a real ECC signature before processing and returns 204 only after commit", async () => {
  let processed = 0;
  await withServer({ verify: verifier(), store: { process: async notice => { assert.equal(notice.id, hash("synthetic-notice-1")); assert.ok(!JSON.stringify(notice).includes("ClosingSeller")); processed++; } } }, async url => {
    const raw = JSON.stringify(payload());
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-ebay-signature": signature(raw) }, body: raw });
    assert.equal(response.status, 204);
    assert.equal(processed, 1);
    for (const header of [undefined, "invalid", signature(raw, { alg: "none" }), signature(raw, { digest: "SHA256" }), signature(raw, { kid: "../../evil" }), signature(raw + " ")]) {
      const result = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(header ? { "x-ebay-signature": header } : {}) }, body: raw });
      assert.equal(result.status, 412);
    }
    assert.equal(processed, 1);
  });
});

test("key cache expires after one hour and supports the official SDK JSON serialization", async () => {
  let calls = 0, time = 0;
  const verify = verifier({ now: () => time, fetch: async url => { calls++; assert.equal(url, "https://api.ebay.com/commerce/notification/v1/public_key/synthetic-key-1"); return new Response(JSON.stringify({ algorithm: "ECDSA", digest: "SHA1", key: publicKey })); } });
  const body = payload(), canonical = JSON.stringify(body), formatted = Buffer.from(JSON.stringify(body, null, 2));
  await verify(formatted, signature(canonical), body);
  await verify(formatted, signature(canonical), body);
  assert.equal(calls, 1);
  time = 3_600_001;
  await verify(formatted, signature(canonical), body);
  assert.equal(calls, 2);
});

test("transient database and key failures stay retryable; malformed or large bodies cannot delete", async () => {
  const secretError = "private-database-secret-do-not-emit";
  await withServer({ verify: verifier(), store: { process: async () => { throw new Error(secretError); } } }, async url => {
    const raw = JSON.stringify(payload());
    const result = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-ebay-signature": signature(raw) }, body: raw });
    assert.equal(result.status, 503); assert.equal(result.headers.get("retry-after"), "30"); assert.ok(!(await result.text()).includes(secretError));
    assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })).status, 400);
    assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: raw })).status, 400);
    assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(65_537) })).status, 413);
    assert.equal((await fetch(url, { method: "PUT" })).status, 405);
  });
  await assert.rejects(verifier({ fetch: async () => new Response("unavailable", { status: 503 }) })(Buffer.from("{}"), signature("{}"), {}), error => error.status === 503);
});

test("notice validation accepts immutable-only identities and preserves opaque case", () => {
  const value = payload(); delete value.notification.data.username;
  const parsed = parseDeletionNotice(value);
  assert.deepEqual(parsed.subjects, [{ kind: "userId", digest: hash("userId:opaque-user-id") }, { kind: "eiasToken", digest: hash("eiasToken:opaque+eias==") }]);
  const invalid = payload(); invalid.metadata.topic = "OTHER";
  assert.throws(() => parseDeletionNotice(invalid));
});

test("deployed Supabase service-role RPC works without a database password and fails closed on outages", async () => {
  const requests = [];
  const rpcEnv = { EBAY_DELETION_ENABLED: "true", VITE_SUPABASE_URL: "https://synthetic.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-service-key" };
  const store = createPostgresDeletionStore(rpcEnv, { fetch: async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.apikey, "test-service-key");
    return new Response(url.endsWith("code3_sanitize_ebay_data") ? '{"clean":true}' : "null");
  } });
  await store.process(parseDeletionNotice(payload()));
  assert.equal(requests[0].url, "https://synthetic.supabase.co/rest/v1/rpc/code3_process_ebay_deletion_notice");
  assert.ok(!requests[0].init.body.includes("ClosingSeller"));
  assert.deepEqual(await store.sanitize({ test: true }), { clean: true });
  await assert.rejects(createPostgresDeletionStore(rpcEnv, { fetch: async () => new Response("private-database-error", { status: 503 }) }).process(parseDeletionNotice(payload())), error => error.status === 503 && !error.message.includes("private-database"));
});

test("verifies the public signed reference fixture from eBay's official SDK", async () => {
  // Public synthetic test vectors, Copyright 2021 eBay Inc., Apache-2.0.
  // https://github.com/eBay/event-notification-nodejs-sdk/blob/main/test/test.json
  // These are published test identities and signatures, not account credentials.
  const sample = { metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "1.0", deprecated: false }, notification: {
    notificationId: "49feeaeb-4982-42d9-a377-9645b8479411_33f7e043-fed8-442b-9d44-791923bd9a6d",
    eventDate: "2021-03-19T20:43:59.462Z", publishDate: "2021-03-19T20:43:59.679Z", publishAttemptCount: 1,
    data: { username: "test_user", userId: "ma8vp1jySJC", eiasToken: "nY+sHZ2PrBmdj6wVnY+sEZ2PrA2dj6wJnY+gAZGEpwmdj6x9nY+seQ==" },
  } };
  const header = "eyJhbGciOiJlY2RzYSIsImtpZCI6Ijk5MzYyNjFhLTdkN2ItNDYyMS1hMGYxLTk2Y2NiNDI4YWY0OSIsInNpZ25hdHVyZSI6Ik1FWUNJUUNmeGZJV3V4bVdjSUJRSjljNS9YN2lHREpxczJSQ0dzQkVhQWppbnlycmZBSWhBSVY2d0djVGlCdVY1S0pVaWYyaG9reXJMK1E5c3NIa2FkK214Mm5FRTI1dyIsImRpZ2VzdCI6IlNIQTEifQ==";
  const verify = verifier({ fetch: async () => new Response(JSON.stringify({ algorithm: "ECDSA", digest: "SHA1",
    key: "-----BEGIN PUBLIC KEY-----MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEZhhxXKtR+TOvtDbgTPCkSof02qgBB7IsYOyf76ilExJ/upAa/vKIKheOoCyOpcLmi4t0b4uepb7LLjmMr90FUg==-----END PUBLIC KEY-----" })) });
  await verify(Buffer.from(JSON.stringify(sample)), header, sample);
  sample.notification.data.username = "forged-user";
  await assert.rejects(verify(Buffer.from(JSON.stringify(sample)), header, sample), error => error.status === 412);
});

test("PostgreSQL migration redacts current data/history, blocks resurrection, preserves other users and business amounts", { skip: !process.env.CODE3_TEST_PGLITE_MODULE }, async () => {
  const moduleUrl = pathToFileURL(process.env.CODE3_TEST_PGLITE_MODULE);
  const { PGlite } = await import(moduleUrl.href);
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema code3_sync_private;
      create table public.code3_records(id text primary key,metadata jsonb,external_provider text,notes text,source_url text,amount_minor bigint,external_id text);
      create table code3_sync_private.workspaces(owner_id uuid primary key,revision bigint,sources jsonb,updated_at timestamptz default now());
      create table code3_sync_private.workspace_revisions(owner_id uuid,revision bigint,expected_revision bigint,mutation_id uuid,sources jsonb,primary key(owner_id,revision));`);
    const migration = await readFile(new URL("../../supabase/migrations/20261025013845_code3_ebay_account_deletion.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(await readFile(new URL("../../supabase/migrations/20261025015445_code3_ebay_deletion_rpc.sql", import.meta.url), "utf8"));
    const seller = { id: "app-local-id", providerId: "ebay", sellerName: "CLOSINGSELLER", sellerRating: "99.9", description: "Personal description", title: "Seller's collection", location: "Private place", listingUrl: "https://ebay.example/item/1", imageReferences: ["https://images.example/private"], askingPrice: 42, purchasePrice: 39, status: "Purchased" };
    const other = { ...seller, id: "unrelated-id", sellerName: "OtherSeller" };
    const otherProvider = { ...seller, providerId: "other", sellerName: "ClosingSeller" };
    const evidence = { providerId: "ebay", sourceId: "ebay:listing-1", observations: [{ type: "SELLER_NAME", value: "ClosingSeller" }], imageReferences: ["private-image"] };
    const snapshot = { deals: [seller, other, otherProvider], providerListings: [seller], appraisals: [{ evidence }], purchases: [{ id: "purchase-1", price: 39 }] };
    const original = JSON.stringify(snapshot);
    await db.query("insert into code3_sync_private.workspaces values('00000000-0000-4000-8000-000000000001',1,$1,now())", [original]);
    await db.query("insert into code3_sync_private.workspace_revisions values('00000000-0000-4000-8000-000000000001',1,0,gen_random_uuid(),$1)", [original]);
    await db.query("insert into public.code3_records values('match',$1,'ebay','private notes','private URL',3900,'listing-1'),('other',$2,'ebay','safe','safe',4200,'listing-2')", [JSON.stringify(seller), JSON.stringify(other)]);
    const notice = parseDeletionNotice(payload());
    const processNotice = notice => db.query("select code3_ebay_private.process_notice($1,$2,$3::jsonb)", [notice.id, notice.eventDate, JSON.stringify(notice.subjects)]);
    await processNotice(notice);
    const saved = (await db.query("select * from code3_sync_private.workspaces")).rows[0];
    assert.equal(saved.revision, 2);
    assert.equal(saved.sources.deals[0].sellerName, undefined); assert.equal(saved.sources.deals[0].imageReferences, undefined);
    assert.equal(saved.sources.deals[0].id, seller.id); assert.equal(saved.sources.deals[0].purchasePrice, 39); assert.equal(saved.sources.deals[0].status, "Purchased");
    assert.deepEqual(saved.sources.deals[1], other); assert.deepEqual(saved.sources.deals[2], otherProvider); assert.deepEqual(saved.sources.purchases, snapshot.purchases);
    assert.equal(saved.sources.appraisals[0].evidence.observations, undefined);
    const rows = (await db.query("select * from public.code3_records order by id")).rows;
    assert.equal(rows[0].metadata.sellerName, undefined); assert.equal(rows[0].notes, null); assert.equal(Number(rows[0].amount_minor), 3900);
    assert.equal(rows[1].notes, "safe"); assert.deepEqual(rows[1].metadata, other);
    const history = (await db.query("select sources from code3_sync_private.workspace_revisions")).rows;
    assert.equal(history.length, 2); assert.ok(history.every(row => !row.sources.deals[0].sellerName));
    await processNotice(notice);
    assert.equal((await db.query("select * from code3_ebay_private.receipts")).rows.length, 1);
    assert.equal((await db.query("select revision from code3_sync_private.workspaces")).rows[0].revision, 2);
    await db.query("update code3_sync_private.workspaces set sources=$1", [original]);
    assert.equal((await db.query("select sources from code3_sync_private.workspaces")).rows[0].sources.deals[0].sellerName, undefined);
    await db.exec("update public.code3_records set notes='stale personal notes',external_id='stale-listing',source_url='stale-url' where id='match'");
    const redacted = (await db.query("select * from public.code3_records where id='match'")).rows[0];
    assert.equal(redacted.notes, null); assert.equal(redacted.external_id, null); assert.equal(redacted.source_url, null);
    const immutable = payload(); immutable.notification.notificationId = 'immutable-notice'; delete immutable.notification.data.username;
    await processNotice(parseDeletionNotice(immutable));
    const immutableSnapshot = { providerId: 'ebay', sellerUserId: 'opaque-user-id', title: 'Private title' };
    const immutableClean = (await db.query('select code3_ebay_private.sanitize($1::jsonb) as data',[JSON.stringify(immutableSnapshot)])).rows[0].data;
    assert.equal(immutableClean.sellerUserId, undefined); assert.equal(immutableClean.title,'eBay data deleted');
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select code3_ebay_private.sanitize('{}'::jsonb)"), /permission denied/);
    await assert.rejects(db.query("select public.code3_sanitize_ebay_data('{}'::jsonb)"), /permission denied/);
    await db.exec("reset role");
    await db.exec("set role service_role");
    assert.deepEqual((await db.query("select public.code3_sanitize_ebay_data('{}'::jsonb) as data")).rows[0].data, {});
    await db.exec("reset role");
    const receipt = JSON.stringify((await db.query("select * from code3_ebay_private.receipts")).rows);
    assert.ok(!receipt.includes("ClosingSeller") && !receipt.includes("opaque"));
    // The inspected production schema has no canonical records table.
    await db.exec("drop table public.code3_records");
    // An aborted transaction must not leave a receipt that prevents a retry.
    const next = { ...notice, id: hash("retry-test") };
    await db.exec("begin"); await processNotice(next); await db.exec("rollback");
    assert.equal((await db.query("select * from code3_ebay_private.receipts where notification_digest=$1", [next.id])).rows.length, 0);
    await processNotice(next);
    assert.equal((await db.query("select * from code3_ebay_private.receipts")).rows.length, 3);
  } finally { await db.close(); }
});
