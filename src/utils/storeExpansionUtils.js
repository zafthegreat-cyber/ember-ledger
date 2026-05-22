import { getStoreGroup } from "./storeGroupingUtils.js";

export const STORE_LOCATION_TYPES = [
  "Big Box Retailer",
  "Local Card Shop",
  "Bookstore",
  "Warehouse Club",
  "Dollar Store",
  "Game Store",
  "Other",
];

export const FAMILY_FRIENDLY_SHOP_COPY = "This shop supports the Ember & Tide mission: helping families and kids access Pokemon in a fair, welcoming, and reasonably priced way.";
export const COMMUNITY_MOTTO_COPY = "Agreed to the Ember & Tide community motto: keep collecting fair, kid-friendly, and welcoming.";

export const STORE_FAMILY_FILTER_OPTIONS = [
  { value: "all", label: "All shop statuses" },
  { value: "familyFriendly", label: "Family-friendly only" },
  { value: "kidsAccess", label: "Kids access" },
  { value: "reasonablePricing", label: "Reasonable pricing" },
  { value: "kidEvents", label: "Kid events" },
  { value: "tradeNights", label: "Trade nights" },
  { value: "featured", label: "Featured partners" },
  { value: "advertising", label: "Advertising partners" },
];

const TRUE_VALUES = new Set(["true", "yes", "y", "1", "approved", "active", "featured"]);

export function normalizeStoreBooleanField(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
}

function storeExpansionText(store = {}) {
  return [
    store.storeType,
    store.store_type,
    store.type,
    store.storeGroup,
    store.store_group,
    store.chain,
    store.retailer,
    store.name,
    store.storeName,
    store.nickname,
    store.category,
    store.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function normalizeStoreLocationType(storeOrType = {}) {
  const text = typeof storeOrType === "string" ? storeOrType.toLowerCase() : storeExpansionText(storeOrType);
  const group = typeof storeOrType === "string" ? "" : getStoreGroup(storeOrType);

  if (/local card|card shop|tcg|collectible|collectibles|comic/.test(text) || group === "Local Card Shops") return "Local Card Shop";
  if (/local game|game store|game shop|tabletop/.test(text) || group === "Local Game Stores") return "Game Store";
  if (/gamestop|game stop/.test(text)) return "Game Store";
  if (/bookstore|book store|bookstores|barnes|books-a-million|books a million/.test(text) || group === "Bookstores" || group === "Bookstores / Hobby") return "Bookstore";
  if (/warehouse|costco|sam'?s club|sams club|bj'?s|bjs/.test(text) || group === "Warehouse Clubs") return "Warehouse Club";
  if (/dollar|five below|discount/.test(text) || group === "Dollar / Discount Stores") return "Dollar Store";
  if (/target|walmart|best buy|walgreens|cvs|kohl|michaels|hobby lobby|sporting goods/.test(text)) return "Big Box Retailer";
  return STORE_LOCATION_TYPES.includes(storeOrType) ? storeOrType : "Other";
}

export function normalizeStoreExpansionFields(store = {}) {
  const locationType = normalizeStoreLocationType(store);
  return {
    ...store,
    type: locationType,
    storeType: locationType,
    store_type: locationType,
    locationType,
    familyFriendlyApproved: normalizeStoreBooleanField(store.familyFriendlyApproved ?? store.family_friendly_approved),
    supportsKidsAccess: normalizeStoreBooleanField(store.supportsKidsAccess ?? store.supports_kids_access),
    supportsMsrpOrReasonablePricing: normalizeStoreBooleanField(store.supportsMsrpOrReasonablePricing ?? store.supports_msrp_or_reasonable_pricing),
    agreedToCommunityMotto: normalizeStoreBooleanField(store.agreedToCommunityMotto ?? store.agreed_to_community_motto),
    offersKidEvents: normalizeStoreBooleanField(store.offersKidEvents ?? store.offers_kid_events),
    offersTradeNights: normalizeStoreBooleanField(store.offersTradeNights ?? store.offers_trade_nights),
    advertisingPartner: normalizeStoreBooleanField(store.advertisingPartner ?? store.advertising_partner),
    featuredPartner: normalizeStoreBooleanField(store.featuredPartner ?? store.featured_partner),
    partnerNotes: store.partnerNotes || store.partner_notes || "",
  };
}

export function isLocalCommunityShop(store = {}) {
  return ["Local Card Shop", "Game Store"].includes(normalizeStoreLocationType(store));
}

export function storePartnerBadgesApprovedForPublic(store = {}) {
  const active = store.active ?? store.isActive ?? store.is_active ?? true;
  const statusText = String(`${store.status || ""} ${store.reviewStatus || ""} ${store.review_status || ""}`).toLowerCase();
  if (active === false || /inactive|closed|removed|rejected|archived/.test(statusText)) return false;
  if (/pending|needs review|under review|draft/.test(statusText)) return false;
  return true;
}

export function getStoreFamilyFriendlyBadges(store = {}) {
  const normalized = normalizeStoreExpansionFields(store);
  const badges = [];
  if (!storePartnerBadgesApprovedForPublic(normalized)) return badges;
  if (!isLocalCommunityShop(normalized) && !normalized.familyFriendlyApproved && !normalized.featuredPartner && !normalized.advertisingPartner) return badges;
  if (normalized.familyFriendlyApproved) badges.push({ key: "familyFriendly", label: "Family-Friendly", tone: "gold" });
  if (normalized.supportsKidsAccess) badges.push({ key: "kidsAccess", label: "Kids Access", tone: "success" });
  if (normalized.supportsMsrpOrReasonablePricing) badges.push({ key: "reasonablePricing", label: "Reasonable Pricing", tone: "tide" });
  if (normalized.offersKidEvents) badges.push({ key: "kidEvents", label: "Kid Events", tone: "gold" });
  if (normalized.offersTradeNights) badges.push({ key: "tradeNights", label: "Trade Nights", tone: "tide" });
  if (normalized.featuredPartner) badges.push({ key: "featuredPartner", label: "Featured Partner", tone: "ember" });
  if (normalized.advertisingPartner) badges.push({ key: "advertisingPartner", label: "Advertising Partner", tone: "muted" });
  return badges;
}

export function isStoreActiveForViewer(store = {}, options = {}) {
  const admin = Boolean(options.admin);
  const active = store.active ?? store.isActive ?? store.is_active ?? true;
  const statusText = String(`${store.status || ""} ${store.reviewStatus || ""} ${store.review_status || ""}`).toLowerCase();
  const inactive = active === false || statusText.includes("inactive") || statusText.includes("closed") || statusText.includes("removed");
  return admin || !inactive;
}

export function matchesStoreExpansionFilters(store = {}, filters = {}, options = {}) {
  const normalized = normalizeStoreExpansionFields(store);
  if (!isStoreActiveForViewer(normalized, options)) return false;
  if (filters.storeType && filters.storeType !== "All" && normalized.locationType !== filters.storeType) return false;
  if (filters.familyStatus === "familyFriendly" && !normalized.familyFriendlyApproved) return false;
  if (filters.familyStatus === "kidsAccess" && !normalized.supportsKidsAccess) return false;
  if (filters.familyStatus === "reasonablePricing" && !normalized.supportsMsrpOrReasonablePricing) return false;
  if (filters.familyStatus === "kidEvents" && !normalized.offersKidEvents) return false;
  if (filters.familyStatus === "tradeNights" && !normalized.offersTradeNights) return false;
  if (filters.familyStatus === "featured" && !normalized.featuredPartner) return false;
  if (filters.familyStatus === "advertising" && !normalized.advertisingPartner) return false;
  if (filters.state && filters.state !== "All" && normalized.state !== filters.state) return false;
  if (filters.region && filters.region !== "All" && normalized.region !== filters.region) return false;
  return true;
}
