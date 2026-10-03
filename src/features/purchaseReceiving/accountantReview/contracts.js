import { canonicalStringify } from "../../backup/canonicalJson.js";
import {
  deriveEffectiveInventoryAdjustmentIds,
  isPhysicalInventoryReturnAdjustment,
} from "../inventoryCreation/contracts.js";
import {
  managedSaleReconciliationProjection,
  validateInventoryReconciliationState,
} from "../inventoryReconciliation/contracts.js";
import { INVENTORY_RECONCILIATION_CATEGORIES } from "../inventoryReconciliation/constants.js";
import { INVENTORY_CORRECTION_CATEGORIES } from "../inventoryCorrection/constants.js";
import { PURCHASE_EVENT_TYPES } from "../constants.js";
import { normalizePurchaseReceivingState } from "../repository.js";
import { assertSafePurchaseReceivingInput } from "../security.js";
import {
  ACCOUNTANT_REVIEW_CATEGORIES,
  ACCOUNTANT_REVIEW_FILTER_FIELDS,
  ACCOUNTANT_REVIEW_FILING_STATUSES,
  ACCOUNTANT_REVIEW_FORMAT,
  ACCOUNTANT_REVIEW_GRANULARITIES,
  ACCOUNTANT_REVIEW_MOVEMENT_TYPES,
  ACCOUNTANT_REVIEW_PERIOD_FLAGS,
  ACCOUNTANT_REVIEW_SAFETY,
  ACCOUNTANT_REVIEW_SEVERITIES,
} from "./constants.js";
import { compareReportingPeriods } from "./periods.js";

export class AccountantReviewValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AccountantReviewValidationError";
    this.code = code;
    this.details = details;
  }
}

const RETURN_EVENT_TYPES = new Set([
  PURCHASE_EVENT_TYPES.RETURN_INITIATED,
  PURCHASE_EVENT_TYPES.RETURN_COMPLETED,
]);

const RETURN_CORRECTION_CATEGORIES = new Set([
  INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER,
  INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN,
]);

const SEVERITY_ORDER = Object.freeze({
  [ACCOUNTANT_REVIEW_SEVERITIES.INFO]: 0,
  [ACCOUNTANT_REVIEW_SEVERITIES.REVIEW]: 1,
  [ACCOUNTANT_REVIEW_SEVERITIES.HIGH_ATTENTION]: 2,
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
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

function safeInteger(value, field, { signed = false } = {}) {
  if (!Number.isSafeInteger(value) || (!signed && value < 0)) {
    throw new AccountantReviewValidationError("INVALID_EXACT_VALUE", `${field} must be an exact safe integer.`, { field });
  }
  return value;
}

function safeSum(values, field) {
  const total = values.reduce((sum, value, index) => sum + BigInt(safeInteger(value, `${field}[${index}]`, { signed: true })), 0n);
  const result = Number(total);
  if (!Number.isSafeInteger(result)) {
    throw new AccountantReviewValidationError("EXACT_TOTAL_OUT_OF_RANGE", `${field} exceeds safe integer precision.`, { field });
  }
  return result;
}

function nullableSum(values, field) {
  return values.some((value) => value == null) ? null : safeSum(values, field);
}

function exactMajorToMinor(value, field) {
  if (Number.isSafeInteger(value)) return safeInteger(value * 100, field, { signed: true });
  const text = String(value ?? "").trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new AccountantReviewValidationError("INEXACT_MONEY", `${field} cannot be represented as integer minor units.`, { field });
  }
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [major, fraction = ""] = unsigned.split(".");
  const minor = (BigInt(major) * 100n + BigInt(fraction.padEnd(2, "0"))) * (negative ? -1n : 1n);
  const result = Number(minor);
  if (!Number.isSafeInteger(result)) {
    throw new AccountantReviewValidationError("EXACT_MONEY_OUT_OF_RANGE", `${field} exceeds safe integer precision.`, { field });
  }
  return result;
}

function optionalExactMajorToMinor(value, field) {
  if (value == null || value === "") return null;
  try {
    return exactMajorToMinor(value, field);
  } catch (error) {
    if (error instanceof AccountantReviewValidationError
      && ["INEXACT_MONEY", "EXACT_MONEY_OUT_OF_RANGE", "INVALID_EXACT_VALUE"].includes(error.code)) return null;
    throw error;
  }
}

function boundedText(value, field, { required = false, maximum = 500 } = {}) {
  if (value == null || value === "") {
    if (required) throw new AccountantReviewValidationError("REQUIRED_FIELD", `${field} is required.`, { field });
    return null;
  }
  const text = String(value).trim();
  if (!text || text.length > maximum) {
    throw new AccountantReviewValidationError("INVALID_TEXT", `${field} must be a bounded string.`, { field });
  }
  return text;
}

/**
 * The existing scanner intentionally accepts integer domain records only. Sale
 * display fields still include legacy decimal projections, so only finite
 * non-integer numbers are represented as strings for this key/value security
 * pass. No input values are used from this copy.
 */
const CANONICAL_PROPOSAL_DIGEST = /^(?:inventory-(?:correction|reconciliation)-proposal:[a-f0-9]{16}|inventory-adjustment:[a-f0-9]{16}:[a-f0-9]{16}:proposal)$/;
const CANONICAL_SEMANTIC_DIGEST = /^inventory-(?:adjustment|reconciliation)-semantics:[a-f0-9]{16}$/;

function isCanonicalDigestDerivative(path, field, value) {
  if (!/^\$\.(?:inventoryAdjustments|inventoryReconciliationEvents)\[\d+\]\.(?:proposalDigest|semanticDigest)$/.test(path)) return false;
  if (field === "proposalDigest") return CANONICAL_PROPOSAL_DIGEST.test(value);
  return field === "semanticDigest" && CANONICAL_SEMANTIC_DIGEST.test(value);
}

function securityShape(value, ancestors = new Set(), field = "", path = "$") {
  if (typeof value === "string" && isCanonicalDigestDerivative(path, field, value)) return "SCHEMA_VERIFIED_DIGEST";
  if (typeof value === "number" && Number.isFinite(value) && !Number.isInteger(value)) return "NON_INTEGER_DISPLAY_NUMBER";
  if (value == null || typeof value !== "object") return value;
  if (ancestors.has(value)) return value;
  ancestors.add(value);
  if (Array.isArray(value)) {
    const copy = value.map((entry, index) => securityShape(entry, ancestors, field, `${path}[${index}]`));
    ancestors.delete(value);
    return copy;
  }
  const copy = Object.create(Object.getPrototypeOf(value));
  for (const key of Object.keys(value)) {
    Object.defineProperty(copy, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: securityShape(value[key], ancestors, key, `${path}.${key}`),
    });
  }
  ancestors.delete(value);
  return copy;
}

function assertRelevantInventorySecurity(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new AccountantReviewValidationError("INVENTORY_STATE_REQUIRED", "Accountant Review requires a local Inventory state object.");
  }
  // Schema digests are verified by their canonical contracts below; masking
  // only those derivatives avoids treating an all-numeric digest as a card
  // candidate while the full state still receives key/value security review.
  assertSafePurchaseReceivingInput(securityShape(state));
}

function saleCountsAgainstInventory(sale = {}) {
  return !["draft", "cancelled"].includes(String(sale.status || "").trim().toLowerCase());
}

function saleDate(sale) {
  return boundedText(sale.saleDate, "Sale transaction date", { required: true, maximum: 64 });
}

function saleNetProceedsMinorUnits(sale) {
  if (Number.isSafeInteger(sale.netProceedsMinorUnits)) return safeInteger(sale.netProceedsMinorUnits, "Sale net proceeds", { signed: true });
  return optionalExactMajorToMinor(sale.netProceeds, "Sale net proceeds");
}

function saleGrossRevenueMinorUnits(sale) {
  if (Number.isSafeInteger(sale.grossSalePriceMinorUnits)) return safeInteger(sale.grossSalePriceMinorUnits, "Sale revenue", { signed: true });
  return optionalExactMajorToMinor(sale.grossSalePrice, "Sale revenue");
}

function reviewCategoryFor(event, effect, period) {
  if (event.category === INVENTORY_RECONCILIATION_CATEGORIES.PRIOR_CORRECTION_REVERSAL) {
    return ACCOUNTANT_REVIEW_CATEGORIES.RECONCILIATION_REVERSAL_REVIEW;
  }
  if (event.category.startsWith("TRANSFER_")) return ACCOUNTANT_REVIEW_CATEGORIES.TRANSFER_REVIEW_BLOCKED;
  if (effect?.originalProductReference !== effect?.correctedProductReference) {
    return ACCOUNTANT_REVIEW_CATEGORIES.PRODUCT_RECLASSIFICATION_REVIEW;
  }
  if (effect && effect.cogsDeltaMinorUnits !== 0) {
    return period.priorPeriodRelevant
      ? ACCOUNTANT_REVIEW_CATEGORIES.PRIOR_PERIOD_COGS_ADJUSTMENT
      : ACCOUNTANT_REVIEW_CATEGORIES.CURRENT_PERIOD_COGS_ADJUSTMENT;
  }
  if (event.category === INVENTORY_RECONCILIATION_CATEGORIES.RETURN_AFTER_SALE_RECONCILIATION) {
    return ACCOUNTANT_REVIEW_CATEGORIES.RETURN_ACCOUNTING_REVIEW;
  }
  if (event.costEffectMinorUnits !== 0) return ACCOUNTANT_REVIEW_CATEGORIES.INVENTORY_COST_REVIEW;
  return ACCOUNTANT_REVIEW_CATEGORIES.SALE_REPORTING_REVIEW;
}

function maxSeverity(values) {
  return values.reduce((current, candidate) => (
    SEVERITY_ORDER[candidate] > SEVERITY_ORDER[current] ? candidate : current
  ), ACCOUNTANT_REVIEW_SEVERITIES.INFO);
}

function purchaseContext(normalizedPurchaseState, physicalReturnAdjustments = []) {
  const purchases = new Map((normalizedPurchaseState?.purchases || []).map((purchase) => [purchase.id, purchase]));
  const events = normalizedPurchaseState?.purchaseEvents || [];
  const eventsByPurchase = new Map();
  for (const event of events) {
    const list = eventsByPurchase.get(event.purchaseId) || [];
    list.push(event);
    eventsByPurchase.set(event.purchaseId, list);
  }
  return {
    purchases,
    events,
    eventsByPurchase,
    purchaseStateAvailable: normalizedPurchaseState != null,
    physicalReturnPurchaseIds: new Set(physicalReturnAdjustments.map((adjustment) => adjustment.purchaseId)),
  };
}

function movementForPurchase(purchaseId, context, { forceReturn = false, event = null, physicalReturnAdjustment = null } = {}) {
  const events = context.eventsByPurchase.get(purchaseId) || [];
  const refundEvents = events.filter((entry) => entry.type === PURCHASE_EVENT_TYPES.REFUND_RECORDED);
  const returnEvents = events.filter((entry) => RETURN_EVENT_TYPES.has(entry.type));
  const hasRefund = refundEvents.length > 0 || event?.type === PURCHASE_EVENT_TYPES.REFUND_RECORDED;
  const hasReturn = forceReturn
    || context.physicalReturnPurchaseIds.has(purchaseId)
    || returnEvents.length > 0
    || RETURN_EVENT_TYPES.has(event?.type);
  if (hasRefund && hasReturn) return ACCOUNTANT_REVIEW_MOVEMENT_TYPES.REFUND_AND_RETURN;
  if (physicalReturnAdjustment) {
    return physicalReturnAdjustment.resultingState?.quantity > 0
      ? ACCOUNTANT_REVIEW_MOVEMENT_TYPES.PARTIAL_RETURN
      : ACCOUNTANT_REVIEW_MOVEMENT_TYPES.RETURN_ONLY;
  }
  if (event?.type === PURCHASE_EVENT_TYPES.REFUND_RECORDED) {
    const purchase = context.purchases.get(purchaseId);
    const total = purchase?.money?.grandTotal?.minorUnits;
    if (Number.isSafeInteger(event.amount?.minorUnits) && Number.isSafeInteger(total) && event.amount.minorUnits < total) {
      return ACCOUNTANT_REVIEW_MOVEMENT_TYPES.PARTIAL_REFUND;
    }
    return ACCOUNTANT_REVIEW_MOVEMENT_TYPES.REFUND_ONLY;
  }
  if (RETURN_EVENT_TYPES.has(event?.type)) {
    const purchase = context.purchases.get(purchaseId);
    const ordered = (purchase?.lineItems || []).reduce((sum, line) => sum + Number(line.quantityOrdered || 0), 0);
    if (Number.isSafeInteger(event.quantity) && Number.isSafeInteger(ordered) && event.quantity < ordered) {
      return ACCOUNTANT_REVIEW_MOVEMENT_TYPES.PARTIAL_RETURN;
    }
  }
  if (hasReturn) return ACCOUNTANT_REVIEW_MOVEMENT_TYPES.RETURN_ONLY;
  if (hasRefund) return ACCOUNTANT_REVIEW_MOVEMENT_TYPES.REFUND_ONLY;
  return ACCOUNTANT_REVIEW_MOVEMENT_TYPES.NONE;
}

function inventoryReferences(reconciliation, state) {
  const items = new Map(reconciliation.bundles.items.map((entry) => [entry.id, entry]));
  const lots = new Map(reconciliation.bundles.lots.map((entry) => [entry.id, entry]));
  const sales = new Map((state.sales || []).filter(saleCountsAgainstInventory).map((entry) => [entry.id, entry]));
  return { items, lots, sales };
}

function chainForSale(saleId, events) {
  return deepFreeze(events
    .flatMap((event) => event.affectedSales
      .filter((effect) => effect.saleId === saleId)
      .map((effect) => ({
        eventId: event.id,
        reconciliationSequence: event.reconciliationSequence,
        category: event.category,
        correctionDate: event.occurredAt,
        cogsAdjustmentMinorUnits: effect.cogsDeltaMinorUnits,
        originalCogsMinorUnits: effect.originalCogsMinorUnits,
        priorEffectiveCogsMinorUnits: effect.priorEffectiveCogsMinorUnits,
        correctedCogsMinorUnits: effect.correctedCogsMinorUnits,
        originalProductReference: effect.originalProductReference,
        correctedProductReference: effect.correctedProductReference,
        reversesReconciliationEventId: event.reversesReconciliationEventId,
      })))
    .sort((left, right) => left.reconciliationSequence - right.reconciliationSequence));
}

function saleReconciliationItems(reconciliation, state, context) {
  const refs = inventoryReferences(reconciliation, state);
  const items = [];
  for (const event of reconciliation.events) {
    const inventory = refs.items.get(event.inventoryItemId);
    const lot = refs.lots.get(event.inventoryLotId);
    for (const effect of event.affectedSales) {
      const sale = refs.sales.get(effect.saleId);
      if (!sale) {
        throw new AccountantReviewValidationError("SALE_REFERENCE_MISSING", "Accountant Review requires the immutable Sale referenced by a reconciliation.", { saleId: effect.saleId });
      }
      const period = compareReportingPeriods(saleDate(sale), event.occurredAt);
      const projection = managedSaleReconciliationProjection(sale, reconciliation.events);
      const netProceedsMinorUnits = saleNetProceedsMinorUnits(sale);
      const grossRevenueMinorUnits = saleGrossRevenueMinorUnits(sale);
      const originalProfitMinorUnits = netProceedsMinorUnits == null
        ? null
        : safeSum([netProceedsMinorUnits, -projection.originalCogsMinorUnits], "originalProfit");
      const priorEffectiveProfitMinorUnits = netProceedsMinorUnits == null
        ? null
        : safeSum([netProceedsMinorUnits, -effect.priorEffectiveCogsMinorUnits], "priorEffectiveProfit");
      const profitAdjustmentMinorUnits = -effect.cogsDeltaMinorUnits;
      const resultingEffectiveProfitMinorUnits = netProceedsMinorUnits == null
        ? null
        : safeSum([netProceedsMinorUnits, -effect.correctedCogsMinorUnits], "resultingEffectiveProfit");
      const currentEffectiveProfitMinorUnits = netProceedsMinorUnits == null
        ? null
        : safeSum([netProceedsMinorUnits, -projection.effectiveCogsMinorUnits], "currentEffectiveProfit");
      const forceReturn = event.category === INVENTORY_RECONCILIATION_CATEGORIES.RETURN_AFTER_SALE_RECONCILIATION
        || RETURN_CORRECTION_CATEGORIES.has(event.sourceCorrectionCategory);
      const movementClassification = movementForPurchase(event.purchaseId, context, { forceReturn });
      items.push({
        id: `accountant-review:${stableDigest({ eventId: event.id, saleId: sale.id })}`,
        recordType: "ACCOUNTANT_REVIEW_ITEM",
        authoritative: false,
        persisted: false,
        readOnly: true,
        sourceKind: "SALE_RECONCILIATION",
        category: reviewCategoryFor(event, effect, period),
        severity: period.severity,
        taxReviewFlag: period.primaryFlag,
        taxReviewFlags: period.flags,
        accountantReviewRecommended: period.priorPeriodRelevant,
        filingStatus: ACCOUNTANT_REVIEW_FILING_STATUSES.UNKNOWN,
        originalPeriod: period.original,
        correctionPeriod: period.correction,
        periodComparison: {
          sameDay: period.sameDay,
          sameMonth: period.sameMonth,
          sameQuarter: period.sameQuarter,
          sameYear: period.sameYear,
          priorPeriodRelevant: period.priorPeriodRelevant,
        },
        saleId: sale.id,
        saleDate: saleDate(sale),
        originalTransactionDate: saleDate(sale),
        correctionDate: event.occurredAt,
        reconciliationEventId: event.id,
        reconciliationCategory: event.category,
        purchaseId: event.purchaseId,
        receivingEventReferences: [...event.receivingEventReferences],
        inventoryItemId: event.inventoryItemId,
        inventoryLotId: event.inventoryLotId,
        lotId: event.inventoryLotId,
        retailer: inventory?.retailerId || inventory?.vendorName || context.purchases.get(event.purchaseId)?.retailerLabel || null,
        productReference: effect.correctedProductReference,
        originalProductReference: effect.originalProductReference,
        effectiveProductReference: chainForSale(sale.id, reconciliation.events).at(-1)?.correctedProductReference || effect.correctedProductReference,
        productTitle: inventory?.productTitle || lot?.productTitle || null,
        quantity: effect.quantity,
        currency: event.currency,
        grossRevenueMinorUnits,
        netProceedsMinorUnits,
        originalCogsMinorUnits: projection.originalCogsMinorUnits,
        originalRecordedCogsMinorUnits: projection.originalCogsMinorUnits,
        priorEffectiveCogsMinorUnits: effect.priorEffectiveCogsMinorUnits,
        reconciliationAdjustmentMinorUnits: effect.cogsDeltaMinorUnits,
        cogsAdjustmentMinorUnits: effect.cogsDeltaMinorUnits,
        reconciliationAdjustment: { minorUnits: effect.cogsDeltaMinorUnits, currency: event.currency },
        effectiveCogsMinorUnits: effect.correctedCogsMinorUnits,
        resultingEffectiveCogsMinorUnits: effect.correctedCogsMinorUnits,
        currentEffectiveCogsMinorUnits: projection.effectiveCogsMinorUnits,
        originalProfitMinorUnits,
        originalRecordedProfitMinorUnits: originalProfitMinorUnits,
        priorEffectiveProfitMinorUnits,
        profitAdjustmentMinorUnits,
        effectiveProfitMinorUnits: resultingEffectiveProfitMinorUnits,
        resultingEffectiveProfitMinorUnits,
        currentEffectiveProfitMinorUnits,
        lotOriginalCostMinorUnits: lot?.originalAcquisitionCostMinorUnits ?? event.previousState.acquisitionCostMinorUnits,
        lotCostAdjustmentMinorUnits: event.costEffectMinorUnits,
        lotEffectiveCostMinorUnits: lot?.acquisitionCostMinorUnits ?? event.resultingState.acquisitionCostMinorUnits,
        realizedCogsEffectMinorUnits: event.saleCogsEffectMinorUnits,
        remainingInventoryEffectMinorUnits: event.remainingInventoryCostEffectMinorUnits,
        movementClassification,
        physicalInventoryMoved: event.quantityEffect !== 0,
        reason: event.reason,
        warnings: [
          ...(netProceedsMinorUnits == null ? ["SALE_NET_PROCEEDS_NOT_EXACT"] : []),
          ...(grossRevenueMinorUnits == null ? ["SALE_GROSS_REVENUE_NOT_EXACT"] : []),
        ],
        reversalChain: chainForSale(sale.id, reconciliation.events),
        reversesReconciliationEventId: event.reversesReconciliationEventId,
      });
    }
  }
  return deepFreeze(items);
}

function purchaseReviewItems(context, inventoryRefs) {
  const items = [];
  for (const event of context.events) {
    if (event.type !== PURCHASE_EVENT_TYPES.REFUND_RECORDED && !RETURN_EVENT_TYPES.has(event.type)) continue;
    const purchase = context.purchases.get(event.purchaseId);
    if (!purchase) continue;
    const originalDate = purchase.purchasedAt || purchase.orderedAt || purchase.confirmedAt;
    const period = compareReportingPeriods(originalDate, event.occurredAt);
    const isRefund = event.type === PURCHASE_EVENT_TYPES.REFUND_RECORDED;
    const relatedLots = inventoryRefs.lots.filter((lot) => lot.purchaseId === purchase.id).map((lot) => lot.id).sort();
    items.push({
      id: `accountant-review:${stableDigest({ purchaseEventId: event.id })}`,
      recordType: "ACCOUNTANT_REVIEW_ITEM",
      authoritative: false,
      persisted: false,
      readOnly: true,
      sourceKind: "PURCHASE_EVENT",
      category: isRefund ? ACCOUNTANT_REVIEW_CATEGORIES.REFUND_ACCOUNTING_REVIEW : ACCOUNTANT_REVIEW_CATEGORIES.RETURN_ACCOUNTING_REVIEW,
      severity: period.severity,
      taxReviewFlag: period.primaryFlag,
      taxReviewFlags: period.flags,
      accountantReviewRecommended: period.priorPeriodRelevant,
      filingStatus: ACCOUNTANT_REVIEW_FILING_STATUSES.UNKNOWN,
      originalPeriod: period.original,
      correctionPeriod: period.correction,
      periodComparison: {
        sameDay: period.sameDay,
        sameMonth: period.sameMonth,
        sameQuarter: period.sameQuarter,
        sameYear: period.sameYear,
        priorPeriodRelevant: period.priorPeriodRelevant,
      },
      saleId: null,
      saleDate: null,
      originalTransactionDate: originalDate,
      correctionDate: event.occurredAt,
      reconciliationEventId: null,
      purchaseEventId: event.id,
      reconciliationCategory: null,
      purchaseId: purchase.id,
      receivingEventReferences: [],
      inventoryItemId: null,
      inventoryLotId: relatedLots.length === 1 ? relatedLots[0] : null,
      lotId: relatedLots.length === 1 ? relatedLots[0] : null,
      retailer: purchase.retailerLabel || purchase.retailerId || purchase.vendorName || null,
      productReference: purchase.lineItems.length === 1 ? purchase.lineItems[0].productReference : null,
      originalProductReference: null,
      effectiveProductReference: null,
      productTitle: purchase.lineItems.length === 1 ? purchase.lineItems[0].title : null,
      quantity: event.quantity,
      currency: purchase.currency,
      grossRevenueMinorUnits: null,
      netProceedsMinorUnits: null,
      originalCogsMinorUnits: null,
      originalRecordedCogsMinorUnits: null,
      priorEffectiveCogsMinorUnits: null,
      reconciliationAdjustmentMinorUnits: 0,
      cogsAdjustmentMinorUnits: 0,
      reconciliationAdjustment: { minorUnits: 0, currency: purchase.currency },
      effectiveCogsMinorUnits: null,
      resultingEffectiveCogsMinorUnits: null,
      currentEffectiveCogsMinorUnits: null,
      originalProfitMinorUnits: null,
      originalRecordedProfitMinorUnits: null,
      priorEffectiveProfitMinorUnits: null,
      profitAdjustmentMinorUnits: 0,
      effectiveProfitMinorUnits: null,
      resultingEffectiveProfitMinorUnits: null,
      currentEffectiveProfitMinorUnits: null,
      refundAmountMinorUnits: isRefund ? event.amount?.minorUnits ?? null : null,
      movementClassification: movementForPurchase(purchase.id, context, { event }),
      physicalInventoryMoved: false,
      reason: event.reason || event.summary,
      warnings: [],
      reversalChain: [],
      reversesReconciliationEventId: null,
    });
  }
  return deepFreeze(items);
}

function physicalInventoryReturnAdjustments(reconciliation) {
  const effectiveIds = new Set(deriveEffectiveInventoryAdjustmentIds(reconciliation.bundles.adjustments));
  return reconciliation.bundles.adjustments.filter((adjustment) => (
    effectiveIds.has(adjustment.id) && isPhysicalInventoryReturnAdjustment(adjustment)
  ));
}

function effectiveInventoryCostCorrections(reconciliation) {
  const effectiveIds = new Set(deriveEffectiveInventoryAdjustmentIds(reconciliation.bundles.adjustments));
  return reconciliation.bundles.adjustments.filter((adjustment) => (
    effectiveIds.has(adjustment.id)
    && adjustment.correctionCategory === INVENTORY_CORRECTION_CATEGORIES.ACQUISITION_COST_CORRECTION
  ));
}

function inventoryAdjustmentReviewItems(reconciliation, context, physicalReturns, costCorrections) {
  const representedAdjustmentIds = new Set(reconciliation.events.map((event) => event.sourceInventoryAdjustmentId).filter(Boolean));
  const itemsById = new Map(reconciliation.bundles.items.map((item) => [item.id, item]));
  const lotsById = new Map(reconciliation.bundles.lots.map((lot) => [lot.id, lot]));
  const items = [];
  const reviewableAdjustments = [...physicalReturns, ...costCorrections]
    .sort((left, right) => (left.adjustmentSequence || 0) - (right.adjustmentSequence || 0) || left.id.localeCompare(right.id));
  for (const adjustment of reviewableAdjustments) {
    if (representedAdjustmentIds.has(adjustment.id)) continue;
    const physicalReturn = isPhysicalInventoryReturnAdjustment(adjustment);
    if (physicalReturn && (!Number.isSafeInteger(adjustment.quantityEffect) || adjustment.quantityEffect >= 0)) {
      throw new AccountantReviewValidationError("INVALID_RETURN_EFFECT", "A physical Inventory return review requires an exact negative quantity effect.", { adjustmentId: adjustment.id });
    }
    const purchase = context.purchases.get(adjustment.purchaseId);
    if (!purchase) {
      throw new AccountantReviewValidationError("PURCHASE_REFERENCE_MISSING", "Accountant Review requires the canonical Purchase referenced by an Inventory adjustment.", { purchaseId: adjustment.purchaseId });
    }
    const inventory = itemsById.get(adjustment.inventoryItemId);
    const lot = lotsById.get(adjustment.inventoryLotId);
    if (!inventory || !lot) {
      throw new AccountantReviewValidationError("INVENTORY_RETURN_REFERENCE_MISSING", "Accountant Review requires the canonical Inventory item and lot referenced by an Inventory adjustment.", { adjustmentId: adjustment.id });
    }
    const originalDate = purchase.purchasedAt || purchase.orderedAt || purchase.confirmedAt;
    const period = compareReportingPeriods(originalDate, adjustment.occurredAt);
    items.push({
      id: `accountant-review:${stableDigest({ inventoryAdjustmentId: adjustment.id })}`,
      recordType: "ACCOUNTANT_REVIEW_ITEM",
      authoritative: false,
      persisted: false,
      readOnly: true,
      sourceKind: physicalReturn ? "INVENTORY_DISPOSITION" : "INVENTORY_COST_CORRECTION",
      category: physicalReturn ? ACCOUNTANT_REVIEW_CATEGORIES.RETURN_ACCOUNTING_REVIEW : ACCOUNTANT_REVIEW_CATEGORIES.INVENTORY_COST_REVIEW,
      severity: period.severity,
      taxReviewFlag: period.primaryFlag,
      taxReviewFlags: period.flags,
      accountantReviewRecommended: period.priorPeriodRelevant,
      filingStatus: ACCOUNTANT_REVIEW_FILING_STATUSES.UNKNOWN,
      originalPeriod: period.original,
      correctionPeriod: period.correction,
      periodComparison: {
        sameDay: period.sameDay,
        sameMonth: period.sameMonth,
        sameQuarter: period.sameQuarter,
        sameYear: period.sameYear,
        priorPeriodRelevant: period.priorPeriodRelevant,
      },
      saleId: null,
      saleDate: null,
      originalTransactionDate: originalDate,
      correctionDate: adjustment.occurredAt,
      reconciliationEventId: null,
      purchaseEventId: null,
      inventoryAdjustmentId: adjustment.id,
      reconciliationCategory: null,
      purchaseId: purchase.id,
      receivingEventReferences: [...adjustment.receivingEventReferences],
      inventoryItemId: inventory.id,
      inventoryLotId: lot.id,
      lotId: lot.id,
      retailer: inventory.retailerId || inventory.vendorName || purchase.retailerLabel || purchase.retailerId || purchase.vendorName || null,
      productReference: adjustment.resultingProductReference || adjustment.productReference,
      originalProductReference: adjustment.productReference,
      effectiveProductReference: adjustment.resultingProductReference || adjustment.productReference,
      productTitle: adjustment.resultingState?.productTitle || inventory.productTitle || lot.productTitle || null,
      quantity: physicalReturn ? Math.abs(adjustment.quantityEffect) : adjustment.previousState.quantity,
      currency: adjustment.currency,
      grossRevenueMinorUnits: null,
      netProceedsMinorUnits: null,
      originalCogsMinorUnits: null,
      originalRecordedCogsMinorUnits: null,
      priorEffectiveCogsMinorUnits: null,
      reconciliationAdjustmentMinorUnits: 0,
      cogsAdjustmentMinorUnits: 0,
      reconciliationAdjustment: { minorUnits: 0, currency: adjustment.currency },
      effectiveCogsMinorUnits: null,
      resultingEffectiveCogsMinorUnits: null,
      currentEffectiveCogsMinorUnits: null,
      originalProfitMinorUnits: null,
      originalRecordedProfitMinorUnits: null,
      priorEffectiveProfitMinorUnits: null,
      profitAdjustmentMinorUnits: 0,
      effectiveProfitMinorUnits: null,
      resultingEffectiveProfitMinorUnits: null,
      currentEffectiveProfitMinorUnits: null,
      refundAmountMinorUnits: null,
      inventoryCostAdjustmentMinorUnits: adjustment.costEffectMinorUnits,
      remainingInventoryEffectMinorUnits: adjustment.costEffectMinorUnits,
      movementClassification: physicalReturn
        ? movementForPurchase(purchase.id, context, { physicalReturnAdjustment: adjustment })
        : ACCOUNTANT_REVIEW_MOVEMENT_TYPES.NONE,
      physicalInventoryMoved: physicalReturn,
      reason: adjustment.reason,
      warnings: [],
      reversalChain: [],
      reversesReconciliationEventId: null,
      reversesAdjustmentId: adjustment.reversesAdjustmentId,
    });
  }
  return deepFreeze(items);
}

function buildSaleReviews(items, refs, events) {
  const bySale = new Map();
  for (const item of items.filter((entry) => entry.saleId)) {
    const related = bySale.get(item.saleId) || [];
    related.push(item);
    bySale.set(item.saleId, related);
  }
  const reviews = [];
  for (const [saleId, related] of bySale) {
    const sale = refs.sales.get(saleId);
    const projection = managedSaleReconciliationProjection(sale, events);
    const netProceedsMinorUnits = saleNetProceedsMinorUnits(sale);
    const grossRevenueMinorUnits = saleGrossRevenueMinorUnits(sale);
    const chain = chainForSale(saleId, events);
    const latest = related.slice().sort((left, right) => Date.parse(left.correctionDate) - Date.parse(right.correctionDate)).at(-1);
    reviews.push({
      saleId,
      saleDate: saleDate(sale),
      productReference: latest.productReference,
      originalProductReference: chain[0]?.originalProductReference || latest.originalProductReference,
      effectiveProductReference: chain.at(-1)?.correctedProductReference || latest.productReference,
      quantity: safeInteger(Number(sale.quantitySold), "Sale quantity"),
      currency: latest.currency,
      grossRevenueMinorUnits,
      netProceedsMinorUnits,
      originalCogsMinorUnits: projection.originalCogsMinorUnits,
      originalRecordedCogsMinorUnits: projection.originalCogsMinorUnits,
      reconciliationAdjustmentMinorUnits: projection.cogsAdjustmentMinorUnits,
      cogsAdjustmentMinorUnits: projection.cogsAdjustmentMinorUnits,
      reconciliationAdjustment: { minorUnits: projection.cogsAdjustmentMinorUnits, currency: latest.currency },
      effectiveCogsMinorUnits: projection.effectiveCogsMinorUnits,
      currentEffectiveCogsMinorUnits: projection.effectiveCogsMinorUnits,
      originalProfitMinorUnits: netProceedsMinorUnits == null
        ? null
        : safeSum([netProceedsMinorUnits, -projection.originalCogsMinorUnits], "Sale original profit"),
      profitAdjustmentMinorUnits: -projection.cogsAdjustmentMinorUnits,
      effectiveProfitMinorUnits: netProceedsMinorUnits == null
        ? null
        : safeSum([netProceedsMinorUnits, -projection.effectiveCogsMinorUnits], "Sale effective profit"),
      currentEffectiveProfitMinorUnits: netProceedsMinorUnits == null
        ? null
        : safeSum([netProceedsMinorUnits, -projection.effectiveCogsMinorUnits], "Sale effective profit"),
      originalPeriod: related[0].originalPeriod,
      latestCorrectionPeriod: latest.correctionPeriod,
      severity: maxSeverity(related.map((entry) => entry.severity)),
      taxReviewFlags: [...new Set(related.flatMap((entry) => entry.taxReviewFlags))],
      reconciliationEventIds: [...new Set(related.map((entry) => entry.reconciliationEventId))],
      inventoryLotIds: [...new Set(related.map((entry) => entry.inventoryLotId))],
      reversalChain: chain,
      warnings: [
        ...(netProceedsMinorUnits == null ? ["SALE_NET_PROCEEDS_NOT_EXACT"] : []),
        ...(grossRevenueMinorUnits == null ? ["SALE_GROSS_REVENUE_NOT_EXACT"] : []),
      ],
      historicalSaleMutable: false,
    });
  }
  return deepFreeze(reviews.sort((left, right) => right.saleDate.localeCompare(left.saleDate) || left.saleId.localeCompare(right.saleId)));
}

function buildLotReviews(items, refs, events, adjustments) {
  const lotIds = [...new Set(items.map((entry) => entry.inventoryLotId).filter(Boolean))];
  const reviews = lotIds.map((lotId) => {
    const lot = refs.lots.get(lotId);
    if (!lot) throw new AccountantReviewValidationError("LOT_REFERENCE_MISSING", "Accountant Review requires its canonical acquisition lot.", { lotId });
    const relatedEvents = events
      .filter((event) => event.inventoryLotId === lotId)
      .sort((left, right) => left.reconciliationSequence - right.reconciliationSequence);
    const reconciliationAdjustmentIds = new Set(relatedEvents.map((event) => event.sourceInventoryAdjustmentId));
    const relatedAdjustments = adjustments
      .filter((adjustment) => adjustment.inventoryLotId === lotId)
      .sort((left, right) => (left.adjustmentSequence || 0) - (right.adjustmentSequence || 0)
        || String(left.id).localeCompare(String(right.id)));
    const firstReconciliationAdjustment = relatedAdjustments.find((adjustment) => reconciliationAdjustmentIds.has(adjustment.id));
    const firstReconciliationSequence = firstReconciliationAdjustment?.adjustmentSequence ?? Number.MAX_SAFE_INTEGER;
    const priorCorrections = relatedAdjustments.filter((adjustment) => (
      !reconciliationAdjustmentIds.has(adjustment.id)
      && (adjustment.adjustmentSequence || 0) < firstReconciliationSequence
    ));
    const otherAdjustments = relatedAdjustments.filter((adjustment) => (
      !reconciliationAdjustmentIds.has(adjustment.id)
      && (adjustment.adjustmentSequence || 0) >= firstReconciliationSequence
    ));
    const relatedItems = items.filter((item) => item.inventoryLotId === lotId);
    const relatedSales = [...refs.sales.values()].filter((sale) => sale.lotId === lotId || sale.inventoryItemId === lot.inventoryItemId);
    const soldQuantity = safeSum(relatedSales.map((sale) => safeInteger(Number(sale.quantitySold), "Sale quantity")), "Lot sold quantity");
    const costDelta = safeSum(relatedEvents.map((event) => event.costEffectMinorUnits), "Lot cost adjustments");
    const realizedDelta = safeSum(relatedEvents.map((event) => event.saleCogsEffectMinorUnits), "Lot realized COGS adjustments");
    const remainingDelta = safeSum(relatedEvents.map((event) => event.remainingInventoryCostEffectMinorUnits), "Lot remaining cost adjustments");
    const latestReconciliationDate = relatedEvents
      .map((event) => event.occurredAt)
      .sort((left, right) => Date.parse(left) - Date.parse(right))
      .at(-1) || null;
    const priorCorrectionEffectMinorUnits = safeSum(priorCorrections.map((adjustment) => adjustment.costEffectMinorUnits), "Lot pre-reconciliation correction effect");
    const preReconciliationCostMinorUnits = safeSum(
      [lot.originalAcquisitionCostMinorUnits, priorCorrectionEffectMinorUnits],
      "Lot pre-reconciliation cost",
    );
    const otherInventoryAdjustmentMinorUnits = safeSum(otherAdjustments.map((adjustment) => adjustment.costEffectMinorUnits), "Lot other Inventory adjustments");
    const allRecordedAdjustmentMinorUnits = safeSum(relatedAdjustments.map((adjustment) => adjustment.costEffectMinorUnits), "Lot recorded adjustments");
    const totalEffectiveAdjustmentMinorUnits = safeSum(
      [lot.acquisitionCostMinorUnits, -lot.originalAcquisitionCostMinorUnits],
      "Lot total effective adjustment",
    );
    if (safeSum([realizedDelta, remainingDelta], "Lot cost conservation") !== costDelta
      || (relatedEvents.length > 0 && relatedEvents[0].previousState.acquisitionCostMinorUnits !== preReconciliationCostMinorUnits)
      || safeSum([preReconciliationCostMinorUnits, costDelta, otherInventoryAdjustmentMinorUnits], "Lot effective reconciliation cost") !== lot.acquisitionCostMinorUnits
      || safeSum([lot.originalAcquisitionCostMinorUnits, allRecordedAdjustmentMinorUnits], "Lot adjustment history") !== lot.acquisitionCostMinorUnits) {
      throw new AccountantReviewValidationError("LOT_COST_CONSERVATION_FAILED", "Lot reconciliation effects do not preserve exact acquisition cost.", { lotId });
    }
    return {
      inventoryLotId: lotId,
      lotId,
      inventoryItemId: lot.inventoryItemId,
      purchaseId: lot.purchaseId,
      receivingEventReferences: [...lot.receivingEventReferences],
      retailer: lot.retailerId || lot.vendorName || null,
      productReference: lot.productReference,
      productTitle: lot.productTitle,
      currency: lot.currency,
      originalLotCostMinorUnits: lot.originalAcquisitionCostMinorUnits,
      preReconciliationCostMinorUnits,
      priorCorrectionEffectMinorUnits,
      reconciliationAdjustmentMinorUnits: costDelta,
      otherInventoryAdjustmentMinorUnits,
      laterInventoryAdjustmentMinorUnits: otherInventoryAdjustmentMinorUnits,
      totalEffectiveAdjustmentMinorUnits,
      effectiveLotCostMinorUnits: lot.acquisitionCostMinorUnits,
      realizedCogsEffectMinorUnits: realizedDelta,
      remainingInventoryEffectMinorUnits: remainingDelta,
      originalQuantity: lot.originalQuantity,
      currentQuantity: lot.quantity,
      soldQuantity,
      remainingAvailableQuantity: Math.max(0, lot.quantity - soldQuantity),
      reconciliationEventIds: relatedEvents.map((entry) => entry.id),
      otherInventoryAdjustmentIds: otherAdjustments.map((entry) => entry.id),
      latestReconciliationDate,
      reviewItemIds: relatedItems.map((entry) => entry.id),
      severity: maxSeverity(relatedItems.map((entry) => entry.severity)),
      exactCostConserved: true,
    };
  });
  return deepFreeze(reviews.sort((left, right) => left.inventoryLotId.localeCompare(right.inventoryLotId)));
}

function summaryForPeriod(granularity, key, currency, saleReviews, items) {
  const keyField = granularity === ACCOUNTANT_REVIEW_GRANULARITIES.MONTH
    ? "monthKey"
    : granularity === ACCOUNTANT_REVIEW_GRANULARITIES.QUARTER
      ? "quarterKey"
      : "yearKey";
  const sales = saleReviews.filter((review) => review.originalPeriod[keyField] === key && review.currency === currency);
  const saleIds = new Set(sales.map((entry) => entry.saleId));
  const relatedItems = items.filter((item) => item.saleId && saleIds.has(item.saleId));
  return {
    granularity,
    periodKey: key,
    currency,
    originalCogsMinorUnits: safeSum(sales.map((entry) => entry.originalCogsMinorUnits), `${key}.originalCogs`),
    reconciliationAdjustmentMinorUnits: safeSum(sales.map((entry) => entry.reconciliationAdjustmentMinorUnits), `${key}.adjustment`),
    currentEffectiveCogsMinorUnits: safeSum(sales.map((entry) => entry.effectiveCogsMinorUnits), `${key}.effectiveCogs`),
    originalProfitMinorUnits: nullableSum(sales.map((entry) => entry.originalProfitMinorUnits), `${key}.originalProfit`),
    profitAdjustmentMinorUnits: safeSum(sales.map((entry) => entry.profitAdjustmentMinorUnits), `${key}.profitAdjustment`),
    currentEffectiveProfitMinorUnits: nullableSum(sales.map((entry) => entry.effectiveProfitMinorUnits), `${key}.effectiveProfit`),
    saleCount: sales.length,
    reviewItemCount: relatedItems.length,
    affectedLotCount: new Set(relatedItems.map((entry) => entry.inventoryLotId)).size,
    correctionPeriodKeys: [...new Set(relatedItems.map((entry) => entry.correctionPeriod[keyField]))].sort(),
    label: "Current projection including later corrections",
  };
}

function buildPeriodSummaries(saleReviews, items) {
  const groups = {};
  for (const granularity of Object.values(ACCOUNTANT_REVIEW_GRANULARITIES)) {
    const keyField = granularity === ACCOUNTANT_REVIEW_GRANULARITIES.MONTH
      ? "monthKey"
      : granularity === ACCOUNTANT_REVIEW_GRANULARITIES.QUARTER
        ? "quarterKey"
        : "yearKey";
    const periodCurrencies = new Map();
    for (const review of saleReviews) {
      const key = review.originalPeriod[keyField];
      const currencies = periodCurrencies.get(key) || new Set();
      currencies.add(review.currency);
      periodCurrencies.set(key, currencies);
    }
    groups[`${granularity.toLowerCase()}s`] = [...periodCurrencies]
      .flatMap(([key, currencies]) => [...currencies].sort().map((currency) => summaryForPeriod(granularity, key, currency, saleReviews, items)))
      .sort((left, right) => left.periodKey.localeCompare(right.periodKey) || left.currency.localeCompare(right.currency));
  }
  return deepFreeze(groups);
}

export function normalizeAccountantReviewFilters(value = {}) {
  assertSafePurchaseReceivingInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountantReviewValidationError("INVALID_FILTERS", "Accountant Review filters must be an object.");
  }
  const unknown = Object.keys(value).find((key) => !ACCOUNTANT_REVIEW_FILTER_FIELDS.includes(key));
  if (unknown) throw new AccountantReviewValidationError("UNSUPPORTED_FILTER", `${unknown} is not an Accountant Review filter.`, { field: unknown });
  const text = (field, maximum = 500) => boundedText(value[field], field, { maximum });
  const year = text("year", 4);
  const quarter = text("quarter", 7)?.toUpperCase() || null;
  const month = text("month", 7);
  if (year && !/^\d{4}$/.test(year)) throw new AccountantReviewValidationError("INVALID_YEAR_FILTER", "year must be YYYY.");
  if (quarter && !/^\d{4}-Q[1-4]$/.test(quarter)) throw new AccountantReviewValidationError("INVALID_QUARTER_FILTER", "quarter must be YYYY-Q1 through YYYY-Q4.");
  if (month && !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) throw new AccountantReviewValidationError("INVALID_MONTH_FILTER", "month must be YYYY-MM.");
  const category = text("category", 100)?.toUpperCase() || null;
  const severity = text("severity", 100)?.toUpperCase() || null;
  if (category && !Object.values(ACCOUNTANT_REVIEW_CATEGORIES).includes(category)) throw new AccountantReviewValidationError("INVALID_CATEGORY_FILTER", "category is unsupported.");
  if (severity && !Object.values(ACCOUNTANT_REVIEW_SEVERITIES).includes(severity)) throw new AccountantReviewValidationError("INVALID_SEVERITY_FILTER", "severity is unsupported.");
  return deepFreeze({
    year: year || null,
    quarter,
    month: month || null,
    retailer: text("retailer"),
    productReference: text("productReference"),
    saleId: text("saleId"),
    category,
    severity,
  });
}

function textMatches(value, expected) {
  return !expected || String(value || "").trim().toLocaleLowerCase() === expected.trim().toLocaleLowerCase();
}

export function filterAccountantReviewItems(items = [], inputFilters = {}) {
  assertSafePurchaseReceivingInput(securityShape(items));
  if (!Array.isArray(items)) throw new AccountantReviewValidationError("INVALID_REVIEW_ITEMS", "Accountant Review items must be an array.");
  const filters = normalizeAccountantReviewFilters(inputFilters);
  return deepFreeze(items.filter((item) => {
    const matchesYear = !filters.year || item.originalPeriod.yearKey === filters.year || item.correctionPeriod.yearKey === filters.year;
    const matchesQuarter = !filters.quarter || item.originalPeriod.quarterKey === filters.quarter || item.correctionPeriod.quarterKey === filters.quarter;
    const matchesMonth = !filters.month || item.originalPeriod.monthKey === filters.month || item.correctionPeriod.monthKey === filters.month;
    return matchesYear && matchesQuarter && matchesMonth
      && textMatches(item.retailer, filters.retailer)
      && textMatches(item.productReference, filters.productReference)
      && textMatches(item.saleId, filters.saleId)
      && textMatches(item.category, filters.category)
      && textMatches(item.severity, filters.severity);
  }));
}

function filterOptions(items) {
  const values = (selector) => [...new Set(items.map(selector).filter(Boolean))].sort();
  return deepFreeze({
    years: values((item) => item.originalPeriod.yearKey).concat(values((item) => item.correctionPeriod.yearKey)).filter((value, index, list) => list.indexOf(value) === index).sort(),
    quarters: values((item) => item.originalPeriod.quarterKey).concat(values((item) => item.correctionPeriod.quarterKey)).filter((value, index, list) => list.indexOf(value) === index).sort(),
    months: values((item) => item.originalPeriod.monthKey).concat(values((item) => item.correctionPeriod.monthKey)).filter((value, index, list) => list.indexOf(value) === index).sort(),
    retailers: values((item) => item.retailer),
    productReferences: values((item) => item.productReference),
    saleIds: values((item) => item.saleId),
    categories: values((item) => item.category),
    severities: values((item) => item.severity),
  });
}

function buildSummary(items, saleReviews, lotReviews, { filtered = false } = {}) {
  const saleItems = items.filter((item) => item.saleId);
  const currencies = [...new Set(saleReviews.map((entry) => entry.currency))].sort();
  const currencySummaries = currencies.map((currency) => {
    const reviews = saleReviews.filter((entry) => entry.currency === currency);
    const reviewIds = new Set(reviews.map((entry) => entry.saleId));
    const adjustments = saleItems.filter((entry) => entry.currency === currency && reviewIds.has(entry.saleId));
    return {
      currency,
      salesAffected: reviews.length,
      netCogsAdjustmentMinorUnits: safeSum(adjustments.map((entry) => entry.reconciliationAdjustmentMinorUnits), `${currency} summary COGS adjustment`),
      originalCogsMinorUnits: filtered ? null : safeSum(reviews.map((entry) => entry.originalCogsMinorUnits), `${currency} summary original COGS`),
      currentEffectiveCogsMinorUnits: filtered ? null : safeSum(reviews.map((entry) => entry.effectiveCogsMinorUnits), `${currency} summary effective COGS`),
      originalProfitMinorUnits: filtered ? null : nullableSum(reviews.map((entry) => entry.originalProfitMinorUnits), `${currency} summary original profit`),
      currentEffectiveProfitMinorUnits: filtered ? null : nullableSum(reviews.map((entry) => entry.effectiveProfitMinorUnits), `${currency} summary effective profit`),
    };
  });
  const single = currencySummaries.length === 1 ? currencySummaries[0] : null;
  return deepFreeze({
    reviewItemCount: items.length,
    scope: filtered ? "FILTERED_REVIEW_ITEMS" : "FULL_CURRENT_PROJECTION",
    filtered,
    historicalProjectionAvailable: !filtered,
    priorPeriodAdjustments: items.filter((item) => item.periodComparison.priorPeriodRelevant).length,
    currentPeriodAdjustments: items.filter((item) => !item.periodComparison.priorPeriodRelevant).length,
    priorYearItems: items.filter((item) => item.taxReviewFlag === ACCOUNTANT_REVIEW_PERIOD_FLAGS.PRIOR_YEAR_REVIEW).length,
    itemsNeedingReview: items.filter((item) => item.severity !== ACCOUNTANT_REVIEW_SEVERITIES.INFO).length,
    highAttentionItems: items.filter((item) => item.severity === ACCOUNTANT_REVIEW_SEVERITIES.HIGH_ATTENTION).length,
    salesAffected: saleReviews.length,
    lotsAffected: lotReviews.length,
    currency: single?.currency || null,
    mixedCurrencies: currencySummaries.length > 1,
    currencySummaries,
    netCogsAdjustmentMinorUnits: single?.netCogsAdjustmentMinorUnits ?? (currencySummaries.length ? null : 0),
    originalCogsMinorUnits: single?.originalCogsMinorUnits ?? (currencySummaries.length ? null : 0),
    currentEffectiveCogsMinorUnits: single?.currentEffectiveCogsMinorUnits ?? (currencySummaries.length ? null : 0),
    originalProfitMinorUnits: single?.originalProfitMinorUnits ?? (currencySummaries.length ? null : 0),
    currentEffectiveProfitMinorUnits: single?.currentEffectiveProfitMinorUnits ?? (currencySummaries.length ? null : 0),
  });
}

/**
 * Builds a regenerable, deeply frozen read-only projection. It has no repository,
 * storage, network, export, tax-filing, or mutation capability.
 */
export function deriveAccountantReviewPreview(input = {}, inputFilters = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AccountantReviewValidationError("REVIEW_INPUT_REQUIRED", "Accountant Review requires a local state bundle.");
  }
  const unknownInput = Object.keys(input).find((key) => !["inventoryState", "purchaseReceivingState"].includes(key));
  if (unknownInput) throw new AccountantReviewValidationError("UNSUPPORTED_REVIEW_INPUT", `${unknownInput} cannot supply Accountant Review authority.`, { field: unknownInput });
  assertRelevantInventorySecurity(input.inventoryState);
  const reconciliation = validateInventoryReconciliationState(input.inventoryState, { allowIncomplete: true });
  const normalizedPurchaseState = input.purchaseReceivingState == null
    ? null
    : normalizePurchaseReceivingState(input.purchaseReceivingState);
  const physicalReturns = physicalInventoryReturnAdjustments(reconciliation);
  const inventoryCostCorrections = effectiveInventoryCostCorrections(reconciliation);
  const context = purchaseContext(normalizedPurchaseState, physicalReturns);
  const refs = inventoryReferences(reconciliation, input.inventoryState);
  const allItems = deepFreeze([
    ...saleReconciliationItems(reconciliation, input.inventoryState, context),
    ...inventoryAdjustmentReviewItems(reconciliation, context, physicalReturns, inventoryCostCorrections),
    ...purchaseReviewItems(context, reconciliation.bundles),
  ].sort((left, right) => Date.parse(right.correctionDate) - Date.parse(left.correctionDate) || left.id.localeCompare(right.id)));
  const filters = normalizeAccountantReviewFilters(inputFilters);
  const filtered = Object.values(filters).some(Boolean);
  const items = filterAccountantReviewItems(allItems, filters);
  const visibleSaleIds = new Set(items.map((entry) => entry.saleId).filter(Boolean));
  const visibleLotIds = new Set(items.map((entry) => entry.inventoryLotId).filter(Boolean));
  const allSaleReviews = buildSaleReviews(allItems, refs, reconciliation.events);
  const allLotReviews = buildLotReviews(allItems, refs, reconciliation.events, reconciliation.bundles.adjustments);
  const saleReviews = deepFreeze(allSaleReviews.filter((entry) => visibleSaleIds.has(entry.saleId)));
  const lotReviews = deepFreeze(allLotReviews.filter((entry) => visibleLotIds.has(entry.inventoryLotId)));
  return deepFreeze({
    format: ACCOUNTANT_REVIEW_FORMAT,
    recordType: "ACCOUNTANT_REVIEW_PREVIEW",
    ...ACCOUNTANT_REVIEW_SAFETY,
    filingStatus: ACCOUNTANT_REVIEW_FILING_STATUSES.UNKNOWN,
    historicalSnapshotMode: "ORIGINAL_RECORDED_AND_CURRENT_EFFECTIVE",
    originalTransactionPeriodEqualsCorrectionPeriod: false,
    originalCogsEqualsReconciliationAdjustment: false,
    historicalRecordEqualsCurrentProjection: false,
    accountantReviewEqualsAccountingMutation: false,
    items,
    saleReviews,
    lotReviews,
    periodSummaries: filtered
      ? deepFreeze({ months: [], quarters: [], years: [] })
      : buildPeriodSummaries(saleReviews, items),
    summary: buildSummary(items, saleReviews, lotReviews, { filtered }),
    filterOptions: filterOptions(allItems),
    activeFilters: filters,
    unfilteredItemCount: allItems.length,
    advisory: "This read-only projection may warrant accountant review; it does not determine tax treatment or filing requirements.",
  });
}
