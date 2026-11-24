// Card reader text rules: src/utils/cardPhotoText.mjs and the pure parts of
// src/utils/cardPhotoReader.mjs. The OCR text here is the kind of text the
// local reader returns for real cards, including common misreads.
import assert from "node:assert/strict";
import { test } from "node:test";
import { findCardNumbers, findCardName, parseCardPhotoText } from "../src/utils/cardPhotoText.mjs";
import { enhanceForText, findCardBounds, stageOneIsEnough } from "../src/utils/cardPhotoReader.mjs";

const numbers = (text) => findCardNumbers(text).map((n) => n.value);

test("collector numbers across games, with OCR lookalikes repaired only inside the number", () => {
  assert.deepEqual(numbers("Illus. 5ban Graphics  125/197  ★"), ["125/197"]);
  assert.deepEqual(numbers("O58/1O2"), ["058/102"], "O read for 0");
  assert.deepEqual(numbers("l25 / l97"), ["125/197"], "l read for 1");
  assert.deepEqual(numbers("TG04/TG30"), ["TG04/TG30"]);
  assert.deepEqual(numbers("GG35/GG70 · SV049/SV122"), ["GG35/GG70", "SV049/SV122"]);
  assert.deepEqual(numbers("OP01-024  L"), ["OP01-024"], "One Piece code");
  assert.deepEqual(numbers("ST1O-OO1"), ["ST10-001"]);
  assert.deepEqual(numbers("P-041"), ["P-041"]);
  assert.deepEqual(numbers("SWSH123 promo"), ["SWSH123"]);
  assert.deepEqual(numbers("12/204 · EN · 1"), ["12/204"], "Lorcana");
  assert.deepEqual(numbers("HP 120  Weakness x2  Retreat"), [], "no number in plain text");
  assert.deepEqual(numbers("2023 Pokemon / Nintendo"), [], "years and words are not card numbers");
});

test("card name from the name strip skips stage labels and HP", () => {
  assert.equal(findCardName("BASIC\nPikachu HP 60\n")[0], "Pikachu");
  assert.equal(findCardName("STAGE 2  Evolves from Charmeleon\nCharizard ex HP330")[0], "Charizard ex");
  assert.equal(findCardName("Mewtwo VSTAR 280 HP")[0], "Mewtwo VSTAR");
  assert.equal(findCardName("Trainer\nItem\nRare Candy")[0], "Rare Candy");
  assert.equal(findCardName("|| ~ 5 }\nMonkey.D.Luffy")[0], "Monkey.D.Luffy");
  assert.deepEqual(findCardName("12 / 34\n@#$%"), [], "symbols and numbers are not names");
});

test("the search combines the name and number, and says what it found", () => {
  const full = parseCardPhotoText({ nameText: "BASIC\nPikachu HP 60", numberText: "Illus. Mitsuhiro Arita 58/102" });
  assert.equal(full.query, "Pikachu 58/102");
  assert.equal(full.certainty, "name-and-number");
  assert.ok(full.suggestions.some((s) => s.value === "58/102"));
  const numberOnly = parseCardPhotoText({ nameText: "~~", numberText: "125/197" });
  assert.equal(numberOnly.query, "125/197");
  assert.equal(numberOnly.certainty, "number-only");
  const fallback = parseCardPhotoText({ nameText: "", numberText: "", fullText: "Charizard ex\nTera\n125/197\nBurning Darkness 180" });
  assert.equal(fallback.query, "Charizard ex 125/197", "falls back to the whole-card read");
  const nothing = parseCardPhotoText({});
  assert.equal(nothing.certainty, "none");
  assert.equal(nothing.query, "");
});

test("untrusted text stays bounded and plain", () => {
  const value = parseCardPhotoText({ fullText: "\u0000<script>x</script>\n" + "a".repeat(30000) });
  assert.ok(value.text.length <= 20000);
  assert.equal(value.text.includes("\u0000"), false);
  assert.ok(value.query.length <= 180);
});

test("contrast stretch and card finder", () => {
  const pixels = new Uint8ClampedArray([100, 100, 100, 255, 150, 150, 150, 255, 120, 120, 120, 255, 140, 140, 140, 255]);
  enhanceForText(pixels);
  assert.equal(pixels[0], 0);
  assert.equal(pixels[4], 255);
  // A light card on a dark table, 100 x 140 thumbnail, card 60 x 84 (trading-card shape).
  const width = 100, height = 140, grey = new Uint8Array(width * height).fill(30);
  for (let y = 28; y < 112; y += 1) for (let x = 20; x < 80; x += 1) grey[y * width + x] = 220;
  const box = findCardBounds(grey, width, height);
  assert.ok(box, "finds the card");
  assert.ok(Math.abs(box.x - 0.2) < 0.03 && Math.abs(box.w - 0.6) < 0.04);
  assert.equal(findCardBounds(new Uint8Array(width * height).fill(128), width, height), null, "no border: use the whole photo");
});

test("names from real photos: junk tokens dropped, agreeing reads win", async () => {
  const { rankCardNames } = await import("../src/utils/cardPhotoText.mjs");
  assert.equal(findCardName("BAS Lickitung 100")[0], "Lickitung");
  assert.equal(findCardName("Bulbasaur +60")[0], "Bulbasaur");
  assert.equal(findCardName("Tangela HE.@")[0], "Tangela");
  assert.equal(rankCardNames([["mes", "Mareep"], ["Mareep"], ["Mareep"]])[0], "Mareep", "agreement beats first line");
  assert.equal(parseCardPhotoText({ nameText: "{ [sree 5010 5 |\nmes\nMareep\n50 HP", extraNameTexts: ["'Mareep\n50HP"], numberText: "67/109" }).query, "Mareep 67/109");
});

test("camera frame maps to the right part of the video (object-fit: cover)", async () => {
  const { frameToVideoRect, CARD_ASPECT } = await import("../src/utils/cardCameraFrame.mjs");
  assert.ok(Math.abs(CARD_ASPECT - 0.716) < 0.001);
  // 1920x1080 video shown in a 300x400 box: scaled to height (400/1080), sides cropped.
  const area = frameToVideoRect({ boxWidth: 300, boxHeight: 400, videoWidth: 1920, videoHeight: 1080, frame: { x: 50, y: 28, width: 200, height: 344 } });
  const scale = 400 / 1080, offsetX = (300 - 1920 * scale) / 2;
  assert.ok(Math.abs(area.x - (50 - offsetX) / scale) < 0.01);
  assert.ok(Math.abs(area.y - 28 / scale) < 0.01);
  assert.ok(Math.abs(area.width - 200 / scale) < 0.01 && Math.abs(area.height - 344 / scale) < 0.01);
  const edge = frameToVideoRect({ boxWidth: 300, boxHeight: 400, videoWidth: 1920, videoHeight: 1080, frame: { x: -500, y: -10, width: 5000, height: 500 } });
  assert.ok(edge.x >= 0 && edge.y >= 0 && edge.x + edge.width <= 1920 && edge.y + edge.height <= 1080, "never outside the video");
});

test("the reader stops after the name strip and corners only when they give a real name and a number", () => {
  const stage1 = (nameText, numberText) => parseCardPhotoText({ nameText, numberText });
  assert.equal(stageOneIsEnough(stage1("Charizard ex 330 HP", "SV3 EN 125/197")), true);
  assert.equal(stageOneIsEnough(stage1("Pikachu", "O58/1O2")), true);
  assert.equal(stageOneIsEnough(stage1("Charizard ex", "")), false, "no number: read more");
  assert.equal(stageOneIsEnough(stage1("", "125/197")), false, "no name: read more");
  assert.equal(stageOneIsEnough(stage1("EEVA", "125/197")), false, "all-caps fragment: read more");
  assert.equal(stageOneIsEnough(stage1("mew", "151/165")), false, "short or lower-case name: read more");
  assert.equal(stageOneIsEnough(null), false);
});
