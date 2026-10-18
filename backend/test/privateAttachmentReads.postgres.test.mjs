import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";

test("private attachment migration prevents anonymous and cross-account receipt reads without changing files", async () => {
  const database = `code3_test_private_read_${randomUUID().replaceAll("-", "")}`;
  const options = { host: "127.0.0.1", port: 55439, user: "code3qa", database: "postgres", connectionTimeoutMillis: 3000 };
  const admin = new pg.Client(options);
  await admin.connect();
  await admin.query(`create database ${database}`);
  const db = new pg.Client({ ...options, database });
  let checks = 0;
  const a = randomUUID(), b = randomUUID();
  try {
    await db.connect();
    await db.query(`
      do $$ begin create role anon; exception when duplicate_object then null; end $$;
      do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
      create schema auth; create schema storage;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      create function public.code3_current_session_valid() returns boolean language sql stable as $$select coalesce((auth.jwt()->>'active')::boolean,false)$$;
      revoke all on function public.code3_current_session_valid() from public,anon;
      grant execute on function public.code3_current_session_valid() to authenticated;
      create table storage.buckets(id text primary key,public boolean);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,owner_id text,owner uuid,name text);
      alter table storage.objects enable row level security;
      grant usage on schema auth,storage to authenticated,anon;
      grant select on storage.objects to authenticated,anon;
      create policy historical_public_receipts on storage.objects for select to public using(bucket_id='receipts');
      create policy public_catalog on storage.objects for select to public using(bucket_id in ('catalog-images','brand-assets'));
      create policy existing_private_access on storage.objects for select to authenticated using(bucket_id in ('receipt-images','product-submissions','feedback-screenshots') and (owner=auth.uid() or coalesce((auth.jwt()->>'workspace_access')::boolean,false)));
      insert into storage.buckets values('receipts',true),('receipt-images',false),('product-submissions',false),('feedback-screenshots',false),('catalog-images',true),('brand-assets',true);
    `);
    await db.query("insert into storage.objects(bucket_id,owner_id,owner,name) values('receipts',$1::text,$1::uuid,'owner-receipt'),('receipts',null,$1::uuid,'legacy-owner-receipt'),('receipts',$2::text,$2::uuid,'other-receipt'),('receipts',$1::text,$2::uuid,'inconsistent-owner'),('receipts',null,null,'unattributed-receipt'),('receipt-images',$1::text,$1::uuid,'workspace-receipt'),('product-submissions',$1::text,$1::uuid,'submission'),('feedback-screenshots',$1::text,$1::uuid,'feedback'),('catalog-images',null,null,'public-catalog'),('brand-assets',null,null,'public-brand')",[a,b]);
    const before = (await db.query("select * from storage.objects order by id")).rows;
    const names = async () => (await db.query("select name from storage.objects order by name")).rows.map(row => row.name);
    async function identity(role, user=a, active=true, workspace_access=false) {
      await db.query("reset role");
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,active,workspace_access})]);
      await db.query(`set role ${role}`);
    }
    await identity("anon");
    assert.ok((await names()).includes('owner-receipt')); checks++;
    await db.query("reset role");
    await db.query(await readFile(new URL("../../supabase/migrations/20261018174916_code3_private_attachment_reads.sql",import.meta.url),"utf8"));
    assert.deepEqual((await db.query("select * from storage.objects order by id")).rows,before); checks++;
    assert.deepEqual((await db.query("select id from storage.buckets where public order by id")).rows.map(row=>row.id),['brand-assets','catalog-images']); checks++;
    await identity("anon");
    assert.deepEqual(await names(),['public-brand','public-catalog']); checks++;
    await identity("authenticated",a);
    assert.deepEqual(await names(),['feedback','legacy-owner-receipt','owner-receipt','public-brand','public-catalog','submission','workspace-receipt']); checks++;
    await identity("authenticated",b);
    assert.deepEqual(await names(),['other-receipt','public-brand','public-catalog']); checks++;
    await identity("authenticated",b,true,true);
    assert.deepEqual(await names(),['feedback','other-receipt','public-brand','public-catalog','submission','workspace-receipt']); checks++;
    await identity("authenticated",a,false,true);
    assert.deepEqual(await names(),['public-brand','public-catalog']); checks++;
    await db.query("reset role");
    assert.equal((await db.query("select count(*)::int as total from storage.objects")).rows[0].total,10); checks++;
    console.log(`${checks} private-attachment PostgreSQL checks passed; synthetic database ${database}`);
  } finally { await db.end(); await admin.end(); }
});
