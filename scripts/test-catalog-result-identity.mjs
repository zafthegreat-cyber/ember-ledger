import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { catalogCardQueryMatchesRow, getCatalogCollectorQuery, getCatalogPageProducts } from "../src/utils/catalogResultIdentity.mjs";
import { analyzeCatalogSearch, normalizeSearchQuery, scoreCatalogSearchRow } from "../src/data/catalogSearchAliases.mjs";

const charizard = { id: "charizard", name: "Charizard", setName: "Base Set", cardNumber: "004/102" };
const energy = { id: "energy", name: "Fighting Energy", setName: "Base Set", cardNumber: "97/102", market_price: 10 };

test("named collector-number queries reject unrelated cards and the same number on another name", () => {
  assert.equal(catalogCardQueryMatchesRow("Charizard 4/102", charizard), true);
  assert.equal(catalogCardQueryMatchesRow("Charizard 4/102", energy), false);
  assert.equal(catalogCardQueryMatchesRow("Charizard 4/102", { ...energy, cardNumber: "4/102" }), false);
  assert.equal(catalogCardQueryMatchesRow("Charizard 4/102", { ...charizard, cardNumber: "14/102" }), false);
});

test("collector numbers preserve slashes, leading-zero equivalence, prefixes and explicit set names", () => {
  assert.equal(normalizeSearchQuery("Charizard 004/102"), "charizard 004/102");
  assert.equal(getCatalogCollectorQuery("Charizard #004 / 102").collectorNumber, "4/102");
  assert.equal(catalogCardQueryMatchesRow("Charizard Base Set 004／102", charizard), true);
  assert.equal(catalogCardQueryMatchesRow("Pikachu TG05/TG30", { name: "Pikachu", card_number: "TG5/TG030" }), true);
  assert.equal(catalogCardQueryMatchesRow("Charizard Base Set 4/102", { ...charizard, setName: "Celebrations" }), false);
});

test("missing collector identity is withheld; a literal title number can still be checked", () => {
  assert.equal(catalogCardQueryMatchesRow("Charizard 4/102", { name: "Charizard" }), false);
  assert.equal(catalogCardQueryMatchesRow("Charizard 4/102", { name: "Charizard 4/102 Holo" }), true);
  assert.equal(catalogCardQueryMatchesRow("Charizard 4/102", { name: "Charizard 4/102", cardNumber: "4/130" }), false);
  assert.equal(catalogCardQueryMatchesRow("Prismatic ETB", energy), true);
});

test("row ranking cannot rescue a different identity through price or set bonuses", () => {
  const query = "Charizard Base Set 4/102";
  assert.equal(scoreCatalogSearchRow(energy, analyzeCatalogSearch(query), query).score, 0);
  assert.ok(scoreCatalogSearchRow(charizard, analyzeCatalogSearch(query), query).score > 0);
});

test("an empty server page never falls back to rows from a previous search", () => {
  assert.deepEqual(getCatalogPageProducts({ hasRun: true, pagedIds: [], products: [energy] }), []);
  assert.deepEqual(getCatalogPageProducts({ hasRun: false, pagedIds: [energy.id], products: [energy] }), []);
  assert.deepEqual(getCatalogPageProducts({ hasRun: true, pagedIds: ["deleted"], products: [energy] }), []);
});

test("explicit page order and local-only catalog browsing remain supported", () => {
  assert.deepEqual(getCatalogPageProducts({ hasRun: true, pagedIds: [energy.id, charizard.id], products: [charizard, energy] }), [energy, charizard]);
  assert.deepEqual(getCatalogPageProducts({ hasRun: true, products: [charizard], usePagedResults: false }), [charizard]);
});

test("remote card lookup queries the number column and excludes wrong names before counting or paging", async () => {
  const out = resolve("artifacts/qa/catalog-search-100");
  await mkdir(out, { recursive: true });
  const bundlePath = resolve(out, "catalog-service-test.mjs");
  await build({ entryPoints: [resolve("src/services/pokemonCatalogSearch.js")], bundle: true, outfile: bundlePath, format: "esm", platform: "node", define: { "import.meta.env": "{}" } });
  const { searchPokemonCatalog } = await import(pathToFileURL(bundlePath));
  const clauses = [];
  const query = {
    select() { return this; },
    eq() { return this; },
    neq() { return this; },
    or(value) { clauses.push(value); return this; },
    ilike(column, value) { clauses.push(`${column}.ilike.${value}`); return this; },
    limit() { return this; },
    order() { return this; },
    range() { return this; },
    then(resolve) { return Promise.resolve({ data: [charizard, energy, { ...energy, id: "wrong-name", cardNumber: "004/102" }], error: null, count: 99 }).then(resolve); },
  };
  const result = await searchPokemonCatalog({ supabase: { from: () => query }, query: "Charizard Base Set 004/102", pageSize: 20 });
  assert.deepEqual(result.rows.map(row => row.id), [charizard.id]);
  assert.equal(result.count, 1);
  assert.equal(result.hasMore, false);
  // A104/A105: the number is searched alone (with and without a "/total" suffix) so rows that store only "4" or "004" are found.
  assert.ok(clauses.some(clause => clause.includes("card_number.ilike.4,") && clause.includes("card_number.ilike.4/%") && clause.includes("card_number.ilike.04,") && clause.includes("card_number.ilike.004/%")));
  // Nov 23 2026: exact zero-padded spellings only; "%04" also matched 104, 204, ...
  assert.equal(clauses.some(clause => clause.includes("%04")), false);
  // A second, name-guided lookup keeps the right card among the candidates for common numbers.
  assert.ok(clauses.includes("name.ilike.%char%"));
  assert.equal(clauses.some(clause => clause.includes("Charizard Base Set")), false);
});

test("scanner misreads: near-miss names and stray marks still match the same number; other names do not", async () => {
  const { nameWordsMatch, catalogCardQueryMatchesRow: matches } = await import("../src/utils/catalogResultIdentity.mjs");
  const row = { name: "Charizard ex", cardNumber: "125/197", setName: "Obsidian Flames" };
  assert.equal(matches("Charizarb ex 125/197", row), true, "one wrong letter");
  assert.equal(matches("LBASIC Eo Charizard 125/197", row), true, "stray marks from the card frame");
  assert.equal(matches("Pikachu 125/197", row), false, "a different card with the same number");
  assert.equal(matches("Charizard ex 126/197", row), false, "the number still has to match");
  assert.equal(nameWordsMatch(["blastoise", "ex"], ["charizard", "ex"]), false, "a short shared word is not enough");
  assert.equal(matches("Charizard Base Set 4/102", { name: "Fire Energy", cardNumber: "4/102", setName: "Base Set" }), false, "set words alone are not a name match");
});

test("promo numbers: SWSH keeps its prefix, SVP rows store the digits in the promo set (Nov 24 2026)", async () => {
  const { catalogCardQueryMatchesRow: matches, getCatalogCollectorQuery: identity } = await import("../src/utils/catalogResultIdentity.mjs");
  assert.equal(identity("Alakazam ex SVP EN 050").collectorNumber, "svp50");
  assert.equal(identity("Smile"), null, "words that start like a promo code are not numbers");
  const svpPromo = { name: "Alakazam ex 050", cardNumber: "050", setName: "SV: Scarlet & Violet Promo Cards", setCode: "SVP" };
  assert.equal(matches("Alakazam ex SVP050", svpPromo), true);
  assert.equal(matches("Alakazam ex SVP050", { name: "Alakazam ex", cardNumber: "050", setName: "Obsidian Flames" }), false, "the same digits outside the promo set");
  assert.equal(matches("Charizard V SWSH050", { name: "Charizard V SWSH050", cardNumber: "SWSH050", setName: "SWSH: Sword & Shield Promo Cards" }), true);
  assert.equal(matches("Pikachu SWSH050", { name: "Charizard V SWSH050", cardNumber: "SWSH050" }), false, "the name still has to match");
});

test("a 12-digit UPC scan also asks the catalog for its 13- and 14-digit spellings (Nov 24 2026)", async () => {
  const bundlePath = resolve("artifacts/qa/catalog-search-100", "catalog-service-test.mjs");
  const { searchPokemonCatalog } = await import(pathToFileURL(bundlePath));
  const clauses = [];
  const query = {
    select() { return this; }, eq() { return this; }, neq() { return this; }, in() { return this; },
    or(value) { clauses.push(value); return this; }, ilike() { return this; }, limit() { return this; }, order() { return this; }, range() { return this; },
    then(done) { return Promise.resolve({ data: [], error: null, count: 0 }).then(done); },
  };
  await searchPokemonCatalog({ supabase: { from: () => query, rpc: async () => ({ data: [], error: null }) }, query: "196214114845", barcode: "196214114845", mode: "barcode", pageSize: 4 });
  const all = clauses.join(",");
  assert.ok(all.includes("196214114845"));
  assert.ok(all.includes("0196214114845"), "EAN-13 spelling with the leading zero");
});

test("Save all for scanned cards saves a row only when its name and number match one card (Nov 24 2026)", async () => {
  const { readFileSync } = await import("node:fs");
  const vm = await import("node:vm");
  const source = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const start = source.indexOf("  async function findVerifiedCardForScanRow(row) {");
  const end = source.indexOf("\n  async function saveAllCardScanRows()", start);
  assert.ok(start > 0 && end > start, "the real matching function is extractable");
  const rows = [
    { id: "a", name: "Alakazam ex", cardNumber: "050", setName: "SV: Scarlet & Violet Promo Cards", setCode: "SVP" },
    { id: "b", name: "Charizard", cardNumber: "4/102", setName: "Base Set" },
    { id: "c", name: "Charizard", cardNumber: "4/102", setName: "Base Set Shadowless" },
  ];
  const scope = { getCatalogCollectorQuery, catalogCardQueryMatchesRow, isSupabaseConfigured: true, supabase: {},
    searchPokemonCatalogOnDemand: async () => ({ rows }), mapCatalog: (row) => row, getBestCatalogMatches: () => [], catalogProducts: [] };
  vm.runInNewContext(source.slice(start, end) + "\nglobalThis.find = findVerifiedCardForScanRow;", scope);
  assert.equal((await scope.find({ cardName: "Alakazam ex", cardNumber: "SVP 050" }))?.id, "a", "one verified match is saved");
  assert.equal(await scope.find({ cardName: "Charizard", cardNumber: "4/102" }), null, "two printings: left for review");
  assert.equal((await scope.find({ cardName: "Charizard", cardNumber: "4/102", setName: "Shadowless" }))?.id, "c", "the typed set picks one");
  assert.equal(await scope.find({ cardName: "Charizard", cardNumber: "" }), null, "no number: left for review");
  assert.equal(await scope.find({ cardName: "Pikachu", cardNumber: "4/102" }), null, "a different name with the same number is not saved");
});


test("set ids are not promo numbers, names in any script must match, printed set codes rank their set first (Nov 24 2026)", async () => {
  const { catalogCardQueryMatchesRow: matches, getCatalogCollectorQuery: identity } = await import("../src/utils/catalogResultIdentity.mjs");
  assert.equal(identity("Pikachu sm12"), null, "sm12 is Cosmic Eclipse, not promo SM12");
  assert.equal(identity("Pikachu swsh45"), null, "swsh45 is Shining Fates");
  assert.equal(identity("Pikachu SM012").collectorNumber, "sm12", "a padded number is still a promo");
  assert.equal(identity("Charizard V SWSH050").collectorNumber, "swsh50");
  assert.equal(matches("ピカチュウ 025/165", { name: "ピカチュウ", cardNumber: "025/165" }), true);
  assert.equal(matches("ピカチュウ 025/165", { name: "リザードンex", cardNumber: "025/165" }), false, "another Japanese name with the same number");
  assert.equal(matches("피카츄 025/165", { name: "Pikachu", cardNumber: "025/165" }), false, "a Korean name does not match an English row");

  const bundlePath = resolve("artifacts/qa/catalog-search-100", "catalog-service-test.mjs");
  await build({ entryPoints: [resolve("src/services/pokemonCatalogSearch.js")], bundle: true, outfile: bundlePath, format: "esm", platform: "node", define: { "import.meta.env": "{}" } });
  const { printedSetCodeIn, rowIsFromSet } = await import(pathToFileURL(bundlePath) + "?setcode");
  const obf = printedSetCodeIn("Charizard ex OBF 125/197");
  assert.equal(obf?.name, "Obsidian Flames");
  assert.equal(printedSetCodeIn("Charizard ex 125/197"), null);
  assert.equal(printedSetCodeIn("Lugia BKT 140"), null, "BKT names two sets, so it does not pick one");
  assert.equal(rowIsFromSet({ set_code: "sv3" }, obf), true);
  assert.equal(rowIsFromSet({ setName: "SV03: Obsidian Flames" }, obf), true);
  assert.equal(rowIsFromSet({ setName: "Paldea Evolved", setCode: "sv2" }, obf), false);
});

test("printed codes are not name words, SWSH with a space is a promo, #N is the card's own number (Nov 24 2026)", async () => {
  const { catalogCardQueryMatchesRow: matches, getCatalogCollectorQuery: identity } = await import("../src/utils/catalogResultIdentity.mjs");
  const { normalizeSearchQuery: normalize } = await import("../src/data/catalogSearchAliases.mjs");
  assert.deepEqual(identity(normalize("Charizard ex MEW EN 199/165")).requiredWords, ["charizard", "ex"], "the retry searches the name, not 'charizard ex mew en'");
  assert.deepEqual(identity("Mew ex MEW 151/165").requiredWords, ["mew", "ex"], "Mew the Pokemon stays");
  assert.equal(matches("Mew 151/165", { name: "Charizard", cardNumber: "151/165" }), false, "a lone name that is also a set code still has to match");
  assert.equal(identity(normalize("Charizard V SWSH 050")).collectorNumber, "swsh50");
  assert.equal(normalize("swsh 7"), "sword shield 7", "a set number after SWSH still reads as the set");
  assert.equal(identity("Pikachu #25").collectorNumber, "25");
  assert.equal(matches("Pikachu #25", { name: "Pikachu", cardNumber: "025/198" }), true);
  assert.equal(matches("Pikachu #25", { name: "Pikachu", cardNumber: "58/102" }), false);
  assert.equal(matches("Pikachu #25", { name: "Raichu", cardNumber: "25/198" }), false);
  assert.equal(matches("ナッシー 103/108", { name: "ナッシー[Exeggutor]", cardNumber: "103/108" }), true, "a Japanese catalog row matches its own name");
  assert.equal(matches("ナッシー 103/108", { name: "Exeggutor", cardNumber: "103/108" }), false, "a Japanese read does not match an English-only row");
});
