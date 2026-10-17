const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/private-beta-candidate/return-correction-ui-lifecycle");
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin !== base.origin || route.request().method() !== "GET") return route.abort();
      if (url.pathname === "/__qa/correction-ui") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><main id="fixture"></main></body></html>' });
      return route.continue();
    });
    const page = await context.newPage(), pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(new URL("/__qa/correction-ui", base).href);
    const result = await page.evaluate(async () => {
      const main = await (await fetch("/src/main.jsx")).text();
      const imports = [...main.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]);
      const dependency = name => imports.find(value => new URL(value, location.href).pathname.endsWith("/" + name));
      const react = await import(dependency("react.js")), React = react.default || react;
      const dom = await import(dependency("react-dom_client.js")), { createRoot } = dom.default || dom;
      const { act } = React;
      window.IS_REACT_ACT_ENVIRONMENT = true;
      const runtime = (await import("/@react-refresh")).default;
      runtime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;
      const { default: Panel } = await import("/src/features/manualLifecycles/SaleReturnCorrection.jsx");
      const results = [], cleanups = [];
      const check = (name, passed) => { results.push({ name, passed }); if (!passed) throw Error(name); };
      const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
      const current = { currency: "CAD", quantity: 1, restockedQuantity: 1, refundMinor: 1200, refundReference: "SYN-ORIGINAL", disposition: "Restock review", cogsReversalMinor: 500, unitIndexes: [0] };
      const button = (host, text) => [...host.querySelectorAll("button")].find(node => node.textContent.trim() === text);
      const click = node => act(async () => { if (!node) throw Error("Expected control is missing"); node.click(); });
      async function fixture(strict, mode = "correct") {
        const host = document.createElement("div"); document.querySelector("#fixture").append(host);
        const root = createRoot(host), calls = [], callbacks = []; let authorized = true, cancelled = 0;
        const request = (kind, input) => { const gate = deferred(); calls.push({ kind, input, ...gate }); return gate.promise; };
        const service = { previewReturnCorrection: (id, proposal) => request("preview", { id, proposal }), applyReturnCorrection: command => request("apply", command) };
        const child = React.createElement(Panel, { record: { id: "Exact-Return-ID" }, current, mode, service, isOwnerAuthorized: () => authorized, onApplied: result => callbacks.push(result), onCancel: () => { cancelled++; } });
        await act(async () => root.render(strict ? React.createElement(React.StrictMode, null, child) : child));
        const input = async (label, value) => {
          const node = [...host.querySelectorAll("label")].find(node => node.textContent.includes(label))?.querySelector("input,textarea,select");
          if (!node) throw Error("Missing input: " + label);
          await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), "value").set.call(node, value); node.dispatchEvent(new Event("input", { bubbles: true })); node.dispatchEvent(new Event("change", { bubbles: true })); });
        };
        let closed = false;
        const close = async () => { if (!closed) { closed = true; await act(async () => root.unmount()); host.remove(); } };
        cleanups.push(close);
        const settle = async (call, overrides = {}) => {
          const proposal = call.input.proposal;
          await act(async () => call.resolve(call.kind === "apply" ? { state: { synthetic: true } } : { canApply: true, alreadyApplied: false, currency: "CAD", expectedVersion: "Exact-reviewed-version", before: current, after: { ...current, ...proposal }, deltas: { refundMinor: proposal.refundMinor - current.refundMinor, stockQuantity: proposal.restockedQuantity - 1, cogsReversalMinor: 0 }, availableBefore: 1, availableAfter: 1, proposal, ...overrides }));
        };
        return { host, calls, callbacks, input, close, settle, cancelled: () => cancelled, authorize: value => { authorized = value; }, review: async () => { await input("Reason for correction", "Synthetic corrected receipt"); await input("Manual refund reference", "SYN-REVISED"); await click(button(host, "Review correction")); }, confirm: () => click(host.querySelector('input[type="checkbox"]')) };
      }
      try {
        for (const strict of [false, true]) {
          const tag = strict ? "StrictMode" : "normal";
          let f = await fixture(strict);
          check("mount never previews or writes: " + tag, f.calls.length === 0);
          await click(button(f.host, "Cancel correction"));
          check("cancel before review performs zero service calls: " + tag, f.calls.length === 0 && f.cancelled() === 1);
          await f.review(); await click(button(f.host, "Reviewing…"));
          check("double preview submits one proposal: " + tag, f.calls.length === 1 && f.calls[0].input.id === "Exact-Return-ID");
          await f.settle(f.calls[0]);
          check("currency follows return currency: " + tag, f.host.textContent.includes("CA$12.00"));
          check("apply requires explicit confirmation: " + tag, button(f.host, "Apply correction").disabled);
          await f.confirm(); const apply = button(f.host, "Apply correction"); await act(async () => { apply.click(); apply.click(); });
          const mutation = f.calls.at(-1);
          check("double apply retains exact reviewed proposal/version and writes once: " + tag, f.calls.filter(c => c.kind === "apply").length === 1 && mutation.input.confirmed === true && mutation.input.expectedVersion === "Exact-reviewed-version" && JSON.stringify(mutation.input.proposal) === JSON.stringify(f.calls[0].input.proposal));
          await f.settle(mutation); check("successful apply publishes once: " + tag, f.callbacks.length === 1); await f.close();
          f = await fixture(strict); await f.review(); const firstKey = f.calls[0].input.proposal.idempotencyKey; await f.settle(f.calls[0]); await f.confirm(); await click(button(f.host, "Edit correction"));
          await f.input("Corrected refund total", "13.00"); await f.review();
          check("editing a proposal creates a new identity: " + tag, f.calls.at(-1).input.proposal.idempotencyKey !== firstKey && f.calls.at(-1).input.proposal.refundMinor === 1300);
          await f.settle(f.calls.at(-1)); check("edited proposal needs new confirmation: " + tag, button(f.host, "Apply correction").disabled); await f.close();
          f = await fixture(strict); await f.review(); await f.settle(f.calls[0]); await f.confirm(); await click(button(f.host, "Apply correction"));
          const failedKey = f.calls.at(-1).input.proposal.idempotencyKey;
          await act(async () => f.calls.at(-1).reject(Error("Saved records changed. Review again.")));
          check("stale apply retains draft and clears reviewed confirmation: " + tag, f.host.querySelector("textarea").value === "Synthetic corrected receipt" && !!button(f.host, "Review correction") && !button(f.host, "Apply correction") && f.host.textContent.includes("Saved records changed") && f.callbacks.length === 0);
          await click(button(f.host, "Review correction"));
          check("unchanged failed proposal retains retry identity: " + tag, f.calls.at(-1).input.proposal.idempotencyKey === failedKey); await f.settle(f.calls.at(-1));
          check("fresh review after failure needs fresh confirmation: " + tag, button(f.host, "Apply correction").disabled); await f.close();
          f = await fixture(strict, "reverse");
          check("reversal targets zero with read-only money and stock: " + tag, [...f.host.querySelectorAll("input[readonly]")].length === 2 && [...f.host.querySelectorAll("input[readonly]")].every(n => Number(n.value) === 0));
          await f.review(); await f.settle(f.calls[0]); check("reversal requires explicit confirmation: " + tag, button(f.host, "Apply reversal").disabled); await f.close();
          f = await fixture(strict); await f.review(); await f.settle(f.calls[0], { alreadyApplied: true, canApply: false });
          check("idempotent replay offers no apply control: " + tag, !button(f.host, "Apply correction") && !f.host.querySelector('input[type="checkbox"]')); await f.close();
          f = await fixture(strict); f.authorize(false); await f.review(); check("revoked authority cannot preview: " + tag, f.calls.length === 0); await f.close();
          f = await fixture(strict); await f.review(); await f.settle(f.calls[0]); await f.confirm(); f.authorize(false); await click(button(f.host, "Apply correction"));
          check("revoked authority cannot apply reviewed proposal: " + tag, f.calls.every(c => c.kind === "preview")); await f.close();
          for (const phase of ["preview", "apply"]) for (const end of ["unmount", "revoke"]) {
            f = await fixture(strict); await f.review();
            if (phase === "apply") { await f.settle(f.calls[0]); await f.confirm(); await click(button(f.host, "Apply correction")); }
            const pending = f.calls.at(-1); if (end === "unmount") await f.close(); else f.authorize(false);
            await f.settle(pending);
            check(`late ${phase} after ${end} never publishes: ${tag}`, f.callbacks.length === 0 && (phase === "apply" || !button(f.host, "Apply correction"))); await f.close();
          }
        }
        return { passed: true, results };
      } catch (error) { return { passed: false, failure: error.message, results }; }
      finally { for (const close of cleanups) await close(); }
    });
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ ...result, pageErrors, noRemoteRequests: true }, null, 2) + "\n");
    assert.deepEqual(pageErrors, []); assert.equal(result.passed, true, result.failure);
    console.log(`${result.results.length}/${result.results.length} return correction UI lifecycle checks passed in normal and StrictMode React.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
