import {
  confirmFixturePurchase,
  createInventoryHarness,
  exactDraft,
  receive,
} from "./inventory-creation-test-helpers.mjs";
import {
  PURCHASE_EVENT_TYPES,
  PURCHASE_RECEIVING_STORAGE_KEY,
} from "../src/features/purchaseReceiving/constants.js";
import { INVENTORY_CORRECTION_CATEGORIES } from "../src/features/purchaseReceiving/inventoryCorrection/constants.js";

export async function createManagedInventory(options = {}) {
  const id = options.id || "correction";
  const harness = createInventoryHarness(options);
  const purchase = await confirmFixturePurchase(harness.service, exactDraft({
    id,
    quantity: options.quantity || 1,
    totalMinorUnits: options.totalMinorUnits ?? 1000,
    productReference: options.productReference || `catalog.${id}.test`,
  }));
  await receive(harness.service, purchase, {
    id,
    quantity: options.quantity || 1,
    condition: options.condition || "SEALED",
  });
  const initialCandidate = harness.service.previewInventoryCreation(purchase.id, options.creationReviews || {})[0];
  const review = {
    ...(options.productClassification ? { productClassification: options.productClassification } : {}),
    ...(options.creationReview || {}),
    ...(options.creationReviews?.[initialCandidate.candidateId] || {}),
  };
  const reviews = { ...(options.creationReviews || {}), [initialCandidate.candidateId]: review };
  const candidate = harness.service.previewInventoryCreation(purchase.id, reviews)[0];
  const created = await harness.service.confirmInventoryCreation(candidate.candidateId, {
    expectedVersion: candidate.expectedVersion,
    review,
  });
  return { ...harness, purchase, creationCandidate: candidate, created };
}

export function correctionProposal(category, id, patch = {}) {
  return {
    category,
    idempotencyKey: `inventory-correction.${id}.test`,
    reason: `Synthetic ${id} owner review.`,
    ...patch,
  };
}

export async function confirmCorrection(service, item, proposal) {
  const candidate = service.previewInventoryCorrection(item.id, proposal);
  const result = await service.confirmInventoryCorrection(item.id, candidate.candidateId, {
    expectedVersion: candidate.expectedVersion,
    proposal,
  });
  return { candidate, result };
}

export function storedInventory(storage) {
  const value = [...storage.values.entries()].find(([key]) => key === "ember-and-tide.flip-scout.v1")?.[1];
  return value ? JSON.parse(value) : null;
}

export async function createReplacementProvenanceFixture(options = {}) {
  const id = options.id || "replacement-provenance";
  const harness = await createManagedInventory({ id, quantity: 3, totalMinorUnits: 900 });
  const firstReturn = await confirmCorrection(
    harness.service,
    harness.created.inventoryItem,
    correctionProposal(INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, `${id}-first-return`, { quantity: 1 }),
  );
  const secondReturn = await confirmCorrection(
    harness.service,
    firstReturn.result.inventoryItem,
    correctionProposal(INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, `${id}-second-return`, { quantity: 1 }),
  );
  const firstAuthorization = await harness.service.recordPurchaseEvent(harness.purchase.id, {
    type: PURCHASE_EVENT_TYPES.REPLACEMENT_NOTED,
    idempotencyKey: `purchase-event.${id}-first.test`,
    lineItemId: harness.purchase.lineItems[0].lineItemId,
    quantity: 1,
    relatedEventId: firstReturn.result.adjustment.id,
    replacementReference: `${id}-first.synthetic.test`,
  });
  const secondAuthorization = await harness.service.recordPurchaseEvent(harness.purchase.id, {
    type: PURCHASE_EVENT_TYPES.REPLACEMENT_NOTED,
    idempotencyKey: `purchase-event.${id}-second.test`,
    lineItemId: harness.purchase.lineItems[0].lineItemId,
    quantity: 1,
    relatedEventId: secondReturn.result.adjustment.id,
    replacementReference: `${id}-second.synthetic.test`,
  });
  const replacementReceiving = await harness.service.recordReceivingEvent(harness.purchase.id, {
    idempotencyKey: `receiving.${id}.replacement.test`,
    replacementEventId: firstAuthorization.event.id,
    entries: [{
      lineItemId: harness.purchase.lineItems[0].lineItemId,
      quantityReceived: 1,
      quantityAffected: 1,
      condition: "SEALED",
      discrepancy: "NONE",
    }],
  });
  const candidate = harness.service.previewInventoryCreation(harness.purchase.id)
    .find((entry) => entry.receivingEventReferences.includes(replacementReceiving.event.id));
  const created = await harness.service.confirmInventoryCreation(candidate.candidateId, {
    expectedVersion: candidate.expectedVersion,
  });
  return {
    ...harness,
    firstReturn,
    secondReturn,
    firstAuthorization,
    secondAuthorization,
    replacementReceiving,
    replacementCandidate: candidate,
    replacementCreated: created,
    inventoryState: storedInventory(harness.inventoryStorage),
    purchaseReceivingState: JSON.parse(harness.purchaseStorage.values.get(PURCHASE_RECEIVING_STORAGE_KEY)),
  };
}
