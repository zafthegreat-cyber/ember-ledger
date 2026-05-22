import assert from "node:assert/strict";
import {
  REGIONAL_BROWSING_EMPTY_COPY,
  buildMapReadyStoreLocation,
  buildRegionalStoreBuckets,
  matchesRegionalAreaFilters,
  normalizeCityLabel,
  normalizeRegionLabel,
  normalizeStateLabel,
  normalizeStoreAreaFields,
  regionalFilterActive,
} from "../src/utils/regionalBrowsingUtils.js";

assert.equal(normalizeStateLabel("VA"), "Virginia");
assert.equal(normalizeStateLabel("maryland"), "Maryland");
assert.equal(normalizeStateLabel("NC"), "North Carolina");
assert.equal(normalizeCityLabel("va beach"), "Virginia Beach");
assert.equal(normalizeCityLabel("newport news"), "Newport News");
assert.equal(normalizeRegionLabel("", { city: "Virginia Beach", state: "VA" }), "Hampton Roads / 757");
assert.equal(normalizeRegionLabel("", { city: "Richmond", state: "Virginia" }), "Richmond / Central Virginia");
assert.equal(normalizeRegionLabel("NOVA", { state: "VA" }), "Northern Virginia");
assert.equal(normalizeRegionLabel("", { city: "Fredericksburg", state: "VA" }), "Fredericksburg");
assert.equal(normalizeRegionLabel("", { city: "Raleigh", state: "NC" }), "North Carolina");
assert.equal(normalizeRegionLabel("", { state: "MD" }), "Maryland");

const redmill = {
  id: "redmill-target",
  name: "Target Redmill",
  nickname: "RM T",
  retailer: "Target",
  city: "Virginia Beach",
  state: "VA",
  storeType: "Big Box Retailer",
  address: "Private test address",
  adminNotes: "Admin-only note",
};

const normalized = normalizeStoreAreaFields(redmill);
assert.equal(normalized.city, "Virginia Beach");
assert.equal(normalized.state, "Virginia");
assert.equal(normalized.region, "Hampton Roads / 757");
assert.equal(normalized.areaLabel, "Virginia Beach / Hampton Roads / 757");
assert.equal(normalized.displayLabel, "RM T - Target Redmill");

const ncNormalized = normalizeStoreAreaFields({ city: "Raleigh", state: "VA" });
assert.equal(ncNormalized.region, "North Carolina");
assert.equal(ncNormalized.state, "North Carolina", "state-level regions should not display as the wrong state when source data is inconsistent");

assert.equal(matchesRegionalAreaFilters(redmill, { state: "Virginia", region: "Hampton Roads / 757", city: "Virginia Beach" }), true);
assert.equal(matchesRegionalAreaFilters(redmill, { state: "Maryland" }), false);
assert.equal(regionalFilterActive({ state: "All", region: "All", city: "All" }), false);
assert.equal(regionalFilterActive({ city: "Norfolk" }), true);

const profile = {
  id: "profile-redmill",
  name: "Target Redmill",
  city: "Virginia Beach",
  state: "Virginia",
  region: "Hampton Roads / 757",
  storeType: "Big Box Retailer",
  badges: [{ label: "Family-Friendly" }],
  favorite: true,
  store: { ...redmill, familyFriendlyApproved: true, featuredPartner: false },
  activity: {
    recentReportCount: 3,
    predictedWindows: [{ id: "predicted-1" }],
    communityGuessCount: 1,
  },
};

const mapReady = buildMapReadyStoreLocation(profile);
assert.equal(mapReady.displayName, "Target Redmill");
assert.equal(mapReady.city, "Virginia Beach");
assert.equal(mapReady.region, "Hampton Roads / 757");
assert.equal(mapReady.recentConfirmedReportCount, 3);
assert.equal(mapReady.predictedWindowCount, 1);
assert.equal(mapReady.communityGuessCount, 1);
assert.equal(mapReady.profileRoute, "/scout/stores/profile-redmill");
assert.equal(Object.hasOwn(mapReady, "address"), false, "map-ready data should not expose addresses by default");
assert.equal(Object.hasOwn(mapReady, "adminNotes"), false, "map-ready data should not expose admin-only notes");

const buckets = buildRegionalStoreBuckets([
  profile,
  {
    id: "richmond-shop",
    name: "Richmond Card Shop",
    city: "Richmond",
    state: "Virginia",
    region: "Richmond / Central Virginia",
    store: { id: "richmond-shop", familyFriendlyApproved: true, featuredPartner: true },
    activeForViewer: true,
    activity: { recentReportCount: 1, predictedWindows: [] },
  },
]);
assert.equal(buckets.some((bucket) => bucket.region === "Hampton Roads / 757" && bucket.storeCount === 1 && bucket.confirmedReportCount === 3), true);
assert.equal(buckets.some((bucket) => bucket.region === "Richmond / Central Virginia" && bucket.familyFriendlyCount === 1), true);

assert.match(REGIONAL_BROWSING_EMPTY_COPY.noStores, /No stores in this area/i);
assert.match(REGIONAL_BROWSING_EMPTY_COPY.noReports, /No confirmed reports/i);
assert.match(REGIONAL_BROWSING_EMPTY_COPY.noPredictions, /confirmed restock history/i);

console.log("Area expansion utility tests passed.");
