import assert from "node:assert/strict";

import {
  buildTidepoolPost,
  canViewTidepoolPost,
  flagTidepoolPost,
  moderateTidepoolPost,
  normalizeTidepoolFlagReason,
  normalizeTidepoolPostStatus,
  publicTidepoolPostSummary,
  tidepoolPostNeedsModeration,
} from "../src/utils/tidepoolCommunity.js";
import { buildAdminCommandCenterSummary } from "../src/utils/adminCommandCenterUtils.js";

const pendingPost = buildTidepoolPost({
  postId: "post-1",
  title: "Greenbrier league night",
  body: "Is the family trade night happening?",
  postType: "Trade Night",
  userId: "author-1",
  publicUsername: "gb_parent",
}, { now: "2026-05-21T12:00:00.000Z" });

assert.equal(tidepoolPostNeedsModeration(pendingPost), true);
assert.equal(normalizeTidepoolPostStatus(pendingPost), "Pending Review");

const flaggedPost = flagTidepoolPost(pendingPost, {
  reason: "fake restock",
  details: "Looks like a guaranteed restock claim.",
  userId: "flagger-1",
  now: "2026-05-21T12:10:00.000Z",
});

assert.equal(normalizeTidepoolFlagReason("fake restock"), "Fake restock claim");
assert.equal(flaggedPost.status, "Flagged");
assert.equal(flaggedPost.flagged, true);
assert.equal(flaggedPost.flagCount, 1);
assert.equal(flaggedPost.body, pendingPost.body, "flagging should preserve post content instead of deleting");
assert.equal(tidepoolPostNeedsModeration(flaggedPost), true);

const summary = buildAdminCommandCenterSummary({ tidepoolPosts: [flaggedPost] });
assert.equal(summary.tidepoolPostsNeedingReview, 1);
assert.equal(summary.totalOpen, 1);

const published = moderateTidepoolPost(flaggedPost, "Published", {
  reviewer: "official_admin_ember",
  reason: "Reviewed and safe.",
  now: "2026-05-21T12:20:00.000Z",
});

assert.equal(published.status, "Published");
assert.equal(published.visibility, "public");
assert.equal(canViewTidepoolPost(published, { currentUserId: "reader-1" }), true);
assert.equal(tidepoolPostNeedsModeration(published), false);

const needsEdit = moderateTidepoolPost(pendingPost, "Needs Edit", {
  reviewer: "official_admin_tide",
  reason: "Remove private details.",
});
assert.equal(needsEdit.status, "Needs Edit");
assert.equal(canViewTidepoolPost(needsEdit, { currentUserId: "author-1" }), true);
assert.equal(canViewTidepoolPost(needsEdit, { currentUserId: "reader-1" }), false);

const rejected = moderateTidepoolPost(pendingPost, "Rejected", {
  reviewer: "official_admin_tide",
  reason: "Unsafe meetup details.",
});
assert.equal(rejected.status, "Rejected");
assert.equal(publicTidepoolPostSummary(rejected).visibility, "admin");
assert.equal(canViewTidepoolPost(rejected, { currentUserId: "reader-1" }), false);
assert.equal(canViewTidepoolPost(rejected, { currentUserId: "admin", isAdmin: true }), true);

console.log("Tidepool moderation tests passed.");
