import assert from "node:assert/strict";
import {
  PURCHASE_DRAFT_STATES,
  PURCHASE_EVENT_TYPES,
  PURCHASE_RECEIPT_STATES,
  createPurchaseReceivingService,
  normalizePurchaseReceivingState,
} from "../src/features/purchaseReceiving/index.js";
import {
  PHASE2CA_FIXED_NOW,
  PHASE2CA_LATER_NOW,
  createFixtureDraftInput,
  createFixtureLineItem,
} from "../src/features/purchaseReceiving/fixtures/phase2caFixtures.js";

class MemoryStorage {
  constructor() { this.values = new Map(); this.reads = 0; this.writes = 0; }
  getItem(key) { this.reads += 1; return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes += 1; this.values.set(String(key), String(value)); }
}

class FailOnceStorage extends MemoryStorage {
  constructor(failAtWrite) { super(); this.failAtWrite = failAtWrite; this.failed = false; }
  setItem(key, value) {
    this.writes += 1;
    if (!this.failed && this.writes === this.failAtWrite) {
      this.failed = true;
      throw new Error("synthetic interrupted local write");
    }
    this.values.set(String(key), String(value));
  }
}

let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }
async function rejects(callback, predicate, message) { await assert.rejects(callback, predicate, message); assertions += 1; }
async function test(name, callback) { await callback(); process.stdout.write(`ok - ${name}\n`); }

function harness(options = {}) {
  const storage = options.storage || new MemoryStorage();
  let sequence = 0;
  let tick = 0;
  const authority = options.authority || { allowed: true };
  const service = createPurchaseReceivingService({
    storage,
    isOwnerAuthorized: () => authority.allowed,
    idFactory: (prefix) => `${prefix}.history-${sequence += 1}.test`,
    now: () => new Date(Date.parse(PHASE2CA_FIXED_NOW) + (tick += 1) * 1000).toISOString(),
  });
  return { authority, service, storage };
}

async function confirmedPurchase(service, suffix = "one", quantity = 1) {
  const unitMinor = 4000;
  const subtotalMinor = unitMinor * quantity;
  const created = await service.createDraft(createFixtureDraftInput({
    id: `purchase-draft.${suffix}.test`,
    sourceReference: `source.${suffix}.test`,
    sourceIdentityKey: `source-key.${suffix}.test`,
    externalOrderId: `ORDER-${suffix.toUpperCase()}-001`,
    lineItems: [createFixtureLineItem({
      id: `purchase-line.${suffix}.test`,
      quantityOrdered: quantity,
      unitPrice: { minorUnits: unitMinor, currency: "USD" },
      lineAmount: { minorUnits: subtotalMinor, currency: "USD" },
      receivedQuantity: 0,
      remainingQuantity: quantity,
    })],
    subtotal: { minorUnits: subtotalMinor, currency: "USD" },
    tax: { minorUnits: 0, currency: "USD" },
    shipping: { minorUnits: 0, currency: "USD" },
    total: { minorUnits: subtotalMinor, currency: "USD" },
  }));
  const ready = await service.markDraftReady(created.draft.id, created.draft.recordVersion);
  const confirmed = await service.confirmDraft(ready.draft.id, { expectedVersion: ready.draft.recordVersion });
  return { created, ready, confirmed, purchase: confirmed.purchase, line: confirmed.purchase.lineItems[0] };
}

function receivingInput(records, key, quantityReceived, overrides = {}) {
  return {
    idempotencyKey: key,
    occurredAt: PHASE2CA_LATER_NOW,
    locationReference: "storage.synthetic.test",
    status: "PARTIALLY_RECEIVED",
    entries: [{
      lineItemId: records.line.lineItemId,
      quantityReceived,
      quantityAffected: quantityReceived,
      condition: "NEW",
      discrepancy: "NONE",
      note: "Synthetic receiving fixture.",
    }],
    ...overrides,
  };
}

await test("partial receipts append and only become full when every non-cancelled unit is received", async () => {
  const { service } = harness();
  const records = await confirmedPurchase(service, "partial", 10);
  const first = await service.recordReceivingEvent(records.purchase.id, receivingInput(records, "receive-partial-a.test", 4));
  equal(first.deduplicated, false);
  equal(first.wroteEvent, true);
  equal(first.projection.status, PURCHASE_RECEIPT_STATES.PARTIALLY_RECEIVED);
  equal(first.projection.totalReceivedQuantity, 4);
  equal(first.projection.lineItems[0].remainingQuantity, 6);
  equal(first.purchase.receivingStatus, PURCHASE_RECEIPT_STATES.PARTIALLY_RECEIVED);
  equal(first.event.createsInventory, false);
  equal((await service.listReceivingEvents()).length, 1);

  const second = await service.recordReceivingEvent(records.purchase.id, receivingInput(records, "receive-partial-b.test", 6));
  equal(second.projection.status, PURCHASE_RECEIPT_STATES.FULLY_RECEIVED);
  equal(second.projection.totalReceivedQuantity, 10);
  equal(second.projection.lineItems[0].remainingQuantity, 0);
  equal(second.purchase.receivingStatus, PURCHASE_RECEIPT_STATES.FULLY_RECEIVED);
  equal((await service.listReceivingEvents()).length, 2, "equal/different partial events are retained when keys differ");
  equal((await service.listPurchases()).length, 1);
});

await test("replaying the exact receiving submission ten times remains one event", async () => {
  const { service } = harness();
  const records = await confirmedPurchase(service, "replay", 4);
  let eventId = null;
  for (let index = 0; index < 10; index += 1) {
    const result = await service.recordReceivingEvent(records.purchase.id, receivingInput(records, "receive-replay.test", 2));
    equal(result.deduplicated, index > 0);
    equal(result.wroteEvent, index === 0);
    eventId ||= result.event.id;
    equal(result.event.id, eventId);
    equal(result.projection.totalReceivedQuantity, 2, "replay never inflates received quantity");
  }
  equal((await service.listReceivingEvents()).length, 1);
  equal((await service.listActivity()).filter((event) => event.type === "RECEIVING_CONFIRMED").length, 1);
  const beforeConflict = service.canonicalSnapshot();
  await rejects(
    () => service.recordReceivingEvent(records.purchase.id, receivingInput(records, "receive-replay.test", 1)),
    (error) => error.code === "IDEMPOTENCY_CONFLICT",
  );
  equal(service.canonicalSnapshot(), beforeConflict, "conflicting receiving-key reuse writes nothing");
});

await test("same receiving idempotency key is scoped to the Purchase", async () => {
  const { service } = harness();
  const first = await confirmedPurchase(service, "scope-a", 1);
  const second = await confirmedPurchase(service, "scope-b", 1);
  await service.recordReceivingEvent(first.purchase.id, receivingInput(first, "shared-receive.test", 1));
  await service.recordReceivingEvent(second.purchase.id, receivingInput(second, "shared-receive.test", 1));
  equal((await service.listReceivingEvents()).length, 2);
  equal(new Set((await service.listReceivingEvents()).map((event) => event.purchaseId)).size, 2);
});

await test("receiving discrepancies preserve history without altering original Purchase evidence", async () => {
  const { service } = harness();
  const records = await confirmedPurchase(service, "discrepancy", 2);
  const originalPurchase = JSON.stringify(records.purchase);
  const missing = await service.recordReceivingEvent(records.purchase.id, receivingInput(records, "receive-missing.test", 0, {
    entries: [{
      lineItemId: records.line.lineItemId,
      quantityReceived: 0,
      quantityAffected: 1,
      condition: "UNKNOWN",
      discrepancy: "MISSING_ITEM",
      note: "Synthetic missing item.",
    }],
  }));
  equal(missing.projection.status, PURCHASE_RECEIPT_STATES.NOT_RECEIVED);
  equal(missing.projection.lineItems[0].discrepancies.length, 1);
  equal(missing.projection.lineItems[0].discrepancies[0].discrepancy, "MISSING_ITEM");
  equal(missing.event.createsInventory, false);
  equal(JSON.stringify(records.purchase), originalPurchase, "source Purchase evidence object remains immutable");
  equal((await service.listReceivingEvents()).length, 1);
});

await test("cancellations are append-only, idempotent, and never delete received evidence", async () => {
  const { service } = harness();
  const records = await confirmedPurchase(service, "cancel", 2);
  const partial = await service.recordPurchaseEvent(records.purchase.id, {
    type: PURCHASE_EVENT_TYPES.CANCELLATION_RECORDED,
    idempotencyKey: "cancel-one.test",
    lineItemId: records.line.lineItemId,
    quantity: 1,
    reason: "Synthetic owner-confirmed cancellation.",
  });
  equal(partial.deduplicated, false);
  equal(partial.wroteEvent, true);
  equal(partial.purchase.status, "PARTIALLY_CANCELLED");
  equal(partial.purchase.lineItems[0].cancellationQuantity, 1);
  equal(partial.event.inventoryMutationPerformed, false);
  const replay = await service.recordPurchaseEvent(records.purchase.id, {
    type: PURCHASE_EVENT_TYPES.CANCELLATION_RECORDED,
    idempotencyKey: "cancel-one.test",
    lineItemId: records.line.lineItemId,
    quantity: 1,
  });
  equal(replay.deduplicated, true);
  equal(replay.wroteEvent, false);
  equal(replay.purchase.lineItems[0].cancellationQuantity, 1, "replay does not double-cancel quantity");
  equal((await service.listPurchaseEvents()).filter((event) => event.type === PURCHASE_EVENT_TYPES.CANCELLATION_RECORDED).length, 1);
  const beforeConflict = service.canonicalSnapshot();
  await rejects(
    () => service.recordPurchaseEvent(records.purchase.id, {
      type: PURCHASE_EVENT_TYPES.CANCELLATION_RECORDED,
      idempotencyKey: "cancel-one.test",
      lineItemId: records.line.lineItemId,
      quantity: 2,
    }),
    (error) => error.code === "IDEMPOTENCY_CONFLICT",
  );
  equal(service.canonicalSnapshot(), beforeConflict, "conflicting Purchase-event key reuse writes nothing");
  const beforeBlocked = service.canonicalSnapshot();
  await rejects(
    () => service.recordPurchaseEvent(records.purchase.id, {
      type: PURCHASE_EVENT_TYPES.CANCELLATION_RECORDED,
      idempotencyKey: "cancel-too-many.test",
      lineItemId: records.line.lineItemId,
      quantity: 2,
    }),
    (error) => error.code === "CANCELLATION_EXCEEDS_AVAILABLE",
  );
  equal(service.canonicalSnapshot(), beforeBlocked, "invalid cancellation preserves Purchase history byte-for-byte");
});

await test("full cancellation accounts for all units without creating Inventory", async () => {
  const { service, storage } = harness();
  const records = await confirmedPurchase(service, "cancel-full", 1);
  const writesBefore = storage.writes;
  const cancelled = await service.recordPurchaseAdjustment(records.purchase.id, {
    type: PURCHASE_EVENT_TYPES.CANCELLATION_RECORDED,
    idempotencyKey: "cancel-full.test",
    lineItemId: records.line.lineItemId,
    quantity: 1,
  });
  equal(cancelled.purchase.status, "CANCELLED");
  equal(cancelled.purchase.receivingStatus, "CANCELLED");
  equal(cancelled.purchase.inventoryCreated, false);
  equal(storage.writes, writesBefore + 1, "adjustment is one whole-state local write");
  const preview = service.previewInventoryHandoff(records.purchase.id);
  equal(preview.rows.length, 0);
  equal(preview.inventoryRecordsCreated, 0);
  equal(preview.previewOnly, true);
});

await test("partial/full refunds use exact money and preserve append-only evidence", async () => {
  const { service } = harness();
  const records = await confirmedPurchase(service, "refund", 2);
  const partial = await service.recordPurchaseEvent(records.purchase.id, {
    type: PURCHASE_EVENT_TYPES.REFUND_RECORDED,
    idempotencyKey: "refund-partial.test",
    lineItemId: records.line.lineItemId,
    quantity: 1,
    amount: { minorUnits: 1000, currency: "USD" },
    reason: "Synthetic partial refund.",
  });
  equal(partial.purchase.status, "PARTIALLY_REFUNDED");
  equal(partial.purchase.money.refunded.minorUnits, 1000);
  equal(partial.purchase.lineItems[0].refundedQuantity, 1);
  equal(partial.event.amount.minorUnits, 1000);
  equal(partial.event.inventoryMutationPerformed, false);
  const replay = await service.recordPurchaseEvent(records.purchase.id, {
    type: PURCHASE_EVENT_TYPES.REFUND_RECORDED,
    idempotencyKey: "refund-partial.test",
    lineItemId: records.line.lineItemId,
    quantity: 1,
    amount: { minorUnits: 1000, currency: "USD" },
  });
  equal(replay.deduplicated, true);
  equal(replay.purchase.money.refunded.minorUnits, 1000);
  const full = await service.recordPurchaseEvent(records.purchase.id, {
    type: PURCHASE_EVENT_TYPES.REFUND_RECORDED,
    idempotencyKey: "refund-final.test",
    lineItemId: records.line.lineItemId,
    quantity: 1,
    amount: { minorUnits: 7000, currency: "USD" },
  });
  equal(full.purchase.status, "REFUNDED");
  equal(full.purchase.money.refunded.minorUnits, 8000);
  equal(full.purchase.lineItems[0].refundedQuantity, 2);
  const beforeBlocked = service.canonicalSnapshot();
  await rejects(
    () => service.recordPurchaseEvent(records.purchase.id, {
      type: PURCHASE_EVENT_TYPES.REFUND_RECORDED,
      idempotencyKey: "refund-too-large.test",
      amount: { minorUnits: 1, currency: "USD" },
    }),
    (error) => error.code === "REFUND_EXCEEDS_PAID",
  );
  equal(service.canonicalSnapshot(), beforeBlocked, "refund greater than paid writes nothing");
  await rejects(
    () => service.recordPurchaseEvent(records.purchase.id, {
      type: PURCHASE_EVENT_TYPES.REFUND_RECORDED,
      idempotencyKey: "refund-float.test",
      amount: 1.25,
    }),
    (error) => error.code === "UNSAFE_NUMBER",
  );
});

await test("return and replacement states retain history without receiving or inventory mutation", async () => {
  const { service } = harness();
  const records = await confirmedPurchase(service, "return", 1);
  const initiated = await service.recordPurchaseEvent(records.purchase.id, {
    type: PURCHASE_EVENT_TYPES.RETURN_INITIATED,
    idempotencyKey: "return-initiated.test",
    lineItemId: records.line.lineItemId,
    quantity: 1,
  });
  equal(initiated.purchase.status, "RETURN_INITIATED");
  const completed = await service.recordPurchaseEvent(records.purchase.id, {
    type: PURCHASE_EVENT_TYPES.RETURN_COMPLETED,
    idempotencyKey: "return-completed.test",
    lineItemId: records.line.lineItemId,
    quantity: 1,
    relatedEventId: initiated.event.id,
  });
  equal(completed.purchase.status, "RETURNED");
  equal(completed.event.relatedEventId, initiated.event.id);
  const replacement = await service.recordPurchaseEvent(records.purchase.id, {
    type: PURCHASE_EVENT_TYPES.REPLACEMENT_NOTED,
    idempotencyKey: "replacement.test",
    replacementReference: "replacement.synthetic.test",
  });
  equal(replacement.purchase.status, "REPLACEMENT_PENDING");
  equal(replacement.event.replacementReference, "replacement.synthetic.test");
  equal(replacement.event.inventoryMutationPerformed, false);
  equal((await service.listReceivingEvents()).length, 0, "return/replacement history does not infer Receiving");
  equal(service.snapshot().safety.receivingEqualsInventory, false);
});

await test("over-receipt, unknown lines, malformed and unauthorized submissions fail closed", async () => {
  const authority = { allowed: true };
  const { service, storage } = harness({ authority });
  const records = await confirmedPurchase(service, "blocked", 1);
  const before = service.canonicalSnapshot();
  await rejects(
    () => service.recordReceivingEvent(records.purchase.id, receivingInput(records, "receive-over.test", 2)),
    (error) => error.code === "RECEIVING_EXCEEDS_ORDERED",
  );
  equal(service.canonicalSnapshot(), before, "over-receipt writes nothing");
  await rejects(
    () => service.recordReceivingEvent(records.purchase.id, receivingInput(records, "receive-unknown.test", 1, {
      entries: [{ lineItemId: "purchase-line.unordered.test", quantityReceived: 1, quantityAffected: 1, discrepancy: "UNEXPECTED_EXTRA_ITEM" }],
    })),
    (error) => error.code === "UNKNOWN_PURCHASE_LINE",
  );
  equal(service.canonicalSnapshot(), before, "unknown Purchase line writes nothing");
  await rejects(() => service.recordReceivingEvent(records.purchase.id, { entries: [] }), (error) => error.code === "IDEMPOTENCY_KEY_REQUIRED");
  equal(service.canonicalSnapshot(), before, "missing idempotency key writes nothing");
  authority.allowed = false;
  const readsBefore = storage.reads;
  const writesBefore = storage.writes;
  await rejects(() => service.recordReceivingEvent(records.purchase.id, receivingInput(records, "receive-forged.test", 1)), (error) => error.code === "OWNER_REQUIRED");
  equal(storage.reads, readsBefore, "session downgrade denies before storage read");
  equal(storage.writes, writesBefore, "session downgrade denies before storage write");
});

await test("Inventory Handoff Preview is derived only and never writes inventory", async () => {
  const { service, storage } = harness();
  const records = await confirmedPurchase(service, "handoff", 2);
  await service.recordReceivingEvent(records.purchase.id, receivingInput(records, "receive-handoff.test", 1));
  const stateBefore = service.canonicalSnapshot();
  const writesBefore = storage.writes;
  const preview = await service.previewInventoryHandoff(records.purchase.id);
  equal(preview.previewOnly, true);
  equal(preview.inventoryRecordsCreated, 0);
  equal(preview.inventoryMutationAvailable, false);
  equal(preview.rows.length, 1);
  equal(preview.rows[0].quantity, 1);
  equal(preview.rows[0].allocatedAcquisitionCost.minorUnits, 4000);
  ok(preview.rows[0].warnings.includes("PARTIAL_RECEIVING_COST_PREVIEW"));
  equal(storage.writes, writesBefore, "preview performs zero persistence writes");
  equal(service.canonicalSnapshot(), stateBefore, "preview leaves the entire domain byte-equivalent");
  for (const method of ["createInventory", "saveInventory", "receiveInventory", "applyInventoryHandoff"]) equal(method in service, false);
});

await test("interrupted Purchase confirmation repairs by retry without duplicates", async () => {
  const storage = new FailOnceStorage(3);
  const { service } = harness({ storage });
  const created = await service.createDraft(createFixtureDraftInput({ id: "purchase-draft.interruption.test", sourceReference: "source.interruption.test" }));
  const ready = await service.markDraftReady(created.draft.id, created.draft.recordVersion);
  await rejects(() => service.confirmDraft(ready.draft.id, { expectedVersion: ready.draft.recordVersion }), (error) => error.code === "LOCAL_SAVE_FAILED");
  equal((await service.listPurchases()).length, 0, "failed whole-state write creates no partial Purchase");
  equal((await service.listPurchaseEvents()).length, 0, "failed whole-state write creates no partial history");
  const repaired = await service.confirmDraft(ready.draft.id, { expectedVersion: ready.draft.recordVersion });
  equal(repaired.wrotePurchase, true);
  equal((await service.listPurchases()).length, 1);
  equal((await service.listPurchaseEvents()).length, 1);
  equal((await service.listActivity()).filter((event) => event.type === "PURCHASE_CONFIRMED").length, 1);
});

await test("duplicate external identity is blocked within an account and allowed across accounts", async () => {
  const { service } = harness();
  async function create(suffix, account) {
    return service.createDraft(createFixtureDraftInput({
      id: `purchase-draft.duplicate-${suffix}.test`,
      sourceReference: `source.duplicate-${suffix}.test`,
      retailerAccountReference: account,
      externalOrderId: "ORDER-DUPLICATE-001",
    }));
  }
  const firstCreated = await create("first", "account-ops.same.test");
  const first = await service.markDraftReady(firstCreated.draft.id, firstCreated.draft.recordVersion);
  await service.confirmDraft(first.draft.id, { expectedVersion: first.draft.recordVersion });
  const duplicate = await create("second", "account-ops.same.test");
  equal(duplicate.deduplicated, true, "same retailer/account/external order is deduplicated before confirmation");
  equal(duplicate.wroteDraft, false);
  equal(duplicate.duplicateReason, "EXTERNAL_ORDER_SCOPE");
  equal(duplicate.draft.id, first.draft.id);
  const separateCreated = await create("third", "account-ops.other.test");
  equal(separateCreated.deduplicated, false, "a separate retailer account has an independent identity scope");
  const separateAccount = await service.markDraftReady(separateCreated.draft.id, separateCreated.draft.recordVersion);
  const separateConfirmation = await service.confirmDraft(separateAccount.draft.id, { expectedVersion: separateAccount.draft.recordVersion });
  equal(separateConfirmation.wrotePurchase, true, "same external ID under a distinct account remains independent");
  equal((await service.listPurchases()).length, 2);
});

await test("persisted state rejects duplicate source and external-order identities", async () => {
  const { service } = harness();
  const records = await confirmedPurchase(service, "persisted-duplicate", 1);
  const baselineState = JSON.parse(service.canonicalSnapshot());
  assert.doesNotThrow(() => normalizePurchaseReceivingState(baselineState));
  assertions += 1;

  const duplicateSource = structuredClone(baselineState);
  duplicateSource.purchaseDrafts.push({
    ...duplicateSource.purchaseDrafts[0],
    id: "purchase-draft.duplicate-source.test",
    status: PURCHASE_DRAFT_STATES.DRAFT,
    confirmedPurchaseId: null,
    sourceIdentityKey: records.created.draft.sourceIdentityKey.toLowerCase(),
  });
  assert.throws(
    () => normalizePurchaseReceivingState(duplicateSource),
    (error) => error.code === "DUPLICATE_SOURCE_IDENTITY",
  );
  assertions += 1;

  const duplicateExternalOrder = structuredClone(baselineState);
  duplicateExternalOrder.purchaseDrafts.push({
    ...duplicateExternalOrder.purchaseDrafts[0],
    id: "purchase-draft.duplicate-external.test",
    status: PURCHASE_DRAFT_STATES.DRAFT,
    confirmedPurchaseId: null,
    sourceIdentityKey: "SYNTHETIC::UNIQUE-SOURCE-DUPLICATE-EXTERNAL.TEST",
  });
  assert.throws(
    () => normalizePurchaseReceivingState(duplicateExternalOrder),
    (error) => error.code === "DUPLICATE_EXTERNAL_ORDER_IDENTITY",
  );
  assertions += 1;

  const unconfirmedSourceDraft = structuredClone(baselineState);
  unconfirmedSourceDraft.purchaseDrafts[0].status = PURCHASE_DRAFT_STATES.DRAFT;
  assert.throws(
    () => normalizePurchaseReceivingState(unconfirmedSourceDraft),
    (error) => error.code === "PURCHASE_DRAFT_CONFIRMATION_MISMATCH",
  );
  assertions += 1;

  const confirmedDraftWithoutPurchase = structuredClone(baselineState);
  confirmedDraftWithoutPurchase.purchases = [];
  confirmedDraftWithoutPurchase.purchaseEvents = [];
  assert.throws(
    () => normalizePurchaseReceivingState(confirmedDraftWithoutPurchase),
    (error) => error.code === "CONFIRMED_DRAFT_PURCHASE_MISSING",
  );
  assertions += 1;

  const receivingStatusMismatch = structuredClone(baselineState);
  receivingStatusMismatch.purchases[0].receivingStatus = PURCHASE_RECEIPT_STATES.FULLY_RECEIVED;
  assert.throws(
    () => normalizePurchaseReceivingState(receivingStatusMismatch),
    (error) => error.code === "RECEIVING_STATUS_MISMATCH",
  );
  assertions += 1;

  const embeddedReceivingProjection = structuredClone(baselineState);
  embeddedReceivingProjection.purchases[0].lineItems[0].receivedQuantity = 1;
  assert.throws(
    () => normalizePurchaseReceivingState(embeddedReceivingProjection),
    (error) => error.code === "PURCHASE_CANNOT_EMBED_RECEIVING",
  );
  assertions += 1;

  const missingConfirmationEvent = structuredClone(baselineState);
  missingConfirmationEvent.purchaseEvents = [];
  missingConfirmationEvent.purchases[0].historyReferences = [];
  assert.throws(
    () => normalizePurchaseReceivingState(missingConfirmationEvent),
    (error) => error.code === "PURCHASE_CONFIRMATION_EVENT_MISSING",
  );
  assertions += 1;

  const missingHistoryReference = structuredClone(baselineState);
  missingHistoryReference.purchases[0].historyReferences.push("purchase-event.missing.test");
  assert.throws(
    () => normalizePurchaseReceivingState(missingHistoryReference),
    (error) => error.code === "MISSING_PURCHASE_HISTORY_REFERENCE",
  );
  assertions += 1;
});

await test("Purchase Draft state and history stay separate from Receiving and Inventory", async () => {
  const { service } = harness();
  const records = await confirmedPurchase(service, "history", 1);
  equal(records.confirmed.draft.status, PURCHASE_DRAFT_STATES.CONFIRMED);
  equal((await service.listPurchaseEvents()).length, 1);
  equal((await service.listReceivingEvents()).length, 0, "delivery/tracking evidence does not infer receiving");
  const activity = await service.listActivity();
  ok(activity.some((entry) => entry.type === "PURCHASE_DRAFT_CREATED"));
  ok(activity.some((entry) => entry.type === "PURCHASE_CONFIRMED"));
  equal(activity.some((entry) => /INVENTORY/.test(entry.type)), false);
});

console.log(`Code 3 Purchase/Receiving history and idempotency: ${assertions} assertions passed.`);
