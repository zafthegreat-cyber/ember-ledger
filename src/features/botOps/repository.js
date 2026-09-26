import {
  BOT_OPS_COLLECTIONS,
  BOT_OPS_LIMITS,
  BOT_OPS_SCHEMA_VERSION,
  BOT_OPS_STORAGE_KEY,
} from "./constants.js";
import { assertSafeBotOpsInput, safeBotOpsClone } from "./security.js";
import { BOT_OPS_RECORD_NORMALIZERS, BotOpsValidationError } from "./validators.js";

export class BotOpsRepositoryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "BotOpsRepositoryError";
    this.code = code;
    this.details = details;
  }
}

function isoNow(value) {
  const parsed = new Date(typeof value === "function" ? value() : value || Date.now());
  if (!Number.isFinite(parsed.getTime())) throw new BotOpsRepositoryError("INVALID_CLOCK", "A valid clock is required.");
  return parsed.toISOString();
}

export function createEmptyBotOpsState(now = () => new Date().toISOString()) {
  return {
    schemaVersion: BOT_OPS_SCHEMA_VERSION,
    updatedAt: isoNow(now),
    installations: [],
    retailerAccountLinks: [],
    botProfiles: [],
    proxyGroups: [],
    productTargets: [],
    taskGroups: [],
    tasks: [],
    attempts: [],
    checkoutEvidence: [],
    activity: [],
  };
}

export function normalizeBotOpsState(value, options = {}) {
  assertSafeBotOpsInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BotOpsRepositoryError("INVALID_STATE", "Bot Operations state must be an object.");
  }
  const allowed = new Set(["schemaVersion", "updatedAt", ...BOT_OPS_COLLECTIONS]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new BotOpsRepositoryError("UNKNOWN_STATE_FIELD", `Unsupported Bot Operations state field: ${unknown[0]}.`);
  if (value.schemaVersion !== BOT_OPS_SCHEMA_VERSION) {
    throw new BotOpsRepositoryError("UNSUPPORTED_SCHEMA_VERSION", `Bot Operations schema version ${String(value.schemaVersion)} is unsupported.`);
  }

  const result = { schemaVersion: BOT_OPS_SCHEMA_VERSION, updatedAt: isoNow(value.updatedAt || options.now) };
  for (const collection of BOT_OPS_COLLECTIONS) {
    const records = value[collection];
    if (!Array.isArray(records) || records.length > BOT_OPS_LIMITS.maximumRecordsPerCollection) {
      throw new BotOpsRepositoryError("COLLECTION_INVALID", `${collection} must be a bounded array.`);
    }
    const ids = new Set();
    result[collection] = records.map((record, index) => {
      try {
        const normalized = BOT_OPS_RECORD_NORMALIZERS[collection](record, { persisted: true });
        if (!normalized.id) throw new BotOpsRepositoryError("STABLE_ID_REQUIRED", `${collection}[${index}] requires an ID.`);
        if (!Number.isInteger(normalized.recordVersion) || normalized.recordVersion < 1) {
          throw new BotOpsRepositoryError("RECORD_VERSION_REQUIRED", `${collection}[${index}] requires a positive recordVersion.`);
        }
        if (!normalized.createdAt || !normalized.updatedAt) {
          throw new BotOpsRepositoryError("RECORD_TIMESTAMPS_REQUIRED", `${collection}[${index}] requires timestamps.`);
        }
        if (ids.has(normalized.id)) throw new BotOpsRepositoryError("DUPLICATE_ID", `${collection} contains duplicate ID ${normalized.id}.`);
        ids.add(normalized.id);
        return safeBotOpsClone(normalized);
      } catch (error) {
        if (error instanceof BotOpsValidationError) error.details = { ...error.details, collection, index };
        throw error;
      }
    });
  }
  return result;
}

export function serializeBotOpsState(value) {
  return JSON.stringify(normalizeBotOpsState(value));
}

export function deserializeBotOpsState(raw, options = {}) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return { state: normalizeBotOpsState(parsed, options), error: null };
  } catch (error) {
    return { state: createEmptyBotOpsState(options.now), error };
  }
}

export function createBotOpsRepository(storage = globalThis.localStorage, options = {}) {
  const now = options.now || (() => new Date().toISOString());
  let memoryState = createEmptyBotOpsState(now);
  let lastError = null;

  function load() {
    try {
      const raw = storage?.getItem?.(BOT_OPS_STORAGE_KEY);
      if (!raw) {
        lastError = null;
        return safeBotOpsClone(memoryState);
      }
      const result = deserializeBotOpsState(raw, { now });
      lastError = result.error;
      if (result.error) return safeBotOpsClone(memoryState);
      memoryState = result.state;
      return safeBotOpsClone(memoryState);
    } catch (error) {
      lastError = error;
      return safeBotOpsClone(memoryState);
    }
  }

  function save(nextState) {
    const state = normalizeBotOpsState({ ...nextState, updatedAt: isoNow(now) }, { now });
    try {
      if (!storage?.setItem) throw new Error("storage unavailable");
      storage.setItem(BOT_OPS_STORAGE_KEY, JSON.stringify(state));
      memoryState = state;
      lastError = null;
      return { state: safeBotOpsClone(state), error: null };
    } catch (error) {
      lastError = error;
      throw new BotOpsRepositoryError("LOCAL_SAVE_FAILED", "Bot Operations data could not be saved on this device.");
    }
  }

  return Object.freeze({
    storageKey: BOT_OPS_STORAGE_KEY,
    schemaVersion: BOT_OPS_SCHEMA_VERSION,
    load,
    save,
    getLastError: () => lastError,
  });
}
