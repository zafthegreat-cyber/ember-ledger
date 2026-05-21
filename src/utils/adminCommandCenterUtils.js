import {
  isDropRadarCommunityGuess,
  isDropRadarConfirmedTrainingEntry,
  isDropRadarPlaceholderForecast,
  isDropRadarRejectedOrDeleted,
} from "./dropRadarUtils.mjs";
import {
  getStoreFamilyFriendlyBadges,
  isLocalCommunityShop,
  normalizeStoreExpansionFields,
} from "./storeExpansionUtils.js";

export const SCOUT_REPORT_MODERATION_STATUSES = [
  "Confirmed",
  "Rejected",
  "Needs Review",
  "Duplicate",
  "Stale",
];

export const COMMUNITY_GUESS_MODERATION_STATUSES = [
  "Pending",
  "Approved as Community Guess",
  "Rejected",
  "Expired",
  "Converted to Confirmed",
];

export const EMBER_ASSIST_MESSAGE_STATUSES = [
  "New",
  "In Progress",
  "Resolved",
  "Archived",
];

export const SHOP_REVIEW_STATUSES = [
  "Needs Review",
  "Approved",
  "Rejected",
  "Inactive",
];

export const ADMIN_COMMAND_CENTER_FILTERS = [
  "All",
  "Trust Command Center",
  "Scout Report Moderation",
  "Community Guess Review",
  "Ember Assist Inbox",
  "Family-Friendly Shop Review",
  "User Issues",
  "System Health / Logs",
];

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nowIso(options = {}) {
  return options.now || new Date().toISOString();
}

export function normalizeScoutReportModerationStatus(reportOrStatus = {}) {
  const raw = typeof reportOrStatus === "string"
    ? reportOrStatus
    : [
        reportOrStatus.moderationStatus,
        reportOrStatus.moderation_status,
        reportOrStatus.verificationStatus,
        reportOrStatus.verification_status,
        reportOrStatus.status,
        reportOrStatus.adminDecision,
        reportOrStatus.admin_decision,
      ].filter(Boolean).join(" ");
  const text = normalizeText(raw);
  if (text.includes("duplicate")) return "Duplicate";
  if (text.includes("stale") || text.includes("disputed") || text.includes("expired")) return "Stale";
  if (text.includes("reject") || text.includes("hidden") || text.includes("removed") || text.includes("delete")) return "Rejected";
  if (text.includes("confirm") || text.includes("verified") || text === "approved") return "Confirmed";
  if (text.includes("review") || text.includes("pending") || text.includes("unverified")) return "Needs Review";
  if (reportOrStatus?.verified === true) return "Confirmed";
  return "Needs Review";
}

export function scoutReportFeedsPredictions(report = {}) {
  const status = normalizeScoutReportModerationStatus(report);
  if (["Rejected", "Duplicate", "Stale", "Needs Review"].includes(status)) return false;
  if (isDropRadarCommunityGuess(report) || isDropRadarPlaceholderForecast(report) || isDropRadarRejectedOrDeleted(report)) return false;
  return isDropRadarConfirmedTrainingEntry({
    ...report,
    status: "confirmed",
    verificationStatus: "confirmed",
    verification_status: "confirmed",
  });
}

export function applyScoutReportModerationStatus(report = {}, status = "Needs Review", options = {}) {
  const normalized = normalizeScoutReportModerationStatus(status);
  const now = nowIso(options);
  const reviewer = options.reviewer || "local-beta-admin";
  const base = {
    ...report,
    moderationStatus: normalized,
    moderation_status: normalized,
    adminDecision: normalized,
    admin_decision: normalized,
    adminReviewedBy: reviewer,
    admin_reviewed_by: reviewer,
    adminReviewedAt: now,
    admin_reviewed_at: now,
    adminUpdatedAt: now,
    admin_updated_at: now,
    updatedAt: now,
    updated_at: now,
  };

  if (normalized === "Confirmed") {
    return {
      ...base,
      verificationStatus: "confirmed",
      verification_status: "confirmed",
      status: "active",
      verified: true,
      hidden: false,
      adminRemoved: false,
      admin_removed: false,
      duplicate: false,
      stale: false,
      needsReview: false,
      needs_review: false,
      shouldTrainPredictions: true,
      affectsDropRadarPredictions: true,
      affects_drop_radar_predictions: true,
    };
  }

  if (normalized === "Rejected") {
    return {
      ...base,
      verificationStatus: "rejected",
      verification_status: "rejected",
      status: "hidden",
      verified: false,
      hidden: true,
      adminRemoved: false,
      admin_removed: false,
      needsReview: false,
      needs_review: false,
      shouldTrainPredictions: false,
      affectsDropRadarPredictions: false,
      affects_drop_radar_predictions: false,
    };
  }

  if (normalized === "Duplicate") {
    return {
      ...base,
      verificationStatus: "duplicate",
      verification_status: "duplicate",
      status: "duplicate",
      verified: false,
      hidden: true,
      duplicate: true,
      needsReview: false,
      needs_review: false,
      shouldTrainPredictions: false,
      affectsDropRadarPredictions: false,
      affects_drop_radar_predictions: false,
    };
  }

  if (normalized === "Stale") {
    return {
      ...base,
      verificationStatus: "stale",
      verification_status: "stale",
      status: "stale",
      verified: false,
      hidden: false,
      stale: true,
      needsReview: false,
      needs_review: false,
      shouldTrainPredictions: false,
      affectsDropRadarPredictions: false,
      affects_drop_radar_predictions: false,
    };
  }

  return {
    ...base,
    verificationStatus: "needs_review",
    verification_status: "needs_review",
    status: "pending",
    verified: false,
    hidden: false,
    needsReview: true,
    needs_review: true,
    shouldTrainPredictions: false,
    affectsDropRadarPredictions: false,
    affects_drop_radar_predictions: false,
  };
}

export function normalizeCommunityGuessModerationStatus(guessOrStatus = {}) {
  const raw = typeof guessOrStatus === "string"
    ? guessOrStatus
    : [
        guessOrStatus.moderationStatus,
        guessOrStatus.moderation_status,
        guessOrStatus.verificationStatus,
        guessOrStatus.verification_status,
        guessOrStatus.status,
      ].filter(Boolean).join(" ");
  const text = normalizeText(raw);
  if (text.includes("convert") || text.includes("confirmed")) return "Converted to Confirmed";
  if (text.includes("approve")) return "Approved as Community Guess";
  if (text.includes("reject") || text.includes("hidden") || text.includes("removed")) return "Rejected";
  if (text.includes("expire") || text.includes("stale")) return "Expired";
  return "Pending";
}

export function communityGuessFeedsPredictions(guess = {}) {
  return normalizeCommunityGuessModerationStatus(guess) === "Converted to Confirmed"
    && isDropRadarConfirmedTrainingEntry(guess);
}

export function applyCommunityGuessModerationStatus(guess = {}, status = "Pending", options = {}) {
  const normalized = normalizeCommunityGuessModerationStatus(status);
  const now = nowIso(options);
  const reviewer = options.reviewer || "local-beta-admin";
  const base = {
    ...guess,
    moderationStatus: normalized,
    moderation_status: normalized,
    adminReviewedBy: reviewer,
    admin_reviewed_by: reviewer,
    adminReviewedAt: now,
    admin_reviewed_at: now,
    updatedAt: now,
    updated_at: now,
  };

  if (normalized === "Converted to Confirmed") {
    return {
      ...base,
      recordType: "confirmed_restock",
      record_type: "confirmed_restock",
      recordKind: "confirmed_restock",
      eventType: "Confirmed Restock",
      reportType: "Store Restock Report",
      report_type: "Store Restock Report",
      sourceType: "admin_verified_report",
      source_type: "admin_verified_report",
      confidence: "confirmed",
      confidenceLabel: "Confirmed",
      stockStatus: "in_stock",
      stock_status: "in_stock",
      status: "confirmed",
      verificationStatus: "confirmed",
      verification_status: "confirmed",
      verified: true,
      hidden: false,
      shouldTrainPredictions: true,
      trainingEligible: true,
      affectsDropRadarPredictions: true,
    };
  }

  if (normalized === "Approved as Community Guess") {
    return {
      ...base,
      recordType: "guess",
      record_type: "guess",
      recordKind: "community_guess",
      eventType: "Community Guess",
      status: "approved_community_guess",
      verificationStatus: "approved_community_guess",
      verification_status: "approved_community_guess",
      verified: false,
      hidden: false,
      shouldTrainPredictions: false,
      trainingEligible: false,
      affectsDropRadarPredictions: false,
    };
  }

  if (normalized === "Rejected") {
    return {
      ...base,
      recordKind: "community_guess",
      status: "rejected",
      verificationStatus: "rejected",
      verification_status: "rejected",
      verified: false,
      hidden: true,
      shouldTrainPredictions: false,
      trainingEligible: false,
      affectsDropRadarPredictions: false,
    };
  }

  if (normalized === "Expired") {
    return {
      ...base,
      recordKind: "community_guess",
      status: "expired",
      verificationStatus: "expired",
      verification_status: "expired",
      verified: false,
      hidden: false,
      shouldTrainPredictions: false,
      trainingEligible: false,
      affectsDropRadarPredictions: false,
    };
  }

  return {
    ...base,
    recordKind: "community_guess",
    status: "pending",
    verificationStatus: "pending",
    verification_status: "pending",
    verified: false,
    hidden: false,
    shouldTrainPredictions: false,
    trainingEligible: false,
    affectsDropRadarPredictions: false,
  };
}

export function normalizeEmberAssistMessageStatus(messageOrStatus = {}) {
  const raw = typeof messageOrStatus === "string" ? messageOrStatus : messageOrStatus.status;
  const text = normalizeText(raw);
  if (text.includes("progress") || text.includes("review")) return "In Progress";
  if (text.includes("resolve") || text.includes("answer") || text.includes("approved")) return "Resolved";
  if (text.includes("archive") || text.includes("closed") || text.includes("merged")) return "Archived";
  return "New";
}

export function applyEmberAssistMessageStatus(message = {}, status = "New", options = {}) {
  const normalized = normalizeEmberAssistMessageStatus(status);
  const now = nowIso(options);
  return {
    ...message,
    status: normalized,
    adminMessageStatus: normalized,
    admin_message_status: normalized,
    reviewedBy: options.reviewer || message.reviewedBy || "",
    reviewedAt: now,
    updatedAt: now,
  };
}

export function normalizeShopReviewStatus(storeOrStatus = {}) {
  const raw = typeof storeOrStatus === "string"
    ? storeOrStatus
    : [
        storeOrStatus.reviewStatus,
        storeOrStatus.review_status,
        storeOrStatus.status,
        storeOrStatus.familyFriendlyApproved ? "approved" : "",
        storeOrStatus.active === false || storeOrStatus.isActive === false || storeOrStatus.is_active === false ? "inactive" : "",
      ].filter(Boolean).join(" ");
  const text = normalizeText(raw);
  if (text.includes("inactive") || text.includes("closed") || text.includes("archived")) return "Inactive";
  if (text.includes("reject") || text.includes("deny")) return "Rejected";
  if (text.includes("approve") || text.includes("family friendly")) return "Approved";
  return "Needs Review";
}

export function shopReviewBadges(store = {}) {
  const normalized = normalizeStoreExpansionFields(store);
  if (!isLocalCommunityShop(normalized)) return [];
  return getStoreFamilyFriendlyBadges(normalized);
}

export function applyShopReviewPatch(store = {}, patch = {}, options = {}) {
  const now = nowIso(options);
  const requestedStatus = normalizeShopReviewStatus(patch.reviewStatus || patch.status || store.reviewStatus || "Needs Review");
  const active = requestedStatus === "Inactive" ? false : patch.active ?? patch.isActive ?? store.active ?? store.isActive ?? true;
  return normalizeStoreExpansionFields({
    ...store,
    ...patch,
    active,
    isActive: active,
    is_active: active,
    reviewStatus: requestedStatus,
    review_status: requestedStatus,
    familyFriendlyApproved: requestedStatus === "Approved" ? Boolean(patch.familyFriendlyApproved ?? store.familyFriendlyApproved ?? true) : Boolean(patch.familyFriendlyApproved ?? store.familyFriendlyApproved),
    family_friendly_approved: requestedStatus === "Approved" ? Boolean(patch.familyFriendlyApproved ?? store.family_friendly_approved ?? true) : Boolean(patch.familyFriendlyApproved ?? store.family_friendly_approved),
    partnerNotes: patch.partnerNotes ?? patch.partner_notes ?? store.partnerNotes ?? store.partner_notes ?? "",
    partner_notes: patch.partnerNotes ?? patch.partner_notes ?? store.partnerNotes ?? store.partner_notes ?? "",
    adminReviewedBy: options.reviewer || store.adminReviewedBy || "",
    admin_reviewed_by: options.reviewer || store.admin_reviewed_by || "",
    adminReviewedAt: now,
    admin_reviewed_at: now,
    updatedAt: now,
    updated_at: now,
  });
}

export function filterAdminRowsForViewer(rows = [], options = {}) {
  return options.isAdmin ? rows : [];
}

export function sanitizeAdminPayloadForViewer(payload = {}, options = {}) {
  if (options.isAdmin) return payload;
  const {
    adminNotes,
    admin_notes,
    internalNotes,
    internal_notes,
    reporterEmail,
    userEmail,
    email,
    ...safe
  } = payload || {};
  return safe;
}

export function buildAdminCommandCenterSummary({
  scoutReports = [],
  communityGuesses = [],
  assistMessages = [],
  stores = [],
  feedback = [],
  errors = [],
} = {}) {
  const pendingScoutReports = scoutReports.filter((report) => normalizeScoutReportModerationStatus(report) === "Needs Review");
  const predictionEligibleReports = scoutReports.filter(scoutReportFeedsPredictions);
  const pendingGuesses = communityGuesses.filter((guess) => normalizeCommunityGuessModerationStatus(guess) === "Pending");
  const openAssistMessages = assistMessages.filter((message) => ["New", "In Progress"].includes(normalizeEmberAssistMessageStatus(message)));
  const shopsNeedingReview = stores
    .map(normalizeStoreExpansionFields)
    .filter((store) => isLocalCommunityShop(store) && normalizeShopReviewStatus(store) === "Needs Review");

  return {
    pendingScoutReports: pendingScoutReports.length,
    predictionEligibleReports: predictionEligibleReports.length,
    pendingCommunityGuesses: pendingGuesses.length,
    openAssistMessages: openAssistMessages.length,
    shopsNeedingReview: shopsNeedingReview.length,
    userIssues: feedback.length,
    systemWarnings: errors.length,
    totalOpen:
      pendingScoutReports.length +
      pendingGuesses.length +
      openAssistMessages.length +
      shopsNeedingReview.length +
      feedback.length +
      errors.length,
  };
}
