import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";

const result = await build({ stdin: { contents: 'export { default as CollectionSets } from "./src/components/CollectionSets.jsx";export { CollectionSetGrid, SetArtwork } from "./src/components/CollectionSetsViews.jsx";', resolveDir: process.cwd() }, bundle: true, platform: "node", format: "cjs", write: false, jsx: "automatic", loader: { ".css": "empty" }, external: ["react", "react/jsx-runtime", "virtual:code3-set-catalog"], define: { "import.meta.env": "{}" }, logLevel: "silent" });
const compiled = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
const { CollectionSets, CollectionSetGrid, SetArtwork } = compiled.exports;

async function environment(run) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/" });
  const before = new Map();
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    before.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  }
  const { createRoot } = await import("react-dom/client"); const root = createRoot(document.getElementById("root"));
  try { await run(root); }
  finally { await act(async () => root.unmount()); dom.window.close(); for (const [name, descriptor] of before) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
}
const row = (patch = {}) => Object.freeze({ id: "qa-set", key: "pokemon:battle academy 2022", name: "Battle Academy 2022", gameName: "Pokémon", gameId: "pokemon", series: "", itemCount: 0, uniqueCardCount: 0, totalCards: null, totalValue: 0, knownValueCount: 0, progressPercent: null, languages: [], ownedItems: [], ...patch });
const render = (root, component, props) => act(async () => root.render(React.createElement(component, props)));

test("uncollected sets show one title and no false zero value or repeated unavailable checklist", async () => environment(async root => {
  const rows = Object.freeze([row(), row({ id: "qa-other", name: "Assorted" })]); const before = JSON.stringify(rows);
  await render(root, CollectionSetGrid, { rows, showValues: true });
  assert.equal(document.querySelectorAll(".collection-sets-card-name").length, 2);
  assert.equal(document.querySelectorAll(".collection-sets-artwork-fallback strong").length, 0);
  assert.equal(document.querySelectorAll(".collection-sets-card-series").length, 0, "one game is not repeated on every card");
  assert.equal(document.querySelectorAll(".collection-sets-value").length, 0);
  assert.match(document.body.textContent, /Not collected/);
  assert.doesNotMatch(document.body.textContent, /0 unique cards|Checklist unavailable|Value hidden|\$0\.00/);
  assert.equal(JSON.stringify(rows), before);
}));

test("saved counts, partial price coverage and explicit zero estimates remain honest", async () => environment(async root => {
  const rows = [row({ id: "owned", itemCount: 3, uniqueCardCount: 2, sealedQuantity: 4, knownValueCount: 1, totalValue: 70.3 }), row({ id: "unknown", itemCount: 1, totalValue: null }), row({ id: "zero", itemCount: 1, knownValueCount: 1, totalValue: 0 })];
  await render(root, CollectionSetGrid, { rows });
  const cards = [...document.querySelectorAll(".collection-sets-card")];
  assert.match(cards[0].textContent, /2 unique cards · 4 sealed/); assert.match(cards[0].textContent, /\$70\.30/); assert.match(cards[0].textContent, /1 of 3 records valued/);
  assert.match(cards[1].textContent, /Estimate not recorded/); assert.doesNotMatch(cards[1].textContent, /\$0\.00/);
  assert.match(cards[2].textContent, /\$0\.00/);
  await render(root, CollectionSetGrid, { rows, showValues: false });
  assert.equal(document.querySelectorAll(".collection-sets-value, .collection-sets-value-coverage").length, 0);
  assert.doesNotMatch(document.body.textContent, /\$70\.30|Value hidden/);
}));

test("official totals retain progress, mixed languages withhold completion and uncertain cards stay flagged", async () => environment(async root => {
  await render(root, CollectionSetGrid, { rows: [row({ totalCards: 10, uniqueCardCount: 3, itemCount: 3, progressPercent: 30 })] });
  assert.match(document.body.textContent, /3 \/ 10 unique cards/); assert.equal(document.querySelector("progress").value, 30);
  await render(root, CollectionSetGrid, { rows: [row({ totalCards: 10, uniqueCardCount: 2, itemCount: 3, languageProgressAvailable: false, unknownCardIdentityCount: 1 })] });
  assert.match(document.body.textContent, /2 card identities · Card details incomplete/); assert.equal(document.querySelector("progress"), null);
}));

test("mixed-game names stay disambiguated and opening passes the original row", async () => environment(async root => {
  const original = row(); let opened;
  await render(root, CollectionSetGrid, { rows: [original, row({ id: "other", gameName: "Magic", gameId: "magic" })], onOpen: value => { opened = value; } });
  const buttons = [...document.querySelectorAll("button")];
  assert.equal(buttons[0].getAttribute("aria-label"), "Open Battle Academy 2022 (Pokémon)");
  assert.equal(document.querySelectorAll(".collection-sets-card-series").length, 2);
  await act(async () => buttons[0].click()); assert.equal(opened, original);
}));

test("artwork failures try the explicit symbol then a named accessible fallback", async () => environment(async root => {
  await render(root, SetArtwork, { row: row({ logoUrl: "/broken-logo.png", symbolUrl: "/symbol.png" }) });
  await act(async () => document.querySelector("img").dispatchEvent(new window.Event("error")));
  assert.equal(document.querySelector("img").getAttribute("src"), "/symbol.png");
  await act(async () => document.querySelector("img").dispatchEvent(new window.Event("error")));
  assert.equal(document.querySelector("img"), null);
  assert.equal(document.querySelector('[role="img"]').getAttribute("aria-label"), "Set artwork unavailable for Battle Academy 2022");
  await render(root, SetArtwork, { row: row({ logoUrl: "/new-matching-logo.png" }) });
  assert.equal(document.querySelector("img").getAttribute("src"), "/new-matching-logo.png");
}));

test("privacy is explained once, search and scope keep their existing actions", async () => environment(async root => {
  const rows = [row(), row({ id: "owned", name: "Aquapolis", itemCount: 1 })]; let patch;
  const viewState = { query: "", scope: "all", sort: "name", language: "all", selectedId: "", game: "all", limit: 24 };
  const props = { rows, viewState, showValues: false, onViewStateChange: fn => { patch = fn(viewState); } };
  await render(root, CollectionSets, props);
  assert.equal(document.querySelectorAll(".collection-sets-privacy").length, 1);
  assert.match(document.querySelector('[role="status"]').textContent, /2 sets to explore/);
  await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === "Your sets").click());
  assert.equal(patch.scope, "owned"); assert.equal(patch.limit, 24);
  await render(root, CollectionSets, { ...props, viewState: { ...viewState, query: "Aquapolis" } });
  assert.equal(document.querySelectorAll(".collection-sets-card").length, 1);
  await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === "Clear search").click());
  assert.equal(patch.query, "");
}));
