import { allocatePurchaseCosts } from "./allocation.js";
import {
  PRODUCT_MATCH_STATES,
  PURCHASE_CONFIDENCE_LEVELS,
  PURCHASE_DRAFT_STATES,
  PURCHASE_FULFILLMENT_TYPES,
  PURCHASE_LIFECYCLE_STATES,
  PURCHASE_PROVENANCE_TYPES,
  PURCHASE_RECEIPT_STATES,
  PURCHASE_RECEIVING_FORMAT,
  PURCHASE_RECEIVING_LIMITS,
  PURCHASE_SOURCE_TYPES,
  RECEIVING_DISCREPANCIES,
  RECEIVING_EVENT_STATES,
} from "./constants.js";
import { multiplyMoney, normalizePurchaseMoney, normalizePurchaseMoneySummary } from "./money.js";
import { normalizeProductIdentity } from "./productMatching.js";
import { assertSafePurchaseReceivingInput, sanitizePurchaseReceivingNote } from "./security.js";

export class PurchaseReceivingValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PurchaseReceivingValidationError";
    this.code = code;
    this.details = details;
  }
}

function enumValue(value, values, field, fallback) {
  const normalized = value == null || value === "" ? fallback : String(value).trim().toUpperCase();
  if (!Object.values(values).includes(normalized)) {
    throw new PurchaseReceivingValidationError("INVALID_ENUM", `${field} has an unsupported value.`, { field });
  }
  return normalized;
}

function boundedText(value, field, options = {}) {
  if (value == null || value === "") {
    if (options.required) throw new PurchaseReceivingValidationError("REQUIRED_FIELD", `${field} is required.`, { field });
    return null;
  }
  const text = String(value).trim();
  const maximum = options.maximum || PURCHASE_RECEIVING_LIMITS.maximumIdentifier;
  if (!text || text.length > maximum) throw new PurchaseReceivingValidationError("INVALID_TEXT", `${field} must be a bounded non-empty string.`, { field });
  return text;
}

function positiveInteger(value, field, options = {}) {
  const minimum = options.minimum ?? 0;
  const maximum = options.maximum ?? PURCHASE_RECEIVING_LIMITS.maximumQuantity;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new PurchaseReceivingValidationError("INVALID_QUANTITY", `${field} must be a safe integer between ${minimum} and ${maximum}.`, { field });
  }
  return value;
}

function isoTimestamp(value, field, options = {}) {
  if (value == null || value === "") {
    if (options.required) throw new PurchaseReceivingValidationError("REQUIRED_TIMESTAMP", `${field} is required.`, { field });
    return null;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new PurchaseReceivingValidationError("INVALID_TIMESTAMP", `${field} must be a valid timestamp.`, { field });
  return parsed.toISOString();
}

function warningList(value, field = "warnings") {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > PURCHASE_RECEIVING_LIMITS.maximumWarnings) {
    throw new PurchaseReceivingValidationError("INVALID_WARNINGS", `${field} must be a bounded array.`, { field });
  }
  return [...new Set(value.map((entry, index) => boundedText(entry, `${field}[${index}]`, { required: true, maximum: 500 })))];
}

function normalizeReferences(value, field, maximum = 100) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maximum) throw new PurchaseReceivingValidationError("INVALID_REFERENCES", `${field} must be a bounded array.`, { field });
  return [...new Set(value.map((entry, index) => boundedText(entry, `${field}[${index}]`, { required: true, maximum: 500 })))];
}

function normalizeProvenance(value, fallbackType = PURCHASE_PROVENANCE_TYPES.MANUAL) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 500) throw new PurchaseReceivingValidationError("INVALID_PROVENANCE", "provenance must be a bounded array.");
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new PurchaseReceivingValidationError("INVALID_PROVENANCE", `provenance[${index}] must be an object.`);
    return Object.freeze({
      type: enumValue(entry.type, PURCHASE_PROVENANCE_TYPES, `provenance[${index}].type`, fallbackType),
      field: boundedText(entry.field, `provenance[${index}].field`, { maximum: 256 }),
      sourceReference: boundedText(entry.sourceReference, `provenance[${index}].sourceReference`, { maximum: 500 }),
      recordedAt: isoTimestamp(entry.recordedAt, `provenance[${index}].recordedAt`),
      note: entry.note == null ? null : sanitizePurchaseReceivingNote(entry.note),
    });
  });
}

const CORRECTION_TEXT_FIELDS = new Set([
  "retailerId", "retailerLabel", "vendorName", "retailerAccountReference", "profileReference", "externalOrderId",
  "pickupStoreReference", "shippingAddressReference", "refundState", "returnState",
]);
const CORRECTION_TIMESTAMP_FIELDS = new Set(["orderedAt", "purchasedAt"]);
const CORRECTION_REFERENCE_FIELDS = new Set(["shipmentReferences", "trackingReferences"]);
const CORRECTION_FIELDS = new Set([
  ...CORRECTION_TEXT_FIELDS,
  ...CORRECTION_TIMESTAMP_FIELDS,
  ...CORRECTION_REFERENCE_FIELDS,
  "lineItems", "money", "currency", "fulfillmentType", "warnings", "confidence", "provenance",
]);

function normalizeCorrectionSnapshot(field, value, index, context = {}) {
  const path = `corrections[${index}].${field}`;
  if (CORRECTION_TEXT_FIELDS.has(field)) return boundedText(value, path, { maximum: 500 });
  if (CORRECTION_TIMESTAMP_FIELDS.has(field)) return isoTimestamp(value, path);
  if (CORRECTION_REFERENCE_FIELDS.has(field)) return Object.freeze(normalizeReferences(value, path));
  if (field === "warnings") return Object.freeze(warningList(value, path));
  if (field === "provenance") return Object.freeze(normalizeProvenance(value));
  if (field === "fulfillmentType") return enumValue(value, PURCHASE_FULFILLMENT_TYPES, path, PURCHASE_FULFILLMENT_TYPES.UNKNOWN);
  if (field === "confidence") return enumValue(value, PURCHASE_CONFIDENCE_LEVELS, path, PURCHASE_CONFIDENCE_LEVELS.INSUFFICIENT);
  if (field === "currency") return normalizePurchaseMoney({ minorUnits: 0, currency: value }, { field: path }).currency;
  if (field === "money") {
    const normalized = normalizePurchaseMoneySummary(value, { currency: context.currency, field: path });
    if (context.currency && normalized.currency !== context.currency) {
      throw new PurchaseReceivingValidationError("CURRENCY_MISMATCH", `${path} must use the Purchase Draft currency.`, { field: path });
    }
    return normalized;
  }
  if (field === "lineItems") {
    if (!Array.isArray(value) || !value.length || value.length > PURCHASE_RECEIVING_LIMITS.maximumLineItems) {
      throw new PurchaseReceivingValidationError("INVALID_CORRECTION_VALUE", `${path} must contain bounded canonical line items.`, { field: path });
    }
    return Object.freeze(value.map((line, lineIndex) => normalizePurchaseLineItem(line, { currency: context.currency, index: lineIndex })));
  }
  throw new PurchaseReceivingValidationError("INVALID_CORRECTION_FIELD", `${path} is not a supported owner-correction field.`, { field: path });
}

function normalizeCorrections(value, context = {}) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > PURCHASE_RECEIVING_LIMITS.maximumCorrections) {
    throw new PurchaseReceivingValidationError("INVALID_CORRECTIONS", "corrections must be a bounded array.");
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new PurchaseReceivingValidationError("INVALID_CORRECTION", `corrections[${index}] must be an object.`);
    const field = boundedText(entry.field, `corrections[${index}].field`, { required: true, maximum: 256 });
    if (!CORRECTION_FIELDS.has(field)) throw new PurchaseReceivingValidationError("INVALID_CORRECTION_FIELD", `corrections[${index}].field is not correctable.`, { field });
    const previousValue = entry.previousValue === undefined ? null : normalizeCorrectionSnapshot(field, entry.previousValue, index, context);
    const correctedValue = entry.correctedValue === undefined ? null : normalizeCorrectionSnapshot(field, entry.correctedValue, index, context);
    return Object.freeze({
      field,
      previousValue,
      correctedValue,
      reason: entry.reason == null ? null : sanitizePurchaseReceivingNote(entry.reason),
      correctedAt: isoTimestamp(entry.correctedAt, `corrections[${index}].correctedAt`, { required: true }),
      provenance: PURCHASE_PROVENANCE_TYPES.OWNER_CORRECTION,
    });
  });
}

function normalizeSystemFields(value, recordType) {
  return {
    id: boundedText(value.id, "id", { required: true }),
    format: PURCHASE_RECEIVING_FORMAT,
    recordType,
    recordVersion: positiveInteger(value.recordVersion ?? 1, "recordVersion", { minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
    createdAt: isoTimestamp(value.createdAt, "createdAt", { required: true }),
    updatedAt: isoTimestamp(value.updatedAt, "updatedAt", { required: true }),
  };
}

/** A Purchase line is exact evidence; received quantity is a projection from append-only Receiving Events. */
export function normalizePurchaseLineItem(value, options = {}) {
  assertSafePurchaseReceivingInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PurchaseReceivingValidationError("LINE_ITEM_REQUIRED", "Purchase line item must be an object.");
  const index = options.index ?? 0;
  const lineItemId = boundedText(value.lineItemId ?? value.id, `lineItems[${index}].lineItemId`, { required: true });
  const currency = options.currency || value.unitPrice?.currency || "USD";
  const quantityOrdered = positiveInteger(value.quantityOrdered ?? value.quantity, `lineItems[${index}].quantityOrdered`, { minimum: 1 });
  const unitPrice = normalizePurchaseMoney(value.unitPrice, { currency, field: `lineItems[${index}].unitPrice` });
  if (unitPrice.currency !== currency) throw new PurchaseReceivingValidationError("CURRENCY_MISMATCH", "Line item currency must match the Purchase currency.", { lineItemId });
  const lineAmount = multiplyMoney(unitPrice, quantityOrdered, { field: `lineItems[${index}].lineAmount` });
  const suppliedLineAmount = value.lineAmount == null ? lineAmount : normalizePurchaseMoney(value.lineAmount, { currency, field: `lineItems[${index}].lineAmount` });
  if (suppliedLineAmount.minorUnits !== lineAmount.minorUnits || suppliedLineAmount.currency !== lineAmount.currency) {
    throw new PurchaseReceivingValidationError("LINE_TOTAL_MISMATCH", "Line amount must equal exact unit price multiplied by ordered quantity.", { lineItemId });
  }
  const cancellationQuantity = positiveInteger(value.cancellationQuantity ?? value.cancelledQuantity ?? 0, `lineItems[${index}].cancellationQuantity`);
  const refundedQuantity = positiveInteger(value.refundedQuantity ?? 0, `lineItems[${index}].refundedQuantity`);
  const receivedQuantity = positiveInteger(value.receivedQuantity ?? 0, `lineItems[${index}].receivedQuantity`);
  if (cancellationQuantity > quantityOrdered || refundedQuantity > quantityOrdered || receivedQuantity > quantityOrdered - cancellationQuantity) {
    throw new PurchaseReceivingValidationError("LINE_QUANTITY_CONFLICT", "Cancelled, refunded, or received quantity exceeds the ordered quantity.", { lineItemId });
  }
  const productIdentity = normalizeProductIdentity(value.productIdentity || value);
  const productMatchStatus = enumValue(
    value.productMatchStatus,
    PRODUCT_MATCH_STATES,
    `lineItems[${index}].productMatchStatus`,
    productIdentity.productReference ? PRODUCT_MATCH_STATES.MATCHED : PRODUCT_MATCH_STATES.UNRESOLVED,
  );
  return Object.freeze({
    lineItemId,
    ...productIdentity,
    productMatchStatus,
    quantityOrdered,
    unitPrice,
    lineAmount,
    cancellationQuantity,
    refundedQuantity,
    receivedQuantity,
    remainingQuantity: quantityOrdered - cancellationQuantity - receivedQuantity,
    discountAllocation: value.discountAllocation == null ? null : normalizePurchaseMoney(value.discountAllocation, { currency, field: `lineItems[${index}].discountAllocation` }),
    taxAllocation: value.taxAllocation == null ? null : normalizePurchaseMoney(value.taxAllocation, { currency, field: `lineItems[${index}].taxAllocation` }),
    shippingAllocation: value.shippingAllocation == null ? null : normalizePurchaseMoney(value.shippingAllocation, { currency, field: `lineItems[${index}].shippingAllocation` }),
    feeAllocation: value.feeAllocation == null ? null : normalizePurchaseMoney(value.feeAllocation, { currency, field: `lineItems[${index}].feeAllocation` }),
    allocatedAcquisitionCost: value.allocatedAcquisitionCost == null ? null : normalizePurchaseMoney(value.allocatedAcquisitionCost, { currency, field: `lineItems[${index}].allocatedAcquisitionCost` }),
    warnings: Object.freeze(warningList(value.warnings, `lineItems[${index}].warnings`)),
    provenance: Object.freeze(normalizeProvenance(value.provenance)),
  });
}

function normalizeDraftCore(value) {
  const currency = String(value.currency || value.money?.currency || value.money?.grandTotal?.currency || "USD").trim().toUpperCase();
  if (!Array.isArray(value.lineItems) || !value.lineItems.length || value.lineItems.length > PURCHASE_RECEIVING_LIMITS.maximumLineItems) {
    throw new PurchaseReceivingValidationError("LINE_ITEMS_REQUIRED", "A Purchase Draft requires a bounded non-empty lineItems array.");
  }
  const ids = new Set();
  const lineItems = value.lineItems.map((line, index) => {
    const normalized = normalizePurchaseLineItem(line, { currency, index });
    if (ids.has(normalized.lineItemId)) throw new PurchaseReceivingValidationError("DUPLICATE_LINE_ITEM", `Duplicate line item ${normalized.lineItemId}.`);
    ids.add(normalized.lineItemId);
    return normalized;
  });
  const money = normalizePurchaseMoneySummary(value.money || value, { currency, lineItems, field: "money" });
  return {
    sourceType: enumValue(value.sourceType, PURCHASE_SOURCE_TYPES, "sourceType", PURCHASE_SOURCE_TYPES.MANUAL),
    sourceReference: boundedText(value.sourceReference, "sourceReference", { maximum: 500 }),
    sourceIdentityKey: boundedText(value.sourceIdentityKey, "sourceIdentityKey", { maximum: 500 }),
    retailerId: boundedText(value.retailerId ?? value.retailer, "retailerId", { maximum: 256 }),
    retailerLabel: boundedText(value.retailerLabel, "retailerLabel", { maximum: 500 }),
    vendorName: boundedText(value.vendorName ?? value.vendor, "vendorName", { maximum: 500 }),
    retailerAccountReference: boundedText(value.retailerAccountReference ?? value.accountReference, "retailerAccountReference", { maximum: 500 }),
    profileReference: boundedText(value.profileReference, "profileReference", { maximum: 500 }),
    externalOrderId: boundedText(value.externalOrderId ?? value.orderId, "externalOrderId", { maximum: 500 }),
    orderedAt: isoTimestamp(value.orderedAt ?? value.orderDate, "orderedAt"),
    purchasedAt: isoTimestamp(value.purchasedAt ?? value.purchaseDate, "purchasedAt"),
    lineItems: Object.freeze(lineItems),
    money,
    currency: money.currency,
    fulfillmentType: enumValue(value.fulfillmentType, PURCHASE_FULFILLMENT_TYPES, "fulfillmentType", PURCHASE_FULFILLMENT_TYPES.UNKNOWN),
    pickupStoreReference: boundedText(value.pickupStoreReference, "pickupStoreReference", { maximum: 500 }),
    shippingAddressReference: boundedText(value.shippingAddressReference, "shippingAddressReference", { maximum: 500 }),
    shipmentReferences: Object.freeze(normalizeReferences(value.shipmentReferences, "shipmentReferences")),
    trackingReferences: Object.freeze(normalizeReferences(value.trackingReferences, "trackingReferences")),
    warnings: Object.freeze([...new Set([...warningList(value.warnings), ...money.warnings])]),
    confidence: enumValue(value.confidence, PURCHASE_CONFIDENCE_LEVELS, "confidence", PURCHASE_CONFIDENCE_LEVELS.INSUFFICIENT),
    provenance: Object.freeze(normalizeProvenance(value.provenance)),
    corrections: Object.freeze(normalizeCorrections(value.corrections, { currency: money.currency })),
    refundState: boundedText(value.refundState, "refundState", { maximum: 100 }),
    returnState: boundedText(value.returnState, "returnState", { maximum: 100 }),
  };
}

/** Purchase Drafts are review records only; automatic creation and downstream mutation flags stay false. */
export function normalizePurchaseDraftInput(value, options = {}) {
  assertSafePurchaseReceivingInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PurchaseReceivingValidationError("DRAFT_REQUIRED", "Purchase Draft must be an object.");
  const core = normalizeDraftCore(value);
  const persisted = Boolean(options.persisted || value.recordVersion || value.createdAt || value.updatedAt);
  const system = persisted ? normalizeSystemFields(value, "PURCHASE_DRAFT") : {
    id: boundedText(value.id, "id", { required: true }),
    format: PURCHASE_RECEIVING_FORMAT,
    recordType: "PURCHASE_DRAFT",
  };
  return Object.freeze({
    ...system,
    ...core,
    status: enumValue(value.status, PURCHASE_DRAFT_STATES, "status", PURCHASE_DRAFT_STATES.DRAFT),
    confirmedPurchaseId: boundedText(value.confirmedPurchaseId, "confirmedPurchaseId"),
    reviewedAt: isoTimestamp(value.reviewedAt, "reviewedAt"),
    rejectedAt: isoTimestamp(value.rejectedAt, "rejectedAt"),
    rejectionReason: value.rejectionReason == null ? null : sanitizePurchaseReceivingNote(value.rejectionReason),
    automaticPurchaseCreationAllowed: false,
    inventoryCreated: false,
  });
}

/** Canonical Purchases can only be produced after the service's explicit owner confirmation boundary. */
export function normalizeCanonicalPurchase(value) {
  assertSafePurchaseReceivingInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PurchaseReceivingValidationError("PURCHASE_REQUIRED", "Purchase must be an object.");
  const core = normalizeDraftCore(value);
  if (core.lineItems.some((line) => line.receivedQuantity !== 0)) {
    throw new PurchaseReceivingValidationError(
      "PURCHASE_CANNOT_EMBED_RECEIVING",
      "Canonical Purchase lines cannot contain received quantity; append-only Receiving Events are authoritative.",
    );
  }
  const system = normalizeSystemFields(value, "PURCHASE");
  const allocations = allocatePurchaseCosts(core.lineItems, core.money);
  const allocationByLine = new Map(allocations.lineItems.map((entry) => [entry.lineItemId, entry]));
  const lineItems = core.lineItems.map((line) => Object.freeze({ ...line, ...allocationByLine.get(line.lineItemId) }));
  return Object.freeze({
    ...system,
    ...core,
    lineItems: Object.freeze(lineItems),
    sourceDraftId: boundedText(value.sourceDraftId, "sourceDraftId", { required: true }),
    confirmationKey: boundedText(value.confirmationKey, "confirmationKey", { required: true, maximum: 500 }),
    status: enumValue(value.status, PURCHASE_LIFECYCLE_STATES, "status", PURCHASE_LIFECYCLE_STATES.CONFIRMED),
    receivingStatus: enumValue(value.receivingStatus, PURCHASE_RECEIPT_STATES, "receivingStatus", PURCHASE_RECEIPT_STATES.NOT_RECEIVED),
    confirmedAt: isoTimestamp(value.confirmedAt, "confirmedAt", { required: true }),
    confirmationMethod: "VERIFIED_OWNER_SESSION",
    historyReferences: Object.freeze(normalizeReferences(value.historyReferences, "historyReferences", 500)),
    automaticReceivingAllowed: false,
    inventoryCreated: false,
  });
}

function normalizeReceivingEntry(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PurchaseReceivingValidationError("RECEIVING_ENTRY_REQUIRED", `entries[${index}] must be an object.`);
  const quantityReceived = positiveInteger(value.quantityReceived ?? 0, `entries[${index}].quantityReceived`);
  const quantityAffected = positiveInteger(value.quantityAffected ?? quantityReceived, `entries[${index}].quantityAffected`);
  const discrepancy = enumValue(value.discrepancy, RECEIVING_DISCREPANCIES, `entries[${index}].discrepancy`, RECEIVING_DISCREPANCIES.NONE);
  if (quantityReceived === 0 && quantityAffected === 0) throw new PurchaseReceivingValidationError("EMPTY_RECEIVING_ENTRY", "A Receiving entry must affect or receive at least one unit.", { index });
  if (discrepancy === RECEIVING_DISCREPANCIES.NONE && quantityReceived === 0) throw new PurchaseReceivingValidationError("RECEIVING_QUANTITY_REQUIRED", "A non-discrepant Receiving entry must receive at least one unit.", { index });
  return Object.freeze({
    lineItemId: boundedText(value.lineItemId, `entries[${index}].lineItemId`, { required: true }),
    quantityReceived,
    quantityAffected,
    condition: boundedText(value.condition, `entries[${index}].condition`, { maximum: 256 }),
    discrepancy,
    substituteProductReference: boundedText(value.substituteProductReference, `entries[${index}].substituteProductReference`, { maximum: 500 }),
    note: value.note == null ? null : sanitizePurchaseReceivingNote(value.note),
    provenance: Object.freeze(normalizeProvenance(value.provenance, PURCHASE_PROVENANCE_TYPES.RECEIVING_CONFIRMATION)),
  });
}

/** Receiving Events are append-only owner confirmations and never Inventory writes. */
export function normalizeReceivingEvent(value, options = {}) {
  assertSafePurchaseReceivingInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PurchaseReceivingValidationError("RECEIVING_EVENT_REQUIRED", "Receiving Event must be an object.");
  if (!Array.isArray(value.entries) || !value.entries.length || value.entries.length > PURCHASE_RECEIVING_LIMITS.maximumLineItems) {
    throw new PurchaseReceivingValidationError("RECEIVING_ENTRIES_REQUIRED", "Receiving Event requires a bounded non-empty entries array.");
  }
  const persisted = Boolean(options.persisted || value.recordVersion || value.createdAt || value.updatedAt);
  const system = persisted ? normalizeSystemFields(value, "RECEIVING_EVENT") : {
    id: boundedText(value.id, "id", { required: true }),
    format: PURCHASE_RECEIVING_FORMAT,
    recordType: "RECEIVING_EVENT",
  };
  return Object.freeze({
    ...system,
    purchaseId: boundedText(value.purchaseId, "purchaseId", { required: true }),
    idempotencyKey: boundedText(value.idempotencyKey, "idempotencyKey", { required: true, maximum: 500 }),
    occurredAt: isoTimestamp(value.occurredAt, "occurredAt", { required: true }),
    confirmedAt: isoTimestamp(value.confirmedAt, "confirmedAt", { required: true }),
    confirmationMethod: "VERIFIED_OWNER_SESSION",
    locationReference: boundedText(value.locationReference, "locationReference", { maximum: 500 }),
    status: enumValue(value.status, RECEIVING_EVENT_STATES, "status", RECEIVING_EVENT_STATES.PARTIALLY_RECEIVED),
    entries: Object.freeze(value.entries.map(normalizeReceivingEntry)),
    notes: value.notes == null ? null : sanitizePurchaseReceivingNote(value.notes),
    provenance: Object.freeze(normalizeProvenance(value.provenance, PURCHASE_PROVENANCE_TYPES.RECEIVING_CONFIRMATION)),
    createsInventory: false,
  });
}

export function validateDraftForConfirmation(value) {
  let draft;
  try {
    draft = normalizePurchaseDraftInput(value, { persisted: true });
  } catch (error) {
    return Object.freeze({ valid: false, blockers: Object.freeze([error.code || "INVALID_DRAFT"]), warnings: Object.freeze([]) });
  }
  const blockers = [];
  const warnings = [...draft.warnings];
  if (draft.status !== PURCHASE_DRAFT_STATES.READY_TO_CONFIRM) blockers.push("DRAFT_NOT_READY");
  if (!draft.retailerId && !draft.vendorName) blockers.push("RETAILER_OR_VENDOR_REQUIRED");
  if (!draft.orderedAt && !draft.purchasedAt) blockers.push("PURCHASE_DATE_REQUIRED");
  if (draft.money.warnings.includes("SUBTOTAL_LINE_MISMATCH")) blockers.push("SUBTOTAL_LINE_MISMATCH");
  if (draft.money.warnings.includes("GRAND_TOTAL_MISMATCH")) blockers.push("GRAND_TOTAL_MISMATCH");
  if (draft.lineItems.some((line) => line.receivedQuantity !== 0)) blockers.push("DRAFT_CANNOT_CONTAIN_RECEIVING");
  if (draft.lineItems.some((line) => line.productMatchStatus === PRODUCT_MATCH_STATES.AMBIGUOUS)) warnings.push("AMBIGUOUS_PRODUCT_REQUIRES_FUTURE_INVENTORY_REVIEW");
  if (!draft.externalOrderId) warnings.push("EXTERNAL_ORDER_ID_MISSING");
  return Object.freeze({ valid: blockers.length === 0, blockers: Object.freeze([...new Set(blockers)]), warnings: Object.freeze([...new Set(warnings)]) });
}

export function deriveReceivingProjection(purchase, receivingEvents = []) {
  const canonical = normalizeCanonicalPurchase(purchase, { persisted: true });
  if (!Array.isArray(receivingEvents)) throw new PurchaseReceivingValidationError("INVALID_RECEIVING_EVENTS", "Receiving Events must be an array.");
  const events = receivingEvents.map((event) => normalizeReceivingEvent(event, { persisted: true })).filter((event) => event.purchaseId === canonical.id);
  const eventKeys = new Set();
  for (const event of events) {
    if (eventKeys.has(event.idempotencyKey)) throw new PurchaseReceivingValidationError("DUPLICATE_RECEIVING_EVENT", "Receiving Event idempotency keys must be unique per Purchase.");
    eventKeys.add(event.idempotencyKey);
  }
  const lines = canonical.lineItems.map((line) => {
    const relevant = events.flatMap((event) => event.entries.map((entry) => ({ event, entry }))).filter(({ entry }) => entry.lineItemId === line.lineItemId);
    const receivedQuantity = relevant.reduce((sum, { entry }) => sum + entry.quantityReceived, 0);
    const accountableQuantity = line.quantityOrdered - line.cancellationQuantity;
    if (receivedQuantity > accountableQuantity) throw new PurchaseReceivingValidationError("RECEIVING_EXCEEDS_ORDERED", "Received quantity exceeds non-cancelled ordered quantity.", { lineItemId: line.lineItemId });
    return Object.freeze({
      lineItemId: line.lineItemId,
      productReference: line.productReference,
      productMatchStatus: line.productMatchStatus,
      quantityOrdered: line.quantityOrdered,
      cancellationQuantity: line.cancellationQuantity,
      accountableQuantity,
      receivedQuantity,
      remainingQuantity: accountableQuantity - receivedQuantity,
      discrepancies: Object.freeze(relevant.filter(({ entry }) => entry.discrepancy !== RECEIVING_DISCREPANCIES.NONE).map(({ event, entry }) => Object.freeze({
        eventId: event.id,
        occurredAt: event.occurredAt,
        discrepancy: entry.discrepancy,
        quantityAffected: entry.quantityAffected,
      }))),
    });
  });
  const totalAccountable = lines.reduce((sum, line) => sum + line.accountableQuantity, 0);
  const totalReceived = lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
  const status = totalAccountable === 0
    ? PURCHASE_RECEIPT_STATES.CANCELLED
    : totalReceived === 0
      ? PURCHASE_RECEIPT_STATES.NOT_RECEIVED
      : totalReceived === totalAccountable
        ? PURCHASE_RECEIPT_STATES.FULLY_RECEIVED
        : PURCHASE_RECEIPT_STATES.PARTIALLY_RECEIVED;
  return Object.freeze({
    purchaseId: canonical.id,
    status,
    eventCount: events.length,
    totalAccountableQuantity: totalAccountable,
    totalReceivedQuantity: totalReceived,
    lineItems: Object.freeze(lines),
  });
}

/** Derived-only view of potential Inventory; no repository or Inventory writer is reachable here. */
export function buildInventoryHandoffPreview(purchase, receivingEvents = []) {
  const canonical = normalizeCanonicalPurchase(purchase, { persisted: true });
  const receiving = deriveReceivingProjection(canonical, receivingEvents);
  const lineMap = new Map(canonical.lineItems.map((line) => [line.lineItemId, line]));
  const rows = receiving.lineItems.filter((line) => line.receivedQuantity > 0).map((projection) => {
    const line = lineMap.get(projection.lineItemId);
    const totalCost = BigInt(line.allocatedAcquisitionCost.minorUnits);
    const unitCount = BigInt(projection.accountableQuantity);
    const receivedCount = BigInt(projection.receivedQuantity);
    const basePerUnit = totalCost / unitCount;
    const remainderUnits = totalCost % unitCount;
    const receivedCostBigInt = (basePerUnit * receivedCount) + (receivedCount < remainderUnits ? receivedCount : remainderUnits);
    const receivedCost = Number(receivedCostBigInt);
    if (!Number.isSafeInteger(receivedCost)) throw new PurchaseReceivingValidationError("HANDOFF_COST_OUT_OF_RANGE", "Inventory Handoff Preview cost exceeds safe integer precision.");
    return Object.freeze({
      purchaseId: canonical.id,
      lineItemId: line.lineItemId,
      productReference: line.productReference,
      productMatchStatus: line.productMatchStatus,
      productTitle: line.title,
      quantity: projection.receivedQuantity,
      allocatedAcquisitionCost: Object.freeze({ minorUnits: receivedCost, currency: canonical.currency }),
      retailerId: canonical.retailerId,
      vendorName: canonical.vendorName,
      condition: null,
      warnings: Object.freeze([
        ...(line.productMatchStatus !== PRODUCT_MATCH_STATES.MATCHED ? ["PRODUCT_REVIEW_REQUIRED"] : []),
        ...(projection.remainingQuantity > 0 ? ["PARTIAL_RECEIVING_COST_PREVIEW"] : []),
        ...projection.discrepancies.map((entry) => `RECEIVING_${entry.discrepancy}`),
      ]),
    });
  });
  return Object.freeze({
    format: "code3.inventory-handoff-preview.v1",
    purchaseId: canonical.id,
    receivingStatus: receiving.status,
    rows: Object.freeze(rows),
    inventoryRecordsCreated: 0,
    inventoryMutationAvailable: false,
    previewOnly: true,
  });
}
