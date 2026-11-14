const clean = value => typeof value === 'string' ? value.trim() : '';
export const SCREENSHOT_TIMEZONES = ['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu'];
export function deviceTimeZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'; } catch { return 'America/New_York'; } }
export function resolveScreenshotTime(local, zone, { choice = '', now = Date.now() } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local || '')) return { ok:false, error:'Enter an observation date and time.' };
  const base=Date.parse(local+'Z'); if(!Number.isFinite(base)||base < Date.UTC(1970,0,1)||new Date(base).toISOString().slice(0,16)!==local)return {ok:false,error:'Enter a valid calendar date and time.'};
  let formatter; try { formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}); } catch { return {ok:false,error:'Choose a supported time zone.'}; }
  const valueAt=instant=>{const p=Object.fromEntries(formatter.formatToParts(instant).map(row=>[row.type,row.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;};
  const offsets=new Set([-86400000,0,86400000].map(delta=>Date.parse(valueAt(base+delta)+'Z')-(base+delta)));
  const candidates=[...offsets].map(offset=>base-offset).filter(value=>valueAt(value)===local).sort((a,b)=>a-b);
  if(!candidates.length)return {ok:false,error:'That time does not exist in this zone because the clock changes. Choose the actual time.'};
  if(candidates.length>1&&!['earlier','later'].includes(choice))return {ok:false,ambiguous:true,candidates:candidates.map(value=>new Date(value).toISOString()),error:'This time occurs twice when the clock changes. Choose the earlier or later occurrence.'};
  const timestamp=choice==='later'?candidates.at(-1):candidates[0];
  if(timestamp>now+900000)return {ok:false,error:'The observation cannot be more than 15 minutes in the future.'};
  return {ok:true,observedAt:new Date(timestamp).toISOString(),timezone:zone,local,ambiguous:candidates.length>1,candidates:candidates.map(value=>new Date(value).toISOString()),choice:candidates.length>1?choice:'',label:`${formatter.format(timestamp)} (${zone}) · ${new Date(timestamp).toISOString()}`};
}
export function screenshotTimeOccurrence(local, zone, observedAt, options = {}) {
  const result=resolveScreenshotTime(local,zone,options),instant=Date.parse(observedAt);
  if(!result.ambiguous||!Number.isFinite(instant))return '';
  const index=result.candidates.indexOf(new Date(instant).toISOString());
  return index===0?'earlier':index===result.candidates.length-1?'later':'';
}
export function relativeScreenshotTime(capture, zone, minutes, options) {
  if(clean(String(minutes))===''||!Number.isInteger(Number(minutes))||Number(minutes)<0||Number(minutes)>525600)return {ok:false,error:'Enter whole minutes ago between 0 and 525,600.'};
  const result=resolveScreenshotTime(capture,zone,options);if(!result.ok)return result;
  const instant=Date.parse(result.observedAt)-Number(minutes)*60000;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant).map(row=>[row.type,row.value]));
  const local=`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`,observedAt=new Date(instant).toISOString();
  return {ok:true,local,observedAt,choice:screenshotTimeOccurrence(local,zone,observedAt,{now:options?.now})};
}
export function normalizeScreenshotRows(rows) {
  if(!Array.isArray(rows)||rows.length>40)return {ok:false,error:'Review up to 40 products in one report.'};
  const result=[];
  for(const row of rows){const name=clean(row?.productName).replace(/\s+/g," ");if(!name)continue;if(name.length>1200)return {ok:false,error:'Shorten the product name to 1,200 characters.'};
    const quantity=clean(String(row.quantity??'')),price=clean(String(row.price??''));
    if(quantity!==''&&(!/^\d+$/.test(quantity)||!Number.isSafeInteger(Number(quantity))||Number(quantity)>1000000))return {ok:false,error:'Quantity must be a whole number, or blank when unknown.'};
    if(price!==''&&(!/^\d+(?:\.\d{1,2})?$/.test(price)||Number(price)>10000000))return {ok:false,error:'Reported price must be a nonnegative amount with at most two decimals, or blank.'};
    result.push({productName:name,quantity,price});}
  return {ok:true,rows:result};
}
export function safeScreenshotSourceUrl(value) {
  const input=clean(value);if(!input)return '';
  try{const url=new URL(input);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&input.length<=2000?url.href:'';}catch{return '';}
}
// Only explicitly reviewed screenshot metadata is carried into the existing save.
export function reviewedScreenshotReportFields(form={}) {
  if(!form.screenshotImportReviewed)return {};
  const result={};const rows=normalizeScreenshotRows(form.screenshotProductRows);
  if(rows.ok&&rows.rows.length&&rows.rows.map(row=>row.productName).join('; ')===clean(form.productName))result.itemsSeen=rows.rows;
  if(form.screenshotObservedAt&&form.screenshotTimezone&&form.screenshotLocalTime===`${form.reportDate}T${form.reportTime}`&&Number.isFinite(Date.parse(form.screenshotObservedAt))){result.observedAt=form.screenshotObservedAt;result.timezone=form.screenshotTimezone;}
  if(form.screenshotIncludeSourceUrl===true){const sourceUrl=safeScreenshotSourceUrl(form.screenshotSourceUrl);if(sourceUrl)result.sourceUrl=sourceUrl;}
  return result;
}
export function createScreenshotUndo(before,patch,current){const restored={};for(const key of Object.keys(patch)){if(JSON.stringify(current[key])===JSON.stringify(patch[key]))restored[key]=before[key];}return restored;}
export function screenshotOcrReadiness({online=globalThis.navigator?.onLine,worker=typeof Worker,wasm=typeof WebAssembly,native=import.meta.env?.VITE_NATIVE_BUILD==='true'}={}) {
  if(worker!=='function'||wasm!=='object')return {state:'unavailable',label:'Text reading unavailable',detail:'Paste the post text or enter details manually on this device.'};
  if(native)return {state:'available',label:'Text reader included in the app',detail:'The installed app includes the reader. If a file cannot be read, paste text or enter details.'};
  return online===false?{state:'unavailable',label:'Offline text reader not prepared',detail:'Connect to read a screenshot. You can paste text or enter details while offline.'}:{state:'not-prepared',label:'Text reader downloads when needed',detail:'This browser does not keep a verified offline reader. Allow the first download before reading; the image stays on this device.'};
}
