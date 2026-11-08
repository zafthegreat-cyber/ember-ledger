// Receives parsed interactions only after core.mjs verifies Discord's signature.
export const NO_MENTIONS={parse:[],users:[],roles:[],replied_user:false};
const snowflake=v=>typeof v==='string'&&/^\d{17,20}$/u.test(v);
const respond=(content)=>new Response(JSON.stringify({type:4,data:{content,flags:64,allowed_mentions:NO_MENTIONS}}),{headers:{'Content-Type':'application/json'}});
const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const safe=v=>String(v).replace(/@/gu,'@\u200b').replace(/[\\`*_{}\[\]()<>|~]/gu,'\\$&');
export const STATUSES=Object.freeze({stock:'Stock observed',preorder:'Preorder observed',backorder:'Backorder observed',empty:'Out of stock observed'});

export function validateSubmissionConfig(c) {
  if(![c.applicationId,c.guildId,c.inputChannelId,c.inputMessageId,c.reviewChannelId,c.localChannelId,c.onlineChannelId,c.testChannelId,c.ownerId,...c.staffRoleIds].every(snowflake)||new Set([c.inputChannelId,c.reviewChannelId,c.localChannelId,c.onlineChannelId,c.testChannelId]).size!==5)throw new Error('Invalid submission destinations.');
  if(c.products.length<1||c.products.length>25||new Set(c.products.map(p=>p.key)).size!==c.products.length||c.products.some(p=>! /^[a-z0-9-]{1,30}$/u.test(p.key)||!p.label||p.label.length>100))throw new Error('Invalid submission products.');
  return c;
}

export function submissionModal(c,kind) {
  if(!['local','online'].includes(kind))throw new Error('Invalid report type.');
  const label=(name,component,description)=>({type:18,label:name,...(description?{description}:{}),component});
  const text=(id,max,placeholder)=>({type:4,custom_id:id,style:1,min_length:1,max_length:max,required:true,placeholder});
  return {type:9,data:{custom_id:`c3:report:submit:${kind}:v1`,title:kind==='local'?'Report a local restock':'Report online availability',components:[
    label('Product category',{type:3,custom_id:'category',min_values:1,max_values:1,required:true,options:c.products.map(p=>({label:p.label,value:p.key}))}),
    label('Product name',text('product',180,'Set name and product, e.g. booster bundle')),
    label(kind==='local'?'Retailer and public store location':'Public retailer product link',text('store',300,kind==='local'?'Target — Greenbrier, Chesapeake, VA':'https://retailer.com/product/...'),'Public details only. Staff review before publication.'),
    label('What did you observe?',{type:3,custom_id:'status',min_values:1,max_values:1,required:true,options:Object.entries(STATUSES).map(([value,label])=>({label,value}))}),
    label('How many minutes ago?',text('minutes',4,'0 = now; 15 = 15 minutes ago; maximum 1440'),'Report only what you personally saw within the past 24 hours.'),
  ]}};
}

export function parseSubmission(i,c,kind,now=Date.now()) {
  if(!['local','online'].includes(kind)||!Array.isArray(i.data.components)||i.data.components.length!==5)throw new Error('Complete all five fields.');
  const fields=new Map();
  for(const row of i.data.components) {
    const v=row.type===18?row.component:null;
    if(!v||fields.has(v.custom_id)||!['category','product','store','status','minutes'].includes(v.custom_id))throw new Error('Reopen the form and complete all five fields.');
    const select=['category','status'].includes(v.custom_id);
    if(select?(v.type!==3||!Array.isArray(v.values)||v.values.length!==1||typeof v.values[0]!=='string'):(v.type!==4||typeof v.value!=='string'))throw new Error('Invalid form field.');
    fields.set(v.custom_id,select?v.values[0]:v.value.trim().normalize('NFKC'));
  }
  const category=fields.get('category'),status=fields.get('status'),product=fields.get('product'),store=fields.get('store'),minutes=fields.get('minutes');
  if(!c.products.some(p=>p.key===category)||!Object.hasOwn(STATUSES,status))throw new Error('Choose a category and observed status.');
  if(!product||product.length>180||!store||store.length>300||/[\u0000-\u001f\u007f]/u.test(product+store))throw new Error('Use a short product name and public store or link.');
  if(!/^\d{1,4}$/u.test(minutes)||Number(minutes)>1440)throw new Error('Minutes ago must be a number from 0 to 1440.');
  let publicStore=store;
  if(kind==='online') {
    let u;try{u=new URL(store);}catch{throw new Error('Enter the public HTTPS product link.');}
    if(u.protocol!=='https:'||u.username||u.password||u.port||! /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/iu.test(u.hostname)||/\.(local|internal|localhost)$/iu.test(u.hostname)||[...u.searchParams.keys()].some(k=>/token|auth|secret|password|session|email|signature|api.?key/iu.test(k)))throw new Error('Use a public retailer product link without account or sign-in details.');
    u.hash='';publicStore=u.href;
    if(publicStore.length>300)throw new Error('Use a shorter public product link.');
  }
  return {kind,category,product,store:publicStore,status,observedAt:new Date(now-Number(minutes)*60_000).toISOString()};
}

export function reportPayload(c,row,{review=false,state=row.state}={}) {
  const p=row.report,category=c.products.find(x=>x.key===p.category)?.label;
  if(!category||!Object.hasOwn(STATUSES,p.status)||!['local','online'].includes(p.kind)||!Number.isFinite(Date.parse(p.observedAt)))throw new Error('Invalid stored report.');
  const title=`${row.is_test?'TEST — ':''}${review?'Restock submission':'Reviewed community observation'}`;
  const fields=[{name:'Category',value:category},{name:'Product',value:safe(p.product)},{name:p.kind==='local'?'Public store':'Retailer product link',value:safe(p.store)},{name:'Reported status',value:STATUSES[p.status]},{name:'Observed',value:`<t:${Math.floor(Date.parse(p.observedAt)/1000)}:F>`},{name:'Source',value:p.kind==='local'?'Member observation in a public store':'Member observation on a retailer page'}];
  if(review)fields.push({name:'Review status',value:state},{name:'Submitted by',value:safe(row.submitter)},{name:'Submission reference',value:row.id});
  else fields.push({name:'Code 3 TCG',value:'https://code3tcg.app/'});
  const pending=review&&state==='queued';
  return {content:'',allowed_mentions:NO_MENTIONS,embeds:[{title,color:review?0xD4AF37:0x800020,description:row.is_test?'Synthetic delivery test. This is not a real stock report.':review?'Check the public details and freshness before approving. Approval posts without role pings.':'Staff-reviewed community report; availability has not been independently verified by the retailer.',fields,footer:{text:review?'Staff only • no role pings • reports older than 24 hours cannot publish':'Stock can change. Confirm with the retailer before traveling.'},timestamp:p.observedAt}],components:pending?[{type:1,components:[{type:2,style:3,custom_id:`c3:report:approve:${row.id}`,label:row.is_test?'Approve TEST to #alert-test':'Approve & post (no ping)'},{type:2,style:4,custom_id:`c3:report:reject:${row.id}`,label:'Reject'}]}]:[]};
}

export function destination(c,row) {return row.is_test?c.testChannelId:row.report.kind==='online'?c.onlineChannelId:c.localChannelId;}
export function verifyReportMessage(c,row,payload,message,channelId) {
  const expected=payload.embeds[0],actual=message.embeds?.[0];
  const fields=e=>(e?.fields??[]).map(({name,value})=>({name,value}));
  if(!snowflake(message.id)||message.channel_id!==channelId||message.author?.id!==c.applicationId||message.content!==''||message.mention_everyone||message.mentions?.length||message.mention_roles?.length||actual?.title!==expected.title||actual?.description!==expected.description||JSON.stringify(fields(actual))!==JSON.stringify(fields(expected)))throw new Error('Report receipt did not match. Staff must inspect delivery.');
  return message.id;
}
export async function sendReport(c,row,api,{review=false}={}) {
  const channelId=review?c.reviewChannelId:destination(c,row);
  const channel=await api(`/channels/${channelId}`);
  if(channel.guild_id!==c.guildId||channel.type!==0)throw new Error('Unexpected report destination.');
  const payload=reportPayload(c,row,{review,state:review?'queued':row.state});
  const nonce=`${review?'r':'p'}${row.id}`;
  const sent=await api(`/channels/${channelId}/messages`,{method:'POST',body:{...payload,nonce,enforce_nonce:true}});
  const saved=await api(`/channels/${channelId}/messages/${sent.id}`);
  verifyReportMessage(c,row,payload,saved,channelId);
  return {messageId:saved.id,channelId};
}

// Only the bot token goes to Discord; interaction response tokens never get bot auth.
export function submissionDiscord(c,token,{fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
  const channels=[c.inputChannelId,c.reviewChannelId,c.localChannelId,c.onlineChannelId,c.testChannelId,...(c.regions??[]).flatMap(r=>r.options.map(o=>o.channelId)),...Object.values(c.feeds??{}),c.sourceHealthChannelId,c.calendarChannelId].filter(Boolean);
  if(!/^[A-Za-z0-9_.-]{30,300}$/u.test(token??''))throw new Error('Bot secret unavailable.');
  return async(route,{method='GET',body}={})=>{
    const member=new RegExp(`^/guilds/${c.guildId}/members/\\d{17,20}$`);
    const ch=/^\/channels\/(\d{17,20})(?:\/messages(?:\/(\d{17,20}))?)?$/u.exec(route);
    const hook=new RegExp(`^/webhooks/${c.applicationId}/[A-Za-z0-9_.-]{20,300}/messages/@original$`).test(route);
    const identity=route==='/users/@me'||route===`/guilds/${c.guildId}/roles`;
    if(!((member.test(route)||identity)&&method==='GET')&&!(ch&&channels.includes(ch[1])&&(method==='GET'||method==='PATCH'&&ch[2]||method==='POST'&&!ch[2]&&route.endsWith('/messages')))&&!(hook&&method==='PATCH'))throw new Error('Report route is not allowed.');
    for(let n=0;n<3;n++) {
      let r;try{r=await fetchImpl(`https://discord.com/api/v10${route}`,{method,redirect:'error',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json',...(hook?{}:{Authorization:`Bot ${token}`})},...(body?{body:JSON.stringify(body)}:{})});}catch{throw new Error('Discord report delivery is uncertain.');}
      if(r.status===429&&n<2){const delay=Number((await r.json()).retry_after);if(!Number.isFinite(delay)||delay<0||delay>3)throw new Error('Discord is busy.');await sleep(delay*1000+100);continue;}
      if(hook&&r.status===404&&n<2){await sleep(300*(n+1));continue;}
      if(!r.ok)throw new Error(`Discord report request failed (${r.status}).`);
      return r.status===204?null:r.json();
    }
  };
}

export function reportStore(url,key,{fetchImpl=fetch}={}) {
  if(url!=='https://gxsfququorfczvhrkudl.supabase.co'||!key)throw new Error('Report store unavailable.');
  const methods={submit:'submit',queue:'queue',review:'review',finish:'finish',get:'get',plan:'plan',copyClaim:'copy_claim',copyFinish:'copy_finish',finishV2:'finish_v2',copies:'copies',recentAlert:'recent_alert'};
  return async(method,body)=>{
    if(!Object.hasOwn(methods,method))throw new Error('Invalid report operation.');
    let r;try{r=await fetchImpl(`${url}/rest/v1/rpc/code3_report_${methods[method]}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json',apikey:key,Authorization:`Bearer ${key}`},body:JSON.stringify(body)});}catch{throw new Error('Report store unavailable.');}
    if(!r.ok){const error=await r.json().catch(()=>({}));if(error.message==='report_rate_limit')throw new Error('Please wait ten minutes before submitting more reports.');throw new Error('Report could not be confirmed.');}
    const text=await r.text();return text?JSON.parse(text):null;
  };
}

export async function processSubmission(c,action,api,store) {
  const result=await store('submit',{p_id:action.id,p_submitter:action.userId,p_report:action.report,p_is_test:false});
  const row=result.report;
  if(!result.created)return 'This report was already received. Staff will review it.';
  try{
    const receipt=await sendReport(c,row,api,{review:true});
    await store('queue',{p_id:row.id,p_message:receipt.messageId});
  }catch{
    // A failed send may have reached Discord. Never automatically re-post it.
    await store('queue',{p_id:row.id,p_message:null}).catch(()=>{});
    throw new Error('Your report was saved, but its review delivery needs staff attention. Please do not resubmit it.');
  }
  return 'Submitted to the Code 3 TCG staff review queue. Nothing has been posted as an alert yet. Thank you!';
}

export async function processReview(c,action,api,store) {
  const member=await api(`/guilds/${c.guildId}/members/${action.userId}`);
  if(member.user?.id!==action.userId||member.user.bot||!Array.isArray(member.roles)||action.userId!==c.ownerId&&!c.staffRoleIds.some(id=>member.roles.includes(id)))throw new Error('Only current Code 3 staff can review reports.');
  const claim=await store('review',{p_id:action.id,p_message:action.messageId,p_staff:action.userId,p_decision:action.decision});
  let row=claim.report;
  if(!claim.claimed)return `This report is ${row.state.replaceAll('_',' ')}. No additional alert was sent.`;
  let notice='Report rejected. No alert was posted.';
  if(action.decision==='approve') {
    try{
      const receipt=await sendReport(c,row,api);
      row=await store('finish',{p_id:row.id,p_claim:row.claim,p_message:receipt.messageId});
      notice=`Report posted without pings: https://discord.com/channels/${c.guildId}/${receipt.channelId}/${receipt.messageId}`;
    }catch{
      await store('finish',{p_id:row.id,p_claim:row.claim,p_message:null}).catch(()=>{});
      throw new Error('Publication could not be confirmed. Staff must inspect the destination before any retry.');
    }
  }
  // The durable review state prevents duplicate publication even if this edit fails.
  await api(`/channels/${c.reviewChannelId}/messages/${action.messageId}`,{method:'PATCH',body:reportPayload(c,row,{review:true})}).catch(()=>{});
  return notice;
}

export function createSubmissionHandler(c,{api,store,waitUntil,now=()=>Date.now()}) {
  validateSubmissionConfig(c);
  const base=i=>i.application_id===c.applicationId&&i.guild_id===c.guildId&&snowflake(i.id)&&snowflake(i.member?.user?.id)&&!i.member.user.bot&&/^[A-Za-z0-9_.-]{20,300}$/u.test(i.token??'');
  const ownedMessage=(i,channelId)=> (i.channel_id??i.channel?.id)===channelId&&i.message?.author?.id===c.applicationId;
  async function complete(i,action) {
    let content;
    try{content=action.decision?await processReview(c,action,api,store):await processSubmission(c,action,api,store);}catch(e){
      const allowed=['Please wait ten minutes before submitting more reports.','Your report was saved, but its review delivery needs staff attention. Please do not resubmit it.','Only current Code 3 staff can review reports.','Publication could not be confirmed. Staff must inspect the destination before any retry.'];
      content=allowed.includes(e.message)?e.message:'I could not confirm the report action. Staff can check the review queue before you try again.';
      console.warn('restock_submission_failed',action.decision??'submit');
    }
    try{await api(`/webhooks/${c.applicationId}/${i.token}/messages/@original`,{method:'PATCH',body:{content,allowed_mentions:NO_MENTIONS}});}catch{console.warn('restock_submission_reply_failed');}
  }
  return i=>{
    const id=i.data?.custom_id;if(typeof id!=='string'||!id.startsWith('c3:report:'))return null;
    if(!base(i))return respond('Use the restock submission buttons in Code 3 TCG.');
    const open=/^c3:report:open:(local|online):v1$/u.exec(id);
    if(open&&i.type===3&&i.data.component_type===2&&ownedMessage(i,c.inputChannelId)&&i.message.id===c.inputMessageId)return response(submissionModal(c,open[1]));
    const submit=/^c3:report:submit:(local|online):v1$/u.exec(id);
    let action;
    if(submit&&i.type===5&&ownedMessage(i,c.inputChannelId)&&i.message.id===c.inputMessageId){
      const submittedAt=Number((BigInt(i.id)>>22n)+1420070400000n);
      if(Math.abs(now()-submittedAt)>300_000)return respond('This form submission expired. Reopen the form and try again.');
      try{action={id:i.id,userId:i.member.user.id,report:parseSubmission(i,c,submit[1],submittedAt)};}catch(e){return respond(e.message);}
    }else{
      const review=/^c3:report:(approve|reject):(\d{17,20})$/u.exec(id);
      if(!review||i.type!==3||i.data.component_type!==2||!ownedMessage(i,c.reviewChannelId)||!snowflake(i.message.id))return respond('Use the current submission or staff review buttons.');
      action={id:review[2],decision:review[1],messageId:i.message.id,userId:i.member.user.id};
    }
    waitUntil(complete(i,action));
    return response({type:5,data:{flags:64}});
  };
}
