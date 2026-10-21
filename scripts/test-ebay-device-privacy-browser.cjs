const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { chromium } = require("@playwright/test");
// New isolated, synthetic browser context; all requests are local fixtures.
const origin="http://127.0.0.1:5298";
(async()=>{
  const modules=new Map(["persistence/workspacePayloadStore.js","ebayPrivacy/privacyArchives.js","ebayPrivacy/privacyPolicy.js","ebayPrivacy/identityHash.js","ebayPrivacy/devicePrivacy.js","backup/canonicalJson.js"].map((name)=>[`/src/features/${name}`,readFileSync(`src/features/${name}`,"utf8")]));
  const browser=await chromium.launch({headless:true});
  try {
    const context=await browser.newContext();
    await context.route("**/*",route=>{
      const url=new URL(route.request().url()); if(url.origin!==origin)return route.abort();
      if(modules.has(url.pathname))return route.fulfill({contentType:"text/javascript",body:modules.get(url.pathname)});
      return route.fulfill({contentType:"text/html",body:'<!doctype html><title>Synthetic eBay privacy tests</title><script type="module">window.privacy={...(await import("/src/features/persistence/workspacePayloadStore.js")),...(await import("/src/features/ebayPrivacy/privacyPolicy.js")),...(await import("/src/features/ebayPrivacy/identityHash.js")),...(await import("/src/features/ebayPrivacy/devicePrivacy.js")),...(await import("/src/features/backup/canonicalJson.js"))};</script>'});
    });
    const page=await context.newPage(); await page.goto(origin); await page.waitForFunction(()=>window.privacy);
    const result=await page.evaluate(async()=>{
      const p=window.privacy; const store=p.createWorkspacePayloadStore();
      const seller="Synthetic Deleted Seller";
      const policy={version:1,after:1,tombstones:[{kind:"username",hash:p.ebayIdentityHash("username",seller)}]};
      const source={deals:[{id:"owner-1",providerId:"ebay",sellerName:seller,externalListingId:"v1|888|0",listingUrl:"https://www.ebay.com/itm/888",purchasePrice:42.13,marketValue:91.27}]};
      const body={format:"code3-workspace-conflict-copy",version:1,ownerId:"owner",copyId:"copy",createdAt:"2026-10-20T12:00:00Z",cloudRevision:1,sources:{"deal-finder":{schemaVersion:8,data:source}}};
      const hash=await p.hashCanonicalJson(body); const raw=p.canonicalStringify({...body,hash}); const key=`conflict-copy:owner:copy:${hash}`;
      const referenceKey="code3.workspace-conflict-copy.v1:owner:copy";
      localStorage.setItem(referenceKey,JSON.stringify({format:"code3-workspace-conflict-reference",version:1,ownerId:"owner",copyId:"copy",payloadKey:key,hash}));
      localStorage.setItem("ember-and-tide.flip-scout.v1",JSON.stringify(source));
      localStorage.setItem("sb-test-auth-token","untouched synthetic token");
      await store.put(key,raw); await store.put("unrelated-payload","keep exact bytes");
      const first=await p.redactEbayDeviceCopies({storage:localStorage,sessionStorage,policy,payloadStore:store});
      const ref=JSON.parse(localStorage.getItem(referenceKey)); const saved=JSON.parse(await store.get(ref.payloadKey)); const {hash:savedHash,...savedBody}=saved;
      if(ref.payloadKey===key || savedHash!==ref.hash || savedHash!==await p.hashCanonicalJson(savedBody))throw new Error("New payload/reference integrity mismatch");
      if(await store.get(key)!==null)throw new Error("Old personal payload remains");
      if(saved.sources["deal-finder"].data.deals[0].sellerName!==undefined)throw new Error("Seller remains in IDB");
      if(saved.sources["deal-finder"].data.deals[0].purchasePrice!==42.13 || saved.sources["deal-finder"].data.deals[0].marketValue!==91.27)throw new Error("Owner prices changed");
      if(await store.get("unrelated-payload")!=="keep exact bytes" || localStorage.getItem("sb-test-auth-token")!=="untouched synthetic token")throw new Error("Unrelated data changed");
      // Simulate interruption after durable IDB migration, before the local reference update.
      localStorage.setItem(referenceKey,JSON.stringify({format:"code3-workspace-conflict-reference",version:1,ownerId:"owner",copyId:"copy",payloadKey:key,hash}));
      await p.redactEbayDeviceCopies({storage:localStorage,sessionStorage,policy:p.readEbayPrivacyPolicy(),payloadStore:store});
      if(JSON.parse(localStorage.getItem(referenceKey)).payloadKey!==ref.payloadKey)throw new Error("Interrupted reference migration did not recover");
      const before=localStorage.getItem(referenceKey);
      await p.redactEbayDeviceCopies({storage:localStorage,sessionStorage,policy:p.readEbayPrivacyPolicy(),payloadStore:store});
      if(localStorage.getItem(referenceKey)!==before)throw new Error("Privacy update is not idempotent");
      window.expectedPrivacyRef=ref;
      return {changedKeys:first.changedKeys.length,payloads:first.payloads,checks:10};
    });
    assert.equal(result.payloads,1); assert.equal(result.changedKeys,2);
    await page.reload(); await page.waitForFunction(()=>window.privacy);
    assert.equal(await page.evaluate(async()=>{const p=window.privacy;const ref=JSON.parse(localStorage.getItem("code3.workspace-conflict-copy.v1:owner:copy"));return typeof await p.createWorkspacePayloadStore().get(ref.payloadKey)==="string" && p.readEbayPrivacyPolicy().tombstones.length===2;}),true);
    process.stdout.write(`PASS ${result.checks+1} native IndexedDB redaction, integrity, interruption, preservation, idempotency and reload checks.\n`);
    await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
