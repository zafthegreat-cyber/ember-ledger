import { readHostedDeletionConfig, assertAuthorizedTestConfig } from "./hostedDeletionGuard.mjs";

const issued = new WeakMap();
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{8,100}$/;
const PRODUCTION_APP_HOSTS = new Set([
  "code3tcg.app", "www.code3tcg.app", "ember-tide-tcg.vercel.app", "ember-tide.vercel.app",
  "ember-tide-tcg-zafthegreat-cybers-projects.vercel.app", "ember-tide-zafthegreat-cybers-projects.vercel.app",
  "ember-tide-dixlgjexv-zafthegreat-cybers-projects.vercel.app",
  "ember-tide-5f8nr3e9p-zafthegreat-cybers-projects.vercel.app",
]);
const PRODUCTION_DEPLOYMENT_IDS = new Set(["dpl_FsYtzWk5ZizgYHxGcpjMFzxvX3uK", "dpl_6oSr2qaSTVPZ1Yazo3kikQVCV9sD"]);
const EXTRA_FLAGS = new Set(["--app-origin", "--confirm-preview-origin", "--with-browser"]);
const APP_ROUTES = new Map([
  ["/app-version.json", new Set(["GET"])],
  ["/api/account/deletion/status", new Set(["GET", "OPTIONS"])],
  ["/api/account/deletion", new Set(["POST", "OPTIONS"])],
]);

export function previewOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Provide an exact immutable HTTPS Preview deployment origin."); }
  // An immutable deployment URL has a deployment suffix, unlike the stable
  // project and git-branch aliases. Syntax alone cannot prove Preview: the
  // operator must also review Vercel metadata and pin the deployment ID below.
  const deploymentHost = /^[a-z0-9][a-z0-9-]*-[a-z0-9]{9,10}-[a-z0-9][a-z0-9-]*\.vercel\.app$/;
  if (typeof value !== "string" || url.origin !== value || url.protocol !== "https:"
    || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash
    || PRODUCTION_APP_HOSTS.has(url.hostname) || !deploymentHost.test(url.hostname) || url.hostname.includes("-git-")) {
    throw new Error("Production domains, custom domains, aliases and non-HTTPS origins are forbidden.");
  }
  return url.origin;
}

export function readHostedDeletionHttpsConfig(env, argv) {
  const providerArgs = [], values = new Map(), seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!EXTRA_FLAGS.has(flag)) { providerArgs.push(flag); continue; }
    if (seen.has(flag)) throw new Error("Duplicate HTTPS acceptance options are forbidden.");
    seen.add(flag);
    if (flag === "--with-browser") continue;
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new Error("HTTPS acceptance option requires a value.");
    values.set(flag, value);
  }
  const provider = readHostedDeletionConfig(env, providerArgs);
  assertAuthorizedTestConfig(provider);
  const appOrigin = previewOrigin(values.get("--app-origin"));
  if (values.get("--confirm-preview-origin") !== appOrigin) throw new Error("Explicitly confirm the exact Preview origin.");
  const allowed = String(env.CODE3_DELETION_TEST_ALLOWED_APP_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  if (!allowed.length || !allowed.every(origin => previewOrigin(origin)) || !allowed.includes(appOrigin)) {
    throw new Error("Use an exact allowlist containing only reviewed immutable Preview origins.");
  }
  const denied = String(env.CODE3_DELETION_TEST_DENIED_APP_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  if (denied.includes(appOrigin)) throw new Error("A known Production deployment is forbidden.");
  const deploymentId = String(env.CODE3_DELETION_TEST_PREVIEW_DEPLOYMENT_ID || "");
  const deniedIds = String(env.CODE3_DELETION_TEST_DENIED_DEPLOYMENT_IDS || "").split(",").map(x => x.trim()).filter(Boolean);
  if (env.CODE3_DELETION_TEST_PREVIEW_TARGET !== "preview" || !DEPLOYMENT_ID.test(deploymentId)
    || PRODUCTION_DEPLOYMENT_IDS.has(deploymentId) || deniedIds.includes(deploymentId)) {
    throw new Error("Pin the deployment ID from independently reviewed Vercel Preview metadata; Production targets are forbidden.");
  }
  const previewOidcToken = String(env.CODE3_DELETION_TEST_PREVIEW_OIDC_TOKEN || "");
  if (previewOidcToken && (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(previewOidcToken) || previewOidcToken.length > 20_000)) {
    throw new Error("Use only an in-memory short-lived Preview OIDC token, never a key or header argument.");
  }
  if (previewOidcToken) {
    let claims;
    try { claims = JSON.parse(Buffer.from(previewOidcToken.split(".")[1], "base64url").toString("utf8")); } catch { /* rejected below */ }
    // This is input classification, not signature authentication. Vercel still
    // verifies the token. Refuse accidental Supabase keys in this destination.
    if (!claims || typeof claims !== "object" || claims.role || typeof claims.iss !== "string"
      || !/^https:\/\/oidc\.vercel\.com(?:\/[A-Za-z0-9_-]+)?$/.test(claims.iss)) {
      throw new Error("The optional Preview credential must be a Vercel OIDC token, not a provider key.");
    }
  }
  const config = Object.freeze({ projectRef: provider.projectRef, appOrigin, deploymentId, execute: provider.execute, withBrowser: seen.has("--with-browser") });
  issued.set(config, { provider, previewOidcToken });
  return config;
}

export function assertAuthorizedHttpsTestConfig(config) {
  if (!issued.has(config)) throw new Error("Fabricated HTTPS acceptance configurations are forbidden.");
}

export function isolatedProviderConfig(config) {
  assertAuthorizedHttpsTestConfig(config);
  return issued.get(config).provider;
}

export function previewAccessHeaders(config, destination, method = "GET") {
  assertAuthorizedHttpsTestConfig(config);
  const token = issued.get(config).previewOidcToken;
  if (!token) return {};
  let url;
  try { url = new URL(destination); } catch { return {}; }
  if (url.origin !== config.appOrigin || url.username || url.password || url.hash) return {};
  const verb = method.toUpperCase();
  const apiPath = !url.search && APP_ROUTES.get(url.pathname)?.has(verb);
  const publicPage = ["GET", "HEAD"].includes(verb) && !url.search && (
    ["/delete-account", "/privacy", "/support", "/manifest.webmanifest", "/favicon.ico"].includes(url.pathname)
    || url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/"));
  return apiPath || publicPage ? { "x-vercel-trusted-oidc-idp-token": token } : {};
}

export function assertPreviewVersion(config, value) {
  assertAuthorizedHttpsTestConfig(config);
  if (!value || typeof value !== "object" || Array.isArray(value) || value.app !== "code3-tcg"
    || typeof value.version !== "string" || !value.version.startsWith(`${config.deploymentId}-`)) {
    throw new Error("The served build does not match the independently reviewed immutable Preview deployment.");
  }
}

export function restrictedHttpsAppFetch(config, implementation = globalThis.fetch) {
  assertAuthorizedHttpsTestConfig(config);
  return (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const method = String(init.method || (typeof input === "object" && input.method) || "GET").toUpperCase();
    if (url.origin !== config.appOrigin || url.username || url.password || url.search || url.hash
      || !APP_ROUTES.get(url.pathname)?.has(method)) throw new Error("An HTTPS acceptance request tried to leave its reviewed endpoint.");
    const headers = new Headers(init.headers || (typeof input === "object" && input.headers) || {});
    if (url.pathname === "/app-version.json" && (headers.has("authorization") || headers.has("cookie"))) {
      throw new Error("Build identification never receives account credentials.");
    }
    if (headers.has("cookie")) throw new Error("Cookie credentials are forbidden in the acceptance runner.");
    for (const [name, value] of Object.entries(previewAccessHeaders(config, url.href, method))) headers.set(name, value);
    return implementation(input, { ...init, method, headers, credentials: "omit", cache: "no-store", redirect: "error",
      signal: AbortSignal.any([AbortSignal.timeout(180_000), ...(init.signal ? [init.signal] : [])]) });
  };
}

export async function readBoundedAcceptanceJson(response) {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new Error("The acceptance endpoint did not return JSON.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("A bounded JSON response body is required.");
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_768) throw new Error("The acceptance endpoint returned an oversized response.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error("The acceptance endpoint returned invalid JSON."); }
}
