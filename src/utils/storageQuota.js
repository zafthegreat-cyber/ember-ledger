// Storage quota early warning (tester reaction A79, 2026-10-31).
// Browsers give a site about 5 MB of localStorage. Instead of learning that
// from a failed save, estimate how full it is after each save and warn at 75%.

export const LOCAL_STORAGE_ASSUMED_LIMIT = 5 * 1024 * 1024;
export const STORAGE_WARN_RATIO = 0.75;
export const STORAGE_CRITICAL_RATIO = 0.9;

export function estimateLocalStorageBytes(storage = globalThis.localStorage) {
  try {
    if (!storage || typeof storage.length !== "number") return 0;
    let bytes = 0;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key === null) continue;
      const value = storage.getItem(key) || "";
      // UTF-16 storage: two bytes per code unit for key and value.
      bytes += (key.length + value.length) * 2;
    }
    return bytes;
  } catch {
    return 0;
  }
}

export function storageQuotaStatus(storage = globalThis.localStorage, limit = LOCAL_STORAGE_ASSUMED_LIMIT) {
  const bytes = estimateLocalStorageBytes(storage);
  const ratio = limit > 0 ? bytes / limit : 0;
  const mb = (value) => `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (ratio >= STORAGE_CRITICAL_RATIO) {
    return { level: "critical", bytes, limit, percent: Math.round(ratio * 100), title: "Storage almost full", message: `This browser gives Code 3 TCG about ${mb(limit)} and you are using ${mb(bytes)}. The next big save may fail. Download a backup now (Settings > Backup) and turn on cloud sync, or remove items you no longer need.` };
  }
  if (ratio >= STORAGE_WARN_RATIO) {
    return { level: "warn", bytes, limit, percent: Math.round(ratio * 100), title: "Storage getting full", message: `You are using ${mb(bytes)} of about ${mb(limit)} on this device. Before adding a lot more, download a backup (Settings > Backup) or turn on cloud sync.` };
  }
  return { level: "ok", bytes, limit, percent: Math.round(ratio * 100), title: "", message: "" };
}
