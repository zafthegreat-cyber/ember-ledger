import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const store = new Map();
globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) };
const { BLOCKED_USERS_KEY, blockUser, canBlockAuthor, getBlockedUsers, isBlockedAuthor, unblockUser, withoutBlockedAuthors } = await import("../src/utils/blockedUsers.js");

const alice = { postId: "p1", userId: "user-alice" };
const bob = { id: "r1", user_id: "user-bob" };

test("blocking hides that person's posts, replies and reports", () => {
  assert.equal(blockUser(alice, "@alice"), true);
  assert.equal(blockUser(alice, "@alice"), false, "blocking twice keeps one entry");
  assert.equal(isBlockedAuthor({ userId: "user-alice" }), true);
  assert.equal(isBlockedAuthor(bob), false);
  assert.deepEqual(withoutBlockedAuthors([alice, bob, { commentId: "c1", userId: "user-alice" }]), [bob]);
  assert.equal(JSON.parse(store.get(BLOCKED_USERS_KEY))[0].label, "@alice");
});

test("unblocking shows them again", () => {
  unblockUser("user-alice");
  assert.deepEqual(getBlockedUsers(), []);
  assert.deepEqual(withoutBlockedAuthors([alice, bob]), [alice, bob]);
});

test("you can't block yourself, local placeholders or records without an author", () => {
  assert.equal(canBlockAuthor(alice, "user-alice"), false);
  assert.equal(canBlockAuthor({ userId: "local-beta" }), false);
  assert.equal(canBlockAuthor({}), false);
  assert.equal(canBlockAuthor(bob, "user-alice"), true);
  assert.equal(blockUser({}), false);
});

test("damaged saved data is ignored", () => {
  store.set(BLOCKED_USERS_KEY, "{not json");
  unblockUser("nobody");
  assert.ok(Array.isArray(getBlockedUsers()));
});

function menuAndModeration(app) {
  // Reports must reach staff, not only the reporter's device (App Store guideline 1.2).
  assert.match(app, /async function sendContentReportToModerators/);
  assert.match(app, /supabase\.from\("beta_feedback"\)\.insert\(row\)[\s\S]{0,200}return true;/);
  assert.match(app, /kind: "store_report",/);
  assert.match(app, /kind: "community_post",/);
  assert.match(app, /actionType === "flag" && flagSent/, "the 'admin will review' message only shows after the report was sent");
}

test("Community, Restocks and Settings use the block list", () => {
  const community = readFileSync(new URL("../src/features/deferredViews/CommunityContent.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(community, /Block controls are queued/, "Block user is a real action, not a placeholder");
  assert.match(community, /blockUser\(post, usernameLabel\)/);
  assert.match(community, /withoutBlockedAuthors\(tidepoolComments, blockedUsers\)/);
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /if \(isBlockedAuthor\(post, blockedUsers\)\) return false;/);
  const scout = readFileSync(new URL("../src/pages/Scout.jsx", import.meta.url), "utf8");
  assert.match(scout, /!hiddenAsBlocked\(report\)/);
  assert.match(scout, /label: "Block reporter"/);
  assert.match(scout, /label: "Report", danger: true, onClick: \(\) => onFlagReport\(report\)/, "Restocks cards offer Report on other people's reports");
  assert.match(app, /onFlagReport=\{openScoutReportFlagAction\}/);
  menuAndModeration(app);
  const menu = readFileSync(new URL("../src/features/deferredViews/MenuDrawerContent.jsx", import.meta.url), "utf8");
  assert.match(menu, /<BlockedUsersPanel \/>/);
});
