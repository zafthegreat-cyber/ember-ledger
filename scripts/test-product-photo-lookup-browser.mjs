import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium,expect} from '@playwright/test';
const base=process.env.APP_URL||'http://127.0.0.1:5313/';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const output='artifacts/product-photo-lookup-20261114';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const result={requests:[],external:[],writes:[],errors:[],views:[]};
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(!['GET','HEAD'].includes(r.method())){result.writes.push(r.method()+' '+u.pathname);return route.abort();}if(u.origin!==new URL(base).origin){result.external.push(u.origin);return route.abort();}if(u.pathname.startsWith('/ocr/'))result.requests.push(u.pathname);return route.continue();});
 const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));
 await page.goto(new URL('scripts/fixtures/product-photo-lookup/preview.html',base).href);
 await expect(page.getByRole('heading',{name:'Find from a photo'})).toBeVisible();
 await page.evaluate(()=>localStorage.setItem('photo-preserve-fixture',JSON.stringify({quantity:3,marketPrice:98.76,priceCheckedAt:'2026-11-14T21:00:00Z',cost:4.56})));
 assert.equal(result.requests.length,0,'OCR assets lazy until an image is selected');
 await page.getByRole('button',{name:'Try a real packaging photo'}).click();
 await expect(page.getByRole('button',{name:'Stop reading'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Stop reading'})).toHaveCount(0,{timeout:95000});
 const realText=await page.locator('.product-photo-lookup pre').textContent();
 assert.ok(realText.trim().length>30,'real original packaging image produced OCR text');
 result.realPackagingText=realText;
 result.initialRealPhotoQuery=await page.getByLabel('Search text',{exact:true}).inputValue();
 assert.equal(result.initialRealPhotoQuery,'0196214111387','actual photographed barcode digits are recognized and checksum-validated');
 await expect(page.getByTestId('reviewed-query')).toHaveCount(0);
 await page.getByRole('button',{name:'Review catalog matches'}).click();
 await expect(page.getByTestId('reviewed-query')).toHaveText('0196214111387');
 await expect(page.getByRole('region',{name:'Preview catalog results'}).getByText('Destined Rivals Booster Bundle',{exact:true})).toBeVisible();
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:width===390?844:1000});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page overflow');
  await page.screenshot({path:path.join(output,'photo-lookup-'+width+'.png'),fullPage:true});
  result.views.push({width,overflow:false});
 }
 // A synthetic printed card label uses the real local OCR worker, not a mocked reader.
 const encoded=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1000;c.height=550;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1000,550);x.fillStyle='black';x.font='bold 54px Arial';x.fillText('Pikachu HP 60',50,100);x.font='44px Arial';x.fillText('Base Set',50,200);x.fillText('58/102',50,300);x.fillText('Text-reading test fixture',50,430);return c.toDataURL('image/png').split(',')[1];});
 await page.getByLabel('Choose a product image').setInputFiles({name:'synthetic-printed-card.png',mimeType:'image/png',buffer:Buffer.from(encoded,'base64')});
 await expect(page.getByRole('button',{name:'Stop reading'})).toHaveCount(0,{timeout:95000});
 await expect(page.getByLabel('Search text',{exact:true})).toHaveValue(/Pikachu.*58\/102/i);
 result.cardQuery=await page.getByLabel('Search text',{exact:true}).inputValue();
 await expect(page.getByTestId('reviewed-query')).toHaveCount(0,'new image clears the old review and does not automatically run a new catalog search');
 await page.getByLabel('Search text',{exact:true}).fill('Pikachu 58/102');
 await page.getByRole('button',{name:'Review catalog matches'}).click();await expect(page.getByTestId('reviewed-query')).toHaveText('Pikachu 58/102');
 // Unsupported files leave manual lookup available.
 await page.getByLabel('Choose a product image').setInputFiles({name:'unsupported.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
 await expect(page.getByRole('alert')).toContainText('Choose a JPG');
 await page.getByLabel('Search text',{exact:true}).fill('Journey Together');
 await expect(page.getByRole('button',{name:'Review catalog matches'})).toBeEnabled();
 const preserved=await page.evaluate(()=>JSON.parse(localStorage.getItem('photo-preserve-fixture')));
 assert.deepEqual(preserved,{quantity:3,marketPrice:98.76,priceCheckedAt:'2026-11-14T21:00:00Z',cost:4.56});
 assert.ok(result.requests.some(value=>value.includes('scout-screenshot-v1.worker.js')),'real worker was used');
 assert.ok(result.requests.some(value=>value.includes('traineddata')),'local bundled model was used');
 assert.deepEqual(result.external,[]);assert.deepEqual(result.writes,[]);assert.deepEqual(result.errors,[]);
 result.pass=true;await context.close();
}finally{await browser.close();fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(result,null,2));}
console.log(JSON.stringify({pass:result.pass,views:result.views,localOcrAssets:new Set(result.requests).size,externalRequests:result.external.length,writes:result.writes.length,cardQuery:result.cardQuery,initialRealPhotoQuery:result.initialRealPhotoQuery},null,2));
