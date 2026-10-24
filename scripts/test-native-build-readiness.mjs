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

check("all workflow actions use verified immutable official v4 commits", () => {
  const verified = {
    "actions/checkout": "11d5960a326750d5838078e36cf38b85af677262",
    "actions/setup-node": "49933ea5288caeca8642d1e84afbd3f7d6820020",
    "actions/setup-java": "cf277c60eb25467037889841efdb72551f06f6c3",
    "actions/upload-artifact": "ea165f8d65b6e75b540449e92b4886f43607fa02",
  };
  const uses = [...read(".github/workflows/native-beta-checks.yml").matchAll(/uses:\s*(\S+)@(\S+)/g)];
  assert.equal(uses.length, 7);
  for (const [, action, revision] of uses) assert.equal(revision, verified[action], `${action} must retain its reviewed full SHA`);
});

console.log(`Native build readiness: ${checks} checks passed; no build, account, network, signing or upload performed.`);
