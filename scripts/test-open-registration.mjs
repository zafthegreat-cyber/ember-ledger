import assert from "node:assert/strict";
import test from "node:test";
import { withVerifiedAppAccess, hasServerAppAccessDecision } from "../src/features/auth/memberAccess.mjs";
import { betaAccessAllowedForProfile } from "../src/utils/betaAccessUtils.js";

const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const other = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
function fixture({ allowed = true, error = null, switchAccount = false, verifiedId = id } = {}) {
  let reads = 0; const calls = [];
  return { calls, client: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: ++reads > 1 && switchAccount ? other : id }, access_token: reads > 1 && switchAccount ? "changed-fixture" : "private-fixture" } } }),
      getUser: async token => { assert.equal(token, "private-fixture"); return { data: { user: { id: verifiedId } } }; },
    },
    rpc: name => { calls.push(name); return { setHeader: async (name, value) => { assert.equal(name, "Authorization"); assert.equal(value, "Bearer private-fixture"); return { data: allowed, error }; } }; },
  } };
}
const profile = () => ({ id, userId: id, appAccess: false, betaStatus: "not_requested", appRole: "user", tier: "free" });

test("an ordinary confirmed member can enter without beta approval when the server permits it", async () => {
  const f = fixture(), original = profile();
  const result = await withVerifiedAppAccess(original, { id }, f.client);
  assert.equal(betaAccessAllowedForProfile(result), true);
  assert.equal(hasServerAppAccessDecision(result, id), true);
  assert.equal(result.appAccess, false); assert.equal(result.betaStatus, "not_requested");
  assert.equal(result.appRole, "user"); assert.equal(result.tier, "free");
  assert.equal(original.serverAppAccess, undefined);
  assert.deepEqual(f.calls, ["has_full_app_access"]);
});
test("a server restriction overrides stale approved profile flags", async () => {
  const f = fixture({ allowed: false });
  const result = await withVerifiedAppAccess({ ...profile(), appAccess: true, betaStatus: "approved" }, { id }, f.client);
  assert.equal(hasServerAppAccessDecision(result, id), true);
  assert.equal(betaAccessAllowedForProfile(result), false);
});
test("an account switch cannot reuse another account's enrollment decision", async () => {
  const result = await withVerifiedAppAccess(profile(), { id }, fixture({ switchAccount: true }).client);
  assert.equal(hasServerAppAccessDecision(result, id), false);
  assert.equal(betaAccessAllowedForProfile(result), false);
});
test("a browser session's claimed identity cannot substitute for the verified server user", async () => {
  const f = fixture({ verifiedId: other });
  const result = await withVerifiedAppAccess(profile(), { id }, f.client);
  assert.equal(result.serverAppAccess, false); assert.equal(f.calls.length, 0);
});
test("cross-account profiles, malformed RPC results and service errors fail closed", async () => {
  const f = fixture();
  const foreign = await withVerifiedAppAccess({ ...profile(), id: other, userId: other }, { id }, f.client);
  assert.equal(foreign.serverAppAccess, false); assert.equal(f.calls.length, 0);
  for (const options of [{ allowed: "true" }, { error: { message: "private error" } }]) {
    const result = await withVerifiedAppAccess(profile(), { id }, fixture(options).client);
    assert.equal(hasServerAppAccessDecision(result, id), false);
    assert.equal(betaAccessAllowedForProfile(result), false);
  }
});
test("unverified profile fields cannot manufacture a server access decision", async () => {
  const result = await withVerifiedAppAccess({ ...profile(), serverAppAccess: true, serverAppAccessCheckedFor: id }, { id }, fixture({ error: true }).client);
  assert.equal(hasServerAppAccessDecision(result, id), false);
  assert.equal(betaAccessAllowedForProfile(result), false);
  assert.equal(hasServerAppAccessDecision({ ...profile(), serverAppAccessCheckedFor: other }, id), false);
});
