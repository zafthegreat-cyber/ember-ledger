import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {browseAlerts,alertReason,alertSource,pausedAlertIds,notificationDeliveryStatus} from '../src/utils/notificationBrowse.mjs';
import {readSessionLabels,saveSessionLabel,filterAccountSessions} from '../src/utils/accountDisplayPreferences.mjs';
import {readLegacyStorageLocation,writeLegacyStorageLocation} from '../src/utils/legacyStorageMetadata.mjs';
import {announceNewNotifications,requestDeviceNotifications,DEVICE_NOTIFICATION_SEEN_KEY} from '../src/utils/deviceNotifications.js';

const now=Date.parse('2026-11-13T18:00:00Z');
const rows=Object.freeze([
 Object.freeze({id:'s',title:'Target packs',message:'A saved store',category:'favorite_store_alert',relatedStoreId:'target-1',createdAt:new Date(now-60000).toISOString(),priority:'normal'}),
 Object.freeze({id:'a',title:'Account notice',message:'Review your account',category:'account_update',createdAt:new Date(now-120000).toISOString(),priority:'urgent',dismissible:false}),
 Object.freeze({id:'p',title:'Espeon',message:'Product report',category:'saved_product_alert',relatedProductId:'espeon',createdAt:new Date(now-180000).toISOString(),readAt:'read',priority:'high'}),
]);
const memory=()=>{const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value)}};
test('161/162/167 counts, search and ordering agree without mutating source rows',()=>{
 const before=JSON.stringify(rows);const result=browseAlerts(rows,{unreadOnly:true,pendingIds:new Set(['a'])});
 assert.deepEqual(result.counts,{all:1,restocks:0,stores:1,account:0});
 assert.deepEqual(browseAlerts(rows,{query:'target packs',filter:'stores'}).matching.map(x=>x.id),['s']);
 assert.deepEqual(browseAlerts(rows,{order:'priority'}).matching.map(x=>x.id),['a','p','s']);
 assert.equal(JSON.stringify(rows),before);
});
test('166/168 reasons require metadata and OS permission is not push registration',()=>{
 assert.equal(alertReason({category:'favorite_store_alert'}),'');assert.match(alertReason(rows[0]),/follow/);
 assert.equal(alertSource(rows[1]),null);assert.match(notificationDeliveryStatus({permission:'granted'}).delivery,/not confirmed/);
 assert.match(notificationDeliveryStatus({registration:'failed'}).delivery,/failed/);
});
test('169 pauses match exact source, preserve unknown times, and expire for inbox display',()=>{
 const pauses=[{key:'store:target-1',startedAt:now-120000,until:now+3600000}];
 assert.deepEqual([...pausedAlertIds(rows,pauses,now,{activeOnly:true})],['s']);
 assert.equal(pausedAlertIds(rows,pauses,now+7200000,{activeOnly:true}).size,0);
 assert.equal(pausedAlertIds([{...rows[0],createdAt:''}],pauses,now).size,0);
 assert.equal(pausedAlertIds([{...rows[0],relatedStoreId:'target-2'}],pauses,now).size,0);
 assert.equal(pausedAlertIds(rows,pauses,now+7200000).has('s'),true);
});
test('169 suppressed notices do not buzz in a burst after a pause',()=>{
 const storage=memory();storage.setItem(DEVICE_NOTIFICATION_SEEN_KEY,JSON.stringify(['prior']));let shown=0;
 function Notification(){shown++;}Notification.permission='granted';Notification.requestPermission=async()=> 'granted';
 const fresh=[{...rows[0],createdAt:new Date().toISOString()}];
 announceNewNotifications(fresh,{storage,globalObject:{Notification},mutedIds:new Set(['s'])});
 announceNewNotifications(fresh,{storage,globalObject:{Notification}});assert.equal(shown,0);
});
test('168 granting permission returns the actual supported API state',async()=>{
 function Notification(){}Notification.permission='default';Notification.requestPermission=async()=>{Notification.permission='granted';return 'granted'};
 assert.equal((await requestDeviceNotifications({Notification})).permission,'granted');
});
test('198/199 names are account-scoped display metadata and revoked history remains intact',()=>{
 const storage=memory();saveSessionLabel(storage,'owner-a','session-1','My Pixel');
 assert.equal(readSessionLabels(storage,'owner-a')['session-1'],'My Pixel');assert.deepEqual(readSessionLabels(storage,'owner-b'),{});
 const devices=Object.freeze([{id:'session-1',revokedAt:''},{id:'session-2',revokedAt:'2026-11-01'},{id:'session-3',signedOut:true}].map(Object.freeze));
 assert.deepEqual(filterAccountSessions(devices,'active').map(x=>x.id),['session-1']);assert.equal(filterAccountSessions(devices,'inactive').length,2);
 assert.throws(()=>saveSessionLabel({getItem:()=>null,setItem:()=>{throw Error('Full')}},'owner','session','Laptop'),/Full/);
});
test('110 storage metadata preserves notes and catalog identity through repeated edits',()=>{
 const original='Original purchase notes\n[CODE3_CATALOG_IDENTITY_V1]{"id":"card-1"}';
 const one=writeLegacyStorageLocation(original,'Shelf 1');const two=writeLegacyStorageLocation(one,'');
 assert.equal(readLegacyStorageLocation(one),'Shelf 1');assert.equal(readLegacyStorageLocation(two),'');assert.ok(two.startsWith(original));
 assert.equal((two.match(/CODE3_STORAGE_V1/g)||[]).length,1);assert.equal(readLegacyStorageLocation('ordinary note'),undefined);
});

async function compile(path){const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic',loader:{'.css':'empty'},external:['react','react/jsx-runtime'],logLevel:'silent',plugins:[{name:'mock-session-transport',setup(b){b.onResolve({filter:/supabaseClient\.js$|accountSessionService\.js$/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const supabase={auth:{signOut:async()=>{throw Error("Unexpected sign out")}}};export default {};',loader:'js'}));}}]});const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);return module.exports.default;}
const [Inbox,Password,Sessions]=await Promise.all(['src/components/NotificationInbox.jsx','src/features/auth/PasswordInput.jsx','src/features/security/AccountSessionPanel.jsx'].map(compile));
async function environment(run){const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid/',pretendToBeVisual:true});const previous=new Map();for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));const click=async text=>{const el=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('aria-label')||x.textContent.trim())===text);assert.ok(el,text);await act(async()=>el.click())};try{await run({root,click,dom});}finally{await act(async()=>root.unmount());dom.window.close();for(const[key,value]of previous)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
test('163/164/165 bulk archive protects account notices and sticky Undo cancels writes',()=>environment(async({root,click})=>{
 const saved=[];await act(async()=>root.render(React.createElement(Inbox,{notifications:rows,now,onArchive:id=>saved.push(id)})));
 await click('Select alerts');await click('Select shown alerts');await click('Archive selected');
 assert.equal(document.querySelectorAll('.notification-undo-stack .notification-undo').length,2);assert.equal(document.querySelectorAll('.notification-card').length,1);
 assert.match(document.querySelector('.notification-card').textContent,/Protected notice/);await click('Undo archive: Target packs');await click('Undo archive: Espeon');assert.deepEqual(saved,[]);
}));
test('170 clear filters restores inbox without changing alerts',()=>environment(async({root,click,dom})=>{
 await act(async()=>root.render(React.createElement(Inbox,{notifications:[rows[0]],now})));
 const select=document.querySelector('select');await act(async()=>{select.value='account';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 assert.match(document.body.textContent,/No alerts match/);await click('Clear alert filters');assert.equal(document.querySelectorAll('.notification-card').length,1);
}));
test('197 Caps Lock reads keyboard modifier, never rewrites the secret',()=>environment(async({root,dom})=>{
 await act(async()=>root.render(React.createElement(Password,{value:'secret-value',onChange:()=>{}})));
 const input=document.querySelector('input');const event=new dom.window.KeyboardEvent('keyup',{key:'A',bubbles:true});event.getModifierState=()=>true;
 await act(async()=>input.dispatchEvent(event));assert.match(document.body.textContent,/Caps Lock is on/);assert.equal(input.value,'secret-value');
 const off=new dom.window.KeyboardEvent('keyup',{key:'CapsLock',bubbles:true});off.getModifierState=()=>false;await act(async()=>input.dispatchEvent(off));assert.equal(document.querySelector('[role=status]'),null);
}));
test('198/199 session views and display labels cannot invoke access revocation',()=>environment(async({root,click,dom})=>{
 let revoked=0;const service={currentUser:async()=>{},register:async()=>{},list:async()=>[{id:'current',label:'Computer browser',current:true,lastSeenAt:new Date(now).toISOString()},{id:'old',label:'Phone',revokedAt:'2026-11-01'}],revoke:async()=>revoked++};
 localStorage.setItem('code3.session-labels.v1:owner',JSON.stringify({current:'Office laptop'}));
 await act(async()=>root.render(React.createElement(Sessions,{user:{id:'owner'},service})));
 assert.match(document.body.textContent,/Office laptop · This device/);assert.equal(document.querySelectorAll('.owner-sessions li').length,1);
 const select=document.querySelector('select');await act(async()=>{select.value='inactive';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});assert.match(document.body.textContent,/App access revoked/);
 const revoke=[...document.querySelectorAll('button')].find(x=>x.textContent==='Revoke app access');assert.equal(revoke.disabled,true);assert.equal(revoked,0);
}));
test('169 active source pauses stop late-arriving observations without hiding earlier history',()=>{
 const pauses=[{key:'store:target-1',startedAt:now-30000,until:now+3600000}];
 const older={...rows[0],createdAt:new Date(now-120000).toISOString()};
 assert.equal(alertSource(older).key,'store:target-1');
 assert.equal(pausedAlertIds([older],pauses,now,{activeOnly:true}).size,0);
 assert.equal(pausedAlertIds([older],pauses,now,{suppressActiveSource:true}).has(older.id),true);
 assert.equal(pausedAlertIds([older],pauses,now+7200000,{suppressActiveSource:true}).size,0);
 assert.equal(pausedAlertIds([{...older,createdAt:''}],pauses,now,{suppressActiveSource:true}).has(older.id),true);
});
test('169 resume storage failures remain visible and do not dismiss the active pause',()=>environment(async({root,click})=>{
 await act(async()=>root.render(React.createElement(Inbox,{notifications:rows,now,pauses:[{key:'store:target-1',label:'Target',startedAt:now-30000,until:now+3600000}],onResumeSource:()=>{throw new Error('Storage is unavailable');}})));
 await click('Resume source');assert.match(document.querySelector('[role=alert]').textContent,/Storage is unavailable/);assert.match(document.body.textContent,/Paused sources \(1\)/);
}));
