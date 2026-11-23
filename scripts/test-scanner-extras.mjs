import assert from "node:assert/strict";
import { test } from "node:test";
import { addRecentScan, createSteadyTracker, dealVerdict, frameDifference, readRecentScans, tallyBarcode, writeRecentScans, RECENT_SCANS_LIMIT } from "../src/utils/scannerExtras.mjs";

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
