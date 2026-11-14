import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';
import {readLegacyStorageLocation,writeLegacyStorageLocation} from '../src/utils/legacyStorageMetadata.mjs';
import {readLegacyCatalogIdentity} from '../src/utils/legacyCatalogIdentity.mjs';
import {readLegacyGradingMetadata} from '../src/utils/legacyGradingMetadata.mjs';
import {reviewedScreenshotReportFields} from '../src/utils/screenshotReviewExtras.mjs';
import {encodeScoutReportCloudNotes,decodeScoutReportCloudNotes,mergeScoutReportCloudSave} from '../src/utils/scoutReportCloudContext.mjs';
const source=readFileSync('src/App.jsx','utf8');const ast=parse(source,{sourceType:'module',plugins:['jsx']});
const functions={};const constants={};const pending=[ast.program];const names=['updateLegacyInventoryStorage','validateScoutVisitDateTime','sanitizeInventorySupabaseRow'];
const constantNames=['INVENTORY_ITEMS_METADATA_FIELDS','INVENTORY_ITEMS_SUPABASE_COLUMNS'];
while(pending.length){const node=pending.pop();if(!node||typeof node.type!=='string')continue;if(node.type==='FunctionDeclaration'&&names.includes(node.id?.name))functions[node.id.name]=source.slice(node.start,node.end);if(node.type==='VariableDeclarator'&&constantNames.includes(node.id?.name))constants[node.id.name]=`const ${source.slice(node.start,node.end)};`;for(const value of Object.values(node))if(Array.isArray(value))pending.push(...value);else if(value?.type)pending.push(value);}
assert.equal(Object.keys(functions).length,names.length);
assert.equal(Object.keys(constants).length,constantNames.length);
const rawFactory=new Function('scope',`with(scope){${Object.values(constants).join('\n')}\n${Object.values(functions).join('\n')}return {${names.join(',')}};}`);
const factory=scope=>rawFactory(Object.assign(scope,{readLegacyGradingMetadata}));
function setup({cloud=false,denied=false,concurrent=false,changedOwner=false,duringRead,duringWrite,beforeLocalPatch}={}){
 const initial={id:'record',workspaceId:'workspace',storageLocation:'Shelf A',actionNotes:writeLegacyStorageLocation('Keep receipt #123','Shelf A'),quantity:3,unitCost:15,marketPrice:99,lastPriceChecked:'latest'};
 const db={id:'record',workspace_id:'workspace',action_notes:initial.actionNotes,quantity:3,unit_cost:15,market_price:111};let writes=0;
 const scope={BETA_LOCAL_MODE:!cloud,user:{id:'owner'},activeWorkspace:{id:'workspace'},latestLegacyItems:{current:[{...initial}]},legacyWriteIdentity:{current:'owner:workspace'},legacyStorageSaving:{current:false},localAppStorageGuard:{getError:()=>null},blockGuestSave:()=>false,ensureWorkspaceEditor:()=>!denied,readLegacyStorageLocation,writeLegacyStorageLocation,readLegacyCatalogIdentity};
 scope.setItems=fn=>{beforeLocalPatch?.(scope);scope.latestLegacyItems.current=fn(scope.latestLegacyItems.current)};
 scope.supabase={from(table){assert.equal(table,'inventory_items');let payload=null;const filters=[];let columns;const q={update(value){payload=value;assert.deepEqual(Object.keys(payload),['action_notes']);return q},select(value){columns=value;return q},eq(key,value){filters.push([key,value]);return q},is(key,value){filters.push([key,value]);return q},async single(){assert.ok(filters.some(([key,value])=>key==='id'&&value==='record'));if(!payload){const result={...db};scope.latestLegacyItems.current[0].marketPrice=120;if(concurrent)db.action_notes+='\nAnother device edited this';if(changedOwner)scope.legacyWriteIdentity.current='other:workspace';duringRead?.(scope);return {data:result};}if(filters.some(([key,value])=>db[key]!==value))return {error:{message:'Stale'}};writes++;Object.assign(db,payload);assert.equal(columns,'id,action_notes');duringWrite?.(scope);return {data:{id:db.id,action_notes:db.action_notes}}}};return q}};
 return {scope,db,get writes(){return writes},...factory(scope)};
}
const input={changes:[{id:'record',previousStorageLocation:'Shelf A',storageLocation:'Bin 2'}]};
test('110 actual cloud batch changes only storage notes and retains newer quotes and acquisition',async()=>{
 const x=setup({cloud:true});const result=await x.updateLegacyInventoryStorage(input);assert.deepEqual(result,{updatedIds:['record'],failures:[]});assert.equal(x.writes,1);assert.equal(x.db.market_price,111);assert.equal(x.scope.latestLegacyItems.current[0].marketPrice,120);assert.equal(x.scope.latestLegacyItems.current[0].unitCost,15);assert.equal(readLegacyStorageLocation(x.db.action_notes),'Bin 2');assert.match(x.db.action_notes,/Keep receipt #123/);
});
test('110 stale cloud notes, workspace changes and denied originals cannot be overwritten',async()=>{
 for(const options of [{cloud:true,concurrent:true},{cloud:true,changedOwner:true},{cloud:true,denied:true}]){const x=setup(options);const result=await x.updateLegacyInventoryStorage(input);assert.equal(result.updatedIds.length,0);assert.equal(result.failures.length,1);assert.equal(x.writes,0);assert.equal(x.db.market_price,111);}
});
test('110 local originals use functional patches and duplicate IDs save once',async()=>{
 const x=setup();const result=await x.updateLegacyInventoryStorage({changes:[...input.changes,...input.changes]});assert.deepEqual(result.updatedIds,['record']);assert.equal(x.scope.latestLegacyItems.current.length,1);assert.equal(x.scope.latestLegacyItems.current[0].quantity,3);assert.equal(x.scope.latestLegacyItems.current[0].marketPrice,99);
});
function laterStorageEdit(scope){
 const original=scope.latestLegacyItems.current[0];
 scope.latestLegacyItems.current=[{...original,storageLocation:'Later shelf',actionNotes:writeLegacyStorageLocation('Keep receipt #123\nLater private note','Later shelf'),marketPrice:135,lastPriceChecked:'newest quote'}];
}
function assertLaterStorageRetained(x){
 const record=x.scope.latestLegacyItems.current[0];
 assert.equal(record.storageLocation,'Later shelf');assert.equal(readLegacyStorageLocation(record.actionNotes),'Later shelf');
 assert.match(record.actionNotes,/Keep receipt #123\nLater private note/);assert.equal(record.marketPrice,135);assert.equal(record.lastPriceChecked,'newest quote');
 assert.equal(record.unitCost,15);assert.equal(record.quantity,3);assert.equal(record.id,'record');
}
test('110 a newer local storage change during the cloud read cancels the write',async()=>{
 const x=setup({cloud:true,duringRead:laterStorageEdit});const result=await x.updateLegacyInventoryStorage(input);
 assert.equal(x.writes,0);assert.deepEqual(result.updatedIds,[]);assert.match(result.failures[0].message,/Storage changed since review/);
 assert.equal(readLegacyStorageLocation(x.db.action_notes),'Shelf A');assertLaterStorageRetained(x);assert.equal(x.scope.legacyStorageSaving.current,false);
});
test('110 a newer local storage change during cloud save is kept and asks for review',async()=>{
 const x=setup({cloud:true,duringWrite:laterStorageEdit});const result=await x.updateLegacyInventoryStorage(input);
 assert.equal(x.writes,1);assert.deepEqual(result.updatedIds,[]);assert.match(result.failures[0].message,/reviewed location saved to cloud.*newer local change was kept/);
 assert.equal(readLegacyStorageLocation(x.db.action_notes),'Bin 2');assert.equal(x.db.market_price,111);assert.match(x.db.action_notes,/Keep receipt #123/);assertLaterStorageRetained(x);
});
test('110 queued state updates cannot overwrite a later storage edit or account switch',async()=>{
 for(const cloud of [false,true]){
  const x=setup({cloud,beforeLocalPatch:laterStorageEdit});await x.updateLegacyInventoryStorage(input);assertLaterStorageRetained(x);
 }
 const x=setup({beforeLocalPatch:scope=>{scope.legacyWriteIdentity.current='other:workspace';laterStorageEdit(scope);}});
 await x.updateLegacyInventoryStorage(input);assertLaterStorageRetained(x);
});
test('110 concurrent notes and prices survive the storage-only functional patch',async()=>{
 const x=setup({cloud:true,beforeLocalPatch:scope=>{
  const original=scope.latestLegacyItems.current[0];scope.latestLegacyItems.current=[{...original,actionNotes:writeLegacyStorageLocation('Keep receipt #123\nNew private note','Shelf A'),marketPrice:140,lastPriceChecked:'newest quote'}];
 }});await x.updateLegacyInventoryStorage(input);
 const record=x.scope.latestLegacyItems.current[0];assert.equal(record.storageLocation,'Bin 2');assert.equal(readLegacyStorageLocation(record.actionNotes),'Bin 2');assert.match(record.actionNotes,/New private note/);assert.equal(record.marketPrice,140);assert.equal(record.unitCost,15);assert.equal(record.lastPriceChecked,'newest quote');
});
test('110 ordinary edit sanitization preserves structured storage, blank tombstones, notes and quotes',()=>{
 const {sanitizeInventorySupabaseRow}=setup();
 for(const location of ['Shelf A','']){
  const notes=writeLegacyStorageLocation('Keep receipt #123\nOriginal purchase notes',location);
  const sanitized=sanitizeInventorySupabaseRow({name:'Booster box',action_notes:notes,product_type:'Sealed',set_name:'151',unit_cost:15,market_price:125,low_price:0,last_price_checked:'newest quote'});
  assert.equal(readLegacyStorageLocation(sanitized.action_notes),location);assert.ok(sanitized.action_notes.startsWith(`${notes}\nCatalog/details:`));
  assert.match(sanitized.action_notes,/Original purchase notes/);assert.equal(sanitized.unit_cost,15);assert.equal(sanitized.market_price,125);assert.equal(sanitized.low_price,0);assert.equal(sanitized.last_price_checked,'newest quote');
 }
 assert.equal(sanitizeInventorySupabaseRow({action_notes:'Plain notes',product_type:'Sealed'}).action_notes,'Plain notes | Catalog/details: Product type: Sealed');
});
test('153 actual visit validation honors the reviewed timezone instant and drops stale assumptions',()=>{
 const form={screenshotImportReviewed:true,screenshotObservedAt:'2026-10-01T20:00:00.000Z',screenshotTimezone:'America/Los_Angeles',screenshotLocalTime:'2026-10-01T13:00',reportDate:'2026-10-01',reportTime:'13:00'};
 const handlers=factory({reviewedScreenshotReportFields,parseScoutVisitDateTime:()=>({ok:false,message:'fallback'}),SCOUT_VISIT_TIME_FUTURE_GRACE_MS:900000,SCOUT_BACKFILL_OLD_DAYS:7});
 const result=handlers.validateScoutVisitDateTime(form);assert.equal(result.iso,form.screenshotObservedAt);assert.equal(result.oldBackfill,true);
 assert.equal(handlers.validateScoutVisitDateTime({...form,reportTime:'14:00'}).message,'fallback');
});
test('151/155 reviewed rows, optional source URL and timezone survive cloud context without raw OCR',()=>{
 const form={screenshotImportReviewed:true,screenshotProductRows:[{productName:'Booster box',quantity:'',price:''},{productName:'ETB',quantity:'2',price:'59.99'}],productName:'Booster box; ETB',screenshotIncludeSourceUrl:true,screenshotSourceUrl:'https://example.org/post/12',screenshotObservedAt:'2026-10-01T20:00:00.000Z',screenshotTimezone:'America/Los_Angeles',screenshotLocalTime:'2026-10-01T13:00',reportDate:'2026-10-01',reportTime:'13:00'};
 const fields=reviewedScreenshotReportFields(form);assert.equal(fields.itemsSeen[0].quantity,'');const local={...fields,notes:'Observed report',sourceType:'text_screenshot',rawOcr:'DO NOT PUBLISH'};
 const encoded=encodeScoutReportCloudNotes(local);assert.ok(!encoded.includes('DO NOT PUBLISH'));const context=decodeScoutReportCloudNotes(encoded);assert.equal(context.timezone,form.screenshotTimezone);assert.equal(context.sourceUrl,form.screenshotSourceUrl);assert.equal(encodeScoutReportCloudNotes({...local,notes:encoded}),encoded);
 const merged=mergeScoutReportCloudSave(local,{id:'cloud',notes:context.notes,...context});assert.deepEqual(merged.itemsSeen,fields.itemsSeen);assert.equal(merged.id,'cloud');
 assert.equal(reviewedScreenshotReportFields({...form,screenshotIncludeSourceUrl:false}).sourceUrl,undefined);
 assert.equal(reviewedScreenshotReportFields({...form,productName:'Changed later'}).itemsSeen,undefined);
});
