import assert from "node:assert/strict";
import {
  INVENTORY_RECONCILIATION_CATEGORIES,
  INVENTORY_RECONCILIATION_STATUSES,
} from "../src/features/purchaseReceiving/inventoryReconciliation/constants.js";
import {
  managedSaleReconciliationProjection,
  validateInventoryReconciliationState,
} from "../src/features/purchaseReceiving/inventoryReconciliation/contracts.js";
import {
  confirmReconciliation,
  costProposal,
  createSoldManagedInventory,
  reconciliationProposal,
  storedInventory,
} from "./inventory-reconciliation-test-helpers.mjs";

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };

{
  const harness = await createSoldManagedInventory({ id: "partial-increase", quantity: 3, totalMinorUnits: 1000, soldQuantity: 1 });
  const proposal = costProposal("partial-increase", 1100);
  const candidate = harness.service.previewInventoryReconciliation(harness.inventoryItem.id, proposal);
  equal(candidate.authoritative, false, "candidate is non-authoritative");
  equal(candidate.persisted, false, "candidate remains ephemeral");
  equal(candidate.status, INVENTORY_RECONCILIATION_STATUSES.READY_TO_CONFIRM);
  equal(candidate.soldQuantity, 1);
  equal(candidate.availableQuantity, 2);
  assert.deepEqual(candidate.current.unitAcquisitionCostsMinorUnits, [334, 333, 333]); assertions += 1;
  assert.deepEqual(candidate.proposed.unitAcquisitionCostsMinorUnits, [367, 367, 366]); assertions += 1;
  equal(candidate.saleCogsEffectMinorUnits, 33);
  equal(candidate.remainingInventoryCostEffectMinorUnits, 67);
  equal(candidate.costEffectMinorUnits, 100);
  equal(candidate.saleCogsEffectMinorUnits + candidate.remainingInventoryCostEffectMinorUnits, candidate.costEffectMinorUnits);
  equal(candidate.affectedSales[0].originalCogsMinorUnits, 334);
  equal(candidate.affectedSales[0].priorEffectiveCogsMinorUnits, 334);
  equal(candidate.affectedSales[0].correctedCogsMinorUnits, 367);
  equal(candidate.affectedSales[0].cogsDeltaMinorUnits, 33);

  const originalSales = JSON.stringify(harness.repository.load().sales);
  const { result } = await confirmReconciliation(harness.service, harness.inventoryItem, proposal);
  equal(result.wroteReconciliation, true);
  equal(JSON.stringify(harness.repository.load().sales), originalSales, "canonical Sale bytes remain unchanged");
  equal(result.inventoryItem.acquisitionCostMinorUnits, 1100);
  equal(result.reconciliationEvent.saleCogsEffectMinorUnits, 33);
  equal(result.reconciliationEvent.remainingInventoryCostEffectMinorUnits, 67);
  equal(result.reconciliationEvent.quantityEffect, 0);
  equal(validateInventoryReconciliationState(harness.repository.load()).events.length, 1);
  const projection = managedSaleReconciliationProjection(harness.sales[0], harness.repository.load().inventoryReconciliationEvents);
  equal(projection.originalCogsMinorUnits, 334);
  equal(projection.cogsAdjustmentMinorUnits, 33);
  equal(projection.effectiveCogsMinorUnits, 367);
}

{
  const harness = await createSoldManagedInventory({ id: "full-decrease", quantity: 2, totalMinorUnits: 1101, sales: [{ quantity: 2 }] });
  const candidate = harness.service.previewInventoryReconciliation(harness.inventoryItem.id, costProposal("full-decrease", 1000));
  equal(candidate.soldQuantity, 2);
  equal(candidate.availableQuantity, 0);
  equal(candidate.saleCogsEffectMinorUnits, -101, "negative realized COGS adjustment is exact");
  equal(candidate.remainingInventoryCostEffectMinorUnits, 0);
  equal(candidate.costEffectMinorUnits, -101);
  const completed = await confirmReconciliation(harness.service, harness.inventoryItem, costProposal("full-decrease-confirm", 1000));
  equal(completed.result.reconciliationEvent.saleCogsEffectMinorUnits, -101);
  equal(completed.result.inventoryItem.quantity, 2, "COGS correction changes no physical quantity");
}

{
  const harness = await createSoldManagedInventory({
    id: "multi-sale-remainder",
    quantity: 5,
    totalMinorUnits: 1003,
    sales: [{ quantity: 2 }, { quantity: 1 }],
  });
  const candidate = harness.service.previewInventoryReconciliation(harness.inventoryItem.id, costProposal("multi-sale-remainder", 1011));
  equal(candidate.affectedSales.length, 2);
  equal(candidate.affectedSales[0].allocationSequence, 1);
  equal(candidate.affectedSales[1].allocationSequence, 2);
  equal(candidate.affectedSales[0].unitOffset, 0);
  equal(candidate.affectedSales[1].unitOffset, 2);
  equal(candidate.saleCogsEffectMinorUnits + candidate.remainingInventoryCostEffectMinorUnits, 8, "sold and remaining slices conserve every penny");
}

{
  const harness = await createSoldManagedInventory({ id: "valid-return", quantity: 3, totalMinorUnits: 1000, soldQuantity: 1 });
  const proposal = reconciliationProposal(INVENTORY_RECONCILIATION_CATEGORIES.RETURN_AFTER_SALE_RECONCILIATION, "valid-return", { quantity: 2 });
  const candidate = harness.service.previewInventoryReconciliation(harness.inventoryItem.id, proposal);
  equal(candidate.eligible, true, "only physically available units may be returned");
  equal(candidate.proposed.quantity, 1);
  equal(candidate.quantityEffect, -2);
  equal(candidate.saleCogsEffectMinorUnits, 0, "return does not rewrite realized Sale COGS");
  const completed = await confirmReconciliation(harness.service, harness.inventoryItem, proposal);
  equal(completed.result.inventoryItem.quantity, 1);
  equal(completed.result.inventoryItem.quantity - candidate.soldQuantity, 0, "return leaves no negative availability");
}

{
  const harness = await createSoldManagedInventory({ id: "over-return", quantity: 3, soldQuantity: 1 });
  const candidate = harness.service.previewInventoryReconciliation(harness.inventoryItem.id, reconciliationProposal(
    INVENTORY_RECONCILIATION_CATEGORIES.RETURN_AFTER_SALE_RECONCILIATION,
    "over-return",
    { quantity: 3 },
  ));
  equal(candidate.eligible, false);
  ok(candidate.blockers.includes("RETURN_EXCEEDS_PHYSICALLY_AVAILABLE_QUANTITY"));
}

{
  const harness = await createSoldManagedInventory({ id: "transfer-block", quantity: 2, soldQuantity: 1 });
  const candidate = harness.service.previewInventoryReconciliation(harness.inventoryItem.id, reconciliationProposal(
    INVENTORY_RECONCILIATION_CATEGORIES.TRANSFER_COST_RECONCILIATION,
    "transfer-block",
    { targetTotalCostMinorUnits: 1200 },
  ));
  equal(candidate.status, INVENTORY_RECONCILIATION_STATUSES.NEEDS_REVIEW);
  equal(candidate.eligible, false);
  ok(candidate.blockers.includes("MANAGED_TRANSFER_AUTHORITY_UNAVAILABLE"));
  equal(candidate.affectedTransfers.length, 0, "no synthetic transfer authority is fabricated");
}

{
  const state = storedInventory((await createSoldManagedInventory({ id: "schema-five" })).inventoryStorage);
  equal(state.schemaVersion, 5, "same Business storage key normalizes to schema 5");
  ok(Array.isArray(state.inventoryReconciliationEvents), "schema 5 has one append-only reconciliation collection");
}

console.log(`Code 3 Inventory Reconciliation domain: ${assertions} assertions passed.`);
