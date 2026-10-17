import { BETA_LOCAL_STORAGE_KEYS, isSupportedAppLocalData, sanitizeAppLocalData } from "../../utils/betaDataCleanup.js";

const UNREADABLE = "Saved local data could not be read safely. Automatic saving is paused to protect it. Settings and backup tools remain available. Repair the saved data, then reload before editing records.";
const CHANGED = "Saved local data changed outside this page. Automatic saving is paused to avoid replacing it. Reload to load the latest records before continuing.";
const WRITE_FAILED = "Your latest changes could not be saved in this browser. Keep this page open, check available browser storage, then try the change again. Earlier saved data is unchanged.";

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
      } catch {
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
