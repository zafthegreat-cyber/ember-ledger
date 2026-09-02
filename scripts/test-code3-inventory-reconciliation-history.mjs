import assert from "node:assert/strict";
import { createFlipScoutRepository } from "../src/features/flipScout/storageRepository.js";
import { PURCHASE_RECEIVING_STORAGE_KEY } from "../src/features/purchaseReceiving/constants.js";
import { INVENTORY_CORRECTION_CATEGORIES } from "../src/features/purchaseReceiving/inventoryCorrection/constants.js";
import { INVENTORY_RECONCILIATION_CATEGORIES } from "../src/features/purchaseReceiving/inventoryReconciliation/constants.js";
import {
  confirmCorrection,
  correctionProposal,
  createManagedInventory,
} from "./inventory-correction-test-helpers.mjs";
import {
  appendManagedSale,
  confirmReconciliation,
  costProposal,
  createSoldManagedInventory,
  reconciliationProposal,
  storedInventory,
} from "./inventory-reconciliation-test-helpers.mjs";

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };

{
  const harness = await createSoldManagedInventory({ id: "replay", quantity: 3, totalMinorUnits: 1000, soldQuantity: 1 });
  const proposal = costProposal("replay", 1100);
  const candidate = harness.service.previewInventoryReconciliation(harness.inventoryItem.id, proposal);
  const first = await harness.service.confirmInventoryReconciliation(harness.inventoryItem.id, candidate.candidateId, { expectedVersion: candidate.expectedVersion, proposal });
  const replay = await harness.service.confirmInventoryReconciliation(harness.inventoryItem.id, candidate.candidateId, { expectedVersion: candidate.expectedVersion, proposal });
  equal(first.wroteReconciliation, true);
  equal(replay.deduplicated, true);
  equal(replay.wroteReconciliation, false);
  equal(storedInventory(harness.inventoryStorage).inventoryReconciliationEvents.length, 1);
  equal(storedInventory(harness.inventoryStorage).inventoryAdjustments.length, 1);
  equal(JSON.stringify(storedInventory(harness.inventoryStorage).sales), harness.originalSaleJson, "replay leaves the immutable Sale byte-equivalent");
  await assert.rejects(
    () => harness.service.confirmInventoryReconciliation(harness.inventoryItem.id, candidate.candidateId, {
      expectedVersion: candidate.expectedVersion,
      proposal: { ...proposal, targetTotalCostMinorUnits: 1200 },
    }),
    (error) => error.code === "IDEMPOTENCY_CONFLICT",
  ); assertions += 1;
}

{
  const harness = await createSoldManagedInventory({ id: "sale-during-preview", quantity: 4, totalMinorUnits: 1000, soldQuantity: 1 });
  const proposal = costProposal("sale-during-preview", 1200);
  const stale = harness.service.previewInventoryReconciliation(harness.inventoryItem.id, proposal);
  const { appendManagedSale } = await import("./inventory-reconciliation-test-helpers.mjs");
  appendManagedSale(harness.repository, harness.inventoryItem, { id: "sale.concurrent-preview.test", quantity: 1 });
  await assert.rejects(
    () => harness.service.confirmInventoryReconciliation(harness.inventoryItem.id, stale.candidateId, { expectedVersion: stale.expectedVersion, proposal }),
    (error) => error.code === "VERSION_CONFLICT",
    "a completed Sale added after preview invalidates the candidate",
  ); assertions += 1;
  equal(storedInventory(harness.inventoryStorage).inventoryReconciliationEvents.length, 0);
}

{
  const harness = await createSoldManagedInventory({ id: "concurrent", quantity: 3, soldQuantity: 1 });
  const proposal = costProposal("concurrent", 1201);
  const candidate = harness.service.previewInventoryReconciliation(harness.inventoryItem.id, proposal);
  const results = await Promise.all([
    harness.service.confirmInventoryReconciliation(harness.inventoryItem.id, candidate.candidateId, { expectedVersion: candidate.expectedVersion, proposal }),
    harness.service.confirmInventoryReconciliation(harness.inventoryItem.id, candidate.candidateId, { expectedVersion: candidate.expectedVersion, proposal }),
  ]);
  equal(results.filter((entry) => entry.wroteReconciliation).length, 1);
  equal(results.filter((entry) => entry.deduplicated).length, 1);
  equal(storedInventory(harness.inventoryStorage).inventoryReconciliationEvents.length, 1);
}

{
  const harness = await createSoldManagedInventory({ id: "journal", quantity: 3, soldQuantity: 1 });
  const proposal = costProposal("journal", 1150);
  const candidate = harness.service.previewInventoryReconciliation(harness.inventoryItem.id, proposal);
  const before = JSON.stringify(storedInventory(harness.inventoryStorage));
  harness.inventoryStorage.failBefore = 1;
  await assert.rejects(
    () => harness.service.confirmInventoryReconciliation(harness.inventoryItem.id, candidate.candidateId, { expectedVersion: candidate.expectedVersion, proposal }),
    (error) => error.code === "RECONCILIATION_WRITE_FAILED",
  ); assertions += 1;
  equal(JSON.stringify(storedInventory(harness.inventoryStorage)), before, "interrupted reconciliation rolls canonical state back byte-for-byte");
  const repaired = await harness.service.confirmInventoryReconciliation(harness.inventoryItem.id, candidate.candidateId, { expectedVersion: candidate.expectedVersion, proposal });
  equal(repaired.wroteReconciliation, true);
  equal(storedInventory(harness.inventoryStorage).inventoryReconciliationEvents.length, 1);
}

{
  const harness = await createSoldManagedInventory({ id: "reversal", quantity: 3, totalMinorUnits: 1000, soldQuantity: 1 });
  const first = await confirmReconciliation(harness.service, harness.inventoryItem, costProposal("reversal-first", 1100));
  const reverseProposal = reconciliationProposal(INVENTORY_RECONCILIATION_CATEGORIES.PRIOR_CORRECTION_REVERSAL, "reversal-second", {
    reversesReconciliationEventId: first.result.reconciliationEvent.id,
  });
  const reverseCandidate = harness.service.previewInventoryReconciliation(first.result.inventoryItem.id, reverseProposal);
  equal(reverseCandidate.eligible, true);
  const reversed = await harness.service.confirmInventoryReconciliation(first.result.inventoryItem.id, reverseCandidate.candidateId, {
    expectedVersion: reverseCandidate.expectedVersion,
    proposal: reverseProposal,
  });
  equal(reversed.inventoryItem.acquisitionCostMinorUnits, 1000);
  equal(reversed.reconciliationEvent.status, "CONFIRMED");
  equal(reversed.reconciliationEvent.reversesReconciliationEventId, first.result.reconciliationEvent.id);
  equal(storedInventory(harness.inventoryStorage).inventoryReconciliationEvents.length, 2);
  equal(JSON.stringify(storedInventory(harness.inventoryStorage).sales), harness.originalSaleJson, "reversal appends history without altering the original Sale");
  const duplicateReverse = harness.service.previewInventoryReconciliation(reversed.inventoryItem.id, reconciliationProposal(
    INVENTORY_RECONCILIATION_CATEGORIES.PRIOR_CORRECTION_REVERSAL,
    "reversal-third",
    { reversesReconciliationEventId: first.result.reconciliationEvent.id },
  ));
  equal(duplicateReverse.eligible, false);
}

{
  const harness = await createManagedInventory({ id: "phase2cc-correction-reversal", quantity: 3, totalMinorUnits: 1000 });
  const corrected = await confirmCorrection(
    harness.service,
    harness.created.inventoryItem,
    correctionProposal(INVENTORY_CORRECTION_CATEGORIES.ACQUISITION_COST_CORRECTION, "phase2cc-correction-reversal", {
      targetTotalCostMinorUnits: 1100,
    }),
  );
  const inventoryRepository = createFlipScoutRepository(harness.inventoryStorage);
  appendManagedSale(inventoryRepository, corrected.result.inventoryItem, { id: "sale.after-phase2cc-correction.test", quantity: 1 });
  const originalSales = JSON.stringify(inventoryRepository.load().sales);
  const proposal = reconciliationProposal(INVENTORY_RECONCILIATION_CATEGORIES.PRIOR_CORRECTION_REVERSAL, "phase2cc-correction-reversal", {
    reversesAdjustmentId: corrected.result.adjustment.id,
  });
  const candidate = harness.service.previewInventoryReconciliation(corrected.result.inventoryItem.id, proposal);
  equal(candidate.eligible, true, "a qualifying latest Phase 2C-C correction may enter reviewed historical reversal");
  equal(candidate.reversesInventoryAdjustmentId, corrected.result.adjustment.id);
  const reversed = await harness.service.confirmInventoryReconciliation(corrected.result.inventoryItem.id, candidate.candidateId, {
    expectedVersion: candidate.expectedVersion,
    proposal,
  });
  equal(reversed.inventoryItem.acquisitionCostMinorUnits, 1000);
  equal(reversed.adjustment.reversesAdjustmentId, corrected.result.adjustment.id);
  equal(reversed.reconciliationEvent.reversesInventoryAdjustmentId, corrected.result.adjustment.id);
  equal(reversed.reconciliationEvent.reversesReconciliationEventId, null);
  const replayed = await harness.service.confirmInventoryReconciliation(corrected.result.inventoryItem.id, candidate.candidateId, {
    expectedVersion: candidate.expectedVersion,
    proposal,
  });
  equal(replayed.deduplicated, true, "replaying a Phase 2C-C reversal resolves to the same canonical effect");
  equal(replayed.reconciliationEvent.id, reversed.reconciliationEvent.id);
  equal(storedInventory(harness.inventoryStorage).inventoryReconciliationEvents.length, 1);
  equal(JSON.stringify(inventoryRepository.load().sales), originalSales, "Phase 2C-C reversal leaves the downstream Sale byte-equivalent");
}

{
  const harness = await createSoldManagedInventory({ id: "missing-purchase-provenance", quantity: 3, soldQuantity: 1 });
  const proposal = costProposal("missing-purchase-provenance", 1100);
  const candidate = harness.service.previewInventoryReconciliation(harness.inventoryItem.id, proposal);
  harness.purchaseStorage.values.delete(PURCHASE_RECEIVING_STORAGE_KEY);
  assert.throws(
    () => harness.service.previewInventoryReconciliation(harness.inventoryItem.id, proposal),
    (error) => error.code === "INVENTORY_PURCHASE_PROVENANCE_INVALID",
    "preview fails closed when ordinary Purchase/Receiving provenance disappears",
  ); assertions += 1;
  await assert.rejects(
    () => harness.service.confirmInventoryReconciliation(harness.inventoryItem.id, candidate.candidateId, {
      expectedVersion: candidate.expectedVersion,
      proposal,
    }),
    (error) => error.code === "INVENTORY_PURCHASE_PROVENANCE_INVALID",
    "confirmation rereads ordinary Purchase/Receiving provenance",
  ); assertions += 1;
  equal(storedInventory(harness.inventoryStorage).inventoryReconciliationEvents.length, 0);
}

console.log(`Code 3 Inventory Reconciliation history: ${assertions} assertions passed.`);
