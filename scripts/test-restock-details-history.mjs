import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createRestockDetailsHistory, RESTOCK_DETAILS_HISTORY_KEY as marker } from "../src/utils/restockDetailsHistory.mjs";

// Exercise real controller code against queued browser traversal, rather than
// pretending history.back() synchronously fires popstate. No app storage, DOM,
// account, server or network access is involved.
const results = [];
function check(name, run) {
  try { run(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
}
const copy = (value) => structuredClone(value);
function fixture(options = {}) {
  const baseline = options.state || { emberTideRoute: true, custom: { filters: ["low", "recent"], page: 2 }, emberTideCatalogDetail: "underlying-card" };
  const initialUrl = "http://127.0.0.1:5264/scout/reports?betaLocalMode=true#recent";
  const entries = [{ state: copy(baseline), url: options.url || initialUrl }];
  const listeners = new Map(), queue = [], timers = new Map(), calls = [], events = [];
  const records = new Map([["report-a", { id: "report-a", note: "First observation, retained privately in memory", productName: "Retained fixture product" }], ["report-b", { id: "report-b", note: "Second observation" }]]);
  let index = 0, timerId = 0;
  const location = { get href() { return entries[index].url; } };
  const emit = () => { for (const callback of [...(listeners.get("popstate") || [])]) callback({ state: copy(entries[index].state) }); };
  const traverse = (delta) => { const next = index + delta; if (next < 0 || next >= entries.length) return; index = next; emit(); };
  const go = (delta) => {
    calls.push(["go", delta]);
    queue.push(() => traverse(delta));
  };
  const target = {
    location,
    crypto: { randomUUID: () => "fixture-instance" },
    history: {
      get state() { return entries[index].state; },
      get length() { return entries.length; },
      pushState(state, _title, url) {
        if (options.throwPush) throw Object.assign(new Error("Browser rejected the UI history entry"), { name: "SecurityError" });
        calls.push(["push", copy(state), url]);
        entries.splice(index + 1); entries.push({ state: copy(state), url: new URL(url, location.href).href }); index++;
      },
      replaceState(state, _title, url) { calls.push(["replace", copy(state), url]); entries[index] = { state: copy(state), url: new URL(url, location.href).href }; },
      back() { if (options.throwBack) throw new Error("Traversal unavailable"); go(-1); },
      forward() { go(1); },
    },
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const resolveReport = (candidate) => records.get(String(candidate?.id ?? candidate?.reportId ?? candidate?.report_id ?? "")) || null;
  const controller = createRestockDetailsHistory({
    target, resolveReport,
    onOpen: report => events.push(["open", report]),
    onClose: () => events.push(["close"]),
  });
  return {
    baseline, target, records, events, calls, entries, queue, timers, controller, listeners,
    get index() { return index; },
    get current() { return entries[index]; },
    traverse,
    flushOne() { assert.ok(queue.length, "An asynchronous traversal must be queued"); queue.shift()(); },
    expireTimers() { const callbacks = [...timers.values()]; timers.clear(); for (const callback of callbacks) callback(); },
  };
}
const lastOpen = (f) => f.events.filter(event => event[0] === "open").at(-1)?.[1];
const closeCount = (f) => f.events.filter(event => event[0] === "close").length;

check("Opening pushes one same-URL token and preserves all unrelated history state", () => {
  const f = fixture(), before = copy(f.baseline);
  assert.equal(f.controller.open(f.records.get("report-a")), true);
  assert.equal(f.target.history.length, 2); assert.equal(f.current.url, f.entries[0].url);
  const { [marker]: token, ...unrelated } = f.current.state;
  assert.equal(typeof token, "string"); assert.deepEqual(unrelated, before); assert.deepEqual(f.entries[0].state, before);
  const serialized = JSON.stringify(f.current.state);
  assert.ok(!serialized.includes("report-a") && !serialized.includes("observation") && !serialized.includes("productName"), "History must not contain report IDs or report content");
});

check("Double open reuses its entry; duplicate dismiss/open cannot race a pending traversal", () => {
  const f = fixture(); f.controller.open(f.records.get("report-a")); const token = f.current.state[marker];
  f.controller.open(f.records.get("report-a")); assert.equal(f.current.state[marker], token); assert.equal(f.target.history.length, 2);
  assert.equal(f.controller.dismiss(), true); assert.equal(f.controller.dismiss(), false); assert.equal(f.controller.open(f.records.get("report-b")), false);
  assert.equal(f.queue.length, 1); assert.equal(closeCount(f), 0); f.flushOne(); assert.equal(closeCount(f), 1); assert.equal(f.controller.dismiss(), false);
});

check("Handoff executes only after asynchronous Back reaches the underlying entry", () => {
  const f = fixture(), handoffs = [];
  f.controller.open(f.records.get("report-a"));
  f.controller.dismiss(() => { handoffs.push({ index: f.index, state: copy(f.current.state), closes: closeCount(f) }); f.target.history.pushState({ ...f.current.state, emberTideFlowModal: "new-report" }, "", f.current.url); });
  assert.deepEqual(handoffs, []); assert.equal(f.index, 1); assert.equal(f.timers.size, 1);
  f.flushOne(); assert.equal(handoffs.length, 1); assert.equal(handoffs[0].index, 0); assert.equal(handoffs[0].closes, 1); assert.deepEqual(handoffs[0].state, f.baseline);
  assert.equal(f.current.state.emberTideFlowModal, "new-report"); assert.equal(f.current.state[marker], undefined); assert.equal(f.queue.length, 0); assert.equal(f.timers.size, 0);
});

check("Browser Back closes; Forward resolves the current allowed version rather than stale content", () => {
  const f = fixture(); f.controller.open(f.records.get("report-a")); const old = lastOpen(f);
  f.target.history.back(); f.flushOne(); assert.equal(closeCount(f), 1);
  const current = { id: "report-a", note: "Current permitted content", productName: "Updated title" }; f.records.set("report-a", current);
  f.target.history.forward(); f.flushOne(); assert.equal(lastOpen(f), current); assert.notEqual(lastOpen(f), old); assert.equal(f.target.history.length, 2);
});

check("Forward cannot reopen a removed or no-longer-permitted report", () => {
  const f = fixture(); f.controller.open(f.records.get("report-a")); f.target.history.back(); f.flushOne();
  f.records.delete("report-a"); const count = f.events.length;
  f.target.history.forward(); f.flushOne(); assert.equal(f.events.length, count); assert.equal(f.current.state[marker], undefined);
  assert.deepEqual(f.current.state, f.baseline);
});

check("Unknown or unauthorized records do not create an entry or open UI", () => {
  const f = fixture(); assert.equal(f.controller.open({ id: "not-permitted", note: "Cannot trust caller content" }), false);
  assert.equal(f.target.history.length, 1); assert.deepEqual(f.events, []); assert.deepEqual(f.calls, []);
});

check("A rejected history push leaves all records and navigation unchanged", () => {
  const f = fixture({ throwPush: true }), before = copy([...f.records]), parent = copy(f.current);
  // Current behavior propagates the browser exception. Catch it here to prove
  // that failure occurs before creating a frame, opening UI or changing data.
  assert.throws(() => f.controller.open(f.records.get("report-a")), { name: "SecurityError" });
  assert.deepEqual([...f.records], before); assert.deepEqual(f.current, parent); assert.equal(f.target.history.length, 1);
  assert.deepEqual(f.events, []); assert.equal(f.queue.length, 0); assert.equal(f.timers.size, 0); assert.equal(f.controller.dismiss(), false);
  f.controller.destroy(); assert.equal(f.listeners.get("popstate").size, 0);
});

check("A newer same-URL overlay with its own marker is never popped or rewritten", () => {
  const f = fixture(); f.controller.open(f.records.get("report-a"));
  f.target.history.pushState({ ...f.baseline, [marker]: "another-controller-token", emberTideFlowModal: "newer" }, "", f.current.url);
  const before = copy(f.current), calls = f.calls.length; let handoffs = 0;
  assert.equal(f.controller.dismiss(() => handoffs++), false);
  assert.deepEqual(f.current, before); assert.equal(f.calls.length, calls); assert.equal(f.queue.length, 0); assert.equal(handoffs, 0);
});

check("A newer App overlay that inherits the detail token is not mistaken for the owned entry", () => {
  const f = fixture(); f.controller.open(f.records.get("report-a"));
  f.target.history.pushState({ ...f.current.state, emberTideFlowModal: "newer-flow" }, "", f.current.url);
  const before = copy(f.current); let handoffs = 0;
  assert.equal(f.controller.dismiss(() => handoffs++), false);
  assert.deepEqual(f.current, before); assert.equal(f.queue.length, 0); assert.equal(handoffs, 0);
});

check("Forward into a newer overlay inheriting the token cannot reopen child details", () => {
  const f = fixture(); f.controller.open(f.records.get("report-a"));
  f.target.history.pushState({ ...f.current.state, emberTideFlowModal: "newer-flow" }, "", f.current.url);
  f.traverse(-2); assert.equal(closeCount(f), 1);
  f.target.history.forward(); f.flushOne(); assert.equal(lastOpen(f).id, "report-a");
  const opened = f.events.filter(event => event[0] === "open").length, newer = copy(f.entries[2]);
  f.target.history.forward(); f.flushOne();
  assert.equal(f.events.filter(event => event[0] === "open").length, opened, "The later App overlay is not the detail entry");
  assert.deepEqual(f.current, newer);
});

check("A different URL retaining its copied token is not traversed on dismiss", () => {
  const f = fixture(); f.controller.open(f.records.get("report-a"));
  f.target.history.pushState({ ...f.current.state, emberTideRoute: true }, "", "/settings?betaLocalMode=true");
  const before = copy(f.current); let handoffs = 0;
  assert.equal(f.controller.dismiss(() => handoffs++), false); assert.deepEqual(f.current, before); assert.equal(f.queue.length, 0); assert.equal(handoffs, 0);
});

check("A failed traversal timeout closes safely and a late Back never runs handoff", () => {
  const f = fixture(); let handoffs = 0; f.controller.open(f.records.get("report-a")); f.controller.dismiss(() => handoffs++);
  f.expireTimers(); assert.equal(closeCount(f), 1); assert.equal(f.current.state[marker], undefined); assert.equal(handoffs, 0);
  f.flushOne(); assert.equal(handoffs, 0); assert.deepEqual(f.current.state, f.baseline);
  f.target.history.forward(); f.flushOne(); assert.equal(handoffs, 0); assert.equal(f.events.filter(event => event[0] === "open").length, 1);
});

check("Timeout cannot rewrite a newer overlay that inherited the detail token", () => {
  const f = fixture(); let handoffs = 0;
  f.controller.open(f.records.get("report-a")); f.controller.dismiss(() => handoffs++);
  f.target.history.pushState({ ...f.current.state, emberTideFlowModal: "newer-flow" }, "", f.current.url);
  const newer = copy(f.current), calls = f.calls.length;
  f.expireTimers(); assert.deepEqual(f.current, newer); assert.equal(f.calls.length, calls); assert.equal(handoffs, 0);
  f.flushOne(); assert.equal(handoffs, 0);
});

check("A throwing Back cancels pending handoff and clears only the detail marker", () => {
  const f = fixture({ throwBack: true }); let handoffs = 0;
  f.controller.open(f.records.get("report-a")); f.controller.dismiss(() => handoffs++);
  assert.equal(handoffs, 0); assert.equal(closeCount(f), 1); assert.equal(f.timers.size, 0); assert.equal(f.current.state[marker], undefined); assert.deepEqual(f.current.state, f.baseline);
});

check("Traversal to a different route cancels handoff without rewriting that route", () => {
  const f = fixture({ url: "http://127.0.0.1:5264/settings?betaLocalMode=true" });
  f.target.history.pushState({ ...f.baseline }, "", "/scout/reports?betaLocalMode=true");
  f.controller.open(f.records.get("report-a")); let handoffs = 0; f.controller.dismiss(() => handoffs++);
  // A separate browser navigation wins before the queued close traversal.
  f.traverse(-2); assert.equal(handoffs, 0); assert.equal(closeCount(f), 1);
  assert.equal(f.current.url, "http://127.0.0.1:5264/settings?betaLocalMode=true"); assert.deepEqual(f.current.state, f.baseline);
  f.flushOne(); assert.equal(handoffs, 0); assert.equal(f.timers.size, 0);
});

check("Same-URL traversal with a different parent state cannot launch a handoff", () => {
  const f = fixture(); let handoffs = 0; f.controller.open(f.records.get("report-a")); f.controller.dismiss(() => handoffs++);
  // The returned entry must match the captured parent state, not merely URL.
  f.entries[0].state = { ...f.baseline, custom: { replacedBy: "unrelated navigation" } };
  f.flushOne(); assert.equal(handoffs, 0); assert.equal(closeCount(f), 1); assert.equal(f.timers.size, 0);
});

check("Destroy cancels queued handoff, removes listener, and strips only its current marker", () => {
  const f = fixture(); let handoffs = 0; f.controller.open(f.records.get("report-a")); f.controller.dismiss(() => handoffs++);
  f.controller.destroy(); assert.equal(f.timers.size, 0); assert.equal(f.listeners.get("popstate").size, 0); assert.deepEqual(f.current.state, f.baseline);
  f.flushOne(); assert.equal(handoffs, 0); assert.equal(f.controller.open(f.records.get("report-a")), false); assert.equal(f.controller.dismiss(), false);
});

check("Destroy leaves a different controller's marker and unrelated state untouched", () => {
  const f = fixture(); f.controller.open(f.records.get("report-a"));
  f.target.history.pushState({ ...f.baseline, [marker]: "different-owner", emberTideFlowModal: "keep" }, "", f.current.url);
  const before = copy(f.current); f.controller.destroy(); assert.deepEqual(f.current, before);
});

check("Destroy does not rewrite a newer App overlay inheriting the detail token", () => {
  const f = fixture(); f.controller.open(f.records.get("report-a"));
  f.target.history.pushState({ ...f.current.state, emberTideFlowModal: "newer-flow" }, "", f.current.url);
  const before = copy(f.current), calls = f.calls.length; f.controller.destroy();
  assert.deepEqual(f.current, before); assert.equal(f.calls.length, calls);
});

check("Destroy does not rewrite a different route carrying a copied token", () => {
  const f = fixture(); f.controller.open(f.records.get("report-a"));
  f.target.history.pushState({ ...f.current.state, emberTideRoute: true }, "", "/settings?betaLocalMode=true");
  const before = copy(f.current), calls = f.calls.length; f.controller.destroy();
  assert.deepEqual(f.current, before); assert.equal(f.calls.length, calls);
});

check("Reload's unknown token is stripped without reconstructing any report or draft", () => {
  const baseline = { custom: { keep: true }, emberTideFlowModal: "keep-parent", [marker]: "stale-prior-document-token" };
  const f = fixture({ state: baseline });
  assert.deepEqual(f.events, []); assert.equal(f.target.history.length, 1); assert.equal(f.current.state[marker], undefined);
  assert.deepEqual(f.current.state, { custom: { keep: true }, emberTideFlowModal: "keep-parent" });
  assert.equal(f.controller.dismiss(() => assert.fail("No stale-token handoff")), false);
});

check("Unserializable custom parent state fails closed without traversing or handing off", () => {
  const f = fixture({ state: { custom: { keep: 1n }, emberTideRoute: true } }); let handoffs = 0;
  assert.equal(f.controller.open(f.records.get("report-a")), true); const before = copy(f.current);
  assert.equal(f.controller.dismiss(() => handoffs++), false); assert.deepEqual(f.current, before); assert.equal(f.queue.length, 0); assert.equal(handoffs, 0);
});

// Execute the actual App route effects so the child controller cannot pass
// while the parent still replays Scout targets for same-URL overlay pops.
const require = createRequire(import.meta.url);
const { parse } = require("espree");
const source = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const ast = parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
const effects = [];
function walk(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "CallExpression" && node.callee.name === "useEffect") effects.push(node.arguments[0]);
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value?.type) walk(value);
}
walk(ast);
const routeEffect = effects.map(node => source.slice(...node.range)).find(text => text.includes("const handleRoutePopState = () =>"));
assert.ok(routeEffect, "Exercise App's current route-pop listener");
function routeFixture(location, applied, reportReturn = null) {
  const calls = [], listeners = new Map();
  const env = {
    window: { location, history: { state: {} }, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { assert.equal(listeners.get(name), fn); listeners.delete(name); } },
    appliedRouteLocationRef: { current: applied }, scoutStoreReportReturnRef: { current: reportReturn },
    routeNavigationModeRef: { current: "replace" }, routeFocusModeRef: { current: "settled" },
    routeStateFromPath: pathname => ({ activeTab: "scout", scoutView: "stores", scoutStoreId: pathname.split("/").at(-1), scoutReportId: "", productWorkspaceHome: "collect", ownerCenterSubview: "", tidepoolPostId: "" }),
  };
  for (const name of new Set(routeEffect.match(/\bset[A-Z]\w+/g))) env[name] = value => calls.push([name, value]);
  const cleanup = new Function(...Object.keys(env), `return (${routeEffect})();`)(...Object.values(env));
  return { env, calls, fire: () => listeners.get("popstate")(), cleanup, listeners };
}

check("App same full URL pops preserve mounted page targets and settled focus", () => {
  const f = routeFixture({ pathname: "/scout/stores/store-1", search: "?betaLocalMode=true", hash: "#proof" }, "/scout/stores/store-1?betaLocalMode=true#proof");
  f.fire(); f.fire(); assert.deepEqual(f.calls, []); assert.equal(f.env.routeNavigationModeRef.current, "replace"); assert.equal(f.env.routeFocusModeRef.current, "settled");
  f.cleanup(); assert.equal(f.listeners.size, 0);
});

check("App restores a suspended report before the same-location guard", () => {
  const reportReturn = { modal: { id: "draft-1", type: "scoutSubmit" }, restoring: false, draft: { note: "Retained unsaved draft" } };
  const f = routeFixture({ pathname: "/scout/stores/store-1", search: "", hash: "" }, "/scout/stores/store-1", reportReturn);
  f.env.window.history.state = { emberTideScoutReportReturn: "draft-1" }; f.fire(); assert.equal(reportReturn.restoring, true);
  assert.deepEqual(f.calls, [["setActiveFlowModal", reportReturn.modal]]); assert.deepEqual(reportReturn.draft, { note: "Retained unsaved draft" });
});

check("App different path applies existing route targets once and records its full URL", () => {
  const f = routeFixture({ pathname: "/scout/stores/store-2", search: "?betaLocalMode=true", hash: "" }, "/scout/reports?betaLocalMode=true");
  f.fire(); assert.equal(f.env.appliedRouteLocationRef.current, "/scout/stores/store-2?betaLocalMode=true");
  assert.equal(f.env.routeNavigationModeRef.current, "pop"); assert.equal(f.env.routeFocusModeRef.current, "pop");
  assert.deepEqual(f.calls.find(call => call[0] === "setActiveTab"), ["setActiveTab", "scout"]);
  assert.equal(f.calls.find(call => call[0] === "setScoutSubTabTarget")[1].storeId, "store-2"); const count = f.calls.length;
  f.fire(); assert.equal(f.calls.length, count);
});

check("App search-only and hash-only route changes are not swallowed", () => {
  for (const [search, hash] of [["?q=new", ""], ["", "#new"]]) {
    const f = routeFixture({ pathname: "/scout/reports", search, hash }, "/scout/reports"); f.fire();
    assert.ok(f.calls.some(call => call[0] === "setActiveTab")); assert.equal(f.env.appliedRouteLocationRef.current, `/scout/reports${search}${hash}`);
  }
});

check("App history sync refreshes applied location even when no push or replace is needed", () => {
  const sync = effects.map(node => source.slice(...node.range)).find(text => text.includes("localStorage.setItem(APP_ROUTE_STORAGE_KEY"));
  assert.ok(sync, "Exercise App's existing history-sync effect");
  const tail = sync.slice(sync.indexOf("    const params = new URLSearchParams"), sync.lastIndexOf("  }"));
  const calls = [], location = { pathname: "/scout/reports", search: "?betaLocalMode=true", hash: "#proof" };
  const env = {
    window: { location, history: { state: { custom: "keep" }, pushState: () => calls.push("push"), replaceState: () => calls.push("replace") } },
    URLSearchParams, activeTab: "scout", catalogSearch: "", vaultSearch: "", vaultFilter: "all", exchangeSection: "", routePathForHistory: "/scout/reports",
    routeNavigationModeRef: { current: "replace" }, appliedRouteLocationRef: { current: "stale" }, canonicalPathForPath: value => value,
  };
  new Function(...Object.keys(env), tail)(...Object.values(env));
  assert.deepEqual(calls, []); assert.equal(env.appliedRouteLocationRef.current, "/scout/reports?betaLocalMode=true#proof");
});

const failed = results.filter(result => !result.passed);
console.log(`${results.length - failed.length}/${results.length} restock detail history checks passed.`);
if (failed.length) process.exitCode = 1;
