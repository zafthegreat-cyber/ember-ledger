import { getRecordGame } from './collectibleGames.mjs';
import { setCatalogKind, setCatalogName, setCatalogNumber } from './setCatalog.mjs';
import { collectionSetNameKey, collectionSetCardNumberKey } from './collectionSets.mjs';
import { cardVersionOf } from './cardVersions.mjs';
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const normal = value => text(value).normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g,' ');
const aliases = {
 gradingCompany:['gradingCompany','grading_company','grader'],
 grade:['grade','gradeValue','grade_value'],
 certificationNumber:['certificationNumber','certification_number','certNumber','cert_number'],
};
function preferred(record,keys) { for(const key of keys) if(record[key] !== undefined) return text(record[key]); return ''; }
export function gradingDetails(record={}) { return Object.fromEntries(Object.entries(aliases).map(([key,fields])=>[key,preferred(record,fields)])); }
export function isGradedCopy(record={}) { return record.graded===true || Object.values(gradingDetails(record)).some(Boolean) || /^(graded|graded card|slab)$/i.test(record.productClassification || record.catalogType || record.productType || ''); }
export function gradingFieldPatch(record={}, key, value) {
 if(!Object.hasOwn(aliases,key)) return {};
 const cleaned=text(value), patch={[key]:cleaned};
 for(const alias of aliases[key]) if(Object.hasOwn(record,alias))patch[alias]=cleaned;
 const details={...gradingDetails(record),[key]:cleaned};
 return {...patch,graded:Object.values(details).some(Boolean)};
}
const idFields={catalog:['catalogProductId','catalog_product_id','catalogItemId','catalog_item_id'],tcgplayer:['tcgplayerProductId','tcgplayer_product_id']};
function identities(record,catalogProduct=false) {return Object.fromEntries(Object.entries(idFields).map(([namespace,fields])=>[namespace,new Set([...fields.map(key=>text(record[key])),...(catalogProduct&&namespace==='catalog'?[text(record.id)]:[])].filter(Boolean))]));}
function matchingCard(product,record,catalogProduct) {
 if(setCatalogKind(product)!=='card'||setCatalogKind(record)!=='card')return false;
 const game=getRecordGame(product);if(game==='unspecified'||getRecordGame(record)!==game)return false;
 const set=row=>collectionSetNameKey(row.setName||row.set_name||row.expansion||'',game),number=row=>collectionSetCardNumberKey(setCatalogNumber(row));
 const language=row=>({en:'english',eng:'english',ja:'japanese',jp:'japanese'})[normal(row.language||row.cardLanguage)]||normal(row.language||row.cardLanguage);
 for(const get of [set,number,language,row=>normal(row.edition),cardVersionOf])if(get(product)&&get(record)&&get(product)!==get(record))return false;
 const a=identities(product,catalogProduct),b=identities(record);
 let shared=false;
 for(const key of Object.keys(idFields)){
  if(a[key].size>1||b[key].size>1)return false;
  if(a[key].size&&b[key].size){if([...a[key]][0]!==[...b[key]][0])return false;shared=true;}
 }
 if(shared)return true;
 // No name-only matches and no bridging two unrelated authoritative IDs.
 if(Object.values(a).some(values=>values.size)&&Object.values(b).some(values=>values.size))return false;
 return Boolean(set(product)&&number(product)&&set(record)&&number(record)&&set(product)===set(record)&&number(product)===number(record)&&normal(setCatalogName(product))===normal(setCatalogName(record)));
}
export function gradedCopiesFor(product,records=[],{catalogProduct=false}={}) {
 return records.filter(record=>isGradedCopy(record)&&matchingCard(product,record,catalogProduct));
}
/** New physical copy: deliberately omit record ID, certification, purchase and raw-card quotes. */
export function gradedCopySeed(product={}, {catalogProduct=false}={}) {
 const seed={name:setCatalogName(product),tcgGame:getRecordGame(product),quantity:1,productClassification:'Graded card',graded:true,gradingCompany:'',grade:'',certificationNumber:''};
 const fields=['setName','set_name','expansion','cardNumber','card_number','language','variant','finish','printing','edition','catalogProductId','catalog_product_id','tcgplayerProductId','tcgplayer_product_id','imageUrl','photoUrl','itemImage','catalogSource'];
 for(const field of fields)if(product[field]!==undefined)seed[field]=product[field];
 if(catalogProduct&&product.id)seed.catalogProductId=String(product.id);
 return seed;
}

export function gradedCopyEditValues(record={}) {
 return {...gradingDetails(record),purchaseSource:record.purchaseSource??record.purchase_source??record.source??'',purchaseDate:record.purchaseDate??record.purchase_date??record.acquisitionDate??'',allocatedItemCost:record.allocatedItemCost??record.allocatedCost??record.totalPurchaseCost??record.purchasePrice??record.actualPurchasePrice??''};
}
/** Apply only reviewed grading/purchase fields to the latest original inside its existing lock. */
export function applyGradedCopyEdit(current,baseline,draft,records=[]) {
 if(!current||!baseline?.id||current.id!==baseline.id||draft?.id!==baseline.id)throw new Error('This copy is no longer available. Reopen it before saving.');
 if(current.provenanceManaged===true)throw new Error('This copy now requires its original acquisition correction workflow.');
 const before=gradedCopyEditValues(baseline),latest=gradedCopyEditValues(current);let result={...current};
 for(const key of Object.keys(before)){
  if(!Object.hasOwn(draft,key)||String(draft[key]??'')===String(before[key]??''))continue;
  if(String(latest[key]??'')!==String(before[key]??''))throw new Error('These grading or purchase details changed elsewhere. Reopen this copy to review them.');
  const value=text(draft[key]);
  if(key==='allocatedItemCost'&&value!==''&&(!Number.isFinite(Number(value))||Number(value)<0))throw new Error('Recorded cost must be zero or a positive number, or left blank.');
  if(Object.hasOwn(aliases,key))result={...result,...gradingFieldPatch(result,key,value)};
  else result[key]=key==='allocatedItemCost'&&value!==''?Number(value):value;
 }
 const duplicate=gradedCertificateError(result,records,{excludeId:current.id,excludeOrigin:current._recordOrigin});
 if(duplicate)throw new Error(duplicate);
 return result;
}

export function gradedCertificateError(record,records=[],{excludeId=record?.id,excludeOrigin=record?._recordOrigin}={}) {
 const details=gradingDetails(record),company=normal(details.gradingCompany).replace(/[.\s-]+/g,''),cert=normal(details.certificationNumber).replace(/\s+/g,'');
 if(!cert)return '';
 if(!company)return 'Add the grading company so this certificate can be identified correctly.';
 const duplicate=records.find(other=>{
  if(excludeId!=null&&String(other.id)===String(excludeId)&&(!excludeOrigin||!other._recordOrigin||other._recordOrigin===excludeOrigin))return false;
  const found=gradingDetails(other);
  return normal(found.gradingCompany).replace(/[.\s-]+/g,'')===company&&normal(found.certificationNumber).replace(/\s+/g,'')===cert;
 });
 return duplicate?'A copy with this grading company and certification number is already saved. Open that copy instead of adding the certificate again.':'';
}
