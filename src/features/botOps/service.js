import { hashCanonicalJson } from "../backup/canonicalJson.js";
import {
  BOT_EVIDENCE_REVIEW_STATES,
  BOT_OPS_COLLECTIONS,
  BOT_OPS_FORMAT,
  BOT_PROVENANCE,
  BOT_PROVIDER_KEYS,
} from "./constants.js";
import { createBotOpsPersistence } from "./persistence.js";
import { assertBotProviderAdapter } from "./providerAdapters.js";
import { listBotProviders } from "./providerRegistry.js";
import {
  buildAttemptDraft,
  buildCheckoutEvidenceDraft,
  checkoutEvidenceKey,
  mergeEvidenceConflict,
  normalizeBotProviderEvent,
  planTaskReconciliation,
} from "./reconciliation.js";
import { assertSafeBotOpsInput, safeBotOpsClone } from "./security.js";
import { BOT_OPS_RECORD_NORMALIZERS } from "./validators.js";

const PROHIBITED_OPTIONS = new Set([
  "mode", "persistenceMode", "remoteDataSource", "request", "remoteActive", "sync",
  "migrationApply", "rollbackExecutor", "providerNetworkAccess", "liveAdapter",
]);
const DIRECTLY_MUTABLE_COLLECTIONS = new Set(BOT_OPS_COLLECTIONS.filter((collection) => !["attempts", "checkoutEvidence", "activity"].includes(collection)));

async function listAll(gateway) {
  const records = [];
  let cursor = null;
  for (let page = 0; page < 100; page += 1) {
    const result = await gateway.list({ limit: 100, cursor, includeArchived: true });
    records.push(...result.records);
    cursor = result.nextCursor;
    if (!cursor) return records;
  }
  throw new Error("Bot Operations collection exceeds its bounded read limit.");
}

function withoutSystemFields(record) {
  const result = safeBotOpsClone(record);
  for (const key of ["id", "recordVersion", "createdAt", "updatedAt", "archivedAt"]) delete result[key];
  return result;
}

function assertNoCallerMode(options) {
  const prohibited = Object.keys(options || {}).find((key) => PROHIBITED_OPTIONS.has(key));
  if (prohibited) throw new Error(`Bot Operations does not accept ${prohibited}; LOCAL_ONLY is fixed and provider network access is unavailable.`);
}

export function createBotOpsService(options = {}) {
  assertNoCallerMode(options);
  const now = options.now || (() => new Date().toISOString());
  let sequence = 0;
  const idFactory = options.idFactory || ((prefix) => `${prefix}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${sequence += 1}`}`);
  const persistence = createBotOpsPersistence({
    storage: options.storage,
    repository: options.repository,
    now,
    idFactory,
  });
  const testAdapter = options.testAdapter ? assertBotProviderAdapter(options.testAdapter) : null;
  if (testAdapter) {
    const description = testAdapter.describe();
    if (description.provider !== BOT_PROVIDER_KEYS.MOCK || description.testOnly !== true || description.live !== false || description.networkAccess !== false) {
      throw new Error("Only the explicit non-network test adapter may be supplied in Phase 2D-A.");
    }
  }
  const collections = persistence.collections;

  function snapshot() {
    const state = persistence.repository.load();
    return safeBotOpsClone({
      ...state,
      providers: listBotProviders(),
      persistence: {
        mode: "LOCAL_ONLY",
        authoritative: "LOCAL_ONLY",
        remoteActive: false,
        providerNetworkAccess: false,
      },
    });
  }

  async function getRequired(collection, recordId) {
    if (!BOT_OPS_COLLECTIONS.includes(collection)) throw new Error(`Unknown Bot Operations collection: ${collection}.`);
    const record = await collections[collection].getById(recordId);
    if (!record) throw new Error(`${collection} record ${String(recordId)} was not found.`);
    return record;
  }

  async function createInstallation(input) {
    if (input.provider === BOT_PROVIDER_KEYS.MOCK && !testAdapter) throw new Error("Mock Bot Installation records are restricted to explicit test execution.");
    return collections.installations.create(input);
  }

  async function createRetailerAccountLink(input) {
    return collections.retailerAccountLinks.create(input);
  }

  async function createBotProfile(input) {
    return collections.botProfiles.create(input);
  }

  async function createProxyGroup(input) {
    for (const installationId of input.installationIds || []) await getRequired("installations", installationId);
    return collections.proxyGroups.create(input);
  }

  async function createProductTarget(input) {
    return collections.productTargets.create(input);
  }

  async function assertTaskGroupRelationships(input) {
    const installation = await getRequired("installations", input.installationId);
    if (installation.provider !== input.provider) throw new Error("Task Group provider must match its Bot Installation.");
    if (input.retailerAccountLinkId) {
      const link = await getRequired("retailerAccountLinks", input.retailerAccountLinkId);
      if (link.retailerId !== input.retailerId) throw new Error("Task Group retailer must match its Account Ops account link.");
    }
    if (input.botProfileId) await getRequired("botProfiles", input.botProfileId);
    if (input.proxyGroupId) await getRequired("proxyGroups", input.proxyGroupId);
  }

  async function assertTaskRelationships(input) {
    const [group, target, installation] = await Promise.all([
      getRequired("taskGroups", input.taskGroupId),
      getRequired("productTargets", input.productTargetId),
      getRequired("installations", input.installationId),
    ]);
    if (group.provider !== input.provider || installation.provider !== input.provider) throw new Error("Task provider must match its Task Group and Bot Installation.");
    if (group.retailerId !== input.retailerId || target.retailerId !== input.retailerId) throw new Error("Task retailer must match its Task Group and Product Target.");
    if (group.installationId !== input.installationId) throw new Error("Task Installation must match its Task Group.");
  }

  async function createTaskGroup(input) {
    if (input.provider === BOT_PROVIDER_KEYS.MOCK && !testAdapter) throw new Error("Mock Task Groups are restricted to explicit test execution.");
    await assertTaskGroupRelationships(input);
    return collections.taskGroups.create(input);
  }

  async function createTask(input) {
    if (input.provider === BOT_PROVIDER_KEYS.MOCK && !testAdapter) throw new Error("Mock Bot Tasks are restricted to explicit test execution.");
    await assertTaskRelationships(input);
    return collections.tasks.create(input);
  }

  async function updateRecord(collection, recordId, input, expectedVersion) {
    if (!DIRECTLY_MUTABLE_COLLECTIONS.has(collection)) throw new Error(`${collection} requires its dedicated append-only review/reconciliation workflow.`);
    const current = await getRequired(collection, recordId);
    const candidate = BOT_OPS_RECORD_NORMALIZERS[collection]({ ...current, ...input }, { persisted: true });
    if (collection === "installations" && candidate.provider !== current.provider) throw new Error("Bot Installation provider is immutable.");
    if (collection === "retailerAccountLinks") {
      for (const installationId of candidate.installationIds) await getRequired("installations", installationId);
      const linkedGroups = (await listAll(collections.taskGroups)).filter((entry) => entry.retailerAccountLinkId === candidate.id);
      if (linkedGroups.some((entry) => entry.retailerId !== candidate.retailerId)) throw new Error("Retailer Account link changes would invalidate an existing Task Group.");
    }
    if (collection === "botProfiles") {
      for (const installationId of candidate.installationIds) await getRequired("installations", installationId);
    }
    if (collection === "proxyGroups") {
      for (const installationId of candidate.installationIds) await getRequired("installations", installationId);
    }
    if (collection === "productTargets") {
      const linkedTasks = (await listAll(collections.tasks)).filter((entry) => entry.productTargetId === candidate.id);
      if (linkedTasks.some((entry) => entry.retailerId !== candidate.retailerId)) throw new Error("Product Target changes would invalidate an existing Task.");
    }
    if (collection === "taskGroups") await assertTaskGroupRelationships(candidate);
    if (collection === "tasks") await assertTaskRelationships(candidate);
    return collections[collection].update(recordId, input, expectedVersion);
  }

  async function archiveRecord(collection, recordId, expectedVersion) {
    if (!DIRECTLY_MUTABLE_COLLECTIONS.has(collection)) throw new Error(`${collection} requires its dedicated append-only review/reconciliation workflow.`);
    return collections[collection].archive(recordId, expectedVersion);
  }

  async function appendActivity(type, summary, relationships = {}) {
    const existing = relationships.attemptId
      ? (await listAll(collections.activity)).find((entry) => entry.attemptId === relationships.attemptId && entry.type === type)
      : null;
    if (existing) return existing;
    return collections.activity.create({
      id: String(idFactory("bot-activity")),
      format: BOT_OPS_FORMAT,
      recordType: "BOT_ACTIVITY",
      status: "ACTIVE",
      type,
      summary: String(summary).slice(0, 500),
      occurredAt: new Date(now()).toISOString(),
      installationId: relationships.installationId || null,
      taskGroupId: relationships.taskGroupId || null,
      taskId: relationships.taskId || null,
      attemptId: relationships.attemptId || null,
      checkoutEvidenceId: relationships.checkoutEvidenceId || null,
      warnings: relationships.warnings || [],
    });
  }

  async function ensureCheckoutEvidence(event, attempt) {
    if (!attempt.success) return null;
    const allEvidence = await listAll(collections.checkoutEvidence);
    const evidenceId = attempt.checkoutEvidenceId;
    const draft = buildCheckoutEvidenceDraft(event, attempt, { evidenceId });
    const existing = allEvidence.find((entry) => entry.id === evidenceId || entry.evidenceKey === checkoutEvidenceKey(event));
    if (!existing) return collections.checkoutEvidence.create(draft);
    const merged = mergeEvidenceConflict(existing, draft);
    if (merged !== existing) return collections.checkoutEvidence.update(existing.id, withoutSystemFields(merged), existing.recordVersion);
    return existing;
  }

  async function applyAttemptToTask(task, event) {
    const plan = planTaskReconciliation(task, event);
    const unchanged = plan.patch.runtimeStatus === task.runtimeStatus
      && plan.patch.lastAttemptAt === task.lastAttemptAt
      && plan.patch.lastResult === task.lastResult
      && JSON.stringify(plan.patch.warnings) === JSON.stringify(task.warnings || []);
    if (unchanged || (!plan.shouldUpdate && plan.warnings.every((warning) => task.warnings?.includes(warning)))) return task;
    return collections.tasks.update(task.id, plan.patch, task.recordVersion);
  }

  async function ingestProviderEvent(input) {
    if (!testAdapter) throw new Error("No bot provider adapter is configured. Phase 2D-A supports synthetic test adapters only.");
    const event = await normalizeBotProviderEvent(testAdapter, input);
    const [installation, task] = await Promise.all([
      getRequired("installations", event.installationId),
      getRequired("tasks", event.taskId),
    ]);
    if (installation.provider !== event.provider || task.provider !== event.provider || task.installationId !== event.installationId) {
      throw new Error("Provider event identity does not match the referenced Bot Installation and Task.");
    }
    if (task.retailerId !== event.retailerId) throw new Error("Provider event retailer does not match the referenced Task.");
    if (event.productTargetId && event.productTargetId !== task.productTargetId) throw new Error("Provider event product does not match the referenced Task.");
    if (event.retailerAccountLinkId && event.retailerAccountLinkId !== task.retailerAccountLinkId) throw new Error("Provider event Account Ops link does not match the referenced Task.");

    const attempts = await listAll(collections.attempts);
    const exact = attempts.find((entry) => entry.providerEventKey === event.providerEventKey && entry.sourceHash === event.sourceHash);
    if (exact) {
      const evidence = await ensureCheckoutEvidence(event, exact);
      const updatedTask = await applyAttemptToTask(task, event);
      await appendActivity("PROVIDER_EVENT_NORMALIZED", "A synthetic Bot provider event was normalized without external effects.", {
        installationId: event.installationId, taskId: event.taskId, attemptId: exact.id, checkoutEvidenceId: evidence?.id,
      });
      return Object.freeze({ attempt: exact, checkoutEvidence: evidence, task: updatedTask, deduplicated: true, wroteAttempt: false });
    }

    const revisions = attempts.filter((entry) => entry.providerEventKey === event.providerEventKey);
    const plan = planTaskReconciliation(task, event);
    const attemptId = String(idFactory("bot-attempt"));
    let evidenceId = null;
    if (event.success === true) {
      const existingEvidence = (await listAll(collections.checkoutEvidence))
        .find((entry) => entry.evidenceKey === checkoutEvidenceKey(event));
      evidenceId = existingEvidence?.id || String(idFactory("bot-checkout-evidence"));
    }
    const attempt = await collections.attempts.create(buildAttemptDraft(event, {
      attemptId,
      checkoutEvidenceId: evidenceId,
      eventRevision: revisions.length + 1,
      reconciliationWarnings: plan.warnings,
    }));
    const evidence = await ensureCheckoutEvidence(event, attempt);
    const updatedTask = await applyAttemptToTask(task, event);
    await appendActivity("PROVIDER_EVENT_NORMALIZED", "A synthetic Bot provider event was normalized without external effects.", {
      installationId: event.installationId, taskId: event.taskId, attemptId: attempt.id, checkoutEvidenceId: evidence?.id,
      warnings: attempt.warnings,
    });
    return Object.freeze({ attempt, checkoutEvidence: evidence, task: updatedTask, deduplicated: false, wroteAttempt: true });
  }

  async function reviewCheckoutEvidence(evidenceId, review, expectedVersion) {
    assertSafeBotOpsInput(review);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("Checkout Evidence review requires the expected recordVersion.");
    const current = await getRequired("checkoutEvidence", evidenceId);
    const action = String(review?.action || "").toUpperCase();
    const stateByAction = {
      CONFIRM: BOT_EVIDENCE_REVIEW_STATES.CONFIRMED,
      CORRECT: BOT_EVIDENCE_REVIEW_STATES.CORRECTED,
      REJECT: BOT_EVIDENCE_REVIEW_STATES.REJECTED,
    };
    if (!stateByAction[action]) throw new Error("Checkout Evidence review action must be CONFIRM, CORRECT, or REJECT.");
    const timestamp = new Date(now()).toISOString();
    const corrections = action === "CORRECT"
      ? (review.corrections || []).map((entry) => ({
        ...entry,
        correctedAt: entry.correctedAt || timestamp,
        provenance: BOT_PROVENANCE.OWNER_ENTERED,
      }))
      : [];
    if (action === "CORRECT" && !corrections.length) throw new Error("Correcting Checkout Evidence requires at least one correction.");
    const updated = await collections.checkoutEvidence.update(evidenceId, {
      reviewState: stateByAction[action],
      corrections: [...current.corrections, ...corrections],
      reviewedAt: timestamp,
      requiresOwnerReview: false,
    }, expectedVersion);
    await appendActivity("CHECKOUT_EVIDENCE_REVIEWED", `Checkout Evidence review completed: ${updated.reviewState}.`, {
      installationId: updated.installationId, taskId: updated.taskId, checkoutEvidenceId: updated.id,
    });
    return updated;
  }

  async function reconcileCheckoutEvidence(evidenceId, observation, expectedVersion) {
    assertSafeBotOpsInput(observation);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("Checkout Evidence reconciliation requires the expected recordVersion.");
    const current = await getRequired("checkoutEvidence", evidenceId);
    const orderCandidateId = String(observation?.orderCandidateId || "").trim();
    if (!orderCandidateId) throw new Error("An existing Order Candidate reference is required.");
    const observedAt = new Date(observation.observedAt || now()).toISOString();
    const sourceHash = await hashCanonicalJson({ evidenceId, orderCandidateId, observedAt, confidence: observation.confidence || "INSUFFICIENT" });
    if (current.orderCandidateLinks.some((entry) => entry.orderCandidateId === orderCandidateId && entry.sourceHash === sourceHash)) return current;
    const updated = await collections.checkoutEvidence.update(evidenceId, {
      orderCandidateLinks: [...current.orderCandidateLinks, {
        orderCandidateId,
        observedAt,
        confidence: observation.confidence || "INSUFFICIENT",
        sourceHash,
        provenance: BOT_PROVENANCE.SYSTEM_DERIVED,
      }],
      reviewState: current.requiresOwnerReview ? BOT_EVIDENCE_REVIEW_STATES.RECONCILED : current.reviewState,
      requiresOwnerReview: current.requiresOwnerReview,
    }, expectedVersion);
    await appendActivity("ORDER_CANDIDATE_LINKED", "Checkout Evidence was linked to an existing Order Candidate; no Purchase was created.", {
      installationId: updated.installationId, taskId: updated.taskId, checkoutEvidenceId: updated.id,
    });
    return updated;
  }

  const listMethods = Object.fromEntries(BOT_OPS_COLLECTIONS.map((collection) => [
    `list${collection[0].toUpperCase()}${collection.slice(1)}`,
    () => listAll(collections[collection]),
  ]));

  return Object.freeze({
    mode: "LOCAL_ONLY",
    authoritative: "LOCAL_ONLY",
    remoteActive: false,
    providerNetworkAccess: false,
    automaticPurchaseCreation: false,
    storageKey: persistence.repository.storageKey,
    snapshot,
    loadSnapshot: snapshot,
    ...listMethods,
    getById: (collection, recordId) => getRequired(collection, recordId),
    createInstallation,
    createRetailerAccountLink,
    createBotProfile,
    createProxyGroup,
    createProductTarget,
    createTaskGroup,
    createTask,
    updateRecord,
    archiveRecord,
    ingestProviderEvent,
    recordAttempt: ingestProviderEvent,
    reviewCheckoutEvidence,
    reconcileCheckoutEvidence,
    stateHash: () => hashCanonicalJson(persistence.repository.load()),
  });
}
