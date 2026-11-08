import {submissionModal,parseSubmission,reportPayload as legacyPayload,processSubmission,createSubmissionHandler,validateSubmissionConfig,NO_MENTIONS,STATUSES} from './submissions.mjs';
import {failureReporter,failureStatus} from './events.mjs';
import {nationalArea,reportArea} from './location-catalog.mjs';
const snowflake=v=>typeof v==='string'&&/^\d{17,20}$/u.test(v);
const json=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
const privateText=content=>json({type:4,data:{content,flags:64,allowed_mentions:NO_MENTIONS}});
const safe=v=>String(v).replace(/@/gu,'@\u200b').replace(/[\\`*_{}\[\]()<>|~]/gu,'\\$&');
export async function deliveryNonce(id,channelId){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${id}:${channelId}`));return 'p'+[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,24);}
export const localities=c=>c.regions.flatMap(r=>r.options);
export const alertRepeatWindowMinutes=c=>Number.isInteger(c.alertRepeatWindowMinutes)&&c.alertRepeatWindowMinutes>=15&&c.alertRepeatWindowMinutes<=1440?c.alertRepeatWindowMinutes:120;
/** Private acknowledgement that echoes exactly what was recorded (prioritized IMP119/IMP120). */
export function submissionReceipt(c,row){
 const p=row.report,label=c.products.find(x=>x.key===p.category)?.label??p.category;
 const area=p.locality?reportArea(c,p.locality)?.label:null;
 const observed=Math.floor(Date.parse(p.observedAt)/1000);
 return `Submitted for staff review. Reference ${row.id}.\nRecorded: ${label} · ${safe(p.product)} · ${safe(p.store)} · ${STATUSES[p.status]} · observed <t:${observed}:R>${area?` · ${area}`:p.kind==='online'?' · Online':''}.\nUse /report-status to check it; /withdraw-report works until staff act. Nothing has been published as an alert yet, and approval alone does not mention anyone.`.slice(0,1900);
}
export function primaryDestination(c,row){return row.is_test?c.testChannelId:row.report.kind==='online'?c.onlineChannelId:localities(c).find(o=>o.key===row.report.locality)?.channelId??c.localChannelId;}
export function expectedDestinations(c,row){if(row.is_test)return [c.testChannelId];return [...new Set([primaryDestination(c,row),...(row.report.kind==='local'?[c.localChannelId]:[]),c.feeds[row.report.category]])];}
export function localityMenu(c,regionKey){
 if(!regionKey)return {content:'Choose the region you personally checked. Next, select a city or county; then the private report form opens. No location is inferred from your roles.',allowed_mentions:NO_MENTIONS,components:[{type:1,components:c.regions.map(r=>({type:2,style:1,custom_id:`c3:report:region:${r.key}:v2`,label:r.label}))}]};
 const region=c.regions.find(r=>r.key===regionKey);if(!region)throw new Error('Unknown region');
 return {content:`Choose the public city/county in ${region.label}.`,allowed_mentions:NO_MENTIONS,components:[{type:1,components:[{type:3,custom_id:`c3:report:city:${region.key}:v2`,min_values:1,max_values:1,placeholder:'City or county you checked',options:region.options.map(o=>({label:o.label,value:o.key}))}]}]};
}
const STATUS_LABELS={stock:'IN STOCK',preorder:'PREORDER',backorder:'BACKORDER',empty:'SOLD OUT'};
/** Short, factual reason line that travels with an opted-in mention (prioritized IMP153). */
export function alertReason(c,row){
 const p=row.report,label=c.products.find(x=>x.key===p.category).label;
 const online=p.kind==='online';const area=online?null:localities(c).find(x=>x.key===p.locality);
 if(!online&&!area)throw new Error('Unknown locality');
 const region=online?null:c.regions.find(r=>r.options.some(o=>o.key===p.locality));
 const where=online?'Online':area.label;
 const allLabel=region?.allLabel??(region?.key==='seva'?'All southeastern Virginia':region?.key==='fredericksburg'?'All Fredericksburg area':null);
 const because=online?`${label} and Online releases & restocks`:`${label} and ${area.label}${allLabel?` (or ${allLabel})`:''}`;
 const picker=snowflake(c.rolePickerChannelId)?` Change or stop this in <#${c.rolePickerChannelId}>.`:' Change or stop this in #choose-roles.';
 return `${label} · ${where} · ${STATUS_LABELS[p.status]} — you were mentioned because you chose ${because}.${picker}`;
}
/**
 * Turns the embed that is actually on a published copy into its corrected form (prioritized IMP128/IMP159).
 * Works from the live embed, so a later sold-out update already applied to that message is preserved
 * rather than overwritten; idempotent, so a replay changes nothing.
 */
export function correctedEmbed(embed,{reason,reportId}){
 if(!embed||typeof embed.title!=='string'||typeof reason!=='string'||!reason||!snowflake(reportId))throw new Error('Invalid correction notice');
 if(embed.title.startsWith('CORRECTED · '))return {embed:structuredClone(embed),changed:false};
 const next=structuredClone(embed);
 next.title=`CORRECTED · ${embed.title}`.slice(0,256);next.color=0x64748B;
 next.description=`Staff confirmed a member correction: ${safe(reason)}. Treat this observation as outdated. ${embed.description??''}`.trim().slice(0,4096);
 next.fields=[...(embed.fields??[]).filter(f=>f.name!=='Correction'),{name:'Correction',value:'Confirmed by staff after a member correction request. The original details are kept for context only.'}].slice(0,25);
 next.footer={text:`Report ${reportId} • corrected after staff review • confirm with retailer before acting`};
 return {embed:next,changed:true};
}
export function payloadV2(c,row,{review=false,ping=false,channelId,correction=null,nearbyUsers=[]}={}){
 const body=legacyPayload(c,row,{review});const embed=body.embeds[0],p=row.report;
 const label=c.products.find(x=>x.key===p.category).label;
 if(!review){
  const status={stock:['IN STOCK',0x2E8B57,'Stock was personally observed; availability can change.'],preorder:['PREORDER',0x3B82F6,'Preorder observed. This is not immediately available stock; check the retailer’s shipping terms.'],backorder:['BACKORDER',0xF59E0B,'Backorder observed. Availability and delivery dates are not confirmed.'],empty:['SOLD OUT',0x64748B,'A member reported this product out of stock at the observation time.']}[p.status];
  embed.title=`${row.is_test?'TEST — ':''}${status[0]} · ${label}${row.updates_report?' · updated observation':''}`;
  embed.color=status[1];embed.description=row.is_test?'Synthetic delivery test. This is not a real stock report.':`${status[2]} Staff-reviewed community observation; not independently verified by the retailer.`;
  embed.footer.text=`Report ${row.id} • ${row.updates_report?'updates an earlier report • ':''}confirm with retailer before acting`;
 }
 if(p.locality){const area=reportArea(c,p.locality);if(!area)throw new Error('Unknown locality');embed.fields.splice(2,0,{name:'City / county',value:area.label});}
 if(review&&row.state==='queued')body.components[0].components.push({type:2,style:1,custom_id:`c3:report:notify:${row.id}`,label:'Approve & notify opted-ins'});
 if(ping){
  const nearbyPing=nearbyUsers.length>0&&p.kind==='local'&&channelId===c.localChannelId;
  if(review||row.is_test||p.status==='empty'||!nearbyPing&&channelId!==primaryDestination(c,row)||p.kind==='local'&&!p.locality)throw new Error('Notification destination is not an interest intersection');
  if(nearbyPing){
   if(!nearbyUsers.length||nearbyUsers.length>50||nearbyUsers.some(id=>!snowflake(id))||new Set(nearbyUsers).size!==nearbyUsers.length)throw Error('Invalid nearby audience');
   const area=reportArea(c,p.locality);if(!area)throw Error('Unknown nearby area');
   body.content=`${nearbyUsers.map(id=>`<@${id}>`).join(' ')} ${label} · ${area.label} · ${STATUS_LABELS[p.status]} — matched your product and nearby area. Change this in #choose-roles.`;
   if(body.content.length>1950)throw Error('Nearby audience too large');
   body.allowed_mentions={parse:[],users:nearbyUsers,roles:[],replied_user:false};
  }else{
  const role=c.productRoles[p.category];if(!snowflake(role))throw new Error('Unknown notification role');
  // Only the product role is mentionable; the reason text carries no user, role or everyone mention.
  body.content=`<@&${role}> ${alertReason(c,row)}`;body.allowed_mentions={parse:[],users:[],roles:[role],replied_user:false};
  }
 }
 if(correction){
  // Fresh render of a corrected report (used when no live copy exists to transform).
  if(review||ping)throw new Error('Invalid correction notice');
  body.embeds[0]=correctedEmbed(embed,{reason:correction.reason,reportId:row.id}).embed;
 }
 return body;
}
export function notificationPolicy(c,row,channel,roles,botMember){
 if(row.is_test||row.report.status==='empty'||row.report.kind==='local'&&!row.report.locality||channel.id!==primaryDestination(c,row)||channel.guild_id!==c.guildId||botMember.user?.id!==c.applicationId)return false;
 const region=c.regions.find(r=>r.options.some(o=>o.key===row.report.locality)),area=region?.options.find(o=>o.key===row.report.locality);
 const allowed=new Set([...c.staffRoleIds,...(row.report.kind==='online'?[c.onlineRoleId]:[area?.roleId,region?.allRoleId])]);
 const defaults=channel.permission_overwrites?.find(o=>o.id===c.guildId&&o.type===0);
 if(!defaults||!(BigInt(defaults.deny)&1024n))return false;
 const list=channel.permission_overwrites??[];
 if(list.some(o=>BigInt(o.allow)&1024n&&(o.type===0?!allowed.has(o.id):o.id!==c.applicationId)))return false;
 if(![...allowed].filter(id=>!c.staffRoleIds.includes(id)).every(id=>list.some(o=>o.type===0&&o.id===id&&(BigInt(o.allow)&1024n))))return false;
 let bits=roles.filter(r=>r.id===c.guildId||botMember.roles.includes(r.id)).reduce((n,r)=>n|BigInt(r.permissions),0n);
 if(bits&8n)return true;
 bits=(bits&~BigInt(defaults.deny))|BigInt(defaults.allow);
 const selected=list.filter(o=>o.type===0&&botMember.roles.includes(o.id));bits=(bits&~selected.reduce((n,o)=>n|BigInt(o.deny),0n))|selected.reduce((n,o)=>n|BigInt(o.allow),0n);
 const own=list.find(o=>o.type===1&&o.id===c.applicationId);if(own)bits=(bits&~BigInt(own.deny))|BigInt(own.allow);
 const required=1024n|2048n|16384n|65536n|131072n;return (bits&required)===required;
}
export function verifyCopy(c,body,message,channelId){
 const fields=e=>(e?.fields??[]).map(({name,value})=>({name,value}));
 if(!snowflake(message.id)||message.author?.id!==c.applicationId||message.channel_id!==channelId||message.content!==body.content||message.mention_everyone||JSON.stringify((message.mentions??[]).map(m=>m.id).sort())!==JSON.stringify([...(body.allowed_mentions.users??[])].sort())||JSON.stringify([...(message.mention_roles??[])].sort())!==JSON.stringify([...body.allowed_mentions.roles].sort())||message.embeds?.[0]?.title!==body.embeds[0].title||message.embeds?.[0]?.description!==body.embeds[0].description||JSON.stringify(fields(message.embeds?.[0]))!==JSON.stringify(fields(body.embeds[0])))throw new Error('Publication readback mismatch');
}
export async function processSubmissionV2(c,action,api,store,decorateReview){
 const result=await store('submit',{p_id:action.id,p_submitter:action.userId,p_report:action.report,p_is_test:false});if(!result.created)return `This report was already received. Reference ${result.report.id}. Staff will review it.`;
 const row=result.report,body=payloadV2(c,row,{review:true});if(decorateReview)decorateReview(row,body);
 // The queue state is still queueing, but the displayed controls become usable
 // only after the exact message ID is bound by the queue RPC.
 body.components=[{type:1,components:[{type:2,style:3,custom_id:`c3:report:approve:${row.id}`,label:'Approve & post (no ping)'},{type:2,style:4,custom_id:`c3:report:reject:${row.id}`,label:'Reject'},{type:2,style:1,custom_id:`c3:report:notify:${row.id}`,label:'Approve & notify opted-ins'}]}];
 try{
  const sent=await api(`/channels/${c.reviewChannelId}/messages`,{method:'POST',body:{...body,nonce:`r${row.id}`,enforce_nonce:true}});
  verifyCopy(c,body,await api(`/channels/${c.reviewChannelId}/messages/${sent.id}`),c.reviewChannelId);
  await store('queue',{p_id:row.id,p_message:sent.id});
 }catch{await store('queue',{p_id:row.id,p_message:null}).catch(()=>{});throw new Error('Your report was saved, but review delivery needs staff attention. Please do not resubmit.');}
 return submissionReceipt(c,row);
}
export function effectiveChannelPermissions(channel,roles,member,guildId){
 let bits=roles.filter(r=>r.id===guildId||member.roles?.includes(r.id)).reduce((n,r)=>n|BigInt(r.permissions),0n);
 if(bits&8n)return bits;
 const overwrites=channel.permission_overwrites??[],everyone=overwrites.find(o=>o.type===0&&o.id===guildId);
 if(everyone)bits=(bits&~BigInt(everyone.deny))|BigInt(everyone.allow);
 const selected=overwrites.filter(o=>o.type===0&&member.roles?.includes(o.id));
 bits=(bits&~selected.reduce((n,o)=>n|BigInt(o.deny),0n))|selected.reduce((n,o)=>n|BigInt(o.allow),0n);
 const own=overwrites.find(o=>o.type===1&&o.id===member.user?.id);if(own)bits=(bits&~BigInt(own.deny))|BigInt(own.allow);
 return bits;
}
export async function processReviewV2(c,action,api,store,nearbyAudience){
 let nearbyUsers=[];
 const member=await api(`/guilds/${c.guildId}/members/${action.userId}`);
 if(member.user?.id!==action.userId||member.user.bot||!Array.isArray(member.roles)||action.userId!==c.ownerId&&!c.staffRoleIds.some(x=>member.roles.includes(x)))throw new Error('Only current Code 3 staff can review reports.');
 if(action.notify){
  const row=await store('get',{p_id:action.id});if(!row)throw new Error('Report unavailable');
  const [channel,roles,bot]=await Promise.all([api(`/channels/${primaryDestination(c,row)}`),api(`/guilds/${c.guildId}/roles`),api(`/guilds/${c.guildId}/members/${c.applicationId}`)]);
  if(nationalArea(row.report.locality)){
   if(row.is_test||row.report.status==='empty'||channel.id!==c.localChannelId||channel.guild_id!==c.guildId||bot.user?.id!==c.applicationId||!nearbyAudience)throw Error('No alert sent. Nearby notification is unavailable; post silently instead.');
   const required=1024n|2048n|16384n|65536n;
   const memberBits=effectiveChannelPermissions(channel,roles,bot,c.guildId);
   if(!(memberBits&8n)&&(memberBits&required)!==required)throw Error('No alert sent. Bot delivery permission is unavailable; post silently instead.');
   nearbyUsers=await nearbyAudience(row,channel,roles);
  }else{
   if(!notificationPolicy(c,row,channel,roles,bot))throw new Error('No alert sent. The destination needs owner-granted bot mention permission and matching area access. Use Approve & post (no ping) instead.');
   if(nearbyAudience&&row.report.kind==='local'){
    const shared=await api(`/channels/${c.localChannelId}`);
    if(shared.id!==c.localChannelId||shared.guild_id!==c.guildId)throw Error('No alert sent. Nearby destination unavailable.');
    const required=1024n|2048n|16384n|65536n,bits=effectiveChannelPermissions(shared,roles,bot,c.guildId);
    if(!(bits&8n)&&(bits&required)!==required)throw Error('No alert sent. Nearby delivery permission unavailable.');
    nearbyUsers=await nearbyAudience(row,shared,roles,channel);
   }
  }
  // Substantially identical updates do not mention members twice inside the repeat window (prioritized IMP156).
  const recent=await store('recentAlert',{p_id:row.id,p_window_minutes:alertRepeatWindowMinutes(c)});
  if(recent&&snowflake(recent.id))throw new Error(`No alert sent. Members were already mentioned for this product and store <t:${Math.floor(Date.parse(recent.alerted_at)/1000)}:R> (report ${recent.id}). Use Approve & post (no ping) so nobody is mentioned twice within ${alertRepeatWindowMinutes(c)} minutes.`);
 }
 const claim=await store('review',{p_id:action.id,p_message:action.messageId,p_staff:action.userId,p_decision:action.decision});let row=claim.report;
 if(!claim.claimed)return `This report is ${row.state.replaceAll('_',' ')}. No additional alert was sent.`;
 if(action.decision==='reject'){await api(`/channels/${c.reviewChannelId}/messages/${action.messageId}`,{method:'PATCH',body:payloadV2(c,row,{review:true})}).catch(()=>{});return 'Report rejected. No alert was posted.';}
 const identity=await api('/users/@me');if(!identity.bot||identity.id!==c.applicationId)throw new Error('Unexpected publishing identity');
 const plan=await store('plan',{p_id:row.id,p_claim:row.claim,p_notify:!!action.notify});row=plan.report;
 const allowed=new Set(row.updates_report?[...localities(c).map(x=>x.channelId),...Object.values(c.feeds),c.localChannelId,c.onlineChannelId,c.testChannelId]:expectedDestinations(c,row));
 try{
  if(!plan.copies?.length||plan.copies.length>3||plan.copies.some(x=>!allowed.has(x.channel_id)||row.is_test&&x.channel_id!==c.testChannelId))throw new Error('Unexpected copy plan');
  for(const copy of plan.copies){
   if(!await store('copyClaim',{p_id:row.id,p_claim:row.claim,p_channel:copy.channel_id}))throw new Error('Copy already claimed; inspect before retry');
   try{
    const channel=await api(`/channels/${copy.channel_id}`);if(channel.guild_id!==c.guildId||channel.type!==0)throw new Error('Unexpected destination');
    if(row.notify_requested&&copy.action==='post'&&copy.channel_id===c.localChannelId&&nearbyAudience){
     const currentRoles=await api(`/guilds/${c.guildId}/roles`);
     const primary=primaryDestination(c,row),legacy=primary!==c.localChannelId?await api(`/channels/${primary}`):undefined;
     nearbyUsers=await nearbyAudience(row,channel,currentRoles,legacy,true);
    }
    const ping=!!row.notify_requested&&copy.action==='post'&&(nationalArea(row.report.locality)?nearbyUsers.length>0&&copy.channel_id===c.localChannelId:copy.channel_id===primaryDestination(c,row)||nearbyUsers.length>0&&copy.channel_id===c.localChannelId);
    const body=payloadV2(c,row,{channelId:copy.channel_id,ping,nearbyUsers});let sent;
    if(copy.action==='update'){
     const old=await api(`/channels/${copy.channel_id}/messages/${copy.message_id}`);
     if(old.author?.id!==c.applicationId||old.channel_id!==copy.channel_id)throw new Error('Cannot edit another author’s observation');
     const prior=await store('get',{p_id:row.updates_report});
     if(!prior||old.embeds?.[0]?.fields?.find(x=>x.name==='Product')?.value!==safe(prior.report.product))throw new Error('Prior report identity mismatch');
     sent=await api(`/channels/${copy.channel_id}/messages/${copy.message_id}`,{method:'PATCH',body});
    }else sent=await api(`/channels/${copy.channel_id}/messages`,{method:'POST',body:{...body,nonce:await deliveryNonce(row.id,copy.channel_id),enforce_nonce:true}});
    verifyCopy(c,body,await api(`/channels/${copy.channel_id}/messages/${sent.id}`),copy.channel_id);
    await store('copyFinish',{p_id:row.id,p_claim:row.claim,p_channel:copy.channel_id,p_message:sent.id});
   }catch(e){await store('copyFinish',{p_id:row.id,p_claim:row.claim,p_channel:copy.channel_id,p_message:null}).catch(()=>{});throw e;}
  }
  row=await store('finishV2',{p_id:row.id,p_claim:row.claim});
 }catch{
  await store('finishV2',{p_id:row.id,p_claim:row.claim}).catch(()=>{});
  throw new Error('Publication could not be confirmed. Staff must inspect delivery copies before any retry.');
 }
 await api(`/channels/${c.reviewChannelId}/messages/${action.messageId}`,{method:'PATCH',body:payloadV2(c,row,{review:true})}).catch(()=>{});
 return `${row.updates_report?'Updated the previous observation':'Published the reviewed observation'}${row.notify_requested?nearbyUsers.length?' with matching nearby-member mentions and any existing area-role mention':' with an opted-in product mention in its area/Online room':' without pings'}. Game copies stay silent; nearby members who already receive the area-role mention are excluded from the shared-room mention.`;
}
export function createSubmissionHandlerV2(c,{api,store,waitUntil,now=()=>Date.now(),decorateReview,onFailure,nearbyAudience}){
 validateSubmissionConfig(c);if(!c.regions||c.regions.some(r=>r.options.length>25)||localities(c).length!==28||!c.feeds)throw new Error('Invalid locality routing config');
 const legacy=createSubmissionHandler(c,{api,store,waitUntil,now});
 const report=failureReporter(onFailure);
 const base=i=>i.application_id===c.applicationId&&i.guild_id===c.guildId&&snowflake(i.id)&&snowflake(i.member?.user?.id)&&!i.member.user.bot&&/^[A-Za-z0-9_.-]{20,300}$/u.test(i.token??'');
 const owned=(i,channel)=> (i.channel_id??i.channel?.id)===channel&&i.message?.author?.id===c.applicationId;
 const privateOwner=i=>(Number(i.message?.flags)&64)&&(!i.message.interaction_metadata?.user?.id||i.message.interaction_metadata.user.id===i.member.user.id);
 const finish=(i,action)=>{
  waitUntil((async()=>{let content;try{content=await processReviewV2(c,action,api,store,nearbyAudience);}catch(e){
   // Staff-facing refusals (not staff, repeat alert, no permission) are outcomes, not failures; held publication is.
   if(!/^(Only current|No alert sent)/u.test(e.message))report(`review:${action.notify?'notify':action.decision}`,failureStatus(e));
   content=/^(Only current|No alert sent|Publication could)/u.test(e.message)?e.message:'I could not confirm the action. Staff should inspect the review queue before retrying.';}
   await api(`/webhooks/${c.applicationId}/${i.token}/messages/@original`,{method:'PATCH',body:{content,allowed_mentions:NO_MENTIONS}}).catch(()=>report('review:reply','unavailable'));})());return json({type:5,data:{flags:64}});
 };
 return i=>{
  const id=i.data?.custom_id;if(typeof id!=='string'||!id.startsWith('c3:report:'))return null;
  if(!base(i))return privateText('Use the report controls inside Code 3 TCG.');
  if(id==='c3:report:open:local:v1'&&i.type===3&&i.data.component_type===2&&owned(i,c.inputChannelId)&&i.message.id===c.inputMessageId)return json({type:4,data:{...localityMenu(c),flags:64}});
  const region=/^c3:report:region:(seva|fredericksburg):v2$/u.exec(id);
  if(region&&i.type===3&&i.data.component_type===2&&owned(i,c.inputChannelId)&&privateOwner(i))return json({type:7,data:localityMenu(c,region[1])});
  const city=/^c3:report:city:(seva|fredericksburg):v2$/u.exec(id);
  if(city&&i.type===3&&i.data.component_type===3&&owned(i,c.inputChannelId)&&privateOwner(i)){
   const selected=i.data.values;if(!Array.isArray(selected)||selected.length!==1||!c.regions.find(r=>r.key===city[1])?.options.some(o=>o.key===selected[0]))return privateText('Choose a city from the current region.');
   const modal=submissionModal(c,'local');modal.data.custom_id=`c3:report:submit:local:${selected[0]}:v2`;modal.data.title=`Local report · ${localities(c).find(x=>x.key===selected[0]).label}`.slice(0,45);return json(modal);
  }
  const submit=/^c3:report:submit:local:([a-z-]+):v2$/u.exec(id);
  const oldSubmit=/^c3:report:submit:(local|online):v1$/u.exec(id);
  if((submit&&privateOwner(i)||oldSubmit&&i.message?.id===c.inputMessageId)&&i.type===5&&owned(i,c.inputChannelId)){
   if(submit&&!localities(c).some(x=>x.key===submit[1]))return privateText('Choose a supported city or county.');
   const time=Number((BigInt(i.id)>>22n)+1420070400000n);if(Math.abs(now()-time)>300000)return privateText('This form expired. Reopen it and try again.');
   let report;try{report={...parseSubmission(i,c,submit?'local':oldSubmit[1],time),...(submit?{locality:submit[1]}:{})};}catch(e){return privateText(e.message);}
   waitUntil((async()=>{let content;try{content=await processSubmissionV2(c,{id:i.id,userId:i.member.user.id,report},api,store,decorateReview);}catch(e){const limited=/^Please wait ten minutes/u.test(e.message);if(!limited)report('submit',failureStatus(e));content=limited?e.message:'The report could not be confirmed. Staff should inspect the review queue before you resubmit.';}await api(`/webhooks/${c.applicationId}/${i.token}/messages/@original`,{method:'PATCH',body:{content,allowed_mentions:NO_MENTIONS}}).catch(()=>report('submit:reply','unavailable'));})());return json({type:5,data:{flags:64}});
  }
  const review=/^c3:report:(approve|reject|notify):(\d{17,20})$/u.exec(id);
  if(review&&i.type===3&&i.data.component_type===2&&owned(i,c.reviewChannelId))return finish(i,{id:review[2],userId:i.member.user.id,messageId:i.message.id,decision:review[1]==='reject'?'reject':'approve',notify:review[1]==='notify'});
  return legacy(i);
 };
}
