import assert from "node:assert/strict";
import {
  containsOfficialImpersonation,
  containsUnsafeCommunityText,
  isMarketplaceClosedStatus,
  validateMarketplaceListingDraft,
  validateTidepoolCommentDraft,
  validateTidepoolPostDraft,
} from "../src/utils/communitySafety.js";

const baseListing = {
  title: "Crown Zenith Elite Trainer Box",
  quantity: 1,
  listingType: "For Sale",
  condition: "Sealed",
  askingPrice: 54.99,
  description: "Local pickup available.",
};

assert.equal(validateMarketplaceListingDraft(baseListing, { requirePublicFields: true }), "");
assert.match(
  validateMarketplaceListingDraft({ ...baseListing, title: "Official Admin Tide ETB" }, { requirePublicFields: true }),
  /reserved/i
);
assert.equal(
  validateMarketplaceListingDraft(
    { ...baseListing, title: "Official Admin Tide ETB" },
    { requirePublicFields: true, isOfficialAdmin: true }
  ),
  ""
);
assert.match(
  validateMarketplaceListingDraft({ ...baseListing, askingPrice: 0 }, { requirePublicFields: true }),
  /asking price/i
);
assert.equal(
  validateMarketplaceListingDraft({ ...baseListing, listingType: "Free / Donation", askingPrice: 0 }, { requirePublicFields: true }),
  ""
);
assert.equal(
  validateMarketplaceListingDraft({ ...baseListing, askingPrice: 0 }, { requirePublicFields: false }),
  ""
);

assert.equal(validateTidepoolPostDraft({ title: "Local league day", body: "Parents welcome." }), "");
assert.match(validateTidepoolPostDraft({ title: "Ember & Tide official support", body: "I can help." }), /reserved/i);
assert.match(validateTidepoolPostDraft({ title: "Trade", body: "private kid chat only" }), /safer wording/i);
assert.equal(validateTidepoolPostDraft({ title: "Official event", body: "Admin update." }, { isOfficialAdmin: true }), "");

assert.match(validateTidepoolCommentDraft("wire transfer only"), /safer wording/i);
assert.match(validateTidepoolCommentDraft(""), /comment/i);
assert.equal(validateTidepoolCommentDraft("Helpful store tip."), "");

assert.equal(containsOfficialImpersonation("official_admin_ember"), true);
assert.equal(containsOfficialImpersonation("official_admin_ember", { isOfficialAdmin: true }), false);
assert.equal(containsUnsafeCommunityText("Please use no parents and private kid chat."), true);
assert.equal(isMarketplaceClosedStatus("Sold"), true);
assert.equal(isMarketplaceClosedStatus("Rejected"), true);
assert.equal(isMarketplaceClosedStatus("Active"), false);

console.log("Community safety tests passed.");
