import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import registry from "../src/data/setArtwork.json" with { type: "json" };
import { resolveGameArtwork, resolveSetArtwork } from "../src/utils/setArtwork.mjs";
import { buildCollectionSetRows } from "../src/utils/collectionSets.mjs";

let passed = 0;
const test = (name, run) => { run(); passed += 1; console.log(`PASS ${name}`); };
const resolve = (name, options = {}) => resolveSetArtwork({ game: "pokemon", name, ...options });
const freeze = (value) => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

test("reviewed set artwork resolves only to real, packaged logos with source attribution", () => {
  assert.equal(registry.schemaVersion, 1);
  assert.ok(registry.sets.length >= 170, "The reviewed historical/current set corpus is retained");
  assert.equal(new Set(registry.sets.map(row => row.id)).size, registry.sets.length, "Set IDs are unique");
  for (const row of registry.sets) {
    assert.ok(row.name && row.id && row.language === "en" && row.game === "pokemon");
    assert.match(row.logoUrl, /^\/assets\/catalog\/set-logos\/pokemon\/en\/[a-z0-9-]+\.(?:png|jpg)$/);
    assert.match(row.sourceUrl, /^https:\/\/(?:images\.pokemontcg\.io|images\.scrydex\.com|d1i787aglh9bmb\.cloudfront\.net|imguscdn\.gamespress\.com)\//);
    const bytes = readFileSync(fileURLToPath(new URL(`../public${row.logoUrl}`, import.meta.url)));
    assert.ok(bytes.length > 24 && bytes.length <= 4 * 1024 * 1024, `Bounded logo bytes: ${row.id}`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), row.sha256, `Original source bytes: ${row.id}`);
    if (row.logoUrl.endsWith(".png")) {
      assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `Actual PNG: ${row.id}`);
      assert.equal(bytes.readUInt32BE(16), row.dimensions.width);
      assert.equal(bytes.readUInt32BE(20), row.dimensions.height);
    } else {
      assert.equal(bytes.subarray(0, 3).toString("hex"), "ffd8ff", `Actual JPEG: ${row.id}`);
      assert.equal(bytes.subarray(-2).toString("hex"), "ffd9");
      assert.ok(row.sourcePage?.startsWith("https://press.pokemon.com/"));
    }
  }
});

test("publisher supplemental artwork uses the exact English expansion or product identity", () => {
  assert.equal(resolve("ME06: Delta Reign")?.id, "official-me06");
  assert.equal(resolve("Trading Card Game Classic")?.id, "official-tcg-classic");
  assert.notEqual(resolve("30th Celebration: Classic Collection")?.id, "official-tcg-classic");
  assert.equal(resolve("Trick or Trade BOOster Bundle 2024"), null);
});

test("the sets in the reported artwork mismatch resolve to their exact verified identity", () => {
  for (const [name, id] of [["Aquapolis", "ecard2"], ["Arceus", "pl4"], ["White Flare", "rsv10pt5"], ["Destined Rivals", "sv10"], ["Journey Together", "sv9"], ["Prismatic Evolutions", "sv8pt5"], ["Surging Sparks", "sv8"], ["Fusion Strike", "swsh8"]]) {
    assert.equal(resolve(name)?.id, id, name);
    assert.equal(resolve(name)?.logoUrl, `/assets/catalog/set-logos/pokemon/en/${id}.png`);
  }
});

test("safe spelling normalization preserves identity without fuzzy or substring matching", () => {
  assert.equal(resolve("  FUSION STRIKE  ")?.id, "swsh8");
  assert.equal(resolve("swsh8")?.id, "swsh8");
  for (const name of ["Fusion", "Arceus box", "Aquapolis Booster", "My Fusion Strike set", "Alternate Art Promos", "Assorted", "A set that does not exist"]) assert.equal(resolve(name), null, name);
});

test("unknown named groups cannot borrow artwork through a product or official set code", () => {
  const request = freeze({ game: "pokemon", name: "My custom set", code: "swsh8", imageUrl: "/owned-product.png", logoUrl: "/product-logo.png" });
  const before = JSON.stringify(request);
  assert.equal(resolveSetArtwork(request), null);
  assert.equal(JSON.stringify(request), before);
  assert.equal(resolve("PE"), null, "An ambiguous short code cannot pick Paldea or Prismatic");
  assert.equal(resolveSetArtwork({ game: "pokemon", name: "", code: "PE" }), null);
});

test("English Pokémon art does not cross games or explicitly different languages", () => {
  for (const game of ["magic", "lorcana", "yugioh", "onepiece", "unspecified", "", undefined]) assert.equal(resolveSetArtwork({ game, name: "Arceus" }), null, `${game}`);
  for (const language of ["ja", "Japanese", "zh", "Chinese", "French", "es"]) assert.equal(resolve("Fusion Strike", { language }), null, language);
  assert.equal(resolve("Fusion Strike", { language: "English" })?.id, "swsh8");
});

test("a Japanese-only collection cannot inherit an enriched English directory logo", () => {
  const item = freeze({ id: "art-ja-card", tcgGame: "pokemon", setName: "Fusion Strike", language: "Japanese", cardNumber: "1", ownedItemPurpose: "PERSONAL_COLLECTION", productClassification: "Raw card", quantity: 1, marketPrice: 21.5, itemImage: "/original-japanese-card.png" });
  const englishMetadata = freeze({ name: "Fusion Strike", tcgGame: "pokemon", artworkLanguage: "en", logoUrl: resolve("Fusion Strike").logoUrl });
  const before = JSON.stringify({ item, englishMetadata });
  for (const knownSets of [[], [englishMetadata]]) {
    const row = buildCollectionSetRows({ items: [item], knownSets })[0];
    assert.equal(row.logoUrl, "");
    assert.equal(row.symbolUrl, "");
    assert.equal(row.totalValue, 21.5);
    assert.equal(row.ownedItems[0], item);
  }
  const explicitJapanese = buildCollectionSetRows({ items: [item], knownSets: [{ name: "Fusion Strike", tcgGame: "pokemon", artworkLanguage: "ja", logoUrl: "/explicit-japanese-set-logo.png" }] })[0];
  assert.equal(explicitJapanese.logoUrl, "/explicit-japanese-set-logo.png");
  assert.equal(JSON.stringify({ item, englishMetadata }), before);
});

test("explicit set metadata remains first and cannot be overwritten by a catalog product", () => {
  const item = freeze({ id: "art-test-card", tcgGame: "pokemon", setName: "Fusion Strike", cardNumber: "1", ownedItemPurpose: "PERSONAL_COLLECTION", productClassification: "Raw card", quantity: 2, marketPrice: 13.75, itemImage: "/my-original-card.png" });
  const product = freeze({ id: "art-test-product", tcgGame: "pokemon", setName: "Fusion Strike", imageUrl: "/unrelated-box.png", logoUrl: "/not-set-metadata.png", marketPrice: 999 });
  const knownSets = freeze([{ name: "Fusion Strike", tcgGame: "pokemon", total: 284, logoUrl: "/approved-set-logo.svg", symbolUrl: "/approved-set-symbol.svg" }]);
  const input = { items: [item], catalogProducts: [product], knownSets };
  const before = JSON.stringify(input);
  const row = buildCollectionSetRows(input)[0];
  assert.equal(row.logoUrl, "/approved-set-logo.svg");
  assert.equal(row.symbolUrl, "/approved-set-symbol.svg");
  assert.equal(row.totalValue, 27.5);
  assert.equal(row.totalCards, 284);
  assert.equal(row.ownedItems[0], item);
  assert.equal(JSON.stringify(input), before, "Owned photos, metadata and latest saved prices are read only");
});

test("catalog-only exact matches gain artwork without invented dates, counts or prices", () => {
  const product = freeze({ id: "art-only-set", tcgGame: "pokemon", setName: "Aquapolis", productName: "Saved product", imageUrl: "/old-booster-example.png", marketPrice: 127.99 });
  const before = JSON.stringify(product);
  const row = buildCollectionSetRows({ catalogProducts: [product] })[0];
  assert.equal(row.logoUrl, "/assets/catalog/set-logos/pokemon/en/ecard2.png");
  assert.equal(row.totalCards, null);
  assert.equal(row.releaseDate, "");
  assert.equal(row.itemCount, 0);
  assert.equal(row.knownValueCount, 0);
  assert.equal(row.uniqueCardCount, 0);
  assert.equal(JSON.stringify(product), before);
});

test("game filter artwork uses the reviewed game registry and unknown games remain unbranded", () => {
  const ids = registry.games.map(row => row.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("pokemon"));
  for (const row of registry.games) {
    assert.equal(resolveGameArtwork(row.id), row);
    assert.match(row.logoUrl, /^\/assets\/catalog\/game-logos\/[a-z0-9-]+\.(?:png|svg|webp|jpg)$/);
    const bytes = readFileSync(fileURLToPath(new URL(`../public${row.logoUrl}`, import.meta.url)));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), row.sha256);
    assert.match(row.sourceUrl, /^https:\/\//);
  }
  assert.equal(resolveGameArtwork("unsupported-test-game"), null);
});

console.log(`Set artwork: ${passed} scenarios passed.`);
