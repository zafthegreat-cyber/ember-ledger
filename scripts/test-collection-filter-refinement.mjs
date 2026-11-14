import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";

const bundle = await build({ entryPoints: ["src/components/CollectionPortfolio.jsx"], bundle: true, platform: "node", format: "cjs", write: false, jsx: "automatic", loader: { ".css": "empty" }, external: ["react", "react/jsx-runtime"], define: { "import.meta.env": "{}" }, logLevel: "silent" });
const compiled = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
const Portfolio = compiled.exports.default;
const records = Object.freeze([
  Object.freeze({ id: "sealed", catalogProductId: "sealed-pokemon", name: "151 Poster Collection", tcgGame: "pokemon", condition: "Sealed", quantity: 2, marketPrice: 81.05, ownedItemPurpose: "PERSONAL_COLLECTION" }),
  Object.freeze({ id: "card", catalogProductId: "single-pokemon", name: "Pikachu", tcgGame: "pokemon", condition: "Near Mint", quantity: 1, marketPrice: 10, ownedItemPurpose: "PERSONAL_COLLECTION" }),
  Object.freeze({ id: "digimon", catalogProductId: "sealed-digimon", name: "Digimon Starter Deck", tcgGame: "digimon", condition: "Sealed", quantity: 1, marketPrice: 20, ownedItemPurpose: "PERSONAL_COLLECTION" }),
]);

async function environment(run) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/", pretendToBeVisual: true });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  try { await run(root); } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
}

function Harness({ items = records, initialQuery = "", initialCondition = "", initialGame = "all", onOpenFilters, onAddItem }) {
  const [query, setQuery] = useState(initialQuery);
  const [condition, setCondition] = useState(initialCondition);
  const [game, setGame] = useState(initialGame);
  const [view, setView] = useState({ section: "overview", period: "max", hidden: false, display: "grid", sort: "name" });
  const visibleItems = items.filter(item => (!query || item.name.toLowerCase().includes(query.toLowerCase())) && (!condition || item.condition === condition) && (game === "all" || item.tcgGame === game));
  return React.createElement(Portfolio, { items, visibleItems, query, onQueryChange: setQuery, conditionFilter: condition, gameFiltered: game !== "all", onOpenFilters, onAddItem, onClearFilters: () => { setQuery(""); setCondition(""); setGame("all"); }, preferenceScope: "refine-filter-fixture", features: { value: true }, viewState: view, onViewStateChange: setView });
}
const button = label => [...document.querySelectorAll("button")].find(node => (node.getAttribute("aria-label") || node.textContent.trim()) === label);
const click = async label => { assert.ok(button(label), label); await act(async () => button(label).click()); };
const resultText = () => document.querySelector('.collection-portfolio-section-title [role="status"]').textContent;

test("clearing search retains condition and game filters, returns focus, and preserves all values", async () => environment(async root => {
  const before = JSON.stringify(records); let opened = 0;
  await act(async () => root.render(React.createElement(Harness, { initialQuery: "no match", initialCondition: "Sealed", initialGame: "pokemon", onOpenFilters: () => opened++ })));
  assert.equal(resultText(), "0 of 3 products shown");
  assert.match(document.querySelector('.collection-portfolio-empty').textContent, /3 products are saved in Main/);
  assert.ok(button("Change condition filter: Sealed"));
  assert.ok(button("Filters, condition: Sealed"));
  const totalBefore = document.querySelector('[data-testid="portfolio-total"]').textContent;
  assert.equal(totalBefore, "$192.10");
  await click("Clear collection search");
  assert.equal(document.activeElement.type, "search");
  assert.equal(document.activeElement.value, "");
  assert.equal(button("Clear collection search"), undefined);
  assert.equal(resultText(), "1 of 3 products shown");
  assert.equal(document.querySelectorAll('.collection-portfolio-item').length, 1);
  assert.ok(button("Change condition filter: Sealed"));
  await click("Change condition filter: Sealed");
  assert.equal(opened, 1);
  await click("Clear all");
  assert.equal(resultText(), "3 products shown");
  assert.equal(document.activeElement.type, "search");
  assert.equal(document.querySelector('.collection-portfolio-active-filters'), null);
  assert.equal(document.querySelectorAll('.collection-portfolio-item').length, 3);
  assert.equal(document.querySelector('[data-testid="portfolio-total"]').textContent, totalBefore);
  assert.equal(JSON.stringify(records), before);
  assert.equal(localStorage.length, 0, "filter changes must not write collection records or settings");
}));

test("empty portfolio offers adding an item instead of promising hidden results", async () => environment(async root => {
  let additions = 0;
  await act(async () => root.render(React.createElement(Harness, { items: [], initialQuery: "poster", initialCondition: "Sealed", onAddItem: () => additions++ })));
  const empty = document.querySelector('.collection-portfolio-empty');
  assert.match(empty.textContent, /This portfolio is ready for your items/);
  assert.doesNotMatch(empty.textContent, /clear the filters to see them/);
  assert.ok(button("Clear all"), "filters still have a clear control in the toolbar");
  assert.equal(button("Clear search & filters"), undefined);
  await click("Add item");
  assert.equal(additions, 1);
  assert.equal(localStorage.length, 0);
}));
