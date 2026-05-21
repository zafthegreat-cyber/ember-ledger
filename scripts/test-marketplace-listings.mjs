import assert from "node:assert/strict";
import { buildEmberAssistFallbackResponse } from "../src/utils/emberAssist.js";
import { buildPublicCommunityProfile } from "../src/utils/communityProfile.js";
import {
  buildQuickAddSuccessMessage,
  normalizeQuickAddDestinations,
} from "../src/utils/quickAddRouting.js";
import {
  buildMarketplaceListingQualityReport,
  sellerTrustSummaryForListing,
} from "../src/utils/tidetradrMarketplaceSafety.js";

const sellerListing = {
  id: "listing-safe-1",
  title: "Surging Sparks Booster Bundle",
  productType: "Booster Bundle",
  setName: "Surging Sparks",
  listingType: "For Sale",
  condition: "Sealed",
  quantity: 2,
  askingPrice: 42,
  photos: [],
  sellerUserId: "seller-1",
  sellerUsername: "market_seller",
  sellerDisplayName: "Market Seller",
  sellerEmail: "seller@example.com",
  status: "Active",
  moderationStatus: "Approved",
};

const sellerProfile = buildPublicCommunityProfile(sellerListing, {
  marketplaceListings: [sellerListing],
  scoutReports: [
    { userId: "seller-1", status: "confirmed", verified: true, createdAt: "2026-05-20T12:00:00.000Z" },
  ],
  scoutProfile: { scoutPoints: 35 },
});

assert.equal(sellerProfile.publicUsernameLabel, "@market_seller");
assert.ok(sellerProfile.badges.some((badge) => badge.label === "Marketplace Seller"));
assert.equal(JSON.stringify(sellerProfile).includes("seller@example.com"), false, "seller profile must not expose raw email");

const trust = sellerTrustSummaryForListing(sellerListing, {
  marketplaceListings: [sellerListing],
  scoutReports: [{ userId: "seller-1", status: "confirmed", verified: true }],
  scoutProfile: { scoutPoints: 35 },
});
assert.equal(trust.sellerLabel, "@market_seller");
assert.ok(trust.badges.some((badge) => badge.label === "Marketplace Seller"));

const quality = buildMarketplaceListingQualityReport(sellerListing, { marketValue: 45, msrp: 27 });
assert.equal(quality.canActivate, true);
assert.match(quality.warnings.join(" "), /branded Booster Bundle fallback/i, "missing image should become an intentional fallback warning");

assert.deepEqual(
  normalizeQuickAddDestinations({ forge: true, vault: false, tidetradr: false }),
  { vault: false, wishlist: false, forge: true, tidetradr: false },
  "TideTradr Add to Forge routing should preserve Forge destination"
);
assert.deepEqual(
  normalizeQuickAddDestinations({ vault: true, forge: false, tidetradr: false }),
  { vault: true, wishlist: false, forge: false, tidetradr: false },
  "TideTradr Add to Vault routing should preserve Vault destination"
);
assert.equal(
  buildQuickAddSuccessMessage({
    itemName: "Surging Sparks Booster Bundle",
    entries: [{ destination: "Forge", quantity: 1, purchaserName: "Zena" }],
  }),
  "Surging Sparks Booster Bundle saved to Forge x1 (Zena)."
);

const safeListingAnswer = buildEmberAssistFallbackResponse("How do I make a safe listing?", { page: "market" });
assert.match(safeListingAnswer.answer, /clear item name/i);
assert.doesNotMatch(safeListingAnswer.answer, /checkout is active|payment inside the app/i);

const pendingAnswer = buildEmberAssistFallbackResponse("Why is my listing pending?", { page: "market" });
assert.match(pendingAnswer.answer, /pending/i);
assert.match(pendingAnswer.answer, /not public yet/i);

const reportAnswer = buildEmberAssistFallbackResponse("How do I report a listing?", { page: "market" });
assert.match(reportAnswer.answer, /admin review/i);
assert.match(reportAnswer.answer, /without publicly showing/i);

const trustAnswer = buildEmberAssistFallbackResponse("What does seller trust mean?", { page: "market" });
assert.match(trustAnswer.answer, /public username/i);
assert.match(trustAnswer.answer, /Private email/i);

const paymentAnswer = buildEmberAssistFallbackResponse("Can I pay through Ember and Tide?", { page: "market" });
assert.match(paymentAnswer.answer, /does not provide checkout\/payment/i);
assert.doesNotMatch(paymentAnswer.answer, /guaranteed|payment is available/i);

console.log("Marketplace listing tests passed.");
