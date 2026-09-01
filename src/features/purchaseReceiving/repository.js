import {
  PURCHASE_EVENT_TYPES,
  PURCHASE_DRAFT_STATES,
  PURCHASE_PROVENANCE_TYPES,
  PURCHASE_RECEIVING_COLLECTIONS,
  PURCHASE_RECEIVING_FORMAT,
  PURCHASE_RECEIVING_LIMITS,
  PURCHASE_RECEIVING_SCHEMA_VERSION,
  PURCHASE_RECEIVING_STORAGE_KEY,
} from "./constants.js";
import { deriveReceivingProjection, normalizeCanonicalPurchase, normalizePurchaseDraftInput, normalizeReceivingEvent } from "./contracts.js";
import { normalizePurchaseMoney } from "./money.js";
import { assertSafePurchaseReceivingInput, safePurchaseReceivingClone, sanitizePurchaseReceivingNote } from "./security.js";

export class PurchaseReceivingRepositoryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PurchaseReceivingRepositoryError";
    this.code = code;
    this.details = details;
  }
}

function isoNow(value) {
  const parsed = new Date(typeof value === "function" ? value() : value || Date.now());
  if (!Number.isFinite(parsed.getTime())) throw new PurchaseReceivingRepositoryError("INVALID_CLOCK", "A valid clock is required.");
  return parsed.toISOString();
}

function bounded(value, field, required = false) {
  if (value == null || value === "") {
    if (required) throw new PurchaseReceivingRepositoryError("REQUIRED_FIELD", `${field} is required.`);
    return null;
  }
  const text = String(value).trim();
  if (!text || text.length > 500) throw new PurchaseReceivingRepositoryError("INVALID_FIELD", `${field} must be a bounded string.`);
  return text;
}

function normalizedIdentityPart(value) {
  return String(value || "").trim().toUpperCase();
}

function externalOrderScopeKey(value) {
  const externalOrderId = normalizedIdentityPart(value?.externalOrderId ?? value?.orderId);
  if (!externalOrderId) return null;
  const retailer = normalizedIdentityPart(value?.retailerId ?? value?.retailer ?? value?.vendorName ?? value?.vendor);
  const account = normalizedIdentityPart(value?.retailerAccountReference ?? value?.accountReference);
  return `${retailer}:${account}:${externalOrderId}`;
}

function assertUniqueRecordKey(records, keyFor, code, message) {
  const seen = new Map();
  for (const record of records) {
    const key = keyFor(record);
    if (!key) continue;
    if (seen.has(key)) {
      throw new PurchaseReceivingRepositoryError(code, message, { firstId: seen.get(key), duplicateId: record.id });
    }
    seen.set(key, record.id);
  }
}

function systemFields(record, recordType) {
  const recordVersion = record.recordVersion;
  if (!Number.isInteger(recordVersion) || recordVersion < 1) throw new PurchaseReceivingRepositoryError("RECORD_VERSION_REQUIRED", `${recordType} requires a positive recordVersion.`);
  return {
    id: bounded(record.id, "id", true),
    format: PURCHASE_RECEIVING_FORMAT,
    recordType,
    recordVersion,
    createdAt: isoNow(record.createdAt),
    updatedAt: isoNow(record.updatedAt),
  };
}

function normalizePurchaseEvent(record) {
  const type = String(record.type || "").trim().toUpperCase();
  if (!Object.values(PURCHASE_EVENT_TYPES).includes(type)) throw new PurchaseReceivingRepositoryError("INVALID_PURCHASE_EVENT", "Purchase Event type is unsupported.");
  const quantity = record.quantity == null ? null : record.quantity;
  if (quantity != null && (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > PURCHASE_RECEIVING_LIMITS.maximumQuantity)) {
    throw new PurchaseReceivingRepositoryError("INVALID_PURCHASE_EVENT_QUANTITY", "Purchase Event quantity must be a bounded positive integer.");
  }
  return Object.freeze({
    ...systemFields(record, "PURCHASE_EVENT"),
    purchaseId: bounded(record.purchaseId, "purchaseId", true),
    draftId: bounded(record.draftId, "draftId"),
    idempotencyKey: bounded(record.idempotencyKey, "idempotencyKey", true),
    type,
    occurredAt: isoNow(record.occurredAt),
    confirmedAt: isoNow(record.confirmedAt || record.occurredAt),
    confirmationMethod: "VERIFIED_OWNER_SESSION",
    summary: sanitizePurchaseReceivingNote(record.summary, "Purchase history was recorded."),
    sourceReference: bounded(record.sourceReference, "sourceReference"),
    lineItemId: bounded(record.lineItemId, "lineItemId"),
    quantity,
    amount: record.amount == null ? null : normalizePurchaseMoney(record.amount, { field: "purchaseEvent.amount" }),
    relatedEventId: bounded(record.relatedEventId, "relatedEventId"),
    replacementReference: bounded(record.replacementReference, "replacementReference"),
    reason: record.reason == null ? null : sanitizePurchaseReceivingNote(record.reason),
    provenance: PURCHASE_PROVENANCE_TYPES.PURCHASE_CONFIRMATION,
    inventoryMutationPerformed: false,
  });
}

function normalizeActivity(record) {
  return Object.freeze({
    ...systemFields(record, "PURCHASE_RECEIVING_ACTIVITY"),
    type: bounded(record.type, "type", true),
    summary: sanitizePurchaseReceivingNote(record.summary, "Purchase/Receiving activity was recorded."),
    occurredAt: isoNow(record.occurredAt),
    draftId: bounded(record.draftId, "draftId"),
    purchaseId: bounded(record.purchaseId, "purchaseId"),
    receivingEventId: bounded(record.receivingEventId, "receivingEventId"),
  });
}

const NORMALIZERS = Object.freeze({
  purchaseDrafts: (record) => normalizePurchaseDraftInput(record, { persisted: true }),
  purchases: (record) => normalizeCanonicalPurchase(record, { persisted: true }),
  purchaseEvents: normalizePurchaseEvent,
  receivingEvents: (record) => normalizeReceivingEvent(record, { persisted: true }),
  activity: normalizeActivity,
});

export function createEmptyPurchaseReceivingState(now = () => new Date().toISOString()) {
  return Object.freeze({
    schemaVersion: PURCHASE_RECEIVING_SCHEMA_VERSION,
    updatedAt: isoNow(now),
    purchaseDrafts: Object.freeze([]),
    purchases: Object.freeze([]),
    purchaseEvents: Object.freeze([]),
    receivingEvents: Object.freeze([]),
    activity: Object.freeze([]),
  });
}

/** State is one LOCAL_ONLY document so draft confirmation can be committed atomically. */
export function normalizePurchaseReceivingState(value, options = {}) {
  assertSafePurchaseReceivingInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PurchaseReceivingRepositoryError("INVALID_STATE", "Purchase/Receiving state must be an object.");
  const allowed = new Set(["schemaVersion", "updatedAt", ...PURCHASE_RECEIVING_COLLECTIONS]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new PurchaseReceivingRepositoryError("UNKNOWN_STATE_FIELD", `Unsupported Purchase/Receiving state field: ${unknown[0]}.`);
  if (value.schemaVersion !== PURCHASE_RECEIVING_SCHEMA_VERSION) throw new PurchaseReceivingRepositoryError("UNSUPPORTED_SCHEMA_VERSION", "Purchase/Receiving schema version is unsupported.");
  const state = { schemaVersion: PURCHASE_RECEIVING_SCHEMA_VERSION, updatedAt: isoNow(value.updatedAt || options.now) };
  for (const collection of PURCHASE_RECEIVING_COLLECTIONS) {
    const records = value[collection];
    if (!Array.isArray(records) || records.length > PURCHASE_RECEIVING_LIMITS.maximumRecordsPerCollection) {
      throw new PurchaseReceivingRepositoryError("COLLECTION_INVALID", `${collection} must be a bounded array.`);
    }
    const ids = new Set();
    state[collection] = records.map((record, index) => {
      const normalized = NORMALIZERS[collection](record);
      if (ids.has(normalized.id)) throw new PurchaseReceivingRepositoryError("DUPLICATE_ID", `${collection} contains duplicate ID ${normalized.id}.`, { collection, index });
      ids.add(normalized.id);
      return safePurchaseReceivingClone(normalized);
    });
  }
  const purchasesById = new Map(state.purchases.map((purchase) => [purchase.id, purchase]));
  const draftsById = new Map(state.purchaseDrafts.map((draft) => [draft.id, draft]));
  assertUniqueRecordKey(
    state.purchaseDrafts,
    (draft) => normalizedIdentityPart(draft.sourceIdentityKey) || null,
    "DUPLICATE_SOURCE_IDENTITY",
    "Purchase Draft source identities must be unique.",
  );
  assertUniqueRecordKey(
    state.purchaseDrafts,
    externalOrderScopeKey,
    "DUPLICATE_EXTERNAL_ORDER_IDENTITY",
    "Purchase Draft retailer/account/external-order identities must be unique.",
  );
  assertUniqueRecordKey(
    state.purchases,
    (purchase) => normalizedIdentityPart(purchase.sourceDraftId),
    "DUPLICATE_PURCHASE_SOURCE_DRAFT",
    "Only one canonical Purchase may reference a Purchase Draft.",
  );
  assertUniqueRecordKey(
    state.purchases,
    (purchase) => normalizedIdentityPart(purchase.confirmationKey),
    "DUPLICATE_PURCHASE_CONFIRMATION_KEY",
    "Purchase confirmation keys must be unique.",
  );
  assertUniqueRecordKey(
    state.purchases,
    (purchase) => normalizedIdentityPart(purchase.sourceIdentityKey) || null,
    "DUPLICATE_PURCHASE_SOURCE_IDENTITY",
    "Canonical Purchase source identities must be unique.",
  );
  assertUniqueRecordKey(
    state.purchases,
    externalOrderScopeKey,
    "DUPLICATE_PURCHASE_EXTERNAL_ORDER_IDENTITY",
    "Canonical Purchase retailer/account/external-order identities must be unique.",
  );
  for (const purchase of state.purchases) {
    const sourceDraft = draftsById.get(purchase.sourceDraftId);
    if (!sourceDraft) throw new PurchaseReceivingRepositoryError("MISSING_SOURCE_DRAFT", "Canonical Purchase must reference an existing Purchase Draft.", { purchaseId: purchase.id });
    if (sourceDraft.status !== PURCHASE_DRAFT_STATES.CONFIRMED || sourceDraft.confirmedPurchaseId !== purchase.id) {
      throw new PurchaseReceivingRepositoryError("PURCHASE_DRAFT_CONFIRMATION_MISMATCH", "Purchase Draft confirmation must reference its canonical Purchase.", { purchaseId: purchase.id, draftId: sourceDraft.id });
    }
    const draftSourceIdentity = normalizedIdentityPart(sourceDraft.sourceIdentityKey);
    const purchaseSourceIdentity = normalizedIdentityPart(purchase.sourceIdentityKey);
    if (draftSourceIdentity && purchaseSourceIdentity && draftSourceIdentity !== purchaseSourceIdentity) {
      throw new PurchaseReceivingRepositoryError("PURCHASE_SOURCE_IDENTITY_MISMATCH", "Canonical Purchase source identity must match its Purchase Draft.", { purchaseId: purchase.id, draftId: sourceDraft.id });
    }
    const draftExternalIdentity = externalOrderScopeKey(sourceDraft);
    const purchaseExternalIdentity = externalOrderScopeKey(purchase);
    if (draftExternalIdentity && purchaseExternalIdentity && draftExternalIdentity !== purchaseExternalIdentity) {
      throw new PurchaseReceivingRepositoryError("PURCHASE_EXTERNAL_ORDER_IDENTITY_MISMATCH", "Canonical Purchase external-order identity must match its Purchase Draft.", { purchaseId: purchase.id, draftId: sourceDraft.id });
    }
  }
  for (const draft of state.purchaseDrafts) {
    if (draft.status === PURCHASE_DRAFT_STATES.CONFIRMED) {
      const purchase = purchasesById.get(draft.confirmedPurchaseId);
      if (!purchase || purchase.sourceDraftId !== draft.id) {
        throw new PurchaseReceivingRepositoryError("CONFIRMED_DRAFT_PURCHASE_MISSING", "A confirmed Purchase Draft must reference its canonical Purchase.", { draftId: draft.id });
      }
    } else if (draft.confirmedPurchaseId) {
      throw new PurchaseReceivingRepositoryError("UNCONFIRMED_DRAFT_PURCHASE_REFERENCE", "A non-confirmed Purchase Draft cannot reference a canonical Purchase.", { draftId: draft.id });
    }
  }
  const eventKeys = new Set();
  const historyEventsById = new Map();
  const historyEventsByPurchaseId = new Map();
  for (const event of [...state.purchaseEvents, ...state.receivingEvents]) {
    const purchase = purchasesById.get(event.purchaseId);
    if (!purchase) throw new PurchaseReceivingRepositoryError("MISSING_PURCHASE_REFERENCE", "Purchase/Receiving history must reference an existing Purchase.", { eventId: event.id });
    const key = `${event.recordType}:${event.purchaseId}:${event.idempotencyKey}`;
    if (eventKeys.has(key)) throw new PurchaseReceivingRepositoryError("DUPLICATE_IDEMPOTENCY_KEY", "History idempotency keys must be unique within a Purchase and event type.", { eventId: event.id });
    eventKeys.add(key);
    if (historyEventsById.has(event.id)) {
      throw new PurchaseReceivingRepositoryError("DUPLICATE_HISTORY_EVENT_ID", "Purchase and Receiving history IDs must be globally unique.", { eventId: event.id });
    }
    historyEventsById.set(event.id, event);
    const related = historyEventsByPurchaseId.get(event.purchaseId) || [];
    related.push(event);
    historyEventsByPurchaseId.set(event.purchaseId, related);
    if (event.amount && event.amount.currency !== purchase.currency) throw new PurchaseReceivingRepositoryError("EVENT_CURRENCY_MISMATCH", "Purchase Event money must use the Purchase currency.", { eventId: event.id });
    if (event.recordType === "RECEIVING_EVENT") {
      const lineIds = new Set(purchase.lineItems.map((line) => line.lineItemId));
      if (event.entries.some((entry) => !lineIds.has(entry.lineItemId))) throw new PurchaseReceivingRepositoryError("MISSING_LINE_REFERENCE", "Receiving Event references an unknown Purchase line.", { eventId: event.id });
    }
  }
  for (const purchase of state.purchases) {
    const projection = deriveReceivingProjection(purchase, state.receivingEvents);
    if (purchase.receivingStatus !== projection.status) {
      throw new PurchaseReceivingRepositoryError("RECEIVING_STATUS_MISMATCH", "Purchase receiving status must equal its append-only Receiving Event projection.", { purchaseId: purchase.id });
    }
    const references = new Set(purchase.historyReferences);
    for (const reference of references) {
      const event = historyEventsById.get(reference);
      if (!event || event.purchaseId !== purchase.id) {
        throw new PurchaseReceivingRepositoryError("MISSING_PURCHASE_HISTORY_REFERENCE", "Purchase history reference must resolve to an event for that Purchase.", { purchaseId: purchase.id, reference });
      }
    }
    const relatedEvents = historyEventsByPurchaseId.get(purchase.id) || [];
    if (relatedEvents.some((event) => !references.has(event.id))) {
      throw new PurchaseReceivingRepositoryError("UNREFERENCED_PURCHASE_HISTORY_EVENT", "Every Purchase or Receiving event must be referenced by its Purchase history.", { purchaseId: purchase.id });
    }
    const confirmationEvents = relatedEvents.filter((event) => event.recordType === "PURCHASE_EVENT" && event.type === PURCHASE_EVENT_TYPES.PURCHASE_CONFIRMED);
    if (confirmationEvents.length !== 1
      || confirmationEvents[0].draftId !== purchase.sourceDraftId
      || confirmationEvents[0].idempotencyKey !== purchase.confirmationKey) {
      throw new PurchaseReceivingRepositoryError("PURCHASE_CONFIRMATION_EVENT_MISSING", "Canonical Purchase requires exactly one matching owner-confirmation history event.", { purchaseId: purchase.id });
    }
  }
  return Object.freeze(Object.fromEntries(Object.entries(state).map(([key, entry]) => [key, Array.isArray(entry) ? Object.freeze(entry) : entry])));
}

export function serializePurchaseReceivingState(value) {
  return JSON.stringify(normalizePurchaseReceivingState(value));
}

export function deserializePurchaseReceivingState(raw, options = {}) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return { state: normalizePurchaseReceivingState(parsed, options), error: null };
  } catch (error) {
    return { state: createEmptyPurchaseReceivingState(options.now), error };
  }
}

/** Explicit test helper; production repository never silently selects memory storage. */
export function createMemoryPurchaseReceivingStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return Object.freeze({
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: (key) => values.delete(String(key)),
    snapshot: () => Object.freeze(Object.fromEntries(values)),
  });
}

export function createPurchaseReceivingRepository(storage = globalThis.localStorage, options = {}) {
  const now = options.now || (() => new Date().toISOString());
  let lastError = null;

  function load() {
    try {
      const raw = storage?.getItem?.(PURCHASE_RECEIVING_STORAGE_KEY);
      if (!raw) {
        lastError = null;
        return safePurchaseReceivingClone(createEmptyPurchaseReceivingState(now));
      }
      const result = deserializePurchaseReceivingState(raw, { now });
      lastError = result.error;
      if (result.error) throw result.error;
      return safePurchaseReceivingClone(result.state);
    } catch (error) {
      lastError = error;
      throw new PurchaseReceivingRepositoryError("LOCAL_LOAD_FAILED", "Purchase/Receiving data could not be safely loaded from this device.");
    }
  }

  function save(nextState) {
    const state = normalizePurchaseReceivingState({ ...nextState, updatedAt: isoNow(now) }, { now });
    try {
      if (!storage?.setItem) throw new Error("storage unavailable");
      storage.setItem(PURCHASE_RECEIVING_STORAGE_KEY, JSON.stringify(state));
      lastError = null;
      return safePurchaseReceivingClone(state);
    } catch (error) {
      lastError = error;
      throw new PurchaseReceivingRepositoryError("LOCAL_SAVE_FAILED", "Purchase/Receiving data could not be saved on this device.");
    }
  }

  return Object.freeze({
    storageKey: PURCHASE_RECEIVING_STORAGE_KEY,
    schemaVersion: PURCHASE_RECEIVING_SCHEMA_VERSION,
    authoritative: "LOCAL_ONLY",
    remoteActive: false,
    load,
    save,
    getLastError: () => lastError,
  });
}
