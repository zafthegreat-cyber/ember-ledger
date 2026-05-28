import assert from "node:assert/strict";
import fs from "node:fs";
import {
  applyEmberAssistMessageStatus,
  applyShopReviewPatch,
  buildAdminCommandCenterSummary,
  filterAdminRowsForViewer,
  normalizeEmberAssistMessageStatus,
  normalizeScoutReportModerationStatus,
  normalizeShopReviewStatus,
  sanitizeAdminPayloadForViewer,
  scoutReportFeedsPredictions,
  shopReviewBadges,
} from "../src/utils/adminCommandCenterUtils.js";

const app = fs.readFileSync("src/App.jsx", "utf8");

const confirmedReport = {
  id: "report-1",
  storeId: "redmill-target",
  storeName: "Redmill Target",
  reportDate: "2026-05-12",
  reportTime: "15:24",
  stockStatus: "in_stock",
  sourceType: "user_report",
  confidence: "confirmed",
  verificationStatus: "confirmed",
};

assert.equal(normalizeScoutReportModerationStatus(confirmedReport), "Confirmed");
assert.equal(scoutReportFeedsPredictions(confirmedReport), true);
assert.equal(scoutReportFeedsPredictions({ ...confirmedReport, status: "rejected" }), false);
assert.equal(scoutReportFeedsPredictions({ ...confirmedReport, verificationStatus: "duplicate" }), false);
assert.equal(scoutReportFeedsPredictions({ ...confirmedReport, verificationStatus: "stale" }), false);

assert.deepEqual(filterAdminRowsForViewer([confirmedReport], { isAdmin: false }), []);
assert.equal(filterAdminRowsForViewer([confirmedReport], { isAdmin: true }).length, 1);
const sanitized = sanitizeAdminPayloadForViewer({
  question: "Why is my report wrong?",
  reporterEmail: "private@example.com",
  adminNotes: "Internal note",
}, { isAdmin: false });
assert.equal(sanitized.reporterEmail, undefined);
assert.equal(sanitized.adminNotes, undefined);
assert.equal(sanitized.question, "Why is my report wrong?");

assert.equal(normalizeEmberAssistMessageStatus("Submitted"), "New");
assert.equal(normalizeEmberAssistMessageStatus("Under Review"), "In Progress");
assert.equal(normalizeEmberAssistMessageStatus("Approved"), "Resolved");
assert.equal(normalizeEmberAssistMessageStatus("Merged"), "Archived");
const resolvedMessage = applyEmberAssistMessageStatus({ id: "assist-1", status: "Submitted" }, "Resolved", { now: "2026-05-21T12:00:00.000Z", reviewer: "official admin ember" });
assert.equal(resolvedMessage.status, "Resolved");
assert.equal(resolvedMessage.reviewedBy, "official admin ember");

const shop = {
  id: "family-shop",
  name: "Family Table TCG",
  storeGroup: "Local Card Shops",
  store_type: "Local Card Shop",
  familyFriendlyApproved: false,
  supportsKidsAccess: true,
};
assert.equal(normalizeShopReviewStatus(shop), "Needs Review");
const approvedShop = applyShopReviewPatch(shop, {
  reviewStatus: "Approved",
  familyFriendlyApproved: true,
  supportsMsrpOrReasonablePricing: true,
  offersKidEvents: true,
}, { now: "2026-05-21T12:00:00.000Z", reviewer: "official admin tide" });
assert.equal(normalizeShopReviewStatus(approvedShop), "Approved");
assert.deepEqual(shopReviewBadges(approvedShop).map((badge) => badge.label), [
  "Family-Friendly",
  "Kids Access",
  "Reasonable Pricing",
  "Kid Events",
]);

const summary = buildAdminCommandCenterSummary({
  scoutReports: [
    { ...confirmedReport, id: "confirmed" },
    { ...confirmedReport, id: "needs-review", verificationStatus: "needs_review", confidence: "possible" },
    { ...confirmedReport, id: "rejected", verificationStatus: "rejected" },
  ],
  communityGuesses: [{ id: "guess-1", status: "pending" }],
  assistMessages: [{ id: "assist-1", status: "Submitted" }],
  stores: [shop],
  feedback: [{ id: "feedback-1" }],
  errors: [{ id: "error-1" }],
});
assert.equal(summary.pendingScoutReports, 1);
assert.equal(summary.predictionEligibleReports, 1);
assert.equal(summary.pendingCommunityGuesses, 1);
assert.equal(summary.openAssistMessages, 1);
assert.equal(summary.shopsNeedingReview, 1);
assert.equal(summary.totalOpen, 6);

for (const label of [
  "Beta Requests",
  "Invites",
  "Scout Report Review",
  "Missing Catalog Requests",
  "Feedback Inbox",
  "Moderation / Flagged Content",
  "Kids Program Requests",
  "Family-friendly Shop Approvals",
  "User / Role Controls",
]) {
  assert.match(app, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Admin Command Center should expose ${label}`);
}
assert.match(app, /adminQueueSearch/, "Admin Command Center should provide search/filter over priority queues");
assert.match(app, /admin-essential-queue-grid/, "Admin Command Center should render a compact priority queue grid");
assert.match(app, /Permission Denied/, "Non-admin users should see a permission denied state instead of admin tools");

console.log("Admin Command Center utility tests passed.");
