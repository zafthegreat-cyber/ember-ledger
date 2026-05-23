export const RETAILER_DROP_SOURCE_TYPES = [
  "official-api",
  "configured-api",
  "manual-watch",
  "admin-confirmed",
  "community-report",
  "unavailable",
];

export const RETAILER_DROP_SOURCE_STATUSES = [
  "connected",
  "missing-key",
  "manual-only",
  "unavailable",
  "error",
];

export const RETAILER_DROP_CONFIDENCE_LEVELS = [
  "confirmed",
  "likely",
  "community",
  "manual",
  "unavailable",
];

export const RETAILER_DROP_SOURCE_LABELS = {
  "official-api": "Official API",
  "configured-api": "Official API",
  "admin-confirmed": "Admin Confirmed",
  "community-report": "Community Report",
  "manual-watch": "Manual Watch",
  unavailable: "Source Not Connected",
  trusted_scout: "Trusted Scout Report",
};

export const RETAILER_DROP_CONFIDENCE_LABELS = {
  confirmed: "Confirmed",
  likely: "Likely",
  community: "Community Report",
  manual: "Manual Watch",
  unavailable: "Source Not Connected",
};

export const RETAILER_DROP_CALENDAR_EVENT_TYPES = [
  "Online Drop Watch",
  "Confirmed Online Drop",
  "Store Availability Watch",
  "Admin Confirmed Drop",
  "Community Reported Drop",
  "Manual Watch Reminder",
];

const RETAILER_SOURCE_SEED = [
  {
    retailerName: "Best Buy",
    sourceType: "official-api",
    optionalEnvKeys: ["BEST_BUY_API_KEY"],
    supportedSignals: ["onlineAvailability", "storeAvailability", "price", "retailerSku", "productUrl"],
    notes: "API-capable when an allowed Best Buy connector/key is configured. No retailer page scraping.",
  },
  { retailerName: "Target", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Walmart", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Pokemon Center", displayName: "Pokemon Center", aliases: ["Pokemon Center"], supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "onlineAvailability"] },
  { retailerName: "GameStop", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "onlineAvailability", "storeAvailability"] },
  { retailerName: "Barnes & Noble", aliases: ["B&N"], supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Costco", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Sam's Club", aliases: ["Sams Club"], supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "BJ's Wholesale Club", aliases: ["BJ's", "BJs"], supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Walgreens", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "CVS", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Dollar General", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Family Dollar", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Dollar Tree", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Five Below", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "DICK'S Sporting Goods", aliases: ["Dicks Sporting Goods"], supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Hobby Lobby", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Michaels", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Kohl's", aliases: ["Kohls"], supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Hot Topic", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "onlineAvailability", "storeAvailability"] },
  { retailerName: "BoxLunch", aliases: ["Box Lunch"], supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "onlineAvailability", "storeAvailability"] },
  { retailerName: "Meijer", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Kroger", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Publix", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Wegmans", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Local card shops", sourceType: "community-report", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Local hobby/game stores", sourceType: "community-report", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed", "storeAvailability"] },
  { retailerName: "Other/manual retailer", sourceType: "manual-watch", supportedSignals: ["manualWatch", "communityReport", "adminConfirmed"] },
];

export function normalizeRetailerDropText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/pok[e\u00e9]mon/g, "pokemon")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function retailerId(value = "") {
  return normalizeRetailerDropText(value)
    .replace(/\band\b/g, "")
    .replace(/\s+/g, "-")
    .replace(/(^-|-$)/g, "") || "unknown-retailer";
}

function envHasAnyKey(env = {}, keys = []) {
  return keys.some((key) => Boolean(env?.[key]));
}

export function normalizeRetailerSourceProfile(profile = {}, { env = {}, checkedAt = "" } = {}) {
  const sourceType = RETAILER_DROP_SOURCE_TYPES.includes(profile.sourceType) ? profile.sourceType : "manual-watch";
  const optionalEnvKeys = Array.isArray(profile.optionalEnvKeys) ? profile.optionalEnvKeys : [];
  const hasCredentials = envHasAnyKey(env, optionalEnvKeys);
  const apiBacked = sourceType === "official-api" || sourceType === "configured-api";
  const status = apiBacked
    ? hasCredentials
      ? "connected"
      : "missing-key"
    : sourceType === "unavailable"
      ? "unavailable"
      : "manual-only";

  return {
    retailerId: profile.retailerId || retailerId(profile.retailerName || profile.displayName),
    retailerName: profile.displayName || profile.retailerName || "Other/manual retailer",
    sourceType,
    connected: status === "connected",
    status,
    supportedSignals: profile.supportedSignals || ["manualWatch", "communityReport"],
    lastCheckedAt: checkedAt || "",
    optionalEnvKeys,
    aliases: profile.aliases || [],
    notes: profile.notes || "Manual/community watch only until an allowed source is configured.",
  };
}

export function buildRetailerSourceProfiles({ env = {}, checkedAt = "" } = {}) {
  return RETAILER_SOURCE_SEED.map((profile) => normalizeRetailerSourceProfile(profile, { env, checkedAt }));
}

export const RETAILER_DROP_SOURCE_PROFILES = buildRetailerSourceProfiles();

export function findRetailerSourceProfile(retailer = "", profiles = RETAILER_DROP_SOURCE_PROFILES) {
  const normalized = normalizeRetailerDropText(retailer);
  return profiles.find((profile) => {
    const names = [profile.retailerName, profile.retailerId, ...(profile.aliases || [])];
    return names.some((name) => normalizeRetailerDropText(name) === normalized || normalized.includes(normalizeRetailerDropText(name)));
  }) || profiles.find((profile) => profile.retailerId === "other-manual-retailer") || null;
}

export function normalizeRetailerDropConfidence(value = "", context = {}) {
  const normalized = normalizeRetailerDropText(value);
  const sourceType = context.sourceType || "";
  const sourceAllowsConfirmed = sourceType === "official-api" || sourceType === "configured-api" || sourceType === "admin-confirmed";
  if (/confirmed|in stock|available/.test(normalized) && sourceAllowsConfirmed) return "confirmed";
  if (sourceType === "community-report") return "community";
  if (sourceType === "manual-watch") return "manual";
  if (/likely|limited|low stock|pickup/.test(normalized)) return "likely";
  if (/community|scout|report|trusted/.test(normalized)) return "community";
  if (/manual|watch|reminder/.test(normalized)) return "manual";
  return "unavailable";
}

export function retailerDropSourceLabel(drop = {}) {
  const sourceType = drop.sourceType || "";
  if (drop.trustedScout || /trusted scout/i.test(`${drop.source || ""} ${drop.sourceLabel || ""}`)) return RETAILER_DROP_SOURCE_LABELS.trusted_scout;
  return RETAILER_DROP_SOURCE_LABELS[sourceType] || RETAILER_DROP_SOURCE_LABELS.unavailable;
}

export function normalizeRetailerDrop(raw = {}, { profiles = RETAILER_DROP_SOURCE_PROFILES, checkedAt = "" } = {}) {
  const profile = findRetailerSourceProfile(raw.retailer || raw.retailerName || raw.sourceRetailer || "", profiles);
  const sourceType = RETAILER_DROP_SOURCE_TYPES.includes(raw.sourceType) ? raw.sourceType : profile?.sourceType || "manual-watch";
  const confidence = RETAILER_DROP_CONFIDENCE_LEVELS.includes(raw.confidence)
    ? raw.confidence
    : normalizeRetailerDropConfidence(raw.confidence || raw.onlineAvailability || raw.storeAvailability || raw.sourceStatus || sourceType, { sourceType });
  const retailer = profile?.retailerName || raw.retailer || raw.retailerName || "Other/manual retailer";
  const price = Number(raw.price ?? raw.salePrice ?? raw.currentPrice);
  return {
    dropId: raw.dropId || raw.id || `drop-${retailerId(retailer)}-${retailerId(raw.productName || raw.retailerSku || "watch")}`,
    retailer,
    retailerId: profile?.retailerId || retailerId(retailer),
    productName: raw.productName || raw.name || "",
    retailerSku: raw.retailerSku || raw.sku || "",
    upc: raw.upc || raw.UPC || "",
    productUrl: raw.productUrl || raw.url || "",
    imageUrl: raw.imageUrl || raw.productImage || "",
    price: Number.isFinite(price) ? price : null,
    onlineAvailability: raw.onlineAvailability || raw.availability || "",
    storeAvailability: raw.storeAvailability || raw.pickupAvailability || "",
    store: raw.store || raw.storeName || "",
    location: raw.location || raw.city || raw.zip || "",
    lastSeenInStockAt: raw.lastSeenInStockAt || raw.lastSeenAt || "",
    lastCheckedAt: raw.lastCheckedAt || checkedAt || "",
    confidence,
    confidenceLabel: RETAILER_DROP_CONFIDENCE_LABELS[confidence] || RETAILER_DROP_CONFIDENCE_LABELS.unavailable,
    sourceType,
    source: raw.source || profile?.retailerName || retailer,
    sourceLabel: raw.sourceLabel || retailerDropSourceLabel({ ...raw, sourceType }),
    visibility: raw.visibility || "public",
    notes: raw.notes || "",
  };
}

export function retailerDropCalendarEventType(drop = {}) {
  const confidence = drop.confidence || "unavailable";
  const sourceType = drop.sourceType || "";
  const hasStoreAvailability = Boolean(drop.storeAvailability || drop.store || drop.location);
  if (sourceType === "admin-confirmed") return "Admin Confirmed Drop";
  if (confidence === "confirmed") return "Confirmed Online Drop";
  if (sourceType === "community-report" || confidence === "community") return "Community Reported Drop";
  if (sourceType === "manual-watch" || confidence === "manual") return "Manual Watch Reminder";
  if (hasStoreAvailability) return "Store Availability Watch";
  return "Online Drop Watch";
}

export function retailerDropToCalendarEvent(rawDrop = {}, options = {}) {
  const drop = rawDrop.confidenceLabel ? rawDrop : normalizeRetailerDrop(rawDrop, options);
  const dateKey = String(drop.lastSeenInStockAt || drop.lastCheckedAt || options.todayKey || "").slice(0, 10);
  const eventType = retailerDropCalendarEventType(drop);
  return {
    id: `retailer-drop-${drop.dropId || options.index || retailerId(`${drop.retailer}-${drop.productName}`)}`,
    dateKey,
    title: drop.productName || `${drop.retailer} watch`,
    subtitle: `${eventType} - ${drop.sourceLabel || "Source Not Connected"}`,
    eventType,
    locationType: drop.store || drop.location ? "store" : "online",
    retailer: drop.retailer,
    storeName: drop.store || "",
    city: drop.location || "",
    layerKeys: [
      drop.store || drop.location ? "localRestocks" : "onlineRestocks",
      drop.confidence === "confirmed" ? "confirmedRestocks" : "",
      drop.confidence === "community" ? "userGuesses" : "appPredictions",
      drop.sourceType === "admin-confirmed" ? "adminInternal" : "",
      "retailDrops",
    ].filter(Boolean),
    timeLabel: drop.lastSeenInStockAt ? "Seen in stock" : drop.lastCheckedAt ? "Last checked" : "Watch time not set",
    confidenceKey: drop.confidence === "confirmed" ? "confirmed" : drop.confidence === "likely" ? "likely" : drop.confidence === "community" ? "rumored" : "predicted",
    confidenceLabel: drop.confidenceLabel,
    sourceLabel: drop.sourceLabel,
    source: drop.source,
    sourceUrl: drop.productUrl,
    imageUrl: drop.imageUrl,
    products: [drop.productName].filter(Boolean),
    reason: drop.notes || "Retailer source framework keeps this as watch data until a permitted source confirms availability.",
    basisSummary: `${drop.sourceLabel || "Source Not Connected"} / ${drop.confidenceLabel || "Unavailable"}`,
    visibility: drop.visibility || "public",
    adminOnly: drop.visibility === "admin_only" || drop.visibility === "private_admin",
    verified: drop.confidence === "confirmed",
    sortWeight: drop.confidence === "confirmed" ? 0 : 2,
  };
}

export function summarizeRetailerSources(profiles = []) {
  return profiles.reduce((summary, profile) => {
    summary.total += 1;
    summary[profile.status] = (summary[profile.status] || 0) + 1;
    if (profile.connected) summary.connectedRetailers.push(profile.retailerName);
    if (profile.status === "manual-only") summary.manualOnlyRetailers.push(profile.retailerName);
    if (profile.status === "missing-key") summary.missingCredentialRetailers.push(profile.retailerName);
    for (const key of profile.optionalEnvKeys || []) summary.optionalEnvKeys.add(key);
    return summary;
  }, {
    total: 0,
    connected: 0,
    "missing-key": 0,
    "manual-only": 0,
    unavailable: 0,
    error: 0,
    connectedRetailers: [],
    manualOnlyRetailers: [],
    missingCredentialRetailers: [],
    optionalEnvKeys: new Set(),
  });
}
