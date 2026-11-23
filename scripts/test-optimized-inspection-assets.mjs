import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import manifest from '../docs/image-optimization-manifest-20261123.json' with {type:'json'};
const rows=new Map(manifest.assets.map(row=>[row.url,row]));
test('approved optimized images match their reviewed bytes and quality gates',()=>{
 let bytes=0,original=0;
 for(const row of manifest.assets){
  assert.match(row.url,/^\/assets\/inspection\/[a-z0-9_./-]+\.(?:png|jpe?g|webp)$/i);
  assert.ok(!row.url.includes('..'));
  const file=readFileSync('public'+row.url);
  assert.equal(file.length,row.bytes);assert.equal(createHash('sha256').update(file).digest('hex'),row.sha256,row.url);
  assert.ok(row.bytes<=row.originalBytes);assert.ok(row.psnr>=42);if(row.card)assert.equal(row.psnr,100);
  bytes+=row.bytes;original+=row.originalBytes;
 }
 assert.equal(manifest.assets.length,794);assert.equal(rows.size,793,'One identical output is shared');assert.equal(bytes,manifest.optimizedBytes);assert.equal(original,manifest.originalBytes);
});
test('optimized face coordinates preserve the original photographed region',()=>{
 let checked=0;
 function walk(value){
  if(!value||typeof value!=='object')return;
  const row=rows.get(value.src);
  if(row){assert.equal(value.sha256,row.sha256);if(row.crop){const source=value.optimization.originalQuad;assert.equal(source.length,4);value.quad.forEach(([x,y],i)=>{assert.ok(x>=0&&x<=1&&y>=0&&y<=1);assert.ok(Math.abs((x*row.crop.width+row.crop.left)/row.width-source[i][0])<1e-12);assert.ok(Math.abs((y*row.crop.height+row.crop.top)/row.height-source[i][1])<1e-12);});checked++;}}
  Object.values(value).forEach(walk);
 }
 for(const file of ['productInspectionFaces','reviewedCardBacks','reviewedCardFronts'])walk(JSON.parse(readFileSync('src/data/'+file+'.json')));
 assert.equal(checked,486);
});
