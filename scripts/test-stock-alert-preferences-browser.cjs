const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium,expect}=require("@playwright/test");

const base=new URL(process.env.APP_URL||"http://127.0.0.1:5217");
assert(["127.0.0.1","localhost","[::1]"].includes(base.hostname),"Synthetic local browser only");
const testFile=path.join(process.cwd(),".stock-alert-prefs-qa.html");
const userA="11111111-1111-4111-8111-111111111111";
const userB="22222222-2222-4222-8222-222222222222";
const mockModule=String.raw\`const alpha="11111111-1111-4111-8111-111111111111";
const beta="22222222-2222-4222-8222-222222222222";
const current=()=>window.__stockActor==="alpha"?alpha:window.__stockActor==="beta"?beta:null;
const listeners=new Set();
export const supabase={
  auth:{
    getSession:async()=>{const id=current();return {data:{session:id?{access_token:"token-for-"+id,user:{id}}:null}};},
    getUser:async(token)=>{const id=current();const valid=id&&token==="token-for-"+id;return {data:{user:valid?{id,is_anonymous:false}:null},error:valid?null:{message:"Not signed in"}};},
    onAuthStateChange:(cb)=>{
      const listener=e=>cb(e.detail);
      window.addEventListener("stock-change",listener);
      return {data:{subscription:{unsubscribe:()=>window.removeEventListener("stock-change",listener)}}};
    }
  },
  from:(table)=>{
    if(table!=="stock_alert_preferences")throw Error("Unexpected table "+table);
    return {
      select:()=>({
        eq:(_,id)=>({
          maybeSingle:async()=>{
            if(window.__slowStockUser===id)await new Promise(r=>setTimeout(r,350));
            return {data:window.__savedStock?.[id]||null,error:null};
          }
        })
      }),
      upsert:async row=>{
        window.__stockWrites.push({type:"upsert",row});
        window.__savedStock[row.user_id]=row;
        return {error:null};
      },
      delete:()=>({
        eq:async(_,id)=>{
          window.__stockWrites.push({type:"delete",id});
          delete window.__savedStock[id];
          return {error:null};
        }
      })
    };
  }
};\`;
(async()=>{
  fs.writeFileSync(testFile,
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>'+
    '<script type="module">import React from "react";import {createRoot} from "react-dom/client";'+
    'import Preferences from "/src/components/StockAlertPreferences.jsx";'+
    'createRoot(document.getElementById("root")).render(React.createElement(Preferences,{targets:'+
    '[{retailer:"Target",sku:"1012850572",name:"Synthetic Pokémon product"}]}));</script>');
  const browser=await chromium.launch({headless:true});
  const results=[];
  try{
    for(const width of [390,1440]){
      const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:"block"});
      await context.addInitScript(({a,b})=>{
        window.__stockActor="alpha";
        window.__slowStockUser="";
        window.__stockWrites=[];
        window.__savedStock={
          [a]:{enabled:true,retailers:["Target"],signal_types:["available_now"],
            product_keys:["Target|1012850572"],quiet_hours_enabled:false,
            quiet_start:"22:00",quiet_end:"08:00",time_zone:"UTC"},
          [b]:{enabled:false,retailers:[],signal_types:["available_now"],
            product_keys:[],quiet_hours_enabled:false,
            quiet_start:"22:00",quiet_end:"08:00",time_zone:"UTC"},
        };
      },{a:userA,b:userB});
      const page=await context.newPage();
      const errors=[];
      page.on("pageerror",err=>errors.push(err.message));
      await context.route("**/*",route=>{
        const url=new URL(route.request().url());
        if(url.origin===base.origin&&url.pathname==="/src/supabaseClient.js"){
          return route.fulfill({contentType:"application/javascript",body:mockModule});
        }
        if(url.origin!==base.origin)return route.abort();
        return route.continue();
      });
      await page.goto(new URL("/.stock-alert-prefs-qa.html",base).href);
      const panel=page.getByRole("region",{name:"Stock alert preferences"});
      const target=panel.getByRole("checkbox",{name:"Target",exact:true});
      const optIn=panel.getByRole("checkbox",{name:/Save my future alert opt-in/i});
      await expect(panel.getByText("Delivery is not connected yet.")).toBeVisible();
      await expect(target).toBeChecked();
      await expect(optIn).toBeChecked();
      await expect(panel.getByText("Synthetic Pokémon product")).toHaveCount(0);

      await page.evaluate(()=>{window.__stockActor="beta";window.dispatchEvent(new CustomEvent("stock-change",{detail:"SIGNED_IN"}));});
      await expect(target).not.toBeChecked();
      await expect(optIn).not.toBeChecked();
      await expect(panel.getByText("Saved to your account.")).toHaveCount(0);

      // A delayed old-account lookup must not repopulate after a newer sign-in.
      await page.evaluate(({a})=>{
        window.__stockActor="alpha";window.__slowStockUser=a;
        window.dispatchEvent(new CustomEvent("stock-change",{detail:"SIGNED_IN"}));
      },{a:userA});
      await page.evaluate(()=>{
        window.__stockActor="beta";
        window.dispatchEvent(new CustomEvent("stock-change",{detail:"SIGNED_IN"}));
      });
      await page.waitForTimeout(500);
      await expect(target).not.toBeChecked();
      await expect(optIn).not.toBeChecked();

      assert.equal(await page.evaluate(()=>window.__stockWrites.length),0);
      await target.check();
      await optIn.check();
      await panel.getByRole("button",{name:"Save preferences",exact:true}).click();
      await expect(panel.getByText(/Saved to your account/)).toBeVisible();
      const writes=await page.evaluate(()=>window.__stockWrites);
      assert.equal(writes.length,1);
      assert.equal(writes[0].row.user_id,userB);
      assert.equal(writes[0].row.enabled,true);
      assert.deepEqual(writes[0].row.retailers,["Target"]);
      await panel.getByRole("button",{name:"Clear my preferences"}).click();
      await expect(panel.getByText("Your saved watch preferences have been cleared.")).toBeVisible();
      await expect(target).not.toBeChecked();
      await expect(optIn).not.toBeChecked();

      await page.evaluate(()=>{window.__stockActor=null;window.dispatchEvent(new CustomEvent("stock-change",{detail:"SIGNED_OUT"}));});
      await expect(panel.getByText(/Sign in to Code 3 TCG/)).toBeVisible();
      await expect(panel.getByRole("button",{name:"Save preferences"})).toHaveCount(0);
      assert.deepEqual(errors,[]);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      results.push({width,checked:true,events:"account switch, delayed response, opt-in, opt-out, signout"});
      await context.close();
    }
    console.log("Stock preference browser isolation passed:",JSON.stringify(results));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fs.rmSync(testFile,{force:true}));
