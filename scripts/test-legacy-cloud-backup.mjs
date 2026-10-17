import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { exportLegacyCloudBackup, inspectLegacyCloudBackup, restoreLegacyCloudBackup } from "../src/features/backup/legacyCloudBackup.js";
import { canonicalStringify, hashCanonicalJson } from "../src/features/backup/canonicalJson.js";

const userId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const itemId = "00000000-0000-4000-8000-000000000011";
const records = { format: "code3-legacy-cloud-records", version: 1, ownerId: userId, createdAt: "2026-10-17T12:00:00.000Z", sections: { inventory_items: [{ id: itemId, user_id: userId, name: "Synthetic owned item", quantity: 2, receipt_image: "https://fixture.supabase.co/storage/v1/object/public/receipts/receipt.png" }] }, recordCount: 1, fileManifest: [{ bucket: "receipts", path: "receipt.png", size: 4, mimeType: "image/png" }], missingTables: [], exclusions: ["Authentication, permissions, public content and external files"] };
function fixture({ files = new Map([["receipts/receipt.png", new Blob(["test"], { type: "image/png" })]]), missing = false, restoreError = false } = {}) {
  const state = { userId, uploads: [], rpcCalls: [], headers: [], files, switchBeforeDispatch: false };
  const client = { supabaseUrl: "https://fixture.supabase.co", auth: { getSession: async () => ({ data: { session: { user: { id: state.userId }, access_token: `token:${state.userId}` } }, error: null }), getUser: async (token) => ({ data: { user: { id: token?.slice(6) || state.userId } }, error: null }) },
    rpc(name, args) { state.rpcCalls.push(name); const response = Promise.resolve(name === "code3_export_legacy_cloud_backup" ? { data: structuredClone(records), error: null } : restoreError ? { error: { message: "Database transaction rolled back" } } : { data: { status: "APPLIED", insertedRecords: 1, keptExistingRecords: 0, operationDigest: args?.payload_text ? "verified-in-database" : "" }, error: null }); response.setHeader = (key, value) => { state.headers.push({ action: name, key, value }); return response; }; response.abortSignal = () => response; return response; },
    storage: { from(bucket) { let authorization; return { setHeader(key, value) { assert.equal(key, "Authorization"); authorization = value; return this; }, async download(path) { state.headers.push({ action: "download", value: authorization }); const data = state.files.get(`${bucket}/${path}`); return !missing && data ? { data, error: null } : { data: null, error: { statusCode: "404", message: "Object not found" } }; }, async upload(path, blob, options) { if (state.switchBeforeDispatch) state.userId = otherId; state.headers.push({ action: "upload", value: authorization }); assert.equal(options.upsert, false); const key = `${bucket}/${path}`; if (state.files.has(key)) return { error: { message: "Already exists" } }; state.files.set(key, blob); state.uploads.push(key); return { data: { path }, error: null }; } }; } },
  }; return { client, state };
}
let checks = 0;
async function check(name, operation) { await operation(); checks++; console.log(`PASS ${name}`); }
const source = fixture();
const exported = await exportLegacyCloudBackup({ client: source.client, userId });
const review = await inspectLegacyCloudBackup(exported.json, { userId });
const confirmation = { purpose: "CLOUD_RESTORE", planDigest: review.planDigest, challengeId: "fixture-challenge", grant: "fixture-grant" };

await check("owned records and real attachment bytes are verified in one cloud backup", async () => {
  assert.equal(exported.verified, true); assert.equal(review.recordCount, 1); assert.equal(review.attachmentCount, 1); assert.equal(review.fileBytes, 4);
  assert.equal(exported.backup.coverage, "COMPLETE_FOR_LISTED_SCOPE");
  assert.equal(exported.backup.attachments[0].base64, "dGVzdA==");
});
await check("missing attachments are explicit partial coverage", async () => {
  const unavailable = fixture({ missing: true });
  const backup = await exportLegacyCloudBackup({ client: unavailable.client, userId });
  assert.equal(backup.backup.coverage, "PARTIAL"); assert.equal(backup.backup.fileErrors.length, 1); assert.equal(backup.backup.attachments.length, 0);
});
await check("record or attachment tampering blocks recovery", async () => {
  const corrupted = JSON.parse(exported.json); corrupted.records.sections.inventory_items[0].quantity = 99;
  await assert.rejects(inspectLegacyCloudBackup(JSON.stringify(corrupted), { userId }), /integrity/);
  const bytes = JSON.parse(exported.json); bytes.attachments[0].base64 = "YWJjZA=="; const { integrity: ignored, ...body } = bytes; void ignored;
  bytes.integrity = await hashCanonicalJson(body);
  await assert.rejects(inspectLegacyCloudBackup(canonicalStringify(bytes), { userId }), /attachment failed byte integrity/i);
});
await check("different accounts and operation proofs cannot restore", async () => {
  await assert.rejects(inspectLegacyCloudBackup(exported.json, { userId: otherId }), /belong/);
  const target = fixture();
  await assert.rejects(restoreLegacyCloudBackup({ client: target.client, raw: exported.json, confirmation: { ...confirmation, planDigest: "0".repeat(64) }, userId }), /exact cloud backup/);
  assert.equal(target.state.rpcCalls.length, 0); assert.equal(target.state.uploads.length, 0);
});
await check("missing files upload without replacement before transactional records", async () => {
  const target = fixture({ files: new Map() });
  const result = await restoreLegacyCloudBackup({ client: target.client, raw: exported.json, confirmation, userId });
  assert.equal(result.uploadedFiles, 1); assert.equal(result.insertedRecords, 1); assert.deepEqual(target.state.uploads, ["receipts/receipt.png"]);
  assert.equal(await target.state.files.get("receipts/receipt.png").text(), "test");
});
await check("matching attachments are retained without duplicate upload", async () => {
  const target = fixture(); const result = await restoreLegacyCloudBackup({ client: target.client, raw: exported.json, confirmation, userId });
  assert.equal(result.retainedExistingFiles, 1); assert.equal(target.state.uploads.length, 0);
});
await check("different existing file bytes prevent database restore", async () => {
  const target = fixture({ files: new Map([["receipts/receipt.png", new Blob(["diff"])]]) });
  await assert.rejects(restoreLegacyCloudBackup({ client: target.client, raw: exported.json, confirmation, userId }), /different bytes/);
  assert.equal(target.state.uploads.length, 0); assert.equal(target.state.rpcCalls.length, 0); assert.equal(await target.state.files.get("receipts/receipt.png").text(), "diff");
});
await check("failed database transaction retains new files for safe retry", async () => {
  const target = fixture({ files: new Map(), restoreError: true });
  await assert.rejects(restoreLegacyCloudBackup({ client: target.client, raw: exported.json, confirmation, userId }), /new attachment\(s\) were preserved for retry/);
  assert.equal(await target.state.files.get("receipts/receipt.png").text(), "test");
});
await check("cancelled or switched accounts cause no new writes", async () => {
  const target = fixture({ files: new Map() }); target.state.userId = otherId;
  await assert.rejects(restoreLegacyCloudBackup({ client: target.client, raw: exported.json, confirmation, userId }), /account changed/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(restoreLegacyCloudBackup({ client: target.client, raw: exported.json, confirmation, userId, signal: controller.signal }), { name: "AbortError" });
  assert.equal(target.state.uploads.length, 0); assert.equal(target.state.rpcCalls.length, 0);
});
await check("unsafe attachment paths and auth tables cannot be imported", async () => {
  const invalid = JSON.parse(exported.json); invalid.attachments[0].path = "../other-account.png"; const { integrity, ...payload } = invalid; void integrity;
  invalid.integrity = await hashCanonicalJson(payload);
  await assert.rejects(inspectLegacyCloudBackup(canonicalStringify(invalid), { userId }), /unsafe/);
  const authority = JSON.parse(exported.json); authority.records.sections.profiles = []; const { integrity: old, ...payload2 } = authority; void old;
  authority.integrity = await hashCanonicalJson(payload2);
  await assert.rejects(inspectLegacyCloudBackup(canonicalStringify(authority), { userId }), /unsupported source/);
});
await check("missing owner IDs or inaccurate complete coverage are rejected before restore", async () => {
  const missingOwner = JSON.parse(exported.json); delete missingOwner.records.sections.inventory_items[0].user_id;
  const { integrity: ignored, ...body } = missingOwner; void ignored;
  missingOwner.integrity = await hashCanonicalJson(body);
  await assert.rejects(inspectLegacyCloudBackup(canonicalStringify(missingOwner), { userId }), /different account/);
  const missingFile = JSON.parse(exported.json); missingFile.attachments = [];
  const { integrity: oldHash, ...contents } = missingFile; void oldHash;
  missingFile.integrity = await hashCanonicalJson(contents);
  await assert.rejects(inspectLegacyCloudBackup(canonicalStringify(missingFile), { userId }), /claims complete coverage/);
});
await check("RPC and file requests retain the verified token if the shared account switches before dispatch", async () => {
  assert.ok(source.state.headers.length > 0);
  assert.ok(source.state.headers.every((entry) => entry.value === `Bearer token:${userId}`));
  const target = fixture({ files: new Map() }); target.state.switchBeforeDispatch = true;
  await assert.rejects(restoreLegacyCloudBackup({ client: target.client, raw: exported.json, confirmation, userId }), /account changed/);
  assert.ok(target.state.headers.some((entry) => entry.action === "upload"));
  assert.ok(target.state.headers.every((entry) => entry.value === `Bearer token:${userId}`));
  assert.equal(target.state.rpcCalls.length, 0, "no database restore follows an account switch");
});
await check("installed Supabase SDK preserves pinned Authorization across lazy RPC and Storage dispatch", async () => {
  let current = userId; const requests = [];
  const client = createClient("https://fixture.supabase.co", "synthetic-public-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options) => {
      requests.push({ url: String(url), method: options.method, authorization: new Headers(options.headers).get("Authorization") });
      if (String(url).includes("/rest/v1/rpc/")) return new Response(JSON.stringify(records), { headers: { "content-type": "application/json" } });
      if (options.method === "GET") return new Response(JSON.stringify({ statusCode: "404", message: "Object not found" }), { status: 404, headers: { "content-type": "application/json" } });
      current = otherId;
      return new Response(JSON.stringify({ Id: itemId, Key: "receipts/receipt.png" }), { headers: { "content-type": "application/json" } });
    } },
  });
  client.auth.getSession = async () => ({ data: { session: { user: { id: current }, access_token: `token:${current}` } }, error: null });
  client.auth.getUser = async (token) => ({ data: { user: { id: token.slice(6) } }, error: null });
  const partial = await exportLegacyCloudBackup({ client, userId });
  assert.equal(partial.backup.coverage, "PARTIAL");
  await assert.rejects(restoreLegacyCloudBackup({ client, raw: exported.json, confirmation, userId }), /account changed/);
  assert.ok(requests.some((request) => request.url.includes("/rest/v1/rpc/")));
  assert.ok(requests.some((request) => request.method === "POST" && request.url.includes("/storage/v1/object/")));
  assert.ok(requests.every((request) => request.authorization === `Bearer token:${userId}`));
});
await check("a hung account request times out without starting uploads or database recovery", async () => {
  const target = fixture({ files: new Map() }); let resume;
  target.client.auth.getSession = () => new Promise((resolve) => { resume = resolve; });
  await assert.rejects(restoreLegacyCloudBackup({ client: target.client, raw: exported.json, confirmation, userId, timeoutMs: 20 }), /timed out/);
  resume({ data: { session: { user: { id: userId }, access_token: `token:${userId}` } }, error: null });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(target.state.uploads.length, 0); assert.equal(target.state.rpcCalls.length, 0);
});
await check("a timed-out upload can retain only its pinned new copy and never continue to database recovery", async () => {
  const target = fixture({ files: new Map() }); const originalFrom = target.client.storage.from; let complete;
  target.client.storage.from = (bucket) => { const api = originalFrom(bucket); const upload = api.upload; api.upload = (...args) => new Promise((resolve) => { complete = async () => resolve(await upload(...args)); }); return api; };
  await assert.rejects(restoreLegacyCloudBackup({ client: target.client, raw: exported.json, confirmation, userId, timeoutMs: 25 }), /original account/);
  assert.ok(complete);
  await complete();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(target.state.uploads.length, 1); assert.equal(target.state.rpcCalls.length, 0);
  assert.ok(target.state.headers.every((entry) => entry.value === `Bearer token:${userId}`));
});
console.log(`Legacy cloud backup client: ${checks} checks passed.`);
