export const WORKSPACE_IDS = Object.freeze({
  COLLECT: "COLLECT",
  FIND: "FIND",
  SELL: "SELL",
  BOT: "BOT",
  BUSINESS: "BUSINESS",
});

export const ROUTE_CLASSIFICATIONS = Object.freeze({
  ...WORKSPACE_IDS,
  OWNER: "OWNER",
  GLOBAL: "GLOBAL",
  LEGACY_REDIRECT: "LEGACY_REDIRECT",
});

export const AUTHORITY_REQUIREMENTS = Object.freeze({
  NONE: "NONE",
  VERIFIED_OWNER: "VERIFIED_OWNER",
});

// These are future product labels only. They never establish application authority.
export const ENTITLEMENT_LABELS = Object.freeze({
  FREE: "FREE",
  PLUS: "PLUS",
  PRO: "PRO",
  BUSINESS: "BUSINESS",
  OWNER: "OWNER",
});

export const ROUTE_MATCH_TYPES = Object.freeze({
  EXACT: "EXACT",
  PREFIX: "PREFIX",
});

export const NAV_PLACEMENTS = Object.freeze({
  HOME: "HOME",
  PRIMARY: "PRIMARY",
  SECONDARY: "SECONDARY",
  HIDDEN: "HIDDEN",
});

export const ROUTE_IMPLEMENTATION_STATES = Object.freeze({
  IMPLEMENTED: "IMPLEMENTED",
  FOUNDATION: "FOUNDATION",
  DEPRECATED_COMPATIBILITY: "DEPRECATED_COMPATIBILITY",
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function navItem({
  key,
  label,
  path,
  iconKey,
  placement = NAV_PLACEMENTS.PRIMARY,
  requiredAuthority = AUTHORITY_REQUIREMENTS.NONE,
  featureKey = "",
  mobileEligible = true,
  desktopEligible = true,
}) {
  return {
    key,
    label,
    path,
    iconKey,
    placement,
    requiredAuthority,
    featureKey,
    mobileEligible,
    desktopEligible,
    implemented: true,
  };
}

export const WORKSPACE_DEFINITIONS = deepFreeze({
  [WORKSPACE_IDS.COLLECT]: {
    id: WORKSPACE_IDS.COLLECT,
    label: "Collect",
    description: "Personal collection and owned-item work.",
    homePath: "/collect",
    iconKey: "inventory",
    switcherEligible: true,
    requiredAuthority: AUTHORITY_REQUIREMENTS.NONE,
    entitlementLabels: [ENTITLEMENT_LABELS.FREE, ENTITLEMENT_LABELS.PLUS],
    featureKey: "collection",
    navigation: [
      navItem({ key: "collect-home", label: "Home", path: "/collect", iconKey: "home", placement: NAV_PLACEMENTS.HOME }),
      navItem({ key: "collection", label: "Collection", path: "/collection", iconKey: "inventory" }),
      navItem({ key: "collection-sets", label: "Sets", path: "/collection/sets", iconKey: "inventory" }),
      navItem({ key: "collection-wishlist", label: "Wants", path: "/collection/wishlist", iconKey: "plan" }),
    ],
  },
  [WORKSPACE_IDS.FIND]: {
    id: WORKSPACE_IDS.FIND,
    label: "Find",
    description: "Deals, auctions, restocks, and sourcing research.",
    homePath: "/find/home",
    iconKey: "find",
    switcherEligible: true,
    requiredAuthority: AUTHORITY_REQUIREMENTS.NONE,
    entitlementLabels: [ENTITLEMENT_LABELS.FREE, ENTITLEMENT_LABELS.PRO],
    navigation: [
      navItem({ key: "find-home", label: "Home", path: "/find/home", iconKey: "home", placement: NAV_PLACEMENTS.HOME }),
      navItem({ key: "find-deals", label: "Deals", path: "/find/deals", iconKey: "find" }),
      navItem({ key: "find-restocks", label: "Restocks", path: "/find/restocks", iconKey: "map", featureKey: "restocks" }),
      navItem({ key: "find-auctions", label: "Auctions", path: "/find/auctions", iconKey: "market", featureKey: "auctions" }),
    ],
  },
  [WORKSPACE_IDS.SELL]: {
    id: WORKSPACE_IDS.SELL,
    label: "Sell",
    description: "Resale inventory, listing work, and completed sales.",
    homePath: "/sell/home",
    iconKey: "sell",
    switcherEligible: true,
    requiredAuthority: AUTHORITY_REQUIREMENTS.NONE,
    entitlementLabels: [ENTITLEMENT_LABELS.PRO, ENTITLEMENT_LABELS.BUSINESS],
    navigation: [
      navItem({ key: "sell-home", label: "Home", path: "/sell/home", iconKey: "home", placement: NAV_PLACEMENTS.HOME }),
      navItem({ key: "sell-inventory", label: "Inventory", path: "/business/inventory", iconKey: "inventory" }),
      navItem({ key: "sell-sales", label: "Sales", path: "/business/sales", iconKey: "sell" }),
    ],
  },
  [WORKSPACE_IDS.BOT]: {
    id: WORKSPACE_IDS.BOT,
    label: "Bot",
    description: "Private owner-only operational integration foundation.",
    homePath: "/bot",
    iconKey: "admin",
    switcherEligible: true,
    requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER,
    entitlementLabels: [ENTITLEMENT_LABELS.OWNER],
    navigation: [
      navItem({ key: "bot-home", label: "Home", path: "/bot", iconKey: "home", placement: NAV_PLACEMENTS.HOME, requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER }),
      navItem({ key: "bot-bots", label: "Bots", path: "/bot/bots", iconKey: "admin", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER }),
      navItem({ key: "bot-task-groups", label: "Groups", path: "/bot/task-groups", iconKey: "plan", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER }),
      navItem({ key: "bot-tasks", label: "Tasks", path: "/bot/tasks", iconKey: "clipboard", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER }),
      navItem({ key: "bot-activity", label: "Activity", path: "/bot/activity", iconKey: "history", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER }),
    ],
  },
  [WORKSPACE_IDS.BUSINESS]: {
    id: WORKSPACE_IDS.BUSINESS,
    label: "Business",
    description: "Purchases, money, Account Ops, and business records.",
    homePath: "/business",
    iconKey: "business",
    switcherEligible: true,
    requiredAuthority: AUTHORITY_REQUIREMENTS.NONE,
    entitlementLabels: [ENTITLEMENT_LABELS.BUSINESS],
    navigation: [
      navItem({ key: "business-home", label: "Home", path: "/business", iconKey: "home", placement: NAV_PLACEMENTS.HOME }),
      navItem({ key: "business-purchases", label: "Purchases", path: "/business/purchases", iconKey: "clipboard" }),
      navItem({ key: "business-money", label: "Money", path: "/business/money/expenses", iconKey: "business" }),
      navItem({ key: "business-account-ops", label: "Account Ops", path: "/account-ops", iconKey: "account", placement: NAV_PLACEMENTS.SECONDARY, requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER }),
    ],
  },
});

export const PRODUCT_WORKSPACES = deepFreeze(Object.values(WORKSPACE_DEFINITIONS));

function route({
  key,
  path,
  classification,
  workspace = null,
  label,
  match = ROUTE_MATCH_TYPES.EXACT,
  requiredAuthority = AUTHORITY_REQUIREMENTS.NONE,
  implementation = ROUTE_IMPLEMENTATION_STATES.IMPLEMENTED,
  visible = true,
  navPlacement = NAV_PLACEMENTS.HIDDEN,
  mobileEligible = false,
  desktopEligible = false,
  redirectTo = "",
  featureKey = "",
  legacyCompatibility = false,
}) {
  return {
    key,
    path,
    classification,
    workspace,
    label,
    match,
    requiredAuthority,
    implementation,
    implemented: implementation !== ROUTE_IMPLEMENTATION_STATES.FOUNDATION,
    visible,
    navPlacement,
    mobileEligible,
    desktopEligible,
    redirectTo,
    featureKey,
    legacyCompatibility,
  };
}

const CANONICAL_ROUTES = [
  route({ key: "collect-home", path: "/collect", classification: ROUTE_CLASSIFICATIONS.COLLECT, workspace: WORKSPACE_IDS.COLLECT, label: "Collect Home" }),
  route({ key: "collection", path: "/collection", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.COLLECT, workspace: WORKSPACE_IDS.COLLECT, label: "Collection", featureKey: "collection" }),

  route({ key: "find-home", path: "/find/home", classification: ROUTE_CLASSIFICATIONS.FIND, workspace: WORKSPACE_IDS.FIND, label: "Find Home" }),
  route({ key: "find", path: "/find", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.FIND, workspace: WORKSPACE_IDS.FIND, label: "Find" }),

  route({ key: "sell-home", path: "/sell/home", classification: ROUTE_CLASSIFICATIONS.SELL, workspace: WORKSPACE_IDS.SELL, label: "Sell Home" }),
  route({ key: "sell-inventory", path: "/business/inventory", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.SELL, workspace: WORKSPACE_IDS.SELL, label: "Resale Inventory" }),
  route({ key: "sell-sales", path: "/business/sales", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.SELL, workspace: WORKSPACE_IDS.SELL, label: "Sales" }),

  route({ key: "bot-home", path: "/bot", classification: ROUTE_CLASSIFICATIONS.BOT, workspace: WORKSPACE_IDS.BOT, label: "Bot Operations", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER }),
  route({ key: "bot-bots", path: "/bot/bots", classification: ROUTE_CLASSIFICATIONS.BOT, workspace: WORKSPACE_IDS.BOT, label: "Bots", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER }),
  route({ key: "bot-task-groups", path: "/bot/task-groups", classification: ROUTE_CLASSIFICATIONS.BOT, workspace: WORKSPACE_IDS.BOT, label: "Bot Task Groups", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER }),
  route({ key: "bot-tasks", path: "/bot/tasks", classification: ROUTE_CLASSIFICATIONS.BOT, workspace: WORKSPACE_IDS.BOT, label: "Bot Tasks", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER }),
  route({ key: "bot-accounts", path: "/bot/accounts", classification: ROUTE_CLASSIFICATIONS.BOT, workspace: WORKSPACE_IDS.BOT, label: "Bot Account References", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER }),
  route({ key: "bot-profiles", path: "/bot/profiles", classification: ROUTE_CLASSIFICATIONS.BOT, workspace: WORKSPACE_IDS.BOT, label: "Bot Profiles", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER }),
  route({ key: "bot-proxies", path: "/bot/proxies", classification: ROUTE_CLASSIFICATIONS.BOT, workspace: WORKSPACE_IDS.BOT, label: "Proxy Metadata", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER }),
  route({ key: "bot-targets", path: "/bot/targets", classification: ROUTE_CLASSIFICATIONS.BOT, workspace: WORKSPACE_IDS.BOT, label: "Product Targets", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER }),
  route({ key: "bot-activity", path: "/bot/activity", classification: ROUTE_CLASSIFICATIONS.BOT, workspace: WORKSPACE_IDS.BOT, label: "Bot Activity", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER }),

  route({ key: "account-ops", path: "/account-ops", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.BUSINESS, workspace: WORKSPACE_IDS.BUSINESS, label: "Account Ops", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER }),
  route({ key: "business-purchases", path: "/business/purchases", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.BUSINESS, workspace: WORKSPACE_IDS.BUSINESS, label: "Purchases" }),
  route({ key: "business-money", path: "/business/money", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.BUSINESS, workspace: WORKSPACE_IDS.BUSINESS, label: "Money" }),
  route({ key: "business-home", path: "/business", classification: ROUTE_CLASSIFICATIONS.BUSINESS, workspace: WORKSPACE_IDS.BUSINESS, label: "Business Home" }),
  route({ key: "business-routes", path: "/business", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.BUSINESS, workspace: WORKSPACE_IDS.BUSINESS, label: "Business" }),

  route({ key: "owner-center", path: "/owner-center", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.OWNER, label: "Owner Center", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER }),

  route({ key: "global-home", path: "/", classification: ROUTE_CLASSIFICATIONS.GLOBAL, label: "Code 3 Home" }),
  route({ key: "settings", path: "/settings", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.GLOBAL, label: "Settings" }),
  route({ key: "kids-community", path: "/kids-community", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.GLOBAL, label: "Kids & Community" }),
  route({ key: "invite", path: "/invite", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.GLOBAL, label: "Invite" }),
  route({ key: "beta-invite", path: "/beta/invite", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.GLOBAL, label: "Beta Invite" }),
  route({ key: "workspace-invite", path: "/workspace-invite", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.GLOBAL, label: "Workspace Invite" }),
  route({ key: "reset-password", path: "/reset-password", classification: ROUTE_CLASSIFICATIONS.GLOBAL, label: "Reset Password" }),
  route({ key: "onboarding", path: "/onboarding", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.GLOBAL, label: "Onboarding" }),
  route({ key: "today", path: "/today", classification: ROUTE_CLASSIFICATIONS.GLOBAL, label: "Today" }),
];

const COMPATIBILITY_ROUTES = [
  route({ key: "legacy-sell", path: "/sell", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, workspace: WORKSPACE_IDS.SELL, label: "Sales", redirectTo: "/business/sales", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-sales", path: "/sales", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, workspace: WORKSPACE_IDS.SELL, label: "Sales", redirectTo: "/business/sales", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-inventory", path: "/inventory", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, workspace: WORKSPACE_IDS.SELL, label: "Inventory", redirectTo: "/business/inventory", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-purchases", path: "/purchases", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, workspace: WORKSPACE_IDS.BUSINESS, label: "Purchases", redirectTo: "/business/purchases", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-flip-scout", path: "/scout/flip-scout", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, workspace: WORKSPACE_IDS.FIND, label: "Deals", redirectTo: "/find/deals", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-integrations", path: "/integrations", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Connections", redirectTo: "/owner-center/controls/connections", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER, visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-data-backup", path: "/data-backup", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Data & Backup", redirectTo: "/owner-center/controls/data-backup", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER, visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-backup", path: "/backup", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Data & Backup", redirectTo: "/owner-center/controls/data-backup", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER, visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-settings-data-backup", path: "/settings/data-backup", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Data & Backup", redirectTo: "/owner-center/controls/data-backup", requiredAuthority: AUTHORITY_REQUIREMENTS.VERIFIED_OWNER, visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),

  route({ key: "legacy-scout", path: "/scout", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.FIND, workspace: WORKSPACE_IDS.FIND, label: "Scout", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-vault", path: "/vault", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.COLLECT, workspace: WORKSPACE_IDS.COLLECT, label: "Collection", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-forge-sales", path: "/forge/sales", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.SELL, workspace: WORKSPACE_IDS.SELL, label: "Sales", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-forge-expenses", path: "/forge/expenses", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.BUSINESS, workspace: WORKSPACE_IDS.BUSINESS, label: "Expenses", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-forge-mileage", path: "/forge/mileage", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.BUSINESS, workspace: WORKSPACE_IDS.BUSINESS, label: "Mileage", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-forge-reports", path: "/forge/reports", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.BUSINESS, workspace: WORKSPACE_IDS.BUSINESS, label: "Reports", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-forge", path: "/forge", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.SELL, workspace: WORKSPACE_IDS.SELL, label: "Resale Inventory", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-exchange-market", path: "/exchange/market", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.FIND, workspace: WORKSPACE_IDS.FIND, label: "Market Research", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-exchange-harbor", path: "/exchange/harbor", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.SELL, workspace: WORKSPACE_IDS.SELL, label: "Listings", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-exchange-forge", path: "/exchange/forge", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.SELL, workspace: WORKSPACE_IDS.SELL, label: "Resale Tools", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-exchange", path: "/exchange", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.GLOBAL, label: "Exchange", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-market", path: "/market", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, workspace: WORKSPACE_IDS.FIND, label: "Market Research", redirectTo: "/exchange/market", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-harbor", path: "/harbor", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, workspace: WORKSPACE_IDS.SELL, label: "Listings", redirectTo: "/exchange/harbor", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-tidetradr", path: "/tidetradr", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.FIND, workspace: WORKSPACE_IDS.FIND, label: "Market Research", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-reports", path: "/reports", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, workspace: WORKSPACE_IDS.BUSINESS, label: "Reports", redirectTo: "/forge/reports", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-business-reports", path: "/business-reports", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, workspace: WORKSPACE_IDS.BUSINESS, label: "Reports", redirectTo: "/forge/reports", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-exports", path: "/exports", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, workspace: WORKSPACE_IDS.BUSINESS, label: "Reports", redirectTo: "/forge/reports", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),

  route({ key: "legacy-assistant", path: "/assistant", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Help", redirectTo: "/settings/help", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-profile", path: "/profile", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Profile", redirectTo: "/settings/profile", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-account", path: "/account", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Account", redirectTo: "/settings/account", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-workspaces", path: "/workspaces", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Workspace Settings", redirectTo: "/settings/workspaces", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-collections", path: "/collections", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Workspace Settings", redirectTo: "/settings/workspaces", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-tcg-os", path: "/tcg-os", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "System Map", redirectTo: "/settings/system-map", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-help", path: "/help", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Help", redirectTo: "/settings/help", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-support", path: "/support", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Help", redirectTo: "/settings/help", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-menu", path: "/menu", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Settings", redirectTo: "/settings", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-more", path: "/more", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Settings", redirectTo: "/settings", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-membership", path: "/membership", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Plans", redirectTo: "/settings/plans", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-tiers", path: "/tiers", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Plans", redirectTo: "/settings/plans", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-plans", path: "/plans", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Plans", redirectTo: "/settings/plans", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-privacy", path: "/privacy", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Privacy", redirectTo: "/settings/privacy", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-terms", path: "/terms", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Terms", redirectTo: "/settings/terms", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-trust", path: "/trust", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Trust", redirectTo: "/settings/trust", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-links", path: "/links", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Links", redirectTo: "/settings/links", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-whats-new", path: "/whats-new", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Announcements", redirectTo: "/settings/announcements", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-changelog", path: "/changelog", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Announcements", redirectTo: "/settings/announcements", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-known-limitations", path: "/known-limitations", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Known Limitations", redirectTo: "/settings/known-limitations", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-coming-soon", path: "/coming-soon", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Roadmap", redirectTo: "/settings/roadmap", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-roadmap", path: "/roadmap", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Roadmap", redirectTo: "/settings/roadmap", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-partner", path: "/partner", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Partnerships", redirectTo: "/settings/partnerships", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-sponsor", path: "/sponsor", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Partnerships", redirectTo: "/settings/partnerships", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-parent", path: "/parent", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Parent Center", redirectTo: "/kids-community/parent", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-parent-center", path: "/parent-center", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Parent Center", redirectTo: "/kids-community/parent", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-spark", path: "/spark", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Kids & Community", redirectTo: "/kids-community", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-welcome", path: "/welcome", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Onboarding", redirectTo: "/onboarding/welcome", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-state-check", path: "/state-check", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Onboarding", redirectTo: "/onboarding/state-check", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-waitlist", path: "/waitlist", classification: ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT, label: "Onboarding", redirectTo: "/onboarding/waitlist", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),

  route({ key: "legacy-daily-tide", path: "/daily-tide", classification: ROUTE_CLASSIFICATIONS.GLOBAL, label: "Today", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-tidepool", path: "/tidepool", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.GLOBAL, label: "Community", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-kids", path: "/kids-program", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.GLOBAL, label: "Kids & Community", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-admin", path: "/admin", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.GLOBAL, label: "Legacy Administration", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-admin-review", path: "/admin-review", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.GLOBAL, label: "Legacy Administration", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-moderator", path: "/moderator", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.GLOBAL, label: "Legacy Moderation", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
  route({ key: "legacy-moderation", path: "/moderation", match: ROUTE_MATCH_TYPES.PREFIX, classification: ROUTE_CLASSIFICATIONS.GLOBAL, label: "Legacy Moderation", visible: false, legacyCompatibility: true, implementation: ROUTE_IMPLEMENTATION_STATES.DEPRECATED_COMPATIBILITY }),
];

export const ROUTE_REGISTRY = deepFreeze([...CANONICAL_ROUTES, ...COMPATIBILITY_ROUTES]);

export function validateWorkspaceRegistry() {
  const errors = [];
  const workspaceIds = new Set(Object.values(WORKSPACE_IDS));
  const classifications = new Set(Object.values(ROUTE_CLASSIFICATIONS));
  const authorities = new Set(Object.values(AUTHORITY_REQUIREMENTS));
  const entitlements = new Set(Object.values(ENTITLEMENT_LABELS));
  const navPlacements = new Set(Object.values(NAV_PLACEMENTS));
  const workspaceKeys = new Set();
  const routeKeys = new Set();
  const routePatterns = new Set();

  for (const [key, workspace] of Object.entries(WORKSPACE_DEFINITIONS)) {
    if (workspaceKeys.has(workspace.id)) errors.push(`Duplicate workspace id: ${workspace.id}`);
    workspaceKeys.add(workspace.id);
    if (key !== workspace.id || !workspaceIds.has(workspace.id)) errors.push(`Invalid workspace definition: ${key}`);
    if (!workspace.switcherEligible) errors.push(`Product workspace is not switcher eligible: ${workspace.id}`);
    if (!authorities.has(workspace.requiredAuthority)) errors.push(`Invalid authority for workspace: ${workspace.id}`);
    for (const entitlement of workspace.entitlementLabels) {
      if (!entitlements.has(entitlement)) errors.push(`Invalid entitlement ${entitlement} for workspace: ${workspace.id}`);
    }
    if (!workspace.navigation.some((item) => item.path === workspace.homePath && item.placement === NAV_PLACEMENTS.HOME)) {
      errors.push(`Workspace home is missing from navigation: ${workspace.id}`);
    }
    for (const item of workspace.navigation) {
      if (!item.implemented) errors.push(`Unimplemented route is exposed in navigation: ${item.key}`);
      if (!authorities.has(item.requiredAuthority)) errors.push(`Invalid navigation authority: ${item.key}`);
    }
  }

  for (const entry of ROUTE_REGISTRY) {
    const pattern = `${entry.match}:${entry.path}`;
    if (routeKeys.has(entry.key)) errors.push(`Duplicate route key: ${entry.key}`);
    if (routePatterns.has(pattern)) errors.push(`Duplicate route pattern: ${pattern}`);
    routeKeys.add(entry.key);
    routePatterns.add(pattern);
    if (!classifications.has(entry.classification)) errors.push(`Invalid route classification: ${entry.key}`);
    if (entry.workspace && !workspaceIds.has(entry.workspace)) errors.push(`Invalid route workspace: ${entry.key}`);
    if (!authorities.has(entry.requiredAuthority)) errors.push(`Invalid route authority: ${entry.key}`);
    if (!navPlacements.has(entry.navPlacement)) errors.push(`Invalid route navigation placement: ${entry.key}`);
    if (typeof entry.mobileEligible !== "boolean" || typeof entry.desktopEligible !== "boolean") {
      errors.push(`Invalid route platform eligibility: ${entry.key}`);
    }
    if (workspaceIds.has(entry.classification) && entry.classification !== entry.workspace) {
      errors.push(`Workspace route classification mismatch: ${entry.key}`);
    }
    if ((entry.classification === ROUTE_CLASSIFICATIONS.OWNER || entry.classification === ROUTE_CLASSIFICATIONS.GLOBAL) && entry.workspace) {
      errors.push(`Non-product route cannot own a product workspace: ${entry.key}`);
    }
    if (entry.classification === ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT && !entry.redirectTo) {
      errors.push(`Legacy redirect is missing a target: ${entry.key}`);
    }
  }

  for (const workspace of PRODUCT_WORKSPACES) {
    const homeRoute = ROUTE_REGISTRY.find((entry) => entry.path === workspace.homePath && entry.match === ROUTE_MATCH_TYPES.EXACT);
    if (!homeRoute || homeRoute.workspace !== workspace.id) errors.push(`Workspace home route is not registered: ${workspace.id}`);
    for (const item of workspace.navigation) {
      const destination = resolveRouteOwnership(item.path);
      if (!destination || destination.workspace !== workspace.id) errors.push(`Navigation route has the wrong workspace: ${item.key}`);
    }
  }

  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function normalizeWorkspacePath(pathname = "/") {
  const source = String(pathname || "/").trim();
  let path = source;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(source)) {
    try {
      path = new URL(source).pathname;
    } catch {
      path = "/";
    }
  }
  path = path.split(/[?#]/, 1)[0].replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path || "/";
}

function routeMatches(entry, pathname) {
  if (entry.match === ROUTE_MATCH_TYPES.EXACT) return pathname === entry.path;
  return pathname === entry.path || pathname.startsWith(`${entry.path}/`);
}

export function resolveRouteOwnership(pathname = "/") {
  const normalizedPath = normalizeWorkspacePath(pathname);
  const matches = ROUTE_REGISTRY.filter((entry) => routeMatches(entry, normalizedPath));
  if (!matches.length) return null;
  return matches.sort((left, right) => {
    const exactDifference = Number(right.match === ROUTE_MATCH_TYPES.EXACT) - Number(left.match === ROUTE_MATCH_TYPES.EXACT);
    return exactDifference || right.path.length - left.path.length;
  })[0];
}

export function getWorkspaceDefinition(workspaceId) {
  const normalized = String(workspaceId || "").trim().toUpperCase();
  return WORKSPACE_DEFINITIONS[normalized] || null;
}

function featureIsAvailable(featureKey, featureControls = {}) {
  return !featureKey || featureControls?.[featureKey] !== false;
}

export function getAvailableWorkspaces({ ownerAuthorized = false, featureControls = {} } = {}) {
  return Object.freeze(PRODUCT_WORKSPACES.filter((workspace) => (
    workspace.switcherEligible &&
    featureIsAvailable(workspace.featureKey, featureControls) &&
    (workspace.requiredAuthority !== AUTHORITY_REQUIREMENTS.VERIFIED_OWNER || ownerAuthorized === true)
  )));
}

export function sanitizeWorkspaceId(value, {
  ownerAuthorized = false,
  featureControls = {},
  fallback = WORKSPACE_IDS.COLLECT,
} = {}) {
  const available = getAvailableWorkspaces({ ownerAuthorized, featureControls });
  const normalized = String(value || "").trim().toUpperCase();
  if (available.some((workspace) => workspace.id === normalized)) return normalized;
  const normalizedFallback = String(fallback || "").trim().toUpperCase();
  if (available.some((workspace) => workspace.id === normalizedFallback)) return normalizedFallback;
  return available[0]?.id || WORKSPACE_IDS.COLLECT;
}

export function getWorkspaceNavigation(workspaceId, {
  ownerAuthorized = false,
  featureControls = {},
  platform = "all",
} = {}) {
  const workspace = getWorkspaceDefinition(workspaceId);
  if (!workspace) return Object.freeze([]);
  if (workspace.requiredAuthority === AUTHORITY_REQUIREMENTS.VERIFIED_OWNER && ownerAuthorized !== true) return Object.freeze([]);
  const items = workspace.navigation.filter((item) => (
    item.implemented &&
    featureIsAvailable(item.featureKey, featureControls) &&
    (item.requiredAuthority !== AUTHORITY_REQUIREMENTS.VERIFIED_OWNER || ownerAuthorized === true) &&
    (platform === "all" || (platform === "mobile" ? item.mobileEligible : item.desktopEligible))
  ));
  return Object.freeze(items);
}

export function resolveWorkspaceContext(pathname = "/", {
  rememberedWorkspace = "",
  ownerAuthorized = false,
  featureControls = {},
  fallback = WORKSPACE_IDS.COLLECT,
} = {}) {
  const routeEntry = resolveRouteOwnership(pathname);
  const routeRequiresOwner = routeEntry?.requiredAuthority === AUTHORITY_REQUIREMENTS.VERIFIED_OWNER;
  const routeWorkspace = routeEntry?.workspace || null;
  const availableWorkspaces = getAvailableWorkspaces({ ownerAuthorized, featureControls });
  const routeWorkspaceAvailable = routeWorkspace && availableWorkspaces.some((workspace) => workspace.id === routeWorkspace);
  const normalizedRemembered = String(rememberedWorkspace || "").trim().toUpperCase();
  const rememberedWorkspaceAvailable = availableWorkspaces.some((workspace) => workspace.id === normalizedRemembered);
  const activeWorkspace = routeWorkspaceAvailable
    ? routeWorkspace
    : sanitizeWorkspaceId(rememberedWorkspace, { ownerAuthorized, featureControls, fallback });
  return Object.freeze({
    activeWorkspace,
    source: routeWorkspaceAvailable ? "route" : rememberedWorkspaceAvailable ? "remembered" : "fallback",
    routeEntry,
    accessDenied: Boolean(routeRequiresOwner && ownerAuthorized !== true),
  });
}
