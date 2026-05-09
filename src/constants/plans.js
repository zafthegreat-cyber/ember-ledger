export const PLAN_TYPES = {
  FREE: "free",
  COLLECTOR_PLUS: "collector_plus",
  SELLER_PRO: "seller_pro",
  SCOUT_PRO: "scout_pro",
  ALL_ACCESS: "all_access",
  ADMIN: "admin",
  // Legacy aliases kept so older saved local beta profiles do not break.
  PLUS: "plus",
  PRO: "pro",
  FOUNDER: "founder",
  PAID: "paid",
};

export const USER_ROLES = {
  ADMIN: "admin",
  MODERATOR: "moderator",
  TRUSTED_SCOUT: "trusted_scout",
  USER: "user",
};

export const TIER_ORDER = ["free", "collector_plus", "seller_pro", "scout_pro", "all_access"];
export const SUBSCRIPTION_STATUSES = ["active", "inactive", "trialing", "canceled", "past_due"];

export const FEATURE_ACCESS = {
  catalog_basic_search: ["free", "collector_plus", "seller_pro", "scout_pro", "all_access", "admin"],
  catalog_advanced_details: ["collector_plus", "seller_pro", "scout_pro", "all_access", "admin"],
  vault_basic: ["free", "collector_plus", "seller_pro", "scout_pro", "all_access", "admin"],
  vault_unlimited: ["collector_plus", "all_access", "admin"],
  vault_scan_add: ["collector_plus", "all_access", "admin"],
  vault_export: ["collector_plus", "seller_pro", "all_access", "admin"],
  forge_inventory: ["seller_pro", "all_access", "admin"],
  forge_sales: ["seller_pro", "all_access", "admin"],
  forge_expenses: ["seller_pro", "all_access", "admin"],
  forge_mileage: ["seller_pro", "all_access", "admin"],
  forge_reports: ["seller_pro", "all_access", "admin"],
  forge_import: ["seller_pro", "all_access", "admin"],
  scout_view_reports: ["free", "collector_plus", "seller_pro", "scout_pro", "all_access", "admin"],
  scout_submit_reports: ["free", "collector_plus", "seller_pro", "scout_pro", "all_access", "admin"],
  scout_alerts: ["scout_pro", "all_access", "admin"],
  scout_predictions: ["scout_pro", "all_access", "admin"],
  scout_verified_tips: ["scout_pro", "all_access", "admin"],
  deal_calculator_limited: ["free", "collector_plus", "seller_pro", "scout_pro", "all_access", "admin"],
  deal_calculator_unlimited: ["seller_pro", "all_access", "admin"],
  market_price_history: ["collector_plus", "seller_pro", "scout_pro", "all_access", "admin"],
  text_alerts: ["scout_pro", "all_access", "admin"],
  admin_review: ["admin"],
  admin_catalog_manage: ["admin"],
  admin_store_manage: ["admin"],

  // Legacy feature keys used by current components.
  catalog_basic: ["free", "collector_plus", "seller_pro", "scout_pro", "all_access", "admin"],
  catalog_advanced: ["collector_plus", "seller_pro", "scout_pro", "all_access", "admin"],
  collection_basic: ["free", "collector_plus", "seller_pro", "scout_pro", "all_access", "admin"],
  stores_basic: ["free", "collector_plus", "seller_pro", "scout_pro", "all_access", "admin"],
  restock_reports_basic: ["free", "collector_plus", "seller_pro", "scout_pro", "all_access", "admin"],
  restock_predictions: ["scout_pro", "all_access", "admin"],
  alerts_advanced: ["scout_pro", "all_access", "admin"],
  seller_tools: ["seller_pro", "all_access", "admin"],
  mileage: ["seller_pro", "all_access", "admin"],
  expenses: ["seller_pro", "all_access", "admin"],
  cross_listing: ["seller_pro", "all_access", "admin"],
  deal_checker_basic: ["free", "collector_plus", "seller_pro", "scout_pro", "all_access", "admin"],
  deal_checker_advanced: ["seller_pro", "all_access", "admin"],
  founder_tools: ["all_access", "admin"],
  admin_tools: ["admin"],
};

export const FEATURE_TIERS = Object.fromEntries(
  Object.entries(FEATURE_ACCESS).map(([featureKey, tiers]) => [featureKey, tiers[0]])
);

export const PAID_HOME_STATS = [
  "monthly_profit_loss",
  "market_roi",
  "planned_roi",
  "forge_planned_sales",
  "planned_profit",
  "forge_sales_revenue",
  "forge_profit",
  "expenses",
  "profit_after_expenses",
  "business_miles",
  "total_vehicle_cost",
];

export const FEATURE_LABELS = {
  catalog_basic_search: "Basic Catalog Search",
  catalog_advanced_details: "Advanced Catalog Details",
  vault_basic: "Basic Vault",
  vault_unlimited: "Unlimited Vault",
  vault_scan_add: "Scan to Vault",
  vault_export: "Vault Export",
  forge_inventory: "Forge Inventory",
  forge_sales: "Forge Sales",
  forge_expenses: "Forge Expenses",
  forge_mileage: "Forge Mileage",
  forge_reports: "Forge Reports",
  forge_import: "Forge Import",
  scout_view_reports: "Scout Reports",
  scout_submit_reports: "Submit Scout Reports",
  scout_alerts: "Scout Alerts",
  scout_predictions: "Scout Predictions",
  scout_verified_tips: "Verified Scout Tips",
  deal_calculator_limited: "Limited Deal Calculator",
  deal_calculator_unlimited: "Unlimited Deal Calculator",
  market_price_history: "Market Price History",
  text_alerts: "Text Alerts",
  admin_review: "Admin Review",
  admin_catalog_manage: "Catalog Management",
  admin_store_manage: "Store Management",
  catalog_basic: "Basic Catalog",
  catalog_advanced: "Advanced Catalog",
  collection_basic: "Basic Collection",
  stores_basic: "Store Directory",
  restock_reports_basic: "Basic Restock Reports",
  restock_predictions: "Restock Predictions",
  alerts_advanced: "Advanced Alerts",
  seller_tools: "Seller / Forge Tools",
  mileage: "Mileage Tracking",
  expenses: "Expenses",
  cross_listing: "Cross-listing",
  deal_checker_basic: "Basic Deal Checker",
  deal_checker_advanced: "Advanced Deal Checker",
  founder_tools: "All Access Tools",
  admin_tools: "Admin Tools",
};

export const TIER_LABELS = {
  free: "Free",
  collector_plus: "Collector Plus",
  seller_pro: "Seller Pro",
  scout_pro: "Scout Pro",
  all_access: "All Access",
  admin: "Admin",
  plus: "Collector Plus",
  pro: "Seller Pro",
  founder: "All Access",
  paid: "Seller Pro",
};

export const PROTECTED_SUBSCRIPTION_FIELDS = [
  "subscription_plan",
  "subscriptionPlan",
  "subscription_status",
  "subscriptionStatus",
  "subscription_started_at",
  "subscriptionStartedAt",
  "subscription_expires_at",
  "subscriptionExpiresAt",
  "lifetime_access",
  "lifetimeAccess",
  "feature_tier",
  "featureTier",
  "tier",
  "user_role",
  "userRole",
  "isAdmin",
  "is_admin",
];

export function normalizeTier(value) {
  const tier = String(value || PLAN_TYPES.FREE).toLowerCase();
  if (tier === PLAN_TYPES.PLUS) return PLAN_TYPES.COLLECTOR_PLUS;
  if (tier === PLAN_TYPES.PRO || tier === PLAN_TYPES.PAID) return PLAN_TYPES.SELLER_PRO;
  if (tier === PLAN_TYPES.FOUNDER) return PLAN_TYPES.ALL_ACCESS;
  if (tier === PLAN_TYPES.ADMIN) return PLAN_TYPES.ADMIN;
  return [...TIER_ORDER, PLAN_TYPES.ADMIN].includes(tier) ? tier : PLAN_TYPES.FREE;
}

export function normalizeUserRole(value) {
  const role = String(value || USER_ROLES.USER).toLowerCase();
  return Object.values(USER_ROLES).includes(role) ? role : USER_ROLES.USER;
}

export function getUserTier(profile = {}) {
  if (profile.lifetimeAccess || profile.lifetime_access) return PLAN_TYPES.ALL_ACCESS;
  return normalizeTier(profile.tier || profile.featureTier || profile.feature_tier || profile.subscriptionPlan || profile.subscription_plan);
}

export function getUserPlan(profile = {}) {
  return getUserTier(profile);
}

export function canUseFeature(userTier, featureName) {
  const tier = typeof userTier === "object" ? getUserTier(userTier) : normalizeTier(userTier);
  if (typeof userTier === "object" && isAdminUser(userTier)) return true;
  if (tier === PLAN_TYPES.ADMIN) return true;
  return (FEATURE_ACCESS[featureName] || []).includes(tier);
}

export function hasPlanAccess(profile = {}, featureKey) {
  const plan = getUserTier(profile);
  if (isAdminUser(profile)) return true;
  const status = profile.subscriptionStatus || profile.subscription_status || "active";
  if (plan === PLAN_TYPES.ADMIN) return true;
  if (!["active", "trialing"].includes(status) && !(profile.lifetimeAccess || profile.lifetime_access)) return false;
  return canUseFeature(plan, featureKey);
}

export function isPaidUser(profile = {}) {
  if (isAdminUser(profile)) return true;
  return TIER_ORDER.indexOf(getUserTier(profile)) >= TIER_ORDER.indexOf(PLAN_TYPES.COLLECTOR_PLUS);
}

export function isAdminUser(profile = {}) {
  const appMetadata = profile.app_metadata || profile.raw_app_meta_data || profile.rawAppMetaData || {};
  const role = normalizeUserRole(
    profile.userRole ||
      profile.user_role ||
      appMetadata.role ||
      appMetadata.user_role
  );
  const tier = getUserTier({
    ...profile,
    tier: profile.tier || appMetadata.tier,
    featureTier: profile.featureTier || appMetadata.feature_tier,
    subscriptionPlan: profile.subscriptionPlan || appMetadata.subscription_plan,
  });
  const metadataAdmin =
    profile.isAdmin === true ||
    profile.is_admin === true ||
    String(profile.isAdmin || "").toLowerCase() === "true" ||
    String(profile.is_admin || "").toLowerCase() === "true" ||
    appMetadata.is_admin === true ||
    appMetadata.isAdmin === true ||
    String(appMetadata.is_admin || "").toLowerCase() === "true" ||
    String(appMetadata.isAdmin || "").toLowerCase() === "true";
  return role === USER_ROLES.ADMIN || metadataAdmin || tier === PLAN_TYPES.ADMIN;
}

export function getLockedFeatureMessage(featureKey) {
  const tier = TIER_LABELS[FEATURE_TIERS[featureKey]] || "premium";
  return `${FEATURE_LABELS[featureKey] || "This feature"} is part of the ${tier} tier.`;
}

export function getUpgradePrompt(featureKey) {
  return `${getLockedFeatureMessage(featureKey)} Upgrade to unlock advanced scouting, alerts, seller tools, mileage, expenses, and deeper deal analysis.`;
}

export function sanitizeUserProfileUpdates(updates = {}) {
  return Object.fromEntries(
    Object.entries(updates).filter(([key]) => !PROTECTED_SUBSCRIPTION_FIELDS.includes(key))
  );
}
