import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";

const APP_ID = "app.code3tcg.mobile";
const API_ORIGIN = "https://code3tcg.app";
const ORIGINS = ["capacitor://localhost", "https://localhost"];
const ROUTES = ["/api/account/deletion/status", "/api/auth/session"];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const readJson = path => JSON.parse(readFileSync(path, "utf8"));

// Never return environment values or decoded claims: reports can be shared.
export function validatePublicConfig(settings) {
  const url = String(settings.VITE_SUPABASE_URL || "");
  const key = String(settings.VITE_SUPABASE_ANON_KEY || "");
  if (!url || !key) return { ok: false, detail: "Missing public native Supabase URL/key. Account testing is blocked." };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error();
    if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return { ok: true, detail: "Public publishable configuration has an HTTPS origin. Its project must match the existing account." };
    const parts = key.split(".");
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (claims.role !== "anon") throw new Error();
    if (parsed.hostname.endsWith(".supabase.co") && claims.ref && parsed.hostname !== `${claims.ref}.supabase.co`) throw new Error();
    return { ok: true, detail: "Public anon configuration has an HTTPS origin and matching project claim where available." };
  } catch {
    return { ok: false, detail: "Native account configuration is not an accepted public key/HTTPS origin or has mismatched project claims. Values were not printed." };
  }
}

function filesIn(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Unexpected symlink in build inputs.");
    return entry.isDirectory() ? filesIn(path) : entry.isFile() ? [path] : [];
  });
}

export function compareAssetTrees(source, destination) {
  const files = filesIn(source);
  if (!files.length || !existsSync(resolve(source, "index.html"))) return false;
  return files.every(path => {
    const other = resolve(destination, relative(source, path));
    return existsSync(other) && sha256(readFileSync(path)) === sha256(readFileSync(other));
  });
}

export async function probeHosted(fetchImpl = fetch) {
  const checks = [];
  for (const origin of ORIGINS) {
    for (const route of ROUTES) {
      const id = `${origin} ${route}`;
      try {
        const preflight = await fetchImpl(`${API_ORIGIN}${route}`, {
          method: "OPTIONS", redirect: "manual", signal: AbortSignal.timeout(12_000),
          headers: { Origin: origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization,content-type" },
        });
        const methods = String(preflight.headers.get("access-control-allow-methods") || "").toUpperCase().split(/\s*,\s*/);
        const headers = String(preflight.headers.get("access-control-allow-headers") || "").toLowerCase().split(/\s*,\s*/);
        const allowed = preflight.status === 204 && preflight.headers.get("access-control-allow-origin") === origin
          && methods.includes("GET") && headers.includes("authorization") && headers.includes("content-type");
        checks.push({ id: `cors ${id}`, scope: "hosted", status: allowed ? "pass" : "fail", detail: allowed ? "Exact native origin and authenticated request headers accepted." : "Native preflight is not ready; verify reviewed API deployment and CODE3_NATIVE_CLIENT_ENABLED=true." });
        if (!allowed) continue;
        // Deliberately no bearer, cookies, account ID, or request body. A 401 is
        // the expected safe boundary, not evidence that a real account works.
        const response = await fetchImpl(`${API_ORIGIN}${route}`, {
          method: "GET", redirect: "manual", signal: AbortSignal.timeout(12_000), headers: { Origin: origin },
        });
        const denied = response.status === 401 && response.headers.get("access-control-allow-origin") === origin
          && /application\/json/i.test(response.headers.get("content-type") || "");
        checks.push({ id: `auth boundary ${id}`, scope: "hosted", status: denied ? "pass" : "fail", detail: denied ? "Unauthenticated GET rejected as JSON. No account was accessed." : "Expected a JSON 401 with the exact native origin; received another status/content type. No response body was retained." });
      } catch {
        checks.push({ id: `reachability ${id}`, scope: "hosted", status: "fail", detail: "Public endpoint could not be verified within the timeout. No account was accessed." });
      }
    }
  }
  return checks;
}

export async function collectPhoneReadiness({ root = process.cwd(), settings = {}, hosted = false, fetchImpl = fetch } = {}) {
  const checks = [];
  const add = (id, pass, detail, scope = "local") => checks.push({ id, scope, status: pass ? "pass" : "fail", detail });
  const attempt = (id, run) => { try { run(); } catch { add(id, false, "Required local file is absent, unreadable, or malformed. No file contents were printed."); } };
  const configCheck = validatePublicConfig(settings);
  add("public-account-configuration", configCheck.ok, configCheck.detail);
  let builtAt;
  attempt("native-web-build", () => {
    const build = readJson(resolve(root, "artifacts/native/web-build.json"));
    builtAt = Date.parse(build.builtAt);
    add("native-web-build", build.mode === "native-beta" && build.accountServicesConfigured === true && build.apiOrigin === API_ORIGIN && Number.isFinite(builtAt),
      "Phone account tests require the configured native-beta bundle. Configuration-smoke-only bundles are not distributable.");
  });
  const source = resolve(root, "dist-native");
  attempt("bundled-public-configuration", () => {
    const js = filesIn(source).filter(path => path.endsWith(".js")).map(path => readFileSync(path, "utf8")).join("\n");
    add("bundled-public-configuration", configCheck.ok && js.includes(String(settings.VITE_SUPABASE_URL)) && js.includes(String(settings.VITE_SUPABASE_ANON_KEY)),
      "Built JavaScript must contain the intended public account configuration; equality is checked without outputting the key.");
  });
  for (const [platform, configPath, assetPath] of [
    ["android", "android/app/src/main/assets/capacitor.config.json", "android/app/src/main/assets/public"],
    ["ios", "ios/App/App/capacitor.config.json", "ios/App/App/public"],
  ]) {
    attempt(`${platform}-configuration`, () => {
      const config = readJson(resolve(root, configPath));
      add(`${platform}-configuration`, config.appId === APP_ID && config.webDir === "dist-native" && !config.server?.url
        && config.server?.hostname === "localhost" && config.server?.androidScheme === "https" && config.server?.iosScheme === "capacitor"
        && config.android?.allowMixedContent === false && config.android?.webContentsDebuggingEnabled === false && config.ios?.webContentsDebuggingEnabled === false,
      "Synced native config must use the expected app ID, bundled content, exact local origins and restricted WebView settings.");
      add(`${platform}-synced-assets`, compareAssetTrees(source, resolve(root, assetPath)), "Every generated web asset must byte-match the platform's copied asset. Re-run platform sync after rebuilding if it does not.");
    });
  }
  attempt("native-callback-registration", () => {
    const manifest = readFileSync(resolve(root, "android/app/src/main/AndroidManifest.xml"), "utf8");
    const plist = readFileSync(resolve(root, "ios/App/App/Info.plist"), "utf8");
    add("native-callback-registration", /<data\s+android:scheme="code3tcg"\s+android:host="auth"\s+android:path="\/callback"\s*\/>/.test(manifest)
      && /<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>code3tcg<\/string>/.test(plist),
    "Source registrations cover the app callback. Actual link delivery still requires each phone.");
  });
  attempt("source-freshness", () => {
    const inputs = ["src", "public"].flatMap(directory => filesIn(resolve(root, directory)));
    inputs.push(...["package.json", "package-lock.json", "index.html", "capacitor.config.json", "vite.config.js", "vite.config.ts", "scripts/native-build.mjs"].map(path => resolve(root, path)).filter(existsSync));
    const newer = inputs.filter(path => statSync(path).mtimeMs > builtAt + 2_000);
    add("source-freshness", Number.isFinite(builtAt) && newer.length === 0,
      newer.length ? `${newer.length} build input(s) are newer than the bundle; rebuild/sync and reverify artifacts after final changes. Timestamps are a conservative check, not source provenance.` : "No build input has a newer timestamp. This is not proof of Git provenance or current server prices.");
  });
  attempt("android-artifact-integrity", () => {
    const evidence = readJson(resolve(root, "artifacts/native/release-verification.json"));
    for (const name of ["Code3TCG-debug.apk", "Code3TCG-beta.aab"]) {
      const recorded = evidence.artifacts?.find(artifact => artifact.name === name);
      const path = resolve(root, "artifacts/native", name);
      add(`artifact ${name}`, Boolean(recorded) && existsSync(path) && recorded.bytes === statSync(path).size && recorded.sha256 === sha256(readFileSync(path)),
        "Package bytes must match the recorded verified artifact. This does not reverify its signature or prove current source is inside it.");
    }
  });
  checks.push({ id: "ios-distribution", scope: "manual", status: "unverified", detail: "The successful unsigned simulator app cannot be installed on an iPhone. Apple enrollment, configured signed archive and TestFlight delivery remain separate gates." });
  checks.push({ id: "hosted-auth-redirects", scope: "manual", status: "unverified", detail: "Verify Supabase allows code3tcg://auth/callback?flow=signin and code3tcg://auth/callback?flow=recovery, preserves the website Site URL, and email templates honor redirectTo. This tool does not inspect or change hosted auth settings." });
  checks.push({ id: "hosted-privacy-deletion", scope: "manual", status: "unverified", detail: "Complete staged deletion/provider and private-receipt rollout checks. A 401 cannot prove feature flags, migrations or authorized file access." });
  checks.push({ id: "existing-data-and-latest-prices", scope: "manual", status: "unverified", detail: "Preserve the PWA; compare the same account's transfer IDs/content and attachment hashes on both phones. Check live price timestamps/source separately. No user data or prices are read or changed by this tool." });
  if (hosted) checks.push(...await probeHosted(fetchImpl));
  else checks.push({ id: "hosted-native-api", scope: "hosted", status: "unverified", detail: "Not requested. --hosted performs only public OPTIONS and unauthenticated GET against https://code3tcg.app; no secrets or account operations." });
  const failures = checks.filter(check => check.status === "fail").length;
  return { checkedAt: new Date().toISOString(), appId: APP_ID, apiOrigin: API_ORIGIN,
    automatedChecks: failures ? "failed" : "passed", failedChecks: failures,
    phoneAcceptance: "unverified", storeReadiness: "not-established", checks };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !["--hosted", "--json", "--help"].includes(arg))) throw new Error("Use --hosted, --json or --help. No account credentials are accepted.");
  if (args.includes("--help")) {
    console.log("node scripts/native-phone-preflight.mjs [--hosted] [--json]\nChecks existing local artifacts without rebuilding, signing in or changing records. --hosted adds public OPTIONS/unauthenticated GET checks. A pass is not physical-device or store acceptance.");
    return;
  }
  const { loadEnv } = await import("vite");
  const settings = { ...loadEnv("native", process.cwd(), "VITE_"), ...process.env };
  const report = await collectPhoneReadiness({ settings, hosted: args.includes("--hosted") });
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Code 3 TCG phone preflight: automated checks ${report.automatedChecks}. Physical-device acceptance remains unverified.`);
    for (const check of report.checks) console.log(`[${check.status.toUpperCase()}] ${check.id}: ${check.detail}`);
  }
  if (report.failedChecks) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error("Phone preflight could not finish. Check local input files; configuration values were not printed."); process.exitCode = 1; });
}
