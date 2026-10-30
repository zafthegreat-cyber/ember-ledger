import {createCommunityHandler} from './core.mjs';
const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
Deno.serve(createCommunityHandler({loadFeed:async()=>{
 if(url!=='https://gxsfququorfczvhrkudl.supabase.co'||!key)throw Error('Unavailable');
 const r=await fetch(`${url}/rest/v1/rpc/code3_community_feed`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:'{}'});
 if(!r.ok)throw Error('Unavailable');return r.json();
}}));
