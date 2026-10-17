const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const out = path.resolve(process.env.QA_OUTPUT_DIR || path.join(__dirname,'../artifacts/qa/smart-setup-browser'));
const origin = process.env.QA_APP_URL || 'http://127.0.0.1:5217';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Smart Setup browser checks require a loopback local app URL.');
const selectedProfiles = String(process.env.QA_PROFILES || '').split(',').filter(Boolean);
const profiles = [
  {name:'360x664',width:360,height:664},
  {name:'390x844',width:390,height:844},
  {name:'1440x1000',width:1440,height:1000},
  {name:'360x664-text200',width:360,height:664,font:32},
  {name:'844x390-landscape',width:844,height:390},
];
if(selectedProfiles.some(name=>!profiles.some(profile=>profile.name===name)))throw new Error('QA_PROFILES contains an unknown viewport profile.');
const results=[];
const frame=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch();
 try {
  for(const profile of profiles.filter(profile => !selectedProfiles.length || selectedProfiles.includes(profile.name))) for(const theme of ['light','dark']) {
   const run={name:`${profile.name}-${theme}`,profile,theme,failures:[],errors:[],steps:[],requestBlocks:0};
   const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},isMobile:profile.width<900,hasTouch:profile.width<900,serviceWorkers:'block'});
   await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(!['127.0.0.1','localhost'].includes(url.hostname)||req.method()!=='GET'){run.requestBlocks++;return route.abort();}if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"error":"isolated local QA"}'});return route.continue();});
   const page=await context.newPage();
   page.setDefaultTimeout(8000);
   page.on('pageerror',e=>run.errors.push(e.message));
   const check=(pass,message,data)=>{if(!pass)run.failures.push({message,...data});};
   const open=async()=>{
    await page.locator('.settings-layout').waitFor();
    if(profile.font)await page.addStyleTag({content:`html {font-size:${profile.font}px !important}`});
    const summary=page.locator('.settings-layout__disclosure > summary').filter({hasText:'Appearance & preferences'});
    if(!(await summary.evaluate(n=>n.parentElement.open)))await summary.click();
    await page.getByRole('button',{name:'Update setup',exact:true}).click();
    await page.getByRole('dialog',{name:'Your Code 3 TCG'}).waitFor();
    await frame(page);
   };
   const inspectFocus=async(step,action)=>{
    const data=await page.evaluate(()=>{const h=document.querySelector('#smart-setup-step-title');const r=h.getBoundingClientRect();const body=document.querySelector('.smart-setup-body');const clip=(getComputedStyle(body).overflowY==='visible'?document.querySelector('.smart-setup-modal'):body).getBoundingClientRect();const hit=document.elementFromPoint(Math.max(0,r.left+Math.min(10,r.width/2)),Math.max(0,r.top+r.height/2));return{active:document.activeElement?.id,rect:r.toJSON(),clip:clip.toJSON(),inViewport:r.top>=Math.max(0,clip.top)&&r.bottom<=Math.min(innerHeight,clip.bottom),hit:hit?.tagName,interactable:!!hit&&(h===hit||h.contains(hit))};});
    check(data.active==='smart-setup-step-title',`Heading receives focus on ${action} step ${step}`,data);
    check(data.inViewport&&data.interactable,`Focused heading visible on ${action} step ${step}`,data);
   };
   const inspectChoice=async(locator,label)=>{
    await locator.evaluate(n=>n.scrollIntoView({block:'center',inline:'nearest'}));
    await frame(page);
    const metrics=await locator.evaluate(n=>{const r=n.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);const footer=document.querySelector('.smart-setup-footer').getBoundingClientRect();return{label:n.innerText,rect:r.toJSON(),hit:hit?.className,centerReachable:!!hit&&(n===hit||n.contains(hit)),footerOverlap:r.top<footer.bottom&&r.bottom>footer.top};});
    check(metrics.centerReachable,`Choice reachable: ${label}`,metrics);
    check(!metrics.footerOverlap,`Choice not covered by footer: ${label}`,metrics);
    return metrics;
   };
   try{
    await page.goto(`${origin}/settings?betaLocalMode=true&themeInspect=${theme}`,{waitUntil:'domcontentloaded'});
    await open();
    await inspectFocus(1,'open');
    await page.screenshot({path:path.join(out,`${run.name}-step1.png`)});
    const dialog=page.locator('.smart-setup-modal');
    for(const nextTheme of [theme==='light'?'dark':'light',theme]){
      const choice=dialog.getByRole('button',{name:new RegExp(`^${nextTheme[0].toUpperCase()+nextTheme.slice(1)}`)});
      await choice.click();await frame(page);
      check(await page.locator('.app').getAttribute('data-theme')===nextTheme,`Theme switches to ${nextTheme}`);
      check(await choice.getAttribute('aria-pressed')==='true',`Theme choice reflects ${nextTheme}`);
    }
    const enabled=dialog.locator('button:not([disabled]),input:not([disabled])');
    await enabled.last().focus();await page.keyboard.press('Tab');
    check(await enabled.first().evaluate(n=>n===document.activeElement),'Forward Tab wraps inside dialog');
    await enabled.first().focus();await page.keyboard.press('Shift+Tab');
    check(await enabled.last().evaluate(n=>n===document.activeElement),'Reverse Tab wraps inside dialog');
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
    check(await page.getByRole('button',{name:'Update setup',exact:true}).evaluate(n=>n===document.activeElement),'Escape restores opener focus');
    await open();
    for(let step=1;step<=6;step++){
      const heading=await page.locator('#smart-setup-step-title').innerText();
      await inspectFocus(step,'next');
      const geometry=await dialog.evaluate(n=>{const r=n.getBoundingClientRect();const body=n.querySelector('.smart-setup-body');return{rect:r.toJSON(),scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,bodyHeight:body.clientHeight,bodyScrollHeight:body.scrollHeight,modalScrollTop:n.scrollTop,bodyScrollTop:body.scrollTop};});
      check(geometry.scrollWidth<=geometry.clientWidth+1,`No horizontal overflow step ${step}`,geometry);
      const options=dialog.locator('.smart-setup-chip:not([disabled]),.smart-setup-choice:not([disabled])');
      const choices=[];
      for(let i=0;i<await options.count();i++){
        const option=options.nth(i);const label=await option.innerText();choices.push(await inspectChoice(option,label));
        await option.click();check(await option.getAttribute('aria-pressed')==='true',`Option selected: ${label}`);
        if(step<=2)await option.click();
      }
      if(await options.count())await options.first().click();
      if(step===1){
       await inspectChoice(dialog.getByRole('button',{name:/^Dark/}),'Dark theme choice');
       await page.screenshot({path:path.join(out,`${run.name}-step1-bottom.png`)});
      }
      if(step===2){
        await dialog.getByRole('button',{name:'Back',exact:true}).click();await frame(page);await inspectFocus(1,'Back');
        check(await dialog.locator('.smart-setup-chip').first().getAttribute('aria-pressed')==='true','Purpose selection preserved after Back');
        await dialog.getByRole('button',{name:'Continue',exact:true}).click();await frame(page);await inspectFocus(2,'return');
      }
      if(step===5){await dialog.getByPlaceholder('ZIP, city, or region').fill('Test Region');await dialog.getByPlaceholder('Target, Walmart, Barnes & Noble...').fill('Test Shop');}
      if(step===6){
        const labels=await dialog.locator('.smart-setup-footer button').evaluateAll(buttons=>buttons.map(button=>({label:button.innerText,scrollWidth:button.scrollWidth,clientWidth:button.clientWidth})));
        check(labels.every(label=>label.scrollWidth<=label.clientWidth+1),'Footer action labels fit their buttons',{labels});
        await page.screenshot({path:path.join(out,`${run.name}-step6.png`)});await dialog.getByRole('button',{name:'Use setup',exact:true}).click();
      }
      else await dialog.getByRole('button',{name:'Continue',exact:true}).click();
      await frame(page);
      run.steps.push({step,heading,geometry,choices});
    }
    await dialog.waitFor({state:'hidden'});
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('et-tcg-beta-readiness')).onboarding.smartSetup);
    check(!!stored.setupCompletedAt,'Completion timestamp saved');
    check(stored.homeArea==='Test Region','Home area saved');
    check(stored.purposes.includes('collect_pokemon_with_my_family_kids'),'Purpose saved');
    check(stored.themeChoice===theme,'Theme choice saved with setup');
    run.stored=stored;
    await page.reload({waitUntil:'domcontentloaded'});await open();
    check(await dialog.locator('.smart-setup-chip').first().getAttribute('aria-pressed')==='true','Purpose persists after reload and reopen');
    for(let i=0;i<4;i++){await dialog.getByRole('button',{name:'Continue',exact:true}).click();await frame(page);}
    check(await dialog.getByPlaceholder('ZIP, city, or region').inputValue()==='Test Region','Home area persists after reload and reopen');
    await dialog.getByRole('button',{name:'Skip for now',exact:true}).click();await dialog.waitFor({state:'hidden'});
    const afterSkip=await page.evaluate(()=>JSON.parse(localStorage.getItem('et-tcg-beta-readiness')).onboarding.smartSetup);
    check(!!afterSkip.dismissedAt,'Skip saved dismissal');check(afterSkip.setupCompletedAt===stored.setupCompletedAt,'Skip preserves completed setup');
    if(profile.name==='360x664'&&theme==='light'){
      await page.goto(`${origin}/collection?betaLocalMode=true`);
      const trigger=page.getByRole('button',{name:'Filter',exact:true});await trigger.click();
      const sharedDialog=page.getByRole('dialog');await sharedDialog.waitFor();await frame(page);
      check(await sharedDialog.getByRole('button',{name:'Close',exact:true}).evaluate(node=>node===document.activeElement),'Existing dialog retains initial focus');
      await page.keyboard.press('Escape');await sharedDialog.waitFor({state:'hidden'});
      check(await trigger.evaluate(node=>node===document.activeElement),'Existing dialog Escape restores focus');
    }
    check(run.errors.length===0,'No JavaScript errors',{errors:run.errors});
   }catch(error){run.failures.push({message:error.message});await page.screenshot({path:path.join(out,`${run.name}-failure.png`)}).catch(()=>{});}
   await context.close();results.push(run);
   fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
   console.log(JSON.stringify({name:run.name,steps:run.steps.length,failures:run.failures,errors:run.errors,requestBlocks:run.requestBlocks}));
  }
  if(results.some(run=>run.failures.length))process.exitCode=1;
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
