import {chromium,expect} from '@playwright/test';
import {mkdirSync,copyFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const base=process.env.COMMUNITY_QA_URL||'http://127.0.0.1:5258/artifacts/qa/community/preview.html';
assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'Synthetic checks must stay local');
mkdirSync('artifacts/qa/community',{recursive:true});
copyFileSync(fileURLToPath(new URL('./fixtures/community-preview.html',import.meta.url)),'artifacts/qa/community/preview.html');
const browser=await chromium.launch({headless:true,channel:process.env.PW_CHANNEL});
const results=[];
try {
  for(const width of [320,390,1440]) {
    const page=await browser.newPage({viewport:{width,height:width<500?844:1000}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);
    await expect(page.getByRole('heading',{name:'A good find is worth sharing.'})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Aurora QA Bundle'})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Sample Deck QA'})).toBeVisible();
    await page.screenshot({path:`artifacts/qa/community/community-${width}.png`,fullPage:true});
    assert.equal(await page.locator('html').evaluate(element=>element.scrollWidth>innerWidth),false);
    await page.getByRole('combobox',{name:'Collecting',exact:true}).selectOption('pokemon');
    await expect(page.getByRole('heading',{name:'Sample Deck QA'})).toHaveCount(0);
    await page.getByRole('searchbox',{name:'Find a report',exact:true}).fill('not a match');
    await expect(page.getByText('No reports match these filters.')).toBeVisible();
    await page.getByRole('searchbox',{name:'Find a report',exact:true}).fill('');
    await page.getByRole('button',{name:'Release calendar',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Dates from the publishers'})).toBeVisible();
    await expect(page.getByRole('link',{name:/Publisher source/})).toHaveCount(2);
    await page.getByRole('button',{name:'Recent reports',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Aurora QA Bundle'})).toBeVisible();
    const links=await page.locator('.community-scout__actions a').evaluateAll(nodes=>nodes.map(node=>({href:node.href,rel:node.rel})));
    assert.ok(links.every(link=>link.href.startsWith('https://discord.com/channels/1558588508204179611/')&&link.rel.includes('noopener')));
    const small=await page.locator('.community-scout button,.community-scout__actions a,.community-scout input,.community-scout select').evaluateAll(nodes=>nodes.filter(node=>node.getClientRects().length).map(node=>({label:node.textContent||node.tagName,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})).filter(rect=>rect.width<44||rect.height<44));
    assert.deepEqual(small,[]);
    assert.deepEqual(errors,[]);
    results.push({width,layout:true,filters:true,calendar:true,links:true,touchTargets:true,consoleErrors:0});
    await page.close();
  }
  const page=await browser.newPage();
  await page.goto(base+'?fixture=empty');
  await expect(page.getByText('No recent reviewed reports yet.')).toBeVisible();
  await page.goto(base+'?fixture=error');
  await expect(page.getByRole('alert')).toContainText('Community reports could not load.');
  await expect(page.getByText('No recent reviewed reports yet.')).toHaveCount(0);
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.goto(base+'?community=calendar');
  await expect(page.getByRole('heading',{name:'Dates from the publishers'})).toBeVisible();
  await page.close();
  const report={checkedAt:new Date().toISOString(),passed:true,syntheticOnly:true,productionWrites:0,viewports:results,emptyErrorDistinct:true,refresh:true,calendarDeepLink:true};
  writeFileSync('artifacts/qa/community/results.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} finally {await browser.close();}
