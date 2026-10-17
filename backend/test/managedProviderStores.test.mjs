import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

process.env.NODE_ENV = "test";
delete process.env.VERCEL;
delete process.env.VERCEL_ENV;

const require = createRequire(import.meta.url);
const {
  createManagedProviderStoresFromEnvironment,
} = require("../dist/providerRuntime/managedStores.js");
const { createProviderRuntime } = require("../dist/providerRuntime/runtime.js");
const { resolveTrustedRuntimeProof } = require("../dist/providerRuntime/trustedRuntime.js");
const { createMailboxProviderRegistry } = require("../dist/providerRuntime/providerRegistry.js");

const NOW_MS = Date.parse("2026-08-27T18:00:00.000Z");
const REDIRECT = "https://preview.example.test/api/account-ops/provider-connections/oauth/callback";
const OTHER_REDIRECT = "https://preview.example.test/api/account-ops/provider-connections/oauth/other";

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

function configuredEnv(overrides = {}) {
  return {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_PROJECT_ID: "prj_code3_preview_test",
    VERCEL_GIT_COMMIT_REF: "ui-104-final-product-ui-2",
    NODE_ENV: "production",
    CODE3_PROVIDER_MANAGED_STORE_ENABLED: "true",
    CODE3_PROVIDER_PREVIEW_PROJECT_ID: "prj_code3_preview_test",
    CODE3_PROVIDER_PREVIEW_GIT_BRANCH: "ui-104-final-product-ui-2",
    CODE3_PROVIDER_KV_REST_API_URL: "https://managed-redis.example.test",
    CODE3_PROVIDER_KV_REST_API_TOKEN: "synthetic-managed-redis-test-token-value",
    CODE3_PROVIDER_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64url"),
    CODE3_PROVIDER_SECRET_KEY_VERSION: "test-v1",
    CODE3_PROVIDER_OAUTH_REDIRECT_URIS: `${REDIRECT},${OTHER_REDIRECT}`,
    CODE3_PROVIDER_STORE_NAMESPACE: "code3:provider:test:preview",
    ...overrides,
  };
}

class FakeManagedRedis {
  constructor() {
    this.strings = new Map();
    this.hashes = new Map();
    this.sorted = new Map();
    this.used = new Set();
    this.pingError = false;
  }

  async ping() {
    if (this.pingError) throw new Error("synthetic transport details must be redacted");
    return "PONG";
  }

  async get(key) {
    return this.strings.get(key) ?? null;
  }

  async set(key, value) {
    this.strings.set(key, value);
    return "OK";
  }

  async del(...keys) {
    let removed = 0;
    for (const key of keys) removed += this.strings.delete(key) ? 1 : 0;
    return removed;
  }

  async hget(key, field) {
    return this.hashes.get(key)?.get(field) ?? null;
  }

  async hvals(key) {
    return [...(this.hashes.get(key)?.values() || [])];
  }

  async eval(script, keys, args) {
    if (script.includes("HDEL") && script.includes("PEXPIRE")) {
      const records = this.hashes.get(keys[0]) || new Map();
      records.set(String(args[0]), String(args[1]));
      const stored = records.get(String(args[0]));
      records.delete(String(args[0]));
      if (records.size) this.hashes.set(keys[0], records); else this.hashes.delete(keys[0]);
      return stored === String(args[1]) ? 1 : 0;
    }
    if (script.includes("local used") && script.includes("local raw")) {
      return String(args[0]);
    }
    if (script.includes("local stored") && script.includes("local raw") && !script.includes("local used")) {
      return String(args[0]);
    }
    if (script.includes("HEXISTS") && script.includes("HLEN")) {
      const records = this.hashes.get(keys[0]) || new Map();
      if (!records.has(String(args[0])) && records.size >= Number(args[2])) return -1;
      records.set(String(args[0]), String(args[1]));
      this.hashes.set(keys[0], records);
      return 1;
    }
    if (script.includes("record.status") && script.includes("cursorMetadata")) {
      const records = this.hashes.get(keys[0]) || new Map();
      const current = records.get(String(args[0]));
      if (!current) return false;
      const record = JSON.parse(current);
      record.status = String(args[1]);
      record.revokedAt = args[2] ? String(args[2]) : null;
      record.errorCode = args[3] ? String(args[3]) : null;
      record.cursorMetadata = {};
      const updated = JSON.stringify(record);
      records.set(String(args[0]), updated);
      this.hashes.set(keys[0], records);
      return updated;
    }
    if (script.includes("ZREMRANGEBYSCORE") && script.includes("ZCARD")) {
      const index = this.sorted.get(keys[1]) || new Map();
      for (const [member, score] of index) if (score <= Number(args[3])) index.delete(member);
      if (index.size >= Number(args[4])) return -1;
      if (this.strings.has(keys[0]) || this.used.has(keys[2])) return -2;
      this.strings.set(keys[0], String(args[0]));
      index.set(String(args[5]), Number(args[2]));
      this.sorted.set(keys[1], index);
      return 1;
    }
    if (script.includes("ALREADY_USED") && script.includes("redirectBindingHash")) {
      const raw = this.strings.get(keys[0]);
      if (!raw) return this.used.has(keys[2]) ? "ALREADY_USED" : "INVALID";
      const record = JSON.parse(raw);
      if (Number(record.expiresAt) <= Number(args[3])) {
        this.strings.delete(keys[0]);
        this.sorted.get(keys[1])?.delete(String(args[4]));
        return "EXPIRED";
      }
      if (record.provider !== args[0] || record.ownerBindingHash !== args[1]) return "OWNER_MISMATCH";
      if (record.redirectBindingHash !== args[2]) return "REDIRECT_MISMATCH";
      this.strings.delete(keys[0]);
      this.sorted.get(keys[1])?.delete(String(args[4]));
      this.used.add(keys[2]);
      return raw;
    }
    throw new Error("Unexpected synthetic Redis script");
  }
}

function stores(client = new FakeManagedRedis(), options = {}) {
  return createManagedProviderStoresFromEnvironment({
    env: configuredEnv(options.env),
    runtimeKind: options.runtimeKind || "preview",
    client,
    now: options.now,
    randomBytes: options.randomBytes,
  });
}

test("managed provider stores activate only from complete explicit Preview configuration", () => {
  const fake = new FakeManagedRedis();
  const ready = stores(fake);
  assert.equal(ready.configured, true);
  assert.equal(ready.reason, "READY");
  assert.equal(ready.connectionStore.kind, "DURABLE_SERVER_METADATA");
  assert.equal(ready.secretStore.kind, "MANAGED_SERVER_SECRET_STORE");
  assert.equal(ready.oauthStateStore.kind, "DURABLE_SINGLE_USE");

  for (const runtimeKind of ["production", "hosted-unknown", "local-development", "automated-test"]) {
    const selection = stores(fake, { runtimeKind });
    assert.equal(selection.configured, false);
    assert.equal(selection.reason, "WRONG_RUNTIME");
    assert.equal(selection.secretStore.kind, "UNAVAILABLE");
  }
  assert.equal(stores(fake, { env: { CODE3_PROVIDER_MANAGED_STORE_ENABLED: "false" } }).reason, "DISABLED");
  assert.equal(stores(fake, { env: { CODE3_PROVIDER_KV_REST_API_TOKEN: "" } }).reason, "INCOMPLETE_CONFIGURATION");
  assert.equal(stores(fake, { env: { CODE3_PROVIDER_SECRET_ENCRYPTION_KEY: "not-a-key" } }).reason, "INCOMPLETE_CONFIGURATION");
  const canonicalKey = configuredEnv().CODE3_PROVIDER_SECRET_ENCRYPTION_KEY;
  for (const malformedKey of [
    `${canonicalKey}=`,
    `${canonicalKey.slice(0, 10)}!!${canonicalKey.slice(10)}`,
    `${canonicalKey.slice(0, 10)} ${canonicalKey.slice(10)}`,
  ]) {
    assert.equal(
      stores(fake, { env: { CODE3_PROVIDER_SECRET_ENCRYPTION_KEY: malformedKey } }).reason,
      "INCOMPLETE_CONFIGURATION",
    );
  }
  assert.equal(stores(fake, { env: { CODE3_PROVIDER_OAUTH_REDIRECT_URIS: "https://attacker.test/callback#fragment" } }).reason, "INCOMPLETE_CONFIGURATION");
  assert.equal(stores(fake, { env: { VERCEL: "", VERCEL_ENV: "preview" } }).reason, "WRONG_RUNTIME");
  assert.equal(stores(fake, { env: { VERCEL_ENV: "development" } }).reason, "WRONG_RUNTIME");
  assert.equal(stores(fake, { env: { VERCEL_PROJECT_ID: "another-project" } }).reason, "WRONG_RUNTIME");
  assert.equal(stores(fake, { env: { VERCEL_GIT_COMMIT_REF: "untrusted-preview-branch" } }).reason, "WRONG_RUNTIME");

  const previousVercel = process.env.VERCEL;
  const previousVercelEnvironment = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "production";
    assert.equal(stores(fake).reason, "WRONG_RUNTIME");
  } finally {
    if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel;
    if (previousVercelEnvironment === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previousVercelEnvironment;
  }
});

test("managed connection metadata is owner-scoped, bounded, and separate from secrets", async () => {
  const fake = new FakeManagedRedis();
  const selection = stores(fake);
  const capabilityFlags = createMailboxProviderRegistry().get("gmail").capabilities;
  const connection = Object.freeze({
    provider: "gmail",
    connectionId: "connection:managed-0001",
    connectedAccountLabel: "Synthetic owner mailbox",
    grantedScopesSummary: Object.freeze(["Read-only synthetic fixture scope"]),
    status: "CONNECTING",
    connectedAt: new Date(NOW_MS).toISOString(),
    lastHealthyAt: null,
    cursorMetadata: Object.freeze({}),
    capabilityFlags,
    revokedAt: null,
    errorCode: null,
  });
  await selection.connectionStore.put(owner(), connection);
  assert.equal((await selection.connectionStore.list(owner())).length, 1);
  assert.equal((await selection.connectionStore.list(owner("other-owner"))).length, 0);
  const disconnected = await selection.connectionStore.markDisconnected(owner(), connection.connectionId, {
    status: "DISCONNECTED",
    revokedAt: null,
    errorCode: "PROVIDER_REVOCATION_UNAVAILABLE",
  });
  assert.equal(disconnected.status, "DISCONNECTED");
  assert.equal(disconnected.errorCode, "PROVIDER_REVOCATION_UNAVAILABLE");
  const connectionHash = [...fake.hashes.values()][0];
  const validStoredConnection = connectionHash.get(connection.connectionId);
  const corruptedConnection = JSON.parse(validStoredConnection);
  corruptedConnection.cursorMetadata = { oversized: "x".repeat(2_049) };
  connectionHash.set(connection.connectionId, JSON.stringify(corruptedConnection));
  await assert.rejects(
    () => selection.connectionStore.list(owner()),
    (error) => error.code === "provider_runtime_unavailable" && !/oversized|cursor/i.test(error.message),
  );
  connectionHash.set(connection.connectionId, validStoredConnection);
  const aggregateOversizedConnection = JSON.parse(validStoredConnection);
  aggregateOversizedConnection.cursorMetadata = Object.fromEntries(
    Array.from({ length: 70 }, (_, index) => [`cursor-${index}`, "v".repeat(2_000)]),
  );
  connectionHash.set(connection.connectionId, aggregateOversizedConnection);
  await assert.rejects(
    () => selection.connectionStore.list(owner()),
    { code: "provider_runtime_unavailable" },
  );
  connectionHash.set(connection.connectionId, validStoredConnection);
  await assert.rejects(
    () => selection.connectionStore.put(owner(), {
      ...connection,
      capabilityFlags: { ...connection.capabilityFlags, unexpectedCapability: true },
    }),
    { code: "provider_runtime_unavailable" },
  );
  const serialized = JSON.stringify([...fake.hashes.values()].flatMap((records) => [...records.values()]));
  assert.doesNotMatch(serialized, /access.?token|refresh.?token|password|otp|managed-redis-test-token/i);
});

test("managed secrets are AES-256-GCM encrypted, owner-scoped, retrievable only on the backend, and revocable", async () => {
  const fake = new FakeManagedRedis();
  const selection = stores(fake, { randomBytes: (size) => Buffer.alloc(size, 11) });
  const connectionId = "connection:managed-0002";
  const syntheticAccess = ["synthetic", "managed", "access", "material"].join("-");
  const syntheticRefresh = ["synthetic", "managed", "refresh", "material"].join("-");
  const reference = Object.freeze({
    provider: "gmail",
    connectionId,
    managedReference: "managed:test:opaque-reference",
    createdAt: new Date(NOW_MS).toISOString(),
    rotatedAt: null,
    revokedAt: null,
  });
  await selection.secretStore.put(owner(), reference, {
    accessToken: syntheticAccess,
    refreshToken: syntheticRefresh,
    grantedScopes: Object.freeze(["synthetic.readonly"]),
  });
  const stored = JSON.stringify([...fake.strings.values()]);
  assert.doesNotMatch(stored, new RegExp(`${syntheticAccess}|${syntheticRefresh}`));
  assert.match(stored, /AES-256-GCM/);
  assert.deepEqual(await selection.secretStore.get(owner(), connectionId), {
    accessToken: syntheticAccess,
    refreshToken: syntheticRefresh,
    grantedScopes: ["synthetic.readonly"],
  });
  assert.equal(await selection.secretStore.get(owner("other-owner"), connectionId), null);
  const secretEntry = [...fake.strings.entries()].find(([key]) => key.includes(":secret:"));
  const tampered = JSON.parse(secretEntry[1]);
  tampered.ciphertext = `${tampered.ciphertext.slice(0, -2)}AA`;
  fake.strings.set(secretEntry[0], JSON.stringify(tampered));
  await assert.rejects(
    () => selection.secretStore.get(owner(), connectionId),
    (error) => error.code === "provider_runtime_unavailable" && !/cipher|token|managed-reference/i.test(error.message),
  );
  await selection.secretStore.put(owner(), reference, { refreshToken: syntheticRefresh });
  const malformedEnvelopeCases = [
    ["truncated authentication tag", "authTag", (value) => value.slice(0, -2)],
    ["non-canonical authentication tag", "authTag", (value) => `${value}=`],
    ["truncated initialization vector", "iv", (value) => value.slice(0, -2)],
    ["non-canonical initialization vector", "iv", (value) => `${value}=`],
    ["empty ciphertext", "ciphertext", () => ""],
    ["non-canonical ciphertext", "ciphertext", (value) => `${value}=`],
  ];
  for (const [label, field, mutate] of malformedEnvelopeCases) {
    await selection.secretStore.put(owner(), reference, { refreshToken: syntheticRefresh });
    const malformed = JSON.parse(fake.strings.get(secretEntry[0]));
    malformed[field] = mutate(malformed[field]);
    fake.strings.set(secretEntry[0], JSON.stringify(malformed));
    await assert.rejects(
      () => selection.secretStore.get(owner(), connectionId),
      (error) => error.code === "provider_runtime_unavailable" && error.message === "Managed provider secret storage is invalid.",
      label,
    );
  }
  await selection.secretStore.put(owner(), reference, { refreshToken: syntheticRefresh });
  const boundedConnectionId = "connection:managed-bounded";
  const boundedReference = Object.freeze({
    ...reference,
    connectionId: boundedConnectionId,
    managedReference: "managed:test:bounded-secret",
  });
  const boundedSecret = {
    accessToken: "a".repeat(16_384),
    refreshToken: "r".repeat(16_384),
    grantedScopes: Object.freeze(Array.from({ length: 50 }, (_, index) => `scope-${index}-` + "s".repeat(500))),
  };
  await selection.secretStore.put(owner(), boundedReference, boundedSecret);
  const boundedRoundTrip = await selection.secretStore.get(owner(), boundedConnectionId);
  assert.equal(boundedRoundTrip.accessToken.length, 16_384);
  assert.equal(boundedRoundTrip.refreshToken.length, 16_384);
  assert.equal(boundedRoundTrip.grantedScopes.length, 50);
  await assert.rejects(
    () => selection.secretStore.put(owner(), boundedReference, {
      ...boundedSecret,
      grantedScopes: Object.freeze(Array.from({ length: 100 }, (_, index) => `scope-${index}-` + "s".repeat(500))),
    }),
    { code: "invalid_provider_request" },
  );
  const otherConnectionId = "connection:managed-0003";
  const otherReference = Object.freeze({
    ...reference,
    connectionId: otherConnectionId,
    managedReference: "managed:test:opaque-reference-two",
  });
  await selection.secretStore.put(owner(), otherReference, { refreshToken: "synthetic-other-secret" });
  const storedEntries = [...fake.strings.entries()].filter(([key]) => key.includes(":secret:"));
  const firstEntry = storedEntries.find(([, value]) => JSON.parse(value).connectionId === connectionId);
  const secondEntry = storedEntries.find(([, value]) => JSON.parse(value).connectionId === otherConnectionId);
  fake.strings.set(firstEntry[0], secondEntry[1]);
  await assert.rejects(
    () => selection.secretStore.get(owner(), connectionId),
    (error) => error.code === "provider_runtime_unavailable" && !/connection|secret-reference/i.test(error.message),
  );
  await selection.secretStore.put(owner(), reference, { refreshToken: syntheticRefresh });
  assert.equal(await selection.secretStore.revoke(owner(), connectionId, new Date(NOW_MS).toISOString()), true);
  assert.equal(await selection.secretStore.get(owner(), connectionId), null);
});

test("managed OAuth state enforces per-owner capacity and prunes expired index entries", async () => {
  let now = NOW_MS;
  let counter = 0;
  const fake = new FakeManagedRedis();
  const selection = stores(fake, {
    now: () => now,
    randomBytes: (size) => {
      const value = Buffer.alloc(size);
      value.writeUInt32BE(++counter, size - 4);
      return value;
    },
  });
  for (let index = 0; index < 50; index += 1) {
    await selection.oauthStateStore.issue({ provider: "gmail", owner: owner(), redirectUri: REDIRECT });
  }
  await assert.rejects(
    () => selection.oauthStateStore.issue({ provider: "gmail", owner: owner(), redirectUri: REDIRECT }),
    { code: "provider_runtime_unavailable" },
  );
  now += 10 * 60 * 1_000 + 1;
  await assert.doesNotReject(
    () => selection.oauthStateStore.issue({ provider: "gmail", owner: owner(), redirectUri: REDIRECT }),
  );
  await assert.rejects(
    () => selection.oauthStateStore.consume({ provider: "gmail", owner: owner(), redirectUri: REDIRECT, state: "bad" }),
    { code: "oauth_state_invalid" },
  );
});

test("managed OAuth state is hashed, bound, expiring, atomically single-use, and replay-safe", async () => {
  let now = NOW_MS;
  let suffix = 0;
  const fake = new FakeManagedRedis();
  const selection = stores(fake, {
    now: () => now,
    randomBytes: (size) => Buffer.alloc(size, ++suffix),
  });
  const issued = await selection.oauthStateStore.issue({ provider: "gmail", owner: owner(), redirectUri: REDIRECT });
  assert.ok(issued.state.length >= 43);
  assert.doesNotMatch(JSON.stringify([...fake.strings.entries()]), new RegExp(issued.state));

  await assert.rejects(
    () => selection.oauthStateStore.consume({ provider: "gmail", owner: owner("other-owner"), redirectUri: REDIRECT, state: issued.state }),
    { code: "oauth_state_owner_mismatch" },
  );
  await assert.rejects(
    () => selection.oauthStateStore.consume({ provider: "gmail", owner: owner(), redirectUri: OTHER_REDIRECT, state: issued.state }),
    { code: "oauth_state_redirect_mismatch" },
  );
  const attempts = await Promise.allSettled(Array.from({ length: 10 }, () => (
    selection.oauthStateStore.consume({ provider: "gmail", owner: owner(), redirectUri: REDIRECT, state: issued.state })
  )));
  assert.equal(attempts.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((entry) => entry.status === "rejected" && entry.reason?.code === "oauth_state_already_used").length, 9);

  const expiring = await selection.oauthStateStore.issue({ provider: "microsoft-outlook", owner: owner(), redirectUri: REDIRECT });
  now += 10 * 60 * 1_000 + 1;
  await assert.rejects(
    () => selection.oauthStateStore.consume({ provider: "microsoft-outlook", owner: owner(), redirectUri: REDIRECT, state: expiring.state }),
    { code: "oauth_state_expired" },
  );

  const replayFake = new FakeManagedRedis();
  const replaySelection = stores(replayFake, { randomBytes: (size) => Buffer.alloc(size, 27) });
  const collision = await replaySelection.oauthStateStore.issue({ provider: "gmail", owner: owner(), redirectUri: REDIRECT });
  await replaySelection.oauthStateStore.consume({ provider: "gmail", owner: owner(), redirectUri: REDIRECT, state: collision.state });
  await assert.rejects(
    () => replaySelection.oauthStateStore.issue({ provider: "gmail", owner: owner(), redirectUri: REDIRECT }),
    { code: "provider_runtime_unavailable" },
  );
});

test("managed-store outages fail closed without transport detail or memory fallback", async () => {
  const fake = new FakeManagedRedis();
  fake.pingError = true;
  const selection = stores(fake);
  await assert.rejects(
    () => selection.secretStore.healthCheck(),
    (error) => error.code === "provider_runtime_unavailable"
      && error.status === 503
      && !/synthetic transport details/i.test(error.message),
  );
  assert.equal(selection.secretStore.kind, "MANAGED_SERVER_SECRET_STORE");
});

test("complete owner-protected Preview status verifies hosting and storage while providers remain disabled", async () => {
  const fake = new FakeManagedRedis();
  const selection = stores(fake);
  const runtime = createProviderRuntime({
    connectionStore: selection.connectionStore,
    secretStore: selection.secretStore,
    oauthStateStore: selection.oauthStateStore,
    managedStorageConfigured: selection.configured,
    trustedRuntimeProof: resolveTrustedRuntimeProof({ VERCEL: "1", VERCEL_ENV: "preview" }),
  });
  const status = await runtime.status(principal());
  assert.equal(status.serverExecutionVerified, true);
  assert.equal(status.authenticatedOwnerVerified, true);
  assert.equal(status.managedStorageVerified, true);
  assert.equal(status.hostedRuntimeVerified, true);
  assert.equal(status.available, false);
  assert.equal(status.liveProviderConnected, false);
  assert.equal(status.trustedRuntimeProof.hostedRuntimeVerified, true);
  assert.equal(status.trustedRuntimeProof.providerNetworkAccessEnabled, false);
  assert.deepEqual(status.providers.map((provider) => provider.configurationStatus), ["NOT_CONFIGURED", "NOT_CONFIGURED"]);
  for (const provider of status.providers) assert.ok(Object.values(provider.capabilities).every((value) => value === false));
});
