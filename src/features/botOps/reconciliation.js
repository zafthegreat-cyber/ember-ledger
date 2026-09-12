import { hashCanonicalJson } from "../backup/canonicalJson.js";
import { INTELLIGENCE_CONFIDENCE } from "../intelligence/constants.js";
import {
  BOT_ATTEMPT_EVENTS,
  BOT_EVIDENCE_REVIEW_STATES,
  BOT_FAILURE_CATEGORIES,
  BOT_PROVENANCE,
  BOT_PROVIDER_KEYS,
  BOT_TASK_STATUSES,
} from "./constants.js";
import { assertBotProviderAdapter } from "./providerAdapters.js";
import { assertSafeBotOpsInput, safeBotOpsClone, sanitizeBotProviderMessage } from "./security.js";

const FAILURE_STATUSES = new Set([
  BOT_TASK_STATUSES.FAILED,
  BOT_TASK_STATUSES.RATE_LIMITED,
  BOT_TASK_STATUSES.ACCOUNT_ERROR,
  BOT_TASK_STATUSES.PROXY_ERROR,
  BOT_TASK_STATUSES.PAYMENT_ERROR,
  BOT_TASK_STATUSES.RETAILER_BLOCK,
]);

export async function normalizeBotProviderEvent(adapter, input) {
  assertSafeBotOpsInput(input);
  const normalizedAdapter = assertBotProviderAdapter(adapter);
  const description = normalizedAdapter.describe();
  if (description.provider !== BOT_PROVIDER_KEYS.MOCK || description.testOnly !== true) {
    throw new Error("Phase 2D-A provider-event processing is restricted to the explicit test-only mock adapter.");
  }
  const normalized = await normalizedAdapter.normalizeEvent(input);
  assertSafeBotOpsInput(normalized);
  const event = safeBotOpsClone({ ...normalized, provider: description.provider });
  const sourceHash = await hashCanonicalJson(event);
  return Object.freeze({
    ...event,
    sourceHash,
    providerEventKey: `${event.provider}:${event.installationId}:${event.providerEventId}`,
  });
}

export function planTaskReconciliation(task, event) {
  const warnings = [];
  const eventTime = Date.parse(event.occurredAt);
  const lastTime = task.lastAttemptAt ? Date.parse(task.lastAttemptAt) : Number.NEGATIVE_INFINITY;
  const reordered = eventTime < lastTime;
  const currentSuccess = task.runtimeStatus === BOT_TASK_STATUSES.SUCCESS;
  const nextFailure = FAILURE_STATUSES.has(event.runtimeStatus);
  const contradictory = currentSuccess && nextFailure;

  if (reordered) warnings.push("REORDERED_PROVIDER_EVENT");
  if (contradictory) warnings.push("CONTRADICTORY_POST_SUCCESS_STATUS");
  if (!reordered && task.lastAttemptAt && eventTime === lastTime && task.runtimeStatus !== event.runtimeStatus) {
    warnings.push("CONFLICTING_TASK_STATE_AT_SAME_TIME");
  }

  const applyRuntimeStatus = !reordered && !contradictory;
  return Object.freeze({
    warnings,
    shouldUpdate: applyRuntimeStatus || !task.lastAttemptAt,
    patch: {
      runtimeStatus: applyRuntimeStatus ? event.runtimeStatus : task.runtimeStatus,
      lastAttemptAt: eventTime >= lastTime ? event.occurredAt : task.lastAttemptAt,
      lastResult: applyRuntimeStatus ? sanitizeBotProviderMessage(event.message, event.runtimeStatus) : task.lastResult,
      warnings: [...new Set([...(task.warnings || []), ...warnings])],
    },
  });
}

export function buildAttemptDraft(event, options = {}) {
  const reconciliationWarnings = options.reconciliationWarnings || [];
  const revisionWarnings = options.eventRevision > 1 ? ["PROVIDER_EVENT_CONTENT_CHANGED"] : [];
  return {
    id: options.attemptId,
    providerEventKey: event.providerEventKey,
    providerEventId: event.providerEventId,
    sourceHash: event.sourceHash,
    provider: event.provider,
    installationId: event.installationId,
    taskId: event.taskId,
    retailerId: event.retailerId,
    occurredAt: event.occurredAt,
    normalizedEvent: event.normalizedEvent || BOT_ATTEMPT_EVENTS.UNKNOWN,
    runtimeStatus: event.runtimeStatus || BOT_TASK_STATUSES.UNKNOWN,
    success: event.success === true,
    failureCategory: event.failureCategory || BOT_FAILURE_CATEGORIES.NONE,
    message: sanitizeBotProviderMessage(event.message),
    productTargetId: event.productTargetId || null,
    retailerAccountLinkId: event.retailerAccountLinkId || null,
    botProfileId: event.botProfileId || null,
    proxyGroupId: event.proxyGroupId || null,
    checkoutEvidenceId: options.checkoutEvidenceId || null,
    provenance: BOT_PROVENANCE.PROVIDER_NORMALIZED,
    eventRevision: options.eventRevision || 1,
    warnings: [...new Set([...(event.warnings || []), ...revisionWarnings, ...reconciliationWarnings])],
  };
}

export function checkoutEvidenceKey(event) {
  const identity = String(event.externalOrderReference || event.providerEventId).trim().toLowerCase();
  return `${event.provider}:${event.installationId}:${event.taskId}:${identity}`;
}

export function buildCheckoutEvidenceDraft(event, attempt, options = {}) {
  if (attempt.success !== true) return null;
  return {
    id: options.evidenceId || attempt.checkoutEvidenceId,
    evidenceKey: checkoutEvidenceKey(event),
    sourceHash: attempt.sourceHash,
    provider: attempt.provider,
    installationId: attempt.installationId,
    taskId: attempt.taskId,
    attemptId: attempt.id,
    retailerId: attempt.retailerId,
    productTargetId: attempt.productTargetId,
    quantity: event.quantity || 1,
    expectedAmount: event.expectedAmount || null,
    externalOrderReference: event.externalOrderReference || "",
    retailerAccountLinkId: attempt.retailerAccountLinkId,
    botProfileId: attempt.botProfileId,
    occurredAt: attempt.occurredAt,
    confidence: event.confidence || INTELLIGENCE_CONFIDENCE.LOW,
    warnings: [...new Set([...(attempt.warnings || []), "SYNTHETIC_CHECKOUT_EVIDENCE_REQUIRES_REVIEW"])],
    provenance: BOT_PROVENANCE.SYSTEM_DERIVED,
    reviewState: BOT_EVIDENCE_REVIEW_STATES.NEEDS_REVIEW,
    corrections: [],
    reviewedAt: null,
    orderCandidateLinks: [],
    requiresOwnerReview: true,
    purchaseCreated: false,
    automaticPurchaseCreationAllowed: false,
    inventoryCreated: false,
    automaticReceivingAllowed: false,
  };
}

export function mergeEvidenceConflict(existing, draft) {
  if (!existing || !draft || existing.evidenceKey !== draft.evidenceKey) return existing;
  const conflicts = [];
  if (existing.sourceHash !== draft.sourceHash) conflicts.push("CHECKOUT_EVIDENCE_SOURCE_CHANGED");
  if (existing.expectedAmount && draft.expectedAmount
    && (existing.expectedAmount.currency !== draft.expectedAmount.currency
      || existing.expectedAmount.minorUnits !== draft.expectedAmount.minorUnits)) {
    conflicts.push("CHECKOUT_EVIDENCE_AMOUNT_CONFLICT");
  }
  if (existing.externalOrderReference && draft.externalOrderReference
    && existing.externalOrderReference !== draft.externalOrderReference) {
    conflicts.push("CHECKOUT_EVIDENCE_REFERENCE_CONFLICT");
  }
  if (!conflicts.length) return existing;
  return {
    ...existing,
    reviewState: BOT_EVIDENCE_REVIEW_STATES.NEEDS_REVIEW,
    warnings: [...new Set([...(existing.warnings || []), ...conflicts])],
    requiresOwnerReview: true,
  };
}
