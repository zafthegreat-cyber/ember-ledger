// Loads one state's Restocks store directory on demand. Each state's
// generated JSON is a separate asset fetched only when that state is
// browsed, so phones never download every directory up front. States without
// a bundled directory use saved/reviewed community stores, not placeholder rows.
import coverage from "./storeDirectoryCoverage.json";
import { dedupeStoresByChainAddress, normalizeImportedStoreBatch } from "../utils/storeImportUtils";
import { DEFAULT_STORE_STATE_CODE, getStoreDirectoryState } from "./storeStates";
import { registerDirectoryStores } from "../utils/storeDirectoryPersistence.js";

const directoryPromises = new Map();

async function fetchGeneratedStores(state) {
  // Vite resolves only *Stores.json assets; each state remains a separate file.
  // A successfully imported state becomes available without another URL edit.
  const baseName = state.file.slice(0, -"Stores.json".length);
  const url = new URL(`./generated/${baseName}Stores.json`, import.meta.url).href;
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Could not load ${state.name} store directory: ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error(`The ${state.name} store directory is invalid. Your saved stores were kept.`);
  return dedupeStoresByChainAddress(normalizeImportedStoreBatch(rows, {
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
  if (!coverage.directories[state.code] || typeof fetch !== "function") return [];
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

export function storeDirectoryCoverage(stateValue) {
  const state = getStoreDirectoryState(stateValue);
  if (!state) return null;
  const directory = coverage.directories[state.code];
  return { state: state.code, name: state.name, bundled: Boolean(directory), cachedStoreCount: directory?.count || 0 };
}
