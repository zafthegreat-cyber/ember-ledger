import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
const hooks=registerHooks({load(url,context,next){
  if(url.endsWith(".css"))return {format:"module",shortCircuit:true,source:"export default {};"};
  if(url.endsWith(".jsx"))return {format:"module",shortCircuit:true,source:transformSync(readFileSync(new URL(url),"utf8"),{loader:"jsx",format:"esm",jsx:"automatic"}).code};
  return next(url,context);
}});
const {default:Guide}=await import("../src/features/auth/MemberStartGuide.jsx");
const {default:EmailHelp,SignupFieldPrivacy}=await import("../src/features/auth/EmailConfirmationHelp.jsx");
const {default:Community}=await import("../src/features/auth/CommunityWelcome.jsx");
const {default:Coverage}=await import("../src/features/auth/SourceCoverage.jsx");
const {PublicSupportPage}=await import("../src/features/privacy/PrivacyCenter.jsx");
const first="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", other="bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
let dom,root;
function environment(path="/"){
  dom=new JSDOM('<!doctype html><div id="root"></div>',{url:"https://code3tcg.app"+path});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});
  root=createRoot(document.getElementById("root"));
}
afterEach(async()=>{if(root)await act(()=>root.unmount());root=null;dom?.window.close();});
const button=text=>[...document.querySelectorAll("button")].find(item=>item.textContent===text);
const click=item=>item.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true}));
test("first task opens the existing collector action, seller has a distinct action, and shops use support",async()=>{
  environment();let collect=0,sell=0;
  await act(()=>root.render(React.createElement(Guide,{userId:first,onCollect:()=>collect++,onSell:()=>sell++})));
  await act(()=>click(button("Add my first collection item")));assert.equal(collect,1);assert.equal(sell,0);
  const select=document.querySelector("select");select.value="seller";await act(()=>select.dispatchEvent(new dom.window.Event("change",{bubbles:true})));
  await act(()=>click(button("Open seller inventory")));assert.equal(sell,1);
  select.value="shop";await act(()=>select.dispatchEvent(new dom.window.Event("change",{bubbles:true})));
  assert.equal(document.querySelector("a.member-start-action").getAttribute("href"),"/support?topic=shop");assert.match(document.body.textContent,/does not verify a shop/);
});
test("skip and reopen are reversible and an account switch never inherits another introduction",async()=>{
  environment();const render=id=>root.render(React.createElement(Guide,{userId:id}));
  await act(()=>render(first));const select=document.querySelector("select");select.value="seller";await act(()=>select.dispatchEvent(new dom.window.Event("change",{bubbles:true})));
  await act(()=>click(button("Skip for now")));assert.ok(button("Reopen getting started"));
  await act(()=>render(other));assert.equal(document.querySelector("select").value,"collector");assert.ok(button("Skip for now"));
  await act(()=>render(first));assert.ok(button("Reopen getting started"));await act(()=>click(button("Reopen getting started")));
  assert.equal(document.querySelector("select").value,"seller");assert.match(document.body.textContent,/do not change membership/);
});
test("confirmation help has a named email control and prevents concurrent requests",async()=>{
  environment();let calls=0,finish;
  function Form(){const[email,setEmail]=useState("member@example.test");return React.createElement(EmailHelp,{email,onEmailChange:setEmail,onRequest:()=>{calls++;return new Promise(resolve=>{finish=resolve;});},expired:true});}
  await act(()=>root.render(React.createElement(Form)));const input=document.querySelector('input[type="email"]');
  assert.ok(document.querySelector(`label[for="${input.id}"]`));assert.ok(document.querySelector("details").open);assert.match(document.body.textContent,/Forgot password/);
  await act(()=>{click(button("Resend confirmation email"));click(document.querySelector("button"));});assert.equal(calls,1);assert.equal(document.querySelector("button").disabled,true);
  await act(async()=>{finish({ok:true,message:"If this email has an unconfirmed account, a fresh link will arrive."});await Promise.resolve();});assert.match(document.querySelector('[role="status"]').textContent,/If this email/);
});
test("members with collection items see a compact completion notice and can still reopen the introduction",async()=>{
  environment();await act(()=>root.render(React.createElement(Guide,{userId:first,hasCollectionItems:true})));
  assert.ok(button("Reopen getting started"));assert.equal(document.querySelector("select"),null);assert.match(document.body.textContent,/collection is started/);
  await act(()=>click(button("Reopen getting started")));assert.ok(document.querySelector("select"));
});
test("signup privacy and navigation glossary name public fields and real functions",async()=>{
  environment();await act(()=>root.render(React.createElement(React.Fragment,null,React.createElement(SignupFieldPrivacy),React.createElement(Guide,{userId:first}))));
  assert.match(document.body.textContent,/public username/);assert.match(document.body.textContent,/account name and email/);
  assert.equal(document.querySelectorAll(".member-destinations dt").length,6);assert.match(document.body.textContent,/Area preferences.*personalize/);
});
test("community links explain purpose and notification consent without subscribing anyone",async()=>{
  environment();await act(()=>root.render(React.createElement(Community)));
  const links=[...document.querySelectorAll('a[target="_blank"]')];assert.equal(links.length,2);assert.ok(links.every(link=>link.rel.includes("noopener")));
  assert.match(document.body.textContent,/#choose-roles/);assert.match(document.body.textContent,/does not subscribe you/);assert.match(document.body.textContent,/optional/);
});
test("coverage exposes a readable pause label even when compact and distinguishes member observations",async()=>{
  environment();await act(()=>root.render(React.createElement(Coverage,{compact:true})));
  assert.match(document.querySelector("summary").textContent,/Best Buy paused/);assert.equal(document.querySelector("details").open,false);
  assert.match(document.body.textContent,/no inventory checks/);assert.match(document.body.textContent,/member’s report.*community observation/);
});
test("shop entry preselects private support, unknown topics fall back safely",async()=>{
  environment("/support?topic=shop");await act(()=>root.render(React.createElement(PublicSupportPage)));
  assert.equal(document.querySelector("select").value,"shop");assert.match(document.querySelector('a[href^="mailto:"]').href,/Shop%20participation/);
  assert.ok(document.querySelector('option[value="safety"]'));assert.ok(document.querySelector('option[value="bug"]'));assert.match(document.body.textContent,/not monitored as an emergency/);
});
process.on("exit",()=>hooks.deregister());
