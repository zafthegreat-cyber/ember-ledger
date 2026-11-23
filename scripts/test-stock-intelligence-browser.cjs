const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,expect}=require('@playwright/test');
const root=path.resolve(__dirname,'..');
const base=new URL(process.env.APP_URL||'http://127.0.0.1:5217');
assert(['127.0.0.1','localhost','[::1]'].includes(base.hostname),'Synthetic loopback only');
const harness=path.join(root,'.stock-intelligence-browser-test.html');
const output=path.resolve(process.env.QA_OUTPUT_DIR||'artifacts/qa/stock-intelligence');
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(harness,`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';
import Panel from '/src/components/StockIntelligencePanel.jsx';
import '/src/styles/app/18-collector-binder.css';import '/src/styles/app/19-holo-tech.css';import '/src/styles/app/20-panel-fixes.css';
createRoot(document.getElementById('root')).render(React.createElement(Panel));</script>`);
const actor='00000000-0000-4000-8000-000000000009';
const mockAuth=`export const supabase={auth:{
getUser:async()=>({data:{user:window.__stockStaff?{id:'${actor}'}:null}}),
getSession:async()=>({data:{session:window.__stockStaff?{access_token:'synthetic-token'.repeat(8),user:{id:'${actor}'}}:null}}),
onAuthStateChange:(cb)=>{const listener=()=>cb('SIGNED_OUT');window.addEventListener('stock-auth',listener);return {data:{subscription:{unsubscribe:()=>window.removeEventListener('stock-auth',listener)}}};}
},rpc:async()=>({data:window.__stockStaff===true})};`;
(async()=>{
  const browser=await chromium.launch({headless:true});
  const results=[];
  try {
    for(const width of [390,1440]) {
      const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
      const page=await context.newPage();const errors=[],writes=[];let privateReads=0,failFeed=false;
      page.on('pageerror',error=>errors.push(error.message));
      await page.clock.install();
      const now=Date.now();
      const feed={version:1,generatedAt:new Date(now).toISOString(),
        sources:['Target','Walmart','Pokémon Center','Best Buy',"Sam's Club",'Costco'].map(retailer=>({retailer,mode:retailer==='Target'?'official-api':'manual-watch',connected:retailer==='Target',lastSuccessAt:retailer==='Target'?new Date(now-20*60_000).toISOString():null})),
        discoveryWatches:[{retailer:'Costco',query:'Trading Card Game'}],
        targets:[{retailer:'Target',sku:'12345',name:'Synthetic TCG collection',url:'https://www.target.com/p/synthetic/A-12345'}],
        signals:[{id:'00000000-0000-4000-8000-000000000001',retailer:'Target',sku:'12345',signalType:'reported_stock',evidenceLevel:'reported',sourceType:'admin_review',headline:'Synthetic reported inventory',sourceUrl:'https://www.target.com/p/synthetic/A-12345',productUrl:null,product:null,observedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+10000).toISOString()}]};
      await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());
        if(url.origin===base.origin&&url.pathname==='/src/supabaseClient.js')return route.fulfill({contentType:'application/javascript',body:mockAuth});
        if(url.origin===base.origin&&url.pathname==='/src/services/stockIntelligence.mjs') {
          const response=await route.fetch();
          return route.fulfill({response,body:(await response.text()).replaceAll('import.meta.env?.VITE_SUPABASE_ANON_KEY','"synthetic-public-key"')});
        }
        if(url.pathname.endsWith('/code3-stock-intel-feed'))return route.fulfill({status:failFeed?503:200,contentType:'application/json',body:JSON.stringify(failFeed?{error:'Synthetic outage'}:feed)});
        if(url.pathname.endsWith('/code3-stock-inbound')) {
          privateReads++;assert.equal(req.method(),'GET');
          return route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,events:[{id:'00000000-0000-4000-8000-000000000002',retailer:'Target',stage:'in_warehouse',headline:'Synthetic private warehouse report',evidenceLevel:'reported',sourceType:'staff_report',observedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+3600_000).toISOString(),sku:'12345',product:'Synthetic collection'}]})});
        }
        if(!['GET','HEAD'].includes(req.method())){writes.push(req.url());return route.abort();}
        if(url.origin!==base.origin)return route.abort();
        return route.continue();
      });
      await page.goto(new URL('/.stock-intelligence-browser-test.html',base).href);
      const panel=page.getByRole('region',{name:'Online stock intelligence'});
      await expect(panel.getByText('Synthetic TCG collection',{exact:true})).toBeVisible();
      await expect(panel.getByText('Available to purchase',{exact:true})).toHaveCount(0);
      await panel.getByRole('button',{name:'Sources',exact:true}).click();
      await expect(panel.getByText('Source check overdue',{exact:true})).toBeVisible();
      await panel.getByRole('button',{name:'Signals 1',exact:true}).click();
      await expect(panel.getByText('Reported · not verified',{exact:false})).toBeVisible();
      await page.clock.fastForward(16000);
      await expect(panel.getByText('Synthetic reported inventory',{exact:true})).toHaveCount(0);
      await panel.getByRole('button',{name:'Inbound / Warehouse',exact:true}).click();
      await expect(panel.getByText('No verified retailer warehouse feeds are connected.',{exact:true})).toBeVisible();
      await expect(panel.locator('.warehouse-inbound__staff')).toHaveCount(0);assert.equal(privateReads,0);
      await page.evaluate(()=>{window.__stockStaff=true;window.dispatchEvent(new Event('stock-auth'));});
      await expect(panel.locator('.warehouse-inbound__staff')).toBeVisible();
      await panel.locator('.warehouse-inbound__staff > summary').click();
      await expect(panel.getByText('Synthetic private warehouse report',{exact:true})).toBeVisible();
      await page.screenshot({path:path.join(output,`${width}-private-inbound.png`),fullPage:true});
      await page.evaluate(()=>{window.__stockStaff=false;window.dispatchEvent(new Event('stock-auth'));});
      await expect(panel.locator('.warehouse-inbound__staff')).toHaveCount(0);
      await expect(panel.getByText('Synthetic private warehouse report',{exact:true})).toHaveCount(0);
      failFeed=true;
      await panel.getByRole('button',{name:'Refresh feed',exact:true}).click();
      await expect(panel.getByText("Stock data isn't available right now.",{exact:true})).toBeVisible();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
      results.push({width,passed:true,privateReads,externalWrites:writes.length});
      await context.close();
    }
    console.log(JSON.stringify(results));
  }finally{await browser.close();fs.rmSync(harness,{force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
