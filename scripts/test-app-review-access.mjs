import assert from "node:assert/strict";
import test from "node:test";
import { FEATURE_GATES, PUBLIC_TIER_ORDER, canUseFeature, getTierAccess, hasPlanAccess, isAdminUser } from "../src/services/featureGates.js";

test("complimentary reviewer can inspect every customer-plan feature without becoming staff", () => {
  const profile={tier:"pro",appRole:"user",subscriptionStatus:"active"};
  const options={reviewAccess:true,qaUnlock:false};
  for (const [feature,plans] of Object.entries(FEATURE_GATES)) {
    const memberFeature=plans.some(plan=>PUBLIC_TIER_ORDER.includes(plan));
    assert.equal(canUseFeature(profile,feature,options),memberFeature,feature);
    assert.equal(hasPlanAccess(profile,feature,options),memberFeature,feature);
  }
  assert.equal(canUseFeature(profile,"not_a_real_feature",options),false);
  assert.equal(isAdminUser(profile),false);
  const access=getTierAccess(profile,options);
  for (const feature of ["canCreateKidProfiles","canManageFamilyProfiles","canUseKidSafeVault","canUseForgeAdvancedSellerTools","canUseShopProfileTools"]) assert.equal(access[feature],true,feature);
  for (const feature of ["isAdmin","canAccessAdminModeration","canViewRawScoutHistory","canViewPatternTools"]) assert.equal(access[feature],false,feature);
  assert.equal(access.scoutStoreSlots,3);
  assert.equal(getTierAccess(profile).canUseShopProfileTools,false);
  assert.equal(canUseFeature({...profile,appReviewAccess:true},"shop_profile_tools",{qaUnlock:false}),false,"untrusted profile flag alone grants nothing");
  assert.equal(canUseFeature(profile,"shop_profile_tools",{reviewAccess:"true",qaUnlock:false}),false);
});
