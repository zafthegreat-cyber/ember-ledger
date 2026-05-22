import assert from "node:assert/strict";
import { buildEmberAssistFallbackResponse } from "../src/utils/emberAssist.js";
import {
  COMMUNITY_MOTTO_COPY,
  FAMILY_FRIENDLY_CARD_SHOP_TITLE,
  PARTNER_STATUS_DISCLAIMER,
  buildStoreProfileSummary,
  matchesStoreDirectoryFilters,
} from "../src/utils/storeProfileUtils.js";

const baseShop = {
  id: "partner-shop",
  name: "Starter Town Cards",
  retailer: "Local Card Shops",
  storeType: "Local Card Shop",
  active: true,
};

const plainProfile = buildStoreProfileSummary(baseShop);
assert.equal(plainProfile.familyFriendlyTitle, "");
assert.equal(plainProfile.badges.some((badge) => badge.label === "Featured Partner"), false);
assert.equal(plainProfile.badges.some((badge) => badge.label === "Advertising Partner"), false);

const approvedProfile = buildStoreProfileSummary({
  ...baseShop,
  familyFriendlyApproved: true,
  agreedToCommunityMotto: true,
  advertisingPartner: true,
});

assert.equal(approvedProfile.familyFriendlyTitle, FAMILY_FRIENDLY_CARD_SHOP_TITLE);
assert.equal(approvedProfile.mottoCopy, COMMUNITY_MOTTO_COPY);
assert.equal(approvedProfile.partnerDisclaimer, PARTNER_STATUS_DISCLAIMER);
assert.equal(approvedProfile.badges.some((badge) => badge.label === "Advertising Partner"), true);
assert.equal(approvedProfile.badges.some((badge) => badge.label === "Featured Partner"), false);
assert.equal(matchesStoreDirectoryFilters(approvedProfile, { familyStatus: "advertising" }), true);
assert.equal(matchesStoreDirectoryFilters(approvedProfile, { familyStatus: "featured" }), false);

const featuredProfile = buildStoreProfileSummary({ ...baseShop, featuredPartner: true });
assert.equal(featuredProfile.badges.some((badge) => badge.label === "Featured Partner"), true);
assert.equal(matchesStoreDirectoryFilters(featuredProfile, { familyStatus: "featured" }), true);

const familyAnswer = buildEmberAssistFallbackResponse("What is a Family-Friendly Card Shop?", { page: "scout" });
assert.match(familyAnswer.answer, /fair, welcoming Pokemon access/i);
assert.match(familyAnswer.answer, /not guaranteed inventory/i);

const msrpAnswer = buildEmberAssistFallbackResponse("Can a shop guarantee MSRP?", { page: "scout" });
assert.match(msrpAnswer.answer, /should not promise guaranteed MSRP or inventory/i);

const partnerAnswer = buildEmberAssistFallbackResponse("What does Featured Partner mean?", { page: "scout" });
assert.match(partnerAnswer.answer, /Availability and pricing can still vary/i);

const reportAnswer = buildEmberAssistFallbackResponse("How do I report a restock at this store?", { page: "scout" });
assert.match(reportAnswer.answer, /Report Stock or Report Empty/i);

const followAnswer = buildEmberAssistFallbackResponse("How do I follow a store?", { page: "scout" });
assert.match(followAnswer.answer, /Follow Store/i);

console.log("Partner profile tests passed.");
