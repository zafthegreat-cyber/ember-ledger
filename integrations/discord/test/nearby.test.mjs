import test from 'node:test';
import assert from 'node:assert/strict';
import c from '../role-picker/submissions.json' with {type:'json'};
import rolesConfig from '../role-picker/config.json' with {type:'json'};
import {nationalSearch,nationalAudience,createNearbyHandler,nearbySummary} from '../role-picker/nearby.mjs';
import {payloadV2,verifyCopy,effectiveChannelPermissions,primaryDestination,processReviewV2} from '../role-picker/submissions-v2.mjs';
import {pickerMessage} from '../role-picker/core.mjs';

const user='1800000000000000001',other='1800000000000000002',product=c.productRoles.pokemon;
const now=Date.now(),id=String((BigInt(now)-1420070400000n)<<22n);
const austin=nationalSearch('Austin TX')[0],richmond=nationalSearch('Richmond VA')[0];
const everyone={id:c.guildId,permissions:String(1024n|2048n|16384n|65536n)},roles=[everyone,{id:product,permissions:'0'}];
const channel={id:c.localChannelId,guild_id:c.guildId,type:0,permission_overwrites:[]};
const row={id,report:{kind:'local',category:'pokemon',locality:austin.id,product:'Unit fixture',store:'Example public shop',status:'stock',observedAt:new Date(now).toISOString()},state:'queued',is_test:false};
function interaction(custom,changes={}){return {id,type:3,application_id:c.applicationId,guild_id:c.guildId,channel_id:rolesConfig.channelId,token:'fixture_interaction_token_1234567890',member:{user:{id:user,bot:false}},message:{author:{id:c.applicationId},flags:64,interaction_metadata:{user:{id:user}}},data:{component_type:2,custom_id:custom},...changes};}

test('simple menu has three independent menus and no state list; optional old rooms remain available',()=>{
 const p=pickerMessage(rolesConfig,[],'','simple',user);
 assert.equal(p.components.filter(r=>r.components[0].type===3).length,3);assert.ok(p.components.length<=5);
 assert.ok(!JSON.stringify(p.components).includes('c3:locations:v1'));
 const advanced=pickerMessage(rolesConfig,[],'','rooms',user);assert.equal(advanced.components.filter(r=>r.components[0].type===3).length,2);
 assert.ok(JSON.stringify(advanced).includes('c3:locations:v1'));assert.equal(nearbySummary(null,user).allowed_mentions.users.length,0);
});
test('nearby audiences require current product role, a matching radius, channel access and the signed stored identity',async()=>{
 const far=nationalSearch('Seattle WA')[0];
 const candidates=[{member_id:user,area_id:austin.id,radius:25},{member_id:other,area_id:austin.id,radius:25},{member_id:'1800000000000000003',area_id:far.id,radius:25}];
 const calls=[];const api=async route=>{calls.push(route);const memberId=route.split('/').at(-1);return {user:{id:memberId,bot:false},roles:memberId===user?[product]:[]};};
 assert.deepEqual(await nationalAudience(c,row,api,async()=>candidates,channel,roles),[user]);assert.equal(calls.length,2);
 const denied={...channel,permission_overwrites:[{type:1,id:user,deny:'1024',allow:'0'}]};
 await assert.rejects(nationalAudience(c,row,api,async()=>candidates,denied,roles),/No nearby members/);
 await assert.rejects(nationalAudience(c,row,api,async()=>Array(51).fill(candidates[0]),channel,roles),/audience needs staff review/);
});
test('existing role recipients are excluded from the shared nearby mention and every copied audience is explicit',async()=>{
 const area=c.regions.flatMap(r=>r.options).find(o=>o.key==='chesapeake');
 const near=nationalSearch('Chesapeake VA')[0],legacy={...row,report:{...row.report,locality:'chesapeake'}};
 const privateRoom={id:area.channelId,guild_id:c.guildId,type:0,permission_overwrites:[{id:c.guildId,type:0,allow:'0',deny:'1024'},{id:area.roleId,type:0,allow:'1024',deny:'0'}]};
 const api=async route=>({user:{id:route.split('/').at(-1),bot:false},roles:[product,...(route.endsWith(user)?[area.roleId]:[])]});
 const audience=await nationalAudience(c,legacy,api,async()=>[{member_id:user,area_id:near.id,radius:25},{member_id:other,area_id:near.id,radius:25}],channel,[...roles,{id:area.roleId,permissions:'0'}],privateRoom);
 assert.deepEqual(audience,[other]);
 const shared=payloadV2(c,legacy,{channelId:c.localChannelId,ping:true,nearbyUsers:audience});assert.deepEqual(shared.allowed_mentions.users,[other]);assert.deepEqual(shared.allowed_mentions.roles,[]);
 const local=payloadV2(c,legacy,{channelId:area.channelId,ping:true,nearbyUsers:audience});assert.deepEqual(local.allowed_mentions.roles,[product]);assert.deepEqual(local.allowed_mentions.users,[]);
 const silent=payloadV2(c,row,{channelId:c.localChannelId});assert.deepEqual(silent.allowed_mentions.users,[]);assert.deepEqual(silent.allowed_mentions.roles,[]);
 const message={id:'1800000000000000009',author:{id:c.applicationId},channel_id:c.localChannelId,content:shared.content,embeds:shared.embeds,mentions:[{id:other}],mention_roles:[],mention_everyone:false};
 verifyCopy(c,shared,message,c.localChannelId);assert.throws(()=>verifyCopy(c,shared,{...message,mentions:[{id:user}]},c.localChannelId),/readback/);
 assert.equal(primaryDestination(c,row),c.localChannelId);assert.equal(effectiveChannelPermissions(privateRoom,[...roles,{id:area.roleId,permissions:'0'}],{user:{id:other},roles:[product]},c.guildId)&1024n,0n);
});
test('search is private, rejects cross-member controls and wrong guilds before accessing preferences',async()=>{
 const jobs=[],calls=[];const h=createNearbyHandler(c,rolesConfig,{api:async(...args)=>calls.push(args),store:async()=>{throw Error('unexpected store');},reports:async()=>{},waitUntil:p=>jobs.push(p),now:()=>now});
 const wrong=await h(interaction(`c3:near:find:save:${other}`)).json();assert.match(wrong.data.content,/another member/);assert.equal(calls.length,0);
 const wrongGuild=await h(interaction('c3:near:open:v1',{guild_id:other})).json();assert.match(wrongGuild.data.content,/inside Code 3/);assert.equal(jobs.length,0);
 const modal=await h(interaction(`c3:near:find:save:${user}`)).json();assert.equal(modal.type,9);assert.equal(modal.data.components.length,1);
 const search=await h(interaction(`c3:near:search:save:${user}`,{type:5,data:{custom_id:`c3:near:search:save:${user}`,components:[{type:18,component:{type:4,custom_id:'query',value:'Austin TX'}}]}})).json();
 assert.equal(search.data.flags,64);assert.equal(search.data.components[0].components[0].options[0].value,austin.id);assert.equal(calls.length,0);
});
test('a forged selected place outside the displayed results cannot save or submit',async()=>{
 let writes=0;const h=createNearbyHandler(c,rolesConfig,{api:async()=>{},store:async()=>{writes++;},reports:async()=>{},waitUntil:()=>{},now:()=>now});
 const result=await h(interaction(`c3:near:choose:save:${user}`,{data:{component_type:3,custom_id:`c3:near:choose:save:${user}`,values:[austin.id]},message:{author:{id:c.applicationId},flags:64,interaction_metadata:{user:{id:user}},components:[{components:[{options:[{value:richmond.id}]}]}]}})).json();
 assert.match(result.data.content,/current search/);assert.equal(writes,0);
});
test('staff national approval posts two verified copies, mentions only nearby opted-ins and keeps the product copy silent',async()=>{
 const messages=new Map(),sent=[],storeCalls=[];let next=1800000000000000100n,claimed=false,audienceChecks=0;
 const publishing={...row,state:'publishing',claim:'fixture-claim'};
 const api=async(route,{method='GET',body}={})=>{
  if(route==='/users/@me')return {id:c.applicationId,bot:true};
  if(route===`/guilds/${c.guildId}/roles`)return roles;
  if(route===`/guilds/${c.guildId}/members/${c.ownerId}`)return {user:{id:c.ownerId,bot:false},roles:[]};
  if(route===`/guilds/${c.guildId}/members/${c.applicationId}`)return {user:{id:c.applicationId,bot:true},roles:[]};
  const m=/^\/channels\/(\d+)(?:\/messages(?:\/(\d+))?)?$/.exec(route);assert.ok(m,route);
  if(!route.includes('/messages'))return {...channel,id:m[1]};
  if(method==='POST'){const id=String(next++),message={id,author:{id:c.applicationId},channel_id:m[1],content:body.content,embeds:body.embeds,mentions:body.allowed_mentions.users.map(id=>({id})),mention_roles:body.allowed_mentions.roles,mention_everyone:false};messages.set(`${m[1]}:${id}`,message);sent.push({channel:m[1],body});return message;}
  if(method==='GET')return messages.get(`${m[1]}:${m[2]}`);
  return {};
 };
 const store=async(method,args)=>{storeCalls.push({method,args});if(method==='get')return row;if(method==='recentAlert')return null;if(method==='review'){if(claimed)return {claimed:false,report:{...row,state:'published'}};claimed=true;return {claimed:true,report:publishing};}if(method==='plan')return {report:{...publishing,notify_requested:true},copies:[{channel_id:c.localChannelId,action:'post'},{channel_id:c.feeds.pokemon,action:'post'}]};if(method==='copyClaim')return true;if(method==='finishV2')return {...publishing,state:'published',notify_requested:true};};
 const audience=async()=>{audienceChecks++;return [user];};
 const action={id:row.id,userId:c.ownerId,messageId:'1800000000000000099',decision:'approve',notify:true};
 await processReviewV2(c,action,api,store,audience);
 assert.equal(sent.length,2);assert.equal(audienceChecks,2,'consent is refreshed just before the shared post');
 assert.deepEqual(sent.find(x=>x.channel===c.localChannelId).body.allowed_mentions.users,[user]);
 assert.deepEqual(sent.find(x=>x.channel===c.feeds.pokemon).body.allowed_mentions,{parse:[],users:[],roles:[],replied_user:false});
 assert.equal(storeCalls.filter(x=>x.method==='copyFinish').length,2);
 await processReviewV2(c,action,api,store,audience);assert.equal(sent.length,2,'duplicate approval does not post again');
});
test('saved area writes use only the signed member and do not alter any roles',async()=>{
 const jobs=[],writes=[],responses=[];
 const h=createNearbyHandler(c,rolesConfig,{api:async(route,args)=>responses.push({route,args}),store:async(method,args)=>{writes.push({method,args});return {area_id:args.p_area,radius:args.p_radius};},reports:async()=>{},waitUntil:p=>jobs.push(p),now:()=>now});
 const i=interaction(`c3:near:choose:save:${user}`,{data:{component_type:3,custom_id:`c3:near:choose:save:${user}`,values:[austin.id]},message:{author:{id:c.applicationId},flags:64,interaction_metadata:{user:{id:user}},components:[{components:[{options:[{value:austin.id}]}]}]}});
 assert.equal((await h(i).json()).type,5);await Promise.all(jobs);
 assert.equal(writes[0].args.p_member,user);assert.equal(writes[0].args.p_area,austin.id);assert.equal(writes[0].args.p_request,id);
 assert.ok(responses.every(x=>x.route.startsWith('/webhooks/')));assert.match(responses[0].args.body.content,/Austin, TX/);
});
