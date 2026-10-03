import { assertSafeAccountOpsInput } from "./security.js";
import { AccountOpsValidationError } from "./validators.js";

export const FUTURE_INBOX_CATEGORIES = Object.freeze([
  "VERIFICATION", "ORDER_CONFIRMATION", "SHIPPED", "DELIVERED", "CANCELLED", "REFUND", "PASSWORD_SECURITY", "RETAILER_NOTICE", "OTHER",
]);
export const FUTURE_ORDER_REVIEW_STATES = Object.freeze(["NEEDS_REVIEW", "READY_TO_IMPORT", "REJECTED", "IMPORTED"]);
const BODY_FIELDS = new Set(["body", "rawBody", "rawContent", "html", "textContent", "messageBody"]);

function text(value, maximum = 1_000) {
  const normalized = String(value || "").trim();
  if (normalized.length > maximum) throw new AccountOpsValidationError("FUTURE_CONTRACT_TEXT_TOO_LONG", "Future integration metadata is too long.");
  return normalized;
}

/** Metadata-only boundary. Phase 2A neither connects to a mailbox nor stores message bodies. */
export function normalizeFutureInboxMessageMetadata(input = {}) {
  assertSafeAccountOpsInput(input);
  const forbidden = Object.keys(input).find((key) => BODY_FIELDS.has(key));
  if (forbidden) throw new AccountOpsValidationError("MESSAGE_BODY_NOT_ALLOWED", "Phase 2A does not persist inbox message bodies.", { field: forbidden });
  const allowed = new Set(["messageId", "aliasId", "retailerId", "storeAccountId", "category", "subject", "sender", "receivedAt", "orderReference", "confidence", "source", "rawContentReference"]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) throw new AccountOpsValidationError("UNKNOWN_INBOX_FIELD", `Unsupported inbox metadata field: ${unknown[0]}.`);
  const category = String(input.category || "OTHER").toUpperCase();
  if (!FUTURE_INBOX_CATEGORIES.includes(category)) throw new AccountOpsValidationError("INVALID_INBOX_CATEGORY", "Inbox category is unsupported.");
  const receivedAt = input.receivedAt && Number.isFinite(Date.parse(input.receivedAt)) ? new Date(input.receivedAt).toISOString() : null;
  return Object.freeze({
    messageId: text(input.messageId, 500), aliasId: text(input.aliasId, 160), retailerId: text(input.retailerId, 160),
    storeAccountId: text(input.storeAccountId, 160), category, subject: text(input.subject, 500), sender: text(input.sender, 320),
    receivedAt, orderReference: text(input.orderReference, 300), confidence: text(input.confidence, 40) || "UNKNOWN",
    source: text(input.source, 160), rawContentReference: text(input.rawContentReference, 1_000) || null,
    parsingImplemented: false,
  });
}

/** A candidate remains external evidence until an owner explicitly reviews a future import. */
export function createFutureOrderCandidate(input = {}) {
  assertSafeAccountOpsInput(input);
  const allowed = new Set(["candidateId", "messageId", "aliasId", "retailerId", "storeAccountId", "profileId", "externalOrderId", "orderedAt", "summary", "source"]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) throw new AccountOpsValidationError("UNKNOWN_ORDER_FIELD", `Unsupported order-candidate field: ${unknown[0]}.`);
  return Object.freeze({
    candidateId: text(input.candidateId, 160), messageId: text(input.messageId, 500), aliasId: text(input.aliasId, 160),
    retailerId: text(input.retailerId, 160), storeAccountId: text(input.storeAccountId, 160), profileId: text(input.profileId, 160),
    externalOrderId: text(input.externalOrderId, 500), orderedAt: input.orderedAt && Number.isFinite(Date.parse(input.orderedAt)) ? new Date(input.orderedAt).toISOString() : null,
    summary: text(input.summary, 1_000), source: text(input.source, 160), reviewState: "NEEDS_REVIEW",
    ownerReviewRequired: true, purchaseCreated: false, inventoryCreated: false, automaticImportAllowed: false,
  });
}
