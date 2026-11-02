/* Actual Collection UI with disposable, device-only records. No account or server. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "artifacts/qa/collection-copy-groups-20261025");
const origin = "http://127.0.0.1:5241";
const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");
const result = { passed: false, checks: 0, cases: [], scope: { actualCollectionWorkspace: true, actualPortfolio: true, actualCopyDetail: true, actualRecordDetail: true, actualNavigationAndBrand: true, syntheticRecordsAndArtOnly: true, noOwnerSession: true, noCloudTransport: true, noLiveServer: true } };
const check = (condition, message) => { assert.ok(condition, message); result.checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); result.checks++; };

const authStub = `
export const isSupabaseConfigured=false;
const blocked=()=>{window.__collectionCalls.provider++;throw new Error('Provider calls forbidden in offline Collection test');};
export const supabase={auth:{getUser:blocked,getSession:blocked,onAuthStateChange:blocked},rpc:blocked,from:blocked,storage:{from:blocked}};
export const createIsolatedAuthClient=blocked;
`;
const entry = `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {CollectionWorkspace} from './src/pages/EverydayWorkspaces.jsx';
import {createEmptyFlipScoutState,FLIP_SCOUT_STORAGE_KEY} from './src/features/flipScout/constants.js';
import {createEmptyPortfolioState,PORTFOLIO_STORAGE_PREFIX} from './src/utils/collectionPortfolio.mjs';
import {AppShell,DesktopSidebar,MobileBottomNavigation} from './src/components/operations/OperationsUI.jsx';
import {BrandIdentity} from './src/components/brand/BrandIdentity.jsx';
import './src/index.css';import './src/App.css';import './src/components/operations/operations-ui.css';
const calls=window.__collectionCalls={provider:0,purpose:0,sell:0,locked:0,navigation:0,writes:[]};
function photo(label,color){const c=document.createElement('canvas');c.width=300;c.height=300;const x=c.getContext('2d');x.fillStyle='#FBF4E6';x.fillRect(0,0,300,300);x.fillStyle=color;x.fillRect(35,26,230,248);x.strokeStyle='#D4AF37';x.lineWidth=5;x.strokeRect(44,35,212,230);x.fillStyle='#FBF4E6';x.textAlign='center';x.font='bold 26px sans-serif';x.fillText('SAMPLE',150,129);x.font='22px sans-serif';x.fillText(label,150,167);return c.toDataURL('image/png');}
const posterPhoto=photo('151 poster','#7A0F1E');const otherPhoto=photo('Alakazam box','#4B1B6B');
const base={name:'151 Poster Collection',title:'151 Poster Collection',catalogProductId:'pokemon-sealed-151-poster',tcgplayerProductId:'502005',tcgGame:'pokemon',productClassification:'Sealed product',setName:'151',language:'English',quantity:1,condition:'Sealed',marketPrice:81.05,projectedResaleMid:81.05,imageUrl:posterPhoto,photos:['original-synthetic-photo'],latestPriceAt:'2026-10-25T12:00:00.000Z'};
const repositoryRecords=[
 {...base,id:'poster-pc',ownedItemPurpose:'PERSONAL_COLLECTION',purchaseDate:'2026-10-01',allocatedItemCost:32.5,purchaseSource:'Sample shop A',notes:'PC copy notes remain separate',storageLocation:'Personal shelf'},
 {...base,id:'alakazam',name:'151 Alakazam ex Collection',title:'151 Alakazam ex Collection',catalogProductId:'pokemon-sealed-151-alakazam',tcgplayerProductId:'502004',marketPrice:114.22,projectedResaleMid:114.22,ownedItemPurpose:'PERSONAL_COLLECTION',purchaseDate:'2026-09-20',allocatedItemCost:45,imageUrl:otherPhoto},
 {...base,id:'poster-japanese',language:'Japanese',ownedItemPurpose:'PERSONAL_COLLECTION',allocatedItemCost:29,purchaseDate:'2026-09-21'},
 {...base,id:'poster-special',variant:'Special foil',ownedItemPurpose:'PERSONAL_COLLECTION',allocatedItemCost:35,purchaseDate:'2026-09-22'},
 {...base,id:'unknown-copy',name:'Unrecorded acquisition',title:'Unrecorded acquisition',catalogProductId:'synthetic-unknown-acquisition',tcgplayerProductId:'synthetic-unknown',marketPrice:null,projectedResaleMid:null,ownedItemPurpose:'HOLD',allocatedItemCost:'',purchaseDate:''},
 {...base,id:'resale-sentinel',ownedItemPurpose:'FOR_RESALE',quantity:19,allocatedItemCost:444,marketPrice:999.99},
];
const legacyRecords=[{...base,id:'poster-hold',ownedItemPurpose:'HOLD',purchaseDate:'2026-10-18',actualPurchasePrice:40,purchaseSource:'Sample shop B',notes:'Hold copy notes remain separate',storageLocation:'Hold shelf'}];
const rawState={...createEmptyFlipScoutState('2026-10-25T12:00:00.000Z'),inventory:repositoryRecords};
const scope='offline-collection-copies';const portfolioKey=PORTFOLIO_STORAGE_PREFIX+encodeURIComponent(scope);
const portfolios={...createEmptyPortfolioState(),selectedPortfolioId:'all',portfolios:[{id:'main',name:'Main',favorite:true},{id:'one-copy',name:'One copy only',favorite:false}],memberships:{'repository:poster-pc':'one-copy'},snapshots:[]};
localStorage.setItem(FLIP_SCOUT_STORAGE_KEY,JSON.stringify(rawState));localStorage.setItem(portfolioKey,JSON.stringify(portfolios));
localStorage.setItem('code3-collection-legacy-sentinel',JSON.stringify(legacyRecords));localStorage.setItem('code3-collection-prices-sentinel',JSON.stringify({latest:{poster:81.05,alakazam:114.22},at:'2026-10-25T12:00:00.000Z'}));sessionStorage.setItem('code3-collection-session-sentinel','preserve unrelated draft');
const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('code3-collection-copy-qa',1);request.onupgradeneeded=()=>request.result.createObjectStore('records');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(JSON.stringify({photos:['existing-photo'],quantity:27,marketPrice:81.05}),'original');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
const originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){calls.writes.push({kind:this===localStorage?'local':'session',key,value});return originalSet.call(this,key,value);};
async function snapshot(){const indexed=await new Promise((resolve,reject)=>{const request=db.transaction('records').objectStore('records').get('original');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return {local:Object.fromEntries(Object.entries(localStorage).sort()),session:Object.fromEntries(Object.entries(sessionStorage).sort()),indexed,legacy:JSON.stringify(legacyRecords),repository:JSON.stringify(repositoryRecords)};}
const primary=[{key:'home',label:'Home',icon:'home'},{key:'collection',label:'Collection',icon:'collection'},{key:'add',label:'Add',icon:'plus',isAction:true},{key:'sets',label:'Sets',icon:'inventory'},{key:'wants',label:'Wants',icon:'wishlist'}];
const secondary=[{key:'inventory',label:'Business inventory',icon:'inventory'},{key:'settings',label:'Settings',icon:'settings'}];
function Fixture(){const theme=document.documentElement.dataset.theme;const [features,setFeatures]=useState({value:true,history:false,export:true});
 window.__collectionQa={ready:true,calls,snapshot,portfolioKey,repoKey:FLIP_SCOUT_STORAGE_KEY,setValueAllowed:(allowed)=>setFeatures((current)=>({...current,value:allowed}))};
 return <AppShell className={'app app-command-shell app-dashboard app-adaptive-full app-header-full app-theme-'+theme} data-theme={theme} data-role-mode="collector">
  <header className="topbar collection-preview-header"><div className="collection-preview-brand"><BrandIdentity variant="wordmark" onDark/></div><div className="collection-preview-context"><strong>Collection</strong><span>Offline preview</span></div></header>
  <DesktopSidebar items={primary.filter((item)=>!item.isAction)} secondaryItems={secondary} activeKey="collection" onSelect={()=>calls.navigation++} footer={<p>Sample collection<br/>No account connected</p>}/>
  <main className={'main app-shell-themed app-shell-'+theme} data-theme={theme} tabIndex={-1}>
   <p className="collection-preview-label">Preview · sample records and images · no live account</p>
   <CollectionWorkspace items={legacyRecords} initialView="collection" portfolioScope={scope} portfolioFeatures={features} experiencePresentation={{showBusinessTools:false,showAdminTools:false}} onChangePurpose={()=>calls.purpose++} onSellItem={()=>calls.sell++} onLockedFeature={()=>calls.locked++}/>
  </main><MobileBottomNavigation items={primary} activeKey="collection" onSelect={()=>calls.navigation++}/>
 </AppShell>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
const previewCss = `
.collection-preview-header{display:flex!important;align-items:center;justify-content:space-between;gap:16px;padding:8px 20px!important;min-height:76px!important;background:var(--app-brand-header)!important}
.collection-preview-brand{width:190px;min-width:0}.collection-preview-brand .code3-brand-identity--wordmark{display:block;width:100%;max-width:100%}.collection-preview-brand img{display:block;width:100%;height:auto}
.collection-preview-context{display:grid;gap:3px;color:#FBF4E6;text-align:right;font-size:14px}.collection-preview-context strong{color:#FBF4E6!important}.collection-preview-context span{color:#E5CCD9;font-size:12px}
.collection-preview-label{font:400 12px/1.5 var(--font-ui);color:var(--text-secondary);margin:0;padding:10px 16px 0}
@media(max-width:700px){.collection-preview-header{padding:8px 14px!important;min-height:70px!important}.collection-preview-brand{width:164px}.collection-preview-context{font-size:13px}.collection-preview-context span{font-size:11px}}
`;
const browserEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|TMPDIR|LOCALAPPDATA|APPDATA|USERPROFILE|HOME|DISPLAY|WAYLAND_DISPLAY|XDG_RUNTIME_DIR|COMSPEC|PATHEXT|PLAYWRIGHT_BROWSERS_PATH)$/i.test(name)));
const settleFrames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function capture(page, testCase, state, { preserveScroll = false } = {}) {
  if (!preserveScroll) await page.evaluate(() => scrollTo(0, 0));
  const geometry = await page.locator('.main').evaluate((node) => {
    const visible = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    const outside = [node, ...node.querySelectorAll('*')].filter(visible).filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1); }).map((el) => ({ tag: el.tagName, className: el.className, text: el.textContent.trim().slice(0, 70) }));
    const controls = [...node.querySelectorAll('button,input,select,textarea,summary,[role=tab]')].filter(visible).map((el) => { const r = el.getBoundingClientRect(); return { name: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 60), width: r.width, height: r.height }; });
    return { overflow: document.documentElement.scrollWidth > innerWidth + 1, outside, controls };
  });
  equal(geometry.overflow, false, `${state}: page has no horizontal overflow`);
  equal(geometry.outside, [], `${state}: no horizontally clipped component controls or text`);
  check(geometry.controls.every((control) => control.width >= 44 && control.height >= 44), `${state}: all controls have 44px targets`);
  const tones = await page.evaluate(() => {
    const canvas = document.createElement('canvas').getContext('2d');
    const rgba = (value) => { canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = value; canvas.fillRect(0, 0, 1, 1); const p = [...canvas.getImageData(0, 0, 1, 1).data]; return [p[0], p[1], p[2], p[3] / 255]; };
    const over = (a, b) => { const alpha = a[3] + b[3] * (1 - a[3]); return [...[0, 1, 2].map((i) => (a[i] * a[3] + b[i] * b[3] * (1 - a[3])) / alpha), alpha]; };
    const lum = (p) => p.slice(0, 3).map((v) => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    return [...document.querySelectorAll('.collection-portfolio-item-name,.collection-portfolio-item-quantity,.collection-portfolio-item-value,.collection-product-detail h1,.collection-product-detail h2,.collection-product-detail p,.collection-product-detail dt,.collection-product-detail dd,.collection-product-detail [role=tab]')].filter((el) => el.getClientRects().length).map((el) => { const chain = []; for (let node = el; node; node = node.parentElement) chain.unshift(node); const bg = chain.reduce((color, node) => over(rgba(getComputedStyle(node).backgroundColor), color), [255, 255, 255, 1]); const style = getComputedStyle(el); const light = [lum(over(rgba(style.color), bg)), lum(bg)].sort((a, b) => b - a); return { label: el.textContent.trim().slice(0, 70), ratio: (light[0] + .05) / (light[1] + .05) }; });
  });
  check(tones.length > 0 && tones.every((tone) => tone.ratio >= 4.5), `${state}: sampled main text meets 4.5:1 contrast`);
  const file = `${testCase.width}-${testCase.theme}-${state}.png`;
  await page.screenshot({ path: path.join(output, file), fullPage: false });
  testCase.states.push({ state, file, ...geometry, contrast: tones });
  if (testCase.width === 390) { const full = `${testCase.width}-${testCase.theme}-${state}-full.png`; await page.screenshot({ path: path.join(output, full), fullPage: true }); testCase.states.at(-1).fullFile = full; }
}

function gallery() {
  const cards = result.cases.flatMap((row) => row.states.filter((state) => ['collection-products', 'product-overview', 'copies', 'one-copy-portfolio', 'values-hidden'].includes(state.state)).map((state) => `<figure><figcaption>${row.width}px · ${row.theme} · ${state.state.replaceAll('-', ' ')}</figcaption><a href="${state.file}"><img src="${state.file}" alt="${state.state} at ${row.width}px in ${row.theme} mode"></a></figure>`));
  fs.writeFileSync(path.join(output, 'preview.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Code 3 TCG · Collection copies review</title><style>body{margin:0;background:#181219;color:#FBF4E6;font:16px/1.5 system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:24px}h1{font-size:28px}p{max-width:80ch;color:#decdd4}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px}figure{margin:0;padding:12px;border:1px solid #76505b;border-radius:12px;background:#2b1c24}figcaption{margin-bottom:12px;font-weight:600}img{display:block;width:100%;height:auto}a{color:#F1D47C}</style></head><body><main><h1>Collection copies review</h1><p>Actual Collection, product detail and original-record screens in the approved brand shell. These are full browser viewports with clearly labeled synthetic records and artwork. No account or cloud service was connected. Product records, purpose, acquisition history, photos and latest prices remain separate.</p><div class="grid">${cards.join('')}</div></main></body></html>`);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const bundle = await build({ absWorkingDir: root, stdin: { contents: entry, resolveDir: root, loader: 'jsx' }, bundle: true, jsx: 'automatic', format: 'esm', target: 'es2022', outfile: path.join(output, 'fixture.js'), write: false, metafile: true, external: ['/assets/*'], define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'no-provider', setup(plugin) { plugin.onResolve({ filter: /supabaseClient(?:\.js)?$/ }, () => ({ path: 'offline-no-provider', namespace: 'fixture' })); plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: authStub, loader: 'js' })); } }] });
  result.bundleInputs = Object.keys(bundle.metafile.inputs);
  check(!result.bundleInputs.some((name) => /node_modules[\\/]@supabase|src[\\/]supabaseClient\.js$/.test(name)), 'Actual provider modules are absent from the fixture');
  result.sourceHashes = Object.fromEntries(result.bundleInputs.filter((name) => /^src[\\/]/.test(name)).map((name) => [name, hash(fs.readFileSync(path.resolve(root, name)))]));
  const bundled = Object.fromEntries(bundle.outputFiles.map((file) => [path.extname(file.path), Buffer.from(file.contents)]));
  for (const file of bundle.outputFiles) fs.writeFileSync(file.path, file.contents);
  const browser = await chromium.launch({ headless: true, env: browserEnv });
  try {
    for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
      const testCase = { width, height: width === 390 ? 844 : 1000, theme, passed: false, states: [], blockedRequests: [], pageErrors: [] }; result.cases.push(testCase);
      const context = await browser.newContext({ viewport: { width, height: testCase.height }, colorScheme: theme, locale: 'en-US', reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: false });
      let page;
      try {
        await context.route('**/*', async (route) => {
          const request = route.request(); const url = new URL(request.url());
          const blocked = () => { testCase.blockedRequests.push({ method: request.method(), origin: url.origin, path: url.pathname }); return route.abort(); };
          if (url.origin !== origin || request.method() !== 'GET') return blocked();
          if (url.pathname === '/__qa/collection') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Code 3 TCG · Offline collection preview</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/__qa/fixture.css"><style>${previewCss}</style></head><body><div id="root"></div><script type="module" src="/__qa/fixture.js"></script></body></html>` });
          if (url.pathname === '/__qa/fixture.js') return route.fulfill({ contentType: 'text/javascript', body: bundled['.js'] });
          if (url.pathname === '/__qa/fixture.css') return route.fulfill({ contentType: 'text/css', body: bundled['.css'] });
          const allowed = url.pathname === '/assets/brand-system/code3-tokens.css' || /^\/assets\/(brand-system\/fonts|fonts)\/[A-Za-z0-9._-]+\.(ttf|woff2?)$/.test(url.pathname) || /^\/assets\/brand-system\/artwork\/code3-(wordmark(?:-on-dark)?|emblem-icon)\.png$/.test(url.pathname);
          if (allowed) { const file = path.resolve(root, 'public', `.${url.pathname}`); if (!file.startsWith(path.resolve(root, 'public') + path.sep) || !fs.existsSync(file)) return blocked(); return route.fulfill({ contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : file.endsWith('.ttf') ? 'font/ttf' : 'font/woff2', body: fs.readFileSync(file) }); }
          return blocked();
        });
        if (context.routeWebSocket) await context.routeWebSocket('**/*', (socket) => { testCase.blockedRequests.push({ method: 'WEBSOCKET' }); socket.close(); });
        page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', (error) => testCase.pageErrors.push(error.message));
        await page.goto(origin + '/__qa/collection'); await page.waitForFunction(() => window.__collectionQa?.ready); await page.evaluate(() => document.fonts.ready);
        await page.getByTestId('collection-workspace').waitFor();
        const baseline = await page.evaluate(() => window.__collectionQa.snapshot());
        const collection = page.getByRole('list', { name: 'Collection items', exact: true });
        const poster = collection.getByRole('button', { name: 'Open 151 Poster Collection', exact: true });
        equal(await collection.locator('>li').count(), 5, 'Six owned PC/Hold records show five product tiles, excluding resale');
        equal(await poster.count(), 3, 'Language and variant stay separate while matching PC/Hold copies group');
        const grouped = poster.filter({ hasText: 'Qty 2' });
        equal(await grouped.count(), 1, 'Exactly one 151 Poster tile has quantity 2');
        check((await grouped.innerText()).includes('$162.10'), 'Grouped value adds existing saved per-copy estimates');
        equal(await collection.getByText('Qty 19', { exact: true }).count(), 0, 'Resale quantity never enters personal Collection grouping');
        await capture(page, testCase, 'collection');
        await grouped.scrollIntoViewIfNeeded();
        await capture(page, testCase, 'collection-products', { preserveScroll: true });
        await grouped.focus();
        const gridPosition = await page.evaluate(() => ({ y: scrollY, mainY: document.querySelector('.main').scrollTop }));
        await page.keyboard.press('Enter');
        const tabs = page.getByRole('tablist', { name: /product|item/i });
        await tabs.waitFor(); equal(await tabs.getByRole('tab').allTextContents(), ['Overview', 'Copies'], 'Copies is the second product tab');
        equal(await tabs.getByRole('tab', { name: 'Overview', exact: true }).getAttribute('aria-selected'), 'true', 'Product opens on Overview');
        await settleFrames(page);
        check(await page.getByTestId('collection-product-detail').locator('h1').evaluate((heading) => { const bounds = heading.getBoundingClientRect(); return bounds.top >= 0 && bounds.bottom <= innerHeight; }), 'Opening a product from a scrolled tile shows its heading');
        await capture(page, testCase, 'product-overview');
        await tabs.getByRole('tab', { name: 'Overview', exact: true }).focus(); await page.keyboard.press('ArrowRight');
        equal(await tabs.getByRole('tab', { name: 'Copies', exact: true }).evaluate((button) => document.activeElement === button), true, 'ArrowRight focuses Copies');
        equal(await tabs.getByRole('tab', { name: 'Overview', exact: true }).getAttribute('aria-selected'), 'true', 'Arrow navigation does not activate a tab implicitly');
        await page.keyboard.press('Enter');
        const copies = page.getByRole('tabpanel', { name: 'Copies', exact: true }); await copies.waitFor();
        const copyText = await copies.innerText();
        check(/PC\s*[·:]?\s*1/.test(copyText) && /Hold\s*[·:]?\s*1/.test(copyText), 'Copies shows PC 1 and Hold 1');
        check(copyText.includes('$32.50') && copyText.includes('$40.00'), 'Each original purchase cost stays separate');
        check(copyText.includes('Oct 1, 2026') && copyText.includes('Oct 18, 2026'), 'Each original purchase date stays separate');
        const pcCopy = copies.getByRole('article', { name: 'PC · 1', exact: true });
        const holdCopy = copies.getByRole('article', { name: 'Hold · 1', exact: true });
        check((await pcCopy.innerText()).includes('$32.50') && (await pcCopy.innerText()).includes('Oct 1, 2026'), 'PC copy retains its own cost and date together');
        check((await holdCopy.innerText()).includes('$40.00') && (await holdCopy.innerText()).includes('Oct 18, 2026'), 'Hold copy retains its own cost and date together');
        check(!(await pcCopy.innerText()).includes('$40.00') && !(await holdCopy.innerText()).includes('$32.50'), 'Acquisition details never cross between copies');
        await capture(page, testCase, 'copies');
        equal(await page.evaluate(() => window.__collectionQa.calls.writes), [], 'Opening and reading copies never saves or edits records');
        const openCopy = copies.getByRole('button', { name: /view|open/i }).first(); await openCopy.scrollIntoViewIfNeeded();
        const copyPosition = await page.evaluate(() => ({ y: scrollY, mainY: document.querySelector('.main').scrollTop }));
        await openCopy.click();
        await page.getByRole('heading', { name: '151 Poster Collection', exact: true }).waitFor();
        equal(await page.getByRole('tablist', { name: /product|item/i }).count(), 0, 'Opening a copy reaches the existing original record detail');
        check((await page.locator('.main').innerText()).includes('Acquisition and value'), 'Original record detail remains available');
        await page.locator('.ops-detail-more > summary').click();
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
        equal(await page.getByLabel('Quantity', { exact: true }).inputValue(), '1', 'Edit opens one original quantity instead of the group quantity');
        const draftRecord = await page.evaluate(() => JSON.parse(sessionStorage.getItem('private-business-hub.form-draft.collection.poster-pc')));
        equal([draftRecord.id, draftRecord.quantity, draftRecord.ownedItemPurpose], ['poster-pc', 1, 'PERSONAL_COLLECTION'], 'Editor uses canonical PC record identity and purpose');
        check(!Object.hasOwn(draftRecord, 'records') && !Object.hasOwn(draftRecord, 'purposeCounts'), 'Derived group rows never enter the record editor');
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        equal(await page.getByLabel('Allocated item cost', { exact: true }).inputValue(), '32.5', 'Editor retains only the PC acquisition cost');
        equal(await page.getByLabel('Purchase date', { exact: true }).inputValue(), '2026-10-01', 'Editor retains only the PC purchase date');
        await page.getByRole('button', { name: /^Back$/i }).click();
        await page.getByRole('button', { name: /^Back$/i }).click();
        await page.getByRole('tabpanel', { name: 'Copies', exact: true }).waitFor();
        equal(await page.getByRole('tab', { name: 'Copies', exact: true }).getAttribute('aria-selected'), 'true', 'Back from a copy returns to Copies');
        await settleFrames(page);
        check(await copies.getByRole('button', { name: /Open copy record 1:/ }).evaluate((button) => document.activeElement === button), 'Back from a copy restores keyboard focus to that copy action');
        const copyReturn = await page.evaluate(() => ({ y: scrollY, mainY: document.querySelector('.main').scrollTop }));
        check(Math.abs(copyReturn.y - copyPosition.y) <= 1 && Math.abs(copyReturn.mainY - copyPosition.mainY) <= 1, 'Back from a copy restores its scroll position');
        check((await page.evaluate(() => window.__collectionQa.calls.writes)).every((write) => write.kind === 'session' && write.key === 'private-business-hub.form-draft.collection.poster-pc'), 'Only explicit Edit may preserve a temporary copy-specific draft');
        await page.getByRole('button', { name: /Back to collection/i }).click();
        await page.getByRole('list', { name: 'Collection items', exact: true }).waitFor();
        await settleFrames(page);
        check(await grouped.evaluate((button) => document.activeElement === button), 'Back to Collection restores keyboard focus to the grouped product tile');
        const gridReturn = await page.evaluate(() => ({ y: scrollY, mainY: document.querySelector('.main').scrollTop }));
        check(Math.abs(gridReturn.y - gridPosition.y) <= 1 && Math.abs(gridReturn.mainY - gridPosition.mainY) <= 1, 'Back to Collection restores the scrolled grid position');
        const search = page.getByRole('searchbox', { name: 'Search collection', exact: true }); await search.fill('Personal shelf');
        equal(await collection.locator('>li').count(), 1, 'Search is applied before grouping');
        equal(await collection.getByText('Qty 1', { exact: true }).count(), 1, 'Filtered results contain only the matching original copy');
        await search.fill('');
        await page.getByRole('button', { name: 'Choose portfolio', exact: true }).click();
        const chooser = page.getByRole('dialog', { name: 'Choose portfolio', exact: true }); await chooser.getByRole('button', { name: /One copy only.*item/ }).click();
        equal(await collection.locator('>li').count(), 1, 'Custom portfolio is scoped before grouping');
        equal(await collection.getByText('Qty 1', { exact: true }).count(), 1, 'Custom portfolio holds only its one original copy');
        await capture(page, testCase, 'one-copy-portfolio');
        await page.getByRole('button', { name: 'Choose portfolio', exact: true }).click(); await page.getByRole('dialog', { name: 'Choose portfolio', exact: true }).getByRole('button', { name: /All portfolios.*across your collection/ }).click();
        equal(await collection.getByText('Qty 2', { exact: true }).count(), 1, 'All portfolios restores combined quantity');
        await page.getByRole('button', { name: 'Hide values', exact: true }).click();
        check(!(await collection.innerText()).includes('$'), 'Hide values hides grouped market estimates');
        await collection.getByRole('button', { name: 'Open 151 Poster Collection', exact: true }).filter({ hasText: 'Qty 2' }).click();
        check(!(await page.locator('.main').innerText()).includes('$'), 'Explicit hidden-values choice hides product monetary values');
        await page.getByRole('tab', { name: 'Copies', exact: true }).click();
        check(!(await page.getByRole('tabpanel', { name: 'Copies', exact: true }).innerText()).includes('$'), 'Explicit hidden-values choice hides per-copy costs too');
        await capture(page, testCase, 'values-hidden');
        await page.getByRole('button', { name: /Back to collection/i }).click(); await page.getByRole('button', { name: 'Show values', exact: true }).click();
        await page.evaluate(() => window.__collectionQa.setValueAllowed(false));
        check((await collection.innerText()).includes('$162.10'), 'Free saved market estimates remain available without the history feature');
        await collection.getByRole('button', { name: 'Open 151 Poster Collection', exact: true }).filter({ hasText: 'Qty 2' }).click();
        check((await page.locator('.main').innerText()).includes('$162.10'), 'Product Overview preserves free saved estimates without adding a paywall');
        await page.getByRole('tab', { name: 'Copies', exact: true }).click();
        check((await page.getByRole('tabpanel', { name: 'Copies', exact: true }).innerText()).includes('$32.50'), 'Acquisition costs stay available without the history feature');
        await page.getByRole('button', { name: /Back to collection/i }).click(); await page.evaluate(() => window.__collectionQa.setValueAllowed(true));
        await collection.getByRole('button', { name: 'Open Unrecorded acquisition', exact: true }).click(); await page.getByRole('tab', { name: 'Copies', exact: true }).click();
        const unknownText = await page.getByRole('tabpanel', { name: 'Copies', exact: true }).innerText();
        check(/not recorded/i.test(unknownText) && !unknownText.includes('$0.00'), 'Unknown cost/date remain unrecorded rather than fabricated');
        await page.getByRole('button', { name: /Back to collection/i }).click();
        equal(await page.evaluate(() => window.__collectionQa.snapshot()), baseline, 'Original records, purposes, price timestamps, photos, memberships, session and IndexedDB bytes remain unchanged');
        const calls = await page.evaluate(() => window.__collectionQa.calls);
        equal([calls.provider, calls.purpose, calls.sell, calls.locked], [0, 0, 0, 0], 'No provider, purpose, resale or locked action runs during review');
        check(calls.writes.every((write) => write.key.startsWith('code3-collection-portfolios-v1:') || (write.kind === 'session' && write.key === 'private-business-hub.form-draft.collection.poster-pc')), 'Only explicit portfolio selection and the cancelled copy draft may write preferences');
        equal(calls.writes.filter((write) => write.kind === 'local').length, 2, 'Only the two explicit portfolio choices write local preferences');
        equal(testCase.blockedRequests, [], 'No unexpected external network, API writes or WebSocket requests'); equal(testCase.pageErrors, [], 'No page errors');
        testCase.preservationSha256 = hash(JSON.stringify(baseline)); testCase.calls = calls; testCase.passed = true; console.log(`PASS ${width}px ${theme} Collection copies`);
      } catch (error) { testCase.error = error.message; if (page) { fs.writeFileSync(path.join(output, `${width}-${theme}-failed.html`), await page.content()); await page.screenshot({ path: path.join(output, `${width}-${theme}-failed.png`), fullPage: false }); } throw error; } finally { await context.close(); }
    }
    result.passed = true; gallery();
  } finally { await browser.close(); }
})().catch((error) => { result.error = error.stack || error.message; console.error(error.message); process.exitCode = 1; }).finally(() => { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ passed: result.passed, checks: result.checks, passedCases: result.cases.filter((row) => row.passed).length, totalCases: 4, evidence: path.join(output, 'results.json') })); });
