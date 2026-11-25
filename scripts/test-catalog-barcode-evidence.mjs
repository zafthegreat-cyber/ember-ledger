import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import evidence from '../src/data/catalogBarcodeEvidence.mjs';
import {normalizeBarcodeValue,isLikelyBarcodeValue,gtinKey,identifierEquivalents,identifiersMatch} from '../src/utils/barcodeIdentity.mjs';
import {catalogBarcodeEvidenceForProduct,verifiedBarcodeEntriesForProduct,isRejectedImportedBarcode,reviewedProductBarcode} from '../src/utils/catalogBarcodeLookup.mjs';
import {catalogIdentifiersForProduct,findCatalogProductsByBarcode,findCatalogProductByBarcode,buildManualFallbackItemSeed} from '../src/utils/inventoryImportUtils.js';

const catalogPath=new URL('../src/data/generated/sealedProducts.json',import.meta.url);
const catalog=JSON.parse(fs.readFileSync(catalogPath));
const byId=id=>{const row=catalog.find(p=>String(p.tcgplayerProductId)===String(id));assert.ok(row,`Catalog row ${id} exists`);return row;};
const plain=value=>JSON.parse(JSON.stringify(value));
function deepFreeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);Object.values(value).forEach(deepFreeze);}return value;}

// Exercise the actual scanner-matching source. Only the unrelated alias/name
// search dependency is replaced with an observable deterministic boundary.
const scanSource=fs.readFileSync(new URL('../src/utils/scanMatchUtils.js',import.meta.url),'utf8');
let aliasCalls=0;
const scanScope={identifiersMatch,isLikelyBarcodeValue,verifiedBarcodeEntriesForProduct,isRejectedImportedBarcode,normalizeCatalogName:value=>String(value||'').toLowerCase().trim(),searchCatalog:()=>{aliasCalls++;return[];}};
vm.runInNewContext(scanSource.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'')+'\nglobalThis.api={getBestCatalogMatches,matchUpcToProduct,matchSkuToProduct};',scanScope);
const scanner=scanScope.api;

test('UPC12, EAN13 and zero-padded GTIN14 agree only with valid check digits',()=>{
 assert.equal(gtinKey('196214108417'),'00196214108417');
 for(const value of ['196214108417','0196214108417','00196214108417','0 196214 108417']){
  assert.equal(gtinKey(value),'00196214108417');
  assert.equal(identifiersMatch(value,'196214108417'),true);
  assert.ok(identifierEquivalents(value).includes('0196214108417'));
 }
 assert.equal(gtinKey('196214108418'),'');
 assert.equal(identifiersMatch('196214108418','0196214108418'),false,'invalid checksum must not create padded aliases');
 assert.equal(identifiersMatch('196214108417','196214108418'),false);
 assert.equal(gtinKey('000000000000'),'');
 assert.deepEqual(identifierEquivalents('000000000000'),['000000000000']);
});

test('SKU letters survive normalization and cannot become a numeric barcode',()=>{
 assert.equal(normalizeBarcodeValue(' PKU-SV9-108417 '),'PKUSV9108417');
 assert.equal(identifiersMatch('SKU-196214108417','196214108417'),false);
 assert.equal(isLikelyBarcodeValue('SKU-196214108417'),false);
 const rows=[{id:'sku',name:'Product with SKU',sku:'PKU-SV9-108417',marketPrice:18.25}];
 assert.equal(findCatalogProductByBarcode(rows,'pku sv9 108417'),rows[0]);
 assert.equal(findCatalogProductByBarcode(rows,'9108417'),null);
 assert.equal(scanner.matchSkuToProduct('pku sv9 108417',rows)[0]?.item,rows[0]);
 assert.equal(buildManualFallbackItemSeed({upcSku:'PKU-SV9-108417'}).upcSku,'PKUSV9108417');
});

test('every runtime overlay has exact identity, valid GTIN and provenance, with no prices',()=>{
 assert.ok(Object.keys(evidence).length>40);
 for(const[key,row]of Object.entries(evidence)){
  assert.ok(row.name&&row.identity?.language,key);
  assert.ok(Array.isArray(row.barcodes)&&row.barcodes.length,key);
  for(const code of row.barcodes){assert.ok(gtinKey(code.value),key+' check digit');assert.match(code.sourcePage,/^https:\/\//);assert.ok(code.evidence,key+' evidence');}
  assert.equal(/"(?:marketPrice|marketValue|priceCheckedAt|quantity|cost|ownerId)"/.test(JSON.stringify(row)),false,key+' remains lookup-only');
 }
});

test('wrong name, language, game, edition, package or conflicting UPC cannot borrow overlay identity',()=>{
 const base=byId('593355');
 assert.ok(catalogBarcodeEvidenceForProduct(base));
 for(const patch of [{name:'Unrelated item'},{language:'Japanese'},{languageCode:'ja'},{game:'Magic'},{edition:'Pokemon Center'},{packageUnit:'case'},{productType:'Elite Trainer Box Display'},{model:'EU-OTHER-999'},{modelNumber:'EU-OTHER-999'},{model_number:'EU-OTHER-999'},{upc:'196214108417'},{barcode:'196214108417'},{tcgplayerProductId:'not-a-provider-id',catalogProductId:base.id}]){
  assert.equal(catalogBarcodeEvidenceForProduct({...base,...patch}),null,JSON.stringify(patch));
 }
 assert.equal(catalogBarcodeEvidenceForProduct({...base,language:'EN'}),evidence['tcgplayer:593355']);
 const charizard=byId('560625');
 assert.equal(evidence['tcgplayer:560625'].identity.model,'290-85819');
 assert.equal(catalogBarcodeEvidenceForProduct({...charizard,model:'290-85819'}),evidence['tcgplayer:560625']);
 assert.equal(catalogBarcodeEvidenceForProduct({...charizard,model:'10-10001-101'}),null,'explicit regional Charizard model cannot borrow US barcode evidence');
});

test('verified missing catalog barcode resolves without adding a barcode to the product',()=>{
 const row=deepFreeze(structuredClone(byId('610953'))),before=JSON.stringify(row);
 assert.equal(row.upc,'');
 assert.equal(findCatalogProductByBarcode([row],'196214108417'),row);
 assert.equal(scanner.getBestCatalogMatches('00196214108417',[row])[0]?.item,row);
 assert.equal(JSON.stringify(row),before);
});

test('a photographed Terapagos code works while old catalog metadata stays explicitly unverified',()=>{
 const row=deepFreeze(structuredClone(byId('575198'))),before=JSON.stringify(row);
 assert.equal(row.upc,'820650878664');
 assert.equal(findCatalogProductByBarcode([row],'820650858666'),row);
 assert.equal(verifiedBarcodeEntriesForProduct(row).some(code=>identifiersMatch(code.identifierValue,row.upc)),false);
 assert.equal(isRejectedImportedBarcode(row,row.upc),false,'Unresolved metadata is not falsely declared wrong');
 assert.equal(catalogBarcodeEvidenceForProduct({...row,upc:'196214108417'}),null);
 assert.equal(catalogBarcodeEvidenceForProduct({...row,name:row.name+' Case'}),null);
 assert.equal(JSON.stringify(row),before);
});

test('shared Mega Evolution assortment offers both variants and never picks one',()=>{
 const rows=[byId('648394'),byId('644279')];
 assert.deepEqual(findCatalogProductsByBarcode(rows,'196214114845').map(x=>x.tcgplayerProductId).sort(),['644279','648394']);
 assert.equal(findCatalogProductByBarcode(rows,'0196214114845'),null);
 assert.deepEqual(plain(scanner.getBestCatalogMatches('00196214114845',rows).map(x=>x.item.tcgplayerProductId)).sort(),['644279','648394']);
 for(const row of rows)assert.equal(catalogBarcodeEvidenceForProduct(row)?.sharedAssortment,true);
 assert.deepEqual(findCatalogProductsByBarcode(catalog,'196214114845').map(x=>x.tcgplayerProductId).sort(),['644279','648394'],'unrelated Ascended import is excluded in the complete catalog');
});

test('verified single-unit code cannot silently override a conflicting imported case candidate',()=>{
 const matches=findCatalogProductsByBarcode(catalog,'0196214108417');
 assert.ok(matches.some(row=>row.tcgplayerProductId==='610953'));
 assert.ok(matches.some(row=>row.tcgplayerProductId==='625584'),'existing case UPC is kept for review until independently resolved');
 assert.equal(findCatalogProductByBarcode(catalog,'0196214108417'),null);
});

test('known wrong Destined and Ascended imported barcodes are quarantined without rewriting them',()=>{
 for(const[id,wrong,right]of [['624676','0820650859526','0196214111523'],['668496','0196214114845','0196214132474']]){
  const row=deepFreeze(structuredClone(byId(id)));const before=JSON.stringify(row);
  assert.equal(row.upc,wrong);
  assert.equal(isRejectedImportedBarcode(row,wrong),true,id);
  assert.equal(findCatalogProductByBarcode([row],wrong),null,id+' bad import removed from lookup');
  assert.equal(scanner.getBestCatalogMatches(wrong,[row]).length,0,id+' scanner also rejects it');
  assert.equal(findCatalogProductByBarcode([row],right),row,id+' photographed barcode resolves');
  assert.equal(JSON.stringify(row),before);
 }
});

test('Charizard Super Premium quarantine is preserved when its photo model is integrated',()=>{
 const row=byId('560625'),entry=evidence['tcgplayer:560625'];
 assert.ok(entry,'Integrated Charizard Super Premium must have reviewed barcode evidence');
 assert.ok(entry.rejectedImportedBarcodes?.length,'Known wrong imported metadata remains explicitly quarantined');
 for(const rejected of entry.rejectedImportedBarcodes){
  assert.equal(isRejectedImportedBarcode(row,rejected.value),true);
  assert.equal(findCatalogProductByBarcode([row],rejected.value),null);
  assert.equal(scanner.getBestCatalogMatches(rejected.value,[row]).length,0);
 }
 for(const verified of entry.barcodes)assert.equal(findCatalogProductByBarcode([row],verified.value),row);
});

test('unknown numeric scan does not fall back to an alias or partial-name guess',()=>{
 aliasCalls=0;
 assert.equal(scanner.getBestCatalogMatches('123456789012',catalog).length,0);
 assert.equal(aliasCalls,0);
});

function scannerHarness({local=[],remote=[],loadSeed=async()=>local,configured=false,remoteSearch=null}={}){
 const state={matches:[],review:null,messages:[],reviewBuilds:0,remoteCalls:0};
 const scope={scanLookupRequestRef:{current:0},normalizeBarcodeValue,isLikelyBarcodeValue,findCatalogProductsByBarcode,catalogIdentifiersForProduct,getBestCatalogMatches:scanner.getBestCatalogMatches,
  detectCatalogSearchMode:value=>isLikelyBarcodeValue(value)?'barcode':'name',loadLocalCatalogSeed:loadSeed,catalogProducts:[],mergeCatalogProductLists:(a,b)=>[...a,...b],isSupabaseConfigured:configured,supabase:configured?{}:null,
  searchPokemonCatalogOnDemand:async()=>{state.remoteCalls++;return remoteSearch?remoteSearch():{rows:remote};},mapCatalog:row=>row,
  setScanInput:value=>{state.input=value;},setScanReview:value=>{state.review=value;},setScanMatches:value=>{state.matches=value;},setScanSearchState:value=>{state.status=value;},setScanMessage:value=>{state.messages.push(value);},setScanSlabDetails:value=>{state.slab=value;},setScanListingDetails:value=>{state.listing=value;},closeInventoryScanner:()=>{state.closed=true;},openQuickAddPathFlow:path=>{state.path=path;},
  buildAiCatalogMatchSummary:({matches})=>({outputSummary:matches.length+' matches'}),logAiAssistEvent:async()=>{},rememberScan:review=>{state.remembered=review;},AI_FEATURE_AREAS:{CATALOG_MATCH:'test'},scanDestination:'vault',
  buildScanReview:(raw,matches)=>{state.reviewBuilds++;return{rawValue:raw,selectedProduct:matches[0]?.item};}};
 const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const start=source.indexOf('async function handleCatalogScanMatch(value');
 const end=source.indexOf('\n  function confirmScanMatch(',start);assert.ok(start>=0&&end>start,'Actual scanner function remains extractable');
 vm.runInNewContext(source.slice(start,end)+'\nglobalThis.run=handleCatalogScanMatch;',scope);
 return{state,run:scope.run,scope};
}

test('actual scanner requires a choice for local shared-barcode matches',async()=>{
 const {state,run}=scannerHarness({local:[byId('648394'),byId('644279')]});
 await run('196214114845');
 assert.equal(state.matches.length,2);assert.equal(state.review,null);assert.equal(state.reviewBuilds,0);assert.equal(state.status,'results');
});

test('actual scanner also requires a choice for remote shared-barcode matches',async()=>{
 const {state,run}=scannerHarness({configured:true,remote:[byId('648394'),byId('644279')]});
 await run('196214114845');
 assert.equal(state.remoteCalls,1);assert.equal(state.matches.length,2);assert.equal(state.review,null);assert.equal(state.reviewBuilds,0);
});

test('actual scanner rejects a remote partial match for an exact numeric scan',async()=>{
 const {state,run}=scannerHarness({configured:true,remote:[byId('625670')]});
 await run('123456789012');assert.equal(state.matches.length,0);assert.equal(state.review,null);assert.equal(state.status,'empty');
});

test('actual scanner discards a late lookup after a newer scan has completed',async()=>{
 let resolveFirst,calls=0;
 const {state,run}=scannerHarness({loadSeed:()=>++calls===1?new Promise(resolve=>{resolveFirst=resolve;}):Promise.resolve([byId('610953')])});
 const stale=run('0196214111387');await run('0196214108417');
 resolveFirst([byId('625670')]);await stale;
 assert.equal(state.matches.length,1);assert.equal(state.matches[0].item.tcgplayerProductId,'610953');assert.equal(state.input,'0196214108417');
});

test('actual scanner does not let a stale remote error replace the new scan status',async()=>{
 let rejectFirst,remoteCalls=0;
 const {state,run}=scannerHarness({configured:true,remoteSearch:()=>++remoteCalls===1?new Promise((_,reject)=>{rejectFirst=reject;}):Promise.resolve({rows:[byId('610953')]})});
 const stale=run('0196214111387');await new Promise(resolve=>setImmediate(resolve));await run('0196214108417');const latestMessage=state.messages.at(-1);
 rejectFirst(new Error('old network failed'));await stale;
 assert.equal(state.messages.at(-1),latestMessage);assert.equal(state.status,'results');assert.equal(state.matches[0].item.tcgplayerProductId,'610953');
});

test('lookup leaves frozen collection records, quantities, costs, latest quotes and catalog bytes unchanged',()=>{
 const beforeFile=crypto.createHash('sha256').update(fs.readFileSync(catalogPath)).digest('hex');
 const record=deepFreeze({...structuredClone(byId('610953')),id:'owned-original',ownerId:'owner-fixture',quantity:3,purchasePrice:12.34,cost:37.02,marketPrice:987.65,marketValue:2962.95,priceCheckedAt:'2026-11-14T19:59:00Z',notes:'Original owner notes',copies:[{purpose:'PC',quantity:1},{purpose:'Hold',quantity:2}]});
 const before=JSON.stringify(record);
 catalogIdentifiersForProduct(record);findCatalogProductsByBarcode([record],'196214108417');scanner.getBestCatalogMatches('0196214108417',[record]);
 assert.equal(JSON.stringify(record),before);
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(catalogPath)).digest('hex'),beforeFile);
});

const appSource=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
function appSlice(startMarker,endMarker){
 const start=appSource.indexOf(startMarker),end=appSource.indexOf(endMarker,start+startMarker.length);
 assert.ok(start>=0&&end>start,`Actual App boundary ${startMarker}`);
 return appSource.slice(start,end);
}

test('actual scanner and Add autofill use physical reviewed barcodes without copying quarantined imports or changing prices',()=>{
 const scope={masterCardNumber:(item={})=>String(item.cardNumber||item.card_number||''),reviewedProductBarcode,isLikelyBarcodeValue,normalizeBarcodeValue,
  makeId:prefix=>`${prefix}-fixture`,scanMode:'upc',getTideTradrMarketInfo:row=>({currentMarketValue:row.marketPrice,msrp:row.msrpPrice}),
  normalizedInventoryProductType:row=>row.productType,getCatalogImage:row=>row.imageUrl,catalogTitle:row=>row.name,
  catalogProductTypeLabel:row=>row.productType,catalogExpansionName:row=>row.setName,catalogSourceUrl:row=>row.sourceUrl,
  firstKnownCatalogValue:(...values)=>values.find(value=>value!==undefined&&value!==null&&String(value).trim()!=='')??'',
  knownCatalogNumber:(...values)=>{const value=values.find(value=>value!==undefined&&value!==null&&value!=='');return Number.isFinite(Number(value))?Number(value):'';}};
 vm.runInNewContext(appSlice('function buildScanReview(', '\n  function beginScanProduct(')+'\n'+appSlice('function buildCatalogAutofillDetails(', '\nfunction firstCatalogTimestamp(')+'\nglobalThis.api={buildScanReview,buildCatalogAutofillDetails};',scope);
 for(const id of ['560625','624676','668496','610953']){
  const row=deepFreeze({...structuredClone(byId(id)),marketPrice:987.65,msrpPrice:42.99,priceCheckedAt:'2026-11-14T22:00:00Z'});
  const before=JSON.stringify(row),entry=catalogBarcodeEvidenceForProduct(row),physical=entry.barcodes[0].value;
  assert.ok(entry,`${id} has exact reviewed identity`);
  const reviewed=scope.api.buildScanReview(physical,[{item:row,confidencePercent:98}],'vault');
  assert.equal(identifiersMatch(reviewed.upc,physical),true,id+' scanner shows photographed barcode');
  assert.equal(isRejectedImportedBarcode(row,reviewed.upc),false,id+' scanner never shows quarantined import');
  assert.equal(reviewed.marketValue,987.65,id+' latest selected quote unchanged');
  const draft=scope.api.buildCatalogAutofillDetails(row);
  assert.equal(identifiersMatch(draft.upc,physical),true,id+' Add draft receives physical barcode');
  assert.equal(isRejectedImportedBarcode(row,draft.upc),false);
  assert.equal(draft.marketPrice,987.65);
  assert.equal(reviewedProductBarcode(row,'123456789012'),physical,'unrelated scan cannot replace exact product evidence');
  for(const rejected of entry.rejectedImportedBarcodes||[]){
   const rejectedScan=scope.api.buildScanReview(rejected.value,[{item:row}],'vault');
   assert.equal(identifiersMatch(rejectedScan.upc,physical),true,id+' rejected raw input cannot leak into draft');
  }
  assert.equal(JSON.stringify(row),before,id+' original catalog row stays byte-equivalent');
 }
});

test('actual lazy seed completion preserves the current live quote when a refresh finishes during loading',async()=>{
 let resolveModule;
 const seed=deepFreeze([{id:'same-product',name:'Original catalog identity',marketPrice:12.34,priceCheckedAt:'2025-01-01T00:00:00Z'},{id:'new-product',name:'New seed row',marketPrice:45.67}]);
 const latest=deepFreeze({id:'same-product',name:'Original catalog identity',marketPrice:987.65,priceCheckedAt:'2026-11-14T22:00:00Z',marketSource:'Current provider'});
 const before=JSON.stringify(seed),state={current:[{...latest,marketPrice:500}],statuses:[]};
 const scope={LOCAL_CATALOG_SEED_SOURCE:'local_catalog_seed',localCatalogSeedStatusRef:{current:'idle'},localCatalogSeedProductsRef:{current:[]},localCatalogSeedLoadRef:{current:null},
  loadSeedModule:()=>new Promise(resolve=>{resolveModule=resolve;}),setLocalCatalogSeedStatus:value=>state.statuses.push(value),setLocalCatalogSeedProducts:()=>{},setLocalCatalogProductUpcs:()=>{},setCatalogProducts:update=>{state.current=update(state.current);},console};
 const loader=appSlice('function loadLocalCatalogSeed(', '\n  // Loads store directories').replace('import("./data/pokemonProductCatalog")','loadSeedModule()');
 vm.runInNewContext(appSlice('function normalizeLocalCatalogSeedProducts(', '\nfunction useAutoHideHeader(')+'\n'+loader+'\nglobalThis.run=loadLocalCatalogSeed;',scope);
 const pending=scope.run('test'),samePending=scope.run('second call');assert.equal(samePending,pending,'one lazy request is shared');
 state.current=[latest];resolveModule({POKEMON_PRODUCTS:seed});await pending;
 assert.equal(state.current[0],latest,'current row object wins over bundled seed');assert.equal(state.current[0].marketPrice,987.65);assert.equal(state.current[0].priceCheckedAt,'2026-11-14T22:00:00Z');
 assert.equal(state.current.length,2);assert.equal(state.current[1].id,'new-product');assert.equal(JSON.stringify(seed),before);assert.equal(scope.localCatalogSeedStatusRef.current,'ready');
});

test('actual scanner mode change invalidates a pending result before it can repopulate the new mode',async()=>{
 let resolve;
 const {state,run,scope}=scannerHarness({loadSeed:()=>new Promise(done=>{resolve=done;})});
 const pending=run('196214108417');scope.key='picture';scope.setScanMode=value=>{state.mode=value;};scope.rememberScanMode=()=>{};
 const modeSource=appSlice('.map(([key, label, tone]) => (','<span className={`scan-product-mode-icon');
 const handler=modeSource.match(/onClick=\{\(\) => \{([\s\S]*?)\}\}/)?.[1];assert.ok(handler,'Actual scanner tab callback found');
 vm.runInNewContext(`(function(){${handler}})()`,scope);resolve([byId('610953')]);await pending;
 assert.equal(state.mode,'picture');assert.equal(state.status,'idle');assert.equal(state.review,null);assert.equal(state.matches.length,0);assert.equal(state.reviewBuilds,0);
});

test('every actual photo entry point discards the prior review when their photo or query draft changes',()=>{
 const handlers=[...appSource.matchAll(/<ProductPhotoLookup[^>]*?onDraftChange=\{\(\) => \{([^]*?)\}\} onQuery=/g)];
 assert.equal(handlers.length,4,'Photo, card, graded slab and listing screenshot modes all expose invalidation');
 for(const match of handlers){
  const {state,scope}=scannerHarness();state.matches=[byId('610953')];state.review={selectedProduct:byId('610953')};state.status='results';const old=scope.scanLookupRequestRef.current;
  vm.runInNewContext(match[1],scope);
  assert.ok(scope.scanLookupRequestRef.current>old);assert.equal(state.matches.length,0);assert.equal(state.review,null);assert.equal(state.status,'idle');
 }
});
