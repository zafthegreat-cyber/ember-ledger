import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEmailRequestController, expiredEmailLink, safeAuthMessage } from "../src/features/auth/emailAssistance.mjs";
import { readMemberIntro, saveMemberIntro } from "../src/features/auth/memberStart.mjs";
import { readFeedbackDraft, saveFeedbackDraft, clearFeedbackDraft } from "../src/features/auth/feedbackDraft.mjs";
import { privacySupportDraft, SUPPORT_TOPICS } from "../src/features/privacy/privacySupport.js";

const first="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", other="bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key),data};};
const auth=overrides=>({resend:async()=>({}),resetPasswordForEmail:async()=>({}),...overrides});
const args={kind:"confirmation",email:"member@example.test",redirectTo:"https://code3tcg.app"};

test("recovery messages never distinguish missing, confirmed, or registered email addresses", async()=>{
  const messages=[];
  for(const error of [null,{status:400,code:"user_not_found",message:"secret email absent"},{status:422,code:"email_exists",message:"secret email exists"},{status:400,code:"email_confirmed",message:"secret confirmed"}]) {
    const controller=createEmailRequestController();
    const reply=await controller.send({...args,kind:"recovery",auth:auth({resetPasswordForEmail:async()=>({error})})});
    assert.equal(reply.ok,true);messages.push(reply.message);assert.ok(!reply.message.includes("secret"));
  }
  assert.equal(new Set(messages).size,1);
});
test("confirmation calls signup resend with the existing exact platform redirect only",async()=>{
  let payload;const controller=createEmailRequestController();
  await controller.send({...args,email:" member@example.test ",auth:auth({resend:async value=>{payload=value;return {};}})});
  assert.deepEqual(payload,{type:"signup",email:"member@example.test",options:{emailRedirectTo:args.redirectTo}});
  const native=createEmailRequestController();await native.send({...args,redirectTo:"code3tcg://auth/callback?flow=signin",auth:auth({resend:async value=>{payload=value;return {};}})});
  assert.equal(payload.options.emailRedirectTo,"code3tcg://auth/callback?flow=signin");
});
test("invalid input and missing client cannot send an email",async()=>{
  let calls=0;const controller=createEmailRequestController();const client=auth({resend:async()=>{calls++;return {};}});
  for(const email of ["", "bad", "a@b", "a\nb@example.test"]) assert.equal((await controller.send({...args,email,auth:client})).ok,false);
  assert.equal((await controller.send({...args,auth:null})).ok,false);assert.equal(calls,0);
});
test("pending duplicate clicks, changing addresses, and switching request kind cannot bypass the cooldown",async()=>{
  let now=1000,calls=0,finish;const client=auth({resend:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
  const controller=createEmailRequestController({now:()=>now});const request=controller.send({...args,auth:client});await Promise.resolve();
  assert.equal((await controller.send({...args,auth:client})).ok,false);
  finish({});assert.equal((await request).ok,true);
  assert.equal((await controller.send({...args,email:"other@example.test",kind:"recovery",auth:client})).ok,false);
  now+=60_001;assert.equal((await controller.send({...args,kind:"recovery",auth:client})).ok,true);assert.equal(calls,1);
});
test("a timed-out SDK call remains guarded until it settles, and the UI can explain an unknown outcome",async()=>{
  let resolve;const controller=createEmailRequestController({timeoutMs:5,cooldownMs:1});
  const client=auth({resend:()=>new Promise(done=>{resolve=done;})});
  const reply=await controller.send({...args,auth:client});assert.equal(reply.ok,false);assert.match(reply.message,/may still arrive/);
  assert.equal((await controller.send({...args,auth:client})).ok,false);resolve({});
});
test("network and service failures remain private and offer recovery",async()=>{
  for(const client of [auth({resend:async()=>{throw Error("private token");}}),auth({resend:async()=>({error:{status:0,name:"AuthRetryableFetchError",message:"private token"}})}),auth({resend:async()=>({error:{status:503,message:"private token"}})}),auth({resend:async()=>({error:{status:429,message:"private token"}})})]){
    const reply=await createEmailRequestController().send({...args,auth:client});assert.equal(reply.ok,false);assert.ok(!reply.message.includes("private token"));
  }
  for(const operation of ["login","signup","recovery"]) assert.ok(!safeAuthMessage({message:"private credential"},operation).includes("private credential"));
  assert.equal(safeAuthMessage({message:"Email already registered"},"signup"),safeAuthMessage({message:"User not found"},"signup"));
});
test("expired-link help reads recognized error codes only, leaving OAuth verification separate",()=>{
  assert.equal(expiredEmailLink({href:"https://code3tcg.app/?error_code=otp_expired"}),true);
  assert.equal(expiredEmailLink({href:"https://code3tcg.app/reset-password#error_code=otp_expired&error_description=private"}),true);
  assert.equal(expiredEmailLink({href:"https://code3tcg.app/auth/callback?error_code=otp_expired"}),false);
  assert.equal(expiredEmailLink({href:"https://code3tcg.app/?error_description=otp_expired"}),false);
});
test("intro choices are scoped to UUID accounts and cannot store other fields or change authority",()=>{
  const local=storage();assert.equal(saveMemberIntro(local,first,{path:"seller",hidden:true,admin:true}),true);
  assert.deepEqual(readMemberIntro(local,first),{path:"seller",hidden:true});assert.deepEqual(readMemberIntro(local,other),{path:"collector",hidden:false});
  assert.equal(saveMemberIntro(local,"guest",{hidden:true}),false);assert.ok(![...local.data.values()].join().includes("admin"));
  assert.equal(saveMemberIntro(local,first,{path:"__proto__",hidden:false}),true);assert.equal(readMemberIntro(local,first).path,"collector");
});
test("blocked or malformed storage leaves the guide usable",()=>{
  const blocked={getItem(){throw Error();},setItem(){throw Error();}};
  assert.deepEqual(readMemberIntro(blocked,first),{path:"collector",hidden:false});assert.equal(saveMemberIntro(blocked,first,{}),false);
  assert.deepEqual(readMemberIntro({getItem:()=>"broken"},first),{path:"collector",hidden:false});
});
test("saved feedback drafts exclude identifiers, credentials, auto metadata and confirmation",()=>{
  const tab=storage();assert.equal(saveFeedbackDraft(tab,first,{reference:other,message:"My goal",mainReason:"General feedback",email:"private@example.test",name:"Private name",password:"secret",metadata:{token:"secret"},safetyConsent:true}),true);
  const saved=readFeedbackDraft(tab,first);assert.equal(saved.message,"My goal");assert.equal(saved.reference,other);
  assert.equal(readFeedbackDraft(tab,other),null);assert.equal(saved.email,undefined);assert.equal(saved.safetyConsent,undefined);assert.ok(![...tab.data.values()].join().includes("secret"));
  clearFeedbackDraft(tab,first);assert.equal(readFeedbackDraft(tab,first),null);
});
test("feedback draft failures do not mutate the in-memory form or expose a different account",()=>{
  const original={reference:other,message:"Keep this draft"};const broken={setItem(){throw Error();},getItem(){throw Error();},removeItem(){throw Error();}};
  assert.equal(saveFeedbackDraft(broken,first,original),false);assert.equal(original.message,"Keep this draft");assert.equal(readFeedbackDraft(broken,first),null);
  assert.equal(saveFeedbackDraft(storage(),"guest",original),false);clearFeedbackDraft(broken,first);
  assert.equal(saveFeedbackDraft(storage(),first,{...original,message:"x".repeat(6001)}),false);
});
test("private support topics produce distinct drafts and no automatic sending",()=>{
  for(const topic of ["howto","access","bug","safety","shop"]){
    assert.ok(SUPPORT_TOPICS[topic]);const draft=privacySupportDraft({topic,note:"My goal",recipient:"support@code3tcg.com"});
    assert.match(draft.mailto,/^mailto:/);assert.match(draft.text,/My goal/);assert.ok(draft.text.includes(SUPPORT_TOPICS[topic].label));
  }
  assert.equal(privacySupportDraft({topic:"__proto__"}).subject,"Code 3 TCG: General help");
});
test("all 250 original IDs remain ranked exactly once and the implementation batch is exactly twenty",()=>{
  const plan=JSON.parse(readFileSync(new URL("../docs/member-improvements/priority-plan.json",import.meta.url)));
  assert.equal(plan.items.length,250);assert.equal(new Set(plan.items.map(row=>row.id)).size,250);
  assert.equal(plan.items.filter(row=>row.rank<=20).length,20);assert.match(plan.bestBuy,/Paused/);
  for(const [index,row] of plan.items.entries())assert.equal(row.rank,index+1);
});
