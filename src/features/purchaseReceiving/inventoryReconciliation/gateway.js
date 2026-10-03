import { canonicalStringify } from "../../backup/canonicalJson.js";
import { createFlipScoutRepository } from "../../flipScout/storageRepository.js";
import { PURCHASE_INVENTORY_MUTATION_LOCK } from "../persistence.js";
import { assertSafePurchaseReceivingInput } from "../security.js";
import { INVENTORY_CREATION_FORMAT } from "../inventoryCreation/constants.js";
import {
  inventoryAdjustmentSemanticDigest,
  normalizeInventoryAdjustment,
} from "../inventoryCreation/contracts.js";
import {
  INVENTORY_CORRECTION_CATEGORIES,
  INVENTORY_CORRECTION_EVENT_KINDS,
} from "../inventoryCorrection/constants.js";
import { assertManagedInventoryHasNoTransferUsage } from "../inventoryCorrection/gateway.js";
import { INVENTORY_RECONCILIATION_STATUSES } from "./constants.js";
import {
  deriveInventoryReconciliationCandidate,
  inventoryReconciliationEventId,
  inventoryReconciliationEventSemanticDigest,
  inventoryReconciliationProposalDigest,
  normalizeInventoryReconciliationEvent,
  normalizeInventoryReconciliationProposal,
  validateInventoryReconciliationState,
} from "./contracts.js";

export class InventoryReconciliationGatewayError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "InventoryReconciliationGatewayError";
    this.code = code;
    this.details = details;
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isoNow(clock) {
  const value = new Date(clock());
  if (!Number.isFinite(value.getTime())) throw new InventoryReconciliationGatewayError("INVALID_CLOCK", "A valid Inventory reconciliation clock is required.");
  return value.toISOString();
}

function reconciliationTimestamp(clock, state, inventoryItemId) {
  const reviewedAt = new Date(isoNow(clock)).getTime();
  const latestSaleAt = (state.sales || [])
    .filter((sale) => sale.inventoryItemId === inventoryItemId && !["draft", "cancelled"].includes(String(sale.status || "").trim().toLowerCase()))
    .reduce((latest, sale) => {
      const value = new Date(sale.inventoryAllocationAt).getTime();
      return Number.isFinite(value) ? Math.max(latest, value) : latest;
    }, reviewedAt);
  return new Date(latestSaleAt).toISOString();
}

function resolveLock(lockManager, action) {
  if (typeof lockManager === "function") return lockManager(PURCHASE_INVENTORY_MUTATION_LOCK, action);
  if (typeof window === "undefined") return Promise.resolve().then(action);
  if (globalThis.navigator?.locks?.request) return globalThis.navigator.locks.request(PURCHASE_INVENTORY_MUTATION_LOCK, { mode: "exclusive" }, action);
  throw new InventoryReconciliationGatewayError("SAFE_LOCK_UNAVAILABLE", "Inventory reconciliation requires same-origin exclusive locking and failed closed.");
}

function correctionEventKind(category) {
  if ([INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER, INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN].includes(category)) {
    return INVENTORY_CORRECTION_EVENT_KINDS.DISPOSITION;
  }
  if (category === INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION) return INVENTORY_CORRECTION_EVENT_KINDS.REVERSAL;
  return INVENTORY_CORRECTION_EVENT_KINDS.CORRECTION;
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
  const unitCostsMinorUnits = affectedUnitCosts(candidate);
  const draft = {
    id: candidate.sourceInventoryAdjustmentId,
    format: INVENTORY_CREATION_FORMAT,
    recordType: "INVENTORY_ADJUSTMENT",
    recordVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    provenanceManaged: true,
    confirmationMethod: "VERIFIED_OWNER_SESSION",
    adjustmentType: candidate.sourceCorrectionCategory,
    correctionCategory: candidate.sourceCorrectionCategory,
    eventKind: correctionEventKind(candidate.sourceCorrectionCategory),
    adjustmentSequence: candidate.sourceAdjustmentSequence,
    idempotencyKey: candidate.idempotencyKey,
    proposalDigest: candidate.proposalDigest,
    candidateId: candidate.sourceCorrectionCandidateId,
    applicationId: candidate.applicationId,
    inventoryCreationEventId: candidate.inventoryCreationEventId,
    purchaseId: candidate.purchaseId,
    receivingEventReferences: candidate.receivingEventReferences,
    productReference: candidate.current.productReference,
    resultingProductReference: candidate.proposed.productReference,
    inventoryLotId: candidate.inventoryLotId,
    inventoryItemId: candidate.inventoryItemId,
    quantity: Math.abs(candidate.quantityEffect),
    quantityEffect: candidate.quantityEffect,
    quantityReason: null,
    currency: candidate.currency,
    totalCostMinorUnits: Math.abs(candidate.costEffectMinorUnits),
    costEffectMinorUnits: candidate.costEffectMinorUnits,
    unitCostsMinorUnits,
    previousInventoryVersion: candidate.currentInventoryVersion,
    resultingInventoryVersion: updatedItem.recordVersion,
    previousLotVersion: candidate.currentLotVersion,
    resultingLotVersion: updatedLot.recordVersion,
    previousState: candidate.current,
    resultingState: candidate.proposed,
    reversesAdjustmentId: candidate.reversesInventoryAdjustmentId || null,
    occurredAt: timestamp,
    reason: candidate.proposal.reason,
  };
  return normalizeInventoryAdjustment({ ...draft, semanticDigest: inventoryAdjustmentSemanticDigest(draft) });
}

function reconciliationEventRecord(candidate, timestamp, adjustment, updatedItem, updatedLot) {
  const draft = {
    id: inventoryReconciliationEventId({ applicationId: candidate.applicationId, candidateId: candidate.candidateId }),
    format: "code3.inventory-reconciliation.v1",
    recordType: "INVENTORY_RECONCILIATION_EVENT",
    recordVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    provenanceManaged: true,
    confirmationMethod: "VERIFIED_OWNER_SESSION",
    eventType: candidate.eventType,
    status: INVENTORY_RECONCILIATION_STATUSES.CONFIRMED,
    category: candidate.category,
    reconciliationSequence: candidate.reconciliationSequence,
    idempotencyKey: candidate.idempotencyKey,
    proposalDigest: candidate.proposalDigest,
    candidateId: candidate.candidateId,
    applicationId: candidate.applicationId,
    inventoryCreationEventId: candidate.inventoryCreationEventId,
    sourceInventoryAdjustmentId: adjustment.id,
    sourceCorrectionCategory: adjustment.correctionCategory,
    sourceCorrectionCandidateId: adjustment.candidateId,
    purchaseId: candidate.purchaseId,
    receivingEventReferences: candidate.receivingEventReferences,
    inventoryItemId: candidate.inventoryItemId,
    inventoryLotId: candidate.inventoryLotId,
    currency: candidate.currency,
    soldQuantityAtConfirmation: candidate.soldQuantity,
    saleAllocationSequenceWatermark: candidate.saleAllocationSequenceWatermark,
    quantityEffect: candidate.quantityEffect,
    costEffectMinorUnits: candidate.costEffectMinorUnits,
    saleCogsEffectMinorUnits: candidate.saleCogsEffectMinorUnits,
    remainingInventoryCostEffectMinorUnits: candidate.remainingInventoryCostEffectMinorUnits,
    previousInventoryVersion: candidate.currentInventoryVersion,
    resultingInventoryVersion: updatedItem.recordVersion,
    previousLotVersion: candidate.currentLotVersion,
    resultingLotVersion: updatedLot.recordVersion,
    previousState: candidate.current,
    resultingState: candidate.proposed,
    affectedSales: candidate.affectedSales,
    affectedTransfers: [],
    reversesReconciliationEventId: candidate.reversesReconciliationEventId,
    reversesInventoryAdjustmentId: candidate.reversesInventoryAdjustmentId,
    occurredAt: timestamp,
    reason: candidate.proposal.reason,
  };
  return normalizeInventoryReconciliationEvent({ ...draft, semanticDigest: inventoryReconciliationEventSemanticDigest(draft) });
}

export function createInventoryReconciliationGateway(options = {}) {
  const repository = options.repository || createFlipScoutRepository(options.storage);
  const clock = options.now || (() => new Date().toISOString());
  const isOwnerAuthorized = typeof options.isOwnerAuthorized === "function" ? options.isOwnerAuthorized : () => false;
  const lockManager = options.lockManager;
  const validateExternalProvenance = typeof options.validateExternalProvenance === "function"
    ? options.validateExternalProvenance
    : () => true;

  function assertOwner() {
    if (isOwnerAuthorized() !== true) throw new InventoryReconciliationGatewayError("OWNER_REQUIRED", "A verified OWNER session is required before historical reconciliation storage access.");
  }

  function load() {
    assertOwner();
    return repository.load();
  }

  function listEvents() {
    assertOwner();
    return clone(validateInventoryReconciliationState(repository.load()).events);
  }

  function preview(inventoryItemId, proposal) {
    assertOwner();
    assertSafePurchaseReceivingInput(proposal);
    const state = repository.load();
    validateExternalProvenance(state);
    assertManagedInventoryHasNoTransferUsage(String(inventoryItemId), state);
    return deriveInventoryReconciliationCandidate({ inventoryState: state, inventoryItemId, proposal });
  }

  async function confirm({ inventoryItemId, candidateId, expectedVersion, proposal }) {
    assertOwner();
    assertSafePurchaseReceivingInput({ inventoryItemId, candidateId, expectedVersion, proposal });
    return resolveLock(lockManager, async () => {
      assertOwner();
      const before = repository.load();
      validateExternalProvenance(before);
      assertManagedInventoryHasNoTransferUsage(String(inventoryItemId), before);
      const validated = validateInventoryReconciliationState(before);
      const expectedManagedRevision = repository.managedRevision?.(before);
      if (typeof expectedManagedRevision !== "string") throw new InventoryReconciliationGatewayError("MANAGED_REVISION_UNAVAILABLE", "Historical reconciliation requires a managed-state revision boundary.");
      const normalizedProposal = normalizeInventoryReconciliationProposal(proposal);
      const requestDigest = inventoryReconciliationProposalDigest(normalizedProposal);
      const existing = validated.events.find((entry) => entry.idempotencyKey === normalizedProposal.idempotencyKey || entry.candidateId === String(candidateId));
      if (existing) {
        if (existing.candidateId !== String(candidateId) || existing.proposalDigest !== requestDigest) {
          throw new InventoryReconciliationGatewayError("IDEMPOTENCY_CONFLICT", "Historical reconciliation identity was reused with different semantics.");
        }
        const item = validated.bundles.items.find((entry) => entry.id === existing.inventoryItemId);
        const lot = validated.bundles.lots.find((entry) => entry.id === existing.inventoryLotId);
        const adjustment = validated.bundles.adjustments.find((entry) => entry.id === existing.sourceInventoryAdjustmentId);
        return Object.freeze({ reconciliationEvent: clone(existing), adjustment: clone(adjustment), inventoryItem: clone(item), inventoryLot: clone(lot), deduplicated: true, wroteReconciliation: false });
      }
      const candidate = deriveInventoryReconciliationCandidate({ inventoryState: before, inventoryItemId, proposal: normalizedProposal });
      const conflictingAdjustment = validated.bundles.adjustments.find((entry) => entry.idempotencyKey === normalizedProposal.idempotencyKey
        || entry.id === candidate.sourceInventoryAdjustmentId);
      if (conflictingAdjustment) {
        throw new InventoryReconciliationGatewayError("IDEMPOTENCY_CONFLICT", "Historical reconciliation identity is already used by a different Inventory correction.");
      }
      if (candidate.candidateId !== String(candidateId)) throw new InventoryReconciliationGatewayError("CANDIDATE_ID_MISMATCH", "Historical reconciliation candidate identity changed before confirmation.");
      if (candidate.expectedVersion !== String(expectedVersion)) throw new InventoryReconciliationGatewayError("VERSION_CONFLICT", "Inventory, Sale, or reconciliation history changed before confirmation.", { expectedVersion, actualVersion: candidate.expectedVersion });
      if (!candidate.eligible || candidate.status !== INVENTORY_RECONCILIATION_STATUSES.READY_TO_CONFIRM || candidate.blockers.length) {
        throw new InventoryReconciliationGatewayError("RECONCILIATION_BLOCKED", "Historical reconciliation has blocking review items.", { blockers: clone(candidate.blockers), status: candidate.status });
      }
      const item = validated.bundles.items.find((entry) => entry.id === candidate.inventoryItemId);
      const lot = validated.bundles.lots.find((entry) => entry.id === candidate.inventoryLotId);
      if (!item || !lot) throw new InventoryReconciliationGatewayError("INVENTORY_PROVENANCE_INCOMPLETE", "Inventory provenance is incomplete.");
      if (item.recordVersion !== candidate.currentInventoryVersion || lot.recordVersion !== candidate.currentLotVersion) {
        throw new InventoryReconciliationGatewayError("VERSION_CONFLICT", "Inventory changed before reconciliation confirmation.");
      }
      const timestamp = reconciliationTimestamp(clock, before, candidate.inventoryItemId);
      const { updatedItem, updatedLot } = updatedRecords(item, lot, candidate, timestamp);
      const adjustment = adjustmentRecord(candidate, timestamp, updatedItem, updatedLot);
      const reconciliationEvent = reconciliationEventRecord(candidate, timestamp, adjustment, updatedItem, updatedLot);
      const next = {
        ...before,
        inventory: before.inventory.map((entry) => entry.id === item.id ? updatedItem : entry),
        inventoryLots: before.inventoryLots.map((entry) => entry.id === lot.id ? updatedLot : entry),
        inventoryAdjustments: [adjustment, ...before.inventoryAdjustments],
        inventoryReconciliationEvents: [reconciliationEvent, ...(before.inventoryReconciliationEvents || [])],
      };
      const verifySourceRevision = (fresh) => {
        validateExternalProvenance(fresh);
        return true;
      };
      const write = repository.commitOwnerConfirmedInventory(next, { expectedManagedRevision, verifySourceRevision });
      if (write.fatal || write.recoveryPending || write.rollbackFailed || write.rolledBack || write.error) {
        throw new InventoryReconciliationGatewayError("RECONCILIATION_WRITE_FAILED", "Historical reconciliation could not prove a complete local commit and failed closed.", { recoveryPending: Boolean(write.recoveryPending), rolledBack: Boolean(write.rolledBack) });
      }
      const readBack = repository.load();
      validateExternalProvenance(readBack);
      const normalized = validateInventoryReconciliationState(readBack);
      const persistedEvent = normalized.events.find((entry) => entry.id === reconciliationEvent.id);
      const persistedAdjustment = normalized.bundles.adjustments.find((entry) => entry.id === adjustment.id);
      const persistedItem = normalized.bundles.items.find((entry) => entry.id === item.id);
      const persistedLot = normalized.bundles.lots.find((entry) => entry.id === lot.id);
      if (!persistedEvent || !persistedAdjustment || !persistedItem || !persistedLot
        || canonicalStringify(persistedEvent) !== canonicalStringify(reconciliationEvent)
        || canonicalStringify(persistedItem.unitAcquisitionCostsMinorUnits) !== canonicalStringify(candidate.proposed.unitAcquisitionCostsMinorUnits)
        || persistedItem.productReference !== candidate.proposed.productReference) {
        throw new InventoryReconciliationGatewayError("RECONCILIATION_READBACK_CONFLICT", "Historical reconciliation read-back did not match the confirmed preview.");
      }
      return Object.freeze({ reconciliationEvent: clone(persistedEvent), adjustment: clone(persistedAdjustment), inventoryItem: clone(persistedItem), inventoryLot: clone(persistedLot), deduplicated: false, wroteReconciliation: true });
    });
  }

  return Object.freeze({
    authoritative: "LOCAL_ONLY",
    remoteActive: false,
    candidatePersisted: false,
    originalSalesMutable: false,
    originalTransfersMutable: false,
    load,
    listEvents,
    preview,
    confirm,
  });
}
