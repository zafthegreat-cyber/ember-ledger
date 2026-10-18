import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import express from "express";

// Run after the normal backend build:
// node --experimental-vm-modules --test --test-isolation=none backend/test/legacyApiClient.test.mjs
// Only the identity SDK and unrelated profile sanitizer are replaced. The real
// API wrappers, owner-session helpers, CORS policy and server boundary execute.
const require = createRequire(import.meta.url);
const { createLegacyApiBoundary } = require("../dist/security/legacyApiBoundary.js");
const { createOwnerSecurity } = require("../dist/auth/ownerAuthorization.js");
const apiSource = readFileSync(new URL("../../src/api.js", import.meta.url), "utf8");
const sessionSource = readFileSync(new URL("../../src/services/ownerSession.js", import.meta.url), "utf8");
const nativeRuntimeSource = readFileSync(new URL("../../src/native/nativeRuntime.js", import.meta.url), "utf8");
const ORIGIN = "https://code3.example.test";
const provider = {
  providerId: "supabase",
  isConfigured: () => true,
  verifyAccessToken: async token => ["owner", "another-user"].includes(token)
    ? { ok: true, principal: { provider: "supabase", subject: token, issuedAt: 1, expiresAt: 2_000_000_000 } }
    : { ok: false, reason: "invalid" },
};

async function withBoundary(run, { runtimeKind = "production", env: overrides = {} } = {}) {
  const env = {
    NODE_ENV: "production",
    CODE3_OWNER_SUBJECTS: "supabase:owner",
    CODE3_CORS_ALLOWED_ORIGINS: ORIGIN,
    ...overrides,
  };
  const security = createOwnerSecurity({ env, runtimeKind, identityProvider: provider });
  const app = express();
  const handled = [];
  const received = [];
  app.use((req, _res, next) => {
    received.push({ path: req.path, authorization: req.headers.authorization, localDev: req.headers["x-code3-local-dev"] });
    next();
  });
  app.use(createLegacyApiBoundary({ security, env, runtimeKind }));
  app.use(express.json());
  app.use((req, res) => {
    const result = { path: req.path, method: req.method, body: req.body ?? null, headers: req.headers };
    handled.push(result);
    res.json(result);
  });
  const server = await new Promise(resolve => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`, { handled, received });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function loadClient(base, {
  token = null,
  hostname = "code3.example.test",
  search = "",
  development = false,
  environment = {},
  origin = ORIGIN,
} = {}) {
  let sessionReads = 0;
  const requests = [];
  const viteEnv = { VITE_API_BASE_URL: base, DEV: development, ...environment };
  const context = createContext({
    Headers,
    URL,
    URLSearchParams,
    location: { hostname, search },
    fetch: async (url, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set("Origin", origin);
      requests.push({ url, ...init, headers });
      return fetch(url, { ...init, headers });
    },
  });
  const identity = new SyntheticModule(["isSupabaseConfigured", "supabase"], function () {
    this.setExport("isSupabaseConfigured", true);
    this.setExport("supabase", {
      auth: {
        getSession: async () => {
          sessionReads += 1;
          return { data: { session: token ? { access_token: token } : null }, error: null };
        },
      },
    });
  }, { context });
  const profiles = new SyntheticModule(["sanitizeUserProfileUpdates"], function () {
    this.setExport("sanitizeUserProfileUpdates", value => value);
  }, { context });
  const moduleOptions = identifier => ({
    context,
    identifier,
    initializeImportMeta(meta) { meta.env = viteEnv; },
  });
  const session = new SourceTextModule(sessionSource, moduleOptions("ownerSession.js"));
  const nativeRuntime = new SourceTextModule(nativeRuntimeSource, moduleOptions("nativeRuntime.js"));
  // Expose the existing internal transport only in this isolated test module so
  // caller-supplied header variants can be tested without adding a product API.
  const api = new SourceTextModule(`${apiSource}\nexport { request as __requestForTest };`, moduleOptions("api.js"));
  await api.link(specifier => {
    if (specifier === "./services/ownerSession.js") return session;
    if (specifier === "./native/nativeRuntime.js" || specifier === "../native/nativeRuntime.js") return nativeRuntime;
    if (specifier === "../supabaseClient.js") return identity;
    if (specifier === "./constants/plans") return profiles;
    throw new Error(`Unexpected client import: ${specifier}`);
  });
  await api.evaluate();
  return { api: api.namespace, requests, sessionReads: () => sessionReads };
}

test("real private-read and mutation wrappers carry the signed-in owner through the boundary", async () => {
  await withBoundary(async (base, { handled }) => {
    const client = await loadClient(base, { token: "owner" });
    for (const [name, path, args = []] of [
      ["getInventory", "/api/inventory"], ["getVaultItems", "/api/vault"],
      ["getSales", "/api/sales"], ["getExpenses", "/api/expenses"],
      ["getScoutAlerts", "/api/scout/alerts"],
      ["getStoreReports", "/api/store-reports"],
      ["getReports", "/api/store-reports", ["synthetic-store"]],
      ["getTrackedItems", "/stores/synthetic-store/items", ["synthetic-store"]],
    ]) {
      const result = await client.api[name](...args);
      assert.equal(result.path, path);
      assert.equal(result.headers.authorization, "Bearer owner");
    }
    const created = await client.api.createStore({ name: "Synthetic store" });
    assert.equal(created.method, "POST");
    assert.deepEqual(created.body, { name: "Synthetic store" });
    const updated = await client.api.updateStore("synthetic-store", { name: "Updated synthetic store" });
    assert.equal(updated.method, "PUT");
    assert.equal(updated.path, "/api/stores/synthetic-store");
    await client.api.deleteStore("synthetic-store");
    await client.api.createTrackedItem("synthetic-store", { name: "Synthetic tracked item" });
    await client.api.scanReceipt("Synthetic receipt text");
    assert.equal(handled.length, 13);
    assert.equal(client.sessionReads(), 13);
    assert.ok(client.requests.every(request => request.cache === "no-store"));
  });
});

test("public catalog/store reads neither retrieve nor transmit the current session", async () => {
  await withBoundary(async (base, { handled }) => {
    const client = await loadClient(base, { token: "owner" });
    for (const name of ["getApiHealth", "getCatalogItems", "getStores", "searchStores", "getPokemonProducts"]) {
      const result = await client.api[name]();
      assert.equal(result.headers.authorization, undefined);
      assert.equal(result.headers["x-code3-local-dev"], undefined);
    }
    assert.equal(client.sessionReads(), 0);
    assert.equal(handled.length, 5);
  });
});

test("absent, invalid and non-owner sessions fail before protected handlers with useful messages", async () => {
  await withBoundary(async (base, { handled }) => {
    for (const [token, message] of [[null, "Sign in is required."], ["invalid", "Sign in is required."], ["another-user", "Owner access is required."]]) {
      const client = await loadClient(base, { token });
      for (const action of [
        () => client.api.getInventory(), () => client.api.createStore({ name: "Must not be created" }), () => client.api.getScoutAlerts(),
        () => client.api.getStoreReports(), () => client.api.getReports("synthetic-store"), () => client.api.getTrackedItems("synthetic-store"),
      ]) {
        await assert.rejects(action, error => error.message === message);
      }
    }
    assert.equal(handled.length, 0);
  });
});

test("header objects, tuples and Headers merge without replacing owner or JSON headers", async () => {
  await withBoundary(async (base, { handled }) => {
    const client = await loadClient(base, { token: "owner" });
    for (const headers of [
      { Accept: "application/json", Authorization: "Bearer stale" },
      [["Accept", "application/json"], ["authorization", "Bearer stale"]],
      new Headers({ Accept: "application/json", authorization: "Bearer stale" }),
    ]) {
      const result = await client.api.__requestForTest("/api/stores", {
        method: "POST", headers, body: JSON.stringify({ name: "Synthetic merge test" }), cache: "force-cache",
      });
      assert.equal(result.headers.authorization, "Bearer owner");
      assert.equal(result.headers.accept, "application/json");
      assert.equal(result.headers["content-type"], "application/json");
      assert.equal(client.requests.at(-1).cache, "no-store");
    }
    assert.equal(handled.length, 3);
  });
});

test("local-development headers work only with both loopback development client and server opt-in", async () => {
  const localOrigin = "http://127.0.0.1:5173";
  await withBoundary(async (base, { handled }) => {
    const client = await loadClient(base, { hostname: "127.0.0.1", development: true, search: "?betaLocalMode=true", origin: localOrigin });
    const result = await client.api.createStore({ name: "Synthetic local store" });
    assert.equal(result.headers["x-code3-local-dev"], "1");
    assert.equal(result.headers.authorization, undefined);
    assert.equal(client.sessionReads(), 0);
    assert.equal(handled.length, 1);
  }, { runtimeKind: "local-development", env: { NODE_ENV: "development", CODE3_ENABLE_LOCAL_DEV_AUTH: "true", CODE3_CORS_LOCAL_ORIGINS: localOrigin } });
});

test("hosted clients cannot enable the local identity by query or bundled environment flags", async () => {
  await withBoundary(async (base, { handled, received }) => {
    for (const options of [
      { hostname: "code3.example.test", development: false },
      { hostname: "code3.example.test", development: true },
      { hostname: "127.0.0.1", development: false },
    ]) {
      const client = await loadClient(base, { ...options, search: "?betaLocalMode=true", environment: { VITE_BETA_LOCAL_MODE: "true", VITE_CODE3_LOCAL_AUTH_ENABLED: "true" } });
      await assert.rejects(() => client.api.getInventory(), error => error.message === "Sign in is required.");
    }
    assert.ok(received.every(request => request.localDev === undefined));
    assert.equal(handled.length, 0);
  });
});

test("a production server rejects a local-development marker even if a loopback dev client sends it", async () => {
  await withBoundary(async (base, { handled, received }) => {
    const client = await loadClient(base, { hostname: "127.0.0.1", development: true, search: "?betaLocalMode=true" });
    await assert.rejects(() => client.api.createStore({ name: "Must not be created" }), error => error.message === "Sign in is required.");
    assert.equal(received[0].localDev, "1");
    assert.equal(handled.length, 0);
  }, { env: { CODE3_ENABLE_LOCAL_DEV_AUTH: "true" } });
});
