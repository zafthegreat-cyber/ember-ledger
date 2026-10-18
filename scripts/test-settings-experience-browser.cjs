const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5243").origin;
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname));
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/settings-experience");
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "fixture.html"), `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic Settings presentation</title></head><body><div id="root"></div><script type="module">
import React from "react"; import {createRoot} from "react-dom/client";
import "/src/index.css"; import "/src/App.css";
import Menu from "/src/pages/Menu.jsx";
import {resolveExperiencePresentation} from "/src/utils/experiencePresentation.js";
const h=React.createElement; const root=createRoot(document.getElementById("root"));let revision=0;
window.qaRender=({theme="light",persona="collector",family=false,community=false,admin=false,preview=false}={})=>{
  const experience=resolveExperiencePresentation({personaPreference:persona,adminVisible:admin,canPreview:admin,preview:{enabled:preview,tier:"free"}});
  window.qaCalls=[];const call=(...args)=>window.qaCalls.push(args);
  root.render(h("div",{key:++revision,className:"app app-command-shell", "data-theme":theme,style:{padding:"16px",minHeight:"100dvh"}},h(Menu,{
    experiencePresentation:experience,showFamilyExperience:family,showCommunityExperience:community,
    activeWorkspaceName:"Synthetic collector workspace",betaAccessAllowed:()=>true,
    betaReadinessData:{kidsApplications:[{id:"existing-kid-request"}]},settingsFamilyStatusLabel:"Parent reviewed",scoutGuessPoints:12,
    openUtilityPage:value=>call("utility",value),openBeaconCenter:value=>call("beacon",value),openCompassSearch:value=>call("search",value),
    renderUtilityPageShell:({children,className})=>h("main",{className},children),
    renderSettingsPreferencesCard:()=>h("p",{},"Existing appearance controls"),renderSettingsWorkspaceCard:()=>h("p",{},"Existing workspace controls"),
    renderSettingsPrivacySafetyCard:()=>h("p",{},"Existing privacy controls"),renderAppBuildDetails:()=>h("p",{},"Existing build details")
  })));
};window.qaReady=true;
</script></body></html>`);
const fixturePath = path.relative(process.cwd(), path.join(output, "fixture.html")).replaceAll(path.sep, "/");
const cases = [{width:320,height:568},{width:390,height:844},{width:1440,height:900}].flatMap(viewport=>["light","dark"].map(theme=>({...viewport,theme})));

(async()=>{
  const browser=await chromium.launch({headless:true});const results=[];let lastPage;
  try {
    for(const testCase of cases){
      const context=await browser.newContext({viewport:{width:testCase.width,height:testCase.height},reducedMotion:"reduce",serviceWorkers:"block"});
      const writes=[];const errors=[];
      await context.route("**/*",route=>{const request=route.request();const url=new URL(request.url());if(request.method()!=="GET"){writes.push(request.method()+" "+url.pathname);return route.abort();}if(url.origin!==base)return route.abort();return route.continue();});
      const page=await context.newPage();lastPage=page;page.on("pageerror",error=>errors.push(error.message));
      await page.goto(`${base}/${fixturePath}`);await page.waitForFunction(()=>window.qaReady);
      const preserved=' {"items":[{"id":"existing-card","quantity":2}],"sales":[],"expenses":[]} ';
      await page.evaluate(value=>localStorage.setItem("et-tcg-beta-data",value),preserved);
      const render=async props=>{await page.evaluate(value=>window.qaRender(value),{theme:testCase.theme,...props});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
      for(const persona of ["collector","seller","store"]){
        await render({persona});
        await expect(page.getByRole("heading",{name:"Privacy & safety",exact:true})).toBeVisible();
        await expect(page.getByRole("button",{name:/^Family permissions/})).toHaveCount(0);
        await expect(page.getByRole("button",{name:/^The Spark/})).toHaveCount(0);
        await expect(page.getByRole("button",{name:/^Community/})).toHaveCount(0);
        await expect(page.getByText("Family protection",{exact:true})).toHaveCount(0);
        await expect(page.locator(".settings-layout__note")).toHaveCount(0);
        await expect(page.locator(".settings-layout__account-meta")).toContainText(persona[0].toUpperCase()+persona.slice(1));
        await expect(page.locator(".ops-page-header")).toContainText(persona==="store"?"Your store workspace":persona==="seller"?"Your selling workspace":"the way you collect");
        await page.getByRole("button",{name:/^Safety center/}).click();assert.deepEqual(await page.evaluate(()=>window.qaCalls.at(-1)),["utility","trust"]);
        const privacy=page.locator("summary").filter({hasText:"Privacy & safeguards"});await privacy.click();await expect(page.getByText("Existing privacy controls",{exact:true})).toBeVisible();
        for(const [label,destination] of [[/^Open Profile/,"profile"],[/^Account & security/,"account"],[/^Plans & access/,"membership"],[/^Archive & backups/,"dataBackup"],[/^Help & app status/,"help"]]){
          await page.getByRole("button",{name:label}).click();assert.deepEqual(await page.evaluate(()=>window.qaCalls.at(-1)),["utility",destination]);
        }
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,"Settings fit the viewport");
        await page.screenshot({path:path.join(output,`${testCase.width}-${testCase.theme}-${persona}.png`),fullPage:true});
      }
      await render({family:true});
      await expect(page.getByRole("heading",{name:"Family & safety",exact:true})).toBeVisible();
      await expect(page.getByText("Family protection",{exact:true})).toBeVisible();
      await expect(page.locator(".settings-layout__note")).toBeVisible();
      await expect(page.getByRole("button",{name:/^Community/})).toHaveCount(0);
      for(const [label,destination] of [[/^Family permissions/,"parentCenter"],[/^The Spark/,"kidsProgram"]]){await page.getByRole("button",{name:label}).click();assert.deepEqual(await page.evaluate(()=>window.qaCalls.at(-1)),["utility",destination]);}
      await render({community:true});
      await expect(page.getByRole("heading",{name:"Community & safety",exact:true})).toBeVisible();
      await expect(page.getByRole("button",{name:/^Family permissions/})).toHaveCount(0);
      await page.getByRole("button",{name:/^Community/}).click();assert.deepEqual(await page.evaluate(()=>window.qaCalls.at(-1)),["utility","tidepool"]);
      await render({admin:true});
      await expect(page.getByRole("heading",{name:"Family, community & safety",exact:true})).toBeVisible();
      await expect(page.getByRole("button",{name:/^Family permissions/})).toBeVisible();
      await expect(page.getByRole("button",{name:/^Community/})).toBeVisible();
      await render({admin:true,preview:true});
      await expect(page.getByRole("heading",{name:"Privacy & safety",exact:true})).toBeVisible();
      await expect(page.getByRole("button",{name:/^Family permissions/})).toHaveCount(0);
      await expect(page.getByRole("button",{name:/^Community/})).toHaveCount(0);
      const safety=page.getByRole("button",{name:/^Safety center/});await safety.focus();await page.keyboard.press("Shift+Tab");await page.keyboard.press("Tab");await expect(safety).toBeFocused();
      assert.notEqual(await safety.evaluate(node=>getComputedStyle(node).outlineStyle),"none","Keyboard focus remains visible");
      const targets=await page.locator(".settings-layout__row, .settings-layout__disclosure > summary").evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));assert.ok(targets.every(height=>height>=44));
      assert.equal(await page.evaluate(()=>localStorage.getItem("et-tcg-beta-data")),preserved,"Presentation and navigation preserve existing record bytes");
      assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
      results.push({...testCase,personas:["collector","seller","store"],familyOptIn:true,communityOptIn:true,adminVisibility:true,regularPreviewHidesExtras:true,accountCallbacksPreserved:true,safetyAndPrivacyAlwaysPresent:true,keyboardFocus:true,touchTargets44:true,recordBytesUnchanged:true,writes,errors});
      console.log(`PASS Settings ${testCase.width}-${testCase.theme}: persona wording, optional tools, account destinations, privacy, focus and preserved records.`);await context.close();
    }
    fs.writeFileSync(path.join(output,"results.json"),JSON.stringify({createdAt:new Date().toISOString(),realComponent:true,syntheticOnly:true,results},null,2));
  } catch(error){if(lastPage&&!lastPage.isClosed()){await lastPage.screenshot({path:path.join(output,"failure.png"),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(output,"failure.txt"),await lastPage.locator("body").innerText().catch(()=>"Unavailable"));}throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
