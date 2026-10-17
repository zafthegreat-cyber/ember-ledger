const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5238");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Only disposable loopback browser storage may be tested.");
const baseline = process.argv.includes("--baseline");
const output = path.resolve("artifacts/qa/workspace-storage-quota", baseline ? "baseline" : "fixed");
const ownerId = "10000000-0000-4000-8000-000000000001";
const original = ` \n${JSON.stringify({items:Array.from({length:6000},(_,index)=>({id:`quota-card-${index}`,name:`Collector inventory card ${index}`,quantity:1,purchasePrice:4,marketValue:6,notes:"Kept in a protective sleeve. Condition reviewed before trade. ".repeat(8)}))})}\n`;
const originalHash = createHash("sha256").update(original).digest("hex");
const authModule = `
const id=${JSON.stringify(ownerId)};
const user={id,email:'collector@example.test',is_anonymous:false};
const session={user,access_token:'synthetic-quota-test-only'};
const listeners=new Set();
const currentSession=()=>sessionStorage.getItem('__qa_signed_out')==='true'?null:session;
const emit=(event,value)=>{for(const callback of listeners)callback(event,value);};
export const isSupabaseConfigured=true;
export const supabase={auth:{
 async getUser(){return {data:{user:currentSession()?.user||null},error:null};},
 async getSession(){return {data:{session:currentSession()},error:null};},
 onAuthStateChange(callback){listeners.add(callback);queueMicrotask(()=>callback('INITIAL_SESSION',currentSession()));return {data:{subscription:{unsubscribe(){listeners.delete(callback);}}}};},
 async signOut(){sessionStorage.setItem('__qa_signed_out','true');emit('SIGNED_OUT',null);return {error:null};},
 async signInWithPassword({email,password}){
  window.__qaSignInCalls=(window.__qaSignInCalls||0)+1;
  if(window.__qaSignInMode==='pending')await new Promise(resolve=>{window.__qaFinishSignIn=resolve;});
  else await new Promise(resolve=>setTimeout(resolve,150));
  if(email!==user.email||password!=='synthetic-password')return {data:{session:null},error:{status:400,message:'Invalid credentials'}};
  sessionStorage.removeItem('__qa_signed_out');emit('SIGNED_IN',session);return {data:{user,session},error:null};
 },
},rpc(name,args={}){let signal;let request;const run=()=>request||(request=fetch('/__qa/quota-rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args}),signal}).then(result=>result.json()));return {then(resolve,reject){return run().then(resolve,reject);},abortSignal(value){signal=value;return this;},setHeader(){return this;}};}};
export const createIsolatedAuthClient=()=>{throw new Error('Password provider is not used in quota verification');};
`;
const entry = `
import React from 'react';import {createRoot} from 'react-dom/client';
import './src/index.css';import './src/App.css';
import CloudWorkspaceBoundary from './src/features/persistence/CloudWorkspaceBoundary.jsx';
import MenuPage from './src/pages/Menu.jsx';
import {AppShell} from './src/components/operations/OperationsUI.jsx';
import {supabase} from './src/supabaseClient.js';
import {claimWorkspaceOwner} from './src/features/persistence/workspaceOwnerBinding.js';
import {captureWorkspaceSources} from './src/features/persistence/cloudWorkspaceSources.js';
import {hashCanonicalJson} from './src/features/backup/canonicalJson.js';
window.qa={claim:()=>claimWorkspaceOwner({storage:localStorage,ownerId:${JSON.stringify(ownerId)},confirmed:true}),validate:()=>Object.keys(captureWorkspaceSources(localStorage))};
window.qa.archiveProof=async()=>{
 const reference=JSON.parse(localStorage.getItem('code3.workspace-device-archive-ref.v1:'+${JSON.stringify(ownerId)}));
 if(!reference)return {reference:null};
 const raw=await new Promise((resolve,reject)=>{
  const request=indexedDB.open('code3-workspace-safety-v1',1);
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const database=request.result;const transaction=database.transaction('payloads','readonly');const get=transaction.objectStore('payloads').get(reference.payloadKey);let result;get.onsuccess=()=>{result=get.result;};transaction.oncomplete=()=>{database.close();resolve(result);};transaction.onerror=()=>{database.close();reject(transaction.error);};};
 });
 const {hash,...payload}=JSON.parse(raw);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload.raws['et-tcg-beta-data']));
 return {reference,storedExact:payload.raws['et-tcg-beta-data']===localStorage.getItem('et-tcg-beta-data'),preservedCoreHash:[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join(''),sealMatches:await hashCanonicalJson(payload)===hash,referenceMatches:reference.hash===hash&&reference.payloadKey==='owner-archive:'+reference.ownerId+':'+hash,inlineArchive:localStorage.getItem('code3.workspace-device-archive.v1:'+${JSON.stringify(ownerId)})};
};
const theme=document.documentElement.dataset.theme;
createRoot(document.getElementById('root')).render(<CloudWorkspaceBoundary client={supabase} configured development={false}><AppShell className={'app app-command-shell app-settings app-theme-'+theme} data-theme={theme}><main className={'main app-shell-themed app-shell-'+theme} data-theme={theme}><MenuPage signedInWithSupabase betaAccessAllowed={()=>true} dashboardPresetLabel={()=>'Collector'} openUtilityPage={()=>{}} renderUtilityPageShell={({children,className=''})=><div className={'utility-page you-command-only-route '+className}><div className='utility-page-layout'>{children}</div></div>}/></main></AppShell></CloudWorkspaceBoundary>);
`;
async function state(page){return page.evaluate(async()=>{const raw=localStorage.getItem('et-tcg-beta-data');const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));return {hash:[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join(''),length:raw.length,binding:localStorage.getItem('code3.workspace-owner.v1'),auth:localStorage.getItem('sb-quota-auth-token')};});}
async function mobileLayout(page){return page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,controls:[...document.querySelectorAll('button')].filter(button=>button.getBoundingClientRect().height>0).map(button=>({label:button.textContent,height:button.getBoundingClientRect().height}))}));}
async function openCloud(page){const summary=page.locator('summary').filter({hasText:'Cloud saving & recovery'}).first();await summary.waitFor();await summary.click();await page.getByRole('heading',{name:'Cloud saving',exact:true}).waitFor();}
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'jsx'},bundle:true,jsx:'automatic',format:'esm',outfile:path.join(output,'fixture.js'),define:{'import.meta.env':'{}'},external:['/assets/*'],plugins:[{name:'quota-auth-fixture',setup(plugin){plugin.onResolve({filter:/supabaseClient(?:\.js)?$/},()=>({path:'supabaseClient',namespace:'quota'}));plugin.onLoad({filter:/.*/,namespace:'quota'},()=>({contents:authModule,loader:'js'}));}}]});
  const browser=await chromium.launch({headless:true});
  const results=[];let checks=0;
  try{
    for(const theme of ['light','dark'])for(const blocked of baseline?[false]:[false,true]){
      const name=`390-${theme}-${blocked?'both-unavailable':'native-quota'}`;
      const context=await browser.newContext({viewport:{width:390,height:844}});
      let remote={format:'code3-workspace-v1',revision:0,updatedAt:null,sources:{}};
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin!==base.origin)return route.abort();
        if(url.pathname==='/__qa/quota-rpc'&&route.request().method()==='POST'){
          const {name,args}=JSON.parse(route.request().postData());let data;
          if(name==='code3_current_session_valid')data=true;
          else if(name==='code3_register_account_session')data={id:ownerId};
          else if(name==='code3_list_account_sessions')data=[{id:ownerId,label:'Phone browser',current:true,lastSeenAt:new Date().toISOString()}];
          else if(name==='code3_workspace_read')data=remote;
          else if(name==='code3_workspace_write'){remote={format:'code3-workspace-v1',revision:args.p_expected_revision+1,updatedAt:new Date().toISOString(),sources:args.p_sources};data=remote;}
          else if(name==='code3_workspace_history')data=[];
          else return route.fulfill({json:{data:null,error:{code:'PGRST202',message:'Synthetic RPC not implemented'}}});
          return route.fulfill({json:{data,error:null}});
        }
        if(route.request().method()!=='GET')return route.abort();
        if(url.pathname==='/__qa/quota')return route.fulfill({contentType:'text/html',body:`<!doctype html><html data-theme="${theme}" data-boot-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Native storage quota proof</title><link rel="stylesheet" href="/__qa/quota.css"></head><body><div id="root"></div><script type="module" src="/__qa/quota.js"></script></body></html>`});
        if(url.pathname==='/__qa/quota.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(output,'fixture.js'))});
        if(url.pathname==='/__qa/quota.css')return route.fulfill({contentType:'text/css',body:fs.readFileSync(path.join(output,'fixture.css'))});
        return route.continue();
      });
      await context.addInitScript(({original,blocked})=>{
        if(!localStorage.getItem('et-tcg-beta-data')){localStorage.setItem('et-tcg-beta-data',original);localStorage.setItem('sb-quota-auth-token','synthetic-auth-preserved');}
        if(blocked)Object.defineProperty(window,'indexedDB',{configurable:true,get(){throw new DOMException('Synthetic IndexedDB unavailable','SecurityError');}});
        const nativeSet=Storage.prototype.setItem;
        Storage.prototype.setItem=function(key,value){
          if(this===localStorage&&sessionStorage.getItem('__qa_fail_recovery')==='true'){
            if(key==='code3.workspace-recovery.v1'&&JSON.parse(value).status==='COMMITTED')throw new DOMException('Synthetic interrupted commit','QuotaExceededError');
            if(key==='et-tcg-beta-data'&&localStorage.getItem('code3.workspace-recovery.v1')){
              if(sessionStorage.getItem('__qa_recovery_write_started')==='true')throw new DOMException('Synthetic rollback unavailable','QuotaExceededError');
              nativeSet.call(this,key,value);nativeSet.call(sessionStorage,'__qa_recovery_write_started','true');return;
            }
          }
          return nativeSet.call(this,key,value);
        };
      },{original,blocked});
      const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(new URL('/__qa/quota',base).href);
      await page.getByRole('heading',{name:'Keep your existing records'}).waitFor();
      assert.deepEqual(await page.evaluate(()=>window.qa.validate()),['legacy-core-business']);checks++;
      const quota=await page.evaluate(()=>{const raw=localStorage.getItem('et-tcg-beta-data');try{localStorage.setItem('__qa_native_duplicate_probe',raw);localStorage.removeItem('__qa_native_duplicate_probe');return {duplicateFits:true};}catch(error){return {duplicateFits:false,error:error.name};}});
      assert.deepEqual(quota,{duplicateFits:false,error:'QuotaExceededError'});checks++;
      assert.equal((await state(page)).hash,originalHash);checks++;
      await page.getByRole('button',{name:'These are my records'}).click();
      if(baseline||blocked){
        await page.getByRole('heading',{name:/Your records are safe|Device storage needs attention|Your saved records need recovery/}).waitFor();
        const failed=await state(page);assert.equal(failed.hash,originalHash);assert.equal(failed.binding,null);assert.equal(failed.auth,'synthetic-auth-preserved');checks+=3;
        assert.equal(await page.getByRole('heading',{name:'Cloud saving',exact:true}).count(),0);checks++;
        if(baseline){const code=await page.evaluate(async()=>{try{await window.qa.claim();return 'UNEXPECTED_SUCCESS';}catch(error){return error.code;}});assert.equal(code,'DEVICE_SAVE_FAILED');checks++;}
        const layout=await mobileLayout(page);assert.equal(layout.overflow,false);assert.ok(layout.controls.every(control=>control.height>=44));checks+=2;
        await page.screenshot({path:path.join(output,`${name}-blocked.png`),fullPage:true});
        results.push({name,originalBytes:original.length,nativeQuotaFailure:quota.error,originalHash,ownerBinding:null,failClosed:true});
      }else{
        await openCloud(page);
        await page.getByText('Phone browser · This device').waitFor();
        assert.equal((await state(page)).hash,originalHash);checks++;
        assert.equal(JSON.parse((await state(page)).binding).ownerId,ownerId);checks++;
        const proof=await page.evaluate(()=>window.qa.archiveProof());
        assert.equal(proof.reference.format,'code3-device-archive-reference');assert.equal(proof.storedExact,true);assert.equal(proof.sealMatches,true);assert.equal(proof.referenceMatches,true);assert.equal(proof.inlineArchive,null);checks+=5;
        assert.equal(remote.sources['legacy-core-business'].data.items.length,6000);checks++;
        const layout=await mobileLayout(page);assert.equal(layout.overflow,false);checks++;
        await page.locator('.cloud-workspace-panel').screenshot({path:path.join(output,`${name}-cloud-panel.png`)});
        await page.reload();await openCloud(page);
        assert.equal((await state(page)).hash,originalHash);checks++;
        assert.deepEqual(await page.evaluate(()=>window.qa.archiveProof()),proof);checks++;
        assert.equal((await state(page)).auth,'synthetic-auth-preserved');checks++;
        remote={...remote,revision:remote.revision+1,updatedAt:new Date().toISOString(),sources:{...remote.sources,'legacy-core-business':{schemaVersion:0,data:{...remote.sources['legacy-core-business'].data,items:[...remote.sources['legacy-core-business'].data.items,{id:'cloud-added-card',name:'Newer cloud record',quantity:1}]}}}};
        await page.evaluate(()=>sessionStorage.setItem('__qa_fail_recovery','true'));
        await page.reload();
        await page.getByRole('heading',{name:/Your records are safe|Device storage needs attention|Your saved records need recovery/}).waitFor();
        const journal=await page.evaluate(()=>localStorage.getItem('code3.workspace-recovery.v1'));
        assert.equal(JSON.parse(journal).status,'PREPARED');checks++;
        assert.equal(await page.getByRole('heading',{name:'Settings',exact:true}).count(),0);checks++;
        assert.equal((await page.evaluate(()=>window.qa.archiveProof())).preservedCoreHash,originalHash);checks++;
        await page.screenshot({path:path.join(output,`${name}-unresolved-recovery.png`),fullPage:true});
        await page.reload();
        await page.getByRole('heading',{name:/Your records are safe|Device storage needs attention|Your saved records need recovery/}).waitFor();
        assert.equal(await page.evaluate(()=>localStorage.getItem('code3.workspace-recovery.v1')),journal);checks++;
        assert.equal(await page.getByRole('heading',{name:'Settings',exact:true}).count(),0);checks++;
        assert.equal((await state(page)).auth,'synthetic-auth-preserved');checks++;
        await page.getByRole('button',{name:'Sign out',exact:true}).click();
        await page.getByRole('heading',{name:'Sign in to recover your records',exact:true}).waitFor();
        assert.equal(await page.getByRole('heading',{name:'Settings',exact:true}).count(),0);checks++;
        assert.equal(await page.evaluate(()=>localStorage.getItem('code3.workspace-recovery.v1')),journal);checks++;
        await page.reload();
        await page.getByRole('heading',{name:'Sign in to recover your records',exact:true}).waitFor();
        assert.equal(await page.getByRole('heading',{name:'Settings',exact:true}).count(),0);checks++;
        assert.equal(await page.evaluate(()=>localStorage.getItem('code3.workspace-recovery.v1')),journal);checks++;
        await page.setViewportSize({width:360,height:800});
        const signInLayout=await mobileLayout(page);
        assert.equal(signInLayout.overflow,false);assert.ok(signInLayout.controls.every(control=>control.height>=44));checks+=2;
        assert.equal(await page.locator('.cloud-workspace-screen').getAttribute('data-theme'),theme);checks++;
        await page.getByLabel('Email',{exact:true}).focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.getByLabel('Password',{exact:true}).evaluate(element=>document.activeElement===element),true);checks++;
        await page.screenshot({path:path.join(output,`360-${theme}-recovery-signin.png`),fullPage:true});
        await page.getByLabel('Email',{exact:true}).fill('collector@example.test');
        await page.getByLabel('Password',{exact:true}).fill('incorrect-synthetic-password');
        await page.getByRole('button',{name:'Sign in to recover',exact:true}).click();
        await page.getByRole('alert').filter({hasText:'Sign-in could not be completed'}).waitFor();
        assert.equal(await page.getByLabel('Password',{exact:true}).inputValue(),'');checks++;
        assert.equal(await page.evaluate(()=>localStorage.getItem('code3.workspace-recovery.v1')),journal);checks++;
        await page.evaluate(()=>{window.__qaSignInMode='pending';});
        await page.clock.install();
        await page.getByLabel('Password',{exact:true}).fill('synthetic-password');
        await page.getByRole('button',{name:'Sign in to recover',exact:true}).click();
        assert.equal(await page.getByLabel('Password',{exact:true}).inputValue(),'');checks++;
        await page.clock.fastForward(30001);
        await page.getByRole('alert').filter({hasText:'Sign-in is taking longer than expected'}).waitFor();
        assert.equal(await page.getByRole('button',{name:'Checking sign-in…',exact:true}).isDisabled(),true);checks++;
        await page.getByRole('form',{name:'Recovery sign-in'}).evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
        assert.equal(await page.evaluate(()=>window.__qaSignInCalls),2);checks++;
        assert.equal(await page.getByRole('heading',{name:'Settings',exact:true}).count(),0);checks++;
        await page.getByRole('button',{name:'Reload sign-in',exact:true}).click();
        await page.getByRole('heading',{name:'Sign in to recover your records',exact:true}).waitFor();
        assert.equal(await page.getByLabel('Password',{exact:true}).inputValue(),'');checks++;
        assert.equal(await page.evaluate(()=>localStorage.getItem('code3.workspace-recovery.v1')),journal);checks++;
        await page.getByLabel('Email',{exact:true}).fill('collector@example.test');
        await page.getByLabel('Password',{exact:true}).fill('synthetic-password');
        await page.getByRole('button',{name:'Sign in to recover',exact:true}).click();
        await page.getByRole('heading',{name:/Your records are safe|Device storage needs attention|Your saved records need recovery/}).waitFor();
        assert.equal(await page.getByRole('heading',{name:'Settings',exact:true}).count(),0);checks++;
        assert.equal(await page.evaluate(()=>localStorage.getItem('code3.workspace-recovery.v1')),journal);checks++;
        assert.equal((await state(page)).auth,'synthetic-auth-preserved');checks++;
        assert.equal((await page.evaluate(()=>window.qa.archiveProof())).preservedCoreHash,originalHash);checks++;
        await page.evaluate(()=>sessionStorage.removeItem('__qa_fail_recovery'));
        await page.reload();await openCloud(page);
        assert.equal(await page.evaluate(()=>localStorage.getItem('code3.workspace-recovery.v1')),null);checks++;
        assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('et-tcg-beta-data')).items.length),6001);checks++;
        assert.equal((await page.evaluate(()=>window.qa.archiveProof())).preservedCoreHash,originalHash);checks++;
        results.push({name,originalBytes:original.length,nativeQuotaFailure:quota.error,originalHash,claimAndReload:true,syncRecordCount:6000,unresolvedRecoveryBlocksApp:true,signOutAndReloadCannotBypassRecovery:true,signInErrorTimeoutAndReload:true,recoveredAfterStorageReturns:true});
      }
      assert.deepEqual(errors,[]);checks++;
      await context.close();
    }
    const report={mode:baseline?'baseline':'fixed',passed:checks,realComponents:true,nativeLocalStorage:true,realUserData:false,results};
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
