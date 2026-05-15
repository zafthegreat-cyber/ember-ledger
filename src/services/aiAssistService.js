export const AI_REVIEW_DISCLAIMER = "AI suggestions may be incomplete or incorrect. Please review before saving.";
export const AI_UPLOAD_WARNING = "Review images before uploading. Do not upload sensitive personal, payment, medical, or child information.";
export const AI_FORECAST_DISCLAIMER = "Forecasts are estimates based on reports, guesses, and signals. They are not guarantees.";
export const AI_PRICE_DISCLAIMER = "Market values are estimates and may be outdated.";

export const AI_FEATURE_AREAS = {
  RECEIPT_EXTRACTION: "receipt_extraction",
  CATALOG_MATCH: "catalog_match",
  PHOTO_LOOKUP: "photo_lookup",
  MISSING_PRODUCT: "missing_product",
  ITEM_IDENTIFICATION: "item_identification",
  CATALOG_CLEANUP: "catalog_cleanup",
  VARIANT_HELP: "variant_help",
  VAULT_SUMMARY: "vault_summary",
  FORGE_SUMMARY: "forge_summary",
  SALES_SUMMARY: "sales_summary",
  EXPENSE_MILEAGE: "expense_mileage",
  BUSINESS_REPORT: "business_report",
  SCOUT_REPORT_CLASSIFICATION: "scout_report_classification",
  SCOUT_SUMMARY: "scout_summary",
  GUESS_PLANNER: "guess_planner",
  FORECAST_EXPLANATION: "forecast_explanation",
  STORE_DIRECTORY: "store_directory",
  ADMIN_REVIEW: "admin_review",
  KIDS_PROGRAM: "kids_program",
  LISTING_DESCRIPTION: "listing_description",
  FEEDBACK_SUMMARY: "feedback_summary",
  NOTIFICATION_COPY: "notification_copy",
  MARKETING_COPY: "marketing_copy",
  TRUST_COPY: "trust_copy",
  SETTINGS_HELP: "settings_help",
  ONBOARDING_HELP: "onboarding_help",
  ROADMAP_CHANGELOG: "roadmap_changelog",
  BETA_READINESS: "beta_readiness",
};

export const AI_ASSIST_AREAS = Object.values(AI_FEATURE_AREAS);

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function compactText(value = "", max = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}...`;
}

function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

function firstPresent(...values) {
  return values.find((value) => String(value || "").trim()) || "";
}

function moneyText(value = 0) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return `$${numeric.toFixed(2)}`;
}

function plural(count, singular, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function itemName(item = {}) {
  return firstPresent(item.name, item.itemName, item.productName, item.cardName, item.title, "Unnamed item");
}

function numeric(value = 0) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function aiConfidenceLabel(score = 0) {
  const numeric = Number(score || 0);
  if (numeric >= 85) return "Strong match";
  if (numeric >= 55) return "Possible match";
  return "Weak match";
}

export function buildAiReceiptDraftSummary({ storeName = "", rawText = "", lineCount = 0, total = "" } = {}) {
  const summaryParts = [
    storeName ? `Store: ${storeName}` : "Store not detected",
    `${lineCount} possible line${lineCount === 1 ? "" : "s"}`,
    total ? `Total: ${total}` : "",
  ].filter(Boolean);
  return {
    inputSummary: compactText(rawText, 280),
    outputSummary: `AI found these possible receipt items. Please review before saving. ${summaryParts.join(" | ")}`,
    confidenceScore: lineCount ? Math.min(85, 45 + lineCount * 8) : 20,
  };
}

export function buildAiCatalogMatchSummary({ query = "", matches = [] } = {}) {
  const top = matches[0];
  const score = Number(top?.confidencePercent || top?.matchConfidence || top?.score || 0);
  return {
    inputSummary: compactText(query),
    outputSummary: top?.item
      ? `${aiConfidenceLabel(score)}: ${firstPresent(top.item.name, top.item.productName, top.item.cardName, "Catalog match")} (${Math.min(100, Math.round(score))}%). User must choose the correct match.`
      : "We could not confidently match this item. You can search manually, add custom item, or submit it for review.",
    confidenceScore: Math.min(100, Math.round(score || 0)),
  };
}

export function expandCatalogSearchQuery(query = "") {
  const raw = String(query || "").trim();
  const normalized = normalize(raw);
  const aliases = [];
  if (/\betb\b/.test(normalized)) aliases.push("Elite Trainer Box");
  if (/\bpc\s*etb\b/.test(normalized)) aliases.push("Pokemon Center Elite Trainer Box");
  if (/\bupc\b/.test(normalized)) aliases.push(/\d/.test(normalized) ? "barcode/UPC exact match" : "Ultra-Premium Collection");
  if (/\b151\b/.test(normalized)) aliases.push("Scarlet & Violet 151");
  if (/\bpe\b|\bpris/.test(normalized)) aliases.push("Prismatic Evolutions");
  if (/\bssp\b|\bsurging/.test(normalized)) aliases.push("Surging Sparks");
  if (/\bbb\b|\bbooster bundle\b/.test(normalized)) aliases.push("Booster Bundle");
  const expanded = [...new Set([raw, ...aliases].filter(Boolean))];
  return {
    inputSummary: compactText(raw || "Empty catalog query"),
    outputSummary: expanded.length > 1
      ? `Suggested search aliases: ${expanded.join(" | ")}. These are query hints, not verified catalog facts.`
      : raw
        ? `No extra alias needed. Search TideTradr with: ${raw}.`
        : "Enter a product, set, UPC, SKU, card name, or shorthand before using AI query help.",
    confidenceScore: expanded.length > 1 ? 72 : raw ? 45 : 0,
    expanded,
  };
}

export function suggestItemDetailsFromText({ text = "", context = "" } = {}) {
  const clues = detectPhotoLookupClues(text);
  const lower = normalize(`${text} ${context}`);
  const destination = /sell|business|forge|inventory|profit|listing/.test(lower)
    ? "forge"
    : /want|wish|hunt|looking/.test(lower)
      ? "wishlist"
      : /keep|binder|collection|personal|vault/.test(lower)
        ? "vault"
        : "review";
  const productType = clues.productType || (
    /etb|elite trainer/.test(lower) ? "Elite Trainer Box" :
    /booster bundle/.test(lower) ? "Booster Bundle" :
    /tin/.test(lower) ? "Tin" :
    /slab|graded|psa|cgc|bgs/.test(lower) ? "Graded slab" :
    /card|holo|reverse|promo/.test(lower) ? "Card" :
    ""
  );
  return {
    inputSummary: compactText(text || context || "No item text"),
    outputSummary: [
      clues.searchText ? `Possible search terms: ${clues.searchText}.` : "",
      productType ? `Possible product type: ${productType}.` : "",
      clues.setName ? `Possible set/series: ${clues.setName}.` : "",
      clues.upc ? `Visible UPC/SKU clue: ${clues.upc}.` : "",
      destination !== "review" ? `Suggested destination context: ${destination}.` : "Choose the final destination manually.",
      "Review before saving.",
    ].filter(Boolean).join(" "),
    confidenceScore: Math.max(clues.confidenceScore || 0, productType ? 60 : 30),
    productType,
    setName: clues.setName,
    upc: clues.upc,
    destination,
    searchText: clues.searchText,
  };
}

export function explainVariantHelp({ text = "", productType = "" } = {}) {
  const lower = normalize(`${text} ${productType}`);
  const variant = /reverse/.test(lower) ? "Reverse Holo" :
    /cosmos/.test(lower) ? "Cosmos Holo" :
    /cracked/.test(lower) ? "Cracked Ice" :
    /staff/.test(lower) ? "Staff" :
    /promo|black star/.test(lower) ? "Promo" :
    /master ball/.test(lower) ? "Master Ball" :
    /poke ball|pokeball/.test(lower) ? "Poke Ball" :
    /special illustration|sir/.test(lower) ? "Special Illustration Rare" :
    /illustration| ir\b/.test(lower) ? "Illustration Rare" :
    /full art/.test(lower) ? "Full Art" :
    /holo/.test(lower) ? "Holo" :
    "";
  return {
    inputSummary: compactText(text || productType || "Variant help requested"),
    outputSummary: variant
      ? `Possible variant: ${variant}. Confirm against the card finish, stamp, set number, and product source before saving.`
      : "Variant is unclear. If the photo or notes are weak, choose Unknown / not sure, then update after checking the card finish and set number.",
    confidenceScore: variant ? 64 : 25,
    variant,
  };
}

export function detectPhotoLookupClues(text = "") {
  const raw = String(text || "").trim();
  const tokens = raw.split(/\s+/).filter(Boolean);
  const upc = raw.match(/\b\d{8,14}\b/)?.[0] || "";
  const cardNumber = raw.match(/\b\d{1,3}\s*\/\s*\d{1,3}\b/)?.[0] || "";
  const productType = raw.match(/\b(Elite Trainer Box|Booster Bundle|Booster Box|Tin|Mini Tin|Blister|Sleeved Booster|Collection Box|Premium Collection|Battle Deck|UPC|Ultra[- ]Premium)\b/i)?.[0] || "";
  const setName = raw.match(/\b(Prismatic Evolutions|Surging Sparks|Destined Rivals|Journey Together|151|Temporal Forces|Twilight Masquerade|Paldean Fates|Obsidian Flames)\b/i)?.[0] || "";
  const searchText = compactText([setName, productType, cardNumber || upc || tokens.slice(0, 6).join(" ")].filter(Boolean).join(" "), 120);
  const confidenceScore = upc ? 85 : productType || setName || cardNumber ? 65 : raw ? 35 : 0;
  return {
    detectedText: raw,
    upc,
    cardNumber,
    productType,
    setName,
    searchText,
    confidenceScore,
    outputSummary: searchText
      ? `${aiConfidenceLabel(confidenceScore)} from visible text clues: ${searchText}. Confirm before saving.`
      : "We could not confidently match this item. You can search manually, add custom item, or submit it for review.",
  };
}

export function buildMissingProductPrefill({ query = "", detectedText = "", productType = "", setName = "", upc = "" } = {}) {
  const clues = detectPhotoLookupClues(detectedText || query);
  const name = compactText(firstPresent(query, clues.searchText, detectedText), 100);
  return {
    productName: name,
    productType: productType || clues.productType || "",
    setName: setName || clues.setName || "",
    upc: upc || clues.upc || "",
    notes: compactText(`AI prefill from user-provided text. Review before admin submission. Raw clue: ${detectedText || query}`, 280),
    confidenceScore: clues.confidenceScore || (name ? 35 : 0),
    outputSummary: name
      ? `Prefilled missing product draft for admin review: ${name}. Confirm product type, set, UPC/SKU, and notes before submitting.`
      : "No reliable product details found. Submit a manual missing product suggestion if needed.",
  };
}

export function summarizeVaultCollection(items = []) {
  const rows = Array.isArray(items) ? items : [];
  const missingCondition = rows.filter((item) => !firstPresent(item.condition, item.conditionName, item.sealedCondition)).length;
  const missingValue = rows.filter((item) => !numeric(item.marketPrice || item.marketValue || item.manualValue)).length;
  const missingVariant = rows.filter((item) => /card|single|graded|slab/i.test(firstPresent(item.productType, item.category, item.itemType)) && !firstPresent(item.variant, item.variantName)).length;
  const duplicateNames = rows.reduce((acc, item) => {
    const name = normalize(itemName(item));
    if (name) acc.set(name, (acc.get(name) || 0) + numeric(item.quantity || 1));
    return acc;
  }, new Map());
  const duplicateCount = [...duplicateNames.values()].filter((count) => count > 1).length;
  const marketTotal = rows.reduce((sum, item) => sum + numeric(item.marketPrice || item.marketValue) * Math.max(1, numeric(item.quantity || 1)), 0);
  return {
    inputSummary: `${plural(rows.length, "Vault item")}, ${moneyText(marketTotal) || "no market total"}`,
    outputSummary: rows.length
      ? `Vault summary: ${plural(rows.length, "item")} tracked, estimated market ${moneyText(marketTotal) || "not available"}. Attention: ${plural(missingCondition, "item")} missing condition, ${plural(missingVariant, "card")} missing variant, ${plural(missingValue, "item")} missing value, and ${plural(duplicateCount, "possible duplicate group")}. No changes were made.`
      : "Your Vault is empty. Add a card or sealed product first, then AI can help summarize missing details.",
    confidenceScore: rows.length ? 72 : 20,
  };
}

export function summarizeForgeRecords({ inventory = [], sales = [], expenses = [], mileageTrips = [] } = {}) {
  const inventoryRows = Array.isArray(inventory) ? inventory : [];
  const saleRows = Array.isArray(sales) ? sales : [];
  const expenseRows = Array.isArray(expenses) ? expenses : [];
  const mileageRows = Array.isArray(mileageTrips) ? mileageTrips : [];
  const missingCost = inventoryRows.filter((item) => !numeric(item.unitCost || item.purchasePrice || item.costBasis)).length;
  const staleDrafts = inventoryRows.filter((item) => /listed|draft|needs photos/i.test(String(item.status || ""))).length;
  const inventoryCost = inventoryRows.reduce((sum, item) => sum + numeric(item.unitCost || item.purchasePrice) * Math.max(1, numeric(item.quantity || 1)), 0);
  const salesTotal = saleRows.reduce((sum, sale) => sum + numeric(sale.finalSalePrice || sale.salePrice || sale.total || sale.amount) * Math.max(1, numeric(sale.quantitySold || sale.quantity || 1)), 0);
  const expenseTotal = expenseRows.reduce((sum, expense) => sum + numeric(expense.amount || expense.total), 0);
  const miles = mileageRows.reduce((sum, trip) => {
    const direct = numeric(trip.miles);
    if (direct) return sum + direct;
    return sum + Math.max(0, numeric(trip.endMiles) - numeric(trip.startMiles));
  }, 0);
  return {
    inputSummary: `${plural(inventoryRows.length, "Forge item")}, ${plural(saleRows.length, "sale")}, ${plural(expenseRows.length, "expense")}, ${plural(mileageRows.length, "trip")}`,
    outputSummary: `Forge summary: inventory cost basis ${moneyText(inventoryCost) || "not available"}, sales tracked ${moneyText(salesTotal) || "$0.00"}, expenses ${moneyText(expenseTotal) || "$0.00"}, and ${miles.toFixed(1)} business miles. Attention: ${plural(missingCost, "inventory item")} missing cost basis and ${plural(staleDrafts, "listing/inventory row")} may need cleanup. Estimates are for tracking only, not tax advice.`,
    confidenceScore: 70,
  };
}

export function explainSaleProfit({ sale = {}, item = {} } = {}) {
  const quantity = Math.max(1, numeric(sale.quantitySold || sale.quantity || 1));
  const gross = numeric(sale.finalSalePrice || sale.salePrice || sale.price) * quantity;
  const cost = numeric(sale.costBasis || item.unitCost || item.purchasePrice) * quantity;
  const shipping = numeric(sale.shippingCost);
  const fees = numeric(sale.platformFees || sale.fees);
  const profit = gross - cost - shipping - fees;
  const missing = [];
  if (!gross) missing.push("sale price");
  if (!cost) missing.push("cost basis");
  if (!fees) missing.push("platform fees");
  return {
    inputSummary: compactText(`${itemName(item || sale)} sale profit check`),
    outputSummary: `Profit estimate: gross ${moneyText(gross) || "$0.00"} minus cost basis ${moneyText(cost) || "$0.00"}, shipping ${moneyText(shipping) || "$0.00"}, and fees ${moneyText(fees) || "$0.00"} = ${moneyText(profit) || "$0.00"}. ${missing.length ? `Missing or zero fields: ${missing.join(", ")}.` : "No obvious missing fields."} This is tracking support, not tax advice.`,
    confidenceScore: missing.length ? 55 : 78,
  };
}

export function suggestExpenseCategory({ vendor = "", notes = "", amount = "" } = {}) {
  const text = normalize(`${vendor} ${notes}`);
  const category = /mile|gas|fuel|parking/.test(text) ? "Mileage / Vehicle" :
    /ship|postage|label|usps|ups|fedex/.test(text) ? "Shipping" :
    /sleeve|toploader|box|supply|printer|label/.test(text) ? "Supplies" :
    /ad|flyer|marketing|meta|facebook|instagram/.test(text) ? "Marketing" :
    /show|event|table|booth/.test(text) ? "Event / Show" :
    /inventory|pokemon|target|walmart|best buy|gamestop/.test(text) ? "Inventory" :
    "Review";
  return {
    inputSummary: compactText(`${vendor} ${notes} ${amount}`),
    outputSummary: category === "Review"
      ? "No obvious expense category found. Choose manually and attach a receipt if available. Mileage and tax-related estimates are for tracking only and are not tax advice."
      : `Suggested category: ${category}. Confirm before saving. Mileage and tax-related estimates are for tracking only and are not tax advice.`,
    confidenceScore: category === "Review" ? 30 : 68,
    category,
  };
}

export function summarizeBusinessReport({ inventory = [], sales = [], expenses = [], mileageTrips = [] } = {}) {
  const forge = summarizeForgeRecords({ inventory, sales, expenses, mileageTrips });
  const missingSoldCost = (sales || []).filter((sale) => !numeric(sale.costBasis || sale.unitCost)).length;
  return {
    ...forge,
    inputSummary: `Business report | ${forge.inputSummary}`,
    outputSummary: `${forge.outputSummary} Business report note: ${plural(missingSoldCost, "sold item")} may be missing cost basis, so profit could be understated or overstated. Estimates are not financial, legal, or tax advice.`,
    confidenceScore: Math.min(80, (forge.confidenceScore || 60) + 5),
  };
}

export function classifyScoutReportNote({ note = "", productName = "", currentType = "" } = {}) {
  const text = normalize(`${note} ${productName} ${currentType}`);
  const isGuess = /usually|every|maybe|think|guess|pattern|wednesday|thursday|truck day|restock day/.test(text) && !/had|saw|bought|photo|receipt|in stock/.test(text);
  const label = /no stock|empty|nothing/.test(text) ? "no stock" :
    /vendor|stocking/.test(text) ? "vendor seen" :
    /line|queue/.test(text) ? "line seen" :
    /low|few left/.test(text) ? "low stock" :
    isGuess ? "guess/pattern note" :
    /had|saw|bought|available|in stock/.test(text) ? "confirmed stock" :
    "other";
  return {
    inputSummary: compactText(`${productName} ${note}`),
    outputSummary: `Suggested Scout classification: ${label}. User must confirm before submitting. ${isGuess ? "This should stay labeled as a guess, not confirmed stock." : "Only mark confirmed if the report/proof supports it."}`,
    confidenceScore: label === "other" ? 35 : 66,
    label,
    isGuess,
  };
}

export function structureGuessFromNote({ storeName = "", note = "", day = "", window = "" } = {}) {
  const text = `${storeName} ${note}`;
  const dayMatch = firstPresent(day, text.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i)?.[0]);
  const windowMatch = firstPresent(window, text.match(/\b(morning|afternoon|evening|midday|night|open|close|\d{1,2}\s?(?:am|pm))\b/i)?.[0]);
  return {
    inputSummary: compactText(text || "Guess note"),
    outputSummary: `Structured guess draft: ${storeName || "Store needs selection"}${dayMatch ? ` usually ${dayMatch}` : " needs a guessed day"}${windowMatch ? ` around ${windowMatch}` : ""}. This is a pattern-based guess and needs confirmation from future reports.`,
    confidenceScore: dayMatch ? 62 : 35,
    guessedDay: dayMatch,
    guessedTimeWindow: windowMatch,
  };
}

export function summarizeStoreHistory({ store = {}, reports = [], guesses = [] } = {}) {
  const storeName = firstPresent(store.nickname, store.name, store.storeName, "this store");
  const lastReport = reports[0];
  return {
    inputSummary: compactText(`${storeName}: ${reports.length} reports, ${guesses.length} guesses`),
    outputSummary: `${storeName} history: ${plural(reports.length, "report")} and ${plural(guesses.length, "guess")} tracked. ${lastReport ? `Most recent report: ${compactText(firstPresent(lastReport.reportType, lastReport.reportText, lastReport.notes), 100)}.` : "No recent confirmed report is available."} Admin should verify duplicate stores, aliases, region, and stock likelihood before global changes.`,
    confidenceScore: reports.length || guesses.length ? 66 : 30,
  };
}

export function summarizeKidsApplication(application = {}) {
  const requested = Array.isArray(application.requestedAccess) ? application.requestedAccess.join(", ") : application.requestedAccess || "not specified";
  const missing = [];
  if (!application.email) missing.push("email");
  if (!application.zipCode && !application.zip_code) missing.push("ZIP");
  if (!application.agreesNoResale && !application.agrees_no_resale) missing.push("no-resale agreement");
  return {
    inputSummary: compactText(`Kids Program application ${application.id || ""}`),
    outputSummary: `Kids Program admin summary: requested access ${requested}; status ${application.status || "pending_review"}. ${missing.length ? `Needs info: ${missing.join(", ")}.` : "Required beta fields look present."} AI summaries are for admin review only. Admins make final Kids Program decisions.`,
    confidenceScore: missing.length ? 58 : 76,
  };
}

export function draftNotificationCopy({ type = "account_notice", title = "", message = "" } = {}) {
  const cleanTitle = compactText(title || type.replace(/_/g, " "), 70);
  const cleanMessage = compactText(message || "There is an Ember & Tide update ready for review.", 180);
  return {
    inputSummary: compactText(`${type}: ${title} ${message}`),
    outputSummary: `Draft notification: "${cleanTitle}" - ${cleanMessage} Review and confirm before sending. SMS remains disabled unless separately approved.`,
    confidenceScore: 65,
    title: cleanTitle,
    message: cleanMessage,
  };
}

export function draftMarketingCopy({ topic = "", audience = "parents" } = {}) {
  const focus = topic || "Ember & Tide beta";
  const body = audience === "card_shop"
    ? `Help bring fair, family-friendly Pokemon access back to local collectors. Ember & Tide is preparing beta tools for Vault, Forge, Scout, and Kids Program support.`
    : audience === "sponsor"
      ? `Partner with Ember & Tide to support kid-focused packs, giveaways, and fair-access community events when inventory allows.`
      : `Ember & Tide helps families track collections, watch local restocks, and support kid-friendly Pokemon access.`;
  return {
    inputSummary: compactText(`${audience}: ${focus}`),
    outputSummary: `Draft ${audience.replace(/_/g, " ")} copy for review: ${body} Review before publishing. No auto-posting happens.`,
    confidenceScore: 70,
  };
}

export function draftTrustCopy({ section = "privacy", copy = "" } = {}) {
  const baseline = section === "legal"
    ? "This plain-English draft should be reviewed before public launch and is not lawyer-approved legal advice."
    : "Use clear, parent-friendly wording and avoid collecting unnecessary sensitive data.";
  return {
    inputSummary: compactText(`${section}: ${copy}`),
    outputSummary: `${baseline} Suggested clarity pass: ${compactText(copy || "Explain what data is collected, why it is needed, and how users can contact support.", 220)}`,
    confidenceScore: 62,
  };
}

export function suggestOnboardingNextStep({ choices = [], hasVaultItems = false, hasForgeItems = false, hasReports = false } = {}) {
  const next = choices.includes("Track business inventory") && !hasForgeItems ? "Add your first Forge inventory item." :
    choices.includes("Watch local restocks") && !hasReports ? "Submit or browse your first Scout report." :
    choices.includes("Track my personal collection") && !hasVaultItems ? "Add your first Vault item." :
    "Open TideTradr search and save a wishlist or watch item.";
  return {
    inputSummary: compactText(`Onboarding choices: ${choices.join(", ") || "none"}`),
    outputSummary: `Suggested next step: ${next} This is optional; manual navigation still works.`,
    confidenceScore: 64,
  };
}

export function draftRoadmapOrChangelog({ updates = [], feedbackThemes = "" } = {}) {
  const titles = (updates || []).map((entry) => entry.title || entry).filter(Boolean).slice(0, 5);
  return {
    inputSummary: compactText(`${titles.join(", ")} ${feedbackThemes}`),
    outputSummary: titles.length
      ? `Draft changelog summary: ${titles.join("; ")}. Admin should review before publishing What's New or roadmap items.`
      : "No updates selected yet. Add roadmap or feedback items before drafting a changelog.",
    confidenceScore: titles.length ? 68 : 25,
  };
}

export function summarizeBetaReadiness({ blockers = [], feedback = [], reviewCounts = {} } = {}) {
  const blocking = blockers.filter((entry) => /blocking|high/i.test(String(entry.severity || ""))).length;
  const queues = Object.entries(reviewCounts).filter(([, count]) => Number(count) > 0).map(([name, count]) => `${name}: ${count}`);
  return {
    inputSummary: `${blockers.length} blockers, ${feedback.length} feedback items, ${queues.length} active queues`,
    outputSummary: `Beta status summary: ${plural(blockers.length, "blocker")} tracked, including ${plural(blocking, "high-risk item")}. Active queues: ${queues.join(", ") || "none"}. AI cannot mark beta ready; admin decides launch status after QA.`,
    confidenceScore: 72,
  };
}

export function summarizeScoutSignals({ storeName = "", reports = [], guesses = [], forecasts = [] } = {}) {
  const confirmedReports = reports.filter((report) => /confirmed|verified/i.test(String(report.status || report.verificationStatus || report.verification_status || "")));
  const noStockReports = reports.filter((report) => /no[_\s-]?stock|empty/i.test(String(report.reportType || report.report_type || report.stockStatus || "")));
  const recentReport = reports[0];
  const latestForecast = forecasts[0];
  const dayCounts = new Map();
  guesses.forEach((guess) => {
    const day = firstPresent(guess.guessedDay, guess.guessed_day, guess.day, guess.forecastDay);
    if (day) dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
  });
  const strongestDay = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const parts = [];
  if (strongestDay) parts.push(`pattern suggests ${strongestDay[0]}`);
  if (confirmedReports.length) parts.push(`${confirmedReports.length} confirmed report${confirmedReports.length === 1 ? "" : "s"}`);
  if (noStockReports.length) parts.push(`${noStockReports.length} no-stock report${noStockReports.length === 1 ? "" : "s"}`);
  if (recentReport?.reportTime || recentReport?.reportedAt || recentReport?.createdAt) parts.push("recent report exists");
  const confidenceScore = Math.min(90, confirmedReports.length * 25 + guesses.length * 10 + (latestForecast?.confidenceScore || 0) / 3 - noStockReports.length * 8);
  return {
    inputSummary: compactText(`${storeName}: ${reports.length} reports, ${guesses.length} guesses, ${forecasts.length} forecast windows`),
    outputSummary: parts.length
      ? `Recent Scout signals for ${storeName || "this store"} suggest ${parts.join(", ")}. This needs confirmation before treating it as current stock.`
      : `There is not enough recent Scout signal for ${storeName || "this store"} yet. Add a report or guess to improve the forecast.`,
    confidenceScore: Math.max(0, Math.round(confidenceScore)),
  };
}

export function explainForecastSignal(row = {}) {
  const confidence = firstPresent(row.confidenceLabel, row.confidence_label, row.confidence, "low");
  const reports = Number(row.supportingReportCount ?? row.supporting_report_count ?? 0);
  const guesses = Number(row.supportingGuessCount ?? row.supporting_guess_count ?? 0);
  const noStock = Number(row.noStockCount || 0);
  const basis = firstPresent(row.basisSummary, row.basis_summary, row.reason, row.sourceText);
  const pieces = [];
  if (reports) pieces.push(`${reports} supporting report${reports === 1 ? "" : "s"}`);
  if (guesses) pieces.push(`${guesses} supporting guess${guesses === 1 ? "" : "es"}`);
  if (noStock) pieces.push(`${noStock} conflicting no-stock report${noStock === 1 ? "" : "s"}`);
  if (basis) pieces.push(basis);
  return {
    inputSummary: compactText(`${row.storeName || row.store_name || "Store"} | ${row.expectedWindow || row.forecastDay || row.forecast_day || "Unknown window"}`),
    outputSummary: `Confidence is ${normalize(confidence) || "low"} because ${pieces.length ? pieces.join(", ") : "there is limited supporting signal"}. Forecasts are estimates, not guarantees.`,
    confidenceScore: Number(row.score || row.confidenceScore || row.confidence_score || 0),
  };
}

export function draftMarketplaceListingCopy(listing = {}) {
  const titleCore = compactText(firstPresent(listing.title, listing.itemName, listing.productName, "Pokemon TCG item"), 70);
  const condition = firstPresent(listing.condition, "Condition shown in photos");
  const quantity = Number(listing.quantity || 1);
  const setLine = firstPresent(listing.setName, listing.expansion);
  const productType = firstPresent(listing.productType, listing.listingType, "Pokemon TCG");
  const priceText = Number(listing.askingPrice || 0) ? `$${Number(listing.askingPrice || 0).toFixed(2)}` : "price listed";
  const title = compactText(`${titleCore} ${condition}`.replace(/\s+/g, " "), 80);
  const description = [
    `${titleCore} - ${productType}`,
    setLine ? `Set/series: ${setLine}` : "",
    `Quantity: ${quantity}`,
    `Condition: ${condition}`,
    `Price: ${priceText}`,
    listing.pickupOnly ? "Local pickup preferred." : "",
    listing.shippingAvailable ? "Shipping available if arranged before purchase." : "",
    listing.intendedForKids ? "Kid/family-friendly pricing intent noted." : "",
    "Please review details and photos before buying.",
  ].filter(Boolean).join("\n");
  return {
    inputSummary: compactText(`${titleCore} | ${productType} | ${condition} | ${priceText}`),
    outputSummary: "Draft listing copy created for review. No marketplace posting happens automatically.",
    confidenceScore: titleCore ? 72 : 30,
    drafts: {
      ebayTitle: title,
      whatnotDescription: compactText(description, 500),
      facebookPost: compactText(`${title}\n\n${description}`, 650),
      instagramCaption: compactText(`${title}\n${priceText} | ${condition}\n#PokemonTCG #EmberAndTide`, 400),
    },
  };
}

export function summarizeFeedbackItems(items = []) {
  const buckets = {
    auth: 0,
    mobile_ui: 0,
    catalog: 0,
    scanner: 0,
    scout: 0,
    kids_program: 0,
    pricing: 0,
    inventory: 0,
    other: 0,
  };
  const text = items.map((item) => `${item.type || ""} ${item.whatHappened || ""} ${item.steps || ""} ${item.page || ""}`).join("\n").toLowerCase();
  Object.keys(buckets).forEach((key) => {
    const pattern = key === "mobile_ui" ? /mobile|layout|button|overflow|screen|ui/g
      : key === "kids_program" ? /kid|donation|giveaway|pack/g
      : new RegExp(key.replace("_", "|"), "g");
    buckets[key] = (text.match(pattern) || []).length;
  });
  if (!Object.values(buckets).some(Boolean)) buckets.other = items.length;
  const top = Object.entries(buckets).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return {
    inputSummary: `${items.length} feedback item${items.length === 1 ? "" : "s"}`,
    outputSummary: top.length
      ? `Top feedback themes: ${top.map(([key, count]) => `${key.replace(/_/g, " ")} (${count})`).join(", ")}. Admin should review details before prioritizing.`
      : "No feedback themes found yet.",
    confidenceScore: Math.min(80, 30 + items.length * 5),
    buckets,
  };
}

export function suggestFeedbackSeverity(item = {}) {
  const text = normalize([
    item.feedbackType,
    item.type,
    item.title,
    item.description,
    item.whatHappened,
    item.expected,
    item.page,
  ].filter(Boolean).join(" "));
  const severity = /can't|cannot|blocked|crash|broken|lost|login|auth|payment|private|security/.test(text)
    ? "high"
    : /mobile|overflow|wrong|missing|scanner|receipt|catalog|save failed/.test(text)
      ? "normal"
      : /typo|copy|small|nice to have|feature/.test(text)
        ? "low"
        : "normal";
  return {
    inputSummary: compactText(`${item.title || "Feedback"} | ${item.page || "unknown page"}`),
    outputSummary: `Suggested feedback severity: ${severity}. Admin should confirm severity and status manually before changing the queue.`,
    confidenceScore: severity === "high" ? 66 : 54,
    severity,
  };
}

export function summarizeAdminReviewQueue({ suggestions = [], listings = [], reports = [], feedback = [] } = {}) {
  const pendingSuggestions = suggestions.filter((item) => /submitted|under review|needs more info|pending/i.test(String(item.status || ""))).length;
  const flaggedListings = listings.filter((item) => /pending|flagged/i.test(String(item.status || ""))).length;
  const reportCount = reports.filter((item) => /pending|unverified|stale|rejected/i.test(String(item.status || item.verificationStatus || ""))).length;
  return {
    inputSummary: `${pendingSuggestions} suggestions, ${flaggedListings} listings, ${reportCount} reports, ${feedback.length} feedback rows`,
    outputSummary: `Admin review summary: ${pendingSuggestions} shared data suggestion${pendingSuggestions === 1 ? "" : "s"}, ${flaggedListings} marketplace listing${flaggedListings === 1 ? "" : "s"}, and ${reportCount} Scout report${reportCount === 1 ? "" : "s"} need review. AI can suggest duplicate or missing-info checks, but admins approve manually.`,
    confidenceScore: 70,
  };
}

export function weekdayNameFromDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return WEEKDAYS[date.getDay()];
}
