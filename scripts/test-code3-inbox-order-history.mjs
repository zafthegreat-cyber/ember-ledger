import assert from "node:assert/strict";
import {
  PHASE2B1_FIXED_NOW,
  PHASE2B1_FIXTURE_CONTEXT,
  PHASE2B1_QA_FIXTURES,
  createInboxOrderPersistence,
  createInboxOrderService,
} from "../src/features/inboxOrder/index.js";

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
function equal(actual, expected, message) { assertions += 1; assert.equal(actual, expected, message); }
function ok(value, message) { assertions += 1; assert.ok(value, message); }
async function test(name, callback) { await callback(); process.stdout.write(`ok - ${name}\n`); }
const fixture = (id) => PHASE2B1_QA_FIXTURES.find((entry) => entry.id === id);

const storage = new MemoryStorage();
let ids = 0;
const service = createInboxOrderService({
  storage,
  now: () => PHASE2B1_FIXED_NOW,
  idFactory: (prefix) => `${prefix}:history-${ids += 1}`,
});

await test("persistence is fixed to LOCAL_ONLY and exposes no remote activation", () => {
  equal(service.mode, "LOCAL_ONLY");
  equal(service.authoritative, "LOCAL_ONLY");
  equal(service.remoteActive, false);
  assert.throws(() => createInboxOrderPersistence({ storage, mode: "LOCAL_ONLY" }), (error) => error.code === "PERSISTENCE_MODE_NOT_CALLER_SELECTABLE");
  assertions += 1;
  assert.throws(() => createInboxOrderService({ storage, mode: "REMOTE_ACTIVE" }), /fixed to LOCAL_ONLY/);
  assertions += 1;
});

let original;
await test("processing one message ten times is an exact no-op after the first write", async () => {
  for (let index = 0; index < 10; index += 1) {
    const result = await service.processMessage(fixture("order-confirmation").input, PHASE2B1_FIXTURE_CONTEXT);
    if (index === 0) original = result;
    else equal(result.deduplicated, true);
  }
  equal((await service.listMessageEvents()).length, 1);
  equal((await service.listOrderCandidates()).length, 1);
  equal((await service.listCandidateEvents()).length, 1);
  equal((await service.listActivity()).length, 1);
  equal(original.candidate.sourceEventIds.length, 1);
});

await test("an exact retry repairs interruption after event or candidate persistence", async () => {
  for (const failAtWrite of [2, 3, 4]) {
    const interruptedStorage = new FailOnceStorage(failAtWrite);
    let repairId = 0;
    const repairService = createInboxOrderService({
      storage: interruptedStorage,
      now: () => PHASE2B1_FIXED_NOW,
      idFactory: (prefix) => `${prefix}:repair-${failAtWrite}-${repairId += 1}`,
    });
    await assert.rejects(
      () => repairService.processMessage(fixture("order-confirmation").input, PHASE2B1_FIXTURE_CONTEXT),
      (error) => error.code === "LOCAL_SAVE_FAILED",
    );
    assertions += 1;
    const repaired = await repairService.processMessage(fixture("order-confirmation").input, PHASE2B1_FIXTURE_CONTEXT);
    equal(repaired.deduplicated, true);
    equal(repaired.wroteRecords, true);
    equal((await repairService.listMessageEvents()).length, 1);
    equal((await repairService.listOrderCandidates()).length, 1);
    equal((await repairService.listCandidateEvents()).length, 1);
    equal((await repairService.listActivity()).length, 1);
  }
});

await test("confirmation, shipment, delivery, and refund reconcile into one append-only history", async () => {
  await service.processMessage(fixture("shipped-order").input, PHASE2B1_FIXTURE_CONTEXT);
  await service.processMessage(fixture("delivered-order").input, PHASE2B1_FIXTURE_CONTEXT);
  await service.processMessage(fixture("refund").input, PHASE2B1_FIXTURE_CONTEXT);
  const candidates = await service.listOrderCandidates();
  equal(candidates.length, 1);
  equal(candidates[0].sourceEventIds.length, 4);
  equal(candidates[0].eventHistory.length, 4);
  equal(candidates[0].systemProposal.orderStatus, "REFUNDED");
  equal((await service.listCandidateEvents()).length, 4);
});

await test("conflicting retailer evidence for one connection and order remains one review candidate", async () => {
  const conflicting = structuredClone(fixture("order-confirmation").input);
  conflicting.providerMessageId = "message-conflicting-retailer-followup";
  conflicting.sender = { address: "orders@orders.fixture-target.test", displayName: "Fixture Retailer" };
  conflicting.orderProposal.retailerId = "retailer-preset:target";
  conflicting.orderProposal.aliasId = "alias-target";
  conflicting.orderProposal.storeAccountId = "account-target";
  const result = await service.processMessage(conflicting, PHASE2B1_FIXTURE_CONTEXT);
  equal((await service.listOrderCandidates()).length, 1);
  equal(result.candidate.id, original.candidate.id);
  ok(result.candidate.warnings.includes("RETAILER_CONFLICT"));
  equal(result.candidate.ownerReviewRequired, true);
});

await test("same order across aliases retains one candidate and reports relationship conflicts", async () => {
  const alternateContext = structuredClone(PHASE2B1_FIXTURE_CONTEXT);
  alternateContext.accountOps.aliases.push({
    id: "alias-walmart-alternate",
    aliasAddress: "orders-walmart-alternate@code3-fixture.test",
    profileId: "profile-alternate",
    retailerId: "retailer-preset:walmart",
    status: "ACTIVE",
    provisioningState: "RECEIVING_CONFIRMED",
  });
  alternateContext.accountOps.storeAccounts.push({
    id: "account-walmart-alternate",
    aliasId: "alias-walmart-alternate",
    profileId: "profile-alternate",
    retailerId: "retailer-preset:walmart",
  });
  const alternate = structuredClone(fixture("order-confirmation").input);
  alternate.providerMessageId = "message-alternate-alias-followup";
  alternate.recipients = ["orders-walmart-alternate@code3-fixture.test"];
  alternate.orderProposal.aliasId = "alias-walmart-alternate";
  alternate.orderProposal.storeAccountId = "account-walmart-alternate";
  alternate.orderProposal.profileId = "profile-alternate";
  const result = await service.processMessage(alternate, alternateContext);
  equal((await service.listOrderCandidates()).length, 1);
  equal(result.candidate.id, original.candidate.id);
  equal(result.candidate.systemProposal.aliasId, "alias-walmart");
  equal(result.candidate.systemProposal.storeAccountId, "account-walmart");
  equal(result.candidate.systemProposal.profileId, "profile-business");
  ok(result.candidate.warnings.includes("ALIAS_CONFLICT"));
  ok(result.candidate.warnings.includes("STORE_ACCOUNT_CONFLICT"));
  ok(result.candidate.warnings.includes("PROFILE_CONFLICT"));
  equal(result.candidate.ownerReviewRequired, true);
});

await test("provider message identity and external-order identity are scoped by connection", async () => {
  const crossConnection = structuredClone(fixture("order-confirmation").input);
  crossConnection.providerConnectionId = "connection-fixture-2";
  const result = await service.processMessage(crossConnection, PHASE2B1_FIXTURE_CONTEXT);
  equal(result.deduplicated, false);
  equal((await service.listMessageEvents()).length, 7);
  equal((await service.listOrderCandidates()).length, 2);
  ok(result.candidate.warnings.includes("DUPLICATE_EXTERNAL_ORDER_ACROSS_CONNECTIONS"));
});

let corrected;
await test("owner correction provenance remains separate from later system evidence", async () => {
  let candidate = await service.getCandidate(original.candidate.id);
  corrected = await service.reviewCandidate(candidate.id, {
    action: "CORRECT",
    corrections: [{ field: "externalOrderId", value: "ORDER-OWNER-CONFIRMED", reason: "Checked receipt." }],
  }, candidate.recordVersion);
  equal(corrected.ownerReview.state, "CORRECTED");
  equal(corrected.ownerReview.corrections.length, 1);
  equal(corrected.ownerReview.corrections[0].provenance, "OWNER_ENTERED");
  const extra = structuredClone(fixture("same-order-multiple-messages").input);
  extra.providerMessageId = "message-after-owner-correction";
  await service.processMessage(extra, PHASE2B1_FIXTURE_CONTEXT);
  candidate = await service.getCandidate(original.candidate.id);
  equal(candidate.ownerReview.state, "CORRECTED");
  equal(candidate.ownerReview.corrections[0].ownerValue, "ORDER-OWNER-CONFIRMED");
  equal(candidate.systemProposal.externalOrderId, "ORDER-1001");
});

await test("owner-review retries repair interrupted audit history without repeating the correction", async () => {
  for (const failAtWrite of [6, 7]) {
    const interruptedStorage = new FailOnceStorage(failAtWrite);
    let repairId = 0;
    const repairService = createInboxOrderService({
      storage: interruptedStorage,
      now: () => PHASE2B1_FIXED_NOW,
      idFactory: (prefix) => `${prefix}:review-repair-${failAtWrite}-${repairId += 1}`,
    });
    const created = await repairService.processMessage(fixture("order-confirmation").input, PHASE2B1_FIXTURE_CONTEXT);
    const review = {
      action: "CORRECT",
      corrections: [{ field: "externalOrderId", value: `OWNER-${failAtWrite}`, reason: "Fixture correction." }],
    };
    await assert.rejects(
      () => repairService.reviewCandidate(created.candidate.id, review, created.candidate.recordVersion),
      (error) => error.code === "LOCAL_SAVE_FAILED",
    );
    assertions += 1;
    const repaired = await repairService.reviewCandidate(created.candidate.id, review, created.candidate.recordVersion);
    equal(repaired.ownerReview.corrections.length, 1);
    equal((await repairService.listCandidateEvents()).length, 2);
    equal((await repairService.listActivity()).length, 2);
    const writesBeforeNoOp = interruptedStorage.writes;
    const repeated = await repairService.reviewCandidate(created.candidate.id, review, created.candidate.recordVersion);
    equal(repeated.ownerReview.corrections.length, 1);
    equal(interruptedStorage.writes, writesBeforeNoOp);
  }
});

await test("owner money corrections require exact minor units and the candidate currency", async () => {
  const candidate = await service.getCandidate(original.candidate.id);
  await assert.rejects(
    () => service.reviewCandidate(candidate.id, {
      action: "CORRECT",
      corrections: [{ field: "total", value: { minorUnits: 9000, currency: "CAD" } }],
    }, candidate.recordVersion),
    (error) => error.code === "CORRECTION_CURRENCY_MISMATCH",
  );
  await assert.rejects(
    () => service.reviewCandidate(candidate.id, {
      action: "CORRECT",
      corrections: [{ field: "total", value: { minorUnits: 90.5, currency: "USD" } }],
    }, candidate.recordVersion),
    (error) => error.code === "INVALID_MINOR_UNITS",
  );
  assertions += 2;
});

await test("owner line-item corrections enforce exact money, quantity, and candidate currency", async () => {
  const candidate = await service.getCandidate(original.candidate.id);
  await assert.rejects(
    () => service.reviewCandidate(candidate.id, {
      action: "CORRECT",
      corrections: [{ field: "lineItems", value: [{ title: "Unsafe float", quantity: 1, unitPrice: 12.34 }] }],
    }, candidate.recordVersion),
    (error) => error.code === "MONEY_OBJECT_REQUIRED",
  );
  await assert.rejects(
    () => service.reviewCandidate(candidate.id, {
      action: "CORRECT",
      corrections: [{ field: "lineItems", value: [{ title: "Invalid quantity", quantity: 0, unitPrice: { minorUnits: 1234, currency: "USD" } }] }],
    }, candidate.recordVersion),
    (error) => error.code === "INVALID_QUANTITY",
  );
  await assert.rejects(
    () => service.reviewCandidate(candidate.id, {
      action: "CORRECT",
      corrections: [{ field: "lineItems", value: [{ title: "Wrong currency", quantity: 1, unitPrice: { minorUnits: 1234, currency: "CAD" } }] }],
    }, candidate.recordVersion),
    (error) => error.code === "CURRENCY_MISMATCH" || error.code === "CORRECTION_CURRENCY_MISMATCH",
  );
  assertions += 3;

  const reviewed = await service.reviewCandidate(candidate.id, {
    action: "CORRECT",
    corrections: [{
      field: "lineItems",
      value: [{ title: "Exact correction", quantity: 2, unitPrice: { minorUnits: 1234, currency: "USD" } }],
      reason: "Owner checked the receipt.",
    }],
  }, candidate.recordVersion);
  const correction = reviewed.ownerReview.corrections.at(-1);
  equal(correction.ownerValue[0].quantity, 2);
  equal(correction.ownerValue[0].unitPrice.minorUnits, 1234);
  equal(correction.ownerValue[0].lineTotal.minorUnits, 2468);
  equal(correction.ownerValue[0].lineTotal.currency, "USD");
});

await test("owner status and relationship corrections use normalized bounded contracts", async () => {
  const candidate = await service.getCandidate(original.candidate.id);
  for (const correction of [
    { field: "orderStatus", value: "NOT_A_REAL_STATUS", expectedCode: "INVALID_ENUM" },
    { field: "fulfillmentType", value: "TELEPORT", expectedCode: "INVALID_ENUM" },
    { field: "externalOrderId", value: "", expectedCode: "REQUIRED_FIELD" },
    { field: "retailerId", value: "x".repeat(161), expectedCode: "TEXT_TOO_LONG" },
    { field: "pickupStoreReference", value: "", expectedCode: "REQUIRED_FIELD" },
  ]) {
    await assert.rejects(
      () => service.reviewCandidate(candidate.id, {
        action: "CORRECT",
        corrections: [{ field: correction.field, value: correction.value }],
      }, candidate.recordVersion),
      (error) => error.code === correction.expectedCode,
    );
    assertions += 1;
  }

  const reviewed = await service.reviewCandidate(candidate.id, {
    action: "CORRECT",
    corrections: [
      { field: "orderStatus", value: "shipped" },
      { field: "fulfillmentType", value: "pickup" },
      { field: "externalOrderId", value: "ORDER-OWNER-VERIFIED" },
      { field: "pickupStoreReference", value: "store-reference-1" },
      { field: "shippingAddressReference", value: null },
    ],
  }, candidate.recordVersion);
  const corrections = reviewed.ownerReview.corrections.slice(-5);
  equal(corrections[0].ownerValue, "SHIPPED");
  equal(corrections[1].ownerValue, "PICKUP");
  equal(corrections[2].ownerValue, "ORDER-OWNER-VERIFIED");
  equal(corrections[3].ownerValue, "store-reference-1");
  equal(corrections[4].ownerValue, null);
});

await test("stale owner review versions are rejected", async () => {
  await assert.rejects(
    () => service.reviewCandidate(corrected.id, { action: "CONFIRM" }, corrected.recordVersion),
    (error) => error.code === "VERSION_CONFLICT",
  );
  assertions += 1;
});

await test("message, candidate-event, and activity collections are append-only", async () => {
  const persistence = createInboxOrderPersistence({ storage, now: () => PHASE2B1_FIXED_NOW });
  const event = (await persistence.collections.messageEvents.list({ includeArchived: true })).records[0];
  assert.throws(() => persistence.collections.messageEvents.update(event.id, {}, event.recordVersion), (error) => error.code === "APPEND_ONLY_COLLECTION");
  assert.throws(() => persistence.collections.messageEvents.archive(event.id, event.recordVersion), (error) => error.code === "APPEND_ONLY_COLLECTION");
  assertions += 2;
});

console.log(`Code 3 Inbox/Order history: ${assertions} assertions passed.`);
