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

test("actual Restocks screen scopes nearby reports and store suggestions with the city/ZIP picker", async () => {
  const dom = new JSDOM('<html><body><main id="root"></main></body></html>', { url: "https://fixture.invalid/?near=zip-94804" });
  const previous = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    location: dom.window.location,
    history: dom.window.history,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let root;
  let selected = "CA";
  function StateHarness({ initialState = "CA" }) {
    const [state, setState] = React.useState(initialState);
    selected = state;
    return React.createElement(ScoutComponent, {
      storeDirectoryState: state,
      onStoreDirectoryStateChange: code => { selected = code; setState(code); },
    });
  }
  let ScoutComponent;
  async function settleArea(state) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const nearby = JSON.parse(localStorage.getItem("code3:public-browse-area:v1") || "null");
      if (nearby?.mode === "nearby" && nearby.area?.state === state) return;
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    }
    assert.fail(\`The city/ZIP picker did not apply the \${state} area deep link\`);
  }
  try {
    ScoutComponent = await component("src/pages/Scout.jsx");
    root = createRoot(document.getElementById("root"));
    await act(async () => {
      root.render(React.createElement(StateHarness, { key: "first-area" }));
    });
    await settleArea("CA");

    const picker = document.querySelector('.scout-command-radar input[role="combobox"]');
    assert.ok(picker, "Scout should expose the current City or ZIP search instead of the removed state select");
    assert.ok(document.querySelector('.scout-command-radar [role="group"][aria-label="Where to browse"]'));
    assert.match(document.body.textContent, /No reports in near Richmond, CA yet/);
    assert.doesNotMatch(document.body.textContent, /Could not load|Failed to load/);

    const suggest = [...document.querySelectorAll("button")].find(button => button.textContent === "Suggest a store");
    assert.ok(suggest);
    await act(async () => { suggest.click(); });
    const dialog = document.querySelector('[aria-label="Submit Missing Store"]');
    assert.ok(dialog);
    assert.equal(dialog.querySelector('select[aria-label="State"]').value, "California");
    assert.equal(dialog.querySelector('select[aria-label="State"]').options.length, 52);
    assert.match(dialog.textContent, /until approved/);

    const original = { id: "nationwide-private-report", userId: "local-beta-scout", state: "CA", city: "Richmond", region: "", storeName: "Synthetic manual store", stockStatus: "no_stock", observedAt: "2026-10-01T12:00:00Z", createdAt: new Date().toISOString(), visibility: "private_from_map", price: 81.05 };
    const otherReport = { id: "nationwide-va-report", storeId: "nationwide-store-va", state: "VA", city: "Norfolk", storeName: "Virginia fixture", stockStatus: "in_stock", observedAt: new Date().toISOString(), visibility: "private_from_map", userId: "local-beta-scout" };
    localStorage.setItem("et-tcg-beta-scout", JSON.stringify({
      reports: [original, otherReport],
      stores: [
        { id: "nationwide-store-ca", name: "Synthetic Richmond shop", state: "CA", city: "Richmond", region: "East Bay", active: true, latitude: 37.9358, longitude: -122.3477 },
        { id: "nationwide-store-va", name: "Virginia fixture", state: "VA", city: "Norfolk", region: "Hampton Roads / 757", active: true, favorite: true, watched: true, latitude: 36.85, longitude: -76.29 },
      ],
    }));
    await act(async () => { root.render(React.createElement(StateHarness, { key: "saved-locations" })); });
    assert.match(document.body.textContent, /Only 1 report in near Richmond, CA/);
    assert.match(document.body.textContent, /Synthetic Richmond shop/, "A custom metro label must not hide a local store");
    assert.match(document.body.textContent, /No current report/, "Old history must not create a current restock signal");
    assert.deepEqual(JSON.parse(localStorage.getItem("et-tcg-beta-scout")).reports[0], original);

    // A new location deep link must update the state and nearby scope, not
    // reintroduce California or Virginia pins in an empty Texas area.
    dom.window.history.pushState({}, "", "/?near=zip-78701");
    await act(async () => { root.render(React.createElement(StateHarness, { key: "texas-area" })); });
    await settleArea("TX");
    assert.equal(selected, "TX");
    assert.match(document.body.textContent, /No reports in near Austin, TX yet/);
    assert.equal(document.querySelectorAll(".scout-command-radar .scout-tile-map-pin").length, 0);
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
