import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import "./App.css";
import { supabase } from "./supabaseClient";
import SmartAddInventory from "./components/SmartAddInventory";
import SmartAddCatalog from "./components/SmartAddCatalog";
import OverflowMenu from "./components/OverflowMenu";
import Scout from "./pages/Scout";

const IRS_MILEAGE_RATE = 0.725;
const BETA_LOCAL_MODE = true;
const LOCAL_STORAGE_KEY = "et-tcg-beta-data";
const SCOUT_STORAGE_KEY = "et-tcg-beta-scout";
const DEFAULT_PURCHASER_NAMES = ["Zena", "Dillon", "Business", "Personal", "Kids", "Other"];
const PEOPLE = DEFAULT_PURCHASER_NAMES;
const CATEGORIES = ["Pokemon", "Makeup", "Clothes", "Candy", "Collectibles", "Supplies", "Other"];
const STATUSES = ["In Stock", "Needs Photos", "Needs Market Check", "Ready to List", "Listed", "Sold", "Held", "Personal Collection", "Damaged"];
const PLATFORMS = ["eBay", "Mercari", "Whatnot", "Facebook Marketplace", "In-Store", "Instagram", "TikTok Shop", "Other"];
const VAULT_CATEGORIES = ["Personal collection", "Keep sealed", "Rip later", "Trade", "Favorite", "Wishlist", "Set goal", "Kid collection"];

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function shortDate(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createDefaultPurchasers() {
  const now = new Date().toISOString();
  return DEFAULT_PURCHASER_NAMES.map((name, index) => ({
    id: `purchaser-default-${index + 1}`,
    name,
    active: true,
    createdAt: now,
    updatedAt: now,
  }));
}

function normalizePurchasers(savedPurchasers = []) {
  const defaults = createDefaultPurchasers();
  const normalized = Array.isArray(savedPurchasers)
    ? savedPurchasers
        .map((purchaser) => ({
          id: purchaser.id || makeId("purchaser"),
          name: String(purchaser.name || "").trim(),
          active: purchaser.active !== false,
          createdAt: purchaser.createdAt || purchaser.created_at || new Date().toISOString(),
          updatedAt: purchaser.updatedAt || purchaser.updated_at || new Date().toISOString(),
        }))
        .filter((purchaser) => purchaser.name)
    : [];

  const byName = new Map();
  [...defaults, ...normalized].forEach((purchaser) => {
    const key = purchaser.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, purchaser);
  });

  return [...byName.values()];
}

function itemPurchaserName(item) {
  return item.purchaserName || item.purchaser_name || item.buyer || "Unassigned";
}

function statusClass(status) {
  return `status-badge ${String(status || "In Stock")
    .toLowerCase()
    .replaceAll(" ", "-")
    .replaceAll("/", "-")}`;
}

function Field({ label, children }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}

function BarcodeScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const [scannerError, setScannerError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function start() {
      try {
        const reader = new BrowserMultiFormatReader();
        controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result && mounted) {
            onScan(result.getText());
            controlsRef.current?.stop();
          }
        });
      } catch {
        setScannerError("Camera could not start. Check permissions or use the manual barcode field.");
      }
    }

    start();

    return () => {
      mounted = false;
      controlsRef.current?.stop();
    };
  }, [onScan]);

  return (
    <div className="panel">
      <h2>Scan Barcode</h2>
      <p>Point your camera at the barcode. Use good lighting and hold the barcode flat.</p>
      {scannerError && <p>{scannerError}</p>}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          width: "100%",
          maxWidth: "420px",
          borderRadius: "16px",
          border: "1px solid #ddd7d2",
          background: "#000",
        }}
      />
      <button type="button" className="secondary-button" onClick={onClose}>Close Scanner</button>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportFocus, setReportFocus] = useState("");

  const [treasureClicks, setTreasureClicks] = useState(0);
  const [showTreasure, setShowTreasure] = useState(false);

  const [user, setUser] = useState(BETA_LOCAL_MODE ? { id: "local-beta", email: "local beta mode" } : null);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [items, setItems] = useState([]);
  const [purchasers, setPurchasers] = useState(createDefaultPurchasers);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [sales, setSales] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [mileageTrips, setMileageTrips] = useState([]);

  const [showInventoryScanner, setShowInventoryScanner] = useState(false);
  const [showCatalogScanner, setShowCatalogScanner] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState("All");
  const [inventoryPurchaserFilter, setInventoryPurchaserFilter] = useState("All");
  const [inventorySort, setInventorySort] = useState("newest");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [bulkImportText, setBulkImportText] = useState("");
  const [bulkImportPreview, setBulkImportPreview] = useState([]);
  const [localDataLoaded, setLocalDataLoaded] = useState(false);
  const [scoutSnapshot, setScoutSnapshot] = useState({ stores: [], reports: [] });
  const [dealForm, setDealForm] = useState({
    title: "",
    askingPrice: "",
    marketTotal: "",
    retailTotal: "",
    notes: "",
  });
  const [vaultForm, setVaultForm] = useState({
    name: "",
    vaultCategory: "Personal collection",
    quantity: 1,
    unitCost: "",
    msrpPrice: "",
    marketPrice: "",
    packCount: "",
    setName: "",
    productType: "",
    notes: "",
  });

  const [editingItemId, setEditingItemId] = useState(null);
  const [editingCatalogId, setEditingCatalogId] = useState(null);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editingVehicleId, setEditingVehicleId] = useState(null);
  const [editingTripId, setEditingTripId] = useState(null);
  const [editingSaleId, setEditingSaleId] = useState(null);
  const [editingPurchaserId, setEditingPurchaserId] = useState(null);
  const [purchaserDraft, setPurchaserDraft] = useState("");

  const blankItem = {
  name: "",
  buyer: "Zena",
  purchaserId: "purchaser-default-1",
  purchaserName: "Zena",
  category: "Pokemon",
  store: "",
  quantity: 1,
  unitCost: "",
  salePrice: "",
  receiptImage: "",
  itemImage: "",
  barcode: "",
  catalogProductId: "",
  externalProductId: "",
  tideTradrUrl: "",
  marketPrice: "",
  lowPrice: "",
  midPrice: "",
  highPrice: "",
  msrpPrice: "",
  setCode: "",
  expansion: "",
  productLine: "",
  productType: "",
  packCount: "",
  status: "In Stock",
  listingPlatform: "",
  listingUrl: "",
  listedPrice: "",
  actionNotes: "",
};

  const blankCatalog = {
  name: "",
  category: "Pokemon",
  setName: "",
  productType: "",
  barcode: "",
  externalProductId: "",
  marketUrl: "",
  imageUrl: "",
  marketPrice: "",
  lowPrice: "",
  midPrice: "",
  highPrice: "",
  msrpPrice: "",
  setCode: "",
  expansion: "",
  productLine: "",
  packCount: "",
  notes: "",
};

  const [itemForm, setItemForm] = useState(blankItem);
  const [catalogForm, setCatalogForm] = useState(blankCatalog);
  const [expenseForm, setExpenseForm] = useState({ vendor: "", category: "Supplies", buyer: "Zena", amount: "", notes: "", receiptImage: "" });
  const [vehicleForm, setVehicleForm] = useState({ name: "", owner: "Zena", averageMpg: "", wearCostPerMile: "", notes: "" });
  const [tripForm, setTripForm] = useState({ purpose: "", driver: "Zena", vehicleId: "", startMiles: "", endMiles: "", gasPrice: "", notes: "", gasReceiptImage: "" });
  const [saleForm, setSaleForm] = useState({ itemId: "", platform: "eBay", quantitySold: 1, finalSalePrice: "", shippingCost: "", platformFees: "", notes: "" });

  const mainTabs = [
    { key: "home", label: "Home", target: "dashboard" },
    { key: "vault", label: "Vault", target: "vault" },
    { key: "scout", label: "Scout", target: "scout" },
    { key: "market", label: "Market", target: "market" },
    { key: "forge", label: "Forge", target: "inventory" },
  ];

  const navSections = [
    { title: "Home", items: [{ key: "dashboard", label: "Home" }] },
    { title: "Vault / The Vault", items: [{ key: "vault", label: "Vault" }] },
    { title: "Scout", items: [{ key: "scout", label: "Scout" }] },
    { title: "Market / TideTradr", items: [{ key: "market", label: "Market" }, { key: "catalog", label: "Market Catalog" }] },
    {
      title: "Forge / The Forge",
      items: [
        { key: "inventory", label: "Forge Inventory" },
        { key: "addInventory", label: "Add Forge Item" },
        { key: "sales", label: "Forge Sales" },
        { key: "addSale", label: "Add Sale" },
        { key: "expenses", label: "Forge Expenses" },
        { key: "reports", label: "Forge Reports" },
        { key: "mileage", label: "Mileage" },
        { key: "vehicles", label: "Vehicles" },
      ],
    },
  ];

  const activeTabLabel = navSections.flatMap((s) => s.items).find((i) => i.key === activeTab)?.label || "Dashboard";
  const activeMainTab =
    activeTab === "dashboard"
      ? "home"
      : activeTab === "vault" || activeTab === "scout" || activeTab === "market"
        ? activeTab
        : activeTab === "catalog"
          ? "market"
          : "forge";

  const updateItemForm = (field, value) => setItemForm((old) => ({ ...old, [field]: value }));
  const updateCatalogForm = (field, value) => setCatalogForm((old) => ({ ...old, [field]: value }));

  function useSmartCatalogProduct(product) {
  setCatalogForm((old) => ({
    ...old,
    name: product.name,
    category: "Pokemon",
    setName: product.expansion || "",
    productType: product.itemType || "",
    barcode: product.upcs?.[0] || "",
    marketPrice: product.marketPrice || "",
    lowPrice: "",
    midPrice: product.marketPrice || "",
    highPrice: "",
    msrpPrice: product.msrpPrice || "",
    setCode: product.setCode || "",
    expansion: product.expansion || "",
    productLine: product.productLine || "",
    packCount: product.packCount || "",
    notes: [
      product.conditionDefault ? `Condition: ${product.conditionDefault}` : "",
      product.languageDefault ? `Language: ${product.languageDefault}` : "",
      product.upcs?.length ? `UPC(s): ${product.upcs.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
  }));
}

  const updateExpenseForm = (field, value) => setExpenseForm((old) => ({ ...old, [field]: value }));
  const updateVehicleForm = (field, value) => setVehicleForm((old) => ({ ...old, [field]: value }));
  const updateTripForm = (field, value) => setTripForm((old) => ({ ...old, [field]: value }));
  const updateSaleForm = (field, value) => setSaleForm((old) => ({ ...old, [field]: value }));
  const updateDealForm = (field, value) => setDealForm((old) => ({ ...old, [field]: value }));
  const updateVaultForm = (field, value) => setVaultForm((old) => ({ ...old, [field]: value }));

  const activePurchasers = purchasers.filter((purchaser) => purchaser.active);
  const purchaserOptions = activePurchasers.length ? activePurchasers : createDefaultPurchasers();
  const peopleOptions = purchaserOptions.map((purchaser) => purchaser.name);

  function resolvePurchaser(form = itemForm) {
    const selected =
      purchasers.find((purchaser) => purchaser.id === form.purchaserId) ||
      purchasers.find((purchaser) => purchaser.name === form.purchaserName) ||
      purchasers.find((purchaser) => purchaser.name === form.buyer);

    return {
      purchaserId: selected?.id || form.purchaserId || "",
      purchaserName: selected?.name || form.purchaserName || form.buyer || "Unassigned",
    };
  }

  function addPurchaserName(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;

    const existing = purchasers.find((purchaser) => purchaser.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      if (!existing.active) {
        setPurchasers((current) =>
          current.map((purchaser) =>
            purchaser.id === existing.id
              ? { ...purchaser, active: true, updatedAt: new Date().toISOString() }
              : purchaser
          )
        );
      }
      return { ...existing, active: true };
    }

    const now = new Date().toISOString();
    const purchaser = {
      id: makeId("purchaser"),
      name: trimmed,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    setPurchasers((current) => [...current, purchaser]);
    return purchaser;
  }

  function savePurchaserName(id, name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;

    setPurchasers((current) =>
      current.map((purchaser) =>
        purchaser.id === id ? { ...purchaser, name: trimmed, updatedAt: new Date().toISOString() } : purchaser
      )
    );
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.purchaserId === id ? { ...item, purchaserName: trimmed, buyer: trimmed } : item
      )
    );
    setEditingPurchaserId(null);
    setPurchaserDraft("");
  }

  function archiveOrDeletePurchaser(id) {
    const purchaser = purchasers.find((candidate) => candidate.id === id);
    if (!purchaser) return;

    const inUse =
      items.some((item) => item.purchaserId === id || itemPurchaserName(item) === purchaser.name) ||
      expenses.some((expense) => expense.buyer === purchaser.name) ||
      mileageTrips.some((trip) => trip.driver === purchaser.name);

    if (inUse) {
      setPurchasers((current) =>
        current.map((candidate) =>
          candidate.id === id ? { ...candidate, active: false, updatedAt: new Date().toISOString() } : candidate
        )
      );
      return;
    }

    setPurchasers((current) => current.filter((candidate) => candidate.id !== id));
  }

  function restorePurchaser(id) {
    setPurchasers((current) =>
      current.map((purchaser) =>
        purchaser.id === id ? { ...purchaser, active: true, updatedAt: new Date().toISOString() } : purchaser
      )
    );
  }

  function loadScoutSnapshot() {
    const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
    setScoutSnapshot({
      stores: saved.stores || [],
      reports: saved.reports || [],
    });
  }

  useEffect(() => {
    if (BETA_LOCAL_MODE) {
      const saved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "{}");
      setItems(saved.items || []);
      setPurchasers(normalizePurchasers(saved.purchasers));
      setCatalogProducts(saved.catalogProducts || []);
      setExpenses(saved.expenses || []);
      setSales(saved.sales || []);
      setVehicles(saved.vehicles || []);
      setMileageTrips(saved.mileageTrips || []);
      setDealForm(saved.dealForm || {
        title: "",
        askingPrice: "",
        marketTotal: "",
        retailTotal: "",
        notes: "",
      });
      loadScoutSnapshot();
      setUser({ id: "local-beta", email: "local beta mode" });
      setLocalDataLoaded(true);
      return;
    }

    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (BETA_LOCAL_MODE) return;
    if (user) loadAllData();
    else {
      setItems([]);
      setCatalogProducts([]);
      setExpenses([]);
      setSales([]);
      setVehicles([]);
      setMileageTrips([]);
    }
  }, [user]);

  useEffect(() => {
    if (!BETA_LOCAL_MODE || !localDataLoaded) return;
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        items,
        purchasers,
        catalogProducts,
        expenses,
        sales,
        vehicles,
        mileageTrips,
        dealForm,
      })
    );
  }, [items, purchasers, catalogProducts, expenses, sales, vehicles, mileageTrips, dealForm, localDataLoaded]);

  useEffect(() => {
    if (!BETA_LOCAL_MODE || activeTab !== "dashboard") return;
    loadScoutSnapshot();
  }, [activeTab]);

  async function checkUser() {
    const { data, error } = await supabase.auth.getUser();
    if (!error) setUser(data.user);
  }

  async function handleAuth(event) {
    event.preventDefault();
    setAuthLoading(true);
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
        if (error) return alert(error.message);
        if (!data.session) {
          alert("Account created. Please check your email, confirm your account, then log in.");
          setAuthMode("login");
          return;
        }
        setUser(data.user);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) return alert(error.message);
        setUser(data.user);
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOut() {
    if (BETA_LOCAL_MODE) {
      setUser({ id: "local-beta", email: "local beta mode" });
      return;
    }

    await supabase.auth.signOut();
    setUser(null);
  }

  function resetBetaLocalData() {
    const confirmed = window.confirm(
      "Reset all local beta data for Ember & Tide TCG? This clears The Forge, Vault, Market, and Scout test data stored in this browser."
    );

    if (!confirmed) return;

    localStorage.removeItem(LOCAL_STORAGE_KEY);
    localStorage.removeItem(SCOUT_STORAGE_KEY);
    setScoutSnapshot({ stores: [], reports: [] });
    setItems([]);
    setPurchasers(createDefaultPurchasers());
    setCatalogProducts([]);
    setExpenses([]);
    setSales([]);
    setVehicles([]);
    setMileageTrips([]);
    setDealForm({
      title: "",
      askingPrice: "",
      marketTotal: "",
      retailTotal: "",
      notes: "",
    });
    setVaultForm({
      name: "",
      vaultCategory: "Personal collection",
      quantity: 1,
      unitCost: "",
      msrpPrice: "",
      marketPrice: "",
      packCount: "",
      setName: "",
      productType: "",
      notes: "",
    });
    setEditingItemId(null);
    setEditingCatalogId(null);
    setEditingExpenseId(null);
    setEditingVehicleId(null);
    setEditingTripId(null);
    setEditingSaleId(null);
    setEditingPurchaserId(null);
    setPurchaserDraft("");
    setItemForm(blankItem);
    setCatalogForm(blankCatalog);
    setActiveTab("dashboard");
  }

  function addVaultItem(event) {
    event.preventDefault();

    if (!vaultForm.name || !vaultForm.quantity) {
      alert("Please enter a Vault item name and quantity.");
      return;
    }

    const now = new Date().toISOString();
    const defaultPurchaser = purchaserOptions[0] || { id: "", name: "Zena" };
    const vaultCategory = vaultForm.vaultCategory || "Personal collection";
    const status = vaultCategory === "Rip later" ? "Held" : "Personal Collection";
    const newItem = {
      id: makeId("vault"),
      name: vaultForm.name,
      sku: `VAULT-${Date.now()}`,
      buyer: defaultPurchaser.name,
      purchaserId: defaultPurchaser.id,
      purchaserName: defaultPurchaser.name,
      category: "Pokemon",
      store: "",
      quantity: Number(vaultForm.quantity || 1),
      unitCost: Number(vaultForm.unitCost || 0),
      salePrice: 0,
      receiptImage: "",
      itemImage: "",
      barcode: "",
      catalogProductId: "",
      catalogProductName: "",
      externalProductId: "",
      tideTradrUrl: "",
      externalProductSource: "TideTradr",
      marketPrice: Number(vaultForm.marketPrice || 0),
      lowPrice: 0,
      midPrice: Number(vaultForm.marketPrice || 0),
      highPrice: 0,
      msrpPrice: Number(vaultForm.msrpPrice || 0),
      setCode: "",
      expansion: vaultForm.setName || "",
      productLine: "",
      productType: vaultForm.productType || "",
      packCount: Number(vaultForm.packCount || 0),
      notes: vaultForm.notes || "",
      status,
      listingPlatform: "",
      listingUrl: "",
      listedPrice: 0,
      actionNotes: vaultCategory,
      lastPriceChecked: vaultForm.marketPrice ? now : "",
      createdAt: now,
    };

    setItems([newItem, ...items]);
    setVaultForm({
      name: "",
      vaultCategory: "Personal collection",
      quantity: 1,
      unitCost: "",
      msrpPrice: "",
      marketPrice: "",
      packCount: "",
      setName: "",
      productType: "",
      notes: "",
    });
  }

  function beginScanProduct() {
    setEditingItemId(null);
    setItemForm((old) => ({ ...old, barcode: "" }));
    setShowInventoryScanner(true);
    setActiveTab("addInventory");
  }

  async function loadAllData() {
    await Promise.all([loadInventory(), loadCatalog(), loadExpenses(), loadSales(), loadVehicles(), loadTrips()]);
  }

  function mapItem(row) {
    return {
      id: row.id,
      name: row.name || "",
      sku: row.sku || "",
      buyer: row.purchaser_name || row.buyer || "Zena",
      purchaserId: row.purchaser_id || "",
      purchaserName: row.purchaser_name || row.buyer || "Zena",
      category: row.category || "Pokemon",
      store: row.store || "",
      quantity: Number(row.quantity || 0),
      unitCost: Number(row.unit_cost || 0),
      salePrice: Number(row.sale_price || 0),
      receiptImage: row.receipt_image || "",
      itemImage: row.item_image || "",
      barcode: row.barcode || "",
      catalogProductId: row.catalog_product_id || "",
      catalogProductName: row.catalog_product_name || "",
      externalProductId: row.external_product_id || "",
      tideTradrUrl: row.tcgplayer_url || "",
      externalProductSource: row.external_product_source || "TideTradr",
      marketPrice: Number(row.market_price || 0),
      lowPrice: Number(row.low_price || 0),
      midPrice: Number(row.mid_price || 0),
      highPrice: Number(row.high_price || 0),
      msrpPrice: Number(row.msrp_price || 0),
      setCode: row.set_code || "",
      expansion: row.expansion || "",
      productLine: row.product_line || "",
      productType: row.product_type || "",
      packCount: Number(row.pack_count || 0),
      notes: row.notes || "",
      status: row.status || "In Stock",
      listingPlatform: row.listing_platform || "",
      listingUrl: row.listing_url || "",
      listedPrice: Number(row.listed_price || 0),
      actionNotes: row.action_notes || "",
      lastPriceChecked: row.last_price_checked || "",
      createdAt: row.created_at,
    };
  }

function mapCatalog(row) {
  return {
    id: row.id,
    name: row.name || "",
    category: row.category || "Pokemon",
    setName: row.set_name || "",
    productType: row.product_type || "",
    barcode: row.barcode || "",
    marketSource: row.market_source || "TideTradr",
    externalProductId: row.external_product_id || "",
    marketUrl: row.market_url || "",
    imageUrl: row.image_url || "",
    marketPrice: Number(row.market_price || 0),
    lowPrice: Number(row.low_price || 0),
    midPrice: Number(row.mid_price || 0),
    highPrice: Number(row.high_price || 0),
    msrpPrice: Number(row.msrp_price || 0),
    setCode: row.set_code || "",
    expansion: row.expansion || "",
    productLine: row.product_line || "",
    packCount: Number(row.pack_count || 0),
    notes: row.notes || "",
    createdAt: row.created_at,
  };
}

  function mapExpense(row) {
    return { id: row.id, vendor: row.vendor || "", category: row.category || "Supplies", buyer: row.buyer || "Zena", amount: Number(row.amount || 0), notes: row.notes || "", receiptImage: row.receipt_image || "", createdAt: row.created_at };
  }

  function mapVehicle(row) {
    return { id: row.id, name: row.name || "", owner: row.owner || "Zena", averageMpg: Number(row.average_mpg || 0), wearCostPerMile: Number(row.wear_cost_per_mile || 0), notes: row.notes || "", createdAt: row.created_at };
  }

  function mapTrip(row) {
    return { id: row.id, vehicleId: row.vehicle_id, vehicleName: row.vehicle_name || "", purpose: row.purpose || "", driver: row.driver || "Zena", startMiles: Number(row.start_miles || 0), endMiles: Number(row.end_miles || 0), businessMiles: Number(row.business_miles || 0), gasPrice: Number(row.gas_price || 0), fuelCost: Number(row.fuel_cost || 0), wearCost: Number(row.wear_cost || 0), totalVehicleCost: Number(row.total_vehicle_cost || 0), mileageValue: Number(row.mileage_value || 0), gasReceiptImage: row.gas_receipt_image || "", notes: row.notes || "", createdAt: row.created_at };
  }

  function mapSale(row) {
    return { id: row.id, itemId: row.item_id, itemName: row.item_name || "", sku: row.sku || "", platform: row.platform || "", quantitySold: Number(row.quantity_sold || 0), finalSalePrice: Number(row.final_sale_price || 0), grossSale: Number(row.gross_sale || 0), itemCost: Number(row.item_cost || 0), shippingCost: Number(row.shipping_cost || 0), platformFees: Number(row.platform_fees || 0), netProfit: Number(row.net_profit || 0), notes: row.notes || "", createdAt: row.created_at };
  }

  async function loadInventory() {
    const { data, error } = await supabase.from("inventory_items").select("*").order("created_at", { ascending: false });
    if (error) return alert("Could not load inventory: " + error.message);
    setItems(data.map(mapItem));
  }

  async function loadCatalog() {
    const { data, error } = await supabase.from("product_catalog").select("*").order("created_at", { ascending: false });
    if (error) return alert("Could not load catalog: " + error.message);
    setCatalogProducts(data.map(mapCatalog));
  }

  async function loadExpenses() {
    const { data, error } = await supabase.from("business_expenses").select("*").order("created_at", { ascending: false });
    if (error) return alert("Could not load expenses: " + error.message);
    setExpenses(data.map(mapExpense));
  }

  async function loadSales() {
    const { data, error } = await supabase.from("sales_records").select("*").order("created_at", { ascending: false });
    if (error) return alert("Could not load sales: " + error.message);
    setSales(data.map(mapSale));
  }

  async function loadVehicles() {
    const { data, error } = await supabase.from("vehicles").select("*").order("created_at", { ascending: false });
    if (error) return alert("Could not load vehicles: " + error.message);
    setVehicles(data.map(mapVehicle));
  }

  async function loadTrips() {
    const { data, error } = await supabase.from("mileage_trips").select("*").order("created_at", { ascending: false });
    if (error) return alert("Could not load mileage trips: " + error.message);
    setMileageTrips(data.map(mapTrip));
  }

  async function handleImageUpload(event, setter, folder = "misc") {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Please upload an image file.");

    if (BETA_LOCAL_MODE) {
      const reader = new FileReader();
      reader.onload = () => setter(String(reader.result || ""));
      reader.readAsDataURL(file);
      return;
    }

    if (!user) return alert("Please log in before uploading images.");

    const ext = file.name.split(".").pop();
    const filePath = `${user.id}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage.from("receipts").upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

    if (error) return alert("Could not upload image: " + error.message);

    const { data } = supabase.storage.from("receipts").getPublicUrl(filePath);
    setter(data.publicUrl);
  }

  function getMatchingItem(form) {
    const cleanName = String(form.name || "").trim().toLowerCase();
    const cleanBarcode = String(form.barcode || "").trim();
    const cleanCatalogId = String(form.catalogProductId || "").trim();
    const cleanExpansion = String(form.expansion || "").trim().toLowerCase();
    const cleanProductType = String(form.productType || "").trim().toLowerCase();

    return items.find((item) => {
      const itemName = String(item.name || "").trim().toLowerCase();
      const itemBarcode = String(item.barcode || "").trim();
      const itemCatalogId = String(item.catalogProductId || "").trim();
      const itemExpansion = String(item.expansion || "").trim().toLowerCase();
      const itemProductType = String(item.productType || "").trim().toLowerCase();

      const sameCatalog =
        cleanCatalogId && itemCatalogId && cleanCatalogId === itemCatalogId;

      const sameBarcode =
        cleanBarcode && itemBarcode && cleanBarcode === itemBarcode;

      const sameExactName =
        cleanName && itemName && cleanName === itemName;

      const sameExpansionAndType =
        cleanName &&
        itemName &&
        cleanName === itemName &&
        cleanExpansion &&
        itemExpansion &&
        cleanExpansion === itemExpansion &&
        cleanProductType &&
        itemProductType &&
        cleanProductType === itemProductType;

      return sameCatalog || sameBarcode || sameExactName || sameExpansionAndType;
    });
  }

  async function addItem(event) {
    event.preventDefault();
    if (!itemForm.name || !itemForm.unitCost || !itemForm.quantity) return alert("Please fill out item name, quantity, and unit cost.");

    if (BETA_LOCAL_MODE) {
      const selectedCatalog = catalogProducts.find((product) => String(product.id) === String(itemForm.catalogProductId));
      const now = new Date().toISOString();
      const purchaser = resolvePurchaser(itemForm);
      const newItem = {
        id: makeId("item"),
        name: itemForm.name,
        sku: `ET-${Date.now()}`,
        buyer: purchaser.purchaserName,
        purchaserId: purchaser.purchaserId,
        purchaserName: purchaser.purchaserName,
        category: itemForm.category,
        store: itemForm.store,
        quantity: Number(itemForm.quantity),
        unitCost: Number(itemForm.unitCost),
        salePrice: Number(itemForm.salePrice || 0),
        receiptImage: itemForm.receiptImage,
        itemImage: itemForm.itemImage,
        barcode: itemForm.barcode,
        catalogProductId: selectedCatalog?.id || "",
        catalogProductName: selectedCatalog?.name || "",
        externalProductId: itemForm.externalProductId,
        tideTradrUrl: itemForm.tideTradrUrl,
        externalProductSource: "TideTradr",
        marketPrice: Number(itemForm.marketPrice || 0),
        lowPrice: Number(itemForm.lowPrice || 0),
        midPrice: Number(itemForm.midPrice || 0),
        highPrice: Number(itemForm.highPrice || 0),
        msrpPrice: Number(itemForm.msrpPrice || 0),
        setCode: itemForm.setCode || "",
        expansion: itemForm.expansion || "",
        productLine: itemForm.productLine || "",
        productType: itemForm.productType || "",
        packCount: Number(itemForm.packCount || 0),
        notes: itemForm.notes || "",
        status: itemForm.status,
        listingPlatform: itemForm.listingPlatform,
        listingUrl: itemForm.listingUrl,
        listedPrice: Number(itemForm.listedPrice || 0),
        actionNotes: itemForm.actionNotes,
        lastPriceChecked: itemForm.marketPrice ? now : "",
        createdAt: now,
      };

      setItems([newItem, ...items]);
      setItemForm(blankItem);
      setActiveTab(newItem.status === "Personal Collection" || newItem.status === "Held" ? "vault" : "inventory");
      return;
    }

    if (!user) return alert("Please log in first.");

    const existing = getMatchingItem(itemForm);
    if (existing && !editingItemId) {
      const purchaser = resolvePurchaser(itemForm);
      const addedQty = Number(itemForm.quantity);
      const addedCost = Number(itemForm.unitCost);
      const oldQty = Number(existing.quantity || 0);
      const oldCost = Number(existing.unitCost || 0);
      const newQty = oldQty + addedQty;
      const weightedCost = newQty > 0 ? (oldQty * oldCost + addedQty * addedCost) / newQty : addedCost;

      const row = {
        buyer: purchaser.purchaserName,
        purchaser_id: purchaser.purchaserId || null,
        purchaser_name: purchaser.purchaserName,
        quantity: newQty,
        unit_cost: weightedCost,
        sale_price: Number(itemForm.salePrice || existing.salePrice || 0),

        market_price: Number(itemForm.marketPrice || existing.marketPrice || 0),
        low_price: Number(itemForm.lowPrice || existing.lowPrice || 0),
        mid_price: Number(itemForm.midPrice || existing.midPrice || 0),
        high_price: Number(itemForm.highPrice || existing.highPrice || 0),

        msrp_price: Number(itemForm.msrpPrice || existing.msrpPrice || 0),
        set_code: itemForm.setCode || existing.setCode || "",
        expansion: itemForm.expansion || existing.expansion || "",
        product_line: itemForm.productLine || existing.productLine || "",
        product_type: itemForm.productType || existing.productType || "",
        pack_count: Number(itemForm.packCount || existing.packCount || 0),

        receipt_image: itemForm.receiptImage || existing.receiptImage || "",
        item_image: itemForm.itemImage || existing.itemImage || "",
        barcode: itemForm.barcode || existing.barcode || "",
        external_product_source: "TideTradr",
        external_product_id: itemForm.externalProductId || existing.externalProductId || "",
        tcgplayer_url: itemForm.tideTradrUrl || existing.tideTradrUrl || "",
        status: itemForm.status || existing.status || "In Stock",
        listing_platform: itemForm.listingPlatform || existing.listingPlatform || "",
        listing_url: itemForm.listingUrl || existing.listingUrl || "",
        listed_price: Number(itemForm.listedPrice || existing.listedPrice || 0),
        action_notes: itemForm.actionNotes || existing.actionNotes || "",
        last_price_checked: itemForm.marketPrice
          ? new Date().toISOString()
          : existing.lastPriceChecked || null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("inventory_items").update(row).eq("id", existing.id).select().single();
      if (error) return alert("Could not merge restock: " + error.message);
      setItems(items.map((item) => (item.id === existing.id ? mapItem(data) : item)));
      setItemForm(blankItem);
      setActiveTab("inventory");
      alert(`Restock merged into existing item: ${existing.name}`);
      return;
    }

    const selectedCatalog = catalogProducts.find((product) => String(product.id) === String(itemForm.catalogProductId));
    const purchaser = resolvePurchaser(itemForm);

    const row = {
      user_id: user.id,
      name: itemForm.name,
      buyer: purchaser.purchaserName,
      purchaser_id: purchaser.purchaserId || null,
      purchaser_name: purchaser.purchaserName,
      category: itemForm.category,
      store: itemForm.store,
      quantity: Number(itemForm.quantity),
      unit_cost: Number(itemForm.unitCost),
      sale_price: Number(itemForm.salePrice || 0),
      sku: "ET-" + Date.now(),
      receipt_image: itemForm.receiptImage,
      item_image: itemForm.itemImage,
      barcode: itemForm.barcode,
      catalog_product_id: selectedCatalog?.id || null,
      catalog_product_name: selectedCatalog?.name || "",
      external_product_source: "TideTradr",
      external_product_id: itemForm.externalProductId,
      tcgplayer_url: itemForm.tideTradrUrl,
      market_price: Number(itemForm.marketPrice || 0),
      low_price: Number(itemForm.lowPrice || 0),
      mid_price: Number(itemForm.midPrice || 0),
      high_price: Number(itemForm.highPrice || 0),
      msrp_price: Number(itemForm.msrpPrice || 0),
      set_code: itemForm.setCode || "",
      expansion: itemForm.expansion || "",
      product_line: itemForm.productLine || "",
      product_type: itemForm.productType || "",
      pack_count: Number(itemForm.packCount || 0),
      last_price_checked: itemForm.marketPrice ? new Date().toISOString() : null,
      status: itemForm.status,
      listing_platform: itemForm.listingPlatform,
      listing_url: itemForm.listingUrl,
      listed_price: Number(itemForm.listedPrice || 0),
      action_notes: itemForm.actionNotes,
    };

    const { data, error } = await supabase.from("inventory_items").insert(row).select().single();
    if (error) return alert("Could not add item: " + error.message);

    setItems([mapItem(data), ...items]);
    setItemForm(blankItem);
    setActiveTab("inventory");
  }

  async function saveEditedItem(event) {
    event.preventDefault();
    if (!itemForm.name || !itemForm.unitCost || !itemForm.quantity) return alert("Please fill out item name, quantity, and unit cost.");

    if (BETA_LOCAL_MODE) {
      const purchaser = resolvePurchaser(itemForm);
      const updatedItem = {
        ...items.find((item) => item.id === editingItemId),
        name: itemForm.name,
        buyer: purchaser.purchaserName,
        purchaserId: purchaser.purchaserId,
        purchaserName: purchaser.purchaserName,
        category: itemForm.category,
        store: itemForm.store,
        quantity: Number(itemForm.quantity),
        unitCost: Number(itemForm.unitCost),
        salePrice: Number(itemForm.salePrice || 0),
        receiptImage: itemForm.receiptImage,
        itemImage: itemForm.itemImage,
        barcode: itemForm.barcode,
        externalProductId: itemForm.externalProductId,
        tideTradrUrl: itemForm.tideTradrUrl,
        marketPrice: Number(itemForm.marketPrice || 0),
        lowPrice: Number(itemForm.lowPrice || 0),
        midPrice: Number(itemForm.midPrice || 0),
        highPrice: Number(itemForm.highPrice || 0),
        msrpPrice: Number(itemForm.msrpPrice || 0),
        setCode: itemForm.setCode || "",
        expansion: itemForm.expansion || "",
        productLine: itemForm.productLine || "",
        productType: itemForm.productType || "",
        packCount: Number(itemForm.packCount || 0),
        lastPriceChecked: itemForm.marketPrice ? new Date().toISOString() : "",
        status: itemForm.status,
        listingPlatform: itemForm.listingPlatform,
        listingUrl: itemForm.listingUrl,
        listedPrice: Number(itemForm.listedPrice || 0),
        actionNotes: itemForm.actionNotes,
      };

      setItems(items.map((item) => (item.id === editingItemId ? updatedItem : item)));
      setEditingItemId(null);
      setItemForm(blankItem);
      return;
    }

    const purchaser = resolvePurchaser(itemForm);
    const row = {
      name: itemForm.name,
      buyer: purchaser.purchaserName,
      purchaser_id: purchaser.purchaserId || null,
      purchaser_name: purchaser.purchaserName,
      category: itemForm.category,
      store: itemForm.store,
      quantity: Number(itemForm.quantity),
      unit_cost: Number(itemForm.unitCost),
      sale_price: Number(itemForm.salePrice || 0),
      receipt_image: itemForm.receiptImage,
      item_image: itemForm.itemImage,
      barcode: itemForm.barcode,
      external_product_source: "TideTradr",
      external_product_id: itemForm.externalProductId,
      tcgplayer_url: itemForm.tideTradrUrl,
      market_price: Number(itemForm.marketPrice || 0),
      low_price: Number(itemForm.lowPrice || 0),
      mid_price: Number(itemForm.midPrice || 0),
      high_price: Number(itemForm.highPrice || 0),
      msrp_price: Number(itemForm.msrpPrice || 0),
      set_code: itemForm.setCode || "",
      expansion: itemForm.expansion || "",
      product_line: itemForm.productLine || "",
      product_type: itemForm.productType || "",
      pack_count: Number(itemForm.packCount || 0),
      last_price_checked: itemForm.marketPrice ? new Date().toISOString() : null,
      status: itemForm.status,
      listing_platform: itemForm.listingPlatform,
      listing_url: itemForm.listingUrl,
      listed_price: Number(itemForm.listedPrice || 0),
      action_notes: itemForm.actionNotes,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("inventory_items").update(row).eq("id", editingItemId).select().single();
    if (error) return alert("Could not update item: " + error.message);

    setItems(items.map((item) => (item.id === editingItemId ? mapItem(data) : item)));
    setEditingItemId(null);
    setItemForm(blankItem);
  }

  function startEditingItem(item) {
    setEditingItemId(item.id);
    setItemForm({
      name: item.name,
      buyer: itemPurchaserName(item),
      purchaserId: item.purchaserId || "",
      purchaserName: itemPurchaserName(item),
      category: item.category,
      store: item.store,
      quantity: item.quantity,
      unitCost: item.unitCost,
      salePrice: item.salePrice,
      receiptImage: item.receiptImage,
      itemImage: item.itemImage,
      barcode: item.barcode,
      catalogProductId: item.catalogProductId,
      externalProductId: item.externalProductId,
      tideTradrUrl: item.tideTradrUrl,
      marketPrice: item.marketPrice,
      lowPrice: item.lowPrice,
      midPrice: item.midPrice,
      highPrice: item.highPrice,
      msrpPrice: item.msrpPrice,
      setCode: item.setCode,
      expansion: item.expansion,
      productLine: item.productLine,
      productType: item.productType,
      packCount: item.packCount,
      status: item.status,
      listingPlatform: item.listingPlatform,
      listingUrl: item.listingUrl,
      listedPrice: item.listedPrice,
      actionNotes: item.actionNotes,
    });
    setActiveTab("inventory");
  }

  function startEditingVaultItem(item) {
    startEditingItem(item);
    setActiveTab("vault");
  }

  function prepareRestock(item) {
    setEditingItemId(null);
    setItemForm({
      ...blankItem,
      name: item.name,
      buyer: itemPurchaserName(item),
      purchaserId: item.purchaserId || "",
      purchaserName: itemPurchaserName(item),
      category: item.category,
      store: item.store,
      unitCost: item.unitCost,
      salePrice: item.salePrice,
      itemImage: item.itemImage,
      barcode: item.barcode,
      catalogProductId: item.catalogProductId,
      externalProductId: item.externalProductId,
      tideTradrUrl: item.tideTradrUrl,
      marketPrice: item.marketPrice,
      lowPrice: item.lowPrice,
      midPrice: item.midPrice,
      highPrice: item.highPrice,
      msrpPrice: item.msrpPrice,
      setCode: item.setCode,
      expansion: item.expansion,
      productLine: item.productLine,
      productType: item.productType,
      packCount: item.packCount,
      status: item.status,
      listingPlatform: item.listingPlatform,
      listingUrl: item.listingUrl,
      listedPrice: item.listedPrice,
      actionNotes: item.actionNotes,
    });
    setActiveTab("addInventory");
  }

  async function deleteItem(id) {
    const itemToDelete = items.find((item) => item.id === id);
    const confirmed = window.confirm(
      `Delete ${itemToDelete?.name || "this Forge item"}? This removes it from local beta inventory.`
    );

    if (!confirmed) return;

    if (BETA_LOCAL_MODE) {
      setItems(items.filter((item) => item.id !== id));
      if (editingItemId === id) {
        setEditingItemId(null);
        setItemForm(blankItem);
      }
      return;
    }

    const { error } = await supabase.from("inventory_items").delete().eq("id", id);
    if (error) return alert("Could not delete item: " + error.message);
    setItems(items.filter((item) => item.id !== id));
    if (editingItemId === id) {
      setEditingItemId(null);
      setItemForm(blankItem);
    }
  }
  async function updateItemStatus(item, newStatus) {
    if (BETA_LOCAL_MODE) {
      setItems((currentItems) =>
        currentItems.map((currentItem) =>
          currentItem.id === item.id ? { ...currentItem, status: newStatus } : currentItem
        )
      );
      return;
    }

    const { data, error } = await supabase
      .from("inventory_items")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .select()
      .single();

    if (error) {
      alert("Could not update status: " + error.message);
      return;
    }

    setItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === item.id ? mapItem(data) : currentItem
      )
    );
  }
  async function addCatalogProduct(event) {
    event.preventDefault();
    if (!catalogForm.name) return alert("Please enter a product name.");

    if (BETA_LOCAL_MODE) {
      const product = {
        id: editingCatalogId || makeId("catalog"),
        name: catalogForm.name,
        category: catalogForm.category,
        setName: catalogForm.setName,
        productType: catalogForm.productType,
        barcode: catalogForm.barcode,
        marketSource: "TideTradr",
        externalProductId: catalogForm.externalProductId,
        marketUrl: catalogForm.marketUrl,
        imageUrl: catalogForm.imageUrl,
        marketPrice: Number(catalogForm.marketPrice || 0),
        lowPrice: Number(catalogForm.lowPrice || 0),
        midPrice: Number(catalogForm.midPrice || 0),
        highPrice: Number(catalogForm.highPrice || 0),
        msrpPrice: Number(catalogForm.msrpPrice || 0),
        setCode: catalogForm.setCode || "",
        expansion: catalogForm.expansion || "",
        productLine: catalogForm.productLine || "",
        packCount: Number(catalogForm.packCount || 0),
        notes: catalogForm.notes,
        createdAt: editingCatalogId
          ? catalogProducts.find((item) => item.id === editingCatalogId)?.createdAt || new Date().toISOString()
          : new Date().toISOString(),
      };

      setCatalogProducts(editingCatalogId ? catalogProducts.map((item) => (item.id === editingCatalogId ? product : item)) : [product, ...catalogProducts]);
      setEditingCatalogId(null);
      setCatalogForm(blankCatalog);
      return;
    }

    if (!user) return alert("Please log in first.");

    const row = {
  user_id: user.id,
  name: catalogForm.name,
  category: catalogForm.category,
  set_name: catalogForm.setName,
  product_type: catalogForm.productType,
  barcode: catalogForm.barcode,
  market_source: "TideTradr",
  external_product_id: catalogForm.externalProductId,
  market_url: catalogForm.marketUrl,
  image_url: catalogForm.imageUrl,

  market_price: Number(catalogForm.marketPrice || 0),
  low_price: Number(catalogForm.lowPrice || 0),
  mid_price: Number(catalogForm.midPrice || 0),
  high_price: Number(catalogForm.highPrice || 0),

  msrp_price: Number(catalogForm.msrpPrice || 0),
  set_code: catalogForm.setCode || "",
  expansion: catalogForm.expansion || "",
  product_line: catalogForm.productLine || "",
  pack_count: Number(catalogForm.packCount || 0),

  notes: catalogForm.notes,
  last_price_checked: catalogForm.marketPrice ? new Date().toISOString() : null,
};

    const { data, error } = editingCatalogId
      ? await supabase.from("product_catalog").update({ ...row, updated_at: new Date().toISOString() }).eq("id", editingCatalogId).select().single()
      : await supabase.from("product_catalog").insert(row).select().single();

    if (error) return alert("Could not save catalog product: " + error.message);

    const mapped = mapCatalog(data);
    setCatalogProducts(editingCatalogId ? catalogProducts.map((p) => (p.id === editingCatalogId ? mapped : p)) : [mapped, ...catalogProducts]);
    setEditingCatalogId(null);
    setCatalogForm(blankCatalog);
  }

  function startEditingCatalogProduct(product) {
  setEditingCatalogId(product.id);

  setCatalogForm({
    name: product.name,
    category: product.category,
    setName: product.setName,
    productType: product.productType,
    barcode: product.barcode,
    externalProductId: product.externalProductId,
    marketUrl: product.marketUrl,
    imageUrl: product.imageUrl,

    marketPrice: product.marketPrice,
    lowPrice: product.lowPrice,
    midPrice: product.midPrice,
    highPrice: product.highPrice,

    msrpPrice: product.msrpPrice,
    setCode: product.setCode,
    expansion: product.expansion,
    productLine: product.productLine,
    packCount: product.packCount,

    notes: product.notes,
  });
}

  async function deleteCatalogProduct(id) {
    if (BETA_LOCAL_MODE) {
      setCatalogProducts(catalogProducts.filter((product) => product.id !== id));
      return;
    }

    const { error } = await supabase.from("product_catalog").delete().eq("id", id);
    if (error) return alert("Could not delete catalog product: " + error.message);
    setCatalogProducts(catalogProducts.filter((product) => product.id !== id));
  }

function applyCatalogProduct(productId) {
  updateItemForm("catalogProductId", productId);

  const product = catalogProducts.find(
    (p) => String(p.id) === String(productId)
  );

  if (!product) return;

  setItemForm((old) => ({
    ...old,
    catalogProductId: productId,

    name: product.name || "",
    category: product.category || "Pokemon",
    barcode: product.barcode || "",
    externalProductId: product.externalProductId || "",
    tideTradrUrl: product.marketUrl || "",
    itemImage: product.imageUrl || "",

    marketPrice: product.marketPrice || "",
    lowPrice: product.lowPrice || "",
    midPrice: product.midPrice || "",
    highPrice: product.highPrice || "",
    msrpPrice: product.msrpPrice || "",

    setCode: product.setCode || "",
    expansion: product.expansion || product.setName || "",
    productLine: product.productLine || "",
    productType: product.productType || "",
    packCount: product.packCount || "",

    unitCost: product.msrpPrice || old.unitCost || "",
    salePrice: product.marketPrice || old.salePrice || "",
  }));
}

function goToReport(focus) {
  setReportFocus(focus);
  setActiveTab("reports");
}

function parseBulkCatalogText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const parts = line.split(",").map((part) => part.trim());

    return {
      tempId: index + 1,
      name: parts[0] || "",
      category: parts[1] || "Pokemon",
      setName: parts[2] || "",
      productType: parts[3] || "",
      barcode: parts[4] || "",
      marketPrice: Number(parts[5] || 0),
      lowPrice: Number(parts[6] || 0),
      midPrice: Number(parts[7] || 0),
      highPrice: Number(parts[8] || 0),
      msrpPrice: Number(parts[9] || 0),
      setCode: parts[10] || "",
      expansion: parts[11] || "",
      productLine: parts[12] || "",
      packCount: Number(parts[13] || 0),
      notes: parts[14] || "",
    };
  });
}

function previewBulkCatalogImport() {
  const parsed = parseBulkCatalogText(bulkImportText).filter(
    (item) => item.name
  );

  if (parsed.length === 0) {
    alert("No valid items found. Each line should start with a product name.");
    return;
  }

  setBulkImportPreview(parsed);
}

function handleBulkCatalogFileUpload(event) {
  const file = event.target.files?.[0];

  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    const text = String(reader.result || "");
    setBulkImportText(text);
    setBulkImportPreview(
      parseBulkCatalogText(text).filter((item) => item.name)
    );
  };

  reader.readAsText(file);
}

async function importBulkCatalogProducts() {
  if (bulkImportPreview.length === 0) {
    alert("Preview items before importing.");
    return;
  }

  if (BETA_LOCAL_MODE) {
    const imported = bulkImportPreview.map((item) => ({
      id: makeId("catalog"),
      name: item.name,
      category: item.category || "Pokemon",
      setName: item.setName || "",
      productType: item.productType || "",
      barcode: item.barcode || "",
      marketSource: "TideTradr",
      externalProductId: "",
      marketUrl: "",
      imageUrl: "",
      marketPrice: Number(item.marketPrice || 0),
      lowPrice: Number(item.lowPrice || 0),
      midPrice: Number(item.midPrice || 0),
      highPrice: Number(item.highPrice || 0),
      msrpPrice: Number(item.msrpPrice || 0),
      setCode: item.setCode || "",
      expansion: item.expansion || "",
      productLine: item.productLine || "",
      packCount: Number(item.packCount || 0),
      notes: item.notes || "",
      createdAt: new Date().toISOString(),
    }));

    setCatalogProducts([...imported, ...catalogProducts]);
    setBulkImportText("");
    setBulkImportPreview([]);
    alert(`Imported ${imported.length} catalog products.`);
    return;
  }

  if (!user) {
    alert("Please log in first.");
    return;
  }

  const rows = bulkImportPreview.map((item) => ({
    user_id: user.id,
    name: item.name,
    category: item.category || "Pokemon",
    set_name: item.setName || "",
    product_type: item.productType || "",
    barcode: item.barcode || "",
    market_source: "TideTradr",
    external_product_id: "",
    market_url: "",
    image_url: "",
    market_price: Number(item.marketPrice || 0),
    low_price: Number(item.lowPrice || 0),
    mid_price: Number(item.midPrice || 0),
    high_price: Number(item.highPrice || 0),
    msrp_price: Number(item.msrpPrice || 0),
    set_code: item.setCode || "",
    expansion: item.expansion || "",
    product_line: item.productLine || "",
    pack_count: Number(item.packCount || 0),
    notes: item.notes || "",
    last_price_checked: item.marketPrice ? new Date().toISOString() : null,
  }));

  const { data, error } = await supabase
    .from("product_catalog")
    .insert(rows)
    .select();

  if (error) {
    alert("Could not import catalog products: " + error.message);
    return;
  }

  setCatalogProducts([...data.map(mapCatalog), ...catalogProducts]);
  setBulkImportText("");
  setBulkImportPreview([]);

  alert(`Imported ${data.length} catalog products.`);
}

  async function addExpense(event) {
    event.preventDefault();
    if (!user) return alert("Please log in first.");
    if (!expenseForm.vendor || !expenseForm.amount) return alert("Please enter vendor and amount.");

    const row = {
      user_id: user.id,
      vendor: expenseForm.vendor,
      category: expenseForm.category,
      buyer: expenseForm.buyer,
      amount: Number(expenseForm.amount),
      notes: expenseForm.notes,
      receipt_image: expenseForm.receiptImage,
    };

    const { data, error } = editingExpenseId
      ? await supabase.from("business_expenses").update({ ...row, updated_at: new Date().toISOString() }).eq("id", editingExpenseId).select().single()
      : await supabase.from("business_expenses").insert(row).select().single();

    if (error) return alert("Could not save expense: " + error.message);

    const mapped = mapExpense(data);
    setExpenses(editingExpenseId ? expenses.map((e) => (e.id === editingExpenseId ? mapped : e)) : [mapped, ...expenses]);
    setEditingExpenseId(null);
    setExpenseForm({ vendor: "", category: "Supplies", buyer: "Zena", amount: "", notes: "", receiptImage: "" });
  }

  function startEditingExpense(expense) {
    setEditingExpenseId(expense.id);
    setExpenseForm(expense);
  }

  async function deleteExpense(id) {
    const { error } = await supabase.from("business_expenses").delete().eq("id", id);
    if (error) return alert("Could not delete expense: " + error.message);
    setExpenses(expenses.filter((expense) => expense.id !== id));
  }

  async function addVehicle(event) {
    event.preventDefault();
    if (!user) return alert("Please log in first.");
    if (!vehicleForm.name || !vehicleForm.averageMpg) return alert("Please enter vehicle name and average MPG.");

    const row = {
      user_id: user.id,
      name: vehicleForm.name,
      owner: vehicleForm.owner,
      average_mpg: Number(vehicleForm.averageMpg),
      wear_cost_per_mile: Number(vehicleForm.wearCostPerMile || 0),
      notes: vehicleForm.notes,
    };

    const { data, error } = editingVehicleId
      ? await supabase.from("vehicles").update({ ...row, updated_at: new Date().toISOString() }).eq("id", editingVehicleId).select().single()
      : await supabase.from("vehicles").insert(row).select().single();

    if (error) return alert("Could not save vehicle: " + error.message);

    const mapped = mapVehicle(data);
    setVehicles(editingVehicleId ? vehicles.map((v) => (v.id === editingVehicleId ? mapped : v)) : [mapped, ...vehicles]);
    setEditingVehicleId(null);
    setVehicleForm({ name: "", owner: "Zena", averageMpg: "", wearCostPerMile: "", notes: "" });
  }

  function startEditingVehicle(vehicle) {
    setEditingVehicleId(vehicle.id);
    setVehicleForm(vehicle);
  }

  async function deleteVehicle(id) {
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (error) return alert("Could not delete vehicle: " + error.message);
    setVehicles(vehicles.filter((vehicle) => vehicle.id !== id));
  }

  function calculateTripCosts(form) {
    const vehicle = vehicles.find((v) => String(v.id) === String(form.vehicleId));
    const businessMiles = Number(form.endMiles) - Number(form.startMiles);
    const mpg = Number(vehicle?.averageMpg || 0);
    const wearRate = Number(vehicle?.wearCostPerMile || 0);
    const gasPrice = Number(form.gasPrice || 0);
    const fuelCost = mpg > 0 ? (businessMiles / mpg) * gasPrice : 0;
    const wearCost = businessMiles * wearRate;

    return { vehicle, businessMiles, gasPrice, fuelCost, wearCost, totalVehicleCost: fuelCost + wearCost, mileageValue: businessMiles * IRS_MILEAGE_RATE };
  }

  async function addTrip(event) {
    event.preventDefault();
    if (!user) return alert("Please log in first.");
    if (!tripForm.purpose || !tripForm.startMiles || !tripForm.endMiles) return alert("Please enter purpose, start miles, and end miles.");
    if (!tripForm.gasPrice) return alert("Please enter gas price paid.");

    const costs = calculateTripCosts(tripForm);
    if (costs.businessMiles < 0) return alert("Ending mileage must be higher than starting mileage.");

    const row = {
      user_id: user.id,
      vehicle_id: costs.vehicle?.id || null,
      vehicle_name: costs.vehicle?.name || "",
      purpose: tripForm.purpose,
      driver: tripForm.driver,
      start_miles: Number(tripForm.startMiles),
      end_miles: Number(tripForm.endMiles),
      business_miles: costs.businessMiles,
      gas_price: costs.gasPrice,
      fuel_cost: costs.fuelCost,
      wear_cost_per_mile: Number(costs.vehicle?.wearCostPerMile || 0),
      wear_cost: costs.wearCost,
      total_vehicle_cost: costs.totalVehicleCost,
      mileage_value: costs.mileageValue,
      gas_receipt_image: tripForm.gasReceiptImage,
      notes: tripForm.notes,
    };

    const { data, error } = editingTripId
      ? await supabase.from("mileage_trips").update({ ...row, updated_at: new Date().toISOString() }).eq("id", editingTripId).select().single()
      : await supabase.from("mileage_trips").insert(row).select().single();

    if (error) return alert("Could not save mileage trip: " + error.message);

    const mapped = mapTrip(data);
    setMileageTrips(editingTripId ? mileageTrips.map((t) => (t.id === editingTripId ? mapped : t)) : [mapped, ...mileageTrips]);
    setEditingTripId(null);
    setTripForm({ purpose: "", driver: "Zena", vehicleId: "", startMiles: "", endMiles: "", gasPrice: "", notes: "", gasReceiptImage: "" });
  }

  function startEditingTrip(trip) {
    setEditingTripId(trip.id);
    setTripForm({ purpose: trip.purpose, driver: trip.driver, vehicleId: trip.vehicleId || "", startMiles: trip.startMiles, endMiles: trip.endMiles, gasPrice: trip.gasPrice, notes: trip.notes, gasReceiptImage: trip.gasReceiptImage });
  }

  async function deleteTrip(id) {
    const { error } = await supabase.from("mileage_trips").delete().eq("id", id);
    if (error) return alert("Could not delete trip: " + error.message);
    setMileageTrips(mileageTrips.filter((trip) => trip.id !== id));
  }

  async function addSale(event) {
    event.preventDefault();
    if (!user) return alert("Please log in first.");
    if (!saleForm.itemId || !saleForm.quantitySold || !saleForm.finalSalePrice) return alert("Please choose item, quantity, and price.");

    const item = items.find((i) => String(i.id) === String(saleForm.itemId));
    if (!item) return alert("Item not found.");

    const qty = Number(saleForm.quantitySold);
    if (qty > item.quantity) return alert("You cannot sell more than you have.");

    const price = Number(saleForm.finalSalePrice);
    const shipping = Number(saleForm.shippingCost || 0);
    const fees = Number(saleForm.platformFees || 0);
    const itemCost = item.unitCost * qty;
    const grossSale = price * qty;
    const netProfit = grossSale - itemCost - shipping - fees;
    const remaining = item.quantity - qty;

    const row = {
      user_id: user.id,
      item_id: item.id,
      item_name: item.name,
      sku: item.sku,
      original_buyer: item.buyer,
      category: item.category,
      store: item.store,
      platform: saleForm.platform,
      quantity_sold: qty,
      final_sale_price: price,
      gross_sale: grossSale,
      item_cost: itemCost,
      shipping_cost: shipping,
      platform_fees: fees,
      net_profit: netProfit,
      notes: saleForm.notes,
    };

    const { data: saleData, error: saleError } = editingSaleId
      ? await supabase.from("sales_records").update({ ...row, updated_at: new Date().toISOString() }).eq("id", editingSaleId).select().single()
      : await supabase.from("sales_records").insert(row).select().single();

    if (saleError) return alert("Could not save sale: " + saleError.message);

    if (!editingSaleId) {
      const { data: updatedItem, error: updateError } = await supabase
        .from("inventory_items")
        .update({ quantity: remaining, status: remaining === 0 ? "Sold" : item.status, updated_at: new Date().toISOString() })
        .eq("id", item.id)
        .select()
        .single();

      if (updateError) {
        alert("Sale saved, but inventory quantity did not update: " + updateError.message);
        await loadAllData();
        return;
      }

      setItems(items.map((i) => (i.id === item.id ? mapItem(updatedItem) : i)));
    }

    const mapped = mapSale(saleData);
    setSales(editingSaleId ? sales.map((s) => (s.id === editingSaleId ? mapped : s)) : [mapped, ...sales]);
    setEditingSaleId(null);
    setSaleForm({ itemId: "", platform: "eBay", quantitySold: 1, finalSalePrice: "", shippingCost: "", platformFees: "", notes: "" });
    setActiveTab("sales");
  }

  function startEditingSale(sale) {
    setEditingSaleId(sale.id);
    setSaleForm({ itemId: sale.itemId, platform: sale.platform, quantitySold: sale.quantitySold, finalSalePrice: sale.finalSalePrice, shippingCost: sale.shippingCost, platformFees: sale.platformFees, notes: sale.notes });
  }

  async function deleteSale(id) {
    const { error } = await supabase.from("sales_records").delete().eq("id", id);
    if (error) return alert("Could not delete sale: " + error.message);
    setSales(sales.filter((sale) => sale.id !== id));
  }

  function downloadCSV(filename, rows) {
    if (!rows.length) return alert("No data to export yet.");
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadBackup() {
    const backup = { createdAt: new Date().toISOString(), items, catalogProducts, expenses, sales, vehicles, mileageTrips };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ember-tide-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  }

    const totalSpent = items.reduce(
      (s, i) => s + Number(i.quantity || 0) * Number(i.unitCost || 0),
      0
    );

    const totalMsrpValue = items.reduce(
      (s, i) => s + Number(i.quantity || 0) * Number(i.msrpPrice || 0),
      0
    );

    const totalPotentialSales = items.reduce(
      (s, i) => s + Number(i.quantity || 0) * Number(i.salePrice || 0),
      0
    );

    const totalMarketValue = items.reduce(
      (s, i) => s + Number(i.quantity || 0) * Number(i.marketPrice || 0),
      0
    );

  const estimatedProfit = totalPotentialSales - totalSpent;
  const estimatedMarketProfit = totalMarketValue - totalSpent;
  const profitOverMsrp = totalMarketValue - totalMsrpValue;
  const savingsAgainstMsrp = totalMsrpValue - totalSpent;
  const marketRoiPercent =
    totalSpent > 0 ? (estimatedMarketProfit / totalSpent) * 100 : 0;

  const plannedRoiPercent =
    totalSpent > 0 ? (estimatedProfit / totalSpent) * 100 : 0;

  const msrpRoiPercent =
    totalMsrpValue > 0 ? (profitOverMsrp / totalMsrpValue) * 100 : 0;
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const estimatedProfitAfterExpenses = estimatedProfit - totalExpenses;
  const totalSalesRevenue = sales.reduce((s, sale) => s + sale.grossSale, 0);
  const totalSalesProfit = sales.reduce((s, sale) => s + sale.netProfit, 0);
  const totalItemsSold = sales.reduce((s, sale) => s + sale.quantitySold, 0);
  const totalBusinessMiles = mileageTrips.reduce((s, t) => s + t.businessMiles, 0);
  const totalFuelCost = mileageTrips.reduce((s, t) => s + t.fuelCost, 0);
  const totalWearCost = mileageTrips.reduce((s, t) => s + t.wearCost, 0);
  const totalVehicleCost = mileageTrips.reduce((s, t) => s + t.totalVehicleCost, 0);
  const totalMileageValue = mileageTrips.reduce((s, t) => s + t.mileageValue, 0);

  const inventorySpendingFor = (person, list = items) =>
    list
      .filter((item) => itemPurchaserName(item) === person)
      .reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0), 0);

  const spendingFor = (person) =>
    inventorySpendingFor(person) +
    expenses.filter((e) => e.buyer === person).reduce((s, e) => s + e.amount, 0) +
    mileageTrips.filter((t) => t.driver === person).reduce((s, t) => s + t.totalVehicleCost, 0);

  const purchaserSummaryNames = [
    ...new Set([
      ...purchasers.map((purchaser) => purchaser.name),
      ...items.map(itemPurchaserName),
      "Unassigned",
    ]),
  ].filter(Boolean);

  const salesByPlatform = sales.reduce((a, s) => ({ ...a, [s.platform]: (a[s.platform] || 0) + s.grossSale }), {});
  const expensesByCategory = expenses.reduce((a, e) => ({ ...a, [e.category]: (a[e.category] || 0) + e.amount }), {});
  const inventoryByCategory = items.reduce((a, i) => ({ ...a, [i.category || "Uncategorized"]: (a[i.category || "Uncategorized"] || 0) + i.quantity }), {});
  const inventoryByStatus = items.reduce((a, i) => ({ ...a, [i.status || "In Stock"]: (a[i.status || "In Stock"] || 0) + i.quantity }), {});

  const lowStockItems = items.filter((i) => i.quantity <= 1);
  const needsPhotosItems = items.filter((i) => i.status === "Needs Photos" || !i.itemImage);
  const needsMarketCheckItems = items.filter((i) => i.status === "Needs Market Check" || Number(i.marketPrice) <= 0);
  const missingMsrpItems = items.filter((i) => Number(i.msrpPrice || 0) <= 0);

  const missingMarketPriceItems = items.filter(
    (i) => Number(i.marketPrice || 0) <= 0
  );

  const missingProductTypeItems = items.filter(
    (i) => !i.productType || String(i.productType).trim() === ""
  );

  const missingBarcodeItems = items.filter(
    (i) => !i.barcode || String(i.barcode).trim() === ""
  );

  const missingSalePriceItems = items.filter(
    (i) => Number(i.salePrice || 0) <= 0
  );
  const readyToListItems = items.filter((i) => i.status === "Ready to List");
  const listedItems = items.filter((i) => i.status === "Listed");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const isThisMonth = (value) => {
    if (!value) return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date >= monthStart;
  };
  const monthlyItemSpending = items
    .filter((item) => isThisMonth(item.createdAt))
    .reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0), 0);
  const monthlyItems = items.filter((item) => isThisMonth(item.createdAt));
  const monthlyPurchaserSpending = purchaserSummaryNames
    .map((name) => ({
      name,
      amount: inventorySpendingFor(name, monthlyItems),
      total: inventorySpendingFor(name),
      active: purchasers.find((purchaser) => purchaser.name === name)?.active !== false,
    }))
    .filter((row) => row.amount > 0 || row.total > 0 || row.active)
    .sort((a, b) => b.amount - a.amount || b.total - a.total || a.name.localeCompare(b.name));
  const monthlyExpenses = expenses
    .filter((expense) => isThisMonth(expense.createdAt))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const monthlySalesProfit = sales
    .filter((sale) => isThisMonth(sale.createdAt))
    .reduce((sum, sale) => sum + Number(sale.netProfit || 0), 0);
  const monthlySpending = monthlyItemSpending + monthlyExpenses;
  const monthlyProfitLoss = monthlySalesProfit - monthlyExpenses;
  const vaultItems = items.filter((i) =>
    ["Personal Collection", "Held"].includes(i.status) ||
    String(i.actionNotes || "").toLowerCase().includes("keep") ||
    String(i.actionNotes || "").toLowerCase().includes("rip") ||
    String(i.actionNotes || "").toLowerCase().includes("trade") ||
    String(i.actionNotes || "").toLowerCase().includes("wishlist")
  );
  const vaultValue = vaultItems.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.marketPrice || 0),
    0
  );
  const packItForwardItems = items.filter((item) =>
    item.status === "Donated" ||
    String(item.actionNotes || "").toLowerCase().includes("kid") ||
    String(item.actionNotes || "").toLowerCase().includes("donat") ||
    String(item.notes || "").toLowerCase().includes("kid") ||
    String(item.notes || "").toLowerCase().includes("donat")
  );
  const packItForwardCost = packItForwardItems.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0),
    0
  );
  const recentPurchases = [...items]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 5);
  const recentSales = [...sales]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 5);
  const recentMarketUpdates = [...catalogProducts]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 5);
  const watchlistPreview = [...missingMarketPriceItems, ...needsMarketCheckItems]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 5);
  const scoutReportsByStore = scoutSnapshot.reports.reduce((acc, report) => {
    const storeId = report.storeId || report.store_id || "";
    if (!storeId) return acc;
    acc[storeId] = [...(acc[storeId] || []), report];
    return acc;
  }, {});
  const homeScoutPreview = scoutSnapshot.stores
    .map((store) => {
      const storeReports = scoutReportsByStore[store.id] || [];
      const latestReport = [...storeReports].sort((a, b) => {
        const aDate = `${a.reportDate || a.report_date || ""}T${a.reportTime || a.report_time || "00:00"}`;
        const bDate = `${b.reportDate || b.report_date || ""}T${b.reportTime || b.report_time || "00:00"}`;
        return new Date(bDate) - new Date(aDate);
      })[0];
      const score = Math.min(95, 25 + storeReports.length * 15 + (store.status === "Found" ? 25 : 0));
      return { store, latestReport, score, reportCount: storeReports.length };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const dealAskingPrice = Number(dealForm.askingPrice || 0);
  const dealMarketTotal = Number(dealForm.marketTotal || 0);
  const dealRetailTotal = Number(dealForm.retailTotal || 0);
  const dealPercentOfMarket = dealMarketTotal > 0 ? (dealAskingPrice / dealMarketTotal) * 100 : 0;
  const dealPercentOfRetail = dealRetailTotal > 0 ? (dealAskingPrice / dealRetailTotal) * 100 : 0;
  const dealRating =
    !dealAskingPrice || !dealMarketTotal
      ? "Enter a deal"
      : dealPercentOfMarket < 65
        ? "Great deal"
        : dealPercentOfMarket <= 80
          ? "Good deal"
          : dealPercentOfMarket <= 95
            ? "Fair deal"
            : dealPercentOfMarket <= 110
              ? "Personal collection / neutral"
              : "Too high / avoid";

  const quickInventoryFilters = [
    {
      label: "All",
      status: "All",
      search: "",
    },
    {
      label: "Pokemon",
      status: "All",
      search: "Pokemon",
    },
    {
      label: "Needs Photos",
      status: "Needs Photos",
      search: "",
    },
    {
      label: "Needs Market",
      status: "Needs Market Check",
      search: "",
    },
    {
      label: "Ready to List",
      status: "Ready to List",
      search: "",
    },
    {
      label: "Listed",
      status: "Listed",
      search: "",
    },
    {
      label: "Personal",
      status: "Personal Collection",
      search: "",
    },
    {
      label: "Sold",
      status: "Sold",
      search: "",
    },
  ];

  const filteredItems = items.filter((item) => {
    const search = inventorySearch.toLowerCase();
    const matchesSearch =
      item.name.toLowerCase().includes(search) ||
      item.sku.toLowerCase().includes(search) ||
      itemPurchaserName(item).toLowerCase().includes(search) ||
      item.category.toLowerCase().includes(search) ||
      String(item.store || "").toLowerCase().includes(search) ||
      String(item.barcode || "").toLowerCase().includes(search) ||
      String(item.status || "").toLowerCase().includes(search);

    const matchesStatus = inventoryStatusFilter === "All" || item.status === inventoryStatusFilter;
    const matchesPurchaser =
      inventoryPurchaserFilter === "All" ||
      (inventoryPurchaserFilter === "Unassigned" && itemPurchaserName(item) === "Unassigned") ||
      item.purchaserId === inventoryPurchaserFilter ||
      itemPurchaserName(item) === inventoryPurchaserFilter;
    return matchesSearch && matchesStatus && matchesPurchaser;
  });
const sortedFilteredItems = [...filteredItems].sort((a, b) => {
  const aQty = Number(a.quantity || 0);
  const bQty = Number(b.quantity || 0);

  const aCost = Number(a.unitCost || 0);
  const bCost = Number(b.unitCost || 0);

  const aMarket = Number(a.marketPrice || 0);
  const bMarket = Number(b.marketPrice || 0);

  const aProfit = aQty * aMarket - aQty * aCost;
  const bProfit = bQty * bMarket - bQty * bCost;

  const aRoi = aCost > 0 ? ((aMarket - aCost) / aCost) * 100 : 0;
  const bRoi = bCost > 0 ? ((bMarket - bCost) / bCost) * 100 : 0;

  if (inventorySort === "highestProfit") {
    return bProfit - aProfit;
  }

  if (inventorySort === "highestMarket") {
    return bQty * bMarket - aQty * aMarket;
  }

  if (inventorySort === "highestRoi") {
    return bRoi - aRoi;
  }

  if (inventorySort === "lowestStock") {
    return aQty - bQty;
  }

  if (inventorySort === "az") {
    return String(a.name || "").localeCompare(String(b.name || ""));
  }

  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
});

  const filteredCatalogProducts = catalogProducts.filter((product) => {
    const search = catalogSearch.toLowerCase();
    return (
      product.name.toLowerCase().includes(search) ||
      product.category.toLowerCase().includes(search) ||
      String(product.setName || "").toLowerCase().includes(search) ||
      String(product.barcode || "").toLowerCase().includes(search)
    );
  });

  if (!user) {
    return (
      <div className="app">
        <header className="header">
          <h1
  onClick={() => {
    const nextClicks = treasureClicks + 1;
    setTreasureClicks(nextClicks);

    if (nextClicks >= 7) {
      setShowTreasure(true);
    }
  }}
  title="There might be something hidden here..."
>
  E&T TCG
</h1>
          <p>Log in to sync Ember & Tide TCG across your collection, market checks, restocks, and The Forge.</p>
        </header>
        <main className="main">
          <section className="panel">
            <h2>{authMode === "login" ? "Log In" : "Create Account"}</h2>
            <form onSubmit={handleAuth} className="form">
              <Field label="Email"><input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} /></Field>
              <Field label="Password"><input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} /></Field>
              <button type="submit" disabled={authLoading}>{authLoading ? "Working..." : authMode === "login" ? "Log In" : "Create Account"}</button>
            </form>
            <button className="secondary-button" onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}>
              {authMode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
    <header className="header">
  <h1
    onClick={() => {
      const nextClicks = treasureClicks + 1;
      setTreasureClicks(nextClicks);

      if (nextClicks >= 7) {
        setShowTreasure(true);
      }
    }}
    title="There might be something hidden here..."
  >
    E&T TCG
  </h1>

  <p>E&T TCG cloud sync active for: {user.email}</p>

  {showTreasure && (
    <div className="hidden-treasure">
      <p>Hidden Treasure Found ✨</p>
      <h2>I love you Dillon — with you by my side I can do anything.</h2>
    </div>
  )}
</header>

    <div className="topbar">
  <button
    type="button"
    className="menu-button"
    onClick={() => setMenuOpen(true)}
  >
    ☰ Menu
  </button>

  <div className="topbar-title">
    <p>E&T TCG</p>
    <h2>{activeTabLabel}</h2>
  </div>

  <div className="topbar-actions">
    <button
      type="button"
      className="secondary-button"
      onClick={() => setActiveTab("addInventory")}
    >
      + Inventory
    </button>

    <button
      type="button"
      className="secondary-button"
      onClick={() => setActiveTab("addSale")}
    >
      + Sale
    </button>

    <button
      type="button"
      className="secondary-button"
      onClick={signOut}
    >
      Sign Out
    </button>
  </div>
</div>

      <nav className="main-tabs" aria-label="E&T TCG main tabs">
        {mainTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeMainTab === tab.key ? "main-tab active" : "main-tab"}
            onClick={() => setActiveTab(tab.target)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {menuOpen ? (
        <>
          <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} />

          <aside className="drawer open">
            <div className="drawer-header">
              <div><p>E&T TCG</p><h3>Navigation</h3></div>
              <button type="button" className="secondary-button" onClick={() => setMenuOpen(false)}>Close</button>
            </div>
            {navSections.map((section) => (
              <div className="drawer-section" key={section.title}>
                <p className="drawer-section-title">{section.title}</p>
                <div className="drawer-links">
                  {section.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={activeTab === item.key ? "drawer-link active" : "drawer-link"}
                      onClick={() => {
                        setActiveTab(item.key);
                        setMenuOpen(false);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </aside>
        </>
      ) : null}

      <main className="main">
        {activeTab === "dashboard" && (
          <>
            <section className="cards">
              <div className="card">
                <p>Collection Value</p>
                <h2>{money(vaultValue)}</h2>
              </div>

              <div className="card">
                <p>Monthly Spending</p>
                <h2>{money(monthlySpending)}</h2>
              </div>

              <div className="card">
                <p>Forge Inventory Value</p>
                <h2>{money(totalMsrpValue)}</h2>
              </div>

              <div className="card">
                <p>Market Value</p>
                <h2>{money(totalMarketValue)}</h2>
              </div>

              <div className="card">
                <p>Monthly Profit/Loss</p>
                <h2>{money(monthlyProfitLoss)}</h2>
              </div>
              <div className="card">
                <p>Market ROI</p>
                <h2>{marketRoiPercent.toFixed(1)}%</h2>
              </div>

              <div className="card">
                <p>Planned ROI</p>
                <h2>{plannedRoiPercent.toFixed(1)}%</h2>
              </div>

              <div className="card">
                <p>Market vs MSRP %</p>
                <h2>{msrpRoiPercent.toFixed(1)}%</h2>
              </div>

              <div className="card">
                <p>Market Over MSRP</p>
                <h2>{money(profitOverMsrp)}</h2>
              </div>

              <div className="card">
                <p>Savings vs MSRP</p>
                <h2>{money(savingsAgainstMsrp)}</h2>
              </div>

              <div className="card">
                <p>Forge Planned Sales</p>
                <h2>{money(totalPotentialSales)}</h2>
              </div>
              <div className="card"><p>Planned Profit</p><h2>{money(estimatedProfit)}</h2></div>
              <div className="card"><p>Forge Sales Revenue</p><h2>{money(totalSalesRevenue)}</h2></div>
              <div className="card"><p>Forge Profit</p><h2>{money(totalSalesProfit)}</h2></div>
              <div className="card"><p>Expenses</p><h2>{money(totalExpenses)}</h2></div>
              <div className="card"><p>Profit After Expenses</p><h2>{money(estimatedProfitAfterExpenses)}</h2></div>
              <div className="card"><p>Items Sold</p><h2>{totalItemsSold}</h2></div>
              <div className="card"><p>Business Miles</p><h2>{totalBusinessMiles.toFixed(1)}</h2></div>
              <div className="card"><p>Total Vehicle Cost</p><h2>{money(totalVehicleCost)}</h2></div>
            </section>
            <section className="panel">
              <h2>Quick Actions</h2>
              <div className="quick-actions">
                <button type="button" onClick={() => setActiveTab("addInventory")}>Quick Add Item</button>
                <button type="button" onClick={beginScanProduct}>Scan Product</button>
                <button type="button" onClick={() => setActiveTab("market")}>Check Deal</button>
                <button type="button" onClick={() => setActiveTab("scout")}>Submit Restock Tip</button>
                <button type="button" onClick={() => setActiveTab("scout")}>Upload Tip Screenshot</button>
              </div>
            </section>
            <section className="panel">
              <h2>Beta Settings</h2>
              <p>
                Ember & Tide TCG is running in local beta mode. Your beta data is stored in this browser with localStorage.
              </p>
              <div className="quick-actions">
                <button type="button" className="secondary-button" onClick={resetBetaLocalData}>
                  Reset Local Beta Data
                </button>
                <button type="button" className="secondary-button" onClick={() => setActiveTab("inventory")}>
                  Review Forge
                </button>
                <button type="button" className="secondary-button" onClick={() => setActiveTab("scout")}>
                  Review Scout
                </button>
                <button type="button" className="secondary-button" onClick={() => setActiveTab("market")}>
                  Review Market
                </button>
              </div>
            </section>
            <section className="panel">
              <h2>Settings / About</h2>
              <p>
                Ember & Tide TCG helps collectors stay organized, helps parents avoid overpaying, and helps keep Pokemon fun, fair, and accessible for kids.
              </p>
              <div className="cards">
                <div className="card">
                  <p>App Name</p>
                  <h2>E&T TCG</h2>
                </div>
                <div className="card">
                  <p>Full Brand</p>
                  <h2>Ember & Tide TCG</h2>
                </div>
                <div className="card">
                  <p>Beta Storage</p>
                  <h2>Local</h2>
                </div>
              </div>

              <div className="settings-subsection">
                <h3>Purchaser Tracking</h3>
                <p>Track who made each purchase without creating accounts or changing seller platforms.</p>
                <form
                  className="inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const added = addPurchaserName(purchaserDraft);
                    if (added) setPurchaserDraft("");
                  }}
                >
                  <input
                    value={purchaserDraft}
                    onChange={(event) => setPurchaserDraft(event.target.value)}
                    placeholder="Add purchaser name"
                  />
                  <button type="submit">Add Purchaser</button>
                </form>

                <div className="inventory-list compact-inventory-list">
                  {purchasers.map((purchaser) => (
                    <div className="inventory-card compact-card" key={purchaser.id}>
                      {editingPurchaserId === purchaser.id ? (
                        <form
                          className="inline-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            savePurchaserName(purchaser.id, purchaserDraft);
                          }}
                        >
                          <input
                            value={purchaserDraft}
                            onChange={(event) => setPurchaserDraft(event.target.value)}
                            placeholder="Purchaser name"
                          />
                          <button type="submit">Save</button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              setEditingPurchaserId(null);
                              setPurchaserDraft("");
                            }}
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="compact-card-header">
                            <div>
                              <h3>{purchaser.name}</h3>
                              <p className="compact-subtitle">
                                {purchaser.active ? "Active" : "Archived"} · {money(inventorySpendingFor(purchaser.name))} inventory spend
                              </p>
                            </div>
                            {purchaser.active ? (
                              <OverflowMenu
                                onEdit={() => {
                                  setEditingPurchaserId(purchaser.id);
                                  setPurchaserDraft(purchaser.name);
                                }}
                                onDelete={() => archiveOrDeletePurchaser(purchaser.id)}
                                deleteLabel="Archive"
                              />
                            ) : (
                              <button type="button" className="secondary-button" onClick={() => restorePurchaser(purchaser.id)}>
                                Restore
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
            <section className="home-grid">
              <div className="panel">
                <h2>Recent Purchases</h2>
                <div className="home-list">
                  {recentPurchases.length === 0 ? (
                    <p>No purchases yet.</p>
                  ) : (
                    recentPurchases.map((item) => (
                      <button type="button" className="home-list-row" key={item.id} onClick={() => startEditingItem(item)}>
                        <span>
                          <strong>{item.name}</strong>
                          <small>{shortDate(item.createdAt)} · Qty {item.quantity} · {item.store || "No store"}</small>
                        </span>
                        <b>{money(Number(item.quantity || 0) * Number(item.unitCost || 0))}</b>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="panel">
                <h2>Recent Sales</h2>
                <div className="home-list">
                  {recentSales.length === 0 ? (
                    <p>No sales yet.</p>
                  ) : (
                    recentSales.map((sale) => (
                      <button type="button" className="home-list-row" key={sale.id} onClick={() => { startEditingSale(sale); setActiveTab("addSale"); }}>
                        <span>
                          <strong>{sale.itemName}</strong>
                          <small>{shortDate(sale.createdAt)} · {sale.platform || "No platform"} · Qty {sale.quantitySold}</small>
                        </span>
                        <b>{money(sale.netProfit)}</b>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="panel">
                <h2>Market Updates</h2>
                <div className="home-list">
                  {recentMarketUpdates.length === 0 ? (
                    <p>No market products yet.</p>
                  ) : (
                    recentMarketUpdates.map((product) => (
                      <button type="button" className="home-list-row" key={product.id} onClick={() => setActiveTab("market")}>
                        <span>
                          <strong>{product.name}</strong>
                          <small>{shortDate(product.createdAt)} · {product.productType || "Product"} · {product.setName || "No set"}</small>
                        </span>
                        <b>{money(product.marketPrice)}</b>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="panel">
                <h2>Daily Scout Report</h2>
                {homeScoutPreview.length === 0 ? (
                  <div className="home-callout">
                    <p>Scout is ready for Hampton Roads / 757 store checks, Scout Tips, and local availability notes.</p>
                    <button type="button" onClick={() => setActiveTab("scout")}>Open Scout</button>
                  </div>
                ) : (
                  <div className="home-list">
                    {homeScoutPreview.map(({ store, latestReport, score, reportCount }) => (
                      <button type="button" className="home-list-row" key={store.id} onClick={() => setActiveTab("scout")}>
                        <span>
                          <strong>{store.name}</strong>
                          <small>
                            {score}% confidence · {reportCount} report{reportCount === 1 ? "" : "s"}
                            {latestReport ? ` · latest: ${latestReport.itemName || latestReport.item_name || "restock"}` : ""}
                          </small>
                        </span>
                        <b>{store.status || "Unknown"}</b>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="panel">
                <h2>Upcoming Restocks</h2>
                <div className="home-callout">
                  <p>Prediction cards will come from Scout store history: usual truck days, stock days, last restock, and verified reports.</p>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("scout")}>Review Stores</button>
                </div>
              </div>

              <div className="panel">
                <h2>Watchlist Preview</h2>
                <div className="home-list">
                  {watchlistPreview.length === 0 ? (
                    <p>No urgent market watchlist items.</p>
                  ) : (
                    watchlistPreview.map((item) => (
                      <button type="button" className="home-list-row" key={item.id} onClick={() => startEditingItem(item)}>
                        <span>
                          <strong>{item.name}</strong>
                          <small>{item.status || "Needs review"} · {item.productType || "No type"}</small>
                        </span>
                        <b>{money(item.marketPrice)}</b>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="panel">
                <h2>Pack It Forward</h2>
                <div className="cards mini-cards">
                  <div className="card">
                    <p>Tracked Items</p>
                    <h2>{packItForwardItems.length}</h2>
                  </div>
                  <div className="card">
                    <p>Community Cost</p>
                    <h2>{money(packItForwardCost)}</h2>
                  </div>
                </div>
                <p>For now, mark notes with kid, donation, or donate to include items here.</p>
              </div>

              <div className="panel">
                <h2>Alerts Preview</h2>
                <div className="home-alerts">
                  <span>{needsPhotosItems.length} need photos</span>
                  <span>{needsMarketCheckItems.length} need market checks</span>
                  <span>{readyToListItems.length} ready to list</span>
                </div>
              </div>
            </section>
            <section className="panel">
              <h2>Action Center</h2>

                <div className="cards">
                  <button
                    type="button"
                    className="card action-card"
                    onClick={() => goToReport("needsPhotos")}
                  >
                    <p>Needs Photos</p>
                    <h2>{needsPhotosItems.length}</h2>
                  </button>

                  <button
                    type="button"
                    className="card action-card"
                    onClick={() => goToReport("needsMarket")}
                  >
                    <p>Needs Market</p>
                    <h2>{needsMarketCheckItems.length}</h2>
                  </button>

                  <button
                    type="button"
                    className="card action-card"
                    onClick={() => goToReport("missingMsrp")}
                  >
                    <p>Missing MSRP</p>
                    <h2>{missingMsrpItems.length}</h2>
                  </button>

                  <button
                    type="button"
                    className="card action-card"
                    onClick={() => goToReport("missingMarket")}
                  >
                    <p>Missing Market</p>
                    <h2>{missingMarketPriceItems.length}</h2>
                  </button>

                  <button
                    type="button"
                    className="card action-card"
                    onClick={() => goToReport("missingBarcode")}
                  >
                    <p>Missing UPC</p>
                    <h2>{missingBarcodeItems.length}</h2>
                  </button>

                  <button
                    type="button"
                    className="card action-card"
                    onClick={() => goToReport("missingType")}
                  >
                    <p>Missing Type</p>
                    <h2>{missingProductTypeItems.length}</h2>
                  </button>

                  <button
                    type="button"
                    className="card action-card"
                    onClick={() => goToReport("missingSalePrice")}
                  >
                    <p>Missing Sale Price</p>
                    <h2>{missingSalePriceItems.length}</h2>
                  </button>

                  <button
                    type="button"
                    className="card action-card"
                    onClick={() => goToReport("readyToList")}
                  >
                    <p>Ready to List</p>
                    <h2>{readyToListItems.length}</h2>
                  </button>

                  <button
                    type="button"
                    className="card action-card"
                    onClick={() => goToReport("lowStock")}
                  >
                    <p>Low Stock</p>
                    <h2>{lowStockItems.length}</h2>
                  </button>
                </div>
              </section>
            <section className="panel">
              <h2>Purchaser Spending</h2>
              <div className="buyer-grid">
                {monthlyPurchaserSpending.map((row) => (
                  <div className="buyer-card" key={row.name}>
                    <p>{row.name}</p>
                    <h3>{money(row.amount)}</h3>
                    <small>All-time inventory: {money(row.total)}</small>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel">
              <h2>Exports</h2>
              <div className="export-grid">
                <button onClick={() => downloadCSV("ember-tide-inventory.csv", items)}>Export Forge Inventory</button>
                <button onClick={() => downloadCSV("ember-tide-catalog.csv", catalogProducts)}>Export Catalog</button>
                <button onClick={() => downloadCSV("ember-tide-sales.csv", sales)}>Export Forge Sales</button>
                <button onClick={() => downloadCSV("ember-tide-expenses.csv", expenses)}>Export Expenses</button>
                <button onClick={() => downloadCSV("ember-tide-mileage.csv", mileageTrips)}>Export Mileage</button>
                <button onClick={() => downloadCSV("ember-tide-vehicles.csv", vehicles)}>Export Vehicles</button>
                <button onClick={downloadBackup}>Full Backup</button>
              </div>
            </section>
          </>
        )}

        {activeTab === "vault" && (
          <>
            <section className="panel">
              <h2>The Vault</h2>
              <p>
                Collector mode for personal collection, keep sealed, rip later, trade, favorites, and wishlist items.
              </p>
              <div className="cards">
                <div className="card">
                  <p>Vault Items</p>
                  <h2>{vaultItems.length}</h2>
                </div>
                <div className="card">
                  <p>Vault Value</p>
                  <h2>{money(vaultValue)}</h2>
                </div>
                <div className="card">
                  <p>Personal Collection</p>
                  <h2>{items.filter((item) => item.status === "Personal Collection").length}</h2>
                </div>
                <div className="card">
                  <p>Held / Rip Later</p>
                  <h2>{items.filter((item) => item.status === "Held").length}</h2>
                </div>
              </div>
            </section>

            <section className="panel">
              <h2>Add Vault Item</h2>
              <form onSubmit={addVaultItem} className="form">
                <Field label="Item Name">
                  <input value={vaultForm.name} onChange={(e) => updateVaultForm("name", e.target.value)} />
                </Field>
                <Field label="Vault Category">
                  <select value={vaultForm.vaultCategory} onChange={(e) => updateVaultForm("vaultCategory", e.target.value)}>
                    {VAULT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Quantity / Item Count">
                  <input type="number" min="1" value={vaultForm.quantity} onChange={(e) => updateVaultForm("quantity", e.target.value)} />
                </Field>
                <Field label="Pack Count">
                  <input type="number" min="0" value={vaultForm.packCount} onChange={(e) => updateVaultForm("packCount", e.target.value)} />
                </Field>
                <Field label="Cost Paid">
                  <input type="number" step="0.01" value={vaultForm.unitCost} onChange={(e) => updateVaultForm("unitCost", e.target.value)} />
                </Field>
                <Field label="MSRP">
                  <input type="number" step="0.01" value={vaultForm.msrpPrice} onChange={(e) => updateVaultForm("msrpPrice", e.target.value)} />
                </Field>
                <Field label="Market Value">
                  <input type="number" step="0.01" value={vaultForm.marketPrice} onChange={(e) => updateVaultForm("marketPrice", e.target.value)} />
                </Field>
                <Field label="Set / Collection">
                  <input value={vaultForm.setName} onChange={(e) => updateVaultForm("setName", e.target.value)} />
                </Field>
                <Field label="Product Type">
                  <input value={vaultForm.productType} onChange={(e) => updateVaultForm("productType", e.target.value)} />
                </Field>
                <Field label="Personal Notes">
                  <input value={vaultForm.notes} onChange={(e) => updateVaultForm("notes", e.target.value)} />
                </Field>
                <button type="submit">Add to Vault</button>
              </form>
            </section>

            <section className="panel">
              <h2>Vault Items</h2>
              <p>Vault items can be edited or deleted here. Quantity is product count; pack count is packs inside each product.</p>
              {editingItemId && vaultItems.some((item) => item.id === editingItemId) && (
                <section className="panel">
                  <h2>Edit Vault Item</h2>
                  <InventoryForm
                    form={itemForm}
                    setForm={updateItemForm}
                    catalogProducts={catalogProducts}
                    purchasers={purchaserOptions}
                    onCreatePurchaser={addPurchaserName}
                    applyCatalogProduct={applyCatalogProduct}
                    handleImageUpload={handleImageUpload}
                    onSubmit={saveEditedItem}
                    submitLabel="Save Vault Item"
                  />
                  <button type="button" className="secondary-button" onClick={() => { setEditingItemId(null); setItemForm(blankItem); }}>
                    Cancel Edit
                  </button>
                </section>
              )}
              <div className="inventory-list compact-inventory-list">
                {vaultItems.length === 0 ? (
                  <p>No Vault items yet.</p>
                ) : (
                  vaultItems.map((item) => (
                    <CompactInventoryCard
                      key={item.id}
                      item={item}
                      onRestock={prepareRestock}
                      onEdit={startEditingVaultItem}
                      onDelete={deleteItem}
                      onStatusChange={updateItemStatus}
                    />
                  ))
                )}
              </div>
            </section>
          </>
        )}

        {activeTab === "scout" && (
          <section className="embedded-page">
            <Scout />
          </section>
        )}

        {activeTab === "market" && (
          <>
            <section className="panel">
              <h2>Check Deal</h2>
              <form className="form">
                <Field label="Deal Title">
                  <input value={dealForm.title} onChange={(e) => updateDealForm("title", e.target.value)} placeholder="Example: 2 ETBs and 1 booster bundle" />
                </Field>
                <Field label="Asking Price">
                  <input type="number" step="0.01" value={dealForm.askingPrice} onChange={(e) => updateDealForm("askingPrice", e.target.value)} />
                </Field>
                <Field label="Market Total">
                  <input type="number" step="0.01" value={dealForm.marketTotal} onChange={(e) => updateDealForm("marketTotal", e.target.value)} />
                </Field>
                <Field label="Retail / MSRP Total">
                  <input type="number" step="0.01" value={dealForm.retailTotal} onChange={(e) => updateDealForm("retailTotal", e.target.value)} />
                </Field>
                <Field label="Notes">
                  <input value={dealForm.notes} onChange={(e) => updateDealForm("notes", e.target.value)} placeholder="Condition, store, seller, trade notes..." />
                </Field>
              </form>
              <div className="cards mini-cards">
                <div className="card">
                  <p>Deal Rating</p>
                  <h2>{dealRating}</h2>
                </div>
                <div className="card">
                  <p>Percent of Market</p>
                  <h2>{dealPercentOfMarket.toFixed(1)}%</h2>
                </div>
                <div className="card">
                  <p>Percent of Retail</p>
                  <h2>{dealPercentOfRetail.toFixed(1)}%</h2>
                </div>
              </div>
            </section>

            <section className="panel">
              <h2>TideTradr Market</h2>
              <p>
                Build your own market database using MSRP, recent sold prices, low/mid/high estimates,
                source links, and manual checks. This replaces outside API dependence.
              </p>

              <div className="cards">
                <div className="card">
                  <p>Catalog Products</p>
                  <h2>{catalogProducts.length}</h2>
                </div>

                <div className="card">
                  <p>Forge Market Value</p>
                  <h2>{money(totalMarketValue)}</h2>
                </div>

                <div className="card">
                  <p>Missing Market Prices</p>
                  <h2>{missingMarketPriceItems.length}</h2>
                </div>

                <div className="card">
                  <p>Needs Market Check</p>
                  <h2>{needsMarketCheckItems.length}</h2>
                </div>
              </div>
            </section>

            <section className="panel">
              <h2>Market To-Do List</h2>

              <ActionReport
                title="Needs Market Check"
                items={needsMarketCheckItems}
                button="Update Market"
                action={startEditingItem}
              />

              <ActionReport
                title="Missing Market Price"
                items={missingMarketPriceItems}
                button="Add Market Price"
                action={startEditingItem}
              />

              <ActionReport
                title="Missing MSRP"
                items={missingMsrpItems}
                button="Add MSRP"
                action={startEditingItem}
              />
            </section>
          </>
        )}

        {activeTab === "catalog" && (
          <>
          <SmartAddCatalog onUseProduct={useSmartCatalogProduct} />
          <section className="panel">
  <h2>Bulk Import Catalog Items</h2>
  <p>
    Paste a list or upload a CSV/text file. Format each line like:
  </p>

  <pre className="import-example">
Product Name, Category, Set, Product Type, Barcode, Market Price, Low, Mid, High, MSRP, Set Code, Expansion, Product Line, Pack Count, Notes
Perfect Order ETB, Pokemon, Perfect Order, Elite Trainer Box, 123456789, 70.27, 60, 70.27, 85, 59.99, POR, Perfect Order, Mega Evolution, 9, Target restock itemPerfect Order Booster Bundle, Pokemon, Perfect Order, Booster Bundle, 987654321, 24.99, 20, 24.99, 32, Good flip
  </pre>

  <div className="form">
    <Field label="Upload CSV / Text File">
      <input
        type="file"
        accept=".csv,.txt"
        onChange={handleBulkCatalogFileUpload}
      />
    </Field>

    <button type="button" onClick={previewBulkCatalogImport}>
      Preview Import
    </button>
  </div>

  <textarea
    className="search-input"
    style={{ minHeight: "220px" }}
    value={bulkImportText}
    onChange={(event) => setBulkImportText(event.target.value)}
    placeholder="Paste one item per line..."
  />

  {bulkImportPreview.length > 0 && (
    <div>
      <h3>Preview: {bulkImportPreview.length} items</h3>

      <div className="inventory-list">
        {bulkImportPreview.map((item) => (
          <div className="inventory-card compact-card" key={item.tempId}>
            <h3>{item.name}</h3>
            <p>Category: {item.category}</p>
            <p>Set: {item.setName || "Not listed"}</p>
            <p>Type: {item.productType || "Not listed"}</p>
            <p>Barcode: {item.barcode || "Not listed"}</p>
            <p>TideTradr Value: ${Number(item.marketPrice || 0).toFixed(2)}</p>
          </div>
        ))}
      </div>

      <button type="button" onClick={importBulkCatalogProducts}>
        Import {bulkImportPreview.length} Products to Catalog
      </button>
    </div>
  )}
</section>
            <section className="panel">
              <h2>{editingCatalogId ? "Edit Catalog Product" : "Add Product Catalog Item"}</h2>
              <button type="button" className="secondary-button" onClick={() => setShowCatalogScanner(true)}>Open Catalog Scanner</button>
              {showCatalogScanner && <BarcodeScanner onScan={(code) => { updateCatalogForm("barcode", code); setShowCatalogScanner(false); }} onClose={() => setShowCatalogScanner(false)} />}
              <form onSubmit={addCatalogProduct} className="form">
                <Field label="Product Name"><input value={catalogForm.name} onChange={(e) => updateCatalogForm("name", e.target.value)} /></Field>
                <Field label="Category"><select value={catalogForm.category} onChange={(e) => updateCatalogForm("category", e.target.value)}>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Set / Collection"><input value={catalogForm.setName} onChange={(e) => updateCatalogForm("setName", e.target.value)} /></Field>
                <Field label="Product Type"><input value={catalogForm.productType} onChange={(e) => updateCatalogForm("productType", e.target.value)} /></Field>
                <Field label="Barcode / UPC"><input value={catalogForm.barcode} onChange={(e) => updateCatalogForm("barcode", e.target.value)} /></Field>
                <Field label="Product Image"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => updateCatalogForm("imageUrl", url), "catalog-products")} /></Field>
                {catalogForm.imageUrl && <div className="receipt-preview"><p>Catalog Photo</p><img src={catalogForm.imageUrl} alt="Catalog" /></div>}
                <Field label="TideTradr Product ID"><input value={catalogForm.externalProductId} onChange={(e) => updateCatalogForm("externalProductId", e.target.value)} /></Field>
                <Field label="Market Source URL"><input value={catalogForm.marketUrl} onChange={(e) => updateCatalogForm("marketUrl", e.target.value)} /></Field>
                <Field label="MSRP Price">
  <input
    type="number"
    step="0.01"
    value={catalogForm.msrpPrice}
    onChange={(e) => updateCatalogForm("msrpPrice", e.target.value)}
  />
</Field>

<Field label="Set Code">
  <input
    value={catalogForm.setCode}
    onChange={(e) => updateCatalogForm("setCode", e.target.value)}
  />
</Field>

<Field label="Expansion">
  <input
    value={catalogForm.expansion}
    onChange={(e) => updateCatalogForm("expansion", e.target.value)}
  />
</Field>

<Field label="Product Line">
  <input
    value={catalogForm.productLine}
    onChange={(e) => updateCatalogForm("productLine", e.target.value)}
  />
</Field>

<Field label="Pack Count">
  <input
    type="number"
    value={catalogForm.packCount}
    onChange={(e) => updateCatalogForm("packCount", e.target.value)}
  />
</Field>
                <Field label="TideTradr Market Price"><input type="number" step="0.01" value={catalogForm.marketPrice} onChange={(e) => updateCatalogForm("marketPrice", e.target.value)} /></Field>
                <Field label="Low Price"><input type="number" step="0.01" value={catalogForm.lowPrice} onChange={(e) => updateCatalogForm("lowPrice", e.target.value)} /></Field>
                <Field label="Mid Price"><input type="number" step="0.01" value={catalogForm.midPrice} onChange={(e) => updateCatalogForm("midPrice", e.target.value)} /></Field>
                <Field label="High Price"><input type="number" step="0.01" value={catalogForm.highPrice} onChange={(e) => updateCatalogForm("highPrice", e.target.value)} /></Field>
                <Field label="Notes"><input value={catalogForm.notes} onChange={(e) => updateCatalogForm("notes", e.target.value)} /></Field>
                <button type="submit">{editingCatalogId ? "Save Catalog Product" : "Add Catalog Product"}</button>
                {editingCatalogId && <button type="button" className="secondary-button" onClick={() => { setEditingCatalogId(null); setCatalogForm(blankCatalog); }}>Cancel Edit</button>}
              </form>
            </section>
            <section className="panel">
              <h2>Product Catalog</h2>
              <input className="search-input" value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} placeholder="Search catalog..." />
              <Field label="Sort Inventory">
                <select
                  value={inventorySort}
                  onChange={(e) => setInventorySort(e.target.value)}
                >
                  <option value="newest">Newest Added</option>
                  <option value="highestProfit">Highest Profit</option>
                  <option value="highestMarket">Highest Market Value</option>
                  <option value="highestRoi">Highest ROI</option>
                  <option value="lowestStock">Lowest Stock</option>
                  <option value="az">A–Z</option>
                </select>
              </Field>
              <div className="inventory-list">
                {filteredCatalogProducts.map((p) => (
                  <div className="inventory-card" key={p.id}>
                    {p.imageUrl && <div className="receipt-preview"><p>Product Photo</p><img src={p.imageUrl} alt={p.name} /></div>}
                    <h3>{p.name}</h3>
                    <p>Category: {p.category}</p>
                    <p>Set: {p.setName || "Not listed"}</p>
                    <p>Type: {p.productType || "Not listed"}</p>
                    <p>Barcode: {p.barcode || "Not listed"}</p>
                   <p>MSRP: {money(p.msrpPrice)}</p>
<p>Set Code: {p.setCode || "Not listed"}</p>
<p>Expansion: {p.expansion || p.setName || "Not listed"}</p>
<p>Pack Count: {p.packCount || "Not listed"}</p>
                    <p>TideTradr Market Price: {money(p.marketPrice)}</p>
                    <p>Low / Mid / High: {money(p.lowPrice)} / {money(p.midPrice)} / {money(p.highPrice)}</p>
                    {p.marketUrl && <p><a href={p.marketUrl} target="_blank" rel="noreferrer">Open Market Source</a></p>}
                    {p.notes && <p>Notes: {p.notes}</p>}
                    <button className="edit-button" onClick={() => { applyCatalogProduct(p.id); setActiveTab("addInventory"); }}>Use for Forge</button>
                    <OverflowMenu
                      onEdit={() => startEditingCatalogProduct(p)}
                      onDelete={() => deleteCatalogProduct(p.id)}
                    />
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {activeTab === "addInventory" && (
  <section className="panel">
    <h2>Add Forge Inventory</h2>
    <button type="button" className="secondary-button" onClick={beginScanProduct}>
      Scan Product
    </button>

    <SmartAddInventory
  onAddInventory={(newItem) => {
    const product = newItem.product;

    setItemForm((old) => ({
      ...old,

      name: product?.name || old.name,
      category: "Pokemon",
      quantity: newItem.quantity || 1,

      barcode: product?.upcs?.[0] || old.barcode,
      marketPrice: product?.marketPrice || old.marketPrice || "",
      msrpPrice: product?.msrpPrice || old.msrpPrice || "",

      setCode: product?.setCode || old.setCode || "",
      expansion: product?.expansion || old.expansion || "",
      productLine: product?.productLine || old.productLine || "",
      productType: product?.itemType || old.productType || "",
      packCount: product?.packCount || old.packCount || "",

      unitCost:
        newItem.paidPriceEach ||
        product?.msrpPrice ||
        old.unitCost ||
        "",

      salePrice:
        newItem.sellingPriceEach ||
        product?.marketPrice ||
        old.salePrice ||
        "",

      status: "In Stock",
    }));
  }}
/>

    {showInventoryScanner && (
      <BarcodeScanner
        onScan={(code) => {
          updateItemForm("barcode", code);
          setShowInventoryScanner(false);
        }}
        onClose={() => setShowInventoryScanner(false)}
      />
    )}

    <InventoryForm
      form={itemForm}
      setForm={updateItemForm}
      catalogProducts={catalogProducts}
      purchasers={purchaserOptions}
      onCreatePurchaser={addPurchaserName}
      applyCatalogProduct={applyCatalogProduct}
      handleImageUpload={handleImageUpload}
      onSubmit={addItem}
      submitLabel="Add Item"
    />
  </section>
)}

        {activeTab === "inventory" && (
          <section className="panel">
            <div className="forge-toolbar">
              <div>
                <h2>Forge Inventory</h2>
                <p>Track product count, pack count, cost, market value, status, and listing notes.</p>
              </div>
              <button type="button" onClick={() => setActiveTab("addInventory")}>
                Add Forge Item
              </button>
            </div>
            <input className="search-input" value={inventorySearch} onChange={(e) => setInventorySearch(e.target.value)} placeholder="Search Forge inventory..." />
            <Field label="Filter by Purchaser">
              <select value={inventoryPurchaserFilter} onChange={(event) => setInventoryPurchaserFilter(event.target.value)}>
                <option value="All">All purchasers</option>
                <option value="Unassigned">Unassigned</option>
                {purchasers.map((purchaser) => (
                  <option key={purchaser.id} value={purchaser.id}>
                    {purchaser.name}{purchaser.active ? "" : " (archived)"}
                  </option>
                ))}
              </select>
            </Field>
            <div className="buyer-grid">
              {monthlyPurchaserSpending.slice(0, 4).map((row) => (
                <div className="buyer-card" key={row.name}>
                  <p>{row.name}</p>
                  <h3>{money(row.amount)}</h3>
                  <small>This month · Total {money(row.total)}</small>
                </div>
              ))}
            </div>
            <div className="chip-row">
              {quickInventoryFilters.map((filter) => (
                <button
                  key={filter.label}
                  type="button"
                  className={
                    inventoryStatusFilter === filter.status &&
                    inventorySearch === filter.search
                      ? "chip active"
                      : "chip"
                  }
                  onClick={() => {
                    setInventoryStatusFilter(filter.status);
                    setInventorySearch(filter.search);
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="filter-summary">
              <p>Current filter: {inventoryStatusFilter}</p>
              <p>Purchaser: {inventoryPurchaserFilter === "All" ? "All" : purchasers.find((purchaser) => purchaser.id === inventoryPurchaserFilter)?.name || inventoryPurchaserFilter}</p>

              <p>
              Showing {sortedFilteredItems.length} of {items.length} inventory records
              </p>

              <p>{inventorySearch ? ` - Search: ${inventorySearch}` : ""}</p>
            </div>
            {editingItemId && (
              <section className="panel forge-edit-panel">
                <div className="forge-toolbar">
                  <div>
                    <h2>Edit Forge Item</h2>
                    <p>Save changes here, then the Home totals update from localStorage.</p>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => { setEditingItemId(null); setItemForm(blankItem); }}>
                    Cancel Edit
                  </button>
                </div>
                <InventoryForm
                  form={itemForm}
                  setForm={updateItemForm}
                  catalogProducts={catalogProducts}
                  purchasers={purchaserOptions}
                  onCreatePurchaser={addPurchaserName}
                  applyCatalogProduct={applyCatalogProduct}
                  handleImageUpload={handleImageUpload}
                  onSubmit={saveEditedItem}
                  submitLabel="Save Changes"
                />
              </section>
            )}
            <div className="inventory-list compact-inventory-list">
              {sortedFilteredItems.length === 0 ? (
                <div className="inventory-card compact-card">
                  <h3>No Forge items found</h3>
                  <p>Add your first item or clear the current filters.</p>
                  <button type="button" className="edit-button" onClick={() => setActiveTab("addInventory")}>
                    Add Forge Item
                  </button>
                </div>
              ) : sortedFilteredItems.map((item) => (
                <CompactInventoryCard
                  key={item.id}
                  item={item}
                  onRestock={prepareRestock}
                  onEdit={startEditingItem}
                  onDelete={deleteItem}
                  onStatusChange={updateItemStatus}
                />
              ))}
            </div>
          </section>
        )}

        {activeTab === "addSale" && (
          <section className="panel">
            <h2>{editingSaleId ? "Edit Sale" : "Add Sale"}</h2>
            <form onSubmit={addSale} className="form">
              <Field label="Item Sold">
                <select value={saleForm.itemId} onChange={(e) => updateSaleForm("itemId", e.target.value)}>
                  <option value="">Choose item</option>
                  {items.filter((i) => i.quantity > 0).map((i) => <option key={i.id} value={i.id}>{i.name} — Qty {i.quantity} — {i.sku}</option>)}
                </select>
              </Field>
              <Field label="Platform"><select value={saleForm.platform} onChange={(e) => updateSaleForm("platform", e.target.value)}>{PLATFORMS.map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Quantity Sold"><input type="number" min="1" value={saleForm.quantitySold} onChange={(e) => updateSaleForm("quantitySold", e.target.value)} /></Field>
              <Field label="Final Sale Price Per Item"><input type="number" step="0.01" value={saleForm.finalSalePrice} onChange={(e) => updateSaleForm("finalSalePrice", e.target.value)} /></Field>
              <Field label="Shipping Cost"><input type="number" step="0.01" value={saleForm.shippingCost} onChange={(e) => updateSaleForm("shippingCost", e.target.value)} /></Field>
              <Field label="Platform Fees"><input type="number" step="0.01" value={saleForm.platformFees} onChange={(e) => updateSaleForm("platformFees", e.target.value)} /></Field>
              <Field label="Notes"><input value={saleForm.notes} onChange={(e) => updateSaleForm("notes", e.target.value)} /></Field>
              <button type="submit">{editingSaleId ? "Save Sale" : "Add Sale"}</button>
              {editingSaleId && <button type="button" className="secondary-button" onClick={() => { setEditingSaleId(null); setSaleForm({ itemId: "", platform: "eBay", quantitySold: 1, finalSalePrice: "", shippingCost: "", platformFees: "", notes: "" }); }}>Cancel Edit</button>}
            </form>
          </section>
        )}

        {activeTab === "sales" && (
          <ListPanel title="Forge Sales" emptyText="No sales added yet.">
            {sales.map((sale) => (
              <div className="inventory-card" key={sale.id}>
                <h3>{sale.itemName}</h3>
                <p>SKU: {sale.sku}</p>
                <p>Platform: {sale.platform}</p>
                <p>Quantity Sold: {sale.quantitySold}</p>
                <p>Sale Price Each: {money(sale.finalSalePrice)}</p>
                <p>Gross Sale: {money(sale.grossSale)}</p>
                <p>Item Cost: {money(sale.itemCost)}</p>
                <p>Shipping: {money(sale.shippingCost)}</p>
                <p>Fees: {money(sale.platformFees)}</p>
                <p>Net Profit: {money(sale.netProfit)}</p>
                {sale.notes && <p>Notes: {sale.notes}</p>}
                <OverflowMenu
                  onEdit={() => { startEditingSale(sale); setActiveTab("addSale"); }}
                  onDelete={() => deleteSale(sale.id)}
                />
              </div>
            ))}
          </ListPanel>
        )}

        {activeTab === "expenses" && (
          <>
            <section className="panel">
              <h2>{editingExpenseId ? "Edit Expense" : "Add Business Expense"}</h2>
              <form onSubmit={addExpense} className="form">
                <Field label="Vendor / Store"><input value={expenseForm.vendor} onChange={(e) => updateExpenseForm("vendor", e.target.value)} /></Field>
                <Field label="Expense Category"><select value={expenseForm.category} onChange={(e) => updateExpenseForm("category", e.target.value)}><option>Supplies</option><option>Shipping</option><option>Gas</option><option>Software</option><option>Storage</option><option>Equipment</option><option>Other</option></select></Field>
                <Field label="Who Paid?"><select value={expenseForm.buyer} onChange={(e) => updateExpenseForm("buyer", e.target.value)}>{peopleOptions.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Amount"><input type="number" step="0.01" value={expenseForm.amount} onChange={(e) => updateExpenseForm("amount", e.target.value)} /></Field>
                <Field label="Notes"><input value={expenseForm.notes} onChange={(e) => updateExpenseForm("notes", e.target.value)} /></Field>
                <Field label="Receipt / Screenshot"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => updateExpenseForm("receiptImage", url), "expenses")} /></Field>
                {expenseForm.receiptImage && <div className="receipt-preview"><p>Receipt</p><img src={expenseForm.receiptImage} alt="Receipt" /></div>}
                <button type="submit">{editingExpenseId ? "Save Expense" : "Add Expense"}</button>
                {editingExpenseId && <button type="button" className="secondary-button" onClick={() => { setEditingExpenseId(null); setExpenseForm({ vendor: "", category: "Supplies", buyer: "Zena", amount: "", notes: "", receiptImage: "" }); }}>Cancel Edit</button>}
              </form>
            </section>
            <ListPanel title="Business Expenses" emptyText="No expenses added yet.">
              {expenses.map((expense) => (
                <div className="inventory-card" key={expense.id}>
                  <h3>{expense.vendor}</h3>
                  <p>Category: {expense.category}</p>
                  <p>Paid By: {expense.buyer}</p>
                  <p>Amount: {money(expense.amount)}</p>
                  {expense.notes && <p>Notes: {expense.notes}</p>}
                  {expense.receiptImage && <div className="receipt-preview"><p>Receipt</p><img src={expense.receiptImage} alt="Receipt" /></div>}
                  <OverflowMenu
                    onEdit={() => startEditingExpense(expense)}
                    onDelete={() => deleteExpense(expense.id)}
                  />
                </div>
              ))}
            </ListPanel>
          </>
        )}

        {activeTab === "vehicles" && (
          <>
            <section className="panel">
              <h2>{editingVehicleId ? "Edit Vehicle" : "Add Vehicle"}</h2>
              <form onSubmit={addVehicle} className="form">
                <Field label="Vehicle Name"><input value={vehicleForm.name} onChange={(e) => updateVehicleForm("name", e.target.value)} /></Field>
                <Field label="Owner / Driver"><select value={vehicleForm.owner} onChange={(e) => updateVehicleForm("owner", e.target.value)}>{peopleOptions.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Average MPG"><input type="number" step="0.1" value={vehicleForm.averageMpg} onChange={(e) => updateVehicleForm("averageMpg", e.target.value)} /></Field>
                <Field label="Wear Cost Per Mile"><input type="number" step="0.01" value={vehicleForm.wearCostPerMile} onChange={(e) => updateVehicleForm("wearCostPerMile", e.target.value)} /></Field>
                <Field label="Notes"><input value={vehicleForm.notes} onChange={(e) => updateVehicleForm("notes", e.target.value)} /></Field>
                <button type="submit">{editingVehicleId ? "Save Vehicle" : "Add Vehicle"}</button>
                {editingVehicleId && <button type="button" className="secondary-button" onClick={() => { setEditingVehicleId(null); setVehicleForm({ name: "", owner: "Zena", averageMpg: "", wearCostPerMile: "", notes: "" }); }}>Cancel Edit</button>}
              </form>
            </section>
            <ListPanel title="Vehicles" emptyText="No vehicles added yet.">
              {vehicles.map((v) => (
                <div className="inventory-card" key={v.id}>
                  <h3>{v.name}</h3>
                  <p>Owner: {v.owner}</p>
                  <p>Average MPG: {v.averageMpg}</p>
                  <p>Wear / Maintenance: {money(v.wearCostPerMile)} per mile</p>
                  {v.notes && <p>Notes: {v.notes}</p>}
                  <OverflowMenu
                    onEdit={() => startEditingVehicle(v)}
                    onDelete={() => deleteVehicle(v.id)}
                  />
                </div>
              ))}
            </ListPanel>
          </>
        )}

        {activeTab === "mileage" && (
          <>
            <section className="panel">
              <h2>{editingTripId ? "Edit Mileage Trip" : "Add Mileage Trip"}</h2>
              <form onSubmit={addTrip} className="form">
                <Field label="Trip Purpose"><input value={tripForm.purpose} onChange={(e) => updateTripForm("purpose", e.target.value)} /></Field>
                <Field label="Driver"><select value={tripForm.driver} onChange={(e) => updateTripForm("driver", e.target.value)}>{peopleOptions.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Vehicle"><select value={tripForm.vehicleId} onChange={(e) => updateTripForm("vehicleId", e.target.value)}><option value="">No vehicle selected</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} — {v.averageMpg} MPG</option>)}</select></Field>
                <Field label="Starting Odometer"><input type="number" value={tripForm.startMiles} onChange={(e) => updateTripForm("startMiles", e.target.value)} /></Field>
                <Field label="Ending Odometer"><input type="number" value={tripForm.endMiles} onChange={(e) => updateTripForm("endMiles", e.target.value)} /></Field>
                <Field label="Gas Price Paid"><input type="number" step="0.01" value={tripForm.gasPrice} onChange={(e) => updateTripForm("gasPrice", e.target.value)} /></Field>
                <Field label="Gas Receipt"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => updateTripForm("gasReceiptImage", url), "gas")} /></Field>
                {tripForm.gasReceiptImage && <div className="receipt-preview"><p>Gas Receipt</p><img src={tripForm.gasReceiptImage} alt="Gas Receipt" /></div>}
                <Field label="Notes"><input value={tripForm.notes} onChange={(e) => updateTripForm("notes", e.target.value)} /></Field>
                <button type="submit">{editingTripId ? "Save Trip" : "Add Mileage Trip"}</button>
                {editingTripId && <button type="button" className="secondary-button" onClick={() => { setEditingTripId(null); setTripForm({ purpose: "", driver: "Zena", vehicleId: "", startMiles: "", endMiles: "", gasPrice: "", notes: "", gasReceiptImage: "" }); }}>Cancel Edit</button>}
              </form>
            </section>
            <ListPanel title="Mileage Trips" emptyText="No mileage trips added yet.">
              {mileageTrips.map((t) => (
                <div className="inventory-card" key={t.id}>
                  <h3>{t.purpose}</h3>
                  <p>Driver: {t.driver}</p>
                  <p>Vehicle: {t.vehicleName || "Not selected"}</p>
                  <p>Business Miles: {t.businessMiles}</p>
                  <p>Gas Price Paid: {money(t.gasPrice)}</p>
                  <p>Fuel Cost: {money(t.fuelCost)}</p>
                  <p>Wear / Maintenance: {money(t.wearCost)}</p>
                  <p>Total Vehicle Cost: {money(t.totalVehicleCost)}</p>
                  <p>IRS Mileage Value: {money(t.mileageValue)}</p>
                  {t.notes && <p>Notes: {t.notes}</p>}
                  {t.gasReceiptImage && <div className="receipt-preview"><p>Gas Receipt</p><img src={t.gasReceiptImage} alt="Gas Receipt" /></div>}
                  <OverflowMenu
                    onEdit={() => startEditingTrip(t)}
                    onDelete={() => deleteTrip(t.id)}
                  />
                </div>
              ))}
            </ListPanel>
          </>
        )}

        {activeTab === "reports" && (
          <>
            <section className="panel">
              <h2>Forge Reports</h2>

              {reportFocus && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setReportFocus("")}
                >
                  Show All Report Sections
                </button>
              )}

              <div className="cards">
                <div className="card">
                  <p>Inventory Units</p>
                  <h2>{items.reduce((s, i) => s + i.quantity, 0)}</h2>
                </div>

                <div className="card">
                  <p>Catalog Products</p>
                  <h2>{catalogProducts.length}</h2>
                </div>

                <div className="card">
                  <p>Avg Profit / Sale</p>
                  <h2>{money(sales.length ? totalSalesProfit / sales.length : 0)}</h2>
                </div>

                <div className="card">
                  <p>IRS Mileage Value</p>
                  <h2>{money(totalMileageValue)}</h2>
                </div>

                <div className="card">
                  <p>Fuel Cost</p>
                  <h2>{money(totalFuelCost)}</h2>
                </div>

                <div className="card">
                  <p>Wear Cost</p>
                  <h2>{money(totalWearCost)}</h2>
                </div>
              </div>
            </section>

            {!reportFocus && (
              <>
                <ReportList title="Forge Sales by Platform" data={salesByPlatform} moneyValues />
                <ReportList title="Expenses by Category" data={expensesByCategory} moneyValues />
                <ReportList title="Forge Inventory by Category" data={inventoryByCategory} />
                <ReportList title="Inventory by Status" data={inventoryByStatus} />
              </>
            )}

            {(!reportFocus || reportFocus === "needsPhotos") && (
              <ActionReport
                title="Needs Photos"
                items={needsPhotosItems}
                button="Update Item"
                action={startEditingItem}
              />
            )}

            {(!reportFocus || reportFocus === "needsMarket") && (
              <ActionReport
                title="Needs Market Check"
                items={needsMarketCheckItems}
                button="Update Market"
                action={startEditingItem}
              />
            )}

            {(!reportFocus || reportFocus === "missingMsrp") && (
              <ActionReport
                title="Missing MSRP"
                items={missingMsrpItems}
                button="Add MSRP"
                action={startEditingItem}
              />
            )}

            {(!reportFocus || reportFocus === "missingMarket") && (
              <ActionReport
                title="Missing Market Price"
                items={missingMarketPriceItems}
                button="Add Market Price"
                action={startEditingItem}
              />
            )}

            {(!reportFocus || reportFocus === "missingBarcode") && (
              <ActionReport
                title="Missing UPC / Barcode"
                items={missingBarcodeItems}
                button="Add UPC"
                action={startEditingItem}
              />
            )}

            {(!reportFocus || reportFocus === "missingType") && (
              <ActionReport
                title="Missing Product Type"
                items={missingProductTypeItems}
                button="Add Type"
                action={startEditingItem}
              />
            )}

            {(!reportFocus || reportFocus === "missingSalePrice") && (
              <ActionReport
                title="Missing Sale Price"
                items={missingSalePriceItems}
                button="Add Sale Price"
                action={startEditingItem}
              />
            )}

            {(!reportFocus || reportFocus === "readyToList") && (
              <ActionReport
                title="Ready to List"
                items={readyToListItems}
                button="Update Listing"
                action={startEditingItem}
              />
            )}

            {(!reportFocus || reportFocus === "listed") && (
              <ActionReport
                title="Listed Items"
                items={listedItems}
                button="Update Item"
                action={startEditingItem}
              />
            )}

            {(!reportFocus || reportFocus === "lowStock") && (
              <ActionReport
                title="Low Stock / Sold Out"
                items={lowStockItems}
                button="Restock / Rebuy"
                action={prepareRestock}
              />
            )}
          </>
        )}

      </main>
    </div>
  );
}

function CompactInventoryCard({
  item,
  onRestock,
  onEdit,
  onDelete,
  onStatusChange,
}) {
  const quantity = Number(item.quantity || 0);
  const unitCost = Number(item.unitCost || 0);
  const marketPrice = Number(item.marketPrice || 0);
  const salePrice = Number(item.salePrice || 0);

  const marketProfit = quantity * marketPrice - quantity * unitCost;
  const plannedProfit = quantity * salePrice - quantity * unitCost;

  const roiPercent =
    unitCost > 0 ? ((marketPrice - unitCost) / unitCost) * 100 : 0;
  return (
    <div className="inventory-card compact-card">
      <div className="compact-card-header">
        <div className="compact-title-block">
          <h3>{item.name}</h3>
          <p className="compact-subtitle">
            {item.category} • {item.buyer} • Qty {item.quantity}
          </p>
        </div>
        <span className={statusClass(item.status)}>{item.status || "In Stock"}</span>
      </div>

      {item.itemImage && (
        <div className="compact-image-wrap">
          <img src={item.itemImage} alt={item.name} />
        </div>
      )}

  <div className="compact-metrics">
    <div>
      <span>Avg Cost</span>
      <strong>{money(item.unitCost)}</strong>
    </div>
    <div>
      <span>MSRP</span>
      <strong>{money(item.msrpPrice)}</strong>
    </div>
    <div>
      <span>Market</span>
      <strong>{money(item.marketPrice)}</strong>
    </div>
    <div>
      <span>Profit</span>
      <strong>{money(marketProfit)}</strong>
    </div>
  </div>

      <div className="compact-details">
        <p><strong>SKU:</strong> {item.sku}</p>
        <p><strong>Store:</strong> {item.store || "Not listed"}</p>
        <p><strong>Purchased By:</strong> {itemPurchaserName(item)}</p>
        <p><strong>Type:</strong> {item.productType || "Not listed"}</p>
        <p><strong>Expansion:</strong> {item.expansion || "Not listed"}</p>
        <p><strong>Set Code:</strong> {item.setCode || "Not listed"}</p>
        <p><strong>Pack Count:</strong> {item.packCount || "Not listed"}</p>
        <p><strong>Barcode:</strong> {item.barcode || "Not listed"}</p>
        <p><strong>Total Cost:</strong> {money(item.quantity * item.unitCost)}</p>
        <p><strong>Total MSRP:</strong> {money(item.quantity * item.msrpPrice)}</p>
        <p><strong>ROI:</strong> {roiPercent.toFixed(1)}%</p>
        <p><strong>Total Market:</strong> {money(item.quantity * item.marketPrice)}</p>
        <p><strong>Planned Profit:</strong> {money(plannedProfit)}</p>
        {item.listingPlatform && <p><strong>Listing:</strong> {item.listingPlatform}</p>}
        {item.listedPrice > 0 && <p><strong>Listed Price:</strong> {money(item.listedPrice)}</p>}
        {item.actionNotes && <p><strong>Action:</strong> {item.actionNotes}</p>}
      </div>

      <div className="compact-links">
        {item.tideTradrUrl && <a href={item.tideTradrUrl} target="_blank" rel="noreferrer">TideTradr</a>}
        {item.listingUrl && <a href={item.listingUrl} target="_blank" rel="noreferrer">Listing</a>}
        {item.receiptImage && <a href={item.receiptImage} target="_blank" rel="noreferrer">Receipt</a>}
      </div>

      <div className="compact-actions">
        <select
          value={item.status || "In Stock"}
          onChange={(event) => onStatusChange(item, event.target.value)}
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <button className="edit-button" onClick={() => onRestock(item)}>
          Restock
        </button>

        <OverflowMenu
          onEdit={() => onEdit(item)}
          onDelete={() => onDelete(item.id)}
        />
      </div>
    </div>
  );
}

function InventoryForm({
  form,
  setForm,
  catalogProducts,
  purchasers = createDefaultPurchasers(),
  onCreatePurchaser,
  applyCatalogProduct,
  handleImageUpload,
  onSubmit,
  submitLabel,
}) {
  const [showNewPurchaser, setShowNewPurchaser] = useState(false);
  const [newPurchaserName, setNewPurchaserName] = useState("");
  const quantity = Number(form.quantity || 0);
  const unitCost = Number(form.unitCost || 0);
  const msrpPrice = Number(form.msrpPrice || 0);
  const marketPrice = Number(form.marketPrice || 0);
  const salePrice = Number(form.salePrice || 0);

  const totalPaid = quantity * unitCost;
  const totalMsrp = quantity * msrpPrice;
  const totalMarket = quantity * marketPrice;
  const totalPlannedSale = quantity * salePrice;

  const estimatedMarketProfit = totalMarket - totalPaid;
  const estimatedPlannedProfit = totalPlannedSale - totalPaid;

  const marketRoi =
    totalPaid > 0 ? (estimatedMarketProfit / totalPaid) * 100 : 0;

  const plannedRoi =
    totalPaid > 0 ? (estimatedPlannedProfit / totalPaid) * 100 : 0;

  const currentPurchaserId =
    form.purchaserId ||
    purchasers.find((purchaser) => purchaser.name === form.purchaserName || purchaser.name === form.buyer)?.id ||
    "";

  function selectPurchaser(purchaserId) {
    if (purchaserId === "__add__") {
      setShowNewPurchaser(true);
      return;
    }

    const purchaser = purchasers.find((candidate) => candidate.id === purchaserId);
    setForm("purchaserId", purchaser?.id || "");
    setForm("purchaserName", purchaser?.name || "Unassigned");
    setForm("buyer", purchaser?.name || "Unassigned");
  }

  function createInlinePurchaser() {
    const created = onCreatePurchaser?.(newPurchaserName);
    if (!created) return;

    setForm("purchaserId", created.id);
    setForm("purchaserName", created.name);
    setForm("buyer", created.name);
    setNewPurchaserName("");
    setShowNewPurchaser(false);
  }

  return (
    <form onSubmit={onSubmit} className="form">
      <Field label="Choose Saved Catalog Product">
        <select value={form.catalogProductId} onChange={(e) => applyCatalogProduct(e.target.value)}>
          <option value="">No catalog product selected</option>
          {catalogProducts.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.marketPrice)}</option>)}
        </select>
      </Field>
      <Field label="Item Name"><input value={form.name} onChange={(e) => setForm("name", e.target.value)} /></Field>
      <Field label="Product Photo"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => setForm("itemImage", url), "item-photos")} /></Field>
      {form.itemImage && <div className="receipt-preview"><p>Product Photo</p><img src={form.itemImage} alt="Product" /></div>}
      <Field label="Purchased By">
        <select value={currentPurchaserId} onChange={(e) => selectPurchaser(e.target.value)}>
          <option value="">Unassigned</option>
          {purchasers.map((purchaser) => (
            <option key={purchaser.id} value={purchaser.id}>{purchaser.name}</option>
          ))}
          <option value="__add__">Add New Purchaser</option>
        </select>
      </Field>
      {showNewPurchaser && (
        <div className="inline-form">
          <input
            value={newPurchaserName}
            onChange={(event) => setNewPurchaserName(event.target.value)}
            placeholder="New purchaser name"
          />
          <button type="button" onClick={createInlinePurchaser}>Save Purchaser</button>
          <button type="button" className="secondary-button" onClick={() => setShowNewPurchaser(false)}>Cancel</button>
        </div>
      )}
      <Field label="Category"><select value={form.category} onChange={(e) => setForm("category", e.target.value)}>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Store / Source"><input value={form.store} onChange={(e) => setForm("store", e.target.value)} /></Field>
      <Field label="Barcode / UPC"><input value={form.barcode} onChange={(e) => setForm("barcode", e.target.value)} /></Field>
      <Field label="Quantity Purchased"><input type="number" min="0" value={form.quantity} onChange={(e) => setForm("quantity", e.target.value)} /></Field>
      <Field label="Unit Cost"><input type="number" step="0.01" value={form.unitCost} onChange={(e) => setForm("unitCost", e.target.value)} /></Field>
      <Field label="Planned Sale Price"><input type="number" step="0.01" value={form.salePrice} onChange={(e) => setForm("salePrice", e.target.value)} /></Field>
      <div className="profit-preview">
        <h3>Profit Preview</h3>

        <div className="preview-grid">
          <div>
            <span>Total Paid</span>
            <strong>{money(totalPaid)}</strong>
          </div>

          <div>
            <span>Total MSRP</span>
            <strong>{money(totalMsrp)}</strong>
          </div>

          <div>
            <span>Total Market</span>
            <strong>{money(totalMarket)}</strong>
          </div>

          <div>
            <span>Planned Sale Total</span>
            <strong>{money(totalPlannedSale)}</strong>
          </div>

          <div>
            <span>Market Profit</span>
            <strong>{money(estimatedMarketProfit)}</strong>
          </div>

          <div>
            <span>Planned Profit</span>
            <strong>{money(estimatedPlannedProfit)}</strong>
          </div>

          <div>
            <span>Market ROI</span>
            <strong>{marketRoi.toFixed(1)}%</strong>
          </div>

          <div>
            <span>Planned ROI</span>
            <strong>{plannedRoi.toFixed(1)}%</strong>
          </div>
        </div>
      </div>
      <Field label="TideTradr Product ID"><input value={form.externalProductId} onChange={(e) => setForm("externalProductId", e.target.value)} /></Field>
      <Field label="Market Source URL"><input value={form.tideTradrUrl} onChange={(e) => setForm("tideTradrUrl", e.target.value)} /></Field>
      <Field label="MSRP Price">
  <input
    type="number"
    step="0.01"
    value={form.msrpPrice}
    onChange={(e) => setForm("msrpPrice", e.target.value)}
  />
</Field>

<Field label="Product Type">
  <input
    value={form.productType}
    onChange={(e) => setForm("productType", e.target.value)}
  />
</Field>

<Field label="Set Code">
  <input
    value={form.setCode}
    onChange={(e) => setForm("setCode", e.target.value)}
  />
</Field>

<Field label="Expansion">
  <input
    value={form.expansion}
    onChange={(e) => setForm("expansion", e.target.value)}
  />
</Field>

<Field label="Product Line">
  <input
    value={form.productLine}
    onChange={(e) => setForm("productLine", e.target.value)}
  />
</Field>

<Field label="Pack Count">
  <input
    type="number"
    value={form.packCount}
    onChange={(e) => setForm("packCount", e.target.value)}
  />
</Field>
      <Field label="TideTradr Market Price"><input type="number" step="0.01" value={form.marketPrice} onChange={(e) => setForm("marketPrice", e.target.value)} /></Field>
      <Field label="Low Price"><input type="number" step="0.01" value={form.lowPrice} onChange={(e) => setForm("lowPrice", e.target.value)} /></Field>
      <Field label="Mid Price"><input type="number" step="0.01" value={form.midPrice} onChange={(e) => setForm("midPrice", e.target.value)} /></Field>
      <Field label="High Price"><input type="number" step="0.01" value={form.highPrice} onChange={(e) => setForm("highPrice", e.target.value)} /></Field>
      <Field label="Status"><select value={form.status} onChange={(e) => setForm("status", e.target.value)}>{STATUSES.map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Listing Platform"><input value={form.listingPlatform} onChange={(e) => setForm("listingPlatform", e.target.value)} /></Field>
      <Field label="Listing URL"><input value={form.listingUrl} onChange={(e) => setForm("listingUrl", e.target.value)} /></Field>
      <Field label="Listed Price"><input type="number" step="0.01" value={form.listedPrice} onChange={(e) => setForm("listedPrice", e.target.value)} /></Field>
      <Field label="Action Notes"><input value={form.actionNotes} onChange={(e) => setForm("actionNotes", e.target.value)} /></Field>
      <Field label="Receipt / Screenshot"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => setForm("receiptImage", url), "inventory")} /></Field>
      {form.receiptImage && <div className="receipt-preview"><p>Receipt</p><img src={form.receiptImage} alt="Receipt" /></div>}
      <button type="submit">{submitLabel}</button>
    </form>
  );
}

function ListPanel({ title, emptyText, children }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="panel">
      <h2>{title}</h2>
      {!hasChildren ? <p>{emptyText}</p> : <div className="inventory-list">{children}</div>}
    </section>
  );
}

function ReportList({ title, data, moneyValues = false }) {
  const entries = Object.entries(data);
  return (
    <section className="panel">
      <h2>{title}</h2>
      {entries.length === 0 ? <p>No data yet.</p> : entries.map(([key, value]) => <p key={key}>{key}: {moneyValues ? money(value) : `${value} units`}</p>)}
    </section>
  );
}

function ActionReport({ title, items, button, action }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {items.length === 0 ? <p>No items.</p> : (
        <div className="inventory-list compact-inventory-list">
          {items.map((item) => (
            <div className="inventory-card compact-card" key={item.id}>
              <div className="compact-card-header">
                <div>
                  <h3>{item.name}</h3>
                  <p className="compact-subtitle">Qty {item.quantity} • {item.category}</p>
                </div>
                <span className={statusClass(item.status)}>{item.status || "In Stock"}</span>
              </div>
              <div className="compact-metrics">
                <div><span>Cost</span><strong>{money(item.unitCost)}</strong></div>
                <div><span>TideTradr</span><strong>{money(item.marketPrice)}</strong></div>
                <div><span>Profit</span><strong>{money(item.quantity * item.marketPrice - item.quantity * item.unitCost)}</strong></div>
              </div>
              <button className="edit-button" onClick={() => action(item)}>{button}</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
