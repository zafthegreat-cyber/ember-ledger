import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiled = await build({ entryPoints: [path.join(root, "src/pages/Market.jsx")], bundle: true, platform: "node", format: "cjs", write: false, jsx: "automatic", loader: { ".css": "empty" }, external: ["react", "react/jsx-runtime"], logLevel: "silent", plugins: [{ name: "unrelated-market-decoration", setup(api) {
  api.onLoad({ filter: /ItemPhoto\.jsx$/ }, () => ({ contents: "export default function Photo(){return null}", loader: "jsx" }));
  api.onResolve({ filter: /command-system$/ }, () => ({ path: "commands", namespace: "fixture" }));
  api.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: 'import React from "react"; export function CommandBoardV4({children}){return React.createElement("div",null,children)}; export function CommandMetricGrid(){return null}', loader: "jsx" }));
} }] });
const require = createRequire(import.meta.url);
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(require, module, module.exports);
const MarketPage = module.exports.default;
const noop = () => {};
const props = {
  catalogImage: () => "", catalogSearch: "", catalogSearchHasRun: false, catalogTitle: product => product.name, destinationDefaults: value => value,
  getTideTradrMarketInfo: () => ({}), money: value => `$${Number(value).toFixed(2)}`, openBeaconCenter: noop, openCatalogDetails: noop, openCompassSearch: noop,
  openDealFinderModal: noop, openExchangeSection: noop, openMarketProductAddFlow: noop, openProductAddFlow: noop, phase2RecentDeals: [], setCatalogSearch: noop,
  setTideTradrSubTab: noop, submitCatalogSearch: noop, supabaseCatalogStatus: {}, tideTradrCatalogResults: [], applyCatalogProductToDeal: noop, workspaceWatchlist: [],
};
const render = overrides => renderToStaticMarkup(React.createElement(MarketPage, { ...props, ...overrides }));
const empty = render({});
assert.match(empty, /Choose a product to compare price sources/);
assert.match(empty, /Demand unknown/);
assert.doesNotMatch(empty, /Low \$42|Fair \$58|High \$75|Current context: \$61|Medium demand|62%/);
const msrpOnly = Object.freeze({ id: "msrp-only", name: "Retail reference only", msrp: 987.65, price: 876.54 });
const noMarket = render({ catalogSearchHasRun: true, tideTradrCatalogResults: [msrpOnly] });
assert.match(noMarket, /Value unknown/);
assert.doesNotMatch(noMarket, /\$987\.65|\$876\.54/);
const market = Object.freeze({ id: "market", name: "Saved market estimate", marketPrice: 37.25, currency: "USD", msrp: 99 });
const priced = render({ catalogSearchHasRun: true, tideTradrCatalogResults: [market] });
assert.match(priced, /USD\s*37\.25/);
assert.match(priced, /Demand unknown/);
assert.doesNotMatch(priced, /Medium demand|(?:\$|USD\s*)99\.00/);
const currencyUnknown = render({ catalogSearchHasRun: true, tideTradrCatalogResults: [{ ...market, currency: "" }] });
assert.match(currencyUnknown, /Currency not supplied/);
assert.doesNotMatch(currencyUnknown, /(?:\$|USD\s*)37\.25/, "A quote without a currency must not be relabeled as US dollars");
assert.match(render({ catalogSearchHasRun: true, tideTradrCatalogResults: [{ id: "invalid", name: "Invalid estimate", marketPrice: Infinity }] }), /Value unknown/);
console.log("Market page price-truth checks passed: no invented ranges or demand; MSRP and asking prices are not market values.");
