// Card name correction from the catalog's printed names (Nov 24 2026).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createNameIndex, isKnownCardName, snapCardName } from "../src/utils/cardNameSnap.mjs";
import { parseCardPhotoText } from "../src/utils/cardPhotoText.mjs";

const names = JSON.parse(readFileSync(new URL("../src/data/generated/cardNames.json", import.meta.url), "utf8"));
const index = createNameIndex(names);

test("the name list is real printed names, small enough to load on a phone", () => {
  assert.ok(names.length > 3000, "covers the catalog");
  assert.ok(JSON.stringify(names).length < 200_000);
  for (const name of ["Charizard ex", "Pikachu", "Rare Candy", "Iono", "Umbreon VMAX"]) assert.equal(isKnownCardName(name, index), true, name);
  // Real cards can hold a product word (Secret Box, Tool Box, Iron Bundle), so sealed products are
  // told by their phrases, not by one word.
  assert.equal(names.some((name) => /\d|\b(?:booster|elite trainer|collection|display|deck) box\b|\b(?:booster|blister|value) packs?\b|\bbooster bundle\b|\bmini tin\b/i.test(name)), false, "no numbers or sealed products");
  for (const name of ["Secret Box", "Tool Box", "Iron Bundle"]) assert.equal(isKnownCardName(name, index), true, name);
});

test("misread letters snap to the one close real name; junk and short reads do not", () => {
  assert.equal(snapCardName("Charizarb ex", index), "Charizard ex");
  assert.equal(snapCardName("Pikaehu", index), "Pikachu");
  assert.equal(snapCardName("Gardevolr", index), "Gardevoir");
  assert.equal(snapCardName("Umbre0n VMAX", index), "Umbreon VMAX");
  assert.equal(snapCardName("Boss's Orders", index), "Boss's Orders", "keeps the card's apostrophe");
  assert.equal(snapCardName("LBASIC", index), "");
  assert.equal(snapCardName("Eo", index), "");
  assert.equal(snapCardName("Mew", index), "Mew");
});

test("the reader uses corrected names, so separate reads agree", () => {
  const read = parseCardPhotoText({ nameIndex: index, nameText: "BASIC\nCharizarb ex HP 330", extraNameTexts: ["Charlzard ex"], numberText: "125/197" });
  assert.equal(read.query, "Charizard ex 125/197");
  assert.equal(read.certainty, "name-and-number");
  const without = parseCardPhotoText({ nameText: "BASIC\nCharizarb ex HP 330", numberText: "125/197" });
  assert.equal(without.query, "Charizarb ex 125/197", "without the list nothing changes");
});
