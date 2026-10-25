import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProduct, fetchGame, alertPayload, testPayload, discordClient, botCanNotify, verifyDestination, deliver, poll, GAMES, GUILD, BOT, CHANNEL } from '../supabase/functions/code3-retailer-alerts/core.mjs';
const now = new Date('2026-10-24T23:00:00Z');
const raw = { sku: 1234567, name: 'Pokemon TCG Booster Bundle', url: 'https://www.bestbuy.com/site/test/1234567.p', onlineAvailability: true };
const product = () => normalizeProduct(raw, 'pokemon', now);
function discordFixture() {
  let payload, posted = 0, wrong = false;
  const api = async (route, options) => {
    if (route === '/users/@me') return { bot: true, id: BOT };
    if (route === `/guilds/${GUILD}/members/${BOT}`) return { user: {id: BOT}, roles: ['bot-role'] };
    if (route === `/guilds/${GUILD}/roles`) return [{id: GUILD, permissions: '0'}, {id: 'bot-role', permissions: String((1n<<10n)|(1n<<11n)|(1n<<14n)|(1n<<16n))}];
    if (route === `/channels/${CHANNEL}`) return { type: 0, guild_id: GUILD, permission_overwrites: [{ id: BOT, type: 1, allow: String(1n << 17n), deny: '0' }] };
    if (options?.method === 'POST') { payload=options.body; posted++; assert.equal(payload.enforce_nonce,true); return { id:'1563700494977859705' }; }
    return { id:'1563700494977859705', channel_id:CHANNEL, author:{ id:BOT }, content:payload.content,
      mention_everyone:wrong, mentions:[], mention_roles:payload.allowed_mentions.roles, embeds:payload.embeds };
  };
  return { api, get posted() { return posted; }, setWrong() { wrong=true; } };
}
test('permission check recognizes bot-role allows and respects member-specific denies', () => {
  const mention = 1n << 17n;
  const basic = (1n<<10n)|(1n<<11n)|(1n<<14n)|(1n<<16n);
  const roles = [{id: GUILD,permissions:'0'},{id:'bot-role',permissions:String(basic|mention)}];
  const member = {user:{id:BOT},roles:['bot-role']};
  const channel = {guild_id:GUILD,permission_overwrites:[{id:GUILD,type:0,allow:'0',deny:String(mention)}]};
  assert.equal(botCanNotify(roles,member,channel),false,'channel deny overrides a global role allow');
  channel.permission_overwrites.push({id:'bot-role',type:0,allow:String(mention),deny:'0'});
  assert.equal(botCanNotify(roles,member,channel),true,'bot role channel allow overrides everyone deny');
  channel.permission_overwrites.push({id:BOT,type:1,allow:'0',deny:String(mention)});
  assert.equal(botCanNotify(roles,member,channel),false,'member deny overrides a role allow');
  channel.permission_overwrites.at(-1).allow=String(mention);
  channel.permission_overwrites.at(-1).deny='0';
  assert.equal(botCanNotify(roles,member,channel),true);
  channel.permission_overwrites.at(-1).deny=String(1n<<11n);
  assert.equal(botCanNotify(roles,member,channel),false,'mention permission cannot bypass denied send permission');
  assert.equal(botCanNotify(roles,{...member,user:{id:'other'}},channel),false);
});
test('only explicit retailer availability for supported card products is accepted', () => {
  assert.equal(product().available,true);
  for (const mutate of [r=>r.onlineAvailability='true',r=>r.onlineAvailability=null,r=>r.name='Pokemon Nintendo Video Game',
    r=>r.name='Pokemon Trading Card Binder',r=>r.url='https://evil.example/x',r=>r.url='https://api.bestbuy.com/click/a/1234567/cart',
    r=>r.url='https://www.bestbuy.com:9000/site/x',r=>r.url='https://www.bestbuy.com/site/x?apiKey=private']) {
    const item={...raw}; mutate(item); assert.equal(normalizeProduct(item,'pokemon',now),null);
  }
  assert.equal(normalizeProduct({...raw,onlineAvailability:false},'pokemon',now).available,false);
  assert.equal(normalizeProduct(raw,'unknown',now),null);
});
test('source is the official API, pagination is complete, errors never expose keys', async () => {
  let calls=0;
  const key='test-credential-1234';
  const fetchImpl=async (url,options) => {
    assert.equal(url.origin,'https://api.bestbuy.com'); assert.equal(url.searchParams.get('apiKey'),key); assert.equal(options.redirect,'error');
    calls++; return Response.json({products:[raw],totalPages:2,partial:false});
  };
  assert.equal((await fetchGame(key,'pokemon',{fetchImpl,now})).length,1); assert.equal(calls,2);
  for (const data of [{products:[raw],totalPages:6},{products:[raw],totalPages:1,partial:true},{products:[raw]}]) {
    await assert.rejects(fetchGame(key,'pokemon',{fetchImpl:async()=>Response.json(data),now}),/incomplete/);
  }
  await assert.rejects(fetchGame(key,'pokemon',{fetchImpl:async()=>{throw Error(key);},now}),e=>!e.message.includes(key));
});
test('fresh alerts select exactly one optional role and escape hostile retailer names', () => {
  const item={...product(),name:'Pokemon TCG booster @everyone <@&123456789012345678>'};
  const payload=alertPayload(item,now);
  assert.equal(payload.content,`<@&${GAMES.pokemon.role}>`);
  assert.deepEqual(payload.allowed_mentions,{parse:[],users:[],roles:[GAMES.pokemon.role],replied_user:false});
  assert.ok(!payload.embeds[0].description.includes('@everyone'));
  assert.throws(()=>alertPayload({...item,available:false},now));
  assert.throws(()=>alertPayload({...item,observedAt:'2026-10-24T22:00:00Z'},now));
  assert.throws(()=>alertPayload({...item,observedAt:'2026-10-25T23:00:00Z'},now));
  assert.ok(testPayload().embeds[0].description.includes('does not report real product availability'));
});
test('sender readback verifies all intended roles and refuses everyone or arbitrary role mentions', async () => {
  const f=discordFixture(); await verifyDestination(f.api);
  assert.equal(await deliver(f.api,testPayload(),'test-event'),'1563700494977859705');
  f.setWrong(); await assert.rejects(deliver(f.api,testPayload(),'test-event'),/readback/);
  const payload=testPayload(); payload.allowed_mentions.roles=['staff'];
  await assert.rejects(deliver(f.api,payload,'test-event'),/Unsafe/);
  assert.equal(f.posted,2);
  await assert.rejects(verifyDestination(async route=>route==='/users/@me'?{bot:true,id:BOT}:{type:0,guild_id:'other'}),/identity/);
});
test('transport retries only bounded 429, never an ambiguous POST or redirect', async () => {
  let calls=0; const waits=[];
  const api=discordClient('fake-token',{fetchImpl:async(url,options)=>{
    assert.equal(new URL(url).origin,'https://discord.com'); assert.equal(options.redirect,'error');
    return ++calls===1?Response.json({retry_after:0.1},{status:429}):Response.json({ok:true});
  },sleep:async ms=>waits.push(ms)});
  await api('/users/@me'); assert.equal(calls,2); assert.deepEqual(waits,[200]);
  calls=0; const bad=discordClient('fake-token',{fetchImpl:async()=>{calls++;throw Error('fake-token');}});
  await assert.rejects(bad('/channels/x/messages',{method:'POST',body:{}}),e=>!e.message.includes('fake-token')); assert.equal(calls,1);
});
test('poll skips concurrent runs and checks source before claiming fresh queued transitions', async () => {
  const f=discordFixture(); let acquired=false, observed=0, claimed=0, completed=0, released=0;
  const rpc=async(name,args)=>{
    if(name==='code3_discord_acquire') return acquired?null:(acquired=true,'lease');
    if(name==='code3_discord_cleanup_list') return [];
    if(name==='code3_discord_observe') { observed++; return args.p_game==='pokemon'?[{event_key:'restock-1',sku:'1234567'}]:[]; }
    if(name==='code3_discord_claim') {claimed++;return completed===0;}
    if(name==='code3_discord_complete') {completed++;return null;}
    if(name==='code3_discord_release') {acquired=false;released++;return null;}
    assert.fail(name);
  };
  const options={apiKey:'test-key-1234',api:f.api,rpc,now,fetchImpl:async()=>Response.json({products:[raw],totalPages:1,partial:false})};
  assert.deepEqual(await poll(options),{status:'ok',checked:1,sent:1,errors:0});
  assert.equal(f.posted,1); assert.equal(observed,4); assert.equal(claimed,1); assert.equal(released,1);
  await poll(options); assert.equal(f.posted,1,'same event is never sent twice');
  acquired=true; assert.equal((await poll(options)).status,'busy');
});
test('retailer failures leave observations untouched and uncertain delivery holds later pings', async () => {
  const f=discordFixture(); let uncertain=0, observed=0;
  const rpc=async(name,args)=>{
    if(name==='code3_discord_acquire') return 'lease'; if(name==='code3_discord_cleanup_list') return [];
    if(name==='code3_discord_observe') {observed++;return [{event_key:'restock-1',sku:'1234567'}];}
    if(name==='code3_discord_claim') return true; if(name==='code3_discord_uncertain') {uncertain++;return null;}
    if(name==='code3_discord_release') return null; assert.fail(name);
  };
  const opts={apiKey:'test-key-1234',api:f.api,rpc,now,fetchImpl:async()=>new Response('',{status:503})};
  assert.equal((await poll(opts)).errors,4); assert.equal(observed,0); assert.equal(f.posted,0);
  f.setWrong(); opts.fetchImpl=async()=>Response.json({products:[raw],totalPages:1,partial:false});
  assert.equal((await poll(opts)).errors,1); assert.equal(uncertain,1); assert.equal(f.posted,1);
});
