import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const appPath = path.join(process.cwd(), "src", "App.jsx");
const packagePath = path.join(process.cwd(), "package.json");
const migrationPath = path.join(process.cwd(), "supabase", "migrations", "20260523175234_workspace_invite_delivery_fix.sql");

const app = fs.readFileSync(appPath, "utf8");
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const migration = fs.readFileSync(migrationPath, "utf8");

function functionBody(name) {
  const match = migration.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`, "i"));
  assert.ok(match, `${name} function should exist`);
  return match[0];
}

const createInvite = functionBody("create_workspace_invite");
const acceptInvite = functionBody("accept_workspace_invite");

assert.match(migration, /alter table if exists public\.workspace_invites[\s\S]*add column if not exists expires_at timestamptz/i, "workspace invites should get optional expiration");
assert.match(migration, /grant select, insert, update on public\.workspace_invites to authenticated/i, "workspace_invites should be exposed to authenticated Data API with RLS");
assert.match(createInvite, /public\.can_manage_workspace\(target_workspace_id\)/i, "creating workspace invites must require workspace manager access");
assert.match(createInvite, /lower\(trim\(coalesce\(invite_email, ''\)\)\)/i, "invite email should be normalized lowercase");
assert.match(createInvite, /duplicate_pending := true/i, "duplicate pending invites should be handled cleanly");
assert.match(createInvite, /'invite_id', saved_invite\.id/i, "create RPC should return invite id");
assert.match(createInvite, /'invite_email', saved_invite\.email/i, "create RPC should return invite email");
assert.match(createInvite, /'workspace_id', saved_invite\.workspace_id/i, "create RPC should return workspace id");
assert.match(createInvite, /'email_sent', false/i, "create RPC must not claim email was sent");
assert.match(createInvite, /'delivery_method', 'copy_link'/i, "create RPC should surface copy-link delivery");
assert.match(createInvite, /'invite_path', '\/workspace-invite\/' \|\| saved_invite\.id::text/i, "create RPC should return a workspace invite path");

assert.match(acceptInvite, /where id = target_invite_id[\s\S]*for update/i, "accept RPC should lock invite row while claiming");
assert.match(acceptInvite, /target_invite\.status <> 'invited'/i, "accept RPC should reject already-used invites");
assert.match(acceptInvite, /target_invite\.expires_at is not null and target_invite\.expires_at <= now\(\)/i, "accept RPC should reject expired invites");
assert.match(acceptInvite, /lower\(target_invite\.email\) <> requester_email/i, "accept RPC should enforce invited email match");
assert.match(acceptInvite, /insert into public\.workspace_memberships/i, "accept RPC should create a real workspace membership");
assert.match(acceptInvite, /update public\.workspace_invites[\s\S]*status = 'active'/i, "accept RPC should mark invite as accepted");

assert.match(migration, /grant execute on function public\.create_workspace_invite\(uuid, text, text, text\) to authenticated/i, "authenticated users should be able to call create RPC subject to manager check");
assert.match(migration, /grant execute on function public\.accept_workspace_invite\(uuid\) to authenticated/i, "authenticated invitees should be able to call accept RPC");
assert.match(migration, /notify pgrst, 'reload schema'/i, "PostgREST schema should reload after RPC changes");

assert.match(app, /supabase\.rpc\("create_workspace_invite"/, "frontend invite form should call create_workspace_invite RPC");
assert.match(app, /target_workspace_id: workspace\.id/, "frontend should submit workspace id");
assert.match(app, /invite_email: email/, "frontend should submit normalized email");
assert.match(app, /invite_role: role/, "frontend should submit role");
assert.match(app, /workspaceInviteSending/, "frontend should expose invite loading state");
assert.match(app, /Email is not configured - copy and send this invite link/, "frontend should not claim email was sent when no sender exists");
assert.match(app, /Copy invite link/, "frontend should expose copy invite link action");
assert.match(app, /section === "workspace-invite"/, "workspace invite route should be recognized");
assert.match(app, /WORKSPACE_INVITE_SESSION_KEY/, "workspace invite id should be stored only in session while signing in");
assert.match(app, /supabase\.rpc\("accept_workspace_invite"/, "workspace invite route should accept through backend RPC");
assert.match(app, /This workspace invite was made for a different email/, "workspace invite email mismatch should be clear");
assert.doesNotMatch(app, />Send Invite</, "workspace invite UI should not say sent before email exists");

assert.equal(pkg.scripts["test:workspace-invites"], "node --no-warnings scripts/test-workspace-invites.mjs", "package script should run workspace invite tests");

console.log("Workspace invite tests passed.");
