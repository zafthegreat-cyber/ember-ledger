export const OWNER_CENTER_STORAGE_KEY = "private-business-hub.owner-center.v1";
export const OWNER_CENTER_SCHEMA_VERSION = 1;

const COLLECTIONS = [
  "restockStoreProfiles",
  "restockEvents",
  "restockPredictions",
  "storeVisits",
  "productObservations",
  "imports",
  "jobs",
];

export const DEFAULT_SCORING_SETTINGS = Object.freeze({
  minimumExpectedProfit: "",
  minimumRoi: "",
  maximumPurchaseAmount: "",
  maximumRisk: "",
  minimumConfidence: "",
  maximumDistance: "",
  rawCardConditionReserve: "",
  binderUncertaintyReserve: "",
  auctionDisposalReserve: "",
});

export const DEFAULT_FEATURE_CONTROLS = Object.freeze({
  ebaySearch: true,
  auctions: true,
  restocks: true,
  collection: true,
  grading: true,
  kidsCommunity: true,
  businessAssistant: true,
  aiImageAnalysis: false,
  emailImports: false,
});

export function createEmptyOwnerCenterState(now = new Date().toISOString()) {
  return {
    schemaVersion: OWNER_CENTER_SCHEMA_VERSION,
    updatedAt: now,
    restockStoreProfiles: [],
    restockEvents: [],
    restockPredictions: [],
    storeVisits: [],
    productObservations: [],
    imports: [],
    jobs: [],
    controls: {
      scoring: { ...DEFAULT_SCORING_SETTINGS },
      features: { ...DEFAULT_FEATURE_CONTROLS },
    },
  };
}

export function normalizeOwnerCenterState(value, now = new Date().toISOString()) {
  const empty = createEmptyOwnerCenterState(now);
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  const normalized = { ...empty, schemaVersion: OWNER_CENTER_SCHEMA_VERSION };
  for (const collection of COLLECTIONS) {
    normalized[collection] = Array.isArray(value[collection])
      ? value[collection].filter((record) => record && typeof record === "object" && !Array.isArray(record)).map((record) => ({ ...record }))
      : [];
  }
  normalized.controls = {
    scoring: { ...DEFAULT_SCORING_SETTINGS, ...(value.controls?.scoring || {}) },
    features: { ...DEFAULT_FEATURE_CONTROLS, ...(value.controls?.features || {}) },
  };
  normalized.updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : now;
  return normalized;
}

export function serializeOwnerCenterState(value) {
  return JSON.stringify(normalizeOwnerCenterState(value), null, 2);
}

export function deserializeOwnerCenterState(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return { state: normalizeOwnerCenterState(parsed), error: "" };
  } catch (error) {
    return {
      state: createEmptyOwnerCenterState(),
      error: error?.message || "Owner Center data could not be parsed.",
    };
  }
}

export function createOwnerCenterRepository(storage = globalThis.localStorage) {
  let lastError = "";

  function load() {
    try {
      const raw = storage?.getItem?.(OWNER_CENTER_STORAGE_KEY);
      if (!raw) return createEmptyOwnerCenterState();
      const result = deserializeOwnerCenterState(raw);
      lastError = result.error;
      return result.state;
    } catch (error) {
      lastError = error?.message || "Owner Center storage is unavailable.";
      return createEmptyOwnerCenterState();
    }
  }

  function save(nextState) {
    const state = normalizeOwnerCenterState({ ...nextState, updatedAt: new Date().toISOString() });
    try {
      storage?.setItem?.(OWNER_CENTER_STORAGE_KEY, JSON.stringify(state));
      lastError = "";
      return { state, error: "" };
    } catch (error) {
      lastError = error?.message || "Owner Center data could not be saved on this device.";
      return { state, error: lastError };
    }
  }

  function upsert(collection, record) {
    if (!COLLECTIONS.includes(collection)) throw new Error(`Unknown Owner Center collection: ${collection}`);
    const current = load();
    const now = new Date().toISOString();
    const nextRecord = {
      ...record,
      id: record.id || `${collection}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
      createdAt: record.createdAt || now,
      updatedAt: now,
    };
    const nextRows = current[collection].some((row) => row.id === nextRecord.id)
      ? current[collection].map((row) => row.id === nextRecord.id ? { ...row, ...nextRecord } : row)
      : [nextRecord, ...current[collection]];
    return { ...save({ ...current, [collection]: nextRows }), record: nextRecord };
  }

  return {
    storageKey: OWNER_CENTER_STORAGE_KEY,
    schemaVersion: OWNER_CENTER_SCHEMA_VERSION,
    load,
    save,
    upsert,
    getLastError: () => lastError,
  };
}
