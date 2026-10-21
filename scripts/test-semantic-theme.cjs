const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

// New disposable loopback contexts only. No owner sign-in or provider writes.
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5381/");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Theme QA is restricted to loopback");
const colors = {
  light: ["#FBF4E6", "#FFFCF7", "#222222", "#675852", "#7A0F1E", "#FFFFFF", "#DCD0C8"],
  dark: ["#141619", "#202328", "#FBF4E6", "#C1BDC4", "#E8C86B", "#241B13", "#41454E"],
};
const tokens = ["--app-background", "--surface-primary", "--text-primary", "--text-secondary", "--action-primary", "--on-primary", "--border-subtle"];
const routes = [
  { path: "/", name: "home", ready: ".ops-home-page" },
  { path: "/collection", name: "collection", ready: '[data-testid="collection-workspace"]' },
  { path: "/business/inventory", name: "inventory", ready: '[data-testid="business-workspace"]' },
  { path: "/business/sales", name: "sales", ready: '[data-testid="business-workspace"]' },
  { path: "/settings", name: "settings", ready: ".settings-layout" },
];
const selectedRoutes = process.env.THEME_QA_ROUTE ? routes.filter(route=>route.name===process.env.THEME_QA_ROUTE) : routes;
assert.ok(selectedRoutes.length,"THEME_QA_ROUTE must name an existing theme QA screen");
const rgb = color => color.match(/[\da-f]{2}/gi).map(channel => parseInt(channel, 16));
const luminance = color => rgb(color).map(channel => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
const hexToRgb = value => `rgb(${rgb(value).join(", ")})`;
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/semantic-theme");
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300"><rect width="240" height="300" rx="20" fill="#4B1B6B"/><rect x="20" y="20" width="200" height="260" rx="12" fill="#7A0F1E" stroke="#D4AF37" stroke-width="7"/><path d="M120 65 135 118 185 135 135 150 120 205 105 150 55 135 105 118Z" fill="#D4AF37"/><text x="120" y="255" fill="#FBF4E6" text-anchor="middle" font-family="sans-serif" font-size="19">QA collectible</text></svg>';

function installFixture({ theme }) {
  localStorage.setItem("et-tcg-app-theme", theme);
  localStorage.setItem("__code3_brand_local_fixture", "1");
  const item = (index, purpose) => ({ id: `qa-color-${index}`, name: `QA ${purpose === "PERSONAL_COLLECTION" ? "personal collection" : "resale inventory"} ${index + 1}`, itemImage: "/__qa/color-item.svg", imageUrl: "/__qa/color-item.svg", quantity: index + 1, ownedItemPurpose: purpose, productClassification: "Sealed product", productType: "Sealed", tcgGame: "pokemon", workspaceId: "workspace-personal-local-beta", status: "In stock", allocatedItemCost: 12, projectedResaleMid: 25, marketPrice: 25, notes: "Synthetic color QA record only." });
  const items = [item(0,"FOR_RESALE"), item(1,"FOR_RESALE"), item(2,"PERSONAL_COLLECTION"), item(3,"PERSONAL_COLLECTION")];
  const sales = [{ id:"qa-color-sale", title:"QA resale inventory 1 sale", itemImage:"/__qa/color-item.svg", inventoryItemId:items[0].id, itemId:items[0].id, itemName:items[0].name, quantitySold:1, salesChannel:"Local", saleDate:"2026-10-20", grossSalePrice:40, allocatedCostOfGoodsSold:12, status:"Completed", notes:"Synthetic color QA sale only." }];
  localStorage.setItem("et-tcg-beta-data", JSON.stringify({ userType:"seller", dashboardPreset:"seller", appThemeChoice:theme, profile:{ userId:"local-beta", email:"brand-preview@example.test", displayName:"Color QA Collector", appRole:"user", appAccess:"approved" }, subscriptionProfile:{tier:"seller",featureTier:"seller",subscriptionPlan:"seller",subscriptionStatus:"active"}, appSetupPersonalization:{experiencePersona:"seller",optionalTools:{community:false,family:false,assistant:false}}, activeWorkspaceId:"workspace-personal-local-beta", items, sales, expenses:[] }));
}

(async () => {
  fs.mkdirSync(output,{recursive:true});
  const browser = await chromium.launch({headless:true});
  const results = [];
  const failures = [];
  try {
    for (const theme of ["light", "dark"]) for (const width of [390,1440,360]) {
      const height = width < 1000 ? 844 : 900;
      const context = await browser.newContext({ viewport:{width,height}, serviceWorkers:"block", reducedMotion:"reduce" });
      const blocked = [];
      const pageErrors = [];
      await context.addInitScript(installFixture,{theme});
      await context.route("**/*", route => {
        const request = route.request(), url = new URL(request.url());
        if (!["GET","HEAD"].includes(request.method()) || url.origin !== base.origin) { blocked.push({method:request.method(),origin:url.origin}); return route.abort(); }
        if (url.pathname === "/__qa/color-item.svg") return route.fulfill({contentType:"image/svg+xml",body:image});
        if (url.pathname.startsWith("/api/")) return route.fulfill({contentType:"application/json",body:'{"configured":false,"healthy":false}'});
        return route.continue();
      });
      const page = await context.newPage();
      page.on("pageerror",error=>pageErrors.push(error.message));
      page.setDefaultTimeout(20000);
      try {
        for (const route of selectedRoutes) {
          const result = {theme,width,height,route:route.path,passed:false};
          try {
            const url = new URL(route.path,base); url.searchParams.set("betaLocalMode","true"); url.searchParams.set("themeInspect",theme);
            await page.goto(url.href);
            await page.locator(".app[data-theme]").waitFor();
            const skipSetup = page.getByRole("button",{name:/Skip.*now|Skip setup|Not now/i});
            if (await skipSetup.count() && await skipSetup.first().isVisible()) await skipSetup.first().click();
            await page.locator(route.ready).waitFor({state:"visible"});
            await page.locator(".main > .route-loading-card").waitFor({state:"hidden"});
            await page.evaluate(()=>document.fonts.ready);
            await page.waitForTimeout(150);
            const actual = await page.locator(".app[data-theme]").evaluate((app,tokens)=>{const style=getComputedStyle(app);return {theme:app.dataset.theme,tokens:tokens.map(token=>style.getPropertyValue(token).trim().toUpperCase())};},tokens);
            assert.equal(actual.theme,theme,"Saved theme respected: "+route.path);
            assert.deepEqual(actual.tokens,colors[theme],route.path);
            const palette = await page.locator(".app[data-theme]").evaluate(app=>{const style=getComputedStyle(app);const names=["--app-background","--surface-primary","--surface-secondary","--surface-inset","--surface-elevated","--text-primary","--text-secondary","--action-primary","--border-strong","--status-success","--status-warning","--status-danger","--status-info"];return Object.fromEntries(names.map(name=>[name,style.getPropertyValue(name).trim()]));});
            for(const surface of ["--app-background","--surface-primary","--surface-secondary","--surface-inset","--surface-elevated"]) for(const foreground of ["--text-primary","--text-secondary","--action-primary","--status-success","--status-warning","--status-danger","--status-info","--border-strong"]) assert.ok(contrast(palette[foreground],palette[surface]) >= (foreground === "--border-strong" ? 3 : 4.5),`${theme}: ${foreground} contrast on ${surface}`);
            const canvas=await page.evaluate(()=>[document.documentElement,document.body].map(el=>getComputedStyle(el).backgroundColor));
            assert.ok(canvas.every(color=>color===hexToRgb(colors[theme][0])),"Outer page canvas follows saved theme: "+canvas.join(","));
            const buttons=await page.locator(".ops-button--primary:visible, .command-board-v4-primary-action:visible, .topbar-quick-add-button:visible, .mobile-quick-add-fab:visible").evaluateAll(nodes=>nodes.filter(el=>!el.disabled).map(el=>{const s=getComputedStyle(el);return {text:el.textContent,background:s.backgroundColor,color:s.color,height:el.getBoundingClientRect().height,gold:Boolean(el.matches(".topbar-quick-add-button")||el.closest(".home-layout,.everyday-workspace")),labels:[...el.querySelectorAll("b,strong,span")].map(label=>getComputedStyle(label).color)};}));
            for(const button of buttons){assert.equal(button.background,hexToRgb(button.gold?"#D4AF37":colors[theme][4]),button.text);assert.equal(button.color,hexToRgb(button.gold?"#241B13":colors[theme][5]),button.text);assert.ok(button.height>=43.5,"44px action: "+button.text);assert.ok(button.labels.every(color=>color===button.color),"Nested primary label contrast: "+button.text);}
            assert.equal(await page.evaluate(()=>localStorage.getItem("et-tcg-app-theme")),theme);
            assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"No horizontal overflow");
            await page.keyboard.press("Tab");
            const focus = await page.evaluate(()=>{const el=document.activeElement,s=getComputedStyle(el);return {visible:el.matches(":focus-visible"),width:parseFloat(s.outlineWidth),style:s.outlineStyle,color:s.outlineColor};});
            assert.ok(focus.visible&&focus.width>=3&&focus.style!=="none"&&focus.color!=="rgba(0, 0, 0, 0)","Keyboard focus remains clearly visible: "+JSON.stringify(focus));
            result.keyboardFocus=focus;
            const motion=await page.locator(".app[data-theme] button:visible").evaluateAll(nodes=>nodes.every(node=>{const s=getComputedStyle(node);return s.animationName==="none"&&s.transitionDuration.split(",").every(value=>parseFloat(value)===0);}));
            assert.equal(motion,true,"Reduced-motion controls have no transitions/animations");
            if(route.name==="collection"){
              assert.equal(await page.locator(".collection-portfolio-item").count(),2,"Synthetic personal collection records render");
              await page.getByRole("button",{name:"Filter",exact:true}).click();const dialog=page.getByRole("dialog");await dialog.waitFor();await page.keyboard.press("Tab");assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)),"Dialog retains keyboard focus");await page.screenshot({path:path.join(output,`${theme}-${width}-filters.png`),fullPage:false});await page.keyboard.press("Escape");await dialog.waitFor({state:"hidden"});
            }
            if(route.name==="home"){
              const resalePreview=await page.locator('[data-home-card="forgeSummary"] .home-collection-peek figcaption').allTextContents();
              assert.deepEqual(resalePreview,["QA resale inventory 1","QA resale inventory 2"],"Selling records preview excludes personal collection items");
              await page.getByRole("button",{name:"Report a restock",exact:true}).click();const modal=page.locator('.flow-modal[data-flow="scoutSubmit"]');await modal.waitFor();await modal.locator(".scout-report-stepper").waitFor({state:"visible"});await page.screenshot({path:path.join(output,`${theme}-${width}-restock.png`),fullPage:false});await modal.getByRole("button",{name:"Cancel",exact:true}).click();await modal.waitFor({state:"hidden"});assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("et-tcg-beta-scout")||"{}").reports?.length||0),0,"No restock saved during color QA");
            }
            if(route.name==="inventory")assert.equal(await page.locator(".everyday-record-card").count(),2,"Synthetic resale inventory records render");
            if(route.name==="sales")assert.equal(await page.getByText("QA resale inventory 1 sale",{exact:true}).count(),1,"Synthetic sale renders");
            await page.evaluate(()=>scrollTo(0,0));
            await page.screenshot({path:path.join(output,`${theme}-${width}-${route.name}.png`),fullPage:false});
            result.primaryActions=buttons.length;result.palette=actual.tokens;result.passed=true;
            console.log("PASS semantic palette, contrast, preference, controls, motion and layout:",theme,width,route.path);
          }catch(error){result.error=error.message;failures.push(result);await page.screenshot({path:path.join(output,`${theme}-${width}-${route.name}-failure.png`),fullPage:true}).catch(()=>{});console.error("FAIL",theme,width,route.path,error.message);}
          results.push(result);
        }
        assert.deepEqual(pageErrors,[],"No application runtime errors");
        assert.equal(blocked.filter(row=>row.method!=="GET"&&row.method!=="HEAD").length,0,"No mutation network requests attempted");
      }finally{await context.close();}
    }
  }finally{await browser.close();fs.writeFileSync(path.join(output,"results.json"),JSON.stringify({syntheticOnly:true,base:base.origin,results,failures},null,2));}
  assert.equal(failures.length,0,`${failures.length} semantic theme cases failed; inspect results.json`);
})().catch(error=>{console.error(error);process.exitCode=1;});
