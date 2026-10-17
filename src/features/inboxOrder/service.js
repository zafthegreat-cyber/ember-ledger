import { hashCanonicalJson } from "../backup/canonicalJson.js";
import { CANDIDATE_EVENT_TYPES, INBOX_ORDER_FORMAT } from "./constants.js";
import { normalizeProviderMessage } from "./messageNormalization.js";
import {
  applyOwnerReview,
  candidateEventTypeForReview,
  createOrderCandidateFromEvent,
  reconcileOrderCandidate,
} from "./orderCandidate.js";
import { createInboxOrderPersistence } from "./persistence.js";
import { assertSafeInboxOrderInput, safeInboxOrderClone } from "./security.js";

async function listAll(gateway) {
  const records = [];
  let cursor = null;
  for (let page = 0; page < 100; page += 1) {
    const result = await gateway.list({ limit: 100, cursor, includeArchived: true });
    records.push(...result.records);
    cursor = result.nextCursor;
    if (!cursor) return records;
  }
  throw new Error("Inbox/order collection exceeds its bounded read limit.");
}

function withoutSystemFields(record) {
  const result = safeInboxOrderClone(record);
  for (const key of ["id", "recordVersion", "createdAt", "updatedAt", "archivedAt"]) delete result[key];
  return result;
}

export function createInboxOrderService(options = {}) {
  if (["mode", "remoteDataSource", "request", "sync", "migrationApply"].some((key) => Object.prototype.hasOwnProperty.call(options, key))) {
    throw new Error("Inbox/order service is fixed to LOCAL_ONLY and does not accept remote activation options.");
  }
  const now = options.now || (() => new Date().toISOString());
  let sequence = 0;
  const idFactory = options.idFactory || ((prefix) => `${prefix}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${sequence += 1}`}`);
  const persistence = createInboxOrderPersistence({
    storage: options.storage,
    repository: options.repository,
    now,
    idFactory,
  });
  const { messageEvents, orderCandidates, candidateEvents, activity } = persistence.collections;

  async function appendCandidateEvent(candidate, type, details = {}) {
    const timestamp = new Date(now()).toISOString();
    const event = {
      id: String(idFactory("candidate-event")),
      format: INBOX_ORDER_FORMAT,
      recordType: "ORDER_CANDIDATE_EVENT",
      status: "ACTIVE",
      candidateId: candidate.id,
      type,
      occurredAt: timestamp,
      details: safeInboxOrderClone(details),
      purchaseCreated: false,
    };
    return candidateEvents.create(event);
  }

  async function appendActivity(type, summary, relationships = {}) {
    return activity.create({
      id: String(idFactory("inbox-order-activity")),
      format: INBOX_ORDER_FORMAT,
      recordType: "INBOX_ORDER_ACTIVITY",
      status: "ACTIVE",
      type,
      summary: String(summary).slice(0, 1_000),
      occurredAt: new Date(now()).toISOString(),
      candidateId: relationships.candidateId || null,
      messageEventId: relationships.messageEventId || null,
      warningCount: Number(relationships.warningCount || 0),
      errorCount: Number(relationships.errorCount || 0),
      reviewFingerprint: relationships.reviewFingerprint || null,
    });
  }

  async function reconcileEventIntoCandidate(event, providerRevisionCount) {
    const candidateDraft = await createOrderCandidateFromEvent(event);
    if (!candidateDraft) return { candidate: null, candidateEventType: null, wroteCandidate: false };
    const candidates = await listAll(orderCandidates);
    const existing = candidates.find((entry) => entry.candidateKey === candidateDraft.candidateKey)
      || candidates.find((entry) => {
        const sameConnection = entry.providerConnectionId === candidateDraft.providerConnectionId;
        const externalOrderId = candidateDraft.systemProposal.externalOrderId;
        const sameOrder = externalOrderId && entry.systemProposal?.externalOrderId === externalOrderId;
        // Stable provider connection + external order identity wins over a
        // conflicting retailer inference. Reconciliation preserves that
        // contradiction for owner review instead of splitting one order.
        return sameConnection && sameOrder;
      });
    if (existing?.sourceEventIds.includes(event.id)) {
      return { candidate: existing, candidateEventType: null, wroteCandidate: false };
    }
    if (existing) {
      const reconciled = reconcileOrderCandidate(existing, event);
      const candidate = await orderCandidates.update(existing.id, withoutSystemFields(reconciled), existing.recordVersion);
      return {
        candidate,
        candidateEventType: providerRevisionCount > 1
          ? CANDIDATE_EVENT_TYPES.SOURCE_EVENT_REVISED
          : CANDIDATE_EVENT_TYPES.SOURCE_EVENT_ADDED,
        wroteCandidate: true,
      };
    }
    const duplicateAcrossConnections = candidates.some((entry) =>
      entry.systemProposal?.externalOrderId
      && entry.systemProposal.externalOrderId === candidateDraft.systemProposal.externalOrderId
      && entry.systemProposal.retailerId === candidateDraft.systemProposal.retailerId
      && entry.providerConnectionId !== candidateDraft.providerConnectionId);
    const createPayload = duplicateAcrossConnections
      ? { ...candidateDraft, warnings: [...candidateDraft.warnings, "DUPLICATE_EXTERNAL_ORDER_ACROSS_CONNECTIONS"] }
      : candidateDraft;
    const candidate = await orderCandidates.create(createPayload);
    return { candidate, candidateEventType: CANDIDATE_EVENT_TYPES.DETECTED, wroteCandidate: true };
  }

  async function ensureProcessingHistory(event, candidate, candidateEventType) {
    let wroteHistory = false;
    if (candidate) {
      const history = await listAll(candidateEvents);
      const hasEventHistory = history.some((entry) => entry.candidateId === candidate.id
        && entry.details?.messageEventId === event.id);
      if (!hasEventHistory) {
        await appendCandidateEvent(candidate, candidateEventType || CANDIDATE_EVENT_TYPES.SOURCE_EVENT_ADDED, {
          messageEventId: event.id,
          sourceHash: event.sourceHash,
        });
        wroteHistory = true;
      }
    }
    const activities = await listAll(activity);
    if (!activities.some((entry) => entry.messageEventId === event.id)) {
      await appendActivity("MESSAGE_NORMALIZED", candidate ? "A message was normalized into an owner-review Order Candidate." : "A message was normalized without creating an Order Candidate.", {
        candidateId: candidate?.id,
        messageEventId: event.id,
        warningCount: event.warnings.length,
      });
      wroteHistory = true;
    }
    return wroteHistory;
  }

  async function processMessage(input, context = {}) {
    assertSafeInboxOrderInput(context);
    const normalized = await normalizeProviderMessage(input, context);
    const existingEvents = await listAll(messageEvents);
    const exact = existingEvents.find((event) => event.providerEventKey === normalized.providerEventKey
      && event.sourceHash === normalized.sourceHash);
    if (exact) {
      const providerRevisionCount = existingEvents.filter((event) => event.providerEventKey === exact.providerEventKey).length;
      const candidateResult = await reconcileEventIntoCandidate(exact, providerRevisionCount);
      const repairedHistory = await ensureProcessingHistory(exact, candidateResult.candidate, candidateResult.candidateEventType);
      return Object.freeze({
        event: exact,
        candidate: candidateResult.candidate,
        deduplicated: true,
        wroteRecords: candidateResult.wroteCandidate || repairedHistory,
      });
    }
    const revisions = existingEvents.filter((event) => event.providerEventKey === normalized.providerEventKey);
    const event = await messageEvents.create({
      ...normalized,
      messageRevision: revisions.length + 1,
      warnings: [...new Set([
        ...normalized.warnings,
        ...(revisions.length ? ["PROVIDER_MESSAGE_CONTENT_CHANGED"] : []),
      ])],
    });
    const candidateResult = await reconcileEventIntoCandidate(event, revisions.length + 1);
    const candidate = candidateResult.candidate;
    await ensureProcessingHistory(event, candidate, candidateResult.candidateEventType);
    return Object.freeze({ event, candidate, deduplicated: false, wroteRecords: true });
  }

  async function reviewCandidate(candidateId, review, expectedVersion) {
    assertSafeInboxOrderInput(review);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("Owner review requires the expected recordVersion.");
    const current = await orderCandidates.getById(candidateId);
    if (!current) throw new Error("Order Candidate was not found.");
    const reviewFingerprint = await hashCanonicalJson({ candidateId, expectedVersion, review });
    if (current.ownerReview?.lastReviewFingerprint === reviewFingerprint) {
      const reviewEvents = await listAll(candidateEvents);
      if (!reviewEvents.some((entry) => entry.details?.reviewFingerprint === reviewFingerprint)) {
        await appendCandidateEvent(current, candidateEventTypeForReview(String(review.action).toUpperCase()), {
          correctionCount: review.corrections?.length || 0,
          reviewState: current.ownerReview.state,
          reviewFingerprint,
        });
      }
      const activities = await listAll(activity);
      if (!activities.some((entry) => entry.reviewFingerprint === reviewFingerprint)) {
        await appendActivity("CANDIDATE_REVIEWED", `Order Candidate review completed: ${current.ownerReview.state}.`, {
          candidateId,
          reviewFingerprint,
        });
      }
      return current;
    }
    const applied = applyOwnerReview(current, review, now, idFactory);
    const reviewed = {
      ...applied,
      ownerReview: { ...applied.ownerReview, lastReviewFingerprint: reviewFingerprint },
    };
    const updated = await orderCandidates.update(candidateId, withoutSystemFields(reviewed), expectedVersion);
    const action = String(review.action).toUpperCase();
    await appendCandidateEvent(updated, candidateEventTypeForReview(action), {
      correctionCount: review.corrections?.length || 0,
      reviewState: updated.ownerReview.state,
      reviewFingerprint,
    });
    await appendActivity("CANDIDATE_REVIEWED", `Order Candidate review completed: ${updated.ownerReview.state}.`, {
      candidateId,
      reviewFingerprint,
    });
    return updated;
  }

  async function stateHash() {
    return hashCanonicalJson(persistence.repository.load());
  }

  return Object.freeze({
    mode: persistence.mode,
    authoritative: persistence.authoritative,
    remoteActive: false,
    storageKey: persistence.repository.storageKey,
    processMessage,
    reviewCandidate,
    listMessageEvents: () => listAll(messageEvents),
    listOrderCandidates: () => listAll(orderCandidates),
    listCandidateEvents: () => listAll(candidateEvents),
    listActivity: () => listAll(activity),
    getCandidate: (id) => orderCandidates.getById(id),
    stateHash,
  });
}
