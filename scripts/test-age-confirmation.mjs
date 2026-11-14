// Audit 2026-11-14: every signed-in account confirms it is 13+ once
// (email sign-up records it; social sign-ins see a one-time card).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

async function load(entry) {
  const dir = mkdtempSync(join(tmpdir(), "age-")); const out = join(dir, "age.mjs");
  await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", jsx: "automatic", loader: { ".js": "jsx" }, plugins: [{ name: "css", setup(api) { api.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" })); } }], nodePaths: [join(process.cwd(), "node_modules")] });
  return import(pathToFileURL(out).href);
}

test("who needs to confirm their age", async () => {
  const { needsAgeConfirmation } = await load("src/features/auth/AgeConfirmationGate.jsx");
  assert.equal(needsAgeConfirmation(null), false, "signed out");
  assert.equal(needsAgeConfirmation({ id: "local-beta" }), false, "local beta mode");
  assert.equal(needsAgeConfirmation({ id: "u1", is_anonymous: true }), false, "anonymous session");
  assert.equal(needsAgeConfirmation({ id: "u1", user_metadata: {} }), true, "social sign-in without the confirmation");
  assert.equal(needsAgeConfirmation({ id: "u1", user_metadata: { age_confirmed_at: "2026-11-14T00:00:00Z" } }), false, "already confirmed");
});

test("email sign-up records the confirmation and the app renders the gate", () => {
  const app = src("src/App.jsx");
  assert.match(app, /age_confirmed_at: consentTimestamp/);
  assert.match(app, /<AgeConfirmationGate\s/);
  assert.match(src("src/services/betaReadinessService.js"), /I am 13 or older/);
});
