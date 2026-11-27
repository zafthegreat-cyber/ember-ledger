import {readFile,readdir,writeFile} from "node:fs/promises";
import pg from "pg";
import {stagingOrigin,stagingDatabase,migrationPlan,buildStagingSql} from "./lib/isolated-staging.mjs";
import {cliCredentials} from "./lib/staging-credentials.mjs";

const args=process.argv.slice(2);
if(args.includes("--help")){
  console.log("Usage: node scripts/bootstrap-isolated-staging.mjs --plan|--apply [--branch-id <UUID>]\nRequires CODE3_STAGING_PROJECT_REF. Uses CODE3_STAGING_DB_URL or credentials from the signed-in local CLI. Never creates a branch or repairs production migration history.");
  process.exit(0);
}
if(!["--plan","--apply"].includes(args[0])||!(args.length===1||(args.length===3&&args[1]==="--branch-id")))throw new Error("Choose --plan or --apply explicitly, with an optional approved branch ID.");
const ref=process.env.CODE3_STAGING_PROJECT_REF;
stagingOrigin(ref);
const credentials=args.length===3?cliCredentials(args[2],ref):process.env;
const db=new pg.Client(stagingDatabase(credentials.CODE3_STAGING_DB_URL,ref));
const root=new URL("../supabase/",import.meta.url);
const files=await Promise.all((await readdir(new URL("migrations/",root))).filter(name=>name.endsWith(".sql")).map(async name=>({name,sql:await readFile(new URL("migrations/"+name,root),"utf8")})));
await db.connect();
try{
  const {rows:[identity]}=await db.query("select (select count(*)::int from auth.users) as users,to_regclass('public.retailer_intel_sources') as sources,to_regclass('cron.job') as jobs,to_regclass('supabase_migrations.schema_migrations') as history");
  if(identity.users!==0)throw new Error("Bootstrap requires a disposable database with no Auth users.");
  if(identity.jobs&&(await db.query("select count(*)::int as active from cron.job where active")).rows[0].active!==0)throw new Error("Existing active jobs require containment before bootstrap.");
  if(identity.sources&&(await db.query("select count(*)::int as connected from public.retailer_intel_sources where connected")).rows[0].connected!==0)throw new Error("Connected sources are forbidden in staging.");
  const applied=identity.history?(await db.query("select version,name from supabase_migrations.schema_migrations order by version")).rows:[];
  const plan=migrationPlan(files,applied);
  const bundle=buildStagingSql(await readFile(new URL("bootstrap/legacy_database_foundation.sql",root),"utf8"),plan);
  const manifest={project:ref,mode:args[0],historicalPrefix:applied.length,foundationSha256:bundle.foundationSha256,migrations:bundle.manifest};
  if(args[0]==="--apply"){
    try{await db.query(bundle.sql);}catch{await db.query("rollback").catch(()=>{});throw new Error("Staging bootstrap rolled back. Inspect database logs; no credentials are included here.");}
    const {rows:[state]}=await db.query("select (select count(*)::int from cron.job where active) as active_jobs,(select count(*)::int from public.retailer_intel_sources where connected) as connected_sources");
    if(state.active_jobs||state.connected_sources)throw new Error("Staging containment check failed.");
    manifest.containment=state;
  }
  await writeFile(new URL("../isolated-staging-manifest.local.json",import.meta.url),JSON.stringify(manifest,null,2));
  console.log(`${args[0]==="--apply"?"Applied":"Reviewed"} ${plan.length} migrations for isolated staging. Production history was not changed.`);
}finally{await db.end();}
