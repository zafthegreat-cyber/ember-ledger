import assert from "node:assert/strict";
import {
  applyCommunityGuessModerationStatus,
  applyScoutReportModerationStatus,
  communityGuessFeedsPredictions,
  normalizeCommunityGuessModerationStatus,
  normalizeScoutReportModerationStatus,
  scoutReportFeedsPredictions,
} from "../src/utils/adminCommandCenterUtils.js";
import { isDropRadarConfirmedTrainingEntry } from "../src/utils/dropRadarUtils.mjs";

const baseReport = {
  id: "report-1",
  storeId: "redmill-target",
  storeName: "Redmill Target",
  reportDate: "2026-05-12",
  reportTime: "15:24",
  stockStatus: "in_stock",
  sourceType: "user_report",
  confidence: "likely",
};

const confirmed = applyScoutReportModerationStatus(baseReport, "Confirmed", {
  now: "2026-05-21T12:00:00.000Z",
  reviewer: "official admin ember",
});
assert.equal(normalizeScoutReportModerationStatus(confirmed), "Confirmed");
assert.equal(confirmed.verified, true);
assert.equal(confirmed.shouldTrainPredictions, true);
assert.equal(scoutReportFeedsPredictions(confirmed), true);

const rejected = applyScoutReportModerationStatus(baseReport, "Rejected", { now: "2026-05-21T12:00:00.000Z" });
assert.equal(normalizeScoutReportModerationStatus(rejected), "Rejected");
assert.equal(rejected.hidden, true);
assert.equal(rejected.shouldTrainPredictions, false);
assert.equal(scoutReportFeedsPredictions(rejected), false);

const duplicate = applyScoutReportModerationStatus(baseReport, "Duplicate", { now: "2026-05-21T12:00:00.000Z" });
assert.equal(normalizeScoutReportModerationStatus(duplicate), "Duplicate");
assert.equal(duplicate.duplicate, true);
assert.equal(scoutReportFeedsPredictions(duplicate), false);

const stale = applyScoutReportModerationStatus(baseReport, "Stale", { now: "2026-05-21T12:00:00.000Z" });
assert.equal(normalizeScoutReportModerationStatus(stale), "Stale");
assert.equal(stale.stale, true);
assert.equal(scoutReportFeedsPredictions(stale), false);

const review = applyScoutReportModerationStatus(baseReport, "Needs Review", { now: "2026-05-21T12:00:00.000Z" });
assert.equal(normalizeScoutReportModerationStatus(review), "Needs Review");
assert.equal(review.needsReview, true);
assert.equal(scoutReportFeedsPredictions(review), false);

const baseGuess = {
  id: "guess-1",
  recordType: "guess",
  recordKind: "community_guess",
  storeId: "redmill-target",
  storeName: "Redmill Target",
  retailer: "Target",
  date: "2026-05-12",
  time: "15:24",
  sourceType: "manual_prediction",
  confidence: "guess",
  status: "pending",
};

assert.equal(normalizeCommunityGuessModerationStatus(baseGuess), "Pending");
const approvedGuess = applyCommunityGuessModerationStatus(baseGuess, "Approved as Community Guess", { now: "2026-05-21T12:00:00.000Z" });
assert.equal(normalizeCommunityGuessModerationStatus(approvedGuess), "Approved as Community Guess");
assert.equal(approvedGuess.recordKind, "community_guess");
assert.equal(approvedGuess.shouldTrainPredictions, false);
assert.equal(communityGuessFeedsPredictions(approvedGuess), false);

const rejectedGuess = applyCommunityGuessModerationStatus(baseGuess, "Rejected", { now: "2026-05-21T12:00:00.000Z" });
assert.equal(normalizeCommunityGuessModerationStatus(rejectedGuess), "Rejected");
assert.equal(rejectedGuess.hidden, true);
assert.equal(rejectedGuess.shouldTrainPredictions, false);

const convertedGuess = applyCommunityGuessModerationStatus(baseGuess, "Converted to Confirmed", { now: "2026-05-21T12:00:00.000Z" });
assert.equal(normalizeCommunityGuessModerationStatus(convertedGuess), "Converted to Confirmed");
assert.equal(convertedGuess.recordKind, "confirmed_restock");
assert.equal(convertedGuess.verified, true);
assert.equal(convertedGuess.shouldTrainPredictions, true);
assert.equal(isDropRadarConfirmedTrainingEntry(convertedGuess), true);
assert.equal(communityGuessFeedsPredictions(convertedGuess), true);

console.log("Moderation queue utility tests passed.");
