import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  betaAccessAllowedForProfile,
  betaAccessStatusForProfile,
  normalizeBetaStatus,
} from "../src/utils/betaAccessUtils.js";

assert.equal(normalizeBetaStatus("approved"), "approved");
assert.equal(normalizeBetaStatus("paused"), "waitlist");
assert.equal(normalizeBetaStatus("unknown"), "not_requested");

assert.equal(betaAccessAllowedForProfile({ beta_access_status: "approved" }), true);
assert.equal(betaAccessAllowedForProfile({ app_access: true, beta_status: "pending" }), true);
assert.equal(betaAccessAllowedForProfile({ beta_access_status: "pending", app_access: false }), false);
assert.equal(betaAccessStatusForProfile({ user_role: "admin", beta_access_status: "denied" }), "approved");
assert.equal(betaAccessStatusForProfile({ beta_access_status: "denied" }), "denied");

const migrationPath = path.join(process.cwd(), "supabase", "migrations", "20260523124047_admin_beta_user_approval.sql");
const migration = fs.readFileSync(migrationPath, "utf8");

assert.match(migration, /admin_list_beta_access_profiles/, "admin profile list RPC should exist");
assert.match(migration, /admin_update_profile_beta_access/, "admin beta update RPC should exist");
assert.match(migration, /if not public\.is_admin_or_moderator\(\)/, "RPCs must require admin/moderator access");
assert.match(migration, /coalesce\(p\.user_role, 'user'\) not in \('admin', 'moderator'\)/, "beta approval must not mutate admin/moderator access");
assert.match(migration, /app_access = case when normalized_status = 'approved' then true else false end/, "approved users must pass the app access gate");
assert.doesNotMatch(migration, /set[^;]*(user_role|plan_tier|tier)\s*=/i, "beta approval must not grant admin, seller, or tier access");
assert.match(migration, /revoke all on function public\.admin_list_beta_access_profiles/, "list RPC should not be public");
assert.match(migration, /grant execute on function public\.admin_list_beta_access_profiles\(text\) to authenticated/, "authenticated admins should execute list RPC after internal admin check");

console.log("Beta user approval tests passed.");
