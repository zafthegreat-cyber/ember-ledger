const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");
const { execFileSync } = require("node:child_process");

const baseline = process.argv.includes("--baseline");
const output = path.resolve("artifacts/qa/account-lock", baseline ? "baseline" : "fixed");
const base = "http://127.0.0.1:5238";
const authModule = `
import { createClient } from '@supabase/supabase-js';
const ownerId='10000000-0000-4000-8000-000000000001';
window.qaOriginal=' {"items":[{"id":"existing-card","name":"Preserved card","quantity":2}]} ';
localStorage.setItem('et-tcg-beta-data',window.qaOriginal);
localStorage.setItem('code3.workspace-owner.v1',JSON.stringify({version:1,ownerId}));
localStorage.setItem('code3.cloud-saving-enabled.v1:'+ownerId,'false');
const user={id:ownerId,email:'collector@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},is_anonymous:false};
const expiresAt=Math.floor(Date.now()/1000)+(['expired','slow-refresh'].includes(window.qaMode)?-120:3600);
const token=(expiry)=>[btoa(JSON.stringify({alg:'HS256',typ:'JWT'})),btoa(JSON.stringify({sub:ownerId,aud:'authenticated',role:'authenticated',exp:expiry,iat:expiry-3600,session_id:ownerId})),btoa('synthetic-signature')].join('.');
const session=(expiry)=>({access_token:token(expiry),refresh_token:'synthetic-refresh',token_type:'bearer',expires_in:3600,expires_at:expiry,user});
localStorage.setItem('qa-real-sdk-auth',JSON.stringify(session(expiresAt)));
window.qaRequests=[];window.qaEvents=[];
async function fetchFixture(input,options={}){
 const url=new URL(typeof input==='string'?input:input.url);
 window.qaRequests.push(url.pathname);
 if(window.qaMode==='slow-user'&&url.pathname.endsWith('/user'))await new Promise(resolve=>setTimeout(resolve,16000));
 let data;
 if(url.pathname.endsWith('/user'))data=user;
 else if(url.pathname.endsWith('/token')){await new Promise(resolve=>setTimeout(resolve,window.qaMode==='slow-refresh'?16000:30));data=session(Math.floor(Date.now()/1000)+3600);}
 else if(url.pathname.endsWith('/logout'))data={};
 else if(url.pathname.endsWith('/code3_current_session_valid')){
  if(['slow-rpc','late-rpc'].includes(window.qaMode))await new Promise((resolve,reject)=>{
   const timer=setTimeout(resolve,16000);
   options.signal?.addEventListener('abort',()=>{window.qaAborted=true;if(window.qaMode==='slow-rpc'){clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));}},{once:true});
  });
  data=true;
 }
 else if(url.pathname.endsWith('/code3_workspace_read'))data={format:'code3-workspace-v1',revision:0,updatedAt:null,sources:{}};
 else if(url.pathname.endsWith('/code3_workspace_write'))data={format:'code3-workspace-v1',revision:1,updatedAt:new Date().toISOString(),sources:{}};
 else throw new Error('Unexpected synthetic request '+url.pathname);
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
}
export const isSupabaseConfigured=true;
export const supabase=createClient('${base}/__qa/provider','synthetic-public-key',{auth:{storageKey:'qa-real-sdk-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},global:{fetch:fetchFixture}});
export const createIsolatedAuthClient=()=>{throw new Error('No password proof used');};
supabase.auth.onAuthStateChange((event)=>{window.qaEvents.push(event);window.qaSignedOut=event==='SIGNED_OUT';});
window.qaClient=supabase;
if(window.qaMode==='duplicate-initial'){
 const subscribe=supabase.auth.onAuthStateChange.bind(supabase.auth);
 supabase.auth.onAuthStateChange=(callback)=>subscribe((event,value)=>{if(event==='INITIAL_SESSION'){callback(event,value);callback(event,value);}else if(event!=='SIGNED_IN')callback(event,value);});
}
if(['late-initial-session','late-initial-rejection','signout-startup','duplicate-initial'].includes(window.qaMode)){
 const original=supabase.auth.getSession.bind(supabase.auth);let first=true;
 supabase.auth.getSession=async()=>{const delayed=first;first=false;const result=await original();if(delayed){await new Promise(resolve=>setTimeout(resolve,['late-initial-rejection','duplicate-initial'].includes(window.qaMode)?250:16000));if(window.qaMode==='late-initial-rejection')throw new Error('Synthetic stale startup rejection');}return result;};
}
`;
const entry = `
import React from 'react';import {createRoot} from 'react-dom/client';
import './src/index.css';
import CloudWorkspaceBoundary from './src/features/persistence/CloudWorkspaceBoundary.jsx';
import {supabase} from './src/supabaseClient.js';
function RecordScreen(){const [signedOut,setSignedOut]=React.useState(window.qaSignedOut);React.useEffect(()=>{const {data}=supabase.auth.onAuthStateChange((_event,session)=>setSignedOut(!session));return ()=>data.subscription.unsubscribe();},[]);return <h1>{signedOut?'Signed out normally':'Saved records opened'}</h1>;}
createRoot(document.getElementById('root')).render(<CloudWorkspaceBoundary client={supabase} configured development={false}><RecordScreen/></CloudWorkspaceBoundary>);
`;

(async()=>{
 fs.mkdirSync(output,{recursive:true});
 await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'jsx'},bundle:true,jsx:'automatic',format:'esm',outfile:path.join(output,'fixture.js'),define:{'import.meta.env':'{}'},external:['/assets/*'],plugins:[{name:'real-sdk-fixture',setup(plugin){
  plugin.onResolve({filter:/supabaseClient(?:\.js)?$/},()=>({path:'supabaseClient',namespace:'fixture'}));plugin.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:authModule,loader:'js',resolveDir:process.cwd()}));
  if(baseline)plugin.onLoad({filter:/CloudWorkspaceBoundary\.jsx$/},({path:file})=>({contents:execFileSync('git',['show','865377b8a74738c8ecb260b75b33f8018387db83:src/features/persistence/CloudWorkspaceBoundary.jsx'],{encoding:'utf8'}),loader:'jsx',resolveDir:path.dirname(file)}));
 }}]});
 const browser=await chromium.launch({headless:true});const results=[];
 try {
  await Promise.all(['fresh','expired','slow-user','slow-refresh','late-initial-session','late-initial-rejection','signout-startup','slow-rpc','late-rpc','duplicate-initial'].map(async(mode)=>{
   const theme=['slow-rpc','late-rpc'].includes(mode)?'dark':'light';
   const context=await browser.newContext({viewport:{width:390,height:844}});
   await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base)return route.abort();
    if(url.pathname==='/__qa/account-lock')return route.fulfill({contentType:'text/html',body:`<!doctype html><html data-boot-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__qa/fixture.css"></head><body><div id="root"></div><script>window.qaMode=${JSON.stringify(mode)}</script><script type="module" src="/__qa/fixture.js"></script></body></html>`});
    if(url.pathname==='/__qa/fixture.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(output,'fixture.js'))});
    if(url.pathname==='/__qa/fixture.css')return route.fulfill({contentType:'text/css',body:fs.readFileSync(path.join(output,'fixture.css'))});
    return route.abort();
   });
   const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(base+'/__qa/account-lock');
   await page.getByRole('heading',{name:['slow-user','slow-refresh','slow-rpc','late-rpc'].includes(mode)?'Your records are safe':'Saved records opened',exact:true}).waitFor({timeout:20000});
   if(mode==='signout-startup'){
    await page.evaluate(()=>window.qaClient.auth.signOut({scope:'local'}));
    await page.getByRole('heading',{name:'Signed out normally',exact:true}).waitFor();
   }
   if(['fresh','expired'].includes(mode)){
    await page.evaluate(()=>window.qaClient.auth.refreshSession());
    await page.getByRole('heading',{name:'Saved records opened',exact:true}).waitFor({timeout:5000});
   }
   if(mode==='slow-refresh'){
    if(!baseline)assert.match(await page.locator('.cloud-workspace-screen details').textContent(),/READ_SESSION_TIMEOUT/);
    assert.equal(await page.evaluate(()=>localStorage.getItem('et-tcg-beta-data')===window.qaOriginal),true);
    await page.getByRole('heading',{name:'Saved records opened',exact:true}).waitFor({timeout:10000});
   }
   if(['late-initial-session','signout-startup'].includes(mode))await page.waitForTimeout(15500);
   if(mode==='late-initial-rejection')await page.waitForTimeout(400);
   if(['slow-rpc','late-rpc'].includes(mode))await page.waitForTimeout(1500);
   const state=await page.evaluate(async()=>({requests:window.qaRequests,events:window.qaEvents,locks:await navigator.locks.query(),message:document.querySelector('[role="alert"]')?.textContent||null,support:document.querySelector('.cloud-workspace-screen details')?.textContent||null,aborted:window.qaAborted===true,authRetained:Boolean(localStorage.getItem('qa-real-sdk-auth')),recordsPreserved:localStorage.getItem('et-tcg-beta-data')===window.qaOriginal,opened:document.querySelector('h1')?.textContent}));
   assert.deepEqual(errors,[]);assert.equal(state.authRetained,mode!=='signout-startup');assert.equal(state.recordsPreserved,true);
   if(['late-initial-session','late-initial-rejection','signout-startup'].includes(mode)){
    if(baseline)assert.match(state.message,mode==='late-initial-rejection'?/Synthetic stale startup rejection/:/account service is taking too long/);
    else assert.equal(state.message,null,'Late initial-session failure must not overwrite a newer verified account screen');
   }
   if(['fresh','expired','slow-refresh'].includes(mode)){
    assert.equal(state.message,null);assert.equal(state.locks.held.some(lock=>lock.name==='lock:qa-real-sdk-auth'),false);
   }
   if(!baseline&&mode==='duplicate-initial')assert.equal(state.requests.filter(request=>request.endsWith('/code3_current_session_valid')).length,1,'Same-turn duplicate initial auth events should coalesce into one account verification');
   if(!baseline&&['slow-user','slow-rpc','late-rpc'].includes(mode)){
    assert.match(state.message,/Account verification did not finish in time/);
    assert.match(state.support,new RegExp(mode==='slow-user'?'VERIFY_ACCOUNT_TIMEOUT':'VERIFY_SESSION_TIMEOUT'));
    assert.equal(state.opened,'Your records are safe');
    if(mode!=='slow-user')assert.equal(state.aborted,true,'Session verification timeout must abort its RPC');
    await page.getByText('Support details',{exact:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.screenshot({path:path.join(output,`390-${theme}-${mode}-support.png`),fullPage:true});
   }
   if(mode==='signout-startup'&&!baseline)assert.equal(state.opened,'Signed out normally');
   results.push({mode,...state});await context.close();
  }));
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({passed:true,mode:baseline?'865377b-baseline':'fixed',scenarios:results.length,allRecordsPreserved:results.every(result=>result.recordsPreserved),realSdk:'2.105.4',nativeWebLocks:true}));
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
