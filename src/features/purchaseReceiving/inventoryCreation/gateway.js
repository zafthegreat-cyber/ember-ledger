import { canonicalStringify } from "../../backup/canonicalJson.js";
import { createFlipScoutRepository } from "../../flipScout/storageRepository.js";
import { soldQuantityForInventory } from "../../flipScout/inventory.js";
import { PURCHASE_INVENTORY_MUTATION_LOCK } from "../persistence.js";
import { assertSafePurchaseReceivingInput, sanitizePurchaseReceivingNote } from "../security.js";
import {
  inventoryAdjustmentIdentityId,
  inventoryCreationIdentityIds,
  normalizeInventoryAdjustmentIdempotencyKey,
  normalizeInventoryAcquisitionLot,
  normalizeInventoryAdjustment,
  normalizeInventoryCreationApplication,
  normalizeInventoryCreationEvent,
  normalizeProvenanceManagedInventoryItem,
  validateInventoryCreationStateBundles,
} from "./contracts.js";
import {
  INVENTORY_ADJUSTMENT_TYPES,
  INVENTORY_CREATION_APPLICATION_STATES,
  INVENTORY_CREATION_EVENT_TYPES,
  INVENTORY_CREATION_FORMAT,
} from "./constants.js";


export class InventoryCreationGatewayError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "InventoryCreationGatewayError";
    this.code = code;
    this.details = details;
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isoNow(clock) {
  const value = new Date(clock());
  if (!Number.isFinite(value.getTime())) throw new InventoryCreationGatewayError("INVALID_CLOCK", "A valid Inventory clock is required.");
  return value.toISOString();
}

export function inventoryCreationRecordIds(candidateId) {
  return inventoryCreationIdentityIds(candidateId);
}

function assertCandidate(candidate) {
  assertSafePurchaseReceivingInput(candidate);
  if (!candidate || candidate.recordType !== "INVENTORY_CREATION_CANDIDATE" || candidate.authoritative !== false || candidate.persisted !== false) {
    throw new InventoryCreationGatewayError("INVALID_CANDIDATE", "Only a freshly re-derived Inventory Creation Candidate may be confirmed.");
  }
  if (!candidate.eligible || candidate.blockers?.length) {
    throw new InventoryCreationGatewayError("CANDIDATE_BLOCKED", "Inventory Creation Candidate has unresolved blocking review items.", { blockers: clone(candidate.blockers || []) });
  }
  if (!Number.isSafeInteger(candidate.quantityEligible) || candidate.quantityEligible < 1) {
    throw new InventoryCreationGatewayError("INVALID_ELIGIBLE_QUANTITY", "Inventory eligible quantity must be recomputed from confirmed Receiving evidence.");
  }
  if (candidate.unitAcquisitionCostsMinorUnits.length !== candidate.quantityEligible) {
    throw new InventoryCreationGatewayError("INVENTORY_COST_MISMATCH", "Inventory unit costs do not match eligible quantity.");
  }
  const sum = candidate.unitAcquisitionCostsMinorUnits.reduce((total, value) => total + BigInt(value), 0n);
  if (sum !== BigInt(candidate.totalAcquisitionCost.minorUnits)) {
    throw new InventoryCreationGatewayError("INVENTORY_COST_MISMATCH", "Inventory unit costs do not reconcile to Purchase allocation.");
  }
}

function expectedBundle(state, candidate, timestamp) {
  const ids = inventoryCreationRecordIds(candidate.candidateId);
  const application = normalizeInventoryCreationApplication({
    id: ids.applicationId,
    format: INVENTORY_CREATION_FORMAT,
    recordType: "INVENTORY_CREATION_APPLICATION",
    recordVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    candidateId: candidate.candidateId,
    expectedCandidateVersion: candidate.expectedVersion,
    status: INVENTORY_CREATION_APPLICATION_STATES.COMPLETED,
    provenanceManaged: true,
    confirmationMethod: "VERIFIED_OWNER_SESSION",
    purchaseId: candidate.purchaseId,
    purchaseLineItemId: candidate.purchaseLineItemId,
    receivingEventReferences: candidate.receivingEventReferences,
    productReference: candidate.productReference,
    purchaseProductReference: candidate.purchaseProductReference,
    receivedProductReference: candidate.receivedProductReference,
    ownerResolutionReason: candidate.resolutionReason,
    productMatchState: candidate.productMatchState,
    productClassification: candidate.productClassification,
    condition: candidate.condition,
    disposition: candidate.disposition,
    quantity: candidate.quantityEligible,
    currency: candidate.currency,
    totalCostMinorUnits: candidate.totalAcquisitionCost.minorUnits,
    unitCostsMinorUnits: candidate.unitAcquisitionCostsMinorUnits,
    inventoryLotId: ids.inventoryLotId,
    inventoryItemId: ids.inventoryItemId,
    inventoryCreationEventId: ids.eventId,
    completedAt: timestamp,
  });
  const event = normalizeInventoryCreationEvent({
    id: ids.eventId,
    format: INVENTORY_CREATION_FORMAT,
    recordType: "INVENTORY_CREATION_EVENT",
    recordVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    eventType: INVENTORY_CREATION_EVENT_TYPES.INVENTORY_CREATED,
    provenanceManaged: true,
    confirmationMethod: "VERIFIED_OWNER_SESSION",
    idempotencyKey: `inventory-create:${candidate.candidateId}`,
    applicationId: ids.applicationId,
    candidateId: candidate.candidateId,
    purchaseId: candidate.purchaseId,
    purchaseLineItemId: candidate.purchaseLineItemId,
    receivingEventReferences: candidate.receivingEventReferences,
    productReference: candidate.productReference,
    purchaseProductReference: candidate.purchaseProductReference,
    receivedProductReference: candidate.receivedProductReference,
    ownerResolutionReason: candidate.resolutionReason,
    productClassification: candidate.productClassification,
    condition: candidate.condition,
    disposition: candidate.disposition,
    inventoryLotId: ids.inventoryLotId,
    inventoryItemId: ids.inventoryItemId,
    quantity: candidate.quantityEligible,
    currency: candidate.currency,
    totalCostMinorUnits: candidate.totalAcquisitionCost.minorUnits,
    unitCostsMinorUnits: candidate.unitAcquisitionCostsMinorUnits,
    occurredAt: timestamp,
    summary: "Owner confirmed Inventory creation from physical Receiving evidence.",
    warnings: candidate.warnings,
  });
  const lot = Object.freeze({
    id: ids.inventoryLotId,
    format: INVENTORY_CREATION_FORMAT,
    recordType: "INVENTORY_ACQUISITION_LOT",
    recordVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    provenanceManaged: true,
    sourceIdentityKey: candidate.candidateId,
    inventoryCreationApplicationId: ids.applicationId,
    inventoryCreationEventId: ids.eventId,
    purchaseId: candidate.purchaseId,
    purchaseLineItemId: candidate.purchaseLineItemId,
    receivingEventReferences: [...candidate.receivingEventReferences],
    inventoryItemId: ids.inventoryItemId,
    productReference: candidate.productReference,
    purchaseProductReference: candidate.purchaseProductReference,
    receivedProductReference: candidate.receivedProductReference,
    ownerResolutionReason: candidate.resolutionReason,
    productTitle: candidate.productTitle,
    productClassification: candidate.productClassification,
    retailerId: candidate.retailerId,
    vendorName: candidate.vendorName,
    receivedAt: candidate.receivedAt,
    condition: candidate.condition,
    disposition: candidate.disposition,
    originalQuantity: candidate.quantityEligible,
    quantity: candidate.quantityEligible,
    currency: candidate.currency,
    originalAcquisitionCostMinorUnits: candidate.totalAcquisitionCost.minorUnits,
    acquisitionCostMinorUnits: candidate.totalAcquisitionCost.minorUnits,
    originalUnitAcquisitionCostsMinorUnits: [...candidate.unitAcquisitionCostsMinorUnits],
    unitAcquisitionCostsMinorUnits: [...candidate.unitAcquisitionCostsMinorUnits],
    costAuthority: "INTEGER_MINOR_UNITS",
    confirmationMethod: "VERIFIED_OWNER_SESSION",
    status: "ACTIVE",
  });
  const inventoryItem = Object.freeze({
    id: ids.inventoryItemId,
    format: INVENTORY_CREATION_FORMAT,
    recordType: "OWNED_INVENTORY_ITEM",
    recordVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    provenanceManaged: true,
    sourceIdentityKey: candidate.candidateId,
    inventoryLotId: ids.inventoryLotId,
    inventoryCreationApplicationId: ids.applicationId,
    inventoryCreationEventId: ids.eventId,
    purchaseId: candidate.purchaseId,
    purchaseLineItemId: candidate.purchaseLineItemId,
    receivingEventReferences: [...candidate.receivingEventReferences],
    productReference: candidate.productReference,
    purchaseProductReference: candidate.purchaseProductReference,
    receivedProductReference: candidate.receivedProductReference,
    ownerResolutionReason: candidate.resolutionReason,
    productTitle: candidate.productTitle || candidate.productReference,
    retailerId: candidate.retailerId,
    vendorName: candidate.vendorName,
    receivedAt: candidate.receivedAt,
    name: candidate.productTitle || candidate.productReference,
    productClassification: candidate.productClassification,
    ownedItemPurpose: "FOR_RESALE",
    quantity: candidate.quantityEligible,
    originalQuantity: candidate.quantityEligible,
    condition: candidate.condition,
    disposition: candidate.disposition,
    purchaseSource: candidate.vendorName || candidate.retailerId || "Owner-confirmed Purchase",
    purchaseDate: candidate.receivedAt.slice(0, 10),
    currency: candidate.currency,
    acquisitionCostMinorUnits: candidate.totalAcquisitionCost.minorUnits,
    originalAcquisitionCostMinorUnits: candidate.totalAcquisitionCost.minorUnits,
    unitAcquisitionCostsMinorUnits: [...candidate.unitAcquisitionCostsMinorUnits],
    originalUnitAcquisitionCostsMinorUnits: [...candidate.unitAcquisitionCostsMinorUnits],
    costAuthority: "INTEGER_MINOR_UNITS",
    status: "In stock",
    confirmationMethod: "VERIFIED_OWNER_SESSION",
  });
  assertSafePurchaseReceivingInput({ application, event, lot, inventoryItem });
  return Object.freeze({ ids, application, event, lot, inventoryItem });
}

function equivalentCreation(existing, candidate) {
  return canonicalStringify({
    candidateId: existing.candidateId,
    purchaseId: existing.purchaseId,
    purchaseLineItemId: existing.purchaseLineItemId,
    receivingEventReferences: existing.receivingEventReferences,
    productReference: existing.productReference,
    purchaseProductReference: existing.purchaseProductReference,
    receivedProductReference: existing.receivedProductReference,
    ownerResolutionReason: existing.ownerResolutionReason,
    productMatchState: existing.productMatchState,
    productClassification: existing.productClassification,
    condition: existing.condition,
    disposition: existing.disposition,
    quantity: existing.quantity,
    currency: existing.currency,
    totalCostMinorUnits: existing.totalCostMinorUnits,
    unitCostsMinorUnits: existing.unitCostsMinorUnits,
  }) === canonicalStringify({
    candidateId: candidate.candidateId,
    purchaseId: candidate.purchaseId,
    purchaseLineItemId: candidate.purchaseLineItemId,
    receivingEventReferences: candidate.receivingEventReferences,
    productReference: candidate.productReference,
    purchaseProductReference: candidate.purchaseProductReference,
    receivedProductReference: candidate.receivedProductReference,
    ownerResolutionReason: candidate.resolutionReason,
    productMatchState: candidate.productMatchState,
    productClassification: candidate.productClassification,
    condition: candidate.condition,
    disposition: candidate.disposition,
    quantity: candidate.quantityEligible,
    currency: candidate.currency,
    totalCostMinorUnits: candidate.totalAcquisitionCost.minorUnits,
    unitCostsMinorUnits: candidate.unitAcquisitionCostsMinorUnits,
  });
}

function findResult(state, ids) {
  const application = state.inventoryCreationApplications.find((entry) => entry.id === ids.applicationId);
  const event = state.inventoryCreationEvents.find((entry) => entry.id === ids.eventId);
  const lot = state.inventoryLots.find((entry) => entry.id === ids.inventoryLotId);
  const inventoryItem = state.inventory.find((entry) => entry.id === ids.inventoryItemId);
  return {
    application: application ? normalizeInventoryCreationApplication(application) : null,
    event: event ? normalizeInventoryCreationEvent(event) : null,
    lot: lot ? normalizeInventoryAcquisitionLot(lot) : null,
    inventoryItem: inventoryItem ? normalizeProvenanceManagedInventoryItem(inventoryItem) : null,
  };
}

function complete(result) {
  return Boolean(result.application && result.event && result.lot && result.inventoryItem);
}

function immutableEventMatches(event, candidate, ids) {
  const references = canonicalStringify(candidate.receivingEventReferences);
  const units = canonicalStringify(candidate.unitAcquisitionCostsMinorUnits);
  return event.eventType === INVENTORY_CREATION_EVENT_TYPES.INVENTORY_CREATED
    && event.candidateId === candidate.candidateId
    && event.applicationId === ids.applicationId
    && event.purchaseId === candidate.purchaseId
    && event.purchaseLineItemId === candidate.purchaseLineItemId
    && canonicalStringify(event.receivingEventReferences) === references
    && event.productReference === candidate.productReference
    && (event.purchaseProductReference ?? null) === (candidate.purchaseProductReference ?? null)
    && (event.receivedProductReference ?? null) === (candidate.receivedProductReference ?? null)
    && (event.ownerResolutionReason ?? null) === (candidate.resolutionReason ?? null)
    && event.productClassification === candidate.productClassification
    && event.inventoryLotId === ids.inventoryLotId
    && event.inventoryItemId === ids.inventoryItemId
    && event.quantity === candidate.quantityEligible
    && event.currency === candidate.currency
    && event.condition === candidate.condition
    && event.disposition === candidate.disposition
    && event.totalCostMinorUnits === candidate.totalAcquisitionCost.minorUnits
    && canonicalStringify(event.unitCostsMinorUnits) === units;
}

function immutableLotMatches(lot, candidate, ids) {
  return lot.sourceIdentityKey === candidate.candidateId
    && lot.inventoryCreationApplicationId === ids.applicationId
    && lot.inventoryCreationEventId === ids.eventId
    && lot.purchaseId === candidate.purchaseId
    && lot.purchaseLineItemId === candidate.purchaseLineItemId
    && canonicalStringify(lot.receivingEventReferences) === canonicalStringify(candidate.receivingEventReferences)
    && lot.productReference === candidate.productReference
    && (lot.purchaseProductReference ?? null) === (candidate.purchaseProductReference ?? null)
    && (lot.receivedProductReference ?? null) === (candidate.receivedProductReference ?? null)
    && (lot.ownerResolutionReason ?? null) === (candidate.resolutionReason ?? null)
    && lot.productClassification === candidate.productClassification
    && (lot.productTitle ?? null) === (candidate.productTitle || candidate.productReference)
    && (lot.retailerId ?? null) === (candidate.retailerId ?? null)
    && (lot.vendorName ?? null) === (candidate.vendorName ?? null)
    && (lot.receivedAt ?? null) === (candidate.receivedAt ?? null)
    && lot.inventoryItemId === ids.inventoryItemId
    && lot.originalQuantity === candidate.quantityEligible
    && lot.currency === candidate.currency
    && lot.condition === candidate.condition
    && lot.disposition === candidate.disposition
    && lot.originalAcquisitionCostMinorUnits === candidate.totalAcquisitionCost.minorUnits
    && canonicalStringify(lot.originalUnitAcquisitionCostsMinorUnits) === canonicalStringify(candidate.unitAcquisitionCostsMinorUnits);
}

function immutableItemMatches(item, candidate, ids) {
  return item.sourceIdentityKey === candidate.candidateId
    && item.inventoryLotId === ids.inventoryLotId
    && item.inventoryCreationApplicationId === ids.applicationId
    && item.inventoryCreationEventId === ids.eventId
    && item.purchaseId === candidate.purchaseId
    && item.purchaseLineItemId === candidate.purchaseLineItemId
    && canonicalStringify(item.receivingEventReferences) === canonicalStringify(candidate.receivingEventReferences)
    && item.productReference === candidate.productReference
    && (item.purchaseProductReference ?? null) === (candidate.purchaseProductReference ?? null)
    && (item.receivedProductReference ?? null) === (candidate.receivedProductReference ?? null)
    && (item.ownerResolutionReason ?? null) === (candidate.resolutionReason ?? null)
    && item.productClassification === candidate.productClassification
    && (item.productTitle ?? null) === (candidate.productTitle || candidate.productReference)
    && item.name === (candidate.productTitle || candidate.productReference)
    && (item.retailerId ?? null) === (candidate.retailerId ?? null)
    && (item.vendorName ?? null) === (candidate.vendorName ?? null)
    && (item.receivedAt ?? null) === (candidate.receivedAt ?? null)
    && item.ownedItemPurpose === "FOR_RESALE"
    && item.purchaseSource === (candidate.vendorName || candidate.retailerId || "Owner-confirmed Purchase")
    && item.purchaseDate === candidate.receivedAt.slice(0, 10)
    && item.originalQuantity === candidate.quantityEligible
    && item.currency === candidate.currency
    && item.condition === candidate.condition
    && item.disposition === candidate.disposition
    && item.originalAcquisitionCostMinorUnits === candidate.totalAcquisitionCost.minorUnits
    && canonicalStringify(item.originalUnitAcquisitionCostsMinorUnits) === canonicalStringify(candidate.unitAcquisitionCostsMinorUnits);
}

function compatibleExistingSubset(result, candidate, ids) {
  return (!result.application || (
    result.application.status === INVENTORY_CREATION_APPLICATION_STATES.COMPLETED
    && result.application.inventoryLotId === ids.inventoryLotId
    && result.application.inventoryItemId === ids.inventoryItemId
    && result.application.inventoryCreationEventId === ids.eventId
    && equivalentCreation(result.application, candidate)
  ))
    && (!result.event || immutableEventMatches(result.event, candidate, ids))
    && (!result.lot || immutableLotMatches(result.lot, candidate, ids))
    && (!result.inventoryItem || immutableItemMatches(result.inventoryItem, candidate, ids));
}

function immutableBundleMatches(result, candidate, ids) {
  return complete(result) && compatibleExistingSubset(result, candidate, ids);
}

function prependUnique(rows, record) {
  return [record, ...rows.filter((entry) => entry.id !== record.id)];
}

function resolveLock(lockManager, action) {
  if (typeof lockManager === "function") return lockManager(PURCHASE_INVENTORY_MUTATION_LOCK, action);
  if (typeof window === "undefined") return Promise.resolve().then(action);
  if (globalThis.navigator?.locks?.request) return globalThis.navigator.locks.request(PURCHASE_INVENTORY_MUTATION_LOCK, { mode: "exclusive" }, action);
  throw new InventoryCreationGatewayError("SAFE_LOCK_UNAVAILABLE", "Inventory confirmation requires same-origin exclusive locking; creation failed closed.");
}

export function createInventoryCreationGateway(options = {}) {
  const repository = options.repository || createFlipScoutRepository(options.storage);
  const clock = options.now || (() => new Date().toISOString());
  const isOwnerAuthorized = typeof options.isOwnerAuthorized === "function" ? options.isOwnerAuthorized : () => false;
  const lockManager = options.lockManager;

  function assertOwner() {
    if (isOwnerAuthorized() !== true) throw new InventoryCreationGatewayError("OWNER_REQUIRED", "A verified OWNER session is required before Inventory storage access.");
  }

  function load() {
    assertOwner();
    return repository.load();
  }

  async function confirm({ candidateId, expectedVersion, deriveCurrentCandidate }) {
    assertOwner();
    if (typeof deriveCurrentCandidate !== "function") throw new InventoryCreationGatewayError("DERIVATION_REQUIRED", "Authoritative Inventory candidate derivation is required.");
    return resolveLock(lockManager, async () => {
      assertOwner();
      const before = repository.load();
      validateInventoryCreationStateBundles(before, { allowIncomplete: true });
      const expectedManagedRevision = repository.managedRevision?.(before);
      if (typeof expectedManagedRevision !== "string") throw new InventoryCreationGatewayError("MANAGED_REVISION_UNAVAILABLE", "Inventory confirmation requires a managed-state revision boundary.");
      const ids = inventoryCreationRecordIds(candidateId);
      const existing = findResult(before, ids);
      const candidate = deriveCurrentCandidate(before);
      assertCandidate(candidate);
      if (candidate.candidateId !== candidateId) throw new InventoryCreationGatewayError("CANDIDATE_ID_MISMATCH", "Inventory candidate identity changed during confirmation.");
      if (!compatibleExistingSubset(existing, candidate, ids)) {
        throw new InventoryCreationGatewayError("INVENTORY_PROVENANCE_CONFLICT", "Existing Inventory provenance conflicts with authoritative Purchase and Receiving evidence.");
      }
      if (existing.application) {
        if (!equivalentCreation(existing.application, candidate)) throw new InventoryCreationGatewayError("IDEMPOTENCY_CONFLICT", "Inventory source identity already has conflicting canonical semantics.");
        if (complete(existing)) {
          if (!immutableBundleMatches(existing, candidate, ids)) throw new InventoryCreationGatewayError("INVENTORY_PROVENANCE_CONFLICT", "Existing Inventory provenance conflicts with authoritative Purchase and Receiving evidence.");
          return Object.freeze({ ...clone(existing), deduplicated: true, repaired: false, wroteInventory: false });
        }
      }
      if (!existing.application && candidate.expectedVersion !== expectedVersion) throw new InventoryCreationGatewayError("VERSION_CONFLICT", "Inventory candidate changed before confirmation.", { expectedVersion, actualVersion: candidate.expectedVersion });
      const timestamp = existing.application?.completedAt || isoNow(clock);
      const bundle = expectedBundle(before, candidate, timestamp);
      const repaired = Object.values(existing).some(Boolean);
      const next = {
        ...before,
        inventoryCreationApplications: existing.application ? before.inventoryCreationApplications : prependUnique(before.inventoryCreationApplications, bundle.application),
        inventoryCreationEvents: existing.event ? before.inventoryCreationEvents : prependUnique(before.inventoryCreationEvents, bundle.event),
        inventoryLots: existing.lot ? before.inventoryLots : prependUnique(before.inventoryLots, bundle.lot),
        inventory: existing.inventoryItem ? before.inventory : prependUnique(before.inventory, bundle.inventoryItem),
        activity: prependUnique(before.activity, {
          id: `activity:${ids.eventId}`,
          type: "INVENTORY_CREATED_FROM_RECEIVING",
          summary: "Owner confirmed local Inventory creation from reviewed Receiving evidence.",
          occurredAt: timestamp,
          purchaseId: candidate.purchaseId,
          inventoryItemId: ids.inventoryItemId,
          inventoryLotId: ids.inventoryLotId,
          provenanceManaged: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      };
      if (typeof repository.commitOwnerConfirmedInventory !== "function") throw new InventoryCreationGatewayError("MANAGED_COMMIT_UNAVAILABLE", "Inventory repository does not expose the verified provenance commit boundary.");
      const verifySourceRevision = (freshInventoryState) => {
        try {
          const latest = deriveCurrentCandidate(freshInventoryState);
          return latest.candidateId === candidate.candidateId
            && latest.sourceVersion === candidate.sourceVersion
            && latest.eligible === true
            && latest.blockers.length === 0;
        } catch {
          return false;
        }
      };
      const write = repository.commitOwnerConfirmedInventory(next, { expectedManagedRevision, verifySourceRevision });
      if (write.fatal || write.recoveryPending || write.rollbackFailed || write.rolledBack) {
        throw new InventoryCreationGatewayError(
          "INVENTORY_WRITE_FAILED",
          "Inventory creation could not prove an atomic local commit and failed closed.",
          { recoveryPending: Boolean(write.recoveryPending), rolledBack: Boolean(write.rolledBack) },
        );
      }
      const readBack = repository.load();
      try {
        validateInventoryCreationStateBundles(readBack);
      } catch (error) {
        throw new InventoryCreationGatewayError("INVENTORY_WRITE_FAILED", "Inventory creation read-back is incomplete or invalid.", { storageError: Boolean(write.error), validationCode: error?.code || "INVALID_READBACK" });
      }
      const persisted = findResult(readBack, ids);
      if (!complete(persisted)) {
        throw new InventoryCreationGatewayError("INVENTORY_WRITE_FAILED", "Inventory creation did not produce a complete canonical result.", { storageError: Boolean(write.error) });
      }
      if (!immutableBundleMatches(persisted, candidate, ids)) throw new InventoryCreationGatewayError("INVENTORY_READBACK_CONFLICT", "Inventory read-back did not match the confirmed candidate.");
      const concurrentDeduplication = write.error && write.writeAttempted === false;
      return Object.freeze({ ...clone(persisted), deduplicated: Boolean(concurrentDeduplication), repaired, wroteInventory: !concurrentDeduplication });
    });
  }

  async function reverse({ applicationId, expectedInventoryVersion, quantity, reason, idempotencyKey }) {
    assertOwner();
    assertSafePurchaseReceivingInput({ applicationId, expectedInventoryVersion, quantity, reason, idempotencyKey });
    return resolveLock(lockManager, async () => {
      assertOwner();
      const state = repository.load();
      const validated = validateInventoryCreationStateBundles(state);
      const expectedManagedRevision = repository.managedRevision?.(state);
      if (typeof expectedManagedRevision !== "string") throw new InventoryCreationGatewayError("MANAGED_REVISION_UNAVAILABLE", "Inventory reversal requires a managed-state revision boundary.");
      const normalizedReason = sanitizePurchaseReceivingNote(reason, "Owner confirmed an Inventory reversal.");
      const normalizedIdempotencyKey = normalizeInventoryAdjustmentIdempotencyKey(idempotencyKey);
      const existingAdjustment = validated.adjustments.find((entry) => entry.idempotencyKey === normalizedIdempotencyKey);
      if (existingAdjustment) {
        if (existingAdjustment.applicationId !== String(applicationId) || existingAdjustment.quantity !== quantity || existingAdjustment.reason !== normalizedReason) {
          throw new InventoryCreationGatewayError("IDEMPOTENCY_CONFLICT", "Inventory reversal idempotency key was reused with different semantics.");
        }
        return Object.freeze({ adjustment: clone(existingAdjustment), deduplicated: true, wroteAdjustment: false });
      }
      const application = validated.applications.find((entry) => entry.id === String(applicationId));
      if (!application) throw new InventoryCreationGatewayError("APPLICATION_NOT_FOUND", "Inventory creation application was not found.");
      const item = validated.items.find((entry) => entry.id === application.inventoryItemId);
      const lot = validated.lots.find((entry) => entry.id === application.inventoryLotId);
      if (!item || !lot) throw new InventoryCreationGatewayError("INVENTORY_PROVENANCE_INCOMPLETE", "Inventory provenance is incomplete and requires repair before reversal.");
      if (String(item.recordVersion) !== String(expectedInventoryVersion)) throw new InventoryCreationGatewayError("VERSION_CONFLICT", "Inventory changed before reversal.");
      if (!Number.isSafeInteger(quantity) || quantity < 1) throw new InventoryCreationGatewayError("INVALID_REVERSAL_QUANTITY", "Reversal quantity must be a positive safe integer.");
      const sold = soldQuantityForInventory(item.id, state.sales);
      const available = Math.max(0, item.quantity - sold);
      if (quantity > available) throw new InventoryCreationGatewayError("REVERSAL_EXCEEDS_AVAILABLE", "Inventory already sold or unavailable cannot be reversed.", { available });
      const remainingUnitCosts = item.unitAcquisitionCostsMinorUnits.slice(0, item.quantity - quantity);
      const reversedUnitCosts = item.unitAcquisitionCostsMinorUnits.slice(item.quantity - quantity);
      const reversedCost = reversedUnitCosts.reduce((sum, value) => sum + value, 0);
      const timestamp = isoNow(clock);
      const adjustmentId = inventoryAdjustmentIdentityId({ candidateId: application.candidateId, applicationId: application.id, idempotencyKey: normalizedIdempotencyKey });
      const adjustment = normalizeInventoryAdjustment({
        id: adjustmentId,
        format: INVENTORY_CREATION_FORMAT,
        recordType: "INVENTORY_ADJUSTMENT",
        recordVersion: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        adjustmentType: INVENTORY_ADJUSTMENT_TYPES.CREATION_REVERSAL,
        provenanceManaged: true,
        confirmationMethod: "VERIFIED_OWNER_SESSION",
        idempotencyKey: normalizedIdempotencyKey,
        applicationId: application.id,
        inventoryCreationEventId: application.inventoryCreationEventId,
        purchaseId: application.purchaseId,
        receivingEventReferences: application.receivingEventReferences,
        productReference: application.productReference,
        inventoryLotId: application.inventoryLotId,
        inventoryItemId: application.inventoryItemId,
        quantity,
        currency: application.currency,
        totalCostMinorUnits: reversedCost,
        unitCostsMinorUnits: reversedUnitCosts,
        occurredAt: timestamp,
        reason: normalizedReason,
      });
      const updatedItem = {
        ...item,
        recordVersion: item.recordVersion + 1,
        quantity: item.quantity - quantity,
        acquisitionCostMinorUnits: remainingUnitCosts.reduce((sum, value) => sum + value, 0),
        unitAcquisitionCostsMinorUnits: remainingUnitCosts,
        status: item.quantity - quantity === 0 ? "Disposed" : item.status,
        updatedAt: timestamp,
      };
      const updatedLot = {
        ...lot,
        recordVersion: lot.recordVersion + 1,
        quantity: lot.quantity - quantity,
        acquisitionCostMinorUnits: remainingUnitCosts.reduce((sum, value) => sum + value, 0),
        unitAcquisitionCostsMinorUnits: remainingUnitCosts,
        status: lot.quantity - quantity === 0 ? "REVERSED" : "PARTIALLY_REVERSED",
        updatedAt: timestamp,
      };
      const next = {
        ...state,
        inventory: state.inventory.map((entry) => entry.id === item.id ? updatedItem : entry),
        inventoryLots: state.inventoryLots.map((entry) => entry.id === lot.id ? updatedLot : entry),
        inventoryAdjustments: prependUnique(state.inventoryAdjustments, adjustment),
      };
      if (typeof repository.commitOwnerConfirmedInventory !== "function") throw new InventoryCreationGatewayError("MANAGED_COMMIT_UNAVAILABLE", "Inventory repository does not expose the verified provenance commit boundary.");
      const write = repository.commitOwnerConfirmedInventory(next, { expectedManagedRevision });
      const readBack = repository.load();
      validateInventoryCreationStateBundles(readBack);
      const persisted = readBack.inventoryAdjustments.find((entry) => entry.id === adjustment.id);
      if (!persisted || readBack.inventory.find((entry) => entry.id === item.id)?.recordVersion !== updatedItem.recordVersion) {
        throw new InventoryCreationGatewayError("INVENTORY_REVERSAL_WRITE_FAILED", "Inventory reversal could not be verified.", { storageError: Boolean(write.error) });
      }
      const concurrentDeduplication = write.error && write.writeAttempted === false;
      return Object.freeze({ adjustment: clone(persisted), inventoryItem: clone(readBack.inventory.find((entry) => entry.id === item.id)), inventoryLot: clone(readBack.inventoryLots.find((entry) => entry.id === lot.id)), deduplicated: Boolean(concurrentDeduplication), wroteAdjustment: !concurrentDeduplication });
    });
  }

  return Object.freeze({
    authoritative: "LOCAL_ONLY",
    remoteActive: false,
    storageKey: repository.storageKey,
    load,
    snapshot: () => clone(load()),
    confirm,
    reverse,
  });
}
