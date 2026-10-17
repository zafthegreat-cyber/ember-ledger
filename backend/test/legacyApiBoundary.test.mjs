import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import express from "express";

const require = createRequire(import.meta.url);
const { createLegacyApiBoundary } = require("../dist/security/legacyApiBoundary.js");
const { createOwnerSecurity } = require("../dist/auth/ownerAuthorization.js");
const { isMonitorAuthorized } = require("../dist/routes/bestbuy.routes.js");
const { scoutRouter } = require("../dist/routes/scout.routes.js");
const { storeReportsRouter, tidepoolRouter } = require("../dist/routes/tidepool.routes.js");
const ORIGIN = "https://code3.example.test";
const env = { NODE_ENV: "production", CODE3_OWNER_SUBJECTS: "supabase:owner", CODE3_CORS_ALLOWED_ORIGINS: ORIGIN };
const provider = {
  providerId: "supabase", isConfigured: () => true,
  verifyAccessToken: async token => ["owner", "another-user"].includes(token)
    ? { ok: true, principal: { provider: "supabase", subject: token, issuedAt: 1, expiresAt: 2_000_000_000 } }
    : { ok: false, reason: "invalid" },
};

async function withBoundary(run) {
  const security = createOwnerSecurity({ env, runtimeKind: "production", identityProvider: provider });
  const app = express();
  let handled = 0;
  app.use(createLegacyApiBoundary({ security, env, runtimeKind: "production" }));
  app.use(express.json());
  app.use("/api/scout", scoutRouter);
  app.use("/api/store-reports", storeReportsRouter);
  app.use("/api/tidepool", tidepoolRouter);
  app.use((_req, res) => { handled += 1; res.json({ ok: true }); });
  const server = await new Promise(resolve => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  try { await run(`http://127.0.0.1:${server.address().port}`, () => handled); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test("legacy private reads reject anonymous, invalid and non-owner sessions before any handler", async () => {
  await withBoundary(async (base, handled) => {
    for (const path of ["/api/inventory", "/api/vault/card-1", "/api/sales", "/api/expenses", "/contacts", "/notifications", "/db-test", "/user-inventory", "/API/INVENTORY/"]) {
      for (const [token, status] of [[null, 401], ["invalid", 401], ["another-user", 403]]) {
        const response = await fetch(base + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
        assert.equal(response.status, status, `${path} ${token}`);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(response.headers.get("access-control-allow-origin"), null);
      }
    }
    assert.equal(handled(), 0);
  });
});

test("real Scout alert routes keep owner-created content private for list, detail and HEAD", async () => {
  await withBoundary(async base => {
    const ownerHeaders = { authorization: "Bearer owner", "content-type": "application/json" };
    const created = await fetch(base + "/api/scout/alerts", { method: "POST", headers: ownerHeaders, body: JSON.stringify({ title: "Synthetic private alert", message: "Private test content", enabled: true }) });
    assert.equal(created.status, 201);
    const record = await created.json();
    try {
      for (const path of ["/api/scout/alerts", `/api/scout/alerts/${record.id}`]) {
        for (const method of ["GET", "HEAD"]) {
          for (const [token, status] of [[null, 401], ["invalid", 401], ["another-user", 403]]) {
            const response = await fetch(base + path, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
            assert.equal(response.status, status, `${method} ${path} ${token}`);
            assert.doesNotMatch(await response.text(), /Private test content/);
            assert.equal(response.headers.get("access-control-allow-origin"), null);
          }
        }
      }
      const readable = await fetch(base + `/api/scout/alerts/${record.id}`, { headers: ownerHeaders });
      assert.equal(readable.status, 200);
      assert.equal((await readable.json()).message, "Private test content");
    } finally {
      const removed = await fetch(base + `/api/scout/alerts/${record.id}`, { method: "DELETE", headers: ownerHeaders });
      assert.equal(removed.status, 200);
    }
  });
});

test("legacy writes and administrative actions require owner authorization before parsing", async () => {
  await withBoundary(async (base, handled) => {
    for (const [path, method] of [["/stores", "POST"], ["/stores/1", "PATCH"], ["/api/inventory/1", "DELETE"], ["/api/store-reports/1", "PUT"], ["/seed", "POST"], ["/seed-757", "POST"], ["/sync/run", "POST"], ["/notifications/test", "POST"], ["/api/scan/receipt", "POST"]]) {
      const response = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: "{invalid" });
      assert.equal(response.status, 401, `${method} ${path}`);
    }
    assert.equal(handled(), 0);
    const owner = await fetch(base + "/api/inventory", { method: "POST", headers: { authorization: "Bearer owner", origin: ORIGIN, "content-type": "application/json" }, body: '{"name":"Synthetic item"}' });
    assert.equal(owner.status, 200);
    assert.equal(owner.headers.get("access-control-allow-origin"), ORIGIN);
    assert.equal(handled(), 1);
  });
});

test("real report list, store filter and Tidepool alias retain private flags behind owner authorization", async () => {
  await withBoundary(async base => {
    const ownerHeaders = { authorization: "Bearer owner", origin: ORIGIN, "content-type": "application/json" };
    const privateReport = {
      storeId: "synthetic-private-store",
      note: "Synthetic private report text",
      visibility: "private_from_map",
      adminOnly: true,
      evidence: [{ private: true, transcript: "Synthetic private evidence" }],
    };
    const created = await fetch(base + "/api/store-reports", { method: "POST", headers: ownerHeaders, body: JSON.stringify(privateReport) });
    assert.equal(created.status, 201);
    const record = await created.json();
    try {
      for (const path of [
        "/api/store-reports", "/api/store-reports?storeId=synthetic-private-store",
        "/api/tidepool/reports", "/api/tidepool/reports?storeId=synthetic-private-store",
      ]) {
        for (const method of ["GET", "HEAD"]) {
          for (const [token, status] of [[null, 401], ["invalid", 401], ["another-user", 403]]) {
            const response = await fetch(base + path, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
            assert.equal(response.status, status, `${method} ${path} ${token}`);
            assert.equal(response.headers.get("cache-control"), "no-store");
            assert.equal(response.headers.get("access-control-allow-origin"), null);
            assert.doesNotMatch(await response.text(), /Synthetic private (report text|evidence)/);
          }
          const foreign = await fetch(base + path, { method, headers: { ...ownerHeaders, origin: "https://foreign.example.test" } });
          assert.equal(foreign.status, 403);
          assert.equal(foreign.headers.get("access-control-allow-origin"), null);
          assert.doesNotMatch(await foreign.text(), /Synthetic private (report text|evidence)/);
        }
        const readable = await fetch(base + path, { headers: ownerHeaders });
        assert.equal(readable.status, 200);
        assert.equal(readable.headers.get("access-control-allow-origin"), ORIGIN);
        assert.equal(readable.headers.get("cache-control"), "no-store");
        const restored = (await readable.json()).find(row => row.id === record.id);
        assert.equal(restored.note, privateReport.note);
        assert.equal(restored.visibility, "private_from_map");
        assert.equal(restored.adminOnly, true);
        assert.deepEqual(restored.evidence, privateReport.evidence);
      }
      const differentStore = await fetch(base + "/api/store-reports?storeId=synthetic-other-store", { headers: ownerHeaders });
      assert.deepEqual(await differentStore.json(), []);
    } finally {
      const removed = await fetch(base + `/api/store-reports/${record.id}`, { method: "DELETE", headers: ownerHeaders });
      assert.equal(removed.status, 200);
    }
  });
});

test("legacy store details, tracked items, raw reports and predictions deny reads before database handlers", async () => {
  await withBoundary(async (base, handled) => {
    const routes = ["/stores", "/stores/synthetic-store", "/stores/synthetic-store/items", "/stores/synthetic-store/reports", "/predictions/week", "/STORES/synthetic-store/reports/"];
    for (const path of routes) {
      for (const method of ["GET", "HEAD"]) {
        for (const [token, status] of [[null, 401], ["invalid", 401], ["another-user", 403]]) {
          const response = await fetch(base + path, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
          assert.equal(response.status, status, `${method} ${path} ${token}`);
          assert.equal(response.headers.get("cache-control"), "no-store");
          assert.equal(response.headers.get("access-control-allow-origin"), null);
        }
        const foreign = await fetch(base + path, { method, headers: { authorization: "Bearer owner", origin: "https://foreign.example.test" } });
        assert.equal(foreign.status, 403);
      }
    }
    assert.equal(handled(), 0, "Denied requests must never reach a downstream database handler.");
    for (const path of routes) {
      const owner = await fetch(base + path, { headers: { authorization: "Bearer owner", origin: ORIGIN } });
      assert.equal(owner.status, 200);
      assert.equal(owner.headers.get("access-control-allow-origin"), ORIGIN);
    }
    assert.equal(handled(), routes.length);
  });
});

test("private CORS denies foreign origins and permits authenticated DELETE preflight", async () => {
  await withBoundary(async (base, handled) => {
    const denied = await fetch(base + "/api/inventory", { headers: { authorization: "Bearer owner", origin: "https://foreign.example.test" } });
    assert.equal(denied.status, 403);
    const preflight = await fetch(base + "/api/inventory/1", { method: "OPTIONS", headers: { origin: ORIGIN, "access-control-request-method": "DELETE", "access-control-request-headers": "authorization,content-type" } });
    assert.equal(preflight.status, 204);
    assert.ok(preflight.headers.get("access-control-allow-methods").split(/,\s*/).includes("DELETE"));
    assert.equal(preflight.headers.get("access-control-allow-origin"), ORIGIN);
    assert.equal(handled(), 0);
  });
});

test("public catalog and store reads stay public; modern routes retain their own security", async () => {
  await withBoundary(async (base, handled) => {
    for (const path of ["/api/health", "/health", "/api/catalog/search", "/pokemon-products/search", "/api/stores", "/api/stores/search"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get("access-control-allow-origin"), "*");
    }
    for (const path of ["/api/auth/session", "/api/ebay/search", "/api/code3/records", "/api/account-ops/provider-connections"]) {
      const response = await fetch(base + path, { method: "POST" });
      assert.equal(response.status, 200, "test downstream stands in for each existing modern boundary");
      assert.equal(response.headers.get("access-control-allow-origin"), null);
    }
    assert.equal(handled(), 10);
  });
});

test("monitor execution fails closed without its configured server credential", () => {
  assert.equal(isMonitorAuthorized({ headers: {} }, {}), false);
  assert.equal(isMonitorAuthorized({ headers: { authorization: "Bearer incorrect" } }, { BESTBUY_MONITOR_SECRET: "synthetic-monitor-secret" }), false);
  assert.equal(isMonitorAuthorized({ headers: {}, query: { secret: "synthetic-monitor-secret" } }, { BESTBUY_MONITOR_SECRET: "synthetic-monitor-secret" }), false);
  assert.equal(isMonitorAuthorized({ headers: { authorization: "Bearer synthetic-monitor-secret" } }, { BESTBUY_MONITOR_SECRET: "synthetic-monitor-secret" }), true);
});

test("server installs legacy protection before its JSON parser and does not overwrite protected CORS", () => {
  const source = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf("app.use(createLegacyApiBoundary())") < source.indexOf('app.use(express.json({ limit: "10mb" }))'));
  assert.ok(source.indexOf("app.use(createLegacyApiBoundary())") > 0);
  assert.doesNotMatch(source, /app\.use\(cors\(\)\)/);
});
