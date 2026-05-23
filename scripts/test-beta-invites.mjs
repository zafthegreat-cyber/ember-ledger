import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.join(process.cwd(), "supabase", "migrations", "20260523151114_secure_beta_invites.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const service = fs.readFileSync(path.join(process.cwd(), "src", "services", "shorelineAccessService.js"), "utf8");
const app = fs.readFileSync(path.join(process.cwd(), "src", "App.jsx"), "utf8");

function functionBody(name) {
  const match = migration.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`, "i"));
  assert.ok(match, `${name} function should exist`);
  return match[0];
}

const createInvite = functionBody("admin_create_beta_invite");
const listInvites = functionBody("admin_list_beta_invites");
const revokeInvite = functionBody("admin_revoke_beta_invite");
const claimInvite = functionBody("claim_beta_invite");
const tableBlock = migration.match(/create table if not exists public\.beta_invites \([\s\S]*?\n\);/i)?.[0] || "";

assert.match(migration, /create table if not exists public\.beta_invites/i, "beta_invites table should exist");
assert.match(tableBlock, /token_hash text unique not null/i, "invite table should store token hashes");
assert.doesNotMatch(tableBlock, /\n\s*invite_token\s+text|\n\s*token\s+text/i, "invite table must not store plaintext tokens");
assert.match(migration, /alter table public\.beta_invites enable row level security/i, "RLS should be enabled");
assert.match(migration, /revoke all on table public\.beta_invites from public, anon, authenticated/i, "direct table access should be revoked");
assert.match(migration, /extensions\.digest\(trim\(coalesce\(raw_token, ''\)\), 'sha256'\)/i, "tokens should be hashed with SHA-256");

for (const body of [createInvite, listInvites, revokeInvite]) {
  assert.match(body, /if not public\.is_admin_or_moderator\(\)/i, "admin invite RPCs must require admin/moderator access");
}

assert.match(createInvite, /extensions\.gen_random_bytes\(32\)/i, "admin create should generate a strong random token");
assert.match(createInvite, /returns jsonb/i, "admin create should return a single JSON payload");
assert.match(createInvite, /'invite_token', raw_token/i, "admin create should return plaintext token once");
assert.match(createInvite, /public\.beta_invite_token_hash\(raw_token\)/i, "admin create should store a hash of the token");
assert.doesNotMatch(listInvites, /invite_token|token_hash/i, "admin list must not return plaintext tokens or hashes");
assert.doesNotMatch(revokeInvite, /invite_token|token_hash/i, "admin revoke must not return plaintext tokens or hashes");
assert.match(revokeInvite, /claimed_at is null/i, "claimed invites should not be revoked through the unused-invite path");

assert.match(claimInvite, /current_user_id uuid := \(select auth\.uid\(\)\)/i, "claim must use the authenticated user");
assert.match(claimInvite, /for update/i, "claim should lock the invite row");
assert.match(claimInvite, /claimed_at is null/i, "claim should require unclaimed invites");
assert.match(claimInvite, /revoked_at is null/i, "claim should reject revoked invites");
assert.match(claimInvite, /expires_at is null or i\.expires_at > now\(\)/i, "claim should reject expired invites");
assert.match(claimInvite, /Invite has already been claimed/i, "claim should reject reuse");
assert.match(claimInvite, /Invite link has expired/i, "claim should explain expired links");
assert.match(claimInvite, /Invite link is no longer active/i, "claim should explain revoked links");
assert.match(claimInvite, /Invite email does not match this account/i, "recipient email lock should be enforced");
assert.match(claimInvite, /set_config\('app\.shoreline_sync', 'true', true\)/i, "claim must use the existing safe beta gate sync bypass");
assert.match(claimInvite, /beta_status = case when claimed_invite\.grants_beta_access then 'approved'/i, "claim should approve beta_status only");
assert.match(claimInvite, /beta_access_status = case when claimed_invite\.grants_beta_access then 'approved'/i, "claim should approve beta_access_status only");
assert.match(claimInvite, /app_access = case when claimed_invite\.grants_beta_access then true/i, "claim should grant app access only when invite grants beta access");
assert.doesNotMatch(claimInvite, /\buser_role\s*=/i, "claim must not update user_role");
assert.doesNotMatch(claimInvite, /\bplan_tier\s*=/i, "claim must not update plan_tier");
assert.doesNotMatch(claimInvite, /\btier\s*=/i, "claim must not update tier");

assert.match(migration, /grant execute on function public\.claim_beta_invite\(text\) to authenticated/i, "authenticated users should be able to claim invites");
assert.match(migration, /revoke all on function public\.claim_beta_invite\(text\) from public, anon, authenticated/i, "claim RPC should not be public/anon");

assert.match(service, /admin_create_beta_invite/, "frontend service should call create invite RPC");
assert.match(service, /admin_list_beta_invites/, "frontend service should call list invite RPC");
assert.match(service, /admin_revoke_beta_invite/, "frontend service should call revoke invite RPC");
assert.match(service, /claim_beta_invite/, "frontend service should call claim invite RPC");
assert.match(service, /betaInviteClaimErrorMessage/, "friendly invite claim errors should be mapped");

assert.match(app, /section === "invite"/, "/invite/:token route should be recognized");
assert.match(app, /BETA_INVITE_SESSION_KEY/, "invite token should be stored session-only while signing in");
assert.match(app, /claimBetaInvite\(token\)/, "signed-in invite route should claim through backend RPC");
assert.match(app, /renderAdminBetaInviteManagement/, "admin invite UI should be rendered in Admin tools");
assert.match(app, /Raw invite tokens are shown only once/, "admin UI should explain one-time token display");

console.log("Beta invite tests passed.");
