import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import postcss from 'postcss';
import {transform} from 'esbuild';

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
