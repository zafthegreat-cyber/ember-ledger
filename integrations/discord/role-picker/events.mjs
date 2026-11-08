// Redacted failure telemetry for hosted error alerting (roadmap #92).
// Only a bounded stage label and a status code ever leave the function: no member IDs, tokens,
// payloads, URLs or error text. Recording is best-effort and can never throw into a handler.
const STAGE=/^[a-z][a-z0-9_:-]{0,39}$/u,STATUS=/^[a-z0-9_]{1,24}$/u;
export const FAILURE_SOURCES=Object.freeze(['roles','monitor']);
/** Normalizes an error into a short status token: a 3-digit HTTP code when one is embedded, otherwise a coarse class. */
export function failureStatus(error){
 const message=String(error?.message??error??'');
 const code=/\((\d{3})\)\.?$/u.exec(message)?.[1];
 if(code)return `http_${code}`;
 if(/busy/iu.test(message))return 'rate_limited';
 if(/store|claim|receipt|confirm/iu.test(message))return 'store';
 if(/unavailable|connection|uncertain|timeout/iu.test(message))return 'unavailable';
 if(/mismatch|readback|identity/iu.test(message))return 'readback';
 return 'failed';
}
export function normalizeStage(stage){
 const s=String(stage??'').toLowerCase().replace(/[^a-z0-9_:-]/gu,'_').slice(0,40);
 return STAGE.test(s)?s:'unknown';
}
/** Service-only recorder; swallows every error so telemetry can never change a member-facing outcome. */
export function failureStore(url,key,{fetchImpl=fetch,source='roles'}={}){
 if(url!=='https://gxsfququorfczvhrkudl.supabase.co'||!key)throw new Error('Failure telemetry unavailable');
 if(!FAILURE_SOURCES.includes(source))throw new Error('Unknown failure source');
 return async(stage,status)=>{
  const body={p_source:source,p_stage:normalizeStage(stage),p_status:STATUS.test(String(status))?String(status):'failed'};
  try{
   const r=await fetchImpl(`${url}/rest/v1/rpc/code3_failure_record`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(3000),headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
   return r.ok;
  }catch{return false;}
 };
}
/** Wraps an optional recorder so callers can invoke it unconditionally and synchronously. */
export function failureReporter(record){
 if(typeof record!=='function')return ()=>{};
 return (stage,status)=>{try{const p=record(normalizeStage(stage),STATUS.test(String(status))?String(status):'failed');if(p&&typeof p.catch==='function')p.catch(()=>{});}catch{}};
}
