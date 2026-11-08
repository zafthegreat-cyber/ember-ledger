import {distanceMiles} from './nationwideLocation.mjs';
import {nationalArea,nationalSearch,legacyArea,reportArea,reportAreaCenter} from './location-catalog.mjs';
import {pickerMessage} from './core.mjs';
import {failureReporter,failureStatus} from './events.mjs';
import {NO_MENTIONS,submissionModal,parseSubmission} from './submissions.mjs';
import {processSubmissionV2,effectiveChannelPermissions} from './submissions-v2.mjs';

const snow=v=>typeof v==='string'&&/^\d{17,20}$/.test(v);
const json=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});
const reply=content=>json({type:4,data:{content,flags:64,allowed_mentions:NO_MENTIONS}});
export {nationalArea,nationalSearch};
export function searchModal(purpose,user){return {type:9,data:{custom_id:`c3:near:search:${purpose}:${user}`,title:purpose==='report'?'Where did you check?':'Choose your nearby area',components:[{type:18,label:'City or ZIP',description:'Type a city and optional state, or a 5-digit ZIP. No address needed.',component:{type:4,custom_id:'query',style:1,min_length:2,max_length:80,required:true,placeholder:'Austin TX or 78701'}}]}};}
function resultsMessage(purpose,user,query){
 const choices=nationalSearch(query);
 return {content:choices.length?'Choose the matching place. State names are shown only to distinguish places with the same name.':'No matching place. Try a city with its state, such as Austin TX. Some postal-only ZIPs have no mapped area.',flags:64,allowed_mentions:NO_MENTIONS,components:[...(choices.length?[{type:1,components:[{type:3,custom_id:`c3:near:choose:${purpose}:${user}`,min_values:1,max_values:1,placeholder:'Choose your place',options:choices.map(a=>({label:a.label.slice(0,100),value:a.id}))}]}]:[]),{type:1,components:[{type:2,style:2,custom_id:`c3:near:find:${purpose}:${user}`,label:'Search again'}]}]};
}
export function nearbySummary(pref,user){
 const area=pref?.area_id?nationalArea(pref.area_id):null;
 return {content:area?`Nearby area saved: **${area.label}** · within **${pref.radius} miles**.\n\nNew national reports can mention you only after staff choose to notify, when your product interest and this nearby area both match. Existing local-room and Online choices stay separate. Removing product interests stops their mentions.\n\nYour area is private to the bot; no exact address or device location is collected.`:'No nearby area saved. Choose a city or ZIP once. Nationwide browsing and Online do not require a local area.',flags:64,allowed_mentions:NO_MENTIONS,components:[{type:1,components:[{type:2,style:1,custom_id:`c3:near:find:save:${user}`,label:area?'Change nearby area':'Set nearby area'},{type:2,style:5,url:`https://code3tcg.app/scout/reports${area?`?near=${area.id}`:''}`,label:area?'View nearby reports':'Browse nationwide'},{type:2,style:2,custom_id:`c3:near:clear:${user}`,label:'Turn off nearby alerts'}]},...(area?[{type:1,components:[{type:3,custom_id:`c3:near:radius:${user}`,placeholder:`Nearby distance: ${pref.radius} miles`,min_values:1,max_values:1,options:[10,25,50,100].map(n=>({label:`Within ${n} miles`,value:String(n),default:pref.radius===n}))}]}]:[])]};
}
export function nearbyStore(url,key,{fetchImpl=fetch}={}){
 if(url!=='https://gxsfququorfczvhrkudl.supabase.co'||!key)throw Error('Nearby store unavailable');
 return async(method,args)=>{
  if(!['get','save','candidates'].includes(method))throw Error('Invalid nearby operation');
  const r=await fetchImpl(`${url}/rest/v1/rpc/code3_nearby_${method}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
  if(!r.ok)throw Error('Nearby store unavailable');return r.json();
 };
}
export async function nationalAudience(c,row,api,store,channel,roles,legacyChannel,allowEmpty=false){
 const area=reportAreaCenter(c,row.report.locality);
 if(!area&&!nationalArea(row.report.locality))return [];
 if(!area||row.is_test||row.report.kind!=='local'||row.report.status==='empty')throw Error('No alert sent. This report cannot notify nearby members.');
 const candidates=await store('candidates',{p_lat:area.lat,p_lng:area.lng});
 if(!Array.isArray(candidates)||candidates.length>50)throw Error('No alert sent. The nearby audience needs staff review; post silently instead.');
 const eligible=[];
 async function consider(pref){
  const theirs=nationalArea(pref.area_id);
  if(!snow(pref.member_id)||!theirs||![10,25,50,100].includes(pref.radius)||distanceMiles(area,theirs)>pref.radius)return;
  let member;try{member=await api(`/guilds/${c.guildId}/members/${pref.member_id}`);}catch(e){if(/\(404\)/.test(e.message))return;throw e;}
  const permissions=effectiveChannelPermissions(channel,roles,member,c.guildId);
  const alreadyGetsRoleMention=legacyChannel&&!!(effectiveChannelPermissions(legacyChannel,roles,member,c.guildId)&(8n|1024n));
  if(member.user?.id===pref.member_id&&!member.user.bot&&member.roles?.includes(c.productRoles[row.report.category])&&(permissions&8n||permissions&1024n)&&!alreadyGetsRoleMention)eligible.push(pref.member_id);
 }
 for(let n=0;n<candidates.length;n+=5)await Promise.all(candidates.slice(n,n+5).map(consider));
 if(!eligible.length&&!allowEmpty&&nationalArea(row.report.locality))throw Error('No alert sent. No nearby members have this product selected. Use Approve & post (no ping).');
 return [...new Set(eligible)];
}
export function createNearbyHandler(c,roleConfig,{api,store,reports,waitUntil,decorateReview,now=()=>Date.now(),onFailure}){
 const logFailure=failureReporter(onFailure);
 const finish=(i,work)=>{waitUntil((async()=>{let body;try{body=await work();}catch(error){logFailure('nearby:interaction',failureStatus(error));body={content:/^Please wait ten minutes/.test(error.message)?error.message:'I could not confirm this change. Your existing interests stay available; reopen the picker to check before retrying.',components:[],allowed_mentions:NO_MENTIONS};}await api(`/webhooks/${c.applicationId}/${i.token}/messages/@original`,{method:'PATCH',body}).catch(()=>logFailure('nearby:reply','unavailable'));})());return json({type:5,data:{flags:64}});};
 return i=>{
  const id=i.data?.custom_id||'';
  const localOpen=id==='c3:report:open:local:v1';
  if(!id.startsWith('c3:near:')&&!localOpen)return null;
  const user=i.member?.user?.id,channel=i.channel_id??i.channel?.id;
  if(i.application_id!==c.applicationId||i.guild_id!==c.guildId||!snow(i.id)||!snow(user)||i.member.user.bot||!new Set([c.inputChannelId,roleConfig.channelId]).has(channel)||!/^[A-Za-z0-9_.-]{20,300}$/.test(i.token??''))return reply('Use these controls inside Code 3 TCG.');
  const age=now()-Number((BigInt(i.id)>>22n)+1420070400000n);
  if(age>300000||age < -60000)return reply('This request expired. Reopen the current picker.');
  const owner=i.message?.interaction_metadata?.user?.id??i.message?.interaction?.user?.id;
  const privateOwned=i.message?.author?.id===c.applicationId&&(Number(i.message.flags)&64)&&owner===user;
  if(localOpen){if(i.type!==3||i.data.component_type!==2||channel!==c.inputChannelId||i.message?.id!==c.inputMessageId||i.message.author?.id!==c.applicationId)return reply('Use the current restock submission button.');return json(searchModal('report',user));}
  if(id==='c3:near:open:v1'){
   if(i.type!==3||i.data.component_type!==2||i.message?.author?.id!==c.applicationId||!((channel===roleConfig.channelId&&i.message.id===roleConfig.menuMessageId)||privateOwned))return reply('Use the current interests picker.');
   return finish(i,async()=>nearbySummary(await store('get',{p_member:user}),user));
  }
  if(!id.endsWith(`:${user}`))return reply('This private control belongs to another member.');
  if(id===`c3:near:rooms:${user}`&&i.type===3&&i.data.component_type===2&&privateOwned)return finish(i,async()=>{const member=await api(`/guilds/${c.guildId}/members/${user}`);return pickerMessage(roleConfig,member.roles,'Existing room choices are preserved. These optional menus are for the original local rooms.','rooms',user);});
  const find=/^c3:near:find:(save|report):/.exec(id);
  if(find&&i.type===3&&i.data.component_type===2&&privateOwned)return json(searchModal(find[1],user));
  const search=/^c3:near:search:(save|report):/.exec(id);
  if(search&&i.type===5){
   if(i.message&&!privateOwned&&!(search[1]==='report'&&channel===c.inputChannelId&&i.message.id===c.inputMessageId&&i.message.author?.id===c.applicationId))return reply('This form belongs to another member.');
   const fields=i.data.components;if(!Array.isArray(fields)||fields.length!==1||fields[0]?.type!==18||fields[0].component?.custom_id!=='query'||fields[0].component.type!==4||typeof fields[0].component.value!=='string')return reply('Enter a city or ZIP in the current form.');
   return json({type:4,data:resultsMessage(search[1],user,fields[0].component.value)});
  }
  const choice=/^c3:near:choose:(save|report):/.exec(id);
  if(choice&&i.type===3&&i.data.component_type===3&&privateOwned){
   const values=i.data.values,area=Array.isArray(values)&&values.length===1?nationalArea(values[0]):null;
   if(!area||!i.message.components?.some(r=>r.components?.some(s=>s.options?.some(o=>o.value===area.id))))return reply('Choose a place from the current search results.');
   if(choice[1]==='report'){
    const location=legacyArea(c,area)?.key||area.placeId||area.id,modal=submissionModal(c,'local');
    modal.data.custom_id=`c3:near:submit:${location}:${user}`;modal.data.title=`Report · ${area.city}, ${area.state}`.slice(0,45);return json(modal);
   }
   return finish(i,async()=>{
    const pref=await store('save',{p_member:user,p_area:area.id,p_radius:25,p_lat:area.lat,p_lng:area.lng,p_request:i.id});
    return nearbySummary(pref,user);
   });
  }
  const submission=/^c3:near:submit:([a-z0-9-]+):/.exec(id);
  if(submission&&i.type===5&&privateOwned&&channel===c.inputChannelId){
   const area=reportArea(c,submission[1]);if(!area)return reply('Choose a place again before submitting.');
   let report;try{const center=reportAreaCenter(c,submission[1]);report={...parseSubmission(i,c,'local',now()),locality:submission[1],...(center?{areaLat:String(center.lat),areaLng:String(center.lng)}:{})};}catch(e){return reply(e.message);}
   return finish(i,async()=>({content:await processSubmissionV2(c,{id:i.id,userId:user,report},api,reports,decorateReview),allowed_mentions:NO_MENTIONS}));
  }
  if(id.startsWith('c3:near:radius:')&&i.type===3&&i.data.component_type===3&&privateOwned){
   const radius=Number(i.data.values?.[0]);if(i.data.values?.length!==1||![10,25,50,100].includes(radius))return reply('Choose a distance from the menu.');
   return finish(i,async()=>{const old=await store('get',{p_member:user}),area=nationalArea(old?.area_id);if(!area)return nearbySummary(null,user);return nearbySummary(await store('save',{p_member:user,p_area:area.id,p_radius:radius,p_lat:area.lat,p_lng:area.lng,p_request:i.id}),user);});
  }
  if(id.startsWith('c3:near:clear:')&&i.type===3&&i.data.component_type===2&&privateOwned)return finish(i,async()=>nearbySummary(await store('save',{p_member:user,p_area:null,p_radius:25,p_lat:null,p_lng:null,p_request:i.id}),user));
  return reply('Reopen the nearby picker to use the current controls.');
 };
}
