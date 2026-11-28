import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PRODUCTION_REF,stagingOrigin,stagingDatabase,sqlStatements,transactionBody,migrationPlan,buildStagingSql} from "./lib/isolated-staging.mjs";
import {browserConfig,parseCliEnvironment,cliCredentials} from "./lib/staging-credentials.mjs";
const ref="abcdefghijklmnopqrst";
const token=claims=>"test."+Buffer.from(JSON.stringify(claims)).toString("base64url")+".fixture";
const env={CODE3_STAGING_PROJECT_REF:ref,CODE3_STAGING_ANON_KEY:token({ref,role:"anon"}),CODE3_STAGING_SERVICE_ROLE_KEY:token({ref,role:"service_role"})};
test("production and malformed project references fail before requests",()=>{
  for(const value of [undefined,PRODUCTION_REF,ref+"/",ref+".evil",ref.toUpperCase()])assert.throws(()=>stagingOrigin(value));
  assert.equal(stagingOrigin(ref),`https://${ref}.supabase.co`);
});
test("database identity and verified TLS cannot be overridden",()=>{
  for(const value of [`postgres://postgres@db.${PRODUCTION_REF}.supabase.co/postgres`,`postgres://postgres@localhost/postgres`,`postgres://postgres@db.${ref}.supabase.co/postgres?sslmode=disable`,`https://db.${ref}.supabase.co/`])assert.throws(()=>stagingDatabase(value,ref));
  assert.equal(stagingDatabase(`postgres://postgres@db.${ref}.supabase.co/postgres`,ref).ssl.rejectUnauthorized,true);
  assert.equal(stagingDatabase(`postgres://postgres@db.${ref}.supabase.co/postgres?connect_timeout=15`,ref).connectionTimeoutMillis,15000);
  assert.equal(stagingDatabase(`postgres://postgres.${ref}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,ref).ssl.rejectUnauthorized,true);
});
test("SQL transaction wrapper preserves bodies, strings and nested comments",()=>{
  const body=String.raw`/* outer /* nested ; */ comment */ begin; create function x() returns text language sql as $f$ select 'commit;'; $f$; select E'escaped\'; quote'; commit;`;
  assert.equal(sqlStatements(body).length,4);
  const safe=transactionBody(body);assert(safe.includes("'commit;'"));assert(safe.includes("$f$"));assert(!safe.includes("comment */ begin;"));
  for(const sql of ["select 'unterminated","/* unfinished",'select "missing',"rollback;","end;","commit and chain;","prepare transaction 'x';"])assert.throws(()=>transactionBody(sql));
});
test("only an exact known migration prefix can be resumed",()=>{
  const files=[{name:"003_second.sql",sql:"select 2;"},{name:"002_first.sql",sql:"select 1;"}];
  assert.deepEqual(migrationPlan(files,[{version:"002",name:"first"}]).map(f=>f.name),["003_second.sql"]);
  assert.throws(()=>migrationPlan(files,[{version:"002",name:"unexpected"}]));
  assert.throws(()=>migrationPlan(files,[{version:"003",name:"second"}]));
  assert.throws(()=>migrationPlan([...files,{name:"002_duplicate.sql",sql:"select 3;"}]));
  const baseline={name:"001_legacy_database_baseline.sql",sql:"select 0;"};
  assert.deepEqual(migrationPlan([baseline,...files],[{version:"002",name:"first"}]).map(f=>f.name),[baseline.name,"003_second.sql"]);
  assert.throws(()=>migrationPlan([baseline,...files],[{version:"003",name:"second"}]));
});
test("every scheduler is disabled within the one committing transaction",()=>{
  const bundle=buildStagingSql("begin;create table x(id int);commit;",[{name:"x.sql",sql:"begin;select cron.schedule('x','* * * * *','select 1');commit;"}]);
  const statements=sqlStatements(bundle.sql);
  assert.equal(statements.filter(s=>/^\s*begin;/iu.test(s)).length,1);
  assert.equal(statements.filter(s=>/^\s*commit;/iu.test(s)).length,1);
  assert(bundle.sql.indexOf("active:=false")>bundle.sql.indexOf("cron.schedule"));
  assert(bundle.sql.indexOf("active:=false")<bundle.sql.lastIndexOf("commit;"));
  assert.equal(bundle.manifest[0].sha256.length,64);
});
test("browser keys are public and local administrator keys match staging",()=>{
  assert.equal(browserConfig(env).origin,stagingOrigin(ref));
  for(const change of [{CODE3_STAGING_PROJECT_REF:PRODUCTION_REF},{CODE3_STAGING_ANON_KEY:env.CODE3_STAGING_SERVICE_ROLE_KEY},{CODE3_STAGING_ANON_KEY:token({ref,role:"service_role"})},{CODE3_STAGING_SERVICE_ROLE_KEY:token({ref:PRODUCTION_REF,role:"service_role"})},{CODE3_STAGING_SERVICE_ROLE_KEY:"not-a-key"}])assert.throws(()=>browserConfig({...env,...change}));
});
test("CLI environment is parsed as data, never executed",()=>{
  const data=parseCliEnvironment('Target: project\nAPI_URL="https://example.invalid"\nTOKEN=\'$(unsafe)\'\n');
  assert.equal(data.TOKEN,"$(unsafe)");assert.equal(data.API_URL,"https://example.invalid");
  assert.throws(()=>cliCredentials("main",ref));assert.throws(()=>cliCredentials("x & command",ref));
});
test("production/default/mismatched branches never request credentials",()=>{
  const id="11111111-1111-4111-8111-111111111111";
  for(const candidate of [{id,is_default:true,project_ref:PRODUCTION_REF},{id,is_default:false,project_ref:PRODUCTION_REF},{id,is_default:false,project_ref:ref,parent_project_ref:"wrong"}]){
    const calls=[];assert.throws(()=>cliCredentials(id,ref,{run:args=>{calls.push(args);return JSON.stringify({branches:[candidate]});}}));assert.equal(calls.length,1);assert.equal(calls[0][1],"list");
  }
  const values=cliCredentials(id,ref,{run:args=>args[1]==="list"?JSON.stringify([{id,is_default:false,project_ref:ref,parent_project_ref:PRODUCTION_REF}]):`API_URL="https://${ref}.supabase.co"\nANON_KEY="public"\nSERVICE_ROLE_KEY="private"`});
  assert.equal(values.CODE3_STAGING_SERVICE_ROLE_KEY,"private");
});
test("browser harness has no credential export, public setup endpoint or stored trace",async()=>{
  const source=await readFile(new URL("test-stock-staging-browser.mjs",import.meta.url),"utf8");
  assert(source.includes("signInWithPassword"));assert(source.includes("envFile:false"));assert(source.includes("envDir:false"));
  assert(!/storageState\(|screenshot\(|tracing\.start|Deno\.serve|window\.__.*token/iu.test(source));
  assert(source.includes("No credentials were saved"));assert(source.includes("Administrator credential reached browser"));
});
