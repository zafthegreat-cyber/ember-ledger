const SNOWFLAKE=/^\d{17,20}$/u;
const noMentions={parse:[],users:[],roles:[],replied_user:false};
const response=data=>new Response(JSON.stringify({type:4,data:{...data,flags:64,allowed_mentions:noMentions}}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const row=(...components)=>[{type:1,components}];
function fieldsFor(name,lines) {
 const chunks=[];let value='';
 for(const line of lines){if(value.length+line.length+1>950){chunks.push({name:chunks.length?`${name} (continued)`:name,value});value='';}value+=(value?'\n':'')+line;}
 if(value)chunks.push({name:chunks.length?`${name} (continued)`:name,value});
 return chunks;
}
export function validateGuideConfig(c) {
 if(![c.guildId,c.applicationId].every(x=>SNOWFLAKE.test(x))||Object.keys(c.commands??{}).sort().join(',')!=='help,my-channels,notifications,report'||Object.values(c.commands).some(x=>!SNOWFLAKE.test(x))||new Set(Object.values(c.commands)).size!==4)throw new Error('Invalid guide command configuration.');
 for(const name of ['choose-roles','restock-reports','welcome-and-rules','collector-chat','app-help','suggestions','announcements','local-restocks'])if(!SNOWFLAKE.test(c.channels?.[name]))throw new Error('Invalid guide channel configuration.');
 if(Object.keys(c.groups??{}).sort().join(',')!=='fredericksburg,locations,online,products,projects')throw new Error('Invalid guide groups.');
 for(const options of Object.values(c.groups))for(const o of options)if(!/^[a-z0-9-]{1,40}$/u.test(o.key??'')||!SNOWFLAKE.test(o.roleId)||typeof o.label!=='string'||o.label.length>100||!Array.isArray(o.channelIds)||o.channelIds.some(x=>!SNOWFLAKE.test(x)))throw new Error('Invalid guide option.');
 if(c.capabilities?.alertRepeatWindowMinutes!==undefined&&!(Number.isInteger(c.capabilities.alertRepeatWindowMinutes)&&c.capabilities.alertRepeatWindowMinutes>=15&&c.capabilities.alertRepeatWindowMinutes<=1440))throw new Error('Invalid guide alert window.');
 return c;
}
/**
 * Which product × area/Online intersections can currently mention this member, plus
 * individual areas made redundant by an all-area choice (prioritized IMP142/IMP145/IMP157).
 */
export function alertSummary(c,roles=[]) {
 const picked=group=>(c.groups[group]??[]).filter(o=>roles.includes(o.roleId));
 const products=picked('products').map(o=>o.label),online=picked('online').length>0;
 const regions=[{key:'locations',name:'southeastern Virginia'},{key:'fredericksburg',name:'the Fredericksburg area'}].map(r=>{
  const options=picked(r.key),all=options.find(o=>o.key.startsWith('all-')),cities=options.filter(o=>!o.key.startsWith('all-'));
  return {...r,all,cities,total:(c.groups[r.key]??[]).filter(o=>!o.key.startsWith('all-')).length};
 });
 const lines=[],redundant=[];
 if(!products.length)lines.push('None yet — choose at least one product. Areas and Online decide *where* a product mention can reach you.');
 else{
  const list=products.join(', ');
  if(online)lines.push(`${list} → Online releases & restocks`);
  for(const r of regions){
   if(r.all)lines.push(`${list} → ${r.all.label} (all ${r.total} areas)`);
   else if(r.cities.length)lines.push(`${list} → ${r.cities.map(o=>o.label).join(', ')}`);
  }
  if(lines.length===0)lines.push(`${list} unlock product rooms, but no mention can reach you until you also choose Online or at least one area.`);
 }
 for(const r of regions)if(r.all&&r.cities.length)redundant.push(`${r.cities.map(o=>o.label).join(', ')} ${r.cities.length===1?'is':'are'} already covered by ${r.all.label}; removing ${r.cities.length===1?'it':'them'} changes nothing until that all-area choice is removed.`);
 return {products,online,regions,lines,redundant};
}
export function guideReply(c,name,roles=[]) {
 const url=n=>`https://discord.com/channels/${c.guildId}/${c.channels[n]}`;
 const link=(n,label=n)=>`[${label}](${url(n)})`;
 const btn=(n,label=n)=>({type:2,style:5,label,url:url(n)});
 const base={color:0xD4AF37};
 if(name==='help')return {embeds:[{...base,title:'Code 3 TCG · private help',description:`**Start:** ${link('welcome-and-rules')}\n**Choose rooms:** ${link('choose-roles')}\n**Chat:** ${link('collector-chat')}\n**Stock report:** ${link('restock-reports')}\n**App or notification help:** ${link('app-help')}\n**Ideas:** ${link('suggestions')}\n\n**/my-channels** lists rooms for your selected interests. **/notifications** reviews your current choices and which alerts can mention you. **/report** opens the restock-form shortcut.${c.capabilities?.safetyConcernCommand?' **/safety-concern** opens a private report for harassment, pressure or impersonation.':''}\n\n**App or Discord?** The app (code3tcg.app) holds your collection, Vault, prices and the Restocks reports page. Discord is for alerts, collecting chat, help and submitting what you saw in a store or online; approved observations also appear in the app. Neither needs the other.\n\nCheck ${link('announcements')} for the dated feed status. Choosing a role does not guarantee an alert or current stock.`}],components:row(btn('choose-roles','Choose interests'),btn('app-help','Get help'))};
 if(name==='report')return {embeds:[{...base,title:'Share a restock observation',description:`Open ${link('restock-reports')} and use **Local restock** or **Online availability**. The form is private to you and staff until approval; text typed directly in that channel is public.\n\nInclude the category, full product name, public store or HTTPS product page, status and minutes since you checked. Only personal observations within 24 hours are accepted. No private locations, vendor schedules, receipts or account details.\n\n${c.capabilities?.localityRouting?'Local reports start with one city or ZIP search across all 50 states and DC. Pick the matching place, then complete the private form. Approved reports reach the shared local feed and product copy; original local rooms also keep their copies. Online stays separate. Default approval does not ping.':`Staff-reviewed local observations currently post to ${link('local-restocks')}; online observations go to the Online room. Approvals do not automatically ping roles.`} Stock may change.`}],components:row(btn('restock-reports','Open restock forms'))};
 const labels={products:'Products',online:'Online',locations:'Southeastern Virginia',fredericksburg:'Fredericksburg area',projects:'Projects'};
 if(name==='notifications'){
  const summary=alertSummary(c,roles);
  const fields=Object.entries(c.groups).map(([key,options])=>({name:labels[key],value:options.filter(o=>roles.includes(o.roleId)).map(o=>o.label).join(', ')||'None selected'}));
  fields.push({name:'Alerts that can mention you',value:summary.lines.join('\n').slice(0,1024)});
  if(summary.redundant.length)fields.push({name:'Already covered',value:summary.redundant.join('\n').slice(0,1024)});
  fields.push({name:'How often',value:`At most one mention per staff-approved report, and never twice for the same product and store within ${c.capabilities?.alertRepeatWindowMinutes??120} minutes. Sold-out follow-ups edit the earlier post silently. Automatic retailer feeds: ${c.capabilities?.bestBuyPaused===false?'active sources are listed in /source-status.':'none today — Best Buy is paused.'}`});
  fields.push({name:'Three things decide whether you hear it',value:`1. **Your roles here** — which rooms you see and which mentions you qualify for (change them in ${link('choose-roles')}).\n2. **Discord's settings** — server/channel mute, notification level and "suppress role mentions". For quiet nights use Discord's mute timer (1 h, 8 h, 24 h or until you turn it back on); your roles stay as they are.\n3. **Your device** — notification permission and Do Not Disturb/Focus. The bot has no quiet-hours schedule of its own, so these are the controls that actually delay or silence a mention.`});
  return {embeds:[{...base,title:'Your notification interests',description:`These are your current optional roles at the time you ran the command. Open ${link('choose-roles')} to add interests or remove checkmarks. Each menu saves automatically and leaves other menus unchanged.\n\n${c.capabilities?.rolePingsVerified?'Default report approval does not mention anyone; staff can send one opted-in mention per approved report in the matching area/Online room.':'Game-role pings have not yet passed live verification. Community report approvals do not ping.'} Each mention says which of your choices it matched.${c.capabilities?.nearbyNationwide?" For nationwide local alerts, use Set nearby area in the picker: enter a city or ZIP once. Staff can notify only members whose saved area and current product interest both match. Use Turn off nearby alerts there to clear the area; removing product interests also stops their mentions. Existing local-room choices are optional and remain available.":""}`,fields}],components:row(btn('choose-roles','Change or remove interests'),btn('app-help','Notification help'))};
 }
 if(name==='my-channels') {
  const fields=fieldsFor('Always useful',['welcome-and-rules','choose-roles','collector-chat','restock-reports','app-help','suggestions'].map(n=>link(n)));
  const seen=new Set();
  for(const [key,options] of Object.entries(c.groups)) {
   const lines=[];
   for(const o of options.filter(o=>roles.includes(o.roleId)))for(const id of o.channelIds)if(!seen.has(id)){seen.add(id);lines.push(`[${c.channelNames[id]}](https://discord.com/channels/${c.guildId}/${id})`);}
   if(lines.length)fields.push(...fieldsFor(labels[key],lines));
  }
  return {embeds:[{...base,title:'Rooms for your chosen interests',description:`${seen.size?'Your selected interest rooms are linked below.':'No optional rooms selected yet.'} This list follows your interest roles; staff access may show additional rooms. Change your choices in ${link('choose-roles')}.`,fields}],components:row(btn('choose-roles','Choose more interests'))};
 }
 throw new Error('Unknown private guide.');
}
export function createGuideHandler(c) {
 validateGuideConfig(c);
 return i=>{
  const command=i.type===2&&Object.hasOwn(c.commands,i.data?.name??'');
  const template=i.type===3&&['c3:guide:bug:v1','c3:guide:suggestion:v1'].includes(i.data?.custom_id);
  if(!command&&!template)return null;
  if(i.application_id!==c.applicationId||i.guild_id!==c.guildId||!SNOWFLAKE.test(i.member?.user?.id??'')||i.member.user.bot||!Array.isArray(i.member.roles)||i.member.roles.some(x=>!SNOWFLAKE.test(x)))return response({content:'Use these commands inside the Code 3 TCG server.'});
  if(command) {
   if(i.data.type!==1||i.data.id!==c.commands[i.data.name]||(i.data.options??[]).length)return response({content:'Choose the current Code 3 TCG command from the slash-command menu.'});
   return response(guideReply(c,i.data.name,i.member.roles));
  }
  const bug=i.data.custom_id==='c3:guide:bug:v1';
  const channel=c.channels[bug?'app-help':'suggestions'];
  if(i.data.component_type!==2||(i.channel_id??i.channel?.id)!==channel||i.message?.author?.id!==c.applicationId||!i.message.components?.some(r=>r.components?.some(b=>b.custom_id===i.data.custom_id)))return response({content:'Use the current template button in the matching help channel.'});
  return response({content:`Copy this outline and fill it in. Posts in the channel are public; remove personal data and credentials before posting.\n\n\`\`\`\n${bug?c.bugTemplate:c.suggestionTemplate}\n\`\`\``});
 };
}
