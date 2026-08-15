import {
  FLIP_SCOUT_SCHEMA_VERSION,
  FLIP_SCOUT_STORAGE_KEY,
  RECORD_COLLECTIONS,
  createEmptyFlipScoutState,
} from "./constants.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix = "record") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeFlipScoutState(value, now = new Date().toISOString()) {
  const empty = createEmptyFlipScoutState(now);
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  const normalized = { ...empty, schemaVersion: FLIP_SCOUT_SCHEMA_VERSION };
  RECORD_COLLECTIONS.forEach((collection) => {
    normalized[collection] = Array.isArray(value[collection])
      ? value[collection].filter((record) => record && typeof record === "object" && !Array.isArray(record)).map((record) => ({ ...record }))
      : [];
  });
  normalized.updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : now;
  return normalized;
}

export function serializeFlipScoutState(state) {
  return JSON.stringify(normalizeFlipScoutState(state), null, 2);
}

export function deserializeFlipScoutState(raw) {
  try {
    return { state: normalizeFlipScoutState(typeof raw === "string" ? JSON.parse(raw) : raw), error: "" };
  } catch (error) {
    return { state: createEmptyFlipScoutState(), error: error?.message || "The sourcing data could not be parsed." };
  }
}

export function createFlipScoutRepository(storage = globalThis.localStorage) {
  let lastError = "";

  function load() {
    if (!storage?.getItem) return createEmptyFlipScoutState();
    try {
      const raw = storage.getItem(FLIP_SCOUT_STORAGE_KEY);
      if (!raw) return createEmptyFlipScoutState();
      const parsed = deserializeFlipScoutState(raw);
      lastError = parsed.error;
      return parsed.state;
    } catch (error) {
      lastError = error?.message || "Sourcing storage is unavailable.";
      return createEmptyFlipScoutState();
    }
  }

  function save(nextState) {
    const normalized = normalizeFlipScoutState({ ...nextState, updatedAt: new Date().toISOString() });
    try {
      storage?.setItem?.(FLIP_SCOUT_STORAGE_KEY, JSON.stringify(normalized));
      lastError = "";
      return { state: normalized, error: "" };
    } catch (error) {
      lastError = error?.message || "Sourcing data could not be saved on this device.";
      return { state: normalized, error: lastError };
    }
  }

  function upsert(collection, record) {
    if (!RECORD_COLLECTIONS.includes(collection)) throw new Error(`Unknown sourcing collection: ${collection}`);
    const current = load();
    const now = new Date().toISOString();
    const nextRecord = {
      ...record,
      id: record.id || makeId(collection.replace(/s$/, "")),
      createdAt: record.createdAt || now,
      updatedAt: now,
    };
    const rows = current[collection];
    const nextRows = rows.some((row) => row.id === nextRecord.id)
      ? rows.map((row) => row.id === nextRecord.id ? { ...row, ...nextRecord } : row)
      : [nextRecord, ...rows];
    const result = save({ ...current, [collection]: nextRows });
    return { ...result, record: nextRecord };
  }

  function remove(collection, id) {
    if (!RECORD_COLLECTIONS.includes(collection)) throw new Error(`Unknown sourcing collection: ${collection}`);
    const current = load();
    return save({ ...current, [collection]: current[collection].filter((record) => record.id !== id) });
  }

  function replace(nextState) {
    return save(normalizeFlipScoutState(nextState));
  }

  function exportJson() {
    return serializeFlipScoutState(load());
  }

  function importJson(raw) {
    const parsed = deserializeFlipScoutState(raw);
    if (parsed.error) return { state: load(), error: parsed.error };
    return replace(parsed.state);
  }

  return {
    storageKey: FLIP_SCOUT_STORAGE_KEY,
    schemaVersion: FLIP_SCOUT_SCHEMA_VERSION,
    load,
    save,
    upsert,
    remove,
    replace,
    exportJson,
    importJson,
    snapshot: () => clone(load()),
    getLastError: () => lastError,
  };
}
