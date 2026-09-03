import { canonicalStringify, hashCanonicalJson } from "../backup/canonicalJson.js";
import {
  PURCHASE_DRAFT_STATES,
  PURCHASE_EVENT_TYPES,
  PURCHASE_LIFECYCLE_STATES,
  PURCHASE_PROVENANCE_TYPES,
  PURCHASE_RECEIVING_FORMAT,
  PURCHASE_RECEIVING_SAFETY_CONTRACT,
  PURCHASE_SOURCE_TYPES,
  RECEIVING_DISCREPANCIES,
  RECEIVING_EVENT_STATES,
} from "./constants.js";
import {
  buildInventoryHandoffPreview,
  deriveReceivingProjection,
  normalizeCanonicalPurchase,
  normalizePurchaseDraftInput,
  normalizeReceivingEvent,
  validateDraftForConfirmation,
} from "./contracts.js";
import { createPurchaseReceivingPersistence } from "./persistence.js";
import { normalizePurchaseMoney } from "./money.js";
import { assertSafePurchaseReceivingInput, safePurchaseReceivingClone, sanitizePurchaseReceivingNote } from "./security.js";
import {
  deriveEffectiveInventoryAdjustmentIds,
  deriveInventoryCreationCandidates,
  inventoryCandidateId,
  isPhysicalInventoryReturnAdjustment,
  validateInventoryCreationStateBundles,
} from "./inventoryCreation/contracts.js";
import { createInventoryCreationGateway } from "./inventoryCreation/gateway.js";
import { INVENTORY_CREATION_SAFETY } from "./inventoryCreation/constants.js";
import { assertManagedInventoryHasNoTransferUsage, createInventoryCorrectionGateway } from "./inventoryCorrection/gateway.js";
import {
  INVENTORY_CORRECTION_CATEGORIES,
  INVENTORY_CORRECTION_SAFETY,
  INVENTORY_QUANTITY_CORRECTION_REASONS,
} from "./inventoryCorrection/constants.js";
import { createInventoryReconciliationGateway } from "./inventoryReconciliation/gateway.js";
import { INVENTORY_RECONCILIATION_SAFETY } from "./inventoryReconciliation/constants.js";
import {
  ACCOUNTANT_REVIEW_SAFETY,
  deriveAccountantReviewPreview,
} from "./accountantReview/index.js";

const PROHIBITED_OPTIONS = new Set([
  "mode", "persistenceMode", "remoteDataSource", "request", "remoteActive", "sync", "syncEngine",
  "migrationApply", "migrationExecutor", "rollbackExecutor", "providerNetworkAccess", "inventoryWriter",
  "purchaseImporter", "orderCandidateImporter", "checkoutEvidenceImporter",
]);

const CORRECTABLE_DRAFT_FIELDS = new Set([
  "retailerId", "retailerLabel", "vendorName", "retailerAccountReference", "profileReference", "externalOrderId",
  "orderedAt", "purchasedAt", "lineItems", "money", "currency", "fulfillmentType",
  "pickupStoreReference", "shippingAddressReference", "shipmentReferences", "trackingReferences",
  "warnings", "confidence", "provenance", "refundState", "returnState",
]);

export class PurchaseReceivingServiceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PurchaseReceivingServiceError";
    this.code = code;
    this.details = details;
  }
}

function replacementReturnAdjustment(inventoryState, { purchaseId, lineItemId, relatedEventId, quantity }) {
  const bundles = validateInventoryCreationStateBundles(inventoryState);
  const adjustment = bundles.adjustments.find((entry) => entry.id === String(relatedEventId || ""));
  const application = adjustment ? bundles.applications.find((entry) => entry.id === adjustment.applicationId) : null;
  const effectiveAdjustmentIds = new Set(deriveEffectiveInventoryAdjustmentIds(bundles.adjustments));
  if (!adjustment || !application || !isPhysicalInventoryReturnAdjustment(adjustment) || !effectiveAdjustmentIds.has(adjustment.id)
    || adjustment.purchaseId !== purchaseId
    || application.purchaseLineItemId !== lineItemId
    || adjustment.quantity !== quantity) {
    throw new PurchaseReceivingServiceError("REPLACEMENT_RETURN_SOURCE_INVALID", "Replacement authorization must reference the exact owner-confirmed returned Inventory quantity.");
  }
  return Object.freeze({ adjustment, application });
}

export function validateReplacementInventoryPurchaseProvenance(inventoryState, purchaseState) {
  const bundles = validateInventoryCreationStateBundles(inventoryState);
  const purchases = Array.isArray(purchaseState?.purchases) ? purchaseState.purchases : [];
  const purchaseEvents = Array.isArray(purchaseState?.purchaseEvents) ? purchaseState.purchaseEvents : [];
  const receivingEvents = Array.isArray(purchaseState?.receivingEvents) ? purchaseState.receivingEvents : [];
  for (const application of bundles.applications) {
    const purchase = purchases.find((entry) => entry.id === application.purchaseId);
    const purchaseLine = purchase?.lineItems?.find((entry) => entry.lineItemId === application.purchaseLineItemId);
    const receiving = application.receivingEventReferences.map((reference) => receivingEvents.find((entry) => entry.id === reference));
    const sourceEntries = receiving.flatMap((event) => (event?.entries || []).map((entry, receivingEntryIndex) => ({
      event,
      entry,
      receivingEntryIndex,
    })));
    const sourceMatches = sourceEntries.filter(({ event, entry, receivingEntryIndex }) => (
      entry.lineItemId === application.purchaseLineItemId
      && inventoryCandidateId({
        purchaseId: application.purchaseId,
        lineItemId: application.purchaseLineItemId,
        receivingEventId: event.id,
        receivingEntryIndex,
        replacementAuthorizationEventId: application.replacementAuthorizationEventId,
        sourceReturnAdjustmentId: application.sourceReturnAdjustmentId,
      }) === application.candidateId
    ));
    if (!purchase || purchase.recordType !== "PURCHASE" || purchase.confirmationMethod !== "VERIFIED_OWNER_SESSION"
      || !purchaseLine || purchase.currency !== application.currency
      || purchaseLine.productReference !== application.purchaseProductReference
      || receiving.some((event) => !event
        || event.recordType !== "RECEIVING_EVENT"
        || event.confirmationMethod !== "VERIFIED_OWNER_SESSION"
        || event.purchaseId !== application.purchaseId)
      || sourceMatches.length !== 1
      || sourceMatches[0].entry.quantityReceived !== application.quantity
      || (sourceMatches[0].entry.substituteProductReference || null) !== (application.receivedProductReference || null)) {
      const replacementSource = Boolean(application.replacementAuthorizationEventId
        || application.sourceReturnAdjustmentId || application.sourceReturnUnitOffset != null
        || receiving.some((event) => event?.replacementEventId));
      throw new PurchaseReceivingServiceError(
        replacementSource ? "REPLACEMENT_PURCHASE_PROVENANCE_INVALID" : "INVENTORY_PURCHASE_PROVENANCE_INVALID",
        replacementSource
          ? "Replacement Inventory no longer reconciles to its owner-confirmed Purchase and Receiving provenance."
          : "Inventory no longer reconciles to its owner-confirmed Purchase and Receiving provenance.",
      );
    }
    const replacementEventIds = new Set(receiving.map((event) => event?.replacementEventId).filter(Boolean));
    const hasReplacementProvenance = Boolean(application.replacementAuthorizationEventId
      || application.sourceReturnAdjustmentId || application.sourceReturnUnitOffset != null);
    if (!hasReplacementProvenance && replacementEventIds.size === 0) continue;
    const sourceAdjustment = bundles.adjustments.find((entry) => entry.id === application.sourceReturnAdjustmentId);
    const authorization = purchaseEvents.find((entry) => entry.id === application.replacementAuthorizationEventId);
    const receivedQuantity = receiving.flatMap((event) => event?.entries || [])
      .filter((entry) => entry.lineItemId === application.purchaseLineItemId)
      .reduce((sum, entry) => sum + entry.quantityReceived, 0);
    const identityMatches = receiving.some((event) => event?.entries?.some((entry, receivingEntryIndex) => (
      entry.lineItemId === application.purchaseLineItemId
      && inventoryCandidateId({
        purchaseId: application.purchaseId,
        lineItemId: application.purchaseLineItemId,
        receivingEventId: event.id,
        receivingEntryIndex,
        replacementAuthorizationEventId: application.replacementAuthorizationEventId,
        sourceReturnAdjustmentId: application.sourceReturnAdjustmentId,
      }) === application.candidateId
    )));
    if (!hasReplacementProvenance || replacementEventIds.size !== 1
      || !replacementEventIds.has(application.replacementAuthorizationEventId)
      || !sourceAdjustment || !authorization
      || authorization.recordType !== "PURCHASE_EVENT"
      || authorization.confirmationMethod !== "VERIFIED_OWNER_SESSION"
      || authorization.type !== PURCHASE_EVENT_TYPES.REPLACEMENT_NOTED
      || authorization.purchaseId !== application.purchaseId
      || authorization.lineItemId !== application.purchaseLineItemId
      || authorization.relatedEventId !== application.sourceReturnAdjustmentId
      || authorization.quantity !== sourceAdjustment.quantity
      || !identityMatches
      || receiving.some((event) => !event
        || event.recordType !== "RECEIVING_EVENT"
        || event.confirmationMethod !== "VERIFIED_OWNER_SESSION"
        || event.purchaseId !== application.purchaseId
        || event.replacementEventId !== authorization.id)
      || receivedQuantity !== application.quantity) {
      throw new PurchaseReceivingServiceError("REPLACEMENT_PURCHASE_PROVENANCE_INVALID", "Replacement Inventory no longer reconciles to its owner-confirmed Purchase and Receiving provenance.");
    }
  }
  return true;
}

function assertNoCallerMode(options) {
  const prohibited = Object.keys(options || {}).find((key) => PROHIBITED_OPTIONS.has(key));
  if (prohibited) throw new PurchaseReceivingServiceError("UNSAFE_OPTION_REJECTED", `Purchase/Receiving does not accept ${prohibited}; LOCAL_ONLY and verified-owner boundaries are fixed.`, { field: prohibited });
}

function isoNow(clock) {
  const parsed = new Date(clock());
  if (!Number.isFinite(parsed.getTime())) throw new PurchaseReceivingServiceError("INVALID_CLOCK", "A valid clock is required.");
  return parsed.toISOString();
}

function systemRecord(record, id, recordType, timestamp, version = 1) {
  return {
    ...record,
    id,
    format: PURCHASE_RECEIVING_FORMAT,
    recordType,
    recordVersion: version,
    createdAt: record.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

function requireExpectedVersion(record, expectedVersion) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new PurchaseReceivingServiceError("EXPECTED_VERSION_REQUIRED", "Mutation requires a positive expected recordVersion.");
  }
  if (record.recordVersion !== expectedVersion) {
    throw new PurchaseReceivingServiceError("VERSION_CONFLICT", "This record changed before the requested mutation could be applied.", { expectedVersion, actualVersion: record.recordVersion });
  }
}

function requiredRecord(state, collection, recordId) {
  const record = state[collection].find((entry) => entry.id === String(recordId));
  if (!record) throw new PurchaseReceivingServiceError("NOT_FOUND", `${collection} record ${String(recordId)} was not found.`);
  return record;
}

function replaceRecord(state, collection, record) {
  return { ...state, [collection]: state[collection].map((entry) => entry.id === record.id ? record : entry) };
}

function normalizeDraftLines(lines, idFactory) {
  if (!Array.isArray(lines)) return lines;
  return lines.map((line) => ({ ...line, lineItemId: line?.lineItemId || line?.id || String(idFactory("purchase-line")) }));
}

function draftSourceIdentity(input, draftId) {
  const sourceType = String(input.sourceType || PURCHASE_SOURCE_TYPES.MANUAL).trim().toUpperCase();
  const sourceReference = String(input.sourceReference || "").trim();
  const accountReference = String(input.retailerAccountReference || input.accountReference || "").trim();
  return sourceReference ? `${sourceType}:${accountReference}:${sourceReference}` : `${PURCHASE_SOURCE_TYPES.MANUAL}:${draftId}`;
}

function externalOrderScopeKey(value) {
  const externalOrderId = String(value.externalOrderId || value.orderId || "").trim().toUpperCase();
  if (!externalOrderId) return null;
  const retailer = String(value.retailerId || value.retailer || value.vendorName || value.vendor || "").trim().toUpperCase();
  const account = String(value.retailerAccountReference || value.accountReference || "").trim().toUpperCase();
  return `${retailer}:${account}:${externalOrderId}`;
}

function assertUniqueExternalOrder(state, candidate) {
  const key = externalOrderScopeKey(candidate);
  if (!key) return;
  const draftConflict = state.purchaseDrafts.some((entry) => entry.id !== candidate.id && externalOrderScopeKey(entry) === key);
  const purchaseConflict = state.purchases.some((entry) => externalOrderScopeKey(entry) === key && entry.sourceDraftId !== candidate.id);
  if (draftConflict || purchaseConflict) {
    throw new PurchaseReceivingServiceError("DUPLICATE_EXTERNAL_ORDER", "Another record already uses this retailer/account/external-order identity.");
  }
}

function draftReplaySemantics(draft) {
  return {
    retailerId: draft.retailerId,
    retailerLabel: draft.retailerLabel,
    vendorName: draft.vendorName,
    retailerAccountReference: draft.retailerAccountReference,
    profileReference: draft.profileReference,
    externalOrderId: draft.externalOrderId,
    orderedAt: draft.orderedAt,
    purchasedAt: draft.purchasedAt,
    lineItems: draft.lineItems.map((line) => ({
      productReference: line.productReference,
      retailerItemId: line.retailerItemId,
      sku: line.sku,
      upc: line.upc,
      gtin: line.gtin,
      tcin: line.tcin,
      title: line.title,
      category: line.category,
      productMatchStatus: line.productMatchStatus,
      quantityOrdered: line.quantityOrdered,
      unitPrice: line.unitPrice,
      lineAmount: line.lineAmount,
      cancellationQuantity: line.cancellationQuantity,
      refundedQuantity: line.refundedQuantity,
      receivedQuantity: line.receivedQuantity,
      warnings: line.warnings,
    })),
    money: draft.money,
    currency: draft.currency,
    fulfillmentType: draft.fulfillmentType,
    pickupStoreReference: draft.pickupStoreReference,
    shippingAddressReference: draft.shippingAddressReference,
    shipmentReferences: draft.shipmentReferences,
    trackingReferences: draft.trackingReferences,
    warnings: draft.warnings,
    confidence: draft.confidence,
    refundState: draft.refundState,
    returnState: draft.returnState,
  };
}

function assertCompatibleDraftReplay(existing, candidate, duplicateReason) {
  if (canonicalStringify(draftReplaySemantics(existing)) !== canonicalStringify(draftReplaySemantics(candidate))) {
    throw new PurchaseReceivingServiceError(
      "DRAFT_IDEMPOTENCY_CONFLICT",
      "The same source or external-order identity was supplied with conflicting Purchase Draft data.",
      { existingDraftId: existing.id, duplicateReason },
    );
  }
}

function createActivity(idFactory, timestamp, type, summary, relationships = {}) {
  return systemRecord({
    type,
    summary,
    occurredAt: timestamp,
    draftId: relationships.draftId || null,
    purchaseId: relationships.purchaseId || null,
    receivingEventId: relationships.receivingEventId || null,
  }, String(idFactory("purchase-activity")), "PURCHASE_RECEIVING_ACTIVITY", timestamp);
}

/**
 * Local-only orchestration. Authorization is supplied as a trusted pre-storage callback;
 * record/query/header role claims are rejected by the security contract.
 */
export function createPurchaseReceivingService(options = {}) {
  assertNoCallerMode(options);
  const now = options.now || (() => new Date().toISOString());
  let sequence = 0;
  const idFactory = options.idFactory || ((prefix) => `${prefix}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${sequence += 1}`}`);
  const isOwnerAuthorized = typeof options.isOwnerAuthorized === "function" ? options.isOwnerAuthorized : () => false;
  const persistence = createPurchaseReceivingPersistence({ storage: options.storage, repository: options.repository, now, lockManager: options.inventoryLockManager });
  const inventoryGateway = createInventoryCreationGateway({
    storage: options.inventoryStorage,
    repository: options.inventoryRepository,
    lockManager: options.inventoryLockManager,
    now,
    isOwnerAuthorized,
  });
  const inventoryCorrectionGateway = createInventoryCorrectionGateway({
    storage: options.inventoryStorage,
    repository: options.inventoryRepository,
    lockManager: options.inventoryLockManager,
    now,
    isOwnerAuthorized,
    getTransferredQuantity: options.getTransferredQuantity || assertManagedInventoryHasNoTransferUsage,
    validateExternalProvenance: (inventoryState) => validateReplacementInventoryPurchaseProvenance(inventoryState, persistence.read()),
  });
  const inventoryReconciliationGateway = createInventoryReconciliationGateway({
    storage: options.inventoryStorage,
    repository: options.inventoryRepository,
    lockManager: options.inventoryLockManager,
    now,
    isOwnerAuthorized,
    validateExternalProvenance: (inventoryState) => validateReplacementInventoryPurchaseProvenance(inventoryState, persistence.read()),
  });

  function assertOwner() {
    if (isOwnerAuthorized() !== true) throw new PurchaseReceivingServiceError("OWNER_REQUIRED", "A verified OWNER session is required before Purchase/Receiving mutation.");
  }

  function snapshot() {
    assertOwner();
    return Object.freeze({
      ...safePurchaseReceivingClone(persistence.read()),
      persistence: Object.freeze({
        mode: "LOCAL_ONLY",
        authoritative: "LOCAL_ONLY",
        remoteActive: false,
        providerNetworkAccess: false,
      }),
      safety: PURCHASE_RECEIVING_SAFETY_CONTRACT,
    });
  }

  async function listCollection(collection) {
    assertOwner();
    return safePurchaseReceivingClone(persistence.read()[collection]);
  }

  async function getRecord(collection, recordId) {
    assertOwner();
    const record = persistence.read()[collection].find((entry) => entry.id === String(recordId));
    return record ? safePurchaseReceivingClone(record) : null;
  }

  async function createDraft(input) {
    assertOwner();
    assertSafePurchaseReceivingInput(input);
    const timestamp = isoNow(now);
    const draftId = String(input.id || idFactory("purchase-draft"));
    const prepared = {
      ...input,
      id: draftId,
      lineItems: normalizeDraftLines(input.lineItems, idFactory),
      sourceIdentityKey: draftSourceIdentity(input, draftId),
    };
    const draft = normalizePurchaseDraftInput(systemRecord(prepared, draftId, "PURCHASE_DRAFT", timestamp), { persisted: true });
    const transaction = await persistence.transactLocked((state) => {
      const duplicate = state.purchaseDrafts.find((entry) => entry.sourceIdentityKey === draft.sourceIdentityKey);
      if (duplicate) {
        assertCompatibleDraftReplay(duplicate, draft, "SOURCE_IDENTITY");
        return { state, result: { draft: duplicate, deduplicated: true, wroteDraft: false } };
      }
      const externalKey = externalOrderScopeKey(draft);
      const duplicateOrder = externalKey
        ? state.purchaseDrafts.find((entry) => externalOrderScopeKey(entry) === externalKey)
        : null;
      if (duplicateOrder) {
        assertCompatibleDraftReplay(duplicateOrder, draft, "EXTERNAL_ORDER_SCOPE");
        return { state, result: { draft: duplicateOrder, deduplicated: true, wroteDraft: false, duplicateReason: "EXTERNAL_ORDER_SCOPE" } };
      }
      if (state.purchaseDrafts.some((entry) => entry.id === draft.id)) throw new PurchaseReceivingServiceError("DUPLICATE_DRAFT_ID", "Purchase Draft ID already exists.");
      return {
        state: {
          ...state,
          purchaseDrafts: [...state.purchaseDrafts, draft],
          activity: [...state.activity, createActivity(idFactory, timestamp, "PURCHASE_DRAFT_CREATED", "A local Purchase Draft was created for owner review.", { draftId })],
        },
        result: { draft, deduplicated: false, wroteDraft: true },
      };
    });
    return transaction.result;
  }

  async function correctDraft(draftId, changes, expectedVersion) {
    assertOwner();
    assertSafePurchaseReceivingInput(changes);
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw new PurchaseReceivingServiceError("CORRECTION_REQUIRED", "A Purchase Draft correction object is required.");
    const patch = changes.patch && typeof changes.patch === "object" && !Array.isArray(changes.patch) ? changes.patch : changes;
    const prohibited = Object.keys(patch).find((field) => !CORRECTABLE_DRAFT_FIELDS.has(field) && field !== "reason");
    if (prohibited) throw new PurchaseReceivingServiceError("DRAFT_FIELD_NOT_CORRECTABLE", `${prohibited} cannot be changed through the owner correction workflow.`, { field: prohibited });
    const correctedFields = Object.keys(patch).filter((field) => CORRECTABLE_DRAFT_FIELDS.has(field));
    if (!correctedFields.length) throw new PurchaseReceivingServiceError("CORRECTION_REQUIRED", "At least one correctable Purchase Draft field is required.");
    const timestamp = isoNow(now);
    return (await persistence.transactLocked((state) => {
      const current = requiredRecord(state, "purchaseDrafts", draftId);
      requireExpectedVersion(current, expectedVersion);
      if ([PURCHASE_DRAFT_STATES.CONFIRMED, PURCHASE_DRAFT_STATES.REJECTED, PURCHASE_DRAFT_STATES.CANCELLED].includes(current.status)) {
        throw new PurchaseReceivingServiceError("DRAFT_TERMINAL", "A terminal Purchase Draft cannot be corrected.");
      }
      const normalizedCorrection = normalizePurchaseDraftInput({
        ...current,
        ...Object.fromEntries(correctedFields.map((field) => [field, patch[field]])),
        lineItems: Object.prototype.hasOwnProperty.call(patch, "lineItems") ? normalizeDraftLines(patch.lineItems, idFactory) : current.lineItems,
        corrections: current.corrections,
        status: PURCHASE_DRAFT_STATES.NEEDS_REVIEW,
        recordVersion: current.recordVersion + 1,
        updatedAt: timestamp,
      }, { persisted: true });
      // Provenance records retain only the canonical field projection. Raw correction
      // input (including harmless unknown nested keys) is never a persistence channel.
      const correctionRecords = correctedFields.map((field) => ({
        field,
        previousValue: current[field],
        correctedValue: normalizedCorrection[field],
        reason: changes.reason || null,
        correctedAt: timestamp,
        provenance: PURCHASE_PROVENANCE_TYPES.OWNER_CORRECTION,
      }));
      const candidate = normalizePurchaseDraftInput({
        ...normalizedCorrection,
        corrections: [...current.corrections, ...correctionRecords],
      }, { persisted: true });
      assertUniqueExternalOrder(state, candidate);
      return {
        state: {
          ...replaceRecord(state, "purchaseDrafts", candidate),
          activity: [...state.activity, createActivity(idFactory, timestamp, "PURCHASE_DRAFT_CORRECTED", "A Purchase Draft was corrected; original evidence remains in its correction history.", { draftId: candidate.id })],
        },
        result: candidate,
      };
    })).result;
  }

  async function markDraftReady(draftId, expectedVersion) {
    assertOwner();
    const timestamp = isoNow(now);
    return (await persistence.transactLocked((state) => {
      const current = requiredRecord(state, "purchaseDrafts", draftId);
      requireExpectedVersion(current, expectedVersion);
      if ([PURCHASE_DRAFT_STATES.CONFIRMED, PURCHASE_DRAFT_STATES.REJECTED, PURCHASE_DRAFT_STATES.CANCELLED].includes(current.status)) throw new PurchaseReceivingServiceError("DRAFT_TERMINAL", "A terminal Purchase Draft cannot be readied.");
      const candidate = normalizePurchaseDraftInput({ ...current, status: PURCHASE_DRAFT_STATES.READY_TO_CONFIRM, recordVersion: current.recordVersion + 1, updatedAt: timestamp }, { persisted: true });
      assertUniqueExternalOrder(state, candidate);
      const validation = validateDraftForConfirmation(candidate);
      if (!validation.valid) throw new PurchaseReceivingServiceError("DRAFT_NOT_CONFIRMABLE", "Purchase Draft has blocking confirmation errors.", validation);
      return { state: replaceRecord(state, "purchaseDrafts", candidate), result: { draft: candidate, validation } };
    })).result;
  }

  async function terminateDraft(draftId, status, reason, expectedVersion) {
    assertOwner();
    const timestamp = isoNow(now);
    return (await persistence.transactLocked((state) => {
      const current = requiredRecord(state, "purchaseDrafts", draftId);
      requireExpectedVersion(current, expectedVersion);
      if (current.status === PURCHASE_DRAFT_STATES.CONFIRMED) throw new PurchaseReceivingServiceError("DRAFT_CONFIRMED", "A confirmed Purchase Draft cannot be rejected or cancelled.");
      if ([PURCHASE_DRAFT_STATES.REJECTED, PURCHASE_DRAFT_STATES.CANCELLED].includes(current.status)) return { state, result: current };
      const updated = normalizePurchaseDraftInput({
        ...current,
        status,
        reviewedAt: timestamp,
        rejectedAt: status === PURCHASE_DRAFT_STATES.REJECTED ? timestamp : current.rejectedAt,
        rejectionReason: sanitizePurchaseReceivingNote(reason, status === PURCHASE_DRAFT_STATES.REJECTED ? "Purchase Draft was rejected." : "Purchase Draft was cancelled."),
        recordVersion: current.recordVersion + 1,
        updatedAt: timestamp,
      }, { persisted: true });
      return {
        state: {
          ...replaceRecord(state, "purchaseDrafts", updated),
          activity: [...state.activity, createActivity(idFactory, timestamp, `PURCHASE_DRAFT_${status}`, `Purchase Draft review completed: ${status}.`, { draftId: current.id })],
        },
        result: updated,
      };
    })).result;
  }

  async function confirmDraft(draftId, confirmation = {}) {
    assertOwner();
    assertSafePurchaseReceivingInput(confirmation);
    const timestamp = isoNow(now);
    const transaction = await persistence.transactLocked((state) => {
      const current = requiredRecord(state, "purchaseDrafts", draftId);
      const confirmationKey = `purchase-confirm:${current.id}`;
      const existing = state.purchases.find((entry) => entry.sourceDraftId === current.id || entry.confirmationKey === confirmationKey);
      if (existing) return { state, result: { draft: current, purchase: existing, deduplicated: true, wrotePurchase: false } };
      const externalKey = externalOrderScopeKey(current);
      if (externalKey && state.purchases.some((entry) => externalOrderScopeKey(entry) === externalKey)) {
        throw new PurchaseReceivingServiceError("DUPLICATE_EXTERNAL_ORDER", "A confirmed Purchase already uses this retailer/account/external-order identity.");
      }
      requireExpectedVersion(current, confirmation.expectedVersion);
      const validation = validateDraftForConfirmation(current);
      if (!validation.valid) throw new PurchaseReceivingServiceError("DRAFT_NOT_CONFIRMABLE", "Purchase Draft has blocking confirmation errors.", validation);
      const purchaseId = String(idFactory("purchase"));
      const eventId = String(idFactory("purchase-event"));
      const purchase = normalizeCanonicalPurchase(systemRecord({
        ...current,
        id: purchaseId,
        sourceDraftId: current.id,
        confirmationKey,
        status: "CONFIRMED",
        receivingStatus: "NOT_RECEIVED",
        confirmedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        historyReferences: [eventId],
        corrections: current.corrections,
        provenance: [...current.provenance, { type: PURCHASE_PROVENANCE_TYPES.PURCHASE_CONFIRMATION, field: null, sourceReference: current.id, recordedAt: timestamp, note: "Owner confirmed the Purchase Draft." }],
      }, purchaseId, "PURCHASE", timestamp), { persisted: true });
      const purchaseEvent = systemRecord({
        purchaseId,
        draftId: current.id,
        idempotencyKey: confirmationKey,
        type: PURCHASE_EVENT_TYPES.PURCHASE_CONFIRMED,
        occurredAt: timestamp,
        summary: "An owner-confirmed Purchase was created from a reviewed Purchase Draft.",
        sourceReference: current.sourceReference,
        provenance: PURCHASE_PROVENANCE_TYPES.PURCHASE_CONFIRMATION,
      }, eventId, "PURCHASE_EVENT", timestamp);
      const updatedDraft = normalizePurchaseDraftInput({
        ...current,
        status: PURCHASE_DRAFT_STATES.CONFIRMED,
        confirmedPurchaseId: purchaseId,
        reviewedAt: timestamp,
        recordVersion: current.recordVersion + 1,
        updatedAt: timestamp,
      }, { persisted: true });
      return {
        state: {
          ...replaceRecord(state, "purchaseDrafts", updatedDraft),
          purchases: [...state.purchases, purchase],
          purchaseEvents: [...state.purchaseEvents, purchaseEvent],
          activity: [...state.activity, createActivity(idFactory, timestamp, "PURCHASE_CONFIRMED", "A Purchase was explicitly confirmed; Receiving and Inventory remain separate.", { draftId: current.id, purchaseId })],
        },
        result: { draft: updatedDraft, purchase, deduplicated: false, wrotePurchase: true },
      };
    });
    return transaction.result;
  }

  async function recordPurchaseEvent(purchaseId, input) {
    assertOwner();
    assertSafePurchaseReceivingInput(input);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new PurchaseReceivingServiceError("PURCHASE_EVENT_INPUT_REQUIRED", "Purchase Event input is required.");
    const type = String(input.type || "").trim().toUpperCase();
    if (!Object.values(PURCHASE_EVENT_TYPES).includes(type) || type === PURCHASE_EVENT_TYPES.PURCHASE_CONFIRMED) {
      throw new PurchaseReceivingServiceError("PURCHASE_EVENT_TYPE_INVALID", "Purchase adjustment type is unsupported.");
    }
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (!idempotencyKey) throw new PurchaseReceivingServiceError("IDEMPOTENCY_KEY_REQUIRED", "Purchase adjustment requires a stable idempotencyKey.");
    const timestamp = isoNow(now);
    return (await persistence.transactLocked((state) => {
      const purchase = requiredRecord(state, "purchases", purchaseId);
      const existing = state.purchaseEvents.find((entry) => entry.purchaseId === purchase.id && entry.idempotencyKey === idempotencyKey);
      if (existing) {
        const retryAmount = type === PURCHASE_EVENT_TYPES.REFUND_RECORDED
          ? normalizePurchaseMoney(input.amount, { currency: purchase.currency, field: "purchaseEvent.amount" })
          : null;
        const existingSemantics = {
          type: existing.type, lineItemId: existing.lineItemId, quantity: existing.quantity,
          amount: existing.amount, relatedEventId: existing.relatedEventId,
          replacementReference: existing.replacementReference,
        };
        const retrySemantics = {
          type,
          lineItemId: input.lineItemId == null ? null : String(input.lineItemId).trim(),
          quantity: input.quantity ?? null,
          amount: retryAmount,
          relatedEventId: input.relatedEventId || null,
          replacementReference: input.replacementReference || null,
        };
        if (canonicalStringify(existingSemantics) !== canonicalStringify(retrySemantics)) {
          throw new PurchaseReceivingServiceError("IDEMPOTENCY_CONFLICT", "Purchase Event idempotency key was reused with different adjustment data.");
        }
        return { state, result: { event: existing, purchase, deduplicated: true, wroteEvent: false } };
      }
      const lineItemId = input.lineItemId == null ? null : String(input.lineItemId).trim();
      const lineIndex = lineItemId ? purchase.lineItems.findIndex((line) => line.lineItemId === lineItemId) : -1;
      if (lineItemId && lineIndex < 0) throw new PurchaseReceivingServiceError("UNKNOWN_PURCHASE_LINE", "Purchase Event references a line outside the Purchase.", { lineItemId });
      const quantity = input.quantity == null ? null : input.quantity;
      if (quantity != null && (!Number.isSafeInteger(quantity) || quantity < 1)) throw new PurchaseReceivingServiceError("INVALID_EVENT_QUANTITY", "Purchase Event quantity must be a positive safe integer.");
      let lineItems = purchase.lineItems.map((line) => safePurchaseReceivingClone(line));
      let money = safePurchaseReceivingClone(purchase.money);
      let status = purchase.status;
      let amount = null;

      if (type === PURCHASE_EVENT_TYPES.CANCELLATION_RECORDED) {
        if (lineIndex < 0 || quantity == null) throw new PurchaseReceivingServiceError("CANCELLATION_LINE_QUANTITY_REQUIRED", "Cancellation requires a Purchase line and positive quantity.");
        const receiving = deriveReceivingProjection(purchase, state.receivingEvents, state.purchaseEvents);
        const received = receiving.lineItems.find((line) => line.lineItemId === lineItemId)?.receivedQuantity || 0;
        const line = lineItems[lineIndex];
        if (line.cancellationQuantity + quantity > line.quantityOrdered - received) {
          throw new PurchaseReceivingServiceError("CANCELLATION_EXCEEDS_AVAILABLE", "Cancellation quantity cannot exceed ordered quantity that has not been received.");
        }
        lineItems[lineIndex] = { ...line, cancellationQuantity: line.cancellationQuantity + quantity };
        const ordered = lineItems.reduce((sum, entry) => sum + entry.quantityOrdered, 0);
        const cancelled = lineItems.reduce((sum, entry) => sum + entry.cancellationQuantity, 0);
        status = cancelled === ordered ? PURCHASE_LIFECYCLE_STATES.CANCELLED : PURCHASE_LIFECYCLE_STATES.PARTIALLY_CANCELLED;
      }

      if (type === PURCHASE_EVENT_TYPES.REFUND_RECORDED) {
        amount = normalizePurchaseMoney(input.amount, { currency: purchase.currency, field: "purchaseEvent.amount" });
        if (amount.currency !== purchase.currency || amount.minorUnits <= 0) throw new PurchaseReceivingServiceError("INVALID_REFUND_AMOUNT", "Refund must be positive exact money in the Purchase currency.");
        const nextRefunded = purchase.money.refunded.minorUnits + amount.minorUnits;
        if (!Number.isSafeInteger(nextRefunded) || nextRefunded > purchase.money.grandTotal.minorUnits) {
          throw new PurchaseReceivingServiceError("REFUND_EXCEEDS_PAID", "Cumulative refunds cannot exceed the Purchase grand total.");
        }
        money = { ...money, refunded: { minorUnits: nextRefunded, currency: purchase.currency } };
        if (quantity != null) {
          if (lineIndex < 0) throw new PurchaseReceivingServiceError("REFUND_LINE_REQUIRED", "A quantity refund requires a Purchase line.");
          const line = lineItems[lineIndex];
          if (line.refundedQuantity + quantity > line.quantityOrdered) throw new PurchaseReceivingServiceError("REFUND_QUANTITY_EXCEEDS_ORDERED", "Refunded quantity cannot exceed ordered quantity.");
          lineItems[lineIndex] = { ...line, refundedQuantity: line.refundedQuantity + quantity };
        }
        status = nextRefunded === purchase.money.grandTotal.minorUnits ? PURCHASE_LIFECYCLE_STATES.REFUNDED : PURCHASE_LIFECYCLE_STATES.PARTIALLY_REFUNDED;
      }

      if ([PURCHASE_EVENT_TYPES.RETURN_INITIATED, PURCHASE_EVENT_TYPES.RETURN_COMPLETED].includes(type)) {
        if (quantity != null && lineIndex < 0) throw new PurchaseReceivingServiceError("RETURN_LINE_REQUIRED", "A quantified return requires a Purchase line.");
        if (quantity != null && quantity > lineItems[lineIndex].quantityOrdered - lineItems[lineIndex].cancellationQuantity) {
          throw new PurchaseReceivingServiceError("RETURN_QUANTITY_EXCEEDS_ORDERED", "Return quantity cannot exceed non-cancelled ordered quantity.");
        }
        status = type === PURCHASE_EVENT_TYPES.RETURN_COMPLETED ? PURCHASE_LIFECYCLE_STATES.RETURNED : PURCHASE_LIFECYCLE_STATES.RETURN_INITIATED;
      }

      if (type === PURCHASE_EVENT_TYPES.REPLACEMENT_NOTED) {
        const reference = String(input.replacementReference || "").trim();
        if (!reference) throw new PurchaseReceivingServiceError("REPLACEMENT_REFERENCE_REQUIRED", "Replacement history requires a safe reference.");
        const scoped = [lineItemId, quantity, input.relatedEventId].filter((value) => value != null && value !== "").length;
        if (scoped > 0 && scoped !== 3) throw new PurchaseReceivingServiceError("REPLACEMENT_AUTHORIZATION_INCOMPLETE", "Replacement authorization requires a Purchase line, quantity, and returned Inventory event.");
        if (scoped === 3) {
          replacementReturnAdjustment(inventoryGateway.load(), {
            purchaseId: purchase.id,
            lineItemId,
            relatedEventId: input.relatedEventId,
            quantity,
          });
          if (state.purchaseEvents.some((entry) => entry.type === PURCHASE_EVENT_TYPES.REPLACEMENT_NOTED && entry.relatedEventId === input.relatedEventId)) {
            throw new PurchaseReceivingServiceError("DUPLICATE_REPLACEMENT_SOURCE", "Returned Inventory may authorize only one replacement workflow.");
          }
        }
        status = PURCHASE_LIFECYCLE_STATES.REPLACEMENT_PENDING;
      }

      const eventId = String(idFactory("purchase-event"));
      const event = systemRecord({
        purchaseId: purchase.id,
        draftId: purchase.sourceDraftId,
        idempotencyKey,
        type,
        occurredAt: input.occurredAt || timestamp,
        confirmedAt: timestamp,
        summary: sanitizePurchaseReceivingNote(input.summary, "An owner-confirmed Purchase adjustment was recorded."),
        sourceReference: purchase.sourceReference,
        lineItemId,
        quantity,
        amount,
        relatedEventId: input.relatedEventId || null,
        replacementReference: input.replacementReference || null,
        reason: input.reason || null,
        provenance: PURCHASE_PROVENANCE_TYPES.PURCHASE_CONFIRMATION,
        inventoryMutationPerformed: false,
      }, eventId, "PURCHASE_EVENT", timestamp);
      let updatedPurchase = normalizeCanonicalPurchase({
        ...purchase,
        lineItems,
        money,
        status,
        historyReferences: [...purchase.historyReferences, eventId],
        recordVersion: purchase.recordVersion + 1,
        updatedAt: timestamp,
      }, { persisted: true });
      if (type === PURCHASE_EVENT_TYPES.CANCELLATION_RECORDED) {
        const projection = deriveReceivingProjection(updatedPurchase, state.receivingEvents, state.purchaseEvents);
        updatedPurchase = normalizeCanonicalPurchase({ ...updatedPurchase, receivingStatus: projection.status }, { persisted: true });
      }
      return {
        state: {
          ...replaceRecord(state, "purchases", updatedPurchase),
          purchaseEvents: [...state.purchaseEvents, event],
          activity: [...state.activity, createActivity(idFactory, timestamp, "PURCHASE_EVENT_RECORDED", "An append-only Purchase adjustment was recorded without Inventory mutation.", { purchaseId: purchase.id })],
        },
        result: { event, purchase: updatedPurchase, deduplicated: false, wroteEvent: true },
      };
    })).result;
  }

  async function recordReceivingEvent(purchaseId, input) {
    assertOwner();
    assertSafePurchaseReceivingInput(input);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new PurchaseReceivingServiceError("RECEIVING_INPUT_REQUIRED", "Receiving Event input is required.");
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (!idempotencyKey) throw new PurchaseReceivingServiceError("IDEMPOTENCY_KEY_REQUIRED", "Receiving confirmation requires a stable idempotencyKey.");
    const timestamp = isoNow(now);
    const transaction = await persistence.transactLocked((state) => {
      const purchase = requiredRecord(state, "purchases", purchaseId);
      const existing = state.receivingEvents.find((entry) => entry.purchaseId === purchase.id && entry.idempotencyKey === idempotencyKey);
      if (existing) {
        const retry = normalizeReceivingEvent({
          ...existing,
          ...input,
          id: existing.id,
          purchaseId: purchase.id,
          idempotencyKey,
          occurredAt: input.occurredAt || existing.occurredAt,
          confirmedAt: existing.confirmedAt,
          status: input.status || existing.status,
          provenance: input.provenance || existing.provenance,
          recordVersion: existing.recordVersion,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        }, { persisted: true });
        const fields = (entry) => ({
          occurredAt: entry.occurredAt,
          locationReference: entry.locationReference,
          status: entry.status,
          replacementEventId: entry.replacementEventId,
          entries: entry.entries,
          notes: entry.notes,
        });
        if (canonicalStringify(fields(existing)) !== canonicalStringify(fields(retry))) {
          throw new PurchaseReceivingServiceError("IDEMPOTENCY_CONFLICT", "Receiving Event idempotency key was reused with different receiving data.");
        }
        return { state, result: { event: existing, purchase, projection: deriveReceivingProjection(purchase, state.receivingEvents, state.purchaseEvents), deduplicated: true, wroteEvent: false } };
      }
      const eventId = String(idFactory("receiving-event"));
      let event = normalizeReceivingEvent(systemRecord({
        ...input,
        id: eventId,
        purchaseId: purchase.id,
        idempotencyKey,
        occurredAt: input.occurredAt || timestamp,
        confirmedAt: timestamp,
        status: input.status || RECEIVING_EVENT_STATES.PARTIALLY_RECEIVED,
        provenance: input.provenance || [{ type: PURCHASE_PROVENANCE_TYPES.RECEIVING_CONFIRMATION, field: null, sourceReference: purchase.id, recordedAt: timestamp, note: "Owner confirmed physical Receiving." }],
      }, eventId, "RECEIVING_EVENT", timestamp), { persisted: true });
      const lineIds = new Set(purchase.lineItems.map((line) => line.lineItemId));
      const unknownLine = event.entries.find((entry) => !lineIds.has(entry.lineItemId));
      if (unknownLine) throw new PurchaseReceivingServiceError("UNKNOWN_PURCHASE_LINE", "Receiving Event references a line outside the Purchase.", { lineItemId: unknownLine.lineItemId });
      if (event.replacementEventId) {
        const authorization = state.purchaseEvents.find((entry) => entry.id === event.replacementEventId
          && entry.purchaseId === purchase.id
          && entry.type === PURCHASE_EVENT_TYPES.REPLACEMENT_NOTED);
        if (!authorization) throw new PurchaseReceivingServiceError("REPLACEMENT_AUTHORIZATION_REQUIRED", "Replacement Receiving requires a scoped owner-confirmed replacement event.");
        replacementReturnAdjustment(inventoryGateway.load(), {
          purchaseId: purchase.id,
          lineItemId: authorization.lineItemId,
          relatedEventId: authorization.relatedEventId,
          quantity: authorization.quantity,
        });
      }
      const projected = deriveReceivingProjection(purchase, [...state.receivingEvents, event], state.purchaseEvents);
      const hasDiscrepancy = event.entries.some((entry) => entry.discrepancy !== RECEIVING_DISCREPANCIES.NONE);
      if (!hasDiscrepancy) {
        const normalizedStatus = projected.status === "FULLY_RECEIVED" ? RECEIVING_EVENT_STATES.FULLY_RECEIVED : RECEIVING_EVENT_STATES.PARTIALLY_RECEIVED;
        event = normalizeReceivingEvent({ ...event, status: normalizedStatus }, { persisted: true });
      }
      const updatedPurchase = normalizeCanonicalPurchase({
        ...purchase,
        receivingStatus: projected.status,
        historyReferences: [...purchase.historyReferences, event.id],
        recordVersion: purchase.recordVersion + 1,
        updatedAt: timestamp,
      }, { persisted: true });
      return {
        state: {
          ...replaceRecord(state, "purchases", updatedPurchase),
          receivingEvents: [...state.receivingEvents, event],
          activity: [...state.activity, createActivity(idFactory, timestamp, "RECEIVING_CONFIRMED", "Physical Receiving was confirmed without creating Inventory.", { purchaseId: purchase.id, receivingEventId: event.id })],
        },
        result: { event, purchase: updatedPurchase, projection: projected, deduplicated: false, wroteEvent: true },
      };
    });
    return transaction.result;
  }

  function previewInventoryHandoff(purchaseId) {
    assertOwner();
    const state = persistence.read();
    const purchase = requiredRecord(state, "purchases", purchaseId);
    return buildInventoryHandoffPreview(purchase, state.receivingEvents, state.purchaseEvents);
  }

  function previewInventoryCreation(purchaseId, reviews = {}) {
    assertOwner();
    assertSafePurchaseReceivingInput(reviews);
    const sourceState = persistence.read();
    const purchase = requiredRecord(sourceState, "purchases", purchaseId);
    return deriveInventoryCreationCandidates({
      purchase,
      receivingEvents: sourceState.receivingEvents,
      purchaseEvents: sourceState.purchaseEvents,
      inventoryState: inventoryGateway.load(),
      reviews,
    });
  }

  async function confirmInventoryCreation(candidateId, input = {}) {
    assertOwner();
    assertSafePurchaseReceivingInput(input);
    const allowed = new Set(["expectedVersion", "review"]);
    const unknown = Object.keys(input || {}).find((key) => !allowed.has(key));
    if (unknown) throw new PurchaseReceivingServiceError("UNSUPPORTED_INVENTORY_CONFIRMATION_FIELD", `${unknown} cannot supply Inventory authority.`, { field: unknown });
    const expectedVersion = String(input.expectedVersion || "").trim();
    if (!expectedVersion) throw new PurchaseReceivingServiceError("EXPECTED_VERSION_REQUIRED", "Inventory confirmation requires the reviewed candidate version.");
    const review = input.review || {};
    return inventoryGateway.confirm({
      candidateId: String(candidateId),
      expectedVersion,
      deriveCurrentCandidate(inventoryState) {
        const sourceState = persistence.read();
        for (const purchase of sourceState.purchases) {
          const candidate = deriveInventoryCreationCandidates({
            purchase,
            receivingEvents: sourceState.receivingEvents,
            purchaseEvents: sourceState.purchaseEvents,
            inventoryState,
            reviews: { [candidateId]: review },
          }).find((entry) => entry.candidateId === candidateId);
          if (candidate) return candidate;
        }
        throw new PurchaseReceivingServiceError("INVENTORY_CANDIDATE_NOT_FOUND", "Inventory candidate source is unavailable.");
      },
    });
  }

  async function reverseInventoryCreation(applicationId, input = {}) {
    assertOwner();
    assertSafePurchaseReceivingInput(input);
    const allowed = new Set(["expectedInventoryVersion", "quantity", "reason", "idempotencyKey"]);
    const unknown = Object.keys(input || {}).find((key) => !allowed.has(key));
    if (unknown) throw new PurchaseReceivingServiceError("UNSUPPORTED_INVENTORY_REVERSAL_FIELD", `${unknown} cannot change authoritative Inventory.`, { field: unknown });
    if (!String(input.idempotencyKey || "").trim()) throw new PurchaseReceivingServiceError("IDEMPOTENCY_KEY_REQUIRED", "Inventory reversal requires an idempotency key.");
    return inventoryGateway.reverse({ applicationId, ...input });
  }

  function previewInventoryCorrection(inventoryItemId, proposal = {}) {
    assertOwner();
    assertSafePurchaseReceivingInput(proposal);
    return inventoryCorrectionGateway.preview(String(inventoryItemId), proposal);
  }

  async function confirmInventoryCorrection(inventoryItemId, candidateId, input = {}) {
    assertOwner();
    assertSafePurchaseReceivingInput(input);
    const allowed = new Set(["expectedVersion", "proposal"]);
    const unknown = Object.keys(input || {}).find((key) => !allowed.has(key));
    if (unknown) throw new PurchaseReceivingServiceError("UNSUPPORTED_INVENTORY_CORRECTION_FIELD", `${unknown} cannot supply Inventory correction authority.`, { field: unknown });
    const expectedVersion = String(input.expectedVersion || "").trim();
    if (!expectedVersion) throw new PurchaseReceivingServiceError("EXPECTED_VERSION_REQUIRED", "Inventory correction confirmation requires the reviewed candidate version.");
    return inventoryCorrectionGateway.confirm({
      inventoryItemId: String(inventoryItemId),
      candidateId: String(candidateId),
      expectedVersion,
      proposal: input.proposal || {},
    });
  }

  function previewInventoryReconciliation(inventoryItemId, proposal = {}) {
    assertOwner();
    assertSafePurchaseReceivingInput(proposal);
    return inventoryReconciliationGateway.preview(String(inventoryItemId), proposal);
  }

  async function confirmInventoryReconciliation(inventoryItemId, candidateId, input = {}) {
    assertOwner();
    assertSafePurchaseReceivingInput(input);
    const allowed = new Set(["expectedVersion", "proposal"]);
    const unknown = Object.keys(input || {}).find((key) => !allowed.has(key));
    if (unknown) throw new PurchaseReceivingServiceError("UNSUPPORTED_INVENTORY_RECONCILIATION_FIELD", `${unknown} cannot supply historical reconciliation authority.`, { field: unknown });
    const expectedVersion = String(input.expectedVersion || "").trim();
    if (!expectedVersion) throw new PurchaseReceivingServiceError("EXPECTED_VERSION_REQUIRED", "Historical reconciliation confirmation requires the reviewed candidate version.");
    return inventoryReconciliationGateway.confirm({
      inventoryItemId: String(inventoryItemId),
      candidateId: String(candidateId),
      expectedVersion,
      proposal: input.proposal || {},
    });
  }

  function previewAccountantReview(filters = {}) {
    assertOwner();
    assertSafePurchaseReceivingInput(filters);
    const inventoryState = inventoryCorrectionGateway.load();
    const purchaseReceivingState = persistence.read();
    validateReplacementInventoryPurchaseProvenance(inventoryState, purchaseReceivingState);
    return deriveAccountantReviewPreview({ inventoryState, purchaseReceivingState }, filters);
  }

  return Object.freeze({
    mode: "LOCAL_ONLY",
    authoritative: "LOCAL_ONLY",
    remoteActive: false,
    providerNetworkAccess: false,
    automaticPurchaseCreation: false,
    automaticReceiving: false,
    automaticInventoryMutation: false,
    inventoryWriterAvailable: true,
    inventoryCreationSafety: INVENTORY_CREATION_SAFETY,
    inventoryCorrectionSafety: INVENTORY_CORRECTION_SAFETY,
    inventoryReconciliationSafety: INVENTORY_RECONCILIATION_SAFETY,
    accountantReviewSafety: ACCOUNTANT_REVIEW_SAFETY,
    storageKey: persistence.repository.storageKey,
    snapshot,
    loadSnapshot: snapshot,
    listDrafts: () => listCollection("purchaseDrafts"),
    listPurchases: () => listCollection("purchases"),
    listPurchaseEvents: () => listCollection("purchaseEvents"),
    listReceivingEvents: () => listCollection("receivingEvents"),
    listActivity: () => listCollection("activity"),
    getDraft: (recordId) => getRecord("purchaseDrafts", recordId),
    getPurchase: (recordId) => getRecord("purchases", recordId),
    createDraft,
    correctDraft,
    markDraftReady,
    rejectDraft: (draftId, reason, expectedVersion) => terminateDraft(draftId, PURCHASE_DRAFT_STATES.REJECTED, reason, expectedVersion),
    cancelDraft: (draftId, reason, expectedVersion) => terminateDraft(draftId, PURCHASE_DRAFT_STATES.CANCELLED, reason, expectedVersion),
    confirmDraft,
    confirmPurchaseDraft: confirmDraft,
    recordPurchaseEvent,
    recordPurchaseAdjustment: recordPurchaseEvent,
    recordReceivingEvent,
    previewInventoryHandoff,
    previewInventoryCreation,
    confirmInventoryCreation,
    reverseInventoryCreation,
    previewInventoryCorrection,
    confirmInventoryCorrection,
    previewInventoryReconciliation,
    confirmInventoryReconciliation,
    previewAccountantReview,
    listInventoryReconciliationEvents: () => {
      assertOwner();
      return safePurchaseReceivingClone(inventoryReconciliationGateway.listEvents());
    },
    listManagedInventory: () => {
      assertOwner();
      return safePurchaseReceivingClone(inventoryCorrectionGateway.load().inventory.filter((entry) => entry.provenanceManaged === true));
    },
    listInventoryAdjustments: () => {
      assertOwner();
      return safePurchaseReceivingClone(inventoryCorrectionGateway.load().inventoryAdjustments);
    },
    listInventoryCreationApplications: () => {
      assertOwner();
      return safePurchaseReceivingClone(inventoryGateway.load().inventoryCreationApplications);
    },
    listInventoryCreationEvents: () => {
      assertOwner();
      return safePurchaseReceivingClone(inventoryGateway.load().inventoryCreationEvents);
    },
    stateHash: () => {
      assertOwner();
      return hashCanonicalJson(persistence.read());
    },
    canonicalSnapshot: () => {
      assertOwner();
      return canonicalStringify(persistence.read());
    },
  });
}
