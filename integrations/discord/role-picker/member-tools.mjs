import {NO_MENTIONS} from './submissions.mjs';
import {payloadV2,correctedEmbed} from './submissions-v2.mjs';
import {failureReporter,failureStatus} from './events.mjs';
const snowflake=x=>typeof x==='string'&&/^\d{17,20}$/u.test(x);
const json=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
const reply=(content,components=[])=>json({type:4,data:{content,components,flags:64,allowed_mentions:NO_MENTIONS}});
const safe=x=>String(x??'').replace(/@/gu,'@\u200b').replace(/[\\`*_{}\[\]()<>|~]/gu,'\\$&');
export const REJECTION_REASONS={duplicate:'Duplicate observation',stale:'Observation is too old',missing_details:'Missing public product/store details',not_observed:'Not a personal observation',unsafe:'Private or unsafe information'};
export const CASE_REASONS={correction:{inaccurate:'Incorrect information',sold_out:'No longer available',wrong_location:'Wrong public location',unsafe:'Private or unsafe content'},privacy:{access:'Ask about my saved data',removal:'Request removal of my data',question:'Privacy question'},appeal:{review_decision:'Review a staff decision',false_positive:'Possible filter mistake',other:'Other moderation concern'},safety:{harassment:'Harassment or threats',pressure:'Pressure, coercion or a scam attempt',impersonation:'Impersonation or fake staff',unsafe_content:'Unsafe or private content was posted',other:'Other safety concern'}};
// 'corrected' is offered only on correction cases; the database enforces the same rule (prioritized IMP128).
export const RESOLUTIONS={reviewed:'Reviewed',needs_owner:'Escalated to owner',declined:'Declined after review',corrected:'Confirmed — mark report corrected'};
const TITLES={privacy:'Private privacy request',correction:'Request a report correction',appeal:'Private moderation appeal',safety:'Private safety concern'};
const COMMAND_KINDS={'correct-report':'correction','privacy-request':'privacy',appeal:'appeal','safety-concern':'safety'};
const label=(text,component)=>({type:18,label:text,component});
export function caseModal(kind){
 if(!Object.hasOwn(CASE_REASONS,kind))throw new Error('Unknown case kind');
 const components=[label(kind==='safety'?'What happened?':'What would you like staff to review?',{type:3,custom_id:'reason',min_values:1,max_values:1,required:true,options:Object.entries(CASE_REASONS[kind]).map(([value,label])=>({value,label}))})];
 if(kind!=='privacy')components.push(label(kind==='correction'?'Report reference':kind==='safety'?'Message or member reference (optional)':'Message/report reference (optional)',{type:4,custom_id:'subject',style:1,required:kind==='correction',min_length:17,max_length:20,placeholder:'Numeric reference only'}),label(kind==='safety'?'Brief context (optional)':'Brief public context (optional)',{type:4,custom_id:'note',style:2,required:false,max_length:300,placeholder:kind==='safety'?'Where it happened and what was said. No screenshots or private details; staff can ask privately.':'No passwords, receipts, private addresses, or account details.'}));
 return {type:9,data:{custom_id:`c3:case:submit:${kind}:v1`,title:TITLES[kind],components}};
}
export function parseCase(i,kind){
 const fields=new Map();if(!Array.isArray(i.data.components)||i.data.components.length!==(kind==='privacy'?1:3))throw new Error('Reopen the request form.');
 for(const row of i.data.components){const f=row.component;if(row.type!==18||!f||fields.has(f.custom_id)||!['reason','subject','note'].includes(f.custom_id))throw new Error('Invalid request fields.');
  if(f.custom_id==='reason'){if(f.type!==3||!Array.isArray(f.values)||f.values.length!==1)throw new Error('Choose a reason.');fields.set(f.custom_id,f.values[0]);}
  else{if(f.type!==4||typeof f.value!=='string')throw new Error('Invalid request field.');fields.set(f.custom_id,f.value.trim().normalize('NFKC'));}}
 const reason=fields.get('reason'),subject=fields.get('subject')||null,note=fields.get('note')||'';
 if(!Object.hasOwn(CASE_REASONS[kind]??{},reason)||subject&&!snowflake(subject)||kind==='correction'&&!subject||note.length>300||/[\u0000-\u001f\u007f]/u.test(note)||/\b(password|bot token|api key|session token)\s*[:=]/iu.test(note))throw new Error('Use a numeric reference and short public context. Keep credentials and private details out.');
 return {kind,subject,reason,note};
}
export function memberStore(url,key,{fetchImpl=fetch}={}){
 if(url!=='https://gxsfququorfczvhrkudl.supabase.co'||!key)throw new Error('Member tools unavailable');
 const methods={receipt:'code3_member_receipt',withdraw:'code3_member_withdraw',caseSubmit:'code3_member_case_submit',caseQueue:'code3_member_case_queue',caseResolve:'code3_member_case_resolve',reject:'code3_report_review_reason',queue:'code3_review_queue',history:'code3_review_history',context:'code3_report_context'};
 return async(method,args={})=>{
  if(!Object.hasOwn(methods,method))throw new Error('Member operation is not allowed');
  const r=await fetchImpl(`${url}/rest/v1/rpc/${methods[method]}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
  if(!r.ok)throw new Error('Request unavailable; inspect its saved reference before retrying.');const text=await r.text();return text?JSON.parse(text):null;
 };
}
export async function requireStaff(c,id,api){
 const m=await api(`/guilds/${c.guildId}/members/${id}`);
 if(m.user?.id!==id||m.user.bot||!Array.isArray(m.roles)||id!==c.ownerId&&!m.roles.some(r=>c.staffRoleIds.includes(r)))throw new Error('Only current Code 3 staff can use this control.');
}
export function casePayload(c,row){
 const descriptions={privacy:'A private request for staff follow-up. This control never deletes data or confirms that a removal occurred.',safety:'A private safety concern. Review the referenced message or member, follow the incident playbook, and reply to the member privately. Resolving here records the outcome only; it does not remove content or apply a moderation action.',correction:'Review the reference and public context. "Confirmed — mark report corrected" adds a visible correction notice to every published copy of that report; the other resolutions change nothing publicly.'};
 const options=Object.entries(RESOLUTIONS).filter(([value])=>value!=='corrected'||row.kind==='correction').map(([value,label])=>({value,label}));
 return {content:'',allowed_mentions:NO_MENTIONS,embeds:[{title:`${row.is_test?'TEST — ':''}Private ${row.kind} request`,color:row.kind==='safety'?0xB91C1C:0xD4AF37,description:descriptions[row.kind]??'Review the reference and public context. Resolving this request does not automatically edit alerts or change a moderation decision.',fields:[{name:'Reference',value:row.id},{name:'Requester',value:safe(row.requester)},{name:'Reason',value:safe(CASE_REASONS[row.kind]?.[row.reason]??row.reason)},{name:'Related reference',value:row.subject??'None'},{name:row.kind==='safety'?'Context':'Public context',value:safe(row.note)||'None supplied'},{name:'State',value:row.state+(row.resolution?` · ${RESOLUTIONS[row.resolution]}`:'')}],footer:{text:'Private staff record • no pings • no automated member action'}}],components:['open','escalated'].includes(row.state)?[{type:1,components:[{type:3,custom_id:`c3:case:resolve:${row.id}:v1`,placeholder:'Staff resolution',min_values:1,max_values:1,options}]}]:[]};
}
/**
 * Edit every published copy of a corrected report so the correction is visible wherever it was
 * distributed (prioritized IMP128). Runs only after the database reports the case actually transitioned.
 * Each copy's live embed is transformed in place, so a later sold-out update on that message survives;
 * content is kept verbatim and nothing is re-mentioned. Already-corrected copies are left alone.
 */
export async function markCorrected(c,row,api,reportStore){
 if(row.kind!=='correction'||row.resolution!=='corrected'||row.transitioned!==true||!snowflake(row.subject))return 'No published report was changed.';
 const report=await reportStore('get',{p_id:row.subject});
 if(!report||report.state!=='published'||report.is_test)return 'No published report was changed; the referenced report is not published.';
 const copies=(await reportStore('copies',{p_id:row.subject}))??[];
 if(!copies.length)return `No delivery copies are recorded for report ${row.subject} (older reports predate per-copy records), so its published message needs a manual correction edit.`;
 let done=0,already=0;const failed=[];
 const reason=CASE_REASONS.correction[row.reason]??row.reason;
 for(const copy of copies){
  if(!snowflake(copy.channel_id)||!snowflake(copy.message_id)){failed.push(copy.channel_id);continue;}
  try{
   const old=await api(`/channels/${copy.channel_id}/messages/${copy.message_id}`);
   if(old.author?.id!==c.applicationId||old.channel_id!==copy.channel_id||!old.embeds?.[0])throw new Error('Not a bot-owned copy');
   const {embed,changed}=correctedEmbed(old.embeds[0],{reason,reportId:row.subject});
   if(!changed){already++;continue;}
   const saved=await api(`/channels/${copy.channel_id}/messages/${copy.message_id}`,{method:'PATCH',body:{content:old.content??'',embeds:[embed],components:[],allowed_mentions:NO_MENTIONS}});
   if(!saved.embeds?.[0]?.title?.startsWith('CORRECTED · ')||saved.mention_everyone||saved.mentions?.length)throw new Error('Correction readback mismatch');
   done++;
  }catch{failed.push(copy.channel_id);}
 }
 return `Correction notice added to ${done} of ${copies.length} published copies${already?` (${already} already marked)`:''}${failed.length?`; ${failed.length} could not be updated and need a manual look`:''}. Report ${row.subject} stays in the history as corrected.`;
}
export function queueText(q){
 const counts=q.counts??{},rows=(q.reports??[]).map(r=>`\`${r.id}\` · ${r.state} · observation ${r.observation_age_minutes}m old${r.observation_age_minutes>=1200?' · NEAR 24H EXPIRY':''}${Number(r.possible_duplicates)>0?` · ${r.possible_duplicates} possible duplicate(s)`:''}`);
 return `Checked ${q.checkedAt}\nQueued: ${counts.queued??0}; held: ${counts.held??0}; waiting over 30m: ${counts.waiting_over_30m??0}; near expiry: ${counts.near_expiry??0}.\nOpen private requests: ${q.open_cases??0}.\n\n${rows.join('\n')||'No pending reports.'}\n\nUp to 15 oldest report references. Inspect held deliveries before retrying. Possible duplicates need staff judgment.`.slice(0,1900);
}
export function decorateReview(row,body,now=Date.now()){
 const minutes=Math.max(0,Math.floor((now-Date.parse(row.report.observedAt))/60000));
 const duplicates=typeof row.possible_duplicates==='number'?`${row.possible_duplicates} matching public product/store observations in the last 24 hours; inspect before approving.`:'Check unavailable; inspect /review-queue before approving.';
 body.embeds[0].fields.push({name:'Freshness',value:`${minutes} minutes old${minutes>=1200?' · approaching 24-hour limit':''}`},{name:'Possible duplicates',value:duplicates});
 if(minutes>=1200)body.embeds[0].color=0xF59E0B;return body;
}
export async function submitCase(c,action,api,store){
 const saved=await store('caseSubmit',{p_id:action.id,p_member:action.userId,p_kind:action.kind,p_subject:action.subject,p_reason:action.reason,p_note:action.note});
 if(saved.created){const row=saved.case;try{
  const body=casePayload(c,row),sent=await api(`/channels/${c.reviewChannelId}/messages`,{method:'POST',body:{...body,nonce:`c${row.id}`,enforce_nonce:true}});
  const got=await api(`/channels/${c.reviewChannelId}/messages/${sent.id}`);
  if(got.author?.id!==c.applicationId||got.channel_id!==c.reviewChannelId||got.mention_everyone||got.mentions?.length||got.mention_roles?.length||got.embeds?.[0]?.fields?.[0]?.value!==row.id)throw new Error('Case receipt mismatch');
  await store('caseQueue',{p_id:row.id,p_message:sent.id});
 }catch{await store('caseQueue',{p_id:row.id,p_message:null}).catch(()=>{});throw new Error(`Request ${row.id} was saved but delivery needs staff attention. Do not resubmit.`);}}
 if(action.kind==='safety')return `Saved private safety concern \`${saved.case.id}\`. Only staff can see it; nobody was notified publicly. Staff will follow up with you privately, and you can check /case-status with this reference. You can also block or report the account through Discord itself at any time.`;
 return `Saved private ${action.kind} request \`${saved.case.id}\`. Use /case-status with this reference. Staff review is required; nothing was deleted or changed automatically.`;
}
export function createMemberToolsHandler(c,{api,store,reportStore,waitUntil,now=()=>Date.now(),onFailure}){
 const report=failureReporter(onFailure);
 const base=i=>i.application_id===c.applicationId&&i.guild_id===c.guildId&&snowflake(i.id)&&snowflake(i.member?.user?.id)&&!i.member.user.bot&&/^[A-Za-z0-9_.-]{20,300}$/u.test(i.token??'');
 const privateOwner=i=>(Number(i.message?.flags)&64)&&(!i.message.interaction_metadata?.user?.id||i.message.interaction_metadata.user.id===i.member.user.id)&&(!i.message.interaction?.user?.id||i.message.interaction.user.id===i.member.user.id);
 const owned=(i,channel)=>(i.channel_id??i.channel?.id)===channel&&i.message?.author?.id===c.applicationId;
 // Stage labels are command names or custom_id prefixes from our own allowlists — never member input.
 const stageOf=i=>`member:${(i.type===2?i.data?.name:String(i.data?.custom_id??'').split(':').slice(1,3).filter(t=>!/^\d+$/u.test(t)).join('-'))||'unknown'}`;
 const complete=(i,fn)=>{waitUntil((async()=>{let result;try{result=await fn();}catch(e){const expected=/^(Only current|Request \d)/u.test(e.message);if(!expected)report(stageOf(i),failureStatus(e));result=expected?e.message:'The action could not be confirmed. Staff should inspect its reference before you retry.';}const data=typeof result==='string'?{content:result}:result;await api(`/webhooks/${c.applicationId}/${i.token}/messages/@original`,{method:'PATCH',body:{...data,allowed_mentions:NO_MENTIONS}}).catch(()=>report(`${stageOf(i)}:reply`,'unavailable'));})());return json({type:5,data:{flags:64}});};
 return i=>{
  const name=i.type===2?i.data?.name:null,id=i.data?.custom_id;
  const commands=['report-status','withdraw-report','correct-report','privacy-request','appeal','safety-concern','case-status','review-queue','review-history'];
  const reject=typeof id==='string'&&/^c3:report:reject:\d{17,20}$/u.test(id);
  if(!commands.includes(name)&&!reject&&!(typeof id==='string'&&/^c3:(case:|withdraw:|reject-reason:)/u.test(id)))return null;
  if(!base(i))return reply('Use these private controls inside Code 3 TCG.');
  const user=i.member.user.id,options=i.data?.options??[],option=n=>options.find(o=>o.name===n)?.value;
  if(name&&commands.includes(name)&&c.memberCommands?.[name]!==i.data.id)return reply('Use the current Code 3 command.');
  if(Object.hasOwn(COMMAND_KINDS,name??''))return json(caseModal(COMMAND_KINDS[name]));
  if(['report-status','withdraw-report','case-status'].includes(name)){
   const reference=option('reference');if(!snowflake(reference))return reply('Enter the numeric reference.');
   return complete(i,async()=>{const row=await store('receipt',{p_reference:reference,p_member:user,p_kind:name==='case-status'?'case':'report'});if(!row)return 'No matching reference is available for your account.';
    if(name==='withdraw-report')return row.can_withdraw?{content:`Withdraw your queued report \`${row.id}\`? It will remain in the private history and cannot publish. This does not remove published messages.`,components:[{type:1,components:[{type:2,style:4,custom_id:`c3:withdraw:${row.id}:${user}:v1`,label:'Confirm withdrawal'}]}]}:'This report can no longer be withdrawn before publication. Use /privacy-request for a removal request.';
    return `Reference \`${row.id}\`: **${safe(row.state.replaceAll('_',' '))}**${row.reason?` · ${safe(row.reason.replaceAll('_',' '))}`:''}. Updated ${row.updated_at}. Only your own record is shown.`;
   });
  }
  if(name==='review-queue'||name==='review-history')return complete(i,async()=>{await requireStaff(c,user,api);if(name==='review-queue')return queueText(await store('queue',{}));const reference=option('reference');if(!snowflake(reference))return 'Enter a numeric reference.';const rows=await store('history',{p_reference:reference});return rows.length?rows.map(r=>`${r.created_at} · ${safe(r.actor??'system')} · ${safe(r.action)}${r.reason?` · ${safe(r.reason)}`:''}`).join('\n').slice(0,1900):'No recorded history for this reference.';});
  const withdraw=/^c3:withdraw:(\d{17,20}):(\d{17,20}):v1$/u.exec(id??'');
  if(withdraw&&i.type===3&&i.data.component_type===2&&privateOwner(i)&&i.message?.author?.id===c.applicationId&&withdraw[2]===user)return complete(i,async()=>{const row=await store('withdraw',{p_id:withdraw[1],p_member:user});if(!row)return 'No matching reference is available for your account.';
   if(row.state==='withdrawn'){const old=await reportStore('get',{p_id:row.id});if(old?.review_message)await api(`/channels/${c.reviewChannelId}/messages/${old.review_message}`,{method:'PATCH',body:payloadV2(c,old,{review:true})}).catch(()=>{});}
   return `Report \`${row.id}\` is ${safe(row.state)}. Nothing was posted by this action.`;
  });
  const submit=/^c3:case:submit:(correction|privacy|appeal|safety):v1$/u.exec(id??'');
  if(submit&&i.type===5){let action;try{action=parseCase(i,submit[1]);}catch(e){return reply(e.message);}const timestamp=Number((BigInt(i.id)>>22n)+1420070400000n);if(Math.abs(now()-timestamp)>300000)return reply('This form expired. Reopen the command.');return complete(i,()=>submitCase(c,{...action,id:i.id,userId:user},api,store));}
  const resolve=/^c3:case:resolve:(\d{17,20}):v1$/u.exec(id??'');
  if(resolve&&i.type===3&&i.data.component_type===3&&owned(i,c.reviewChannelId)&&i.data.values?.length===1&&Object.hasOwn(RESOLUTIONS,i.data.values[0]))return complete(i,async()=>{await requireStaff(c,user,api);const row=await store('caseResolve',{p_id:resolve[1],p_message:i.message.id,p_staff:user,p_resolution:i.data.values[0]});await api(`/channels/${c.reviewChannelId}/messages/${i.message.id}`,{method:'PATCH',body:casePayload(c,row)}).catch(()=>{});
   const corrected=i.data.values[0]==='corrected'&&row.resolution==='corrected'?` ${await markCorrected(c,row,api,reportStore).catch(()=>'The correction notice could not be confirmed on the published copies; inspect them before retrying.')}`:'';
   return `Request ${row.id}: ${row.state}.${corrected} A recorded resolution does not itself delete data or reverse a moderation action.`;});
  if(reject&&i.type===3&&i.data.component_type===2&&owned(i,c.reviewChannelId))return complete(i,async()=>{await requireStaff(c,user,api);return {content:'Choose a rejection reason. Nothing has been rejected yet.',components:[{type:1,components:[{type:3,custom_id:`c3:reject-reason:${id.split(':').at(-1)}:${i.message.id}:v1`,min_values:1,max_values:1,options:Object.entries(REJECTION_REASONS).map(([value,label])=>({value,label}))}]}]};});
  const reason=/^c3:reject-reason:(\d{17,20}):(\d{17,20}):v1$/u.exec(id??'');
  if(reason&&i.type===3&&i.data.component_type===3&&privateOwner(i)&&owned(i,c.reviewChannelId)&&i.data.values?.length===1&&Object.hasOwn(REJECTION_REASONS,i.data.values[0]))return complete(i,async()=>{await requireStaff(c,user,api);const result=await store('reject',{p_id:reason[1],p_message:reason[2],p_staff:user,p_reason:i.data.values[0]});if(result.claimed)await api(`/channels/${c.reviewChannelId}/messages/${reason[2]}`,{method:'PATCH',body:payloadV2(c,result.report,{review:true})}).catch(()=>{});return result.claimed?'Report rejected with a private recorded reason. The submitter can check /report-status. No DM or alert was sent.':`Report is already ${safe(result.report.state)}. No additional decision occurred.`;});
  return reply('Use the current private request or staff controls.');
 };
}
