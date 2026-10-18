import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Mock only Capacitor's native bridge. Product modules execute unchanged.
const mocked = {
  "@capacitor/app": 'export const App = { addListener: (...args) => globalThis.__nativeApp.addListener(...args), getLaunchUrl: (...args) => globalThis.__nativeApp.getLaunchUrl(...args), minimizeApp: (...args) => globalThis.__nativeApp.minimizeApp(...args) };',
  "@capacitor/core": 'export const registerPlugin = name => { if (name !== "SecureSession") throw new Error("unexpected plugin"); return { get: (...args) => globalThis.__secureSession.get(...args), set: (...args) => globalThis.__secureSession.set(...args), remove: (...args) => globalThis.__secureSession.remove(...args) }; };',
  "@capacitor/filesystem": 'export const Directory = { Cache: "CACHE" }; export const Filesystem = { writeFile: (...args) => globalThis.__nativeFiles.writeFile(...args), deleteFile: (...args) => globalThis.__nativeFiles.deleteFile(...args) };',
  "@capacitor/share": 'export const Share = { share: (...args) => globalThis.__nativeFiles.share(...args) };',
};
const hooks = registerHooks({ resolve(specifier, context, next) { return mocked[specifier] ? { url: `code3-test:${specifier}`, shortCircuit: true } : next(specifier, context); }, load(url, context, next) { const source = mocked[url.replace("code3-test:", "")]; return source ? { source, format: "module", shortCircuit: true } : next(url, context); } });
const runtime = await import("../src/native/nativeRuntime.js");
const { startNativeLifecycle } = await import("../src/native/nativeLifecycle.js");
const { nativeSessionStorage } = await import("../src/native/nativeSessionStorage.js");
const { exportFile, safeExportFilename } = await import("../src/native/nativeFiles.js");
const code = "synthetic_pkce_code_1234567890";
const callback = `code3tcg://auth/callback?code=${code}&flow=recovery`;
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
let checks = 0;
async function check(name, test) { await test(); checks++; console.log(`PASS ${name}`); }

function host({ launch = null, addGate, addFailure, launchFailure } = {}) {
  const listeners = new Map(); const removed = []; const states = { registrations: 0, launchReads: 0, minimized: 0, historyBack: 0, routes: [], dispatched: [] };
  const app = {
    async addListener(name, fn) { states.registrations++; if (addGate) await addGate; if (name === addFailure) throw new Error("native registration unavailable"); if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); return { async remove() { removed.push(name); listeners.get(name).delete(fn); } }; },
    async getLaunchUrl() { states.launchReads++; if (launchFailure) throw new Error("launch unavailable"); return launch ? { url: launch } : undefined; },
    minimizeApp() { states.minimized++; },
  };
  globalThis.__nativeApp = app;
  globalThis.Capacitor = { isNativePlatform: () => true };
  globalThis.window = { dispatchEvent: event => { states.dispatched.push(event.type); return true; } };
  globalThis.document = { querySelectorAll: () => [], activeElement: null };
  globalThis.history = { length: 2, back() { states.historyBack++; }, replaceState(_state, _title, path) { states.routes.push(path); } };
  globalThis.KeyboardEvent = class extends Event { constructor(type, options) { super(type, options); this.key = options.key; } };
  globalThis.PopStateEvent = class extends Event {};
  let exchanges = 0; let starts = 0; let stops = 0;
  const client = { auth: { async exchangeCodeForSession(received) { assert.equal(received, code); exchanges++; return { data: {}, error: null }; }, startAutoRefresh() { starts++; }, stopAutoRefresh() { stops++; } } };
  return { client, states, removed, listeners, counts: () => ({ exchanges, starts, stops }), emit: async (name, payload) => Promise.all([...(listeners.get(name) || [])].map(fn => fn(payload))) };
}

try {
await check("native API destination is exact HTTPS production and web configuration stays unchanged", () => {
  assert.equal(runtime.resolveApiBase({ native: true }), "https://code3tcg.app");
  assert.equal(runtime.resolveApiBase({ native: true, configured: "https://code3tcg.app/" }), "https://code3tcg.app");
  assert.equal(runtime.resolveApiBase({ native: false, configured: "http://127.0.0.1:3000/" }), "http://127.0.0.1:3000");
  for (const configured of ["http://code3tcg.app", "https://code3tcg.app.evil.test", "https://evil.test", "//code3tcg.app", "https://code3tcg.app/api"]) assert.throws(() => runtime.resolveApiBase({ native: true, configured }), /destination/);
});
await check("native page trust requires bridge and exact bundled origin", () => {
  for (const url of ["capacitor://localhost/", "https://localhost/settings"]) assert.equal(runtime.isTrustedNativeOrigin(url, true), true);
  for (const url of ["capacitor://evil/", "https://localhost:4430", "https://user@localhost", "null", "http://localhost", "https://code3tcg.app", "file:///bundle/index.html"]) assert.equal(runtime.isTrustedNativeOrigin(url, true), false);
  assert.equal(runtime.isTrustedNativeOrigin("capacitor://localhost/", false), false);
});
await check("only bounded PKCE callbacks are accepted; token fragments, foreign hosts and duplicate parameters fail", () => {
  assert.deepEqual(runtime.parseNativeAuthCallback(callback), { code, flow: "recovery", error: false });
  assert.equal(runtime.getNativeAuthRedirect("signin"), "code3tcg://auth/callback?flow=signin");
  assert.throws(() => runtime.getNativeAuthRedirect("delete"));
  for (const url of [callback + "#access_token=secret", callback + "&code=another", callback + "&access_token=secret", callback.replace("auth/", "evil/"), callback.replace("code3tcg:", "https:"), callback.replace("callback", "other"), "code3tcg://auth/callback?code=short", callback.replace("recovery", "delete"), "code3tcg://user@auth/callback?code=" + code]) assert.equal(runtime.parseNativeAuthCallback(url), null);
});
await check("web startup never installs native listeners or changes auth state", async () => {
  const fixture = host(); globalThis.Capacitor.isNativePlatform = () => false;
  const stop = await startNativeLifecycle({ client: fixture.client }); stop(); assert.equal(fixture.states.registrations, 0); assert.deepEqual(fixture.counts(), { exchanges: 0, starts: 0, stops: 0 });
});
await check("lifecycle refresh follows foreground/background and cleanup is idempotent", async () => {
  const fixture = host(); const stop = await startNativeLifecycle({ client: fixture.client });
  assert.equal(fixture.states.registrations, 3); assert.equal(fixture.counts().starts, 1);
  await fixture.emit("appStateChange", { isActive: false }); await fixture.emit("appStateChange", { isActive: true });
  assert.equal(fixture.counts().starts, 2); assert.equal(fixture.counts().stops, 1); assert.deepEqual(fixture.states.dispatched, ["focus"]);
  stop(); stop(); assert.equal(fixture.removed.length, 3); assert.equal(fixture.counts().stops, 2);
});
await check("Android Back starts Escape on focused visible dialog control, not window", async () => {
  const fixture = host(); const events = [];
  const control = { dispatchEvent(event) { events.push({ key: event.key, bubbles: event.bubbles, cancelable: event.cancelable }); } };
  const dialog = { getClientRects: () => [{}], getAttribute: () => null, contains: node => node === control };
  const hidden = { getClientRects: () => [], getAttribute: () => null, contains: () => false };
  document.querySelectorAll = () => [dialog, hidden]; document.activeElement = control;
  const stop = await startNativeLifecycle({ client: fixture.client }); await fixture.emit("backButton", { canGoBack: true });
  assert.deepEqual(events, [{ key: "Escape", bubbles: true, cancelable: true }]); assert.equal(fixture.states.historyBack, 0); assert.deepEqual(fixture.states.dispatched, []); stop();
});
await check("Android Back uses existing history then minimizes without clearing unsaved records", async () => {
  const fixture = host(); const stop = await startNativeLifecycle({ client: fixture.client });
  await fixture.emit("backButton", { canGoBack: true }); assert.equal(fixture.states.historyBack, 1);
  await fixture.emit("backButton", { canGoBack: false }); assert.equal(fixture.states.minimized, 1); stop();
});
await check("cold start PKCE exchange runs once, returns to reset route, duplicate delivery does not re-exchange", async () => {
  const fixture = host({ launch: callback }); const stop = await startNativeLifecycle({ client: fixture.client });
  await fixture.emit("appUrlOpen", { url: callback }); assert.equal(fixture.counts().exchanges, 1); assert.deepEqual(fixture.states.routes, ["/reset-password"]); stop();
});
await check("StrictMode abort before async setup never exchanges the launch code", async () => {
  const fixture = host({ launch: callback }); const controller = new AbortController();
  const pending = startNativeLifecycle({ client: fixture.client, signal: controller.signal }); controller.abort(); await pending;
  assert.equal(fixture.states.registrations, 0); assert.equal(fixture.counts().exchanges, 0);
});
await check("aborting pending listener registration cleans every late listener and skips cold-start sign-in", async () => {
  const gate = deferred(); const fixture = host({ launch: callback, addGate: gate.promise }); const controller = new AbortController();
  const pending = startNativeLifecycle({ client: fixture.client, signal: controller.signal }); await tick(); controller.abort(); gate.resolve(); await pending;
  assert.equal(fixture.removed.length, 3); assert.equal(fixture.states.launchReads, 0); assert.equal(fixture.counts().exchanges, 0);
});
await check("overlapping remount shares one in-flight exchange and only the current lifecycle navigates", async () => {
  const fixture = host({ launch: callback }); const gate = deferred(); let exchanges = 0;
  fixture.client.auth.exchangeCodeForSession = async () => { exchanges++; await gate.promise; return { error: null }; };
  const controller = new AbortController(); const first = startNativeLifecycle({ client: fixture.client, signal: controller.signal }); await tick(); controller.abort();
  const second = startNativeLifecycle({ client: fixture.client }); await tick(); gate.resolve(); const [stopFirst, stopSecond] = await Promise.all([first, second]);
  assert.equal(exchanges, 1); assert.deepEqual(fixture.states.routes, ["/reset-password"]); stopFirst(); stopSecond();
});
await check("partial registration and launch failures clean listeners before reporting startup failure", async () => {
  for (const configuration of [{ addFailure: "backButton" }, { launchFailure: true }]) {
    const fixture = host(configuration); await assert.rejects(startNativeLifecycle({ client: fixture.client })); await tick();
    assert.equal([...fixture.listeners.values()].reduce((sum, entries) => sum + entries.size, 0), 0);
  }
});
await check("invalid or failed callback never exposes provider details or navigates", async () => {
  const fixture = host(); const notices = [];
  fixture.client.auth.exchangeCodeForSession = async () => ({ error: { message: "private-provider-response" } });
  const stop = await startNativeLifecycle({ client: fixture.client, onAuthError: value => notices.push(value) });
  await fixture.emit("appUrlOpen", { url: callback }); assert.equal(fixture.states.routes.length, 0); assert.equal(notices.length, 1); assert.ok(!notices[0].includes("private-provider-response")); stop();
});
await check("a thrown provider error cannot leak token or URL details into the native notice", async () => {
  const fixture = host(); const notices = [];
  fixture.client.auth.exchangeCodeForSession = async () => { throw new Error("private-token=synthetic-secret"); };
  const stop = await startNativeLifecycle({ client: fixture.client, onAuthError: value => notices.push(value) });
  await fixture.emit("appUrlOpen", { url: callback }); assert.equal(notices.length, 1); assert.ok(!notices[0].includes("synthetic-secret")); stop();
});
await check("secure session adapter delegates to native plugin and never falls back after native failure", async () => {
  const values = new Map(); globalThis.localStorage = new Proxy({}, { get() { throw new Error("plaintext storage must not be touched"); } });
  globalThis.__secureSession = { get: async ({ key }) => ({ value: values.get(key) }), set: async ({ key, value }) => { values.set(key, value); }, remove: async ({ key }) => { values.delete(key); } };
  assert.equal(await nativeSessionStorage.getItem("missing"), null); await nativeSessionStorage.setItem("sb-fixture-auth-token", "synthetic-session"); assert.equal(await nativeSessionStorage.getItem("sb-fixture-auth-token"), "synthetic-session"); await nativeSessionStorage.removeItem("sb-fixture-auth-token"); assert.equal(values.size, 0);
  __secureSession.set = async () => { throw new Error("native storage unavailable"); };
  await assert.rejects(nativeSessionStorage.setItem("sb-fixture-auth-token", "synthetic"), /native storage unavailable/);
});
await check("native sharing writes private cache only, waits for share and schedules cleanup on success or cancel", async () => {
  const originalTimeout = globalThis.setTimeout; const scheduled = []; const calls = [];
  globalThis.setTimeout = (fn, delay) => { scheduled.push({ fn, delay }); return 1; };
  globalThis.FileReader = class { readAsDataURL(blob) { blob.arrayBuffer().then(bytes => { this.result = `data:application/json;base64,${Buffer.from(bytes).toString("base64")}`; this.onload(); }); } };
  globalThis.Capacitor = { isNativePlatform: () => true };
  globalThis.__nativeFiles = { async writeFile(options) { calls.push(["write", options]); return { uri: "file:///private/cache/synthetic.json" }; }, async share(options) { calls.push(["share", options]); }, async deleteFile(options) { calls.push(["delete", options]); } };
  try {
    await exportFile({ blob: new Blob(['{"synthetic":true}']), filename: "transfer.json" });
    assert.equal(calls[0][1].directory, "CACHE"); assert.ok(calls[0][1].path.startsWith("code3-exports/")); assert.deepEqual(calls[1][1].files, ["file:///private/cache/synthetic.json"]);
    assert.equal(scheduled[0].delay, 60000); await scheduled[0].fn(); assert.equal(calls[2][0], "delete");
    __nativeFiles.share = async () => { throw new Error("cancelled"); };
    await assert.rejects(exportFile({ blob: new Blob(["test"]), filename: "transfer.json" }), /cancelled/); assert.equal(scheduled.length, 2);
    for (const filename of ["../session.json", "/session.json", "a\\b.json", "a..json"]) assert.throws(() => safeExportFilename(filename));
  } finally { globalThis.setTimeout = originalTimeout; }
});
await check("account cancellation before native share removes the prepared cache file without opening sharing", async () => {
  const controller = new AbortController(); const calls = [];
  globalThis.Capacitor = { isNativePlatform: () => true };
  globalThis.__nativeFiles = { async writeFile() { calls.push("write"); controller.abort(); return { uri: "file:///private/cache/synthetic.json" }; }, async share() { calls.push("share"); }, async deleteFile() { calls.push("delete"); } };
  await assert.rejects(exportFile({ blob: new Blob(["synthetic"]), filename: "transfer.json", signal: controller.signal }), { name: "AbortError" });
  assert.deepEqual(calls, ["write", "delete"]);
  calls.length = 0;
  await assert.rejects(exportFile({ blob: new Blob(["synthetic"]), filename: "transfer.json", signal: controller.signal }), { name: "AbortError" });
  assert.deepEqual(calls, []);
});
await check("owner lifetime guard is rechecked after file encoding and no stale account data is shared", async () => {
  let current = true; const calls = [];
  globalThis.FileReader = class { readAsDataURL() { current = false; this.result = "data:application/json;base64,e30="; this.onload(); } };
  globalThis.__nativeFiles = { async writeFile() { calls.push("write"); }, async share() { calls.push("share"); }, async deleteFile() { calls.push("delete"); } };
  await assert.rejects(exportFile({ blob: new Blob(["synthetic"]), filename: "transfer.json", assertCurrent: () => { if (!current) throw new DOMException("Account changed", "AbortError"); } }), { name: "AbortError" });
  assert.deepEqual(calls, []);
});
await check("web backup and diagnostic report exports still create downloadable files without native bridge use", async () => {
  const originalTimeout = globalThis.setTimeout; const createURL = URL.createObjectURL; const revokeURL = URL.revokeObjectURL;
  const calls = []; const blobs = [];
  globalThis.Capacitor = { isNativePlatform: () => false };
  globalThis.document = { body: { appendChild: node => calls.push(["append", node]) }, createElement: () => ({ click() { calls.push(["click", this.download]); }, remove() { calls.push(["remove"]); } }) };
  URL.createObjectURL = blob => { blobs.push(blob); return "blob:synthetic"; }; URL.revokeObjectURL = url => calls.push(["revoke", url]);
  globalThis.setTimeout = fn => { fn(); return 1; };
  try {
    assert.deepEqual(await exportFile({ blob: new Blob(['{"fixture":true}']), filename: "backup.json" }), { shared: false });
    const { downloadBackupReviewReport, createBackupReviewReport } = await import("../src/features/backup/reviewPresentation.js");
    await downloadBackupReviewReport(createBackupReviewReport({ kind: "restore-preview", result: { errors: ["Synthetic finding"] } }));
    assert.equal(JSON.parse(await blobs[0].text()).fixture, true);
    assert.equal(JSON.parse(await blobs[1].text()).format, "code3.backup-review-report");
    assert.deepEqual(calls.filter(([name]) => name === "click").map(([, name]) => name), ["backup.json", "code-3-restore-preview-review.json"]);
    assert.equal(calls.filter(([name]) => name === "revoke").length, 2);
  } finally { globalThis.setTimeout = originalTimeout; URL.createObjectURL = createURL; URL.revokeObjectURL = revokeURL; }
});
console.log(`Native runtime: ${checks} behavior scenarios passed with mocked OS bridges. Hardware cryptography, native compilation, device dialogs, and real account links still require device verification.`);
} finally { hooks.deregister(); }
