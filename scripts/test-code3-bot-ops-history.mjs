import assert from "node:assert/strict";
import {
  BOT_CAPABILITIES,
  BOT_PROVIDER_KEYS,
  createBotOpsService,
  createTestOnlyMockBotAdapter,
} from "../src/features/botOps/index.js";

class MemoryStorage {
  constructor() { this.values = new Map(); this.writes = 0; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes += 1; this.values.set(key, String(value)); }
}

class FailOnceStorage extends MemoryStorage {
  constructor(failAtWrite) { super(); this.failAtWrite = failAtWrite; this.failed = false; }
  setItem(key, value) {
    this.writes += 1;
    if (!this.failed && this.writes === this.failAtWrite) {
      this.failed = true;
      throw new Error("synthetic interrupted local write");
    }
    this.values.set(key, String(value));
  }
}

let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }
async function rejects(callback, predicate, message) { await assert.rejects(callback, predicate, message); assertions += 1; }
async function test(name, callback) { await callback(); process.stdout.write(`ok - ${name}\n`); }

function makeService(storage = new MemoryStorage()) {
  let id = 0;
  return {
    storage,
    service: createBotOpsService({
      storage,
      testAdapter: createTestOnlyMockBotAdapter({ testMode: true, environment: "test" }),
      idFactory: (prefix) => `${prefix}:history-${id += 1}`,
      now: () => "2026-08-28T15:00:00.000Z",
    }),
  };
}

async function graph(service, suffix = "one") {
  const installation = await service.createInstallation({
    provider: BOT_PROVIDER_KEYS.MOCK,
    friendlyName: `Synthetic runtime ${suffix}`,
    connectionMode: "TEST_ONLY_MOCK",
    healthState: "HEALTHY",
    capabilitySnapshot: {
      [BOT_CAPABILITIES.RUNTIME_HEALTH]: true,
      [BOT_CAPABILITIES.TASK_STATUS]: true,
      [BOT_CAPABILITIES.CHECKOUT_EVIDENCE]: true,
      [BOT_CAPABILITIES.EVENT_HISTORY]: true,
    },
    enabled: true,
  });
  const account = await service.createRetailerAccountLink({
    retailerId: `retailer.${suffix}.test`,
    accountOpsStoreAccountId: `account-ops.store-account.${suffix}.test`,
    accountLabel: `Synthetic account ${suffix}`,
    installationIds: [installation.id],
  });
  const profile = await service.createBotProfile({ displayName: `Synthetic profile ${suffix}`, accountOpsProfileId: `account-ops.profile.${suffix}.test`, installationIds: [installation.id] });
  const proxy = await service.createProxyGroup({ displayName: `Synthetic proxy ${suffix}`, installationIds: [installation.id], healthState: "HEALTHY", proxyCount: 1 });
  const target = await service.createProductTarget({ retailerId: account.retailerId, canonicalProductId: `catalog.${suffix}.test`, title: `Synthetic product ${suffix}`, maxPrice: { minorUnits: 5500, currency: "USD" }, provenance: "TEST_FIXTURE" });
  const group = await service.createTaskGroup({ name: `Synthetic group ${suffix}`, retailerId: account.retailerId, provider: BOT_PROVIDER_KEYS.MOCK, installationId: installation.id, retailerAccountLinkId: account.id, botProfileId: profile.id, proxyGroupId: proxy.id, enabled: true });
  const task = await service.createTask({ taskGroupId: group.id, productTargetId: target.id, retailerId: account.retailerId, provider: BOT_PROVIDER_KEYS.MOCK, installationId: installation.id, retailerAccountLinkId: account.id, botProfileId: profile.id, proxyGroupId: proxy.id, runtimeStatus: "WAITING", provenance: "TEST_FIXTURE" });
  return { installation, account, profile, proxy, target, group, task };
}

function event(records, overrides = {}) {
  return {
    providerEventId: "event.synthetic.test",
    installationId: records.installation.id,
    taskId: records.task.id,
    retailerId: records.account.retailerId,
    occurredAt: "2026-08-28T16:00:00.000Z",
    normalizedEvent: "TASK_MONITORING",
    runtimeStatus: "MONITORING",
    success: false,
    failureCategory: "NONE",
    message: "Synthetic provider status.",
    productTargetId: records.target.id,
    retailerAccountLinkId: records.account.id,
    botProfileId: records.profile.id,
    proxyGroupId: records.proxy.id,
    ...overrides,
  };
}

await test("replaying the exact event ten times keeps one attempt and one activity record", async () => {
  const { service } = makeService();
  const records = await graph(service);
  let firstTaskVersion;
  for (let index = 0; index < 10; index += 1) {
    const result = await service.ingestProviderEvent(event(records));
    equal(result.deduplicated, index > 0);
    equal(result.wroteAttempt, index === 0);
    if (index === 0) firstTaskVersion = result.task.recordVersion;
    else equal(result.task.recordVersion, firstTaskVersion, "exact replay does not version-bump the task");
  }
  equal((await service.listAttempts()).length, 1);
  equal((await service.listActivity()).length, 1);
  equal((await service.listCheckoutEvidence()).length, 0);
});

await test("successful checkout evidence is review-only and exact retries do not duplicate it", async () => {
  const { service } = makeService();
  const records = await graph(service);
  const success = event(records, {
    providerEventId: "event.checkout.test",
    normalizedEvent: "CHECKOUT_SUCCEEDED",
    runtimeStatus: "SUCCESS",
    success: true,
    quantity: 2,
    expectedAmount: { minorUnits: 10998, currency: "USD" },
    externalOrderReference: "ORDER-SYNTHETIC-001",
    confidence: "LOW",
  });
  for (let index = 0; index < 3; index += 1) await service.ingestProviderEvent(success);
  const attempts = await service.listAttempts();
  const evidence = await service.listCheckoutEvidence();
  equal(attempts.length, 1);
  equal(evidence.length, 1);
  equal(evidence[0].requiresOwnerReview, true);
  equal(evidence[0].reviewState, "NEEDS_REVIEW");
  equal(evidence[0].purchaseCreated, false);
  equal(evidence[0].automaticPurchaseCreationAllowed, false);
  equal(evidence[0].inventoryCreated, false);
  equal(evidence[0].automaticReceivingAllowed, false);
  equal(evidence[0].expectedAmount.minorUnits, 10998);
  equal(evidence[0].quantity, 2);
});

await test("retry repairs each interrupted persistence boundary without duplicate attempts or evidence", async () => {
  for (const failAtWrite of [8, 9, 10, 11]) {
    const storage = new FailOnceStorage(failAtWrite);
    const { service } = makeService(storage);
    const records = await graph(service);
    const checkout = event(records, {
      providerEventId: `event.interruption-${failAtWrite}.test`,
      normalizedEvent: "CHECKOUT_SUCCEEDED",
      runtimeStatus: "SUCCESS",
      success: true,
      quantity: 1,
      expectedAmount: { minorUnits: 5500, currency: "USD" },
      externalOrderReference: `ORDER-INTERRUPTION-${failAtWrite}`,
    });
    await rejects(() => service.ingestProviderEvent(checkout), (error) => error.code === "LOCAL_SAVE_FAILED");
    await service.ingestProviderEvent(checkout);
    equal((await service.listAttempts()).length, 1);
    equal((await service.listCheckoutEvidence()).length, 1);
    equal((await service.listActivity()).length, 1);
    equal((await service.listTasks()).length, 1);
  }
});

await test("changed content for the same provider event ID appends a revision instead of overwriting", async () => {
  const { service } = makeService();
  const records = await graph(service);
  await service.ingestProviderEvent(event(records));
  const changed = await service.ingestProviderEvent(event(records, { message: "Synthetic provider status changed." }));
  equal(changed.deduplicated, false);
  equal((await service.listAttempts()).length, 2);
  equal(changed.attempt.eventRevision, 2);
  ok(changed.attempt.warnings.includes("PROVIDER_EVENT_CONTENT_CHANGED"));
});

await test("the same provider event ID remains installation-scoped", async () => {
  const { service } = makeService();
  const first = await graph(service, "first");
  const second = await graph(service, "second");
  await service.ingestProviderEvent(event(first, { providerEventId: "shared-event.test" }));
  await service.ingestProviderEvent(event(second, { providerEventId: "shared-event.test" }));
  const attempts = await service.listAttempts();
  equal(attempts.length, 2);
  equal(new Set(attempts.map((attempt) => attempt.providerEventKey)).size, 2);
  equal(new Set(attempts.map((attempt) => attempt.installationId)).size, 2);
});

await test("reordered and contradictory events retain history without reversing success", async () => {
  const { service } = makeService();
  const records = await graph(service);
  await service.ingestProviderEvent(event(records, {
    providerEventId: "event.success.test",
    occurredAt: "2026-08-28T16:10:00.000Z",
    normalizedEvent: "CHECKOUT_SUCCEEDED",
    runtimeStatus: "SUCCESS",
    success: true,
    externalOrderReference: "ORDER-STATE-001",
  }));
  const contradictory = await service.ingestProviderEvent(event(records, {
    providerEventId: "event.failure-after-success.test",
    occurredAt: "2026-08-28T16:11:00.000Z",
    normalizedEvent: "CHECKOUT_FAILED",
    runtimeStatus: "FAILED",
    failureCategory: "PROVIDER",
  }));
  equal(contradictory.task.runtimeStatus, "SUCCESS");
  ok(contradictory.attempt.warnings.includes("CONTRADICTORY_POST_SUCCESS_STATUS"));
  const reordered = await service.ingestProviderEvent(event(records, {
    providerEventId: "event.reordered.test",
    occurredAt: "2026-08-28T16:05:00.000Z",
    normalizedEvent: "TASK_WAITING",
    runtimeStatus: "WAITING",
  }));
  equal(reordered.task.runtimeStatus, "SUCCESS");
  ok(reordered.attempt.warnings.includes("REORDERED_PROVIDER_EVENT"));
  equal((await service.listAttempts()).length, 3);
});

await test("conflicting checkout evidence remains one review record with explicit warnings", async () => {
  const { service } = makeService();
  const records = await graph(service);
  const first = event(records, {
    providerEventId: "event.checkout-one.test",
    normalizedEvent: "CHECKOUT_SUCCEEDED",
    runtimeStatus: "SUCCESS",
    success: true,
    expectedAmount: { minorUnits: 5000, currency: "USD" },
    externalOrderReference: "ORDER-CONFLICT-001",
  });
  const second = event(records, {
    providerEventId: "event.checkout-two.test",
    occurredAt: "2026-08-28T16:01:00.000Z",
    normalizedEvent: "CHECKOUT_SUCCEEDED",
    runtimeStatus: "SUCCESS",
    success: true,
    expectedAmount: { minorUnits: 6000, currency: "USD" },
    externalOrderReference: "ORDER-CONFLICT-001",
  });
  await service.ingestProviderEvent(first);
  const result = await service.ingestProviderEvent(second);
  equal((await service.listAttempts()).length, 2);
  equal((await service.listCheckoutEvidence()).length, 1);
  ok(result.checkoutEvidence.warnings.includes("CHECKOUT_EVIDENCE_SOURCE_CHANGED"));
  ok(result.checkoutEvidence.warnings.includes("CHECKOUT_EVIDENCE_AMOUNT_CONFLICT"));
  equal(result.attempt.checkoutEvidenceId, result.checkoutEvidence.id, "same order reference reuses one evidence identity");
  equal(result.checkoutEvidence.reviewState, "NEEDS_REVIEW");
  equal(result.checkoutEvidence.requiresOwnerReview, true);
});

await test("owner review and Order Candidate linkage preserve the no-Purchase boundary", async () => {
  const { service } = makeService();
  const records = await graph(service);
  const result = await service.ingestProviderEvent(event(records, {
    providerEventId: "event.review.test",
    normalizedEvent: "CHECKOUT_SUCCEEDED",
    runtimeStatus: "SUCCESS",
    success: true,
    expectedAmount: { minorUnits: 5500, currency: "USD" },
    externalOrderReference: "ORDER-REVIEW-001",
  }));
  const corrected = await service.reviewCheckoutEvidence(result.checkoutEvidence.id, {
    action: "CORRECT",
    corrections: [{ field: "expectedAmount", previousValue: "5500 USD", correctedValue: "5400 USD", reason: "Owner checked synthetic receipt.", provenance: "PROVIDER_NORMALIZED" }],
  }, result.checkoutEvidence.recordVersion);
  equal(corrected.reviewState, "CORRECTED");
  equal(corrected.requiresOwnerReview, false);
  equal(corrected.corrections.length, 1);
  equal(corrected.corrections[0].provenance, "OWNER_ENTERED", "caller cannot spoof owner-correction provenance");
  equal(corrected.purchaseCreated, false);
  equal(corrected.inventoryCreated, false);
  await rejects(
    () => service.updateRecord("checkoutEvidence", corrected.id, { purchaseCreated: true }, corrected.recordVersion),
    /append-only/,
    "checkout evidence can change only through the bounded review/reconciliation methods",
  );
  const linked = await service.reconcileCheckoutEvidence(corrected.id, {
    orderCandidateId: "order-candidate.synthetic.test",
    observedAt: "2026-08-28T17:00:00.000Z",
    confidence: "HIGH",
  }, corrected.recordVersion);
  equal(linked.orderCandidateLinks.length, 1);
  equal(linked.orderCandidateLinks[0].orderCandidateId, "order-candidate.synthetic.test");
  equal(linked.orderCandidateLinks[0].provenance, "SYSTEM_DERIVED");
  equal(linked.reviewState, "CORRECTED");
  equal(linked.purchaseCreated, false);
  equal(linked.inventoryCreated, false);
  equal("createPurchase" in service, false);
  equal("receiveInventory" in service, false);
});

console.log(`Code 3 Bot Operations history/reconciliation: ${assertions} assertions passed.`);
