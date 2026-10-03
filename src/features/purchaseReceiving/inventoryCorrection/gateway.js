import { canonicalStringify } from "../../backup/canonicalJson.js";
import { createFlipScoutRepository } from "../../flipScout/storageRepository.js";
import { PURCHASE_INVENTORY_MUTATION_LOCK } from "../persistence.js";
import { assertSafePurchaseReceivingInput } from "../security.js";
import {
  INVENTORY_CREATION_FORMAT,
} from "../inventoryCreation/constants.js";
import {
  inventoryAdjustmentSemanticDigest,
  normalizeInventoryAdjustment,
  validateInventoryCreationStateBundles,
} from "../inventoryCreation/contracts.js";
import {
  deriveInventoryCorrectionCandidate,
  inventoryCorrectionAdjustmentId,
  inventoryCorrectionCandidateId,
  inventoryCorrectionProposalDigest,
  normalizeInventoryCorrectionProposal,
} from "./contracts.js";

export class InventoryCorrectionGatewayError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "InventoryCorrectionGatewayError";
    this.code = code;
    this.details = details;
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isoNow(clock) {
  const value = new Date(clock());
  if (!Number.isFinite(value.getTime())) throw new InventoryCorrectionGatewayError("INVALID_CLOCK", "A valid Inventory correction clock is required.");
  return value.toISOString();
}

function resolveLock(lockManager, action) {
  if (typeof lockManager === "function") return lockManager(PURCHASE_INVENTORY_MUTATION_LOCK, action);
  if (typeof window === "undefined") return Promise.resolve().then(action);
  if (globalThis.navigator?.locks?.request) return globalThis.navigator.locks.request(PURCHASE_INVENTORY_MUTATION_LOCK, { mode: "exclusive" }, action);
  throw new InventoryCorrectionGatewayError("SAFE_LOCK_UNAVAILABLE", "Inventory correction requires same-origin exclusive locking and failed closed.");
}

function updatedRecords(item, lot, candidate, timestamp) {
  const proposed = candidate.proposed;
  const updatedItem = {
    ...item,
    recordVersion: item.recordVersion + 1,
    updatedAt: timestamp,
    productReference: proposed.productReference,
    productTitle: proposed.productTitle,
    name: proposed.productTitle || proposed.productReference,
    productClassification: proposed.productClassification,
    condition: proposed.condition,
    disposition: proposed.disposition,
    inventoryDispositionState: proposed.inventoryDispositionState,
    quantity: proposed.quantity,
    acquisitionCostMinorUnits: proposed.acquisitionCostMinorUnits,
    unitAcquisitionCostsMinorUnits: [...proposed.unitAcquisitionCostsMinorUnits],
    status: proposed.inventoryStatus,
  };
  const updatedLot = {
    ...lot,
    recordVersion: lot.recordVersion + 1,
    updatedAt: timestamp,
    productReference: proposed.productReference,
    productTitle: proposed.productTitle,
    productClassification: proposed.productClassification,
    condition: proposed.condition,
    disposition: proposed.disposition,
    inventoryDispositionState: proposed.inventoryDispositionState,
    quantity: proposed.quantity,
    acquisitionCostMinorUnits: proposed.acquisitionCostMinorUnits,
    unitAcquisitionCostsMinorUnits: [...proposed.unitAcquisitionCostsMinorUnits],
    status: proposed.lotStatus,
  };
  return Object.freeze({ updatedItem, updatedLot });
}

function affectedUnitCosts(candidate) {
  if (candidate.quantityEffect < 0) return candidate.current.unitAcquisitionCostsMinorUnits.slice(candidate.proposed.quantity);
  if (candidate.quantityEffect > 0) return candidate.proposed.unitAcquisitionCostsMinorUnits.slice(candidate.current.quantity);
  return [];
}

function adjustmentRecord(candidate, timestamp, updatedItem, updatedLot) {
  const affectedCosts = affectedUnitCosts(candidate);
  const draft = {
    id: inventoryCorrectionAdjustmentId({ applicationId: candidate.applicationId, candidateId: candidate.candidateId }),
    format: INVENTORY_CREATION_FORMAT,
    recordType: "INVENTORY_ADJUSTMENT",
    recordVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    provenanceManaged: true,
    confirmationMethod: "VERIFIED_OWNER_SESSION",
    adjustmentType: candidate.category,
    correctionCategory: candidate.category,
    eventKind: candidate.eventKind,
    adjustmentSequence: candidate.adjustmentSequence,
    idempotencyKey: candidate.idempotencyKey,
    proposalDigest: candidate.proposalDigest,
    candidateId: candidate.candidateId,
    applicationId: candidate.applicationId,
    inventoryCreationEventId: updatedItem.inventoryCreationEventId,
    purchaseId: candidate.purchaseId,
    receivingEventReferences: candidate.receivingEventReferences,
    productReference: candidate.current.productReference,
    resultingProductReference: candidate.proposed.productReference,
    inventoryLotId: candidate.inventoryLotId,
    inventoryItemId: candidate.inventoryItemId,
    quantity: Math.abs(candidate.quantityEffect),
    quantityEffect: candidate.quantityEffect,
    quantityReason: candidate.quantityReason,
    currency: candidate.current.currency,
    totalCostMinorUnits: Math.abs(candidate.costEffectMinorUnits),
    costEffectMinorUnits: candidate.costEffectMinorUnits,
    unitCostsMinorUnits: affectedCosts,
    previousInventoryVersion: candidate.expectedInventoryVersion,
    resultingInventoryVersion: updatedItem.recordVersion,
    previousLotVersion: candidate.expectedLotVersion,
    resultingLotVersion: updatedLot.recordVersion,
    previousState: candidate.current,
    resultingState: candidate.proposed,
    reversesAdjustmentId: candidate.reversesAdjustmentId,
    occurredAt: timestamp,
    reason: candidate.reason,
  };
  return normalizeInventoryAdjustment({
    ...draft,
    semanticDigest: inventoryAdjustmentSemanticDigest(draft),
  });
}

/**
 * The published local Inventory schema has no managed-transfer writer or
 * collection. Prove that invariant from the current canonical document rather
 * than silently assuming zero transfer usage. A future transfer collection or
 * managed-record transfer field deliberately fails closed until it has an
 * authoritative reconciliation adapter.
 */
export function assertManagedInventoryHasNoTransferUsage(inventoryItemId, state = {}) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new InventoryCorrectionGatewayError("TRANSFER_PROTECTION_UNAVAILABLE", "Managed Inventory transfer protection is unavailable.");
  }
  const transferCollection = Object.keys(state).find((key) => /transfer/i.test(key));
  if (transferCollection) {
    throw new InventoryCorrectionGatewayError("TRANSFER_RECONCILIATION_REQUIRED", "Managed Inventory transfer evidence requires an explicit reconciliation adapter.");
  }
  const validated = validateInventoryCreationStateBundles(state);
  const item = validated.items.find((entry) => entry.id === String(inventoryItemId));
  if (!item) throw new InventoryCorrectionGatewayError("INVENTORY_ITEM_NOT_FOUND", "Owner-confirmed Inventory item was not found.");
  const related = [
    item,
    validated.lots.find((entry) => entry.id === item.inventoryLotId),
    validated.applications.find((entry) => entry.id === item.inventoryCreationApplicationId),
  ].filter(Boolean);
  if (related.some((record) => Object.keys(record).some((key) => /transfer/i.test(key)))) {
    throw new InventoryCorrectionGatewayError("TRANSFER_RECONCILIATION_REQUIRED", "Managed Inventory transfer evidence requires explicit reconciliation.");
  }
  return 0;
}

export function createInventoryCorrectionGateway(options = {}) {
  const repository = options.repository || createFlipScoutRepository(options.storage);
  const clock = options.now || (() => new Date().toISOString());
  const isOwnerAuthorized = typeof options.isOwnerAuthorized === "function" ? options.isOwnerAuthorized : () => false;
  const lockManager = options.lockManager;
  if (typeof options.getTransferredQuantity !== "function") {
    throw new InventoryCorrectionGatewayError("TRANSFER_PROTECTION_UNAVAILABLE", "Inventory correction requires a trusted transfer-usage boundary.");
  }
  const trustedTransferUsage = options.getTransferredQuantity;
  const validateExternalProvenance = typeof options.validateExternalProvenance === "function"
    ? options.validateExternalProvenance
    : (state) => {
      if ((state?.inventoryCreationApplications || []).some((entry) => entry?.sourceReturnAdjustmentId)) {
        throw new InventoryCorrectionGatewayError("REPLACEMENT_PURCHASE_PROVENANCE_UNAVAILABLE", "Replacement Inventory correction requires its trusted Purchase and Receiving provenance boundary.");
      }
    };

  function assertOwner() {
    if (isOwnerAuthorized() !== true) throw new InventoryCorrectionGatewayError("OWNER_REQUIRED", "A verified OWNER session is required before Inventory correction storage access.");
  }

  function load() {
    assertOwner();
    return repository.load();
  }

  function preview(inventoryItemId, proposal) {
    assertOwner();
    assertSafePurchaseReceivingInput(proposal);
    const state = repository.load();
    validateExternalProvenance(state);
    return deriveInventoryCorrectionCandidate({
      inventoryState: state,
      inventoryItemId,
      proposal,
      transferredQuantity: trustedTransferUsage(String(inventoryItemId), state),
    });
  }

  async function confirm({ inventoryItemId, candidateId, expectedVersion, proposal }) {
    assertOwner();
    assertSafePurchaseReceivingInput({ inventoryItemId, candidateId, expectedVersion, proposal });
    return resolveLock(lockManager, async () => {
      assertOwner();
      const before = repository.load();
      validateExternalProvenance(before);
      const validated = validateInventoryCreationStateBundles(before);
      const expectedManagedRevision = repository.managedRevision?.(before);
      if (typeof expectedManagedRevision !== "string") throw new InventoryCorrectionGatewayError("MANAGED_REVISION_UNAVAILABLE", "Inventory correction requires a managed-state revision boundary.");
      const normalizedProposal = normalizeInventoryCorrectionProposal(proposal);
      const expectedCandidateId = inventoryCorrectionCandidateId({ inventoryItemId: String(inventoryItemId), category: normalizedProposal.category, idempotencyKey: normalizedProposal.idempotencyKey });
      if (expectedCandidateId !== String(candidateId)) throw new InventoryCorrectionGatewayError("CANDIDATE_ID_MISMATCH", "Inventory correction candidate identity changed before confirmation.");
      const requestDigest = inventoryCorrectionProposalDigest(normalizedProposal);
      const existingByRequest = validated.adjustments.find((entry) => entry.idempotencyKey === normalizedProposal.idempotencyKey || entry.candidateId === expectedCandidateId);
      if (existingByRequest) {
        if (existingByRequest.candidateId !== expectedCandidateId || existingByRequest.proposalDigest !== requestDigest) {
          throw new InventoryCorrectionGatewayError("IDEMPOTENCY_CONFLICT", "Inventory correction identity was reused with different semantics.");
        }
        return Object.freeze({ adjustment: clone(existingByRequest), inventoryItem: clone(validated.items.find((entry) => entry.id === String(inventoryItemId))), inventoryLot: clone(validated.lots.find((entry) => entry.id === existingByRequest.inventoryLotId)), deduplicated: true, wroteCorrection: false });
      }
      const candidate = deriveInventoryCorrectionCandidate({
        inventoryState: before,
        inventoryItemId,
        proposal: normalizedProposal,
        transferredQuantity: trustedTransferUsage(String(inventoryItemId), before),
      });
      if (candidate.candidateId !== String(candidateId)) throw new InventoryCorrectionGatewayError("CANDIDATE_ID_MISMATCH", "Inventory correction candidate identity changed before confirmation.");
      if (candidate.expectedVersion !== String(expectedVersion)) throw new InventoryCorrectionGatewayError("VERSION_CONFLICT", "Inventory changed before correction confirmation.", { expectedVersion, actualVersion: candidate.expectedVersion });
      if (!candidate.eligible || candidate.blockers.length) throw new InventoryCorrectionGatewayError("CORRECTION_BLOCKED", "Inventory correction has blocking review items.", { blockers: clone(candidate.blockers) });
      const item = validated.items.find((entry) => entry.id === candidate.inventoryItemId);
      const lot = validated.lots.find((entry) => entry.id === candidate.inventoryLotId);
      if (!item || !lot) throw new InventoryCorrectionGatewayError("INVENTORY_PROVENANCE_INCOMPLETE", "Inventory provenance is incomplete.");
      if (item.recordVersion !== candidate.expectedInventoryVersion || lot.recordVersion !== candidate.expectedLotVersion) throw new InventoryCorrectionGatewayError("VERSION_CONFLICT", "Inventory changed before correction confirmation.");
      const timestamp = isoNow(clock);
      const { updatedItem, updatedLot } = updatedRecords(item, lot, candidate, timestamp);
      const adjustment = adjustmentRecord(candidate, timestamp, updatedItem, updatedLot);
      const next = {
        ...before,
        inventory: before.inventory.map((entry) => entry.id === item.id ? updatedItem : entry),
        inventoryLots: before.inventoryLots.map((entry) => entry.id === lot.id ? updatedLot : entry),
        inventoryAdjustments: [adjustment, ...before.inventoryAdjustments],
      };
      const write = repository.commitOwnerConfirmedInventory(next, { expectedManagedRevision });
      if (write.fatal || write.recoveryPending || write.rollbackFailed || write.rolledBack || write.error) {
        throw new InventoryCorrectionGatewayError("INVENTORY_CORRECTION_WRITE_FAILED", "Inventory correction could not prove a complete local commit and failed closed.", { recoveryPending: Boolean(write.recoveryPending), rolledBack: Boolean(write.rolledBack) });
      }
      const readBack = repository.load();
      validateExternalProvenance(readBack);
      const normalized = validateInventoryCreationStateBundles(readBack);
      const persisted = normalized.adjustments.find((entry) => entry.id === adjustment.id);
      const persistedItem = normalized.items.find((entry) => entry.id === item.id);
      const persistedLot = normalized.lots.find((entry) => entry.id === lot.id);
      if (!persisted || !persistedItem || !persistedLot
        || persistedItem.recordVersion !== updatedItem.recordVersion
        || persistedLot.recordVersion !== updatedLot.recordVersion
        || canonicalStringify(persistedItem.unitAcquisitionCostsMinorUnits) !== canonicalStringify(candidate.proposed.unitAcquisitionCostsMinorUnits)) {
        throw new InventoryCorrectionGatewayError("INVENTORY_CORRECTION_READBACK_CONFLICT", "Inventory correction read-back did not match the confirmed preview.");
      }
      return Object.freeze({ adjustment: clone(persisted), inventoryItem: clone(persistedItem), inventoryLot: clone(persistedLot), deduplicated: false, wroteCorrection: true });
    });
  }

  return Object.freeze({
    authoritative: "LOCAL_ONLY",
    remoteActive: false,
    candidatePersisted: false,
    automaticMutation: false,
    load,
    preview,
    confirm,
  });
}
