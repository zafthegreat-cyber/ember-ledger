const APP_SETUP_MODES = ["collector", "family", "scout", "seller", "admin"];
const QUICK_ADD_MAX_VISIBLE = 6;

function normalizeKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function uniqueKeys(keys = []) {
  return [...new Set((Array.isArray(keys) ? keys : []).map(normalizeKey).filter(Boolean))];
}

function contextMode(context = {}) {
  const userType = normalizeKey(context.userType);
  const preset = normalizeKey(context.dashboardPreset);
  if (context.adminToolsVisible) return "admin";
  if (context.sellerToolsEnabled || ["seller", "business", "full_business"].includes(userType) || ["seller", "full_business"].includes(preset)) return "seller";
  if (context.scoutMode || userType === "scout" || preset === "restock_scout") return "scout";
  if (context.familyMode || ["budget", "parent", "family"].includes(userType) || ["budget_parent", "simple"].includes(preset)) return "family";
  return "collector";
}

export const APP_SETUP_PAGE_GROUPS = [
  {
    key: "hearth",
    label: "Hearth",
    subtitle: "Your home base.",
    options: [
      { key: "nextMove", label: "Your Next Move", helper: "The smart next action on Hearth.", locked: true },
      { key: "quickActions", label: "Quick Actions", helper: "Fast actions near the top of Hearth.", recommended: APP_SETUP_MODES },
      { key: "vaultSnapshot", label: "Vault Snapshot", helper: "Collection count and value summary.", recommended: APP_SETUP_MODES },
      { key: "scoutSignals", label: "Scout Signals", helper: "Nearby store signals and report status.", recommended: ["collector", "family", "scout", "admin"] },
      { key: "marketWatch", label: "Market Watch", helper: "Fair value and watchlist context.", recommended: APP_SETUP_MODES },
      { key: "spark", label: "The Spark", helper: "Kids Program mission and requests.", recommended: ["collector", "family", "admin"] },
      { key: "forgeSummary", label: "Forge Summary", helper: "Seller workspace snapshot.", sellerOnly: true, recommended: ["seller", "admin"] },
      { key: "todayActivity", label: "Today's Activity", helper: "Recent app activity and reminders.", recommended: APP_SETUP_MODES },
      { key: "tips", label: "Tips / Learn More", helper: "Short guidance for new beta users.", recommended: ["collector", "family", "scout"] },
      { key: "setMastery", label: "Set Mastery", helper: "Future set completion progress from Vault.", recommended: ["collector", "family", "seller", "admin"] },
    ],
  },
  {
    key: "quickAdd",
    label: "Quick Add",
    subtitle: "Adaptive add hub. Four to six actions show first; the rest go under More.",
    maxVisible: QUICK_ADD_MAX_VISIBLE,
    options: [
      { key: "vault", label: "Add to Vault", helper: "Save to your collection.", recommended: APP_SETUP_MODES },
      { key: "scout", label: "Scout Report", helper: "Report store stock.", recommended: APP_SETUP_MODES },
      { key: "missing", label: "Request Missing Item", helper: "Request or manually add an item.", recommended: APP_SETUP_MODES },
      { key: "spark", label: "The Spark", helper: "Open the Kids Program request flow.", recommended: ["collector", "family", "admin"] },
      { key: "quickFind", label: "Scan Anything", helper: "Search, UPC/SKU, or manual entry.", recommended: APP_SETUP_MODES },
      { key: "forge", label: "Add to Forge", helper: "Add seller inventory.", sellerOnly: true, recommended: ["seller", "admin"] },
      { key: "sale", label: "Add Sale", helper: "Record a sale.", sellerOnly: true, recommended: ["seller", "admin"] },
      { key: "receipt", label: "Add Receipt", helper: "Save purchase proof.", sellerOnly: true, recommended: ["seller", "admin"] },
      { key: "mileage", label: "Add Mileage", helper: "Log a store or business trip.", sellerOnly: true, recommended: ["seller", "admin"] },
      { key: "expense", label: "Add Expense", helper: "Track seller/business costs.", sellerOnly: true, recommended: ["seller", "admin"] },
    ],
  },
  {
    key: "scout",
    label: "Scout",
    subtitle: "Store Signals.",
    options: [
      { key: "nearby", label: "Nearby", helper: "Local report feed.", recommended: APP_SETUP_MODES },
      { key: "following", label: "Following", helper: "Favorite stores and watched signals.", recommended: APP_SETUP_MODES },
      { key: "map", label: "Map", helper: "Store map where available.", recommended: ["collector", "scout", "seller", "admin"] },
      { key: "myReports", label: "My Reports", helper: "Your report history.", recommended: APP_SETUP_MODES },
      { key: "dropWatch", label: "Drop Watch", helper: "Upcoming drop and release context.", recommended: ["scout", "seller", "admin"] },
      { key: "scoutPoints", label: "Scout Points", helper: "Contribution progress.", recommended: ["scout", "admin"] },
      { key: "tideScore", label: "Tide Score", helper: "Confidence signals for reports and stores.", recommended: APP_SETUP_MODES },
      { key: "favoriteStores", label: "Favorite Stores", helper: "Stores you care about most.", recommended: APP_SETUP_MODES },
    ],
  },
  {
    key: "vault",
    label: "Vault",
    subtitle: "Collection.",
    options: [
      { key: "collectionValue", label: "Collection Value", helper: "Known value summary.", recommended: APP_SETUP_MODES },
      { key: "setMastery", label: "Set Mastery", helper: "Future set completion tracking.", recommended: ["collector", "family", "seller", "admin"] },
      { key: "wishlist", label: "Wishlist", helper: "Items you want next.", recommended: APP_SETUP_MODES },
      { key: "recentAdditions", label: "Recent Additions", helper: "Recently saved items.", recommended: APP_SETUP_MODES },
      { key: "sealedProducts", label: "Sealed Products", helper: "Sealed collection grouping.", recommended: APP_SETUP_MODES },
      { key: "singles", label: "Singles", helper: "Cards and singles grouping.", recommended: ["collector", "seller", "admin"] },
      { key: "ownerBreakdown", label: "Owner Breakdown", helper: "People/family ownership view.", recommended: ["family", "seller", "admin"] },
      { key: "priceTrends", label: "Price Trends", helper: "Market Watch value movement where data exists.", recommended: ["collector", "seller", "admin"] },
      { key: "notesPhotos", label: "Notes / Photos", helper: "Proof, notes, and item context.", recommended: APP_SETUP_MODES },
    ],
  },
  {
    key: "forge",
    label: "Forge",
    subtitle: "Seller Tools.",
    sellerOnly: true,
    options: [
      { key: "inventory", label: "Inventory", helper: "Items available or planned for sale.", recommended: ["seller", "admin"] },
      { key: "sales", label: "Sales", helper: "Grouped sales records.", recommended: ["seller", "admin"] },
      { key: "receipts", label: "Receipts", helper: "Purchase proof and expense support.", recommended: ["seller", "admin"] },
      { key: "expenses", label: "Expenses", helper: "Business costs.", recommended: ["seller", "admin"] },
      { key: "mileage", label: "Mileage", helper: "Vehicle and trip records.", recommended: ["seller", "admin"] },
      { key: "taxes", label: "Taxes", helper: "Record summary, not tax advice.", recommended: ["seller", "admin"] },
      { key: "payoutAssist", label: "Payout Assist", helper: "Planning estimate, not payroll or tax advice.", recommended: ["seller", "admin"] },
      { key: "personTabs", label: "Person Tabs", helper: "People-based ledger views.", recommended: ["seller", "admin"] },
      { key: "profitSnapshot", label: "Profit Snapshot", helper: "Estimated sales and cost summary.", recommended: ["seller", "admin"] },
    ],
  },
  {
    key: "marketWatch",
    label: "Market Watch",
    subtitle: "Prices, watchlist, and fair value.",
    options: [
      { key: "forYou", label: "For You", helper: "Recommended searches and watched items.", recommended: APP_SETUP_MODES },
      { key: "nearRetail", label: "Near Retail", helper: "Retail-friendly finds.", recommended: APP_SETUP_MODES },
      { key: "watchlist", label: "Watchlist", helper: "Watched products.", recommended: APP_SETUP_MODES },
      { key: "recent", label: "Recent", helper: "Recent searches.", recommended: ["collector", "seller", "admin"] },
      { key: "following", label: "Following", helper: "Followed products and stores.", recommended: ["collector", "scout", "seller", "admin"] },
      { key: "fairPriceBadges", label: "Fair Price Badges", helper: "Near Retail, Fair Price, High Price, and data status labels.", recommended: APP_SETUP_MODES },
      { key: "priceTrend", label: "Price Trend", helper: "Trend context when available.", recommended: ["collector", "seller", "admin"] },
      { key: "addToVault", label: "Add to Vault", helper: "Save found products to Vault.", recommended: APP_SETUP_MODES },
      { key: "addToForge", label: "Add to Forge", helper: "Save found products to Forge.", sellerOnly: true, recommended: ["seller", "admin"] },
    ],
  },
  {
    key: "tidepool",
    label: "Tidepool Community",
    subtitle: "Family-safe community.",
    options: [
      { key: "feed", label: "Feed", helper: "Community posts.", recommended: APP_SETUP_MODES },
      { key: "local", label: "Local", helper: "Local community updates.", recommended: ["family", "scout", "admin"] },
      { key: "events", label: "Events", helper: "Future events and reminders.", recommended: ["family", "seller", "admin"] },
      { key: "following", label: "Following", helper: "Followed posts or stores.", recommended: ["collector", "family", "scout", "admin"] },
      { key: "myPosts", label: "My Posts", helper: "Your Tidepool activity.", recommended: APP_SETUP_MODES },
      { key: "safetyReminders", label: "Safety Reminders", helper: "Family-safe guardrails.", locked: true },
    ],
  },
  {
    key: "spark",
    label: "The Spark",
    subtitle: "Kids Program.",
    options: [
      { key: "kidsPacks", label: "Kids Packs", helper: "Pack and giveaway mission.", recommended: ["collector", "family", "admin"] },
      { key: "giveaways", label: "Giveaways", helper: "Future giveaway status.", recommended: ["family", "admin"] },
      { key: "events", label: "Events", helper: "Family-friendly events.", recommended: ["family", "admin"] },
      { key: "learnGrow", label: "Learn & Grow", helper: "Parent-safe collecting education.", recommended: ["collector", "family", "admin"] },
      { key: "requestStatus", label: "Request Status", helper: "Submitted Spark request status.", recommended: ["family", "admin"] },
      { key: "parentSafeNotes", label: "Parent-Safe Notes", helper: "Safety copy and parent controls.", locked: true },
    ],
  },
  {
    key: "settings",
    label: "Settings / Support",
    subtitle: "Setup, workspace, safety, and help.",
    options: [
      { key: "appSetup", label: "App Setup", helper: "Setup and personalization remain visible.", locked: true },
      { key: "workspace", label: "Workspace", helper: "Collections and access controls.", locked: true },
      { key: "privacySafety", label: "Privacy & Safety", helper: "Safety-critical settings stay visible.", locked: true },
      { key: "knownIssues", label: "Known Issues", helper: "Beta limitations and support notes.", recommended: APP_SETUP_MODES },
      { key: "releaseNotes", label: "Release Notes", helper: "What's new.", recommended: APP_SETUP_MODES },
      { key: "feedback", label: "Feedback", helper: "Send feedback and bug reports.", recommended: APP_SETUP_MODES },
      { key: "appVersion", label: "App Version", helper: "Build and version details.", recommended: APP_SETUP_MODES },
      { key: "adminTools", label: "Admin Tools", helper: "Protected owner/admin tools.", adminOnly: true, recommended: ["admin"] },
    ],
  },
];

export function appSetupGroupForKey(pageKey) {
  return APP_SETUP_PAGE_GROUPS.find((group) => group.key === pageKey) || null;
}

export function appSetupOptionAllowed(option = {}, context = {}) {
  if (option.adminOnly && !context.adminToolsVisible) return false;
  if (option.sellerOnly && !context.sellerToolsEnabled && !context.adminToolsVisible) return false;
  return true;
}

export function buildRecommendedAppPreferences(context = {}) {
  const mode = contextMode(context);
  const pagePreferences = Object.fromEntries(APP_SETUP_PAGE_GROUPS.map((group) => {
    const visibleKeys = group.options
      .filter((option) => appSetupOptionAllowed(option, context))
      .filter((option) => option.locked || (option.recommended || []).includes(mode))
      .map((option) => option.key);
    return [group.key, { visibleKeys, updatedAt: "" }];
  }));
  return {
    version: 1,
    smartRecommendationsEnabled: true,
    dismissedRecommendationIds: [],
    acceptedRecommendationIds: [],
    pagePreferences,
    updatedAt: "",
  };
}

export function sanitizeAppSetupVisibleKeys(pageKey, keys = [], context = {}) {
  const group = appSetupGroupForKey(pageKey);
  if (!group) return [];
  const allowed = group.options.filter((option) => appSetupOptionAllowed(option, context));
  const allowedSet = new Set(allowed.map((option) => option.key));
  const lockedKeys = allowed.filter((option) => option.locked).map((option) => option.key);
  const cleaned = uniqueKeys(keys)
    .map((key) => group.options.find((option) => normalizeKey(option.key) === key)?.key || key)
    .filter((key) => allowedSet.has(key));
  return [...new Set([...lockedKeys, ...cleaned])];
}

export function normalizeAppPersonalizationPreferences(input = {}, context = {}) {
  const defaults = buildRecommendedAppPreferences(context);
  const source = input && typeof input === "object" ? input : {};
  const pagePreferences = {};
  APP_SETUP_PAGE_GROUPS.forEach((group) => {
    const saved = source.pagePreferences?.[group.key] || source.pages?.[group.key] || {};
    const savedKeys = Array.isArray(saved.visibleKeys) ? saved.visibleKeys : null;
    const visibleKeys = sanitizeAppSetupVisibleKeys(group.key, savedKeys || defaults.pagePreferences[group.key]?.visibleKeys || [], context);
    pagePreferences[group.key] = {
      visibleKeys: visibleKeys.length ? visibleKeys : defaults.pagePreferences[group.key]?.visibleKeys || [],
      updatedAt: saved.updatedAt || "",
    };
  });

  return {
    version: 1,
    smartRecommendationsEnabled: source.smartRecommendationsEnabled !== false,
    dismissedRecommendationIds: uniqueKeys(source.dismissedRecommendationIds),
    acceptedRecommendationIds: uniqueKeys(source.acceptedRecommendationIds),
    pagePreferences,
    updatedAt: source.updatedAt || "",
  };
}

function preferenceIncludes(preferences, pageKey, optionKey, context = {}) {
  const normalized = normalizeAppPersonalizationPreferences(preferences, context);
  return (normalized.pagePreferences[pageKey]?.visibleKeys || []).includes(optionKey);
}

function addPreferenceKey(preferences, pageKey, optionKey, context = {}) {
  const normalized = normalizeAppPersonalizationPreferences(preferences, context);
  const current = normalized.pagePreferences[pageKey]?.visibleKeys || [];
  return normalizeAppPersonalizationPreferences({
    ...normalized,
    pagePreferences: {
      ...normalized.pagePreferences,
      [pageKey]: {
        ...normalized.pagePreferences[pageKey],
        visibleKeys: [...new Set([optionKey, ...current])],
      },
    },
  }, context);
}

function removePreferenceKeys(preferences, pageKey, optionKeys, context = {}) {
  const normalized = normalizeAppPersonalizationPreferences(preferences, context);
  const removeSet = new Set(optionKeys);
  const current = normalized.pagePreferences[pageKey]?.visibleKeys || [];
  return normalizeAppPersonalizationPreferences({
    ...normalized,
    pagePreferences: {
      ...normalized.pagePreferences,
      [pageKey]: {
        ...normalized.pagePreferences[pageKey],
        visibleKeys: current.filter((key) => !removeSet.has(key)),
      },
    },
  }, context);
}

export function resolveQuickAddPreferenceActionKeys(preferences = {}, context = {}, { maxVisible = QUICK_ADD_MAX_VISIBLE } = {}) {
  const normalized = normalizeAppPersonalizationPreferences(preferences, context);
  const keys = sanitizeAppSetupVisibleKeys("quickAdd", normalized.pagePreferences.quickAdd?.visibleKeys || [], context);
  const cap = Math.max(4, Math.min(QUICK_ADD_MAX_VISIBLE, Number(maxVisible) || QUICK_ADD_MAX_VISIBLE));
  return {
    preferredKeys: keys,
    overflowPreferenceKeys: keys.slice(cap),
    maxVisible: cap,
  };
}

const RECOMMENDATION_BUILDERS = [
  {
    id: "pin_set_mastery_hearth",
    pageKey: "hearth",
    optionKey: "setMastery",
    title: "Pin Set Mastery to Hearth?",
    body: "You use Vault enough that set completion may be useful on your home base.",
    gate: (context, usage) => !preferenceIncludes(usage.preferences, "hearth", "setMastery", context) && Number(usage.vaultItems || 0) > 0,
  },
  {
    id: "prioritize_scout_report_quick_add",
    pageKey: "quickAdd",
    optionKey: "scout",
    title: "Move Scout Report higher in Quick Add?",
    body: "You submit or review Scout reports often. Put reports closer to your thumb.",
    gate: (context, usage) => !context.sellerToolsEnabled && (context.scoutMode || Number(usage.scoutReports || 0) > 1),
  },
  {
    id: "keep_payout_assist_forge",
    pageKey: "forge",
    optionKey: "payoutAssist",
    title: "Keep Payout Assist visible in Forge?",
    body: "Receipts, mileage, expenses, and sales are active. Keep planning estimates close by.",
    gate: (context, usage) => (context.sellerToolsEnabled || context.adminToolsVisible) && !preferenceIncludes(usage.preferences, "forge", "payoutAssist", context) && (Number(usage.expenses || 0) + Number(usage.sales || 0) + Number(usage.mileageTrips || 0)) > 0,
  },
  {
    id: "hide_unused_seller_quick_add",
    pageKey: "quickAdd",
    optionKey: "forge",
    title: "Tuck away seller actions?",
    body: "Forge has not been used much yet. Keep seller actions under More until you need them.",
    gate: (context, usage) => context.sellerToolsEnabled && Number(usage.forgeItems || 0) === 0 && Number(usage.sales || 0) === 0,
  },
  {
    id: "add_watchlist_to_hearth",
    pageKey: "hearth",
    optionKey: "marketWatch",
    title: "Add Market Watch to Hearth?",
    body: "You search or watch Market Watch items. Show fair-price context on Hearth.",
    gate: (context, usage) => !preferenceIncludes(usage.preferences, "hearth", "marketWatch", context) && Number(usage.watchlistItems || 0) > 0,
  },
  {
    id: "keep_spark_visible_hearth",
    pageKey: "hearth",
    optionKey: "spark",
    title: "Keep The Spark visible on Hearth?",
    body: "Family mode works best when Kids Program actions remain easy to find.",
    gate: (context, usage) => (context.familyMode || usage.sparkFocus) && !preferenceIncludes(usage.preferences, "hearth", "spark", context),
  },
];

export function buildAppSetupRecommendations(preferences = {}, context = {}, usage = {}) {
  const normalized = normalizeAppPersonalizationPreferences(preferences, context);
  if (normalized.smartRecommendationsEnabled === false) return [];
  const dismissed = new Set(normalized.dismissedRecommendationIds || []);
  const augmentedUsage = { ...usage, preferences: normalized };
  return RECOMMENDATION_BUILDERS
    .filter((recommendation) => !dismissed.has(recommendation.id))
    .filter((recommendation) => {
      const group = appSetupGroupForKey(recommendation.pageKey);
      const option = group?.options.find((candidate) => candidate.key === recommendation.optionKey);
      if (!option || !appSetupOptionAllowed(option, context)) return false;
      return recommendation.gate(context, augmentedUsage);
    })
    .slice(0, 4);
}

export function applyAppSetupRecommendation(preferences = {}, recommendationId = "", context = {}) {
  let next = normalizeAppPersonalizationPreferences(preferences, context);
  if (recommendationId === "hide_unused_seller_quick_add") {
    next = removePreferenceKeys(next, "quickAdd", ["forge", "sale", "receipt", "mileage", "expense"], context);
  } else {
    const recommendation = RECOMMENDATION_BUILDERS.find((entry) => entry.id === recommendationId);
    if (recommendation) next = addPreferenceKey(next, recommendation.pageKey, recommendation.optionKey, context);
  }
  return normalizeAppPersonalizationPreferences({
    ...next,
    acceptedRecommendationIds: [...new Set([...(next.acceptedRecommendationIds || []), recommendationId])],
    dismissedRecommendationIds: (next.dismissedRecommendationIds || []).filter((id) => id !== recommendationId),
    updatedAt: new Date().toISOString(),
  }, context);
}

export function dismissAppSetupRecommendation(preferences = {}, recommendationId = "", context = {}) {
  const normalized = normalizeAppPersonalizationPreferences(preferences, context);
  return normalizeAppPersonalizationPreferences({
    ...normalized,
    dismissedRecommendationIds: [...new Set([...(normalized.dismissedRecommendationIds || []), recommendationId])],
    updatedAt: new Date().toISOString(),
  }, context);
}
