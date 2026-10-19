const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium, expect } = require("@playwright/test");

const origin = "http://127.0.0.1:5243";
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/workspace-experience");
const entry = `
import React from 'react'; import {createRoot} from 'react-dom/client';
import './src/index.css'; import './src/App.css';
import FlipScoutPage from './src/features/flipScout/FlipScoutPage.jsx';
import {CollectionWorkspace,BusinessWorkspace} from './src/pages/EverydayWorkspaces.jsx';
import WorkspaceHomePage from './src/features/workspaces/WorkspaceHomePage.jsx';
import {resolveExperiencePresentation} from './src/utils/experiencePresentation.js';
import {createEmptyFlipScoutState,FLIP_SCOUT_STORAGE_KEY} from './src/features/flipScout/constants.js';
const seed=createEmptyFlipScoutState();
seed.deals=[{id:'qa-deal',title:'QA collector packs',askingPrice:40,projectedProfit:12,status:'Watching',marketplace:'Manual URL',imageReferences:[],riskFlags:[],createdAt:'2026-10-17T12:00:00.000Z'}];
seed.inventory=[{id:'qa-card',name:'QA collection card',quantity:1,ownedItemPurpose:'PERSONAL_COLLECTION',projectedResaleMid:25,allocatedItemCost:10,productClassification:'Single Card',createdAt:'2026-10-17T12:00:00.000Z'}];
seed.purchases=[{id:'qa-purchase',title:'QA purchase',totalPurchaseCost:10,purchaseDate:'2026-10-17'}];
seed.expenses=[{id:'qa-expense',description:'QA postage',amount:4,date:'2026-10-17',category:'Shipping'}];
localStorage.setItem(FLIP_SCOUT_STORAGE_KEY,JSON.stringify(seed));
window.qaSnapshot=()=>{const state=JSON.parse(localStorage.getItem(FLIP_SCOUT_STORAGE_KEY));return JSON.stringify([state.deals,state.inventory,state.purchases,state.sales,state.expenses,state.mileage]);};
window.qaOriginal=window.qaSnapshot();window.qaCalls=[];
const root=createRoot(document.getElementById('root'));let revision=0;
window.qaRender=({screen='find',persona='collector',view='overview',admin=false}={})=>{
 const experiencePresentation=resolveExperiencePresentation({personaPreference:persona,adminVisible:admin});
 const props={experiencePresentation,onViewChange:(...args)=>window.qaCalls.push(args)};
 const content=screen==='home'?<WorkspaceHomePage {...props} workspace={view} items={seed.inventory} sales={seed.sales} onNavigate={(...args)=>window.qaCalls.push(args)} onAddResale={()=>window.qaCalls.push(['add-resale'])}/>:screen==='find'?<FlipScoutPage {...props} onReportRestock={()=>window.qaCalls.push(['report'])} onOpenRestocks={()=>window.qaCalls.push(['browse'])}/>:screen==='collection'?<CollectionWorkspace {...props} portfolioScope="qa-workspace-experience"/>:<BusinessWorkspace {...props} initialView={view}/>;
 root.render(<div key={++revision} className="app app-command-shell" data-theme={document.documentElement.dataset.theme}>{content}</div>);
};window.qaRender();
`;

(async () => {
  fs.mkdirSync(output, { recursive: true });
  await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: "jsx" }, bundle: true, jsx: "automatic", format: "esm", outfile: path.join(output, "fixture.js"), define: { "import.meta.env": "{}" }, external: ["/assets/*"] });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  let lastPage;
  try {
    for (const { width, theme } of [{ width: 320, theme: "dark" }, { width: 390, theme: "light" }, { width: 1440, theme: "dark" }]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
      const attemptedWrites = [];
      await context.route("**/*", route => {
        const request = route.request(); const url = new URL(request.url());
        if (request.method() !== "GET") attemptedWrites.push(request.method());
        if (request.method() !== "GET" || url.origin !== origin) return route.abort();
        if (url.pathname === "/__qa/experience") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html data-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__qa/fixture.css"></head><body><div id="root"></div><script type="module" src="/__qa/fixture.js"></script></body></html>` });
        if (["/__qa/fixture.js", "/__qa/fixture.css"].includes(url.pathname)) return route.fulfill({ contentType: url.pathname.endsWith(".js") ? "text/javascript" : "text/css", body: fs.readFileSync(path.join(output, path.basename(url.pathname))) });
        return route.abort();
      });
      const page = await context.newPage(); lastPage = page; const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${origin}/__qa/experience`);
      const nav = page.getByRole("navigation", { name: "Find navigation", exact: true });
      await expect(nav).toBeVisible();
      assert.deepEqual(await nav.locator("button").allTextContents(), ["Restocks", "Deals", "Auctions"]);
      await expect(page.locator(".flip-deal-summary")).toContainText("Saved status");
      await expect(page.locator(".flip-deal-summary")).not.toContainText("Projected profit");
      await page.locator(".flip-more-menu > summary").click();
      await expect(page.locator(".flip-more-menu").getByRole("button", { name: "Buy Offer", exact: true })).toBeVisible();
      for (const name of ["Import Review", "Sources", "Search Rule Editor"]) await expect(page.locator(".flip-more-menu").getByRole("button", { name, exact: true })).toHaveCount(0);
      await page.locator(".flip-more-menu > summary").click();
      await page.getByRole("button", { name: "Review", exact: true }).click();
      await expect(page.getByRole("heading", { name: "QA collector packs", exact: true })).toBeVisible();
      await expect(page.locator("body")).toContainText("$12.00");
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(nav).toBeVisible();
      await page.screenshot({ path: path.join(output, `${width}-${theme}-collector-find.png`), fullPage: true });

      await page.evaluate(() => window.qaRender({ screen: "find", persona: "seller" }));
      await expect(page.locator(".flip-deal-summary")).toContainText("Projected profit");
      await expect(page.locator(".flip-deal-summary")).toContainText("$12.00");
      await page.locator(".flip-more-menu > summary").click();
      for (const name of ["Import Review", "Sources", "Search Rule Editor"]) await expect(page.locator(".flip-more-menu").getByRole("button", { name, exact: true })).toBeVisible();

      await page.evaluate(() => window.qaRender({ screen: "business" }));
      await expect(page.getByRole("heading", { name: "Sell or trade", exact: true })).toBeVisible();
      assert.deepEqual(await page.locator(".business-destination-copy strong").allTextContents(), ["Items for sale", "Sales"]);
      await expect(page.getByRole("button", { name: /Compliance/ })).toHaveCount(0);
      await page.locator(".everyday-more-menu > summary").filter({ hasText: "More saved records" }).click();
      await expect(page.getByRole("button", { name: "Purchases", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Money", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Open QA postage", exact: true }).click();
      await expect(page.getByRole("heading", { name: "QA postage", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await page.getByRole("button", { name: "Back to Sell or trade", exact: true }).click();
      await page.screenshot({ path: path.join(output, `${width}-${theme}-collector-selling.png`), fullPage: true });

      for (const persona of ["seller", "store"]) {
        await page.evaluate(persona => window.qaRender({ screen: "business", persona }), persona);
        await expect(page.getByRole("heading", { name: persona === "store" ? "Store" : "Business", exact: true })).toBeVisible();
        assert.deepEqual(await page.locator(".business-destination-copy strong").allTextContents(), ["Purchases", "Inventory", "Sales", "Money", "Compliance"]);
      }
      await page.evaluate(() => window.qaRender({ screen: "collection" }));
      await page.locator(".collection-portfolio-grid").getByRole("button", { name: "Open QA collection card", exact: true }).click();
      await expect(page.getByRole("heading", { name: "QA collection card", exact: true })).toBeVisible();
      await expect(page.locator("body")).toContainText("Estimated value");
      await expect(page.locator("body")).not.toContainText("Projected resale");
      await page.getByRole("button", { name: "Back", exact: true }).click();
      for (const persona of ["collector", "seller", "store"]) {
        await page.evaluate(persona => window.qaRender({ screen: "home", view: "FIND", persona }), persona);
        const findActions = page.getByRole("region", { name: "Find actions", exact: true });
        await expect(findActions.locator("button").first()).toHaveText("Browse restocks");
        await expect(page.getByRole("heading", { name: persona === "collector" ? "Saved finds" : "Sourcing activity", exact: true })).toBeVisible();
        await findActions.getByRole("button", { name: "Browse restocks", exact: true }).click();
        assert.deepEqual(await page.evaluate(() => window.qaCalls.at(-1)), ["/find/restocks"]);
        await findActions.getByRole("button", { name: "Buy Offer", exact: true }).click();
        assert.deepEqual(await page.evaluate(() => window.qaCalls.at(-1)), ["/find/buy-offer"]);
        await page.evaluate(persona => window.qaRender({ screen: "home", view: "SELL", persona }), persona);
        await expect(page.getByRole("heading", { name: persona === "store" ? "Store sales" : persona === "seller" ? "Sell" : "Sell or trade", exact: true })).toBeVisible();
        await page.getByRole("button", { name: persona === "collector" ? "Add an item to sell" : "Add Resale Inventory", exact: true }).click();
        assert.deepEqual(await page.evaluate(() => window.qaCalls.at(-1)), ["add-resale"]);
      }
      assert.equal(await page.evaluate(() => window.qaSnapshot()), await page.evaluate(() => window.qaOriginal), "Presentation and record browsing preserve every synthetic record");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      assert.deepEqual(errors, []); assert.deepEqual(attemptedWrites, []);
      results.push({ width, theme, collectorRestocksFirst: true, workspaceHomeRestocksPrimary: true, personaWorkspaceTitles: true, advancedLinksHidden: true, originalDetailsAccessible: true, sellerAndStoreToolsPreserved: true, existingRecordsReachable: true, recordsUnchanged: true, noNetworkWrites: true });
      await context.close();
    }
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ actualComponents: true, syntheticOnly: true, results }, null, 2));
    console.log(`PASS workspace experience browser: ${results.length} viewports/themes, collector/seller/store, navigation, original details and preserved records.`);
  } catch (error) {
    if (lastPage && !lastPage.isClosed()) {
      await lastPage.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
      fs.writeFileSync(path.join(output, "failure.txt"), await lastPage.locator("body").innerText().catch(() => "No body"));
    }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
