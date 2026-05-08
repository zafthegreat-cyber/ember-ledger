export const PLAN_TYPES = {
  FREE: "free",
  PAID: "paid",
  ADMIN: "admin",
};

export const SUBSCRIPTION_STATUSES = ["active", "inactive", "trialing", "canceled", "past_due"];

export const FEATURE_ACCESS = {
  catalog_basic: ["free", "paid", "admin"],
  catalog_advanced: ["paid", "admin"],
  collection_basic: ["free", "paid", "admin"],
  stores_basic: ["free", "paid", "admin"],
  restock_reports_basic: ["free", "paid", "admin"],
  restock_predictions: ["paid", "admin"],
  alerts_advanced: ["paid", "admin"],
  seller_tools: ["paid", "admin"],
  mileage: ["paid", "admin"],
  expenses: ["paid", "admin"],
  cross_listing: ["paid", "admin"],
  deal_checker_basic: ["free", "paid", "admin"],
  deal_checker_advanced: ["paid", "admin"],
  admin_tools: ["admin"],
};

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
  admin_tools: "Admin Tools",
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
];

export function getUserPlan(profile = {}) {
  if (profile.lifetimeAccess || profile.lifetime_access) return PLAN_TYPES.PAID;
  const plan = profile.subscriptionPlan || profile.subscription_plan || PLAN_TYPES.FREE;
  return Object.values(PLAN_TYPES).includes(plan) ? plan : PLAN_TYPES.FREE;
}

export function hasPlanAccess(profile = {}, featureKey) {
  const plan = getUserPlan(profile);
  const status = profile.subscriptionStatus || profile.subscription_status || "active";
  if (plan === PLAN_TYPES.ADMIN) return true;
  if (!["active", "trialing"].includes(status) && !(profile.lifetimeAccess || profile.lifetime_access)) return false;
  return (FEATURE_ACCESS[featureKey] || []).includes(plan);
}

export function isPaidUser(profile = {}) {
  return hasPlanAccess(profile, "seller_tools") || getUserPlan(profile) === PLAN_TYPES.PAID;
}

export function isAdminUser(profile = {}) {
  return getUserPlan(profile) === PLAN_TYPES.ADMIN;
}

export function getLockedFeatureMessage(featureKey) {
  return `${FEATURE_LABELS[featureKey] || "This feature"} is part of the paid version.`;
}

export function getUpgradePrompt(featureKey) {
  return `${getLockedFeatureMessage(featureKey)} Upgrade to unlock advanced scouting, alerts, seller tools, mileage, expenses, and deeper deal analysis.`;
}

export function sanitizeUserProfileUpdates(updates = {}) {
  return Object.fromEntries(
    Object.entries(updates).filter(([key]) => !PROTECTED_SUBSCRIPTION_FIELDS.includes(key))
  );
}
