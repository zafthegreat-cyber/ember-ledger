import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const database = `code3_test_invites_${randomUUID().replaceAll("-", "")}`;
if (!/^code3_test_invites_[a-f0-9]{32}$/.test(database)) throw new Error("Unsafe test database name refused");
const connection = { host: "127.0.0.1", port: Number(process.env.CODE3_TEST_PG_PORT || 55439), user: process.env.CODE3_TEST_PG_USER || "code3qa", database: "postgres" };
const admin = new pg.Client(connection); await admin.connect(); await admin.query(`create database ${database}`);
const db = new pg.Client({ ...connection, database });
let checks = 0;
try {
  await db.connect();
  await db.query(`
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    create schema auth; create schema extensions; create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users, not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to authenticated,anon;
    create table public.profiles(id uuid primary key references auth.users, email text, display_name text, app_role text default 'user', user_role text default 'user', tier text default 'free', plan_tier text default 'free', beta_status text default 'not_requested', beta_access_status text default 'approved', app_access boolean default false, beta_access_requested_at timestamptz, beta_access_approved_at timestamptz, beta_access_approved_by uuid, beta_access_notes text, little_sparks_status text, updated_at timestamptz default now());
    create function public.normalized_app_role(value text) returns text language sql stable as $$ select case when value in ('owner','admin','moderator','beta_user') then value else 'user' end $$;
    create function public.current_app_role() returns text language sql stable as $$ select coalesce((select app_role from public.profiles where id=auth.uid()),'user') $$;
    create function public.is_admin_or_moderator() returns boolean language sql stable as $$ select public.current_app_role() in ('owner','admin','moderator') $$;
    create function public.prevent_profile_role_tier_self_update() returns trigger language plpgsql as $$ begin return new; end $$;
    create trigger prevent_profile_role_tier_self_update before update on public.profiles for each row execute function public.prevent_profile_role_tier_self_update();
    alter table public.profiles enable row level security;
    grant select,insert,update on public.profiles to authenticated;
    create policy own_rows on public.profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
    create table public.workspaces(id uuid primary key, owner_user_id uuid, created_by uuid, label text);
    create table public.workspace_members(id uuid primary key default gen_random_uuid(), workspace_id uuid, user_id uuid, role text, status text);
    create table public.workspace_memberships(id uuid primary key default gen_random_uuid(), workspace_id uuid, user_id uuid, email text, role text, status text, invited_by uuid, accepted_at timestamptz, created_at timestamptz default now());
    create table public.workspace_invites(id uuid primary key default gen_random_uuid(), workspace_id uuid, email text, role text, status text, invited_by uuid, accepted_at timestamptz, expires_at timestamptz, created_at timestamptz default now());
    create table public.beta_invites(id uuid primary key default gen_random_uuid(), token_hash text, recipient_name text, recipient_email text, note text, created_by uuid, created_at timestamptz default now(), expires_at timestamptz, claimed_by uuid, claimed_email text, claimed_at timestamptz, revoked_at timestamptz, audience text default 'beta', grants_beta_access boolean default true);
  `);
  const fixture = await readFile(new URL("./fixtures/hosted-workspace-invite-functions.sql", import.meta.url), "utf8");
  // SQL-language helper references resolve at creation, so install its dependency first.
  const roleDefinition = fixture.match(/CREATE OR REPLACE FUNCTION public\.workspace_role_for[\s\S]*?\$function\$;/)[0];
  await db.query(roleDefinition); await db.query(fixture);
  await db.query("create trigger prevent_self_access_escalation before update on public.profiles for each row execute function public.prevent_self_access_escalation()");
  const owner = randomUUID(), member = randomUUID(), newcomer = randomUUID(), outsider = randomUUID();
  const sessions = new Map([owner, member, newcomer, outsider].map((id) => [id, randomUUID()]));
  for (const [id, sid] of sessions) {
    await db.query("insert into auth.users values($1,$2,now(),null,null)", [id, `${id}@example.test`]);
    await db.query("insert into auth.sessions values($1,$2,null)", [sid, id]);
  }
  for (const id of [owner, member, outsider]) await db.query("insert into public.profiles(id,email,beta_access_status,tier,plan_tier) values($1,$2,'not_requested',$3,$3)", [id, `${id}@example.test`, id === member ? "existing-paid" : "free"]);
  const workspace = randomUUID();
  await db.query("insert into public.workspaces values($1,$2,$2,'original-workspace')", [workspace, owner]);
  await db.query("insert into public.workspace_members(workspace_id,user_id,role,status) values($1,$2,'viewer','active')", [workspace, member]);
  await db.query("insert into public.workspace_memberships(workspace_id,user_id,role,status) values($1,$2,'editor','active')", [workspace, member]);
  const acceptId = randomUUID();
  await db.query("insert into public.workspace_invites(id,workspace_id,email,role,status,expires_at) values($1,$2,$3,'viewer','invited',now()+interval '1 day')", [acceptId, workspace, `${newcomer}@example.test`]);
  const tokens = { member: "existing-account-invite-token".padEnd(40, "x"), newcomer: "new-account-invite-token".padEnd(40, "x"), revoked: "revoked-session-invite-token".padEnd(40, "x"), wrong: "different-email-invite-token".padEnd(40, "x") };
  for (const [name, token] of Object.entries(tokens)) {
    const recipient = name === "newcomer" ? newcomer : name === "wrong" ? outsider : member;
    await db.query("insert into public.beta_invites(token_hash,recipient_email,expires_at,created_by) values(public.beta_invite_token_hash($1),$2,now()+interval '1 day',$3)", [token, `${recipient}@example.test`, owner]);
  }
  await db.query(await readFile(new URL("../supabase/migrations/20261017192845_code3_account_sessions_and_role_protection.sql", import.meta.url), "utf8"));
  async function claims(id = member, overrides = {}) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id, session_id: sessions.get(id), email: `${id}@example.test`, exp: Date.now() / 1000 + 3600, role: "authenticated", ...overrides })]);
    await db.query("set role authenticated");
  }
  async function rpc(name, args = []) { return (await db.query(`select to_jsonb(public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")})) as value`, args)).rows[0]?.value; }
  await claims();
  await assert.rejects(rpc("claim_beta_invite", [tokens.member]), /New profiles require the default/); checks++;
  await db.query("reset role");
  const tables = ["profiles", "workspaces", "workspace_members", "workspace_memberships", "workspace_invites", "beta_invites"];
  const before = {};
  for (const table of tables) before[table] = (await db.query(`select * from public.${table} order by id`)).rows;
  await db.query(await readFile(new URL("../supabase/migrations/20261017194110_code3_workspace_invite_session_guards.sql", import.meta.url), "utf8"));
  for (const table of tables) { assert.deepEqual((await db.query(`select * from public.${table} order by id`)).rows, before[table]); checks++; }
  await claims(owner);
  for (const helper of ["can_read_workspace", "can_edit_workspace", "can_manage_workspace"]) { assert.equal(await rpc(helper, [workspace]), true); checks++; }
  await claims();
  assert.equal(await rpc("workspace_role_for", [workspace]), "contributor"); checks++;
  assert.equal(await rpc("can_read_workspace", [workspace]), true); checks++;
  assert.equal(await rpc("can_edit_workspace", [workspace]), true); checks++;
  assert.equal(await rpc("can_manage_workspace", [workspace]), false); checks++;
  const redeemed = await rpc("claim_beta_invite", [tokens.member]);
  assert.equal(redeemed.app_access, true); assert.equal(redeemed.tier, "existing-paid"); assert.equal(redeemed.user_role, "user"); checks++;
  await assert.rejects(rpc("claim_beta_invite", [tokens.member]), /already been claimed/); checks++;
  await db.query("update public.profiles set email=$1 where id=$2", [`${outsider}@example.test`, member]);
  await assert.rejects(rpc("claim_beta_invite", [tokens.wrong]), /email does not match/); checks++;
  await claims(outsider, { email: `${newcomer}@example.test` });
  await assert.rejects(rpc("accept_workspace_invite", [acceptId]), /different email/); checks++;
  await claims(newcomer);
  const newClaim = await rpc("claim_beta_invite", [tokens.newcomer]);
  assert.equal(newClaim.app_access, true); assert.equal(newClaim.user_role, "user"); assert.equal(newClaim.tier, "free"); checks++;
  const accepted = await rpc("accept_workspace_invite", [acceptId]);
  assert.equal(accepted.status, "active"); assert.equal(accepted.workspace_id, workspace); checks++;
  await assert.rejects(rpc("accept_workspace_invite", [acceptId]), /no longer active/); checks++;
  await claims(outsider);
  assert.equal(await rpc("can_read_workspace", [workspace]), null); // Preserve the previous no-membership NULL result.
  checks++;
  await db.query("update public.profiles set app_access=true,beta_status='approved' where id=$1", [outsider]);
  assert.equal((await db.query("select app_access from public.profiles where id=$1", [outsider])).rows[0].app_access, false); checks++;
  await db.query("reset role");
  await db.query("insert into code3_private.account_sessions(user_id,provider_session_id,label,expires_at,revoked_at) values($1,$2,'revoked',now()+interval '1 hour',now())", [member, sessions.get(member)]);
  await claims();
  for (const helper of ["can_read_workspace", "can_edit_workspace", "can_manage_workspace"]) { assert.equal(await rpc(helper, [workspace]), false); checks++; }
  assert.equal(await rpc("workspace_role_for", [workspace]), null); checks++;
  await assert.rejects(rpc("claim_beta_invite", [tokens.revoked]), /current confirmed sign-in/); checks++;
  await assert.rejects(rpc("accept_workspace_invite", [acceptId]), /current confirmed sign-in/); checks++;
  await claims(owner, { exp: Date.now() / 1000 - 1 });
  assert.equal(await rpc("can_manage_workspace", [workspace]), false); checks++;
  await claims(owner, { session_id: sessions.get(outsider) });
  assert.equal(await rpc("can_edit_workspace", [workspace]), false); checks++;
  await db.query("reset role"); await db.query("select set_config('request.jwt.claims','{}',false)"); await db.query("set role anon");
  assert.equal(await rpc("can_read_workspace", [workspace]), false); checks++;
  await assert.rejects(rpc("claim_beta_invite", [tokens.revoked]), /permission denied/); checks++;
  await db.query("reset role");
  assert.equal((await db.query("select claimed_at from public.beta_invites where token_hash=public.beta_invite_token_hash($1)", [tokens.revoked])).rows[0].claimed_at, null); checks++;
  assert.deepEqual((await db.query("select * from public.workspaces order by id")).rows, before.workspaces); checks++;
  console.log(JSON.stringify({ passed: checks, realPostgres: true, hostedFunctionFixtures: true, defaultProfileInsertThenVerifiedGrant: true, existingRecordsUnchangedByMigration: true }));
} finally { await db.end().catch(() => {}); await admin.query(`drop database ${database}`); await admin.end(); }
