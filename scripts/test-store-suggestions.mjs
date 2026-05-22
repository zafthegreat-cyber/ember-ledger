import assert from "node:assert/strict";

import {
  STORE_PARTNER_NO_GUARANTEE_COPY,
  STORE_SUGGESTION_REVIEW_COPY,
  adminStoreDraftToApprovedStore,
  buildStoreSuggestionRecord,
  filterStoresForScoutPicker,
  publicStorePartnerBadges,
} from "../src/utils/adminStoreTools.js";
import {
  getSuggestionReviewSection,
  suggestionTitle,
} from "../src/utils/suggestionReviewUtils.js";
import {
  buildEmberAssistContext,
  buildEmberAssistFallbackResponse,
} from "../src/utils/emberAssist.js";

const suggestion = buildStoreSuggestionRecord({
  displayName: "New Family Card Shop",
  chain: "New Family Card Shop",
  storeType: "Local Card Shop",
  nickname: "NFCS",
  city: "Richmond",
  state: "Virginia",
  region: "Richmond / Central Virginia",
  familyFriendlyApproved: true,
  supportsKidsAccess: true,
  supportsMsrpOrReasonablePricing: true,
  featuredPartner: true,
  publicNotes: "Owners host kid league nights.",
}, {
  userId: "user-1",
  displayName: "safe_parent",
  source: "store-directory",
  now: "2026-05-22T12:00:00.000Z",
});

assert.equal(suggestion.suggestionType, "add_missing_store");
assert.equal(suggestion.targetTable, "stores");
assert.equal(suggestion.status, "Submitted");
assert.equal(suggestion.visibility, "admin_review");
assert.equal(getSuggestionReviewSection(suggestion), "store");
assert.equal(suggestionTitle(suggestion), "New Family Card Shop");
assert.equal(suggestion.submittedData.status, "Pending Review");
assert.equal(suggestion.submittedData.active, false);
assert.equal(suggestion.submittedData.reportable, false);
assert.equal(suggestion.submittedData.publicVisibility, "admin_review_only");
assert.equal(suggestion.submittedData.suggestionReviewCopy, STORE_SUGGESTION_REVIEW_COPY);
assert.equal(suggestion.submittedData.partnerNoGuaranteeCopy, STORE_PARTNER_NO_GUARANTEE_COPY);
assert.match(JSON.stringify(suggestion), /not a guarantee/i);
assert.match(JSON.stringify(suggestion), /MSRP/i);
assert.match(JSON.stringify(suggestion), /inventory/i);

assert.deepEqual(filterStoresForScoutPicker([suggestion.submittedData], { admin: false }), [], "suggestions should not appear in normal Scout picker before approval");
assert.equal(filterStoresForScoutPicker([suggestion.submittedData], { admin: true }).length, 1, "admins can inspect inactive/pending store suggestions");
assert.deepEqual(publicStorePartnerBadges(suggestion.submittedData), [], "pending suggestions must not show family-friendly/featured badges");

const approved = adminStoreDraftToApprovedStore({
  ...suggestion.submittedData,
  active: true,
  reportable: true,
  reviewStatus: "Approved",
}, { now: "2026-05-22T13:00:00.000Z", reviewer: "official admin ember" });
assert.equal(filterStoresForScoutPicker([approved], { admin: false }).length, 1);
assert.deepEqual(publicStorePartnerBadges(approved).map((badge) => badge.label), [
  "Family-Friendly",
  "Kids Access",
  "Reasonable Pricing",
  "Featured Partner",
]);

const suggestAnswer = buildEmberAssistFallbackResponse("How do I suggest a store?", buildEmberAssistContext({ activeTab: "scout" }));
assert.match(suggestAnswer.answer, /Suggest Store/i);
assert.match(suggestAnswer.answer, /admin review/i);
assert.match(suggestAnswer.answer, /does not become public automatically/i);

const hiddenAnswer = buildEmberAssistFallbackResponse("Why is this store hidden?", buildEmberAssistContext({ activeTab: "scout" }));
assert.match(hiddenAnswer.answer, /inactive|closed|not reportable|admin review/i);
assert.match(hiddenAnswer.answer, /normal users/i);

const partnerAnswer = buildEmberAssistFallbackResponse("Can a family friendly shop guarantee MSRP or inventory?", buildEmberAssistContext({ activeTab: "scout" }));
assert.match(partnerAnswer.answer, /should not promise guaranteed MSRP or inventory/i);

const adminAnswer = buildEmberAssistFallbackResponse("How do admin store tools work?", buildEmberAssistContext({ activeTab: "adminReview", isAdmin: true }));
assert.match(adminAnswer.answer, /Admin Store Management/i);
assert.match(adminAnswer.answer, /marking stores inactive/i);
assert.match(adminAnswer.answer, /no guaranteed MSRP or inventory/i);

console.log("Store suggestion tests passed.");
