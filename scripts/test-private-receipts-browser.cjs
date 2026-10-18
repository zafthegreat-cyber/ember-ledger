const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5252").origin;
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
const output = path.resolve("artifacts/qa/mobile-beta/private-receipts");
fs.mkdirSync(output, { recursive: true });
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import'/src/index.css';import'/src/App.css';import'/src/styles/theme.css';import{PrivateReceiptImage,PrivateReceiptLink,PrivateStorageImage}from'/src/components/PrivateReceipt.jsx';
const ref='https://synthetic-project.supabase.co/storage/v1/object/public/receipts/legacy%20receipt.png';localStorage.setItem('synthetic-record',JSON.stringify({receiptImage:ref,marketPrice:99}));
createRoot(document.getElementById('root')).render(React.createElement('main',{className:'app code3-public-privacy','data-theme':new URLSearchParams(location.search).get('theme'),style:{padding:'24px',minHeight:'100dvh',background:'var(--app-background)'}},React.createElement('section',{className:'card',style:{maxWidth:'500px',padding:'20px'}},React.createElement('h2',{},'Your saved receipt'),React.createElement('p',{},'Existing receipt reference, private account access.'),React.createElement(PrivateReceiptImage,{src:ref,alt:'Synthetic receipt',style:{width:'180px',height:'100px',background:'#d5e8e2'}}),React.createElement('div',{style:{marginTop:'16px'}},React.createElement(PrivateReceiptLink,{href:ref},'View receipt')),React.createElement('h3',{},'Product and report photos'),React.createElement('button',{type:'button','aria-label':'Open product'},React.createElement(PrivateStorageImage,{src:ref,alt:'Legacy product artwork',style:{width:'100px',height:'80px',background:'#d5e8e2'}})),React.createElement(PrivateStorageImage,{src:'https://synthetic-project.supabase.co/storage/v1/object/sign/receipt-images/users/other/scout-photo.png?token=existing-report-token',alt:'Shared report artwork',style:{width:'100px',height:'80px',background:'#d5e8e2'}}))));
</script></body></html>`;
fs.writeFileSync(path.join(output, "fixture.html"), fixture);
const stub = `
const owner='11111111-1111-4111-8111-111111111111';const other='22222222-2222-4222-8222-222222222222';
const listeners=new Set();const state=window.__receiptState={session:{user:{id:owner},access_token:'synthetic-token'},signed:0,headers:[]};
window.__receiptSignOut=()=>{state.session=null;listeners.forEach(fn=>fn('SIGNED_OUT',null))};
window.__receiptOther=()=>{state.session={user:{id:other},access_token:'other-token'};listeners.forEach(fn=>fn('SIGNED_IN',state.session))};
window.__receiptOwner=()=>{state.session={user:{id:owner},access_token:'synthetic-token'};listeners.forEach(fn=>fn('SIGNED_IN',state.session))};
export const supabase={supabaseUrl:'https://synthetic-project.supabase.co',auth:{getSession:async()=>({data:{session:state.session}}),getUser:async()=>({data:{user:state.session?.user}}),onAuthStateChange(fn){listeners.add(fn);return{data:{subscription:{unsubscribe(){listeners.delete(fn)}}}}}},rpc(){return{setHeader(k,v){state.headers.push([k,v]);return this},abortSignal(){return this},then(resolve){return Promise.resolve({data:!!state.session}).then(resolve)}}},storage:{from(bucket){return{setHeader(k,v){state.headers.push([k,v]);return this},async createSignedUrl(path,seconds){if(state.session?.user.id!==owner)return{error:{message:'denied'}};state.signed++;return{data:{signedUrl:'https://synthetic-project.supabase.co/storage/v1/object/sign/'+bucket+'/'+encodeURIComponent(path)+'?token=synthetic-'+state.signed}}}}}}};export const isSupabaseConfigured=true;
`;
(async()=>{
  const browser=await chromium.launch({headless:true});const results=[];
  try {
    for(const width of [320,390,1440])for(const theme of ['light','dark']){
      const context=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block',colorScheme:theme});
      const imageRequests=[];const errors=[];
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin===base && url.pathname==='/src/supabaseClient.js')return route.fulfill({contentType:'application/javascript',body:stub});
        if(url.origin==='https://synthetic-project.supabase.co'){
          imageRequests.push({url:url.href,headers:route.request().headers()});
          return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR5kAAAAASUVORK5CYII=','base64')});
        }
        if(url.origin!==base)return route.abort();return route.continue();
      });
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      await page.clock.install();
      await page.goto(`${base}/artifacts/qa/mobile-beta/private-receipts/fixture.html?theme=${theme}`);
      await expect(page.getByRole('img',{name:'Synthetic receipt'})).toBeVisible();
      await expect(page.getByRole('img',{name:'Legacy product artwork'})).toBeVisible();
      await expect(page.getByRole('img',{name:'Shared report artwork'})).toBeVisible();
      await expect(page.getByRole('link',{name:'View receipt'})).toHaveAttribute('href',/\/sign\/receipts\/legacy%20receipt\.png\?token=synthetic-/);
      const original=await page.evaluate(()=>localStorage.getItem('synthetic-record'));
      const firstCount=await page.evaluate(()=>window.__receiptState.signed);
      await page.clock.fastForward(46_000);
      await expect.poll(()=>page.evaluate(()=>window.__receiptState.signed)).toBeGreaterThan(firstCount);
      await expect(page.getByRole('link',{name:'View receipt'})).toBeVisible();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const lowContrast=await page.locator('h2,h3,p,a').evaluateAll(nodes=>{
        const rgb=value=>(value.match(/[0-9.]+/g)||[]).map(Number);
        const light=values=>values.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
        return nodes.filter(node=>node.getClientRects().length).filter(node=>{
          let parent=node,bg;while(parent){const color=rgb(getComputedStyle(parent).backgroundColor);if(color.length===3||color[3]===1){bg=color;break}parent=parent.parentElement}
          if(!bg)return true;const fg=light(rgb(getComputedStyle(node).color)),back=light(bg);return(Math.max(fg,back)+.05)/(Math.min(fg,back)+.05)<4.5;
        }).map(node=>node.textContent);
      });
      assert.deepEqual(lowContrast,[]);
      await page.screenshot({path:path.join(output,`${width}-${theme}-owner.png`),fullPage:true});
      await page.evaluate(()=>window.__receiptSignOut());
      await expect(page.getByRole('link',{name:'View receipt'})).toHaveCount(0);
      await expect(page.getByRole('img',{name:'Synthetic receipt'})).toHaveCount(0);
      await expect(page.getByRole('img',{name:'Legacy product artwork'})).toHaveCount(0);
      await expect(page.getByRole('img',{name:'Shared report artwork'})).toBeVisible();
      assert.equal(await page.locator('button button,button a,a button').count(),0,'Image failures never introduce nested interactive controls');
      await expect(page.getByRole('button',{name:'Retry receipt'}).first()).toBeVisible();
      await page.evaluate(()=>window.__receiptOther());
      await expect(page.getByRole('button',{name:'Retry receipt'}).first()).toBeVisible();
      assert.equal(await page.getByRole('link',{name:'View receipt'}).count(),0);
      await expect(page.getByRole('img',{name:'Shared report artwork'})).toHaveAttribute('src',/existing-report-token$/);
      await page.evaluate(()=>window.__receiptOwner());
      await expect(page.getByRole('link',{name:'View receipt'})).toBeVisible();
      assert.equal(await page.evaluate(()=>localStorage.getItem('synthetic-record')),original);
      assert.equal(await page.evaluate(()=>localStorage.length),1);
      assert.equal(await page.evaluate(()=>sessionStorage.length),0);
      assert.ok(imageRequests.length>0);
      assert.ok(imageRequests.every(request=>(request.url.includes('/object/sign/receipts/')||request.url.includes('existing-report-token'))&&!request.headers.authorization));
      assert.deepEqual(errors,[]);
      results.push({width,theme,shortLivedRefresh:true,signOutClearsLink:true,otherAccountDenied:true,legacyOwnerArtwork:true,otherBucketSharedArtworkUnchanged:true,originalRecordsUnchanged:true,publicImageRequests:0});
      await context.close();
    }
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({generatedAt:new Date().toISOString(),syntheticOnly:true,results},null,2));
    console.log('PASS private receipt browser access: six viewport/theme cases, refresh, sign-out, account switch, original-record preservation; synthetic only.');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
