const PROJECT_REF = /^[a-z0-9]{20}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const PRODUCTION_PROJECTS = new Set(["gxsfququorfczvhrkudl"]);
const issuedConfigurations = new WeakSet();
export const TEST_BUCKETS = Object.freeze(["receipts", "receipt-images", "product-submissions", "feedback-screenshots"]);

export function readHostedDeletionConfig(env, argv) {
  const allowedFlags = new Set(["--execute", "--check-config", "--project-ref", "--confirm-isolated"]);
  const valueFlags = new Set(["--project-ref", "--confirm-isolated"]);
  const seenFlags = new Set();
  if (argv.some(arg => arg.startsWith("--") && !allowedFlags.has(arg))) throw new Error("Unknown acceptance-harness option.");
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!allowedFlags.has(flag)) throw new Error("Unexpected acceptance-harness argument.");
    if (seenFlags.has(flag)) throw new Error("Duplicate acceptance-harness options are forbidden.");
    seenFlags.add(flag);
    if (valueFlags.has(flag)) {
      const argument = argv[index + 1];
      if (!argument || argument.startsWith("--")) throw new Error("Acceptance-harness option requires a value.");
      values.set(flag, argument);
      index += 1;
    }
  }
  if (seenFlags.has("--execute") && seenFlags.has("--check-config")) throw new Error("Choose either --check-config or --execute; checking configuration must not perform mutations.");
  const value = name => values.get(name) || "";
  const projectRef = value("--project-ref");
  if (!PROJECT_REF.test(projectRef) || PRODUCTION_PROJECTS.has(projectRef)) throw new Error("Production and invalid project IDs are forbidden.");
  const allowlist = String(env.CODE3_DELETION_TEST_ALLOWED_PROJECTS || "").split(",").map(value => value.trim()).filter(Boolean);
  if (!allowlist.includes(projectRef) || allowlist.some(ref => !PROJECT_REF.test(ref) || PRODUCTION_PROJECTS.has(ref))) throw new Error("Use an explicit allowlist containing only isolated test project IDs.");
  if (value("--confirm-isolated") !== projectRef) throw new Error("Confirm the same isolated project ID explicitly.");
  const expectedOrigin = `https://${projectRef}.supabase.co`;
  let url;
  try { url = new URL(env.CODE3_DELETION_TEST_SUPABASE_URL); } catch { throw new Error("Provide the dedicated isolated test Supabase URL."); }
  if (url.origin !== expectedOrigin || url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error("The test URL must match the exact allowlisted Supabase project origin.");
  const keys = {};
  for (const [name, role, prefix] of [["ANON_KEY", "anon", "sb_publishable_"], ["SERVICE_ROLE_KEY", "service_role", "sb_secret_"]]) {
    const key = String(env[`CODE3_DELETION_TEST_${name}`] || "");
    if (key.startsWith(prefix) && key.length > prefix.length + 15) { keys[name] = key; continue; }
    try {
      const parts = key.split(".");
      const claim = JSON.parse(Buffer.from(parts[1] || "", "base64url").toString("utf8"));
      if (parts.length !== 3 || claim.ref !== projectRef || claim.role !== role) throw new Error();
    } catch { throw new Error(`Provide a matching test-only ${name}; inherited app credentials are never used.`); }
    keys[name] = key;
  }
  const config = Object.freeze({ projectRef, origin: expectedOrigin, anon: keys.ANON_KEY, secret: keys.SERVICE_ROLE_KEY, execute: argv.includes("--execute") });
  issuedConfigurations.add(config);
  return config;
}

export function assertAuthorizedTestConfig(config) {
  if (!issuedConfigurations.has(config)) throw new Error("Use the validated isolated-target configuration; fabricated configurations are forbidden.");
}

export function restrictedTestFetch(config, implementation = globalThis.fetch) {
  assertAuthorizedTestConfig(config);
  return (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin !== config.origin || url.username || url.password || url.hash || !/^\/(?:auth|rest|storage)\/v1\//.test(url.pathname)) throw new Error("An acceptance request tried to leave its isolated provider.");
    const signal = AbortSignal.any([AbortSignal.timeout(20_000), ...(init.signal ? [init.signal] : [])]);
    return implementation(input, { ...init, redirect: "error", signal });
  };
}

export function syntheticEmail(runId, label) {
  if (!UUID.test(runId) || !/^[a-z]{1,20}$/.test(label)) throw new Error("Invalid synthetic fixture identity.");
  return `code3-delete-${runId}-${label}@example.test`;
}

export function assertSyntheticAccount(user, fixture, runId) {
  if (!UUID.test(runId) || !UUID.test(fixture.id || "") || user?.id !== fixture.id
    || user.email !== syntheticEmail(runId, fixture.label)
    || user.app_metadata?.code3_deletion_acceptance_run !== runId) {
    throw new Error("Refusing an account that was not created and stamped by this test run.");
  }
}

export function assertSyntheticPaths(bucket, paths, fixtures, runId) {
  if (!TEST_BUCKETS.includes(bucket) || !Array.isArray(paths) || paths.length > 100
    || paths.some(path => !fixtures.some(fixture => path === `users/${fixture.id}/code3-delete-${runId}/${bucket}.png`))) {
    throw new Error("Refusing to remove anything outside this run's exact synthetic file manifest.");
  }
}
