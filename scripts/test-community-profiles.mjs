import assert from "node:assert/strict";

import {
  OFFICIAL_ADMIN_USERNAMES,
  RESERVED_USERNAME_MESSAGE,
  validatePublicUsername,
} from "../src/utils/publicIdentity.js";
import {
  buildCommunityTrustBadges,
  buildPublicCommunityProfile,
} from "../src/utils/communityProfile.js";

const regularProfile = {
  userId: "regular",
  email: "private@example.com",
  publicUsername: "safe_collector",
  displayName: "Private Name",
  adminNote: "private admin note",
};

for (const blocked of [
  "scout admin",
  "scout-admin",
  "support",
  "moderator",
  "Ember&Tide",
  "ember support",
  "tide moderator",
]) {
  assert.equal(validatePublicUsername(blocked, regularProfile, []), RESERVED_USERNAME_MESSAGE, `${blocked} should be protected`);
}

assert.equal(validatePublicUsername("official admin tide", regularProfile, []), RESERVED_USERNAME_MESSAGE);
assert.equal(validatePublicUsername("official admin tide", { ...regularProfile, email: "owner@example.test", firstName: "Dillon", isAdmin: true }, []), "");

const officialProfile = buildPublicCommunityProfile({
  userId: "dillon",
  firstName: "Dillon",
  email: "owner@example.test",
  isAdmin: true,
  publicUsername: OFFICIAL_ADMIN_USERNAMES.tide,
});
assert.equal(officialProfile.publicUsernameLabel, "@official admin tide");
assert.equal(officialProfile.isOfficialAdminIdentity, true);
assert.ok(officialProfile.badges.some((badge) => badge.label === "Official Admin"));
assert.ok(JSON.stringify(officialProfile).includes("owner@example.test") === false, "public profile must not include private email");

const trustedProfile = buildPublicCommunityProfile({
  userId: "trusted-1",
  publicUsername: "greenbrier_helper",
  scoutPoints: 35,
}, {
  scoutReports: [
    { userId: "trusted-1", verified: true },
    { userId: "trusted-1", verificationStatus: "Confirmed" },
    { userId: "trusted-1", status: "Confirmed" },
  ],
  communityGuesses: [
    { userId: "trusted-1", moderationStatus: "Approved as Community Guess" },
  ],
});
assert.equal(trustedProfile.scoutLevel.label, "Trusted Reporter");
assert.equal(trustedProfile.canSubmitCommunityGuesses, true);
assert.ok(trustedProfile.badges.some((badge) => badge.label === "Trusted Reporter"));
assert.equal(trustedProfile.confirmedReports, 3);
assert.equal(trustedProfile.approvedGuesses, 1);

const sellerBadges = buildCommunityTrustBadges({
  publicUsername: "market_seller",
  userType: "seller",
});
assert.ok(sellerBadges.some((badge) => badge.label === "Marketplace Seller"));

const shopBadges = buildCommunityTrustBadges({
  publicUsername: "local_shop",
  familyFriendlyApproved: true,
  featuredPartner: true,
});
assert.ok(shopBadges.some((badge) => badge.label === "Family-Friendly Shop"));
assert.ok(shopBadges.some((badge) => badge.label === "Local Shop Partner"));

console.log("Community profile tests passed.");
