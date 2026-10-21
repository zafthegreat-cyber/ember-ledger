const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { chromium } = require("@playwright/test");

// Disposable browser context only. Every request is fulfilled locally; no real
// app, account, Supabase project, or existing browser storage is accessed.
const origin = "http://127.0.0.1:5299";
(async () => {
  const modules = new Map(["persistence/workspacePayloadStore.js","ebayPrivacy/privacyArchives.js","ebayPrivacy/privacyPolicy.js","ebayPrivacy/identityHash.js","backup/canonicalJson.js"].map((name) => [`/src/features/${name}`,readFileSync(`src/features/${name}`,"utf8")]));
  const browser = await chromium.launch({ headless: true });
  let checks = 0;
  try {
    const context = await browser.newContext();
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (modules.has(url.pathname)) return route.fulfill({ contentType: "text/javascript", body: modules.get(url.pathname) });
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><title>Disposable payload tests</title><script type="module">window.payloadModule = await import("/src/features/persistence/workspacePayloadStore.js");</script>' });
    });
    const page = await context.newPage();
    async function run(name, test) { const result = await page.evaluate(test); assert.equal(result, true); checks++; process.stdout.write(`PASS ${name}\n`); }
    await page.goto(origin); await page.waitForFunction(() => window.payloadModule);
    await run("native IndexedDB exact-byte put waits for commit and fresh transaction readback", async () => {
      const { createWorkspacePayloadStore } = window.payloadModule;
      const original = IDBDatabase.prototype.transaction;
      const events = [];
      IDBDatabase.prototype.transaction = function (...args) {
        const tx = original.apply(this, args);
        events.push(`start:${args[1]}`); tx.addEventListener("complete", () => events.push(`complete:${args[1]}`));
        return tx;
      };
      try {
        const raw = ' \n{"records":[{"id":"unchanged","notes":"漢字 🔥 \\n"}]}\n';
        const store = createWorkspacePayloadStore(); await store.put("native-roundtrip", raw); events.push("resolved");
        window.expectedRaw = raw;
        if (JSON.stringify(events) !== JSON.stringify(["start:readwrite", "complete:readwrite", "start:readonly", "complete:readonly", "resolved"])) throw new Error(JSON.stringify(events));
        return await store.get("native-roundtrip") === raw;
      } finally { IDBDatabase.prototype.transaction = original; }
    });
    const expected = await page.evaluate(() => window.expectedRaw);
    await page.reload(); await page.waitForFunction(() => window.payloadModule);
    assert.equal(await page.evaluate(() => window.payloadModule.createWorkspacePayloadStore().get("native-roundtrip")), expected);
    checks++; process.stdout.write("PASS native immutable payload survives page reload\n");
    await run("same-key identical writes succeed while differing writes cannot overwrite", async () => {
      const store = window.payloadModule.createWorkspacePayloadStore();
      await store.put("immutable", "first"); await store.put("immutable", "first");
      let code; try { await store.put("immutable", "different"); } catch (error) { code = error.code; }
      return code === "PAYLOAD_IMMUTABLE_CONFLICT" && await store.get("immutable") === "first";
    });
    await run("corrupt fresh-transaction readback rejects despite completed native write", async () => {
      const original = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        const tx = original.apply(this, args);
        if (args[1] === "readonly") {
          const originalStore = tx.objectStore.bind(tx);
          tx.objectStore = (name) => {
            const store = originalStore(name); const originalGet = store.get.bind(store);
            store.get = (key) => { const request = originalGet(key); Object.defineProperty(request, "result", { get: () => "corrupt readback" }); return request; };
            return store;
          };
        }
        return tx;
      };
      let code;
      try { await window.payloadModule.createWorkspacePayloadStore().put("readback-fault", "correct original"); } catch (error) { code = error.code; }
      finally { IDBDatabase.prototype.transaction = original; }
      return code === "PAYLOAD_READBACK_FAILED" && await window.payloadModule.createWorkspacePayloadStore().get("readback-fault") === "correct original";
    });
    await run("stalled opening is bounded and late connections are closed", async () => {
      let request; let closed = false;
      const indexedDB = { open() { return request = {}; } };
      let code;
      try { await window.payloadModule.createWorkspacePayloadStore({ indexedDB, timeoutMs: 20 }).get("timeout"); } catch (error) { code = error.code; }
      request.result = { close() { closed = true; } }; request.onsuccess();
      return code === "PAYLOAD_STORE_TIMEOUT" && closed;
    });
    await run("stalled transaction aborts and cannot report success", async () => {
      let aborted = false; let closed = false;
      const transaction = { objectStore() { return { get() { return {}; } }; }, abort() { aborted = true; this.onabort?.(); } };
      const indexedDB = { open() { const request = {}; setTimeout(() => { request.result = { transaction() { return transaction; }, close() { closed = true; } }; request.onsuccess(); }, 0); return request; } };
      let code;
      try { await window.payloadModule.createWorkspacePayloadStore({ indexedDB, timeoutMs: 20 }).get("timeout"); } catch (error) { code = error.code; }
      return code === "PAYLOAD_STORE_TIMEOUT" && aborted && closed;
    });
    await run("native blocked upgrade fails safely and does not leave a late connection", async () => {
      const { WORKSPACE_PAYLOAD_DATABASE, createWorkspacePayloadStore } = window.payloadModule;
      const held = await new Promise((resolve, reject) => { const request = indexedDB.open(WORKSPACE_PAYLOAD_DATABASE, 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      let code;
      try { await createWorkspacePayloadStore({ indexedDB: { open: (name) => indexedDB.open(name, 2) }, timeoutMs: 1000 }).get("blocked"); } catch (error) { code = error.code; }
      held.close();
      // This queues behind the refused upgrade. Its late upgrade handler aborts,
      // leaving the database version and original immutable bytes unchanged.
      return code === "PAYLOAD_STORE_BLOCKED" && await createWorkspacePayloadStore().get("immutable") === "first";
    });
    await run("throwing IndexedDB getter returns a controlled unavailable error", async () => {
      const descriptor = Object.getOwnPropertyDescriptor(window, "indexedDB");
      Object.defineProperty(window, "indexedDB", { configurable: true, get() { throw new DOMException("Unavailable", "SecurityError"); } });
      let code;
      try { await window.payloadModule.createWorkspacePayloadStore().get("blocked-getter"); } catch (error) { code = error.code; }
      finally { if (descriptor) Object.defineProperty(window, "indexedDB", descriptor); else delete window.indexedDB; }
      return code === "PAYLOAD_STORE_UNAVAILABLE";
    });
    await run("identity change before native write aborts without creating payload", async () => {
      let calls = 0; const store = window.payloadModule.createWorkspacePayloadStore(); let code;
      try { await store.put("cancelled", "never publish", { assertCurrent() { if (++calls > 2) throw Object.assign(new Error("Account changed"), { code: "SESSION_CHANGED" }); } }); } catch (error) { code = error.code; }
      return code === "SESSION_CHANGED" && await store.get("cancelled") === null;
    });
    await context.close();
    process.stdout.write(`Verified ${checks} native payload transaction, reload, failure, and lifecycle checks.\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
