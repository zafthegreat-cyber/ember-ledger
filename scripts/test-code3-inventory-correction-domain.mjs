import assert from "node:assert/strict";
import {
  INVENTORY_CORRECTION_CATEGORIES,
  INVENTORY_CORRECTION_DISPOSITIONS,
} from "../src/features/purchaseReceiving/inventoryCorrection/constants.js";
import {
  confirmCorrection,
  correctionProposal,
  createManagedInventory,
} from "./inventory-correction-test-helpers.mjs";

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };

{
  const harness = await createManagedInventory({ id: "condition", quantity: 2, totalMinorUnits: 1001 });
  const proposal = correctionProposal(INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION, "condition", {
    targetCondition: "DAMAGED",
    targetDisposition: "ADD_AS_DAMAGED",
  });
  const candidate = harness.service.previewInventoryCorrection(harness.created.inventoryItem.id, proposal);
  equal(candidate.authoritative, false, "candidate is non-authoritative");
  equal(candidate.persisted, false, "candidate is ephemeral");
  equal(candidate.current.condition, "SEALED");
  equal(candidate.proposed.condition, "DAMAGED");
  equal(candidate.proposed.inventoryDispositionState, INVENTORY_CORRECTION_DISPOSITIONS.DAMAGED);
  equal(candidate.quantityEffect, 0);
  equal(candidate.costEffectMinorUnits, 0);
  ok(candidate.warnings.includes("CORRECTION_APPLIES_TO_WHOLE_CURRENT_LOT"));
  const { result } = await confirmCorrection(harness.service, harness.created.inventoryItem, proposal);
  equal(result.inventoryItem.condition, "DAMAGED");
  equal(result.inventoryLot.condition, "DAMAGED");
  equal(result.adjustment.previousState.condition, "SEALED");
  equal(result.adjustment.resultingState.condition, "DAMAGED");
}

{
  const harness = await createManagedInventory({ id: "sealed-condition-mismatch" });
  const candidate = harness.service.previewInventoryCorrection(
    harness.created.inventoryItem.id,
    correctionProposal(INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION, "sealed-condition-mismatch", {
      targetCondition: "USED",
      targetDisposition: "ADD_TO_INVENTORY",
    }),
  );
  equal(candidate.eligible, false, "a sealed product cannot silently adopt an accessory-only condition");
  ok(candidate.blockers.includes("PRODUCT_CLASSIFICATION_CONDITION_MISMATCH"));
}

{
  const harness = await createManagedInventory({ id: "partial-return", quantity: 3, totalMinorUnits: 1000 });
  const proposal = correctionProposal(INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, "partial-return", { quantity: 1 });
  const { candidate, result } = await confirmCorrection(harness.service, harness.created.inventoryItem, proposal);
  equal(candidate.current.acquisitionCostMinorUnits, 1000);
  equal(candidate.proposed.quantity, 2);
  equal(candidate.proposed.acquisitionCostMinorUnits, 667);
  equal(candidate.costEffectMinorUnits, -333);
  equal(result.inventoryItem.quantity, 2);
  equal(result.adjustment.quantityEffect, -1);
  equal(result.adjustment.unitCostsMinorUnits[0], 333);
  equal(result.inventoryItem.inventoryDispositionState, INVENTORY_CORRECTION_DISPOSITIONS.AVAILABLE);
}

{
  const harness = await createManagedInventory({ id: "damaged-partial-return", quantity: 2, totalMinorUnits: 1000 });
  const damaged = correctionProposal(INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION, "damaged-before-return", {
    targetCondition: "DAMAGED", targetDisposition: "ADD_AS_DAMAGED",
  });
  const first = await confirmCorrection(harness.service, harness.created.inventoryItem, damaged);
  const returned = correctionProposal(INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, "damaged-partial-return", { quantity: 1 });
  const second = await confirmCorrection(harness.service, first.result.inventoryItem, returned);
  equal(second.result.inventoryItem.quantity, 1);
  equal(second.result.inventoryItem.condition, "DAMAGED");
  equal(second.result.inventoryItem.inventoryDispositionState, INVENTORY_CORRECTION_DISPOSITIONS.DAMAGED, "partial return preserves reviewed damaged state for the remaining unit");
}

{
  const harness = await createManagedInventory({ id: "return-full", quantity: 2, totalMinorUnits: 999 });
  const proposal = correctionProposal(INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER, "return-full");
  const { result } = await confirmCorrection(harness.service, harness.created.inventoryItem, proposal);
  equal(result.inventoryItem.quantity, 0);
  equal(result.inventoryItem.acquisitionCostMinorUnits, 0);
  equal(result.inventoryItem.inventoryDispositionState, INVENTORY_CORRECTION_DISPOSITIONS.RETURNED);
  equal(result.inventoryItem.status, "Disposed");
  equal(result.inventoryLot.status, "REVERSED");
}

{
  const harness = await createManagedInventory({ id: "return-full-cannot-be-partial", quantity: 3 });
  const candidate = harness.service.previewInventoryCorrection(
    harness.created.inventoryItem.id,
    correctionProposal(INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER, "return-full-cannot-be-partial", { quantity: 1 }),
  );
  equal(candidate.eligible, false, "RETURN_TO_RETAILER cannot encode a partial physical return");
  ok(candidate.blockers.includes("FULL_RETURN_REQUIRES_ALL_AVAILABLE_QUANTITY"));
}

{
  const harness = await createManagedInventory({ id: "quantity-loss", quantity: 3, totalMinorUnits: 1000 });
  const proposal = correctionProposal(INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION, "quantity-loss", {
    quantity: 1, quantityReason: "LOSS",
  });
  const { result } = await confirmCorrection(harness.service, harness.created.inventoryItem, proposal);
  equal(result.inventoryItem.quantity, 2);
  equal(result.adjustment.correctionCategory, INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION);
  equal(result.adjustment.quantityReason, "LOSS", "structured quantity reason is canonical append-only metadata");
  equal(result.adjustment.quantityEffect, -1);
}

{
  for (const [id, reason, expectedDisposition] of [
    ["quantity-return", "RETURN", INVENTORY_CORRECTION_DISPOSITIONS.RETURNED],
    ["quantity-loss-full", "LOSS", INVENTORY_CORRECTION_DISPOSITIONS.LOST],
    ["quantity-count-full", "COUNT_CORRECTION", INVENTORY_CORRECTION_DISPOSITIONS.DISPOSED],
  ]) {
    const harness = await createManagedInventory({ id, quantity: 1 });
    const completed = await confirmCorrection(harness.service, harness.created.inventoryItem, correctionProposal(
      INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION,
      id,
      { quantity: 1, quantityReason: reason },
    ));
    equal(completed.result.inventoryItem.inventoryDispositionState, expectedDisposition, `${reason} deterministically controls full-disposition semantics`);
  }
}

{
  const harness = await createManagedInventory({ id: "cost", quantity: 3, totalMinorUnits: 1000 });
  const proposal = correctionProposal(INVENTORY_CORRECTION_CATEGORIES.ACQUISITION_COST_CORRECTION, "cost", { targetTotalCostMinorUnits: 1001 });
  const { result } = await confirmCorrection(harness.service, harness.created.inventoryItem, proposal);
  assert.deepEqual(result.inventoryItem.unitAcquisitionCostsMinorUnits, [334, 334, 333]); assertions += 1;
  equal(result.inventoryItem.acquisitionCostMinorUnits, 1001);
  equal(result.adjustment.costEffectMinorUnits, 1);
  equal(result.adjustment.previousState.acquisitionCostMinorUnits, 1000);
}

{
  const target = await createManagedInventory({ id: "target-product", productReference: "catalog.target-existing.test" });
  const sourcePurchase = await target.service.createDraft((await import("./inventory-creation-test-helpers.mjs")).exactDraft({ id: "source-product", productReference: "catalog.source-existing.test" }));
  const ready = await target.service.markDraftReady(sourcePurchase.draft.id, sourcePurchase.draft.recordVersion);
  const purchase = (await target.service.confirmDraft(ready.draft.id, { expectedVersion: ready.draft.recordVersion })).purchase;
  await target.service.recordReceivingEvent(purchase.id, { idempotencyKey: "receiving.source-product.test", entries: [{ lineItemId: purchase.lineItems[0].lineItemId, quantityReceived: 1, quantityAffected: 1, condition: "SEALED", discrepancy: "NONE", note: "Synthetic." }] });
  const creationCandidate = target.service.previewInventoryCreation(purchase.id)[0];
  const source = await target.service.confirmInventoryCreation(creationCandidate.candidateId, { expectedVersion: creationCandidate.expectedVersion });
  const proposal = correctionProposal(INVENTORY_CORRECTION_CATEGORIES.PRODUCT_RESOLUTION_CORRECTION, "product", {
    targetProductReference: target.created.inventoryItem.productReference,
    targetProductTitle: "Browser supplied title is not authority",
  });
  const { result } = await confirmCorrection(target.service, source.inventoryItem, proposal);
  equal(result.inventoryItem.productReference, target.created.inventoryItem.productReference);
  equal(result.inventoryItem.productTitle, target.created.inventoryItem.productTitle, "target title is re-derived from an existing relationship");
  equal(result.adjustment.previousState.productReference, "catalog.source-existing.test");
  equal(result.adjustment.resultingState.productReference, "catalog.target-existing.test");
}

{
  const target = await createManagedInventory({
    id: "target-accessory",
    productReference: "catalog.target-accessory.test",
    condition: "NEW",
    productClassification: "Accessory",
  });
  const sourcePurchase = await target.service.createDraft((await import("./inventory-creation-test-helpers.mjs")).exactDraft({ id: "source-sealed-mismatch", productReference: "catalog.source-sealed-mismatch.test" }));
  const ready = await target.service.markDraftReady(sourcePurchase.draft.id, sourcePurchase.draft.recordVersion);
  const purchase = (await target.service.confirmDraft(ready.draft.id, { expectedVersion: ready.draft.recordVersion })).purchase;
  await target.service.recordReceivingEvent(purchase.id, { idempotencyKey: "receiving.source-sealed-mismatch.test", entries: [{ lineItemId: purchase.lineItems[0].lineItemId, quantityReceived: 1, quantityAffected: 1, condition: "SEALED", discrepancy: "NONE", note: "Synthetic." }] });
  const creationCandidate = target.service.previewInventoryCreation(purchase.id)[0];
  const source = await target.service.confirmInventoryCreation(creationCandidate.candidateId, { expectedVersion: creationCandidate.expectedVersion });
  const candidate = target.service.previewInventoryCorrection(source.inventoryItem.id, correctionProposal(INVENTORY_CORRECTION_CATEGORIES.PRODUCT_RESOLUTION_CORRECTION, "accessory-classification", {
    targetProductReference: target.created.inventoryItem.productReference,
  }));
  equal(candidate.proposed.productClassification, "Accessory", "product correction adopts the existing target relationship's classification");
  equal(candidate.eligible, false, "an incompatible current condition blocks the product correction");
  ok(candidate.blockers.includes("PRODUCT_CLASSIFICATION_CONDITION_MISMATCH"));
  const conditionCorrected = await confirmCorrection(target.service, source.inventoryItem, correctionProposal(INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION, "accessory-compatible-condition", {
    targetCondition: "OPEN_BOX",
    targetDisposition: "ADD_TO_INVENTORY",
  }));
  const productCorrected = await confirmCorrection(target.service, conditionCorrected.result.inventoryItem, correctionProposal(INVENTORY_CORRECTION_CATEGORIES.PRODUCT_RESOLUTION_CORRECTION, "accessory-compatible-product", {
    targetProductReference: target.created.inventoryItem.productReference,
  }));
  equal(productCorrected.result.inventoryItem.productClassification, "Accessory", "a separate reviewed compatible-condition event permits the later target-product correction");
  equal(productCorrected.result.inventoryItem.condition, "OPEN_BOX", "cross-classification correction never silently changes condition");
  equal(productCorrected.result.adjustment.adjustmentSequence, 2, "condition and product corrections remain two append-only reviewed events");
}

{
  const harness = await createManagedInventory({ id: "blocked" });
  for (const [category, expectedBlocker] of [
    [INVENTORY_CORRECTION_CATEGORIES.REPLACEMENT_RECEIVED, "REPLACEMENT_REQUIRES_NEW_RECEIVING_AND_INVENTORY_CREATION"],
    [INVENTORY_CORRECTION_CATEGORIES.UNEXPECTED_EXTRA_RESOLUTION, "UNEXPECTED_EXTRA_REQUIRES_SEPARATE_INVENTORY_CREATION"],
  ]) {
    const candidate = harness.service.previewInventoryCorrection(harness.created.inventoryItem.id, correctionProposal(category, category.toLowerCase()));
    equal(candidate.eligible, false);
    ok(candidate.blockers.includes(expectedBlocker));
  }
}

console.log(`Code 3 Inventory Correction domain: ${assertions} assertions passed.`);
