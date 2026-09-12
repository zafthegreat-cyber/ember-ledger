import { canonicalStringify } from "../../backup/canonicalJson.js";
import { assertSafePurchaseReceivingInput, sanitizePurchaseReceivingNote } from "../security.js";
import { allocateAcquisitionCostToUnits, sumMinorUnits } from "../inventoryCreation/allocation.js";
import {
  assertInventoryProductClassificationCondition,
  validateInventoryCreationStateBundles,
} from "../inventoryCreation/contracts.js";
import {
  INVENTORY_CORRECTION_CATEGORIES,
  INVENTORY_CORRECTION_EVENT_KINDS,
  INVENTORY_QUANTITY_CORRECTION_REASONS,
} from "../inventoryCorrection/constants.js";
import {
  currentInventoryProjection,
  inventoryCorrectionAdjustmentId,
  inventoryCorrectionCandidateId,
  normalizeCorrectionStateSnapshot,
} from "../inventoryCorrection/contracts.js";
import {
  COST_RECONCILIATION_CATEGORIES,
  INVENTORY_RECONCILIATION_CANDIDATE_FORMAT,
  INVENTORY_RECONCILIATION_CATEGORIES,
  INVENTORY_RECONCILIATION_EVENT_TYPES,
  INVENTORY_RECONCILIATION_FORMAT,
  INVENTORY_RECONCILIATION_LIMITS,
  INVENTORY_RECONCILIATION_STATUSES,
  TRANSFER_RECONCILIATION_CATEGORIES,
} from "./constants.js";

export class InventoryReconciliationValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "InventoryReconciliationValidationError";
    this.code = code;
    this.details = details;
  }
}

function boundedText(value, field, { required = false, maximum = INVENTORY_RECONCILIATION_LIMITS.maximumIdentifier } = {}) {
  if (value == null || value === "") {
    if (required) throw new InventoryReconciliationValidationError("REQUIRED_FIELD", `${field} is required.`, { field });
    return null;
  }
  const text = String(value).trim();
  if (!text || text.length > maximum) throw new InventoryReconciliationValidationError("INVALID_TEXT", `${field} must be a bounded string.`, { field });
  return text;
}

function safeInteger(value, field, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new InventoryReconciliationValidationError("INVALID_INTEGER", `${field} must be a bounded safe integer.`, { field });
  }
  return value;
}

function signedSafeInteger(value, field) {
  if (!Number.isSafeInteger(value)) throw new InventoryReconciliationValidationError("INVALID_INTEGER", `${field} must be a safe integer.`, { field });
  return value;
}

function safeSum(values, field = "values") {
  const total = values.reduce((sum, value, index) => sum + BigInt(signedSafeInteger(value, `${field}[${index}]`)), 0n);
  const result = Number(total);
  if (!Number.isSafeInteger(result)) throw new InventoryReconciliationValidationError("TOTAL_OUT_OF_RANGE", `${field} exceeds safe integer precision.`);
  return result;
}

function timestamp(value, field) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new InventoryReconciliationValidationError("INVALID_TIMESTAMP", `${field} must be a valid timestamp.`, { field });
  return parsed.toISOString();
}

function enumValue(value, values, field) {
  const normalized = String(value || "").trim().toUpperCase().replace(/[ -]+/g, "_");
  if (!Object.values(values).includes(normalized)) throw new InventoryReconciliationValidationError("INVALID_ENUM", `${field} is unsupported.`, { field });
  return normalized;
}

function references(value, field) {
  if (!Array.isArray(value) || !value.length || value.length > 1_000) {
    throw new InventoryReconciliationValidationError("INVALID_REFERENCES", `${field} must be a bounded non-empty array.`, { field });
  }
  return Object.freeze([...new Set(value.map((entry, index) => boundedText(entry, `${field}[${index}]`, { required: true })))]);
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

function countsAgainstInventory(sale = {}) {
  return !["draft", "cancelled"].includes(String(sale.status || "").trim().toLowerCase());
}

function saleOrder(left, right) {
  const leftSequence = Number(left.inventoryAllocationSequence);
  const rightSequence = Number(right.inventoryAllocationSequence);
  if (Number.isSafeInteger(leftSequence) && Number.isSafeInteger(rightSequence) && leftSequence !== rightSequence) return leftSequence - rightSequence;
  return `${left.inventoryAllocationAt || left.createdAt || left.saleDate || ""}\u0000${left.id || ""}`
    .localeCompare(`${right.inventoryAllocationAt || right.createdAt || right.saleDate || ""}\u0000${right.id || ""}`);
}

function exactMajorUnitsToMinorUnits(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [major, fraction = ""] = text.split(".");
  const minor = BigInt(major) * 100n + BigInt(fraction.padEnd(2, "0"));
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

function eventTypeForCategory(category) {
  if (TRANSFER_RECONCILIATION_CATEGORIES.includes(category)) return INVENTORY_RECONCILIATION_EVENT_TYPES.TRANSFER;
  if ([INVENTORY_RECONCILIATION_CATEGORIES.SALE_PRODUCT_RECONCILIATION, INVENTORY_RECONCILIATION_CATEGORIES.SALE_COST_RECONCILIATION].includes(category)) {
    return INVENTORY_RECONCILIATION_EVENT_TYPES.SALE;
  }
  if ([INVENTORY_RECONCILIATION_CATEGORIES.COGS_RECONCILIATION, INVENTORY_RECONCILIATION_CATEGORIES.ACCOUNTING_ADJUSTMENT].includes(category)) {
    return INVENTORY_RECONCILIATION_EVENT_TYPES.ACCOUNTING;
  }
  return INVENTORY_RECONCILIATION_EVENT_TYPES.INVENTORY;
}

function sourceCorrectionCategoryFor(category, proposal, availableQuantity) {
  if (COST_RECONCILIATION_CATEGORIES.includes(category)) return INVENTORY_CORRECTION_CATEGORIES.ACQUISITION_COST_CORRECTION;
  if (category === INVENTORY_RECONCILIATION_CATEGORIES.SALE_PRODUCT_RECONCILIATION) return INVENTORY_CORRECTION_CATEGORIES.PRODUCT_RESOLUTION_CORRECTION;
  if (category === INVENTORY_RECONCILIATION_CATEGORIES.PRIOR_CORRECTION_REVERSAL) return INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION;
  if (category === INVENTORY_RECONCILIATION_CATEGORIES.RETURN_AFTER_SALE_RECONCILIATION) {
    return proposal.quantity === availableQuantity
      ? INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER
      : INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN;
  }
  return null;
}

function stateStatus(quantity) {
  return quantity === 0 ? "Disposed" : "In stock";
}

function lotStatus(quantity, originalQuantity) {
  if (quantity === 0) return "REVERSED";
  if (quantity === originalQuantity) return "ACTIVE";
  return quantity < originalQuantity ? "PARTIALLY_REVERSED" : "ADJUSTED";
}

function sortedManagedSales(state, inventoryItemId) {
  return (state.sales || [])
    .filter((sale) => sale.inventoryItemId === inventoryItemId && countsAgainstInventory(sale))
    .sort(saleOrder);
}

function normalizedSaleAuthority(sale, index) {
  const saleId = boundedText(sale.id, `sales[${index}].id`, { required: true });
  const quantity = safeInteger(Number(sale.quantitySold), `sales[${index}].quantitySold`, 1, INVENTORY_RECONCILIATION_LIMITS.maximumQuantity);
  const sequence = safeInteger(Number(sale.inventoryAllocationSequence), `sales[${index}].inventoryAllocationSequence`, 1, Number.MAX_SAFE_INTEGER);
  const originalCogsMinorUnits = safeInteger(Number(sale.allocatedCostOfGoodsSoldMinorUnits), `sales[${index}].allocatedCostOfGoodsSoldMinorUnits`);
  if (sale.costAuthority !== "INTEGER_MINOR_UNITS" || exactMajorUnitsToMinorUnits(sale.allocatedCostOfGoodsSold) !== originalCogsMinorUnits) {
    throw new InventoryReconciliationValidationError("SALE_COST_AUTHORITY_INVALID", "A managed Sale must retain immutable integer-minor-unit COGS authority.", { saleId });
  }
  return Object.freeze({ saleId, quantity, allocationSequence: sequence, originalCogsMinorUnits });
}

export function inventoryReconciliationProposalDigest(value) {
  return `inventory-reconciliation-proposal:${stableDigest(normalizeInventoryReconciliationProposal(value))}`;
}

export function inventoryReconciliationCandidateId({ inventoryItemId, category, idempotencyKey }) {
  return `inventory-reconciliation-candidate:${stableDigest({ inventoryItemId: String(inventoryItemId), category, idempotencyKey })}`;
}

export function inventoryReconciliationEventId({ applicationId, candidateId }) {
  return `inventory-reconciliation-event:${stableDigest({ applicationId, candidateId })}`;
}

export function inventoryReconciliationVersion(value) {
  return `inventory-reconciliation-version:${stableDigest(value)}`;
}

export function normalizeInventoryReconciliationProposal(value = {}) {
  assertSafePurchaseReceivingInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InventoryReconciliationValidationError("PROPOSAL_REQUIRED", "Inventory reconciliation proposal must be an object.");
  const allowed = new Set([
    "category", "idempotencyKey", "reason", "targetTotalCostMinorUnits", "targetProductReference", "targetProductTitle",
    "quantity", "reversesReconciliationEventId", "reversesAdjustmentId",
  ]);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new InventoryReconciliationValidationError("UNSUPPORTED_PROPOSAL_FIELD", `${unknown} cannot supply reconciliation authority.`, { field: unknown });
  const category = enumValue(value.category, INVENTORY_RECONCILIATION_CATEGORIES, "category");
  const normalized = Object.freeze({
    category,
    idempotencyKey: boundedText(value.idempotencyKey, "idempotencyKey", { required: true }),
    reason: sanitizePurchaseReceivingNote(value.reason, "Owner reviewed a historical Inventory reconciliation."),
    targetTotalCostMinorUnits: value.targetTotalCostMinorUnits == null || value.targetTotalCostMinorUnits === ""
      ? null
      : safeInteger(Number(value.targetTotalCostMinorUnits), "targetTotalCostMinorUnits"),
    targetProductReference: boundedText(value.targetProductReference, "targetProductReference"),
    targetProductTitle: boundedText(value.targetProductTitle, "targetProductTitle"),
    quantity: value.quantity == null || value.quantity === ""
      ? null
      : safeInteger(Number(value.quantity), "quantity", 1, INVENTORY_RECONCILIATION_LIMITS.maximumQuantity),
    reversesReconciliationEventId: boundedText(value.reversesReconciliationEventId, "reversesReconciliationEventId"),
    reversesAdjustmentId: boundedText(value.reversesAdjustmentId, "reversesAdjustmentId"),
  });
  const hasCost = normalized.targetTotalCostMinorUnits != null;
  const hasProduct = Boolean(normalized.targetProductReference || normalized.targetProductTitle);
  const hasQuantity = normalized.quantity != null;
  const hasReversal = Boolean(normalized.reversesReconciliationEventId || normalized.reversesAdjustmentId);
  if (normalized.reversesReconciliationEventId && normalized.reversesAdjustmentId) {
    throw new InventoryReconciliationValidationError("AMBIGUOUS_REVERSAL_TARGET", "Reconciliation reversal must select exactly one append-only source target.");
  }
  if (COST_RECONCILIATION_CATEGORIES.includes(category) && (hasProduct || hasQuantity || hasReversal)) {
    throw new InventoryReconciliationValidationError("UNSUPPORTED_COST_RECONCILIATION_FIELD", "Cost reconciliation accepts only reviewed exact-cost intent.");
  }
  if (category === INVENTORY_RECONCILIATION_CATEGORIES.SALE_PRODUCT_RECONCILIATION && (hasCost || hasQuantity || hasReversal)) {
    throw new InventoryReconciliationValidationError("UNSUPPORTED_PRODUCT_RECONCILIATION_FIELD", "Product reconciliation accepts only an existing reviewed product relationship.");
  }
  if (category === INVENTORY_RECONCILIATION_CATEGORIES.RETURN_AFTER_SALE_RECONCILIATION && (hasCost || hasProduct || hasReversal)) {
    throw new InventoryReconciliationValidationError("UNSUPPORTED_RETURN_RECONCILIATION_FIELD", "Return-after-Sale reconciliation accepts only reviewed physical quantity intent.");
  }
  if (category === INVENTORY_RECONCILIATION_CATEGORIES.PRIOR_CORRECTION_REVERSAL && (hasCost || hasProduct || hasQuantity)) {
    throw new InventoryReconciliationValidationError("UNSUPPORTED_REVERSAL_FIELD", "Reconciliation reversal accepts only its reviewed append-only target.");
  }
  return normalized;
}

export function inventoryReconciliationEventSemanticDigest(value = {}) {
  return `inventory-reconciliation-semantics:${stableDigest({
    id: value.id,
    eventType: value.eventType,
    status: value.status,
    category: value.category,
    reconciliationSequence: value.reconciliationSequence,
    idempotencyKey: value.idempotencyKey,
    proposalDigest: value.proposalDigest,
    candidateId: value.candidateId,
    applicationId: value.applicationId,
    inventoryCreationEventId: value.inventoryCreationEventId,
    sourceInventoryAdjustmentId: value.sourceInventoryAdjustmentId,
    sourceCorrectionCategory: value.sourceCorrectionCategory,
    sourceCorrectionCandidateId: value.sourceCorrectionCandidateId,
    purchaseId: value.purchaseId,
    receivingEventReferences: value.receivingEventReferences,
    inventoryItemId: value.inventoryItemId,
    inventoryLotId: value.inventoryLotId,
    currency: value.currency,
    soldQuantityAtConfirmation: value.soldQuantityAtConfirmation,
    saleAllocationSequenceWatermark: value.saleAllocationSequenceWatermark,
    quantityEffect: value.quantityEffect,
    costEffectMinorUnits: value.costEffectMinorUnits,
    saleCogsEffectMinorUnits: value.saleCogsEffectMinorUnits,
    remainingInventoryCostEffectMinorUnits: value.remainingInventoryCostEffectMinorUnits,
    previousInventoryVersion: value.previousInventoryVersion,
    resultingInventoryVersion: value.resultingInventoryVersion,
    previousLotVersion: value.previousLotVersion,
    resultingLotVersion: value.resultingLotVersion,
    previousState: value.previousState,
    resultingState: value.resultingState,
    affectedSales: value.affectedSales,
    affectedTransfers: value.affectedTransfers,
    reversesReconciliationEventId: value.reversesReconciliationEventId ?? null,
    reversesInventoryAdjustmentId: value.reversesInventoryAdjustmentId ?? null,
    occurredAt: value.occurredAt,
    reason: value.reason,
  })}`;
}

function normalizeAffectedSale(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InventoryReconciliationValidationError("INVALID_SALE_EFFECT", "Affected Sale metadata must be an object.");
  const allowed = new Set([
    "saleId", "allocationSequence", "quantity", "unitOffset", "originalCogsMinorUnits", "priorEffectiveCogsMinorUnits",
    "correctedCogsMinorUnits", "cogsDeltaMinorUnits", "originalProductReference", "correctedProductReference",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new InventoryReconciliationValidationError("UNSUPPORTED_SALE_EFFECT_FIELD", "Affected Sale metadata contains an unsupported field.");
  const prior = safeInteger(value.priorEffectiveCogsMinorUnits, `affectedSales[${index}].priorEffectiveCogsMinorUnits`);
  const corrected = safeInteger(value.correctedCogsMinorUnits, `affectedSales[${index}].correctedCogsMinorUnits`);
  const delta = signedSafeInteger(value.cogsDeltaMinorUnits, `affectedSales[${index}].cogsDeltaMinorUnits`);
  if (corrected - prior !== delta) throw new InventoryReconciliationValidationError("SALE_EFFECT_MISMATCH", "A Sale COGS effect does not reconcile.");
  return Object.freeze({
    saleId: boundedText(value.saleId, `affectedSales[${index}].saleId`, { required: true }),
    allocationSequence: safeInteger(value.allocationSequence, `affectedSales[${index}].allocationSequence`, 1),
    quantity: safeInteger(value.quantity, `affectedSales[${index}].quantity`, 1, INVENTORY_RECONCILIATION_LIMITS.maximumQuantity),
    unitOffset: safeInteger(value.unitOffset, `affectedSales[${index}].unitOffset`),
    originalCogsMinorUnits: safeInteger(value.originalCogsMinorUnits, `affectedSales[${index}].originalCogsMinorUnits`),
    priorEffectiveCogsMinorUnits: prior,
    correctedCogsMinorUnits: corrected,
    cogsDeltaMinorUnits: delta,
    originalProductReference: boundedText(value.originalProductReference, `affectedSales[${index}].originalProductReference`, { required: true }),
    correctedProductReference: boundedText(value.correctedProductReference, `affectedSales[${index}].correctedProductReference`, { required: true }),
  });
}

export function normalizeInventoryReconciliationEvent(value) {
  assertSafePurchaseReceivingInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InventoryReconciliationValidationError("EVENT_REQUIRED", "Inventory reconciliation event must be an object.");
  const allowed = new Set([
    "id", "format", "recordType", "recordVersion", "createdAt", "updatedAt", "provenanceManaged", "confirmationMethod",
    "eventType", "status", "category", "reconciliationSequence", "idempotencyKey", "proposalDigest", "semanticDigest", "candidateId",
    "applicationId", "inventoryCreationEventId", "sourceInventoryAdjustmentId", "sourceCorrectionCategory", "sourceCorrectionCandidateId",
    "purchaseId", "receivingEventReferences", "inventoryItemId", "inventoryLotId", "currency", "soldQuantityAtConfirmation",
    "saleAllocationSequenceWatermark",
    "quantityEffect", "costEffectMinorUnits", "saleCogsEffectMinorUnits", "remainingInventoryCostEffectMinorUnits",
    "previousInventoryVersion", "resultingInventoryVersion", "previousLotVersion", "resultingLotVersion", "previousState", "resultingState",
    "affectedSales", "affectedTransfers", "reversesReconciliationEventId", "reversesInventoryAdjustmentId", "occurredAt", "reason",
  ]);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new InventoryReconciliationValidationError("UNSUPPORTED_EVENT_FIELD", "Inventory reconciliation event contains an unsupported field.", { field: unknown });
  if (value.format !== INVENTORY_RECONCILIATION_FORMAT || value.recordType !== "INVENTORY_RECONCILIATION_EVENT"
    || value.provenanceManaged !== true || value.confirmationMethod !== "VERIFIED_OWNER_SESSION") {
    throw new InventoryReconciliationValidationError("EVENT_AUTHORITY_MISMATCH", "Inventory reconciliation authority metadata is invalid.");
  }
  const category = enumValue(value.category, INVENTORY_RECONCILIATION_CATEGORIES, "category");
  const status = enumValue(value.status, INVENTORY_RECONCILIATION_STATUSES, "status");
  if (![INVENTORY_RECONCILIATION_STATUSES.CONFIRMED, INVENTORY_RECONCILIATION_STATUSES.REVERSED].includes(status)) {
    throw new InventoryReconciliationValidationError("EVENT_NOT_CANONICAL", "Only confirmed append-only reconciliation events may be persisted.");
  }
  const affectedSales = Object.freeze((value.affectedSales || []).map(normalizeAffectedSale));
  if (affectedSales.length > INVENTORY_RECONCILIATION_LIMITS.maximumAffectedSales) throw new InventoryReconciliationValidationError("TOO_MANY_SALE_EFFECTS", "Inventory reconciliation affects too many Sales.");
  if (!Array.isArray(value.affectedTransfers) || value.affectedTransfers.length !== 0) {
    throw new InventoryReconciliationValidationError("TRANSFER_AUTHORITY_UNAVAILABLE", "Managed transfer reconciliation is unavailable and cannot be persisted.");
  }
  const previousState = normalizeCorrectionStateSnapshot(value.previousState, "previousState");
  const resultingState = normalizeCorrectionStateSnapshot(value.resultingState, "resultingState");
  const normalized = Object.freeze({
    id: boundedText(value.id, "id", { required: true }),
    format: INVENTORY_RECONCILIATION_FORMAT,
    recordType: "INVENTORY_RECONCILIATION_EVENT",
    recordVersion: safeInteger(value.recordVersion, "recordVersion", 1),
    createdAt: timestamp(value.createdAt, "createdAt"),
    updatedAt: timestamp(value.updatedAt, "updatedAt"),
    provenanceManaged: true,
    confirmationMethod: "VERIFIED_OWNER_SESSION",
    eventType: enumValue(value.eventType, INVENTORY_RECONCILIATION_EVENT_TYPES, "eventType"),
    status,
    category,
    reconciliationSequence: safeInteger(value.reconciliationSequence, "reconciliationSequence", 1),
    idempotencyKey: boundedText(value.idempotencyKey, "idempotencyKey", { required: true }),
    proposalDigest: boundedText(value.proposalDigest, "proposalDigest", { required: true }),
    semanticDigest: boundedText(value.semanticDigest, "semanticDigest", { required: true }),
    candidateId: boundedText(value.candidateId, "candidateId", { required: true }),
    applicationId: boundedText(value.applicationId, "applicationId", { required: true }),
    inventoryCreationEventId: boundedText(value.inventoryCreationEventId, "inventoryCreationEventId", { required: true }),
    sourceInventoryAdjustmentId: boundedText(value.sourceInventoryAdjustmentId, "sourceInventoryAdjustmentId", { required: true }),
    sourceCorrectionCategory: enumValue(value.sourceCorrectionCategory, INVENTORY_CORRECTION_CATEGORIES, "sourceCorrectionCategory"),
    sourceCorrectionCandidateId: boundedText(value.sourceCorrectionCandidateId, "sourceCorrectionCandidateId", { required: true }),
    purchaseId: boundedText(value.purchaseId, "purchaseId", { required: true }),
    receivingEventReferences: references(value.receivingEventReferences, "receivingEventReferences"),
    inventoryItemId: boundedText(value.inventoryItemId, "inventoryItemId", { required: true }),
    inventoryLotId: boundedText(value.inventoryLotId, "inventoryLotId", { required: true }),
    currency: boundedText(value.currency, "currency", { required: true, maximum: 3 }).toUpperCase(),
    soldQuantityAtConfirmation: safeInteger(value.soldQuantityAtConfirmation, "soldQuantityAtConfirmation", 0, INVENTORY_RECONCILIATION_LIMITS.maximumQuantity),
    saleAllocationSequenceWatermark: safeInteger(value.saleAllocationSequenceWatermark, "saleAllocationSequenceWatermark", 0, INVENTORY_RECONCILIATION_LIMITS.maximumAffectedSales),
    quantityEffect: signedSafeInteger(value.quantityEffect, "quantityEffect"),
    costEffectMinorUnits: signedSafeInteger(value.costEffectMinorUnits, "costEffectMinorUnits"),
    saleCogsEffectMinorUnits: signedSafeInteger(value.saleCogsEffectMinorUnits, "saleCogsEffectMinorUnits"),
    remainingInventoryCostEffectMinorUnits: signedSafeInteger(value.remainingInventoryCostEffectMinorUnits, "remainingInventoryCostEffectMinorUnits"),
    previousInventoryVersion: safeInteger(value.previousInventoryVersion, "previousInventoryVersion", 1),
    resultingInventoryVersion: safeInteger(value.resultingInventoryVersion, "resultingInventoryVersion", 2),
    previousLotVersion: safeInteger(value.previousLotVersion, "previousLotVersion", 1),
    resultingLotVersion: safeInteger(value.resultingLotVersion, "resultingLotVersion", 2),
    previousState,
    resultingState,
    affectedSales,
    affectedTransfers: Object.freeze([]),
    reversesReconciliationEventId: boundedText(value.reversesReconciliationEventId, "reversesReconciliationEventId"),
    reversesInventoryAdjustmentId: boundedText(value.reversesInventoryAdjustmentId, "reversesInventoryAdjustmentId"),
    occurredAt: timestamp(value.occurredAt, "occurredAt"),
    reason: sanitizePurchaseReceivingNote(value.reason, "Owner confirmed a historical Inventory reconciliation."),
  });
  if (normalized.eventType !== eventTypeForCategory(category)) throw new InventoryReconciliationValidationError("EVENT_TYPE_MISMATCH", "Reconciliation event type does not match its category.");
  if (normalized.resultingState.quantity - normalized.previousState.quantity !== normalized.quantityEffect
    || normalized.resultingState.acquisitionCostMinorUnits - normalized.previousState.acquisitionCostMinorUnits !== normalized.costEffectMinorUnits) {
    throw new InventoryReconciliationValidationError("EVENT_EFFECT_MISMATCH", "Inventory reconciliation effect does not match its before/after state.");
  }
  if (safeSum(normalized.affectedSales.map((effect) => effect.cogsDeltaMinorUnits), "affectedSales.cogsDeltaMinorUnits") !== normalized.saleCogsEffectMinorUnits
    || safeSum([normalized.saleCogsEffectMinorUnits, normalized.remainingInventoryCostEffectMinorUnits], "costConservation") !== normalized.costEffectMinorUnits) {
    throw new InventoryReconciliationValidationError("COST_CONSERVATION_FAILED", "Realized and remaining cost effects do not reconcile exactly.");
  }
  if (normalized.saleAllocationSequenceWatermark !== normalized.affectedSales.length) {
    throw new InventoryReconciliationValidationError("SALE_WATERMARK_MISMATCH", "Reconciliation Sale allocation watermark must match its complete effect snapshot.");
  }
  if (normalized.previousInventoryVersion + 1 !== normalized.resultingInventoryVersion
    || normalized.previousLotVersion + 1 !== normalized.resultingLotVersion) {
    throw new InventoryReconciliationValidationError("VERSION_TRANSITION_INVALID", "Reconciliation must advance Inventory and lot versions exactly once.");
  }
  const expectedCandidateId = inventoryReconciliationCandidateId({ inventoryItemId: normalized.inventoryItemId, category, idempotencyKey: normalized.idempotencyKey });
  if (normalized.candidateId !== expectedCandidateId || normalized.id !== inventoryReconciliationEventId({ applicationId: normalized.applicationId, candidateId: expectedCandidateId })) {
    throw new InventoryReconciliationValidationError("EVENT_IDENTITY_MISMATCH", "Reconciliation identities are not deterministic.");
  }
  if ((category === INVENTORY_RECONCILIATION_CATEGORIES.PRIOR_CORRECTION_REVERSAL) !== Boolean(normalized.reversesInventoryAdjustmentId)
    || (normalized.reversesReconciliationEventId && category !== INVENTORY_RECONCILIATION_CATEGORIES.PRIOR_CORRECTION_REVERSAL)) {
    throw new InventoryReconciliationValidationError("REVERSAL_TARGET_INVALID", "Reconciliation reversal target metadata is invalid.");
  }
  if (normalized.semanticDigest !== inventoryReconciliationEventSemanticDigest(normalized)) {
    throw new InventoryReconciliationValidationError("EVENT_SEMANTIC_DIGEST_MISMATCH", "Reconciliation event semantics changed after confirmation.");
  }
  return normalized;
}

export function reconciliationDeltaForSale(saleId, events = []) {
  return safeSum(events.flatMap((event) => (event.affectedSales || [])
    .filter((effect) => effect.saleId === saleId)
    .map((effect) => effect.cogsDeltaMinorUnits)), "saleReconciliationDeltas");
}

export function effectiveManagedSaleCogsMinorUnits(sale, events = []) {
  const original = safeInteger(Number(sale?.allocatedCostOfGoodsSoldMinorUnits), "allocatedCostOfGoodsSoldMinorUnits");
  return safeSum([original, reconciliationDeltaForSale(String(sale?.id || ""), events)], "effectiveSaleCogs");
}

export function managedSaleReconciliationProjection(sale, events = []) {
  const originalCogsMinorUnits = safeInteger(Number(sale?.allocatedCostOfGoodsSoldMinorUnits), "allocatedCostOfGoodsSoldMinorUnits");
  const cogsAdjustmentMinorUnits = reconciliationDeltaForSale(String(sale?.id || ""), events);
  const effectiveCogsMinorUnits = safeSum([originalCogsMinorUnits, cogsAdjustmentMinorUnits], "effectiveSaleCogs");
  const netProceedsMinorUnits = Number.isSafeInteger(sale?.netProceedsMinorUnits)
    ? sale.netProceedsMinorUnits
    : exactMajorUnitsToMinorUnits(sale?.netProceeds);
  return Object.freeze({
    saleId: boundedText(sale?.id, "sale.id", { required: true }),
    originalCogsMinorUnits,
    cogsAdjustmentMinorUnits,
    effectiveCogsMinorUnits,
    effectiveCogsMajorUnits: effectiveCogsMinorUnits / 100,
    effectiveRealizedProfitMinorUnits: Number.isSafeInteger(netProceedsMinorUnits) ? netProceedsMinorUnits - effectiveCogsMinorUnits : null,
  });
}

function affectedSalesForTransition(state, item, current, proposed, events) {
  const sales = sortedManagedSales(state, item.id);
  if (sales.length > INVENTORY_RECONCILIATION_LIMITS.maximumAffectedSales) throw new InventoryReconciliationValidationError("TOO_MANY_SALES", "Inventory has too many historical Sales for a local reconciliation.");
  let offset = 0;
  const affected = sales.map((sale, index) => {
    const authority = normalizedSaleAuthority(sale, index);
    if (authority.allocationSequence !== index + 1 || offset + authority.quantity > current.unitAcquisitionCostsMinorUnits.length
      || offset + authority.quantity > proposed.unitAcquisitionCostsMinorUnits.length) {
      throw new InventoryReconciliationValidationError("SALE_ALLOCATION_INVALID", "Historical Sale allocation order no longer reconciles to Inventory.", { saleId: authority.saleId });
    }
    const priorSlice = sumMinorUnits(current.unitAcquisitionCostsMinorUnits.slice(offset, offset + authority.quantity));
    const effective = effectiveManagedSaleCogsMinorUnits(sale, events);
    if (effective !== priorSlice) throw new InventoryReconciliationValidationError("PRIOR_COGS_CONFLICT", "Historical Sale COGS projection does not match current Inventory cost slices.", { saleId: authority.saleId });
    const corrected = sumMinorUnits(proposed.unitAcquisitionCostsMinorUnits.slice(offset, offset + authority.quantity));
    const effect = Object.freeze({
      saleId: authority.saleId,
      allocationSequence: authority.allocationSequence,
      quantity: authority.quantity,
      unitOffset: offset,
      originalCogsMinorUnits: authority.originalCogsMinorUnits,
      priorEffectiveCogsMinorUnits: priorSlice,
      correctedCogsMinorUnits: corrected,
      cogsDeltaMinorUnits: corrected - priorSlice,
      originalProductReference: current.productReference,
      correctedProductReference: proposed.productReference,
    });
    offset += authority.quantity;
    return effect;
  });
  return Object.freeze({ affected: Object.freeze(affected), soldQuantity: offset });
}

/**
 * Derives an ephemeral historical reconciliation preview. All authoritative
 * values come from the current managed Inventory/Sale document; browser values
 * are bounded intent and expected-version input only.
 */
export function deriveInventoryReconciliationCandidate({ inventoryState = {}, inventoryItemId, proposal: inputProposal }) {
  const validated = validateInventoryReconciliationState(inventoryState);
  const proposal = normalizeInventoryReconciliationProposal(inputProposal);
  const item = validated.bundles.items.find((entry) => entry.id === String(inventoryItemId));
  if (!item) throw new InventoryReconciliationValidationError("INVENTORY_ITEM_NOT_FOUND", "Owner-confirmed Inventory item was not found.");
  const lot = validated.bundles.lots.find((entry) => entry.id === item.inventoryLotId);
  const application = validated.bundles.applications.find((entry) => entry.id === item.inventoryCreationApplicationId);
  if (!lot || !application) throw new InventoryReconciliationValidationError("INVENTORY_PROVENANCE_INCOMPLETE", "Inventory provenance must be repaired before reconciliation.");
  const current = currentInventoryProjection(item, lot);
  const activeSales = sortedManagedSales(inventoryState, item.id);
  const soldQuantity = activeSales.reduce((total, sale) => total + Number(sale.quantitySold), 0);
  if (!Number.isSafeInteger(soldQuantity) || soldQuantity < 0 || soldQuantity > current.quantity) {
    throw new InventoryReconciliationValidationError("SALE_QUANTITY_CONFLICT", "Historical Sale quantity no longer reconciles to Inventory.");
  }
  const availableQuantity = current.quantity - soldQuantity;
  const relatedEvents = validated.events.filter((entry) => entry.applicationId === application.id);
  const relatedAdjustments = validated.bundles.adjustments.filter((entry) => entry.applicationId === application.id);
  const blockers = [];
  const warnings = ["ORIGINAL_SALES_REMAIN_APPEND_ONLY"];
  const proposed = { ...current };
  let reversesReconciliationEventId = proposal.reversesReconciliationEventId;
  let reversesInventoryAdjustmentId = null;

  if (TRANSFER_RECONCILIATION_CATEGORIES.includes(proposal.category)) blockers.push("MANAGED_TRANSFER_AUTHORITY_UNAVAILABLE");
  if (proposal.category === INVENTORY_RECONCILIATION_CATEGORIES.LOT_PROVENANCE_RECONCILIATION) blockers.push("IMMUTABLE_LOT_PROVENANCE_REQUIRES_SERVER_GRADE_REVIEW");

  if (COST_RECONCILIATION_CATEGORIES.includes(proposal.category)) {
    if (proposal.targetTotalCostMinorUnits == null) blockers.push("TARGET_COST_REQUIRED");
    if (proposal.targetTotalCostMinorUnits === current.acquisitionCostMinorUnits) blockers.push("ACQUISITION_COST_UNCHANGED");
    if (current.quantity === 0) blockers.push("NO_INVENTORY_UNITS_TO_RECONCILE");
    if (soldQuantity === 0) blockers.push("USE_STANDARD_INVENTORY_COST_CORRECTION");
    if (proposal.targetTotalCostMinorUnits != null && current.quantity > 0) {
      proposed.unitAcquisitionCostsMinorUnits = allocateAcquisitionCostToUnits(proposal.targetTotalCostMinorUnits, current.quantity);
      proposed.acquisitionCostMinorUnits = proposal.targetTotalCostMinorUnits;
    }
  }

  if (proposal.category === INVENTORY_RECONCILIATION_CATEGORIES.SALE_PRODUCT_RECONCILIATION) {
    if (!proposal.targetProductReference) blockers.push("TARGET_PRODUCT_REQUIRED");
    if (soldQuantity === 0) blockers.push("USE_STANDARD_INVENTORY_PRODUCT_CORRECTION");
    const existingTarget = (inventoryState.inventory || []).find((entry) => entry.id !== item.id
      && String(entry.productReference || entry.catalogItemId || "") === proposal.targetProductReference);
    if (proposal.targetProductReference && !existingTarget) blockers.push("TARGET_PRODUCT_MUST_ALREADY_EXIST");
    if (proposal.targetProductReference === current.productReference) blockers.push("PRODUCT_UNCHANGED");
    if (existingTarget) {
      proposed.productReference = String(existingTarget.productReference || existingTarget.catalogItemId);
      proposed.productTitle = String(existingTarget.productTitle || existingTarget.name || proposed.productReference);
      proposed.productClassification = existingTarget.productClassification;
      try {
        assertInventoryProductClassificationCondition(proposed.productClassification, current.condition, "Reconciled product relationship");
      } catch (error) {
        blockers.push(error.code || "TARGET_PRODUCT_CLASSIFICATION_INVALID");
      }
    }
  }

  if (proposal.category === INVENTORY_RECONCILIATION_CATEGORIES.RETURN_AFTER_SALE_RECONCILIATION) {
    if (!Number.isSafeInteger(proposal.quantity) || proposal.quantity < 1) blockers.push("RETURN_QUANTITY_REQUIRED");
    if (proposal.quantity > availableQuantity) blockers.push("RETURN_EXCEEDS_PHYSICALLY_AVAILABLE_QUANTITY");
    if (proposal.quantity <= availableQuantity && proposal.quantity > 0) {
      proposed.quantity = current.quantity - proposal.quantity;
      proposed.unitAcquisitionCostsMinorUnits = Object.freeze(current.unitAcquisitionCostsMinorUnits.slice(0, proposed.quantity));
      proposed.acquisitionCostMinorUnits = sumMinorUnits(proposed.unitAcquisitionCostsMinorUnits);
      proposed.inventoryDispositionState = proposed.quantity === soldQuantity ? "RETURNED" : current.inventoryDispositionState;
      proposed.inventoryStatus = stateStatus(proposed.quantity);
      proposed.lotStatus = lotStatus(proposed.quantity, item.originalQuantity);
    }
  }

  if (proposal.category === INVENTORY_RECONCILIATION_CATEGORIES.PRIOR_CORRECTION_REVERSAL) {
    const latestEvent = [...relatedEvents].sort((left, right) => left.reconciliationSequence - right.reconciliationSequence).at(-1);
    const latestAdjustment = [...relatedAdjustments].sort((left, right) => left.adjustmentSequence - right.adjustmentSequence).at(-1);
    const targetEvent = proposal.reversesReconciliationEventId
      ? relatedEvents.find((entry) => entry.id === proposal.reversesReconciliationEventId)
      : null;
    const targetAdjustment = proposal.reversesAdjustmentId
      ? relatedAdjustments.find((entry) => entry.id === proposal.reversesAdjustmentId)
      : targetEvent
        ? relatedAdjustments.find((entry) => entry.id === targetEvent.sourceInventoryAdjustmentId)
        : null;
    if (!targetAdjustment || (proposal.reversesReconciliationEventId && !targetEvent)) blockers.push("REVERSAL_TARGET_NOT_FOUND");
    else if (targetAdjustment.id !== latestAdjustment?.id) blockers.push("ONLY_LATEST_CORRECTION_CAN_BE_REVERSED");
    else if (targetEvent && targetEvent.id !== latestEvent?.id) blockers.push("ONLY_LATEST_RECONCILIATION_CAN_BE_REVERSED");
    else if (proposal.reversesAdjustmentId && relatedEvents.some((entry) => entry.sourceInventoryAdjustmentId === targetAdjustment.id)) {
      blockers.push("RECONCILIATION_EVENT_TARGET_REQUIRED");
    } else if (!targetAdjustment.previousState || !targetAdjustment.resultingState) blockers.push("LEGACY_REVERSAL_REQUIRES_MANUAL_REVIEW");
    else if (targetAdjustment.correctionCategory === INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION) blockers.push("REVERSAL_OF_REVERSAL_REQUIRES_MANUAL_REVIEW");
    else if (canonicalStringify(current) !== canonicalStringify(targetAdjustment.resultingState)) blockers.push("CORRECTION_STATE_CHANGED_AFTER_TARGET");
    else {
      Object.assign(proposed, targetAdjustment.previousState);
      reversesInventoryAdjustmentId = targetAdjustment.id;
      if (validated.bundles.applications.some((entry) => entry.sourceReturnAdjustmentId === targetAdjustment.id)) {
        blockers.push("REPLACEMENT_INVENTORY_RECONCILIATION_REQUIRED");
      }
      if (proposed.quantity < soldQuantity) blockers.push("REVERSAL_CONFLICTS_WITH_HISTORICAL_SALES");
    }
  } else if (proposal.reversesReconciliationEventId || proposal.reversesAdjustmentId) {
    blockers.push("REVERSAL_TARGET_NOT_ALLOWED");
  }

  const sourceCorrectionCategory = sourceCorrectionCategoryFor(proposal.category, proposal, availableQuantity);
  if (!sourceCorrectionCategory) blockers.push("RECONCILIATION_CATEGORY_REQUIRES_FUTURE_AUTHORITY");
  const transition = affectedSalesForTransition(inventoryState, item, current, proposed, validated.events);
  const saleCogsEffectMinorUnits = safeSum(transition.affected.map((effect) => effect.cogsDeltaMinorUnits), "saleCogsEffects");
  const currentRemaining = sumMinorUnits(current.unitAcquisitionCostsMinorUnits.slice(transition.soldQuantity));
  const proposedRemaining = sumMinorUnits(proposed.unitAcquisitionCostsMinorUnits.slice(transition.soldQuantity));
  const remainingInventoryCostEffectMinorUnits = proposedRemaining - currentRemaining;
  const costEffectMinorUnits = proposed.acquisitionCostMinorUnits - current.acquisitionCostMinorUnits;
  if (saleCogsEffectMinorUnits + remainingInventoryCostEffectMinorUnits !== costEffectMinorUnits) blockers.push("COST_CONSERVATION_FAILED");
  const quantityEffect = proposed.quantity - current.quantity;
  const sequence = relatedEvents.reduce((maximum, entry) => Math.max(maximum, entry.reconciliationSequence), 0) + 1;
  const sourceAdjustmentSequence = relatedAdjustments.reduce((maximum, entry) => Math.max(maximum, entry.adjustmentSequence || 0), 0) + 1;
  const candidateId = inventoryReconciliationCandidateId({ inventoryItemId: item.id, category: proposal.category, idempotencyKey: proposal.idempotencyKey });
  const sourceCorrectionCandidateId = sourceCorrectionCategory
    ? inventoryCorrectionCandidateId({ inventoryItemId: item.id, category: sourceCorrectionCategory, idempotencyKey: proposal.idempotencyKey })
    : null;
  const sourceInventoryAdjustmentId = sourceCorrectionCandidateId
    ? inventoryCorrectionAdjustmentId({ applicationId: application.id, candidateId: sourceCorrectionCandidateId })
    : null;
  const proposalDigest = inventoryReconciliationProposalDigest(proposal);
  const versionInput = {
    candidateId,
    itemVersion: item.recordVersion,
    lotVersion: lot.recordVersion,
    reconciliationSequence: sequence,
    sourceAdjustmentSequence,
    current,
    proposed,
    sales: activeSales.map((sale) => ({
      id: sale.id,
      quantitySold: sale.quantitySold,
      inventoryAllocationSequence: sale.inventoryAllocationSequence,
      allocatedCostOfGoodsSoldMinorUnits: sale.allocatedCostOfGoodsSoldMinorUnits,
    })),
    events: relatedEvents.map((event) => ({ id: event.id, semanticDigest: event.semanticDigest })),
    proposal,
  };
  const uniqueBlockers = Object.freeze([...new Set(blockers)]);
  const status = TRANSFER_RECONCILIATION_CATEGORIES.includes(proposal.category)
    ? INVENTORY_RECONCILIATION_STATUSES.NEEDS_REVIEW
    : uniqueBlockers.length
      ? INVENTORY_RECONCILIATION_STATUSES.BLOCKED
      : INVENTORY_RECONCILIATION_STATUSES.READY_TO_CONFIRM;
  return Object.freeze({
    format: INVENTORY_RECONCILIATION_CANDIDATE_FORMAT,
    recordType: "INVENTORY_RECONCILIATION_CANDIDATE",
    authoritative: false,
    persisted: false,
    candidateId,
    expectedVersion: inventoryReconciliationVersion(versionInput),
    status,
    category: proposal.category,
    eventType: eventTypeForCategory(proposal.category),
    idempotencyKey: proposal.idempotencyKey,
    proposalDigest,
    applicationId: application.id,
    inventoryCreationEventId: item.inventoryCreationEventId,
    sourceInventoryAdjustmentId,
    sourceCorrectionCategory,
    sourceCorrectionCandidateId,
    sourceAdjustmentSequence,
    reconciliationSequence: sequence,
    currentInventoryVersion: item.recordVersion,
    currentLotVersion: lot.recordVersion,
    inventoryItemId: item.id,
    inventoryLotId: lot.id,
    purchaseId: application.purchaseId,
    receivingEventReferences: Object.freeze([...application.receivingEventReferences]),
    currency: current.currency,
    current: Object.freeze(current),
    proposed: Object.freeze(proposed),
    soldQuantity: transition.soldQuantity,
    saleAllocationSequenceWatermark: transition.affected.length,
    availableQuantity,
    quantityEffect,
    costEffectMinorUnits,
    saleCogsEffectMinorUnits,
    remainingInventoryCostEffectMinorUnits,
    affectedSales: transition.affected,
    affectedTransfers: Object.freeze([]),
    reversesReconciliationEventId,
    reversesInventoryAdjustmentId,
    blockers: uniqueBlockers,
    warnings: Object.freeze([...new Set(warnings)]),
    eligible: status === INVENTORY_RECONCILIATION_STATUSES.READY_TO_CONFIRM,
    proposal,
  });
}

/** Strict canonical validation used by storage, backup and Restore Preview. */
export function validateInventoryReconciliationState(state = {}, options = {}) {
  assertSafePurchaseReceivingInput({ inventoryReconciliationEvents: state.inventoryReconciliationEvents || [] });
  const bundles = validateInventoryCreationStateBundles(state, { allowIncomplete: options.allowIncomplete === true });
  const events = Object.freeze((state.inventoryReconciliationEvents || []).map(normalizeInventoryReconciliationEvent));
  const ids = events.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) throw new InventoryReconciliationValidationError("DUPLICATE_RECONCILIATION_ID", "Reconciliation event IDs must be unique.");
  if (new Set(events.map((entry) => entry.idempotencyKey)).size !== events.length) throw new InventoryReconciliationValidationError("DUPLICATE_RECONCILIATION_IDEMPOTENCY", "Reconciliation idempotency keys must be unique.");
  if (new Set(events.map((entry) => entry.candidateId)).size !== events.length) throw new InventoryReconciliationValidationError("DUPLICATE_RECONCILIATION_CANDIDATE", "Reconciliation candidates may produce only one event.");
  const itemById = new Map(bundles.items.map((entry) => [entry.id, entry]));
  const lotById = new Map(bundles.lots.map((entry) => [entry.id, entry]));
  const appById = new Map(bundles.applications.map((entry) => [entry.id, entry]));
  const adjustmentById = new Map(bundles.adjustments.map((entry) => [entry.id, entry]));
  const saleById = new Map((state.sales || []).map((entry) => [entry.id, entry]));
  const eventById = new Map(events.map((entry) => [entry.id, entry]));
  const byApplication = new Map();
  for (const event of events) {
    const item = itemById.get(event.inventoryItemId);
    const lot = lotById.get(event.inventoryLotId);
    const application = appById.get(event.applicationId);
    const adjustment = adjustmentById.get(event.sourceInventoryAdjustmentId);
    if (!options.allowIncomplete && (!item || !lot || !application || !adjustment)) {
      throw new InventoryReconciliationValidationError("RECONCILIATION_PROVENANCE_INCOMPLETE", "Reconciliation provenance is incomplete.", { eventId: event.id });
    }
    if (item && (item.inventoryLotId !== event.inventoryLotId || item.inventoryCreationApplicationId !== event.applicationId || item.purchaseId !== event.purchaseId)) {
      throw new InventoryReconciliationValidationError("RECONCILIATION_ITEM_RELATION_INVALID", "Reconciliation Inventory relationships are invalid.");
    }
    if (lot && (lot.inventoryItemId !== event.inventoryItemId || lot.inventoryCreationApplicationId !== event.applicationId || lot.purchaseId !== event.purchaseId)) {
      throw new InventoryReconciliationValidationError("RECONCILIATION_LOT_RELATION_INVALID", "Reconciliation lot relationships are invalid.");
    }
    if (application && (application.purchaseId !== event.purchaseId
      || canonicalStringify(application.receivingEventReferences) !== canonicalStringify(event.receivingEventReferences))) {
      throw new InventoryReconciliationValidationError("RECONCILIATION_SOURCE_RELATION_INVALID", "Reconciliation Purchase/Receiving provenance is invalid.");
    }
    if (adjustment && (adjustment.inventoryItemId !== event.inventoryItemId
      || adjustment.inventoryLotId !== event.inventoryLotId
      || adjustment.correctionCategory !== event.sourceCorrectionCategory
      || adjustment.candidateId !== event.sourceCorrectionCandidateId
      || adjustment.proposalDigest !== event.proposalDigest
      || canonicalStringify(adjustment.previousState) !== canonicalStringify(event.previousState)
      || canonicalStringify(adjustment.resultingState) !== canonicalStringify(event.resultingState)
      || adjustment.previousInventoryVersion !== event.previousInventoryVersion
      || adjustment.resultingInventoryVersion !== event.resultingInventoryVersion)) {
      throw new InventoryReconciliationValidationError("RECONCILIATION_ADJUSTMENT_MISMATCH", "Reconciliation event does not match its managed Inventory adjustment.");
    }
    let soldQuantity = 0;
    for (const [index, effect] of event.affectedSales.entries()) {
      if (effect.allocationSequence !== index + 1 || effect.unitOffset !== soldQuantity) {
        throw new InventoryReconciliationValidationError("RECONCILIATION_SALE_SEQUENCE_INVALID", "Reconciliation Sale effects must preserve deterministic allocation order.");
      }
      const prior = sumMinorUnits(event.previousState.unitAcquisitionCostsMinorUnits.slice(effect.unitOffset, effect.unitOffset + effect.quantity));
      const corrected = sumMinorUnits(event.resultingState.unitAcquisitionCostsMinorUnits.slice(effect.unitOffset, effect.unitOffset + effect.quantity));
      if (prior !== effect.priorEffectiveCogsMinorUnits || corrected !== effect.correctedCogsMinorUnits
        || event.previousState.productReference !== effect.originalProductReference
        || event.resultingState.productReference !== effect.correctedProductReference) {
        throw new InventoryReconciliationValidationError("RECONCILIATION_SALE_SLICE_MISMATCH", "Reconciliation Sale effect does not match its exact unit slice.");
      }
      const sale = saleById.get(effect.saleId);
      if (!sale && !options.allowMissingSales) throw new InventoryReconciliationValidationError("RECONCILIATION_SALE_MISSING", "A reconciliation references a missing immutable Sale.");
      if (sale) {
        const authority = normalizedSaleAuthority(sale, index);
        if (sale.inventoryItemId !== event.inventoryItemId || authority.quantity !== effect.quantity
          || authority.allocationSequence !== effect.allocationSequence || authority.originalCogsMinorUnits !== effect.originalCogsMinorUnits) {
          throw new InventoryReconciliationValidationError("RECONCILIATION_SALE_RELATION_INVALID", "Reconciliation Sale authority no longer matches its immutable source.");
        }
      }
      soldQuantity += effect.quantity;
    }
    if (soldQuantity !== event.soldQuantityAtConfirmation) throw new InventoryReconciliationValidationError("RECONCILIATION_SOLD_QUANTITY_MISMATCH", "Reconciliation sold quantity does not match its Sale effects.");
    if (!options.allowMissingSales) {
      const allManagedSales = sortedManagedSales(state, event.inventoryItemId);
      const historicalSales = allManagedSales
        .slice(0, event.saleAllocationSequenceWatermark);
      if (historicalSales.length !== event.affectedSales.length
        || historicalSales.some((sale, index) => sale.id !== event.affectedSales[index]?.saleId)) {
        throw new InventoryReconciliationValidationError("RECONCILIATION_SALE_SET_INCOMPLETE", "Reconciliation must preserve a complete snapshot of every Sale allocated before confirmation.");
      }
      const occurredAt = new Date(event.occurredAt).getTime();
      if (allManagedSales.some((sale, index) => index >= event.saleAllocationSequenceWatermark
        && Number.isFinite(new Date(sale.inventoryAllocationAt).getTime())
        && new Date(sale.inventoryAllocationAt).getTime() <= occurredAt)) {
        throw new InventoryReconciliationValidationError("SALE_ALLOCATION_CLOCK_CONFLICT", "A later Sale cannot predate an immutable reconciliation watermark.");
      }
    }
    const currentRemaining = sumMinorUnits(event.previousState.unitAcquisitionCostsMinorUnits.slice(soldQuantity));
    const resultingRemaining = sumMinorUnits(event.resultingState.unitAcquisitionCostsMinorUnits.slice(soldQuantity));
    if (resultingRemaining - currentRemaining !== event.remainingInventoryCostEffectMinorUnits) {
      throw new InventoryReconciliationValidationError("RECONCILIATION_REMAINING_COST_MISMATCH", "Remaining Inventory cost effect does not match the exact unsold slice.");
    }
    if (event.category === INVENTORY_RECONCILIATION_CATEGORIES.PRIOR_CORRECTION_REVERSAL) {
      const targetAdjustment = adjustmentById.get(event.reversesInventoryAdjustmentId);
      const targetEvent = event.reversesReconciliationEventId
        ? eventById.get(event.reversesReconciliationEventId)
        : null;
      const targetHasReconciliation = events.some((entry) => entry.sourceInventoryAdjustmentId === event.reversesInventoryAdjustmentId);
      if (!targetAdjustment || !adjustment || adjustment.reversesAdjustmentId !== targetAdjustment.id
        || targetAdjustment.applicationId !== event.applicationId
        || canonicalStringify(targetAdjustment.previousState) !== canonicalStringify(event.resultingState)
        || canonicalStringify(targetAdjustment.resultingState) !== canonicalStringify(event.previousState)
        || (event.reversesReconciliationEventId && (!targetEvent
          || targetEvent.sourceInventoryAdjustmentId !== targetAdjustment.id
          || targetEvent.applicationId !== event.applicationId
          || targetEvent.reconciliationSequence >= event.reconciliationSequence))
        || (!event.reversesReconciliationEventId && targetHasReconciliation)) {
        throw new InventoryReconciliationValidationError("RECONCILIATION_REVERSAL_INVALID", "Reconciliation reversal does not exactly restore its reviewed prior correction state.");
      }
    }
    const group = byApplication.get(event.applicationId) || [];
    group.push(event);
    byApplication.set(event.applicationId, group);
  }
  for (const group of byApplication.values()) {
    group.sort((left, right) => left.reconciliationSequence - right.reconciliationSequence);
    group.forEach((event, index) => {
      if (event.reconciliationSequence !== index + 1) throw new InventoryReconciliationValidationError("RECONCILIATION_SEQUENCE_INVALID", "Reconciliation sequence must be contiguous per acquisition.");
    });
  }
  return Object.freeze({ bundles, events });
}

export function reconciliationAdjustmentIdentity(candidate) {
  return Object.freeze({
    id: candidate.sourceInventoryAdjustmentId,
    candidateId: candidate.sourceCorrectionCandidateId,
    category: candidate.sourceCorrectionCategory,
  });
}
