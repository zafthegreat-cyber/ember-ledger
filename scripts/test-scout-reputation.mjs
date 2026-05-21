import assert from "node:assert/strict";

import {
  MIN_SCOUT_POINTS_FOR_GUESS,
} from "../src/utils/dropRadarUtils.mjs";
import {
  SCOUT_REPUTATION_LEVELS,
  buildContributionSummary,
  canSubmitCommunityGuessFromProfile,
  getScoutReputationLevel,
} from "../src/utils/communityProfile.js";

assert.deepEqual(SCOUT_REPUTATION_LEVELS.map((level) => level.label), [
  "New Scout",
  "Active Scout",
  "Trusted Scout",
  "Veteran Scout",
  "Community Guide",
]);

assert.equal(getScoutReputationLevel({ scoutPoints: 0, confirmedReports: 0 }).label, "New Scout");
assert.equal(getScoutReputationLevel({ scoutPoints: 10, confirmedReports: 1 }).label, "Active Scout");
assert.equal(getScoutReputationLevel({ scoutPoints: MIN_SCOUT_POINTS_FOR_GUESS, confirmedReports: 3 }).label, "Trusted Scout");
assert.equal(getScoutReputationLevel({ scoutPoints: 80, confirmedReports: 12 }).label, "Veteran Scout");
assert.equal(getScoutReputationLevel({ scoutPoints: 200, confirmedReports: 25 }).label, "Community Guide");

const scoutProfile = { userId: "scout-1", publicUsername: "gb_scout", scoutPoints: 24 };
const summary = buildContributionSummary(scoutProfile, {
  scoutReports: [
    { userId: "scout-1", verified: true, createdAt: "2026-05-01T10:00:00.000Z" },
    { userId: "scout-1", verificationStatus: "Confirmed", createdAt: "2026-05-02T10:00:00.000Z" },
    { userId: "scout-1", status: "duplicate", createdAt: "2026-05-03T10:00:00.000Z" },
    { userId: "other", verified: true },
  ],
  communityGuesses: [
    { userId: "scout-1", moderationStatus: "Approved as Community Guess", createdAt: "2026-05-04T10:00:00.000Z" },
    { userId: "scout-1", status: "Pending" },
  ],
});

assert.equal(summary.scoutPoints, 24);
assert.equal(summary.confirmedReports, 2);
assert.equal(summary.rejectedReports, 1);
assert.equal(summary.communityGuesses, 2);
assert.equal(summary.approvedGuesses, 1);
assert.equal(summary.recentContributionAt, "2026-05-04T10:00:00.000Z");

assert.equal(canSubmitCommunityGuessFromProfile({ scoutPoints: MIN_SCOUT_POINTS_FOR_GUESS - 1 }), false);
assert.equal(canSubmitCommunityGuessFromProfile({ scoutPoints: MIN_SCOUT_POINTS_FOR_GUESS }), true);
assert.equal(canSubmitCommunityGuessFromProfile({ scoutPoints: 0 }, { admin: true }), true);

console.log("Scout reputation tests passed.");
