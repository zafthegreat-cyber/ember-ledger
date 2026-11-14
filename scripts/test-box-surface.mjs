import test from "node:test";
import assert from "node:assert/strict";
import { boxLighting, boxShadow } from "../src/utils/boxSurface.mjs";

test("opposite faces take the same studio light when brought to the same angle", () => {
  const front = boxLighting(0, 0).front;
  for (const [yaw, pitch, face] of [[180, 0, "back"], [90, 0, "left"], [-90, 0, "right"], [0, -90, "top"], [0, 90, "bottom"]]) {
    const other = boxLighting(yaw, pitch)[face];
    assert.ok(Math.abs(other.shade - front.shade) < 1e-12, face);
    assert.ok(Math.abs(other.gloss - front.gloss) < 1e-12, face);
  }
  assert.ok(boxLighting(0, 0).back.shade > front.shade);
});

test("box light remains bounded through full rotations, including invalid input", () => {
  for (const yaw of [-720, -180, -45, 0, 45, 180, 720, NaN]) for (const pitch of [-90, -30, 0, 30, 90, Infinity]) {
    const result = boxLighting(yaw, pitch, { x: NaN, y: Infinity });
    assert.equal(Object.keys(result).length, 6);
    for (const face of Object.values(result)) {
      assert.ok(face.shade >= .025 && face.shade <= .205);
      assert.ok(face.gloss >= .012 && face.gloss <= .097);
      assert.ok(face.x >= -60 && face.x <= 160 && face.y >= -60 && face.y <= 160);
    }
  }
});

test("pointer movement changes shrink-wrap reflections without changing face geometry", () => {
  const a = boxLighting(0, 0, { x: 0, y: 0 }), b = boxLighting(0, 0, { x: 100, y: 100 });
  assert.notEqual(a.front.x, b.front.x); assert.notEqual(a.front.y, b.front.y);
  assert.ok(a.front.gloss < .1 && b.front.gloss < .1);
});

test("shadow follows the photographed carton dimensions through front, side and top turns", () => {
  const dimensions = Object.freeze({ width: 18.4, height: 16.3, depth: 8.5 });
  const front = boxShadow(0, 0, dimensions), side = boxShadow(90, 0, dimensions), top = boxShadow(0, -90, dimensions);
  assert.equal(front.span, 1); assert.equal(front.bottom, dimensions.height / dimensions.width / 2);
  assert.ok(Math.abs(side.span - dimensions.depth / dimensions.width) < 1e-12);
  assert.ok(Math.abs(top.bottom - dimensions.depth / dimensions.width / 2) < 1e-12);
  const fullTurn = boxShadow(360, 0, dimensions);
  assert.ok(Math.abs(fullTurn.span - front.span) < 1e-12);
  assert.ok(Math.abs(fullTurn.bottom - front.bottom) < 1e-12);
  assert.ok(Object.values(boxShadow(NaN, Infinity, { width: 0 })).every(Number.isFinite));
});
