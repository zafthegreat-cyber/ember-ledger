import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {faceProjection} from '../src/utils/faceProjection.mjs';

test('the shallow Journey Together top remains in front of the CSS camera',()=>{
 const quad=[[.108125,.203125],[.68875,.121875],[.89,.144375],[.175,.25]];
 const width=190,height=90,m=faceProjection(quad,width,height);
 const targets=[[0,0],[width,0],[width,height],[0,height]];
 quad.forEach(([u,v],i)=>{
  const x=u*width,y=v*height,w=m[3]*x+m[7]*y+m[15];
  assert.ok(w>0,'CSS must not clip a valid photographed face');
  assert.ok(Math.abs((m[0]*x+m[4]*y+m[12])/w-targets[i][0])<1e-8);
  assert.ok(Math.abs((m[1]*x+m[5]*y+m[13])/w-targets[i][1])<1e-8);
 });
});

test('all registered face corners remain visible at compact and detail sizes',()=>{
 const registry=JSON.parse(fs.readFileSync(new URL('../src/data/productInspectionFaces.json',import.meta.url),'utf8'));
 for(const [key,model]of Object.entries(registry))for(const [face,photo]of Object.entries(model.faces)){
  for(const [width,height]of [[70,160],[190,90],[600,550]]){
   const m=faceProjection(photo.quad,width,height);
   assert.ok(m,`${key} ${face}`);
   for(const [x,y]of photo.quad)assert.ok(m[3]*x*width+m[7]*y*height+m[15]>0,`${key} ${face} must not be behind camera`);
  }
 }
});

test('native-resolution photos project to the same face without pre-shrinking thin sides',()=>{
 const registry=JSON.parse(fs.readFileSync(new URL('../src/data/productInspectionFaces.json',import.meta.url),'utf8'));
 for(const [key,model]of Object.entries(registry))for(const [face,photo]of Object.entries(model.faces)){
  const width=37,height=320,sourceWidth=1600,sourceHeight=1200;
  const m=faceProjection(photo.quad,width,height,sourceWidth,sourceHeight);
  const targets=[[0,0],[width,0],[width,height],[0,height]];
  photo.quad.forEach(([u,v],i)=>{
   const x=u*sourceWidth,y=v*sourceHeight,w=m[3]*x+m[7]*y+m[15];
   assert.ok(w>0,`${key} ${face} remains visible`);
   assert.ok(Math.abs((m[0]*x+m[4]*y+m[12])/w-targets[i][0])<1e-7,`${key} ${face} x`);
   assert.ok(Math.abs((m[1]*x+m[5]*y+m[13])/w-targets[i][1])<1e-7,`${key} ${face} y`);
  });
 }
 assert.equal(faceProjection([[0,0],[1,0],[1,1],[0,1]],100,100,0,100),null);
});
