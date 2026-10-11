export const PHASE2CA_FIXED_NOW = "2026-08-31T14:00:00.000Z";
export const PHASE2CA_LATER_NOW = "2026-08-31T15:00:00.000Z";

const money = (minorUnits, currency = "USD") => Object.freeze({ minorUnits, currency });

export function createFixtureLineItem(overrides = {}) {
  return {
    id: "purchase-line.synthetic-one.test",
    productReference: "catalog.synthetic-product.test",
    retailerItemId: "retailer-item.synthetic-one.test",
    sku: "SKU-SYNTHETIC-001",
    upc: "000000000001",
    tcin: "TCIN-SYNTHETIC-001",
    title: "Synthetic TCG product",
    category: "TCG",
    quantityOrdered: 1,
    unitPrice: money(4000),
    lineAmount: money(4000),
    discount: money(0),
    taxAllocation: money(240),
    shippingAllocation: money(500),
    feeAllocation: money(0),
    cancellationQuantity: 0,
    refundedQuantity: 0,
    receivedQuantity: 0,
    remainingQuantity: 1,
    productMatchStatus: "MATCHED",
    warnings: [],
    provenance: [{ type: "MANUAL", field: "lineItems", sourceReference: "source.synthetic-order.test", recordedAt: PHASE2CA_FIXED_NOW }],
    ...overrides,
  };
}

export function createFixtureDraftInput(overrides = {}) {
  return {
    id: "purchase-draft.synthetic-one.test",
    sourceType: "MANUAL",
    sourceReference: "source.synthetic-order.test:v1",
    sourceIdentityKey: "synthetic-source-fingerprint-0001",
    retailerId: "retailer.synthetic-target.test",
    retailerLabel: "Synthetic Target",
    retailerAccountReference: "account-ops.synthetic-target.test",
    profileReference: "account-ops.synthetic-profile.test",
    externalOrderId: "ORDER-SYNTHETIC-1001",
    orderDate: "2026-08-31T12:00:00.000Z",
    purchaseDate: "2026-08-31T12:00:00.000Z",
    lineItems: [createFixtureLineItem()],
    subtotal: money(4000),
    discount: money(0),
    tax: money(240),
    shipping: money(500),
    fees: money(0),
    total: money(4740),
    currency: "USD",
    fulfillmentType: "SHIPPING",
    shipmentReferences: ["shipment.synthetic-one.test"],
    trackingReferences: ["TRACK-SYNTHETIC-001"],
    warnings: [],
    confidence: "HIGH",
    provenance: [{ type: "MANUAL", field: "draft", sourceReference: "source.synthetic-order.test", recordedAt: PHASE2CA_FIXED_NOW }],
    corrections: [],
    status: "DRAFT",
    ...overrides,
  };
}

export function createFixturePurchase(overrides = {}) {
  const draft = createFixtureDraftInput();
  return {
    id: "purchase.synthetic-one.test",
    draftId: draft.id,
    retailerId: draft.retailerId,
    retailerLabel: draft.retailerLabel,
    provenance: draft.provenance,
    sourceReference: draft.sourceReference,
    externalOrderId: draft.externalOrderId,
    retailerAccountReference: draft.retailerAccountReference,
    profileReference: draft.profileReference,
    orderDate: draft.orderDate,
    purchaseDate: draft.purchaseDate,
    lineItems: draft.lineItems,
    subtotal: draft.subtotal,
    discount: draft.discount,
    tax: draft.tax,
    shipping: draft.shipping,
    fees: draft.fees,
    total: draft.total,
    currency: draft.currency,
    fulfillmentType: draft.fulfillmentType,
    status: "CONFIRMED",
    receivingStatus: "NOT_RECEIVED",
    shipmentReferences: draft.shipmentReferences,
    warnings: [],
    sourceDraftId: draft.id,
    confirmationKey: "confirmation.synthetic-one.test",
    confirmedAt: PHASE2CA_FIXED_NOW,
    confirmationMethod: "VERIFIED_OWNER_SESSION",
    recordVersion: 1,
    createdAt: PHASE2CA_FIXED_NOW,
    updatedAt: PHASE2CA_FIXED_NOW,
    ...overrides,
  };
}

function draftFixture(id, overrides = {}, expected = {}) {
  return {
    id,
    kind: "PURCHASE_DRAFT",
    description: id.replaceAll("-", " "),
    input: createFixtureDraftInput({ id: `purchase-draft.${id}.test`, ...overrides }),
    expected,
  };
}

function receivingFixture(id, overrides = {}, expected = {}) {
  return {
    id,
    kind: "RECEIVING",
    description: id.replaceAll("-", " "),
    purchase: createFixturePurchase({ id: `purchase.${id}.test` }),
    input: {
      id: `receiving.${id}.test`,
      purchaseId: `purchase.${id}.test`,
      idempotencyKey: `receiving.${id}.test`,
      occurredAt: PHASE2CA_LATER_NOW,
      confirmedAt: PHASE2CA_LATER_NOW,
      locationReference: "storage.synthetic.test",
      status: "PARTIALLY_RECEIVED",
      entries: [{
        lineItemId: "purchase-line.synthetic-one.test",
        quantityReceived: 1,
        quantityAffected: 1,
        condition: "NEW",
        discrepancy: "NONE",
        note: "Synthetic fixture only.",
      }],
      provenance: [{ type: "RECEIVING_CONFIRMATION", field: "receiving", sourceReference: "source.synthetic-receiving.test", recordedAt: PHASE2CA_LATER_NOW }],
      ...overrides,
    },
    expected,
  };
}

const secondLine = createFixtureLineItem({
  id: "purchase-line.synthetic-two.test",
  productReference: "catalog.synthetic-product-two.test",
  retailerItemId: "retailer-item.synthetic-two.test",
  sku: "SKU-SYNTHETIC-002",
  upc: "000000000002",
  tcin: null,
  title: "Synthetic TCG product two",
  quantityOrdered: 2,
  unitPrice: money(3000),
  lineAmount: money(6000),
  taxAllocation: money(360),
  shippingAllocation: money(500),
  remainingQuantity: 2,
  productMatchStatus: "MATCHED",
});

/**
 * Deterministic, reserved-only Phase 2C-A fixtures. These are intentionally
 * inputs, never application seed data. Nothing here contains real orders,
 * accounts, people, addresses, credentials, or payment instruments.
 */
export const PHASE2CA_QA_FIXTURES = Object.freeze([
  draftFixture("simple-one-item-draft"),
  draftFixture("multi-item-purchase", {
    lineItems: [createFixtureLineItem(), secondLine],
    subtotal: money(10000), tax: money(600), shipping: money(1000), total: money(11600),
  }),
  draftFixture("target-order", { retailerId: "retailer.synthetic-target.test", retailerLabel: "Synthetic Target" }),
  draftFixture("walmart-order", { retailerId: "retailer.synthetic-walmart.test", retailerLabel: "Synthetic Walmart", externalOrderId: "ORDER-SYNTHETIC-WM-1001" }),
  draftFixture("pickup-order", { fulfillmentType: "PICKUP", shipmentReferences: [], pickupStoreReference: "store.synthetic-pickup.test" }),
  draftFixture("shipped-order", { fulfillmentType: "SHIPPING", shipmentReferences: ["shipment.synthetic-shipped.test"], trackingReferences: ["TRACK-SYNTHETIC-SPLIT-A"] }),
  draftFixture("tax", { tax: money(240) }),
  draftFixture("shipping", { shipping: money(500) }),
  draftFixture("coupon", { coupon: money(500), couponLabel: "SYNTHETIC-COUPON", total: money(4240) }),
  draftFixture("discount", { discount: money(1000), total: money(3740) }),
  draftFixture("zero-shipping", { shipping: money(0), total: money(4240) }),
  draftFixture("partial-cancellation", {
    lineItems: [createFixtureLineItem({ quantityOrdered: 4, lineAmount: money(16000), cancellationQuantity: 1, remainingQuantity: 3 })],
    subtotal: money(16000), tax: money(960), shipping: money(0), total: money(16960),
  }),
  draftFixture("full-cancellation", {
    status: "CANCELLED",
    lineItems: [createFixtureLineItem({ cancellationQuantity: 1, remainingQuantity: 0 })],
  }),
  draftFixture("partial-refund", { lineItems: [createFixtureLineItem({ refundedQuantity: 0 })], refund: money(1000) }),
  draftFixture("full-refund", { refund: money(4740), refundState: "REFUNDED" }),
  draftFixture("split-shipment", {
    shipmentReferences: ["shipment.synthetic-split-a.test", "shipment.synthetic-split-b.test"],
    trackingReferences: ["TRACK-SYNTHETIC-SPLIT-A", "TRACK-SYNTHETIC-SPLIT-B"],
  }),
  receivingFixture("partial-receiving", {
    entries: [{ lineItemId: "purchase-line.synthetic-one.test", quantityReceived: 0, quantityAffected: 1, condition: "NEW", discrepancy: "PARTIAL_DELIVERY", note: "Synthetic partial shipment." }],
  }),
  receivingFixture("damaged-item", {
    entries: [{ lineItemId: "purchase-line.synthetic-one.test", quantityReceived: 1, quantityAffected: 1, condition: "DAMAGED", discrepancy: "DAMAGED_ITEM", note: "Synthetic damage." }],
  }),
  receivingFixture("missing-item", {
    entries: [{ lineItemId: "purchase-line.synthetic-one.test", quantityReceived: 0, quantityAffected: 1, condition: "UNKNOWN", discrepancy: "MISSING_ITEM", note: "Synthetic missing item." }],
  }),
  receivingFixture("wrong-item", {
    entries: [{ lineItemId: "purchase-line.synthetic-one.test", quantityReceived: 0, quantityAffected: 1, condition: "UNKNOWN", discrepancy: "WRONG_ITEM", note: "Synthetic wrong item." }],
  }),
  receivingFixture("replacement", { replacementReference: "replacement.synthetic.test" }),
  draftFixture("duplicate-source", {}, { idempotency: "SAME_DRAFT" }),
  draftFixture("duplicate-external-order-id", {}, { duplicateScope: "SAME_RETAILER_ACCOUNT" }),
  draftFixture("same-order-id-different-account", { retailerAccountReference: "account-ops.synthetic-secondary.test" }, { duplicate: false }),
  draftFixture("conflicting-currency", { currency: "USD", tax: money(240, "CAD") }, { blocksConfirmation: true }),
  draftFixture("malformed-total", { total: { minorUnits: "forty-seven-forty", currency: "USD" } }, { blocksConfirmation: true }),
  draftFixture("line-total-mismatch", { subtotal: money(3999), total: money(4739) }, { warning: "LINE_TOTAL_MISMATCH" }),
  draftFixture("penny-rounding-allocation", {
    lineItems: [
      createFixtureLineItem({ id: "purchase-line.penny-a.test", quantityOrdered: 1, unitPrice: money(1), lineAmount: money(1) }),
      createFixtureLineItem({ id: "purchase-line.penny-b.test", quantityOrdered: 1, unitPrice: money(1), lineAmount: money(1) }),
      createFixtureLineItem({ id: "purchase-line.penny-c.test", quantityOrdered: 1, unitPrice: money(1), lineAmount: money(1) }),
    ],
    subtotal: money(3), discount: money(1), tax: money(1), shipping: money(1), total: money(4),
  }),
  draftFixture("ambiguous-product", {
    lineItems: [createFixtureLineItem({ productReference: null, productMatchStatus: "AMBIGUOUS" })],
  }),
  draftFixture("unmatched-product", {
    lineItems: [createFixtureLineItem({ productReference: null, upc: null, tcin: null, productMatchStatus: "UNRESOLVED" })],
  }),
  draftFixture("owner-correction", {
    corrections: [{ field: "vendorName", previousValue: "Synthetic Retailer", correctedValue: "Synthetic Target", correctedAt: PHASE2CA_LATER_NOW, reason: "Synthetic owner correction." }],
  }),
  draftFixture("rejected-draft", { status: "REJECTED" }),
  draftFixture("confirmed-draft", { status: "CONFIRMED" }, { purchaseCreationRequiresExplicitOwnerConfirmation: true }),
  receivingFixture("inventory-handoff-preview", {}, { previewOnly: true, inventoryCreated: false }),
  receivingFixture("duplicate-receiving-event", {}, { idempotency: "SAME_EVENT" }),
  draftFixture("interrupted-confirmation-repair", {}, { idempotency: "RECOVER_EXISTING_PURCHASE" }),
  receivingFixture("full-receiving"),
  receivingFixture("wrong-quantity", {
    entries: [{ lineItemId: "purchase-line.synthetic-one.test", quantityReceived: 2, quantityAffected: 2, condition: "NEW", discrepancy: "WRONG_QUANTITY", note: "Synthetic over-receipt." }],
  }, { blocksConfirmation: true }),
  receivingFixture("unexpected-extra-item", {
    entries: [{ lineItemId: "purchase-line.unordered.test", quantityReceived: 1, quantityAffected: 1, condition: "NEW", discrepancy: "UNEXPECTED_EXTRA_ITEM", note: "Synthetic extra item." }],
  }, { blocksInventoryHandoff: true }),
  draftFixture("refund-greater-than-paid", { refund: money(5000) }, { blocksConfirmation: true }),
  draftFixture("currency-mismatch-line", { lineItems: [createFixtureLineItem({ unitPrice: money(4000, "CAD") })] }, { blocksConfirmation: true }),
]);

export const PHASE2CA_FIXTURE_COUNT = PHASE2CA_QA_FIXTURES.length;

export function getPhase2caFixture(fixtureId) {
  return PHASE2CA_QA_FIXTURES.find((fixture) => fixture.id === fixtureId) || null;
}
