/* Integrated offline previews: real Inventory, screenshot intake and sync notice.
 * Synthetic records/PNG/OCR response only; no account, transport or live server. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "artifacts/qa/ui-workflow-polish-20261025");
const origin = "http://127.0.0.1:5240";
const privateMarker = "PRIVATE_AUTHOR_SYNTHETIC_DO_NOT_SAVE";
const postText = `${privateMarker}\nNorth Collectibles - 1 Fixture North Way, Norfolk\nPokemon Prismatic Evolutions ETBs\nIn stock - purchase limit applies`;
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const sourceFiles = ["src/pages/EverydayWorkspaces.jsx", "src/pages/everyday-workspaces.css", "src/components/StockScreenshotImport.jsx", "src/components/stock-screenshot-import.css", "src/features/persistence/WorkspaceSyncNotice.jsx", "src/features/persistence/cloud-workspace.css", "src/features/persistence/useCloudSyncReviewNavigation.js", "src/pages/Menu.jsx", "src/components/operations/OperationsUI.jsx", "src/components/operations/operations-ui.css", "src/components/brand/BrandIdentity.jsx", "src/config/brand.js", "public/assets/brand-system/code3-tokens.css"];
const result = {passed:false,checks:0,cases:[],scope:{actualInventoryComponent:true,actualScreenshotComponent:true,actualSyncNotice:true,actualNavigationComponents:true,approvedLocalBrandArtwork:true,syntheticRecordsOnly:true,deterministicOcrWorker:true,noRealOcrEngine:true,noActualSyncTransport:true,noOwnerSession:true,noLiveServer:true},sourceHashes:Object.fromEntries(sourceFiles.map((name)=>[name,hash(fs.readFileSync(path.join(root,name)))]))};
const check = (condition,message) => {assert.ok(condition,message);result.checks++;};
const equal = (actual,expected,message) => {assert.deepEqual(actual,expected,message);result.checks++;};
const authStub = `
export const isSupabaseConfigured=false;
const unexpected=()=>{window.__workflowCalls.provider++;throw new Error('Provider calls forbidden in offline workflow fixture');};
export const supabase={auth:{getUser:unexpected,getSession:unexpected,onAuthStateChange:unexpected},rpc:unexpected,from:unexpected,storage:{from:unexpected}};
export const createIsolatedAuthClient=unexpected;
`;
const entry = `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {BusinessWorkspace} from './src/pages/EverydayWorkspaces.jsx';
import StockScreenshotImport from './src/components/StockScreenshotImport.jsx';
import WorkspaceSyncNotice from './src/features/persistence/WorkspaceSyncNotice.jsx';
import MenuPage from './src/pages/Menu.jsx';
import {CloudWorkspaceContext} from './src/features/persistence/CloudWorkspaceContext.js';
import {requestCloudSyncReview,useCloudSyncReviewNavigation} from './src/features/persistence/useCloudSyncReviewNavigation.js';
import {AppShell,DesktopSidebar,MobileBottomNavigation,PageHeader,PrimaryButton} from './src/components/operations/OperationsUI.jsx';
import {BrandIdentity} from './src/components/brand/BrandIdentity.jsx';
import './src/index.css';import './src/App.css';import './src/components/operations/operations-ui.css';
import './src/features/persistence/cloud-workspace.css';import './src/components/experience-controls.css';
const calls=window.__workflowCalls={provider:0,review:0,load:0,resolve:0,sync:0,history:0,reviewConflicts:0,apply:0,navigation:0};
function photo(label,color){const c=document.createElement('canvas');c.width=240;c.height=300;const x=c.getContext('2d');x.fillStyle='#FBF4E6';x.fillRect(0,0,240,300);x.fillStyle=color;x.fillRect(32,38,176,222);x.strokeStyle='#D4AF37';x.lineWidth=4;x.strokeRect(40,46,160,206);x.fillStyle='#FBF4E6';x.textAlign='center';x.font='bold 22px sans-serif';x.fillText('SAMPLE',120,138);x.font='18px sans-serif';x.fillText(label,120,171);return c.toDataURL('image/png');}
const records=[
 {id:'sample-in-stock',title:'Aurora booster box',setName:'Aurora',productClassification:'Sealed product',quantity:3,status:'In stock',currentStatus:'In stock',ownedItemPurpose:'FOR_RESALE',allocatedItemCost:84,projectedResaleMid:112.75,imageUrl:photo('Sealed box','#7A0F1E')},
 {id:'sample-listed',title:'Moonlit Grove card',setName:'Moonlit Grove',productClassification:'Single card',quantity:1,status:'Listed',currentStatus:'Listed',ownedItemPurpose:'FOR_RESALE',allocatedItemCost:18.5,projectedResaleMid:27.25,imageUrl:photo('Single card','#4B1B6B')},
 {id:'sample-preparing',title:'Stellar Shards bundle',setName:'Stellar Shards',productClassification:'Sealed product',quantity:2,status:'Preparing',currentStatus:'Preparing',ownedItemPurpose:'FOR_RESALE',allocatedItemCost:24,projectedResaleMid:36.5,imageUrl:photo('Bundle','#34313B')},
 {id:'sample-sold',title:'Ember Dragon card',setName:'Ember Dragon',productClassification:'Single card',quantity:2,status:'Listed',currentStatus:'Listed',ownedItemPurpose:'FOR_RESALE',allocatedItemCost:12,projectedResaleMid:21.75,imageUrl:photo('Sold card','#7A0F1E')},
 {id:'sample-personal',title:'Personal collection sentinel',quantity:5,ownedItemPurpose:'PERSONAL_COLLECTION',marketPrice:999.99}
];
const sales=[{id:'sample-sale-a',inventoryItemId:'sample-in-stock',quantitySold:1,status:'Completed'},{id:'sample-sale-b',inventoryItemId:'sample-sold',quantitySold:2,status:'Completed'}];
const stores=[{id:'fixture-north',name:'North Collectibles',retailer:'Target',city:'Norfolk',state:'VA',address:'1 Fixture North Way'},{id:'fixture-south',name:'South Collectibles',retailer:'Target',city:'Norfolk',state:'VA',address:'2 Fixture South Way'}];
const originalDraft={storeId:'',productName:'',productCategory:'',reportType:'stock_on_shelf',reportTypeTouched:false,note:'Keep synthetic owner notes',photos:['synthetic-owner-photo'],visibility:'private_from_map'};
const sentinel=' {"inventory":[{"id":"existing-synthetic-record","quantity":2,"marketPrice":123.45}],"latestPrices":{"sentinel":87.25}} ';
localStorage.setItem('code3-workflow-sentinel',sentinel);sessionStorage.setItem('code3-workflow-session','synthetic-session-preserved');
const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('code3-workflow-qa',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(sentinel,'preserve');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
async function snapshot(){const indexed=await new Promise((resolve,reject)=>{const r=db.transaction('records').objectStore('records').get('preserve');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return {local:Object.fromEntries(Object.entries(localStorage).sort()),session:Object.fromEntries(Object.entries(sessionStorage).sort()),indexed,records:JSON.stringify(records),sales:JSON.stringify(sales)};}
const primary=[{key:'home',label:'Home',icon:'home'},{key:'collection',label:'Collection',icon:'collection'},{key:'add',label:'Add',icon:'plus',isAction:true},{key:'reports',label:'Restocks',icon:'scout'},{key:'inventory',label:'Inventory',icon:'inventory'}];
const secondary=[{key:'settings',label:'Settings',icon:'settings'},{key:'help',label:'Help',icon:'help'}];
const view=new URLSearchParams(location.search).get('view')||'inventory';
function Fixture(){
 const theme=document.documentElement.dataset.theme;
 const [draft,setDraft]=useState(originalDraft);const [settingsShown,setSettingsShown]=useState(false);
 const [inventoryItems,setInventoryItems]=useState(records);
 const [syncStatus,setSyncStatus]=useState({status:'CONFLICT',revision:7,conflicts:['synthetic-inventory','synthetic-preferences']});
 const title=view==='screenshot'?'Report restock':view==='sync'?'Cloud saving':'Inventory';
 const openUtilityPage=(page)=>{calls.navigation++;if(page==='settings')setSettingsShown(true);return true;};
 const reviewNavigation=useCloudSyncReviewNavigation(openUtilityPage,'local-beta');
 const forbidden=(name)=>()=>{calls[name]++;throw new Error('Cloud action '+name+' is forbidden in presentation fixture');};
 const workspace={user:{id:'local-beta'},enabled:true,status:syncStatus,syncNow:forbidden('sync'),setEnabled:forbidden('sync'),loadNewer:forbidden('load'),resolveConflicts:forbidden('resolve'),reviewConflicts:forbidden('reviewConflicts'),history:forbidden('history'),listDeviceRecoveryCopies:forbidden('history'),openRecovery:forbidden('history')};
 window.__workflowQa={ready:true,snapshot,calls,draft,originalDraft,setSyncStatus,view,settingsShown,reviewRequested:reviewNavigation.cloudSyncReviewRequested,setEmptyInventory:(empty)=>setInventoryItems(empty?records.filter((item)=>item.ownedItemPurpose==='PERSONAL_COLLECTION'):records)};
 return <CloudWorkspaceContext.Provider value={workspace}><AppShell className={'app app-command-shell app-dashboard app-adaptive-full app-header-full app-theme-'+theme} data-theme={theme} data-role-mode="seller">
  <header className="topbar workflow-preview-header"><div className="workflow-preview-header__brand"><BrandIdentity variant="wordmark" onDark/></div><div className="workflow-preview-header__context"><strong>{title}</strong><span>Offline preview</span></div></header>
  <DesktopSidebar items={primary.filter((item)=>!item.isAction)} secondaryItems={secondary} activeKey={view==='inventory'?'inventory':view==='screenshot'?'reports':'settings'} onSelect={()=>calls.navigation++} footer={<p>Synthetic QA workspace<br/>No account connected</p>}/>
  <main className={'main app-shell-themed app-shell-'+theme} data-theme={theme} tabIndex={-1}>
   <p className="workflow-preview-label">Preview · sample records and images · no live account</p>
   {view==='inventory'?<BusinessWorkspace initialView="inventory" items={inventoryItems} sales={sales} experiencePresentation={{showBusinessTools:true,showAdminTools:false,isStore:false}}/>:null}
   {view==='screenshot'?<section className="everyday-workspace"><PageHeader title="Report a restock" description="Turn one screenshot into a reviewed private draft."/><div className="ops-card ops-record-card"><h2>Share what you saw</h2><p>Check the store, products and observation time before saving.</p></div></section>:null}
   {view==='sync'&&!settingsShown?<BusinessWorkspace initialView="inventory" items={records} sales={sales} experiencePresentation={{showBusinessTools:true,showAdminTools:false,isStore:false}}/>:null}
   {view==='sync'&&settingsShown?<MenuPage activeWorkspaceName="Sample seller workspace" betaAccessAllowed={()=>true} cloudSyncReviewRequested={reviewNavigation.cloudSyncReviewRequested} onCloudSyncReviewShown={reviewNavigation.onCloudSyncReviewShown} experiencePresentation={{isSeller:true,personaLabel:'Seller',showBusinessTools:true,showFamilyTools:false,showAdminTools:false}} openUtilityPage={openUtilityPage} signedInWithSupabase={false} commandDeskSellerAccess={true} renderUtilityPageShell={({className,children})=><div className={'account-utility-page '+className}>{children}</div>}/>:null}
  </main>
  <MobileBottomNavigation items={primary} activeKey={view==='inventory'?'inventory':view==='screenshot'?'reports':'settings'} onSelect={()=>calls.navigation++}/>
  {view==='sync'?<WorkspaceSyncNotice status={syncStatus} ownerId="local-beta" onReviewChanges={()=>{calls.review++;return requestCloudSyncReview();}} onLoadNewer={()=>calls.load++}/>:null}
  {view==='screenshot'?<div className="location-modal-backdrop flow-modal-backdrop"><section className="location-modal flow-modal flow-modal-medium" data-flow="scoutSubmit" role="dialog" aria-modal="true" aria-label="Report a restock"><div className="modal-title-row modal-sticky-header"><div><h2>Report a restock</h2><p>Private draft · sample screenshot</p></div><button type="button" className="modal-close-button" aria-label="Close restock preview" onClick={()=>calls.navigation++}>×</button></div><div className="flow-modal-body"><StockScreenshotImport stores={stores} reportDraft={draft} onApply={(patch)=>{calls.apply++;setDraft((current)=>({...current,...patch}));}}/></div></section></div>:null}
 </AppShell></CloudWorkspaceContext.Provider>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
// Harness-only chrome arranges the real brand/nav around components under test.
// It deliberately never overrides Inventory/intake/notice selectors.
const previewCss = `
.workflow-preview-header{display:flex!important;align-items:center;justify-content:space-between;gap:16px;padding:8px 20px!important;min-height:76px!important;background:var(--app-brand-header)!important}
.workflow-preview-header__brand{width:190px;min-width:0}.workflow-preview-header__brand .code3-brand-identity--wordmark{width:100%;max-width:100%;display:block}.workflow-preview-header__brand img{display:block;width:100%;height:auto}
.workflow-preview-header__context{display:grid;gap:3px;color:#FBF4E6;text-align:right;font-size:14px}.workflow-preview-header__context span{color:#E5CCD9;font-size:12px}
.workflow-preview-header__context strong{color:#FBF4E6!important}
.workflow-preview-label{font:400 12px/1.5 var(--font-ui);color:var(--text-secondary);margin:0;padding:10px 16px 0}.workflow-preview-modal-brand .code3-brand-identity__label{display:none}.workflow-preview-modal-brand .code3-brand-identity{width:44px}.workflow-preview-modal-brand img{width:44px;height:44px}
@media(max-width:700px){.workflow-preview-header{padding:8px 14px!important;min-height:70px!important}.workflow-preview-header__brand{width:164px}.workflow-preview-header__context{font-size:13px}.workflow-preview-header__context span{font-size:11px}}
`;
const browserEnv=Object.fromEntries(Object.entries(process.env).filter(([name])=>/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|TMPDIR|LOCALAPPDATA|APPDATA|USERPROFILE|HOME|DISPLAY|WAYLAND_DISPLAY|XDG_RUNTIME_DIR|COMSPEC|PATHEXT|PLAYWRIGHT_BROWSERS_PATH)$/i.test(name)));
async function geometry(page, scope=".main") {
  return page.evaluate((selector)=>{
    const node=document.querySelector(selector);const visible=(el)=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
    const outside=[node,...node.querySelectorAll('*')].filter(visible).filter((el)=>{const r=el.getBoundingClientRect();return r.width>0&&(r.left< -1||r.right>innerWidth+1);}).map((el)=>({tag:el.tagName,className:el.className,text:el.textContent.trim().slice(0,45)}));
    const controls=[...node.querySelectorAll('button,input,select,textarea,summary')].filter(visible).map((el)=>{const target=el.type==='checkbox'?el.closest('label')||el:el;const r=target.getBoundingClientRect();return {name:el.getAttribute('aria-label')||el.textContent.trim().slice(0,45)||el.type,width:r.width,height:r.height};});
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,scopeOverflow:node.scrollWidth>node.clientWidth+1,outside,controls};
  },scope);
}
async function capture(page,caseResult,state,scope=".main",preserveScroll=false) {
  const layout=await geometry(page,scope);caseResult.states.push({state,...layout});
  equal(layout.overflow,false,`${state}: no page overflow`);equal(layout.scopeOverflow,false,`${state}: no component overflow`);equal(layout.outside,[],`${state}: no horizontally clipped component text/controls`);
  check(layout.controls.every((control)=>control.width>=44&&control.height>=44),`${state}: controls meet 44px targets`);
  const tones=await page.evaluate(()=>{
    const canvas=document.createElement('canvas').getContext('2d');
    const rgba=(value)=>{canvas.clearRect(0,0,1,1);canvas.fillStyle=value;canvas.fillRect(0,0,1,1);const p=[...canvas.getImageData(0,0,1,1).data];return [p[0],p[1],p[2],p[3]/255];};
    const over=(a,b)=>{const alpha=a[3]+b[3]*(1-a[3]);return [...[0,1,2].map((i)=>(a[i]*a[3]+b[i]*b[3]*(1-a[3]))/alpha),alpha];};
    const lum=(p)=>p.slice(0,3).map((v)=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    return [...document.querySelectorAll('.business-inventory-results,.business-inventory-filters [aria-pressed="true"],.stock-screenshot-panel h4,.stock-screenshot-panel p,.stock-screenshot-apply,.cloud-workspace-notice strong,.cloud-workspace-notice p,.cloud-workspace-notice button')].filter((el)=>el.getClientRects().length).map((el)=>{const chain=[];for(let node=el;node;node=node.parentElement)chain.unshift(node);const bg=chain.reduce((color,node)=>over(rgba(getComputedStyle(node).backgroundColor),color),[255,255,255,1]);const style=getComputedStyle(el);const light=[lum(over(rgba(style.color),bg)),lum(bg)].sort((a,b)=>b-a);return {label:el.textContent.trim().slice(0,50),ratio:(light[0]+.05)/(light[1]+.05)};});
  });
  const appTone=await page.locator('.app').evaluate((app)=>{const style=getComputedStyle(app);return {surface:style.getPropertyValue('--surface-primary').trim(),text:style.getPropertyValue('--text-primary').trim()};});
  check(Boolean(appTone.surface&&appTone.text),`${state}: real semantic theme tokens resolve`);
  check(tones.every((tone)=>tone.ratio>=4.5),`${state}: primary workflow text/selected states meet 4.5:1 contrast`);
  caseResult.states.at(-1).contrast=tones;
  if(!preserveScroll)await page.evaluate(()=>{scrollTo(0,0);for(const selector of ['.flow-modal','.flow-modal-body']){const body=document.querySelector(selector);if(body)body.scrollTop=0;}});
  const name=`${caseResult.width}-${caseResult.theme}-${caseResult.view}-${state}`;
  await page.screenshot({path:path.join(output,name+".png"),fullPage:false});caseResult.screenshots.push(name+".png");
  if(caseResult.width===390&&caseResult.view!=="screenshot"){await page.screenshot({path:path.join(output,name+"-full.png"),fullPage:true});caseResult.screenshots.push(name+"-full.png");}
}
async function makePng(page) {
  const bytes=await page.evaluate((marker)=>{const c=document.createElement('canvas');c.width=900;c.height=540;const x=c.getContext('2d');x.fillStyle='#222222';x.fillRect(0,0,900,540);x.fillStyle='#FBF4E6';x.font='bold 32px sans-serif';x.fillText('SYNTHETIC DISCORD STOCK POST',30,65);x.font='25px sans-serif';[marker,'North Collectibles - Norfolk','Pokemon Prismatic Evolutions ETBs','In stock - confirm observation time'].forEach((line,i)=>x.fillText(line,30,145+i*75));return c.toDataURL('image/png').split(',')[1];},privateMarker);
  return {name:'synthetic-discord-stock.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')};
}

(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const bundle=await build({absWorkingDir:root,stdin:{contents:entry,resolveDir:root,loader:"jsx"},bundle:true,jsx:"automatic",format:"esm",target:"es2022",outfile:path.join(output,"fixture.js"),write:false,metafile:true,external:["/assets/*"],define:{"import.meta.env":"{}","process.env.NODE_ENV":'"production"'},plugins:[{name:"no-provider",setup(plugin){plugin.onResolve({filter:/supabaseClient(?:\.js)?$/},()=>({path:"offline-no-provider",namespace:"fixture"}));plugin.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:authStub,loader:"js"}));}}]});
  result.bundleInputs=Object.keys(bundle.metafile.inputs);
  check(!result.bundleInputs.some((name)=>/node_modules[\\/]@supabase|src[\\/]supabaseClient\.js$/.test(name)),"Real provider modules must not be bundled");
  const bundled=Object.fromEntries(bundle.outputFiles.map((file)=>[path.extname(file.path),Buffer.from(file.contents)]));
  for(const file of bundle.outputFiles)fs.writeFileSync(file.path,file.contents);
  const browser=await chromium.launch({headless:true,env:browserEnv});
  try {
    for(const width of [390,1440])for(const theme of ["light","dark"])for(const view of ["inventory","screenshot","sync"]){
      const caseResult={width,height:width===390?844:1000,theme,view,passed:false,states:[],screenshots:[],blockedRequests:[],pageErrors:[]};result.cases.push(caseResult);
      const context=await browser.newContext({viewport:{width,height:caseResult.height},colorScheme:theme,reducedMotion:"reduce",serviceWorkers:"block",acceptDownloads:false});
      let page;
      try {
        await context.route("**/*",async(route)=>{
          const request=route.request();const url=new URL(request.url());
          const block=()=>{caseResult.blockedRequests.push({method:request.method(),origin:url.origin,path:url.pathname});return route.abort();};
          if(url.origin!==origin||request.method()!=="GET")return block();
          if(url.pathname==="/__qa/workflow")return route.fulfill({contentType:"text/html",body:`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Code 3 TCG · Offline workflow preview</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/__qa/fixture.css"><style>${previewCss}</style></head><body><div id="root"></div><script type="module" src="/__qa/fixture.js"></script></body></html>`});
          if(url.pathname==="/__qa/fixture.js")return route.fulfill({contentType:"text/javascript",body:bundled[".js"]});
          if(url.pathname==="/__qa/fixture.css")return route.fulfill({contentType:"text/css",body:bundled[".css"]});
          const allowed=url.pathname==="/assets/brand-system/code3-tokens.css"||/^\/assets\/(brand-system\/fonts|fonts)\/[A-Za-z0-9._-]+\.(ttf|woff2?)$/.test(url.pathname)||/^\/assets\/brand-system\/artwork\/code3-(wordmark(?:-on-dark)?|emblem-icon)\.png$/.test(url.pathname);
          if(allowed){const file=path.resolve(root,"public",`.${url.pathname}`);if(!file.startsWith(path.resolve(root,"public")+path.sep)||!fs.existsSync(file))return block();return route.fulfill({contentType:file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.ttf')?'font/ttf':'font/woff2',body:fs.readFileSync(file)});}
          return block();
        });
        if(context.routeWebSocket)await context.routeWebSocket('**/*',(socket)=>{caseResult.blockedRequests.push({method:'WEBSOCKET'});socket.close();});
        await context.addInitScript((text)=>{
          // Deterministic fixture output only; the production PNG validation,
          // decode/canvas preparation, parser and patch validator still run.
          class OfflineWorker{constructor(){this.timers=[];}postMessage(){const mode=window.__workflowOcrMode;this.timers.push(setTimeout(()=>this.onmessage?.({data:{type:'progress',status:'recognizing text',progress:.5}}),15));this.timers.push(setTimeout(()=>this.onmessage?.({data:{type:'result',text:mode==='no_text'?'':text,confidence:97}}),mode==='slow'?10000:80));}terminate(){this.timers.forEach(clearTimeout);}}
          window.Worker=window.__workflowWorker=OfflineWorker;
        },postText);
        page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',(error)=>caseResult.pageErrors.push(error.message));
        await page.goto(origin+`/__qa/workflow?view=${view}`);await page.waitForFunction(()=>window.__workflowQa?.ready);await page.evaluate(()=>document.fonts.ready);
        const baseline=await page.evaluate(()=>window.__workflowQa.snapshot());
        const brands=await page.locator('.workflow-preview-header__brand img,.ops-desktop-sidebar .code3-brand-identity img').evaluateAll((images)=>images.filter((img)=>img.getClientRects().length).map((img)=>({src:new URL(img.src).pathname,loaded:img.naturalWidth>0,width:img.getBoundingClientRect().width})));
        check(brands.length>0&&brands.every((item)=>item.loaded&&item.width>=140),"Approved separate wordmark is loaded and readable");caseResult.brandImages=brands;
        if(view==='inventory'){
          const workspace=page.getByTestId('business-workspace');await workspace.getByRole('heading',{name:'Inventory',exact:true}).waitFor();
          const search=workspace.getByRole('searchbox',{name:'Search inventory',exact:true});await search.waitFor();
          check(await workspace.getByText('Personal collection sentinel',{exact:true}).count()===0,"Inventory excludes personal collection records");
          const cards=workspace.locator('.everyday-record-card');equal(await cards.count(),4,"Actual Inventory shows four resale fixtures");
          const totals=workspace.locator('.business-inventory-totals');const totalsSummary=totals.locator('summary');
          equal(await totals.getAttribute('open'),null,"All-inventory totals are a secondary collapsed disclosure");
          await totalsSummary.click();const totalsBefore=await workspace.getByRole('group',{name:'All inventory totals',exact:true}).innerText();await totalsSummary.click();
          if(width===390)check(await workspace.getByRole('group',{name:'Inventory stock filters'}).evaluate((group)=>group.getBoundingClientRect().bottom<=document.querySelector('.ops-mobile-nav').getBoundingClientRect().top),"Phone search and stock filters fit above the navigation dock");
          await capture(page,caseResult,'normal');
          await search.fill('Moonlit');equal(await cards.count(),1,"Search narrows actual Inventory cards");
          check((await cards.innerText()).includes('Moonlit Grove card'),"Correct search match shown");await capture(page,caseResult,'search');
          await search.fill('No such synthetic item');await workspace.getByRole('heading',{name:'No matching inventory',exact:true}).waitFor();equal(await cards.count(),0,"No-match search hides unrelated cards");await capture(page,caseResult,'no-match');
          await workspace.getByRole('button',{name:'Clear filters',exact:true}).first().click();equal(await cards.count(),4,"Clear filters restores all fixtures");
          equal(await search.evaluate((input)=>document.activeElement===input),true,"Clear filters returns keyboard focus to search");
          const filters=workspace.getByRole('group',{name:'Inventory stock filters'});
          const expected={Available:3,Preparing:1,Listed:1,'Sold out':1};
          for(const [name,count]of Object.entries(expected)){await filters.getByRole('button',{name,exact:true}).click();equal(await cards.count(),count,`${name} derives from status and remaining quantities`);equal(await filters.getByRole('button',{name,exact:true}).getAttribute('aria-pressed'),'true',`${name} announces selection`);}
          await capture(page,caseResult,'sold-out-filter');
          await totalsSummary.click();equal(await workspace.getByRole('group',{name:'All inventory totals',exact:true}).innerText(),totalsBefore,"Displayed totals remain scoped to all inventory across filters");await totalsSummary.click();
          await workspace.getByRole('button',{name:'Clear filters',exact:true}).click();equal(await cards.count(),4,"Filter reset preserves and restores original records");
          await search.focus();await page.keyboard.press('Tab');
          check(await page.evaluate(()=>{const style=getComputedStyle(document.activeElement);return document.activeElement.matches(':focus-visible')&&parseFloat(style.outlineWidth)>=2;}),"Keyboard focus remains visible after search");
          await page.evaluate(()=>window.__workflowQa.setEmptyInventory(true));await workspace.getByRole('heading',{name:'No resale inventory',exact:true}).waitFor();
          equal(await workspace.getByRole('heading',{name:'No matching inventory',exact:true}).count(),0,"A genuinely empty inventory differs from no search matches");await capture(page,caseResult,'empty');
          await page.evaluate(()=>window.__workflowQa.setEmptyInventory(false));equal(await cards.count(),4,"Returning fixtures restores records without a save");
        }else if(view==='screenshot'){
          const dialog=page.getByRole('dialog',{name:'Report a restock',exact:true});await dialog.waitFor();
          await dialog.getByRole('button',{name:'Use a screenshot',exact:true}).click();
          equal(await dialog.locator('.stock-screenshot-review-fields').count(),0,"Intake does not overwhelm user with review fields");
          await capture(page,caseResult,'intake','.flow-modal');
          await dialog.locator('input[type=file]').setInputFiles(await makePng(page));
          await dialog.getByRole('heading',{name:'Review screenshot details',exact:true}).waitFor();
          await dialog.locator('.stock-screenshot-review').scrollIntoViewIfNeeded();await capture(page,caseResult,'review','.flow-modal',true);
          equal(await page.evaluate(()=>window.__workflowQa.calls.apply),0,"OCR suggestions never auto-apply");
          await dialog.getByRole('button',{name:'Use reviewed details',exact:true}).click();await dialog.getByRole('alert').waitFor();
          equal(await page.evaluate(()=>window.__workflowQa.calls.apply),0,"Missing reviewed store/time blocks apply");
          await dialog.getByRole('combobox',{name:/^Exact store/}).selectOption('fixture-north');
          await dialog.getByLabel(/^Products mentioned/).fill('Prismatic Evolutions ETBs');
          await dialog.getByRole('combobox',{name:/^Product category/}).selectOption('Pokemon TCG');
          await dialog.getByRole('combobox',{name:/^Stock status in the post/}).selectOption('stock_on_shelf');
          await dialog.locator('input[type="datetime-local"]').fill('2026-10-24T10:30');
          await dialog.getByRole('button',{name:'Use reviewed details',exact:true}).click();
          await dialog.getByRole('button',{name:'Edit details',exact:true}).waitFor();
          equal(await page.evaluate(()=>window.__workflowQa.calls.apply),1,"Reviewed details apply exactly once");
          const applied=await page.evaluate(()=>window.__workflowQa.draft);caseResult.appliedDraft=applied;
          equal(applied.visibility,'private_from_map',"Screenshot draft remains private");equal(applied.verified,false,"Screenshot draft never claims verification");equal(applied.needsReview,true,"Final report review remains required");equal(applied.note,'Keep synthetic owner notes',"Existing draft note preserved");equal(applied.photos,['synthetic-owner-photo'],"Existing draft photos preserved");
          check(!JSON.stringify(applied).includes(privateMarker)&&!JSON.stringify(applied).includes('data:image'),"Raw post identity/text and screenshot bytes are absent from applied draft");
          equal(await dialog.locator('.stock-screenshot-review-fields').count(),0,"Applied stage collapses review fields");await capture(page,caseResult,'applied','.flow-modal');
          await dialog.getByRole('button',{name:'Edit details',exact:true}).click();equal(await dialog.getByLabel(/^Products mentioned/).inputValue(),'Prismatic Evolutions ETBs',"Reopening review retains edited product");equal(await dialog.getByRole('combobox',{name:/^Exact store/}).inputValue(),'fixture-north',"Reopening review retains exact store");
        }else{
          const notice=page.getByRole('complementary',{name:'Cloud saving notice'});await notice.waitFor();
          equal(await notice.getByRole('button',{name:'Load saved changes',exact:true}).count(),0,"Conflict notice offers review without loading a copy");
          await capture(page,caseResult,'conflict');
          const review=notice.getByRole('button',{name:'Review changes',exact:true});await review.focus();await page.keyboard.press('Enter');
          equal(await page.evaluate(()=>window.__workflowQa.calls.review),1,"Review action invokes presentation callback once");equal(await page.evaluate(()=>[window.__workflowQa.calls.load,window.__workflowQa.calls.resolve]),[0,0],"Review never loads or resolves versions");
          equal(await notice.count(),0,"Accepted guarded navigation dismisses only the obstructing notice");
          const cloudSummary=page.locator('.settings-layout__disclosure > summary').filter({hasText:'Cloud saving & recovery'});await cloudSummary.waitFor();
          await page.waitForFunction(()=>window.__workflowQa.settingsShown&&!window.__workflowQa.reviewRequested);
          equal(await cloudSummary.evaluate((summary)=>summary.parentElement.open),true,"Real Settings cloud disclosure opens");
          equal(await cloudSummary.evaluate((summary)=>document.activeElement===summary),true,"Real cloud disclosure receives keyboard focus");
          equal(await page.evaluate(()=>[window.__workflowQa.calls.sync,window.__workflowQa.calls.history,window.__workflowQa.calls.reviewConflicts]),[0,0,0],"Opening Settings does not request any cloud records or history");
          await capture(page,caseResult,'review-open','.main',true);
          const reviewVersions=page.getByRole('button',{name:'Review both saved versions',exact:true});
          await reviewVersions.scrollIntoViewIfNeeded();
          caseResult.reviewDestinationReachable=await reviewVersions.evaluate((button)=>{const r=button.getBoundingClientRect();const center=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return button.contains(center);});
          check(caseResult.reviewDestinationReachable,"Sync notice must not obscure the real cloud review action");
        }
        equal(await page.evaluate(()=>window.__workflowQa.snapshot()),baseline,"Search/review/notice interactions preserve stored records, photos and latest-price sentinels byte-for-byte");
        equal(await page.evaluate(()=>window.__workflowQa.calls.provider),0,"No provider calls");equal(caseResult.blockedRequests,[],"No unexpected network, write or WebSocket requests");equal(caseResult.pageErrors,[],"No page errors");
        caseResult.calls=await page.evaluate(()=>window.__workflowQa.calls);caseResult.preservationSha256=hash(JSON.stringify(baseline));caseResult.passed=true;console.log(`PASS ${width}px ${theme} ${view}`);
      }catch(error){caseResult.error=error.message;if(page){const prefix=`${width}-${theme}-${view}-failed`;fs.writeFileSync(path.join(output,prefix+'.html'),await page.content());await page.screenshot({path:path.join(output,prefix+'.png')});}throw error;}finally{await context.close();}
    }
    result.passed=true;
  }finally{await browser.close();}
})().catch((error)=>{result.error=error.stack||error.message;console.error(error.message);process.exitCode=1;}).finally(()=>{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,checks:result.checks,passedCases:result.cases.filter((item)=>item.passed).length,totalCases:12,evidence:path.join(output,'results.json')}));});
