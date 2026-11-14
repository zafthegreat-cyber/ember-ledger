import test from "node:test";
import assert from "node:assert/strict";
import { catalogTiltFromOrientation, createCatalogMotionController } from "../src/utils/catalogMotion.mjs";

function fixture({ coarse = true, reduced = false, permission, supported = true } = {}) {
  class TrackedTarget extends EventTarget {
    listeners = new Map();
    addEventListener(type, callback, options) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); super.addEventListener(type, callback, options); }
    removeEventListener(type, callback, options) { this.listeners.get(type)?.delete(callback); super.removeEventListener(type, callback, options); }
    count(type) { return this.listeners.get(type)?.size || 0; }
  }
  const target = new TrackedTarget(), page = new TrackedTarget(), frames = new Map(); let sequence = 0, permissionCalls = 0;
  const media = Object.fromEntries([["(any-pointer: coarse)", coarse], ["(prefers-reduced-motion: reduce)", reduced]].map(([query, matches]) => { const eventTarget = new TrackedTarget(); eventTarget.matches = matches; return [query, eventTarget]; }));
  target.document = page; page.hidden = false; target.matchMedia = query => media[query];
  target.screen = { orientation: new TrackedTarget() }; target.screen.orientation.angle = 0;
  target.requestAnimationFrame = callback => { frames.set(++sequence, callback); return sequence; }; target.cancelAnimationFrame = id => frames.delete(id);
  if (supported) target.DeviceOrientationEvent = function DeviceOrientationEvent() {};
  if (permission) target.DeviceOrientationEvent.requestPermission = () => { permissionCalls++; return permission(); };
  const emit = (beta, gamma) => { const event = new Event("deviceorientation"); Object.assign(event, { beta, gamma }); target.dispatchEvent(event); };
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  const changeMedia = (query, value) => { media[query].matches = value; media[query].dispatchEvent(new Event("change")); };
  return { target, page, frames, media, emit, flush, changeMedia, permissionCalls: () => permissionCalls, controller: createCatalogMotionController({ window: target, document: page }) };
}

test("phone tilt calibrates relative angles, stays within8degrees and maps both landscape orientations", () => {
  const base = { beta: 45, gamma: 5 };
  assert.deepEqual(catalogTiltFromOrientation(base, base), { pitch: 0, yaw: 0, x: 0, y: 0 });
  assert.deepEqual(catalogTiltFromOrientation({ beta: 73, gamma: 33 }, base), { pitch: -8, yaw: 8, x: 1, y: 1 });
  assert.deepEqual(catalogTiltFromOrientation({ beta: 73, gamma: 5 }, base, 90), { pitch: 0, yaw: 8, x: 1, y: 0 });
  assert.deepEqual(catalogTiltFromOrientation({ beta: 73, gamma: 5 }, base, 270), { pitch: 0, yaw: -8, x: -1, y: 0 });
  assert.equal(catalogTiltFromOrientation({ beta: -179, gamma: 0 }, { beta: 179, gamma: 0 }).pitch, -.571);
  for (const bad of [null, undefined, NaN, Infinity, "5"]) assert.equal(catalogTiltFromOrientation({ beta: bad, gamma: 0 }, base), null);
});

test("many item consumers share one sensor listener and one queued frame, delivering the latest valid sample", () => {
  const f = fixture(), poses = [], cleanups = [];
  for (let i = 0; i < 150; i++) cleanups.push(f.controller.subscribeTilt(pose => { if (i === 0) poses.push(pose); }));
  assert.equal(f.target.count("deviceorientation"), 1);
  f.emit(40, 0); f.flush(); assert.deepEqual(poses.at(-1), { pitch: 0, yaw: 0, x: 0, y: 0 });
  f.emit(40, 14); f.emit(68, 28); f.emit(null, null);
  assert.equal(f.frames.size, 1); f.flush();
  assert.deepEqual(poses.at(-1), { pitch: -8, yaw: 8, x: 1, y: 1 });
  cleanups.slice(0, 149).forEach(fn => fn()); assert.equal(f.target.count("deviceorientation"), 1);
  f.emit(50, 20); cleanups[149]();
  assert.equal(f.target.count("deviceorientation"), 0); assert.equal(f.frames.size, 0);
  assert.equal(f.target.count("orientationchange"), 0); assert.equal(f.page.count("visibilitychange"), 0);
});

test("hidden pages and screen orientation changes reset the baseline and do not jump on return", () => {
  const f = fixture(), poses = []; const cleanup = f.controller.subscribeTilt(pose => poses.push(pose));
  f.emit(40, 0); f.flush(); f.emit(40, 28); f.flush(); assert.equal(poses.at(-1).yaw, 8);
  f.page.hidden = true; f.page.dispatchEvent(new Event("visibilitychange"));
  assert.equal(f.target.count("deviceorientation"), 0); assert.equal(f.controller.getState().status, "paused"); assert.equal(poses.at(-1).yaw, 0);
  f.page.hidden = false; f.page.dispatchEvent(new Event("visibilitychange"));
  f.emit(95, -20); f.flush(); assert.equal(poses.at(-1).yaw, 0);
  f.target.screen.orientation.angle = 90; f.target.screen.orientation.dispatchEvent(new Event("change"));
  f.emit(70, 0); f.flush(); f.emit(98, 0); f.flush(); assert.equal(poses.at(-1).yaw, 8);
  cleanup();
});

test("reduced motion and the shared off switch cancel motion immediately, with no storage writes", () => {
  const f = fixture(), poses = [], states = [];
  Object.defineProperty(f.target, "localStorage", { get() { throw new Error("Motion must never persist"); } });
  const stopState = f.controller.subscribeState(state => states.push(state));
  assert.equal(f.target.count("deviceorientation"), 0, "mounting only the control does not start sensors");
  const cleanup = f.controller.subscribeTilt(pose => poses.push(pose));
  f.emit(30, 0); f.flush(); f.emit(30, 28); f.flush();
  f.changeMedia("(prefers-reduced-motion: reduce)", true);
  assert.equal(f.controller.getState().status, "reduced-motion"); assert.equal(f.target.count("deviceorientation"), 0); assert.equal(poses.at(-1).yaw, 0);
  f.changeMedia("(prefers-reduced-motion: reduce)", false); assert.equal(f.target.count("deviceorientation"), 1);
  f.controller.setEnabled(false); assert.equal(states.at(-1).status, "off"); assert.equal(f.target.count("deviceorientation"), 0);
  cleanup(); stopState();
  assert.equal(f.media["(prefers-reduced-motion: reduce)"].count("change"), 0);
});

test("iOS permission is requested only by an explicit action, denied access is graceful, and retry attaches one listener", async () => {
  let result = "denied"; const f = fixture({ permission: async () => result }); const cleanup = f.controller.subscribeTilt(() => {});
  assert.equal(f.permissionCalls(), 0); assert.equal(f.target.count("deviceorientation"), 0);
  assert.equal(f.controller.getState().status, "permission-required");
  await f.controller.requestPermission(); assert.equal(f.permissionCalls(), 1); assert.equal(f.controller.getState().status, "denied"); assert.equal(f.target.count("deviceorientation"), 0);
  result = "granted"; await f.controller.requestPermission();
  assert.equal(f.target.count("deviceorientation"), 1); assert.equal(f.controller.getState().status, "ready");
  await f.controller.requestPermission(); assert.equal(f.permissionCalls(), 2, "already granted permission is not requested again");
  cleanup();
});

test("pending permission cannot attach a listener after its last consumer unmounts", async () => {
  let resolve; const f = fixture({ permission: () => new Promise(done => { resolve = done; }) });
  const cleanup = f.controller.subscribeTilt(() => {}), pending = f.controller.requestPermission();
  assert.equal(f.controller.getState().status, "requesting");
  cleanup(); resolve("granted"); await pending;
  assert.equal(f.target.count("deviceorientation"), 0); assert.equal(f.frames.size, 0);
});

test("unsupported desktops, absent sensor APIs, reduced-motion preference and rejected permission never activate sensors", async () => {
  for (const options of [{ coarse: false }, { supported: false }, { reduced: true }]) {
    const f = fixture(options); const cleanup = f.controller.subscribeTilt(() => {}); await f.controller.requestPermission();
    assert.equal(f.target.count("deviceorientation"), 0); cleanup();
  }
  const f = fixture({ permission: async () => { throw new Error("Denied"); } });
  const cleanup = f.controller.subscribeTilt(() => {}); await f.controller.requestPermission();
  assert.equal(f.controller.getState().status, "denied"); assert.equal(f.target.count("deviceorientation"), 0); cleanup();
});
