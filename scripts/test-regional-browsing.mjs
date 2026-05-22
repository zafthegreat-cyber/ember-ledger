import assert from "node:assert/strict";
import { buildEmberAssistFallbackResponse } from "../src/utils/emberAssist.js";
import {
  buildRegionalCityBuckets,
  buildRegionalStoreBuckets,
  matchesRegionalAreaFilters,
} from "../src/utils/regionalBrowsingUtils.js";
import {
  buildStoreProfileSummary,
  matchesStoreDirectoryFilters,
} from "../src/utils/storeProfileUtils.js";

const familyShop = {
  id: "vb-family-shop",
  name: "VB Family Cards",
  retailer: "VB Family Cards",
  storeType: "Local Card Shop",
  city: "Virginia Beach",
  state: "VA",
  region: "757",
  active: true,
  familyFriendlyApproved: true,
  supportsKidsAccess: true,
  supportsMsrpOrReasonablePricing: true,
  featuredPartner: true,
};

const inactiveShop = {
  id: "closed-shop",
  name: "Closed Shop",
  retailer: "Closed Shop",
  storeType: "Local Card Shop",
  city: "Norfolk",
  state: "VA",
  status: "inactive",
};

const reports = [
  {
    id: "confirmed-vb",
    storeId: "vb-family-shop",
    storeName: "VB Family Cards",
    retailer: "VB Family Cards",
    city: "Virginia Beach",
    status: "confirmed",
    reportType: "stock_on_shelf",
    verified: true,
  },
  {
    id: "guess-vb",
    storeId: "vb-family-shop",
    storeName: "VB Family Cards",
    retailer: "VB Family Cards",
    city: "Virginia Beach",
    reportType: "community_guess",
  },
];

const guesses = [
  {
    id: "guess-vb",
    storeId: "vb-family-shop",
    storeName: "VB Family Cards",
    retailer: "VB Family Cards",
    city: "Virginia Beach",
  },
];

const predictions = [
  {
    id: "prediction-vb",
    storeId: "vb-family-shop",
    storeName: "VB Family Cards",
    retailer: "VB Family Cards",
    city: "Virginia Beach",
    confidenceScore: 72,
  },
];

const familyProfile = buildStoreProfileSummary(familyShop, { reports, guesses, predictions });
assert.equal(familyProfile.city, "Virginia Beach");
assert.equal(familyProfile.state, "Virginia");
assert.equal(familyProfile.region, "Hampton Roads / 757");
assert.equal(familyProfile.activity.recentReportCount, 1, "community guesses must not inflate confirmed restock counts");
assert.equal(familyProfile.activity.communityGuessCount, 1);
assert.equal(familyProfile.activity.predictedWindows.length, 1);

assert.equal(matchesStoreDirectoryFilters(familyProfile, { state: "Virginia", region: "Hampton Roads / 757", city: "Virginia Beach" }), true);
assert.equal(matchesStoreDirectoryFilters(familyProfile, { city: "Richmond" }), false);
assert.equal(matchesStoreDirectoryFilters(familyProfile, { familyStatus: "familyFriendly", kidsAccessOnly: true, reasonablePricingOnly: true }), true);

assert.equal(matchesRegionalAreaFilters(familyProfile, { state: "Virginia", region: "Hampton Roads / 757" }), true);
assert.equal(matchesRegionalAreaFilters(familyProfile, { state: "North Carolina" }), false);

const normalInactiveProfile = buildStoreProfileSummary(inactiveShop, { admin: false });
const adminInactiveProfile = buildStoreProfileSummary(inactiveShop, { admin: true });
assert.equal(matchesStoreDirectoryFilters(normalInactiveProfile, {}, { admin: false }), false);
assert.equal(matchesStoreDirectoryFilters(adminInactiveProfile, {}, { admin: true }), true);

const buckets = buildRegionalStoreBuckets([familyProfile, adminInactiveProfile], { admin: true });
const hrBucket = buckets.find((bucket) => bucket.region === "Hampton Roads / 757");
assert.ok(hrBucket);
assert.equal(hrBucket.storeCount, 2);
assert.equal(hrBucket.familyFriendlyCount, 1);
assert.equal(hrBucket.confirmedReportCount, 1);
assert.equal(hrBucket.predictedWindowCount, 1);
assert.equal(hrBucket.communityGuessCount, 1);

const cityBuckets = buildRegionalCityBuckets([familyProfile, adminInactiveProfile], { state: "Virginia", region: "Hampton Roads / 757" }, { admin: true });
assert.equal(cityBuckets.some((bucket) => bucket.city === "Virginia Beach" && bucket.storeCount === 1), true);
assert.equal(cityBuckets.some((bucket) => bucket.city === "Norfolk" && bucket.storeCount === 1), true);

const areaAnswer = buildEmberAssistFallbackResponse("How do I browse by area?", { page: "scout" });
assert.match(areaAnswer.answer, /State, Region, and City filters|Browse by Area/i);
assert.ok(areaAnswer.actions.includes("Open Stores"));

const expansionAnswer = buildEmberAssistFallbackResponse("Can Ember & Tide expand to another state?", { page: "scout" });
assert.match(expansionAnswer.answer, /clean store data and community reports/i);
assert.doesNotMatch(expansionAnswer.answer, /guarantee/i);

const noPredictionAnswer = buildEmberAssistFallbackResponse("Why are there no predictions in my area?", { page: "dropRadar" });
assert.match(noPredictionAnswer.answer, /confirmed restock history/i);
assert.match(noPredictionAnswer.answer, /community guesses stay separate/i);

console.log("Regional browsing tests passed.");
