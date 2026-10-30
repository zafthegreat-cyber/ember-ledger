const SNOW=/^\d{17,20}$/u;
const categories=new Set(['pokemon','onepiece','magic','lorcana','needoh','hotwheels','collectibles']);
const statuses=new Set(['stock','preorder','backorder','empty']);
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','X-Content-Type-Options':'nosniff'};
export function publicFeed(data,now=Date.now()){
 if(data?.version!==1||!Array.isArray(data.reports)||data.reports.length>50||!Number.isFinite(Date.parse(data.generatedAt)))throw Error('Feed unavailable');
 const reports=data.reports.map(r=>{
  if(!SNOW.test(r.id)||!SNOW.test(r.channelId)||!SNOW.test(r.messageId)||!categories.has(r.category)||!statuses.has(r.status)||!['local','online'].includes(r.kind)||typeof r.product!=='string'||r.product.length<1||r.product.length>180||/^test\b|synthetic|no real inventory/iu.test(r.product)||typeof r.store!=='string'||r.store.length<1||r.store.length>300)throw Error('Invalid report');
  const observed=Date.parse(r.observedAt);if(!Number.isFinite(observed)||observed<now-86400000||observed>now+60000)throw Error('Stale report');
  if(r.kind==='online'){const u=new URL(r.store);if(u.protocol!=='https:'||u.username||u.password||u.port||! /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/iu.test(u.hostname)||/\.(local|internal|localhost)$/iu.test(u.hostname)||[...u.searchParams.keys()].some(k=>/token|auth|secret|password|session|email|signature|api.?key/iu.test(k)))throw Error('Invalid public link');}
  const areaKey=typeof r.areaKey==='string'&&/^[a-z-]{1,35}$/u.test(r.areaKey)?r.areaKey:null;
  return {id:r.id,kind:r.kind,category:r.category,product:r.product,store:r.store,status:r.status,observedAt:new Date(observed).toISOString(),areaKey,discordUrl:`https://discord.com/channels/1558588508204179611/${r.channelId}/${r.messageId}`};
 });
 return {version:1,generatedAt:new Date(data.generatedAt).toISOString(),windowHours:24,reports};
}
export function createCommunityHandler({loadFeed,now=()=>Date.now()}){
 return async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!['GET','HEAD'].includes(req.method))return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers:{...headers,Allow:'GET, HEAD, OPTIONS'}});
  if(new URL(req.url).search)return new Response(JSON.stringify({error:'Query parameters are not supported'}),{status:400,headers});
  try{const data=publicFeed(await loadFeed(),now());return new Response(req.method==='HEAD'?null:JSON.stringify(data),{headers});}
  catch{return new Response(req.method==='HEAD'?null:JSON.stringify({error:'Community reports are temporarily unavailable.'}),{status:503,headers});}
 };
}
