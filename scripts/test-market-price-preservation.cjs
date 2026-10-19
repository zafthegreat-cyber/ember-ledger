const assert = require("node:assert/strict");
const path = require("node:path");
const vm = require("node:vm");
const { buildSync } = require("esbuild");

const root = path.resolve(__dirname, "..");
const compiled = buildSync({
  stdin: { contents: ["priceCacheService", "catalogSyncService", "marketDataService"].map((name) => `export * from './src/services/${name}.js';`).join("\n"), resolveDir: root },
  bundle: true, platform: "node", format: "cjs", write: false, absWorkingDir: root, tsconfigRaw: {},
}).outputFiles[0].text;
const loaded = { exports: {} };
vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, require, console, Date, Math });
const api = loaded.exports;
let checks = 0;
function check(name, run) { run(); checks += 1; console.log(`PASS ${name}`); }
const oldDate = "2025-01-02T10:00:00.000Z";
const item = Object.freeze({ id: "preserve-card", catalogType: "card", marketPrice: 50, marketValueNearMint: 50, marketSource: "TCGCSV", marketLastUpdated: oldDate, sourceType: "tcgcsv", marketStatus: "cached" });
const quote = (overrides = {}) => ({ catalogItemId: item.id, catalogType: "card", externalSource: "TCGCSV", marketPrice: 50, currency: "USD", timestamp: oldDate, marketStatus: "cached", ...overrides });

check("independent sources and currencies retain their own cache rows", () => {
  let cache = { prices: [] };
  for (const entry of [quote(), quote({ externalSource: "eBay asking comparison", priceType: "listing", marketPrice: 63 }), quote({ externalSource: "Cardmarket", currency: "EUR", marketPrice: 41 }), quote({ externalSource: "Manual", marketStatus: "manual", marketPrice: 39 })]) cache = api.updateCachedMarketPrice(cache, entry);
  assert.equal(cache.prices.length, 4);
  const refreshed = api.updateCachedMarketPrice(cache, quote({ marketPrice: 51 }));
  assert.equal(refreshed.prices.length, 4);
  assert.equal(refreshed.prices.find((row) => row.externalSource === "Manual").marketPrice, 39);
  assert.equal(refreshed.prices.find((row) => row.currency === "EUR").marketPrice, 41);
});
check("failed, missing and invalid quotes cannot replace a valid cached value", () => {
  const cache = Object.freeze({ prices: Object.freeze([Object.freeze(quote())]), lastSync: oldDate });
  for (const value of [0, -1, NaN, Infinity, "not a price", null]) {
    assert.equal(api.updateCachedMarketPrice(cache, quote({ marketPrice: value })), cache);
  }
});
check("manual review wins even when a provider returned a newer quote", () => {
  const cache = { prices: [quote({ externalSource: "Manual", marketPrice: 39, marketStatus: "manual" }), quote({ externalSource: "Provider", marketPrice: 999, marketStatus: "live", timestamp: "2026-10-19T15:00:00Z" })] };
  const best = api.getBestAvailableMarketPrice(item, cache);
  assert.equal(best.marketPrice, 39); assert.equal(best.externalSource, "Manual");
});
check("EUR and USD quotes never mix into the same saved market value", () => {
  const cache = { prices: [quote({ currency: "EUR", marketPrice: 999, marketStatus: "live" }), quote({ marketPrice: 51 })] };
  assert.notEqual(api.getBestAvailableMarketPrice(item, cache).marketPrice, 999);
  const eurItem = { ...item, currency: "EUR", marketPrice: 0, marketValueNearMint: 0 };
  assert.equal(api.getBestAvailableMarketPrice(eurItem, cache).marketPrice, 999);
});
check("an explicitly unknown source timestamp stays unknown", () => {
  assert.equal(api.normalizeMarketPrice(quote({ timestamp: "" })).timestamp, "");
  assert.equal(api.normalizeMarketPrice(quote()).timestamp, oldDate);
  assert(api.normalizeMarketPrice({ marketPrice: 5, externalSource: "Manual" }).timestamp);
});
check("local card review preserves source, date and cached status", () => {
  const result = api.syncPokemonTcgPrices([item]).prices[0];
  assert.equal(result.externalSource, "TCGCSV"); assert.equal(result.timestamp, oldDate); assert.equal(result.marketStatus, "cached");
  const unknown = api.syncPokemonTcgPrices([{ ...item, marketLastUpdated: "" }]).prices[0];
  assert.equal(unknown.timestamp, "");
});
check("local sealed review cannot relabel manual prices as TCGCSV or newly fetched", () => {
  const result = api.syncTcgCsvProductPrices([{ ...item, catalogType: "sealed", marketSource: "Manual", sourceType: "manual", marketStatus: "manual", tcgplayerProductId: "123", marketLastUpdated: "" }]).prices[0];
  assert.equal(result.externalSource, "Manual"); assert.equal(result.timestamp, ""); assert.equal(result.marketStatus, "manual");
});
check("a local catalog review preserves its real quote observation date", () => {
  const result = api.refreshCatalogMarketItems([item], { prices: [], lastSync: oldDate });
  assert.equal(result.catalog[0].marketPrice, 50); assert.equal(result.catalog[0].marketLastUpdated, oldDate);
  assert.equal(item.marketLastUpdated, oldDate);
});
check("missing provider data never zeroes catalog or watchlist values", () => {
  assert.equal(api.applyMarketPriceToCatalogItem(item, { marketPrice: 0 }), item);
  const watch = Object.freeze({ id: "watch", productId: "unknown", marketValue: 48, lastUpdated: oldDate });
  const result = api.refreshWatchlistMarketItems([watch], [{ id: "unknown", marketValue: 0 }], { prices: [] });
  assert.equal(result[0], watch);
});
check("watchlist review does not invent a quote timestamp", () => {
  const watched = { id: "watch", productId: item.id, marketValue: 48, lastUpdated: oldDate };
  const result = api.refreshWatchlistMarketItems([watched], [{ ...item, marketLastUpdated: "" }], { prices: [] });
  assert.equal(result[0].lastUpdated, oldDate);
});
check("an older or undated cache review cannot overwrite a newer same-source quote", () => {
  const cache = { prices: [quote({ id: "stable-price", marketPrice: 75, timestamp: "2026-10-19T12:00:00Z" })] };
  for (const timestamp of [oldDate, ""]) assert.equal(api.updateCachedMarketPrice(cache, quote({ marketPrice: 50, timestamp })), cache);
  const updated = api.updateCachedMarketPrice(cache, quote({ marketPrice: 76, timestamp: "2026-10-20T12:00:00Z" }));
  assert.equal(updated.prices.length, 1); assert.equal(updated.prices[0].id, "stable-price"); assert.equal(updated.prices[0].marketPrice, 76);
});
check("catalog review retains the latest manual price already in the cache", () => {
  const manual = { ...item, marketSource: "Manual", marketStatus: "manual", sourceType: "manual", externalSourceId: item.id, marketLastUpdated: oldDate };
  const cache = { prices: [quote({ externalId: item.id, externalSource: "Manual", marketPrice: 75, marketStatus: "manual", timestamp: "2026-10-19T12:00:00Z" })] };
  assert.equal(api.refreshCatalogMarketItems([manual], cache).catalog[0].marketPrice, 75);
});
check("cached card and sealed reviews retain EUR without relabeling it USD", () => {
  const euro = { ...item, currency: "EUR", marketSource: "Cardmarket" };
  assert.equal(api.syncPokemonTcgPrices([euro]).prices[0].currency, "EUR");
  assert.equal(api.syncTcgCsvProductPrices([{ ...euro, catalogType: "sealed" }]).prices[0].currency, "EUR");
});
check("record edits do not make an undated price look newly observed", () => {
  const edited = { ...item, marketLastUpdated: "", lastUpdated: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z" };
  assert.equal(api.getBestAvailableMarketPrice(edited, { prices: [] }).timestamp, "");
});
console.log(`Market price preservation: ${checks} checks passed. No requests or record writes.`);
