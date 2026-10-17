import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { WORKSPACE_SYNC_SOURCES } from "../src/features/persistence/cloudWorkspaceSources.js";

// Every mutation in this suite targets a new disposable loopback database.
const database = `code3_test_cloud_${randomUUID().replaceAll("-", "")}`;
if (!/^code3_test_cloud_[a-f0-9]{32}$/.test(database)) throw new Error("Unsafe test database name refused");
const connection = { host: "127.0.0.1", port: Number(process.env.CODE3_TEST_PG_PORT || 55439), user: process.env.CODE3_TEST_PG_USER || "code3qa", database: "postgres" };
const admin = new pg.Client(connection); await admin.connect(); await admin.query(`create database ${database}`);
const db = new pg.Client({ ...connection, database });
let checks = 0;
try {
  await db.connect();
  await db.query(`
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    create schema auth;
    create table auth.users(id uuid primary key, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users, not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to authenticated,anon;
    create table public.profiles(id uuid primary key references auth.users, display_name text, app_role text default 'user', user_role text default 'user', tier text default 'free', plan_tier text default 'free', beta_status text default 'not_requested', beta_access_status text default 'approved', app_access boolean default false, updated_at timestamptz default now());
    create function public.current_app_role() returns text language sql stable as $$ select coalesce(auth.jwt()->'app_metadata'->>'app_role',(select app_role from public.profiles where id=auth.uid()),'user') $$;
    create function public.normalized_app_role(value text) returns text language sql stable as $$ select case when value in ('owner','admin','moderator','beta_user') then value else 'user' end $$;
    create function public.prevent_profile_role_tier_self_update() returns trigger language plpgsql as $$ begin return new; end $$;
    create trigger prevent_profile_role_tier_self_update before update on public.profiles for each row execute function public.prevent_profile_role_tier_self_update();
    alter table public.profiles enable row level security;
    grant select,insert,update on public.profiles to authenticated;
    create policy own_select on public.profiles for select to authenticated using(id=auth.uid());
    create policy own_insert on public.profiles for insert to authenticated with check(id=auth.uid());
    create policy own_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
    create table public.inventory_items(id uuid primary key, user_id uuid, marker text);
    insert into public.inventory_items values(gen_random_uuid(),gen_random_uuid(),'existing-data-must-remain');
  `);
  const owner = randomUUID(); const other = randomUUID(); const waiting = randomUUID();
  const sid = randomUUID(); const otherSid = randomUUID(); const waitingSid = randomUUID();
  await db.query("insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now()),($3,now())", [owner, other, waiting]);
  await db.query("insert into auth.sessions values($1,$2,null),($3,$4,null),($5,$6,null)", [sid, owner, otherSid, other, waitingSid, waiting]);
  await db.query("insert into public.profiles(id,app_access,beta_status,beta_access_status) values($1,true,'approved','approved'),($2,true,'approved','approved'),($3,false,'pending','pending')", [owner, other, waiting]);
  const original = (await db.query("select * from public.inventory_items")).rows;
  for (const filename of ["20261017192845_code3_account_sessions_and_role_protection.sql", "20261017192853_code3_cloud_workspace_sync.sql"]) await db.query(await readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), "utf8"));
  assert.deepEqual((await db.query("select * from public.inventory_items")).rows, original); checks++;
  async function claims(user = owner, session = sid, overrides = {}) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, session_id: session, role: "authenticated", exp: Date.now() / 1000 + 3600, ...overrides })]);
    await db.query("set role authenticated");
  }
  async function rpc(name, args = []) {
    return (await db.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value;
  }
  const first = { "legacy-core-business": { schemaVersion: 0, data: { items: [{ id: "original-stable-id", title: "Preserved", quantity: 4 }] } } };
  await claims();
  assert.equal((await rpc("code3_workspace_read")).revision, 0); checks++;
  const mutation = randomUUID();
  const written = await rpc("code3_workspace_write", [0, first, mutation]);
  assert.equal(written.revision, 1); assert.deepEqual(written.sources, first); checks++;
  assert.deepEqual(await rpc("code3_workspace_write", [0, first, mutation]), written); checks++;
  await assert.rejects(rpc("code3_workspace_write", [0, { ...first, "legacy-feedback": { schemaVersion: 0, data: [] } }, mutation]), /workspace_mutation_reused/); checks++;
  await assert.rejects(rpc("code3_workspace_write", [0, first, randomUUID()]), /workspace_revision_conflict/); checks++;
  const second = structuredClone(first); second["legacy-core-business"].data.items[0].quantity = 5;
  assert.equal((await rpc("code3_workspace_write", [1, second, randomUUID()])).revision, 2); checks++;
  assert.deepEqual((await rpc("code3_workspace_read", [1])).sources, first); checks++;
  assert.deepEqual((await rpc("code3_workspace_history")).map((entry) => entry.revision), [2, 1]); checks++;
  await assert.rejects(db.query("select * from code3_sync_private.workspaces"), /permission denied/); checks++;
  await assert.rejects(db.query("delete from code3_sync_private.workspace_revisions"), /permission denied/); checks++;
  await claims(other, otherSid);
  assert.equal((await rpc("code3_workspace_read")).revision, 0); checks++;
  assert.deepEqual(await rpc("code3_workspace_history"), []); checks++;
  await assert.rejects(rpc("code3_workspace_read", [1]), /workspace_revision_unavailable/); checks++;
  assert.equal((await rpc("code3_workspace_write", [0, { "legacy-feedback": { schemaVersion: 0, data: [{ id: "other-account" }] } }, mutation])).revision, 1); checks++;
  await claims();
  assert.deepEqual((await rpc("code3_workspace_read")).sources, second); checks++;
  // The deployed source/field allowlist must accept every registered client
  // source. This catches coverage drift before a new release can strand saves.
  const registeredSources = Object.fromEntries(WORKSPACE_SYNC_SOURCES.map((source) => [source.sourceId, {
    schemaVersion: source.schemaVersion,
    data: source.allowedFields ? Object.fromEntries(source.allowedFields.map((field) => [field, null])) : source.emptyValue,
  }]));
  await db.query("reset role");
  await db.query("select code3_sync_private.validate_workspace_sources($1)", [registeredSources]); checks++;
  await claims();
  const invalid = [
    { "authentication-state": { schemaVersion: 0, data: {} } },
    { "legacy-core-business": { schemaVersion: 0, data: { profile: { user_role: "admin" } } } },
    { "legacy-core-business": { schemaVersion: 0, data: { items: [{ password: "forbidden" }] } } },
    { "safe-ui-preferences": { schemaVersion: 1, data: { "sb-auth-token": "forbidden" } } },
    { "account-ops": { schemaVersion: 9, data: {} } },
    { "account-ops": { schemaVersion: "1", data: {} } },
  ];
  for (const payload of invalid) { await assert.rejects(rpc("code3_workspace_write", [2, payload, randomUUID()]), /workspace_/); checks++; }
  await claims(waiting, waitingSid); await assert.rejects(rpc("code3_workspace_read"), /workspace_access_required/); checks++;
  // App-role administrators and trusted provider role claims keep their existing
  // full-app entitlement even without a separate beta-approval flag.
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
  await db.query("update public.profiles set app_role='owner' where id=$1", [waiting]);
  await claims(waiting, waitingSid); assert.equal((await rpc("code3_workspace_read")).revision, 0); checks++;
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
  await db.query("update public.profiles set app_role='user' where id=$1", [waiting]);
  await claims(waiting, waitingSid, { app_metadata: { role: "admin" } }); assert.equal((await rpc("code3_workspace_read")).revision, 0); checks++;
  await claims(owner, randomUUID()); await assert.rejects(rpc("code3_workspace_read"), /current confirmed/); checks++;
  await claims(owner, otherSid); await assert.rejects(rpc("code3_workspace_write", [2, first, randomUUID()]), /current confirmed/); checks++;
  await claims(owner, sid, { exp: Date.now() / 1000 - 1 }); await assert.rejects(rpc("code3_workspace_read"), /current confirmed/); checks++;
  await claims(owner, sid, { is_anonymous: true }); await assert.rejects(rpc("code3_workspace_read"), /current confirmed/); checks++;
  await db.query("reset role");
  await db.query("insert into code3_private.account_sessions(user_id,provider_session_id,label,expires_at,revoked_at) values($1,$2,'revoked',now()+interval '1 hour',now())", [owner, sid]);
  await claims(); await assert.rejects(rpc("code3_workspace_read"), /current confirmed/); checks++;
  await db.query("reset role"); await db.query("set role anon"); await assert.rejects(rpc("code3_workspace_read"), /permission denied/); checks++;
  await db.query("reset role");
  assert.deepEqual((await db.query("select * from public.inventory_items")).rows, original); checks++;
  assert.equal((await db.query("select count(*)::int count from code3_sync_private.workspace_revisions where owner_id=$1", [owner])).rows[0].count, 2); checks++;
  console.log(JSON.stringify({ passed: checks, realPostgres: true, cloudSnapshotIsolation: true, existingLegacyRecordsUnchanged: true, realProviderCredentialsUsed: false }));
} finally {
  await db.end().catch(() => {});
  await admin.query(`drop database ${database}`); await admin.end();
}
