const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const espree = require("espree");
const { chromium } = require("@playwright/test");
const rootDir = path.resolve(__dirname, "..");
const output = path.join(rootDir, "artifacts/qa/release-readiness/remaining-src-lint");
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname));
const results = [];
const parse = (source) => espree.parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
function find(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : value?.type ? [value] : []) { const found = find(child, predicate); if (found) return found; }
  }
  return null;
}
async function check(name, run) { await run(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
async function main() {
  fs.mkdirSync(output, { recursive: true });
  await check("Purchase authority guard follows committed lifetime, including StrictMode setup-cleanup-setup", async () => {
    const source = fs.readFileSync(path.join(rootDir, "src/features/purchaseReceiving/PurchaseReceivingPage.jsx"), "utf8"), ast = parse(source);
    const declaration = find(ast, (node) => node.type === "VariableDeclaration" && node.declarations.some((row) => row.id.type === "ArrayPattern" && row.id.elements[0]?.name === "authorizationLifetime"));
    const effect = find(ast, (node) => node.type === "ExpressionStatement" && node.expression?.callee?.name === "useLayoutEffect" && source.slice(...node.range).includes("authorizationLifetime.update"));
    let cleanup;
    const context = vm.createContext({ authorized: true, useState: (init) => [init()], useLayoutEffect: (effect) => { cleanup = effect(); } });
    vm.runInContext(`${source.slice(...declaration.range)}\n${source.slice(...effect.range)}\nglobalThis.guard = authorizationLifetime;`, context);
    assert.equal(context.guard.isAuthorized(), true); cleanup(); assert.equal(context.guard.isAuthorized(), false);
    vm.runInContext(source.slice(...effect.range), context); assert.equal(context.guard.isAuthorized(), true);
    cleanup(); assert.equal(context.guard.isAuthorized(), false, "old service cannot authorize a late mutation after revoke/unmount");
  });
  for (const [file, factory] of [["botOps/BotOperationsPage.jsx", "createBotOpsService"], ["ownerCenter/OwnerCenterPage.jsx", "getEbayHealth"]]) await check(`${factory}: late async completion is discarded after cleanup`, async () => {
    const source = fs.readFileSync(path.join(rootDir, "src/features", file), "utf8"), ast = parse(source);
    const effect = find(ast, (node) => node.type === "CallExpression" && node.callee?.name === "useEffect" && source.slice(...node.range).includes(`${factory}(`));
    const code = source.slice(...effect.arguments[0].range); let complete, writes = 0;
    const pending = new Promise((resolve) => { complete = resolve; });
    const context = vm.createContext({ authorized: true, EMPTY_SNAPSHOT: {}, createBotOpsService: () => ({ loadSnapshot: () => pending }), getEbayHealth: () => pending, setService: () => { writes += 1; }, setSnapshot: () => { writes += 1; }, setError: () => { writes += 1; }, setEbayHealth: () => { writes += 1; }, setHealthError: () => { writes += 1; } });
    const cleanup = vm.runInContext(`(${code})()`, context); cleanup(); complete({ status: "ready" }); await pending; await Promise.resolve();
    assert.equal(writes, 0);
  });
  const browser = await chromium.launch();
  try {
    for (const strict of [false, true]) for (const [name, file, storageKey] of [
      ["Account", "accountOps/AccountOpsPage.jsx", "code3.account-ops.v1"],
      ["Bot", "botOps/BotOperationsPage.jsx", "code3.bot-ops.v1"],
      ["Owner", "ownerCenter/OwnerCenterPage.jsx", "private-business-hub.owner-center.v1"],
      ["Purchase", "purchaseReceiving/PurchaseReceivingPage.jsx", "code3.purchase-receiving.v1"],
    ]) await check(`${name}: denied zero-read, authorized identity lifetime and revocation${strict ? " in StrictMode" : ""}`, async () => {
      const context = await browser.newContext(); const page = await context.newPage(); const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== base.origin || route.request().method() !== "GET") return route.abort();
        if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ configured: false, healthy: false, status: "Not Configured" }) });
        if (url.pathname === "/__qa/remaining-lint") return route.fulfill({ contentType: "text/html", body: '<html><body><div id="fixture"></div></body></html>' });
        return route.continue();
      });
      await page.goto(new URL("/__qa/remaining-lint", base).href);
      const evidence = await page.evaluate(async ({ file, storageKey, strict }) => {
        const main = await (await fetch("/src/main.jsx")).text(), imports = [...main.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
        const dependency = (name) => imports.find((value) => new URL(value, location.href).pathname.endsWith(`/${name}`));
        const refresh = await import("/@react-refresh"); refresh.default.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true; window.IS_REACT_ACT_ENVIRONMENT = true;
        const reactModule = await import(dependency("react.js")), React = reactModule.default || reactModule;
        const domModule = await import(dependency("react-dom_client.js")), { createRoot } = domModule.default || domModule;
        const Component = (await import(`/src/features/${file}`)).default;
        const reads = [], writes = []; const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
        Storage.prototype.getItem = function(key) { if (key === storageKey) reads.push(key); return get.call(this, key); };
        Storage.prototype.setItem = function(key, value) { writes.push(key); return set.call(this, key, value); };
        const root = createRoot(document.querySelector("#fixture"));
        const render = async (session) => { const child = React.createElement(Component, { session }); await React.act(async () => { root.render(strict ? React.createElement(React.StrictMode, null, child) : child); await new Promise((resolve) => setTimeout(resolve, 35)); }); };
        for (const status of ["loading", "sign_in_required", "owner_access_required", "unavailable"]) await render({ status });
        const deniedReads = reads.length;
        const owner = { status: "authorized", provider: "synthetic-fixture", displayIdentity: "Owner A" };
        await render(owner); const firstReads = reads.length; const firstNode = document.querySelector("#fixture").firstElementChild;
        await render({ ...owner }); const sameIdentityNode = document.querySelector("#fixture").firstElementChild === firstNode;
        await render({ ...owner, displayIdentity: "Owner B" }); const nextNode = document.querySelector("#fixture").firstElementChild, identityReset = nextNode !== firstNode, secondReads = reads.length;
        await render({ status: "owner_access_required" }); const revokeReads = reads.length, revokedText = document.querySelector("#fixture").textContent;
        await React.act(async () => root.unmount()); const unmounted = !document.querySelector("#fixture").children.length;
        return { deniedReads, firstReads, secondReads, revokeReads, sameIdentityNode, identityReset, unmounted, revokedText, writes };
      }, { file, storageKey, strict });
      assert.equal(evidence.deniedReads, 0); assert.ok(evidence.firstReads > 0); assert.ok(evidence.secondReads > evidence.firstReads);
      assert.equal(evidence.sameIdentityNode, true); assert.equal(evidence.identityReset, true); assert.equal(evidence.revokeReads, evidence.secondReads); assert.equal(evidence.unmounted, true);
      assert.match(evidence.revokedText, /Owner Access Required|owner access|not authorized/i); assert.deepEqual(evidence.writes, []); assert.deepEqual(errors, []);
      await context.close();
    });
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, "lifecycle-results.json"), JSON.stringify({ count: results.length, results, boundaries: "Actual components with synthetic props in disposable local contexts; actual local services; no application auth or hosted data changed." }, null, 2));
  console.log(`${results.length}/${results.length} lifecycle checks passed`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
