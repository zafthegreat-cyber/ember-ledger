import { buildCollectionSetRows } from './collectionSets.mjs';
import { cardVersionKey, cardVersionOf } from './cardVersions.mjs';
export function setYear(row){const match=/^(\d{4})-\d{2}-\d{2}/.exec(row.releaseDate||'');return match?match[1]:'Not recorded';}
export function setCatalogAvailability(row){return row.catalogCardCount>0||row.catalogRecords?.length||row.totalCards>0?'catalog':'saved';}
export function projectSetLanguage(row,language){
 if(!language||language==='all')return row;
 // Reuse the established identity rules, but do not infer a language-specific checklist denominator.
 const normalized=value=>({en:'english',eng:'english',ja:'japanese',jp:'japanese'}[String(value||'').toLowerCase()]||String(value||'').toLowerCase());
 const wanted=normalized(language);const matches=item=>normalized(item.language||item.languageName||item.languageCode||item.cardLanguage)===wanted;
 const ownedItems=(row.ownedItems||[]).filter(matches),catalogRecords=(row.catalogRecords||[]).filter(matches);
 const projection=buildCollectionSetRows({items:ownedItems,catalogProducts:catalogRecords,knownSets:[{name:row.name,gameId:row.gameId,tcgGame:row.gameId}]}).find(value=>value.key===row.key);
 if(!projection)return {...row,ownedItems:[],catalogRecords:[],uniqueCardCount:0,sealedQuantity:0,itemCount:0,totalValue:0,knownValueCount:0,totalCards:null,progressPercent:null,progressLabel:'0 unique cards · Language checklist unavailable'};
 return {...row,...projection,id:row.id,key:row.key,name:row.name,series:row.series,releaseDate:row.releaseDate,logoUrl:row.logoUrl,symbolUrl:row.symbolUrl,totalCards:null,progressPercent:null,progressLabel:projection.uniqueCardCount+' unique cards · '+language+' only'};
}
export function knownVariantCoverage(entries){let targets=0,owned=0,unknown=0;for(const entry of entries){if(entry.kind!=='card'||entry.savedOnly)continue;const variants=[...new Set((entry.product.versions||[]).map(option=>cardVersionKey(option.key||option.variant)).filter(Boolean))];if(!variants.length){unknown++;continue;}targets+=variants.length;const have=new Set(entry.records.filter(record=>Number(record.quantity??1)>0).map(cardVersionOf));owned+=variants.filter(key=>have.has(key)).length;}return {targets,owned,unknown};}
export function missingChecklistRows(entries){return entries.filter(entry=>!entry.owned&&!entry.savedOnly).map(entry=>({name:entry.product.name||entry.product.title||'',number:entry.product.cardNumber||entry.product.number||'',language:entry.product.language||'',printing:(entry.product.versions||[]).map(option=>option.label||option.variant).filter(Boolean).join(' / ')||entry.product.variant||entry.product.finish||'Not recorded',kind:entry.kind}));}
