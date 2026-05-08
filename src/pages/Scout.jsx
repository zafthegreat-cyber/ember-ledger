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

const BETA_LOCAL_SCOUT = true;
const SCOUT_STORAGE_KEY = "et-tcg-beta-scout";

function makeScoutId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

export default function Scout() {
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [selectedChain, setSelectedChain] = useState("All");
  const [reports, setReports] = useState([]);
  const [allReports, setAllReports] = useState([]);
  const [items, setItems] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [routeForm, setRouteForm] = useState({
    routeName: "",
    selectedStoreIds: [],
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
    city: "",
    address: "",
    phone: "",
  });

  const [editStoreForm, setEditStoreForm] = useState({
    name: "",
    chain: "",
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
      const savedStores = saved.stores || [];
      const savedReports = saved.reports || [];
      setStores(savedStores);
      setAllReports(savedReports);
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

function toggleRouteStore(storeId) {
  setRouteForm((current) => {
    const selected = current.selectedStoreIds.includes(storeId)
      ? current.selectedStoreIds.filter((id) => id !== storeId)
      : [...current.selectedStoreIds, storeId];
    return { ...current, selectedStoreIds: selected };
  });
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
    selectedStoreIds: routeForm.selectedStoreIds,
    notes: routeForm.notes,
    routeDate: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
  };
  const nextRoutes = [newRoute, ...(saved.routes || [])];
  saveLocalScout({ routes: nextRoutes });
  setRoutes(nextRoutes);
  setRouteForm({ routeName: "", selectedStoreIds: [], notes: "" });
  setError("");
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
    const newStore = {
      id: makeScoutId("store"),
      name: storeForm.name,
      chain: storeForm.chain,
      city: storeForm.city,
      address: storeForm.address,
      phone: storeForm.phone,
      type: "Big Box",
      status: "Unknown",
      stockDays: [],
      truckDays: [],
      priority: false,
      createdAt: new Date().toISOString(),
    };
    const nextStores = [newStore, ...(saved.stores || [])];
    saveLocalScout({ stores: nextStores });
    setStores(nextStores);
    setSelectedStoreId(newStore.id);
    setStoreForm({ name: "", chain: "", city: "", address: "", phone: "" });
    return;
  }

  try {
    await createStore({
      name: storeForm.name,
      chain: storeForm.chain,
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
        ? {
            ...store,
            name: editStoreForm.name,
            chain: editStoreForm.chain,
            city: editStoreForm.city,
            address: editStoreForm.address,
            phone: editStoreForm.phone,
          }
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
    if (!selectedStoreId) return;

    if (BETA_LOCAL_SCOUT) {
      const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
      const reportPayload = {
        storeId: selectedStoreId,
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
        setReports(nextReports.filter((report) => getReportStoreId(report) === selectedStoreId));
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
        store.id === selectedStoreId
          ? { ...store, status: "Found", lastRestock: reportForm.reportDate || new Date().toISOString().slice(0, 10) }
          : store
      );
      saveLocalScout({ stores: nextStores, reports: nextReports });
      setStores(nextStores);
      setAllReports(nextReports);
      setReports(nextReports.filter((report) => getReportStoreId(report) === selectedStoreId));
      resetReportForm();
      setError("");
      return;
    }

    try {
      if (editingReportId) {
        await updateReport(selectedStoreId, editingReportId, reportForm);
      } else {
        await createReport(selectedStoreId, reportForm);
      }

      resetReportForm();

      await loadStoreDetails(selectedStoreId);
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

    if (!selectedStoreId) {
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
      storeId: selectedStoreId,
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
      store.id === selectedStoreId
        ? { ...store, status: tipImport.stockStatus === "sold_out" ? "Sold Out" : "Found", lastRestock: reportDate }
        : store
    );

    saveLocalScout({ stores: nextStores, reports: nextReports });
    setStores(nextStores);
    setAllReports(nextReports);
    setReports(nextReports.filter((report) => getReportStoreId(report) === selectedStoreId));
    resetTipImport();
    setError("");
  }

  async function handleCreateItem(e) {
    e.preventDefault();
    if (!selectedStoreId) return;

    if (BETA_LOCAL_SCOUT) {
      const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
      const itemPayload = {
        ...itemForm,
        storeId: selectedStoreId,
      };

      if (editingTrackedItemId) {
        const nextItems = (saved.items || []).map((item) =>
          item.id === editingTrackedItemId
            ? { ...item, ...itemPayload, updatedAt: new Date().toISOString() }
            : item
        );
        saveLocalScout({ items: nextItems });
        setItems(nextItems.filter((item) => item.storeId === selectedStoreId));
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
      setItems(nextItems.filter((item) => item.storeId === selectedStoreId));
      resetTrackedItemForm();
      setError("");
      return;
    }

    try {
      if (editingTrackedItemId) {
        await updateTrackedItem(selectedStoreId, editingTrackedItemId, itemForm);
      } else {
        await createTrackedItem(selectedStoreId, itemForm);
      }
      resetTrackedItemForm();
      await loadStoreDetails(selectedStoreId);
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

  const filteredStores = useMemo(() => {
    if (selectedChain === "All") return stores;
    return stores.filter((store) => store.chain === selectedChain);
  }, [stores, selectedChain]);

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

  const restockHistory = useMemo(() => {
    return [...allReports]
      .sort((a, b) => {
        const aDate = `${getReportDate(a)}T${getReportTime(a) || "00:00"}`;
        const bDate = `${getReportDate(b)}T${getReportTime(b) || "00:00"}`;
        return new Date(bDate) - new Date(aDate);
      })
      .slice(0, 20);
  }, [allReports]);

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

        <div style={styles.reportGrid}>
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Daily Scout Report</h2>
            {dailyLocalReport.length === 0 ? (
              <p style={styles.empty}>Add stores and restock reports to build today's local report.</p>
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

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Scout Route</h2>
          <form onSubmit={saveRoute} style={styles.formGrid}>
            <input
              style={styles.input}
              value={routeForm.routeName}
              onChange={(e) => setRouteForm({ ...routeForm, routeName: e.target.value })}
              placeholder="Route name"
            />
            <textarea
              style={styles.textarea}
              value={routeForm.notes}
              onChange={(e) => setRouteForm({ ...routeForm, notes: e.target.value })}
              placeholder="Route notes"
            />
            <div style={styles.reportGrid}>
              {stores.length === 0 ? (
                <p style={styles.empty}>Add stores before building a route.</p>
              ) : (
                stores.map((store) => (
                  <button
                    type="button"
                    key={store.id}
                    onClick={() => toggleRouteStore(store.id)}
                    style={{
                      ...(routeForm.selectedStoreIds.includes(store.id) ? styles.buttonPrimary : styles.buttonSoft),
                      textAlign: "left",
                    }}
                  >
                    {routeForm.selectedStoreIds.includes(store.id) ? "Selected: " : "Add: "}
                    {store.name}
                  </button>
                ))
              )}
            </div>
            <button type="submit" style={styles.buttonPrimary}>Save Route</button>
          </form>

          {routes.length > 0 ? (
            <div style={{ marginTop: "18px" }}>
              <h2 style={styles.sectionTitle}>Saved Routes</h2>
              {routes.map((route) => (
                <div key={route.id} style={styles.listCard}>
                  <strong>{route.routeName}</strong>
                  <p style={{ margin: "6px 0", color: "#475569" }}>
                    {route.selectedStoreIds
                      .map((storeId) => stores.find((store) => store.id === storeId)?.name)
                      .filter(Boolean)
                      .join(" -> ") || "No stores"}
                  </p>
                  {route.notes ? <p style={{ margin: "6px 0", color: "#475569" }}>{route.notes}</p> : null}
                  <div style={styles.row}>
                    <a style={styles.buttonSoft} href={routeMapUrl(route)} target="_blank" rel="noreferrer">
                      Open in Google Maps
                    </a>
                    <OverflowMenu onDelete={() => deleteRoute(route.id)} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div style={styles.mainGrid}>
          <div style={styles.col}>
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Add Store</h2>
              <form onSubmit={handleCreateStore} style={styles.formGrid}>
                <input
                  style={styles.input}
                  value={storeForm.name}
                  onChange={(e) =>
                    setStoreForm({ ...storeForm, name: e.target.value })
                  }
                  placeholder="Store name"
                />
                <input
                  style={styles.input}
                  value={storeForm.chain}
                  onChange={(e) =>
                    setStoreForm({ ...storeForm, chain: e.target.value })
                  }
                  placeholder="Chain"
                />
                <input
                  style={styles.input}
                  value={storeForm.city}
                  onChange={(e) =>
                    setStoreForm({ ...storeForm, city: e.target.value })
                  }
                  placeholder="City"
                />
                <input
                  style={styles.input}
                  value={storeForm.address}
                  onChange={(e) =>
                    setStoreForm({ ...storeForm, address: e.target.value })
                  }
                  placeholder="Address"
                />
                <input
                  style={styles.input}
                  value={storeForm.phone}
                  onChange={(e) =>
                    setStoreForm({ ...storeForm, phone: e.target.value })
                  }
                  placeholder="Phone"
                />
                <button type="submit" style={styles.buttonPrimary}>
                  Add Store
                </button>
              </form>
            </div>

            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Find Store Fast</h2>

              <div style={styles.formGrid}>
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
                  <p style={styles.empty}>No stores found for that chain.</p>
                ) : (
                  filteredStores.slice(0, 8).map((store) => (
                    <div
                      key={store.id}
                      onClick={() => setSelectedStoreId(store.id)}
                      style={styles.storeChoiceCard}
                    >
                      <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", fontWeight: 800 }}>
                        {store.name}
                      </h3>
                      <p style={{ margin: 0, color: "#475569" }}>
                        {store.address || "No address"}
                      </p>
                      <p style={{ margin: "4px 0 0 0", color: "#475569" }}>
                        {store.city || "No city"} {store.phone ? `• ${store.phone}` : ""}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
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
                    <StatusBadge value={selectedStore.status} />
                  </div>

                  <div style={styles.row}>
                    <OverflowMenu
                      editLabel={isEditingStore ? "Cancel Edit" : "Edit"}
                      onEdit={() => setIsEditingStore((prev) => !prev)}
                      onDelete={() => handleDeleteStore(selectedStore.id)}
                    />
                  </div>

                  {isEditingStore ? (
                    <div style={{ ...styles.card, marginTop: "16px" }}>
                      <h2 style={styles.sectionTitle}>Edit Store</h2>
                      <form onSubmit={handleUpdateStore} style={styles.formGrid}>
                        <input
                          style={styles.input}
                          value={editStoreForm.name}
                          onChange={(e) =>
                            setEditStoreForm({ ...editStoreForm, name: e.target.value })
                          }
                          placeholder="Store name"
                        />
                        <input
                          style={styles.input}
                          value={editStoreForm.chain}
                          onChange={(e) =>
                            setEditStoreForm({ ...editStoreForm, chain: e.target.value })
                          }
                          placeholder="Chain"
                        />
                        <input
                          style={styles.input}
                          value={editStoreForm.city}
                          onChange={(e) =>
                            setEditStoreForm({ ...editStoreForm, city: e.target.value })
                          }
                          placeholder="City"
                        />
                        <input
                          style={styles.input}
                          value={editStoreForm.address}
                          onChange={(e) =>
                            setEditStoreForm({ ...editStoreForm, address: e.target.value })
                          }
                          placeholder="Address"
                        />
                        <input
                          style={styles.input}
                          value={editStoreForm.phone}
                          onChange={(e) =>
                            setEditStoreForm({ ...editStoreForm, phone: e.target.value })
                          }
                          placeholder="Phone"
                        />
                        <button type="submit" style={styles.buttonPrimary}>
                          Save Store Changes
                        </button>
                      </form>
                    </div>
                  ) : null}
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
                        <div key={report.id} style={styles.listCard}>
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
                        <div key={item.id} style={styles.listCard}>
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
      </div>
    </div>
  );
}
