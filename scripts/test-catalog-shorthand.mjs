import assert from "node:assert/strict";
import {
  analyzeCatalogSearch,
  describeSetAliasCoverage,
  scoreCatalogSearchRow,
} from "../src/data/catalogSearchAliases.mjs";

const rows = [
  product("Prismatic Evolutions Pokemon Center Elite Trainer Box", "Prismatic Evolutions", "Pokemon Center Elite Trainer Box"),
  product("Prismatic Evolutions Elite Trainer Box", "Prismatic Evolutions", "Elite Trainer Box"),
  product("Paldea Evolved Elite Trainer Box", "Paldea Evolved", "Elite Trainer Box"),
  product("Scarlet & Violet 151 Ultra-Premium Collection", "Scarlet & Violet 151", "Ultra Premium Collection"),
  product("Scarlet & Violet 151 Elite Trainer Box", "Scarlet & Violet 151", "Elite Trainer Box"),
  product("Surging Sparks Booster Box", "Surging Sparks", "Booster Box"),
  product("Surging Sparks Booster Bundle", "Surging Sparks", "Booster Bundle"),
  product("Destined Rivals Elite Trainer Box", "Destined Rivals", "Elite Trainer Box"),
  product("Black Bolt Booster Bundle", "Black Bolt", "Booster Bundle"),
  product("Black Bolt Booster Box", "Black Bolt", "Booster Box"),
  product("White Flare Booster Bundle", "White Flare", "Booster Bundle"),
  product("Crown Zenith Elite Trainer Box", "Crown Zenith", "Elite Trainer Box"),
  product("Crown Zenith Mini Tin", "Crown Zenith", "Mini Tin"),
  product("Evolving Skies Booster Box", "Evolving Skies", "Booster Box"),
  product("Evolving Skies Elite Trainer Box", "Evolving Skies", "Elite Trainer Box"),
  product("Paldea Evolved 3-Pack Blister", "Paldea Evolved", "3-Pack Blister"),
  product("Obsidian Flames Sleeved Booster", "Obsidian Flames", "Sleeved Booster"),
  product("Temporal Forces Checklane Blister", "Temporal Forces", "Checklane Blister"),
  product("Silver Tempest Mini Tin", "Silver Tempest", "Mini Tin"),
  product("Celebrations Ultra-Premium Collection", "Celebrations", "Ultra Premium Collection"),
];

function product(name, setName, productType) {
  return {
    id: name,
    name,
    product_name: name,
    set_name: setName,
    official_expansion_name: setName,
    product_type: productType,
    sealed_product_type: productType,
    catalog_group: "Sealed",
    category: "Pokemon",
    market_price: 42,
  };
}

function rank(query) {
  const analysis = analyzeCatalogSearch(query);
  return rows
    .map((row) => ({ row, ...scoreCatalogSearchRow(row, analysis, query) }))
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0);
}

function expectTop(query, expectedName) {
  const [top] = rank(query);
  assert.ok(top, `${query}: expected at least one result`);
  assert.equal(top.row.name, expectedName, `${query}: expected ${expectedName}, got ${top.row.name}`);
}

function expectTopIncludes(query, expectedNames) {
  const topNames = rank(query).slice(0, expectedNames.length).map((item) => item.row.name);
  for (const expectedName of expectedNames) {
    assert.ok(topNames.includes(expectedName), `${query}: expected top results to include ${expectedName}; got ${topNames.join(" | ")}`);
  }
}

function expectTopType(query, expectedType) {
  const [top] = rank(query);
  assert.ok(top, `${query}: expected at least one result`);
  assert.equal(top.row.product_type, expectedType, `${query}: expected product type ${expectedType}, got ${top.row.product_type}`);
}

expectTop("pr evo etb", "Prismatic Evolutions Elite Trainer Box");
expectTop("pre etb", "Prismatic Evolutions Elite Trainer Box");
expectTopIncludes("pe etb", ["Paldea Evolved Elite Trainer Box", "Prismatic Evolutions Elite Trainer Box"]);
expectTop("151 upc", "Scarlet & Violet 151 Ultra-Premium Collection");
expectTop("sv151 upc", "Scarlet & Violet 151 Ultra-Premium Collection");
expectTop("ssp bb", "Surging Sparks Booster Box");
expectTop("surging sparks booster box", "Surging Sparks Booster Box");
expectTop("dri etb", "Destined Rivals Elite Trainer Box");
expectTop("destined rivals etb", "Destined Rivals Elite Trainer Box");
expectTop("bb booster bundle", "Black Bolt Booster Bundle");
expectTop("black bolt booster bundle", "Black Bolt Booster Bundle");
expectTop("white flare bundle", "White Flare Booster Bundle");
expectTop("cz etb", "Crown Zenith Elite Trainer Box");
expectTop("evs bb", "Evolving Skies Booster Box");
expectTop("evolving skies booster box", "Evolving Skies Booster Box");
expectTop("pc etb", "Prismatic Evolutions Pokemon Center Elite Trainer Box");
expectTop("3pk blister", "Paldea Evolved 3-Pack Blister");
expectTop("checklane", "Temporal Forces Checklane Blister");
expectTopType("mini tin", "Mini Tin");
expectTop("upc", "Scarlet & Violet 151 Ultra-Premium Collection");
expectTop("booster bundle", "Surging Sparks Booster Bundle");

const peAnalysis = analyzeCatalogSearch("pe etb");
assert.deepEqual(peAnalysis.didYouMean.map((item) => item.label).slice(0, 2), ["Paldea Evolved", "Prismatic Evolutions"]);

const coverage = describeSetAliasCoverage();
assert.ok(coverage.length >= 10, `expected broad set-era coverage, got ${coverage.length} eras`);

console.log(JSON.stringify({
  ok: true,
  tests: 22,
  coveredEras: coverage,
}, null, 2));
