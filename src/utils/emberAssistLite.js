export const EMBER_ASSIST_THREAD_STORAGE_KEY = "et-ember-assist-thread";
export const EMBER_ASSIST_CATEGORY = "ember_assist_admin_message";

export const EMBER_ASSIST_ESCALATION_CATEGORIES = [
  "App bug",
  "Missing product/catalog issue",
  "Wrong Scout report/store",
  "Drop Radar question",
  "Market Watch question",
  "Vault/Forge inventory question",
  "The Spark/Kids Program question",
  "Expenses/receipts/mileage question",
  "Account/beta access question",
  "Other",
];

const PAGE_PROMPTS = {
  scout: ["Help me submit a report", "Why is this report low confidence?", "What should I check first?", "How do Scout reports work?"],
  dropRadar: ["Explain this drop prediction", "What releases are coming up?", "What does confirmed vs predicted mean?", "Help me follow a store"],
  vault: ["Help me add an item", "Explain this value", "What details are missing?", "What should I move to Forge?"],
  forge: ["What should I list for sale?", "Help me set a planned sale price", "Show items missing cost or photos", "What is ready to sell?"],
  market: ["Help me create a safe listing", "Why is my listing pending?", "How do I report a listing?", "What does seller trust mean?"],
  expenses: ["What receipts are missing?", "Summarize this year's expenses", "Help me categorize this expense", "What do I need for tax records?"],
  mileage: ["Summarize miles by vehicle", "Help me log a trip", "What mileage records are missing notes?", "Explain this vehicle summary"],
  spark: ["How does The Spark work?", "Help me submit a kid request", "What does waitlisted mean?", "Are there upcoming kid-friendly events?"],
  tidepool: ["What is Tidepool Community?", "How do I post safely?", "Why is my post pending?", "How do I report a post?"],
  settings: ["Help me switch workspaces", "Explain personal Forge vs Ember & Tide Forge", "Help me update my profile", "Explain seller mode"],
  admin: ["What needs review?", "Explain this user status", "How do I message admin?", "Show admin message queue"],
  permissionDenied: ["Why am I blocked?", "Explain this user status", "How do I message admin?", "Return to Hearth"],
  general: ["What should I do first?", "How do I add inventory?", "How do I scan a barcode?", "What is Forge for?", "How do alerts work?", "How do I message admin?"],
};

const CORE_PROMPTS = [
  "What should I do first?",
  "How do I add inventory?",
  "How do I scan a barcode?",
  "What is the difference between Vault and Forge?",
  "What is Forge for?",
  "How do Scout points work?",
  "How do alerts work?",
  "How do I use Forge for business records?",
  "How do I submit a restock report?",
  "What do tiers unlock?",
  "How do I message admin?",
  "How do I join the Kids Program?",
];

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function emberAssistPageKind(activeTab = "", extra = {}) {
  if (extra.scoutView === "alerts" || extra.scoutView === "predictions" || activeTab === "watch") return "dropRadar";
  if (activeTab === "scout") return "scout";
  if (activeTab === "vault") return "vault";
  if (["inventory", "addInventory", "sales", "reports"].includes(activeTab)) return "forge";
  if (["market", "catalog"].includes(activeTab)) return "market";
  if (["expenses"].includes(activeTab)) return "expenses";
  if (["mileage", "vehicles"].includes(activeTab)) return "mileage";
  if (activeTab === "kidsProgram") return "spark";
  if (activeTab === "tidepool") return "tidepool";
  if (["menu", "profileProgress", "membership"].includes(activeTab)) return "settings";
  if (activeTab === "adminReview" || extra.isAdminPage) return "admin";
  return "general";
}

export function loadEmberAssistThread() {
  if (typeof localStorage === "undefined") return [];
  const parsed = safeJsonParse(localStorage.getItem(EMBER_ASSIST_THREAD_STORAGE_KEY), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveEmberAssistThread(messages = []) {
  if (typeof localStorage === "undefined") return messages;
  const trimmed = messages.slice(-30);
  localStorage.setItem(EMBER_ASSIST_THREAD_STORAGE_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function clearEmberAssistThread() {
  if (typeof localStorage !== "undefined") localStorage.removeItem(EMBER_ASSIST_THREAD_STORAGE_KEY);
  return [];
}

export function getEmberAssistStarterPrompts({ activeTab = "", scoutView = "", isAdmin = false, permissionDenied = false } = {}) {
  if (permissionDenied) return PAGE_PROMPTS.permissionDenied;
  const page = emberAssistPageKind(activeTab, { scoutView, isAdminPage: activeTab === "adminReview" });
  const pagePrompts = PAGE_PROMPTS[page] || PAGE_PROMPTS.general;
  const prompts = [...new Set([...pagePrompts, "How do I message admin?", ...CORE_PROMPTS])];
  if (isAdmin && page !== "admin") prompts.push("What needs admin review?");
  return prompts.slice(0, 6);
}

export function buildEmberAssistContext(input = {}) {
  const page = emberAssistPageKind(input.activeTab, { scoutView: input.scoutView, isAdminPage: input.activeTab === "adminReview" });
  return {
    page,
    activeTab: input.activeTab || "dashboard",
    route: input.route || input.path || "",
    routeLabel: input.routeLabel || PAGE_PROMPTS[page]?.[0] || "Ember & Tide",
    isAdmin: Boolean(input.isAdmin),
    isSeller: Boolean(input.isSeller),
    permissionDenied: Boolean(input.permissionDenied),
    betaStatus: input.betaStatus || "",
    publicUsername: input.publicUsername || "",
    counts: {
      vaultItems: Number(input.counts?.vaultItems || 0),
      forgeItems: Number(input.counts?.forgeItems || 0),
      scoutReports: Number(input.counts?.scoutReports || 0),
      marketListings: Number(input.counts?.marketListings || 0),
      expenses: Number(input.counts?.expenses || 0),
      mileageTrips: Number(input.counts?.mileageTrips || 0),
      adminOpenItems: input.isAdmin ? Number(input.counts?.adminOpenItems || 0) : 0,
    },
  };
}

export function shouldShowEmberAssistEntry({
  hasUser = false,
  betaLocalMode = false,
  guestPreviewActive = false,
  activeTabLocked = false,
  activeTab = "",
  appAccessAllowed = true,
} = {}) {
  if (activeTab === "resetPassword" || activeTabLocked) return false;
  if (guestPreviewActive) return false;
  return Boolean((hasUser || betaLocalMode) && appAccessAllowed);
}

export function makeEmberAssistAdminMessage({
  question = "",
  details = "",
  category = "Other",
  context = {},
  profile = {},
  lastResponse = "",
} = {}) {
  const now = new Date().toISOString();
  const safeCategory = EMBER_ASSIST_ESCALATION_CATEGORIES.includes(category) ? category : "Other";
  return {
    suggestionType: EMBER_ASSIST_CATEGORY,
    targetTable: "ember_assist_messages",
    targetRecordId: context.relatedId || "",
    userId: profile.userId || profile.id || "local-beta-user",
    displayName: profile.publicUsername || profile.displayName || "Local Beta User",
    submittedData: {
      category: safeCategory,
      page: context.page || "general",
      activeTab: context.activeTab || "",
      route: context.route || context.path || "",
      routeLabel: context.routeLabel || "",
      publicUsername: profile.publicUsername || context.publicUsername || "",
      profileReference: profile.userId || profile.id || "",
      question: String(question || "").slice(0, 1200),
      details: String(details || "").slice(0, 1800),
      assistantResponse: String(lastResponse || "").slice(0, 1600),
      timestamp: now,
      deliveryMode: "local_admin_inbox",
    },
    notes: "Submitted from Ember Assist. Admin notes stay private.",
    status: "Submitted",
    source: "ember-assist",
    visibility: "admin_review",
    adminReviewVisible: true,
  };
}

export function isEmberAssistSuggestion(suggestion = {}) {
  return suggestion.suggestionType === EMBER_ASSIST_CATEGORY || suggestion.targetTable === "ember_assist_messages";
}

export function filterEmberAssistMessagesForUser(messages = [], profile = {}, isAdmin = false) {
  const assistMessages = messages.filter(isEmberAssistSuggestion);
  if (isAdmin) return assistMessages;
  const userId = String(profile.userId || profile.id || "");
  const publicUsername = String(profile.publicUsername || "").toLowerCase();
  return assistMessages.filter((message) => {
    const data = message.submittedData || {};
    return (
      (userId && String(message.userId || data.profileReference || "") === userId) ||
      (publicUsername && String(data.publicUsername || "").toLowerCase() === publicUsername)
    );
  });
}
