const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const espree = require('espree');
const root = path.resolve(__dirname,'..');
const source = fs.readFileSync(path.join(root,'src/App.jsx'),'utf8');
const ast = espree.parse(source,{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true},range:true});
let saveSource;
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&n.id.name==='saveSharedScoutData')saveSource=source.slice(...n.range);Object.values(n).forEach(v=>Array.isArray(v)?v.forEach(walk):v?.type&&walk(v));}
walk(ast);assert.ok(saveSource);
const key='et-tcg-beta-scout';
const output=path.join(root,'artifacts/qa/release-readiness/shared-scout-storage');
const fixture={stores:[{id:'Exact-Store-ID',name:'Synthetic shop'}],reports:[{id:'Exact-Report-ID',storeId:'Exact-Store-ID'}],alertSettings:{priceDrop:true},scoutProfile:{points:4},unknownMetadata:{preserve:['a',2]}};
const results=[];
function check(name,fn){fn();results.push({name,passed:true});console.log('PASS '+name);}
(async()=>{
  const {sanitizeScoutLocalData}=await import(pathToFileURL(path.join(root,'src/utils/betaDataCleanup.js')));
  const harness=(raw=JSON.stringify(fixture),fault={})=>{
    let current=raw,writes=0,stateWrites=0;
    const context=vm.createContext({SCOUT_STORAGE_KEY:key,sanitizeScoutLocalData,scoutSnapshot:structuredClone(fixture),
      localStorage:{getItem(name){assert.equal(name,key);if(fault.read)throw new Error('denied');return current;},setItem(name,value){assert.equal(name,key);if(fault.write)throw new Error('quota');current=value;writes++;}},
      setScoutSnapshot(update){stateWrites++;context.scoutSnapshot=update(context.scoutSnapshot);}});
    vm.runInContext(saveSource,context);
    return {save:context.saveSharedScoutData,raw:()=>current,writes:()=>writes,stateWrites:()=>stateWrites,snapshot:()=>context.scoutSnapshot};
  };
  for(const [label,raw] of [['empty string',''],['malformed JSON','{broken'],['null','null'],['array','[]'],['primitive','3'],['wrong stores shape','{"stores":{}}'],['null store row','{"stores":[null]}'],['wrong reports shape','{"reports":{}}'],['wrong alerts shape','{"alertSettings":[]}'],['wrong profile shape','{"scoutProfile":[]}']])check(label+' destination is preserved',()=>{
    const h=harness(raw);assert.throws(()=>h.save({reports:[]}));assert.equal(h.raw(),raw);assert.equal(h.writes(),0);assert.equal(h.stateWrites(),0);
  });
  for(const name of ['read','write'])check(name+' failure keeps disk and UI snapshot',()=>{
    const raw=JSON.stringify(fixture),h=harness(raw,{[name]:true});assert.throws(()=>h.save({reports:[]}));assert.equal(h.raw(),raw);assert.equal(h.writes(),0);assert.equal(h.stateWrites(),0);
  });
  for(const bad of [null,[],{stores:[null]},{reports:'invalid'},{alertSettings:[]}])check('invalid outgoing snapshot '+JSON.stringify(bad)+' is rejected',()=>{
    const raw=JSON.stringify(fixture),h=harness(raw);assert.throws(()=>h.save(bad));assert.equal(h.raw(),raw);assert.equal(h.stateWrites(),0);
  });
  check('valid report write retains stores, IDs, settings and unknown envelope fields',()=>{
    const h=harness();h.save({reports:[...fixture.reports,{id:'New-Report-ID',storeId:'Exact-Store-ID'}]});
    const saved=JSON.parse(h.raw());assert.deepEqual(saved.stores,fixture.stores);assert.deepEqual(saved.unknownMetadata,fixture.unknownMetadata);assert.deepEqual(saved.alertSettings,fixture.alertSettings);assert.equal(saved.reports.length,2);assert.equal(h.writes(),1);assert.equal(h.stateWrites(),1);assert.deepEqual(JSON.parse(JSON.stringify(h.snapshot())),saved);
  });
  check('explicit empty collection remains an intentional clear',()=>{const h=harness();h.save({stores:[]});assert.deepEqual(JSON.parse(h.raw()).stores,[]);assert.deepEqual(JSON.parse(h.raw()).reports,fixture.reports);});
  check('absent destination supports valid first write',()=>{const h=harness(null);h.save({stores:[],reports:[fixture.reports[0]]});assert.equal(JSON.parse(h.raw()).reports[0].id,'Exact-Report-ID');});
  check('string legacy aliases remain supported',()=>{const h=harness(JSON.stringify({...fixture,storeAliases:['Synthetic alias']}));h.save({reports:fixture.reports});assert.deepEqual(JSON.parse(h.raw()).storeAliases,['Synthetic alias']);});
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
  console.log(`${results.length} actual shared Scout writer checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
