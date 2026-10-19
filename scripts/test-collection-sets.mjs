import assert from "node:assert/strict";
import { buildCollectionSetRows, filterCollectionSetRows } from "../src/utils/collectionSets.mjs";

let passed = 0;
const test = (name, run) => { run(); passed += 1; console.log(`PASS ${name}`); };
const freeze = (value) => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const card = (overrides = {}) => ({ id: "one", _recordOrigin: "repository", ownedItemPurpose: "PERSONAL_COLLECTION", setName: "Fusion Strike", productClassification: "Raw card", cardNumber: "001/264", quantity: 1, projectedResaleMid: "10", ...overrides });
const metadata = freeze([{ setId: "swsh8", name: "Fusion Strike", code: "FST", series: "Sword & Shield", total: 284, releaseDate: "2021-11-12", logoUrl: "/approved-logo.svg", setAliases: ["FST", "swsh8"] }]);
const first = (options) => buildCollectionSetRows(options).find((row) => row.name === "Fusion Strike");

test("derived rows retain exact record references and leave deeply frozen inputs unchanged", () => {
  const items = freeze([card()]); const before = JSON.stringify({ items, metadata });
  const row = first({ items, knownSets: metadata });
  assert.equal(row.ownedItems[0], items[0]); assert.equal(row.artworkRecord, items[0]);
  assert.equal(JSON.stringify({ items, metadata }), before);
});
test("unambiguous canonical aliases and prefixed catalog names share a stable group", () => {
  const rows = buildCollectionSetRows({ knownSets: metadata, items: [card(), card({ id: "two", setName: "SWSH08: Fusion Strike", cardNumber: "2/264" }), card({ id: "three", tcgGame: "pokemon", setName: "", setCode: "swsh8", cardNumber: "3" })], catalogProducts: [{ id: "catalog", setName: "SWSH08: Fusion Strike", catalogType: "card", cardNumber: "4" }] });
  assert.equal(rows.length, 1); assert.equal(rows[0].ownedItems.length, 3); assert.equal(rows[0].uniqueCardCount, 3); assert.equal(rows[0].catalogCardCount, 1);
  assert.equal(rows[0].id, buildCollectionSetRows({ knownSets: [...metadata].reverse() })[0].id);
});
test("different official code aliases never override a fully named custom set", () => {
  const rows = buildCollectionSetRows({ knownSets: metadata, items: [card({ setName: "My custom set", setCode: "FST" })] });
  assert.equal(rows.find((row) => row.name === "My custom set").itemCount, 1); assert.equal(first({ knownSets: metadata }).itemCount, 0);
});
test("ambiguous aliases do not merge unrelated sets or assign a code-only item", () => {
  const knownSets = [{ name: "Alpha Set", code: "X" }, { name: "Beta Set", code: "X" }];
  const rows = buildCollectionSetRows({ knownSets, items: [card({ setName: "", setCode: "X" }), card({ id: "named", setName: "X" })] });
  assert.equal(rows.length, 3); assert.equal(rows.find((row) => row.name === "X").itemCount, 1); assert.equal(rows.find((row) => row.name === "Alpha Set").itemCount, 0);
});
test("shared PE abbreviation is not silently assigned to Paldea or Prismatic", () => {
  const rows = buildCollectionSetRows({ knownSets: [{ name: "Paldea Evolved" }, { name: "Prismatic Evolutions", setAliases: ["PE"] }], items: [card({ setName: "", setCode: "PE" })] });
  assert.equal(rows.reduce((sum, row) => sum + row.itemCount, 0), 0);
});
test("distinct subsets and names are not merged by substring", () => {
  const rows = buildCollectionSetRows({ items: [card({ setName: "Celebrations" }), card({ id: "classic", setName: "Celebrations: Classic Collection" }), card({ id: "shadow", setName: "Base Set (Shadowless)" }), card({ id: "base", setName: "Base Set" })] });
  assert.equal(rows.length, 4); assert.equal(rows.every((row) => row.itemCount === 1), true);
});
test("variants, duplicate physical rows and quantity do not inflate numbered card progress", () => {
  const row = first({ knownSets: metadata, items: [card({ quantity: 5 }), card({ id: "holo", cardNumber: "1/264", finish: "Holo", quantity: 2 }), card({ id: "reverse", cardNumber: "0001 / 264", finish: "Reverse holo", quantity: 3 })] });
  assert.equal(row.uniqueCardCount, 1); assert.equal(row.ownedCardQuantity, 10); assert.equal(row.totalValue, 100); assert.equal(row.progressLabel, "1/284 unique cards recorded");
});
test("TG/GG/promo numbers remain distinct while numeric suffixes and denominator do not collide", () => {
  const row = first({ items: [card({ cardNumber: "TG01/TG30" }), card({ id: "gg", cardNumber: "GG01/GG70" }), card({ id: "one", cardNumber: "1/264" }), card({ id: "onea", cardNumber: "01a/264" })] });
  assert.equal(row.uniqueCardCount, 4);
});
test("sealed quantity contributes saved holding value but never card completion", () => {
  const row = first({ knownSets: metadata, items: [card(), card({ id: "box", productClassification: "Sealed product", cardNumber: "999/999", quantity: 2, projectedResaleMid: 30 })] });
  assert.equal(row.uniqueCardCount, 1); assert.equal(row.sealedCount, 1); assert.equal(row.sealedQuantity, 2); assert.equal(row.totalValue, 70);
});
test("no-card-number single records remain visibly unresolved and do not guess by card title", () => {
  const row = first({ knownSets: metadata, items: [card({ cardNumber: "", name: "Pikachu" }), card({ id: "another", cardNumber: "", name: "Pikachu" })] });
  assert.equal(row.uniqueCardCount, 0); assert.equal(row.unknownCardIdentityCount, 2); assert.equal(row.itemCount, 2);
});
test("a known catalog product identifier distinguishes an otherwise unnumbered card", () => {
  const row = first({ items: [card({ cardNumber: "", catalogProductId: "product1" }), card({ id: "second", cardNumber: "", catalogProductId: "product1" })] });
  assert.equal(row.uniqueCardCount, 1); assert.equal(row.unknownCardIdentityCount, 0);
});
test("zero or invalid quantity cannot count as an owned unique card", () => {
  const row = first({ items: [card({ quantity: 0 }), card({ id: "invalid", cardNumber: "2", quantity: "bad" })] });
  assert.equal(row.uniqueCardCount, 0); assert.equal(row.ownedCardQuantity, 0); assert.equal(row.itemCount, 2);
});
test("missing prices and purchase costs remain unknown; numeric zero is a known estimate", () => {
  const row = first({ items: [card({ projectedResaleMid: "", marketPrice: "", allocatedItemCost: 999 }), card({ id: "zero", projectedResaleMid: 0 })] });
  assert.equal(row.totalValue, 0); assert.equal(row.knownValueCount, 1); assert.equal(row.unknownValueCount, 1);
});
test("quantity overflow fails closed for aggregate value", () => {
  const row = first({ items: [card({ quantity: Number.MAX_SAFE_INTEGER / 100, projectedResaleMid: Number.MAX_SAFE_INTEGER / 100 })] });
  assert.equal(row.knownValueCount, 0); assert.equal(row.unknownValueCount, 1); assert.equal(Number.isFinite(row.totalValue), true);
});
test("aggregate overflow never renders Infinity as a price", () => {
  const max = Number.MAX_SAFE_INTEGER / 100;
  const row = first({ items: [card({ projectedResaleMid: max }), card({ id: "two", projectedResaleMid: max })] });
  assert.equal(row.totalValue, null); assert.equal(row.isValueValid, false);
});
test("catalog products offer artwork and discovery only, never owned prices or counts", () => {
  const product = freeze({ id: "cat", setName: "Fusion Strike", catalogType: "card", cardNumber: "7/264", imageUrl: "/existing-art.png", marketPrice: 999, releaseDate: "2000-01-01", printedTotal: 999, logoUrl: "/not-a-set-logo.svg" });
  const row = first({ catalogProducts: [product] });
  assert.equal(row.artworkRecord, product); assert.equal(row.artworkSource, "catalog"); assert.equal(row.itemCount, 0); assert.equal(row.knownValueCount, 0); assert.equal(row.uniqueCardCount, 0); assert.equal(row.totalCards, null); assert.equal(row.releaseDate, ""); assert.equal(row.logoUrl, "");
});
test("saved private and legacy photo fields take priority over representative catalog artwork", () => {
  for (const photo of [{ itemImage: "private:photo" }, { item_image: "/my-photo.png" }, { displayImage: "/display.png" }, { photos: [{ url: "/photo.png" }] }, { images: { large: "/nested.png" } }]) {
    const item = freeze(card(photo));
    const row = first({ items: [item], catalogProducts: [{ setName: "Fusion Strike", imageUrl: "/catalog.png" }] });
    assert.equal(row.artworkRecord, item); assert.equal(row.artworkSource, "owned");
  }
  assert.equal(first({ items: [card({ itemImage: "placeholder" })] }).artworkSource, "");
});
test("explicit Single Card classification recognizes unnumbered cards without guessing identity", () => {
  const row = first({ items: [card({ productClassification: "Single Card", cardNumber: "" })] });
  assert.equal(row.unknownCardIdentityCount, 1); assert.equal(row.uniqueCardCount, 0);
});
test("official metadata alone supplies logos, dates and totals, not card denominators", () => {
  const row = first({ knownSets: metadata, items: [card({ releaseDate: "2099-12-31", cardNumber: "1/999" })] });
  assert.equal(row.totalCards, 284); assert.equal(row.releaseDate, "2021-11-12"); assert.equal(row.logoUrl, "/approved-logo.svg");
  assert.equal(first({ items: [card()] }).totalCards, null);
});
test("impossible dates and invalid numeric totals are withheld", () => {
  for (const date of ["2026-02-30", "02/01/2026", "2026-13-01", "2026-01-01T99:00:00Z"]) assert.equal(first({ knownSets: [{ name: "Fusion Strike", releaseDate: date, total: "bad" }] }).releaseDate, "");
  for (const total of [0, -1, "", "1.5", true, Infinity, "1e3"]) assert.equal(first({ knownSets: [{ name: "Fusion Strike", total }] }).totalCards, null);
});
test("conflicting known-set metadata fails closed rather than choosing arbitrary totals or dates", () => {
  const rows = buildCollectionSetRows({ knownSets: [...metadata, { name: "SWSH08: Fusion Strike", total: 300, releaseDate: "2021-11-13" }] });
  assert.equal(rows.length, 1); assert.equal(rows[0].totalCards, null); assert.equal(rows[0].releaseDate, "");
});
test("explicit languages normalize aliases while absent metadata never becomes English", () => {
  const row = first({ items: [card({ language: "en-US" }), card({ id: "jp", cardNumber: "2", languageCode: "ja" }), card({ id: "unknown", cardNumber: "3" })] });
  assert.deepEqual(row.languages, ["English", "Japanese"]); assert.equal(row.hasUnknownLanguage, true);
  assert.deepEqual(first({ items: [card()] }).languages, []);
});
test("different languages remain separate card identities and suppress mixed completion claims", () => {
  const row = first({ knownSets: metadata, items: [card({ language: "English" }), card({ id: "jp", language: "Japanese" })] });
  assert.equal(row.uniqueCardCount, 2); assert.equal(row.progressPercent, null); assert.match(row.progressLabel, /Mixed/);
});
test("one explicit language plus unrecorded language also withholds percent", () => {
  const row = first({ knownSets: metadata, items: [card(), card({ id: "en", language: "English", cardNumber: "2" })] });
  assert.equal(row.languageProgressAvailable, false); assert.equal(row.progressPercent, null);
});
test("simplified/traditional Chinese remain separate labels and custom language text is preserved", () => {
  const row = first({ items: [card({ language: "zh-CN" }), card({ id: "tw", language: "zh-TW" }), card({ id: "custom", language: "Esperanto" })] });
  assert.deepEqual(row.languages, ["Chinese (Simplified)", "Chinese (Traditional)", "Esperanto"]);
});
test("resale, hold, community, unassigned and inferred seller records are excluded", () => {
  const items = ["FOR_RESALE", "HOLD", "KIDS_COMMUNITY", "UNASSIGNED"].map((ownedItemPurpose, index) => card({ id: index, ownedItemPurpose }));
  items.push({ ...card(), ownedItemPurpose: undefined, workspace: "forge inventory" });
  assert.equal(first({ knownSets: metadata, items }).itemCount, 0);
});
test("binder records stay out of set cards while sealed Binder Collection products stay legitimate", () => {
  const row = first({ knownSets: metadata, items: [card({ productClassification: "Binder or collection" }), card({ id: "sealed", productClassification: "Sealed product", productType: "Binder Collection", cardNumber: "" })] });
  assert.equal(row.itemCount, 1); assert.equal(row.sealedCount, 1); assert.equal(row.uniqueCardCount, 0);
});
test("items without an explicit set name or uniquely known code cannot create invented groups", () => {
  const rows = buildCollectionSetRows({ items: [card({ setName: "", setCode: "", name: "Fusion Strike box" }), card({ setName: "", setCode: "random" })], catalogProducts: [{ id: "without", name: "Fusion Strike card" }] });
  assert.equal(rows.length, 0);
});
test("catalog discovery exposes real named groups without inventing languages or metadata", () => {
  const rows = buildCollectionSetRows({ catalogProducts: [{ setName: "Custom New Set", catalogType: "single", cardNumber: "2" }] });
  assert.equal(rows.length, 1); assert.equal(rows[0].name, "Custom New Set"); assert.equal(rows[0].progressPercent, null); assert.deepEqual(rows[0].languages, []);
});
test("search covers names, series, codes and known aliases without modifying row order", () => {
  const rows = freeze(buildCollectionSetRows({ knownSets: [...metadata, { name: "Celebrations", code: "CEL", series: "Sword & Shield" }] }));
  const before = JSON.stringify(rows);
  assert.equal(filterCollectionSetRows(rows, { query: "swsh8" })[0].name, "Fusion Strike");
  assert.equal(filterCollectionSetRows(rows, { query: "Sword & Shield" }).length, 2);
  assert.equal(filterCollectionSetRows(rows, { query: "nothing" }).length, 0); assert.equal(JSON.stringify(rows), before);
});
test("owned, in-progress, complete and language filters use actual coverage", () => {
  const rows = buildCollectionSetRows({ knownSets: [{ name: "Fusion Strike", total: 2 }, { name: "Celebrations", total: 1 }, { name: "Unused" }], items: [card({ language: "en" }), card({ setName: "Celebrations", language: "ja" })] });
  assert.equal(filterCollectionSetRows(rows, { scope: "owned" }).length, 2);
  assert.equal(filterCollectionSetRows(rows, { scope: "in-progress" })[0].name, "Fusion Strike");
  assert.equal(filterCollectionSetRows(rows, { scope: "complete" })[0].name, "Celebrations");
  assert.equal(filterCollectionSetRows(rows, { language: "ja" })[0].name, "Celebrations");
  assert.equal(filterCollectionSetRows(rows, { language: "Language not recorded" }).length, 0);
});
test("newest/value/progress sorts keep unavailable data last and retain source order", () => {
  const rows = freeze(buildCollectionSetRows({ knownSets: [{ name: "Fusion Strike", total: 2, releaseDate: "2021-11-12" }, { name: "Celebrations", total: 1, releaseDate: "2021-10-08" }, { name: "Unpriced" }], items: [card({ projectedResaleMid: 5 }), card({ id: "cel", setName: "Celebrations", projectedResaleMid: 10 })] }));
  const before = rows.map((row) => row.name);
  assert.equal(filterCollectionSetRows(rows, { sort: "newest" })[0].name, "Fusion Strike");
  assert.equal(filterCollectionSetRows(rows, { sort: "value" })[0].name, "Celebrations");
  assert.equal(filterCollectionSetRows(rows, { sort: "progress" })[0].name, "Celebrations");
  assert.deepEqual(rows.map((row) => row.name), before);
});

test("identical set names and card numbers stay in separate games with exact references", () => {
  const items = freeze([card({ tcgGame: "pokemon", setName: "Shared set" }), card({ id: "magic", tcgGame: "magic", setName: "Shared set", projectedResaleMid: 25 })]);
  const before = JSON.stringify(items);
  const rows = buildCollectionSetRows({ items });
  assert.equal(rows.length, 2); assert.equal(new Set(rows.map((row) => row.id)).size, 2);
  assert.equal(rows.find((row) => row.gameId === "pokemon").totalValue, 10);
  assert.equal(rows.find((row) => row.gameId === "magic").totalValue, 25);
  for (const row of rows) { assert.equal(row.uniqueCardCount, 1); assert.equal(items.includes(row.ownedItems[0]), true); }
  assert.equal(JSON.stringify(items), before);
});
test("Pokémon aliases and metadata do not decorate a different game", () => {
  const magicItem = freeze(card({ tcgGame: "magic", setName: "FST", itemImage: "/magic-photo.png" }));
  const rows = buildCollectionSetRows({ knownSets: metadata, items: [magicItem], catalogProducts: [{ tcgGame: "lorcana", setName: "FST", imageUrl: "/lorcana-photo.png" }] });
  const row = rows.find((entry) => entry.gameId === "magic");
  assert.equal(row.name, "FST"); assert.equal(row.totalCards, null); assert.equal(row.logoUrl, ""); assert.equal(row.artworkRecord, magicItem);
  assert.equal(rows.find((entry) => entry.gameId === "pokemon").itemCount, 0);
  assert.equal(filterCollectionSetRows(rows, { query: "swsh8", game: "magic" }).length, 0);
});
test("explicit game metadata is scoped and foreign aliases resolve only within their game", () => {
  const rows = buildCollectionSetRows({ knownSets: [...metadata, { tcgGame: "magic", name: "Foundations", code: "FST", total: 50 }], items: [card({ tcgGame: "magic", setName: "", setCode: "FST" }), card({ id: "unknown", setName: "", setCode: "FST" })] });
  const magic = rows.find((row) => row.gameId === "magic");
  assert.equal(magic.name, "Foundations"); assert.equal(magic.itemCount, 1); assert.equal(magic.totalCards, 50);
  assert.equal(rows.find((row) => row.gameId === "pokemon").itemCount, 0);
  assert.equal(rows.reduce((sum, row) => sum + row.itemCount, 0), 1);
});
test("unrecorded and custom unsupported games remain visible without a false Pokémon match", () => {
  const items = freeze([card({ setName: "My set" }), card({ id: "custom", tcgGame: "Flesh and Blood", setName: "Fusion Strike" }), card({ id: "other", tcgGame: "Digimon", setName: "Fusion Strike" }), card({ id: "untagged", tcgGame: "unspecified" })]);
  const before = JSON.stringify(items);
  const rows = buildCollectionSetRows({ items, knownSets: metadata });
  assert.equal(filterCollectionSetRows(rows, { game: "unspecified", scope: "owned" }).length, 4);
  assert.equal(filterCollectionSetRows(rows, { game: "pokemon", scope: "owned" }).length, 0);
  assert.equal(rows.find((row) => row.gameId === "pokemon").totalValue, 0);
  assert.equal(JSON.stringify(items), before);
});
test("game filters are read only and reject unrecognized requested games instead of showing all", () => {
  const rows = freeze(buildCollectionSetRows({ items: [card(), card({ id: "mtg", tcgGame: "magic" }), card({ id: "unknown", setName: "My set" })] }));
  const before = JSON.stringify(rows);
  assert.equal(filterCollectionSetRows(rows, { game: "all" }).length, 3);
  assert.equal(filterCollectionSetRows(rows, { game: "Magic: The Gathering" })[0].gameName, "Magic: The Gathering");
  assert.equal(filterCollectionSetRows(rows, { game: "unspecified" }).length, 1);
  assert.equal(filterCollectionSetRows(rows, { game: "unsupported" }).length, 0);
  assert.equal(JSON.stringify(rows), before);
});

console.log(`Collection set derivation: ${passed} scenarios passed.`);
