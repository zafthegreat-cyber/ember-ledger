export const ADAPTIVE_UI_MODES = {
  COLLECTOR: "collector",
  FAMILY: "family",
  SELLER: "seller",
  ADMIN: "admin",
  MODERATOR: "moderator",
};

export const SMART_APP_MODES = ADAPTIVE_UI_MODES;

const FAMILY_MODE_KEYS = new Set(["budget", "parent", "family", "simple", "budget_parent"]);
const SELLER_MODE_KEYS = new Set(["seller", "business", "forge"]);
export const SMART_SETUP_PLAN_TYPES = {
  COLLECTOR_FAMILY: "collector_family",
  SCOUT_HELPER: "scout_helper",
  SELLER: "seller",
  BUSINESS_SELLER: "business_seller",
  ADMIN: "admin",
  PARTNER_SHOP: "partner_shop",
};
const SCOUT_FRESHNESS_WINDOWS = {
  freshMs: 2 * 60 * 60 * 1000,
  agingMs: 8 * 60 * 60 * 1000,
  expiredMs: 24 * 60 * 60 * 1000,
};

function normalizedKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function clampActionKeys(keys = [], maxVisible = 6) {
  return keys.filter(Boolean).slice(0, maxVisible);
}

function uniqueActionKeys(keys = []) {
  return [...new Set(keys.filter(Boolean))];
}

function hasBusinessQuickAddTools(state = {}) {
  return Boolean(
    state.smartSetupFlags?.wantsBusinessTools ||
    state.smartSetup?.recommendedPlanType === SMART_SETUP_PLAN_TYPES.BUSINESS_SELLER ||
    state.smartSetup?.primaryMode === "business_seller"
  );
}

function countValue(value) {
  if (Array.isArray(value)) return value.length;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeStringList(value = []) {
  const rows = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(rows.map(normalizedKey).filter(Boolean))];
}

export const SMART_SETUP_DEFAULTS = {
  purposes: [],
  enabledToolsets: [],
  primaryMode: "not_sure",
  businessTools: "maybe_later",
  homeArea: "",
  favoriteStores: [],
  hiddenStores: [],
  hideIrrelevantStores: false,
  preferredRadius: "",
  recommendedPlanType: "",
  setupCompletedAt: "",
  completedAt: "",
  dismissedAt: "",
};

export function normalizeSmartSetupPreferences(input = {}) {
  const setup = input || {};
  return {
    ...SMART_SETUP_DEFAULTS,
    ...setup,
    purposes: normalizeStringList(setup.purposes || setup.goals || setup.whatBringsYouHere),
    enabledToolsets: normalizeStringList(setup.enabledToolsets || setup.tools || setup.toolsets),
    primaryMode: normalizedKey(setup.primaryMode || setup.primary_user_mode || setup.userMode || "not_sure") || "not_sure",
    businessTools: normalizedKey(setup.businessTools || setup.business_tools || "maybe_later") || "maybe_later",
    homeArea: String(setup.homeArea || setup.home_area || "").trim(),
    favoriteStores: normalizeStringList(setup.favoriteStores || setup.favorite_stores),
    hiddenStores: normalizeStringList(setup.hiddenStores || setup.hidden_stores),
    hideIrrelevantStores: Boolean(setup.hideIrrelevantStores || setup.hide_irrelevant_stores),
    preferredRadius: String(setup.preferredRadius || setup.preferred_radius || "").trim(),
    recommendedPlanType: normalizedKey(setup.recommendedPlanType || setup.recommended_plan_type),
    setupCompletedAt: setup.setupCompletedAt || setup.setup_completed_at || setup.completedAt || "",
    completedAt: setup.completedAt || setup.setupCompletedAt || setup.setup_completed_at || "",
    dismissedAt: setup.dismissedAt || setup.dismissed_at || "",
  };
}

export function smartSetupFlags(setup = {}) {
  const normalized = normalizeSmartSetupPreferences(setup);
  const values = new Set([
    ...normalized.purposes,
    ...normalized.enabledToolsets,
    normalized.primaryMode,
    normalized.businessTools,
    normalized.recommendedPlanType,
  ]);
  return {
    wantsFamilyTools: values.has("collect_pokemon_with_my_family_kids") || values.has("family") || values.has("collector_parent") || values.has("the_spark_kids_program") || values.has("spark") || values.has("kids_program") || values.has(SMART_SETUP_PLAN_TYPES.COLLECTOR_FAMILY),
    wantsScoutTools: values.has("help_report_store_stock") || values.has("scout_restock_reports") || values.has("scout") || values.has("scout_helper") || values.has("find_fair_prices_and_restocks"),
    wantsSellerTools: values.has("sell_trade_and_track_inventory") || values.has("forge_seller_tools") || values.has("sales_tracking") || values.has("casual_seller") || values.has("seller") || values.has(SMART_SETUP_PLAN_TYPES.SELLER),
    wantsBusinessTools: values.has("business_seller") || values.has("mileage_tracking") || values.has("year_end_export_tax_support_later") || values.has("yes_i_need_sales_expenses_mileage_receipts") || values.has("yes_i_need_year_end_export_tax_support_later") || values.has(SMART_SETUP_PLAN_TYPES.BUSINESS_SELLER),
    wantsAdminTools: values.has("run_or_manage_ember_tide_tools") || values.has("admin_tools") || values.has("admin") || values.has(SMART_SETUP_PLAN_TYPES.ADMIN),
    wantsPartnerTools: values.has("i_m_a_card_shop_or_partner") || values.has("card_shop_partner") || values.has("partner_shop") || values.has(SMART_SETUP_PLAN_TYPES.PARTNER_SHOP),
  };
}

export function recommendSmartSetup(input = {}, { adminAllowed = false } = {}) {
  const setup = normalizeSmartSetupPreferences(input);
  const flags = smartSetupFlags(setup);
  const toolsets = new Set(setup.enabledToolsets);
  const includes = [];
  const hides = [];
  let planType = SMART_SETUP_PLAN_TYPES.COLLECTOR_FAMILY;
  let label = "Collector / Family";
  let summary = "Best for parents, kids, and casual collectors.";
  let why = "It keeps Vault, Scout, Market, The Spark, and community tools visible while keeping seller records out of the way.";

  if (adminAllowed && flags.wantsAdminTools) {
    planType = SMART_SETUP_PLAN_TYPES.ADMIN;
    label = "Admin";
    summary = "Best for protected Ember & Tide operations.";
    why = "Your account can see permission-safe admin review tools without crowding normal collector pages.";
  } else if (flags.wantsBusinessTools || setup.primaryMode === "business_seller") {
    planType = SMART_SETUP_PLAN_TYPES.BUSINESS_SELLER;
    label = "Business Seller";
    summary = "Best for serious seller and business tracking.";
    why = "You asked for sales, receipts, mileage, expenses, profit, and year-end/tax-support tools.";
  } else if (flags.wantsSellerTools || setup.primaryMode === "casual_seller") {
    planType = SMART_SETUP_PLAN_TYPES.SELLER;
    label = "Seller";
    summary = "Best for occasional sellers who need Forge without full business overhead.";
    why = "You want inventory, sale, planned price, and basic receipt tracking.";
  } else if (flags.wantsPartnerTools) {
    planType = SMART_SETUP_PLAN_TYPES.PARTNER_SHOP;
    label = "Partner Shop";
    summary = "Future mode for card shops and family-friendly partners.";
    why = "Partner tools are noted for future setup. Collector and Scout tools stay available for now.";
  } else if (flags.wantsScoutTools && !flags.wantsFamilyTools) {
    planType = SMART_SETUP_PLAN_TYPES.SCOUT_HELPER;
    label = "Scout Helper";
    summary = "Best for people who mainly report and confirm store stock.";
    why = "You prioritized Scout reports, favorite stores, report confirmations, and local signals.";
  }

  if (planType === SMART_SETUP_PLAN_TYPES.ADMIN) {
    includes.push("Admin Command Center", "Beta approvals", "Invites", "Report review", "Missing catalog requests", "Feedback inbox", "Moderation");
    hides.push("Admin tools stay out of normal pages unless needed");
  } else if (planType === SMART_SETUP_PLAN_TYPES.BUSINESS_SELLER) {
    includes.push("Forge", "Sales", "Receipts", "Mileage", "Expenses", "Profit", "Year-end/tax support", "Market comparisons");
    hides.push("Admin tools", "Partner shop tools until supported");
  } else if (planType === SMART_SETUP_PLAN_TYPES.SELLER) {
    includes.push("Vault", "Forge", "Market", "Sales", "Planned sale price", "Basic receipts");
    hides.push("Mileage and tax tools unless business tools are enabled", "Admin tools");
  } else if (planType === SMART_SETUP_PLAN_TYPES.SCOUT_HELPER) {
    includes.push("Scout", "Home area", "Favorite stores", "Scout Points", "Report confirmations", "Market/Vault basics");
    hides.push("Forge", "Sales", "Mileage", "Receipts", "Tax tools", "Admin tools");
  } else if (planType === SMART_SETUP_PLAN_TYPES.PARTNER_SHOP) {
    includes.push("Scout", "Market", "Tidepool", "Help & Support", "Partner Shop Mode later");
    hides.push("Payment/shop tools until built", "Admin tools unless approved");
  } else {
    includes.push("Hearth", "Vault", "Scout", "Market", "The Spark", "Tidepool");
    hides.push("Forge", "Sales", "Mileage", "Receipts", "Tax tools", "Admin tools");
  }

  if (toolsets.has("market_price_checks") && !includes.includes("Market")) includes.push("Market");
  if (toolsets.has("tidepool_community") && !includes.includes("Tidepool")) includes.push("Tidepool");

  return { planType, label, summary, why, includes, hides };
}

export function resolveSmartRouteContext(activeRoute = "") {
  const route = normalizedKey(activeRoute || "dashboard");
  if (["dashboard", "home", "hearth"].includes(route)) return { key: "hearth", label: "Hearth" };
  if (route.includes("scout") || route === "stores" || route === "daily_tide") return { key: "scout", label: "Scout" };
  if (route.includes("vault") || route.includes("collection")) return { key: "vault", label: "Vault" };
  if (["inventory", "forge", "sales", "expenses", "mileage", "reports"].includes(route)) return { key: "forge", label: "Forge" };
  if (["market", "tidetradr", "tide_tradr"].includes(route)) return { key: "market", label: "Market" };
  if (["kids_program", "spark"].includes(route)) return { key: "spark", label: "The Spark" };
  if (route.includes("admin") || route.includes("moderator")) return { key: "admin", label: "Admin" };
  return { key: route || "hearth", label: "Current page" };
}

export function resolveSmartPermissions({
  adminToolsVisible = false,
  moderatorToolsVisible = false,
  sellerToolsVisible = false,
  canManageRoles = false,
  canManageBeta = false,
  canModerateReports = false,
} = {}) {
  return {
    canSeeSellerTools: Boolean(sellerToolsVisible || adminToolsVisible),
    canSeeAdminTools: Boolean(adminToolsVisible),
    canSeeModeratorTools: Boolean(adminToolsVisible || moderatorToolsVisible),
    canManageRoles: Boolean(adminToolsVisible && canManageRoles),
    canManageBeta: Boolean(adminToolsVisible && canManageBeta),
    canModerateReports: Boolean((adminToolsVisible || moderatorToolsVisible) && canModerateReports),
  };
}

export function resolveEnabledFeatureState({
  forgeAvailable = false,
  catalogSearchAvailable = true,
  scoutAvailable = true,
  marketAvailable = true,
  sparkAvailable = true,
  scannerAvailable = false,
  adminReviewAvailable = false,
} = {}) {
  return {
    forgeAvailable: Boolean(forgeAvailable),
    catalogSearchAvailable: Boolean(catalogSearchAvailable),
    scoutAvailable: Boolean(scoutAvailable),
    marketAvailable: Boolean(marketAvailable),
    sparkAvailable: Boolean(sparkAvailable),
    scannerAvailable: Boolean(scannerAvailable),
    adminReviewAvailable: Boolean(adminReviewAvailable),
  };
}

export function resolveAdaptiveUiState({
  userType = "",
  dashboardPreset = "",
  isSellerExperience = false,
  sellerToolsEnabled = false,
  adminToolsVisible = false,
  moderatorToolsVisible = false,
  kidsProgramFocus = false,
  currentRoute = "dashboard",
  enabledFeatures = {},
  setupPreferences = {},
} = {}) {
  const normalizedUserType = normalizedKey(userType);
  const normalizedPreset = normalizedKey(dashboardPreset);
  const smartSetup = normalizeSmartSetupPreferences(setupPreferences);
  const smartFlags = smartSetupFlags(smartSetup);
  const familyMode = Boolean(
    kidsProgramFocus ||
    smartFlags.wantsFamilyTools ||
    FAMILY_MODE_KEYS.has(normalizedUserType) ||
    FAMILY_MODE_KEYS.has(normalizedPreset)
  );
  const sellerMode = Boolean(
    isSellerExperience ||
    sellerToolsEnabled ||
    smartFlags.wantsSellerTools ||
    smartFlags.wantsBusinessTools ||
    SELLER_MODE_KEYS.has(normalizedUserType) ||
    SELLER_MODE_KEYS.has(normalizedPreset)
  );
  const adminMode = Boolean(adminToolsVisible);
  const moderatorMode = Boolean(!adminMode && moderatorToolsVisible);
  const mode = adminMode
    ? ADAPTIVE_UI_MODES.ADMIN
    : moderatorMode
      ? ADAPTIVE_UI_MODES.MODERATOR
      : sellerMode
        ? ADAPTIVE_UI_MODES.SELLER
        : familyMode
          ? ADAPTIVE_UI_MODES.FAMILY
          : ADAPTIVE_UI_MODES.COLLECTOR;

  const routeContext = resolveSmartRouteContext(currentRoute);
  const features = resolveEnabledFeatureState(enabledFeatures);

  return {
    mode,
    routeContext,
    enabledFeatures: features,
    smartSetup,
    smartSetupFlags: smartFlags,
    familyMode,
    scoutMode: smartFlags.wantsScoutTools,
    sellerMode,
    adminMode,
    moderatorMode,
    collectorMode: mode === ADAPTIVE_UI_MODES.COLLECTOR,
    showSellerTools: sellerMode,
    showAdminTools: adminMode,
    showModeratorTools: adminMode || moderatorMode,
    showKidsProgram: true,
    modeLabel: {
      [ADAPTIVE_UI_MODES.ADMIN]: "Admin command view",
      [ADAPTIVE_UI_MODES.MODERATOR]: "Moderator review view",
      [ADAPTIVE_UI_MODES.SELLER]: "Seller tools active",
      [ADAPTIVE_UI_MODES.FAMILY]: "Family collector view",
      [ADAPTIVE_UI_MODES.COLLECTOR]: "Collector view",
    }[mode],
    hearthMode: {
      [ADAPTIVE_UI_MODES.ADMIN]: "admin",
      [ADAPTIVE_UI_MODES.MODERATOR]: "admin",
      [ADAPTIVE_UI_MODES.SELLER]: "seller",
      [ADAPTIVE_UI_MODES.FAMILY]: "simple",
      [ADAPTIVE_UI_MODES.COLLECTOR]: "collector",
    }[mode],
  };
}

export function selectSmartQuickAddKeys(state = {}, { forgeAvailable = false, currentPage = "" } = {}) {
  return selectSmartQuickAddActionPlan(state, { forgeAvailable, currentPage }).visibleKeys;
}

export function selectSmartQuickAddActionPlan(state = {}, { forgeAvailable = false, currentPage = "", maxVisible = 6 } = {}) {
  const pageKey = resolveSmartRouteContext(currentPage || state.routeContext?.key).key;
  const businessTools = hasBusinessQuickAddTools(state);
  let orderedKeys = [];

  let visibleLimit = maxVisible;

  if (state.showAdminTools) {
    if (pageKey === "scout") {
      orderedKeys = ["scout", "reviewMissing", "store", "vault", forgeAvailable ? "forge" : "", "missing", "announcement", "quickFind"];
    } else {
      orderedKeys = ["reviewMissing", "store", "announcement", "scout", "vault", forgeAvailable ? "forge" : "", "missing", "quickFind"];
    }
  } else if (state.showSellerTools) {
    if (pageKey === "scout") {
      orderedKeys = ["scout", "missing", "forge", "vault", "sale", "receipt", "quickFind", "mileage"];
    } else if (pageKey === "vault") {
      orderedKeys = ["vault", "forge", "sale", "receipt", "missing", "mileage", "quickFind"];
    } else if (pageKey === "forge") {
      orderedKeys = businessTools
        ? ["forge", "sale", "receipt", "mileage", "vault", "missing", "expense", "quickFind"]
        : ["forge", "sale", "receipt", "mileage", "vault", "missing", "quickFind"];
    } else if (pageKey === "market") {
      orderedKeys = businessTools
        ? ["vault", "forge", "sale", "receipt", "missing", "mileage", "expense", "quickFind"]
        : ["vault", "forge", "sale", "missing", "receipt", "mileage", "quickFind"];
    } else {
      orderedKeys = businessTools
        ? ["forge", "sale", "receipt", "mileage", "vault", "missing", "expense", "quickFind"]
        : ["forge", "sale", "receipt", "mileage", "vault", "missing", "quickFind"];
    }
  } else if (state.familyMode) {
    visibleLimit = Math.min(maxVisible, 4);
    if (pageKey === "scout") orderedKeys = ["scout", "vault", "missing", "spark", "quickFind"];
    else if (pageKey === "vault") orderedKeys = ["vault", "scout", "missing", "spark", "quickFind"];
    else orderedKeys = ["vault", "scout", "missing", "spark", "quickFind"];
  } else if (state.scoutMode) {
    visibleLimit = Math.min(maxVisible, 4);
    if (pageKey === "vault") orderedKeys = ["vault", "scout", "quickFind", "missing"];
    else orderedKeys = ["scout", "vault", "quickFind", "missing"];
  } else if (pageKey === "scout") {
    visibleLimit = Math.min(maxVisible, 4);
    orderedKeys = ["scout", "vault", "missing", "quickFind"];
  } else if (pageKey === "vault") {
    visibleLimit = Math.min(maxVisible, 4);
    orderedKeys = ["vault", "quickFind", "scout", "missing"];
  } else if (pageKey === "market") {
    visibleLimit = Math.min(maxVisible, 4);
    orderedKeys = ["quickFind", "vault", "scout", "missing"];
  } else {
    visibleLimit = Math.min(maxVisible, 4);
    orderedKeys = ["vault", "scout", "missing", "quickFind"];
  }

  const allKeys = uniqueActionKeys(orderedKeys);
  const visibleKeys = clampActionKeys(allKeys, visibleLimit);
  const overflowKeys = allKeys.filter((key) => !visibleKeys.includes(key));
  return { pageKey, visibleKeys, overflowKeys, allKeys, businessTools };
}

export function selectAdaptiveQuickAddKeys(state = {}, options = {}) {
  return selectSmartQuickAddKeys(state, options);
}

export function selectAdaptiveMenuKeys(state = {}) {
  if (state.showAdminTools) {
    return [
      "admin",
      "betaUsers",
      "invites",
      "reportReview",
      "missingCatalog",
      "feedbackInbox",
      "moderation",
      "settings",
    ];
  }
  if (state.showModeratorTools) {
    return ["reportReview", "moderation", "settings"];
  }

  if (state.showSellerTools) {
    return [
      "forge",
      "sales",
      "receipts",
      "mileage",
      "taxCenter",
      "settings",
    ];
  }

  return [
    "tidepool",
    "spark",
    "announcements",
    "help",
    "settings",
  ];
}

export function selectAdaptiveDesktopMainKeys(state = {}) {
  const base = ["home", "today", "scout", "vault", "tideTradr"];
  if (state.showSellerTools) base.push("forge");
  base.push("tidepool");
  return base;
}

export function selectAdaptiveCommandDeskKeys(state = {}) {
  if (state.showAdminTools) {
    return ["admin", "betaUsers", "reportReview", "feedbackInbox", "moderation"];
  }
  if (state.showModeratorTools) {
    return ["reportReview", "moderation"];
  }
  if (state.showSellerTools) {
    return ["receipts", "mileage", "sales", "inventory", "taxCenter"];
  }
  return [];
}

export function selectAdaptiveHearthQuickActionKeys(state = {}) {
  if (state.showAdminTools) return ["quickAdd", "scoutReport", "admin", "vault"];
  if (state.showSellerTools) return ["quickAdd", "addSale", "addReceipt", "forge"];
  if (state.scoutMode) return ["quickAdd", "scoutReport", "vault", "market"];
  if (state.familyMode) return ["quickAdd", "scoutReport", "vault", "spark"];
  return ["quickAdd", "scoutReport", "vault", "market"];
}

export function adaptiveForgeAccessMessage(state = {}) {
  if (state.showSellerTools) return "";
  return "Forge is for seller and business tracking. Turn on seller tools to use inventory, expenses, mileage, and sales.";
}

export function smartLockedFeatureMessage(featureKey = "") {
  const key = normalizedKey(featureKey);
  const messages = {
    forge: "Seller tools are available in Forge mode.",
    seller_tools: "Seller tools are available in Forge mode.",
    mileage: "Mileage tracking is part of business tools.",
    receipts: "Receipt tracking is part of business tools.",
    tax_center: "Tax support is part of business tools.",
    admin: "Admin tools are only visible to approved admins.",
    scout_forecast: "Not enough reports yet.",
    scout_confirmation: "Needs more community confirmation.",
    market_estimate: "Market data is limited. Review before acting.",
  };
  return messages[key] || "This tool is not available in the current mode.";
}

export function resolveHearthSmartNextAction(state = {}, data = {}) {
  const adminPendingCount = countValue(data.pendingAdminCount);
  if (state.showAdminTools && adminPendingCount > 0) {
    return {
      key: "admin_review",
      badge: "Admin",
      title: "Admin items need review",
      reason: `${adminPendingCount} protected review item${adminPendingCount === 1 ? "" : "s"} need attention.`,
      primaryLabel: "Open Admin",
      secondaryLabel: "Go Home",
    };
  }

  if (state.showSellerTools) {
    return {
      key: "seller_progress",
      badge: "Forge",
      title: "Track today's progress",
      reason: "Open Forge for inventory, sale, receipt, mileage, and seller records.",
      primaryLabel: "Open Forge",
      secondaryLabel: "Quick Add",
    };
  }

  if (state.familyMode && data.kidsProgramFocus) {
    return {
      key: "spark_focus",
      badge: "Spark",
      title: "Support The Spark",
      reason: "Keep kid-focused requests and family-safe collecting in one place.",
      primaryLabel: "Open The Spark",
      secondaryLabel: "Add to Vault",
    };
  }

  const vaultCount = countValue(data.vaultItems);
  const scoutCount = countValue(data.scoutReports);
  const freshScoutCount = countValue(data.freshScoutReports);
  if (state.scoutMode && scoutCount <= 0) {
    return {
      key: "first_scout_report",
      badge: "Scout",
      title: "Submit your first Scout report",
      reason: "You chose Scout-heavy tools. Start with one honest store report or confirmation.",
      primaryLabel: "Submit Scout Report",
      secondaryLabel: "Open Scout",
    };
  }
  if (state.scoutMode && freshScoutCount <= 0) {
    return {
      key: "scout_helper",
      badge: "Scout",
      title: "Help refresh local signals",
      reason: "No fresh reports are available yet. A clear store report helps the next family.",
      primaryLabel: "Submit Scout Report",
      secondaryLabel: "Open Scout",
    };
  }
  if (vaultCount <= 0) {
    return {
      key: "start_collection",
      badge: "Vault",
      title: "Start your collection",
      reason: "Add your first item so Ember & Tide can guide your next best steps.",
      primaryLabel: "Add to Vault",
      secondaryLabel: "Search Market",
    };
  }
  if (scoutCount <= 0) {
    return {
      key: "first_scout_report",
      badge: "Scout",
      title: "Submit your first Scout report",
      reason: "Your report can help another family and build better local history.",
      primaryLabel: "Submit Scout Report",
      secondaryLabel: "Open Scout",
    };
  }
  if (freshScoutCount > 0 || data.hasTrustedScoutSignal) {
    return {
      key: "fresh_scout_signals",
      badge: "Scout",
      title: "Fresh signals nearby",
      reason: "Recent community reports are available. Review freshness before heading out.",
      primaryLabel: "Open Scout",
      secondaryLabel: "Submit Report",
    };
  }

  return {
    key: "default_collection",
    badge: "Vault",
    title: "Start your collection",
    reason: "Add to Vault when you are ready. Scout and Market stay close by.",
    primaryLabel: "Add to Vault",
    secondaryLabel: "Open Scout",
  };
}

export function scoutFreshnessGuidance(report = {}, now = Date.now()) {
  const timestamp = report.observed_at || report.observedAt || report.report_time || report.reportTime || report.created_at || report.createdAt;
  const time = timestamp ? new Date(timestamp).getTime() : NaN;
  if (!Number.isFinite(time)) return { label: "Needs confirmation", tone: "warning", helper: "Report time is unclear." };
  const ageMs = Math.max(0, Number(now) - time);
  if (ageMs < SCOUT_FRESHNESS_WINDOWS.freshMs) return { label: "Fresh", tone: "success", helper: "New stock reported recently." };
  if (ageMs < SCOUT_FRESHNESS_WINDOWS.agingMs) return { label: "Aging", tone: "warning", helper: "May still be available." };
  if (ageMs < SCOUT_FRESHNESS_WINDOWS.expiredMs) return { label: "Old", tone: "danger", helper: "Likely picked over." };
  return { label: "Expired", tone: "muted", helper: "Very unlikely to find." };
}

export function scoutTrustGuidance(report = {}) {
  const status = normalizedKey(report.trust_state || report.trustState || report.status || report.verification_status || report.verificationStatus);
  if (report.verified || status.includes("verified")) return { label: "Verified", tone: "success", helper: "Store confirmed." };
  if (report.admin_reviewed || report.adminReviewed || status.includes("admin")) return { label: "Admin reviewed", tone: "info", helper: "Reviewed by admin." };
  const confirmations = countValue(report.confirmations || report.confirmation_count || report.confirmationCount);
  if (confirmations > 0 || status.includes("community")) return { label: "Community", tone: "info", helper: "Community confirmed." };
  if (status.includes("need") || status.includes("pending")) return { label: "Needs confirmation", tone: "warning", helper: "Waiting for confirmation." };
  return { label: "Unverified", tone: "warning", helper: "Needs more reports." };
}

export function marketValueGuidance(item = {}, state = {}) {
  const source = normalizedKey(item.priceSource || item.source || item.source_type || item.sourceType || item.marketSource);
  const estimate = Number(item.marketPrice || item.marketValue || item.estimatedValue || item.price);
  const msrp = Number(item.msrp || item.retailPrice || item.retail);
  const asking = Number(item.askingPrice || item.asking || item.listPrice || item.price);
  const hasEstimate = Number.isFinite(estimate) && estimate > 0;
  const hasMsrp = Number.isFinite(msrp) && msrp > 0;
  const hasAsking = Number.isFinite(asking) && asking > 0;

  if (!hasEstimate && !hasMsrp && !source) {
    return { label: "Source unknown", tone: "muted", helper: "Review manually before acting." };
  }
  if (source.includes("manual")) {
    return { label: "Manual entry", tone: "warning", helper: "Entered by user. Verify before acting." };
  }
  if (hasAsking && hasMsrp && asking <= msrp * 1.08) {
    return { label: "Near retail", tone: "success", helper: "Asking price is close to retail." };
  }
  if (hasAsking && hasEstimate && asking <= estimate * 1.05) {
    return { label: "Fair price", tone: "success", helper: "Near available market data." };
  }
  if (hasAsking && hasEstimate && asking > estimate * 1.2) {
    return { label: "High price", tone: "danger", helper: "Above available market data." };
  }
  if (hasEstimate) {
    return {
      label: state.showSellerTools ? "Market comps" : "Market estimate",
      tone: "info",
      helper: "Based on available catalog or market data.",
    };
  }
  return { label: "Catalog data", tone: "info", helper: "Catalog match available. Value may need review." };
}

export function buildAdminPendingTaskPrompts(counts = {}) {
  return [
    { key: "beta", label: "Beta requests", count: countValue(counts.betaRequests) },
    { key: "invites", label: "Invite issues", count: countValue(counts.inviteIssues) },
    { key: "scout", label: "Scout review", count: countValue(counts.scoutReports) },
    { key: "catalog", label: "Missing catalog", count: countValue(counts.missingCatalog) },
    { key: "feedback", label: "Feedback inbox", count: countValue(counts.feedback) },
    { key: "moderation", label: "Flagged content", count: countValue(counts.flaggedContent) },
    { key: "spark", label: "Kids Program", count: countValue(counts.kidsProgram) },
  ].filter((prompt) => prompt.count > 0);
}
