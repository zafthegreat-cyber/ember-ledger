export const PLAN_IDS = {
  FREE: "free",
  COLLECTOR_PLUS: "collector_plus",
  SELLER_PRO: "seller_pro",
  SCOUT_PREMIUM: "scout_premium",
  ULTIMATE: "ultimate",
  ADMIN: "admin",
};

export const PLAN_TYPES = {
  ...PLAN_IDS,
  SCOUT_PRO: "scout_pro",
  ALL_ACCESS: "all_access",
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

export const TIER_ORDER = [
  PLAN_IDS.FREE,
  PLAN_IDS.COLLECTOR_PLUS,
  PLAN_IDS.SELLER_PRO,
  PLAN_IDS.SCOUT_PREMIUM,
  PLAN_IDS.ULTIMATE,
];

export const SUBSCRIPTION_STATUSES = ["active", "inactive", "trialing", "canceled", "past_due"];

export const PLAN_LABELS = {
  [PLAN_IDS.FREE]: "Free",
  [PLAN_IDS.COLLECTOR_PLUS]: "Collector Plus",
  [PLAN_IDS.SELLER_PRO]: "Seller Pro",
  [PLAN_IDS.SCOUT_PREMIUM]: "Scout Premium",
  [PLAN_IDS.ULTIMATE]: "Ultimate",
  [PLAN_IDS.ADMIN]: "Admin",
  plus: "Collector Plus",
  pro: "Seller Pro",
  paid: "Seller Pro",
  scout_pro: "Scout Premium",
  all_access: "Ultimate",
  founder: "Ultimate",
};

export const TIER_LABELS = PLAN_LABELS;

const ALL_PLANS = [
  PLAN_IDS.FREE,
  PLAN_IDS.COLLECTOR_PLUS,
  PLAN_IDS.SELLER_PRO,
  PLAN_IDS.SCOUT_PREMIUM,
  PLAN_IDS.ULTIMATE,
  PLAN_IDS.ADMIN,
];
const COLLECTOR_PLANS = [PLAN_IDS.COLLECTOR_PLUS, PLAN_IDS.ULTIMATE, PLAN_IDS.ADMIN];
const SELLER_PLANS = [PLAN_IDS.SELLER_PRO, PLAN_IDS.ULTIMATE, PLAN_IDS.ADMIN];
const SCOUT_PLANS = [PLAN_IDS.SCOUT_PREMIUM, PLAN_IDS.ULTIMATE, PLAN_IDS.ADMIN];
const ULTIMATE_PLANS = [PLAN_IDS.ULTIMATE, PLAN_IDS.ADMIN];
const ADMIN_PLANS = [PLAN_IDS.ADMIN];

export const FEATURE_GATES = {
  vault_basic: ALL_PLANS,
  catalog_basic_search: ALL_PLANS,
  manual_add: ALL_PLANS,
  wishlist_basic: ALL_PLANS,
  scout_reports_basic: ALL_PLANS,
  marketplace_draft_basic: ALL_PLANS,
  scanner_search_limited: ALL_PLANS,

  unlimited_vault: COLLECTOR_PLANS,
  unlimited_scans: COLLECTOR_PLANS,
  set_completion: COLLECTOR_PLANS,
  portfolio_value: COLLECTOR_PLANS,
  price_history: COLLECTOR_PLANS,
  wishlist_alerts: COLLECTOR_PLANS,
  variants: COLLECTOR_PLANS,
  graded_slab_tracking: COLLECTOR_PLANS,
  collection_export: COLLECTOR_PLANS,

  forge_inventory: SELLER_PLANS,
  sales_tracking: SELLER_PLANS,
  expenses: SELLER_PLANS,
  mileage: SELLER_PLANS,
  receipt_scan_review: SELLER_PLANS,
  profit_loss: SELLER_PLANS,
  deal_finder: SELLER_PLANS,
  marketplace_exports: SELLER_PLANS,
  listing_prep: SELLER_PLANS,
  cross_listing_status: SELLER_PLANS,
  business_reports: SELLER_PLANS,

  scout_route_planner: SCOUT_PLANS,
  restock_predictions: SCOUT_PLANS,
  store_confidence_scores: SCOUT_PLANS,
  watchlist_route_planning: SCOUT_PLANS,
  advanced_store_history: SCOUT_PLANS,
  text_alerts: SCOUT_PLANS,
  online_monitor: SCOUT_PLANS,
  auto_open_page: SCOUT_PLANS,

  shared_workspace: ULTIMATE_PLANS,
  team_access: ULTIMATE_PLANS,
  advanced_reports: ULTIMATE_PLANS,
  priority_alerts: ULTIMATE_PLANS,
  export_tools: ULTIMATE_PLANS,

  admin_review: ADMIN_PLANS,
  admin_catalog_manage: ADMIN_PLANS,
  admin_store_manage: ADMIN_PLANS,

  // Legacy feature keys used by current UI.
  catalog_basic: ALL_PLANS,
  catalog_advanced: COLLECTOR_PLANS,
  catalog_advanced_details: COLLECTOR_PLANS,
  collection_basic: ALL_PLANS,
  stores_basic: ALL_PLANS,
  restock_reports_basic: ALL_PLANS,
  scout_view_reports: ALL_PLANS,
  scout_submit_reports: ALL_PLANS,
  scout_alerts: SCOUT_PLANS,
  scout_predictions: SCOUT_PLANS,
  scout_verified_tips: SCOUT_PLANS,
  alerts_advanced: SCOUT_PLANS,
  seller_tools: SELLER_PLANS,
  forge_sales: SELLER_PLANS,
  forge_expenses: SELLER_PLANS,
  forge_mileage: SELLER_PLANS,
  forge_reports: SELLER_PLANS,
  forge_import: SELLER_PLANS,
  vault_unlimited: COLLECTOR_PLANS,
  vault_scan_add: COLLECTOR_PLANS,
  vault_export: COLLECTOR_PLANS,
  deal_calculator_limited: ALL_PLANS,
  deal_calculator_unlimited: SELLER_PLANS,
  deal_checker_basic: ALL_PLANS,
  deal_checker_advanced: SELLER_PLANS,
  market_price_history: COLLECTOR_PLANS,
  cross_listing: SELLER_PLANS,
  founder_tools: ULTIMATE_PLANS,
  admin_tools: ADMIN_PLANS,
};

export const FEATURE_ACCESS = FEATURE_GATES;

export const FEATURE_LABELS = {
  vault_basic: "Basic Vault",
  catalog_basic_search: "Basic Catalog Search",
  manual_add: "Manual Add",
  wishlist_basic: "Basic Wishlist",
  scout_reports_basic: "Basic Scout Reports",
  marketplace_draft_basic: "Basic Marketplace Draft",
  scanner_search_limited: "Limited Scanner/Search",
  unlimited_vault: "Unlimited Vault",
  unlimited_scans: "Unlimited Scans/Searches",
  set_completion: "Set Completion",
  portfolio_value: "Portfolio Value",
  price_history: "Price History",
  wishlist_alerts: "Wishlist Alerts",
  variants: "Variants",
  graded_slab_tracking: "Graded/Slab Tracking",
  collection_export: "Collection Export",
  forge_inventory: "Forge Inventory",
  sales_tracking: "Sales Tracking",
  expenses: "Expenses",
  mileage: "Mileage",
  receipt_scan_review: "Receipt Scan/Review",
  profit_loss: "Profit/Loss",
  deal_finder: "Deal Finder",
  marketplace_exports: "Marketplace CSV Exports",
  listing_prep: "Whatnot/eBay/Facebook Listing Prep",
  cross_listing_status: "Cross-listing Status",
  business_reports: "Business Reports",
  scout_route_planner: "Scout Route Planner",
  restock_predictions: "Predicted Restock Windows",
  store_confidence_scores: "Store Confidence Scores",
  watchlist_route_planning: "Watchlist Route Planning",
  advanced_store_history: "Advanced Store History",
  text_alerts: "Text Alerts",
  online_monitor: "Online Monitor",
  auto_open_page: "Auto-open Page",
  shared_workspace: "Shared Workspace",
  team_access: "Team Access",
  advanced_reports: "Advanced Reports",
  priority_alerts: "Priority Alerts",
  export_tools: "Export Tools",
  admin_review: "Admin Review",
  admin_catalog_manage: "Catalog Management",
  admin_store_manage: "Store Management",
  catalog_basic: "Basic Catalog",
  catalog_advanced: "Advanced Catalog",
  catalog_advanced_details: "Advanced Catalog Details",
  collection_basic: "Basic Collection",
  stores_basic: "Store Directory",
  restock_reports_basic: "Basic Restock Reports",
  scout_view_reports: "Scout Reports",
  scout_submit_reports: "Submit Scout Reports",
  scout_alerts: "Scout Alerts",
  scout_predictions: "Scout Predictions",
  scout_verified_tips: "Verified Scout Tips",
  alerts_advanced: "Advanced Alerts",
  seller_tools: "Seller / Forge Tools",
  forge_sales: "Forge Sales",
  forge_expenses: "Forge Expenses",
  forge_mileage: "Forge Mileage",
  forge_reports: "Forge Reports",
  forge_import: "Forge Import",
  vault_unlimited: "Unlimited Vault",
  vault_scan_add: "Scan to Vault",
  vault_export: "Vault Export",
  deal_calculator_limited: "Limited Deal Calculator",
  deal_calculator_unlimited: "Unlimited Deal Calculator",
  deal_checker_basic: "Basic Deal Checker",
  deal_checker_advanced: "Advanced Deal Checker",
  market_price_history: "Market Price History",
  cross_listing: "Cross-listing",
  founder_tools: "Ultimate Tools",
  admin_tools: "Admin Tools",
};

export const FEATURE_DESCRIPTIONS = {
  receipt_scan_review: "Scan or upload a receipt, review extracted lines, choose destinations, and submit a verified report.",
  deal_finder: "Evaluate deal pricing, market value, MSRP, ROI, and save deal checks.",
  marketplace_exports: "Export marketplace drafts to CSV formats for listing prep.",
  scout_route_planner: "Plan store runs using watchlists, distance, and store confidence.",
  restock_predictions: "View predicted restock windows and restock confidence.",
  set_completion: "Track master set progress and completion gaps.",
  portfolio_value: "Track collector cost basis, market value, and portfolio summary.",
  shared_workspace: "Use team/shared workspaces and permissions.",
  team_access: "Invite teammates and share selected workspaces.",
};

export const FEATURE_TIERS = Object.fromEntries(
  Object.entries(FEATURE_GATES).map(([featureKey, tiers]) => [featureKey, tiers[0] || PLAN_IDS.FREE])
);

export const FEATURE_MIN_TIER_LABELS = Object.fromEntries(
  Object.entries(FEATURE_TIERS).map(([featureKey, planId]) => [featureKey, PLAN_LABELS[planId] || "Paid"])
);

export const PLAN_FEATURE_GROUPS = [
  {
    id: PLAN_IDS.FREE,
    label: PLAN_LABELS[PLAN_IDS.FREE],
    features: ["vault_basic", "catalog_basic_search", "scanner_search_limited", "manual_add", "wishlist_basic", "scout_reports_basic", "marketplace_draft_basic"],
  },
  {
    id: PLAN_IDS.COLLECTOR_PLUS,
    label: PLAN_LABELS[PLAN_IDS.COLLECTOR_PLUS],
    features: ["unlimited_vault", "unlimited_scans", "set_completion", "portfolio_value", "price_history", "wishlist_alerts", "variants", "graded_slab_tracking", "collection_export"],
  },
  {
    id: PLAN_IDS.SELLER_PRO,
    label: PLAN_LABELS[PLAN_IDS.SELLER_PRO],
    features: ["forge_inventory", "sales_tracking", "expenses", "mileage", "receipt_scan_review", "profit_loss", "deal_finder", "marketplace_exports", "listing_prep", "cross_listing_status", "business_reports"],
  },
  {
    id: PLAN_IDS.SCOUT_PREMIUM,
    label: PLAN_LABELS[PLAN_IDS.SCOUT_PREMIUM],
    features: ["scout_route_planner", "restock_predictions", "store_confidence_scores", "watchlist_route_planning", "advanced_store_history", "text_alerts", "online_monitor", "auto_open_page"],
  },
  {
    id: PLAN_IDS.ULTIMATE,
    label: PLAN_LABELS[PLAN_IDS.ULTIMATE],
    features: ["shared_workspace", "team_access", "advanced_reports", "priority_alerts", "export_tools"],
  },
];

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

function metadataFlag(value) {
  return value === true || String(value || "").toLowerCase() === "true";
}

function runtimeQaUnlock(options = {}) {
  if (options.qaUnlock !== undefined) return Boolean(options.qaUnlock);
  const envUnlock = import.meta.env?.VITE_QA_UNLOCK_PAID_FEATURES === "true";
  let paramUnlock = false;
  try {
    paramUnlock = new URLSearchParams(globalThis.location?.search || "").get("qaUnlockPaid") === "true";
  } catch {
    paramUnlock = false;
  }
  return envUnlock || paramUnlock;
}

export function normalizeTier(value) {
  const tier = String(value || PLAN_IDS.FREE).toLowerCase();
  if (tier === PLAN_TYPES.PLUS) return PLAN_IDS.COLLECTOR_PLUS;
  if (tier === PLAN_TYPES.PRO || tier === PLAN_TYPES.PAID) return PLAN_IDS.SELLER_PRO;
  if (tier === PLAN_TYPES.SCOUT_PRO) return PLAN_IDS.SCOUT_PREMIUM;
  if (tier === PLAN_TYPES.ALL_ACCESS || tier === PLAN_TYPES.FOUNDER) return PLAN_IDS.ULTIMATE;
  if (tier === PLAN_TYPES.ADMIN) return PLAN_IDS.ADMIN;
  return [...TIER_ORDER, PLAN_IDS.ADMIN].includes(tier) ? tier : PLAN_IDS.FREE;
}

export function normalizeUserRole(value) {
  const role = String(value || USER_ROLES.USER).toLowerCase();
  return Object.values(USER_ROLES).includes(role) ? role : USER_ROLES.USER;
}

export function getUserTier(profile = {}) {
  if (profile.lifetimeAccess || profile.lifetime_access) return PLAN_IDS.ULTIMATE;
  return normalizeTier(profile.tier || profile.featureTier || profile.feature_tier || profile.subscriptionPlan || profile.subscription_plan);
}

export function getUserPlan(profile = {}) {
  return getUserTier(profile);
}

export function isBetaTester(profile = {}) {
  const appMetadata = profile.app_metadata || profile.raw_app_meta_data || profile.rawAppMetaData || {};
  return Boolean(
    profile.betaTester ||
    profile.beta_tester ||
    profile.isBetaTester ||
    profile.is_beta_tester ||
    appMetadata.beta_tester ||
    appMetadata.betaTester ||
    metadataFlag(profile.betaTester) ||
    metadataFlag(profile.beta_tester) ||
    metadataFlag(appMetadata.beta_tester) ||
    metadataFlag(appMetadata.betaTester)
  );
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
    metadataFlag(profile.isAdmin) ||
    metadataFlag(profile.is_admin) ||
    metadataFlag(appMetadata.is_admin) ||
    metadataFlag(appMetadata.isAdmin);
  return role === USER_ROLES.ADMIN || metadataAdmin || tier === PLAN_IDS.ADMIN;
}

export function canUseFeature(userPlan = PLAN_IDS.FREE, featureKey, options = {}) {
  if (options.admin || runtimeQaUnlock(options) || options.betaTester) return true;
  const profile = typeof userPlan === "object" && userPlan !== null ? userPlan : {};
  if (typeof userPlan === "object" && (isAdminUser(profile) || isBetaTester(profile))) return true;
  const tier = typeof userPlan === "object" ? getUserTier(profile) : normalizeTier(userPlan);
  const allowedPlans = FEATURE_GATES[featureKey];
  if (!allowedPlans) return false;
  return allowedPlans.map(normalizeTier).includes(tier);
}

export function hasPlanAccess(profile = {}, featureKey, options = {}) {
  if (options.admin || isAdminUser(profile)) return true;
  if (runtimeQaUnlock(options) || options.betaTester || isBetaTester(profile)) return true;
  const plan = getUserTier(profile);
  const status = profile.subscriptionStatus || profile.subscription_status || "active";
  if (plan === PLAN_IDS.ADMIN) return true;
  if (!["active", "trialing"].includes(status) && !(profile.lifetimeAccess || profile.lifetime_access)) return false;
  return canUseFeature(plan, featureKey, options);
}

export function getUnlockedFeatures(userPlan = PLAN_IDS.FREE, options = {}) {
  return Object.keys(FEATURE_GATES).filter((featureKey) => canUseFeature(userPlan, featureKey, options));
}

export function getLockedFeatures(userPlan = PLAN_IDS.FREE, options = {}) {
  return Object.keys(FEATURE_GATES).filter((featureKey) => !canUseFeature(userPlan, featureKey, options));
}

export function isPaidUser(profile = {}) {
  if (isAdminUser(profile) || isBetaTester(profile)) return true;
  return TIER_ORDER.indexOf(getUserTier(profile)) >= TIER_ORDER.indexOf(PLAN_IDS.COLLECTOR_PLUS);
}

export function getLockedFeatureMessage(featureKey) {
  const tier = FEATURE_MIN_TIER_LABELS[featureKey] || "paid";
  return `${FEATURE_LABELS[featureKey] || "This feature"} is part of the ${tier} tier.`;
}

export function getUpgradePrompt(featureKey) {
  const description = FEATURE_DESCRIPTIONS[featureKey];
  return `${getLockedFeatureMessage(featureKey)} ${description || "Billing is coming soon; request beta access if you need this during testing."}`;
}

export function sanitizeUserProfileUpdates(updates = {}) {
  return Object.fromEntries(
    Object.entries(updates).filter(([key]) => !PROTECTED_SUBSCRIPTION_FIELDS.includes(key))
  );
}
