import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadInitialRouteState } from "../src/utils/appRouteState.js";
import { readMarketSearchRoute, writeMarketSearchRoute } from "../src/utils/marketRouteState.mjs";
import { collectionItemKnownValue, summarizeCollectionPortfolio } from "../src/utils/collectionValueCoverage.mjs";
import { safeExternalWebUrl } from "../src/utils/externalLink.mjs";

test("shared Market links replace stale saved queries and unrelated saved filters", () => {
  const state = loadInitialRouteState({ location: { pathname: "/exchange/market", search: "?q=Charizard+004%2F102" }, localStorage: { getItem: () => JSON.stringify({ catalogSearch: "old", catalogKindFilter: "sealed", catalogSetFilter: "wrong set" }) } });
  assert.equal(state.catalogSearch, "Charizard 004/102");
  assert.equal(state.submittedCatalogSearch, state.catalogSearch);
  assert.equal(state.catalogKindFilter, "All");
  assert.equal(state.catalogSetFilter, "All");
});
test("an empty Market URL clears a previous search rather than silently replaying it", () => {
  const state = readMarketSearchRoute("");
  assert.equal(state.catalogSearch, "");
  assert.equal(state.submittedCatalogSearch, "");
  assert.equal(state.catalogTypeFilter, "All");
});
test("Market query, supported filters and leading-zero UPC round-trip without losing unrelated parameters", () => {
  const state = readMarketSearchRoute("?q=009999999999&marketKind=sealed&marketSet=SV%3A+151&marketType=Booster+Bundle&marketData=Has+image");
  const params = writeMarketSearchRoute(new URLSearchParams("betaLocalMode=true&keep=yes"), state, true);
  assert.equal(params.get("keep"), "yes");
  assert.equal(params.get("betaLocalMode"), "true");
  assert.deepEqual(readMarketSearchRoute(params.toString()), state);
  writeMarketSearchRoute(params, state, false);
  assert.equal(params.has("q"), false);
  assert.equal(params.has("marketSet"), false);
  assert.equal(params.get("keep"), "yes");
});
test("invalid Market enums fall back safely and oversized text is bounded", () => {
  const state = readMarketSearchRoute(`?q=${"x".repeat(250)}&marketKind=invalid&marketData=invalid`);
  assert.equal(state.catalogSearch.length, 140);
  assert.equal(state.catalogKindFilter, "All");
  assert.equal(state.catalogDataFilter, "All");
});
test("wishlist budgets never affect owned value or owned type shares", () => {
  const card = { quantity: 3, marketPrice: 12 };
  const sealed = { quantity: 2, targetPrice: 500 };
  const summary = summarizeCollectionPortfolio({ owned: [card, sealed], cards: [card], sealed: [sealed], wishlist: [{ quantity: 10, marketPrice: 1000 }] });
  assert.equal(summary.ownedQuantity, 5);
  assert.equal(summary.pricedQuantity, 3);
  assert.equal(summary.unpricedQuantity, 2);
  assert.equal(summary.totalKnownValue, 36);
  assert.equal(summary.wantedQuantity, 10);
  assert.equal(summary.groups[0].value, 36);
  assert.equal(summary.groups[1].value, 0);
});
test("listed copies are an owned subset, with explicit zero quantity preserved", () => {
  const summary = summarizeCollectionPortfolio({ owned: [{ quantity: 4, status: "listed", marketPrice: 2 }, { quantity: 0, status: "listed", marketPrice: 50 }] });
  assert.equal(summary.ownedQuantity, 4);
  assert.equal(summary.listedQuantity, 4);
  assert.equal(summary.totalKnownValue, 8);
  assert.equal(summary.unpricedQuantity, 0);
});
test("known manual values are supported while malformed, missing and target-only values remain unknown", () => {
  assert.equal(collectionItemKnownValue({ manualValue: 15, quantity: 2 }), 30);
  assert.equal(collectionItemKnownValue({ quantity: 0, manualValue: 15 }), 0);
  assert.equal(collectionItemKnownValue({ targetPrice: 40, quantity: 3 }), 0);
  assert.equal(collectionItemKnownValue({ marketPrice: "bad", quantity: 2 }), 0);
});
test("coverage reuses strict portfolio valuation, including explicit zero and repository estimates", () => {
  const summary = summarizeCollectionPortfolio({ owned: [{ quantity: 2, marketPrice: 0 }, { _recordOrigin: "repository", quantity: 3, projectedResaleMid: 2 }, { quantity: 1, marketPrice: "$100" }] });
  assert.equal(summary.pricedQuantity, 5);
  assert.equal(summary.unpricedQuantity, 1);
  assert.equal(summary.totalKnownValue, 6);
});
test("external destinations reject executable, relative, credential-bearing and malformed URLs", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,hi", "vbscript:msgbox(1)", "//evil.test", "/internal", "https://user:secret@example.com", "https://example.com\\@evil.test", "https://example.com\n.bad.test"]) assert.equal(safeExternalWebUrl(url), "", url);
  assert.equal(safeExternalWebUrl(" https://example.com/item?q=cards "), "https://example.com/item?q=cards");
  assert.equal(safeExternalWebUrl("http://example.com/item"), "http://example.com/item");
});

const directory = resolve("artifacts/qa/catalog-search-100");
await mkdir(directory, { recursive: true });
const output = resolve(directory, "presentation-components-test.mjs");
await build({ stdin: { resolveDir: resolve("."), contents: `export {default as ExternalWebLink} from './src/components/ExternalWebLink.jsx'; export {default as MarketHistoryTable} from './src/components/MarketHistoryTable.jsx'; export {default as CollectionValueCoverage} from './src/components/CollectionValueCoverage.jsx';` }, bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic", loader: { ".css": "empty" }, outfile: output });
const { ExternalWebLink, MarketHistoryTable, CollectionValueCoverage } = await import(pathToFileURL(output).href);
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
test("external-link rendering keeps rejected URLs inert and names the valid destination", () => {
  assert.doesNotMatch(render(ExternalWebLink, { href: "javascript:alert(1)", children: "Source" }), /<a|href=/);
  const valid = render(ExternalWebLink, { href: "https://example.com/cards", children: "Source" });
  assert.match(valid, /noopener noreferrer/);
  assert.match(valid, /at example.com \(opens a new tab\)/);
});
test("price history exposes semantic headers, actual values and explicit missing data", () => {
  const html = render(MarketHistoryTable, { productName: "Example", money: value => `$${value.toFixed(2)}`, points: [{ date: "2026-10-24T12:00:00Z", marketPrice: 12.5, midPrice: 13, lowPrice: 0, highPrice: null, condition: "Near mint" }] });
  assert.match(html, /scope="col">Market/);
  assert.match(html, /scope="row"><time/);
  assert.match(html, /\$12\.50/);
  assert.match(html, /Near mint/);
  assert.match(html, /Not supplied/);
  assert.doesNotMatch(html, /\$0\.00/);
});
test("collection table states coverage, wishlist exclusion and once-only listed quantities", () => {
  const html = render(CollectionValueCoverage, { summary: summarizeCollectionPortfolio({ owned: [{ quantity: 2, status: "listed" }, { quantity: 3, marketPrice: 4 }], wishlist: [{ quantity: 7 }] }), money: value => `$${value}` });
  assert.match(html, /3 of 5 owned copies have a value/);
  assert.match(html, /2 listed copies are included/);
  assert.match(html, /7 wanted copies are tracked separately/);
  assert.match(html, /scope="row">Total owned/);
  assert.match(html, /\$12/);
});
