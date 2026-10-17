const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const { chromium } = require("@playwright/test");

const rootPath = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(rootPath, "src/App.jsx"), "utf8");
const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });
const eventDeclarations = new Map(), effects = [];
traverse(ast, {
  VariableDeclarator(node) {
    if (node.node.init?.callee?.name === "useEffectEvent") eventDeclarations.set(node.node.id.name, source.slice(node.parentPath.node.start, node.parentPath.node.end));
  },
  CallExpression(node) {
    if (node.node.callee.name === "useEffect") effects.push(source.slice(node.node.start, node.node.end));
  },
});
const cases = {
  catalog: { event: "onCatalogSearchDue", marker: "multiDestinationMatchSearchOpen" },
  admin: { event: "onAdminInviteSearchDue", marker: "onAdminInviteSearchDue" },
  access: { event: "onDataSessionReady", marker: "onDataSessionReady" },
  history: { event: "onEffectCloseFlow", marker: "emberTideFlowModal" },
};
for (const definition of Object.values(cases)) {
  const matches = effects.filter((effect) => effect.includes(definition.marker) && effect.includes(`${definition.event}(`));
  assert.equal(matches.length, 1, `Exercise the actual ${definition.marker} effect`);
  definition.effect = matches[0];
  definition.declaration = eventDeclarations.get(definition.event);
  assert.ok(definition.declaration);
}
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname));
const output = path.join(rootPath, "artifacts/qa/next-ten/release-quality/effect-events");

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.route("**/*", (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin !== base.origin || route.request().method() !== "GET") return route.abort();
      if (requestUrl.pathname === "/__qa/effect-events") return route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="fixture"></div>' });
      return route.continue();
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/__qa/effect-events", base).href);
    const results = await page.evaluate(async ({ cases }) => {
      const main = await (await fetch("/src/main.jsx")).text();
      const imports = [...main.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
      const dependency = (name) => imports.find((value) => new URL(value, location.href).pathname.endsWith(`/${name}`));
      const module = await import(dependency("react.js")), React = module.default || module;
      const dom = await import(dependency("react-dom_client.js")), { createRoot } = dom.default || dom;
      const { act } = React;
      window.IS_REACT_ACT_ENVIRONMENT = true;
      const results = [];
      const check = (name, value) => { if (!value) throw Error(name); results.push({ name, passed: true }); };
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      for (const strict of [false, true]) {
        async function fixture(kind, initial = {}) {
          const calls = [], listeners = new Map();
          const observed = (label, ...args) => calls.push({ label, args });
          const fakeWindow = {
            location: { href: location.href, pathname: "/scout/reports" },
            history: { state: { unrelated: "keep" }, pushState(value) { observed("push", value); this.state = value; }, replaceState(value) { observed("replace", value); this.state = value; } },
            addEventListener(type, fn) { observed("subscribe", type); listeners.set(type, fn); },
            removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); observed("unsubscribe", type); },
            setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window),
          };
          let model = {
            window: fakeWindow, BETA_LOCAL_MODE: false, currentUserProfile: {}, shorelineState: { betaRequest: {} },
            user: { id: "owner-a" }, betaAccessForEffects: true, profileReadyForEffects: true,
            betaAdminVisible: true, signedInWithSupabase: true, adminBetaInviteSearch: "alpha",
            activeFlowModal: { id: "flow-a", type: "multiDestinationAdd" }, flowModalOpen: true,
            multiDestinationStep: "item", multiDestinationMatchSearchOpen: true, multiDestinationCatalogQuery: "alpha",
            catalogPageSize: 24, catalogKindFilter: "all", catalogTypeFilter: "all", catalogSetFilter: "all", catalogDataFilter: "all", catalogRarityFilter: "all", catalogSort: "name",
            catalogRefreshQuery: "", catalogRefreshBarcode: "", catalogRefreshCanRun: false,
            scoutStoreReportReturnRef: { current: null }, routeStateFromPath: () => ({}),
            cache: "initial", draft: "first", ...initial,
          };
          const setterNames = [...new Set(cases[kind].effect.match(/\bset[A-Z]\w*/g) || [])];
          for (const name of setterNames) model[name] = (...args) => observed(name, ...args);
          const definition = cases[kind];
          const target = { catalog: "loadImportedPokemonCatalog", admin: "refreshAdminBetaInvites", access: "loadAllData", history: "closeFlowModal" }[kind];
          const code = `return function Probe({ model }) { const { ${Object.keys(model).join(",")} } = model;
            const { useEffect, useEffectEvent } = React;
            const ${target} = (...args) => observed("operation", { user: user.id, cache, draft }, ...args);
            ${definition.declaration}
            ${definition.effect}; return null; }`;
          const Probe = new Function("React", "observed", code)(React, observed);
          const root = createRoot(document.querySelector("#fixture"));
          async function render(patch = {}) { model = { ...model, ...patch }; await act(async () => root.render(strict ? React.createElement(React.StrictMode, null, React.createElement(Probe, { model })) : React.createElement(Probe, { model }))); }
          await render();
          return { calls, listeners, render, count: (name = "operation") => calls.filter((call) => call.label === name).length, close: () => act(async () => root.unmount()) };
        }
        let f = await fixture("catalog");
        await wait(100); await f.render({ cache: "new cache" }); await wait(230);
        check(`catalog samples latest cache without resetting debounce (${strict})`, f.count() === 1 && f.calls.find((call) => call.label === "operation").args[0].cache === "new cache");
        await f.render({ multiDestinationCatalogQuery: "beta" }); await f.render({ multiDestinationCatalogQuery: "gamma" }); await wait(330);
        check(`catalog query change cancels superseded timer (${strict})`, f.count() === 2 && f.calls.filter((call) => call.label === "operation").at(-1).args[1] === "gamma");
        await f.render({ multiDestinationCatalogQuery: "cancel" }); await f.close(); await wait(320);
        check(`catalog unmount cancels pending work (${strict})`, f.count() === 2);
        f = await fixture("admin"); await wait(100); await f.render({ cache: "fresh diagnostic context" }); await wait(200);
        check(`admin search ignores unrelated context changes (${strict})`, f.count() === 1);
        await f.render({ user: { id: "owner-b" } }); await wait(300);
        check(`admin identity change initiates a new scoped request (${strict})`, f.count() === 2 && f.calls.filter((call) => call.label === "operation").at(-1).args[0].user === "owner-b");
        await f.render({ adminBetaInviteSearch: "cancel" }); await f.render({ betaAdminVisible: false }); await wait(300);
        check(`admin access revocation cancels pending search (${strict})`, f.count() === 2); await f.close();
        f = await fixture("access", { betaAccessForEffects: false });
        check(`denied access does not start protected loads (${strict})`, f.count() === 0);
        await f.render({ betaAccessForEffects: true }); const allowedCount = f.count();
        await f.render({ cache: "loaded records" });
        check(`result updates do not repeat session loads (${strict})`, allowedCount === 1 && f.count() === allowedCount);
        await f.render({ user: { id: "owner-b" } });
        check(`identity changes repeat protected session load (${strict})`, f.count() === allowedCount + 1); await f.close();
        f = await fixture("history"); const historyCount = f.count("push");
        await f.render({ draft: "latest unsaved draft" });
        check(`draft edits do not add modal history entries (${strict})`, f.count("push") === historyCount);
        f.listeners.get("popstate")();
        check(`Back invokes the latest committed close handler (${strict})`, f.calls.filter((call) => call.label === "operation").at(-1).args[0].draft === "latest unsaved draft");
        await f.close(); check(`modal listener is removed on unmount (${strict})`, f.listeners.size === 0);
      }
      return results;
    }, { cases });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ passed: results.length, results }, null, 2));
    console.log(`${results.length}/${results.length} mounted App effect-event cases passed in normal and StrictMode React.`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
