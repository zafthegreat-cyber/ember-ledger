export const PLAN_IDS = {
  FREE: "free",
  COLLECTOR: "collector",
  FAMILY: "family",
  SELLER: "seller",
  SHOP: "shop",
  ADMIN: "admin",

  // Legacy constants kept so older stored profiles and imports normalize cleanly.
  COLLECTOR_PLUS: "collector",
  SELLER_PRO: "seller",
  SCOUT_PREMIUM: "collector",
  ULTIMATE: "seller",
  SHOP_BASIC: "shop",
  SHOP_PLUS: "shop",
};

export const PLAN_TYPES = {
  FREE: "free",
  COLLECTOR: "collector",
  FAMILY: "family",
  SELLER: "seller",
  SHOP: "shop",
  ADMIN: "admin",

  COLLECTOR_PLUS: "collector_plus",
  SELLER_PRO: "seller_pro",
  SCOUT_PREMIUM: "scout_premium",
  SCOUT_PRO: "scout_pro",
  ULTIMATE: "ultimate",
  ALL_ACCESS: "all_access",
  PLUS: "plus",
  PRO: "pro",
  FOUNDER: "founder",
  PAID: "paid",
  SHOP_BASIC: "shop_basic",
  SHOP_PLUS: "shop_plus",
};

export const USER_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MODERATOR: "moderator",
  BETA_USER: "beta_user",
  TRUSTED_SCOUT: "trusted_scout",
  USER: "user",
};

export const PUBLIC_TIER_ORDER = [
  PLAN_IDS.FREE,
  PLAN_IDS.COLLECTOR,
  PLAN_IDS.FAMILY,
  PLAN_IDS.SELLER,
  PLAN_IDS.SHOP,
];

export const TIER_ORDER = PUBLIC_TIER_ORDER;

export const SUBSCRIPTION_STATUSES = ["active", "inactive", "trialing", "canceled", "past_due"];

export const PLAN_LABELS = {
  [PLAN_IDS.FREE]: "Free",
  [PLAN_IDS.COLLECTOR]: "Collector",
  [PLAN_IDS.FAMILY]: "Family",
  [PLAN_IDS.SELLER]: "Seller",
  [PLAN_IDS.SHOP]: "Shop",
  [PLAN_IDS.ADMIN]: "Admin",
  collector_plus: "Collector",
  seller_pro: "Seller",
  scout_premium: "Collector",
  scout_pro: "Collector",
  ultimate: "Seller",
  all_access: "Seller",
  plus: "Collector",
  pro: "Seller",
  paid: "Seller",
  founder: "Seller",
  shop_basic: "Shop",
  shop_plus: "Shop",
};

export const TIER_LABELS = PLAN_LABELS;

export const TIER_PRICING = {
  [PLAN_IDS.FREE]: {
    id: PLAN_IDS.FREE,
    label: "Free",
    price: "$0",
    summary: "Complete core collector tools for building a collection, checking fair value, and helping Scout safely.",
    trialCopy: "No trial needed.",
    futurePrice: "",
    cta: "Included during beta",
    features: [
      "Manual card, sealed, and graded item tracking",
      "Folders, tags, wishlist, favorites, missing cards, and set progress",
      "Basic fair range, collection value, card search, and product search",
      "Basic trade analyzer, deck/list builder, and Forge ledger",
      "Follow 1 Scout store",
      "Change Scout store once every 30 days",
      "Submit and confirm Scout reports",
      "Screenshot scan flow UI and proof review UI",
      "Add proof or context where supported",
      "Limited current Scout details",
      "Tidepool read/report, The Spark view, and Ember Assist prompts",
      "No raw Scout history or restock pattern tools",
    ],
  },
  [PLAN_IDS.COLLECTOR]: {
    id: PLAN_IDS.COLLECTOR,
    label: "Collector",
    price: "$1.99/month beta price",
    summary: "More selected-store Scout context plus collection, wishlist, and set-progress tools.",
    trialCopy: "7-day free trial planned for launch.",
    futurePrice: "Later $2.99/month.",
    cta: "Ask admin to upgrade during beta",
    features: [
      "Everything in Free",
      "Follow 3 Scout stores",
      "Swap 1 Scout store every 14 days",
      "Deeper current Scout details for selected stores",
      "Collection tools, wishlist/chase list, and binder/set progress",
      "Saved Market searches/watchlists where supported",
      "No all-store exact Scout access, raw history, or pattern tools",
    ],
  },
  [PLAN_IDS.FAMILY]: {
    id: PLAN_IDS.FAMILY,
    label: "Family",
    price: "$3.99/month beta price",
    summary: "Collector tools plus parent-managed kid profiles and family collection views.",
    trialCopy: "7-day free trial planned for launch.",
    futurePrice: "Later $4.99/month.",
    cta: "Ask admin to upgrade during beta",
    features: [
      "Everything in Collector",
      "1 primary adult included",
      "2 kid profiles included",
      "Family Vault and kid-safe Vault views",
      "Kid wishlists, chase lists, and collection progress",
      "Parent-managed privacy and sharing",
      "The Spark family reminders",
    ],
  },
  [PLAN_IDS.SELLER]: {
    id: PLAN_IDS.SELLER,
    label: "Seller",
    price: "$5.99/month beta price",
    summary: "Collector tools plus Forge business tracking for sellers.",
    trialCopy: "7-day free trial planned for launch.",
    futurePrice: "Later $7.99/month.",
    cta: "Ask admin to upgrade during beta",
    features: [
      "Collector features plus Forge business tools",
      "Forge sales and expense tracking",
      "Cost basis, profit/loss, inventory value, and seller dashboard",
      "Export/tax-support summaries",
      "Business partner add-on copy",
      "Does not unlock raw Scout history, patterns, or all-store exact access",
    ],
  },
  [PLAN_IDS.SHOP]: {
    id: PLAN_IDS.SHOP,
    label: "Shop",
    price: "Shop Basic $19/month",
    summary: "Shop profile and directory foundation for family-friendly local shops.",
    trialCopy: "Shop Plus $39/month. Shop trust labels are admin-reviewed.",
    futurePrice: "Checkout coming soon; beta upgrades are admin-managed.",
    cta: "Ask admin about shop access",
    features: [
      "Shop profile and family-friendly shop directory",
      "Store rules, limits, events, and donation/support interest",
      "Trusted Family Friend application",
      "Featured placement for Shop Plus",
      "Shop trust labels are admin-reviewed, not automatic payment-based",
      "Staff seat and extra location add-on copy",
    ],
  },
};

export const TIER_ADD_ONS = [
  { id: "extra_kid_profile", label: "Extra kid profile", price: "$0.99/month", appliesTo: "Family", status: "Coming soon" },
  { id: "extra_adult_family_member", label: "Extra adult family member", price: "$0.99/month", appliesTo: "Family", status: "Coming soon" },
  { id: "extra_scout_store", label: "Extra Scout store", price: "$0.99/month", appliesTo: "Collector, Family, Seller", status: "Coming soon" },
  { id: "seller_business_partner", label: "Seller/business partner", price: "$1.99/month", appliesTo: "Seller", status: "Coming soon" },
  { id: "shop_staff_seat", label: "Shop staff seat", price: "$2.99/month", appliesTo: "Shop", status: "Coming soon" },
  { id: "extra_shop_location", label: "Extra shop location", price: "$9.99/month", appliesTo: "Shop", status: "Coming soon" },
];

export const TIER_DISPLAY_GUIDANCE = {
  [PLAN_IDS.FREE]: {
    status: "Included",
    audience: "Families, collectors, and Scout helpers",
    benefit: "Start safely with current reports, one watched Scout store, and core collection tools.",
    gateCopy: "1 Scout watch store | change once every 30 days | raw Scout history and pattern tools protected.",
  },
  [PLAN_IDS.COLLECTOR]: {
    status: "Beta path",
    audience: "Collectors",
    benefit: "Adds deeper collection tools and more selected-store context while keeping Scout fair.",
    gateCopy: "3 watched stores | 14-day store changes | 7-day free trial planned.",
  },
  [PLAN_IDS.FAMILY]: {
    status: "Beta path",
    audience: "Families",
    benefit: "Collector plus parent-managed family and kid support where currently available.",
    gateCopy: "Includes 2 kid profiles in the model | extra child accounts are add-ons when supported.",
  },
  [PLAN_IDS.SELLER]: {
    status: "Beta path",
    audience: "Sellers",
    benefit: "Adds Forge business tools for inventory, sales, receipts, expenses, and profit/loss.",
    gateCopy: "Seller tools do not unlock raw Scout history, all-store access, or pattern windows.",
  },
  [PLAN_IDS.SHOP]: {
    status: "Partner review",
    audience: "Shops and partners",
    benefit: "Supports shop profile, sponsor, reviewed partner, and family-friendly shop surfaces.",
    gateCopy: "Shop trust labels are admin-reviewed and not automatic payment-based.",
  },
};

export const TIER_ACCESS_RULES = {
  [PLAN_IDS.FREE]: {
    scoutStoreSlots: 1,
    scoutStoreSwapDays: 30,
    maxKidProfilesIncluded: 0,
    maxExtraKidProfiles: 0,
    maxAdultMembersIncluded: 1,
    maxExtraAdultMembers: 0,
    canCreateKidProfiles: false,
    canManageFamilyProfiles: false,
    canUseKidSafeVault: false,
    canUseForgeAdvancedSellerTools: false,
    canUseShopProfileTools: false,
    canAccessAdminModeration: false,
    canViewRawScoutHistory: false,
    canViewPatternTools: false,
  },
  [PLAN_IDS.COLLECTOR]: {
    scoutStoreSlots: 3,
    scoutStoreSwapDays: 14,
    maxKidProfilesIncluded: 0,
    maxExtraKidProfiles: 0,
    maxAdultMembersIncluded: 1,
    maxExtraAdultMembers: 0,
    canCreateKidProfiles: false,
    canManageFamilyProfiles: false,
    canUseKidSafeVault: false,
    canUseForgeAdvancedSellerTools: false,
    canUseShopProfileTools: false,
    canAccessAdminModeration: false,
    canViewRawScoutHistory: false,
    canViewPatternTools: false,
  },
  [PLAN_IDS.FAMILY]: {
    scoutStoreSlots: 3,
    scoutStoreSwapDays: 14,
    maxKidProfilesIncluded: 2,
    maxExtraKidProfiles: 6,
    maxAdultMembersIncluded: 1,
    maxExtraAdultMembers: 4,
    canCreateKidProfiles: true,
    canManageFamilyProfiles: true,
    canUseKidSafeVault: true,
    canUseForgeAdvancedSellerTools: false,
    canUseShopProfileTools: false,
    canAccessAdminModeration: false,
    canViewRawScoutHistory: false,
    canViewPatternTools: false,
  },
  [PLAN_IDS.SELLER]: {
    scoutStoreSlots: 3,
    scoutStoreSwapDays: 14,
    maxKidProfilesIncluded: 0,
    maxExtraKidProfiles: 0,
    maxAdultMembersIncluded: 1,
    maxExtraAdultMembers: 0,
    canCreateKidProfiles: false,
    canManageFamilyProfiles: false,
    canUseKidSafeVault: false,
    canUseForgeAdvancedSellerTools: true,
    canUseShopProfileTools: false,
    canAccessAdminModeration: false,
    canViewRawScoutHistory: false,
    canViewPatternTools: false,
  },
  [PLAN_IDS.SHOP]: {
    scoutStoreSlots: 1,
    scoutStoreSwapDays: 30,
    maxKidProfilesIncluded: 0,
    maxExtraKidProfiles: 0,
    maxAdultMembersIncluded: 1,
    maxExtraAdultMembers: 0,
    canCreateKidProfiles: false,
    canManageFamilyProfiles: false,
    canUseKidSafeVault: false,
    canUseForgeAdvancedSellerTools: false,
    canUseShopProfileTools: true,
    canAccessAdminModeration: false,
    canViewRawScoutHistory: false,
    canViewPatternTools: false,
  },
  [PLAN_IDS.ADMIN]: {
    scoutStoreSlots: 999,
    scoutStoreSwapDays: 0,
    maxKidProfilesIncluded: 999,
    maxExtraKidProfiles: 999,
    maxAdultMembersIncluded: 999,
    maxExtraAdultMembers: 999,
    canCreateKidProfiles: true,
    canManageFamilyProfiles: true,
    canUseKidSafeVault: true,
    canUseForgeAdvancedSellerTools: true,
    canUseShopProfileTools: true,
    canAccessAdminModeration: true,
    canViewRawScoutHistory: true,
    canViewPatternTools: true,
  },
};

const ALL_PUBLIC_PLANS = [...PUBLIC_TIER_ORDER, PLAN_IDS.ADMIN];
const COLLECTOR_PLANS = [PLAN_IDS.COLLECTOR, PLAN_IDS.FAMILY, PLAN_IDS.SELLER, PLAN_IDS.ADMIN];
const FAMILY_PLANS = [PLAN_IDS.FAMILY, PLAN_IDS.ADMIN];
const SELLER_PLANS = [PLAN_IDS.SELLER, PLAN_IDS.ADMIN];
const SHOP_PLANS = [PLAN_IDS.SHOP, PLAN_IDS.ADMIN];
const ADMIN_PLANS = [PLAN_IDS.ADMIN];
const SCOUT_CURRENT_DETAIL_PLANS = [PLAN_IDS.COLLECTOR, PLAN_IDS.FAMILY, PLAN_IDS.SELLER, PLAN_IDS.ADMIN];
const SCOUT_PROTECTED_PLANS = ADMIN_PLANS;

export const SCOUT_PROTECTED_FEATURES = new Set([
  "scout_route_planner",
  "restock_predictions",
  "watchlist_route_planning",
  "advanced_store_history",
  "scout_predictions",
  "scout_pattern_tools",
  "scout_raw_history",
]);

export const FEATURE_GATES = {
  vault_basic: ALL_PUBLIC_PLANS,
  catalog_basic_search: ALL_PUBLIC_PLANS,
  manual_add: ALL_PUBLIC_PLANS,
  wishlist_basic: ALL_PUBLIC_PLANS,
  scout_reports_basic: ALL_PUBLIC_PLANS,
  marketplace_draft_basic: ALL_PUBLIC_PLANS,
  scanner_search_limited: ALL_PUBLIC_PLANS,

  unlimited_vault: COLLECTOR_PLANS,
  unlimited_scans: COLLECTOR_PLANS,
  set_completion: COLLECTOR_PLANS,
  portfolio_value: COLLECTOR_PLANS,
  price_history: COLLECTOR_PLANS,
  wishlist_alerts: COLLECTOR_PLANS,
  variants: COLLECTOR_PLANS,
  graded_slab_tracking: COLLECTOR_PLANS,
  collection_export: COLLECTOR_PLANS,
  saved_market_searches: COLLECTOR_PLANS,
  scout_current_details: SCOUT_CURRENT_DETAIL_PLANS,

  family_vault: FAMILY_PLANS,
  kid_profiles: FAMILY_PLANS,
  kid_safe_vault: FAMILY_PLANS,
  kid_wishlists: FAMILY_PLANS,
  spark_family_reminders: FAMILY_PLANS,

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

  shop_profile_tools: SHOP_PLANS,
  shop_directory_profile: SHOP_PLANS,
  shop_event_support: SHOP_PLANS,
  shop_featured_placement: SHOP_PLANS,

  scout_route_planner: SCOUT_PROTECTED_PLANS,
  restock_predictions: SCOUT_PROTECTED_PLANS,
  store_confidence_scores: SCOUT_CURRENT_DETAIL_PLANS,
  watchlist_route_planning: SCOUT_PROTECTED_PLANS,
  advanced_store_history: SCOUT_PROTECTED_PLANS,
  scout_pattern_tools: SCOUT_PROTECTED_PLANS,
  scout_raw_history: SCOUT_PROTECTED_PLANS,
  text_alerts: SCOUT_CURRENT_DETAIL_PLANS,
  online_monitor: SCOUT_CURRENT_DETAIL_PLANS,
  auto_open_page: SCOUT_CURRENT_DETAIL_PLANS,

  shared_workspace: FAMILY_PLANS,
  team_access: [...FAMILY_PLANS, PLAN_IDS.SELLER],
  advanced_reports: SELLER_PLANS,
  priority_alerts: SCOUT_CURRENT_DETAIL_PLANS,
  export_tools: SELLER_PLANS,

  admin_review: ADMIN_PLANS,
  admin_catalog_manage: ADMIN_PLANS,
  admin_store_manage: ADMIN_PLANS,

  // Legacy feature keys used by current UI.
  catalog_basic: ALL_PUBLIC_PLANS,
  catalog_advanced: COLLECTOR_PLANS,
  catalog_advanced_details: COLLECTOR_PLANS,
  collection_basic: ALL_PUBLIC_PLANS,
  stores_basic: ALL_PUBLIC_PLANS,
  restock_reports_basic: ALL_PUBLIC_PLANS,
  scout_view_reports: ALL_PUBLIC_PLANS,
  scout_submit_reports: ALL_PUBLIC_PLANS,
  scout_alerts: SCOUT_CURRENT_DETAIL_PLANS,
  scout_predictions: SCOUT_PROTECTED_PLANS,
  scout_verified_tips: SCOUT_CURRENT_DETAIL_PLANS,
  alerts_advanced: SCOUT_CURRENT_DETAIL_PLANS,
  seller_tools: SELLER_PLANS,
  forge_sales: SELLER_PLANS,
  forge_expenses: SELLER_PLANS,
  forge_mileage: SELLER_PLANS,
  forge_reports: SELLER_PLANS,
  forge_import: SELLER_PLANS,
  vault_unlimited: COLLECTOR_PLANS,
  vault_scan_add: COLLECTOR_PLANS,
  vault_export: COLLECTOR_PLANS,
  deal_calculator_limited: ALL_PUBLIC_PLANS,
  deal_calculator_unlimited: SELLER_PLANS,
  deal_checker_basic: ALL_PUBLIC_PLANS,
  deal_checker_advanced: SELLER_PLANS,
  market_price_history: COLLECTOR_PLANS,
  cross_listing: SELLER_PLANS,
  founder_tools: ADMIN_PLANS,
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
  saved_market_searches: "Saved Market Searches",
  scout_current_details: "Deeper Current Scout Details",
  family_vault: "Family Vault",
  kid_profiles: "Kid Profiles",
  kid_safe_vault: "Kid-safe Vault",
  kid_wishlists: "Kid Wishlists",
  spark_family_reminders: "The Spark Family Reminders",
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
  shop_profile_tools: "Shop Profile Tools",
  shop_directory_profile: "Shop Directory Profile",
  shop_event_support: "Shop Event/Support Interest",
  shop_featured_placement: "Shop Plus Featured Placement",
  scout_route_planner: "Protected Scout Route Planner",
  restock_predictions: "Protected Restock Pattern Tools",
  store_confidence_scores: "Store Confidence Scores",
  watchlist_route_planning: "Protected Watchlist Route Planning",
  advanced_store_history: "Protected Scout History",
  scout_pattern_tools: "Protected Scout Pattern Tools",
  scout_raw_history: "Protected Raw Scout History",
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
  scout_predictions: "Protected Scout Predictions",
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
  founder_tools: "Admin Override Tools",
  admin_tools: "Admin Tools",
};

export const FEATURE_DESCRIPTIONS = {
  receipt_scan_review: "Scan or upload a receipt, review extracted lines, choose destinations, and submit a verified report.",
  deal_finder: "Evaluate deal pricing, market value, MSRP, ROI, and save deal checks.",
  marketplace_exports: "Export marketplace drafts to CSV formats for listing prep.",
  scout_route_planner: "Protected Scout route planning is reserved for admin moderation and future governed access.",
  restock_predictions: "Raw restock patterns are protected to keep Scout fair. Paid tiers unlock deeper current selected-store details, not raw history.",
  scout_pattern_tools: "Raw restock patterns are protected to keep Scout fair.",
  scout_raw_history: "Full Scout history is available only for admin moderation.",
  advanced_store_history: "Full store history is protected and not exposed to normal users.",
  scout_current_details: "Collector, Family, and Seller plans can see deeper current details for followed stores.",
  set_completion: "Track master set progress and completion gaps.",
  portfolio_value: "Track collector cost basis, market value, and portfolio summary.",
  family_vault: "Parent-managed family collection views for household collecting.",
  kid_profiles: "Create private, parent-managed kid profiles.",
  kid_safe_vault: "Use kid-safe collection views and progress tracking.",
  shop_profile_tools: "Prepare a shop profile and family-friendly shop directory details. Shop trust labels are admin-reviewed.",
  shared_workspace: "Use team/shared workspaces and permissions.",
  team_access: "Invite teammates and share selected workspaces.",
};

const SELLER_LOCKED_FEATURES = new Set([
  "seller_tools",
  "forge_inventory",
  "forge_sales",
  "forge_expenses",
  "forge_mileage",
  "forge_reports",
  "receipt_scan_review",
  "profit_loss",
  "deal_finder",
  "marketplace_exports",
  "listing_prep",
  "business_reports",
  "export_tools",
  "advanced_reports",
]);

const FAMILY_LOCKED_FEATURES = new Set([
  "family_vault",
  "kid_profiles",
  "kid_safe_vault",
  "kid_wishlists",
  "spark_family_reminders",
  "shared_workspace",
  "team_access",
]);

const SHOP_LOCKED_FEATURES = new Set([
  "shop_profile_tools",
  "shop_directory_profile",
  "shop_event_support",
  "shop_featured_placement",
]);

export function getLockedFeatureDetails(featureKey) {
  const label = FEATURE_LABELS[featureKey] || "Locked feature";
  const requiredTier = (FEATURE_GATES[featureKey] || [PLAN_IDS.COLLECTOR])[0] || PLAN_IDS.COLLECTOR;
  const tierLabel = FEATURE_MIN_TIER_LABELS[featureKey] || "paid";
  const description = FEATURE_DESCRIPTIONS[featureKey] || `${label} is part of the ${tierLabel} tier.`;

  if (isProtectedScoutFeature(featureKey)) {
    return {
      label,
      title: "Protected for fair access",
      statusLabel: "Admin protected",
      requiredTier,
      tierLabel: "Admin",
      description,
      benefit: "Scout stays focused on current reports, selected stores, confirmations, and proof the community can review.",
      action: "Submit or confirm a current report instead, or ask admin if you need moderation access.",
      guardrail: "This lock never reveals raw restock history, exact pattern windows, or all-store data.",
      cta: "Ask admin for review access",
    };
  }

  if (SELLER_LOCKED_FEATURES.has(featureKey)) {
    return {
      label,
      title: "Seller tools are gated",
      statusLabel: `${tierLabel} tier`,
      requiredTier,
      tierLabel,
      description,
      benefit: "Forge keeps business records, sales, receipts, expenses, mileage, and exports organized.",
      action: "Ask admin to enable the Seller path during beta. Checkout is not live yet.",
      guardrail: "Locked business tools do not change your saved Vault or Scout data.",
      cta: "Ask admin about Seller",
    };
  }

  if (FAMILY_LOCKED_FEATURES.has(featureKey)) {
    return {
      label,
      title: "Family support is gated",
      statusLabel: `${tierLabel} tier`,
      requiredTier,
      tierLabel,
      description,
      benefit: "Family tools are parent-managed and keep child/family setup private by default.",
      action: "Ask admin to enable the Family path during beta, or keep using the core adult-first app.",
      guardrail: "No child profiles, private family details, or hidden records are exposed behind this lock.",
      cta: "Ask admin about Family",
    };
  }

  if (SHOP_LOCKED_FEATURES.has(featureKey)) {
    return {
      label,
      title: "Shop access needs review",
      statusLabel: `${tierLabel} tier`,
      requiredTier,
      tierLabel,
      description,
      benefit: "Shop tools support family-friendly profiles, partner participation, sponsorships, and local events.",
      action: "Ask admin about shop/partner review. Shop trust labels are admin-reviewed.",
      guardrail: "Paying is not enough to unlock a shop trust label in beta.",
      cta: "Ask admin about Shop",
    };
  }

  return {
    label,
    title: "This is part of a higher tier",
    statusLabel: `${tierLabel} tier`,
    requiredTier,
    tierLabel,
    description,
    benefit: "Upgrade paths keep advanced tools clear without cluttering the core app.",
    action: "Ask admin to adjust your beta access if this belongs in your setup.",
    guardrail: "The locked state explains the benefit without exposing hidden data.",
    cta: "Ask admin to upgrade during beta",
  };
}

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
    id: PLAN_IDS.COLLECTOR,
    label: PLAN_LABELS[PLAN_IDS.COLLECTOR],
    features: ["unlimited_vault", "set_completion", "portfolio_value", "price_history", "wishlist_alerts", "variants", "collection_export", "saved_market_searches", "scout_current_details"],
  },
  {
    id: PLAN_IDS.FAMILY,
    label: PLAN_LABELS[PLAN_IDS.FAMILY],
    features: ["family_vault", "kid_profiles", "kid_safe_vault", "kid_wishlists", "spark_family_reminders", "shared_workspace"],
  },
  {
    id: PLAN_IDS.SELLER,
    label: PLAN_LABELS[PLAN_IDS.SELLER],
    features: ["forge_inventory", "sales_tracking", "expenses", "mileage", "receipt_scan_review", "profit_loss", "deal_finder", "marketplace_exports", "listing_prep", "business_reports"],
  },
  {
    id: PLAN_IDS.SHOP,
    label: PLAN_LABELS[PLAN_IDS.SHOP],
    features: ["shop_profile_tools", "shop_directory_profile", "shop_event_support", "shop_featured_placement"],
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
  "plan_tier",
  "planTier",
  "app_role",
  "appRole",
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

function normalizePlanLikeValue(value = "") {
  return String(value || PLAN_IDS.FREE).toLowerCase().replace(/-/g, "_").trim();
}

export function normalizeTier(value) {
  const tier = normalizePlanLikeValue(value);
  if (tier === PLAN_TYPES.COLLECTOR_PLUS || tier === PLAN_TYPES.PLUS || tier === PLAN_TYPES.SCOUT_PRO || tier === PLAN_TYPES.SCOUT_PREMIUM) return PLAN_IDS.COLLECTOR;
  if (tier === PLAN_TYPES.FAMILY) return PLAN_IDS.FAMILY;
  if (tier === PLAN_TYPES.SELLER || tier === PLAN_TYPES.SELLER_PRO || tier === PLAN_TYPES.PRO || tier === PLAN_TYPES.PAID || tier === PLAN_TYPES.ULTIMATE || tier === PLAN_TYPES.ALL_ACCESS || tier === PLAN_TYPES.FOUNDER) return PLAN_IDS.SELLER;
  if (tier === PLAN_TYPES.SHOP || tier === PLAN_TYPES.SHOP_BASIC || tier === PLAN_TYPES.SHOP_PLUS) return PLAN_IDS.SHOP;
  if (tier === PLAN_TYPES.ADMIN) return PLAN_IDS.ADMIN;
  return [...PUBLIC_TIER_ORDER, PLAN_IDS.ADMIN].includes(tier) ? tier : PLAN_IDS.FREE;
}

export function normalizeUserRole(value) {
  const role = String(value || USER_ROLES.USER).toLowerCase().replace(/-/g, "_");
  if (role === "super_admin" || role === "founder") return USER_ROLES.OWNER;
  if (role === "beta" || role === "beta_tester") return USER_ROLES.BETA_USER;
  return Object.values(USER_ROLES).includes(role) ? role : USER_ROLES.USER;
}

export function getUserTier(profile = {}) {
  if (profile.lifetimeAccess || profile.lifetime_access) return PLAN_IDS.SELLER;
  return normalizeTier(profile.tier || profile.featureTier || profile.feature_tier || profile.planTier || profile.plan_tier || profile.subscriptionPlan || profile.subscription_plan);
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

export function isApprovedUser(profile = {}) {
  const status = String(profile.appAccess || profile.app_access || profile.betaStatus || profile.beta_status || profile.betaAccessStatus || profile.beta_access_status || "").toLowerCase();
  if (!status) return true;
  return ["approved", "active", "beta", "beta_user", "admin"].includes(status);
}

export function isRestrictedUser(profile = {}) {
  const status = String(profile.appAccess || profile.app_access || profile.betaStatus || profile.beta_status || profile.betaAccessStatus || profile.beta_access_status || "").toLowerCase();
  return ["restricted", "paused", "denied", "blocked", "suspended"].includes(status);
}

export function isAdminUser(profile = {}) {
  const appMetadata = profile.app_metadata || profile.raw_app_meta_data || profile.rawAppMetaData || {};
  const role = normalizeUserRole(
    profile.appRole ||
      profile.app_role ||
      profile.userRole ||
      profile.user_role ||
      appMetadata.app_role ||
      appMetadata.appRole ||
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
  return role === USER_ROLES.OWNER || role === USER_ROLES.ADMIN || metadataAdmin || tier === PLAN_IDS.ADMIN;
}

export function getTierAccess(profile = {}, options = {}) {
  const profileObject = typeof profile === "object" && profile !== null ? profile : { tier: profile };
  const admin = Boolean(options.admin) || isAdminUser(profileObject);
  const tier = admin ? PLAN_IDS.ADMIN : getUserTier(profileObject);
  const base = TIER_ACCESS_RULES[tier] || TIER_ACCESS_RULES[PLAN_IDS.FREE];
  return {
    ...base,
    plan_tier: admin ? PLAN_IDS.ADMIN : tier,
    planTier: admin ? PLAN_IDS.ADMIN : tier,
    tierLabel: PLAN_LABELS[admin ? PLAN_IDS.ADMIN : tier] || PLAN_LABELS[PLAN_IDS.FREE],
    isBeta: Boolean(options.betaTester || isBetaTester(profileObject)),
    isAdmin: admin,
    isApproved: isApprovedUser(profileObject),
    isRestricted: isRestrictedUser(profileObject),
  };
}

export function getTierPricingCards() {
  return PUBLIC_TIER_ORDER.map((tier) => TIER_PRICING[tier]).filter(Boolean);
}

export function getTierAddOns() {
  return TIER_ADD_ONS;
}

export function getTierPricingCard(tier = PLAN_IDS.FREE) {
  return TIER_PRICING[normalizeTier(tier)] || TIER_PRICING[PLAN_IDS.FREE];
}

function isProtectedScoutFeature(featureKey = "") {
  return SCOUT_PROTECTED_FEATURES.has(featureKey);
}

export function canUseFeature(userPlan = PLAN_IDS.FREE, featureKey, options = {}) {
  if (options.admin || runtimeQaUnlock(options)) return true;
  const localBetaUnlock = Boolean(options.localBeta) && !isProtectedScoutFeature(featureKey);
  const profile = typeof userPlan === "object" && userPlan !== null ? userPlan : {};
  if (typeof userPlan === "object" && isAdminUser(profile)) return true;
  if (localBetaUnlock) return true;
  const tier = typeof userPlan === "object" ? getUserTier(profile) : normalizeTier(userPlan);
  const allowedPlans = FEATURE_GATES[featureKey];
  if (!allowedPlans) return false;
  return allowedPlans.map(normalizeTier).includes(tier);
}

export function hasPlanAccess(profile = {}, featureKey, options = {}) {
  if (options.admin || isAdminUser(profile)) return true;
  if (runtimeQaUnlock(options) || (options.localBeta && !isProtectedScoutFeature(featureKey))) return true;
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
  if (isAdminUser(profile)) return true;
  return PUBLIC_TIER_ORDER.indexOf(getUserTier(profile)) > PUBLIC_TIER_ORDER.indexOf(PLAN_IDS.FREE);
}

export function getLockedFeatureMessage(featureKey) {
  const tier = FEATURE_MIN_TIER_LABELS[featureKey] || "paid";
  return `${FEATURE_LABELS[featureKey] || "This feature"} is part of the ${tier} tier.`;
}

export function getUpgradePrompt(featureKey) {
  const description = FEATURE_DESCRIPTIONS[featureKey];
  return `${getLockedFeatureMessage(featureKey)} ${description || "Ask admin to upgrade during beta. Payments and checkout are coming soon."}`;
}

export function sanitizeUserProfileUpdates(updates = {}) {
  return Object.fromEntries(
    Object.entries(updates).filter(([key]) => !PROTECTED_SUBSCRIPTION_FIELDS.includes(key))
  );
}
