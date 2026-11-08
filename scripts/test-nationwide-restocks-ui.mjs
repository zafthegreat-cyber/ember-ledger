import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

async function component(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, platform: "node", format: "cjs", write: false, outdir: "out", loader: { ".css": "empty" }, external: ["react", "react-dom", "react/jsx-runtime"], jsx: "automatic", define: { "import.meta.env": "{}" }, logLevel: "silent", plugins: [{ name: "fixture-asset-urls", setup(api) {
    api.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: "fixture-asset" }));
    api.onLoad({ filter: /.*/, namespace: "fixture-asset" }, () => ({ contents: 'export default "/fixture-directory.json"', loader: "js" }));
  } }] });
  const module = { exports: {} };
  const code = result.outputFiles.find(file => file.path.endsWith(".js")).text;
  new Function("require", "module", "exports", code)(createRequire(import.meta.url), module, module.exports);
  return module.exports.default;
}

test("actual Restocks screen switches nationwide and opens a correctly scoped store suggestion", async () => {
  const dom = new JSDOM('<html><body><main id="root"></main></body></html>', { url: "https://fixture.invalid/" });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let root;
  try {
    const Scout = await component("src/pages/Scout.jsx");
    let selected;
    root = createRoot(document.getElementById("root"));
    await act(async () => { root.render(React.createElement(Scout, { storeDirectoryState: "CA", onStoreDirectoryStateChange: code => { selected = code; } })); });
    let picker = document.querySelector('select[aria-label="Restocks state"]');
    assert.ok(picker);
    assert.equal(picker.options.length, 51);
    assert.equal(picker.value, "CA");
    assert.match(document.body.textContent, /No reports in California yet/);
    assert.doesNotMatch(document.body.textContent, /Could not load|Failed to load/);
    await act(async () => { picker.value = "TX"; picker.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.equal(selected, "TX");
    assert.equal(document.querySelector('select[aria-label="Restocks state"]').value, "TX");
    const suggest = [...document.querySelectorAll("button")].find(button => button.textContent === "Suggest a store");
    assert.ok(suggest);
    await act(async () => { suggest.click(); });
    const dialog = document.querySelector('[aria-label="Submit Missing Store"]');
    assert.ok(dialog);
    assert.equal(dialog.querySelector('select[aria-label="State"]').value, "Texas");
    assert.equal(dialog.querySelector('select[aria-label="State"]').options.length, 52);
    assert.match(dialog.textContent, /until approved/);
    const original = { id: "nationwide-private-report", userId: "local-beta-scout", state: "CA", city: "Richmond", region: "", storeName: "Synthetic manual store", stockStatus: "no_stock", observedAt: "2026-10-01T12:00:00Z", createdAt: new Date().toISOString(), visibility: "private_from_map", price: 81.05 };
    const otherReport = { id: "nationwide-va-report", storeId: "nationwide-store-va", state: "VA", city: "Norfolk", storeName: "Virginia fixture", stockStatus: "in_stock", observedAt: new Date().toISOString(), visibility: "private_from_map", userId: "local-beta-scout" };
    localStorage.setItem("et-tcg-beta-scout", JSON.stringify({ reports: [original, otherReport], stores: [{ id: "nationwide-store-ca", name: "Synthetic Richmond shop", state: "CA", city: "Richmond", region: "East Bay", active: true, latitude: 37.9358, longitude: -122.3477 }, { id: "nationwide-store-va", name: "Virginia fixture", state: "VA", city: "Norfolk", region: "Hampton Roads / 757", active: true, favorite: true, watched: true, latitude: 36.85, longitude: -76.29 }] }));
    await act(async () => { root.render(React.createElement(Scout, { key: "saved-locations", storeDirectoryState: "CA" })); });
    assert.match(document.body.textContent, /Only 1 report in California/);
    assert.match(document.body.textContent, /Synthetic Richmond shop/, "Custom metro labels must not hide stores from the statewide view");
    assert.match(document.body.textContent, /No current report/, "Uploading old history today must not create a current signal");
    assert.deepEqual(JSON.parse(localStorage.getItem("et-tcg-beta-scout")).reports[0], original);
    picker = document.querySelector('select[aria-label="Restocks state"]');
    await act(async () => { picker.value = "TX"; picker.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.equal(document.querySelectorAll('.scout-command-radar .scout-tile-map-pin').length, 0, "An empty Texas map must not fall back to California or Virginia, including watched/trusted/report pins");
    assert.match(document.body.textContent, /No reports in Texas yet/);
    assert.match(document.querySelector('[aria-label="Restocks intelligence rail"]').textContent, /No current report/);
  } finally {
    if (root) await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});

test("actual map never places a California Richmond store at the Virginia estimate", async () => {
  const Map = await component("src/components/ScoutTileMap.jsx");
  const html = renderToStaticMarkup(React.createElement(Map, { rows: [{ id: "fixture-ca", name: "Synthetic shop", city: "Richmond", state: "California" }] }));
  assert.match(html, /No mapped watched stores yet/);
  const real = renderToStaticMarkup(React.createElement(Map, { rows: [{ id: "fixture-ca", name: "Synthetic shop", city: "Richmond", state: "CA", latitude: 37.9358, longitude: -122.3477 }] }));
  assert.match(real, /1\/1 coordinate-backed/);
});
