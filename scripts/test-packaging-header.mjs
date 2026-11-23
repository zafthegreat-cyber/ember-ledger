import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inspectionGeometry, productInspectionProfile, resolveInspectionArtwork } from '../src/utils/productInspection.mjs';
import { inspectionAssetUrl } from '../src/utils/inspectionAssetUrl.mjs';
const registry=JSON.parse(fs.readFileSync('src/data/productInspectionFaces.json','utf8'));
const record=Object.freeze({tcgplayerProductId:'668590',name:'Pokemon Day 2026 Collection',catalogType:'sealed',quantity:2,marketPrice:31.05,priceCheckedAt:'2026-11-14',notes:'Keep receipt',unitCost:22});

test('hanging carton keeps its header separate from all six photographed body faces',()=>{
  const before=JSON.stringify(record),model=resolveInspectionArtwork(record,registry),profile=productInspectionProfile(record,model);
  assert.equal(inspectionGeometry(profile),'box');
  assert.equal(profile.headerRequired,true);
  for(const face of ['front','back']){
    assert.equal(profile.header[face].src,profile.faces[face].src);
    assert.ok(Math.max(...profile.header[face].quad.map(p=>p[1]))<Math.min(...profile.faces[face].quad.map(p=>p[1])));
    assert.ok(fs.existsSync('public'+profile.header[face].mask));
    assert.match(inspectionAssetUrl(profile.header[face].src,{native:true}),/^https:\/\/code3tcg\.app\//);
    assert.equal(inspectionAssetUrl(profile.header[face].mask,{native:true}),profile.header[face].mask);
  }
  assert.equal(JSON.stringify(record),before);
});

test('incomplete header evidence returns the original photo gallery rather than an inaccurate carton',()=>{
  const profile=productInspectionProfile(record,resolveInspectionArtwork(record,registry));
  for(const header of [undefined,{}, {...profile.header,width:0}, {...profile.header,height:NaN}, {...profile.header,front:undefined}, {...profile.header,back:{...profile.header.back,quad:undefined}}, {...profile.header,front:{...profile.header.front,mask:''}}]){
    assert.equal(inspectionGeometry({...profile,header}),'photo');
  }
});
