import assert from "node:assert/strict";
import {
  FAMILY_FRIENDLY_CARD_SHOP_TITLE,
  FAMILY_FRIENDLY_SHOP_COPY,
  buildStoreActivitySummary,
  buildStoreProfileSummary,
  matchesStoreDirectoryFilters,
  setStoreFavoriteState,
  sortStoreDirectoryProfiles,
} from "../src/utils/storeProfileUtils.js";

const shop = {
  id: "family-table",
  name: "Family Table TCG",
  chain: "Family Table TCG",
  retailer: "Local Card Shops",
  storeType: "Local Card Shop",
  city: "Norfolk",
  state: "Virginia",
  region: "Hampton Roads / 757",
  active: true,
  familyFriendlyApproved: true,
  supportsKidsAccess: true,
  supportsMsrpOrReasonablePricing: true,
  agreedToCommunityMotto: true,
  offersKidEvents: true,
  offersTradeNights: true,
  featuredPartner: true,
  partnerNotes: "Runs kid trade nights.",
};

const reports = [
  {
    id: "confirmed-1",
    storeId: "family-table",
    storeName: "Family Table TCG",
    retailer: "Local Card Shops",
    reportType: "stock_on_shelf",
    verificationStatus: "Confirmed",
    productCategory: "Elite Trainer Box",
    reportDate: "2026-05-20",
  },
  {
    id: "guess-row",
    storeId: "family-table",
    storeName: "Family Table TCG",
    retailer: "Local Card Shops",
    reportType: "restock_guess",
    verificationStatus: "Pending",
    productCategory: "Booster Bundle",
  },
  {
    id: "rejected-row",
    storeId: "family-table",
    storeName: "Family Table TCG",
    retailer: "Local Card Shops",
    verificationStatus: "Rejected",
    productCategory: "Tin",
  },
];

const guesses = [
  { id: "guess-1", storeId: "family-table", storeName: "Family Table TCG", retailer: "Local Card Shops", guessedDay: "Friday" },
];

const predictions = [
  { id: "prediction-1", storeId: "family-table", storeName: "Family Table TCG", retailer: "Local Card Shops", confidenceLabel: "Medium Confidence", windowLabel: "Friday afternoon" },
];

const tidepoolPosts = [
  { id: "post-1", status: "Published", storeReference: "Family Table TCG", title: "Trade night was friendly", body: "Parents were welcome." },
  { id: "post-2", status: "Rejected", storeReference: "Family Table TCG", title: "Hidden post" },
];

const profile = buildStoreProfileSummary(shop, { reports, guesses, predictions, tidepoolPosts });

assert.equal(profile.name, "Family Table TCG");
assert.equal(profile.storeType, "Local Card Shop");
assert.equal(profile.familyFriendlyTitle, FAMILY_FRIENDLY_CARD_SHOP_TITLE);
assert.equal(profile.familyFriendlyCopy, FAMILY_FRIENDLY_SHOP_COPY);
assert.equal(profile.mottoCopy.includes("community motto"), true);
assert.equal(profile.partnerDisclaimer.includes("Availability and pricing may vary"), true);
assert.deepEqual(profile.badges.map((badge) => badge.label), [
  "Family-Friendly",
  "Kids Access",
  "Reasonable Pricing",
  "Kid Events",
  "Trade Nights",
  "Featured Partner",
]);

assert.equal(profile.activity.recentReportCount, 1);
assert.equal(profile.activity.communityGuessCount, 1);
assert.equal(profile.activity.predictedWindows.length, 1);
assert.equal(profile.activity.mostReportedProduct, "Elite Trainer Box");
assert.equal(profile.activity.nextPredictedWindow, "Friday afternoon");
assert.equal(profile.activity.relatedTidepoolPosts.length, 1);

const activity = buildStoreActivitySummary(shop, { reports, guesses, predictions });
assert.equal(activity.confirmedReports.length, 1, "guesses/rejected rows must not count as confirmed reports");
assert.equal(activity.communityGuesses.length, 1);
assert.equal(activity.predictedWindows.length, 1);

assert.equal(matchesStoreDirectoryFilters(profile, { storeType: "Local Card Shop", familyStatus: "familyFriendly" }), true);
assert.equal(matchesStoreDirectoryFilters(profile, { kidsAccessOnly: true, reasonablePricingOnly: true, kidEventsOnly: true, tradeNightsOnly: true }), true);
assert.equal(matchesStoreDirectoryFilters(profile, { state: "Virginia", region: "Hampton Roads / 757" }), true);
assert.equal(matchesStoreDirectoryFilters(profile, { query: "trade nights" }), true);
assert.equal(matchesStoreDirectoryFilters({ ...shop, active: false }, {}, { admin: false }), false);
assert.equal(matchesStoreDirectoryFilters({ ...shop, active: false }, {}, { admin: true }), true);

assert.deepEqual(setStoreFavoriteState(shop, true), { ...shop, favorite: true, watchlisted: true, watchlist: true });

const sorted = sortStoreDirectoryProfiles([
  buildStoreProfileSummary({ id: "big-box", name: "Target", retailer: "Target", storeType: "Big Box Retailer" }),
  profile,
]);
assert.equal(sorted[0].name, "Family Table TCG");

console.log("Store page/profile tests passed.");
