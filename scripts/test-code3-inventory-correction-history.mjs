import assert from "node:assert/strict";
import { createFlipScoutRepository } from "../src/features/flipScout/storageRepository.js";
import { PURCHASE_EVENT_TYPES } from "../src/features/purchaseReceiving/constants.js";
import { INVENTORY_CORRECTION_CATEGORIES } from "../src/features/purchaseReceiving/inventoryCorrection/constants.js";
import { validateInventoryCreationStateBundles } from "../src/features/purchaseReceiving/inventoryCreation/contracts.js";
import { validateReplacementInventoryPurchaseProvenance } from "../src/features/purchaseReceiving/service.js";
import { exactDraft } from "./inventory-creation-test-helpers.mjs";
import {
  confirmCorrection,
  correctionProposal,
  createManagedInventory,
  storedInventory,
} from "./inventory-correction-test-helpers.mjs";

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };

{
  const harness = await createManagedInventory({ id: "replay", quantity: 2 });
  const proposal = correctionProposal(INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, "replay", { quantity: 1 });
  const candidate = harness.service.previewInventoryCorrection(harness.created.inventoryItem.id, proposal);
  const first = await harness.service.confirmInventoryCorrection(harness.created.inventoryItem.id, candidate.candidateId, { expectedVersion: candidate.expectedVersion, proposal });
  const replay = await harness.service.confirmInventoryCorrection(harness.created.inventoryItem.id, candidate.candidateId, { expectedVersion: candidate.expectedVersion, proposal });
  equal(first.deduplicated, false);
  equal(replay.deduplicated, true);
  equal(storedInventory(harness.inventoryStorage).inventoryAdjustments.length, 1);
  equal(storedInventory(harness.inventoryStorage).inventory[0].quantity, 1);
  await assert.rejects(
    () => harness.service.confirmInventoryCorrection(harness.created.inventoryItem.id, candidate.candidateId, {
      expectedVersion: candidate.expectedVersion,
      proposal: { ...proposal, quantity: 2 },
    }),
    (error) => error.code === "IDEMPOTENCY_CONFLICT",
  ); assertions += 1;
}

{
  const target = await createManagedInventory({ id: "product-then-creation-reversal-target", productReference: "catalog.product-then-reversal-target.test" });
  const sourceDraft = await target.service.createDraft(exactDraft({ id: "product-then-creation-reversal-source", productReference: "catalog.product-then-reversal-source.test" }));
  const ready = await target.service.markDraftReady(sourceDraft.draft.id, sourceDraft.draft.recordVersion);
  const purchase = (await target.service.confirmDraft(ready.draft.id, { expectedVersion: ready.draft.recordVersion })).purchase;
  await target.service.recordReceivingEvent(purchase.id, { idempotencyKey: "receiving.product-then-reversal.test", entries: [{ lineItemId: purchase.lineItems[0].lineItemId, quantityReceived: 1, quantityAffected: 1, condition: "SEALED", discrepancy: "NONE", note: "Synthetic." }] });
  const creationCandidate = target.service.previewInventoryCreation(purchase.id)[0];
  const source = await target.service.confirmInventoryCreation(creationCandidate.candidateId, { expectedVersion: creationCandidate.expectedVersion });
  const corrected = await confirmCorrection(target.service, source.inventoryItem, correctionProposal(INVENTORY_CORRECTION_CATEGORIES.PRODUCT_RESOLUTION_CORRECTION, "product-before-creation-reversal", {
    targetProductReference: target.created.inventoryItem.productReference,
  }));
  const reversed = await target.service.reverseInventoryCreation(corrected.result.adjustment.applicationId, {
    expectedInventoryVersion: corrected.result.inventoryItem.recordVersion,
    quantity: 1,
    reason: "Synthetic owner-confirmed return after product correction.",
    idempotencyKey: "creation-reversal.after-product-correction.test",
  });
  equal(reversed.adjustment.productReference, target.created.inventoryItem.productReference, "creation reversal starts from the current corrected product relationship");
  equal(storedInventory(target.inventoryStorage).inventory.find((entry) => entry.id === source.inventoryItem.id).quantity, 0, "the reviewed reversal removes exactly one available corrected unit");
}

{
  const harness = await createManagedInventory({ id: "stale", quantity: 3 });
  const staleProposal = correctionProposal(INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, "stale-a", { quantity: 1 });
  const stale = harness.service.previewInventoryCorrection(harness.created.inventoryItem.id, staleProposal);
  const otherProposal = correctionProposal(INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION, "stale-b", { quantity: 1, quantityReason: "LOSS" });
  await confirmCorrection(harness.service, harness.created.inventoryItem, otherProposal);
  await assert.rejects(
    () => harness.service.confirmInventoryCorrection(harness.created.inventoryItem.id, stale.candidateId, { expectedVersion: stale.expectedVersion, proposal: staleProposal }),
    (error) => error.code === "VERSION_CONFLICT",
  ); assertions += 1;
  equal(storedInventory(harness.inventoryStorage).inventory[0].quantity, 2);
}

{
  const harness = await createManagedInventory({ id: "reverse-correction", quantity: 2, totalMinorUnits: 1001 });
  const proposal = correctionProposal(INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, "reverse-target", { quantity: 1 });
  const first = await confirmCorrection(harness.service, harness.created.inventoryItem, proposal);
  const reverseProposal = correctionProposal(INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION, "reverse-correction", { reversesAdjustmentId: first.result.adjustment.id });
  const reversed = await confirmCorrection(harness.service, first.result.inventoryItem, reverseProposal);
  equal(reversed.result.inventoryItem.quantity, 2);
  equal(reversed.result.inventoryItem.acquisitionCostMinorUnits, 1001);
  assert.deepEqual(reversed.result.inventoryItem.unitAcquisitionCostsMinorUnits, [501, 500]); assertions += 1;
  equal(storedInventory(harness.inventoryStorage).inventoryAdjustments.length, 2);
}

{
  const harness = await createManagedInventory({ id: "legacy-then-correction", quantity: 3, totalMinorUnits: 1000 });
  const reversed = await harness.service.reverseInventoryCreation(harness.created.application.id, {
    expectedInventoryVersion: harness.created.inventoryItem.recordVersion,
    quantity: 1,
    reason: "Owner-confirmed synthetic reversal.",
    idempotencyKey: "legacy-then-correction.reversal.test",
  });
  equal(reversed.adjustment.adjustmentSequence, 1, "new reversals use typed sequence metadata");
  const proposal = correctionProposal(INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION, "after-reversal", { targetCondition: "OPEN_BOX", targetDisposition: "ADD_TO_INVENTORY" });
  const corrected = await confirmCorrection(harness.service, reversed.inventoryItem, proposal);
  equal(corrected.result.adjustment.adjustmentSequence, 2);
  equal(corrected.result.inventoryItem.quantity, 2);
  equal(corrected.result.inventoryItem.condition, "OPEN_BOX");
}

{
  const harness = await createManagedInventory({ id: "correction-then-reversal", quantity: 3, totalMinorUnits: 1000 });
  const proposal = correctionProposal(INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION, "before-old-gateway", { targetCondition: "OPEN_BOX", targetDisposition: "ADD_TO_INVENTORY" });
  const corrected = await confirmCorrection(harness.service, harness.created.inventoryItem, proposal);
  const reversed = await harness.service.reverseInventoryCreation(harness.created.application.id, {
    expectedInventoryVersion: corrected.result.inventoryItem.recordVersion,
    quantity: 1,
    reason: "Owner-confirmed synthetic reversal after correction.",
    idempotencyKey: "correction-then-reversal.test",
  });
  equal(reversed.adjustment.adjustmentSequence, 2);
  equal(reversed.inventoryItem.condition, "OPEN_BOX");
  equal(reversed.inventoryItem.quantity, 2);
  equal(createFlipScoutRepository(harness.inventoryStorage).load().inventoryAdjustments.length, 2);
}

{
  const harness = await createManagedInventory({ id: "concurrent", quantity: 2 });
  const proposal = correctionProposal(INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, "concurrent", { quantity: 1 });
  const candidate = harness.service.previewInventoryCorrection(harness.created.inventoryItem.id, proposal);
  const results = await Promise.all([
    harness.service.confirmInventoryCorrection(harness.created.inventoryItem.id, candidate.candidateId, { expectedVersion: candidate.expectedVersion, proposal }),
    harness.service.confirmInventoryCorrection(harness.created.inventoryItem.id, candidate.candidateId, { expectedVersion: candidate.expectedVersion, proposal }),
  ]);
  equal(results.filter((entry) => entry.wroteCorrection).length, 1);
  equal(results.filter((entry) => entry.deduplicated).length, 1);
  equal(storedInventory(harness.inventoryStorage).inventory[0].quantity, 1);
}

{
  const harness = await createManagedInventory({ id: "journal", quantity: 2 });
  const before = JSON.stringify(storedInventory(harness.inventoryStorage));
  harness.inventoryStorage.failBefore = 1;
  const proposal = correctionProposal(INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, "journal", { quantity: 1 });
  const candidate = harness.service.previewInventoryCorrection(harness.created.inventoryItem.id, proposal);
  await assert.rejects(
    () => harness.service.confirmInventoryCorrection(harness.created.inventoryItem.id, candidate.candidateId, { expectedVersion: candidate.expectedVersion, proposal }),
    (error) => error.code === "INVENTORY_CORRECTION_WRITE_FAILED",
  ); assertions += 1;
  equal(JSON.stringify(storedInventory(harness.inventoryStorage)), before, "failed journal write leaves canonical state byte-equivalent");
  const repaired = await harness.service.confirmInventoryCorrection(harness.created.inventoryItem.id, candidate.candidateId, { expectedVersion: candidate.expectedVersion, proposal });
  equal(repaired.inventoryItem.quantity, 1);
  equal(storedInventory(harness.inventoryStorage).inventoryAdjustments.length, 1);
}

{
  const harness = await createManagedInventory({ id: "replacement-return-reversal-parity", quantity: 1 });
  const returned = await confirmCorrection(
    harness.service,
    harness.created.inventoryItem,
    correctionProposal(INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER, "replacement-return-reversal-parity-return"),
  );
  const reversed = await confirmCorrection(
    harness.service,
    returned.result.inventoryItem,
    correctionProposal(INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION, "replacement-return-reversal-parity-reverse", {
      reversesAdjustmentId: returned.result.adjustment.id,
    }),
  );
  await assert.rejects(
    () => harness.service.recordPurchaseEvent(harness.purchase.id, {
      type: PURCHASE_EVENT_TYPES.REPLACEMENT_NOTED,
      idempotencyKey: "purchase-event.replacement-inactive-return.test",
      lineItemId: harness.purchase.lineItems[0].lineItemId,
      quantity: 1,
      relatedEventId: returned.result.adjustment.id,
      replacementReference: "replacement-inactive-return.synthetic.test",
    }),
    (error) => error.code === "REPLACEMENT_RETURN_SOURCE_INVALID",
    "a reversed physical return cannot authorize replacement Receiving",
  ); assertions += 1;
  const reapplied = await confirmCorrection(
    harness.service,
    reversed.result.inventoryItem,
    correctionProposal(INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION, "replacement-return-reversal-parity-reapply", {
      reversesAdjustmentId: reversed.result.adjustment.id,
    }),
  );
  equal(reapplied.result.inventoryItem.quantity, 0, "reversing the reversal deterministically reapplies the physical return");
  const authorization = await harness.service.recordPurchaseEvent(harness.purchase.id, {
    type: PURCHASE_EVENT_TYPES.REPLACEMENT_NOTED,
    idempotencyKey: "purchase-event.replacement-reactivated-return.test",
    lineItemId: harness.purchase.lineItems[0].lineItemId,
    quantity: 1,
    relatedEventId: returned.result.adjustment.id,
    replacementReference: "replacement-reactivated-return.synthetic.test",
  });
  equal(authorization.event.relatedEventId, returned.result.adjustment.id, "reversal parity recognizes the active original physical-return source");
  const replacementReceiving = await harness.service.recordReceivingEvent(harness.purchase.id, {
    idempotencyKey: "receiving.replacement-reversal-parity.test",
    replacementEventId: authorization.event.id,
    entries: [{
      lineItemId: harness.purchase.lineItems[0].lineItemId,
      quantityReceived: 1,
      quantityAffected: 1,
      condition: "SEALED",
      discrepancy: "NONE",
      note: "Synthetic replacement received after reversal parity.",
    }],
  });
  const replacementCandidate = harness.service.previewInventoryCreation(harness.purchase.id)
    .find((entry) => entry.receivingEventReferences.includes(replacementReceiving.event.id));
  await harness.service.confirmInventoryCreation(replacementCandidate.candidateId, { expectedVersion: replacementCandidate.expectedVersion });
  const forbiddenReversalOfReversal = harness.service.previewInventoryCorrection(
    harness.created.inventoryItem.id,
    correctionProposal(INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION, "replacement-return-reversal-parity-after-creation", {
      reversesAdjustmentId: reapplied.result.adjustment.id,
    }),
  );
  equal(forbiddenReversalOfReversal.eligible, false, "replacement dependency is rejected in preview even through a reversal-of-reversal chain");
  equal(forbiddenReversalOfReversal.blockers.includes("REPLACEMENT_INVENTORY_RECONCILIATION_REQUIRED"), true, "reversal parity cannot hide a consumed physical-return dependency");
}

{
  const harness = await createManagedInventory({ id: "replacement-chain", quantity: 2, totalMinorUnits: 1001 });
  const returned = await confirmCorrection(
    harness.service,
    harness.created.inventoryItem,
    correctionProposal(INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, "replacement-chain-return", { quantity: 1 }),
  );
  const replacementNote = await harness.service.recordPurchaseEvent(harness.purchase.id, {
    type: PURCHASE_EVENT_TYPES.REPLACEMENT_NOTED,
    idempotencyKey: "purchase-event.replacement-chain.test",
    lineItemId: harness.purchase.lineItems[0].lineItemId,
    quantity: 1,
    relatedEventId: returned.result.adjustment.id,
    replacementReference: "replacement-chain.synthetic.test",
    summary: "Synthetic owner-confirmed replacement authorization.",
  });
  const replacementNoteRetry = await harness.service.recordPurchaseEvent(harness.purchase.id, {
    type: PURCHASE_EVENT_TYPES.REPLACEMENT_NOTED,
    idempotencyKey: "purchase-event.replacement-chain.test",
    lineItemId: harness.purchase.lineItems[0].lineItemId,
    quantity: 1,
    relatedEventId: returned.result.adjustment.id,
    replacementReference: "replacement-chain.synthetic.test",
    summary: "Synthetic owner-confirmed replacement authorization.",
  });
  equal(replacementNoteRetry.deduplicated, true, "an interrupted replacement workflow reuses its existing scoped note");
  const replacementReceiving = await harness.service.recordReceivingEvent(harness.purchase.id, {
    idempotencyKey: "receiving.replacement-chain-second.test",
    replacementEventId: replacementNote.event.id,
    entries: [{
      lineItemId: harness.purchase.lineItems[0].lineItemId,
      quantityReceived: 1,
      quantityAffected: 1,
      condition: "SEALED",
      discrepancy: "NONE",
      note: "Synthetic replacement physically received.",
    }],
  });
  equal(replacementReceiving.projection.totalReceivedQuantity, 2, "replacement receipt does not inflate ordinary Purchase receipt quantity");
  equal(replacementReceiving.projection.totalReplacementReceivedQuantity, 1, "replacement receipt is tracked separately");
  const replacementCandidate = harness.service.previewInventoryCreation(harness.purchase.id)
    .find((entry) => entry.receivingEventReferences.includes(replacementReceiving.event.id));
  equal(replacementCandidate.sourceReturnAdjustmentId, returned.result.adjustment.id, "replacement candidate retains its returned-cost source");
  assert.deepEqual(replacementCandidate.unitAcquisitionCostsMinorUnits, returned.result.adjustment.unitCostsMinorUnits); assertions += 1;
  const replacementInventory = await harness.service.confirmInventoryCreation(replacementCandidate.candidateId, {
    expectedVersion: replacementCandidate.expectedVersion,
  });
  const replacementReplay = await harness.service.confirmInventoryCreation(replacementCandidate.candidateId, {
    expectedVersion: replacementCandidate.expectedVersion,
  });
  equal(replacementReplay.deduplicated, true, "replacement Inventory confirmation remains idempotent");
  const state = storedInventory(harness.inventoryStorage);
  equal(state.inventory.length, 2, "replacement creates a new acquisition lot rather than rewriting the original");
  equal(state.inventory.find((entry) => entry.id === harness.created.inventoryItem.id).quantity, 1, "original returned lot remains append-only and reduced");
  equal(replacementInventory.inventoryItem.quantity, 1);
  equal(state.inventory.reduce((sum, entry) => sum + entry.acquisitionCostMinorUnits, 0), 1001, "returned exact cost moves to replacement without duplication or loss");
  equal(state.inventoryAdjustments.some((entry) => entry.id === returned.result.adjustment.id), true, "original return disposition remains in history");
  const replacementApplication = state.inventoryCreationApplications.find((entry) => entry.id === replacementInventory.application.id);
  equal(replacementApplication.receivingEventReferences[0], replacementReceiving.event.id, "replacement acquisition preserves its new Receiving provenance");
  equal(replacementApplication.sourceReturnAdjustmentId, returned.result.adjustment.id, "replacement acquisition persists its exact physical-return dependency");
  equal(replacementApplication.replacementAuthorizationEventId, replacementNote.event.id, "replacement acquisition persists its owner authorization dependency");
  equal(replacementApplication.sourceReturnUnitOffset, 0, "replacement acquisition persists the exact returned-unit cost offset");
  const authorizationTampered = structuredClone(state);
  for (const record of [
    authorizationTampered.inventoryCreationApplications.find((entry) => entry.id === replacementApplication.id),
    authorizationTampered.inventoryCreationEvents.find((entry) => entry.id === replacementApplication.inventoryCreationEventId),
    authorizationTampered.inventoryLots.find((entry) => entry.id === replacementApplication.inventoryLotId),
    authorizationTampered.inventory.find((entry) => entry.id === replacementApplication.inventoryItemId),
  ]) record.replacementAuthorizationEventId = "purchase-event:synthetic-forged-reference";
  assert.throws(
    () => validateReplacementInventoryPurchaseProvenance(authorizationTampered, harness.service.snapshot()),
    (error) => error.code === "REPLACEMENT_PURCHASE_PROVENANCE_INVALID",
    "a coherently substituted replacement authorization reference fails the cross-store Purchase/Receiving boundary",
  ); assertions += 1;
  const provenanceRemoved = structuredClone(state);
  for (const record of [
    provenanceRemoved.inventoryCreationApplications.find((entry) => entry.id === replacementApplication.id),
    provenanceRemoved.inventoryCreationEvents.find((entry) => entry.id === replacementApplication.inventoryCreationEventId),
    provenanceRemoved.inventoryLots.find((entry) => entry.id === replacementApplication.inventoryLotId),
    provenanceRemoved.inventory.find((entry) => entry.id === replacementApplication.inventoryItemId),
  ]) {
    record.replacementAuthorizationEventId = null;
    record.sourceReturnAdjustmentId = null;
    record.sourceReturnUnitOffset = null;
  }
  assert.throws(
    () => validateReplacementInventoryPurchaseProvenance(provenanceRemoved, harness.service.snapshot()),
    (error) => error.code === "REPLACEMENT_PURCHASE_PROVENANCE_INVALID",
    "clearing replacement provenance cannot turn replacement Inventory into an ordinary acquisition",
  ); assertions += 1;
  const coherentlyTampered = structuredClone(state);
  const tamperedApplication = coherentlyTampered.inventoryCreationApplications.find((entry) => entry.id === replacementApplication.id);
  const tamperedEvent = coherentlyTampered.inventoryCreationEvents.find((entry) => entry.id === tamperedApplication.inventoryCreationEventId);
  const tamperedLot = coherentlyTampered.inventoryLots.find((entry) => entry.id === tamperedApplication.inventoryLotId);
  const tamperedItem = coherentlyTampered.inventory.find((entry) => entry.id === tamperedApplication.inventoryItemId);
  const wrongCost = tamperedApplication.totalCostMinorUnits - 1;
  tamperedApplication.totalCostMinorUnits = wrongCost;
  tamperedApplication.unitCostsMinorUnits = [wrongCost];
  tamperedEvent.totalCostMinorUnits = wrongCost;
  tamperedEvent.unitCostsMinorUnits = [wrongCost];
  tamperedLot.originalAcquisitionCostMinorUnits = wrongCost;
  tamperedLot.acquisitionCostMinorUnits = wrongCost;
  tamperedLot.originalUnitAcquisitionCostsMinorUnits = [wrongCost];
  tamperedLot.unitAcquisitionCostsMinorUnits = [wrongCost];
  tamperedItem.originalAcquisitionCostMinorUnits = wrongCost;
  tamperedItem.acquisitionCostMinorUnits = wrongCost;
  tamperedItem.originalUnitAcquisitionCostsMinorUnits = [wrongCost];
  tamperedItem.unitAcquisitionCostsMinorUnits = [wrongCost];
  assert.throws(
    () => validateInventoryCreationStateBundles(coherentlyTampered),
    (error) => error.code === "REPLACEMENT_COST_SLICE_INVALID",
    "coherent cross-record cost tampering cannot shave the exact returned Inventory cost slice",
  ); assertions += 1;
  const shiftedSlice = structuredClone(state);
  const shiftedApplication = shiftedSlice.inventoryCreationApplications.find((entry) => entry.id === replacementApplication.id);
  const shiftedEvent = shiftedSlice.inventoryCreationEvents.find((entry) => entry.id === shiftedApplication.inventoryCreationEventId);
  const shiftedLot = shiftedSlice.inventoryLots.find((entry) => entry.id === shiftedApplication.inventoryLotId);
  const shiftedItem = shiftedSlice.inventory.find((entry) => entry.id === shiftedApplication.inventoryItemId);
  const shiftedCost = returned.result.adjustment.unitCostsMinorUnits[1] ?? returned.result.adjustment.unitCostsMinorUnits[0];
  for (const record of [shiftedApplication, shiftedEvent, shiftedLot, shiftedItem]) record.sourceReturnUnitOffset = 1;
  shiftedApplication.totalCostMinorUnits = shiftedCost;
  shiftedApplication.unitCostsMinorUnits = [shiftedCost];
  shiftedEvent.totalCostMinorUnits = shiftedCost;
  shiftedEvent.unitCostsMinorUnits = [shiftedCost];
  shiftedLot.originalAcquisitionCostMinorUnits = shiftedCost;
  shiftedLot.acquisitionCostMinorUnits = shiftedCost;
  shiftedLot.originalUnitAcquisitionCostsMinorUnits = [shiftedCost];
  shiftedLot.unitAcquisitionCostsMinorUnits = [shiftedCost];
  shiftedItem.originalAcquisitionCostMinorUnits = shiftedCost;
  shiftedItem.acquisitionCostMinorUnits = shiftedCost;
  shiftedItem.originalUnitAcquisitionCostsMinorUnits = [shiftedCost];
  shiftedItem.unitAcquisitionCostsMinorUnits = [shiftedCost];
  assert.throws(
    () => validateInventoryCreationStateBundles(shiftedSlice),
    (error) => error.code === "REPLACEMENT_COST_SLICE_INVALID",
    "a coherently shifted replacement slice cannot skip the deterministic returned-unit prefix",
  ); assertions += 1;
  const forbiddenReturnReversal = harness.service.previewInventoryCorrection(
    harness.created.inventoryItem.id,
    correctionProposal(INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION, "replacement-source-after-creation", {
      reversesAdjustmentId: returned.result.adjustment.id,
    }),
  );
  equal(forbiddenReturnReversal.eligible, false, "a return consumed by replacement Inventory cannot be reversed into duplicate stock");
  equal(forbiddenReturnReversal.blockers.includes("REPLACEMENT_INVENTORY_RECONCILIATION_REQUIRED"), true, "replacement dependency blocks original return reversal");
  await assert.rejects(
    () => harness.service.recordReceivingEvent(harness.purchase.id, {
      idempotencyKey: "receiving.unlinked-overreceipt.test",
      entries: [{ lineItemId: harness.purchase.lineItems[0].lineItemId, quantityReceived: 1, quantityAffected: 1, condition: "SEALED", discrepancy: "NONE" }],
    }),
    (error) => error.code === "RECEIVING_EXCEEDS_ORDERED",
    "generic unlinked over-receipt stays blocked",
  ); assertions += 1;
}

{
  const harness = await createManagedInventory({ id: "replacement-split-cost-slices", quantity: 3, totalMinorUnits: 1001 });
  const returned = await confirmCorrection(
    harness.service,
    harness.created.inventoryItem,
    correctionProposal(INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, "replacement-split-cost-return", { quantity: 2 }),
  );
  const authorization = await harness.service.recordPurchaseEvent(harness.purchase.id, {
    type: PURCHASE_EVENT_TYPES.REPLACEMENT_NOTED,
    idempotencyKey: "purchase-event.replacement-split-cost.test",
    lineItemId: harness.purchase.lineItems[0].lineItemId,
    quantity: 2,
    relatedEventId: returned.result.adjustment.id,
    replacementReference: "replacement-split-cost.synthetic.test",
  });
  const firstReceiving = await harness.service.recordReceivingEvent(harness.purchase.id, {
    idempotencyKey: "receiving.replacement-split-cost-first.test",
    replacementEventId: authorization.event.id,
    entries: [{ lineItemId: harness.purchase.lineItems[0].lineItemId, quantityReceived: 1, quantityAffected: 1, condition: "SEALED", discrepancy: "NONE" }],
  });
  const firstCandidate = harness.service.previewInventoryCreation(harness.purchase.id)
    .find((entry) => entry.receivingEventReferences.includes(firstReceiving.event.id));
  equal(firstCandidate.sourceReturnUnitOffset, 0, "the first split replacement starts at the returned-cost prefix");
  const firstCreated = await harness.service.confirmInventoryCreation(firstCandidate.candidateId, { expectedVersion: firstCandidate.expectedVersion });
  const firstState = storedInventory(harness.inventoryStorage);
  const firstApplication = firstState.inventoryCreationApplications.find((entry) => entry.id === firstCreated.application.id);
  const firstEvent = firstState.inventoryCreationEvents.find((entry) => entry.id === firstApplication.inventoryCreationEventId);
  const firstLot = firstState.inventoryLots.find((entry) => entry.id === firstApplication.inventoryLotId);
  const firstItem = firstState.inventory.find((entry) => entry.id === firstApplication.inventoryItemId);
  assert.deepEqual(
    [firstApplication, firstEvent, firstLot, firstItem].map((entry) => entry.sourceReturnUnitOffset),
    [0, 0, 0, 0],
    "all replacement provenance records retain the same source-unit offset",
  ); assertions += 1;
  const gappedSlice = structuredClone(firstState);
  const gappedApplication = gappedSlice.inventoryCreationApplications.find((entry) => entry.id === firstApplication.id);
  const gappedEvent = gappedSlice.inventoryCreationEvents.find((entry) => entry.id === firstApplication.inventoryCreationEventId);
  const gappedLot = gappedSlice.inventoryLots.find((entry) => entry.id === firstApplication.inventoryLotId);
  const gappedItem = gappedSlice.inventory.find((entry) => entry.id === firstApplication.inventoryItemId);
  const gappedCost = returned.result.adjustment.unitCostsMinorUnits[1];
  for (const record of [gappedApplication, gappedEvent, gappedLot, gappedItem]) record.sourceReturnUnitOffset = 1;
  gappedApplication.totalCostMinorUnits = gappedCost;
  gappedApplication.unitCostsMinorUnits = [gappedCost];
  gappedEvent.totalCostMinorUnits = gappedCost;
  gappedEvent.unitCostsMinorUnits = [gappedCost];
  gappedLot.originalAcquisitionCostMinorUnits = gappedCost;
  gappedLot.acquisitionCostMinorUnits = gappedCost;
  gappedLot.originalUnitAcquisitionCostsMinorUnits = [gappedCost];
  gappedLot.unitAcquisitionCostsMinorUnits = [gappedCost];
  gappedItem.originalAcquisitionCostMinorUnits = gappedCost;
  gappedItem.acquisitionCostMinorUnits = gappedCost;
  gappedItem.originalUnitAcquisitionCostsMinorUnits = [gappedCost];
  gappedItem.unitAcquisitionCostsMinorUnits = [gappedCost];
  assert.throws(
    () => validateInventoryCreationStateBundles(gappedSlice),
    (error) => error.code === "REPLACEMENT_COST_SLICE_INVALID",
    "a valid but gapped returned-cost slice cannot replace the deterministic prefix",
  ); assertions += 1;
  const secondReceiving = await harness.service.recordReceivingEvent(harness.purchase.id, {
    idempotencyKey: "receiving.replacement-split-cost-second.test",
    replacementEventId: authorization.event.id,
    entries: [{ lineItemId: harness.purchase.lineItems[0].lineItemId, quantityReceived: 1, quantityAffected: 1, condition: "SEALED", discrepancy: "NONE" }],
  });
  const secondCandidate = harness.service.previewInventoryCreation(harness.purchase.id)
    .find((entry) => entry.receivingEventReferences.includes(secondReceiving.event.id));
  equal(secondCandidate.sourceReturnUnitOffset, 1, "the second split replacement consumes the next disjoint returned-cost unit");
  await harness.service.confirmInventoryCreation(secondCandidate.candidateId, { expectedVersion: secondCandidate.expectedVersion });
  const completed = storedInventory(harness.inventoryStorage).inventoryCreationApplications
    .filter((entry) => entry.sourceReturnAdjustmentId === returned.result.adjustment.id)
    .sort((left, right) => left.sourceReturnUnitOffset - right.sourceReturnUnitOffset);
  assert.deepEqual(completed.map((entry) => entry.sourceReturnUnitOffset), [0, 1]); assertions += 1;
  equal(completed.reduce((sum, entry) => sum + entry.totalCostMinorUnits, 0), returned.result.adjustment.totalCostMinorUnits, "split replacement slices reconcile exactly to returned acquisition cost");
}

{
  const harness = await createManagedInventory({ id: "replacement-source-identity", quantity: 3, totalMinorUnits: 900 });
  const returnA = await confirmCorrection(
    harness.service,
    harness.created.inventoryItem,
    correctionProposal(INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, "replacement-source-identity-a", { quantity: 1 }),
  );
  const returnB = await confirmCorrection(
    harness.service,
    returnA.result.inventoryItem,
    correctionProposal(INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, "replacement-source-identity-b", { quantity: 1 }),
  );
  const authorizationA = await harness.service.recordPurchaseEvent(harness.purchase.id, {
    type: PURCHASE_EVENT_TYPES.REPLACEMENT_NOTED,
    idempotencyKey: "purchase-event.replacement-source-identity-a.test",
    lineItemId: harness.purchase.lineItems[0].lineItemId,
    quantity: 1,
    relatedEventId: returnA.result.adjustment.id,
    replacementReference: "replacement-source-identity-a.synthetic.test",
  });
  const authorizationB = await harness.service.recordPurchaseEvent(harness.purchase.id, {
    type: PURCHASE_EVENT_TYPES.REPLACEMENT_NOTED,
    idempotencyKey: "purchase-event.replacement-source-identity-b.test",
    lineItemId: harness.purchase.lineItems[0].lineItemId,
    quantity: 1,
    relatedEventId: returnB.result.adjustment.id,
    replacementReference: "replacement-source-identity-b.synthetic.test",
  });
  const replacementReceiving = await harness.service.recordReceivingEvent(harness.purchase.id, {
    idempotencyKey: "receiving.replacement-source-identity-followup.test",
    replacementEventId: authorizationA.event.id,
    entries: [{ lineItemId: harness.purchase.lineItems[0].lineItemId, quantityReceived: 1, quantityAffected: 1, condition: "SEALED", discrepancy: "NONE" }],
  });
  const candidate = harness.service.previewInventoryCreation(harness.purchase.id)
    .find((entry) => entry.receivingEventReferences.includes(replacementReceiving.event.id));
  const created = await harness.service.confirmInventoryCreation(candidate.candidateId, { expectedVersion: candidate.expectedVersion });
  const substitutedInventory = structuredClone(storedInventory(harness.inventoryStorage));
  const application = substitutedInventory.inventoryCreationApplications.find((entry) => entry.id === created.application.id);
  const records = [
    application,
    substitutedInventory.inventoryCreationEvents.find((entry) => entry.id === application.inventoryCreationEventId),
    substitutedInventory.inventoryLots.find((entry) => entry.id === application.inventoryLotId),
    substitutedInventory.inventory.find((entry) => entry.id === application.inventoryItemId),
  ];
  for (const record of records) {
    record.replacementAuthorizationEventId = authorizationB.event.id;
    record.sourceReturnAdjustmentId = returnB.result.adjustment.id;
    record.sourceReturnUnitOffset = 0;
  }
  validateInventoryCreationStateBundles(substitutedInventory);
  const substitutedPurchases = structuredClone(harness.service.snapshot());
  substitutedPurchases.receivingEvents.find((entry) => entry.id === replacementReceiving.event.id).replacementEventId = authorizationB.event.id;
  assert.throws(
    () => validateReplacementInventoryPurchaseProvenance(substitutedInventory, substitutedPurchases),
    (error) => error.code === "REPLACEMENT_PURCHASE_PROVENANCE_INVALID",
    "coherent substitution between two valid same-line return authorizations cannot preserve the original replacement candidate identity",
  ); assertions += 1;
}

console.log(`Code 3 Inventory Correction history/idempotency: ${assertions} assertions passed.`);
