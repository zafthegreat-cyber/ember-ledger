import {
  FLIP_SCOUT_SCHEMA_VERSION,
  FLIP_SCOUT_STORAGE_KEY,
  RECORD_COLLECTIONS,
  createEmptyFlipScoutState,
} from "./constants.js";
import { validateInventoryCreationStateBundles } from "../purchaseReceiving/inventoryCreation/contracts.js";
import { assertSafePurchaseReceivingInput } from "../purchaseReceiving/security.js";
import { soldQuantityForInventory } from "./inventory.js";
import { validateManagedInventorySales } from "./exactInventoryCost.js";
import { PURCHASE_INVENTORY_MUTATION_LOCK } from "../purchaseReceiving/persistence.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const MANAGED_COLLECTIONS = Object.freeze(["inventoryLots", "inventoryCreationApplications", "inventoryCreationEvents", "inventoryAdjustments"]);
const MANAGED_SALE_STATUS_BY_KEY = Object.freeze({ draft: "Draft", completed: "Completed", refunded: "Refunded", cancelled: "Cancelled" });
const INVENTORY_COMMIT_JOURNAL_FORMAT = "code3.inventory-creation-commit-journal.v1";
const INVENTORY_COMMIT_JOURNAL_KEY = `${FLIP_SCOUT_STORAGE_KEY}.inventory-creation-commit-journal.v1`;

function managedSnapshot(state) {
  return {
    inventory: (state.inventory || []).filter((record) => record.provenanceManaged === true),
    ...Object.fromEntries(MANAGED_COLLECTIONS.map((collection) => [collection, state[collection] || []])),
    activity: (state.activity || []).filter((record) => record.provenanceManaged === true),
  };
}

function managedStateUnchanged(current, next) {
  return JSON.stringify(managedSnapshot(current)) === JSON.stringify(managedSnapshot(next));
}

function hasInventoryCreationBundles(state = {}) {
  return MANAGED_COLLECTIONS.some((collection) => Array.isArray(state[collection]) && state[collection].length > 0);
}

function managedRevision(state) {
  return JSON.stringify(managedSnapshot(normalizeFlipScoutState(state)));
}

function mergeOwnerConfirmedInventory(current, requested) {
  const requestedManagedInventory = requested.inventory.filter((record) => record.provenanceManaged === true);
  const currentUnmanagedInventory = current.inventory.filter((record) => record.provenanceManaged !== true);
  const requestedManagedActivity = requested.activity.filter((record) => record.provenanceManaged === true);
  const requestedManagedActivityIds = new Set(requestedManagedActivity.map((record) => record.id));
  return {
    ...current,
    inventory: [...requestedManagedInventory, ...currentUnmanagedInventory],
    ...Object.fromEntries(MANAGED_COLLECTIONS.map((collection) => [collection, requested[collection]])),
    activity: [...requestedManagedActivity, ...current.activity.filter((record) => !requestedManagedActivityIds.has(record.id))],
  };
}

function restoreManagedInventorySnapshot(fresh, original) {
  return {
    ...fresh,
    inventory: [
      ...original.inventory.filter((record) => record.provenanceManaged === true),
      ...fresh.inventory.filter((record) => record.provenanceManaged !== true),
    ],
    ...Object.fromEntries(MANAGED_COLLECTIONS.map((collection) => [collection, original[collection]])),
    activity: [
      ...original.activity.filter((record) => record.provenanceManaged === true),
      ...fresh.activity.filter((record) => record.provenanceManaged !== true),
    ],
  };
}

function normalizeManagedSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Inventory recovery metadata is invalid.");
  const allowed = new Set(["inventory", ...MANAGED_COLLECTIONS, "activity"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error("Inventory recovery metadata is invalid.");
  for (const collection of allowed) {
    if (!Array.isArray(value[collection])) throw new Error("Inventory recovery metadata is invalid.");
  }
  if (value.inventory.some((record) => record?.provenanceManaged !== true)
    || value.activity.some((record) => record?.provenanceManaged !== true)) {
    throw new Error("Inventory recovery metadata is invalid.");
  }
  const state = normalizeFlipScoutState({
    ...createEmptyFlipScoutState(),
    inventory: value.inventory,
    ...Object.fromEntries(MANAGED_COLLECTIONS.map((collection) => [collection, value[collection]])),
    activity: value.activity,
  });
  validateInventoryCreationStateBundles(state, { allowIncomplete: true });
  assertSafePurchaseReceivingInput(state.activity);
  return managedSnapshot(state);
}

function parseInventoryCommitJournal(raw) {
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.format !== INVENTORY_COMMIT_JOURNAL_FORMAT
    || value.status !== "PREPARED"
    || Object.keys(value).some((key) => !["format", "status", "createdAt", "originalManagedSnapshot"].includes(key))
    || !Number.isFinite(new Date(value.createdAt).getTime())) {
    throw new Error("Inventory recovery metadata is invalid.");
  }
  return Object.freeze({
    format: INVENTORY_COMMIT_JOURNAL_FORMAT,
    status: "PREPARED",
    createdAt: new Date(value.createdAt).toISOString(),
    originalManagedSnapshot: normalizeManagedSnapshot(value.originalManagedSnapshot),
  });
}

function saleCountsAgainstManagedInventory(state, sale) {
  if (["draft", "cancelled"].includes(String(sale?.status || "").trim().toLowerCase())) return false;
  return state.inventory.some((item) => item.id === sale?.inventoryItemId && item.provenanceManaged === true);
}

function requireManagedSalesPreserved(current, next) {
  const nextById = new Map((next.sales || []).map((sale) => [sale.id, sale]));
  for (const sale of (current.sales || []).filter((record) => saleCountsAgainstManagedInventory(current, record))) {
    if (JSON.stringify(nextById.get(sale.id) || null) !== JSON.stringify(sale)) {
      throw new Error("Completed sales of owner-confirmed Inventory are append-only and require a dedicated correction workflow.");
    }
  }
}

function nextManagedSaleAllocationSequence(state, inventoryItemId) {
  return (state.sales || [])
    .filter((sale) => sale.inventoryItemId === inventoryItemId && saleCountsAgainstManagedInventory(state, sale))
    .reduce((maximum, sale) => Math.max(maximum, Number(sale.inventoryAllocationSequence) || 0), 0) + 1;
}

function requireManagedSaleAppendAuthority(current, next, allowedSaleId) {
  const currentActiveIds = new Set((current.sales || [])
    .filter((sale) => saleCountsAgainstManagedInventory(current, sale))
    .map((sale) => sale.id));
  const additions = (next.sales || []).filter((sale) => saleCountsAgainstManagedInventory(next, sale) && !currentActiveIds.has(sale.id));
  if (!additions.length) return;
  if (additions.length !== 1 || additions[0].id !== allowedSaleId) {
    throw new Error("Owner-confirmed Inventory sales must be appended through the verified sale workflow.");
  }
  const sale = additions[0];
  if (sale.inventoryAllocationSequence !== nextManagedSaleAllocationSequence(current, sale.inventoryItemId)
    || !Number.isFinite(new Date(sale.inventoryAllocationAt).getTime())) {
    throw new Error("Owner-confirmed Inventory sale allocation authority is invalid.");
  }
}

const MUTABLE_ACQUISITION_FIELDS = new Set([
  "recordVersion", "updatedAt", "productReference", "productTitle", "name", "productClassification", "condition", "disposition",
  "inventoryDispositionState", "quantity", "acquisitionCostMinorUnits", "unitAcquisitionCostsMinorUnits", "status",
]);

function immutableProjection(record, mutableFields = new Set()) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !mutableFields.has(key)));
}

function requirePreservedRecords(currentRows, nextRows, label, mutableFields = new Set()) {
  const nextById = new Map(nextRows.map((record) => [record.id, record]));
  for (const currentRecord of currentRows) {
    const nextRecord = nextById.get(currentRecord.id);
    if (!nextRecord) throw new Error(`${label} is append-only and cannot be deleted.`);
    if (JSON.stringify(immutableProjection(currentRecord, mutableFields)) !== JSON.stringify(immutableProjection(nextRecord, mutableFields))) {
      throw new Error(`${label} immutable provenance cannot be changed.`);
    }
    if (mutableFields.size) {
      const mutableChanged = JSON.stringify(Object.fromEntries(Object.entries(currentRecord).filter(([key]) => mutableFields.has(key) && key !== "recordVersion" && key !== "updatedAt")))
        !== JSON.stringify(Object.fromEntries(Object.entries(nextRecord).filter(([key]) => mutableFields.has(key) && key !== "recordVersion" && key !== "updatedAt")));
      const expectedVersion = currentRecord.recordVersion + (mutableChanged ? 1 : 0);
      if (nextRecord.recordVersion !== expectedVersion) {
        throw new Error(`${label} quantity/version transition is invalid.`);
      }
      if (!mutableChanged && nextRecord.updatedAt !== currentRecord.updatedAt) throw new Error(`${label} cannot change its timestamp without a managed transition.`);
    }
  }
}

function validateManagedTransition(current, next) {
  const currentBundles = validateInventoryCreationStateBundles(current, { allowIncomplete: true });
  const nextBundles = validateInventoryCreationStateBundles(next);
  requirePreservedRecords(currentBundles.applications, nextBundles.applications, "Inventory creation applications");
  requirePreservedRecords(currentBundles.events, nextBundles.events, "Inventory creation events");
  requirePreservedRecords(currentBundles.adjustments, nextBundles.adjustments, "Inventory adjustments");
  requirePreservedRecords(currentBundles.lots, nextBundles.lots, "Inventory acquisition lots", MUTABLE_ACQUISITION_FIELDS);
  requirePreservedRecords(currentBundles.items, nextBundles.items, "Managed Inventory items", MUTABLE_ACQUISITION_FIELDS);

  const currentManagedActivity = current.activity.filter((record) => record.provenanceManaged === true);
  const nextManagedActivity = next.activity.filter((record) => record.provenanceManaged === true);
  requirePreservedRecords(currentManagedActivity, nextManagedActivity, "Managed Inventory activity");
  const currentActivityIds = new Set(currentManagedActivity.map((record) => record.id));
  const eventById = new Map(nextBundles.events.map((event) => [event.id, event]));
  for (const activity of nextManagedActivity.filter((record) => !currentActivityIds.has(record.id))) {
    assertSafePurchaseReceivingInput(activity);
    const allowedFields = new Set(["id", "type", "summary", "occurredAt", "purchaseId", "inventoryItemId", "inventoryLotId", "provenanceManaged", "createdAt", "updatedAt"]);
    if (Object.keys(activity).some((key) => !allowedFields.has(key))) throw new Error("Managed Inventory activity contains an unsupported field.");
    const eventId = String(activity.id || "").replace(/^activity:/, "");
    const event = eventById.get(eventId);
    if (!event
      || activity.id !== `activity:${event.id}`
      || activity.type !== "INVENTORY_CREATED_FROM_RECEIVING"
      || activity.summary !== "Owner confirmed local Inventory creation from reviewed Receiving evidence."
      || activity.occurredAt !== event.occurredAt
      || activity.createdAt !== event.occurredAt
      || activity.updatedAt !== event.occurredAt
      || activity.purchaseId !== event.purchaseId
      || activity.inventoryItemId !== event.inventoryItemId
      || activity.inventoryLotId !== event.inventoryLotId) {
      throw new Error("Managed Inventory activity must match its deterministic creation event.");
    }
  }

  for (const item of nextBundles.items) {
    const completedSoldQuantity = soldQuantityForInventory(item.id, current.sales);
    if (item.quantity < completedSoldQuantity) {
      throw new Error("Inventory reversal conflicts with quantity already recorded in completed sales.");
    }
  }

  const currentIds = new Set([
    ...currentBundles.applications.map((record) => record.id),
    ...currentBundles.events.map((record) => record.id),
    ...currentBundles.lots.map((record) => record.id),
    ...currentBundles.items.map((record) => record.id),
  ]);
  const requiresSourceVerification = [
    ...nextBundles.applications,
    ...nextBundles.events,
    ...nextBundles.lots,
    ...nextBundles.items,
  ].some((record) => !currentIds.has(record.id));
  return { requiresSourceVerification, requiresRecoveryJournal: !managedStateUnchanged(current, next) };
}

function makeId(prefix = "record") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeFlipScoutState(value, now = new Date().toISOString()) {
  const empty = createEmptyFlipScoutState(now);
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  if (Number(value.schemaVersion || 1) > FLIP_SCOUT_SCHEMA_VERSION) {
    throw new Error("This Business inventory data uses a newer unsupported schema.");
  }
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

export function createFlipScoutRepository(storage = globalThis.localStorage, options = {}) {
  let lastError = "";
  const lockManager = options.lockManager;

  function runLocked(action) {
    if (typeof action !== "function") return Promise.reject(new Error("A locked Business mutation callback is required."));
    if (typeof lockManager === "function") return lockManager(PURCHASE_INVENTORY_MUTATION_LOCK, action);
    if (typeof window === "undefined") return Promise.resolve().then(action);
    if (globalThis.navigator?.locks?.request) {
      return globalThis.navigator.locks.request(PURCHASE_INVENTORY_MUTATION_LOCK, { mode: "exclusive" }, action);
    }
    return Promise.reject(new Error("Business mutation requires same-origin exclusive locking."));
  }

  function readStoredState() {
    const raw = storage?.getItem?.(FLIP_SCOUT_STORAGE_KEY);
    if (!raw) return { state: createEmptyFlipScoutState(), error: "" };
    return deserializeFlipScoutState(raw);
  }

  function readPendingJournal() {
    return parseInventoryCommitJournal(storage?.getItem?.(INVENTORY_COMMIT_JOURNAL_KEY));
  }

  function removePendingJournal() {
    if (typeof storage?.removeItem !== "function") throw new Error("Inventory recovery storage is unavailable.");
    storage.removeItem(INVENTORY_COMMIT_JOURNAL_KEY);
    if (storage.getItem(INVENTORY_COMMIT_JOURNAL_KEY) != null) throw new Error("Inventory recovery metadata could not be cleared.");
  }

  function writeManagedRollback(journal) {
    const fresh = readStoredState();
    if (fresh.error) throw new Error(fresh.error);
    const rollback = normalizeFlipScoutState({
      ...restoreManagedInventorySnapshot(fresh.state, journal.originalManagedSnapshot),
      updatedAt: new Date().toISOString(),
    });
    storage.setItem(FLIP_SCOUT_STORAGE_KEY, JSON.stringify(rollback));
    const verified = readStoredState();
    if (verified.error || JSON.stringify(managedSnapshot(verified.state)) !== JSON.stringify(journal.originalManagedSnapshot)) {
      throw new Error("Inventory recovery could not verify the restored acquisition state.");
    }
    removePendingJournal();
    return verified.state;
  }

  function recoverPendingJournal() {
    try {
      const journal = readPendingJournal();
      if (!journal) return { recovered: false, state: null, error: "" };
      const state = writeManagedRollback(journal);
      return { recovered: true, state, error: "" };
    } catch (error) {
      return {
        recovered: false,
        state: null,
        error: error?.message || "Inventory recovery could not be completed safely.",
      };
    }
  }

  function load() {
    if (!storage?.getItem) {
      lastError = "Business inventory storage is unavailable.";
      return createEmptyFlipScoutState();
    }
    try {
      const parsed = readStoredState();
      if (parsed.error) {
        lastError = parsed.error;
        return parsed.state;
      }
      const journal = readPendingJournal();
      if (journal) {
        // A prepared journal means a previous cross-store commit was not proven.
        // Project the last verified managed snapshot until the next mutation repairs it.
        lastError = "";
        return normalizeFlipScoutState(restoreManagedInventorySnapshot(parsed.state, journal.originalManagedSnapshot));
      }
      lastError = "";
      return parsed.state;
    } catch (error) {
      lastError = error?.message || "Sourcing storage is unavailable.";
      return createEmptyFlipScoutState();
    }
  }

  function persist(nextState, options = {}) {
    const requested = normalizeFlipScoutState({ ...nextState, updatedAt: new Date().toISOString() });
    const recovery = recoverPendingJournal();
    if (recovery.error) {
      lastError = recovery.error;
      return {
        state: load(),
        error: lastError,
        writeAttempted: false,
        fatal: true,
        recoveryPending: true,
      };
    }
    const current = load();
    if (lastError) return { state: current, error: lastError, writeAttempted: false };
    const allowOwnerConfirmedInventoryMutation = options.allowOwnerConfirmedInventoryMutation === true;
    if (!allowOwnerConfirmedInventoryMutation && !managedStateUnchanged(current, requested)) {
      const error = "Owner-confirmed acquisition history can change only through its verified Inventory workflow.";
      lastError = error;
      return { state: current, error, writeAttempted: false };
    }
    if (allowOwnerConfirmedInventoryMutation && managedRevision(current) !== options.expectedManagedRevision) {
      const error = "Owner-confirmed Inventory changed before the verified mutation could be committed.";
      lastError = error;
      return { state: current, error, writeAttempted: false };
    }
    const normalized = allowOwnerConfirmedInventoryMutation
      ? normalizeFlipScoutState({ ...mergeOwnerConfirmedInventory(current, requested), updatedAt: new Date().toISOString() })
      : requested;
    try {
      if (allowOwnerConfirmedInventoryMutation || hasInventoryCreationBundles(current) || hasInventoryCreationBundles(normalized)) {
        validateInventoryCreationStateBundles(current, { allowIncomplete: allowOwnerConfirmedInventoryMutation });
        validateInventoryCreationStateBundles(normalized);
      }
      requireManagedSalesPreserved(current, normalized);
      requireManagedSaleAppendAuthority(current, normalized, options.allowManagedSaleAppendId);
      validateManagedInventorySales(normalized);
    } catch (error) {
      lastError = error?.message || "Owner-confirmed Inventory sales are invalid.";
      return { state: current, error: lastError, writeAttempted: false };
    }
    let requiresSourceVerification = false;
    let requiresRecoveryJournal = false;
    if (allowOwnerConfirmedInventoryMutation) {
      let transition;
      try {
        transition = validateManagedTransition(current, normalized);
      } catch (error) {
        lastError = error?.message || "Owner-confirmed Inventory transition is invalid.";
        return { state: current, error: lastError, writeAttempted: false };
      }
      requiresSourceVerification = transition.requiresSourceVerification;
      requiresRecoveryJournal = transition.requiresRecoveryJournal;
      if (transition.requiresSourceVerification) {
        let sourceVerified = false;
        try {
          sourceVerified = typeof options.verifySourceRevision === "function" && options.verifySourceRevision(current) === true;
        } catch {
          sourceVerified = false;
        }
        if (!sourceVerified) {
          const error = "Purchase and Receiving evidence changed before Inventory creation could be committed.";
          lastError = error;
          return { state: current, error, writeAttempted: false };
        }
      }
    }
    if (!storage?.setItem) {
      const error = "Business inventory storage is unavailable.";
      lastError = error;
      return { state: current, error, writeAttempted: false };
    }
    let journal = null;
    if (requiresRecoveryJournal) {
      journal = Object.freeze({
        format: INVENTORY_COMMIT_JOURNAL_FORMAT,
        status: "PREPARED",
        createdAt: new Date().toISOString(),
        originalManagedSnapshot: managedSnapshot(current),
      });
      try {
        storage.setItem(INVENTORY_COMMIT_JOURNAL_KEY, JSON.stringify(journal));
        const persistedJournal = readPendingJournal();
        if (!persistedJournal || JSON.stringify(persistedJournal.originalManagedSnapshot) !== JSON.stringify(journal.originalManagedSnapshot)) {
          throw new Error("Inventory recovery metadata could not be verified.");
        }
      } catch (error) {
        try { removePendingJournal(); } catch { /* A remaining journal keeps reads on the verified snapshot. */ }
        lastError = error?.message || "Inventory recovery metadata could not be prepared.";
        return { state: current, error: lastError, writeAttempted: false, fatal: true, recoveryPending: storage.getItem(INVENTORY_COMMIT_JOURNAL_KEY) != null };
      }
    }
    try {
      storage.setItem(FLIP_SCOUT_STORAGE_KEY, JSON.stringify(normalized));
      if (requiresSourceVerification) {
        let sourceStillVerified = false;
        try {
          sourceStillVerified = typeof options.verifySourceRevision === "function" && options.verifySourceRevision(current) === true;
        } catch {
          sourceStillVerified = false;
        }
        if (!sourceStillVerified) {
          try {
            const rollback = writeManagedRollback(journal);
            const error = "Purchase and Receiving evidence changed while Inventory creation was being committed; the managed write was rolled back.";
            lastError = error;
            return { state: rollback, error, writeAttempted: true, rolledBack: true };
          } catch (rollbackError) {
            lastError = rollbackError?.message || "Inventory recovery could not be completed safely.";
            return { state: load(), error: lastError, writeAttempted: true, fatal: true, rollbackFailed: true, recoveryPending: true };
          }
        }
      }
      if (requiresRecoveryJournal) {
        try {
          removePendingJournal();
        } catch (journalError) {
          lastError = journalError?.message || "Inventory recovery metadata could not be cleared.";
          return { state: load(), error: lastError, writeAttempted: true, fatal: true, recoveryPending: true };
        }
      }
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
        window.dispatchEvent(new CustomEvent("private-business-hub:flip-scout-data", { detail: { state: normalized } }));
      }
      lastError = "";
      return { state: normalized, error: "", writeAttempted: true };
    } catch (error) {
      if (journal) {
        try {
          const rollback = writeManagedRollback(journal);
          lastError = error?.message || "Sourcing data could not be saved on this device.";
          return { state: rollback, error: lastError, writeAttempted: true, rolledBack: true };
        } catch (rollbackError) {
          lastError = rollbackError?.message || "Inventory recovery could not be completed safely.";
          return { state: load(), error: lastError, writeAttempted: true, fatal: true, rollbackFailed: true, recoveryPending: true };
        }
      }
      // localStorage may throw after durably accepting a write. Resolve that
      // ambiguity by exact read-back so callers never retry a successful sale
      // or other Business mutation merely because the storage response failed.
      try {
        const readBack = readStoredState();
        if (!readBack.error && JSON.stringify(readBack.state) === JSON.stringify(normalized)) {
          lastError = "";
          return { state: readBack.state, error: "", writeAttempted: true, verifiedAfterAmbiguousWrite: true };
        }
      } catch {
        // The original storage failure remains authoritative.
      }
      lastError = error?.message || "Sourcing data could not be saved on this device.";
      return { state: current, error: lastError, writeAttempted: true };
    }
  }

  function upsert(collection, record, options = {}) {
    if (!RECORD_COLLECTIONS.includes(collection)) throw new Error(`Unknown sourcing collection: ${collection}`);
    const current = load();
    const existing = current[collection].find((entry) => entry.id === record.id);
    if (existing?.provenanceManaged === true) {
      throw new Error("Owner-confirmed acquisition records must be changed through their append-only correction workflow.");
    }
    if (collection === "sales" && existing && saleCountsAgainstManagedInventory(current, existing)) {
      throw new Error("Completed sales of owner-confirmed Inventory are append-only and cannot be edited generically.");
    }
    const now = new Date().toISOString();
    const nextRecord = {
      ...record,
      id: record.id || makeId(collection.replace(/s$/, "")),
      createdAt: record.createdAt || now,
      updatedAt: now,
    };
    const managedTarget = current.inventory.find((item) => item.id === nextRecord.inventoryItemId && item.provenanceManaged === true);
    if (collection === "sales" && managedTarget) {
      const canonicalStatus = MANAGED_SALE_STATUS_BY_KEY[String(nextRecord.status || "").trim().toLowerCase()];
      if (!canonicalStatus) throw new Error("Owner-confirmed Inventory sales require a supported canonical status.");
      nextRecord.status = canonicalStatus;
    }
    const createsManagedAllocation = managedTarget && saleCountsAgainstManagedInventory({ ...current, sales: [nextRecord] }, nextRecord);
    if (collection === "sales" && createsManagedAllocation) {
      nextRecord.inventoryAllocationSequence = nextManagedSaleAllocationSequence(current, nextRecord.inventoryItemId);
      nextRecord.inventoryAllocationAt = now;
    } else if (collection === "sales" && !existing) {
      delete nextRecord.inventoryAllocationSequence;
      delete nextRecord.inventoryAllocationAt;
    }
    const rows = current[collection];
    const nextRows = rows.some((row) => row.id === nextRecord.id)
      ? rows.map((row) => row.id === nextRecord.id ? { ...row, ...nextRecord } : row)
      : [nextRecord, ...rows];
    const nextActivity = options.activityRecord
      ? [options.activityRecord, ...current.activity].slice(0, 150)
      : current.activity;
    const nextState = { ...current, [collection]: nextRows, activity: nextActivity };
    const result = collection === "sales" && createsManagedAllocation
      ? persist(nextState, { allowManagedSaleAppendId: nextRecord.id })
      : save(nextState);
    return { ...result, record: nextRecord };
  }

  function remove(collection, id, options = {}) {
    if (!RECORD_COLLECTIONS.includes(collection)) throw new Error(`Unknown sourcing collection: ${collection}`);
    const current = load();
    if (current[collection].some((record) => record.id === id && record.provenanceManaged === true)) {
      throw new Error("Owner-confirmed acquisition records cannot be deleted from the generic editor.");
    }
    if (collection === "sales" && current.sales.some((sale) => sale.id === id && saleCountsAgainstManagedInventory(current, sale))) {
      throw new Error("Completed sales of owner-confirmed Inventory require an append-only correction workflow.");
    }
    return save({
      ...current,
      [collection]: current[collection].filter((record) => record.id !== id),
      activity: options.activityRecord ? [options.activityRecord, ...current.activity].slice(0, 150) : current.activity,
    });
  }

  function replace(nextState) {
    return save(normalizeFlipScoutState(nextState));
  }

  function save(nextState) {
    return persist(nextState);
  }

  function commitOwnerConfirmedInventory(nextState, options = {}) {
    if (typeof options.expectedManagedRevision !== "string") {
      return { state: load(), error: "Owner-confirmed Inventory commit requires a managed-state revision.", writeAttempted: false };
    }
    return persist(nextState, {
      allowOwnerConfirmedInventoryMutation: true,
      expectedManagedRevision: options.expectedManagedRevision,
      verifySourceRevision: options.verifySourceRevision,
    });
  }

  function exportJson() {
    return serializeFlipScoutState(load());
  }

  function importJson(raw) {
    const parsed = deserializeFlipScoutState(raw);
    if (parsed.error) return { state: load(), error: parsed.error };
    const current = load();
    for (const collection of ["inventory", "inventoryLots", "inventoryCreationApplications", "inventoryCreationEvents", "inventoryAdjustments"]) {
      const protectedRows = current[collection].filter((record) => record.provenanceManaged === true || collection !== "inventory");
      if (protectedRows.some((record) => JSON.stringify(parsed.state[collection].find((entry) => entry.id === record.id) || null) !== JSON.stringify(record))) {
        return { state: current, error: "Owner-confirmed acquisition history cannot be replaced by generic Business import." };
      }
    }
    for (const sale of current.sales.filter((record) => saleCountsAgainstManagedInventory(current, record))) {
      if (JSON.stringify(parsed.state.sales.find((entry) => entry.id === sale.id) || null) !== JSON.stringify(sale)) {
        return { state: current, error: "Completed sales of owner-confirmed Inventory cannot be replaced by generic Business import." };
      }
    }
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
    commitOwnerConfirmedInventory,
    managedRevision,
    exportJson,
    importJson,
    runLocked,
    snapshot: () => clone(load()),
    getLastError: () => lastError,
  };
}
