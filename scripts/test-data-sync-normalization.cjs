const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildCatalogSyncStatus,
  imageConfidence,
  inferProductType,
  isRelevantOsmStore,
  mergeStores,
  normalizeMarketPrice,
  normalizeTcgCsvSealed,
  osmStoreFromElement,
  pricingConfidence,
} = require("./sync-catalog-prices-stores.cjs");

const group = {
  groupId: 23821,
  name: "Scarlet & Violet: Prismatic Evolutions",
  abbreviation: "PRE",
  modifiedOn: "2026-05-01T12:00:00.000Z",
};

const miniPortfolio = {
  productId: 616706,
  name: "Prismatic Evolutions - Mini Portfolio",
  cleanName: "Prismatic Evolutions Mini Portfolio",
  groupId: 23821,
  categoryId: 3,
  imageUrl: "https://tcgcsv.com/sample-mini-portfolio.jpg",
  imageCount: 1,
  url: "https://tcgcsv.com/product/616706",
  modifiedOn: "2026-05-01T12:00:00.000Z",
  extendedData: [{ name: "UPC", value: "123456789012" }],
};

const product = normalizeTcgCsvSealed(miniPortfolio, group, {
  productId: 616706,
  marketPrice: 14.25,
  lowPrice: 11,
  midPrice: 13,
  subTypeName: "Normal",
});

assert.equal(inferProductType("Prismatic Evolutions Mini Portfolio"), "Mini Portfolio");
assert.equal(product.productType, "Mini Portfolio");
assert.equal(product.imageUrl, miniPortfolio.imageUrl);
assert.equal(product.marketPrice, 14.25);
assert.equal(product.pricingConfidence, "high");
assert.equal(product.imageConfidence, "high");
assert.equal(product.upc, "123456789012");

const noPrice = normalizeTcgCsvSealed({ ...miniPortfolio, productId: 616707, imageUrl: "", imageCount: 0 }, group, {});
assert.equal(noPrice.marketStatus, "unknown");
assert.equal(noPrice.pricingConfidence, "unavailable");
assert.equal(noPrice.imageConfidence, "unavailable");
assert.equal(noPrice.imageUrl, "");
assert.equal(pricingConfidence({}), "unavailable");
assert.equal(imageConfidence({}), "unavailable");

const price = normalizeMarketPrice(miniPortfolio, group, { productId: 616706, midPrice: 12.5, subTypeName: "Normal" }, "sealed");
assert.equal(price.catalogItemId, "tcgcsv-616706");
assert.equal(price.pricingConfidence, "medium");

const target = osmStoreFromElement({
  type: "node",
  id: 1001,
  lat: 36.75,
  lon: -76.01,
  tags: {
    name: "Target",
    brand: "Target",
    "addr:housenumber": "525",
    "addr:street": "First Colonial Road",
    "addr:city": "Virginia Beach",
    "addr:state": "VA",
    "addr:postcode": "23451",
  },
});

assert.equal(target.chain, "Target");
assert.equal(target.confidence, "directory_match");
assert.equal(target.pokemonStockLikelihood, "unknown");
assert.equal(isRelevantOsmStore(target), true);

const unrelated = osmStoreFromElement({
  type: "node",
  id: 1002,
  lat: 36.75,
  lon: -76.01,
  tags: {
    name: "Generic Grocer",
    shop: "supermarket",
    "addr:city": "Richmond",
  },
});
assert.equal(isRelevantOsmStore(unrelated), false);

const merged = mergeStores(
  [{ chain: "Target", name: "Target", nickname: "FC", address: "525 First Colonial Road", city: "Virginia Beach", zip: "23451", source: "local-seed" }],
  [target]
);
assert.equal(merged.length, 1);
assert.equal(merged[0].nickname, "FC");

const generatedDir = path.join(__dirname, "..", "src", "data", "generated");
const sealedProducts = JSON.parse(fs.readFileSync(path.join(generatedDir, "sealedProducts.json"), "utf8"));
const cards = JSON.parse(fs.readFileSync(path.join(generatedDir, "pokemonTcgCards.json"), "utf8"));
const marketPrices = JSON.parse(fs.readFileSync(path.join(generatedDir, "marketPrices.json"), "utf8"));
const importStatus = JSON.parse(fs.readFileSync(path.join(generatedDir, "catalogImportStatus.json"), "utf8"));
const generatedProductIds = new Set([...sealedProducts, ...cards].map((row) => String(row.id)));
const joinedPriceRows = marketPrices.filter((row) => generatedProductIds.has(String(row.catalogItemId || row.productId)));

assert.ok(sealedProducts.length > 0, "generated sealed catalog should not be empty");
assert.ok(cards.length > 0, "generated card catalog should not be empty");
assert.ok(marketPrices.length > 0, "generated market price cache should not be empty");
assert.equal(joinedPriceRows.length, marketPrices.length, "market prices should join to catalog products by productId/catalogItemId");
assert.equal(importStatus.priceFallbackLabel, "Price data unavailable");
assert.equal(importStatus.imageFallbackLabel, "Ember & Tide product placeholder");
assert.equal(importStatus.dailyRefreshCommand, "npm.cmd run sync:market-prices");
assert.equal(importStatus.schedulingStatus, "manual-script-only");
assert.equal(importStatus.marketPricesJoinedByProductId, joinedPriceRows.length);
assert.ok(importStatus.productsMissingReferencePrices >= 0, "missing price count should be explicit");
assert.ok(importStatus.productsMissingPhotos >= 0, "missing photo count should be explicit");
assert.doesNotMatch(importStatus.pricingPolicy, /guarantee|guaranteed/i);

const status = buildCatalogSyncStatus({
  catalog: {
    groups: [group],
    syncedGroups: [group],
    sealedProducts: [product, noPrice],
    cards: [],
    marketPrices: [price],
    failedGroups: [],
  },
  stores: { stores: [target], importedFromOverpass: 1, overpassError: "" },
  aliasesImported: 0,
});
assert.equal(status.catalogProductsImported, 2);
assert.equal(status.marketPricesJoinedByProductId, 1);
assert.equal(status.productsWithReferencePrices, 1);
assert.equal(status.productsMissingReferencePrices, 1);
assert.equal(status.priceFallbackLabel, "Price data unavailable");

console.log("Data sync normalization tests passed");
