import {spawnSync} from "node:child_process";
import {stagingOrigin} from "./isolated-staging.mjs";

export function parseCliEnvironment(text){
  const result={};
  for(const line of text.split(/\r?\n/u)){
    const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/u);
    if(!match)continue;
    let value=match[2].trim();
    if(value.startsWith('"')){try{value=JSON.parse(value);}catch{throw new Error("Invalid CLI credential output.");}}
    else if(value.startsWith("'")&&value.endsWith("'"))value=value.slice(1,-1);
    result[match[1]]=value;
  }
  return result;
}
export function browserConfig(env){
  const ref=env.CODE3_STAGING_PROJECT_REF,origin=stagingOrigin(ref);
  const anon=env.CODE3_STAGING_ANON_KEY,service=env.CODE3_STAGING_SERVICE_ROLE_KEY;
  if(!anon||!service||anon===service)throw new Error("Separate staging public and administrator keys are required.");
  if(anon.split(".").length===3){
    let claims;try{claims=JSON.parse(Buffer.from(anon.split(".")[1],"base64url").toString());}catch{throw new Error("Invalid staging public key.");}
    if(claims.ref!==ref||claims.role!=="anon")throw new Error("Browser key must be the approved project's public key.");
  }else if(!anon.startsWith("sb_publishable_"))throw new Error("Browser requires a publishable or anon key.");
  if(service.split(".").length===3){
    let claims;try{claims=JSON.parse(Buffer.from(service.split(".")[1],"base64url").toString());}catch{throw new Error("Invalid staging administrator key.");}
    if(claims.ref!==ref||claims.role!=="service_role")throw new Error("Administrator key is not scoped to the approved staging project.");
  }else if(!service.startsWith("sb_secret_"))throw new Error("Use a staging service-role or secret key.");
  return {ref,origin,anon,service};
}
function runCli(args){
  // All interpolated fields are fixed tokens or a validated UUID, never secrets.
  const command=`npx.cmd --yes supabase@3.4.0 ${args.join(" ")}`;
  const invocation=process.platform==="win32"?[process.env.ComSpec||"cmd.exe",["/d","/s","/c",command]]:["npx",["--yes","supabase@3.4.0",...args]];
  const child=spawnSync(...invocation,{encoding:"utf8",maxBuffer:1024*1024,timeout:60000,windowsHide:true});
  if(child.status!==0)throw new Error("The local Supabase CLI needs authenticated branch/credential read access. No credentials were printed.");
  return child.stdout;
}
export function cliCredentials(branch,ref,{run=runCli}={}){
  stagingOrigin(ref);
  if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(branch||""))throw new Error("Use the exact approved non-default branch ID.");
  const inventory=run(["branches","list","--remote=gxsfququorfczvhrkudl","--output=json"]);
  let metadata;try{metadata=JSON.parse(inventory.slice(inventory.search(/[\[{]/u)));}catch{throw new Error("Cannot verify branch inventory; credentials were not requested.");}
  const candidate=(Array.isArray(metadata)?metadata:metadata.branches)?.find(item=>item.id===branch);
  if(!candidate||candidate.is_default||candidate.project_ref!==ref||candidate.parent_project_ref!=="gxsfququorfczvhrkudl")throw new Error("Branch is not the approved non-production child; credentials were not requested.");
  const values=parseCliEnvironment(run(["branches","get",branch,"--remote=gxsfququorfczvhrkudl","--output=env"]));
  if((values.SUPABASE_URL||values.API_URL)!==stagingOrigin(ref))throw new Error("CLI credentials did not identify the approved staging project.");
  return {CODE3_STAGING_PROJECT_REF:ref,CODE3_STAGING_ANON_KEY:values.SUPABASE_ANON_KEY||values.ANON_KEY,CODE3_STAGING_SERVICE_ROLE_KEY:values.SUPABASE_SERVICE_ROLE_KEY||values.SERVICE_ROLE_KEY,CODE3_STAGING_DB_URL:values.POSTGRES_URL_NON_POOLING||values.POSTGRES_URL};
}
