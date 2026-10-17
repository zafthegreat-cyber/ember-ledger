const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5238");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname));
const output = path.resolve("artifacts/qa/accounts-cloud-recovery/browser");
const A = "10000000-0000-4000-8000-000000000001";
const B = "10000000-0000-4000-8000-000000000002";
const original = ' {"items":[{"id":"original-card","name":"Original collector record","quantity":2}]} ';
const authModule = `
const A=${JSON.stringify(A)};
let id=sessionStorage.getItem('__qa_user')||A;
let valid=true;
let challenge=null;
const listeners=new Set();
const user=()=>id?{id,email:id===A?'collector@example.test':'seller@example.test',is_anonymous:false}:null;
const clouds=()=>JSON.parse(localStorage.getItem('__qa_clouds')||'{}');
const empty=()=>({format:'code3-workspace-v1',revision:0,updatedAt:null,sources:{}});
const session=()=>user()?{user:user(),access_token:'synthetic-only-token-'+id}:null;
window.qa={
changeUser(next){id=next;sessionStorage.setItem('__qa_user',next||'');valid=true;for(const listener of listeners)listener(next?'SIGNED_IN':'SIGNED_OUT',session());},
revoke(){valid=false;window.dispatchEvent(new Event('focus'));},
holdRead:false,releaseRead:null,
};
export const isSupabaseConfigured=true;
export const supabase={auth:{async getUser(){return {data:{user:user()},error:null};},async getSession(){return {data:{session:session()},error:null};},onAuthStateChange(callback){listeners.add(callback);queueMicrotask(()=>callback('INITIAL_SESSION',session()));return {data:{subscription:{unsubscribe(){listeners.delete(callback);}}}};},async signOut(){window.qa.changeUser(null);return {error:null};}},rpc(name,args={}){
 const run=async()=>{
 if(name==='code3_current_session_valid')return {data:valid,error:null};
 if(!valid)return {data:null,error:{code:'28000',message:'workspace_session_required'}};
 if(name==='code3_register_account_session')return {data:{id:A},error:null};
 if(name==='code3_list_account_sessions')return {data:[{id:A,label:'Computer browser',current:true,lastSeenAt:new Date().toISOString()}],error:null};
 if(name==='code3_prepare_account_confirmation'){challenge={challengeId:A,purpose:args.operation_purpose,planDigest:args.operation_digest,grant:A.repeat(2)};return {data:{challengeId:A},error:null};}
 if(name==='code3_complete_account_confirmation')return {data:challenge,error:null};
 if(name==='code3_consume_account_confirmation')return {data:Boolean(challenge&&args.challenge_id===challenge.challengeId&&args.confirmation_token===challenge.grant&&args.operation_digest===challenge.planDigest),error:null};
 const all=clouds();const versions=all[id]||[];
 if(name==='code3_workspace_read'){
   if(args.p_revision!=null&&window.qa.holdRead)await new Promise(resolve=>{window.qa.releaseRead=resolve;});
   return {data:args.p_revision==null?(versions.at(-1)||empty()):(versions.find(x=>x.revision===args.p_revision)||empty()),error:null};
 }
 if(name==='code3_workspace_write'){const snapshot={format:'code3-workspace-v1',revision:args.p_expected_revision+1,updatedAt:new Date().toISOString(),sources:args.p_sources};all[id]=[...versions,snapshot];localStorage.setItem('__qa_clouds',JSON.stringify(all));return {data:snapshot,error:null};}
 if(name==='code3_workspace_history')return {data:versions.map(({revision,updatedAt})=>({revision,updatedAt})),error:null};
 return {data:null,error:{message:'Unsupported synthetic probe '+name}};
 };
 let query;const get=()=>query||(query=run());return {then(resolve,reject){return get().then(resolve,reject);},abortSignal(){return this;},setHeader(){return this;}};
}};
export const createIsolatedAuthClient=()=>({auth:{getSession:supabase.auth.getSession,async signInWithPassword({password}){if(password!=='synthetic-password')return {data:null,error:{message:'Synthetic password rejected'}};return {data:{user:user(),session:{access_token:'isolated-synthetic-token'}},error:null};},async signOut(){return {error:null};}},rpc:supabase.rpc});
`;
const entry = `
import React from 'react';import {createRoot} from 'react-dom/client';
import './src/index.css';
import './src/App.css';
import CloudWorkspaceBoundary from './src/features/persistence/CloudWorkspaceBoundary.jsx';
import MenuPage from './src/pages/Menu.jsx';
import {AppShell} from './src/components/operations/OperationsUI.jsx';
import {supabase} from './src/supabaseClient.js';
import {preserveWorkspaceConflictCopy} from './src/features/persistence/cloudWorkspaceRecoveryCopies.js';
import {captureWorkspaceSources} from './src/features/persistence/cloudWorkspaceSources.js';
import {verifyBackupEnvelope} from './src/features/backup/backupFormat.js';
import {createVerifiedWorkspaceSnapshotBackup} from './src/features/backup/workspaceRestorePlan.js';
window.qa.preserve=()=>preserveWorkspaceConflictCopy({storage:localStorage,ownerId:${JSON.stringify(A)},copyId:crypto.randomUUID(),sources:captureWorkspaceSources(localStorage),cloudRevision:1});
window.qa.verifyBackup=verifyBackupEnvelope;
window.qa.recoveryBackup=()=>createVerifiedWorkspaceSnapshotBackup({'legacy-core-business':{schemaVersion:0,data:{items:[{id:'recovered-card',name:'Recovered missing card',quantity:1}]}}});
const theme=document.documentElement.dataset.theme;
createRoot(document.getElementById('root')).render(<CloudWorkspaceBoundary client={supabase} configured development={false}><AppShell className={'app app-command-shell app-settings app-theme-'+theme} data-theme={theme}><main className={'main app-shell-themed app-shell-'+theme} data-theme={theme}><MenuPage signedInWithSupabase betaAccessAllowed={()=>true} dashboardPresetLabel={()=>'Collector'} openUtilityPage={()=>{}} renderUtilityPageShell={({children,className=''})=><div className={'utility-page you-command-only-route '+className}><div className='utility-page-layout'>{children}</div></div>}/></main></AppShell></CloudWorkspaceBoundary>);
`;
async function openCloudPanel(page){
  const disclosure=page.locator('details').filter({has:page.locator('summary').getByText('Cloud saving & recovery',{exact:true})}).first();
  await disclosure.waitFor({state:'visible'});
  if(await disclosure.getAttribute('open')===null)await disclosure.locator('summary').first().click();
  await page.getByRole('heading',{name:'Cloud saving',exact:true}).waitFor();
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:"jsx"},bundle:true,jsx:"automatic",format:"esm",outfile:path.join(output,"fixture.js"),define:{"import.meta.env":"{}"},external:["/assets/*"],plugins:[{name:"disposable-auth",setup(plugin){plugin.onResolve({filter:/supabaseClient(?:\.js)?$/},()=>({path:"supabaseClient",namespace:"fixture"}));plugin.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:authModule,loader:"js"}));}}]});
  const browser=await chromium.launch({headless:true});
  const results=[];let checks=0;
  try {
    for(const width of [360,390,1440])for(const theme of ["light","dark"]){
      const label=`${width}-${theme}`;
      const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
      await context.route("**/*",route=>{
        const url=new URL(route.request().url());
        if(url.origin!==base.origin||route.request().method()!=="GET")return route.abort();
        if(url.pathname==="/__qa/cloud-accounts")return route.fulfill({contentType:"text/html",body:`<!doctype html><html data-theme="${theme}"><head><title>Account cloud verification</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__qa/fixture.css"></head><body><div id="root"></div><script type="module" src="/__qa/fixture.js"></script></body></html>`});
        if(url.pathname==="/__qa/fixture.js")return route.fulfill({contentType:"text/javascript",body:fs.readFileSync(path.join(output,"fixture.js"))});
        if(url.pathname==="/__qa/fixture.css")return route.fulfill({contentType:"text/css",body:fs.readFileSync(path.join(output,"fixture.css"))});
        return route.continue();
      });
      await context.addInitScript(({original,A})=>{if(!localStorage.getItem('__qa_seeded')){localStorage.setItem('__qa_seeded','true');localStorage.setItem('et-tcg-beta-data',original);sessionStorage.setItem('private-business-hub.deal-analysis-draft.v1','  exact draft bytes  ');sessionStorage.setItem('__qa_user',A);sessionStorage.setItem('sb-qa-auth-token','synthetic-auth-only');}}, {original,A});
      const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(new URL('/__qa/cloud-accounts',base).href);
      await page.getByRole('heading',{name:'Keep your existing records'}).waitFor().catch(async error=>{console.error({errors,body:await page.locator('body').innerText()});throw error;});
      assert.equal(await page.evaluate(()=>localStorage.getItem('et-tcg-beta-data')),original);checks++;
      await page.keyboard.press('Tab');
      const focus=await page.evaluate(()=>({text:document.activeElement.textContent,outline:getComputedStyle(document.activeElement).outlineStyle,height:document.activeElement.getBoundingClientRect().height}));
      assert.equal(focus.text,'These are my records');assert.notEqual(focus.outline,'none');assert.ok(focus.height>=44);checks+=3;
      await page.screenshot({path:path.join(output,`${label}-claim.png`),fullPage:true});
      await page.getByRole('button',{name:'These are my records'}).click();
      await openCloudPanel(page);
      await page.getByRole('button',{name:'Refresh devices'}).waitFor({state:'visible'});
      await page.getByText('Computer browser · This device').waitFor();
      assert.equal(await page.evaluate(()=>localStorage.getItem('et-tcg-beta-data')),original);checks++;
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('private-business-hub.deal-analysis-draft.v1')),'  exact draft bytes  ');checks++;
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('sb-qa-auth-token')),'synthetic-auth-only');checks++;
      await page.screenshot({path:path.join(output,`${label}-settings.png`),fullPage:true});
      await page.locator('.cloud-workspace-panel').screenshot({path:path.join(output,`${label}-cloud-saving-panel.png`)});
      const iconSizes=await page.locator('.settings-layout__arrow').evaluateAll(icons=>icons.map(icon=>({width:icon.getBoundingClientRect().width,height:icon.getBoundingClientRect().height})));
      assert.ok(iconSizes.every(icon=>icon.width<=24&&icon.height<=24));checks++;
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);checks++;
      await page.getByText('Saved cloud versions',{exact:true}).click();
      await page.getByRole('button',{name:'Load version history'}).click();
      const downloadEvent=page.waitForEvent('download');
      await page.getByRole('button',{name:'Download version 1',exact:true}).click();
      const saved=JSON.parse(fs.readFileSync(await (await downloadEvent).path(),'utf8'));
      const verification=await page.evaluate(value=>window.qa.verifyBackup(value),saved);
      assert.equal(verification.valid,true);checks++;
      await page.evaluate(()=>window.qa.preserve());
      await page.getByText('Preserved device versions',{exact:true}).click();
      await page.getByRole('button',{name:'Load device recovery copies'}).click();
      const copyEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Download preserved copy',exact:true}).click();
      const copy=JSON.parse(fs.readFileSync(await (await copyEvent).path(),'utf8'));
      assert.equal((await page.evaluate(value=>window.qa.verifyBackup(value),copy)).valid,true);checks++;
      let lateDownloads=0;page.on('download',()=>lateDownloads++);
      await page.evaluate(()=>{window.qa.holdRead=true;});
      await page.getByRole('button',{name:'Download version 1',exact:true}).click();
      await page.waitForFunction(()=>Boolean(window.qa.releaseRead));
      await page.evaluate(B=>window.qa.changeUser(B),B);
      await page.getByRole('heading',{name:'Open this account’s records'}).waitFor();
      await page.evaluate(()=>window.qa.releaseRead());
      await page.waitForTimeout(100);assert.equal(lateDownloads,0);checks++;
      await page.getByRole('button',{name:'Preserve and switch accounts'}).click();
      await openCloudPanel(page);
      assert.equal(await page.evaluate(()=>localStorage.getItem('et-tcg-beta-data')),null);checks++;
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('private-business-hub.deal-analysis-draft.v1')),null);checks++;
      await page.evaluate(A=>window.qa.changeUser(A),A);
      await page.getByRole('button',{name:'Preserve and switch accounts'}).click();
      await openCloudPanel(page);
      assert.equal(await page.evaluate(()=>localStorage.getItem('et-tcg-beta-data')),original);checks++;
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('private-business-hub.deal-analysis-draft.v1')),'  exact draft bytes  ');checks++;
      const recovery=await page.evaluate(()=>window.qa.recoveryBackup());
      await page.getByRole('button',{name:'Recover from backup',exact:true}).click();
      await page.getByLabel('Select backup').setInputFiles({name:'synthetic-recovery.json',mimeType:'application/json',buffer:Buffer.from(recovery.json)});
      await page.getByText('Records to add',{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>localStorage.getItem('et-tcg-beta-data')),original);checks++;
      await page.getByLabel('Confirm your password').fill('synthetic-password');
      await page.screenshot({path:path.join(output,`${label}-recovery-preview.png`),fullPage:true});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);checks++;
      await page.getByRole('button',{name:'Verify account and recover missing records',exact:true}).click();
      await openCloudPanel(page);
      const recovered=await page.evaluate(()=>JSON.parse(localStorage.getItem('et-tcg-beta-data')));
      assert.deepEqual(recovered.items.map(item=>item.id),['original-card','recovered-card']);checks++;
      assert.equal(recovered.items[0].quantity,2);checks++;
      await page.evaluate(()=>window.qa.revoke());
      await page.getByRole('heading',{name:'Your records are safe'}).waitFor();
      assert.equal(await page.getByRole('heading',{name:'Cloud saving',exact:true}).count(),0);checks++;
      assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('et-tcg-beta-data'))),recovered);checks++;
      await page.screenshot({path:path.join(output,`${label}-revoked.png`),fullPage:true});
      assert.deepEqual(errors,[]);checks++;
      results.push({viewport:width,theme,claimPreservesOriginal:true,accountSwitchIsolated:true,lateDownloadBlocked:true,additiveRecoveryViaUI:true,revocationLocksApp:true,overflow:false});
      await context.close();
    }
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:checks,realProviderCredentialsUsed:false,realComponents:true,results},null,2));
    console.log(JSON.stringify({passed:checks,realComponents:true,results}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
