import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

async function compile(path) {
  const result = await build({ entryPoints: [path], bundle: true, platform: 'node', format: 'cjs', write: false, jsx: 'automatic', loader: { '.css': 'empty' }, external: ['react', 'react/jsx-runtime', 'virtual:code3-set-catalog'], define: { 'import.meta.env': '{}' }, logLevel: 'silent' });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports.default;
}
const [Inbox, Scanner, Menu, Home] = await Promise.all(['src/components/NotificationInbox.jsx','src/components/BarcodeScanner.jsx','src/features/deferredViews/MenuNavigation.jsx','src/pages/OperationsHome.jsx'].map(compile));
async function environment(run) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid/', pretendToBeVisual: true });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const click = async name => {
    const button = [...document.querySelectorAll('button')].find(element => (element.getAttribute('aria-label') || element.textContent.trim()) === name);
    assert.ok(button, name);
    await act(async () => button.click());
  };
  try { await run({ root, click, dom }); }
  finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
}


const now=Date.parse('2026-11-13T17:00:00Z');
const notices=Object.freeze(Array.from({length:16},(_,i)=>Object.freeze({id:'notice-'+i,title:'Alert '+i,message:'Sample observation',category:i%2?'favorite_store_alert':'account_update',createdAt:new Date(now-i*3600000).toISOString(),readAt:i===1?'2026-11-13T10:00:00Z':'',route:'/sample'})));
test('older alerts remain reachable, filters/read state work and records remain intact',async()=>environment(async({root,click,dom})=>{
 const before=JSON.stringify(notices);const read=[];const opened=[];
 await act(async()=>root.render(React.createElement(Inbox,{notifications:notices,now,onRead:id=>read.push(id),onOpen:item=>opened.push(item)})));
 assert.equal(document.querySelectorAll('.notification-card').length,12);
 await click('See all alerts (4 more)');assert.equal(document.querySelectorAll('.notification-card').length,16);
 const select=document.querySelector('select');await act(async()=>{select.value='stores';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 assert.equal(document.querySelectorAll('.notification-card').length,8);
 await click('Unread only');assert.equal(document.querySelectorAll('.notification-card').length,7);
 await act(async()=>[...document.querySelectorAll('button')].find(x=>x.textContent==='View details').click());assert.equal(opened[0],notices[3]);
 await act(async()=>[...document.querySelectorAll('button')].find(x=>x.textContent==='Mark read').click());assert.equal(read[0],notices[3].id);
 assert.equal(JSON.stringify(notices),before);
}));
test('Undo archive cancels persistence; intentional archive commits once',async()=>environment(async({root,click})=>{
 const archived=[];await act(async()=>root.render(React.createElement(Inbox,{notifications:[notices[0]],now,onArchive:id=>archived.push(id),archiveDelay:1000})));
 await click('Archive');assert.equal(document.querySelectorAll('.notification-card').length,0);assert.equal(archived.length,0);
 await click('Undo archive: Alert 0');await act(async()=>new Promise(resolve=>setTimeout(resolve,1050)));assert.equal(archived.length,0);assert.equal(document.querySelectorAll('.notification-card').length,1);
 await click('Archive');await act(async()=>new Promise(resolve=>setTimeout(resolve,1050)));assert.deepEqual(archived,['notice-0']);
}));
test('blocked alert permissions give help without requesting permission',async()=>environment(async({root})=>{
 let enabled=0;await act(async()=>root.render(React.createElement(Inbox,{deviceState:{supported:true,permission:'denied'},onEnableDevice:()=>enabled++})));
 assert.match(document.body.textContent,/How to enable notifications/);assert.match(document.body.textContent,/In-app alerts remain available/);assert.equal(enabled,0);
}));
test('scanner reports denied permission with recovery instead of a generic failure',async()=>environment(async({root})=>{
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>{},enumerateDevices:async()=>[]}});
 const readerLoader=async()=>({BrowserMultiFormatReader:class{async decodeFromConstraints(){throw Object.assign(new Error('permission denied'),{name:'NotAllowedError'});}}});
 await act(async()=>root.render(React.createElement(Scanner,{readerLoader})));
 assert.match(document.querySelector('[role=alert]').textContent,/Camera permission is blocked/);assert.match(document.querySelector('[role=status]').textContent,/Camera unavailable/);
}));
test('scanner exposes supported camera/torch controls, decodes once and stops old camera',async()=>environment(async({root,click,dom})=>{
 const decoded=[];const torch=[];let result;let stopped=0;
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>{},enumerateDevices:async()=>[{kind:'videoinput',deviceId:'back',label:'Back camera'},{kind:'videoinput',deviceId:'front',label:'Front camera'}]}});
 const readerLoader=async()=>({BrowserMultiFormatReader:class{async decodeFromConstraints(_,__,callback){result=callback;return{stop:()=>stopped++,switchTorch:async value=>torch.push(value)};}}});
 await act(async()=>root.render(React.createElement(Scanner,{readerLoader,onScan:value=>decoded.push(value)})));
 assert.match(document.querySelector('[role=status]').textContent,/Camera on/);await click('Turn flashlight on');assert.deepEqual(torch,[true]);
 const select=document.querySelector('select');await act(async()=>{select.value='front';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});assert.ok(stopped>=1);
 await act(async()=>{result({getText:()=> '012345678901'});result({getText:()=> '012345678901'});});assert.deepEqual(decoded,['012345678901']);
}));
const menuSections=[{key:'collection',title:'Collection',items:[{key:'vault',label:'Collection',helper:'Saved cards'},{key:'scanProduct',label:'Scan',helper:'Identify a product'}]},{key:'account',title:'Account',items:[{key:'settings',label:'Settings',helper:'Your preferences'}]}];
const Icon=()=>React.createElement('span',{'aria-hidden':true},'');
test('menu pins/recent links are scoped and never expose unavailable destinations',async()=>environment(async({root,click,dom})=>{
 localStorage.setItem('code3.menu.v1:owner-a',JSON.stringify({pins:['settings','admin-only'],recent:['admin-only','vault']}));const selected=[];
 await act(async()=>root.render(React.createElement(Menu,{sections:menuSections,NavIcon:Icon,isItemActive:()=>false,preferenceScope:'owner-a',onSelect:item=>selected.push(item)})));
 assert.equal(document.querySelectorAll('[data-menu-shortcut]').length,1);assert.equal(document.body.textContent.includes('admin-only'),false);
 await act(async()=>document.querySelector('[data-menu-shortcut=settings]').click());assert.equal(selected[0].key,'settings');assert.equal(JSON.parse(localStorage.getItem('code3.menu.v1:owner-a')).recent[0],'settings');
 const search=document.querySelector('input[type=search]');const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;
 await act(async()=>{setter.call(search,'backup');search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});assert.match(document.body.textContent,/Includes:/);assert.match(document.querySelector('mark').textContent,/backup/);
}));
test('Home opens original items/reports/store scope and previews layout before saving',async()=>environment(async({root,click})=>{
 const item=Object.freeze({id:'owned',name:'Sample ETB',quantity:2,tcgGame:'pokemon',productClassification:'sealed',ownedItemPurpose:'PERSONAL_COLLECTION',createdAt:'2026-11-12T10:00:00Z',marketPrice:15});const report=Object.freeze({id:'report',storeId:'store',productName:'Sample packs',createdAt:'2026-11-13T10:00:00Z',observedAt:'2026-11-13T10:00:00Z'});const opened=[];const saves=[];
 await act(async()=>root.render(React.createElement(Home,{activeVaultItems:[item],adaptiveActivity:{reports:[report]},scoutSnapshot:{stores:[{id:'store',name:'Target',city:'Sample city'}],reports:[report]},isWatchedEmberStore:()=>true,setActiveTab:()=>{},onOpenCollectionItem:value=>opened.push(value),onOpenReport:value=>opened.push(value),onOpenStoreReports:value=>opened.push(value),onSaveHomeShortcuts:value=>saves.push(value)})));
 assert.match(document.body.textContent,/1 product · 2 total quantity · 1 purchase record/);
 await click('Open Sample ETB');assert.equal(opened[0],item);
 await act(async()=>[...document.querySelectorAll('.home-recent-list button')].find(x=>x.textContent.includes('Restock report')).click());assert.equal(opened[1],report);
 await click('Customize your Home shortcuts');assert.equal(saves.length,0);assert.ok(document.querySelector('[aria-label="Home shortcut preview"]'));
 await click('Save changes');assert.equal(saves.length,1);assert.equal(item.marketPrice,15);
}));
