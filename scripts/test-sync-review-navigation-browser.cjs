// Isolated presentation test. Real navigation guard, hook, notice, and Settings;
// provider methods fail closed and existing record/price bytes are sentinels.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("@babel/parser");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "artifacts/qa/sync-review-navigation-20261025");
const origin = "http://127.0.0.1:5237";
const source = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
const functions = [];
function visit(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration" && node.id?.name === "openUtilityPage") functions.push(node);
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "start", "end", "comments", "tokens"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") visit(value);
  }
}
visit(ast);
assert.equal(functions.length, 1);
const navigation = source.slice(functions[0].start, functions[0].end);
assert.match(navigation, /if \(!confirmLeaveVaultWork\(\)\) return false/);
assert.match(source, /useCloudSyncReviewNavigation\(openUtilityPage, cloudWorkspace\?\.user\?\.id\)/);
assert.match(source, /const settingsPageProps = \{\s*cloudSyncReviewRequested,\s*onCloudSyncReviewShown,/);
assert.match(fs.readFileSync(path.join(root, "src/features/persistence/CloudWorkspaceBoundary.jsx"), "utf8"), /onReviewChanges=\{requestCloudSyncReview\}/);

const entry = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import MenuPage from './src/pages/Menu.jsx';
import WorkspaceSyncNotice from './src/features/persistence/WorkspaceSyncNotice.jsx';
import {CloudWorkspaceContext} from './src/features/persistence/CloudWorkspaceContext.js';
import {useCloudSyncReviewNavigation,requestCloudSyncReview} from './src/features/persistence/useCloudSyncReviewNavigation.js';
import './src/index.css';import './src/App.css';import './src/features/persistence/cloud-workspace.css';
function Fixture(){
 const [activeTab,setActiveTab]=useState('inventory');
 const [ownerId,setOwnerId]=useState('local-beta');
 const [deferMenu,setDeferMenu]=useState(false);
 const [revision,setRevision]=useState(7);
 const [,rerender]=useState(0);
 const confirmLeaveVaultWork=()=>{window.qaCalls.guard++;return window.qa.allowLeave;};
 const prepareRouteNavigation=()=>{window.qaCalls.navigation++;};
 const setQuickAddMenuOpen=()=>{};const setSearchExpanded=()=>{};const setMenuOpen=()=>{};
 const setMenuSectionsOpen=()=>{};const setOwnerCenterSection=()=>{};const setOwnerCenterSubview=()=>{};const setAdminReviewFilter=()=>{};
 const utilityTabForMenuSection=value=>value;
 ${navigation}
 const review=useCloudSyncReviewNavigation(openUtilityPage,ownerId);
 const forbidden=name=>async()=>{window.qaCalls[name]++;throw new Error('Unexpected '+name+' from presentation action');};
 const status={status:'CONFLICT',revision,conflicts:['synthetic-records'],message:'Both saved copies are preserved.'};
 // Keep unrelated signed-in-device probes disabled while changing the logical
 // navigation owner to exercise the late-request guard.
 const workspace={user:{id:'local-beta'},status,enabled:true,syncNow:forbidden('sync'),setEnabled:forbidden('enabled'),loadNewer:forbidden('load'),reviewConflicts:forbidden('review'),resolveConflicts:forbidden('resolve'),history:forbidden('history'),openRecovery:forbidden('recovery')};
 window.qa={...window.qa,setActiveTab,setOwnerId,setDeferMenu,setRevision,rerender:()=>rerender(value=>value+1),requestCloudSyncReview,activeTab,reviewRequested:review.cloudSyncReviewRequested};
 return <CloudWorkspaceContext.Provider value={workspace}>
  <div className='app app-command-shell' data-theme={document.documentElement.dataset.theme}>
   <main className='main app-shell-themed' tabIndex={-1}>
    {activeTab==='settings'&&!deferMenu?<MenuPage {...review} signedInWithSupabase betaAccessAllowed={()=>true} openUtilityPage={openUtilityPage} renderUtilityPageShell={({children,className})=><div className={className}>{children}</div>}/>:<h1>Inventory</h1>}
   </main>
   <WorkspaceSyncNotice status={status} ownerId={ownerId} onLoadNewer={workspace.loadNewer} onReviewChanges={requestCloudSyncReview}/>
  </div>
 </CloudWorkspaceContext.Provider>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;

(async () => {
  fs.mkdirSync(output, { recursive: true });
  await build({ stdin: { contents: entry, loader: "jsx", resolveDir: root }, bundle: true, jsx: "automatic", format: "esm", outfile: path.join(output, "fixture.js"), define: { "import.meta.env": "{}" }, external: ["/assets/*"], plugins: [{ name: "no-provider", setup(plugin) {
    plugin.onResolve({ filter: /supabaseClient(?:\.js)?$/ }, () => ({ path: "supabaseClient", namespace: "fixture" }));
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const isSupabaseConfigured=false; const fail=()=>{window.qaCalls.provider++;throw Error('Provider blocked');};export const supabase={auth:{getUser:fail,getSession:fail},rpc:fail};export const createIsolatedAuthClient=fail;", loader: "js" }));
  } }] });
  const browser = await chromium.launch({ headless: true });
  let checks = 0;
  const results = [];
  try {
    for (const width of [390, 1440]) for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce", serviceWorkers: "block" });
      const external = [], errors = [];
      await context.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin || route.request().method() !== "GET") { external.push(url.origin + url.pathname); return route.abort(); }
        if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html data-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>` });
        if (["/fixture.js", "/fixture.css"].includes(url.pathname)) return route.fulfill({ path: path.join(output, url.pathname.slice(1)), contentType: url.pathname.endsWith("js") ? "text/javascript" : "text/css" });
        if (url.pathname === "/assets/brand-system/code3-tokens.css") return route.fulfill({ path: path.join(root, "public", url.pathname), contentType: "text/css" });
        if (url.pathname.startsWith("/assets/") && fs.existsSync(path.join(root, "public", url.pathname))) return route.fulfill({ path: path.join(root, "public", url.pathname) });
        return route.fulfill({ status: 404, body: "Isolated fixture" });
      });
      await context.addInitScript(() => {
        localStorage.setItem("synthetic-existing-records", ' {"quantity":3,"marketValue":127.25,"photos":["keep-photo"]} ');
        window.qa = { allowLeave: true };
        window.qaCalls = { guard: 0, navigation: 0, sync: 0, enabled: 0, load: 0, review: 0, resolve: 0, history: 0, recovery: 0, provider: 0, storage: 0, indexedDB: 0 };
        for (const name of ["setItem", "removeItem", "clear"]) {
          const method = Storage.prototype[name];
          Storage.prototype[name] = function (...args) { window.qaCalls.storage++; return method.apply(this, args); };
        }
        const open = IDBFactory.prototype.open;
        IDBFactory.prototype.open = function (...args) { window.qaCalls.indexedDB++; return open.apply(this, args); };
      });
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(origin);
      const review = page.getByRole("button", { name: "Review changes", exact: true });
      await review.waitFor();
      // The real leave-work guard must be honored before any route change.
      await page.evaluate(() => { window.qa.allowLeave = false; });
      await review.click();
      assert.equal(await page.getByRole("heading", { name: "Inventory", exact: true }).count(), 1); checks++;
      assert.equal(await review.isVisible(), true); checks++;
      assert.equal(await page.evaluate(() => window.qaCalls.navigation), 0); checks++;
      await page.evaluate(() => { window.qa.allowLeave = true; });
      await review.focus(); await page.keyboard.press("Enter");
      const summary = page.locator("summary").filter({ hasText: "Cloud saving & recovery" });
      await page.waitForFunction(() => document.activeElement?.tagName === "SUMMARY" && document.activeElement.textContent.includes("Cloud saving & recovery"));
      assert.equal(await summary.evaluate(node => node.parentElement.open), true); checks++;
      assert.equal(await page.getByRole("button", { name: "Review both saved versions", exact: true }).isVisible(), true); checks++;
      assert.equal(await review.count(), 0, "Accepted navigation dismisses only the matching floating notice"); checks++;
      assert.match(await page.locator(".cloud-workspace-status").innerText(), /Review conflicting changes/); checks++;
      await page.waitForFunction(() => window.qa.reviewRequested === false);
      assert.equal(await page.evaluate(() => window.qaCalls.navigation), 1); checks++;
      // Acknowledging this UI request must not keep reopening the disclosure.
      await summary.click();
      await page.evaluate(() => window.qa.rerender());
      assert.equal(await summary.evaluate(node => node.parentElement.open), false); checks++;
      // A second explicit request works, including when Settings is already open.
      await page.evaluate(() => window.qa.setRevision(8));
      await review.waitFor();
      await review.click();
      await page.waitForFunction(() => document.activeElement?.tagName === "SUMMARY");
      assert.equal(await summary.evaluate(node => node.parentElement.open), true); checks++;
      // A pending request belonging to the previous account must not open for another.
      await page.evaluate(() => { window.qa.setActiveTab("inventory"); window.qa.setDeferMenu(true); window.qa.setRevision(9); });
      await page.getByRole("heading", { name: "Inventory", exact: true }).waitFor();
      await review.click();
      await page.waitForFunction(() => window.qa.reviewRequested === true);
      await page.evaluate(() => window.qa.setOwnerId("synthetic-other-owner"));
      await page.waitForFunction(() => window.qa.reviewRequested === false);
      await page.evaluate(() => window.qa.setDeferMenu(false));
      await summary.waitFor();
      assert.equal(await summary.evaluate(node => node.parentElement.open), false); checks++;
      const calls = await page.evaluate(() => window.qaCalls);
      for (const name of ["sync", "enabled", "load", "review", "resolve", "history", "recovery", "provider", "storage", "indexedDB"]) { assert.equal(calls[name], 0, name); checks++; }
      assert.equal(await page.evaluate(() => localStorage.getItem("synthetic-existing-records")), ' {"quantity":3,"marketValue":127.25,"photos":["keep-photo"]} '); checks++;
      assert.deepEqual(errors, []); assert.deepEqual(external, []); checks += 2;
      results.push({ width, theme, keyboardNavigation: true, leaveGuardPreserved: true, reviewRequestConsumed: true, accountIsolated: true, providerCalls: 0, recordAndPriceBytesPreserved: true });
      await context.close();
    }
    const report = { passed: checks, isolatedSyntheticState: true, productionDataAccessed: false, results };
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
