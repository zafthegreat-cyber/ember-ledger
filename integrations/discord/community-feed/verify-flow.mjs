import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {apiClient} from '../setup.mjs';
import {expectedDestinations,primaryDestination,payloadV2,verifyCopy,notificationPolicy} from '../role-picker/submissions-v2.mjs';
const root=new URL('../',import.meta.url);
const load=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const save=(path,data)=>writeFile(new URL(path,root),JSON.stringify(data,null,2)+'\n');
const c=await load('role-picker/submissions.json');
assert.equal(c.guildId,'1558588508204179611');
const api=apiClient(process.env.DISCORD_BOT_TOKEN);
const [bot,roles,channels,owner,member,botMember]=await Promise.all([api('/users/@me'),api(`/guilds/${c.guildId}/roles`),api(`/guilds/${c.guildId}/channels`),api(`/guilds/${c.guildId}/members/${c.ownerId}`),api(`/guilds/${c.guildId}/members/773591337852600341`),api(`/guilds/${c.guildId}/members/${c.applicationId}`)]);
assert.equal(bot.id,c.applicationId);assert.ok(bot.bot);
const snapshot={roles:roles.map(r=>({id:r.id,permissions:r.permissions,position:r.position,mentionable:r.mentionable})).sort((a,b)=>a.id.localeCompare(b.id)),channels:channels.map(ch=>({id:ch.id,overwrites:ch.permission_overwrites})).sort((a,b)=>a.id.localeCompare(b.id)),ownerRoles:owner.roles.slice().sort(),testMemberRoles:member.roles.slice().sort()};
if(process.argv.includes('--baseline')){
 try{await load('.state/bridge-flow-baseline.json');throw Error('Baseline already exists; preserve it');}catch(e){if(e.code!=='ENOENT')throw e;}
 await save('.state/bridge-flow-baseline.json',{checkedAt:new Date().toISOString(),...snapshot});
 console.log({baselineSaved:true,roles:roles.length,channels:channels.length,ownerRoles:owner.roles.length,testMemberRoles:member.roles.length});
}else if(process.argv.includes('--verify')){
 const before=await load('.state/bridge-flow-baseline.json');
 const normalizedChannels=list=>list.map(ch=>({...ch,overwrites:ch.overwrites.map(({id,type,allow,deny})=>({id,type,allow,deny})).sort((a,b)=>`${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`))}));
 for(const key of Object.keys(snapshot))assert.deepEqual(key==='channels'?normalizedChannels(snapshot[key]):snapshot[key],key==='channels'?normalizedChannels(before[key]):before[key],`${key} changed`);
 const rows=await load('.state/bridge-flow-rows.json');const reports=[];
 for(const row of rows){
  assert.equal(row.state,'published');
  const wanted=expectedDestinations(c,row);
  assert.deepEqual(row.copies.map(copy=>copy.channel_id).sort(),wanted.slice().sort());
  const primary=primaryDestination(c,row),copies=[];
  for(const copy of row.copies){
   assert.equal(copy.status,'published');
   const ping=row.notify_requested&&copy.channel_id===primary&&row.report.status!=='empty';
   const body=payloadV2(c,row,{ping,channelId:copy.channel_id});
   const message=await api(`/channels/${copy.channel_id}/messages/${copy.message_id}`);
   verifyCopy(c,body,message,copy.channel_id);
   assert.ok(!JSON.stringify(message.embeds).includes(row.submitter),'Public submitter identity');
   copies.push({channelId:copy.channel_id,messageId:copy.message_id,roles:message.mention_roles,users:message.mentions.length,everyone:message.mention_everyone,primary:copy.channel_id===primary});
  }
  if(row.notify_requested)assert.ok(notificationPolicy(c,row,channels.find(ch=>ch.id===primary),roles,botMember));
  const review=await api(`/channels/${c.reviewChannelId}/messages/${row.review_message}`);
  assert.equal(review.author.id,c.applicationId);assert.equal(review.components.length,0);
  assert.ok(review.embeds[0].fields.some(field=>field.name==='Review status'&&field.value==='published'));
  reports.push({id:row.id,category:row.report.category,kind:row.report.kind,notify:row.notify_requested,copies,reviewFinished:true,history:row.history});
 }
 const receipt={checkedAt:new Date().toISOString(),passed:true,rolesPreserved:roles.length,channelsPreserved:channels.length,ownerRolesPreserved:true,testMemberRolesPreserved:true,reports,devicePushConfirmed:false};
 await save('.state/bridge-flow-discord-verification.json',receipt);console.log(JSON.stringify(receipt));
}else throw Error('Choose --baseline or --verify');
