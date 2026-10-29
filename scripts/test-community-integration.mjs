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
  await expect(page.getByRole('heading',{name:'A good find is worth sharing.'})).toBeVisible({timeout:30000});
  await expect(page.locator('.community-scout').getByText('No recent reviewed reports yet.',{exact:true})).toBeVisible({timeout:15000});
  const colors=await page.locator('.community-scout').evaluate(element=>({heading:getComputedStyle(element.querySelector('h2')).color,copy:getComputedStyle(element.querySelector('p')).color,input:getComputedStyle(element.querySelector('input')).backgroundColor,placeholder:getComputedStyle(element.querySelector('input'),'::placeholder').color}));
  assert.deepEqual(colors,{heading:'rgb(251, 244, 230)',copy:'rgb(229, 204, 217)',input:'rgb(40, 14, 25)',placeholder:'rgb(208, 175, 190)'},'App theme must preserve readable community contrast');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+2),'Reports horizontal overflow');
  await page.screenshot({path:`artifacts/qa/community/integrated-reports-${width}.png`,fullPage:false});
  const snapshot=await page.evaluate(()=>localStorage.getItem('et-tcg-beta-scout'));
  await page.locator('.community-scout').getByRole('button',{name:'Release calendar',exact:true}).click();
  await expect(page.locator('.community-scout').getByRole('heading',{name:'Dates from the publishers'})).toBeVisible();
  await page.locator('.community-scout').getByRole('button',{name:'Scout map',exact:true}).click();
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
  results.push({width,liveGateway:true,reports:true,calendar:true,map:true,privateRecordsPreserved:true,pageErrors:0});
  await context.close();
 }
} finally {await browser.close();}
writeFileSync('artifacts/qa/community/integration.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));
console.log(JSON.stringify(results));
