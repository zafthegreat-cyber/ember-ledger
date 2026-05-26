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
  scout: ["Help me submit a report", "Why is this report low confidence?", "What should I check first?", "How do Scout reports work?"],
  dropRadar: ["Explain this drop prediction", "What releases are coming up?", "What does confirmed vs predicted mean?", "Help me follow a store"],
  vault: ["Help me add an item", "Explain this value", "What details are missing?", "What should I move to Forge?"],
  forge: ["What should I list for sale?", "Help me set a planned sale price", "Show items missing cost or photos", "What is ready to sell?"],
  market: ["Help me create a safe listing", "Why is my listing pending?", "How do I report a listing?", "What does seller trust mean?"],
  expenses: ["What receipts are missing?", "Summarize this year's expenses", "Help me categorize this expense", "What do I need for tax records?"],
  mileage: ["Summarize miles by vehicle", "Help me log a trip", "What mileage records are missing notes?", "Explain this vehicle summary"],
  spark: ["How does The Spark work?", "Help me submit a kid request", "What does waitlisted mean?", "Are there upcoming kid-friendly events?"],
  tidepool: ["What is Tidepool?", "How do I post safely?", "Why is my post pending?", "How do I report a post?"],
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
  "How do I message admin?",
  "How do I join the Kids Program?",
];

const BUG_WORDS = /\b(broken|wrong|missing|not showing|can't find|cant find|cannot find|disappeared|lost|bug|error|stuck|failed|didn't save|did not save)\b/i;
const TAX_WORDS = /\b(tax|taxes|deduction|cpa|year[-\s]?end|expense|receipt|mileage)\b/i;
const SPARK_WORDS = /\b(kid|kids|child|children|spark|giveaway|family|parent)\b/i;
const DROP_WORDS = /\b(drop radar|prediction|predictions|predicted|forecast|drop|restock window|confirmed vs predicted|release)\b/i;
const SCOUT_WORDS = /\b(scout|report|store|verified|confidence|trusted)\b/i;
const SCOUT_POINTS_WORDS = /\b(scout points?|points|reputation|trusted reporter|earn points)\b/i;
const QUICK_ADD_WORDS = /\b(quick add|add inventory|add item|center plus|\+ button|save to vault|save to forge)\b/i;
const INVENTORY_IMPORT_WORDS = /\b(scan|scanner|barcode|upc|sku|receipt|bulk|import|paste list|multiple items|manual fallback|not in the catalog|not in catalog|catalog missing|add from a receipt|product not found|grouped with another|why did.*group)\b/i;
const HEARTH_WORDS = /\b(hearth|home|what should i do next|daily command|today's best action)\b/i;
const ALERT_WORDS = /\b(alert|alerts|notification|notifications|bell|in-app alerts|confirmed restock alert|predicted window alert)\b/i;
const SETTINGS_WORDS = /\b(settings|profile|notification|seller mode|workspace|workspaces|personal forge|ember & tide forge|business info)\b/i;
const CONTACT_WORDS = /\b(message admin|contact admin|send to admin|ask admin|support|help from admin|ember & tide help)\b/i;
const SHOP_WORDS = /\b(card shop|local shop|family[-\s]?friendly shop|family[-\s]?friendly card shop|kid friendly shop|where should i buy|shop near me|featured partner|advertising partner|reasonable pricing|guarantee msrp|guaranteed msrp|follow a store|favorite store|report a restock at this store|report restock at this store|stores near me|find stores near me|browse by area|browse stores by area|stores by region|nearby areas|expand to another state|add more stores|suggest a store|store suggestion|add a store|adding stores|hidden store|inactive store|why is.*store hidden|admin store tools|store management)\b/i;
const GENERAL_PAGE_HELP_WORDS = /\b(what can i do here|explain this page|what should i do next|what should i do first|what do i do first|help me|where do i start|what is this)\b/i;
const VAULT_FORGE_WORDS = /\b(vault|forge|sell|sale price|planned sale|inventory|what should i do with this item|where did my forge item go|where did my item go)\b/i;
const VALUATION_WORDS = /\b(cost basis|market value|price missing|missing price|manual price|manual value|stale price|msrp|exact value|review prices?|price review|estimated profit|profit dashboard|planned sale price|planned price|collection worth|inventory worth|purchaser breakdown|zena and dillon|zena.*dillon|tax advice|financial advice)\b/i;
const MARKET_WORDS = /\b(market|tidetradr|listing|seller|sold|trade|price|checkout|payment|pay through|buy through)\b/i;
const TIDEPOOL_WORDS = /\b(tidepool|community post|post safely|why is my post pending|report a post|flag a post|can kids post|community board)\b/i;

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
  if (activeTab === "tidepool") return "tidepool";
  if (["menu", "profileProgress", "membership"].includes(activeTab)) return "settings";
  if (activeTab === "adminReview" || extra.isAdminPage) return "admin";
  if (activeTab === "dailyTide") return "general";
  return "general";
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

function buildValuationResponse(text = "") {
  if (/\b(cost basis)\b/i.test(text)) {
    return response("Cost basis is what you have tracked as the item cost. In Forge, it helps estimate planning profit and keep records organized for review with your tax professional.", {
      actions: ["Go to Forge", "Open Expenses"],
      category: "Vault/Forge inventory question",
    });
  }
  if (/\b(msrp).*\b(market value|planned sale price|planned price|price)|\b(market value).*\b(msrp|planned sale price|planned price)|\b(planned sale price|planned price).*\b(msrp|market value)/i.test(text)) {
    return response("MSRP, market value, and planned sale price are separate. MSRP is the retail reference, market value is an estimate or reviewed value, and planned sale price is your own selling plan.", {
      actions: ["Go to Vault", "Go to Forge"],
      category: "Vault/Forge inventory question",
    });
  }
  if (/\b(manual price|manual value)\b/i.test(text)) {
    return response("Manual price means a user or admin entered or reviewed that value. It is useful for planning, but Ember & Tide labels it so it does not look like a live guaranteed market price.", {
      actions: ["Go to Forge", "Go to Vault"],
      category: "Vault/Forge inventory question",
    });
  }
  if (/\b(stale price)\b/i.test(text)) {
    return response("Stale price means the value is old enough that it should be reviewed before you trust it too much. Open the item detail and update the market value when you have a better reference.", {
      actions: ["Go to Forge", "Go to Vault"],
      category: "Vault/Forge inventory question",
    });
  }
  if (/\b(exact value|guarantee.*value|guaranteed value)\b/i.test(text)) {
    return response("Ember & Tide cannot promise an exact value. Prices are estimates or manually entered unless a trusted source is shown, so use them for planning instead of guarantees.", {
      actions: ["Go to Vault", "Go to Forge"],
      category: "Vault/Forge inventory question",
    });
  }
  if (/\b(review prices?|price review)\b/i.test(text)) {
    return response("Open the item detail and look for Price reliability. You can review market value, set a planned sale price, and keep MSRP separate from both.", {
      actions: ["Go to Vault", "Go to Forge"],
      category: "Vault/Forge inventory question",
    });
  }
  if (/\b(market value|collection worth|inventory worth)\b/i.test(text)) {
    return response("Market value only shows when the item has a known value. If it is missing, the dashboard leaves it unknown instead of making up a number or showing $0.", {
      actions: ["Go to Vault", "Go to Forge"],
      category: "Vault/Forge inventory question",
    });
  }
  if (/\b(planned sale price|planned price)\b/i.test(text)) {
    return response("Open the Forge item, then use Update Planned Price. It changes the planning number without changing the original purchase record.", {
      actions: ["Go to Forge"],
      category: "Vault/Forge inventory question",
    });
  }
  if (/\b(purchaser breakdown|zena and dillon|zena.*dillon)\b/i.test(text)) {
    return response("Open the grouped item details or the dashboard purchaser breakdown. It shows who bought what, like Zena - 4 and Dillon - 3, without turning that into official sharing math.", {
      actions: ["Go to Vault", "Go to Forge"],
      category: "Vault/Forge inventory question",
    });
  }
  return response("Estimated profit is a planning view: planned sale total minus tracked cost basis, before final sale details like fees or shipping. Forge keeps records organized for planning and review with your tax professional.", {
    actions: ["Go to Forge", "Open Expenses"],
    category: "Expenses/receipts/mileage question",
  });
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

  if (context.permissionDenied || /\b(blocked|permission denied|admin role|why am i blocked|user status)\b/i.test(text)) {
    return response("You may not have access to this area yet. Admin or moderator role may be required. If this looks wrong, message an admin or return to Hearth.", {
      actions: ["Message Admin", "Return to Hearth"],
      category: "Account/beta access question",
    });
  }

  if (SHOP_WORDS.test(text) && /\b(guarantee msrp|guaranteed msrp|guarantee inventory|guaranteed inventory)\b/i.test(text)) {
    return response("A Family-Friendly Card Shop can support fair access and reasonable pricing when possible, but Ember & Tide should not promise guaranteed MSRP or inventory.", {
      actions: ["Open Stores", "Send to Admin"],
      category: "Other",
    });
  }

  if (VALUATION_WORDS.test(text)) {
    return buildValuationResponse(text);
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

  if (CONTACT_WORDS.test(text)) {
    return response("Use Message Admin when Ember Assist cannot solve it cleanly. I will include your question, current page, public username, and safe context so Ember & Tide can review it in the admin inbox.", {
      actions: ["Send to Admin"],
      category: "Other",
    });
  }

  if (/\b(what should i do first|what do i do first|where do i start)\b/i.test(text)) {
    return response("Start with the piece that matches why you came in. Vault is for collection tracking, Forge is for sellable/business inventory, Scout is for confirmed store reports, and The Spark is for kid/family interest.", {
      actions: ["Open Quick Add", "Go to Vault", "Go to Forge"],
      category: "Other",
    });
  }

  if (QUICK_ADD_WORDS.test(text)) {
    return response("Use the center plus or Quick Add to save something fast. Choose Vault for your collection, Forge for sellable/business inventory, Scout for a report, or Expenses/Mileage for records. You can add details later.", {
      actions: ["Open Quick Add", "Go to Vault", "Go to Forge"],
      category: "Vault/Forge inventory question",
    });
  }

  if (INVENTORY_IMPORT_WORDS.test(text)) {
    if (/\b(barcode|upc|sku|scan|scanner)\b/i.test(text)) {
      return response("Use Quick Add, then Barcode / UPC. You can scan with the camera when available or type the UPC/SKU manually. If there is no match, add it manually and the code stays attached.", {
        actions: ["Open Quick Add"],
        category: "Vault/Forge inventory question",
      });
    }
    if (/\b(receipt|photo)\b/i.test(text)) {
      return response("Receipt review is structured, not magic OCR. Upload or paste receipt text, then mark each line as Vault, Forge, expense-only, supplies, mileage/gas, wishlist, or ignored before saving.", {
        actions: ["Open Quick Add", "Open Expenses"],
        category: "Expenses/receipts/mileage question",
      });
    }
    if (/\b(bulk|import|paste list|multiple items)\b/i.test(text)) {
      return response("Use Bulk Add to paste rows or add manual rows for several items at once. Review destination, purchaser, cost, store, date, and UPC/code before confirming the batch.", {
        actions: ["Open Quick Add", "Go to Forge"],
        category: "Vault/Forge inventory question",
      });
    }
    if (/\b(group|grouped|duplicate)\b/i.test(text)) {
      return response("Items group when they look like the same product in the same destination. The group keeps individual purchase records, so purchaser tallies like Zena - 4 and Dillon - 3 can still stay clean.", {
        actions: ["Go to Vault", "Go to Forge"],
        category: "Vault/Forge inventory question",
      });
    }
    return response("If the catalog cannot find it, add it manually. Keep the product name, type, set, quantity, destination, purchaser, cost, planned sale price if it is Forge, UPC/code, and notes so the record stays useful.", {
      actions: ["Open Quick Add"],
      category: "Vault/Forge inventory question",
    });
  }

  if (SCOUT_POINTS_WORDS.test(text)) {
    return response("Scout points are trust signals from useful confirmed reports and clean community help. Build points by submitting real store reports with clear store, product, time, and proof when you have it.", {
      actions: ["Open Scout Report", "Open Drop Radar"],
      category: "Drop Radar question",
    });
  }

  if (ALERT_WORDS.test(text)) {
    return response("Alerts are in-app only right now. Confirmed restocks, possible Drop Radar windows, community guesses, Kids Program updates, and admin statuses stay labeled so nothing sounds more certain than it is.", {
      actions: ["Open Settings", "Open Drop Radar"],
      category: "Account/beta access question",
    });
  }

  if (SHOP_WORDS.test(text)) {
    if (/\b(suggest a store|store suggestion|add a store|adding stores|missing store)\b/i.test(text)) {
      return response("Use Suggest Store from the store directory. It sends the name, type, city, state, region, and notes to admin review first, so the store does not become public automatically.", {
        actions: ["Open Stores", "Send to Admin"],
        category: "Wrong Scout report/store",
      });
    }
    if (/\b(hidden store|inactive store|why is.*store hidden|closed store)\b/i.test(text)) {
      return response("Stores can be hidden when they are inactive, closed, not reportable, or still under admin review. Admins can see and edit those records, but normal users should only see active public-safe stores.", {
        actions: ["Open Stores", "Send to Admin"],
        category: "Wrong Scout report/store",
      });
    }
    if (/\b(admin store tools|store management|manage stores)\b/i.test(text)) {
      return response(context.isAdmin
        ? "Admin Store Management is for reviewing suggestions, adding or editing local store metadata, marking stores inactive, and approving family-friendly or partner badges. Keep public copy clear: no guaranteed MSRP or inventory."
        : "Store management is admin-only. You can still suggest a store, report bad store details, or message Ember & Tide for review.",
        {
          actions: context.isAdmin ? ["Open Admin Review", "Open Stores"] : ["Open Stores", "Send to Admin"],
          category: "Wrong Scout report/store",
        });
    }
    if (/\b(stores near me|find stores near me|browse by area|stores by region|nearby areas)\b/i.test(text)) {
      return response("Open Stores, then use Browse by Area or the State, Region, and City filters. Confirmed reports, predictions, and family-friendly shop badges stay labeled so nearby inventory never sounds guaranteed.", {
        actions: ["Open Stores", "Open Scout Report"],
        category: "Wrong Scout report/store",
      });
    }
    if (/\b(add more stores|expand to another state|another state|new area|new region)\b/i.test(text)) {
      return response("Ember & Tide can expand when we have clean store data and community reports for that area. Suggest stores, add city/state/region details, and submit confirmed Scout reports so the area becomes useful over time.", {
        actions: ["Open Stores", "Send to Admin"],
        category: "Wrong Scout report/store",
      });
    }
    if (/\b(no predictions|why.*no.*prediction|no drop radar|no forecast)\b/i.test(text)) {
      return response("No predictions usually means the area needs more confirmed restock history. Community guesses can help planning, but they should not train Drop Radar as confirmed data.", {
        actions: ["Open Scout Report", "Open Drop Radar"],
        category: "Drop Radar question",
      });
    }
    if (/\b(guarantee msrp|guaranteed msrp|msrp|guarantee inventory|guaranteed inventory)\b/i.test(text)) {
      return response("A Family-Friendly Card Shop can support fair access and reasonable pricing when possible, but Ember & Tide should not promise guaranteed MSRP or inventory.", {
        actions: ["Open Stores", "Send to Admin"],
        category: "Other",
      });
    }
    if (/\b(featured partner|advertising partner|partner)\b/i.test(text)) {
      return response("Featured Partner and Advertising Partner labels highlight shops that support the Ember & Tide mission. Partner status is transparent, but availability and pricing can still vary.", {
        actions: ["Open Stores", "Send to Admin"],
        category: "Other",
      });
    }
    if (/\b(report.*restock|submit.*restock|stock report)\b/i.test(text)) {
      return response("Open the store profile, choose Report Stock or Report Empty, then save the Scout report with the product, time, and proof if you have it. Confirmed reports matter more than guesses.", {
        actions: ["Open Scout Report", "Open Stores"],
        category: "Wrong Scout report/store",
      });
    }
    if (/\b(follow|favorite|watch)\b/i.test(text)) {
      return response("Use Follow Store on a store profile to keep that location in your Scout watchlist. In-app favorite store alerts can use that later without turning predictions into promises.", {
        actions: ["Open Stores", "Open Settings"],
        category: "Other",
      });
    }
    return response("A Family-Friendly Card Shop supports the Ember & Tide mission: fair, welcoming Pokemon access for kids, families, and collectors. It can mean kids access, trade nights, events, or reasonable pricing when possible, not guaranteed inventory.", {
      actions: ["Open Stores", "Open The Spark", "Send to Admin"],
      category: "Other",
    });
  }

  if (TIDEPOOL_WORDS.test(text) || (page === "tidepool" && GENERAL_PAGE_HELP_WORDS.test(text))) {
    if (/\b(pending|review|why is my post)\b/i.test(text)) {
      return response("Tidepool posts may wait for admin review because this is a family-centered space. Pending does not mean you did anything wrong; it means we are keeping public posts clean and safe.", {
        actions: ["Open Tidepool", "Send to Admin"],
        category: "Other",
      });
    }
    if (/\b(report|flag|unsafe)\b/i.test(text)) {
      return response("Use Report content on a Tidepool post when something feels unsafe, private, fake, or not family-friendly. It creates a moderation signal for admins without publicly showing who reported it.", {
        actions: ["Open Tidepool", "Send to Admin"],
        category: "Other",
      });
    }
    if (/\b(kids?|children|child)\b/i.test(text)) {
      return response("Tidepool is family-friendly, but kids should not share private details or use private messaging. Parents and guardians should manage Kids Program and family posts.", {
        actions: ["Open Tidepool", "Open The Spark"],
        category: "The Spark/Kids Program question",
      });
    }
    return response("Tidepool is the Ember & Tide community board for helpful local updates, questions, family-friendly wins, events, shop notes, and safe collecting talk. Posts stay kind, public-safe, and may go through review first.", {
      actions: ["Open Tidepool", "Send to Admin"],
      category: "Other",
    });
  }

  if (DROP_WORDS.test(text) || (page === "dropRadar" && GENERAL_PAGE_HELP_WORDS.test(text))) {
    if (/\b(no predictions|why.*no.*prediction|no forecast|no drop radar|my area)\b/i.test(text)) {
      return response("No predictions in an area usually means Drop Radar needs more confirmed restock history there. Submit confirmed Scout reports when you spot stock; community guesses stay separate and should not count as proof.", {
        actions: ["Open Scout Report", "Open Stores"],
        category: "Drop Radar question",
      });
    }
    return response("Drop Radar helps you see what might be coming, what was confirmed, and what stores are worth watching. Predictions are educated guesses, not promises. Confirmed Scout reports matter more.", {
      actions: ["Open Drop Radar", "Open Scout Report", "Follow Store"],
      category: "Drop Radar question",
    });
  }

  if ((SCOUT_WORDS.test(text) && page !== "market") || (page === "scout" && GENERAL_PAGE_HELP_WORDS.test(text))) {
    return response("Scout works best when the store, product, time, and confidence are clear. A confirmed recent report should carry more weight than an old report or a prediction.", {
      actions: ["Open Scout Report", "Open Drop Radar"],
      category: "Wrong Scout report/store",
    });
  }

  if (SPARK_WORDS.test(text) || (page === "spark" && GENERAL_PAGE_HELP_WORDS.test(text))) {
    return response("The Spark is where we track kid and family interest. We cannot promise inventory, but when kid-friendly access is available, this helps us keep it fair and parent-approved.", {
      actions: ["Open The Spark", "Follow Announcements"],
      category: "The Spark/Kids Program question",
    });
  }

  if (TAX_WORDS.test(text) || ((page === "expenses" || page === "mileage") && GENERAL_PAGE_HELP_WORDS.test(text))) {
    return response("These are organized records for year-end review, not tax advice. I can help you find missing receipts, mileage gaps, and cost records before you review everything with a tax professional.", {
      actions: ["Open Expenses", "Open Mileage", "Open Forge"],
      category: "Expenses/receipts/mileage question",
    });
  }

  if (VAULT_FORGE_WORDS.test(text) || ((page === "vault" || page === "forge") && GENERAL_PAGE_HELP_WORDS.test(text))) {
    return response("If it is for your personal collection, keep it in Vault. If you plan to sell it, prep it in Forge. You can move it later, and purchaser tallies help keep the records clean.", {
      actions: ["Go to Vault", "Go to Forge", "Open Quick Add"],
      category: "Vault/Forge inventory question",
    });
  }

  if (MARKET_WORDS.test(text) || (page === "market" && GENERAL_PAGE_HELP_WORDS.test(text))) {
    if (/\b(payment|pay|checkout|buy through|purchase through|stripe|paypal)\b/i.test(text)) {
      return response("Ember & Tide does not provide checkout/payment inside the app yet. Use safe, agreed payment methods and follow community rules.", {
        actions: ["Open Market", "Send to Admin"],
        category: "Market/listing question",
      });
    }
    if (/\b(safe listing|make.*listing|create.*listing|quality|rules)\b/i.test(text)) {
      return response("A safe TideTradr listing needs a clear item name, real condition, quantity, price, photo or clean fallback, and public-safe notes. Do not use official/admin wording, home addresses, fake product claims, or unsafe meetup language.", {
        actions: ["Create Listing", "Open Market"],
        category: "Market/listing question",
      });
    }
    if (/\b(pending|review|why.*listing)\b/i.test(text)) {
      return response("Listings can stay pending while Ember & Tide checks safety, price clarity, seller identity, and public notes. Pending means it is not public yet; it is not a payment or checkout hold.", {
        actions: ["Open Market", "Send to Admin"],
        category: "Market/listing question",
      });
    }
    if (/\b(report.*listing|flag.*listing|unsafe listing|scam|counterfeit)\b/i.test(text)) {
      return response("Use Report on a TideTradr listing if it looks fake, unsafe, sold already, misleading, or not family-friendly. That creates an admin review signal without publicly showing who reported it.", {
        actions: ["Open Market", "Send to Admin"],
        category: "Market/listing question",
      });
    }
    if (/\b(seller trust|trusted seller|badges|seller identity)\b/i.test(text)) {
      return response("Seller trust is based on public username, safe badges, Scout level, and community contribution signals. Private email and admin moderation notes should not appear publicly.", {
        actions: ["Open Market", "Open Settings"],
        category: "Market/listing question",
      });
    }
    return response("For Market, the important pieces are the item photo, name, condition, price, seller identity, and status. Fair pricing should be clear, and sold or removed listings should not look active.", {
      actions: ["Open Market", "Create Listing", "Send to Admin"],
      category: "Market/listing question",
    });
  }

  if (SETTINGS_WORDS.test(text) || (page === "settings" && GENERAL_PAGE_HELP_WORDS.test(text))) {
    return response("Settings is where you keep account, workspace, seller mode, notifications, and public identity straight. Personal collection work belongs in Vault; seller or business work belongs in Forge.", {
      actions: ["Open Settings", "Open Forge"],
      category: "Account/beta access question",
    });
  }

  if (HEARTH_WORDS.test(text) || (page === "general" && GENERAL_PAGE_HELP_WORDS.test(text))) {
    return response("Hearth is your starting point: check the best action, then use Quick Add, Scout, Vault, Forge, or Market depending on what needs attention next.", {
      actions: ["Open Quick Add", "Open Scout Report", "Go to Vault"],
      category: "Other",
    });
  }

  if (page === "admin" && context.isAdmin) {
    return response(`Start with the queues that can affect trust: Scout reports, beta access, Spark requests, listings, and app messages. You have ${context.counts?.adminOpenItems || 0} open review items in this local queue.`, {
      actions: ["Open Admin Review"],
      category: "Other",
    });
  }

  return response("I am not sure yet, and I do not want to guess. You can send this to an admin so a real person can look at it with the right context.", {
    confidence: "low",
    shouldEscalate: true,
    category: "Other",
    reason: "No local Ember Assist help topic matched.",
    actions: ["Send to Admin"],
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
