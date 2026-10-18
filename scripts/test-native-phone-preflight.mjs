import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { collectPhoneReadiness, compareAssetTrees, probeHosted, validatePublicConfig } from "./native-phone-preflight.mjs";

const settings = { VITE_SUPABASE_URL: "https://synthetic-fixture.supabase.co", VITE_SUPABASE_ANON_KEY: "sb_publishable_synthetic_test_only" };
let assertions = 0;
const check = (name, run) => Promise.resolve().then(run).then(() => { assertions += 1; console.log(`PASS ${name}`); });
const jwt = claims => `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
await check("only public keys with a clean HTTPS origin are accepted", () => {
  assert.equal(validatePublicConfig(settings).ok, true);
  assert.equal(validatePublicConfig({ ...settings, VITE_SUPABASE_ANON_KEY: jwt({ role: "anon", ref: "synthetic-fixture" }) }).ok, true);
  for (const key of ["sb_secret_never_print_me", jwt({ role: "service_role" }), jwt({ role: "anon", ref: "wrong-project" }), "invalid"]) {
    const result = validatePublicConfig({ ...settings, VITE_SUPABASE_ANON_KEY: key });
    assert.equal(result.ok, false); assert.equal(JSON.stringify(result).includes(key), false);
  }
  for (const url of ["http://synthetic-fixture.supabase.co", "https://a:b@example.com", "https://example.com/?secret=x", "https://example.com/#fragment", "https://example.com:444"]) {
    assert.equal(validatePublicConfig({ ...settings, VITE_SUPABASE_URL: url }).ok, false);
  }
});

const base = resolve(tmpdir());
const root = mkdtempSync(resolve(base, "code3-phone-preflight-"));
const write = (path, value) => { const file = resolve(root, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value)); };
const config = { appId: "app.code3tcg.mobile", webDir: "dist-native", server: { hostname: "localhost", androidScheme: "https", iosScheme: "capacitor" }, android: { allowMixedContent: false, webContentsDebuggingEnabled: false }, ios: { webContentsDebuggingEnabled: false } };
const build = { builtAt: new Date().toISOString(), mode: "native-beta", accountServicesConfigured: true, apiOrigin: "https://code3tcg.app" };
try {
  for (const directory of ["dist-native", "android/app/src/main/assets/public", "ios/App/App/public"]) {
    write(`${directory}/index.html`, "<html>synthetic fixture</html>");
    write(`${directory}/assets/main.js`, `const url=${JSON.stringify(settings.VITE_SUPABASE_URL)};const key=${JSON.stringify(settings.VITE_SUPABASE_ANON_KEY)};`);
  }
  write("android/app/src/main/assets/capacitor.config.json", config);
  write("ios/App/App/capacitor.config.json", config);
  write("android/app/src/main/AndroidManifest.xml", '<manifest><data android:scheme="code3tcg" android:host="auth" android:path="/callback" /></manifest>');
  write("ios/App/App/Info.plist", "<key>CFBundleURLSchemes</key><array><string>code3tcg</string></array>");
  write("artifacts/native/web-build.json", build);
  const artifacts = ["Code3TCG-debug.apk", "Code3TCG-beta.aab"].map(name => {
    const bytes = Buffer.from(`synthetic ${name}; not a real package`);
    write(`artifacts/native/${name}`, bytes.toString());
    return { name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
  write("artifacts/native/release-verification.json", { artifacts });
  await check("local checks pass without network and never certify phone/store readiness", async () => {
    const report = await collectPhoneReadiness({ root, settings, fetchImpl: () => { throw new Error("Network must not be called"); } });
    assert.equal(report.automatedChecks, "passed"); assert.equal(report.phoneAcceptance, "unverified");
    assert.equal(report.storeReadiness, "not-established");
    assert.equal(report.checks.find(row => row.id === "hosted-native-api").status, "unverified");
    assert.equal(JSON.stringify(report).includes(settings.VITE_SUPABASE_ANON_KEY), false);
  });
  await check("smoke and mismatched account bundles are blocked", async () => {
    write("artifacts/native/web-build.json", { ...build, mode: "configuration-smoke-only", accountServicesConfigured: false });
    let report = await collectPhoneReadiness({ root, settings });
    assert.equal(report.checks.find(row => row.id === "native-web-build").status, "fail");
    write("artifacts/native/web-build.json", build);
    report = await collectPhoneReadiness({ root, settings: { ...settings, VITE_SUPABASE_ANON_KEY: "sb_publishable_changed" } });
    assert.equal(report.checks.find(row => row.id === "bundled-public-configuration").status, "fail");
  });
  await check("outdated platform assets, remote content and changed artifacts fail", async () => {
    write("ios/App/App/public/assets/main.js", "old assets");
    assert.equal(compareAssetTrees(resolve(root, "dist-native"), resolve(root, "ios/App/App/public")), false);
    write("android/app/src/main/assets/capacitor.config.json", { ...config, server: { ...config.server, url: "https://other.example" } });
    write("artifacts/native/Code3TCG-debug.apk", "changed artifact");
    const report = await collectPhoneReadiness({ root, settings });
    for (const id of ["ios-synced-assets", "android-configuration", "artifact Code3TCG-debug.apk"]) assert.equal(report.checks.find(row => row.id === id).status, "fail");
  });
  await check("newer source files require a rebuild rather than trusting old metadata", async () => {
    write("src/updated.js", "synthetic change");
    const later = new Date(Date.parse(build.builtAt) + 10_000);
    utimesSync(resolve(root, "src/updated.js"), later, later);
    const report = await collectPhoneReadiness({ root, settings });
    assert.equal(report.checks.find(row => row.id === "source-freshness").status, "fail");
  });
} finally {
  assert.ok(root.startsWith(`${base}${sep}code3-phone-preflight-`));
  rmSync(root, { recursive: true, force: true });
}

await check("hosted checks send only OPTIONS and unauthenticated GET without reading response data", async () => {
  const calls = [];
  const checks = await probeHosted(async (url, options) => {
    calls.push({ url, options });
    assert.ok(url.startsWith("https://code3tcg.app/api/"));
    assert.ok(["OPTIONS", "GET"].includes(options.method)); assert.equal(options.redirect, "manual");
    assert.equal(options.body, undefined); assert.equal(options.headers.Authorization, undefined); assert.equal(options.headers.Cookie, undefined);
    return new Response(null, { status: options.method === "OPTIONS" ? 204 : 401, headers: {
      "Access-Control-Allow-Origin": options.headers.Origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Content-Type": "application/json",
    } });
  });
  assert.equal(calls.length, 8); assert.ok(checks.every(check => check.status === "pass"));
});
await check("wildcard CORS, redirects, HTML fallbacks and unauthorized success never pass", async () => {
  for (const variant of ["wildcard", "redirect", "html", "public-success"]) {
    const checks = await probeHosted(async (_url, options) => new Response(null, { status: options.method === "OPTIONS" ? (variant === "redirect" ? 302 : 204) : (variant === "public-success" ? 200 : 401), headers: {
      "Access-Control-Allow-Origin": variant === "wildcard" ? "*" : options.headers.Origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Content-Type": variant === "html" ? "text/html" : "application/json",
    } }));
    assert.ok(checks.some(check => check.status === "fail"), variant);
  }
});
await check("connection errors are redacted and reported as incomplete", async () => {
  const checks = await probeHosted(async () => { throw new Error("secret synthetic-provider-value"); });
  assert.ok(checks.every(check => check.status === "fail"));
  assert.equal(JSON.stringify(checks).includes("synthetic-provider-value"), false);
});
console.log(`${assertions} phone readiness scenarios passed. No hosted requests or real account operations were performed.`);
