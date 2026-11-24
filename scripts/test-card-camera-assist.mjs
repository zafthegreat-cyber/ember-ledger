import assert from "node:assert/strict";
import { test } from "node:test";
import { assessCardView, captureRect, createSharpnessGate, edgeSharpness, glareShare, padRect } from "../src/utils/cardCameraAssist.mjs";

const W = 160, H = 224;

// A dark table with a light card (with some print inside) at the given box (fractions).
function scene({ x = 0.1, y = 0.08, w = 0.8, h = 0.84, glare = 0, glareFrom = 10, blur = false } = {}) {
  const gray = new Uint8Array(W * H).fill(40);
  const x0 = Math.round(x * W), x1 = Math.round((x + w) * W), y0 = Math.round(y * H), y1 = Math.round((y + h) * H);
  for (let row = y0; row < y1; row += 1) {
    for (let col = x0; col < x1; col += 1) {
      const print = ((row >> 3) + (col >> 3)) % 2 ? 150 : 205;
      gray[row * W + col] = blur ? 180 : print;
    }
  }
  for (let row = y0 + glareFrom; row < y0 + glareFrom + Math.round(glare * (y1 - y0)); row += 1) for (let col = x0; col < x1; col += 1) gray[row * W + col] = 255;
  return gray;
}

test("a card lined up roughly in the frame is ready", () => {
  const view = assessCardView(scene(), W, H);
  assert.equal(view.ready, true);
  assert.ok(view.card.h > 0.75);
  // Off-center still works: the card is found, not the frame.
  assert.equal(assessCardView(scene({ x: 0.03, y: 0.12, w: 0.78, h: 0.82 }), W, H).ready, true);
});

test("tips say what to fix", () => {
  assert.match(assessCardView(new Uint8Array(W * H).fill(40), W, H).tip, /Line the card up/);
  assert.match(assessCardView(scene({ x: 0.3, y: 0.3, w: 0.35, h: 0.45 }), W, H).tip, /closer/);
  assert.match(assessCardView(scene({ glare: 0.2 }), W, H).tip, /Glare/);
  assert.match(assessCardView(scene(), W, H, { sharp: false }).tip, /focuses/);
  assert.match(assessCardView(scene({ x: 0.05, y: 0.3, w: 0.9, h: 0.46 }), W, H, { slab: true }).tip, /upright, label at the top/);
});

test("sharpness gate wants the camera's best focus, not a fixed number", () => {
  assert.ok(edgeSharpness(scene(), W, H) > edgeSharpness(scene({ blur: true }), W, H));
  const gate = createSharpnessGate();
  assert.equal(gate.push(20), true);
  assert.equal(gate.push(10), false);
  assert.equal(gate.push(19), true);
  assert.equal(createSharpnessGate().push(1), false);
  assert.equal(glareShare(scene({ glare: 0.5 }), W, H) > 0.1, true);
});

test("padding and the cut stay inside the video and fall back to the frame", () => {
  const frame = { x: 100, y: 50, width: 400, height: 560 };
  const padded = padRect(frame, 1080, 640);
  assert.deepEqual(padded, { x: 52, y: 0, width: 496, height: 640 });
  assert.deepEqual(captureRect({ padded, frame, card: null }), frame);
  const cut = captureRect({ padded, frame, card: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } });
  assert.ok(Math.abs(cut.x - (52 + 0.07 * 496)) < 0.001);
  assert.ok(Math.abs(cut.height - 0.86 * 640) < 0.001);
});

test("shine on the art is fine; glare on the name or number strip is not (Nov 24 2026)", () => {
  const cardRows = Math.round(0.84 * H);
  assert.equal(assessCardView(scene({ glare: 0.15, glareFrom: Math.round(cardRows * 0.4) }), W, H).ready, true, "glare across the middle of a holo card");
  assert.match(assessCardView(scene({ glare: 0.08, glareFrom: Math.round(cardRows * 0.9) }), W, H).tip, /Glare on the name or number/);
  assert.match(assessCardView(scene({ glare: 0.5, glareFrom: Math.round(cardRows * 0.25) }), W, H).tip, /Glare/, "glare over most of the card");
});
