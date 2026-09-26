import type { CanonicalDomain, DomainDefinition, RelationRule } from "./types";

const GENERIC_STATUSES = ["ACTIVE", "INACTIVE", "DRAFT", "COMPLETE", "ARCHIVED"];

function set(...values: string[]): ReadonlySet<string> {
  return new Set(values);
}

function relations(value: Record<string, RelationRule> = {}): Readonly<Record<string, RelationRule>> {
  return Object.freeze(value);
}

function definition(
  domain: CanonicalDomain,
  defaultStatus: string,
  statuses: string[],
  options: Partial<Omit<DomainDefinition, "domain" | "defaultStatus" | "statuses">> = {},
): DomainDefinition {
  return Object.freeze({
    domain,
    defaultStatus,
    statuses: set(...statuses, "ARCHIVED"),
    relations: options.relations || relations(),
    immutable: options.immutable,
    allowNegativeAmountMinor: options.allowNegativeAmountMinor,
    allowNegativeQuantity: options.allowNegativeQuantity,
  });
}

export const DOMAIN_DEFINITIONS: Readonly<Record<CanonicalDomain, DomainDefinition>> = Object.freeze({
  DEAL: definition("DEAL", "NEW", [
    "NEW", "NEEDS_REVIEW", "NEEDS_ANALYSIS", "STRONG_OPPORTUNITY", "WORTH_AN_OFFER",
    "WATCH", "SAVED", "OFFER_PLANNED", "OFFER_MADE", "BIDDING", "PURCHASED", "PASSED",
    "EXPIRED", "DUPLICATE",
  ]),
  DEAL_SNAPSHOT: definition("DEAL_SNAPSHOT", "CAPTURED", ["CAPTURED"], {
    immutable: true,
    relations: relations({ dealId: { targetDomain: "DEAL", required: true } }),
  }),
  DEAL_ANALYSIS: definition("DEAL_ANALYSIS", "DRAFT", ["DRAFT", "COMPLETE", "SUPERSEDED"], {
    relations: relations({ dealId: { targetDomain: "DEAL" } }),
  }),
  SEARCH_RULE: definition("SEARCH_RULE", "PAUSED", ["ACTIVE", "PAUSED", "FAILED"]),
  AUCTION_EVENT: definition("AUCTION_EVENT", "WATCHING", ["DRAFT", "WATCHING", "ACTIVE", "ENDED", "WON", "LOST", "CANCELLED"]),
  AUCTION_LOT: definition("AUCTION_LOT", "WATCHING", ["DRAFT", "WATCHING", "ACTIVE", "WON", "LOST", "PASSED", "EXPIRED"], {
    relations: relations({ auctionEventId: { targetDomain: "AUCTION_EVENT", required: true } }),
  }),
  BID_PLAN: definition("BID_PLAN", "DRAFT", ["DRAFT", "READY", "SUPERSEDED"], {
    relations: relations({ auctionLotId: { targetDomain: "AUCTION_LOT", required: true } }),
  }),
  RESTOCK_STORE_PROFILE: definition("RESTOCK_STORE_PROFILE", "ACTIVE", GENERIC_STATUSES),
  RESTOCK_EVENT: definition("RESTOCK_EVENT", "POSSIBLE", ["POSSIBLE", "CONFIRMED", "STALE", "REJECTED"], {
    relations: relations({ storeId: { targetDomain: "RESTOCK_STORE_PROFILE", required: true } }),
  }),
  RESTOCK_PREDICTION: definition("RESTOCK_PREDICTION", "PENDING", ["PENDING", "CONFIRMED", "CORRECT", "PARTIAL", "INCORRECT", "NOT_ENOUGH_DATA"], {
    relations: relations({ storeId: { targetDomain: "RESTOCK_STORE_PROFILE", required: true } }),
  }),
  STORE_VISIT: definition("STORE_VISIT", "RECORDED", ["RECORDED", "SUCCESSFUL", "UNSUCCESSFUL"], {
    relations: relations({ storeId: { targetDomain: "RESTOCK_STORE_PROFILE", required: true }, purchaseId: { targetDomain: "PURCHASE" } }),
  }),
  PRODUCT_OBSERVATION: definition("PRODUCT_OBSERVATION", "OBSERVED", ["OBSERVED", "SOLD_OUT", "STALE"], {
    relations: relations({ storeId: { targetDomain: "RESTOCK_STORE_PROFILE", required: true } }),
  }),
  PURCHASE: definition("PURCHASE", "PLANNED", [
    "PLANNED", "OFFER_MADE", "WON", "AWAITING_PAYMENT", "PAID", "IN_TRANSIT", "PICKUP_REQUIRED",
    "RECEIVED", "PROCESSING", "COMPLETED", "RETURNED", "REFUNDED", "CANCELLED",
  ], { relations: relations({ dealId: { targetDomain: "DEAL" }, auctionLotId: { targetDomain: "AUCTION_LOT" } }) }),
  PURCHASE_LOT: definition("PURCHASE_LOT", "UNPROCESSED", ["UNPROCESSED", "PROCESSING", "RECONCILED", "COMPLETED"], {
    relations: relations({ purchaseId: { targetDomain: "PURCHASE", required: true } }),
  }),
  COST_ALLOCATION: definition("COST_ALLOCATION", "DRAFT", ["DRAFT", "RECONCILED", "ACCEPTED_WITH_DIFFERENCE"], {
    relations: relations({
      purchaseId: { targetDomain: "PURCHASE", required: true },
      purchaseLotId: { targetDomain: "PURCHASE_LOT" },
      ownedItemId: { targetDomain: "OWNED_ITEM" },
    }),
  }),
  OWNED_ITEM: definition("OWNED_ITEM", "UNPROCESSED", [
    "UNPROCESSED", "NEEDS_IDENTIFICATION", "NEEDS_REVIEW", "NEEDS_CLEANING", "NEEDS_PHOTOS",
    "NEEDS_PRICING", "READY_TO_LIST", "LISTED", "RESERVED", "SOLD", "SHIPPED", "RETURNED",
    "HOLD", "GRADING_CANDIDATE", "SUBMITTED_FOR_GRADING", "DONATED", "WRITTEN_OFF", "MISSING",
  ], {
    relations: relations({
      purchaseId: { targetDomain: "PURCHASE" },
      purchaseLotId: { targetDomain: "PURCHASE_LOT" },
      storageLocationId: { targetDomain: "STORAGE_LOCATION" },
    }),
  }),
  INVENTORY_ADJUSTMENT: definition("INVENTORY_ADJUSTMENT", "RECORDED", ["RECORDED", "VOIDED"], {
    allowNegativeQuantity: true,
    allowNegativeAmountMinor: true,
    relations: relations({ ownedItemId: { targetDomain: "OWNED_ITEM", required: true }, saleId: { targetDomain: "SALE" }, returnId: { targetDomain: "RETURN" } }),
  }),
  STORAGE_LOCATION: definition("STORAGE_LOCATION", "ACTIVE", GENERIC_STATUSES, {
    relations: relations({ parentStorageLocationId: { targetDomain: "STORAGE_LOCATION" } }),
  }),
  SALE: definition("SALE", "DRAFT", ["DRAFT", "RECORDED", "PAID", "SHIPPED", "COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED", "VOIDED"]),
  SALE_LINE_ITEM: definition("SALE_LINE_ITEM", "RECORDED", ["RECORDED", "RETURNED", "VOIDED"], {
    relations: relations({ saleId: { targetDomain: "SALE", required: true }, ownedItemId: { targetDomain: "OWNED_ITEM", required: true } }),
  }),
  SHIPMENT: definition("SHIPMENT", "DRAFT", ["DRAFT", "READY", "SHIPPED", "DELIVERED", "LOST", "RETURNED"], {
    relations: relations({ saleId: { targetDomain: "SALE", required: true } }),
  }),
  RETURN: definition("RETURN", "REQUESTED", ["REQUESTED", "IN_TRANSIT", "RECEIVED", "INSPECTED", "COMPLETED", "REJECTED", "VOIDED"], {
    allowNegativeAmountMinor: true,
    relations: relations({ saleId: { targetDomain: "SALE", required: true } }),
  }),
  EXPENSE: definition("EXPENSE", "RECORDED", ["RECORDED", "RECONCILED", "VOIDED"], {
    relations: relations({ purchaseId: { targetDomain: "PURCHASE" }, saleId: { targetDomain: "SALE" }, auctionEventId: { targetDomain: "AUCTION_EVENT" }, ownedItemId: { targetDomain: "OWNED_ITEM" }, receiptId: { targetDomain: "RECEIPT_METADATA" } }),
  }),
  MILEAGE_TRIP: definition("MILEAGE_TRIP", "RECORDED", ["RECORDED", "RECONCILED", "VOIDED"], {
    relations: relations({ purchaseId: { targetDomain: "PURCHASE" }, saleId: { targetDomain: "SALE" }, auctionEventId: { targetDomain: "AUCTION_EVENT" }, storeVisitId: { targetDomain: "STORE_VISIT" } }),
  }),
  RECEIPT_METADATA: definition("RECEIPT_METADATA", "NEEDS_REVIEW", ["NEEDS_REVIEW", "VERIFIED", "DUPLICATE", "VOIDED"], {
    relations: relations({ fileAssetId: { targetDomain: "FILE_ASSET" } }),
  }),
  OWNER_PREFERENCE: definition("OWNER_PREFERENCE", "ACTIVE", GENERIC_STATUSES),
  FEATURE_SETTING: definition("FEATURE_SETTING", "ACTIVE", ["ACTIVE", "DISABLED", "UNAVAILABLE"]),
  FILE_ASSET: definition("FILE_ASSET", "REFERENCE_ONLY", ["REFERENCE_ONLY", "AVAILABLE", "MISSING", "UNSUPPORTED", "QUARANTINED"]),
});

export function domainDefinition(domain: CanonicalDomain): DomainDefinition {
  return DOMAIN_DEFINITIONS[domain];
}
