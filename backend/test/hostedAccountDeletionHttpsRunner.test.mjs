import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { readHostedDeletionHttpsConfig } from "../../scripts/lib/hostedDeletionHttpsGuard.mjs";
import { runHostedDeletionHttpsAcceptance } from "../../scripts/test-hosted-account-deletion-https.mjs";

// A deterministic in-memory provider/API transport tests runner control flow.
// It makes no network calls and deliberately never writes a hosted-pass artifact.
const ref = "abcdefghijklmnopqrst", providerOrigin = `https://${ref}.supabase.co`;
const appOrigin = "https://code3-privacy-qa-abc123def-test-team.vercel.app";
const deploymentId = "dpl_SyntheticPreview0123456789";
const jwt = role => `header.${Buffer.from(JSON.stringify({ role, ref })).toString("base64url")}.signature`;
const env = { CODE3_DELETION_TEST_ALLOWED_PROJECTS: ref, CODE3_DELETION_TEST_SUPABASE_URL: providerOrigin,
  CODE3_DELETION_TEST_ANON_KEY: jwt("anon"), CODE3_DELETION_TEST_SERVICE_ROLE_KEY: jwt("service_role"),
  CODE3_DELETION_TEST_ALLOWED_APP_ORIGINS: appOrigin, CODE3_DELETION_TEST_PREVIEW_DEPLOYMENT_ID: deploymentId,
  CODE3_DELETION_TEST_PREVIEW_TARGET: "preview" };
const args = ["--execute", "--project-ref", ref, "--confirm-isolated", ref, "--app-origin", appOrigin, "--confirm-preview-origin", appOrigin];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=", "base64");

function transport({ corruptStamp = false, corruptSentinel = false, expectedOidc = "" } = {}) {
  const users = new Map(), profiles = new Map(), preferences = new Map(), snapshots = new Map(), files = new Map(), tokens = new Map(), refresh = new Map();
  const calls = [], created = [], deleted = [], secrets = [];
  const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers });
  const denied = () => json({ statusCode: "403", error: "Unauthorized", message: "Synthetic access denied" }, 403);
  const authUser = headers => users.get(tokens.get(headers.get("authorization")?.replace(/^Bearer /, "")));
  const userView = user => ({ id: user.id, email: user.email, app_metadata: user.app_metadata, email_confirmed_at: new Date().toISOString(), is_anonymous: false, role: "authenticated" });
  async function fetch(input, init = {}) {
    const url = new URL(String(input)), method = String(init.method || "GET").toUpperCase(), headers = new Headers(init.headers);
    const path = decodeURIComponent(url.pathname); calls.push({ origin: url.origin, path, method });
    assert.ok([providerOrigin, appOrigin].includes(url.origin), "No request may leave the exact two synthetic origins");
    if (url.origin === providerOrigin) assert.ok(!headers.has("x-vercel-trusted-oidc-idp-token"), "Vercel OIDC must never enter a provider request");
    else if (expectedOidc) assert.equal(headers.get("x-vercel-trusted-oidc-idp-token"), expectedOidc, "The pinned app receives its in-memory Preview token");
    const parseBody = () => typeof init.body === "string" ? JSON.parse(init.body) : {};
    if (url.origin === appOrigin) {
      if (path === "/app-version.json") return json({ app: "code3-tcg", version: deploymentId + "-unit-test" });
      assert.ok(["/api/account/deletion/status", "/api/account/deletion"].includes(path));
      const cors = { "cache-control": "no-store", ...(headers.get("origin") === appOrigin ? { "access-control-allow-origin": appOrigin } : {}) };
      if (headers.get("origin") && headers.get("origin") !== appOrigin) return json({ ok: false, error: { code: "origin_not_allowed" } }, 403, cors);
      if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      const user = authUser(headers);
      if (!user) return json({ ok: false, error: { code: "account_sign_in_required" } }, 401, cors);
      if (method === "GET") return json({ ok: true, available: true, state: "ready", accountEmail: user.email, blockers: [] }, 200, cors);
      const body = parseBody();
      if (Object.keys(body).some(key => !["password", "confirmation"].includes(key))) return json({ ok: false, error: { code: "account_deletion_request_invalid" } }, 400, cors);
      if (body.password !== user.password) return json({ ok: false, error: { code: "account_reauthentication_failed" } }, 401, cors);
      assert.equal(body.confirmation, "DELETE MY ACCOUNT");
      deleted.push(user.id); users.delete(user.id); profiles.delete(user.id); preferences.delete(user.id); snapshots.delete(user.id);
      for (const key of files.keys()) if (key.includes(`users/${user.id}/`)) files.delete(key);
      for (const [key, id] of refresh) if (id === user.id) refresh.delete(key);
      if (corruptSentinel) {
        const sentinel = created.find(value => value.email.endsWith("-sentinel@example.test"));
        if (sentinel && profiles.has(sentinel.id)) profiles.get(sentinel.id).display_name = "Unexpected mutation";
      }
      return json({ ok: true, state: "deleted", localCleanupRequired: true }, 200, cors);
    }
    if (path === "/auth/v1/admin/users" && method === "POST") {
      const body = parseBody(), user = { ...body, id: randomUUID() }; users.set(user.id, user); created.push(user); secrets.push(body.password);
      assert.match(body.email, /^code3-delete-[a-f0-9-]+-(primary|sentinel|browser)@example\.test$/);
      return json(userView(user));
    }
    if (path.startsWith("/auth/v1/admin/users/")) {
      assert.equal(method, "GET", "Privileged Auth deletion must never be used as cleanup");
      const user = users.get(path.split("/").at(-1));
      if (!user) return json({ code: "user_not_found", message: "Synthetic missing user" }, 404);
      const value = userView(user);
      if (corruptStamp) value.app_metadata = {};
      return json(value);
    }
    if (path === "/auth/v1/token") {
      const body = parseBody();
      if (url.searchParams.get("grant_type") === "refresh_token") {
        assert.ok(!refresh.has(body.refresh_token), "A deleted fixture must lose its refresh session");
        return json({ code: "refresh_token_not_found", error_code: "refresh_token_not_found", message: "Synthetic refresh token revoked" }, 400);
      }
      const user = [...users.values()].find(value => value.email === body.email && value.password === body.password);
      assert.ok(user); const access = "synthetic-access-" + randomUUID(), refreshToken = "synthetic-refresh-" + randomUUID();
      tokens.set(access, user.id); refresh.set(refreshToken, user.id); secrets.push(access, refreshToken);
      return json({ access_token: access, refresh_token: refreshToken, token_type: "bearer", expires_in: 3600, user: userView(user) });
    }
    if (path === "/rest/v1/profiles") {
      if (method === "POST") { const body = parseBody(); profiles.set(body.id, structuredClone(body)); return json([]); }
      const id = url.searchParams.get("id")?.replace(/^eq\./, ""), row = profiles.get(id);
      if (headers.get("accept")?.includes("vnd.pgrst.object")) return json(row);
      return json(row ? [{ id }] : []);
    }
    if (path === "/rest/v1/app_user_preferences") {
      if (method === "POST") { const body = parseBody(); preferences.set(body.user_id, body); return json([]); }
      const row = preferences.get(url.searchParams.get("user_id")?.replace(/^eq\./, "")); return json(row ? [{ id: row.id }] : []);
    }
    if (path === "/rest/v1/rpc/code3_account_deletion_status") return json({ message: "Account not found", code: "P0001" }, 400);
    if (path === "/rest/v1/rpc/code3_workspace_write") {
      const user = authUser(headers); assert.ok(user); const body = parseBody();
      snapshots.set(user.id, { revision: 1, sources: body.p_sources }); return json({ revision: 1 });
    }
    if (path === "/rest/v1/rpc/code3_workspace_read") {
      const user = authUser(headers);
      if (!user) return json({ code: "28000", message: "Synthetic session denied" }, 403);
      return json(snapshots.get(user.id));
    }
    if (path === "/rest/v1/rpc/code3_current_session_valid") return json(Boolean(authUser(headers)));
    if (path.startsWith("/storage/v1/bucket/")) return json({ id: path.split("/").at(-1), public: false });
    if (path.startsWith("/storage/v1/object/list/")) {
      const bucket = path.split("/").at(-1), prefix = parseBody().prefix;
      return json([...files.keys()].filter(key => key.startsWith(`${bucket}/${prefix}/`)).map(key => ({ name: key.split("/").at(-1) })));
    }
    const object = path.match(/^\/storage\/v1\/object\/(authenticated|public|sign)\/([^/]+)\/(.+)$/);
    if (object) {
      const [, kind, bucket, name] = object, key = `${bucket}/${name}`, user = authUser(headers);
      if (kind === "public") return denied();
      if (kind === "sign" && method === "GET") return files.has(key) ? new Response(files.get(key), { headers: { "content-type": "image/png" } }) : denied();
      if (!user || !name.startsWith(`users/${user.id}/`) || !files.has(key)) return denied();
      if (kind === "sign") return json({ signedURL: `/object/sign/${key}?token=synthetic-signed-link` });
      return new Response(files.get(key), { headers: { "content-type": "image/png" } });
    }
    if (path.startsWith("/storage/v1/object/") && method === "GET") {
      const key = path.slice("/storage/v1/object/".length), user = authUser(headers);
      if (!user || !key.includes(`/users/${user.id}/`) || !files.has(key)) return denied();
      return new Response(files.get(key), { headers: { "content-type": "image/png" } });
    }
    if (path.startsWith("/storage/v1/object/") && method === "POST") {
      const key = path.slice("/storage/v1/object/".length), user = authUser(headers); assert.ok(user);
      assert.ok(key.includes(`/users/${user.id}/code3-delete-`));
      assert.deepEqual(Buffer.from(await new Response(init.body).arrayBuffer()), png);
      files.set(key, Buffer.from(png)); return json({ Key: key, Id: randomUUID() });
    }
    throw new Error("Unreviewed synthetic transport route");
  }
  return { fetch, users, files, calls, created, deleted, secrets };
}

test("HTTPS runner complete normal flow confines all fixtures and preserves sentinel data", async () => {
  const token = "eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJodHRwczovL29pZGMudmVyY2VsLmNvbS90ZXN0In0.synthetic-signature";
  const state = transport({ expectedOidc: token }), original = globalThis.fetch; let captured;
  globalThis.fetch = state.fetch;
  try {
    const report = await runHostedDeletionHttpsAcceptance(readHostedDeletionHttpsConfig({ ...env, CODE3_DELETION_TEST_PREVIEW_OIDC_TOKEN: token }, args), { reportSink: async value => { captured = value; } });
    assert.equal(report.status, "passed", JSON.stringify({ stage: report.failedStage, check: report.failedCheck, code: report.providerCode, lastChecks: report.checks.slice(-3), lastRequestKind: state.calls.at(-1)?.path.replace(/[a-f0-9-]{36}/g, "UUID") }));
    assert.equal(report.hostedHttpsApiVerified, true); assert.equal(report.deployedDeletionUiVerified, false);
    assert.equal(report.fixtures.length, 2); assert.ok(report.fixtures.every(fixture => fixture.deleted));
    assert.equal(state.users.size, 0); assert.equal(state.files.size, 0); assert.equal(state.deleted.length, 2);
    assert.ok(report.checks.includes("Other account cloud snapshot revision references and prices are unchanged"));
    assert.equal(report.checks.filter(label => label.includes("other account signing is denied")).length, 4);
    assert.equal(report.checks.filter(label => label.includes("original refresh token is revoked")).length, 2);
    assert.ok(!state.calls.some(call => /catalog|price/.test(call.path)), "No price or catalog route is used");
    const serialized = JSON.stringify(captured);
    for (const secret of [...state.secrets, env.CODE3_DELETION_TEST_SERVICE_ROLE_KEY, token]) assert.ok(!serialized.includes(secret));
    assert.ok(!serialized.includes("@example.test")); assert.ok(!serialized.includes("/storage/v1/"));
  } finally { globalThis.fetch = original; }
});

test("lost server-owned fixture stamp stops before privileged seeding and never force-cleans", async () => {
  const state = transport({ corruptStamp: true }), original = globalThis.fetch;
  globalThis.fetch = state.fetch;
  try {
    const report = await runHostedDeletionHttpsAcceptance(readHostedDeletionHttpsConfig(env, args), { reportSink: async () => {} });
    assert.equal(report.status, "failed"); assert.equal(report.failedStage, "seed-profile-primary");
    assert.equal(state.created.length, 1); assert.equal(state.deleted.length, 0);
    assert.ok(!state.calls.some(call => call.path === "/rest/v1/profiles" && call.method === "POST"));
    assert.equal(report.fixtures[0].deleted, false);
  } finally { globalThis.fetch = original; }
});

test("a changed sentinel fails preservation and keeps its fixture for investigation", async () => {
  const state = transport({ corruptSentinel: true }), original = globalThis.fetch;
  globalThis.fetch = state.fetch;
  try {
    const report = await runHostedDeletionHttpsAcceptance(readHostedDeletionHttpsConfig(env, args), { reportSink: async () => {} });
    assert.equal(report.status, "failed"); assert.equal(report.failedStage, "sentinel-preservation");
    assert.equal(state.deleted.length, 1); assert.equal(state.users.size, 1);
    assert.deepEqual(report.fixtures.map(fixture => fixture.deleted), [true, false]);
    assert.ok(!JSON.stringify(report).includes("Unexpected mutation"));
  } finally { globalThis.fetch = original; }
});

test("browser handoff exposes only stamped synthetic logins and clears them after verified deletion", async () => {
  const state = transport(), original = globalThis.fetch; let browserInput;
  globalThis.fetch = state.fetch;
  try {
    const report = await runHostedDeletionHttpsAcceptance(readHostedDeletionHttpsConfig(env, [...args, "--with-browser"]), {
      reportSink: async () => {}, browserAdapter: async input => {
        browserInput = input;
        for (const fixture of [input.browserFixture, input.sentinel]) {
          assert.deepEqual(Object.keys(fixture).sort(), ["attachments", "email", "id", "password"]);
          await input.assertFixture(fixture);
        }
        assert.throws(() => input.assertFixture({ ...input.browserFixture }), /Unregistered/);
        const fixture = input.browserFixture;
        const session = await (await fetch(providerOrigin + "/auth/v1/token?grant_type=password", { method: "POST",
          headers: { "content-type": "application/json" }, body: JSON.stringify({ email: fixture.email, password: fixture.password }) })).json();
        const deleted = await fetch(appOrigin + "/api/account/deletion", { method: "POST", headers: { Origin: appOrigin,
          Authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
          body: JSON.stringify({ password: fixture.password, confirmation: "DELETE MY ACCOUNT" }) });
        assert.equal(deleted.status, 200);
        return { deployedDeletionUiVerified: true, receiptComponentHostedIntegrationVerified: true };
      },
    });
    assert.equal(report.status, "passed", JSON.stringify({ stage: report.failedStage, check: report.failedCheck }));
    assert.equal(report.deployedDeletionUiVerified, true); assert.equal(report.receiptComponentHostedIntegrationVerified, true);
    assert.equal(report.deployedReceiptWorkflowVerified, false); assert.equal(report.physicalDevicesVerified, false);
    assert.equal(report.fixtures.length, 3); assert.ok(report.fixtures.every(fixture => fixture.deleted));
    assert.equal(browserInput.browserFixture.password, ""); assert.equal(browserInput.sentinel.password, "");
  } finally { globalThis.fetch = original; }
});

test("browser failure retains fixtures and reports only a fixed authored phase", async () => {
  const state = transport(), original = globalThis.fetch; let browserInput;
  globalThis.fetch = state.fetch;
  try {
    const report = await runHostedDeletionHttpsAcceptance(readHostedDeletionHttpsConfig(env, [...args, "--with-browser"]), {
      reportSink: async () => {}, browserAdapter: async input => {
        browserInput = input;
        throw Object.assign(new Error("Never copy synthetic-private-error-text"), {
          code: "code3_browser_acceptance_failed", browserPhase: "deployed public deletion sign-in",
          browserDiagnostics: { deployed: { blocked: 2, pageErrors: 1, arbitrarySecret: "synthetic-private-error-text" },
            arbitraryContext: { secret: "synthetic-private-error-text" } } });
      },
    });
    assert.equal(report.status, "failed"); assert.equal(report.failedStage, "deployed-browser-acceptance");
    assert.equal(report.browserFailedPhase, "deployed public deletion sign-in");
    assert.ok(!JSON.stringify(report).includes("synthetic-private-error-text"));
    assert.equal(report.browserDiagnostics.deployed.blocked, 2);
    assert.equal(report.browserDiagnostics.deployed.pageErrors, 1);
    assert.equal(report.browserDiagnostics.arbitraryContext, undefined);
    assert.equal(report.browserDiagnostics.deployed.arbitrarySecret, undefined);
    assert.equal(state.deleted.length, 1); assert.equal(state.users.size, 2);
    assert.equal(browserInput.browserFixture.password, ""); assert.equal(browserInput.sentinel.password, "");
  } finally { globalThis.fetch = original; }
});
