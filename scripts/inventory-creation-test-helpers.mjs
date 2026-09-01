import {
  createPurchaseReceivingService,
} from "../src/features/purchaseReceiving/index.js";
import {
  PHASE2CA_FIXED_NOW,
  createFixtureDraftInput,
  createFixtureLineItem,
} from "../src/features/purchaseReceiving/fixtures/phase2caFixtures.js";

export class MemoryStorage {
  constructor({ failBefore = 0, failAfter = 0 } = {}) {
    this.values = new Map();
    this.reads = 0;
    this.writes = 0;
    this.failBefore = failBefore;
    this.failAfter = failAfter;
  }
  getItem(key) { this.reads += 1; return this.values.get(String(key)) ?? null; }
  setItem(key, value) {
    this.writes += 1;
    if (this.failBefore > 0) { this.failBefore -= 1; throw new Error("Synthetic write failed before persistence."); }
    this.values.set(String(key), String(value));
    if (this.failAfter > 0) { this.failAfter -= 1; throw new Error("Synthetic response failed after persistence."); }
  }
  removeItem(key) { this.values.delete(String(key)); }
}

export function createExclusiveTestLock() {
  let tail = Promise.resolve();
  return (_name, action) => {
    const result = tail.then(action);
    tail = result.catch(() => undefined);
    return result;
  };
}

export function createInventoryHarness(options = {}) {
  const purchaseStorage = options.purchaseStorage || new MemoryStorage();
  const inventoryStorage = options.inventoryStorage || new MemoryStorage();
  const authority = options.authority || { allowed: true };
  let sequence = 0;
  const service = createPurchaseReceivingService({
    storage: purchaseStorage,
    inventoryStorage,
    inventoryRepository: options.inventoryRepository,
    inventoryLockManager: options.inventoryLockManager || createExclusiveTestLock(),
    isOwnerAuthorized: () => authority.allowed,
    idFactory: options.idFactory || ((prefix) => `${prefix}.phase2cb-${sequence += 1}.test`),
    now: options.now || (() => PHASE2CA_FIXED_NOW),
  });
  return { authority, purchaseStorage, inventoryStorage, service };
}

function exactMoney(minorUnits, currency = "USD") {
  return { minorUnits, currency };
}

export function exactDraft({ id = "exact", quantity = 1, totalMinorUnits = 1000, productMatchStatus = "MATCHED", productReference = "catalog.phase2cb-product.test", cancellationQuantity = 0, refundedQuantity = 0 } = {}) {
  if (totalMinorUnits % quantity !== 0) {
    const unitMinorUnits = Math.floor(totalMinorUnits / quantity);
    const subtotalMinorUnits = unitMinorUnits * quantity;
    const shippingMinorUnits = totalMinorUnits - subtotalMinorUnits;
    return createFixtureDraftInput({
      id: `purchase-draft.${id}.test`,
      sourceReference: `source.${id}.test`,
      sourceIdentityKey: `source.${id}.test`,
      externalOrderId: `ORDER-${id.toUpperCase()}`,
      lineItems: [createFixtureLineItem({
        id: `purchase-line.${id}.test`, lineItemId: `purchase-line.${id}.test`, productReference, productMatchStatus,
        quantityOrdered: quantity, unitPrice: exactMoney(unitMinorUnits), lineAmount: exactMoney(subtotalMinorUnits),
        discount: exactMoney(0), taxAllocation: exactMoney(0), shippingAllocation: exactMoney(shippingMinorUnits), feeAllocation: exactMoney(0),
        cancellationQuantity, refundedQuantity, remainingQuantity: quantity - cancellationQuantity,
      })],
      subtotal: exactMoney(subtotalMinorUnits), discount: exactMoney(0), tax: exactMoney(0), shipping: exactMoney(shippingMinorUnits), fees: exactMoney(0), total: exactMoney(totalMinorUnits),
    });
  }
  const unit = totalMinorUnits / quantity;
  return createFixtureDraftInput({
    id: `purchase-draft.${id}.test`, sourceReference: `source.${id}.test`, sourceIdentityKey: `source.${id}.test`, externalOrderId: `ORDER-${id.toUpperCase()}`,
    lineItems: [createFixtureLineItem({ id: `purchase-line.${id}.test`, lineItemId: `purchase-line.${id}.test`, productReference, productMatchStatus, quantityOrdered: quantity, unitPrice: exactMoney(unit), lineAmount: exactMoney(totalMinorUnits), discount: exactMoney(0), taxAllocation: exactMoney(0), shippingAllocation: exactMoney(0), feeAllocation: exactMoney(0), cancellationQuantity, refundedQuantity, remainingQuantity: quantity - cancellationQuantity })],
    subtotal: exactMoney(totalMinorUnits), discount: exactMoney(0), tax: exactMoney(0), shipping: exactMoney(0), fees: exactMoney(0), total: exactMoney(totalMinorUnits),
  });
}

export async function confirmFixturePurchase(service, draftInput = createFixtureDraftInput()) {
  const created = await service.createDraft(draftInput);
  const ready = await service.markDraftReady(created.draft.id, created.draft.recordVersion);
  return (await service.confirmDraft(ready.draft.id, { expectedVersion: ready.draft.recordVersion })).purchase;
}

export async function receive(service, purchase, { quantity = 1, lineItemId = purchase.lineItems[0].lineItemId, condition = "SEALED", discrepancy = "NONE", substituteProductReference = null, id = "receive" } = {}) {
  return service.recordReceivingEvent(purchase.id, {
    idempotencyKey: `receiving.${id}.test`,
    entries: [{ lineItemId, quantityReceived: quantity, quantityAffected: quantity, condition, discrepancy, substituteProductReference, note: "Synthetic Phase 2C-B fixture." }],
  });
}
