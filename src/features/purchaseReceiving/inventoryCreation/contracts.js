import { canonicalStringify } from "../../backup/canonicalJson.js";
import {
  PRODUCT_MATCH_STATES,
  PURCHASE_LIFECYCLE_STATES,
  RECEIVING_DISCREPANCIES,
  RECEIVING_EVENT_STATES,
} from "../constants.js";
import {
  deriveReceivingProjection,
  deriveReplacementReceivingAuthorizations,
  normalizeCanonicalPurchase,
  normalizeReceivingEvent,
} from "../contracts.js";
import { assertSafePurchaseReceivingInput, sanitizePurchaseReceivingNote } from "../security.js";
import { allocateReceivingCostSlice, sumMinorUnits } from "./allocation.js";
import {
  INVENTORY_CREATION_APPLICATION_STATES,
  INVENTORY_ADJUSTMENT_TYPES,
  INVENTORY_CREATION_CONDITIONS,
  INVENTORY_CREATION_DISPOSITIONS,
  INVENTORY_CREATION_EVENT_TYPES,
  INVENTORY_CREATION_FORMAT,
  INVENTORY_CREATION_LIMITS,
  INVENTORY_CREATION_MATCH_STATES,
  INVENTORY_CREATION_ACTIVE_CLASSIFICATIONS,
  INVENTORY_CREATION_PRODUCT_CLASSIFICATIONS,
} from "./constants.js";
import {
  INVENTORY_CORRECTION_CATEGORIES,
  INVENTORY_CORRECTION_DISPOSITIONS,
  INVENTORY_CORRECTION_EVENT_KINDS,
  INVENTORY_QUANTITY_CORRECTION_REASONS,
} from "../inventoryCorrection/constants.js";

export class InventoryCreationValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "InventoryCreationValidationError";
    this.code = code;
    this.details = details;
  }
}

function boundedText(value, field, options = {}) {
  if (value == null || value === "") {
    if (options.required) throw new InventoryCreationValidationError("REQUIRED_FIELD", `${field} is required.`, { field });
    return null;
  }
  const text = String(value).trim();
  const maximum = options.maximum || INVENTORY_CREATION_LIMITS.maximumIdentifier;
  if (!text || text.length > maximum) throw new InventoryCreationValidationError("INVALID_TEXT", `${field} must be a bounded string.`, { field });
  return text;
}

function safeInteger(value, field, minimum = 0, maximum = INVENTORY_CREATION_LIMITS.maximumQuantity) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new InventoryCreationValidationError("INVALID_INTEGER", `${field} must be a bounded safe integer.`, { field });
  }
  return value;
}

function safeMinorUnits(value, field) {
  return safeInteger(value, field, 0, Number.MAX_SAFE_INTEGER);
}

function timestamp(value, field) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new InventoryCreationValidationError("INVALID_TIMESTAMP", `${field} must be a valid timestamp.`, { field });
  return parsed.toISOString();
}

function enumValue(value, values, field) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!Object.values(values).includes(normalized)) throw new InventoryCreationValidationError("INVALID_ENUM", `${field} is unsupported.`, { field });
  return normalized;
}

function references(value, field) {
  if (!Array.isArray(value) || !value.length || value.length > INVENTORY_CREATION_LIMITS.maximumReferences) {
    throw new InventoryCreationValidationError("INVALID_REFERENCES", `${field} must be a bounded non-empty array.`, { field });
  }
  return Object.freeze([...new Set(value.map((entry, index) => boundedText(entry, `${field}[${index}]`, { required: true })))]);
}

function warnings(value) {
  if (value == null) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > INVENTORY_CREATION_LIMITS.maximumWarnings) throw new InventoryCreationValidationError("INVALID_WARNINGS", "warnings must be a bounded array.");
  return Object.freeze([...new Set(value.map((entry, index) => boundedText(entry, `warnings[${index}]`, { required: true, maximum: 500 })))]);
}

function stableDigest(value) {
  const text = canonicalStringify(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function inventoryAdjustmentSemanticDigest(value = {}) {
  return `inventory-adjustment-semantics:${stableDigest({
    id: value.id,
    adjustmentType: value.adjustmentType,
    correctionCategory: value.correctionCategory,
    eventKind: value.eventKind,
    adjustmentSequence: value.adjustmentSequence,
    idempotencyKey: value.idempotencyKey,
    proposalDigest: value.proposalDigest,
    candidateId: value.candidateId,
    applicationId: value.applicationId,
    inventoryCreationEventId: value.inventoryCreationEventId,
    purchaseId: value.purchaseId,
    receivingEventReferences: value.receivingEventReferences,
    productReference: value.productReference,
    resultingProductReference: value.resultingProductReference,
    inventoryLotId: value.inventoryLotId,
    inventoryItemId: value.inventoryItemId,
    quantity: value.quantity,
    quantityEffect: value.quantityEffect,
    quantityReason: value.quantityReason ?? null,
    currency: value.currency,
    totalCostMinorUnits: value.totalCostMinorUnits,
    costEffectMinorUnits: value.costEffectMinorUnits,
    unitCostsMinorUnits: value.unitCostsMinorUnits,
    previousInventoryVersion: value.previousInventoryVersion,
    resultingInventoryVersion: value.resultingInventoryVersion,
    previousLotVersion: value.previousLotVersion,
    resultingLotVersion: value.resultingLotVersion,
    previousState: value.previousState,
    resultingState: value.resultingState,
    reversesAdjustmentId: value.reversesAdjustmentId ?? null,
    occurredAt: value.occurredAt,
    reason: value.reason,
  })}`;
}

export function inventoryCorrectionProposalSemanticDigest(normalizedProposal) {
  return `inventory-correction-proposal:${stableDigest(normalizedProposal)}`;
}

function expectedQuantityCorrectionProposalDigest(value) {
  return inventoryCorrectionProposalSemanticDigest({
    category: INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION,
    idempotencyKey: value.idempotencyKey,
    reason: value.reason,
    quantity: value.quantity,
    quantityReason: value.quantityReason,
    targetProductReference: null,
    targetProductTitle: null,
    targetCondition: null,
    targetDisposition: null,
    targetTotalCostMinorUnits: null,
    reversesAdjustmentId: null,
    extraCostTreatment: null,
  });
}

export function inventoryCreationIdentityIds(candidateId) {
  const match = /^inventory-candidate:([a-f0-9]{16})$/i.exec(String(candidateId || ""));
  const suffix = match?.[1];
  if (!suffix) throw new InventoryCreationValidationError("INVALID_CANDIDATE_ID", "Inventory candidate identity is invalid.");
  const normalized = suffix.toLowerCase();
  return Object.freeze({
    applicationId: `inventory-application:${normalized}`,
    inventoryItemId: `inventory-item:${normalized}`,
    inventoryLotId: `inventory-lot:${normalized}`,
    eventId: `inventory-creation-event:${normalized}`,
  });
}

export function normalizeInventoryAdjustmentIdempotencyKey(value) {
  return boundedText(value, "idempotencyKey", { required: true, maximum: 500 });
}

export function inventoryAdjustmentIdentityId({ candidateId, applicationId, idempotencyKey }) {
  const suffix = inventoryCreationIdentityIds(candidateId).applicationId.split(":").at(-1);
  const normalizedApplicationId = boundedText(applicationId, "applicationId", { required: true });
  const normalizedIdempotencyKey = normalizeInventoryAdjustmentIdempotencyKey(idempotencyKey);
  return `inventory-adjustment:${suffix}:${stableDigest({ applicationId: normalizedApplicationId, idempotencyKey: normalizedIdempotencyKey })}`;
}

function inventoryRevision(state = {}) {
  const collections = ["inventory", "inventoryLots", "inventoryCreationApplications", "inventoryCreationEvents", "inventoryAdjustments"];
  return stableDigest(Object.fromEntries(collections.map((collection) => [collection, (state[collection] || []).map((entry) => ({
    id: entry.id,
    recordVersion: entry.recordVersion || 1,
    quantity: entry.quantity ?? null,
    status: entry.status ?? null,
  })).sort((left, right) => String(left.id).localeCompare(String(right.id)))])));
}

export function inventoryCandidateId(source) {
  const identity = {
    purchaseId: source.purchaseId,
    lineItemId: source.lineItemId,
    receivingEventId: source.receivingEventId,
    receivingEntryIndex: source.receivingEntryIndex,
  };
  if (source.replacementAuthorizationEventId || source.sourceReturnAdjustmentId) {
    identity.replacementAuthorizationEventId = source.replacementAuthorizationEventId || null;
    identity.sourceReturnAdjustmentId = source.sourceReturnAdjustmentId || null;
  }
  return `inventory-candidate:${stableDigest(identity)}`;
}

export function inventoryCandidateVersion(source) {
  return `inventory-candidate-version:${stableDigest(source)}`;
}

export function inventoryCandidateSourceVersion(source) {
  return `inventory-source-version:${stableDigest(source)}`;
}

function normalizeCondition(value) {
  const normalized = String(value || INVENTORY_CREATION_CONDITIONS.UNKNOWN).trim().toUpperCase().replace(/[ -]+/g, "_");
  return Object.values(INVENTORY_CREATION_CONDITIONS).includes(normalized) ? normalized : INVENTORY_CREATION_CONDITIONS.UNKNOWN;
}

function normalizeProductClassification(value) {
  if (value == null || value === "") return null;
  const classification = boundedText(value, "productClassification", { required: true, maximum: 128 });
  if (!Object.values(INVENTORY_CREATION_PRODUCT_CLASSIFICATIONS).includes(classification)) {
    throw new InventoryCreationValidationError("UNSUPPORTED_PRODUCT_CLASSIFICATION", "Inventory product classification requires an explicit supported review.");
  }
  return classification;
}

function reviewFor(candidateId, reviews = {}) {
  const value = reviews?.[candidateId];
  if (value == null) return {};
  assertSafePurchaseReceivingInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InventoryCreationValidationError("INVALID_REVIEW", "Inventory review must be an object.");
  const allowed = new Set(["productReference", "productTitle", "productClassification", "condition", "disposition", "resolutionReason"]);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new InventoryCreationValidationError("UNSUPPORTED_REVIEW_FIELD", `${unknown} cannot change authoritative Receiving evidence.`, { field: unknown });
  return value;
}

function applicationForCandidate(inventoryState, candidateId) {
  return (inventoryState?.inventoryCreationApplications || []).find((entry) => entry.candidateId === candidateId) || null;
}

function applicationIsComplete(inventoryState, application) {
  return Boolean(application
    && (inventoryState.inventory || []).some((entry) => entry.id === application.inventoryItemId)
    && (inventoryState.inventoryLots || []).some((entry) => entry.id === application.inventoryLotId)
    && (inventoryState.inventoryCreationEvents || []).some((entry) => entry.id === application.inventoryCreationEventId));
}

function applicationMatchesCandidateSource(application, candidate) {
  if (!application) return true;
  return canonicalStringify({
    candidateId: application.candidateId,
    purchaseId: application.purchaseId,
    purchaseLineItemId: application.purchaseLineItemId,
    receivingEventReferences: application.receivingEventReferences,
    replacementAuthorizationEventId: application.replacementAuthorizationEventId,
    sourceReturnAdjustmentId: application.sourceReturnAdjustmentId,
    sourceReturnUnitOffset: application.sourceReturnUnitOffset,
    productReference: application.productReference,
    purchaseProductReference: application.purchaseProductReference,
    receivedProductReference: application.receivedProductReference,
    ownerResolutionReason: application.ownerResolutionReason,
    productMatchState: application.productMatchState,
    productClassification: application.productClassification,
    condition: application.condition,
    disposition: application.disposition,
    quantity: application.quantity,
    currency: application.currency,
    totalCostMinorUnits: application.totalCostMinorUnits,
    unitCostsMinorUnits: application.unitCostsMinorUnits,
  }) === canonicalStringify(candidate);
}

function existingInventoryForProduct(inventoryState, productReference) {
  if (!productReference) return [];
  return (inventoryState?.inventory || []).filter((entry) => String(entry.productReference || entry.catalogItemId || "") === productReference);
}

function defaultDisposition(discrepancy) {
  if (discrepancy === RECEIVING_DISCREPANCIES.DAMAGED_ITEM) return INVENTORY_CREATION_DISPOSITIONS.HOLD_FOR_CLAIM;
  if (discrepancy === RECEIVING_DISCREPANCIES.UNEXPECTED_EXTRA_ITEM) return INVENTORY_CREATION_DISPOSITIONS.UNRESOLVED_EXTRA;
  if ([RECEIVING_DISCREPANCIES.WRONG_ITEM, RECEIVING_DISCREPANCIES.SUBSTITUTED_ITEM].includes(discrepancy)) return INVENTORY_CREATION_DISPOSITIONS.EXCLUDE;
  return INVENTORY_CREATION_DISPOSITIONS.ADD_TO_INVENTORY;
}

function assertDamageDispositionPair(condition, disposition, label = "Inventory") {
  const damagedCondition = condition === INVENTORY_CREATION_CONDITIONS.DAMAGED;
  const damagedDisposition = disposition === INVENTORY_CREATION_DISPOSITIONS.ADD_AS_DAMAGED;
  if (damagedCondition !== damagedDisposition) {
    throw new InventoryCreationValidationError(
      "DAMAGED_DISPOSITION_REQUIRED",
      `${label} must pair damaged condition with the reviewed damaged-Inventory disposition.`,
    );
  }
}

export function assertInventoryProductClassificationCondition(productClassification, condition, label = "Inventory") {
  if (!productClassification) {
    throw new InventoryCreationValidationError("PRODUCT_CLASSIFICATION_REVIEW_REQUIRED", `${label} requires an explicit product classification.`);
  }
  if (!INVENTORY_CREATION_ACTIVE_CLASSIFICATIONS.includes(productClassification)) {
    throw new InventoryCreationValidationError("PRODUCT_TYPE_CONDITION_WORKFLOW_REQUIRED", `${label} requires a supported product-type condition workflow.`);
  }
  if (productClassification === INVENTORY_CREATION_PRODUCT_CLASSIFICATIONS.SEALED_PRODUCT
    && ![INVENTORY_CREATION_CONDITIONS.SEALED, INVENTORY_CREATION_CONDITIONS.OPEN_BOX, INVENTORY_CREATION_CONDITIONS.DAMAGED].includes(condition)) {
    throw new InventoryCreationValidationError("PRODUCT_CLASSIFICATION_CONDITION_MISMATCH", `${label} condition is incompatible with sealed-product Inventory.`);
  }
  if (productClassification === INVENTORY_CREATION_PRODUCT_CLASSIFICATIONS.ACCESSORY
    && ![INVENTORY_CREATION_CONDITIONS.NEW, INVENTORY_CREATION_CONDITIONS.OPEN_BOX, INVENTORY_CREATION_CONDITIONS.DAMAGED, INVENTORY_CREATION_CONDITIONS.USED].includes(condition)) {
    throw new InventoryCreationValidationError("PRODUCT_CLASSIFICATION_CONDITION_MISMATCH", `${label} condition is incompatible with accessory Inventory.`);
  }
}

function evaluateEligibility({ purchase, event, line, entry, review, productReference, receivedProductDiffers, matchState, productClassification, condition, disposition, existingInventoryReferences }) {
  const blockers = [];
  const warnings = [];
  if (entry.quantityReceived < 1) blockers.push("NO_OWNER_CONFIRMED_RECEIVED_QUANTITY");
  if ([PURCHASE_LIFECYCLE_STATES.CANCELLED, PURCHASE_LIFECYCLE_STATES.RETURN_INITIATED, PURCHASE_LIFECYCLE_STATES.RETURNED].includes(purchase.status)) {
    blockers.push("PURCHASE_NO_LONGER_ELIGIBLE_FOR_INVENTORY");
  }
  if ([RECEIVING_EVENT_STATES.NOT_RECEIVED, RECEIVING_EVENT_STATES.MISSING, RECEIVING_EVENT_STATES.RETURNED_TO_SENDER, RECEIVING_EVENT_STATES.CANCELLED].includes(event.status)) {
    blockers.push("RECEIVING_EVENT_NOT_IN_POSSESSION");
  }
  if (line.cancellationQuantity > 0) blockers.push("PURCHASE_COST_REVIEW_REQUIRED_AFTER_CANCELLATION");
  if (line.refundedQuantity > 0) warnings.push("REFUND_ACCOUNTING_REMAINS_SEPARATE_FROM_INVENTORY");
  if ([RECEIVING_DISCREPANCIES.CANCELLED_ITEM, RECEIVING_DISCREPANCIES.MISSING_ITEM].includes(entry.discrepancy)) blockers.push("RECEIVING_NOT_ELIGIBLE");
  if (entry.discrepancy === RECEIVING_DISCREPANCIES.UNEXPECTED_EXTRA_ITEM) blockers.push("UNRESOLVED_EXTRA_REQUIRES_SEPARATE_COST_REVIEW");
  if ([RECEIVING_DISCREPANCIES.WRONG_ITEM, RECEIVING_DISCREPANCIES.SUBSTITUTED_ITEM].includes(entry.discrepancy)
    || event.status === RECEIVING_EVENT_STATES.WRONG_ITEM) {
    if (!review.productReference || !review.resolutionReason) blockers.push("ACTUAL_PRODUCT_RESOLUTION_REQUIRED");
    else warnings.push("ACTUAL_PRODUCT_DIFFERS_FROM_PURCHASE_LINE");
  }
  if (receivedProductDiffers) {
    if (!review.productReference || !review.resolutionReason) blockers.push("ACTUAL_PRODUCT_RESOLUTION_REQUIRED");
    else warnings.push("ACTUAL_PRODUCT_DIFFERS_FROM_PURCHASE_LINE");
  }
  if (entry.discrepancy === RECEIVING_DISCREPANCIES.DAMAGED_ITEM
    || event.status === RECEIVING_EVENT_STATES.DAMAGED
    || condition === INVENTORY_CREATION_CONDITIONS.DAMAGED
    || disposition === INVENTORY_CREATION_DISPOSITIONS.ADD_AS_DAMAGED) {
    if (disposition !== INVENTORY_CREATION_DISPOSITIONS.ADD_AS_DAMAGED || condition !== INVENTORY_CREATION_CONDITIONS.DAMAGED) blockers.push("DAMAGED_DISPOSITION_REQUIRED");
    else warnings.push("DAMAGED_INVENTORY");
  }
  if ([INVENTORY_CREATION_DISPOSITIONS.HOLD_FOR_RETURN, INVENTORY_CREATION_DISPOSITIONS.HOLD_FOR_CLAIM, INVENTORY_CREATION_DISPOSITIONS.EXCLUDE, INVENTORY_CREATION_DISPOSITIONS.UNRESOLVED_EXTRA].includes(disposition)) blockers.push("DISPOSITION_NOT_INVENTORY");
  if (!productReference || ![INVENTORY_CREATION_MATCH_STATES.MATCHED, INVENTORY_CREATION_MATCH_STATES.OWNER_RESOLVED].includes(matchState)) blockers.push("PRODUCT_RESOLUTION_REQUIRED");
  if ([PRODUCT_MATCH_STATES.AMBIGUOUS, PRODUCT_MATCH_STATES.UNRESOLVED].includes(line.productMatchStatus) && !review.productReference) blockers.push("PRODUCT_RESOLUTION_REQUIRED");
  if (review.productReference && existingInventoryReferences.length === 0) blockers.push("OWNER_RESOLUTION_REQUIRES_EXISTING_PRODUCT");
  if (review.productReference && !review.resolutionReason) blockers.push("OWNER_RESOLUTION_REASON_REQUIRED");
  if (condition === INVENTORY_CREATION_CONDITIONS.UNKNOWN) blockers.push("CONDITION_REVIEW_REQUIRED");
  try {
    assertInventoryProductClassificationCondition(productClassification, condition, "Inventory Creation Candidate");
  } catch (error) {
    blockers.push(error.code || "PRODUCT_CLASSIFICATION_CONDITION_MISMATCH");
  }
  if (entry.discrepancy === RECEIVING_DISCREPANCIES.WRONG_QUANTITY) warnings.push("WRONG_QUANTITY_REVIEWED_FROM_RECEIVING");
  return Object.freeze({ blockers: Object.freeze([...new Set(blockers)]), warnings: Object.freeze([...new Set(warnings)]) });
}

/**
 * Derives ephemeral candidates from authoritative Purchase + Receiving state.
 * No candidate is written to either local repository.
 */
export function deriveInventoryCreationCandidates({ purchase, receivingEvents = [], purchaseEvents = [], inventoryState = {}, reviews = {} }) {
  assertSafePurchaseReceivingInput(reviews);
  const canonical = normalizeCanonicalPurchase(purchase, { persisted: true });
  const events = receivingEvents
    .map((event) => normalizeReceivingEvent(event, { persisted: true }))
    .filter((event) => event.purchaseId === canonical.id);
  deriveReceivingProjection(canonical, events, purchaseEvents);
  const replacementAuthorizations = deriveReplacementReceivingAuthorizations(canonical, purchaseEvents);
  const replacementById = new Map(replacementAuthorizations.map((entry) => [entry.id, entry]));
  const replacementOffsets = new Map(replacementAuthorizations.map((entry) => [entry.id, 0]));
  let managed = null;
  let effectiveManagedAdjustmentIds = null;
  const lines = new Map(canonical.lineItems.map((line) => [line.lineItemId, line]));
  const receivedOffsets = new Map(canonical.lineItems.map((line) => [line.lineItemId, 0]));
  const candidates = [];

  for (const event of events) {
    event.entries.forEach((entry, receivingEntryIndex) => {
      const line = lines.get(entry.lineItemId);
      if (!line) throw new InventoryCreationValidationError("UNKNOWN_PURCHASE_LINE", "Receiving evidence references an unknown Purchase line.");
      if (entry.quantityReceived < 1) return;
      const accountableQuantity = line.quantityOrdered - line.cancellationQuantity;
      const replacementAuthorization = event.replacementEventId ? replacementById.get(event.replacementEventId) : null;
      let sourceReturnAdjustment = null;
      let cost;
      if (event.replacementEventId) {
        if (!replacementAuthorization) throw new InventoryCreationValidationError("REPLACEMENT_AUTHORIZATION_REQUIRED", "Replacement Inventory requires a scoped owner-confirmed replacement event.");
        managed ||= validateInventoryCreationStateBundles(inventoryState);
        effectiveManagedAdjustmentIds ||= new Set(deriveEffectiveInventoryAdjustmentIds(managed.adjustments));
        sourceReturnAdjustment = managed.adjustments.find((adjustment) => adjustment.id === replacementAuthorization.relatedEventId);
        const sourceApplication = sourceReturnAdjustment
          ? managed.applications.find((application) => application.id === sourceReturnAdjustment.applicationId)
          : null;
        const physicalReturn = isPhysicalInventoryReturnAdjustment(sourceReturnAdjustment);
        if (!sourceReturnAdjustment || !sourceApplication || !physicalReturn || !effectiveManagedAdjustmentIds.has(sourceReturnAdjustment.id)
          || sourceReturnAdjustment.purchaseId !== canonical.id
          || sourceApplication.purchaseLineItemId !== line.lineItemId
          || sourceReturnAdjustment.quantity !== replacementAuthorization.quantity) {
          throw new InventoryCreationValidationError("REPLACEMENT_RETURN_SOURCE_INVALID", "Replacement Inventory must reuse the exact cost of its owner-confirmed returned Inventory quantity.");
        }
        const replacementOffset = replacementOffsets.get(replacementAuthorization.id) || 0;
        const unitCostsMinorUnits = Object.freeze(sourceReturnAdjustment.unitCostsMinorUnits.slice(replacementOffset, replacementOffset + entry.quantityReceived));
        if (unitCostsMinorUnits.length !== entry.quantityReceived) {
          throw new InventoryCreationValidationError("REPLACEMENT_COST_SLICE_INVALID", "Replacement Receiving exceeds the exact returned Inventory cost slice.");
        }
        cost = Object.freeze({
          totalCostMinorUnits: sumMinorUnits(unitCostsMinorUnits),
          unitCostsMinorUnits,
          unitOffset: replacementOffset,
        });
        replacementOffsets.set(replacementAuthorization.id, replacementOffset + entry.quantityReceived);
      } else {
        const precedingReceivedQuantity = receivedOffsets.get(line.lineItemId) || 0;
        cost = allocateReceivingCostSlice({
          totalMinorUnits: line.allocatedAcquisitionCost.minorUnits,
          accountableQuantity,
          precedingReceivedQuantity,
          receivedQuantity: entry.quantityReceived,
        });
        receivedOffsets.set(line.lineItemId, precedingReceivedQuantity + entry.quantityReceived);
      }
      const source = {
        purchaseId: canonical.id,
        lineItemId: line.lineItemId,
        receivingEventId: event.id,
        receivingEntryIndex,
        replacementAuthorizationEventId: replacementAuthorization?.id || null,
        sourceReturnAdjustmentId: sourceReturnAdjustment?.id || null,
      };
      const candidateId = inventoryCandidateId(source);
      const review = reviewFor(candidateId, reviews);
      const receivedProductReference = boundedText(entry.substituteProductReference, "receivedProductReference");
      const purchaseProductReference = boundedText(line.productReference, "purchaseProductReference");
      const receivedProductDiffers = Boolean(receivedProductReference && receivedProductReference !== purchaseProductReference);
      const productReference = boundedText(review.productReference ?? receivedProductReference ?? purchaseProductReference, "productReference");
      const matchState = review.productReference
        ? INVENTORY_CREATION_MATCH_STATES.OWNER_RESOLVED
        : !receivedProductDiffers && line.productMatchStatus === PRODUCT_MATCH_STATES.MATCHED && productReference
          ? INVENTORY_CREATION_MATCH_STATES.MATCHED
          : line.productMatchStatus === PRODUCT_MATCH_STATES.AMBIGUOUS
            ? INVENTORY_CREATION_MATCH_STATES.AMBIGUOUS
            : INVENTORY_CREATION_MATCH_STATES.UNRESOLVED;
      const condition = normalizeCondition(review.condition ?? entry.condition);
      const disposition = review.disposition
        ? enumValue(review.disposition, INVENTORY_CREATION_DISPOSITIONS, "disposition")
        : defaultDisposition(entry.discrepancy);
      const productTitle = boundedText(review.productTitle ?? line.title, "productTitle", { maximum: INVENTORY_CREATION_LIMITS.maximumLabel });
      const resolutionReason = review.resolutionReason ? sanitizePurchaseReceivingNote(review.resolutionReason) : null;
      const existingInventoryRows = existingInventoryForProduct(inventoryState, productReference);
      const existingInventoryReferences = existingInventoryRows.map((row) => row.id).sort();
      const existingClassifications = [...new Set(existingInventoryRows.map((row) => row.productClassification).filter((value) => Object.values(INVENTORY_CREATION_PRODUCT_CLASSIFICATIONS).includes(value)))];
      const productClassification = normalizeProductClassification(
        review.productClassification
          ?? (existingClassifications.length === 1 ? existingClassifications[0] : null)
          ?? (condition === INVENTORY_CREATION_CONDITIONS.SEALED ? INVENTORY_CREATION_PRODUCT_CLASSIFICATIONS.SEALED_PRODUCT : null),
      );
      const eligibility = evaluateEligibility({ purchase: canonical, event, line, entry, review, productReference, receivedProductDiffers, matchState, productClassification, condition, disposition, existingInventoryReferences });
      const storedApplication = applicationForCandidate(inventoryState, candidateId);
      const application = storedApplication ? normalizeInventoryCreationApplication(storedApplication) : null;
      const applicationComplete = applicationIsComplete(inventoryState, application);
      const sourceVersion = inventoryCandidateSourceVersion({
        ...source,
        purchaseVersion: canonical.recordVersion,
        purchaseStatus: canonical.status,
        receivingEventVersion: event.recordVersion,
        receivingEventStatus: event.status,
        quantity: entry.quantityReceived,
        discrepancy: entry.discrepancy,
        productReference,
        purchaseProductReference,
        receivedProductReference,
        productTitle,
        resolutionReason,
        matchState,
        productClassification,
        condition,
        disposition,
        totalCostMinorUnits: cost.totalCostMinorUnits,
        currency: canonical.currency,
        retailerId: canonical.retailerId,
        vendorName: canonical.vendorName,
        accountReference: canonical.retailerAccountReference,
        receivedAt: event.occurredAt,
        replacementAuthorizationEventId: replacementAuthorization?.id || null,
        sourceReturnAdjustmentId: sourceReturnAdjustment?.id || null,
        sourceReturnUnitOffset: sourceReturnAdjustment ? cost.unitOffset : null,
        existingInventoryReferences,
      });
      const candidateVersion = inventoryCandidateVersion({
        sourceVersion,
        inventoryRevision: inventoryRevision(inventoryState),
        applicationVersion: application?.recordVersion || null,
      });
      const applicationMatchesSource = applicationMatchesCandidateSource(application, {
        candidateId,
        purchaseId: canonical.id,
        purchaseLineItemId: line.lineItemId,
        receivingEventReferences: [event.id],
        replacementAuthorizationEventId: replacementAuthorization?.id || null,
        sourceReturnAdjustmentId: sourceReturnAdjustment?.id || null,
        sourceReturnUnitOffset: sourceReturnAdjustment ? cost.unitOffset : null,
        productReference,
        purchaseProductReference: boundedText(line.productReference, "purchaseProductReference"),
        receivedProductReference: boundedText(entry.substituteProductReference, "receivedProductReference"),
        ownerResolutionReason: resolutionReason,
        productMatchState: matchState,
        productClassification,
        condition,
        disposition,
        quantity: entry.quantityReceived,
        currency: canonical.currency,
        totalCostMinorUnits: cost.totalCostMinorUnits,
        unitCostsMinorUnits: cost.unitCostsMinorUnits,
      });
      const candidateBlockers = Object.freeze([
        ...eligibility.blockers,
        ...(application && !applicationMatchesSource ? ["EXISTING_INVENTORY_PROVENANCE_CONFLICT"] : []),
      ]);
      candidates.push(Object.freeze({
        format: INVENTORY_CREATION_FORMAT,
        recordType: "INVENTORY_CREATION_CANDIDATE",
        authoritative: false,
        persisted: false,
        candidateId,
        expectedVersion: candidateVersion,
        sourceVersion,
        purchaseId: canonical.id,
        purchaseRecordVersion: canonical.recordVersion,
        purchaseLineItemId: line.lineItemId,
        receivingEventReferences: Object.freeze([event.id]),
        receivingEventVersion: event.recordVersion,
        receivingEntryIndex,
        productReference,
        purchaseProductReference: boundedText(line.productReference, "purchaseProductReference"),
        receivedProductReference: boundedText(entry.substituteProductReference, "receivedProductReference"),
        productMatchState: matchState,
        productClassification,
        productTitle,
        retailerId: canonical.retailerId,
        vendorName: canonical.vendorName,
        accountReference: canonical.retailerAccountReference,
        quantityEligible: entry.quantityReceived,
        condition,
        disposition,
        discrepancy: entry.discrepancy,
        receivedAt: event.occurredAt,
        currency: canonical.currency,
        totalAcquisitionCost: Object.freeze({ minorUnits: cost.totalCostMinorUnits, currency: canonical.currency }),
        unitAcquisitionCostsMinorUnits: cost.unitCostsMinorUnits,
        unitOffset: cost.unitOffset,
        replacementAuthorizationEventId: replacementAuthorization?.id || null,
        sourceReturnAdjustmentId: sourceReturnAdjustment?.id || null,
        sourceReturnUnitOffset: sourceReturnAdjustment ? cost.unitOffset : null,
        purchaseCostComponents: Object.freeze({
          lineAcquisitionCostMinorUnits: line.allocatedAcquisitionCost.minorUnits,
          discountAllocationMinorUnits: line.discountAllocation?.minorUnits || 0,
          taxAllocationMinorUnits: line.taxAllocation?.minorUnits || 0,
          shippingAllocationMinorUnits: line.shippingAllocation?.minorUnits || 0,
          feeAllocationMinorUnits: line.feeAllocation?.minorUnits || 0,
        }),
        resolutionReason,
        blockers: candidateBlockers,
        warnings: Object.freeze([
          ...eligibility.warnings,
          ...(replacementAuthorization ? ["REPLACEMENT_COST_REUSED_FROM_RETURNED_INVENTORY"] : []),
        ]),
        eligible: candidateBlockers.length === 0,
        existingInventoryReferences: Object.freeze(existingInventoryReferences),
        application: application ? Object.freeze({ id: application.id, status: applicationComplete && applicationMatchesSource ? application.status : "REPAIR_REQUIRED", inventoryItemId: application.inventoryItemId, inventoryLotId: application.inventoryLotId }) : null,
        alreadyConfirmed: applicationComplete && applicationMatchesSource && application?.status === INVENTORY_CREATION_APPLICATION_STATES.COMPLETED,
        inventoryRecordsCreated: applicationComplete && applicationMatchesSource && application?.status === INVENTORY_CREATION_APPLICATION_STATES.COMPLETED ? 1 : 0,
      }));
    });
  }
  return Object.freeze(candidates);
}

function systemFields(value, recordType) {
  return Object.freeze({
    id: boundedText(value.id, "id", { required: true }),
    format: INVENTORY_CREATION_FORMAT,
    recordType,
    recordVersion: safeInteger(value.recordVersion, "recordVersion", 1, Number.MAX_SAFE_INTEGER),
    createdAt: timestamp(value.createdAt, "createdAt"),
    updatedAt: timestamp(value.updatedAt, "updatedAt"),
  });
}

function rejectUnsupportedManagedFields(value, normalized, label) {
  const supportedFields = new Set(Object.keys(normalized));
  const unsupportedField = Object.keys(value).find((field) => !supportedFields.has(field));
  if (unsupportedField) {
    throw new InventoryCreationValidationError(
      "UNSUPPORTED_MANAGED_FIELD",
      `${label} contains an unsupported field.`,
      { field: unsupportedField },
    );
  }
  return Object.freeze(normalized);
}

export function normalizeInventoryCreationApplication(value) {
  assertSafePurchaseReceivingInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InventoryCreationValidationError("APPLICATION_REQUIRED", "Inventory Creation Application must be an object.");
  if (value.format !== INVENTORY_CREATION_FORMAT || value.recordType !== "INVENTORY_CREATION_APPLICATION" || value.provenanceManaged !== true || value.confirmationMethod !== "VERIFIED_OWNER_SESSION") {
    throw new InventoryCreationValidationError("APPLICATION_AUTHORITY_MISMATCH", "Inventory Creation Application authority metadata is invalid.");
  }
  const quantity = safeInteger(value.quantity, "quantity", 1);
  const unitCostsMinorUnits = Object.freeze((value.unitCostsMinorUnits || []).map((entry, index) => safeMinorUnits(entry, `unitCostsMinorUnits[${index}]`)));
  if (unitCostsMinorUnits.length !== quantity) throw new InventoryCreationValidationError("UNIT_COST_COUNT_MISMATCH", "Unit costs must match Inventory quantity.");
  const totalCostMinorUnits = safeMinorUnits(value.totalCostMinorUnits, "totalCostMinorUnits");
  if (sumMinorUnits(unitCostsMinorUnits) !== totalCostMinorUnits) throw new InventoryCreationValidationError("INVENTORY_COST_MISMATCH", "Inventory unit costs must reconcile exactly.");
  const normalized = {
    ...systemFields(value, "INVENTORY_CREATION_APPLICATION"),
    provenanceManaged: true,
    candidateId: boundedText(value.candidateId, "candidateId", { required: true }),
    expectedCandidateVersion: boundedText(value.expectedCandidateVersion, "expectedCandidateVersion", { required: true }),
    status: enumValue(value.status, INVENTORY_CREATION_APPLICATION_STATES, "status"),
    purchaseId: boundedText(value.purchaseId, "purchaseId", { required: true }),
    purchaseLineItemId: boundedText(value.purchaseLineItemId, "purchaseLineItemId", { required: true }),
    receivingEventReferences: references(value.receivingEventReferences, "receivingEventReferences"),
    replacementAuthorizationEventId: boundedText(value.replacementAuthorizationEventId, "replacementAuthorizationEventId"),
    sourceReturnAdjustmentId: boundedText(value.sourceReturnAdjustmentId, "sourceReturnAdjustmentId"),
    sourceReturnUnitOffset: value.sourceReturnUnitOffset == null ? null : safeInteger(value.sourceReturnUnitOffset, "sourceReturnUnitOffset", 0),
    productReference: boundedText(value.productReference, "productReference", { required: true }),
    purchaseProductReference: boundedText(value.purchaseProductReference, "purchaseProductReference"),
    receivedProductReference: boundedText(value.receivedProductReference, "receivedProductReference"),
    ownerResolutionReason: value.ownerResolutionReason == null ? null : sanitizePurchaseReceivingNote(value.ownerResolutionReason),
    productMatchState: enumValue(value.productMatchState, INVENTORY_CREATION_MATCH_STATES, "productMatchState"),
    productClassification: normalizeProductClassification(value.productClassification),
    condition: enumValue(value.condition, INVENTORY_CREATION_CONDITIONS, "condition"),
    disposition: enumValue(value.disposition, INVENTORY_CREATION_DISPOSITIONS, "disposition"),
    quantity,
    currency: boundedText(value.currency, "currency", { required: true, maximum: 3 }).toUpperCase(),
    totalCostMinorUnits,
    unitCostsMinorUnits,
    inventoryLotId: boundedText(value.inventoryLotId, "inventoryLotId", { required: true }),
    inventoryItemId: boundedText(value.inventoryItemId, "inventoryItemId", { required: true }),
    inventoryCreationEventId: boundedText(value.inventoryCreationEventId, "inventoryCreationEventId", { required: true }),
    completedAt: timestamp(value.completedAt, "completedAt"),
    confirmationMethod: "VERIFIED_OWNER_SESSION",
  };
  if (normalized.productMatchState === INVENTORY_CREATION_MATCH_STATES.OWNER_RESOLVED && !normalized.ownerResolutionReason) {
    throw new InventoryCreationValidationError("OWNER_RESOLUTION_REASON_REQUIRED", "Owner-resolved Inventory must retain a bounded resolution reason.");
  }
  if (Boolean(normalized.replacementAuthorizationEventId) !== Boolean(normalized.sourceReturnAdjustmentId)) {
    throw new InventoryCreationValidationError("REPLACEMENT_PROVENANCE_INCOMPLETE", "Replacement Inventory must retain both its authorization and physical-return source.");
  }
  if (Boolean(normalized.sourceReturnAdjustmentId) !== (normalized.sourceReturnUnitOffset != null)) {
    throw new InventoryCreationValidationError("REPLACEMENT_COST_OFFSET_INCOMPLETE", "Replacement Inventory must retain its exact returned-cost slice offset.");
  }
  if (!normalized.productClassification) throw new InventoryCreationValidationError("PRODUCT_CLASSIFICATION_REQUIRED", "Persisted Inventory must retain its reviewed product classification.");
  assertDamageDispositionPair(normalized.condition, normalized.disposition, "Inventory Creation Application");
  assertInventoryProductClassificationCondition(normalized.productClassification, normalized.condition, "Inventory Creation Application");
  return rejectUnsupportedManagedFields(value, normalized, "Inventory Creation Application");
}

export function normalizeInventoryCreationEvent(value) {
  assertSafePurchaseReceivingInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InventoryCreationValidationError("EVENT_REQUIRED", "Inventory Creation Event must be an object.");
  if (value.format !== INVENTORY_CREATION_FORMAT || value.recordType !== "INVENTORY_CREATION_EVENT" || value.provenanceManaged !== true || value.confirmationMethod !== "VERIFIED_OWNER_SESSION") {
    throw new InventoryCreationValidationError("EVENT_AUTHORITY_MISMATCH", "Inventory Creation Event authority metadata is invalid.");
  }
  const quantity = safeInteger(value.quantity, "quantity", 1);
  const totalCostMinorUnits = safeMinorUnits(value.totalCostMinorUnits, "totalCostMinorUnits");
  const unitCostsMinorUnits = Object.freeze((value.unitCostsMinorUnits || []).map((entry, index) => safeMinorUnits(entry, `unitCostsMinorUnits[${index}]`)));
  if (unitCostsMinorUnits.length !== quantity || sumMinorUnits(unitCostsMinorUnits) !== totalCostMinorUnits) {
    throw new InventoryCreationValidationError("INVENTORY_COST_MISMATCH", "Inventory event unit costs must reconcile exactly.");
  }
  const normalized = {
    ...systemFields(value, "INVENTORY_CREATION_EVENT"),
    provenanceManaged: true,
    eventType: enumValue(value.eventType, INVENTORY_CREATION_EVENT_TYPES, "eventType"),
    idempotencyKey: boundedText(value.idempotencyKey, "idempotencyKey", { required: true }),
    proposalDigest: boundedText(value.proposalDigest, "proposalDigest"),
    applicationId: boundedText(value.applicationId, "applicationId", { required: true }),
    candidateId: boundedText(value.candidateId, "candidateId", { required: true }),
    purchaseId: boundedText(value.purchaseId, "purchaseId", { required: true }),
    purchaseLineItemId: boundedText(value.purchaseLineItemId, "purchaseLineItemId", { required: true }),
    receivingEventReferences: references(value.receivingEventReferences, "receivingEventReferences"),
    replacementAuthorizationEventId: boundedText(value.replacementAuthorizationEventId, "replacementAuthorizationEventId"),
    sourceReturnAdjustmentId: boundedText(value.sourceReturnAdjustmentId, "sourceReturnAdjustmentId"),
    sourceReturnUnitOffset: value.sourceReturnUnitOffset == null ? null : safeInteger(value.sourceReturnUnitOffset, "sourceReturnUnitOffset", 0),
    productReference: boundedText(value.productReference, "productReference", { required: true }),
    purchaseProductReference: boundedText(value.purchaseProductReference, "purchaseProductReference"),
    receivedProductReference: boundedText(value.receivedProductReference, "receivedProductReference"),
    ownerResolutionReason: value.ownerResolutionReason == null ? null : sanitizePurchaseReceivingNote(value.ownerResolutionReason),
    productClassification: normalizeProductClassification(value.productClassification),
    condition: enumValue(value.condition, INVENTORY_CREATION_CONDITIONS, "condition"),
    disposition: enumValue(value.disposition, INVENTORY_CREATION_DISPOSITIONS, "disposition"),
    inventoryLotId: boundedText(value.inventoryLotId, "inventoryLotId", { required: true }),
    inventoryItemId: boundedText(value.inventoryItemId, "inventoryItemId", { required: true }),
    quantity,
    currency: boundedText(value.currency, "currency", { required: true, maximum: 3 }).toUpperCase(),
    totalCostMinorUnits,
    unitCostsMinorUnits,
    occurredAt: timestamp(value.occurredAt, "occurredAt"),
    confirmationMethod: "VERIFIED_OWNER_SESSION",
    reversedEventId: boundedText(value.reversedEventId, "reversedEventId"),
    reason: value.reason == null ? null : sanitizePurchaseReceivingNote(value.reason),
    summary: sanitizePurchaseReceivingNote(value.summary, "Owner-confirmed Inventory activity was recorded."),
    warnings: warnings(value.warnings),
  };
  if (!normalized.productClassification) throw new InventoryCreationValidationError("PRODUCT_CLASSIFICATION_REQUIRED", "Persisted Inventory events must retain their reviewed product classification.");
  if (Boolean(normalized.replacementAuthorizationEventId) !== Boolean(normalized.sourceReturnAdjustmentId)) {
    throw new InventoryCreationValidationError("REPLACEMENT_PROVENANCE_INCOMPLETE", "Replacement Inventory events must retain both their authorization and physical-return source.");
  }
  if (Boolean(normalized.sourceReturnAdjustmentId) !== (normalized.sourceReturnUnitOffset != null)) {
    throw new InventoryCreationValidationError("REPLACEMENT_COST_OFFSET_INCOMPLETE", "Replacement Inventory events must retain their exact returned-cost slice offset.");
  }
  assertDamageDispositionPair(normalized.condition, normalized.disposition, "Inventory Creation Event");
  assertInventoryProductClassificationCondition(normalized.productClassification, normalized.condition, "Inventory Creation Event");
  return rejectUnsupportedManagedFields(value, normalized, "Inventory Creation Event");
}

function signedSafeInteger(value, field) {
  if (!Number.isSafeInteger(value)) throw new InventoryCreationValidationError("INVALID_INTEGER", `${field} must be a safe integer.`, { field });
  return value;
}

function expectedCorrectionEventKind(category) {
  if ([INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER, INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION].includes(category)) {
    return INVENTORY_CORRECTION_EVENT_KINDS.DISPOSITION;
  }
  if ([INVENTORY_CORRECTION_CATEGORIES.CREATION_REVERSAL, INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION].includes(category)) {
    return INVENTORY_CORRECTION_EVENT_KINDS.REVERSAL;
  }
  return INVENTORY_CORRECTION_EVENT_KINDS.CORRECTION;
}

export function isPhysicalInventoryReturnAdjustment(adjustment) {
  return Boolean(adjustment && (
    [INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER, INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN].includes(adjustment.correctionCategory)
    || (adjustment.correctionCategory === INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION
      && adjustment.quantityReason === INVENTORY_QUANTITY_CORRECTION_REASONS.RETURN)
  ));
}

/**
 * Replays the validated append-only reversal chain from newest to oldest. An
 * active reversal suppresses its target; reversing that reversal reactivates
 * the original target. Callers use the resulting IDs only after the canonical
 * Inventory bundle has passed full chain validation.
 */
export function deriveEffectiveInventoryAdjustmentIds(adjustments = []) {
  if (!Array.isArray(adjustments)) throw new InventoryCreationValidationError("INVALID_ADJUSTMENTS", "Inventory adjustments must be an array.");
  const ordered = [...adjustments].sort((left, right) => {
    const leftSequence = left.adjustmentSequence ?? -1;
    const rightSequence = right.adjustmentSequence ?? -1;
    if (leftSequence !== rightSequence) return leftSequence - rightSequence;
    return `${left.occurredAt || ""}\u0000${left.id || ""}`.localeCompare(`${right.occurredAt || ""}\u0000${right.id || ""}`);
  });
  const inactive = new Set();
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const adjustment = ordered[index];
    if (inactive.has(adjustment.id)) continue;
    if (adjustment.correctionCategory === INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION && adjustment.reversesAdjustmentId) {
      inactive.add(adjustment.reversesAdjustmentId);
    }
  }
  return Object.freeze(ordered.filter((adjustment) => !inactive.has(adjustment.id)).map((adjustment) => adjustment.id));
}

function normalizeAdjustmentStateSnapshot(value, field) {
  if (value == null) return null;
  assertSafePurchaseReceivingInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InventoryCreationValidationError("INVALID_ADJUSTMENT_STATE", `${field} must be an object.`);
  const allowed = new Set([
    "productReference", "productTitle", "productClassification", "condition", "disposition", "inventoryDispositionState",
    "quantity", "currency", "acquisitionCostMinorUnits", "unitAcquisitionCostsMinorUnits", "inventoryStatus", "lotStatus",
  ]);
  const unsupported = Object.keys(value).find((key) => !allowed.has(key));
  if (unsupported) throw new InventoryCreationValidationError("UNSUPPORTED_ADJUSTMENT_STATE_FIELD", `${field} contains an unsupported field.`, { field: unsupported });
  const quantity = safeInteger(value.quantity, `${field}.quantity`, 0);
  const acquisitionCostMinorUnits = safeMinorUnits(value.acquisitionCostMinorUnits, `${field}.acquisitionCostMinorUnits`);
  const unitAcquisitionCostsMinorUnits = Object.freeze((value.unitAcquisitionCostsMinorUnits || []).map((entry, index) => safeMinorUnits(entry, `${field}.unitAcquisitionCostsMinorUnits[${index}]`)));
  if (unitAcquisitionCostsMinorUnits.length !== quantity || sumMinorUnits(unitAcquisitionCostsMinorUnits) !== acquisitionCostMinorUnits) {
    throw new InventoryCreationValidationError("ADJUSTMENT_STATE_COST_MISMATCH", `${field} exact costs do not reconcile.`);
  }
  const normalized = {
    productReference: boundedText(value.productReference, `${field}.productReference`, { required: true }),
    productTitle: boundedText(value.productTitle, `${field}.productTitle`, { maximum: INVENTORY_CREATION_LIMITS.maximumLabel }),
    productClassification: normalizeProductClassification(value.productClassification),
    condition: enumValue(value.condition, INVENTORY_CREATION_CONDITIONS, `${field}.condition`),
    disposition: enumValue(value.disposition, INVENTORY_CREATION_DISPOSITIONS, `${field}.disposition`),
    inventoryDispositionState: enumValue(value.inventoryDispositionState || INVENTORY_CORRECTION_DISPOSITIONS.AVAILABLE, INVENTORY_CORRECTION_DISPOSITIONS, `${field}.inventoryDispositionState`),
    quantity,
    currency: boundedText(value.currency, `${field}.currency`, { required: true, maximum: 3 }).toUpperCase(),
    acquisitionCostMinorUnits,
    unitAcquisitionCostsMinorUnits,
    inventoryStatus: boundedText(value.inventoryStatus, `${field}.inventoryStatus`, { required: true, maximum: 128 }),
    lotStatus: boundedText(value.lotStatus, `${field}.lotStatus`, { required: true, maximum: 128 }),
  };
  if (!normalized.productClassification) throw new InventoryCreationValidationError("PRODUCT_CLASSIFICATION_REQUIRED", `${field} must retain product classification.`);
  assertDamageDispositionPair(normalized.condition, normalized.disposition, field);
  assertInventoryProductClassificationCondition(normalized.productClassification, normalized.condition, field);
  return Object.freeze(normalized);
}

export function normalizeInventoryAdjustment(value) {
  assertSafePurchaseReceivingInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InventoryCreationValidationError("ADJUSTMENT_REQUIRED", "Inventory Adjustment must be an object.");
  if (value.format !== INVENTORY_CREATION_FORMAT || value.recordType !== "INVENTORY_ADJUSTMENT" || value.provenanceManaged !== true || value.confirmationMethod !== "VERIFIED_OWNER_SESSION") {
    throw new InventoryCreationValidationError("ADJUSTMENT_AUTHORITY_MISMATCH", "Inventory Adjustment authority metadata is invalid.");
  }
  const adjustmentType = enumValue(value.adjustmentType, INVENTORY_ADJUSTMENT_TYPES, "adjustmentType");
  const quantity = safeInteger(value.quantity ?? 0, "quantity", adjustmentType === INVENTORY_ADJUSTMENT_TYPES.CREATION_REVERSAL ? 1 : 0);
  const totalCostMinorUnits = safeMinorUnits(value.totalCostMinorUnits, "totalCostMinorUnits");
  const unitCostsMinorUnits = Object.freeze((value.unitCostsMinorUnits || []).map((entry, index) => safeMinorUnits(entry, `unitCostsMinorUnits[${index}]`)));
  if (adjustmentType === INVENTORY_ADJUSTMENT_TYPES.CREATION_REVERSAL
    && (unitCostsMinorUnits.length !== quantity || sumMinorUnits(unitCostsMinorUnits) !== totalCostMinorUnits)) {
    throw new InventoryCreationValidationError("INVENTORY_COST_MISMATCH", "Inventory Adjustment unit costs must reconcile exactly.");
  }
  const previousState = normalizeAdjustmentStateSnapshot(value.previousState, "previousState");
  const resultingState = normalizeAdjustmentStateSnapshot(value.resultingState, "resultingState");
  const isTypedCorrection = adjustmentType !== INVENTORY_ADJUSTMENT_TYPES.CREATION_REVERSAL || previousState || resultingState;
  if (Boolean(previousState) !== Boolean(resultingState)) throw new InventoryCreationValidationError("ADJUSTMENT_STATE_PAIR_REQUIRED", "Inventory correction must retain both previous and resulting state.");
  if (isTypedCorrection && (!previousState || !resultingState)) throw new InventoryCreationValidationError("ADJUSTMENT_STATE_REQUIRED", "Typed Inventory correction must retain bounded before/after state.");
  const quantityEffect = value.quantityEffect == null ? -quantity : signedSafeInteger(value.quantityEffect, "quantityEffect");
  const costEffectMinorUnits = value.costEffectMinorUnits == null ? -totalCostMinorUnits : signedSafeInteger(value.costEffectMinorUnits, "costEffectMinorUnits");
  if (previousState && (resultingState.quantity - previousState.quantity !== quantityEffect
    || resultingState.acquisitionCostMinorUnits - previousState.acquisitionCostMinorUnits !== costEffectMinorUnits)) {
    throw new InventoryCreationValidationError("ADJUSTMENT_EFFECT_MISMATCH", "Inventory correction effects must match its before/after state.");
  }
  if (isTypedCorrection && (quantity !== Math.abs(quantityEffect) || totalCostMinorUnits !== Math.abs(costEffectMinorUnits))) {
    throw new InventoryCreationValidationError("ADJUSTMENT_SUMMARY_MISMATCH", "Inventory correction summary values must match its signed effects.");
  }
  if (isTypedCorrection && quantity > 0
    && (unitCostsMinorUnits.length !== quantity || sumMinorUnits(unitCostsMinorUnits) !== totalCostMinorUnits)) {
    throw new InventoryCreationValidationError("ADJUSTMENT_UNIT_MISMATCH", "Inventory correction affected-unit costs must reconcile exactly to its quantity and cost effect.");
  }
  if (isTypedCorrection && quantity === 0 && unitCostsMinorUnits.length > 0) {
    throw new InventoryCreationValidationError("ADJUSTMENT_UNIT_MISMATCH", "A zero-quantity Inventory correction cannot retain affected-unit costs.");
  }
  if (isTypedCorrection && previousState) {
    const expectedAffectedUnitCosts = quantityEffect < 0
      ? previousState.unitAcquisitionCostsMinorUnits.slice(resultingState.quantity)
      : quantityEffect > 0
        ? resultingState.unitAcquisitionCostsMinorUnits.slice(previousState.quantity)
        : [];
    if (canonicalStringify(unitCostsMinorUnits) !== canonicalStringify(expectedAffectedUnitCosts)) {
      throw new InventoryCreationValidationError("ADJUSTMENT_UNIT_SLICE_MISMATCH", "Inventory correction affected-unit costs must exactly match the deterministic changed-unit slice.");
    }
  }
  const normalized = {
    ...systemFields(value, "INVENTORY_ADJUSTMENT"),
    provenanceManaged: true,
    adjustmentType,
    correctionCategory: value.correctionCategory == null ? null : enumValue(value.correctionCategory, INVENTORY_CORRECTION_CATEGORIES, "correctionCategory"),
    eventKind: value.eventKind == null ? null : enumValue(value.eventKind, INVENTORY_CORRECTION_EVENT_KINDS, "eventKind"),
    adjustmentSequence: value.adjustmentSequence == null ? null : safeInteger(value.adjustmentSequence, "adjustmentSequence", 1, Number.MAX_SAFE_INTEGER),
    idempotencyKey: boundedText(value.idempotencyKey, "idempotencyKey", { required: true }),
    proposalDigest: boundedText(value.proposalDigest, "proposalDigest"),
    semanticDigest: boundedText(value.semanticDigest, "semanticDigest"),
    candidateId: boundedText(value.candidateId, "candidateId"),
    applicationId: boundedText(value.applicationId, "applicationId", { required: true }),
    inventoryCreationEventId: boundedText(value.inventoryCreationEventId, "inventoryCreationEventId", { required: true }),
    purchaseId: boundedText(value.purchaseId, "purchaseId", { required: true }),
    receivingEventReferences: references(value.receivingEventReferences, "receivingEventReferences"),
    productReference: boundedText(value.productReference, "productReference", { required: true }),
    resultingProductReference: boundedText(value.resultingProductReference, "resultingProductReference"),
    inventoryLotId: boundedText(value.inventoryLotId, "inventoryLotId", { required: true }),
    inventoryItemId: boundedText(value.inventoryItemId, "inventoryItemId", { required: true }),
    quantity,
    quantityEffect,
    quantityReason: value.quantityReason == null ? null : enumValue(value.quantityReason, INVENTORY_QUANTITY_CORRECTION_REASONS, "quantityReason"),
    currency: boundedText(value.currency, "currency", { required: true, maximum: 3 }).toUpperCase(),
    totalCostMinorUnits,
    costEffectMinorUnits,
    unitCostsMinorUnits,
    previousInventoryVersion: value.previousInventoryVersion == null ? null : safeInteger(value.previousInventoryVersion, "previousInventoryVersion", 1, Number.MAX_SAFE_INTEGER),
    resultingInventoryVersion: value.resultingInventoryVersion == null ? null : safeInteger(value.resultingInventoryVersion, "resultingInventoryVersion", 2, Number.MAX_SAFE_INTEGER),
    previousLotVersion: value.previousLotVersion == null ? null : safeInteger(value.previousLotVersion, "previousLotVersion", 1, Number.MAX_SAFE_INTEGER),
    resultingLotVersion: value.resultingLotVersion == null ? null : safeInteger(value.resultingLotVersion, "resultingLotVersion", 2, Number.MAX_SAFE_INTEGER),
    previousState,
    resultingState,
    reversesAdjustmentId: boundedText(value.reversesAdjustmentId, "reversesAdjustmentId"),
    occurredAt: timestamp(value.occurredAt, "occurredAt"),
    reason: sanitizePurchaseReceivingNote(value.reason, "Owner-confirmed Inventory reversal."),
    confirmationMethod: "VERIFIED_OWNER_SESSION",
  };
  if (isTypedCorrection) {
    if (normalized.correctionCategory !== normalized.adjustmentType || !normalized.eventKind || !normalized.candidateId || !normalized.proposalDigest || !normalized.semanticDigest || !normalized.adjustmentSequence) {
      throw new InventoryCreationValidationError("CORRECTION_METADATA_REQUIRED", "Typed Inventory correction metadata is incomplete.");
    }
    if (normalized.previousInventoryVersion + 1 !== normalized.resultingInventoryVersion
      || normalized.previousLotVersion + 1 !== normalized.resultingLotVersion) {
      throw new InventoryCreationValidationError("CORRECTION_VERSION_INVALID", "Inventory correction must advance item and lot versions exactly once.");
    }
    if (normalized.productReference !== previousState.productReference
      || normalized.resultingProductReference !== resultingState.productReference) {
      throw new InventoryCreationValidationError("CORRECTION_PRODUCT_MISMATCH", "Inventory correction product references must match its state transition.");
    }
    if (normalized.eventKind !== expectedCorrectionEventKind(normalized.correctionCategory)) {
      throw new InventoryCreationValidationError("CORRECTION_EVENT_KIND_MISMATCH", "Inventory correction event kind must match its bounded correction category.");
    }
    if (normalized.correctionCategory === INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION && !normalized.quantityReason) {
      throw new InventoryCreationValidationError("QUANTITY_REASON_REQUIRED", "Quantity correction must retain its bounded reason category.");
    }
    if (normalized.correctionCategory === INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION
      && normalized.proposalDigest !== expectedQuantityCorrectionProposalDigest(normalized)) {
      throw new InventoryCreationValidationError("CORRECTION_PROPOSAL_DIGEST_MISMATCH", "Inventory quantity-correction reason no longer matches its original confirmed proposal.");
    }
    if (normalized.correctionCategory !== INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION && normalized.quantityReason) {
      throw new InventoryCreationValidationError("QUANTITY_REASON_NOT_ALLOWED", "Only quantity correction may retain a quantity reason.");
    }
    if (normalized.correctionCategory === INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION && !normalized.reversesAdjustmentId) {
      throw new InventoryCreationValidationError("REVERSAL_TARGET_REQUIRED", "Inventory correction reversal must retain its target event.");
    }
    if (normalized.correctionCategory !== INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION && normalized.reversesAdjustmentId) {
      throw new InventoryCreationValidationError("REVERSAL_TARGET_NOT_ALLOWED", "Only Inventory correction reversal may reference another correction.");
    }
    if (normalized.correctionCategory !== INVENTORY_CORRECTION_CATEGORIES.CREATION_REVERSAL) {
      const expectedCandidateId = `inventory-correction-candidate:${stableDigest({
        inventoryItemId: normalized.inventoryItemId,
        category: normalized.correctionCategory,
        idempotencyKey: normalized.idempotencyKey,
      })}`;
      if (normalized.candidateId !== expectedCandidateId) {
        throw new InventoryCreationValidationError("CORRECTION_CANDIDATE_ID_MISMATCH", "Inventory correction candidate identity must be deterministic from its item, category, and idempotency key.");
      }
    }
    if (normalized.semanticDigest !== inventoryAdjustmentSemanticDigest(normalized)) {
      throw new InventoryCreationValidationError("CORRECTION_SEMANTIC_DIGEST_MISMATCH", "Inventory correction semantic metadata no longer matches its confirmed append-only event.");
    }
  }
  return rejectUnsupportedManagedFields(value, normalized, "Inventory Adjustment");
}

function normalizeManagedAcquisitionRecord(value, recordType) {
  assertSafePurchaseReceivingInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value) || value.provenanceManaged !== true || value.format !== INVENTORY_CREATION_FORMAT) {
    throw new InventoryCreationValidationError("MANAGED_INVENTORY_REQUIRED", `${recordType} must be a provenance-managed object.`);
  }
  const originalQuantity = safeInteger(value.originalQuantity, "originalQuantity", 1);
  const quantity = safeInteger(value.quantity, "quantity", 0, INVENTORY_CREATION_LIMITS.maximumQuantity);
  const originalUnitAcquisitionCostsMinorUnits = Object.freeze((value.originalUnitAcquisitionCostsMinorUnits || []).map((entry, index) => safeMinorUnits(entry, `originalUnitAcquisitionCostsMinorUnits[${index}]`)));
  const unitAcquisitionCostsMinorUnits = Object.freeze((value.unitAcquisitionCostsMinorUnits || []).map((entry, index) => safeMinorUnits(entry, `unitAcquisitionCostsMinorUnits[${index}]`)));
  const originalAcquisitionCostMinorUnits = safeMinorUnits(value.originalAcquisitionCostMinorUnits, "originalAcquisitionCostMinorUnits");
  const acquisitionCostMinorUnits = safeMinorUnits(value.acquisitionCostMinorUnits, "acquisitionCostMinorUnits");
  if (originalUnitAcquisitionCostsMinorUnits.length !== originalQuantity || sumMinorUnits(originalUnitAcquisitionCostsMinorUnits) !== originalAcquisitionCostMinorUnits) {
    throw new InventoryCreationValidationError("INVENTORY_ORIGINAL_COST_MISMATCH", "Original Inventory unit costs must reconcile exactly.");
  }
  if (unitAcquisitionCostsMinorUnits.length !== quantity || sumMinorUnits(unitAcquisitionCostsMinorUnits) !== acquisitionCostMinorUnits) {
    throw new InventoryCreationValidationError("INVENTORY_CURRENT_COST_MISMATCH", "Current Inventory unit costs must reconcile exactly.");
  }
  if (value.costAuthority !== "INTEGER_MINOR_UNITS" || value.confirmationMethod !== "VERIFIED_OWNER_SESSION") {
    throw new InventoryCreationValidationError("INVENTORY_AUTHORITY_MISMATCH", "Inventory cost and confirmation authority are invalid.");
  }
  const normalized = {
    ...systemFields(value, recordType),
    provenanceManaged: true,
    sourceIdentityKey: boundedText(value.sourceIdentityKey, "sourceIdentityKey", { required: true }),
    inventoryCreationApplicationId: boundedText(value.inventoryCreationApplicationId, "inventoryCreationApplicationId", { required: true }),
    inventoryCreationEventId: boundedText(value.inventoryCreationEventId, "inventoryCreationEventId", { required: true }),
    purchaseId: boundedText(value.purchaseId, "purchaseId", { required: true }),
    purchaseLineItemId: boundedText(value.purchaseLineItemId, "purchaseLineItemId", { required: true }),
    receivingEventReferences: references(value.receivingEventReferences, "receivingEventReferences"),
    replacementAuthorizationEventId: boundedText(value.replacementAuthorizationEventId, "replacementAuthorizationEventId"),
    sourceReturnAdjustmentId: boundedText(value.sourceReturnAdjustmentId, "sourceReturnAdjustmentId"),
    sourceReturnUnitOffset: value.sourceReturnUnitOffset == null ? null : safeInteger(value.sourceReturnUnitOffset, "sourceReturnUnitOffset", 0),
    inventoryItemId: boundedText(value.inventoryItemId, "inventoryItemId", { required: recordType === "INVENTORY_ACQUISITION_LOT" }),
    inventoryLotId: boundedText(value.inventoryLotId, "inventoryLotId", { required: recordType === "OWNED_INVENTORY_ITEM" }),
    productReference: boundedText(value.productReference, "productReference", { required: true }),
    purchaseProductReference: boundedText(value.purchaseProductReference, "purchaseProductReference"),
    receivedProductReference: boundedText(value.receivedProductReference, "receivedProductReference"),
    ownerResolutionReason: value.ownerResolutionReason == null ? null : sanitizePurchaseReceivingNote(value.ownerResolutionReason),
    productTitle: boundedText(value.productTitle ?? value.name, "productTitle", { maximum: INVENTORY_CREATION_LIMITS.maximumLabel }),
    name: boundedText(value.name ?? value.productTitle, "name", { maximum: INVENTORY_CREATION_LIMITS.maximumLabel }),
    retailerId: boundedText(value.retailerId, "retailerId"),
    vendorName: boundedText(value.vendorName, "vendorName", { maximum: INVENTORY_CREATION_LIMITS.maximumLabel }),
    receivedAt: value.receivedAt == null ? null : timestamp(value.receivedAt, "receivedAt"),
    productClassification: normalizeProductClassification(value.productClassification),
    ownedItemPurpose: boundedText(value.ownedItemPurpose, "ownedItemPurpose", { maximum: 128 }),
    condition: enumValue(value.condition, INVENTORY_CREATION_CONDITIONS, "condition"),
    disposition: enumValue(value.disposition, INVENTORY_CREATION_DISPOSITIONS, "disposition"),
    inventoryDispositionState: enumValue(
      value.inventoryDispositionState || (quantity === 0 ? INVENTORY_CORRECTION_DISPOSITIONS.DISPOSED : INVENTORY_CORRECTION_DISPOSITIONS.AVAILABLE),
      INVENTORY_CORRECTION_DISPOSITIONS,
      "inventoryDispositionState",
    ),
    purchaseSource: boundedText(value.purchaseSource, "purchaseSource", { maximum: INVENTORY_CREATION_LIMITS.maximumLabel }),
    purchaseDate: boundedText(value.purchaseDate, "purchaseDate", { maximum: 10 }),
    originalQuantity,
    quantity,
    currency: boundedText(value.currency, "currency", { required: true, maximum: 3 }).toUpperCase(),
    originalAcquisitionCostMinorUnits,
    acquisitionCostMinorUnits,
    originalUnitAcquisitionCostsMinorUnits,
    unitAcquisitionCostsMinorUnits,
    costAuthority: "INTEGER_MINOR_UNITS",
    status: boundedText(value.status, "status", { required: true, maximum: 128 }),
    confirmationMethod: "VERIFIED_OWNER_SESSION",
  };
  if (!normalized.productClassification) throw new InventoryCreationValidationError("PRODUCT_CLASSIFICATION_REQUIRED", "Managed Inventory must retain its reviewed product classification.");
  if (Boolean(normalized.replacementAuthorizationEventId) !== Boolean(normalized.sourceReturnAdjustmentId)) {
    throw new InventoryCreationValidationError("REPLACEMENT_PROVENANCE_INCOMPLETE", "Replacement Inventory records must retain both their authorization and physical-return source.");
  }
  if (Boolean(normalized.sourceReturnAdjustmentId) !== (normalized.sourceReturnUnitOffset != null)) {
    throw new InventoryCreationValidationError("REPLACEMENT_COST_OFFSET_INCOMPLETE", "Replacement Inventory records must retain their exact returned-cost slice offset.");
  }
  assertDamageDispositionPair(normalized.condition, normalized.disposition, recordType);
  assertInventoryProductClassificationCondition(normalized.productClassification, normalized.condition, recordType);
  return rejectUnsupportedManagedFields(value, normalized, recordType);
}

export function normalizeInventoryAcquisitionLot(value) {
  if (value?.recordType !== "INVENTORY_ACQUISITION_LOT") throw new InventoryCreationValidationError("INVENTORY_LOT_TYPE_MISMATCH", "Inventory acquisition lot type is invalid.");
  return normalizeManagedAcquisitionRecord(value, "INVENTORY_ACQUISITION_LOT");
}

export function normalizeProvenanceManagedInventoryItem(value) {
  if (value?.recordType !== "OWNED_INVENTORY_ITEM") throw new InventoryCreationValidationError("INVENTORY_ITEM_TYPE_MISMATCH", "Owner-confirmed Inventory item type is invalid.");
  return normalizeManagedAcquisitionRecord(value, "OWNED_INVENTORY_ITEM");
}

function assertSame(label, values) {
  const normalized = values.map((value) => canonicalStringify(value ?? null));
  if (normalized.some((value) => value !== normalized[0])) throw new InventoryCreationValidationError("INVENTORY_BUNDLE_MISMATCH", `${label} does not reconcile across Inventory provenance records.`);
}

/** Validates local managed Inventory records and their exact-cost/provenance relationships. */
export function validateInventoryCreationStateBundles(state = {}, options = {}) {
  assertSafePurchaseReceivingInput({
    inventoryLots: state.inventoryLots || [],
    inventoryCreationApplications: state.inventoryCreationApplications || [],
    inventoryCreationEvents: state.inventoryCreationEvents || [],
    inventoryAdjustments: state.inventoryAdjustments || [],
    managedInventory: (state.inventory || []).filter((entry) => entry?.provenanceManaged === true),
  });
  const allowIncomplete = options.allowIncomplete === true;
  const applications = (state.inventoryCreationApplications || []).map(normalizeInventoryCreationApplication);
  const events = (state.inventoryCreationEvents || []).map(normalizeInventoryCreationEvent);
  const lots = (state.inventoryLots || []).map(normalizeInventoryAcquisitionLot);
  const items = (state.inventory || []).filter((entry) => entry?.provenanceManaged === true).map(normalizeProvenanceManagedInventoryItem);
  const adjustments = (state.inventoryAdjustments || []).map(normalizeInventoryAdjustment);
  for (const collection of [applications, events, lots, items, adjustments]) {
    const ids = collection.map((entry) => entry.id);
    if (new Set(ids).size !== ids.length) throw new InventoryCreationValidationError("DUPLICATE_MANAGED_ID", "Managed Inventory IDs must be unique within each collection.");
  }
  if (new Set(adjustments.map((entry) => entry.idempotencyKey)).size !== adjustments.length) {
    throw new InventoryCreationValidationError("DUPLICATE_ADJUSTMENT_IDEMPOTENCY", "Inventory adjustment idempotency keys must be unique.");
  }
  if (new Set(applications.map((entry) => entry.candidateId)).size !== applications.length
    || new Set(events.map((entry) => entry.candidateId)).size !== events.length
    || new Set(lots.map((entry) => entry.sourceIdentityKey)).size !== lots.length
    || new Set(items.map((entry) => entry.sourceIdentityKey)).size !== items.length) {
    throw new InventoryCreationValidationError("DUPLICATE_INVENTORY_SOURCE", "Each Inventory source identity may have only one managed record per collection.");
  }
  if (new Set(events.map((entry) => entry.idempotencyKey)).size !== events.length) {
    throw new InventoryCreationValidationError("DUPLICATE_CREATION_IDEMPOTENCY", "Inventory creation event idempotency keys must be unique.");
  }
  const byId = (entries) => new Map(entries.map((entry) => [entry.id, entry]));
  const appById = byId(applications);
  const eventById = byId(events);
  const lotById = byId(lots);
  const itemById = byId(items);
  const sourceKeys = new Set([...applications.map((entry) => entry.candidateId), ...events.map((entry) => entry.candidateId), ...lots.map((entry) => entry.sourceIdentityKey), ...items.map((entry) => entry.sourceIdentityKey)]);
  for (const candidateId of sourceKeys) {
    const ids = inventoryCreationIdentityIds(candidateId);
    const app = appById.get(ids.applicationId);
    const event = eventById.get(ids.eventId);
    const lot = lotById.get(ids.inventoryLotId);
    const item = itemById.get(ids.inventoryItemId);
    if (!allowIncomplete && (!app || !event || !lot || !item)) throw new InventoryCreationValidationError("INCOMPLETE_INVENTORY_BUNDLE", "Inventory creation provenance is incomplete.");
    if (app) {
      if (app.status !== INVENTORY_CREATION_APPLICATION_STATES.COMPLETED) {
        throw new InventoryCreationValidationError("INVENTORY_APPLICATION_INCOMPLETE", "Persisted Inventory creation applications must be completed.");
      }
      if (![INVENTORY_CREATION_MATCH_STATES.MATCHED, INVENTORY_CREATION_MATCH_STATES.OWNER_RESOLVED].includes(app.productMatchState)) {
        throw new InventoryCreationValidationError("INVENTORY_PRODUCT_UNRESOLVED", "Persisted Inventory must retain a reviewed product resolution.");
      }
      assertSame("Inventory application identity", [app.id, ids.applicationId]);
      assertSame("Inventory creation identity", [app.inventoryCreationEventId, ids.eventId]);
      assertSame("Inventory lot identity", [app.inventoryLotId, ids.inventoryLotId]);
      assertSame("Inventory item identity", [app.inventoryItemId, ids.inventoryItemId]);
    }
    if (event) {
      if (event.eventType !== INVENTORY_CREATION_EVENT_TYPES.INVENTORY_CREATED) {
        throw new InventoryCreationValidationError("INVENTORY_EVENT_TYPE_MISMATCH", "The source event for an Inventory creation bundle must be INVENTORY_CREATED.");
      }
      assertSame("Inventory creation-event identity", [event.id, ids.eventId]);
      assertSame("Inventory creation-event application relation", [event.applicationId, ids.applicationId]);
      assertSame("Inventory creation-event lot relation", [event.inventoryLotId, ids.inventoryLotId]);
      assertSame("Inventory creation-event item relation", [event.inventoryItemId, ids.inventoryItemId]);
      assertSame("Inventory creation-event idempotency", [event.idempotencyKey, `inventory-create:${candidateId}`]);
    }
    if (lot) {
      const expectedLotStatus = lot.quantity === 0 ? "REVERSED" : lot.quantity === lot.originalQuantity ? "ACTIVE" : lot.quantity < lot.originalQuantity ? "PARTIALLY_REVERSED" : "ADJUSTED";
      if (lot.status !== expectedLotStatus) throw new InventoryCreationValidationError("INVENTORY_LOT_STATUS_MISMATCH", "Inventory lot status must match its current quantity.");
      assertSame("Inventory acquisition-lot identity", [lot.id, ids.inventoryLotId]);
      assertSame("Inventory acquisition-lot application relation", [lot.inventoryCreationApplicationId, ids.applicationId]);
      assertSame("Inventory acquisition-lot event relation", [lot.inventoryCreationEventId, ids.eventId]);
      assertSame("Inventory acquisition-lot item relation", [lot.inventoryItemId, ids.inventoryItemId]);
    }
    if (item) {
      const expectedItemStatus = item.quantity === 0 ? "Disposed" : "In stock";
      if (item.ownedItemPurpose !== "FOR_RESALE" || item.status !== expectedItemStatus) {
        throw new InventoryCreationValidationError("INVENTORY_ITEM_STATUS_MISMATCH", "Managed Inventory purpose and status must match its current quantity.");
      }
      assertSame("Managed Inventory item identity", [item.id, ids.inventoryItemId]);
      assertSame("Managed Inventory application relation", [item.inventoryCreationApplicationId, ids.applicationId]);
      assertSame("Managed Inventory event relation", [item.inventoryCreationEventId, ids.eventId]);
      assertSame("Managed Inventory lot relation", [item.inventoryLotId, ids.inventoryLotId]);
    }
    const present = [app, event, lot, item].filter(Boolean);
    if (present.length > 1) {
      assertSame("Purchase identity", present.map((entry) => entry.purchaseId));
      assertSame("Purchase line identity", present.map((entry) => entry.purchaseLineItemId));
      assertSame("Receiving identity", present.map((entry) => entry.receivingEventReferences));
      assertSame("Replacement authorization identity", present.map((entry) => entry.replacementAuthorizationEventId));
      assertSame("Returned Inventory source identity", present.map((entry) => entry.sourceReturnAdjustmentId));
      assertSame("Returned Inventory unit offset", present.map((entry) => entry.sourceReturnUnitOffset));
      assertSame("Original Purchase product identity", present.map((entry) => entry.purchaseProductReference));
      assertSame("Received product identity", present.map((entry) => entry.receivedProductReference));
      assertSame("Owner product-resolution provenance", present.map((entry) => entry.ownerResolutionReason));
      assertSame("Currency", present.map((entry) => entry.currency));
      assertSame("Original quantity", present.map((entry) => entry.originalQuantity ?? entry.quantity));
      assertSame("Original acquisition cost", present.map((entry) => entry.originalAcquisitionCostMinorUnits ?? entry.totalCostMinorUnits));
      assertSame("Original unit acquisition costs", present.map((entry) => entry.originalUnitAcquisitionCostsMinorUnits ?? entry.unitCostsMinorUnits));
    }
    if (app && event) {
      assertSame("Original product identity", [app.productReference, event.productReference]);
      assertSame("Original product classification", [app.productClassification, event.productClassification]);
      assertSame("Original condition", [app.condition, event.condition]);
      assertSame("Original disposition", [app.disposition, event.disposition]);
    }
    if (lot && item) {
      assertSame("Current Inventory product", [lot.productReference, item.productReference]);
      assertSame("Current Inventory classification", [lot.productClassification, item.productClassification]);
      assertSame("Current Inventory condition", [lot.condition, item.condition]);
      assertSame("Current Inventory disposition", [lot.disposition, item.disposition]);
      assertSame("Current Inventory disposition state", [lot.inventoryDispositionState, item.inventoryDispositionState]);
      assertSame("Current Inventory quantity", [lot.quantity, item.quantity]);
      assertSame("Current Inventory cost", [lot.acquisitionCostMinorUnits, item.acquisitionCostMinorUnits]);
      assertSame("Current unit costs", [lot.unitAcquisitionCostsMinorUnits, item.unitAcquisitionCostsMinorUnits]);
      assertSame("Inventory item relation", [lot.inventoryItemId, item.id]);
      assertSame("Inventory lot relation", [item.inventoryLotId, lot.id]);
      assertSame("Inventory product title", [lot.productTitle, item.productTitle, item.name]);
      assertSame("Inventory retailer", [lot.retailerId, item.retailerId]);
      assertSame("Inventory vendor", [lot.vendorName, item.vendorName]);
      assertSame("Inventory received timestamp", [lot.receivedAt, item.receivedAt]);
      assertSame("Inventory purchase source", [item.purchaseSource, lot.vendorName || lot.retailerId || "Owner-confirmed Purchase"]);
      assertSame("Inventory purchase date", [item.purchaseDate, lot.receivedAt?.slice(0, 10)]);
    }
  }
  for (const adjustment of adjustments) {
    const application = appById.get(adjustment.applicationId);
    if (!application) throw new InventoryCreationValidationError("ADJUSTMENT_APPLICATION_MISSING", "Inventory adjustment application is missing.");
    const event = eventById.get(application.inventoryCreationEventId);
    if (!event) throw new InventoryCreationValidationError("ADJUSTMENT_EVENT_MISSING", "Inventory adjustment creation event is missing.");
    assertSame("Adjustment creation event", [adjustment.inventoryCreationEventId, application.inventoryCreationEventId, event.id]);
    const expectedAdjustmentId = adjustment.previousState && adjustment.adjustmentType !== INVENTORY_ADJUSTMENT_TYPES.CREATION_REVERSAL
      ? `inventory-adjustment:correction:${stableDigest({ applicationId: application.id, candidateId: adjustment.candidateId })}`
      : inventoryAdjustmentIdentityId({ candidateId: application.candidateId, applicationId: application.id, idempotencyKey: adjustment.idempotencyKey });
    assertSame("Adjustment deterministic identity", [adjustment.id, expectedAdjustmentId]);
    assertSame("Adjustment Inventory item", [adjustment.inventoryItemId, application.inventoryItemId]);
    assertSame("Adjustment Inventory lot", [adjustment.inventoryLotId, application.inventoryLotId]);
    assertSame("Adjustment Purchase", [adjustment.purchaseId, application.purchaseId, event.purchaseId]);
    assertSame("Adjustment Receiving provenance", [adjustment.receivingEventReferences, application.receivingEventReferences, event.receivingEventReferences]);
    assertSame("Adjustment product provenance", [adjustment.productReference, adjustment.previousState?.productReference || application.productReference]);
    assertSame("Adjustment currency", [adjustment.currency, application.currency, event.currency]);
    assertSame("Adjustment confirmation authority", [adjustment.confirmationMethod, application.confirmationMethod, event.confirmationMethod]);
  }
  for (const application of applications) {
    const item = itemById.get(application.inventoryItemId);
    const lot = lotById.get(application.inventoryLotId);
    if (!item || !lot) continue;
    const related = adjustments
      .filter((entry) => entry.applicationId === application.id)
      .sort((left, right) => {
        const leftSequence = left.adjustmentSequence ?? -1;
        const rightSequence = right.adjustmentSequence ?? -1;
        if (leftSequence !== rightSequence) return leftSequence - rightSequence;
        return `${left.occurredAt}\u0000${left.id}`.localeCompare(`${right.occurredAt}\u0000${right.id}`);
      });
    const firstTyped = related.find((entry) => entry.previousState);
    let projection = Object.freeze({
      productReference: application.productReference,
      productTitle: firstTyped ? firstTyped.previousState.productTitle : item.productTitle,
      productClassification: application.productClassification,
      condition: application.condition,
      disposition: application.disposition,
      inventoryDispositionState: INVENTORY_CORRECTION_DISPOSITIONS.AVAILABLE,
      quantity: application.quantity,
      currency: application.currency,
      acquisitionCostMinorUnits: application.totalCostMinorUnits,
      unitAcquisitionCostsMinorUnits: application.unitCostsMinorUnits,
      inventoryStatus: "In stock",
      lotStatus: "ACTIVE",
    });
    let itemVersion = 1;
    let lotVersion = 1;
    const reversedTargets = new Set();
    for (const [index, adjustment] of related.entries()) {
      if (!adjustment.previousState) {
        if (adjustment.adjustmentType !== INVENTORY_ADJUSTMENT_TYPES.CREATION_REVERSAL) {
          throw new InventoryCreationValidationError("LEGACY_ADJUSTMENT_UNSUPPORTED", "Legacy Inventory adjustment type is unsupported.");
        }
        if (adjustment.quantity > projection.quantity) throw new InventoryCreationValidationError("INVENTORY_ADJUSTMENT_RECONCILIATION_FAILED", "Inventory reversal exceeds current quantity.");
        const nextQuantity = projection.quantity - adjustment.quantity;
        const removed = projection.unitAcquisitionCostsMinorUnits.slice(nextQuantity);
        if (canonicalStringify(removed) !== canonicalStringify(adjustment.unitCostsMinorUnits)) {
          throw new InventoryCreationValidationError("INVENTORY_ADJUSTMENT_UNIT_MISMATCH", "Inventory reversal unit costs do not match the deterministic trailing slice.");
        }
        projection = Object.freeze({
          ...projection,
          quantity: nextQuantity,
          acquisitionCostMinorUnits: sumMinorUnits(projection.unitAcquisitionCostsMinorUnits.slice(0, nextQuantity)),
          unitAcquisitionCostsMinorUnits: Object.freeze(projection.unitAcquisitionCostsMinorUnits.slice(0, nextQuantity)),
          inventoryDispositionState: nextQuantity === 0 ? INVENTORY_CORRECTION_DISPOSITIONS.DISPOSED : INVENTORY_CORRECTION_DISPOSITIONS.AVAILABLE,
          inventoryStatus: nextQuantity === 0 ? "Disposed" : "In stock",
          lotStatus: nextQuantity === 0 ? "REVERSED" : "PARTIALLY_REVERSED",
        });
        itemVersion += 1;
        lotVersion += 1;
        continue;
      }
      if (adjustment.adjustmentSequence !== index + 1) throw new InventoryCreationValidationError("ADJUSTMENT_SEQUENCE_INVALID", "Inventory correction sequence must be contiguous and repository-assigned.");
      if (canonicalStringify(adjustment.previousState) !== canonicalStringify(projection)) {
        throw new InventoryCreationValidationError("ADJUSTMENT_PREVIOUS_STATE_MISMATCH", "Inventory correction does not begin at the prior canonical state.");
      }
      if (adjustment.previousInventoryVersion !== itemVersion || adjustment.previousLotVersion !== lotVersion
        || adjustment.resultingInventoryVersion !== itemVersion + 1 || adjustment.resultingLotVersion !== lotVersion + 1) {
        throw new InventoryCreationValidationError("ADJUSTMENT_VERSION_CHAIN_INVALID", "Inventory correction version chain is invalid.");
      }
      if ([INVENTORY_CORRECTION_CATEGORIES.REPLACEMENT_RECEIVED, INVENTORY_CORRECTION_CATEGORIES.UNEXPECTED_EXTRA_RESOLUTION].includes(adjustment.correctionCategory)) {
        throw new InventoryCreationValidationError("CORRECTION_CATEGORY_NON_MUTATING", "Replacement and unexpected-extra review cannot mutate an existing acquisition lot.");
      }
      if ([INVENTORY_CORRECTION_CATEGORIES.PRODUCT_RESOLUTION_CORRECTION, INVENTORY_CORRECTION_CATEGORIES.WRONG_ITEM_RESOLUTION, INVENTORY_CORRECTION_CATEGORIES.SUBSTITUTION_RESOLUTION].includes(adjustment.correctionCategory)) {
        assertSame("Product correction quantity", [adjustment.previousState.quantity, adjustment.resultingState.quantity]);
        assertSame("Product correction cost", [adjustment.previousState.unitAcquisitionCostsMinorUnits, adjustment.resultingState.unitAcquisitionCostsMinorUnits]);
      }
      if ([INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION, INVENTORY_CORRECTION_CATEGORIES.DAMAGED_AFTER_RECEIVING].includes(adjustment.correctionCategory)) {
        assertSame("Condition correction product", [adjustment.previousState.productReference, adjustment.resultingState.productReference]);
        assertSame("Condition correction quantity", [adjustment.previousState.quantity, adjustment.resultingState.quantity]);
        assertSame("Condition correction cost", [adjustment.previousState.unitAcquisitionCostsMinorUnits, adjustment.resultingState.unitAcquisitionCostsMinorUnits]);
      }
      if ([INVENTORY_CORRECTION_CATEGORIES.CREATION_REVERSAL, INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER, INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION].includes(adjustment.correctionCategory)) {
        if (adjustment.quantityEffect >= 0
          || canonicalStringify(adjustment.resultingState.unitAcquisitionCostsMinorUnits) !== canonicalStringify(adjustment.previousState.unitAcquisitionCostsMinorUnits.slice(0, adjustment.resultingState.quantity))) {
          throw new InventoryCreationValidationError("DISPOSITION_EFFECT_INVALID", "Inventory disposition must remove an exact trailing unit-cost slice.");
        }
      }
      if (adjustment.correctionCategory === INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION) {
        const expectedDisposition = adjustment.resultingState.quantity === 0
          ? adjustment.quantityReason === INVENTORY_QUANTITY_CORRECTION_REASONS.RETURN
            ? INVENTORY_CORRECTION_DISPOSITIONS.RETURNED
            : adjustment.quantityReason === INVENTORY_QUANTITY_CORRECTION_REASONS.LOSS
              ? INVENTORY_CORRECTION_DISPOSITIONS.LOST
              : INVENTORY_CORRECTION_DISPOSITIONS.DISPOSED
          : adjustment.previousState.inventoryDispositionState;
        if (adjustment.resultingState.inventoryDispositionState !== expectedDisposition) {
          throw new InventoryCreationValidationError("QUANTITY_DISPOSITION_MISMATCH", "Quantity correction disposition must match its structured reason.");
        }
      }
      if (adjustment.correctionCategory === INVENTORY_CORRECTION_CATEGORIES.ACQUISITION_COST_CORRECTION) {
        assertSame("Cost correction product", [adjustment.previousState.productReference, adjustment.resultingState.productReference]);
        assertSame("Cost correction quantity", [adjustment.previousState.quantity, adjustment.resultingState.quantity]);
      }
      if (adjustment.correctionCategory === INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION) {
        const target = related[index - 1];
        if (!target?.previousState || reversedTargets.has(target.id)
          || target.id !== adjustment.reversesAdjustmentId
          || canonicalStringify(adjustment.previousState) !== canonicalStringify(target.resultingState)
          || canonicalStringify(adjustment.resultingState) !== canonicalStringify(target.previousState)) {
          throw new InventoryCreationValidationError("CORRECTION_REVERSAL_INVALID", "Inventory correction reversal must exactly invert the immediately preceding unreversed correction.");
        }
        reversedTargets.add(target.id);
      }
      projection = adjustment.resultingState;
      itemVersion += 1;
      lotVersion += 1;
    }
    const currentProjection = Object.freeze({
      productReference: item.productReference,
      productTitle: item.productTitle,
      productClassification: item.productClassification,
      condition: item.condition,
      disposition: item.disposition,
      inventoryDispositionState: item.inventoryDispositionState,
      quantity: item.quantity,
      currency: item.currency,
      acquisitionCostMinorUnits: item.acquisitionCostMinorUnits,
      unitAcquisitionCostsMinorUnits: item.unitAcquisitionCostsMinorUnits,
      inventoryStatus: item.status,
      lotStatus: lot.status,
    });
    if (canonicalStringify(projection) !== canonicalStringify(currentProjection)
      || item.recordVersion !== itemVersion || lot.recordVersion !== lotVersion) {
      throw new InventoryCreationValidationError("INVENTORY_ADJUSTMENT_RECONCILIATION_FAILED", "Append-only Inventory corrections do not reconcile to current item and lot state.");
    }
  }
  const effectiveAdjustmentIds = new Set(deriveEffectiveInventoryAdjustmentIds(adjustments));
  const replacementTotals = new Map();
  for (const application of applications.filter((entry) => entry.sourceReturnAdjustmentId)) {
    const source = adjustments.find((entry) => entry.id === application.sourceReturnAdjustmentId);
    const sourceApplication = source
      ? applications.find((entry) => entry.id === source.applicationId)
      : null;
    if (!source || !isPhysicalInventoryReturnAdjustment(source) || !effectiveAdjustmentIds.has(source.id)
      || source.purchaseId !== application.purchaseId || !sourceApplication
      || sourceApplication.purchaseLineItemId !== application.purchaseLineItemId
      || source.currency !== application.currency) {
      throw new InventoryCreationValidationError("REPLACEMENT_RETURN_SOURCE_INVALID", "Replacement Inventory must depend on an effective owner-confirmed physical return from the same Purchase.");
    }
    const offset = application.sourceReturnUnitOffset;
    const expectedUnitCosts = source.unitCostsMinorUnits.slice(offset, offset + application.quantity);
    if (expectedUnitCosts.length !== application.quantity
      || canonicalStringify(expectedUnitCosts) !== canonicalStringify(application.unitCostsMinorUnits)) {
      throw new InventoryCreationValidationError("REPLACEMENT_COST_SLICE_INVALID", "Replacement Inventory must retain the exact deterministic returned-cost slice.");
    }
    const totals = replacementTotals.get(source.id) || { quantity: 0, costMinorUnits: 0, unitIndexes: new Set() };
    for (let index = offset; index < offset + application.quantity; index += 1) {
      if (totals.unitIndexes.has(index)) {
        throw new InventoryCreationValidationError("REPLACEMENT_SOURCE_OVERALLOCATED", "Replacement Inventory cannot reuse the same returned Inventory cost unit more than once.");
      }
      totals.unitIndexes.add(index);
    }
    totals.quantity += application.quantity;
    totals.costMinorUnits += application.totalCostMinorUnits;
    replacementTotals.set(source.id, totals);
  }
  for (const [sourceId, totals] of replacementTotals) {
    const source = adjustments.find((entry) => entry.id === sourceId);
    if (totals.quantity > source.quantity || totals.costMinorUnits > sumMinorUnits(source.unitCostsMinorUnits)) {
      throw new InventoryCreationValidationError("REPLACEMENT_SOURCE_OVERALLOCATED", "Replacement Inventory cannot exceed the returned quantity or exact returned acquisition cost.");
    }
    for (let index = 0; index < totals.quantity; index += 1) {
      if (!totals.unitIndexes.has(index)) {
        throw new InventoryCreationValidationError("REPLACEMENT_COST_SLICE_INVALID", "Replacement Inventory cost slices must form the exact deterministic returned-unit prefix without gaps.");
      }
    }
  }
  return Object.freeze({ applications, events, lots, items, adjustments });
}
