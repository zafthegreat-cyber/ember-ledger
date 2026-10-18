import { PLAN_LABELS, PUBLIC_TIER_ORDER } from "../services/featureGates.js";

export const EXPERIENCE_PERSONAS = Object.freeze({
  COLLECTOR: "collector",
  SELLER: "seller",
  STORE: "store",
});

export const EXPERIENCE_PERSONA_OPTIONS = Object.freeze([
  Object.freeze({ value: "collector", label: "Collector", description: "Collect, find restocks, and occasionally sell or trade." }),
  Object.freeze({ value: "seller", label: "Seller", description: "Manage items for sale, purchases, and selling records." }),
  Object.freeze({ value: "store", label: "Store", description: "Organize your store inventory and existing shop tools." }),
]);

export const TIER_PREVIEW_OPTIONS = Object.freeze(PUBLIC_TIER_ORDER.map((tier) => Object.freeze({
  value: tier,
  label: PLAN_LABELS[tier],
  description: tier === "shop"
    ? "Shop Basic and Shop Plus currently share the existing Shop features."
    : `Preview the existing ${PLAN_LABELS[tier]} features.`,
})));

const PERSONA_COPY = {
  collector: {
    recordsTitle: "Your collection",
    recordsDetail: "Keep your collection, wants, and saved finds together.",
    inventoryLabel: "Collection",
    sellingLabel: "Sell or trade",
    workspaceLabel: "Collect",
  },
  seller: {
    recordsTitle: "Your selling records",
    recordsDetail: "Keep your inventory, purchases, and sales organized.",
    inventoryLabel: "Selling inventory",
    sellingLabel: "Selling tools",
    workspaceLabel: "Sell",
  },
  store: {
    recordsTitle: "Your store records",
    recordsDetail: "Keep your store inventory, purchases, and sales organized.",
    inventoryLabel: "Store inventory",
    sellingLabel: "Store tools",
    workspaceLabel: "Store",
  },
};

function key(value) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
}

function personaKey(value) {
  const candidate = key(value);
  return Object.values(EXPERIENCE_PERSONAS).includes(candidate) ? candidate : "";
}

function listKeys(value) {
  return Array.isArray(value) ? value.map(key) : [];
}

/** Public preview tiers only. Invalid or administrative tiers never become a preview. */
export function normalizePreviewTier(value) {
  const candidate = key(value);
  if (["shop_basic", "shop_plus"].includes(candidate)) return "shop";
  return PUBLIC_TIER_ORDER.includes(candidate) ? candidate : null;
}

/**
 * A presentation-only input for existing feature-gate functions. Never merge it
 * into the account or use it for authorization, persistence, or service calls.
 * Building from scratch prevents inherited admin, lifetime, and metadata flags.
 */
export function createTierPreviewProfile(tier) {
  const normalizedTier = normalizePreviewTier(tier);
  return normalizedTier ? { tier: normalizedTier, appRole: "user", subscriptionStatus: "active" } : null;
}

function explicitSetupPersona(setup, userType, dashboardPreset) {
  const primaryMode = key(setup.primaryMode || setup.primary_user_mode || setup.userMode);
  const storeModes = new Set(["store", "shop", "partner_shop", "card_shop_partner"]);
  const explicitModes = [primaryMode, key(userType), key(dashboardPreset)];
  const purposes = listKeys(setup.purposes);
  if (explicitModes.some((mode) => storeModes.has(mode)) || purposes.includes("i_m_a_card_shop_or_partner")) return "store";

  const sellerModes = new Set(["seller", "business", "business_seller", "full_business"]);
  const businessTools = key(setup.businessTools || setup.business_tools);
  if (explicitModes.some((mode) => sellerModes.has(mode)) || [
    "yes_i_need_sales_expenses_mileage_receipts",
    "yes_i_need_year_end_export_tax_support_later",
    "business_seller",
  ].includes(businessTools) || purposes.includes("business_seller")) return "seller";

  // Casual sales, generic selling toolsets, recommendations, record counts, and
  // clicks do not make a collector a professional seller.
  return "collector";
}

function hasExplicitFamilySetup(setup) {
  const familyKeys = new Set([
    "family", "budget_parent", "collector_parent", "collector_family",
    "collect_pokemon_with_my_family_kids", "kids_program", "the_spark_kids_program",
  ]);
  const selections = [
    key(setup.primaryMode || setup.primary_user_mode || setup.userMode),
    ...listKeys(setup.purposes),
    ...listKeys(setup.enabledToolsets),
  ];
  return setup.familyMode === true || selections.some((selection) => familyKeys.has(selection));
}

/**
 * Resolve page wording and prominence, never entitlements or routing authority.
 * The caller supplies trusted canPreview/adminVisible/ownerVisible booleans.
 * Explicit experiencePersona is saved in existing personalization preferences;
 * smart setup may be supplied separately through setupPreferences.
 *
 * copy keys: recordsTitle/recordsDetail for Home, inventoryLabel/sellingLabel for
 * Home and Add, workspaceLabel for display-only navigation labels.
 */
export function resolveExperiencePresentation({
  setupPreferences = {},
  userType = "",
  dashboardPreset = "",
  personaPreference = "",
  adminVisible = false,
  ownerVisible = false,
  preview = {},
  canPreview = false,
} = {}) {
  const setup = setupPreferences && typeof setupPreferences === "object" ? setupPreferences : {};
  const previewState = preview && typeof preview === "object" ? preview : {};
  const requestedTier = normalizePreviewTier(previewState.tier);
  const isPreview = canPreview === true && previewState.enabled === true && requestedTier !== null;
  const previewTier = isPreview ? requestedTier : null;
  const previewDefaultPersona = previewTier === "shop" ? "store" : previewTier === "seller" ? "seller" : "collector";
  const persona = isPreview
    ? personaKey(previewState.persona) || previewDefaultPersona
    : personaKey(personaPreference) || personaKey(setup.experiencePersona) || explicitSetupPersona(setup, userType, dashboardPreset);
  const isCollector = persona === "collector";
  const isSeller = persona === "seller";
  const isStore = persona === "store";
  return {
    persona,
    personaLabel: EXPERIENCE_PERSONA_OPTIONS.find((option) => option.value === persona).label,
    isCollector,
    isSeller,
    isStore,
    isBusiness: isSeller || isStore,
    showBusinessTools: isSeller || isStore,
    showFamilyTools: isPreview ? previewTier === "family" : hasExplicitFamilySetup(setup),
    showAdminTools: adminVisible === true && !isPreview,
    showOwnerTools: ownerVisible === true && !isPreview,
    isPreview,
    previewTier,
    previewTierLabel: previewTier ? PLAN_LABELS[previewTier] : "",
    copy: { ...PERSONA_COPY[persona] },
  };
}
