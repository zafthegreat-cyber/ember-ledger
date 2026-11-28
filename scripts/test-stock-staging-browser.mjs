import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {writeFile,rm,mkdtemp,realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,dirname,basename} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {createServer} from "vite";
import react from "@vitejs/plugin-react";
import {chromium,expect} from "@playwright/test";
import {browserConfig,cliCredentials} from "./lib/staging-credentials.mjs";

export async function runStagingBrowser(supplied,{adminFetch=fetch,routeStaging,onProgress=()=>{}}={}){
const config=browserConfig({CODE3_STAGING_PROJECT_REF:supplied.ref,CODE3_STAGING_ANON_KEY:supplied.anon,CODE3_STAGING_SERVICE_ROLE_KEY:supplied.service});
const created=[],results=[];
const root=fileURLToPath(new URL("../",import.meta.url));
const filename=`.pr50-staging-qa-${randomUUID()}.html`;
const file=new URL("../"+filename,import.meta.url);
const local="http://localhost:5173";
let server,browser;
const cacheDir=await mkdtemp(join(tmpdir(),"code3-staging-vite-"));
async function admin(path,method="GET",body){
  const url=new URL(path,config.origin);
  if(url.origin!==config.origin)throw new Error("Staging administrator origin mismatch.");
  const response=await adminFetch(url,{method,redirect:"error",signal:AbortSignal.timeout(15000),headers:{apikey:config.service,Authorization:`Bearer ${config.service}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw new Error(`Staging administrator request failed (${response.status}); credentials omitted.`);
  return response.status===204?null:response.json();
}
async function signIn(page,account){
  await page.getByLabel("Test email").fill(account.email);
  await page.getByLabel("Test password").fill(account.password);
  await page.getByRole("button",{name:"Test sign in",exact:true}).click();
  await expect(page.getByTestId("test-auth-status")).toHaveText("Signed in");
}
async function signOut(page){
  await page.getByRole("button",{name:"Test sign out",exact:true}).click();
  await expect(page.getByText("Sign in to Code 3 TCG to save watch preferences to your account.")).toBeVisible();
}
try{
  // Standard server-side Admin API, confined to the disposable branch. It never
  // returns credentials to a page and creates confirmed accounts without email.
  for(const role of ["owner","admin","memberA","memberB","moderator"]){
    const email=`pr50-browser-${role.toLowerCase()}-${randomBytes(6).toString("hex")}@example.invalid`;
    const password=randomBytes(30).toString("base64url")+"!Aa7";
    const user=await admin("/auth/v1/admin/users","POST",{email,password,email_confirm:true});
    const account={id:user.id,email,password,role};created.push(account);
    if(["owner","admin","moderator"].includes(role))await admin(`/rest/v1/profiles?id=eq.${user.id}`,"PATCH",{app_role:role,user_role:role==="owner"?"user":role});
  }
  const by=Object.fromEntries(created.map(account=>[account.role,account]));
  onProgress("Disposable accounts prepared");
  await writeFile(file,`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React,{useState} from "react";import {createRoot} from "react-dom/client";
import {supabase} from "/src/supabaseClient.js";
import Preferences from "/src/components/StockAlertPreferences.jsx";
import Warehouse from "/src/components/WarehouseInboundPanel.jsx";
function Fixture(){const [status,setStatus]=useState("Signed out");return React.createElement(React.Fragment,null,
React.createElement("form",{onSubmit:async event=>{event.preventDefault();const form=event.currentTarget;const values=new FormData(form);const {error}=await supabase.auth.signInWithPassword({email:values.get("email"),password:values.get("password")});if(!error)form.reset();setStatus(error?"Sign-in failed":"Signed in");}},
React.createElement("label",null,"Test email",React.createElement("input",{name:"email",type:"email",autoComplete:"off"})),
React.createElement("label",null,"Test password",React.createElement("input",{name:"password",type:"password",autoComplete:"off"})),React.createElement("button",{type:"submit"},"Test sign in")),
React.createElement("p",{"data-testid":"test-auth-status"},status),React.createElement("button",{onClick:async()=>{await supabase.auth.signOut();setStatus("Signed out");}},"Test sign out"),React.createElement(Preferences),React.createElement(Warehouse));}
createRoot(document.getElementById("root")).render(React.createElement(Fixture));</script>`);
  server=await createServer({root,cacheDir,configFile:false,envFile:false,envDir:false,logLevel:"silent",plugins:[react()],define:{"import.meta.env.VITE_SUPABASE_URL":JSON.stringify(config.origin),"import.meta.env.VITE_SUPABASE_ANON_KEY":JSON.stringify(config.anon)},server:{host:"127.0.0.1",port:5173,strictPort:true,allowedHosts:["localhost"]}});
  await server.listen();
  onProgress("Local fixture listening");
  browser=await chromium.launch({headless:true});
  for(const width of [390,1440]){
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:"block",acceptDownloads:false});
    const blocked=[];
    await context.route("**/*",route=>{
      const request=route.request(),url=new URL(request.url());
      if(![local,config.origin].includes(url.origin)){blocked.push(url.origin);return route.abort();}
      assert(!Object.values(request.headers()).some(value=>value.includes(config.service)),"Administrator credential reached browser");
      assert(!url.pathname.startsWith("/auth/v1/admin/"),"Browser attempted admin API");
      if(routeStaging&&url.origin===config.origin)return routeStaging(route);
      return route.continue();
    });
    const page=await context.newPage();const errors=[];
    page.on("pageerror",()=>errors.push("Browser script error"));
    try{
      await page.goto(`${local}/${filename}`,{waitUntil:"domcontentloaded",timeout:60000});
      onProgress(`Browser fixture opened at ${width}px`);
      const panel=page.getByRole("region",{name:"Stock alert preferences"});
      const optIn=panel.getByRole("checkbox",{name:/Save my future alert opt-in/});
      const target=panel.getByRole("checkbox",{name:"Target",exact:true});
      const staff=page.getByText(/Staff-only inbound tracking/);
      await expect(page.getByText("Sign in to Code 3 TCG to save watch preferences to your account.")).toBeVisible();await expect(staff).toHaveCount(0);
      await signIn(page,by.memberA);await expect(optIn).not.toBeChecked();await expect(staff).toHaveCount(0);
      await target.check();await optIn.check();await panel.getByRole("checkbox",{name:/Hold future notifications/}).check();
      await panel.getByRole("button",{name:"Save preferences",exact:true}).click();await expect(panel.getByText(/Saved to your account/)).toBeVisible();
      await page.reload();await expect(optIn).toBeChecked();await expect(target).toBeChecked();await expect(panel.getByRole("checkbox",{name:/Hold future notifications/})).toBeChecked();
      await signOut(page);await expect(staff).toHaveCount(0);
      await signIn(page,by.memberB);await expect(optIn).not.toBeChecked();await expect(target).not.toBeChecked();
      const isolation=await page.evaluate(async ({otherUser,origin,anon})=>{
        const {supabase}=await import('/src/supabaseClient.js');
        const read=await supabase.from('stock_alert_preferences').select('user_id').eq('user_id',otherUser);
        const write=await supabase.from('stock_alert_preferences').upsert({user_id:otherUser,enabled:false},{onConflict:'user_id'});
        const {data:{session}}=await supabase.auth.getSession();
        const denial=await fetch(new URL('/functions/v1/code3-stock-inbound',origin),{headers:{apikey:anon,Authorization:`Bearer ${session.access_token}`}});
        return {readDenied:!read.error&&read.data.length===0,writeDenied:Boolean(write.error),staffDenied:[401,403].includes(denial.status)};
      },{otherUser:by.memberA.id,origin:config.origin,anon:config.anon});
      assert.deepEqual(isolation,{readDenied:true,writeDenied:true,staffDenied:true});await signOut(page);
      await signIn(page,by.memberA);await expect(optIn).toBeChecked();await optIn.uncheck();await panel.getByRole("button",{name:"Save preferences",exact:true}).click();await expect(panel.getByText(/Saved to your account/)).toBeVisible();
      await page.reload();await expect(optIn).not.toBeChecked();await panel.getByRole("button",{name:"Clear my preferences"}).click();await expect(panel.getByText(/have been cleared/)).toBeVisible();await signOut(page);
      await signIn(page,by.moderator);await expect(optIn).toBeVisible();await expect(staff).toHaveCount(0);await signOut(page);
      await signIn(page,by.owner);await expect(staff).toBeVisible();await staff.click();
      await page.getByLabel("Reported stage").selectOption(width===390?"ordered":"en_route");
      await page.getByPlaceholder("Example: Warehouse inventory reported, awaiting independent verification").fill(`Synthetic PR50 browser validation ${randomUUID()}`);
      await page.getByRole("button",{name:"Save private stage report"}).click();await expect(page.getByText(/Stage report saved privately/)).toBeVisible();await signOut(page);await expect(staff).toHaveCount(0);
      await signIn(page,by.admin);await expect(staff).toBeVisible();
      await admin(`/rest/v1/profiles?id=eq.${by.admin.id}`,"PATCH",{app_role:"user",user_role:"user"});await page.reload();await expect(optIn).toBeVisible();await expect(staff).toHaveCount(0);await signOut(page);
      await admin(`/rest/v1/profiles?id=eq.${by.admin.id}`,"PATCH",{app_role:"admin",user_role:"admin"});
      assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
      results.push({width,passed:true,checks:["guest denial","normal Auth sign-in","member/moderator staff denial","opt-in and quiet-hours persistence","account switching","opt-out persistence","preference deletion","owner warehouse save","staff UI cleared on sign-out","fresh demotion denial","network isolation","no administrator credential in browser"]});
    }finally{await context.close();}
  }
}finally{
  await Promise.allSettled([browser?.close(),server?.close(),rm(file,{force:true})]);
  // Resolve and check the actual target before recursively deleting a temp cache.
  const resolvedCache=await realpath(cacheDir),tempRoot=await realpath(tmpdir());
  if(dirname(resolvedCache)===tempRoot&&basename(resolvedCache).startsWith("code3-staging-vite-"))await rm(resolvedCache,{recursive:true,force:true});
  const cleanup=[];
  for(const account of created){try{await admin(`/auth/v1/admin/users/${account.id}`,"DELETE");}catch{cleanup.push(account.id);}}
  await writeFile(new URL("../isolated-browser-results.local.json",import.meta.url),JSON.stringify({mode:routeStaging?"offline transport fixture":"hosted",project:config.ref,results,cleanupFailures:cleanup},null,2));
  if(cleanup.length)throw new Error("Some disposable accounts need cleanup; see the local results file. No credentials were saved.");
}
return results;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2);
  if(args.includes("--help"))console.log("Usage: CODE3_STAGING_PROJECT_REF=<approved ref> node scripts/test-stock-staging-browser.mjs [--branch-id <approved UUID>]. Administrator credentials stay in Node; no public setup function or session export.");
  else{
    if(args.length&&!(args.length===2&&args[0]==="--branch-id"))throw new Error("Unexpected arguments.");
    const config=browserConfig(args.length?cliCredentials(args[1],process.env.CODE3_STAGING_PROJECT_REF):process.env);
    try{
      const results=await runStagingBrowser(config);
      console.log(`Real staging browser checks passed at ${results.map(result=>result.width).join("px and ")}px. Disposable accounts removed.`);
    }catch{
      console.error("Staging browser validation failed. Check the local summary and staging logs; credentials are omitted.");process.exitCode=1;
    }
  }
}
