import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {apiClient} from '../setup.mjs';
import {NO_MENTIONS} from '../role-picker/submissions.mjs';
import {communityFeedDisclosure as disclosure} from './copy.mjs';

const root=new URL('../',import.meta.url);
const load=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const save=async(path,data)=>writeFile(new URL(path,root),JSON.stringify(data,null,2)+'\n');
const c=await load('role-picker/submissions.json');
if(c.guildId!=='1558588508204179611'||c.applicationId!=='1563636539370639420')throw Error('Unexpected server');
const api=apiClient(process.env.DISCORD_BOT_TOKEN);
const bot=await api('/users/@me');
if(!bot.bot||bot.id!==c.applicationId)throw Error('Unexpected bot');
let registry;
try{registry=await load('.state/community-bridge-discord.json');}catch(e){if(e.code!=='ENOENT')throw e;registry={guildId:c.guildId};}

if(process.argv.includes('--disclose')){
 const route=`/channels/${c.inputChannelId}/messages/${c.inputMessageId}`;
 const message=await api(route),drafts=await load('channel-messages.json');
 if(message.author?.id!==c.applicationId||message.content!==drafts['restock-reports'])throw Error('Instructions changed separately');
 if(!message.components?.length)throw Error('Reporting buttons missing');
 if(!message.content.includes(disclosure)){
  const content=message.content.replace('\n\nApp: ',`\n\n${disclosure}\n\nApp: `);
  if(content===message.content||content.length>2000)throw Error('Cannot add reviewed disclosure');
  await save('.state/community-bridge-instructions-before.json',{content:message.content,components:message.components,channelId:message.channel_id,messageId:message.id});
  await api(route,{method:'PATCH',body:{content,allowed_mentions:NO_MENTIONS}});
  const result=await api(route);
  if(result.content!==content||JSON.stringify(result.components)!==JSON.stringify(message.components)||result.mention_everyone||result.mention_roles?.length||result.mentions?.length)throw Error('Disclosure readback failed');
  drafts['restock-reports']=content;
  await save('channel-messages.json',drafts);
  const fingerprint=createHash('sha256').update(content).digest('hex');
  for(const [file,key] of [['.state/live-setup-report.json','welcomePosts'],['.state/finish-state.json','seeds']]){
   const data=await load(file);data[key]['restock-reports'].fingerprint=fingerprint;await save(file,data);
  }
 }
 registry.disclosure={checkedAt:new Date().toISOString(),messageId:message.id,channelId:message.channel_id,buttonsPreserved:true,mentions:0};
}

if(process.argv.includes('--shortcuts')){
 const release=await load('.state/community-bridge-production.json');
 if(!release.passed||release.domain!=='code3tcg.app'||!release.commit)throw Error('Verified production receipt required');
 const channelId='1563700462186663936';
 const channel=await api(`/channels/${channelId}`);
 if(channel.guild_id!==c.guildId||channel.name!=='app-help')throw Error('Unexpected shortcut room');
 const body={content:'',allowed_mentions:NO_MENTIONS,embeds:[{title:'Your community, in Scout',color:0xD4AF37,description:'Open Scout Reports for recent staff-approved community observations, search and product filters, and publisher release dates.\n\n**Share an observation:** use Report in Discord in the app, then complete the private form here. Staff review it before public details appear in the app and Discord. Your saved personal app reports stay on their existing path.\n\n**Choose alerts:** use #choose-roles for products and areas. Existing staff-approved notifications follow those choices. The app feed is not a live inventory check.\n\nBest Buy remains paused. No new automatic retailer checks or pings are enabled.',footer:{text:'Code 3 TCG app bridge · community observations'}}],components:[{type:1,components:[{type:2,style:5,label:'Community reports',url:'https://code3tcg.app/scout/reports'},{type:2,style:5,label:'Scout map',url:'https://code3tcg.app/scout'},{type:2,style:5,label:'Release dates',url:'https://code3tcg.app/scout/reports?community=calendar'}]}]};
 let saved;
 if(registry.shortcut){
  if(registry.shortcut.channelId!==channelId)throw Error('Shortcut destination changed');
  const route=`/channels/${channelId}/messages/${registry.shortcut.messageId}`;
  const old=await api(route);if(old.author?.id!==c.applicationId)throw Error('Shortcut is not bot-owned');
  saved=await api(route,{method:'PATCH',body});
 }else{
  saved=await api(`/channels/${channelId}/messages`,{method:'POST',body});
  registry.shortcut={channelId,messageId:saved.id};
  await save('.state/community-bridge-discord.json',registry);
 }
 const result=await api(`/channels/${channelId}/messages/${saved.id}`);
 if(result.author?.id!==c.applicationId||result.components?.[0]?.components?.length!==3||result.mention_everyone||result.mention_roles?.length||result.mentions?.length)throw Error('Shortcut readback failed');
 registry.shortcut={...registry.shortcut,checkedAt:new Date().toISOString(),mentions:0};
}
if(!process.argv.includes('--disclose')&&!process.argv.includes('--shortcuts'))throw Error('Choose --disclose or --shortcuts');
await save('.state/community-bridge-discord.json',registry);
console.log(JSON.stringify(registry));
