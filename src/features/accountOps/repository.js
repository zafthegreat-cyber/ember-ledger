import {
  ACCOUNT_OPS_COLLECTIONS,
  ACCOUNT_OPS_LIMITS,
  ACCOUNT_OPS_SCHEMA_VERSION,
  ACCOUNT_OPS_STORAGE_KEY,
  RECORD_STATUS,
} from "./constants.js";
import { safeAccountOpsClone } from "./security.js";
import { AccountOpsRecoveryError, assertAccountOpsRecoveryClear, readAccountOpsRecoveryGuardedRaw } from "./recoveryState.js";
import { ACCOUNT_OPS_RECORD_NORMALIZERS, AccountOpsValidationError } from "./validators.js";
import { accountOpsExclusive, isBrowserAccountOpsStorage, AccountOpsCoordinationError } from "./operationCoordinator.js";
import { ACCOUNT_OPS_RESTORE_LOCK } from "./recoveryState.js";

const PROFILE_GROUP_PRESETS = Object.freeze([
  ["personal", "Personal"],
  ["business", "Business"],
  ["store-specific", "Store-specific"],
  ["other", "Other"],
].map(([slug, displayName]) => Object.freeze({
  id: `profile-group-preset:${slug}`,
  displayName,
  description: "",
  status: RECORD_STATUS.ACTIVE,
  recordVersion: 1,
  createdAt: "2026-08-26T00:00:00.000Z",
  updatedAt: "2026-08-26T00:00:00.000Z",
  archivedAt: null,
})));

export const ACCOUNT_OPS_PROFILE_GROUP_PRESETS = PROFILE_GROUP_PRESETS;

export class AccountOpsRepositoryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AccountOpsRepositoryError";
    this.code = code;
    this.details = details;
  }
}

function isoNow(now) {
  const value = typeof now === "function" ? now() : now;
  const parsed = new Date(value || Date.now());
  if (!Number.isFinite(parsed.getTime())) throw new AccountOpsRepositoryError("INVALID_CLOCK", "Account Ops requires a valid clock value.");
  return parsed.toISOString();
}

export function createEmptyAccountOpsState(now = () => new Date().toISOString()) {
  const updatedAt = isoNow(now);
  return {
    schemaVersion: ACCOUNT_OPS_SCHEMA_VERSION,
    updatedAt,
    profileGroups: PROFILE_GROUP_PRESETS.map((record) => ({ ...record })),
    profiles: [],
    emailDomains: [],
    emailAliases: [],
    retailers: [],
    storeAccounts: [],
    tasks: [],
    activity: [],
  };
}

export function normalizeAccountOpsState(value, options = {}) {
  const now = options.now || (() => new Date().toISOString());
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountOpsRepositoryError("INVALID_STATE", "Account Ops state must be an object.");
  }
  safeAccountOpsClone(value);
  const allowed = new Set(["schemaVersion", "updatedAt", ...ACCOUNT_OPS_COLLECTIONS]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new AccountOpsRepositoryError("UNKNOWN_STATE_FIELD", `Unsupported Account Ops state field: ${unknown[0]}.`);
  if (value.schemaVersion !== ACCOUNT_OPS_SCHEMA_VERSION) {
    throw new AccountOpsRepositoryError("UNSUPPORTED_SCHEMA_VERSION", `Account Ops schema version ${String(value.schemaVersion)} is unsupported.`);
  }

  const normalized = { schemaVersion: ACCOUNT_OPS_SCHEMA_VERSION, updatedAt: isoNow(value.updatedAt || now) };
  for (const collection of ACCOUNT_OPS_COLLECTIONS) {
    const rows = value[collection];
    if (!Array.isArray(rows)) throw new AccountOpsRepositoryError("COLLECTION_REQUIRED", `Account Ops collection ${collection} must be an array.`);
    if (rows.length > ACCOUNT_OPS_LIMITS.maximumRecordsPerCollection) {
      throw new AccountOpsRepositoryError("COLLECTION_LIMIT_EXCEEDED", `Account Ops collection ${collection} exceeds its record limit.`);
    }
    const ids = new Set();
    normalized[collection] = rows.map((row, index) => {
      let record;
      try {
        record = ACCOUNT_OPS_RECORD_NORMALIZERS[collection](row, { persisted: true });
      } catch (error) {
        if (error instanceof AccountOpsValidationError) error.details = { ...error.details, collection, index };
        throw error;
      }
      if (!record.id) throw new AccountOpsRepositoryError("STABLE_ID_REQUIRED", `${collection}[${index}] is missing a stable ID.`);
      if (!Number.isInteger(record.recordVersion) || record.recordVersion < 1) {
        throw new AccountOpsRepositoryError("RECORD_VERSION_REQUIRED", `${collection}[${index}] has an invalid recordVersion.`);
      }
      if (!record.createdAt || !record.updatedAt) {
        throw new AccountOpsRepositoryError("RECORD_TIMESTAMPS_REQUIRED", `${collection}[${index}] is missing timestamps.`);
      }
      if (ids.has(record.id)) throw new AccountOpsRepositoryError("DUPLICATE_ID", `${collection} contains duplicate ID ${record.id}.`);
      ids.add(record.id);
      return record;
    });
  }

  // Preset retailers are code metadata and must never be copied into the owner store.
  if (normalized.retailers.some((retailer) => retailer.id.startsWith("retailer-preset:"))) {
    throw new AccountOpsRepositoryError("PRESET_RETAILER_PERSISTED", "Static retailer presets must not be persisted as owner records.");
  }
  return normalized;
}

export function serializeAccountOpsState(value) {
  return JSON.stringify(normalizeAccountOpsState(value));
}

export function deserializeAccountOpsState(raw, options = {}) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return { state: normalizeAccountOpsState(parsed, options), error: null };
  } catch (error) {
    return { state: createEmptyAccountOpsState(options.now), error };
  }
}

export function createAccountOpsRepository(storage = globalThis.localStorage, options = {}) {
  const now = options.now || (() => new Date().toISOString());
  const runExclusive = accountOpsExclusive(storage, options);
  let lastError = null;
  let memoryState = createEmptyAccountOpsState(now);

  function load() {
    try {
      const raw = readAccountOpsRecoveryGuardedRaw(storage);
      if (raw === null || raw === undefined) {
        // An absent key is a successful empty read, not a read failure. Keeping
        // the previous cache here resurrects records removed in another tab.
        memoryState = createEmptyAccountOpsState(now);
        lastError = null;
        return safeAccountOpsClone(memoryState);
      }
      const result = deserializeAccountOpsState(raw, { now });
      lastError = result.error;
      if (result.error) return safeAccountOpsClone(memoryState);
      memoryState = result.state;
      return safeAccountOpsClone(memoryState);
    } catch (error) {
      lastError = error;
      if (error instanceof AccountOpsRecoveryError) throw error;
      return safeAccountOpsClone(memoryState);
    }
  }

  function save(nextState) {
    // A cached/empty read fallback is useful for presentation, but must never
    // become permission to overwrite an unreadable or malformed stored snapshot.
    load();
    if (lastError) {
      throw new AccountOpsRepositoryError("LOCAL_READ_FAILED", "Account Ops data could not be read safely. Recover the stored data before saving changes.");
    }
    const state = normalizeAccountOpsState({ ...nextState, updatedAt: isoNow(now) }, { now });
    const serialized = JSON.stringify(state);
    try {
      if (!storage?.setItem) throw new AccountOpsRepositoryError("STORAGE_UNAVAILABLE", "Account Ops local storage is unavailable.");
      assertAccountOpsRecoveryClear(storage);
      storage.setItem(ACCOUNT_OPS_STORAGE_KEY, serialized);
      if (readAccountOpsRecoveryGuardedRaw(storage) !== serialized) {
        throw new AccountOpsRepositoryError("LOCAL_SAVE_FAILED", "Account Ops could not verify the completed save.");
      }
      memoryState = state;
      lastError = null;
      return { state: safeAccountOpsClone(state), error: null };
    } catch (error) {
      lastError = error;
      if (error instanceof AccountOpsRecoveryError) throw error;
      throw new AccountOpsRepositoryError("LOCAL_SAVE_FAILED", "Account Ops data could not be saved on this device.", { cause: error?.message || "unknown" });
    }
  }

  function transact(operation) {
    return runExclusive(ACCOUNT_OPS_RESTORE_LOCK, async () => {
      function readForOperation() {
        try { return readAccountOpsRecoveryGuardedRaw(storage); }
        catch (error) {
          lastError = error;
          if (error instanceof AccountOpsRecoveryError) throw error;
          throw new AccountOpsRepositoryError("LOCAL_READ_FAILED", "Saved Account Ops records could not be read safely.");
        }
      }
      const beforeRaw = readForOperation();
      let staged = load();
      if (lastError) throw new AccountOpsRepositoryError("LOCAL_READ_FAILED", "Saved Account Ops records could not be read safely.");
      let open = true;
      let dirty = false;
      function assertLease() {
        if (!open) throw new AccountOpsCoordinationError("OPERATION_CLOSED", "The Account Ops operation has finished.");
        if (readForOperation() !== beforeRaw) {
          throw new AccountOpsCoordinationError("VERSION_CONFLICT", "Account Ops changed in another view. Reload before saving again.");
        }
      }
      const scoped = Object.freeze({
        storageKey: ACCOUNT_OPS_STORAGE_KEY,
        schemaVersion: ACCOUNT_OPS_SCHEMA_VERSION,
        load() { assertLease(); return safeAccountOpsClone(staged); },
        save(next) {
          assertLease();
          staged = normalizeAccountOpsState({ ...next, updatedAt: isoNow(now) }, { now });
          dirty = true;
          return { state: safeAccountOpsClone(staged), error: null };
        },
        getLastError: () => null,
        transact(nested) { assertLease(); return nested(scoped); },
      });
      try {
        const result = await operation(scoped);
        assertLease();
        // All linked records and activity become visible in one atomic localStorage
        // value replacement. Failed validation leaves the exact earlier bytes.
        const committed = dirty ? save(staged).state : staged;
        return result && typeof result === "object" && Object.hasOwn(result, "snapshot")
          ? { ...result, snapshot: safeAccountOpsClone(committed) } : result;
      } finally { open = false; }
    });
  }

  return Object.freeze({
    storageKey: ACCOUNT_OPS_STORAGE_KEY,
    schemaVersion: ACCOUNT_OPS_SCHEMA_VERSION,
    load,
    save: (next) => {
      if (isBrowserAccountOpsStorage(storage) || options.requireCrossTabLock) {
        throw new AccountOpsCoordinationError("COORDINATED_WRITE_REQUIRED", "Use an Account Ops operation to save browser records safely.");
      }
      return save(next);
    },
    transact,
    getLastError: () => lastError,
  });
}
