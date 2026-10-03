import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import express from "express";

const require = createRequire(import.meta.url);
const { createOwnerSecurity } = require("../dist/auth/ownerAuthorization.js");
const { createCode3Router, CODE3_RESOURCE_ROUTES, canonicalPersistenceEnabled } = require("../dist/routes/code3.routes.js");
const { MemoryCanonicalRepository } = require("../dist/code3/memoryRepository.js");
const { createProtectedCors } = require("../dist/security/corsPolicy.js");

const NOW = Date.parse("2026-08-20T12:00:00.000Z");
const DEAL_ID = "00000000-0000-4000-8000-000000000001";

function principal(subject) {
  return Object.freeze({
    provider: "supabase",
    subject,
    issuedAt: Math.floor(NOW / 1_000) - 60,
    expiresAt: Math.floor(NOW / 1_000) + 3_600,
  });
}

function identityProvider() {
  return {
    providerId: "supabase",
    isConfigured: () => true,
    async verifyAccessToken(token) {
      if (token === "owner-token") return { ok: true, principal: principal("owner") };
      if (token === "other-token") return { ok: true, principal: principal("other") };
      return { ok: false, reason: "invalid" };
    },
  };
}

function security() {
  return createOwnerSecurity({
    env: { CODE3_OWNER_SUBJECTS: "supabase:owner" },
    runtimeKind: "production",
    identityProvider: identityProvider(),
    now: () => NOW,
  });
}

function app({ available = true } = {}) {
  const instance = express();
  instance.use(express.json({ limit: "1mb" }));
  const corsEnv = { CODE3_CORS_ALLOWED_ORIGINS: "https://code3.example.test" };
  instance.use("/api/code3", createProtectedCors({ env: corsEnv, runtimeKind: "production" }), createCode3Router({
    requireOwner: security().requireOwner,
    repository: new MemoryCanonicalRepository({ now: () => new Date(NOW) }),
    persistenceAvailable: () => available,
    now: () => new Date(NOW),
  }));
  return instance;
}

test("canonical CORS allows required mutation methods but never advertises DELETE", async () => {
  await withServer(app(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/code3/deals`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://code3.example.test",
        "Access-Control-Request-Method": "PATCH",
        "Access-Control-Request-Headers": "Authorization, Content-Type",
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://code3.example.test");
    assert.equal(response.headers.get("access-control-allow-methods"), "GET, POST, PATCH, PUT, OPTIONS");
    assert.doesNotMatch(response.headers.get("access-control-allow-methods") || "", /DELETE/);
  });
});

async function withServer(instance, run) {
  const server = await new Promise((resolve, reject) => {
    const listening = instance.listen(0, "127.0.0.1", () => resolve(listening));
    listening.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body, text };
}

function ownerHeaders(extra = {}) {
  return { Authorization: "Bearer owner-token", ...extra };
}

test("every canonical route family and server export requires authentication", async () => {
  await withServer(app(), async (baseUrl) => {
    for (const { path } of CODE3_RESOURCE_ROUTES) {
      const result = await request(baseUrl, `/api/code3${path}`);
      assert.equal(result.response.status, 401, path);
      assert.equal(result.response.headers.get("cache-control"), "no-store", path);
    }
    assert.equal((await request(baseUrl, "/api/code3/export")).response.status, 401);
    assert.equal((await request(baseUrl, "/api/code3/migration/dry-run", { method: "POST" })).response.status, 401);
  });
});

test("an authenticated non-owner is forbidden from canonical records and export", async () => {
  await withServer(app(), async (baseUrl) => {
    const protectedPaths = [
      ...CODE3_RESOURCE_ROUTES.map(({ path }) => `/api/code3${path}`),
      "/api/code3/export",
      "/api/code3/migration/dry-run",
    ];
    for (const path of protectedPaths) {
      const result = await request(baseUrl, path, { headers: { Authorization: "Bearer other-token" } });
      assert.equal(result.response.status, 403, path);
      assert.doesNotMatch(result.text, /supabase:owner|CODE3_OWNER_SUBJECTS/);
    }
  });
});

test("hosted canonical persistence stays inactive unless explicitly enabled with a database URL", () => {
  assert.equal(canonicalPersistenceEnabled({}), false);
  assert.equal(canonicalPersistenceEnabled({ CODE3_CANONICAL_PERSISTENCE_ENABLED: "true" }), false);
  assert.equal(canonicalPersistenceEnabled({ DATABASE_URL: "postgres://example" }), false);
  assert.equal(canonicalPersistenceEnabled({ CODE3_CANONICAL_PERSISTENCE_ENABLED: "true", DATABASE_URL: "postgres://example" }), true);
});

test("inactive persistence returns a safe no-store 503 after owner authorization", async () => {
  await withServer(app({ available: false }), async (baseUrl) => {
    const result = await request(baseUrl, "/api/code3/deals", { headers: ownerHeaders() });
    assert.equal(result.response.status, 503);
    assert.equal(result.response.headers.get("cache-control"), "no-store");
    assert.equal(result.body.error.code, "canonical_persistence_not_active");
    assert.doesNotMatch(result.text, /DATABASE_URL|supabase:owner|postgres/i);
  });
});

test("owner CRUD uses strict validation and optimistic version conflicts", async () => {
  await withServer(app(), async (baseUrl) => {
    const created = await request(baseUrl, "/api/code3/deals", {
      method: "POST",
      headers: ownerHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: DEAL_ID, status: "NEW", amountMinor: 1234, currency: "USD" }),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.record.recordVersion, 1);
    assert.equal(created.response.headers.get("cache-control"), "no-store");

    const updated = await request(baseUrl, `/api/code3/deals/${DEAL_ID}`, {
      method: "PATCH",
      headers: ownerHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ expectedVersion: 1, status: "WATCH" }),
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.record.recordVersion, 2);

    const conflict = await request(baseUrl, `/api/code3/deals/${DEAL_ID}`, {
      method: "PATCH",
      headers: ownerHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ expectedVersion: 1, status: "PASSED" }),
    });
    assert.equal(conflict.response.status, 409);
    assert.deepEqual(conflict.body.error.conflict, {
      recordId: DEAL_ID,
      currentVersion: 2,
      updatedAt: updated.body.record.updatedAt,
      conflictType: "STALE_RECORD_VERSION",
    });
  });
});

test("client owner fields and unknown fields are rejected", async () => {
  await withServer(app(), async (baseUrl) => {
    for (const body of [
      { id: DEAL_ID, ownerSubject: "supabase:attacker" },
      { id: DEAL_ID, owner_subject: "supabase:attacker" },
      { id: DEAL_ID, unexpected: true },
    ]) {
      const result = await request(baseUrl, "/api/code3/deals", {
        method: "POST",
        headers: ownerHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      assert.equal(result.response.status, 400);
      assert.doesNotMatch(result.text, /supabase:attacker/);
    }
  });
});

test("archive is an explicit versioned soft action and destructive DELETE is absent", async () => {
  await withServer(app(), async (baseUrl) => {
    await request(baseUrl, "/api/code3/deals", {
      method: "POST",
      headers: ownerHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: DEAL_ID }),
    });
    const removed = await request(baseUrl, `/api/code3/deals/${DEAL_ID}`, { method: "DELETE", headers: ownerHeaders() });
    assert.equal(removed.response.status, 404);
    const archived = await request(baseUrl, `/api/code3/deals/${DEAL_ID}/archive`, {
      method: "POST",
      headers: ownerHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ expectedVersion: 1 }),
    });
    assert.equal(archived.response.status, 200);
    assert.equal(archived.body.record.status, "ARCHIVED");
    assert.ok(archived.body.record.archivedAt);
  });
});

test("bounded owner export has the client contract, no owner identifier, and no-store", async () => {
  await withServer(app(), async (baseUrl) => {
    await request(baseUrl, "/api/code3/deals", {
      method: "POST",
      headers: ownerHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: DEAL_ID }),
    });
    const result = await request(baseUrl, "/api/code3/export?maxRecordsPerDomain=10", { headers: ownerHeaders() });
    assert.equal(result.response.status, 200);
    assert.equal(result.response.headers.get("cache-control"), "no-store");
    assert.equal(result.body.format, "code-3-server-export");
    assert.equal(result.body.formatVersion, 1);
    assert.equal(result.body.domains.DEAL.length, 1);
    assert.match(result.body.sourceHash, /^[0-9a-f]{64}$/);
    assert.doesNotMatch(result.text, /supabase:owner|ownerSubject|owner_subject|owner-token/);
  });
});

test("owner-authorized dry run returns zeroWrites and does not add a DELETE surface", async () => {
  await withServer(app(), async (baseUrl) => {
    const result = await request(baseUrl, "/api/code3/migration/dry-run", {
      method: "POST",
      headers: ownerHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        formatVersion: 1,
        sourceBackupHash: "a".repeat(64),
        actions: [{ action: "INSERT", domain: "DEAL", input: { id: DEAL_ID } }],
      }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.zeroWrites, true);
    assert.equal(result.body.status, "READY");

    const deletion = await request(baseUrl, "/api/code3/migration/dry-run", {
      method: "POST",
      headers: ownerHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        formatVersion: 1,
        sourceBackupHash: "a".repeat(64),
        actions: [{ action: "DELETE", domain: "DEAL", recordId: DEAL_ID }],
      }),
    });
    assert.equal(deletion.response.status, 400);
    assert.match(deletion.text, /DELETE/);
  });
});
