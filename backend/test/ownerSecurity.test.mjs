import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import express from "express";

const require = createRequire(import.meta.url);
const { createOwnerSecurity } = require("../dist/auth/ownerAuthorization.js");
const { createSupabaseIdentityProvider } = require("../dist/auth/supabaseIdentityProvider.js");
const { createAuthRouter } = require("../dist/routes/auth.routes.js");
const { createEbayRouter } = require("../dist/routes/ebay.routes.js");
const { createProtectedCors, allowedOriginsForRuntime } = require("../dist/security/corsPolicy.js");
const { redactSensitive, redactText } = require("../dist/security/redaction.js");

const NOW_MS = Date.parse("2026-08-19T12:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW_MS / 1_000);

function principal(subject, overrides = {}) {
  return Object.freeze({
    subject,
    provider: "supabase",
    email: `${subject}@example.test`,
    emailVerified: true,
    issuedAt: NOW_SECONDS - 60,
    expiresAt: NOW_SECONDS + 3_600,
    ...overrides,
  });
}

function identityProvider({ configured = true } = {}) {
  return {
    providerId: "supabase",
    isConfigured: () => configured,
    async verifyAccessToken(token) {
      if (!configured) return { ok: false, reason: "not_configured" };
      if (token === "owner-token") return { ok: true, principal: principal("owner-subject") };
      if (token === "non-owner-token") return { ok: true, principal: principal("other-subject") };
      if (token === "expired-token") return { ok: false, reason: "expired" };
      if (token === "unavailable-token") return { ok: false, reason: "unavailable" };
      return { ok: false, reason: "invalid" };
    },
  };
}

function buildSecurity({
  env = {},
  runtimeKind = "production",
  provider = identityProvider(),
  testPrincipalResolver,
} = {}) {
  return createOwnerSecurity({
    env,
    runtimeKind,
    identityProvider: provider,
    testPrincipalResolver,
    now: () => NOW_MS,
  });
}

function createProtectedApp({ security, env = {}, runtimeKind = "production", ebay = true }) {
  const app = express();
  app.use(express.json());
  const protectedCors = createProtectedCors({ env, runtimeKind });
  app.use("/api/auth", protectedCors, createAuthRouter(security));
  if (ebay) app.use("/api/ebay", protectedCors, createEbayRouter(security.requireOwner));
  app.use("/api/owner-test", protectedCors, security.requireOwner, (_request, response) => {
    response.json({ ok: true });
  });
  return app;
}

function createCorsApp(env, runtimeKind) {
  const app = express();
  app.use(createProtectedCors({ env, runtimeKind }));
  app.all("/resource", (_request, response) => response.json({ ok: true }));
  return app;
}

async function withServer(app, run) {
  const server = await new Promise((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    listening.once("error", reject);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null, text };
}

test("Supabase verification calls getUser and returns a normalized principal", async () => {
  const calls = [];
  const token = makeJwt({ sub: "owner-subject", iat: NOW_SECONDS - 10, exp: NOW_SECONDS + 600 });
  const provider = createSupabaseIdentityProvider({
    env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "public-anon-test-key" },
    client: {
      auth: {
        async getUser(receivedToken) {
          calls.push(receivedToken);
          return {
            data: { user: { id: "owner-subject", email: "owner@example.test", email_confirmed_at: "2026-01-01T00:00:00.000Z" } },
            error: null,
          };
        },
      },
    },
    now: () => NOW_MS,
  });
  const result = await provider.verifyAccessToken(token);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [token]);
  assert.equal(result.principal.subject, "owner-subject");
  assert.equal(result.principal.provider, "supabase");
  assert.equal(result.principal.emailVerified, true);
  assert.equal(Object.isFrozen(result.principal), true);
});

test("Supabase verification rejects expired tokens before getUser", async () => {
  let calls = 0;
  const provider = createSupabaseIdentityProvider({
    env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "public-anon-test-key" },
    client: { auth: { async getUser() { calls += 1; return { data: { user: null }, error: null }; } } },
    now: () => NOW_MS,
  });
  const result = await provider.verifyAccessToken(makeJwt({ sub: "owner-subject", iat: NOW_SECONDS - 600, exp: NOW_SECONDS - 1 }));
  assert.deepEqual(result, { ok: false, reason: "expired" });
  assert.equal(calls, 0);
});

test("Supabase verification fails closed when server auth is not configured", async () => {
  const provider = createSupabaseIdentityProvider({ env: {}, now: () => NOW_MS });
  assert.equal(provider.isConfigured(), false);
  assert.deepEqual(await provider.verifyAccessToken("not-a-token"), { ok: false, reason: "not_configured" });
});

for (const [name, token, expectedStatus] of [
  ["missing authentication", null, 401],
  ["invalid authentication", "invalid-token", 401],
  ["expired authentication", "expired-token", 401],
  ["authenticated non-owner", "non-owner-token", 403],
]) {
  test(`${name} is denied on an owner route`, async () => {
    const security = buildSecurity({ env: { CODE3_OWNER_SUBJECTS: "supabase:owner-subject" } });
    await withServer(createProtectedApp({ security }), async (baseUrl) => {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const result = await requestJson(baseUrl, "/api/owner-test", { headers });
      assert.equal(result.response.status, expectedStatus);
      assert.equal(result.response.headers.get("cache-control"), "no-store");
      assert.doesNotMatch(result.text, /owner-subject|CODE3_OWNER_SUBJECTS/i);
    });
  });
}

test("authenticated owner is authorized with an exact provider-qualified subject", async () => {
  const security = buildSecurity({ env: { CODE3_OWNER_SUBJECTS: "supabase:owner-subject" } });
  await withServer(createProtectedApp({ security }), async (baseUrl) => {
    const result = await requestJson(baseUrl, "/api/owner-test", { headers: { Authorization: "Bearer owner-token" } });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body, { ok: true });
  });
});

test("a missing production authentication configuration is denied", async () => {
  const security = buildSecurity({
    env: { CODE3_OWNER_SUBJECTS: "supabase:owner-subject" },
    provider: identityProvider({ configured: false }),
  });
  await withServer(createProtectedApp({ security }), async (baseUrl) => {
    const result = await requestJson(baseUrl, "/api/owner-test", { headers: { Authorization: "Bearer owner-token" } });
    assert.equal(result.response.status, 401);
  });
});

test("a missing production owner allowlist is denied", async () => {
  const security = buildSecurity({ env: {} });
  await withServer(createProtectedApp({ security }), async (baseUrl) => {
    const result = await requestJson(baseUrl, "/api/owner-test", { headers: { Authorization: "Bearer owner-token" } });
    assert.equal(result.response.status, 403);
  });
});

test("client roles and URL tokens cannot override server authentication", async () => {
  const security = buildSecurity({ env: { CODE3_OWNER_SUBJECTS: "supabase:owner-subject" } });
  await withServer(createProtectedApp({ security }), async (baseUrl) => {
    const result = await requestJson(baseUrl, "/api/owner-test?access_token=owner-token&role=OWNER", {
      headers: { "X-Role": "OWNER" },
    });
    assert.equal(result.response.status, 401);
  });
});

test("identity-provider outages fail closed without exposing the supplied token", async () => {
  const security = buildSecurity({ env: { CODE3_OWNER_SUBJECTS: "supabase:owner-subject" } });
  await withServer(createProtectedApp({ security }), async (baseUrl) => {
    const result = await requestJson(baseUrl, "/api/owner-test", {
      headers: { Authorization: "Bearer unavailable-token" },
    });
    assert.equal(result.response.status, 503);
    assert.equal(result.body.error.code, "authentication_unavailable");
    assert.doesNotMatch(result.text, /unavailable-token|owner-subject/i);
  });
});

test("local development identity requires opt-in, loopback, and the exact dev header", async () => {
  const env = { NODE_ENV: "development", CODE3_ENABLE_LOCAL_DEV_AUTH: "true", CODE3_CORS_LOCAL_ORIGINS: "http://localhost:5173" };
  const security = buildSecurity({ env, runtimeKind: "local-development", provider: identityProvider({ configured: false }) });
  await withServer(createProtectedApp({ security, env, runtimeKind: "local-development" }), async (baseUrl) => {
    const missingHeader = await requestJson(baseUrl, "/api/owner-test");
    assert.equal(missingHeader.response.status, 401);
    const enabledResult = await requestJson(baseUrl, "/api/owner-test", { headers: { "X-Code3-Local-Dev": "1" } });
    assert.equal(enabledResult.response.status, 200);
  });
});

for (const runtimeKind of ["preview", "production"]) {
  test(`local development identity is rejected in ${runtimeKind}`, async () => {
    const env = { NODE_ENV: "development", CODE3_ENABLE_LOCAL_DEV_AUTH: "true" };
    const security = buildSecurity({ env, runtimeKind, provider: identityProvider({ configured: false }) });
    await withServer(createProtectedApp({ security, env, runtimeKind }), async (baseUrl) => {
      const result = await requestJson(baseUrl, "/api/owner-test", { headers: { "X-Code3-Local-Dev": "1" } });
      assert.equal(result.response.status, 401);
    });
  });
}

test("automated-test identity resolver works only in the automated-test runtime", async () => {
  const resolver = () => principal("fixture-subject");
  const testSecurity = buildSecurity({ env: { NODE_ENV: "test" }, runtimeKind: "automated-test", testPrincipalResolver: resolver });
  const previewSecurity = buildSecurity({ env: { NODE_ENV: "test", VERCEL_ENV: "preview" }, runtimeKind: "preview", testPrincipalResolver: resolver });
  await withServer(createProtectedApp({ security: testSecurity, runtimeKind: "automated-test" }), async (baseUrl) => {
    assert.equal((await requestJson(baseUrl, "/api/owner-test")).response.status, 200);
  });
  await withServer(createProtectedApp({ security: previewSecurity, runtimeKind: "preview" }), async (baseUrl) => {
    assert.equal((await requestJson(baseUrl, "/api/owner-test")).response.status, 401);
  });
});

test("session endpoint returns only safe identity state and never the owner identifier or token", async () => {
  const security = buildSecurity({ env: { CODE3_OWNER_SUBJECTS: "supabase:owner-subject" } });
  await withServer(createProtectedApp({ security }), async (baseUrl) => {
    const result = await requestJson(baseUrl, "/api/auth/session", { headers: { Authorization: "Bearer owner-token" } });
    assert.equal(result.response.status, 200);
    assert.equal(result.response.headers.get("cache-control"), "no-store");
    assert.equal(result.body.authenticated, true);
    assert.equal(result.body.ownerAuthorized, true);
    assert.equal(result.body.provider, "supabase");
    assert.match(result.body.displayIdentity, /^o\*\*\*@example\.test$/);
    assert.doesNotMatch(result.text, /owner-subject|owner-token|authorization|allowlist/i);
  });
});

test("redaction removes authorization headers, tokens, secrets, sessions, and allowlists", () => {
  const redacted = redactSensitive({
    authorization: "Bearer top.secret.token",
    accessToken: "access-value",
    clientSecret: "secret-value",
    session: { refreshToken: "refresh-value" },
    ownerSubjects: "supabase:private-id",
    safe: "Bearer another.token.value",
  });
  const text = JSON.stringify(redacted);
  assert.doesNotMatch(text, /top\.secret\.token|access-value|secret-value|refresh-value|private-id|another\.token\.value/);
  assert.match(redactText("Failure for Bearer hidden.token.value"), /Bearer \[REDACTED\]/);
});

test("eBay health and search routes require owner authorization", async () => {
  const security = buildSecurity({ env: { CODE3_OWNER_SUBJECTS: "supabase:owner-subject" } });
  await withServer(createProtectedApp({ security }), async (baseUrl) => {
    assert.equal((await requestJson(baseUrl, "/api/ebay/health")).response.status, 401);
    assert.equal((await requestJson(baseUrl, "/api/ebay/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: "pokemon" }),
    })).response.status, 401);
    const ownerHealth = await requestJson(baseUrl, "/api/ebay/health", { headers: { Authorization: "Bearer owner-token" } });
    assert.equal(ownerHealth.response.status, 200);
    assert.equal(ownerHealth.body.providerId, "ebay");
  });
});

test("eBay router preserves service behavior when reusable authorization passes", async () => {
  const app = express();
  app.use("/api/ebay", createEbayRouter((_request, _response, next) => next()));
  await withServer(app, async (baseUrl) => {
    const result = await requestJson(baseUrl, "/api/ebay/health");
    assert.equal(result.response.status, 200);
    assert.equal(result.body.providerId, "ebay");
    assert.equal(result.response.headers.get("cache-control"), "no-store");
  });
});

test("configured exact origins are scoped to their runtime", () => {
  const env = {
    CODE3_CORS_ALLOWED_ORIGINS: "https://app.example.test,*",
    CODE3_CORS_PREVIEW_ORIGINS: "https://preview.example.test",
    CODE3_CORS_LOCAL_ORIGINS: "http://localhost:5173",
  };
  assert.deepEqual([...allowedOriginsForRuntime(env, "production")].sort(), ["https://app.example.test"]);
  assert.deepEqual([...allowedOriginsForRuntime(env, "preview")].sort(), ["https://preview.example.test"]);
  assert.deepEqual([...allowedOriginsForRuntime(env, "local-development")].sort(), ["http://localhost:5173", "https://app.example.test"]);
});

for (const scenario of [
  { name: "approved application", runtimeKind: "production", origin: "https://app.example.test" },
  { name: "configured Preview", runtimeKind: "preview", origin: "https://preview.example.test" },
  { name: "approved local-development", runtimeKind: "local-development", origin: "http://localhost:5173" },
]) {
  test(`${scenario.name} origin receives an exact CORS response`, async () => {
    const env = {
      CODE3_CORS_ALLOWED_ORIGINS: "https://app.example.test",
      CODE3_CORS_PREVIEW_ORIGINS: "https://preview.example.test",
      CODE3_CORS_LOCAL_ORIGINS: "http://localhost:5173",
    };
    await withServer(createCorsApp(env, scenario.runtimeKind), async (baseUrl) => {
      const result = await requestJson(baseUrl, "/resource", { headers: { Origin: scenario.origin } });
      assert.equal(result.response.status, 200);
      assert.equal(result.response.headers.get("access-control-allow-origin"), scenario.origin);
      assert.match(result.response.headers.get("vary") || "", /(?:^|,\s*)Origin(?:,|$)/i);
      assert.notEqual(result.response.headers.get("access-control-allow-origin"), "*");
    });
  });
}

test("arbitrary origins and wildcard configuration are rejected without reflection", async () => {
  const env = { CODE3_CORS_ALLOWED_ORIGINS: "https://app.example.test,*" };
  await withServer(createCorsApp(env, "production"), async (baseUrl) => {
    const result = await requestJson(baseUrl, "/resource", { headers: { Origin: "https://attacker.example" } });
    assert.equal(result.response.status, 403);
    assert.equal(result.response.headers.get("access-control-allow-origin"), null);
    assert.doesNotMatch(result.text, /attacker\.example/);
  });
});

test("approved and rejected preflight requests follow exact-origin policy", async () => {
  const env = { CODE3_CORS_ALLOWED_ORIGINS: "https://app.example.test" };
  await withServer(createCorsApp(env, "production"), async (baseUrl) => {
    const approved = await fetch(`${baseUrl}/resource`, {
      method: "OPTIONS",
      headers: { Origin: "https://app.example.test", "Access-Control-Request-Method": "POST" },
    });
    assert.equal(approved.status, 204);
    assert.equal(approved.headers.get("access-control-allow-origin"), "https://app.example.test");
    assert.equal(approved.headers.get("access-control-allow-headers"), "Authorization, Content-Type");

    const rejected = await requestJson(baseUrl, "/resource", {
      method: "OPTIONS",
      headers: { Origin: "https://attacker.example", "Access-Control-Request-Method": "POST" },
    });
    assert.equal(rejected.response.status, 403);
  });
});

test("the local development preflight is the only browser flow that permits the dev header", async () => {
  const env = {
    CODE3_CORS_ALLOWED_ORIGINS: "https://app.example.test",
    CODE3_CORS_LOCAL_ORIGINS: "http://localhost:5173",
  };
  await withServer(createCorsApp(env, "local-development"), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/resource`, { method: "OPTIONS", headers: { Origin: "http://localhost:5173" } });
    assert.match(response.headers.get("access-control-allow-headers") || "", /X-Code3-Local-Dev/);
  });
  await withServer(createCorsApp(env, "production"), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/resource`, { method: "OPTIONS", headers: { Origin: "https://app.example.test" } });
    assert.doesNotMatch(response.headers.get("access-control-allow-headers") || "", /X-Code3-Local-Dev/);
  });
});

function makeJwt(claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(claims)}.fixture-signature`;
}
