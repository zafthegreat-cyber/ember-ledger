import { containsOfficialImpersonation } from "./communitySafety.js";
import { buildPublicCommunityProfile } from "./communityProfile.js";
import { buildMarketplacePriceWarning } from "./pricingReliabilityUtils.js";
import { publicUsernameLabelFromRecord } from "./publicIdentity.js";

export const TIDETRADR_LISTING_STATUSES = [
  "Draft",
  "Active",
  "Pending Review",
  "Sold",
  "Paused",
  "Archived",
  "Rejected",
];

export const TIDETRADR_MODERATION_STATUSES = [
  "Draft",
  "Approved",
  "Pending Review",
  "Flagged",
  "Request Edit",
  "Rejected",
  "Archived",
];

export const TIDETRADR_REPORT_REASONS = [
  "Suspected scam",
  "Fake/counterfeit product",
  "Misleading price",
  "Private information",
  "Unsafe meetup",
  "Harassment/inappropriate content",
  "Duplicate listing",
  "Sold/unavailable",
  "Other",
];

export const TIDETRADR_MARKETPLACE_RULES = [
  "Be honest about item condition and quantity.",
  "Do not list fake, resealed, stolen, or counterfeit products.",
  "Do not claim official/admin status unless you are an Ember & Tide admin.",
  "Do not post private home addresses or private contact details.",
  "Use safe public meetup locations.",
  "Keep prices and communication respectful.",
  "Follow platform and community rules.",
  "Family-friendly behavior is required.",
];

const STATUS_ALIASES = new Map([
  ["draft", "Draft"],
  ["saved_draft", "Draft"],
  ["active", "Active"],
  ["public", "Active"],
  ["published", "Active"],
  ["approved", "Active"],
  ["pending", "Pending Review"],
  ["pending_review", "Pending Review"],
  ["submitted", "Pending Review"],
  ["needs_review", "Pending Review"],
  ["flagged", "Pending Review"],
  ["reported", "Pending Review"],
  ["sold", "Sold"],
  ["sold_unavailable", "Sold"],
  ["unavailable", "Sold"],
  ["traded", "Sold"],
  ["paused", "Paused"],
  ["hold", "Paused"],
  ["archived", "Archived"],
  ["removed", "Archived"],
  ["hidden", "Archived"],
  ["deleted", "Archived"],
  ["rejected", "Rejected"],
  ["denied", "Rejected"],
]);

const MODERATION_ALIASES = new Map([
  ["draft", "Draft"],
  ["approved", "Approved"],
  ["active", "Approved"],
  ["clear", "Approved"],
  ["verified", "Approved"],
  ["pending", "Pending Review"],
  ["pending_review", "Pending Review"],
  ["submitted", "Pending Review"],
  ["needs_review", "Pending Review"],
  ["flagged", "Flagged"],
  ["reported", "Flagged"],
  ["suspicious", "Flagged"],
  ["request_edit", "Request Edit"],
  ["needs_edit", "Request Edit"],
  ["edit_requested", "Request Edit"],
  ["rejected", "Rejected"],
  ["denied", "Rejected"],
  ["archived", "Archived"],
  ["removed", "Archived"],
  ["hidden", "Archived"],
]);

function normalizeKey(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function firstText(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function safeNow(options = {}) {
  return options.now || new Date().toISOString();
}

function listingText(listing = {}) {
  return [
    listing.title,
    listing.productName,
    listing.product_name,
    listing.description,
    listing.sellerNotes,
    listing.seller_notes,
    listing.locationNotes,
    listing.location_notes,
    listing.contactPreference,
    listing.contact_preference,
    listing.tags,
  ].filter(Boolean).join(" ");
}

function listingPrice(listing = {}) {
  return firstNumber(listing.askingPrice, listing.asking_price, listing.price, listing.tradeValue, listing.trade_value);
}

function listingQuantity(listing = {}) {
  return firstNumber(listing.quantity, listing.qty, 0);
}

function isFreeOrTradeListing(listing = {}) {
  const type = String(listing.listingType || listing.listing_type || "").toLowerCase();
  return type.includes("free") || type.includes("donation") || type.includes("trade") || type.includes("looking");
}

export function normalizeListingStatus(listingOrStatus = {}) {
  if (typeof listingOrStatus === "string") {
    const exact = TIDETRADR_LISTING_STATUSES.find((status) => status.toLowerCase() === listingOrStatus.trim().toLowerCase());
    return exact || STATUS_ALIASES.get(normalizeKey(listingOrStatus)) || "Draft";
  }
  if (listingOrStatus.deletedAt || listingOrStatus.deleted_at) return "Archived";
  const raw = firstText(
    listingOrStatus.status,
    listingOrStatus.listingStatus,
    listingOrStatus.listing_status,
    listingOrStatus.visibility
  );
  return normalizeListingStatus(raw);
}

export function normalizeListingModerationStatus(listingOrStatus = {}) {
  if (typeof listingOrStatus === "string") {
    const exact = TIDETRADR_MODERATION_STATUSES.find((status) => status.toLowerCase() === listingOrStatus.trim().toLowerCase());
    return exact || MODERATION_ALIASES.get(normalizeKey(listingOrStatus)) || "Pending Review";
  }
  if (listingOrStatus.flagged || Number(listingOrStatus.flagCount || listingOrStatus.flag_count || 0) > 0) return "Flagged";
  const raw = firstText(
    listingOrStatus.moderationStatus,
    listingOrStatus.moderation_status,
    listingOrStatus.reviewStatus,
    listingOrStatus.review_status,
    listingOrStatus.verificationStatus,
    listingOrStatus.verification_status,
    listingOrStatus.status
  );
  return normalizeListingModerationStatus(raw || normalizeListingStatus(listingOrStatus));
}

export function normalizeListingReportReason(value = "") {
  const raw = String(value || "").trim();
  const exact = TIDETRADR_REPORT_REASONS.find((reason) => reason.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  const key = normalizeKey(raw);
  if (key.includes("scam")) return "Suspected scam";
  if (key.includes("fake") || key.includes("counterfeit") || key.includes("reseal")) return "Fake/counterfeit product";
  if (key.includes("price") || key.includes("gouging") || key.includes("misleading")) return "Misleading price";
  if (key.includes("private") || key.includes("address") || key.includes("phone") || key.includes("email")) return "Private information";
  if (key.includes("unsafe") || key.includes("meetup") || key.includes("home")) return "Unsafe meetup";
  if (key.includes("harass") || key.includes("inappropriate") || key.includes("bully")) return "Harassment/inappropriate content";
  if (key.includes("duplicate")) return "Duplicate listing";
  if (key.includes("sold") || key.includes("unavailable")) return "Sold/unavailable";
  return "Other";
}

export function detectMarketplaceListingSafetyReason(listing = {}, options = {}) {
  const text = listingText(listing);
  if (!text.trim()) return "";
  if (containsOfficialImpersonation(text, { isOfficialAdmin: Boolean(options.isOfficialAdmin) })) {
    return "Misleading official/admin wording.";
  }
  if (/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/i.test(text) || /\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(text)) {
    return "Possible private contact information.";
  }
  if (/\b\d{1,6}\s+[a-z0-9 .'-]+\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|circle|cir|place|pl|way)\b/i.test(text)) {
    return "Possible exact home address.";
  }
  if (/\b(meet at my house|home pickup only|come to my home|kids only|come alone|no parents)\b/i.test(text)) {
    return "Unsafe meetup or family-safety language.";
  }
  if (/\b(counterfeit|fake card|replica|resealed|reseal|stolen|stole|scam|wire transfer only|gift card only|friends and family only)\b/i.test(text)) {
    return "Possible scam, fake product, or unsafe payment language.";
  }
  return "";
}

export function hasMarketplacePhoto(listing = {}) {
  const photos = Array.isArray(listing.photos) ? listing.photos : [];
  return Boolean(firstText(
    photos[0],
    listing.photoUrl,
    listing.photo_url,
    listing.imageUrl,
    listing.image_url,
    listing.catalogImage,
    listing.catalog_image
  ));
}

export function marketplaceFallbackPhotoLabel(listing = {}) {
  return firstText(
    listing.productType,
    listing.product_type,
    listing.setName,
    listing.set_name,
    listing.category,
    "Pokemon TCG item"
  );
}

export function buildMarketplaceListingQualityReport(listing = {}, options = {}) {
  const blockers = [];
  const warnings = [];
  const labels = [];
  const title = firstText(listing.title, listing.productName, listing.product_name);
  const quantity = listingQuantity(listing);
  const price = listingPrice(listing);
  const freeOrTrade = isFreeOrTradeListing(listing);
  const status = normalizeListingStatus(listing);
  const moderationStatus = normalizeListingModerationStatus(listing);
  const isDraft = status === "Draft" || options.requirePublicFields === false;
  const photoAvailable = hasMarketplacePhoto(listing);
  const fallbackLabel = marketplaceFallbackPhotoLabel(listing);
  const msrp = firstNumber(options.msrp, listing.msrp, listing.msrpPrice, listing.msrp_price);
  const marketValue = firstNumber(options.marketValue, listing.marketValue, listing.market_value, listing.referenceMarketValue, listing.reference_market_value);
  const referencePrice = marketValue > 0 ? marketValue : msrp;
  const safetyReason = detectMarketplaceListingSafetyReason(listing, options);

  if (!title) blockers.push("Add a clear item title or product name.");
  if (quantity < 1) blockers.push("Quantity must be at least 1.");
  if (!String(listing.condition || "").trim() || String(listing.condition || "").toLowerCase() === "unknown") {
    if (isDraft) warnings.push("Add condition before this listing goes public.");
    else blockers.push("Choose an item condition before submitting.");
  }
  if (!freeOrTrade && price <= 0) {
    if (isDraft) warnings.push("Add an asking price before this listing goes public.");
    else blockers.push("Add a valid asking price before submitting.");
  }
  if (price < 0) blockers.push("Price cannot be negative.");
  if (safetyReason) blockers.push(safetyReason);

  if (!photoAvailable) {
    warnings.push(`No listing photo yet; Ember & Tide will show a branded ${fallbackLabel} fallback.`);
  }
  if (!firstText(listing.productType, listing.product_type)) warnings.push("Add a product type so buyers can scan the listing quickly.");
  const priceWarning = buildMarketplacePriceWarning(listing, { marketValue, msrp });
  if (priceWarning && referencePrice > 0 && price > 0 && !freeOrTrade) {
    warnings.push(priceWarning);
    labels.push({
      key: price > referencePrice ? "high_price_review" : "low_price_review",
      label: "Price Review",
      tone: "warning",
    });
  }

  if (moderationStatus === "Flagged") labels.push({ key: "flagged", label: "Flagged", tone: "warning" });
  if (status === "Pending Review") labels.push({ key: "pending_review", label: "Pending Review", tone: "needs-review" });
  if (status === "Rejected") labels.push({ key: "rejected", label: "Rejected", tone: "danger" });
  if (photoAvailable) labels.push({ key: "photo_ready", label: "Photo Ready", tone: "success" });
  else labels.push({ key: "fallback_photo", label: "Image Fallback", tone: "muted" });

  const score = Math.max(0, 100 - blockers.length * 35 - warnings.length * 8);
  return {
    status,
    moderationStatus,
    blockers,
    warnings,
    labels,
    score,
    canActivate: blockers.length === 0,
    needsAdminReview: blockers.length > 0 || warnings.some((warning) => /price|official|unsafe|private|scam|fake/i.test(warning)),
    photoAvailable,
    fallbackLabel,
    primaryPrice: price,
  };
}

export function buildMarketplaceReport(listing = {}, options = {}) {
  const now = safeNow(options);
  const reason = normalizeListingReportReason(options.reason || "Other");
  return {
    id: options.id || `listing-report-${Date.now()}`,
    listingId: firstText(listing.id, listing.listingId, listing.listing_id),
    listingTitle: firstText(listing.title, listing.productName, "Marketplace listing"),
    reason,
    details: String(options.details || "").trim().slice(0, 800),
    reportedBy: options.userId || "local-beta",
    reporterPublicUsername: options.publicUsername || "",
    createdAt: now,
    status: "Open",
    visibility: "admin_review",
  };
}

export function flagMarketplaceListing(listing = {}, options = {}) {
  const now = safeNow(options);
  const reason = normalizeListingReportReason(options.reason || "Other");
  const flag = {
    flagId: options.flagId || `listing-flag-${Date.now()}`,
    reason,
    details: String(options.details || "").trim().slice(0, 800),
    flaggedBy: options.userId || "local-beta",
    reporterPublicUsername: options.publicUsername || "",
    createdAt: now,
  };
  const flags = [...(Array.isArray(listing.flags) ? listing.flags : []), flag];
  return {
    ...listing,
    status: "Pending Review",
    moderationStatus: "Flagged",
    moderation_status: "Flagged",
    verificationStatus: "flagged",
    verification_status: "flagged",
    flagged: true,
    flagCount: flags.length,
    flag_count: flags.length,
    reportCount: Number(listing.reportCount || listing.report_count || 0) + 1,
    flagReasons: [...new Set(flags.map((entry) => entry.reason))],
    flags,
    reportedAt: now,
    reportedBy: options.userId || "local-beta",
    updatedAt: now,
    updated_at: now,
  };
}

export function moderateMarketplaceListing(listing = {}, action = "Pending Review", options = {}) {
  const now = safeNow(options);
  const key = normalizeKey(action);
  let status = normalizeListingStatus(action);
  let moderationStatus = normalizeListingModerationStatus(action);
  if (["approve", "approved", "active"].includes(key)) {
    status = "Active";
    moderationStatus = "Approved";
  } else if (["reject", "rejected", "deny", "denied"].includes(key)) {
    status = "Rejected";
    moderationStatus = "Rejected";
  } else if (["request_edit", "needs_edit", "edit_requested"].includes(key)) {
    status = "Pending Review";
    moderationStatus = "Request Edit";
  } else if (["pause", "paused"].includes(key)) {
    status = "Paused";
    moderationStatus = "Approved";
  } else if (["archive", "archived", "remove", "removed"].includes(key)) {
    status = "Archived";
    moderationStatus = "Archived";
  } else if (["sold", "sold_unavailable"].includes(key)) {
    status = "Sold";
    moderationStatus = normalizeListingModerationStatus(listing) === "Flagged" ? "Flagged" : "Approved";
  }

  return {
    ...listing,
    status,
    moderationStatus,
    moderation_status: moderationStatus,
    verificationStatus: moderationStatus === "Approved" ? "approved" : normalizeKey(moderationStatus),
    verification_status: moderationStatus === "Approved" ? "approved" : normalizeKey(moderationStatus),
    moderationReason: firstText(options.reason, listing.moderationReason, listing.moderation_reason),
    moderation_reason: firstText(options.reason, listing.moderationReason, listing.moderation_reason),
    reviewedBy: options.reviewer || listing.reviewedBy || "",
    reviewedAt: now,
    statusUpdatedAt: now,
    statusUpdatedBy: options.reviewer || listing.statusUpdatedBy || "",
    updatedAt: now,
    updated_at: now,
    ...(status === "Sold" ? { soldAt: now } : {}),
    ...(status === "Archived" ? { archivedAt: now } : {}),
    ...(status === "Rejected" ? { rejectedAt: now } : {}),
    ...(status === "Paused" ? { pausedAt: now } : {}),
  };
}

export function listingNeedsMarketplaceReview(listing = {}, options = {}) {
  const status = normalizeListingStatus(listing);
  const moderationStatus = normalizeListingModerationStatus(listing);
  if (["Pending Review", "Rejected"].includes(status)) return true;
  if (["Flagged", "Request Edit", "Rejected"].includes(moderationStatus)) return true;
  const quality = buildMarketplaceListingQualityReport(listing, options);
  return quality.blockers.length > 0 || quality.needsAdminReview;
}

export function sanitizeMarketplaceListingForViewer(listing = {}, options = {}) {
  if (options.isAdmin) return listing;
  const {
    adminNotes,
    admin_notes,
    internalNotes,
    internal_notes,
    moderation_note,
    reviewerEmail,
    reporterEmail,
    sellerEmail,
    email,
    ...safe
  } = listing || {};
  const flags = Array.isArray(safe.flags)
    ? safe.flags.map((flag) => ({
        reason: normalizeListingReportReason(flag.reason),
        createdAt: flag.createdAt || "",
      }))
    : [];
  return {
    ...safe,
    flags,
  };
}

export function sellerTrustSummaryForListing(listing = {}, context = {}) {
  const profile = buildPublicCommunityProfile({
    ...listing,
    publicUsername: listing.sellerUsername || listing.seller_username || listing.publicUsername || listing.public_username,
    displayName: listing.sellerDisplayName || listing.seller_display_name,
    email: "",
    userType: "seller",
  }, context);
  return {
    ...profile,
    sellerLabel: publicUsernameLabelFromRecord(listing, "seller"),
  };
}

export function publicMarketplaceListingSummary(listing = {}, options = {}) {
  const safe = sanitizeMarketplaceListingForViewer(listing, options);
  const quality = buildMarketplaceListingQualityReport(safe, options);
  return {
    id: firstText(safe.id, safe.listingId),
    title: firstText(safe.title, safe.productName, "Marketplace listing"),
    status: normalizeListingStatus(safe),
    moderationStatus: normalizeListingModerationStatus(safe),
    seller: publicUsernameLabelFromRecord(safe, "seller"),
    price: listingPrice(safe),
    quantity: listingQuantity(safe),
    qualityScore: quality.score,
    warnings: quality.warnings,
    blockers: quality.blockers,
    flagCount: Number(safe.flagCount || safe.flag_count || 0),
  };
}
