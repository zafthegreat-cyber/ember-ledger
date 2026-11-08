import {createCommunityHandler} from './core.mjs';
const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
type FeedScope={area:{lat:number;lng:number}|null;radius:number;online:boolean};
Deno.serve(createCommunityHandler({loadFeed:async({area,radius,online}:FeedScope)=>{
 if(url!=='https://gxsfququorfczvhrkudl.supabase.co'||!key)throw Error('Unavailable');
 const filtered=!!area||online;
 const r=await fetch(`${url}/rest/v1/rpc/${filtered?'code3_community_feed_v2':'code3_community_feed'}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:filtered?JSON.stringify({p_lat:area?.lat??null,p_lng:area?.lng??null,p_radius:radius,p_online:online}):'{}'});
 if(!r.ok)throw Error('Unavailable');return r.json();
}}));
