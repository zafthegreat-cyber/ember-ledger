const snowflake = value => typeof value==='string' && /^\d{17,20}$/u.test(value);
const encoder=new TextEncoder();
const unhex=value=>Uint8Array.from(value.match(/../gu),x=>parseInt(x,16));
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const noMentions={parse:[],users:[],roles:[],replied_user:false};

export function validateConfig(config) {
  if(![config.applicationId,config.guildId,config.channelId].every(snowflake) || !/^[a-f0-9]{64}$/iu.test(config.publicKey??''))throw new Error('Invalid role picker identity.');
  if(Object.keys(config.groups??{}).sort().join(',')!=='fredericksburg,locations,online,products,projects')throw new Error('Invalid picker groups.');
  const roles=new Set();
  for(const options of Object.values(config.groups)) {
    if(!Array.isArray(options)||options.length<1||options.length>25)throw new Error('Invalid option count.');
    const keys=new Set();
    for(const o of options) {
      if(!/^[a-z0-9-]{1,40}$/u.test(o.key)||keys.has(o.key)||!snowflake(o.roleId)||roles.has(o.roleId)||o.roleId===config.guildId||typeof o.label!=='string'||o.label.length>100||o.description!==undefined&&(typeof o.description!=='string'||o.description.length<1||o.description.length>100))throw new Error('Invalid role option.');
      keys.add(o.key);roles.add(o.roleId);
    }
  }
  return config;
}

export function validateInteraction(i,c) {
  if(i.type!==3 || i.application_id!==c.applicationId || i.guild_id!==c.guildId || (i.channel_id??i.channel?.id)!==c.channelId || !snowflake(i.member?.user?.id) || i.member.user.bot || i.message?.author?.id!==c.applicationId || !/^[A-Za-z0-9_.-]{20,300}$/u.test(i.token??''))throw new Error('Invalid interaction context.');
  const id=i.data?.custom_id;
  if(id==='c3:open:v1' && i.data.component_type===2) {
    if(c.menuMessageId && i.message.id!==c.menuMessageId)throw new Error('Use the current role picker.');
    return {group:null,selected:null,userId:i.member.user.id};
  }
  const group=/^c3:(products|online|locations|fredericksburg|projects):v1$/u.exec(id??'')?.[1];
  const values=i.data?.values;
  if(!group || i.data.component_type!==3 || !(Number(i.message.flags)&64) || !Array.isArray(values) || values.length>c.groups[group].length || new Set(values).size!==values.length || values.some(v=>!c.groups[group].some(o=>o.key===v)))throw new Error('Invalid role selection.');
  // Ephemeral component messages belong to the member Discord signed into this request.
  const owner=i.message.interaction_metadata?.user?.id??i.message.interaction?.user?.id;
  if(owner && owner!==i.member.user.id)throw new Error('Picker belongs to another member.');
  return {group,selected:values,userId:i.member.user.id};
}

export function pickerMessage(c,roles,notice='',view='simple',userId='') {
  const labels={products:'1 · Products you collect',online:'2 · Online releases & restocks',locations:'3 · Southeastern Virginia',fredericksburg:'4 · Fredericksburg & surrounding counties',projects:'5 · Projects you want to follow'};
  const entries=Object.entries(c.groups).filter(([group])=>!c.simpleNationwide||view==='rooms'? !c.simpleNationwide||['locations','fredericksburg'].includes(group):['products','online','projects'].includes(group));
  const fields=entries.map(([group,options])=>({name:labels[group],value:options.filter(o=>roles.includes(o.roleId)).map(o=>o.label).join(', ')||'None selected',inline:false}));
  if(c.simpleNationwide){
    if(!snowflake(userId))throw Error('Private member identity missing');
    const menus=entries.map(([group,options])=>({type:1,components:[{type:3,custom_id:'c3:'+group+':v1',placeholder:labels[group].replace(/^\d+ · /,''),min_values:0,max_values:options.length,options:options.map(o=>({label:o.label,value:o.key,default:roles.includes(o.roleId),...(o.emoji?{emoji:o.emoji}:{}),...(o.description?{description:o.description}:{})}))}]}));
    return {content:notice,allowed_mentions:noMentions,embeds:[{title:view==='rooms'?'Optional local rooms':'Your alerts & interests',color:0xD4AF37,description:view==='rooms'?'Your existing local-room choices stay available here. Nearby area search works across all 50 states and DC.':'Choose what you collect. Use Set nearby area to search any city or ZIP once. Online is separate and needs no local area. Existing room choices are preserved. Removing a product stops its product mentions.',fields}],components:[...menus,{type:1,components:[{type:2,style:1,custom_id:'c3:near:open:v1',label:'Set nearby area'},{type:2,style:2,custom_id:'c3:near:rooms:'+userId,label:'Optional local rooms'},{type:2,style:5,url:'https://code3tcg.app/scout/reports',label:'Browse nationwide'}]}]};
  }
  return {content:notice,allowed_mentions:noMentions,embeds:[{title:'Your alerts & interests',color:0xD4AF37,description:'Choose as many as you like in each menu. Each menu saves automatically. Remove a checkmark to stop following it.\n\nOnline releases & restocks has its own menu and needs no city selection. For local restocks, choose products **and** your areas. Southeastern Virginia and Fredericksburg have separate menus; you can follow either or both. Each region has an all-area choice. Alerts depend on connected sources and reviewed reports. Project roles show interest and do not grant product access.',fields}],components:Object.entries(c.groups).map(([group,options])=>({type:1,components:[{type:3,custom_id:`c3:${group}:v1`,placeholder:labels[group],min_values:0,max_values:options.length,options:options.map(o=>({label:o.label,value:o.key,default:roles.includes(o.roleId),...(o.emoji?{emoji:o.emoji}:{}),...(o.description?{description:o.description}:{})}))}]}))};
}

export async function applySelection(c,action,api) {
  const route=`/guilds/${c.guildId}/members/${action.userId}`;
  const [before,bot]=await Promise.all([api(route),api('/users/@me')]);
  if(!bot.bot || bot.id!==c.applicationId)throw new Error('Unexpected bot secret identity.');
  if(!Array.isArray(before.roles))throw new Error('Member roles unavailable.');
  if(action.group) {
    const options=c.groups[action.group];
    const liveRoles=await api(`/guilds/${c.guildId}/roles`);
    if(options.some(o=>{const r=liveRoles.find(r=>r.id===o.roleId);return !r||r.managed||r.mentionable||r.permissions!=='0';}))throw new Error('An interest role has changed permissions. Contact the Code 3 team.');
    const selected=new Set(action.selected.map(key=>options.find(o=>o.key===key).roleId));
    // Per-role mutations preserve staff roles and changes made in the other menus.
    for(const o of options) {
      if(selected.has(o.roleId)!==before.roles.includes(o.roleId))await api(`${route}/roles/${o.roleId}`,{method:selected.has(o.roleId)?'PUT':'DELETE'});
    }
    const after=await api(route);
    if(options.some(o=>selected.has(o.roleId)!==after.roles.includes(o.roleId)))throw new Error('Selection changed while saving. Reopen the picker and try again.');
    return pickerMessage(c,after.roles,'Saved your selection.','simple',action.userId);
  }
  return pickerMessage(c,before.roles,'','simple',action.userId);
}

export function discordClient(token,{fetchImpl=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),maxRetryAfterSeconds=5}={}) {
  if(!/^[A-Za-z0-9_.-]{30,300}$/u.test(token??''))throw new Error('Bot secret unavailable.');
  if(!Number.isFinite(maxRetryAfterSeconds)||maxRetryAfterSeconds<0||maxRetryAfterSeconds>30)throw new Error('Invalid Discord retry bound.');
  return async (route,{method='GET',body,webhook=false}={})=>{
    if(!/^\/(users\/@me|guilds\/\d{17,20}\/roles|guilds\/\d{17,20}\/members\/\d{17,20}(\/roles\/\d{17,20})?|webhooks\/\d{17,20}\/[A-Za-z0-9_.-]{20,300}\/messages\/@original)$/u.test(route))throw new Error('Invalid Discord route.');
    if(webhook!==route.startsWith('/webhooks/'))throw new Error('Invalid Discord authentication mode.');
    for(let n=0;n<3;n++) {
      let r;
      try { r=await fetchImpl(`https://discord.com/api/v10${route}`,{method,redirect:'error',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json',...(!webhook?{Authorization:`Bot ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})}); }
      catch {throw new Error('Discord connection unavailable.');}
      // A deferred response can reach Discord just before its private message is
      // available. PATCH is idempotent; retry only this narrow transient 404.
      if(webhook && method==='PATCH' && r.status===404 && n<2) {await sleep((n+1)*300);continue;}
      if(r.status===429 && n<2) { const delay=Number((await r.json()).retry_after);if(!Number.isFinite(delay)||delay<0||delay>maxRetryAfterSeconds)throw new Error('Discord is busy.');await sleep(delay*1000+100);continue; }
      if(!r.ok)throw new Error(`Discord request failed (${r.status}).`);
      return r.status===204?null:r.json();
    }
  };
}

/**
 * @param {any} c
 * @param {{token?: string, fetchImpl?: typeof fetch, waitUntil?: (task: Promise<unknown>) => void, now?: () => number, api?: ReturnType<typeof discordClient>, extraHandler?: (interaction: any) => Response | null, onFailure?: (stage: string, status: string) => unknown}} [dependencies]
 */
export function createHandler(c,{token,fetchImpl=fetch,waitUntil=(_task)=>{},now=()=>Date.now(),api:providedApi,extraHandler,onFailure}={}) {
  validateConfig(c);
  const key=crypto.subtle.importKey('raw',unhex(c.publicKey),{name:'Ed25519'},false,['verify']);
  const api=providedApi??discordClient(token,{fetchImpl});
  const report=(stage,status)=>{try{const p=onFailure?.(stage,status);if(p&&typeof p.catch==='function')p.catch(()=>{});}catch{}};
  async function processInteraction(i,action) {
    const route=`/webhooks/${c.applicationId}/${i.token}/messages/@original`;
    let stage='member-and-role-lookup';
    try {
      const body=await applySelection(c,action,api);
      stage='private-menu-response';
      await api(route,{method:'PATCH',body,webhook:true});
      console.info('role_picker_completed',action.group??'open');
    } catch(error) {
      const status=/^Discord request failed \((\d{3})\)\.$/u.exec(error?.message??'')?.[1]??'unavailable';
      console.warn('role_picker_failed',stage,status);
      // Redacted telemetry for staff error alerting (#92): stage label and status only.
      report(`picker:${stage}`,/^\d{3}$/u.test(status)?`http_${status}`:status);
      try {await api(route,{method:'PATCH',webhook:true,body:{content:'I could not confirm all your changes. Reopen Choose alerts & interests and try again. If this continues, contact the Code 3 team.',embeds:[],components:[],allowed_mentions:noMentions}});}catch {console.warn('role_picker_error_reply_failed');report('picker:error-reply','unavailable');}
    }
  }
  return async req=>{
    if(req.method!=='POST')return json({error:'Method not allowed'},405);
    const signature=req.headers.get('x-signature-ed25519')??'';
    const timestamp=req.headers.get('x-signature-timestamp')??'';
    if(!/^[a-f0-9]{128}$/iu.test(signature)||!/^\d{10}$/u.test(timestamp)||Math.abs(now()-Number(timestamp)*1000)>300_000)return json({error:'Unauthorized'},401);
    if(Number(req.headers.get('content-length')??0)>65536)return json({error:'Request too large'},413);
    // Read a bounded stream before verification; content-length is not trusted.
    const reader=req.body?.getReader();let length=0;const chunks=[];
    if(!reader)return json({error:'Invalid body'},400);
    while(true) {const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>65536){await reader.cancel();return json({error:'Request too large'},413);}chunks.push(value);}
    const raw=new Uint8Array(length);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
    const prefix=encoder.encode(timestamp);const signed=new Uint8Array(prefix.length+raw.length);signed.set(prefix);signed.set(raw,prefix.length);
    if(!await crypto.subtle.verify('Ed25519',await key,unhex(signature),signed))return json({error:'Unauthorized'},401);
    let i;try{i=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{return json({error:'Invalid JSON'},400);}
    if(i.type===1)return json({type:1});
    const extraResponse=extraHandler?.(i);
    if(extraResponse)return extraResponse;
    let action;try{action=validateInteraction(i,c);}catch{return json({type:4,data:{content:'Use the current role picker in #choose-roles.',flags:64,allowed_mentions:noMentions}});}
    // Open creates a private response; selections update that private menu.
    waitUntil(processInteraction(i,action));
    return json(action.group?{type:6}:{type:5,data:{flags:64}});
  };
}
