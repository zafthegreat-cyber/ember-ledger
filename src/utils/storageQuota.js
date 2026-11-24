// Read-only localStorage size advisory. This is not a measured browser quota.
// UTF-16 text size and quota accounting are not interchangeable across engines.
// navigator.storage.estimate() describes a different storage pool and must not
// be used as localStorage headroom. Never probe capacity by filling storage.
export const LOCAL_STORAGE_ASSUMED_LIMIT = 5 * 1024 * 1024;
export const STORAGE_WARN_RATIO = 0.75;
export const STORAGE_CRITICAL_RATIO = 0.9;

export function estimateLocalStorageBytes(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    if (!target || typeof target.length !== "number") return null;
    let bytes = 0;
    for (let index = 0; index < target.length; index += 1) {
      const key = target.key(index);
      if (key === null) continue;
      const value = target.getItem(key);
      if (value === null) continue;
      bytes += (key.length + value.length) * 2;
    }
    return bytes;
  } catch {
    return null;
  }
}

// Since Nov 15 (SHOULD 16) every save also goes to IndexedDB, which holds far
// more than 5 MB, and a full quick store no longer loses changes. Where that
// durable store exists the 5 MB figure is not a risk, so no banner is shown;
// the size advisory below stays for the rare browser without IndexedDB.
export function hasDurableStore(scope = globalThis) {
  try { return typeof scope?.indexedDB?.open === "function"; } catch { return false; }
}

export function storageQuotaStatus(storage, advisoryThreshold = LOCAL_STORAGE_ASSUMED_LIMIT, { durableStore = hasDurableStore() } = {}) {
  if (durableStore) return { level: "ok", bytes: estimateLocalStorageBytes(storage), limit: null, percent: null, capacityKnown: false, title: "", message: "" };
  const bytes = estimateLocalStorageBytes(storage);
  const base = { bytes, limit: null, percent: null, capacityKnown: false };
  if (bytes === null) return { ...base, level: "unknown", title: "Storage check unavailable", message: "This app could not read its local storage usage. This does not confirm that saving works or has failed. Open backups and check Cloud saving & recovery before adding more records." };
  const threshold = Number.isFinite(advisoryThreshold) && advisoryThreshold > 0 ? advisoryThreshold : LOCAL_STORAGE_ASSUMED_LIMIT;
  if (bytes >= threshold * STORAGE_WARN_RATIO) {
    const size = (bytes / (1024 * 1024)).toFixed(1);
    return { ...base, level: "warn", title: "Check your saved-data backup", message: "About " + size + " MiB of local text data is stored on this device. This is a size estimate, not your phone's storage or a measured browser limit. Download a backup and check Cloud saving & recovery for any unsaved changes. Keep the app installed and do not clear its data." };
  }
  return { ...base, level: "ok", title: "", message: "" };
}
