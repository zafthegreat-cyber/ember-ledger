import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const database = `code3_test_recovery_${randomUUID().replaceAll("-", "")}`;
const connection = { host: "127.0.0.1", port: Number(process.env.CODE3_TEST_PG_PORT || 55439), user: process.env.CODE3_TEST_PG_USER || "code3qa", database: "postgres" };
const admin = new pg.Client(connection); await admin.connect(); await admin.query(`create database ${database}`);
const db = new pg.Client({ ...connection, database });
let checks = 0;
try {
  await db.connect();
  await db.query(`
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth,storage to authenticated,anon;
    create table public.profiles(id uuid primary key references auth.users,display_name text,app_role text default 'user',user_role text default 'user',tier text default 'free',plan_tier text default 'free',beta_status text default 'not_requested',beta_access_status text default 'approved',app_access boolean default false,updated_at timestamptz default now());
    create function public.current_app_role() returns text language sql stable as $$select coalesce((select app_role from public.profiles where id=auth.uid()),'user')$$;
    create function public.normalized_app_role(value text) returns text language sql stable as $$select case when value in ('owner','admin','moderator','beta_user') then value else 'user' end$$;
    create function public.has_full_app_access() returns boolean language sql stable as $$select app_access from public.profiles where id=auth.uid()$$;
    create function public.prevent_profile_role_tier_self_update() returns trigger language plpgsql as $$begin return new; end$$;
    create trigger prevent_profile_role_tier_self_update before update on public.profiles for each row execute function public.prevent_profile_role_tier_self_update();
    alter table public.profiles enable row level security;
    grant select,insert,update on public.profiles to authenticated;
    create policy own_profile on public.profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
    create table public.workspaces(id uuid primary key,owner_user_id uuid,name text,created_by uuid);
    create function public.can_edit_workspace(target uuid) returns boolean language sql stable as $$select exists(select 1 from public.workspaces where id=target and owner_user_id=auth.uid()) or null::boolean$$;
    create table public.inventory_items(id uuid primary key,user_id uuid,name text,quantity integer,workspace_id uuid);
    create table public.sales_records(id uuid primary key,user_id uuid,item_id uuid references public.inventory_items,name text,workspace_id uuid);
    create table public.receipt_records(id uuid primary key,user_id uuid,merchant text,workspace_id uuid);
    create table public.receipt_line_items(id uuid primary key,receipt_id uuid references public.receipt_records,product_name text,created_inventory_item_id uuid);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,owner_id text,owner uuid,name text,metadata jsonb);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated; grant select on storage.objects to anon;
    create policy fixture_read on storage.objects for select to authenticated using(owner_id=auth.uid()::text);
    create policy fixture_receipts_read on storage.objects for select to anon using(bucket_id='receipts');
  `);
  for (const [table, column] of [["workspaces", "owner_user_id"], ["inventory_items", "user_id"], ["sales_records", "user_id"], ["receipt_records", "user_id"]]) {
    await db.query(`alter table public.${table} enable row level security; grant select,insert,update,delete on public.${table} to authenticated; create policy own_rows on public.${table} for all to authenticated using(${column}=auth.uid()) with check(${column}=auth.uid());`);
  }
  await db.query(`alter table public.receipt_line_items enable row level security; grant select,insert,update,delete on public.receipt_line_items to authenticated;
    create policy own_lines on public.receipt_line_items for all to authenticated using(exists(select 1 from public.receipt_records r where r.id=receipt_id and r.user_id=auth.uid())) with check(exists(select 1 from public.receipt_records r where r.id=receipt_id and r.user_id=auth.uid()));`);
  const userA = randomUUID(), userB = randomUUID(), sessionA = randomUUID(), sessionB = randomUUID(), fresh = randomUUID();
  const ownItem = randomUUID(), otherItem = randomUUID(), ownWorkspace = randomUUID(), otherWorkspace = randomUUID(), ownReceipt = randomUUID();
  await db.query("insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now());", [userA, userB]);
  await db.query("insert into auth.sessions values($1,$2,null),($3,$4,null),($5,$2,null)", [sessionA, userA, sessionB, userB, fresh]);
  await db.query("insert into public.profiles(id,app_access,beta_status) values($1,true,'approved'),($2,true,'approved')", [userA, userB]);
  await db.query("insert into public.workspaces values($1,$2,'Own workspace',$2),($3,$4,'Other workspace',$4)", [ownWorkspace, userA, otherWorkspace, userB]);
  await db.query("insert into public.inventory_items values($1,$2,'Latest current item',3,$3),($4,$5,'Private other item',8,$6)", [ownItem, userA, ownWorkspace, otherItem, userB, otherWorkspace]);
  await db.query("insert into public.receipt_records values($1,$2,'Original receipt',$3)", [ownReceipt, userA, ownWorkspace]);
  await db.query("insert into storage.objects(bucket_id,owner_id,owner,name,metadata) values('receipts',$1::text,$1::uuid,'own-receipt.png','{\"size\":4}'),('receipts',$2::text,$2::uuid,'other-receipt.png','{\"size\":4}')", [userA, userB]);
  const before = (await db.query("select * from public.inventory_items order by id")).rows;
  for (const name of ["20261017192845_code3_account_sessions_and_role_protection.sql", "20261017192901_code3_legacy_cloud_backup_recovery.sql"]) await db.query(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
  assert.deepEqual((await db.query("select * from public.inventory_items order by id")).rows, before); checks++;
  async function claims(user = userA, session = sessionA) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, session_id: session, role: "authenticated", exp: Date.now() / 1000 + 3600, amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }] })]);
    await db.query("set role authenticated");
  }
  async function rpc(name, args = []) { return (await db.query(`select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`, args)).rows[0].value; }
  const payload = (sections, owner = userA) => JSON.stringify({ format: "code3-cloud-backup", version: 1, records: { ownerId: owner, sections }, attachments: [] });
  async function proof(raw) {
    await claims();
    const digest = createHash("sha256").update(raw).digest("hex");
    const challenge = await rpc("code3_prepare_account_confirmation", ["CLOUD_RESTORE", digest]);
    await claims(userA, fresh);
    const confirmed = await rpc("code3_complete_account_confirmation", [challenge.challengeId]);
    await claims(); return confirmed;
  }
  const restore = (raw, grant) => rpc("code3_restore_legacy_cloud_backup", [raw, grant.challengeId, grant.grant]);
  await claims();
  const exported = await rpc("code3_export_legacy_cloud_backup");
  assert.equal(exported.ownerId, userA); assert.equal(exported.sections.inventory_items.length, 1); assert.equal(exported.sections.inventory_items[0].id, ownItem); checks++;
  assert.equal(exported.fileManifest.length, 1); assert.equal(exported.fileManifest[0].path, "own-receipt.png"); checks++;
  assert.ok(exported.missingTables.includes("vehicles")); assert.ok(exported.exclusions.length); checks++;
  await claims(userB, sessionB);
  assert.equal((await rpc("code3_export_legacy_cloud_backup")).sections.inventory_items[0].id, otherItem); checks++;
  const added = randomUUID();
  const good = payload({ inventory_items: [{ id: ownItem, user_id: userA, name: "Older backup", quantity: 1 }, { id: added, user_id: userA, name: "Recovered", quantity: 2, workspace_id: ownWorkspace }] });
  const grant = await proof(good);
  assert.deepEqual(await restore(good, grant), { status: "APPLIED", insertedRecords: 1, keptExistingRecords: 1, operationDigest: createHash("sha256").update(good).digest("hex") }); checks++;
  assert.equal((await db.query("select name,quantity from public.inventory_items where id=$1", [ownItem])).rows[0].name, "Latest current item"); checks++;
  await assert.rejects(restore(good, grant), /different operation/); checks++;
  const repeat = await proof(good); assert.equal((await restore(good, repeat)).insertedRecords, 0); checks++;
  const freshId = randomUUID();
  const bad = payload({ inventory_items: [{ id: freshId, user_id: userA, name: "Must rollback", quantity: 1 }, { id: randomUUID(), user_id: userB, name: "Foreign", quantity: 1 }] });
  await assert.rejects(restore(bad, await proof(bad)), /another account/);
  assert.equal((await db.query("select count(*)::int n from public.inventory_items where id=$1", [freshId])).rows[0].n, 0); checks++;
  const crossReference = payload({ sales_records: [{ id: randomUUID(), user_id: userA, item_id: otherItem, name: "Invalid reference" }] });
  await assert.rejects(restore(crossReference, await proof(crossReference)), /private reference/); checks++;
  const crossWorkspace = payload({ inventory_items: [{ id: randomUUID(), user_id: userA, workspace_id: otherWorkspace, name: "Other workspace" }] });
  await assert.rejects(restore(crossWorkspace, await proof(crossWorkspace)), /workspace is not editable/); checks++;
  const authority = payload({ profiles: [{ id: userA, app_role: "owner" }] });
  await assert.rejects(restore(authority, { challengeId: randomUUID(), grant: "none" }), /unsupported table/); checks++;
  await assert.rejects(restore(payload({}, userB), { challengeId: randomUUID(), grant: "none" }), /different account/); checks++;
  const child = payload({ receipt_line_items: [{ id: randomUUID(), receipt_id: ownReceipt, product_name: "Receipt line", created_inventory_item_id: added }] });
  assert.equal((await restore(child, await proof(child))).insertedRecords, 1); checks++;
  const changed = payload({ inventory_items: [{ id: randomUUID(), user_id: userA, name: "Different operation" }] });
  await assert.rejects(restore(changed, await proof(good)), /different operation/); checks++;
  await db.query("reset role"); await db.query("set role anon");
  await assert.rejects(rpc("code3_export_legacy_cloud_backup"), /permission denied/); checks++;
  await db.query("reset role"); await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [sessionA]);
  await claims(); await assert.rejects(rpc("code3_export_legacy_cloud_backup"), /current confirmed/); checks++;
  await db.query("reset role");
  assert.deepEqual((await db.query("select * from public.inventory_items where id=$1", [otherItem])).rows[0], before.find((row) => row.id === otherItem)); checks++;
  console.log(JSON.stringify({ passed: checks, realPostgres: true, database, actualUserDataModified: false }));
} finally {
  await db.end().catch(() => {});
  if (!/^code3_test_recovery_[a-f0-9]{32}$/.test(database)) throw new Error("Unsafe disposable database cleanup refused");
  await admin.query(`drop database ${database}`); await admin.end();
}
