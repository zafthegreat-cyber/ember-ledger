import assert from "node:assert/strict";

import {
  TIDEPOOL_FAMILY_SAFE_RULES,
  buildTidepoolPost,
  canUserCreateTidepoolPost,
  canViewTidepoolPost,
  detectTidepoolSafetyReviewReason,
  normalizeTidepoolPostCategory,
  normalizeTidepoolPostStatus,
  publicTidepoolPostSummary,
} from "../src/utils/tidepoolCommunity.js";
import { buildPublicCommunityProfile } from "../src/utils/communityProfile.js";

assert.equal(normalizeTidepoolPostCategory("Restock sighting"), "Restock Discussion");
assert.equal(normalizeTidepoolPostCategory("Product sighting"), "Restock Discussion");
assert.equal(normalizeTidepoolPostCategory("Giveaway/donation"), "Kid-Friendly Win");
assert.equal(normalizeTidepoolPostCategory("store tip"), "Family-Friendly Shop");
assert.equal(normalizeTidepoolPostCategory("unknown label"), "Other");

assert.equal(normalizeTidepoolPostStatus("active"), "Published");
assert.equal(normalizeTidepoolPostStatus("pending"), "Pending Review");
assert.equal(normalizeTidepoolPostStatus({ flagged: true, status: "active" }), "Flagged");

assert.ok(TIDEPOOL_FAMILY_SAFE_RULES.some((rule) => /children's personal details/i.test(rule)));
assert.ok(TIDEPOOL_FAMILY_SAFE_RULES.some((rule) => /fake restock claims/i.test(rule)));
assert.ok(TIDEPOOL_FAMILY_SAFE_RULES.some((rule) => /home addresses/i.test(rule)));

const post = buildTidepoolPost({
  title: "League day question",
  body: "Are parents welcome at the shop event?",
  postType: "Question",
  userId: "user-1",
  publicUsername: "safe_parent",
}, { now: "2026-05-21T12:00:00.000Z" });

assert.equal(post.status, "Pending Review");
assert.equal(post.moderationStatus, "Pending Review");
assert.equal(post.visibility, "author_admin");
assert.equal(post.postType, "Question");

assert.equal(canUserCreateTidepoolPost({ betaAccessAllowed: true }), true);
assert.equal(canUserCreateTidepoolPost({ betaAccessAllowed: false }), false);
assert.equal(canUserCreateTidepoolPost({ betaAccessAllowed: true, guestPreviewActive: true }), false);

assert.equal(canViewTidepoolPost(post, { currentUserId: "user-1" }), true, "authors should see their own pending posts");
assert.equal(canViewTidepoolPost(post, { currentUserId: "user-2" }), false, "normal users should not see another user's pending post");
assert.equal(canViewTidepoolPost(post, { currentUserId: "admin", isAdmin: true }), true, "admins should see pending posts");

const publishedPost = buildTidepoolPost({ ...post, status: "Published" });
assert.equal(canViewTidepoolPost(publishedPost, { currentUserId: "user-2" }), true);

assert.match(detectTidepoolSafetyReviewReason({ body: "Text me about my child at 757-555-1212" }), /private contact/i);
assert.match(detectTidepoolSafetyReviewReason({ body: "My child school is listed here" }), /child|family/i);

const summary = publicTidepoolPostSummary(publishedPost);
assert.equal(summary.category, "Question");
assert.equal(summary.status, "Published");
assert.match(summary.author, /safe_parent/i);

const profile = buildPublicCommunityProfile({
  userId: "user-1",
  publicUsername: "safe_parent",
  email: "private@example.com",
}, { tidepoolPosts: [publishedPost] });
assert.equal(JSON.stringify(profile).includes("private@example.com"), false, "public profile summary must not expose raw email");

console.log("Tidepool community tests passed.");
