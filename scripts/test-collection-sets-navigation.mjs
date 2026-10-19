import assert from "node:assert/strict";
import { createCollectionSetsNavigation } from "../src/utils/collectionSetsNavigation.mjs";

const marker = "code3CollectionSetsNavigation";
const clone = (value) => structuredClone(value);
const results = [];
function check(name, run) { run(); results.push(name); console.log(`PASS ${name}`); }
function fixture(options = {}) {
  const baseline = { emberTideRoute: true, filters: { scope: "owned", query: "Synthetic" }, code3ScoutReportDetails: "separate-report", ...options.state };
  const entries = [{ state: clone(baseline), url: "http://127.0.0.1:5271/collection/sets?betaLocalMode=true" }];
  let index = 0, timerId = 0;
  const listeners = new Set(), queue = [], timers = new Map(), changes = [];
  const permitted = new Map([["set", { id: "set", privateName: "Private set" }], ["item", { id: "item", privateName: "Private item" }]]);
  const target = {
    location: { get href() { return entries[index].url; } },
    crypto: { randomUUID: () => "isolated-sets" },
    history: {
      get state() { return entries[index].state; },
      pushState(state, _title, url) {
        if (options.throwPush) throw new Error("No push");
        entries.splice(index + 1); entries.push({ state: clone(state), url }); index += 1;
      },
      replaceState(state, _title, url) { entries[index] = { state: clone(state), url }; },
      back() { if (options.throwBack) throw new Error("No traversal"); queue.push(-1); },
      forward() { queue.push(1); },
    },
    addEventListener(_name, fn) { listeners.add(fn); },
    removeEventListener(_name, fn) { listeners.delete(fn); },
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const controller = createCollectionSetsNavigation({ target, resolve: (selection) => permitted.get(selection?.id) || null, onChange: (selection) => changes.push(selection) });
  return {
    target, controller, permitted, changes, entries, listeners, baseline,
    flush() { const next = index + queue.shift(); if (next >= 0 && next < entries.length) { index = next; for (const fn of listeners) fn(); } },
    expire() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((fn) => fn()); },
    get index() { return index; },
  };
}

check("History contains opaque tokens and preserves unrelated navigation state", () => {
  const f = fixture(); f.controller.open({ id: "set" });
  const { [marker]: token, ...rest } = f.target.history.state;
  assert.equal(typeof token, "string"); assert.deepEqual(rest, f.baseline);
  assert.ok(!JSON.stringify(f.target.history.state).includes("Private"));
  assert.deepEqual(f.entries[0].state, f.baseline);
});
check("Nested item Back returns to set, second Back to list, Forward restores each", () => {
  const f = fixture(); f.controller.open({ id: "set" }); f.controller.open({ id: "item" });
  f.controller.back({ id: "set" }); assert.equal(f.changes.at(-1).id, "item"); f.flush();
  assert.equal(f.changes.at(-1).id, "set"); f.controller.back(); f.flush(); assert.equal(f.changes.at(-1), null);
  f.target.history.forward(); f.flush(); assert.equal(f.changes.at(-1).id, "set");
  f.target.history.forward(); f.flush(); assert.equal(f.changes.at(-1).id, "item");
});
check("Double Back during pending traversal queues only one action", () => {
  const f = fixture(); f.controller.open({ id: "set" }); assert.equal(f.controller.back(), true); assert.equal(f.controller.back(), false); f.flush();
  assert.equal(f.index, 0); assert.equal(f.changes.at(-1), null);
});
check("Forward resolves current permitted records and rejects removed items", () => {
  const f = fixture(); f.controller.open({ id: "set" }); f.controller.open({ id: "item" }); f.controller.back(); f.flush(); f.permitted.delete("item");
  f.target.history.forward(); f.flush(); assert.equal(f.changes.at(-1), null); assert.equal(f.target.history.state[marker], undefined);
});
check("Unknown selections never create a history entry or reveal a record", () => {
  const f = fixture(); assert.equal(f.controller.open({ id: "another-account" }), false); assert.equal(f.index, 0); assert.equal(f.changes.length, 0);
});
check("Reload strips only stale own token, without restoring private records", () => {
  const f = fixture({ state: { [marker]: "old-instance" } });
  assert.equal(f.target.history.state[marker], undefined); assert.equal(f.target.history.state.code3ScoutReportDetails, "separate-report"); assert.equal(f.changes.length, 0);
});
check("Failed traversal expires to safe fallback and removes the owned token", () => {
  const f = fixture(); f.controller.open({ id: "set" }); f.controller.open({ id: "item" }); f.controller.back({ id: "set" }); f.expire();
  assert.equal(f.changes.at(-1).id, "set"); assert.equal(f.target.history.state[marker], undefined);
});
check("Pending timeout cannot restore detail over a new route", () => {
  const f = fixture(); f.controller.open({ id: "set" }); f.controller.back();
  f.target.history.pushState({ appRoute: "another-page" }, "", "http://127.0.0.1:5271/settings"); const count = f.changes.length; f.expire();
  assert.equal(f.changes.length, count); assert.deepEqual(f.target.history.state, { appRoute: "another-page" });
});
check("Pending timeout preserves a foreign same-route state carrying the old token", () => {
  const f = fixture(); f.controller.open({ id: "set" }); f.controller.back();
  const state = { ...f.target.history.state, anotherModal: true }; f.target.history.pushState(state, "", f.target.location.href);
  const count = f.changes.length; f.expire(); assert.equal(f.changes.length, count); assert.deepEqual(f.target.history.state, state);
});
check("Thrown traversal removes only owned frame and restores safe fallback", () => {
  const f = fixture({ throwBack: true }); f.controller.open({ id: "set" }); f.controller.open({ id: "item" }); f.controller.back({ id: "set" });
  assert.equal(f.changes.at(-1).id, "set"); assert.equal(f.target.history.state[marker], undefined); assert.equal(f.target.history.state.code3ScoutReportDetails, "separate-report");
});
check("Rejected push leaves UI and browser navigation unchanged", () => {
  const f = fixture({ throwPush: true }); assert.equal(f.controller.open({ id: "set" }), false); assert.equal(f.changes.length, 0); assert.deepEqual(f.target.history.state, f.baseline);
});
check("Destroy removes listener and token, preserves separate state, and disables callbacks", () => {
  const f = fixture(); f.controller.open({ id: "set" }); f.controller.back(); f.controller.destroy(); const count = f.changes.length; f.expire();
  assert.equal(f.listeners.size, 0); assert.equal(f.target.history.state[marker], undefined); assert.equal(f.target.history.state.code3ScoutReportDetails, "separate-report");
  assert.equal(f.controller.open({ id: "item" }), false); f.flush(); assert.equal(f.changes.length, count);
});
console.log(`${results.length} collection set navigation checks passed`);
