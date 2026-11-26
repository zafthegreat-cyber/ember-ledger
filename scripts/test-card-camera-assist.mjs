import assert from "node:assert/strict";
import { test } from "node:test";
import { assessCardView, captureRect, createSharpnessGate, edgeSharpness, glareShare, padRect, sameCardBox } from "../src/utils/cardCameraAssist.mjs";

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
  assert.match(assessCardView(scene({ x: 0.3, y: 0.3, w: 0.45, h: 0.45 }), W, H).tip, /closer/);
  assert.match(assessCardView(scene({ glare: 0.2 }), W, H).tip, /Glare/);
  assert.match(assessCardView(scene(), W, H, { sharp: false }).tip, /focuses/);
  assert.match(assessCardView(scene({ x: 0.05, y: 0.3, w: 0.9, h: 0.38 }), W, H, { slab: true }).tip, /upright, label at the top/);
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

test("only a card-shaped outline counts as the card (Nov 24 2026)", () => {
  // A square box (the art window, a sticker) is not a card, so the picture is not cut to it.
  assert.equal(assessCardView(scene({ x: 0.15, y: 0.2, w: 0.7, h: 0.5 }), W, H).card, null);
  // A slab is taller than a card: the slab camera wants that shape, the card camera does not.
  const slabScene = scene({ x: 0.17, y: 0.04, w: 0.66, h: 0.9 });
  assert.equal(assessCardView(slabScene, W, H, { slab: true }).ready, true);
  assert.equal(assessCardView(slabScene, W, H).card, null);
});

test("a card that is close and upright is usable even with glare or soft focus", () => {
  const cardRows = Math.round(0.84 * H);
  const glare = assessCardView(scene({ glare: 0.08, glareFrom: Math.round(cardRows * 0.9) }), W, H);
  assert.equal(glare.ready, false);
  assert.equal(glare.usable, true);
  assert.equal(assessCardView(scene(), W, H, { sharp: false }).usable, true);
  assert.equal(assessCardView(scene({ x: 0.3, y: 0.3, w: 0.45, h: 0.45 }), W, H).usable, false, "too far away");
  assert.equal(assessCardView(new Uint8Array(W * H).fill(40), W, H).usable, false);
});

test("a card with no detail of its own is not sharp, whatever the gate says", () => {
  const view = assessCardView(scene({ blur: true }), W, H, { sharp: true });
  assert.equal(view.ready, false);
  assert.match(view.tip, /focuses/);
  assert.ok(edgeSharpness(scene(), W, H, { x: 0.1, y: 0.08, w: 0.8, h: 0.84 }) > 3);
});

test("the same card in the same place is recognised between looks", () => {
  const box = { x: 0.1, y: 0.08, w: 0.8, h: 0.84 };
  assert.equal(sameCardBox(box, { x: 0.12, y: 0.07, w: 0.79, h: 0.85 }), true);
  assert.equal(sameCardBox(box, { x: 0.2, y: 0.08, w: 0.8, h: 0.84 }), false);
  assert.equal(sameCardBox(box, null), false);
});

// Nov 26 2026 (owner: "keep improving the scanner").
test("a view that stays blurry says why: too dark, too close, or more light", async () => {
  const { brightLevel, coachTip, createFocusCoach, CAMERA_ASSIST } = await import("../src/utils/cardCameraAssist.mjs");
  // A lit card on a dark table is bright where it counts; a dim room is not.
  assert.ok(brightLevel(scene()) > 140);
  const dimRoom = new Uint8Array(W * H).fill(14);
  for (let row = Math.round(0.08 * H); row < Math.round(0.92 * H); row += 1) for (let col = Math.round(0.1 * W); col < Math.round(0.9 * W); col += 1) dimRoom[row * W + col] = 56;
  assert.ok(brightLevel(dimRoom) < CAMERA_ASSIST.darkLevel);
  const dark = assessCardView(dimRoom, W, H);
  assert.equal(dark.soft, true);
  assert.equal(dark.dark, true);
  assert.equal(dark.usable, true, "a dark card held still is still taken in the end");
  assert.equal(coachTip(dark).tip, "It's too dark to read the card. Move to better light.");
  assert.deepEqual(coachTip(dark, "", { torchAvailable: true }), { tip: "It's too dark to read the card. Turn on the flashlight.", suggest: "torch" });
  assert.equal(coachTip(dark, "", { torchAvailable: true, torchOn: true }).suggest, "", "the flashlight is already on");
  // Soft focus in good light: the usual tip first, advice after about three seconds.
  const soft = assessCardView(scene({ blur: true }), W, H);
  assert.equal(soft.soft, true);
  assert.equal(soft.dark, false);
  const coach = createFocusCoach();
  for (let look = 1; look < CAMERA_ASSIST.blurryLooks; look += 1) assert.equal(coach.push(soft), "", `look ${look}`);
  assert.equal(coachTip(soft, "").tip, "Hold steady while it focuses.");
  assert.equal(coach.push(soft), "light");
  assert.equal(coachTip(soft, "light").tip, "Still blurry. Try brighter light.");
  assert.deepEqual(coachTip(soft, "light", { torchAvailable: true }), { tip: "Still blurry. Try the flashlight or brighter light.", suggest: "torch" });
  // A sharp look in between starts the count again.
  assert.equal(coach.push(assessCardView(scene(), W, H)), "");
  assert.equal(coach.push(soft), "");
  // A card filling the whole view is closer than a phone can focus.
  const close = { ...soft, card: { ...soft.card, h: 0.95 } };
  const closeCoach = createFocusCoach({ looks: 2 });
  closeCoach.push(close);
  assert.equal(closeCoach.push(close), "back");
  assert.deepEqual(coachTip(close, "back", { zoomAvailable: true }), { tip: "Still blurry. Move back a little, then tap Zoom.", suggest: "zoom" });
  assert.equal(coachTip(close, "back", { zoomAvailable: true, zoomed: true }).tip, "Still blurry. Move back a little so the camera can focus.");
  closeCoach.reset();
  assert.equal(closeCoach.push(close), "");
  // Other tips pass through untouched; flashlight glare names the flashlight.
  const ready = assessCardView(scene(), W, H);
  assert.deepEqual(coachTip(ready, "light"), { tip: ready.tip, suggest: "" });
  const glare = assessCardView(scene({ glare: 0.2 }), W, H);
  assert.match(coachTip(glare).tip, /^Glare on the name or number/);
  assert.equal(coachTip(glare, "", { torchAvailable: true, torchOn: true, slab: true }).tip, "Glare from the flashlight. Turn it off or tilt the slab a little.");
  assert.deepEqual(coachTip(null), { tip: "", suggest: "" });
});

test("the sharpest of the pictures taken in a row is the one kept", async () => {
  const { sharpestOf, textStripRows } = await import("../src/utils/cardCameraAssist.mjs");
  assert.equal(sharpestOf([4.1, 9.6, 7]), 1);
  assert.equal(sharpestOf([5, 5, 5]), 0, "the first wins a tie");
  assert.equal(sharpestOf([Number.NaN, 2]), 1);
  assert.equal(sharpestOf([]), -1);
  // The strips compared are the ones the reader needs: name at the top, number at the bottom.
  assert.deepEqual(textStripRows(1200), [{ y: 0, h: 192 }, { y: 1044, h: 156 }]);
  assert.deepEqual(textStripRows(1200, true), [{ y: 0, h: 300 }], "a slab: its label");
  for (const height of [9, 40, 333, 2001]) for (const strip of textStripRows(height)) assert.ok(strip.y >= 0 && strip.h >= 3 && strip.y + strip.h <= height, `strip inside a ${height}px picture`);
  assert.deepEqual(textStripRows(4), []);
  // The measure itself tells a sharp name strip from a smeared one.
  const sharp = scene(), smeared = scene({ blur: true });
  const [name] = textStripRows(H);
  const strip = (gray) => edgeSharpness(gray.subarray(Math.round(0.08 * H) * W, (Math.round(0.08 * H) + name.h) * W), W, name.h);
  assert.equal(sharpestOf([strip(smeared), strip(sharp), strip(smeared)]), 1);
});

test("the outline lands on the card: screen box to video and back", async () => {
  const { frameToVideoRect, videoToBoxRect } = await import("../src/utils/cardCameraFrame.mjs");
  for (const size of [{ boxWidth: 300, boxHeight: 400, videoWidth: 1440, videoHeight: 2560 }, { boxWidth: 358, boxHeight: 477, videoWidth: 1920, videoHeight: 1080 }, { boxWidth: 600, boxHeight: 800, videoWidth: 1080, videoHeight: 1440 }]) {
    const frame = { x: size.boxWidth * 0.22, y: size.boxHeight * 0.13, width: size.boxWidth * 0.56, height: size.boxHeight * 0.74 };
    const back = videoToBoxRect({ ...size, rect: frameToVideoRect({ ...size, frame }) });
    for (const key of ["x", "y", "width", "height"]) assert.ok(Math.abs(back[key] - frame[key]) < 0.001, `${key} for a ${size.videoWidth}x${size.videoHeight} camera`);
  }
});
