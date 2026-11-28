import {createHash} from "node:crypto";

export const PRODUCTION_REF="gxsfququorfczvhrkudl";
export function stagingOrigin(ref){
  if(!/^[a-z0-9]{20}$/.test(ref||"")||ref===PRODUCTION_REF)throw new Error("An explicit non-production project reference is required.");
  return `https://${ref}.supabase.co`;
}
export function stagingDatabase(url,ref){
  stagingOrigin(ref);
  let parsed;try{parsed=new URL(url);}catch{throw new Error("A valid staging database URL is required; credentials omitted.");}
  const allowedOption=(key,value)=>key==="sslmode"?["require","verify-full"].includes(value):key==="connect_timeout"&&/^\d+$/u.test(value)&&Number(value)>=1&&Number(value)<=30;
  if(!["postgres:","postgresql:"].includes(parsed.protocol)||[...parsed.searchParams].some(([key,value])=>!allowedOption(key,value)))throw new Error("Use an explicit staging database URL without connection overrides.");
  const direct=parsed.hostname===`db.${ref}.supabase.co`&&decodeURIComponent(parsed.username)==="postgres";
  const pool=parsed.hostname.endsWith(".pooler.supabase.com")&&decodeURIComponent(parsed.username)===`postgres.${ref}`;
  if(!direct&&!pool)throw new Error("Database connection does not identify the approved staging project.");
  const connectionTimeoutMillis=Number(parsed.searchParams.get("connect_timeout")||15)*1000;
  parsed.search=""; // pg must not replace the verified TLS settings below.
  return {connectionString:parsed.toString(),connectionTimeoutMillis,ssl:{rejectUnauthorized:true}};
}

// Split only at top-level semicolons: function bodies and quoted SQL stay intact.
export function sqlStatements(sql){
  const result=[];let start=0,quote="",block=0,line=false,escapeString=false;
  for(let i=0;i<sql.length;i++){
    const c=sql[i],next=sql[i+1];
    if(line){if(c==="\n")line=false;continue;}
    if(block){if(c==="/"&&next==="*"){block++;i++;}else if(c==="*"&&next==="/"){block--;i++;}continue;}
    if(quote){
      if(quote.startsWith("$")){if(sql.startsWith(quote,i)){i+=quote.length-1;quote="";}}
      else if(c===quote){if(next===quote)i++;else quote="";}
      else if(c==="\\"&&quote==="'"&&escapeString)i++;
      continue;
    }
    if(c==="-"&&next==="-"){line=true;i++;continue;}
    if(c==="/"&&next==="*"){block=1;i++;continue;}
    if(c==="'"||c==='"'){quote=c;escapeString=c==="'"&&/[eE]/u.test(sql[i-1]||"")&&!/[A-Za-z0-9_$]/u.test(sql[i-2]||"");continue;}
    if(c==="$"){const tag=sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];if(tag){quote=tag;i+=tag.length-1;continue;}}
    if(c===";"){result.push(sql.slice(start,i+1));start=i+1;}
  }
  if(quote||block)throw new Error("Unterminated SQL string or comment.");
  if(sql.slice(start).trim())result.push(sql.slice(start));
  return result;
}
function statementText(sql){
  let i=0;
  while(i<sql.length){
    if(/\s/u.test(sql[i])){i++;continue;}
    if(sql.startsWith("--",i)){const end=sql.indexOf("\n",i);i=end<0?sql.length:end+1;continue;}
    if(sql.startsWith("/*",i)){let depth=1;i+=2;while(depth&&i<sql.length){if(sql.startsWith("/*",i)){depth++;i+=2;}else if(sql.startsWith("*/",i)){depth--;i+=2;}else i++;}continue;}
    break;
  }
  return sql.slice(i).trim().replace(/;\s*$/u,"");
}
export function transactionBody(sql){
  return sqlStatements(sql).filter(part=>{
    const text=statementText(part);
    if(/^(?:begin(?:\s+work)?|commit(?:\s+work)?)$/iu.test(text))return false;
    if(/^(?:rollback|abort|end|prepare\s+transaction|start\s+transaction|savepoint|release\s+savepoint|commit|begin)\b/iu.test(text))throw new Error("Unexpected migration transaction control.");
    return Boolean(text);
  }).join("\n");
}
export function migrationPlan(files,applied=[]){
  const sorted=[...files].sort((a,b)=>a.name.localeCompare(b.name));
  const versions=new Set();
  for(const file of sorted){
    const match=file.name.match(/^(\d+)_(.+)\.sql$/u);
    if(!match||versions.has(match[1]))throw new Error("Migration filenames require distinct numeric versions.");
    versions.add(match[1]);
  }
  // A failed pre-baseline branch has the original 002..012 prefix. Only the
  // newly restored 001 may be absent before that recognized prefix.
  const baseline=sorted[0]?.name==="001_legacy_database_baseline.sql"&&applied.length&&applied[0].version!=="001"?sorted.shift():null;
  for(let i=0;i<applied.length;i++){
    const file=sorted[i],match=file?.name.match(/^([^_]+)_(.+)\.sql$/u);
    if(!match||match[1]!==applied[i].version||match[2]!==applied[i].name)throw new Error("Staging history is not a recognized migration prefix; inspect it before proceeding.");
  }
  return [...(baseline?[baseline]:[]),...sorted.slice(applied.length)];
}
export function buildStagingSql(foundation,files){
  const manifest=files.map(file=>({name:file.name,sha256:createHash("sha256").update(file.sql).digest("hex")}));
  const sql=["begin;","set local statement_timeout='120s';","set local lock_timeout='5s';","select set_config('app.code3_isolated_validation','on',true);",transactionBody(foundation),...files.map(file=>`-- ${file.name}\n${transactionBody(file.sql)}`),
    // No scheduled request, including a historical production URL, becomes visible
    // to pg_cron until commit; disable every job inside the same transaction.
    `do $staging$ declare task record; begin if to_regclass('cron.job') is not null then for task in select jobid from cron.job loop perform cron.alter_job(task.jobid,active:=false);end loop;end if;end $staging$;`,
    "grant select on public.profiles to authenticated,service_role;",
    "grant update on public.profiles to service_role;",
    "grant usage on schema code3_private to service_role;",
    "grant execute on function public.code3_current_session_valid(),code3_private.current_session_id(),public.is_admin_or_moderator(),public.is_admin(),public.current_app_role(),public.normalized_app_role(text) to service_role;",
    "notify pgrst,'reload schema';","commit;"].join("\n");
  return {sql,manifest,foundationSha256:createHash("sha256").update(foundation).digest("hex")};
}
