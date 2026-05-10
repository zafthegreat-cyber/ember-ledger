import { useEffect, useMemo, useRef, useState } from "react";
import {
  getStores,
  createStore,
  updateStore,
  deleteStore,
  getReports,
  createReport,
  updateReport,
  deleteReport,
  getTrackedItems,
  createTrackedItem,
  updateTrackedItem,
  deleteTrackedItem,
} from "../api";
import SmartCatalogSearchBox from "../components/SmartCatalogSearchBox";
import OverflowMenu from "../components/OverflowMenu";
import { getStoreGroup, normalizeStoreGroup, STORE_GROUP_ORDER } from "../utils/storeGroupingUtils";
import { dedupeStoresByChainAddress, flagStoreImportIssues, normalizeImportedStore, parseStoreCsv } from "../utils/storeImportUtils";
import { storeMatchesSearch, sortStores } from "../utils/storeSearchUtils";
import { buildSuggestedRoute, confidenceLabel, explainRouteChoice, numericDistance } from "../utils/routeUtils";
import { SUGGESTION_TYPES, submitSuggestion } from "../utils/suggestionReviewUtils";
import { sanitizeScoutLocalData } from "../utils/betaDataCleanup";
import { VIRGINIA_REGIONS } from "../data/storeGroups";
import { VIRGINIA_STORES_SEED, VIRGINIA_STORE_SEED_STATUS } from "../data/virginiaStoresSeed";
import { BEST_BUY_ALERT_TYPES, BEST_BUY_MOCK_PRODUCTS, BEST_BUY_NIGHTLY_DEFAULTS, BEST_BUY_STOCK_STATUSES } from "../data/bestBuyStockSeed";
import { SCOUT_CONFIDENCE_LEVELS, SCOUT_HISTORICAL_INTEL_SEED, SCOUT_SOURCE_TYPES, SCOUT_STORE_ALIASES, SCOUT_VISIBILITY_LEVELS, buildScoutRestockPatterns } from "../data/scoutRestockIntelSeed";
import {
  cacheBestBuyStockResult,
  checkBestBuyOnlineAvailability,
  checkBestBuyStoreAvailability,
  createBestBuyStockAlert,
  createTidepoolReportFromBestBuyAvailability,
  generateNightlyBestBuyStockReport,
  normalizeBestBuyStockResult,
  pullBestBuyStockData,
  saveBestBuyStockHistory,
  sendNightlyBestBuyStockReport,
  updateStoreStockFromBestBuy,
} from "../services/bestBuyStockService";

const BETA_LOCAL_SCOUT = true;
const SCOUT_STORAGE_KEY = "et-tcg-beta-scout";
const AUTO_OPEN_DROP_WEBSITE_STORAGE_KEY = "autoOpenDropWebsite";
const LOCAL_SCOUT_USER_ID = "local-beta-scout";

const TIDEPOOL_REPORT_TYPES = [
  "Restock sighting",
  "Product sighting",
  "Nothing in stock",
  "Store limit update",
  "Price/deal sighting",
  "Online drop alert",
  "Store condition/update",
  "General tip",
];

const TIDEPOOL_FILTERS = [
  "Latest",
  "Nearby",
  "Verified",
  "Favorite Stores",
  "Online Drops",
  "Deals",
  "Watchlist Items",
  "High Confidence",
  "Needs Verification",
  "My Reports",
];

const TIDEPOOL_EVENT_TYPES = [
  "Kid-friendly Pokemon meetup",
  "Pack giveaway",
  "Kids pack pickup",
  "Trade day",
  "Learn-to-play event",
  "Card sorting/collecting event",
  "Donation drive",
  "Community sale",
  "Whatnot/live stream event",
  "Local shop event",
  "Restock meetup",
  "Other",
];

const TIDEPOOL_EVENT_FILTERS = [
  "Upcoming",
  "Nearby",
  "Kid-Friendly",
  "Giveaways",
  "Donation Drives",
  "Trade Day",
  "Online",
  "Verified Only",
  "My Events",
];

const ROUTE_GOALS = [
  "Fastest route",
  "Highest restock chance",
  "Best value route",
  "Most reports today",
  "Closest stores first",
  "Custom filters",
];

const BEST_BUY_API_ENV_VARS = [
  "BEST_BUY_API_KEY",
  "BEST_BUY_API_BASE_URL",
  "BEST_BUY_STOCK_SYNC_ENABLED",
];
const SCOUT_LIST_PAGE_SIZE = 12;

function scoutPageCount(totalCount, pageSize = SCOUT_LIST_PAGE_SIZE) {
  return Math.max(1, Math.ceil(Number(totalCount || 0) / Math.max(1, Number(pageSize || SCOUT_LIST_PAGE_SIZE))));
}

function clampScoutPage(page, pageCount) {
  return Math.min(Math.max(1, Number(page || 1)), Math.max(1, Number(pageCount || 1)));
}

function getScoutPagedItems(items = [], page = 1, pageSize = SCOUT_LIST_PAGE_SIZE) {
  const pageCount = scoutPageCount(items.length, pageSize);
  const currentPage = clampScoutPage(page, pageCount);
  const startIndex = (currentPage - 1) * pageSize;
  return {
    items: items.slice(startIndex, startIndex + pageSize),
    page: currentPage,
    pageCount,
    start: items.length ? startIndex + 1 : 0,
    end: Math.min(startIndex + pageSize, items.length),
    total: items.length,
  };
}

function makeScoutId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const STATEWIDE_SEED_STORES = VIRGINIA_STORES_SEED;

function createDefaultScoutProfile() {
  return {
    userId: LOCAL_SCOUT_USER_ID,
    displayName: "Local Scout",
    trustScore: 72,
    verifiedReportCount: 0,
    rejectedReportCount: 0,
    disputedReportCount: 0,
    helpfulVotes: 0,
    reportStreak: 0,
    rewardPoints: 0,
    badgeLevel: "New Scout",
    cooldownUntil: "",
    warningCount: 0,
    lastReportDate: "",
  };
}

function createDefaultAlertSettings() {
  return {
    enabled: true,
    radiusMiles: 15,
    favoriteStoresOnly: false,
    watchlistAlerts: true,
    onlineDropAlerts: false,
    autoOpenDropWebsite: getAutoOpenDropWebsitePreference(),
    verifiedOnly: false,
    quietHours: false,
  };
}

function getAutoOpenDropWebsitePreference() {
  try {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(AUTO_OPEN_DROP_WEBSITE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function getDropWebsiteUrl(drop = {}) {
  const url = drop.url || drop.productUrl || drop.product_url || drop.sourceUrl || drop.source_url || drop.link || "";
  if (url) return url;
  const sku = drop.bestBuySku || drop.best_buy_sku || drop.sku || "";
  if (sku) return `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(sku)}`;
  return "https://www.bestbuy.com/";
}

function makeTidepoolReport(overrides = {}) {
  const now = new Date().toISOString();
  const hasPhoto = Boolean(overrides.photoUrl);
  const verificationStatus = overrides.verificationStatus || "pending";
  return {
    reportId: overrides.reportId || makeScoutId("tidepool"),
    userId: overrides.userId || LOCAL_SCOUT_USER_ID,
    displayName: overrides.displayName || "Verified Scout",
    anonymous: Boolean(overrides.anonymous),
    storeId: overrides.storeId || "",
    storeName: overrides.storeName || "Online / Unknown store",
    catalogItemId: overrides.catalogItemId || "",
    productName: overrides.productName || "",
    reportType: overrides.reportType || "General tip",
    reportText: overrides.reportText || "",
    photoUrl: overrides.photoUrl || "",
    quantitySeen: overrides.quantitySeen || "",
    price: overrides.price || "",
    purchaseLimit: overrides.purchaseLimit || "",
    reportTime: overrides.reportTime || now,
    city: overrides.city || "",
    state: overrides.state || "VA",
    zip: overrides.zip || "",
    distanceMiles: overrides.distanceMiles || "",
    verificationStatus,
    confidenceScore: overrides.confidenceScore ?? (verificationStatus === "verified" ? 82 : hasPhoto ? 70 : 48),
    verifiedByCount: overrides.verifiedByCount || 0,
    disputedByCount: overrides.disputedByCount || 0,
    helpfulVotes: overrides.helpfulVotes || 0,
    sourceType: overrides.sourceType || (hasPhoto ? "photo" : "user"),
    favoriteStore: Boolean(overrides.favoriteStore),
    watchlistItem: Boolean(overrides.watchlistItem),
    lastUpdated: overrides.lastUpdated || now,
  };
}

function makeTidepoolEvent(overrides = {}) {
  const now = new Date().toISOString();
  return {
    eventId: overrides.eventId || makeScoutId("event"),
    userId: overrides.userId || LOCAL_SCOUT_USER_ID,
    eventTitle: overrides.eventTitle || "",
    eventType: overrides.eventType || "Other",
    eventDescription: overrides.eventDescription || "",
    hostName: overrides.hostName || overrides.organizerName || "Community Host",
    organizerName: overrides.organizerName || overrides.hostName || "Community Host",
    locationName: overrides.locationName || "",
    address: overrides.address || "",
    city: overrides.city || "",
    state: overrides.state || "VA",
    zip: overrides.zip || "",
    onlineEvent: Boolean(overrides.onlineEvent),
    eventLink: overrides.eventLink || "",
    startDate: overrides.startDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    startTime: overrides.startTime || "10:00",
    endDate: overrides.endDate || "",
    endTime: overrides.endTime || "",
    kidFriendly: overrides.kidFriendly !== undefined ? Boolean(overrides.kidFriendly) : true,
    freeEvent: overrides.freeEvent !== undefined ? Boolean(overrides.freeEvent) : true,
    cost: overrides.cost || "",
    donationAccepted: Boolean(overrides.donationAccepted),
    donationDetails: overrides.donationDetails || "",
    itemsProvided: overrides.itemsProvided || "",
    ageRange: overrides.ageRange || "",
    rsvpEnabled: overrides.rsvpEnabled !== undefined ? Boolean(overrides.rsvpEnabled) : true,
    attendeeCount: Number(overrides.attendeeCount || 0),
    maxAttendees: overrides.maxAttendees || "",
    eventStatus: overrides.eventStatus || "pending",
    verificationStatus: overrides.verificationStatus || "pending",
    sourceType: overrides.sourceType || "user",
    saved: Boolean(overrides.saved),
    interested: Boolean(overrides.interested),
    reported: Boolean(overrides.reported),
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
  };
}

function getReportDate(report) {
  return report.reportDate || report.report_date || report.date || "";
}

function getReportTime(report) {
  return report.reportTime || report.report_time || report.time || "";
}

function getReportStoreId(report) {
  return report.storeId || report.store_id || "";
}

function dayName(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { weekday: "long" });
}

function getMostCommon(values) {
  const counts = values.filter(Boolean).reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || ["", 0];
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "linear-gradient(180deg, #fff7ed 0%, #fef3c7 45%, #f0fdfa 100%)",
    padding: "10px",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: "#0f172a",
  },
  shell: {
    width: "min(100%, 920px)",
    maxWidth: "920px",
    margin: "0 auto",
    display: "grid",
    gap: "14px",
  },
  hero: {
    background: "linear-gradient(135deg, #2a2522 0%, #7c2d12 50%, #0f766e 100%)",
    color: "#fff",
    borderRadius: "20px",
    padding: "18px",
    boxShadow: "0 20px 50px rgba(15, 23, 42, 0.18)",
  },
  heroTitle: {
    margin: 0,
    fontSize: "30px",
    fontWeight: 800,
    letterSpacing: "0",
  },
  heroSub: {
    marginTop: "8px",
    marginBottom: 0,
    color: "rgba(255,255,255,0.82)",
    fontSize: "16px",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "12px",
    marginTop: "20px",
  },
  statCard: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "16px",
    padding: "12px",
    boxShadow: "0 8px 20px rgba(15, 23, 42, 0.06)",
  },
  statLabel: {
    fontSize: "12px",
    color: "#64748b",
    marginBottom: "6px",
  },
  statValue: {
    fontSize: "18px",
    fontWeight: 800,
    color: "#0f172a",
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
    gap: "14px",
    alignItems: "start",
  },
  col: {
    display: "grid",
    gap: "20px",
  },
  card: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "14px",
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.08)",
    border: "1px solid #e5e7eb",
  },
  sectionTitle: {
    margin: "0 0 14px 0",
    fontSize: "19px",
    fontWeight: 800,
    color: "#111827",
  },
  formGrid: {
    display: "grid",
    gap: "10px",
  },
  input: {
    width: "100%",
    minHeight: "46px",
    padding: "12px 14px",
    borderRadius: "14px",
    border: "1px solid #d1d5db",
    outline: "none",
    fontSize: "14px",
    background: "#fff",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    minHeight: "88px",
    padding: "12px 14px",
    borderRadius: "14px",
    border: "1px solid #d1d5db",
    outline: "none",
    fontSize: "16px",
    background: "#fff",
    minHeight: "90px",
    resize: "vertical",
    boxSizing: "border-box",
  },
  buttonPrimary: {
    background: "linear-gradient(135deg, #f97316 0%, #0f766e 100%)",
    color: "#fff",
    border: "none",
    borderRadius: "14px",
    minHeight: "46px",
    padding: "12px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  buttonSoft: {
    background: "#fff7ed",
    color: "#2a2522",
    border: "1px solid #fed7aa",
    borderRadius: "12px",
    minHeight: "44px",
    padding: "10px 12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  buttonDanger: {
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
    borderRadius: "12px",
    minHeight: "44px",
    padding: "10px 12px",
    fontWeight: 700,
    cursor: "pointer",
  },
  row: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginTop: "10px",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
    border: "1px solid #e5e7eb",
    background: "#f8fafc",
  },
  badgeFound: {
    background: "#ecfdf5",
    border: "1px solid #a7f3d0",
    color: "#047857",
  },
  badgeNeutral: {
    background: "#f8fafc",
    border: "1px solid #e5e7eb",
    color: "#334155",
  },
  listCard: {
    border: "1px solid #e5e7eb",
    borderRadius: "18px",
    padding: "14px",
    marginBottom: "12px",
    background: "#fff",
  },
  reportGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
    gap: "12px",
  },
  calloutCard: {
    border: "1px solid #bae6fd",
    borderRadius: "16px",
    padding: "14px",
    marginBottom: "12px",
    background: "linear-gradient(135deg, #f0f9ff 0%, #fff7ed 100%)",
  },
  alertCard: {
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "10px",
    background: "#ffffff",
    display: "grid",
    gap: "6px",
  },
  toggleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "14px",
    padding: "12px 0",
    borderBottom: "1px solid #f1f5f9",
  },
  switchButton: {
    width: "48px",
    minWidth: "48px",
    height: "28px",
    borderRadius: "999px",
    border: "1px solid #cbd5e1",
    padding: "3px",
    background: "#e2e8f0",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
  switchButtonOn: {
    background: "#0f766e",
    borderColor: "#0f766e",
    justifyContent: "flex-end",
  },
  switchKnob: {
    width: "20px",
    height: "20px",
    borderRadius: "999px",
    background: "#ffffff",
    boxShadow: "0 1px 4px rgba(15, 23, 42, 0.22)",
  },
  storeChoiceCard: {
    border: "1px solid #e5e7eb",
    borderRadius: "16px",
    padding: "12px",
    background: "#fff",
    cursor: "pointer",
  },
  storeRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: "10px",
    alignItems: "center",
  },
  storeRowActions: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },
  iconButton: {
    width: "40px",
    height: "40px",
    borderRadius: "999px",
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#0f172a",
    fontWeight: 900,
    cursor: "pointer",
  },
  intelligenceRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    padding: "9px 0",
    borderBottom: "1px solid #f1f5f9",
  },
  inlineFormRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) minmax(110px, 0.7fr) auto",
    gap: "10px",
    alignItems: "center",
  },
  storeGroup: {
    border: "1px solid #e5e7eb",
    borderRadius: "18px",
    overflow: "hidden",
    marginBottom: "12px",
    background: "#fff",
  },
  storeGroupHeader: {
    width: "100%",
    minHeight: "48px",
    border: "none",
    background: "#f8fafc",
    padding: "12px 14px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    fontWeight: 800,
    cursor: "pointer",
    color: "#0f172a",
  },
  storeGroupBody: {
    padding: "12px",
    display: "grid",
    gap: "10px",
  },
  tiny: {
    fontSize: "12px",
    color: "#64748b",
    marginTop: "6px",
  },
  empty: {
    color: "#64748b",
    fontSize: "16px",
    padding: "18px 0 6px 0",
  },
  previewImage: {
    display: "block",
    width: "100%",
    maxHeight: "260px",
    objectFit: "contain",
    borderRadius: "16px",
    border: "1px solid #e5e7eb",
    background: "#f8fafc",
  },
  subTabs: {
    display: "flex",
    gap: "8px",
    overflowX: "auto",
    paddingBottom: "4px",
  },
  pageHeader: {
    background: "#fff",
    borderRadius: "16px",
    padding: "12px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.08)",
    display: "grid",
    gap: "10px",
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 90,
    display: "grid",
    placeItems: "center",
    padding: "16px",
    background: "rgba(15, 23, 42, 0.46)",
  },
  modalCard: {
    width: "min(100%, 460px)",
    maxHeight: "88vh",
    overflow: "auto",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "18px",
    padding: "16px",
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.22)",
    display: "grid",
    gap: "12px",
  },
};

function StatusBadge({ value }) {
  const found = value === "Found";
  return (
    <span
      style={{
        ...styles.badge,
        ...(found ? styles.badgeFound : styles.badgeNeutral),
      }}
    >
      {value || "Unknown"}
    </span>
  );
}

function Metric({ label, value }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

function ScoutPagination({ label = "stores", page, pageCount, total, onPageChange }) {
  if (Number(total || 0) <= SCOUT_LIST_PAGE_SIZE) return null;
  const currentPage = clampScoutPage(page, pageCount);
  const start = (currentPage - 1) * SCOUT_LIST_PAGE_SIZE + 1;
  const end = Math.min(currentPage * SCOUT_LIST_PAGE_SIZE, total);
  return (
    <div className="pagination-controls pagination-controls--compact scout-pagination-controls" style={{ marginTop: "12px" }}>
      <div className="pagination-count">Showing {start}-{end} of {total} {label}</div>
      <div className="pagination-actions">
        <button type="button" style={styles.buttonSoft} disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>Previous</button>
        <span className="pagination-mobile-current" style={{ display: "inline-flex" }}>Page {currentPage} of {pageCount}</span>
        <button type="button" style={styles.buttonSoft} disabled={currentPage >= pageCount} onClick={() => onPageChange(currentPage + 1)}>Next</button>
      </div>
    </div>
  );
}

function isUsefulValue(value) {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  return Boolean(text) && !["unknown", "not listed", "n/a", "none"].includes(text.toLowerCase());
}

function formatStoreDate(value) {
  if (!isUsefulValue(value)) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isRecentlyUpdated(value) {
  if (!isUsefulValue(value)) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const days = (Date.now() - date.getTime()) / 86400000;
  return days >= 0 && days <= 14;
}

function getStoreStatusBadges(store, reportCount) {
  const badges = [];
  const confidence = store.pokemonConfidenceLevel || store.pokemonConfidence || "";
  const updatedAt = store.lastUpdated || store.lastVerified || store.lastReportDate;
  if (reportCount === 0) badges.push("No Reports");
  if (isRecentlyUpdated(updatedAt)) badges.push("Recently Updated");
  if (/high/i.test(String(confidence))) badges.push("High Confidence");
  if (store.favorite) badges.push("Favorite");
  if (!isUsefulValue(store.address) || !isUsefulValue(confidence)) badges.push("Needs Info");
  return badges.slice(0, 4);
}

function getBestBuyDisplayStatus(item) {
  const text = `${item.stockStatus || ""} ${item.onlineAvailability || ""} ${item.shippingAvailability || ""} ${item.pickupAvailability || ""}`.toLowerCase();
  if (/out of stock|sold out|unavailable/.test(text)) return "Out of Stock";
  if (/ship|shipping/.test(text)) return "Shipping Available";
  if (/available|in stock|pickup|limited/.test(text)) return "Available";
  return item.stockStatus || "Unknown";
}

function formatScoutMoney(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "Unknown";
  return `$${amount.toFixed(2)}`;
}

function scoutCatalogTitle(product = {}) {
  return product.name || product.productName || product.cardName || product.title || "Catalog product";
}

function scoutCatalogMarketValue(product = {}) {
  return Number(product.marketPrice ?? product.marketValue ?? product.midPrice ?? product.currentMarketValue ?? 0);
}

function scoutCatalogSourceLabel(product = {}) {
  const raw = String(product.marketStatus || product.sourceType || product.sourceName || product.marketSource || "").toLowerCase();
  if (raw.includes("live")) return "Live";
  if (raw.includes("cache")) return "Cached";
  if (raw.includes("manual")) return "Manual";
  if (raw.includes("mock") || raw.includes("demo")) return "Estimated";
  return "Unknown";
}

const SEALED_SCOUT_PRODUCT_TERMS = [
  "elite trainer box",
  "pokemon center etb",
  "booster bundle",
  "booster box",
  "collection box",
  "ex box",
  "premium collection",
  "mini tin",
  "tin",
  "blister",
  "sleeved booster",
  "build battle",
  "build & battle",
  "poster collection",
  "binder collection",
  "ultra premium collection",
  "upc",
  "figure collection",
  "first partner pack",
  "special collection",
  "theme deck",
  "battle deck",
  "starter deck",
  "sealed",
  "pack",
  "display",
  "case",
];

function isSealedScoutCatalogProduct(input = {}) {
  const product = input.product || input;
  const rawType = [
    product.productType,
    product.product_type,
    product.sealedProductType,
    product.sealed_product_type,
    product.category,
    product.catalogType,
    product.catalog_type,
    product.type,
    product.name,
    product.productName,
    product.title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const rawKind = String(product.productKind || product.product_kind || product.catalogType || product.catalog_type || product.category || "").toLowerCase();
  if (rawKind.includes("single") || (rawKind === "card" && !rawType.includes("code card"))) return false;
  if (rawKind.includes("sealed")) return true;
  return SEALED_SCOUT_PRODUCT_TERMS.some((term) => rawType.includes(term));
}

function makeBlankReportItem(overrides = {}) {
  return {
    rowId: overrides.rowId || makeScoutId("report-item"),
    productId: overrides.productId || overrides.product_id || "",
    productName: overrides.productName || overrides.product_name || overrides.name || "",
    productType: overrides.productType || overrides.product_type || "",
    quantity: overrides.quantity ?? overrides.quantitySeen ?? overrides.quantity_seen ?? "",
    price: overrides.price ?? "",
    note: overrides.note || overrides.notes || "",
    catalogProductSnapshot: overrides.catalogProductSnapshot || overrides.catalog_product_snapshot || null,
    manualItemEntry: Boolean(overrides.manualItemEntry || overrides.manual_item_entry || !(overrides.productId || overrides.product_id)),
  };
}

function normalizeReportItemsForForm(source = {}) {
  const rawItems = Array.isArray(source.itemsSeen)
    ? source.itemsSeen
    : Array.isArray(source.items_seen)
      ? source.items_seen
      : [];
  const normalizedItems = rawItems.map((item) => makeBlankReportItem(item));
  if (normalizedItems.length) return normalizedItems;

  const productSnapshot = source.catalogProductSnapshot || source.catalog_product_snapshot || null;
  const legacyName = source.itemName || source.item_name || source.productName || source.product_name || source.manualItemName || "";
  if (!legacyName && !productSnapshot) return [makeBlankReportItem()];
  return [
    makeBlankReportItem({
      productId: source.catalogProductId || source.catalog_product_id || productSnapshot?.id || "",
      productName: legacyName || scoutCatalogTitle(productSnapshot),
      productType: source.productType || source.product_type || productSnapshot?.productType || productSnapshot?.product_type || "",
      quantity: source.quantitySeen || source.quantity_seen || "",
      price: source.price || "",
      note: "",
      catalogProductSnapshot: productSnapshot,
      manualItemEntry: !(source.catalogProductId || source.catalog_product_id || productSnapshot?.id),
    }),
  ];
}

function summarizeReportItem(item = {}, money = formatScoutMoney) {
  const parts = [
    item.productName || "No item details added",
    item.quantity ? `Qty ${item.quantity}` : "Qty unknown",
    Number(item.price || 0) > 0 ? money(item.price) : "",
  ].filter(Boolean);
  return parts.join(" - ");
}

function scoutReportStatusLabel(report = {}) {
  const raw = String(report.verificationStatus || report.verification_status || report.status || "").toLowerCase();
  if (report.verified || raw === "verified") return "Verified";
  if (raw === "pending") return "Pending";
  if (raw.includes("review")) return "Needs Review";
  if (raw === "user_report" || raw === "unverified") return "User Report";
  return report.userId || report.reportedBy || report.reported_by ? "User Report" : "Pending";
}

const SCOUT_STOCK_STATUS_OPTIONS = [
  { value: "in_stock", label: "In stock", storeStatus: "Found" },
  { value: "low_stock", label: "Low stock", storeStatus: "Low" },
  { value: "empty", label: "Empty", storeStatus: "Sold Out", reportType: "Store Restock Report" },
  { value: "vendor_stocking", label: "Vendor stocking", storeStatus: "Found" },
  { value: "behind_counter", label: "Behind counter", storeStatus: "Found" },
  { value: "customer_service", label: "Customer service", storeStatus: "Found" },
  { value: "limit_posted", label: "Limit posted", storeStatus: "Found", reportType: "Purchase Limit Update" },
  { value: "unknown", label: "Unknown / not sure", storeStatus: "Unknown" },
];

function scoutStockStatusLabel(value = "") {
  const normalized = String(value || "").toLowerCase();
  return SCOUT_STOCK_STATUS_OPTIONS.find((option) => option.value === normalized)?.label || "";
}

function scoutStockStoreStatus(value = "") {
  const normalized = String(value || "").toLowerCase();
  return SCOUT_STOCK_STATUS_OPTIONS.find((option) => option.value === normalized)?.storeStatus || "Found";
}

function getScoutReportPhotoUrls(report = {}) {
  const urls = [
    ...(Array.isArray(report.photoUrls) ? report.photoUrls : []),
    ...(Array.isArray(report.photo_urls) ? report.photo_urls : []),
    report.imageUrl,
    report.image_url,
    report.photoUrl,
    report.photo_url,
  ]
    .map((url) => String(url || "").trim())
    .filter(Boolean);
  return [...new Set(urls)];
}

function getScoutReportNowParts(date = new Date()) {
  return {
    iso: date.toISOString(),
    date: date.toISOString().slice(0, 10),
    time: date.toTimeString().slice(0, 5),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
  };
}

function friendlyScoutTimestamp(report = {}) {
  const rawDate = report.reportedAt || report.reported_at || report.submittedAt || report.submitted_at || report.createdAt || report.created_at || report.reportDate || report.report_date || "";
  const rawTime = report.reportTime || report.report_time || "";
  const parsed = rawDate
    ? new Date(String(rawDate).includes("T") ? rawDate : `${String(rawDate).slice(0, 10)}T${rawTime || "00:00"}`)
    : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "Date not added";
  const diffMinutes = Math.floor((Date.now() - parsed.getTime()) / 60000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const today = new Date();
  if (parsed.toDateString() === today.toDateString()) {
    return `Today at ${parsed.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  return parsed.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function scoutSourceTypeLabel(value = "") {
  return String(value || "user_report")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function Scout({
  targetSubTab = { tab: "overview", id: 0 },
  compact = false,
  onLocationRequired = () => true,
  adminMode = false,
  supabase = null,
  isSupabaseConfigured = false,
  mapCatalogRow = (row) => row,
  money = formatScoutMoney,
}) {
  const [stores, setStores] = useState([]);
  const [scoutSubTab, setScoutSubTab] = useState("overview");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [selectedChain, setSelectedChain] = useState("All");
  const [selectedRegion, setSelectedRegion] = useState("All");
  const [selectedCity, setSelectedCity] = useState("All");
  const [selectedStoreType, setSelectedStoreType] = useState("All");
  const [selectedCounty, setSelectedCounty] = useState("All");
  const [selectedConfidence, setSelectedConfidence] = useState("All");
  const [storeQuickFilter, setStoreQuickFilter] = useState("default");
  const [storeSort, setStoreSort] = useState("nickname");
  const [storeSearch, setStoreSearch] = useState("");
  const [storePage, setStorePage] = useState(1);
  const [storeDirectoryView, setStoreDirectoryView] = useState("landing");
  const [storeMoreFiltersOpen, setStoreMoreFiltersOpen] = useState(false);
  const [storeImportText, setStoreImportText] = useState("");
  const [storeImportPreview, setStoreImportPreview] = useState([]);
  const [openStoreGroups, setOpenStoreGroups] = useState(() =>
    Object.fromEntries(STORE_GROUP_ORDER.map((group) => [group, true]))
  );
  const [reports, setReports] = useState([]);
  const [allReports, setAllReports] = useState([]);
  const [tidepoolReports, setTidepoolReports] = useState([]);
  const [tidepoolFilter, setTidepoolFilter] = useState("Latest");
  const [tidepoolEvents, setTidepoolEvents] = useState([]);
  const [tidepoolEventFilter, setTidepoolEventFilter] = useState("Upcoming");
  const [bestBuyStockResults, setBestBuyStockResults] = useState([]);
  const [bestBuyStockHistory, setBestBuyStockHistory] = useState([]);
  const [bestBuyStoreStock, setBestBuyStoreStock] = useState([]);
  const [bestBuyAlerts, setBestBuyAlerts] = useState([]);
  const [bestBuyNightlyReports, setBestBuyNightlyReports] = useState([]);
  const [bestBuyNightlySettings, setBestBuyNightlySettings] = useState(BEST_BUY_NIGHTLY_DEFAULTS);
  const [bestBuyForm, setBestBuyForm] = useState({
    query: "pokemon",
    sku: "",
    zip: "23435",
    stockStatus: "Unknown",
  });
  const [bestBuyMessage, setBestBuyMessage] = useState("");
  const [scoutProfile, setScoutProfile] = useState(createDefaultScoutProfile);
  const [alertSettings, setAlertSettings] = useState(createDefaultAlertSettings);
  const [tidepoolForm, setTidepoolForm] = useState({
    displayName: "Local Scout",
    anonymous: false,
    reportType: "Restock sighting",
    reportText: "",
    productName: "",
    quantitySeen: "",
    price: "",
    purchaseLimit: "",
    photoUrl: "",
  });
  const [eventForm, setEventForm] = useState({
    eventTitle: "",
    eventType: "Kid-friendly Pokemon meetup",
    eventDescription: "",
    hostName: "Local Scout",
    locationName: "",
    address: "",
    city: "",
    state: "VA",
    zip: "",
    onlineEvent: false,
    eventLink: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    kidFriendly: true,
    freeEvent: true,
    cost: "",
    donationAccepted: false,
    donationDetails: "",
    itemsProvided: "",
    ageRange: "",
    rsvpEnabled: true,
    maxAttendees: "",
  });
  const [items, setItems] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [routeForm, setRouteForm] = useState({
    routeName: "Suggested Route",
    startingZip: "",
    routeGoal: "Highest restock chance",
    region: "All",
    includedGroups: STORE_GROUP_ORDER,
    maxStops: 5,
    maxDistance: "",
    maxTripTime: "",
    selectedStoreIds: [],
    lockedStoreIds: [],
    completed: false,
    notes: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [reportPhoto, setReportPhoto] = useState(null);
  const [isEditingStore, setIsEditingStore] = useState(false);
  const [editingReportId, setEditingReportId] = useState(null);
  const [deleteReportTarget, setDeleteReportTarget] = useState(null);
  const [selectedReportTarget, setSelectedReportTarget] = useState(null);
  const [editingTrackedItemId, setEditingTrackedItemId] = useState(null);
  const [tipImport, setTipImport] = useState({
    screenshotName: "",
    screenshotPreview: "",
    productName: "",
    productCategory: "Pokemon",
    reportDate: "",
    reportTime: "",
    stockStatus: "in_stock",
    quantitySeen: "",
    price: "",
    quantityRemaining: "",
    limitInfo: "",
    sourceName: "",
    extractionConfidence: "",
    notes: "",
    verified: false,
    keepScreenshot: true,
  });
  const [intelImportText, setIntelImportText] = useState("");
  const [intelImportPreview, setIntelImportPreview] = useState([]);
  const [restockIntel, setRestockIntel] = useState([]);
  const [restockPatterns, setRestockPatterns] = useState([]);
  const hasAutoOpenedDropRef = useRef(false);

  const [storeForm, setStoreForm] = useState({
    name: "",
    chain: "",
    storeGroup: "",
    city: "",
    address: "",
    phone: "",
  });
  const targetSubTabKey = typeof targetSubTab === "string" ? targetSubTab : targetSubTab?.tab;
  const targetSubTabId = typeof targetSubTab === "string" ? targetSubTab : targetSubTab?.id;
  const targetSubTabAction = typeof targetSubTab === "string" ? "" : targetSubTab?.action;
  const targetSubTabProductName = typeof targetSubTab === "string" ? "" : targetSubTab?.productName || "";
  const targetSubTabProductId = typeof targetSubTab === "string" ? "" : targetSubTab?.productId || "";
  const targetSubTabProductSnapshot = typeof targetSubTab === "string" ? null : targetSubTab?.productSnapshot || null;
  const targetSubTabReportId = typeof targetSubTab === "string" ? "" : targetSubTab?.reportId || "";
  const handledTargetSubTabRef = useRef("");

  useEffect(() => {
    if (!targetSubTabKey) return;
    const targetToken = [
      targetSubTabKey,
      targetSubTabId,
      targetSubTabAction,
      targetSubTabProductId,
      targetSubTabProductName,
      targetSubTabReportId,
    ].join("|");
    if (handledTargetSubTabRef.current === targetToken) return;

    const nextSubTab = targetSubTabKey === "whatDidISee" ? "reports" : targetSubTabKey;
    setScoutSubTab(nextSubTab);

    if (targetSubTabKey === "reports" && targetSubTabAction === "editReport") {
      const saved = BETA_LOCAL_SCOUT ? sanitizeScoutLocalData(JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}")) : {};
      const report = [...(allReports || []), ...(saved.reports || [])].find((entry) => String(entry.id || entry.reportId || entry.report_id || "") === String(targetSubTabReportId));
      if (report) {
        setSelectedStoreId(report.storeId || report.store_id || selectedStoreId);
        startEditingReport(report);
        handledTargetSubTabRef.current = targetToken;
      }
      return;
    }

    if (targetSubTabKey === "stores") {
      setStoreDirectoryView("landing");
    }
    if (targetSubTabKey === "stores" && targetSubTabAction === "missingStore") {
      setMissingStoreModalOpen(true);
    }
    if ((targetSubTabKey === "reports" || targetSubTabKey === "whatDidISee") && targetSubTabAction === "productSighting") {
      const seededItem = makeBlankReportItem({
        productId: targetSubTabProductId,
        productName: targetSubTabProductName,
        catalogProductSnapshot: targetSubTabProductSnapshot,
        manualItemEntry: !targetSubTabProductId,
      });
      setReportForm((current) => ({
        ...current,
        reportType: "Product Sighting / What Did I See",
        itemName: targetSubTabProductName || current.itemName,
        catalogProductId: targetSubTabProductId,
        catalogProductSnapshot: targetSubTabProductSnapshot,
        manualItemEntry: !targetSubTabProductId,
        itemsSeen: [seededItem],
      }));
      if (targetSubTabProductName) setReportProductSearch(targetSubTabProductName);
    }
    if (targetSubTabKey === "reports" && targetSubTabAction === "storeCorrection") {
      setReportForm((current) => ({ ...current, reportType: "Store Correction" }));
    }
    if (targetSubTabKey === "reports" && targetSubTabAction === "importIntel") {
      setReportInputMethod("Import Intel");
    }
    handledTargetSubTabRef.current = targetToken;
  }, [targetSubTabKey, targetSubTabId, targetSubTabAction, targetSubTabProductName, targetSubTabProductId, targetSubTabProductSnapshot, targetSubTabReportId, allReports]);

  useEffect(() => {
    setStorePage(1);
  }, [selectedChain, selectedRegion, selectedCity, selectedStoreType, selectedCounty, selectedConfidence, storeQuickFilter, storeSearch, storeSort]);

  const [editStoreForm, setEditStoreForm] = useState({
    name: "",
    chain: "",
    storeGroup: "",
    city: "",
    address: "",
    phone: "",
  });

  const [reportForm, setReportForm] = useState({
    reportType: "Store Restock Report",
    itemName: "",
    quantitySeen: "",
    price: "",
    note: "",
    reportDate: getScoutReportNowParts().date,
    reportTime: getScoutReportNowParts().time,
    reportedAt: getScoutReportNowParts().iso,
    submittedAt: "",
    timezone: getScoutReportNowParts().timezone,
    reportTimeManuallyEdited: false,
    reportedBy: "Zena",
    verified: true,
    stockStatus: "",
    sourceType: "user_report",
    confidence: "possible",
    visibility: "public_cleaned",
    evidence: [],
    lat: null,
    lng: null,
    imageUrl: "",
    photoUrls: [],
    aiDetectedItems: [],
    needsReview: false,
    catalogProductId: "",
    catalogProductSnapshot: null,
    manualItemEntry: false,
    itemsSeen: [makeBlankReportItem()],
  });
  const [reportProductSearch, setReportProductSearch] = useState("");
  const [reportProductSearchCloseSignal, setReportProductSearchCloseSignal] = useState(0);
  const [reportInputMethod, setReportInputMethod] = useState("Manual");
  const [missingStoreModalOpen, setMissingStoreModalOpen] = useState(false);
  const [trackedProductsModalOpen, setTrackedProductsModalOpen] = useState(false);
  const [missingStoreForm, setMissingStoreForm] = useState({
    name: "",
    retailer: "",
    address: "",
    city: "",
    zip: "",
    notes: "",
  });
  const [dismissedAlertIds, setDismissedAlertIds] = useState([]);

  const [itemForm, setItemForm] = useState({
    category: "Pokémon",
    name: "",
    retailerItemNumber: "",
    sku: "",
    upc: "",
    productUrl: "",
    sourceType: "manual",
    status: "Unknown",
  });

  function resetTrackedItemForm() {
    setEditingTrackedItemId(null);
    setItemForm({
      category: "Pokemon",
      name: "",
      retailerItemNumber: "",
      sku: "",
      upc: "",
      productUrl: "",
      sourceType: "manual",
      status: "Unknown",
    });
  }

  function startEditingTrackedItem(item) {
    setEditingTrackedItemId(item.id);
    setItemForm({
      category: item.category || "Pokemon",
      name: item.name || "",
      retailerItemNumber: item.retailerItemNumber || item.retailer_item_number || "",
      sku: item.sku || "",
      upc: item.upc || "",
      productUrl: item.productUrl || item.product_url || "",
      sourceType: item.sourceType || item.source_type || "manual",
      status: item.status || "Unknown",
    });
    setTrackedProductsModalOpen(true);
  }

  function resetTipImport() {
    setTipImport({
      screenshotName: "",
      screenshotPreview: "",
      productName: "",
      productCategory: "Pokemon",
      reportDate: "",
      reportTime: "",
      stockStatus: "in_stock",
      quantitySeen: "",
      price: "",
      quantityRemaining: "",
      limitInfo: "",
      sourceName: "",
      extractionConfidence: "",
      notes: "",
      verified: false,
      keepScreenshot: true,
    });
  }

  function updateTipImport(field, value) {
    setTipImport((current) => ({ ...current, [field]: value }));
  }

  function handleTipScreenshotUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setTipImport((current) => ({
        ...current,
        screenshotName: file.name,
        screenshotPreview: String(reader.result || ""),
      }));
      setReportForm((current) => ({
        ...current,
        imageUrl: String(reader.result || ""),
        photoUrls: [String(reader.result || "")].filter(Boolean),
        needsReview: true,
      }));
    };
    reader.readAsDataURL(file);
  }

  function handleGetLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported on this device.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setReportForm((prev) => ({
          ...prev,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }));
      },
      () => {
        setError("Unable to get your location.");
      }
    );
  }

  async function savePhotoFirstScoutReport(imageUrl, imageName = "") {
    const activeStoreId = selectedStoreId;
    if (!activeStoreId) {
      setError("Select a store before adding a photo report.");
      return;
    }

    const store = stores.find((candidate) => candidate.id === activeStoreId) || {};
    const now = new Date();
    const reportDate = now.toISOString().slice(0, 10);
    const reportTime = now.toTimeString().slice(0, 5);
    const photoNote = reportForm.note?.trim() || "Photo uploaded. Items not identified yet.";
    const status = reportForm.stockStatus || "unknown";
    const reportPayload = {
      storeId: activeStoreId,
      storeName: store.nickname || store.name || "",
      retailer: store.chain || store.storeGroup || "",
      city: store.city || "",
      region: store.region || "",
      reportType: "Photo shelf report",
      stockStatus: status,
      stock_status: status,
      itemName: "",
      quantitySeen: "",
      price: "",
      note: photoNote,
      reportDate,
      reportTime,
      reportedAt: now.toISOString(),
      reported_at: now.toISOString(),
      submittedAt: now.toISOString(),
      submitted_at: now.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      reportedBy: reportForm.reportedBy || "Zena",
      verified: false,
      verificationStatus: "needs_review",
      lat: reportForm.lat,
      lng: reportForm.lng,
      imageUrl,
      photoUrls: [imageUrl],
      photo_urls: [imageUrl],
      photoName: imageName,
      photo_name: imageName,
      itemsSeen: [],
      items_seen: [],
      aiDetectedItems: [],
      ai_detected_items: [],
      needsReview: true,
      needs_review: true,
      reportLevel: "photo",
      sourceType: "photo_report",
      source_type: "photo_report",
      confidence: "confirmed",
      visibility: "public_cleaned",
      evidence: [{
        type: "photo",
        url: imageUrl,
        transcript: "",
        submittedBy: "user",
        private: false,
      }],
    };

    if (BETA_LOCAL_SCOUT) {
      const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
      const newReport = {
        ...reportPayload,
        id: makeScoutId("report"),
        createdAt: now.toISOString(),
      };
      const nextReports = [newReport, ...(saved.reports || [])];
      const nextStores = (saved.stores || stores).map((candidate) =>
        candidate.id === activeStoreId
          ? { ...candidate, status: scoutStockStoreStatus(status), lastRestock: reportDate }
          : candidate
      );
      saveLocalScout({ stores: nextStores, reports: nextReports });
      setStores(nextStores);
      setAllReports(nextReports);
      setReports(nextReports.filter((report) => getReportStoreId(report) === activeStoreId));
      resetReportForm();
      setError("Photo report saved. Items not identified yet.");
      return;
    }

    try {
      await createReport(activeStoreId, reportPayload);
      resetReportForm();
      await loadStoreDetails(activeStoreId);
      await loadStores();
      setError("Photo report saved. Items not identified yet.");
    } catch (err) {
      setError(err.message || "Failed to save photo report");
    }
  }

  function handlePhotoFirstReportUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const imageUrl = String(reader.result || "");
      setReportPhoto({ name: file.name, preview: imageUrl });
      setReportForm((current) => ({
        ...current,
        imageUrl,
        photoUrls: [imageUrl],
        stockStatus: current.stockStatus || "unknown",
        needsReview: true,
      }));
      savePhotoFirstScoutReport(imageUrl, file.name);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function loadStores() {
    if (BETA_LOCAL_SCOUT) {
      const saved = sanitizeScoutLocalData(JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}"));
      const savedStores = dedupeStoresByChainAddress(saved.stores?.length ? [...STATEWIDE_SEED_STORES, ...saved.stores] : STATEWIDE_SEED_STORES)
        .map((store) => normalizeImportedStore(store));
      const savedReports = saved.reports || [];
      const savedTidepoolReports = saved.tidepoolReports || [];
      const savedTidepoolEvents = saved.tidepoolEvents || [];
      const savedBestBuyStockResults = saved.bestBuyStockResults || [];
      const savedBestBuyStockHistory = saved.bestBuyStockHistory || [];
      const savedBestBuyStoreStock = saved.bestBuyStoreStock || [];
      const savedBestBuyAlerts = saved.bestBuyAlerts || [];
      const savedBestBuyNightlyReports = saved.bestBuyNightlyReports || [];
      const savedBestBuyNightlySettings = { ...BEST_BUY_NIGHTLY_DEFAULTS, ...(saved.bestBuyNightlySettings || {}) };
      const savedScoutProfile = saved.scoutProfile || createDefaultScoutProfile();
      const savedAlertSettings = { ...createDefaultAlertSettings(), ...(saved.alertSettings || {}) };
      const savedRestockIntel = saved.restockIntel?.length ? saved.restockIntel : SCOUT_HISTORICAL_INTEL_SEED;
      const savedRestockPatterns = saved.restockPatterns?.length ? saved.restockPatterns : buildScoutRestockPatterns(savedRestockIntel);
      if (!saved.stores?.length) {
        localStorage.setItem(
          SCOUT_STORAGE_KEY,
          JSON.stringify({
            ...saved,
            stores: savedStores,
            reports: savedReports,
            tidepoolReports: savedTidepoolReports,
            tidepoolEvents: savedTidepoolEvents,
            bestBuyStockResults: savedBestBuyStockResults,
            bestBuyStockHistory: savedBestBuyStockHistory,
            bestBuyStoreStock: savedBestBuyStoreStock,
            bestBuyAlerts: savedBestBuyAlerts,
            bestBuyNightlyReports: savedBestBuyNightlyReports,
            bestBuyNightlySettings: savedBestBuyNightlySettings,
            scoutProfile: savedScoutProfile,
            alertSettings: savedAlertSettings,
            restockIntel: savedRestockIntel,
            restockPatterns: savedRestockPatterns,
            storeAliases: SCOUT_STORE_ALIASES,
            items: saved.items || [],
            routes: saved.routes || [],
          })
        );
      } else if (!saved.restockIntel?.length || !saved.restockPatterns?.length) {
        localStorage.setItem(
          SCOUT_STORAGE_KEY,
          JSON.stringify({
            ...saved,
            restockIntel: savedRestockIntel,
            restockPatterns: savedRestockPatterns,
            storeAliases: saved.storeAliases?.length ? saved.storeAliases : SCOUT_STORE_ALIASES,
          })
        );
      }
      setStores(savedStores);
      setAllReports(savedReports);
      setTidepoolReports(savedTidepoolReports);
      setTidepoolEvents(savedTidepoolEvents);
      setBestBuyStockResults(savedBestBuyStockResults);
      setBestBuyStockHistory(savedBestBuyStockHistory);
      setBestBuyStoreStock(savedBestBuyStoreStock);
      setBestBuyAlerts(savedBestBuyAlerts);
      setBestBuyNightlyReports(savedBestBuyNightlyReports);
      setBestBuyNightlySettings(savedBestBuyNightlySettings);
      setScoutProfile(savedScoutProfile);
      setAlertSettings(savedAlertSettings);
      setRestockIntel(savedRestockIntel);
      setRestockPatterns(savedRestockPatterns);
      setRoutes(saved.routes || []);
      setError("");
      setLoading(false);

      if (!selectedStoreId && savedStores.length > 0) {
        setSelectedStoreId(savedStores[0].id);
      }
      return;
    }

    try {
      setLoading(true);
      const data = await getStores();
      setStores(data);
      setError("");

      if (!selectedStoreId && data.length > 0) {
        setSelectedStoreId(data[0].id);
      }
    } catch (err) {
      setError(err.message || "Failed to load stores");
    } finally {
      setLoading(false);
    }
  }

  async function loadStoreDetails(storeId) {
    if (!storeId) return;
    if (BETA_LOCAL_SCOUT) {
      const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
      const savedReports = saved.reports || [];
      setAllReports(savedReports);
      setReports(savedReports.filter((report) => getReportStoreId(report) === storeId));
      setItems((saved.items || []).filter((item) => item.storeId === storeId));
      return;
    }

    try {
      const [reportData, itemData] = await Promise.all([
        getReports(storeId),
        getTrackedItems(storeId),
      ]);
      setReports(reportData);
      setItems(itemData);
    } catch (err) {
      setError(err.message || "Failed to load store details");
    }
  }

  useEffect(() => {
    loadStores();
  }, []);

  useEffect(() => {
    if (selectedStoreId) {
      loadStoreDetails(selectedStoreId);
    }
  }, [selectedStoreId]);

  useEffect(() => {
    function handleScoutEscape(event) {
      if (event.key !== "Escape") return;
      if (deleteReportTarget) {
        setDeleteReportTarget(null);
        return;
      }
      if (selectedReportTarget) {
        setSelectedReportTarget(null);
      }
    }
    window.addEventListener("keydown", handleScoutEscape);
    return () => window.removeEventListener("keydown", handleScoutEscape);
  }, [deleteReportTarget, selectedReportTarget]);

  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  function resetReportForm() {
    const nowParts = getScoutReportNowParts();
    setEditingReportId(null);
    setReportPhoto(null);
    setReportForm({
      reportType: "Store Restock Report",
      itemName: "",
      quantitySeen: "",
      price: "",
      note: "",
      reportDate: nowParts.date,
      reportTime: nowParts.time,
      reportedAt: nowParts.iso,
      submittedAt: "",
      timezone: nowParts.timezone,
      reportTimeManuallyEdited: false,
      reportedBy: "Zena",
      verified: true,
      stockStatus: "",
      sourceType: "user_report",
      confidence: "possible",
      visibility: "public_cleaned",
      evidence: [],
      lat: null,
      lng: null,
      imageUrl: "",
      photoUrls: [],
      aiDetectedItems: [],
      needsReview: false,
      catalogProductId: "",
      catalogProductSnapshot: null,
      manualItemEntry: false,
      itemsSeen: [makeBlankReportItem()],
    });
    setReportProductSearch("");
    setReportProductSearchCloseSignal((value) => value + 1);
  }

  function startEditingReport(report) {
    setEditingReportId(report.id);
    setReportPhoto(null);
    const productSnapshot = report.catalogProductSnapshot || report.catalog_product_snapshot || null;
    const itemName = report.itemName || report.item_name || report.manualItemName || "";
    const itemsSeen = normalizeReportItemsForForm(report);
    setReportForm({
      reportType: report.reportType || report.report_type || "Restock sighting",
      itemName: itemName || itemsSeen[0]?.productName || "",
      quantitySeen: report.quantitySeen || report.quantity_seen || itemsSeen[0]?.quantity || "",
      price: report.price || itemsSeen[0]?.price || "",
      note: report.note || "",
      reportDate: getReportDate(report),
      reportTime: getReportTime(report),
      reportedAt: report.reportedAt || report.reported_at || report.createdAt || report.created_at || "",
      submittedAt: report.submittedAt || report.submitted_at || "",
      timezone: report.timezone || "",
      reportTimeManuallyEdited: true,
      reportedBy: report.reportedBy || report.reported_by || "Zena",
      verified: Boolean(report.verified),
      stockStatus: report.stockStatus || report.stock_status || "",
      sourceType: report.sourceType || report.source_type || "user_report",
      confidence: report.confidence || "possible",
      visibility: report.visibility || "public_cleaned",
      evidence: Array.isArray(report.evidence) ? report.evidence : [],
      lat: report.lat || null,
      lng: report.lng || null,
      imageUrl: report.imageUrl || report.image_url || "",
      photoUrls: getScoutReportPhotoUrls(report),
      aiDetectedItems: Array.isArray(report.aiDetectedItems)
        ? report.aiDetectedItems
        : Array.isArray(report.ai_detected_items)
          ? report.ai_detected_items
          : [],
      needsReview: Boolean(report.needsReview || report.needs_review),
      catalogProductId: report.catalogProductId || report.catalog_product_id || productSnapshot?.id || "",
      catalogProductSnapshot: productSnapshot,
      manualItemEntry: !(report.catalogProductId || report.catalog_product_id || productSnapshot?.id),
      itemsSeen,
    });
    setReportProductSearch(itemName || itemsSeen[0]?.productName || "");
  }

  function selectReportCatalogProduct(suggestion) {
    selectReportCatalogProductForItem(0, suggestion);
  }

  function updateReportProductSearch(value) {
    setReportProductSearch(value);
    updateReportItem(0, {
      productName: value,
      productId: "",
      catalogProductSnapshot: null,
      manualItemEntry: true,
    });
  }

  function clearReportCatalogProduct() {
    updateReportItem(0, makeBlankReportItem());
    setReportProductSearch("");
    setReportProductSearchCloseSignal((value) => value + 1);
  }

  function enableManualReportItem() {
    updateReportItem(0, {
      productId: "",
      productName: reportProductSearch || reportForm.itemsSeen?.[0]?.productName || reportForm.itemName,
      catalogProductSnapshot: null,
      manualItemEntry: true,
    });
    setReportProductSearchCloseSignal((value) => value + 1);
  }

  function updateReportItem(index, patch) {
    setReportForm((current) => {
      const itemsSeen = (current.itemsSeen?.length ? current.itemsSeen : [makeBlankReportItem()]).map((item, itemIndex) => (
        itemIndex === index ? { ...item, ...patch } : item
      ));
      const firstItem = itemsSeen[0] || makeBlankReportItem();
      return {
        ...current,
        itemsSeen,
        itemName: firstItem.productName || "",
        quantitySeen: firstItem.quantity || "",
        price: firstItem.price || "",
        catalogProductId: firstItem.productId || "",
        catalogProductSnapshot: firstItem.catalogProductSnapshot || null,
        manualItemEntry: Boolean(firstItem.manualItemEntry),
      };
    });
  }

  function addReportItem() {
    setReportForm((current) => ({
      ...current,
      itemsSeen: [...(current.itemsSeen?.length ? current.itemsSeen : [makeBlankReportItem()]), makeBlankReportItem()],
    }));
  }

  function removeReportItem(index) {
    setReportForm((current) => {
      const itemsSeen = (current.itemsSeen || []).filter((_, itemIndex) => itemIndex !== index);
      const nextItems = itemsSeen.length ? itemsSeen : [makeBlankReportItem()];
      const firstItem = nextItems[0] || makeBlankReportItem();
      return {
        ...current,
        itemsSeen: nextItems,
        itemName: firstItem.productName || "",
        quantitySeen: firstItem.quantity || "",
        price: firstItem.price || "",
        catalogProductId: firstItem.productId || "",
        catalogProductSnapshot: firstItem.catalogProductSnapshot || null,
        manualItemEntry: Boolean(firstItem.manualItemEntry),
      };
    });
  }

  function selectReportCatalogProductForItem(index, suggestion) {
    const product = suggestion?.product || null;
    const nextLabel = suggestion?.searchValue || suggestion?.label || "";
    if (!product?.id) {
      updateReportItem(index, {
        productName: nextLabel,
        productId: "",
        productType: "",
        catalogProductSnapshot: null,
        manualItemEntry: true,
      });
      if (index === 0) setReportProductSearch(nextLabel);
      return;
    }

    const title = scoutCatalogTitle(product);
    updateReportItem(index, {
      productId: product.id,
      productName: title,
      productType: product.productType || product.product_type || product.sealedProductType || product.sealed_product_type || "",
      catalogProductSnapshot: product,
      manualItemEntry: false,
    });
    if (index === 0) setReportProductSearch(title);
    setReportProductSearchCloseSignal((value) => value + 1);
  }

function saveLocalScout(next) {
  const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
  localStorage.setItem(SCOUT_STORAGE_KEY, JSON.stringify({ ...saved, ...next }));
}

function submitSharedDataSuggestion(input, setMessage) {
  const result = submitSuggestion({
    userId: LOCAL_SCOUT_USER_ID,
    displayName: "Local Scout",
    source: "scout",
    ...input,
  });
  if (!result.ok && result.reason === "duplicate") {
    setMessage?.("A similar suggestion is already under review.");
    return null;
  }
  setMessage?.("Suggestion submitted for admin review.");
  return result.suggestion;
}

function previewStatewideStoreImport() {
  const rows = parseStoreCsv(storeImportText).map((row) => normalizeImportedStore(row, { state: "VA", source: "manual-csv" }));
  setStoreImportPreview(rows);
}

function confirmStatewideStoreImport() {
  if (!storeImportPreview.length) return;
  const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
  const nextStores = dedupeStoresByChainAddress([...(saved.stores || stores), ...storeImportPreview]);
  saveLocalScout({ stores: nextStores });
  setStores(nextStores);
  setStoreImportPreview([]);
  setStoreImportText("");
}

function submitMissingStoreForReview(event) {
  event.preventDefault();
  const name = missingStoreForm.name.trim();
  if (!name) {
    setError("Add a store name before submitting it for review.");
    return;
  }
  const now = new Date().toISOString();
  const reviewStore = normalizeImportedStore({
    id: makeScoutId("store-review"),
    name,
    nickname: name,
    chain: missingStoreForm.retailer || "Needs Review",
    retailer: missingStoreForm.retailer || "Needs Review",
    storeGroup: missingStoreForm.retailer || "Other",
    address: missingStoreForm.address,
    city: missingStoreForm.city,
    state: "VA",
    zip: missingStoreForm.zip,
    notes: missingStoreForm.notes,
    source: "user-review",
    sourceType: "manual",
    lastUpdated: now,
    lastVerified: "Needs review",
    pokemonConfidence: "Unknown",
    carriesPokemonLikely: false,
    isActive: false,
    userAdded: true,
    reviewStatus: "pending",
  });
  const suggestion = submitSharedDataSuggestion({
    suggestionType: SUGGESTION_TYPES.ADD_MISSING_STORE,
    targetTable: "stores",
    submittedData: reviewStore,
    notes: missingStoreForm.notes || "Submitted from Scout missing store flow.",
  }, setError);
  if (!suggestion) return;
  setMissingStoreForm({ name: "", retailer: "", address: "", city: "", zip: "", notes: "" });
  setMissingStoreModalOpen(false);
  setError("Missing store submitted for admin review. It will not appear publicly until approved.");
}

function saveTidepoolReports(nextReports) {
  setTidepoolReports(nextReports);
  saveLocalScout({ tidepoolReports: nextReports });
}

function saveTidepoolEvents(nextEvents) {
  setTidepoolEvents(nextEvents);
  saveLocalScout({ tidepoolEvents: nextEvents });
}

function saveBestBuyStock(next) {
  setBestBuyStockResults(next.results ?? bestBuyStockResults);
  setBestBuyStockHistory(next.history ?? bestBuyStockHistory);
  setBestBuyStoreStock(next.storeStock ?? bestBuyStoreStock);
  setBestBuyAlerts(next.alerts ?? bestBuyAlerts);
  setBestBuyNightlyReports(next.nightlyReports ?? bestBuyNightlyReports);
  setBestBuyNightlySettings(next.nightlySettings ?? bestBuyNightlySettings);
  saveLocalScout({
    bestBuyStockResults: next.results ?? bestBuyStockResults,
    bestBuyStockHistory: next.history ?? bestBuyStockHistory,
    bestBuyStoreStock: next.storeStock ?? bestBuyStoreStock,
    bestBuyAlerts: next.alerts ?? bestBuyAlerts,
    bestBuyNightlyReports: next.nightlyReports ?? bestBuyNightlyReports,
    bestBuyNightlySettings: next.nightlySettings ?? bestBuyNightlySettings,
  });
}

function saveScoutProfile(nextProfile) {
  setScoutProfile(nextProfile);
  saveLocalScout({ scoutProfile: nextProfile });
}

function updateAlertSetting(field, value) {
  const next = { ...alertSettings, [field]: value };
  setAlertSettings(next);
  if (field === "autoOpenDropWebsite") {
    try {
      localStorage.setItem(AUTO_OPEN_DROP_WEBSITE_STORAGE_KEY, value ? "true" : "false");
    } catch (error) {
      console.warn("Unable to save auto-open drop preference", error);
    }
  }
  saveLocalScout({ alertSettings: next });
}

function openWebsiteWhenDropDetected(drop) {
  if (!drop || !alertSettings.autoOpenDropWebsite) return;
  if (hasAutoOpenedDropRef.current) return;
  hasAutoOpenedDropRef.current = true;
  const url = getDropWebsiteUrl(drop);
  window.location.assign(url);
}

function openDropWebsiteFromUserAction(drop) {
  const url = getDropWebsiteUrl(drop);
  window.location.assign(url);
}

function updateBestBuySetting(field, value) {
  const next = { ...bestBuyNightlySettings, [field]: value };
  setBestBuyNightlySettings(next);
  saveLocalScout({ bestBuyNightlySettings: next });
}

function syncBestBuyStock(mode = "search") {
  if (!adminMode) {
    setBestBuyMessage("Best Buy live lookup is not connected yet. No sample stock rows were created.");
    return;
  }
  const zip = bestBuyForm.zip || bestBuyNightlySettings.zip;
  const pulled = mode === "sku" && bestBuyForm.sku
    ? [checkBestBuyStoreAvailability(bestBuyForm.sku, zip, BEST_BUY_MOCK_PRODUCTS)]
    : pullBestBuyStockData({ query: bestBuyForm.query || "pokemon", zip, products: BEST_BUY_MOCK_PRODUCTS, scoutStores: stores });

  let nextResults = bestBuyStockResults;
  let nextHistory = bestBuyStockHistory;
  let nextStoreStock = bestBuyStoreStock;
  let nextAlerts = bestBuyAlerts;
  let nextTidepoolReports = tidepoolReports;
  let dropToOpen = null;

  pulled.forEach((rawResult) => {
    const previous = bestBuyStockResults.find((item) =>
      String(item.bestBuySku) === String(rawResult.bestBuySku) &&
      String(item.storeId || item.zipChecked) === String(rawResult.storeId || rawResult.zipChecked)
    );
    const cachedResult = cacheBestBuyStockResult(nextResults, rawResult)[0];
    nextResults = cacheBestBuyStockResult(nextResults, cachedResult);
    nextHistory = saveBestBuyStockHistory(nextHistory, cachedResult, previous);
    nextStoreStock = updateStoreStockFromBestBuy(nextStoreStock, cachedResult, nextHistory);
    const alert = createBestBuyStockAlert(cachedResult);
    if (alert) {
      nextAlerts = [alert, ...nextAlerts].slice(0, 25);
      if (!dropToOpen) dropToOpen = { ...cachedResult, ...alert };
    }
    if (/available|in stock|limited|shipping/i.test(`${cachedResult.stockStatus} ${cachedResult.onlineAvailability} ${cachedResult.pickupAvailability}`)) {
      nextTidepoolReports = [createTidepoolReportFromBestBuyAvailability(cachedResult), ...nextTidepoolReports].slice(0, 80);
    }
  });

  saveBestBuyStock({ results: nextResults, history: nextHistory, storeStock: nextStoreStock, alerts: nextAlerts });
  saveTidepoolReports(nextTidepoolReports);
  setBestBuyMessage(`Best Buy beta sync checked ${pulled.length} item(s). Source is admin-only sample/cached until backend API credentials are configured.`);
  openWebsiteWhenDropDetected(dropToOpen);
}

function addManualBestBuyStock() {
  if (!bestBuyForm.sku && !bestBuyForm.query) return;
  const manual = normalizeBestBuyStockResult({
    bestBuySku: bestBuyForm.sku || makeScoutId("manual-sku"),
    productName: bestBuyForm.query || "Manual Best Buy Pokemon item",
    zipChecked: bestBuyForm.zip || bestBuyNightlySettings.zip,
    stockStatus: bestBuyForm.stockStatus,
    onlineAvailability: bestBuyForm.stockStatus,
    pickupAvailability: bestBuyForm.stockStatus,
    shippingAvailability: bestBuyForm.stockStatus,
    sourceType: "manual",
    sourceStatus: "manual",
  });
  let nextResults = cacheBestBuyStockResult(bestBuyStockResults, manual);
  let nextHistory = saveBestBuyStockHistory(bestBuyStockHistory, manual, bestBuyStockResults.find((item) => item.bestBuySku === manual.bestBuySku));
  let nextStoreStock = updateStoreStockFromBestBuy(bestBuyStoreStock, manual, nextHistory);
  saveBestBuyStock({ results: nextResults, history: nextHistory, storeStock: nextStoreStock });
  setBestBuyMessage("Manual Best Buy stock row saved for beta tracking.");
}

function generateBestBuyNightlyReportNow() {
  const report = generateNightlyBestBuyStockReport({
    results: bestBuyStockResults,
    history: bestBuyStockHistory,
    settings: bestBuyNightlySettings,
  });
  const delivery = sendNightlyBestBuyStockReport(report);
  const nextReports = [delivery.report, ...bestBuyNightlyReports].slice(0, 20);
  const nextAlerts = [
    {
      alertId: makeScoutId("bestbuy-nightly-alert"),
      type: "New nightly report available",
      title: "Best Buy nightly report",
      message: report.summary,
      sourceStatus: report.sourceStatus,
      createdAt: new Date().toISOString(),
    },
    ...bestBuyAlerts,
  ].slice(0, 25);
  saveBestBuyStock({ nightlyReports: nextReports, alerts: nextAlerts });
  setBestBuyMessage(delivery.message);
}

function updateTidepoolForm(field, value) {
  setTidepoolForm((current) => ({ ...current, [field]: value }));
}

function updateEventForm(field, value) {
  setEventForm((current) => ({ ...current, [field]: value }));
}

function resetEventForm(nextHostName = scoutProfile.displayName || "Local Scout") {
  setEventForm({
    eventTitle: "",
    eventType: "Kid-friendly Pokemon meetup",
    eventDescription: "",
    hostName: nextHostName,
    locationName: "",
    address: "",
    city: "",
    state: "VA",
    zip: "",
    onlineEvent: false,
    eventLink: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    kidFriendly: true,
    freeEvent: true,
    cost: "",
    donationAccepted: false,
    donationDetails: "",
    itemsProvided: "",
    ageRange: "",
    rsvpEnabled: true,
    maxAttendees: "",
  });
}

function submitTidepoolEvent(event) {
  event.preventDefault();
  if (!eventForm.eventTitle.trim() || !eventForm.eventDescription.trim()) {
    setError("Add an event title and description before submitting.");
    return;
  }
  const newEvent = makeTidepoolEvent({
    ...eventForm,
    userId: LOCAL_SCOUT_USER_ID,
    organizerName: eventForm.hostName,
    eventStatus: "pending",
    verificationStatus: "pending",
    sourceType: "user",
    attendeeCount: 0,
  });
  const nextEvents = [newEvent, ...tidepoolEvents];
  const nextProfile = {
    ...scoutProfile,
    displayName: eventForm.hostName || scoutProfile.displayName,
    rewardPoints: Number(scoutProfile.rewardPoints || 0) + 3,
    lastReportDate: new Date().toISOString(),
  };
  saveTidepoolEvents(nextEvents);
  saveScoutProfile(nextProfile);
  resetEventForm(nextProfile.displayName);
  setTidepoolEventFilter("My Events");
  setError("");
}

function updateTidepoolEvent(eventId, updater) {
  const nextEvents = tidepoolEvents.map((item) =>
    item.eventId === eventId ? updater(item) : item
  );
  saveTidepoolEvents(nextEvents);
}

function rsvpTidepoolEvent(eventId) {
  updateTidepoolEvent(eventId, (item) => ({
    ...item,
    interested: true,
    attendeeCount: Number(item.attendeeCount || 0) + (item.interested ? 0 : 1),
    updatedAt: new Date().toISOString(),
  }));
}

function saveTidepoolEvent(eventId) {
  updateTidepoolEvent(eventId, (item) => ({ ...item, saved: true, updatedAt: new Date().toISOString() }));
}

function reportTidepoolEvent(eventId) {
  updateTidepoolEvent(eventId, (item) => ({ ...item, reported: true, updatedAt: new Date().toISOString() }));
  setError("Event report saved for admin review.");
}

function shareTidepoolEvent(event) {
  const text = `${event.eventTitle} - ${event.startDate || "Date TBD"} ${event.startTime || ""} - ${event.locationName || event.city || "Location TBD"}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
  setError("Event share text copied when clipboard is available.");
}

function adminSetTidepoolEventStatus(eventId, eventStatus, verificationStatus = "") {
  updateTidepoolEvent(eventId, (item) => ({
    ...item,
    eventStatus,
    verificationStatus: verificationStatus || item.verificationStatus,
    updatedAt: new Date().toISOString(),
  }));
}

function submitTidepoolReport(event) {
  event.preventDefault();
  if (scoutProfile.cooldownUntil && new Date(scoutProfile.cooldownUntil) > new Date()) {
    setError("Reporting is paused until your cooldown ends.");
    return;
  }
  if (!tidepoolForm.reportText.trim()) {
    setError("Add report details before submitting to Tidepool.");
    return;
  }

  const selected = selectedStore || {};
  const report = makeTidepoolReport({
    userId: LOCAL_SCOUT_USER_ID,
    displayName: tidepoolForm.anonymous ? "Anonymous Scout" : tidepoolForm.displayName || scoutProfile.displayName,
    anonymous: tidepoolForm.anonymous,
    storeId: selected.id || "",
    storeName: selected.name || "Online / Unknown store",
    productName: tidepoolForm.productName,
    reportType: tidepoolForm.reportType,
    reportText: tidepoolForm.reportText,
    photoUrl: tidepoolForm.photoUrl,
    quantitySeen: tidepoolForm.quantitySeen,
    price: tidepoolForm.price,
    purchaseLimit: tidepoolForm.purchaseLimit,
    city: selected.city || "",
    state: selected.state || "VA",
    zip: selected.zip || "",
    verificationStatus: "pending",
    confidenceScore: tidepoolForm.photoUrl ? 68 : Math.max(30, Math.min(95, scoutProfile.trustScore - 10)),
    sourceType: tidepoolForm.photoUrl ? "photo" : "user",
  });
  const nextReports = [report, ...tidepoolReports];
  const nextProfile = {
    ...scoutProfile,
    displayName: tidepoolForm.displayName || scoutProfile.displayName,
    reportStreak: Number(scoutProfile.reportStreak || 0) + 1,
    rewardPoints: Number(scoutProfile.rewardPoints || 0) + 2,
    lastReportDate: new Date().toISOString(),
  };
  saveTidepoolReports(nextReports);
  saveScoutProfile(nextProfile);
  setTidepoolForm({
    displayName: nextProfile.displayName,
    anonymous: false,
    reportType: "Restock sighting",
    reportText: "",
    productName: "",
    quantitySeen: "",
    price: "",
    purchaseLimit: "",
    photoUrl: "",
  });
  setError("");
}

function updateTidepoolReport(reportId, updater) {
  const nextReports = tidepoolReports.map((report) =>
    report.reportId === reportId ? updater(report) : report
  );
  saveTidepoolReports(nextReports);
}

function confirmTidepoolReport(reportId) {
  const report = tidepoolReports.find((item) => item.reportId === reportId);
  if (!report) return;
  if (report.userId === LOCAL_SCOUT_USER_ID) {
    setError("You cannot verify your own report.");
    return;
  }
  updateTidepoolReport(reportId, (current) => {
    const verifiedByCount = Number(current.verifiedByCount || 0) + 1;
    const confidenceScore = Math.min(99, Number(current.confidenceScore || 0) + 12);
    return {
      ...current,
      verifiedByCount,
      helpfulVotes: Number(current.helpfulVotes || 0) + 1,
      confidenceScore,
      verificationStatus: verifiedByCount >= 2 || confidenceScore >= 80 ? "verified" : current.verificationStatus,
      lastUpdated: new Date().toISOString(),
    };
  });
  saveScoutProfile({
    ...scoutProfile,
    rewardPoints: Number(scoutProfile.rewardPoints || 0) + 1,
    helpfulVotes: Number(scoutProfile.helpfulVotes || 0) + 1,
  });
  setError("");
}

function disputeTidepoolReport(reportId) {
  const report = tidepoolReports.find((item) => item.reportId === reportId);
  if (!report) return;
  if (report.userId === LOCAL_SCOUT_USER_ID) {
    setError("Use edit/delete for your own reports instead of disputing them.");
    return;
  }
  updateTidepoolReport(reportId, (current) => {
    const disputedByCount = Number(current.disputedByCount || 0) + 1;
    const confidenceScore = Math.max(0, Number(current.confidenceScore || 0) - 15);
    return {
      ...current,
      disputedByCount,
      confidenceScore,
      verificationStatus: disputedByCount >= 2 ? "disputed" : "pending",
      lastUpdated: new Date().toISOString(),
    };
  });
  setError("");
}

function adminSetTidepoolStatus(reportId, verificationStatus) {
  updateTidepoolReport(reportId, (current) => ({
    ...current,
    verificationStatus,
    confidenceScore: verificationStatus === "verified" ? 95 : current.confidenceScore,
    sourceType: verificationStatus === "verified" ? "admin" : current.sourceType,
    lastUpdated: new Date().toISOString(),
  }));
}

function toggleRouteStore(storeId) {
  setRouteForm((current) => {
    const selected = current.selectedStoreIds.includes(storeId)
      ? current.selectedStoreIds.filter((id) => id !== storeId)
      : [...current.selectedStoreIds, storeId];
    return { ...current, selectedStoreIds: selected };
  });
}

function updateRouteForm(field, value) {
  setRouteForm((current) => ({ ...current, [field]: value }));
}

function toggleRouteGroup(group) {
  setRouteForm((current) => {
    const included = current.includedGroups || STORE_GROUP_ORDER;
    const next = included.includes(group)
      ? included.filter((item) => item !== group)
      : [...included, group];
    return { ...current, includedGroups: next };
  });
}

function generateSuggestedRoute() {
  if (!onLocationRequired("route-planner")) return;
  if (suggestedRouteStops.length === 0) {
    setError("No stores match those route filters.");
    return;
  }
  setRouteForm((current) => ({
    ...current,
    routeName: current.routeName || `Suggested Route: ${current.routeGoal}`,
    selectedStoreIds: suggestedRouteStops.map((stop) => stop.store.id),
    notes: `Generated for ${current.routeGoal}. Starting ZIP: ${current.startingZip || "not set"}.`,
  }));
  setError("");
}

function removeRouteStop(storeId) {
  setRouteForm((current) => ({
    ...current,
    selectedStoreIds: current.selectedStoreIds.filter((id) => id !== storeId),
    lockedStoreIds: (current.lockedStoreIds || []).filter((id) => id !== storeId),
  }));
}

function toggleLockedRouteStop(storeId) {
  setRouteForm((current) => {
    const locked = current.lockedStoreIds || [];
    return {
      ...current,
      lockedStoreIds: locked.includes(storeId) ? locked.filter((id) => id !== storeId) : [...locked, storeId],
    };
  });
}

function moveRouteStop(storeId, direction) {
  setRouteForm((current) => {
    const selected = [...current.selectedStoreIds];
    const index = selected.indexOf(storeId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= selected.length) return current;
    [selected[index], selected[nextIndex]] = [selected[nextIndex], selected[index]];
    return { ...current, selectedStoreIds: selected };
  });
}

function routeStopDetails(storeId) {
  return scoredRouteCandidates.find((candidate) => String(candidate.store.id) === String(storeId));
}

function saveRoute(event) {
  event.preventDefault();

  if (!routeForm.routeName || routeForm.selectedStoreIds.length === 0) {
    setError("Add a route name and at least one store.");
    return;
  }

  const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
  const newRoute = {
    id: makeScoutId("route"),
    routeName: routeForm.routeName,
    startingZip: routeForm.startingZip,
    routeGoal: routeForm.routeGoal,
    region: routeForm.region,
    includedGroups: routeForm.includedGroups,
    maxStops: routeForm.maxStops,
    maxDistance: routeForm.maxDistance,
    maxTripTime: routeForm.maxTripTime,
    selectedStoreIds: routeForm.selectedStoreIds,
    lockedStoreIds: routeForm.lockedStoreIds || [],
    completed: !!routeForm.completed,
    notes: routeForm.notes,
    routeDate: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
  };
  const nextRoutes = [newRoute, ...(saved.routes || [])];
  saveLocalScout({ routes: nextRoutes });
  setRoutes(nextRoutes);
  setRouteForm({
    routeName: "Suggested Route",
    startingZip: routeForm.startingZip,
    routeGoal: routeForm.routeGoal,
    region: routeForm.region,
    includedGroups: routeForm.includedGroups,
    maxStops: routeForm.maxStops,
    maxDistance: routeForm.maxDistance,
    maxTripTime: routeForm.maxTripTime,
    selectedStoreIds: [],
    lockedStoreIds: [],
    completed: false,
    notes: "",
  });
  setError("");
}

function markRouteCompleted(routeId) {
  const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
  const nextRoutes = (saved.routes || routes).map((route) =>
    route.id === routeId ? { ...route, completed: true, completedAt: new Date().toISOString() } : route
  );
  saveLocalScout({ routes: nextRoutes });
  setRoutes(nextRoutes);
}

function updateRouteStopNote(routeId, storeId, note) {
  const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
  const nextRoutes = (saved.routes || routes).map((route) =>
    route.id === routeId
      ? { ...route, stopNotes: { ...(route.stopNotes || {}), [storeId]: note } }
      : route
  );
  saveLocalScout({ routes: nextRoutes });
  setRoutes(nextRoutes);
}

function deleteRoute(routeId) {
  const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
  const nextRoutes = (saved.routes || []).filter((route) => route.id !== routeId);
  saveLocalScout({ routes: nextRoutes });
  setRoutes(nextRoutes);
}

function routeMapUrl(route) {
  const selectedStores = route.selectedStoreIds
    .map((storeId) => stores.find((store) => store.id === storeId))
    .filter(Boolean);
  const query = selectedStores
    .map((store) => `${store.name} ${store.address || ""} ${store.city || ""}`)
    .join("/");
  return `https://www.google.com/maps/dir/${query
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function openInForge(item) {
  const forgeBaseUrl = window.location.origin || "/";

  const params = new URLSearchParams({
    productName: item.name || "",
    store: selectedStore?.name || "",
    barcode: item.upc || "",
    sku: item.sku || "",
    productUrl: item.productUrl || "",
    productType: item.category || "",
  });

  window.open(`${forgeBaseUrl}?${params.toString()}`, "_blank");
}
  useEffect(() => {
    if (selectedStore) {
      setEditStoreForm({
        name: selectedStore.name || "",
        chain: selectedStore.chain || "",
        storeGroup: selectedStore.storeGroup || getStoreGroup(selectedStore),
        city: selectedStore.city || "",
        address: selectedStore.address || "",
        phone: selectedStore.phone || "",
      });
    }
  }, [selectedStore]);

  async function handleCreateStore(e) {
  e.preventDefault();
  if (BETA_LOCAL_SCOUT) {
    const newStore = normalizeStoreGroup({
      id: makeScoutId("store-review"),
      name: storeForm.name,
      chain: storeForm.chain,
      storeGroup: storeForm.storeGroup,
      city: storeForm.city,
      address: storeForm.address,
      phone: storeForm.phone,
      type: "Big Box",
      status: "Unknown",
      stockDays: [],
      truckDays: [],
      priority: false,
      createdAt: new Date().toISOString(),
      reviewStatus: "pending",
      isActive: false,
    });
    const suggestion = submitSharedDataSuggestion({
      suggestionType: SUGGESTION_TYPES.ADD_MISSING_STORE,
      targetTable: "stores",
      submittedData: newStore,
      notes: "Submitted from Scout store form.",
    }, setError);
    if (!suggestion) return;
    setStoreForm({ name: "", chain: "", storeGroup: "", city: "", address: "", phone: "" });
    setError("Store submitted for admin review. It will not appear publicly until approved.");
    return;
  }

  try {
    await createStore({
      name: storeForm.name,
      chain: storeForm.chain,
      storeGroup: storeForm.storeGroup || getStoreGroup(storeForm),
      city: storeForm.city,
      address: storeForm.address,
      phone: storeForm.phone,
      type: "Big Box",
      stockDays: [],
      truckDays: [],
      priority: false,
    });

    setStoreForm({
      name: "",
      chain: "",
      storeGroup: "",
      city: "",
      address: "",
      phone: "",
    });

    await loadStores();
  } catch (err) {
    setError(err.message || "Failed to create store");
  }
}

async function handleUpdateStore(e) {
  e.preventDefault();
  if (!selectedStoreId) return;

  if (BETA_LOCAL_SCOUT) {
    const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
    const nextStores = (saved.stores || []).map((store) =>
      store.id === selectedStoreId
        ? normalizeStoreGroup({
            ...store,
            name: editStoreForm.name,
            chain: editStoreForm.chain,
            storeGroup: editStoreForm.storeGroup,
            city: editStoreForm.city,
            address: editStoreForm.address,
            phone: editStoreForm.phone,
          })
        : store
    );
    saveLocalScout({ stores: nextStores });
    setStores(nextStores);
    setIsEditingStore(false);
    return;
  }

  try {
    await updateStore(selectedStoreId, {
      name: editStoreForm.name,
      chain: editStoreForm.chain,
      storeGroup: editStoreForm.storeGroup || getStoreGroup(editStoreForm),
      city: editStoreForm.city,
      address: editStoreForm.address,
      phone: editStoreForm.phone,
    });

    setIsEditingStore(false);
    await loadStores();
    await loadStoreDetails(selectedStoreId);
  } catch (err) {
    setError(err.message || "Failed to update store");
  }
}

  async function handleCreateReport(e) {
    e.preventDefault();
    const activeStoreId = selectedStoreId;
    if (!activeStoreId) {
      setError("Select a store before submitting a Scout report.");
      return;
    }
    const submitMode = e.currentTarget?.dataset?.submitMode || e.nativeEvent?.submitter?.value || "public";
    if (e.currentTarget?.dataset) e.currentTarget.dataset.submitMode = "";
    const submitForReview = submitMode === "review";
    const note = String(reportForm.note || "").trim();
    const photoUrls = [
      ...(Array.isArray(reportForm.photoUrls) ? reportForm.photoUrls : []),
      reportForm.imageUrl,
    ]
      .map((url) => String(url || "").trim())
      .filter(Boolean);
    const uniquePhotoUrls = [...new Set(photoUrls)];
    const itemsSeen = normalizeReportItemsForForm(reportForm)
      .map((item) => ({
        productId: item.productId || "",
        productName: String(item.productName || "").trim(),
        productType: item.productType || "",
        quantity: item.quantity === "" ? "" : item.quantity,
        price: item.price === "" ? "" : item.price,
        note: item.note || "",
        catalogProductSnapshot: item.catalogProductSnapshot || null,
        manualItemEntry: Boolean(item.manualItemEntry || !item.productId),
      }))
      .filter((item) => item.productName);
    const hasQuickReportSignal = Boolean(note || reportForm.stockStatus || uniquePhotoUrls.length || itemsSeen.length || reportForm.itemName);
    if (!hasQuickReportSignal) {
      setError("Add a quick stock status, note, photo, or optional item before submitting.");
      return;
    }
    const firstItem = itemsSeen[0] || makeBlankReportItem();
    const needsReview = submitForReview
      || Boolean(reportForm.needsReview)
      || (uniquePhotoUrls.length > 0 && itemsSeen.length === 0)
      || reportForm.stockStatus === "unknown";
    const verificationStatus = needsReview
      ? (submitForReview ? "pending" : "needs_review")
      : reportForm.verified ? "verified" : "user_report";
    const reportLevel = itemsSeen.length
      ? uniquePhotoUrls.length ? "photo_itemized" : "itemized"
      : uniquePhotoUrls.length ? "photo" : "general";
    const nowParts = getScoutReportNowParts();
    const reportDate = reportForm.reportTimeManuallyEdited ? reportForm.reportDate || nowParts.date : nowParts.date;
    const reportTime = reportForm.reportTimeManuallyEdited ? reportForm.reportTime || nowParts.time : nowParts.time;
    const reportedAt = reportForm.reportTimeManuallyEdited
      ? reportForm.reportedAt || `${reportDate}T${reportTime}:00`
      : nowParts.iso;
    const storeForPayload = stores.find((store) => String(store.id) === String(activeStoreId)) || {};
    const evidence = [
      ...(Array.isArray(reportForm.evidence) ? reportForm.evidence : []),
      ...uniquePhotoUrls.map((url) => ({
        type: "photo",
        url,
        transcript: "",
        submittedBy: "user",
        private: reportForm.visibility !== "public_cleaned",
      })),
      note ? {
        type: "note",
        url: "",
        transcript: note,
        submittedBy: "user",
        private: reportForm.visibility !== "public_cleaned",
      } : null,
    ].filter(Boolean);

    const reportPayload = {
        storeId: activeStoreId,
        storeName: storeForPayload.nickname || storeForPayload.name || "",
        retailer: storeForPayload.chain || storeForPayload.storeGroup || "",
        city: storeForPayload.city || "",
        region: storeForPayload.region || "",
        reportType: reportForm.reportType,
        stockStatus: reportForm.stockStatus,
        stock_status: reportForm.stockStatus,
        itemName: firstItem.productName || (reportForm.reportType === "Store Correction" ? reportForm.itemName : ""),
        quantitySeen: firstItem.quantity || "",
        price: firstItem.price || "",
        note,
        reportDate,
        reportTime,
        reportedAt,
        reported_at: reportedAt,
        submittedAt: nowParts.iso,
        submitted_at: nowParts.iso,
        timezone: reportForm.timezone || nowParts.timezone,
        reportedBy: reportForm.reportedBy,
        verified: needsReview ? false : reportForm.verified,
        verificationStatus,
        sourceType: reportForm.sourceType || (uniquePhotoUrls.length ? "photo_report" : "user_report"),
        source_type: reportForm.sourceType || (uniquePhotoUrls.length ? "photo_report" : "user_report"),
        confidence: reportForm.confidence || (uniquePhotoUrls.length ? "confirmed" : "possible"),
        visibility: reportForm.visibility || "public_cleaned",
        evidence,
        lat: reportForm.lat,
        lng: reportForm.lng,
        imageUrl: uniquePhotoUrls[0] || "",
        photoUrls: uniquePhotoUrls,
        photo_urls: uniquePhotoUrls,
        catalogProductId: firstItem.productId || reportForm.catalogProductId || "",
        catalogProductSnapshot: firstItem.catalogProductSnapshot || reportForm.catalogProductSnapshot || null,
        manualItemName: firstItem.productId ? "" : firstItem.productName || "",
        itemsSeen,
        items_seen: itemsSeen,
        aiDetectedItems: reportForm.aiDetectedItems || [],
        ai_detected_items: reportForm.aiDetectedItems || [],
        needsReview,
        needs_review: needsReview,
        reportLevel,
        report_level: reportLevel,
      };

    if (BETA_LOCAL_SCOUT) {
      const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");

      if (editingReportId) {
        const nextReports = (saved.reports || []).map((report) =>
          report.id === editingReportId
            ? { ...report, ...reportPayload, updatedAt: new Date().toISOString() }
            : report
        );
        saveLocalScout({ reports: nextReports });
        setAllReports(nextReports);
        setSelectedStoreId(activeStoreId);
        setReports(nextReports.filter((report) => getReportStoreId(report) === activeStoreId));
        resetReportForm();
        setError(submitForReview ? "Report sent for review." : "Report submitted.");
        return;
      }

      const newReport = {
        ...reportPayload,
        id: makeScoutId("report"),
        createdAt: new Date().toISOString(),
      };
      const nextReports = [newReport, ...(saved.reports || [])];
      const nextStores = (saved.stores || stores).map((store) =>
        store.id === activeStoreId
          ? { ...store, status: scoutStockStoreStatus(reportForm.stockStatus), lastRestock: reportForm.reportDate || new Date().toISOString().slice(0, 10) }
          : store
      );
      saveLocalScout({ stores: nextStores, reports: nextReports });
      setStores(nextStores);
      setAllReports(nextReports);
      setSelectedStoreId(activeStoreId);
      setReports(nextReports.filter((report) => getReportStoreId(report) === activeStoreId));
      resetReportForm();
      setError(submitForReview ? "Report sent for review." : "Report submitted.");
      return;
    }

    try {
      if (editingReportId) {
        await updateReport(activeStoreId, editingReportId, reportPayload);
      } else {
        await createReport(activeStoreId, reportPayload);
      }

      resetReportForm();

      setSelectedStoreId(activeStoreId);
      await loadStoreDetails(activeStoreId);
      await loadStores();
    } catch (err) {
      setError(err.message || "Failed to save report");
    }
  }

  async function handleDeleteReport(reportId) {
    if (!selectedStoreId) return;

    if (BETA_LOCAL_SCOUT) {
      const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
      const nextReports = (saved.reports || []).filter((report) => report.id !== reportId);
      saveLocalScout({ reports: nextReports });
      setAllReports(nextReports);
      setReports(nextReports.filter((report) => getReportStoreId(report) === selectedStoreId));
      if (editingReportId === reportId) resetReportForm();
      setError("");
      return;
    }

    try {
      await deleteReport(selectedStoreId, reportId);
      if (editingReportId === reportId) resetReportForm();
      await loadStoreDetails(selectedStoreId);
      await loadStores();
    } catch (err) {
      setError(err.message || "Failed to delete report");
    }
  }

  function handleSaveScreenshotTip(event) {
    event.preventDefault();
    const activeStoreId = selectedStoreId;

    if (!activeStoreId) {
      setError("Select or create a store before saving a screenshot.");
      return;
    }

    if (!tipImport.screenshotPreview) {
      setError("Upload a screenshot before saving.");
      return;
    }

    if (!tipImport.productName && !tipImport.notes) {
      setError("Add a product name or notes before saving a screenshot.");
      return;
    }

    const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
    const reportDate = tipImport.reportDate || new Date().toISOString().slice(0, 10);
    const nowParts = getScoutReportNowParts();
    const reportTime = tipImport.reportTime || nowParts.time;
    const screenshotLocalId = tipImport.keepScreenshot ? makeScoutId("screenshot") : "";
    const screenshotItemsSeen = tipImport.productName
      ? [
          makeBlankReportItem({
            productName: tipImport.productName,
            productType: tipImport.productCategory || "Sealed product",
            quantity: tipImport.quantitySeen,
            price: tipImport.price,
            note: tipImport.limitInfo ? `Limit: ${tipImport.limitInfo}` : "",
            manualItemEntry: true,
          }),
        ]
      : [];
    const newReport = {
      id: makeScoutId("report"),
      storeId: activeStoreId,
      itemName: tipImport.productName || "",
      productName: tipImport.productName || "",
      productCategory: tipImport.productCategory || "Pokemon",
      note: [
        tipImport.notes,
        tipImport.quantitySeen ? `Seen: ${tipImport.quantitySeen}` : "",
        tipImport.quantityRemaining ? `Remaining: ${tipImport.quantityRemaining}` : "",
        tipImport.limitInfo ? `Limit: ${tipImport.limitInfo}` : "",
      ]
        .filter(Boolean)
        .join(" | "),
      reportDate,
      reportTime,
      reportedAt: `${reportDate}T${reportTime}:00`,
      reported_at: `${reportDate}T${reportTime}:00`,
      submittedAt: nowParts.iso,
      submitted_at: nowParts.iso,
      timezone: nowParts.timezone,
      dayOfWeek: dayName(reportDate),
      reportedBy: "Screenshot",
      verified: tipImport.verified,
      verificationStatus: tipImport.verified ? "verified" : "needs_review",
      reportType: "facebook_screenshot",
      report_type: "facebook_screenshot",
      sourceFormat: "facebook_screenshot",
      source_format: "facebook_screenshot",
      sourceName: tipImport.sourceName,
      source_name: tipImport.sourceName,
      sourceType: "text_screenshot",
      source_type: "text_screenshot",
      confidence: tipImport.verified ? "confirmed" : "likely",
      visibility: "private",
      stockStatus: tipImport.stockStatus,
      stock_status: tipImport.stockStatus,
      quantitySeen: tipImport.quantitySeen,
      quantity_seen: tipImport.quantitySeen,
      itemsSeen: screenshotItemsSeen,
      items_seen: screenshotItemsSeen,
      aiDetectedItems: [],
      ai_detected_items: [],
      needsReview: !tipImport.productName || !tipImport.verified,
      needs_review: !tipImport.productName || !tipImport.verified,
      quantityRemaining: tipImport.quantityRemaining,
      quantity_remaining: tipImport.quantityRemaining,
      limitInfo: tipImport.limitInfo,
      limit_info: tipImport.limitInfo,
      extractionConfidence: tipImport.extractionConfidence,
      extraction_confidence: tipImport.extractionConfidence,
      userVerifiedExtraction: true,
      user_verified_extraction: true,
      originalText: "",
      original_text: "",
      extractedJson: {
        betaMode: true,
        aiExtractionConfigured: false,
        source: "manual_review",
      },
      extracted_json: {
        betaMode: true,
        aiExtractionConfigured: false,
        source: "manual_review",
      },
      createdFromScreenshot: true,
      created_from_screenshot: true,
      screenshotLocalId,
      screenshot_local_id: screenshotLocalId,
      imageUrl: tipImport.keepScreenshot ? tipImport.screenshotPreview : "",
      photoUrls: tipImport.keepScreenshot && tipImport.screenshotPreview ? [tipImport.screenshotPreview] : [],
      photo_urls: tipImport.keepScreenshot && tipImport.screenshotPreview ? [tipImport.screenshotPreview] : [],
      rawProductText: tipImport.productName || tipImport.notes || "",
      raw_product_text: tipImport.productName || tipImport.notes || "",
      matchedProducts: [],
      matched_products: [],
      needsCatalogReview: Boolean(tipImport.productName),
      needs_catalog_review: Boolean(tipImport.productName),
      evidence: [{
        type: "screenshot",
        url: tipImport.keepScreenshot ? tipImport.screenshotPreview : "",
        transcript: tipImport.notes,
        submittedBy: "user",
        private: true,
      }],
      createdAt: new Date().toISOString(),
    };

    const nextReports = [newReport, ...(saved.reports || [])];
    const nextStores = (saved.stores || stores).map((store) =>
      store.id === activeStoreId
        ? { ...store, status: tipImport.stockStatus === "sold_out" ? "Sold Out" : "Found", lastRestock: reportDate }
        : store
    );

    saveLocalScout({ stores: nextStores, reports: nextReports });
    setStores(nextStores);
    setAllReports(nextReports);
    setSelectedStoreId(activeStoreId);
    setReports(nextReports.filter((report) => getReportStoreId(report) === activeStoreId));
    resetTipImport();
    setError("");
  }

  function applyScreenshotTipToReportForm() {
    const noteParts = [
      tipImport.notes,
      tipImport.quantitySeen ? `Quantity seen: ${tipImport.quantitySeen}` : "",
      tipImport.quantityRemaining ? `Quantity remaining: ${tipImport.quantityRemaining}` : "",
      tipImport.limitInfo ? `Limit: ${tipImport.limitInfo}` : "",
      tipImport.sourceName ? `Source: ${tipImport.sourceName}` : "",
      tipImport.stockStatus ? `Status: ${tipImport.stockStatus}` : "",
      tipImport.extractionConfidence ? `Confidence: ${tipImport.extractionConfidence}%` : "",
    ].filter(Boolean);

    setReportForm((current) => ({
      ...current,
      reportType: current.reportType || "Restock Sighting",
      itemName: tipImport.productName || current.itemName,
      quantitySeen: tipImport.quantitySeen || current.quantitySeen,
      price: tipImport.price || current.price,
      note: noteParts.join(" | ") || current.note,
      reportDate: tipImport.reportDate || current.reportDate,
      reportTime: tipImport.reportTime || current.reportTime,
      reportTimeManuallyEdited: Boolean(tipImport.reportDate || tipImport.reportTime),
      reportedBy: tipImport.sourceName || current.reportedBy || "Screenshot",
      verified: tipImport.verified,
      imageUrl: tipImport.keepScreenshot ? tipImport.screenshotPreview || current.imageUrl : current.imageUrl,
      photoUrls: tipImport.keepScreenshot && tipImport.screenshotPreview ? [tipImport.screenshotPreview] : current.photoUrls || [],
      stockStatus: tipImport.stockStatus || current.stockStatus,
      sourceType: "text_screenshot",
      confidence: tipImport.verified ? "confirmed" : "likely",
      visibility: "private",
      needsReview: true,
      itemsSeen: [
        makeBlankReportItem({
          productName: tipImport.productName || current.itemsSeen?.[0]?.productName || "",
          productType: tipImport.productCategory || "Sealed product",
          quantity: tipImport.quantitySeen || current.itemsSeen?.[0]?.quantity || "",
          price: tipImport.price || current.itemsSeen?.[0]?.price || "",
          note: tipImport.limitInfo ? `Limit: ${tipImport.limitInfo}` : current.itemsSeen?.[0]?.note || "",
          manualItemEntry: true,
        }),
      ],
    }));
    setError("Screenshot fields were copied into the report review form. Review/edit, then submit.");
  }

  function inferIntelSourceType(text = "") {
    const normalized = text.toLowerCase();
    if (normalized.includes("called") || normalized.includes("worker told") || normalized.includes("employee")) return "called_store";
    if (normalized.includes("facebook") || normalized.includes("post")) return "social_media_post";
    if (normalized.includes("planner")) return "planner_guess";
    if (normalized.includes("guess") || normalized.includes("probably")) return "manual_prediction";
    return "text_screenshot";
  }

  function inferIntelConfidence(text = "", sourceType = "text_screenshot") {
    const normalized = text.toLowerCase();
    if (sourceType === "called_store" || normalized.includes("confirmed")) return "confirmed";
    if (normalized.includes("heard") || normalized.includes("apparently")) return "possible";
    if (sourceType === "planner_guess" || sourceType === "manual_prediction") return "guess";
    return "likely";
  }

  function matchStoreAliasFromText(text = "") {
    const normalized = text.toLowerCase();
    const aliasMatch = SCOUT_STORE_ALIASES.find((entry) => normalized.includes(String(entry.alias || "").toLowerCase()));
    if (!aliasMatch) return { storeAlias: "", retailer: "" };
    return {
      storeAlias: aliasMatch.likelyStore || aliasMatch.likelyStoreOptions?.[0] || aliasMatch.likelyArea || aliasMatch.alias,
      retailer: aliasMatch.retailer || (aliasMatch.likelyStore || aliasMatch.likelyStoreOptions?.[0] || "").split(" ").slice(-1)[0] || "",
    };
  }

  function extractIntelProducts(text = "") {
    const productTerms = ["ETB", "box", "boxes", "bundle", "bundles", "tin", "tins", "blister", "blisters", "booster", "First Partner", "One Piece", "OP", "PO", "AH", "pin collection", "poster"];
    return productTerms.filter((term) => text.toLowerCase().includes(term.toLowerCase()));
  }

  function previewIntelImport() {
    const rows = intelImportText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const alias = matchStoreAliasFromText(line);
        const sourceType = inferIntelSourceType(line);
        const productsMentioned = extractIntelProducts(line);
        return {
          id: makeScoutId(`intel-preview-${index}`),
          storeAlias: alias.storeAlias || "Needs store review",
          retailer: alias.retailer || "Needs retailer review",
          sourceText: line,
          rawProductText: productsMentioned.join(", ") || line,
          productsMentioned,
          matchedProducts: [],
          needsCatalogReview: true,
          confidence: inferIntelConfidence(line, sourceType),
          sourceType,
          visibility: "private",
          evidence: [{
            type: sourceType === "called_store" ? "call" : "screenshot",
            url: "",
            transcript: line,
            submittedBy: "user",
            private: true,
          }],
          createdAt: new Date().toISOString(),
        };
      });
    setIntelImportPreview(rows);
    setError(rows.length ? `Found ${rows.length} possible report${rows.length === 1 ? "" : "s"} for review.` : "Paste or upload restock intel before previewing.");
  }

  function saveIntelImportRows(rows = intelImportPreview) {
    if (!rows.length) {
      setError("Preview restock intel before saving.");
      return;
    }
    const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
    const nextIntel = [...rows, ...(saved.restockIntel || restockIntel || [])];
    const nextPatterns = buildScoutRestockPatterns(nextIntel);
    saveLocalScout({
      restockIntel: nextIntel,
      restockPatterns: nextPatterns,
      intelImportReviews: rows,
      storeAliases: SCOUT_STORE_ALIASES,
    });
    setRestockIntel(nextIntel);
    setRestockPatterns(nextPatterns);
    setIntelImportPreview([]);
    setIntelImportText("");
    setError("Restock intel saved privately for review.");
  }

  async function handleCreateItem(e) {
    e.preventDefault();
    const activeStoreId = selectedStoreId || stores[0]?.id;
    if (!activeStoreId) return;

    if (BETA_LOCAL_SCOUT) {
      const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
      const itemPayload = {
        ...itemForm,
        storeId: activeStoreId,
      };

      if (editingTrackedItemId) {
        const nextItems = (saved.items || []).map((item) =>
          item.id === editingTrackedItemId
            ? { ...item, ...itemPayload, updatedAt: new Date().toISOString() }
            : item
        );
        saveLocalScout({ items: nextItems });
        setSelectedStoreId(activeStoreId);
        setItems(nextItems.filter((item) => item.storeId === activeStoreId));
        resetTrackedItemForm();
        setTrackedProductsModalOpen(false);
        setError("Tracked product saved.");
        return;
      }

      const newItem = {
        ...itemPayload,
        id: makeScoutId("tracked"),
        createdAt: new Date().toISOString(),
      };
      const nextItems = [newItem, ...(saved.items || [])];
      saveLocalScout({ items: nextItems });
      setSelectedStoreId(activeStoreId);
      setItems(nextItems.filter((item) => item.storeId === activeStoreId));
      resetTrackedItemForm();
      setTrackedProductsModalOpen(false);
      setError("Product sighting added.");
      return;
    }

    try {
      if (editingTrackedItemId) {
        await updateTrackedItem(activeStoreId, editingTrackedItemId, itemForm);
      } else {
        await createTrackedItem(activeStoreId, itemForm);
      }
      resetTrackedItemForm();
      setTrackedProductsModalOpen(false);
      setSelectedStoreId(activeStoreId);
      await loadStoreDetails(activeStoreId);
    } catch (err) {
      setError(err.message || "Failed to save tracked item");
    }
  }

  async function handleDeleteStore(storeId) {
    if (BETA_LOCAL_SCOUT) {
      const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
      const nextStores = (saved.stores || []).filter((store) => store.id !== storeId);
      const nextReports = (saved.reports || []).filter((report) => report.storeId !== storeId);
      const nextItems = (saved.items || []).filter((item) => item.storeId !== storeId);
      saveLocalScout({ stores: nextStores, reports: nextReports, items: nextItems });
      setStores(nextStores);
      setAllReports(nextReports);
      setSelectedStoreId(nextStores[0]?.id || "");
      setReports([]);
      setItems([]);
      return;
    }

    try {
      await deleteStore(storeId);
      setSelectedStoreId("");
      setReports([]);
      setItems([]);
      await loadStores();
    } catch (err) {
      setError(err.message || "Failed to delete store");
    }
  }

  async function handleMarkItemInStock(itemId) {
    if (!selectedStoreId) return;

    if (BETA_LOCAL_SCOUT) {
      const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
      const nextItems = (saved.items || []).map((item) =>
        item.id === itemId
          ? {
              ...item,
              status: "In Stock",
              inStock: true,
              lastCheckedAt: new Date().toISOString(),
              lastSeenInStockAt: new Date().toISOString(),
            }
          : item
      );
      saveLocalScout({ items: nextItems });
      setItems(nextItems.filter((item) => item.storeId === selectedStoreId));
      return;
    }

    try {
      await updateTrackedItem(selectedStoreId, itemId, {
        status: "In Stock",
        inStock: true,
        lastCheckedAt: new Date().toISOString(),
        lastSeenInStockAt: new Date().toISOString(),
      });
      await loadStoreDetails(selectedStoreId);
      await loadStores();
    } catch (err) {
      setError(err.message || "Failed to update tracked item");
    }
  }

  async function handleDeleteTrackedItem(itemId) {
    if (!selectedStoreId) return;

    if (BETA_LOCAL_SCOUT) {
      const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
      const nextItems = (saved.items || []).filter((item) => item.id !== itemId);
      saveLocalScout({ items: nextItems });
      setItems(nextItems.filter((item) => item.storeId === selectedStoreId));
      if (editingTrackedItemId === itemId) resetTrackedItemForm();
      setError("");
      return;
    }

    try {
      await deleteTrackedItem(selectedStoreId, itemId);
      if (editingTrackedItemId === itemId) resetTrackedItemForm();
      await loadStoreDetails(selectedStoreId);
      await loadStores();
    } catch (err) {
      setError(err.message || "Failed to delete tracked item");
    }
  }

  const chainOptions = useMemo(() => {
    const chains = Array.from(new Set(stores.map((s) => s.chain).filter(Boolean)));
    return ["All", ...chains.sort()];
  }, [stores]);

  const retailerCards = useMemo(() => {
    const preferredRetailers = [
      "Walmart",
      "Target",
      "Best Buy",
      "GameStop",
      "Barnes & Noble",
      "Five Below",
      "Sam's Club",
      "Costco",
      "BJ's",
      "Dollar General",
      "Walgreens",
      "CVS",
      "Local Card Shops",
    ];
    const counts = stores.reduce((acc, store) => {
      const chain = store.chain || store.retailer || getStoreGroup(store) || "Other";
      const normalizedChain = /local card|comic|hobby|game shop/i.test(`${chain} ${store.storeGroup || ""}`) ? "Local Card Shops" : chain;
      acc[normalizedChain] = (acc[normalizedChain] || 0) + 1;
      return acc;
    }, {});
    const preferred = preferredRetailers
      .map((retailer) => ({ retailer, count: counts[retailer] || 0 }))
      .filter((entry) => entry.count > 0);
    const moreCount = Object.entries(counts)
      .filter(([retailer]) => !preferredRetailers.includes(retailer))
      .reduce((sum, [, count]) => sum + count, 0);
    return moreCount > 0 ? [...preferred, { retailer: "More", count: moreCount }] : preferred;
  }, [stores]);

  const nearbyFavoriteStores = useMemo(() => {
    return sortStores(stores.filter((store) => store.favorite || store.distanceFromUser || store.distance || store.lastReportDate), "distance").slice(0, 3);
  }, [stores]);

  const regionOptions = useMemo(() => {
    const regions = Array.from(new Set(stores.map((s) => s.region).filter(Boolean)));
    return ["All", ...regions.sort()];
  }, [stores]);

  const cityOptions = useMemo(() => {
    const cities = Array.from(new Set(stores.map((s) => s.city).filter(Boolean)));
    return ["All", ...cities.sort()];
  }, [stores]);

  const countyOptions = useMemo(() => {
    const counties = Array.from(new Set(stores.map((s) => s.county).filter(Boolean)));
    return ["All", ...counties.sort()];
  }, [stores]);

  const confidenceOptions = useMemo(() => {
    const confidence = Array.from(new Set(stores.map((s) => s.pokemonConfidence).filter(Boolean)));
    return ["All", ...confidence.sort()];
  }, [stores]);

  const storeTypeOptions = useMemo(() => {
    const types = Array.from(new Set(stores.map((s) => s.storeType || s.store_type || s.type).filter(Boolean)));
    return ["All", ...types.sort()];
  }, [stores]);

  const filteredStores = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return sortStores(stores.filter((store) => {
      const storeType = store.storeType || store.store_type || store.type || "";
      const matchesSearch = storeMatchesSearch(store, storeSearch);
      const matchesChain = selectedChain === "All" || store.chain === selectedChain;
      const matchesRegion = selectedRegion === "All" || store.region === selectedRegion;
      const matchesCity = selectedCity === "All" || store.city === selectedCity;
      const matchesType = selectedStoreType === "All" || storeType === selectedStoreType;
      const matchesCounty = selectedCounty === "All" || store.county === selectedCounty;
      const matchesConfidence = selectedConfidence === "All" || store.pokemonConfidence === selectedConfidence;
      const quickMatch =
        storeQuickFilter === "all" ||
        (storeQuickFilter === "default" && (store.favorite || store.carriesPokemonLikely || store.tidepoolScore || store.restockConfidence || store.lastReportDate)) ||
        (storeQuickFilter === "favorites" && store.favorite) ||
        (storeQuickFilter === "recent" && String(store.lastReportDate || "").slice(0, 10) === today) ||
        (storeQuickFilter === "highConfidence" && ["high", "medium/high"].includes(String(store.pokemonConfidence || "").toLowerCase())) ||
        (storeQuickFilter === "strictLimits" && store.strictLimits);
      return matchesSearch && matchesChain && matchesRegion && matchesCity && matchesType && matchesCounty && matchesConfidence && quickMatch;
    }), storeSort);
  }, [stores, selectedChain, selectedRegion, selectedCity, selectedStoreType, selectedCounty, selectedConfidence, storeQuickFilter, storeSearch, storeSort]);

  const groupedFilteredStores = useMemo(() => {
    const groups = filteredStores.reduce((acc, store) => {
      const group = getStoreGroup(store);
      acc[group] = [...(acc[group] || []), store];
      return acc;
    }, {});

    return STORE_GROUP_ORDER
      .map((group) => ({
        group,
        stores: sortStores(groups[group] || [], storeSort),
      }))
      .filter((entry) => entry.stores.length > 0);
  }, [filteredStores, storeSort]);

  const pagedFilteredStores = useMemo(() => getScoutPagedItems(filteredStores, storePage, SCOUT_LIST_PAGE_SIZE), [filteredStores, storePage]);
  const groupedPagedStores = useMemo(() => {
    const groups = pagedFilteredStores.items.reduce((acc, store) => {
      const group = getStoreGroup(store);
      acc[group] = [...(acc[group] || []), store];
      return acc;
    }, {});
    return STORE_GROUP_ORDER
      .map((group) => ({
        group,
        stores: sortStores(groups[group] || [], storeSort),
      }))
      .filter((entry) => entry.stores.length > 0);
  }, [pagedFilteredStores.items, storeSort]);

  function toggleStoreGroup(group) {
    setOpenStoreGroups((current) => ({ ...current, [group]: current[group] === false }));
  }

  function openRetailerPage(retailer) {
    setSelectedChain(retailer === "More" ? "All" : retailer);
    setSelectedStoreId("");
    setStoreSearch("");
    setSelectedCity("All");
    setSelectedRegion("All");
    setSelectedStoreType("All");
    setSelectedCounty("All");
    setSelectedConfidence("All");
    setStoreQuickFilter(retailer === "More" ? "all" : "all");
    setStoreDirectoryView("retailer");
  }

  function openStoreDetail(storeId) {
    setSelectedStoreId(storeId);
    setStoreDirectoryView("detail");
  }

  function openStoreReport(storeId, reportType = "Store Restock Report") {
    setSelectedStoreId(storeId);
    setScoutSubTab("reports");
    setReportForm((current) => ({
      ...current,
      reportType,
    }));
  }

  function backToStoresLanding() {
    setSelectedStoreId("");
    setSelectedChain("All");
    setStoreSearch("");
    setStoreDirectoryView("landing");
  }

  function toggleSelectedStoreFavorite() {
    if (!selectedStoreId) return;
    toggleStoreFavorite(selectedStoreId);
  }

  function toggleStoreFavorite(storeId) {
    if (!storeId) return;
    const nextStores = stores.map((store) =>
      store.id === storeId
        ? { ...store, favorite: !store.favorite, lastUpdated: new Date().toISOString() }
        : store
    );
    if (BETA_LOCAL_SCOUT) {
      saveLocalScout({ stores: nextStores });
    }
    setStores(nextStores);
    setError("Favorite saved.");
  }

  const totals = useMemo(() => {
    const found = stores.filter((s) => s.status === "Found").length;
    return {
      stores: stores.length,
      found,
      reports: reports.length,
      items: items.length,
    };
  }, [stores, reports, items]);

  const directoryStats = useMemo(() => {
    const hamptonRoadsStores = stores.filter((store) => /hampton roads|757|williamsburg|peninsula/i.test(`${store.region || ""} ${store.city || ""}`)).length;
    const chains = new Set(stores.map((store) => store.chain || store.storeGroup || store.name).filter(Boolean));
    const militaryStores = stores.filter((store) => /nex|mcx|exchange|commissary|military|base|px|bx/i.test(`${store.chain || ""} ${store.name || ""} ${store.notes || ""}`)).length;
    return {
      totalStores: stores.length,
      hamptonRoadsStores,
      retailChains: chains.size,
      militaryStores,
    };
  }, [stores]);

  const reportStoreMap = useMemo(
    () => Object.fromEntries(stores.map((store) => [store.id, store])),
    [stores]
  );

  const reportsByStore = useMemo(() => {
    return allReports.reduce((acc, report) => {
      const storeId = getReportStoreId(report);
      if (!storeId) return acc;
      acc[storeId] = [...(acc[storeId] || []), report];
      return acc;
    }, {});
  }, [allReports]);

  function isUserOwnedScoutReport(report = {}) {
    const owner = String(report.userId || report.user_id || report.reportedBy || report.reported_by || "");
    return !owner || owner.includes(LOCAL_SCOUT_USER_ID) || owner.includes("Zena") || owner.includes("Local Scout") || BETA_LOCAL_SCOUT;
  }

  function getReportStore(report = {}) {
    const storeId = getReportStoreId(report);
    return reportStoreMap[storeId] || {
      name: report.storeName || report.store_name || "",
      chain: report.retailer || report.chain || "",
      city: report.city || "",
      region: report.region || "",
    };
  }

  function renderCompactReportCard(report, options = {}) {
    const store = getReportStore(report);
    const status = scoutReportStatusLabel(report);
    const itemsSeen = normalizeReportItemsForForm(report).filter((item) => String(item.productName || "").trim());
    const visibleItems = itemsSeen.slice(0, 3);
    const extraCount = Math.max(0, itemsSeen.length - visibleItems.length);
    const rawStoreName = store.nickname || store.name || report.storeName || report.store_name || "";
    const storeName = rawStoreName && !/unknown store/i.test(rawStoreName) ? rawStoreName : "Store not selected";
    const retailer = store.chain || store.storeGroup || report.retailer || "Retailer not added";
    const area = [store.city || report.city, store.region || report.region].filter(Boolean).join(" / ");
    const note = report.note || report.notes || report.reportText || report.report_text || "";
    const photoUrls = getScoutReportPhotoUrls(report);
    const photo = photoUrls[0] || "";
    const stockStatus = scoutStockStatusLabel(report.stockStatus || report.stock_status);
    const aiPending = Boolean(photo && !itemsSeen.length) || report.needsReview || report.needs_review;
    const sourceLabel = scoutSourceTypeLabel(report.sourceType || report.source_type);
    const confidence = report.confidence || "";
    return (
      <article className="scout-report-compact-card scout-page-report-card" key={report.id || report.reportId || `${storeName}-${note}`}>
        <div className="scout-report-card-main">
          <div className="scout-report-title-row">
            <div>
              <h3>{storeName}</h3>
              <p>{retailer}{area ? ` | ${area}` : ""}</p>
            </div>
            <span className={`status-badge scout-report-status scout-report-status-${status.toLowerCase().replace(/\s+/g, "-")}`}>{status}</span>
          </div>
          <div className="scout-report-meta">
            <span>{friendlyScoutTimestamp(report)}</span>
            {stockStatus ? <span>{stockStatus}</span> : null}
            {sourceLabel ? <span>Source: {sourceLabel}</span> : null}
            {confidence ? <span>Confidence: {confidence}</span> : null}
            <span>Submitted by {isUserOwnedScoutReport(report) ? "You" : report.displayName || report.reportedBy || report.reported_by || "Scout user"}</span>
          </div>
          <div className="scout-report-items">
            <strong>Items seen</strong>
            {visibleItems.length ? visibleItems.map((item, index) => (
              <p key={`${item.productName}-${index}`}>{summarizeReportItem(item, money)}{item.note ? ` - ${item.note}` : ""}</p>
            )) : (
              <div className="scout-report-general-details">
                {stockStatus ? <p>{stockStatus}</p> : null}
                {photo ? <p>Photo uploaded - Items not identified yet</p> : null}
                {aiPending && !photo ? <p>Items not identified yet</p> : null}
                {note && !stockStatus && !photo ? <p>General store note</p> : null}
                {!stockStatus && !photo && !note ? <p>No item details added</p> : null}
              </div>
            )}
            {extraCount ? <p className="compact-subtitle">+ {extraCount} more item{extraCount === 1 ? "" : "s"}</p> : null}
          </div>
          {!options.compact && (note || (!stockStatus && !photo)) ? <p className="scout-report-notes">{note || "No notes/details added."}</p> : null}
        </div>
        <div className="scout-report-side">
          {photo ? <img src={photo} alt="" /> : <span>No photo attached</span>}
          <OverflowMenu
            actions={[
              { label: "View", onClick: () => setSelectedReportTarget(report) },
              { label: "Edit", onClick: () => startEditingReport(report) },
            ]}
            onDelete={isUserOwnedScoutReport(report) ? () => setDeleteReportTarget(report) : null}
          />
        </div>
      </article>
    );
  }

  const dailyLocalReport = useMemo(() => {
    const today = new Date();
    const todayName = today.toLocaleDateString(undefined, { weekday: "long" });

    return stores
      .map((store) => {
        const storeReports = reportsByStore[store.id] || [];
        const reportDays = storeReports.map((report) => dayName(getReportDate(report)));
        const [commonDay, commonDayCount] = getMostCommon(reportDays);
        const reportTimes = storeReports.map((report) => getReportTime(report).slice(0, 2)).filter(Boolean);
        const [commonHour, commonHourCount] = getMostCommon(reportTimes);
        const lastReport = [...storeReports].sort((a, b) => {
          const aDate = `${getReportDate(a)}T${getReportTime(a) || "00:00"}`;
          const bDate = `${getReportDate(b)}T${getReportTime(b) || "00:00"}`;
          return new Date(bDate) - new Date(aDate);
        })[0];

        let score = 20;
        const reasons = [];

        if (commonDay && commonDay === todayName) {
          score += 35;
          reasons.push(`${todayName} is the most common report day`);
        }

        if (store.status === "Found") {
          score += 20;
          reasons.push("recent report marked this store as found");
        }

        if (lastReport?.verified) {
          score += 15;
          reasons.push("latest tip is verified");
        }

        if (storeReports.length >= 3) {
          score += 10;
          reasons.push(`${storeReports.length} restock reports are logged`);
        }

        if (!reasons.length) {
          reasons.push("needs more local report history");
        }

        return {
          store,
          score: Math.min(score, 95),
          commonDay,
          commonDayCount,
          commonHour,
          commonHourCount,
          lastReport,
          reason: reasons.join("; "),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [stores, reportsByStore]);

  const routeCandidates = useMemo(() => {
    return stores.map((store) => {
      if (routeForm.region !== "All" && store.region !== routeForm.region) return null;
      const group = getStoreGroup(store);
      const storeReports = reportsByStore[store.id] || [];
      const tidepoolMatches = tidepoolReports.filter((report) => String(report.storeId) === String(store.id));
      const latestReport = [...storeReports].sort((a, b) => {
        const aDate = `${getReportDate(a)}T${getReportTime(a) || "00:00"}`;
        const bDate = `${getReportDate(b)}T${getReportTime(b) || "00:00"}`;
        return new Date(bDate) - new Date(aDate);
      })[0];
      const dailyScore = dailyLocalReport.find((entry) => entry.store.id === store.id)?.score || 20;
      const tidepoolScore = Math.max(...tidepoolMatches.map((report) => Number(report.confidenceScore || 0)), 0);
      const recentConfirmed = tidepoolMatches.some((report) => report.verificationStatus === "verified" || report.verifiedByCount > 0);
      const strictLimit = /limit|one per|1 per|strict/i.test(`${store.limitPolicy || ""} ${store.notes || ""}`);
      const distance = numericDistance(store);
      const reportCountToday = storeReports.filter((report) => getReportDate(report) === new Date().toISOString().slice(0, 10)).length;
      const lastReportTime = latestReport ? `${getReportDate(latestReport)} ${getReportTime(latestReport)}`.trim() : "";
      const valueScore = (recentConfirmed ? 25 : 0) + tidepoolScore + (store.priority || store.favorite ? 12 : 0) - (strictLimit ? 5 : 0);
      return {
        store,
        group,
        distance,
        reportCountToday,
        dailyScore,
        tidepoolScore,
        valueScore,
        recentConfirmed,
        strictLimit,
        lastReportTime,
        latestReport,
      };
    }).filter(Boolean);
  }, [stores, reportsByStore, tidepoolReports, dailyLocalReport, routeForm.region]);

  const suggestedRouteStops = useMemo(() => {
    return buildSuggestedRoute(routeCandidates, {
      includedGroups: routeForm.includedGroups,
      lockedStoreIds: routeForm.lockedStoreIds,
      maxDistance: routeForm.maxDistance,
      maxStops: routeForm.maxStops,
      routeGoal: routeForm.routeGoal,
    });
  }, [routeCandidates, routeForm.includedGroups, routeForm.lockedStoreIds, routeForm.maxDistance, routeForm.maxStops, routeForm.routeGoal]);

  const scoredRouteCandidates = useMemo(() => {
    return buildSuggestedRoute(routeCandidates, {
      includedGroups: routeForm.includedGroups,
      lockedStoreIds: routeForm.lockedStoreIds,
      maxDistance: routeForm.maxDistance,
      maxStops: Math.max(routeCandidates.length, 1),
      routeGoal: routeForm.routeGoal,
    });
  }, [routeCandidates, routeForm.includedGroups, routeForm.lockedStoreIds, routeForm.maxDistance, routeForm.routeGoal]);

  const restockHistory = useMemo(() => {
    return [...allReports]
      .sort((a, b) => {
        const aDate = `${getReportDate(a)}T${getReportTime(a) || "00:00"}`;
        const bDate = `${getReportDate(b)}T${getReportTime(b) || "00:00"}`;
        return new Date(bDate) - new Date(aDate);
      })
      .slice(0, 20);
  }, [allReports]);

  const enrichedTidepoolReports = useMemo(() => {
    return tidepoolReports
      .map((report) => {
        const ageHours = (Date.now() - new Date(report.reportTime || report.lastUpdated || Date.now()).getTime()) / 3600000;
        const expired = ageHours > 6 && ["Restock sighting", "Product sighting", "Online drop alert"].includes(report.reportType);
        const status = expired && report.verificationStatus !== "verified" ? "expired" : report.verificationStatus;
        const weightedScore =
          Number(report.confidenceScore || 0) +
          (status === "verified" ? 20 : 0) +
          (report.photoUrl ? 10 : 0) -
          Number(report.disputedByCount || 0) * 12;
        return { ...report, computedStatus: status, weightedScore: Math.max(0, Math.min(100, weightedScore)) };
      })
      .sort((a, b) => new Date(b.reportTime || b.lastUpdated || 0) - new Date(a.reportTime || a.lastUpdated || 0));
  }, [tidepoolReports]);

  const filteredTidepoolReports = useMemo(() => {
    return enrichedTidepoolReports.filter((report) => {
      if (tidepoolFilter === "Verified") return report.computedStatus === "verified";
      if (tidepoolFilter === "Online Drops") return report.reportType === "Online drop alert";
      if (tidepoolFilter === "Deals") return report.reportType === "Price/deal sighting";
      if (tidepoolFilter === "High Confidence") return report.weightedScore >= 75;
      if (tidepoolFilter === "Needs Verification") return report.computedStatus === "pending";
      if (tidepoolFilter === "My Reports") return report.userId === LOCAL_SCOUT_USER_ID;
      if (tidepoolFilter === "Favorite Stores") return report.favoriteStore;
      if (tidepoolFilter === "Watchlist Items") return report.watchlistItem;
      return true;
    });
  }, [enrichedTidepoolReports, tidepoolFilter]);

  const filteredTidepoolEvents = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return tidepoolEvents
      .filter((event) => {
        if (tidepoolEventFilter === "Upcoming") return !event.startDate || event.startDate >= today;
        if (tidepoolEventFilter === "Nearby") return !event.onlineEvent;
        if (tidepoolEventFilter === "Kid-Friendly") return event.kidFriendly;
        if (tidepoolEventFilter === "Giveaways") return /giveaway|pack/i.test(`${event.eventType} ${event.eventTitle}`);
        if (tidepoolEventFilter === "Donation Drives") return event.donationAccepted || /donation/i.test(event.eventType);
        if (tidepoolEventFilter === "Trade Day") return /trade/i.test(event.eventType);
        if (tidepoolEventFilter === "Online") return event.onlineEvent;
        if (tidepoolEventFilter === "Verified Only") return event.verificationStatus === "verified";
        if (tidepoolEventFilter === "My Events") return event.userId === LOCAL_SCOUT_USER_ID;
        return true;
      })
      .sort((a, b) => `${a.startDate || ""}T${a.startTime || "00:00"}`.localeCompare(`${b.startDate || ""}T${b.startTime || "00:00"}`));
  }, [tidepoolEvents, tidepoolEventFilter]);

  const tidepoolAlerts = useMemo(() => {
    const reportAlerts = enrichedTidepoolReports
      .filter((report) => {
        if (!alertSettings.enabled) return false;
        if (alertSettings.verifiedOnly && report.computedStatus !== "verified") return false;
        if (alertSettings.favoriteStoresOnly && !report.favoriteStore) return false;
        if (!alertSettings.onlineDropAlerts && report.reportType === "Online drop alert") return false;
        if (!alertSettings.watchlistAlerts && report.watchlistItem) return false;
        return report.weightedScore >= 60 || report.computedStatus === "verified";
      })
      .slice(0, 5);
    const eventAlerts = tidepoolEvents
      .filter((event) => {
        if (!alertSettings.enabled) return false;
        if (alertSettings.verifiedOnly && event.verificationStatus !== "verified") return false;
        return event.eventStatus !== "canceled" && (event.kidFriendly || event.donationAccepted || event.saved);
      })
      .slice(0, 3)
      .map((event) => ({
        reportId: event.eventId,
        reportType: event.kidFriendly ? "Kid-friendly event near you" : event.donationAccepted ? "Donation drive posted" : "Saved event reminder",
        storeName: event.locationName || event.city || "Tidepool Events",
        productName: event.eventTitle,
      }));
    return [...reportAlerts, ...eventAlerts].slice(0, 6);
  }, [enrichedTidepoolReports, tidepoolEvents, alertSettings]);

  const bestBuySummary = useMemo(() => {
    const inStock = bestBuyStockResults.filter((item) => /in stock|shipping available/i.test(`${item.stockStatus} ${item.onlineAvailability} ${item.shippingAvailability}`));
    const pickup = bestBuyStockResults.filter((item) => /pickup|limited/i.test(`${item.stockStatus} ${item.pickupAvailability}`));
    const needsReview = bestBuyStockResults.filter((item) => Number(item.matchConfidence || 0) < 70);
    const deadStock = bestBuyStoreStock.filter((item) => Number(item.deadStockScore || 0) >= 40);
    return { inStock, pickup, needsReview, deadStock };
  }, [bestBuyStockResults, bestBuyStoreStock]);
  const isBestBuyRetailerSelected = /best buy/i.test(selectedChain);
  const bestBuyRetailerStores = useMemo(
    () => sortStores(stores.filter((store) => /best buy/i.test(`${store.chain || ""} ${store.name || ""} ${store.retailer || ""}`)), storeSort),
    [stores, storeSort]
  );
  const bestBuyLastChecked = bestBuyStockResults[0]?.lastChecked || bestBuyStockHistory[0]?.checkedAt || "Not checked in beta yet";
  const bestBuySourceStatus = bestBuyStockResults[0]?.sourceStatus || bestBuyStockResults[0]?.sourceType || "unavailable";

  const bestBuySourceReports = useMemo(
    () => enrichedTidepoolReports.filter((report) => /best_buy|Best Buy Source|Best Buy/i.test(`${report.sourceType} ${report.displayName} ${report.storeName}`)),
    [enrichedTidepoolReports]
  );

  const combinedScoutAlerts = useMemo(() => {
    const bestBuyMapped = bestBuyAlerts.slice(0, 4).map((alert) => ({
      reportId: alert.alertId,
      reportType: alert.type,
      storeName: "Best Buy",
      productName: alert.title || alert.message,
      sourceType: alert.sourceStatus || alert.sourceType || "Best Buy",
      createdAt: alert.createdAt || alert.lastChecked || "",
    }));
    const mappedTidepool = tidepoolAlerts.map((alert) => ({
      ...alert,
      sourceType: alert.sourceType || "Scout report",
      createdAt: alert.createdAt || alert.reportTime || alert.lastUpdated || "",
    }));
    const grouped = new Map();
    [...bestBuyMapped, ...mappedTidepool].forEach((alert) => {
      const key = `${alert.reportType || "alert"}-${alert.storeName || ""}-${alert.productName || ""}`.toLowerCase();
      if (!grouped.has(key)) {
        grouped.set(key, { ...alert, duplicateCount: 1 });
        return;
      }
      grouped.set(key, {
        ...grouped.get(key),
        duplicateCount: grouped.get(key).duplicateCount + 1,
      });
    });
    return Array.from(grouped.values()).slice(0, 12);
  }, [bestBuyAlerts, tidepoolAlerts]);

  const scoutBadge =
    scoutProfile.verifiedReportCount >= 30 || scoutProfile.trustScore >= 90
      ? "Verified Scout"
      : scoutProfile.verifiedReportCount >= 15 || scoutProfile.trustScore >= 82
        ? "Trusted Scout"
        : scoutProfile.verifiedReportCount >= 5
          ? "Community Helper"
          : scoutProfile.badgeLevel || "New Scout";
  const visibleScoutAlerts = combinedScoutAlerts.filter((alert) => {
    const id = alert.reportId || alert.alertId || `${alert.reportType}-${alert.productName}-${alert.createdAt}`;
    return !dismissedAlertIds.includes(id);
  });
  const topActiveAlerts = visibleScoutAlerts.slice(0, 5);
  const alertPreferenceRows = [
    { key: "enabled", label: "Scout alerts", description: "Turn Scout alerting on or off." },
    { key: "favoriteStoresOnly", label: "Favorite store alerts", description: "Prioritize reports from stores you care about." },
    { key: "watchlistAlerts", label: "Watchlist product alerts", description: "Notify when watched products appear in reports." },
    { key: "onlineDropAlerts", label: "Online drop alerts", description: "Include online drop and Best Buy source updates." },
    { key: "autoOpenDropWebsite", label: "Auto-open website on drop", description: "When a detected drop has a product URL, redirect this tab once. Off by default." },
    { key: "verifiedOnly", label: "Verified-only alerts", description: "Only surface higher-confidence reports." },
    { key: "quietHours", label: "Quiet hours", description: "Pause non-urgent alerts during quiet time later." },
  ];

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        {!compact ? <div style={styles.hero}>
          <h1 style={styles.heroTitle}>Scout</h1>
          <p style={styles.heroSub}>
            Find stores, log sightings, and track restock intelligence.
          </p>

          <div style={styles.statsRow}>
            <Metric label="Stores" value={totals.stores} />
            <Metric label="Found" value={totals.found} />
            <Metric label="Reports" value={totals.reports} />
            <Metric label="Tracked Items" value={totals.items} />
          </div>
        </div> : null}

        {error ? (
          <div
            style={{
              ...styles.card,
              border: "1px solid #fecaca",
              background: "#fff1f2",
              color: "#9f1239",
            }}
          >
            {error}
          </div>
        ) : null}

        {missingStoreModalOpen ? (
          <div style={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label="Submit Missing Store">
            <form style={styles.modalCard} onSubmit={submitMissingStoreForReview}>
              <div>
                <h2 style={{ ...styles.sectionTitle, marginBottom: "4px" }}>Submit Missing Store</h2>
                <p style={{ ...styles.empty, padding: 0 }}>Send a store to review. It will not become an official directory store until approved.</p>
              </div>
              <input style={styles.input} value={missingStoreForm.name} onChange={(event) => setMissingStoreForm((current) => ({ ...current, name: event.target.value }))} placeholder="Store name" />
              <input style={styles.input} value={missingStoreForm.retailer} onChange={(event) => setMissingStoreForm((current) => ({ ...current, retailer: event.target.value }))} placeholder="Retailer" />
              <input style={styles.input} value={missingStoreForm.address} onChange={(event) => setMissingStoreForm((current) => ({ ...current, address: event.target.value }))} placeholder="Address" />
              <div style={styles.reportGrid}>
                <input style={styles.input} value={missingStoreForm.city} onChange={(event) => setMissingStoreForm((current) => ({ ...current, city: event.target.value }))} placeholder="City" />
                <input style={styles.input} value={missingStoreForm.zip} onChange={(event) => setMissingStoreForm((current) => ({ ...current, zip: event.target.value }))} placeholder="ZIP" />
              </div>
              <textarea style={styles.textarea} value={missingStoreForm.notes} onChange={(event) => setMissingStoreForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
              <div style={styles.row}>
                <button type="submit" style={styles.buttonPrimary}>Submit for Review</button>
                <button type="button" style={styles.buttonSoft} onClick={() => setMissingStoreModalOpen(false)}>Cancel</button>
              </div>
            </form>
          </div>
        ) : null}

        {trackedProductsModalOpen ? (
          <div style={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label="Add Product Sighting">
            <form style={styles.modalCard} onSubmit={handleCreateItem}>
              <div>
                <h2 style={{ ...styles.sectionTitle, marginBottom: "4px" }}>{editingTrackedItemId ? "Edit Product Sighting" : "Add Product Sighting"}</h2>
                <p style={{ ...styles.empty, padding: 0 }}>Track products seen at this store or add UPC/SKU details.</p>
              </div>
              <input style={styles.input} value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} placeholder="Category" />
              <input style={styles.input} value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} placeholder="Item name" />
              <input style={styles.input} value={itemForm.retailerItemNumber} onChange={(e) => setItemForm({ ...itemForm, retailerItemNumber: e.target.value })} placeholder="Retailer item number" />
              <div style={styles.reportGrid}>
                <input style={styles.input} value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} placeholder="SKU" />
                <input style={styles.input} value={itemForm.upc} onChange={(e) => setItemForm({ ...itemForm, upc: e.target.value })} placeholder="UPC" />
              </div>
              <input style={styles.input} value={itemForm.productUrl} onChange={(e) => setItemForm({ ...itemForm, productUrl: e.target.value })} placeholder="Product URL" />
              <select style={styles.input} value={itemForm.status} onChange={(e) => setItemForm({ ...itemForm, status: e.target.value })}>
                <option value="Unknown">Unknown</option>
                <option value="In Stock">In Stock</option>
                <option value="Out of Stock">Out of Stock</option>
              </select>
              <div style={styles.row}>
                <button type="submit" style={styles.buttonPrimary}>{editingTrackedItemId ? "Save Sighting" : "Add Product Sighting"}</button>
                <button type="button" style={styles.buttonSoft} onClick={() => { resetTrackedItemForm(); setTrackedProductsModalOpen(false); }}>Cancel</button>
              </div>
            </form>
          </div>
        ) : null}

        {!compact ? <div style={styles.pageHeader}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h2 style={{ ...styles.sectionTitle, marginBottom: "4px" }}>Scout Dashboard</h2>
              <p style={{ ...styles.empty, padding: 0 }}>Stores, restock reports, Best Buy stock, routes, location, score, and alerts in focused views.</p>
            </div>
          </div>
          <div style={styles.row}>
            <button type="button" style={styles.buttonSoft} onClick={() => setScoutSubTab("stores")}>Stores</button>
            <button type="button" style={styles.buttonSoft} onClick={() => setScoutSubTab("reports")}>Submit Report</button>
            <button type="button" style={styles.buttonSoft} onClick={() => setScoutSubTab("alerts")}>Alerts</button>
            <button type="button" style={styles.buttonSoft} onClick={() => setScoutSubTab("reports")}>My Reports</button>
            <button type="button" style={styles.buttonSoft} onClick={() => setScoutSubTab("overview")}>Scout Score</button>
          </div>
          {false ? <div style={styles.row}>
            <button type="button" style={styles.buttonSoft} onClick={() => setScoutSubTab("route")}>Build Route</button>
            <button type="button" style={styles.buttonSoft} onClick={() => setScoutSubTab("stores")}>Add Store</button>
            <button type="button" style={styles.buttonSoft} onClick={() => setScoutSubTab("online")}>Online Drops</button>
          </div> : null}
          <div style={styles.subTabs}>
            {[
              ["overview", "Overview"],
              ["stores", "Stores"],
              ["reports", "Reports"],
              ["route", "Route Planner"],
              ["online", "Online Drops"],
              ["alerts", "Alerts"],
            ].map(([key, label]) => (
              <button key={key} type="button" style={scoutSubTab === key ? styles.buttonPrimary : styles.buttonSoft} onClick={() => setScoutSubTab(key)}>
                {label}
              </button>
            ))}
          </div>
        </div> : null}

        {scoutSubTab === "overview" ? (
          <>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Virginia Scout Directory</h2>
          <p style={styles.empty}>
            Scout is ready for statewide Virginia coverage. Hampton Roads has starter store rows now; other regions are import-ready batches that should be filled from official store directories or manual CSVs.
          </p>
          <div style={styles.statsRow}>
            <Metric label="Total Stores" value={directoryStats.totalStores} />
            <Metric label="Hampton Roads Stores" value={directoryStats.hamptonRoadsStores} />
            <Metric label="Retail Chains" value={directoryStats.retailChains} />
            <Metric label="Military/Exchange Stores" value={directoryStats.militaryStores} />
          </div>
          <div style={styles.row}>
            {VIRGINIA_STORE_SEED_STATUS.map((batch) => (
              <span key={batch.source} style={styles.badge}>{batch.region}: {batch.count}</span>
            ))}
          </div>
        </div>
        <div style={styles.reportGrid}>
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>My Scout Score</h2>
            <div style={styles.statsRow}>
              <Metric label="Trust Score" value={scoutProfile.trustScore} />
              <Metric label="Verified" value={scoutProfile.verifiedReportCount} />
              <Metric label="Rewards" value={scoutProfile.rewardPoints} />
              <Metric label="Streak" value={scoutProfile.reportStreak} />
            </div>
            <p style={styles.empty}>Badge: {scoutBadge}</p>
            {scoutProfile.warningCount ? <p style={styles.tiny}>Warnings: {scoutProfile.warningCount}</p> : null}
            {scoutProfile.cooldownUntil ? <p style={styles.tiny}>Cooldown until: {scoutProfile.cooldownUntil}</p> : null}
          </div>

          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Rewards</h2>
            <p style={styles.empty}>Earn points for verified, helpful, photo-supported, and first-at-store reports.</p>
            <div style={styles.row}>
              <span style={styles.badge}>New Scout</span>
              <span style={styles.badge}>Trusted Scout</span>
              <span style={styles.badge}>Verified Scout</span>
              <span style={styles.badge}>Deal Finder</span>
            </div>
            <p style={styles.tiny}>Bad reports use warnings, lower trust, photo review, cooldowns, and admin review first. No automatic permanent bans in beta.</p>
          </div>
        </div>

        <div style={styles.reportGrid}>
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Best Buy Source Reports</h2>
            <p style={styles.empty}>Best Buy source rows are pending Tidepool reports until a person confirms or disputes them in store.</p>
            {bestBuySourceReports.length === 0 ? <p style={styles.empty}>No Best Buy source reports yet. Use Scout &gt; Online Drops to create one.</p> : null}
            {bestBuySourceReports.slice(0, 5).map((report) => (
              <div key={report.reportId} style={styles.listCard}>
                <strong>{report.productName || "Best Buy availability"}</strong>
                <p style={{ margin: "6px 0", color: "#475569" }}>{report.storeName} | {report.computedStatus} | {report.sourceType}</p>
                <p style={styles.tiny}>{report.reportText}</p>
              </div>
            ))}
          </div>

          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Nightly Reports</h2>
            <p style={styles.empty}>In-app nightly Best Buy summaries are beta-ready. Email, push, and Discord delivery are not connected yet.</p>
            {bestBuyNightlyReports.length === 0 ? <p style={styles.empty}>No nightly report yet. Generate one from Online Drops for testing.</p> : null}
            {bestBuyNightlyReports.slice(0, 3).map((report) => (
              <div key={report.reportId} style={styles.listCard}>
                <strong>{report.reportDate} Best Buy Nightly Report</strong>
                <p style={{ margin: "6px 0", color: "#475569" }}>{report.summary}</p>
                <p style={styles.tiny}>Source: {report.sourceStatus} | ZIP {report.zip || "not set"} | Last checked {new Date(report.lastChecked).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>

          </>
        ) : null}

        {scoutSubTab === "online" ? (
          <div style={styles.reportGrid}>
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Best Buy Stock Checker</h2>
              <p style={styles.empty}>Best Buy live stock lookup is not connected yet. Manual or cached rows will be labeled clearly when available.</p>
              <div style={styles.statsRow}>
                <Metric label="In Stock / Ship" value={bestBuySummary.inStock.length} />
                <Metric label="Pickup / Limited" value={bestBuySummary.pickup.length} />
                <Metric label="Needs Review" value={bestBuySummary.needsReview.length} />
                <Metric label="Still Sitting" value={bestBuySummary.deadStock.length} />
              </div>
              {bestBuyMessage ? <p style={styles.tiny}>{bestBuyMessage}</p> : null}
              <div style={styles.formGrid}>
                <input style={styles.input} value={bestBuyForm.query} onChange={(e) => setBestBuyForm((current) => ({ ...current, query: e.target.value }))} placeholder="Search Best Buy products by name" />
                <input style={styles.input} value={bestBuyForm.sku} onChange={(e) => setBestBuyForm((current) => ({ ...current, sku: e.target.value }))} placeholder="Best Buy SKU" />
                <input style={styles.input} value={bestBuyForm.zip} onChange={(e) => setBestBuyForm((current) => ({ ...current, zip: e.target.value }))} placeholder="ZIP / store area" />
                <select style={styles.input} value={bestBuyForm.stockStatus} onChange={(e) => setBestBuyForm((current) => ({ ...current, stockStatus: e.target.value }))}>
                  {BEST_BUY_STOCK_STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
              <div style={styles.row}>
                <button type="button" style={styles.buttonPrimary} onClick={() => syncBestBuyStock("search")}>Refresh Best Buy Stock</button>
                <button type="button" style={styles.buttonSoft} onClick={() => syncBestBuyStock("sku")}>Check SKU</button>
                <button type="button" style={styles.buttonSoft} onClick={addManualBestBuyStock}>Add Manual Row</button>
                <button type="button" style={styles.buttonSoft} onClick={generateBestBuyNightlyReportNow}>Generate Nightly Report Now</button>
              </div>
              <p style={styles.tiny}>No auto-checkout, cart automation, queue bypass, login automation, or aggressive scraping. Stock is possible availability, not guaranteed.</p>
            </div>

            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Best Buy Watchlist & Nearby Availability</h2>
              {bestBuyStockResults.length === 0 ? <p style={styles.empty}>No Best Buy stock rows yet. Live lookup is not connected for private beta.</p> : null}
              <div style={{ display: "grid", gap: "10px" }}>
                {bestBuyStockResults.slice(0, 10).map((item) => (
                  <div key={`${item.bestBuySku}-${item.storeId || item.zipChecked}`} style={styles.listCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                      <strong>{item.productName}</strong>
                      <span style={styles.badge}>{item.stockStatus} | {item.sourceStatus}</span>
                    </div>
                    <p style={{ margin: "6px 0", color: "#475569" }}>
                      SKU {item.bestBuySku || "Unknown"} | ZIP {item.zipChecked || "Not set"} | Price ${Number(item.salePrice || item.price || 0).toFixed(2)}
                    </p>
                    <p style={styles.tiny}>Online: {item.onlineAvailability} | Pickup: {item.pickupAvailability} | Shipping: {item.shippingAvailability}</p>
                    <p style={styles.tiny}>Last checked: {item.lastChecked ? new Date(item.lastChecked).toLocaleString() : "Not checked"} | Match confidence: {item.matchConfidence || 0}%</p>
                    <div style={styles.row}>
                      {item.productUrl ? <a style={styles.linkButton} href={item.productUrl} target="_blank" rel="noreferrer">Open Product</a> : null}
                      <button type="button" style={styles.buttonSoft} onClick={() => {
                        const nextReports = [createTidepoolReportFromBestBuyAvailability(item), ...tidepoolReports].slice(0, 80);
                        saveTidepoolReports(nextReports);
                      }}>Create Tidepool Report</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Best Buy Stock History</h2>
              {bestBuyStockHistory.length === 0 ? <p style={styles.empty}>No stock history yet. Refresh or add a manual row to start tracking changes.</p> : null}
              {bestBuyStockHistory.slice(0, 8).map((item) => (
                <div key={item.stockHistoryId} style={styles.listCard}>
                  <strong>{item.bestBuySku}</strong>
                  <p style={{ margin: "6px 0", color: "#475569" }}>{item.changeType} | {item.previousStatus || "none"} → {item.currentStatus}</p>
                  <p style={styles.tiny}>Checked {new Date(item.checkedAt).toLocaleString()} | Source: {item.sourceType}</p>
                </div>
              ))}
            </div>

            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Possible Dead Stock / Still Sitting</h2>
              {bestBuySummary.deadStock.length === 0 ? <p style={styles.empty}>No still-sitting items yet. Scores build as the same item appears repeatedly across checks.</p> : null}
              {bestBuySummary.deadStock.map((item) => (
                <div key={item.storeStockId} style={styles.listCard}>
                  <strong>{item.productName}</strong>
                  <p style={{ margin: "6px 0", color: "#475569" }}>Dead stock score: {item.deadStockScore} | Times seen: {item.timesSeen} | Times unavailable: {item.timesUnavailable}</p>
                  <p style={styles.tiny}>Label means possible “Still Sitting,” not bad stock. Confirm in store before acting.</p>
                </div>
              ))}
            </div>

            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Best Buy Nightly Report Settings</h2>
              <div style={styles.formGrid}>
                <label style={styles.tiny}><input type="checkbox" checked={bestBuyNightlySettings.enabled} onChange={(e) => updateBestBuySetting("enabled", e.target.checked)} /> Nightly reports on</label>
                <input style={styles.input} type="time" value={bestBuyNightlySettings.reportTime} onChange={(e) => updateBestBuySetting("reportTime", e.target.value)} />
                <input style={styles.input} value={bestBuyNightlySettings.zip} onChange={(e) => updateBestBuySetting("zip", e.target.value)} placeholder="ZIP for report" />
                <input style={styles.input} type="number" value={bestBuyNightlySettings.radiusMiles} onChange={(e) => updateBestBuySetting("radiusMiles", e.target.value)} placeholder="Radius miles" />
                <label style={styles.tiny}><input type="checkbox" checked={bestBuyNightlySettings.favoriteStoresOnly} onChange={(e) => updateBestBuySetting("favoriteStoresOnly", e.target.checked)} /> Favorite stores only</label>
                <label style={styles.tiny}><input type="checkbox" checked={bestBuyNightlySettings.watchlistOnly} onChange={(e) => updateBestBuySetting("watchlistOnly", e.target.checked)} /> Watchlist only</label>
                <label style={styles.tiny}><input type="checkbox" checked={bestBuyNightlySettings.includePriceChanges} onChange={(e) => updateBestBuySetting("includePriceChanges", e.target.checked)} /> Include price changes</label>
                <label style={styles.tiny}><input type="checkbox" checked={bestBuyNightlySettings.includeDeadStock} onChange={(e) => updateBestBuySetting("includeDeadStock", e.target.checked)} /> Include still-sitting items</label>
                <label style={styles.tiny}><input type="checkbox" checked={bestBuyNightlySettings.includeSoldOutChanges} onChange={(e) => updateBestBuySetting("includeSoldOutChanges", e.target.checked)} /> Include sold-out changes</label>
                <select style={styles.input} value={bestBuyNightlySettings.deliveryMethod} onChange={(e) => updateBestBuySetting("deliveryMethod", e.target.value)}>
                  <option value="in-app">In-app</option>
                  <option value="email-disabled">Email not connected</option>
                  <option value="push-disabled">Push not connected</option>
                  <option value="discord-disabled">Discord/webhook not connected</option>
                </select>
              </div>
              <p style={styles.tiny}>Nightly reports run on demand in beta. A real scheduler should run server-side once API credentials and user notification preferences are ready.</p>
            </div>

            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Best Buy API Setup</h2>
              <p style={styles.empty}>Live Best Buy product/store availability should run through backend or serverless functions so API keys are not exposed in the frontend.</p>
              <div style={styles.row}>
                {BEST_BUY_API_ENV_VARS.map((name) => <span key={name} style={styles.badge}>{name}</span>)}
              </div>
            </div>
          </div>
        ) : null}

        {scoutSubTab === "tidepool" ? (
          <>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>{compact ? "Tidepool Reports" : "Tidepool"}</h2>
          <p style={styles.empty}>{compact ? "Community Scout report feed. Use the chips to filter the same feed." : "Community-powered Scout reports, events, restocks, products, limits, deals, online drops, and store updates."}</p>
          <div style={styles.statsRow}>
            <Metric label="Reports" value={tidepoolReports.length} />
            {!compact ? <Metric label="Events" value={tidepoolEvents.length} /> : null}
            {!compact ? <Metric label="Kid Events" value={tidepoolEvents.filter((event) => event.kidFriendly).length} /> : null}
            {!compact ? <Metric label="Giveaways" value={tidepoolEvents.filter((event) => /giveaway|pack/i.test(`${event.eventType} ${event.eventTitle}`)).length} /> : null}
          </div>
          <div style={styles.row}>
            {TIDEPOOL_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                style={filter === tidepoolFilter ? styles.buttonPrimary : styles.buttonSoft}
                onClick={() => setTidepoolFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
          <div style={{ marginTop: "16px", display: "grid", gap: "12px" }}>
            {filteredTidepoolReports.length === 0 ? <p style={styles.empty}>No Tidepool reports match this filter yet.</p> : null}
            {filteredTidepoolReports.slice(0, tidepoolFilter === "Latest" ? 8 : 20).map((report) => (
              <div key={report.reportId} style={styles.listCard}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                  <strong>{report.productName || report.reportType}</strong>
                  <span style={styles.badge}>{report.computedStatus} | {report.weightedScore}%</span>
                </div>
                <p style={{ margin: "6px 0", color: "#334155" }}>{report.storeName} - {report.city || "No city"} {report.distanceMiles ? `- ${report.distanceMiles} mi` : ""}</p>
                <p style={{ margin: "6px 0", color: "#475569" }}>{report.reportText}</p>
                <p style={styles.tiny}>
                  {report.reportType} | {report.displayName} | Source: {report.sourceType} | Helpful: {report.helpfulVotes} | Confirmed: {report.verifiedByCount} | Disputed: {report.disputedByCount}
                </p>
                <div style={styles.row}>
                  <button type="button" style={styles.buttonSoft} onClick={() => confirmTidepoolReport(report.reportId)}>Confirm</button>
                  <button type="button" style={styles.buttonSoft} onClick={() => disputeTidepoolReport(report.reportId)}>Dispute</button>
                  {adminMode ? <button type="button" style={styles.buttonSoft} onClick={() => adminSetTidepoolStatus(report.reportId, "verified")}>Admin Verify</button> : null}
                  {adminMode ? <button type="button" style={styles.buttonSoft} onClick={() => adminSetTidepoolStatus(report.reportId, "expired")}>Expire</button> : null}
                </div>
              </div>
            ))}
          </div>
        </div>

          </>
        ) : null}

        {scoutSubTab === "tidepool" && !compact ? (
          <div style={styles.reportGrid}>
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Events</h2>
              <p style={styles.empty}>
                Tidepool Events support community activity, kid-friendly Pokemon meetups, giveaways, donation drives, trade days, local shop events, and online/community sale events.
              </p>
              <div style={styles.row}>
                {TIDEPOOL_EVENT_FILTERS.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    style={filter === tidepoolEventFilter ? styles.buttonPrimary : styles.buttonSoft}
                    onClick={() => setTidepoolEventFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              <h3 style={{ marginTop: "16px" }}>Upcoming Events</h3>
              <div style={{ display: "grid", gap: "12px" }}>
                {filteredTidepoolEvents.length === 0 ? (
                  <p style={styles.empty}>No events match this filter yet.</p>
                ) : (
                  filteredTidepoolEvents.map((event) => (
                    <div key={event.eventId} style={styles.listCard}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                        <strong>{event.eventTitle}</strong>
                        <span style={styles.badge}>{event.eventStatus} | {event.verificationStatus}</span>
                      </div>
                      <p style={{ margin: "6px 0", color: "#334155" }}>
                        {event.eventType} | {event.startDate || "Date TBD"} {event.startTime || ""} | {event.onlineEvent ? "Online" : `${event.city || "No city"}, ${event.state || "VA"}`}
                      </p>
                      <p style={{ margin: "6px 0", color: "#475569" }}>{event.eventDescription}</p>
                      <p style={styles.tiny}>
                        Host: {event.hostName || event.organizerName || "Not listed"} | Location: {event.locationName || "TBD"} | {event.kidFriendly ? "Kid-friendly" : "General audience"} | {event.freeEvent ? "Free" : `Cost: ${event.cost || "Not listed"}`} | Source: {event.sourceType}
                      </p>
                      {event.donationAccepted ? <p style={styles.tiny}>Donations accepted: {event.donationDetails || "Details TBD"}</p> : null}
                      <div style={styles.row}>
                        <button type="button" style={styles.buttonPrimary} onClick={() => saveTidepoolEvent(event.eventId)}>Save Event</button>
                        {event.rsvpEnabled ? <button type="button" style={styles.buttonSoft} onClick={() => rsvpTidepoolEvent(event.eventId)}>RSVP / Interested ({event.attendeeCount || 0})</button> : null}
                        <button type="button" style={styles.buttonSoft} onClick={() => shareTidepoolEvent(event)}>Share Event</button>
                        <button type="button" style={styles.buttonSoft} onClick={() => reportTidepoolEvent(event.eventId)}>Report Event</button>
                        {event.userId === LOCAL_SCOUT_USER_ID ? <button type="button" style={styles.buttonDanger} onClick={() => adminSetTidepoolEventStatus(event.eventId, "canceled")}>Cancel My Event</button> : null}
                        {adminMode ? <button type="button" style={styles.buttonSoft} onClick={() => adminSetTidepoolEventStatus(event.eventId, "approved", event.kidFriendly ? "pending" : "verified")}>Admin Approve</button> : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Submit Event</h2>
              <form onSubmit={submitTidepoolEvent} style={styles.formGrid}>
                <input style={styles.input} value={eventForm.eventTitle} onChange={(e) => updateEventForm("eventTitle", e.target.value)} placeholder="Event title" />
                <select style={styles.input} value={eventForm.eventType} onChange={(e) => updateEventForm("eventType", e.target.value)}>
                  {TIDEPOOL_EVENT_TYPES.map((type) => <option key={type}>{type}</option>)}
                </select>
                <input style={styles.input} value={eventForm.hostName} onChange={(e) => updateEventForm("hostName", e.target.value)} placeholder="Host / organizer name" />
                <input style={styles.input} value={eventForm.locationName} onChange={(e) => updateEventForm("locationName", e.target.value)} placeholder="Location name" />
                <input style={styles.input} value={eventForm.address} onChange={(e) => updateEventForm("address", e.target.value)} placeholder="Address optional" />
                <input style={styles.input} value={eventForm.city} onChange={(e) => updateEventForm("city", e.target.value)} placeholder="City" />
                <input style={styles.input} value={eventForm.zip} onChange={(e) => updateEventForm("zip", e.target.value)} placeholder="ZIP" />
                <input style={styles.input} value={eventForm.eventLink} onChange={(e) => updateEventForm("eventLink", e.target.value)} placeholder="Event link optional" />
                <input style={styles.input} type="date" value={eventForm.startDate} onChange={(e) => updateEventForm("startDate", e.target.value)} />
                <input style={styles.input} type="time" value={eventForm.startTime} onChange={(e) => updateEventForm("startTime", e.target.value)} />
                <input style={styles.input} type="date" value={eventForm.endDate} onChange={(e) => updateEventForm("endDate", e.target.value)} />
                <input style={styles.input} type="time" value={eventForm.endTime} onChange={(e) => updateEventForm("endTime", e.target.value)} />
                <input style={styles.input} value={eventForm.cost} onChange={(e) => updateEventForm("cost", e.target.value)} placeholder="Cost optional" />
                <input style={styles.input} value={eventForm.itemsProvided} onChange={(e) => updateEventForm("itemsProvided", e.target.value)} placeholder="Items provided optional" />
                <input style={styles.input} value={eventForm.ageRange} onChange={(e) => updateEventForm("ageRange", e.target.value)} placeholder="Age range optional" />
                <input style={styles.input} value={eventForm.maxAttendees} onChange={(e) => updateEventForm("maxAttendees", e.target.value)} placeholder="Max attendees optional" />
                <textarea style={styles.textarea} value={eventForm.eventDescription} onChange={(e) => updateEventForm("eventDescription", e.target.value)} placeholder="Event description, supervision details, giveaway rules, or donation notes" />
                <textarea style={styles.textarea} value={eventForm.donationDetails} onChange={(e) => updateEventForm("donationDetails", e.target.value)} placeholder="Donation details optional" />
                <label style={styles.tiny}><input type="checkbox" checked={eventForm.onlineEvent} onChange={(e) => updateEventForm("onlineEvent", e.target.checked)} /> Online event</label>
                <label style={styles.tiny}><input type="checkbox" checked={eventForm.kidFriendly} onChange={(e) => updateEventForm("kidFriendly", e.target.checked)} /> Kid-friendly</label>
                <label style={styles.tiny}><input type="checkbox" checked={eventForm.freeEvent} onChange={(e) => updateEventForm("freeEvent", e.target.checked)} /> Free event</label>
                <label style={styles.tiny}><input type="checkbox" checked={eventForm.donationAccepted} onChange={(e) => updateEventForm("donationAccepted", e.target.checked)} /> Donations accepted</label>
                <label style={styles.tiny}><input type="checkbox" checked={eventForm.rsvpEnabled} onChange={(e) => updateEventForm("rsvpEnabled", e.target.checked)} /> RSVP enabled</label>
                <button type="submit" style={styles.buttonPrimary}>Submit Event for Review</button>
              </form>
              <p style={styles.tiny}>User-submitted events start pending. Kid-friendly events require extra review/verification during beta.</p>
            </div>
          </div>
        ) : null}

        {scoutSubTab === "reports" ? (
        <div style={styles.reportGrid}>
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Submit Store Report</h2>
            <p style={styles.empty}>Share what you saw. Use review if you are unsure or missing details.</p>
            <div style={styles.row}>
              {["Manual", "Screenshot", "Photo", "Import Intel", "Link/Text"].map((method) => (
                <button
                  key={method}
                  type="button"
                  style={reportInputMethod === method ? styles.buttonPrimary : styles.buttonSoft}
                  onClick={() => setReportInputMethod(method)}
                >
                  {method}
                </button>
              ))}
            </div>
            {reportInputMethod === "Screenshot" ? (
              <div style={{ ...styles.calloutCard, marginTop: "14px" }}>
                <h3 style={{ marginTop: 0 }}>Step 4: Screenshot</h3>
                <p style={styles.tiny}>
                  Beta/manual assist: upload a screenshot you are allowed to use, then review the same report fields below before submitting.
                </p>
                <div style={styles.formGrid}>
                  <input type="file" accept="image/*" onChange={handleTipScreenshotUpload} />
                  {tipImport.screenshotPreview ? (
                    <div>
                      <img src={tipImport.screenshotPreview} alt="Uploaded tip screenshot preview" style={styles.previewImage} />
                      <p style={styles.tiny}>Preview: {tipImport.screenshotName}</p>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    style={styles.buttonSoft}
                    onClick={() => setError("OCR/image extraction is coming later. For beta, review the screenshot and enter the fields manually.")}
                  >
                    Extract with AI Later
                  </button>
                  <input style={styles.input} value={tipImport.productName} onChange={(e) => updateTipImport("productName", e.target.value)} placeholder="Product name" />
                  <input style={styles.input} value={tipImport.quantitySeen} onChange={(e) => updateTipImport("quantitySeen", e.target.value)} placeholder="Quantity seen" />
                  <input style={styles.input} value={tipImport.price} onChange={(e) => updateTipImport("price", e.target.value)} placeholder="Price if visible" />
                  <input style={styles.input} type="date" value={tipImport.reportDate} onChange={(e) => updateTipImport("reportDate", e.target.value)} />
                  <input style={styles.input} type="time" value={tipImport.reportTime} onChange={(e) => updateTipImport("reportTime", e.target.value)} />
                  <input style={styles.input} value={tipImport.sourceName} onChange={(e) => updateTipImport("sourceName", e.target.value)} placeholder="Source notes / group name" />
                  <textarea style={styles.textarea} value={tipImport.notes} onChange={(e) => updateTipImport("notes", e.target.value)} placeholder="Notes from the screenshot" />
                  <button type="button" style={styles.buttonPrimary} onClick={applyScreenshotTipToReportForm}>Copy to Report Review</button>
                  <button type="button" style={styles.buttonSoft} onClick={resetTipImport}>Clear Screenshot</button>
                </div>
              </div>
            ) : null}
            {reportInputMethod === "Photo" ? (
              <div style={{ ...styles.calloutCard, marginTop: "14px" }}>
                <h3 style={{ marginTop: 0 }}>Step 4: Photo</h3>
                <p style={styles.tiny}>Add a shelf photo and Scout will save it right away. Product detection can happen later.</p>
                <label className="scout-photo-first-button">
                  <span>Add photo / scan shelf</span>
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhotoFirstReportUpload} />
                </label>
              </div>
            ) : null}
            {reportInputMethod === "Import Intel" ? (
              <div style={{ ...styles.calloutCard, marginTop: "14px" }}>
                <h3 style={{ marginTop: 0 }}>Import restock intel</h3>
                <p style={styles.tiny}>
                  Paste cleaned notes from screenshots, group chats, calls, or planner notes. Raw private details stay private by default.
                </p>
                <textarea
                  style={styles.textarea}
                  value={intelImportText}
                  onChange={(event) => setIntelImportText(event.target.value)}
                  placeholder="Example: Redmill has 2 full cases of First Partner. I just called."
                />
                <div style={styles.row}>
                  <button type="button" style={styles.buttonSoft} onClick={previewIntelImport}>Preview Intel</button>
                  <button type="button" style={styles.buttonPrimary} disabled={!intelImportPreview.length} onClick={() => saveIntelImportRows()}>Save all private</button>
                </div>
                {intelImportPreview.length ? (
                  <div className="scout-intel-review-list">
                    <p style={styles.tiny}>Found {intelImportPreview.length} possible report{intelImportPreview.length === 1 ? "" : "s"}.</p>
                    {intelImportPreview.map((row, index) => (
                      <div key={row.id} className="scout-intel-review-card">
                        <strong>{index + 1}. {row.storeAlias}</strong>
                        <span>{scoutSourceTypeLabel(row.sourceType)} | {row.confidence}</span>
                        <p>{row.rawProductText || "No product phrase detected"}</p>
                        <small>Visibility: private | Needs review before public sharing</small>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {reportInputMethod === "Link/Text" ? (
              <div style={{ ...styles.calloutCard, marginTop: "14px" }}>
                <h3 style={{ marginTop: 0 }}>Step 4: Link/Text</h3>
                <p style={styles.tiny}>Paste notes or a source link in the same report form. Automatic link reading comes later.</p>
              </div>
            ) : null}
            <form onSubmit={handleCreateReport} style={styles.formGrid}>
              <h3 style={{ margin: "8px 0 0" }}>Step 1: What type of report?</h3>
              <select
                style={styles.input}
                value={reportForm.reportType}
                onChange={(e) => setReportForm((current) => ({ ...current, reportType: e.target.value }))}
              >
                <option>Store Restock Report</option>
                <option>Product Sighting / What Did I See</option>
                <option>Store Correction</option>
                <option>Purchase Limit Update</option>
                <option>Restock Pattern Suggestion</option>
              </select>
              {reportForm.reportType === "Product Sighting / What Did I See" ? (
                <p style={styles.tiny}>Use this when you saw products in store but do not need to submit a full restock report.</p>
              ) : null}
              <h3 style={{ margin: "8px 0 0" }}>Step 2: Where?</h3>
              <select
                style={styles.input}
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
              >
                <option value="">Select store</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.nickname || store.name} - {store.city || "No city"}
                  </option>
                ))}
              </select>
              <button type="button" style={styles.buttonSoft} onClick={() => setMissingStoreModalOpen(true)}>Suggest missing store</button>
              <div className="scout-quick-report-panel">
                <div>
                  <h3>Quick report</h3>
                  <p>Tap a stock status, add a note or photo, then submit. Product details are optional.</p>
                </div>
                <div className="scout-stock-status-grid" role="group" aria-label="Stock status">
                  {SCOUT_STOCK_STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`scout-stock-status-button ${reportForm.stockStatus === option.value ? "selected" : ""}`}
                      onClick={() => setReportForm((current) => ({
                        ...current,
                        stockStatus: option.value,
                        reportType: option.reportType || current.reportType,
                        needsReview: option.value === "unknown" ? true : current.needsReview,
                      }))}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <label className="scout-photo-first-button">
                  <span>Add photo / scan shelf</span>
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhotoFirstReportUpload} />
                </label>
                {(reportPhoto?.preview || reportForm.imageUrl) ? (
                  <div className="scout-photo-preview">
                    <img src={reportPhoto?.preview || reportForm.imageUrl} alt="" />
                    <div>
                      <strong>Photo uploaded</strong>
                      <span>Items not identified yet. Needs review.</span>
                    </div>
                  </div>
                ) : null}
              </div>
              {reportForm.reportType === "Store Correction" ? (
                <input
                  style={styles.input}
                  value={reportForm.itemName}
                  onChange={(e) => setReportForm((current) => ({ ...current, itemName: e.target.value, manualItemEntry: true }))}
                  placeholder="Store detail to correct"
                />
              ) : (
                <details className="scout-report-optional-items" defaultOpen={Boolean(reportForm.itemsSeen?.some((item) => item.productName))}>
                  <summary>Items seen - optional</summary>
                  <p className="compact-subtitle">Add sealed products only when it is quick. Quantity and price can be blank.</p>
                  <div className="scout-report-items-editor">
                    {(reportForm.itemsSeen?.length ? reportForm.itemsSeen : [makeBlankReportItem()]).map((item, index) => {
                      const product = item.catalogProductSnapshot;
                      const productIdLine = product
                        ? [product.upc || product.barcode, product.sku || product.externalProductId || product.tcgplayerProductId].filter(Boolean).join(" / ")
                        : "";
                      return (
                        <div className="scout-report-item-editor" key={item.rowId || index}>
                          <div className="scout-report-item-editor-header">
                            <strong>Item {index + 1}</strong>
                            {(reportForm.itemsSeen || []).length > 1 ? (
                              <button type="button" className="secondary-button" onClick={() => removeReportItem(index)}>Remove</button>
                            ) : null}
                          </div>
                          <label>
                            Product / item seen
                            <SmartCatalogSearchBox
                              value={item.productName || ""}
                              onChange={(value) => {
                                if (index === 0) setReportProductSearch(value);
                                updateReportItem(index, {
                                  productName: value,
                                  productId: "",
                                  catalogProductSnapshot: null,
                                  manualItemEntry: true,
                                });
                              }}
                              onSelectSuggestion={(suggestion) => selectReportCatalogProductForItem(index, suggestion)}
                              supabase={supabase}
                              isSupabaseConfigured={isSupabaseConfigured}
                              mapRow={mapCatalogRow}
                              placeholder="Search product, UPC, SKU"
                              closeSignal={reportProductSearchCloseSignal}
                              maxSuggestions={5}
                              suggestionFilter={isSealedScoutCatalogProduct}
                              money={money}
                            />
                          </label>
                          {product ? (
                            <div className="scout-selected-product-card scout-selected-product-card--small">
                              {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span className="scout-selected-product-thumb">No image</span>}
                              <div className="scout-selected-product-copy">
                                <strong>{scoutCatalogTitle(product)}</strong>
                                <small>
                                  {product.productType || product.catalogType || "Sealed product"}
                                  {(product.setName || product.expansion) ? ` | ${product.setName || product.expansion}` : ""}
                                </small>
                                {productIdLine ? <small>UPC/SKU: {productIdLine}</small> : null}
                                <small>Market: {money(scoutCatalogMarketValue(product))}</small>
                              </div>
                              <span className="status-badge">{scoutCatalogSourceLabel(product)}</span>
                              <button type="button" className="secondary-button" onClick={() => updateReportItem(index, {
                                productId: "",
                                catalogProductSnapshot: null,
                                manualItemEntry: true,
                              })}>Clear match</button>
                            </div>
                          ) : null}
                          <div className="scout-report-item-fields">
                            <input
                              style={styles.input}
                              value={item.quantity || ""}
                              onChange={(e) => updateReportItem(index, { quantity: e.target.value })}
                              placeholder="Qty or unknown"
                            />
                            <input
                              style={styles.input}
                              value={item.price || ""}
                              onChange={(e) => updateReportItem(index, { price: e.target.value })}
                              placeholder="Price"
                            />
                          </div>
                          <input
                            style={styles.input}
                            value={item.note || ""}
                            onChange={(e) => updateReportItem(index, { note: e.target.value })}
                            placeholder="Optional item note"
                          />
                        </div>
                      );
                    })}
                    <div className="scout-report-item-actions">
                      <button type="button" style={styles.buttonSoft} onClick={addReportItem}>+ Add another item</button>
                      <button type="button" style={styles.buttonSoft} onClick={enableManualReportItem}>Continue manual entry</button>
                    </div>
                  </div>
                </details>
              )}
              <textarea
                style={styles.textarea}
                value={reportForm.note}
                onChange={(e) => setReportForm((current) => ({ ...current, note: e.target.value }))}
                placeholder="Quick note, limit, or shelf details"
              />
              <details className="scout-report-advanced-time">
                <summary>Advanced: change report time</summary>
                <div style={{ ...styles.formGrid, marginTop: "12px" }}>
                  <label style={{ ...styles.tiny, display: "grid", gap: "6px" }}>
                    Date seen
                    <input
                      style={styles.input}
                      type="date"
                      value={reportForm.reportDate}
                      onChange={(e) => setReportForm((current) => ({
                        ...current,
                        reportDate: e.target.value,
                        reportedAt: "",
                        reportTimeManuallyEdited: true,
                      }))}
                    />
                  </label>
                  <label style={{ ...styles.tiny, display: "grid", gap: "6px" }}>
                    Time seen
                    <input
                      style={styles.input}
                      type="time"
                      value={reportForm.reportTime}
                      onChange={(e) => setReportForm((current) => ({
                        ...current,
                        reportTime: e.target.value,
                        reportedAt: "",
                        reportTimeManuallyEdited: true,
                      }))}
                    />
                  </label>
                  <p style={styles.tiny}>Default is now. Timezone: {reportForm.timezone || getScoutReportNowParts().timezone || "local time"}.</p>
                </div>
              </details>
              <details>
                <summary>Proof / source / visibility</summary>
                <div style={{ ...styles.formGrid, marginTop: "12px" }}>
                  <input
                    style={styles.input}
                    value={reportForm.reportedBy}
                    onChange={(e) => setReportForm((current) => ({ ...current, reportedBy: e.target.value }))}
                    placeholder="Reported by"
                  />
                  <select
                    style={styles.input}
                    value={reportForm.sourceType}
                    onChange={(e) => setReportForm((current) => ({ ...current, sourceType: e.target.value }))}
                  >
                    {SCOUT_SOURCE_TYPES.map((sourceType) => (
                      <option key={sourceType} value={sourceType}>{scoutSourceTypeLabel(sourceType)}</option>
                    ))}
                  </select>
                  <select
                    style={styles.input}
                    value={reportForm.confidence}
                    onChange={(e) => setReportForm((current) => ({ ...current, confidence: e.target.value }))}
                  >
                    {SCOUT_CONFIDENCE_LEVELS.map((confidence) => (
                      <option key={confidence} value={confidence}>{confidence[0].toUpperCase() + confidence.slice(1)}</option>
                    ))}
                  </select>
                  <select
                    style={styles.input}
                    value={reportForm.visibility}
                    onChange={(e) => setReportForm((current) => ({ ...current, visibility: e.target.value }))}
                  >
                    {SCOUT_VISIBILITY_LEVELS.map((visibility) => (
                      <option key={visibility} value={visibility}>{scoutSourceTypeLabel(visibility)}</option>
                    ))}
                  </select>
                  <input
                    style={styles.input}
                    value={reportForm.imageUrl}
                    onChange={(e) => setReportForm((current) => ({ ...current, imageUrl: e.target.value }))}
                    placeholder="Photo, screenshot, or link/text proof"
                  />
                  <p style={styles.tiny}>Text screenshots, names, phone numbers, and group chats stay private unless you choose a cleaned public report.</p>
                  <label style={styles.tiny}>
                    <input
                      type="checkbox"
                      checked={reportForm.verified}
                      onChange={(e) => setReportForm((current) => ({ ...current, verified: e.target.checked }))}
                    />{" "}
                    Mark as verified by me
                  </label>
                </div>
              </details>
              <div style={styles.row}>
                <button type="submit" value="public" style={styles.buttonPrimary}>{editingReportId ? "Save Report" : "Submit Public Report"}</button>
                <button type="button" style={styles.buttonSoft} onClick={(event) => {
                  if (event.currentTarget.form) {
                    event.currentTarget.form.dataset.submitMode = "review";
                    event.currentTarget.form.requestSubmit();
                  }
                }}>Submit for Review</button>
                <button type="button" style={styles.buttonSoft} onClick={resetReportForm}>Cancel / Clear</button>
              </div>
              <p style={styles.tiny}>Use review if you are unsure or missing details.</p>
            </form>
            <h2 style={{ ...styles.sectionTitle, marginTop: "24px" }}>Recent Store Reports</h2>
            {editingReportId ? (
              <p style={styles.tiny}>Editing mode is open in the report form above.</p>
            ) : null}
            {reports.length === 0 ? (
              <div style={styles.calloutCard}>
                <strong>No reports yet for this store.</strong>
                <p style={{ margin: "6px 0 0", color: "#475569" }}>Be the first to add a sighting, empty shelf update, price, or limit.</p>
              </div>
            ) : (
              reports.map((report) => renderCompactReportCard(report))
            )}
          </div>
        </div>

        ) : null}

        {scoutSubTab === "alerts" ? (
        <div style={styles.reportGrid}>
          <div style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "start" }}>
              <div>
                <h2 style={styles.sectionTitle}>Alerts</h2>
                <p style={{ ...styles.empty, padding: 0 }}>Important Scout, store, watchlist, and Best Buy updates.</p>
              </div>
              <span style={styles.badge}>{visibleScoutAlerts.length} active</span>
            </div>

            <div style={{ ...styles.card, boxShadow: "none", marginTop: "14px", padding: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>Active Alerts</h3>
                {visibleScoutAlerts.length > topActiveAlerts.length ? <button type="button" style={styles.buttonSoft} onClick={() => setError("Full alert history view is coming later. Showing the top active alerts for beta.")}>View all alerts</button> : null}
              </div>
              <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
                {topActiveAlerts.length === 0 ? <p style={styles.empty}>No active alerts yet. Favorite stores, add watchlist items, or submit reports to make Scout smarter.</p> : null}
                {topActiveAlerts.map((alert) => {
                  const alertId = alert.reportId || alert.alertId || `${alert.reportType}-${alert.productName}-${alert.createdAt}`;
                  const sourceBadge = /mock|demo/i.test(`${alert.sourceType}`) ? "Estimated" : /best buy/i.test(`${alert.sourceType} ${alert.storeName}`) ? "Online" : "Scout Report";
                  const verifyBadge = alert.verified || alert.verificationStatus === "verified" ? "Verified" : alert.verificationStatus === "pending" ? "Needs Review" : "Unverified";
                  return (
                  <div key={alertId} className="scout-alert-card" style={styles.alertCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                      <strong>{alert.reportType || "Scout alert"}</strong>
                      <div style={styles.row}>
                        <span style={styles.badge}>{sourceBadge}</span>
                        <span style={styles.badge}>{verifyBadge}</span>
                      </div>
                    </div>
                    <p style={{ margin: 0, color: "#475569" }}>
                      {alert.storeName || "Scout"} {alert.productName ? `- ${alert.productName}` : ""}
                      {alert.duplicateCount > 1 ? ` (${alert.duplicateCount} similar)` : ""}
                    </p>
                    <p style={styles.tiny}>Last updated: {alert.createdAt || "Local beta"}</p>
                    <div className="scout-alert-actions" style={styles.row}>
                      <button type="button" style={styles.buttonSoft} onClick={() => {
                        if (getDropWebsiteUrl(alert)) {
                          openDropWebsiteFromUserAction(alert);
                          return;
                        }
                        setError("Alert detail view is coming later. Use Scout reports or Stores for details now.");
                      }}>View Website</button>
                      <button type="button" style={styles.buttonSoft} onClick={() => {
                        setDismissedAlertIds((current) => [...new Set([...current, alertId])]);
                        setError("Alert dismissed.");
                      }}>Dismiss</button>
                    </div>
                  </div>
                );})}
              </div>
            </div>

            <details style={{ ...styles.card, boxShadow: "none", marginTop: "14px", padding: "14px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 800 }}>Alert Preferences</summary>
              <div style={{ marginTop: "10px" }}>
                {alertPreferenceRows.map((row) => {
                  const active = Boolean(alertSettings[row.key]);
                  return (
                    <div key={row.key} style={styles.toggleRow}>
                      <span>
                        <strong>{row.label}</strong>
                        <p style={{ ...styles.tiny, margin: "4px 0 0 0" }}>{row.description}</p>
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={active}
                        aria-label={row.label}
                        style={{ ...styles.switchButton, ...(active ? styles.switchButtonOn : {}) }}
                        onClick={() => updateAlertSetting(row.key, !active)}
                      >
                        <span style={styles.switchKnob} />
                      </button>
                    </div>
                  );
                })}
                <details style={{ marginTop: "12px" }}>
                  <summary style={{ cursor: "pointer", fontWeight: 800 }}>Best Buy Alert Types</summary>
                  <div style={styles.row}>
                    {BEST_BUY_ALERT_TYPES.map((type) => <span key={type} style={styles.badge}>{type}</span>)}
                  </div>
                </details>
              </div>
            </details>

            <div className="scout-advanced-alerts" style={{ ...styles.calloutCard, marginTop: "14px" }}>
              <strong>Advanced Alerts</strong>
              <p style={{ margin: "6px 0 0 0", color: "#475569" }}>Advanced Alerts are part of Plus. Upgrade to unlock advanced scouting, alerts, seller tools, mileage, expenses, and deeper deal analysis.</p>
            </div>
          </div>
        </div>

        ) : null}

        {scoutSubTab === "tidepool" && !compact ? (
        <div style={styles.reportGrid}>
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Report Guidelines</h2>
            <ul style={{ margin: 0, paddingLeft: "20px", color: "#475569" }}>
              <li>Do not fake restocks or report old information as current.</li>
              <li>Add photos when possible.</li>
              <li>Include product name, quantity, store, time, and limits.</li>
              <li>Be honest if you are unsure.</li>
              <li>Repeated false reports lower trust and may pause reporting access.</li>
            </ul>
            <h3 style={{ marginTop: "16px" }}>Event Guidelines</h3>
            <ul style={{ margin: 0, paddingLeft: "20px", color: "#475569" }}>
              <li>Events must be real, current, and clearly described.</li>
              <li>Do not post unsafe meetup details.</li>
              <li>Kid-friendly events should be supervised and require extra review.</li>
              <li>Be clear if the event is free, donation-based, or paid.</li>
              <li>No misleading giveaway claims or fake events.</li>
              <li>Repeated fake or unsafe event posts lower trust and may limit posting.</li>
            </ul>
          </div>
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Tidepool Access</h2>
            <p style={styles.empty}>Free users get limited/basic report views. Paid users can unlock fuller real-time feed and alerts later. Trusted users can earn extra access through verified reports.</p>
            <p style={styles.tiny}>Examples: 5 verified reports = extra views, 15 = faster alerts, 30 = Trusted/Verified Scout path.</p>
          </div>
        </div>

        ) : null}

        {scoutSubTab === "overview" || (!compact && scoutSubTab === "reports") ? (
        <div style={styles.reportGrid}>
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Daily Scout Report</h2>
            {dailyLocalReport.length === 0 ? (
              <p style={styles.empty}>No store reports yet. Submit a report to help improve Scout predictions and build today&apos;s local restock picture.</p>
            ) : (
              dailyLocalReport.map(({ store, score, commonDay, commonDayCount, commonHour, reason }) => (
                <div key={store.id} style={styles.calloutCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                    <strong>{store.name}</strong>
                    <span style={styles.badge}>{score}% Scout Score</span>
                  </div>
                  <p style={{ margin: "8px 0", color: "#334155" }}>{reason}</p>
                  <p style={styles.tiny}>
                    {commonDay ? `Most common day: ${commonDay} (${commonDayCount})` : "No common day yet"}
                    {commonHour ? ` · Common time: ${commonHour}:00` : ""}
                  </p>
                  <div style={styles.row}>
                    {store.phone ? <a style={styles.buttonSoft} href={`tel:${store.phone}`}>Call store</a> : null}
                    {store.address ? (
                      <a
                        style={styles.buttonSoft}
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name} ${store.address} ${store.city || ""}`)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open map
                      </a>
                    ) : null}
                    <button type="button" style={styles.buttonPrimary} onClick={() => setSelectedStoreId(store.id)}>
                      Submit report
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Restock History</h2>
            {restockHistory.length === 0 ? (
              <p style={styles.empty}>No restock history yet. Add a Scout report after checking a store so future predictions get smarter.</p>
            ) : (
              restockHistory.map((report) => renderCompactReportCard(report, { compact: true }))
            )}
          </div>
        </div>

        ) : null}

        {scoutSubTab === "route" ? (
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Scout Route Planner</h2>
          <p style={styles.empty}>Choose a goal and filters. Scout will suggest the best route automatically, then you can adjust stops before saving.</p>
          <form onSubmit={saveRoute} style={styles.formGrid}>
            <input
              style={styles.input}
              value={routeForm.routeName}
              onChange={(e) => updateRouteForm("routeName", e.target.value)}
              placeholder="Route name"
            />
            <input
              style={styles.input}
              value={routeForm.startingZip}
              onChange={(e) => updateRouteForm("startingZip", e.target.value)}
              placeholder="Starting ZIP or city"
            />
            <select
              style={styles.input}
              value={routeForm.routeGoal}
              onChange={(e) => updateRouteForm("routeGoal", e.target.value)}
            >
              {ROUTE_GOALS.map((goal) => <option key={goal}>{goal}</option>)}
            </select>
            <select
              style={styles.input}
              value={routeForm.region}
              onChange={(e) => updateRouteForm("region", e.target.value)}
            >
              {regionOptions.map((region) => (
                <option key={region} value={region}>{region === "All" ? "All regions" : region}</option>
              ))}
            </select>
            <div style={styles.reportGrid}>
              <input
                style={styles.input}
                type="number"
                min="1"
                max="20"
                value={routeForm.maxStops}
                onChange={(e) => updateRouteForm("maxStops", e.target.value)}
                placeholder="Max stops"
              />
              <input
                style={styles.input}
                type="number"
                min="0"
                value={routeForm.maxDistance}
                onChange={(e) => updateRouteForm("maxDistance", e.target.value)}
                placeholder="Max driving distance"
              />
              <input
                style={styles.input}
                type="number"
                min="0"
                value={routeForm.maxTripTime}
                onChange={(e) => updateRouteForm("maxTripTime", e.target.value)}
                placeholder="Max trip time minutes"
              />
            </div>
            <div>
              <p style={styles.tiny}>Store groups to include</p>
              <div style={styles.row}>
                {STORE_GROUP_ORDER.map((group) => (
                  <button
                    key={group}
                    type="button"
                    style={(routeForm.includedGroups || []).includes(group) ? styles.buttonPrimary : styles.buttonSoft}
                    onClick={() => toggleRouteGroup(group)}
                  >
                    {group}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              style={styles.textarea}
              value={routeForm.notes}
              onChange={(e) => updateRouteForm("notes", e.target.value)}
              placeholder="Route notes"
            />
            <div style={styles.row}>
              <button type="button" style={styles.buttonPrimary} onClick={generateSuggestedRoute}>Generate Suggested Route</button>
              <button type="button" style={styles.buttonSoft} onClick={generateSuggestedRoute}>Regenerate Route</button>
            </div>
            <div style={{ display: "grid", gap: "12px" }}>
              {(routeForm.selectedStoreIds.length ? routeForm.selectedStoreIds.map(routeStopDetails).filter(Boolean) : suggestedRouteStops).map((stop, index) => {
                const store = stop.store;
                const isLocked = (routeForm.lockedStoreIds || []).includes(store.id);
                const confidence = Math.max(stop.dailyScore, stop.tidepoolScore, stop.routeScore / 2);
                return (
                  <div key={store.id} style={styles.calloutCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                      <strong>{index + 1}. {store.nickname || store.name}</strong>
                      <span style={styles.badge}>{confidenceLabel(confidence)} confidence</span>
                    </div>
                    {store.nickname ? <p style={{ margin: "6px 0", color: "#64748b" }}>{store.name}</p> : null}
                    <p style={{ margin: "6px 0", color: "#475569" }}>{stop.group} | {store.address || "No address"} | {store.city || ""}</p>
                    <p style={{ margin: "6px 0", color: "#334155" }}>
                      Reason: {explainRouteChoice(stop, routeForm.routeGoal)}
                    </p>
                    <p style={styles.tiny}>
                      Last reported Pokemon stock: {stop.lastReportTime || "No report yet"} | Estimated distance/time: {stop.distance < 999 ? `${stop.distance} mi` : "Unknown"} / Unknown | Priority: {Math.round(stop.routeScore)}
                    </p>
                    <div style={styles.row}>
                      <button type="button" style={styles.buttonSoft} onClick={() => moveRouteStop(store.id, -1)}>Move Up</button>
                      <button type="button" style={styles.buttonSoft} onClick={() => moveRouteStop(store.id, 1)}>Move Down</button>
                      <button type="button" style={isLocked ? styles.buttonPrimary : styles.buttonSoft} onClick={() => toggleLockedRouteStop(store.id)}>{isLocked ? "Locked" : "Lock Stop"}</button>
                      <button type="button" style={styles.buttonDanger} onClick={() => removeRouteStop(store.id)}>Remove</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button type="submit" style={styles.buttonPrimary}>Save Route</button>
          </form>

          {routes.length > 0 ? (
            <div style={{ marginTop: "18px" }}>
              <h2 style={styles.sectionTitle}>Saved Routes</h2>
              {routes.map((route) => (
                <div key={route.id} style={styles.listCard}>
                  <strong>{route.routeName}</strong>
                  <p style={styles.tiny}>{route.routeGoal || "Custom route"} | {route.completed ? "Completed" : "Planned"} | Start: {route.startingZip || "Not set"}</p>
                  <p style={{ margin: "6px 0", color: "#475569" }}>
                    {route.selectedStoreIds
                      .map((storeId) => stores.find((store) => store.id === storeId)?.name)
                      .filter(Boolean)
                      .join(" -> ") || "No stores"}
                  </p>
                  {route.notes ? <p style={{ margin: "6px 0", color: "#475569" }}>{route.notes}</p> : null}
                  <div style={{ display: "grid", gap: "8px", marginTop: "10px" }}>
                    {(route.selectedStoreIds || []).map((storeId, index) => {
                      const store = stores.find((item) => item.id === storeId);
                      if (!store) return null;
                      return (
                        <div key={storeId} style={styles.listCard}>
                          <strong>{index + 1}. {store.nickname || store.name}</strong>
                          <p style={styles.tiny}>{getStoreGroup(store)} | {store.address || "No address"}</p>
                          <textarea
                            style={styles.textarea}
                            value={route.stopNotes?.[storeId] || ""}
                            onChange={(event) => updateRouteStopNote(route.id, storeId, event.target.value)}
                            placeholder="Add restock notes after visiting this stop"
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div style={styles.row}>
                    <a style={styles.buttonSoft} href={routeMapUrl(route)} target="_blank" rel="noreferrer">
                      Open in Google Maps
                    </a>
                    {!route.completed ? <button type="button" style={styles.buttonPrimary} onClick={() => markRouteCompleted(route.id)}>Mark Completed</button> : null}
                    <OverflowMenu onDelete={() => deleteRoute(route.id)} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        ) : null}

        {scoutSubTab === "stores" ? (
          <div style={styles.col}>
            {storeDirectoryView === "landing" ? (
              <>
                <div style={styles.card}>
                  <h2 style={styles.sectionTitle}>Stores</h2>
                  <p style={styles.empty}>Search nearby stores, pick a retailer, then open the exact location you want.</p>
                  <input
                    style={styles.input}
                    value={storeSearch}
                    onChange={(e) => setStoreSearch(e.target.value)}
                    placeholder="Search store, city, ZIP, nickname, or address"
                  />
                  <div style={styles.row}>
                    <button type="button" style={storeQuickFilter === "default" ? styles.buttonPrimary : styles.buttonSoft} onClick={() => {
                      if (!onLocationRequired("nearby-stores")) return;
                      setStoreQuickFilter("default");
                      setSelectedChain("All");
                      setStoreDirectoryView("retailer");
                    }}>Nearby</button>
                    <button type="button" style={storeQuickFilter === "favorites" ? styles.buttonPrimary : styles.buttonSoft} onClick={() => {
                      setStoreQuickFilter("favorites");
                      setSelectedChain("All");
                      setStoreDirectoryView("retailer");
                    }}>Favorites</button>
                    <button type="button" style={styles.buttonSoft} onClick={() => setMissingStoreModalOpen(true)}>Submit Missing Store</button>
                  </div>
                </div>

                {nearbyFavoriteStores.length ? (
                  <div style={styles.card}>
                    <h2 style={styles.sectionTitle}>Nearby / Favorite Stores</h2>
                    <div style={{ display: "grid", gap: "10px" }}>
                      {nearbyFavoriteStores.map((store) => {
                        const storeReports = reportsByStore[store.id] || [];
                        const statusBadges = getStoreStatusBadges(store, storeReports.length);
                        return (
                          <div key={store.id} className="scout-store-card" style={styles.storeChoiceCard} onClick={() => openStoreDetail(store.id)}>
                            <div className="scout-store-row" style={styles.storeRow}>
                              <div>
                                <strong>{store.nickname || store.name}</strong>
                                <p style={{ ...styles.tiny, margin: "4px 0 0" }}>{store.city || "Unknown area"} | {store.address || "No address"}</p>
                                <p style={{ ...styles.tiny, margin: "4px 0 0" }}>{storeReports.length} report{storeReports.length === 1 ? "" : "s"} | Last updated: {formatStoreDate(store.lastUpdated || store.lastVerified || store.lastReportDate)}</p>
                                <div style={{ ...styles.row, marginTop: "8px" }}>
                                  {statusBadges.map((badge) => <span key={badge} style={styles.badge}>{badge}</span>)}
                                </div>
                              </div>
                              <div style={styles.storeRowActions}>
                                <button type="button" style={styles.iconButton} aria-label={store.favorite ? "Unfavorite store" : "Favorite store"} onClick={(event) => { event.stopPropagation(); toggleStoreFavorite(store.id); }}>
                                  {store.favorite ? "★" : "☆"}
                                </button>
                                <button type="button" style={styles.buttonSoft} onClick={(event) => { event.stopPropagation(); openStoreReport(store.id); }}>Report</button>
                                <button type="button" style={styles.buttonSoft} onClick={(event) => { event.stopPropagation(); openStoreDetail(store.id); }}>Open Store</button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div style={styles.card}>
                  <h2 style={styles.sectionTitle}>Retailers</h2>
                  <div className="scout-retailer-grid">
                    {retailerCards.map(({ retailer, count }) => (
                      <button key={retailer} type="button" className="scout-retailer-card" onClick={() => openRetailerPage(retailer)}>
                        <strong>{retailer}</strong>
                        <span>{count} store{count === 1 ? "" : "s"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {storeDirectoryView === "retailer" ? (
              <>
                <div style={styles.card}>
                  <p style={styles.tiny}>Scout &gt; Stores{selectedChain !== "All" ? ` > ${selectedChain}` : ""}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "start" }}>
                    <div>
                      <h2 style={styles.sectionTitle}>{selectedChain === "All" ? "Store Locations" : `${selectedChain} Locations`}</h2>
                      <p style={styles.empty}>Use quick filters, then open one exact store for reports, sightings, and history.</p>
                    </div>
                    <button type="button" style={styles.buttonSoft} onClick={backToStoresLanding}>Back to Retailers</button>
                  </div>
                  <div style={styles.formGrid}>
                    <input
                      style={styles.input}
                      value={storeSearch}
                      onChange={(e) => setStoreSearch(e.target.value)}
                      placeholder={`Search ${selectedChain === "All" ? "stores" : selectedChain} by city, ZIP, nickname, or address`}
                    />
                    <div style={styles.row}>
                      {[
                        ["all", "All"],
                        ["favorites", "Favorites"],
                        ["default", "Nearby"],
                        ["recent", "Recently Updated"],
                        ["highConfidence", "High Confidence"],
                      ].map(([key, label]) => (
                        <button key={key} type="button" style={storeQuickFilter === key ? styles.buttonPrimary : styles.buttonSoft} onClick={() => {
                          if (key === "default" && !onLocationRequired("nearby-stores")) return;
                          setStoreQuickFilter(key);
                        }}>{label}</button>
                      ))}
                      <button type="button" style={styles.buttonSoft} onClick={() => setStoreMoreFiltersOpen((current) => !current)}>More Filters</button>
                    </div>
                    {storeMoreFiltersOpen ? (
                      <div style={styles.formGrid}>
                        <select style={styles.input} value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)}>
                          {cityOptions.map((city) => <option key={city} value={city}>{city === "All" ? "All cities" : city}</option>)}
                        </select>
                        <select style={styles.input} value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)}>
                          {regionOptions.map((region) => <option key={region} value={region}>{region === "All" ? "All regions" : region}</option>)}
                        </select>
                        <select style={styles.input} value={storeSort} onChange={(e) => {
                          if (e.target.value === "distance" && !onLocationRequired("store-distance-sort")) return;
                          setStoreSort(e.target.value);
                        }}>
                          <option value="nickname">Sort by nickname</option>
                          <option value="city">Sort by city</option>
                          <option value="distance">Sort by distance</option>
                          <option value="lastReport">Sort by last report</option>
                          <option value="restockConfidence">Sort by restock confidence</option>
                          <option value="tidepoolScore">Sort by Tidepool score</option>
                        </select>
                      </div>
                    ) : null}
                  </div>
                </div>

                {isBestBuyRetailerSelected ? (
                  <div style={styles.card}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "start" }}>
                      <div>
                        <h2 style={styles.sectionTitle}>Best Buy Stock</h2>
                        <p style={{ ...styles.empty, paddingTop: 0 }}>Check retailer-level stock before selecting a specific Best Buy store.</p>
                      </div>
                      <span style={styles.badge}>{/mock|demo/i.test(String(bestBuySourceStatus)) ? "Estimated data - live Best Buy lookup not connected" : `Source: ${bestBuySourceStatus}`}</span>
                    </div>
                    <p style={styles.tiny}>Last checked: {bestBuyLastChecked}</p>
                    <div style={styles.statsRow}>
                      <Metric label="Tracked SKUs" value={bestBuyStockResults.length} />
                      <Metric label="Available items" value={bestBuySummary.inStock.length || bestBuySummary.pickup.length} />
                      <Metric label="Watchlist matches" value={bestBuyStockResults.length} />
                      <Metric label="Active alerts" value={bestBuyAlerts.length} />
                    </div>
                    <div className="best-buy-stock-form" style={styles.inlineFormRow}>
                      <input style={styles.input} value={bestBuyForm.query} onChange={(e) => setBestBuyForm((current) => ({ ...current, query: e.target.value }))} placeholder="Search term or product name" />
                      <input style={styles.input} value={bestBuyForm.sku} onChange={(e) => setBestBuyForm((current) => ({ ...current, sku: e.target.value }))} placeholder="Best Buy SKU" />
                      <input style={styles.input} value={bestBuyForm.zip} onChange={(e) => setBestBuyForm((current) => ({ ...current, zip: e.target.value }))} placeholder="ZIP code" />
                      <button type="button" style={styles.buttonPrimary} onClick={() => syncBestBuyStock("search")}>Check Stock</button>
                    </div>
                    <div style={styles.row}>
                      <button type="button" style={styles.buttonSoft} onClick={() => submitSharedDataSuggestion({
                        suggestionType: SUGGESTION_TYPES.ADD_BEST_BUY_SKU,
                        targetTable: "retailer_products",
                        submittedData: { retailer: "Best Buy", bestBuySku: bestBuyForm.sku, productName: bestBuyForm.query, zipChecked: bestBuyForm.zip },
                        notes: "Best Buy SKU/watchlist suggestion from retailer stock layer.",
                      }, setError)}>Suggest Best Buy SKU</button>
                      <button type="button" style={styles.buttonSoft} onClick={() => setError("Best Buy alerts are not connected yet. Push/email delivery needs a backend before private beta users can receive alerts.")}>Create Alert</button>
                    </div>
                    {bestBuyMessage ? <p style={styles.tiny}>{bestBuyMessage}</p> : null}
                    {/mock|demo/i.test(String(bestBuySourceStatus)) ? (
                      <p style={styles.tiny}>Live Best Buy lookup is not connected yet. These rows are admin-only testing data.</p>
                    ) : null}
                    <details style={{ marginTop: "12px" }}>
                      <summary style={{ cursor: "pointer", fontWeight: 800 }}>Test Results</summary>
                      <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
                        {bestBuyStockResults.slice(0, 3).map((item) => {
                          const displayStatus = getBestBuyDisplayStatus(item);
                          return (
                            <div key={`${item.bestBuySku}-${item.storeId || item.zipChecked || item.productName}`} style={styles.listCard}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "start" }}>
                                <div>
                                  <strong>{item.productName}</strong>
                                  <p style={styles.tiny}>Best Buy SKU: {item.bestBuySku || "Unknown"}</p>
                                </div>
                                <div style={styles.row}>
                                  <span style={styles.badge}>{displayStatus}</span>
                                  <span style={styles.badge}>{/mock|demo/i.test(String(item.sourceStatus || item.sourceType || bestBuySourceStatus)) ? "Estimated" : item.sourceStatus || item.sourceType || "Unknown"}</span>
                                </div>
                              </div>
                              <div style={styles.row}>
                                <button type="button" style={styles.buttonSoft} onClick={() => setError("Best Buy alerts are not connected yet. Push/email delivery needs a backend before private beta users can receive alerts.")}>Create Alert</button>
                                <button type="button" style={styles.buttonSoft} onClick={() => submitSharedDataSuggestion({
                                  suggestionType: SUGGESTION_TYPES.ADD_BEST_BUY_SKU,
                                  targetTable: "retailer_products",
                                  submittedData: item,
                                  notes: "Best Buy SKU submitted for shared tracker review.",
                                }, setError)}>Suggest SKU</button>
                              </div>
                            </div>
                          );
                        })}
                        {bestBuyStockResults.length === 0 ? <p style={styles.empty}>No Best Buy stock rows yet. Live lookup is not connected for private beta.</p> : null}
                      </div>
                    </details>
                  </div>
                ) : null}

                <div style={styles.card}>
                  <h2 style={styles.sectionTitle}>Store List</h2>
                  {loading ? (
                    <p style={styles.empty}>Loading stores...</p>
                  ) : filteredStores.length === 0 ? (
                    <p style={styles.empty}>No stores match those filters.</p>
                  ) : (
                    <div style={{ display: "grid", gap: "10px" }}>
                      {pagedFilteredStores.items.map((store) => {
                        const storeReports = reportsByStore[store.id] || [];
                        const statusBadges = getStoreStatusBadges(store, storeReports.length);
                        return (
                          <div key={store.id} className="scout-store-card compact-store-card" style={styles.storeChoiceCard} onClick={() => openStoreDetail(store.id)}>
                            <div className="scout-store-row" style={styles.storeRow}>
                              <div>
                                <strong>{store.nickname || store.name}</strong>
                                <p style={{ ...styles.tiny, margin: "4px 0 0" }}>{store.city || "Unknown area"} | {store.address || "No address"}</p>
                                <p style={{ ...styles.tiny, margin: "4px 0 0" }}>{storeReports.length} report{storeReports.length === 1 ? "" : "s"} | Last updated: {formatStoreDate(store.lastUpdated || store.lastVerified || store.lastReportDate)}</p>
                                <div style={{ ...styles.row, marginTop: "8px" }}>
                                  {statusBadges.map((badge) => <span key={badge} style={styles.badge}>{badge}</span>)}
                                </div>
                              </div>
                              <div style={styles.storeRowActions}>
                                <button type="button" style={styles.iconButton} aria-label={store.favorite ? "Unfavorite store" : "Favorite store"} onClick={(event) => { event.stopPropagation(); toggleStoreFavorite(store.id); }}>
                                  {store.favorite ? "★" : "☆"}
                                </button>
                                <button type="button" style={styles.buttonSoft} onClick={(event) => { event.stopPropagation(); openStoreReport(store.id); }}>Report</button>
                                <button type="button" style={styles.buttonSoft} onClick={(event) => { event.stopPropagation(); openStoreDetail(store.id); }}>Open Store</button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <ScoutPagination
                    label="stores"
                    page={pagedFilteredStores.page}
                    pageCount={pagedFilteredStores.pageCount}
                    total={pagedFilteredStores.total}
                    onPageChange={setStorePage}
                  />
                </div>
              </>
            ) : null}

            {storeDirectoryView === "detail" && selectedStore ? (
              <>
                <div style={styles.card}>
                  <p style={styles.tiny}>Scout &gt; Stores &gt; {selectedStore.chain || getStoreGroup(selectedStore)} &gt; {selectedStore.nickname || selectedStore.name}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "12px", flexWrap: "wrap" }}>
                    <div>
                      <h2 style={{ ...styles.sectionTitle, marginBottom: "6px" }}>{selectedStore.nickname || selectedStore.name}</h2>
                      {selectedStore.nickname ? <p style={{ margin: "0 0 6px 0", color: "#475569" }}>{selectedStore.name}</p> : null}
                      <p style={{ margin: "0 0 6px 0", color: "#334155", fontWeight: 800 }}>{selectedStore.chain || selectedStore.retailer || getStoreGroup(selectedStore)} | {selectedStore.city || "Unknown area"}</p>
                      <p style={{ margin: 0, color: "#475569" }}>{selectedStore.address || "No address"}</p>
                      <p style={{ margin: "4px 0 0 0", color: "#475569" }}>{selectedStore.city || "No city"} {selectedStore.phone ? `| ${selectedStore.phone}` : ""}</p>
                    </div>
                    <span style={styles.badge}>{selectedStore.favorite ? "Favorite" : "Shared directory store"}</span>
                  </div>
                  <div style={styles.statsRow}>
                    <Metric label="Restock likelihood" value={selectedStore.restockConfidence || (selectedStore.carriesPokemon || selectedStore.carriesPokemonLikely || selectedStore.carriesTCG ? "Likely" : "Unknown")} />
                    <Metric label="Confidence" value={selectedStore.pokemonConfidenceLevel || selectedStore.pokemonConfidence || "Unknown"} />
                    <Metric label="Last restock" value={selectedStore.lastRestock || selectedStore.lastReportedStockDate || selectedStore.lastReportDate || reports[0]?.reportDate || "Unknown"} />
                    <Metric label="Purchase limits" value={selectedStore.purchaseLimits || selectedStore.limitPolicy || "Unknown"} />
                  </div>
                  <div style={styles.row}>
                    <button type="button" style={styles.buttonPrimary} onClick={() => openStoreReport(selectedStore.id)}>Submit Report</button>
                    <button type="button" style={styles.buttonSoft} onClick={toggleSelectedStoreFavorite}>{selectedStore.favorite ? "Unfavorite" : "Favorite"}</button>
                    <button type="button" style={styles.buttonSoft} onClick={() => submitSharedDataSuggestion({
                      suggestionType: SUGGESTION_TYPES.EDIT_STORE_DETAILS,
                      targetTable: "stores",
                      targetRecordId: selectedStore.id,
                      submittedData: { ...selectedStore, needsReview: true },
                      currentDataSnapshot: selectedStore,
                      notes: "Correction requested from Store Detail.",
                    }, setError)}>Suggest Correction</button>
                    {selectedStore.address ? (
                      <a style={styles.buttonSoft} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedStore.name} ${selectedStore.address} ${selectedStore.city || ""} ${selectedStore.state || ""}`)}`} target="_blank" rel="noreferrer">Open Directions</a>
                    ) : null}
                    <button type="button" style={styles.buttonSoft} onClick={() => {
                      setSelectedStoreId("");
                      setStoreDirectoryView("retailer");
                    }}>Back to Retailer</button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "16px" }}>
                  <div style={styles.card}>
                    <h2 style={styles.sectionTitle}>Recent Reports</h2>
                    {reports.length === 0 ? (
                      <div style={styles.calloutCard}>
                        <p style={{ ...styles.empty, padding: 0 }}>No store reports yet. Submit a report to help improve Scout predictions.</p>
                        <button type="button" style={styles.buttonPrimary} onClick={() => openStoreReport(selectedStore.id)}>Submit First Report</button>
                      </div>
                    ) : (
                      reports.slice(0, 6).map((report) => renderCompactReportCard(report, { compact: true }))
                    )}
                  </div>

                  <div style={styles.card}>
                    <h2 style={styles.sectionTitle}>Tracked Products / Sightings</h2>
                    <p style={{ ...styles.empty, paddingTop: 0 }}>Track products seen at this store or add UPC/SKU details.</p>
                    <div style={styles.row}>
                      <button type="button" style={styles.buttonPrimary} onClick={() => { resetTrackedItemForm(); setTrackedProductsModalOpen(true); }}>Add Product Sighting</button>
                      <button type="button" style={styles.buttonSoft} onClick={() => setError("Tracked items are shown below in this beta view.")}>View Tracked Items</button>
                    </div>
                    {items.length === 0 ? <p style={styles.empty}>No tracked Scout items yet.</p> : null}
                    {items.slice(0, 5).map((item) => (
                      <div key={item.id} className="scout-tracked-item-card" style={styles.listCard}>
                        <strong>{item.name}</strong>
                        <p style={styles.tiny}>Item #: {item.retailerItemNumber || "Unknown"} | SKU: {item.sku || "Unknown"} | UPC: {item.upc || "Unknown"}</p>
                        <div style={styles.row}>
                          <span style={styles.badge}>{item.status}</span>
                          <button type="button" onClick={() => handleMarkItemInStock(item.id)} style={styles.buttonSoft}>Mark In Stock</button>
                          <button type="button" onClick={() => startEditingTrackedItem(item)} style={styles.buttonSoft}>Edit</button>
                          <button type="button" onClick={() => handleDeleteTrackedItem(item.id)} style={styles.buttonDanger}>Delete</button>
                          <OverflowMenu onEdit={() => startEditingTrackedItem(item)} onDelete={() => handleDeleteTrackedItem(item.id)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                  <div style={styles.card}>
                    <h2 style={styles.sectionTitle}>Store Intelligence</h2>
                    <div style={styles.intelligenceRow}><span>Reported restock days</span><strong>{selectedStore.restockDays || selectedStore.stockDays || "Unknown"}</strong></div>
                    <div style={styles.intelligenceRow}><span>Common report days</span><strong>{getMostCommon(reports.map((report) => dayName(report.reportDate || report.report_date)))[0] || "Unknown"}</strong></div>
                    <div style={styles.intelligenceRow}><span>Truck days</span><strong>{selectedStore.truckDays || selectedStore.truckDay || "Unknown"}</strong></div>
                    <div style={styles.intelligenceRow}><span>Purchase limits</span><strong>{selectedStore.purchaseLimits || selectedStore.limitPolicy || "Unknown"}</strong></div>
                    <div style={{ ...styles.intelligenceRow, borderBottom: "none" }}><span>Last verified</span><strong>{selectedStore.lastVerifiedDate || selectedStore.lastVerified || "Unknown"}</strong></div>
                    {selectedStore.stockNotes || selectedStore.userTips || selectedStore.notes ? <p style={styles.tiny}>Notes: {selectedStore.stockNotes || selectedStore.userTips || selectedStore.notes}</p> : null}
                    <div style={styles.row}>
                      <button type="button" style={styles.buttonSoft} onClick={() => submitSharedDataSuggestion({
                        suggestionType: SUGGESTION_TYPES.SUGGEST_RESTOCK_PATTERN,
                        targetTable: "store_intelligence",
                        targetRecordId: selectedStore.id,
                        submittedData: { storeName: selectedStore.name, restockDays: selectedStore.restockDays || "", restockWindow: selectedStore.restockWindow || "" },
                        currentDataSnapshot: selectedStore,
                        notes: "User suggested restock pattern review.",
                      }, setError)}>Suggest Restock Pattern</button>
                      <button type="button" style={styles.buttonSoft} onClick={() => submitSharedDataSuggestion({
                        suggestionType: SUGGESTION_TYPES.SUGGEST_PURCHASE_LIMIT,
                        targetTable: "store_intelligence",
                        targetRecordId: selectedStore.id,
                        submittedData: { storeName: selectedStore.name, purchaseLimits: selectedStore.purchaseLimits || selectedStore.limitPolicy || "" },
                        currentDataSnapshot: selectedStore,
                        notes: "User suggested purchase limit review.",
                      }, setError)}>Suggest Purchase Limit</button>
                    </div>
                  </div>
                  <div style={styles.card}>
                    <h2 style={styles.sectionTitle}>Corrections</h2>
                    <p style={{ ...styles.empty, paddingTop: 0 }}>Missing info? Suggest edits, flag duplicates, or update store details.</p>
                    <button type="button" style={styles.buttonSoft} onClick={() => submitSharedDataSuggestion({
                      suggestionType: SUGGESTION_TYPES.EDIT_STORE_DETAILS,
                      targetTable: "stores",
                      targetRecordId: selectedStore.id,
                      submittedData: { ...selectedStore, needsReview: true },
                      currentDataSnapshot: selectedStore,
                      notes: "User suggested a store correction.",
                    }, setError)}>Suggest Correction</button>
                    <button type="button" style={styles.buttonSoft} onClick={() => submitSharedDataSuggestion({
                      suggestionType: SUGGESTION_TYPES.FLAG_DUPLICATE_STORE,
                      targetTable: "stores",
                      targetRecordId: selectedStore.id,
                      submittedData: { storeName: selectedStore.name, address: selectedStore.address, city: selectedStore.city },
                      currentDataSnapshot: selectedStore,
                      notes: "User flagged possible duplicate store.",
                    }, setError)}>Flag Duplicate</button>
                  </div>
                </div>

                <div style={styles.card}>
                  <h2 style={styles.sectionTitle}>Store History</h2>
                  {reports.length === 0 ? <p style={styles.empty}>No history yet. Reports, corrections, and restock confirmations will appear here.</p> : null}
                  {reports.slice(0, 8).map((report) => renderCompactReportCard(report, { compact: true }))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {false && scoutSubTab === "stores" ? (
        <div style={styles.mainGrid}>
          <div style={styles.col}>
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Shared Store Directory</h2>
              <p style={styles.empty}>
                Stores are shared Virginia-wide master data. Regular users add Scout Tips, restock reports, tracked items, and routes instead of duplicating store records.
              </p>
              <p style={styles.tiny}>
                Suggest missing or corrected stores here. Admin approval is required before shared directory data changes.
              </p>
              <details style={{ marginTop: "12px" }}>
                <summary style={{ ...styles.buttonSoft, cursor: "pointer", display: "inline-block" }}>Suggest Missing Store</summary>
                <form onSubmit={handleCreateStore} style={{ ...styles.formGrid, marginTop: "12px" }}>
                  <input style={styles.input} value={storeForm.name} onChange={(e) => setStoreForm((current) => ({ ...current, name: e.target.value }))} placeholder="Store name" />
                  <input style={styles.input} value={storeForm.chain} onChange={(e) => setStoreForm((current) => ({ ...current, chain: e.target.value }))} placeholder="Retailer / chain" />
                  <input style={styles.input} value={storeForm.storeGroup} onChange={(e) => setStoreForm((current) => ({ ...current, storeGroup: e.target.value }))} placeholder="Store group" />
                  <input style={styles.input} value={storeForm.city} onChange={(e) => setStoreForm((current) => ({ ...current, city: e.target.value }))} placeholder="City" />
                  <input style={styles.input} value={storeForm.address} onChange={(e) => setStoreForm((current) => ({ ...current, address: e.target.value }))} placeholder="Address" />
                  <input style={styles.input} value={storeForm.phone} onChange={(e) => setStoreForm((current) => ({ ...current, phone: e.target.value }))} placeholder="Phone optional" />
                  <button type="submit" style={styles.buttonPrimary}>Save Store</button>
                </form>
              </details>
            </div>

            {isBestBuyRetailerSelected ? (
              <div style={styles.card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "start" }}>
                  <div>
                    <h2 style={styles.sectionTitle}>Best Buy</h2>
                    <p style={styles.empty}>Check Best Buy Pokemon/TCG availability, alerts, and nearby stores before choosing a specific location.</p>
                  </div>
                  <span style={styles.badge}>Source: {bestBuySourceStatus}</span>
                </div>
                <p style={styles.tiny}>Last checked: {bestBuyLastChecked}</p>
                <div style={styles.statsRow}>
                  <Metric label="In Stock / Ship" value={bestBuySummary.inStock.length} />
                  <Metric label="Pickup / Limited" value={bestBuySummary.pickup.length} />
                  <Metric label="Watchlist Matches" value={bestBuyStockResults.length} />
                  <Metric label="Nearby Stores" value={bestBuyRetailerStores.length} />
                </div>

                <h3 style={{ marginTop: "16px" }}>Best Buy Stock</h3>
                <div style={styles.formGrid}>
                  <input style={styles.input} value={bestBuyForm.query} onChange={(e) => setBestBuyForm((current) => ({ ...current, query: e.target.value }))} placeholder="Search Best Buy products by SKU/product name" />
                  <input style={styles.input} value={bestBuyForm.sku} onChange={(e) => setBestBuyForm((current) => ({ ...current, sku: e.target.value }))} placeholder="Best Buy SKU" />
                  <input style={styles.input} value={bestBuyForm.zip} onChange={(e) => setBestBuyForm((current) => ({ ...current, zip: e.target.value }))} placeholder="ZIP / nearby area" />
                  <select style={styles.input} value={bestBuyForm.stockStatus} onChange={(e) => setBestBuyForm((current) => ({ ...current, stockStatus: e.target.value }))}>
                    {BEST_BUY_STOCK_STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </div>
                <div style={styles.row}>
                  <button type="button" style={styles.buttonPrimary} onClick={() => syncBestBuyStock("search")}>Refresh / Check Stock</button>
                  <button type="button" style={styles.buttonSoft} onClick={() => syncBestBuyStock("sku")}>Check SKU</button>
                  <button type="button" style={styles.buttonSoft} onClick={() => submitSharedDataSuggestion({
                    suggestionType: SUGGESTION_TYPES.ADD_BEST_BUY_SKU,
                    targetTable: "retailer_products",
                    submittedData: { retailer: "Best Buy", bestBuySku: bestBuyForm.sku, productName: bestBuyForm.query, zipChecked: bestBuyForm.zip },
                    notes: "Best Buy SKU/watchlist suggestion from stock checker.",
                  }, setError)}>Suggest Best Buy SKU</button>
                  <button type="button" style={styles.buttonSoft} onClick={() => setError("Best Buy alerts are not connected yet. Push/email delivery needs a backend before private beta users can receive alerts.")}>Create Alert</button>
                  <button type="button" style={styles.buttonSoft} onClick={() => submitSharedDataSuggestion({
                    suggestionType: SUGGESTION_TYPES.ADD_BEST_BUY_SKU,
                    targetTable: "retailer_products",
                    submittedData: { retailer: "Best Buy", bestBuySku: bestBuyForm.sku, productName: bestBuyForm.query, requestedCatalogMatch: true },
                    notes: "User suggested linking Best Buy SKU to TideTradr catalog.",
                  }, setError)}>Suggest Product Link</button>
                </div>
                {bestBuyMessage ? <p style={styles.tiny}>{bestBuyMessage}</p> : null}

                <h3 style={{ marginTop: "18px" }}>Watchlist & Online Availability</h3>
                <div style={{ display: "grid", gap: "10px" }}>
                  {bestBuyStockResults.slice(0, 6).map((item) => (
                    <div key={`${item.bestBuySku}-${item.storeId || item.zipChecked || item.productName}`} style={styles.listCard}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                        <strong>{item.productName}</strong>
                        <span style={styles.badge}>{item.stockStatus || "Unknown"}</span>
                      </div>
                      <p style={styles.tiny}>SKU: {item.bestBuySku || "Unknown"} | Price: {item.salePrice || item.price || "Unknown"} | Source: {item.sourceStatus || item.sourceType || "Unavailable"}</p>
                      <p style={styles.tiny}>Online: {item.onlineAvailability || "Unknown"} | Pickup: {item.pickupAvailability || "Unknown"} | Shipping: {item.shippingAvailability || "Unknown"}</p>
                      {item.productUrl ? <a style={styles.buttonSoft} href={item.productUrl} target="_blank" rel="noreferrer">Product URL</a> : null}
                    </div>
                  ))}
                  {bestBuyStockResults.length === 0 ? <p style={styles.empty}>No Best Buy stock rows yet. Live lookup is not connected for private beta.</p> : null}
                </div>

                <h3 style={{ marginTop: "18px" }}>Nearby Best Buy Availability</h3>
                <div style={{ display: "grid", gap: "10px" }}>
                  {bestBuyStoreStock.slice(0, 5).map((item) => (
                    <div key={item.storeStockId || `${item.bestBuySku}-${item.storeId}`} style={styles.listCard}>
                      <strong>{item.storeName || item.productName}</strong>
                      <p style={styles.tiny}>{item.productName} | {item.stockStatus || "Unknown"} | Last checked: {item.lastChecked || item.lastUpdated || "Unknown"}</p>
                      <p style={styles.tiny}>Source: {item.sourceType || "Unavailable"} | Possible dead stock score: {item.deadStockScore || 0}</p>
                    </div>
                  ))}
                  {bestBuyStoreStock.length === 0 ? <p style={styles.empty}>Nearby availability will show here when a SKU/check returns store-level data.</p> : null}
                </div>

                <h3 style={{ marginTop: "18px" }}>Best Buy Reports</h3>
                <div style={styles.row}>
                  {["Latest", "Nearby", "Verified", "Needs Review"].map((filter) => <span key={filter} style={styles.badge}>{filter}</span>)}
                </div>
                {bestBuySourceReports.slice(0, 4).map((report) => (
                  <div key={report.reportId} style={styles.listCard}>
                    <strong>{report.productName || report.reportType}</strong>
                    <p style={styles.tiny}>{report.storeName || "Best Buy"} | {report.verificationStatus || "pending"} | {report.sourceType || "Unavailable"}</p>
                  </div>
                ))}
                {bestBuySourceReports.length === 0 ? <p style={styles.empty}>No Best Buy source reports yet.</p> : null}
              </div>
            ) : null}

            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Find Store Fast</h2>
              <p style={styles.tiny}>
                Statewide Virginia directory: default view keeps practical stores first. Use Browse All Virginia Stores to see every seeded/imported row.
              </p>
              <div style={styles.row}>
                {[
                  ["default", "Nearby / Useful"],
                  ["favorites", "Favorites"],
                  ["recent", "Recently Reported"],
                  ["highConfidence", "High Confidence"],
                  ["strictLimits", "Strict Limits"],
                  ["all", "Browse All Virginia Stores"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    style={storeQuickFilter === key ? styles.buttonPrimary : styles.buttonSoft}
                    onClick={() => setStoreQuickFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div style={styles.formGrid}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <p style={styles.tiny}>Retailers</p>
                  <div style={styles.row}>
                    {chainOptions.map((chain) => {
                      const count = chain === "All" ? stores.length : stores.filter((store) => store.chain === chain).length;
                      return (
                        <button
                          key={chain}
                          type="button"
                          style={selectedChain === chain ? styles.buttonPrimary : styles.buttonSoft}
                          onClick={() => {
                            setSelectedChain(chain);
                            setSelectedStoreId("");
                          }}
                        >
                          {chain} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>
                <input
                  style={styles.input}
                  value={storeSearch}
                  onChange={(e) => setStoreSearch(e.target.value)}
                  placeholder="Search store, nickname, address, notes..."
                />
                <select
                  style={styles.input}
                  value={selectedRegion}
                  onChange={(e) => {
                    setSelectedRegion(e.target.value);
                    setSelectedStoreId("");
                  }}
                >
                  {regionOptions.map((region) => (
                    <option key={region} value={region}>
                      {region === "All" ? "All regions" : region}
                    </option>
                  ))}
                </select>
                <select
                  style={styles.input}
                  value={selectedCity}
                  onChange={(e) => {
                    setSelectedCity(e.target.value);
                    setSelectedStoreId("");
                  }}
                >
                  {cityOptions.map((city) => (
                    <option key={city} value={city}>
                      {city === "All" ? "All cities" : city}
                    </option>
                  ))}
                </select>
                <select
                  style={styles.input}
                  value={selectedChain}
                  onChange={(e) => {
                    setSelectedChain(e.target.value);
                    setSelectedStoreId("");
                  }}
                >
                  {chainOptions.map((chain) => (
                    <option key={chain} value={chain}>
                      {chain}
                    </option>
                  ))}
                </select>
                <select
                  style={styles.input}
                  value={selectedStoreType}
                  onChange={(e) => {
                    setSelectedStoreType(e.target.value);
                    setSelectedStoreId("");
                  }}
                >
                  {storeTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type === "All" ? "All store types" : type}
                    </option>
                  ))}
                </select>
                <select
                  style={styles.input}
                  value={selectedCounty}
                  onChange={(e) => {
                    setSelectedCounty(e.target.value);
                    setSelectedStoreId("");
                  }}
                >
                  {countyOptions.map((county) => (
                    <option key={county} value={county}>
                      {county === "All" ? "All counties" : county}
                    </option>
                  ))}
                </select>
                <select
                  style={styles.input}
                  value={selectedConfidence}
                  onChange={(e) => {
                    setSelectedConfidence(e.target.value);
                    setSelectedStoreId("");
                  }}
                >
                  {confidenceOptions.map((confidence) => (
                    <option key={confidence} value={confidence}>
                      {confidence === "All" ? "All Pokemon confidence" : confidence}
                    </option>
                  ))}
                </select>
                <select
                  style={styles.input}
                  value={storeSort}
                  onChange={(e) => {
                    if (e.target.value === "distance" && !onLocationRequired("store-distance-sort")) return;
                    setStoreSort(e.target.value);
                  }}
                >
                  <option value="nickname">Sort by nickname</option>
                  <option value="distance">Sort by distance</option>
                  <option value="city">Sort by city</option>
                  <option value="last report">Sort by last report</option>
                  <option value="restock confidence">Sort by restock confidence</option>
                  <option value="tidepool score">Sort by Tidepool score</option>
                </select>

                <select
                  style={styles.input}
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                >
                  <option value="">Select a store</option>
                  {filteredStores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name} — {store.city}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginTop: "16px" }}>
                {loading ? (
                  <p style={styles.empty}>Loading stores...</p>
                ) : filteredStores.length === 0 ? (
                  <p style={styles.empty}>No shared stores match those filters.</p>
                ) : (
                  groupedPagedStores.map(({ group, stores: groupStores }) => {
                    const isOpen = openStoreGroups[group] !== false;
                    return (
                      <div key={group} style={styles.storeGroup}>
                        <button
                          type="button"
                          style={styles.storeGroupHeader}
                          onClick={() => toggleStoreGroup(group)}
                          aria-expanded={isOpen}
                        >
                          <span>{group} ({groupStores.length})</span>
                          <span>{isOpen ? "Hide" : "Show"}</span>
                        </button>
                        {isOpen ? (
                          <div style={styles.storeGroupBody}>
                            {groupStores.map((store) => {
                              const storeReports = reportsByStore[store.id] || [];
                              const stockDays = Array.isArray(store.stockDays) ? store.stockDays.join(", ") : store.stockDays || "Unknown";
                              const truckDays = Array.isArray(store.truckDays) ? store.truckDays.join(", ") : store.truckDays || "Unknown";
                              const scoutScore = dailyLocalReport.find((entry) => entry.store.id === store.id)?.score;
                              return (
                                <div
                                  key={store.id}
                                  className="scout-store-card"
                                  onClick={() => setSelectedStoreId(store.id)}
                                  style={styles.storeChoiceCard}
                                >
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                                    <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", fontWeight: 800 }}>
                                      {store.nickname || store.name}
                                    </h3>
                                    <span style={styles.badge}>{storeReports.length} reports</span>
                                  </div>
                                  {store.nickname ? <p style={{ margin: 0, color: "#64748b" }}>{store.name}</p> : null}
                                  <p style={{ margin: 0, color: "#475569" }}>
                                    {store.address || "No address"}
                                  </p>
                                  <p style={{ margin: "4px 0 0 0", color: "#475569" }}>
                                    {store.city || "No city"} {store.region ? ` - ${store.region}` : ""} {store.phone ? ` - ${store.phone}` : ""}
                                  </p>
                                  <p style={styles.tiny}>
                                    Restock day: {stockDays || "Unknown"} | Truck day: {truckDays || "Unknown"} | Score: {scoutScore ? `${scoutScore}%` : "Needs reports"} | Distance: {store.distanceMiles ? `${store.distanceMiles} mi` : "Unknown"}
                                  </p>
                                  <p style={styles.tiny}>
                                    Pokemon confidence: {store.pokemonConfidence || "Unknown"} | Source: {store.source || "local/manual"} | Last verified: {store.lastVerified || "Needs verification"}
                                  </p>
                                  {store.notes ? <p style={{ margin: "6px 0 0 0", color: "#64748b" }}>{store.notes}</p> : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
                <ScoutPagination
                  label="stores"
                  page={pagedFilteredStores.page}
                  pageCount={pagedFilteredStores.pageCount}
                  total={pagedFilteredStores.total}
                  onPageChange={setStorePage}
                />
              </div>
            </div>
          </div>

          {false ? <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Statewide Store CSV Import</h2>
            <p style={styles.tiny}>
              Paste official-directory or manually verified Virginia store rows. Import dedupes by chain + address + ZIP and does not invent restock data.
            </p>
            <textarea
              style={styles.textarea}
              value={storeImportText}
              onChange={(event) => setStoreImportText(event.target.value)}
              placeholder="name,nickname,chain,storeGroup,address,city,state,zip,phone,latitude,longitude,region,county,source,sourceUrl,carriesPokemonLikely,pokemonConfidence,notes"
            />
            <div style={styles.row}>
              <button type="button" style={styles.buttonSoft} onClick={previewStatewideStoreImport}>Preview Store Import</button>
              <button type="button" style={styles.buttonPrimary} disabled={!storeImportPreview.length} onClick={confirmStatewideStoreImport}>
                Import {storeImportPreview.length || ""} Stores
              </button>
            </div>
            {storeImportPreview.length ? (
              <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
                <p style={styles.tiny}>Warnings: {flagStoreImportIssues(storeImportPreview).length}</p>
                {storeImportPreview.slice(0, 5).map((store) => (
                  <div key={store.id} style={styles.listCard}>
                    <strong>{store.nickname || store.name}</strong>
                    <p style={styles.tiny}>{store.chain} | {store.storeGroup} | {store.city}, {store.state} {store.zip}</p>
                    <p style={styles.tiny}>Pokemon confidence: {store.pokemonConfidence || "Unknown"} | Source: {store.source}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div> : null}

          <div style={styles.col}>
            {selectedStore ? (
              <>
                <div style={styles.card}>
                  <p style={styles.tiny}>Scout &gt; Stores &gt; {selectedStore.chain || getStoreGroup(selectedStore)} &gt; {selectedStore.nickname || selectedStore.name}</p>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "start",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <h2 style={{ ...styles.sectionTitle, marginBottom: "6px" }}>
                        {selectedStore.nickname || selectedStore.name}
                      </h2>
                      {selectedStore.nickname ? <p style={{ margin: "0 0 6px 0", color: "#475569" }}>{selectedStore.name}</p> : null}
                      <p style={{ margin: "0 0 6px 0", color: "#334155", fontWeight: 800 }}>
                        {selectedStore.chain || selectedStore.retailer || getStoreGroup(selectedStore)}
                      </p>
                      <p style={{ margin: 0, color: "#475569" }}>
                        {selectedStore.address || "No address"}
                      </p>
                      <p style={{ margin: "4px 0 0 0", color: "#475569" }}>
                        {selectedStore.city || "No city"} {selectedStore.phone ? `• ${selectedStore.phone}` : ""}
                      </p>
                    </div>
                    <span style={styles.badge}>{selectedStore.favorite ? "Favorite" : "Shared directory store"}</span>
                  </div>
                  <div style={styles.statsRow}>
                    <Metric label="Carries Pokemon/TCG" value={selectedStore.carriesPokemon || selectedStore.carriesPokemonLikely || selectedStore.carriesTCG ? "Likely" : "Unknown"} />
                    <Metric label="Confidence" value={selectedStore.pokemonConfidenceLevel || selectedStore.pokemonConfidence || "Unknown"} />
                    <Metric label="Last Updated" value={selectedStore.lastUpdated || selectedStore.lastVerified || "Unknown"} />
                    <Metric label="Last Stock Report" value={selectedStore.lastReportedStockDate || selectedStore.lastReportDate || reports[0]?.reportDate || "Unknown"} />
                  </div>
                  <div style={styles.row}>
                    <button type="button" style={styles.buttonPrimary} onClick={() => setScoutSubTab("reports")}>Submit Report for this store</button>
                    <button type="button" style={styles.buttonSoft} onClick={toggleSelectedStoreFavorite}>{selectedStore.favorite ? "Unfavorite" : "Favorite"}</button>
                    <button type="button" style={styles.buttonSoft} onClick={() => submitSharedDataSuggestion({
                      suggestionType: SUGGESTION_TYPES.EDIT_STORE_DETAILS,
                      targetTable: "stores",
                      targetRecordId: selectedStore.id,
                      submittedData: { userTips: selectedStore.userTips || selectedStore.notes || "", storeName: selectedStore.name },
                      currentDataSnapshot: selectedStore,
                      notes: "Store note/tip submitted for admin review.",
                    }, setError)}>Suggest Store Note</button>
                    <button type="button" style={styles.buttonSoft} onClick={() => submitSharedDataSuggestion({
                      suggestionType: SUGGESTION_TYPES.EDIT_STORE_DETAILS,
                      targetTable: "stores",
                      targetRecordId: selectedStore.id,
                      submittedData: { ...selectedStore, needsReview: true },
                      currentDataSnapshot: selectedStore,
                      notes: "Correction requested from Store Detail.",
                    }, setError)}>Suggest Correction</button>
                    {selectedStore.address ? (
                      <a style={styles.buttonSoft} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedStore.name} ${selectedStore.address} ${selectedStore.city || ""} ${selectedStore.state || ""}`)}`} target="_blank" rel="noreferrer">Open Directions</a>
                    ) : null}
                    {selectedStore.phone ? <a style={styles.buttonSoft} href={`tel:${selectedStore.phone}`}>Call Store</a> : null}
                    <button type="button" style={styles.buttonSoft} onClick={() => setSelectedStoreId("")}>Back to Stores</button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "20px" }}>
                  <div style={styles.card}>
                    <h2 style={styles.sectionTitle}>Recent Reports</h2>
                    <div style={styles.row}>
                      {["Latest", "Verified", "My Reports", "Needs Review", "Expired"].map((filter) => (
                        <span key={filter} style={styles.badge}>{filter}</span>
                      ))}
                    </div>
                    {editingReportId ? <p style={styles.tiny}>Editing mode is open in the report form above.</p> : null}
                    {reports.length === 0 ? (
                      <p style={styles.empty}>No store reports yet. Submit a report to help improve Scout predictions.</p>
                    ) : (
                      reports.map((report) => renderCompactReportCard(report))
                    )}
                  </div>

                  <div style={styles.card}>
                    <h2 style={styles.sectionTitle}>Stock / Product Sightings</h2>
                    <p style={styles.empty}>Products recently seen or tracked at this store. Source can be user report, photo, Best Buy API/cache, or manual entry.</p>
                    <h3 style={{ marginTop: "14px" }}>{editingTrackedItemId ? "Edit Tracked Item" : "Add Product Sighting"}</h3>
                    <form onSubmit={handleCreateItem} style={styles.formGrid}>
                      <input
                        style={styles.input}
                        value={itemForm.category}
                        onChange={(e) =>
                          setItemForm({ ...itemForm, category: e.target.value })
                        }
                        placeholder="Category"
                      />
                      <input
                        style={styles.input}
                        value={itemForm.name}
                        onChange={(e) =>
                          setItemForm({ ...itemForm, name: e.target.value })
                        }
                        placeholder="Item name"
                      />
                      <input
                        style={styles.input}
                        value={itemForm.retailerItemNumber}
                        onChange={(e) =>
                          setItemForm({
                            ...itemForm,
                            retailerItemNumber: e.target.value,
                          })
                        }
                        placeholder="Retailer item number"
                      />
                      <input
                        style={styles.input}
                        value={itemForm.sku}
                        onChange={(e) =>
                          setItemForm({ ...itemForm, sku: e.target.value })
                        }
                        placeholder="SKU"
                      />
                      <input
                        style={styles.input}
                        value={itemForm.upc}
                        onChange={(e) =>
                          setItemForm({ ...itemForm, upc: e.target.value })
                        }
                        placeholder="UPC"
                      />
                      <input
                        style={styles.input}
                        value={itemForm.productUrl}
                        onChange={(e) =>
                          setItemForm({ ...itemForm, productUrl: e.target.value })
                        }
                        placeholder="Product URL"
                      />
                      <select
                        style={styles.input}
                        value={itemForm.status}
                        onChange={(e) =>
                          setItemForm({ ...itemForm, status: e.target.value })
                        }
                      >
                        <option value="Unknown">Unknown</option>
                        <option value="In Stock">In Stock</option>
                        <option value="Out of Stock">Out of Stock</option>
                      </select>
                      <button type="submit" style={styles.buttonPrimary}>
                        {editingTrackedItemId ? "Save Tracked Item" : "Add Tracked Item"}
                      </button>
                      {editingTrackedItemId ? (
                        <button type="button" style={styles.buttonSoft} onClick={resetTrackedItemForm}>
                          Cancel Edit
                        </button>
                      ) : null}
                    </form>

                    <h2 style={{ ...styles.sectionTitle, marginTop: "24px" }}>
                      Tracked Items
                    </h2>
                    {items.length === 0 ? (
                      <p style={styles.empty}>No tracked Scout items yet. Add products you want to watch at this store.</p>
                    ) : (
                      items.map((item) => (
                        <div key={item.id} className="scout-tracked-item-card" style={styles.listCard}>
                          <strong>{item.name}</strong>
                          <p style={{ margin: "8px 0", color: "#334155" }}>
                            Category: {item.category || "—"}
                          </p>
                          <p style={{ margin: "8px 0", color: "#334155" }}>
                            Item #: {item.retailerItemNumber || "—"}
                          </p>
                          <p style={{ margin: "8px 0", color: "#334155" }}>
                            SKU: {item.sku || "—"}
                          </p>
                          <p style={{ margin: "8px 0", color: "#334155" }}>
                            UPC: {item.upc || "—"}
                          </p>
                          <div style={styles.row}>
                            <span style={styles.badge}>{item.status}</span>
                            {item.inStock ? (
                              <span style={{ ...styles.badge, ...styles.badgeFound }}>
                                In Stock
                              </span>
                            ) : null}
                          </div>
                            <div style={styles.row}>
                              <button
                                type="button"
                                onClick={() => handleMarkItemInStock(item.id)}
                                style={styles.buttonSoft}
                              >
                                Mark In Stock
                              </button>

                              <button
                                type="button"
                                onClick={() => openInForge(item)}
                                style={styles.buttonPrimary}
                              >
                                Add to Forge
                              </button>

                              <OverflowMenu
                                onEdit={() => startEditingTrackedItem(item)}
                                onDelete={() => handleDeleteTrackedItem(item.id)}
                              />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "20px", marginTop: "20px" }}>
                  <div style={styles.card}>
                    <h2 style={styles.sectionTitle}>Restock Pattern</h2>
                    <p style={styles.empty}>Reported restock days: {selectedStore.restockDays || selectedStore.stockDays || "Unknown"}</p>
                    <p style={styles.empty}>Restock window: {selectedStore.restockWindow || "Unknown"}</p>
                    <p style={styles.empty}>Truck day: {selectedStore.truckDays || selectedStore.truckDay || "Unknown"}</p>
                    <p style={styles.tiny}>Confidence: {selectedStore.restockConfidence || selectedStore.pokemonConfidence || "Unknown"}. Exact days are not invented.</p>
                  </div>
                  <div style={styles.card}>
                    <h2 style={styles.sectionTitle}>Purchase Limits</h2>
                    <p style={styles.empty}>{selectedStore.purchaseLimits || selectedStore.limitPolicy || "Unknown"}</p>
                    <p style={styles.tiny}>Last verified: {selectedStore.lastVerifiedDate || selectedStore.lastVerified || "Unknown"}</p>
                  </div>
                  <div style={styles.card}>
                    <h2 style={styles.sectionTitle}>Store Notes / Tips</h2>
                    <p style={styles.empty}>{selectedStore.stockNotes || selectedStore.userTips || selectedStore.notes || "No store tips yet."}</p>
                    <p style={styles.tiny}>{selectedStore.adminNotes ? `Admin notes: ${selectedStore.adminNotes}` : "Admin notes: none"}</p>
                  </div>
                  <div style={styles.card}>
                    <h2 style={styles.sectionTitle}>Corrections</h2>
                    <p style={styles.empty}>Submit missing info, suggest edits, or flag a duplicate. Admin approval is required before shared store data changes.</p>
                    <div style={styles.row}>
                      <button type="button" style={styles.buttonSoft} onClick={() => submitSharedDataSuggestion({
                        suggestionType: SUGGESTION_TYPES.EDIT_STORE_DETAILS,
                        targetTable: "stores",
                        targetRecordId: selectedStore.id,
                        submittedData: { storeName: selectedStore.name, needsReview: true },
                        currentDataSnapshot: selectedStore,
                        notes: "User submitted missing store info for review.",
                      }, setError)}>Submit Missing Info</button>
                      <button type="button" style={styles.buttonSoft} onClick={() => submitSharedDataSuggestion({
                        suggestionType: SUGGESTION_TYPES.FLAG_DUPLICATE_STORE,
                        targetTable: "stores",
                        targetRecordId: selectedStore.id,
                        submittedData: { storeName: selectedStore.name, address: selectedStore.address, city: selectedStore.city },
                        currentDataSnapshot: selectedStore,
                        notes: "User marked possible duplicate store.",
                      }, setError)}>Flag Duplicate</button>
                    </div>
                  </div>
                </div>
                <div style={{ ...styles.card, marginTop: "20px" }}>
                  <h2 style={styles.sectionTitle}>Store History</h2>
                  {[...reports].slice(0, 8).map((report) => renderCompactReportCard(report, { compact: true }))}
                  {reports.length === 0 ? <p style={styles.empty}>No history yet. Submit the first report for this store.</p> : null}
                </div>
              </>
            ) : (
              <div style={styles.card}>
                <h2 style={styles.sectionTitle}>Select a store</h2>
                <p style={styles.empty}>
                  Pick a chain, then pick a store. You do not need to scroll through the whole list anymore.
                </p>
              </div>
            )}
          </div>
        </div>
        ) : null}
        {selectedReportTarget ? (
          <div className="location-modal-backdrop scout-sheet-backdrop" role="presentation" onClick={() => setSelectedReportTarget(null)}>
            <section className="location-modal scout-report-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="scout-page-report-detail-title" onClick={(event) => event.stopPropagation()}>
              <div className="modal-title-row modal-sticky-header">
                <div>
                  <p>Scout report</p>
                  <h2 id="scout-page-report-detail-title">{getReportStore(selectedReportTarget).nickname || getReportStore(selectedReportTarget).name || "Store not selected"}</h2>
                </div>
                <button type="button" className="modal-close-button" aria-label="Close report details" onClick={() => setSelectedReportTarget(null)}>X</button>
              </div>
              {renderCompactReportCard(selectedReportTarget)}
              <div className="scout-report-detail-items">
                <h3>Full items seen</h3>
                {normalizeReportItemsForForm(selectedReportTarget).filter((item) => String(item.productName || "").trim()).length ? (
                  normalizeReportItemsForForm(selectedReportTarget).filter((item) => String(item.productName || "").trim()).map((item, index) => (
                    <div key={`${item.productName}-${index}`} className="scout-report-detail-item">
                      <strong>{item.productName}</strong>
                      <span>{item.quantity ? `Qty ${item.quantity}` : "Qty unknown"}</span>
                      <span>{Number(item.price || 0) > 0 ? money(item.price) : "Price not added"}</span>
                      {item.note ? <p>{item.note}</p> : null}
                    </div>
                  ))
                ) : (
                  <div className="scout-report-detail-item">
                    <strong>General report</strong>
                    <span>{scoutStockStatusLabel(selectedReportTarget.stockStatus || selectedReportTarget.stock_status) || "Stock status not selected"}</span>
                    {getScoutReportPhotoUrls(selectedReportTarget).length ? <span>Photo uploaded - Items not identified yet</span> : null}
                    {selectedReportTarget.note ? <p>{selectedReportTarget.note}</p> : null}
                  </div>
                )}
              </div>
              <div className="location-modal-actions modal-sticky-footer">
                <button type="button" onClick={() => startEditingReport(selectedReportTarget)}>Edit</button>
                {isUserOwnedScoutReport(selectedReportTarget) ? <button type="button" className="delete-button" onClick={() => setDeleteReportTarget(selectedReportTarget)}>Delete</button> : null}
                <button type="button" className="secondary-button" onClick={() => setSelectedReportTarget(null)}>Close</button>
              </div>
            </section>
          </div>
        ) : null}
        {deleteReportTarget ? (
          <div className="location-modal-backdrop scout-sheet-backdrop" role="presentation" onClick={() => setDeleteReportTarget(null)}>
            <section className="location-modal scout-delete-confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="scout-page-delete-title" onClick={(event) => event.stopPropagation()}>
              <div className="modal-title-row modal-sticky-header">
                <div>
                  <p>Delete Scout report</p>
                  <h2 id="scout-page-delete-title">Delete this report?</h2>
                </div>
                <button type="button" className="modal-close-button" aria-label="Close delete confirmation" onClick={() => setDeleteReportTarget(null)}>X</button>
              </div>
              <p className="compact-subtitle">
                This will delete the report for {getReportStore(deleteReportTarget).nickname || getReportStore(deleteReportTarget).name || "the selected store"}.
              </p>
              <div className="location-modal-actions modal-sticky-footer">
                <button
                  type="button"
                  className="delete-button"
                  onClick={() => {
                    handleDeleteReport(deleteReportTarget.id || deleteReportTarget.reportId || deleteReportTarget.report_id);
                    setDeleteReportTarget(null);
                    setSelectedReportTarget(null);
                  }}
                >
                  Delete Report
                </button>
                <button type="button" className="secondary-button" onClick={() => setDeleteReportTarget(null)}>Cancel</button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

