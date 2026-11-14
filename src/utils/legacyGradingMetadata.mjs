import { gradingDetails, gradingFieldPatch, gradedCertificateError } from './gradedCopies.mjs';
const PREFIX='[CODE3_GRADING_V1] ';
const limits={gradingCompany:60,grade:60,certificationNumber:120};
const fieldAliases={gradingCompany:['gradingCompany','grading_company','grader'],grade:['grade','gradeValue','grade_value'],certificationNumber:['certificationNumber','certification_number','certNumber','cert_number']};
function safe(value={}){
 const result={};
 for(const[key,limit]of Object.entries(limits)){
  if(!Object.hasOwn(value,key)||!['string','number'].includes(typeof value[key]))continue;
  const text=String(value[key]).trim();
  if(text.length<=limit&&!/[\u0000-\u001f\u007f]/.test(text))result[key]=text;
 }
 return result;
}
export function readLegacyGradingMetadata(notes=''){
 let fields={};
 for(const line of String(notes||'').split(/\r?\n/)){
  if(!line.startsWith(PREFIX))continue;
  try{const payload=JSON.parse(line.slice(PREFIX.length));if(payload?.version===1)fields={...fields,...safe(payload.grading)};}catch{/* Ignore damaged annotations without changing records. */}
 }
 return Object.keys(fields).length?{...fields,graded:Object.values(fields).some(Boolean)}:{};
}
export function buildLegacyGradingUpdate({notes='',grading={}}={}){
 const original=String(notes??''),patch=safe(grading),previous=readLegacyGradingMetadata(original);
 if(!Object.keys(patch).length)return{actionNotes:original,localUpdate:previous,serverPatch:{}};
 const merged={...safe(previous),...patch},localUpdate={...merged,graded:Object.values(merged).some(Boolean)};
 const newline=original.includes('\r\n')?'\r\n':'\n';
 const actionNotes=original+(original&&!original.endsWith('\n')?newline:'')+PREFIX+JSON.stringify({version:1,grading:merged});
 return{actionNotes,localUpdate,serverPatch:{action_notes:actionNotes}};
}
/** Only edited grading fields are appended; never copy quotes or unrelated draft fields. */
export function reconcileLegacyGradingEdit({baseline,current,draft,notes,records=[]}={}){
 if(!current?.id||baseline?.id&&baseline.id!==current.id||draft?.id&&draft.id!==current.id)throw new Error('Reopen the original copy before editing its grading details.');
 const before=gradingDetails(baseline),latest=gradingDetails(current),submitted=gradingDetails(draft),patch={};
 let updated={...current};
 for(const key of Object.keys(limits)){
  if(!fieldAliases[key].some(field=>Object.hasOwn(draft||{},field)))continue;
  if(submitted[key]===before[key])continue;
  if(latest[key]!==before[key])throw new Error('This copy’s grading details changed elsewhere. Reopen the copy before saving.');
  const cleaned=safe({[key]:submitted[key]});if(!Object.hasOwn(cleaned,key))throw new Error('The grading details contain an unsupported value.');
  patch[key]=cleaned[key];updated={...updated,...gradingFieldPatch(updated,key,cleaned[key])};
 }
 const error=Object.keys(patch).length?gradedCertificateError(updated,records,{excludeId:current.id,excludeOrigin:current._recordOrigin}):'';if(error)throw new Error(error);
 const result=buildLegacyGradingUpdate({notes:notes??current.actionNotes??current.action_notes??'',grading:Object.keys(patch).length?{...latest,...patch}:{}});
 // Existing aliases are updated together, including explicit blank tombstones.
 const aliases={};for(const[key,value]of Object.entries(patch))Object.assign(aliases,gradingFieldPatch(updated,key,value));
 return{...result,localUpdate:{...result.localUpdate,...aliases}};
}
