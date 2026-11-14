import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import postcss from 'postcss';
import {transform} from 'esbuild';

async function textPreferenceModule(source=fs.readFileSync('src/components/ReadableTextPreference.jsx','utf8'),scope={}){
 const {code}=await transform(source,{loader:'jsx',format:'cjs',jsx:'automatic'});
 const module={exports:{}};
 const require=id=>{
  if(id.endsWith('.css'))return {};
  if(id==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'};
  throw Error('Unexpected test dependency '+id);
 };
 new Function('require','module','exports',...Object.keys(scope),code)(require,module,module.exports,...Object.values(scope));
 return module.exports;
}

test('Text sizing survives denied storage access and keeps the requested session value',async()=>{
 const {readTextSize,saveTextSize,applyTextSize}=await textPreferenceModule();
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 try{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('Storage denied');}});
  assert.equal(readTextSize(),'standard');
  const choice=saveTextSize('larger');
  assert.deepEqual(choice,{value:'larger',saved:false});
  const target={dataset:{}};applyTextSize(choice.value,target);assert.equal(target.dataset.textSize,'larger');
  assert.deepEqual(saveTextSize('larger',{setItem(){throw new Error('Quota exceeded');}}),choice);
 }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
});

test('Saving reading size changes only its preference key',async()=>{
 const {saveTextSize,readTextSize,READABLE_TEXT_KEY}=await textPreferenceModule();
 const records='[{"quantity":3,"marketPrice":98.76}]';
 const store=new Map([['collection',records],['lastQuote','latest']]);
 const storage={getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)};
 assert.deepEqual(saveTextSize('larger',storage),{value:'larger',saved:true});
 assert.equal(readTextSize(storage),'larger');
 assert.equal(store.get(READABLE_TEXT_KEY),'larger');
 assert.equal(store.get('collection'),records);assert.equal(store.get('lastQuote'),'latest');
});

test('Actual app text-size control applies session preference when saving is unavailable',async()=>{
 const source=fs.readFileSync('src/App.jsx','utf8');
 const match=source.match(/function renderTextSizeControl\(\) \{[\s\S]*?\n {2}\}/);assert.ok(match);
 const {saveTextSize}=await textPreferenceModule();
 let value='standard',message='';
 const scope={ReadableTextPreference:'preference',readableTextSize:'standard',readableTextError:'',
  saveTextSize:size=>saveTextSize(size,null),setReadableTextSize:next=>{value=next;},setReadableTextError:next=>{message=next;}};
 const {renderTextSizeControl}=await textPreferenceModule('export '+match[0],scope);
 renderTextSizeControl().props.children[0].props.onChange('larger');
 assert.equal(value,'larger');assert.match(message,/changed for this session/);
});

const styles=['src/components/inventory-browser.css','src/components/operations/operations-ui.css','src/components/operations/record-experience.css','src/components/collection-portfolio.css','src/features/deferredViews/menu-drawer.css'];
async function compiled(file){return postcss.parse((await transform(fs.readFileSync(file,'utf8'),{loader:'css',minify:false})).code);}
function declaration(sheet,selector,property){let result;const normalize=value=>value.replaceAll('"','');sheet.walkRules(rule=>{if(normalize(rule.selector)===normalize(selector))rule.walkDecls(property,decl=>{result=decl.value;});});return result;}

test('Larger text reaches core labels, values, forms and navigation after CSS compilation',async()=>{
 for(const file of styles){const css=await compiled(file);const fixed=[];css.walkDecls(decl=>{if(['font','font-size'].includes(decl.prop)&&/\d(?:\.\d+)?px\b/.test(decl.value))fixed.push(decl.parent.selector+': '+decl.value);});assert.deepEqual(fixed,[],file+' must not retain fixed-pixel typography that ignores text preference');}
 const inventory=await compiled(styles[0]);
 for(const [selector,normalPx]of [['.inventory-product-context',13],['.inventory-product-facts',12],['.inventory-browser-table :is(th, td)',14]]){
  const value=declaration(inventory,selector,'font-size');assert.match(value,/^[.\d]+rem$/);assert.equal(parseFloat(value)*16,normalPx);assert.ok(parseFloat(value)*18.88>normalPx);
 }
 const forms=await compiled(styles[2]);assert.match(declaration(forms,'.ops-form-field','font-size'),/rem$/);
});

test('Text preference keeps44px targets and wraps narrow navigation without scaling imagery',async()=>{
 const css=await compiled('src/components/readable-text.css');
 assert.equal(declaration(css,':root[data-text-size="larger"]','font-size'),'118%');
 assert.equal(declaration(css,':root[data-text-size="larger"] .ops-mobile-nav button span','white-space'),'normal');
 assert.equal(declaration(css,'.readable-text-preference button','min-height'),'44px');
 assert.equal(declaration(css,'.readable-text-sample','font-size'),'1rem');
 const media=[];css.walkAtRules('media',rule=>media.push(rule.toString()));assert.ok(media.some(rule=>rule.includes('480px')&&rule.includes('grid-template-columns: minmax(0, 1fr)')));
 assert.ok(media.some(rule=>rule.includes('320px')&&rule.includes('grid-template-columns: repeat(3, minmax(0, 1fr))')&&rule.includes('min-width: 44px')),'At zoomed phone widths navigation must reflow before five44px targets no longer fit');
 css.walkDecls(decl=>assert.notEqual(decl.prop,'zoom','Text size must not magnify images or whole app geometry'));
});
