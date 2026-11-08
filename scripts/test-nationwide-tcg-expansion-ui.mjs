import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";

test("real report controls combine nationwide, game and shelf-status filters without writes", async () => {
  const bundle = await build({ entryPoints: ["src/components/RestockReportBrowser.jsx"], bundle: true, platform: "node", format: "cjs", write: false, loader: { ".css": "empty" }, external: ["react", "react-dom", "react/jsx-runtime"], jsx: "automatic", define: { "import.meta.env": "{}" }, logLevel: "silent" });
  const module = { exports: {} };
  const dom = new JSDOM('<main id="root"></main>', { url: "https://fixture.invalid/" });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let root;
  const { createRoot } = await import("react-dom/client");
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const Browser = module.exports.default;
  const now = Date.parse("2026-11-08T17:00:00Z");
  const reports = Object.freeze([
    Object.freeze({ id: "ca-digimon", state: "CA", city: "Richmond", productCategory: "Digimon", observedAt: new Date(now).toISOString(), stockStatus: "stock_on_shelf", marketPrice: 81.05 }),
    Object.freeze({ id: "tx-riftbound", state: "TX", city: "Austin", productCategory: "Riftbound", observedAt: new Date(now).toISOString(), stockStatus: "low_stock", marketPrice: 39.95 }),
    Object.freeze({ id: "ca-riftbound", state: "CA", city: "Richmond", productCategory: "Riftbound", observedAt: "2025-01-01T00:00:00Z", createdAt: new Date(now).toISOString(), stockStatus: "no_stock", marketPrice: 22.05 }),
  ]);
  const original = JSON.stringify(reports);
  const visible = () => [...document.querySelectorAll('[data-qa-report]')].map((node) => node.textContent);
  async function select(suffix, value) {
    await act(async () => { const input = document.querySelector(`select[id$="-${suffix}"]`); input.value = value; input.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  }
  try {
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(React.createElement(Browser, { reports, now, renderReport: (report) => React.createElement("article", { key: report.id, "data-qa-report": true }, report.id) })));
    assert.equal(document.querySelector('select[id$="-state"]').options.length, 53);
    assert.equal(document.querySelector('select[id$="-game"]').options.length, 15);
    assert.equal(visible().length, 3);
    await select("state", "CA");
    await select("game", "digimon");
    assert.deepEqual(visible(), ["ca-digimon"]);
    assert.match(document.querySelector('[aria-label="Active filters"]').textContent, /California/);
    await select("game", "riftbound");
    assert.deepEqual(visible(), ["ca-riftbound"]);
    assert.match(document.querySelector('.restock-browser-freshness').textContent, /^0 of 1/);
    await select("period", "24h");
    assert.equal(visible().length, 0);
    assert.match(document.querySelector('[role="status"]').textContent, /No reports match/);
    await select("state", "TX");
    assert.deepEqual(visible(), ["tx-riftbound"]);
    await act(async () => [...document.querySelectorAll("button")].find((node) => node.textContent.startsWith("Empty shelves")).click());
    assert.equal(visible().length, 0);
    await act(async () => [...document.querySelectorAll("button")].find((node) => node.textContent === "Clear filters").click());
    assert.equal(visible().length, 3);
    assert.equal(document.activeElement.type, "search");
    assert.equal(JSON.stringify(reports), original);
    assert.equal(dom.window.localStorage.length, 0);
  } finally {
    if (root) await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});
