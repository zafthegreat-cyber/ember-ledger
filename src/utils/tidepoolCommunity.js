import { publicUsernameLabelFromRecord } from "./publicIdentity.js";

export const TIDEPOOL_POST_CATEGORIES = [
  "Community Update",
  "Restock Discussion",
  "Kid-Friendly Win",
  "Question",
  "Local Event",
  "Family-Friendly Shop",
  "Trade Night",
  "Marketplace Tip",
  "App Help",
  "Other",
];

export const TIDEPOOL_POST_STATUSES = [
  "Pending Review",
  "Published",
  "Rejected",
  "Flagged",
  "Needs Edit",
  "Archived",
];

export const TIDEPOOL_FLAG_REASONS = [
  "Not family-friendly",
  "Harassment or bullying",
  "Scam/fake product concern",
  "Private information",
  "Fake restock claim",
  "Unsafe meetup",
  "Spam",
  "Other",
];

export const TIDEPOOL_FAMILY_SAFE_RULES = [
  "Be kind and helpful.",
  "Keep Pokemon collecting fair and family-friendly.",
  "Do not harass, threaten, shame, or target people.",
  "Do not share private personal information.",
  "Do not share children's personal details.",
  "Do not post exact home addresses.",
  "Do not make fake restock claims.",
  "Do not advertise scams, fake products, or unsafe meetups.",
  "Keep trades and sales safe and follow platform rules.",
];

export const TIDEPOOL_DEFAULT_POST_STATUS = "Pending Review";
export const TIDEPOOL_PUBLIC_POST_STATUS = "Published";

const CATEGORY_ALIASES = new Map([
  ["general_post", "Community Update"],
  ["general", "Community Update"],
  ["community", "Community Update"],
  ["community_update", "Community Update"],
  ["restock", "Restock Discussion"],
  ["restock_sighting", "Restock Discussion"],
  ["restock_discussion", "Restock Discussion"],
  ["product_sighting", "Restock Discussion"],
  ["kid_friendly_win", "Kid-Friendly Win"],
  ["kid_win", "Kid-Friendly Win"],
  ["kids_win", "Kid-Friendly Win"],
  ["giveaway_donation", "Kid-Friendly Win"],
  ["question", "Question"],
  ["help_request", "Question"],
  ["local_event", "Local Event"],
  ["event", "Local Event"],
  ["family_friendly_shop", "Family-Friendly Shop"],
  ["store_tip", "Family-Friendly Shop"],
  ["trade_night", "Trade Night"],
  ["groups", "Trade Night"],
  ["marketplace_tip", "Marketplace Tip"],
  ["deal_sighting", "Marketplace Tip"],
  ["looking_for_item", "Marketplace Tip"],
  ["app_help", "App Help"],
  ["announcement_admin_post", "App Help"],
  ["other", "Other"],
]);

const STATUS_ALIASES = new Map([
  ["pending", "Pending Review"],
  ["pending_review", "Pending Review"],
  ["needs_review", "Pending Review"],
  ["unverified", "Pending Review"],
  ["disputed", "Pending Review"],
  ["active", "Published"],
  ["public", "Published"],
  ["published", "Published"],
  ["verified", "Published"],
  ["approved", "Published"],
  ["rejected", "Rejected"],
  ["reject", "Rejected"],
  ["denied", "Rejected"],
  ["flagged", "Flagged"],
  ["reported", "Flagged"],
  ["needs_edit", "Needs Edit"],
  ["edit_requested", "Needs Edit"],
  ["hidden", "Archived"],
  ["archived", "Archived"],
  ["removed", "Archived"],
  ["deleted", "Archived"],
]);

function normalizeKey(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function safeNow(options = {}) {
  return options.now || new Date().toISOString();
}

function firstText(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

export function normalizeTidepoolPostCategory(value = "") {
  const raw = String(value || "").trim();
  const exact = TIDEPOOL_POST_CATEGORIES.find((category) => category.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  return CATEGORY_ALIASES.get(normalizeKey(raw)) || "Other";
}

export function normalizeTidepoolPostStatus(postOrStatus = {}) {
  if (typeof postOrStatus === "string") {
    const exact = TIDEPOOL_POST_STATUSES.find((status) => status.toLowerCase() === postOrStatus.trim().toLowerCase());
    return exact || STATUS_ALIASES.get(normalizeKey(postOrStatus)) || "Pending Review";
  }
  if (postOrStatus.flagged) return "Flagged";
  const raw = firstText(
    postOrStatus.moderationStatus,
    postOrStatus.moderation_status,
    postOrStatus.status,
    postOrStatus.verificationStatus,
    postOrStatus.verification_status,
    postOrStatus.visibility
  );
  return normalizeTidepoolPostStatus(raw);
}

export function normalizeTidepoolFlagReason(value = "") {
  const raw = String(value || "").trim();
  const exact = TIDEPOOL_FLAG_REASONS.find((reason) => reason.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  const key = normalizeKey(raw);
  if (key.includes("family")) return "Not family-friendly";
  if (key.includes("harass") || key.includes("bully") || key.includes("threat")) return "Harassment or bullying";
  if (key.includes("scam") || key.includes("fake_product") || key.includes("counterfeit")) return "Scam/fake product concern";
  if (key.includes("private") || key.includes("personal") || key.includes("email") || key.includes("phone")) return "Private information";
  if (key.includes("fake_restock") || key.includes("false_restock")) return "Fake restock claim";
  if (key.includes("unsafe") || key.includes("meetup")) return "Unsafe meetup";
  if (key.includes("spam")) return "Spam";
  return "Other";
}

export function detectTidepoolSafetyReviewReason(form = {}) {
  const text = [
    form.title,
    form.body,
    form.notes,
    form.moderationReason,
    form.locationName,
    form.storeReference,
    form.productReference,
  ].filter(Boolean).join(" ");

  if (!text.trim()) return "";
  if (/\b\d{1,6}\s+[a-z0-9 .'-]+\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|circle|cir|place|pl|way)\b/i.test(text)) {
    return "Possible exact address or private location.";
  }
  if (/\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(text) || /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(text)) {
    return "Possible private contact information.";
  }
  if (/\b(child|kid|minor|student)\b.{0,40}\b(full name|school|teacher|class|bus stop|address|phone|text me|dm me)\b/i.test(text)) {
    return "Possible child or family private details.";
  }
  if (/\b(no parents|kids only|come alone|private kid chat|dm (a )?(kid|child|minor))\b/i.test(text)) {
    return "Unsafe child or meetup language.";
  }
  if (/\b(guaranteed restock|100%\s+restock|confirmed stock everywhere|fake receipt|replica cards?|counterfeit)\b/i.test(text)) {
    return "Possible misleading restock or product claim.";
  }
  return "";
}

export function tidepoolStatusVisibility(status = "Pending Review") {
  const normalized = normalizeTidepoolPostStatus(status);
  if (normalized === "Published") return "public";
  if (normalized === "Pending Review" || normalized === "Flagged" || normalized === "Needs Edit") return "author_admin";
  return "admin";
}

export function tidepoolStatusTone(status = "Pending Review") {
  const normalized = normalizeTidepoolPostStatus(status);
  if (normalized === "Published") return "confirmed";
  if (normalized === "Pending Review" || normalized === "Needs Edit") return "needs-review";
  if (normalized === "Flagged") return "warning";
  if (normalized === "Rejected") return "danger";
  return "muted";
}

export function canUserCreateTidepoolPost({
  betaAccessAllowed = false,
  guestPreviewActive = false,
  activeTabLocked = false,
  blocked = false,
} = {}) {
  return Boolean(betaAccessAllowed && !guestPreviewActive && !activeTabLocked && !blocked);
}

export function buildTidepoolPost(overrides = {}, options = {}) {
  const now = safeNow(options);
  const category = normalizeTidepoolPostCategory(overrides.category || overrides.postCategory || overrides.postType);
  const safetyReviewReason = overrides.safetyReviewReason || detectTidepoolSafetyReviewReason({ ...overrides, category });
  const requestedStatus = overrides.status || overrides.moderationStatus || overrides.moderation_status || options.defaultStatus || TIDEPOOL_DEFAULT_POST_STATUS;
  const status = normalizeTidepoolPostStatus(safetyReviewReason && normalizeTidepoolPostStatus(requestedStatus) === "Published" ? TIDEPOOL_DEFAULT_POST_STATUS : requestedStatus);
  const visibility = overrides.visibility || tidepoolStatusVisibility(status);
  const flags = Array.isArray(overrides.flags) ? overrides.flags : [];
  const commentCount = Number(overrides.commentCount || overrides.commentsCount || 0);
  const reactionCount = Number(overrides.reactionCount || overrides.reactionsCount || 0);
  const username = firstText(overrides.publicUsername, overrides.public_username, overrides.username, "local_scout");

  return {
    ...overrides,
    postId: overrides.postId || overrides.id || `tidepool-post-${Date.now()}`,
    id: overrides.id || overrides.postId || "",
    userId: firstText(overrides.userId, overrides.user_id, options.userId, "local-beta"),
    authorProfileId: firstText(overrides.authorProfileId, overrides.profileId, overrides.userId, options.userId, "local-beta"),
    displayName: firstText(overrides.displayName, overrides.display_name, publicUsernameLabelFromRecord({ publicUsername: username }, "community")),
    username,
    publicUsername: username,
    public_username: username,
    category,
    postCategory: category,
    postType: category,
    title: firstText(overrides.title),
    body: firstText(overrides.body, overrides.message),
    storeId: firstText(overrides.storeId, overrides.store_id),
    storeReference: firstText(overrides.storeReference, overrides.store_reference, overrides.locationName),
    productId: firstText(overrides.productId, overrides.product_id, overrides.catalogItemId),
    productReference: firstText(overrides.productReference, overrides.product_reference, overrides.productName),
    catalogItemId: firstText(overrides.catalogItemId, overrides.catalog_item_id, overrides.productId),
    city: firstText(overrides.city),
    state: firstText(overrides.state, "VA"),
    zip: firstText(overrides.zip, overrides.postalCode),
    photoUrl: firstText(overrides.photoUrl, overrides.photo_url, overrides.imageUrl),
    imageUrl: firstText(overrides.imageUrl, overrides.photoUrl, overrides.photo_url),
    createdAt: firstText(overrides.createdAt, overrides.created_at, now),
    updatedAt: firstText(overrides.updatedAt, overrides.updated_at, now),
    status,
    moderationStatus: status,
    moderation_status: status,
    verificationStatus: status === "Published" ? "published" : normalizeKey(status),
    verification_status: status === "Published" ? "published" : normalizeKey(status),
    visibility,
    safetyReviewReason,
    moderationReason: firstText(overrides.moderationReason, overrides.moderation_reason, safetyReviewReason),
    moderation_note: firstText(overrides.moderation_note, overrides.moderationReason, safetyReviewReason),
    commentCount,
    commentsCount: commentCount,
    reactionCount,
    reactionsCount: reactionCount,
    commentsLocked: Boolean(overrides.commentsLocked || overrides.comments_locked),
    saved: Boolean(overrides.saved),
    flagged: status === "Flagged" || Boolean(overrides.flagged),
    flagCount: Number(overrides.flagCount || overrides.flag_count || flags.length || 0),
    flags,
    sourceType: firstText(overrides.sourceType, overrides.source_type, "user"),
  };
}

export function canViewTidepoolPost(post = {}, viewer = {}) {
  const status = normalizeTidepoolPostStatus(post);
  const sourceType = String(post.sourceType || post.source_type || "").toLowerCase();
  if (!viewer.isAdmin && ["mock", "demo", "test"].includes(sourceType)) return false;
  if (viewer.isAdmin) return true;
  if (status === "Published") return true;
  const currentUserId = String(viewer.currentUserId || "");
  const authorId = String(post.userId || post.user_id || post.authorProfileId || "");
  return Boolean(currentUserId && currentUserId === authorId && ["Pending Review", "Flagged", "Needs Edit"].includes(status));
}

export function flagTidepoolPost(post = {}, options = {}) {
  const now = safeNow(options);
  const reason = normalizeTidepoolFlagReason(options.reason || "Other");
  const flag = {
    flagId: options.flagId || `tidepool-flag-${Date.now()}`,
    reason,
    details: String(options.details || "").trim(),
    flaggedBy: options.userId || "local-beta",
    createdAt: now,
  };
  const flags = [...(Array.isArray(post.flags) ? post.flags : []), flag];
  return {
    ...post,
    status: "Flagged",
    moderationStatus: "Flagged",
    moderation_status: "Flagged",
    verificationStatus: "flagged",
    verification_status: "flagged",
    visibility: "author_admin",
    flagged: true,
    flagCount: flags.length,
    flagReasons: [...new Set(flags.map((entry) => entry.reason))],
    flags,
    reportedAt: now,
    reportedBy: options.userId || "local-beta",
    updatedAt: now,
    updated_at: now,
  };
}

export function moderateTidepoolPost(post = {}, status = "Pending Review", options = {}) {
  const normalized = normalizeTidepoolPostStatus(status);
  const now = safeNow(options);
  const moderationReason = firstText(options.reason, post.moderationReason, post.moderation_reason);
  return {
    ...post,
    status: normalized,
    moderationStatus: normalized,
    moderation_status: normalized,
    verificationStatus: normalized === "Published" ? "published" : normalizeKey(normalized),
    verification_status: normalized === "Published" ? "published" : normalizeKey(normalized),
    visibility: tidepoolStatusVisibility(normalized),
    moderationReason,
    moderation_reason: moderationReason,
    adminReviewedBy: options.reviewer || post.adminReviewedBy || "",
    admin_reviewed_by: options.reviewer || post.admin_reviewed_by || "",
    adminReviewedAt: now,
    admin_reviewed_at: now,
    updatedAt: now,
    updated_at: now,
    hidden: normalized !== "Published",
    flagged: normalized === "Flagged" ? true : Boolean(post.flagged && normalized !== "Published"),
  };
}

export function tidepoolPostNeedsModeration(post = {}) {
  const status = normalizeTidepoolPostStatus(post);
  return ["Pending Review", "Flagged", "Needs Edit"].includes(status) || Boolean(post.flagged);
}

export function publicTidepoolPostSummary(post = {}) {
  const status = normalizeTidepoolPostStatus(post);
  return {
    postId: post.postId || post.id || "",
    category: normalizeTidepoolPostCategory(post.category || post.postType),
    status,
    visibility: post.visibility || tidepoolStatusVisibility(status),
    title: post.title || "",
    bodyPreview: String(post.body || "").slice(0, 180),
    author: publicUsernameLabelFromRecord(post, "community"),
    flagCount: Number(post.flagCount || (Array.isArray(post.flags) ? post.flags.length : 0) || 0),
  };
}
