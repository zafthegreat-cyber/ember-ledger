import assert from "node:assert/strict";
import { test } from "node:test";
import { cardThumb } from "../src/utils/cardCameraAssist.mjs";
import { addRecentScan, createNextCardWatcher, createSteadyTracker, dealVerdict, thumbDifference, frameDifference, readRecentScans, tallyBarcode, writeRecentScans, RECENT_SCANS_LIMIT } from "../src/utils/scannerExtras.mjs";

test("deal check counts shipping and labels under, about and over market", () => {
  const under = dealVerdict({ price: "40", shipping: "4.99", market: 60 });
  assert.equal(under.tone, "good");
  assert.equal(under.total, 44.99);
  assert.match(under.label, /^\$15\.01 under market$/);
  assert.match(under.detail, /\$40 \+ \$4\.99 shipping/);
  assert.equal(dealVerdict({ price: 57, market: 60 }).tone, "fair");
  const over = dealVerdict({ price: "$82", market: "60" });
  assert.equal(over.tone, "over");
  assert.equal(over.label, "$22 over market");
  assert.equal(over.percent, 37);
});

test("deal check never invents a comparison", () => {
  assert.equal(dealVerdict({ price: "", market: 60 }), null);
  assert.equal(dealVerdict({ price: 50, market: "" }).tone, "unknown");
  assert.equal(dealVerdict({ price: 300, market: 60, graded: true }).tone, "unknown");
});

test("recent scans move repeats to the top and keep twenty", () => {
  let list = [];
  for (let index = 0; index < 25; index += 1) list = addRecentScan(list, { rawValue: `code-${index}`, itemName: `Item ${index}` });
  assert.equal(list.length, RECENT_SCANS_LIMIT);
  assert.equal(list[0].rawValue, "code-24");
  list = addRecentScan(list, { rawValue: "code-10", itemName: "Item 10" });
  assert.equal(list[0].rawValue, "code-10");
  assert.equal(list.filter((scan) => scan.rawValue === "code-10").length, 1);
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  writeRecentScans(list, storage);
  assert.equal(readRecentScans(storage).length, RECENT_SCANS_LIMIT);
  assert.deepEqual(readRecentScans({ getItem: () => "{bad" }), []);
});

test("steady tracker needs a still view with something in it", () => {
  const card = Uint8Array.from({ length: 64 }, (_, index) => (index % 2 ? 200 : 40));
  const blank = new Uint8Array(64).fill(120);
  const tracker = createSteadyTracker({ holdFrames: 3 });
  assert.equal(tracker.push(card), false);
  assert.equal(tracker.push(card), false);
  assert.equal(tracker.push(card), false);
  assert.equal(tracker.push(card), true);
  const moving = createSteadyTracker({ holdFrames: 2 });
  for (let index = 0; index < 6; index += 1) assert.equal(moving.push(index % 2 ? card : blank), false);
  const empty = createSteadyTracker({ holdFrames: 2 });
  for (let index = 0; index < 5; index += 1) assert.equal(empty.push(blank), false);
  assert.equal(frameDifference(card, card), 0);
});

test("rapid barcode tally counts repeats", () => {
  let batch = tallyBarcode([], { code: "0820650853" });
  batch = tallyBarcode(batch, { code: "0820650853", itemName: "Booster Bundle" });
  batch = tallyBarcode(batch, { code: "1111" });
  assert.equal(batch.length, 2);
  assert.equal(batch.find((row) => row.code === "0820650853").count, 2);
  assert.equal(batch.find((row) => row.code === "0820650853").itemName, "Booster Bundle");
  assert.equal(tallyBarcode(batch, { code: " " }), batch);
});

// Continuous scanning (Nov 25 2026): when is the next card in view?
const flat = (value, size = 64) => new Uint8ClampedArray(size).fill(value);
// A "card" picture: bright page with one dark block (the art) whose place says which card it is.
function drawView({ cardX = 0.2, artRow = 0.2, artShade = 60, width = 80, height = 100, lift = 0 } = {}) {
  const gray = new Uint8ClampedArray(width * height).fill(40 + lift);
  const card = { x: cardX, y: 0.1, w: 0.6, h: 0.8 };
  for (let y = Math.round(card.y * height); y < Math.round((card.y + card.h) * height); y += 1) {
    for (let x = Math.round(card.x * width); x < Math.round((card.x + card.w) * width); x += 1) {
      const inArt = (y / height - card.y) / card.h > artRow && (y / height - card.y) / card.h < artRow + 0.35;
      gray[y * width + x] = (inArt ? artShade : 230) + lift;
    }
  }
  return { gray, card, thumb: cardThumb(gray, width, height, card) };
}

test("a card thumbnail follows the card, not its place in the view", () => {
  const first = drawView();
  const drifted = drawView({ cardX: 0.27 });
  const brighter = drawView({ lift: 15 });
  const other = drawView({ artRow: 0.5, artShade: 120 });
  assert.equal(first.thumb.length, 256);
  assert.ok(thumbDifference(first.thumb, drifted.thumb) < 4, "The same card moved sideways is the same card");
  assert.ok(thumbDifference(first.thumb, brighter.thumb) < 1, "A brighter exposure is the same card");
  assert.ok(thumbDifference(first.thumb, other.thumb) > 10, "A different card is different");
  assert.equal(thumbDifference(first.thumb, null), Infinity);
  assert.equal(cardThumb(first.gray, 80, 100, null), null);
});

test("after a picture, a drifting card is left alone and a new card is taken", () => {
  const first = drawView();
  const drifted = drawView({ cardX: 0.27 });
  const other = drawView({ artRow: 0.5, artShade: 120 });
  // The same card drifting in the hand: never taken again, however long it is held.
  const drift = createNextCardWatcher();
  drift.start(flat(100), first.thumb);
  for (let look = 0; look < 20; look += 1) assert.equal(drift.push(flat(140), drifted.thumb), "", "A big change in the whole view is not a new card");
  // A different card settles in view: taken, but checked against the card just added.
  const swap = createNextCardWatcher();
  swap.start(flat(100), first.thumb);
  assert.equal(swap.push(flat(104), other.thumb), "");
  assert.equal(swap.push(flat(104), other.thumb), "maybe-same");
  // One odd look (blur, a finger) does not count.
  const blip = createNextCardWatcher();
  blip.start(flat(100), first.thumb);
  assert.equal(blip.push(flat(100), other.thumb), "");
  assert.equal(blip.push(flat(100), first.thumb), "");
  assert.equal(blip.push(flat(100), other.thumb), "");
  // The card leaves the view: whatever comes back counts, also a second copy of the same card.
  const left = createNextCardWatcher();
  left.start(flat(100), first.thumb);
  assert.equal(left.push(flat(60), null, { cardFound: false }), "");
  assert.equal(left.push(flat(60), null, { cardFound: false }), "");
  assert.equal(left.push(flat(60), null, { cardFound: false }), "next");
  // A card that is in view but still moving is neither gone nor settled.
  const moving = createNextCardWatcher();
  moving.start(flat(100), first.thumb);
  for (let look = 0; look < 8; look += 1) assert.equal(moving.push(flat(120), null, { cardFound: true }), "");
});

test("with no card outline in the picture, the whole view decides", () => {
  const big = createNextCardWatcher();
  big.start(flat(100));
  assert.equal(big.push(flat(100)), "", "Nothing changed: keep waiting");
  assert.equal(big.push(flat(140)), "next");
  const small = createNextCardWatcher();
  small.start(flat(100));
  assert.equal(small.push(flat(110)), "", "The view settles first");
  assert.equal(small.push(flat(110)), "");
  assert.equal(small.push(flat(110)), "");
  assert.equal(small.push(flat(110)), "maybe-same", "Steadily a little different from the picture");
  const noise = createNextCardWatcher();
  noise.start(flat(100));
  for (let look = 0; look < 12; look += 1) assert.equal(noise.push(flat(100 + (look % 2 ? 3 : -3))), "");
  assert.equal(createNextCardWatcher().push(flat(1)), "next", "Before any picture there is nothing to wait for");
});
