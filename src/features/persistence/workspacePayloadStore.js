export const WORKSPACE_PAYLOAD_DATABASE = "code3-workspace-safety-v1";
export const WORKSPACE_PAYLOAD_OBJECT_STORE = "payloads";

export class WorkspacePayloadError extends Error {
  constructor(code, message) { super(message); this.name = "WorkspacePayloadError"; this.code = code; }
}
function fail(code, message) { return new WorkspacePayloadError(code, message); }
function unavailable() { return fail("PAYLOAD_STORE_UNAVAILABLE", "This browser could not preserve its safety copy. Existing records are unchanged."); }
function checkKey(key) {
  if (typeof key !== "string" || !key.length || key.length > 256 || [...key].some((character) => character.charCodeAt(0) < 32)) throw unavailable();
}

/** Immutable device-only payloads. No delete or automatic cleanup API exists. */
export function createWorkspacePayloadStore({ indexedDB: providedIndexedDB, timeoutMs = 15000 } = {}) {
  function open() {
    let indexedDB;
    try { indexedDB = providedIndexedDB === undefined ? globalThis.indexedDB : providedIndexedDB; }
    catch { return Promise.reject(unavailable()); }
    if (!indexedDB?.open) return Promise.reject(unavailable());
    return new Promise((resolve, reject) => {
      let settled = false;
      let request;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { request?.transaction?.abort(); } catch { /* A pending open cannot always be cancelled. */ }
        reject(fail("PAYLOAD_STORE_TIMEOUT", "The browser safety store did not respond. Existing records are unchanged."));
      }, timeoutMs);
      function refused(error) { if (!settled) { settled = true; clearTimeout(timer); reject(error); } }
      try { request = indexedDB.open(WORKSPACE_PAYLOAD_DATABASE, 1); }
      catch { refused(unavailable()); return; }
      request.onupgradeneeded = () => {
        if (settled) { request.transaction?.abort(); return; }
        if (!request.result.objectStoreNames.contains(WORKSPACE_PAYLOAD_OBJECT_STORE)) request.result.createObjectStore(WORKSPACE_PAYLOAD_OBJECT_STORE);
      };
      request.onerror = () => refused(unavailable());
      request.onblocked = () => refused(fail("PAYLOAD_STORE_BLOCKED", "Close other app tabs and retry the safety copy. Existing records are unchanged."));
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        settled = true; clearTimeout(timer);
        db.onversionchange = () => db.close();
        resolve(db);
      };
    });
  }

  function transact(db, key, raw, assertCurrent) {
    return new Promise((resolve, reject) => {
      let transaction;
      let result = null;
      let failure;
      let settled = false;
      const mode = raw === undefined ? "readonly" : "readwrite";
      try {
        try { transaction = db.transaction(WORKSPACE_PAYLOAD_OBJECT_STORE, mode, mode === "readwrite" ? { durability: "strict" } : undefined); }
        catch (error) {
          if (!["TypeError", "NotSupportedError"].includes(error?.name)) throw error;
          transaction = db.transaction(WORKSPACE_PAYLOAD_OBJECT_STORE, mode);
        }
      } catch { reject(unavailable()); return; }
      function finish(error) {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (error) reject(error); else resolve(result);
      }
      const timer = setTimeout(() => {
        failure = fail("PAYLOAD_STORE_TIMEOUT", "The browser safety copy did not finish. Existing records are unchanged.");
        try { transaction.abort(); } catch { /* The completion handler may already be queued. */ }
        finish(failure);
      }, timeoutMs);
      transaction.oncomplete = () => finish();
      transaction.onabort = () => finish(failure || unavailable());
      transaction.onerror = () => finish(failure || unavailable());
      try {
        const objectStore = transaction.objectStore(WORKSPACE_PAYLOAD_OBJECT_STORE);
        const request = objectStore.get(key);
        request.onsuccess = () => {
          try {
            result = request.result === undefined ? null : request.result;
            if (result !== null && typeof result !== "string") throw unavailable();
            if (raw !== undefined) {
              assertCurrent();
              if (result !== null && result !== raw) throw fail("PAYLOAD_IMMUTABLE_CONFLICT", "An existing safety copy differs from this record. It was not replaced.");
              if (result === null) objectStore.put(raw, key);
            }
          } catch (error) { failure = error; try { transaction.abort(); } catch { finish(error); } }
        };
      } catch (error) { failure = error; try { transaction.abort(); } catch { finish(error); } }
    });
  }

  return Object.freeze({
    async get(key) {
      checkKey(key);
      const db = await open();
      try { return await transact(db, key); } finally { db.close(); }
    },
    async put(key, raw, { assertCurrent = () => {} } = {}) {
      checkKey(key);
      if (typeof raw !== "string") throw unavailable();
      assertCurrent();
      const db = await open();
      try {
        assertCurrent();
        await transact(db, key, raw, assertCurrent);
        // Request success alone is not durability: wait for transaction completion,
        // then verify exact bytes through a separate transaction before returning.
        const saved = await transact(db, key);
        if (saved !== raw) throw fail("PAYLOAD_READBACK_FAILED", "The browser safety copy could not be verified. Existing records are unchanged.");
        assertCurrent();
      } finally { db.close(); }
    },
  });
}
