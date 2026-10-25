import assert from "node:assert/strict";
import { readHostedDeletionHttpsConfig } from "./lib/hostedDeletionHttpsGuard.mjs";
import { TEST_BUCKETS } from "./lib/hostedDeletionGuard.mjs";
import { validateHostedDeletionBrowserInput, browserRequestAllowed, signedAttachmentInfo, isExpiredStorageResponse, completedRenewalBeforeExpiry,
  probeRevokedAttachmentSigners, browserEnvironment, forwardProtectedPreviewResponse, buildReceiptComponentFixtureHtml } from "./lib/hostedDeletionBrowserAcceptance.mjs";

// Pure admission/destination checks and an in-memory build of actual components.
// No browser, provider, deployment, account creation, credentials or file writes.
const ref = "abcdefghijklmnopqrst";
const providerOrigin = `https://${ref}.supabase.co`;
const appOrigin = "https://code3-privacy-abc123def-team.vercel.app";
const runId = "11111111-1111-4111-8111-111111111111";
const jwt = role => `header.${Buffer.from(JSON.stringify({ role, ref })).toString("base64url")}.signature`;
const anon = jwt("anon"), secret = jwt("service_role");
const oidc = `header.${Buffer.from(JSON.stringify({ iss: "https://oidc.vercel.com/synthetic-team" })).toString("base64url")}.signature`;
const config = readHostedDeletionHttpsConfig({
  CODE3_DELETION_TEST_ALLOWED_PROJECTS: ref, CODE3_DELETION_TEST_SUPABASE_URL: providerOrigin,
  CODE3_DELETION_TEST_ANON_KEY: anon, CODE3_DELETION_TEST_SERVICE_ROLE_KEY: secret,
  CODE3_DELETION_TEST_ALLOWED_APP_ORIGINS: appOrigin,
  CODE3_DELETION_TEST_PREVIEW_DEPLOYMENT_ID: "dpl_ReviewedPreview123456", CODE3_DELETION_TEST_PREVIEW_TARGET: "preview",
  CODE3_DELETION_TEST_PREVIEW_OIDC_TOKEN: oidc,
}, ["--project-ref", ref, "--confirm-isolated", ref, "--execute", "--app-origin", appOrigin, "--confirm-preview-origin", appOrigin, "--with-browser"]);
function fixture(label, id) {
  return { id, email: `code3-delete-${runId}-${label}@example.test`, password: `Only-a-synthetic-${label}-password`, attachments: TEST_BUCKETS.map(bucket => {
    const path = `users/${id}/code3-delete-${runId}/${bucket}.png`;
    return { bucket, path, reference: `${providerOrigin}/storage/v1/object/public/${bucket}/${path}` };
  }) };
}
const browserFixture = fixture("browser", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const sentinel = fixture("sentinel", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
const input = { guardedConfig: config, appOrigin, projectRef: ref, browserFixture, sentinel, publicAnonKey: anon, assertFixture: async () => {}, reportCheck() {} };
assert.equal(validateHostedDeletionBrowserInput(input).providerOrigin, providerOrigin);
assert.deepEqual(browserEnvironment({ PATH: "synthetic-runtime", SystemRoot: "synthetic-os", TEMP: "synthetic-temp", SUPABASE_SERVICE_ROLE_KEY: secret,
  CODE3_DELETION_TEST_SERVICE_ROLE_KEY: secret, CODE3_DELETION_TEST_PREVIEW_OIDC_TOKEN: oidc, DATABASE_URL: "synthetic-private-database", CUSTOM_PROVIDER_SECRET: "synthetic-private-key" }), {
  PATH: "synthetic-runtime", SystemRoot: "synthetic-os", TEMP: "synthetic-temp",
}, "Browser process receives only OS runtime configuration, never inherited provider keys");
for (const patch of [
  { guardedConfig: { ...config } }, { appOrigin: "https://code3tcg.app" }, { projectRef: "gxsfququorfczvhrkudl" },
  { publicAnonKey: secret }, { assertFixture: null }, { reportCheck: null },
  { browserFixture: { ...browserFixture, email: "real-user@example.com" } },
  { sentinel: { ...sentinel, id: browserFixture.id } },
  { browserFixture: { ...browserFixture, attachments: browserFixture.attachments.map((file, index) => index ? file : { ...file, path: "shared-real-file.png" }) } },
  { browserFixture: { ...browserFixture, attachments: browserFixture.attachments.map((file, index) => index ? file : { ...file, reference: file.reference.replace(providerOrigin, "https://gxsfququorfczvhrkudl.supabase.co") }) } },
]) assert.throws(() => validateHostedDeletionBrowserInput({ ...input, ...patch }));

const scope = { appOrigin, providerOrigin, fixturePath: "/__synthetic.html", attachments: [...browserFixture.attachments, ...sentinel.attachments] };
const file = browserFixture.attachments[0];
const good = [
  [`${appOrigin}/delete-account`, "GET"], [`${appOrigin}/assets/app.js`, "GET"], [`${appOrigin}/__synthetic.html`, "GET"],
  [`${appOrigin}/api/account/deletion/status`, "GET"], [`${appOrigin}/api/account/deletion`, "POST"],
  [`${providerOrigin}/auth/v1/token?grant_type=password`, "POST"], [`${providerOrigin}/auth/v1/user`, "GET"],
  [`${providerOrigin}/auth/v1/logout?scope=local`, "POST"], [`${providerOrigin}/rest/v1/rpc/code3_current_session_valid`, "POST"],
  [file.reference, "GET"], [`${providerOrigin}/storage/v1/object/sign/${file.bucket}/${file.path}`, "POST"],
  [`${providerOrigin}/storage/v1/object/sign/${file.bucket}/${file.path}?token=synthetic-expiring-token&qa=uncached`, "GET"],
];
const bad = [
  ["https://code3tcg.app/api/account/deletion", "POST"], ["https://gxsfququorfczvhrkudl.supabase.co/auth/v1/token?grant_type=password", "POST"],
  ["https://third-party.example/assets/app.js", "GET"], [`${appOrigin}/api/inventory`, "POST"], [`${appOrigin}/assets/app.js`, "POST"],
  [`${appOrigin}/private/customer-export.csv`, "GET"], [`${appOrigin}/settings`, "GET"], [`${appOrigin}/assets/../private/customer-export.csv`, "GET"],
  [`${appOrigin}/delete-account?redirect=elsewhere`, "GET"],
  [`${appOrigin}/api/account/deletion?userId=other`, "POST"], [`${providerOrigin}/auth/v1/admin/users`, "POST"],
  [`${providerOrigin}/auth/v1/user`, "POST"], [`${providerOrigin}/auth/v1/logout?scope=global`, "POST"],
  [`${providerOrigin}/auth/v1/logout?scope=others`, "POST"], [`${providerOrigin}/auth/v1/logout`, "POST"],
  [`${providerOrigin}/auth/v1/token?grant_type=password&grant_type=password`, "POST"],
  [`${providerOrigin}/rest/v1/profiles`, "DELETE"], [`${providerOrigin}/rest/v1/rpc/code3_finish_account_data_deletion`, "POST"],
  [`${providerOrigin}/storage/v1/object/sign/receipts/another-owner/file.png`, "POST"], [file.reference, "POST"],
  [`${providerOrigin}/storage/v1/object/sign/${file.bucket}/${file.path}`, "DELETE"],
  [`${providerOrigin}/storage/v1/object/sign/${file.bucket}/bad%ZZ`, "GET"],
  [`${providerOrigin.replace("https://", "https://user:password@")}/auth/v1/user`, "GET"],
  [`${appOrigin.replace("https:", "http:")}/delete-account`, "GET"],
];
for (const [url, method] of good) assert.equal(browserRequestAllowed(scope, url, method), true);
for (const [url, method] of bad) assert.equal(browserRequestAllowed(scope, url, method), false);
const signedUrl = (entry, exp, claims = {}) => `${providerOrigin}/storage/v1/object/sign/${entry.bucket}/${entry.path}?token=header.${Buffer.from(JSON.stringify({ url: entry.bucket + "/" + entry.path, exp, ...claims })).toString("base64url")}.signature`;
const oldUrl = signedUrl(file, 1_800_000_060);
const oldInfo = signedAttachmentInfo(oldUrl, providerOrigin, file);
assert.equal(oldInfo.expiresAt, 1_800_000_060_000);
for (const entry of browserFixture.attachments) {
  const current = signedUrl(entry, 1_800_000_060);
  assert.equal(signedAttachmentInfo(current, providerOrigin, entry)?.bucket, entry.bucket, "Every bucket is independently bound");
  assert.equal(signedAttachmentInfo(current, providerOrigin, { ...entry, path: "another/file.png" }), null);
}
for (const value of [
  oldUrl.replace(providerOrigin, "https://gxsfququorfczvhrkudl.supabase.co"),
  signedUrl(file, 1_800_000_060, { url: "receipt-images/another-owner.png" }),
  signedUrl(file, "not-a-timestamp"), file.reference, oldUrl + "&token=duplicate", oldUrl.replace(/token=.+$/, "token=malformed"),
]) assert.equal(signedAttachmentInfo(value, providerOrigin, file), null);
const nextInfo = signedAttachmentInfo(signedUrl(file, 1_800_000_105), providerOrigin, file);
assert.equal(completedRenewalBeforeExpiry(oldInfo, nextInfo, oldInfo.expiresAt - 1), true);
assert.equal(completedRenewalBeforeExpiry(oldInfo, nextInfo, oldInfo.expiresAt), false, "Renewal completed at expiry cannot pass");
assert.equal(completedRenewalBeforeExpiry(oldInfo, nextInfo, oldInfo.expiresAt + 15_000), false, "A75-second renewal cannot pass a60-second original expiry");
assert.equal(completedRenewalBeforeExpiry(oldInfo, { ...nextInfo, path: "another/file.png" }, oldInfo.expiresAt - 1), false);
assert.equal(completedRenewalBeforeExpiry(oldInfo, oldInfo, oldInfo.expiresAt - 1), false);
assert.equal(isExpiredStorageResponse(400, { code: "ExpiredToken" }), true);
assert.equal(isExpiredStorageResponse(400, { statusCode: "400", error: "InvalidJWT", message: "jwt expired" }), true);
assert.equal(isExpiredStorageResponse(401, { code: "InvalidJWT", message: "Token has expired" }), true);
assert.equal(isExpiredStorageResponse(400, { code: "InvalidJWT", message: '"exp" claim timestamp check failed' }), true);
for (const [status, body] of [
  [400, { statusCode: "400" }], [400, { code: "InvalidRequest", message: "Unknown qa query" }],
  [400, { code: "InvalidJWT", message: "JWT malformed" }], [403, { code: "AccessDenied" }],
  [400, { code: "InvalidJWT", message: '"nbf" claim timestamp check failed' }],
  [404, { code: "NoSuchKey" }], [500, { code: "ExpiredToken" }], [400, null],
]) assert.equal(isExpiredStorageResponse(status, body), false, "Generic denial, malformed URLs and server errors are not expiry proof");
const signingCalls = [];
const signerResults = await probeRevokedAttachmentSigners({ files: browserFixture.attachments, provider: providerOrigin, headers: { Authorization: "Bearer synthetic-revoked" },
  request: async (url, init) => { signingCalls.push({ url, init }); return { expectedDenial: !url.includes("/receipt-images/") }; },
  denied: async response => response.expectedDenial,
});
assert.equal(signingCalls.length, TEST_BUCKETS.length, "Revocation probes every exact private object");
assert.deepEqual(signerResults.map(result => result.bucket), TEST_BUCKETS);
assert.equal(signerResults.every(result => result.denied), false, "One readable bucket cannot be hidden by the other three denials");
assert.ok(signingCalls.every((call, index) => call.url === `${providerOrigin}/storage/v1/object/sign/${browserFixture.attachments[index].bucket}/${browserFixture.attachments[index].path}`
  && call.init.method === "POST" && JSON.parse(call.init.body).expiresIn === 60));
const servedBytes = Uint8Array.from([0, 1, 127, 128, 255]);
let forwardedResponse, forwardedOptions;
const response = { status: () => 200, body: async () => servedBytes };
const fakeRoute = {
  request: () => ({ url: () => `${appOrigin}/assets/actual.png`, method: () => "GET", headers: () => ({ accept: "image/png" }) }),
  fetch: async options => { forwardedOptions = options; return response; },
  fulfill: async options => { forwardedResponse = options.response; },
};
assert.equal(await forwardProtectedPreviewResponse({ route: fakeRoute, guardedConfig: config, scope }), true);
assert.equal(forwardedOptions.maxRedirects, 0, "OIDC-bearing requests never follow redirects");
assert.equal(forwardedOptions.headers["x-vercel-trusted-oidc-idp-token"], oidc);
assert.equal(forwardedResponse, response, "Forward the actual response object without fabricating status, body or headers");
assert.deepEqual(await forwardedResponse.body(), servedBytes, "Real binary response bytes remain intact");
let disposed = false, fulfilledRedirect = false;
await assert.rejects(forwardProtectedPreviewResponse({ guardedConfig: config, scope, route: {
  ...fakeRoute, fetch: async options => { assert.equal(options.maxRedirects, 0); return { status: () => 302, dispose: async () => { disposed = true; } }; },
  fulfill: async () => { fulfilledRedirect = true; },
} }), /redirects are forbidden/);
assert.equal(disposed, true); assert.equal(fulfilledRedirect, false);
assert.equal(await forwardProtectedPreviewResponse({ guardedConfig: config, scope, route: {
  request: () => ({ url: () => `${providerOrigin}/auth/v1/user`, method: () => "GET" }),
  fetch: async () => { assert.fail("Provider requests never receive Preview OIDC forwarding"); },
} }), false);
const html = await buildReceiptComponentFixtureHtml({ providerOrigin, publicAnonKey: anon, attachments: browserFixture.attachments });
assert.ok(html.startsWith("<!doctype html>"));
assert.ok(html.includes("PrivateReceiptImage") && html.includes("createPrivateReceiptAccess"), "The actual client and components compile into the in-memory fixture");
assert.ok(html.includes(anon) && html.includes(providerOrigin), "Only isolated public configuration is bundled");
for (const value of [secret, oidc, browserFixture.password, sentinel.password, browserFixture.email, sentinel.email]) {
  assert.ok(!html.includes(value), "Credentials and sign-in identities never enter fixture HTML");
}
console.log(`PASS browser acceptance admission, ${good.length + bad.length} destination/method cases, protected response/redirect checks and actual component build; no network or filesystem writes.`);
