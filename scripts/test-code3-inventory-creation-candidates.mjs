import assert from "node:assert/strict";
import { INVENTORY_CREATION_SAFETY, PURCHASE_RECEIVING_STORAGE_KEY } from "../src/features/purchaseReceiving/index.js";
import { createEmptyFlipScoutState, FLIP_SCOUT_STORAGE_KEY } from "../src/features/flipScout/constants.js";
import { createInventoryHarness, confirmFixturePurchase, exactDraft, receive } from "./inventory-creation-test-helpers.mjs";

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };

equal(INVENTORY_CREATION_SAFETY.authoritative, "LOCAL_ONLY");
equal(INVENTORY_CREATION_SAFETY.remoteActive, false);
equal(INVENTORY_CREATION_SAFETY.automaticInventoryCreation, false);
equal(INVENTORY_CREATION_SAFETY.candidatePersisted, false);
equal(INVENTORY_CREATION_SAFETY.candidateEqualsInventory, false);

{
  const harness = createInventoryHarness();
  const purchase = await confirmFixturePurchase(harness.service);
  await receive(harness.service, purchase, { condition: "SEALED" });
  const beforeWrites = harness.inventoryStorage.writes;
  const candidates = harness.service.previewInventoryCreation(purchase.id);
  equal(candidates.length, 1);
  equal(candidates[0].authoritative, false);
  equal(candidates[0].persisted, false);
  equal(candidates[0].eligible, true);
  equal(candidates[0].quantityEligible, 1);
  equal(candidates[0].condition, "SEALED");
  equal(candidates[0].totalAcquisitionCost.minorUnits, 4740);
  equal(harness.inventoryStorage.writes, beforeWrites, "candidate preview is zero-write");
}

{
  const harness = createInventoryHarness();
  const purchase = await confirmFixturePurchase(harness.service, exactDraft({ id: "ambiguous", productMatchStatus: "AMBIGUOUS", productReference: null }));
  await receive(harness.service, purchase);
  const candidate = harness.service.previewInventoryCreation(purchase.id)[0];
  equal(candidate.eligible, false);
  ok(candidate.blockers.includes("PRODUCT_RESOLUTION_REQUIRED"));
  const resolved = harness.service.previewInventoryCreation(purchase.id, { [candidate.candidateId]: { productReference: "catalog.owner-resolved.test", resolutionReason: "Owner matched the received UPC.", condition: "SEALED", productClassification: "Sealed product" } })[0];
  equal(resolved.productMatchState, "OWNER_RESOLVED");
  equal(resolved.eligible, false, "manual resolution cannot create a new product implicitly");
  ok(resolved.blockers.includes("OWNER_RESOLUTION_REQUIRES_EXISTING_PRODUCT"));
  harness.inventoryStorage.values.set(FLIP_SCOUT_STORAGE_KEY, JSON.stringify({
    ...createEmptyFlipScoutState(),
    inventory: [{ id: "inventory.known-product.test", productReference: "catalog.owner-resolved.test", productClassification: "Sealed product", quantity: 1 }],
  }));
  const ownerReview = { productReference: "catalog.owner-resolved.test", resolutionReason: "Owner matched the received UPC.", condition: "SEALED", productClassification: "Sealed product" };
  const resolvedToKnownProduct = harness.service.previewInventoryCreation(purchase.id, { [candidate.candidateId]: ownerReview })[0];
  equal(resolvedToKnownProduct.eligible, true, "manual resolution may reference an existing canonical product relationship");
  equal(resolvedToKnownProduct.existingInventoryReferences[0], "inventory.known-product.test");
  const confirmed = await harness.service.confirmInventoryCreation(resolvedToKnownProduct.candidateId, { expectedVersion: resolvedToKnownProduct.expectedVersion, review: ownerReview });
  equal(confirmed.application.ownerResolutionReason, "Owner matched the received UPC.", "owner product-resolution provenance is retained");
  equal(confirmed.inventoryItem.purchaseProductReference, null, "manual resolution does not rewrite the original unresolved Purchase evidence");
}

{
  const harness = createInventoryHarness();
  const purchase = await confirmFixturePurchase(harness.service);
  await receive(harness.service, purchase, { condition: "DAMAGED", discrepancy: "DAMAGED_ITEM" });
  const blocked = harness.service.previewInventoryCreation(purchase.id)[0];
  equal(blocked.eligible, false);
  ok(blocked.blockers.includes("DAMAGED_DISPOSITION_REQUIRED"));
  const reviewed = harness.service.previewInventoryCreation(purchase.id, { [blocked.candidateId]: { condition: "DAMAGED", disposition: "ADD_AS_DAMAGED", productClassification: "Sealed product" } })[0];
  equal(reviewed.eligible, true);
}

{
  const harness = createInventoryHarness();
  const purchase = await confirmFixturePurchase(harness.service, exactDraft({ id: "damaged-condition-without-discrepancy" }));
  await receive(harness.service, purchase, { condition: "DAMAGED", discrepancy: "NONE", id: "damaged-condition-without-discrepancy" });
  const blocked = harness.service.previewInventoryCreation(purchase.id)[0];
  equal(blocked.eligible, false, "damaged physical condition cannot silently enter normal sellable Inventory");
  ok(blocked.blockers.includes("DAMAGED_DISPOSITION_REQUIRED"));
  const reviewed = harness.service.previewInventoryCreation(purchase.id, {
    [blocked.candidateId]: { condition: "DAMAGED", disposition: "ADD_AS_DAMAGED", productClassification: "Sealed product" },
  })[0];
  equal(reviewed.eligible, true, "owner-reviewed damaged disposition is explicit");
}

{
  const harness = createInventoryHarness();
  const purchase = await confirmFixturePurchase(harness.service, exactDraft({ id: "damaged-disposition-without-condition", productClassification: "Accessory" }));
  await receive(harness.service, purchase, { condition: "NEW", discrepancy: "NONE", id: "damaged-disposition-without-condition" });
  const candidate = harness.service.previewInventoryCreation(purchase.id)[0];
  const contradictory = harness.service.previewInventoryCreation(purchase.id, {
    [candidate.candidateId]: { condition: "NEW", disposition: "ADD_AS_DAMAGED", productClassification: "Accessory" },
  })[0];
  equal(contradictory.eligible, false, "damaged disposition cannot retain a non-damaged condition");
  ok(contradictory.blockers.includes("DAMAGED_DISPOSITION_REQUIRED"));
  const reviewed = harness.service.previewInventoryCreation(purchase.id, {
    [candidate.candidateId]: { condition: "DAMAGED", disposition: "ADD_AS_DAMAGED", productClassification: "Accessory" },
  })[0];
  equal(reviewed.eligible, true, "the reviewed damaged condition and disposition pair is eligible");
}

{
  const harness = createInventoryHarness();
  const purchase = await confirmFixturePurchase(harness.service, exactDraft({ id: "unlabeled-substitution", productReference: "catalog.ordered-product.test" }));
  await receive(harness.service, purchase, { condition: "SEALED", discrepancy: "NONE", substituteProductReference: "catalog.actual-product.test", id: "unlabeled-substitution" });
  const blocked = harness.service.previewInventoryCreation(purchase.id)[0];
  equal(blocked.productMatchState, "UNRESOLVED", "a different received product never inherits the ordered line's matched state");
  equal(blocked.eligible, false);
  ok(blocked.blockers.includes("ACTUAL_PRODUCT_RESOLUTION_REQUIRED"));
  harness.inventoryStorage.values.set(FLIP_SCOUT_STORAGE_KEY, JSON.stringify({
    ...createEmptyFlipScoutState(),
    inventory: [{ id: "inventory.actual-product.test", productReference: "catalog.actual-product.test", productClassification: "Sealed product", quantity: 1 }],
  }));
  const review = { productReference: "catalog.actual-product.test", productClassification: "Sealed product", condition: "SEALED", resolutionReason: "Owner verified the actual received product." };
  const reviewed = harness.service.previewInventoryCreation(purchase.id, { [blocked.candidateId]: review })[0];
  equal(reviewed.eligible, true, "an explicit existing-product resolution can safely reconcile the substituted item");
  equal(reviewed.purchaseProductReference, "catalog.ordered-product.test");
  equal(reviewed.receivedProductReference, "catalog.actual-product.test");
}

{
  const harness = createInventoryHarness();
  const purchase = await confirmFixturePurchase(harness.service, exactDraft({ id: "raw-card-condition-contract" }));
  await receive(harness.service, purchase, { condition: "NEW", id: "raw-card-condition-contract" });
  const unresolved = harness.service.previewInventoryCreation(purchase.id)[0];
  const rawCard = harness.service.previewInventoryCreation(purchase.id, {
    [unresolved.candidateId]: { productClassification: "Raw card", condition: "NEW" },
  })[0];
  equal(rawCard.eligible, false, "raw cards remain blocked until a type-specific card condition workflow exists");
  ok(rawCard.blockers.includes("PRODUCT_TYPE_CONDITION_WORKFLOW_REQUIRED"));
}

{
  const harness = createInventoryHarness();
  const purchase = await confirmFixturePurchase(harness.service);
  await receive(harness.service, purchase, { condition: "NEW", discrepancy: "MISSING_ITEM" });
  const candidate = harness.service.previewInventoryCreation(purchase.id)[0];
  equal(candidate.eligible, false);
  ok(candidate.blockers.includes("RECEIVING_NOT_ELIGIBLE"));
}

{
  const harness = createInventoryHarness();
  const purchase = await confirmFixturePurchase(harness.service);
  await receive(harness.service, purchase, { condition: "UNKNOWN" });
  const candidate = harness.service.previewInventoryCreation(purchase.id)[0];
  equal(candidate.eligible, false);
  ok(candidate.blockers.includes("CONDITION_REVIEW_REQUIRED"));
}

{
  const harness = createInventoryHarness();
  const purchase = await confirmFixturePurchase(harness.service, exactDraft({ id: "returned-before-inventory" }));
  await receive(harness.service, purchase, { condition: "SEALED", id: "returned-before-inventory" });
  await harness.service.recordPurchaseEvent(purchase.id, {
    type: "RETURN_COMPLETED",
    lineItemId: purchase.lineItems[0].lineItemId,
    quantity: 1,
    idempotencyKey: "return.completed.before.inventory.test",
    reason: "Synthetic owner-confirmed return before Inventory creation.",
  });
  const candidate = harness.service.previewInventoryCreation(purchase.id)[0];
  equal(candidate.eligible, false, "a completed Purchase return removes Inventory eligibility");
  ok(candidate.blockers.includes("PURCHASE_NO_LONGER_ELIGIBLE_FOR_INVENTORY"));
}

{
  const harness = createInventoryHarness();
  const purchase = await confirmFixturePurchase(harness.service, exactDraft({ id: "returned-to-sender" }));
  await receive(harness.service, purchase, { condition: "SEALED", id: "returned-to-sender" });
  const state = JSON.parse(harness.purchaseStorage.values.get(PURCHASE_RECEIVING_STORAGE_KEY));
  state.receivingEvents[0].status = "RETURNED_TO_SENDER";
  harness.purchaseStorage.values.set(PURCHASE_RECEIVING_STORAGE_KEY, JSON.stringify(state));
  const candidate = harness.service.previewInventoryCreation(purchase.id)[0];
  equal(candidate.eligible, false, "returned-to-sender evidence is not physical possession");
  ok(candidate.blockers.includes("RECEIVING_EVENT_NOT_IN_POSSESSION"));
}

{
  const authority = { allowed: false };
  const harness = createInventoryHarness({ authority });
  await assert.rejects(() => harness.service.confirmInventoryCreation("inventory-candidate:0000000000000000", { expectedVersion: "x" }), (error) => error.code === "OWNER_REQUIRED"); assertions += 1;
  equal(harness.purchaseStorage.reads, 0, "unauthorized confirmation performs no Purchase read");
  equal(harness.inventoryStorage.reads, 0, "unauthorized confirmation performs no Inventory read");
  equal(harness.inventoryStorage.writes, 0, "unauthorized confirmation performs no Inventory write");
}

console.log(`Code 3 Inventory Creation candidates: ${assertions} assertions passed.`);
