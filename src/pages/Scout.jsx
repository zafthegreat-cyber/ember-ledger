import { useEffect, useMemo, useState } from "react";
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
import OverflowMenu from "../components/OverflowMenu";
import { getStoreGroup, normalizeStoreGroup, STORE_GROUP_ORDER } from "../utils/storeGroupingUtils";
import { dedupeStoresByChainAddress, flagStoreImportIssues, normalizeImportedStore, parseStoreCsv } from "../utils/storeImportUtils";
import { storeMatchesSearch, sortStores } from "../utils/storeSearchUtils";
import { buildSuggestedRoute, confidenceLabel, explainRouteChoice, numericDistance } from "../utils/routeUtils";
import { VIRGINIA_REGIONS } from "../data/storeGroups";
import { VIRGINIA_STORES_SEED, VIRGINIA_STORE_SEED_STATUS } from "../data/virginiaStoresSeed";

const BETA_LOCAL_SCOUT = true;
const SCOUT_STORAGE_KEY = "et-tcg-beta-scout";
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

const ROUTE_GOALS = [
  "Fastest route",
  "Highest restock chance",
  "Best value route",
  "Most reports today",
  "Closest stores first",
  "Custom filters",
];

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
    verifiedOnly: false,
    quietHours: false,
  };
}

function makeTidepoolReport(overrides = {}) {
  const now = new Date().toISOString();
  const hasPhoto = Boolean(overrides.photoUrl);
  const verificationStatus = overrides.verificationStatus || "pending";
  return {
    reportId: overrides.reportId || makeScoutId("tidepool"),
    userId: overrides.userId || "mock-scout",
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
    sourceType: overrides.sourceType || (hasPhoto ? "photo" : "mock"),
    favoriteStore: Boolean(overrides.favoriteStore),
    watchlistItem: Boolean(overrides.watchlistItem),
    lastUpdated: overrides.lastUpdated || now,
  };
}

function createMockTidepoolReports(stores = []) {
  const first = stores[0] || {};
  const second = stores[1] || first;
  const third = stores[2] || first;
  return [
    makeTidepoolReport({
      storeId: first.id,
      storeName: first.name || "Hampton Roads Target",
      productName: "Scarlet & Violet 151 Booster Bundle",
      reportType: "Restock sighting",
      reportText: "Beta mock: several booster bundles seen near the cards section. Needs real user confirmation.",
      quantitySeen: "6",
      purchaseLimit: "Unknown",
      city: first.city || "Suffolk",
      zip: first.zip || "",
      verificationStatus: "pending",
      confidenceScore: 62,
      sourceType: "mock",
      watchlistItem: true,
    }),
    makeTidepoolReport({
      storeId: second.id,
      storeName: second.name || "Hampton Roads Walmart",
      productName: "Pokemon ETBs",
      reportType: "Nothing in stock",
      reportText: "Beta mock: checked shelves, no Pokemon cards visible.",
      city: second.city || "Chesapeake",
      zip: second.zip || "",
      verificationStatus: "verified",
      confidenceScore: 76,
      verifiedByCount: 2,
      helpfulVotes: 3,
      sourceType: "mock",
    }),
    makeTidepoolReport({
      storeId: third.id,
      storeName: third.name || "Online Drop",
      productName: "Prismatic Evolutions ETB",
      reportType: "Online drop alert",
      reportText: "Beta mock online drop placeholder. Alert-only, no checkout automation.",
      city: third.city || "Virginia Beach",
      verificationStatus: "pending",
      confidenceScore: 55,
      sourceType: "mock",
    }),
  ];
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
    padding: "12px",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: "#0f172a",
  },
  shell: {
    maxWidth: "1180px",
    margin: "0 auto",
    display: "grid",
    gap: "20px",
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
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: "18px",
    padding: "14px",
  },
  statLabel: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.72)",
    marginBottom: "6px",
  },
  statValue: {
    fontSize: "22px",
    fontWeight: 800,
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
    borderRadius: "18px",
    padding: "16px",
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
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
    gap: "14px",
  },
  calloutCard: {
    border: "1px solid #bae6fd",
    borderRadius: "16px",
    padding: "14px",
    marginBottom: "12px",
    background: "linear-gradient(135deg, #f0f9ff 0%, #fff7ed 100%)",
  },
  storeChoiceCard: {
    border: "1px solid #e5e7eb",
    borderRadius: "18px",
    padding: "14px",
    background: "#fff",
    marginBottom: "10px",
    cursor: "pointer",
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
    borderRadius: "18px",
    padding: "14px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.08)",
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

export default function Scout({ targetSubTab = { tab: "overview", id: 0 } }) {
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
  const [storeImportText, setStoreImportText] = useState("");
  const [storeImportPreview, setStoreImportPreview] = useState([]);
  const [openStoreGroups, setOpenStoreGroups] = useState(() =>
    Object.fromEntries(STORE_GROUP_ORDER.map((group) => [group, true]))
  );
  const [reports, setReports] = useState([]);
  const [allReports, setAllReports] = useState([]);
  const [tidepoolReports, setTidepoolReports] = useState([]);
  const [tidepoolFilter, setTidepoolFilter] = useState("Latest");
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
    quantityRemaining: "",
    limitInfo: "",
    sourceName: "",
    extractionConfidence: "",
    notes: "",
    verified: false,
    keepScreenshot: true,
  });

  const [storeForm, setStoreForm] = useState({
    name: "",
    chain: "",
    storeGroup: "",
    city: "",
    address: "",
    phone: "",
  });

  useEffect(() => {
    const nextTab = typeof targetSubTab === "string" ? targetSubTab : targetSubTab?.tab;
    if (nextTab) setScoutSubTab(nextTab);
  }, [targetSubTab]);

  const [editStoreForm, setEditStoreForm] = useState({
    name: "",
    chain: "",
    storeGroup: "",
    city: "",
    address: "",
    phone: "",
  });

  const [reportForm, setReportForm] = useState({
    itemName: "",
    note: "",
    reportDate: "",
    reportTime: "",
    reportedBy: "Zena",
    verified: true,
    lat: null,
    lng: null,
    imageUrl: "",
  });

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

  async function loadStores() {
    if (BETA_LOCAL_SCOUT) {
      const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
      const savedStores = dedupeStoresByChainAddress(saved.stores?.length ? [...STATEWIDE_SEED_STORES, ...saved.stores] : STATEWIDE_SEED_STORES)
        .map((store) => normalizeImportedStore(store));
      const savedReports = saved.reports || [];
      const savedTidepoolReports = saved.tidepoolReports?.length
        ? saved.tidepoolReports
        : createMockTidepoolReports(savedStores);
      const savedScoutProfile = saved.scoutProfile || createDefaultScoutProfile();
      const savedAlertSettings = saved.alertSettings || createDefaultAlertSettings();
      if (!saved.stores?.length) {
        localStorage.setItem(
          SCOUT_STORAGE_KEY,
          JSON.stringify({
            ...saved,
            stores: savedStores,
            reports: savedReports,
            tidepoolReports: savedTidepoolReports,
            scoutProfile: savedScoutProfile,
            alertSettings: savedAlertSettings,
            items: saved.items || [],
            routes: saved.routes || [],
          })
        );
      }
      setStores(savedStores);
      setAllReports(savedReports);
      setTidepoolReports(savedTidepoolReports);
      setScoutProfile(savedScoutProfile);
      setAlertSettings(savedAlertSettings);
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

  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  function resetReportForm() {
    setEditingReportId(null);
    setReportPhoto(null);
    setReportForm({
      itemName: "",
      note: "",
      reportDate: "",
      reportTime: "",
      reportedBy: "Zena",
      verified: true,
      lat: null,
      lng: null,
      imageUrl: "",
    });
  }

  function startEditingReport(report) {
    setEditingReportId(report.id);
    setReportPhoto(null);
    setReportForm({
      itemName: report.itemName || report.item_name || "",
      note: report.note || "",
      reportDate: getReportDate(report),
      reportTime: getReportTime(report),
      reportedBy: report.reportedBy || report.reported_by || "Zena",
      verified: Boolean(report.verified),
      lat: report.lat || null,
      lng: report.lng || null,
      imageUrl: report.imageUrl || report.image_url || "",
    });
  }

function saveLocalScout(next) {
  const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
  localStorage.setItem(SCOUT_STORAGE_KEY, JSON.stringify({ ...saved, ...next }));
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

function saveTidepoolReports(nextReports) {
  setTidepoolReports(nextReports);
  saveLocalScout({ tidepoolReports: nextReports });
}

function saveScoutProfile(nextProfile) {
  setScoutProfile(nextProfile);
  saveLocalScout({ scoutProfile: nextProfile });
}

function updateAlertSetting(field, value) {
  const next = { ...alertSettings, [field]: value };
  setAlertSettings(next);
  saveLocalScout({ alertSettings: next });
}

function updateTidepoolForm(field, value) {
  setTidepoolForm((current) => ({ ...current, [field]: value }));
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
    const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
    const newStore = normalizeStoreGroup({
      id: makeScoutId("store"),
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
    });
    const nextStores = [newStore, ...(saved.stores || [])];
    saveLocalScout({ stores: nextStores });
    setStores(nextStores);
    setSelectedStoreId(newStore.id);
    setStoreForm({ name: "", chain: "", storeGroup: "", city: "", address: "", phone: "" });
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
    const activeStoreId = selectedStoreId || stores[0]?.id;
    if (!activeStoreId) return;

    if (BETA_LOCAL_SCOUT) {
      const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
      const reportPayload = {
        storeId: activeStoreId,
        itemName: reportForm.itemName,
        note: reportForm.note,
        reportDate: reportForm.reportDate,
        reportTime: reportForm.reportTime,
        reportedBy: reportForm.reportedBy,
        verified: reportForm.verified,
        lat: reportForm.lat,
        lng: reportForm.lng,
        imageUrl: reportForm.imageUrl,
      };

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
        setError("");
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
          ? { ...store, status: "Found", lastRestock: reportForm.reportDate || new Date().toISOString().slice(0, 10) }
          : store
      );
      saveLocalScout({ stores: nextStores, reports: nextReports });
      setStores(nextStores);
      setAllReports(nextReports);
      setSelectedStoreId(activeStoreId);
      setReports(nextReports.filter((report) => getReportStoreId(report) === activeStoreId));
      resetReportForm();
      setError("");
      return;
    }

    try {
      if (editingReportId) {
        await updateReport(activeStoreId, editingReportId, reportForm);
      } else {
        await createReport(activeStoreId, reportForm);
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
    const activeStoreId = selectedStoreId || stores[0]?.id;

    if (!activeStoreId) {
      setError("Select or create a store before saving a screenshot tip.");
      return;
    }

    if (!tipImport.screenshotPreview) {
      setError("Upload a screenshot before saving a screenshot tip.");
      return;
    }

    if (!tipImport.productName && !tipImport.notes) {
      setError("Add a product name or notes before saving a screenshot tip.");
      return;
    }

    const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
    const reportDate = tipImport.reportDate || new Date().toISOString().slice(0, 10);
    const screenshotLocalId = tipImport.keepScreenshot ? makeScoutId("screenshot") : "";
    const newReport = {
      id: makeScoutId("report"),
      storeId: activeStoreId,
      itemName: tipImport.productName || "Screenshot tip",
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
      reportTime: tipImport.reportTime,
      dayOfWeek: dayName(reportDate),
      reportedBy: "Screenshot Tip Import",
      verified: tipImport.verified,
      reportType: "facebook_screenshot",
      report_type: "facebook_screenshot",
      sourceFormat: "facebook_screenshot",
      source_format: "facebook_screenshot",
      sourceName: tipImport.sourceName,
      source_name: tipImport.sourceName,
      stockStatus: tipImport.stockStatus,
      stock_status: tipImport.stockStatus,
      quantitySeen: tipImport.quantitySeen,
      quantity_seen: tipImport.quantitySeen,
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
        setError("");
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
      setError("");
      return;
    }

    try {
      if (editingTrackedItemId) {
        await updateTrackedItem(activeStoreId, editingTrackedItemId, itemForm);
      } else {
        await createTrackedItem(activeStoreId, itemForm);
      }
      resetTrackedItemForm();
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

  function toggleStoreGroup(group) {
    setOpenStoreGroups((current) => ({ ...current, [group]: current[group] === false }));
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

  const tidepoolAlerts = useMemo(() => {
    return enrichedTidepoolReports
      .filter((report) => {
        if (!alertSettings.enabled) return false;
        if (alertSettings.verifiedOnly && report.computedStatus !== "verified") return false;
        if (alertSettings.favoriteStoresOnly && !report.favoriteStore) return false;
        if (!alertSettings.onlineDropAlerts && report.reportType === "Online drop alert") return false;
        if (!alertSettings.watchlistAlerts && report.watchlistItem) return false;
        return report.weightedScore >= 60 || report.computedStatus === "verified";
      })
      .slice(0, 5);
  }, [enrichedTidepoolReports, alertSettings]);

  const scoutBadge =
    scoutProfile.verifiedReportCount >= 30 || scoutProfile.trustScore >= 90
      ? "Verified Scout"
      : scoutProfile.verifiedReportCount >= 15 || scoutProfile.trustScore >= 82
        ? "Trusted Scout"
        : scoutProfile.verifiedReportCount >= 5
          ? "Community Helper"
          : scoutProfile.badgeLevel || "New Scout";

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.hero}>
          <h1 style={styles.heroTitle}>Scout</h1>
          <p style={styles.heroSub}>
            Scout stores, track restocks, log sightings, and send purchases to The Forge.
          </p>

          <div style={styles.statsRow}>
            <Metric label="Stores" value={totals.stores} />
            <Metric label="Found" value={totals.found} />
            <Metric label="Reports" value={totals.reports} />
            <Metric label="Tracked Items" value={totals.items} />
          </div>
        </div>

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

        <div style={styles.pageHeader}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h2 style={{ ...styles.sectionTitle, marginBottom: "4px" }}>Scout Dashboard</h2>
              <p style={{ ...styles.empty, padding: 0 }}>Stores, reports, routes, Tidepool, and alerts in focused views.</p>
            </div>
            <div style={styles.row}>
              <button type="button" style={styles.buttonPrimary} onClick={() => setScoutSubTab("reports")}>Add Report</button>
              <button type="button" style={styles.buttonSoft} onClick={() => setScoutSubTab("route")}>Build Route</button>
            </div>
          </div>
          <div style={styles.row}>
            <button type="button" style={styles.buttonSoft} onClick={() => setScoutSubTab("reports")}>Add Report</button>
            <button type="button" style={styles.buttonSoft} onClick={() => setScoutSubTab("route")}>Build Route</button>
            <button type="button" style={styles.buttonSoft} onClick={() => setScoutSubTab("stores")}>Add Store</button>
            <button type="button" style={styles.buttonSoft} onClick={() => setScoutSubTab("tidepool")}>View Tidepool</button>
          </div>
          <div style={styles.subTabs}>
            {[
              ["overview", "Overview"],
              ["stores", "Stores"],
              ["reports", "Reports"],
              ["route", "Route Planner"],
              ["tidepool", "Tidepool"],
              ["alerts", "Alerts"],
            ].map(([key, label]) => (
              <button key={key} type="button" style={scoutSubTab === key ? styles.buttonPrimary : styles.buttonSoft} onClick={() => setScoutSubTab(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {scoutSubTab === "overview" ? (
          <>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Virginia Scout Directory</h2>
          <p style={styles.empty}>
            Scout is ready for statewide Virginia coverage. Hampton Roads has starter store rows now; other regions are import-ready batches that should be filled from official store directories or manual CSVs.
          </p>
          <div style={styles.statsRow}>
            <Metric label="VA Stores" value={stores.length} />
            <Metric label="Regions" value={VIRGINIA_REGIONS.length} />
            <Metric label="Filtered View" value={filteredStores.length} />
            <Metric label="Seed Batches" value={VIRGINIA_STORE_SEED_STATUS.length} />
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

          </>
        ) : null}

        {scoutSubTab === "tidepool" ? (
          <>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Tidepool</h2>
          <p style={styles.empty}>Community-powered Scout reports for restocks, products, limits, deals, online drops, and store updates.</p>
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
                  <button type="button" style={styles.buttonSoft} onClick={() => adminSetTidepoolStatus(report.reportId, "verified")}>Admin Verify</button>
                  <button type="button" style={styles.buttonSoft} onClick={() => adminSetTidepoolStatus(report.reportId, "expired")}>Expire</button>
                </div>
              </div>
            ))}
          </div>
        </div>

          </>
        ) : null}

        {scoutSubTab === "reports" || scoutSubTab === "alerts" ? (
        <div style={styles.reportGrid}>
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Submit Report</h2>
            <form onSubmit={submitTidepoolReport} style={styles.formGrid}>
              <input style={styles.input} value={tidepoolForm.displayName} onChange={(e) => updateTidepoolForm("displayName", e.target.value)} placeholder="Display name" />
              <select style={styles.input} value={tidepoolForm.reportType} onChange={(e) => updateTidepoolForm("reportType", e.target.value)}>
                {TIDEPOOL_REPORT_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
              <input style={styles.input} value={tidepoolForm.productName} onChange={(e) => updateTidepoolForm("productName", e.target.value)} placeholder="Product/card name" />
              <input style={styles.input} value={tidepoolForm.quantitySeen} onChange={(e) => updateTidepoolForm("quantitySeen", e.target.value)} placeholder="Quantity seen" />
              <input style={styles.input} value={tidepoolForm.price} onChange={(e) => updateTidepoolForm("price", e.target.value)} placeholder="Price/deal seen" />
              <input style={styles.input} value={tidepoolForm.purchaseLimit} onChange={(e) => updateTidepoolForm("purchaseLimit", e.target.value)} placeholder="Purchase limit" />
              <input style={styles.input} value={tidepoolForm.photoUrl} onChange={(e) => updateTidepoolForm("photoUrl", e.target.value)} placeholder="Photo URL / local placeholder" />
              <textarea style={styles.textarea} value={tidepoolForm.reportText} onChange={(e) => updateTidepoolForm("reportText", e.target.value)} placeholder="What did you see? Include store, time, quantity, and limits." />
              <label style={{ ...styles.tiny, display: "flex", gap: "8px", alignItems: "center" }}>
                <input type="checkbox" checked={tidepoolForm.anonymous} onChange={(e) => updateTidepoolForm("anonymous", e.target.checked)} />
                Submit anonymously
              </label>
              <button type="submit" style={styles.buttonPrimary}>Submit to Tidepool</button>
            </form>
          </div>

          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Scout Alerts</h2>
            <div style={styles.formGrid}>
              <label style={styles.tiny}><input type="checkbox" checked={alertSettings.enabled} onChange={(e) => updateAlertSetting("enabled", e.target.checked)} /> Alerts on</label>
              <input style={styles.input} type="number" value={alertSettings.radiusMiles} onChange={(e) => updateAlertSetting("radiusMiles", e.target.value)} placeholder="Radius miles" />
              <label style={styles.tiny}><input type="checkbox" checked={alertSettings.favoriteStoresOnly} onChange={(e) => updateAlertSetting("favoriteStoresOnly", e.target.checked)} /> Favorite stores only</label>
              <label style={styles.tiny}><input type="checkbox" checked={alertSettings.watchlistAlerts} onChange={(e) => updateAlertSetting("watchlistAlerts", e.target.checked)} /> Watchlist product alerts</label>
              <label style={styles.tiny}><input type="checkbox" checked={alertSettings.onlineDropAlerts} onChange={(e) => updateAlertSetting("onlineDropAlerts", e.target.checked)} /> Online drop alerts</label>
              <label style={styles.tiny}><input type="checkbox" checked={alertSettings.verifiedOnly} onChange={(e) => updateAlertSetting("verifiedOnly", e.target.checked)} /> Verified-only alerts</label>
              <label style={styles.tiny}><input type="checkbox" checked={alertSettings.quietHours} onChange={(e) => updateAlertSetting("quietHours", e.target.checked)} /> Quiet hours placeholder</label>
            </div>
            <h3 style={{ marginTop: "16px" }}>In-app Alerts</h3>
            {tidepoolAlerts.length === 0 ? <p style={styles.empty}>No matching alerts yet.</p> : tidepoolAlerts.map((alert) => (
              <div key={alert.reportId} style={styles.listCard}>
                <strong>{alert.reportType}</strong>
                <p style={{ margin: "6px 0", color: "#475569" }}>{alert.storeName} - {alert.productName || "No product"}</p>
              </div>
            ))}
          </div>
        </div>

        ) : null}

        {scoutSubTab === "tidepool" ? (
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
          </div>
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Tidepool Access</h2>
            <p style={styles.empty}>Free users get limited/basic report views. Paid users can unlock fuller real-time feed and alerts later. Trusted users can earn extra access through verified reports.</p>
            <p style={styles.tiny}>Examples: 5 verified reports = extra views, 15 = faster alerts, 30 = Trusted/Verified Scout path.</p>
          </div>
        </div>

        ) : null}

        {scoutSubTab === "overview" || scoutSubTab === "reports" ? (
        <div style={styles.reportGrid}>
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Daily Scout Report</h2>
            {dailyLocalReport.length === 0 ? (
              <p style={styles.empty}>Shared stores are ready for reports once the Virginia directory is seeded. Add Scout Tips to build today's local report.</p>
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
              <p style={styles.empty}>No restock history yet.</p>
            ) : (
              restockHistory.map((report) => {
                const store = reportStoreMap[getReportStoreId(report)];
                return (
                  <div key={report.id} style={styles.listCard}>
                    <strong>{report.itemName || report.item_name || "Restock report"}</strong>
                    <p style={{ margin: "6px 0", color: "#334155" }}>
                      {store?.name || "Unknown store"} · {getReportDate(report) || "No date"} {getReportTime(report) || ""}
                    </p>
                    <p style={{ margin: "6px 0", color: "#475569" }}>{report.note || "No notes"}</p>
                    <p style={styles.tiny}>{report.verified ? "Verified tip" : "Unverified tip"} · {dayName(getReportDate(report)) || "No weekday"}</p>
                  </div>
                );
              })
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

        {scoutSubTab === "stores" || scoutSubTab === "reports" ? (
        <div style={styles.mainGrid}>
          <div style={styles.col}>
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Shared Store Directory</h2>
              <p style={styles.empty}>
                Stores are shared Virginia-wide master data. Regular users add Scout Tips, restock reports, tracked items, and routes instead of duplicating store records.
              </p>
              <p style={styles.tiny}>
                Add or update master stores through the regional seed importer so every E&T TCG user sees the same directory.
              </p>
            </div>

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
                  onChange={(e) => setStoreSort(e.target.value)}
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
                  groupedFilteredStores.map(({ group, stores: groupStores }) => {
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
              </div>
            </div>
          </div>

          <div style={styles.card}>
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
          </div>

          <div style={styles.col}>
            {selectedStore ? (
              <>
                <div style={styles.card}>
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
                        {selectedStore.name}
                      </h2>
                      <p style={{ margin: 0, color: "#475569" }}>
                        {selectedStore.address || "No address"}
                      </p>
                      <p style={{ margin: "4px 0 0 0", color: "#475569" }}>
                        {selectedStore.city || "No city"} {selectedStore.phone ? `• ${selectedStore.phone}` : ""}
                      </p>
                      <p style={{ margin: "10px 0 0 0", color: "#334155" }}>
                        {selectedStore.nextRestockReason || "No prediction reason yet."}
                      </p>
                    </div>
                    <span style={styles.badge}>Shared directory store</span>
                  </div>
                </div>

                <div style={styles.card}>
                  <h2 style={styles.sectionTitle}>Screenshot Tip Import</h2>
                  <p style={styles.tiny}>
                    Upload a screenshot you are allowed to view, review the fields, then save it as a Scout Tip. This does not scrape Facebook or pull from groups automatically.
                  </p>
                  <form onSubmit={handleSaveScreenshotTip} style={styles.formGrid}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleTipScreenshotUpload}
                    />

                    {tipImport.screenshotPreview ? (
                      <div>
                        <img
                          src={tipImport.screenshotPreview}
                          alt="Uploaded tip screenshot preview"
                          style={styles.previewImage}
                        />
                        <p style={styles.tiny}>Preview: {tipImport.screenshotName}</p>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      style={styles.buttonSoft}
                      onClick={() => setError("AI extraction is a future backend feature. For beta, review the screenshot and fill the fields manually.")}
                    >
                      Extract with AI Later
                    </button>

                    <input
                      style={styles.input}
                      value={tipImport.productName}
                      onChange={(e) => updateTipImport("productName", e.target.value)}
                      placeholder="Product name"
                    />
                    <input
                      style={styles.input}
                      value={tipImport.productCategory}
                      onChange={(e) => updateTipImport("productCategory", e.target.value)}
                      placeholder="Product category"
                    />
                    <input
                      style={styles.input}
                      type="date"
                      value={tipImport.reportDate}
                      onChange={(e) => updateTipImport("reportDate", e.target.value)}
                    />
                    <input
                      style={styles.input}
                      type="time"
                      value={tipImport.reportTime}
                      onChange={(e) => updateTipImport("reportTime", e.target.value)}
                    />
                    <select
                      style={styles.input}
                      value={tipImport.stockStatus}
                      onChange={(e) => updateTipImport("stockStatus", e.target.value)}
                    >
                      <option value="in_stock">In stock</option>
                      <option value="low_stock">Low stock</option>
                      <option value="sold_out">Sold out</option>
                      <option value="partial_restock">Partial restock</option>
                      <option value="no_cards">No cards</option>
                      <option value="unknown">Unknown</option>
                    </select>
                    <input
                      style={styles.input}
                      value={tipImport.quantitySeen}
                      onChange={(e) => updateTipImport("quantitySeen", e.target.value)}
                      placeholder="Quantity seen"
                    />
                    <input
                      style={styles.input}
                      value={tipImport.quantityRemaining}
                      onChange={(e) => updateTipImport("quantityRemaining", e.target.value)}
                      placeholder="Quantity remaining"
                    />
                    <input
                      style={styles.input}
                      value={tipImport.limitInfo}
                      onChange={(e) => updateTipImport("limitInfo", e.target.value)}
                      placeholder="Limit policy"
                    />
                    <input
                      style={styles.input}
                      value={tipImport.sourceName}
                      onChange={(e) => updateTipImport("sourceName", e.target.value)}
                      placeholder="Source group/name if visible"
                    />
                    <input
                      style={styles.input}
                      type="number"
                      min="0"
                      max="100"
                      value={tipImport.extractionConfidence}
                      onChange={(e) => updateTipImport("extractionConfidence", e.target.value)}
                      placeholder="Extraction confidence 0-100"
                    />
                    <textarea
                      style={styles.textarea}
                      value={tipImport.notes}
                      onChange={(e) => updateTipImport("notes", e.target.value)}
                      placeholder="Notes from the screenshot"
                    />
                    <label style={{ ...styles.tiny, display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="checkbox"
                        checked={tipImport.verified}
                        onChange={(e) => updateTipImport("verified", e.target.checked)}
                      />
                      Mark reviewed/verified
                    </label>
                    <label style={{ ...styles.tiny, display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="checkbox"
                        checked={tipImport.keepScreenshot}
                        onChange={(e) => updateTipImport("keepScreenshot", e.target.checked)}
                      />
                      Keep screenshot locally with this report
                    </label>
                    <button type="submit" style={styles.buttonPrimary}>
                      Save Screenshot Tip Report
                    </button>
                    <button type="button" style={styles.buttonSoft} onClick={resetTipImport}>
                      Reject / Cancel
                    </button>
                  </form>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "20px" }}>
                  <div style={styles.card}>
                    <h2 style={styles.sectionTitle}>{editingReportId ? "Edit Report" : "Add Report"}</h2>
                    <form onSubmit={handleCreateReport} style={styles.formGrid}>
                      <input
                        style={styles.input}
                        value={reportForm.itemName}
                        onChange={(e) =>
                          setReportForm({ ...reportForm, itemName: e.target.value })
                        }
                        placeholder="Item name"
                      />
                      <textarea
                        style={styles.textarea}
                        value={reportForm.note}
                        onChange={(e) =>
                          setReportForm({ ...reportForm, note: e.target.value })
                        }
                        placeholder="What did you see?"
                      />
                      <input
                        style={styles.input}
                        type="date"
                        value={reportForm.reportDate}
                        onChange={(e) =>
                          setReportForm({ ...reportForm, reportDate: e.target.value })
                        }
                      />
                      <input
                        style={styles.input}
                        type="time"
                        value={reportForm.reportTime}
                        onChange={(e) =>
                          setReportForm({ ...reportForm, reportTime: e.target.value })
                        }
                      />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setReportPhoto(e.target.files?.[0] || null)}
                      />
                      <label style={{ ...styles.tiny, display: "flex", alignItems: "center", gap: "8px" }}>
                        <input
                          type="checkbox"
                          checked={reportForm.verified}
                          onChange={(e) =>
                            setReportForm({ ...reportForm, verified: e.target.checked })
                          }
                        />
                        Verified Scout Tip
                      </label>
                      <button
                        type="button"
                        onClick={handleGetLocation}
                        style={styles.buttonSoft}
                      >
                        Use My Location
                      </button>

                      {reportForm.lat && reportForm.lng ? (
                        <p style={styles.tiny}>
                          Location saved: {reportForm.lat}, {reportForm.lng}
                        </p>
                      ) : null}

                      {reportPhoto ? (
                        <p style={styles.tiny}>Photo selected: {reportPhoto.name}</p>
                      ) : null}

                      <button type="submit" style={styles.buttonPrimary}>
                        {editingReportId ? "Save Report" : "Add Report"}
                      </button>
                      {editingReportId ? (
                        <button type="button" style={styles.buttonSoft} onClick={resetReportForm}>
                          Cancel Edit
                        </button>
                      ) : null}
                    </form>

                    <h2 style={{ ...styles.sectionTitle, marginTop: "24px" }}>Reports</h2>
                    {reports.length === 0 ? (
                      <p style={styles.empty}>No reports yet.</p>
                    ) : (
                      reports.map((report) => (
                        <div key={report.id} className="scout-report-card" style={styles.listCard}>
                          <strong>{report.item_name || report.itemName}</strong>
                          <p style={{ margin: "8px 0", color: "#334155" }}>{report.note}</p>
                          <p style={styles.tiny}>
                            {report.report_date || report.reportDate}{" "}
                            {report.report_time || report.reportTime}
                          </p>
                          <p style={styles.tiny}>
                            {report.verified ? "Verified Scout Tip" : "Unverified Scout Tip"}
                            {(report.reportType || report.report_type) ? ` | ${report.reportType || report.report_type}` : ""}
                          </p>
                          {report.imageUrl || report.image_url ? (
                            <img
                              src={report.imageUrl || report.image_url}
                              alt="Screenshot tip"
                              style={{ ...styles.previewImage, maxHeight: "160px" }}
                            />
                          ) : null}
                          <OverflowMenu
                            onEdit={() => startEditingReport(report)}
                            onDelete={() => handleDeleteReport(report.id)}
                          />
                        </div>
                      ))
                    )}
                  </div>

                  <div style={styles.card}>
                    <h2 style={styles.sectionTitle}>{editingTrackedItemId ? "Edit Tracked Item" : "Add Tracked Item"}</h2>
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
                      <p style={styles.empty}>No tracked items yet.</p>
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
      </div>
    </div>
  );
}

