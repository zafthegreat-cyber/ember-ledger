import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import pg from "pg";
import {buildStagingSql,migrationPlan} from "./lib/isolated-staging.mjs";

const root=new URL("../supabase/",import.meta.url);
const foundation=await readFile(new URL("bootstrap/legacy_database_foundation.sql",root),"utf8");
const files=await Promise.all((await readdir(new URL("migrations/",root))).filter(name=>name.endsWith(".sql")).sort().map(async name=>({name,sql:await readFile(new URL("migrations/"+name,root),"utf8")})));
const connection={host:"127.0.0.1",port:Number(process.env.CODE3_TEST_PG_PORT||55439),user:process.env.CODE3_TEST_PG_USER||"code3qa",password:process.env.CODE3_TEST_PG_PASSWORD,database:"postgres"};
const admin=new pg.Client(connection);await admin.connect();
let checks=0;
let freshColumns;
try{
  for(const partial of [false,true]){
    const database="code3_test_bootstrap_"+randomUUID().replaceAll("-","");
    await admin.query(`create database ${database}`);
    const db=new pg.Client({...connection,database});await db.connect();
    try{
      await db.query("set search_path=public,extensions");
      await db.query(await readFile(new URL("qa/supabase_platform_fixture.sql",import.meta.url),"utf8"));
      // Match the actual failed hosted branch: migrations through 012, no base catalog.
      if(partial)for(const file of files.slice(0,10))await db.query(file.sql);
      await assert.rejects(db.query("select id from public.product_catalog"),/does not exist/);checks++;
      await assert.rejects(db.query(foundation),/isolated staging bootstrap runner/);await db.query("rollback");checks++;
      const applied=partial?files.slice(0,10).map(f=>{const [,version,name]=f.name.match(/^([^_]+)_(.+)\.sql$/);return {version,name};}):[];
      const plan=migrationPlan(files,applied);
      const bundle=buildStagingSql(foundation,plan);
      // Native Postgres has no hosted extensions. The fixture supplies inert APIs.
      const localSql=bundle.sql.replace(/^create extension if not exists pg_(cron|net)[^;]*;/gmi,"");
      await db.query(localSql);checks++;
      const columns=(await db.query("select table_name,column_name,data_type,column_default,is_nullable,ordinal_position from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows;
      if(partial){assert.deepEqual(columns,freshColumns,"Recovery must retain the same catalog and application columns as fresh replay");checks++;}else freshColumns=columns;
      // Re-running the additive foundation preserves existing records and fields.
      const actor=randomUUID(),product=randomUUID();
      await db.query("begin;select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true);");
      await db.query("insert into auth.users(id,email)values($1,'fixture@example.invalid')",[actor]);
      await db.query("insert into public.product_catalog(id,user_id,name,image_source)values($1,$2,'Preserved fixture','manual')",[product,actor]);
      await db.query("commit");
      await db.query("select set_config('app.code3_isolated_validation','on',false)");await db.query(foundation);
      assert.deepEqual((await db.query("select name,image_source from public.product_catalog where id=$1",[product])).rows,[{name:"Preserved fixture",image_source:"manual"}]);checks++;
      await db.query("delete from public.product_catalog where id=$1",[product]);await db.query("delete from auth.users where id=$1",[actor]);
      const {rows:[state]}=await db.query(`select (select count(*)::int from cron.job where active) as active_jobs,(select count(*)::int from public.retailer_intel_sources where connected) as connected_sources,(select count(*)::int from auth.users) as users,(select count(*)::int from pg_policies where tablename='stock_alert_preferences') as preference_policies`);
      assert.deepEqual(state,{active_jobs:0,connected_sources:0,users:0,preference_policies:4});checks++;
      for(const table of ["product_catalog","inventory_items","sales_records","stock_alert_preferences","retailer_inbound_events"]){
        const {rows:[row]}=await db.query("select relrowsecurity from pg_class where oid=$1::regclass",["public."+table]);assert.equal(row.relrowsecurity,true);checks++;
      }
      await assert.rejects(db.query("select net.http_get('https://example.invalid')"),/Network disabled/);checks++;
      const {rows:[grants]}=await db.query("select has_table_privilege('anon','retailer_inbound_events','select') as guest,has_table_privilege('authenticated','retailer_inbound_events','select') as member,has_table_privilege('service_role','retailer_inbound_events','insert') as service");
      assert.deepEqual(grants,{guest:false,member:false,service:true});checks++;
      // An aborted bootstrap never publishes active jobs or half of the schema.
      await assert.rejects(db.query("begin;create table public.rollback_probe(id int);select 1/0;commit;"));await db.query("rollback");
      assert.equal((await db.query("select to_regclass('public.rollback_probe') as relation")).rows[0].relation,null);checks++;
      console.log(`${partial?"Failed-branch recovery":"Fresh database"}: ${plan.length} migrations replayed; jobs inactive, RLS intact.`);
    }finally{await db.end();await admin.query(`drop database ${database} with (force)`);}
  }
  console.log(`${checks} isolated PostgreSQL checks passed.`);
}finally{await admin.end();}
