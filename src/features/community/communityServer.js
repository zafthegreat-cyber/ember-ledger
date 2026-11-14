// Community posts on the server (Nov 15, 2026).
//
// Posts used to live only in the poster's localStorage. Now a signed-in adult's
// post is saved to Supabase as 'pending'; a moderator approves it before other
// members see it. Members read approved posts through community_feed(), which
// returns the author's public username (never their real name or user id), and
// their own posts (any status) from community_posts. See migration
// 20261115020000_community_posts.sql.
import { TIDEPOOL_POST_CATEGORIES, normalizeTidepoolPostCategory } from "../../utils/tidepoolCommunity.js";

export const COMMUNITY_SERVER_ID_PREFIX = "srv-";

/** "Trade Night" -> "trade_night" (the server stores slugs of the app's categories). */
export function toServerPostType(category = "") {
  return normalizeTidepoolPostCategory(category).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "other";
}

/** "trade_night" -> "Trade Night"; older short values map to their closest category. */
export function fromServerPostType(postType = "") {
  const slug = String(postType || "").toLowerCase();
  const legacy = { event: "Local Event", win: "Kid-Friendly Win", tip: "Marketplace Tip" };
  if (legacy[slug]) return legacy[slug];
  return TIDEPOOL_POST_CATEGORIES.find((category) => toServerPostType(category) === slug) || "Other";
}

const STATUS_LABELS = { pending: "Pending Review", approved: "Published", rejected: "Rejected", removed: "Archived" };

/** A server row (feed or own) as the overrides makeTidepoolPost() expects. */
export function serverRowToPostOverrides(row = {}, { myUserId = "", myUsername = "" } = {}) {
  const mine = row.is_mine === true || (row.user_id && row.user_id === myUserId);
  const status = row.status || "approved";
  const label = STATUS_LABELS[status] || "Pending Review";
  const author = mine ? (myUsername || row.author_name || "You") : (row.author_name || "Collector");
  return {
    postId: `${COMMUNITY_SERVER_ID_PREFIX}${row.id}`,
    id: `${COMMUNITY_SERVER_ID_PREFIX}${row.id}`,
    serverId: row.id,
    userId: mine ? myUserId : "community-member",
    displayName: author,
    username: author,
    publicUsername: author,
    category: fromServerPostType(row.post_type),
    postType: fromServerPostType(row.post_type),
    title: row.title || "",
    body: row.body || "",
    status: label,
    moderationStatus: label,
    visibility: status === "approved" ? "public" : "author_admin",
    verificationStatus: status === "approved" ? "approved" : status === "pending" ? "pending_review" : status,
    reviewNote: row.review_note || "",
    sourceType: "user",
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    commentCount: Number(row.comment_count || 0),
  };
}

/** Save a new post for review. Returns { ok, id } or { ok: false, message }. */
export async function submitCommunityPost(supabase, { title = "", body = "", category = "" } = {}) {
  if (!supabase) return { ok: false, message: "Sign in to share posts with other members." };
  const { data, error } = await supabase.from("community_posts")
    .insert({ title: String(title).trim().slice(0, 120), body: String(body).trim().slice(0, 2000), post_type: toServerPostType(category) })
    .select("id, status, created_at")
    .single();
  if (error) {
    const blocked = /row-level security|permission|42501/i.test(`${error.code} ${error.message}`);
    return { ok: false, message: blocked ? "This account can't post in Community. Kid accounts can read and react; a parent can post from their own account." : "Your post couldn't be sent. It's saved on this device; try again in a moment." };
  }
  return { ok: true, id: data?.id || "", status: data?.status || "pending" };
}

/** Approved posts plus this member's own posts (any status). */
export async function loadCommunityPosts(supabase, { limit = 50 } = {}) {
  if (!supabase) return { ok: false, feed: [], own: [] };
  const [feed, own] = await Promise.all([
    supabase.rpc("community_feed", { p_limit: limit }),
    supabase.from("community_posts").select("id, user_id, post_type, title, body, status, review_note, created_at, updated_at").order("created_at", { ascending: false }).limit(50),
  ]);
  return { ok: !feed.error, feed: feed.data || [], own: own.error ? [] : own.data || [] };
}

/** Pending posts for the moderation queue (staff only; RLS returns nothing to others). */
export async function loadModerationQueue(supabase) {
  if (!supabase) return [];
  const { data, error } = await supabase.from("community_posts")
    .select("id, post_type, title, body, safety_flag, created_at")
    .eq("status", "pending").order("created_at", { ascending: true }).limit(50);
  return error ? [] : data || [];
}

export async function moderateCommunityPost(supabase, id, status, note = "") {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("moderate_community_item", { p_kind: "post", p_id: id, p_status: status, p_note: note || null });
  return !error && data === true;
}

/** Merge server posts into the local list: server versions replace local copies with the same serverId. */
export function mergeServerPosts(localPosts = [], serverPosts = []) {
  const serverIds = new Set(serverPosts.map((post) => String(post.serverId)));
  const keptLocal = localPosts.filter((post) => !post.serverId || !serverIds.has(String(post.serverId)));
  const byId = new Map();
  for (const post of serverPosts) byId.set(String(post.serverId), post);
  return [...byId.values(), ...keptLocal].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

/** App moderation label -> server status, or "" when the server has no equivalent. */
export function toServerModerationStatus(label = "") {
  const key = String(label || "").toLowerCase();
  if (key === "published" || key === "approved") return "approved";
  if (key === "rejected" || key === "needs edit") return "rejected";
  if (key === "archived" || key === "removed") return "removed";
  if (key === "pending review" || key === "pending") return "pending";
  return "";
}
