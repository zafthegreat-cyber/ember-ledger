/* Runtime authorization tests in local PostgreSQL, with synthetic Vault/Auth adapters. */
const fs=require('node:fs');const path=require('node:path');
async function main(){
  const {PGlite}=require(process.env.CODE3_PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create schema vault;create schema extensions;create schema code3_ebay_private;
      create table code3_ebay_private.notification_inbox(state text,received_at timestamptz);
      create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid);
      insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
      insert into auth.sessions values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      create table vault.secrets(id uuid primary key,name text unique,decrypted_secret text);
      create view vault.decrypted_secrets as select id,decrypted_secret from vault.secrets;
      create function vault.create_secret(secret_value text,secret_name text,description text) returns uuid language plpgsql as $$declare new_id uuid:=gen_random_uuid();begin insert into vault.secrets values(new_id,secret_name,secret_value);return new_id;end$$;
      create function vault.update_secret(secret_id uuid,secret_value text) returns void language sql as $$update vault.secrets set decrypted_secret=secret_value where id=secret_id$$;
      create function extensions.gen_random_bytes(size integer) returns bytea language sql as $$select decode(repeat('ab',size),'hex')$$;`);
    const source=fs.readFileSync(path.join(__dirname,'runtime-config.sql'),'utf8');await db.exec(source);
    const results=[];
    async function assert(name,query){const r=await db.query(query);if(r.rows[0]?.ok!==true)throw new Error(name);results.push(name);}
    async function denies(name,query,code='42501'){let rejected=false;try{await db.query(query);}catch(e){if(e.code!==code)throw e;rejected=true;}if(!rejected)throw new Error(name);results.push(name);}
    const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',session='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const endpoint='https://exampleproject.supabase.co/functions/v1/ebay-account-deletion';
    await denies('initialize rejects non-HTTPS endpoint',`select public.code3_ebay_initialize_runtime('${owner}','http://exampleproject.supabase.co/functions/v1/ebay-account-deletion')`,'22023');
    await denies('initialize rejects unrelated HTTPS host',`select public.code3_ebay_initialize_runtime('${owner}','https://attacker.example/functions/v1/ebay-account-deletion')`,'22023');
    await db.query(`select public.code3_ebay_initialize_runtime('${owner}','${endpoint}')`);
    await assert('one initialized config',`select count(*)=1 as ok from code3_ebay_private.runtime_config`);
    await db.query(`select public.code3_ebay_initialize_runtime('${owner}','${endpoint}')`);
    await assert('reinitialization preserves token',`select count(*)=1 as ok from vault.secrets`);
    await denies('owner cannot be replaced by reinitialization',`select public.code3_ebay_initialize_runtime('${other}','${endpoint}')`,'22023');
    await db.exec('set role anon');
    await denies('anonymous setup token denied','select public.code3_ebay_setup_info()');
    await denies('anonymous runtime secrets denied','select public.code3_ebay_runtime_config()');
    await denies('anonymous notification status denied','select public.code3_ebay_setup_status()');
    await denies('anonymous credential write denied',`select public.code3_ebay_configure_credentials('synthetic-app-id','synthetic-secret')`);
    await db.exec('reset role;set role authenticated');
    await denies('authenticated direct private table denied','select * from code3_ebay_private.runtime_config');
    await denies('authenticated runtime secrets denied','select public.code3_ebay_runtime_config()');
    await denies('unconfigured auth context denied','select public.code3_ebay_setup_info()');
    await db.exec('reset role');
    async function claims(sub,sid){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub,role:'authenticated',session_id:sid})]);await db.exec('set role authenticated');}
    await claims(other,session);await denies('other app account denied','select public.code3_ebay_setup_info()');await denies('other account notification status denied','select public.code3_ebay_setup_status()');await db.exec('reset role');
    await claims(owner,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');await denies('revoked/missing session denied','select public.code3_ebay_setup_info()');await db.exec('reset role');
    await claims(owner,session);
    await assert('publisher can copy only matching server token',`select (j->>'verificationToken')~'^[a-f0-9]{64}$' and j->>'endpoint'='${endpoint}' and j->>'credentialsConfigured'='false' as ok from (select public.code3_ebay_setup_info() j) s`);
    await assert('publisher can see opaque delivery counts',`select j->>'received'='0' and j->>'needsReview'='0' and not(j ? 'events') as ok from (select public.code3_ebay_setup_status() j) s`);
    await denies('invalid credential whitespace rejected',`select public.code3_ebay_configure_credentials('synthetic app id','synthetic-secret')`,'22023');
    await db.query(`select public.code3_ebay_configure_credentials('synthetic-app-id','synthetic-cert-id')`);
    await assert('publisher gets configured flag not secret',`select j->>'credentialsConfigured'='true' and not (j ? 'clientSecret') and not (j ? 'clientId') as ok from (select public.code3_ebay_setup_info() j) s`);
    await db.exec('reset role;set role service_role');
    await assert('server receives encrypted-runtime values via restricted function',`select j->>'clientId'='synthetic-app-id' and j->>'clientSecret'='synthetic-cert-id' and j->>'environment'='production' as ok from (select public.code3_ebay_runtime_config() j) s`);
    await db.exec('reset role');
    await db.query(`delete from auth.sessions where id='${session}'`);await claims(owner,session);
    await denies('sign-out revokes publisher access','select public.code3_ebay_setup_info()');
    console.log(JSON.stringify({suite:'ebay-runtime-configuration',passed:results.length,failed:0,engine:'local PostgreSQL/PGlite',syntheticVaultAdapter:true,productionNetwork:false,checks:results},null,2));
  }finally{await db.close();}
}
main().catch(e=>{console.error(JSON.stringify({ok:false,message:e.message,code:e.code}));process.exitCode=1;});
