const assert = require("node:assert/strict");

const {
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

console.log("Data sync normalization tests passed");
