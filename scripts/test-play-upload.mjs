// Automatic Play upload (Nov 15, 2026): CI may put a build into Play, but only as a
// draft on a testing track, so a person always starts the rollout.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ALLOWED_TRACKS, PACKAGE_NAME, draftRelease, main, parseArgs } from "./upload-play-bundle.mjs";

assert.equal(PACKAGE_NAME, "com.code3tcg.app");
assert.deepEqual([...ALLOWED_TRACKS].sort(), ["alpha", "beta", "internal"], "CI never uploads to production");
assert.throws(() => parseArgs(["build.aab", "--track", "production"]), /Track must be one of/);
assert.throws(() => parseArgs(["build.apk"]), /signed \.aab/);
assert.deepEqual(parseArgs(["b.aab", "--track", "internal", "--name", "14 (1.0.0)", "--notes", "Fixes"]),
  { bundle: "b.aab", track: "internal", name: "14 (1.0.0)", notes: "Fixes" });

const body = draftRelease({ versionCode: 14, name: "14 (1.0.0)", notes: "Fixes" });
assert.equal(body.releases[0].status, "draft", "releases are drafts; the owner starts the rollout");
assert.deepEqual(body.releases[0].versionCodes, ["14"]);
assert.deepEqual(body.releases[0].releaseNotes, [{ language: "en-US", text: "Fixes" }]);
assert.equal(draftRelease({ versionCode: 14 }).releases[0].releaseNotes, undefined, "no empty notes block");
assert.equal(draftRelease({ versionCode: 1, notes: "x".repeat(900) }).releases[0].releaseNotes[0].text.length, 500);

await assert.rejects(main(["b.aab"], {}), /PLAY_SERVICE_ACCOUNT_JSON is not set/);
await assert.rejects(main(["b.aab"], { PLAY_SERVICE_ACCOUNT_JSON: "{" }), /not valid JSON/);
await assert.rejects(main(["b.aab"], { PLAY_SERVICE_ACCOUNT_JSON: "{}" }), /missing client_email/);

const source = readFileSync(new URL("./upload-play-bundle.mjs", import.meta.url), "utf8");
assert.doesNotMatch(source, /status:\s*"(completed|inProgress)"/, "never starts a rollout");
assert.doesNotMatch(source, /console\.(log|error)\([^)]*private_key/, "never prints the key");

const workflow = readFileSync(new URL("../.github/workflows/android-release.yml", import.meta.url), "utf8").replace(/\r\n/g, "\n");
assert.match(workflow, /play_track:\n\s+description:[^\n]*\n\s+type: choice\n\s+options: \[alpha, internal, none\]/);
assert.match(workflow, /if: inputs\.play_track != 'none'/);
assert.match(workflow, /PLAY_SERVICE_ACCOUNT_JSON: \$\{\{ secrets\.PLAY_SERVICE_ACCOUNT_JSON \}\}/);
assert.match(workflow, /RELEASE_NOTES: \$\{\{ inputs\.release_notes \}\}/, "notes reach the script through env, not the shell line");
assert.doesNotMatch(workflow, /run:[^\n]*\$\{\{ inputs\.release_notes/, "no inputs pasted into shell commands");
assert.ok(workflow.indexOf("- name: Upload to Google Play") > workflow.indexOf("Collect signed packages"));
console.log("play upload: ok");
