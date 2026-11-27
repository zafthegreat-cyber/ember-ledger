// Single cards must never be filed as sealed products because of their name.
//
// Before Nov 26, 2026 the catalog decided "sealed" from name words alone, so
// Dratini, Mantine and Victini ("tin"), Fighting Energy ("figh-tin-g") and
// Nemona's Backpack ("pack") were sealed products: 581 cards in the live
// catalog. A card rarity or a collector number now decides first. This suite
// covers the three places the rule runs: the Supabase importer, the daily
// bundled-data refresh, and the SQL used by the backfills and the migration.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { classifySealedProduct } from "../pokemon_market_ingestion_kit/catalog_normalization_utils.mjs";

const require = createRequire(import.meta.url);
const rule = require("../pokemon_market_ingestion_kit/single_card_evidence.cjs");
const sync = require("./sync-catalog-prices-stores.cjs");

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// TCGCSV product shape: extendedData is a list of { name, value }.
const tcgcsv = (productId, name, { number, rarity } = {}) => ({
  productId,
  name,
  cleanName: name,
  groupId: 604,
  modifiedOn: "2026-11-01T00:00:00.000Z",
  extendedData: [
    ...(number ? [{ name: "Number", value: number }] : []),
    ...(rarity ? [{ name: "Rarity", value: rarity }] : []),
  ],
});
// The importer flattens extendedData to lower-case keys before classifying.
const flat = (product) => Object.fromEntries(product.extendedData.map((entry) => [entry.name.toLowerCase(), entry.value]));

const SINGLE_CARDS = [
  tcgcsv(42367, "Dratini", { number: "026/102", rarity: "Uncommon" }),
  tcgcsv(88201, "Mantine", { number: "34/75", rarity: "Rare" }),
  tcgcsv(210553, "Mantine - SWSH026", { number: "SWSH026", rarity: "Promo" }),
  tcgcsv(86902, "Victini", { number: "14/101", rarity: "Holo Rare" }),
  tcgcsv(98040, "Victini - BW32", { number: "BW32", rarity: "Promo" }),
  tcgcsv(535012, "Nemona's Backpack", { number: "083/091", rarity: "Uncommon" }),
  tcgcsv(497500, "Tinkatuff", { number: "104/193", rarity: "Uncommon" }),
  tcgcsv(497650, "Ting-Lu", { number: "127/193", rarity: "Rare" }),
  tcgcsv(560300, "Iris's Fighting Spirit", { number: "149/162", rarity: "Uncommon" }),
  tcgcsv(560310, "Boxed Order", { number: "143/162", rarity: "Uncommon" }),
  tcgcsv(560320, "Ancient Booster Energy Capsule", { number: "159/182", rarity: "Uncommon" }),
  tcgcsv(477100, "Iron Bundle - 058 (Prerelease)", { number: "058", rarity: "Promo" }),
  tcgcsv(283400, "Giratina VSTAR (Secret)", { number: "GG69/GG70", rarity: "Secret Rare" }),
  // Energy cards often carry no number at all; the rarity alone is the evidence.
  tcgcsv(210001, "Fighting Energy (2022 Unnumbered)", { rarity: "Common" }),
];

const SEALED_PRODUCTS = [
  [tcgcsv(503313, "151 Mini Tin [Arcanine & Omanyte]"), "mini_tin"],
  [tcgcsv(528040, "Paldean Fates Tin [Charizard ex]"), "tin"],
  [tcgcsv(273800, "Astral Radiance Booster Box"), "booster_display_box"],
  [tcgcsv(273801, "Astral Radiance Booster Pack"), "booster_pack"],
  [tcgcsv(593355, "Prismatic Evolutions Elite Trainer Box"), "elite_trainer_box"],
];

test("the shared rule reads card evidence, not names", () => {
  for (const number of ["026/102", "26/97", "SWSH026", "XY184", "BW74", "GG69/GG70", "TG12/TG30", "S1/S4", "177a/168", "006", "6"]) {
    assert.equal(rule.hasCardCollectorNumber(number), true, number);
  }
  for (const number of ["", null, undefined, "820650853135", "Booster Box", "36 packs", "1/2/3"]) {
    assert.equal(rule.hasCardCollectorNumber(number), false, String(number));
  }
  for (const rarity of ["Common", "Uncommon", "Promo", "Holo Rare", "Special Illustration Rare", "Unconfirmed"]) {
    assert.equal(rule.isCardRarity(rarity), true, rarity);
  }
  for (const rarity of ["", "  ", null, undefined, "Code Card", "Sealed", "Sealed Product", "None", "N/A"]) {
    assert.equal(rule.isCardRarity(rarity), false, String(rarity));
  }
  assert.equal(rule.isSingleCard({ cardNumber: "026/102", rarity: "Uncommon" }), true);
  assert.equal(rule.isSingleCard({ cardNumber: "", rarity: "Common" }), true, "an unnumbered Energy card");
  assert.equal(rule.isSingleCard({ cardNumber: "169", rarity: "" }), true, "a numbered card with no rarity on file");
  assert.equal(rule.isSingleCard({ cardNumber: "", rarity: "" }), false, "a tin or box carries neither");
  assert.equal(rule.isSingleCard({ cardNumber: "", rarity: "Code Card" }), false, "code cards are not decided here");
  assert.equal(rule.isSingleCard(), false);
});

test("the Supabase importer files Dratini, Mantine, Victini and Nemona's Backpack as cards", () => {
  for (const product of SINGLE_CARDS) {
    const result = classifySealedProduct(product, flat(product));
    assert.equal(result.isSealed, false, `${product.name} is a single card`);
    assert.equal(result.productKind, "single_card", product.name);
    assert.equal(result.sealedProductType, null, product.name);
  }
});

test("the Supabase importer still files real tins, boxes and packs as sealed", () => {
  for (const [product, sealedProductType] of SEALED_PRODUCTS) {
    const result = classifySealedProduct(product, flat(product));
    assert.equal(result.isSealed, true, `${product.name} is sealed`);
    assert.equal(result.productKind, "sealed_product", product.name);
    assert.equal(result.sealedProductType, sealedProductType, product.name);
  }
  // Code cards are outside this rule: no collector number, and "Code Card" is not a card rarity.
  const codeCard = tcgcsv(273900, "Code Card - Astral Radiance Booster Pack", { rarity: "Code Card" });
  assert.equal(classifySealedProduct(codeCard, flat(codeCard)).isSealed, true);
});

test("the daily refresh files the same cards as cards and the same products as sealed", () => {
  for (const product of SINGLE_CARDS) assert.equal(sync.isSealedOrAccessory(product), false, `${product.name} is a single card`);
  for (const [product] of SEALED_PRODUCTS) assert.equal(sync.isSealedOrAccessory(product), true, `${product.name} is sealed`);

  const group = { groupId: 604, name: "Base Set", abbreviation: "BS", modifiedOn: "2026-11-01T00:00:00.000Z" };
  const products = [SINGLE_CARDS[0], SINGLE_CARDS[5], SEALED_PRODUCTS[0][0], SEALED_PRODUCTS[2][0]];
  const prices = products.map((product, index) => ({ productId: product.productId, marketPrice: 2.86 + index, midPrice: 3, lowPrice: 1, highPrice: 9, subTypeName: "Normal" }));
  const rows = sync.normalizeTcgCsvGroup({ results: products }, { results: prices }, group, "2026-11-26T09:17:00.000Z");
  assert.deepEqual(rows.cards.map((row) => row.name), ["Dratini", "Nemona's Backpack"]);
  assert.deepEqual(rows.sealedProducts.map((row) => row.name), ["151 Mini Tin [Arcanine & Omanyte]", "Astral Radiance Booster Box"]);
  const dratini = rows.cards[0];
  assert.equal(dratini.cardNumber, "026/102");
  assert.equal(dratini.rarity, "Uncommon");
  assert.equal(dratini.marketPrice, 2.86, "Dratini keeps its price as a card");
  assert.equal(rows.marketPrices.find((row) => row.tcgplayerProductId === "42367").catalogType, "card");
  assert.equal(rows.marketPrices.find((row) => row.tcgplayerProductId === "503313").catalogType, "sealed");
});

test("the daily refresh moves cards already stored as sealed, keeping their record ID and price link", () => {
  const group = { groupId: 604, name: "Base Set", abbreviation: "BS", modifiedOn: "2026-11-01T00:00:00.000Z" };
  const dratini = SINGLE_CARDS[0];
  const tin = SEALED_PRODUCTS[0][0];
  const oldCheck = "2026-11-25T09:17:00.000Z";
  const newCheck = "2026-11-26T09:17:00.000Z";
  const quote = (product, marketPrice) => ({ productId: product.productId, marketPrice, midPrice: 3, lowPrice: 1, highPrice: 9, subTypeName: "Normal" });
  // What the files held before the fix: both rows written by the sealed normalizer.
  const before = {
    sealed: [sync.normalizeTcgCsvSealed(dratini, group, quote(dratini, 2.5), oldCheck), sync.normalizeTcgCsvSealed(tin, group, quote(tin, 50), oldCheck)],
    cards: [],
    marketPrices: [sync.normalizeMarketPrice(dratini, group, quote(dratini, 2.5), "sealed", oldCheck), sync.normalizeMarketPrice(tin, group, quote(tin, 50), "sealed", oldCheck)],
  };
  assert.equal(before.sealed[0].productType, "Tin", "the stored Dratini row was a Tin");
  const fresh = sync.normalizeTcgCsvGroup({ results: [dratini, tin] }, { results: [quote(dratini, 2.86), quote(tin, 56.46)] }, group, newCheck);
  const result = sync.preserveLastGoodCatalog(before, { ...fresh, groups: [group], syncedGroups: [group], failedGroups: [] });

  assert.deepEqual(result.sealedProducts.map((row) => row.name), ["151 Mini Tin [Arcanine & Omanyte]"]);
  assert.equal(result.cards.length, 1);
  const card = result.cards[0];
  assert.equal(card.id, "tcgcsv-42367", "the stored record ID stays valid");
  assert.equal(card.catalogType, "card");
  assert.equal(card.catalogItemType, "single");
  assert.equal(card.cardNumber, "026/102");
  assert.equal(card.rarity, "Uncommon");
  assert.equal(card.marketPrice, 2.86);
  assert.equal(card.priceCheckedAt, newCheck);
  for (const field of ["productType", "sealedSubtype", "isSealed", "is_sealed", "isAccessory", "packCount", "marketValue"]) {
    assert.equal(Object.hasOwn(card, field), false, `${field} belongs to sealed rows only`);
  }
  const price = result.marketPrices.find((row) => row.tcgplayerProductId === "42367");
  assert.equal(price.catalogItemId, "tcgcsv-42367");
  assert.equal(price.catalogType, "card");
  assert.equal(price.productType, "Card");
  assert.equal(price.marketPrice, 2.86);
  assert.equal(result.sealedProducts[0].id, "tcgcsv-503313");
  assert.equal(result.sealedProducts[0].productType, "Mini Tin");
  assert.equal(result.sealedProducts[0].marketPrice, 56.46);

  // A feed row without a usable price must not blank the stored one while the row moves.
  const noQuote = sync.normalizeTcgCsvGroup({ results: [dratini, tin] }, { results: [quote(tin, 56.46)] }, group, newCheck);
  const unpriced = sync.preserveLastGoodCatalog(before, { ...noQuote, groups: [group], syncedGroups: [group], failedGroups: [] });
  const kept = unpriced.cards[0];
  assert.equal(kept.catalogType, "card");
  assert.equal(kept.marketPrice, 2.5);
  assert.equal(kept.priceCheckedAt, oldCheck);
  // Its stored price row was not refreshed either, and still follows the card.
  const keptPrice = unpriced.marketPrices.find((row) => row.tcgplayerProductId === "42367");
  assert.equal(keptPrice.catalogType, "card");
  assert.equal(keptPrice.productType, "Card");
  assert.equal(keptPrice.marketPrice, 2.5);
  assert.equal(keptPrice.timestamp, oldCheck);
  assert.equal(unpriced.marketPrices.find((row) => row.tcgplayerProductId === "503313").catalogType, "sealed");
});

test("the scanner's name list knows the cards that were filed as sealed, and the daily job keeps it in step", () => {
  // The list is built from the bundled card file. While Dratini, Mantine, Victini and Giratina sat
  // in the sealed file, the scanner could not correct a misread to any of those names.
  const names = new Set(JSON.parse(read("../src/data/generated/cardNames.json")).map((name) => name.toLowerCase()));
  for (const name of ["Dratini", "Mantine", "Victini", "Giratina", "Tinkatink", "Tinkatuff", "Tinkaton", "Ting Lu", "Fighting Energy", "Collapsed Stadium"]) {
    assert.ok(names.has(name.toLowerCase()), `${name} is a card name the scanner should know`);
  }
  const cards = JSON.parse(read("../src/data/generated/pokemonTcgCards.json"));
  const sealed = JSON.parse(read("../src/data/generated/sealedProducts.json"));
  assert.ok(cards.some((row) => row.name === "Dratini" && row.setName === "Base Set" && row.cardNumber === "026/102"), "Dratini 026/102 is in the card file");
  for (const name of ["Dratini", "Mantine", "Victini", "Giratina"]) {
    assert.equal(sealed.filter((row) => row.name === name).length, 0, `${name} is not in the sealed file`);
  }
  assert.ok(sealed.some((row) => row.productType === "Mini Tin"), "real tins stay in the sealed file");
  assert.ok(sealed.some((row) => row.productType === "Booster Box"), "real booster boxes stay in the sealed file");

  const job = read("../.github/workflows/market-price-refresh.yml");
  const refresh = job.indexOf("sync:market-prices");
  const rebuild = job.indexOf("node scripts/build-card-names.mjs");
  const commit = job.indexOf("git add ");
  assert.ok(refresh > 0 && rebuild > refresh && commit > rebuild, "the name list is rebuilt after the refresh and before the commit");
  assert.match(job.slice(commit, job.indexOf("\n", commit)), /src\/data\/generated\/cardNames\.json/, "and committed with the rest");
});

test("a card whose name holds a product word is on the scanner's name list; a listing of another card is not", async () => {
  // Iron Bundle is a Pokemon and Secret Box a Trainer card. The name builder dropped every
  // name with a product word, so the scanner could not correct a misread to them.
  const { buildCardNameList } = await import("./build-card-names.mjs");
  const card = (name, evidence = { cardNumber: "001/100", rarity: "Common" }) => ({ name, cardName: name, catalogType: "card", ...evidence });
  const list = buildCardNameList([
    card("Bisharp"), card("Fire Energy"),
    card("Iron Bundle 056 182"), card("Secret Box"), card("Tool Box"), card("Ancient Booster Energy Capsule"),
    // Listings of cards already on the list.
    card("Bisharp Darkrai Deck"), card("Fire Energy Prize Pack Series 1"), card("Iron Bundle Holiday Calendar"),
    // No rarity and no number: a sealed product, whatever the file it came from.
    card("Surging Sparks Booster Box", {}), card("Mystery Tin", { cardNumber: "", rarity: "" }), card("Code Card Booster Pack", { rarity: "Code Card" }),
  ]);
  assert.deepEqual(list, ["Ancient Booster Energy Capsule", "Bisharp", "Fire Energy", "Iron Bundle", "Secret Box", "Tool Box"]);

  const names = new Set(JSON.parse(read("../src/data/generated/cardNames.json")).map((name) => name.toLowerCase()));
  for (const name of ["Iron Bundle", "Secret Box", "Tool Box", "Legend Box", "Surprise Box", "Box of Disaster", "Suspicious Food Tin", "Aarons Collection",
    "Ancient Booster Energy Capsule", "Future Booster Energy Capsule", "G Booster", "Deduction Kit", "Fossil Excavation Kit"]) {
    assert.ok(names.has(name.toLowerCase()), `${name} is a card name the scanner should know`);
  }
  for (const name of ["Bisharp Darkrai Deck", "Fighting Energy Prize Pack Series", "Iron Bundle Holiday Calendar", "G Booster Team Plasma", "Hoopa EX Collection", "Greninja V Union Set of"]) {
    assert.equal(names.has(name.toLowerCase()), false, `${name} is a listing, not a printed name`);
  }
  assert.deepEqual([...names].filter((name) => /\b(?:elite trainer box|booster box|booster pack|booster bundle|mini tin)\b/.test(name)), [], "no sealed product is on the list");
});

test("the SQL rule matches the JavaScript rule and runs before the name words", () => {
  const sqlPattern = (regex) => regex.source.replaceAll("\\/", "/");
  const migration = read("../supabase/migrations/20261126090000_catalog_single_cards_not_sealed.sql");
  assert.match(migration, /create or replace function public\.catalog_is_single_card\(p_card_number text, p_rarity text\)/);
  assert.ok(migration.includes(`'${sqlPattern(rule.CARD_COLLECTOR_NUMBER)}'`), "the collector number pattern is the same in SQL");
  assert.ok(migration.includes(`'${sqlPattern(rule.NOT_A_CARD_RARITY)}'`), "the not-a-card rarity list is the same in SQL");
  assert.match(migration, /set\s+catalog_item_type = 'card',\s+product_type = 'Card'\s+where mci\.catalog_item_type = 'sealed'\s+and public\.catalog_is_single_card\(mci\.card_number, mci\.rarity\)/);

  const master = read("./backfill-master-catalog-batches.cjs");
  const masterRule = master.indexOf("when public.catalog_is_single_card(pc.card_number, pc.rarity) then 'card'");
  assert.ok(masterRule > 0, "the master catalog backfill asks the single-card rule");
  assert.ok(masterRule < master.indexOf("'%tin%'"), "and asks it before any name word");

  const normalized = read("./backfill-normalized-catalog-batches.cjs");
  const normalizedRule = normalized.indexOf("when not public.catalog_is_single_card(pc.card_number, pc.rarity)");
  assert.ok(normalizedRule > 0, "the product kind backfill asks the single-card rule");
  assert.ok(normalizedRule < normalized.indexOf("'%tin%'"), "and asks it before any name word");
});
