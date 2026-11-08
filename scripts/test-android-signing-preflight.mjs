import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const names = ["CODE3_ANDROID_KEYSTORE_BASE64", "CODE3_ANDROID_STORE_PASSWORD", "CODE3_ANDROID_KEY_ALIAS", "CODE3_ANDROID_KEY_PASSWORD"];
const baseEnv = { ...process.env };
for (const name of names) delete baseEnv[name];
for (const absent of [names, ...names.map(name => [name]), []]) {
  const env = { ...baseEnv };
  for (const name of names) env[name] = absent.includes(name) ? " " : "SYNTHETIC_PRIVATE_VALUE";
  const result = spawnSync(process.execPath, ["scripts/check-android-signing.mjs"], { env, encoding: "utf8" });
  assert.equal(result.status, absent.length ? 1 : 0);
  assert.doesNotMatch(result.stdout + result.stderr, /SYNTHETIC_PRIVATE_VALUE/);
  for (const name of absent) assert.ok(result.stderr.includes(name));
}
console.log("PASS Android signing preflight: all missing, each missing, complete, and no credential disclosure.");
