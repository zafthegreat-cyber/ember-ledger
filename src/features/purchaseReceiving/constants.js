/** Phase 2C-A is a local business-domain contract; none of these flags are caller selectable. */
export const PURCHASE_RECEIVING_STORAGE_KEY = "code3.purchase-receiving.v1";
export const PURCHASE_RECEIVING_SCHEMA_VERSION = 1;
export const PURCHASE_RECEIVING_FORMAT = "code3.purchase-receiving.v1";

export const PURCHASE_RECEIVING_COLLECTIONS = Object.freeze([
  "purchaseDrafts",
  "purchases",
  "purchaseEvents",
  "receivingEvents",
  "activity",
]);

export const PURCHASE_DRAFT_STATES = Object.freeze({
  DRAFT: "DRAFT",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  READY_TO_CONFIRM: "READY_TO_CONFIRM",
  CONFIRMED: "CONFIRMED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
});

export const PURCHASE_RECEIPT_STATES = Object.freeze({
  NOT_RECEIVED: "NOT_RECEIVED",
  PARTIALLY_RECEIVED: "PARTIALLY_RECEIVED",
  FULLY_RECEIVED: "FULLY_RECEIVED",
  RETURNED: "RETURNED",
  REFUNDED: "REFUNDED",
  CANCELLED: "CANCELLED",
});

export const PURCHASE_LIFECYCLE_STATES = Object.freeze({
  CONFIRMED: "CONFIRMED",
  PARTIALLY_CANCELLED: "PARTIALLY_CANCELLED",
  CANCELLED: "CANCELLED",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
  REFUNDED: "REFUNDED",
  RETURN_INITIATED: "RETURN_INITIATED",
  RETURNED: "RETURNED",
  REPLACEMENT_PENDING: "REPLACEMENT_PENDING",
});

export const RECEIVING_EVENT_STATES = Object.freeze({
  NOT_RECEIVED: "NOT_RECEIVED",
  PARTIALLY_RECEIVED: "PARTIALLY_RECEIVED",
  FULLY_RECEIVED: "FULLY_RECEIVED",
  DAMAGED: "DAMAGED",
  MISSING: "MISSING",
  WRONG_ITEM: "WRONG_ITEM",
  RETURNED_TO_SENDER: "RETURNED_TO_SENDER",
  CANCELLED: "CANCELLED",
});

export const RECEIVING_DISCREPANCIES = Object.freeze({
  NONE: "NONE",
  DAMAGED_ITEM: "DAMAGED_ITEM",
  MISSING_ITEM: "MISSING_ITEM",
  WRONG_ITEM: "WRONG_ITEM",
  WRONG_QUANTITY: "WRONG_QUANTITY",
  SUBSTITUTED_ITEM: "SUBSTITUTED_ITEM",
  CANCELLED_ITEM: "CANCELLED_ITEM",
  PARTIAL_DELIVERY: "PARTIAL_DELIVERY",
  UNEXPECTED_EXTRA_ITEM: "UNEXPECTED_EXTRA_ITEM",
});

export const PURCHASE_SOURCE_TYPES = Object.freeze({
  MANUAL: "MANUAL",
  ORDER_CANDIDATE: "ORDER_CANDIDATE",
  CHECKOUT_EVIDENCE: "CHECKOUT_EVIDENCE",
  SYNTHETIC: "SYNTHETIC",
});

export const PURCHASE_PROVENANCE_TYPES = Object.freeze({
  EMAIL_EVIDENCE: "EMAIL_EVIDENCE",
  BOT_EVIDENCE: "BOT_EVIDENCE",
  MANUAL: "MANUAL",
  OWNER_CORRECTION: "OWNER_CORRECTION",
  PURCHASE_CONFIRMATION: "PURCHASE_CONFIRMATION",
  RECEIVING_CONFIRMATION: "RECEIVING_CONFIRMATION",
  SYSTEM_DERIVED: "SYSTEM_DERIVED",
  TEST_FIXTURE: "TEST_FIXTURE",
});

export const PURCHASE_FULFILLMENT_TYPES = Object.freeze({
  SHIPPING: "SHIPPING",
  PICKUP: "PICKUP",
  DIGITAL: "DIGITAL",
  UNKNOWN: "UNKNOWN",
});

export const PRODUCT_MATCH_STATES = Object.freeze({
  MATCHED: "MATCHED",
  AMBIGUOUS: "AMBIGUOUS",
  UNRESOLVED: "UNRESOLVED",
});

export const PURCHASE_CONFIDENCE_LEVELS = Object.freeze({
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  INSUFFICIENT: "INSUFFICIENT",
});

export const PURCHASE_EVENT_TYPES = Object.freeze({
  PURCHASE_CONFIRMED: "PURCHASE_CONFIRMED",
  CANCELLATION_RECORDED: "CANCELLATION_RECORDED",
  REFUND_RECORDED: "REFUND_RECORDED",
  RETURN_INITIATED: "RETURN_INITIATED",
  RETURN_COMPLETED: "RETURN_COMPLETED",
  REPLACEMENT_NOTED: "REPLACEMENT_NOTED",
});

export const PURCHASE_RECEIVING_LIMITS = Object.freeze({
  maximumDepth: 16,
  maximumNodes: 12_000,
  maximumArray: 1_000,
  maximumString: 16_000,
  maximumRecordsPerCollection: 5_000,
  maximumLineItems: 500,
  maximumWarnings: 200,
  maximumCorrections: 500,
  maximumQuantity: 1_000_000,
  maximumIdentifier: 256,
  maximumLabel: 500,
});

export const PURCHASE_RECEIVING_SAFETY_CONTRACT = Object.freeze({
  authoritative: "LOCAL_ONLY",
  remoteActive: false,
  providerNetworkAccess: false,
  automaticPurchaseCreation: false,
  automaticReceiving: false,
  automaticInventoryMutation: false,
  orderCandidateEqualsPurchase: false,
  checkoutEvidenceEqualsPurchase: false,
  purchaseDraftEqualsPurchase: false,
  purchaseEqualsReceivedInventory: false,
  receivingEqualsInventory: false,
  inventoryWriterAvailable: false,
  secretPersistence: false,
});
