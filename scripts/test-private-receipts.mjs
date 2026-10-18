import assert from "node:assert/strict";
import { classifyReceiptReference, createPrivateReceiptAccess, PRIVATE_RECEIPT_URL_SECONDS } from "../src/services/privateReceiptAccess.js";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const origin = "https://synthetic-project.supabase.co";
const path = "legacy folder/receipt 1.png";
const reference = `${origin}/storage/v1/object/public/receipts/${encodeURIComponent(path)}`;
let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
function mock(options = {}) {
  const state = { session: { user: { id: owner }, access_token: "synthetic-owner-token" }, live: true, calls: [], ...options };
  const client = {
    supabaseUrl: origin,
    auth: {
      async getSession() { state.calls.push("session"); return { data: { session: state.session } }; },
      async getUser(token) { state.calls.push(["identity", token]); return { data: { user: { id: state.identityId || state.session?.user.id } } }; },
    },
    rpc(name, args) {
      assert.equal(name, "code3_current_session_valid"); assert.deepEqual(args, {});
      return { setHeader(name, value) { state.calls.push(["rpc", name, value]); return this; }, abortSignal() { return this; }, then(resolve) { return Promise.resolve({ data: state.live, error: null }).then(resolve); } };
    },
    storage: {
      from(bucket) {
        state.calls.push(["bucket", bucket]);
        return {
          setHeader(name, value) { state.calls.push(["storage", name, value]); return this; },
          async createSignedUrl(file, seconds) {
            state.calls.push(["sign", file, seconds]);
            state.afterSign?.();
            if (state.delay) await new Promise(resolve => state.finish = resolve);
            if (state.denied) return { error: { message: "private server detail" } };
            return { data: { signedUrl: state.returnUrl || `${origin}/storage/v1/object/sign/${bucket}/${encodeURIComponent(file)}?token=synthetic-short-lived-token` } };
          },
        };
      },
    },
  };
  return { state, client, resolve: createPrivateReceiptAccess({ client, timeoutMs: 30 }) };
}

await test("legacy public path preserves exact decoded bucket/path", async () => {
  const result = classifyReceiptReference(reference, origin);
  assert.deepEqual(result, { kind: "private", bucket: "receipts", path });
  assert.equal(reference.includes("/public/"), true);
});
for (const bucket of ["receipts", "receipt-images", "feedback-screenshots", "product-submissions"]) for (const mode of ["public", "sign", "authenticated"]) await test(`${bucket} ${mode} references are reauthorized`, async () => {
  const current = mock();
  const result = await current.resolve(`${origin}/storage/v1/object/${mode}/${bucket}/users/${owner}/proof.png?token=old-expired`);
  assert.equal(result.private, true); assert.equal(result.ownerId, owner);
  assert.ok(result.url.includes("synthetic-short-lived-token"));
  assert.deepEqual(current.state.calls.find(row => row[0] === "sign"), ["sign", `users/${owner}/proof.png`, PRIVATE_RECEIPT_URL_SECONDS]);
  assert.equal(PRIVATE_RECEIPT_URL_SECONDS, 60);
  assert.deepEqual(current.state.calls.find(row => row[0] === "storage"), ["storage", "Authorization", "Bearer synthetic-owner-token"]);
});
await test("no saved URL or caller-owned metadata is mutated", async () => {
  const record = Object.freeze({ receiptImage: reference, price: 123, ownerId: owner });
  await mock().resolve(record.receiptImage);
  assert.equal(record.receiptImage, reference); assert.equal(record.price, 123);
});
for (const value of [
  `https://other-project.supabase.co/storage/v1/object/sign/receipts/file?token=secret`,
  `${origin}/storage/v1/object/public/receipts/bad%ZZ`,
  `${origin}/storage/v1/object/public/receipts/folder%2F..%2Ffile`,
  `${origin}/storage/v1/object/public/receipts/folder%5Cfile`,
  `${origin}/storage/v1/object/public/receipts/%00file`,
  `${origin}/storage/v1/object/public/receipts/folder%2F%2Ffile`,
  `https://name:password@synthetic-project.supabase.co/storage/v1/object/public/receipts/file`,
  "javascript:alert(1)", "file:///private/path", "data:text/html;base64,c2VjcmV0", "//external.example/file",
]) await test("unsafe or foreign private reference never sends credentials", async () => {
  const current = mock();
  await assert.rejects(current.resolve(value));
  assert.equal(current.state.calls.length, 0);
});
for (const value of ["https://external.example/receipt.png", "/assets/sample.png", "data:image/png;base64,YQ==", "blob:https://code3tcg.app/synthetic", `${origin}/storage/v1/object/public/catalog-images/item.png`]) await test("nonprivate images remain usable without credential requests", async () => {
  const current = mock();
  assert.deepEqual(await current.resolve(value), { url: value, private: false });
  assert.equal(current.state.calls.length, 0);
});
await test("unconfigured known private URL fails closed", async () => assert.equal(classifyReceiptReference(reference, "").kind, "invalid"));
await test("generic artwork signs only newly private legacy receipts", async () => {
  const current = mock();
  const access = createPrivateReceiptAccess({ client: current.client, privateBuckets: new Set(["receipts"]) });
  const reportPhoto = `${origin}/storage/v1/object/sign/receipt-images/users/${other}/scout-photo.png?token=existing-report-token`;
  assert.deepEqual(await access(reportPhoto), { url: reportPhoto, private: false });
  assert.equal(current.state.calls.length, 0);
  assert.equal((await access(reference)).private, true);
});
for (const session of [null, { user: { id: "local-beta" }, access_token: "local" }, { user: { id: owner } }]) await test("signed-out and synthetic sessions cannot sign receipts", async () => {
  const current = mock({ session }); await assert.rejects(current.resolve(reference));
  assert.equal(current.state.calls.some(call => call[0] === "sign"), false);
});
await test("expected account mismatch cannot sign", async () => { const current = mock(); await assert.rejects(current.resolve(reference, { expectedUserId: other })); assert.equal(current.state.calls.some(call => call[0] === "sign"), false); });
await test("server-verified identity mismatch cannot sign", async () => { const current = mock({ identityId: other }); await assert.rejects(current.resolve(reference)); assert.equal(current.state.calls.some(call => call[0] === "sign"), false); });
await test("revoked session cannot sign", async () => { const current = mock({ live: false }); await assert.rejects(current.resolve(reference)); assert.equal(current.state.calls.some(call => call[0] === "sign"), false); });
await test("RLS-denied owner never receives a URL", async () => { const current = mock({ denied: true }); await assert.rejects(current.resolve(reference), error => !error.message.includes("private server detail")); });
await test("account switch during signing suppresses returned URL", async () => {
  const current = mock(); current.state.afterSign = () => current.state.session = { user: { id: other }, access_token: "other-token" };
  await assert.rejects(current.resolve(reference));
});
await test("sign-out during signing suppresses returned URL", async () => {
  const current = mock(); current.state.afterSign = () => current.state.session = null;
  await assert.rejects(current.resolve(reference));
});
await test("same-user token replacement suppresses stale-session URL", async () => {
  const current = mock(); current.state.afterSign = () => current.state.session.access_token = "replacement-token";
  await assert.rejects(current.resolve(reference));
});
await test("revocation after storage response suppresses URL", async () => {
  const current = mock(); current.state.afterSign = () => current.state.live = false;
  await assert.rejects(current.resolve(reference));
});
for (const returnUrl of [
  "https://external.example/receipt?token=leak", `${origin}/storage/v1/object/sign/receipts/other-owner-file?token=secret`,
  `${origin}/storage/v1/object/public/receipts/${encodeURIComponent(path)}`, `${origin}/storage/v1/object/sign/receipts/${encodeURIComponent(path)}`,
]) await test("wrong or unverified storage response is withheld", async () => { const current = mock({ returnUrl }); await assert.rejects(current.resolve(reference)); });
await test("aborted request makes no calls", async () => { const current = mock(); await assert.rejects(current.resolve(reference, { signal: AbortSignal.abort() }), { name: "AbortError" }); assert.equal(current.state.calls.length, 0); });
await test("slow storage response times out without yielding late URL", async () => {
  const current = mock({ delay: true }); await assert.rejects(current.resolve(reference), /too long/); current.state.finish();
});
console.log(`PASS ${passed} private receipt access checks; synthetic only, no saved-record writes.`);
