// Audit 2026-11-14: whole-store saves are debounced and flushed on page hide.
import assert from "node:assert/strict";
import { createDebouncedSaver, flushSaverOnPageHide } from "../src/utils/debouncedSave.js";

const timers = [];
const fake = { setTimer: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length - 1; }, clearTimer: (id) => { if (timers[id]) timers[id].live = false; } };
const runTimers = () => timers.filter((t) => t.live).forEach((t) => { t.live = false; t.fn(); });

const writes = [];
const saver = createDebouncedSaver(400, fake);
for (let i = 1; i <= 20; i += 1) saver.schedule(() => writes.push(i)); // 20 keystrokes
assert.equal(writes.length, 0, "nothing is written while typing");
runTimers();
assert.deepEqual(writes, [20], "one write, with the newest data");

saver.schedule(() => writes.push("latest"));
saver.flush();
assert.deepEqual(writes, [20, "latest"], "flush writes immediately");
saver.flush();
assert.equal(writes.length, 2, "flush with nothing pending does nothing");

// pagehide / visibilitychange flush
const listeners = {};
const doc = { visibilityState: "visible", addEventListener: (n, f) => { listeners[n] = f; }, removeEventListener: () => {} };
const win = { document: doc, addEventListener: (n, f) => { listeners[n] = f; }, removeEventListener: () => {} };
const saver2 = createDebouncedSaver(400, fake);
const cleanup = flushSaverOnPageHide(saver2, win);
saver2.schedule(() => writes.push("hidden"));
doc.visibilityState = "hidden"; listeners.visibilitychange();
assert.equal(writes.at(-1), "hidden", "hiding the page flushes");
saver2.schedule(() => writes.push("closing"));
listeners.pagehide();
assert.equal(writes.at(-1), "closing", "closing the page flushes");
saver2.schedule(() => writes.push("unmount"));
cleanup();
assert.equal(writes.at(-1), "unmount", "cleanup flushes");
console.log("Debounced save checks passed.");
