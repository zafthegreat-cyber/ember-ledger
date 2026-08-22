import { calculateLandedCost } from "./calculations.js";

const TRACKED_FIELDS = [
  "title",
  "description",
  "listingUrl",
  "askingPrice",
  "purchaseShipping",
  "currentBid",
  "numberOfBids",
  "sellerName",
  "sellerRating",
  "condition",
  "listingType",
  "auctionEndTime",
  "localPickupAvailable",
  "location",
  "imageReferences",
  "providerState",
  "isExpired",
];

function makeDiscoveryId() {
  if (globalThis.crypto?.randomUUID) return `ebay-discovery-${globalThis.crypto.randomUUID()}`;
  return `ebay-discovery-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function providerKey(record = {}) {
  return record.providerId && record.externalListingId ? `${record.providerId}:${record.externalListingId}` : "";
}

function comparable(value) {
  if (Array.isArray(value)) return JSON.stringify([...value].sort());
  if (value && typeof value === "object") return JSON.stringify(value);
  return value ?? "";
}

function changedFields(previous, incoming) {
  return TRACKED_FIELDS.filter((field) => comparable(previous?.[field]) !== comparable(incoming?.[field]));
}

function isPast(dateValue, now) {
  const timestamp = Date.parse(dateValue || "");
  return Number.isFinite(timestamp) && timestamp <= Date.parse(now);
}

export function mergeProviderListings(existing = [], incoming = [], checkedAt = new Date().toISOString()) {
  const existingByKey = new Map(existing.map((record) => [providerKey(record), record]).filter(([key]) => key));
  const incomingByKey = new Map();
  incoming.forEach((record) => {
    const key = providerKey(record);
    if (key) incomingByKey.set(key, record);
  });
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let expired = 0;
  const mergedKeys = new Set();
  const mergedIncoming = [];

  incomingByKey.forEach((record, key) => {
    const previous = existingByKey.get(key);
    const endExpired = Boolean(record.isExpired) || isPast(record.auctionEndTime, checkedAt);
    if (!previous) {
      added += 1;
      mergedIncoming.push({
        ...record,
        id: record.id || makeDiscoveryId(),
        firstSeenAt: record.firstSeenAt || checkedAt,
        lastCheckedAt: record.lastCheckedAt || checkedAt,
        reviewStatus: endExpired ? "Expired" : "Pending Review",
        providerState: endExpired ? "Expired" : (record.providerState || "Active"),
        isExpired: endExpired,
        updateStatus: "New",
        updatedFields: [],
      });
    } else {
      const nextProviderState = endExpired ? "Expired" : (record.providerState || (previous.isExpired ? "Active" : previous.providerState) || "Active");
      const fields = changedFields(previous, { ...record, isExpired: endExpired, providerState: nextProviderState });
      if (fields.length) updated += 1;
      else unchanged += 1;
      if (!previous.isExpired && endExpired) expired += 1;
      mergedIncoming.push({
        ...previous,
        ...record,
        id: previous.id,
        firstSeenAt: previous.firstSeenAt || record.firstSeenAt || checkedAt,
        lastCheckedAt: record.lastCheckedAt || checkedAt,
        reviewStatus: endExpired
          ? "Expired"
          : previous.reviewStatus === "Expired" || (fields.length && previous.reviewStatus === "Imported")
            ? "Needs Re-review"
            : (previous.reviewStatus || "Pending Review"),
        providerState: nextProviderState,
        isExpired: endExpired,
        updateStatus: fields.length ? "Updated" : "Unchanged",
        updatedFields: fields,
      });
    }
    mergedKeys.add(key);
  });

  const untouched = existing.map((record) => {
    const key = providerKey(record);
    if (mergedKeys.has(key)) return null;
    const endExpired = Boolean(record.isExpired) || isPast(record.auctionEndTime, checkedAt);
    if (!record.isExpired && endExpired) expired += 1;
    return endExpired ? { ...record, isExpired: true, providerState: "Expired", reviewStatus: "Expired", updateStatus: "Expired" } : record;
  }).filter(Boolean);

  return {
    listings: [...mergedIncoming, ...untouched].sort((a, b) => Date.parse(b.lastCheckedAt || b.firstSeenAt || 0) - Date.parse(a.lastCheckedAt || a.firstSeenAt || 0)),
    added,
    updated,
    unchanged,
    expired,
  };
}

export function findDealForProviderListing(deals = [], listing = {}) {
  const key = providerKey(listing);
  return key ? deals.find((deal) => providerKey(deal) === key) || null : null;
}

export function providerListingToDeal(listing, existingDeal = null, importedAt = new Date().toISOString()) {
  const sourceFields = [
    "providerId", "marketplace", "externalListingId", "legacyListingId", "listingUrl", "originalListingUrl",
    "title", "description", "sellerName", "sellerRating", "sellerFeedbackScore", "listingType", "buyingOptions",
    "productClassification", "condition", "conditionId", "askingPrice", "priceCurrency", "purchaseShipping",
    "shippingCostType", "currentBid", "numberOfBids", "imageReferences", "location", "distance", "distanceUnit",
    "dateDiscovered", "listingCreatedAt", "listingOriginTime", "auctionEndTime", "localPickupAvailable",
    "listingMarketplaceId", "firstSeenAt", "lastCheckedAt", "dataSource", "providerState", "isExpired",
  ];
  const deal = existingDeal ? { ...existingDeal } : { ...listing };
  sourceFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(listing, field)) deal[field] = listing[field];
  });
  deal.id = existingDeal?.id;
  deal.providerId = listing.providerId || "ebay";
  deal.marketplace = listing.marketplace || "eBay";
  deal.status = listing.isExpired && !["Purchased", "Sold"].includes(existingDeal?.status)
    ? "Expired"
    : (existingDeal?.status || "Needs Review");
  deal.riskFlags = [...new Set([...(existingDeal?.riskFlags || []), ...(listing.riskFlags || [])])];
  deal.tags = [...new Set([...(existingDeal?.tags || []), ...(listing.tags || [])])];
  deal.importedFromDiscoveryId = listing.id;
  deal.importedAt = importedAt;
  deal.reviewStatus = undefined;
  deal.updateStatus = undefined;
  deal.updatedFields = undefined;
  deal.sourceDataExplanation = listing.dataSource;
  deal.landedCost = calculateLandedCost({
    ...deal,
    purchasePrice: deal.askingPrice,
    purchaseTax: deal.estimatedTax,
  });
  return deal;
}

function parseList(value) {
  return String(value || "").split(/[,\n]/).map((entry) => entry.trim()).filter(Boolean);
}

export function parseNewlyListedHours(value) {
  const text = String(value || "").trim().toLowerCase();
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number) || number < 0) return "";
  if (/day/.test(text)) return number * 24;
  if (/week/.test(text)) return number * 24 * 7;
  return number;
}

export function isEbaySearchRule(rule = {}) {
  return /ebay|any approved source/i.test(String(rule.marketplace || ""));
}

export function ebaySearchFromRule(rule = {}, location = {}) {
  const phrases = [...parseList(rule.includeKeywords), ...parseList(rule.commonMisspellings)].slice(0, 8);
  const keywordExpression = phrases.length > 1 ? `(${phrases.join(",")})` : (phrases[0] || "");
  const buyingOptions = [rule.buyItNow ? "FIXED_PRICE" : "", rule.auction ? "AUCTION" : ""].filter(Boolean);
  return {
    keywords: keywordExpression.slice(0, 100),
    categoryId: rule.ebayCategoryId || "",
    gtin: rule.gtin || "",
    minimumPrice: rule.minimumPrice,
    maximumPrice: rule.maximumPrice,
    currency: location.currency || "USD",
    conditionIds: rule.conditionIds || [],
    buyingOptions,
    excludeKeywords: rule.excludeKeywords,
    productClassifications: rule.productClassifications || [],
    newlyListedHours: parseNewlyListedHours(rule.newlyListedWindow),
    maximumDistance: rule.maximumDistance,
    maximumPurchaseAmount: rule.maximumPurchaseAmount,
    minimumProjectedProfit: rule.minimumProjectedProfit,
    minimumRoi: rule.minimumRoi,
    minimumConfidence: rule.minimumConfidence,
    localPickupOnly: Boolean(rule.localPickupOnly),
    pickupCountry: location.pickupCountry || "US",
    pickupPostalCode: location.pickupPostalCode || "",
    pickupRadius: rule.maximumDistance || location.pickupRadius || "",
    pickupRadiusUnit: location.pickupRadiusUnit || "mi",
    deliveryCountry: location.deliveryCountry || "US",
    deliveryPostalCode: location.deliveryPostalCode || "",
    offset: 0,
    limit: location.limit || 25,
  };
}
