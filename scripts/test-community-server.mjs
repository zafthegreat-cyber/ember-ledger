// Community posts on the server: mapping between the app's post shape and the
// community_posts table, and merging server posts with device-only posts.
import assert from "node:assert/strict";
import { fromServerPostType, mergeServerPosts, serverRowToPostOverrides, submitCommunityPost, toServerModerationStatus, toServerPostType } from "../src/features/community/communityServer.js";
import { TIDEPOOL_POST_CATEGORIES } from "../src/utils/tidepoolCommunity.js";

for (const category of TIDEPOOL_POST_CATEGORIES) {
  const slug = toServerPostType(category);
  assert.match(slug, /^[a-z0-9_]+$/, `${category} -> ${slug}`);
  assert.equal(fromServerPostType(slug), category, `round trip for ${category}`);
}
assert.equal(toServerPostType("Trade Night"), "trade_night");
assert.equal(fromServerPostType("event"), "Local Event");

const other = serverRowToPostOverrides({ id: "a1", title: "Hi", body: "B", post_type: "question", status: "approved", author_name: "PikaPal", created_at: "2026-11-15T00:00:00Z" }, { myUserId: "me" });
assert.equal(other.postId, "srv-a1");
assert.equal(other.status, "Published");
assert.equal(other.username, "PikaPal");
assert.notEqual(other.userId, "me");
const mine = serverRowToPostOverrides({ id: "b2", user_id: "me", status: "pending", post_type: "other" }, { myUserId: "me", myUsername: "Dad" });
assert.equal(mine.status, "Pending Review");
assert.equal(mine.userId, "me");
assert.equal(mine.visibility, "author_admin");

assert.equal(toServerModerationStatus("Published"), "approved");
assert.equal(toServerModerationStatus("Archived"), "removed");
assert.equal(toServerModerationStatus("Flagged"), "");

const merged = mergeServerPosts([{ postId: "local-1", createdAt: "2026-11-01" }], [{ postId: "srv-a1", serverId: "a1", createdAt: "2026-11-15" }]);
assert.deepEqual(merged.map((p) => p.postId), ["srv-a1", "local-1"]);

// A blocked insert (kid account / no access) gets a plain message, not a raw database error.
const fakeSupabase = { from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ error: { code: "42501", message: "new row violates row-level security policy" } }) }) }) }) };
const blocked = await submitCommunityPost(fakeSupabase, { title: "x", body: "y", category: "Question" });
assert.equal(blocked.ok, false);
assert.match(blocked.message, /can't post in Community/);
assert.doesNotMatch(blocked.message, /row-level/);

console.log("community server mapping: ok");
