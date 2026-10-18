import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import express from "express";
const require = createRequire(import.meta.url);
const { createProtectedCors, allowedOriginsForRuntime } = require("../dist/security/corsPolicy.js");
const { createOwnerSecurity } = require("../dist/auth/ownerAuthorization.js");
const nativeOrigins = ["capacitor://localhost", "https://localhost"];
const web = "https://code3tcg.app";

function response() {
  const result = { code: 200, headers: {}, body: null, next: false };
  return { result, getHeader: key => result.headers[key], setHeader: (key, value) => { result.headers[key] = value; }, status(code) { result.code = code; return this; }, json(body) { result.body = body; return this; }, end() { return this; } };
}
function invoke(origin, options = {}, method = "GET") {
  const res = response(); createProtectedCors(options)({ headers: { origin }, method }, res, () => { res.result.next = true; }); return res.result;
}
test("native bundled origins are denied by default and explicitly enabled only in known runtimes", () => {
  for (const origin of nativeOrigins) {
    assert.equal(invoke(origin, { runtimeKind: "production", env: { CODE3_CORS_ALLOWED_ORIGINS: web } }).code, 403);
    const allowed = invoke(origin, { runtimeKind: "production", env: { CODE3_NATIVE_CLIENT_ENABLED: "true" } });
    assert.equal(allowed.next, true); assert.equal(allowed.headers["Access-Control-Allow-Origin"], origin); assert.equal(allowed.headers["Cache-Control"], "no-store");
  }
  assert.equal(allowedOriginsForRuntime({ CODE3_NATIVE_CLIENT_ENABLED: "true" }, "unknown").size, 0);
  assert.equal(allowedOriginsForRuntime({ CODE3_NATIVE_CLIENT_ENABLED: "TRUE" }, "production").size, 0);
});
test("native origin spoof variants, opaque origins and unrelated origins remain denied", () => {
  for (const origin of ["null", "*", "capacitor://localhost/", "capacitor://evil", "capacitor://localhost:443", "capacitor://user@localhost", "http://localhost", "https://localhost:4430", "https://localhost.evil.test", "https://evil.test", "code3tcg://auth", "file://", "capacitor://localhost/path"]) {
    const result = invoke(origin, { runtimeKind: "production", env: { CODE3_NATIVE_CLIENT_ENABLED: "true" } }); assert.equal(result.code, 403, origin); assert.equal(result.next, false, origin); assert.equal(result.headers["Access-Control-Allow-Origin"], undefined, origin);
  }
});
test("preflight keeps bearer headers, disallows local identity hints in production and scopes DELETE separately", () => {
  const env = { CODE3_NATIVE_CLIENT_ENABLED: "true" };
  const standard = invoke(nativeOrigins[0], { runtimeKind: "production", env }, "OPTIONS");
  assert.equal(standard.code, 204); assert.equal(standard.next, false); assert.equal(standard.headers["Access-Control-Allow-Headers"], "Authorization, Content-Type"); assert.ok(!standard.headers["Access-Control-Allow-Methods"].includes("DELETE")); assert.equal(standard.headers["Access-Control-Allow-Credentials"], undefined);
  const deletion = invoke(nativeOrigins[1], { runtimeKind: "production", env, allowDelete: true }, "OPTIONS"); assert.ok(deletion.headers["Access-Control-Allow-Methods"].includes("DELETE"));
});
test("enabling native origins does not merge preview and production web allowlists", () => {
  const env = { CODE3_NATIVE_CLIENT_ENABLED: "true", CODE3_CORS_ALLOWED_ORIGINS: web, CODE3_CORS_PREVIEW_ORIGINS: "https://preview.example.test" };
  assert.equal(invoke(web, { runtimeKind: "preview", env }).code, 403); assert.equal(invoke("https://preview.example.test", { runtimeKind: "production", env }).code, 403);
  for (const origin of nativeOrigins) assert.equal(invoke(origin, { runtimeKind: "preview", env }).next, true);
});
test("native CORS permission is not account permission: actual owner guard still rejects missing/non-owner tokens", async () => {
  const env = { CODE3_NATIVE_CLIENT_ENABLED: "true", CODE3_OWNER_SUBJECTS: "supabase:synthetic-owner" };
  const identityProvider = { providerId: "supabase", isConfigured: () => true, verifyAccessToken: async token => ["synthetic-owner", "synthetic-regular"].includes(token) ? { ok: true, principal: { provider: "supabase", subject: token, issuedAt: 1, expiresAt: 2_000_000_000 } } : { ok: false, reason: "invalid" } };
  const security = createOwnerSecurity({ env, runtimeKind: "production", identityProvider });
  const app = express(); app.use(createProtectedCors({ env, runtimeKind: "production" }), security.requireOwner); app.get("/private", (_req, res) => res.json({ synthetic: true }));
  const server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  try {
    for (const origin of nativeOrigins) for (const [token, status] of [[null, 401], ["synthetic-regular", 403], ["synthetic-owner", 200]]) {
      const headers = { Origin: origin, "X-Code3-Local-Dev": "true" }; if (token) headers.Authorization = `Bearer ${token}`;
      const result = await fetch(`http://127.0.0.1:${server.address().port}/private`, { headers }); assert.equal(result.status, status); assert.equal(result.headers.get("access-control-allow-origin"), origin);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
