import { canonicalStringify } from "../../backup/canonicalJson.js";
import { soldQuantityForInventory } from "../../flipScout/inventory.js";
import { assertSafePurchaseReceivingInput, sanitizePurchaseReceivingNote } from "../security.js";
import { allocateAcquisitionCostToUnits, sumMinorUnits } from "../inventoryCreation/allocation.js";
import {
  INVENTORY_CREATION_APPLICATION_STATES,
  INVENTORY_CREATION_CONDITIONS,
  INVENTORY_CREATION_DISPOSITIONS,
} from "../inventoryCreation/constants.js";
import {
  assertInventoryProductClassificationCondition,
  deriveEffectiveInventoryAdjustmentIds,
  inventoryCorrectionProposalSemanticDigest,
  isPhysicalInventoryReturnAdjustment,
  normalizeInventoryAcquisitionLot,
  normalizeProvenanceManagedInventoryItem,
  validateInventoryCreationStateBundles,
} from "../inventoryCreation/contracts.js";
import {
  INVENTORY_CORRECTION_BLOCKED_CATEGORIES,
  INVENTORY_CORRECTION_CANDIDATE_FORMAT,
  INVENTORY_CORRECTION_CATEGORIES,
  INVENTORY_CORRECTION_DISPOSITIONS,
  INVENTORY_CORRECTION_EVENT_KINDS,
  INVENTORY_CORRECTION_LIMITS,
  INVENTORY_EXTRA_COST_TREATMENTS,
  INVENTORY_QUANTITY_CORRECTION_REASONS,
} from "./constants.js";

export class InventoryCorrectionValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "InventoryCorrectionValidationError";
    this.code = code;
    this.details = details;
  }
}

function boundedText(value, field, { required = false, maximum = INVENTORY_CORRECTION_LIMITS.maximumIdentifier } = {}) {
  if (value == null || value === "") {
    if (required) throw new InventoryCorrectionValidationError("REQUIRED_FIELD", `${field} is required.`, { field });
    return null;
  }
  const text = String(value).trim();
  if (!text || text.length > maximum) throw new InventoryCorrectionValidationError("INVALID_TEXT", `${field} must be a bounded string.`, { field });
  return text;
}

function safeInteger(value, field, minimum = 0, maximum = INVENTORY_CORRECTION_LIMITS.maximumQuantity) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new InventoryCorrectionValidationError("INVALID_INTEGER", `${field} must be a bounded safe integer.`, { field });
  }
  return value;
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

function enumValue(value, values, field, fallback = null) {
  const normalized = String(value || fallback || "").trim().toUpperCase().replace(/[ -]+/g, "_");
  if (!Object.values(values).includes(normalized)) throw new InventoryCorrectionValidationError("INVALID_ENUM", `${field} is unsupported.`, { field });
  return normalized;
}

function eventKind(category) {
  if ([INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER, INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION].includes(category)) {
    return INVENTORY_CORRECTION_EVENT_KINDS.DISPOSITION;
  }
  if ([INVENTORY_CORRECTION_CATEGORIES.CREATION_REVERSAL, INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION].includes(category)) return INVENTORY_CORRECTION_EVENT_KINDS.REVERSAL;
  return INVENTORY_CORRECTION_EVENT_KINDS.CORRECTION;
}

export function normalizeInventoryCorrectionProposal(value = {}) {
  assertSafePurchaseReceivingInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InventoryCorrectionValidationError("PROPOSAL_REQUIRED", "Inventory correction proposal must be an object.");
  const allowed = new Set([
    "category", "idempotencyKey", "reason", "quantity", "quantityReason", "targetProductReference", "targetProductTitle",
    "targetCondition", "targetDisposition", "targetTotalCostMinorUnits", "reversesAdjustmentId", "extraCostTreatment",
  ]);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new InventoryCorrectionValidationError("UNSUPPORTED_PROPOSAL_FIELD", `${unknown} cannot supply Inventory authority.`, { field: unknown });
  const category = enumValue(value.category, INVENTORY_CORRECTION_CATEGORIES, "category");
  if (category === INVENTORY_CORRECTION_CATEGORIES.CREATION_REVERSAL) {
    throw new InventoryCorrectionValidationError("UNSUPPORTED_CORRECTION_CATEGORY", "Creation reversal uses its dedicated owner-confirmed Inventory boundary.");
  }
  const quantity = value.quantity == null || value.quantity === "" ? null : safeInteger(Number(value.quantity), "quantity", 1);
  const targetCost = value.targetTotalCostMinorUnits == null || value.targetTotalCostMinorUnits === ""
    ? null
    : safeInteger(Number(value.targetTotalCostMinorUnits), "targetTotalCostMinorUnits", 0, Number.MAX_SAFE_INTEGER);
  const quantityReason = value.quantityReason == null
    ? null
    : enumValue(value.quantityReason, INVENTORY_QUANTITY_CORRECTION_REASONS, "quantityReason");
  const reversesAdjustmentId = boundedText(value.reversesAdjustmentId, "reversesAdjustmentId");
  if (category === INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION && !quantityReason) {
    throw new InventoryCorrectionValidationError("QUANTITY_REASON_REQUIRED", "Quantity correction requires a bounded reason category.");
  }
  if (category !== INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION && quantityReason) {
    throw new InventoryCorrectionValidationError("QUANTITY_REASON_NOT_ALLOWED", "Quantity reason is only valid for quantity correction.");
  }
  if (category === INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION && !reversesAdjustmentId) {
    throw new InventoryCorrectionValidationError("REVERSAL_TARGET_REQUIRED", "Inventory correction reversal requires a reviewed target event.");
  }
  if (category !== INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION && reversesAdjustmentId) {
    throw new InventoryCorrectionValidationError("REVERSAL_TARGET_NOT_ALLOWED", "Only Inventory correction reversal may reference a prior correction.");
  }
  return Object.freeze({
    category,
    idempotencyKey: boundedText(value.idempotencyKey, "idempotencyKey", { required: true }),
    reason: sanitizePurchaseReceivingNote(value.reason, "Owner reviewed an Inventory correction."),
    quantity,
    quantityReason,
    targetProductReference: boundedText(value.targetProductReference, "targetProductReference"),
    targetProductTitle: boundedText(value.targetProductTitle, "targetProductTitle"),
    targetCondition: value.targetCondition == null ? null : enumValue(value.targetCondition, INVENTORY_CREATION_CONDITIONS, "targetCondition"),
    targetDisposition: value.targetDisposition == null ? null : enumValue(value.targetDisposition, INVENTORY_CREATION_DISPOSITIONS, "targetDisposition"),
    targetTotalCostMinorUnits: targetCost,
    reversesAdjustmentId,
    extraCostTreatment: value.extraCostTreatment == null ? null : enumValue(value.extraCostTreatment, INVENTORY_EXTRA_COST_TREATMENTS, "extraCostTreatment"),
  });
}

export function inventoryCorrectionProposalDigest(value) {
  return inventoryCorrectionProposalSemanticDigest(normalizeInventoryCorrectionProposal(value));
}

export function inventoryCorrectionCandidateId({ inventoryItemId, category, idempotencyKey }) {
  return `inventory-correction-candidate:${stableDigest({ inventoryItemId, category, idempotencyKey })}`;
}

export function inventoryCorrectionAdjustmentId({ applicationId, candidateId }) {
  return `inventory-adjustment:correction:${stableDigest({ applicationId, candidateId })}`;
}

export function inventoryCorrectionVersion(value) {
  return `inventory-correction-version:${stableDigest(value)}`;
}

export function currentInventoryProjection(itemInput, lotInput) {
  const item = normalizeProvenanceManagedInventoryItem(itemInput);
  const lot = normalizeInventoryAcquisitionLot(lotInput);
  const comparableItem = {
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
  };
  const comparableLot = {
    productReference: lot.productReference,
    productTitle: lot.productTitle,
    productClassification: lot.productClassification,
    condition: lot.condition,
    disposition: lot.disposition,
    inventoryDispositionState: lot.inventoryDispositionState,
    quantity: lot.quantity,
    currency: lot.currency,
    acquisitionCostMinorUnits: lot.acquisitionCostMinorUnits,
    unitAcquisitionCostsMinorUnits: lot.unitAcquisitionCostsMinorUnits,
    inventoryStatus: item.status,
    lotStatus: lot.status,
  };
  if (canonicalStringify(comparableItem) !== canonicalStringify(comparableLot)) {
    throw new InventoryCorrectionValidationError("INVENTORY_LOT_STATE_CONFLICT", "Inventory item and acquisition lot current state do not match.");
  }
  return Object.freeze(comparableItem);
}

function conditionDisposition(condition, requestedDisposition) {
  const disposition = requestedDisposition || (condition === INVENTORY_CREATION_CONDITIONS.DAMAGED
    ? INVENTORY_CREATION_DISPOSITIONS.ADD_AS_DAMAGED
    : INVENTORY_CREATION_DISPOSITIONS.ADD_TO_INVENTORY);
  const damagedCondition = condition === INVENTORY_CREATION_CONDITIONS.DAMAGED;
  const damagedDisposition = disposition === INVENTORY_CREATION_DISPOSITIONS.ADD_AS_DAMAGED;
  if (damagedCondition !== damagedDisposition) {
    throw new InventoryCorrectionValidationError("DAMAGED_DISPOSITION_REQUIRED", "Damaged condition must remain paired with the reviewed damaged-Inventory disposition.");
  }
  return disposition;
}

function statusForQuantity(quantity) {
  return quantity === 0 ? "Disposed" : "In stock";
}

function lotStatusForQuantity(quantity, originalQuantity) {
  if (quantity === 0) return "REVERSED";
  if (quantity === originalQuantity) return "ACTIVE";
  return quantity < originalQuantity ? "PARTIALLY_REVERSED" : "ADJUSTED";
}

function latestAdjustment(adjustments) {
  return [...adjustments].sort((left, right) => (left.adjustmentSequence || 0) - (right.adjustmentSequence || 0)).at(-1) || null;
}

/**
 * Derive an ephemeral, non-authoritative correction preview from current canonical
 * Inventory. The caller must perform the owner check before obtaining inventoryState.
 */
export function deriveInventoryCorrectionCandidate({ inventoryState = {}, inventoryItemId, proposal: inputProposal, transferredQuantity = 0 }) {
  const validated = validateInventoryCreationStateBundles(inventoryState);
  const proposal = normalizeInventoryCorrectionProposal(inputProposal);
  const item = validated.items.find((entry) => entry.id === String(inventoryItemId));
  if (!item) throw new InventoryCorrectionValidationError("INVENTORY_ITEM_NOT_FOUND", "Owner-confirmed Inventory item was not found.");
  const lot = validated.lots.find((entry) => entry.id === item.inventoryLotId);
  const application = validated.applications.find((entry) => entry.id === item.inventoryCreationApplicationId);
  if (!lot || !application) throw new InventoryCorrectionValidationError("INVENTORY_PROVENANCE_INCOMPLETE", "Inventory provenance must be repaired before correction.");
  const relatedAdjustments = validated.adjustments.filter((entry) => entry.applicationId === application.id);
  const current = currentInventoryProjection(item, lot);
  const soldQuantity = soldQuantityForInventory(item.id, inventoryState.sales || []);
  const transferred = safeInteger(Number(transferredQuantity || 0), "transferredQuantity", 0);
  const availableQuantity = Math.max(0, current.quantity - soldQuantity - transferred);
  const blockers = [];
  const warnings = [];
  const proposed = { ...current };
  let quantityEffect = 0;
  let costEffectMinorUnits = 0;
  let dispositionState = current.inventoryDispositionState || INVENTORY_CORRECTION_DISPOSITIONS.AVAILABLE;
  let reversalOfAdjustmentId = proposal.reversesAdjustmentId;

  if (INVENTORY_CORRECTION_BLOCKED_CATEGORIES.includes(proposal.category)) {
    blockers.push(proposal.category === INVENTORY_CORRECTION_CATEGORIES.REPLACEMENT_RECEIVED
      ? "REPLACEMENT_REQUIRES_NEW_RECEIVING_AND_INVENTORY_CREATION"
      : "UNEXPECTED_EXTRA_REQUIRES_SEPARATE_INVENTORY_CREATION");
  }

  if ([
    INVENTORY_CORRECTION_CATEGORIES.PRODUCT_RESOLUTION_CORRECTION,
    INVENTORY_CORRECTION_CATEGORIES.WRONG_ITEM_RESOLUTION,
    INVENTORY_CORRECTION_CATEGORIES.SUBSTITUTION_RESOLUTION,
  ].includes(proposal.category)) {
    if (proposal.quantity != null && proposal.quantity !== availableQuantity) blockers.push("WHOLE_LOT_CORRECTION_ONLY");
    warnings.push("CORRECTION_APPLIES_TO_WHOLE_CURRENT_LOT");
    if (!proposal.targetProductReference) blockers.push("TARGET_PRODUCT_REQUIRED");
    const existingTarget = (inventoryState.inventory || []).find((entry) => entry.id !== item.id && String(entry.productReference || entry.catalogItemId || "") === proposal.targetProductReference);
    if (proposal.targetProductReference && !existingTarget) blockers.push("TARGET_PRODUCT_MUST_ALREADY_EXIST");
    if (proposal.targetProductReference === current.productReference) blockers.push("PRODUCT_UNCHANGED");
    if (soldQuantity > 0) blockers.push("HISTORICAL_SALE_PRODUCT_RECONCILIATION_REQUIRED");
    if (transferred > 0) blockers.push("TRANSFER_RECONCILIATION_REQUIRED");
    if (existingTarget) {
      proposed.productReference = String(existingTarget.productReference || existingTarget.catalogItemId);
      proposed.productTitle = String(existingTarget.productTitle || existingTarget.name || proposed.productReference);
      proposed.productClassification = existingTarget.productClassification;
      try {
        assertInventoryProductClassificationCondition(proposed.productClassification, current.condition, "Corrected product relationship");
      } catch (error) {
        blockers.push(error.code || "TARGET_PRODUCT_CLASSIFICATION_INVALID");
      }
    }
  }

  if ([INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION, INVENTORY_CORRECTION_CATEGORIES.DAMAGED_AFTER_RECEIVING].includes(proposal.category)) {
    if (proposal.quantity != null && proposal.quantity !== availableQuantity) blockers.push("WHOLE_LOT_CORRECTION_ONLY");
    warnings.push("CORRECTION_APPLIES_TO_WHOLE_CURRENT_LOT");
    const targetCondition = proposal.category === INVENTORY_CORRECTION_CATEGORIES.DAMAGED_AFTER_RECEIVING
      ? INVENTORY_CREATION_CONDITIONS.DAMAGED
      : proposal.targetCondition;
    if (!targetCondition) blockers.push("TARGET_CONDITION_REQUIRED");
    if (targetCondition) {
      try {
        assertInventoryProductClassificationCondition(current.productClassification, targetCondition, "Corrected Inventory condition");
        proposed.condition = targetCondition;
        proposed.disposition = conditionDisposition(targetCondition, proposal.targetDisposition);
        dispositionState = targetCondition === INVENTORY_CREATION_CONDITIONS.DAMAGED
          ? INVENTORY_CORRECTION_DISPOSITIONS.DAMAGED
          : INVENTORY_CORRECTION_DISPOSITIONS.AVAILABLE;
      } catch (error) {
        blockers.push(error.code || "INVALID_CONDITION_DISPOSITION");
      }
    }
    if (targetCondition === current.condition && proposed.disposition === current.disposition) blockers.push("CONDITION_UNCHANGED");
    if (soldQuantity > 0) blockers.push("HISTORICAL_SALE_CONDITION_RECONCILIATION_REQUIRED");
    if (transferred > 0) blockers.push("TRANSFER_RECONCILIATION_REQUIRED");
  }

  if ([INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER, INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION].includes(proposal.category)) {
    const quantity = proposal.category === INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER && proposal.quantity == null
      ? availableQuantity
      : proposal.quantity;
    if (!Number.isSafeInteger(quantity) || quantity < 1) blockers.push("POSITIVE_DISPOSITION_QUANTITY_REQUIRED");
    if (Number.isSafeInteger(quantity) && quantity > availableQuantity) blockers.push("DISPOSITION_EXCEEDS_AVAILABLE");
    if (proposal.category === INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER && quantity !== availableQuantity) blockers.push("FULL_RETURN_REQUIRES_ALL_AVAILABLE_QUANTITY");
    if (proposal.category === INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN && quantity === availableQuantity) blockers.push("PARTIAL_RETURN_MUST_LEAVE_AVAILABLE_QUANTITY");
    if (proposal.category === INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION && !proposal.quantityReason) blockers.push("QUANTITY_REASON_REQUIRED");
    if (Number.isSafeInteger(quantity) && quantity > 0 && quantity <= availableQuantity) {
      quantityEffect = -quantity;
      proposed.quantity = current.quantity - quantity;
      proposed.unitAcquisitionCostsMinorUnits = Object.freeze(current.unitAcquisitionCostsMinorUnits.slice(0, proposed.quantity));
      proposed.acquisitionCostMinorUnits = sumMinorUnits(proposed.unitAcquisitionCostsMinorUnits);
      costEffectMinorUnits = proposed.acquisitionCostMinorUnits - current.acquisitionCostMinorUnits;
      dispositionState = proposed.quantity === 0
        ? (proposal.category === INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER || proposal.category === INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN
          ? INVENTORY_CORRECTION_DISPOSITIONS.RETURNED
          : proposal.quantityReason === INVENTORY_QUANTITY_CORRECTION_REASONS.RETURN
            ? INVENTORY_CORRECTION_DISPOSITIONS.RETURNED
            : proposal.quantityReason === INVENTORY_QUANTITY_CORRECTION_REASONS.LOSS
              ? INVENTORY_CORRECTION_DISPOSITIONS.LOST
              : INVENTORY_CORRECTION_DISPOSITIONS.DISPOSED)
        : current.inventoryDispositionState;
    }
  }

  if (proposal.category === INVENTORY_CORRECTION_CATEGORIES.ACQUISITION_COST_CORRECTION) {
    if (proposal.targetTotalCostMinorUnits == null) blockers.push("TARGET_COST_REQUIRED");
    if (soldQuantity > 0) blockers.push("REALIZED_COGS_REVIEW_REQUIRED");
    if (transferred > 0) blockers.push("TRANSFER_RECONCILIATION_REQUIRED");
    if (proposal.targetTotalCostMinorUnits === current.acquisitionCostMinorUnits) blockers.push("ACQUISITION_COST_UNCHANGED");
    if (current.quantity === 0) blockers.push("NO_REMAINING_QUANTITY_FOR_COST_CORRECTION");
    if (proposal.targetTotalCostMinorUnits != null && current.quantity > 0) {
      proposed.unitAcquisitionCostsMinorUnits = allocateAcquisitionCostToUnits(proposal.targetTotalCostMinorUnits, current.quantity);
      proposed.acquisitionCostMinorUnits = proposal.targetTotalCostMinorUnits;
      costEffectMinorUnits = proposed.acquisitionCostMinorUnits - current.acquisitionCostMinorUnits;
    }
  }

  if (proposal.category === INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION) {
    const target = relatedAdjustments.find((entry) => entry.id === proposal.reversesAdjustmentId);
    const latest = latestAdjustment(relatedAdjustments);
    if (!target) blockers.push("REVERSAL_TARGET_NOT_FOUND");
    else if (target.id !== latest?.id) blockers.push("ONLY_LATEST_CORRECTION_CAN_BE_REVERSED");
    else if (!target.previousState || !target.resultingState) blockers.push("LEGACY_REVERSAL_REQUIRES_MANUAL_REVIEW");
    else if (canonicalStringify(current) !== canonicalStringify(target.resultingState)) blockers.push("CORRECTION_STATE_CHANGED_AFTER_TARGET");
    else {
      const simulatedEffectiveIds = new Set(deriveEffectiveInventoryAdjustmentIds([
        ...validated.adjustments,
        {
          id: `inventory-adjustment-preview:${proposal.idempotencyKey}`,
          adjustmentSequence: (latest?.adjustmentSequence || relatedAdjustments.length) + 1,
          occurredAt: "9999-12-31T23:59:59.999Z",
          correctionCategory: INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION,
          reversesAdjustmentId: target.id,
        },
      ]));
      if (validated.applications.some((completedApplication) => (
        completedApplication.status === INVENTORY_CREATION_APPLICATION_STATES.COMPLETED
        && completedApplication.sourceReturnAdjustmentId
        && !simulatedEffectiveIds.has(completedApplication.sourceReturnAdjustmentId)
      ))) blockers.push("REPLACEMENT_INVENTORY_RECONCILIATION_REQUIRED");
      Object.assign(proposed, target.previousState);
      dispositionState = target.previousState.inventoryDispositionState;
      quantityEffect = proposed.quantity - current.quantity;
      costEffectMinorUnits = proposed.acquisitionCostMinorUnits - current.acquisitionCostMinorUnits;
      if (quantityEffect < 0 && Math.abs(quantityEffect) > availableQuantity) blockers.push("REVERSAL_EXCEEDS_AVAILABLE");
      if (quantityEffect > 0 && proposed.quantity > application.quantity) blockers.push("REVERSAL_EXCEEDS_ORIGINAL_ACQUISITION");
      const rewritesHistoricalClassification = target.previousState.productReference !== target.resultingState.productReference
        || target.previousState.condition !== target.resultingState.condition
        || canonicalStringify(target.previousState.unitAcquisitionCostsMinorUnits) !== canonicalStringify(target.resultingState.unitAcquisitionCostsMinorUnits);
      if (soldQuantity > 0 && rewritesHistoricalClassification) blockers.push("HISTORICAL_SALE_RECONCILIATION_REQUIRED");
      if (transferred > 0 && rewritesHistoricalClassification) blockers.push("TRANSFER_RECONCILIATION_REQUIRED");
    }
  }

  proposed.inventoryDispositionState = dispositionState;
  proposed.inventoryStatus = statusForQuantity(proposed.quantity);
  proposed.lotStatus = lotStatusForQuantity(proposed.quantity, item.originalQuantity);
  if (transferred > 0) warnings.push("TRANSFER_USAGE_REQUIRES_RECONCILIATION");
  if (soldQuantity > 0) warnings.push("SOLD_QUANTITY_REMAINS_IMMUTABLE");
  if (proposal.category === INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION && proposal.quantityReason === INVENTORY_QUANTITY_CORRECTION_REASONS.FOUND_EXTRA) {
    blockers.push("POSITIVE_QUANTITY_REQUIRES_NEW_ACQUISITION");
  }

  const sequence = Math.max(
    relatedAdjustments.length,
    relatedAdjustments.reduce((maximum, entry) => Math.max(maximum, entry.adjustmentSequence || 0), 0),
  ) + 1;
  const candidateId = inventoryCorrectionCandidateId({ inventoryItemId: item.id, category: proposal.category, idempotencyKey: proposal.idempotencyKey });
  const versionInput = {
    candidateId,
    applicationId: application.id,
    inventoryItemId: item.id,
    inventoryLotId: lot.id,
    itemVersion: item.recordVersion,
    lotVersion: lot.recordVersion,
    sequence,
    soldQuantity,
    transferredQuantity: transferred,
    current,
    proposed,
    proposal,
  };
  return Object.freeze({
    format: INVENTORY_CORRECTION_CANDIDATE_FORMAT,
    recordType: "INVENTORY_CORRECTION_CANDIDATE",
    authoritative: false,
    persisted: false,
    candidateId,
    expectedVersion: inventoryCorrectionVersion(versionInput),
    applicationId: application.id,
    inventoryItemId: item.id,
    inventoryLotId: lot.id,
    purchaseId: application.purchaseId,
    receivingEventReferences: Object.freeze([...application.receivingEventReferences]),
    category: proposal.category,
    eventKind: eventKind(proposal.category),
    idempotencyKey: proposal.idempotencyKey,
    proposalDigest: inventoryCorrectionProposalDigest(proposal),
    reason: proposal.reason,
    quantityReason: proposal.quantityReason,
    adjustmentSequence: sequence,
    expectedInventoryVersion: item.recordVersion,
    expectedLotVersion: lot.recordVersion,
    current: Object.freeze(current),
    proposed: Object.freeze(proposed),
    quantityEffect,
    costEffectMinorUnits,
    soldQuantity,
    transferredQuantity: transferred,
    availableQuantity,
    reversesAdjustmentId: reversalOfAdjustmentId,
    blockers: Object.freeze([...new Set(blockers)]),
    warnings: Object.freeze([...new Set(warnings)]),
    eligible: blockers.length === 0,
    proposal,
  });
}

export function normalizeCorrectionStateSnapshot(value, field = "state") {
  assertSafePurchaseReceivingInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InventoryCorrectionValidationError("INVALID_STATE_SNAPSHOT", `${field} must be an object.`);
  const allowed = new Set([
    "productReference", "productTitle", "productClassification", "condition", "disposition", "inventoryDispositionState",
    "quantity", "currency", "acquisitionCostMinorUnits", "unitAcquisitionCostsMinorUnits", "inventoryStatus", "lotStatus",
  ]);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new InventoryCorrectionValidationError("UNSUPPORTED_STATE_FIELD", `${field} contains an unsupported field.`, { field: unknown });
  const quantity = safeInteger(value.quantity, `${field}.quantity`, 0);
  const costs = Object.freeze((value.unitAcquisitionCostsMinorUnits || []).map((entry, index) => safeInteger(entry, `${field}.unitAcquisitionCostsMinorUnits[${index}]`, 0, Number.MAX_SAFE_INTEGER)));
  const total = safeInteger(value.acquisitionCostMinorUnits, `${field}.acquisitionCostMinorUnits`, 0, Number.MAX_SAFE_INTEGER);
  if (costs.length !== quantity || sumMinorUnits(costs) !== total) throw new InventoryCorrectionValidationError("STATE_COST_MISMATCH", `${field} exact unit costs do not reconcile.`);
  return Object.freeze({
    productReference: boundedText(value.productReference, `${field}.productReference`, { required: true }),
    productTitle: boundedText(value.productTitle, `${field}.productTitle`),
    productClassification: boundedText(value.productClassification, `${field}.productClassification`, { required: true, maximum: 128 }),
    condition: enumValue(value.condition, INVENTORY_CREATION_CONDITIONS, `${field}.condition`),
    disposition: enumValue(value.disposition, INVENTORY_CREATION_DISPOSITIONS, `${field}.disposition`),
    inventoryDispositionState: enumValue(value.inventoryDispositionState, INVENTORY_CORRECTION_DISPOSITIONS, `${field}.inventoryDispositionState`, INVENTORY_CORRECTION_DISPOSITIONS.AVAILABLE),
    quantity,
    currency: boundedText(value.currency, `${field}.currency`, { required: true, maximum: 3 }).toUpperCase(),
    acquisitionCostMinorUnits: total,
    unitAcquisitionCostsMinorUnits: costs,
    inventoryStatus: boundedText(value.inventoryStatus, `${field}.inventoryStatus`, { required: true, maximum: 128 }),
    lotStatus: boundedText(value.lotStatus, `${field}.lotStatus`, { required: true, maximum: 128 }),
  });
}

export function correctionCandidateSemantics(candidate) {
  return Object.freeze({
    candidateId: candidate.candidateId,
    category: candidate.category,
    eventKind: candidate.eventKind,
    applicationId: candidate.applicationId,
    inventoryItemId: candidate.inventoryItemId,
    inventoryLotId: candidate.inventoryLotId,
    idempotencyKey: candidate.idempotencyKey,
    reason: candidate.reason,
    quantityReason: candidate.quantityReason,
    current: candidate.current,
    proposed: candidate.proposed,
    quantityEffect: candidate.quantityEffect,
    costEffectMinorUnits: candidate.costEffectMinorUnits,
    reversesAdjustmentId: candidate.reversesAdjustmentId,
  });
}
