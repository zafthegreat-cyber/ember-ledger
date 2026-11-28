import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir,mkdtemp,mkdir,writeFile,realpath,rm} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {tmpdir} from "node:os";
import {join,dirname,basename} from "node:path";
import pg from "pg";
import {migrationPlan} from "./lib/isolated-staging.mjs";

const mode=process.argv[2]||"--fixture";
assert(["--fixture","--verify-native"].includes(mode),"Choose a local fixture or native Supabase verification.");
const root=new URL("../supabase/",import.meta.url);
const files=await Promise.all((await readdir(new URL("migrations/",root))).filter(name=>name.endsWith(".sql")).map(async name=>({name,sql:await readFile(new URL("migrations/"+name,root),"utf8")})));
const ordered=migrationPlan(files);
assert.equal(ordered[0].name,"001_legacy_database_baseline.sql");
const expected=ordered.map(file=>{const [,version,name]=file.name.match(/^(\d+)_(.+)\.sql$/u);return {version,name};});
const port=Number(process.env.CODE3_TEST_PG_PORT||55439);
assert(Number.isInteger(port)&&port>0&&port<65536,"Use a valid loopback port.");
const user=process.env.CODE3_TEST_PG_USER||"code3qa";
assert(/^[A-Za-z_][A-Za-z0-9_]*$/u.test(user),"Use a local test database role.");
// Deliberately ignore DATABASE_URL and all hosted Supabase targets.
const connection={host:"127.0.0.1",port,user,password:process.env.CODE3_TEST_PG_PASSWORD,database:process.env.CODE3_TEST_PG_DATABASE||"postgres"};
assert(/^[A-Za-z_][A-Za-z0-9_]*$/u.test(connection.database));
let checks=0;

async function verify(db){
  assert.deepEqual((await db.query("select version,name from supabase_migrations.schema_migrations order by version")).rows,expected);checks++;
  const {rows:[state]}=await db.query("select (select count(*)::int from cron.job where active) as jobs,(select count(*)::int from retailer_intel_sources where connected) as sources,(select count(*)::int from auth.users) as users,(select count(*)::int from stock_alert_preferences) as preferences");
  assert.deepEqual(state,{jobs:0,sources:0,users:0,preferences:0});checks++;
  for(const table of ["product_catalog","inventory_items","sales_records","stock_alert_preferences","retailer_inbound_events"]){
    assert.equal((await db.query("select relrowsecurity from pg_class where oid=$1::regclass",["public."+table])).rows[0].relrowsecurity,true);checks++;
  }
  const {rows:[access]}=await db.query("select has_table_privilege('authenticated','public.profiles','select') as profile_read,has_table_privilege('service_role','public.profiles','update') as setup,has_function_privilege('service_role','public.is_admin_or_moderator()','execute') as helper,has_table_privilege('anon','retailer_inbound_events','select') as guest_warehouse,has_table_privilege('authenticated','retailer_inbound_events','select') as member_warehouse");
  assert.deepEqual(access,{profile_read:true,setup:true,helper:true,guest_warehouse:false,member_warehouse:false});checks++;
  assert.equal((await db.query("select count(*)::int as count from pg_policies where schemaname='public' and tablename='stock_alert_preferences'")).rows[0].count,4);checks++;
  assert.equal((await db.query("select count(*)::int as count from information_schema.columns where table_schema='public' and ((table_name='product_catalog' and column_name='image_source') or (table_name='inventory_items' and column_name='item_image_source'))")).rows[0].count,2);checks++;
}

if(mode==="--verify-native"){
  const db=new pg.Client(connection);await db.connect();
  try{await verify(db);}finally{await db.end();}
  console.log(`${checks} native Supabase checks passed; ${ordered.length} migrations recorded by the standard CLI.`);
}else{
  const admin=new pg.Client({...connection,database:"postgres"});await admin.connect();
  const database="code3_native_"+randomUUID().replaceAll("-","");
  let db,workspace;
  try{
    await admin.query(`create database ${database}`);
    // Supabase's migration role includes extensions in its default search path.
    // Apply that platform default to every CLI connection, not just this client.
    await admin.query(`alter database ${database} set search_path=public,extensions`);
    db=new pg.Client({...connection,database});await db.connect();
    await db.query("set search_path=public,extensions");
    await db.query(await readFile(new URL("qa/supabase_platform_fixture.sql",import.meta.url),"utf8"));
    // Prove no individual file can commit an active job during a fresh replay.
    await db.query("create function public.check_native_replay_job() returns trigger language plpgsql as $$begin if exists(select 1 from cron.job where active) then raise exception 'Active scheduler at migration commit';end if;return null;end$$; create constraint trigger native_replay_jobs after insert or update on cron.job deferrable initially deferred for each row execute function public.check_native_replay_job();");
    workspace=await mkdtemp(join(tmpdir(),"code3-migrations-"));
    await mkdir(join(workspace,"supabase","migrations"),{recursive:true});
    await writeFile(join(workspace,"supabase","config.jsonc"),JSON.stringify({project_id:"code3-native-fixture",db:{major_version:17,migrations:{enabled:true},seed:{enabled:false}}}));
    for(const file of ordered){
      // Native Windows Postgres lacks hosted pg_cron/pg_net. Only those two
      // extension declarations are replaced by the inert platform fixture.
      const sql=file.sql.replace(/^create extension if not exists pg_(cron|net)[^;]*;/gmi,"-- Hosted extension supplied by the local inert fixture.");
      await writeFile(join(workspace,"supabase","migrations",file.name),sql);
    }
    const target=`postgresql://${user}@127.0.0.1:${port}/${database}?sslmode=disable`;
    const args=["--yes","supabase@3.4.0","migration","up",`--remote=${target}`,"--include-all","--yes","--output-format=json"];
    let invocation;
    if(process.platform==="win32"){
      invocation=[process.env.ComSpec||"cmd.exe",["/d","/s","/c",`npx.cmd ${args.join(" ")}`]];
    }else invocation=["npx",args];
    const result=spawnSync(...invocation,{cwd:workspace,encoding:"utf8",timeout:300000,maxBuffer:4*1024*1024,windowsHide:true,env:{...process.env,SUPABASE_ACCESS_TOKEN:"",PGPASSWORD:connection.password||""}});
    if(result.status!==0){
      const safe=String(result.stdout+"\n"+result.stderr||result.error?.code||"CLI failure").replace(/postgres(?:ql)?:\/\/\S+/gu,"[local database URL]");
      const errorLine=safe.split("\n").find(line=>line.includes('"error"'));
      throw new Error(`Standard local migration replay failed: ${errorLine||safe.slice(-4000)}`);
    }
    if(!(await db.query("select to_regclass('supabase_migrations.schema_migrations') as history")).rows[0].history){
      throw new Error(`CLI did not create local migration history: ${String(result.stdout+result.stderr).replace(/postgres(?:ql)?:\/\/\S+/gu,"[local database URL]").slice(-3000)}`);
    }
    await verify(db);
    assert.equal((await db.query("select count(*)::int as count from pg_trigger where tgname='native_replay_jobs' and tgdeferrable and tginitdeferred")).rows[0].count,1);checks++;
    // The old failure must be fixed by the migration directory itself; the
    // recovery helper and its foundation were never run in this database.
    const actor=randomUUID(),product=randomUUID();
    await db.query("begin;select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
    await db.query("insert into auth.users(id,email)values($1,'baseline@example.invalid')",[actor]);
    await db.query("insert into product_catalog(id,user_id,name,image_source)values($1,$2,'Keep existing row','manual')",[product,actor]);
    const policyBefore=(await db.query("select tablename,policyname,qual,with_check from pg_policies where schemaname='public' and tablename in ('product_catalog','inventory_items','sales_records') order by tablename,policyname")).rows;
    const grantsBefore=(await db.query("select relname,relacl::text from pg_class where oid in ('public.product_catalog'::regclass,'public.inventory_items'::regclass,'public.sales_records'::regclass) order by relname")).rows;
    await db.query(ordered[0].sql);
    assert.deepEqual((await db.query("select name,image_source from product_catalog where id=$1",[product])).rows,[{name:"Keep existing row",image_source:"manual"}]);checks++;
    assert.deepEqual((await db.query("select tablename,policyname,qual,with_check from pg_policies where schemaname='public' and tablename in ('product_catalog','inventory_items','sales_records') order by tablename,policyname")).rows,policyBefore);checks++;
    assert.deepEqual((await db.query("select relname,relacl::text from pg_class where oid in ('public.product_catalog'::regclass,'public.inventory_items'::regclass,'public.sales_records'::regclass) order by relname")).rows,grantsBefore);checks++;
    await db.query("delete from auth.users where id=$1",[actor]);
    // A second standard invocation must be a genuine no-op, not a history repair.
    const second=spawnSync(...invocation,{cwd:workspace,encoding:"utf8",timeout:300000,maxBuffer:1024*1024,windowsHide:true,env:{...process.env,SUPABASE_ACCESS_TOKEN:"",PGPASSWORD:connection.password||""}});
    assert.equal(second.status,0,"Second standard migration run must succeed without replaying files");checks++;
    assert.deepEqual(JSON.parse(second.stdout.trim()).applied,[]);checks++;
    await verify(db);
    console.log(`${checks} clean-replay checks passed through Supabase CLI 3.4.0; ${ordered.length} distinct migrations, no recovery prelude, no active jobs at any file commit.`);
  }finally{
    await db?.end();
    await admin.query(`drop database if exists ${database} with (force)`);await admin.end();
    if(workspace){const resolved=await realpath(workspace),parent=await realpath(tmpdir());if(dirname(resolved)!==parent||!basename(resolved).startsWith("code3-migrations-"))throw new Error("Unexpected temporary workspace; cleanup refused.");await rm(resolved,{recursive:true,force:true});}
  }
}
