const noMentions={parse:[],users:[],roles:[],replied_user:false};
const json=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
const reply=content=>json({type:4,data:{content,flags:64,allowed_mentions:noMentions}});
export function sourceHealthPayload(health){
 const lines=(health.sources??[]).map(s=>`**${s.id}: ${s.paused||s.locked_paused?'PAUSED':'enabled'}${s.locked_paused?' (locked)':''}**\n${s.pause_reason}\nLast attempt: ${s.last_attempt_at??'never polled'}\nLast success: ${s.last_success_at??'none'}\nLast error: ${s.last_error_at??'none'}${s.error_code?` (${s.error_code})`:''}\nConsecutive failures: ${s.consecutive_errors??0}\nNext eligible attempt: ${s.next_attempt_at??'none scheduled by backoff'}\nLast run: ${s.checked??0} observations; ${s.sent??0} alerts`);
 return {content:'',allowed_mentions:noMentions,embeds:[{title:'Retailer source health',color:0xD4AF37,description:`Checked ${health.checkedAt}\n\n${lines.join('\n\n')}\n\n**Schedules**\n${(health.schedules??[]).map(j=>`${j.name}: ${j.active?'active':'paused'} (${j.schedule})`).join('\n')}\n\nMaintenance only removes expired retailer cache/posts; it never checks inventory.`,footer:{text:'Private staff status • no credentials or product data'}}],components:[{type:1,components:[{type:2,style:2,custom_id:'c3:source:status:v1',label:'Refresh status'},{type:2,style:4,custom_id:'c3:source:pause:bestbuy:v1',label:'Keep Best Buy paused'}]}]};
}
export function sourceStore(url,key,{fetchImpl=fetch}={}){
 if(url!=='https://gxsfququorfczvhrkudl.supabase.co'||!key)throw new Error('Source status unavailable');
 return async(method,args={})=>{
  const names={health:'code3_source_health',pause:'code3_source_pause'};if(!Object.hasOwn(names,method)||method==='pause'&&(args.p_source!=='bestbuy'||args.p_paused!==true))throw new Error('Source operation is not allowed');
  const r=await fetchImpl(`${url}/rest/v1/rpc/${names[method]}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
  if(!r.ok)throw new Error('Source status unavailable');return r.json();
 };
}
export function createOperationsHandler(c,{api,store,waitUntil}){
 const staff=async id=>{const m=await api(`/guilds/${c.guildId}/members/${id}`);return m.user?.id===id&&!m.user.bot&&(id===c.ownerId||c.staffRoleIds.some(x=>m.roles?.includes(x)));};
 return i=>{
  const name=i.type===2?i.data?.name:null,id=i.data?.custom_id;
  const command=['source-status','releases'].includes(name),button=['c3:source:status:v1','c3:source:pause:bestbuy:v1'].includes(id);
  if(!command&&!button)return null;
  if(i.application_id!==c.applicationId||i.guild_id!==c.guildId||!/^\d{17,20}$/u.test(i.member?.user?.id??'')||i.member.user.bot)return reply('Use these tools inside Code 3 TCG.');
  if(command&&(i.data.type!==1||i.data.id!==c.extraCommands[name]||(i.data.options??[]).length))return reply('Choose the current Code 3 TCG slash command.');
  if(name==='releases')return reply(`Officially sourced dates and optional events: https://discord.com/channels/${c.guildId}/${c.calendarChannelId}\n\nRelease-date markers use America/New_York calendar days. They are not retailer on-sale times or stock guarantees. Read the linked publisher source for any changes.`);
  if(button&&((i.channel_id??i.channel?.id)!==c.sourceHealthChannelId||i.message?.author?.id!==c.applicationId||i.data.component_type!==2))return reply('Use the staff source-health controls.');
  if(!/^[A-Za-z0-9_.-]{20,300}$/u.test(i.token??''))return reply('Reopen the command and try again.');
  waitUntil((async()=>{
   let body;
   try{if(!await staff(i.member.user.id))body={content:'Only current Code 3 staff can view source controls.',allowed_mentions:noMentions};
    else{if(id==='c3:source:pause:bestbuy:v1')await store('pause',{p_source:'bestbuy',p_paused:true});body=sourceHealthPayload(await store('health'));}
   }catch{body={content:'Source status could not be confirmed. Best Buy has not been activated. Staff should inspect the hosted configuration.',allowed_mentions:noMentions};}
   await api(`/webhooks/${c.applicationId}/${i.token}/messages/@original`,{method:'PATCH',body}).catch(()=>{});
  })());return json({type:5,data:{flags:64}});
 };
}
