import {
  COMMUNITY_MOTTO_COPY,
  FAMILY_FRIENDLY_SHOP_COPY,
  STORE_FAMILY_FILTER_OPTIONS,
  STORE_LOCATION_TYPES,
  getStoreFamilyFriendlyBadges,
  isLocalCommunityShop,
  isStoreActiveForViewer,
  normalizeStoreExpansionFields,
} from "./storeExpansionUtils.js";
import {
  matchesRegionalAreaFilters,
  normalizeStoreAreaFields,
} from "./regionalBrowsingUtils.js";

export { COMMUNITY_MOTTO_COPY, FAMILY_FRIENDLY_SHOP_COPY, STORE_FAMILY_FILTER_OPTIONS, STORE_LOCATION_TYPES };

export const FAMILY_FRIENDLY_CARD_SHOP_TITLE = "Family-Friendly Card Shop";
export const PARTNER_STATUS_DISCLAIMER = "Partner status helps highlight shops that support the Ember & Tide mission. Availability and pricing may vary.";
export const NO_FAMILY_SHOPS_COPY = "No family-friendly shops match those filters yet. Broaden the area or suggest a local shop for admin review.";

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") || "";
}

function normalizeText(value = "") {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function storeProfileId(store = {}, index = 0) {
  return String(firstValue(store.id, store.storeId, store.store_id, store.locationId, `${store.chain || store.retailer || "store"}-${store.nickname || store.name || index}`)).toLowerCase();
}

export function storeProfileName(store = {}) {
  return firstValue(store.nickname, store.storeName, store.store_name, store.name, store.locationName, "Store location");
}

export function storeProfileRetailer(store = {}) {
  return firstValue(store.retailer, store.chain, store.storeGroup, store.store_group, store.banner, "Retailer");
}

function recordStoreText(record = {}) {
  return normalizeText([
    record.storeId,
    record.store_id,
    record.storeName,
    record.store_name,
    record.store,
    record.locationName,
    record.retailer,
    record.chain,
    record.city,
    record.state,
    record.region,
    record.area,
  ].filter(Boolean).join(" "));
}

function storeMatchesRecord(store = {}, record = {}) {
  const normalized = normalizeStoreExpansionFields(store);
  const id = normalizeText(storeProfileId(normalized));
  const name = normalizeText(storeProfileName(normalized));
  const retailer = normalizeText(storeProfileRetailer(normalized));
  const text = recordStoreText(record);
  if (!text) return false;
  if (id && text.includes(id)) return true;
  return name && text.includes(name) && (!retailer || text.includes(retailer));
}

function isConfirmedReport(report = {}) {
  const text = normalizeText([
    report.status,
    report.verificationStatus,
    report.verification_status,
    report.reportType,
    report.report_type,
    report.confidence,
    report.sourceType,
    report.source_type,
  ].filter(Boolean).join(" "));
  if (/guess|prediction|predicted|placeholder|rejected|duplicate|stale|deleted/.test(text)) return false;
  return Boolean(report.verified || /confirmed|verified|stock on shelf|restock happening now|admin entered|historical/.test(text));
}

function recordDate(record = {}) {
  return firstValue(record.reportDate, record.report_date, record.date, record.createdAt, record.created_at, record.updatedAt, record.updated_at);
}

function productCategory(record = {}) {
  return firstValue(record.productType, record.product_type, record.productCategory, record.product_category, record.category, record.itemName, record.productName, "Pokemon");
}

function mode(values = []) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

export function buildStoreActivitySummary(store = {}, { reports = [], guesses = [], predictions = [], tidepoolPosts = [] } = {}) {
  const confirmedReports = reports.filter((report) => storeMatchesRecord(store, report) && isConfirmedReport(report));
  const communityGuesses = guesses.filter((guess) => storeMatchesRecord(store, guess));
  const predictedWindows = predictions.filter((prediction) => storeMatchesRecord(store, prediction));
  const relatedTidepoolPosts = tidepoolPosts.filter((post) => {
    const status = normalizeText(post.status || post.visibility || "published");
    if (status && !/published|active|approved|public/.test(status)) return false;
    return storeMatchesRecord(store, {
      storeName: firstValue(post.storeReference, post.store_reference, post.storeName, post.store_name),
      retailer: firstValue(post.retailer, post.chain),
      city: post.city,
    });
  });
  const newestConfirmed = [...confirmedReports].sort((a, b) => new Date(recordDate(b) || 0) - new Date(recordDate(a) || 0))[0] || null;
  const strongestPrediction = [...predictedWindows].sort((a, b) => Number(b.confidenceScore || b.confidence_score || 0) - Number(a.confidenceScore || a.confidence_score || 0))[0] || null;
  return {
    confirmedReports,
    predictedWindows,
    communityGuesses,
    relatedTidepoolPosts,
    lastConfirmedRestock: newestConfirmed ? recordDate(newestConfirmed) : "",
    mostReportedProduct: mode(confirmedReports.map(productCategory)),
    recentReportCount: confirmedReports.length,
    communityGuessCount: communityGuesses.length,
    predictionConfidenceSummary: strongestPrediction
      ? firstValue(strongestPrediction.confidenceLabel, strongestPrediction.confidence_label, strongestPrediction.patternStrength, strongestPrediction.pattern_strength, "Prediction available")
      : "Needs more confirmed history",
    nextPredictedWindow: strongestPrediction ? firstValue(strongestPrediction.windowLabel, strongestPrediction.timeWindow, strongestPrediction.time_window, strongestPrediction.predictedWindow, strongestPrediction.predicted_window) : "",
  };
}

export function buildStoreProfileSummary(store = {}, options = {}) {
  const normalized = normalizeStoreExpansionFields(store);
  const area = normalizeStoreAreaFields(normalized);
  const badges = getStoreFamilyFriendlyBadges(normalized);
  const activeForViewer = isStoreActiveForViewer(normalized, { admin: options.admin });
  const activity = buildStoreActivitySummary(normalized, options);
  const isPartner = Boolean(normalized.featuredPartner || normalized.advertisingPartner);
  const showFamilyFriendlyProfile = Boolean(
    isLocalCommunityShop(normalized) ||
    normalized.familyFriendlyApproved ||
    normalized.supportsKidsAccess ||
    normalized.supportsMsrpOrReasonablePricing ||
    isPartner
  );
  return {
    id: storeProfileId(normalized, options.index),
    store: normalized,
    activeForViewer,
    name: storeProfileName(normalized),
    nickname: firstValue(normalized.nickname, normalized.storeName, normalized.name),
    chainName: firstValue(normalized.chain, normalized.retailer, normalized.storeGroup),
    retailer: storeProfileRetailer(normalized),
    storeType: normalized.locationType,
    city: area.city,
    state: area.state,
    region: area.region,
    area: area.areaLabel,
    areaLabel: area.areaLabel,
    cityKey: area.cityKey,
    stateKey: area.stateKey,
    regionKey: area.regionKey,
    displayLabel: area.displayLabel,
    address: firstValue(normalized.address, normalized.streetAddress),
    notes: firstValue(normalized.description, normalized.notes, normalized.partnerNotes),
    favorite: Boolean(normalized.favorite || normalized.priority || normalized.watchlisted || normalized.watchlist),
    badges,
    isPartner,
    showFamilyFriendlyProfile,
    familyFriendlyTitle: normalized.familyFriendlyApproved ? FAMILY_FRIENDLY_CARD_SHOP_TITLE : "",
    familyFriendlyCopy: normalized.familyFriendlyApproved ? FAMILY_FRIENDLY_SHOP_COPY : "",
    mottoCopy: normalized.agreedToCommunityMotto ? COMMUNITY_MOTTO_COPY : "",
    partnerDisclaimer: isPartner ? PARTNER_STATUS_DISCLAIMER : "",
    activity,
  };
}

export function matchesStoreDirectoryFilters(storeOrProfile = {}, filters = {}, options = {}) {
  const profile = storeOrProfile.store && storeOrProfile.badges ? storeOrProfile : buildStoreProfileSummary(storeOrProfile, options);
  const store = profile.store || {};
  if (!profile.activeForViewer) return false;
  if (filters.storeType && filters.storeType !== "All" && profile.storeType !== filters.storeType) return false;
  if (filters.familyStatus === "familyFriendly" && !store.familyFriendlyApproved) return false;
  if (filters.familyStatus === "kidsAccess" && !store.supportsKidsAccess) return false;
  if (filters.familyStatus === "reasonablePricing" && !store.supportsMsrpOrReasonablePricing) return false;
  if (filters.familyStatus === "kidEvents" && !store.offersKidEvents) return false;
  if (filters.familyStatus === "tradeNights" && !store.offersTradeNights) return false;
  if (filters.familyStatus === "featured" && !store.featuredPartner) return false;
  if (filters.familyStatus === "advertising" && !store.advertisingPartner) return false;
  if (filters.kidsAccessOnly && !store.supportsKidsAccess) return false;
  if (filters.reasonablePricingOnly && !store.supportsMsrpOrReasonablePricing) return false;
  if (filters.kidEventsOnly && !store.offersKidEvents) return false;
  if (filters.tradeNightsOnly && !store.offersTradeNights) return false;
  if (filters.featuredPartnersOnly && !store.featuredPartner) return false;
  if (filters.advertisingPartnersOnly && !store.advertisingPartner) return false;
  if (!matchesRegionalAreaFilters(profile, filters)) return false;
  if (filters.query) {
    const query = normalizeText(filters.query);
    const haystack = normalizeText([
      profile.name,
      profile.nickname,
      profile.chainName,
      profile.retailer,
      profile.storeType,
      profile.city,
      profile.state,
      profile.region,
      profile.address,
      profile.notes,
      profile.badges.map((badge) => badge.label).join(" "),
    ].filter(Boolean).join(" "));
    if (query && !haystack.includes(query)) return false;
  }
  return true;
}

export function sortStoreDirectoryProfiles(rows = []) {
  return [...rows].sort((a, b) => {
    const left = a.profile || a;
    const right = b.profile || b;
    const leftScore = Number(left.store?.featuredPartner || false) * 6 + Number(left.store?.advertisingPartner || false) * 4 + Number(left.store?.familyFriendlyApproved || false) * 3 + Number(left.favorite || false);
    const rightScore = Number(right.store?.featuredPartner || false) * 6 + Number(right.store?.advertisingPartner || false) * 4 + Number(right.store?.familyFriendlyApproved || false) * 3 + Number(right.favorite || false);
    if (rightScore !== leftScore) return rightScore - leftScore;
    return String(left.name || "").localeCompare(String(right.name || ""));
  });
}

export function setStoreFavoriteState(store = {}, favorite = true) {
  return {
    ...store,
    favorite: Boolean(favorite),
    watchlisted: Boolean(favorite),
    watchlist: Boolean(favorite),
  };
}
