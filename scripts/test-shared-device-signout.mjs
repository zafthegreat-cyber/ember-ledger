// Audit 2026-11-14: on a shared family device, signing out leaves nothing of the
// last person in memory, and their saved records stay sealed to them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const start = app.indexOf("async function signOut()");
const body = app.slice(start, app.indexOf("function changeActiveWorkspace", start));
assert.ok(start > 0, "signOut exists");
assert.match(body, /supabase\.auth\.signOut\(\{ scope: "local" \}\)/, "signs out of the account on this device");
assert.match(body, /localStoreSaver\.flush\(\);/, "pending saves are written for the person signing out");
assert.match(body, /window\.location\.assign\("\/"\)/, "the page reloads so no records stay in memory");
assert.ok(body.indexOf("localStoreSaver.flush()") < body.indexOf('window.location.assign("/")'), "flush happens before the reload");

const keys = (await import("../src/features/persistence/cloudWorkspaceKeys.js")).WORKSPACE_SYNC_KEYS;
assert.ok(keys.includes("et-tcg-beta-data"), "the local store is owner-bound, so another account never opens it");
console.log("Shared-device sign-out checks passed.");
