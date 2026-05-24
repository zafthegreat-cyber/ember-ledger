export const DROP_RADAR_RESET_OPTIONS = [
  {
    key: "predictionCache",
    label: "Clear prediction cache only",
    clears: ["dropRadarPredictionCache", "dropRadarPredictions"],
  },
  {
    key: "generatedPredictions",
    label: "Clear generated restock predictions only",
    clears: ["restockPatterns", "predictions", "forecastWindows"],
  },
  {
    key: "historicalBackfill",
    label: "Clear imported/backfilled historical restock data",
    clears: ["restockIntel historical/backfill rows"],
  },
  {
    key: "manualTraining",
    label: "Clear manually entered training restocks",
    clears: ["manualRestockTraining", "restockIntel manual training rows"],
  },
  {
    key: "full",
    label: "Full Drop Radar reset",
    clears: ["all Drop Radar prediction, backfill, and training data"],
  },
];

export const DROP_RADAR_CONFIRMATION_TEXT = "RESET DROP RADAR";
export const MIN_SCOUT_POINTS_FOR_GUESS = 20;
export const DROP_RADAR_GUESS_LOCKED_MESSAGE = "Earn more Scout points by submitting confirmed reports before posting predictions.";

export const DROP_RADAR_RECORD_KIND_LABELS = {
  confirmed_restock: "Confirmed Restock",
  predicted_window: "Predicted Window",
  community_guess: "Community Guess",
  admin_note: "Admin Note",
  placeholder: "Demo Forecast",
  unknown: "Unclassified Signal",
};

export const DROP_RADAR_STORE_ALIASES = [
  { alias: "RM T", storeName: "Redmill Target", retailer: "Target" },
  { alias: "Redmill T", storeName: "Redmill Target", retailer: "Target" },
  { alias: "Pem T", storeName: "Pembroke Target", retailer: "Target" },
  { alias: "Pembroke T", storeName: "Pembroke Target", retailer: "Target" },
  { alias: "FC", storeName: "First Colonial Target", retailer: "Target" },
  { alias: "FC Target", storeName: "First Colonial Target", retailer: "Target" },
  { alias: "GB B&N", storeName: "Greenbrier Barnes & Noble", retailer: "Barnes & Noble" },
  { alias: "GB Barnes", storeName: "Greenbrier Barnes & Noble", retailer: "Barnes & Noble" },
  { alias: "GB", storeName: "Greenbrier Target", retailer: "Target" },
  { alias: "Greenbrier", storeName: "Greenbrier Target", retailer: "Target" },
];

export function normalizeDropRadarText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeDropRadarStoreKey(input = {}) {
  const name = input.storeName || input.store_name || input.nickname || input.name || input.storeAlias || input.store_alias || "";
  const retailer = input.retailer || input.chain || input.storeGroup || input.store_group || "";
  return `${normalizeDropRadarText(retailer)}|${normalizeDropRadarText(name)}`;
}

export function isDropRadarHistoricalIntel(row = {}) {
  const source = normalizeDropRadarText(`${row.source || ""} ${row.sourceLabel || row.source_label || ""} ${row.sourceType || row.source_type || ""} ${row.type || ""} ${row.id || ""} ${row.confidence || ""} ${row.importedBatch || row.imported_batch || ""}`);
  return (
    row.importedByAdmin === true ||
    row.imported_by_admin === true ||
    source.includes("historical import") ||
    source.includes("manual historical backfill") ||
    source.includes("historical manual") ||
    source.includes("historical backfill") ||
    source.includes("seed intel") ||
    source.includes("unverified historical") ||
    source.includes("text screenshot") ||
    source.includes("group chat")
  );
}

export function isDropRadarManualTraining(row = {}) {
  const source = normalizeDropRadarText(`${row.source || ""} ${row.sourceType || row.source_type || ""} ${row.type || ""}`);
  return source.includes("manual training restock") || source.includes("admin manual training") || row.shouldTrainPredictions === true;
}

export function shouldUseDropRadarSeed(savedScoutData = {}, options = {}) {
  if (savedScoutData.dropRadarSeedDisabled) return false;
  return Boolean(
    options.demoMode ||
    savedScoutData.dropRadarDemoMode ||
    savedScoutData.useDemoDropRadarSeed ||
    savedScoutData.allowDemoDropRadarSeed ||
    savedScoutData.demoMode === true
  );
}

export function getScoutPoints(...profiles) {
  const values = profiles
    .filter(Boolean)
    .flatMap((profile) => [
      profile.scoutPoints,
      profile.scout_points,
      profile.rewardPoints,
      profile.reward_points,
      profile.points,
      profile.scoutProfile?.scoutPoints,
      profile.scoutProfile?.rewardPoints,
    ])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  return Math.max(0, ...values);
}

export function canSubmitScoutGuess(profile = {}, options = {}) {
  if (options.admin) return true;
  return getScoutPoints(profile, options.profile || {}) >= MIN_SCOUT_POINTS_FOR_GUESS;
}

export function isDropRadarCommunityGuess(row = {}) {
  const source = normalizeDropRadarText(`${row.source || ""} ${row.sourceType || row.source_type || ""}`);
  const confidence = normalizeDropRadarText(`${row.confidence || ""} ${row.confidenceLevel || row.confidence_level || ""}`);
  const reportType = normalizeDropRadarText(`${row.recordType || row.record_type || ""} ${row.reportType || row.report_type || ""} ${row.quickReportType || ""}`);
  return (
    reportType.includes("guess") ||
    source.includes("guess") ||
    source.includes("planner") ||
    source.includes("manual prediction") ||
    source.includes("community prediction") ||
    confidence === "guess"
  );
}

export function isDropRadarPlaceholderForecast(row = {}) {
  const text = normalizeDropRadarText(`${row.id || ""} ${row.source || ""} ${row.sourceType || row.source_type || ""} ${row.sourceStatus || ""} ${row.notes || ""}`);
  return (
    text.includes("placeholder") ||
    text.includes("fake forecast") ||
    text.includes("random forecast") ||
    text.includes("mock forecast") ||
    text.includes("demo forecast") ||
    text.includes("sample forecast")
  );
}

export function isDropRadarRejectedOrDeleted(row = {}) {
  const status = normalizeDropRadarText(`${row.status || ""} ${row.verificationStatus || row.verification_status || ""} ${row.moderationStatus || row.moderation_status || ""}`);
  return Boolean(
    row.deletedAt ||
    row.deleted_at ||
    row.removedAt ||
    row.removed_at ||
    status.includes("rejected") ||
    status.includes("deleted") ||
    status.includes("removed") ||
    status.includes("hidden")
  );
}

function hasDropRadarStore(row = {}) {
  return Boolean(row.storeId || row.store_id || row.storeName || row.store_name || row.storeAlias || row.store_alias || row.nickname || row.name);
}

function hasDropRadarDate(row = {}) {
  return Boolean(row.date || row.reportDate || row.report_date || row.observedAt || row.observed_at || row.reportedAt || row.reported_at || row.createdAt || row.created_at);
}

function hasRestockSeenSignal(row = {}) {
  const text = normalizeDropRadarText(`${row.reportStatus || row.report_status || ""} ${row.stockStatus || row.stock_status || ""} ${row.reportType || row.report_type || ""} ${row.quickReportType || ""} ${row.sourceText || row.source_text || ""} ${row.notes || ""}`);
  return (
    text.includes("stock seen") ||
    text.includes("vendor seen") ||
    text.includes("leftover stock") ||
    text.includes("restock") ||
    text.includes("in stock") ||
    text.includes("stock on shelf") ||
    text.includes("vendor stocking") ||
    text.includes("stocked") ||
    text.includes("confirmed purchase")
  );
}

function isEmptyOrNoStockSignal(row = {}) {
  const text = normalizeDropRadarText(`${row.reportStatus || row.report_status || ""} ${row.stockStatus || row.stock_status || ""} ${row.reportType || row.report_type || ""} ${row.sourceText || row.source_text || ""} ${row.notes || ""}`);
  return (
    text.includes("empty shelf") ||
    text.includes("still empty") ||
    text.includes("no stock") ||
    text.includes("no pokemon") ||
    text.includes("checked but nothing") ||
    text.includes("nothing found") ||
    text === "empty" ||
    text.includes(" empty ")
  );
}

export function isDropRadarConfirmedTrainingEntry(row = {}) {
  if (!row || row.shouldTrainPredictions === false) return false;
  if (isDropRadarCommunityGuess(row) || isDropRadarPlaceholderForecast(row) || isDropRadarRejectedOrDeleted(row)) return false;
  if (isEmptyOrNoStockSignal(row)) return false;
  if (!hasDropRadarStore(row) || !hasDropRadarDate(row)) return false;

  const source = normalizeDropRadarText(`${row.source || ""} ${row.sourceType || row.source_type || ""} ${row.proofSource || row.proof_source || ""}`);
  const confidence = normalizeDropRadarText(`${row.confidence || ""} ${row.confidenceLevel || row.confidence_level || ""} ${row.confidenceLabel || row.confidence_label || ""}`);
  const status = normalizeDropRadarText(`${row.status || ""} ${row.verificationStatus || row.verification_status || ""}`);
  const isManualTraining = source.includes("manual training restock") || source.includes("admin manual training");
  const isHistoricalIntel = isDropRadarHistoricalIntel(row);
  const hasStrongProof = source.includes("photo") || source.includes("receipt") || source.includes("trusted reporter") || source.includes("manual admin entry") || source.includes("manual shorthand");
  const isSubmittedRestockReport = (source.includes("user report") || source.includes("photo report")) && hasRestockSeenSignal(row) && !row.needsReview && !row.needs_review;
  const confidenceIsUsable = (
    row.verified === true ||
    confidence.includes("confirmed") ||
    confidence.includes("verified") ||
    confidence.includes("likely") ||
    status.includes("confirmed") ||
    status.includes("verified") ||
    isManualTraining ||
    isHistoricalIntel ||
    hasStrongProof ||
    isSubmittedRestockReport
  );
  return Boolean((hasRestockSeenSignal(row) || isManualTraining || isHistoricalIntel) && confidenceIsUsable);
}

export function dropRadarRecordKind(row = {}) {
  if (row.recordKind) return row.recordKind;
  if (row.eventType === "Predicted Drop Window" || row.predictionModel === "confirmed_history") return "predicted_window";
  if (isDropRadarCommunityGuess(row)) return "community_guess";
  if (isDropRadarPlaceholderForecast(row)) return "placeholder";
  const source = normalizeDropRadarText(`${row.source || ""} ${row.sourceType || row.source_type || ""} ${row.visibility || ""}`);
  if (source.includes("admin note") || source.includes("internal note")) return "admin_note";
  if (isDropRadarConfirmedTrainingEntry(row)) return "confirmed_restock";
  return "unknown";
}

export function dropRadarRecordLabel(row = {}) {
  return DROP_RADAR_RECORD_KIND_LABELS[dropRadarRecordKind(row)] || DROP_RADAR_RECORD_KIND_LABELS.unknown;
}

function parseDropRadarDate(rawDate = "", fallbackYear = 2026) {
  const value = String(rawDate || "").trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!match) return "";
  const month = Number(match[1]);
  const day = Number(match[2]);
  const yearRaw = match[3] ? Number(match[3]) : fallbackYear;
  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
  if (!month || !day || month > 12 || day > 31) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDropRadarTime(rawTime = "") {
  const value = String(rawTime || "").trim().toLowerCase();
  if (!value) return "";
  const match = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3] || "";
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getStoreName(store = {}) {
  return store.nickname || store.name || store.storeName || store.store_name || "";
}

function getStoreRetailer(store = {}) {
  return store.retailer || store.chain || store.storeGroup || store.store_group || "";
}

export function matchDropRadarStore(input = "", stores = []) {
  const normalizedInput = normalizeDropRadarText(input);
  const sortedAliases = [...DROP_RADAR_STORE_ALIASES].sort((a, b) => b.alias.length - a.alias.length);
  const alias = sortedAliases.find((candidate) => normalizedInput.startsWith(normalizeDropRadarText(candidate.alias)));
  const candidates = Array.isArray(stores) ? stores : [];
  if (alias) {
    const aliasStoreKey = normalizeDropRadarText(alias.storeName);
    const aliasRetailer = normalizeDropRadarText(alias.retailer);
    const matchedStore = candidates.find((store) => {
      const storeName = normalizeDropRadarText(getStoreName(store));
      const rawName = normalizeDropRadarText(store.name || "");
      const retailer = normalizeDropRadarText(getStoreRetailer(store));
      const aliases = [
        ...(Array.isArray(store.aliases) ? store.aliases : []),
        ...(Array.isArray(store.searchAliases) ? store.searchAliases : []),
        ...(Array.isArray(store.search_aliases) ? store.search_aliases : []),
      ].map(normalizeDropRadarText);
      return (
        storeName === aliasStoreKey ||
        rawName === aliasStoreKey ||
        aliases.includes(normalizeDropRadarText(alias.alias)) ||
        aliases.includes(aliasStoreKey)
      ) && (!aliasRetailer || retailer === aliasRetailer);
    });
    return {
      matched: Boolean(matchedStore),
      uncertain: !matchedStore,
      alias: alias.alias,
      store: matchedStore || { name: alias.storeName, nickname: alias.storeName, retailer: alias.retailer, chain: alias.retailer },
      consumedText: alias.alias,
    };
  }

  const matchedStore = candidates.find((store) => {
    const label = normalizeDropRadarText(`${getStoreName(store)} ${getStoreRetailer(store)} ${store.city || ""}`);
    return normalizedInput.startsWith(normalizeDropRadarText(getStoreName(store))) || (label && normalizedInput.startsWith(label));
  });
  return {
    matched: Boolean(matchedStore),
    uncertain: !matchedStore,
    alias: "",
    store: matchedStore || null,
    consumedText: matchedStore ? getStoreName(matchedStore) : "",
  };
}

export function parseDropRadarShorthand(input = "", stores = [], options = {}) {
  const fallbackYear = Number(options.year || 2026);
  const raw = String(input || "").trim();
  if (!raw) {
    return { ok: false, uncertain: true, error: "Enter a restock note first." };
  }

  const storeMatch = matchDropRadarStore(raw, stores);
  let remainder = raw;
  if (storeMatch.consumedText) {
    remainder = raw.slice(storeMatch.consumedText.length).trim();
  }

  const dateMatch = remainder.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/);
  const timeMatch = remainder.match(/\b(\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/i);
  const date = parseDropRadarDate(dateMatch?.[1] || "", fallbackYear);
  const time = parseDropRadarTime(timeMatch?.[1] || "");
  let productText = remainder
    .replace(dateMatch?.[0] || "", "")
    .replace(timeMatch?.[0] || "", "")
    .replace(/\b(restocked|restock|stocked|drop|dropped|had|has|pokemon)\b/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (!productText && /pokemon|restock|stocked/i.test(remainder)) productText = "Pokemon restock";

  const missing = [];
  if (!storeMatch.store) missing.push("store");
  if (!date) missing.push("date");
  if (!productText) missing.push("product/category");

  return {
    ok: missing.length === 0,
    uncertain: storeMatch.uncertain,
    missing,
    raw,
    store: storeMatch.store,
    storeName: getStoreName(storeMatch.store || {}) || "",
    retailer: getStoreRetailer(storeMatch.store || {}) || "",
    alias: storeMatch.alias,
    date,
    time,
    productCategory: productText || "Pokemon restock",
    notes: raw,
    confidence: storeMatch.uncertain ? "possible" : "confirmed",
    proofSource: "manual shorthand",
  };
}

function restockDayName(dateString = "") {
  const date = dateString ? new Date(`${String(dateString).slice(0, 10)}T00:00:00`) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

function restockTimeWindow(timeString = "") {
  const hour = Number(String(timeString || "").slice(0, 2));
  if (!Number.isFinite(hour)) return "";
  if (hour < 10) return "Open - 10 AM";
  if (hour < 12) return "10 AM - noon";
  if (hour < 15) return "Noon - 3 PM";
  if (hour < 18) return "3 PM - 6 PM";
  return "Evening";
}

function localDateKeyFromTimestamp(value = "") {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeKeyFromTimestamp(value = "") {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  return `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
}

function mostCommonValue(values = []) {
  const counts = values.filter(Boolean).reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || ["", 0];
}

function entryTimestamp(entry = {}) {
  const date = entry.date || entry.reportDate || entry.report_date || "";
  const time = entry.time || entry.reportTime || entry.report_time || "";
  const reportedAt = entry.observedAt || entry.observed_at || entry.reportedAt || entry.reported_at || entry.createdAt || entry.created_at || "";
  const raw = reportedAt || (date ? `${String(date).slice(0, 10)}T${time || "00:00"}` : "");
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.getTime() : 0;
}

function normalizeTrainingEntry(entry = {}, stores = []) {
  const storeId = entry.storeId || entry.store_id || "";
  const matchedStore = storeId ? stores.find((store) => String(store.id) === String(storeId)) : null;
  const store = matchedStore || {
    id: storeId,
    name: entry.storeName || entry.store_name || entry.storeAlias || entry.store_alias || "",
    nickname: entry.storeNickname || entry.nickname || entry.storeName || entry.store_name || entry.storeAlias || entry.store_alias || "",
    retailer: entry.retailer || entry.chain || "",
    chain: entry.retailer || entry.chain || "",
    city: entry.city || "",
  };
  const observedAt = entry.observedAt || entry.observed_at || entry.reportedAt || entry.reported_at || "";
  const observedDate = localDateKeyFromTimestamp(observedAt) || (observedAt ? String(observedAt).slice(0, 10) : "");
  const observedTime = localTimeKeyFromTimestamp(observedAt) || (observedAt ? String(observedAt).slice(11, 16) : "");
  const date = entry.date || entry.reportDate || entry.report_date || observedDate || "";
  const time = entry.time || entry.reportTime || entry.report_time || observedTime || "";
  return {
    ...entry,
    store,
    storeId: store.id || storeId || "",
    storeName: getStoreName(store) || entry.storeName || entry.storeAlias || "",
    retailer: getStoreRetailer(store) || entry.retailer || "",
    date,
    time,
    day: entry.day || restockDayName(date),
    timeWindow: entry.timeWindow || entry.time_window || restockTimeWindow(time),
    productCategory: entry.productCategory || entry.product_category || entry.rawProductText || entry.raw_product_text || entry.itemName || "Pokemon restock",
    shouldTrainPredictions: entry.shouldTrainPredictions !== false,
  };
}

export function buildDropRadarPredictions({ stores = [], reports = [], trainingRestocks = [], restockIntel = [], minEntries = 2 } = {}) {
  const reportTrainingRows = reports
    .filter(isDropRadarConfirmedTrainingEntry)
    .map((report) => ({
      ...report,
      sourceType: report.sourceType || report.source_type || "user_report",
      productCategory: report.itemName || report.productName || report.product_name || "Scout report",
      shouldTrainPredictions: true,
    }));

  const intelTrainingRows = restockIntel
    .filter(isDropRadarConfirmedTrainingEntry)
    .map((entry) => ({
      ...entry,
      storeName: entry.storeAlias || entry.storeName || entry.store_name || "",
      date: entry.date || entry.reportDate || "",
      time: entry.time || entry.reportTime || "",
      productCategory: entry.rawProductText || entry.productsMentioned?.join(", ") || entry.sourceText || "Historical restock intel",
    }));

  const rows = [
    ...trainingRestocks.filter(isDropRadarConfirmedTrainingEntry),
    ...reportTrainingRows,
    ...intelTrainingRows,
  ]
    .map((entry) => normalizeTrainingEntry(entry, stores))
    .filter((entry) => entry.shouldTrainPredictions && (entry.storeId || entry.storeName) && entry.date);

  const grouped = rows.reduce((acc, entry) => {
    const key = entry.storeId || normalizeDropRadarStoreKey(entry);
    acc[key] = acc[key] || [];
    acc[key].push(entry);
    return acc;
  }, {});

  return Object.entries(grouped).map(([key, entries]) => {
    const sorted = [...entries].sort((a, b) => entryTimestamp(b) - entryTimestamp(a));
    const latest = sorted[0] || {};
    const [commonDay, commonDayCount] = mostCommonValue(sorted.map((entry) => entry.day));
    const [commonWindow, commonWindowCount] = mostCommonValue(sorted.map((entry) => entry.timeWindow));
    const [commonProduct] = mostCommonValue(sorted.map((entry) => entry.productCategory));
    const trainingCount = sorted.length;
    const historicalCount = sorted.filter(isDropRadarHistoricalIntel).length;
    const patternStrength = trainingCount >= 5 ? "strong" : trainingCount >= 3 ? "developing" : "weak";
    const confidenceLabel = trainingCount < minEntries ? "Needs more data" : patternStrength === "strong" ? "High" : patternStrength === "developing" ? "Medium" : "Low";
    const confidenceKey = trainingCount < minEntries ? "needs-data" : patternStrength === "strong" ? "high" : patternStrength === "developing" ? "medium" : "low";
    const observationLabel = historicalCount === trainingCount && historicalCount > 0
      ? "historical restock observation"
      : historicalCount > 0
        ? "restock signal"
        : "confirmed restock";
    const nextLikelyWindow = commonDay && commonWindow ? `${commonDay}, ${commonWindow}` : commonDay || commonWindow || "Needs more data";
    const dataNeededMessage = trainingCount < minEntries ? `Low confidence: needs ${minEntries - trainingCount} more ${observationLabel}${minEntries - trainingCount === 1 ? "" : "s"} before predictions are reliable.` : "";
    const reason = dataNeededMessage || [
      `Based on ${trainingCount} ${observationLabel}${trainingCount === 1 ? "" : "s"} at this store`,
      commonDay ? `${commonDayCount} happened on ${commonDay}` : "",
      commonWindow ? `${commonWindowCount} fell in ${commonWindow}` : "",
    ].filter(Boolean).join("; ");
    return {
      id: `drop-radar-${key}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      recordKind: "predicted_window",
      eventType: "Predicted Drop Window",
      predictionModel: "confirmed_history",
      storeId: latest.storeId || "",
      store: latest.store || {},
      storeName: latest.storeName || "Store not selected",
      retailer: latest.retailer || "Retailer unknown",
      city: latest.store?.city || latest.city || "",
      lastConfirmedRestock: latest.date ? `${latest.date}${latest.time ? ` ${latest.time}` : ""}` : "",
      lastConfirmedRestockLabel: latest.date ? `${latest.date}${latest.time ? ` at ${latest.time}` : ""}` : "No dated restock yet",
      commonDay,
      commonTimeWindow: commonWindow,
      nextLikelyWindow,
      confidenceLabel,
      confidenceKey,
      patternStrength,
      trainingCount,
      dataNeededMessage,
      products: commonProduct ? [commonProduct] : [],
      reason,
      sourceLabel: historicalCount ? "Historical Scout import / restock history" : "Confirmed Scout/restock history",
      entries: sorted,
    };
  }).sort((a, b) => {
    if (b.trainingCount !== a.trainingCount) return b.trainingCount - a.trainingCount;
    return String(a.storeName).localeCompare(String(b.storeName));
  });
}

export function applyDropRadarReset(savedScoutData = {}, selectedOptions = {}, options = {}) {
  const full = Boolean(selectedOptions.full);
  const now = options.now || new Date().toISOString();
  const backup = {
    createdAt: now,
    reason: full ? "Full Drop Radar reset" : "Partial Drop Radar reset",
    counts: {
      restockIntel: savedScoutData.restockIntel?.length || 0,
      restockPatterns: savedScoutData.restockPatterns?.length || 0,
      manualRestockTraining: savedScoutData.manualRestockTraining?.length || 0,
      forecastWindows: savedScoutData.forecastWindows?.length || 0,
      predictions: savedScoutData.predictions?.length || 0,
    },
    restockIntel: savedScoutData.restockIntel || [],
    restockPatterns: savedScoutData.restockPatterns || [],
    manualRestockTraining: savedScoutData.manualRestockTraining || [],
    forecastWindows: savedScoutData.forecastWindows || [],
    predictions: savedScoutData.predictions || [],
  };
  const next = {
    ...savedScoutData,
    dropRadarBackups: [backup, ...(savedScoutData.dropRadarBackups || [])].slice(0, 5),
    dropRadarLastResetAt: now,
  };

  if (full || selectedOptions.predictionCache) {
    next.dropRadarPredictionCache = [];
    next.dropRadarPredictions = [];
  }
  if (full || selectedOptions.generatedPredictions) {
    next.restockPatterns = [];
    next.predictions = [];
    next.forecastWindows = [];
  }
  if (full || selectedOptions.historicalBackfill) {
    next.restockIntel = (next.restockIntel || []).filter((row) => !isDropRadarHistoricalIntel(row));
    next.dropRadarSeedDisabled = true;
  }
  if (full || selectedOptions.manualTraining) {
    next.manualRestockTraining = [];
    next.restockIntel = (next.restockIntel || []).filter((row) => !isDropRadarManualTraining(row));
  }
  if (full) {
    next.restockIntel = [];
    next.restockPatterns = [];
    next.manualRestockTraining = [];
    next.dropRadarPredictionCache = [];
    next.dropRadarPredictions = [];
    next.predictions = [];
    next.forecastWindows = [];
    next.dropRadarSeedDisabled = true;
  }
  return next;
}
