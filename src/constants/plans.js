export const PLAN_TYPES = {
  FREE: "free",
  PLUS: "plus",
  PRO: "pro",
  FOUNDER: "founder",
  PAID: "paid",
  ADMIN: "admin",
};

export const TIER_ORDER = ["free", "plus", "pro", "founder", "admin"];
export const SUBSCRIPTION_STATUSES = ["active", "inactive", "trialing", "canceled", "past_due"];

export const FEATURE_ACCESS = {
  catalog_basic: ["free", "plus", "pro", "founder", "admin"],
  catalog_advanced: ["plus", "pro", "founder", "admin"],
  collection_basic: ["free", "plus", "pro", "founder", "admin"],
  stores_basic: ["free", "plus", "pro", "founder", "admin"],
  restock_reports_basic: ["free", "plus", "pro", "founder", "admin"],
  restock_predictions: ["plus", "pro", "founder", "admin"],
  alerts_advanced: ["plus", "pro", "founder", "admin"],
  seller_tools: ["pro", "founder", "admin"],
  mileage: ["pro", "founder", "admin"],
  expenses: ["pro", "founder", "admin"],
  cross_listing: ["pro", "founder", "admin"],
  deal_checker_basic: ["free", "plus", "pro", "founder", "admin"],
  deal_checker_advanced: ["plus", "pro", "founder", "admin"],
  founder_tools: ["founder", "admin"],
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
  founder_tools: "Founder Tools",
  admin_tools: "Admin Tools",
};

export const TIER_LABELS = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
  founder: "Founder",
  paid: "Pro",
  admin: "Admin",
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
];

export function normalizeTier(value) {
  const tier = String(value || PLAN_TYPES.FREE).toLowerCase();
  if (tier === PLAN_TYPES.PAID) return PLAN_TYPES.PRO;
  return Object.values(PLAN_TYPES).includes(tier) ? tier : PLAN_TYPES.FREE;
}

export function getUserTier(profile = {}) {
  if (profile.lifetimeAccess || profile.lifetime_access) return PLAN_TYPES.FOUNDER;
  return normalizeTier(profile.featureTier || profile.feature_tier || profile.subscriptionPlan || profile.subscription_plan);
}

export function getUserPlan(profile = {}) {
  return getUserTier(profile);
}

export function hasPlanAccess(profile = {}, featureKey) {
  const plan = getUserTier(profile);
  const status = profile.subscriptionStatus || profile.subscription_status || "active";
  if ([PLAN_TYPES.ADMIN, PLAN_TYPES.FOUNDER].includes(plan) && featureKey !== "admin_tools") return true;
  if (plan === PLAN_TYPES.ADMIN) return true;
  if (!["active", "trialing"].includes(status) && !(profile.lifetimeAccess || profile.lifetime_access)) return false;
  return (FEATURE_ACCESS[featureKey] || []).includes(plan);
}

export function isPaidUser(profile = {}) {
  return TIER_ORDER.indexOf(getUserTier(profile)) >= TIER_ORDER.indexOf(PLAN_TYPES.PLUS);
}

export function isAdminUser(profile = {}) {
  return getUserPlan(profile) === PLAN_TYPES.ADMIN;
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
