export const EMBER_ASSIST_THREAD_STORAGE_KEY = "et-ember-assist-thread";
export const EMBER_ASSIST_CATEGORY = "ember_assist_admin_message";

export const EMBER_ASSIST_VOICE = {
  name: "Ember Assist",
  stance: "founder-guided app helper",
  doesNotClaimToBeFounder: true,
  values: [
    "bring Pokemon back to kids",
    "fair collecting",
    "community trust",
    "clean business records",
    "practical help for parents, collectors, and sellers",
  ],
};

export const EMBER_ASSIST_ESCALATION_CATEGORIES = [
  "App bug",
  "Missing product/catalog issue",
  "Wrong Scout report/store",
  "Drop Radar question",
  "Market/listing question",
  "Vault/Forge inventory question",
  "The Spark/Kids Program question",
  "Expenses/receipts/mileage question",
  "Account/beta access question",
  "Other",
];

const PAGE_PROMPTS = {
  scout: ["How do Scout reports work?", "Why is this a prediction?", "Help me submit a report", "What stores should I check?"],
  dropRadar: ["Explain this drop prediction", "What releases are coming up?", "What does confirmed vs predicted mean?", "Help me follow a store"],
  vault: ["What is my collection worth?", "Help me find an item", "What should I move to Forge?", "Explain my purchaser tallies"],
  forge: ["What should I list for sale?", "Help me set a planned sale price", "Show items missing cost or photos", "What is ready to sell?"],
  market: ["Help me create a listing", "Explain this price", "What listings need attention?", "How do I mark something sold?"],
  expenses: ["What receipts are missing?", "Summarize this year's expenses", "Help me categorize this expense", "What do I need for tax records?"],
  mileage: ["Summarize miles by vehicle", "Help me log a trip", "What mileage records are missing notes?", "Explain this vehicle summary"],
  spark: ["How does The Spark work?", "Help me submit a kid request", "What does waitlisted mean?", "Are there upcoming kid-friendly events?"],
  settings: ["Help me switch workspaces", "Explain personal Forge vs Ember & Tide Forge", "Help me update my profile", "Explain seller mode"],
  admin: ["What needs review?", "Show admin message queue", "Explain this user status", "What should I check first?"],
  general: ["What can I do here?", "Help me add an item", "Explain this page", "What should I do next?"],
};

const BUG_WORDS = /\b(broken|wrong|missing|not showing|can't find|cant find|cannot find|disappeared|lost|bug|error|stuck|failed|didn't save|did not save)\b/i;
const TAX_WORDS = /\b(tax|taxes|deduction|cpa|year[-\s]?end|expense|receipt|mileage)\b/i;
const SPARK_WORDS = /\b(kid|kids|child|children|spark|giveaway|family|parent)\b/i;
const DROP_WORDS = /\b(drop radar|prediction|predicted|drop|restock window|confirmed vs predicted|release)\b/i;
const SCOUT_WORDS = /\b(scout|report|store|verified|confidence|trusted)\b/i;
const VAULT_FORGE_WORDS = /\b(vault|forge|sell|sale price|planned sale|inventory)\b/i;
const MARKET_WORDS = /\b(market|listing|seller|sold|trade|price)\b/i;

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
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

export function emberAssistPageKind(activeTab = "", extra = {}) {
  if (extra.scoutView === "alerts" || extra.scoutView === "predictions" || activeTab === "watch") return "dropRadar";
  if (activeTab === "scout") return "scout";
  if (activeTab === "vault") return "vault";
  if (["inventory", "addInventory", "sales", "reports"].includes(activeTab)) return "forge";
  if (["market", "catalog"].includes(activeTab)) return "market";
  if (["expenses"].includes(activeTab)) return "expenses";
  if (["mileage", "vehicles"].includes(activeTab)) return "mileage";
  if (activeTab === "kidsProgram") return "spark";
  if (["menu", "profileProgress", "membership"].includes(activeTab)) return "settings";
  if (activeTab === "adminReview" || extra.isAdminPage) return "admin";
  if (activeTab === "dailyTide") return "general";
  return "general";
}

export function getEmberAssistStarterPrompts({ activeTab = "", scoutView = "", isAdmin = false } = {}) {
  const page = emberAssistPageKind(activeTab, { scoutView, isAdminPage: activeTab === "adminReview" });
  const prompts = [...(PAGE_PROMPTS[page] || PAGE_PROMPTS.general)];
  if (isAdmin && page !== "admin") prompts.push("What needs admin review?");
  return prompts.slice(0, 4);
}

export function buildEmberAssistContext(input = {}) {
  const page = emberAssistPageKind(input.activeTab, { scoutView: input.scoutView, isAdminPage: input.activeTab === "adminReview" });
  return {
    page,
    activeTab: input.activeTab || "dashboard",
    routeLabel: input.routeLabel || PAGE_PROMPTS[page]?.[0] || "Ember & Tide",
    isAdmin: Boolean(input.isAdmin),
    isSeller: Boolean(input.isSeller),
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

function response(answer, options = {}) {
  return {
    answer,
    confidence: options.confidence || "medium",
    actions: options.actions || [],
    shouldEscalate: Boolean(options.shouldEscalate),
    category: options.category || "Other",
    reason: options.reason || "",
  };
}

export function buildEmberAssistFallbackResponse(question = "", context = {}) {
  const text = String(question || "").trim();
  const lower = text.toLowerCase();
  const page = context.page || "general";
  if (!text) {
    return response("Ask me what you are trying to do, and I will point you to the cleanest next step.", {
      actions: ["Open Quick Add", "Go to Vault", "Open Scout Report"],
    });
  }

  if (BUG_WORDS.test(text)) {
    return response("I do not want to guess and give you the wrong answer. Tell me what you expected to happen, and I can send it to Ember & Tide for review.", {
      confidence: "low",
      shouldEscalate: true,
      category: lower.includes("store") || lower.includes("scout") ? "Wrong Scout report/store" : lower.includes("product") || lower.includes("catalog") ? "Missing product/catalog issue" : "App bug",
      actions: ["Send to Admin"],
      reason: "Bug-like or missing-data phrase detected.",
    });
  }

  if (DROP_WORDS.test(text) || page === "dropRadar") {
    return response("Drop Radar helps you see what might be coming, what was confirmed, and what stores are worth watching. Predictions are educated guesses, not promises. Confirmed Scout reports matter more.", {
      actions: ["Open Drop Radar", "Open Scout Report", "Follow Store"],
      category: "Drop Radar question",
    });
  }

  if (SCOUT_WORDS.test(text) || page === "scout") {
    return response("Scout works best when the store, product, time, and confidence are clear. A confirmed recent report should carry more weight than an old report or a prediction.", {
      actions: ["Open Scout Report", "Open Drop Radar"],
      category: "Wrong Scout report/store",
    });
  }

  if (SPARK_WORDS.test(text) || page === "spark") {
    return response("The Spark is where we track kid and family interest. We cannot promise inventory, but when kid-friendly access is available, this helps us keep it fair and parent-approved.", {
      actions: ["Open The Spark", "Follow Announcements"],
      category: "The Spark/Kids Program question",
    });
  }

  if (TAX_WORDS.test(text) || page === "expenses" || page === "mileage") {
    return response("These are organized records for year-end review, not tax advice. I can help you find missing receipts, mileage gaps, and cost records before you review everything with a tax professional.", {
      actions: ["Open Expenses", "Open Mileage", "Open Forge"],
      category: "Expenses/receipts/mileage question",
    });
  }

  if (VAULT_FORGE_WORDS.test(text) || page === "vault" || page === "forge") {
    return response("If it is for your personal collection, keep it in Vault. If you plan to sell it, prep it in Forge. You can move it later, and purchaser tallies help keep the records clean.", {
      actions: ["Go to Vault", "Go to Forge", "Open Quick Add"],
      category: "Vault/Forge inventory question",
    });
  }

  if (MARKET_WORDS.test(text) || page === "market") {
    return response("For Market, the important pieces are the item photo, name, condition, price, seller identity, and status. Fair pricing should be clear, and sold or removed listings should not look active.", {
      actions: ["Open Market", "Create Listing", "Send to Admin"],
      category: "Market/listing question",
    });
  }

  if (page === "settings") {
    return response("Settings is where you keep account, workspace, seller mode, notifications, and public identity straight. Personal collection work belongs in Vault; seller or business work belongs in Forge.", {
      actions: ["Open Settings", "Open Forge"],
      category: "Account/beta access question",
    });
  }

  if (page === "admin" && context.isAdmin) {
    return response(`Start with the queues that can affect trust: Scout reports, beta access, Spark requests, listings, and app messages. You have ${context.counts?.adminOpenItems || 0} open review items in this local queue.`, {
      actions: ["Open Admin Review"],
      category: "Other",
    });
  }

  return response("Here is what matters: choose the area that matches the job. Quick Add is for saving something fast, Scout is for reports, Vault is for collection, Forge is for business records, and The Spark is for kid/family access.", {
    actions: ["Open Quick Add", "Go to Vault", "Open Scout Report"],
  });
}

export function shouldOfferAdminEscalation(question = "", assistantResponse = {}) {
  if (assistantResponse.shouldEscalate) return true;
  return BUG_WORDS.test(String(question || "")) || assistantResponse.confidence === "low";
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
      routeLabel: context.routeLabel || "",
      publicUsername: profile.publicUsername || context.publicUsername || "",
      profileReference: profile.userId || profile.id || "",
      question: String(question || "").slice(0, 1200),
      details: String(details || "").slice(0, 1800),
      assistantResponse: String(lastResponse || "").slice(0, 1600),
      timestamp: now,
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
