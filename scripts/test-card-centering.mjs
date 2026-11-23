import assert from "node:assert/strict";
import { test } from "node:test";
import { centeringGuideCheck, centeringRatios, centeringSummary, detectCardBorders, ratioLabel } from "../src/utils/cardCentering.mjs";
import { findSetRowByName, scanSetProgress, tradeSideSummary } from "../src/utils/scannerExtras.mjs";

test("set names match by code, alias or a unique partial name", () => {
  const rows = [
    { key: "set:mew", id: "mew", name: "Scarlet & Violet 151" },
    { key: "set:sv8", id: "sv8", name: "Surging Sparks", aliases: ["SSP"] },
    { key: "set:base1", id: "base1", name: "Base Set" },
    { key: "set:base2", id: "base2", name: "Base Set 2" },
  ];
  assert.equal(findSetRowByName(rows, "151").key, "set:mew");
  assert.equal(findSetRowByName(rows, "MEW").key, "set:mew");
  assert.equal(findSetRowByName(rows, "ssp").key, "set:sv8");
  assert.equal(findSetRowByName(rows, "Base Set").key, "set:base1");
  assert.equal(findSetRowByName(rows, "base"), null);
  assert.equal(findSetRowByName(rows, ""), null);
});

test("centering ratios compare opposite borders", () => {
  const ratios = centeringRatios({ outer: { left: 0, right: 1, top: 0, bottom: 1 }, inner: { left: 0.06, right: 0.95, top: 0.05, bottom: 0.95 } });
  assert.deepEqual(ratios.lr, [55, 45]);
  assert.deepEqual(ratios.tb, [50, 50]);
  assert.equal(ratios.worst, 55);
  assert.equal(ratioLabel(ratios.lr), "55/45");
  assert.equal(ratioLabel(null), "Not measured");
});

test("guides: 55/45 front fits PSA 10 but not BGS Pristine; backs are looser", () => {
  const ratios = { worst: 55 };
  const front = centeringGuideCheck(ratios, "front");
  assert.equal(front.find((row) => row.company === "PSA" && row.grade.startsWith("10")).fits, true);
  assert.equal(front.find((row) => row.company === "BGS" && row.grade.startsWith("10")).fits, false);
  assert.deepEqual(centeringSummary({ worst: 55 }, "front"), ["PSA 10 Gem Mint", "BGS 9.5 Gem Mint", "CGC 10 Gem Mint"]);
  assert.match(centeringSummary({ worst: 80 }, "front")[0], /^PSA: outside its 8 NM-MT guide$/);
  assert.equal(centeringGuideCheck({ worst: 70 }, "back").find((row) => row.company === "PSA" && row.grade.startsWith("10")).fits, true);
});

test("border detection finds a synthetic card's edges", () => {
  // 200x280 photo: dark background, card from x 10-190 / y 14-266, light border, art from x 30-178 / y 34-250.
  const width = 200, height = 280;
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const onCard = x >= 10 && x < 190 && y >= 14 && y < 266;
      const inArt = x >= 30 && x < 178 && y >= 34 && y < 250;
      gray[y * width + x] = !onCard ? 20 : inArt ? 90 : 230;
    }
  }
  const found = detectCardBorders(gray, width, height);
  const near = (value, expected) => assert.ok(Math.abs(value - expected) <= 0.011, `${value} vs ${expected}`);
  near(found.outer.left, 10 / width); near(found.outer.right, 190 / width);
  near(found.outer.top, 14 / height); near(found.outer.bottom, 266 / height);
  near(found.inner.left, 30 / width); near(found.inner.right, 178 / width);
  near(found.inner.top, 34 / height); near(found.inner.bottom, 250 / height);
  const ratios = centeringRatios(found);
  assert.deepEqual(ratios.lr, [63, 37]); // 20 px vs 12 px of border
});

test("trade side totals count quantity and flag lines without a value", () => {
  const side = tradeSideSummary([{ name: "Charizard ex", value: "120", quantity: 1 }, { name: "Booster Pack", value: 4.5, quantity: 4 }, { name: "Mystery binder", value: "" }]);
  assert.equal(side.count, 6);
  assert.equal(side.total, 138);
  assert.equal(side.missing, 1);
  assert.equal(side.names, "Charizard ex, Booster Pack x4, Mystery binder");
});

test("set progress after a scan counts new card numbers once", () => {
  const summary = {
    key: "set:151", name: "151", totalCards: 165, ownedCount: 2, missingSupported: true,
    ownedCardItems: [{ cardNumber: "001/165" }, { cardNumber: "004/165" }],
    missingCards: [{ cardNumber: "002/165", name: "Ivysaur" }, { cardNumber: "003/165", name: "Venusaur" }, { cardNumber: "025/165", name: "Pikachu" }],
  };
  const rows = [
    { cardName: "Bulbasaur", setName: "151", cardNumber: "001/165" },
    { cardName: "Ivysaur", setName: "151", cardNumber: "002/165" },
    { cardName: "Ivysaur", setName: "151", cardNumber: "2/165" },
    { cardName: "Mystery", setName: "", cardNumber: "9" },
  ];
  const [progress] = scanSetProgress(rows, (row) => (row.setName === "151" ? summary : null));
  assert.equal(progress.owned, 2);
  assert.equal(progress.adds, 1);
  assert.equal(progress.after, 3);
  assert.equal(progress.percentAfter, 2);
  assert.equal(progress.missingAfterCount, 2);
  assert.deepEqual(progress.missingPreview.map((card) => card.name), ["Venusaur", "Pikachu"]);
  assert.deepEqual(scanSetProgress(rows, () => null), []);
});
