import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const directory = resolve("artifacts/qa/accounts-cloud-recovery/auth-unit");
await mkdir(directory,{recursive:true});
await build({entryPoints:["src/services/accountSessionService.js"],bundle:true,format:"cjs",platform:"node",define:{"import.meta.env":"{}"},outfile:resolve(directory,"account-session-client.cjs"),logLevel:"silent"});
await build({entryPoints:["src/lib/userProfile.js"],bundle:true,format:"cjs",platform:"node",define:{"import.meta.env":"{}"},outfile:resolve(directory,"account-profile.cjs"),logLevel:"silent"});
const require=createRequire(import.meta.url);
const {createAccountSessionService}=require(resolve(directory,"account-session-client.cjs"));
const {makeFallbackUserProfile,createUserProfileIfMissing,mapProfileRow}=require(resolve(directory,"account-profile.cjs"));
const digest="a".repeat(64);
let checks=0;
const getSession=async()=>({data:{session:{access_token:"synthetic-main-token"}},error:null});
function fixture({wrongUser=false,passwordError=false,abortAfterLogin=false,valid=true}={}) {
  const calls=[]; const controller=new AbortController();
  const result=(value)=>({then:(resolve)=>Promise.resolve(value).then(resolve),abortSignal(){return this;},setHeader(){return this;}});
  const client={auth:{getSession,async getUser(){calls.push("main:getUser"); return {data:{user:{id:"user-a",email:"user@example.test"}},error:null};}},rpc(name,args){calls.push({client:"main",name,args}); return result({data:name==="code3_current_session_valid"?valid:name==="code3_prepare_account_confirmation"?{challengeId:"challenge-a"}:true,error:null});}};
  const isolated={auth:{async signInWithPassword(credentials){assert.equal(credentials.email,"user@example.test"); assert.equal(credentials.password,"synthetic-password"); calls.push("isolated:signIn"); if(abortAfterLogin)controller.abort(); return {data:{user:{id:wrongUser?"user-b":"user-a"},session:passwordError?null:{access_token:"synthetic-token"}},error:passwordError?new Error("wrong"):null};},async signOut(options){calls.push({signOut:options});return {error:null};}},rpc(name,args){calls.push({client:"isolated",name,args});return result({data:{challengeId:"challenge-a",grant:"10000000-0000-4000-8000-000000000001".repeat(2),purpose:"BACKUP_RECOVERY",planDigest:digest},error:null});}};
  const service=createAccountSessionService({client,makeIsolatedClient:()=>isolated});
  return {service,calls,signal:controller.signal};
}
const options={purpose:"BACKUP_RECOVERY",planDigest:digest,password:"synthetic-password",userId:"user-a"};
{
  const {service,calls,signal}=fixture();
  const confirmation=await service.confirm({...options,signal});
  assert.equal(await service.consume(confirmation,{signal}),true); checks++;
  assert.equal(calls.filter(x=>x==="main:getUser").length,2); checks++;
  assert.deepEqual(calls.filter(x=>x?.signOut),[{signOut:{scope:"local"}}]); checks++;
  assert.ok(calls.some(x=>x?.client==="isolated"&&x.name==="code3_complete_account_confirmation")); checks++;
  assert.ok(calls.some(x=>x?.client==="main"&&x.name==="code3_consume_account_confirmation")); checks++;
  assert.equal(JSON.stringify(calls).includes("synthetic-password"),false); checks++;
}
for(const testCase of [{wrongUser:true},{passwordError:true},{abortAfterLogin:true},{valid:false}]) {
  const {service,calls,signal}=fixture(testCase);
  await assert.rejects(service.confirm({...options,signal})); checks++;
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(calls.some(x=>x?.name==="code3_complete_account_confirmation"),false); checks++;
  if(testCase.wrongUser||testCase.abortAfterLogin){assert.deepEqual(calls.filter(x=>x?.signOut),[{signOut:{scope:"local"}}]);checks++;}
}
{
  let finishedLogin;
  let closed=0;
  let completed=0;
  let requestSignal;
  const never=()=>new Promise(()=>{});
  const stalled=createAccountSessionService({requestTimeoutMs:10,client:{auth:{getSession,getUser:never}}});
  await assert.rejects(stalled.currentUser("user-a"),{code:"ACCOUNT_TIMEOUT"}); checks++;
  const stalledRpc=createAccountSessionService({requestTimeoutMs:10,client:{auth:{getSession},rpc(){return {setHeader(){return this;},abortSignal(signal){requestSignal=signal;return never();}};}}});
  await assert.rejects(stalledRpc.list(),{code:"ACCOUNT_TIMEOUT"}); checks++;
  assert.equal(requestSignal.aborted,true); checks++;
  const result=data=>({setHeader(){return this;},abortSignal(){return Promise.resolve({data,error:null});}});
  const client={auth:{getSession,async getUser(){return {data:{user:{id:"user-a",email:"user@example.test"}},error:null};}},rpc(name){return result(name==="code3_current_session_valid"?true:{challengeId:"challenge-a"});}};
  const isolated={auth:{signInWithPassword(){return new Promise(resolve=>{finishedLogin=resolve;});},async signOut(){closed++;return {error:null};}},rpc(){completed++;return result(null);}};
  const service=createAccountSessionService({client,makeIsolatedClient:()=>isolated,requestTimeoutMs:10});
  await assert.rejects(service.confirm(options),{code:"ACCOUNT_TIMEOUT"}); checks++;
  finishedLogin({data:{user:{id:"user-a"},session:{access_token:"synthetic-token"}},error:null});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(closed,1); checks++;
  assert.equal(completed,0); checks++;
}

{
  let mainToken="original-account-token";
  let verifiedToken;
  let sentToken;
  const service=createAccountSessionService({client:{auth:{async getSession(){return {data:{session:{access_token:mainToken}},error:null};},async getUser(token){verifiedToken=token;mainToken="next-account-token";return {data:{user:{id:"user-a"}},error:null};}},rpc(){return {setHeader(name,value){assert.equal(name,"Authorization");sentToken=value;return this;},abortSignal(){return Promise.resolve({data:true,error:null});}};}}});
  assert.equal((await service.currentUser("user-a")).id,"user-a"); checks++;
  assert.equal(verifiedToken,"original-account-token"); checks++;
  assert.equal(sentToken,"Bearer original-account-token"); checks++;
}
globalThis.window={location:{hostname:"code3tcg.app"}};
const untrusted=makeFallbackUserProfile({id:"user-a",email:"user@example.test",user_metadata:{full_name:"official admin ember",app_access:true,beta_status:"approved",app_role:"owner",plan_tier:"founder"}});
assert.equal(untrusted.appAccess,false); checks++;
assert.equal(untrusted.appRole,"user"); checks++;
assert.equal(untrusted.planTier,"free"); checks++;
assert.notEqual(untrusted.betaStatus,"approved"); checks++;
assert.equal(untrusted.fullName,"official admin ember"); checks++;
const trusted=makeFallbackUserProfile({id:"user-a",email:"user@example.test",app_metadata:{role:"admin"}});
assert.equal(trusted.appAccess,true); checks++;
{
  let inserted;
  let conflictOptions;
  const saved={id:"user-a",display_name:"Already saved collector",app_role:"beta_user",user_role:"user",tier:"free",app_access:true};
  const client={from(){return {upsert(row,options){inserted=row;conflictOptions=options;return {select(){return {async maybeSingle(){return {data:null,error:null};}};}};},select(){return {eq(){return {async maybeSingle(){return {data:saved,error:null};}};}};}};}};
  const profile=await createUserProfileIfMissing({id:"user-a",email:"user@example.test",user_metadata:{display_name:"Would overwrite existing",app_access:true,beta_status:"approved",little_sparks_status:"approved"}},{client,configured:true});
  assert.deepEqual(conflictOptions,{onConflict:"id",ignoreDuplicates:true}); checks++;
  assert.equal(inserted.app_access,false); checks++;
  assert.equal(inserted.beta_status,"not_requested"); checks++;
  assert.equal(inserted.little_sparks_status,"not_applied"); checks++;
  assert.equal(profile.displayName,saved.display_name); checks++;
  assert.equal(profile.appAccess,true); checks++;
  assert.equal(mapProfileRow({id:"user-a",email:"editable-profile@example.test"},{id:"user-a",email:"verified-account@example.test"}).email,"verified-account@example.test"); checks++;
}
console.log(JSON.stringify({passed:checks,realProviderCredentialsUsed:false,isolatedSessionCleanupVerified:true}));
