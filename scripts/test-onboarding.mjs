import assert from "node:assert/strict";

import {
  ACCOUNT_SETUP_TIER_ROWS,
  ACCOUNT_SETUP_USERNAME_RULES,
  ACCOUNT_SETUP_WORKSPACE_ROWS,
  FIRST_TIME_ONBOARDING_CARDS,
  ONBOARDING_ASSIST_PROMPTS,
  ONBOARDING_GOALS,
  ONBOARDING_WELCOME_COPY,
  betaAccessWaitlistMessage,
  buildOnboardingChecklist,
  formatBetaAccessAreaAnswer,
  isVirginiaAccessState,
  normalizeAccessState,
  normalizeOnboardingGoalKeys,
  normalizeOnboardingState,
  onboardingChecklistSummary,
  onboardingGoalRows,
  shouldShowFirstRunOnboarding,
} from "../src/utils/onboardingGuidance.js";
import {
  SMART_SETUP_PLAN_TYPES,
  normalizeSmartSetupPreferences,
  recommendSmartSetup,
} from "../src/utils/adaptiveUi.js";

assert.ok(ONBOARDING_GOALS.some((goal) => goal.key === "parent_family"), "parent/family goal should exist");
assert.ok(ONBOARDING_GOALS.some((goal) => goal.key === "seller_forge"), "seller/business goal should exist");
assert.ok(ONBOARDING_ASSIST_PROMPTS.includes("What should I do first?"), "starter prompts should include first-step help");
assert.ok(ONBOARDING_WELCOME_COPY.includes("Welcome to Ember & Tide"), "welcome copy should introduce Ember & Tide");
assert.deepEqual(
  FIRST_TIME_ONBOARDING_CARDS.map((card) => card.key),
  ["welcome", "vault", "market", "scout", "local_beta", "coming_later"],
  "first-time onboarding cards should cover the planned tester guide"
);
assert.ok(
  FIRST_TIME_ONBOARDING_CARDS.find((card) => card.key === "local_beta")?.body.includes("only in this browser"),
  "first-time guide should explain local browser beta limits"
);
assert.ok(
  FIRST_TIME_ONBOARDING_CARDS.find((card) => card.key === "market")?.body.includes("not live pricing"),
  "Market onboarding copy should avoid live-pricing claims"
);
assert.ok(ACCOUNT_SETUP_USERNAME_RULES.some((rule) => /reserved/i.test(rule)), "username rules should mention reserved names");
assert.deepEqual(
  ACCOUNT_SETUP_TIER_ROWS.map((tier) => tier.label),
  ["Free", "Collector", "Family", "Seller", "Shop", "Beta", "Admin"],
  "account setup should show every requested tier/status"
);
assert.ok(ACCOUNT_SETUP_WORKSPACE_ROWS.some((row) => row.key === "family"), "family workspace setup should be described");
assert.equal(normalizeAccessState("Virginia"), "VA");
assert.equal(isVirginiaAccessState("VA"), true);
assert.equal(isVirginiaAccessState("NC"), false);
assert.match(betaAccessWaitlistMessage("NC"), /North Carolina/);
assert.equal(
  formatBetaAccessAreaAnswer({ state: "VA", localAreaAnswer: "hampton_roads", tierInterest: "family" }),
  "State: VA | Area: Hampton Roads | Path: Family"
);

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

const collectorSetup = recommendSmartSetup({
  purposes: ["collect_pokemon_with_my_family_kids"],
  enabledToolsets: ["vault_collection_tracking", "the_spark_kids_program"],
  primaryMode: "collector_parent",
  businessTools: "no_i_only_collect",
});
assert.equal(collectorSetup.planType, SMART_SETUP_PLAN_TYPES.COLLECTOR_FAMILY);
assert.ok(collectorSetup.includes.includes("Vault"), "collector setup should include Vault");
assert.ok(collectorSetup.hides.includes("Forge"), "collector setup should hide Forge by default");

const sellerSetup = recommendSmartSetup({
  purposes: ["sell_trade_and_track_inventory"],
  enabledToolsets: ["forge_seller_tools", "sales_tracking", "receipts_and_expenses"],
  primaryMode: "casual_seller",
});
assert.equal(sellerSetup.planType, SMART_SETUP_PLAN_TYPES.SELLER);
assert.ok(sellerSetup.includes.includes("Forge"), "seller setup should include Forge");

const businessSetup = recommendSmartSetup({
  enabledToolsets: ["mileage_tracking", "sales_tracking", "receipts_and_expenses"],
  primaryMode: "business_seller",
  businessTools: "yes_i_need_year_end_export_tax_support_later",
});
assert.equal(businessSetup.planType, SMART_SETUP_PLAN_TYPES.BUSINESS_SELLER);
assert.ok(businessSetup.includes.includes("Mileage"), "business seller setup should include mileage");

const blockedAdminSetup = recommendSmartSetup({
  purposes: ["run_or_manage_ember_tide_tools"],
  enabledToolsets: ["admin_tools"],
}, { adminAllowed: false });
assert.notEqual(blockedAdminSetup.planType, SMART_SETUP_PLAN_TYPES.ADMIN, "admin recommendation should require admin permission");

const allowedAdminSetup = recommendSmartSetup({
  purposes: ["run_or_manage_ember_tide_tools"],
  enabledToolsets: ["admin_tools"],
}, { adminAllowed: true });
assert.equal(allowedAdminSetup.planType, SMART_SETUP_PLAN_TYPES.ADMIN);

const normalizedSmartSetup = normalizeSmartSetupPreferences({
  purposes: ["Track my personal collection", "Track my personal collection"],
  enabledToolsets: "Vault collection tracking, Scout restock reports",
  primary_user_mode: "Collector / Parent",
  setup_completed_at: "2026-05-24T12:00:00.000Z",
});
assert.deepEqual(normalizedSmartSetup.purposes, ["track_my_personal_collection"]);
assert.deepEqual(normalizedSmartSetup.enabledToolsets, ["vault_collection_tracking", "scout_restock_reports"]);
assert.equal(normalizedSmartSetup.primaryMode, "collector_parent");
assert.equal(normalizedSmartSetup.completedAt, "2026-05-24T12:00:00.000Z");

console.log("Onboarding guidance tests passed.");
