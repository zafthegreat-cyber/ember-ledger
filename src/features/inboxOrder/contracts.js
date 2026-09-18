import {
  FULFILLMENT_TYPES,
  INBOX_ORDER_CONFIDENCE,
  INBOX_ORDER_FORMAT,
  INBOX_ORDER_LIMITS,
  ORDER_REVIEW_STATES,
  ORDER_STATES,
  PROVIDER_HEALTH_STATES,
} from "./constants.js";
import { normalizeOrderAmounts } from "./money.js";
import { assertSafeInboxOrderInput } from "./security.js";

export class InboxOrderValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "InboxOrderValidationError";
    this.code = code;
    this.details = details;
  }
}

export function boundedText(value, field, maximum = INBOX_ORDER_LIMITS.maximumString, required = false) {
  if (value == null) value = "";
  if (typeof value !== "string") throw new InboxOrderValidationError("INVALID_TEXT", `${field} must be text.`, { field });
  const text = value.trim();
  if (required && !text) throw new InboxOrderValidationError("REQUIRED_FIELD", `${field} is required.`, { field });
  if (text.length > maximum) throw new InboxOrderValidationError("TEXT_TOO_LONG", `${field} is too long.`, { field });
  return text;
}

export function normalizeIso(value, field, required = false) {
  if (value == null || value === "") {
    if (required) throw new InboxOrderValidationError("REQUIRED_FIELD", `${field} is required.`, { field });
    return null;
  }
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new InboxOrderValidationError("INVALID_DATE", `${field} must be a valid date and time.`, { field });
  }
  return new Date(value).toISOString();
}

export function normalizeEnum(value, values, field, fallback) {
  const candidate = String(value || fallback || "").trim().toUpperCase();
  if (!Object.values(values).includes(candidate)) {
    throw new InboxOrderValidationError("INVALID_ENUM", `${field} has an unsupported value.`, { field, value });
  }
  return candidate;
}

function normalizeStringArray(value, field, maximum = 50) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maximum) {
    throw new InboxOrderValidationError("INVALID_ARRAY", `${field} must be a bounded array.`, { field });
  }
  return [...new Set(value.map((entry) => boundedText(entry, field, 500, true)))];
}

function normalizeCodeArray(value, field, maximum = 50) {
  const entries = normalizeStringArray(value, field, maximum);
  if (entries.some((entry) => !/^[A-Z0-9][A-Z0-9._:-]{0,199}$/i.test(entry))) {
    throw new InboxOrderValidationError("INVALID_CODE_ARRAY", `${field} must contain sanitized codes only.`, { field });
  }
  return entries;
}

function normalizeCursorSummary(value) {
  if (value == null) return { available: false, kind: null, lastProcessedAt: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InboxOrderValidationError("INVALID_CURSOR_METADATA", "cursorMetadata must be a safe summary object.");
  }
  const allowed = new Set(["available", "kind", "lastProcessedAt"]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new InboxOrderValidationError("UNSAFE_CURSOR_METADATA", "Raw provider cursors cannot enter the client connection model.");
  }
  return {
    available: value.available === true,
    kind: boundedText(value.kind, "cursorMetadata.kind", 80) || null,
    lastProcessedAt: normalizeIso(value.lastProcessedAt, "cursorMetadata.lastProcessedAt"),
  };
}

export function normalizeProviderConnectionMetadata(input = {}) {
  assertSafeInboxOrderInput(input);
  const allowed = new Set([
    "provider", "connectionId", "connectedAccountLabel", "grantedScopes", "status", "connectedAt",
    "lastHealthyAt", "healthEvidenceAt", "cursorMetadata", "capabilities", "revocationState",
    "errors", "aliasIds", "domainIds",
  ]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) throw new InboxOrderValidationError("UNKNOWN_CONNECTION_FIELD", `Unsupported connection field: ${unknown[0]}.`);
  const status = normalizeEnum(input.status, PROVIDER_HEALTH_STATES, "status", PROVIDER_HEALTH_STATES.DISCONNECTED);
  const healthEvidenceAt = normalizeIso(input.healthEvidenceAt, "healthEvidenceAt");
  if (status === PROVIDER_HEALTH_STATES.HEALTHY && !healthEvidenceAt) {
    throw new InboxOrderValidationError("HEALTH_EVIDENCE_REQUIRED", "HEALTHY requires a recent trusted provider health check.");
  }
  return Object.freeze({
    format: INBOX_ORDER_FORMAT,
    recordType: "PROVIDER_CONNECTION_METADATA",
    provider: boundedText(input.provider, "provider", 80, true).toUpperCase(),
    connectionId: boundedText(input.connectionId, "connectionId", 160, true),
    connectedAccountLabel: boundedText(input.connectedAccountLabel, "connectedAccountLabel", 320),
    grantedScopes: normalizeStringArray(input.grantedScopes, "grantedScopes", 50),
    status,
    connectedAt: normalizeIso(input.connectedAt, "connectedAt"),
    lastHealthyAt: normalizeIso(input.lastHealthyAt, "lastHealthyAt"),
    healthEvidenceAt,
    cursorMetadata: normalizeCursorSummary(input.cursorMetadata),
    capabilities: normalizeCodeArray(input.capabilities, "capabilities", 50),
    revocationState: boundedText(input.revocationState, "revocationState", 80) || "NOT_REVOKED",
    errors: normalizeCodeArray(input.errors, "errors", 50),
    aliasIds: normalizeStringArray(input.aliasIds, "aliasIds", 100),
    domainIds: normalizeStringArray(input.domainIds, "domainIds", 100),
    containsProviderSecret: false,
  });
}

function normalizeTrackingReferences(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > INBOX_ORDER_LIMITS.maximumTrackingReferences) {
    throw new InboxOrderValidationError("TRACKING_REFERENCE_LIMIT", "trackingReferences must be a bounded array.");
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new InboxOrderValidationError("INVALID_TRACKING_REFERENCE", `trackingReferences[${index}] must be an object.`);
    }
    return {
      carrier: boundedText(entry.carrier, `trackingReferences[${index}].carrier`, 120),
      reference: boundedText(entry.reference, `trackingReferences[${index}].reference`, 300, true),
      status: boundedText(entry.status, `trackingReferences[${index}].status`, 120),
    };
  });
}

export function normalizeOrderProposal(input = {}) {
  assertSafeInboxOrderInput(input);
  const allowed = new Set([
    "externalOrderId", "orderedAt", "lineItems", "subtotal", "discounts", "tax", "shipping", "total",
    "refundAmount", "currency", "fulfillmentType", "pickupStoreReference", "shippingAddressReference",
    "orderStatus", "providerRawStatus", "trackingReferences", "retailerId", "storeAccountId", "aliasId",
    "profileId", "warnings",
  ]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) throw new InboxOrderValidationError("UNKNOWN_ORDER_PROPOSAL_FIELD", `Unsupported order proposal field: ${unknown[0]}.`);
  const amounts = normalizeOrderAmounts(input);
  return Object.freeze({
    externalOrderId: boundedText(input.externalOrderId, "externalOrderId", 500),
    orderedAt: normalizeIso(input.orderedAt, "orderedAt"),
    lineItems: amounts.lineItems,
    subtotal: amounts.subtotal,
    discounts: amounts.discounts,
    tax: amounts.tax,
    shipping: amounts.shipping,
    total: amounts.total,
    refundAmount: amounts.refundAmount,
    currency: amounts.currency,
    computedLineSubtotal: amounts.computedLineSubtotal,
    computedExpectedTotal: amounts.computedExpectedTotal,
    fulfillmentType: normalizeEnum(input.fulfillmentType, FULFILLMENT_TYPES, "fulfillmentType", FULFILLMENT_TYPES.UNKNOWN),
    pickupStoreReference: boundedText(input.pickupStoreReference, "pickupStoreReference", 500) || null,
    shippingAddressReference: boundedText(input.shippingAddressReference, "shippingAddressReference", 500) || null,
    orderStatus: normalizeEnum(input.orderStatus, ORDER_STATES, "orderStatus", ORDER_STATES.DETECTED),
    providerRawStatus: boundedText(input.providerRawStatus, "providerRawStatus", 300) || null,
    trackingReferences: normalizeTrackingReferences(input.trackingReferences),
    retailerId: boundedText(input.retailerId, "retailerId", 160) || null,
    storeAccountId: boundedText(input.storeAccountId, "storeAccountId", 160) || null,
    aliasId: boundedText(input.aliasId, "aliasId", 160) || null,
    profileId: boundedText(input.profileId, "profileId", 160) || null,
    warnings: [...new Set([
      ...amounts.warnings,
      ...normalizeStringArray(input.warnings, "warnings", INBOX_ORDER_LIMITS.maximumWarnings),
    ])],
  });
}

export function emptyOwnerReview() {
  return Object.freeze({
    state: ORDER_REVIEW_STATES.NEW,
    corrections: [],
    confirmedAt: null,
    rejectedAt: null,
    rejectionReason: null,
  });
}

export function normalizeConfidence(value, fallback = INBOX_ORDER_CONFIDENCE.INSUFFICIENT) {
  return normalizeEnum(value, INBOX_ORDER_CONFIDENCE, "confidence", fallback);
}
