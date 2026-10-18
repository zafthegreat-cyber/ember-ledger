import assert from "node:assert/strict";
import {
  EXPERIENCE_PERSONA_OPTIONS,
  TIER_PREVIEW_OPTIONS,
  createTierPreviewProfile,
  normalizePreviewTier,
  resolveExperiencePresentation,
} from "../src/utils/experiencePresentation.js";
import { PUBLIC_TIER_ORDER, SCOUT_PROTECTED_FEATURES, canUseFeature, getTierAccess, getUserTier, isAdminUser } from "../src/services/featureGates.js";
import { normalizeAppPersonalizationPreferences } from "../src/utils/appPersonalizationUtils.js";

const tests = [];
function test(name, run) {
  try { run(); tests.push({ name, passed: true }); }
  catch (error) { tests.push({ name, passed: false, error: error.message }); }
}

test("new users get a collector presentation with optional selling, not business or family tools", () => {
  const result = resolveExperiencePresentation();
  assert.equal(result.persona, "collector");
  assert.equal(result.copy.sellingLabel, "Sell or trade");
  assert.equal(result.showBusinessTools, false);
  assert.equal(result.showFamilyTools, false);
  assert.equal(result.showOwnerTools, false);
  assert.equal(result.showAdminTools, false);
});

test("occasional selling and saved activity never promote a collector", () => {
  for (const primaryMode of ["casual_seller", "collector", "not_sure"]) {
    const result = resolveExperiencePresentation({ setupPreferences: {
      primaryMode,
      purposes: ["sell_trade_and_track_inventory"],
      enabledToolsets: ["forge_seller_tools", "sales_tracking"],
      recommendedPlanType: "business_seller",
      salesCount: 200,
      activity: { sales: Array.from({ length: 200 }, (_, id) => ({ id })) },
    } });
    assert.equal(result.persona, "collector");
    assert.equal(result.showBusinessTools, false);
  }
});

test("explicit professional seller and store settings retain their intended presentation", () => {
  for (const input of [{ userType: "seller" }, { dashboardPreset: "seller" }, { setupPreferences: { primaryMode: "business_seller" } }, { setupPreferences: { businessTools: "yes_i_need_sales_expenses_mileage_receipts" } }]) {
    assert.equal(resolveExperiencePresentation(input).persona, "seller");
  }
  for (const input of [{ personaPreference: "store" }, { setupPreferences: { primaryMode: "partner_shop" } }, { setupPreferences: { purposes: ["i_m_a_card_shop_or_partner"] } }]) {
    const result = resolveExperiencePresentation(input);
    assert.equal(result.persona, "store");
    assert.equal(result.copy.inventoryLabel, "Store inventory");
  }
});

test("explicit collector preference overrides old seller setup without rewriting it", () => {
  const setup = Object.freeze({ experiencePersona: "collector", primaryMode: "business_seller", businessTools: "yes_i_need_sales_expenses_mileage_receipts" });
  assert.equal(resolveExperiencePresentation({ setupPreferences: setup, userType: "seller", dashboardPreset: "seller" }).persona, "collector");
  assert.equal(resolveExperiencePresentation({ setupPreferences: setup, personaPreference: "store" }).persona, "store");
  assert.equal(setup.primaryMode, "business_seller");
});

test("ordinary account tier and owner identity do not select a selling persona", () => {
  const result = resolveExperiencePresentation({ tier: "seller", profile: { tier: "shop", appRole: "owner" }, adminVisible: true, ownerVisible: true });
  assert.equal(result.persona, "collector");
  assert.equal(result.showBusinessTools, false);
  assert.equal(result.showAdminTools, true);
  assert.equal(result.showOwnerTools, true);
});

test("family presentation follows explicit setup, not recommendations or default simplicity", () => {
  for (const setup of [{ primaryMode: "collector_parent" }, { purposes: ["collect_pokemon_with_my_family_kids"] }, { enabledToolsets: ["kids_program"] }, { familyMode: true }]) {
    const result = resolveExperiencePresentation({ setupPreferences: setup });
    assert.equal(result.showFamilyTools, true);
    assert.equal(result.persona, "collector");
  }
  assert.equal(resolveExperiencePresentation({ dashboardPreset: "simple", setupPreferences: { recommendedPlanType: "collector_family" } }).showFamilyTools, false);
});

test("only an explicitly authorized, enabled public-tier preview is active", () => {
  const preview = { enabled: true, tier: "shop", persona: "store" };
  for (const canPreview of [false, undefined, "true", 1]) {
    const result = resolveExperiencePresentation({ canPreview, preview });
    assert.equal(result.isPreview, false);
    assert.equal(result.persona, "collector");
    assert.equal(result.previewTier, null);
  }
  assert.equal(resolveExperiencePresentation({ canPreview: true, preview: { ...preview, enabled: "true" } }).isPreview, false);
  for (const tier of ["admin", "owner", "paid", "all_access", "invalid", null, {}]) {
    assert.equal(resolveExperiencePresentation({ canPreview: true, preview: { enabled: true, tier } }).isPreview, false);
  }
});

test("each public tier previews its intended presentation and suppresses privileged chrome", () => {
  const personas = { free: "collector", collector: "collector", family: "collector", seller: "seller", shop: "store" };
  for (const tier of PUBLIC_TIER_ORDER) {
    const result = resolveExperiencePresentation({ canPreview: true, adminVisible: true, ownerVisible: true, setupPreferences: { experiencePersona: "store", familyMode: true }, preview: { enabled: true, tier } });
    assert.equal(result.isPreview, true);
    assert.equal(result.previewTier, tier);
    assert.equal(result.persona, personas[tier]);
    assert.equal(result.showFamilyTools, tier === "family");
    assert.equal(result.showAdminTools, false);
    assert.equal(result.showOwnerTools, false);
  }
});

test("preview persona changes wording while leaving the selected tier intact", () => {
  const result = resolveExperiencePresentation({ canPreview: true, preview: { enabled: true, tier: "free", persona: "seller" } });
  assert.equal(result.persona, "seller");
  assert.equal(result.previewTier, "free");
  assert.equal(getTierAccess(createTierPreviewProfile(result.previewTier)).canUseForgeAdvancedSellerTools, false);
  assert.equal(resolveExperiencePresentation({ canPreview: true, preview: { enabled: true, tier: "shop", persona: "admin" } }).persona, "store");
});

test("ending a preview restores the explicit presentation without persisting the preview", () => {
  const setup = Object.freeze({ experiencePersona: "collector" });
  const active = resolveExperiencePresentation({ setupPreferences: setup, canPreview: true, preview: { enabled: true, tier: "seller" } });
  const ended = resolveExperiencePresentation({ setupPreferences: setup, canPreview: true, preview: { enabled: false, tier: "seller" }, ownerVisible: true });
  assert.equal(active.persona, "seller");
  assert.equal(ended.persona, "collector");
  assert.equal(ended.showOwnerTools, true);
  assert.deepEqual(setup, { experiencePersona: "collector" });
});

test("preview profiles cannot inherit privileged, lifetime, or metadata flags", () => {
  const actual = Object.freeze({ tier: "admin", appRole: "owner", lifetimeAccess: true, app_metadata: { is_admin: true, subscription_plan: "admin" } });
  for (const tier of PUBLIC_TIER_ORDER) {
    const previewProfile = createTierPreviewProfile(tier, actual);
    assert.deepEqual(Object.keys(previewProfile).sort(), ["appRole", "subscriptionStatus", "tier"]);
    assert.equal(getUserTier(previewProfile), tier);
    assert.equal(isAdminUser(previewProfile), false);
    assert.equal(getTierAccess(previewProfile).isAdmin, false);
    for (const feature of SCOUT_PROTECTED_FEATURES) {
      assert.equal(canUseFeature(previewProfile, feature, { admin: false, localBeta: false, qaUnlock: false }), false);
    }
  }
  assert.equal(actual.appRole, "owner");
  assert.equal(actual.app_metadata.is_admin, true);
});

test("preview features remain those of existing public plans", () => {
  const seller = getTierAccess(createTierPreviewProfile("seller"));
  const family = getTierAccess(createTierPreviewProfile("family"));
  const shop = getTierAccess(createTierPreviewProfile("shop"));
  assert.equal(seller.canUseForgeAdvancedSellerTools, true);
  assert.equal(seller.canCreateKidProfiles, false);
  assert.equal(family.canCreateKidProfiles, true);
  assert.equal(family.canUseForgeAdvancedSellerTools, false);
  assert.equal(shop.canUseShopProfileTools, true);
  assert.equal(shop.canUseForgeAdvancedSellerTools, false);
});

test("Shop variants share the existing Shop tier without inventing new features", () => {
  for (const value of ["shop_basic", "Shop Plus", "shop-plus"]) {
    assert.equal(normalizePreviewTier(value), "shop");
    assert.deepEqual(createTierPreviewProfile(value), createTierPreviewProfile("shop"));
  }
  assert.equal(createTierPreviewProfile("admin"), null);
  assert.equal(createTierPreviewProfile("not-a-plan"), null);
  assert.deepEqual(TIER_PREVIEW_OPTIONS.map((option) => option.value), PUBLIC_TIER_ORDER);
  assert.match(TIER_PREVIEW_OPTIONS.find((option) => option.value === "shop").description, /share/);
});

test("helper output cannot mutate later presentation results or input settings", () => {
  const setup = Object.freeze({ primaryMode: "collector", purposes: Object.freeze(["find_fair_prices_and_restocks"]) });
  const preview = Object.freeze({ enabled: true, tier: "collector" });
  const result = resolveExperiencePresentation({ setupPreferences: setup, canPreview: true, preview });
  result.copy.recordsTitle = "changed";
  assert.equal(resolveExperiencePresentation().copy.recordsTitle, "Your collection");
  const profile = createTierPreviewProfile("free");
  profile.tier = "admin";
  assert.equal(createTierPreviewProfile("free").tier, "free");
  assert.deepEqual(EXPERIENCE_PERSONA_OPTIONS.map((option) => option.value), ["collector", "seller", "store"]);
  assert.equal(resolveExperiencePresentation({ setupPreferences: null, preview: null }).persona, "collector");
});

test("existing personalization normalization keeps optional tools off unless explicitly enabled", () => {
  for (const source of [{}, { optionalTools: null }, { optionalTools: { community: "true", family: 1, assistant: "yes" } }]) {
    const normalized = normalizeAppPersonalizationPreferences(source, { userType: "collector", dashboardPreset: "simple" });
    assert.deepEqual(normalized.optionalTools, { community: false, family: false, assistant: false });
    assert.deepEqual(normalized.optionalToolsCustomized, []);
    assert.equal(resolveExperiencePresentation({ personaPreference: normalized.experiencePersona }).persona, "collector");
  }
});

test("explicit presentation preferences survive normalization and a saved JSON round trip", () => {
  for (const experiencePersona of ["collector", "seller", "store"]) {
    const source = Object.freeze({ experiencePersona, optionalTools: Object.freeze({ community: true, family: false, assistant: true }), optionalToolsCustomized: Object.freeze(["community", "family", "assistant"]), smartRecommendationsEnabled: false });
    const normalized = normalizeAppPersonalizationPreferences(source, { userType: "seller" });
    const reloaded = normalizeAppPersonalizationPreferences(JSON.parse(JSON.stringify(normalized)), { userType: "seller" });
    assert.equal(reloaded.experiencePersona, experiencePersona);
    assert.deepEqual(reloaded.optionalTools, { community: true, family: false, assistant: true });
    assert.deepEqual(reloaded.optionalToolsCustomized, ["community", "family", "assistant"]);
    assert.equal(reloaded.smartRecommendationsEnabled, false);
    assert.equal(resolveExperiencePresentation({ personaPreference: reloaded.experiencePersona, userType: "seller" }).persona, experiencePersona);
  }
});

test("an explicit family off choice survives normalization separately from an untouched legacy setting", () => {
  const untouched = normalizeAppPersonalizationPreferences({});
  const changed = normalizeAppPersonalizationPreferences({ optionalTools: { family: false }, optionalToolsCustomized: ["family"] });
  const reloaded = normalizeAppPersonalizationPreferences(JSON.parse(JSON.stringify(changed)));
  assert.equal(untouched.optionalTools.family, false);
  assert.equal(untouched.optionalToolsCustomized.includes("family"), false);
  assert.equal(reloaded.optionalTools.family, false);
  assert.equal(reloaded.optionalToolsCustomized.includes("family"), true);
});

test("customized optional tool keys are strictly validated and deduplicated", () => {
  assert.deepEqual(normalizeAppPersonalizationPreferences({ optionalToolsCustomized: ["family", "owner", "family", "admin", "community", true, null, "assistant"] }).optionalToolsCustomized, ["family", "community", "assistant"]);
  for (const optionalToolsCustomized of ["family", true, {}, null]) {
    assert.deepEqual(normalizeAppPersonalizationPreferences({ optionalToolsCustomized }).optionalToolsCustomized, []);
  }
});

test("saved seller and admin layouts survive persona changes while ordinary presentation still filters them", () => {
  const source = {
    experiencePersona: "seller",
    pagePreferences: {
      hearth: { visibleKeys: ["forgeSummary", "scoutSignals", "vaultSnapshot"], updatedAt: "2026-10-17T12:00:00Z" },
      quickAdd: { visibleKeys: ["addSale", "uploadReceipt", "reviewFlaggedReports", "addScoutReport"], updatedAt: "2026-10-17T12:00:00Z" },
      settings: { visibleKeys: ["adminTools"] },
    },
  };
  const seller = normalizeAppPersonalizationPreferences(source, { userType: "seller", sellerToolsEnabled: true, adminToolsVisible: true, preserveUnavailable: true });
  const collectorSaved = normalizeAppPersonalizationPreferences({ ...seller, experiencePersona: "collector" }, { userType: "collector", preserveUnavailable: true });
  const collectorShown = normalizeAppPersonalizationPreferences(collectorSaved, { userType: "collector" });
  assert.deepEqual(collectorSaved.pagePreferences, seller.pagePreferences);
  assert.equal(collectorShown.pagePreferences.hearth.visibleKeys.includes("forgeSummary"), false);
  assert.equal(collectorShown.pagePreferences.quickAdd.visibleKeys.includes("addSale"), false);
  assert.equal(collectorShown.pagePreferences.quickAdd.visibleKeys.includes("reviewFlaggedReports"), false);
  assert.equal(collectorShown.pagePreferences.settings.visibleKeys.includes("adminTools"), false);
  const sellerAgain = normalizeAppPersonalizationPreferences(JSON.parse(JSON.stringify(collectorSaved)), { userType: "seller", sellerToolsEnabled: true, adminToolsVisible: true });
  assert.deepEqual(sellerAgain.pagePreferences, seller.pagePreferences);
});

test("preserving unavailable saved choices never invents privileged defaults or accepts unknown actions", () => {
  const normal = normalizeAppPersonalizationPreferences({}, { userType: "collector" });
  const preserved = normalizeAppPersonalizationPreferences({}, { userType: "collector", preserveUnavailable: true });
  assert.deepEqual(preserved.pagePreferences, normal.pagePreferences);
  const source = { pagePreferences: { quickAdd: { visibleKeys: ["addSale", "unknownAction", "ownerAccess", "reviewFlaggedReports", "addSale"] } } };
  assert.deepEqual(normalizeAppPersonalizationPreferences(source, { preserveUnavailable: true }).pagePreferences.quickAdd.visibleKeys, ["addSale", "reviewFlaggedReports"]);
  assert.equal(normalizeAppPersonalizationPreferences(source, { preserveUnavailable: "true" }).pagePreferences.quickAdd.visibleKeys.includes("addSale"), false);
});

test("invalid stored personas cannot introduce privileged presentations or preview state", () => {
  for (const experiencePersona of ["admin", "owner", "shop", "all_access", {}, true]) {
    const normalized = normalizeAppPersonalizationPreferences({ experiencePersona, preview: { enabled: true, tier: "admin" }, canPreview: true });
    assert.equal(normalized.experiencePersona, "");
    const presentation = resolveExperiencePresentation({ personaPreference: normalized.experiencePersona });
    assert.equal(presentation.persona, "collector");
    assert.equal(presentation.showAdminTools, false);
    assert.equal(presentation.isPreview, false);
    assert.equal(normalized.preview, undefined);
  }
});

for (const result of tests) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.error ? `: ${result.error}` : ""}`);
console.log(`${tests.filter((result) => result.passed).length}/${tests.length} experience presentation checks passed.`);
if (tests.some((result) => !result.passed)) process.exitCode = 1;
