import assert from "node:assert/strict";
import test from "node:test";
import * as gates from "../src/services/featureGates.js";
const { FEATURE_GATES, PUBLIC_TIER_ORDER, canUseFeature, getTierAccess, hasPlanAccess, isAdminUser } = gates;

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

test("the actual membership screen does not tell an enabled reviewer to request the same access again", async () => {
  const { build } = await import("esbuild");
  const { mkdir } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const { createRequire } = await import("node:module");
  const directory=resolve("artifacts/qa/nationwide-launch-20261108");
  await mkdir(directory,{recursive:true});
  const outfile=resolve(directory,"membership-review.cjs");
  await build({entryPoints:["src/features/deferredViews/MembershipContent.jsx"],bundle:true,platform:"node",format:"cjs",jsx:"automatic",external:["react","react-dom"],define:{"import.meta.env":"{}"},outfile,logLevel:"silent"});
  const require=createRequire(import.meta.url);
  const React=require("react");
  const { renderToStaticMarkup }=require("react-dom/server");
  const Membership=require(outfile).default;
  const section=({children})=>React.createElement("section",null,children);
  const render=(reviewAccess)=>{
    const profile={tier:"seller",appRole:"user"};
    const tierAccess=getTierAccess(profile,{reviewAccess});
    return renderToStaticMarkup(React.createElement(Membership,{scope:{...gates,
      AppNavIcon:()=>null,CommandBoardSection:section,CommandBoardV4:section,CommandMetricGrid:()=>null,
      currentUserProfile:profile,currentTier:"seller",currentTierLabel:tierAccess.tierLabel,tierAccess,
      experiencePresentation:{},featureAllowed:feature=>canUseFeature(profile,feature,{reviewAccess,qaUnlock:false}),
      isTrialActive:()=>false,openUtilityPage:()=>{},requestLockedFeatureAccess:()=>{},setActiveTab:()=>{},
    }}));
  };
  const reviewer=render(true),ordinary=render(false);
  const locks=html=>html.match(/<div class="membership-v4-lock-grid">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.match(reviewer,/Included for app review/);
  for (const feature of ["seller_tools","kid_profiles","shop_profile_tools"]) assert.equal(locks(reviewer).includes(gates.getLockedFeatureDetails(feature).label),false,feature);
  assert.equal(locks(reviewer).includes(gates.getLockedFeatureDetails("restock_predictions").label),true);
  assert.equal(locks(ordinary).includes(gates.getLockedFeatureDetails("shop_profile_tools").label),true);
});
