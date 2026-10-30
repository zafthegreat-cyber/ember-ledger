const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { build } = require("esbuild");
const { chromium, expect } = require("@playwright/test");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "artifacts/qa/restock-history-20261029");
const read = relative => fs.readFileSync(path.join(root, relative));

(async () => {
  const fixtures = await import(pathToFileURL(path.join(__dirname, "restock-history-test-fixtures.mjs")).href);
  const model = await import(pathToFileURL(path.join(root, "src/features/restockHistory/historyArchive.mjs")).href);
  const archive = await fixtures.syntheticHistory(35);
  const stored = (await model.prepareHistoricalRestockImport(fixtures.syntheticScout(), archive)).nextScout;
  const bootstrap = { owner: fixtures.syntheticOwner, values: [...fixtures.syntheticStorage(stored).values], archive };
  const expanded = await fixtures.syntheticHistory(37);
  expanded.sources[0].sha256 = "b".repeat(64);
  expanded.sources[0].batchId = "user-feed-" + "b".repeat(16);
  expanded.sources[0].file = "synthetic-expanded.txt";
  expanded.sources[0].byteLength = 2468;
  expanded.sources[0].reportAppearances = expanded.sources[0].distinctReportsWithinSource = expanded.sources[0].addedDistinctObservations = 37;
  for (const row of expanded.observations) for (const occurrence of row.sourceOccurrences) occurrence.batchId = expanded.sources[0].batchId;
  const entry = `import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Panel from './src/features/restockHistory/RestockHistoryPanel.jsx';
import { CloudWorkspaceContext } from './src/features/persistence/CloudWorkspaceContext.js';
import { captureWorkspaceSources } from './src/features/persistence/cloudWorkspaceSources.js';
import './src/styles/theme.css';
const seed=window.__bootstrap;
for(const[key,value]of seed.values)localStorage.setItem(key,value);
let activeOwner=seed.owner,mode='ok',result=null,remoteSources=captureWorkspaceSources(localStorage),writes=0;
const root=createRoot(document.getElementById('root'));
const sync={sync:async(options={})=>{if(mode==='conflict')return{status:'CONFLICT',message:'Synthetic existing conflict'};
if(mode==='account-change'){activeOwner='22222222-2222-4222-8222-222222222222';return{status:'SYNCED'};}
if(options.allowApply!==true){remoteSources=captureWorkspaceSources(localStorage);writes++;}return{status:'SYNCED',message:'Synthetic account saved'};},
readRevision:async()=>({sources:mode==='no-ack'?{}:remoteSources})};
const workspace={user:{id:seed.owner},enabled:true,status:{status:'SYNCED',message:'Synthetic verified cloud saving'},runExclusive(operation){
flushSync(()=>root.render(null));
Promise.resolve().then(()=>operation({user:{id:seed.owner},sync,assertCurrent(){if(activeOwner!==seed.owner)throw new Error('Synthetic account changed');}})).then(()=>{result={success:true};render();}).catch(error=>{result={success:false,message:error.message};render();});}};
function render(){root.render(<div className='app' data-theme='light' style={{padding:20,minHeight:'100vh'}}><div data-testid='operation-status' role={result?.success===false?'alert':'status'}>{result?(result.success?'Synthetic import acknowledged':result.message):''}</div><CloudWorkspaceContext.Provider value={workspace}><Panel/></CloudWorkspaceContext.Provider></div>);}
window.fixture={setMode(value){mode=value;activeOwner=seed.owner;result=null;render();},setPaused(){workspace.enabled=false;localStorage.setItem('code3.cloud-saving-enabled.v1:'+seed.owner,'false');render();},snapshot(){return Object.fromEntries([...Array(localStorage.length)].map((_,index)=>{const key=localStorage.key(index);return[key,localStorage.getItem(key)];}));},getResult(){return{result,writes,remoteSources};}};
render();`;
  const bundled = await build({ stdin: { contents: entry, resolveDir: root, loader: "jsx" }, bundle: true, write: false,
    outdir: path.join(output, "bundle"), format: "esm", platform: "browser", jsx: "automatic", external: ["/assets/*"], define: { "import.meta.env": '{"DEV":true}', __EMBER_TIDE_APP_VERSION__: '"synthetic-history-test"' } });
  const js = bundled.outputFiles.find(file => file.path.endsWith(".js")).text;
  const css = bundled.outputFiles.find(file => file.path.endsWith(".css")).text;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Disposable history verification</title><link rel="stylesheet" href="/bundle.css"><style>*{box-sizing:border-box}html,body{margin:0;min-width:0}body{font-family:system-ui,sans-serif}</style></head><body><main id="root"></main><script>window.__bootstrap=${JSON.stringify(bootstrap).replaceAll("<", "\\u003c")}</script><script type="module" src="/bundle.js"></script></body></html>`;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (pathname === "/bundle.js") { response.setHeader("Content-Type", "text/javascript"); response.end(js); }
    else if (pathname === "/bundle.css") { response.setHeader("Content-Type", "text/css"); response.end(css); }
    else if (pathname === "/") { response.setHeader("Content-Type", "text/html"); response.end(html); }
    else if (pathname.startsWith("/assets/")) {
      const file = path.resolve(root, "public", "." + pathname);
      if (!file.startsWith(path.resolve(root, "public") + path.sep) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
      response.setHeader("Content-Type", file.endsWith(".css") ? "text/css" : file.endsWith(".ttf") ? "font/ttf" : "application/octet-stream"); response.end(fs.readFileSync(file));
    } else { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const results = [];
  try {
    // A fresh temporary browser profile, never the owner's installed app data.
    browser = await chromium.launch({ headless: true, channel: "chrome" });
    fs.mkdirSync(output, { recursive: true });
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: "reduce", serviceWorkers: "block" });
      const external = [], writes = [], errors = [];
      await context.route("**/*", route => {
        const request = route.request();
        if (new URL(request.url()).origin !== origin) { external.push(request.url()); return route.abort(); }
        if (request.method() !== "GET") { writes.push(request.method()); return route.abort(); }
        return route.continue();
      });
      const page = await context.newPage(); page.setDefaultTimeout(12000);
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(origin);
      await expect(page.getByRole("heading", { name: "Saved restock history", exact: true })).toBeVisible();
      await expect(page.locator(".restock-history__summary")).toContainText("35 full reports");
      await expect(page.locator(".restock-history__report")).toHaveCount(20);
      const before = await page.evaluate(() => window.fixture.snapshot());
      const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll('body *')].filter(node => node.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(node => ({ tag: node.tagName, cls: node.className, width: node.getBoundingClientRect().width, right: node.getBoundingClientRect().right })) }));
      assert.equal(layout.scroll > layout.width, false, `viewport overflow ${JSON.stringify(layout)}`);
      const smallTargets = await page.locator("input,select,button,summary").evaluateAll(nodes => nodes.filter(node => node.getClientRects().length && node.getBoundingClientRect().height < 43.5).map(node => node.tagName));
      assert.deepEqual(smallTargets, [], "visible touch targets must be at least44px");
      await page.screenshot({ path: path.join(output, `${width}-history.png`), fullPage: false });
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect(page.locator(".restock-history__report")).toHaveCount(15);
      await page.getByRole("combobox", { name: /^Source status/ }).selectOption("No stock found");
      await expect(page.locator(".restock-history__results")).toContainText("18 matching historical reports");
      await page.getByLabel("Search history", { exact: true }).fill("note 35");
      await expect(page.locator(".restock-history__report")).toHaveCount(1);
      await page.getByRole("button", { name: "Clear filters", exact: true }).click();
      await page.getByLabel("From date", { exact: true }).fill("2026-10-13");
      await expect(page.locator(".restock-history__results")).toContainText("15 matching historical reports");
      await page.getByRole("button", { name: "Clear filters", exact: true }).click();
      await page.getByText("Import historical reports", { exact: true }).click();
      const upload = async archive => page.getByLabel("History archive JSON", { exact: true }).setInputFiles({ name: "synthetic-history.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(archive)) });
      await upload(expanded);
      await expect(page.locator(".restock-history__review")).toContainText("2 new full reports");
      await page.getByRole("button", { name: "Import and save to account", exact: true }).click();
      await expect(page.getByTestId("operation-status")).toHaveText("Synthetic import acknowledged");
      await expect(page.locator(".restock-history__summary")).toContainText("37 full reports");
      const after = await page.evaluate(() => window.fixture.snapshot());
      for (const key of ["et-tcg-beta-data", "et-tcg-market-price-cache", "code3.workspace-owner.v1"]) assert.equal(after[key], before[key], key);
      const beforeScout = JSON.parse(before["et-tcg-beta-scout"]), afterScout = JSON.parse(after["et-tcg-beta-scout"]);
      delete beforeScout.historicalRestockHistory; delete afterScout.historicalRestockHistory;
      assert.deepEqual(afterScout, beforeScout, "operational Scout data must remain intact");
      await page.getByText("Import historical reports", { exact: true }).click();
      await upload(expanded);
      await expect(page.locator(".restock-history__review")).toContainText("0 new full reports");
      const beforeRepeat = await page.evaluate(() => window.fixture.snapshot());
      await page.getByRole("button", { name: "Import and save to account", exact: true }).click();
      await expect(page.getByTestId("operation-status")).toHaveText("Synthetic import acknowledged");
      const afterRepeat = await page.evaluate(() => window.fixture.snapshot());
      assert.equal(afterRepeat["et-tcg-beta-scout"], beforeRepeat["et-tcg-beta-scout"], "duplicate import must not change saved Scout bytes");

      for (const mode of ["conflict", "account-change"]) {
        await page.evaluate(mode => window.fixture.setMode(mode), mode);
        await page.getByText("Import historical reports", { exact: true }).click();
        await upload(expanded);
        await expect(page.locator(".restock-history__review")).toBeVisible();
        const saved = await page.evaluate(() => window.fixture.snapshot());
        await page.getByRole("button", { name: "Import and save to account", exact: true }).click();
        await expect(page.getByTestId("operation-status")).toContainText(mode === "conflict" ? "History has not been imported" : "account changed");
        assert.deepEqual(await page.evaluate(() => window.fixture.snapshot()), saved, `${mode} preserves all storage bytes`);
      }
      await page.evaluate(() => { window.fixture.setMode("ok"); window.fixture.setPaused(); });
      await page.getByText("Import historical reports", { exact: true }).click();
      await upload(expanded);
      await expect(page.locator(".restock-history__review")).toContainText("leaves automatic syncing paused");
      await page.getByRole("button", { name: "Import and save to account", exact: true }).click();
      await expect(page.getByTestId("operation-status")).toHaveText("Synthetic import acknowledged");
      assert.equal(await page.evaluate(owner => localStorage.getItem("code3.cloud-saving-enabled.v1:" + owner), fixtures.syntheticOwner), "false");
      assert.deepEqual(external, []); assert.deepEqual(writes, []); assert.deepEqual(errors, []);
      results.push({ width, passed: true, externalRequests: external.length, productionWrites: writes.length,
        checks: ["pagination", "search/status/date filters", "touch targets", "no overflow", "actual recovery import and readback", "repeat import", "existing record/price preservation", "conflict refusal", "account change refusal", "paused preference retained"], actualPhones: false, liveCloud: false });
      await context.close();
    }
    fs.writeFileSync(path.join(output, "browser-results.json"), JSON.stringify({ results }, null, 2));
    console.log(JSON.stringify({ results }, null, 2));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
