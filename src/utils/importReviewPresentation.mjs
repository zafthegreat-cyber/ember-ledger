import { importRowIssues, parseImportRecords } from './importReviewSafety.mjs';

export const IMPORT_REVIEW_FILTERS = [['all','All'],['needs_fix','Needs a fix'],['unreviewed','Needs review'],['duplicates','Possible duplicates'],['ready','Reviewed'],['skipped','Skipped'],['imported','Imported']];
export function importReviewCategory(row, duplicate=false) {
  if (row.importStatus==='imported') return ['imported'];
  if (row.importStatus==='skipped'||row.destination==='Skip') return ['skipped'];
  const result=[];
  if(importRowIssues(row).length)result.push('needs_fix');
  if(row.needsReview&&row.importStatus!=='reviewed')result.push('unreviewed');
  if(duplicate)result.push('duplicates');
  if(!result.includes('needs_fix')&&!result.includes('unreviewed'))result.push('ready');
  return result;
}
export function filterImportReview(rows,{query='',status='all',isDuplicate=()=>false}={}) {
  const q=query.trim().toLowerCase();
  return rows.filter(row=>(!q||[row.itemName,row.sourceLine,row.originalText].some(value=>String(value??'').toLowerCase().includes(q)))&&(status==='all'||importReviewCategory(row,isDuplicate(row)).includes(status)));
}
export function importBulkPreview(rows,source={}) {
  const patch={};for(const field of ['destination','condition','store','purchaseDate'])if(source[field])patch[field]=source[field];
  if(patch.store)patch.location=patch.store;
  return {patch, rows: rows.filter(row=>!['skipped','imported'].includes(row.importStatus)&&!row.completedDestinations?.length).map(row=>({id:row.importedItemId,name:row.itemName,changes:Object.entries(patch).filter(([key,value])=>row[key]!==value).map(([field,after])=>({field,before:row[field]??'',after}))})).filter(row=>row.changes.length)};
}
export function importColumnSamples(text) {try{return parseImportRecords(text).slice(1,4).map(row=>row.cells);}catch{return [];}}
export function mappingPreset(name,headers,mapping,allowedFields) {
  const allowed=new Set(allowedFields);return {name:String(name).trim().slice(0,80),headers:headers.map(String),mapping:Object.fromEntries(Object.entries(mapping).filter(([index,value])=>/^\d+$/.test(index)&&Number(index)<headers.length&&allowed.has(value)))};
}
export const mappingPresetKey = scope => scope ? `code3.import-mapping.v1.${encodeURIComponent(scope)}` : '';
