import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { readHostedDeletionConfig, restrictedTestFetch, syntheticEmail, assertSyntheticAccount, assertSyntheticPaths } from "../../scripts/lib/hostedDeletionGuard.mjs";
import { runHostedDeletionAcceptance } from "../../scripts/test-hosted-account-deletion.mjs";

const ref = "abcdefghijklmnopqrst";
const jwt = (role, project = ref) => `header.${Buffer.from(JSON.stringify({ role, ref: project })).toString("base64url")}.signature`;
const env = { CODE3_DELETION_TEST_ALLOWED_PROJECTS: ref, CODE3_DELETION_TEST_SUPABASE_URL: `https://${ref}.supabase.co`, CODE3_DELETION_TEST_ANON_KEY: jwt("anon"), CODE3_DELETION_TEST_SERVICE_ROLE_KEY: jwt("service_role") };
const args = ["--project-ref", ref, "--confirm-isolated", ref, "--execute"];

test("hosted deletion harness refuses production even when explicitly allowlisted", () => {
  const production = "gxsfququorfczvhrkudl";
  assert.throws(() => readHostedDeletionConfig({ ...env, CODE3_DELETION_TEST_ALLOWED_PROJECTS: production }, ["--project-ref", production, "--confirm-isolated", production, "--execute"]), /Production/);
  assert.throws(() => readHostedDeletionConfig({ ...env, CODE3_DELETION_TEST_ALLOWED_PROJECTS: `${ref},${production}` }, args), /isolated/);
});
test("importing the harness or fabricating a config cannot bypass the production gate", async () => {
  const fabricated = { execute: true, projectRef: "gxsfququorfczvhrkudl", origin: "https://gxsfququorfczvhrkudl.supabase.co" };
  assert.throws(() => restrictedTestFetch(fabricated), /fabricated/);
  await assert.rejects(runHostedDeletionAcceptance(fabricated), /fabricated/);
  await assert.rejects(runHostedDeletionAcceptance(readHostedDeletionConfig(env, args.filter(arg => arg !== "--execute"))), /explicitly enabled/);
});
test("hosted deletion configuration needs explicit isolated allowlist, matching origin, confirmation, and dedicated keys", () => {
  assert.equal(readHostedDeletionConfig(env, args).execute, true);
  assert.equal(readHostedDeletionConfig(env, args.filter(arg => arg !== "--execute")).execute, false);
  for (const patch of [{ CODE3_DELETION_TEST_ALLOWED_PROJECTS: "" }, { CODE3_DELETION_TEST_SUPABASE_URL: "https://code3tcg.app" }, { CODE3_DELETION_TEST_SUPABASE_URL: `https://${ref}.supabase.co/evil` }, { CODE3_DELETION_TEST_SERVICE_ROLE_KEY: jwt("service_role", "gxsfququorfczvhrkudl") }, { CODE3_DELETION_TEST_ANON_KEY: jwt("service_role") }, { CODE3_DELETION_TEST_SERVICE_ROLE_KEY: "", SUPABASE_SERVICE_ROLE_KEY: jwt("service_role") }]) assert.throws(() => readHostedDeletionConfig({ ...env, ...patch }, args));
  assert.throws(() => readHostedDeletionConfig(env, ["--project-ref", ref, "--execute"]));
  assert.throws(() => readHostedDeletionConfig(env, [...args, "--user-id", randomUUID()]));
});
test("configuration check and execution modes cannot be combined or made ambiguous", () => {
  assert.throws(() => readHostedDeletionConfig(env, [...args, "--check-config"]), /either/);
  assert.throws(() => readHostedDeletionConfig(env, ["--check-config", ...args]), /either/);
  for (const duplicated of [["--project-ref", ref], ["--project-ref", "zyxwvutsrqponmlkjihg"], ["--confirm-isolated", ref], ["--execute"]]) {
    assert.throws(() => readHostedDeletionConfig(env, [...args, ...duplicated]), /Duplicate/);
  }
  assert.throws(() => readHostedDeletionConfig(env, [...args.filter(arg => arg !== "--execute"), "--check-config", "--check-config"]), /Duplicate/);
  assert.throws(() => readHostedDeletionConfig(env, ["--execute", "--project-ref", "--confirm-isolated", ref]), /requires a value/);
  assert.throws(() => readHostedDeletionConfig(env, ["--execute", "--confirm-isolated", ref, "--project-ref"]), /requires a value/);
  assert.throws(() => readHostedDeletionConfig(env, [...args, "ignored-extra-value"]), /Unexpected/);
  assert.equal(readHostedDeletionConfig(env, [...args.filter(arg => arg !== "--execute"), "--check-config"]).execute, false);
});
test("provider requests cannot leak credentials across origins or redirects", async () => {
  const calls = [];
  const guarded = restrictedTestFetch(readHostedDeletionConfig(env, args), async (input, options) => { calls.push({ input, options }); return new Response("{}"); });
  for (const url of ["https://code3tcg.app/auth/v1/user", "https://evil.example/auth/v1/user", `https://${ref}.supabase.co/unreviewed`, `https://user@${ref}.supabase.co/rest/v1/profiles`]) assert.throws(() => guarded(url));
  await guarded(`https://${ref}.supabase.co/auth/v1/user`, { redirect: "follow" });
  assert.equal(calls.length, 1); assert.equal(calls[0].options.redirect, "error"); assert.ok(calls[0].options.signal);
});
test("cleanup requires exact returned account ID, server-owned run stamp, and synthetic email", () => {
  const run = randomUUID(), fixture = { id: randomUUID(), label: "primary" };
  const user = { id: fixture.id, email: syntheticEmail(run, fixture.label), app_metadata: { code3_deletion_acceptance_run: run } };
  assert.doesNotThrow(() => assertSyntheticAccount(user, fixture, run));
  for (const patch of [{ id: randomUUID() }, { email: "real@example.test" }, { app_metadata: {} }, { app_metadata: { code3_deletion_acceptance_run: randomUUID() } }]) assert.throws(() => assertSyntheticAccount({ ...user, ...patch }, fixture, run));
});
test("file cleanup accepts only this run's exact manifest, not folders, shared buckets, or other accounts", () => {
  const run = randomUUID(), fixture = { id: randomUUID(), label: "primary" };
  const path = `users/${fixture.id}/code3-delete-${run}/receipts.png`;
  assert.doesNotThrow(() => assertSyntheticPaths("receipts", [path], [fixture], run));
  for (const paths of [[""], [path.replace(run, randomUUID())], [path.replace(fixture.id, randomUUID())], [path.replace("receipts.png", "../other.png")]]) assert.throws(() => assertSyntheticPaths("receipts", paths, [fixture], run));
  assert.throws(() => assertSyntheticPaths("catalog-images", [path], [fixture], run));
});
