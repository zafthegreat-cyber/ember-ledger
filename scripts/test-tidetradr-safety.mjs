import assert from "node:assert/strict";
import {
  TIDETRADR_MARKETPLACE_RULES,
  buildMarketplaceListingQualityReport,
  buildMarketplaceReport,
  detectMarketplaceListingSafetyReason,
  flagMarketplaceListing,
  listingNeedsMarketplaceReview,
  moderateMarketplaceListing,
  normalizeListingModerationStatus,
  normalizeListingReportReason,
  normalizeListingStatus,
  publicMarketplaceListingSummary,
  sanitizeMarketplaceListingForViewer,
} from "../src/utils/tidetradrMarketplaceSafety.js";

const baseListing = {
  id: "listing-1",
  title: "Prismatic Evolutions Elite Trainer Box",
  productType: "Elite Trainer Box",
  setName: "Prismatic Evolutions",
  listingType: "For Sale",
  condition: "Sealed",
  quantity: 1,
  askingPrice: 59.99,
  photos: ["https://example.com/etb.png"],
  sellerUsername: "trusted_scout",
  sellerDisplayName: "Trusted Scout",
  status: "Pending Review",
  moderationStatus: "Pending Review",
  description: "Local public meetup only.",
};

assert.equal(normalizeListingStatus("Flagged"), "Pending Review");
assert.equal(normalizeListingStatus("Removed"), "Archived");
assert.equal(normalizeListingStatus("Traded"), "Sold");
assert.equal(normalizeListingModerationStatus({ flagged: true, status: "Active" }), "Flagged");
assert.equal(normalizeListingReportReason("price gouging"), "Misleading price");
assert.equal(normalizeListingReportReason("counterfeit cards"), "Fake/counterfeit product");
assert.equal(normalizeListingReportReason("home address"), "Private information");

const quality = buildMarketplaceListingQualityReport(baseListing, { marketValue: 65, msrp: 49.99 });
assert.equal(quality.canActivate, true);
assert.equal(quality.blockers.length, 0);
assert.ok(quality.score >= 80);

const missingPrice = buildMarketplaceListingQualityReport({ ...baseListing, askingPrice: 0 }, { requirePublicFields: true });
assert.match(missingPrice.blockers.join(" "), /asking price/i);

const highPrice = buildMarketplaceListingQualityReport({ ...baseListing, askingPrice: 250 }, { marketValue: 60 });
assert.match(highPrice.warnings.join(" "), /Double-check this price/i);

const noPhoto = buildMarketplaceListingQualityReport({ ...baseListing, photos: [], photoUrl: "" });
assert.match(noPhoto.warnings.join(" "), /branded Elite Trainer Box fallback/i);

assert.match(
  detectMarketplaceListingSafetyReason({ ...baseListing, title: "Official Admin Tide ETB" }),
  /official\/admin/i
);
assert.equal(
  detectMarketplaceListingSafetyReason({ ...baseListing, title: "Official Admin Tide ETB" }, { isOfficialAdmin: true }),
  ""
);
assert.match(
  detectMarketplaceListingSafetyReason({ ...baseListing, description: "Meet at 123 Main Street tonight." }),
  /address/i
);

const flagged = flagMarketplaceListing(baseListing, {
  reason: "fake",
  details: "Looks resealed.",
  userId: "reporter-1",
  publicUsername: "helpful_parent",
  now: "2026-05-21T12:00:00.000Z",
});
assert.equal(flagged.status, "Pending Review");
assert.equal(flagged.moderationStatus, "Flagged");
assert.equal(flagged.flagCount, 1);
assert.equal(flagged.title, baseListing.title, "flagging must not hard-delete listing content");
assert.equal(normalizeListingReportReason(flagged.flagReasons[0]), "Fake/counterfeit product");

const report = buildMarketplaceReport(baseListing, {
  reason: "unsafe meetup",
  details: "Asked for home pickup.",
  userId: "reporter-1",
  publicUsername: "helpful_parent",
  now: "2026-05-21T12:00:00.000Z",
});
assert.equal(report.reason, "Unsafe meetup");
assert.equal(report.status, "Open");
assert.equal(JSON.stringify(report).includes("@"), false, "public report payload should not include email addresses");

const approved = moderateMarketplaceListing(flagged, "approve", {
  reviewer: "official admin ember",
  now: "2026-05-21T12:30:00.000Z",
});
assert.equal(approved.status, "Active");
assert.equal(approved.moderationStatus, "Approved");

const requestedEdit = moderateMarketplaceListing(baseListing, "request edit", { reason: "Need clearer photo." });
assert.equal(requestedEdit.status, "Pending Review");
assert.equal(requestedEdit.moderationStatus, "Request Edit");

const rejected = moderateMarketplaceListing(baseListing, "Rejected", { reason: "Unsafe language." });
assert.equal(rejected.status, "Rejected");
assert.equal(listingNeedsMarketplaceReview(rejected), true);

const safeForPublic = sanitizeMarketplaceListingForViewer({
  ...baseListing,
  sellerEmail: "seller@example.com",
  adminNotes: "private mod note",
  flags: [{ reason: "scam", flaggedBy: "reporter-1", reporterEmail: "private@example.com" }],
});
assert.equal(JSON.stringify(safeForPublic).includes("seller@example.com"), false);
assert.equal(JSON.stringify(safeForPublic).includes("private mod note"), false);
assert.equal(JSON.stringify(safeForPublic).includes("reporter-1"), false);

const summary = publicMarketplaceListingSummary(baseListing);
assert.equal(summary.seller, "@trusted_scout");
assert.equal(summary.title, baseListing.title);
assert.ok(!JSON.stringify(summary).includes("email"));

assert.ok(TIDETRADR_MARKETPLACE_RULES.some((rule) => /counterfeit/i.test(rule)));
assert.ok(TIDETRADR_MARKETPLACE_RULES.some((rule) => /home addresses/i.test(rule)));

console.log("TideTradr safety tests passed.");
