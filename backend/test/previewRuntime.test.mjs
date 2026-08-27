import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import { test } from "node:test";
import express from "express";

const require = createRequire(import.meta.url);
const { createProviderRuntime } = require("../dist/providerRuntime/runtime.js");
const { resolveTrustedRuntimeProof } = require("../dist/providerRuntime/trustedRuntime.js");
const { createProviderConnectionsRouter } = require("../dist/routes/providerConnections.routes.js");
const { createOwnerSecurity } = require("../dist/auth/ownerAuthorization.js");
const { createProtectedCors } = require("../dist/security/corsPolicy.js");

const NOW_MS = Date.parse("2026-08-27T12:00:00.000Z");

function principal(subject = "owner-subject") {
  const nowSeconds = Math.floor(NOW_MS / 1_000);
  return Object.freeze({
    provider: "supabase",
    subject,
    email: `${subject}@example.test`,
    emailVerified: true,
    issuedAt: nowSeconds - 60,
    expiresAt: nowSeconds + 3_600,
  });
}

function identityProvider() {
  return Object.freeze({
    providerId: "supabase",
    isConfigured: () => true,
    verifyAccessToken: async (token) => token === "owner-test-token"
      ? { ok: true, principal: principal() }
      : token === "non-owner-test-token"
        ? { ok: true, principal: principal("another-subject") }
        : { ok: false, reason: "invalid" },
  });
}

function createApp(runtime) {
  const app = express();
  const security = createOwnerSecurity({
    env: { CODE3_OWNER_SUBJECTS: "supabase:owner-subject" },
    runtimeKind: "preview",
    identityProvider: identityProvider(),
    now: () => NOW_MS,
  });
  app.use(
    "/api/account-ops/provider-connections",
    createProtectedCors({
      env: { CODE3_CORS_PREVIEW_ORIGINS: "https://preview.example.test" },
      runtimeKind: "preview",
    }),
    createProviderConnectionsRouter({ requireOwner: security.requireOwner, runtime }),
  );
  return app;
}

async function withServer(app, run) {
  const server = await new Promise((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    listening.once("error", reject);
  });
  const address = server.address();
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function request(baseUrl, path, options = {}) {
  const url = new URL(path, baseUrl);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: options.method || "GET",
      headers: options.headers || {},
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const bodyText = Buffer.concat(chunks).toString("utf8");
        let body = null;
        try { body = bodyText ? JSON.parse(bodyText) : null; } catch { body = bodyText; }
        resolve({ response, body, bodyText });
      });
    });
    request.once("error", reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

function auth(token = "owner-test-token") {
  return { Authorization: `Bearer ${token}` };
}

test("trusted-runtime proof requires exact server-owned Vercel Preview markers", () => {
  const preview = resolveTrustedRuntimeProof({ VERCEL: "1", VERCEL_ENV: "preview", NODE_ENV: "production" });
  assert.deepEqual(preview, {
    proofVersion: "code3.preview-runtime-proof.v1",
    execution: "SERVER",
    environment: "PREVIEW",
    previewEnvironment: true,
    productionEnvironment: false,
    providerRuntimeLoaded: true,
    providerNetworkAccessEnabled: false,
    hostedRuntimeVerified: true,
  });

  const cases = [
    [{ VERCEL_ENV: "preview", NODE_ENV: "production" }, "UNKNOWN"],
    [{ VERCEL: "1" }, "HOSTED_UNKNOWN"],
    [{ VERCEL: "1", VERCEL_ENV: "development" }, "HOSTED_UNKNOWN"],
    [{ VERCEL: "1", VERCEL_ENV: "production" }, "PRODUCTION"],
    [{ NODE_ENV: "development" }, "LOCAL_DEVELOPMENT"],
    [{ NODE_ENV: "test" }, "AUTOMATED_TEST"],
    [{}, "UNKNOWN"],
  ];
  for (const [env, environment] of cases) {
    const proof = resolveTrustedRuntimeProof(env);
    assert.equal(proof.environment, environment);
    assert.equal(proof.hostedRuntimeVerified, false);
  }
  assert.equal(resolveTrustedRuntimeProof({ VERCEL: "1", VERCEL_ENV: "production" }).productionEnvironment, true);
});

test("verified Preview execution remains separate from unavailable mailbox providers", async () => {
  const runtime = createProviderRuntime({
    trustedRuntimeProof: resolveTrustedRuntimeProof({ VERCEL: "1", VERCEL_ENV: "preview" }),
  });
  const result = await runtime.status(principal());
  const capabilities = runtime.capabilities(principal());

  assert.equal(result.hostedRuntimeVerified, true);
  assert.equal(result.trustedRuntimeProof.environment, "PREVIEW");
  assert.equal(result.trustedRuntimeProof.productionEnvironment, false);
  assert.equal(result.trustedRuntimeProof.providerNetworkAccessEnabled, false);
  assert.equal(result.available, false);
  assert.equal(result.liveProviderConnected, false);
  assert.equal(result.connectionStorage.available, false);
  assert.equal(result.secretStorage.available, false);
  assert.equal(result.oauthStateStorage.available, false);
  assert.equal(result.automaticPurchaseCreation, false);
  assert.equal(result.localOnlyBusinessDataAuthoritative, true);
  assert.match(result.detail, /trusted Preview runtime is available/i);
  assert.deepEqual(capabilities.providers.map((provider) => provider.providerId), ["gmail", "microsoft-outlook"]);
  for (const provider of capabilities.providers) {
    assert.equal(provider.configurationStatus, "NOT_CONFIGURED");
    assert.equal(provider.authorizationStatus, "UNAVAILABLE");
    assert.ok(Object.values(provider.capabilities).every((value) => value === false));
  }
});

test("Preview provider proof route is owner-gated JSON and performs no mailbox network call", async () => {
  const runtime = createProviderRuntime({
    trustedRuntimeProof: resolveTrustedRuntimeProof({ VERCEL: "1", VERCEL_ENV: "preview" }),
  });
  await withServer(createApp(runtime), async (baseUrl) => {
    const originalFetch = globalThis.fetch;
    let mailboxNetworkCalls = 0;
    globalThis.fetch = async () => {
      mailboxNetworkCalls += 1;
      throw new Error("Mailbox network access is prohibited in Phase 2B2-A tests.");
    };
    try {
      assert.equal((await request(baseUrl, "/api/account-ops/provider-connections")).response.statusCode, 401);
      assert.equal((await request(baseUrl, "/api/account-ops/provider-connections", { headers: auth("non-owner-test-token") })).response.statusCode, 403);
      const ownerResult = await request(
        baseUrl,
        "/api/account-ops/provider-connections?ownerId=attacker&role=OWNER&VERCEL_ENV=production",
        { headers: { ...auth(), Origin: "https://preview.example.test" } },
      );
      assert.equal(ownerResult.response.statusCode, 200);
      assert.match(String(ownerResult.response.headers["content-type"] || ""), /application\/json/i);
      assert.equal(ownerResult.response.headers["cache-control"], "no-store");
      assert.match(String(ownerResult.response.headers.vary || ""), /Origin/i);
      assert.equal(ownerResult.response.headers["access-control-allow-origin"], "https://preview.example.test");
      assert.equal(ownerResult.body.configurationState, "NOT_CONFIGURED");
      assert.equal(ownerResult.body.runtime.hostedRuntimeVerified, true);
      assert.equal(ownerResult.body.runtime.trustedRuntimeProof.environment, "PREVIEW");
      assert.equal(ownerResult.body.runtime.trustedRuntimeProof.productionEnvironment, false);
      assert.equal(ownerResult.body.runtime.trustedRuntimeProof.providerNetworkAccessEnabled, false);
      assert.deepEqual(ownerResult.body.connections, []);
      assert.deepEqual(ownerResult.body.providerCapabilities.map((provider) => provider.configurationStatus), ["NOT_CONFIGURED", "NOT_CONFIGURED"]);
      for (const provider of ownerResult.body.providerCapabilities) {
        assert.ok(Object.values(provider.capabilities).every((value) => value === false));
      }
      assert.doesNotMatch(
        ownerResult.bodyText,
        /owner-subject|owner-test-token|bearer\s+|"(?:accessToken|refreshToken|authorizationCode|clientSecret|oauthState|codeVerifier|password|otp|rawClaims|stack)"\s*:/i,
      );
      assert.equal(mailboxNetworkCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("Preview proof route rejects arbitrary origins and unknown operations safely", async () => {
  const runtime = createProviderRuntime({
    trustedRuntimeProof: resolveTrustedRuntimeProof({ VERCEL: "1", VERCEL_ENV: "preview" }),
  });
  await withServer(createApp(runtime), async (baseUrl) => {
    const rejected = await request(baseUrl, "/api/account-ops/provider-connections", {
      headers: { ...auth(), Origin: "https://attacker.example" },
    });
    assert.equal(rejected.response.statusCode, 403);
    assert.equal(rejected.response.headers["access-control-allow-origin"], undefined);
    assert.doesNotMatch(rejected.bodyText, /attacker\.example/);

    const unknown = await request(baseUrl, "/api/account-ops/provider-connections/connect", {
      method: "POST",
      headers: auth(),
    });
    assert.equal(unknown.response.statusCode, 404);
    assert.equal(unknown.response.headers["cache-control"], "no-store");
    assert.equal(unknown.body.error.code, "provider_route_not_found");
  });
});
