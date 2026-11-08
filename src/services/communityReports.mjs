import {locationScopeMatch} from '../utils/nationwideLocation.mjs';
export const COMMUNITY_FEED_URL = 'https://gxsfququorfczvhrkudl.supabase.co/functions/v1/code3-community-feed';
export const DISCORD_COMMUNITY = Object.freeze({
  reports: 'https://discord.com/channels/1558588508204179611/1563700460802670662/1563700485582749717',
  roles: 'https://discord.com/channels/1558588508204179611/1563700449024933910/1563700482277646457',
  releases: 'https://discord.com/channels/1558588508204179611/1564081801016774666',
});
export const COMMUNITY_PRODUCTS = Object.freeze({pokemon:'Pokémon',onepiece:'One Piece',magic:'Magic: The Gathering',lorcana:'Disney Lorcana',needoh:'NeeDoh',hotwheels:'Hot Wheels',collectibles:'Other Collectibles'});
export const COMMUNITY_STATUS = Object.freeze({stock:'Stock observed',preorder:'Preorder',backorder:'Backorder',empty:'Out of stock'});
const isText = (value,max) => typeof value === 'string' && value.length > 0 && value.length <= max;
export function parseCommunityFeed(payload,now=Date.now()) {
  if(payload?.version!==1 || payload.windowHours!==24 || !Number.isFinite(Date.parse(payload.generatedAt)) || !Array.isArray(payload.reports) || payload.reports.length>50) throw new Error('Community reports are unavailable.');
  const reports=payload.reports.map(report=>{
    const observedAt=Date.parse(report.observedAt);
    if(!/^\d{17,20}$/u.test(report.id)||!Object.hasOwn(COMMUNITY_PRODUCTS,report.category)||!Object.hasOwn(COMMUNITY_STATUS,report.status)||!['local','online'].includes(report.kind)||!isText(report.product,180)||!isText(report.store,300)||!Number.isFinite(observedAt)||observedAt<now-86400000||observedAt>now+60000||!/^https:\/\/discord\.com\/channels\/1558588508204179611\/\d{17,20}\/\d{17,20}$/u.test(report.discordUrl))throw new Error('Community reports are unavailable.');
    const place = report.place && typeof report.place.city === 'string' && /^[A-Z]{2}$/.test(report.place.state) && Number.isFinite(report.place.lat) && Number.isFinite(report.place.lng) && Math.abs(report.place.lat)<=90 && Math.abs(report.place.lng)<=180 ? {city:report.place.city.slice(0,100),state:report.place.state,lat:report.place.lat,lng:report.place.lng} : {};
    return {id:report.id,kind:report.kind,category:report.category,product:report.product,store:report.store,status:report.status,observedAt:new Date(observedAt).toISOString(),areaKey:typeof report.areaKey==='string'&&/^(?:[a-z-]{1,35}|us-\d{7}|zip-\d{5})$/u.test(report.areaKey)?report.areaKey:null,discordUrl:report.discordUrl,...place,areaLabel:place.city?`${place.city}, ${place.state}`:''};
  });
  return {generatedAt:new Date(payload.generatedAt).toISOString(),reports};
}
export async function loadCommunityReports({signal,fetchImpl=fetch,now=Date.now(),publicGatewayKey=import.meta.env?.VITE_SUPABASE_ANON_KEY,location}={}) {
  if(typeof publicGatewayKey!=='string'||!publicGatewayKey)throw new Error('Community reports are unavailable.');
  const params=new URLSearchParams();if(location?.mode==='nearby'&&/^(?:us-\d{7}|zip-\d{5})$/.test(location.area?.id||'')){params.set('near',location.area.id);params.set('miles',String(location.radius||25));}else if(location?.mode==='online')params.set('scope','online');
  const response=await fetchImpl(`${COMMUNITY_FEED_URL}${params.size?'?'+params:''}`,{method:'GET',credentials:'omit',cache:'no-store',redirect:'error',signal,headers:{Accept:'application/json',apikey:publicGatewayKey,Authorization:`Bearer ${publicGatewayKey}`}});
  if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Community reports are unavailable.');
  return parseCommunityFeed(await response.json(),now);
}
export function filterCommunityReports(reports,{search='',category='all',status='all',now=Date.now(),location}={}) {
  const query=search.trim().normalize('NFKC').toLocaleLowerCase();
  return reports.filter(r=>(!location||locationScopeMatch(r,location))&&Date.parse(r.observedAt)>=now-86400000&&(category==='all'||r.category===category)&&(status==='all'||r.status===status)&&(!query||[r.product,r.store,r.areaLabel||r.areaKey||'',COMMUNITY_PRODUCTS[r.category]].join(' ').normalize('NFKC').toLocaleLowerCase().includes(query)));
}
