import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { MINIMUM_NATIVE_BUILD_NUMBER, resolveNativeBuildNumber } from "./native-build-number.mjs";

const read = path => readFileSync(resolve(path), "utf8");
let checks = 0;
function check(name, run) { run(); checks++; console.log(`PASS ${name}`); }

check("build floor starts after historical build 6; explicit future numbers are retained", () => {
  assert.equal(MINIMUM_NATIVE_BUILD_NUMBER, 7);
  assert.equal(resolveNativeBuildNumber(undefined), 7);
  assert.equal(resolveNativeBuildNumber(""), 7);
  for (const value of ["7", "8", "123456", "999999999"]) assert.equal(resolveNativeBuildNumber(value), Number(value));
});

check("old, missing required, malformed and unsafe build numbers fail closed", () => {
  for (const value of ["0", "1", "6", "07", "7.0", "7e0", " 7", "7 ", "-7", "1000000000", "NaN", "7;echo x", null, false]) {
    assert.throws(() => resolveNativeBuildNumber(value), /CODE3_BUILD_NUMBER/);
  }
  for (const value of [undefined, ""]) assert.throws(() => resolveNativeBuildNumber(value, { required: true }), /CODE3_BUILD_NUMBER/);
});

check("real command rejects an old CI input without starting a builder", () => {
  const result = spawnSync(process.execPath, ["scripts/native-build-number.mjs"], { encoding: "utf8", env: { ...process.env, CODE3_BUILD_NUMBER: "6" } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CODE3_BUILD_NUMBER/);
  assert.equal(result.stdout, "");
});

check("web build metadata and both signing/simulator commands use the checked number", () => {
  const web = read("scripts/native-build.mjs");
  assert.ok(web.indexOf("resolveNativeBuildNumber(settings.CODE3_BUILD_NUMBER)") < web.indexOf("await build("));
  assert.match(web, /buildNumber, sourceCommit: process\.env\.GITHUB_SHA/);
  assert.match(read("scripts/native-release.mjs"), /resolveNativeBuildNumber\(process\.env\.CODE3_BUILD_NUMBER, \{ required: true \}\)/);
  const simulator = read("scripts/native-ios-simulator-smoke.mjs");
  assert.match(simulator, /CURRENT_PROJECT_VERSION=\$\{buildNumber\}/);
  assert.match(simulator, /CODE_SIGNING_ALLOWED=NO/);
  assert.match(simulator, /configuration-smoke-only/);
});

check("platform defaults stay above build 6 and Android rejects an old override", () => {
  const android = read("android/app/build.gradle");
  assert.match(android, /System\.getenv\('CODE3_BUILD_NUMBER'\) \?: '7'/);
  assert.match(android, /code3BuildNumber\.toInteger\(\) < 7/);
  assert.match(android, /versionCode = code3BuildNumber\.toInteger\(\)/);
  const ios = [...read("ios/App/App.xcodeproj/project.pbxproj").matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map(match => Number(match[1]));
  assert.deepEqual(ios, [7, 7]);
});

check("cloud debug delivery is labeled, public-configured and does not become store signing", () => {
  const workflow = read(".github/workflows/native-beta-checks.yml");
  assert.match(workflow, /build_number:/);
  assert.equal((workflow.match(/node scripts\/native-build-number\.mjs/g) || []).length, 2);
  assert.match(workflow, /vars\.VITE_SUPABASE_URL/);
  assert.match(workflow, /vars\.VITE_SUPABASE_ANON_KEY/);
  assert.ok(!workflow.includes("secrets."));
  assert.match(workflow, /assembleDebug testDebugUnitTest/);
  assert.match(workflow, /not-an-upgrade-or-play-release/);
  assert.match(workflow, /SHA256SUMS\.txt/);
  assert.match(workflow, /not-for-testflight/);
  assert.match(read("docs/mobile-beta/BETA_PACKAGE_READINESS_2026-10-24.md"), /Do not uninstall|do not uninstall/);
});

check("all workflow actions use verified immutable official Node 24 commits (checkout v7.0.1, setup-node v7.1.0, setup-java v6.3.0, upload-artifact v7.0.2; Nov 23, 2026)", () => {
  const verified = {
    "actions/checkout": "3d3c42e5aac5ba805825da76410c181273ba90b1",
    "actions/setup-node": "949feb2413d6458794dcd2491c4babbbce0c15c1",
    "actions/setup-java": "d1374f8ac74474200d16ef8ecee22c7ae7a51880",
    "actions/upload-artifact": "cf430e030ddbb5b0abf93d22962f4752f3646cd9",
  };
  const uses = [...read(".github/workflows/native-beta-checks.yml").matchAll(/uses:\s*(\S+)@(\S+)/g)];
  assert.equal(uses.length, 7);
  for (const [, action, revision] of uses) assert.equal(revision, verified[action], `${action} must retain its reviewed full SHA`);
  const releaseUses = [...read(".github/workflows/android-release.yml").matchAll(/uses:\s*(\S+)@(\S+)/g)];
  assert.equal(releaseUses.length, 4);
  for (const [, action, revision] of releaseUses) assert.equal(revision, verified[action], `${action} must retain its reviewed full SHA`);
});

check("signed Android build is manual-only, checks the build number and never keeps the upload key", () => {
  const workflow = read(".github/workflows/android-release.yml").replace(/\r\n/g, "\n");
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^  (push|pull_request|schedule):/m, "signing must never run automatically");
  assert.match(workflow, /node scripts\/native-build-number\.mjs/);
  assert.match(workflow, /secrets\.CODE3_ANDROID_KEYSTORE_BASE64/);
  assert.ok(workflow.indexOf("Check signing configuration") < workflow.indexOf("- run: npm ci"));
  assert.match(workflow, /run: node scripts\/check-android-signing\.mjs/);
  assert.match(workflow, /- name: Collect signed packages\n\s+run:/);
  assert.match(workflow, /bundleRelease assembleRelease/);
  assert.match(workflow, /if: always\(\)\n\s+run: \|\n\s+rm -f "\$RUNNER_TEMP\/code3-upload\.keystore"/);
  assert.doesNotMatch(workflow, /path:[^\n]*keystore|cat [^\n]*keystore/);
});

check("iOS TestFlight build is manual-only, pinned, checks the build number and never keeps the API key", () => {
  const workflow = read(".github/workflows/ios-release.yml").replace(/\r\n/g, "\n");
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^  (push|pull_request|schedule):/m, "uploads must never run automatically");
  assert.match(workflow, /node scripts\/native-build-number\.mjs/);
  assert.match(workflow, /CURRENT_PROJECT_VERSION="\$CODE3_BUILD_NUMBER"/);
  assert.match(workflow, /<key>method<\/key><string>app-store-connect<\/string>/);
  assert.match(workflow, /if: always\(\)\n\s+run: \|\n\s+rm -f "\$RUNNER_TEMP\/code3-asc\.p8"/);
  assert.doesNotMatch(workflow, /path:[^\n]*\.p8|cat [^\n]*\.p8|echo "\$ASC_PRIVATE_KEY"/);
  const verified = ["3d3c42e5aac5ba805825da76410c181273ba90b1", "949feb2413d6458794dcd2491c4babbbce0c15c1", "cf430e030ddbb5b0abf93d22962f4752f3646cd9"];
  const uses = [...workflow.matchAll(/uses:\s*\S+@(\S+)/g)].map(match => match[1]);
  assert.deepEqual(uses, verified);
});

check("App Store package settings: no alpha in the icon, encryption declared, iPhone only", () => {
  const icon = readFileSync(resolve("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"));
  assert.equal(icon[25], 2, "the App Store icon must be RGB with no alpha channel");
  assert.match(read("ios/App/App/Info.plist"), /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
  const project = read("ios/App/App.xcodeproj/project.pbxproj");
  assert.equal((project.match(/TARGETED_DEVICE_FAMILY = 1;/g) || []).length, 2);
});

console.log(`Native build readiness: ${checks} checks passed; no build, account, network, signing or upload performed.`);

// Audit 2026-11-14: release builds do not write Capacitor debug logs or allow WebView debugging.
{
  const { readFileSync } = await import("node:fs");
  const capacitorConfig = JSON.parse(readFileSync(new URL("../capacitor.config.json", import.meta.url), "utf8"));
  if (capacitorConfig.loggingBehavior !== "none") throw new Error("capacitor.config.json loggingBehavior must be \"none\" for release builds");
  if (capacitorConfig.android?.webContentsDebuggingEnabled !== false || capacitorConfig.ios?.webContentsDebuggingEnabled !== false) throw new Error("WebView debugging must stay off");
}
