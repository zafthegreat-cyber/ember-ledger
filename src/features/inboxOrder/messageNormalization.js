import { hashCanonicalJson } from "../backup/canonicalJson.js";
import {
  INBOX_ORDER_CONFIDENCE,
  INBOX_ORDER_FORMAT,
  INBOX_ORDER_PROCESSING_VERSION,
  INBOX_ORDER_PROVENANCE,
  MESSAGE_CATEGORIES,
  MESSAGE_RETENTION,
} from "./constants.js";
import { InboxOrderValidationError, boundedText, normalizeIso, normalizeOrderProposal } from "./contracts.js";
import { identifyRetailer, matchRecipientAliases, normalizeEmailAddress } from "./matching.js";
import { assertSafeInboxOrderInput, containsProtectedSecretText } from "./security.js";

const MESSAGE_FIELDS = new Set([
  "provider", "providerConnectionId", "providerMessageId", "providerThreadId", "sender", "recipients",
  "subject", "receivedAt", "category", "providerMetadata", "orderProposal", "content",
]);

function normalizeSender(value) {
  const source = typeof value === "string" ? { address: value } : (value || {});
  const email = normalizeEmailAddress(source.address);
  return {
    address: email?.address || null,
    domain: email?.domain || null,
    displayName: boundedText(source.displayName, "sender.displayName", 300),
  };
}

function normalizeRecipients(value) {
  const entries = value == null ? [] : value;
  if (!Array.isArray(entries) || entries.length > 50) {
    throw new InboxOrderValidationError("INVALID_RECIPIENTS", "recipients must be a bounded array.");
  }
  return entries.map((entry) => normalizeEmailAddress(typeof entry === "string" ? entry : entry?.address)?.address).filter(Boolean);
}

function contentText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const strings = [];
    const stack = [value];
    let visited = 0;
    let totalLength = 0;
    while (stack.length && totalLength < 250_000) {
      const current = stack.pop();
      visited += 1;
      if (visited > 10_000) break;
      if (typeof current === "string") {
        strings.push(current);
        totalLength += current.length + 1;
      }
      else if (Array.isArray(current)) stack.push(...current);
      else if (current && typeof current === "object") stack.push(...Object.values(current));
    }
    return strings.join("\n").slice(0, 250_000);
  }
  return "";
}

function normalizeSafeProviderMetadata(value) {
  if (value == null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InboxOrderValidationError("INVALID_PROVIDER_METADATA", "providerMetadata must be an object.");
  }
  const allowed = new Set(["historyId", "internalDate", "sizeEstimate", "labels", "providerCategory"]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new InboxOrderValidationError(
      "UNSAFE_PROVIDER_METADATA",
      `Unsupported provider metadata field: ${unknown[0]}. Raw content and provider secrets are not retained.`,
    );
  }
  const labels = value.labels == null ? [] : value.labels;
  if (!Array.isArray(labels) || labels.length > 50) {
    throw new InboxOrderValidationError("INVALID_PROVIDER_LABELS", "Provider labels must be a bounded array.");
  }
  const sizeEstimate = value.sizeEstimate == null ? null : Number(value.sizeEstimate);
  if (sizeEstimate != null && (!Number.isSafeInteger(sizeEstimate) || sizeEstimate < 0)) {
    throw new InboxOrderValidationError("INVALID_PROVIDER_SIZE", "Provider size metadata must be a non-negative safe integer.");
  }
  return {
    historyId: boundedText(value.historyId, "providerMetadata.historyId", 500) || null,
    internalDate: value.internalDate == null ? null : normalizeIso(value.internalDate, "providerMetadata.internalDate"),
    sizeEstimate,
    labels: [...new Set(labels.map((label) => boundedText(label, "providerMetadata.labels", 160, true)))],
    providerCategory: boundedText(value.providerCategory, "providerMetadata.providerCategory", 160) || null,
  };
}

function proposedCategory(input, subject, rawContent) {
  const supplied = String(input.category || "").trim().toUpperCase();
  const supported = new Set(Object.values(MESSAGE_CATEGORIES));
  if (supplied && !supported.has(supplied)) {
    throw new InboxOrderValidationError("INVALID_MESSAGE_CATEGORY", "Message category is unsupported.");
  }
  const combined = `${subject}\n${rawContent}`;
  if (supplied === MESSAGE_CATEGORIES.PROTECTED
    || supplied === MESSAGE_CATEGORIES.PASSWORD_SECURITY
    || supplied === MESSAGE_CATEGORIES.VERIFICATION
    || containsProtectedSecretText(combined)) return MESSAGE_CATEGORIES.PROTECTED;
  if (supplied) return supplied;
  if (/order\s+(?:confirmation|received)/i.test(combined)) return MESSAGE_CATEGORIES.ORDER_CONFIRMATION;
  if (/\bshipped\b|tracking/i.test(combined)) return MESSAGE_CATEGORIES.SHIPPED;
  if (/\bdelivered\b/i.test(combined)) return MESSAGE_CATEGORIES.DELIVERED;
  if (/\bcancel(?:led|ed|ation)\b/i.test(combined)) return MESSAGE_CATEGORIES.CANCELLED;
  if (/\brefund(?:ed)?\b/i.test(combined)) return MESSAGE_CATEGORIES.REFUND;
  if (/ready\s+for\s+pickup/i.test(combined)) return MESSAGE_CATEGORIES.PICKUP;
  if (/verify\s+(?:your\s+)?email/i.test(combined)) return MESSAGE_CATEGORIES.VERIFICATION;
  return MESSAGE_CATEGORIES.OTHER;
}

async function stableIdentifier(prefix, value) {
  const hash = await hashCanonicalJson(value);
  return `${prefix}:${hash.slice(0, 32)}`;
}

/**
 * Normalize untrusted provider input into minimized immutable evidence. Raw
 * content is consumed ephemerally and is never returned or hashed.
 */
export async function normalizeProviderMessage(input = {}, context = {}) {
  assertSafeInboxOrderInput(input, { allowRawContent: true, maximumString: 250_000 });
  const unknown = Object.keys(input).filter((key) => !MESSAGE_FIELDS.has(key));
  if (unknown.length) throw new InboxOrderValidationError("UNKNOWN_MESSAGE_FIELD", `Unsupported message field: ${unknown[0]}.`);
  const provider = boundedText(input.provider, "provider", 80, true).toUpperCase();
  const providerConnectionId = boundedText(input.providerConnectionId, "providerConnectionId", 160, true);
  const providerMessageId = boundedText(input.providerMessageId, "providerMessageId", 500, true);
  const providerThreadId = boundedText(input.providerThreadId, "providerThreadId", 500) || null;
  const receivedAt = normalizeIso(input.receivedAt, "receivedAt", true);
  const sender = normalizeSender(input.sender);
  const recipients = normalizeRecipients(input.recipients);
  const originalSubject = boundedText(input.subject, "subject", 500);
  const rawContent = contentText(input.content);
  const providerMetadata = normalizeSafeProviderMetadata(input.providerMetadata);
  const category = proposedCategory(input, originalSubject, rawContent);
  const isSecurityProtected = category === MESSAGE_CATEGORIES.PROTECTED;
  // An unrelated personal message is retained only as a minimal deduplication
  // event. Code 3 must not become a second permanent mailbox merely because a
  // provider supplied an otherwise valid message envelope.
  const isUnrelated = category === MESSAGE_CATEGORIES.OTHER;
  const isMinimized = isSecurityProtected || isUnrelated;
  const aliasMatch = matchRecipientAliases(recipients, context.accountOps || {});
  const retailerProposal = identifyRetailer({ sender, aliasMatch }, context.retailerIdentification || {});
  const orderProposal = isMinimized || input.orderProposal == null ? null : normalizeOrderProposal(input.orderProposal);
  const warnings = [...aliasMatch.warnings, ...retailerProposal.warnings];
  if (!sender.address) warnings.push("SENDER_ADDRESS_UNAVAILABLE");
  if (isSecurityProtected) warnings.push("PROTECTED_CONTENT_MINIMIZED");
  if (isUnrelated) warnings.push("UNRELATED_CONTENT_MINIMIZED");
  if (input.content != null && !isMinimized) warnings.push("RAW_CONTENT_NOT_RETAINED");
  if (orderProposal?.retailerId && retailerProposal.proposedRetailerId
    && orderProposal.retailerId !== retailerProposal.proposedRetailerId) warnings.push("ORDER_RETAILER_CONFLICT");

  const safeSubject = isSecurityProtected
    ? "Protected account message"
    : isUnrelated
      ? "Unrelated message"
      : originalSubject;
  const safeSender = isMinimized
    ? { address: null, domain: isSecurityProtected ? sender.domain : null, displayName: "" }
    : sender;
  const sanitizedForHash = {
    provider,
    providerConnectionId,
    providerMessageId,
    providerThreadId,
    sender: safeSender,
    recipientAliasIds: aliasMatch.matches.map((entry) => entry.aliasId).sort(),
    subject: safeSubject,
    receivedAt,
    category,
    providerMetadata,
    orderProposal,
    processingVersion: INBOX_ORDER_PROCESSING_VERSION,
  };
  assertSafeInboxOrderInput(sanitizedForHash);
  const sourceHash = await hashCanonicalJson(sanitizedForHash);
  const providerEventKey = await stableIdentifier("provider-event", { providerConnectionId, providerMessageId });
  const id = await stableIdentifier("message-event", { providerConnectionId, providerMessageId, sourceHash });
  const confidence = isMinimized
    ? INBOX_ORDER_CONFIDENCE.INSUFFICIENT
    : retailerProposal.confidence;

  const result = {
    id,
    format: INBOX_ORDER_FORMAT,
    recordType: "NORMALIZED_MESSAGE_EVENT",
    status: "ACTIVE",
    provider,
    providerConnectionId,
    providerMessageId,
    providerThreadId,
    providerEventKey,
    messageRevision: 1,
    sender: safeSender,
    recipientAddresses: isMinimized ? [] : recipients,
    aliasMatch: {
      matchType: aliasMatch.matchType,
      aliasIds: aliasMatch.matches.map((entry) => entry.aliasId),
      selectedAliasId: aliasMatch.selected?.aliasId || null,
      selectedProfileId: aliasMatch.selected?.profileId || null,
      selectedStoreAccountIds: aliasMatch.selected?.storeAccountIds || [],
      selectedRetailerId: aliasMatch.selected?.retailerId || null,
    },
    subject: safeSubject,
    receivedAt,
    category,
    protected: isMinimized,
    retention: isSecurityProtected
      ? MESSAGE_RETENTION.PROTECTED_MINIMUM
      : isUnrelated
        ? MESSAGE_RETENTION.DISCARDED_AFTER_CLASSIFICATION
        : MESSAGE_RETENTION.STRUCTURED_METADATA,
    retailerProposal,
    orderProposal,
    confidence,
    provenance: [
      { field: "providerMessageId", kind: INBOX_ORDER_PROVENANCE.PROVIDER_SUPPLIED },
      { field: "receivedAt", kind: INBOX_ORDER_PROVENANCE.PROVIDER_SUPPLIED },
      ...(aliasMatch.selected ? [{ field: "aliasMatch", kind: INBOX_ORDER_PROVENANCE.INFERRED }] : []),
      ...(retailerProposal.proposedRetailerId ? [{ field: "retailerProposal", kind: INBOX_ORDER_PROVENANCE.INFERRED }] : []),
    ],
    warnings: [...new Set(warnings)],
    sourceHash,
    processingVersion: INBOX_ORDER_PROCESSING_VERSION,
    rawContentRetained: false,
    purchaseCreated: false,
    automaticImportAllowed: false,
  };
  assertSafeInboxOrderInput(result);
  return Object.freeze(result);
}
