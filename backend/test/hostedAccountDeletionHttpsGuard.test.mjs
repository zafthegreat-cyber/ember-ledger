import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { readHostedDeletionHttpsConfig, assertAuthorizedHttpsTestConfig, isolatedProviderConfig, previewOrigin,
  assertPreviewVersion, restrictedHttpsAppFetch, readBoundedAcceptanceJson, previewAccessHeaders } from "../../scripts/lib/hostedDeletionHttpsGuard.mjs";
import { runHostedDeletionHttpsAcceptance } from "../../scripts/test-hosted-account-deletion-https.mjs";

const ref = "abcdefghijklmnopqrst";
const appOrigin = "https://code3-privacy-qa-abc123def-test-team.vercel.app";
const deploymentId = "dpl_SyntheticPreview0123456789";
const jwt = (role, project = ref) => `header.${Buffer.from(JSON.stringify({ role, ref: project })).toString("base64url")}.signature`;
const env = { CODE3_DELETION_TEST_ALLOWED_PROJECTS: ref, CODE3_DELETION_TEST_SUPABASE_URL: `https://${ref}.supabase.co`,
  CODE3_DELETION_TEST_ANON_KEY: jwt("anon"), CODE3_DELETION_TEST_SERVICE_ROLE_KEY: jwt("service_role"),
  CODE3_DELETION_TEST_ALLOWED_APP_ORIGINS: appOrigin, CODE3_DELETION_TEST_PREVIEW_DEPLOYMENT_ID: deploymentId,
  CODE3_DELETION_TEST_PREVIEW_TARGET: "preview" };
const args = ["--project-ref", ref, "--confirm-isolated", ref, "--app-origin", appOrigin, "--confirm-preview-origin", appOrigin, "--execute"];
const config = () => readHostedDeletionHttpsConfig(env, args);

test("HTTPS runner imports and defaults without network or credential lookup", () => {
  const output = execFileSync(process.execPath, ["scripts/test-hosted-account-deletion-https.mjs"], {
    cwd: new URL("../../", import.meta.url), env: { ...process.env,
      CODE3_DELETION_TEST_SUPABASE_URL: "https://gxsfququorfczvhrkudl.supabase.co" }, encoding: "utf8" });
  assert.match(output, /No network requests made/);
});

test("HTTPS configuration inherits the immutable provider production deny and dedicated-key rules", () => {
  const safe = config(); assertAuthorizedHttpsTestConfig(safe);
  assert.equal(safe.projectRef, ref); assert.equal(safe.execute, true); assert.equal(safe.withBrowser, false);
  assert.equal(isolatedProviderConfig(safe).origin, `https://${ref}.supabase.co`);
  for (const patch of [
    { CODE3_DELETION_TEST_SERVICE_ROLE_KEY: "", SUPABASE_SERVICE_ROLE_KEY: jwt("service_role") },
    { CODE3_DELETION_TEST_SUPABASE_URL: "https://gxsfququorfczvhrkudl.supabase.co" },
    { CODE3_DELETION_TEST_ALLOWED_PROJECTS: `${ref},gxsfququorfczvhrkudl` },
    { CODE3_DELETION_TEST_SERVICE_ROLE_KEY: jwt("service_role", "gxsfququorfczvhrkudl") },
  ]) assert.throws(() => readHostedDeletionHttpsConfig({ ...env, ...patch }, args));
  assert.throws(() => readHostedDeletionHttpsConfig(env, args.map(value => value === ref ? "gxsfququorfczvhrkudl" : value)));
});

test("HTTPS runner requires exact independently reviewed Preview origin and deployment pin", () => {
  for (const patch of [
    { CODE3_DELETION_TEST_ALLOWED_APP_ORIGINS: "" }, { CODE3_DELETION_TEST_ALLOWED_APP_ORIGINS: "https://code3tcg.app" },
    { CODE3_DELETION_TEST_PREVIEW_TARGET: "production" }, { CODE3_DELETION_TEST_PREVIEW_TARGET: "" },
    { CODE3_DELETION_TEST_PREVIEW_DEPLOYMENT_ID: "" }, { CODE3_DELETION_TEST_PREVIEW_DEPLOYMENT_ID: "user-supplied" },
    { CODE3_DELETION_TEST_PREVIEW_DEPLOYMENT_ID: "dpl_FsYtzWk5ZizgYHxGcpjMFzxvX3uK" },
    { CODE3_DELETION_TEST_DENIED_APP_ORIGINS: appOrigin }, { CODE3_DELETION_TEST_DENIED_DEPLOYMENT_IDS: deploymentId },
  ]) assert.throws(() => readHostedDeletionHttpsConfig({ ...env, ...patch }, args));
  assert.throws(() => readHostedDeletionHttpsConfig(env, args.filter((value, i) => ![6, 7].includes(i))));
  const withBrowser = readHostedDeletionHttpsConfig(env, [...args, "--with-browser"]);
  assert.equal(withBrowser.withBrowser, true);
});

test("Production hosts aliases custom domains URL tricks and non-HTTPS cannot enter the Preview allowlist", () => {
  for (const origin of ["https://code3tcg.app", "https://www.code3tcg.app", "https://ember-tide-tcg.vercel.app",
    "https://ember-tide-dixlgjexv-zafthegreat-cybers-projects.vercel.app",
    "https://ember-tide-tcg-zafthegreat-cybers-projects.vercel.app", "https://ember-tide-tcg-git-privacy-test-team.vercel.app",
    "https://custom-stage.example.test", "http://localhost:5385", appOrigin + "/", appOrigin + "?safe=true", appOrigin + "#fragment",
    appOrigin.replace("https://", "https://user@"), appOrigin.replace(".app", ".app:443"), appOrigin.toUpperCase(),
    `https://${ref}.supabase.co`, "https://code3-privacy-qa-abc123def-test-team.vercel.app.evil.test"]) {
    assert.throws(() => previewOrigin(origin));
    assert.throws(() => readHostedDeletionHttpsConfig({ ...env, CODE3_DELETION_TEST_ALLOWED_APP_ORIGINS: `${appOrigin},${origin}` }, args));
  }
});

test("check-config cannot execute or become ambiguous and extra account inputs are rejected", async () => {
  const checking = readHostedDeletionHttpsConfig(env, [...args.filter(value => value !== "--execute"), "--check-config"]);
  assert.equal(checking.execute, false);
  await assert.rejects(runHostedDeletionHttpsAcceptance(checking), /explicitly enabled/);
  for (const extra of [["--check-config"], ["--app-origin", appOrigin], ["--confirm-preview-origin", appOrigin],
    ["--with-browser", "--with-browser"], ["--existing-user-id", randomUUID()], ["--password", "never-accepted"], ["unexpected"]]) {
    assert.throws(() => readHostedDeletionHttpsConfig(env, [...args, ...extra]));
  }
});

test("fabricated HTTPS configs cannot bypass provider or destination checks", async () => {
  const fabricated = { projectRef: ref, appOrigin, deploymentId, execute: true };
  assert.throws(() => restrictedHttpsAppFetch(fabricated), /Fabricated/);
  assert.throws(() => isolatedProviderConfig(fabricated), /Fabricated/);
  assert.throws(() => assertPreviewVersion(fabricated, { app: "code3-tcg", version: deploymentId + "-build" }), /Fabricated/);
  await assert.rejects(runHostedDeletionHttpsAcceptance(fabricated), /Fabricated/);
});

test("served version must match the independently reviewed deployment exactly", () => {
  const c = config();
  assert.doesNotThrow(() => assertPreviewVersion(c, { app: "code3-tcg", version: deploymentId + "-build" }));
  for (const value of [null, [], {}, { app: "other", version: deploymentId + "-build" },
    { app: "code3-tcg", version: "prefix-" + deploymentId + "-build" }, { app: "code3-tcg", version: deploymentId + "suffix-build" }]) {
    assert.throws(() => assertPreviewVersion(c, value));
  }
});

test("app fetch restricts origin route method credentials redirects and a bounded deadline", async () => {
  const calls = [];
  const fetch = restrictedHttpsAppFetch(config(), async (input, options) => { calls.push({ input, options }); return Response.json({}); });
  for (const url of ["https://code3tcg.app/api/account/deletion", "https://evil.example/api/account/deletion",
    appOrigin + "/api/account/deletion?user=other", appOrigin + "/api/account/deletion#fragment", appOrigin + "/api/unknown",
    appOrigin.replace("https://", "https://user@") + "/api/account/deletion/status"]) assert.throws(() => fetch(url));
  assert.throws(() => fetch(appOrigin + "/app-version.json", { method: "POST" }));
  assert.throws(() => fetch(appOrigin + "/api/account/deletion", { method: "DELETE" }));
  assert.throws(() => fetch(appOrigin + "/app-version.json", { headers: { Authorization: "Bearer synthetic" } }));
  assert.throws(() => fetch(appOrigin + "/api/account/deletion/status", { headers: { Cookie: "synthetic" } }));
  await fetch(appOrigin + "/api/account/deletion/status", { redirect: "follow", credentials: "include", cache: "force-cache" });
  assert.equal(calls.length, 1); assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.credentials, "omit"); assert.equal(calls[0].options.cache, "no-store"); assert.ok(calls[0].options.signal);
});

test("acceptance JSON bounds reject wrong type oversized malformed and invalid UTF8 bodies", async () => {
  assert.deepEqual(await readBoundedAcceptanceJson(Response.json({ ok: true })), { ok: true });
  await assert.rejects(readBoundedAcceptanceJson(new Response("text")), /JSON/);
  await assert.rejects(readBoundedAcceptanceJson(new Response("{", { headers: { "content-type": "application/json" } })), /invalid JSON/);
  await assert.rejects(readBoundedAcceptanceJson(Response.json({ large: "x".repeat(32_768) })), /oversized/);
  await assert.rejects(readBoundedAcceptanceJson(new Response(Uint8Array.from([0xff]), { headers: { "content-type": "application/json" } })), /invalid JSON/);
});

test("optional Preview OIDC stays private and is sent only to exact reviewed app paths", async () => {
  const token = "eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJodHRwczovL29pZGMudmVyY2VsLmNvbS90ZXN0In0.synthetic-signature";
  const c = readHostedDeletionHttpsConfig({ ...env, CODE3_DELETION_TEST_PREVIEW_OIDC_TOKEN: token }, args);
  assert.ok(!JSON.stringify(c).includes(token), "OIDC must not be enumerable in configuration or reports");
  for (const path of ["/app-version.json", "/api/account/deletion/status", "/delete-account", "/assets/index.js"]) {
    assert.equal(previewAccessHeaders(c, appOrigin + path)["x-vercel-trusted-oidc-idp-token"], token);
  }
  assert.equal(previewAccessHeaders(c, appOrigin + "/api/account/deletion", "POST")["x-vercel-trusted-oidc-idp-token"], token);
  for (const url of [providerOriginForTest(), "https://code3tcg.app/api/account/deletion", appOrigin + "/api/unreviewed",
    appOrigin + "/api/account/deletion/status?other=1", appOrigin.replace("https://", "https://user@") + "/app-version.json"]) {
    assert.deepEqual(previewAccessHeaders(c, url), {});
  }
  assert.deepEqual(previewAccessHeaders(c, appOrigin + "/assets/index.js", "POST"), {});
  const calls = [];
  const scoped = restrictedHttpsAppFetch(c, async (_input, options) => { calls.push(options); return Response.json({}); });
  await scoped(appOrigin + "/app-version.json");
  await scoped(appOrigin + "/api/account/deletion", { method: "POST", headers: { Authorization: "Bearer synthetic-user" } });
  assert.ok(calls.every(call => call.headers.get("x-vercel-trusted-oidc-idp-token") === token && call.redirect === "error"));
  assert.deepEqual(previewAccessHeaders(config(), appOrigin + "/app-version.json"), {}, "Missing OIDC never enables a bypass");
  assert.throws(() => readHostedDeletionHttpsConfig({ ...env, CODE3_DELETION_TEST_PREVIEW_OIDC_TOKEN: token + "\r\nInjected:value" }, args));
  assert.throws(() => readHostedDeletionHttpsConfig({ ...env, CODE3_DELETION_TEST_PREVIEW_OIDC_TOKEN: "sb_secret_not_an_oidc_token" }, args));
  assert.throws(() => readHostedDeletionHttpsConfig({ ...env, CODE3_DELETION_TEST_PREVIEW_OIDC_TOKEN: jwt("service_role") }, args));
});

function providerOriginForTest() { return `https://${ref}.supabase.co/auth/v1/token?grant_type=password`; }

test("mismatched served build stops before any provider request or synthetic account creation", async () => {
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async input => { calls.push(String(input)); return Response.json({ app: "code3-tcg", version: "different-deployment" }); };
  try {
    const report = await runHostedDeletionHttpsAcceptance(config(), { reportSink: async () => {} });
    assert.equal(report.status, "failed"); assert.equal(report.failedStage, "preview-build-preflight");
    assert.deepEqual(report.fixtures, []); assert.deepEqual(calls, [appOrigin + "/app-version.json"]);
    const json = JSON.stringify(report);
    assert.ok(!json.includes(env.CODE3_DELETION_TEST_SERVICE_ROLE_KEY)); assert.ok(!json.includes("password"));
    assert.ok(!json.includes("access_token"));
  } finally { globalThis.fetch = original; }
});
