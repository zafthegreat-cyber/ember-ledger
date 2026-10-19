const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  buildCatalogSyncStatus,
  normalizeMarketPrice,
  normalizeTcgCsvGroup,
  normalizeTcgCsvSealed,
  positivePrice,
  preserveLastGoodCatalog,
  providerBuildTimestamp,
  providerCheckpoint,
  shouldSkipProviderBuild,
  syncTcgCsvCatalog,
} = require("./sync-catalog-prices-stores.cjs");

const checkedAt = "2026-10-19T18:30:00.000Z";
const oldCheck = "2026-10-18T09:00:00.000Z";
const group = { groupId: 12, name: "Safety fixture", modifiedOn: "2020-01-01T00:00:00.000Z" };
const product = (productId, name = `Booster Bundle ${productId}`) => ({ productId, name, groupId: 12, modifiedOn: group.modifiedOn });
const quote = (productId, marketPrice = 50) => ({ productId, marketPrice, midPrice: 45, lowPrice: 40, highPrice: 65, subTypeName: "Normal" });
const normalized = (id, value = 50, time = oldCheck) => normalizeTcgCsvGroup(
  { results: [product(id)] }, { results: [quote(id, value)] }, group, time,
);
const incoming = (rows) => ({ ...rows, groups: [group], syncedGroups: [group], failedGroups: [] });
const previous = (rows) => ({ sealed: rows.sealedProducts, cards: rows.cards, marketPrices: rows.marketPrices });

test("quote validation rejects blank, negative, nonfinite, boolean, and object values", () => {
  for (const value of [undefined, null, "", " ", "bad", -10, "-3", 0, 0.001, Number.MAX_VALUE, Infinity, NaN, true, false, {}, []]) {
    assert.equal(positivePrice(value), "", String(value));
  }
  assert.equal(positivePrice("12.35"), 12.35);
});

test("price check time reflects fetched prices while product metadata remains separate", () => {
  const rows = normalized(1, 50, checkedAt);
  assert.equal(rows.sealedProducts[0].marketLastUpdated, checkedAt);
  assert.equal(rows.sealedProducts[0].priceCheckedAt, checkedAt);
  assert.equal(rows.sealedProducts[0].sourceUpdatedAt, group.modifiedOn);
  assert.equal(rows.marketPrices[0].timestamp, checkedAt);
  assert.equal(rows.marketPrices[0].sourceUpdatedAt, group.modifiedOn);
  const absent = normalizeTcgCsvSealed(product(2), group, {}, checkedAt);
  assert.equal(absent.marketLastUpdated, "");
  assert.equal(absent.priceCheckedAt, "");
});

test("a mid-price reference is distinct from a provider market price", () => {
  const row = normalizeMarketPrice(product(1), group, { productId: 1, marketPrice: -50, midPrice: 42 }, "sealed", checkedAt);
  assert.equal(row.marketPrice, 42);
  assert.equal(row.marketPriceBasis, "mid");
  assert.equal(row.pricingConfidence, "medium");
});

test("a partial feed keeps failed and omitted groups and every previous record ID", () => {
  const oldA = normalized(1);
  const oldB = normalized(2, 80);
  const before = { sealed: [...oldA.sealedProducts, ...oldB.sealedProducts], cards: [], marketPrices: [...oldA.marketPrices, ...oldB.marketPrices] };
  const fresh = incoming(normalized(1, 55, checkedAt));
  fresh.failedGroups = [{ groupId: 99, error: "offline" }];
  const result = preserveLastGoodCatalog(before, fresh);
  assert.equal(result.sealedProducts.find((row) => row.tcgplayerProductId === "1").marketPrice, 55);
  assert.deepEqual(result.sealedProducts.find((row) => row.tcgplayerProductId === "2"), oldB.sealedProducts[0]);
  assert.deepEqual(result.marketPrices.find((row) => row.tcgplayerProductId === "2"), oldB.marketPrices[0]);
  for (const row of before.sealed) assert.ok(result.sealedProducts.some((after) => after.id === row.id));
  for (const row of before.marketPrices) assert.ok(result.marketPrices.some((after) => after.id === row.id));
});

test("invalid or missing quotes keep last good value, provenance, and observation time", () => {
  const old = normalized(1);
  const fresh = normalized(2, 60, checkedAt);
  fresh.sealedProducts.push(normalizeTcgCsvSealed({ ...product(1), name: "Updated product metadata" }, group, { productId: 1, marketPrice: -1, midPrice: "oops" }, checkedAt));
  const result = preserveLastGoodCatalog(previous(old), incoming(fresh));
  const retained = result.sealedProducts.find((row) => row.tcgplayerProductId === "1");
  assert.equal(retained.name, "Updated product metadata");
  assert.equal(retained.marketPrice, 50);
  assert.equal(retained.marketLastUpdated, oldCheck);
  assert.equal(retained.marketSource, "TCGCSV");
  assert.equal(retained.marketPriceBasis, "market");
  assert.deepEqual(result.marketPrices.find((row) => row.tcgplayerProductId === "1"), old.marketPrices[0]);
});

test("manual catalog and price values survive a matching provider quote", () => {
  const old = normalized(1);
  old.sealedProducts[0] = { ...old.sealedProducts[0], marketPrice: 72, marketStatus: "manual", marketSource: "Admin review" };
  old.marketPrices[0] = { ...old.marketPrices[0], marketPrice: 72, price: 72, marketStatus: "manual", externalSource: "Manual", sourceUrl: "https://example.com/my-review", currency: "EUR" };
  const result = preserveLastGoodCatalog(previous(old), incoming(normalized(1, 55, checkedAt)));
  assert.equal(result.sealedProducts[0].marketPrice, 72);
  assert.equal(result.sealedProducts[0].marketStatus, "manual");
  assert.equal(result.sealedProducts[0].marketLastUpdated, oldCheck);
  assert.equal(result.marketPrices[0].marketPrice, 72);
  assert.equal(result.marketPrices[0].timestamp, oldCheck);
  assert.equal(result.marketPrices[0].externalSource, "Manual");
  assert.equal(result.marketPrices[0].sourceUrl, "https://example.com/my-review");
  assert.equal(result.marketPrices[0].currency, "EUR");
});

test("custom existing IDs remain stable and refreshed price joins follow them", () => {
  const old = normalized(1);
  old.sealedProducts[0].id = "saved-custom-catalog-id";
  old.marketPrices[0] = { ...old.marketPrices[0], id: "saved-price-id", catalogItemId: "saved-custom-catalog-id", productId: "saved-custom-catalog-id" };
  const result = preserveLastGoodCatalog(previous(old), incoming(normalized(1, 61, checkedAt)));
  assert.equal(result.sealedProducts[0].id, "saved-custom-catalog-id");
  assert.equal(result.marketPrices[0].id, "saved-price-id");
  assert.equal(result.marketPrices[0].catalogItemId, "saved-custom-catalog-id");
  assert.equal(result.marketPrices[0].productId, "saved-custom-catalog-id");
  assert.equal(result.marketPrices[0].marketPrice, 61);
});

test("duplicate provider identities never discard distinct existing record IDs", () => {
  const old = normalized(1);
  old.sealedProducts.push({ ...old.sealedProducts[0], id: "second-saved-product" });
  old.marketPrices.push({ ...old.marketPrices[0], id: "second-saved-price" });
  const result = preserveLastGoodCatalog(previous(old), incoming(normalized(1, 60, checkedAt)));
  assert.equal(result.sealedProducts.length, 2);
  assert.equal(result.marketPrices.length, 2);
  assert.ok(result.sealedProducts.some((row) => row.id === "second-saved-product"));
  assert.ok(result.marketPrices.some((row) => row.id === "second-saved-price"));
});

test("a valid market quote does not erase an omitted secondary price", () => {
  const old = normalized(1);
  const fresh = normalizeTcgCsvGroup({ results: [product(1)] }, { results: [{ productId: 1, marketPrice: 60 }] }, group, checkedAt);
  const result = preserveLastGoodCatalog(previous(old), incoming(fresh));
  assert.equal(result.sealedProducts[0].marketPrice, 60);
  assert.equal(result.sealedProducts[0].lowPrice, 40);
  assert.equal(result.marketPrices[0].highPrice, 65);
});

test("empty or unjoined provider data cannot become a usable completed group", () => {
  for (const prices of [[], [{ productId: 999, marketPrice: 50 }], [{ productId: 1, marketPrice: 0 }], [{ productId: 1, marketPrice: -1, midPrice: "bad" }]]) {
    assert.throws(() => normalizeTcgCsvGroup({ results: [product(1)] }, { results: prices }, group, checkedAt), /empty|no usable/i);
  }
  assert.throws(() => normalizeTcgCsvGroup({ results: [] }, { results: [quote(1)] }, group), /empty/i);
  assert.throws(() => normalizeTcgCsvGroup({ results: {} }, { results: [quote(1)] }, group), /malformed/i);
});

test("empty or wholly failed refreshes reject before the last-good files can be replaced", async () => {
  for (const payload of [{ results: [] }, { success: false, results: [group] }, { results: {} }]) {
    await assert.rejects(syncTcgCsvCatalog({ fetcher: async () => payload }), /no usable groups/i);
  }
  await assert.rejects(syncTcgCsvCatalog({
    fetcher: async (url) => url.endsWith("/groups") ? { results: [group] } : { results: [] },
    pause: async () => {},
    readSeedRows: async () => { throw new Error("seeds must not be read after full feed failure"); },
  }), /Every selected price group failed/i);
  assert.throws(() => preserveLastGoodCatalog(previous(normalized(1)), { syncedGroups: [], sealedProducts: [], marketPrices: [] }), /Existing catalog and prices were kept/);
});

test("offline ingestion counts successful groups only and preserves seeded manual values", async () => {
  const otherGroup = { ...group, groupId: 99 };
  const calls = [];
  const feed = await syncTcgCsvCatalog({
    fetcher: async (url) => {
      calls.push(url);
      if (url.endsWith("/groups")) return { results: [group, otherGroup] };
      if (url.includes("/99/")) throw new Error("offline fixture");
      return url.endsWith("/products") ? { results: [product(1)] } : { results: [quote(1)] };
    },
    pause: async () => {},
    now: () => checkedAt,
    readSeedRows: async () => [{ id: "manual-seed-id", externalProductId: "1", name: "Booster Bundle 1", marketValue: "90", marketPrice: "90", marketSource: "Manual", marketLastUpdated: oldCheck }],
  });
  assert.equal(calls.length, 5);
  assert.equal(feed.syncedGroups.length, 1);
  assert.equal(feed.failedGroups.length, 1);
  assert.equal(feed.sealedProducts[0].id, "manual-seed-id");
  assert.equal(feed.sealedProducts[0].marketPrice, 90);
  assert.equal(feed.sealedProducts[0].marketLastUpdated, oldCheck);
  assert.equal(buildCatalogSyncStatus({ catalog: feed }).tcgcsvGroupsSynced, 1);
});

test("preservation does not mutate input snapshots", () => {
  const old = previous(normalized(1));
  const fresh = incoming(normalized(1, 65, checkedAt));
  const before = JSON.stringify({ old, fresh });
  preserveLastGoodCatalog(old, fresh);
  assert.equal(JSON.stringify({ old, fresh }), before);
});

test("source build timestamps require explicit timezone and valid date", () => {
  assert.equal(providerBuildTimestamp("2026-10-18T20:05:40+0000\n"), "2026-10-18T20:05:40.000Z");
  for (const value of ["", "not a date", "2026-10-18", "2026-10-18T20:05:40", "2026-99-18T20:05:40Z"]) {
    assert.throws(() => providerBuildTimestamp(value), /invalid/);
  }
});

test("unchanged complete builds skip only when a valid last-good price cache exists", () => {
  const before = previous(normalized(1));
  const status = { tcgcsvBuildTimestamp: checkedAt, tcgcsvBuildComplete: true, tcgcsvCategoryId: 3, catalogProductsImported: 1, marketPricesImported: 1 };
  assert.equal(shouldSkipProviderBuild(checkedAt, status, before), true);
  assert.equal(shouldSkipProviderBuild(oldCheck, status, before), true);
  assert.equal(shouldSkipProviderBuild("2026-10-20T10:00:00Z", status, before), false);
  assert.equal(shouldSkipProviderBuild(checkedAt, {}, before), false);
  assert.equal(shouldSkipProviderBuild(checkedAt, status, {}), false);
  assert.equal(shouldSkipProviderBuild(checkedAt, status, { ...before, marketPrices: [] }), false);
  assert.equal(shouldSkipProviderBuild(checkedAt, { ...status, marketPricesImported: 2 }, before), false);
  assert.equal(shouldSkipProviderBuild(checkedAt, status, before, 1), false);
});

test("partial group failures and limited pulls never mark a new provider build complete", () => {
  const full = { ...incoming(normalized(1)), groups: [group] };
  const prior = { tcgcsvBuildTimestamp: oldCheck, tcgcsvBuildComplete: true };
  assert.deepEqual(providerCheckpoint(checkedAt, full, prior), {
    tcgcsvBuildTimestamp: checkedAt, tcgcsvLatestAvailableBuildTimestamp: checkedAt, tcgcsvBuildComplete: true,
  });
  for (const [catalog, completeScope] of [
    [{ ...full, failedGroups: [{ groupId: 99 }] }, true],
    [{ ...full, groups: [group, { groupId: 99 }] }, true],
    [full, false],
  ]) {
    const checkpoint = providerCheckpoint(checkedAt, catalog, prior, completeScope);
    assert.equal(checkpoint.tcgcsvBuildTimestamp, oldCheck);
    assert.equal(checkpoint.tcgcsvBuildComplete, false);
    assert.equal(shouldSkipProviderBuild(checkedAt, { ...checkpoint, tcgcsvCategoryId: 3 }, previous(normalized(1))), false);
  }
});

test("incomplete group/product envelopes cannot silently become successful build checkpoints", async () => {
  await assert.rejects(syncTcgCsvCatalog({ fetcher: async () => ({ totalItems: 2, results: [group] }) }), /incomplete/);
  await assert.rejects(syncTcgCsvCatalog({ fetcher: async () => ({ results: [group, group] }) }), /incomplete/);
  assert.throws(() => normalizeTcgCsvGroup({ totalItems: 2, results: [product(1)] }, { results: [quote(1)] }, group), /incomplete/);
  assert.throws(() => normalizeTcgCsvGroup({ results: [product(1), product(1)] }, { results: [quote(1)] }, group), /incomplete/);
});

test("older or unknown incoming observation dates cannot replace the latest valid quote", () => {
  for (const time of [oldCheck, ""]) {
    const old = normalized(1, 75, checkedAt);
    const stale = normalized(1, 50, time);
    const result = preserveLastGoodCatalog(previous(old), incoming(stale));
    assert.equal(result.sealedProducts[0].marketPrice, 75);
    assert.equal(result.sealedProducts[0].priceCheckedAt, checkedAt);
    assert.equal(result.marketPrices[0].marketPrice, 75);
    assert.equal(result.marketPrices[0].timestamp, checkedAt);
  }
});

test("provider USD updates do not relabel an existing EUR catalog valuation", () => {
  const old = normalized(1, 75, oldCheck);
  old.sealedProducts[0] = { ...old.sealedProducts[0], currency: "EUR", marketCurrency: "EUR", marketSource: "Cardmarket" };
  old.marketPrices[0] = { ...old.marketPrices[0], currency: "EUR", source: "Cardmarket", externalSource: "Cardmarket" };
  const result = preserveLastGoodCatalog(previous(old), incoming(normalized(1, 60, checkedAt)));
  assert.equal(result.sealedProducts[0].marketPrice, 75);
  assert.equal(result.sealedProducts[0].marketCurrency, "EUR");
  assert.equal(result.sealedProducts[0].marketSource, "Cardmarket");
  const eur = result.marketPrices.find((row) => row.currency === "EUR");
  const usd = result.marketPrices.find((row) => row.currency === "USD");
  assert.equal(eur.id, old.marketPrices[0].id);
  assert.equal(eur.marketPrice, 75);
  assert.equal(usd.marketPrice, 60);
  assert.notEqual(usd.id, eur.id);
  assert.equal(usd.catalogItemId, eur.catalogItemId);
});
