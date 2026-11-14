import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";

const result = await build({
  stdin: { contents: 'export { default as Portfolio } from "./src/components/CollectionPortfolio.jsx";', resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "cjs", write: false, jsx: "automatic",
  loader: { ".css": "empty" }, external: ["react", "react/jsx-runtime"],
  define: { "import.meta.env": "{}" }, logLevel: "silent",
});
const compiled = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
const { Portfolio } = compiled.exports;

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
const product = Object.freeze({
  name: "151 Poster Collection", tcgGame: "pokemon", setName: "Pokemon", productClassification: "Sealed product",
  catalogProductId: "pokemon-sealed-151-poster", tcgplayerProductId: "502005", language: "English", quantity: 1, marketPrice: 81.05,
});
const records = Object.freeze([
  Object.freeze({ ...product, id: "pc", _recordOrigin: "repository", ownedItemPurpose: "PERSONAL_COLLECTION", purchaseDate: "2026-10-01", allocatedItemCost: 15 }),
  Object.freeze({ ...product, id: "hold", _recordOrigin: "legacy", ownedItemPurpose: "HOLD", purchaseDate: "2026-10-12", actualPurchasePrice: 20 }),
]);
function Harness(props) {
  const [view, setView] = useState({ section: "overview", period: "max", hidden: false, display: "grid", sort: "name" });
  return React.createElement(Portfolio, {
    items: records, visibleItems: records, query: "", preferenceScope: "ui-scrub-fixture",
    features: { history: true, value: true }, viewState: view, onViewStateChange: setView, ...props,
  });
}
const button = label => [...document.querySelectorAll("button")].find(node => (node.getAttribute("aria-label") || node.textContent.trim()) === label);
const click = async label => { assert.ok(button(label), label + " is available"); await act(async () => button(label).click()); };

test("browsing retains exact copy details and prices, with non-repeating metadata and original callbacks", async () => environment(async root => {
  const before = JSON.stringify(records); let selected;
  await act(async () => root.render(React.createElement(Harness, { onOpenGroup: group => { selected = group; } })));
  assert.equal(document.querySelectorAll(".collection-portfolio-item").length, 1);
  assert.match(document.querySelector(".collection-portfolio-item-holdings").textContent, /Qty 2PC · 1Hold · 1/);
  assert.equal(document.querySelector(".collection-portfolio-item-meta").textContent, "Pokémon · Sealed product · English");
  assert.match(document.querySelector(".collection-portfolio-item-value").textContent, /\$162\.10/);
  assert.match(document.querySelector(".collection-portfolio-estimate-note").textContent, /2 of 2 purchase records/);
  assert.match(document.querySelector(".collection-portfolio-item").getAttribute("aria-label"), /Open 151 Poster Collection, quantity 2, Personal collection: 1, Hold: 1/);
  await act(async () => document.querySelector(".collection-portfolio-item").click());
  assert.equal(selected.records[0], records[0]);
  assert.equal(selected.records[1], records[1]);
  assert.equal(JSON.stringify(records), before);
  assert.equal(localStorage.length, 0, "browsing and opening do not write records or settings");
}));

test("overview keeps tools available and Performance keeps all snapshot controls", async () => environment(async root => {
  await act(async () => root.render(React.createElement(Harness)));
  assert.equal(document.querySelector(".collection-portfolio-history"), null);
  const tools = document.querySelector(".collection-portfolio-tools");
  assert.ok(tools.querySelector('[aria-describedby="portfolio-export-disclosure"]'));
  assert.match(tools.querySelector("#portfolio-export-disclosure").textContent, /CSV/i);
  await act(async () => tools.querySelector("summary").click());
  assert.equal(tools.open, true);
  await click("Performance");
  assert.ok(document.querySelector('[aria-label="Portfolio value history"]'));
  assert.equal(document.querySelectorAll(".collection-portfolio-periods button").length, 6);
  assert.equal(button("Save value snapshot").disabled, false);
  await click("Hide values");
  assert.equal(button("Save value snapshot").disabled, true);
  assert.doesNotMatch(document.querySelector(".collection-portfolio-value").textContent, /\$162/);
  await click("Overview");
  assert.ok(document.querySelector(".collection-portfolio-grid"));
  assert.equal(localStorage.length, 0, "changing the view does not rewrite stored collection data");
}));

test("accounts without history keep valuable items and exports without opening gated performance", async () => environment(async root => {
  let locked;
  await act(async () => root.render(React.createElement(Harness, { features: { value: true, history: false }, onLockedFeature: key => { locked = key; } })));
  assert.ok(document.querySelector(".collection-portfolio-highlights"));
  assert.ok(button("Export whole portfolio"));
  await click("Performance");
  assert.equal(locked, "price_history");
  assert.equal(document.querySelector(".collection-portfolio-history"), null);
  assert.ok(document.querySelector(".collection-portfolio-grid"));
}));
