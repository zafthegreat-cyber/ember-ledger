import test from "node:test";
import assert from "node:assert/strict";
import {stockProjectOrigin} from "../supabase/functions/_shared/stockProject.mjs";
import {loadStockIntelligence,submitStockReview} from "../src/services/stockIntelligence.mjs";
import {loadPrivateInbound,submitPrivateInbound} from "../src/services/warehouseInbound.mjs";
import {fetchStockIntel} from "../supabase/functions/code3-stock-intel-feed/core.mjs";
import {createDependencies} from "../supabase/functions/code3-stock-intel-review/core.mjs";
import {createInboundDependencies} from "../supabase/functions/code3-stock-inbound/core.mjs";
import {createStockSourceDependencies} from "../supabase/functions/code3-stock-source-intake/core.mjs";
import {stockStaffAuthorizer} from "../supabase/functions/_shared/stockStaff.mjs";

const project="https://abcdefghijklmnopqrst.supabase.co";
const id="11111111-1111-4111-8111-111111111111";
test("Stock configuration rejects missing, noncanonical and credential-bearing origins",()=>{
  for(const value of [undefined,"",project+"/",project+"?target=prod",project+"/rest/v1","http://abcdefghijklmnopqrst.supabase.co","https://abcdefghijklmnopqrst.supabase.co.attacker.test","https://user:password@abcdefghijklmnopqrst.supabase.co"])
    assert.throws(()=>stockProjectOrigin(value),/configuration unavailable/);
  assert.equal(stockProjectOrigin(project),project);
});

test("Frontend feed, review and private warehouse requests stay on the configured Auth project",async()=>{
  const requests=[];
  const fetchImpl=async(url,options)=>{
    requests.push({url,options});
    assert.equal(new URL(url).origin,project);
    return Response.json(url.endsWith("/code3-stock-intel-feed")
      ? {version:1,generatedAt:new Date().toISOString(),sources:[],targets:[],signals:[],discoveryWatches:[]}
      : options.method==="GET" ? {version:1,events:[]} : {ok:true,id});
  };
  await loadStockIntelligence({project,publicGatewayKey:"synthetic-public",fetchImpl});
  await submitStockReview({project,accessToken:"synthetic-session",review:{},fetchImpl});
  await loadPrivateInbound({project,accessToken:"synthetic-session-long",fetchImpl});
  await submitPrivateInbound({project,accessToken:"synthetic-session-long",report:{},fetchImpl});
  assert.equal(requests.length,4);
  assert.ok(requests.every(x=>x.options.credentials==="omit"&&x.options.redirect==="error"));
  let calls=0;
  await assert.rejects(loadPrivateInbound({accessToken:"synthetic-session-long",fetchImpl:async()=>{calls++;}}),/configuration unavailable/);
  assert.equal(calls,0);
});

test("All Edge storage adapters keep reads and writes inside their configured staging project",async()=>{
  const requests=[];
  const fetchImpl=async(url,options)=>{
    assert.equal(new URL(url).origin,project);
    requests.push({url,options});
    return Response.json([{id}]);
  };
  await fetchStockIntel({project,key:"synthetic-service",fetchImpl});
  const review=createDependencies({project,key:"synthetic-service",anon:"synthetic-public",fetchImpl});
  await review.findProduct("Target","12345");await review.write({});
  const inbound=createInboundDependencies({project,key:"synthetic-service",anon:"synthetic-public",fetchImpl});
  await inbound.findProduct("Target","12345");await inbound.list();await inbound.save({});
  const intake=createStockSourceDependencies({project,serviceKey:"synthetic-service",fetchImpl});
  await intake.getSource("Target");await intake.getProduct("Target","12345");await intake.getTarget("Target","12345");
  await intake.saveStock({});await intake.saveInbound({});
  assert.equal(requests.length,11);
  assert.ok(requests.every(x=>x.options.redirect==="error"));
});

test("Fresh owner/admin profiles are required in addition to a current authorized session",async()=>{
  for(const [profile,expected] of [
    [{app_role:"owner",user_role:"user"},true],
    [{app_role:"admin",user_role:"user"},true],
    [{app_role:"user",user_role:"admin"},true],
    [{app_role:"moderator",user_role:"user"},false],
    [{app_role:"user",user_role:"user"},false],
    [null,false],
  ]) {
    const authorize=stockStaffAuthorizer({project,anon:"synthetic-public",fetchImpl:async(url,options)=>{
      assert.equal(new URL(url).origin,project);
      assert.equal(options.headers.Authorization,"Bearer synthetic-session");
      return Response.json(url.endsWith("/user")?{id,user_metadata:{role:"admin"}}:url.endsWith("/rpc/is_admin")?true:profile?[profile]:[]);
    }});
    assert.equal((await authorize("synthetic-session")).admin,expected);
  }
  let calls=0;
  const revoked=stockStaffAuthorizer({project,anon:"synthetic-public",fetchImpl:async url=>{
    calls++;return Response.json(url.endsWith("/user")?{id}:false);
  }});
  assert.equal((await revoked("revoked-session")).admin,false);
  assert.equal(calls,2,"Revoked sessions stop before the profile lookup");
});
