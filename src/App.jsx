import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import "./App.css";
import { supabase } from "./supabaseClient";
import SmartAddInventory from "./components/SmartAddInventory";
import SmartAddCatalog from "./components/SmartAddCatalog";
import OverflowMenu from "./components/OverflowMenu";
import Scout from "./pages/Scout";
import { SEALED_PRODUCT_TYPES, SHARED_POKEMON_PRODUCTS } from "./data/sharedPokemonCatalog";
import {
  FEATURE_LABELS,
  FEATURE_TIERS,
  PAID_HOME_STATS,
  PLAN_TYPES,
  TIER_LABELS,
  FEATURE_ACCESS,
  getUpgradePrompt,
  getUserPlan,
  getUserTier,
  hasPlanAccess,
  isAdminUser,
  isPaidUser,
} from "./constants/plans";

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
const USER_TYPES = ["collector", "seller", "scout", "parent", "advanced"];
const HOME_STATS = [
  { key: "collection_value", label: "Collection Value", group: "Collection & Spending" },
  { key: "monthly_spending", label: "Monthly Spending", group: "Collection & Spending" },
  { key: "market_value", label: "Market Value", group: "Collection & Spending" },
  { key: "savings_vs_msrp", label: "Savings vs MSRP", group: "Collection & Spending" },
  { key: "forge_inventory_value", label: "Forge Inventory Value", group: "Inventory & Sales" },
  { key: "forge_planned_sales", label: "Forge Planned Sales", group: "Inventory & Sales" },
  { key: "forge_sales_revenue", label: "Forge Sales Revenue", group: "Inventory & Sales" },
  { key: "items_sold", label: "Items Sold", group: "Inventory & Sales" },
  { key: "monthly_profit_loss", label: "Monthly Profit/Loss", group: "Profit & ROI" },
  { key: "market_roi", label: "Market ROI", group: "Profit & ROI" },
  { key: "planned_roi", label: "Planned ROI", group: "Profit & ROI" },
  { key: "planned_profit", label: "Planned Profit", group: "Profit & ROI" },
  { key: "forge_profit", label: "Forge Profit", group: "Profit & ROI" },
  { key: "expenses", label: "Expenses", group: "Profit & ROI" },
  { key: "profit_after_expenses", label: "Profit After Expenses", group: "Profit & ROI" },
  { key: "market_vs_msrp_percent", label: "Market vs MSRP %", group: "MSRP / Deal Metrics" },
  { key: "market_over_msrp", label: "Market Over MSRP", group: "MSRP / Deal Metrics" },
  { key: "business_miles", label: "Business Miles", group: "Mileage & Vehicle" },
  { key: "total_vehicle_cost", label: "Total Vehicle Cost", group: "Mileage & Vehicle" },
];
const HOME_STAT_GROUPS = [...new Set(HOME_STATS.map((stat) => stat.group))];
const HOME_STAT_KEYS = HOME_STATS.map((stat) => stat.key);
const HOME_STAT_DEFAULTS = {
  collector: ["collection_value", "monthly_spending", "market_value", "savings_vs_msrp"],
  seller: [
    "forge_inventory_value",
    "market_value",
    "monthly_profit_loss",
    "market_roi",
    "planned_roi",
    "forge_planned_sales",
    "planned_profit",
    "forge_sales_revenue",
    "forge_profit",
    "expenses",
    "profit_after_expenses",
    "items_sold",
    "business_miles",
    "total_vehicle_cost",
  ],
  scout: ["monthly_spending", "market_value", "market_vs_msrp_percent", "market_over_msrp", "savings_vs_msrp"],
  parent: ["monthly_spending", "market_value", "market_vs_msrp_percent", "market_over_msrp", "savings_vs_msrp"],
  advanced: HOME_STAT_KEYS,
};
const DASHBOARD_CARD_STYLES = ["compact", "comfortable", "detailed"];
const DASHBOARD_PRESETS = ["simple", "collector", "seller", "scout", "parent", "advanced"];
const DASHBOARD_SECTIONS = [
  { key: "quick_actions", label: "Quick Actions", group: "Core" },
  { key: "home_stats", label: "Home Stats", group: "Core" },
  { key: "catalog_shortcut", label: "Catalog Shortcut", group: "Collection" },
  { key: "recent_inventory", label: "Recent Inventory", group: "Collection" },
  { key: "recent_sales", label: "Recent Sales", group: "Seller" },
  { key: "wishlist", label: "Wishlist", group: "Collection" },
  { key: "watchlist", label: "Watchlist", group: "Market" },
  { key: "deal_checker", label: "Deal Checker", group: "Market" },
  { key: "store_reports", label: "Store Reports", group: "Scout" },
  { key: "nearby_stores", label: "Nearby Stores", group: "Scout" },
  { key: "restock_calendar", label: "Restock Calendar", group: "Scout" },
  { key: "alerts", label: "Alerts", group: "Core" },
  { key: "mileage_summary", label: "Mileage Summary", group: "Seller" },
  { key: "expenses_summary", label: "Expenses Summary", group: "Seller" },
  { key: "people_wishlists", label: "People Wishlists", group: "Parent" },
  { key: "market_summary", label: "Market Summary", group: "Market" },
  { key: "pack_it_forward", label: "Pack It Forward", group: "Parent" },
  { key: "action_center", label: "Action Center", group: "Core" },
  { key: "purchaser_spending", label: "Purchaser Spending", group: "Seller" },
  { key: "exports", label: "Exports", group: "Advanced" },
  { key: "settings", label: "Settings", group: "Core", locked: true },
];
const DASHBOARD_PRESET_SECTIONS = {
  simple: ["quick_actions", "home_stats", "catalog_shortcut", "recent_inventory", "deal_checker", "settings"],
  collector: ["home_stats", "quick_actions", "catalog_shortcut", "recent_inventory", "wishlist", "market_summary", "settings"],
  seller: ["home_stats", "quick_actions", "recent_inventory", "recent_sales", "expenses_summary", "mileage_summary", "action_center", "settings"],
  scout: ["quick_actions", "store_reports", "nearby_stores", "restock_calendar", "watchlist", "alerts", "settings"],
  parent: ["quick_actions", "deal_checker", "people_wishlists", "home_stats", "wishlist", "nearby_stores", "settings"],
  advanced: DASHBOARD_SECTIONS.map((section) => section.key),
};

function money(value) {
  return `$${toNumber(value).toFixed(2)}`;
}

function toNumber(value, fallback = 0) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
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

function normalizeUserType(userType) {
  return USER_TYPES.includes(userType) ? userType : "collector";
}

function getDefaultHomeStatsForUserType(userType = "collector") {
  const enabledKeys = HOME_STAT_DEFAULTS[normalizeUserType(userType)] || HOME_STAT_DEFAULTS.collector;
  return HOME_STATS.reduce((settings, stat) => ({ ...settings, [stat.key]: enabledKeys.includes(stat.key) }), {});
}

function normalizeHomeStatsEnabled(savedStats, userType = "collector") {
  const defaults = getDefaultHomeStatsForUserType(userType);
  if (!savedStats || typeof savedStats !== "object") return defaults;
  return HOME_STATS.reduce(
    (settings, stat) => ({ ...settings, [stat.key]: savedStats[stat.key] ?? defaults[stat.key] }),
    {}
  );
}

function isHomeStatEnabled(profile, statKey) {
  const userType = normalizeUserType(profile?.userType || profile?.user_type);
  const enabled = normalizeHomeStatsEnabled(profile?.homeStatsEnabled || profile?.home_stats_enabled, userType);
  return enabled[statKey] !== false;
}

function normalizeDashboardPreset(preset) {
  return DASHBOARD_PRESETS.includes(preset) ? preset : "simple";
}

function normalizeDashboardCardStyle(style) {
  return DASHBOARD_CARD_STYLES.includes(style) ? style : "comfortable";
}

function getDashboardPresetForUserType(userType = "collector") {
  const map = { collector: "collector", seller: "seller", scout: "scout", parent: "parent", advanced: "advanced" };
  return map[normalizeUserType(userType)] || "simple";
}

function getDefaultDashboardLayoutForPreset(preset = "simple") {
  const normalized = normalizeDashboardPreset(preset);
  const enabledKeys = DASHBOARD_PRESET_SECTIONS[normalized] || DASHBOARD_PRESET_SECTIONS.simple;
  return {
    sections: DASHBOARD_SECTIONS.map((section, index) => ({
      key: section.key,
      enabled: section.locked ? true : enabledKeys.includes(section.key),
      order: enabledKeys.includes(section.key) ? enabledKeys.indexOf(section.key) + 1 : index + 100,
      collapsed: false,
    })).sort((a, b) => a.order - b.order),
  };
}

function normalizeDashboardLayout(layout, preset = "simple") {
  const defaults = getDefaultDashboardLayoutForPreset(preset);
  const savedSections = Array.isArray(layout?.sections) ? layout.sections : [];
  return {
    sections: DASHBOARD_SECTIONS.map((section) => {
      const saved = savedSections.find((candidate) => candidate.key === section.key);
      const fallback = defaults.sections.find((candidate) => candidate.key === section.key);
      return {
        key: section.key,
        enabled: section.locked ? true : saved?.enabled ?? fallback?.enabled ?? false,
        order: Number(saved?.order ?? fallback?.order ?? 100),
        collapsed: Boolean(saved?.collapsed ?? fallback?.collapsed ?? false),
      };
    }).sort((a, b) => a.order - b.order),
  };
}

function isDashboardSectionEnabled(profile, sectionKey) {
  const preset = normalizeDashboardPreset(profile?.dashboardPreset || profile?.dashboard_preset);
  const layout = normalizeDashboardLayout(profile?.dashboardLayout || profile?.dashboard_layout, preset);
  return layout.sections.find((section) => section.key === sectionKey)?.enabled !== false;
}

function createSharedCatalogProducts() {
  const now = new Date().toISOString();
  return SHARED_POKEMON_PRODUCTS.map((product, index) => ({
    id: `shared-product-${index + 1}`,
    catalogType: product.catalogType || "sealed",
    name: product.productName || product.cardName || product.name || "",
    productName: product.productName || product.name || "",
    cardName: product.cardName || "",
    pokemonName: product.pokemonName || "",
    category: "Pokemon",
    barcode: product.barcode || product.upc || "",
    sku: product.sku || "",
    externalProductId: product.externalProductId || product.sku || "",
    marketUrl: "",
    imageUrl: "",
    marketPrice: toNumber(product.marketValue || product.marketValueNearMint || product.marketValueRaw),
    lowPrice: toNumber(product.marketValueLightPlayed || product.lowPrice),
    midPrice: toNumber(product.marketValueNearMint || product.marketValue || product.midPrice),
    highPrice: toNumber(product.marketValueGraded || product.highPrice),
    marketSource: product.marketSource || "Mock",
    marketLastUpdated: product.marketLastUpdated || now,
    marketConfidenceLevel: product.marketConfidenceLevel || "Mock",
    sourceType: product.sourceType || "mock",
    setCode: product.setCode || product.cardNumber || "",
    packCount: product.packCount ?? "",
    releaseDate: product.releaseDate || "",
    releaseYear: product.releaseYear || "",
    series: product.series || product.productLine || "",
    productLine: product.series || product.productLine || "",
    cardNumber: product.cardNumber || "",
    rarity: product.rarity || "",
    variant: product.variant || "",
    condition: product.condition || "Near Mint",
    language: product.language || "English",
    graded: Boolean(product.graded),
    gradingCompany: product.gradingCompany || "",
    grade: product.grade || "",
    marketValueRaw: toNumber(product.marketValueRaw),
    marketValueNearMint: toNumber(product.marketValueNearMint || product.marketValue),
    marketValueLightPlayed: toNumber(product.marketValueLightPlayed),
    marketValueGraded: toNumber(product.marketValueGraded),
    notes: product.notes || "TideTradr beta catalog item. Market data is mock/manual unless labeled otherwise.",
    createdAt: now,
    lastUpdated: product.lastUpdated || now,
    ...product,
    msrpPrice: toNumber(product.msrpPrice || product.msrp),
    msrpDisplay: product.msrpPrice || product.msrp || "Unknown",
    marketValue: toNumber(product.marketValue || product.marketValueNearMint),
    expansion: product.expansion || product.setName || "",
  }));
}

function mergeSharedCatalogProducts(savedProducts = []) {
  const sharedProducts = createSharedCatalogProducts();
  const saved = Array.isArray(savedProducts) ? savedProducts : [];
  const savedKeys = new Set(
    saved.map((product) =>
      String(product.id || `${product.catalogType || "sealed"}-${product.name || product.productName || product.cardName}-${product.setName || ""}`).toLowerCase()
    )
  );
  const savedNameKeys = new Set(
    saved.map((product) =>
      String(`${product.catalogType || "sealed"}-${product.name || product.productName || product.cardName}-${product.setName || ""}`).toLowerCase()
    )
  );
  const missingShared = sharedProducts.filter((product) => {
    const idKey = String(product.id || "").toLowerCase();
    const nameKey = String(`${product.catalogType || "sealed"}-${product.name || product.productName || product.cardName}-${product.setName || ""}`).toLowerCase();
    return !savedKeys.has(idKey) && !savedNameKeys.has(nameKey);
  });
  return [...saved, ...missingShared];
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

function CollapsibleFeatureSection({ title, summary, open, onToggle, children }) {
  return (
    <section className="feature-dropdown">
      <button type="button" className="feature-dropdown-toggle" onClick={onToggle}>
        <span>
          <strong>{title}</strong>
          {summary ? <small>{summary}</small> : null}
        </span>
        <b>{open ? "Hide" : "Show"}</b>
      </button>
      {open ? <div className="feature-dropdown-body">{children}</div> : null}
    </section>
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

function UpgradeScreen({ featureKey, onBack }) {
  return (
    <section className="panel upgrade-panel">
      <h2>Upgrade Required</h2>
      <p>{getUpgradePrompt(featureKey)}</p>
      <div className="quick-actions">
        <button type="button" disabled>Upgrade to Paid</button>
        <button type="button" className="secondary-button" disabled>Manage Subscription</button>
        <button type="button" className="secondary-button" onClick={onBack}>Back to Home</button>
      </div>
    </section>
  );
}

function LockedFeatureCard({ featureKey, onUpgrade }) {
  return (
    <div className="card locked-feature-card">
      <p>{TIER_LABELS[FEATURE_TIERS[featureKey]] || "Premium"}</p>
      <h2>{FEATURE_LABELS[featureKey] || "Locked Feature"}</h2>
      <small>{getUpgradePrompt(featureKey)}</small>
      {onUpgrade ? (
        <button type="button" className="secondary-button" onClick={onUpgrade}>
          Upgrade
        </button>
      ) : null}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTopbarActions, setShowTopbarActions] = useState(true);
  const [showFullTopbar, setShowFullTopbar] = useState(true);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [appSearchQuery, setAppSearchQuery] = useState("");
  const [menuSectionsOpen, setMenuSectionsOpen] = useState({});
  const [featureSectionsOpen, setFeatureSectionsOpen] = useState({
    home_dashboard_cards: true,
    home_quick_actions: false,
    ledger_inventory: true,
    ledger_catalog: false,
    ledger_tidetradr: false,
    vault_summary: true,
    vault_add: false,
    vault_tidetradr: false,
    scout_stores: true,
    scout_recommendations: false,
    scout_store_tracker: false,
    scout_tidetradr: false,
    market_summary: true,
    market_lookup: false,
    market_deal_finder: false,
    menu_profile: true,
  });
  const [reportFocus, setReportFocus] = useState("");

  const [treasureClicks, setTreasureClicks] = useState(0);
  const [showTreasure, setShowTreasure] = useState(false);

  const [user, setUser] = useState(BETA_LOCAL_MODE ? { id: "local-beta", email: "local beta mode" } : null);
  const [userType, setUserType] = useState("collector");
  const [homeStatsEnabled, setHomeStatsEnabled] = useState(() => getDefaultHomeStatsForUserType("collector"));
  const [dashboardPreset, setDashboardPreset] = useState("simple");
  const [dashboardLayout, setDashboardLayout] = useState(() => getDefaultDashboardLayoutForPreset("simple"));
  const [dashboardCardStyle, setDashboardCardStyle] = useState("comfortable");
  const [subscriptionProfile, setSubscriptionProfile] = useState({
    subscriptionPlan: PLAN_TYPES.FREE,
    subscriptionStatus: "active",
    lifetimeAccess: false,
  });
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [items, setItems] = useState([]);
  const [purchasers, setPurchasers] = useState(createDefaultPurchasers);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [tideTradrWatchlist, setTideTradrWatchlist] = useState([]);
  const [tideTradrLookupId, setTideTradrLookupId] = useState("");
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
  const [catalogKindFilter, setCatalogKindFilter] = useState("All");
  const [catalogSetFilter, setCatalogSetFilter] = useState("All");
  const [catalogTypeFilter, setCatalogTypeFilter] = useState("All");
  const [catalogEraFilter, setCatalogEraFilter] = useState("All");
  const [catalogYearFilter, setCatalogYearFilter] = useState("All");
  const [catalogRarityFilter, setCatalogRarityFilter] = useState("All");
  const [catalogVariantFilter, setCatalogVariantFilter] = useState("All");
  const [catalogConditionFilter, setCatalogConditionFilter] = useState("All");
  const [catalogGradedFilter, setCatalogGradedFilter] = useState("All");
  const [catalogOwnedFilter, setCatalogOwnedFilter] = useState("All");
  const [catalogWatchlistFilter, setCatalogWatchlistFilter] = useState("All");
  const [catalogMinValue, setCatalogMinValue] = useState("");
  const [catalogMaxValue, setCatalogMaxValue] = useState("");
  const [bulkImportText, setBulkImportText] = useState("");
  const [bulkImportPreview, setBulkImportPreview] = useState([]);
  const [localDataLoaded, setLocalDataLoaded] = useState(false);
  const [scoutSnapshot, setScoutSnapshot] = useState({ stores: [], reports: [], tidepoolReports: [] });
  const [dealForm, setDealForm] = useState({
    productId: "",
    title: "",
    quantity: 1,
    askingPrice: "",
    marketTotal: "",
    retailTotal: "",
    condition: "Sealed",
    notes: "",
  });
  const [vaultForm, setVaultForm] = useState({
    name: "",
    vaultCategory: "Personal collection",
    status: "Personal Collection",
    quantity: 1,
    unitCost: "",
    msrpPrice: "",
    marketPrice: "",
    salePrice: "",
    packCount: "",
    setName: "",
    productType: "",
    store: "",
    purchaseDate: "",
    receiptImage: "",
    itemImage: "",
    notes: "",
  });
  const [showVaultAddForm, setShowVaultAddForm] = useState(false);
  const [vaultFormSections, setVaultFormSections] = useState({
    basic: true,
    pricing: false,
    status: false,
    extra: false,
  });
  const [locationSettings, setLocationSettings] = useState({
    mode: "manual",
    manualLocation: "",
    savedLocations: [],
    selectedSavedLocation: "",
    trackingEnabled: false,
    lastUpdated: "",
  });
  const [importAssistantOpen, setImportAssistantOpen] = useState(false);
  const [importAssistantContext, setImportAssistantContext] = useState("Forge");
  const [importSourceType, setImportSourceType] = useState("text");
  const [importText, setImportText] = useState("");
  const [importLink, setImportLink] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState([]);
  const [importOptions, setImportOptions] = useState({
    pinHighValue: false,
    addToWatchlist: false,
    updateMarketValues: false,
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
  catalogType: "sealed",
  name: "",
  productName: "",
  cardName: "",
  pokemonName: "",
  category: "Pokemon",
  setName: "",
  productType: "",
  barcode: "",
  sku: "",
  externalProductId: "",
  marketUrl: "",
  imageUrl: "",
  marketPrice: "",
  marketSource: "Manual",
  marketLastUpdated: "",
  marketConfidenceLevel: "Manual",
  sourceType: "manual",
  lowPrice: "",
  midPrice: "",
  highPrice: "",
  msrpPrice: "",
  setCode: "",
  expansion: "",
  productLine: "",
  releaseDate: "",
  releaseYear: "",
  packCount: "",
  cardNumber: "",
  rarity: "",
  variant: "",
  condition: "Near Mint",
  language: "English",
  graded: false,
  gradingCompany: "",
  grade: "",
  marketValueRaw: "",
  marketValueNearMint: "",
  marketValueLightPlayed: "",
  marketValueGraded: "",
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
    { key: "forge", label: "Forge", target: "inventory" },
    { key: "scout", label: "Scout", target: "scout" },
    { key: "vault", label: "Vault", target: "vault" },
    { key: "tideTradr", label: "TideTradr", target: "market" },
  ];

  const navSections = [
    {
      title: "Menu",
      items: [
        { key: "menu", label: "Profile / Settings" },
        { key: "dashboard", label: "Dashboard Display", target: "dashboard" },
        { key: "scout", label: "Location / Notifications", target: "scout" },
        { key: "catalog", label: "Data Export / Catalog", target: "catalog" },
        { key: "market", label: "TideTradr", target: "market" },
      ],
    },
    { title: "Main Tabs", items: [
      { key: "home", label: "Home", target: "dashboard" },
      { key: "forge", label: "Forge", target: "inventory" },
      { key: "scout-main", label: "Scout", target: "scout" },
      { key: "vault", label: "Vault" },
      { key: "tidetradr-main", label: "TideTradr", target: "market" },
    ] },
    {
      title: "Forge Tools",
      items: [
        { key: "addInventory", label: "Add Forge Item", feature: "seller_tools" },
        { key: "addSale", label: "Add Sale", feature: "seller_tools" },
        { key: "expenses", label: "Forge Expenses", feature: "expenses" },
        { key: "reports", label: "Forge Reports", feature: "seller_tools" },
        { key: "mileage", label: "Mileage", feature: "mileage" },
        { key: "vehicles", label: "Vehicles", feature: "mileage" },
      ],
    },
  ];

  const activeTabLabel =
    navSections.flatMap((s) => s.items).find((i) => (i.target || i.key) === activeTab)?.label || "Dashboard";
  const activeMainTab =
    activeTab === "dashboard"
      ? "home"
      : activeTab === "vault" || activeTab === "scout"
        ? activeTab
      : activeTab === "market" || activeTab === "catalog"
          ? "tideTradr"
          : "forge";

  const appSearchResults = useMemo(() => {
    const query = appSearchQuery.trim().toLowerCase();
    if (query.length < 2) return [];

    function includes(value) {
      return String(value || "").toLowerCase().includes(query);
    }

    const productResults = catalogProducts
      .filter((product) => product.catalogType !== "card")
      .filter((product) => [product.name, product.productName, product.setName, product.productType, product.barcode, product.sku].some(includes))
      .slice(0, 8)
      .map((product) => ({ id: `product-${product.id}`, category: "Products", title: product.name || product.productName, subtitle: `${product.productType || "Sealed product"}${product.setName ? ` • ${product.setName}` : ""}`, source: product }));

    const cardResults = catalogProducts
      .filter((product) => product.catalogType === "card")
      .filter((product) => [product.name, product.cardName, product.pokemonName, product.setName, product.rarity, product.variant].some(includes))
      .slice(0, 8)
      .map((product) => ({ id: `card-${product.id}`, category: "Cards", title: product.name || product.cardName, subtitle: `${product.setName || "Card"}${product.rarity ? ` • ${product.rarity}` : ""}`, source: product }));

    const inventoryResults = items
      .filter((item) => item.status !== "Personal Collection" && item.status !== "Held")
      .filter((item) => [item.name, item.expansion, item.productType, item.store, item.barcode].some(includes))
      .slice(0, 8)
      .map((item) => ({ id: `inventory-${item.id}`, category: "Inventory", title: item.name, subtitle: `Qty ${item.quantity} • ${money(item.marketPrice || item.unitCost)}`, source: item }));

    const vaultResults = items
      .filter((item) => item.status === "Personal Collection" || item.status === "Held")
      .filter((item) => [item.name, item.expansion, item.productType, item.actionNotes, item.barcode].some(includes))
      .slice(0, 8)
      .map((item) => ({ id: `vault-${item.id}`, category: "Vault", title: item.name, subtitle: `${item.status} • ${money(item.marketPrice || item.unitCost)}`, source: item }));

    const storeResults = scoutSnapshot.stores
      .filter((store) => [store.name, store.nickname, store.chain, store.city, store.address, store.region].some(includes))
      .slice(0, 8)
      .map((store) => ({ id: `store-${store.id}`, category: "Stores", title: store.nickname || store.name, subtitle: `${store.chain || "Store"} • ${store.city || ""}`, source: store }));

    const allReports = [...(scoutSnapshot.reports || []), ...(scoutSnapshot.tidepoolReports || [])];
    const reportResults = allReports
      .filter((report) => [report.itemName, report.productName, report.reportText, report.notes, report.storeName, report.reportType].some(includes))
      .slice(0, 8)
      .map((report) => ({ id: `report-${report.id || report.reportId}`, category: "Reports", title: report.itemName || report.productName || report.reportType || "Scout report", subtitle: `${report.storeName || "Scout"} • ${report.reportType || report.stockStatus || "Report"}`, source: report }));

    return [...productResults, ...cardResults, ...inventoryResults, ...vaultResults, ...storeResults, ...reportResults].slice(0, 24);
  }, [appSearchQuery, catalogProducts, items, scoutSnapshot]);

  function closeSearchResults() {
    setAppSearchQuery("");
    setSearchExpanded(false);
  }

  function viewSearchResult(result) {
    if (result.category === "Products" || result.category === "Cards") {
      setTideTradrLookupId(result.source.id);
      setActiveTab("market");
    } else if (result.category === "Inventory") {
      setInventorySearch(result.source.name || "");
      setActiveTab("inventory");
    } else if (result.category === "Vault") {
      setActiveTab("vault");
      setFeatureSectionsOpen((current) => ({ ...current, vault_collection_items: true }));
    } else if (result.category === "Stores" || result.category === "Reports") {
      setActiveTab("scout");
      setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }));
    }
    setSearchExpanded(false);
  }

  function favoriteSearchStore(store) {
    const nextStores = scoutSnapshot.stores.map((candidate) =>
      String(candidate.id) === String(store.id) ? { ...candidate, favorite: true } : candidate
    );
    setScoutSnapshot((current) => ({ ...current, stores: nextStores }));
    const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
    localStorage.setItem(SCOUT_STORAGE_KEY, JSON.stringify({ ...saved, stores: nextStores }));
  }

  function renderSearchActions(result) {
    if (result.category === "Products" || result.category === "Cards") {
      return (
        <>
          <button type="button" onClick={() => viewSearchResult(result)}>View item</button>
          <button type="button" className="secondary-button" onClick={() => { applyCatalogProduct(result.source.id); setActiveTab("addInventory"); setSearchExpanded(false); }}>Add to Forge</button>
          <button type="button" className="secondary-button" onClick={() => { applyCatalogProductToVault(result.source.id); setActiveTab("vault"); setSearchExpanded(false); }}>Add to Vault</button>
          <button type="button" className="secondary-button" onClick={() => { useCatalogProductInDeal(result.source.id); setSearchExpanded(false); }}>Check Deal</button>
          <button type="button" className="secondary-button" onClick={() => addProductToTideTradrWatchlist(result.source.id)}>Pin to Home</button>
        </>
      );
    }
    if (result.category === "Stores") {
      return (
        <>
          <button type="button" onClick={() => viewSearchResult(result)}>View store</button>
          <button type="button" className="secondary-button" onClick={() => favoriteSearchStore(result.source)}>Favorite store</button>
        </>
      );
    }
    if (result.category === "Reports") {
      return <button type="button" onClick={() => viewSearchResult(result)}>Open report</button>;
    }
    return <button type="button" onClick={() => viewSearchResult(result)}>View item</button>;
  }

  function toggleMenuSection(key) {
    setMenuSectionsOpen((current) => ({ ...current, [key]: !current[key] }));
  }

  function runMenuAction(action) {
    action();
    setMenuOpen(false);
  }

  function renderMenuPullDown(key, title, summary, children) {
    const open = Boolean(menuSectionsOpen[key]);
    return (
      <div className="drawer-collapsible" key={key}>
        <button type="button" className="drawer-collapsible-toggle" onClick={() => toggleMenuSection(key)}>
          <span>
            <strong>{title}</strong>
            <small>{summary}</small>
          </span>
          <b>{open ? "Hide" : "Open"}</b>
        </button>
        {open ? <div className="drawer-collapsible-body">{children}</div> : null}
      </div>
    );
  }

  useEffect(() => {
    let frameId = 0;
    const lastScrollY = { current: window.scrollY || 0 };

    function handleScroll() {
      if (frameId) return;

      frameId = window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY || 0;
        const delta = currentScrollY - lastScrollY.current;

        if (currentScrollY <= 5) {
          setShowTopbarActions(true);
          setShowFullTopbar(true);
        } else if (currentScrollY > 20 && delta > 4) {
          setShowTopbarActions(false);
          setShowFullTopbar(false);
        } else if (delta < -4) {
          setShowTopbarActions(true);
          if (delta < -18) setShowFullTopbar(true);
        }

        lastScrollY.current = currentScrollY;
        frameId = 0;
      });
    }

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, []);

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

  function updateHomeStatsEnabled(updates) {
    setHomeStatsEnabled((current) => normalizeHomeStatsEnabled({ ...current, ...updates }, userType));
  }

  function resetHomeStatsForUserType(nextUserType = userType) {
    setHomeStatsEnabled(getDefaultHomeStatsForUserType(nextUserType));
  }

  function setAllHomeStats(enabled) {
    setHomeStatsEnabled(HOME_STATS.reduce((settings, stat) => ({ ...settings, [stat.key]: enabled }), {}));
  }

  function updateUserType(nextUserType) {
    const normalized = normalizeUserType(nextUserType);
    setUserType(normalized);
    setHomeStatsEnabled((current) => normalizeHomeStatsEnabled(current, normalized));
  }

  function updateDashboardPreset(nextPreset) {
    const normalized = normalizeDashboardPreset(nextPreset);
    setDashboardPreset(normalized);
    setDashboardLayout(getDefaultDashboardLayoutForPreset(normalized));
  }

  function updateDashboardLayout(updater) {
    setDashboardLayout((current) => normalizeDashboardLayout(typeof updater === "function" ? updater(current) : updater, dashboardPreset));
  }

  function updateDashboardCardStyle(nextStyle) {
    setDashboardCardStyle(normalizeDashboardCardStyle(nextStyle));
  }

  function resetDashboardLayoutForPreset(preset = dashboardPreset) {
    setDashboardLayout(getDefaultDashboardLayoutForPreset(preset));
  }

  function updateDashboardSection(key, updates) {
    updateDashboardLayout((current) => ({
      sections: normalizeDashboardLayout(current, dashboardPreset).sections.map((section) =>
        section.key === key ? { ...section, ...updates } : section
      ),
    }));
  }

  function moveDashboardSection(key, direction) {
    updateDashboardLayout((current) => {
      const sections = normalizeDashboardLayout(current, dashboardPreset).sections;
      const index = sections.findIndex((section) => section.key === key);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= sections.length) return current;
      const next = [...sections];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return { sections: next.map((section, orderIndex) => ({ ...section, order: orderIndex + 1 })) };
    });
  }

  function toggleFeatureSection(key) {
    setFeatureSectionsOpen((current) => ({ ...current, [key]: !current[key] }));
  }

  function isFeatureSectionOpen(key) {
    return Boolean(featureSectionsOpen[key]);
  }

  function updateLocationSettings(updates) {
    setLocationSettings((current) => ({ ...current, ...updates, lastUpdated: new Date().toISOString() }));
  }

  function saveManualLocation() {
    const value = String(locationSettings.manualLocation || "").trim();
    if (!value) return;
    setLocationSettings((current) => ({
      ...current,
      mode: "saved",
      selectedSavedLocation: value,
      savedLocations: [...new Set([...(current.savedLocations || []), value])],
      lastUpdated: new Date().toISOString(),
    }));
  }

  function openInventoryImportAssistant(context = "Forge") {
    setImportAssistantContext(context);
    setImportAssistantOpen(true);
    if (context === "Vault") {
      setFeatureSectionsOpen((current) => ({ ...current, vault_add: true }));
      setActiveTab("vault");
      return;
    }
    setFeatureSectionsOpen((current) => ({ ...current, ledger_inventory: true }));
    setActiveTab("inventory");
  }

  function parseCsvLine(line) {
    const cells = [];
    let current = "";
    let inQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells.map((cell) => cell.replace(/^"|"$/g, ""));
  }

  function readImportCell(row, headers, aliases, fallbackIndex = -1) {
    const match = headers.findIndex((header) => aliases.some((alias) => header.includes(alias)));
    if (match >= 0) return row[match] || "";
    if (fallbackIndex >= 0) return row[fallbackIndex] || "";
    return "";
  }

  function normalizeImportNumber(value) {
    const clean = String(value || "").replace(/[$,%]/g, "").trim();
    const number = Number(clean);
    return Number.isFinite(number) ? number : "";
  }

  function findCatalogMatchForImport(name, setName = "") {
    const cleanName = String(name || "").trim().toLowerCase();
    const cleanSet = String(setName || "").trim().toLowerCase();
    if (!cleanName) return { match: null, confidenceScore: 20, needsReview: true };

    const exact = catalogProducts.find((product) => {
      const productName = String(product.name || product.productName || product.cardName || "").trim().toLowerCase();
      const productSet = String(product.setName || product.expansion || "").trim().toLowerCase();
      return productName === cleanName && (!cleanSet || productSet === cleanSet);
    });
    if (exact) return { match: exact, confidenceScore: 94, needsReview: false };

    const tokens = cleanName.split(/\s+/).filter((token) => token.length > 2);
    const fuzzy = catalogProducts.find((product) => {
      const productName = String(product.name || product.productName || product.cardName || "").trim().toLowerCase();
      const productSet = String(product.setName || product.expansion || "").trim().toLowerCase();
      const tokenHits = tokens.filter((token) => productName.includes(token)).length;
      return tokenHits >= Math.min(3, Math.max(1, tokens.length - 1)) && (!cleanSet || productSet.includes(cleanSet) || cleanSet.includes(productSet));
    });
    if (fuzzy) return { match: fuzzy, confidenceScore: 70, needsReview: true };

    return { match: null, confidenceScore: 35, needsReview: true };
  }

  function makeImportRow(raw, sourceType, index) {
    const itemName = raw.itemName || raw.name || raw.productName || raw.originalText || `Imported item ${index + 1}`;
    const matchResult = findCatalogMatchForImport(itemName, raw.setName);
    const matched = matchResult.match;
    const marketInfo = matched ? getTideTradrMarketInfo(matched) : {};
    const catalogType = raw.catalogType || matched?.catalogType || (raw.condition || raw.grade ? "card" : matched?.catalog_type || "unknown");
    return {
      importedItemId: makeId("import-row"),
      originalText: raw.originalText || itemName,
      matchedCatalogItemId: matched?.id || "",
      possibleMatchName: matched?.name || matched?.productName || matched?.cardName || "",
      itemName,
      catalogType,
      productType: raw.productType || matched?.productType || "",
      setName: raw.setName || matched?.setName || matched?.expansion || "",
      quantity: Number(raw.quantity || 1),
      costPaid: normalizeImportNumber(raw.costPaid),
      msrp: normalizeImportNumber(raw.msrp || matched?.msrpPrice || matched?.msrp || ""),
      marketValue: normalizeImportNumber(raw.marketValue || marketInfo.currentMarketValue || ""),
      condition: raw.condition || matched?.condition || "",
      language: raw.language || matched?.language || "",
      graded: Boolean(raw.graded || matched?.graded),
      grade: raw.grade || matched?.grade || "",
      location: raw.location || raw.source || "",
      notes: raw.notes || "",
      confidenceScore: matchResult.confidenceScore,
      needsReview: matchResult.needsReview,
      importStatus: "pending",
      destination: importAssistantContext === "Vault" ? "Vault" : "Forge",
      sourceType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function parseImportText(text, sourceType = importSourceType) {
    const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    const firstLineCells = parseCsvLine(lines[0]);
    const hasHeaders = firstLineCells.some((cell) => /name|item|product|quantity|qty|cost|market|msrp|set/i.test(cell));
    const headers = hasHeaders ? firstLineCells.map((cell) => cell.toLowerCase().trim()) : [];
    const dataLines = hasHeaders ? lines.slice(1) : lines;

    return dataLines.map((line, index) => {
      const cells = line.includes(",") ? parseCsvLine(line) : line.split(/\t|\|/).map((cell) => cell.trim());
      if (headers.length) {
        return makeImportRow({
          originalText: line,
          itemName: readImportCell(cells, headers, ["name", "item", "product", "card"], 0),
          quantity: readImportCell(cells, headers, ["quantity", "qty", "count"], 1),
          costPaid: readImportCell(cells, headers, ["cost", "paid", "purchase"], 2),
          marketValue: readImportCell(cells, headers, ["market", "value"], 3),
          msrp: readImportCell(cells, headers, ["msrp", "retail"], 4),
          productType: readImportCell(cells, headers, ["type", "category"], 5),
          setName: readImportCell(cells, headers, ["set", "collection", "expansion"], 6),
          condition: readImportCell(cells, headers, ["condition"], 7),
          notes: readImportCell(cells, headers, ["note"], 8),
        }, sourceType, index);
      }

      const quantityMatch = line.match(/\b(?:qty|quantity|x)\s*[:#-]?\s*(\d+)\b/i) || line.match(/\b(\d+)\s*x\b/i);
      const prices = [...line.matchAll(/\$?\b(\d+(?:\.\d{1,2})?)\b/g)].map((match) => match[1]);
      const cleanedName = line
        .replace(/\b(?:qty|quantity|x)\s*[:#-]?\s*\d+\b/gi, "")
        .replace(/\b\d+\s*x\b/gi, "")
        .replace(/\$?\b\d+(?:\.\d{1,2})?\b/g, "")
        .replace(/[,|-]+/g, " ")
        .trim();
      return makeImportRow({
        originalText: line,
        itemName: cleanedName || cells[0] || line,
        quantity: quantityMatch?.[1] || 1,
        costPaid: prices[0] || "",
        marketValue: prices[1] || "",
      }, sourceType, index);
    });
  }

  function runImportParse() {
    if (importSourceType === "link") {
      const row = makeImportRow({
        originalText: importLink,
        itemName: "Saved inventory source link",
        notes: "Automatic link import is coming soon. You can paste the list or upload a CSV for now.",
        source: importLink,
      }, "link", 0);
      setImportRows([row]);
      return;
    }
    const nextRows = parseImportText(importText, importSourceType);
    setImportRows(nextRows);
  }

  function handleImportFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (["png", "jpg", "jpeg", "webp", "gif"].includes(extension || "")) {
      setImportSourceType("screenshot");
      setImportRows([
        makeImportRow({
          originalText: file.name,
          itemName: "Image inventory import",
          notes: "Image/OCR import is coming soon. Manually transcribe the screenshot into pasted text for beta.",
        }, "screenshot", 0),
      ]);
      return;
    }
    if (["xlsx", "xls", "pdf"].includes(extension || "")) {
      setImportSourceType(extension === "pdf" ? "pdf" : "excel");
      setImportRows([
        makeImportRow({
          originalText: file.name,
          itemName: `${extension?.toUpperCase()} import placeholder`,
          notes: "Spreadsheet/PDF parsing placeholder. Export as CSV or paste the list for beta parsing.",
        }, extension === "pdf" ? "pdf" : "excel", 0),
      ]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || "");
      setImportText(content);
      setImportSourceType(extension === "csv" ? "csv" : "text");
      setImportRows(parseImportText(content, extension === "csv" ? "csv" : "text"));
    };
    reader.readAsText(file);
  }

  function updateImportRow(rowId, updates) {
    setImportRows((current) => current.map((row) => {
      if (row.importedItemId !== rowId) return row;
      const next = { ...row, ...updates, updatedAt: new Date().toISOString() };
      if (Object.prototype.hasOwnProperty.call(updates, "itemName") || Object.prototype.hasOwnProperty.call(updates, "setName")) {
        const matchResult = findCatalogMatchForImport(next.itemName, next.setName);
        next.matchedCatalogItemId = matchResult.match?.id || "";
        next.possibleMatchName = matchResult.match?.name || "";
        next.confidenceScore = matchResult.confidenceScore;
        next.needsReview = matchResult.needsReview;
      }
      return next;
    }));
  }

  function createManualCatalogItemFromImport(row) {
    const now = new Date().toISOString();
    const product = {
      id: makeId("catalog"),
      catalogType: row.catalogType === "card" ? "card" : "sealed",
      name: row.itemName,
      productName: row.catalogType === "card" ? "" : row.itemName,
      cardName: row.catalogType === "card" ? row.itemName : "",
      pokemonName: "",
      category: "Pokemon",
      setName: row.setName,
      productType: row.productType,
      barcode: "",
      sku: "",
      marketPrice: Number(row.marketValue || 0),
      marketSource: "Manual",
      marketLastUpdated: now,
      marketConfidenceLevel: "Manual",
      sourceType: "manual",
      msrpPrice: Number(row.msrp || 0),
      condition: row.condition || "",
      language: row.language || "English",
      graded: Boolean(row.graded),
      grade: row.grade || "",
      notes: row.notes || "Created from Inventory Import Assistant.",
      createdAt: now,
      updatedAt: now,
    };
    setCatalogProducts((current) => [product, ...current]);
    updateImportRow(row.importedItemId, {
      matchedCatalogItemId: product.id,
      possibleMatchName: product.name,
      confidenceScore: 88,
      needsReview: false,
    });
  }

  function importedRowToItem(row, destination) {
    const matched = catalogProducts.find((product) => String(product.id) === String(row.matchedCatalogItemId));
    const defaultPurchaser = purchasers.find((purchaser) => purchaser.active) || purchasers[0] || { id: "", name: "Unassigned" };
    const status = destination === "Vault" ? "Personal Collection" : "In Stock";
    return {
      ...blankItem,
      id: makeId(destination === "Vault" ? "vault-import" : "import"),
      name: row.itemName,
      buyer: defaultPurchaser.name,
      purchaserId: defaultPurchaser.id,
      purchaserName: defaultPurchaser.name,
      category: "Pokemon",
      store: row.location || "",
      quantity: Number(row.quantity || 1),
      unitCost: Number(row.costPaid || 0),
      salePrice: "",
      barcode: matched?.barcode || "",
      catalogProductId: matched?.id || "",
      catalogProductName: matched?.name || "",
      externalProductId: matched?.externalProductId || "",
      tideTradrUrl: matched?.marketUrl || "",
      marketPrice: Number(row.marketValue || matched?.marketPrice || 0),
      lowPrice: Number(matched?.lowPrice || 0),
      midPrice: Number(matched?.midPrice || row.marketValue || 0),
      highPrice: Number(matched?.highPrice || 0),
      msrpPrice: Number(row.msrp || matched?.msrpPrice || 0),
      expansion: row.setName || matched?.setName || "",
      productType: row.productType || matched?.productType || "",
      status,
      actionNotes: destination === "Vault" ? "Imported collection item" : "Imported Forge item",
      notes: [row.notes, `Imported from ${row.sourceType}. Original: ${row.originalText}`].filter(Boolean).join(" | "),
      createdAt: new Date().toISOString(),
      importStatus: "imported",
      importSourceType: row.sourceType,
    };
  }

  function confirmInventoryImport() {
    const rowsToImport = importRows.filter((row) => row.importStatus !== "skipped");
    if (rowsToImport.length === 0) return alert("No import rows selected.");
    const nextItems = [];
    rowsToImport.forEach((row) => {
      const destinations = row.destination === "Both" ? ["Forge", "Vault"] : [row.destination || "Forge"];
      destinations.forEach((destination) => {
        nextItems.push(importedRowToItem(row, destination));
      });
    });
    setItems((current) => [...nextItems, ...current]);
    if (importOptions.addToWatchlist || importOptions.pinHighValue) {
      rowsToImport.forEach((row) => {
        const marketValue = Number(row.marketValue || 0);
        if (row.matchedCatalogItemId && (importOptions.addToWatchlist || marketValue >= 50)) {
          addProductToTideTradrWatchlist(row.matchedCatalogItemId);
        }
      });
    }
    setImportRows((current) => current.map((row) => row.importStatus === "skipped" ? row : { ...row, importStatus: "imported", updatedAt: new Date().toISOString() }));
    setImportAssistantOpen(false);
    setActiveTab(importAssistantContext === "Vault" ? "vault" : "inventory");
  }

  function renderInventoryImportAssistant() {
    if (!importAssistantOpen) return null;
    return (
      <section className="panel import-assistant-panel">
        <div className="compact-card-header">
          <div>
            <h2>Inventory Import Assistant</h2>
            <p>Upload, paste, or stage inventory for Forge and Vault. Nothing saves until you review and confirm.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => setImportAssistantOpen(false)}>Close Import</button>
        </div>

        <p className="compact-subtitle">Only import what you choose to upload or paste. Review all items before saving.</p>

        <div className="cards mini-cards">
          <div className="card"><p>Source</p><h2>{importSourceType}</h2></div>
          <div className="card"><p>Review Rows</p><h2>{importRows.length}</h2></div>
          <div className="card"><p>Destination</p><h2>{importAssistantContext}</h2></div>
        </div>

        <div className="form">
          <Field label="Import Source">
            <select value={importSourceType} onChange={(event) => setImportSourceType(event.target.value)}>
              <option value="csv">Upload a CSV or spreadsheet</option>
              <option value="text">Paste your inventory list</option>
              <option value="screenshot">Upload a screenshot</option>
              <option value="link">Paste inventory/collection link</option>
              <option value="manual">Manual review before saving</option>
            </select>
          </Field>
          <Field label="Upload File">
            <input type="file" accept=".csv,.txt,.tsv,.xlsx,.xls,.pdf,image/*" onChange={handleImportFileUpload} />
          </Field>
          {importFileName ? <p className="compact-subtitle">Selected file: {importFileName}</p> : null}
          <Field label="Paste Text / List">
            <textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={"Example:\nName,Quantity,Cost Paid,Market Value,MSRP,Product Type,Set,Condition,Notes\nPrismatic Evolutions ETB,2,59.99,90,49.99,Elite Trainer Box,Prismatic Evolutions,Sealed,Keep one"}
            />
          </Field>
          <Field label="Paste inventory/collection link">
            <input value={importLink} onChange={(event) => setImportLink(event.target.value)} placeholder="Google Sheets, Excel/OneDrive, TCGPlayer, PriceCharting, Collectr, eBay, Whatnot export link" />
          </Field>
          {importSourceType === "link" ? (
            <div className="empty-state">
              <h3>Link import beta</h3>
              <p>Save source link, then attempt import if supported. Automatic link import is coming soon. You can paste the list or upload a CSV for now.</p>
              <p className="compact-subtitle">Later examples: Google Sheets, Excel/OneDrive, TCGPlayer collection/export, PriceCharting collection/export, Collectr export, eBay inventory/drafts export, and Whatnot inventory/export if available.</p>
            </div>
          ) : null}
        </div>

        <div className="quick-actions">
          <button type="button" onClick={runImportParse}>Review Matches Before Saving</button>
          <button type="button" className="secondary-button" onClick={() => setImportRows([])}>Clear Review</button>
        </div>

        <div className="settings-subsection">
          <h3>Import Options</h3>
          <div className="toggle-list">
            <label className="toggle-row">
              <span>Pin imported high-value items to Home Market Watch</span>
              <input type="checkbox" checked={importOptions.pinHighValue} onChange={(event) => setImportOptions((current) => ({ ...current, pinHighValue: event.target.checked }))} />
            </label>
            <label className="toggle-row">
              <span>Add imported matched items to Watchlist</span>
              <input type="checkbox" checked={importOptions.addToWatchlist} onChange={(event) => setImportOptions((current) => ({ ...current, addToWatchlist: event.target.checked }))} />
            </label>
            <label className="toggle-row">
              <span>Update market values after import if possible</span>
              <input type="checkbox" checked={importOptions.updateMarketValues} onChange={(event) => setImportOptions((current) => ({ ...current, updateMarketValues: event.target.checked }))} />
            </label>
          </div>
        </div>

        {importRows.length ? (
          <div className="inventory-list compact-inventory-list">
            {importRows.map((row) => (
              <div className="inventory-card compact-card" key={row.importedItemId}>
                <div className="compact-card-header">
                  <div>
                    <h3>{row.itemName}</h3>
                    <p>{row.possibleMatchName ? `Match: ${row.possibleMatchName}` : "No catalog match yet"}</p>
                    <small>{row.confidenceScore}% confidence | {row.needsReview ? "Needs Review" : "Good Match"} | {row.sourceType}</small>
                  </div>
                  <span className="status-badge">{row.importStatus}</span>
                </div>
                <div className="form import-review-grid">
                  <Field label="Item Name">
                    <input value={row.itemName} onChange={(event) => updateImportRow(row.importedItemId, { itemName: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                  <Field label="Destination">
                    <select value={row.destination} onChange={(event) => updateImportRow(row.importedItemId, { destination: event.target.value, importStatus: "reviewed" })}>
                      <option value="Forge">Add to Forge inventory</option>
                      <option value="Vault">Add to Vault collection</option>
                      <option value="Both">Split between Forge and Vault</option>
                    </select>
                  </Field>
                  <Field label="Quantity">
                    <input type="number" min="1" value={row.quantity} onChange={(event) => updateImportRow(row.importedItemId, { quantity: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                  <Field label="Cost Paid">
                    <input type="number" step="0.01" value={row.costPaid} onChange={(event) => updateImportRow(row.importedItemId, { costPaid: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                  <Field label="Market Value">
                    <input type="number" step="0.01" value={row.marketValue} onChange={(event) => updateImportRow(row.importedItemId, { marketValue: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                  <Field label="Product Type">
                    <input value={row.productType} onChange={(event) => updateImportRow(row.importedItemId, { productType: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                  <Field label="Set Name">
                    <input value={row.setName} onChange={(event) => updateImportRow(row.importedItemId, { setName: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                  <Field label="Condition">
                    <input value={row.condition} onChange={(event) => updateImportRow(row.importedItemId, { condition: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                  <Field label="Notes">
                    <input value={row.notes} onChange={(event) => updateImportRow(row.importedItemId, { notes: event.target.value, importStatus: "reviewed" })} />
                  </Field>
                </div>
                <div className="quick-actions">
                  <button type="button" onClick={() => updateImportRow(row.importedItemId, { importStatus: "reviewed", needsReview: false })}>Mark Reviewed</button>
                  <button type="button" className="secondary-button" onClick={() => updateImportRow(row.importedItemId, { importStatus: "skipped" })}>Skip</button>
                  <button type="button" className="secondary-button" onClick={() => createManualCatalogItemFromImport(row)}>Create Manual Catalog Item</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>Import examples</h3>
            <p>Upload a CSV, paste your inventory list, upload a screenshot placeholder, or save a source link. CSV and pasted text are the beta priority.</p>
          </div>
        )}

        <div className="quick-actions">
          <button type="button" disabled={!importRows.length} onClick={confirmInventoryImport}>Confirm Import</button>
          <button type="button" className="secondary-button" onClick={() => setImportAssistantOpen(false)}>Cancel</button>
        </div>
      </section>
    );
  }

  function enableLocationTracking() {
    if (!navigator.geolocation) {
      alert("Location is not available in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationSettings((current) => ({
          ...current,
          mode: "device",
          trackingEnabled: true,
          manualLocation: `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`,
          lastUpdated: new Date().toISOString(),
        }));
      },
      () => alert("Location permission was not granted.")
    );
  }

  function disableLocationTracking() {
    updateLocationSettings({ trackingEnabled: false, mode: "manual" });
  }

  function loadScoutSnapshot() {
    const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
    setScoutSnapshot({
      stores: saved.stores || [],
      reports: saved.reports || [],
      tidepoolReports: saved.tidepoolReports || [],
    });
  }

  useEffect(() => {
    if (BETA_LOCAL_MODE) {
      const saved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "{}");
      const savedUserType = normalizeUserType(saved.userType);
      const savedPreset = normalizeDashboardPreset(saved.dashboardPreset || getDashboardPresetForUserType(savedUserType));
      setUserType(savedUserType);
      setHomeStatsEnabled(normalizeHomeStatsEnabled(saved.homeStatsEnabled, savedUserType));
      setDashboardPreset(savedPreset);
      setDashboardLayout(normalizeDashboardLayout(saved.dashboardLayout, savedPreset));
      setDashboardCardStyle(normalizeDashboardCardStyle(saved.dashboardCardStyle));
      setSubscriptionProfile({
        subscriptionPlan: saved.subscriptionProfile?.subscriptionPlan || PLAN_TYPES.FREE,
        featureTier: saved.subscriptionProfile?.featureTier || saved.subscriptionProfile?.subscriptionPlan || PLAN_TYPES.FREE,
        subscriptionStatus: saved.subscriptionProfile?.subscriptionStatus || "active",
        subscriptionStartedAt: saved.subscriptionProfile?.subscriptionStartedAt || "",
        subscriptionExpiresAt: saved.subscriptionProfile?.subscriptionExpiresAt || "",
        lifetimeAccess: Boolean(saved.subscriptionProfile?.lifetimeAccess),
      });
      setLocationSettings({
        mode: saved.locationSettings?.mode || "manual",
        manualLocation: saved.locationSettings?.manualLocation || "",
        savedLocations: Array.isArray(saved.locationSettings?.savedLocations) ? saved.locationSettings.savedLocations : [],
        selectedSavedLocation: saved.locationSettings?.selectedSavedLocation || "",
        trackingEnabled: Boolean(saved.locationSettings?.trackingEnabled),
        lastUpdated: saved.locationSettings?.lastUpdated || "",
      });
      setItems(saved.items || []);
      setPurchasers(normalizePurchasers(saved.purchasers));
      setCatalogProducts(saved.catalogProducts?.length ? mergeSharedCatalogProducts(saved.catalogProducts) : createSharedCatalogProducts());
      setTideTradrWatchlist(Array.isArray(saved.tideTradrWatchlist) ? saved.tideTradrWatchlist : []);
      setTideTradrLookupId(saved.tideTradrLookupId || "");
      setExpenses(saved.expenses || []);
      setSales(saved.sales || []);
      setVehicles(saved.vehicles || []);
      setMileageTrips(saved.mileageTrips || []);
      setDealForm({
        productId: "",
        title: "",
        quantity: 1,
        askingPrice: "",
        marketTotal: "",
        retailTotal: "",
        condition: "Sealed",
        notes: "",
        ...(saved.dealForm || {}),
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
        tideTradrWatchlist,
        tideTradrLookupId,
        expenses,
        sales,
        vehicles,
        mileageTrips,
        dealForm,
        userType,
        homeStatsEnabled,
        dashboardPreset,
        dashboardLayout,
        dashboardCardStyle,
        subscriptionProfile,
        locationSettings,
      })
    );
  }, [items, purchasers, catalogProducts, tideTradrWatchlist, tideTradrLookupId, expenses, sales, vehicles, mileageTrips, dealForm, userType, homeStatsEnabled, dashboardPreset, dashboardLayout, dashboardCardStyle, subscriptionProfile, locationSettings, localDataLoaded]);

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
    setScoutSnapshot({ stores: [], reports: [], tidepoolReports: [] });
    setItems([]);
    setPurchasers(createDefaultPurchasers());
    setCatalogProducts(createSharedCatalogProducts());
    setTideTradrWatchlist([]);
    setTideTradrLookupId("");
    setExpenses([]);
    setSales([]);
    setVehicles([]);
    setMileageTrips([]);
    setDealForm({
      productId: "",
      title: "",
      quantity: 1,
      askingPrice: "",
      marketTotal: "",
      retailTotal: "",
      condition: "Sealed",
      notes: "",
    });
    setVaultForm({
      name: "",
      vaultCategory: "Personal collection",
      status: "Personal Collection",
      quantity: 1,
      unitCost: "",
      msrpPrice: "",
      marketPrice: "",
      salePrice: "",
      packCount: "",
      setName: "",
      productType: "",
      store: "",
      purchaseDate: "",
      receiptImage: "",
      itemImage: "",
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
    const status = vaultForm.status || (vaultCategory === "Rip later" ? "Held" : "Personal Collection");
    const newItem = {
      id: makeId("vault"),
      name: vaultForm.name,
      sku: `VAULT-${Date.now()}`,
      buyer: defaultPurchaser.name,
      purchaserId: defaultPurchaser.id,
      purchaserName: defaultPurchaser.name,
      category: "Pokemon",
      store: vaultForm.store || "",
      quantity: Number(vaultForm.quantity || 1),
      unitCost: Number(vaultForm.unitCost || 0),
      salePrice: Number(vaultForm.salePrice || 0),
      receiptImage: vaultForm.receiptImage || "",
      itemImage: vaultForm.itemImage || "",
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
      purchaseDate: vaultForm.purchaseDate || "",
      createdAt: vaultForm.purchaseDate ? new Date(vaultForm.purchaseDate).toISOString() : now,
    };

    setItems([newItem, ...items]);
    setVaultForm({
      name: "",
      vaultCategory: "Personal collection",
      status: "Personal Collection",
      quantity: 1,
      unitCost: "",
      msrpPrice: "",
      marketPrice: "",
      salePrice: "",
      packCount: "",
      setName: "",
      productType: "",
      store: "",
      purchaseDate: "",
      receiptImage: "",
      itemImage: "",
      notes: "",
    });
    setShowVaultAddForm(false);
    setVaultFormSections({ basic: true, pricing: false, status: false, extra: false });
  }

  function toggleVaultFormSection(section) {
    setVaultFormSections((current) => ({ ...current, [section]: !current[section] }));
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
      const now = new Date().toISOString();
      const catalogName = catalogForm.catalogType === "card"
        ? catalogForm.cardName || catalogForm.name
        : catalogForm.productName || catalogForm.name;
      const product = {
        id: editingCatalogId || makeId("catalog"),
        catalogType: catalogForm.catalogType || "sealed",
        name: catalogName,
        productName: catalogForm.catalogType === "sealed" ? catalogName : "",
        cardName: catalogForm.catalogType === "card" ? catalogName : "",
        pokemonName: catalogForm.pokemonName || "",
        category: catalogForm.category,
        setName: catalogForm.setName,
        productType: catalogForm.productType,
        barcode: catalogForm.barcode,
        sku: catalogForm.sku || "",
        marketSource: catalogForm.marketSource || "Manual",
        externalProductId: catalogForm.externalProductId,
        marketUrl: catalogForm.marketUrl,
        imageUrl: catalogForm.imageUrl,
        marketPrice: Number(catalogForm.marketPrice || catalogForm.marketValueNearMint || catalogForm.marketValueRaw || 0),
        lowPrice: Number(catalogForm.lowPrice || 0),
        midPrice: Number(catalogForm.midPrice || 0),
        highPrice: Number(catalogForm.highPrice || 0),
        msrpPrice: Number(catalogForm.msrpPrice || 0),
        setCode: catalogForm.setCode || "",
        expansion: catalogForm.expansion || "",
        productLine: catalogForm.productLine || "",
        series: catalogForm.productLine || "",
        releaseDate: catalogForm.releaseDate || "",
        releaseYear: catalogForm.releaseYear || "",
        packCount: Number(catalogForm.packCount || 0),
        cardNumber: catalogForm.cardNumber || "",
        rarity: catalogForm.rarity || "",
        variant: catalogForm.variant || "",
        condition: catalogForm.condition || "Near Mint",
        language: catalogForm.language || "English",
        graded: Boolean(catalogForm.graded),
        gradingCompany: catalogForm.gradingCompany || "",
        grade: catalogForm.grade || "",
        marketValueRaw: Number(catalogForm.marketValueRaw || 0),
        marketValueNearMint: Number(catalogForm.marketValueNearMint || catalogForm.marketPrice || 0),
        marketValueLightPlayed: Number(catalogForm.marketValueLightPlayed || 0),
        marketValueGraded: Number(catalogForm.marketValueGraded || 0),
        marketLastUpdated: catalogForm.marketLastUpdated || now,
        marketConfidenceLevel: catalogForm.marketConfidenceLevel || "Manual",
        sourceType: catalogForm.sourceType || "manual",
        notes: catalogForm.notes,
        createdAt: editingCatalogId
          ? catalogProducts.find((item) => item.id === editingCatalogId)?.createdAt || now
          : now,
        lastUpdated: now,
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
    catalogType: product.catalogType || "sealed",
    name: product.name,
    productName: product.productName || product.name || "",
    cardName: product.cardName || product.name || "",
    pokemonName: product.pokemonName || "",
    category: product.category,
    setName: product.setName,
    productType: product.productType,
    barcode: product.barcode,
    sku: product.sku || "",
    externalProductId: product.externalProductId,
    marketUrl: product.marketUrl,
    imageUrl: product.imageUrl,

    marketPrice: product.marketPrice,
    marketSource: product.marketSource || "Manual",
    marketLastUpdated: product.marketLastUpdated || product.lastUpdated || "",
    marketConfidenceLevel: product.marketConfidenceLevel || "Manual",
    sourceType: product.sourceType || "manual",
    lowPrice: product.lowPrice,
    midPrice: product.midPrice,
    highPrice: product.highPrice,

    msrpPrice: product.msrpPrice,
    setCode: product.setCode,
    expansion: product.expansion,
    productLine: product.productLine,
    releaseDate: product.releaseDate || "",
    releaseYear: product.releaseYear || "",
    packCount: product.packCount,
    cardNumber: product.cardNumber || "",
    rarity: product.rarity || "",
    variant: product.variant || "",
    condition: product.condition || "Near Mint",
    language: product.language || "English",
    graded: Boolean(product.graded),
    gradingCompany: product.gradingCompany || "",
    grade: product.grade || "",
    marketValueRaw: product.marketValueRaw || "",
    marketValueNearMint: product.marketValueNearMint || "",
    marketValueLightPlayed: product.marketValueLightPlayed || "",
    marketValueGraded: product.marketValueGraded || "",

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
  const marketInfo = getTideTradrMarketInfo(product);

  setItemForm((old) => ({
    ...old,
    catalogProductId: productId,

    name: product.name || "",
    category: product.category || "Pokemon",
    barcode: product.barcode || "",
    externalProductId: product.externalProductId || "",
    tideTradrUrl: product.marketUrl || "",
    itemImage: product.imageUrl || "",

    marketPrice: marketInfo.currentMarketValue || "",
    lowPrice: product.lowPrice || "",
    midPrice: product.midPrice || "",
    highPrice: product.highPrice || "",
    msrpPrice: product.msrpPrice || "",

    setCode: product.setCode || "",
    expansion: product.expansion || product.setName || "",
    productLine: product.productLine || "",
    productType: product.productType || "",
    packCount: product.packCount || "",

    unitCost: marketInfo.msrp || old.unitCost || "",
    salePrice: marketInfo.currentMarketValue || old.salePrice || "",
  }));
}

function getTideTradrMarketInfo(product = {}) {
  const msrp = toNumber(product.msrpPrice || product.msrp);
  const currentMarketValue = toNumber(
    product.marketPrice ||
      product.marketValue ||
      product.marketValueNearMint ||
      product.midPrice ||
      product.marketValueRaw ||
      product.highPrice ||
      product.lowPrice ||
      msrp
  );
  const sourceType = product.sourceType || (product.marketSource ? String(product.marketSource).toLowerCase() : "mock");
  const sourceName =
    product.marketSource ||
    (product.marketUrl ? "Manual market source link" : "") ||
    (product.marketPrice ? "Internal/manual catalog value" : "") ||
    (msrp ? "MSRP fallback" : "Manual fallback needed");
  const confidenceLevel = product.marketConfidenceLevel || (product.marketPrice || product.marketValueNearMint
    ? "Medium"
    : product.midPrice || product.lowPrice || product.highPrice
      ? "Low"
      : "Manual needed");
  const marketOverMsrp = msrp > 0 ? currentMarketValue - msrp : 0;
  const marketVsMsrpPercent = msrp > 0 ? (currentMarketValue / msrp) * 100 : 0;
  const savingsVsMsrp = msrp > 0 ? Math.max(msrp - currentMarketValue, 0) : 0;

  return {
    currentMarketValue,
    msrp,
    percentOfMarket: currentMarketValue > 0 ? 100 : 0,
    marketOverMsrp,
    marketVsMsrpPercent,
    savingsVsMsrp,
    lastUpdated: product.marketLastUpdated || product.lastUpdated || product.updatedAt || product.createdAt || "Local mock data",
    sourceName: sourceType === "live" ? `Live - ${sourceName}` : sourceType === "cached" ? `Cached - ${sourceName}` : sourceType === "manual" ? `Manual - ${sourceName}` : `Mock - ${sourceName}`,
    confidenceLevel,
  };
}

function selectTideTradrProduct(productId) {
  const product = catalogProducts.find((p) => String(p.id) === String(productId));
  setTideTradrLookupId(productId);
  if (!product) return;
  const marketInfo = getTideTradrMarketInfo(product);
  setDealForm((old) => ({
    ...old,
    productId,
    title: product.name || old.title,
    quantity: old.quantity || 1,
    marketTotal: marketInfo.currentMarketValue ? marketInfo.currentMarketValue * Number(old.quantity || 1) : old.marketTotal,
    retailTotal: marketInfo.msrp ? marketInfo.msrp * Number(old.quantity || 1) : old.retailTotal,
  }));
}

function addProductToTideTradrWatchlist(productId) {
  const product = catalogProducts.find((p) => String(p.id) === String(productId));
  if (!product) return;
  setTideTradrWatchlist((current) => {
    if (current.some((item) => String(item.productId) === String(productId))) return current;
    const marketInfo = getTideTradrMarketInfo(product);
    return [
      {
        id: makeId("watch"),
        productId: product.id,
        name: product.name,
        setName: product.setName || product.expansion || "",
        productType: product.productType || "",
        marketValue: marketInfo.currentMarketValue,
        msrp: marketInfo.msrp,
        sourceName: marketInfo.sourceName,
        lastUpdated: new Date().toISOString(),
      },
      ...current,
    ];
  });
}

function removeTideTradrWatchlistItem(id) {
  setTideTradrWatchlist((current) => current.filter((item) => item.id !== id));
}

function applyCatalogProductToVault(productId) {
  const product = catalogProducts.find((p) => String(p.id) === String(productId));
  if (!product) return;
  const marketInfo = getTideTradrMarketInfo(product);

  setVaultForm((old) => ({
    ...old,
    name: product.name || "",
    productType: product.catalogType === "card" ? "Individual Card" : product.productType || "",
    setName: product.expansion || product.setName || "",
    msrpPrice: marketInfo.msrp || "",
    marketPrice: marketInfo.currentMarketValue || "",
    salePrice: marketInfo.currentMarketValue || "",
    packCount: product.packCount || "",
    itemImage: product.imageUrl || "",
  }));
  setShowVaultAddForm(true);
  setVaultFormSections((current) => ({ ...current, basic: true, pricing: true }));
  setActiveTab("vault");
}

function useCatalogProductInDeal(productId) {
  const product = catalogProducts.find((p) => String(p.id) === String(productId));
  if (!product) return;
  const marketInfo = getTideTradrMarketInfo(product);

  setDealForm((old) => ({
    ...old,
    productId,
    title: product.name || old.title,
    quantity: old.quantity || 1,
    marketTotal: marketInfo.currentMarketValue ? marketInfo.currentMarketValue * Number(old.quantity || 1) : old.marketTotal,
    retailTotal: marketInfo.msrp ? marketInfo.msrp * Number(old.quantity || 1) : old.retailTotal,
    notes: [old.notes, product.marketUrl ? `Market source: ${product.marketUrl}` : ""].filter(Boolean).join(" | "),
  }));
  setTideTradrLookupId(productId);
  setActiveTab("market");
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
  const homeStatsProfile = { userType, homeStatsEnabled };
  const dashboardStats = [
    { key: "collection_value", label: "Collection Value", value: money(vaultValue) },
    { key: "monthly_spending", label: "Monthly Spending", value: money(monthlySpending) },
    { key: "forge_inventory_value", label: "Forge Inventory Value", value: money(totalMsrpValue) },
    { key: "market_value", label: "Market Value", value: money(totalMarketValue) },
    { key: "monthly_profit_loss", label: "Monthly Profit/Loss", value: money(monthlyProfitLoss) },
    { key: "market_roi", label: "Market ROI", value: `${marketRoiPercent.toFixed(1)}%` },
    { key: "planned_roi", label: "Planned ROI", value: `${plannedRoiPercent.toFixed(1)}%` },
    { key: "market_vs_msrp_percent", label: "Market vs MSRP %", value: `${msrpRoiPercent.toFixed(1)}%` },
    { key: "market_over_msrp", label: "Market Over MSRP", value: money(profitOverMsrp) },
    { key: "savings_vs_msrp", label: "Savings vs MSRP", value: money(savingsAgainstMsrp) },
    { key: "forge_planned_sales", label: "Forge Planned Sales", value: money(totalPotentialSales) },
    { key: "planned_profit", label: "Planned Profit", value: money(estimatedProfit) },
    { key: "forge_sales_revenue", label: "Forge Sales Revenue", value: money(totalSalesRevenue) },
    { key: "forge_profit", label: "Forge Profit", value: money(totalSalesProfit) },
    { key: "expenses", label: "Expenses", value: money(totalExpenses) },
    { key: "profit_after_expenses", label: "Profit After Expenses", value: money(estimatedProfitAfterExpenses) },
    { key: "items_sold", label: "Items Sold", value: totalItemsSold },
    { key: "business_miles", label: "Business Miles", value: totalBusinessMiles.toFixed(1) },
    { key: "total_vehicle_cost", label: "Total Vehicle Cost", value: money(totalVehicleCost) },
  ];
  const dashboardProfile = { dashboardPreset, dashboardLayout };
  const planProfile = subscriptionProfile;
  const currentPlan = getUserPlan(planProfile);
  const currentTier = getUserTier(planProfile);
  const paidUser = isPaidUser(planProfile);
  const adminUser = isAdminUser(planProfile);
  const featureAllowed = (featureKey) => hasPlanAccess(planProfile, featureKey);
  const paidStatLocked = (statKey) => PAID_HOME_STATS.includes(statKey) && !featureAllowed("seller_tools");
  const visibleDashboardStats = dashboardStats.filter((stat) => isHomeStatEnabled(homeStatsProfile, stat.key) && !paidStatLocked(stat.key));
  const normalizedDashboardLayout = normalizeDashboardLayout(dashboardLayout, dashboardPreset);
  const dashboardSectionState = (key) =>
    normalizedDashboardLayout.sections.find((section) => section.key === key) || { key, enabled: false, order: 100, collapsed: false };
  const dashboardSectionFeature = (key) => ({
    recent_sales: "seller_tools",
    store_reports: "restock_predictions",
    restock_calendar: "restock_predictions",
    watchlist: "alerts_advanced",
    alerts: "alerts_advanced",
    mileage_summary: "mileage",
    expenses_summary: "expenses",
    action_center: "seller_tools",
    purchaser_spending: "seller_tools",
    exports: "seller_tools",
  })[key];
  const dashboardSectionEnabled = (key) => {
    const featureKey = dashboardSectionFeature(key);
    return isDashboardSectionEnabled(dashboardProfile, key) && (!featureKey || featureAllowed(featureKey));
  };
  const activeTabFeature = {
    sales: "seller_tools",
    addSale: "seller_tools",
    expenses: "expenses",
    vehicles: "mileage",
    mileage: "mileage",
    reports: "seller_tools",
  }[activeTab];
  const activeTabLocked = activeTabFeature && !featureAllowed(activeTabFeature);
  const dashboardSectionStyle = (key) => ({ order: dashboardSectionState(key).order });
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
  const scoutLastUpdated = scoutSnapshot.reports[0]?.createdAt || scoutSnapshot.reports[0]?.created_at || locationSettings.lastUpdated || "Local beta data";
  const scoutRecommendationCards = [
    { title: "Best nearby store to check now", value: scoutSnapshot.stores[0]?.name || "Add or import nearby stores", note: locationSettings.manualLocation || locationSettings.selectedSavedLocation || "Set a ZIP/city for local picks" },
    { title: "Possible restock today", value: scoutSnapshot.reports.length ? `${scoutSnapshot.reports.length} recent reports` : "No local pattern yet", note: "Uses reports, tips, and usual stock days later" },
    { title: "High-confidence tip nearby", value: scoutSnapshot.reports.find((report) => report.verified)?.itemName || "No verified nearby tip", note: "Last updated: " + scoutLastUpdated },
    { title: "Best deal near you", value: dealForm.title || "Run a deal check", note: "Uses local sightings and market data later" },
    { title: "Online drop alert", value: "Watching disabled", note: "Alert-only structure; no checkout automation" },
    { title: "Route suggestion", value: scoutSnapshot.stores.slice(0, 3).map((store) => store.name).join(" -> ") || "Save stores to build a route", note: "Manual route builder first" },
  ];
  const scoutLiveUpdates = [
    { label: "Restock reports", value: scoutSnapshot.reports.length ? `${scoutSnapshot.reports.length} local reports` : "No reports yet", updatedAt: scoutLastUpdated },
    { label: "Scout Tips", value: scoutSnapshot.reports.filter((report) => String(report.reportType || report.report_type || "").includes("tip")).length || "None yet", updatedAt: scoutLastUpdated },
    { label: "Product sightings", value: scoutSnapshot.reports.find((report) => report.itemName || report.product_name)?.itemName || "No sightings yet", updatedAt: scoutLastUpdated },
    { label: "Online drops", value: "Local mock status", updatedAt: locationSettings.lastUpdated || "Not configured" },
    { label: "Price changes", value: recentMarketUpdates[0]?.name || "No catalog changes", updatedAt: recentMarketUpdates[0]?.createdAt || "Local catalog" },
    { label: "Store limit changes", value: scoutSnapshot.stores.find((store) => store.limitPolicy || store.limit_policy)?.limitPolicy || "No limits logged", updatedAt: scoutLastUpdated },
  ];
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
  const dealQuantity = Math.max(1, Number(dealForm.quantity || 1));
  const selectedDealProduct = catalogProducts.find((product) => String(product.id) === String(dealForm.productId || tideTradrLookupId));
  const tideTradrLookupProduct =
    catalogProducts.find((product) => String(product.id) === String(tideTradrLookupId)) ||
    selectedDealProduct ||
    catalogProducts[0];
  const tideTradrMarketInfo = getTideTradrMarketInfo(tideTradrLookupProduct || {});
  const dealMarketTotal = Number(dealForm.marketTotal || 0);
  const dealRetailTotal = Number(dealForm.retailTotal || 0);
  const dealPercentOfMarket = dealMarketTotal > 0 ? (dealAskingPrice / dealMarketTotal) * 100 : 0;
  const dealPercentOfRetail = dealRetailTotal > 0 ? (dealAskingPrice / dealRetailTotal) * 100 : 0;
  const dealPotentialProfit = dealMarketTotal - dealAskingPrice;
  const dealRoi = dealAskingPrice > 0 ? (dealPotentialProfit / dealAskingPrice) * 100 : 0;
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
  const dealRecommendation =
    !dealAskingPrice || !dealMarketTotal
      ? "Enter product and asking price"
      : dealPercentOfMarket <= 80 && dealRoi >= 20
        ? "Buy"
        : dealPercentOfMarket <= 95
          ? "Maybe"
          : "Pass";
  const dealRecommendationReason =
    dealRecommendation === "Buy"
      ? "Asking price is comfortably below TideTradr market and leaves useful upside."
      : dealRecommendation === "Maybe"
        ? "Price is close enough to market that condition, taxes, fees, and personal goals matter."
        : dealRecommendation === "Pass"
          ? "Asking price is too close to or above market for a clean beta recommendation."
          : "Choose a TideTradr product or enter market totals to calculate a recommendation.";

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
    const marketInfo = getTideTradrMarketInfo(product);
    const owned = items.some((item) => String(item.catalogProductId || "") === String(product.id));
    const watched = tideTradrWatchlist.some((item) => String(item.productId || "") === String(product.id));
    const matchesSearch =
      String(product.name || "").toLowerCase().includes(search) ||
      String(product.productName || "").toLowerCase().includes(search) ||
      String(product.cardName || "").toLowerCase().includes(search) ||
      String(product.pokemonName || "").toLowerCase().includes(search) ||
      String(product.category || "").toLowerCase().includes(search) ||
      String(product.setName || "").toLowerCase().includes(search) ||
      String(product.productType || "").toLowerCase().includes(search) ||
      String(product.expansion || "").toLowerCase().includes(search) ||
      String(product.productLine || "").toLowerCase().includes(search) ||
      String(product.rarity || "").toLowerCase().includes(search) ||
      String(product.variant || "").toLowerCase().includes(search) ||
      String(product.cardNumber || "").toLowerCase().includes(search) ||
      String(product.sku || "").toLowerCase().includes(search) ||
      String(product.releaseYear || "").toLowerCase().includes(search) ||
      String(product.barcode || "").toLowerCase().includes(search);

    const matchesKind = catalogKindFilter === "All" || product.catalogType === catalogKindFilter;
    const matchesSet = catalogSetFilter === "All" || product.setName === catalogSetFilter || product.expansion === catalogSetFilter;
    const matchesType = catalogTypeFilter === "All" || product.productType === catalogTypeFilter;
    const matchesEra = catalogEraFilter === "All" || product.productLine === catalogEraFilter;
    const matchesYear = catalogYearFilter === "All" || String(product.releaseYear || "") === catalogYearFilter;
    const matchesRarity = catalogRarityFilter === "All" || product.rarity === catalogRarityFilter;
    const matchesVariant = catalogVariantFilter === "All" || product.variant === catalogVariantFilter;
    const matchesCondition = catalogConditionFilter === "All" || product.condition === catalogConditionFilter;
    const matchesGraded =
      catalogGradedFilter === "All" ||
      (catalogGradedFilter === "Graded" && product.graded) ||
      (catalogGradedFilter === "Ungraded" && !product.graded);
    const matchesOwned =
      catalogOwnedFilter === "All" ||
      (catalogOwnedFilter === "Owned" && owned) ||
      (catalogOwnedFilter === "Not owned" && !owned);
    const matchesWatchlist =
      catalogWatchlistFilter === "All" ||
      (catalogWatchlistFilter === "Watchlist" && watched) ||
      (catalogWatchlistFilter === "Not watched" && !watched);
    const minValue = catalogMinValue === "" ? 0 : Number(catalogMinValue || 0);
    const maxValue = catalogMaxValue === "" ? Infinity : Number(catalogMaxValue || 0);
    const matchesValue = marketInfo.currentMarketValue >= minValue && marketInfo.currentMarketValue <= maxValue;

    return matchesSearch && matchesKind && matchesSet && matchesType && matchesEra && matchesYear && matchesRarity && matchesVariant && matchesCondition && matchesGraded && matchesOwned && matchesWatchlist && matchesValue;
  });
  const catalogSetOptions = ["All", ...new Set(catalogProducts.map((product) => product.setName || product.expansion).filter(Boolean))].sort();
  const catalogTypeOptions = ["All", ...new Set([...SEALED_PRODUCT_TYPES, ...catalogProducts.map((product) => product.productType).filter(Boolean)])].sort();
  const catalogEraOptions = ["All", ...new Set(catalogProducts.map((product) => product.productLine).filter(Boolean))].sort();
  const catalogYearOptions = ["All", ...new Set(catalogProducts.map((product) => String(product.releaseYear || "")).filter(Boolean))].sort();
  const catalogRarityOptions = ["All", ...new Set(catalogProducts.map((product) => product.rarity).filter(Boolean))].sort();
  const catalogVariantOptions = ["All", ...new Set(catalogProducts.map((product) => product.variant).filter(Boolean))].sort();
  const catalogConditionOptions = ["All", ...new Set(catalogProducts.map((product) => product.condition).filter(Boolean))].sort();
  const sealedCatalogCount = catalogProducts.filter((product) => product.catalogType !== "card").length;
  const cardCatalogCount = catalogProducts.filter((product) => product.catalogType === "card").length;

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

    <div className={`${showTopbarActions ? "topbar topbar-actions-visible" : "topbar topbar-actions-hidden"} ${showFullTopbar ? "topbar-full" : "topbar-compact"} ${searchExpanded ? "topbar-search-open" : ""}`}>
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

  <button type="button" className="topbar-market-link" onClick={() => setActiveTab("market")}>
    TideTradr
  </button>

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

  </div>

  <div className={searchExpanded ? "app-search expanded" : "app-search"}>
    <button
      type="button"
      className="app-search-toggle"
      aria-label="Search E&T TCG"
      onClick={() => setSearchExpanded((current) => !current)}
    >
      Search
    </button>
    <input
      value={appSearchQuery}
      onFocus={() => setSearchExpanded(true)}
      onChange={(event) => {
        setAppSearchQuery(event.target.value);
        setSearchExpanded(true);
      }}
      placeholder="Search products, cards, stores..."
      aria-label="Search across E&T TCG"
    />
    {searchExpanded && appSearchQuery.trim().length >= 2 ? (
      <div className="app-search-results">
        <div className="compact-card-header">
          <div>
            <h3>Search results</h3>
            <p>{appSearchResults.length} matches across E&T TCG</p>
          </div>
          <button type="button" className="secondary-button" onClick={closeSearchResults}>Close</button>
        </div>
        {appSearchResults.length === 0 ? (
          <p className="compact-subtitle">No matches yet. Try a product, card, store, report, or UPC.</p>
        ) : (
          <div className="app-search-list">
            {appSearchResults.map((result) => (
              <div className="app-search-result" key={result.id}>
                <button type="button" className="app-search-result-main" onClick={() => viewSearchResult(result)}>
                  <span>{result.category}</span>
                  <strong>{result.title}</strong>
                  <small>{result.subtitle}</small>
                </button>
                <div className="app-search-actions">
                  {renderSearchActions(result)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ) : null}
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
              <div><p>E&T TCG</p><h3>Menu</h3></div>
              <button type="button" className="secondary-button" onClick={() => setMenuOpen(false)}>Close</button>
            </div>
            <div className="drawer-menu-stack">
              {renderMenuPullDown("go_to", "Go To", "Home, Forge, Scout, Vault, and TideTradr", (
                <div className="drawer-links">
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("dashboard"))}>Home</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("inventory"))}>Forge</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("scout"))}>Scout</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("vault"))}>Vault</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("market"))}>TideTradr</button>
                </div>
              ))}
              {renderMenuPullDown("profile", "Profile", "User Profile, My Scout Score, Saved Location, and Account Info", (
                <div className="drawer-links">
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("dashboard"))}>User Profile</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setActiveTab("scout"); setFeatureSectionsOpen((current) => ({ ...current, scout_score_rewards: true })); })}>My Scout Score</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setActiveTab("scout"); setFeatureSectionsOpen((current) => ({ ...current, scout_location_options: true })); })}>Saved Location</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("dashboard"))}>Account Info</button>
                </div>
              ))}
              {renderMenuPullDown("app_settings", "App Settings", "Appearance, dashboard display, default Home view, labels, and compact mode", (
                <div className="drawer-links">
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("dashboard"))}>Appearance/Theme</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setActiveTab("dashboard"); setFeatureSectionsOpen((current) => ({ ...current, home_display_settings: true })); })}>Dashboard Display Settings</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("dashboard"))}>Default Home View</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("dashboard"))}>Mock/Coming Soon Labels</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setDashboardCardStyle(dashboardCardStyle === "compact" ? "comfortable" : "compact"))}>Compact Mode</button>
                </div>
              ))}
              {renderMenuPullDown("location_alerts", "Location & Alerts", "Location settings, manual ZIP/city, alert radius, notifications, and quiet hours", (
                <div className="drawer-links">
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setActiveTab("scout"); setFeatureSectionsOpen((current) => ({ ...current, scout_location_options: true })); })}>Location Settings</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setActiveTab("scout"); setFeatureSectionsOpen((current) => ({ ...current, scout_location_options: true })); })}>Manual ZIP/City</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(enableLocationTracking)}>Allow Location While Using App</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setActiveTab("scout"); setFeatureSectionsOpen((current) => ({ ...current, scout_alerts: true })); })}>Alert Radius</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setActiveTab("scout"); setFeatureSectionsOpen((current) => ({ ...current, scout_alerts: true })); })}>Notification Settings</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setActiveTab("scout"); setFeatureSectionsOpen((current) => ({ ...current, scout_alerts: true })); })}>Quiet Hours</button>
                </div>
              ))}
              {renderMenuPullDown("data", "Data", "Import Inventory, Export Data, Import Collection, and Clear Mock Data", (
                <div className="drawer-links">
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openInventoryImportAssistant("Forge"))}>Import Inventory</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(downloadBackup)}>Export Data</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openInventoryImportAssistant("Vault"))}>Import Collection</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(resetBetaLocalData)}>Clear Mock Data</button>
                </div>
              ))}
              {renderMenuPullDown("tidetradr_settings", "TideTradr Settings", "Market sources, manual/cached/mock values, watchlist, and pinned market watch", (
                <div className="drawer-links">
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("market"))}>Market Sources</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setActiveTab("market"); setFeatureSectionsOpen((current) => ({ ...current, market_sources: true })); })}>Manual/Cached/Mock Values</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setActiveTab("market"); setFeatureSectionsOpen((current) => ({ ...current, market_watchlist: true })); })}>Watchlist Settings</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setActiveTab("market"); setFeatureSectionsOpen((current) => ({ ...current, market_watchlist: true })); })}>Pinned Market Watch Settings</button>
                </div>
              ))}
              {renderMenuPullDown("community", "Community", "Help, Discord placeholder, and report guidelines", (
                <div className="drawer-links">
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("dashboard"))}>Help / Feedback</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("dashboard"))}>Join Discord Community</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("dashboard"))}>Discord Coming Soon / Invite Placeholder</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setActiveTab("scout"); setFeatureSectionsOpen((current) => ({ ...current, scout_score_rewards: true, scout_store_tracker: true })); })}>Report Guidelines</button>
                </div>
              ))}
              {renderMenuPullDown("subscription", "Subscription Placeholder", "Paid plan, free vs paid preview, and trusted Scout earned access", (
                <div className="drawer-links">
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("dashboard"))}>Paid Plan / Upgrade Coming Soon</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("dashboard"))}>Free vs Paid Feature Preview</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setActiveTab("scout"); setFeatureSectionsOpen((current) => ({ ...current, scout_score_rewards: true })); })}>Trusted Scout Earned Access Info</button>
                </div>
              ))}
              {renderMenuPullDown("account", "Account", "Log Out", (
                <div className="drawer-links">
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(signOut)}>Log Out</button>
                </div>
              ))}
            </div>
          </aside>
        </>
      ) : null}

      <main className={`main dashboard-card-style-${dashboardCardStyle}`}>
        {activeTabLocked ? (
          <UpgradeScreen featureKey={activeTabFeature} onBack={() => setActiveTab("dashboard")} />
        ) : null}
        {!activeTabLocked && activeTab === "dashboard" && (
          <div className="dashboard-layout">
            <section className="tab-summary panel">
              <div>
                <h2>Home</h2>
                <p>Your dashboard, quick actions, monthly numbers, and display settings.</p>
              </div>
              <div className="summary-pill-row">
                <span>{visibleDashboardStats.length} stats on</span>
                <span>{dashboardPreset} layout</span>
              </div>
            </section>
            <section className="feature-dropdown-stack">
            <CollapsibleFeatureSection
                title="Dashboard"
                summary="Dashboard cards, monthly summary, profit/loss, collection value, and Scout activity"
                open={isFeatureSectionOpen("home_dashboard_cards")}
                onToggle={() => toggleFeatureSection("home_dashboard_cards")}
              >
            {dashboardSectionEnabled("home_stats") ? (
            <section className="cards dashboard-section" style={dashboardSectionStyle("home_stats")}>
              {visibleDashboardStats.length === 0 ? (
                <div className="card">
                  <p>Home Page Stats</p>
                  <h2>Hidden</h2>
                </div>
              ) : (
                visibleDashboardStats.map((stat) => (
                  <div className="card" key={stat.key}>
                    <p>{stat.label}</p>
                    <h2>{stat.value}</h2>
                  </div>
                ))
              )}
              {!featureAllowed("restock_predictions") ? (
                <LockedFeatureCard featureKey="restock_predictions" onUpgrade={() => setActiveTab("dashboard")} />
              ) : null}
              {!featureAllowed("seller_tools") ? (
                <LockedFeatureCard featureKey="seller_tools" onUpgrade={() => setActiveTab("dashboard")} />
              ) : null}
            </section>
            ) : null}
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection
                title="Quick Actions"
                summary="Add Forge item, Add Vault item, Submit Scout Report, Check Deal, and Search Catalog"
                open={isFeatureSectionOpen("home_quick_actions")}
                onToggle={() => toggleFeatureSection("home_quick_actions")}
              >
            {dashboardSectionEnabled("quick_actions") ? (
            <section className="panel dashboard-section" style={dashboardSectionStyle("quick_actions")}>
              <h2>Quick Actions</h2>
              <div className="quick-actions">
                <button type="button" onClick={() => setActiveTab("addInventory")}>Add Forge Item</button>
                <button type="button" onClick={() => { setActiveTab("vault"); setFeatureSectionsOpen((current) => ({ ...current, vault_add: true })); }}>Add Vault Item</button>
                <button type="button" onClick={beginScanProduct}>Scan Product</button>
                <button type="button" onClick={() => setActiveTab("market")}>Check Deal</button>
                <button type="button" onClick={() => { setActiveTab("scout"); setFeatureSectionsOpen((current) => ({ ...current, scout_submit_report: true, scout_store_tracker: true })); }}>Submit Scout Report</button>
                <button type="button" onClick={() => setActiveTab("catalog")}>Search Catalog</button>
                <button type="button" className="secondary-button" onClick={() => openInventoryImportAssistant("Forge")}>Import Inventory</button>
                <button type="button" onClick={() => setActiveTab("scout")}>Upload Tip Screenshot</button>
              </div>
            </section>
            ) : null}
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection title="TideTradr" summary="Product lookup, market info, deal checks, and watchlist" open={isFeatureSectionOpen("home_tidetradr")} onToggle={() => toggleFeatureSection("home_tidetradr")}>
                <div className="cards mini-cards">
                  <div className="card"><p>Catalog</p><h2>{catalogProducts.length}</h2></div>
                  <div className="card"><p>Watchlist</p><h2>{tideTradrWatchlist.length}</h2></div>
                  <div className="card"><p>Market Value</p><h2>{money(totalMarketValue)}</h2></div>
                </div>
                <div className="quick-actions">
                  <button type="button" onClick={() => setActiveTab("market")}>Open TideTradr</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("catalog")}>Search Catalog</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("market")}>Check Deal</button>
                </div>
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection
                title="Monthly Summary"
                summary="Purchaser spending and recent activity"
                open={isFeatureSectionOpen("home_monthly_summary")}
                onToggle={() => toggleFeatureSection("home_monthly_summary")}
              >
                <div className="quick-actions">
                  <button type="button" onClick={() => setActiveTab("inventory")}>View Forge</button>
                  <button type="button" onClick={() => setActiveTab("vault")}>View Vault</button>
                </div>
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection
                title="Profit/Loss Overview"
                summary="Paid Forge metrics and seller summaries"
                open={isFeatureSectionOpen("home_profit_loss")}
                onToggle={() => toggleFeatureSection("home_profit_loss")}
              >
                <div className="cards mini-cards">
                  <div className="card"><p>Monthly Profit/Loss</p><h2>{money(monthlyProfitLoss)}</h2></div>
                  <div className="card"><p>Expenses</p><h2>{money(totalExpenses)}</h2></div>
                </div>
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection
                title="Display Settings"
                summary="Toggle dashboard cards, choose the default Home view, and show or hide beta cards"
                open={isFeatureSectionOpen("home_display_settings")}
                onToggle={() => toggleFeatureSection("home_display_settings")}
              >
            <section className="panel dashboard-section" style={dashboardSectionStyle("settings")}>
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
            {["catalog_shortcut", "deal_checker", "wishlist", "nearby_stores", "mileage_summary", "expenses_summary", "people_wishlists"].some(dashboardSectionEnabled) ? (
            <section className="home-grid dashboard-section" style={dashboardSectionStyle("catalog_shortcut")}>
              {dashboardSectionEnabled("catalog_shortcut") ? (
                <div className="panel" style={dashboardSectionStyle("catalog_shortcut")}>
                  <h2>Catalog Search</h2>
                  <div className="home-callout">
                    <p>Search the shared Pokemon product catalog and add known products to The Forge.</p>
                    <button type="button" onClick={() => setActiveTab("catalog")}>Open Catalog</button>
                  </div>
                </div>
              ) : null}
              {dashboardSectionEnabled("deal_checker") ? (
                <div className="panel" style={dashboardSectionStyle("deal_checker")}>
                  <h2>Deal Checker</h2>
                  <div className="home-callout">
                    <p>Run TideTradr before buying so collectors and parents can avoid overpaying.</p>
                    <button type="button" onClick={() => setActiveTab("market")}>Check Deal</button>
                  </div>
                </div>
              ) : null}
              {dashboardSectionEnabled("wishlist") || dashboardSectionEnabled("people_wishlists") ? (
                <div className="panel" style={dashboardSectionStyle(dashboardSectionEnabled("wishlist") ? "wishlist" : "people_wishlists")}>
                  <h2>{dashboardSectionEnabled("people_wishlists") ? "Wishlists by Person" : "Wishlist"}</h2>
                  <div className="home-list">
                    {vaultItems.filter((item) => String(item.actionNotes || "").toLowerCase().includes("wish")).slice(0, 5).map((item) => (
                      <button type="button" className="home-list-row" key={item.id} onClick={() => setActiveTab("vault")}>
                        <span><strong>{item.name}</strong><small>{item.productType || "Vault item"}</small></span>
                        <b>{money(item.marketPrice)}</b>
                      </button>
                    ))}
                    {vaultItems.filter((item) => String(item.actionNotes || "").toLowerCase().includes("wish")).length === 0 ? <p>No wishlist items yet.</p> : null}
                  </div>
                </div>
              ) : null}
              {dashboardSectionEnabled("nearby_stores") ? (
                <div className="panel" style={dashboardSectionStyle("nearby_stores")}>
                  <h2>Nearby Stores</h2>
                  <div className="home-callout">
                    <p>Use Scout to find shared Virginia stores and submit restock reports.</p>
                    <button type="button" onClick={() => setActiveTab("scout")}>Open Scout</button>
                  </div>
                </div>
              ) : null}
              {dashboardSectionEnabled("expenses_summary") ? (
                <div className="panel" style={dashboardSectionStyle("expenses_summary")}>
                  <h2>Expenses Summary</h2>
                  <div className="cards mini-cards">
                    <div className="card"><p>Expenses</p><h2>{money(totalExpenses)}</h2></div>
                    <div className="card"><p>After Expenses</p><h2>{money(estimatedProfitAfterExpenses)}</h2></div>
                  </div>
                </div>
              ) : null}
              {dashboardSectionEnabled("mileage_summary") ? (
                <div className="panel" style={dashboardSectionStyle("mileage_summary")}>
                  <h2>Mileage Summary</h2>
                  <div className="cards mini-cards">
                    <div className="card"><p>Business Miles</p><h2>{totalBusinessMiles.toFixed(1)}</h2></div>
                    <div className="card"><p>Vehicle Cost</p><h2>{money(totalVehicleCost)}</h2></div>
                  </div>
                </div>
              ) : null}
            </section>
            ) : null}
            <section className="panel dashboard-section" style={dashboardSectionStyle("settings")}>
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
                <h3>Plan & Access</h3>
                <p>User type controls the app experience. Subscription plan controls what features are unlocked.</p>
                <div className="cards mini-cards">
                  <div className="card"><p>Current Tier</p><h2>{TIER_LABELS[currentTier] || currentPlan}</h2></div>
                  <div className="card"><p>Status</p><h2>{subscriptionProfile.subscriptionStatus || "active"}</h2></div>
                  <div className="card"><p>Lifetime Access</p><h2>{subscriptionProfile.lifetimeAccess ? "Yes" : "No"}</h2></div>
                </div>
                <div className="quick-actions">
                  <button type="button" disabled>Upgrade to Paid</button>
                  <button type="button" className="secondary-button" disabled>Manage Subscription</button>
                </div>
                <div className="settings-groups">
                  <div className="settings-group">
                    <h4>Unlocked</h4>
                    <div className="toggle-list">
                      {Object.keys(FEATURE_ACCESS).filter((featureKey) => featureAllowed(featureKey)).map((featureKey) => (
                        <p className="compact-subtitle" key={featureKey}>{FEATURE_LABELS[featureKey] || featureKey}</p>
                      ))}
                    </div>
                  </div>
                  <div className="settings-group">
                    <h4>Locked</h4>
                    <div className="toggle-list">
                      {Object.keys(FEATURE_ACCESS).filter((featureKey) => !featureAllowed(featureKey)).map((featureKey) => (
                        <p className="compact-subtitle" key={featureKey}>Lock {FEATURE_LABELS[featureKey] || featureKey}</p>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="compact-subtitle">
                  {adminUser ? "Admin tools unlocked." : paidUser ? "Paid features unlocked." : "Free plan: advanced Scout, alerts, seller tools, mileage, expenses, and admin tools stay locked."}
                </p>
              </div>

              <div className="settings-subsection">
                <h3>Dashboard Layout</h3>
                <p>Pick a preset, choose a card density, and decide which Home sections show first.</p>
                <div className="settings-toolbar">
                  <Field label="Dashboard Preset">
                    <select value={dashboardPreset} onChange={(event) => updateDashboardPreset(event.target.value)}>
                      {DASHBOARD_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>
                          {preset === "parent" ? "Parent / Kid-Focused" : preset.charAt(0).toUpperCase() + preset.slice(1)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Card Style">
                    <select value={dashboardCardStyle} onChange={(event) => updateDashboardCardStyle(event.target.value)}>
                      {DASHBOARD_CARD_STYLES.map((style) => (
                        <option key={style} value={style}>
                          {style.charAt(0).toUpperCase() + style.slice(1)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button type="button" className="secondary-button" onClick={() => resetDashboardLayoutForPreset(dashboardPreset)}>
                    Reset Layout
                  </button>
                </div>

                <div className="dashboard-layout-list">
                  {normalizedDashboardLayout.sections.map((section, index) => {
                    const meta = DASHBOARD_SECTIONS.find((candidate) => candidate.key === section.key);
                    if (!meta) return null;
                    const featureKey = dashboardSectionFeature(section.key);
                    const lockedByPlan = featureKey && !featureAllowed(featureKey);
                    return (
                      <div className="dashboard-layout-row" key={section.key}>
                        <label className="toggle-row">
                          <span>{lockedByPlan ? `Lock ${meta.label} - Paid` : meta.label}</span>
                          <input
                            type="checkbox"
                            checked={section.enabled && !lockedByPlan}
                            disabled={meta.locked || lockedByPlan}
                            onChange={(event) => updateDashboardSection(section.key, { enabled: event.target.checked })}
                          />
                        </label>
                        <div className="dashboard-layout-actions">
                          <button type="button" className="secondary-button" disabled={index === 0} onClick={() => moveDashboardSection(section.key, -1)}>
                            Up
                          </button>
                          <button type="button" className="secondary-button" disabled={index === normalizedDashboardLayout.sections.length - 1} onClick={() => moveDashboardSection(section.key, 1)}>
                            Down
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="settings-subsection">
                <h3>Home Page Stats</h3>
                <p>Choose exactly which dashboard stat cards show on Home. This only changes visibility, not the underlying data.</p>
                <div className="settings-toolbar">
                  <Field label="User Type">
                    <select value={userType} onChange={(event) => updateUserType(event.target.value)}>
                      {USER_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button type="button" className="secondary-button" onClick={() => setAllHomeStats(true)}>
                    Toggle All On
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setAllHomeStats(false)}>
                    Toggle All Off
                  </button>
                  <button type="button" className="secondary-button" onClick={() => resetHomeStatsForUserType(userType)}>
                    Reset Recommended
                  </button>
                </div>

                <div className="settings-groups">
                  {HOME_STAT_GROUPS.map((group) => (
                    <div className="settings-group" key={group}>
                      <h4>{group}</h4>
                      <div className="toggle-list">
                        {HOME_STATS.filter((stat) => stat.group === group).map((stat) => (
                          <label className="toggle-row" key={stat.key}>
                            <span>{paidStatLocked(stat.key) ? `Lock ${stat.label} - Paid` : stat.label}</span>
                            <input
                              type="checkbox"
                              checked={homeStatsEnabled[stat.key] !== false && !paidStatLocked(stat.key)}
                              disabled={paidStatLocked(stat.key)}
                              onChange={(event) => updateHomeStatsEnabled({ [stat.key]: event.target.checked })}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
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
              </CollapsibleFeatureSection>
            </section>
            <section className="home-grid dashboard-section" style={dashboardSectionStyle("recent_inventory")}>
              {dashboardSectionEnabled("recent_inventory") ? (
              <div className="panel" style={dashboardSectionStyle("recent_inventory")}>
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
              ) : null}

              {dashboardSectionEnabled("recent_sales") ? (
              <div className="panel" style={dashboardSectionStyle("recent_sales")}>
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
              ) : null}

              {dashboardSectionEnabled("market_summary") ? (
              <div className="panel" style={dashboardSectionStyle("market_summary")}>
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
              ) : null}

              {dashboardSectionEnabled("store_reports") ? (
              <div className="panel" style={dashboardSectionStyle("store_reports")}>
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
              ) : null}

              {dashboardSectionEnabled("restock_calendar") ? (
              <div className="panel" style={dashboardSectionStyle("restock_calendar")}>
                <h2>Upcoming Restocks</h2>
                <div className="home-callout">
                  <p>Prediction cards will come from Scout store history: usual truck days, stock days, last restock, and verified reports.</p>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("scout")}>Review Stores</button>
                </div>
              </div>
              ) : null}

              {dashboardSectionEnabled("watchlist") ? (
              <div className="panel" style={dashboardSectionStyle("watchlist")}>
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
              ) : null}

              {dashboardSectionEnabled("pack_it_forward") ? (
              <div className="panel" style={dashboardSectionStyle("pack_it_forward")}>
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
              ) : null}

              {dashboardSectionEnabled("alerts") ? (
              <div className="panel" style={dashboardSectionStyle("alerts")}>
                <h2>Alerts Preview</h2>
                <div className="home-alerts">
                  <span>{needsPhotosItems.length} need photos</span>
                  <span>{needsMarketCheckItems.length} need market checks</span>
                  <span>{readyToListItems.length} ready to list</span>
                </div>
              </div>
              ) : null}
            </section>
            {dashboardSectionEnabled("action_center") ? (
            <section className="panel dashboard-section" style={dashboardSectionStyle("action_center")}>
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
            ) : null}
            {dashboardSectionEnabled("purchaser_spending") ? (
            <section className="panel dashboard-section" style={dashboardSectionStyle("purchaser_spending")}>
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
            ) : null}
            {dashboardSectionEnabled("exports") ? (
            <section className="panel dashboard-section" style={dashboardSectionStyle("exports")}>
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
            ) : null}
          </div>
        )}

        {activeTab === "vault" && (
          <>
            <section className="tab-summary panel">
              <div>
                <h2>Vault</h2>
                <p>Collection, held items, personal collection, and Vault settings.</p>
              </div>
              <div className="summary-pill-row">
                <span>{vaultItems.length} items</span>
                <span>{money(vaultValue)}</span>
              </div>
            </section>
            <section className="feature-dropdown-stack">
            <CollapsibleFeatureSection title="Vault Summary" summary="Items, value, personal collection, and held counts" open={isFeatureSectionOpen("vault_summary")} onToggle={() => toggleFeatureSection("vault_summary")}>
            <section className="panel vault-overview-panel">
              <h2>The Vault</h2>
              <p>
                Collector mode for personal collection, keep sealed, rip later, trade, favorites, and wishlist items.
              </p>
              <div className="vault-summary-grid">
                <div className="card">
                  <p>Items</p>
                  <h2>{vaultItems.length}</h2>
                </div>
                <div className="card">
                  <p>Value</p>
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
            </CollapsibleFeatureSection>

            <CollapsibleFeatureSection title="Add Item to Vault" summary="Add Sealed Product, Add Individual Card, Add from Catalog, and Manual Add" open={isFeatureSectionOpen("vault_add")} onToggle={() => toggleFeatureSection("vault_add")}>
            <section className="panel vault-add-panel">
              <div className="compact-card-header">
                <div>
                  <h2>Add Vault Item</h2>
                  <p>Start with the basics, then open extra details only when you need them.</p>
                </div>
                <button type="button" onClick={() => setShowVaultAddForm((current) => !current)}>
                  {showVaultAddForm ? "Close Form" : "Add Item to Vault"}
                </button>
              </div>
              <div className="quick-actions">
                <button type="button" onClick={() => setActiveTab("catalog")}>Add from TideTradr</button>
                <button type="button" className="secondary-button" onClick={() => setActiveTab("catalog")}>Add Sealed Product</button>
                <button type="button" className="secondary-button" onClick={() => setActiveTab("catalog")}>Add Individual Card</button>
                <button type="button" className="secondary-button" onClick={() => setShowVaultAddForm(true)}>Manual Add</button>
                <button type="button" className="secondary-button" onClick={() => openInventoryImportAssistant("Vault")}>Import Collection</button>
              </div>

              {importAssistantContext === "Vault" ? renderInventoryImportAssistant() : null}

              {showVaultAddForm ? (
                <form onSubmit={addVaultItem} className="vault-collapsible-form">
                  <div className="vault-form-section">
                    <button type="button" className="vault-section-toggle" onClick={() => toggleVaultFormSection("basic")}>
                      <span>Basic Info</span>
                      <b>{vaultFormSections.basic ? "Hide" : "Show"}</b>
                    </button>
                    {vaultFormSections.basic ? (
                      <div className="form vault-form-grid">
                        <Field label="Item Name">
                          <input value={vaultForm.name} onChange={(e) => updateVaultForm("name", e.target.value)} />
                        </Field>
                        <Field label="Category / Product Type">
                          <input value={vaultForm.productType} onChange={(e) => updateVaultForm("productType", e.target.value)} placeholder="Elite Trainer Box, Binder, Tin..." />
                        </Field>
                        <Field label="Set / Collection">
                          <input value={vaultForm.setName} onChange={(e) => updateVaultForm("setName", e.target.value)} />
                        </Field>
                        <Field label="Quantity">
                          <input type="number" min="1" value={vaultForm.quantity} onChange={(e) => updateVaultForm("quantity", e.target.value)} />
                        </Field>
                      </div>
                    ) : null}
                  </div>

                  <div className="vault-form-section">
                    <button type="button" className="vault-section-toggle" onClick={() => toggleVaultFormSection("pricing")}>
                      <span>Pricing</span>
                      <b>{vaultFormSections.pricing ? "Hide" : "Show"}</b>
                    </button>
                    {vaultFormSections.pricing ? (
                      <div className="form vault-form-grid">
                        <Field label="Cost Paid">
                          <input type="number" step="0.01" value={vaultForm.unitCost} onChange={(e) => updateVaultForm("unitCost", e.target.value)} />
                        </Field>
                        <Field label="MSRP">
                          <input type="number" step="0.01" value={vaultForm.msrpPrice} onChange={(e) => updateVaultForm("msrpPrice", e.target.value)} />
                        </Field>
                        <Field label="Market Value">
                          <input type="number" step="0.01" value={vaultForm.marketPrice} onChange={(e) => updateVaultForm("marketPrice", e.target.value)} />
                        </Field>
                        <Field label="Planned Selling Price">
                          <input type="number" step="0.01" value={vaultForm.salePrice} onChange={(e) => updateVaultForm("salePrice", e.target.value)} />
                        </Field>
                      </div>
                    ) : null}
                  </div>

                  <div className="vault-form-section">
                    <button type="button" className="vault-section-toggle" onClick={() => toggleVaultFormSection("status")}>
                      <span>Status</span>
                      <b>{vaultFormSections.status ? "Hide" : "Show"}</b>
                    </button>
                    {vaultFormSections.status ? (
                      <div className="form vault-form-grid">
                        <Field label="Vault Category">
                          <select value={vaultForm.vaultCategory} onChange={(e) => updateVaultForm("vaultCategory", e.target.value)}>
                            {VAULT_CATEGORIES.map((category) => (
                              <option key={category} value={category}>{category}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Status">
                          <select value={vaultForm.status} onChange={(e) => updateVaultForm("status", e.target.value)}>
                            <option value="Personal Collection">Personal Collection</option>
                            <option value="Held">Held</option>
                            <option value="Ready to List">For Sale</option>
                            <option value="Sold">Sold</option>
                          </select>
                        </Field>
                      </div>
                    ) : null}
                  </div>

                  <div className="vault-form-section">
                    <button type="button" className="vault-section-toggle" onClick={() => toggleVaultFormSection("extra")}>
                      <span>Extra Details</span>
                      <b>{vaultFormSections.extra ? "Hide" : "Show"}</b>
                    </button>
                    {vaultFormSections.extra ? (
                      <div className="form vault-form-grid">
                        <Field label="Store Purchased">
                          <input value={vaultForm.store} onChange={(e) => updateVaultForm("store", e.target.value)} />
                        </Field>
                        <Field label="Purchase Date">
                          <input type="date" value={vaultForm.purchaseDate} onChange={(e) => updateVaultForm("purchaseDate", e.target.value)} />
                        </Field>
                        <Field label="Pack Count">
                          <input type="number" min="0" value={vaultForm.packCount} onChange={(e) => updateVaultForm("packCount", e.target.value)} />
                        </Field>
                        <Field label="Item Photo">
                          <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => updateVaultForm("itemImage", url), "vault-items")} />
                        </Field>
                        <Field label="Receipt Upload">
                          <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => updateVaultForm("receiptImage", url), "vault-receipts")} />
                        </Field>
                        <Field label="Notes">
                          <input value={vaultForm.notes} onChange={(e) => updateVaultForm("notes", e.target.value)} />
                        </Field>
                      </div>
                    ) : null}
                  </div>

                  <div className="vault-form-actions">
                    <button type="submit">Add to Vault</button>
                    <button type="button" className="secondary-button" onClick={() => setShowVaultAddForm(false)}>Cancel</button>
                  </div>
                </form>
              ) : null}
            </section>
            </CollapsibleFeatureSection>

            <CollapsibleFeatureSection title="Collection Items" summary="View Collection, Filter Collection, Edit Item, and Delete Item" open={isFeatureSectionOpen("vault_collection_items")} onToggle={() => toggleFeatureSection("vault_collection_items")}>
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
            </CollapsibleFeatureSection>
            <CollapsibleFeatureSection title="Held Items" summary="View Held Items, Held Value, and Move to Forge" open={isFeatureSectionOpen("vault_held_items")} onToggle={() => toggleFeatureSection("vault_held_items")}>
              <div className="inventory-list compact-inventory-list">
                {vaultItems.filter((item) => item.status === "Held").length === 0 ? <p>No held items yet.</p> : vaultItems.filter((item) => item.status === "Held").map((item) => (
                  <CompactInventoryCard key={item.id} item={item} onRestock={prepareRestock} onEdit={startEditingVaultItem} onDelete={deleteItem} onStatusChange={updateItemStatus} />
                ))}
              </div>
            </CollapsibleFeatureSection>
            <CollapsibleFeatureSection title="Personal Collection" summary="Items marked personal collection" open={isFeatureSectionOpen("vault_personal_collection")} onToggle={() => toggleFeatureSection("vault_personal_collection")}>
              <div className="inventory-list compact-inventory-list">
                {vaultItems.filter((item) => item.status === "Personal Collection").length === 0 ? <p>No personal collection items yet.</p> : vaultItems.filter((item) => item.status === "Personal Collection").map((item) => (
                  <CompactInventoryCard key={item.id} item={item} onRestock={prepareRestock} onEdit={startEditingVaultItem} onDelete={deleteItem} onStatusChange={updateItemStatus} />
                ))}
              </div>
            </CollapsibleFeatureSection>
            <CollapsibleFeatureSection title="Vault Settings" summary="Display Settings, Collection Categories, and Market Value Settings" open={isFeatureSectionOpen("vault_settings")} onToggle={() => toggleFeatureSection("vault_settings")}>
              <div className="quick-actions">
                <button type="button" onClick={() => setActiveTab("catalog")}>Catalog Search</button>
                <button type="button" onClick={() => setActiveTab("market")}>Market Value Settings</button>
                <button type="button" onClick={() => setActiveTab("dashboard")}>Display Settings</button>
              </div>
            </CollapsibleFeatureSection>
            </section>
          </>
        )}

        {activeTab === "scout" && (
          <>
            <section className="tab-summary panel">
              <div>
                <h2>Scout</h2>
                <p>Store tracker, restock reports, predictions, drops, alerts, and community tips.</p>
              </div>
              <div className="summary-pill-row">
                <span>{scoutSnapshot.stores.length} stores</span>
                <span>{scoutSnapshot.reports.length} reports</span>
              </div>
            </section>
            <section className="feature-dropdown-stack">
              <CollapsibleFeatureSection title="Stores" summary="View Stores, Add Store, Edit Store, Favorite Stores, and Store Filters" open={isFeatureSectionOpen("scout_stores")} onToggle={() => toggleFeatureSection("scout_stores")}>
                <div className="quick-actions">
                  <button type="button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>View Stores</button>
                  <button type="button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>Add Store</button>
                  <button type="button" className="secondary-button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>Edit Store</button>
                  <button type="button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>Submit Restock Report</button>
                  <button type="button" className="secondary-button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_recommendations: true }))}>Favorite Stores</button>
                  <button type="button" className="secondary-button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>Store Filters</button>
                </div>
                <div className="cards recommendation-grid">
                  <div className="card">
                    <p>Shared Stores</p>
                    <h2>{scoutSnapshot.stores.length}</h2>
                    <small>Store name, type, address, city/state/ZIP, nickname, phone, website, notes, limits, and last verified data live in Scout.</small>
                  </div>
                  <div className="card">
                    <p>Recent Tips</p>
                    <h2>{scoutSnapshot.reports.length}</h2>
                    <small>User reports connect to a shared store and can include product, quantity, status, limits, and notes.</small>
                  </div>
                </div>
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection title="Tidepool" summary="Report Feed, Nearby Reports, Verified Reports, My Reports, and Needs Verification" open={isFeatureSectionOpen("scout_tidepool")} onToggle={() => toggleFeatureSection("scout_tidepool")}>
                <div className="quick-actions">
                  <button type="button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>Report Feed</button>
                  <button type="button" className="secondary-button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>Nearby Reports</button>
                  <button type="button" className="secondary-button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>Verified Reports</button>
                  <button type="button" className="secondary-button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>My Reports</button>
                  <button type="button" className="secondary-button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>Needs Verification</button>
                </div>
                <p className="compact-subtitle">Tidepool stays inside Scout as the community report feed for restocks, product sightings, deals, online drops, and store updates.</p>
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection title="Submit Report" summary="Restock Sighting, Product Sighting, Nothing in Stock, Store Limit Update, Deal Sighting, and Online Drop Alert" open={isFeatureSectionOpen("scout_submit_report")} onToggle={() => toggleFeatureSection("scout_submit_report")}>
                <div className="quick-actions">
                  {["Restock Sighting", "Product Sighting", "Nothing in Stock", "Store Limit Update", "Deal Sighting", "Online Drop Alert"].map((label) => (
                    <button key={label} type="button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>{label}</button>
                  ))}
                </div>
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection title="Scout Alerts" summary="Alert Settings, Favorite Store Alerts, Watchlist Alerts, Nearby Verified Reports, and Online Drop Alerts" open={isFeatureSectionOpen("scout_alerts")} onToggle={() => toggleFeatureSection("scout_alerts")}>
                <div className="quick-actions">
                  <button type="button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>Alert Settings</button>
                  <button type="button" className="secondary-button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>Favorite Store Alerts</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("market")}>Watchlist Alerts</button>
                  <button type="button" className="secondary-button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>Nearby Verified Reports</button>
                  <button type="button" className="secondary-button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>Online Drop Alerts</button>
                </div>
                {featureAllowed("alerts_advanced") ? <p className="compact-subtitle">Advanced notification channels can connect here later.</p> : <LockedFeatureCard featureKey="alerts_advanced" />}
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection title="Scout Score & Rewards" summary="My Scout Score, Reward Points, Badge Level, Report Streak, Warnings/Cooldown, and Report Guidelines" open={isFeatureSectionOpen("scout_score_rewards")} onToggle={() => toggleFeatureSection("scout_score_rewards")}>
                <div className="quick-actions">
                  <button type="button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>My Scout Score</button>
                  <button type="button" className="secondary-button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>Reward Points</button>
                  <button type="button" className="secondary-button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>Badge Level</button>
                  <button type="button" className="secondary-button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>Report Streak</button>
                  <button type="button" className="secondary-button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, scout_store_tracker: true }))}>Report Guidelines</button>
                </div>
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection title="Location Settings" summary="Manual ZIP/City, Saved Location, Allow Location While Using App, and Alert Radius" open={isFeatureSectionOpen("scout_location_options")} onToggle={() => toggleFeatureSection("scout_location_options")}>
                <div className="form location-options-grid">
                  <Field label="Manual ZIP or City">
                    <input value={locationSettings.manualLocation} onChange={(event) => updateLocationSettings({ manualLocation: event.target.value, mode: "manual" })} placeholder="Example: Suffolk, VA or 23434" />
                  </Field>
                  <Field label="Saved Location">
                    <select value={locationSettings.selectedSavedLocation} onChange={(event) => updateLocationSettings({ selectedSavedLocation: event.target.value, mode: "saved" })}>
                      <option value="">Choose saved location</option>
                      {locationSettings.savedLocations.map((location) => <option key={location} value={location}>{location}</option>)}
                    </select>
                  </Field>
                  <button type="button" onClick={saveManualLocation}>Save Location</button>
                  <button type="button" className="secondary-button" onClick={locationSettings.trackingEnabled ? disableLocationTracking : enableLocationTracking}>
                    {locationSettings.trackingEnabled ? "Turn Location Off" : "Allow Location While Using App"}
                  </button>
                </div>
                <p className="compact-subtitle">Location tracking is opt-in only. Last Updated: {locationSettings.lastUpdated || "Not set"}</p>
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection title="Scout Recommendations" summary="Nearby stores, deals, tips, drops, and routes" open={isFeatureSectionOpen("scout_recommendations")} onToggle={() => toggleFeatureSection("scout_recommendations")}>
                <div className="cards recommendation-grid">
                  {scoutRecommendationCards.map((card) => (
                    <div className="card" key={card.title}>
                      <p>{card.title}</p>
                      <h2>{card.value}</h2>
                      <small>{card.note}</small>
                    </div>
                  ))}
                </div>
                <p className="compact-subtitle">Last Updated: {scoutLastUpdated}</p>
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection title="Live Updates" summary="Local beta structure for reports, tips, drops, prices, and limits" open={isFeatureSectionOpen("scout_live_updates")} onToggle={() => toggleFeatureSection("scout_live_updates")}>
                <div className="cards recommendation-grid">
                  {scoutLiveUpdates.map((update) => (
                    <div className="card" key={update.label}>
                      <p>{update.label}</p>
                      <h2>{update.value}</h2>
                      <small>Last Updated: {update.updatedAt}</small>
                    </div>
                  ))}
                </div>
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection title="Scout Workspace" summary="Full beta workspace for stores, reports, Tidepool, alerts, rewards, and screenshot tips" open={isFeatureSectionOpen("scout_store_tracker")} onToggle={() => toggleFeatureSection("scout_store_tracker")}>
                <section className="embedded-page">
                  <Scout />
                </section>
              </CollapsibleFeatureSection>
            </section>
          </>
        )}

        {activeTab === "menu" && (
          <>
            <section className="tab-summary panel">
              <div>
                <h2>Menu</h2>
                <p>Profile, app settings, dashboard display, plan access, exports, help, and logout.</p>
              </div>
              <div className="summary-pill-row">
                <span>{TIER_LABELS[currentTier] || currentPlan}</span>
                <span>{user.email}</span>
              </div>
            </section>
            <section className="feature-dropdown-stack">
              <CollapsibleFeatureSection title="Profile" summary="User Profile, Scout Score, and Saved Location" open={isFeatureSectionOpen("menu_profile")} onToggle={() => toggleFeatureSection("menu_profile")}>
                <div className="cards mini-cards">
                  <div className="card"><p>User Type</p><h2>{userType}</h2></div>
                  <div className="card"><p>Tier</p><h2>{TIER_LABELS[currentTier] || currentPlan}</h2></div>
                  <div className="card"><p>Saved Location</p><h2>{locationSettings.selectedSavedLocation || locationSettings.manualLocation || "Not set"}</h2></div>
                </div>
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection title="App Settings" summary="Theme/Appearance, Dashboard Display Settings, Location Settings, and Notification Settings" open={isFeatureSectionOpen("menu_app_settings")} onToggle={() => toggleFeatureSection("menu_app_settings")}>
                <div className="quick-actions">
                  <button type="button" onClick={() => setActiveTab("dashboard")}>Dashboard Display Settings</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("scout")}>Location Settings</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("scout")}>Notification Settings</button>
                </div>
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection title="TideTradr" summary="Catalog, Market Sources, Watchlist, and Deal Finder" open={isFeatureSectionOpen("menu_tidetradr")} onToggle={() => toggleFeatureSection("menu_tidetradr")}>
                <div className="quick-actions">
                  <button type="button" onClick={() => setActiveTab("catalog")}>Catalog</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("market")}>Market Sources</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("market")}>Watchlist</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("market")}>Deal Finder</button>
                </div>
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection title="Subscription Placeholder" summary="Paid Plan / Upgrade Coming Soon and Free vs Paid Feature Preview" open={isFeatureSectionOpen("menu_paid_plan")} onToggle={() => toggleFeatureSection("menu_paid_plan")}>
                <div className="cards mini-cards">
                  <div className="card"><p>Current Tier</p><h2>{TIER_LABELS[currentTier] || currentPlan}</h2></div>
                  <LockedFeatureCard featureKey="seller_tools" />
                </div>
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection title="Community" summary="Join Discord Community, Discord Coming Soon, and Help / Feedback" open={isFeatureSectionOpen("menu_discord")} onToggle={() => toggleFeatureSection("menu_discord")}>
                <div className="cards mini-cards">
                  <div className="card">
                    <p>Join Discord Community</p>
                    <h2>Coming Soon</h2>
                    <small>Tide Pool will support chat, announcements, giveaways, support, and optional community roles.</small>
                  </div>
                  <div className="card">
                    <p>Role Placeholders</p>
                    <h2>Trusted Scout</h2>
                    <small>Future roles: Trusted Scout, Verified Scout, Paid Member, and community helper roles.</small>
                  </div>
                </div>
                <div className="quick-actions">
                  <button type="button" disabled>Join Discord Soon</button>
                  <button type="button" className="secondary-button" disabled>Help / Feedback Coming Soon</button>
                </div>
                <p className="compact-subtitle">The app remains the source of truth for verified reports, Tidepool feed, Scout alerts, stores, recommendations, trust score, and rewards.</p>
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection title="Data" summary="Export Data, Import Data Placeholder, and Clear Mock Data if needed" open={isFeatureSectionOpen("menu_data_export")} onToggle={() => toggleFeatureSection("menu_data_export")}>
                <div className="export-grid">
                  <button onClick={() => downloadCSV("ember-tide-inventory.csv", items)}>Export Forge</button>
                  <button onClick={() => downloadCSV("ember-tide-catalog.csv", catalogProducts)}>Export Catalog</button>
                  <button onClick={downloadBackup}>Full Backup</button>
                  <button type="button" className="secondary-button" onClick={() => openInventoryImportAssistant("Forge")}>Import Data</button>
                  <button type="button" className="secondary-button" onClick={resetBetaLocalData}>Clear Mock Data</button>
                </div>
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection title="Account" summary="Log Out" open={isFeatureSectionOpen("menu_logout")} onToggle={() => toggleFeatureSection("menu_logout")}>
                <button type="button" className="secondary-button" onClick={signOut}>Log Out</button>
              </CollapsibleFeatureSection>
            </section>
          </>
        )}

        {activeTab === "market" && (
          <>
            <section className="tab-summary panel">
              <div>
                <h2>TideTradr</h2>
                <p>Shared product catalog, market lookup, deal checks, watchlist, and app-wide product actions.</p>
              </div>
              <div className="summary-pill-row">
                <span>{catalogProducts.length} products</span>
                <span>{tideTradrWatchlist.length} watched</span>
              </div>
            </section>

            <section className="feature-dropdown-stack">
              <CollapsibleFeatureSection title="Catalog" summary="Search Catalog, Sealed Products, Individual Cards, Add Catalog Item, and Edit Catalog Item" open={isFeatureSectionOpen("market_summary")} onToggle={() => toggleFeatureSection("market_summary")}>
                <div className="cards">
                  <div className="card"><p>Catalog Products</p><h2>{catalogProducts.length}</h2></div>
                  <div className="card"><p>Forge Market Value</p><h2>{money(totalMarketValue)}</h2></div>
                  <div className="card"><p>Missing Market Prices</p><h2>{missingMarketPriceItems.length}</h2></div>
                  <div className="card"><p>Needs Market Check</p><h2>{needsMarketCheckItems.length}</h2></div>
                </div>
                <div className="quick-actions">
                  <button type="button" onClick={() => setActiveTab("catalog")}>Search Catalog</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("catalog")}>Sealed Products</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("catalog")}>Individual Cards</button>
                  <button type="button" className="secondary-button" onClick={() => { setActiveTab("catalog"); setFeatureSectionsOpen((current) => ({ ...current, catalog_manual: true })); }}>Add Catalog Item</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("catalog")}>Edit Catalog Item</button>
                  <button type="button" onClick={() => setActiveTab("addInventory")}>Add to Forge</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("vault")}>Add to Vault</button>
                </div>
              </CollapsibleFeatureSection>

              <CollapsibleFeatureSection title="Market Watch" summary="Pinned Market Watch, Watchlist, Recently Updated Market Items, and Market Value Updates" open={isFeatureSectionOpen("market_lookup")} onToggle={() => toggleFeatureSection("market_lookup")}>
                <div className="form">
                  <Field label="TideTradr Product">
                    <select value={tideTradrLookupId} onChange={(event) => selectTideTradrProduct(event.target.value)}>
                      <option value="">Choose a product</option>
                      {catalogProducts.map((product) => (
                        <option key={product.id} value={product.id}>{product.name} - {money(getTideTradrMarketInfo(product).currentMarketValue)}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="cards mini-cards">
                  <div className="card"><p>Current Market</p><h2>{money(tideTradrMarketInfo.currentMarketValue)}</h2></div>
                  <div className="card"><p>MSRP</p><h2>{money(tideTradrMarketInfo.msrp)}</h2></div>
                  <div className="card"><p>Market vs MSRP</p><h2>{tideTradrMarketInfo.marketVsMsrpPercent.toFixed(1)}%</h2></div>
                  <div className="card"><p>Over MSRP</p><h2>{money(tideTradrMarketInfo.marketOverMsrp)}</h2></div>
                </div>
                <p className="compact-subtitle">Source: {tideTradrMarketInfo.sourceName} | Confidence: {tideTradrMarketInfo.confidenceLevel} | Last Updated: {tideTradrMarketInfo.lastUpdated}</p>
                <div className="quick-actions">
                  {tideTradrLookupProduct ? <button type="button" onClick={() => { applyCatalogProduct(tideTradrLookupProduct.id); setActiveTab("addInventory"); }}>Add to Forge</button> : null}
                  {tideTradrLookupProduct ? <button type="button" className="secondary-button" onClick={() => applyCatalogProductToVault(tideTradrLookupProduct.id)}>Add to Vault</button> : null}
                  {tideTradrLookupProduct ? <button type="button" className="secondary-button" onClick={() => addProductToTideTradrWatchlist(tideTradrLookupProduct.id)}>Add to Watchlist</button> : null}
                </div>
              </CollapsibleFeatureSection>

              <CollapsibleFeatureSection title="Deal Finder" summary="Check Deal, Lot Calculator, MSRP vs Market, and Buy/Maybe/Pass Recommendation" open={isFeatureSectionOpen("market_deal_finder")} onToggle={() => toggleFeatureSection("market_deal_finder")}>
                <form className="form">
                  <Field label="Product">
                    <select value={dealForm.productId} onChange={(event) => selectTideTradrProduct(event.target.value)}>
                      <option value="">Manual deal / lot</option>
                      {catalogProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Deal Title">
                    <input value={dealForm.title} onChange={(e) => updateDealForm("title", e.target.value)} placeholder="Example: 2 ETBs and 1 booster bundle" />
                  </Field>
                  <Field label="Quantity">
                    <input type="number" min="1" value={dealForm.quantity} onChange={(e) => {
                      const quantity = Math.max(1, Number(e.target.value || 1));
                      updateDealForm("quantity", quantity);
                      if (selectedDealProduct) {
                        const info = getTideTradrMarketInfo(selectedDealProduct);
                        setDealForm((old) => ({ ...old, quantity, marketTotal: info.currentMarketValue * quantity, retailTotal: info.msrp * quantity }));
                      }
                    }} />
                  </Field>
                  <Field label="Condition / Status">
                    <select value={dealForm.condition} onChange={(e) => updateDealForm("condition", e.target.value)}>
                      <option>Sealed</option>
                      <option>Damaged box</option>
                      <option>Opened</option>
                      <option>Mixed lot</option>
                      <option>Unknown</option>
                    </select>
                  </Field>
                  <Field label="Asking Price">
                    <input type="number" step="0.01" value={dealForm.askingPrice} onChange={(e) => updateDealForm("askingPrice", e.target.value)} placeholder="Total lot price if buying multiple items" />
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
                  <div className="card"><p>Recommendation</p><h2>{dealRecommendation}</h2></div>
                  <div className="card"><p>Deal Rating</p><h2>{dealRating}</h2></div>
                  <div className="card"><p>Percent of Market</p><h2>{dealPercentOfMarket.toFixed(1)}%</h2></div>
                  <div className="card"><p>Percent of MSRP</p><h2>{dealPercentOfRetail.toFixed(1)}%</h2></div>
                  <div className="card"><p>Potential Profit</p><h2>{money(dealPotentialProfit)}</h2></div>
                  <div className="card"><p>ROI</p><h2>{dealRoi.toFixed(1)}%</h2></div>
                </div>
                <p className="compact-subtitle">{dealRecommendationReason}</p>
              </CollapsibleFeatureSection>

              <CollapsibleFeatureSection title="Pinned Market Watch" summary="Saved watchlist products and pinned market items" open={isFeatureSectionOpen("market_watchlist")} onToggle={() => toggleFeatureSection("market_watchlist")}>
                {tideTradrWatchlist.length === 0 ? <p>No watched TideTradr products yet.</p> : null}
                <div className="inventory-list">
                  {tideTradrWatchlist.map((item) => (
                    <div className="inventory-card compact-card" key={item.id}>
                      <h3>{item.name}</h3>
                      <p>{item.setName || "No set"} | {item.productType || "No type"}</p>
                      <p>Market: {money(item.marketValue)} | MSRP: {money(item.msrp)}</p>
                      <p>Source: {item.sourceName}</p>
                      <p>Last Updated: {item.lastUpdated}</p>
                      <div className="quick-actions">
                        <button type="button" onClick={() => useCatalogProductInDeal(item.productId)}>Check Deal</button>
                        <button type="button" className="secondary-button" onClick={() => removeTideTradrWatchlistItem(item.id)}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleFeatureSection>

              <CollapsibleFeatureSection title="Cards" summary="Search Cards, Card Filters, Graded Cards, Raw Cards, and Chase Cards" open={isFeatureSectionOpen("market_cards")} onToggle={() => toggleFeatureSection("market_cards")}>
                <div className="quick-actions">
                  <button type="button" onClick={() => setActiveTab("catalog")}>Search Cards</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("catalog")}>Card Filters</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("catalog")}>Graded Cards</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("catalog")}>Raw Cards</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("catalog")}>Chase Cards</button>
                </div>
              </CollapsibleFeatureSection>

              <CollapsibleFeatureSection title="Sealed Products" summary="ETBs, Booster Bundles, Booster Boxes, Blisters, Tins, and Collection Boxes" open={isFeatureSectionOpen("market_sealed")} onToggle={() => toggleFeatureSection("market_sealed")}>
                <div className="quick-actions">
                  {["ETBs", "Booster Bundles", "Booster Boxes", "Blisters", "Tins", "Collection Boxes"].map((label) => (
                    <button key={label} type="button" onClick={() => setActiveTab("catalog")}>{label}</button>
                  ))}
                </div>
              </CollapsibleFeatureSection>

              <CollapsibleFeatureSection title="Imports" summary="Import Product List, Match Items to Catalog, and Review Imported Items" open={isFeatureSectionOpen("market_imports")} onToggle={() => toggleFeatureSection("market_imports")}>
                <div className="quick-actions">
                  <button type="button" onClick={() => setActiveTab("catalog")}>Import Product List</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("catalog")}>Match Items to Catalog</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("catalog")}>Review Imported Items</button>
                </div>
              </CollapsibleFeatureSection>

              <CollapsibleFeatureSection title="Market Sources" summary="Manual Values, Cached Values, Mock Values, and Live API Placeholder" open={isFeatureSectionOpen("market_sources")} onToggle={() => toggleFeatureSection("market_sources")}>
                <div className="cards mini-cards">
                  <div className="card"><p>Manual Values</p><h2>Enabled</h2></div>
                  <div className="card"><p>Cached Values</p><h2>Ready</h2></div>
                  <div className="card"><p>Mock Values</p><h2>Beta</h2></div>
                  <div className="card"><p>Live API</p><h2>Placeholder</h2></div>
                </div>
              </CollapsibleFeatureSection>

              <CollapsibleFeatureSection title="Market To-Do List" summary="Items missing market values, MSRP, or checks" open={isFeatureSectionOpen("market_todo")} onToggle={() => toggleFeatureSection("market_todo")}>
                <ActionReport title="Needs Market Check" items={needsMarketCheckItems} button="Update Market" action={startEditingItem} />
                <ActionReport title="Missing Market Price" items={missingMarketPriceItems} button="Add Market Price" action={startEditingItem} />
                <ActionReport title="Missing MSRP" items={missingMsrpItems} button="Add MSRP" action={startEditingItem} />
              </CollapsibleFeatureSection>
            </section>
          </>
        )}

        {activeTab === "catalog" && (
          <>
            <section className="panel">
              <h2>Shared Pokemon Product Catalog</h2>
              <p>
                TideTradr Catalog is the shared product and value system for Forge, Scout, Vault, and Deal Finder.
              </p>
              <p>
                Market values are labeled Live, Cached, Manual, or Mock. Mock values are beta placeholders until live/cached sources are connected.
              </p>
              <div className="cards mini-cards">
                <div className="card"><p>Sealed Products</p><h2>{sealedCatalogCount}</h2></div>
                <div className="card"><p>Individual Cards</p><h2>{cardCatalogCount}</h2></div>
                <div className="card"><p>Watchlist</p><h2>{tideTradrWatchlist.length}</h2></div>
              </div>
            </section>
          <CollapsibleFeatureSection title="Manual Catalog Item" summary="Add or edit missing sealed products and individual cards locally" open={isFeatureSectionOpen("catalog_manual")} onToggle={() => toggleFeatureSection("catalog_manual")}>
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
                <Field label="Catalog Type"><select value={catalogForm.catalogType} onChange={(e) => updateCatalogForm("catalogType", e.target.value)}><option value="sealed">Sealed Product</option><option value="card">Individual Card</option></select></Field>
                <Field label={catalogForm.catalogType === "card" ? "Card Name" : "Product Name"}><input value={catalogForm.catalogType === "card" ? catalogForm.cardName : catalogForm.productName || catalogForm.name} onChange={(e) => { updateCatalogForm(catalogForm.catalogType === "card" ? "cardName" : "productName", e.target.value); updateCatalogForm("name", e.target.value); }} /></Field>
                {catalogForm.catalogType === "card" && <Field label="Pokemon / Character Name"><input value={catalogForm.pokemonName} onChange={(e) => updateCatalogForm("pokemonName", e.target.value)} /></Field>}
                <Field label="Category"><select value={catalogForm.category} onChange={(e) => updateCatalogForm("category", e.target.value)}>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Set / Collection"><input value={catalogForm.setName} onChange={(e) => updateCatalogForm("setName", e.target.value)} /></Field>
                <Field label="Product Type"><input list="sealed-product-types" value={catalogForm.productType} onChange={(e) => updateCatalogForm("productType", e.target.value)} /><datalist id="sealed-product-types">{SEALED_PRODUCT_TYPES.map((type) => <option key={type} value={type} />)}</datalist></Field>
                <Field label="Barcode / UPC"><input value={catalogForm.barcode} onChange={(e) => updateCatalogForm("barcode", e.target.value)} /></Field>
                <Field label="SKU"><input value={catalogForm.sku} onChange={(e) => updateCatalogForm("sku", e.target.value)} /></Field>
                <Field label="Product Image"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => updateCatalogForm("imageUrl", url), "catalog-products")} /></Field>
                {catalogForm.imageUrl && <div className="receipt-preview"><p>Catalog Photo</p><img src={catalogForm.imageUrl} alt="Catalog" /></div>}
                <Field label="TideTradr Product ID"><input value={catalogForm.externalProductId} onChange={(e) => updateCatalogForm("externalProductId", e.target.value)} /></Field>
                <Field label="Market Source URL"><input value={catalogForm.marketUrl} onChange={(e) => updateCatalogForm("marketUrl", e.target.value)} /></Field>
                <Field label="Market Data Label"><select value={catalogForm.sourceType} onChange={(e) => updateCatalogForm("sourceType", e.target.value)}><option value="manual">Manual</option><option value="mock">Mock</option><option value="cached">Cached</option><option value="live">Live</option></select></Field>
                <Field label="Market Source Name"><input value={catalogForm.marketSource} onChange={(e) => updateCatalogForm("marketSource", e.target.value)} placeholder="Manual, Mock, TCGPlayer, PriceCharting..." /></Field>
                <Field label="Confidence"><input value={catalogForm.marketConfidenceLevel} onChange={(e) => updateCatalogForm("marketConfidenceLevel", e.target.value)} placeholder="Manual, Mock, Low, Medium, High" /></Field>
                <Field label="Market Last Updated"><input type="date" value={catalogForm.marketLastUpdated} onChange={(e) => updateCatalogForm("marketLastUpdated", e.target.value)} /></Field>
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

<Field label="Release Year">
  <input value={catalogForm.releaseYear} onChange={(e) => updateCatalogForm("releaseYear", e.target.value)} />
</Field>

<Field label="Release Date">
  <input type="date" value={catalogForm.releaseDate} onChange={(e) => updateCatalogForm("releaseDate", e.target.value)} />
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
                {catalogForm.catalogType === "card" && (
                  <>
                    <Field label="Card Number"><input value={catalogForm.cardNumber} onChange={(e) => updateCatalogForm("cardNumber", e.target.value)} /></Field>
                    <Field label="Rarity"><input value={catalogForm.rarity} onChange={(e) => updateCatalogForm("rarity", e.target.value)} /></Field>
                    <Field label="Variant"><input value={catalogForm.variant} onChange={(e) => updateCatalogForm("variant", e.target.value)} /></Field>
                    <Field label="Condition"><input value={catalogForm.condition} onChange={(e) => updateCatalogForm("condition", e.target.value)} /></Field>
                    <Field label="Language"><input value={catalogForm.language} onChange={(e) => updateCatalogForm("language", e.target.value)} /></Field>
                    <Field label="Graded"><select value={catalogForm.graded ? "yes" : "no"} onChange={(e) => updateCatalogForm("graded", e.target.value === "yes")}><option value="no">Ungraded</option><option value="yes">Graded</option></select></Field>
                    <Field label="Grading Company"><input value={catalogForm.gradingCompany} onChange={(e) => updateCatalogForm("gradingCompany", e.target.value)} /></Field>
                    <Field label="Grade"><input value={catalogForm.grade} onChange={(e) => updateCatalogForm("grade", e.target.value)} /></Field>
                    <Field label="Raw Market Value"><input type="number" step="0.01" value={catalogForm.marketValueRaw} onChange={(e) => updateCatalogForm("marketValueRaw", e.target.value)} /></Field>
                    <Field label="Near Mint Market Value"><input type="number" step="0.01" value={catalogForm.marketValueNearMint} onChange={(e) => updateCatalogForm("marketValueNearMint", e.target.value)} /></Field>
                    <Field label="Light Played Market Value"><input type="number" step="0.01" value={catalogForm.marketValueLightPlayed} onChange={(e) => updateCatalogForm("marketValueLightPlayed", e.target.value)} /></Field>
                    <Field label="Graded Market Value"><input type="number" step="0.01" value={catalogForm.marketValueGraded} onChange={(e) => updateCatalogForm("marketValueGraded", e.target.value)} /></Field>
                  </>
                )}
                <Field label="TideTradr Market Price"><input type="number" step="0.01" value={catalogForm.marketPrice} onChange={(e) => updateCatalogForm("marketPrice", e.target.value)} /></Field>
                <Field label="Low Price"><input type="number" step="0.01" value={catalogForm.lowPrice} onChange={(e) => updateCatalogForm("lowPrice", e.target.value)} /></Field>
                <Field label="Mid Price"><input type="number" step="0.01" value={catalogForm.midPrice} onChange={(e) => updateCatalogForm("midPrice", e.target.value)} /></Field>
                <Field label="High Price"><input type="number" step="0.01" value={catalogForm.highPrice} onChange={(e) => updateCatalogForm("highPrice", e.target.value)} /></Field>
                <Field label="Notes"><input value={catalogForm.notes} onChange={(e) => updateCatalogForm("notes", e.target.value)} /></Field>
                <button type="submit">{editingCatalogId ? "Save Catalog Product" : "Add Catalog Product"}</button>
                {editingCatalogId && <button type="button" className="secondary-button" onClick={() => { setEditingCatalogId(null); setCatalogForm(blankCatalog); }}>Cancel Edit</button>}
              </form>
            </section>
          </CollapsibleFeatureSection>
            <section className="panel">
              <h2>Product Catalog</h2>
              <input className="search-input" value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} placeholder="Search products, cards, Pokemon, set, UPC, SKU, rarity..." />
              <div className="filter-grid">
                <Field label="Sealed vs Card">
                  <select value={catalogKindFilter} onChange={(e) => setCatalogKindFilter(e.target.value)}>
                    <option value="All">All catalog types</option>
                    <option value="sealed">Sealed Products</option>
                    <option value="card">Individual Cards</option>
                  </select>
                </Field>
                <Field label="Filter by Set">
                  <select value={catalogSetFilter} onChange={(e) => setCatalogSetFilter(e.target.value)}>
                    {catalogSetOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
                <Field label="Filter by Product Type">
                  <select value={catalogTypeFilter} onChange={(e) => setCatalogTypeFilter(e.target.value)}>
                    {catalogTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
                <Field label="Filter by Era">
                  <select value={catalogEraFilter} onChange={(e) => setCatalogEraFilter(e.target.value)}>
                    {catalogEraOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
                <Field label="Filter by Year">
                  <select value={catalogYearFilter} onChange={(e) => setCatalogYearFilter(e.target.value)}>
                    {catalogYearOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
                <Field label="Rarity">
                  <select value={catalogRarityFilter} onChange={(e) => setCatalogRarityFilter(e.target.value)}>
                    {catalogRarityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
                <Field label="Variant">
                  <select value={catalogVariantFilter} onChange={(e) => setCatalogVariantFilter(e.target.value)}>
                    {catalogVariantOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
                <Field label="Condition">
                  <select value={catalogConditionFilter} onChange={(e) => setCatalogConditionFilter(e.target.value)}>
                    {catalogConditionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
                <Field label="Graded">
                  <select value={catalogGradedFilter} onChange={(e) => setCatalogGradedFilter(e.target.value)}>
                    <option>All</option>
                    <option>Graded</option>
                    <option>Ungraded</option>
                  </select>
                </Field>
                <Field label="Owned">
                  <select value={catalogOwnedFilter} onChange={(e) => setCatalogOwnedFilter(e.target.value)}>
                    <option>All</option>
                    <option>Owned</option>
                    <option>Not owned</option>
                  </select>
                </Field>
                <Field label="Watchlist">
                  <select value={catalogWatchlistFilter} onChange={(e) => setCatalogWatchlistFilter(e.target.value)}>
                    <option>All</option>
                    <option>Watchlist</option>
                    <option>Not watched</option>
                  </select>
                </Field>
                <Field label="Min Market Value">
                  <input type="number" step="0.01" value={catalogMinValue} onChange={(e) => setCatalogMinValue(e.target.value)} />
                </Field>
                <Field label="Max Market Value">
                  <input type="number" step="0.01" value={catalogMaxValue} onChange={(e) => setCatalogMaxValue(e.target.value)} />
                </Field>
              </div>
              <p>Showing {filteredCatalogProducts.length} of {catalogProducts.length} shared Pokemon catalog products.</p>
              <Field label="Sort Catalog">
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
                    <p>Catalog Type: {p.catalogType === "card" ? "Individual Card" : "Sealed Product"}</p>
                    <p>Category: {p.category}</p>
                    <p>Set: {p.setName || "Not listed"}</p>
                    {p.catalogType === "card" ? (
                      <>
                        <p>Pokemon: {p.pokemonName || "Not listed"}</p>
                        <p>Card Number: {p.cardNumber || p.setCode || "Not listed"}</p>
                        <p>Rarity: {p.rarity || "Not listed"}</p>
                        <p>Variant: {p.variant || "Not listed"}</p>
                        <p>Condition: {p.condition || "Not listed"}</p>
                        <p>Language: {p.language || "Not listed"}</p>
                        <p>Graded: {p.graded ? `${p.gradingCompany || "Graded"} ${p.grade || ""}` : "Ungraded"}</p>
                        <p>Raw / NM / LP / Graded: {money(p.marketValueRaw)} / {money(p.marketValueNearMint)} / {money(p.marketValueLightPlayed)} / {money(p.marketValueGraded)}</p>
                      </>
                    ) : (
                      <>
                        <p>Type: {p.productType || "Not listed"}</p>
                        <p>Barcode: {p.barcode || "Not listed"}</p>
                        <p>SKU: {p.sku || p.externalProductId || "Not listed"}</p>
                        <p>MSRP: {p.msrpDisplay && p.msrpDisplay === "Unknown" ? "Unknown" : money(p.msrpPrice)}</p>
                        <p>Pack Count: {p.packCount || "Not listed"}</p>
                      </>
                    )}
                    <p>Set Code: {p.setCode || "Not listed"}</p>
                    <p>Expansion: {p.expansion || p.setName || "Not listed"}</p>
                    <p>Era: {p.productLine || "Not listed"}</p>
                    <p>Release Year: {p.releaseYear || "Not listed"}</p>
                    <p>TideTradr Market Price: {money(getTideTradrMarketInfo(p).currentMarketValue)}</p>
                    <p>Low / Mid / High: {money(p.lowPrice)} / {money(p.midPrice)} / {money(p.highPrice)}</p>
                    <p>Market Source: {getTideTradrMarketInfo(p).sourceName}</p>
                    <p>Confidence: {getTideTradrMarketInfo(p).confidenceLevel}</p>
                    <p>Last Updated: {getTideTradrMarketInfo(p).lastUpdated}</p>
                    {p.marketUrl && <p><a href={p.marketUrl} target="_blank" rel="noreferrer">Open Market Source</a></p>}
                    {p.notes && <p>Notes: {p.notes}</p>}
                    <div className="quick-actions">
                      <button className="edit-button" onClick={() => { applyCatalogProduct(p.id); setActiveTab("addInventory"); }}>Add to Forge</button>
                      <button className="secondary-button" onClick={() => applyCatalogProductToVault(p.id)}>Add to Vault</button>
                      <button className="secondary-button" onClick={() => useCatalogProductInDeal(p.id)}>Use in Deal Finder</button>
                      <button className="secondary-button" onClick={() => { setTideTradrLookupId(p.id); setActiveTab("market"); }}>View Market Info</button>
                      <button className="secondary-button" onClick={() => addProductToTideTradrWatchlist(p.id)}>Add to Watchlist</button>
                      <OverflowMenu onEdit={() => startEditingCatalogProduct(p)} onDelete={() => deleteCatalogProduct(p.id)} editLabel="Edit Catalog Item" deleteLabel="Delete Local Item" />
                    </div>
                    <p className="compact-subtitle">Shared master product</p>
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
          <>
          <section className="tab-summary panel">
            <div>
              <h2>Forge</h2>
              <p>Inventory, sales, expenses, mileage, receipts, and reports.</p>
            </div>
            <div className="summary-pill-row">
              <span>{items.length} items</span>
              <span>{money(totalMarketValue)} market</span>
            </div>
          </section>
          <section className="feature-dropdown-stack">
            <CollapsibleFeatureSection
              title="Inventory"
              summary="Add Inventory, View Inventory, Edit Inventory, Delete Inventory, and Import from Catalog"
              open={isFeatureSectionOpen("ledger_inventory")}
              onToggle={() => toggleFeatureSection("ledger_inventory")}
            >
          <section className="panel">
            <div className="forge-toolbar">
              <div>
                <h2>Forge Inventory</h2>
                <p>Track product count, pack count, cost, market value, status, and listing notes.</p>
              </div>
                <button type="button" onClick={() => setActiveTab("addInventory")}>
                Add Inventory
              </button>
              <button type="button" className="secondary-button" onClick={() => setActiveTab("catalog")}>
                Import from TideTradr
              </button>
              <button type="button" className="secondary-button" onClick={() => openInventoryImportAssistant("Forge")}>
                Import Inventory
              </button>
            </div>
            {importAssistantContext === "Forge" ? renderInventoryImportAssistant() : null}
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
            </CollapsibleFeatureSection>
            <CollapsibleFeatureSection title="Sales" summary="Add Sale, View Sales, Planned Sales, and Sold Items" open={isFeatureSectionOpen("ledger_sales")} onToggle={() => toggleFeatureSection("ledger_sales")}>
              <div className="quick-actions">
                <button type="button" onClick={() => setActiveTab("addSale")}>Add Sale</button>
                <button type="button" onClick={() => setActiveTab("sales")}>View Sales</button>
                <button type="button" className="secondary-button" onClick={() => goToReport("readyToList")}>Planned Sales</button>
                <button type="button" className="secondary-button" onClick={() => setActiveTab("sales")}>Sold Items</button>
              </div>
            </CollapsibleFeatureSection>
            <CollapsibleFeatureSection title="Expenses" summary="Add Expense, View Expenses, and Receipts" open={isFeatureSectionOpen("ledger_expenses")} onToggle={() => toggleFeatureSection("ledger_expenses")}>
              <div className="quick-actions"><button type="button" onClick={() => setActiveTab("expenses")}>Add Expense</button><button type="button" onClick={() => setActiveTab("expenses")}>View Expenses</button><button type="button" className="secondary-button" onClick={() => setActiveTab("expenses")}>Receipts</button></div>
            </CollapsibleFeatureSection>
            <CollapsibleFeatureSection title="Mileage" summary="Add Mileage, Business Miles, and Vehicle Costs" open={isFeatureSectionOpen("ledger_mileage")} onToggle={() => toggleFeatureSection("ledger_mileage")}>
              <div className="quick-actions"><button type="button" onClick={() => setActiveTab("mileage")}>Add Mileage</button><button type="button" onClick={() => setActiveTab("mileage")}>Business Miles</button><button type="button" onClick={() => setActiveTab("vehicles")}>Vehicle Costs</button></div>
            </CollapsibleFeatureSection>
            <CollapsibleFeatureSection title="Receipts" summary="Receipt and item photo tools" open={isFeatureSectionOpen("ledger_receipts")} onToggle={() => toggleFeatureSection("ledger_receipts")}>
              <div className="quick-actions"><button type="button" onClick={() => setActiveTab("addInventory")}>Import Receipt</button><button type="button" onClick={beginScanProduct}>Scan Product</button></div>
            </CollapsibleFeatureSection>
            <CollapsibleFeatureSection title="Reports/Exports" summary="Profit/Loss, Monthly Spending, and Export Data" open={isFeatureSectionOpen("ledger_reports")} onToggle={() => toggleFeatureSection("ledger_reports")}>
              <div className="quick-actions"><button type="button" onClick={() => setActiveTab("reports")}>Profit/Loss</button><button type="button" onClick={() => setActiveTab("dashboard")}>Monthly Spending</button><button type="button" onClick={() => downloadCSV("ember-tide-inventory.csv", items)}>Export Data</button></div>
            </CollapsibleFeatureSection>
          </section>
          </>
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

        {!activeTabLocked && activeTab === "sales" && (
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

        {!activeTabLocked && activeTab === "expenses" && (
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

        {!activeTabLocked && activeTab === "vehicles" && (
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

        {!activeTabLocked && activeTab === "mileage" && (
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

        {!activeTabLocked && activeTab === "reports" && (
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
