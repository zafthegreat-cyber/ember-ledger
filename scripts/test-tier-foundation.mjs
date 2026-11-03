import assert from "node:assert/strict";
import fs from "node:fs";
import { readDeferredAppSource } from "./helpers/read-deferred-app-source.mjs";

import {
  PLAN_IDS,
  TIER_ADD_ONS,
  TIER_DISPLAY_GUIDANCE,
  TIER_PRICING,
  canUseFeature,
  getLockedFeatureDetails,
  getTierAccess,
  getTierPricingCards,
  normalizeTier,
} from "../src/services/featureGates.js";
import { buildEmberAssistContext, buildEmberAssistFallbackResponse } from "../src/utils/businessAssistant.js";

assert.deepEqual(
  getTierPricingCards().map((tier) => tier.id),
  [PLAN_IDS.FREE, PLAN_IDS.COLLECTOR, PLAN_IDS.FAMILY, PLAN_IDS.SELLER, PLAN_IDS.SHOP],
  "public plans should be Free, Collector, Family, Seller, and Shop",
);

assert.equal(TIER_PRICING.free.price, "$0");
// Billing is off during beta (83884c3): paid tiers show "Free during beta" and
// promise notice before anything is charged, instead of beta dollar prices.
assert.match(TIER_PRICING.collector.price, /Free during beta/);
assert.match(TIER_PRICING.collector.trialCopy, /told before anything costs money/i);
assert.match(TIER_PRICING.family.price, /Free during beta/);
assert.match(TIER_PRICING.family.features.join(" "), /2 kid profiles included/i);
assert.match(TIER_PRICING.seller.price, /Free during beta/);
assert.match(TIER_PRICING.shop.price, /Free during beta for approved shops/);
assert.match(TIER_PRICING.shop.trialCopy, /reviewed by the Code 3 team/i);
assert.match(TIER_PRICING.shop.futurePrice, /no checkout yet/i);
assert.match(TIER_PRICING.shop.features.join(" "), /admin-reviewed, not automatic payment-based/i);
for (const planId of [PLAN_IDS.COLLECTOR, PLAN_IDS.FAMILY, PLAN_IDS.SELLER, PLAN_IDS.SHOP]) {
  assert.doesNotMatch(TIER_PRICING[planId].price, /\$\d/, `${planId} should not show a dollar price during beta`);
}

assert.match(TIER_DISPLAY_GUIDANCE.free.gateCopy, /1 watched store/i);
assert.match(TIER_DISPLAY_GUIDANCE.free.gateCopy, /30 days/i);
assert.match(TIER_DISPLAY_GUIDANCE.collector.gateCopy, /free during beta/i);
assert.match(TIER_DISPLAY_GUIDANCE.seller.gateCopy, /do not unlock raw restock history/i);
assert.match(TIER_DISPLAY_GUIDANCE.shop.gateCopy, /admin-reviewed/i);

assert.ok(TIER_ADD_ONS.some((addOn) => addOn.label === "Extra kid profile" && addOn.price === "Free during beta"));
assert.ok(TIER_ADD_ONS.some((addOn) => addOn.label === "Extra adult family member" && addOn.price === "Free during beta"));
assert.ok(TIER_ADD_ONS.some((addOn) => addOn.label === "Extra watched store" && addOn.price === "Free during beta"));
assert.ok(TIER_ADD_ONS.some((addOn) => addOn.label === "Seller/business partner seat" && addOn.price === "Free during beta"));
assert.ok(TIER_ADD_ONS.some((addOn) => addOn.label === "Shop staff seat" && addOn.price === "Free during beta"));
assert.ok(TIER_ADD_ONS.some((addOn) => addOn.label === "Extra shop location" && addOn.price === "Free during beta"));

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

const protectedScoutLock = getLockedFeatureDetails("restock_predictions");
assert.equal(protectedScoutLock.statusLabel, "Kept private");
assert.match(protectedScoutLock.guardrail, /No one sees raw restock history/i);
assert.match(protectedScoutLock.guardrail, /all-store timing data/i);

const sellerLock = getLockedFeatureDetails("seller_tools");
assert.match(sellerLock.title, /Seller tools are gated/i);
assert.match(sellerLock.action, /free during beta; there is nothing to pay yet/i);

const familyLock = getLockedFeatureDetails("kid_profiles");
assert.match(familyLock.title, /Family support is gated/i);
assert.match(familyLock.guardrail, /No child profiles/i);

const shopLock = getLockedFeatureDetails("shop_profile_tools");
assert.match(shopLock.title, /Shop access needs review/i);
assert.match(shopLock.guardrail, /Paying is not enough/i);

const tierAnswer = buildEmberAssistFallbackResponse(
  "What do tiers cost and does Collector unlock raw Scout patterns?",
  buildEmberAssistContext({ activeTab: "membership" }),
);
assert.match(tierAnswer.answer, /Free, Collector, Family, Seller, and Shop/);
// 83884c3 replaced the per-tier beta price list with "free during beta" copy.
assert.match(tierAnswer.answer, /Everything is free during beta/);
assert.match(tierAnswer.answer, /no checkout yet/i);
assert.match(tierAnswer.answer, /told before anything costs money/i);
assert.match(tierAnswer.answer, /ask the Code 3 team/i);
assert.doesNotMatch(tierAnswer.answer, /\$\d/, "tier answer should not quote dollar prices during beta");
assert.match(tierAnswer.answer, /Raw restock history and restock pattern tools stay private on every plan/);
assert.doesNotMatch(tierAnswer.answer, /unlocks? (raw|restock pattern|pattern)/i, "tier answer must not promise raw restock patterns");

const appSource = readDeferredAppSource();
assert.match(appSource, /Upgrade Value Preview/, "upgrade preview label should render in app source");
assert.match(appSource, /What upgrading unlocks next/, "Hearth should explain upgrade value");
assert.match(appSource, /Local beta/, "upgrade previews should be honest about local beta status");
assert.match(appSource, /Available in upgraded plans when enabled/, "upgrade previews should avoid live entitlement promises");
assert.match(appSource, /Coming with connected accounts/, "connected-account-dependent value should be labeled as future backend work");
assert.match(appSource, /No add-on checkout is connected\. Upgrades and seller\/shop access remain reviewed beta actions\./, "the active Membership page should state that checkout is not connected");
assert.match(appSource, /label: "Checkout",\s+value: "Not live"/, "the active Membership status should keep checkout unavailable");

const unsafeUpgradeClaimPatterns = [
  /Live alerts are enabled/i,
  /Guaranteed restock notifications/i,
  /Verified sellers are enabled/i,
  /official tax receipt/i,
  /AI automatically/i,
  /Start checkout/i,
  /Pay now/i,
  /guaranteed availability is enabled/i,
  /we guarantee availability/i,
];
for (const pattern of unsafeUpgradeClaimPatterns) {
  assert.doesNotMatch(appSource, pattern, `upgrade preview copy should not include unsafe claim: ${pattern}`);
}

const publicCopyFiles = [
  "src/App.jsx",
  "src/services/featureGates.js",
  "src/utils/businessAssistant.js",
  "src/utils/businessAssistantLite.js",
  "src/components/LockedFeatureNotice.jsx",
];

for (const file of publicCopyFiles) {
  const text = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(text, new RegExp(["Tide", "Scout"].join(" "), "i"), `${file} should not expose the old Scout tier name`);
  assert.doesNotMatch(text, new RegExp(["Scout", "Premium"].join(" "), "i"), `${file} should not expose the old premium Scout tier name`);
}

console.log("Tier foundation checks passed.");
