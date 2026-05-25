export const ONBOARDING_PERSISTENCE_NOTE =
  "Onboarding progress is saved in this browser's Ember & Tide beta readiness data.";

export const ONBOARDING_WELCOME_COPY =
  "Welcome to Ember & Tide. We're here to help families, kids, collectors, and small sellers make Pokemon collecting fairer, easier, and more community-centered.";

export const ONBOARDING_GOALS = [
  {
    key: "parent_family",
    label: "Parent/family looking for Pokemon",
    shortLabel: "Family access",
    description: "Find kid-friendly access, fair prices, The Spark, and alerts without guessing.",
    nextActions: ["Open The Spark", "Set up alerts", "Follow favorite stores"],
  },
  {
    key: "collector_vault",
    label: "Collector tracking a Vault",
    shortLabel: "Collector",
    description: "Build a clean collection record with photos, sets, values, and purchaser tallies.",
    nextActions: ["Add first Vault item", "Search TideTradr", "Ask Ember Assist"],
  },
  {
    key: "seller_forge",
    label: "Seller/business using Forge",
    shortLabel: "Seller",
    description: "Track sellable inventory, receipts, expenses, mileage, sales, and year-end exports.",
    nextActions: ["Choose Forge identity", "Add first Forge item", "Review business records"],
  },
  {
    key: "scout_reports",
    label: "Scout helping with restock reports",
    shortLabel: "Scout",
    description: "Submit confirmed store reports and keep predictions separate from guesses.",
    nextActions: ["Submit Scout report", "Open Drop Radar", "Follow stores"],
  },
  {
    key: "local_shop_partner",
    label: "Local shop/card shop partner",
    shortLabel: "Shop partner",
    description: "Review family-friendly shop status, kid events, trade nights, and partner visibility.",
    nextActions: ["View store directory", "Read family-friendly shop copy", "Message admin"],
  },
  {
    key: "spark_parent",
    label: "Kids Program participant/parent",
    shortLabel: "The Spark",
    description: "Submit parent-managed interest without sharing unnecessary child details.",
    nextActions: ["Join The Spark", "Follow announcements", "Set Kids Program alerts"],
  },
];

const GOAL_BY_KEY = Object.fromEntries(ONBOARDING_GOALS.map((goal) => [goal.key, goal]));
const LEGACY_GOAL_ALIASES = {
  track_my_personal_collection: "collector_vault",
  track_my_collection: "collector_vault",
  track_personal_collection: "collector_vault",
  track_business_inventory: "seller_forge",
  watch_local_restocks: "scout_reports",
  submit_scout_reports: "scout_reports",
  find_restock_windows: "scout_reports",
  join_kids_program_updates: "spark_parent",
  join_the_kids_program: "spark_parent",
  browse_market_pricing_tools: "collector_vault",
  explore_tidetradr: "collector_vault",
  set_up_alerts: "parent_family",
};

export const ONBOARDING_CHECKLIST_ITEMS = [
  {
    key: "profile",
    title: "Complete profile/public username",
    description: "Marketplace, Tidepool, and Scout use your public identity without exposing raw email.",
    actionLabel: "Open Profile",
    actionTarget: "profile",
  },
  {
    key: "workspace",
    title: "Choose workspace/Forge identity",
    description: "Decide whether Forge is personal, business, or Ember & Tide branded.",
    actionLabel: "Open Settings",
    actionTarget: "settings",
  },
  {
    key: "vault",
    title: "Add your first item",
    description: "Start with one card, sealed product, or manual fallback so Hearth can personalize next steps.",
    actionLabel: "Add to Vault",
    actionTarget: "vault",
  },
  {
    key: "forge",
    title: "Add first Forge item",
    description: "Use Forge for sellable inventory, business tracking, and records.",
    actionLabel: "Add to Forge",
    actionTarget: "forge",
  },
  {
    key: "scout_report",
    title: "Submit your first Scout report",
    description: "Confirmed store reports help the community and train Drop Radar safely.",
    actionLabel: "Submit Report",
    actionTarget: "scout_report",
  },
  {
    key: "kids_program",
    title: "Learn about The Spark",
    description: "Review parent-managed Kids Program rules before sharing family details.",
    actionLabel: "Open The Spark",
    actionTarget: "kids_program",
  },
  {
    key: "home_area",
    title: "Set your home area",
    description: "Use a ZIP or city so Scout can prioritize nearby stores without showing your exact location publicly.",
    actionLabel: "Set Area",
    actionTarget: "settings",
  },
  {
    key: "scout_points",
    title: "Learn Scout Points",
    description: "Scout Points are trust signals from useful confirmed reports, not a promise of restocks.",
    actionLabel: "Learn Points",
    actionTarget: "scout_points",
  },
  {
    key: "follow",
    title: "Favorite your first stores",
    description: "Follow the stores that matter before alerts and local Scout highlights get useful.",
    actionLabel: "Open Scout",
    actionTarget: "stores",
  },
  {
    key: "alerts",
    title: "Turn on in-app alerts",
    description: "Choose which confirmed restocks, predictions, shop updates, and admin statuses you want.",
    actionLabel: "Alert Settings",
    actionTarget: "alerts",
  },
  {
    key: "ember_assist",
    title: "Ask Ember Assist a question",
    description: "Use the corner assistant when you are not sure where something belongs.",
    actionLabel: "Ask Ember",
    actionTarget: "ember_assist",
  },
];

export const ONBOARDING_ASSIST_PROMPTS = [
  "What should I do first?",
  "What is the difference between Vault and Forge?",
  "How do Scout points work?",
  "How do alerts work?",
  "How do I use Forge for business records?",
  "How do I join the Kids Program?",
  "What is Tidepool?",
  "How do I post safely?",
];

export const CONTEXTUAL_HELP_CARDS = {
  vault_forge: {
    title: "Vault vs Forge",
    body: "Vault is for collection and held inventory. Forge is for sellable/business inventory, receipts, mileage, sales prep, and year-end records.",
    prompt: "What is the difference between Vault and Forge?",
  },
  quick_add: {
    title: "Quick Add destinations",
    body: "Quick Add adapts to your mode. Collectors see Vault, Scout, and missing-item paths first; seller tools add Forge, sales, receipts, and mileage.",
    prompt: "How do I add inventory?",
  },
  scout_trust: {
    title: "Confirmed vs predicted",
    body: "Confirmed reports are real sightings. Predicted windows are estimates from confirmed history. Community guesses stay labeled as guesses.",
    prompt: "What does confirmed vs predicted mean?",
  },
  scout_points: {
    title: "Scout points",
    body: "Scout points are trust signals from useful confirmed reports and clean community help.",
    prompt: "How do Scout points work?",
  },
  shop_badges: {
    title: "Family-Friendly Card Shop badges",
    body: "Badges mean a shop supports the Ember & Tide mission. They do not guarantee inventory, price, or availability.",
    prompt: "How do family-friendly shop badges work?",
  },
  alerts: {
    title: "In-app alerts",
    body: "Alerts are in-app only for now. Confirmed restocks, possible windows, guesses, and admin statuses stay clearly labeled.",
    prompt: "How do alerts work?",
  },
  workspace_identity: {
    title: "Workspace and Forge identity",
    body: "Your active workspace decides where Forge, expenses, mileage, receipts, and sales records belong.",
    prompt: "Help me switch workspaces",
  },
  business_records: {
    title: "Business records",
    body: "Forge organizes sales, expenses, receipts, mileage, and exports for review with your tax professional. It is not tax advice.",
    prompt: "How do I use Forge for business records?",
  },
  tidepool: {
    title: "Tidepool community",
    body: "Tidepool is for family-safe community posts, helpful local updates, questions, events, and shop notes. New posts may wait for admin review.",
    prompt: "What is Tidepool?",
  },
};

export const EMPTY_STATE_GUIDANCE = {
  hearth: {
    title: "Your Hearth is ready.",
    body: "Add one item, follow one store, or submit one Scout report to make Hearth feel personal.",
    actionLabel: "Quick Add",
    actionTarget: "vault",
    assistPrompt: "What should I do first?",
  },
  vault: {
    title: "Your Vault is ready.",
    body: "Add your first item and keep your collection protected. Manual entry stays available when catalog search misses something.",
    actionLabel: "Manual Add",
    actionTarget: "vault",
    actions: [
      { label: "Scan Card", actionTarget: "scan_card" },
      { label: "Add Sealed Product", actionTarget: "add_sealed_product", primary: false },
      { label: "Manual Add", actionTarget: "manual_add", primary: false },
    ],
    assistPrompt: "Help me add my first Vault item",
  },
  forge: {
    title: "Your workshop is ready.",
    body: "Start tracking inventory, expenses, mileage, and planned sales. Forge keeps records organized for later review.",
    actionLabel: "Add Receipt",
    actionTarget: "forge",
    actions: [
      { label: "Add Receipt", actionTarget: "receipt" },
      { label: "Add Product", actionTarget: "forge", primary: false },
      { label: "Add Mileage", actionTarget: "mileage", primary: false },
    ],
    assistPrompt: "What belongs in Forge?",
  },
  expenses: {
    title: "No expenses recorded yet.",
    body: "Capture vendor, amount, purchaser, category, and receipt details so year-end review is easier later.",
    actionLabel: "Add Expense",
    actionTarget: "expenses",
    assistPrompt: "Help me categorize an expense",
  },
  mileage: {
    title: "No mileage trips yet.",
    body: "Log trips by vehicle, purpose, date, and miles. Keep the details useful for review with your tax professional.",
    actionLabel: "Log Mileage",
    actionTarget: "mileage",
    assistPrompt: "Help me log a trip",
  },
  sales: {
    title: "No sales records yet.",
    body: "Manual sale entry is available now. Imports are a foundation for later, not a live marketplace integration.",
    actionLabel: "Add Sale",
    actionTarget: "sales",
    assistPrompt: "Help me add a sale",
  },
  scout: {
    title: "No local signals yet.",
    body: "Be the first Scout to help another family. Reports are shared by store, not private address.",
    actionLabel: "Submit Scout Report",
    actionTarget: "scout_report",
    assistPrompt: "Help me submit a report",
  },
  drop_radar: {
    title: "Drop Radar needs confirmed history.",
    body: "Predictions get better after confirmed restock history and real store reports. Until then, the app should say it needs more data.",
    actionLabel: "Submit Report",
    actionTarget: "scout_report",
    assistPrompt: "Why is this a prediction?",
  },
  market: {
    title: "Search products, compare prices, and find fair deals.",
    body: "Browse approved listings, create a beta alert, or add a listing for admin review when you are ready.",
    actionLabel: "Browse Market",
    actionTarget: "browse_market",
    actions: [
      { label: "Create Alert", actionTarget: "create_market_alert" },
      { label: "Browse Market", actionTarget: "browse_market", primary: false },
      { label: "Add Listing", actionTarget: "add_market_listing", primary: false },
    ],
    assistPrompt: "Help me create a listing",
  },
  notifications: {
    title: "No alerts yet.",
    body: "Confirmed restocks, possible Drop Radar windows, Kids Program updates, admin message statuses, and Forge reminders will appear here when useful.",
    actionLabel: "Alert Settings",
    actionTarget: "alerts",
    assistPrompt: "How do alerts work?",
  },
  tidepool: {
    title: "The Tidepool is quiet right now.",
    body: "Start the first community post and help keep collecting positive. New posts are reviewed before they appear publicly.",
    actionLabel: "Start a Post",
    actionTarget: "tidepool",
    actions: [
      { label: "Start a Post", actionTarget: "tidepool" },
      { label: "Follow Local Collectors", actionTarget: "tidepool_follow", primary: false },
    ],
    assistPrompt: "How do I post safely?",
  },
  admin: {
    title: "No items need review right now.",
    body: "Scout reports, guesses, family-friendly shops, Spark requests, and support messages will appear here when they need a human check.",
    actionLabel: "Open Admin Queue",
    actionTarget: "admin",
    assistPrompt: "What needs review?",
  },
  kids: {
    title: "No open requests yet.",
    body: "Parent or guardian submits kid/family interest when ready. Private family details stay private, and availability does not guarantee products.",
    actionLabel: "Request Kid Access",
    actionTarget: "kids_program",
    actions: [
      { label: "Request Kid Access", actionTarget: "kids_program" },
      { label: "View Rules", actionTarget: "kids_rules", primary: false },
    ],
    assistPrompt: "How does The Spark work?",
  },
  stores: {
    title: "No stores match yet.",
    body: "Try a broader area, store type, or retailer. Manual store entry stays available when the directory misses a location.",
    actionLabel: "View Stores",
    actionTarget: "stores",
    assistPrompt: "Help me follow a store",
  },
  quick_add: {
    title: "Quick Add is ready.",
    body: "Choose Vault for your collection, Scout for a report, or the missing-item path when the catalog needs help. Ember & Tide shows the paths that fit your current mode first.",
    actionLabel: "Open Quick Add",
    actionTarget: "vault",
    assistPrompt: "How do I add inventory?",
  },
  settings: {
    title: "Settings are ready.",
    body: "Profile, notifications, privacy, and beta preferences live here. Settings that are local-only stay labeled honestly.",
    actionLabel: "Open Profile",
    actionTarget: "profile",
    assistPrompt: "Help me set up Ember & Tide",
  },
};

function normalizeKey(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeOnboardingGoalKeys(goals = []) {
  const rows = Array.isArray(goals) ? goals : String(goals || "").split(",");
  const knownValues = ONBOARDING_GOALS.flatMap((goal) => [
    [goal.key, goal.key],
    [normalizeKey(goal.label), goal.key],
    [normalizeKey(goal.shortLabel), goal.key],
  ]);
  const aliases = Object.fromEntries(knownValues);
  return [...new Set(rows.map((goal) => {
    const key = normalizeKey(goal);
    return aliases[key] || LEGACY_GOAL_ALIASES[key] || key;
  }).filter((key) => GOAL_BY_KEY[key]))];
}

export function onboardingGoalRows(goals = []) {
  const keys = normalizeOnboardingGoalKeys(goals);
  return keys.map((key) => GOAL_BY_KEY[key]).filter(Boolean);
}

export function normalizeOnboardingState(onboarding = {}) {
  const goals = normalizeOnboardingGoalKeys(onboarding.goals || onboarding.preferences || []);
  const manualChecklist = Array.isArray(onboarding.manualChecklist)
    ? onboarding.manualChecklist
    : Array.isArray(onboarding.completedChecklist)
      ? onboarding.completedChecklist
      : [];
  return {
    completedAt: onboarding.completedAt || "",
    dismissedAt: onboarding.dismissedAt || "",
    firstLoginSeen: Boolean(onboarding.firstLoginSeen || onboarding.first_login_seen),
    goals,
    preferences: goals,
    manualChecklist: [...new Set(manualChecklist.map(normalizeKey).filter(Boolean))],
    smartSetup: onboarding.smartSetup || onboarding.smart_setup || {},
  };
}

export function shouldShowFirstRunOnboarding({
  hasUser = false,
  betaLocalMode = false,
  appAccessAllowed = false,
  activeTabLocked = false,
  onboarding = {},
} = {}) {
  const state = normalizeOnboardingState(onboarding);
  if (activeTabLocked) return false;
  if (!appAccessAllowed) return false;
  if (!hasUser && !betaLocalMode) return false;
  return !state.completedAt && !state.dismissedAt;
}

export function buildOnboardingChecklist(progress = {}, onboarding = {}) {
  const state = normalizeOnboardingState(onboarding);
  const manual = new Set(state.manualChecklist);
  const completeByKey = {
    profile: Boolean(progress.hasPublicUsername),
    workspace: Boolean(progress.hasWorkspaceIdentity),
    vault: Number(progress.vaultItems || 0) > 0,
    forge: Number(progress.forgeItems || 0) > 0,
    scout_report: Number(progress.scoutReports || 0) > 0,
    kids_program: Boolean(progress.kidsProgramReviewed || progress.kidsApplicationSubmitted),
    home_area: Boolean(progress.homeAreaSet),
    scout_points: Boolean(progress.scoutPointsLearned),
    follow: Number(progress.followedStores || 0) > 0 || Number(progress.savedProducts || 0) > 0,
    alerts: Boolean(progress.alertsConfigured),
    ember_assist: Boolean(progress.emberAssistAsked),
    kids_program: Boolean(progress.kidsProgramReviewed || progress.kidsApplicationSubmitted),
  };
  return ONBOARDING_CHECKLIST_ITEMS.map((item) => ({
    ...item,
    completed: Boolean(completeByKey[item.key] || manual.has(item.key)),
    source: completeByKey[item.key] ? "app" : manual.has(item.key) ? "manual" : "pending",
  }));
}

export function onboardingChecklistSummary(checklist = []) {
  const total = checklist.length;
  const completed = checklist.filter((item) => item.completed).length;
  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
    label: `${completed}/${total} complete`,
  };
}

export function getEmptyStateGuidance(key = "", overrides = {}) {
  const guidance = EMPTY_STATE_GUIDANCE[normalizeKey(key)] || EMPTY_STATE_GUIDANCE.vault;
  return { ...guidance, ...overrides };
}

export function getContextualHelpCard(key = "") {
  return CONTEXTUAL_HELP_CARDS[normalizeKey(key)] || null;
}
