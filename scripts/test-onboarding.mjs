import assert from "node:assert/strict";

import {
  ONBOARDING_ASSIST_PROMPTS,
  ONBOARDING_GOALS,
  buildOnboardingChecklist,
  normalizeOnboardingGoalKeys,
  normalizeOnboardingState,
  onboardingChecklistSummary,
  onboardingGoalRows,
  shouldShowFirstRunOnboarding,
} from "../src/utils/onboardingGuidance.js";

assert.ok(ONBOARDING_GOALS.some((goal) => goal.key === "parent_family"), "parent/family goal should exist");
assert.ok(ONBOARDING_GOALS.some((goal) => goal.key === "seller_forge"), "seller/business goal should exist");
assert.ok(ONBOARDING_ASSIST_PROMPTS.includes("What should I do first?"), "starter prompts should include first-step help");

assert.deepEqual(
  normalizeOnboardingGoalKeys([
    "Parent/family looking for Pokemon",
    "Collector",
    "seller_forge",
    "Kids Program participant/parent",
  ]),
  ["parent_family", "collector_vault", "seller_forge", "spark_parent"]
);

const state = normalizeOnboardingState({
  completedAt: "",
  preferences: ["Track business inventory", "Scout helping with restock reports"],
  manualChecklist: ["ember_assist"],
});
assert.deepEqual(state.goals, ["seller_forge", "scout_reports"]);
assert.deepEqual(state.manualChecklist, ["ember_assist"]);

assert.equal(
  shouldShowFirstRunOnboarding({
    hasUser: true,
    appAccessAllowed: true,
    onboarding: {},
  }),
  true
);
assert.equal(
  shouldShowFirstRunOnboarding({
    hasUser: true,
    appAccessAllowed: false,
    onboarding: {},
  }),
  false,
  "blocked or unapproved users should not see full-app onboarding"
);
assert.equal(
  shouldShowFirstRunOnboarding({
    hasUser: true,
    appAccessAllowed: true,
    onboarding: { completedAt: "2026-05-21T12:00:00.000Z" },
  }),
  false,
  "completed onboarding should not return every load"
);

const checklist = buildOnboardingChecklist(
  {
    hasPublicUsername: true,
    hasWorkspaceIdentity: true,
    vaultItems: 1,
    forgeItems: 0,
    scoutReports: 2,
    homeAreaSet: true,
    followedStores: 0,
    savedProducts: 1,
    alertsConfigured: true,
    scoutPointsLearned: false,
    emberAssistAsked: false,
    kidsProgramReviewed: false,
  },
  { manualChecklist: ["ember_assist"] }
);
assert.equal(checklist.find((item) => item.key === "profile").completed, true);
assert.equal(checklist.find((item) => item.key === "forge").completed, false);
assert.equal(checklist.find((item) => item.key === "ember_assist").completed, true);
assert.equal(checklist.find((item) => item.key === "follow").completed, true);
assert.equal(checklist.find((item) => item.key === "home_area").completed, true);
assert.equal(checklist.find((item) => item.key === "scout_points").completed, false);
assert.equal(checklist.find((item) => item.key === "kids_program").title, "Learn about The Spark");

const summary = onboardingChecklistSummary(checklist);
assert.ok(summary.completed > 0);
assert.equal(summary.total, checklist.length);
assert.match(summary.label, /complete/);

assert.equal(onboardingGoalRows(["local shop/card shop partner"])[0].key, "local_shop_partner");

console.log("Onboarding guidance tests passed.");
