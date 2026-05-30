import assert from "node:assert/strict";
import fs from "node:fs";

import {
  PLAN_IDS,
  TIER_ADD_ONS,
  TIER_PRICING,
  canUseFeature,
  getTierAccess,
  getTierPricingCards,
  normalizeTier,
} from "../src/services/featureGates.js";
import { buildEmberAssistContext, buildEmberAssistFallbackResponse } from "../src/utils/emberAssist.js";

assert.deepEqual(
  getTierPricingCards().map((tier) => tier.id),
  [PLAN_IDS.FREE, PLAN_IDS.COLLECTOR, PLAN_IDS.FAMILY, PLAN_IDS.SELLER, PLAN_IDS.SHOP],
  "public plans should be Free, Collector, Family, Seller, and Shop",
);

assert.equal(TIER_PRICING.free.price, "$0");
assert.match(TIER_PRICING.collector.price, /\$1\.99\/month beta price/);
assert.match(TIER_PRICING.collector.trialCopy, /7-day free trial/i);
assert.match(TIER_PRICING.family.price, /\$3\.99\/month beta price/);
assert.match(TIER_PRICING.family.features.join(" "), /2 kid profiles included/i);
assert.match(TIER_PRICING.seller.price, /\$5\.99\/month beta price/);
assert.match(TIER_PRICING.shop.price, /Shop Basic \$19\/month/);
assert.match(TIER_PRICING.shop.trialCopy, /Shop Plus \$39\/month/);
assert.match(TIER_PRICING.shop.features.join(" "), /approval-based, not automatic payment-based/i);

assert.ok(TIER_ADD_ONS.some((addOn) => addOn.label === "Extra kid profile" && addOn.price === "$0.99/month"));
assert.ok(TIER_ADD_ONS.some((addOn) => addOn.label === "Extra adult family member" && addOn.price === "$0.99/month"));
assert.ok(TIER_ADD_ONS.some((addOn) => addOn.label === "Extra Scout store" && addOn.price === "$0.99/month"));
assert.ok(TIER_ADD_ONS.some((addOn) => addOn.label === "Seller/business partner" && addOn.price === "$1.99/month"));
assert.ok(TIER_ADD_ONS.some((addOn) => addOn.label === "Shop staff seat" && addOn.price === "$2.99/month"));
assert.ok(TIER_ADD_ONS.some((addOn) => addOn.label === "Extra shop location" && addOn.price === "$9.99/month"));

const freeAccess = getTierAccess({ tier: "free", betaTester: true });
assert.equal(freeAccess.scoutStoreSlots, 1);
assert.equal(freeAccess.scoutStoreSwapDays, 30);
assert.equal(freeAccess.canViewRawScoutHistory, false);
assert.equal(freeAccess.canViewPatternTools, false);
assert.equal(freeAccess.isBeta, true, "beta should be a status flag");

const collectorAccess = getTierAccess({ tier: "collector" });
assert.equal(collectorAccess.scoutStoreSlots, 3);
assert.equal(collectorAccess.scoutStoreSwapDays, 14);
assert.equal(collectorAccess.canViewRawScoutHistory, false);
assert.equal(collectorAccess.canViewPatternTools, false);

const familyAccess = getTierAccess({ tier: "family" });
assert.equal(familyAccess.maxKidProfilesIncluded, 2);
assert.equal(familyAccess.maxAdultMembersIncluded, 1);
assert.equal(familyAccess.canCreateKidProfiles, true);
assert.equal(familyAccess.canManageFamilyProfiles, true);
assert.equal(familyAccess.canUseKidSafeVault, true);

const sellerAccess = getTierAccess({ tier: "seller" });
assert.equal(sellerAccess.canUseForgeAdvancedSellerTools, true);
assert.equal(sellerAccess.canViewRawScoutHistory, false);
assert.equal(sellerAccess.canViewPatternTools, false);

const shopAccess = getTierAccess({ tier: "shop" });
assert.equal(shopAccess.canUseShopProfileTools, true);
assert.equal(shopAccess.canViewRawScoutHistory, false);
assert.equal(shopAccess.canViewPatternTools, false);

const adminAccess = getTierAccess({ tier: "admin" });
assert.equal(adminAccess.canAccessAdminModeration, true);
assert.equal(adminAccess.canViewRawScoutHistory, true);
assert.equal(adminAccess.canViewPatternTools, true);

assert.equal(normalizeTier("collector_plus"), "collector");
assert.equal(normalizeTier("scout_premium"), "collector");
assert.equal(normalizeTier("seller_pro"), "seller");
assert.equal(normalizeTier("shop_plus"), "shop");

assert.equal(canUseFeature("free", "scout_submit_reports"), true, "free users can still submit Scout reports");
assert.equal(canUseFeature("free", "scout_view_reports"), true, "free users can still view basic Scout reports");
assert.equal(canUseFeature({ tier: "free", betaTester: true }, "seller_tools", { betaTester: true }), false, "beta flag alone should not unlock paid seller tools");
assert.equal(canUseFeature("free", "seller_tools", { localBeta: true }), true, "local beta mode remains usable for browser regression");
assert.equal(canUseFeature("free", "scout_pattern_tools", { localBeta: true }), false, "local beta should not expose protected Scout patterns");
assert.equal(canUseFeature("collector", "scout_pattern_tools"), false);
assert.equal(canUseFeature("family", "scout_raw_history"), false);
assert.equal(canUseFeature("seller", "restock_predictions"), false);
assert.equal(canUseFeature({ tier: "admin" }, "scout_pattern_tools"), true);

const tierAnswer = buildEmberAssistFallbackResponse(
  "What do tiers cost and does Collector unlock raw Scout patterns?",
  buildEmberAssistContext({ activeTab: "membership" }),
);
assert.match(tierAnswer.answer, /Free, Collector, Family, Seller, and Shop/);
assert.match(tierAnswer.answer, /\$1\.99\/month beta pricing/);
assert.match(tierAnswer.answer, /7-day free trial/);
assert.match(tierAnswer.answer, /2 private, parent-managed kid profiles/);
assert.match(tierAnswer.answer, /Shop Basic at \$19\/month and Shop Plus at \$39\/month/);
assert.match(tierAnswer.answer, /checkout is not live/i);
assert.match(tierAnswer.answer, /not raw Scout history or restock pattern tools/i);

const publicCopyFiles = [
  "src/App.jsx",
  "src/services/featureGates.js",
  "src/utils/emberAssist.js",
  "src/utils/emberAssistLite.js",
  "src/components/LockedFeatureNotice.jsx",
];

for (const file of publicCopyFiles) {
  const text = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(text, new RegExp(["Tide", "Scout"].join(" "), "i"), `${file} should not expose the old Scout tier name`);
  assert.doesNotMatch(text, new RegExp(["Scout", "Premium"].join(" "), "i"), `${file} should not expose the old premium Scout tier name`);
}

console.log("Tier foundation checks passed.");
