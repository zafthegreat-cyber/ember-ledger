import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectionBoxViewport} from '../src/utils/inspectionMotion.mjs';
const shapes=[{name:'ETB',width:18.4,height:16.3,depth:8.5},{name:'tall bundle',width:1,height:1.43,depth:.7},{name:'binder',width:27,height:32.5,depth:4},{name:'wide collection',width:36.83,height:17.78,depth:9.78},{name:'surprise box',width:22.4,height:8.2,depth:11}];
for(const shape of shapes)test(`${shape.name} stays inside the stage through a full rotation`,()=>{
 for(const availableWidth of [278,326,520,726])for(const detail of [false,true]){
  const fit=inspectionBoxViewport(availableWidth,shape,detail);
  assert.ok(fit.width>0&&Number.isFinite(fit.height));
  const half=[fit.width/2,fit.width*shape.height/shape.width/2,fit.width*shape.depth/shape.width/2];
  for(let yaw=-180;yaw<=180;yaw+=15)for(let pitch=-90;pitch<=90;pitch+=15)for(const xSign of [-1,1])for(const ySign of [-1,1])for(const zSign of [-1,1]){
   const y=yaw*Math.PI/180,p=pitch*Math.PI/180;
   const x=half[0]*xSign,z=half[2]*zSign,yy=half[1]*ySign;
   const rx=x*Math.cos(y)+z*Math.sin(y),rz=-x*Math.sin(y)+z*Math.cos(y);
   const ry=yy*Math.cos(p)-rz*Math.sin(p),zz=yy*Math.sin(p)+rz*Math.cos(p);
   const scale=1100/(1100-zz);
   assert.ok(Math.abs(rx*scale)<availableWidth/2-10,'horizontal clipping');
   assert.ok(Math.abs(ry*scale)<fit.height/2-10,'vertical clipping');
  }
 }
});
test('invalid dimensions never create a fitted box',()=>{for(const dimensions of [null,{}, {width:0,height:1,depth:1},{width:1,height:NaN,depth:1}])assert.equal(inspectionBoxViewport(320,dimensions),null);assert.equal(inspectionBoxViewport(0,shapes[0]),null);});
