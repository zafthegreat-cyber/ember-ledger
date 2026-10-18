import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readHostedDeletionConfig, assertAuthorizedTestConfig, restrictedTestFetch, syntheticEmail, assertSyntheticAccount, assertSyntheticPaths, TEST_BUCKETS } from "./lib/hostedDeletionGuard.mjs";

const backendRequire = createRequire(new URL("../backend/package.json", import.meta.url));
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=", "base64");
const RPCS = new Set(["code3_account_deletion_status", "code3_begin_account_deletion", "code3_finish_account_data_deletion", "code3_release_account_deletion", "code3_complete_account_deletion"]);

export async function runHostedDeletionAcceptance(config) {
  assertAuthorizedTestConfig(config);
  if (!config.execute) throw new Error("Execution must be explicitly enabled after isolated configuration review.");
  const { createClient } = backendRequire("@supabase/supabase-js");
  const express = backendRequire("express");
  const { createAccountDeletionService } = backendRequire("./dist/accountDeletion/service.js");
  const { createAccountDeletionRouter } = backendRequire("./dist/routes/accountDeletion.routes.js");
  const runId = randomUUID(), fixtures = [], leases = new Map();
  const report = { runId, projectRef: config.projectRef, status: "running", checks: [], fixtures: [], productionWrites: 0, sharedPriceWrites: 0, hostedUiVerified: false, physicalDevicesVerified: false };
  const guardedFetch = restrictedTestFetch(config);
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: guardedFetch } };
  const admin = createClient(config.origin, config.secret, options);
  const clientFactory = token => createClient(config.origin, config.anon, { ...options, global: { ...options.global, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) } });
  const getFixture = id => { const fixture = fixtures.find(value => value.id === id); if (!fixture) throw new Error("Unregistered account rejected."); return fixture; };
  const verifyFixture = async id => {
    const fixture = getFixture(id);
    const result = await admin.auth.admin.getUserById(id);
    if (result.error) throw new Error("Synthetic account identity could not be reverified.");
    assertSyntheticAccount(result.data.user, fixture, runId);
    return fixture;
  };
  const must = result => {
    if (result.error) {
      const error = new Error("A staging provider prerequisite or operation failed.");
      // Provider messages can contain sensitive request values. Keep only a
      // validated machine code/status so a missing prerequisite is actionable.
      if (/^[A-Za-z0-9_]{3,64}$/.test(String(result.error.code ?? ""))) error.providerCode = result.error.code;
      if (Number.isInteger(result.error.status)) error.httpStatus = result.error.status;
      if (/^permission denied for (?:schema|table|function|sequence) [\w.() ]+$/i.test(result.error.message || "")) error.permissionFailure = result.error.message;
      throw error;
    }
    return result.data;
  };
  const check = (condition, label) => {
    if (!condition) report.failedCheck = label; // Harness-authored labels only, never provider text.
    assert.ok(condition, label); report.checks.push(label);
  };
  const storageDenial = error => error?.name === "StorageApiError"
    && [400, 403, 404].includes(error.status)
    && ["403", "404", "AccessDenied", "NoSuchKey", "NoSuchBucket", "unauthorized", "not_found"].includes(String(error.statusCode));
  let stage = "preflight", server, fault = null;
  const guardedAdmin = {
    async rpc(name, args) {
      if (!RPCS.has(name)) throw new Error("Unreviewed privileged RPC rejected.");
      getFixture(args.target_user);
      if (["code3_release_account_deletion", "code3_complete_account_deletion"].includes(name)) {
        if (leases.get(args.target_user) !== args.lease_token) throw new Error("Unregistered cleanup lease rejected.");
      } else await verifyFixture(args.target_user);
      if (name === "code3_finish_account_data_deletion" && leases.get(args.target_user) !== args.lease_token) throw new Error("Unregistered deletion lease rejected.");
      const result = await admin.rpc(name, args);
      if (name === "code3_begin_account_deletion" && result.data?.lease) {
        leases.set(args.target_user, result.data.lease);
        if (fault?.kind === "begin-response" && fault.id === args.target_user && !fault.fired) { fault.fired = true; return { error: { message: "Injected lost begin response" }, data: null }; }
      }
      return result;
    },
    auth: { admin: {
      async signOut(token, scope) {
        const claim = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
        await verifyFixture(claim.sub);
        return admin.auth.admin.signOut(token, scope);
      },
      async deleteUser(id, soft) {
        await verifyFixture(id);
        if (soft !== false) throw new Error("Only the reviewed hard-delete flow is tested.");
        if (fault?.kind === "auth" && fault.id === id && !fault.fired) { fault.fired = true; return { error: { message: "Injected Auth failure" } }; }
        const result = await admin.auth.admin.deleteUser(id, false);
        if (!result.error) getFixture(id).deleted = true;
        return result;
      },
    } },
    storage: { from: bucket => ({ async remove(paths) {
      assertSyntheticPaths(bucket, paths, fixtures, runId);
      const owners = fixtures.filter(fixture => paths.some(path => path.startsWith(`users/${fixture.id}/`)));
      for (const fixture of owners) await verifyFixture(fixture.id);
      if (fault?.kind === "storage" && owners.some(fixture => fixture.id === fault.id) && bucket === "receipt-images" && !fault.fired) { fault.fired = true; return { error: { message: "Injected Storage failure after receipts removal" } }; }
      return admin.storage.from(bucket).remove(paths);
    } }) },
  };
  const service = createAccountDeletionService({
    env: { SUPABASE_URL: config.origin, SUPABASE_ANON_KEY: config.anon, CODE3_ACCOUNT_DELETION_ENABLED: "true" },
    admin: guardedAdmin, clientFactory,
  });
  async function createFixture(label, withFiles = false) {
    stage = `create-${label}`;
    const password = `Code3!${randomBytes(32).toString("base64url")}`;
    const data = must(await admin.auth.admin.createUser({ email: syntheticEmail(runId, label), password, email_confirm: true, app_metadata: { code3_deletion_acceptance_run: runId } }));
    const fixture = { id: data.user.id, label, password, deleted: false };
    assertSyntheticAccount(data.user, fixture, runId);
    fixtures.push(fixture);
    await verifyFixture(fixture.id);
    stage = `seed-profile-${label}`;
    must(await admin.from("profiles").upsert({ id: fixture.id, email: data.user.email, display_name: "Synthetic deletion acceptance", app_role: "user", user_role: "user", app_access: true, beta_status: "approved", beta_access_status: "approved" }));
    stage = `seed-preferences-${label}`;
    must(await admin.from("app_user_preferences").insert({ id: randomUUID(), user_id: fixture.id }));
    await signIn(fixture);
    const snapshot = { "legacy-core-business": { schemaVersion: 0, data: { items: [{ id: `fixture-${label}`, title: "Synthetic preservation check", quantity: 2 }] } } };
    stage = `seed-cloud-${label}`;
    must(await fixture.client.rpc("code3_workspace_write", { p_expected_revision: 0, p_sources: snapshot, p_mutation_id: randomUUID() }));
    fixture.snapshot = must(await fixture.client.rpc("code3_workspace_read"));
    if (withFiles) for (const bucket of TEST_BUCKETS) {
      stage = `upload-${label}-${bucket}`;
      must(await fixture.client.storage.from(bucket).upload(pathFor(fixture, bucket), PNG, { contentType: "image/png", upsert: false }));
    }
    fixture.hasFiles = withFiles;
    return fixture;
  }
  async function signIn(fixture) {
    await verifyFixture(fixture.id);
    const signed = must(await clientFactory().auth.signInWithPassword({ email: syntheticEmail(runId, fixture.label), password: fixture.password }));
    assert.equal(signed.user.id, fixture.id);
    fixture.token = signed.session.access_token;
    fixture.initialRefreshToken ??= signed.session.refresh_token;
    fixture.client = clientFactory(fixture.token);
  }
  const pathFor = (fixture, bucket) => `users/${fixture.id}/code3-delete-${runId}/${bucket}.png`;
  async function request(fixture, body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/account/deletion${body ? "" : "/status"}`, {
      method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${fixture.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined, redirect: "error", signal: AbortSignal.timeout(180_000),
    });
    return { status: response.status, body: await response.json() };
  }
  const deletionBody = fixture => ({ password: fixture.password, confirmation: "DELETE MY ACCOUNT" });
  async function assertDeleted(fixture) {
    const auth = await admin.auth.admin.getUserById(fixture.id);
    check(auth.error?.status === 404 && !auth.data?.user, `${fixture.label}: Auth hard deletion confirmed`);
    check(must(await admin.from("profiles").select("id").eq("id", fixture.id)).length === 0, `${fixture.label}: profile removed`);
    check(must(await admin.from("app_user_preferences").select("id").eq("user_id", fixture.id)).length === 0, `${fixture.label}: owned rows removed`);
    check(must(await fixture.client.rpc("code3_current_session_valid")) === false, `${fixture.label}: old access token cannot access an active session`);
    if (fixture.hasFiles) for (const bucket of TEST_BUCKETS) check(must(await admin.storage.from(bucket).list(`users/${fixture.id}/code3-delete-${runId}`)).length === 0, `${fixture.label}: ${bucket} objects removed`);
  }
  try {
    // These are infrastructure checks, before even creating a synthetic account.
    for (const bucket of TEST_BUCKETS) {
      stage = `preflight-bucket-${bucket}`;
      check(must(await admin.storage.getBucket(bucket)).public === false, `${bucket}: private bucket configured`);
    }
    stage = "preflight-deletion-rpc";
    const probe = await admin.rpc("code3_account_deletion_status", { target_user: randomUUID() });
    check(Boolean(probe.error && /Account not found/.test(probe.error.message)), "deletion migration installed before account creation");
    for (const table of ["profiles", "app_user_preferences"]) {
      stage = `preflight-table-${table}`;
      must(await admin.from(table).select("id", { head: true }).limit(0));
      report.checks.push(`${table}: test service can access the required table`);
    }
    const app = express();
    app.use("/api/account/deletion", createAccountDeletionRouter({ env: { NODE_ENV: "development" }, service }));
    server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
    const primary = await createFixture("primary", true), sentinel = await createFixture("sentinel", true);
    const sentinelProfile = must(await admin.from("profiles").select("*").eq("id", sentinel.id).single());
    stage = "private-storage-isolation";
    for (const bucket of TEST_BUCKETS) {
      const ownerFile = must(await primary.client.storage.from(bucket).download(pathFor(primary, bucket)));
      check(Buffer.from(await ownerFile.arrayBuffer()).equals(PNG), `${bucket}: owner reads its original bytes`);
      check(storageDenial((await sentinel.client.storage.from(bucket).download(pathFor(primary, bucket))).error), `${bucket}: other account cannot read attachment`);
      const publicResponse = await guardedFetch(`${config.origin}/storage/v1/object/public/${bucket}/${pathFor(primary, bucket)}`);
      const publicError = await publicResponse.json();
      check([400, 403, 404].includes(publicResponse.status)
        && (["403", "404"].includes(String(publicError?.statusCode))
          || ["AccessDenied", "NoSuchKey", "NoSuchBucket", "unauthorized", "not_found"].includes(publicError?.code)), `${bucket}: public URL denied`);
    }
    stage = "reauthentication-and-target-guards";
    check((await request(primary)).body.blockers.length === 0, "synthetic account has no ownership blocker");
    check((await request(primary, { ...deletionBody(primary), userId: sentinel.id })).status === 400, "client-selected target rejected");
    check((await request(primary, { ...deletionBody(primary), password: "Deliberately-wrong-test-password" })).status === 401, "incorrect password cannot start deletion");
    check((await request(primary)).body.state === "ready", "failed confirmation leaves deletion unstarted");
    stage = "partial-storage-failure";
    fault = { kind: "storage", id: primary.id, fired: false };
    check((await request(primary, deletionBody(primary))).body.error?.code === "account_deletion_pending" && fault.fired, "Storage failure leaves durable pending state");
    check(must(await primary.client.rpc("code3_current_session_valid")) === false, "pending deletion blocks original access session");
    assert.ok(typeof primary.initialRefreshToken === "string" && primary.initialRefreshToken.length > 10, "the original refresh token was captured for the revocation test");
    const refreshed = await clientFactory().auth.refreshSession({ refresh_token: primary.initialRefreshToken });
    primary.initialRefreshToken = "";
    // A network, throttling, or local missing-session error is not revocation proof.
    // https://supabase.com/docs/guides/auth/debugging/error-codes
    check(refreshed.error?.name === "AuthApiError" && refreshed.error.status === 400
      && ["refresh_token_not_found", "session_not_found"].includes(refreshed.error.code)
      && !refreshed.data?.session, "original refresh token revoked by Auth after deletion starts");
    const pendingWrite = await primary.client.rpc("code3_workspace_write", { p_expected_revision: 1, p_sources: primary.snapshot.sources, p_mutation_id: randomUUID() });
    check(pendingWrite.status === 403 && pendingWrite.error?.code === "28000", "pending deletion rejects ordinary cloud writes");
    check(must(await admin.storage.from("receipts").list(`users/${primary.id}/code3-delete-${runId}`)).length === 0, "partial failure occurs after an actual object removal");
    fault = null;
    await signIn(primary);
    check((await request(primary)).body.state === "pending", "fresh sign-in can resume only the pending deletion path");
    check((await request(primary, deletionBody(primary))).body.state === "deleted", "password-confirmed Storage retry finishes");
    await assertDeleted(primary);
    for (const kind of ["auth", "begin-response"]) {
      const fixture = await createFixture(kind === "auth" ? "authfailure" : "lostresponse");
      stage = `${kind}-failure`; fault = { kind, id: fixture.id, fired: false };
      check((await request(fixture, deletionBody(fixture))).body.error?.code === "account_deletion_pending" && fault.fired, `${kind}: failure is reported as pending`);
      check(must(await admin.rpc("code3_account_deletion_status", { target_user: fixture.id })).state === "pending", `${kind}: provider retains durable marker`);
      if (kind === "begin-response") {
        // Only this run's captured lease is released to avoid a five-minute wait.
        // This simulates lease expiry; it does not remove the pending marker.
        must(await guardedAdmin.rpc("code3_release_account_deletion", { target_user: fixture.id, lease_token: leases.get(fixture.id) }));
      }
      fault = null; await signIn(fixture);
      check((await request(fixture, deletionBody(fixture))).body.state === "deleted", `${kind}: verified retry completes`);
      await assertDeleted(fixture);
    }
    stage = "sentinel-preservation";
    assert.deepEqual(must(await sentinel.client.rpc("code3_workspace_read")), sentinel.snapshot); report.checks.push("other account's cloud snapshot and revision preserved");
    assert.deepEqual(must(await admin.from("profiles").select("*").eq("id", sentinel.id).single()), sentinelProfile); report.checks.push("other account's profile preserved");
    for (const bucket of TEST_BUCKETS) check(Buffer.from(await must(await sentinel.client.storage.from(bucket).download(pathFor(sentinel, bucket))).arrayBuffer()).equals(PNG), `sentinel: ${bucket} bytes preserved`);
    stage = "sentinel-cleanup";
    check((await request(sentinel, deletionBody(sentinel))).body.state === "deleted", "synthetic sentinel cleaned using normal verified deletion");
    await assertDeleted(sentinel);
    report.status = "passed";
  } catch (error) {
    // Do not emit provider errors, credentials, HTTP bodies, or tokens. Failed
    // fixtures remain available for investigation; never bypass a failed guard.
    report.status = "failed"; report.failedStage = stage;
    if (error?.providerCode) report.providerCode = error.providerCode;
    if (Number.isInteger(error?.httpStatus)) report.httpStatus = error.httpStatus;
    if (error?.permissionFailure) report.permissionFailure = error.permissionFailure;
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    report.fixtures = fixtures.map(({ id, label, deleted }) => ({ id, label, deleted }));
    for (const fixture of fixtures) { fixture.password = ""; fixture.token = ""; fixture.initialRefreshToken = ""; }
    const folder = resolve("artifacts/qa/hosted-account-deletion"); await mkdir(folder, { recursive: true });
    await writeFile(resolve(folder, `${runId}.json`), `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const argv = process.argv.slice(2);
    if (!argv.includes("--execute") && !argv.includes("--check-config")) {
      console.log("No network requests made. Configure dedicated CODE3_DELETION_TEST_* variables, then use --check-config or --execute --project-ref <isolated-ref> --confirm-isolated <same-ref>. See docs/mobile-beta/ACCOUNT_DELETION_ROLLOUT.md.");
    } else {
      const config = readHostedDeletionConfig(process.env, argv);
      if (!config.execute) console.log(JSON.stringify({ configurationValid: true, projectRef: config.projectRef, networkRequests: 0 }));
      else { const report = await runHostedDeletionAcceptance(config); console.log(JSON.stringify(report, null, 2)); if (report.status !== "passed") process.exitCode = 1; }
    }
  } catch (error) { console.error(error instanceof Error ? error.message : "Acceptance harness could not start."); process.exitCode = 1; }
}
