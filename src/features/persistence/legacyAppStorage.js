import { BETA_LOCAL_STORAGE_KEYS, isSupportedAppLocalData, sanitizeAppLocalData } from "../../utils/betaDataCleanup.js";

const UNREADABLE = "Saved local data could not be read safely. Automatic saving is paused to protect it. Settings and backup tools remain available. Repair the saved data, then reload before editing records.";
const CHANGED = "Saved local data changed outside this page. Automatic saving is paused to avoid replacing it. Reload to load the latest records before continuing.";
const WRITE_FAILED = "Your latest changes could not be saved in this browser. Keep this page open, check available browser storage, then try the change again. Earlier saved data is unchanged.";
const QUOTA_FULL = "This browser only gives Code 3 TCG about 5 MB of quick storage and your collection has outgrown it. Your latest changes are held in a larger on-device recovery copy, but they are not in the normal save yet. Download a backup now (Settings > Backup) or turn on cloud sync to keep everything safe.";
const QUOTA_FULL_NO_COPY = "This browser only gives Code 3 TCG about 5 MB of quick storage and your collection has outgrown it. The latest change could not be saved anywhere on this device. Download a backup now (Settings > Backup) or turn on cloud sync before adding more.";

export const LEGACY_OVERFLOW_DATABASE = "code3-local-overflow-v1";
const OVERFLOW_STORE = "copies";

export function isQuotaError(error) {
  if (!error) return false;
  const name = String(error.name || "");
  const code = Number(error.code);
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014
    || /quota|exceeded the quota|storage full/i.test(String(error.message || ""));
}

/**
 * When localStorage is full, keep the serialized payload in IndexedDB (tens to
 * hundreds of MB available) so the person's latest changes are not lost. The
 * copy is keyed by the storage key; `readLegacyOverflowCopy` returns it for the
 * backup and recovery tools. This is a safety net, not the primary store.
 */
export function saveLegacyOverflowCopy(key, serialized, { indexedDB = globalThis.indexedDB } = {}) {
  return new Promise((resolve) => {
    if (!indexedDB?.open) return resolve(false);
    let request;
    try { request = indexedDB.open(LEGACY_OVERFLOW_DATABASE, 1); } catch { return resolve(false); }
    request.onupgradeneeded = () => { try { request.result.createObjectStore(OVERFLOW_STORE); } catch { /* exists */ } };
    request.onerror = () => resolve(false);
    request.onblocked = () => resolve(false);
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction(OVERFLOW_STORE, "readwrite");
        tx.objectStore(OVERFLOW_STORE).put({ key, serialized, savedAt: new Date().toISOString(), bytes: serialized.length }, key);
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); resolve(false); };
        tx.onabort = () => { db.close(); resolve(false); };
      } catch { db.close(); resolve(false); }
    };
  });
}

export function readLegacyOverflowCopy(key, { indexedDB = globalThis.indexedDB } = {}) {
  return new Promise((resolve) => {
    if (!indexedDB?.open) return resolve(null);
    let request;
    try { request = indexedDB.open(LEGACY_OVERFLOW_DATABASE, 1); } catch { return resolve(null); }
    request.onupgradeneeded = () => { try { request.result.createObjectStore(OVERFLOW_STORE); } catch { /* exists */ } };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction(OVERFLOW_STORE, "readonly");
        const get = tx.objectStore(OVERFLOW_STORE).get(key);
        get.onsuccess = () => { db.close(); resolve(get.result || null); };
        get.onerror = () => { db.close(); resolve(null); };
      } catch { db.close(); resolve(null); }
    };
  });
}

function validate(value) {
  if (!isSupportedAppLocalData(value)) throw new Error("Unsupported local app data");
  // The existing presentation sanitizer must also be able to inspect the fields.
  // Never use its forgiving result to decide whether an original value is valid.
  sanitizeAppLocalData(value);
  return value;
}

/** Guard for the legacy beta app's single-key automatic save, not a restore API. */
export function createLegacyAppStorageGuard() {
  const key = BETA_LOCAL_STORAGE_KEYS.app;
  let loaded = false;
  let blocked = false;
  let expectedRaw = null;
  let initialData = {};
  let persistedData = {};
  let error = "";
  const listeners = new Set();
  function notify(nextError) {
    if (error === nextError) return;
    error = nextError;
    for (const listener of listeners) listener();
  }
  function block(message = UNREADABLE) {
    blocked = true;
    notify(message);
    return { ok: false, error: message };
  }
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getError() { return error; },
    load(storage) {
      if (loaded) return { data: initialData, error };
      loaded = true;
      try {
        expectedRaw = storage.getItem(key);
        initialData = expectedRaw === null ? {} : validate(JSON.parse(expectedRaw));
        persistedData = expectedRaw === null ? {} : JSON.parse(expectedRaw);
        return { data: initialData, error: "" };
      } catch {
        block();
        return { data: {}, error };
      }
    },
    save(storage, nextData) {
      if (!loaded || blocked) return { ok: false, error: error || UNREADABLE };
      let currentRaw;
      try {
        currentRaw = storage.getItem(key);
      } catch {
        return block();
      }
      if (currentRaw !== expectedRaw) return block(CHANGED);
      let next;
      let serialized;
      try {
        validate(nextData);
        next = validate({ ...persistedData, ...nextData });
        serialized = JSON.stringify(next);
        // Reject data that JSON serialization would silently erase or coerce
        // into an unsupported envelope before the original bytes are touched.
        validate(JSON.parse(serialized));
      } catch {
        notify("The current changes could not be saved safely. Earlier saved data is unchanged. Review the record values before trying again.");
        return { ok: false, error };
      }
      if (serialized === currentRaw) {
        notify("");
        return { ok: true, changed: false };
      }
      try {
        storage.setItem(key, serialized);
      } catch (writeError) {
        if (isQuotaError(writeError)) {
          // Hold the change in the larger on-device store and say exactly what happened.
          notify(QUOTA_FULL_NO_COPY);
          void saveLegacyOverflowCopy(key, serialized).then((kept) => { if (kept) notify(QUOTA_FULL); });
          return { ok: false, error, quotaExceeded: true };
        }
        notify(WRITE_FAILED);
        return { ok: false, error };
      }
      expectedRaw = serialized;
      persistedData = JSON.parse(serialized);
      notify("");
      return { ok: true, changed: true };
    },
    acceptConfirmedReset(storage, confirmed) {
      if (confirmed !== true) return false;
      try {
        if (storage.getItem(key) !== null) return false;
      } catch {
        return false;
      }
      loaded = true;
      blocked = false;
      expectedRaw = null;
      initialData = {};
      persistedData = {};
      notify("");
      return true;
    },
  };
}
