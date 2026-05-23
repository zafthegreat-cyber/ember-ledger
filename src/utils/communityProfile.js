import {
  OFFICIAL_ADMIN_USERNAMES,
  formatPublicUsername,
  publicIdentityForProfile,
  publicUsernameFromProfile,
  publicUsernameLabelFromRecord,
} from "./publicIdentity.js";
import {
  MIN_SCOUT_POINTS_FOR_GUESS,
  canSubmitScoutGuess,
  getScoutPoints,
} from "./dropRadarUtils.mjs";

export const SCOUT_REPUTATION_LEVELS = [
  {
    key: "new_scout",
    label: "New Scout",
    minScoutPoints: 0,
    minConfirmedReports: 0,
    canSubmitCommunityGuesses: false,
    description: "Learning the flow. Confirmed reports build trust over time.",
  },
  {
    key: "active_scout",
    label: "Active Scout",
    minScoutPoints: 10,
    minConfirmedReports: 1,
    canSubmitCommunityGuesses: false,
    description: "Submitting useful reports and building local history.",
  },
  {
    key: "trusted_scout",
    label: "Trusted Scout",
    minScoutPoints: MIN_SCOUT_POINTS_FOR_GUESS,
    minConfirmedReports: 3,
    canSubmitCommunityGuesses: true,
    description: "Can help predict restock windows when enough confirmed history exists.",
  },
  {
    key: "veteran_scout",
    label: "Veteran Scout",
    minScoutPoints: 75,
    minConfirmedReports: 12,
    canSubmitCommunityGuesses: true,
    description: "Repeated useful reports with a strong trust pattern.",
  },
  {
    key: "community_guide",
    label: "Community Guide",
    minScoutPoints: 150,
    minConfirmedReports: 25,
    canSubmitCommunityGuesses: true,
    description: "A high-trust helper for fair collecting and local Scout quality.",
  },
];

export const COMMUNITY_TRUST_BADGES = {
  OFFICIAL_ADMIN: { key: "official_admin", label: "Official Admin", tone: "official" },
  TEAM: { key: "team", label: "Founder / Ember & Tide Team", tone: "official" },
  VERIFIED_SCOUT: { key: "verified_scout", label: "Verified Scout", tone: "success" },
  TRUSTED_REPORTER: { key: "trusted_reporter", label: "Trusted Reporter", tone: "tide" },
  HELPFUL_PARENT: { key: "helpful_parent", label: "Helpful Parent", tone: "gold" },
  KID_FRIENDLY_SUPPORTER: { key: "kid_friendly_supporter", label: "Kid-Friendly Supporter", tone: "gold" },
  FAMILY_FRIENDLY_SHOP: { key: "family_friendly_shop", label: "Family-Friendly Shop", tone: "gold" },
  LOCAL_SHOP_PARTNER: { key: "local_shop_partner", label: "Local Shop Partner", tone: "ember" },
  TOP_CONTRIBUTOR: { key: "top_contributor", label: "Top Contributor", tone: "ember" },
  NEW_SCOUT: { key: "new_scout", label: "New Scout", tone: "muted" },
  MARKETPLACE_SELLER: { key: "marketplace_seller", label: "Marketplace Seller", tone: "tide" },
};

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function userIdFromRecord(record = {}) {
  return String(
    record.userId ||
    record.user_id ||
    record.sellerUserId ||
    record.seller_user_id ||
    record.reporterUserId ||
    record.reporter_user_id ||
    record.profileReference ||
    record.id ||
    ""
  ).trim();
}

function usernameFromRecord(record = {}) {
  return publicUsernameFromProfile({
    publicUsername: record.publicUsername || record.public_username || record.username || record.sellerUsername || record.seller_username,
    displayName: record.displayName || record.display_name || record.sellerDisplayName || record.seller_display_name || record.reportedBy || record.reported_by,
    email: "",
  });
}

function recordMatchesProfile(record = {}, profile = {}) {
  const profileUserId = userIdFromRecord(profile);
  const recordUserId = userIdFromRecord(record);
  if (profileUserId && recordUserId && profileUserId === recordUserId) return true;
  const profileUsername = normalizeText(publicUsernameFromProfile(profile));
  const recordUsername = normalizeText(usernameFromRecord(record));
  return Boolean(profileUsername && recordUsername && profileUsername === recordUsername);
}

function statusText(row = {}) {
  return normalizeText(`${row.status || ""} ${row.verificationStatus || row.verification_status || ""} ${row.moderationStatus || row.moderation_status || ""}`);
}

export function scoutReportIsConfirmed(row = {}) {
  const status = statusText(row);
  return Boolean(row.verified || row.confirmed || status.includes("confirmed") || status.includes("verified"));
}

export function scoutReportIsRejected(row = {}) {
  const status = statusText(row);
  return Boolean(
    row.deletedAt ||
    row.deleted_at ||
    status.includes("rejected") ||
    status.includes("duplicate") ||
    status.includes("stale") ||
    status.includes("removed") ||
    status.includes("hidden")
  );
}

export function communityGuessIsApproved(row = {}) {
  const status = statusText(row);
  return status.includes("approved") || status.includes("converted");
}

function contributionDate(row = {}) {
  const value = row.observedAt || row.observed_at || row.updatedAt || row.updated_at || row.submittedAt || row.submitted_at || row.createdAt || row.created_at || row.reportedAt || row.reported_at || "";
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

export function buildContributionSummary(profile = {}, context = {}) {
  const scoutReports = (context.scoutReports || []).filter((row) => recordMatchesProfile(row, profile));
  const communityGuesses = (context.communityGuesses || []).filter((row) => recordMatchesProfile(row, profile));
  const marketplaceListings = (context.marketplaceListings || []).filter((row) => recordMatchesProfile(row, profile));
  const tidepoolPosts = (context.tidepoolPosts || []).filter((row) => recordMatchesProfile(row, profile));
  const confirmedReports = scoutReports.filter(scoutReportIsConfirmed).length;
  const rejectedReports = scoutReports.filter(scoutReportIsRejected).length;
  const approvedGuesses = communityGuesses.filter(communityGuessIsApproved).length;
  const explicitHelpful = Number(profile.helpfulReports || profile.helpful_reports || profile.helpfulCount || 0);
  const helpfulReports = Math.max(explicitHelpful, confirmedReports + approvedGuesses);
  const scoutPoints = getScoutPoints(profile, context.scoutProfile || {});
  const dates = [...scoutReports, ...communityGuesses, ...marketplaceListings, ...tidepoolPosts].map(contributionDate).filter(Boolean);
  const recentContributionAt = dates.length ? new Date(Math.max(...dates)).toISOString() : "";
  return {
    scoutPoints,
    confirmedReports,
    rejectedReports,
    helpfulReports,
    communityGuesses: communityGuesses.length,
    approvedGuesses,
    marketplaceListings: marketplaceListings.length,
    tidepoolPosts: tidepoolPosts.length,
    recentContributionAt,
  };
}

export function getScoutReputationLevel(input = {}, context = {}) {
  const summary = input.confirmedReports === undefined
    ? buildContributionSummary(input, context)
    : input;
  const points = Number(summary.scoutPoints || 0);
  const confirmed = Number(summary.confirmedReports || 0);
  return [...SCOUT_REPUTATION_LEVELS]
    .reverse()
    .find((level) => points >= level.minScoutPoints && confirmed >= level.minConfirmedReports) || SCOUT_REPUTATION_LEVELS[0];
}

function explicitVerifiedScout(profile = {}) {
  return Boolean(
    profile.verifiedScout ||
    profile.verified_scout ||
    profile.scoutVerified ||
    profile.scout_verified ||
    profile.scoutProfile?.verifiedScout ||
    profile.scoutProfile?.verified_scout
  );
}

function officialUsername(record = {}) {
  const identity = publicIdentityForProfile({
    ...record,
    publicUsername: record.publicUsername || record.public_username || record.username || usernameFromRecord(record),
  });
  const username = identity.username || "";
  if (identity.isOfficialAdminIdentity) return username;
  if (username === OFFICIAL_ADMIN_USERNAMES.ember || username === OFFICIAL_ADMIN_USERNAMES.tide) return username;
  return "";
}

function addBadge(badges, badge) {
  if (!badge || badges.some((entry) => entry.key === badge.key)) return;
  badges.push(badge);
}

export function buildCommunityTrustBadges(profile = {}, context = {}) {
  const summary = context.summary || buildContributionSummary(profile, context);
  const level = context.level || getScoutReputationLevel(summary);
  const badges = [];
  if (officialUsername(profile)) {
    addBadge(badges, COMMUNITY_TRUST_BADGES.OFFICIAL_ADMIN);
    addBadge(badges, COMMUNITY_TRUST_BADGES.TEAM);
  }
  if (explicitVerifiedScout(profile)) addBadge(badges, COMMUNITY_TRUST_BADGES.VERIFIED_SCOUT);
  if (["trusted_scout", "veteran_scout", "community_guide"].includes(level.key)) {
    addBadge(badges, COMMUNITY_TRUST_BADGES.TRUSTED_REPORTER);
  } else if (summary.scoutPoints > 0 || summary.confirmedReports > 0 || summary.communityGuesses > 0) {
    addBadge(badges, COMMUNITY_TRUST_BADGES.NEW_SCOUT);
  }
  if (level.key === "community_guide" || summary.helpfulReports >= 25) addBadge(badges, COMMUNITY_TRUST_BADGES.TOP_CONTRIBUTOR);
  if (summary.marketplaceListings > 0 || profile.sellerMode || profile.seller_mode || profile.userType === "seller") {
    addBadge(badges, COMMUNITY_TRUST_BADGES.MARKETPLACE_SELLER);
  }
  if (profile.helpfulParent || profile.helpful_parent || profile.kidsProgramSupport || profile.kids_program_support) {
    addBadge(badges, COMMUNITY_TRUST_BADGES.HELPFUL_PARENT);
  }
  if (profile.kidFriendlySupporter || profile.kid_friendly_supporter || profile.supportsKidsAccess) {
    addBadge(badges, COMMUNITY_TRUST_BADGES.KID_FRIENDLY_SUPPORTER);
  }
  if (profile.familyFriendlyApproved) addBadge(badges, COMMUNITY_TRUST_BADGES.FAMILY_FRIENDLY_SHOP);
  if (profile.localShopPartner || profile.local_shop_partner || profile.featuredPartner || profile.advertisingPartner) {
    addBadge(badges, COMMUNITY_TRUST_BADGES.LOCAL_SHOP_PARTNER);
  }
  return badges;
}

export function canSubmitCommunityGuessFromProfile(profile = {}, context = {}) {
  if (context.admin) return true;
  const summary = context.summary || buildContributionSummary(profile, context);
  return canSubmitScoutGuess({ scoutPoints: summary.scoutPoints });
}

export function buildPublicCommunityProfile(profile = {}, context = {}) {
  const recordUsername = usernameFromRecord(profile);
  const identity = publicIdentityForProfile({
    ...profile,
    publicUsername: profile.publicUsername || profile.public_username || profile.username || recordUsername,
  });
  const summary = buildContributionSummary(profile, context);
  const scoutLevel = getScoutReputationLevel(summary);
  const badges = buildCommunityTrustBadges(profile, { ...context, summary, level: scoutLevel });
  const formattedUsername = formatPublicUsername(identity.username || recordUsername);
  const label = identity.publicUsernameLabel || publicUsernameLabelFromRecord(profile, "community");
  const safeBio = String(profile.publicBio || profile.public_bio || profile.bio || "").slice(0, 160);
  return {
    username: identity.username || usernameFromRecord(profile),
    publicUsername: identity.publicUsername || identity.username || usernameFromRecord(profile),
    publicUsernameLabel: label,
    formattedUsername,
    avatarInitial: formattedUsername.replace(/[^a-z0-9]/gi, "").slice(0, 1).toUpperCase() || "C",
    scoutLevel,
    scoutPoints: summary.scoutPoints,
    confirmedReports: summary.confirmedReports,
    rejectedReports: summary.rejectedReports,
    helpfulReports: summary.helpfulReports,
    communityGuesses: summary.communityGuesses,
    approvedGuesses: summary.approvedGuesses,
    marketplaceListings: summary.marketplaceListings,
    tidepoolPosts: summary.tidepoolPosts,
    recentContributionAt: summary.recentContributionAt,
    badges,
    canSubmitCommunityGuesses: canSubmitCommunityGuessFromProfile(profile, { ...context, summary }),
    guessThreshold: MIN_SCOUT_POINTS_FOR_GUESS,
    publicBio: safeBio,
    isOfficialAdminIdentity: Boolean(identity.isOfficialAdminIdentity || officialUsername(profile)),
    contributionLine: `${summary.confirmedReports} confirmed report${summary.confirmedReports === 1 ? "" : "s"} | ${summary.communityGuesses} community guess${summary.communityGuesses === 1 ? "" : "es"} | ${summary.scoutPoints} Scout points`,
  };
}
