import {
  INBOX_ORDER_COLLECTIONS,
  INBOX_ORDER_FORMAT,
  INBOX_ORDER_LIMITS,
  INBOX_ORDER_SCHEMA_VERSION,
  INBOX_ORDER_STORAGE_KEY,
} from "./constants.js";
import { assertSafeInboxOrderInput, safeInboxOrderClone } from "./security.js";

export class InboxOrderRepositoryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "InboxOrderRepositoryError";
    this.code = code;
    this.details = details;
  }
}

function isoNow(value) {
  const parsed = new Date(typeof value === "function" ? value() : value || Date.now());
  if (!Number.isFinite(parsed.getTime())) throw new InboxOrderRepositoryError("INVALID_CLOCK", "A valid clock is required.");
  return parsed.toISOString();
}

export function createEmptyInboxOrderState(now = () => new Date().toISOString()) {
  return {
    schemaVersion: INBOX_ORDER_SCHEMA_VERSION,
    updatedAt: isoNow(now),
    messageEvents: [],
    orderCandidates: [],
    candidateEvents: [],
    activity: [],
  };
}

function assertRecord(record, collection, index) {
  assertSafeInboxOrderInput(record, { path: `${collection}[${index}]` });
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new InboxOrderRepositoryError("INVALID_RECORD", `${collection}[${index}] must be an object.`);
  }
  if (!record.id || typeof record.id !== "string") throw new InboxOrderRepositoryError("STABLE_ID_REQUIRED", `${collection}[${index}] requires an ID.`);
  if (!Number.isInteger(record.recordVersion) || record.recordVersion < 1) {
    throw new InboxOrderRepositoryError("RECORD_VERSION_REQUIRED", `${collection}[${index}] requires a positive recordVersion.`);
  }
  if (!record.createdAt || !record.updatedAt || !Number.isFinite(Date.parse(record.createdAt)) || !Number.isFinite(Date.parse(record.updatedAt))) {
    throw new InboxOrderRepositoryError("RECORD_TIMESTAMPS_REQUIRED", `${collection}[${index}] requires valid timestamps.`);
  }
  if (record.format !== INBOX_ORDER_FORMAT) throw new InboxOrderRepositoryError("INVALID_FORMAT", `${collection}[${index}] has an invalid format.`);
  const expectedTypes = {
    messageEvents: "NORMALIZED_MESSAGE_EVENT",
    orderCandidates: "ORDER_CANDIDATE",
    candidateEvents: "ORDER_CANDIDATE_EVENT",
    activity: "INBOX_ORDER_ACTIVITY",
  };
  if (record.recordType !== expectedTypes[collection]) {
    throw new InboxOrderRepositoryError("INVALID_RECORD_TYPE", `${collection}[${index}] has an invalid recordType.`);
  }
  if (collection === "messageEvents" && (record.rawContentRetained !== false || !/^[a-f0-9]{64}$/.test(record.sourceHash || ""))) {
    throw new InboxOrderRepositoryError("UNSAFE_MESSAGE_EVENT", "Normalized messages must omit raw content and retain a valid sanitized source hash.");
  }
  if (collection === "orderCandidates"
    && (record.purchaseCreated !== false || record.automaticImportAllowed !== false || record.ownerReviewRequired == null)) {
    throw new InboxOrderRepositoryError("UNSAFE_ORDER_CANDIDATE", "Order Candidates must remain review-only and cannot create Purchases.");
  }
}

export function normalizeInboxOrderState(value, options = {}) {
  assertSafeInboxOrderInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InboxOrderRepositoryError("INVALID_STATE", "Inbox/order state must be an object.");
  }
  const allowed = new Set(["schemaVersion", "updatedAt", ...INBOX_ORDER_COLLECTIONS]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new InboxOrderRepositoryError("UNKNOWN_STATE_FIELD", `Unsupported state field: ${unknown[0]}.`);
  if (value.schemaVersion !== INBOX_ORDER_SCHEMA_VERSION) {
    throw new InboxOrderRepositoryError("UNSUPPORTED_SCHEMA_VERSION", `Schema version ${String(value.schemaVersion)} is unsupported.`);
  }
  const result = { schemaVersion: INBOX_ORDER_SCHEMA_VERSION, updatedAt: isoNow(value.updatedAt || options.now) };
  for (const collection of INBOX_ORDER_COLLECTIONS) {
    const records = value[collection];
    if (!Array.isArray(records) || records.length > INBOX_ORDER_LIMITS.maximumRecordsPerCollection) {
      throw new InboxOrderRepositoryError("COLLECTION_INVALID", `${collection} must be a bounded array.`);
    }
    const ids = new Set();
    result[collection] = records.map((record, index) => {
      assertRecord(record, collection, index);
      if (ids.has(record.id)) throw new InboxOrderRepositoryError("DUPLICATE_ID", `${collection} contains duplicate ID ${record.id}.`);
      ids.add(record.id);
      return safeInboxOrderClone(record);
    });
  }
  return result;
}

export function createInboxOrderRepository(storage = globalThis.localStorage, options = {}) {
  const now = options.now || (() => new Date().toISOString());
  let memoryState = createEmptyInboxOrderState(now);
  let lastError = null;
  function load() {
    try {
      const raw = storage?.getItem?.(INBOX_ORDER_STORAGE_KEY);
      if (!raw) return safeInboxOrderClone(memoryState);
      const state = normalizeInboxOrderState(JSON.parse(raw), { now });
      memoryState = state;
      lastError = null;
      return safeInboxOrderClone(state);
    } catch (error) {
      lastError = error;
      return safeInboxOrderClone(memoryState);
    }
  }
  function save(nextState) {
    const state = normalizeInboxOrderState({ ...nextState, updatedAt: isoNow(now) }, { now });
    try {
      if (!storage?.setItem) throw new Error("storage unavailable");
      storage.setItem(INBOX_ORDER_STORAGE_KEY, JSON.stringify(state));
      memoryState = state;
      lastError = null;
      return { state: safeInboxOrderClone(state), error: null };
    } catch (error) {
      lastError = error;
      throw new InboxOrderRepositoryError("LOCAL_SAVE_FAILED", "Inbox/order data could not be saved on this device.");
    }
  }
  return Object.freeze({
    storageKey: INBOX_ORDER_STORAGE_KEY,
    schemaVersion: INBOX_ORDER_SCHEMA_VERSION,
    load,
    save,
    getLastError: () => lastError,
  });
}
