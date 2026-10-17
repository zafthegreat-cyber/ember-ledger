const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");

const origin = "http://127.0.0.1:5238";
const output = path.resolve("artifacts/qa/admin-display-controls");
const appSource = fs.readFileSync("src/App.jsx", "utf8");
const start = appSource.indexOf('<section className={`admin-mode-control-bar');
const end = appSource.indexOf("</section>", start) + "</section>".length;
assert.ok(start > 0 && end > start, "Use the actual production admin-control JSX");
const controls = appSource.slice(start, end);
const bannerStart = appSource.indexOf('<div className="admin-edit-mode-banner"');
const bannerEnd = appSource.indexOf("</div>", bannerStart) + "</div>".length;
assert.ok(bannerStart > 0 && bannerEnd > bannerStart);
const entry = `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import './src/index.css';import './src/App.css';
function Fixture(){
 const [displayedAdminViewMode,changeView]=useState('admin');
 const [adminEditModeActive,setAdminEditMode]=useState(false);
 const actualAdminRole='admin';const adminViewingAsAdmin=displayedAdminViewMode==='admin';
 const setAdminModeView=(mode)=>{changeView(mode);if(mode==='regular')setAdminEditMode(false);};
 const theme=document.documentElement.dataset.theme;
 return <main className={'app app-theme-'+theme} data-theme={theme}>
  ${controls}
  {adminEditModeActive?${appSource.slice(bannerStart,bannerEnd)}:null}
 </main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;

(async()=>{
 fs.mkdirSync(output,{recursive:true});
 await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:"jsx"},bundle:true,jsx:"automatic",format:"esm",outfile:path.join(output,"fixture.js"),external:["/assets/*"]});
 const browser=await chromium.launch({headless:true});let checks=0;const screens=[];
 try {
  for(const width of [360,390,1440])for(const theme of ["light","dark"]){
   const context=await browser.newContext({viewport:{width,height:width<1000?844:900}});
   await context.route("**/*",route=>{
    const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
    if(url.pathname==="/__qa/admin-controls")return route.fulfill({contentType:"text/html",body:`<!doctype html><html data-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__qa/fixture.css"></head><body><div id="root"></div><script type="module" src="/__qa/fixture.js"></script></body></html>`});
    if(url.pathname==="/__qa/fixture.js")return route.fulfill({contentType:"text/javascript",body:fs.readFileSync(path.join(output,"fixture.js"))});
    if(url.pathname==="/__qa/fixture.css")return route.fulfill({contentType:"text/css",body:fs.readFileSync(path.join(output,"fixture.css"))});
    return route.abort();
   });
   const page=await context.newPage();const errors=[];page.on("pageerror",error=>errors.push(error.message));
   await page.goto(origin+"/__qa/admin-controls");
   const region=page.getByRole("region",{name:"Admin display controls"});await region.waitFor();
   const layout=await region.evaluate(element=>{
    const summary=element.querySelector('.admin-mode-control-summary');
    const rows=[...summary.children].map(child=>child.getBoundingClientRect());
    const buttons=[...element.querySelectorAll('button')].map(button=>button.getBoundingClientRect());
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,separateLines:rows.every((rect,index)=>!index||rect.top>=rows[index-1].bottom),touchTargets:buttons.every(rect=>rect.width>=44&&rect.height>=44),summaryDisplay:getComputedStyle(summary).display};
   });
   assert.equal(layout.overflow,false);assert.equal(layout.separateLines,true);assert.equal(layout.touchTargets,true);assert.equal(layout.summaryDisplay,"grid");checks+=4;
   assert.equal(await region.getByRole("button",{name:"Admin",exact:true}).getAttribute("aria-pressed"),"true");checks++;
   await region.getByRole("button",{name:"Regular",exact:true}).click();
   assert.equal(await region.getByRole("button",{name:"On",exact:true}).isDisabled(),true);checks++;
   assert.equal(await region.getByRole("button",{name:"Regular",exact:true}).getAttribute("aria-pressed"),"true");checks++;
   await region.getByRole("button",{name:"Admin",exact:true}).click();
   await region.getByRole("button",{name:"On",exact:true}).click();
   assert.equal(await region.getByRole("button",{name:"On",exact:true}).getAttribute("aria-pressed"),"true");checks++;
   await page.getByRole("status").filter({hasText:"Admin Edit Mode ON"}).waitFor();
   const tones=await region.evaluate(element=>({active:getComputedStyle(element.querySelector('[aria-label="Viewing mode"] [aria-pressed="true"]')).color,danger:getComputedStyle(element.querySelector('[aria-label="Edit mode"] [aria-pressed="true"]')).color}));
   assert.notEqual(tones.active,tones.danger);checks++;
   await region.getByRole("button",{name:"Off",exact:true}).focus();await page.keyboard.press("Tab");
   const focus=await region.getByRole("button",{name:"On",exact:true}).evaluate(element=>({active:document.activeElement===element,outline:getComputedStyle(element).outlineStyle,width:getComputedStyle(element).outlineWidth}));
   assert.equal(focus.active,true);assert.notEqual(focus.outline,"none");assert.ok(parseFloat(focus.width)>=2);checks+=3;
   await page.screenshot({path:path.join(output,`${width}-${theme}.png`),fullPage:true});
   assert.deepEqual(errors,[]);checks++;
   screens.push({width,theme,...layout});await context.close();
  }
  const result={passed:checks,screens:6,actualProductionJsx:true,productionStyles:true,syntheticStateOnly:true,results:screens};
  fs.writeFileSync(path.join(output,"results.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
