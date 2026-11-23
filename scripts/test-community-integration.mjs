import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';

const base=process.env.APP_URL||'http://127.0.0.1:5259';
assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'Local app QA only');
mkdirSync('artifacts/qa/community',{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.PW_CHANNEL});
const results=[];
try {
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(new URL('/scout/reports?betaLocalMode=true',base).href);
  await expect(page.getByRole('heading',{name:'Share restocks. Help your local collecting community.'})).toBeVisible({timeout:30000});
  await expect(page.locator('.community-scout').getByText(/^(No recent reviewed reports yet|Community reports could not load)\.$/).first()).toBeVisible({timeout:15000});
  // The page follows the device theme, so check real contrast instead of fixed colors.
  const contrast=await page.locator('.community-scout').evaluate(element=>{
   const rgb=value=>(value.match(/[\d.]+/g)||[]).map(Number);
   const background=node=>{for(let current=node;current;current=current.parentElement){const [r,g,b,a=1]=rgb(getComputedStyle(current).backgroundColor);if(a>0.5)return [r,g,b];}return [255,255,255];};
   const luminance=([r,g,b])=>{const c=[r,g,b].map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;});return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];};
   const ratio=(fg,bg)=>{const [a,b]=[luminance(fg),luminance(bg)].sort((x,y)=>y-x);return (a+0.05)/(b+0.05);};
   const heading=element.querySelector('h2,h3'),copy=element.querySelector('p'),input=element.querySelector('input');
   return {heading:ratio(rgb(getComputedStyle(heading).color),background(heading)),copy:ratio(rgb(getComputedStyle(copy).color),background(copy)),placeholder:ratio(rgb(getComputedStyle(input,'::placeholder').color),background(input))};
  });
  assert.ok(Object.values(contrast).every(value=>value>=4.5),`App theme must preserve readable community contrast: ${JSON.stringify(contrast)}`);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+2),'Reports horizontal overflow');
  await page.screenshot({path:`artifacts/qa/community/integrated-reports-${width}.png`,fullPage:false});
  const snapshot=await page.evaluate(()=>localStorage.getItem('et-tcg-beta-scout'));
  await page.locator('.community-scout').getByRole('button',{name:'Release dates',exact:true}).click();
  await expect(page.locator('.community-scout').getByRole('heading',{name:'Dates from the publishers'})).toBeVisible();
  await page.locator('.community-scout').getByRole('button',{name:'Restocks map',exact:true}).click();
  await expect(page.locator('.scout-command-board-v5')).toBeVisible();
  await expect(page.locator('.community-scout')).toHaveCount(0);
  const map=page.locator('.scout-tile-map-canvas').first();
  await expect(map).toBeVisible();
  await map.focus();
  await page.keyboard.press('ArrowLeft');
  assert.ok(Number(await map.getAttribute('data-pan-x'))>0);
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(()=>localStorage.getItem('et-tcg-beta-scout')),snapshot,'Reading community reports must preserve private app records');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+2),'Horizontal overflow');
  await page.screenshot({path:`artifacts/qa/community/integrated-map-${width}.png`,fullPage:false});
  assert.deepEqual(errors,[]);
  results.push({width,feedStateShown:true,reports:true,calendar:true,map:true,privateRecordsPreserved:true,pageErrors:0});
  await context.close();
 }
} finally {await browser.close();}
writeFileSync('artifacts/qa/community/integration.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));
console.log(JSON.stringify(results));
