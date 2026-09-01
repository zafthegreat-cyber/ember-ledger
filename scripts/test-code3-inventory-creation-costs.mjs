import assert from "node:assert/strict";
import { allocateAcquisitionCostToUnits, allocateReceivingCostSlice } from "../src/features/purchaseReceiving/index.js";
import { createInventoryHarness, confirmFixturePurchase, exactDraft, receive } from "./inventory-creation-test-helpers.mjs";

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const deepEqual = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions += 1; };

deepEqual(allocateAcquisitionCostToUnits(1000, 3), [334, 333, 333], "minor-unit remainder is deterministic");
deepEqual(allocateReceivingCostSlice({ totalMinorUnits: 1000, accountableQuantity: 10, precedingReceivedQuantity: 0, receivedQuantity: 4 }).unitCostsMinorUnits, [100, 100, 100, 100]);
deepEqual(allocateReceivingCostSlice({ totalMinorUnits: 1001, accountableQuantity: 10, precedingReceivedQuantity: 4, receivedQuantity: 6 }).unitCostsMinorUnits, [100, 100, 100, 100, 100, 100]);

{
  const harness = createInventoryHarness();
  const purchase = await confirmFixturePurchase(harness.service, exactDraft({ id: "penny", quantity: 3, totalMinorUnits: 1000 }));
  await receive(harness.service, purchase, { quantity: 3, condition: "SEALED" });
  const candidate = harness.service.previewInventoryCreation(purchase.id)[0];
  deepEqual(candidate.unitAcquisitionCostsMinorUnits, [334, 333, 333]);
  equal(candidate.totalAcquisitionCost.minorUnits, 1000);
  const result = await harness.service.confirmInventoryCreation(candidate.candidateId, { expectedVersion: candidate.expectedVersion, review: {} });
  deepEqual(result.inventoryItem.unitAcquisitionCostsMinorUnits, [334, 333, 333]);
  equal(result.inventoryItem.acquisitionCostMinorUnits, 1000);
  equal(result.inventoryItem.allocatedItemCost, undefined, "floating-point compatibility cost is not canonicalized");
}

{
  const harness = createInventoryHarness();
  const purchase = await confirmFixturePurchase(harness.service, exactDraft({ id: "partial", quantity: 10, totalMinorUnits: 1001 }));
  await receive(harness.service, purchase, { quantity: 4, condition: "SEALED", id: "partial-a" });
  await receive(harness.service, purchase, { quantity: 6, condition: "SEALED", id: "partial-b" });
  const candidates = harness.service.previewInventoryCreation(purchase.id);
  equal(candidates.length, 2);
  equal(candidates[0].totalAcquisitionCost.minorUnits, 401);
  equal(candidates[1].totalAcquisitionCost.minorUnits, 600);
  equal(candidates.reduce((sum, candidate) => sum + candidate.totalAcquisitionCost.minorUnits, 0), 1001);
}

{
  let sequence = 0;
  let receivingSequence = 0;
  const harness = createInventoryHarness({
    idFactory: (prefix) => prefix === "receiving-event"
      ? (receivingSequence++ === 0 ? "receiving-event.z-first.test" : "receiving-event.a-second.test")
      : `${prefix}.append-order-${sequence++}.test`,
  });
  const purchase = await confirmFixturePurchase(harness.service, exactDraft({ id: "append-order", quantity: 10, totalMinorUnits: 1001 }));
  await receive(harness.service, purchase, { quantity: 4, condition: "SEALED", id: "append-order-a" });
  await receive(harness.service, purchase, { quantity: 6, condition: "SEALED", id: "append-order-b" });
  const candidates = harness.service.previewInventoryCreation(purchase.id);
  equal(candidates[0].receivingEventReferences[0], "receiving-event.z-first.test", "receiving cost follows persisted append order, not lexical event ID");
  equal(candidates[0].totalAcquisitionCost.minorUnits, 401, "the first appended receive owns the deterministic remainder even when its ID sorts later");
  equal(candidates[1].receivingEventReferences[0], "receiving-event.a-second.test");
  equal(candidates[1].totalAcquisitionCost.minorUnits, 600);
}

{
  const harness = createInventoryHarness();
  const purchase = await confirmFixturePurchase(harness.service, exactDraft({ id: "large-safe-money", totalMinorUnits: 1_000_001 }));
  await receive(harness.service, purchase, { condition: "SEALED", id: "large-safe-money" });
  const candidate = harness.service.previewInventoryCreation(purchase.id)[0];
  equal(candidate.totalAcquisitionCost.minorUnits, 1_000_001, "Inventory preserves the Purchase safe-integer money range independently from quantity bounds");
  const result = await harness.service.confirmInventoryCreation(candidate.candidateId, { expectedVersion: candidate.expectedVersion });
  equal(result.inventoryItem.acquisitionCostMinorUnits, 1_000_001, "exact costs above $10,000 remain valid minor-unit authority");
}

console.log(`Code 3 Inventory Creation exact costs: ${assertions} assertions passed.`);
