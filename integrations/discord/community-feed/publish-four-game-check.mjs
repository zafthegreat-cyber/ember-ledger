import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {apiClient,P} from '../setup.mjs';
import {ALERT_ROLES,ALERT_CHANNEL_ID,GUILD_ID,withRolePings,sendRoleAlert} from '../role-alert.mjs';
const file=new URL('../.state/bridge-flow-four-game-test.json',import.meta.url);
if(!process.argv.includes('--send-test'))throw Error('Use --send-test only for an explicitly requested live notification test.');
const api=apiClient(process.env.DISCORD_BOT_TOKEN);
const [owner,roles,channel]=await Promise.all([api(`/guilds/${GUILD_ID}/members/639143039557828640`),api(`/guilds/${GUILD_ID}/roles`),api(`/channels/${ALERT_CHANNEL_ID}`)]);
assert.ok(Object.values(ALERT_ROLES).every(id=>owner.roles.includes(id)),'Owner must already be opted in');
for(const id of Object.values(ALERT_ROLES)){const role=roles.find(r=>r.id===id);assert.ok(role&&!role.managed&&!role.mentionable&&role.permissions==='0');}
const botOverwrite=channel.permission_overwrites.find(o=>o.type===1&&o.id==='1563636539370639420');
assert.ok(BigInt(botOverwrite.allow)&P.MENTION);assert.ok(!(BigInt(botOverwrite.deny)&P.MENTION));
let prior;try{prior=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(prior){
 if(!prior.verified)throw Error('Prior send is uncertain; inspect before retry');
 const got=await api(`/channels/${prior.channelId}/messages/${prior.messageId}`);
 assert.deepEqual(got.mention_roles.slice().sort(),Object.values(ALERT_ROLES).sort());
 console.log(JSON.stringify({...prior,sendSkipped:true}));
}else{
 const payload=withRolePings({embeds:[{title:'TEST — Code 3 app bridge role pings',description:'Notification verification for Pokémon, One Piece, Magic and Lorcana opt-in roles. This is a TEST and does not report product availability. Best Buy remains paused. No direct user or everyone mentions are included.',color:0xD4AF37,timestamp:new Date().toISOString()}]},Object.keys(ALERT_ROLES));
 await writeFile(file,JSON.stringify({status:'pending',startedAt:new Date().toISOString()}));
 const result=await sendRoleAlert(api,payload,{channelId:ALERT_CHANNEL_ID,eventId:'bridge-flow-four-game-test-20261029-v1'});
 const receipt={...result,checkedAt:new Date().toISOString(),memberRolesChanged:false,retailerRequests:0,devicePushConfirmed:false};
 await writeFile(file,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
