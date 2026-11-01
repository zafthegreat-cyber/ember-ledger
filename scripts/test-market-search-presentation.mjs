import assert from "node:assert/strict";
import { test } from "node:test";
import { buildManualMarketDraft, formatMarketQuoteValue, getMarketQuoteContext, getMarketResultMatchLabel } from "../src/utils/marketSearchPresentation.mjs";

test("match labels separate name, collector identity and nearby catalog suggestions", () => {
  const card = { name: "Charizard", cardNumber: "004/102", setName: "Base Set" };
  assert.equal(getMarketResultMatchLabel("Charizard 4/102", card), "Name and collector number match");
  assert.equal(getMarketResultMatchLabel("4/102", card), "Collector number match");
  assert.equal(getMarketResultMatchLabel("Fighting Energy 4/102", card), "Catalog suggestion");
  assert.equal(getMarketResultMatchLabel("Charizard", card), "Name match");
  assert.equal(getMarketResultMatchLabel("Charizard", { name: "Charizard Collection Box" }), "Catalog suggestion");
});

test("manual drafts preserve leading-zero barcodes and explicitly labeled SKUs", () => {
  assert.deepEqual(buildManualMarketDraft("  001234567890  "), { itemName: "001234567890", catalogSearchQuery: "001234567890", upcSku: "001234567890" });
  assert.equal(buildManualMarketDraft("SKU: BB-1234").upcSku, "BB-1234");
  assert.equal(buildManualMarketDraft("Charizard 4/102").upcSku, "");
  assert.equal(buildManualMarketDraft("Charizard 4/102").itemName, "Charizard 4/102");
});

test("manual fallback creates neither a catalog match nor a fabricated price", () => {
  const draft = buildManualMarketDraft("Unknown card");
  assert.equal("catalogProductId" in draft, false);
  assert.equal("marketPrice" in draft, false);
  assert.equal(buildManualMarketDraft("hello\nworld").itemName, "helloworld");
});

test("price context uses supplied source, timestamp, currency and copy attributes", () => {
  assert.deepEqual(getMarketQuoteContext({ marketCurrency: "usd", condition: "LP", variant: "Reverse holo" }, { sourceName: "Cached catalog", marketDataUpdatedAt: "2026-10-20T12:00:00Z" }), {
    source: "Cached catalog", asOf: "2026-10-20T12:00:00.000Z", currency: "USD", condition: "LP", printing: "Reverse holo",
  });
});

test("unknown price metadata stays unknown without inventing today's date or a currency", () => {
  const context = getMarketQuoteContext({ lastPriceChecked: "not a date", currency: "US DOLLARS" });
  assert.equal(context.asOf, "");
  assert.equal(context.currency, "");
  assert.equal(context.source, "Source not supplied");
});

test("quote amounts retain their supplied currency and unknown currency never receives a dollar sign", () => {
  assert.match(formatMarketQuoteValue({ marketPrice: 12, currency: "EUR" }), /EUR/);
  assert.match(formatMarketQuoteValue({ marketPrice: 12, currency: "USD" }), /USD/);
  assert.doesNotMatch(formatMarketQuoteValue({ marketPrice: 12 }), /[$€£]|USD/);
  assert.equal(formatMarketQuoteValue({ marketPrice: 12 }, { currentMarketValue: 0 }), "Value unknown");
});
