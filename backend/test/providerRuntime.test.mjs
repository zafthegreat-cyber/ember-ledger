import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import express from "express";

const require = createRequire(import.meta.url);
const {
  createAutomatedTestMemoryOAuthStateStore,
  createUnavailableOAuthStateStore,
} = require("../dist/providerRuntime/oauthStateStore.js");
const {
  createAutomatedTestMemorySecretStore,
  createUnavailableProviderSecretStore,
} = require("../dist/providerRuntime/secretStore.js");
const { createAutomatedTestMemoryConnectionStore } = require("../dist/providerRuntime/connectionStore.js");
const { createMailboxProviderRegistry } = require("../dist/providerRuntime/providerRegistry.js");
const { createProviderRuntime } = require("../dist/providerRuntime/runtime.js");
const { createProviderConnectionsRouter } = require("../dist/routes/providerConnections.routes.js");
const { createOwnerSecurity } = require("../dist/auth/ownerAuthorization.js");
const { createProtectedCors } = require("../dist/security/corsPolicy.js");
const { redactSensitive, redactText } = require("../dist/security/redaction.js");

const NOW_MS = Date.parse("2026-08-27T12:00:00.000Z");
const REDIRECT = "https://preview.example.test/api/account-ops/provider-connections/callback";
const OTHER_REDIRECT = "https://preview.example.test/api/account-ops/provider-connections/other";

function owner(subject = "owner-subject") {
  return Object.freeze({ provider: "supabase", subject });
}

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
  return {
    providerId: "supabase",
    isConfigured: () => true,
    async verifyAccessToken(token) {
      if (token === "owner-test-token") return { ok: true, principal: principal() };
      if (token === "non-owner-test-token") return { ok: true, principal: principal("another-subject") };
      return { ok: false, reason: "invalid" };
    },
  };
}

function testSecurity() {
  return createOwnerSecurity({
    env: { CODE3_OWNER_SUBJECTS: "supabase:owner-subject" },
    runtimeKind: "production",
    identityProvider: identityProvider(),
    now: () => NOW_MS,
  });
}

function createApp(runtime = createProviderRuntime()) {
  const app = express();
  const security = testSecurity();
  app.use(
    "/api/account-ops/provider-connections",
    createProtectedCors({ env: { CODE3_CORS_ALLOWED_ORIGINS: "https://app.example.test" }, runtimeKind: "production" }),
    createProviderConnectionsRouter({ requireOwner: security.requireOwner, runtime, maximumBodyBytes: 1_024 }),
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
  const response = await fetch(`${baseUrl}${path}`, options);
  const bodyText = await response.text();
  let body = null;
  try { body = bodyText ? JSON.parse(bodyText) : null; } catch { body = bodyText; }
  return { response, body, bodyText };
}

function auth(token = "owner-test-token") {
  return { Authorization: `Bearer ${token}` };
}

test("provider registry declares honest unavailable read-only foundations", () => {
  const providers = createMailboxProviderRegistry().list();
  assert.deepEqual(providers.map((entry) => entry.providerId), ["gmail", "microsoft-outlook"]);
  for (const provider of providers) {
    assert.equal(provider.configurationStatus, "NOT_CONFIGURED");
    assert.equal(provider.authorizationStatus, "UNAVAILABLE");
    assert.equal(provider.minimumPermissionModel, "READ_ONLY_MINIMUM");
    assert.equal(provider.capabilities.connect, false);
    assert.equal(provider.capabilities.listBoundedMessageMetadata, false);
    assert.equal(provider.capabilities.sendMail, false);
    assert.equal(provider.capabilities.deleteMail, false);
    assert.equal(provider.capabilities.modifyMailbox, false);
    assert.equal(provider.capabilities.accessContacts, false);
    assert.equal(provider.capabilities.accessCalendar, false);
  }
});

test("default secret and OAuth state stores fail closed", async () => {
  const secretStore = createUnavailableProviderSecretStore();
  const stateStore = createUnavailableOAuthStateStore();
  assert.equal(secretStore.available, false);
  assert.equal(stateStore.available, false);
  await assert.rejects(() => secretStore.get(owner(), "connection:test-0001"), { code: "provider_runtime_unavailable", status: 503 });
  await assert.rejects(() => stateStore.issue({ provider: "gmail", owner: owner(), redirectUri: REDIRECT }), { code: "provider_runtime_unavailable", status: 503 });
});

test("memory secret and OAuth state stores cannot activate outside automated tests", () => {
  assert.throws(() => createAutomatedTestMemorySecretStore({ runtimeKind: "preview" }), { code: "provider_runtime_unavailable" });
  assert.throws(() => createAutomatedTestMemorySecretStore({ runtimeKind: "production" }), { code: "provider_runtime_unavailable" });
  assert.throws(() => createAutomatedTestMemoryOAuthStateStore({ runtimeKind: "preview", allowedRedirectUris: [REDIRECT] }), { code: "provider_runtime_unavailable" });
  assert.throws(() => createAutomatedTestMemoryOAuthStateStore({ runtimeKind: "production", allowedRedirectUris: [REDIRECT] }), { code: "provider_runtime_unavailable" });
});

test("automated-test secret storage is owner-scoped and revocable without logging", async () => {
  const store = createAutomatedTestMemorySecretStore({ runtimeKind: "automated-test" });
  const connectionId = "connection:test-0001";
  const secretOne = { accessToken: ["synthetic", "access", "one"].join("-"), refreshToken: ["synthetic", "refresh", "one"].join("-") };
  const secretTwo = { accessToken: ["synthetic", "access", "two"].join("-") };
  const reference = { provider: "gmail", connectionId, managedReference: "test:one", createdAt: new Date(NOW_MS).toISOString(), rotatedAt: null, revokedAt: null };
  let logs = 0;
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => { logs += 1; };
  console.error = () => { logs += 1; };
  try {
    await store.put(owner(), reference, secretOne);
    await store.put(owner("other-owner"), reference, secretTwo);
    assert.deepEqual(await store.get(owner(), connectionId), secretOne);
    assert.deepEqual(await store.get(owner("other-owner"), connectionId), secretTwo);
    assert.equal(await store.revoke(owner(), connectionId, new Date(NOW_MS).toISOString()), true);
    assert.equal(await store.get(owner(), connectionId), null);
    assert.deepEqual(await store.get(owner("other-owner"), connectionId), secretTwo);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  assert.equal(logs, 0);
});

test("OAuth state is bounded, owner-bound, redirect-bound, expiring, and single-use", async () => {
  let now = NOW_MS;
  let suffix = 0;
  const store = createAutomatedTestMemoryOAuthStateStore({
    runtimeKind: "automated-test",
    now: () => now,
    ttlMs: 60_000,
    allowedRedirectUris: [REDIRECT, OTHER_REDIRECT],
    randomBytes: (size) => Buffer.alloc(size, ++suffix),
  });
  const issued = await store.issue({ provider: "gmail", owner: owner(), redirectUri: REDIRECT });
  assert.ok(issued.state.length >= 43);
  assert.ok(issued.state.length <= 512);
  await assert.rejects(
    () => store.consume({ provider: "gmail", owner: owner("other-owner"), redirectUri: REDIRECT, state: issued.state }),
    { code: "oauth_state_owner_mismatch" },
  );
  await assert.rejects(
    () => store.consume({ provider: "gmail", owner: owner(), redirectUri: OTHER_REDIRECT, state: issued.state }),
    { code: "oauth_state_redirect_mismatch" },
  );
  const consumed = await store.consume({ provider: "gmail", owner: owner(), redirectUri: REDIRECT, state: issued.state });
  assert.equal(consumed.provider, "gmail");
  assert.equal(consumed.owner.subject, "owner-subject");
  assert.equal(consumed.redirectUri, REDIRECT);
  await assert.rejects(
    () => store.consume({ provider: "gmail", owner: owner(), redirectUri: REDIRECT, state: issued.state }),
    { code: "oauth_state_already_used" },
  );

  const expiring = await store.issue({ provider: "microsoft-outlook", owner: owner(), redirectUri: REDIRECT });
  now += 60_001;
  await assert.rejects(
    () => store.consume({ provider: "microsoft-outlook", owner: owner(), redirectUri: REDIRECT, state: expiring.state }),
    { code: "oauth_state_expired" },
  );
});

test("OAuth state store rejects unsafe or unbounded redirect configuration", () => {
  assert.throws(() => createAutomatedTestMemoryOAuthStateStore({ runtimeKind: "automated-test", allowedRedirectUris: [] }), { code: "invalid_provider_request" });
  assert.throws(() => createAutomatedTestMemoryOAuthStateStore({ runtimeKind: "automated-test", allowedRedirectUris: ["http://not-loopback.example/callback"] }), { code: "invalid_provider_request" });
  assert.throws(() => createAutomatedTestMemoryOAuthStateStore({ runtimeKind: "automated-test", allowedRedirectUris: ["https://user:password@example.test/callback"] }), { code: "invalid_provider_request" });
  assert.doesNotThrow(() => createAutomatedTestMemoryOAuthStateStore({ runtimeKind: "automated-test", allowedRedirectUris: ["http://127.0.0.1:5173/callback"] }));
});

test("default runtime reports unavailable hosted and secret state honestly", async () => {
  const runtime = createProviderRuntime();
  const status = await runtime.status(principal());
  assert.equal(status.available, false);
  assert.equal(status.hostedRuntimeVerified, false);
  assert.equal(status.liveProviderConnected, false);
  assert.equal(status.secretStorage.available, false);
  assert.equal(status.oauthStateStorage.available, false);
  assert.equal(status.automaticPurchaseCreation, false);
  assert.equal(status.canonicalPersistenceRequired, false);
  assert.equal(status.localOnlyBusinessDataAuthoritative, true);
  assert.deepEqual(status.connections, []);
});

test("runtime audits safe summaries without owner identity or provider secrets", async () => {
  const summaries = [];
  const runtime = createProviderRuntime({ audit: { write: (summary) => summaries.push(summary) }, now: () => new Date(NOW_MS) });
  await runtime.status(principal());
  runtime.capabilities(principal());
  await assert.rejects(() => runtime.disconnect(principal(), "connection:test-0001"), { code: "provider_runtime_unavailable" });
  const serialized = JSON.stringify(summaries);
  assert.equal(summaries.length, 3);
  assert.doesNotMatch(serialized, /owner-subject|access.?token|refresh.?token|password|otp/i);
  assert.match(serialized, /PROVIDER_DISCONNECT_REQUESTED/);
});

test("injected test lifecycle revokes provider authorization, removes secrets, and stops future reads", async () => {
  const connectionStore = createAutomatedTestMemoryConnectionStore({ runtimeKind: "automated-test" });
  const secretStore = createAutomatedTestMemorySecretStore({ runtimeKind: "automated-test" });
  const oauthStateStore = createAutomatedTestMemoryOAuthStateStore({ runtimeKind: "automated-test", allowedRedirectUris: [REDIRECT] });
  const connectionId = "connection:test-0002";
  const capabilityFlags = createMailboxProviderRegistry().get("gmail").capabilities;
  const connection = Object.freeze({
    provider: "gmail",
    connectionId,
    connectedAccountLabel: "Synthetic owner mailbox",
    grantedScopesSummary: Object.freeze(["Read-only order metadata"]),
    status: "HEALTHY",
    connectedAt: new Date(NOW_MS - 10_000).toISOString(),
    lastHealthyAt: new Date(NOW_MS - 1_000).toISOString(),
    cursorMetadata: Object.freeze({ cursorVersion: "fixture-1" }),
    capabilityFlags,
    revokedAt: null,
    errorCode: null,
  });
  await connectionStore.put(owner(), connection);
  await secretStore.put(owner(), {
    provider: "gmail",
    connectionId,
    managedReference: "test:connection-2",
    createdAt: new Date(NOW_MS).toISOString(),
    rotatedAt: null,
    revokedAt: null,
  }, { accessToken: ["synthetic", "access", "lifecycle"].join("-") });
  let disconnectCalls = 0;
  const runtime = createProviderRuntime({
    connectionStore,
    secretStore,
    oauthStateStore,
    now: () => new Date(NOW_MS),
    providerAdapters: [Object.freeze({
      providerId: "gmail",
      supportsAuthorizationRevocation: true,
      async disconnect({ connection: receivedConnection, secret }) {
        disconnectCalls += 1;
        assert.equal(receivedConnection.connectionId, connectionId);
        assert.match(secret.accessToken, /synthetic-access-lifecycle/);
        return Object.freeze({ providerAuthorizationRevoked: true });
      },
    })],
  });
  assert.equal((await runtime.connectionForProcessing(principal(), connectionId)).connection.status, "HEALTHY");
  const result = await runtime.disconnect(principal(), connectionId);
  assert.equal(disconnectCalls, 1);
  assert.equal(result.connection.status, "REVOKED");
  assert.equal(result.providerAuthorizationRevoked, true);
  assert.equal(result.futureReadsAllowed, false);
  assert.equal(await secretStore.get(owner(), connectionId), null);
  assert.equal((await connectionStore.get(owner(), connectionId)).status, "REVOKED");
  await assert.rejects(() => runtime.connectionForProcessing(principal(), connectionId), { code: "provider_connection_not_found" });
});

test("disconnect fails safe before remote or secret-store cleanup failures", async () => {
  const connectionStore = createAutomatedTestMemoryConnectionStore({ runtimeKind: "automated-test" });
  const backingSecretStore = createAutomatedTestMemorySecretStore({ runtimeKind: "automated-test" });
  const oauthStateStore = createAutomatedTestMemoryOAuthStateStore({ runtimeKind: "automated-test", allowedRedirectUris: [REDIRECT] });
  const connectionId = "connection:test-0003";
  const connection = Object.freeze({
    provider: "gmail",
    connectionId,
    connectedAccountLabel: "Synthetic cleanup failure",
    grantedScopesSummary: Object.freeze(["Read-only order metadata"]),
    status: "HEALTHY",
    connectedAt: new Date(NOW_MS - 10_000).toISOString(),
    lastHealthyAt: new Date(NOW_MS - 1_000).toISOString(),
    cursorMetadata: Object.freeze({}),
    capabilityFlags: createMailboxProviderRegistry().get("gmail").capabilities,
    revokedAt: null,
    errorCode: null,
  });
  await connectionStore.put(owner(), connection);
  await backingSecretStore.put(owner(), {
    provider: "gmail",
    connectionId,
    managedReference: "test:connection-3",
    createdAt: new Date(NOW_MS).toISOString(),
    rotatedAt: null,
    revokedAt: null,
  }, { refreshToken: ["synthetic", "refresh", "cleanup"].join("-") });
  const failingSecretStore = Object.freeze({
    ...backingSecretStore,
    revoke: async () => { throw new Error("synthetic managed-store failure"); },
  });
  const runtime = createProviderRuntime({
    connectionStore,
    secretStore: failingSecretStore,
    oauthStateStore,
    now: () => new Date(NOW_MS),
    providerAdapters: [Object.freeze({
      providerId: "gmail",
      supportsAuthorizationRevocation: true,
      disconnect: async () => { throw new Error("synthetic provider failure"); },
    })],
  });
  const result = await runtime.disconnect(principal(), connectionId);
  assert.equal(result.connection.status, "DISCONNECTED");
  assert.equal(result.connection.revokedAt, null);
  assert.equal(result.connection.errorCode, "PROVIDER_AND_SECRET_REVOCATION_FAILED");
  assert.equal(result.futureReadsAllowed, false);
  assert.equal(result.warnings.length, 1);
  await assert.rejects(() => runtime.connectionForProcessing(principal(), connectionId), { code: "provider_connection_not_found" });
});

test("provider status route requires a verified owner and returns safe no-store metadata", async () => {
  await withServer(createApp(), async (baseUrl) => {
    assert.equal((await request(baseUrl, "/api/account-ops/provider-connections")).response.status, 401);
    assert.equal((await request(baseUrl, "/api/account-ops/provider-connections", { headers: auth("non-owner-test-token") })).response.status, 403);
    const result = await request(baseUrl, "/api/account-ops/provider-connections?ownerId=owner-subject&role=OWNER", { headers: auth() });
    assert.equal(result.response.status, 200);
    assert.equal(result.response.headers.get("cache-control"), "no-store");
    assert.equal(result.response.headers.get("pragma"), "no-cache");
    assert.equal(result.body.configurationState, "NOT_CONFIGURED");
    assert.deepEqual(result.body.connections, []);
    assert.equal(result.body.providerCapabilities.length, 2);
    assert.equal(result.body.runtime.hostedRuntimeVerified, false);
    assert.doesNotMatch(result.bodyText, /owner-subject|owner-test-token|ownerallowlist|ownersubject|"authorization"\s*:/i);
  });
});

test("capabilities route cannot claim live provider operations", async () => {
  await withServer(createApp(), async (baseUrl) => {
    const result = await request(baseUrl, "/api/account-ops/provider-connections/capabilities", { headers: auth() });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.available, false);
    for (const provider of result.body.providers) {
      assert.equal(provider.capabilities.connect, false);
      assert.equal(provider.capabilities.listBoundedMessageMetadata, false);
      assert.equal(provider.capabilities.sendMail, false);
    }
  });
});

test("disconnect contract is bounded, rejects client authority, and remains unavailable", async () => {
  await withServer(createApp(), async (baseUrl) => {
    const unavailable = await request(baseUrl, "/api/account-ops/provider-connections/connection:test-0001/disconnect", { method: "POST", headers: auth() });
    assert.equal(unavailable.response.status, 503);
    assert.equal(unavailable.body.error.code, "provider_runtime_unavailable");

    const injected = await request(baseUrl, "/api/account-ops/provider-connections/connection:test-0001/disconnect", {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ ownerId: "owner-subject", role: "OWNER", accessToken: "synthetic-client-value" }),
    });
    assert.equal(injected.response.status, 400);
    assert.equal(injected.body.error.code, "invalid_provider_request");
    assert.doesNotMatch(injected.bodyText, /owner-subject|synthetic-client-value/i);

    const oversized = await request(baseUrl, "/api/account-ops/provider-connections/connection:test-0001/disconnect", {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(1_100) }),
    });
    assert.equal(oversized.response.status, 413);
    assert.equal(oversized.response.headers.get("cache-control"), "no-store");

    const malformed = await request(baseUrl, "/api/account-ops/provider-connections/connection:test-0001/disconnect", {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: "{not-json",
    });
    assert.equal(malformed.response.status, 400);
    assert.equal(malformed.response.headers.get("cache-control"), "no-store");

    const invalidId = await request(baseUrl, "/api/account-ops/provider-connections/not-valid/disconnect", { method: "POST", headers: auth() });
    assert.equal(invalidId.response.status, 400);
    assert.equal(invalidId.body.error.code, "invalid_provider_request");
  });
});

test("provider route rejects arbitrary CORS origins without reflection", async () => {
  await withServer(createApp(), async (baseUrl) => {
    const result = await request(baseUrl, "/api/account-ops/provider-connections", {
      headers: { ...auth(), Origin: "https://attacker.example" },
    });
    assert.equal(result.response.status, 403);
    assert.equal(result.response.headers.get("access-control-allow-origin"), null);
    assert.doesNotMatch(result.bodyText, /attacker\.example/);
  });
});

test("provider route does not expose functional connect or callback endpoints", async () => {
  await withServer(createApp(), async (baseUrl) => {
    const connect = await request(baseUrl, "/api/account-ops/provider-connections/connect", { method: "POST", headers: auth() });
    const callback = await request(baseUrl, "/api/account-ops/provider-connections/callback?code=synthetic", { headers: auth() });
    assert.equal(connect.response.status, 404);
    assert.equal(callback.response.status, 404);
    assert.equal(connect.response.headers.get("cache-control"), "no-store");
    assert.equal(connect.response.headers.get("access-control-allow-origin"), null);
    assert.doesNotMatch(callback.bodyText, /synthetic/);
  });
});

test("redaction covers mailbox OAuth and protected-message secret forms", () => {
  const redacted = redactSensitive({
    authorizationCode: "synthetic-authorization-material",
    oauthState: "synthetic-state-material",
    codeVerifier: "synthetic-verifier-material",
    verificationCode: "123456",
    resetLink: "https://example.test/reset?reset_token=synthetic-reset-material",
    safeErrorCode: "PROVIDER_NOT_CONFIGURED",
  });
  const serialized = JSON.stringify(redacted);
  assert.doesNotMatch(serialized, /synthetic-authorization-material|synthetic-state-material|synthetic-verifier-material|123456|synthetic-reset-material/);
  assert.match(serialized, /PROVIDER_NOT_CONFIGURED/);
  const text = redactText("Basic dXNlcjpwYXNz https://example.test/callback?code=synthetic-code&state=synthetic-state#access_token=synthetic-fragment");
  assert.doesNotMatch(text, /dXNlcjpwYXNz|synthetic-code|synthetic-state|synthetic-fragment/);
  assert.match(text, /Basic \[REDACTED\]/);
});
