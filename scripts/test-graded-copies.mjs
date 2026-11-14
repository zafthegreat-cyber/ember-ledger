import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {gradingDetails,gradingFieldPatch,gradedCopiesFor,gradedCopySeed,gradedCopyEditValues,applyGradedCopyEdit,gradedCertificateError} from '../src/utils/gradedCopies.mjs';
import {readLegacyGradingMetadata,buildLegacyGradingUpdate,reconcileLegacyGradingEdit} from '../src/utils/legacyGradingMetadata.mjs';
import {createFlipScoutRepository} from '../src/features/flipScout/storageRepository.js';
import {createEmptyFlipScoutState} from '../src/features/flipScout/constants.js';

const card=Object.freeze({id:'catalog-card',catalogType:'card',name:'Aipom',setName:'Twilight Masquerade',cardNumber:'145',tcgGame:'pokemon',language:'English',variant:'Normal',marketPrice:99,priceCheckedAt:'2026-11-14',purchasePrice:12});
const original=Object.freeze({...card,id:'copy-1',catalogProductId:card.id,_recordOrigin:'repository',productClassification:'Graded card',gradingCompany:'PSA',grade:'9',certificationNumber:'000123',quantity:1,allocatedItemCost:20,purchaseSource:'Card show',purchaseDate:'2026-09-01',notes:'Original receipt retained'});
const other=Object.freeze({...original,id:'copy-2',gradingCompany:'CGC',grade:'9.5',allocatedItemCost:0});
test('card identity includes printing, language, edition and authoritative IDs without name-only bridging',()=>{
 const candidates=[original,other,{...original,id:'reverse',variant:'Reverse Holofoil'},{...original,id:'japanese',language:'Japanese'},{...original,id:'other-product',catalogProductId:'different'},{...original,id:'set',setName:'Other set'},{...original,id:'number',cardNumber:'146'},{...original,id:'game',tcgGame:'magic'},{...original,id:'raw',gradingCompany:'',grade:'',certificationNumber:'',productClassification:'Raw card'},{...original,id:'conflict',catalog_product_id:'conflicting'}];
 assert.deepEqual(gradedCopiesFor(card,candidates,{catalogProduct:true}),[original,other]);
 assert.deepEqual(gradedCopiesFor({...card,edition:'1st edition'},[{...original,edition:'Unlimited'}],{catalogProduct:true}),[]);
 assert.deepEqual(gradedCopiesFor({...card,id:'',catalogType:'sealed'},candidates),[]);
 assert.equal(gradedCopiesFor({...card,id:''},[original]).length,1);
 assert.equal(gradedCopiesFor({...card,id:'',setName:''},[{...original,catalogProductId:'',setName:''}]).length,0);
});
test('new graded copy carries identity but never the original ID, certificate, purchase or raw quotes',()=>{
 const seed=gradedCopySeed(original);assert.equal(seed.catalogProductId,card.id);assert.equal(seed.quantity,1);assert.equal(seed.productClassification,'Graded card');
 for(const key of ['id','marketPrice','priceCheckedAt','purchasePrice','allocatedItemCost','notes','purchaseDate'])assert.equal(Object.hasOwn(seed,key),false,key);
 assert.equal(seed.certificationNumber,'');assert.equal(seed.grade,'');assert.equal(gradedCopySeed(card,{catalogProduct:true}).catalogProductId,card.id);
});
test('canonical clearing updates stored grading aliases and preserves certificate leading zeroes',()=>{
 const old={grading_company:'PSA',grade_value:'10',cert_number:'000123'};
 assert.deepEqual(gradingDetails(old),{gradingCompany:'PSA',grade:'10',certificationNumber:'000123'});
 const patch=gradingFieldPatch(old,'certificationNumber','');assert.equal(patch.cert_number,'');assert.equal(gradingDetails({...old,...patch}).certificationNumber,'');
 assert.deepEqual(gradingFieldPatch(old,'marketPrice','0'),{});
});
test('duplicate certificates are scoped by company, keep zeroes and exclude only the original copy',()=>{
 assert.match(gradedCertificateError({...original,id:'new',gradingCompany:'P.S.A.'},[original]),/already saved/);
 assert.equal(gradedCertificateError({...original,id:'new',gradingCompany:'CGC'},[original]),'');
 assert.equal(gradedCertificateError({...original,id:'new',certificationNumber:'123'},[original]),'');
 assert.equal(gradedCertificateError(original,[original]),'');
 assert.match(gradedCertificateError({...original,gradingCompany:''},[]),/grading company/);
 assert.match(gradedCertificateError(original,[{...original,_recordOrigin:'legacy'}]),/already saved/);
});
test('reviewed edit rebases on latest prices/notes, changes only selected fields, and rejects stale grading',()=>{
 const current={...original,marketPrice:101,priceCheckedAt:'latest',notes:'Newest note',purchaseSource:'Updated elsewhere'};
 const draft={id:original.id,...gradedCopyEditValues(original),grade:'10',marketPrice:0,notes:'stale'};
 const saved=applyGradedCopyEdit(current,original,draft,[current]);assert.equal(saved.grade,'10');assert.equal(saved.marketPrice,101);assert.equal(saved.priceCheckedAt,'latest');assert.equal(saved.notes,'Newest note');assert.equal(saved.purchaseSource,'Updated elsewhere');assert.equal(saved.id,original.id);assert.equal(saved.quantity,1);assert.equal(saved.allocatedItemCost,20);
 assert.throws(()=>applyGradedCopyEdit({...current,grade:'8'},original,draft),/changed elsewhere/);
 assert.throws(()=>applyGradedCopyEdit(undefined,original,draft),/no longer available/);
 assert.throws(()=>applyGradedCopyEdit({...current,provenanceManaged:true},original,draft),/acquisition correction/);
});
test('purchase edit preserves explicit zero and clearing, rejects negative cost and duplicate certificate',()=>{
 const draft={id:original.id,...gradedCopyEditValues(original),allocatedItemCost:'0',purchaseSource:'Trade'};
 assert.equal(applyGradedCopyEdit(original,original,draft).allocatedItemCost,0);
 assert.equal(applyGradedCopyEdit(original,original,{...draft,allocatedItemCost:''}).allocatedItemCost,'');
 assert.throws(()=>applyGradedCopyEdit(original,original,{...draft,allocatedItemCost:'-1'}),/zero or a positive/);
 assert.throws(()=>applyGradedCopyEdit(original,original,{...draft,certificationNumber:'different'},[{...other,gradingCompany:'PSA',certificationNumber:'different'}]),/already saved/);
});
test('repository lock re-reads the original so concurrent quote and receipt changes survive grading edits',async()=>{
 const data=new Map(),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
 let tail=Promise.resolve();const repo=createFlipScoutRepository(storage,{lockManager:(_key,action)=>{const next=tail.then(action);tail=next.catch(()=>{});return next;}});
 const state=createEmptyFlipScoutState();state.inventory=[original,other];repo.save(state);
 await repo.runLocked(()=>repo.upsert('inventory',{...repo.load().inventory[0],marketPrice:222,notes:'Receipt updated'}));
 const saved=await repo.runLocked(()=>{const latest=repo.load();return repo.upsert('inventory',applyGradedCopyEdit(latest.inventory[0],original,{id:original.id,...gradedCopyEditValues(original),grade:'10'},latest.inventory));});
 assert.equal(repo.load().inventory[0].marketPrice,222);assert.equal(repo.load().inventory[0].notes,'Receipt updated');assert.equal(repo.load().inventory[0].grade,'10');assert.equal(repo.load().inventory.length,2);assert.ok(saved);assert.equal(repo.load().inventory[1].certificationNumber,'000123');
});
test('legacy annotation round-trips safe grading only while preserving original text and line endings',()=>{
 const notes='Receipt ABC\r\nDo not replace this note';const result=buildLegacyGradingUpdate({notes,grading:{gradingCompany:'PSA',grade:'10',certificationNumber:'000123',marketPrice:0,quantity:999}});
 assert.ok(result.actionNotes.startsWith(notes+'\r\n'));assert.deepEqual(Object.keys(result.serverPatch),['action_notes']);assert.deepEqual(readLegacyGradingMetadata(result.actionNotes),{gradingCompany:'PSA',grade:'10',certificationNumber:'000123',graded:true});
 assert.equal(result.actionNotes.includes('marketPrice'),false);assert.equal(result.actionNotes.includes('quantity'),false);
 assert.deepEqual(readLegacyGradingMetadata('[CODE3_GRADING_V1] invalid'),{});
 const cleared=buildLegacyGradingUpdate({notes:result.actionNotes,grading:{certificationNumber:''}});assert.equal(readLegacyGradingMetadata(cleared.actionNotes).certificationNumber,'');
});
test('legacy grading edit uses the latest note chain, preserves untouched fields, and detects concurrent edits',()=>{
 const latest={...original,actionNotes:'Latest purchase note',marketPrice:555};
 const draft={id:original.id,...gradingDetails(original),grade:'10',marketPrice:0};
 const result=reconcileLegacyGradingEdit({baseline:original,current:latest,draft,notes:'Latest purchase note\n[identity annotation]',records:[latest]});
 assert.ok(result.actionNotes.startsWith('Latest purchase note\n[identity annotation]\n'));assert.equal(result.localUpdate.grade,'10');assert.equal(result.localUpdate.marketPrice,undefined);
 assert.throws(()=>reconcileLegacyGradingEdit({baseline:original,current:{...latest,grade:'8'},draft}),/changed elsewhere/);
 assert.equal(reconcileLegacyGradingEdit({baseline:original,current:latest,draft:{id:original.id,name:'unchanged grading'}}).actionNotes,latest.actionNotes);
 assert.throws(()=>reconcileLegacyGradingEdit({baseline:original,current:latest,draft:{...draft,certificationNumber:'duplicate'},records:[{...other,gradingCompany:'PSA',certificationNumber:'duplicate'}]}),/already saved/);
});

const output=await build({stdin:{contents:`export {default as Panel} from './src/components/GradedCopiesPanel.jsx';export {default as Fields} from './src/components/GradingFields.jsx';export {default as Editor} from './src/components/GradedCopyEditor.jsx';`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic',loader:{'.css':'empty'},external:['react','react/jsx-runtime'],define:{'import.meta.env':'{}'},logLevel:'silent',plugins:[{name:'catalog-fixture',setup(api){api.onResolve({filter:/^virtual:code3-set-catalog$/},()=>({path:'catalog',namespace:'fixture'}));api.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default {}',loader:'js'}));}}]});
const compiled={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),compiled,compiled.exports);
const {Panel,Fields,Editor}=compiled.exports;
async function environment(run){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid',pretendToBeVisual:true}),prior=new Map();
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true})){prior.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));
 const button=name=>[...document.querySelectorAll('button')].find(node=>(node.getAttribute('aria-label')||node.textContent.trim())===name);
 const click=async name=>{assert.ok(button(name),name);await act(async()=>button(name).click());};
 const input=label=>[...document.querySelectorAll('label')].find(node=>node.textContent.trim().startsWith(label))?.querySelector('input');
 const change=async(label,value)=>{const node=input(label);assert.ok(node,label);const props=node[Object.keys(node).find(key=>key.startsWith('__reactProps'))];await act(async()=>props.onChange({target:{value}}));};
 const submit=async()=>act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 try{await run({root,click,change,input,submit,button});}finally{await act(async()=>root.unmount());dom.window.close();for(const[key,descriptor]of prior)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}
test('graded panel shows original matching copies, exact callbacks, zero cost and redacted cost',async()=>environment(async({root,click})=>{
 let opened,edited,added=0;const props={product:card,catalogProduct:true,records:[original,other,{...original,id:'wrong',variant:'Reverse Holofoil'}],onOpenRecord:item=>opened=item,onEditRecord:(...args)=>edited=args,onAddCopy:()=>added++,canEditRecord:item=>item.id!==other.id};
 await act(async()=>root.render(React.createElement(Panel,props)));assert.equal(document.querySelectorAll('article').length,2);assert.match(document.body.textContent,/000123/);assert.match(document.body.textContent,/\$0.00/);assert.match(document.body.textContent,/not a graded valuation/);
 await click('Open graded copy 1');assert.equal(opened,original);await click('Edit grading for copy 1');assert.deepEqual(edited,[original,'grading']);await click('Edit purchase for graded copy 1');assert.deepEqual(edited,[original,'purchase']);await click('Add graded copy');assert.equal(added,1);assert.equal(document.querySelectorAll('button[aria-label^="Edit grading"]').length,1);
 await act(async()=>root.render(React.createElement(Panel,{...props,hiddenValues:true})));assert.equal(document.body.textContent.includes('$20.00'),false);assert.match(document.body.textContent,/Cost hidden/);
}));
test('grading fields use text certificates and report only a narrow field patch',async()=>environment(async({root,change,input})=>{
 let patch;await act(async()=>root.render(React.createElement(Fields,{record:original,onChange:value=>patch=value})));assert.equal(input('Certification number').type,'text');await change('Certification number','000456');assert.deepEqual(patch,{certificationNumber:'000456',graded:true});assert.equal(input('Grading company').maxLength,60);
}));
test('editor retains failed draft and calls save once while pending; latest quote fields never enter draft',async()=>environment(async({root,change,submit,input})=>{
 let calls=0,last,rejectSave;await act(async()=>root.render(React.createElement(Editor,{record:original,onCancel:()=>{},onSave:draft=>{calls++;last=draft;return new Promise((_resolve,reject)=>rejectSave=reject);}})));
 await change('Grade','10');await change('Certification number','000999');await submit();await submit();assert.equal(calls,1);assert.equal(last.marketPrice,undefined);assert.equal(last.notes,undefined);assert.equal(last.id,original.id);assert.equal(last.certificationNumber,'000999');
 await act(async()=>rejectSave(new Error('This certificate already exists.')));assert.match(document.querySelector('[role="alert"]').textContent,/already exists/);assert.equal(input('Grade').value,'10');assert.equal(input('Certification number').value,'000999');
}));
test('editor surfaces invalid cost without invoking save and accepts zero',async()=>environment(async({root,change,submit})=>{
 let calls=0,saved;await act(async()=>root.render(React.createElement(Editor,{record:original,onCancel:()=>{},onSave:async draft=>{calls++;saved=draft;return draft;}})));await change('Recorded cost','-1');await submit();assert.equal(calls,0);assert.match(document.body.textContent,/zero or a positive/);await change('Recorded cost','0');await submit();assert.equal(calls,1);assert.equal(saved.allocatedItemCost,'0');
}));
