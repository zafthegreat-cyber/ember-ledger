import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiled = transformSync(readFileSync(path.join(root, "src/pages/Market.jsx"), "utf8"), { loader: "jsx", format: "cjs", jsx: "automatic" });
const require = createRequire(import.meta.url);
const presentationRequire = id => id.endsWith("PrivateReceipt.jsx") ? { PrivateStorageImage: () => null }
  : id.endsWith("command-system") ? { CommandBoardV4: ({ children }) => React.createElement("div", null, children), CommandMetricGrid: () => null } : require(id);
const module = { exports: {} };
new Function("require", "module", "exports", compiled.code)(presentationRequire, module, module.exports);
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
const market = Object.freeze({ id: "market", name: "Saved market estimate", marketPrice: 37.25, msrp: 99 });
const priced = render({ catalogSearchHasRun: true, tideTradrCatalogResults: [market] });
assert.match(priced, /\$37\.25/);
assert.match(priced, /Demand unknown/);
assert.doesNotMatch(priced, /Medium demand|\$99\.00/);
assert.match(render({ catalogSearchHasRun: true, tideTradrCatalogResults: [{ id: "invalid", name: "Invalid estimate", marketPrice: Infinity }] }), /Value unknown/);
console.log("Market page price-truth checks passed: no invented ranges or demand; MSRP and asking prices are not market values.");
