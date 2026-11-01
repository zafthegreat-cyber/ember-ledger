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
    order() { return this; },
    range() { return this; },
    then(resolve) { return Promise.resolve({ data: [charizard, energy, { ...energy, id: "wrong-name", cardNumber: "004/102" }], error: null, count: 99 }).then(resolve); },
  };
  const result = await searchPokemonCatalog({ supabase: { from: () => query }, query: "Charizard Base Set 004/102", pageSize: 20 });
  assert.deepEqual(result.rows.map(row => row.id), [charizard.id]);
  assert.equal(result.count, 1);
  assert.equal(result.hasMore, false);
  assert.ok(clauses.includes("card_number.ilike.%4%/%102%"));
  assert.equal(clauses.some(clause => clause.includes("Charizard Base Set")), false);
});
