// Directory stores ship with the app (one JSON file per state), so saved Restocks
// data only needs the stores a person added or changed. Saving every directory
// row filled the browser's ~5 MB storage on first visit and made later saves fail.
//
// Directory stores are registered as they load (both as the loader returns them
// and as the Restocks page normalizes them); before saving, any store that is
// exactly a registered directory row is left out. A store that differs in any
// field (status, favorite, notes, admin edits) is kept, and nothing is dropped
// for a state whose directory has not loaded yet.

const directoryFingerprints = new Map();

function storeKey(store = {}) {
  return String(store.id ?? store.storeId ?? store.store_id ?? "");
}

export function registerDirectoryStores(stores = []) {
  for (const store of stores) {
    const key = storeKey(store);
    if (!key) continue;
    if (!directoryFingerprints.has(key)) directoryFingerprints.set(key, new Set());
    directoryFingerprints.get(key).add(JSON.stringify(store));
  }
}

export function isUnchangedDirectoryStore(store = {}) {
  return Boolean(directoryFingerprints.get(storeKey(store))?.has(JSON.stringify(store)));
}

export function compactSavedStores(stores) {
  if (!Array.isArray(stores) || !directoryFingerprints.size) return stores;
  return stores.filter((store) => !isUnchangedDirectoryStore(store));
}

export function clearDirectoryStoreRegistry() {
  directoryFingerprints.clear();
}
