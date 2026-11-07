// Loads one state's Restocks store directory on demand. Each state's
// generated JSON is a separate asset fetched only when that state is
// browsed, so phones never download every directory up front. States without
// a bundled directory use saved/reviewed community stores, not placeholder rows.
import marylandStoresUrl from "./generated/marylandStores.json?url";
import dcStoresUrl from "./generated/dcStores.json?url";
import northCarolinaStoresUrl from "./generated/northCarolinaStores.json?url";
import { dedupeStoresByChainAddress, normalizeImportedStoreBatch } from "../utils/storeImportUtils";
import { DEFAULT_STORE_STATE_CODE, getStoreDirectoryState } from "./storeStates";
import { registerDirectoryStores } from "../utils/storeDirectoryPersistence.js";

const GENERATED_STORE_URLS = {
  MD: marylandStoresUrl,
  DC: dcStoresUrl,
  NC: northCarolinaStoresUrl,
};

const directoryPromises = new Map();

async function fetchGeneratedStores(state) {
  const response = await fetch(GENERATED_STORE_URLS[state.code], { cache: "force-cache" });
  if (!response.ok) throw new Error(`Could not load ${state.name} store directory: ${response.status}`);
  const rows = await response.json();
  return dedupeStoresByChainAddress(normalizeImportedStoreBatch(Array.isArray(rows) ? rows : [], {
    state: state.name,
    source: "openstreetmap-overpass-cache",
  }));
}

async function loadUncached(state) {
  // Virginia also carries the hand-curated seeds, so it keeps its own loader.
  if (state.code === "VA") {
    const storeModule = await import("./virginiaStoresSeed");
    return storeModule.loadVirginiaStoresSeed();
  }
  if (!GENERATED_STORE_URLS[state.code] || typeof fetch !== "function") return [];
  return fetchGeneratedStores(state);
}

export function loadStoreDirectory(stateValue = DEFAULT_STORE_STATE_CODE) {
  const state = getStoreDirectoryState(stateValue);
  if (!state) return Promise.resolve([]);
  if (!directoryPromises.has(state.code)) {
    const promise = loadUncached(state).then((stores) => {
      registerDirectoryStores(stores);
      return stores;
    }).catch((error) => {
      directoryPromises.delete(state.code);
      throw error;
    });
    directoryPromises.set(state.code, promise);
  }
  return directoryPromises.get(state.code);
}

export async function loadStoreDirectories(stateValues = [DEFAULT_STORE_STATE_CODE]) {
  const lists = await Promise.all([...new Set(stateValues)].map((value) => loadStoreDirectory(value)));
  return lists.flat();
}
