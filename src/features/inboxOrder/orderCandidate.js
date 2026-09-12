import { hashCanonicalJson } from "../backup/canonicalJson.js";
import {
  CANDIDATE_EVENT_TYPES,
  FULFILLMENT_TYPES,
  INBOX_ORDER_CONFIDENCE,
  INBOX_ORDER_FORMAT,
  INBOX_ORDER_PROVENANCE,
  MESSAGE_CATEGORIES,
  ORDER_RELATED_CATEGORIES,
  ORDER_REVIEW_STATES,
  ORDER_STATES,
} from "./constants.js";
import {
  InboxOrderValidationError,
  boundedText,
  emptyOwnerReview,
  normalizeEnum,
  normalizeIso,
  normalizeOrderProposal,
} from "./contracts.js";
import { assertMoney } from "../intelligence/money.js";
import { assertSafeInboxOrderInput, safeInboxOrderClone } from "./security.js";

const CATEGORY_STATUS = Object.freeze({
  [MESSAGE_CATEGORIES.ORDER_CONFIRMATION]: ORDER_STATES.CONFIRMED,
  [MESSAGE_CATEGORIES.SHIPPED]: ORDER_STATES.SHIPPED,
  [MESSAGE_CATEGORIES.DELIVERED]: ORDER_STATES.DELIVERED,
  [MESSAGE_CATEGORIES.CANCELLED]: ORDER_STATES.CANCELLED,
  [MESSAGE_CATEGORIES.REFUND]: ORDER_STATES.REFUNDED,
  [MESSAGE_CATEGORIES.RETURN]: ORDER_STATES.RETURNED,
  [MESSAGE_CATEGORIES.PICKUP]: ORDER_STATES.READY_FOR_PICKUP,
});

const TERMINAL_STATES = new Set([
  ORDER_STATES.CANCELLED,
  ORDER_STATES.PARTIALLY_CANCELLED,
  ORDER_STATES.RETURNED,
  ORDER_STATES.REFUNDED,
  ORDER_STATES.PARTIALLY_REFUNDED,
]);

async function stableId(prefix, input) {
  return `${prefix}:${(await hashCanonicalJson(input)).slice(0, 32)}`;
}

function proposedRetailerId(event) {
  return event.orderProposal?.retailerId
    || event.retailerProposal?.proposedRetailerId
    || event.aliasMatch?.selectedRetailerId
    || null;
}

function eventOrderStatus(event) {
  return event.orderProposal?.orderStatus
    || CATEGORY_STATUS[event.category]
    || ORDER_STATES.UNKNOWN;
}

function candidateConfidence(event) {
  const proposal = event.orderProposal;
  if (!proposal) return { band: INBOX_ORDER_CONFIDENCE.INSUFFICIENT, rationale: ["No normalized order fields were available."] };
  const rationale = [];
  let score = 0;
  if (proposal.externalOrderId) { score += 2; rationale.push("An external order identifier was supplied."); }
  else rationale.push("The external order identifier is missing.");
  if (proposedRetailerId(event)) { score += 1; rationale.push("Retailer evidence was available."); }
  if (event.retailerProposal?.confidence === INBOX_ORDER_CONFIDENCE.HIGH) score += 2;
  else if (event.retailerProposal?.confidence === INBOX_ORDER_CONFIDENCE.MEDIUM) score += 1;
  if (proposal.total) { score += 1; rationale.push("A total was supplied in exact minor units."); }
  if (proposal.lineItems.length) { score += 1; rationale.push("At least one line item was normalized."); }
  if (event.warnings.length || proposal.warnings.length) score -= 1;
  const hasMaterialConflict = event.warnings.some((warning) => [
    "ORDER_RETAILER_CONFLICT",
    "RETAILER_ALIAS_SENDER_CONFLICT",
    "AMBIGUOUS_ALIAS_MATCH",
  ].includes(warning));
  const band = hasMaterialConflict
    ? INBOX_ORDER_CONFIDENCE.LOW
    : score >= 6
    ? INBOX_ORDER_CONFIDENCE.HIGH
    : score >= 4
      ? INBOX_ORDER_CONFIDENCE.MEDIUM
      : score >= 1
        ? INBOX_ORDER_CONFIDENCE.LOW
        : INBOX_ORDER_CONFIDENCE.INSUFFICIENT;
  return { band, rationale };
}

function sourceEventSummary(event) {
  return {
    eventId: event.id,
    providerMessageId: event.providerMessageId,
    category: event.category,
    receivedAt: event.receivedAt,
    sourceHash: event.sourceHash,
    orderStatus: eventOrderStatus(event),
  };
}

function proposalProvenance(event) {
  const proposal = event.orderProposal || {};
  const entries = Object.entries(proposal)
    .filter(([, value]) => value !== null && value !== undefined && (!Array.isArray(value) || value.length > 0))
    .map(([field]) => ({
      field: `systemProposal.${field}`,
      sourceEventId: event.id,
      kind: INBOX_ORDER_PROVENANCE.PROVIDER_SUPPLIED,
    }));
  if (!proposal.retailerId && event.retailerProposal?.proposedRetailerId) {
    entries.push({ field: "systemProposal.retailerId", sourceEventId: event.id, kind: INBOX_ORDER_PROVENANCE.INFERRED });
  }
  if (!proposal.aliasId && event.aliasMatch?.selectedAliasId) {
    entries.push({ field: "systemProposal.aliasId", sourceEventId: event.id, kind: INBOX_ORDER_PROVENANCE.INFERRED });
  }
  if (!proposal.profileId && event.aliasMatch?.selectedProfileId) {
    entries.push({ field: "systemProposal.profileId", sourceEventId: event.id, kind: INBOX_ORDER_PROVENANCE.INFERRED });
  }
  if (!proposal.storeAccountId && event.aliasMatch?.selectedStoreAccountIds?.length === 1) {
    entries.push({ field: "systemProposal.storeAccountId", sourceEventId: event.id, kind: INBOX_ORDER_PROVENANCE.INFERRED });
  }
  return entries;
}

export async function createOrderCandidateFromEvent(event) {
  assertSafeInboxOrderInput(event);
  if (!ORDER_RELATED_CATEGORIES.has(event.category) || !event.orderProposal) return null;
  const retailerId = proposedRetailerId(event);
  const externalOrderId = event.orderProposal.externalOrderId || null;
  const identity = externalOrderId
    ? { providerConnectionId: event.providerConnectionId, retailerId: retailerId || "unknown", externalOrderId }
    : { providerConnectionId: event.providerConnectionId, providerEventKey: event.providerEventKey };
  const candidateKey = await stableId("candidate-key", identity);
  const confidence = candidateConfidence(event);
  const warnings = [...new Set([
    ...event.warnings,
    ...event.orderProposal.warnings,
    ...(!externalOrderId ? ["MISSING_EXTERNAL_ORDER_ID"] : []),
    ...(!retailerId ? ["RETAILER_UNRESOLVED"] : []),
  ])];
  return Object.freeze({
    id: await stableId("order-candidate", identity),
    format: INBOX_ORDER_FORMAT,
    recordType: "ORDER_CANDIDATE",
    status: "ACTIVE",
    candidateKey,
    candidateVersion: 1,
    providerConnectionId: event.providerConnectionId,
    sourceEventIds: [event.id],
    eventHistory: [sourceEventSummary(event)],
    systemProposal: {
      retailerId,
      storeAccountId: event.orderProposal.storeAccountId || event.aliasMatch?.selectedStoreAccountIds?.[0] || null,
      aliasId: event.orderProposal.aliasId || event.aliasMatch?.selectedAliasId || null,
      profileId: event.orderProposal.profileId || event.aliasMatch?.selectedProfileId || null,
      externalOrderId,
      orderedAt: event.orderProposal.orderedAt,
      lineItems: safeInboxOrderClone(event.orderProposal.lineItems),
      subtotal: event.orderProposal.subtotal,
      discounts: event.orderProposal.discounts,
      tax: event.orderProposal.tax,
      shipping: event.orderProposal.shipping,
      total: event.orderProposal.total,
      refundAmount: event.orderProposal.refundAmount,
      currency: event.orderProposal.currency,
      fulfillmentType: event.orderProposal.fulfillmentType,
      pickupStoreReference: event.orderProposal.pickupStoreReference,
      shippingAddressReference: event.orderProposal.shippingAddressReference,
      orderStatus: eventOrderStatus(event),
      providerRawStatus: event.orderProposal.providerRawStatus,
      trackingReferences: safeInboxOrderClone(event.orderProposal.trackingReferences),
    },
    confidence: confidence.band,
    confidenceRationale: confidence.rationale,
    provenance: proposalProvenance(event),
    warnings,
    ownerReview: emptyOwnerReview(),
    ownerReviewRequired: true,
    automaticImportAllowed: false,
    purchaseCreated: false,
    inventoryCreated: false,
  });
}

function reconcileStatus(current, proposed) {
  if (!current || current === ORDER_STATES.UNKNOWN || current === ORDER_STATES.DETECTED) return proposed;
  if (TERMINAL_STATES.has(current) && !TERMINAL_STATES.has(proposed)) return current;
  if (current === ORDER_STATES.DELIVERED && [ORDER_STATES.PROCESSING, ORDER_STATES.SHIPPED].includes(proposed)) return current;
  if (current === ORDER_STATES.SHIPPED && [ORDER_STATES.CONFIRMED, ORDER_STATES.PROCESSING].includes(proposed)) return current;
  return proposed;
}

function mergeTracking(current = [], next = []) {
  const map = new Map();
  for (const entry of [...current, ...next]) {
    const key = `${entry.carrier || ""}:${entry.reference || ""}`;
    map.set(key, { ...(map.get(key) || {}), ...entry });
  }
  return [...map.values()];
}

function conflictingMoney(current, next) {
  return current && next && (current.currency !== next.currency || current.minorUnits !== next.minorUnits);
}

/** Add new provider evidence without overwriting the separate owner-review layer. */
export function reconcileOrderCandidate(candidate, event) {
  assertSafeInboxOrderInput(candidate);
  assertSafeInboxOrderInput(event);
  if (!ORDER_RELATED_CATEGORIES.has(event.category) || !event.orderProposal) return candidate;
  if (candidate.sourceEventIds.includes(event.id)) return candidate;
  const current = candidate.systemProposal;
  const next = event.orderProposal;
  const warnings = new Set([...candidate.warnings, ...event.warnings, ...next.warnings]);
  const nextRetailer = proposedRetailerId(event);
  const nextRelationships = {
    aliasId: next.aliasId || event.aliasMatch?.selectedAliasId || null,
    storeAccountId: next.storeAccountId || event.aliasMatch?.selectedStoreAccountIds?.[0] || null,
    profileId: next.profileId || event.aliasMatch?.selectedProfileId || null,
  };
  if (current.externalOrderId && next.externalOrderId && current.externalOrderId !== next.externalOrderId) warnings.add("EXTERNAL_ORDER_ID_CONFLICT");
  if (current.retailerId && nextRetailer && current.retailerId !== nextRetailer) warnings.add("RETAILER_CONFLICT");
  if (current.aliasId && nextRelationships.aliasId && current.aliasId !== nextRelationships.aliasId) warnings.add("ALIAS_CONFLICT");
  if (current.storeAccountId && nextRelationships.storeAccountId && current.storeAccountId !== nextRelationships.storeAccountId) warnings.add("STORE_ACCOUNT_CONFLICT");
  if (current.profileId && nextRelationships.profileId && current.profileId !== nextRelationships.profileId) warnings.add("PROFILE_CONFLICT");
  for (const field of ["subtotal", "discounts", "tax", "shipping", "total"]) {
    if (conflictingMoney(current[field], next[field])) warnings.add(`${field.toUpperCase()}_CONFLICT`);
  }
  if (current.currency && next.currency && current.currency !== next.currency) warnings.add("CURRENCY_CONFLICT");
  const eventStatus = eventOrderStatus(event);
  const systemProposal = {
    ...safeInboxOrderClone(current),
    retailerId: current.retailerId || nextRetailer,
    storeAccountId: current.storeAccountId || nextRelationships.storeAccountId,
    aliasId: current.aliasId || nextRelationships.aliasId,
    profileId: current.profileId || nextRelationships.profileId,
    externalOrderId: current.externalOrderId || next.externalOrderId,
    orderedAt: current.orderedAt || next.orderedAt,
    lineItems: next.lineItems.length ? safeInboxOrderClone(next.lineItems) : current.lineItems,
    subtotal: next.subtotal || current.subtotal,
    discounts: next.discounts || current.discounts,
    tax: next.tax || current.tax,
    shipping: next.shipping || current.shipping,
    total: next.total || current.total,
    refundAmount: next.refundAmount || current.refundAmount,
    currency: next.currency || current.currency,
    fulfillmentType: next.fulfillmentType !== "UNKNOWN" ? next.fulfillmentType : current.fulfillmentType,
    pickupStoreReference: next.pickupStoreReference || current.pickupStoreReference,
    shippingAddressReference: next.shippingAddressReference || current.shippingAddressReference,
    orderStatus: reconcileStatus(current.orderStatus, eventStatus),
    providerRawStatus: next.providerRawStatus || current.providerRawStatus,
    trackingReferences: mergeTracking(current.trackingReferences, next.trackingReferences),
  };
  const confidence = candidateConfidence(event);
  const result = {
    ...safeInboxOrderClone(candidate),
    candidateVersion: Number(candidate.candidateVersion || 1) + 1,
    sourceEventIds: [...candidate.sourceEventIds, event.id],
    eventHistory: [...candidate.eventHistory, sourceEventSummary(event)],
    systemProposal,
    confidence: warnings.size ? INBOX_ORDER_CONFIDENCE.LOW : confidence.band,
    confidenceRationale: [...new Set([...(candidate.confidenceRationale || []), ...confidence.rationale])],
    provenance: [
      ...(candidate.provenance || []),
      ...proposalProvenance(event),
    ],
    warnings: [...warnings],
    ownerReview: safeInboxOrderClone(candidate.ownerReview),
    ownerReviewRequired: true,
    automaticImportAllowed: false,
    purchaseCreated: false,
    inventoryCreated: false,
  };
  assertSafeInboxOrderInput(result);
  return Object.freeze(result);
}

const CORRECTABLE_FIELDS = new Set([
  "retailerId", "storeAccountId", "aliasId", "profileId", "externalOrderId", "orderedAt",
  "lineItems", "subtotal", "discounts", "tax", "shipping", "total", "refundAmount",
  "fulfillmentType", "pickupStoreReference", "shippingAddressReference", "orderStatus",
]);
const CORRECTABLE_MONEY_FIELDS = new Set(["subtotal", "discounts", "tax", "shipping", "total", "refundAmount"]);
const NULLABLE_CORRECTION_TEXT_FIELDS = new Map([
  ["retailerId", 160],
  ["storeAccountId", 160],
  ["aliasId", 160],
  ["profileId", 160],
  ["externalOrderId", 500],
  ["pickupStoreReference", 500],
  ["shippingAddressReference", 500],
]);

function normalizeCorrectionValue(candidate, field, value, index) {
  if (field === "lineItems") {
    const normalized = normalizeOrderProposal({
      currency: candidate.systemProposal?.currency || undefined,
      lineItems: value,
    });
    if (candidate.systemProposal?.currency && normalized.currency && normalized.currency !== candidate.systemProposal.currency) {
      throw new InboxOrderValidationError("CORRECTION_CURRENCY_MISMATCH", "Owner line-item corrections must use the candidate currency.");
    }
    return normalized.lineItems;
  }
  if (CORRECTABLE_MONEY_FIELDS.has(field)) {
    const money = assertMoney(value, { field: `corrections[${index}].value` });
    if (candidate.systemProposal?.currency && money.currency !== candidate.systemProposal.currency) {
      throw new InboxOrderValidationError("CORRECTION_CURRENCY_MISMATCH", "Owner money corrections must use the candidate currency.");
    }
    return money;
  }
  if (field === "orderStatus") {
    return normalizeEnum(value, ORDER_STATES, `corrections[${index}].value`);
  }
  if (field === "fulfillmentType") {
    return normalizeEnum(value, FULFILLMENT_TYPES, `corrections[${index}].value`);
  }
  if (field === "orderedAt") {
    return value == null ? null : normalizeIso(value, `corrections[${index}].value`, true);
  }
  if (NULLABLE_CORRECTION_TEXT_FIELDS.has(field)) {
    if (value == null) return null;
    return boundedText(value, `corrections[${index}].value`, NULLABLE_CORRECTION_TEXT_FIELDS.get(field), true);
  }
  return safeInboxOrderClone(value);
}

export function applyOwnerReview(candidate, review, now = () => new Date().toISOString(), idFactory = () => globalThis.crypto?.randomUUID?.()) {
  assertSafeInboxOrderInput(candidate);
  assertSafeInboxOrderInput(review);
  const action = String(review.action || "").toUpperCase();
  if (!["CONFIRM", "CORRECT", "REJECT"].includes(action)) {
    throw new InboxOrderValidationError("INVALID_REVIEW_ACTION", "Owner review action must be CONFIRM, CORRECT, or REJECT.");
  }
  const timestamp = new Date(now()).toISOString();
  const corrections = action === "CORRECT" ? (review.corrections || []) : [];
  if (!Array.isArray(corrections) || corrections.length > 100) {
    throw new InboxOrderValidationError("INVALID_CORRECTIONS", "Owner corrections must be a bounded array.");
  }
  const normalizedCorrections = corrections.map((correction, index) => {
    const field = String(correction?.field || "").trim();
    if (!CORRECTABLE_FIELDS.has(field)) {
      throw new InboxOrderValidationError("INVALID_CORRECTION_FIELD", `corrections[${index}].field is not owner-correctable.`);
    }
    return {
      correctionId: String(idFactory(`correction-${index}`) || `correction-${index}`),
      field,
      previousSystemValue: safeInboxOrderClone(candidate.systemProposal[field]),
      ownerValue: normalizeCorrectionValue(candidate, field, correction.value, index),
      reason: String(correction.reason || "").trim().slice(0, 1_000),
      provenance: INBOX_ORDER_PROVENANCE.OWNER_ENTERED,
      correctedAt: timestamp,
    };
  });
  const state = action === "CONFIRM"
    ? ORDER_REVIEW_STATES.CONFIRMED
    : action === "CORRECT"
      ? ORDER_REVIEW_STATES.CORRECTED
      : ORDER_REVIEW_STATES.REJECTED;
  return Object.freeze({
    ...safeInboxOrderClone(candidate),
    ownerReview: {
      ...safeInboxOrderClone(candidate.ownerReview),
      state,
      corrections: [...(candidate.ownerReview?.corrections || []), ...normalizedCorrections],
      confirmedAt: action === "CONFIRM" ? timestamp : candidate.ownerReview?.confirmedAt || null,
      rejectedAt: action === "REJECT" ? timestamp : null,
      rejectionReason: action === "REJECT" ? String(review.reason || "").trim().slice(0, 1_000) : null,
    },
    ownerReviewRequired: action === "REJECT" ? false : action !== "CONFIRM",
    automaticImportAllowed: false,
    purchaseCreated: false,
    inventoryCreated: false,
  });
}

export function candidateEventTypeForReview(action) {
  return action === "CONFIRM"
    ? CANDIDATE_EVENT_TYPES.OWNER_CONFIRMED
    : action === "CORRECT"
      ? CANDIDATE_EVENT_TYPES.OWNER_CORRECTED
      : CANDIDATE_EVENT_TYPES.OWNER_REJECTED;
}
