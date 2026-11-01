import assert from "node:assert/strict";
import { test } from "node:test";
import { getCatalogHighlightParts } from "../src/utils/catalogSearchPresentation.mjs";

test("highlighting preserves visible title offsets after ampersands and punctuation", () => {
  assert.deepEqual(getCatalogHighlightParts("Mew & Mewtwo GX", "Mewtwo"), { before: "Mew & ", match: "Mewtwo", after: " GX" });
  assert.deepEqual(getCatalogHighlightParts("Collector’s Chest — Pikachu", "pikachu"), { before: "Collector’s Chest — ", match: "Pikachu", after: "" });
});

test("accent-insensitive matches preserve precomposed and combining characters", () => {
  assert.deepEqual(getCatalogHighlightParts("Flabébé Holo", "flabebe"), { before: "", match: "Flabébé", after: " Holo" });
  assert.deepEqual(getCatalogHighlightParts("Cafe\u0301 Promo", "cafe"), { before: "", match: "Cafe\u0301", after: " Promo" });
});

test("Unicode prefixes and trimmed queries retain the original text", () => {
  const title = "✨ Pokémon: Eevee & Friends";
  const parts = getCatalogHighlightParts(title, "  pokemon  ");
  assert.deepEqual(parts, { before: "✨ ", match: "Pokémon", after: ": Eevee & Friends" });
  assert.equal(parts.before + parts.match + parts.after, title);
});

test("aliases, regular-expression characters and missing queries do not highlight unrelated text", () => {
  assert.equal(getCatalogHighlightParts("Sword & Shield Elite Trainer Box", "swsh"), null);
  assert.equal(getCatalogHighlightParts("Pikachu", ".*"), null);
  assert.equal(getCatalogHighlightParts("Pikachu", "p"), null);
  assert.equal(getCatalogHighlightParts("Pikachu", ""), null);
});
