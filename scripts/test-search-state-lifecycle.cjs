const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
const output = process.env.QA_OUTPUT_DIR ? path.resolve(__dirname, "..", process.env.QA_OUTPUT_DIR) : path.resolve(__dirname, "../artifacts/qa/release-readiness/remaining-src-lint");
const results = [];
const catalogStub = `
  export const normalizeCatalogQuery = (value) => String(value || '').trim().toLowerCase();
  export const detectCatalogSearchMode = () => 'general';
  export const isCatalogSearchDebugEnabled = () => false;
  export const getCachedCatalogRecommendations = () => null;
  export const getCatalogRecommendations = (args) => new Promise((resolve, reject) => window.requests.push({ kind: 'suggest', args, resolve, reject }));
  export const searchPokemonCatalog = (args) => new Promise((resolve, reject) => window.requests.push({ kind: 'search', args, resolve, reject }));
`;
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== base.origin || route.request().method() !== "GET") return route.abort();
      if (url.pathname === "/__qa/search-state") return route.fulfill({ contentType: "text/html", body: '<html><body><div id="fixture"></div></body></html>' });
      if (url.pathname === "/src/services/pokemonCatalogSearch.js") return route.fulfill({ contentType: "text/javascript", body: catalogStub });
      return route.continue();
    });
    await page.goto(new URL("/__qa/search-state", base).href);
    await page.evaluate(async () => {
      const main = await (await fetch("/src/main.jsx")).text();
      const imports = [...main.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
      const dependency = (name) => imports.find((value) => new URL(value, location.href).pathname.endsWith(`/${name}`));
      const refresh = await import("/@react-refresh"); refresh.default.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;
      const reactModule = await import(dependency("react.js")), React = reactModule.default || reactModule;
      const domModule = await import(dependency("react-dom_client.js")), { createRoot } = domModule.default || domModule;
      const Smart = (await import("/src/components/SmartCatalogSearchBox.jsx")).default;
      const What = (await import("/src/components/WhatDidISee.jsx")).default;
      const root = createRoot(document.querySelector("#fixture"));
      window.requests = []; window.selections = [];
      let props = {}, Component = Smart;
      window.renderSearchFixture = async (patch = {}, kind) => {
        if (kind) { Component = kind === "what" ? What : Smart; props = {}; }
        props = { ...props, ...patch };
        if (Component === Smart) {
          props.onChange = (value) => window.renderSearchFixture({ value });
          props.onSelectSuggestion = (row) => window.selections.push(row);
        } else props.mapCatalogRow = (row) => row;
        await React.act(async () => { root.render(React.createElement(React.StrictMode, null, React.createElement(Component, props))); });
      };
      window.resolveRequest = async (kind, query, value) => {
        const request = window.requests.findLast((row) => row.kind === kind && row.args.query === query);
        if (!request) throw new Error(`Missing ${kind} request ${query}`);
        await React.act(async () => { request.resolve(value); await Promise.resolve(); });
      };
      window.unmountSearchFixture = () => React.act(async () => root.unmount());
    });
    async function check(name, run) { await run(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
    const render = (props, kind) => page.evaluate(({ props, kind }) => window.renderSearchFixture(props, kind), { props, kind });
    const productA = { id: "qa-a", name: "Alpha Card", cardName: "Alpha Card", catalogType: "card", productType: "Card" };
    const productB = { id: "qa-b", name: "Alpha Booster", productName: "Alpha Booster", catalogType: "sealed", productType: "Booster" };
    await check("Smart search omitted array props are stable in StrictMode", async () => {
      await render({ value: "alpha", isSupabaseConfigured: false }, "smart");
      await page.getByRole("listbox").waitFor();
      assert.match(await page.getByRole("listbox").innerText(), /No matches found/);
      await render({ value: "alpha" });
      assert.equal(await page.getByRole("combobox").inputValue(), "alpha");
    });
    await check("Local suggestion changes, keyboard selection, close and suppression preserve behavior", async () => {
      await render({ localCatalogProducts: [productA, productB] });
      assert.equal(await page.getByRole("option").count(), 2);
      await page.getByRole("combobox").focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.evaluate(() => window.selections[0].product.id), productA.id);
      await render({ value: "alpha" });
      await render({ closeSignal: 1 });
      assert.equal(await page.getByRole("listbox").count(), 0);
      await page.getByRole("combobox").focus();
      await page.getByRole("listbox").waitFor();
      await render({ suppressSuggestions: true });
      assert.equal(await page.getByRole("listbox").count(), 0);
      await render({ suppressSuggestions: false, localCatalogProducts: [productB] });
      assert.equal(await page.getByRole("option").count(), 1);
      assert.match(await page.getByRole("option").innerText(), /Alpha Booster/);
    });
    await check("Remote stale completion cannot reopen suppressed suggestions", async () => {
      await render({ value: "remote old", supabase: {}, isSupabaseConfigured: true, localCatalogProducts: [] });
      await page.waitForFunction(() => window.requests.some((row) => row.kind === "suggest" && row.args.query === "remote old"));
      await render({ suppressSuggestions: true });
      await page.evaluate(() => window.resolveRequest("suggest", "remote old", { suggestions: [{ id: "stale", label: "Stale result" }] }));
      assert.equal(await page.getByRole("listbox").count(), 0);
      await render({ value: "remote new", suppressSuggestions: false });
      await page.waitForFunction(() => window.requests.some((row) => row.kind === "suggest" && row.args.query === "remote new"));
      await page.evaluate(() => window.resolveRequest("suggest", "remote new", { suggestions: [{ id: "fresh", label: "Fresh result" }] }));
      assert.match(await page.getByRole("option").innerText(), /Fresh result/);
    });
    await check("What Did I See product handoffs retain selected items and edited details", async () => {
      await render({ initialProduct: productA, isSupabaseConfigured: false }, "what");
      await page.getByLabel("Shelf price", { exact: true }).fill("12.34");
      await render({ initialProduct: productB });
      assert.equal(await page.locator(".what-see-result.checked").count(), 2);
      const alpha = page.locator(".what-see-result").filter({ has: page.getByRole("heading", { name: "Alpha Card", exact: true }) });
      assert.equal(await alpha.getByLabel("Shelf price", { exact: true }).inputValue(), "12.34");
      await render({ initialProduct: productB });
      assert.equal(await page.locator(".what-see-result.checked").count(), 2);
      assert.match(await page.locator(".empty-state").innerText(), /not configured/);
    });
    await check("What Did I See pagination resets on a filter change and discards late search results", async () => {
      await render({ isSupabaseConfigured: true, supabase: {} });
      await page.locator(".what-see-toolbar > select").first().selectOption("Cards");
      await page.waitForFunction(() => window.requests.some((row) => row.kind === "search" && row.args.productGroup === "Cards"));
      await page.evaluate(async () => {
        const request = window.requests.findLast((row) => row.kind === "search" && row.args.productGroup === "Cards");
        request.resolve({ rows: Array.from({ length: 25 }, (_, index) => ({ id: `row-${index}`, name: `Card ${index}`, catalogType: "card" })), count: 60 });
      });
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.waitForFunction(() => window.requests.some((row) => row.kind === "search" && row.args.page === 2));
      await page.locator(".what-see-toolbar > select").first().selectOption("Sealed");
      assert.match(await page.locator(".catalog-pagination-row").innerText(), /Page 1/);
      await page.waitForFunction(() => window.requests.some((row) => row.kind === "search" && row.args.productGroup === "Sealed"));
      await page.evaluate(async () => {
        window.requests.findLast((row) => row.kind === "search" && row.args.productGroup === "Sealed").resolve({ rows: [{ id: "fresh-sealed", name: "Current sealed result", catalogType: "sealed" }], count: 1 });
      });
      await page.getByRole("heading", { name: "Current sealed result", exact: true }).waitFor();
      await page.evaluate(() => window.requests.findLast((row) => row.kind === "search" && row.args.page === 2).resolve({ rows: [{ id: "old-page", name: "Obsolete page result" }], count: 60 }));
      await page.waitForTimeout(30);
      assert.equal(await page.getByRole("heading", { name: "Obsolete page result", exact: true }).count(), 0);
      assert.equal(await page.getByRole("heading", { name: "Current sealed result", exact: true }).count(), 1);
    });
    await check("Unmount prevents pending catalog responses from publishing", async () => {
      await page.evaluate(() => window.unmountSearchFixture());
      await page.evaluate(() => window.requests.forEach((request) => request.resolve({ suggestions: [], rows: [] })));
      assert.equal(await page.locator("#fixture > *").count(), 0);
      assert.deepEqual(errors, []);
    });
    await check("Mobile preview entry still mounts its original complete screen set", async () => {
      await page.goto(new URL("/screen-set.html", base).href);
      await page.locator(".ets-screen-set").waitFor();
      assert.ok((await page.locator("body").innerText()).includes("Code 3 TCG"));
      assert.deepEqual(errors, []);
    });
    await context.close();
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, "search-lifecycle-results.json"), JSON.stringify({ count: results.length, results, boundary: "Actual React components in StrictMode with a controlled asynchronous catalog module; all external requests and writes blocked." }, null, 2));
  console.log(`${results.length}/${results.length} search lifecycle and preview checks passed.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
