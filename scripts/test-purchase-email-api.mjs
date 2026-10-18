import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  fetchPurchaseEmailImportStatus,
  normalizePurchaseEmailPreview,
  previewPurchaseEmails,
  resolvePurchaseEmailApiUrl,
} from "../src/services/purchaseEmailApi.js";

const originalLocation = globalThis.location;
globalThis.location = { href: "https://code3tcg.example/business/purchases" };
const receipt = {
  sourceId: `email:${"a".repeat(64)}`, provider: "aol", accountReference: `mailbox:${"b".repeat(64)}`,
  retailerId: "target", retailerLabel: "Target", orderId: "TEST-ORDER", receivedAt: "2026-10-17T12:00:00.000Z",
  orderedAt: null, currency: "USD", totalMinorUnits: 2500,
  items: [{ description: "Synthetic test product", quantity: 1, unitPriceMinorUnits: 2500, lineTotalMinorUnits: 2500 }],
  warnings: ["REVIEW_REQUIRED"],
};
const preview = { ok: true, format: "code3.purchase-email-preview.v1", candidates: [receipt], scannedMessages: 2, skippedMessages: 1, truncated: false, days: 30 };
const status = { ok: true, available: true, mode: "ONE_TIME_READ", credentialStored: false, mailboxReadOnly: true, providers: ["aol", "gmail", "yahoo"], days: [7, 30, 90], limits: { messages: 500, bodies: 25 } };
const input = { provider: "aol", mailboxAddress: "qa@example.invalid", appPassword: "synthetic-app-password", days: 30 };
const ownerHeaders = async () => ({ Authorization: "Bearer synthetic-owner" });
const response = (payload, code = 200, headers = {}) => new Response(JSON.stringify(payload), { status: code, headers: { "content-type": "application/json", ...headers } });
let cases = 0;
function check(run) { run(); cases += 1; }
async function checkAsync(run) { await run(); cases += 1; }

try {
  // Vercel's nested mailbox URLs need exact entry files: the shared catch-all
  // previously returned the SPA HTML instead of dispatching these requests.
  const repoUrl = new URL("../", import.meta.url);
  for (const action of ["status", "preview"]) {
    check(() => {
      const endpoint = new URL(resolvePurchaseEmailApiUrl(action, "", "https://code3tcg.example"));
      const entryUrl = new URL(`${endpoint.pathname.slice(1)}.ts`, repoUrl);
      const source = readFileSync(entryUrl, "utf8");
      const sharedImport = source.match(/^import\s+app\s+from\s+["']([^"']+)["'];?\s*export\s+default\s+app;?\s*$/);
      assert.ok(sharedImport, `${action} must delegate to the protected shared server`);
      assert.equal(new URL(`${sharedImport[1]}.ts`, entryUrl).href, new URL("backend/src/server.ts", repoUrl).href);
    });
  }
  check(() => {
    const server = readFileSync(new URL("backend/src/server.ts", repoUrl), "utf8");
    assert.match(server, /app\.use\("\/api\/account-ops\/mailbox-import",\s*protectedCors,\s*mailboxImportRouter\)/);
  });
  check(() => assert.deepEqual(normalizePurchaseEmailPreview(preview).candidates, [receipt]));
  check(() => assert.deepEqual(normalizePurchaseEmailPreview({ ...preview, candidates: [], scannedMessages: 0, skippedMessages: 0 }).candidates, []));
  for (const candidate of [
    { ...preview, format: "unexpected" }, { ...preview, rawEmail: "must not be returned" }, { ...preview, appPassword: "must not be returned" },
    { ...preview, days: 365 }, { ...preview, truncated: "false" }, { ...preview, candidates: [receipt, receipt] },
    { ...preview, candidates: Array(26).fill(receipt) }, { ...preview, candidates: [{ ...receipt, sourceId: "email:bad" }] },
    { ...preview, candidates: [{ ...receipt, sourceId: `email:${"A".repeat(64)}` }] }, { ...preview, candidates: [{ ...receipt, accountReference: "unsafe" }] },
    { ...preview, candidates: [{ ...receipt, provider: "unsupported" }] }, { ...preview, candidates: [{ ...receipt, subject: "raw subject" }] },
    { ...preview, candidates: [{ ...receipt, items: [{ ...receipt.items[0], rawBody: "raw message" }] }] },
    { ...preview, candidates: [{ ...receipt, totalMinorUnits: 1.5 }] }, { ...preview, candidates: [{ ...receipt, totalMinorUnits: -1 }] },
    { ...preview, candidates: [{ ...receipt, items: [{ ...receipt.items[0], quantity: Number.MAX_SAFE_INTEGER + 1 }] }] },
    { ...preview, candidates: [{ ...receipt, receivedAt: "not-a-date" }] }, { ...preview, candidates: [{ ...receipt, currency: "usd" }] }, { ...preview, candidates: [{ ...receipt, currency: "JPY" }] },
    { ...preview, candidates: [{ ...receipt, warnings: [null] }] }, { ...preview, candidates: [{ ...receipt, retailerLabel: "a".repeat(501) }] },
    { ...preview, scannedMessages: 501 }, { ...preview, scannedMessages: -1 }, { ...preview, skippedMessages: 1.5 },
    { ...preview, skippedMessages: 3 }, { ...preview, scannedMessages: 0, skippedMessages: 0 },
  ]) check(() => assert.throws(() => normalizePurchaseEmailPreview(candidate), { code: "INVALID_RESPONSE" }));

  for (const [base, page, expected] of [
    ["", "https://code3tcg.example/path", "https://code3tcg.example/api/account-ops/mailbox-import/preview"],
    ["https://api.example", "https://code3tcg.example", "https://api.example/api/account-ops/mailbox-import/preview"],
    ["", "http://127.0.0.1:5243/", "http://127.0.0.1:5243/api/account-ops/mailbox-import/preview"],
    ["http://localhost:8787", "http://localhost:5243", "http://localhost:8787/api/account-ops/mailbox-import/preview"],
    ["", "http://[::1]:5243/", "http://[::1]:5243/api/account-ops/mailbox-import/preview"],
  ]) check(() => assert.equal(resolvePurchaseEmailApiUrl("preview", base, page), expected));
  for (const [base, page] of [
    ["http://api.example", "https://code3tcg.example"], ["", "http://code3tcg.example"],
    ["http://127.0.0.1:3000", "https://code3tcg.example"], ["http://localhost.evil.example", "http://localhost:5243"],
    ["https://user:password@api.example", "https://code3tcg.example"], ["https://api.example?unsafe", "https://code3tcg.example"],
    ["https://api.example#unsafe", "https://code3tcg.example"], ["file:///tmp/api", "https://code3tcg.example"],
    ["javascript:alert(1)", "https://code3tcg.example"], ["", "not-a-url"],
  ]) check(() => assert.throws(() => resolvePurchaseEmailApiUrl("preview", base, page), { code: "SECURE_TRANSPORT_REQUIRED" }));
  check(() => assert.throws(() => resolvePurchaseEmailApiUrl("preview?password=value", "", "https://code3tcg.example"), { code: "INVALID_ROUTE" }));

  let fetchCalls = 0;
  const neverFetch = async () => { fetchCalls += 1; throw new Error("Unexpected network call"); };
  for (const headers of [{}, null, { Authorization: "" }, { Authorization: "Bearer " }, { Authorization: "Bearer\nunsafe" }, { Authorization: "Basic synthetic" }, { "x-code3-local-dev": "true" }, { Authorization: "Bearer synthetic-owner", "x-code3-local-dev": "true" }]) {
    await checkAsync(() => assert.rejects(previewPurchaseEmails(input, { fetchImpl: neverFetch, getRequestHeadersImpl: async () => headers }), { code: "OWNER_ACCESS_REQUIRED" }));
  }
  await checkAsync(() => assert.rejects(previewPurchaseEmails(input, { fetchImpl: neverFetch, getRequestHeadersImpl: async () => { throw new Error("Do not echo private auth failure"); } }), (error) => error.code === "SIGN_IN_REQUIRED" && !error.message.includes("private auth")));
  globalThis.location = { href: "http://unsafe.example" };
  await checkAsync(() => assert.rejects(previewPurchaseEmails(input, { fetchImpl: neverFetch, getRequestHeadersImpl: ownerHeaders }), { code: "SECURE_TRANSPORT_REQUIRED" }));
  globalThis.location = { href: "https://code3tcg.example/business/purchases" };
  check(() => assert.equal(fetchCalls, 0));

  const alreadyAborted = new AbortController(); alreadyAborted.abort();
  await checkAsync(() => assert.rejects(previewPurchaseEmails(input, { signal: alreadyAborted.signal, fetchImpl: neverFetch, getRequestHeadersImpl: ownerHeaders }), { name: "AbortError" }));
  const abortedDuringAuth = new AbortController();
  await checkAsync(() => assert.rejects(previewPurchaseEmails(input, { signal: abortedDuringAuth.signal, fetchImpl: neverFetch, getRequestHeadersImpl: async () => { abortedDuringAuth.abort(); return ownerHeaders(); } }), { name: "AbortError" }));
  check(() => assert.equal(fetchCalls, 0));

  const controller = new AbortController();
  await checkAsync(async () => {
    const result = await previewPurchaseEmails(input, { signal: controller.signal, getRequestHeadersImpl: ownerHeaders, fetchImpl: async (url, options) => {
      assert.equal(url, "https://code3tcg.example/api/account-ops/mailbox-import/preview");
      assert.equal(options.method, "POST"); assert.equal(options.redirect, "error"); assert.equal(options.cache, "no-store");
      assert.equal(options.credentials, "same-origin"); assert.equal(options.signal, controller.signal);
      assert.deepEqual(JSON.parse(options.body), input); assert.equal(url.includes(input.appPassword), false);
      assert.equal(options.headers.Authorization, "Bearer synthetic-owner"); assert.equal(options.headers["Content-Type"], "application/json");
      return response(preview);
    } });
    assert.deepEqual(result.candidates, [receipt]);
  });
  for (const [httpStatus, code, expected] of [
    [401, "mailbox_authentication_failed", "MAILBOX_AUTH_FAILED"], [401, "unauthorized", "SIGN_IN_REQUIRED"],
    [403, "mailbox_owner_required", "OWNER_ACCESS_REQUIRED"], [403, "mailbox_secure_transport_required", "SECURE_TRANSPORT_REQUIRED"],
    [409, "mailbox_preview_active", "MAILBOX_PREVIEW_ACTIVE"], [429, "rate_limited", "RATE_LIMITED"],
    [504, "mailbox_timeout", "MAILBOX_TIMEOUT"], [503, "mailbox_unavailable", "MAILBOX_UNAVAILABLE"],
    [404, "mailbox_route_not_found", "UNAVAILABLE"],
  ]) await checkAsync(() => assert.rejects(previewPurchaseEmails(input, { getRequestHeadersImpl: ownerHeaders, fetchImpl: async () => response({ ok: false, error: { code, message: "Do not echo raw server details" } }, httpStatus) }), (error) => error.code === expected && !error.message.includes("raw server")));
  await checkAsync(() => assert.rejects(previewPurchaseEmails(input, { getRequestHeadersImpl: ownerHeaders, fetchImpl: async () => { throw new Error("Do not echo transport credential details"); } }), (error) => error.code === "REQUEST_FAILED" && !error.message.includes("credential details")));
  await checkAsync(() => assert.rejects(previewPurchaseEmails(input, { getRequestHeadersImpl: ownerHeaders, fetchImpl: async () => { throw new DOMException("Cancelled", "AbortError"); } }), { name: "AbortError" }));
  await checkAsync(() => assert.rejects(previewPurchaseEmails(input, { getRequestHeadersImpl: ownerHeaders, fetchImpl: async () => response(preview, 200, { "content-length": "524289" }) }), { code: "RESPONSE_TOO_LARGE" }));
  await checkAsync(() => assert.rejects(previewPurchaseEmails(input, { getRequestHeadersImpl: ownerHeaders, fetchImpl: async () => response({ value: "a".repeat(524289) }) }), { code: "RESPONSE_TOO_LARGE" }));
  await checkAsync(() => assert.rejects(previewPurchaseEmails(input, { getRequestHeadersImpl: ownerHeaders, fetchImpl: async () => new Response("invalid-json", { headers: { "content-type": "application/json" } }) }), { code: "INVALID_RESPONSE" }));
  await checkAsync(() => assert.rejects(previewPurchaseEmails(input, { getRequestHeadersImpl: ownerHeaders, fetchImpl: async () => response(null) }), { code: "INVALID_RESPONSE" }));
  await checkAsync(() => assert.rejects(previewPurchaseEmails(input, { getRequestHeadersImpl: ownerHeaders, fetchImpl: async () => ({ ok: true, headers: new Headers({ "content-type": "application/json" }), text: async () => { throw new Error("Do not echo stream details"); } }) }), (error) => error.code === "REQUEST_FAILED" && !error.message.includes("stream details")));
  for (const invalidInput of [{ ...input, provider: "unsupported" }, { ...input, days: 365 }, { ...input, appPassword: "short" }, { ...input, appPassword: "a".repeat(257) }, { ...input, mailboxAddress: "" }, { ...input, host: "unsafe.example" }]) await checkAsync(() => assert.rejects(previewPurchaseEmails(invalidInput, { fetchImpl: neverFetch, getRequestHeadersImpl: ownerHeaders }), { code: "INVALID_REQUEST" }));
  check(() => assert.equal(fetchCalls, 0));

  await checkAsync(async () => {
    const result = await fetchPurchaseEmailImportStatus({ getRequestHeadersImpl: ownerHeaders, fetchImpl: async (url, options) => {
      assert.equal(url, "https://code3tcg.example/api/account-ops/mailbox-import/status");
      assert.equal(options.method, "GET"); assert.equal(options.body, undefined); assert.equal(options.headers["Content-Type"], undefined);
      return response(status);
    } });
    assert.equal(result.available, true); assert.deepEqual(result.providers, ["aol", "gmail", "yahoo"]);
  });
  for (const invalidStatus of [{ ...status, credentialStored: true }, { ...status, mailboxReadOnly: false }, { ...status, mode: "SAVED_CONNECTION" }, { ...status, providers: [] }, { ...status, providers: ["aol", "aol"] }, { ...status, providers: ["unsupported"] }]) await checkAsync(() => assert.rejects(fetchPurchaseEmailImportStatus({ getRequestHeadersImpl: ownerHeaders, fetchImpl: async () => response(invalidStatus) }), { code: "INVALID_RESPONSE" }));
  console.log(`Purchase email API: ${cases} checks passed (serverless route packaging, schema, auth-before-fetch, HTTPS/loopback, request boundaries, redaction, provider errors, and one-time status).`);
} finally {
  if (originalLocation === undefined) delete globalThis.location;
  else globalThis.location = originalLocation;
}
