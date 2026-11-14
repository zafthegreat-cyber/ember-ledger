import test from "node:test";
import assert from "node:assert/strict";
import { inspectionDetailSize, inspectionLightFrame, inspectionTurn, inspectionTurnFrame } from "../src/utils/inspectionMotion.mjs";

test("face selection takes the short path across the full-turn seam and ignores an unchanged face", () => {
  assert.equal(inspectionTurn({yaw:170,pitch:0},{yaw:-170,pitch:0}).to.yaw,190);
  assert.equal(inspectionTurn({yaw:-170,pitch:0},{yaw:170,pitch:0}).to.yaw,-190);
  assert.equal(inspectionTurn({yaw:0,pitch:0},{yaw:-180,pitch:0}).to.yaw,180);
  assert.equal(inspectionTurn({yaw:180,pitch:0},{yaw:-180,pitch:0}),null);
});
test("turn frames preserve endpoints, remain monotonic and never overshoot", () => {
  const from=Object.freeze({yaw:170,pitch:20}),to=Object.freeze({yaw:-170,pitch:0});
  const turn=inspectionTurn(from,to);let last=170;
  for(let elapsed=0;elapsed<=turn.duration;elapsed+=5){const frame=inspectionTurnFrame(turn,elapsed);assert.ok(frame.yaw>=last&&frame.yaw<=190);assert.ok(frame.pitch>=0&&frame.pitch<=20);last=frame.yaw;}
  assert.deepEqual(inspectionTurnFrame(turn,-20),{yaw:170,pitch:20,done:false});
  assert.deepEqual(inspectionTurnFrame(turn,10000),{yaw:190,pitch:0,done:true});
  assert.deepEqual(from,{yaw:170,pitch:20});assert.deepEqual(to,{yaw:-170,pitch:0});
});
test("close inspection sizes fit narrow stages while leaving room for box depth", () => {
  for(const width of [232,298,510,900]){
    const card=inspectionDetailSize(width,"card"),box=inspectionDetailSize(width,"box");
    assert.ok(card.width<=width-12&&card.width<=340);assert.ok(card.height>card.width*1.4);
    assert.ok(box.width*1.11<width);assert.ok(box.height>box.width);
  }
  assert.equal(inspectionDetailSize(0,"card"),null);assert.equal(inspectionDetailSize(NaN,"card"),null);
  const pack=inspectionDetailSize(298,"pack");assert.ok(pack.height>pack.width*1.5);
});
test("light response converges without overshoot or an endless idle loop", () => {
  const target={x:42,y:38};let light={x:100,y:0},done=false;
  for(let count=0;count<100&&!done;count++){const next=inspectionLightFrame(light,target,16);assert.ok(next.x<=light.x&&next.x>=42);assert.ok(next.y>=light.y&&next.y<=38);light=next;done=next.done;}
  assert.equal(done,true);assert.equal(light.x,42);assert.equal(light.y,38);
  assert.ok(Object.values(inspectionLightFrame({x:0,y:0},target,NaN)).every(value=>typeof value==="boolean"||Number.isFinite(value)));
});
