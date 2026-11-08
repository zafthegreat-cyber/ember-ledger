import {validateConfig,discordClient} from './core.mjs';
import {failureReporter,failureStatus} from './events.mjs';
const SNOW=/^\d{17,20}$/u,NO_MENTIONS={parse:[],roles:[],users:[],replied_user:false};
const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const privateReply=content=>json({type:4,data:{content,flags:64,allowed_mentions:NO_MENTIONS}});
export function resetStore(url,key,{fetchImpl=fetch}={}){
 if(url!=='https://gxsfququorfczvhrkudl.supabase.co'||!key)throw Error('Reset storage unavailable');
 const methods={claim:'code3_interest_reset_claim',finish:'code3_interest_reset_finish'};
 return async(method,args)=>{
  if(!Object.hasOwn(methods,method))throw Error('Unknown reset operation');
  const r=await fetchImpl(`${url}/rest/v1/rpc/${methods[method]}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
  if(!r.ok)throw Error('Reset could not be claimed.');const text=await r.text();return text?JSON.parse(text):null;
 };
}
/** URL button back to the role picker; URL buttons never need a custom_id or a signed round trip (prioritized IMP165). */
export const pickerLink=c=>({type:1,components:[{type:2,style:5,label:'Open Choose alerts & interests',url:`https://discord.com/channels/${c.guildId}/${c.channelId}`}]});
/** The member's current optional interests, grouped the way the picker shows them (prioritized IMP161). */
export function currentInterests(c,memberRoles=[]){
 const names={products:'Products',online:'Online',locations:'Southeastern Virginia',fredericksburg:'Fredericksburg area',projects:'Projects'};
 const roles=new Set(Array.isArray(memberRoles)?memberRoles.filter(x=>SNOW.test(x)):[]);
 const groups=Object.entries(c.groups).map(([key,options])=>({key,name:names[key]??key,labels:options.filter(o=>roles.has(o.roleId)).map(o=>o.label)})).filter(g=>g.labels.length);
 return {count:groups.reduce((n,g)=>n+g.labels.length,0),groups};
}
export function resetConfirmation(c,userId,requestId,memberRoles=[]){
 if(!SNOW.test(userId)||!SNOW.test(requestId))throw Error('Invalid reset identity');
 const mine=currentInterests(c,memberRoles);
 if(mine.count===0)return {content:'You have no optional interests selected right now, so there is nothing to reset. Staff, ownership and other roles are never part of a reset. Use Choose alerts & interests when you want to opt in.',flags:64,allowed_mentions:NO_MENTIONS,components:[pickerLink(c)]};
 const listed=mine.groups.map(g=>`• **${g.name}:** ${g.labels.join(', ')}`).join('\n');
 const content=`Reset all optional interests? You currently have **${mine.count}**:\n${listed}\n\nConfirming removes exactly these interest roles and nothing else — staff, ownership and every other role stay. It does not change Discord/device notification settings or remove old messages.\n\nConfirm within five minutes. Afterwards, use Choose alerts & interests to opt in again.`;
 return {content:content.length<=1900?content:`Reset all optional interests? You currently have **${mine.count}** across ${mine.groups.map(g=>g.name).join(', ')}.\n\nConfirming removes exactly those interest roles and nothing else — staff, ownership and every other role stay. It does not change Discord/device notification settings or remove old messages.\n\nConfirm within five minutes. Afterwards, use Choose alerts & interests to opt in again.`,flags:64,allowed_mentions:NO_MENTIONS,components:[{type:1,components:[{type:2,style:4,custom_id:`c3:reset:yes:${userId}:${requestId}:v1`,label:'Confirm reset optional interests'},{type:2,style:2,custom_id:`c3:reset:no:${userId}:${requestId}:v1`,label:'Cancel reset'}]}]};
}
export async function performReset(c,{userId,requestId},api,store){
 const ids=Object.values(c.groups).flat().map(o=>o.roleId),route=`/guilds/${c.guildId}/members/${userId}`;
 const [bot,before,roles]=await Promise.all([api('/users/@me'),api(route),api(`/guilds/${c.guildId}/roles`)]);
 if(!bot.bot||bot.id!==c.applicationId||before.user?.id!==userId||before.user.bot||!Array.isArray(before.roles))throw Error('Unexpected reset identity');
 if(ids.some(id=>{const role=roles.find(r=>r.id===id);return !role||role.managed||role.mentionable||BigInt(role.permissions)!==0n;}))throw Error('An optional role changed privileges; contact staff.');
 if(await store('claim',{p_request:requestId,p_member:userId})!==true)return 'This reset was already processed or is held for inspection. No roles were changed by this retry. Reopen /notifications to inspect your current roles.';
 const removed=ids.filter(id=>before.roles.includes(id));
 // Claim first. An ambiguous send remains held and is never replayed automatically.
 for(const id of removed)await api(`${route}/roles/${id}`,{method:'DELETE'});
 const after=await api(route);
 if(after.user?.id!==userId||!Array.isArray(after.roles)||ids.some(id=>after.roles.includes(id)))throw Error('Reset needs inspection; do not retry.');
 if(await store('finish',{p_request:requestId,p_member:userId,p_removed:removed.length})!==true)throw Error('Reset receipt needs inspection.');
 return `Reset ${removed.length} optional interest role(s). Other roles were not targeted. Reopen Choose alerts & interests when you want to opt in again. Discord/device mute and push settings are unchanged.`;
}
/** @param {any} c @param {{token?:string,api?:ReturnType<typeof discordClient>,store?:(method:string,args:any)=>Promise<any>,waitUntil?:(task:Promise<unknown>)=>void,now?:()=>number,onFailure?:(record:{stage:string,status:string})=>unknown}} [dependencies] */
export function createResetHandler(c,{token,api:providedApi,store,waitUntil,now=()=>Date.now(),onFailure}={}){
 validateConfig(c);const api=providedApi??discordClient(token,{maxRetryAfterSeconds:30});const report=failureReporter(onFailure);
 return i=>{
  const command=i.type===2&&i.data?.name==='reset-notifications';
  const open=i.type===3&&i.data?.custom_id==='c3:reset:open:v1';
  const match=i.type===3&&/^c3:reset:(yes|no):(\d{17,20}):(\d{17,20}):v1$/u.exec(i.data?.custom_id??'');
  if(!command&&!open&&!match)return null;
  if(!c.resetCommandId)return privateReply('Notification reset is not enabled yet. Remove checkmarks in Choose alerts & interests.');
  if(i.application_id!==c.applicationId||i.guild_id!==c.guildId||(i.channel_id??i.channel?.id)!==c.channelId||!SNOW.test(i.id??'')||!SNOW.test(i.member?.user?.id??'')||i.member.user.bot||!/^[A-Za-z0-9_.-]{20,300}$/u.test(i.token??''))return privateReply('Use notification reset in Code 3 TCG #choose-roles.');
  if(command){
   if(i.data.id!==c.resetCommandId||i.data.type!==1||(i.data.options??[]).length)return privateReply('Use the current reset-notifications command.');
   return json({type:4,data:resetConfirmation(c,i.member.user.id,i.id,i.member.roles)});
  }
  if(open){
   if(i.data.component_type!==2||i.message?.id!==c.menuMessageId||i.message?.author?.id!==c.applicationId||(Number(i.message?.flags)&64)||!i.message.components?.some(r=>r.components?.some(b=>b.custom_id==='c3:reset:open:v1')))return privateReply('Use the Reset optional interests button on the current role-picker message.');
   return json({type:4,data:resetConfirmation(c,i.member.user.id,i.id,i.member.roles)});
  }
  const [,decision,userId,requestId]=match,owner=i.message?.interaction_metadata?.user?.id??i.message?.interaction?.user?.id;
  const issued=Number((BigInt(requestId)>>22n)+1420070400000n);
  if(userId!==i.member.user.id||owner!==userId||!(Number(i.message?.flags)&64)||i.message.author?.id!==c.applicationId||i.data.component_type!==2||!i.message.components?.some(r=>r.components?.some(b=>b.custom_id===i.data.custom_id))||now()-issued>300000||issued-now()>60000)return privateReply('This confirmation expired or belongs to another member. Run /reset-notifications again.');
  if(decision==='no')return json({type:7,data:{content:'Reset cancelled. Your interests were not changed.',components:[pickerLink(c)],embeds:[],allowed_mentions:NO_MENTIONS}});
  waitUntil((async()=>{
   let content;try{content=await performReset(c,{userId,requestId},api,store);}catch(e){report('reset',failureStatus(e));content='The reset could not be confirmed. Some roles may have changed. Inspect /notifications and ask staff before retrying; automatic replay is held.';}
   try{await api(`/webhooks/${c.applicationId}/${i.token}/messages/@original`,{method:'PATCH',webhook:true,body:{content,components:[pickerLink(c)],embeds:[],allowed_mentions:NO_MENTIONS}});}catch{console.warn('interest_reset_private_reply_failed');report('reset:reply','unavailable');}
  })());
  return json({type:6});
 };
}
