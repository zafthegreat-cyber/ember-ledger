export const ONBOARDING_PERSISTENCE_NOTE =
  "Onboarding progress is saved in this browser's Ember & Tide beta readiness data.";

export const ONBOARDING_WELCOME_COPY =
  "Welcome to Ember & Tide. We're here to help families, kids, collectors, and small sellers make Pokemon collecting fairer, easier, and more community-centered.";

export const ACCOUNT_SETUP_USERNAME_RULES = [
  "Public usernames may appear on Marketplace, Tidepool, Scout reports, and community confirmations.",
  "They must be unique in Ember & Tide so reports and community activity can be attributed clearly.",
  "Use letters, numbers, and underscores so other collectors can recognize you safely.",
  "Ember & Tide, staff, support, moderator, and official admin names are reserved.",
];

export const ACCOUNT_SETUP_TIER_ROWS = [
  {
    key: "free",
    label: "Free",
    status: "Available",
    description: "Start with Hearth, Vault basics, current Scout reports, and one watched store.",
  },
  {
    key: "collector",
    label: "Collector",
    status: "Beta path",
    description: "For collectors who want deeper collection tracking and more watched stores during beta.",
  },
  {
    key: "family",
    label: "Family",
    status: "Beta path",
    description: "For parent-managed family collecting, The Spark interest, and safer shared setup.",
  },
  {
    key: "seller",
    label: "Seller",
    status: "Beta path",
    description: "For Forge inventory, sales records, receipts, expenses, and seller-focused setup.",
  },
  {
    key: "shop",
    label: "Shop",
    status: "Partner review",
    description: "For approved shops and local partners. Public shop tools are not self-serve yet.",
  },
  {
    key: "beta",
    label: "Beta",
    status: "Access status",
    description: "Early access is reviewed before full app use so the community stays family-safe.",
  },
  {
    key: "admin",
    label: "Admin",
    status: "Internal only",
    description: "Protected Ember & Tide operations. Admin access is never granted through normal signup.",
  },
];

export const ACCOUNT_SETUP_WORKSPACE_ROWS = [
  {
    key: "personal",
    label: "Personal",
    status: "Supported",
    description: "Your private collection workspace for Vault, Market Watch, and personal records.",
  },
  {
    key: "family",
    label: "Family",
    status: "Supported locally",
    description: "A shared collection setup for parent-managed family collecting and safe preferences.",
  },
  {
    key: "seller",
    label: "Seller",
    status: "Supported",
    description: "Forge can use a seller or business workspace for inventory, receipts, and sales records.",
  },
  {
    key: "shop",
    label: "Shop",
    status: "Approval later",
    description: "Shop/partner workspace setup stays gated until partner tools are ready.",
  },
];

export const ACCOUNT_SETUP_STATE_OPTIONS = [
  { value: "VA", label: "Virginia" },
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
  { value: "DC", label: "Washington, DC" },
];

const STATE_CODE_BY_LABEL = Object.fromEntries(
  ACCOUNT_SETUP_STATE_OPTIONS.map((state) => [state.label.toLowerCase(), state.value])
);
const STATE_LABEL_BY_CODE = Object.fromEntries(
  ACCOUNT_SETUP_STATE_OPTIONS.map((state) => [state.value, state.label])
);
const TIER_LABEL_BY_KEY = Object.fromEntries(
  ACCOUNT_SETUP_TIER_ROWS.map((tier) => [tier.key, tier.label])
);

export function normalizeAccessState(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (STATE_LABEL_BY_CODE[upper]) return upper;
  return STATE_CODE_BY_LABEL[raw.toLowerCase()] || upper.slice(0, 2);
}

export function accessStateLabel(value = "") {
  const code = normalizeAccessState(value);
  return STATE_LABEL_BY_CODE[code] || code || "your state";
}

export function isVirginiaAccessState(value = "") {
  return normalizeAccessState(value) === "VA";
}

export function accountSetupTierLabel(value = "") {
  const key = String(value || "").trim().toLowerCase();
  return TIER_LABEL_BY_KEY[key] || "";
}

export function betaAccessWaitlistMessage(state = "") {
  const label = accessStateLabel(state);
  return `Ember & Tide is starting in Virginia. We will add ${label} to the waitlist and use waitlist demand to decide which states to add next.`;
}

export function formatBetaAccessAreaAnswer({ state = "", localAreaAnswer = "", tierInterest = "" } = {}) {
  const stateCode = normalizeAccessState(state);
  const areaLabels = {
    hampton_roads: "Hampton Roads",
    fredericksburg: "Fredericksburg",
    virginia: "Virginia",
    other_virginia: "Other Virginia",
    not_local: "Not local",
  };
  const rows = [];
  if (stateCode) rows.push(`State: ${stateCode}`);
  if (localAreaAnswer) rows.push(`Area: ${areaLabels[localAreaAnswer] || localAreaAnswer}`);
  const tierLabel = accountSetupTierLabel(tierInterest);
  if (tierLabel) rows.push(`Path: ${tierLabel}`);
  return rows.join(" | ");
}

export function accessStateFromAreaAnswer(value = "") {
  const match = String(value || "").match(/\bState:\s*([A-Z]{2})\b/i);
  return match ? normalizeAccessState(match[1]) : "";
}

export const ONBOARDING_GOALS = [
  {
    key: "parent_family",
    label: "Parent/family looking for Pokemon",
    shortLabel: "Family access",
    description: "Find kid-friendly access, fair prices, The Spark, and Ember Watch alerts without guessing.",
    nextActions: ["Open The Spark", "Set up Ember Watch", "Follow favorite stores"],
  },
  {
    key: "collector_vault",
    label: "Collector tracking a Vault",
    shortLabel: "Collector",
    description: "Build a clean collection record with photos, sets, values, and purchaser tallies.",
    nextActions: ["Add first Vault item", "Search Market Watch", "Ask Ember Assist"],
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
    description: "Submit Store Signals and keep estimates separate from confirmed reports.",
    nextActions: ["Submit Scout report", "Open Ember Watch", "Follow stores"],
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
    description: "Ember ID, Tidepool Community, and Scout use your public identity without exposing raw email.",
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
    description: "Confirmed Store Signals help the community and improve confidence labels safely.",
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
    title: "Learn Tide Score",
    description: "Tide Score uses useful confirmed reports and context; it is not a promise of restocks.",
    actionLabel: "Learn Tide Score",
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
    title: "Confirmed vs estimated",
    body: "Confirmed reports are real sightings. Estimated windows use confirmed history. Community guesses stay labeled as guesses.",
    prompt: "What does confirmed vs predicted mean?",
  },
  scout_points: {
    title: "Tide Score",
    body: "Tide Score is confidence language from useful confirmed reports, admin review, freshness, and clean community help.",
    prompt: "How does Tide Score work?",
  },
  shop_badges: {
    title: "Family-Friendly Card Shop badges",
    body: "Badges mean a shop supports the Ember & Tide mission. They do not guarantee inventory, price, or availability.",
    prompt: "How do family-friendly shop badges work?",
  },
  alerts: {
    title: "Ember Watch",
    body: "Alerts are in-app only for now. Confirmed restocks, possible windows, guesses, watchlist items, and admin statuses stay clearly labeled.",
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
    title: "Tidepool Community",
    body: "Tidepool Community is for family-safe posts, helpful local updates, questions, events, and shop notes. New posts may wait for admin review.",
    prompt: "What is Tidepool Community?",
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
    title: "Ember Watch needs confirmed history.",
    body: "Estimated restock windows get better after confirmed restock history and real store reports. Until then, the app should say it needs more data.",
    actionLabel: "Submit Report",
    actionTarget: "scout_report",
    assistPrompt: "Why is this a prediction?",
  },
  market: {
    title: "Search products, compare prices, and find fair deals.",
    body: "Search products, compare known values, and save watched items. Market Watch does not imply live checkout.",
    actionLabel: "Browse Market Watch",
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
    body: "Confirmed restocks, possible Ember Watch windows, Kids Program updates, admin message statuses, and Forge reminders will appear here when useful.",
    actionLabel: "Alert Settings",
    actionTarget: "alerts",
    assistPrompt: "How do alerts work?",
  },
  tidepool: {
    title: "The Tidepool is quiet right now.",
    body: "Start the first Tidepool Community post and help keep collecting positive. New posts are reviewed before they appear publicly.",
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
