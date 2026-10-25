import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { restrictedTestFetch, syntheticEmail, assertSyntheticAccount, assertSyntheticPaths, TEST_BUCKETS } from "./lib/hostedDeletionGuard.mjs";
import { readHostedDeletionHttpsConfig, assertAuthorizedHttpsTestConfig, isolatedProviderConfig, assertPreviewVersion, restrictedHttpsAppFetch, readBoundedAcceptanceJson } from "./lib/hostedDeletionHttpsGuard.mjs";
import { classifyReceiptReference } from "../src/services/privateReceiptAccess.js";

const backendRequire = createRequire(new URL("../backend/package.json", import.meta.url));
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=", "base64");
const confirmation = "DELETE MY ACCOUNT";
const BROWSER_PHASES = new Set(["initial verification", "private attachment component setup", "private attachment URL renewal",
  "private attachment session revocation", "deployed public deletion sign-in", "deployed wrong-password confirmation",
  "deployed confirmed synthetic deletion", "deployed completion account isolation"]);
const storageDenial = error => error?.name === "StorageApiError" && [400, 403, 404].includes(error.status)
  && ["403", "404", "AccessDenied", "NoSuchKey", "NoSuchBucket", "unauthorized", "not_found"].includes(String(error.statusCode));

/** The only credentials accepted are the dedicated isolated-target configuration.
 * No server is started, no fault controls are deployed, and production is denied. */
export async function runHostedDeletionHttpsAcceptance(config, { browserAdapter, reportSink } = {}) {
  assertAuthorizedHttpsTestConfig(config);
  if (!config.execute) throw new Error("Execution must be explicitly enabled after isolated Preview review.");
  const provider = isolatedProviderConfig(config);
  const { createClient } = backendRequire("@supabase/supabase-js");
  const runId = randomUUID(), fixtures = [];
  const report = { runId, projectRef: config.projectRef, appOrigin: config.appOrigin, deploymentId: config.deploymentId,
    status: "running", checks: [], fixtures: [], productionWrites: 0, sharedPriceWrites: 0,
    hostedHttpsApiVerified: false, deployedDeletionUiVerified: false, receiptComponentHostedIntegrationVerified: false,
    deployedReceiptWorkflowVerified: false, physicalDevicesVerified: false };
  const providerFetch = restrictedTestFetch(provider), appFetch = restrictedHttpsAppFetch(config);
  const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: providerFetch } };
  const admin = createClient(provider.origin, provider.secret, clientOptions);
  const userClient = token => createClient(provider.origin, provider.anon, { ...clientOptions,
    global: { ...clientOptions.global, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) } });
  let stage = "preview-build-preflight";
  const must = result => {
    if (result.error) {
      const error = new Error("An isolated provider prerequisite or operation failed.");
      if (/^[A-Za-z0-9_]{3,64}$/.test(String(result.error.code || ""))) error.providerCode = result.error.code;
      if (Number.isInteger(result.error.status)) error.httpStatus = result.error.status;
      throw error;
    }
    return result.data;
  };
  const check = (condition, label) => {
    // Labels are harness-authored, never provider/DOM/error text or credentials.
    assert.ok(typeof label === "string" && /^[A-Za-z][A-Za-z0-9 :()'.,&+-]{2,180}$/.test(label), "Unsafe acceptance check label rejected.");
    if (!condition) report.failedCheck = label;
    assert.ok(condition, label); report.checks.push(label);
  };
  const registered = fixture => {
    if (!fixtures.includes(fixture)) throw new Error("Unregistered synthetic fixture rejected.");
    return fixture;
  };
  async function verifyFixture(fixture) {
    registered(fixture);
    const result = await admin.auth.admin.getUserById(fixture.id);
    if (result.error) throw new Error("Synthetic account identity could not be reverified.");
    assertSyntheticAccount(result.data.user, fixture, runId);
    return fixture;
  }
  const filePath = (fixture, bucket) => `users/${fixture.id}/code3-delete-${runId}/${bucket}.png`;
  async function signIn(fixture) {
    await verifyFixture(fixture);
    const signed = must(await userClient().auth.signInWithPassword({ email: fixture.email, password: fixture.password }));
    assert.equal(signed.user.id, fixture.id);
    fixture.token = signed.session.access_token;
    fixture.refreshToken = signed.session.refresh_token;
    fixture.client = userClient(fixture.token);
  }
  async function createFixture(label) {
    stage = `create-${label}`;
    const password = `Code3!${randomBytes(32).toString("base64url")}`;
    const email = syntheticEmail(runId, label);
    const data = must(await admin.auth.admin.createUser({ email, password, email_confirm: true,
      app_metadata: { code3_deletion_acceptance_run: runId } }));
    const fixture = { id: data.user.id, label, email, password, deleted: false };
    assertSyntheticAccount(data.user, fixture, runId); fixtures.push(fixture);
    stage = `seed-profile-${label}`; await verifyFixture(fixture);
    must(await admin.from("profiles").upsert({ id: fixture.id, email, display_name: "Synthetic HTTPS deletion acceptance",
      app_role: "user", user_role: "user", app_access: true, beta_status: "approved", beta_access_status: "approved" }));
    stage = `seed-preferences-${label}`; await verifyFixture(fixture);
    must(await admin.from("app_user_preferences").insert({ id: randomUUID(), user_id: fixture.id }));
    await signIn(fixture);
    fixture.attachments = TEST_BUCKETS.map(bucket => ({ bucket, path: filePath(fixture, bucket),
      reference: `${provider.origin}/storage/v1/object/public/${bucket}/${filePath(fixture, bucket)}` }));
    for (const { bucket, path } of fixture.attachments) {
      stage = `upload-${label}-${bucket}`; await verifyFixture(fixture);
      assertSyntheticPaths(bucket, [path], fixtures, runId);
      must(await fixture.client.storage.from(bucket).upload(path, PNG, { contentType: "image/png", upsert: false }));
    }
    stage = `seed-cloud-${label}`;
    const sources = { "legacy-core-business": { schemaVersion: 0, data: { items: fixture.attachments.map(({ bucket, reference }, index) => ({
      id: `synthetic-${label}-${bucket}`, name: "Synthetic preservation check", quantity: 2, marketPrice: 99 + index, receiptImage: reference,
    })) } } };
    must(await fixture.client.rpc("code3_workspace_write", { p_expected_revision: 0, p_sources: sources, p_mutation_id: randomUUID() }));
    fixture.snapshot = must(await fixture.client.rpc("code3_workspace_read"));
    await verifyFixture(fixture);
    fixture.profile = must(await admin.from("profiles").select("*").eq("id", fixture.id).single());
    return fixture;
  }
  async function apiRequest(fixture, body, extra = {}) {
    if (fixture && !fixture.deleted) await verifyFixture(fixture);
    const response = await appFetch(`${config.appOrigin}/api/account/deletion${body ? "" : "/status"}`, {
      method: body ? "POST" : "GET", headers: { Origin: config.appOrigin, Accept: "application/json",
        ...(fixture ? { Authorization: `Bearer ${fixture.token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...extra },
      body: body ? JSON.stringify(body) : undefined,
    });
    const value = await readBoundedAcceptanceJson(response);
    check(response.headers.get("cache-control")?.includes("no-store"), "API account responses are not cacheable");
    return { status: response.status, body: value, response };
  }
  async function storageChecks(owner, other) {
    stage = `storage-isolation-${owner.label}`;
    for (const { bucket, path, reference } of owner.attachments) {
      await verifyFixture(owner); await verifyFixture(other);
      const original = classifyReceiptReference(reference, provider.origin);
      check(original.kind === "private" && original.bucket === bucket && original.path === path, `${bucket}: legacy reference keeps the original path`);
      const file = must(await owner.client.storage.from(bucket).download(path));
      check(Buffer.from(await file.arrayBuffer()).equals(PNG), `${bucket}: owner reads the exact synthetic bytes`);
      check(storageDenial((await other.client.storage.from(bucket).download(path)).error), `${bucket}: other account download is denied`);
      check(storageDenial((await other.client.storage.from(bucket).createSignedUrl(path, 60)).error), `${bucket}: other account signing is denied`);
      const signed = must(await owner.client.storage.from(bucket).createSignedUrl(path, 60));
      const parsed = classifyReceiptReference(signed.signedUrl, provider.origin);
      check(parsed.kind === "private" && parsed.bucket === bucket && parsed.path === path, `${bucket}: signed link retains the original reference`);
      const signedResponse = await providerFetch(signed.signedUrl);
      check(signedResponse.ok && Buffer.from(await signedResponse.arrayBuffer()).equals(PNG), `${bucket}: signed HTTPS link reads original bytes`);
      const publicResponse = await providerFetch(reference);
      const publicBody = await readBoundedAcceptanceJson(publicResponse);
      check([400, 403, 404].includes(publicResponse.status) && (["403", "404"].includes(String(publicBody?.statusCode))
        || ["AccessDenied", "NoSuchKey", "NoSuchBucket", "unauthorized", "not_found"].includes(publicBody?.code)), `${bucket}: original public link is denied`);
    }
    assert.deepEqual(must(await owner.client.rpc("code3_workspace_read")), owner.snapshot);
    check(true, "Signing and downloads leave original references and prices unchanged");
  }
  async function deleteFixture(fixture) {
    stage = `delete-${fixture.label}`; await verifyFixture(fixture);
    const result = await apiRequest(fixture, { password: fixture.password, confirmation });
    check(result.status === 200 && result.body.ok === true && result.body.state === "deleted" && result.body.localCleanupRequired === true,
      `${fixture.label}: normal deployed HTTPS deletion succeeds`);
    fixture.deleted = true;
  }
  async function assertDeleted(fixture) {
    registered(fixture);
    const auth = await admin.auth.admin.getUserById(fixture.id);
    check(auth.error?.status === 404 && !auth.data?.user, `${fixture.label}: Auth hard deletion confirmed`);
    fixture.deleted = true;
    check(must(await admin.from("profiles").select("id").eq("id", fixture.id)).length === 0, `${fixture.label}: profile removed`);
    check(must(await admin.from("app_user_preferences").select("id").eq("user_id", fixture.id)).length === 0, `${fixture.label}: preference rows removed`);
    check(must(await fixture.client.rpc("code3_current_session_valid")) === false, `${fixture.label}: original access session is invalid`);
    const oldWorkspace = await fixture.client.rpc("code3_workspace_read");
    check(oldWorkspace.status === 403 && oldWorkspace.error?.code === "28000", `${fixture.label}: deleted session cannot read cloud records`);
    const refreshed = await userClient().auth.refreshSession({ refresh_token: fixture.refreshToken });
    fixture.refreshToken = "";
    check(refreshed.error?.name === "AuthApiError" && refreshed.error.status === 400
      && ["refresh_token_not_found", "session_not_found"].includes(refreshed.error.code) && !refreshed.data?.session,
      `${fixture.label}: original refresh token is revoked`);
    const oldStatus = await apiRequest(fixture);
    check(oldStatus.status === 401 && oldStatus.body.error?.code === "account_sign_in_required", `${fixture.label}: deleted bearer cannot use HTTPS account API`);
    for (const { bucket, path } of fixture.attachments) {
      assertSyntheticPaths(bucket, [path], fixtures, runId);
      check(must(await admin.storage.from(bucket).list(path.slice(0, path.lastIndexOf("/")))).length === 0,
        `${fixture.label}: ${bucket} synthetic objects removed`);
    }
  }
  try {
    // Read only the exact reviewed build and endpoint behavior before any account
    // creation. No production secret or synthetic password goes to this probe.
    const versionResponse = await appFetch(`${config.appOrigin}/app-version.json`);
    if (!versionResponse.ok) throw new Error("Preview deployment is not accessible.");
    assertPreviewVersion(config, await readBoundedAcceptanceJson(versionResponse));
    check(true, "Served build matches the independently reviewed Preview deployment");
    const preflight = await appFetch(`${config.appOrigin}/api/account/deletion/status`, { method: "OPTIONS",
      headers: { Origin: config.appOrigin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "Authorization" } });
    check(preflight.status === 204 && preflight.headers.get("access-control-allow-origin") === config.appOrigin, "Preview exact origin passes HTTPS preflight");
    const untrusted = await appFetch(`${config.appOrigin}/api/account/deletion/status`, { method: "OPTIONS",
      headers: { Origin: "https://code3-deletion-untrusted.example.invalid", "Access-Control-Request-Method": "GET" } });
    check(untrusted.status === 403 && !untrusted.headers.has("access-control-allow-origin"), "Untrusted origin is denied before authentication");
    const noAuth = await apiRequest(null);
    check(noAuth.status === 401 && noAuth.body.error?.code === "account_sign_in_required", "HTTPS status rejects missing authentication");
    for (const bucket of TEST_BUCKETS) {
      stage = `preflight-bucket-${bucket}`;
      check(must(await admin.storage.getBucket(bucket)).public === false, `${bucket}: isolated bucket is private`);
    }
    stage = "preflight-deletion-schema";
    const probe = await admin.rpc("code3_account_deletion_status", { target_user: randomUUID() });
    check(Boolean(probe.error && /Account not found/.test(probe.error.message)), "Isolated deletion migration is installed before fixtures");
    const primary = await createFixture("primary"), sentinel = await createFixture("sentinel");
    await storageChecks(primary, sentinel);
    stage = "https-confirmation-guards";
    const status = await apiRequest(primary);
    check(status.status === 200 && status.body.ok === true && status.body.available === true && status.body.state === "ready"
      && status.body.accountEmail === primary.email && status.body.blockers?.length === 0, "HTTPS review identifies only the fresh synthetic account");
    check(status.response.headers.get("access-control-allow-origin") === config.appOrigin, "Authenticated HTTPS response retains exact CORS origin");
    const target = await apiRequest(primary, { password: primary.password, confirmation, userId: sentinel.id });
    check(target.status === 400 && target.body.error?.code === "account_deletion_request_invalid", "HTTPS deletion rejects a caller-selected target");
    const wrong = await apiRequest(primary, { password: `Wrong!${randomBytes(24).toString("base64url")}`, confirmation });
    check(wrong.status === 401 && wrong.body.error?.code === "account_reauthentication_failed", "HTTPS deletion rejects an incorrect password");
    check((await apiRequest(primary)).body.state === "ready", "Failed confirmation leaves deletion unstarted");
    await deleteFixture(primary); await assertDeleted(primary);
    report.hostedHttpsApiVerified = true;
    if (config.withBrowser) {
      const fixture = await createFixture("browser");
      stage = "deployed-browser-acceptance";
      const runBrowser = browserAdapter || (await import("./lib/hostedDeletionBrowserAcceptance.mjs")).runHostedDeletionBrowserAcceptance;
      const browserFixture = { id: fixture.id, email: fixture.email, password: fixture.password, attachments: structuredClone(fixture.attachments) };
      const browserSentinel = { id: sentinel.id, email: sentinel.email, password: sentinel.password, attachments: structuredClone(sentinel.attachments) };
      const assertBrowserFixture = input => {
        if (input === browserFixture) return verifyFixture(fixture);
        if (input === browserSentinel) return verifyFixture(sentinel);
        throw new Error("Unregistered browser fixture rejected.");
      };
      let result;
      try {
        result = await runBrowser({ appOrigin: config.appOrigin, projectRef: config.projectRef, guardedConfig: config,
          browserFixture, sentinel: browserSentinel, publicAnonKey: provider.anon, assertFixture: assertBrowserFixture, reportCheck: check });
      } finally { browserFixture.password = ""; browserSentinel.password = ""; }
      check(result?.deployedDeletionUiVerified === true, "Actual deployed deletion page completed browser acceptance");
      report.deployedDeletionUiVerified = true;
      report.receiptComponentHostedIntegrationVerified = result.receiptComponentHostedIntegrationVerified === true;
      await assertDeleted(fixture);
    }
    stage = "sentinel-preservation"; await verifyFixture(sentinel);
    assert.deepEqual(must(await sentinel.client.rpc("code3_workspace_read")), sentinel.snapshot);
    check(true, "Other account cloud snapshot revision references and prices are unchanged");
    await verifyFixture(sentinel);
    assert.deepEqual(must(await admin.from("profiles").select("*").eq("id", sentinel.id).single()), sentinel.profile);
    check(true, "Other account profile is unchanged");
    for (const { bucket, path } of sentinel.attachments) {
      await verifyFixture(sentinel);
      const file = must(await sentinel.client.storage.from(bucket).download(path));
      check(Buffer.from(await file.arrayBuffer()).equals(PNG), `sentinel: ${bucket} original bytes are unchanged`);
    }
    await deleteFixture(sentinel); await assertDeleted(sentinel);
    report.status = "passed";
  } catch (error) {
    // Never copy provider/browser errors, HTTP bodies, emails, credentials or
    // original references into the report. Preserve failed fixtures for review.
    report.status = "failed"; report.failedStage = stage;
    if (/^[A-Za-z0-9_]{3,64}$/.test(String(error?.providerCode || ""))) report.providerCode = error.providerCode;
    if (Number.isInteger(error?.httpStatus)) report.httpStatus = error.httpStatus;
    if (error?.code === "code3_browser_acceptance_failed" && BROWSER_PHASES.has(error.browserPhase)) report.browserFailedPhase = error.browserPhase;
  } finally {
    report.fixtures = fixtures.map(({ id, label, deleted }) => ({ id, label, deleted }));
    for (const fixture of fixtures) { fixture.password = ""; fixture.token = ""; fixture.refreshToken = ""; }
    if (reportSink) await reportSink(report);
    else {
      const folder = resolve("artifacts/qa/hosted-account-deletion-https"); await mkdir(folder, { recursive: true });
      await writeFile(resolve(folder, `${runId}.json`), `${JSON.stringify(report, null, 2)}\n`);
    }
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (!argv.includes("--execute") && !argv.includes("--check-config")) {
    console.log("No network requests made. Review a synthetic-only Supabase target and immutable HTTPS Preview, then use --check-config before --execute. Production is forbidden.");
  } else {
    try {
      const config = readHostedDeletionHttpsConfig(process.env, argv);
      if (!config.execute) console.log(JSON.stringify({ configurationValid: true, projectRef: config.projectRef, appOrigin: config.appOrigin,
        deploymentId: config.deploymentId, withBrowser: config.withBrowser, networkRequests: 0 }));
      else { const report = await runHostedDeletionHttpsAcceptance(config); console.log(JSON.stringify(report, null, 2)); if (report.status !== "passed") process.exitCode = 1; }
    } catch { console.error("HTTPS acceptance configuration was rejected. Use only dedicated isolated credentials and independently reviewed Preview metadata."); process.exitCode = 1; }
  }
}
