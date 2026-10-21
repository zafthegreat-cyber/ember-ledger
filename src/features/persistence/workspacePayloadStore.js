import { redactEbayArchive, redactedPayloadLocation } from "../ebayPrivacy/privacyArchives.js";
import { deriveEbayListingTombstones, validateEbayPrivacyPolicy } from "../ebayPrivacy/privacyPolicy.js";
import { canonicalStringify } from "../backup/canonicalJson.js";
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

/** Immutable safety payloads, with one narrowly scoped eBay privacy-redaction migration. */
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
    async redactEbayPrivacy(policy, { assertCurrent = () => {}, rawHashes = new Map() } = {}) {
      validateEbayPrivacyPolicy(policy);
      if (!policy.tombstones.length) return new Map();
      assertCurrent();
      const db = await open();
      try {
        return await new Promise((resolve,reject) => {
          const replacements = new Map();
          const queued = [];
          const transaction = db.transaction(WORKSPACE_PAYLOAD_OBJECT_STORE,"readwrite");
          const store = transaction.objectStore(WORKSPACE_PAYLOAD_OBJECT_STORE);
          const referenceMapKey = "ebay-privacy-reference-map:v1";
          const prior = store.get(referenceMapKey);
          let failure;
          const timer = setTimeout(() => { failure = fail("PAYLOAD_STORE_TIMEOUT", "The eBay privacy safety update did not finish. Reopen the app to retry."); try { transaction.abort(); } catch { reject(failure); } },timeoutMs);
          transaction.oncomplete = () => { clearTimeout(timer); replacements.ebayPrivacyPolicy = policy; resolve(replacements); };
          transaction.onabort = transaction.onerror = () => { clearTimeout(timer); reject(failure || unavailable()); };
          prior.onsuccess = () => {
            try {
              if (prior.result !== undefined) {
                const map = JSON.parse(prior.result);
                if (!Array.isArray(map) || map.length > 100000) throw unavailable();
                for (const [key,entry] of map) {
                  checkKey(key); checkKey(entry.key);
                  if (!/^[a-f0-9]{64}$/.test(entry.payloadHash || "")) throw unavailable();
                  replacements.set(key,entry);
                }
              }
            } catch (error) { failure = error; transaction.abort(); return; }
            const request = store.openCursor();
            request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
              try {
                assertCurrent();
                for (const entry of queued) {
                  const projected = redactEbayArchive(entry.parsed,policy,new Map(),rawHashes);
                  if (projected !== entry.parsed) {
                    const raw = canonicalStringify(projected);
                    const replacement = redactedPayloadLocation(entry.key,raw);
                    store.put(raw,replacement.key); store.delete(entry.key);
                    replacements.set(entry.key,replacement);
                  }
                }
                store.put(JSON.stringify([...replacements]),referenceMapKey);
              } catch (error) { failure = error; transaction.abort(); }
              return;
            }
            try {
              assertCurrent();
              if (typeof cursor.key !== "string" || typeof cursor.value !== "string") throw unavailable();
              // Only registered immutable workspace-copy namespaces are touched.
              if (/^(recovery|conflict-copy|owner-archive):/.test(cursor.key)) {
                const parsed = JSON.parse(cursor.value);
                if (queued.length >= 10000) throw unavailable();
                policy = deriveEbayListingTombstones(parsed,policy);
                queued.push({key:cursor.key,parsed});
              }
              cursor.continue();
            } catch (error) { failure = error; transaction.abort(); }
            };
          };
        });
      } finally { db.close(); }
    },
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
