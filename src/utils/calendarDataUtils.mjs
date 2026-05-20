import { buildDropRadarPredictions } from "./dropRadarUtils.mjs";

export const CALENDAR_CONFIDENCE_LABELS = {
  confirmed: "Confirmed",
  likely: "Likely",
  rumored: "Rumored/Unconfirmed",
  predicted: "Predicted",
  unavailable: "Unavailable",
};

export function normalizeCalendarText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/pok[e\u00e9]mon/g, "pokemon")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function calendarConfidenceKey(value = "") {
  const normalized = normalizeCalendarText(value);
  if (/confirmed|official|verified/.test(normalized)) return "confirmed";
  if (/likely|medium|high/.test(normalized)) return "likely";
  if (/rumor|rumoured|unconfirmed|guess|low/.test(normalized)) return "rumored";
  if (/predict|watch|possible|needs data/.test(normalized)) return "predicted";
  return "unavailable";
}

export function calendarConfidenceLabel(value = "") {
  return CALENDAR_CONFIDENCE_LABELS[calendarConfidenceKey(value)] || CALENDAR_CONFIDENCE_LABELS.unavailable;
}

export function inferReleaseEventType(release = {}) {
  const text = normalizeCalendarText(`${release.eventType || ""} ${release.productType || ""} ${release.title || ""} ${release.productName || ""}`);
  if (text.includes("preorder")) return "Preorder Window";
  if (text.includes("expansion") || text.includes("set release") || text.includes("booster display")) return "Set Release";
  return "Product Release";
}

export function normalizeReleaseCalendarEvent(release = {}, catalogProducts = []) {
  const title = release.title || release.productName || release.name || "";
  const dateKey = String(release.releaseDate || release.date || release.launchDate || "").slice(0, 10);
  const search = normalizeCalendarText(`${title} ${release.setName || ""}`);
  const matchedProduct = release.catalogProductId
    ? catalogProducts.find((product) => String(product.id) === String(release.catalogProductId))
    : catalogProducts.find((product) => {
        const productText = normalizeCalendarText(`${product.productName || product.name || ""} ${product.setName || product.expansion || product.productLine || ""}`);
        return productText && (productText === search || productText.includes(search) || search.includes(productText));
      });
  const confidenceKey = calendarConfidenceKey(release.confidence || release.sourceConfidence || "confirmed");
  return {
    id: release.id || `release-${dateKey}-${normalizeCalendarText(title).replace(/\s+/g, "-")}`,
    dateKey,
    title,
    productName: release.productName || title,
    subtitle: release.subtitle || inferReleaseEventType(release),
    eventType: inferReleaseEventType(release),
    locationType: "release",
    category: release.category || release.productType || matchedProduct?.productType || "",
    productType: release.productType || matchedProduct?.productType || "",
    products: [release.productName || title].filter(Boolean),
    productImage: release.productImage || release.imageUrl || matchedProduct?.imageUrl || matchedProduct?.photoUrl || "",
    imageUrl: release.productImage || release.imageUrl || matchedProduct?.imageUrl || matchedProduct?.photoUrl || "",
    catalogProductId: release.catalogProductId || matchedProduct?.id || "",
    sourceLabel: release.sourceLabel || release.source || "Official Pokemon release data",
    sourceUrl: release.sourceUrl || release.url || "",
    source: release.source || "Pokemon.com",
    confidenceKey,
    confidenceLabel: confidenceKey === "confirmed" ? "Confirmed Release" : calendarConfidenceLabel(confidenceKey),
    verified: confidenceKey === "confirmed",
    layerKeys: release.layerKeys || ["pokemonReleases", "expansionReleases"],
    timeLabel: release.timeLabel || "Release day",
    notes: release.notes || "",
    reason: release.notes || "Official Pokemon release date.",
    basisSummary: release.sourceUrl ? `Source: ${release.sourceUrl}` : "Official Pokemon release date.",
    visibility: release.visibility || "public",
    reportable: false,
    sortWeight: release.sortWeight ?? 4,
  };
}

export function normalizeDropCalendarEvent(drop = {}) {
  const confidenceKey = drop.confidenceKey || calendarConfidenceKey(drop.confidence || drop.patternStrength || "predicted");
  const isConfirmed = confidenceKey === "confirmed" || drop.eventType === "Confirmed Restock";
  return {
    id: drop.id || `drop-${normalizeCalendarText(drop.storeName || drop.store || "store").replace(/\s+/g, "-")}-${drop.dateKey || drop.date || "watch"}`,
    dateKey: String(drop.dateKey || drop.date || "").slice(0, 10),
    dateRange: drop.dateRange || "",
    title: drop.storeName || drop.store || "Store watch",
    subtitle: drop.subtitle || (isConfirmed ? "Confirmed Restock" : "Predicted Drop Window"),
    eventType: isConfirmed ? "Confirmed Restock" : "Predicted Drop Window",
    locationType: drop.locationType || "store",
    store: drop.store || null,
    storeName: drop.storeName || drop.store || "",
    retailer: drop.retailer || "",
    storeNickname: drop.storeNickname || drop.nickname || drop.storeName || "",
    city: drop.city || "",
    region: drop.region || "",
    address: drop.address || "",
    layerKeys: drop.layerKeys || ["localRestocks", isConfirmed ? "retailDrops" : "appPredictions"],
    timeLabel: drop.timeWindow || drop.timeLabel || "Watch window unknown",
    confidenceKey,
    confidenceLabel: isConfirmed ? "Confirmed Restock" : drop.confidenceLabel || "Predicted",
    patternStrength: drop.patternStrength || "",
    trainingCount: Number(drop.trainingCount || drop.supportingReportCount || 0),
    supportingReportCount: Number(drop.supportingReportCount || drop.trainingCount || 0),
    supportingGuessCount: Number(drop.supportingGuessCount || 0),
    lastConfirmedReportLabel: drop.lastConfirmedRestock || drop.lastConfirmedReportLabel || "",
    sourceLabel: drop.sourceLabel || drop.source || "Scout reports / Drop Radar",
    source: drop.source || "Scout reports / Drop Radar",
    products: drop.products || [],
    reason: drop.reason || drop.dataNeededMessage || "Prediction uses available Scout reports and training restocks.",
    basisSummary: drop.basisSummary || `${Number(drop.trainingCount || 0)} training restock${Number(drop.trainingCount || 0) === 1 ? "" : "s"} used`,
    visibility: drop.visibility || "public",
    adminOnly: Boolean(drop.adminOnly || drop.visibility === "admin_only" || drop.visibility === "private_admin"),
    notes: drop.notes || "",
    reportable: drop.reportable !== false,
    verified: isConfirmed,
    sortWeight: isConfirmed ? 0 : 1,
  };
}

export function buildDropCalendarEvents({ stores = [], reports = [], trainingRestocks = [], restockIntel = [], todayKey = "", addDays = null } = {}) {
  const predictions = buildDropRadarPredictions({ stores, reports, trainingRestocks, restockIntel });
  return predictions.map((prediction) => {
    const dayOffset = Number.isFinite(Number(prediction.dayDistance)) ? Number(prediction.dayDistance) : 7;
    const dateKey = todayKey && typeof addDays === "function" ? addDays(todayKey, Math.min(Math.max(dayOffset, 0), 7)) : todayKey;
    return normalizeDropCalendarEvent({
      ...prediction,
      dateKey,
      store: prediction.store,
      timeWindow: prediction.nextLikelyWindow,
      source: "Scout reports / admin training",
      sourceLabel: "Scout reports / admin training",
      visibility: prediction.confidenceKey === "needs-data" ? "admin_only" : "public",
      adminOnly: prediction.confidenceKey === "needs-data",
    });
  });
}

export function filterCalendarEventsForViewer(events = [], { admin = false } = {}) {
  return events.filter((event) => {
    if (event.adminOnly || event.visibility === "admin_only" || event.visibility === "private_admin") return admin;
    return true;
  });
}
