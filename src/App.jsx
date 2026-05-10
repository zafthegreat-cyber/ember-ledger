import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import "./App.css";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import SmartAddInventory from "./components/SmartAddInventory";
import SmartAddCatalog from "./components/SmartAddCatalog";
import OverflowMenu from "./components/OverflowMenu";
import BackupExportImport from "./components/BackupExportImport";
import MarketPriceHistoryPanel from "./components/MarketPriceHistoryPanel";
import SmartCatalogSearchBox from "./components/SmartCatalogSearchBox";
import Scout from "./pages/Scout";
import { CATALOG_IMPORT_STATUS, SEALED_PRODUCT_TYPES, SET_SEARCH_METADATA, SHARED_POKEMON_PRODUCTS } from "./data/sharedPokemonCatalog";
import { POKEMON_SETS } from "./data/pokemonSetCatalog";
import { POKEMON_PRODUCT_UPCS, POKEMON_PRODUCTS } from "./data/pokemonProductCatalog";
import { VIRGINIA_STORES_SEED } from "./data/virginiaStoresSeed";
import { MARKET_SOURCES, MARKET_STATUS, MARKET_STATUS_LABELS } from "./data/marketSources";
import { CATALOG_IMPORT_SOURCES, flagCatalogDuplicates, validateCatalogImport } from "./utils/catalogImportUtils";
import { CATALOG_SORT_OPTIONS, compareCatalogProducts, getCardSortMeta } from "./utils/catalogSortUtils";
import { getBestCatalogMatches, explainCatalogMatch } from "./utils/scanMatchUtils";
import {
  cleanupBrowserBetaStorage,
  emptyTidepoolData,
  sanitizeAppLocalData,
  sanitizeScoutLocalData,
  sanitizeTidepoolLocalData,
} from "./utils/betaDataCleanup";
import {
  REVIEW_SECTION_LABELS,
  SUGGESTION_STATUSES,
  SUGGESTION_STORAGE_KEY,
  SUGGESTION_TYPE_LABELS,
  SUGGESTION_TYPES,
  appendAdminReviewLog,
  getSuggestionReviewSection,
  loadSuggestions,
  saveSuggestions,
  submitSuggestion,
  suggestionTitle,
  updateSuggestionRecord,
} from "./utils/suggestionReviewUtils";
import { MARKET_PRICE_CACHE_KEY, loadPriceCache, savePriceCache, updateCachedMarketPrice } from "./services/priceCacheService";
import { CATALOG_PAGE_SIZE, hasCatalogSearchCriteria, searchPokemonCatalog } from "./services/pokemonCatalogSearch";
import {
  getBestAvailableMarketPrice,
  refreshCatalogMarketItems,
  refreshPinnedMarketItems,
  refreshWatchlistMarketItems,
} from "./services/marketDataService";
import {
  FEATURE_LABELS,
  FEATURE_TIERS,
  PAID_HOME_STATS,
  PLAN_TYPES,
  TIER_LABELS,
  USER_ROLES,
  FEATURE_ACCESS,
  getUpgradePrompt,
  getUserPlan,
  getUserTier,
  hasPlanAccess,
  isAdminUser,
  isPaidUser,
} from "./constants/plans";
import { getCurrentUserProfile, makeFallbackUserProfile } from "./lib/userProfile";

function useAutoHideHeader({ disabled = false, resetKey = "" } = {}) {
  const [headerMode, setHeaderMode] = useState("full");
  const lastScrollY = useRef(0);
  const downDistance = useRef(0);
  const upDistance = useRef(0);

  const setStableHeaderMode = (mode) => {
    setHeaderMode((current) => (current === mode ? current : mode));
  };

  useEffect(() => {
    setStableHeaderMode("full");
    lastScrollY.current = typeof window === "undefined" ? 0 : window.scrollY || 0;
    downDistance.current = 0;
    upDistance.current = 0;
  }, [disabled, resetKey]);

  useEffect(() => {
    if (typeof window === "undefined" || disabled) {
      setStableHeaderMode("full");
      return undefined;
    }

    const compactAfterY = 112;
    const downThreshold = 96;
    const revealThreshold = 84;
    const topRevealY = 24;
    const jitterThreshold = 5;
    let ticking = false;

    const headerHasFocus = () => {
      const activeElement = document.activeElement;
      return Boolean(activeElement?.closest?.(".header, .topbar, .main-tabs, .mobile-bottom-nav, .app-header-card"));
    };

    const resetDistances = () => {
      downDistance.current = 0;
      upDistance.current = 0;
    };

    const reveal = () => {
      resetDistances();
      setStableHeaderMode("full");
    };

    const update = () => {
      ticking = false;
      const currentY = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
      const delta = currentY - lastScrollY.current;

      if (currentY <= topRevealY || headerHasFocus()) {
        reveal();
        lastScrollY.current = currentY;
        return;
      }

      if (Math.abs(delta) < jitterThreshold) {
        lastScrollY.current = currentY;
        return;
      }

      if (delta > 0) {
        downDistance.current += delta;
        upDistance.current = 0;
        if (currentY > compactAfterY && downDistance.current >= downThreshold) {
          setStableHeaderMode("compact");
          downDistance.current = 0;
        }
      } else {
        const upwardDelta = Math.abs(delta);
        upDistance.current += upwardDelta;
        downDistance.current = 0;
        if (currentY <= compactAfterY || upDistance.current >= revealThreshold) {
          setStableHeaderMode("full");
          upDistance.current = 0;
        }
      }

      lastScrollY.current = currentY;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };

    const onFocusIn = (event) => {
      if (event.target?.closest?.(".header, .topbar, .main-tabs, .mobile-bottom-nav, .app-header-card")) {
        reveal();
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("focusin", onFocusIn);

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [disabled, resetKey]);

  const revealHeader = () => {
    downDistance.current = 0;
    upDistance.current = 0;
    lastScrollY.current = typeof window === "undefined" ? 0 : window.scrollY || 0;
    setStableHeaderMode("full");
  };

  return { headerMode, isHeaderCompact: headerMode === "compact", revealHeader };
}

const IRS_MILEAGE_RATE = 0.725;
const BETA_LOCAL_MODE = true;
const SUBSCRIPTIONS_LIVE = false;
const FEATURE_GATES_ENABLED = true;
const LOCAL_STORAGE_KEY = "et-tcg-beta-data";
const SCOUT_STORAGE_KEY = "et-tcg-beta-scout";
const TIDEPOOL_STORAGE_KEY = "et-tcg-beta-tidepool";
const FEEDBACK_STORAGE_KEY = "et-tcg-beta-feedback";
const CATALOG_VIEW_STORAGE_KEY = "et-tcg-beta-catalog-view";
const CATALOG_PAGE_SIZE_STORAGE_KEY = "et-tcg-beta-catalog-page-size";
const SUPABASE_CATALOG_PAGE_SIZE = CATALOG_PAGE_SIZE;
const CATALOG_PAGE_SIZE_OPTIONS = [12, 24, 48, 96];
const LONG_LIST_PAGE_SIZE = 12;
const DEFAULT_PURCHASER_NAMES = ["Zena", "Dillon", "Business", "Personal", "Kids", "Other"];
const PEOPLE = DEFAULT_PURCHASER_NAMES;
const CATEGORIES = ["Pokemon", "Makeup", "Clothes", "Candy", "Collectibles", "Supplies", "Other"];
const STATUSES = ["In Stock", "Needs Photos", "Needs Market Check", "Ready to List", "Listed", "Sold", "Held", "Personal Collection", "Damaged"];
const PLATFORMS = ["eBay", "Mercari", "Whatnot", "Facebook Marketplace", "In-Store", "Instagram", "TikTok Shop", "Other"];
const VAULT_CATEGORIES = ["Personal collection", "Keep sealed", "Rip later", "Trade", "Favorite", "Wishlist", "Set goal", "Kid collection"];
const VAULT_STATUS_OPTIONS = [
  { value: "personal_collection", label: "Personal Collection", description: "Keeping long term." },
  { value: "at_home", label: "At home", description: "Owned and stored at home." },
  { value: "at_store", label: "At store", description: "Owned and stored at a store or booth." },
  { value: "listed", label: "Listed", description: "Owned and currently listed for sale or trade." },
  { value: "sold", label: "Sold", description: "Sold or no longer owned." },
  { value: "trade_pile", label: "Trade pile", description: "Owned and available for trade." },
  { value: "gift_donation", label: "Gift / donation", description: "Set aside for gifting or donation." },
  { value: "sealed", label: "Sealed / Holding", description: "Unopened or held product." },
  { value: "wishlist", label: "Wishlist", description: "Wanted but not owned yet." },
  { value: "ready_for_forge", label: "Ready for Forge", description: "May sell later." },
  { value: "archived", label: "Archived", description: "No longer active." },
  { value: "held", label: "Held", description: "Legacy held status." },
  { value: "ripped_opened", label: "Ripped / Opened" },
  { value: "moved_to_forge", label: "Moved to Forge" },
  { value: "traded", label: "Traded" },
];
const VAULT_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "personal_collection", label: "Personal Collection" },
  { value: "sealed", label: "Sealed / Holding" },
  { value: "moved_to_forge", label: "Moved to Forge" },
  { value: "wishlist", label: "Wishlist / Held" },
  { value: "sold_archived", label: "Sold / Archived" },
];
const ACTIVE_VAULT_STATUSES = new Set(["personal_collection", "at_home", "at_store", "listed", "trade_pile", "gift_donation", "held", "sealed", "ripped_opened", "ready_for_forge"]);
const VAULT_STORAGE_LOCATIONS = ["", "Binder", "ETB", "Shelf", "Box", "Display case", "Closet", "Other"];
const VAULT_CONDITIONS = ["", "Mint", "Near Mint", "Lightly Played", "Damaged", "Sealed", "Box damage", "Missing wrap", "Unknown"];
const VAULT_SOURCE_OPTIONS = ["Manual", "TideTradr", "Barcode scan", "Receipt/photo", "Import", "Forge copy"];
const BLANK_VAULT_FORM = {
  name: "",
  vaultCategory: "Personal collection",
  status: "Personal Collection",
  vaultStatus: "personal_collection",
  quantity: 1,
  unitCost: "",
  msrpPrice: "",
  marketPrice: "",
  salePrice: "",
  packCount: "",
  setName: "",
  productType: "",
  store: "",
  storageLocation: "",
  condition: "",
  sealedCondition: "",
  conditionName: "Near Mint",
  language: "English",
  finish: "",
  printing: "",
  conditionNotes: "",
  sourceType: "Manual",
  upc: "",
  sku: "",
  catalogProductId: "",
  catalogVariantId: "",
  tideTradrProductId: "",
  purchaseDate: "",
  receiptImage: "",
  itemImage: "",
  notes: "",
};
const BLANK_MULTI_DESTINATION_FORM = {
  itemName: "",
  category: "Pokemon",
  productType: "",
  setName: "",
  variant: "",
  catalogProductId: "",
  upcSku: "",
  msrpPrice: "",
  marketPrice: "",
  notes: "",
  destinations: {
    vault: false,
    wishlist: false,
    forge: false,
    tidetradr: false,
  },
  vault: {
    quantity: 1,
    vaultStatus: "personal_collection",
    vaultCategory: "Personal collection",
    unitCost: "",
    purchaseDate: "",
    storageLocation: "",
    notes: "",
  },
  wishlist: {
    quantity: 1,
    priority: "Medium",
    targetPrice: "",
    desiredCondition: "",
    notes: "",
    alertMarketPrice: true,
    addToMarketWatch: false,
  },
  forge: {
    quantity: 1,
    unitCost: "",
    plannedSellPrice: "",
    source: "",
    businessCategory: "Pokemon",
    conditionName: "",
    notes: "",
  },
  tidetradr: {
    existingProductId: "",
    action: "watchlist",
    msrpPrice: "",
    upc: "",
    sku: "",
    setName: "",
    productType: "",
    releaseDate: "",
    sourceUrl: "",
    correctionNotes: "",
  },
};
const BLANK_QUICK_FIND_FORM = {
  lookup: "",
};
const SCAN_DESTINATIONS = [
  { value: "none", label: "Choose after review" },
  { value: "vault", label: "The Vault" },
  { value: "forge", label: "Forge" },
  { value: "wishlist", label: "Add to Wishlist" },
  { value: "tidetradr", label: "TideTradr lookup" },
  { value: "deal_finder", label: "Deal Finder" },
  { value: "watchlist", label: "Watchlist" },
  { value: "pinned", label: "Pinned Market Watch" },
  { value: "scout_report", label: "Scout Report" },
];
const USER_TYPES = ["collector", "seller", "scout", "budget", "all_in_one"];
const EXPENSE_CATEGORIES = [
  "Inventory/Product Cost",
  "Shipping",
  "Packaging Supplies",
  "Platform Fees",
  "Payment Processing Fees",
  "Mileage/Vehicle",
  "Marketing",
  "Events/Giveaways",
  "Supplies",
  "Software/Subscriptions",
  "Miscellaneous",
];
const MARKETING_PLATFORMS = ["Facebook", "Instagram", "TikTok", "Discord", "Website", "Marketplace", "Other"];
const MARKETING_GOALS = ["sales", "followers", "event", "donations", "awareness", "giveaway"];
const TIDEPOOL_POST_TYPES = [
  "General post",
  "Restock sighting",
  "Product sighting",
  "Question",
  "Store tip",
  "Deal sighting",
  "Event",
  "Giveaway/donation",
  "Looking for item",
  "Help/request",
  "Announcement/admin post",
];
const TIDEPOOL_FEED_FILTERS = [
  "Latest",
  "Nearby",
  "Verified",
  "Questions",
  "Events",
  "Deals",
  "Store Tips",
  "My Posts",
  "Saved",
  "Needs Review",
];
const BLANK_TIDEPOOL_POST_FORM = {
  postType: "General post",
  title: "",
  body: "",
  city: "",
  state: "VA",
  zip: "",
  photoUrl: "",
};
const MARKETPLACE_LISTING_TYPES = ["For Sale", "For Trade", "Looking For", "Free / Donation", "Kid-friendly deal"];
const MARKETPLACE_STATUSES = ["Draft", "Pending Review", "Active", "Sold", "Traded", "Removed", "Flagged", "Archived"];
const MARKETPLACE_REPORT_REASONS = ["Wrong item", "Fake/scam", "Price gouging", "Inappropriate", "Duplicate", "Sold already", "Other"];
const BLANK_MARKETPLACE_FORM = {
  listingType: "For Sale",
  title: "",
  description: "",
  category: "Pokemon",
  productType: "",
  setName: "",
  condition: "Unknown",
  quantity: 1,
  askingPrice: "",
  tradeValue: "",
  locationCity: "",
  locationState: "VA",
  pickupOnly: true,
  shippingAvailable: false,
  photos: [],
  photoUrl: "",
  catalogItemId: "",
  upc: "",
  sku: "",
  intendedForKids: false,
  contactPreference: "Request contact",
  sellerNotes: "",
  tags: "",
  sourceType: "manual",
  sourceItemId: "",
};
const FORGE_IMPORT_BLANK = {
  fileName: "",
  importType: "Inventory",
  sourceApp: "",
  detectedColumns: [],
  previewRows: [],
  mappingNotes: "",
};
const blankExpense = {
  date: "",
  vendor: "",
  category: "Supplies",
  subcategory: "",
  buyer: "Zena",
  amount: "",
  paymentMethod: "",
  linkedItemId: "",
  linkedSaleId: "",
  notes: "",
  receiptImage: "",
  taxDeductible: false,
  campaignName: "",
  platform: "",
  goal: "",
  startDate: "",
  endDate: "",
  linkedSales: "",
  resultsNotes: "",
};

function normalizeVaultStatus(item = {}) {
  const raw = String(item.vaultStatus || item.status || item.actionNotes || "").toLowerCase();
  if (raw.includes("moved_to_forge") || raw.includes("moved to forge")) return "moved_to_forge";
  if (raw.includes("ready_for_forge") || raw.includes("ready for forge")) return "ready_for_forge";
  if (raw.includes("archived") || raw.includes("archive")) return "archived";
  if (raw.includes("at_home") || raw.includes("at home")) return "at_home";
  if (raw.includes("at_store") || raw.includes("at store")) return "at_store";
  if (raw.includes("listed")) return "listed";
  if (raw.includes("sold")) return "sold";
  if (raw.includes("trade_pile") || raw.includes("trade pile")) return "trade_pile";
  if (raw.includes("gift") || raw.includes("donation")) return "gift_donation";
  if (raw.includes("traded") || raw === "trade") return "traded";
  if (raw.includes("ripped") || raw.includes("opened") || raw.includes("rip later")) return "ripped_opened";
  if (raw.includes("wishlist") || raw.includes("wish")) return "wishlist";
  if (raw.includes("sealed") || raw.includes("keep sealed")) return "sealed";
  if (raw.includes("held") || raw.includes("hold")) return "held";
  return "personal_collection";
}

function vaultStatusLabel(value) {
  return VAULT_STATUS_OPTIONS.find((status) => status.value === value)?.label || "Personal Collection";
}

function isActiveVaultItem(item = {}) {
  return ACTIVE_VAULT_STATUSES.has(normalizeVaultStatus(item));
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "" && String(value).trim().toLowerCase() !== "unknown";
}
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
const CORE_HOME_STAT_KEYS = [
  "collection_value",
  "forge_inventory_value",
  "monthly_spending",
  "profit_after_expenses",
];
const HOME_STAT_DEFAULTS = {
  collector: CORE_HOME_STAT_KEYS,
  seller: CORE_HOME_STAT_KEYS,
  scout: CORE_HOME_STAT_KEYS,
  budget: ["monthly_spending", "market_value", "market_vs_msrp_percent", "savings_vs_msrp"],
  all_in_one: HOME_STAT_KEYS,
};
const HOME_VIEW_PRESETS = {
  collector: {
    label: "Collector",
    userType: "collector",
    dashboardPreset: "collector",
    stats: ["collection_value", "monthly_spending", "market_value", "savings_vs_msrp"],
  },
  seller: {
    label: "Seller",
    userType: "seller",
    dashboardPreset: "seller",
    stats: ["forge_inventory_value", "monthly_spending", "profit_after_expenses", "items_sold"],
  },
  budget: {
    label: "Budget",
    userType: "budget",
    dashboardPreset: "parent",
    stats: ["monthly_spending", "market_value", "market_vs_msrp_percent", "savings_vs_msrp"],
  },
  scout: {
    label: "Scout",
    userType: "scout",
    dashboardPreset: "scout",
    stats: ["monthly_spending", "market_value", "savings_vs_msrp", "collection_value"],
  },
  all_in_one: {
    label: "All-in-one",
    userType: "all_in_one",
    dashboardPreset: "advanced",
    stats: HOME_STAT_KEYS,
  },
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

const PRODUCT_TYPE_ALIASES = {
  "Elite Trainer Box": ["etb", "trainer box"],
  "Pokemon Center Elite Trainer Box": ["pc etb", "pokemon center etb"],
  "Booster Bundle": ["bundle", "booster bundle", "bbundle", "bb"],
  "Booster Box": ["booster box", "bb", "box"],
  "Sleeved Booster": ["sleeve", "sleeved", "single pack", "blister"],
  "3-Pack Blister": ["3pk", "3 pack", "three pack", "triple blister", "blister"],
  "Checklane Blister": ["checklane", "check lane", "blister"],
  "Mini Tin": ["mini tin", "tin"],
  "Collection Box": ["collection", "box"],
  "Ex Box": ["ex box"],
  "Premium Collection": ["premium"],
  "Ultra Premium Collection": ["upc", "ultra premium"],
  "First Partner Pack": ["first partner", "fpp"],
  "Build & Battle Box": ["b&b", "build battle"],
  "Build & Battle Stadium": ["stadium"],
  "Trainer's Toolkit": ["toolkit", "trainer toolkit"],
};

const POKEMON_ALIASES = {
  Charizard: ["char", "zard", "charizard"],
  Pikachu: ["pika", "chu", "pikachu"],
  Mimikyu: ["mimi", "mimikyu"],
  Gengar: ["gengar"],
  Umbreon: ["umbreon", "moonbreon"],
  Sylveon: ["sylveon"],
  Rayquaza: ["ray", "rayquaza"],
  Giratina: ["tina", "giratina"],
  Snorlax: ["lax", "snorlax"],
  Ditto: ["ditto"],
  Mewtwo: ["mewtwo"],
  Mew: ["mew"],
  Eevee: ["eevee"],
  Phantump: ["phantump"],
  Greninja: ["greninja"],
  Arceus: ["arceus"],
  Lugia: ["lugia"],
  Magikarp: ["magikarp", "karp"],
};

const RARITY_VARIANT_ALIASES = {
  "Special Illustration Rare": ["sir", "special illustration"],
  "Illustration Rare": ["ir", "illustration rare"],
  "Secret Rare": ["secret"],
  "Hyper Rare": ["hyper"],
  "Ultra Rare": ["ur"],
  "Full Art": ["fa", "full art"],
  "Alternate Art": ["alt", "alt art", "alternate"],
  "Reverse Holo": ["reverse", "rh"],
  "Holo Rare": ["holo"],
  Promo: ["promo"],
  "Black Star Promo": ["bsp", "black star"],
  VMAX: ["vmax"],
  VSTAR: ["vstar"],
};

const STORE_ALIASES = {
  Walmart: ["wm", "wally", "walmart"],
  Target: ["tgt", "target"],
  "Barnes & Noble": ["b&n", "bn", "barnes"],
  GameStop: ["gs", "gamestop"],
  "Five Below": ["5 below", "five below", "5b"],
  "Best Buy": ["bbuy", "best buy"],
  Greenbrier: ["greenbrier"],
};

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/pok[eé]mon/g, "pokemon")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9/.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchTokens(value) {
  return normalizeSearchText(value).split(/\s+/).filter(Boolean);
}

function aliasEntriesFromMap(map, type) {
  return Object.entries(map).flatMap(([canonical, aliases]) => [
    { canonical, alias: canonical, type },
    ...aliases.map((alias) => ({ canonical, alias, type })),
  ]);
}

const SEARCH_ALIAS_ENTRIES = [
  ...Object.entries(SET_SEARCH_METADATA).flatMap(([setName, metadata]) => [
    { canonical: setName, alias: setName, type: "set" },
    { canonical: setName, alias: metadata.setCode, type: "setCode" },
    ...(metadata.setAliases || []).map((alias) => ({ canonical: setName, alias, type: "set" })),
  ]),
  ...aliasEntriesFromMap(PRODUCT_TYPE_ALIASES, "productType"),
  ...aliasEntriesFromMap(POKEMON_ALIASES, "pokemon"),
  ...aliasEntriesFromMap(RARITY_VARIANT_ALIASES, "rarity"),
  ...aliasEntriesFromMap(STORE_ALIASES, "store"),
].filter((entry) => entry.alias);

function expandSearchQuery(query) {
  const normalized = normalizeSearchText(query);
  const tokens = searchTokens(query);
  const phrases = new Set([normalized, ...tokens]);
  SEARCH_ALIAS_ENTRIES.forEach((entry) => {
    const alias = normalizeSearchText(entry.alias);
    if (!alias) return;
    const aliasTokens = searchTokens(alias);
    const exactPhrase = normalized === alias || normalized.includes(alias);
    const exactToken = aliasTokens.length === 1 && tokens.includes(alias);
    if (exactPhrase || exactToken) {
      phrases.add(normalizeSearchText(entry.canonical));
      searchTokens(entry.canonical).forEach((token) => phrases.add(token));
      if (entry.type === "setCode") phrases.add(alias);
    }
  });
  return { normalized, tokens, phrases: [...phrases].filter(Boolean) };
}

function searchableText(parts) {
  return normalizeSearchText(parts.flatMap((part) => Array.isArray(part) ? part : [part]).filter(Boolean).join(" "));
}

function scoreSearchCandidate(queryInfo, candidate) {
  const text = searchableText(candidate.fields);
  const exactIds = (candidate.exactIds || []).map(normalizeSearchText).filter(Boolean);
  const cardNumbers = (candidate.cardNumbers || []).map(normalizeSearchText).filter(Boolean);
  const setCodes = (candidate.setCodes || []).map(normalizeSearchText).filter(Boolean);
  const aliases = (candidate.aliases || []).map(normalizeSearchText).filter(Boolean);
  const names = (candidate.names || []).map(normalizeSearchText).filter(Boolean);
  const { normalized, tokens, phrases } = queryInfo;
  let score = 0;
  let reason = "";

  if (exactIds.some((id) => id && id === normalized)) return { score: 1000, reason: "Exact UPC/SKU/barcode match" };
  if (cardNumbers.some((number) => number && number === normalized)) return { score: 940, reason: "Exact card number match" };
  if (setCodes.some((code) => code && code === normalized)) {
    score += 880;
    reason = "Exact set code match";
  }
  if (names.some((name) => name === normalized)) {
    score += 820;
    reason = "Exact name match";
  }
  if (aliases.some((alias) => alias === normalized || tokens.includes(alias))) {
    score += 760;
    reason = "Exact alias match";
  }

  const phraseHits = phrases.filter((phrase) => phrase.length > 1 && text.includes(phrase)).length;
  const tokenHits = tokens.filter((token) => text.includes(token) || aliases.some((alias) => alias.includes(token))).length;
  score += phraseHits * 80 + tokenHits * 38;

  const setHit = setCodes.some((code) => tokens.includes(code)) || aliases.some((alias) => tokens.includes(alias));
  const typeHit = (candidate.productTypeAliases || []).map(normalizeSearchText).some((alias) => normalized.includes(alias) || tokens.includes(alias));
  const pokemonHit = (candidate.pokemonAliases || []).map(normalizeSearchText).some((alias) => normalized.includes(alias) || tokens.includes(alias));
  const rarityHit = (candidate.rarityAliases || []).map(normalizeSearchText).some((alias) => normalized.includes(alias) || tokens.includes(alias));
  if (setHit && typeHit) {
    score += 240;
    reason = reason || "Set + product type match";
  }
  if (pokemonHit && rarityHit) {
    score += 220;
    reason = reason || "Pokemon + rarity/variant match";
  }
  if (tokenHits > 0 && !reason) reason = "Partial/fuzzy match";
  return { score, reason };
}

function toNumber(value, fallback = 0) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

function makeTidepoolPost(overrides = {}) {
  const now = new Date().toISOString();

  return {
    postId: overrides.postId || makeId("tidepool-post"),
    userId: overrides.userId || "local-beta",
    displayName: overrides.displayName || "Local Scout",
    postType: overrides.postType || "General post",
    title: overrides.title || "",
    body: overrides.body || "",
    storeId: overrides.storeId || "",
    catalogItemId: overrides.catalogItemId || "",
    city: overrides.city || "",
    state: overrides.state || "VA",
    zip: overrides.zip || "",
    photoUrl: overrides.photoUrl || "",
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
    status: overrides.status || "active",
    verificationStatus: overrides.verificationStatus || "unverified",
    commentCount: Number(overrides.commentCount || 0),
    reactionCount: Number(overrides.reactionCount || 0),
    saved: Boolean(overrides.saved),
    commentsLocked: Boolean(overrides.commentsLocked),
    flagged: Boolean(overrides.flagged),
    sourceType: overrides.sourceType || "user",
  };
}

function createDefaultTidepoolData() {
  return emptyTidepoolData();
}

function getCatalogImage(product = {}) {
  return product.imageUrl || product.imageLarge || product.imageSmall || product.images?.large || product.images?.small || "";
}

function getImageSourceLabel(item = {}) {
  const source = item.imageSource || item.itemImageSource || "";
  const status = item.imageStatus || item.itemImageStatus || "";
  const value = status || source || (getCatalogImage(item) || item.itemImage ? "manual" : "placeholder");
  const labels = {
    pokemon_tcg_api: "Pokemon TCG API",
    tcgdex: "TCGdex",
    best_buy: "Best Buy",
    ebay: "Marketplace",
    tcgcsv: "TCGCSV",
    user: "User photo",
    manual: "Manual image",
    mock: "Image needs review",
    placeholder: "Image needed",
    official: "Official/API",
    api: "API",
    retailer: "Retailer",
    marketplace: "Marketplace",
    unknown: "Unknown image",
  };
  return labels[value] || labels[source] || labels[status] || String(value).replaceAll("_", " ");
}

function getDefaultImageSource(item = {}) {
  if (item.catalogType === "card") {
    if (item.images?.small || item.images?.large || item.imageSmall || item.imageLarge) return "pokemon_tcg_api";
    if (item.imageUrl) return item.imageSource || "manual";
    return "placeholder";
  }
  if (item.imageUrl) return item.imageSource || "manual";
  return "placeholder";
}

function getDefaultImageStatus(item = {}) {
  if (item.imageStatus) return item.imageStatus;
  const source = getDefaultImageSource(item);
  if (source === "pokemon_tcg_api" || source === "tcgdex") return "api";
  if (["best_buy", "tcgcsv"].includes(source)) return "retailer";
  if (source === "ebay") return "marketplace";
  return source;
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
  if (userType === "parent") return "budget";
  if (userType === "advanced") return "all_in_one";
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
  const map = { collector: "collector", seller: "seller", scout: "scout", budget: "parent", all_in_one: "advanced" };
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

function normalizeLocalSubscriptionProfile(savedProfile = {}) {
  return {
    subscriptionPlan: savedProfile.subscriptionPlan || savedProfile.subscription_plan || PLAN_TYPES.FREE,
    featureTier: savedProfile.featureTier || savedProfile.feature_tier || savedProfile.tier || PLAN_TYPES.FREE,
    tier: savedProfile.tier || savedProfile.featureTier || savedProfile.feature_tier || PLAN_TYPES.FREE,
    userRole: savedProfile.userRole || savedProfile.user_role || USER_ROLES.USER,
    isAdmin: Boolean(savedProfile.isAdmin || savedProfile.is_admin),
    subscriptionStatus: savedProfile.subscriptionStatus || savedProfile.subscription_status || "active",
    subscriptionStartedAt: savedProfile.subscriptionStartedAt || savedProfile.subscription_started_at || "",
    subscriptionExpiresAt: savedProfile.subscriptionExpiresAt || savedProfile.subscription_expires_at || "",
    lifetimeAccess: Boolean(savedProfile.lifetimeAccess || savedProfile.lifetime_access),
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
    imageUrl: product.imageUrl || product.images?.large || product.images?.small || "",
    imageSmall: product.imageSmall || product.images?.small || "",
    imageLarge: product.imageLarge || product.images?.large || product.imageUrl || "",
    imageSource: product.imageSource || getDefaultImageSource(product),
    imageSourceUrl: product.imageSourceUrl || product.sourceUrl || "",
    imageStatus: product.imageStatus || getDefaultImageStatus(product),
    imageLastUpdated: product.imageLastUpdated || product.lastUpdated || now,
    imageNeedsReview: Boolean(product.imageNeedsReview || (product.matchConfidence && Number(product.matchConfidence) < 80)),
    marketPrice: toNumber(product.marketValue || product.marketValueNearMint || product.marketValueRaw),
    lowPrice: toNumber(product.marketValueLightPlayed || product.lowPrice),
    midPrice: toNumber(product.marketValueNearMint || product.marketValue || product.midPrice),
    highPrice: toNumber(product.marketValueGraded || product.highPrice),
    marketSource: product.marketSource || "Beta estimate",
    marketLastUpdated: product.marketLastUpdated || now,
    marketConfidenceLevel: product.marketConfidenceLevel || "Estimated",
    sourceType: product.sourceType || "estimated",
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
    notes: product.notes || "TideTradr beta catalog item. Market data is estimated/manual unless labeled otherwise.",
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
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function Field({ label, children }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value || "Not listed"}</strong>
    </div>
  );
}

function clampPageSize(value, fallback = 24) {
  const size = Number(value || fallback);
  return CATALOG_PAGE_SIZE_OPTIONS.includes(size) ? size : fallback;
}

function getDefaultCatalogPageSize() {
  if (typeof window === "undefined") return 24;
  const saved = clampPageSize(localStorage.getItem(CATALOG_PAGE_SIZE_STORAGE_KEY), 0);
  if (saved) return saved;
  return window.innerWidth >= 900 ? 48 : 24;
}

function clampPage(page, pageCount) {
  return Math.min(Math.max(1, Number(page || 1)), Math.max(1, Number(pageCount || 1)));
}

function getPageCount(totalCount, pageSize = LONG_LIST_PAGE_SIZE) {
  return Math.max(1, Math.ceil(Number(totalCount || 0) / Math.max(1, Number(pageSize || LONG_LIST_PAGE_SIZE))));
}

function getPagedItems(items = [], page = 1, pageSize = LONG_LIST_PAGE_SIZE) {
  const pageCount = getPageCount(items.length, pageSize);
  const currentPage = clampPage(page, pageCount);
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

function pageNumberItems(page = 1, pageCount = 1, maxVisible = 7) {
  const currentPage = clampPage(page, pageCount);
  const totalPages = Math.max(1, Number(pageCount || 1));
  if (totalPages <= maxVisible) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const siblings = maxVisible <= 5 ? 1 : 2;
  const pages = new Set([1, totalPages, currentPage]);
  for (let offset = 1; offset <= siblings; offset += 1) {
    if (currentPage - offset > 1) pages.add(currentPage - offset);
    if (currentPage + offset < totalPages) pages.add(currentPage + offset);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) result.push(`gap-${sorted[index - 1]}-${value}`);
    result.push(value);
  });
  return result;
}

function PaginationControls({
  label = "Results",
  page = 1,
  pageCount = 1,
  totalCount = 0,
  pageSize = LONG_LIST_PAGE_SIZE,
  pageSizeOptions = null,
  onPageChange,
  onPageSizeChange,
  disabled = false,
  compact = false,
}) {
  const safePageCount = Math.max(1, Number(pageCount || 1));
  const safePage = clampPage(page, safePageCount);
  const safeTotal = Number(totalCount || 0);
  const start = safeTotal ? (safePage - 1) * pageSize + 1 : 0;
  const end = safeTotal ? Math.min(safePage * pageSize, safeTotal) : 0;
  const visiblePages = pageNumberItems(safePage, safePageCount, compact ? 5 : 7);

  if (safeTotal <= pageSize && !pageSizeOptions) return null;

  return (
    <nav className={`pagination-controls ${compact ? "pagination-controls--compact" : ""}`.trim()} aria-label={`${label} pagination`}>
      <div className="pagination-count">
        {safeTotal ? `Showing ${start}-${end} of ${safeTotal} ${label.toLowerCase()}` : `No ${label.toLowerCase()}`}
      </div>
      <div className="pagination-actions">
        <button type="button" className="secondary-button" disabled={disabled || safePage <= 1} onClick={() => onPageChange?.(safePage - 1)}>
          Previous
        </button>
        <div className="pagination-page-list" aria-label="Page numbers">
          {visiblePages.map((item) =>
            typeof item === "number" ? (
              <button
                type="button"
                key={item}
                className={item === safePage ? "active" : ""}
                aria-current={item === safePage ? "page" : undefined}
                disabled={disabled || item === safePage}
                onClick={() => onPageChange?.(item)}
              >
                {item}
              </button>
            ) : (
              <span key={item} aria-hidden="true">...</span>
            )
          )}
        </div>
        <span className="pagination-mobile-current">Page {safePage} of {safePageCount}</span>
        <button type="button" className="secondary-button" disabled={disabled || safePage >= safePageCount} onClick={() => onPageChange?.(safePage + 1)}>
          Next
        </button>
      </div>
      {pageSizeOptions?.length ? (
        <label className="pagination-size-control">
          <span>Per page</span>
          <select value={pageSize} disabled={disabled} onChange={(event) => onPageSizeChange?.(Number(event.target.value))}>
            {pageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      ) : null}
    </nav>
  );
}

function QuickActionGrid({ actions = [], className = "", ariaLabel = "Quick actions" }) {
  const visibleActions = actions.filter(Boolean);
  if (!visibleActions.length) return null;

  return (
    <div className={`quick-action-card-grid ${className}`.trim()} aria-label={ariaLabel}>
      {visibleActions.map((action) => {
        const title = action.title || action.label || "Action";
        return (
          <button
            key={action.key || title}
            type="button"
            className={`quick-action-card ${action.primary ? "primary" : "secondary-button"} ${action.className || ""}`.trim()}
            onClick={action.onClick}
            disabled={action.disabled}
            aria-label={action.ariaLabel || title}
          >
            <span>{title}</span>
            {action.subtitle ? <small>{action.subtitle}</small> : null}
          </button>
        );
      })}
    </div>
  );
}

function PageHeader({
  className = "",
  title,
  subtitle,
  actions = null,
  summaryLabel = "",
  summary = null,
  tabs = [],
  activeTab = "",
  onTabChange = null,
  children = null,
}) {
  return (
    <section className={`standard-page-header ${className}`.trim()}>
      <div className="standard-page-header-main">
        <div className="standard-page-header-copy">
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="standard-page-header-actions">{actions}</div> : null}
      </div>
      {summary ? (
        <div className="standard-page-header-summary">
          {summaryLabel ? <div className="standard-page-header-label">{summaryLabel}</div> : null}
          {summary}
        </div>
      ) : null}
      {children ? <div className="standard-page-header-body">{children}</div> : null}
      {tabs.length ? (
        <div className="standard-page-header-tabs" aria-label={`${title} navigation`}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={activeTab === tab.key ? "active" : ""}
              onClick={() => onTabChange?.(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
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
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function start() {
      try {
        setScannerError("");
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
  }, [onScan, retryKey]);

  return (
    <div className="panel scanner-camera-panel">
      <h2>Scan Barcode</h2>
      {scannerError ? (
        <div className="scanner-camera-empty">
          <h3>Camera unavailable.</h3>
          <p>Check browser permissions or enter the UPC/card name manually.</p>
          <div className="quick-actions">
            <button type="button" onClick={() => setRetryKey((current) => current + 1)}>Try Camera Again</button>
            <button type="button" className="secondary-button" onClick={onClose}>Enter Manually</button>
          </div>
        </div>
      ) : (
        <>
          <p>Point your camera at the barcode. Use good lighting and hold the barcode flat.</p>
          <video ref={videoRef} autoPlay muted playsInline className="scanner-video" />
          <button type="button" className="secondary-button" onClick={onClose}>Enter Manually</button>
        </>
      )}
    </div>
  );
}

function UpgradeScreen({ featureKey, onBack, subscriptionsLive = false }) {
  const featureLabel = FEATURE_LABELS[featureKey] || "This feature";
  return (
    <section className="panel upgrade-panel">
      <h2>Upgrade Required</h2>
      <p>
        {subscriptionsLive
          ? getUpgradePrompt(featureKey)
          : `${featureLabel} is planned for paid tiers. Paid plans are not active yet. This is a preview for beta planning.`}
      </p>
      <div className="quick-actions">
        <button type="button" disabled>{subscriptionsLive ? "Upgrade to Paid" : "Upgrade Coming Soon"}</button>
        {subscriptionsLive ? <button type="button" className="secondary-button" disabled>Manage Subscription</button> : null}
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
  const [quickAddMenuOpen, setQuickAddMenuOpen] = useState(false);
  const quickAddRef = useRef(null);
  const quickAddButtonRef = useRef(null);
  const quickAddMenuRef = useRef(null);
  const [appSearchQuery, setAppSearchQuery] = useState("");
  const [menuSectionsOpen, setMenuSectionsOpen] = useState({});
  const [feedbackDialog, setFeedbackDialog] = useState(null);
  const [feedbackForm, setFeedbackForm] = useState({
    whatHappened: "",
    page: "",
    steps: "",
    screenshotName: "",
    metadata: {},
  });
  const [userSearchAliases, setUserSearchAliases] = useState([]);
  const [aliasDraft, setAliasDraft] = useState({ alias: "", canonical: "", type: "personal" });
  const [tidepoolOpen, setTidepoolOpen] = useState(false);
  const [tidepoolFilter, setTidepoolFilter] = useState("Latest");
  const [tidepoolPage, setTidepoolPage] = useState(1);
  const [tidepoolPosts, setTidepoolPosts] = useState([]);
  const [tidepoolComments, setTidepoolComments] = useState([]);
  const [tidepoolReactions, setTidepoolReactions] = useState([]);
  const [tidepoolPostForm, setTidepoolPostForm] = useState(BLANK_TIDEPOOL_POST_FORM);
  const [tidepoolCommentDrafts, setTidepoolCommentDrafts] = useState({});
  const [scoutView, setScoutView] = useState("main");
  const [whatDidISeeSeedProduct, setWhatDidISeeSeedProduct] = useState(null);
  const [scoutReportFilter, setScoutReportFilter] = useState("Latest");
  const [scoutReportSort, setScoutReportSort] = useState("Newest first");
  const [scoutSectionsOpen, setScoutSectionsOpen] = useState({
    quickActions: true,
    reports: true,
    alerts: false,
    stores: false,
    predictions: false,
    myReports: false,
    needsReview: false,
  });
  const [scoutReportsPage, setScoutReportsPage] = useState(1);
  const [scoutScoreModalOpen, setScoutScoreModalOpen] = useState(false);
  const [selectedScoutReport, setSelectedScoutReport] = useState(null);
  const [scoutReportDeleteTarget, setScoutReportDeleteTarget] = useState(null);
  const scoutReportsRef = useRef(null);
  const [homeSubTab, setHomeSubTab] = useState("overview");
  const [forgeSubTab, setForgeSubTab] = useState("overview");
  const [scoutSubTabTarget, setScoutSubTabTarget] = useState({ tab: "overview", id: 0 });
  const [vaultSubTab, setVaultSubTab] = useState("overview");
  const [vaultFilter, setVaultFilter] = useState("all");
  const [vaultSearch, setVaultSearch] = useState("");
  const [vaultSort, setVaultSort] = useState("newest");
  const [vaultPage, setVaultPage] = useState(1);
  const [selectedVaultDetailId, setSelectedVaultDetailId] = useState("");
  const [selectedForgeDetailId, setSelectedForgeDetailId] = useState("");
  const [vaultForgeTransfer, setVaultForgeTransfer] = useState(null);
  const [vaultDuplicateItem, setVaultDuplicateItem] = useState(null);
  const [vaultPotentialDuplicate, setVaultPotentialDuplicate] = useState(null);
  const [vaultSaving, setVaultSaving] = useState(false);
  const [vaultMoving, setVaultMoving] = useState(false);
  const [vaultToast, setVaultToast] = useState("");
  const [tideTradrSubTab, setTideTradrSubTab] = useState("overview");
  const [marketWatchPage, setMarketWatchPage] = useState(1);
  const [featureSectionsOpen, setFeatureSectionsOpen] = useState({
    home_dashboard_cards: true,
    home_quick_actions: false,
    forge_inventory: false,
    forge_catalog: false,
    forge_tidetradr: false,
    forge_marketplace: false,
    vault_summary: true,
    vault_add: false,
    vault_tidetradr: false,
    scout_stores: false,
    scout_recommendations: false,
    scout_store_tracker: false,
    scout_tidetradr: false,
    market_summary: false,
    market_lookup: false,
    market_watchlist: false,
    market_deal_finder: false,
    market_sources: false,
    market_filters: false,
    menu_profile: false,
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
  const [cloudSyncPreference, setCloudSyncPreference] = useState("local");
  const [subscriptionProfile, setSubscriptionProfile] = useState({
    subscriptionPlan: PLAN_TYPES.FREE,
    tier: PLAN_TYPES.FREE,
    userRole: "user",
    isAdmin: false,
    subscriptionStatus: "active",
    lifetimeAccess: false,
  });
  const [currentUserProfile, setCurrentUserProfile] = useState(() => makeFallbackUserProfile(null));
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [items, setItems] = useState([]);
  const [purchasers, setPurchasers] = useState(createDefaultPurchasers);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogPagedResultIds, setCatalogPagedResultIds] = useState([]);
  const [tideTradrWatchlist, setTideTradrWatchlist] = useState([]);
  const [tideTradrLookupId, setTideTradrLookupId] = useState("");
  const [selectedCatalogDetailId, setSelectedCatalogDetailId] = useState("");
  const [catalogDetailExtras, setCatalogDetailExtras] = useState({});
  const [catalogVariantSelection, setCatalogVariantSelection] = useState({});
  const [catalogConditionSelection, setCatalogConditionSelection] = useState({});
  const [marketPriceCache, setMarketPriceCache] = useState(() => loadPriceCache());
  const [marketSyncMessage, setMarketSyncMessage] = useState("");
  const [manualMarketForm, setManualMarketForm] = useState({
    catalogItemId: "",
    marketPrice: "",
    lowPrice: "",
    midPrice: "",
    highPrice: "",
    externalSource: "Manual",
    externalId: "",
    sourceUrl: "",
  });
  const [expenses, setExpenses] = useState([]);
  const [sales, setSales] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [mileageTrips, setMileageTrips] = useState([]);

  const [showInventoryScanner, setShowInventoryScanner] = useState(false);
  const [showCatalogScanner, setShowCatalogScanner] = useState(false);
  const [scanMode, setScanMode] = useState("upc");
  const [scanMatches, setScanMatches] = useState([]);
  const [scanReview, setScanReview] = useState(null);
  const [scanDestination, setScanDestination] = useState("none");
  const [scanMessage, setScanMessage] = useState("");
  const [scanInput, setScanInput] = useState("");
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState("All");
  const [inventoryPurchaserFilter, setInventoryPurchaserFilter] = useState("All");
  const [inventorySort, setInventorySort] = useState("newest");
  const [forgeInventoryPage, setForgeInventoryPage] = useState(1);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [submittedCatalogSearch, setSubmittedCatalogSearch] = useState("");
  const [catalogBarcodeSearch, setCatalogBarcodeSearch] = useState("");
  const [submittedCatalogBarcodeSearch, setSubmittedCatalogBarcodeSearch] = useState("");
  const [catalogDataFilter, setCatalogDataFilter] = useState("All");
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
  const [catalogHistoryFilter, setCatalogHistoryFilter] = useState("All");
  const [catalogSort, setCatalogSort] = useState("bestMatch");
  const [catalogViewMode, setCatalogViewMode] = useState(() => {
    if (typeof localStorage === "undefined") return "grid";
    const saved = localStorage.getItem(CATALOG_VIEW_STORAGE_KEY);
    return saved === "list" ? "list" : "grid";
  });
  const [catalogPageSize, setCatalogPageSize] = useState(() => getDefaultCatalogPageSize());
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [catalogMinValue, setCatalogMinValue] = useState("");
  const [catalogMaxValue, setCatalogMaxValue] = useState("");
  const supabaseCatalogRequestId = useRef(0);
  const catalogResultsRef = useRef(null);
  const [bulkImportText, setBulkImportText] = useState("");
  const [bulkImportPreview, setBulkImportPreview] = useState([]);
  const [localDataLoaded, setLocalDataLoaded] = useState(false);
  const [scoutSnapshot, setScoutSnapshot] = useState({
    stores: [],
    reports: [],
    tidepoolReports: [],
    bestBuyAlerts: [],
    scoutProfile: {},
    alertSettings: {},
  });
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
  const [dealFinderOpen, setDealFinderOpen] = useState(false);
  const [vaultForm, setVaultForm] = useState(BLANK_VAULT_FORM);
  const [showVaultAddForm, setShowVaultAddForm] = useState(false);
  const [vaultFormSections, setVaultFormSections] = useState({
    basic: true,
    pricing: false,
    status: false,
    extra: false,
  });
  const [vaultAddMode, setVaultAddMode] = useState("manual");
  const [locationSettings, setLocationSettings] = useState({
    mode: "manual",
    manualLocation: "",
    savedLocations: [],
    selectedSavedLocation: "",
    trackingEnabled: false,
    lastUpdated: "",
  });
  const [locationPromptOpen, setLocationPromptOpen] = useState(false);
  const [locationPromptZip, setLocationPromptZip] = useState("");
  const [importAssistantOpen, setImportAssistantOpen] = useState(false);
  const [importAssistantContext, setImportAssistantContext] = useState("Forge");
  const [importSourceType, setImportSourceType] = useState("text");
  const [importText, setImportText] = useState("");
  const [importLink, setImportLink] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState([]);
  const [forgeImportForm, setForgeImportForm] = useState(FORGE_IMPORT_BLANK);
  const [backupImportPreview, setBackupImportPreview] = useState(null);
  const [backupImportMessage, setBackupImportMessage] = useState("");
  const [suggestions, setSuggestions] = useState(() => loadSuggestions());
  const [adminReviewFilter, setAdminReviewFilter] = useState("All");
  const [mySuggestionFilter, setMySuggestionFilter] = useState("All");
  const [adminReviewPage, setAdminReviewPage] = useState(1);
  const [marketplaceReviewPage, setMarketplaceReviewPage] = useState(1);
  const [mySuggestionPage, setMySuggestionPage] = useState(1);
  const [suggestionConflict, setSuggestionConflict] = useState(null);
  const [marketplaceListings, setMarketplaceListings] = useState([]);
  const [marketplaceReports, setMarketplaceReports] = useState([]);
  const [marketplaceSavedIds, setMarketplaceSavedIds] = useState([]);
  const [marketplaceSearch, setMarketplaceSearch] = useState("");
  const [marketplaceTypeFilter, setMarketplaceTypeFilter] = useState("All");
  const [marketplaceStatusFilter, setMarketplaceStatusFilter] = useState("Active");
  const [marketplaceForm, setMarketplaceForm] = useState(BLANK_MARKETPLACE_FORM);
  const [marketplaceSourcePicker, setMarketplaceSourcePicker] = useState("manual");
  const [marketplaceView, setMarketplaceView] = useState("browse");
  const [listingReviewOpen, setListingReviewOpen] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState("");
  const [listingReportTarget, setListingReportTarget] = useState(null);
  const [listingReportReason, setListingReportReason] = useState("Wrong item");
  const [vaultListingDecision, setVaultListingDecision] = useState(null);
  const [supabaseImportStatus, setSupabaseImportStatus] = useState({
    loading: false,
    totalPokemonProducts: null,
    sealedProducts: null,
    cards: null,
    marketPriceRows: null,
    priceHistoryRows: null,
    productsWithHistory: null,
    latestHistorySnapshot: "",
    currentPriceWithoutHistory: null,
    vaStores: null,
    lastPriceChecked: "",
    productsMissingImages: null,
    productsMissingMarketPrices: null,
    errors: [],
  });
  const [catalogSearchHasRun, setCatalogSearchHasRun] = useState(false);
  const [catalogSuggestionCloseSignal, setCatalogSuggestionCloseSignal] = useState(0);
  const [supabaseCatalogStatus, setSupabaseCatalogStatus] = useState({
    loading: false,
    loadedCount: 0,
    page: 1,
    pageSize: catalogPageSize,
    totalCount: null,
    hasMore: false,
    message: "",
    error: "",
    exactMatchCount: 0,
    exactBarcodeMiss: false,
    usedFallback: false,
  });
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
  itemImageSource: "placeholder",
  itemImageStatus: "placeholder",
  itemImageSourceUrl: "",
  itemImageLastUpdated: "",
  itemImageNeedsReview: false,
  barcode: "",
  catalogProductId: "",
  catalogVariantId: "",
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
  storageLocation: "",
  condition: "",
  conditionName: "Near Mint",
  language: "English",
  finish: "",
  printing: "",
  sealedCondition: "",
  conditionNotes: "",
  notes: "",
  tags: "",
  sourceType: "Manual",
};

  const blankTrip = { purpose: "", driver: "Zena", vehicleId: "", startMiles: "", endMiles: "", gasPrice: "", notes: "", gasReceiptImage: "" };
  const blankSale = { itemId: "", platform: "eBay", quantitySold: 1, finalSalePrice: "", shippingCharged: "", shippingCost: "", platformFees: "", notes: "" };

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
  imageSmall: "",
  imageLarge: "",
  imageSource: "manual",
  imageSourceUrl: "",
  imageStatus: "manual",
  imageLastUpdated: "",
  imageNeedsReview: false,
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
  const [expenseForm, setExpenseForm] = useState(blankExpense);
  const [vehicleForm, setVehicleForm] = useState({ name: "", owner: "Zena", averageMpg: "", wearCostPerMile: "", notes: "" });
  const [tripForm, setTripForm] = useState(blankTrip);
  const [saleForm, setSaleForm] = useState(blankSale);
  const [activeFlowModal, setActiveFlowModal] = useState(null);
  const [quickFindForm, setQuickFindForm] = useState(BLANK_QUICK_FIND_FORM);
  const [multiDestinationForm, setMultiDestinationForm] = useState(BLANK_MULTI_DESTINATION_FORM);
  const [vaultCatalogSearchQuery, setVaultCatalogSearchQuery] = useState("");
  const [multiDestinationCatalogQuery, setMultiDestinationCatalogQuery] = useState("");
  const [multiDestinationMatchSearchOpen, setMultiDestinationMatchSearchOpen] = useState(true);
  const [pictureLookup, setPictureLookup] = useState({ imageUrl: "", fileName: "", text: "", message: "" });
  const flowModalRef = useRef(null);
  const flowModalOpenerRef = useRef(null);

  const mainTabs = [
    { key: "home", label: "Home", target: "dashboard" },
    { key: "scout", label: "Scout", target: "scout" },
    { key: "vault", label: "Vault", target: "vault" },
    { key: "tideTradr", label: "TideTradr", target: "market" },
    { key: "forge", label: "Forge", target: "inventory" },
  ];

  const navSections = [
    {
      title: "Menu",
      items: [
        { key: "menu", label: "Menu" },
      ],
    },
    { title: "Main Tabs", items: [
      { key: "home", label: "Home", target: "dashboard" },
      { key: "scout-main", label: "Scout", target: "scout" },
      { key: "vault", label: "Vault" },
      { key: "tidetradr-main", label: "TideTradr", target: "market" },
      { key: "forge", label: "Forge", target: "inventory" },
    ] },
  ];

  const activeTabLabel =
    activeTab === "tidepool"
      ? "Tidepool"
      : activeTab === "adminReview"
        ? "Admin Review"
      : activeTab === "mySuggestions"
        ? "My Suggestions"
      : navSections.flatMap((s) => s.items).find((i) => (i.target || i.key) === activeTab)?.label || "Dashboard";
  const activeMainTab =
    activeTab === "dashboard"
      ? "home"
      : activeTab === "tidepool"
        ? ""
      : activeTab === "adminReview" || activeTab === "mySuggestions"
        ? ""
      : activeTab === "vault" || activeTab === "scout"
        ? activeTab
      : activeTab === "market" || activeTab === "catalog"
          ? "tideTradr"
          : "forge";
  const mobileBottomTabs = [
    { key: "home", label: "Home", target: "dashboard" },
    { key: "scout", label: "Scout", target: "scout" },
    { key: "vault", label: "Vault", target: "vault" },
    { key: "tideTradr", label: "TideTradr", target: "market" },
    { key: "forge", label: "Forge", target: "inventory" },
  ];
  const topbarSectionOptions = [
    ...mainTabs,
    { key: "settings", label: "Settings", target: "menu" },
  ];
  const topbarSectionValue = activeTab === "menu" ? "settings" : activeMainTab || "home";
  const forgeTabActive = ["addInventory", "inventory", "addSale", "sales", "expenses", "mileage", "reports"].includes(activeTab);
  const autoHideBlocked = Boolean(
    activeFlowModal ||
    showInventoryScanner ||
    showCatalogScanner ||
    listingReviewOpen ||
    dealFinderOpen ||
    showVaultAddForm ||
    scoutScoreModalOpen ||
    feedbackDialog ||
    suggestionConflict ||
    vaultPotentialDuplicate ||
    vaultDuplicateItem ||
    vaultForgeTransfer ||
    selectedCatalogDetailId ||
    quickAddMenuOpen ||
    menuOpen ||
    searchExpanded ||
    locationPromptOpen ||
    importAssistantOpen ||
    listingReportTarget ||
    vaultListingDecision
  );
  const autoHideResetKey = [
    activeTab,
    activeMainTab || "standalone",
    homeSubTab,
    scoutView,
    vaultSubTab,
    tideTradrSubTab,
    forgeSubTab,
    marketplaceView,
  ].join("|");
  const { headerMode } = useAutoHideHeader({
    disabled: autoHideBlocked,
    resetKey: autoHideResetKey,
  });
  const getHeaderCardClass = (className = "") =>
    `app-header-card app-header-card--${headerMode}${className ? ` ${className}` : ""}`;
  const legacyVaultAddModalEnabled = false; // Deprecated: product adds now route through Add to Multiple Places.

  function navigateMainTab(tab) {
    if (!confirmLeaveVaultWork()) return;
    if (tab.key === "scout") {
      setScoutView("main");
      setScoutSubTabTarget({ tab: "overview", id: Date.now() });
    }
    if (tab.key === "tideTradr") {
      setTideTradrSubTab("overview");
      setFeatureSectionsOpen((current) => ({
        ...current,
        market_watchlist: false,
        market_deal_finder: false,
        market_sources: false,
        market_filters: false,
      }));
    }
    if (tab.key === "forge") {
      setForgeSubTab("overview");
      setFeatureSectionsOpen((current) => ({
        ...current,
        forge_inventory: false,
        forge_sales: false,
        forge_expenses: false,
        forge_mileage: false,
        forge_reports: false,
        forge_marketplace: false,
      }));
    }
    setQuickAddMenuOpen(false);
    setSearchExpanded(false);
    setActiveTab(tab.target);
  }

  function navigateTopbarSection(value) {
    const tab = topbarSectionOptions.find((option) => option.key === value);
    if (!tab) return;
    if (tab.key === "settings") {
      setQuickAddMenuOpen(false);
      setSearchExpanded(false);
      setMenuOpen(true);
      setActiveTab("menu");
      return;
    }
    navigateMainTab(tab);
  }

  function renderPageChrome({ title, subtitle, primary, secondary, quickActions = [], tabs = [], activeSubTab, setActiveSubTab }) {
    return (
      <PageHeader
        className={getHeaderCardClass("panel page-dashboard-header")}
        title={title}
        subtitle={subtitle}
        actions={(
          <>
            {primary ? <button type="button" onClick={primary.onClick}>{primary.label}</button> : null}
            {secondary ? <button type="button" className="secondary-button" onClick={secondary.onClick}>{secondary.label}</button> : null}
          </>
        )}
        tabs={tabs}
        activeTab={activeSubTab}
        onTabChange={setActiveSubTab}
      >
        {quickActions.length ? <QuickActionGrid actions={quickActions} ariaLabel={`${title} quick actions`} /> : null}
      </PageHeader>
    );
  }

  const appSearchResults = useMemo(() => {
    const queryInfo = expandSearchQuery(appSearchQuery);
    userSearchAliases.forEach((entry) => {
      const alias = normalizeSearchText(entry.alias);
      const canonical = normalizeSearchText(entry.canonical);
      if (alias && canonical && (queryInfo.normalized.includes(alias) || queryInfo.tokens.includes(alias))) {
        queryInfo.phrases.push(canonical, ...searchTokens(canonical));
      }
    });
    if (queryInfo.normalized.length < 2) return [];

    function setAliasesFor(setName) {
      return SET_SEARCH_METADATA[setName]?.setAliases || [];
    }

    function productTypeAliasesFor(type) {
      return PRODUCT_TYPE_ALIASES[type] || [];
    }

    function pokemonAliasesFor(name) {
      return POKEMON_ALIASES[name] || [];
    }

    function rarityAliasesFor(rarity, variant) {
      return [...(RARITY_VARIANT_ALIASES[rarity] || []), ...(RARITY_VARIANT_ALIASES[variant] || [])];
    }

    const catalogResults = catalogProducts.map((product) => {
      const isCard = product.catalogType === "card";
      const setAliases = [...setAliasesFor(product.setName), ...(product.setAliases || [])];
      const candidate = {
        fields: [
          product.name,
          product.productName,
          product.cardName,
          product.pokemonName,
          product.setName,
          product.setCode,
          setAliases,
          product.productType,
          product.rarity,
          product.variant,
          product.cardNumber,
          product.barcode,
          product.upc,
          product.sku,
          product.externalProductId,
          product.tcgplayerProductId,
          product.marketSource,
          product.priceSubtype,
          product.sourceUrl,
          product.marketUrl,
          product.releaseYear,
        ],
        exactIds: [product.barcode, product.upc, product.sku, product.externalProductId, product.tcgplayerProductId],
        cardNumbers: [product.cardNumber],
        setCodes: [product.setCode],
        aliases: [...setAliases, ...productTypeAliasesFor(product.productType), ...pokemonAliasesFor(product.pokemonName), ...rarityAliasesFor(product.rarity, product.variant)],
        names: [product.name, product.productName, product.cardName],
        productTypeAliases: productTypeAliasesFor(product.productType),
        pokemonAliases: pokemonAliasesFor(product.pokemonName),
        rarityAliases: rarityAliasesFor(product.rarity, product.variant),
      };
      const { score, reason } = scoreSearchCandidate(queryInfo, candidate);
      const marketInfo = getTideTradrMarketInfo(product);
      return {
        id: `${isCard ? "card" : "product"}-${product.id}`,
        category: isCard ? "Cards" : "Products",
        title: product.name || product.productName || product.cardName,
        subtitle: isCard
          ? `${product.setCode || product.setName || "Card"}${product.cardNumber ? ` • ${product.cardNumber}` : ""}${product.rarity ? ` • ${product.rarity}` : ""} • ${MARKET_STATUS_LABELS[marketInfo.marketStatus] || "Market"}`
          : `${product.setCode || product.setName || "Set"} • ${product.productType || "Sealed product"} • ${MARKET_STATUS_LABELS[marketInfo.marketStatus] || "Market"}`,
        source: product,
        score,
        reason,
      };
    });

    const inventoryResults = items.map((item) => {
      const setAliases = setAliasesFor(item.expansion);
      const candidate = {
        fields: [item.name, item.expansion, item.setCode, setAliases, item.productType, item.store, item.barcode, item.sku, item.catalogProductName],
        exactIds: [item.barcode, item.sku],
        setCodes: [item.setCode],
        aliases: [...setAliases, ...productTypeAliasesFor(item.productType)],
        names: [item.name, item.catalogProductName],
        productTypeAliases: productTypeAliasesFor(item.productType),
      };
      const { score, reason } = scoreSearchCandidate(queryInfo, candidate);
      const isVault = item.status === "Personal Collection" || item.status === "Held";
      return {
        id: `${isVault ? "vault" : "inventory"}-${item.id}`,
        category: isVault ? "Vault" : "Inventory",
        title: item.name,
        subtitle: `${isVault ? item.status : `Qty ${item.quantity}`} • ${money(item.marketPrice || item.unitCost)}`,
        source: item,
        score: score * 0.82,
        reason,
      };
    });

    const storeResults = scoutSnapshot.stores.map((store) => {
      const candidate = {
        fields: [store.name, store.nickname, store.chain, store.city, store.address, store.region, store.zip, store.sku, STORE_ALIASES[store.chain]],
        exactIds: [store.sku, store.placeId],
        aliases: [...(STORE_ALIASES[store.chain] || []), store.nickname],
        names: [store.name, store.nickname],
      };
      const { score, reason } = scoreSearchCandidate(queryInfo, candidate);
      return {
        id: `store-${store.id}`,
        category: "Stores",
        title: store.nickname || store.name,
        subtitle: `${store.chain || "Store"} • ${store.city || ""}`,
        source: store,
        score: score * 0.72,
        reason,
      };
    });

    const allReports = [...(scoutSnapshot.reports || []), ...(scoutSnapshot.tidepoolReports || [])];
    const reportResults = allReports.map((report) => {
      const candidate = {
        fields: [report.itemName, report.productName, report.reportText, report.notes, report.storeName, report.reportType, report.upc, report.sku],
        exactIds: [report.upc, report.sku],
        aliases: [],
        names: [report.itemName, report.productName],
      };
      const { score, reason } = scoreSearchCandidate(queryInfo, candidate);
      return {
        id: `report-${report.id || report.reportId}`,
        category: "Reports",
        title: report.itemName || report.productName || report.reportType || "Scout report",
        subtitle: `${report.storeName || "Scout"} • ${report.reportType || report.stockStatus || "Report"}`,
        source: report,
        score: score * 0.66,
        reason,
      };
    });
    const tidepoolPostResults = tidepoolPosts.map((post) => {
      const candidate = {
        fields: [post.title, post.body, post.postType, post.city, post.zip, post.verificationStatus],
        exactIds: [],
        aliases: [],
        names: [post.title],
      };
      const { score, reason } = scoreSearchCandidate(queryInfo, candidate);
      return {
        id: `tidepool-${post.postId}`,
        category: "Reports",
        title: post.title || post.postType,
        subtitle: `Tidepool - ${post.postType} - ${post.verificationStatus}`,
        source: post,
        score: score * 0.66,
        reason,
      };
    });

    return [...catalogResults, ...inventoryResults, ...storeResults, ...reportResults, ...tidepoolPostResults]
      .filter((result) => result.score > 25)
      .sort((a, b) => b.score - a.score)
      .slice(0, 24);
  }, [appSearchQuery, catalogProducts, items, marketPriceCache, scoutSnapshot, tidepoolPosts, userSearchAliases]);

  const appSearchSuggestion = useMemo(() => {
    const queryInfo = expandSearchQuery(appSearchQuery);
    if (queryInfo.normalized.length < 2 || appSearchResults.length > 0) return "";
    const alias = SEARCH_ALIAS_ENTRIES.find((entry) => normalizeSearchText(entry.alias).startsWith(queryInfo.tokens[0] || ""));
    return alias?.canonical || "";
  }, [appSearchQuery, appSearchResults.length]);

  function closeSearchResults() {
    setAppSearchQuery("");
    setSearchExpanded(false);
  }

  function scrollToPageTop() {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }

  function scrollToResultsTop(targetRef = catalogResultsRef) {
    if (typeof window === "undefined") return;
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const target = targetRef?.current;
    if (!target) {
      scrollToPageTop();
      return;
    }
    const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - 96);
    window.scrollTo({
      top,
      left: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }

  function openTidepoolCommunity(filter = "Latest") {
    setTidepoolOpen(true);
    setTidepoolFilter(filter);
    setActiveTab("tidepool");
    setMenuOpen(false);
    setQuickAddMenuOpen(false);
    setSearchExpanded(false);
  }

  function openTidepoolCreatePostFlow() {
    setActiveTab("tidepool");
    setTidepoolOpen(true);
    openFlowModal("tidepoolCreatePost", { size: "medium", source: "tidepool" });
  }

  function viewSearchResult(result) {
    if (result.category === "Products" || result.category === "Cards") {
      setTideTradrLookupId(result.source.id);
      setSelectedCatalogDetailId(result.source.id);
      setActiveTab("market");
      setTideTradrSubTab("catalog");
    } else if (result.category === "Inventory") {
      setInventorySearch(result.source.name || "");
      setActiveTab("inventory");
    } else if (result.category === "Vault") {
      setActiveTab("vault");
      setFeatureSectionsOpen((current) => ({ ...current, vault_collection_items: true }));
    } else if (result.category === "Stores" || result.category === "Reports") {
      if (result.category === "Stores") {
        setActiveTab("scout");
        setFeatureSectionsOpen((current) => ({ ...current, scout_stores: true }));
        setScoutSubTabTarget({ tab: "stores", id: Date.now() });
      } else {
        openTidepoolCommunity("Latest");
      }
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
          <button type="button" onClick={() => viewSearchResult(result)}>View details</button>
          <button type="button" className="secondary-button" onClick={() => {
            openProductAddFlow({ product: result.source, source: "global-search-vault", destinations: { vault: true } });
            setSearchExpanded(false);
          }}>Add to Vault</button>
          <button type="button" className="secondary-button" onClick={() => {
            openProductAddFlow({
              product: result.source,
              source: "global-search-wishlist",
              destinations: { wishlist: true },
              seed: { wishlist: { ...BLANK_MULTI_DESTINATION_FORM.wishlist, addToMarketWatch: true } },
            });
            setSearchExpanded(false);
          }}>Wishlist</button>
          <button type="button" className="secondary-button" onClick={() => viewSearchResult(result)}>More</button>
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
    setMenuSectionsOpen((current) => (current[key] ? {} : { [key]: true }));
  }

  function runMenuAction(action) {
    action();
    setMenuOpen(false);
  }

  function openFeedbackDialog(type, defaults = {}) {
    const now = new Date().toISOString();
    setFeedbackDialog(type);
    setFeedbackForm({
      whatHappened: defaults.whatHappened || "",
      page: defaults.page || activeTabLabel,
      steps: defaults.steps || "",
      screenshotName: "",
      metadata: {
        appVersion: "E&T TCG beta web app",
        route: activeTab,
        feedbackCategory: type,
        ...(defaults.metadata || {}),
        device:
          typeof window !== "undefined"
            ? `${window.innerWidth}x${window.innerHeight}`
            : "Unknown",
        betaMode: BETA_LOCAL_MODE ? "Private beta" : "Cloud-ready",
        timestamp: now,
      },
    });
  }

  function feedbackFormHasDraft() {
    return Boolean(
      String(feedbackForm.whatHappened || "").trim() ||
      String(feedbackForm.steps || "").trim() ||
      String(feedbackForm.screenshotName || "").trim()
    );
  }

  function closeFeedbackDialog(force = false) {
    if (!force && feedbackFormHasDraft() && !window.confirm("Discard changes?")) {
      return false;
    }
    setFeedbackDialog(null);
    setFeedbackForm({ whatHappened: "", page: "", steps: "", screenshotName: "", metadata: {} });
    return true;
  }

  function submitFeedbackDialog(event) {
    event.preventDefault();
    const payload = {
      id: makeId(feedbackDialog || "feedback"),
      type: feedbackDialog || "feedback",
      ...feedbackForm,
      createdAt: new Date().toISOString(),
    };
    try {
      const existing = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || "[]");
      localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify([payload, ...(Array.isArray(existing) ? existing : [])]));
    } catch (error) {
      console.warn("Unable to save beta feedback", error);
      setVaultToast("Could not submit right now. Please try again or export beta data.");
      return;
    }
    closeFeedbackDialog(true);
    setVaultToast(
      feedbackDialog === "bug"
        ? "Bug report submitted. We'll review it."
        : feedbackDialog === "feature"
          ? "Feature request submitted."
          : ["catalog_data", "store_data", "market_data"].includes(feedbackDialog)
            ? "Data issue submitted for review."
            : "Thanks - feedback submitted."
    );
  }

  function updateCloudSyncPreference(mode) {
    setCloudSyncPreference(mode);
    setVaultToast(
      mode === "cloud"
        ? "Cloud sync preference saved. User-owned beta data still stays local until sign-in sync is connected."
        : "Private beta storage preference saved."
    );
  }

  function renderMenuPullDown(key, title, summary, children, icon = "+") {
    const open = Boolean(menuSectionsOpen[key]);
    return (
      <div className={open ? "drawer-collapsible open" : "drawer-collapsible"} key={key}>
        <button type="button" className="drawer-collapsible-toggle" onClick={() => toggleMenuSection(key)}>
          <span className="drawer-section-icon" aria-hidden="true">{icon}</span>
          <span className="drawer-section-copy">
            <strong>{title}</strong>
            <small>{summary}</small>
          </span>
          <b>{open ? "Hide ^" : "Open v"}</b>
        </button>
        {open ? <div className="drawer-collapsible-body">{children}</div> : null}
      </div>
    );
  }

  function getSuggestionUserInfo() {
    return {
      userId: currentUserProfile?.userId || currentUserProfile?.id || user?.id || "local-beta-user",
      displayName: currentUserProfile?.displayName || user?.email || "Beta User",
    };
  }

  function refreshSuggestionsFromStorage() {
    const next = loadSuggestions();
    setSuggestions(next);
    return next;
  }

  async function loadSupabaseImportStatus() {
    if (!isSupabaseConfigured || !supabase) {
      setSupabaseImportStatus((current) => ({
        ...current,
        loading: false,
        errors: ["Supabase anon client is not configured in the frontend. Import scripts still run server-side with server-only credentials."],
      }));
      return;
    }

    const nextStatus = {
      loading: true,
      totalPokemonProducts: null,
      sealedProducts: null,
      cards: null,
      marketPriceRows: null,
      priceHistoryRows: null,
      productsWithHistory: null,
      latestHistorySnapshot: "",
      currentPriceWithoutHistory: null,
      vaStores: null,
      lastPriceChecked: "",
      productsMissingImages: null,
      productsMissingMarketPrices: null,
      errors: [],
    };
    setSupabaseImportStatus(nextStatus);

    async function countQuery(label, query) {
      const { count, error } = await query;
      if (error) {
        nextStatus.errors.push(`${label}: ${error.message}`);
        return null;
      }
      return count ?? 0;
    }

    nextStatus.totalPokemonProducts = await countQuery(
      "Pokemon products",
      supabase.from("product_catalog").select("id", { count: "exact", head: true }).eq("category", "Pokemon")
    );
    nextStatus.sealedProducts = await countQuery(
      "Sealed products",
      supabase.from("product_catalog").select("id", { count: "exact", head: true }).eq("category", "Pokemon").eq("is_sealed", true)
    );
    nextStatus.cards = await countQuery(
      "Cards",
      supabase.from("product_catalog").select("id", { count: "exact", head: true }).eq("category", "Pokemon").eq("product_type", "Card")
    );
    nextStatus.marketPriceRows = await countQuery(
      "Current market prices",
      supabase.from("product_market_price_current").select("id", { count: "exact", head: true })
    );
    nextStatus.priceHistoryRows = await countQuery(
      "Market price history rows",
      supabase.from("product_market_price_history").select("id", { count: "exact", head: true })
    );
    nextStatus.vaStores = await countQuery(
      "Virginia stores",
      supabase.from("pokemon_retail_stores").select("id", { count: "exact", head: true }).eq("state", "VA")
    );
    const missingImageNulls = await countQuery(
      "Products missing image_url nulls",
      supabase.from("product_catalog").select("id", { count: "exact", head: true }).eq("category", "Pokemon").is("image_url", null)
    );
    const missingImageBlanks = await countQuery(
      "Products missing image_url blanks",
      supabase.from("product_catalog").select("id", { count: "exact", head: true }).eq("category", "Pokemon").eq("image_url", "")
    );
    nextStatus.productsMissingImages =
      missingImageNulls === null || missingImageBlanks === null ? null : missingImageNulls + missingImageBlanks;
    const missingMarketNulls = await countQuery(
      "Products missing market price nulls",
      supabase.from("product_catalog").select("id", { count: "exact", head: true }).eq("category", "Pokemon").is("market_price", null)
    );
    const missingMarketZeroes = await countQuery(
      "Products missing market price zeroes",
      supabase.from("product_catalog").select("id", { count: "exact", head: true }).eq("category", "Pokemon").eq("market_price", 0)
    );
    nextStatus.productsMissingMarketPrices =
      missingMarketNulls === null || missingMarketZeroes === null ? null : missingMarketNulls + missingMarketZeroes;

    const { data: latestRows, error: latestError } = await supabase
      .from("product_catalog")
      .select("last_price_checked")
      .not("last_price_checked", "is", null)
      .order("last_price_checked", { ascending: false })
      .limit(1);
    if (latestError) {
      nextStatus.errors.push(`Last price checked: ${latestError.message}`);
    } else {
      nextStatus.lastPriceChecked = latestRows?.[0]?.last_price_checked || "";
    }

    const { data: historyStatusRows, error: historyStatusError } = await supabase
      .from("pokemon_market_history_import_status")
      .select("*")
      .limit(1);
    if (historyStatusError) {
      nextStatus.errors.push(`Market history status: ${historyStatusError.message}`);
    } else {
      const row = historyStatusRows?.[0] || {};
      nextStatus.priceHistoryRows = Number(row.total_price_history_rows ?? nextStatus.priceHistoryRows ?? 0);
      nextStatus.productsWithHistory = Number(row.products_with_history ?? 0);
      nextStatus.latestHistorySnapshot = row.latest_history_snapshot || "";
      nextStatus.currentPriceWithoutHistory = Number(row.products_with_current_price_no_history ?? 0);
    }

    setSupabaseImportStatus({ ...nextStatus, loading: false });
  }

  async function loadImportedPokemonCatalog(searchTerm = catalogSearch, options = {}) {
    const pageSize = clampPageSize(options.pageSize || catalogPageSize || supabaseCatalogStatus.pageSize, SUPABASE_CATALOG_PAGE_SIZE);
    if (!isSupabaseConfigured || !supabase) {
      setSupabaseCatalogStatus({
        loading: false,
        loadedCount: 0,
        page: 1,
        pageSize,
        totalCount: null,
        hasMore: false,
        message: "",
        error: "Supabase anon client is not configured. Imported catalog rows can still be loaded through server/import scripts later.",
      });
      return;
    }

    const requestId = supabaseCatalogRequestId.current + 1;
    supabaseCatalogRequestId.current = requestId;
    const page = Math.max(1, Number(options.page || supabaseCatalogStatus.page || 1));
    const mode = options.mode || "general";
    const force = Boolean(options.forceSearch);
    const barcode = options.barcode ?? catalogBarcodeSearch;
    const productGroup =
      catalogKindFilter === "card" ? "Cards" :
      catalogKindFilter === "sealed" ? "Sealed" :
      catalogKindFilter === "other" ? "Other" :
      "All";
    const hasCriteria = hasCatalogSearchCriteria({
      query: searchTerm,
      barcode,
      productGroup,
      productType: catalogTypeFilter,
      setName: catalogSetFilter,
      dataFilter: catalogDataFilter,
      rarity: catalogRarityFilter,
    });

    if (!force && !hasCriteria) {
      setCatalogSearchHasRun(false);
      setCatalogPagedResultIds([]);
      setCatalogProducts((current) => current.filter((product) => product.sourceType !== "supabase"));
      setSupabaseCatalogStatus({
        loading: false,
        loadedCount: 0,
        page: 1,
        pageSize,
        totalCount: null,
        hasMore: false,
        message: "",
        error: "",
        exactMatchCount: 0,
        exactBarcodeMiss: false,
        usedFallback: false,
      });
      return;
    }

    const cleanedSearch = String(searchTerm || "").trim().replace(/[,%()'"]/g, " ").slice(0, 140);
    setSupabaseCatalogStatus({
      loading: true,
      loadedCount: 0,
      page,
      pageSize,
      totalCount: supabaseCatalogStatus.totalCount,
      hasMore: false,
      message: cleanedSearch || barcode ? `Searching Supabase catalog for "${cleanedSearch || barcode}"...` : "Searching Supabase Pokemon catalog with selected filters...",
      error: "",
      exactMatchCount: 0,
      exactBarcodeMiss: false,
      usedFallback: false,
    });

    let result;
    try {
      result = await searchPokemonCatalog({
        supabase,
        query: searchTerm,
        barcode,
        mode,
        productGroup,
        productType: catalogTypeFilter,
        setName: catalogSetFilter,
        dataFilter: catalogDataFilter,
        rarity: catalogRarityFilter,
        sort: catalogSort,
        page,
        pageSize,
        force,
      });
    } catch (error) {
      if (requestId !== supabaseCatalogRequestId.current) return;
      setCatalogPagedResultIds([]);
      setSupabaseCatalogStatus({
        loading: false,
        loadedCount: 0,
        page,
        pageSize,
        totalCount: null,
        hasMore: false,
        message: "",
        error: `Could not load imported catalog rows: ${error.message}`,
        exactMatchCount: 0,
        exactBarcodeMiss: false,
        usedFallback: false,
      });
      return;
    }
    if (requestId !== supabaseCatalogRequestId.current) return;

    const importedProducts = (result.rows || []).map(mapCatalog);
    setCatalogPagedResultIds(importedProducts.map((product) => String(product.id)));
    setCatalogProducts((current) => {
      const baseline = options.append ? current : current.filter((product) => product.sourceType !== "supabase");
      const seen = new Set();
      return [...importedProducts, ...baseline].filter((product) => {
        const sourceId = product.externalProductId || product.tcgplayerProductId || "";
        const key = String(
          product.id ||
            (sourceId ? `${product.marketSource || ""}-${sourceId}` : "") ||
            `${product.catalogType || "sealed"}-${product.name || product.productName || product.cardName || ""}-${product.setName || product.expansion || ""}`
        ).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
    setCatalogSearchHasRun(true);
    const totalCount = result.count ?? null;
    const from = (page - 1) * pageSize;
    const loadedEnd = totalCount === null ? from + importedProducts.length : Math.min(from + importedProducts.length, totalCount);
    const missText = result.exactMiss ? " No exact barcode match found." : "";
    const fallbackText = result.usedFallback ? " Search is using the safe compatibility view for this beta build." : "";
    setSupabaseCatalogStatus({
      loading: false,
      loadedCount: importedProducts.length,
      page,
      pageSize,
      totalCount,
      hasMore: Boolean(result.hasMore),
      message: importedProducts.length
        ? `Showing ${from + 1}-${loadedEnd} of ${totalCount ?? "many"} catalog matches.${result.exactCount ? ` ${result.exactCount} exact match${result.exactCount === 1 ? "" : "es"} prioritized.` : ""}${missText}${fallbackText}`
        : `No matching products found. Try a different name, set, barcode, or product type.${missText}${fallbackText}`,
      error: "",
      exactMatchCount: result.exactCount || 0,
      exactBarcodeMiss: Boolean(result.exactMiss),
      usedFallback: Boolean(result.usedFallback),
    });
  }

  function submitUniversalSuggestion(input, options = {}) {
    const userInfo = getSuggestionUserInfo();
    const result = submitSuggestion({ ...input, ...userInfo }, options);
    if (!result.ok && result.reason === "duplicate") {
      setSuggestionConflict({
        input: { ...input, ...userInfo },
        duplicate: result.duplicate,
      });
      setVaultToast("A similar suggestion is already under review.");
      return null;
    }
    setSuggestions(result.suggestions);
    setVaultToast("Suggestion submitted for admin review.");
    return result.suggestion;
  }

  function resolveSuggestionConflict(action) {
    if (!suggestionConflict) return;
    if (action === "cancel") {
      setSuggestionConflict(null);
      return;
    }

    const input = action === "confirm"
      ? { ...suggestionConflict.input, confirmationOf: suggestionConflict.duplicate.id }
      : suggestionConflict.input;
    const result = submitSuggestion(input, { allowDuplicate: true });
    setSuggestions(result.suggestions);
    setSuggestionConflict(null);
    setVaultToast(action === "confirm" ? "Confirmation added to the pending suggestion." : "Suggestion submitted for admin review.");
  }

  function addUserSearchAlias(event) {
    event.preventDefault();
    const alias = aliasDraft.alias.trim();
    const canonical = aliasDraft.canonical.trim();
    if (!alias || !canonical) return;
    setUserSearchAliases((current) => [
      { id: makeId("alias"), alias, canonical, type: aliasDraft.type, createdAt: new Date().toISOString() },
      ...current.filter((entry) => normalizeSearchText(entry.alias) !== normalizeSearchText(alias)),
    ]);
    setAliasDraft({ alias: "", canonical: "", type: "personal" });
  }

  useEffect(() => {
    if (activeTab === "adminReview" || activeTab === "mySuggestions") {
      refreshSuggestionsFromStorage();
    }
    if (activeTab === "adminReview") {
      loadSupabaseImportStatus();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "market" || tideTradrSubTab !== "overview") return;
    if (!isSupabaseConfigured || !supabase) return;
    if (catalogSearch.trim().length < 2) {
      setCatalogSearchHasRun(false);
      setCatalogProducts((current) => current.filter((product) => product.sourceType !== "supabase"));
      setSupabaseCatalogStatus((current) => ({
        ...current,
        loading: false,
        loadedCount: 0,
        page: 1,
        totalCount: null,
        hasMore: false,
        message: "",
        error: "",
        exactMatchCount: 0,
        exactBarcodeMiss: false,
      }));
    }
  }, [activeTab, tideTradrSubTab, catalogSearch, isSupabaseConfigured, supabase]);

  useEffect(() => {
    let frameId = 0;
    const lastScrollY = { current: window.scrollY || 0 };
    const downDistance = { current: 0 };
    const upDistance = { current: 0 };

    function handleScroll() {
      if (frameId) return;

      frameId = window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY || 0;
        const delta = currentScrollY - lastScrollY.current;

        if (currentScrollY <= 24) {
          setShowTopbarActions(true);
          setShowFullTopbar(true);
          downDistance.current = 0;
          upDistance.current = 0;
        } else if (Math.abs(delta) >= 5) {
          setShowTopbarActions(true);
          if (delta > 0) {
            downDistance.current += delta;
            upDistance.current = 0;
            if (currentScrollY > 96 && downDistance.current >= 88) {
              setShowFullTopbar(false);
              downDistance.current = 0;
            }
          } else {
            upDistance.current += Math.abs(delta);
            downDistance.current = 0;
            if (currentScrollY <= 96 || upDistance.current >= 76) {
              setShowFullTopbar(true);
              upDistance.current = 0;
            }
          }
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

  useEffect(() => {
    if (typeof localStorage === "undefined") return undefined;
    localStorage.setItem(CATALOG_VIEW_STORAGE_KEY, catalogViewMode);
    return undefined;
  }, [catalogViewMode]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return undefined;
    localStorage.setItem(CATALOG_PAGE_SIZE_STORAGE_KEY, String(catalogPageSize));
    return undefined;
  }, [catalogPageSize]);

  useEffect(() => {
    setVaultPage(1);
  }, [vaultFilter, vaultSearch, vaultSort]);

  useEffect(() => {
    setForgeInventoryPage(1);
  }, [inventorySearch, inventoryStatusFilter, inventoryPurchaserFilter, inventorySort]);

  useEffect(() => {
    setScoutReportsPage(1);
  }, [scoutReportFilter]);

  useEffect(() => {
    setTidepoolPage(1);
  }, [tidepoolFilter]);

  useEffect(() => {
    setMarketWatchPage(1);
  }, [tideTradrSubTab]);

  useEffect(() => {
    setAdminReviewPage(1);
  }, [adminReviewFilter]);

  useEffect(() => {
    setMySuggestionPage(1);
  }, [mySuggestionFilter]);

  useEffect(() => {
    if (!catalogSearchHasRun) {
      setSupabaseCatalogStatus((current) => ({ ...current, page: 1, pageSize: catalogPageSize }));
      return undefined;
    }
    const query = submittedCatalogSearch || catalogSearch;
    const barcode = submittedCatalogBarcodeSearch || catalogBarcodeSearch;
    if (!canRunCatalogSearch(query, barcode)) return undefined;
    const timer = window.setTimeout(() => {
      loadImportedPokemonCatalog(query, {
        page: 1,
        pageSize: catalogPageSize,
        mode: barcode ? "barcode" : "general",
        barcode,
      }).then(() => scrollToResultsTop(catalogResultsRef));
    }, 80);
    return () => window.clearTimeout(timer);
  }, [catalogKindFilter, catalogDataFilter, catalogSetFilter, catalogTypeFilter, catalogRarityFilter, catalogSort, catalogPageSize]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let frameId = 0;
    const updateBackToTop = () => {
      frameId = 0;
      setShowBackToTop((window.scrollY || document.documentElement.scrollTop || 0) > 500);
    };
    const handleScroll = () => {
      if (!frameId) frameId = window.requestAnimationFrame(updateBackToTop);
    };

    updateBackToTop();
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
  const updateVaultForm = (field, value) => setVaultForm((old) => {
    if (field === "vaultStatus") {
      return { ...old, vaultStatus: value, status: vaultStatusLabel(value) };
    }
    return { ...old, [field]: value };
  });
  function closeQuickAddMenu(returnFocus = true) {
    setQuickAddMenuOpen(false);
    if (returnFocus) setTimeout(() => quickAddButtonRef.current?.focus?.(), 0);
  }

  const resetMultiDestinationForm = (overrides = {}) => {
    const {
      destinations,
      vault,
      wishlist,
      forge,
      tidetradr,
      catalogSearchQuery,
      ...rest
    } = overrides;

    setMultiDestinationCatalogQuery(catalogSearchQuery || "");
    setMultiDestinationMatchSearchOpen(!rest.catalogProductId);
    setMultiDestinationForm({
      ...BLANK_MULTI_DESTINATION_FORM,
      ...rest,
      destinations: { ...BLANK_MULTI_DESTINATION_FORM.destinations, ...(destinations || {}) },
      vault: { ...BLANK_MULTI_DESTINATION_FORM.vault, ...(vault || {}) },
      wishlist: { ...BLANK_MULTI_DESTINATION_FORM.wishlist, ...(wishlist || {}) },
      forge: { ...BLANK_MULTI_DESTINATION_FORM.forge, ...(forge || {}) },
      tidetradr: { ...BLANK_MULTI_DESTINATION_FORM.tidetradr, ...(tidetradr || {}) },
    });
  };
  const updateMultiDestinationField = (field, value) => setMultiDestinationForm((current) => ({ ...current, [field]: value }));
  const updateMultiDestinationSection = (section, field, value) => setMultiDestinationForm((current) => ({
    ...current,
    [section]: {
      ...current[section],
      [field]: value,
    },
  }));
  const updateMultiDestinationToggle = (destination, checked) => setMultiDestinationForm((current) => ({
    ...current,
    destinations: {
      ...current.destinations,
      [destination]: checked,
    },
  }));

  function selectMultiDestinationCatalogProduct(productOrId) {
    const product = typeof productOrId === "object"
      ? productOrId
      : catalogProducts.find((entry) => String(entry.id) === String(productOrId));
    const productId = product?.id || (typeof productOrId === "object" ? "" : productOrId);
    const defaultVariant = product
      ? (getCatalogVariantOptions(product).find((variant) => variant.isDefault) || getCatalogVariantOptions(product)[0] || null)
      : null;

    if (product) {
      setCatalogProducts((current) => [
        product,
        ...current.filter((entry) => String(entry.id) !== String(product.id)),
      ]);
      setMultiDestinationCatalogQuery(catalogTitle(product));
      setMultiDestinationMatchSearchOpen(false);
    }

    setMultiDestinationForm((current) => ({
      ...current,
      catalogProductId: productId,
      itemName: product ? catalogTitle(product) : current.itemName,
      productType: product?.productType || product?.sealedProductType || product?.productKind || current.productType,
      category: product?.category || current.category,
      setName: product ? catalogExpansionName(product) : current.setName,
      variant: defaultVariant?.variantName || current.variant,
      upcSku: product?.barcode || product?.upc || product?.sku || current.upcSku,
      msrpPrice: product?.msrpPrice || current.msrpPrice,
      marketPrice: product?.marketPrice || product?.midPrice || current.marketPrice,
      tidetradr: {
        ...current.tidetradr,
        existingProductId: productId,
        msrpPrice: product?.msrpPrice || current.tidetradr.msrpPrice,
        upc: product?.barcode || product?.upc || current.tidetradr.upc,
        sku: product?.sku || current.tidetradr.sku,
        setName: catalogExpansionName(product || {}) || current.tidetradr.setName,
        productType: product?.productType || current.tidetradr.productType,
        releaseDate: product?.releaseDate || product?.releaseYear || current.tidetradr.releaseDate,
      },
    }));
  }

  function clearMultiDestinationCatalogProduct() {
    setMultiDestinationCatalogQuery("");
    setMultiDestinationMatchSearchOpen(true);
    setMultiDestinationForm((current) => ({
      ...current,
      catalogProductId: "",
      tidetradr: {
        ...current.tidetradr,
        existingProductId: "",
      },
    }));
  }

  function markMultiDestinationMissingCatalog() {
    const query = String(multiDestinationCatalogQuery || "").trim();
    setMultiDestinationForm((current) => ({
      ...current,
      itemName: current.itemName || query,
      destinations: {
        ...current.destinations,
        tidetradr: true,
      },
      tidetradr: {
        ...current.tidetradr,
        action: "suggest",
        productType: current.tidetradr.productType || current.productType,
        upc: current.tidetradr.upc || current.upcSku,
        msrpPrice: current.tidetradr.msrpPrice || current.msrpPrice,
      },
    }));
  }

  function normalizeDestinationScopes(value) {
    const raw = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(/[,\s|/]+/)
        : value && typeof value === "object"
          ? Object.entries(value).filter(([, enabled]) => Boolean(enabled)).map(([key]) => key)
          : [];
    return [...new Set(raw
      .map((entry) => String(entry || "").trim().toLowerCase())
      .map((entry) => (
        entry === "forge_inventory" || entry === "business_inventory" ? "forge" :
        entry === "vault_item" || entry === "vault_items" ? "vault" :
        entry === "wishlist_item" || entry === "wishlist_items" ? "wishlist" :
        entry === "tidetradr_suggestion" || entry === "catalog_suggestion" ? "tidetradr" :
        entry
      ))
      .filter(Boolean))];
  }

  function itemDestinationScopes(item = {}) {
    return normalizeDestinationScopes(
      item.destinationScope ||
      item.destination_scope ||
      item.destinations ||
      item.destination ||
      item.itemScope ||
      item.item_scope ||
      item.recordType ||
      item.record_type
    );
  }

  function itemHasDestination(item = {}, destination) {
    return itemDestinationScopes(item).includes(destination);
  }

  function isWishlistItemRecord(item = {}) {
    return Boolean(
      itemHasDestination(item, "wishlist") ||
      item.isWishlist ||
      item.is_wishlist ||
      item.recordType === "wishlist_item" ||
      item.record_type === "wishlist_item" ||
      item.vaultStatus === "wishlist" ||
      String(item.status || "").toLowerCase() === "wishlist"
    );
  }

  function isBlankLike(value) {
    return value === undefined || value === null || String(value).trim() === "";
  }

  function isNumericDraft(value) {
    return isBlankLike(value) || Number.isFinite(Number(value));
  }

  function isVaultDraftReady(form) {
    return Boolean(
      String(form.name || "").trim() &&
      Number(form.quantity) >= 1 &&
      String(form.vaultStatus || "").trim() &&
      isNumericDraft(form.marketPrice) &&
      isNumericDraft(form.msrpPrice) &&
      isNumericDraft(form.unitCost) &&
      isNumericDraft(form.salePrice)
    );
  }

  function validateVaultDraft(form) {
    if (!String(form.name || "").trim()) return "Item name is required.";
    if (!Number.isFinite(Number(form.quantity)) || Number(form.quantity) < 1) return "Quantity must be at least 1.";
    if (!String(form.vaultStatus || "").trim()) return "Vault status is required.";
    if (!isNumericDraft(form.marketPrice)) return "Market value must be a number.";
    if (!isNumericDraft(form.msrpPrice)) return "MSRP must be a number.";
    if (!isNumericDraft(form.unitCost)) return "Cost paid must be a number.";
    if (!isNumericDraft(form.salePrice)) return "Planned sale price must be a number.";
    return "";
  }

  function normalizeVaultDuplicateText(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function isVaultItemRecord(item) {
    const scopes = itemDestinationScopes(item);
    if (scopes.includes("forge") && !scopes.includes("vault") && !scopes.includes("wishlist")) return false;
    return Boolean(
      scopes.includes("vault") ||
      scopes.includes("wishlist") ||
      item?.vaultStatus ||
      ["Personal Collection", "Held", "Wishlist", "Sealed", "Sealed / Holding", "Ripped / Opened", "Moved to Forge", "Traded"].includes(item?.status)
    );
  }

  function isForgeInventoryItem(item = {}) {
    const scopes = itemDestinationScopes(item);
    if (scopes.includes("forge")) return true;
    if (scopes.includes("vault") || scopes.includes("wishlist") || isWishlistItemRecord(item) || isVaultItemRecord(item)) return false;
    if (item.businessInventory || item.business_inventory || item.recordType === "forge_inventory" || item.record_type === "forge_inventory") return true;
    const status = String(item.status || "").toLowerCase();
    return ["in stock", "ready to list", "listed", "needs photos", "needs market check", "sold"].includes(status);
  }

  function findVaultDuplicate(candidate, collection = items) {
    const candidateName = normalizeVaultDuplicateText(candidate.itemName || candidate.name);
    const candidateUpc = normalizeVaultDuplicateText(candidate.upc || candidate.barcode);
    const candidateSku = normalizeVaultDuplicateText(candidate.sku);
    const candidateCatalogId = normalizeVaultDuplicateText(candidate.catalogProductId || candidate.tideTradrProductId || candidate.externalProductId);
    return collection.find((item) => {
      if (!isVaultItemRecord(item) || item.id === candidate.id) return false;
      const itemName = normalizeVaultDuplicateText(item.itemName || item.name);
      const itemUpc = normalizeVaultDuplicateText(item.upc || item.barcode);
      const itemSku = normalizeVaultDuplicateText(item.sku);
      const itemCatalogId = normalizeVaultDuplicateText(item.catalogProductId || item.tideTradrProductId || item.externalProductId);
      return Boolean(
        (candidateCatalogId && itemCatalogId && candidateCatalogId === itemCatalogId) ||
        (candidateUpc && itemUpc && candidateUpc === itemUpc) ||
        (candidateSku && itemSku && candidateSku === itemSku) ||
        (candidateName && itemName && candidateName === itemName)
      );
    });
  }

  function filterVaultItems(collection, status = "all") {
    return collection.filter((item) => {
      if (status === "all") return isActiveVaultItem(item);
      if (status === "sealed") return ["sealed", "held"].includes(normalizeVaultStatus(item));
      if (status === "wishlist") return ["wishlist", "held"].includes(normalizeVaultStatus(item));
      if (status === "sold_archived") {
        const normalizedStatus = normalizeVaultStatus(item);
        return normalizedStatus === "archived" || String(item.status || "").toLowerCase() === "sold";
      }
      return normalizeVaultStatus(item) === status;
    });
  }

  function searchVaultItems(collection, query = "") {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return collection;
    return collection.filter((item) =>
      [
        item.itemName,
        item.name,
        item.expansion,
        item.setName,
        item.setCode,
        item.barcode,
        item.upc,
        item.sku,
        item.notes,
        item.productType,
        item.storageLocation,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery))
    );
  }

  function resetVaultForm() {
    setVaultForm({ ...BLANK_VAULT_FORM });
    setVaultFormSections({ basic: true, pricing: false, status: false, extra: false });
    setVaultAddMode("manual");
    setVaultSaving(false);
  }

  function vaultFormHasDraft() {
    const comparableFields = [
      "name",
      "unitCost",
      "msrpPrice",
      "marketPrice",
      "salePrice",
      "packCount",
      "setName",
      "productType",
      "store",
      "storageLocation",
      "condition",
      "conditionName",
      "language",
      "finish",
      "printing",
      "sealedCondition",
      "conditionNotes",
      "upc",
      "sku",
      "catalogVariantId",
      "purchaseDate",
      "receiptImage",
      "itemImage",
      "notes",
    ];
    return comparableFields.some((field) => !isBlankLike(vaultForm[field])) || Number(vaultForm.quantity) !== Number(BLANK_VAULT_FORM.quantity);
  }

  function closeVaultAddModal(force = false) {
    if (!force && vaultFormHasDraft()) {
      const leave = window.confirm("You have unsaved changes. Leave without saving?");
      if (!leave) return false;
    }
    setShowVaultAddForm(false);
    setVaultPotentialDuplicate(null);
    resetVaultForm();
    return true;
  }

  function isEditingVaultItem() {
    return Boolean(editingItemId && items.some((item) => item.id === editingItemId && isVaultItemRecord(item)));
  }

  function cancelVaultEdit(force = false) {
    if (!force && isEditingVaultItem()) {
      const leave = window.confirm("You have unsaved changes. Leave without saving?");
      if (!leave) return false;
    }
    setEditingItemId(null);
    setItemForm(blankItem);
    return true;
  }

  function confirmLeaveVaultWork() {
    if (activeTab !== "vault") return true;
    if (showVaultAddForm && vaultFormHasDraft()) return closeVaultAddModal();
    if (isEditingVaultItem()) return cancelVaultEdit();
    return true;
  }

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

  function applyHomeViewPreset(presetKey) {
    const preset = HOME_VIEW_PRESETS[presetKey];
    if (!preset) return;
    setUserType(preset.userType);
    setDashboardPreset(preset.dashboardPreset);
    setDashboardLayout(getDefaultDashboardLayoutForPreset(preset.dashboardPreset));
    setHomeStatsEnabled(HOME_STATS.reduce((settings, stat) => ({ ...settings, [stat.key]: preset.stats.includes(stat.key) }), {}));
  }

  function setDashboardSectionsEnabled(sectionKeys, enabled) {
    setDashboardLayout((current) => {
      const normalized = normalizeDashboardLayout(current, dashboardPreset);
      return {
        ...normalized,
        sections: normalized.sections.map((section) => sectionKeys.includes(section.key) ? { ...section, enabled } : section),
      };
    });
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

  const hasScoutLocation = Boolean(
    String(locationSettings.manualLocation || "").trim() ||
    String(locationSettings.selectedSavedLocation || "").trim() ||
    locationSettings.trackingEnabled
  );

  function requestScoutLocation() {
    if (hasScoutLocation) return true;
    setLocationPromptOpen(true);
    return false;
  }

  function savePromptLocation(event) {
    event?.preventDefault?.();
    const value = String(locationPromptZip || "").trim();
    if (!value) return;
    setLocationSettings((current) => ({
      ...current,
      mode: "manual",
      manualLocation: value,
      selectedSavedLocation: value,
      savedLocations: [...new Set([...(current.savedLocations || []), value])],
      trackingEnabled: false,
      lastUpdated: new Date().toISOString(),
    }));
    setLocationPromptOpen(false);
    setLocationPromptZip("");
  }

  function openLocationSettingsFromPrompt() {
    setLocationPromptOpen(false);
    setMenuSectionsOpen({ settings: true });
    setMenuOpen(true);
  }

  function openInventoryImportAssistant(context = "Forge") {
    setImportAssistantContext(context);
    setImportAssistantOpen(true);
    if (context === "Vault") {
      setFeatureSectionsOpen((current) => ({ ...current, vault_add: true }));
      setActiveTab("vault");
      return;
    }
    setFeatureSectionsOpen((current) => ({ ...current, forge_inventory: true }));
    openFlowModal("addInventory", { size: "large", source: "edit" });
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
          itemName: `${extension?.toUpperCase()} import preview`,
          notes: "Spreadsheet/PDF parsing is limited in this beta build. Export as CSV or paste the list for automatic preview.",
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

  function handleForgeImportFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    setForgeImportForm((current) => ({
      ...current,
      fileName: file.name,
      detectedColumns: [],
      previewRows: [],
      mappingNotes: "",
    }));

    if (["xlsx", "xls"].includes(extension)) {
      setForgeImportForm((current) => ({
        ...current,
        fileName: file.name,
        detectedColumns: ["Spreadsheet file selected"],
        mappingNotes: "XLSX uploads are accepted for beta planning. Export to CSV for automatic column preview in this build.",
      }));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || "");
      try {
        if (extension === "json") {
          const parsed = JSON.parse(content);
          const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : [parsed];
          const detectedColumns = [...new Set(rows.flatMap((row) => Object.keys(row || {})))].slice(0, 16);
          const csvLike = [
            detectedColumns.join(","),
            ...rows.map((row) => detectedColumns.map((column) => String(row?.[column] ?? "").replaceAll(",", " ")).join(",")),
          ].join("\n");
          setForgeImportForm((current) => ({
            ...current,
            fileName: file.name,
            detectedColumns,
            previewRows: parseImportText(csvLike, "json"),
            mappingNotes: rows.length ? "" : "No rows were found in this JSON file.",
          }));
          return;
        }

        const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const detectedColumns = lines.length ? parseCsvLine(lines[0]).filter(Boolean).slice(0, 16) : [];
        const sourceType = extension === "csv" ? "csv" : "text";
        setForgeImportForm((current) => ({
          ...current,
          fileName: file.name,
          detectedColumns,
          previewRows: parseImportText(content, sourceType),
          mappingNotes: lines.length ? "" : "No rows were found in this file.",
        }));
      } catch (error) {
        setForgeImportForm((current) => ({
          ...current,
          fileName: file.name,
          detectedColumns: [],
          previewRows: [],
          mappingNotes: `Could not preview this file yet: ${error.message || "unknown parsing error"}`,
        }));
      }
    };
    reader.readAsText(file);
  }

  function confirmForgeImportFile(event) {
    event?.preventDefault?.();
    const previewRows = forgeImportForm.previewRows || [];
    if (!forgeImportForm.fileName) {
      alert("Choose a file to import first.");
      return;
    }
    if (!previewRows.length) {
      setVaultToast(`${forgeImportForm.fileName} saved for beta import mapping.`);
      closeFlowModal({ force: true, reset: false });
      setForgeImportForm(FORGE_IMPORT_BLANK);
      return;
    }

    const importType = forgeImportForm.importType;
    if (importType === "Inventory" || importType === "Mixed/auto-detect") {
      const nextItems = previewRows.map((row) => importedRowToItem({ ...row, destination: "Forge" }, "Forge"));
      setItems((current) => [...nextItems, ...current]);
      setActiveTab("inventory");
      setForgeSubTab("overview");
      setVaultToast(`Imported ${nextItems.length} Forge item${nextItems.length === 1 ? "" : "s"} from ${forgeImportForm.fileName}.`);
      closeFlowModal({ force: true, reset: false });
      setForgeImportForm(FORGE_IMPORT_BLANK);
      return;
    }

    setImportAssistantContext("Forge");
    setImportRows(previewRows);
    setVaultToast(`${importType} import preview saved for beta mapping.`);
    closeFlowModal({ force: true, reset: false });
    setForgeImportForm(FORGE_IMPORT_BLANK);
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
      imageUrl: "",
      imageSource: "placeholder",
      imageStatus: "placeholder",
      imageLastUpdated: now,
      imageNeedsReview: true,
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
      destinationScope: [destination === "Vault" ? "vault" : "forge"],
      recordType: destination === "Vault" ? "vault_item" : "forge_inventory",
      businessInventory: destination !== "Vault",
      isWishlist: false,
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
      itemImage: getCatalogImage(matched) || "",
      itemImageSource: matched?.imageSource || getDefaultImageSource(matched || {}),
      itemImageStatus: matched?.imageStatus || getDefaultImageStatus(matched || {}),
      itemImageSourceUrl: matched?.imageSourceUrl || "",
      itemImageLastUpdated: matched?.imageLastUpdated || "",
      itemImageNeedsReview: Boolean(matched?.imageNeedsReview),
      marketPrice: Number(row.marketValue || matched?.marketPrice || 0),
      lowPrice: Number(matched?.lowPrice || 0),
      midPrice: Number(matched?.midPrice || row.marketValue || 0),
      highPrice: Number(matched?.highPrice || 0),
      msrpPrice: Number(row.msrp || matched?.msrpPrice || 0),
      expansion: row.setName || matched?.setName || "",
      productType: row.productType || matched?.productType || "",
      status,
      vaultStatus: destination === "Vault" ? "personal_collection" : "",
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
            <p>Upload a CSV, paste your inventory list, upload a screenshot for manual review, or save a source link. CSV and pasted text are the beta priority.</p>
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

  function updateScoutAlertPreference(key, value) {
    const nextAlertSettings = { ...(scoutSnapshot.alertSettings || {}), [key]: value };
    setScoutSnapshot((current) => ({ ...current, alertSettings: nextAlertSettings }));
    try {
      const saved = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
      localStorage.setItem(SCOUT_STORAGE_KEY, JSON.stringify({ ...saved, alertSettings: nextAlertSettings }));
      setVaultToast("Preference saved.");
    } catch (error) {
      console.warn("Unable to save Scout alert preference", error);
      setVaultToast("Could not save preference right now.");
    }
  }

  function loadScoutSnapshot() {
    const saved = sanitizeScoutLocalData(JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}"));
    setScoutSnapshot({
      stores: saved.stores || [],
      reports: saved.reports || [],
      tidepoolReports: saved.tidepoolReports || [],
      bestBuyAlerts: saved.bestBuyAlerts || [],
      scoutProfile: saved.scoutProfile || {},
      alertSettings: saved.alertSettings || {},
    });
  }

  function saveTidepoolCommunity(next) {
    const payload = {
      posts: next.posts ?? tidepoolPosts,
      comments: next.comments ?? tidepoolComments,
      reactions: next.reactions ?? tidepoolReactions,
    };
    localStorage.setItem(TIDEPOOL_STORAGE_KEY, JSON.stringify(payload));
    setTidepoolPosts(payload.posts);
    setTidepoolComments(payload.comments);
    setTidepoolReactions(payload.reactions);
  }

  function submitTidepoolPost(event) {
    event?.preventDefault?.();
    if (!tidepoolPostForm.body.trim() && !tidepoolPostForm.title.trim()) return false;
    const post = makeTidepoolPost({
      ...tidepoolPostForm,
      displayName: currentUserProfile.displayName || "Local Scout",
      userId: currentUserProfile.userId || "local-beta",
      verificationStatus: ["Restock sighting", "Product sighting"].includes(tidepoolPostForm.postType) ? "pending" : "unverified",
      sourceType: "user",
    });
    saveTidepoolCommunity({ posts: [post, ...tidepoolPosts] });
    setTidepoolPostForm(BLANK_TIDEPOOL_POST_FORM);
    setTidepoolFilter("Latest");
    if (activeFlowModal?.type === "tidepoolCreatePost") {
      closeFlowModal({ force: true, reset: false });
    }
    return true;
  }

  function updateTidepoolPost(postId, updates) {
    saveTidepoolCommunity({
      posts: tidepoolPosts.map((post) =>
        post.postId === postId ? { ...post, ...updates, updatedAt: new Date().toISOString() } : post
      ),
    });
  }

  function addTidepoolReaction(postId, reactionType) {
    const reaction = {
      reactionId: makeId("reaction"),
      postId,
      commentId: "",
      userId: currentUserProfile.userId || "local-beta",
      reactionType,
      createdAt: new Date().toISOString(),
    };
    saveTidepoolCommunity({
      reactions: [reaction, ...tidepoolReactions],
      posts: tidepoolPosts.map((post) =>
        post.postId === postId ? { ...post, reactionCount: Number(post.reactionCount || 0) + 1 } : post
      ),
    });
  }

  function addTidepoolComment(postId, parentCommentId = "") {
    const key = parentCommentId || postId;
    const body = String(tidepoolCommentDrafts[key] || "").trim();
    if (!body) return;
    const comment = {
      commentId: makeId("comment"),
      postId,
      userId: currentUserProfile.userId || "local-beta",
      displayName: currentUserProfile.displayName || "Local Scout",
      body,
      parentCommentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "active",
    };
    saveTidepoolCommunity({
      comments: [...tidepoolComments, comment],
      posts: tidepoolPosts.map((post) =>
        post.postId === postId ? { ...post, commentCount: Number(post.commentCount || 0) + 1 } : post
      ),
    });
    setTidepoolCommentDrafts((current) => ({ ...current, [key]: "" }));
  }

  useEffect(() => {
    if (typeof localStorage !== "undefined") cleanupBrowserBetaStorage(localStorage);
    if (typeof sessionStorage !== "undefined") cleanupBrowserBetaStorage(sessionStorage);
    const savedTidepool = sanitizeTidepoolLocalData(JSON.parse(localStorage.getItem(TIDEPOOL_STORAGE_KEY) || "null") || createDefaultTidepoolData());
    setTidepoolPosts(savedTidepool.posts || []);
    setTidepoolComments(savedTidepool.comments || []);
    setTidepoolReactions(savedTidepool.reactions || []);
  }, []);

  useEffect(() => {
    if (BETA_LOCAL_MODE) {
      if (typeof localStorage !== "undefined") cleanupBrowserBetaStorage(localStorage);
      if (typeof sessionStorage !== "undefined") cleanupBrowserBetaStorage(sessionStorage);
      const saved = sanitizeAppLocalData(JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "{}"));
      const savedUserType = normalizeUserType(saved.userType);
      const savedPreset = normalizeDashboardPreset(saved.dashboardPreset || getDashboardPresetForUserType(savedUserType));
      setUserType(savedUserType);
      setHomeStatsEnabled(normalizeHomeStatsEnabled(saved.homeStatsEnabled, savedUserType));
      setDashboardPreset(savedPreset);
      setDashboardLayout(normalizeDashboardLayout(saved.dashboardLayout, savedPreset));
      setDashboardCardStyle(normalizeDashboardCardStyle(saved.dashboardCardStyle));
      setCloudSyncPreference(saved.cloudSyncPreference || "local");
      setSubscriptionProfile(normalizeLocalSubscriptionProfile(saved.subscriptionProfile));
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
      const localCatalogProducts = Array.isArray(saved.catalogProducts)
        ? saved.catalogProducts.filter((product) => product.sourceType !== "supabase")
        : [];
      setCatalogProducts(localCatalogProducts.length ? mergeSharedCatalogProducts(localCatalogProducts) : createSharedCatalogProducts());
      setTideTradrWatchlist(Array.isArray(saved.tideTradrWatchlist) ? saved.tideTradrWatchlist : []);
      setMarketplaceListings(Array.isArray(saved.marketplaceListings) ? saved.marketplaceListings : []);
      setMarketplaceReports(Array.isArray(saved.marketplaceReports) ? saved.marketplaceReports : []);
      setMarketplaceSavedIds(Array.isArray(saved.marketplaceSavedIds) ? saved.marketplaceSavedIds : []);
      setTideTradrLookupId(saved.tideTradrLookupId || "");
      setMarketPriceCache(saved.marketPriceCache || loadPriceCache());
      setUserSearchAliases(Array.isArray(saved.userSearchAliases) ? saved.userSearchAliases : []);
      setExpenses((saved.expenses || []).map(mapExpense));
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
      const localBetaUser = { id: "local-beta", email: "local beta mode" };
      setUser(localBetaUser);
      setLocalDataLoaded(true);
      if (!isSupabaseConfigured || !supabase) return;
      supabase.auth.getUser().then(({ data, error }) => {
        if (!error && data?.user) setUser(data.user);
      });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user || localBetaUser);
      });
      return () => subscription.unsubscribe();
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
    let persistedLocationSettings = null;
    try {
      persistedLocationSettings = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "{}")?.locationSettings || null;
    } catch {
      persistedLocationSettings = null;
    }
    const hasCurrentLocation = Boolean(
      String(locationSettings.manualLocation || "").trim() ||
      String(locationSettings.selectedSavedLocation || "").trim() ||
      locationSettings.trackingEnabled
    );
    const hasPersistedLocation = Boolean(
      String(persistedLocationSettings?.manualLocation || "").trim() ||
      String(persistedLocationSettings?.selectedSavedLocation || "").trim() ||
      persistedLocationSettings?.trackingEnabled
    );
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        items,
        purchasers,
        catalogProducts: catalogProducts.filter((product) => product.sourceType !== "supabase"),
        tideTradrWatchlist,
        marketplaceListings,
        marketplaceReports,
        marketplaceSavedIds,
        tideTradrLookupId,
        marketPriceCache,
        userSearchAliases,
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
        cloudSyncPreference,
        locationSettings: hasCurrentLocation || !hasPersistedLocation ? locationSettings : persistedLocationSettings,
        subscriptionProfile,
      })
    );
  }, [items, purchasers, catalogProducts, tideTradrWatchlist, marketplaceListings, marketplaceReports, marketplaceSavedIds, tideTradrLookupId, marketPriceCache, userSearchAliases, expenses, sales, vehicles, mileageTrips, dealForm, userType, homeStatsEnabled, dashboardPreset, dashboardLayout, dashboardCardStyle, cloudSyncPreference, locationSettings, subscriptionProfile, localDataLoaded]);

  useEffect(() => {
    if (!BETA_LOCAL_MODE || !localDataLoaded) return;
    savePriceCache(marketPriceCache);
  }, [marketPriceCache, localDataLoaded]);

  useEffect(() => {
    if (!BETA_LOCAL_MODE || activeTab !== "dashboard") return;
    loadScoutSnapshot();
  }, [activeTab]);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      if (BETA_LOCAL_MODE && user?.id === "local-beta") {
        const profile = makeFallbackUserProfile(user);
        if (!active) return;
        setCurrentUserProfile(profile);
        setSubscriptionProfile((current) => ({
          ...current,
          userId: profile.userId,
          email: profile.email,
          displayName: profile.displayName,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
          lastLoginAt: profile.lastLoginAt,
        }));
        return;
      }
      const profile = await getCurrentUserProfile(user);
      if (!active) return;
      setCurrentUserProfile(profile);
      setSubscriptionProfile((current) => ({
        ...current,
        userId: profile.userId,
        email: profile.email,
        displayName: profile.displayName,
        userRole: profile.userRole,
        tier: profile.tier,
        featureTier: profile.tier,
        subscriptionPlan: profile.tier,
        isAdmin: profile.isAdmin,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
        lastLoginAt: profile.lastLoginAt,
      }));
    }
    loadProfile();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    function closeQuickAddOnOutsidePointer(event) {
      if (!quickAddMenuOpen) return;
      if (quickAddRef.current?.contains(event.target)) return;
      closeQuickAddMenu();
    }
    document.addEventListener("pointerdown", closeQuickAddOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeQuickAddOnOutsidePointer);
  }, [quickAddMenuOpen]);

  useEffect(() => {
    document.body.classList.toggle("quick-add-open", quickAddMenuOpen);
    if (!quickAddMenuOpen) return () => document.body.classList.remove("quick-add-open");

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      const focusTarget = [...(quickAddMenuRef.current?.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") || [])]
        .find((node) => !node.disabled && node.offsetParent !== null);
      focusTarget?.focus?.();
    });

    return () => {
      cancelAnimationFrame(frame);
      document.body.classList.remove("quick-add-open");
      document.body.style.overflow = previousOverflow;
    };
  }, [quickAddMenuOpen]);

  useEffect(() => {
    document.body.classList.toggle("menu-open", menuOpen);
    return () => document.body.classList.remove("menu-open");
  }, [menuOpen]);

  useEffect(() => {
    function handleEscape(event) {
      if (quickAddMenuOpen && event.key === "Tab" && quickAddMenuRef.current) {
        const focusable = [...quickAddMenuRef.current.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
          .filter((node) => !node.disabled && node.offsetParent !== null);
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
        return;
      }
      if (event.key !== "Escape") return;
      if (quickAddMenuOpen) {
        closeQuickAddMenu();
        return;
      }
      if (activeFlowModal) {
        closeFlowModal();
        return;
      }
      if (feedbackDialog) {
        setFeedbackDialog(null);
        return;
      }
      if (suggestionConflict) {
        setSuggestionConflict(null);
        return;
      }
      if (menuOpen) {
        setMenuOpen(false);
        return;
      }
      if (vaultPotentialDuplicate) {
        setVaultPotentialDuplicate(null);
        return;
      }
      if (vaultDuplicateItem) {
        setVaultDuplicateItem(null);
        return;
      }
      if (vaultForgeTransfer) {
        setVaultForgeTransfer(null);
        return;
      }
      if (showVaultAddForm) {
        closeVaultAddModal();
        return;
      }
      if (showInventoryScanner) {
        setShowInventoryScanner(false);
        setScanReview(null);
        setScanMatches([]);
        setScanInput("");
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [quickAddMenuOpen, activeFlowModal, feedbackDialog, suggestionConflict, menuOpen, vaultPotentialDuplicate, vaultDuplicateItem, vaultForgeTransfer, showVaultAddForm, showInventoryScanner, vaultForm, scanReview]);

  async function checkUser() {
    if (!isSupabaseConfigured || !supabase) return;
    const { data, error } = await supabase.auth.getUser();
    if (!error) setUser(data.user);
  }

  async function handleAuth(event) {
    event.preventDefault();
    if (!isSupabaseConfigured || !supabase) {
      setVaultToast("Supabase login is not configured yet. Private beta mode is still available.");
      return;
    }
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
        const { data: currentUserData, error: currentUserError } = await supabase.auth.getUser();
        setUser(currentUserError ? data.user : currentUserData.user);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) return alert(error.message);
        const { data: currentUserData, error: currentUserError } = await supabase.auth.getUser();
        setUser(currentUserError ? data.user : currentUserData.user);
      }
      setAuthPassword("");
      setVaultToast("Signed in. Beta data remains saved on this device.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOut() {
    if (isSupabaseConfigured && supabase && user?.id !== "local-beta") {
      await supabase.auth.signOut();
    }
    if (BETA_LOCAL_MODE) {
      setUser({ id: "local-beta", email: "local beta mode" });
      setAuthPassword("");
      setVaultToast("Signed out. Private beta data is still available on this device.");
      return;
    }

    if (isSupabaseConfigured && supabase) await supabase.auth.signOut();
    setUser(null);
  }

  function resetBetaLocalData() {
    const confirmed = window.confirm(
      "Clear private beta data on this device? This cannot be undone."
    );

    if (!confirmed) return false;

    localStorage.removeItem(LOCAL_STORAGE_KEY);
    localStorage.removeItem(SCOUT_STORAGE_KEY);
    localStorage.removeItem(TIDEPOOL_STORAGE_KEY);
    localStorage.removeItem(SUGGESTION_STORAGE_KEY);
    setScoutSnapshot({
      stores: [],
      reports: [],
      tidepoolReports: [],
      bestBuyAlerts: [],
      scoutProfile: {},
      alertSettings: {},
    });
    setItems([]);
    setPurchasers(createDefaultPurchasers());
    setCatalogProducts(createSharedCatalogProducts());
    setTideTradrWatchlist([]);
    setMarketplaceListings([]);
    setMarketplaceReports([]);
    setMarketplaceSavedIds([]);
    setSuggestions([]);
    setTideTradrLookupId("");
    setMarketPriceCache({ prices: [], lastSync: "", failedMatches: [] });
    setUserSearchAliases([]);
    const defaultTidepool = emptyTidepoolData();
    setTidepoolPosts(defaultTidepool.posts);
    setTidepoolComments(defaultTidepool.comments);
    setTidepoolReactions(defaultTidepool.reactions);
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
    setVaultForm({ ...BLANK_VAULT_FORM });
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

  function buildVaultItemFromForm() {
    const now = new Date().toISOString();
    const defaultPurchaser = purchaserOptions[0] || { id: "", name: "Zena" };
    const vaultCategory = vaultForm.vaultCategory || "Personal collection";
    const vaultStatus = vaultForm.vaultStatus || normalizeVaultStatus({ status: vaultForm.status, actionNotes: vaultCategory });
    const status = vaultStatusLabel(vaultStatus);
    return {
      id: makeId("vault"),
      itemName: vaultForm.name,
      name: vaultForm.name,
      destinationScope: [vaultStatus === "wishlist" ? "wishlist" : "vault"],
      recordType: vaultStatus === "wishlist" ? "wishlist_item" : "vault_item",
      businessInventory: false,
      isWishlist: vaultStatus === "wishlist",
      sku: vaultForm.sku || `VAULT-${Date.now()}`,
      buyer: defaultPurchaser.name,
      purchaserId: defaultPurchaser.id,
      purchaserName: defaultPurchaser.name,
      category: "Pokemon",
      store: vaultForm.store || "",
      quantity: Number(vaultForm.quantity || 1),
      ownedQuantity: vaultStatus === "wishlist" ? 0 : Number(vaultForm.quantity || 1),
      quantityWanted: vaultStatus === "wishlist" ? Number(vaultForm.quantity || 1) : 0,
      forgeQuantity: 0,
      unitCost: Number(vaultForm.unitCost || 0),
      salePrice: Number(vaultForm.salePrice || 0),
      plannedSalePrice: Number(vaultForm.salePrice || 0),
      receiptImage: vaultForm.receiptImage || "",
      itemImage: vaultForm.itemImage || "",
      barcode: vaultForm.upc || "",
      upc: vaultForm.upc || "",
      catalogProductId: vaultForm.catalogProductId || "",
      catalogVariantId: vaultForm.catalogVariantId || "",
      tideTradrProductId: vaultForm.tideTradrProductId || vaultForm.catalogProductId || "",
      catalogProductName: "",
      externalProductId: vaultForm.tideTradrProductId || vaultForm.catalogProductId || "",
      tideTradrUrl: "",
      externalProductSource: "TideTradr",
      marketPrice: Number(vaultForm.marketPrice || 0),
      marketValue: Number(vaultForm.marketPrice || 0),
      lowPrice: 0,
      midPrice: Number(vaultForm.marketPrice || 0),
      highPrice: 0,
      msrpPrice: Number(vaultForm.msrpPrice || 0),
      msrp: Number(vaultForm.msrpPrice || 0),
      setCode: "",
      expansion: vaultForm.setName || "",
      setName: vaultForm.setName || "",
      productLine: "",
      productType: vaultForm.productType || "",
      packCount: Number(vaultForm.packCount || 0),
      notes: vaultForm.notes || "",
      storageLocation: vaultForm.storageLocation || "",
      condition: vaultForm.condition || "",
      conditionName: vaultForm.conditionName || vaultForm.condition || "Near Mint",
      language: vaultForm.language || "English",
      finish: vaultForm.finish || "",
      printing: vaultForm.printing || "",
      sealedCondition: vaultForm.sealedCondition || "",
      conditionNotes: vaultForm.conditionNotes || "",
      sourceType: vaultForm.sourceType || "Manual",
      source: vaultForm.sourceType || "Manual",
      status,
      vaultStatus,
      listingPlatform: "",
      listingUrl: "",
      listedPrice: 0,
      actionNotes: vaultCategory,
      vaultHistory: [],
      tradedDate: "",
      tradeNotes: "",
      receivedItemName: "",
      receivedCatalogItemId: "",
      lastPriceChecked: vaultForm.marketPrice ? now : "",
      purchaseDate: vaultForm.purchaseDate || "",
      createdAt: vaultForm.purchaseDate ? new Date(vaultForm.purchaseDate).toISOString() : now,
      updatedAt: now,
    };
  }

  function createVaultItemRecord(newItem) {
    setItems((current) => [newItem, ...current]);
  }

  function increaseExistingVaultQuantity(existingItem, addedQuantity) {
    setItems((current) =>
      current.map((item) =>
        item.id === existingItem.id
          ? {
              ...item,
              quantity: Number(item.quantity || 0) + Number(addedQuantity || 1),
              updatedAt: new Date().toISOString(),
            }
          : item
      )
    );
  }

  function finishVaultItemCreate(newItem, message = "Item added to Vault.") {
    createVaultItemRecord(newItem);
    closeVaultAddModal(true);
    setVaultToast(message);
  }

  function resolveVaultPotentialDuplicate(choice) {
    if (!vaultPotentialDuplicate?.candidate) return;
    const { candidate, duplicate } = vaultPotentialDuplicate;
    if (choice === "increase") {
      increaseExistingVaultQuantity(duplicate, candidate.quantity);
      closeVaultAddModal(true);
      setShowInventoryScanner(false);
      setScanReview(null);
      setScanMatches([]);
      setScanInput("");
      setVaultPotentialDuplicate(null);
      if (candidate.vaultStatus) setActiveTab("vault");
      setVaultToast("Item added to Vault.");
      return;
    }
    if (choice === "separate") {
      finishVaultItemCreate(candidate, "Item added to Vault.");
      setShowInventoryScanner(false);
      setScanReview(null);
      setScanMatches([]);
      setScanInput("");
      setVaultPotentialDuplicate(null);
      if (candidate.vaultStatus) setActiveTab("vault");
      return;
    }
    setVaultPotentialDuplicate(null);
  }

  function addVaultItem(event) {
    event.preventDefault();
    const validationMessage = validateVaultDraft(vaultForm);
    if (validationMessage) {
      setVaultToast(validationMessage);
      return;
    }

    setVaultSaving(true);
    const newItem = buildVaultItemFromForm();
    const duplicate = findVaultDuplicate(newItem);
    if (duplicate) {
      setVaultPotentialDuplicate({ candidate: newItem, duplicate });
      setVaultSaving(false);
      return;
    }
    finishVaultItemCreate(newItem, "Item added to Vault.");
  }

  function toggleVaultFormSection(section) {
    setVaultFormSections((current) => ({ ...current, [section]: !current[section] }));
  }

  function buildScanReview(rawValue, matches, defaultDestination = "none") {
    const best = matches[0];
    const product = best?.item || null;
    const marketInfo = product ? getTideTradrMarketInfo(product) : {};
    return {
      scanId: makeId("scan"),
      rawValue,
      scanType: scanMode === "upc" ? "upc" : scanMode === "card" ? "card" : scanMode === "manual" ? "manual" : "barcode",
      matchedCatalogItemId: product?.id || "",
      itemName: product?.name || product?.productName || product?.cardName || rawValue || "Unknown item",
      catalogType: product?.catalogType || "unknown",
      productType: product?.productType || product?.rarity || "",
      setName: product?.setName || product?.expansion || "",
      upc: product?.barcode || product?.upc || (/^\d{8,}$/.test(String(rawValue || "")) ? rawValue : ""),
      sku: product?.sku || "",
      imageUrl: product ? getCatalogImage(product) : "",
      msrp: marketInfo.msrp || product?.msrpPrice || "",
      marketValue: marketInfo.currentMarketValue || product?.marketPrice || "",
      matchConfidence: best?.confidencePercent || (product ? 70 : 0),
      sourceType: product?.sourceType || product?.marketStatus || "local/catalog",
      destination: defaultDestination,
      reviewedByUser: false,
      possibleMatches: matches.slice(0, 5),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function beginScanProduct(defaultDestination = "none") {
    setEditingItemId(null);
    setScanMode("upc");
    setScanMatches([]);
    setScanReview(null);
    setScanDestination(defaultDestination);
    setScanMessage("");
    setScanInput("");
    setPictureLookup({ imageUrl: "", fileName: "", text: "", message: "" });
    setShowInventoryScanner(true);
    setQuickAddMenuOpen(false);
  }

  function closeInventoryScanner() {
    setShowInventoryScanner(false);
    setScanReview(null);
    setScanMatches([]);
    setScanInput("");
    setPictureLookup((current) => {
      if (current.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(current.imageUrl);
      return { imageUrl: "", fileName: "", text: "", message: "" };
    });
  }

  function openPictureLookupFlow(defaultDestination = "none") {
    beginScanProduct(defaultDestination);
    setScanMode("picture");
    setPictureLookup({
      imageUrl: "",
      fileName: "",
      text: "",
      message: "Photo lookup is available without saving your image. Enter any visible text if OCR cannot read it yet.",
    });
  }

  function handlePictureLookupFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPictureLookup((current) => {
      if (current.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(current.imageUrl);
      return {
        ...current,
        imageUrl: URL.createObjectURL(file),
        fileName: file.name,
        message: "Image preview ready. Beta 1 picture lookup uses visible text clues and UPC/SKU entry before manual fallback.",
      };
    });
  }

  function runPictureLookupSearch() {
    const lookup = String(pictureLookup.text || scanInput || "").trim();
    if (!lookup) {
      setPictureLookup((current) => ({
        ...current,
        message: "No readable text yet. Enter a product name, set, UPC, SKU, or shorthand from the picture to search TideTradr.",
      }));
      setScanMessage("No match found from picture. Search TideTradr, enter UPC/SKU, add manually, or suggest a missing product.");
      return;
    }
    setScanMode("manual");
    handleCatalogScanMatch(lookup);
  }

  function handleCatalogScanMatch(value) {
    if (!String(value || "").trim()) {
      setScanMessage("Scan a barcode or enter a product name before searching.");
      setScanReview(null);
      setScanMatches([]);
      return;
    }
    setScanInput(value);
    const matches = getBestCatalogMatches(value, catalogProducts);
    setScanMatches(matches);
    setScanReview(buildScanReview(value, matches, scanDestination));
  }

  function confirmScanMatch(productId) {
    const match = scanMatches.find((candidate) => String(candidate.item.id) === String(productId));
    if (!match?.item) return;
    setScanReview(buildScanReview(scanReview?.rawValue || scanInput || match.item.name, [match, ...scanMatches.filter((candidate) => String(candidate.item.id) !== String(productId))], scanDestination));
  }

  function scannedProductToItem(product, destination) {
    const marketInfo = getTideTradrMarketInfo(product || {});
    const defaultPurchaser = purchaserOptions[0] || { id: "", name: "Zena" };
    const isVaultDestination = destination === "vault" || destination === "wishlist";
    return {
      ...blankItem,
      id: makeId(isVaultDestination ? "scan-vault" : "scan-forge"),
      itemName: product?.name || product?.productName || product?.cardName || scanReview?.itemName || "Scanned item",
      name: product?.name || product?.productName || product?.cardName || scanReview?.itemName || "Scanned item",
      destinationScope: [destination === "wishlist" ? "wishlist" : destination === "vault" ? "vault" : "forge"],
      recordType: destination === "wishlist" ? "wishlist_item" : destination === "vault" ? "vault_item" : "forge_inventory",
      businessInventory: destination === "forge",
      isWishlist: destination === "wishlist",
      buyer: defaultPurchaser.name,
      purchaserId: defaultPurchaser.id,
      purchaserName: defaultPurchaser.name,
      category: product?.category || "Pokemon",
      quantity: 1,
      unitCost: 0,
      salePrice: marketInfo.currentMarketValue || 0,
      plannedSalePrice: marketInfo.currentMarketValue || 0,
      itemImage: product ? getCatalogImage(product) : scanReview?.imageUrl || "",
      itemImageSource: product?.imageSource || getDefaultImageSource(product || {}),
      itemImageStatus: product?.imageStatus || getDefaultImageStatus(product || {}),
      itemImageSourceUrl: product?.imageSourceUrl || product?.marketUrl || "",
      itemImageLastUpdated: product?.imageLastUpdated || product?.lastUpdated || "",
      itemImageNeedsReview: Boolean(product?.imageNeedsReview),
      barcode: scanReview?.upc || product?.barcode || "",
      upc: scanReview?.upc || product?.barcode || "",
      sku: scanReview?.sku || product?.sku || "",
      catalogProductId: product?.id || "",
      tideTradrProductId: product?.id || "",
      catalogProductName: product?.name || "",
      externalProductId: product?.externalProductId || "",
      tideTradrUrl: product?.marketUrl || "",
      marketPrice: marketInfo.currentMarketValue || 0,
      marketValue: marketInfo.currentMarketValue || 0,
      lowPrice: product?.lowPrice || 0,
      midPrice: product?.midPrice || marketInfo.currentMarketValue || 0,
      highPrice: product?.highPrice || 0,
      msrpPrice: marketInfo.msrp || product?.msrpPrice || 0,
      msrp: marketInfo.msrp || product?.msrpPrice || 0,
      setCode: product?.setCode || "",
      expansion: product?.setName || product?.expansion || "",
      setName: product?.setName || product?.expansion || "",
      productLine: product?.productLine || product?.series || "",
      productType: product?.catalogType === "card" ? "Individual Card" : product?.productType || "",
      packCount: product?.packCount || 0,
      status: isVaultDestination ? (destination === "wishlist" ? "Wishlist" : product?.catalogType === "sealed" ? "Sealed / Holding" : "Personal Collection") : "In Stock",
      vaultStatus: isVaultDestination ? (destination === "wishlist" ? "wishlist" : product?.catalogType === "sealed" ? "sealed" : "personal_collection") : "",
      source: "scanner",
      sourceType: "Barcode scan",
      sourceLocation: "scanner",
      acquisitionType: "scanned",
      storageLocation: "",
      condition: product?.catalogType === "card" ? "Unknown" : "",
      sealedCondition: product?.catalogType === "sealed" ? "Sealed" : "",
      conditionNotes: "",
      scanId: scanReview?.scanId || "",
      notes: `Added from scanner review. Raw scan: ${scanReview?.rawValue || "manual"}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function addScannedItemToCollection(destination) {
    const product = catalogProducts.find((item) => String(item.id) === String(scanReview?.matchedCatalogItemId));
    if (!product) {
      setScanMessage("No catalog match found. Search TideTradr manually or submit the item for review.");
      return;
    }
    const nextItem = scannedProductToItem(product, destination);
    if (destination === "vault" || destination === "wishlist") {
      const duplicate = findVaultDuplicate(nextItem);
      if (duplicate) {
        setVaultPotentialDuplicate({ candidate: nextItem, duplicate, fromScanner: true });
        setShowInventoryScanner(false);
        return;
      }
      createVaultItemRecord(nextItem);
      setScanMessage(destination === "wishlist" ? "Scanned item added to Wishlist." : "Scanned item added to The Vault.");
      setShowInventoryScanner(false);
      setScanReview(null);
      setScanMatches([]);
      setScanInput("");
      setActiveTab("vault");
      setVaultToast("Item added to Vault.");
      return;
    }
    const existing = product ? items.find((item) =>
      String(item.catalogProductId || "") === String(product.id) &&
      (destination === "vault" ? Boolean(item.vaultStatus) : !item.vaultStatus)
    ) : null;
    if (existing && window.confirm("This item already exists. Add quantity to the existing item instead of creating a new entry?")) {
      setItems((current) => current.map((item) => item.id === existing.id ? { ...item, quantity: Number(item.quantity || 0) + 1, updatedAt: new Date().toISOString() } : item));
    } else {
      setItems((current) => [nextItem, ...current]);
    }
    setScanMessage(destination === "wishlist" ? "Scanned item added to Wishlist." : destination === "vault" ? "Scanned item added to The Vault." : "Scanned item added to Forge.");
    setShowInventoryScanner(false);
    setScanReview(null);
    setScanMatches([]);
    setScanInput("");
    setActiveTab(destination === "vault" || destination === "wishlist" ? "vault" : "inventory");
    if (destination === "vault" || destination === "wishlist") setVaultToast("Vault item saved.");
  }

  function confirmScannerDestination(destinationOverride = "") {
    const destination = destinationOverride || scanDestination || scanReview?.destination || "none";
    const productId = scanReview?.matchedCatalogItemId;
    if (!destination || destination === "none") {
      setScanMessage("Choose where this scanned item should go.");
      return;
    }
    if ((destination === "vault" || destination === "forge" || destination === "wishlist") && !productId) {
      setScanMessage("No catalog match yet. Submit the item for review or choose a TideTradr lookup first.");
      return;
    }
    if (destination === "vault" || destination === "forge" || destination === "wishlist") {
      const product = catalogProducts.find((item) => String(item.id) === String(productId));
      if (!product) {
        setScanMessage("No verified catalog match yet. Search TideTradr, enter UPC/SKU manually, add manually, or suggest a missing product.");
        return;
      }
      closeInventoryScanner();
      return openProductAddFlow({
        product,
        source: "scanner",
        destinations: destinationDefaults({ [destination]: true }),
        seed: {
          catalogSearchQuery: scanReview?.rawValue || scanInput || catalogTitle(product),
        },
      });
    }
    if (destination === "tidetradr") {
      if (productId) selectTideTradrProduct(productId);
      setActiveTab("market");
    }
    if (destination === "deal_finder") {
      setActiveTab("market");
      if (productId) useCatalogProductInDeal(productId);
      else openDealFinderModal();
    }
    if (destination === "watchlist" || destination === "pinned") {
      if (productId) addProductToTideTradrWatchlist(productId, destination === "pinned");
      setActiveTab("market");
      setTideTradrSubTab("watch");
    }
    if (destination === "scout_report") {
      openScoutSubmitFlow();
    }
    if (destination === "scout_report" || destination === "tidetradr" || destination === "deal_finder" || destination === "watchlist" || destination === "pinned") {
      setShowInventoryScanner(false);
      setScanReview(null);
      setScanMatches([]);
    }
  }

  function goToTidepool() {
    openTidepoolCommunity("Latest");
  }

  function goToScoutSection(subTab) {
    if (subTab === "stores" && !requestScoutLocation()) {
      setActiveTab("scout");
      setQuickAddMenuOpen(false);
      return;
    }
    setScoutSubTabTarget({ tab: subTab, id: Date.now() });
    setScoutView(subTab === "reports" ? "reports" : subTab === "alerts" ? "alerts" : subTab === "stores" ? "stores" : "main");
    setActiveTab("scout");
    setQuickAddMenuOpen(false);
  }

  function openWhatDidISee(product = null) {
    setWhatDidISeeSeedProduct(null);
    const productName = product?.name || product?.itemName || product?.productName || product?.cardName || "";
    openScoutSubmitFlow({
      action: "productSighting",
      productName,
      productId: product?.id || "",
      productSnapshot: product || null,
    });
    setQuickAddMenuOpen(false);
  }

  function saveWhatDidISeeScoutReport(report) {
    const firstItem = report.items?.[0] || {};
    const totalQuantity = (report.items || []).reduce((total, item) => total + Number(item.quantitySeen || 0), 0);
    const scoutReport = {
      id: report.id || makeId("what-did-i-see-report"),
      reportId: report.id || makeId("what-did-i-see-report"),
      reportType: "Product sighting",
      sourceType: "what_did_i_see",
      sourceStatus: "local_beta",
      storeName: report.storeName || firstItem.storeName || "Store not listed",
      itemName: firstItem.name || `${report.items?.length || 0} catalog items seen`,
      productName: firstItem.name || "",
      quantitySeen: totalQuantity || "",
      price: firstItem.shelfPrice || "",
      reportText: report.notes || `${report.items?.length || 0} item${report.items?.length === 1 ? "" : "s"} checked in What Did I See.`,
      notes: report.notes || "",
      reportDate: report.visitDate,
      reportTime: report.visitTime,
      verified: false,
      verificationStatus: "Needs Review",
      createdAt: report.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: report.items || [],
    };
    const scoutData = getSharedScoutData();
    const nextReports = [scoutReport, ...(scoutData.reports || scoutSnapshot.reports || []).filter((item) => item.id !== scoutReport.id && item.reportId !== scoutReport.reportId)];
    saveSharedScoutData({ ...scoutData, reports: nextReports });
    setScoutReportFilter("Latest");
  }

function openVaultQuickAdd({ category = "Personal collection", productType = "", subTab = "collection", stayInContext = false } = {}) {
    setVaultSubTab(subTab);
    const wishlist = category === "Wishlist" || subTab === "wishlist";
    openProductAddFlow({
      source: wishlist ? "vault-wishlist" : "vault-manual",
      destinations: wishlist ? { wishlist: true } : { vault: true },
      seed: {
        productType,
        vault: {
          vaultCategory: category,
          vaultStatus: wishlist ? "wishlist" : normalizeVaultStatus({ actionNotes: category }),
        },
        wishlist: wishlist ? { ...BLANK_MULTI_DESTINATION_FORM.wishlist, addToMarketWatch: true } : undefined,
      },
    });
    setQuickAddMenuOpen(false);
    if (!stayInContext) setActiveTab("vault");
  }

  function formsDiffer(current, blank) {
    const keys = new Set([...Object.keys(current || {}), ...Object.keys(blank || {})]);
    return [...keys].some((key) => JSON.stringify((current || {})[key] ?? "") !== JSON.stringify((blank || {})[key] ?? ""));
  }

  function isFlowModalDirty(type = activeFlowModal?.type) {
    if (!type) return false;
    if (type === "addInventory") return Boolean(editingItemId) || formsDiffer(itemForm, blankItem);
    if (type === "addSale") return Boolean(editingSaleId) || formsDiffer(saleForm, blankSale);
    if (type === "addExpense") return Boolean(editingExpenseId) || formsDiffer(expenseForm, blankExpense);
    if (type === "addMileage") return Boolean(editingTripId) || formsDiffer(tripForm, blankTrip);
    if (type === "createListing") return formsDiffer(marketplaceForm, BLANK_MARKETPLACE_FORM);
    if (type === "forgeImport") return formsDiffer(forgeImportForm, FORGE_IMPORT_BLANK);
    if (type === "tidepoolCreatePost") return formsDiffer(tidepoolPostForm, BLANK_TIDEPOOL_POST_FORM);
    if (type === "multiDestinationAdd") return formsDiffer(multiDestinationForm, BLANK_MULTI_DESTINATION_FORM);
    return false;
  }

  function resetFlowModalDraft(type) {
    if (type === "addInventory") {
      setEditingItemId(null);
      setItemForm(blankItem);
    }
    if (type === "addSale") {
      setEditingSaleId(null);
      setSaleForm(blankSale);
    }
    if (type === "addExpense") {
      setEditingExpenseId(null);
      setExpenseForm(blankExpense);
    }
    if (type === "addMileage") {
      setEditingTripId(null);
      setTripForm(blankTrip);
    }
    if (type === "createListing") {
      setMarketplaceForm(BLANK_MARKETPLACE_FORM);
      setMarketplaceSourcePicker("manual");
      setListingReviewOpen(false);
    }
    if (type === "forgeImport") {
      setForgeImportForm(FORGE_IMPORT_BLANK);
    }
    if (type === "tidepoolCreatePost") {
      setTidepoolPostForm(BLANK_TIDEPOOL_POST_FORM);
    }
    if (type === "quickFind") {
      setQuickFindForm(BLANK_QUICK_FIND_FORM);
    }
    if (type === "vaultCatalogSearch") {
      setVaultCatalogSearchQuery("");
    }
    if (type === "multiDestinationAdd") {
      resetMultiDestinationForm();
    }
  }

  function openFlowModal(type, options = {}) {
    flowModalOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuickAddMenuOpen(false);
    setMenuOpen(false);
    setSearchExpanded(false);
    setActiveFlowModal({ type, size: options.size || "medium", id: Date.now(), source: options.source || "" });
  }

  function closeFlowModal(options = {}) {
    const modal = activeFlowModal;
    if (!modal) return true;
    if (!options.force && isFlowModalDirty(modal.type) && !window.confirm("Discard changes?")) {
      return false;
    }
    setActiveFlowModal(null);
    if (options.reset !== false) resetFlowModalDraft(modal.type);
    setTimeout(() => flowModalOpenerRef.current?.focus?.(), 0);
    return true;
  }

  function openAddInventoryFlow(options = {}) {
    if (!options.preserveForm) {
      setEditingItemId(null);
      setItemForm(blankItem);
    }
    openFlowModal("addInventory", { size: "large", source: options.source });
  }

  function openAddSaleFlow(options = {}) {
    if (!options.preserveForm) {
      setEditingSaleId(null);
      setSaleForm(blankSale);
    }
    openFlowModal("addSale", { size: "medium", source: options.source });
  }

  function openAddExpenseFlow(options = {}) {
    if (!options.preserveForm) {
      setEditingExpenseId(null);
      setExpenseForm(blankExpense);
    }
    openFlowModal("addExpense", { size: "medium", source: options.source });
  }

  function openAddMileageFlow(options = {}) {
    if (!options.preserveForm) {
      setEditingTripId(null);
      setTripForm(blankTrip);
    }
    openFlowModal("addMileage", { size: "medium", source: options.source });
  }

  function openForgeQuickAddFlow() {
    openFlowModal("forgeQuickAdd", { size: "small", source: "forge" });
  }

  function openForgeImportFlow() {
    setForgeImportForm(FORGE_IMPORT_BLANK);
    openFlowModal("forgeImport", { size: "large", source: "forge" });
  }

  function openVaultQuickAddFlow() {
    setActiveTab("vault");
    openFlowModal("vaultQuickAdd", { size: "small", source: "vault" });
  }

  function openVaultCatalogSearchFlow(options = {}) {
    setActiveTab("vault");
    setVaultCatalogSearchQuery(options.query || "");
    openFlowModal("vaultCatalogSearch", { size: "large", source: options.source || "vault" });
  }

  function openVaultScanFlow() {
    setActiveTab("vault");
    openFlowModal("vaultScan", { size: "small", source: "vault" });
  }

  function openVaultImportCollectionFlow() {
    setActiveTab("vault");
    openFlowModal("vaultImportCollection", { size: "small", source: "vault" });
  }

  function openQuickFindFlow(options = {}) {
    setQuickFindForm(BLANK_QUICK_FIND_FORM);
    if (options.source === "market") setActiveTab("market");
    openFlowModal("quickFind", { size: "small", source: options.source || "tidetradr" });
  }

  function openMultiDestinationAddFlow(options = {}) {
    resetMultiDestinationForm(options.seed || {});
    openFlowModal("multiDestinationAdd", { size: "large", source: options.source || "quick-add" });
  }

  function openMultiDestinationAddForProduct(product, options = {}) {
    if (!product) return;
    setCatalogProducts((current) => [
      product,
      ...current.filter((entry) => String(entry.id) !== String(product.id)),
    ]);
    resetMultiDestinationForm(buildMultiDestinationSeedFromProduct(product, options.seed || {}));
    openFlowModal("multiDestinationAdd", { size: "large", source: options.source || "vault-catalog" });
  }

  function destinationDefaults(overrides = {}) {
    return {
      vault: false,
      wishlist: false,
      forge: false,
      tidetradr: false,
      ...overrides,
    };
  }

  function openProductAddFlow({ product = null, source = "quick-add", seed = {}, destinations = {} } = {}) {
    const nextSeed = {
      ...seed,
      destinations: destinationDefaults({ ...(seed.destinations || {}), ...destinations }),
    };
    if (product) return openMultiDestinationAddForProduct(product, { source, seed: nextSeed });
    return openMultiDestinationAddFlow({ source, seed: nextSeed });
  }

  function openVaultMoveToForgeFlow() {
    setActiveTab("vault");
    openFlowModal("vaultMoveToForge", { size: "medium", source: "vault" });
  }

  function openScoutSubmitFlow(options = {}) {
    setScoutSubTabTarget({
      tab: "reports",
      id: Date.now(),
      ...options,
    });
    openFlowModal("scoutSubmit", { size: "large", source: options.source });
  }

  function openQuickAddAction(action) {
    setQuickAddMenuOpen(false);
    if (action === "multiDestination") return openProductAddFlow({ source: "quick-add" });
    if (action === "card") return openProductAddFlow({ source: "quick-add-card", seed: { productType: "Individual Card" } });
    if (action === "sealed") return openProductAddFlow({ source: "quick-add-sealed", seed: { productType: "Sealed Product" } });
    if (action === "vaultItem") return openProductAddFlow({ source: "quick-add-vault", destinations: { vault: true } });
    if (action === "searchVaultCatalog") return openVaultCatalogSearchFlow({ source: "quick-add" });
    if (action === "importCollection") return openVaultImportCollectionFlow();
    if (action === "quickFind" || action === "manualLookup" || action === "enterUpcSku") return openQuickFindFlow({ source: "quick-add" });
    if (action === "suggestCatalogItem") {
      return openMultiDestinationAddFlow({
        seed: {
          destinations: destinationDefaults({ tidetradr: true }),
          tidetradr: { ...BLANK_MULTI_DESTINATION_FORM.tidetradr, action: "suggest" },
        },
      });
    }
    if (action === "suggestCatalogCorrection") return openFeedbackDialog("catalog_data", { page: "TideTradr", topic: "Catalog correction" });
    if (action === "scanProduct") return beginScanProduct("none");
    if (action === "pictureLookup") return openPictureLookupFlow("none");
    if (action === "scanVault") return openVaultScanFlow();
    if (action === "scanForge") {
      return beginScanProduct("forge");
    }
    if (action === "pictureLookupVault") return openPictureLookupFlow("vault");
    if (action === "pictureLookupForge") return openPictureLookupFlow("forge");
    if (action === "inventory") return openProductAddFlow({ source: "quick-add-forge-inventory", destinations: { forge: true } });
    if (action === "sale") return openAddSaleFlow();
    if (action === "expense") return openAddExpenseFlow();
    if (action === "mileage") return openAddMileageFlow();
    if (action === "importFile") return openForgeImportFlow();
    if (action === "storeReport") {
      return openScoutSubmitFlow();
    }
    if (action === "store" || action === "storeSuggestion") {
      setScoutSubTabTarget({ tab: "stores", action: "missingStore", id: Date.now() });
      setScoutView("stores");
      setActiveTab("scout");
      return;
    }
    if (action === "storeCorrection") {
      return openScoutSubmitFlow({ action: "storeCorrection" });
    }
    if (action === "wishlist") {
      return openMultiDestinationAddFlow({
        source: "quick-add-wishlist",
        seed: {
          destinations: destinationDefaults({ wishlist: true }),
          wishlist: { ...BLANK_MULTI_DESTINATION_FORM.wishlist, addToMarketWatch: true },
        },
      });
    }
    if (action === "searchTidetradr") {
      setActiveTab("market");
      setTideTradrSubTab("overview");
      return;
    }
    if (action === "checkDeal") {
      setActiveTab("market");
      openDealFinderModal();
      return;
    }
    if (action === "whatDidISee") return openWhatDidISee();
    if (action === "listing") return openMarketplaceCreate("manual", {});
    return null;
  }

  function runQuickFindSearch(event, mode = "general") {
    event?.preventDefault?.();
    const lookup = String(quickFindForm.lookup || "").trim();
    setActiveTab("market");
    setTideTradrSubTab("overview");
    if (!lookup) {
      closeFlowModal({ force: true, reset: false });
      setQuickFindForm(BLANK_QUICK_FIND_FORM);
      return;
    }
    setCatalogSearch(lookup);
    setCatalogSearchHasRun(true);
    closeCatalogSuggestions();
    if (mode === "barcode") {
      setCatalogBarcodeSearch(lookup);
      setSubmittedCatalogSearch(lookup);
      setSubmittedCatalogBarcodeSearch(lookup);
      loadImportedPokemonCatalog(lookup, { page: 1, mode: "barcode", barcode: lookup });
    } else {
      setCatalogBarcodeSearch("");
      setSubmittedCatalogSearch(lookup);
      setSubmittedCatalogBarcodeSearch("");
      loadImportedPokemonCatalog(lookup, { page: 1, mode: "general", barcode: "" });
    }
    closeFlowModal({ force: true, reset: false });
    setQuickFindForm(BLANK_QUICK_FIND_FORM);
  }

  function runVaultCatalogSearch(event, value = vaultCatalogSearchQuery) {
    event?.preventDefault?.();
    const lookup = String(value || "").trim();
    setVaultCatalogSearchQuery(lookup);
    if (!lookup) return;
    setCatalogSearch(lookup);
    setCatalogBarcodeSearch("");
    setSubmittedCatalogSearch(lookup);
    setSubmittedCatalogBarcodeSearch("");
    setCatalogSearchHasRun(true);
    closeCatalogSuggestions();
    loadImportedPokemonCatalog(lookup, {
      page: 1,
      pageSize: Math.min(24, catalogPageSize || 24),
      mode: "general",
      barcode: "",
      forceSearch: true,
    });
  }

  function selectVaultCatalogSearchProduct(product) {
    openMultiDestinationAddForProduct(product, {
      source: "vault-catalog",
      seed: {
        destinations: { vault: true, wishlist: false, forge: false, tidetradr: false },
      },
    });
  }

  function selectVaultCatalogSearchSuggestion(suggestion) {
    const value = suggestion.searchValue || suggestion.label || vaultCatalogSearchQuery;
    setVaultCatalogSearchQuery(value);
    if (suggestion.product?.id) {
      selectVaultCatalogSearchProduct(suggestion.product);
      return;
    }
    runVaultCatalogSearch(null, value);
  }

  function selectMultiDestinationCatalogSuggestion(suggestion) {
    const value = suggestion.searchValue || suggestion.label || multiDestinationCatalogQuery;
    setMultiDestinationCatalogQuery(value);
    if (suggestion.product?.id) {
      selectMultiDestinationCatalogProduct(suggestion.product);
      return;
    }
    loadImportedPokemonCatalog(value, {
      page: 1,
      pageSize: Math.min(24, catalogPageSize || 24),
      mode: "general",
      barcode: "",
      forceSearch: true,
    });
  }

  async function submitMultiDestinationAdd(event) {
    event.preventDefault();
    const itemName = String(multiDestinationForm.itemName || "").trim();
    const destinations = multiDestinationForm.destinations || {};
    const selectedDestinationCount = Object.values(destinations).filter(Boolean).length;
    if (!itemName) return alert("Enter an item name first.");
    if (!selectedDestinationCount) return alert("Choose at least one destination.");

    const now = new Date().toISOString();
    const selectedCatalog = catalogProducts.find((product) => String(product.id) === String(multiDestinationForm.catalogProductId));
    const successes = [];
    const failures = [];
    const shared = {
      name: itemName,
      category: multiDestinationForm.category || "Pokemon",
      productType: multiDestinationForm.productType || selectedCatalog?.productType || "",
      barcode: multiDestinationForm.upcSku || "",
      catalogProductId: selectedCatalog?.id || "",
      catalogProductName: selectedCatalog?.name || "",
      marketPrice: Number(multiDestinationForm.marketPrice || selectedCatalog?.marketPrice || selectedCatalog?.midPrice || 0),
      msrpPrice: Number(multiDestinationForm.msrpPrice || selectedCatalog?.msrpPrice || 0),
      setName: multiDestinationForm.setName || (selectedCatalog ? catalogExpansionName(selectedCatalog) : multiDestinationForm.tidetradr.setName),
      expansion: multiDestinationForm.setName || (selectedCatalog ? catalogExpansionName(selectedCatalog) : multiDestinationForm.tidetradr.setName),
      variant: multiDestinationForm.variant || "",
      notes: multiDestinationForm.notes || "",
      sourceType: selectedCatalog ? "TideTradr" : "Multi-destination add",
    };

    try {
      if (destinations.vault) {
        const vaultQuantity = Math.max(1, Number(multiDestinationForm.vault.quantity || 1));
        const vaultItem = {
          id: makeId("vault"),
          ...shared,
          destinationScope: ["vault"],
          recordType: "vault_item",
          businessInventory: false,
          isWishlist: false,
          quantity: vaultQuantity,
          ownedQuantity: vaultQuantity,
          forgeQuantity: 0,
          unitCost: Number(multiDestinationForm.vault.unitCost || 0),
          status: vaultStatusLabel(multiDestinationForm.vault.vaultStatus),
          vaultStatus: multiDestinationForm.vault.vaultStatus,
          vaultCategory: multiDestinationForm.vault.vaultCategory,
          purchaseDate: multiDestinationForm.vault.purchaseDate,
          storageLocation: multiDestinationForm.vault.storageLocation || vaultStatusLabel(multiDestinationForm.vault.vaultStatus),
          actionNotes: [multiDestinationForm.vault.notes, multiDestinationForm.notes].filter(Boolean).join(" "),
          conditionName: "Near Mint",
          language: "English",
          createdAt: now,
        };
        setItems((current) => [vaultItem, ...current]);
        successes.push("Added to Vault");
      }
    } catch (error) {
      failures.push(`Vault failed: ${error.message || "Could not save"}`);
    }

    try {
      if (destinations.wishlist) {
        const wishlistQuantity = Math.max(1, Number(multiDestinationForm.wishlist.quantity || 1));
        const wishlistItem = {
          id: makeId("wishlist"),
          ...shared,
          destinationScope: ["wishlist"],
          recordType: "wishlist_item",
          businessInventory: false,
          isWishlist: true,
          quantity: wishlistQuantity,
          quantityWanted: wishlistQuantity,
          ownedQuantity: 0,
          unitCost: 0,
          targetPrice: Number(multiDestinationForm.wishlist.targetPrice || 0),
          status: "Wishlist",
          vaultStatus: "wishlist",
          vaultCategory: "Wishlist",
          storageLocation: "Wishlist",
          wishlistPriority: multiDestinationForm.wishlist.priority,
          desiredCondition: multiDestinationForm.wishlist.desiredCondition,
          wishlistNotes: multiDestinationForm.wishlist.notes,
          alertMarketPrice: Boolean(multiDestinationForm.wishlist.alertMarketPrice),
          addToMarketWatch: Boolean(multiDestinationForm.wishlist.addToMarketWatch),
          actionNotes: [
            "Wishlist item - wanted, not owned.",
            multiDestinationForm.wishlist.notes,
            multiDestinationForm.notes,
          ].filter(Boolean).join(" "),
          conditionName: multiDestinationForm.wishlist.desiredCondition || "Any",
          language: "English",
          createdAt: now,
        };
        setItems((current) => [wishlistItem, ...current]);
        successes.push("Added to Wishlist");

        if (multiDestinationForm.wishlist.addToMarketWatch && selectedCatalog?.id) {
          addProductToTideTradrWatchlist(selectedCatalog.id);
          successes.push("Added to Watchlist");
        }
      }
    } catch (error) {
      failures.push(`Wishlist failed: ${error.message || "Could not save"}`);
    }

    try {
      if (destinations.forge) {
        const forgeQuantity = Math.max(1, Number(multiDestinationForm.forge.quantity || 1));
        const forgeItem = {
          id: makeId("item"),
          ...shared,
          destinationScope: ["forge"],
          recordType: "forge_inventory",
          businessInventory: true,
          quantity: forgeQuantity,
          forgeQuantity,
          ownedQuantity: 0,
          unitCost: Number(multiDestinationForm.forge.unitCost || 0),
          salePrice: Number(multiDestinationForm.forge.plannedSellPrice || 0),
          category: multiDestinationForm.forge.businessCategory || shared.category,
          store: multiDestinationForm.forge.source || "",
          status: "In Stock",
          buyer: "Zena",
          purchaserId: "purchaser-default-1",
          purchaserName: "Zena",
          conditionName: multiDestinationForm.forge.conditionName || "Near Mint",
          language: "English",
          notes: [multiDestinationForm.forge.notes, multiDestinationForm.notes].filter(Boolean).join(" "),
          createdAt: now,
        };
        setItems((current) => [forgeItem, ...current]);
        successes.push("Added to Forge inventory");
      }
    } catch (error) {
      failures.push(`Forge failed: ${error.message || "Could not save"}`);
    }

    try {
      if (destinations.tidetradr) {
        const existingProductId = multiDestinationForm.tidetradr.existingProductId || selectedCatalog?.id || "";
        if (existingProductId) {
          addProductToTideTradrWatchlist(existingProductId);
          successes.push("Added to Watchlist");
        } else if (adminUser) {
          const catalogProduct = {
            id: makeId("catalog"),
            name: itemName,
            productName: itemName,
            category: multiDestinationForm.category || "Pokemon",
            productType: multiDestinationForm.tidetradr.productType || multiDestinationForm.productType,
            setName: multiDestinationForm.tidetradr.setName || shared.setName,
            expansion: multiDestinationForm.tidetradr.setName || shared.setName,
            barcode: multiDestinationForm.tidetradr.upc || multiDestinationForm.upcSku,
            sku: multiDestinationForm.tidetradr.sku,
            msrpPrice: Number(multiDestinationForm.tidetradr.msrpPrice || multiDestinationForm.msrpPrice || 0),
            marketPrice: Number(multiDestinationForm.marketPrice || 0),
            releaseDate: multiDestinationForm.tidetradr.releaseDate,
            sourceUrl: multiDestinationForm.tidetradr.sourceUrl,
            notes: [multiDestinationForm.tidetradr.correctionNotes, multiDestinationForm.notes].filter(Boolean).join(" "),
            sourceType: "admin_created",
            marketStatus: "Manual",
            createdAt: now,
          };
          setCatalogProducts((current) => [catalogProduct, ...current]);
          setTideTradrWatchlist((current) => [
            {
              id: makeId("watch"),
              productId: catalogProduct.id,
              name: catalogProduct.name,
              setName: catalogProduct.setName,
              productType: catalogProduct.productType,
              marketValue: Number(catalogProduct.marketPrice || 0),
              msrp: Number(catalogProduct.msrpPrice || 0),
              sourceName: "Admin",
              pinned: false,
              lastUpdated: now,
            },
            ...current,
          ]);
          successes.push("Created TideTradr catalog item");
        } else {
          submitUniversalSuggestion({
            suggestionType: SUGGESTION_TYPES.ADD_MISSING_CATALOG_PRODUCT,
            targetTable: "product_catalog",
            submittedData: {
              name: itemName,
              category: multiDestinationForm.category,
              productType: multiDestinationForm.tidetradr.productType || multiDestinationForm.productType,
              setName: multiDestinationForm.tidetradr.setName || shared.setName,
              releaseDate: multiDestinationForm.tidetradr.releaseDate,
              msrpPrice: multiDestinationForm.tidetradr.msrpPrice || multiDestinationForm.msrpPrice,
              upc: multiDestinationForm.tidetradr.upc || multiDestinationForm.upcSku,
              sku: multiDestinationForm.tidetradr.sku,
              sourceUrl: multiDestinationForm.tidetradr.sourceUrl,
              notes: [multiDestinationForm.tidetradr.correctionNotes, multiDestinationForm.notes].filter(Boolean).join(" "),
            },
            currentDataSnapshot: {},
            proofUrl: multiDestinationForm.tidetradr.sourceUrl,
            notes: [multiDestinationForm.tidetradr.correctionNotes, multiDestinationForm.notes].filter(Boolean).join(" "),
            source: "user",
          });
          successes.push("Submitted TideTradr suggestion");
        }
      }
    } catch (error) {
      failures.push(`TideTradr failed: ${error.message || "Could not save"}`);
    }

    const uniqueSuccesses = [...new Set(successes)];
    if (uniqueSuccesses.length) setVaultToast(failures.length ? `${uniqueSuccesses.join(" | ")}. ${failures.join(" | ")}` : uniqueSuccesses.join(" | "));
    if (!successes.length && failures.length) setVaultToast(failures.join(" | "));
    if (failures.length) return;
    closeFlowModal({ force: true, reset: false });
    resetMultiDestinationForm();
  }

  async function loadAllData() {
    await Promise.all([loadInventory(), loadCatalog(), loadExpenses(), loadSales(), loadVehicles(), loadTrips()]);
  }

  function mapItem(row) {
    return {
      id: row.id,
      itemName: row.itemName || row.item_name || row.name || "",
      name: row.name || "",
      sku: row.sku || "",
      buyer: row.purchaser_name || row.buyer || "Zena",
      purchaserId: row.purchaserId || row.purchaser_id || "",
      purchaserName: row.purchaserName || row.purchaser_name || row.buyer || "Zena",
      category: row.category || "Pokemon",
      store: row.store || "",
      quantity: Number(row.quantity || 0),
      quantityWanted: Number(row.quantityWanted ?? row.quantity_wanted ?? 0),
      ownedQuantity: Number(row.ownedQuantity ?? row.owned_quantity ?? 0),
      forgeQuantity: Number(row.forgeQuantity ?? row.forge_quantity ?? 0),
      unitCost: Number(row.unitCost ?? row.unit_cost ?? 0),
      salePrice: Number(row.salePrice ?? row.sale_price ?? 0),
      receiptImage: row.receiptImage || row.receipt_image || "",
      itemImage: row.itemImage || row.item_image || "",
      barcode: row.barcode || row.upc || "",
      upc: row.upc || row.barcode || "",
      catalogProductId: row.catalogProductId || row.catalog_product_id || "",
      catalogVariantId: row.catalogVariantId || row.catalog_variant_id || "",
      tideTradrProductId: row.tideTradrProductId || row.tide_tradr_product_id || row.catalogProductId || row.catalog_product_id || "",
      catalogProductName: row.catalogProductName || row.catalog_product_name || "",
    externalProductId: row.externalProductId || row.external_product_id || "",
    tideTradrUrl: row.tideTradrUrl || row.tcgplayer_url || "",
    externalProductSource: row.externalProductSource || row.external_product_source || "TideTradr",
      itemImageSource: row.itemImageSource || row.item_image_source || (row.itemImage || row.item_image ? "user" : "placeholder"),
      itemImageStatus: row.itemImageStatus || row.item_image_status || (row.itemImage || row.item_image ? "user" : "placeholder"),
      itemImageSourceUrl: row.itemImageSourceUrl || row.item_image_source_url || "",
      itemImageLastUpdated: row.itemImageLastUpdated || row.item_image_last_updated || "",
      itemImageNeedsReview: Boolean(row.itemImageNeedsReview || row.item_image_needs_review),
      marketPrice: Number(row.marketPrice ?? row.market_price ?? row.marketValue ?? row.market_value ?? 0),
      marketValue: Number(row.marketValue ?? row.market_value ?? row.marketPrice ?? row.market_price ?? 0),
      lowPrice: Number(row.lowPrice ?? row.low_price ?? 0),
      midPrice: Number(row.midPrice ?? row.mid_price ?? 0),
      highPrice: Number(row.highPrice ?? row.high_price ?? 0),
      msrpPrice: Number(row.msrpPrice ?? row.msrp_price ?? row.msrp ?? 0),
      msrp: Number(row.msrp ?? row.msrpPrice ?? row.msrp_price ?? 0),
      setCode: row.setCode || row.set_code || "",
      expansion: row.expansion || row.setName || row.set_name || "",
      setName: row.setName || row.set_name || row.expansion || "",
      productLine: row.productLine || row.product_line || "",
      productType: row.productType || row.product_type || "",
      packCount: Number(row.packCount ?? row.pack_count ?? 0),
      notes: row.notes || "",
      status: row.status || "In Stock",
      listingPlatform: row.listingPlatform || row.listing_platform || "",
      listingUrl: row.listingUrl || row.listing_url || "",
      listedPrice: Number(row.listedPrice ?? row.listed_price ?? 0),
      actionNotes: row.actionNotes || row.action_notes || "",
      storageLocation: row.storageLocation || row.storage_location || "",
      condition: row.condition || "",
      conditionName: row.conditionName || row.condition_name || row.condition || "Near Mint",
      language: row.language || "English",
      finish: row.finish || "",
      printing: row.printing || "",
      sealedCondition: row.sealedCondition || row.sealed_condition || "",
      conditionNotes: row.conditionNotes || row.condition_notes || "",
      sourceType: row.sourceType || row.source_type || row.source || "",
      source: row.source || row.sourceType || row.source_type || "",
      destinationScope: normalizeDestinationScopes(row.destinationScope || row.destination_scope || row.destinations || row.destination),
      recordType: row.recordType || row.record_type || "",
      businessInventory: Boolean(row.businessInventory || row.business_inventory),
      isWishlist: Boolean(row.isWishlist || row.is_wishlist),
      lastPriceChecked: row.lastPriceChecked || row.last_price_checked || "",
      plannedSalePrice: Number(row.plannedSalePrice ?? row.planned_sale_price ?? row.salePrice ?? row.sale_price ?? 0),
      createdAt: row.createdAt || row.created_at,
      updatedAt: row.updatedAt || row.updated_at || row.createdAt || row.created_at,
    };
  }

function mapCatalog(row) {
  const productType = row.productType || row.product_type || "";
  const productTypeText = String(productType).toLowerCase();
  const isSealedValue = row.isSealed ?? row.is_sealed;
  const isSealed =
    isSealedValue === true ||
    isSealedValue === "true" ||
    productTypeText.includes("sealed") ||
    productTypeText.includes("booster") ||
    productTypeText.includes("elite trainer") ||
    productTypeText.includes("collection") ||
    productTypeText.includes("tin");
  const catalogType =
    row.catalogType ||
    row.catalog_type ||
    (isSealed ? "sealed" : productTypeText.includes("card") || row.card_number || row.rarity ? "card" : "sealed");
  const name = row.name || row.product_name || row.card_name || "";
  const marketSource = row.marketSource || row.market_source || row.source || "TideTradr";
  const sourceUrl = row.sourceUrl || row.source_url || row.marketUrl || row.market_url || row.tcgplayerUrl || row.tcgplayer_url || "";
  const imageSmall = row.imageSmall || row.image_small || row.images?.small || "";
  const imageLarge = row.imageLarge || row.image_large || row.images?.large || row.imageUrl || row.image_url || "";
  const imageUrl = row.imageUrl || row.image_url || imageLarge || imageSmall || "";
  const marketPrice = Number(row.marketPrice ?? row.market_price ?? row.marketValue ?? row.market_value ?? 0);
  const lowPrice = Number(row.lowPrice ?? row.low_price ?? 0);
  const midPrice = Number(row.midPrice ?? row.mid_price ?? 0);
  const highPrice = Number(row.highPrice ?? row.high_price ?? 0);
  const imageProbe = {
    ...row,
    catalogType,
    imageUrl,
    imageSmall,
    imageLarge,
    imageSource: row.imageSource || row.image_source,
    imageStatus: row.imageStatus || row.image_status,
  };
  const inferredImageSource =
    String(marketSource).toLowerCase().includes("pokemon")
      ? "pokemon_tcg_api"
      : String(marketSource).toLowerCase().includes("tcgcsv")
        ? "tcgcsv"
        : getDefaultImageSource(imageProbe);
  const marketStatus = row.marketStatus || row.market_status || (marketPrice || lowPrice || midPrice || highPrice ? "cached" : "unknown");
  const cardNumber = row.cardNumber || row.card_number || "";
  const cardSortMeta = getCardSortMeta({ ...row, cardNumber });
  const mappedCardNumberSort = Number(row.cardNumberSort ?? row.card_number_sort ?? cardSortMeta.sort);
  const mappedPrintedTotal = Number(row.printedTotal ?? row.printed_total ?? cardSortMeta.printedTotal);
  const expansionRecord = row.expansionRecord || row.expansion_record || row.tcg_expansions || row.expansion_detail || null;
  const officialExpansionName =
    row.officialExpansionName ||
    row.official_expansion_name ||
    expansionRecord?.officialName ||
    expansionRecord?.official_name ||
    expansionRecord?.displayName ||
    expansionRecord?.display_name ||
    "";
  const normalizedIdentifiers = Array.isArray(row.identifiers)
    ? row.identifiers
    : Array.isArray(row.product_identifiers)
      ? row.product_identifiers
      : Array.isArray(row.productIdentifiers)
        ? row.productIdentifiers
        : [];
  const normalizedVariants = Array.isArray(row.variants)
    ? row.variants
    : Array.isArray(row.catalog_product_variants)
      ? row.catalog_product_variants
      : Array.isArray(row.catalogProductVariants)
        ? row.catalogProductVariants
        : [];
  const normalizedCardDetails =
    row.cardDetails ||
    row.card_details ||
    row.tcg_card_details ||
    row.tcgCardDetails ||
    null;

  return {
    id: row.id,
    catalogType,
    name,
    productName: catalogType === "card" ? "" : row.productName || row.product_name || name,
    cardName: catalogType === "card" ? row.cardName || row.card_name || name : row.cardName || row.card_name || "",
    pokemonName: row.pokemonName || row.pokemon_name || (catalogType === "card" ? name : ""),
    category: row.category || "Pokemon",
    setName: officialExpansionName || row.setName || row.set_name || row.source_group_name || row.expansion || "",
    legacySetName: row.setName || row.set_name || "",
    productType,
    barcode: row.barcode || row.upc || "",
    upc: row.upc || row.barcode || "",
    sku: row.sku || "",
    identifiers: normalizedIdentifiers.map((identifier) => ({
      id: identifier.id,
      catalogProductId: identifier.catalogProductId || identifier.catalog_product_id,
      identifierType: identifier.identifierType || identifier.identifier_type || "",
      identifierValue: identifier.identifierValue || identifier.identifier_value || "",
      retailer: identifier.retailer || "",
      source: identifier.source || "",
      sourceUrl: identifier.sourceUrl || identifier.source_url || "",
      confidence: identifier.confidence || "",
      confidenceScore: identifier.confidenceScore || identifier.confidence_score || "",
      status: identifier.status || "",
      isVerified: Boolean(identifier.isVerified || identifier.is_verified),
    })),
    identifierSearch: row.identifierSearch || row.identifier_search || "",
    marketSource,
    externalProductId: row.externalProductId || row.external_product_id || "",
    tcgplayerProductId: row.tcgplayerProductId || row.tcgplayer_product_id || "",
    marketUrl: row.marketUrl || row.market_url || "",
    sourceUrl,
    tcgplayerUrl: row.tcgplayerUrl || row.tcgplayer_url || row.marketUrl || row.market_url || "",
    imageUrl,
    imageSmall,
    imageLarge,
    imageSource: row.imageSource || row.image_source || inferredImageSource,
    imageSourceUrl: row.imageSourceUrl || row.image_source_url || sourceUrl || "",
    imageStatus: row.imageStatus || row.image_status || getDefaultImageStatus({ ...imageProbe, imageSource: row.imageSource || row.image_source || inferredImageSource }),
    imageLastUpdated: row.imageLastUpdated || row.image_last_updated || row.lastPriceChecked || row.last_price_checked || row.lastUpdated || row.updated_at || "",
    imageNeedsReview: Boolean(row.imageNeedsReview || row.image_needs_review),
    marketPrice: Number.isFinite(marketPrice) ? marketPrice : 0,
    marketValue: Number.isFinite(marketPrice) ? marketPrice : 0,
    lowPrice: Number.isFinite(lowPrice) ? lowPrice : 0,
    midPrice: Number.isFinite(midPrice) ? midPrice : 0,
    highPrice: Number.isFinite(highPrice) ? highPrice : 0,
    msrpPrice: Number(row.msrpPrice ?? row.msrp_price ?? row.msrp ?? 0),
    msrpSource: row.msrpSource || row.msrp_source || "",
    msrpSourceUrl: row.msrpSourceUrl || row.msrp_source_url || "",
    msrpConfidence: row.msrpConfidence || row.msrp_confidence || "",
    setCode: row.setCode || row.set_code || "",
    expansion: row.expansion || row.set_name || "",
    expansionId: row.expansionId || row.expansion_id || "",
    expansionOfficialName: officialExpansionName,
    expansionDisplayName: row.expansionDisplayName || row.expansion_display_name || expansionRecord?.displayName || expansionRecord?.display_name || officialExpansionName,
    expansionSeries: row.expansionSeries || row.expansion_series || expansionRecord?.series || "",
    expansionSymbolUrl: row.expansionSymbolUrl || row.expansion_symbol_url || expansionRecord?.symbolUrl || expansionRecord?.symbol_url || "",
    expansionLogoUrl: row.expansionLogoUrl || row.expansion_logo_url || expansionRecord?.logoUrl || expansionRecord?.logo_url || "",
    pokemonTcgIoId: row.pokemonTcgIoId || row.pokemon_tcg_io_id || expansionRecord?.pokemon_tcg_io_id || "",
    releaseDate: row.releaseDate || row.release_date || expansionRecord?.releaseDate || expansionRecord?.release_date || "",
    productLine: row.productLine || row.product_line || "",
    packCount: Number(row.packCount ?? row.pack_count ?? 0),
    productKind: row.productKind || row.product_kind || (catalogType === "card" ? "single_card" : isSealed ? "sealed_product" : "unknown"),
    sealedProductType: row.sealedProductType || row.sealed_product_type || "",
    isPokemonCenterExclusive: Boolean(row.isPokemonCenterExclusive || row.is_pokemon_center_exclusive),
    contents: row.contents || {},
    region: row.region || "US",
    language: row.language || "English",
    sourceGroupId: row.sourceGroupId || row.source_group_id || "",
    sourceGroupName: row.sourceGroupName || row.source_group_name || "",
    priceSubtype: row.priceSubtype || row.price_subtype || "",
    variantNames: row.variantNames || row.variant_names || "",
    variants: normalizedVariants.map((variant) => ({
      id: variant.id,
      catalogProductId: variant.catalogProductId || variant.catalog_product_id || "",
      variantName: variant.variantName || variant.variant_name || "",
      printing: variant.printing || "",
      finish: variant.finish || "",
      language: variant.language || "English",
      tcgplayerSkuId: variant.tcgplayerSkuId || variant.tcgplayer_sku_id || "",
      conditionId: variant.conditionId || variant.condition_id || "",
      conditionName: variant.conditionName || variant.condition_name || "",
      isDefault: Boolean(variant.isDefault || variant.is_default),
    })),
    cardDetails: normalizedCardDetails
      ? {
          cardName: normalizedCardDetails.cardName || normalizedCardDetails.card_name || "",
          supertype: normalizedCardDetails.supertype || "",
          subtypes: normalizedCardDetails.subtypes || [],
          stage: normalizedCardDetails.stage || "",
          evolvesFrom: normalizedCardDetails.evolvesFrom || normalizedCardDetails.evolves_from || "",
          hp: normalizedCardDetails.hp || "",
          types: normalizedCardDetails.types || [],
          abilities: normalizedCardDetails.abilities || [],
          attacks: normalizedCardDetails.attacks || [],
          weaknesses: normalizedCardDetails.weaknesses || [],
          resistances: normalizedCardDetails.resistances || [],
          retreatCost: normalizedCardDetails.retreatCost || normalizedCardDetails.retreat_cost || [],
          convertedRetreatCost: normalizedCardDetails.convertedRetreatCost || normalizedCardDetails.converted_retreat_cost || "",
          cardNumber: normalizedCardDetails.cardNumber || normalizedCardDetails.card_number || "",
          printedTotal: normalizedCardDetails.printedTotal || normalizedCardDetails.printed_total || "",
          rarity: normalizedCardDetails.rarity || "",
          artist: normalizedCardDetails.artist || "",
          flavorText: normalizedCardDetails.flavorText || normalizedCardDetails.flavor_text || "",
          regulationMark: normalizedCardDetails.regulationMark || normalizedCardDetails.regulation_mark || "",
          legalities: normalizedCardDetails.legalities || {},
          nationalPokedexNumbers: normalizedCardDetails.nationalPokedexNumbers || normalizedCardDetails.national_pokedex_numbers || [],
          rawSource: normalizedCardDetails.rawSource || normalizedCardDetails.raw_source || {},
        }
      : null,
    cardNumber,
    cardNumberPrefix: row.cardNumberPrefix || row.card_number_prefix || cardSortMeta.prefix,
    cardNumberSuffix: row.cardNumberSuffix || row.card_number_suffix || cardSortMeta.suffix,
    cardNumberSort: Number.isFinite(mappedCardNumberSort) ? mappedCardNumberSort : null,
    printedTotal: Number.isFinite(mappedPrintedTotal) ? mappedPrintedTotal : null,
    catalogGroup: row.catalogGroup || row.catalog_group || "",
    catalogGroupSort: Number(row.catalogGroupSort ?? row.catalog_group_sort ?? 0),
    setSortName: row.setSortName || row.set_sort_name || "",
    historySnapshotCount: Number(row.historySnapshotCount ?? row.history_snapshot_count ?? 0),
    latestHistorySnapshot: row.latestHistorySnapshot || row.latest_history_snapshot || "",
    historyVolatility: row.historyVolatility || row.history_volatility || "",
    historyChange3m: Number(row.historyChange3m ?? row.history_3m_change_percent ?? 0),
    rarity: row.rarity || "",
    marketStatus,
    marketLastUpdated: row.marketLastUpdated || row.market_last_updated || row.lastPriceChecked || row.last_price_checked || row.updated_at || "",
    lastPriceChecked: row.lastPriceChecked || row.last_price_checked || "",
    sourceType: row.sourceType || row.source_type || "supabase",
    rawSource: row.rawSource || row.raw_source || null,
    notes: row.notes || "",
    createdAt: row.createdAt || row.created_at,
    updatedAt: row.updatedAt || row.updated_at || row.createdAt || row.created_at,
  };
}

  function mapExpense(row) {
    const normalizedCategory =
      row.category === "Gas"
        ? "Mileage/Vehicle"
        : row.category === "Software"
          ? "Software/Subscriptions"
          : row.category === "Other"
            ? "Miscellaneous"
            : ["Storage", "Equipment"].includes(row.category)
              ? "Supplies"
              : row.category || "Supplies";
    return {
      id: row.id,
      expenseId: row.id,
      date: row.date || row.expense_date || "",
      vendor: row.vendor || "",
      category: normalizedCategory,
      subcategory: row.subcategory || "",
      buyer: row.buyer || "Zena",
      amount: Number(row.amount || 0),
      paymentMethod: row.paymentMethod || row.payment_method || "",
      linkedItemId: row.linkedItemId || row.linked_item_id || "",
      linkedSaleId: row.linkedSaleId || row.linked_sale_id || "",
      notes: row.notes || "",
      receiptImage: row.receiptImage || row.receipt_image || row.receipt_photo || "",
      receiptPhoto: row.receiptPhoto || row.receipt_photo || row.receipt_image || "",
      taxDeductible: !!(row.taxDeductible || row.tax_deductible),
      campaignName: row.campaignName || row.campaign_name || "",
      platform: row.platform || "",
      goal: row.goal || "",
      startDate: row.startDate || row.start_date || "",
      endDate: row.endDate || row.end_date || "",
      linkedSales: row.linkedSales || row.linked_sales || "",
      resultsNotes: row.resultsNotes || row.results_notes || "",
      createdAt: row.createdAt || row.created_at,
      updatedAt: row.updatedAt || row.updated_at,
    };
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
    let result = await supabase.from("pokemon_catalog_browse").select("*").order("created_at", { ascending: false });
    if (result.error) {
      result = await supabase.from("product_catalog").select("*").order("created_at", { ascending: false });
    }
    if (result.error) return alert("Could not load catalog: " + result.error.message);
    setCatalogProducts((result.data || []).map(mapCatalog));
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
    const cleanVariantId = String(form.catalogVariantId || "").trim();
    const cleanCondition = String(form.conditionName || form.condition || "").trim().toLowerCase();
    const cleanExpansion = String(form.expansion || "").trim().toLowerCase();
    const cleanProductType = String(form.productType || "").trim().toLowerCase();

    return items.find((item) => {
      const itemName = String(item.name || "").trim().toLowerCase();
      const itemBarcode = String(item.barcode || "").trim();
      const itemCatalogId = String(item.catalogProductId || "").trim();
      const itemVariantId = String(item.catalogVariantId || "").trim();
      const itemCondition = String(item.conditionName || item.condition || "").trim().toLowerCase();
      const itemExpansion = String(item.expansion || "").trim().toLowerCase();
      const itemProductType = String(item.productType || "").trim().toLowerCase();

      const sameCatalog =
        cleanCatalogId &&
        itemCatalogId &&
        cleanCatalogId === itemCatalogId &&
        ((cleanVariantId || itemVariantId) ? cleanVariantId === itemVariantId : true) &&
        ((cleanCondition || itemCondition) ? cleanCondition === itemCondition : true);

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

      const variantConflict = cleanVariantId && itemVariantId && cleanVariantId !== itemVariantId;
      const conditionConflict = cleanCondition && itemCondition && cleanCondition !== itemCondition;

      return sameCatalog || sameBarcode || (!variantConflict && !conditionConflict && (sameExactName || sameExpansionAndType));
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
        destinationScope: ["forge"],
        recordType: "forge_inventory",
        businessInventory: true,
        isWishlist: false,
        sku: `ET-${Date.now()}`,
        buyer: purchaser.purchaserName,
        purchaserId: purchaser.purchaserId,
        purchaserName: purchaser.purchaserName,
        category: itemForm.category,
        store: itemForm.store,
        quantity: Number(itemForm.quantity),
        forgeQuantity: Number(itemForm.quantity),
        ownedQuantity: 0,
        quantityWanted: 0,
        unitCost: Number(itemForm.unitCost),
        salePrice: Number(itemForm.salePrice || 0),
        receiptImage: itemForm.receiptImage,
        itemImage: itemForm.itemImage,
        itemImageSource: itemForm.itemImageSource || (itemForm.itemImage ? "user" : "placeholder"),
        itemImageStatus: itemForm.itemImageStatus || (itemForm.itemImage ? "user" : "placeholder"),
        itemImageSourceUrl: itemForm.itemImageSourceUrl || "",
        itemImageLastUpdated: itemForm.itemImageLastUpdated || (itemForm.itemImage ? now : ""),
        itemImageNeedsReview: Boolean(itemForm.itemImageNeedsReview),
        barcode: itemForm.barcode,
        catalogProductId: selectedCatalog?.id || "",
        catalogVariantId: itemForm.catalogVariantId || "",
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
        storageLocation: itemForm.storageLocation || "",
        condition: itemForm.condition || "",
        conditionName: itemForm.conditionName || itemForm.condition || "Near Mint",
        language: itemForm.language || "English",
        finish: itemForm.finish || "",
        printing: itemForm.printing || "",
        sealedCondition: itemForm.sealedCondition || "",
        conditionNotes: itemForm.conditionNotes || "",
        tags: itemForm.tags || "",
        sourceType: itemForm.sourceType || "Manual",
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
      setFeatureSectionsOpen((current) => ({
        ...current,
        forge_inventory: newItem.status !== "Personal Collection" && newItem.status !== "Held" ? true : current.forge_inventory,
        vault_collection_items: newItem.status === "Personal Collection" || newItem.status === "Held" ? true : current.vault_collection_items,
      }));
      if (activeFlowModal?.type === "addInventory") {
        closeFlowModal({ force: true, reset: false });
      } else {
        setActiveTab(newItem.status === "Personal Collection" || newItem.status === "Held" ? "vault" : "inventory");
      }
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
        catalog_variant_id: itemForm.catalogVariantId || existing.catalogVariantId || null,
        external_product_source: "TideTradr",
        external_product_id: itemForm.externalProductId || existing.externalProductId || "",
        tcgplayer_url: itemForm.tideTradrUrl || existing.tideTradrUrl || "",
        status: itemForm.status || existing.status || "In Stock",
        listing_platform: itemForm.listingPlatform || existing.listingPlatform || "",
        listing_url: itemForm.listingUrl || existing.listingUrl || "",
        listed_price: Number(itemForm.listedPrice || existing.listedPrice || 0),
        action_notes: itemForm.actionNotes || existing.actionNotes || "",
        condition_name: itemForm.conditionName || existing.conditionName || existing.condition || "Near Mint",
        language: itemForm.language || existing.language || "English",
        finish: itemForm.finish || existing.finish || "",
        printing: itemForm.printing || existing.printing || "",
        last_price_checked: itemForm.marketPrice
          ? new Date().toISOString()
          : existing.lastPriceChecked || null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("inventory_items").update(row).eq("id", existing.id).select().single();
      if (error) return alert("Could not merge restock: " + error.message);
      setItems(items.map((item) => (item.id === existing.id ? mapItem(data) : item)));
      setItemForm(blankItem);
      if (activeFlowModal?.type === "addInventory") {
        closeFlowModal({ force: true, reset: false });
      } else {
        setActiveTab("inventory");
      }
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
      catalog_variant_id: itemForm.catalogVariantId || null,
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
      condition_name: itemForm.conditionName || itemForm.condition || "Near Mint",
      language: itemForm.language || "English",
      finish: itemForm.finish || "",
      printing: itemForm.printing || "",
    };

    const { data, error } = await supabase.from("inventory_items").insert(row).select().single();
    if (error) return alert("Could not add item: " + error.message);

    setItems([mapItem(data), ...items]);
    setItemForm(blankItem);
    setFeatureSectionsOpen((current) => ({ ...current, forge_inventory: true }));
    if (activeFlowModal?.type === "addInventory") {
      closeFlowModal({ force: true, reset: false });
    } else {
      setActiveTab("inventory");
    }
  }

  async function saveEditedItem(event) {
    event.preventDefault();
    const editingVault = isEditingVaultItem();
    if (editingVault) {
      const validationMessage = validateVaultDraft({
        ...BLANK_VAULT_FORM,
        name: itemForm.name,
        quantity: itemForm.quantity,
        vaultStatus: itemForm.vaultStatus || normalizeVaultStatus(itemForm),
        unitCost: itemForm.unitCost,
        msrpPrice: itemForm.msrpPrice,
        marketPrice: itemForm.marketPrice,
        salePrice: itemForm.salePrice,
      });
      if (validationMessage) {
        setVaultToast(validationMessage);
        return;
      }
    } else if (!itemForm.name || !itemForm.unitCost || !itemForm.quantity) {
      return alert("Please fill out item name, quantity, and unit cost.");
    }

    if (BETA_LOCAL_MODE) {
      const purchaser = resolvePurchaser(itemForm);
      const updatedItem = {
        ...items.find((item) => item.id === editingItemId),
        itemName: itemForm.name,
        name: itemForm.name,
        buyer: purchaser.purchaserName,
        purchaserId: purchaser.purchaserId,
        purchaserName: purchaser.purchaserName,
        category: itemForm.category,
        store: itemForm.store,
        quantity: Number(itemForm.quantity),
        unitCost: Number(itemForm.unitCost),
        salePrice: Number(itemForm.salePrice || 0),
        plannedSalePrice: Number(itemForm.salePrice || 0),
        receiptImage: itemForm.receiptImage,
        itemImage: itemForm.itemImage,
        itemImageSource: itemForm.itemImageSource || (itemForm.itemImage ? "user" : "placeholder"),
        itemImageStatus: itemForm.itemImageStatus || (itemForm.itemImage ? "user" : "placeholder"),
        itemImageSourceUrl: itemForm.itemImageSourceUrl || "",
        itemImageLastUpdated: itemForm.itemImageLastUpdated || (itemForm.itemImage ? new Date().toISOString() : ""),
        itemImageNeedsReview: Boolean(itemForm.itemImageNeedsReview),
        barcode: itemForm.barcode,
        upc: itemForm.barcode,
        sku: itemForm.sku,
        catalogProductId: itemForm.catalogProductId,
        catalogVariantId: itemForm.catalogVariantId || "",
        tideTradrProductId: itemForm.catalogProductId,
        externalProductId: itemForm.externalProductId,
        tideTradrUrl: itemForm.tideTradrUrl,
        marketPrice: Number(itemForm.marketPrice || 0),
        marketValue: Number(itemForm.marketPrice || 0),
        lowPrice: Number(itemForm.lowPrice || 0),
        midPrice: Number(itemForm.midPrice || 0),
        highPrice: Number(itemForm.highPrice || 0),
        msrpPrice: Number(itemForm.msrpPrice || 0),
        msrp: Number(itemForm.msrpPrice || 0),
        setCode: itemForm.setCode || "",
        expansion: itemForm.expansion || "",
        setName: itemForm.expansion || "",
        productLine: itemForm.productLine || "",
        productType: itemForm.productType || "",
        packCount: Number(itemForm.packCount || 0),
        lastPriceChecked: itemForm.marketPrice ? new Date().toISOString() : "",
        status: itemForm.status,
        vaultStatus: itemForm.vaultStatus || items.find((item) => item.id === editingItemId)?.vaultStatus || "",
        listingPlatform: itemForm.listingPlatform,
        listingUrl: itemForm.listingUrl,
        listedPrice: Number(itemForm.listedPrice || 0),
        actionNotes: itemForm.actionNotes,
        storageLocation: itemForm.storageLocation || "",
        condition: itemForm.condition || "",
        conditionName: itemForm.conditionName || itemForm.condition || "Near Mint",
        language: itemForm.language || "English",
        finish: itemForm.finish || "",
        printing: itemForm.printing || "",
        sealedCondition: itemForm.sealedCondition || "",
        conditionNotes: itemForm.conditionNotes || "",
        tags: itemForm.tags || "",
        sourceType: itemForm.sourceType || itemForm.source || "",
        source: itemForm.source || itemForm.sourceType || "",
        tradedDate: itemForm.tradedDate || "",
        tradeNotes: itemForm.tradeNotes || "",
        receivedItemName: itemForm.receivedItemName || "",
        receivedCatalogItemId: itemForm.receivedCatalogItemId || "",
        updatedAt: new Date().toISOString(),
      };

      setItems(items.map((item) => (item.id === editingItemId ? updatedItem : item)));
      setEditingItemId(null);
      setItemForm(blankItem);
      if (activeFlowModal?.type === "addInventory") closeFlowModal({ force: true, reset: false });
      if (updatedItem.vaultStatus) setVaultToast("Vault item saved.");
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
      catalog_variant_id: itemForm.catalogVariantId || null,
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
      vault_status: itemForm.vaultStatus || null,
      condition_name: itemForm.conditionName || itemForm.condition || "Near Mint",
      language: itemForm.language || "English",
      finish: itemForm.finish || "",
      printing: itemForm.printing || "",
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("inventory_items").update(row).eq("id", editingItemId).select().single();
    if (error) return alert("Could not update item: " + error.message);

    setItems(items.map((item) => (item.id === editingItemId ? mapItem(data) : item)));
    setEditingItemId(null);
    setItemForm(blankItem);
    if (activeFlowModal?.type === "addInventory") closeFlowModal({ force: true, reset: false });
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
      itemImageSource: item.itemImageSource || (item.itemImage ? "user" : "placeholder"),
      itemImageStatus: item.itemImageStatus || (item.itemImage ? "user" : "placeholder"),
      itemImageSourceUrl: item.itemImageSourceUrl || "",
      itemImageLastUpdated: item.itemImageLastUpdated || "",
      itemImageNeedsReview: Boolean(item.itemImageNeedsReview),
      barcode: item.barcode,
      sku: item.sku || "",
      catalogProductId: item.catalogProductId,
      catalogVariantId: item.catalogVariantId || "",
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
      vaultStatus: item.vaultStatus || "",
      storageLocation: item.storageLocation || "",
      condition: item.condition || "",
      conditionName: item.conditionName || item.condition || "Near Mint",
      language: item.language || "English",
      finish: item.finish || "",
      printing: item.printing || "",
      sealedCondition: item.sealedCondition || "",
      conditionNotes: item.conditionNotes || "",
      sourceType: item.sourceType || item.source || "",
      status: item.status,
      listingPlatform: item.listingPlatform,
      listingUrl: item.listingUrl,
      listedPrice: item.listedPrice,
      actionNotes: item.actionNotes,
      tradedDate: item.tradedDate || "",
      tradeNotes: item.tradeNotes || "",
      receivedItemName: item.receivedItemName || "",
      receivedCatalogItemId: item.receivedCatalogItemId || "",
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
      catalogVariantId: item.catalogVariantId || "",
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
      conditionName: item.conditionName || item.condition || "Near Mint",
      language: item.language || "English",
      finish: item.finish || "",
      printing: item.printing || "",
    });
    openFlowModal("addInventory", { size: "large", source: "restock" });
  }

  async function deleteItem(id) {
    const itemToDelete = items.find((item) => item.id === id);
    const isVaultDelete = Boolean(itemToDelete?.vaultStatus);
    const confirmed = window.confirm(
      isVaultDelete ? "Delete this Vault item?" : `Delete ${itemToDelete?.name || "this item"}? This cannot be undone in private beta mode.`
    );

    if (!confirmed) return false;

    if (BETA_LOCAL_MODE) {
      setItems(items.filter((item) => item.id !== id));
      if (editingItemId === id) {
        setEditingItemId(null);
        setItemForm(blankItem);
      }
      if (isVaultDelete) setVaultToast("Vault item deleted.");
      return true;
    }

    const { error } = await supabase.from("inventory_items").delete().eq("id", id);
    if (error) return alert("Could not delete item: " + error.message);
    setItems(items.filter((item) => item.id !== id));
    if (editingItemId === id) {
      setEditingItemId(null);
      setItemForm(blankItem);
    }
    return true;
  }
  async function updateItemStatus(item, newStatus) {
    const vaultOption = VAULT_STATUS_OPTIONS.find((option) => option.value === newStatus || option.label === newStatus);
    const nextStatus = vaultOption ? vaultStatusLabel(vaultOption.value) : newStatus;
    if (BETA_LOCAL_MODE) {
      setItems((currentItems) =>
        currentItems.map((currentItem) =>
          currentItem.id === item.id ? { ...currentItem, status: nextStatus, ...(vaultOption ? { vaultStatus: vaultOption.value } : {}) } : currentItem
        )
      );
      if (item.vaultStatus || vaultOption) setVaultToast("Vault item saved.");
      return;
    }

    const { data, error } = await supabase
      .from("inventory_items")
      .update({
        status: nextStatus,
        ...(vaultOption ? { vault_status: vaultOption.value } : {}),
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

  function openVaultForgeTransfer(item, mode = "move") {
    const quantity = Math.max(1, Number(item.quantity || 1));
    setVaultForgeTransfer({
      item,
      mode,
      quantityToMove: mode === "copy" ? 1 : quantity,
      costPaid: hasValue(item.unitCost) ? item.unitCost : "",
      duplicateMode: "create",
    });
  }

  function openVaultDuplicateItem(item) {
    setVaultDuplicateItem({
      item,
      sameItem: true,
      quantity: Number(item.quantity || 1),
      samePrice: true,
      sameStatus: true,
    });
  }

  function confirmVaultDuplicateItem(event) {
    event?.preventDefault();
    if (!vaultDuplicateItem?.item) return;
    const source = vaultDuplicateItem.item;
    const now = new Date().toISOString();
    const duplicate = {
      ...source,
      id: makeId("vault-copy"),
      name: vaultDuplicateItem.sameItem ? source.name : `${source.name} Copy`,
      quantity: Math.max(1, Number(vaultDuplicateItem.quantity || 1)),
      unitCost: vaultDuplicateItem.samePrice ? source.unitCost : 0,
      marketPrice: vaultDuplicateItem.samePrice ? source.marketPrice : 0,
      msrpPrice: vaultDuplicateItem.samePrice ? source.msrpPrice : 0,
      salePrice: vaultDuplicateItem.samePrice ? source.salePrice : 0,
      status: vaultDuplicateItem.sameStatus ? source.status : "Personal Collection",
      vaultStatus: vaultDuplicateItem.sameStatus ? normalizeVaultStatus(source) : "personal_collection",
      sourceType: "Manual",
      source: "Duplicated Vault item",
      vaultHistory: [
        ...(source.vaultHistory || []),
        { type: "duplicated_from", date: now, sourceVaultItemId: source.id },
      ],
      createdAt: now,
      updatedAt: now,
    };
    setItems((current) => [duplicate, ...current]);
    setVaultDuplicateItem(null);
    setVaultToast("Vault item saved.");
  }

  function refreshVaultMarket(item) {
    setVaultToast("Market refresh is not connected yet. Current values are manually entered or estimated beta data.");
    if (!item?.id) return;
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, marketStatus: candidate.marketStatus || "manual", updatedAt: new Date().toISOString() } : candidate));
  }

  function confirmVaultForgeTransfer(modeOverride, quantityOverride) {
    if (!vaultForgeTransfer?.item) return;
    const sourceItem = vaultForgeTransfer.item;
    const mode = modeOverride || vaultForgeTransfer.mode || "move";
    const quantityAvailable = Math.max(0, Number(sourceItem.quantity || 0));
    const requestedQuantity = Number(quantityOverride || vaultForgeTransfer.quantityToMove || 1);
    if (quantityAvailable < 1) {
      setVaultToast("Move to Forge is disabled because quantity is 0.");
      return;
    }
    if (!Number.isFinite(requestedQuantity) || requestedQuantity < 1) {
      setVaultToast("Quantity must be at least 1.");
      return;
    }
    if (requestedQuantity > quantityAvailable) {
      setVaultToast("Move quantity cannot be higher than owned quantity.");
      return;
    }
    const quantityToMove = requestedQuantity;
    const now = new Date().toISOString();
    const sourceCatalogId = String(sourceItem.catalogProductId || "");
    const duplicate = sourceCatalogId ? items.find((item) =>
      item.id !== sourceItem.id &&
      !item.vaultStatus &&
      String(item.catalogProductId || "") === sourceCatalogId
    ) : null;

    const forgeItem = {
      ...sourceItem,
      id: duplicate && vaultForgeTransfer.duplicateMode === "existing" ? duplicate.id : makeId("forge-vault"),
      quantity: quantityToMove,
      unitCost: Number(vaultForgeTransfer.costPaid || sourceItem.unitCost || 0),
      status: "In Stock",
      vaultStatus: "",
      source: "vault",
      sourceType: "Forge copy",
      sourceLocation: "vault",
      originalVaultItemId: sourceItem.id,
      movedFromVaultAt: now,
      dateMovedToForge: now,
      acquisitionType: "moved_from_vault",
      actionNotes: `Moved from The Vault${sourceItem.actionNotes ? ` | ${sourceItem.actionNotes}` : ""}`,
      createdAt: now,
      updatedAt: now,
    };

    setVaultMoving(true);
    setItems((currentItems) => {
      let nextItems = [...currentItems];
      if (duplicate && vaultForgeTransfer.duplicateMode === "existing") {
        nextItems = nextItems.map((item) =>
          item.id === duplicate.id
            ? {
                ...item,
                quantity: Number(item.quantity || 0) + quantityToMove,
                notes: [item.notes, `Added ${quantityToMove} from Vault item ${sourceItem.id}`].filter(Boolean).join(" | "),
                updatedAt: now,
              }
            : item
        );
      } else {
        nextItems = [forgeItem, ...nextItems];
      }

      if (mode === "move") {
        nextItems = nextItems.map((item) => {
          if (item.id !== sourceItem.id) return item;
          const remainingQuantity = quantityAvailable - quantityToMove;
          const historyEntry = {
            type: "moved_to_forge",
            date: now,
            quantity: quantityToMove,
            forgeItemId: duplicate && vaultForgeTransfer.duplicateMode === "existing" ? duplicate.id : forgeItem.id,
          };
          return {
            ...item,
            quantity: remainingQuantity > 0 ? remainingQuantity : item.quantity,
            status: remainingQuantity > 0 ? item.status : "Moved to Forge",
            vaultStatus: remainingQuantity > 0 ? normalizeVaultStatus(item) : "moved_to_forge",
            dateMovedToForge: now,
            linkedForgeItemId: historyEntry.forgeItemId,
            vaultHistory: [...(item.vaultHistory || []), historyEntry],
            updatedAt: now,
          };
        });
      } else {
        nextItems = nextItems.map((item) =>
          item.id === sourceItem.id
            ? {
                ...item,
                linkedForgeItemId: duplicate && vaultForgeTransfer.duplicateMode === "existing" ? duplicate.id : forgeItem.id,
                vaultHistory: [
                  ...(item.vaultHistory || []),
                  { type: "copied_to_forge", date: now, quantity: quantityToMove, forgeItemId: duplicate && vaultForgeTransfer.duplicateMode === "existing" ? duplicate.id : forgeItem.id },
                ],
                updatedAt: now,
              }
            : item
        );
      }
      return nextItems;
    });
    setVaultForgeTransfer(null);
    setVaultMoving(false);
    setFeatureSectionsOpen((current) => ({ ...current, forge_inventory: true }));
    setVaultToast(mode === "copy" ? "Item copied to Forge." : "Item moved to Forge.");
  }
  async function addCatalogProduct(event) {
    event.preventDefault();
    if (!catalogForm.name) return alert("Please enter a product name.");

    if (BETA_LOCAL_MODE) {
      const now = new Date().toISOString();
      const catalogName = catalogForm.catalogType === "card"
        ? catalogForm.cardName || catalogForm.name
        : catalogForm.productName || catalogForm.name;
      const cardSortMeta = getCardSortMeta({ cardNumber: catalogForm.cardNumber });
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
        imageSmall: catalogForm.imageSmall || catalogForm.imageUrl || "",
        imageLarge: catalogForm.imageLarge || catalogForm.imageUrl || "",
        imageSource: catalogForm.imageSource || (catalogForm.imageUrl ? "manual" : "placeholder"),
        imageSourceUrl: catalogForm.imageSourceUrl || catalogForm.marketUrl || "",
        imageStatus: catalogForm.imageStatus || (catalogForm.imageUrl ? "manual" : "placeholder"),
        imageLastUpdated: catalogForm.imageLastUpdated || now,
        imageNeedsReview: Boolean(catalogForm.imageNeedsReview),
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
        cardNumberPrefix: cardSortMeta.prefix,
        cardNumberSuffix: cardSortMeta.suffix,
        cardNumberSort: cardSortMeta.sort,
        printedTotal: cardSortMeta.printedTotal,
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

      if (!adminUser) {
        submitUniversalSuggestion({
          suggestionType: editingCatalogId ? SUGGESTION_TYPES.CORRECT_CATALOG_PRODUCT : SUGGESTION_TYPES.ADD_MISSING_CATALOG_PRODUCT,
          targetTable: "catalog_items",
          targetRecordId: editingCatalogId || null,
          submittedData: product,
          currentDataSnapshot: editingCatalogId ? catalogProducts.find((item) => item.id === editingCatalogId) || null : null,
          notes: catalogForm.notes || "Submitted from TideTradr catalog form.",
          source: "tidetradr-catalog",
        });
        setEditingCatalogId(null);
        setCatalogForm(blankCatalog);
        return;
      }

      setCatalogProducts(editingCatalogId ? catalogProducts.map((item) => (item.id === editingCatalogId ? product : item)) : [product, ...catalogProducts]);
      setEditingCatalogId(null);
      setCatalogForm(blankCatalog);
      return;
    }

    if (!user) return alert("Please log in first.");

    const cardSortMeta = getCardSortMeta({ cardNumber: catalogForm.cardNumber });
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
  image_small: catalogForm.imageSmall,
  image_large: catalogForm.imageLarge,
  image_source: catalogForm.imageSource,
  image_source_url: catalogForm.imageSourceUrl,
  image_status: catalogForm.imageStatus,
  image_last_updated: catalogForm.imageLastUpdated || new Date().toISOString(),
  image_needs_review: Boolean(catalogForm.imageNeedsReview),

  market_price: Number(catalogForm.marketPrice || 0),
  low_price: Number(catalogForm.lowPrice || 0),
  mid_price: Number(catalogForm.midPrice || 0),
  high_price: Number(catalogForm.highPrice || 0),

  msrp_price: Number(catalogForm.msrpPrice || 0),
  set_code: catalogForm.setCode || "",
  expansion: catalogForm.expansion || "",
  product_line: catalogForm.productLine || "",
  pack_count: Number(catalogForm.packCount || 0),
  card_number: catalogForm.cardNumber || null,
  card_number_prefix: cardSortMeta.prefix || null,
  card_number_suffix: cardSortMeta.suffix || null,
  card_number_sort: cardSortMeta.sort,
  printed_total: cardSortMeta.printedTotal,
  rarity: catalogForm.rarity || null,

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
    imageSmall: product.imageSmall || "",
    imageLarge: product.imageLarge || "",
    imageSource: product.imageSource || getDefaultImageSource(product),
    imageSourceUrl: product.imageSourceUrl || "",
    imageStatus: product.imageStatus || getDefaultImageStatus(product),
    imageLastUpdated: product.imageLastUpdated || "",
    imageNeedsReview: Boolean(product.imageNeedsReview),

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
    if (!adminUser) {
      const product = catalogProducts.find((item) => String(item.id) === String(id));
      submitUniversalSuggestion({
        suggestionType: SUGGESTION_TYPES.CORRECT_CATALOG_PRODUCT,
        targetTable: "catalog_items",
        targetRecordId: id,
        submittedData: { requestedAction: "remove_or_hide", name: catalogTitle(product), productId: id },
        currentDataSnapshot: product || null,
        notes: "User requested review before removing a shared catalog item.",
        source: "tidetradr-catalog",
      });
      return;
    }
    if (BETA_LOCAL_MODE) {
      setCatalogProducts(catalogProducts.filter((product) => product.id !== id));
      return;
    }

    const { error } = await supabase.from("product_catalog").delete().eq("id", id);
    if (error) return alert("Could not delete catalog product: " + error.message);
    setCatalogProducts(catalogProducts.filter((product) => product.id !== id));
  }

function applyCatalogProduct(productId) {
  const product = typeof productId === "object"
    ? productId
    : catalogProducts.find((p) => String(p.id) === String(productId));

  if (!product) return;
  const resolvedProductId = product.id || productId;
  updateItemForm("catalogProductId", resolvedProductId);
  const marketInfo = getTideTradrMarketInfo(product);
  const defaultVariant = getCatalogVariantOptions(product).find((variant) => variant.isDefault) || getCatalogVariantOptions(product)[0] || null;

  setItemForm((old) => ({
    ...old,
    catalogProductId: resolvedProductId,
    catalogVariantId: defaultVariant?.id || "",

    name: product.name || "",
    category: product.category || "Pokemon",
    barcode: product.barcode || "",
    externalProductId: product.externalProductId || "",
    tideTradrUrl: product.marketUrl || "",
    itemImage: getCatalogImage(product) || "",
    itemImageSource: product.imageSource || getDefaultImageSource(product),
    itemImageStatus: product.imageStatus || getDefaultImageStatus(product),
    itemImageSourceUrl: product.imageSourceUrl || product.marketUrl || "",
    itemImageLastUpdated: product.imageLastUpdated || product.lastUpdated || "",
    itemImageNeedsReview: Boolean(product.imageNeedsReview),

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
    finish: defaultVariant?.finish || product.finish || "",
    printing: defaultVariant?.printing || product.printing || "",
    language: defaultVariant?.language || product.language || old.language || "English",
    conditionName: product.catalogType === "card" ? old.conditionName || "Near Mint" : old.conditionName || "",

    unitCost: marketInfo.msrp || old.unitCost || "",
    salePrice: marketInfo.currentMarketValue || old.salePrice || "",
  }));
}

function getTideTradrMarketInfo(product = {}) {
  const bestPrice = getBestAvailableMarketPrice(product, marketPriceCache);
  const msrp = toNumber(product.msrpPrice || product.msrp);
  const currentMarketValue = toNumber(
    bestPrice.marketPrice ||
      bestPrice.price ||
      product.marketPrice ||
      product.marketValue ||
      product.marketValueNearMint ||
      product.midPrice ||
      product.marketValueRaw ||
      product.highPrice ||
      product.lowPrice ||
      msrp
  );
  const sourceType = bestPrice.marketStatus || product.marketStatus || product.sourceType || (product.marketSource ? String(product.marketSource).toLowerCase() : "estimated");
  const sourceName =
    bestPrice.externalSource ||
    product.marketSource ||
    (product.marketUrl ? "Manual market source link" : "") ||
    (product.marketPrice ? "Internal/manual catalog value" : "") ||
    (msrp ? "MSRP fallback" : "Manual fallback needed");
  const confidenceLevel = bestPrice.confidence?.label || product.marketConfidenceLevel || (product.marketPrice || product.marketValueNearMint
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
    lastUpdated: bestPrice.timestamp || product.marketLastUpdated || product.lastUpdated || product.updatedAt || product.createdAt || "Not checked yet",
    sourceName: sourceType === "live" ? `Live - ${sourceName}` : sourceType === "cached" ? `Cached - ${sourceName}` : sourceType === "manual" ? `Manual - ${sourceName}` : sourceType === "estimated" ? `Estimated - ${sourceName}` : sourceType === "user_submitted" ? `User-submitted - ${sourceName}` : sourceType === "admin_verified" ? `Admin verified - ${sourceName}` : sourceType === "unknown" ? `Unknown - ${sourceName}` : `Estimated - ${sourceName}`,
    marketStatus: sourceType,
    sourceUrl: bestPrice.sourceUrl || product.sourceUrl || product.externalSourceUrl || product.marketUrl || product.tcgplayerUrl || "",
    needsReview: bestPrice.confidence?.needsReview || sourceType === "unknown",
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

function openDealFinderModal(productId = "") {
  if (productId) selectTideTradrProduct(productId);
  const currentQuery = String(catalogSearch || "").trim();
  if (!productId && currentQuery) {
    setDealForm((current) => ({ ...current, title: current.title || currentQuery }));
  }
  setDealFinderOpen(true);
  setTideTradrSubTab((current) => current === "deal" ? "overview" : current);
}

function addProductToTideTradrWatchlist(productId, pinned = false) {
  const product = catalogProducts.find((p) => String(p.id) === String(productId));
  if (!product) return;
  setTideTradrWatchlist((current) => {
    if (current.some((item) => String(item.productId) === String(productId))) {
      return current.map((item) => String(item.productId) === String(productId) ? { ...item, pinned: item.pinned || pinned } : item);
    }
    const marketInfo = getTideTradrMarketInfo(product);
    return [
      {
        id: makeId("watch"),
        productId: product.id,
        name: product.name,
        setName: catalogExpansionName(product),
        productType: product.productType || "",
        marketValue: marketInfo.currentMarketValue,
        msrp: marketInfo.msrp,
        imageUrl: getCatalogImage(product),
        imageSource: product.imageSource || getDefaultImageSource(product),
        imageStatus: product.imageStatus || getDefaultImageStatus(product),
        imageNeedsReview: Boolean(product.imageNeedsReview),
        sourceName: marketInfo.sourceName,
        pinned,
        lastUpdated: new Date().toISOString(),
      },
      ...current,
    ];
  });
}

function removeTideTradrWatchlistItem(id) {
  setTideTradrWatchlist((current) => current.filter((item) => item.id !== id));
}

function openWatchlistProductDetails(item = {}) {
  const product = catalogProducts.find((candidate) => String(candidate.id) === String(item.productId));
  if (product) {
    openCatalogDetails(product);
    return;
  }
  openCatalogDetails({
    id: item.productId || item.id,
    name: item.name,
    setName: item.setName,
    productType: item.productType,
    marketPrice: item.marketValue,
    msrp: item.msrp,
    imageUrl: item.imageUrl,
    imageSource: item.imageSource,
    imageStatus: item.imageStatus,
    imageNeedsReview: item.imageNeedsReview,
    sourceName: item.sourceName,
    sourceType: "watchlist",
    lastPriceChecked: item.lastUpdated,
    marketLastUpdated: item.lastUpdated,
  });
}

function refreshMarketCatalog(type = "all") {
  const result = refreshCatalogMarketItems(catalogProducts, marketPriceCache, type);
  setCatalogProducts(result.catalog);
  setMarketPriceCache(result.cache);
  setTideTradrWatchlist((current) => refreshWatchlistMarketItems(current, result.catalog, result.cache));
  setMarketSyncMessage(
    `${type === "card" ? "Card" : type === "sealed" ? "Sealed product" : "Catalog"} market sync used cached/manual/estimated beta sources. ${result.cache.failedMatches?.length || 0} items need review.`
  );
}

function refreshMarketWatchlist() {
  setTideTradrWatchlist((current) => refreshWatchlistMarketItems(current, catalogProducts, marketPriceCache));
  setMarketSyncMessage("Watchlist market values refreshed from the best available cached/manual/estimated source.");
}

function refreshPinnedMarketWatch() {
  setTideTradrWatchlist((current) => refreshPinnedMarketItems(current, catalogProducts, marketPriceCache));
  setMarketSyncMessage("Pinned Market Watch refreshed from the best available cached/manual/estimated source.");
}

function saveManualMarketPrice(event) {
  event.preventDefault();
  const product = catalogProducts.find((item) => String(item.id) === String(manualMarketForm.catalogItemId));
  if (!product) {
    setMarketSyncMessage("Choose a catalog item before saving a manual market price.");
    return;
  }
  let nextCache = updateCachedMarketPrice(marketPriceCache, {
    catalogItemId: product.id,
    catalogType: product.catalogType || "sealed",
    externalSource: manualMarketForm.externalSource || "Manual",
    externalId: manualMarketForm.externalId,
    sourceUrl: manualMarketForm.sourceUrl,
    marketPrice: Number(manualMarketForm.marketPrice || 0),
    lowPrice: Number(manualMarketForm.lowPrice || 0),
    midPrice: Number(manualMarketForm.midPrice || manualMarketForm.marketPrice || 0),
    highPrice: Number(manualMarketForm.highPrice || 0),
    marketStatus: MARKET_STATUS.MANUAL,
    confidenceScore: 66,
  });
  const result = refreshCatalogMarketItems(catalogProducts, nextCache, product.catalogType === "card" ? "card" : "sealed");
  nextCache = { ...result.cache, failedMatches: nextCache.failedMatches || [] };
  setCatalogProducts(result.catalog);
  setMarketPriceCache(nextCache);
  setTideTradrWatchlist((current) => refreshWatchlistMarketItems(current, result.catalog, nextCache));
  setManualMarketForm({
    catalogItemId: "",
    marketPrice: "",
    lowPrice: "",
    midPrice: "",
    highPrice: "",
    externalSource: "Manual",
    externalId: "",
    sourceUrl: "",
  });
  setMarketSyncMessage(`Manual market price saved for ${product.name || product.productName || product.cardName}.`);
}

function applyCatalogProductToVault(productId, options = {}) {
  const product = typeof productId === "object"
    ? productId
    : catalogProducts.find((p) => String(p.id) === String(productId));
  if (!product) return;
  setShowVaultAddForm(false);
  openProductAddFlow({
    product,
    source: options.source || "catalog-vault",
    destinations: { vault: true },
    seed: {
      vault: { vaultStatus: product.catalogType === "sealed" ? "sealed" : "personal_collection" },
    },
  });
  if (!options.stayInContext) setActiveTab("vault");
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
  setDealFinderOpen(true);
  setTideTradrSubTab((current) => current === "deal" ? "overview" : current);
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

    if (!adminUser) {
      imported.forEach((product) => {
        submitUniversalSuggestion({
          suggestionType: SUGGESTION_TYPES.ADD_MISSING_CATALOG_PRODUCT,
          targetTable: "catalog_items",
          submittedData: product,
          notes: "Submitted from bulk catalog import preview.",
          source: "tidetradr-bulk-import",
        });
      });
      setBulkImportText("");
      setBulkImportPreview([]);
      alert(`Submitted ${imported.length} catalog product suggestion(s) for admin review.`);
      return;
    }

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

  const rows = bulkImportPreview.map((item) => {
    const cardSortMeta = getCardSortMeta({ cardNumber: item.cardNumber || item.card_number });
    return {
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
      card_number: item.cardNumber || item.card_number || null,
      card_number_prefix: cardSortMeta.prefix || null,
      card_number_suffix: cardSortMeta.suffix || null,
      card_number_sort: cardSortMeta.sort,
      printed_total: cardSortMeta.printedTotal,
      notes: item.notes || "",
      last_price_checked: item.marketPrice ? new Date().toISOString() : null,
    };
  });

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

function openDealFinderAddItem() {
  const quantity = Math.max(1, Number(dealForm.quantity || 1));
  const marketEach = Number(dealForm.marketTotal || 0) ? Number(dealForm.marketTotal || 0) / quantity : "";
  const msrpEach = Number(dealForm.retailTotal || 0) ? Number(dealForm.retailTotal || 0) / quantity : "";
  const seed = {
    itemName: selectedDealProduct ? catalogTitle(selectedDealProduct) : dealForm.title,
    marketPrice: marketEach,
    msrpPrice: msrpEach,
    notes: [dealForm.notes, dealRecommendation ? `Deal Finder: ${dealRecommendation}` : ""].filter(Boolean).join(" | "),
    vault: { quantity },
    forge: { quantity, plannedSellPrice: marketEach || "" },
  };
  if (selectedDealProduct) {
    openProductAddFlow({ product: selectedDealProduct, source: "deal-finder", seed });
  } else {
    openProductAddFlow({ source: "deal-finder-manual", seed });
  }
  setDealFinderOpen(false);
}

function renderDealFinderContent() {
  return (
    <section className="panel tidetradr-deal-panel">
      <div className="compact-card-header">
        <div>
          <h2>Deal Finder</h2>
          <p>Start with product, quantity, and asking price. Optional values stay tucked away.</p>
        </div>
        <span className="status-badge">{dealRecommendation}</span>
      </div>
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
        <Field label="Asking Price">
          <input type="number" step="0.01" value={dealForm.askingPrice} onChange={(e) => updateDealForm("askingPrice", e.target.value)} placeholder="Total lot price" />
        </Field>
        <details className="scout-score-guidelines">
          <summary>More Details</summary>
          <div className="form">
            <Field label="Condition / Status">
              <select value={dealForm.condition} onChange={(e) => updateDealForm("condition", e.target.value)}>
                <option>Sealed</option>
                <option>Damaged box</option>
                <option>Opened</option>
                <option>Mixed lot</option>
                <option>Unknown</option>
              </select>
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
          </div>
        </details>
        <button type="button" onClick={() => setVaultToast("Deal recommendation updated.")}>Calculate Deal</button>
      </form>
      {dealAskingPrice && dealMarketTotal ? (
        <>
          <div className="cards mini-cards deal-results-grid">
            <div className="card"><p>Recommendation</p><h2>{dealRecommendation}</h2></div>
            <div className="card"><p>Deal Rating</p><h2>{dealRating}</h2></div>
            <div className="card"><p>Percent of Market</p><h2>{dealPercentOfMarket.toFixed(1)}%</h2></div>
            <div className="card"><p>Percent of MSRP</p><h2>{dealPercentOfRetail.toFixed(1)}%</h2></div>
            <div className="card"><p>Potential Profit</p><h2>{money(dealPotentialProfit)}</h2></div>
            <div className="card"><p>ROI</p><h2>{dealRoi.toFixed(1)}%</h2></div>
          </div>
          <p className="compact-subtitle">{dealRecommendationReason}</p>
          <div className="quick-actions">
            <button type="button" onClick={openDealFinderAddItem}>Add item from this deal</button>
          </div>
        </>
      ) : (
        <div className="empty-state small-empty-state">
          <h3>Enter a product and asking price to see if it is a good deal.</h3>
        </div>
      )}
    </section>
  );
}

function renderTideTradrHeader() {
  return (
    <PageHeader
      className={getHeaderCardClass("panel tidetradr-summary-card")}
      title="TideTradr"
      subtitle="Search products, cards, prices, and catalog details."
      actions={(
        <>
          <button type="button" onClick={() => openQuickFindFlow({ source: "market" })}>Quick Find</button>
        </>
      )}
    >
      <form className="catalog-search-form" onSubmit={submitCatalogSearch}>
        <SmartCatalogSearchBox
          value={catalogSearch}
          onChange={updateCatalogSearchInput}
          onSearch={() => submitCatalogSearch()}
          onSelectSuggestion={selectCatalogRecommendation}
          supabase={supabase}
          isSupabaseConfigured={isSupabaseConfigured}
          mapRow={mapCatalog}
          productGroup={currentCatalogProductGroup()}
          dataFilter={catalogDataFilter}
          inputClassName="search-input"
          placeholder="Search by name, set, product type, card number, or scanned barcode..."
          closeSignal={catalogSuggestionCloseSignal}
          maxSuggestions={5}
          money={money}
        />
        <button type="submit">Search</button>
      </form>
      <QuickActionGrid
        className="tidetradr-shortcut-grid"
        ariaLabel="TideTradr quick actions"
        actions={[
          {
            key: "tidetradr-watchlist",
            title: "Watchlist",
            subtitle: `${tideTradrWatchlist.length} watched`,
            onClick: () => setTideTradrSubTab("watch"),
          },
          {
            key: "tidetradr-recent",
            title: "Recent Checks",
            subtitle: tideTradrLookupProduct ? catalogTitle(tideTradrLookupProduct) : "No recent check yet",
            onClick: () => setTideTradrSubTab("recent"),
          },
          {
            key: "tidetradr-deal",
            title: "Deal Finder",
            subtitle: "Check Deal",
            ariaLabel: "Check Deal",
            onClick: () => openDealFinderModal(),
          },
        ]}
      />
    </PageHeader>
  );
}

function renderScoutHeader() {
  const scoutStoreCount = scoutSnapshot.stores?.length || VIRGINIA_STORES_SEED.length;
  const scoutRecentReportCount = (scoutSnapshot.reports || []).length || (scoutSnapshot.tidepoolReports || []).length;
  const scoutActiveAlertCount = (scoutSnapshot.bestBuyAlerts || []).length;
  const scoutTrustScore = scoutSnapshot.scoutProfile?.trustScore || 72;
  return (
    <PageHeader
      className={getHeaderCardClass("panel scout-summary-card")}
      title="Scout"
      subtitle="Store reports, restock patterns, and local tracking."
      actions={(
        <>
        <button type="button" className="scout-submit-primary" onClick={() => {
          openScoutSubmitFlow();
        }}>
          Submit Report
        </button>
          <button type="button" className="secondary-button" onClick={() => openQuickAddAction("storeSuggestion")}>Add Store Suggestion</button>
        </>
      )}
    >
      <QuickActionGrid
        className="scout-main-actions"
        ariaLabel="Scout quick actions"
        actions={[
          {
            key: "scout-stores",
            title: "Stores",
            subtitle: `${scoutStoreCount} nearby entries`,
            onClick: () => {
              if (!requestScoutLocation()) return;
              setScoutSubTabTarget({ tab: "stores", id: Date.now() });
              setScoutView("stores");
            },
          },
          {
            key: "scout-reports",
            title: "Reports",
            subtitle: `${scoutRecentReportCount} recent`,
            onClick: () => {
              setScoutReportFilter("Latest");
              setScoutView("reports");
            },
          },
          {
            key: "scout-alerts",
            title: "Alerts",
            subtitle: `${scoutActiveAlertCount} active`,
            onClick: () => {
              setScoutSubTabTarget({ tab: "alerts", id: Date.now() });
              setScoutView("alerts");
            },
          },
          {
            key: "scout-score",
            title: "Scout Score",
            subtitle: `${scoutTrustScore} trust score`,
            onClick: () => setScoutScoreModalOpen(true),
          },
        ]}
      />
    </PageHeader>
  );
}

function renderVaultHeader() {
  const personalCount = vaultItems.filter((item) => normalizeVaultStatus(item) === "personal_collection").length;
  const sealedHoldingCount = vaultItems.filter((item) => ["sealed", "held"].includes(normalizeVaultStatus(item))).length;
  const wishlistHeldCount = vaultItems.filter((item) => ["wishlist", "held"].includes(normalizeVaultStatus(item))).length;
  const movedToForgeCount = vaultItems.filter((item) => normalizeVaultStatus(item) === "moved_to_forge").length;

  const openVaultItems = (filter = "all") => {
    setVaultFilter(filter);
    setActiveTab("vault");
    setTimeout(() => document.getElementById("vault-items-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const vaultOverviewCards = [
    {
      key: "total-items",
      title: "Total Items",
      value: activeVaultItems.length,
      helper: "Cards, sealed, and held items.",
      active: vaultFilter === "all",
      onClick: () => openVaultItems("all"),
    },
    {
      key: "total-market",
      title: "Total Market",
      value: money(vaultValue),
      helper: "Current tracked collection value.",
      active: false,
      onClick: () => openVaultItems("all"),
    },
    {
      key: "personal",
      title: "Personal Collection",
      value: personalCount,
      helper: "Items you plan to keep.",
      active: vaultFilter === "personal_collection",
      onClick: () => openVaultItems("personal_collection"),
    },
    {
      key: "sealed",
      title: "Sealed / Holding",
      value: sealedHoldingCount,
      helper: "Sealed items or long-term holds.",
      active: vaultFilter === "sealed",
      onClick: () => openVaultItems("sealed"),
    },
    {
      key: "wishlist",
      title: "Wishlist / Held",
      value: wishlistHeldCount,
      helper: "Saved wants and future buys.",
      active: vaultFilter === "wishlist",
      onClick: () => openVaultItems("wishlist"),
    },
  ];

  if (movedToForgeCount > 0) {
    vaultOverviewCards.push({
      key: "moved",
      title: "Moved to Forge",
      value: movedToForgeCount,
      helper: "Items moved into business inventory.",
      active: vaultFilter === "moved_to_forge",
      onClick: () => openVaultItems("moved_to_forge"),
    });
  }

  return (
    <PageHeader
      className={getHeaderCardClass("panel vault-command-center")}
      title="Vault"
      subtitle="Track your collection, wishlist, and stored items."
      actions={(
        <>
        <button type="button" className="vault-command-quick-add" onClick={openVaultQuickAddFlow}>
          Quick Add
        </button>
        </>
      )}
      summaryLabel="Collection Overview"
      summary={(
        <div className="vault-command-overview" aria-label="Vault Collection Overview">
        {vaultOverviewCards.map((card) => (
          <button
            key={card.key}
            type="button"
            className={`vault-overview-card${card.active ? " is-active" : ""}`}
            onClick={card.onClick}
          >
            <span className="vault-overview-title">{card.title}</span>
            <strong>{card.value}</strong>
            <span>{card.helper}</span>
          </button>
        ))}
      </div>
      )}
    />
  );
}

function renderForgeHeader() {
  const activeMarketplaceCount = marketplaceListings.filter((listing) => listing.status === "Active").length;
  const forgeReportRecordCount = sales.length + expenses.length + mileageTrips.length;
  const forgeOverviewCards = [
    {
      key: "inventory",
      title: "Inventory",
      value: money(totalMarketValue),
      helper: "Inventory, imports, and sellable items.",
      active: activeTab === "inventory" && forgeSubTab !== "marketplace",
      onClick: () => {
        setForgeSubTab("overview");
        setActiveTab("inventory");
        setTimeout(() => document.getElementById("forge-inventory-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
      },
    },
    {
      key: "sales",
      title: "Sales",
      value: money(totalSalesRevenue),
      secondary: `${totalItemsSold} item${totalItemsSold === 1 ? "" : "s"} sold`,
      helper: "Revenue, sold items, and sale records.",
      active: activeTab === "sales",
      onClick: () => {
        setForgeSubTab("overview");
        setActiveTab("sales");
      },
    },
    {
      key: "expenses",
      title: "Expenses",
      value: money(totalExpenses),
      helper: "Receipts, fees, supplies, shipping, and events.",
      active: activeTab === "expenses",
      onClick: () => {
        setForgeSubTab("overview");
        setActiveTab("expenses");
      },
    },
    {
      key: "mileage",
      title: "Mileage",
      value: `${totalBusinessMiles.toFixed(1)} mi`,
      helper: "Business trips and vehicle costs.",
      active: activeTab === "mileage",
      onClick: () => {
        setForgeSubTab("overview");
        setActiveTab("mileage");
      },
    },
    {
      key: "marketplace",
      title: "Marketplace",
      value: `${activeMarketplaceCount} listing${activeMarketplaceCount === 1 ? "" : "s"}`,
      helper: "Listings, drafts, saved items, and review.",
      active: activeTab === "inventory" && forgeSubTab === "marketplace",
      onClick: () => {
        setMarketplaceView("browse");
        setForgeSubTab("marketplace");
        setActiveTab("inventory");
      },
    },
    {
      key: "reports",
      title: "Reports",
      value: forgeReportRecordCount ? `${forgeReportRecordCount} record${forgeReportRecordCount === 1 ? "" : "s"}` : "Create report",
      secondary: forgeReportRecordCount ? "Export-ready summaries" : "No saved reports yet",
      helper: "Profit/loss, monthly spending, and exports.",
      active: activeTab === "reports",
      onClick: () => {
        setForgeSubTab("overview");
        setActiveTab("reports");
      },
    },
  ];
  return (
    <PageHeader
      className={getHeaderCardClass("panel forge-hero-panel forge-command-center")}
      title="Forge"
      subtitle="Inventory, sales, expenses, mileage, and reports."
      actions={(
        <>
        <button type="button" className="forge-command-quick-add" onClick={openForgeQuickAddFlow}>
          Quick Add
        </button>
        </>
      )}
      summaryLabel="Business Overview"
      summary={(
        <div className="forge-command-overview" aria-label="Forge Business Overview">
        {forgeOverviewCards.map((card) => (
          <button
            key={card.key}
            type="button"
            className={`forge-overview-card${card.active ? " is-active" : ""}`}
            onClick={card.onClick}
          >
            <span className="forge-overview-title">{card.title}</span>
            <strong>{card.value}</strong>
            {card.secondary ? <small>{card.secondary}</small> : null}
            <span>{card.helper}</span>
          </button>
        ))}
      </div>
      )}
    />
  );
}

  async function addExpense(event) {
    event.preventDefault();
    if (!user) return alert("Please log in first.");
    if (!expenseForm.vendor || !expenseForm.amount) return alert("Please enter vendor and amount.");

    if (BETA_LOCAL_MODE || user.id === "local-beta") {
      const localId = editingExpenseId || makeId("expense");
      const localExpense = {
        ...blankExpense,
        ...expenseForm,
        id: localId,
        expenseId: localId,
        amount: Number(expenseForm.amount),
        receiptPhoto: expenseForm.receiptImage,
        createdAt: expenses.find((expense) => expense.id === editingExpenseId)?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setExpenses(editingExpenseId ? expenses.map((expense) => (expense.id === editingExpenseId ? localExpense : expense)) : [localExpense, ...expenses]);
      setEditingExpenseId(null);
      setExpenseForm(blankExpense);
      if (activeFlowModal?.type === "addExpense") closeFlowModal({ force: true, reset: false });
      return;
    }

    const row = {
      user_id: user.id,
      date: expenseForm.date || null,
      vendor: expenseForm.vendor,
      category: expenseForm.category,
      subcategory: expenseForm.subcategory,
      buyer: expenseForm.buyer,
      amount: Number(expenseForm.amount),
      payment_method: expenseForm.paymentMethod,
      linked_item_id: expenseForm.linkedItemId || null,
      linked_sale_id: expenseForm.linkedSaleId || null,
      notes: expenseForm.notes,
      receipt_image: expenseForm.receiptImage,
      receipt_photo: expenseForm.receiptImage,
      tax_deductible: !!expenseForm.taxDeductible,
      campaign_name: expenseForm.campaignName,
      platform: expenseForm.platform,
      goal: expenseForm.goal,
      start_date: expenseForm.startDate || null,
      end_date: expenseForm.endDate || null,
      linked_sales: expenseForm.linkedSales,
      results_notes: expenseForm.resultsNotes,
    };

    const { data, error } = editingExpenseId
      ? await supabase.from("business_expenses").update({ ...row, updated_at: new Date().toISOString() }).eq("id", editingExpenseId).select().single()
      : await supabase.from("business_expenses").insert(row).select().single();

    if (error) return alert("Could not save expense: " + error.message);

    const mapped = mapExpense(data);
    setExpenses(editingExpenseId ? expenses.map((e) => (e.id === editingExpenseId ? mapped : e)) : [mapped, ...expenses]);
    setEditingExpenseId(null);
    setExpenseForm(blankExpense);
    if (activeFlowModal?.type === "addExpense") closeFlowModal({ force: true, reset: false });
  }

  function startEditingExpense(expense) {
    setEditingExpenseId(expense.id);
    setExpenseForm({ ...blankExpense, ...expense });
    openFlowModal("addExpense", { size: "medium", source: "edit" });
  }

  async function deleteExpense(id) {
    if (BETA_LOCAL_MODE || user?.id === "local-beta") {
      setExpenses(expenses.filter((expense) => expense.id !== id));
      if (editingExpenseId === id) {
        setEditingExpenseId(null);
        setExpenseForm(blankExpense);
      }
      return;
    }
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

    if (BETA_LOCAL_MODE || user.id === "local-beta") {
      const localRow = {
        ...row,
        id: editingTripId || makeId("trip"),
        created_at: mileageTrips.find((trip) => trip.id === editingTripId)?.createdAt || new Date().toISOString(),
      };
      const mapped = mapTrip(localRow);
      setMileageTrips(editingTripId ? mileageTrips.map((trip) => (trip.id === editingTripId ? mapped : trip)) : [mapped, ...mileageTrips]);
      setEditingTripId(null);
      setTripForm(blankTrip);
      if (activeFlowModal?.type === "addMileage") closeFlowModal({ force: true, reset: false });
      return;
    }

    const { data, error } = editingTripId
      ? await supabase.from("mileage_trips").update({ ...row, updated_at: new Date().toISOString() }).eq("id", editingTripId).select().single()
      : await supabase.from("mileage_trips").insert(row).select().single();

    if (error) return alert("Could not save mileage trip: " + error.message);

    const mapped = mapTrip(data);
    setMileageTrips(editingTripId ? mileageTrips.map((t) => (t.id === editingTripId ? mapped : t)) : [mapped, ...mileageTrips]);
    setEditingTripId(null);
    setTripForm(blankTrip);
    if (activeFlowModal?.type === "addMileage") closeFlowModal({ force: true, reset: false });
  }

  function startEditingTrip(trip) {
    setEditingTripId(trip.id);
    setTripForm({ purpose: trip.purpose, driver: trip.driver, vehicleId: trip.vehicleId || "", startMiles: trip.startMiles, endMiles: trip.endMiles, gasPrice: trip.gasPrice, notes: trip.notes, gasReceiptImage: trip.gasReceiptImage });
    openFlowModal("addMileage", { size: "medium", source: "edit" });
  }

  async function deleteTrip(id) {
    if (BETA_LOCAL_MODE || user?.id === "local-beta") {
      setMileageTrips(mileageTrips.filter((trip) => trip.id !== id));
      if (editingTripId === id) {
        setEditingTripId(null);
        setTripForm(blankTrip);
      }
      return;
    }
    const { error } = await supabase.from("mileage_trips").delete().eq("id", id);
    if (error) return alert("Could not delete trip: " + error.message);
    setMileageTrips(mileageTrips.filter((trip) => trip.id !== id));
  }

  async function addSale(event) {
    event.preventDefault();
    if (!user) return alert("Please log in first.");
    if (!saleForm.itemId || !saleForm.quantitySold || !saleForm.finalSalePrice) return alert("Please choose item, quantity, and price.");

    const item = forgeInventoryItems.find((i) => String(i.id) === String(saleForm.itemId));
    if (!item) return alert("Item not found.");

    const qty = Number(saleForm.quantitySold);
    if (qty > item.quantity) return alert("You cannot sell more than you have.");

    const price = Number(saleForm.finalSalePrice);
    const shippingCharged = Number(saleForm.shippingCharged || 0);
    const shipping = Number(saleForm.shippingCost || 0);
    const fees = Number(saleForm.platformFees || 0);
    const itemCost = item.unitCost * qty;
    const grossSale = price * qty + shippingCharged;
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
      notes: [saleForm.notes, shippingCharged ? `Shipping charged: ${money(shippingCharged)}` : ""].filter(Boolean).join(" | "),
    };

    if (BETA_LOCAL_MODE || user.id === "local-beta") {
      const localRow = {
        ...row,
        id: editingSaleId || makeId("sale"),
        created_at: sales.find((sale) => sale.id === editingSaleId)?.createdAt || new Date().toISOString(),
      };
      const mapped = mapSale(localRow);
      setSales(editingSaleId ? sales.map((sale) => (sale.id === editingSaleId ? mapped : sale)) : [mapped, ...sales]);
      if (!editingSaleId) {
        setItems(items.map((currentItem) => (
          currentItem.id === item.id
            ? { ...currentItem, quantity: remaining, status: remaining === 0 ? "Sold" : currentItem.status, updatedAt: new Date().toISOString() }
            : currentItem
        )));
      }
      setEditingSaleId(null);
      setSaleForm(blankSale);
      if (activeFlowModal?.type === "addSale") {
        closeFlowModal({ force: true, reset: false });
      } else {
        setActiveTab("sales");
      }
      return;
    }

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
    setSaleForm(blankSale);
    if (activeFlowModal?.type === "addSale") {
      closeFlowModal({ force: true, reset: false });
    } else {
      setActiveTab("sales");
    }
  }

  function startEditingSale(sale) {
    setEditingSaleId(sale.id);
    setSaleForm({ itemId: sale.itemId, platform: sale.platform, quantitySold: sale.quantitySold, finalSalePrice: sale.finalSalePrice, shippingCharged: "", shippingCost: sale.shippingCost, platformFees: sale.platformFees, notes: sale.notes });
    openFlowModal("addSale", { size: "medium", source: "edit" });
  }

  async function deleteSale(id) {
    if (BETA_LOCAL_MODE || user?.id === "local-beta") {
      setSales(sales.filter((sale) => sale.id !== id));
      if (editingSaleId === id) {
        setEditingSaleId(null);
        setSaleForm(blankSale);
      }
      return;
    }
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
    const backup = createBetaBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ember-tide-beta-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setBackupImportMessage("Backup exported. Keep this file somewhere safe before clearing browser data or switching phones.");
  }

  function createBetaBackup() {
    let savedScout = {};
    try {
      savedScout = JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}");
    } catch {
      savedScout = {};
    }

    return {
      appName: "E&T TCG",
      fullBrand: "Ember & Tide TCG",
      backupType: "local-beta",
      backupVersion: 2,
      createdAt: new Date().toISOString(),
      data: {
        items,
        purchasers,
        catalogProducts,
        expenses,
        sales,
        vehicles,
        mileageTrips,
        scout: {
          stores: savedScout.stores || scoutSnapshot.stores || [],
          reports: savedScout.reports || scoutSnapshot.reports || [],
          items: savedScout.items || scoutSnapshot.items || [],
          routes: savedScout.routes || scoutSnapshot.routes || [],
          bestBuyStockResults: savedScout.bestBuyStockResults || scoutSnapshot.bestBuyStockResults || [],
          bestBuyNightlyReports: savedScout.bestBuyNightlyReports || scoutSnapshot.bestBuyNightlyReports || [],
        },
        suggestions: loadSuggestions(),
        tidepoolCommunity: {
          posts: tidepoolPosts,
          comments: tidepoolComments,
          reactions: tidepoolReactions,
        },
        tideTradrWatchlist,
        marketplaceListings,
        marketplaceReports,
        marketplaceSavedIds,
        pinnedMarketItems: tideTradrWatchlist.filter((item) => item.pinned),
        tideTradrLookupId,
        marketPriceCache,
        settings: {
          userType,
          homeStatsEnabled,
          dashboardPreset,
          dashboardLayout,
          dashboardCardStyle,
          locationSettings,
          userSearchAliases,
          dealForm,
        },
      },
      localStorageKeys: {
        app: LOCAL_STORAGE_KEY,
        scout: SCOUT_STORAGE_KEY,
        tidepool: TIDEPOOL_STORAGE_KEY,
        market: MARKET_PRICE_CACHE_KEY,
        suggestions: SUGGESTION_STORAGE_KEY,
      },
    };
  }

  function countBackupItems(value) {
    return Array.isArray(value) ? value.length : 0;
  }

  function normalizeBackupPayload(payload) {
    const data = payload?.data || payload || {};
    const settings = data.settings || payload?.settings || {};
    return {
      items: Array.isArray(data.items) ? data.items : [],
      purchasers: Array.isArray(data.purchasers) ? data.purchasers : [],
      catalogProducts: Array.isArray(data.catalogProducts) ? data.catalogProducts : [],
      expenses: Array.isArray(data.expenses) ? data.expenses : [],
      sales: Array.isArray(data.sales) ? data.sales : [],
      vehicles: Array.isArray(data.vehicles) ? data.vehicles : [],
      mileageTrips: Array.isArray(data.mileageTrips) ? data.mileageTrips : [],
      scout: data.scout || {
        stores: data.scoutStores || [],
        reports: data.scoutReports || [],
        items: data.scoutItems || [],
        routes: data.routes || [],
      },
      tidepoolCommunity: data.tidepoolCommunity || {
        posts: data.tidepoolPosts || data.tidepoolReports || [],
        comments: data.tidepoolComments || [],
        reactions: data.tidepoolReactions || [],
      },
      suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
      tideTradrWatchlist: Array.isArray(data.tideTradrWatchlist) ? data.tideTradrWatchlist : [],
      marketplaceListings: Array.isArray(data.marketplaceListings) ? data.marketplaceListings : [],
      marketplaceReports: Array.isArray(data.marketplaceReports) ? data.marketplaceReports : [],
      marketplaceSavedIds: Array.isArray(data.marketplaceSavedIds) ? data.marketplaceSavedIds : [],
      marketPriceCache: data.marketPriceCache || {},
      settings,
    };
  }

  function summarizeBackup(payload) {
    const data = normalizeBackupPayload(payload);
    return [
      { label: "Forge inventory", value: countBackupItems(data.items) },
      { label: "Sales", value: countBackupItems(data.sales) },
      { label: "Expenses", value: countBackupItems(data.expenses) },
      { label: "Catalog items", value: countBackupItems(data.catalogProducts) },
      { label: "Scout stores", value: countBackupItems(data.scout.stores) },
      { label: "Scout reports", value: countBackupItems(data.scout.reports) },
      { label: "Shared data suggestions", value: countBackupItems(data.suggestions) },
      { label: "Tidepool posts", value: countBackupItems(data.tidepoolCommunity.posts) },
      { label: "TideTradr watchlist", value: countBackupItems(data.tideTradrWatchlist) },
      { label: "Marketplace listings", value: countBackupItems(data.marketplaceListings) },
      { label: "Search aliases", value: countBackupItems(data.settings.userSearchAliases) },
    ];
  }

  function handleBackupFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || "{}"));
        const data = normalizeBackupPayload(payload);
        if (!payload || typeof payload !== "object" || (!payload.data && !Array.isArray(data.items))) {
          throw new Error("This does not look like an E&T TCG beta backup.");
        }
        setBackupImportPreview({
          fileName: file.name,
          payload,
          summary: summarizeBackup(payload),
        });
        setBackupImportMessage("Backup loaded for review. Choose merge or replace when you are ready.");
      } catch (error) {
        setBackupImportPreview(null);
        setBackupImportMessage(`Backup import failed: ${error instanceof Error ? error.message : "Invalid JSON file."}`);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function mergeById(currentItems, incomingItems) {
    const map = new Map();
    [...currentItems, ...incomingItems].forEach((item, index) => {
      const key = item?.id || item?.postId || item?.commentId || item?.reactionId || item?.reportId || item?.eventId
        ? String(item.id || item.postId || item.commentId || item.reactionId || item.reportId || item.eventId)
        : `row-${index}-${JSON.stringify(item)}`;
      map.set(key, item);
    });
    return Array.from(map.values());
  }

  function applyBetaBackupImport(mode) {
    if (!backupImportPreview) return;
    const confirmed = window.confirm(
      mode === "replace"
        ? "Replace current private beta data with this backup? This overwrites data on this device."
        : "Merge this backup into current private beta data?"
    );
    if (!confirmed) return;

    const data = normalizeBackupPayload(backupImportPreview.payload);
    const scoutImport = data.scout || {};

    const nextItems = mode === "replace" ? data.items : mergeById(items, data.items);
    const nextPurchasers = mode === "replace" ? data.purchasers : mergeById(purchasers, data.purchasers);
    const nextCatalog = mode === "replace" ? data.catalogProducts : mergeById(catalogProducts, data.catalogProducts);
    const nextExpenses = mode === "replace" ? data.expenses : mergeById(expenses, data.expenses);
    const nextSales = mode === "replace" ? data.sales : mergeById(sales, data.sales);
    const nextVehicles = mode === "replace" ? data.vehicles : mergeById(vehicles, data.vehicles);
    const nextTrips = mode === "replace" ? data.mileageTrips : mergeById(mileageTrips, data.mileageTrips);
    const nextWatchlist = mode === "replace"
      ? data.tideTradrWatchlist
      : mergeById(tideTradrWatchlist, data.tideTradrWatchlist);
    const nextMarketplaceListings = mode === "replace"
      ? data.marketplaceListings || []
      : mergeById(marketplaceListings, data.marketplaceListings || []);
    const nextMarketplaceReports = mode === "replace"
      ? data.marketplaceReports || []
      : mergeById(marketplaceReports, data.marketplaceReports || []);
    const nextMarketplaceSavedIds = mode === "replace"
      ? data.marketplaceSavedIds || []
      : [...new Set([...marketplaceSavedIds, ...(data.marketplaceSavedIds || [])])];
    const nextScout = mode === "replace"
      ? {
          stores: scoutImport.stores || [],
          reports: scoutImport.reports || [],
          items: scoutImport.items || [],
          routes: scoutImport.routes || [],
          bestBuyStockResults: scoutImport.bestBuyStockResults || [],
          bestBuyNightlyReports: scoutImport.bestBuyNightlyReports || [],
        }
      : {
          stores: mergeById(scoutSnapshot.stores || [], scoutImport.stores || []),
          reports: mergeById(scoutSnapshot.reports || [], scoutImport.reports || []),
          items: mergeById(scoutSnapshot.items || [], scoutImport.items || []),
          routes: mergeById(scoutSnapshot.routes || [], scoutImport.routes || []),
          bestBuyStockResults: mergeById(scoutSnapshot.bestBuyStockResults || [], scoutImport.bestBuyStockResults || []),
          bestBuyNightlyReports: mergeById(scoutSnapshot.bestBuyNightlyReports || [], scoutImport.bestBuyNightlyReports || []),
        };
    const tidepoolImport = data.tidepoolCommunity || {};
    const nextTidepool = mode === "replace"
      ? {
          posts: tidepoolImport.posts || [],
          comments: tidepoolImport.comments || [],
          reactions: tidepoolImport.reactions || [],
        }
      : {
          posts: mergeById(tidepoolPosts, tidepoolImport.posts || []),
          comments: mergeById(tidepoolComments, tidepoolImport.comments || []),
          reactions: mergeById(tidepoolReactions, tidepoolImport.reactions || []),
        };
    const nextSuggestions = mode === "replace"
      ? data.suggestions || []
      : mergeById(suggestions, data.suggestions || []);

    setItems(nextItems.map(mapItem));
    setPurchasers(nextPurchasers.length ? nextPurchasers : createDefaultPurchasers());
    setCatalogProducts(nextCatalog.length ? mergeSharedCatalogProducts(nextCatalog) : createSharedCatalogProducts());
    setExpenses(nextExpenses.map(mapExpense));
    setSales(nextSales);
    setVehicles(nextVehicles);
    setMileageTrips(nextTrips);
    setTideTradrWatchlist(nextWatchlist);
    setMarketplaceListings(nextMarketplaceListings);
    setMarketplaceReports(nextMarketplaceReports);
    setMarketplaceSavedIds(nextMarketplaceSavedIds);
    setMarketPriceCache({ ...loadPriceCache(), ...(data.marketPriceCache || {}) });
    setSuggestions(nextSuggestions);
    saveSuggestions(nextSuggestions);
    setScoutSnapshot(nextScout);
    localStorage.setItem(SCOUT_STORAGE_KEY, JSON.stringify(nextScout));
    saveTidepoolCommunity(nextTidepool);

    if (data.settings) {
      if (data.settings.userType) setUserType(normalizeUserType(data.settings.userType));
      if (data.settings.homeStatsEnabled) setHomeStatsEnabled(normalizeHomeStatsEnabled(data.settings.homeStatsEnabled, data.settings.userType || userType));
      if (data.settings.dashboardPreset) setDashboardPreset(normalizeDashboardPreset(data.settings.dashboardPreset));
      if (data.settings.dashboardLayout) setDashboardLayout(normalizeDashboardLayout(data.settings.dashboardLayout, data.settings.dashboardPreset || dashboardPreset));
      if (data.settings.dashboardCardStyle) setDashboardCardStyle(normalizeDashboardCardStyle(data.settings.dashboardCardStyle));
      if (data.settings.locationSettings) setLocationSettings((current) => ({ ...current, ...data.settings.locationSettings }));
      if (Array.isArray(data.settings.userSearchAliases)) setUserSearchAliases(data.settings.userSearchAliases);
      if (data.settings.dealForm) setDealForm((current) => ({ ...current, ...data.settings.dealForm }));
    }

    setBackupImportMessage(`${mode === "replace" ? "Replaced" : "Merged"} beta backup successfully on this device.`);
    setBackupImportPreview(null);
  }

  function storageSizeForKey(key) {
    return new Blob([localStorage.getItem(key) || ""]).size;
  }

  const forgeInventoryItems = items.filter(isForgeInventoryItem);

  const storageStatus = [
    { label: "Mode", value: BETA_LOCAL_MODE ? "Private beta mode" : "Cloud sync mode" },
    { label: "Cloud sync", value: cloudSyncPreference === "cloud" ? "Requested" : "Off" },
    { label: "Forge inventory", value: forgeInventoryItems.length },
    { label: "Vault items", value: items.filter(isVaultItemRecord).length },
    { label: "Scout stores", value: scoutSnapshot.stores?.length || 0 },
    { label: "Scout reports", value: scoutSnapshot.reports?.length || 0 },
    { label: "Shared suggestions", value: suggestions.length },
    { label: "TideTradr watchlist", value: tideTradrWatchlist.length },
    { label: "Marketplace listings", value: marketplaceListings.length },
    { label: "App storage", value: `${Math.ceil(storageSizeForKey(LOCAL_STORAGE_KEY) / 1024)} KB` },
    { label: "Scout storage", value: `${Math.ceil(storageSizeForKey(SCOUT_STORAGE_KEY) / 1024)} KB` },
    { label: "Suggestion storage", value: `${Math.ceil(storageSizeForKey(SUGGESTION_STORAGE_KEY) / 1024)} KB` },
  ];

    const totalSpent = forgeInventoryItems.reduce(
      (s, i) => s + Number(i.quantity || 0) * Number(i.unitCost || 0),
      0
    );

    const totalMsrpValue = forgeInventoryItems.reduce(
      (s, i) => s + Number(i.quantity || 0) * Number(i.msrpPrice || 0),
      0
    );

    const totalPotentialSales = forgeInventoryItems.reduce(
      (s, i) => s + Number(i.quantity || 0) * Number(i.salePrice || 0),
      0
    );

    const totalMarketValue = forgeInventoryItems.reduce(
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
  const totalMarketingSpend = expenses
    .filter((expense) => expense.category === "Marketing")
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const totalEventsGiveawaysSpend = expenses
    .filter((expense) => expense.category === "Events/Giveaways")
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const estimatedProfitAfterMarketing = estimatedProfit - totalMarketingSpend;
  const estimatedProfitAfterExpenses = estimatedProfit - totalExpenses;
  const totalSalesRevenue = sales.reduce((s, sale) => s + sale.grossSale, 0);
  const totalSalesProfit = sales.reduce((s, sale) => s + sale.netProfit, 0);
  const totalItemsSold = sales.reduce((s, sale) => s + sale.quantitySold, 0);
  const activeForgeItems = forgeInventoryItems;
  const selectedSaleItem = forgeInventoryItems.find((item) => String(item.id) === String(saleForm.itemId));
  const saleQuantity = Number(saleForm.quantitySold || 0);
  const salePriceEach = Number(saleForm.finalSalePrice || 0);
  const saleShippingCharged = Number(saleForm.shippingCharged || 0);
  const saleShippingCost = Number(saleForm.shippingCost || 0);
  const saleFees = Number(saleForm.platformFees || 0);
  const saleCostBasis = selectedSaleItem ? Number(selectedSaleItem.unitCost || 0) * saleQuantity : 0;
  const saleGrossPreview = salePriceEach * saleQuantity + saleShippingCharged;
  const saleProfitPreview = saleGrossPreview - saleCostBasis - saleShippingCost - saleFees;
  const totalBusinessMiles = mileageTrips.reduce((s, t) => s + t.businessMiles, 0);
  const totalFuelCost = mileageTrips.reduce((s, t) => s + t.fuelCost, 0);
  const totalWearCost = mileageTrips.reduce((s, t) => s + t.wearCost, 0);
  const totalVehicleCost = mileageTrips.reduce((s, t) => s + t.totalVehicleCost, 0);
  const totalMileageValue = mileageTrips.reduce((s, t) => s + t.mileageValue, 0);

  const inventorySpendingFor = (person, list = forgeInventoryItems) =>
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
      ...forgeInventoryItems.map(itemPurchaserName),
      "Unassigned",
    ]),
  ].filter(Boolean);

  const salesByPlatform = sales.reduce((a, s) => ({ ...a, [s.platform]: (a[s.platform] || 0) + s.grossSale }), {});
  const expensesByCategory = expenses.reduce((a, e) => ({ ...a, [e.category]: (a[e.category] || 0) + e.amount }), {});
  const inventoryByCategory = forgeInventoryItems.reduce((a, i) => ({ ...a, [i.category || "Uncategorized"]: (a[i.category || "Uncategorized"] || 0) + i.quantity }), {});
  const inventoryByStatus = forgeInventoryItems.reduce((a, i) => ({ ...a, [i.status || "In Stock"]: (a[i.status || "In Stock"] || 0) + i.quantity }), {});

  const lowStockItems = forgeInventoryItems.filter((i) => i.quantity <= 1);
  const needsPhotosItems = forgeInventoryItems.filter((i) => i.status === "Needs Photos" || !i.itemImage);
  const needsMarketCheckItems = forgeInventoryItems.filter((i) => i.status === "Needs Market Check" || Number(i.marketPrice) <= 0);
  const missingMsrpItems = forgeInventoryItems.filter((i) => Number(i.msrpPrice || 0) <= 0);

  const missingMarketPriceItems = forgeInventoryItems.filter(
    (i) => Number(i.marketPrice || 0) <= 0
  );

  const missingProductTypeItems = forgeInventoryItems.filter(
    (i) => !i.productType || String(i.productType).trim() === ""
  );

  const missingBarcodeItems = forgeInventoryItems.filter(
    (i) => !i.barcode || String(i.barcode).trim() === ""
  );

  const missingSalePriceItems = forgeInventoryItems.filter(
    (i) => Number(i.salePrice || 0) <= 0
  );
  const readyToListItems = forgeInventoryItems.filter((i) => i.status === "Ready to List");
  const listedItems = forgeInventoryItems.filter((i) => i.status === "Listed");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const isThisMonth = (value) => {
    if (!value) return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date >= monthStart;
  };
  const monthlyItemSpending = forgeInventoryItems
    .filter((item) => isThisMonth(item.createdAt))
    .reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0), 0);
  const monthlyItems = forgeInventoryItems.filter((item) => isThisMonth(item.createdAt));
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
    .filter((expense) => isThisMonth(expense.date || expense.createdAt))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const monthlyMarketingSpend = expenses
    .filter((expense) => expense.category === "Marketing" && isThisMonth(expense.date || expense.createdAt))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const monthlySalesProfit = sales
    .filter((sale) => isThisMonth(sale.createdAt))
    .reduce((sum, sale) => sum + Number(sale.netProfit || 0), 0);
  const monthlySpending = monthlyItemSpending + monthlyExpenses;
  const monthlyProfitLoss = monthlySalesProfit - monthlyExpenses;
  const vaultItems = useMemo(() => items.filter(isVaultItemRecord), [items]);
  const activeVaultItems = useMemo(() => vaultItems.filter(isActiveVaultItem), [vaultItems]);
  const vaultCatalogSearchTerm = String(vaultForm.tideTradrSearch || vaultForm.name || "").trim().toLowerCase();
  const vaultSuggestedCatalogItems = useMemo(() => catalogProducts
    .filter((product) => {
      if (!vaultCatalogSearchTerm) return true;
      return [
        product.name,
        product.productName,
        product.cardName,
        product.setName,
        product.expansion,
        product.productType,
        product.barcode,
        product.upc,
        product.sku,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(vaultCatalogSearchTerm));
    })
    .slice(0, 4), [catalogProducts, vaultCatalogSearchTerm]);
  const visibleVaultItems = useMemo(() => searchVaultItems(filterVaultItems(vaultItems, vaultFilter), vaultSearch)
    .sort((a, b) => {
      const aMarket = Number(a.marketPrice || 0) * Number(a.quantity || 0);
      const bMarket = Number(b.marketPrice || 0) * Number(b.quantity || 0);
      const aCost = Number(a.unitCost || 0) * Number(a.quantity || 0);
      const bCost = Number(b.unitCost || 0) * Number(b.quantity || 0);
      const aRoi = aCost > 0 ? (aMarket - aCost) / aCost : -Infinity;
      const bRoi = bCost > 0 ? (bMarket - bCost) / bCost : -Infinity;
      if (vaultSort === "oldest") return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      if (vaultSort === "name") return String(a.name || "").localeCompare(String(b.name || ""));
      if (vaultSort === "highestMarket") return bMarket - aMarket;
      if (vaultSort === "lowestMarket") return aMarket - bMarket;
      if (vaultSort === "highestRoi") return bRoi - aRoi;
      if (vaultSort === "quantity") return Number(b.quantity || 0) - Number(a.quantity || 0);
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    }), [vaultItems, vaultFilter, vaultSearch, vaultSort]);
  const vaultValue = useMemo(() => activeVaultItems.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.marketPrice || 0),
    0
  ), [activeVaultItems]);
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
  const signedInWithSupabase = Boolean(user?.id && user.id !== "local-beta");
  const accountStatusTitle = signedInWithSupabase ? "Signed In" : "Private Beta Mode";
  const accountStatusDescription = signedInWithSupabase
    ? currentUserProfile.email || user?.email || "Supabase account"
    : "Beta data is saved on this device unless you export or connect cloud sync.";
  const localBetaAdminEnabled =
    typeof window !== "undefined" && localStorage.getItem("et-tcg-local-admin") === "true";
  const adminToolsVisible = adminUser || localBetaAdminEnabled;
  const canReviewSharedData = adminToolsVisible;
  const adminReviewIdentityLabel = adminUser ? "Signed in as Admin" : "Private Beta Admin Review";
  const adminReviewIdentityDetail = adminUser
    ? "Your profile has admin review access. Shared-data writes remain protected by server-side database rules."
    : "Enabled by private beta admin mode. Normal users submit suggestions for review instead of directly changing shared data.";
  const notificationPreferenceRows = [
    { key: "scoutAlerts", label: "Scout alerts", description: "Store, report, and restock intelligence alerts." },
    { key: "favoriteStoreAlerts", label: "Favorite store alerts", description: "Updates tied to stores you have saved." },
    { key: "watchlistProductAlerts", label: "Watchlist product alerts", description: "Catalog or market changes for watched products." },
    { key: "onlineDropAlerts", label: "Online drop alerts", description: "Best Buy and online availability checks when connected." },
    { key: "verifiedOnly", label: "Verified-only alerts", description: "Prefer alerts backed by verified reports." },
    { key: "quietHours", label: "Quiet hours", description: "Keep overnight notifications quiet when alerts go live." },
  ];
  const menuHomeStatRows = [
    { key: "collection_value", label: "Collection Value" },
    { key: "monthly_spending", label: "Monthly Spending" },
    { key: "marketUpdates", label: "Market Updates" },
    { key: "alerts", label: "Active Alerts" },
  ];
  const menuDashboardSectionRows = [
    { key: "home_stats", label: "Today / Overview" },
    { key: "action_center", label: "Beta Tester Path" },
    { key: "recent_inventory", label: "Recent Activity" },
    { key: "purchaser_spending", label: "Recent Purchases" },
    { key: "watchlist", label: "Market Watch" },
    { key: "store_reports", label: "Recent Reports" },
  ];
  const feedbackDialogCopy = {
    bug: {
      title: "Report a Bug",
      intro: "Tell us what broke or looked wrong so we can clean it up for beta.",
      label: "What happened?",
      placeholder: "Describe what broke or looked wrong.",
      stepsLabel: "Steps to reproduce",
      stepsPlaceholder: "Example: Opened Scout, tapped Stores, then the list overlapped.",
      submit: "Submit Bug Report",
    },
    feature: {
      title: "Request a Feature",
      intro: "Tell us what would make E&T TCG more useful.",
      label: "Feature request",
      placeholder: "What should we add, change, or make easier?",
      stepsLabel: "What were you doing?",
      stepsPlaceholder: "Optional context: where you expected this feature to show up.",
      submit: "Submit Feature Request",
    },
    feedback: {
      title: "Send Feedback",
      intro: "Share what would make the beta easier to use.",
      label: "Feedback",
      placeholder: "What should we improve, add, remove, or make clearer?",
      stepsLabel: "What were you doing?",
      stepsPlaceholder: "Optional: what page or flow were you using?",
      submit: "Submit Feedback",
    },
    catalog_data: {
      title: "Report Bad Catalog Data",
      intro: "Tell us what catalog product, expansion, UPC/SKU, image, or detail needs review.",
      label: "Catalog issue",
      placeholder: "Example: This ETB is marked as a regular ETB, but it is the Pokemon Center version.",
      stepsLabel: "Proof or context",
      stepsPlaceholder: "Optional: add source links, UPC/SKU, screenshots, or what you expected to see.",
      submit: "Submit Catalog Report",
    },
    store_data: {
      title: "Report Bad Store Data",
      intro: "Tell us what store, address, hours, retailer, or Scout information needs review.",
      label: "Store issue",
      placeholder: "Example: This store is closed, has the wrong address, or is missing a purchase limit.",
      stepsLabel: "Proof or context",
      stepsPlaceholder: "Optional: add a source link, store page, photo note, or correction details.",
      submit: "Submit Store Report",
    },
    market_data: {
      title: "Report Wrong Market Price",
      intro: "Tell us what price, source, variant, or timestamp looks wrong.",
      label: "Market price issue",
      placeholder: "Example: Reverse Holofoil price is showing as Normal, or MSRP is missing.",
      stepsLabel: "Source or context",
      stepsPlaceholder: "Optional: add a price source, product URL, date checked, or expected value.",
      submit: "Submit Market Report",
    },
  }[feedbackDialog || "feedback"];
  const featureAllowed = (featureKey) => hasPlanAccess(planProfile, featureKey);
  const paidStatLocked = (statKey) => PAID_HOME_STATS.includes(statKey) && !featureAllowed("seller_tools");
  const visibleDashboardStats = dashboardStats.filter((stat) => isHomeStatEnabled(homeStatsProfile, stat.key) && !paidStatLocked(stat.key));
  const visibleCoreHomeStats = visibleDashboardStats.filter((stat) => CORE_HOME_STAT_KEYS.includes(stat.key));
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
  const activeTabLocked = Boolean(activeTabFeature && FEATURE_GATES_ENABLED && !featureAllowed(activeTabFeature));
  const dashboardSectionStyle = (key) => ({ order: dashboardSectionState(key).order });
  const packItForwardItems = vaultItems.filter((item) =>
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
  const recentPurchases = [...forgeInventoryItems]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 5);
  const recentSales = [...sales]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 5);
  const recentMarketUpdates = [...tideTradrWatchlist]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .slice(0, 5);
  const watchlistPreview = [...missingMarketPriceItems, ...needsMarketCheckItems]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 5);
  const activeHomeAlertCount = (scoutSnapshot.bestBuyAlerts || []).length + needsPhotosItems.length + needsMarketCheckItems.length;
  const pinnedMarketWatchItems = tideTradrWatchlist.filter((item) => item.pinned || item.isPinned).slice(0, 3);
  const homeRecentActivity = [
    recentPurchases[0]
      ? {
          id: `home-forge-${recentPurchases[0].id}`,
          label: "Forge",
          title: recentPurchases[0].name,
          detail: `${shortDate(recentPurchases[0].createdAt)} | Qty ${recentPurchases[0].quantity || 1}`,
          action: () => setActiveTab("inventory"),
        }
      : null,
    vaultItems[0]
      ? {
          id: `home-vault-${vaultItems[0].id}`,
          label: "The Vault",
          title: vaultItems[0].name,
          detail: `${vaultStatusLabel(normalizeVaultStatus(vaultItems[0]))} | ${money(Number(vaultItems[0].quantity || 0) * Number(vaultItems[0].marketPrice || 0))}`,
          action: () => setActiveTab("vault"),
        }
      : null,
    scoutSnapshot.reports[0]
      ? {
          id: `home-scout-${scoutSnapshot.reports[0].id || scoutSnapshot.reports[0].reportId || "latest"}`,
          label: "Scout",
          title: scoutSnapshot.reports[0].itemName || scoutSnapshot.reports[0].productName || "Store report",
          detail: scoutSnapshot.reports[0].storeName || scoutSnapshot.reports[0].chain || "Latest report",
          action: () => {
            setActiveTab("scout");
            setScoutView("main");
            setScoutSubTabTarget({ tab: "reports", id: Date.now() });
          },
        }
      : null,
    recentMarketUpdates[0]
      ? {
          id: `home-market-${recentMarketUpdates[0].id}`,
          label: "TideTradr",
          title: recentMarketUpdates[0].name || recentMarketUpdates[0].productName || recentMarketUpdates[0].cardName,
          detail: `${recentMarketUpdates[0].productType || recentMarketUpdates[0].rarity || "Market item"} | ${money(recentMarketUpdates[0].marketPrice || recentMarketUpdates[0].marketValue || 0)}`,
          action: () => setActiveTab("market"),
        }
      : null,
  ].filter(Boolean);
  const scoutLastUpdated = scoutSnapshot.reports[0]?.createdAt || scoutSnapshot.reports[0]?.created_at || locationSettings.lastUpdated || "Private beta";
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
    { label: "Online drops", value: "Stock data unavailable", updatedAt: locationSettings.lastUpdated || "Needs source" },
    { label: "Price changes", value: recentMarketUpdates[0]?.name || "No catalog changes", updatedAt: recentMarketUpdates[0]?.createdAt || "Local catalog" },
    { label: "Store limit changes", value: scoutSnapshot.stores.find((store) => store.limitPolicy || store.limit_policy)?.limitPolicy || "No limits logged", updatedAt: scoutLastUpdated },
  ];
  const scoutReportsByStore = scoutSnapshot.reports.reduce((acc, report) => {
    const storeId = report.storeId || report.store_id || "";
    if (!storeId) return acc;
    acc[storeId] = [...(acc[storeId] || []), report];
    return acc;
  }, {});
  const scoutStoreMap = (scoutSnapshot.stores || []).reduce((acc, store) => {
    acc[String(store.id)] = store;
    return acc;
  }, {});

  function getScoutReportId(report = {}) {
    return report.id || report.reportId || report.report_id || "";
  }

  function getScoutReportStore(report = {}) {
    const storeId = report.storeId || report.store_id || "";
    return scoutStoreMap[String(storeId)] || {
      name: report.storeName || report.store_name || "",
      chain: report.retailer || report.chain || "",
      city: report.city || "",
      region: report.region || "",
    };
  }

  function normalizeScoutReportItems(report = {}) {
    const rawItems = Array.isArray(report.itemsSeen)
      ? report.itemsSeen
      : Array.isArray(report.items_seen)
        ? report.items_seen
        : [];
    const items = rawItems
      .map((item) => ({
        productId: item.productId || item.product_id || "",
        productName: item.productName || item.product_name || item.name || "",
        productType: item.productType || item.product_type || "",
        quantity: item.quantity ?? item.quantitySeen ?? item.quantity_seen ?? "",
        price: item.price ?? "",
        note: item.note || item.notes || "",
      }))
      .filter((item) => String(item.productName || "").trim());
    if (items.length) return items;
    const legacyName = report.itemName || report.item_name || report.productName || report.product_name || report.manualItemName || "";
    return legacyName ? [{
      productId: report.catalogProductId || report.catalog_product_id || "",
      productName: legacyName,
      productType: report.productType || report.product_type || report.reportType || report.report_type || "",
      quantity: report.quantitySeen || report.quantity_seen || "",
      price: report.price || "",
      note: "",
    }] : [];
  }

  function scoutReportStatusLabel(report = {}) {
    const rawStatus = String(report.verificationStatus || report.verification_status || report.status || "").toLowerCase();
    if (report.verified || rawStatus === "verified") return "Verified";
    if (rawStatus === "pending") return "Pending";
    if (rawStatus.includes("review")) return "Needs Review";
    return report.userId || report.reportedBy || report.reported_by ? "User Report" : "Pending";
  }

  function scoutReportDateTimeLabel(report = {}) {
    const date = report.reportDate || report.report_date || report.createdAt || report.created_at || "";
    const time = report.reportTime || report.report_time || "";
    if (!date && !time) return "Date not added";
    const parsed = date ? new Date(`${String(date).slice(0, 10)}T${time || "00:00"}`) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) {
      return `${parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}${time ? ` at ${time}` : ""}`;
    }
    return [date, time].filter(Boolean).join(" ");
  }

  function isCurrentUserScoutReport(report = {}) {
    const userIds = [currentUserProfile.userId, user?.id, "local-beta", "local-beta-scout"].filter(Boolean).map(String);
    return userIds.some((id) => String(report.userId || report.reportedBy || report.reported_by || "").includes(id));
  }
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
  const tidepoolPostsWithCounts = tidepoolPosts.map((post) => ({
    ...post,
    commentCount: tidepoolComments.filter((comment) => comment.postId === post.postId && !comment.parentCommentId && comment.status !== "removed").length,
    reactionCount: tidepoolReactions.filter((reaction) => reaction.postId === post.postId).length,
  }));
  const visibleTidepoolFilters = TIDEPOOL_FEED_FILTERS.filter((filter) => filter !== "Needs Review" || adminToolsVisible);
  const filteredTidepoolPosts = tidepoolPostsWithCounts
    .filter((post) => {
      if (post.status === "removed") return false;
      if (!adminToolsVisible && ["mock", "demo", "test"].includes(String(post.sourceType || "").toLowerCase())) return false;
      if (post.status === "hidden" && (!adminToolsVisible || tidepoolFilter !== "Needs Review")) return false;
      if (tidepoolFilter === "Needs Review" && !adminToolsVisible) return false;
      if (tidepoolFilter === "Verified") return post.verificationStatus === "verified";
      if (tidepoolFilter === "Questions") return post.postType === "Question";
      if (tidepoolFilter === "Events") return post.postType === "Event";
      if (tidepoolFilter === "Deals") return post.postType === "Deal sighting";
      if (tidepoolFilter === "Store Tips") return post.postType === "Store tip";
      if (tidepoolFilter === "My Posts") return post.userId === (currentUserProfile.userId || "local-beta");
      if (tidepoolFilter === "Saved") return post.saved;
      if (tidepoolFilter === "Needs Review") return ["pending", "disputed"].includes(post.verificationStatus) || post.flagged;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const scoutReportRows = [...(scoutSnapshot.reports || [])].sort((a, b) => {
    const aDate = `${a.reportDate || a.report_date || a.createdAt || ""}T${a.reportTime || a.report_time || "00:00"}`;
    const bDate = `${b.reportDate || b.report_date || b.createdAt || ""}T${b.reportTime || b.report_time || "00:00"}`;
    return new Date(bDate) - new Date(aDate);
  });
  const filteredScoutReports = scoutReportRows.filter((report) => {
    if (scoutReportFilter === "Verified") return Boolean(report.verified || report.verificationStatus === "verified");
    if (scoutReportFilter === "My Reports") return isCurrentUserScoutReport(report);
    if (scoutReportFilter === "Needs Review") return !report.verified && report.verificationStatus !== "verified";
    return true;
  }).sort((a, b) => {
    if (scoutReportSort === "Verified first") {
      const verifiedDiff = Number(b.verified || b.verificationStatus === "verified") - Number(a.verified || a.verificationStatus === "verified");
      if (verifiedDiff) return verifiedDiff;
    }
    if (scoutReportSort === "Closest first") {
      const aStore = getScoutReportStore(a);
      const bStore = getScoutReportStore(b);
      const regionDiff = String(aStore.city || aStore.region || "").localeCompare(String(bStore.city || bStore.region || ""));
      if (regionDiff) return regionDiff;
    }
    const aDate = `${a.reportDate || a.report_date || a.createdAt || ""}T${a.reportTime || a.report_time || "00:00"}`;
    const bDate = `${b.reportDate || b.report_date || b.createdAt || ""}T${b.reportTime || b.report_time || "00:00"}`;
    return new Date(bDate) - new Date(aDate);
  });
  const pagedTidepoolPosts = getPagedItems(filteredTidepoolPosts, tidepoolPage, LONG_LIST_PAGE_SIZE);
  const pagedScoutReports = getPagedItems(filteredScoutReports, scoutReportsPage, LONG_LIST_PAGE_SIZE);
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
      label: "Sold",
      status: "Sold",
      search: "",
    },
    {
      label: "Needs Market",
      status: "Needs Market Check",
      search: "",
    },
  ];
  const advancedInventoryFilters = [
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
      label: "Personal",
      status: "Personal Collection",
      search: "",
    },
    {
      label: "Imported",
      status: "All",
      search: "import",
    },
    {
      label: "Moved from Vault",
      status: "All",
      search: "vault",
    },
  ];

  const filteredItems = forgeInventoryItems.filter((item) => {
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

  const pagedVaultItems = getPagedItems(visibleVaultItems, vaultPage, LONG_LIST_PAGE_SIZE);
  const pagedForgeInventory = getPagedItems(sortedFilteredItems, forgeInventoryPage, LONG_LIST_PAGE_SIZE);
  const pagedMarketWatchItems = getPagedItems(tideTradrWatchlist, marketWatchPage, LONG_LIST_PAGE_SIZE);

  const filteredCatalogProducts = catalogProducts.filter((product) => {
    const search = (catalogSearchHasRun ? submittedCatalogSearch : "").toLowerCase();
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
      String(product.externalProductId || "").toLowerCase().includes(search) ||
      String(product.tcgplayerProductId || "").toLowerCase().includes(search) ||
      String(product.marketSource || "").toLowerCase().includes(search) ||
      String(product.priceSubtype || "").toLowerCase().includes(search) ||
      String(product.sourceUrl || "").toLowerCase().includes(search) ||
      String(product.marketUrl || "").toLowerCase().includes(search) ||
      String(product.sku || "").toLowerCase().includes(search) ||
      String(product.releaseYear || "").toLowerCase().includes(search) ||
      String(product.barcode || "").toLowerCase().includes(search);

    const productGroup = String(product.catalogGroup || "").toLowerCase();
    const productTypeText = String(product.productType || "").toLowerCase();
    const productIsSealed =
      product.catalogType === "sealed" ||
      productGroup === "sealed" ||
      Boolean(product.isSealed) ||
      /(sealed|booster|elite trainer|box|tin|collection|bundle|pack)/i.test(productTypeText);
    const productIsCard =
      product.catalogType === "card" ||
      productGroup === "cards" ||
      productTypeText.includes("card") ||
      Boolean(product.cardNumber || product.rarity);
    const matchesKind =
      catalogKindFilter === "All" ||
      (catalogKindFilter === "card" && productIsCard) ||
      (catalogKindFilter === "sealed" && productIsSealed) ||
      (catalogKindFilter === "other" && !productIsCard && !productIsSealed);
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
    const historyDate = product.latestHistorySnapshot ? new Date(product.latestHistorySnapshot) : null;
    const recentHistoryCutoff = new Date();
    recentHistoryCutoff.setDate(recentHistoryCutoff.getDate() - 30);
    const matchesHistory =
      catalogHistoryFilter === "All" ||
      (catalogHistoryFilter === "Has price history" && Number(product.historySnapshotCount || 0) > 0) ||
      (catalogHistoryFilter === "Missing price history" && Number(product.historySnapshotCount || 0) <= 0) ||
      (catalogHistoryFilter === "Price changed recently" && historyDate && historyDate >= recentHistoryCutoff) ||
      (catalogHistoryFilter === "High volatility" && product.historyVolatility === "High Volatility") ||
      (catalogHistoryFilter === "Low volatility" && product.historyVolatility === "Low Volatility");
    const matchesDataFilter =
      catalogDataFilter === "All" ||
      (catalogDataFilter === "Has market price" && marketInfo.currentMarketValue > 0) ||
      (catalogDataFilter === "Missing price" && marketInfo.currentMarketValue <= 0) ||
      (catalogDataFilter === "Has image" && Boolean(catalogImage(product)));
    const minValue = catalogMinValue === "" ? 0 : Number(catalogMinValue || 0);
    const maxValue = catalogMaxValue === "" ? Infinity : Number(catalogMaxValue || 0);
    const matchesValue = marketInfo.currentMarketValue >= minValue && marketInfo.currentMarketValue <= maxValue;

    return matchesSearch && matchesKind && matchesSet && matchesType && matchesEra && matchesYear && matchesRarity && matchesVariant && matchesCondition && matchesGraded && matchesOwned && matchesWatchlist && matchesHistory && matchesDataFilter && matchesValue;
  }).sort((a, b) => compareCatalogProducts(a, b, catalogSort));
  const catalogSetOptions = ["All", ...new Set(catalogProducts.map((product) => product.setName || product.expansion).filter(Boolean))].sort();
  const catalogTypeOptions = ["All", ...new Set([...SEALED_PRODUCT_TYPES, ...catalogProducts.map((product) => product.productType).filter(Boolean)])].sort();
  const catalogEraOptions = ["All", ...new Set(catalogProducts.map((product) => product.productLine).filter(Boolean))].sort();
  const catalogYearOptions = ["All", ...new Set(catalogProducts.map((product) => String(product.releaseYear || "")).filter(Boolean))].sort();
  const catalogRarityOptions = ["All", ...new Set(catalogProducts.map((product) => product.rarity).filter(Boolean))].sort();
  const catalogVariantOptions = ["All", ...new Set(catalogProducts.map((product) => product.variant).filter(Boolean))].sort();
  const catalogConditionOptions = ["All", ...new Set(catalogProducts.map((product) => product.condition).filter(Boolean))].sort();
  const sealedCatalogCount = catalogProducts.filter((product) => product.catalogType !== "card").length;
  const cardCatalogCount = catalogProducts.filter((product) => product.catalogType === "card").length;
  const catalogDuplicateWarnings = flagCatalogDuplicates(catalogProducts);
  const catalogValidationWarnings = validateCatalogImport(catalogProducts);
  const catalogUpcCount = catalogProducts.filter((product) => product.upc || product.barcode).length + POKEMON_PRODUCT_UPCS.length;
  const catalogMarketPriceCount = catalogProducts.filter((product) => Number(product.marketPrice || product.marketValue || product.marketValueNearMint || 0) > 0).length;
  const cachedMarketPriceCount = marketPriceCache.prices?.length || 0;
  const failedMarketMatches = marketPriceCache.failedMatches || [];
  const lastMarketSync = marketPriceCache.lastSync || "Not synced yet";
  const selectedCatalogDetailBaseProduct = catalogProducts.find((product) => String(product.id) === String(selectedCatalogDetailId));
  const selectedCatalogDetailExtra = selectedCatalogDetailId ? catalogDetailExtras[selectedCatalogDetailId] : null;
  const selectedCatalogDetailProduct = selectedCatalogDetailBaseProduct
    ? {
        ...selectedCatalogDetailBaseProduct,
        identifiers: selectedCatalogDetailExtra?.identifiers?.length ? selectedCatalogDetailExtra.identifiers : selectedCatalogDetailBaseProduct.identifiers || [],
        variants: selectedCatalogDetailExtra?.variants?.length ? selectedCatalogDetailExtra.variants : selectedCatalogDetailBaseProduct.variants || [],
        cardDetails: selectedCatalogDetailExtra?.cardDetails || selectedCatalogDetailBaseProduct.cardDetails || null,
      }
    : null;
  const selectedCatalogDetailMarketInfo = selectedCatalogDetailProduct ? getTideTradrMarketInfo(selectedCatalogDetailProduct) : null;
  const selectedCatalogDetailVariants = selectedCatalogDetailProduct ? getCatalogVariantOptions(selectedCatalogDetailProduct) : [];
  const selectedCatalogDetailVariant =
    selectedCatalogDetailVariants.find((variant) => String(variant.id) === String(catalogVariantSelection[selectedCatalogDetailProduct?.id])) ||
    selectedCatalogDetailVariants.find((variant) => variant.isDefault) ||
    selectedCatalogDetailVariants[0] ||
    null;
  const selectedCatalogDetailCondition = catalogConditionSelection[selectedCatalogDetailProduct?.id] || "Near Mint";
  const catalogPagedResultSet = new Set(catalogPagedResultIds.map((id) => String(id)));
  const tideTradrCatalogResults = catalogSearchHasRun
    ? (catalogPagedResultSet.size
        ? catalogPagedResultIds
            .map((id) => filteredCatalogProducts.find((product) => String(product.id) === String(id)))
            .filter(Boolean)
        : filteredCatalogProducts)
    : [];
  const tideTradrCatalogPageCount = supabaseCatalogStatus.totalCount
    ? Math.max(1, Math.ceil(supabaseCatalogStatus.totalCount / (supabaseCatalogStatus.pageSize || SUPABASE_CATALOG_PAGE_SIZE)))
    : null;

  function catalogTitle(product = {}) {
    return product.catalogType === "card"
      ? product.cardName || product.name || "Unknown card"
      : product.productName || product.name || "Unknown product";
  }

  function catalogImage(product = {}) {
    return getCatalogImage(product);
  }

  function catalogSourceUrl(product = {}) {
    return product.sourceUrl || product.source_url || product.marketUrl || product.market_url || product.tcgplayerUrl || product.tcgplayer_url || product.imageSourceUrl || product.image_source_url || "";
  }

  function catalogExpansionName(product = {}) {
    return product.expansionOfficialName || product.expansionDisplayName || product.setName || product.expansion || product.series || product.productLine || "";
  }

  function catalogProductTypeLabel(product = {}) {
    if (product.catalogType === "card") return "Individual Card";
    return product.productType || product.sealedProductType || product.productKind || "Catalog product";
  }

  function getCatalogPickerResults(query, limit = 12) {
    const cleanQuery = String(query || "").trim();
    if (!cleanQuery) return [];

    const scannedMatches = getBestCatalogMatches(cleanQuery, catalogProducts)
      .map((match) => ({ ...match.item, _matchReason: match.explanation || match.reason || "Best catalog match" }));
    const normalizedQuery = cleanQuery.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const simpleMatches = catalogProducts
      .map((product) => {
        const fields = [
          catalogTitle(product),
          catalogExpansionName(product),
          product.productType,
          product.sealedProductType,
          product.productKind,
          product.setCode,
          product.cardNumber,
          product.barcode,
          product.upc,
          product.sku,
          product.externalProductId,
          product.tcgplayerProductId,
          product.identifierSearch,
          product.variantNames,
        ].filter(Boolean).join(" ");
        const haystack = fields.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        const exactId = [product.barcode, product.upc, product.sku, product.externalProductId, product.tcgplayerProductId]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase() === cleanQuery.toLowerCase());
        const tokenHits = queryTokens.filter((token) => haystack.includes(token)).length;
        const score =
          exactId ? 1000 :
          haystack.includes(normalizedQuery) ? 650 :
          queryTokens.length && tokenHits === queryTokens.length ? 420 :
          tokenHits > 0 ? tokenHits * 80 :
          0;
        return { product, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => ({ ...entry.product, _matchReason: entry.score >= 1000 ? "Exact identifier match" : "Name, set, or product detail match" }));

    const byId = new Map();
    [...scannedMatches, ...simpleMatches].forEach((product) => {
      const key = String(product.id || product.externalProductId || product.tcgplayerProductId || catalogTitle(product)).toLowerCase();
      if (!byId.has(key)) byId.set(key, product);
    });
    return [...byId.values()].slice(0, limit);
  }

  function buildMultiDestinationSeedFromProduct(product = {}, overrides = {}) {
    const marketInfo = getTideTradrMarketInfo(product);
    const title = catalogTitle(product);
    const productType = catalogProductTypeLabel(product);
    const expansionName = catalogExpansionName(product);
    const upcSku = product.barcode || product.upc || product.sku || "";
    const defaultVariant = getCatalogVariantOptions(product).find((variant) => variant.isDefault) || getCatalogVariantOptions(product)[0] || null;
    const base = {
      itemName: title,
      category: product.category || "Pokemon",
      productType,
      setName: expansionName,
      variant: defaultVariant?.variantName || "",
      catalogProductId: product.id || "",
      upcSku,
      msrpPrice: marketInfo.msrp || product.msrpPrice || "",
      marketPrice: marketInfo.currentMarketValue || product.marketPrice || product.midPrice || "",
      catalogSearchQuery: title,
      destinations: { ...BLANK_MULTI_DESTINATION_FORM.destinations },
      tidetradr: {
        ...BLANK_MULTI_DESTINATION_FORM.tidetradr,
        existingProductId: product.id || "",
        msrpPrice: marketInfo.msrp || product.msrpPrice || "",
        upc: product.barcode || product.upc || "",
        sku: product.sku || "",
        setName: expansionName,
        productType,
        releaseDate: product.releaseDate || product.releaseYear || "",
        sourceUrl: catalogSourceUrl(product),
      },
    };

    return {
      ...base,
      ...overrides,
      destinations: { ...base.destinations, ...(overrides.destinations || {}) },
      vault: { ...(overrides.vault || {}) },
      wishlist: { ...(overrides.wishlist || {}) },
      forge: { ...(overrides.forge || {}) },
      tidetradr: { ...base.tidetradr, ...(overrides.tidetradr || {}) },
    };
  }

  function catalogCardDetails(product = {}) {
    return product.cardDetails || {};
  }

  function normalizeCatalogIdentifier(identifier = {}) {
    return {
      label: identifier.identifierType || identifier.identifier_type || "Identifier",
      value: identifier.identifierValue || identifier.identifier_value || "",
      source: identifier.source || "",
      confidence: identifier.confidence || "",
      status: identifier.status || (identifier.isVerified || identifier.is_verified ? "Verified" : identifier.confidence || "Needs review"),
    };
  }

  function getCatalogIdentifiers(product = {}) {
    const explicit = Array.isArray(product.identifiers) ? product.identifiers.map(normalizeCatalogIdentifier).filter((entry) => entry.value) : [];
    const fallback = [
      product.upc || product.barcode ? { label: "UPC", value: product.upc || product.barcode, source: product.marketSource || product.sourceType || "", confidence: "imported" } : null,
      product.tcgplayerProductId ? { label: "TCGPLAYER_PRODUCT_ID", value: product.tcgplayerProductId, source: "TCGplayer", confidence: "imported" } : null,
      product.externalProductId && !product.tcgplayerProductId ? { label: "External ID", value: product.externalProductId, source: product.marketSource || "", confidence: "imported" } : null,
    ].filter(Boolean);
    const seen = new Set();
    return [...explicit, ...fallback].filter((entry) => {
      const key = `${entry.label}|${entry.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function getCatalogVariantOptions(product = {}) {
    const explicit = Array.isArray(product.variants) ? product.variants.filter((variant) => variant.variantName || variant.variant_name) : [];
    if (explicit.length) return explicit.map((variant, index) => ({
      id: variant.id || `${product.id}-variant-${index}`,
      variantName: variant.variantName || variant.variant_name || "Default",
      printing: variant.printing || "",
      finish: variant.finish || "",
      language: variant.language || "English",
      tcgplayerSkuId: variant.tcgplayerSkuId || variant.tcgplayer_sku_id || "",
      conditionName: variant.conditionName || variant.condition_name || "",
      isDefault: Boolean(variant.isDefault || variant.is_default),
    }));
    if (product.priceSubtype || product.variantNames) {
      const names = String(product.variantNames || product.priceSubtype)
        .split(/\s{2,}|,\s*/)
        .map((name) => name.trim())
        .filter(Boolean);
      return (names.length ? names : [product.priceSubtype]).map((name, index) => ({
        id: `${product.id}-legacy-variant-${index}`,
        variantName: name,
        printing: /1st edition/i.test(name) ? "1st Edition" : /unlimited/i.test(name) ? "Unlimited" : "",
        finish: /reverse/i.test(name) ? "Reverse Holofoil" : /holo/i.test(name) ? "Holofoil" : /normal/i.test(name) ? "Normal" : "",
        language: product.language || "English",
        conditionName: "",
        isDefault: index === 0,
      }));
    }
    return product.catalogType === "card"
      ? [{ id: `${product.id}-default`, variantName: "Default", printing: "", finish: "", language: product.language || "English", conditionName: "", isDefault: true }]
      : [];
  }

  function applyCatalogVariantToItemForm(variant = {}, product = {}) {
    setItemForm((old) => ({
      ...old,
      catalogVariantId: variant.id || old.catalogVariantId || "",
      finish: variant.finish || old.finish || "",
      printing: variant.printing || old.printing || "",
      language: variant.language || product.language || old.language || "English",
      conditionName: old.conditionName || "Near Mint",
      condition: old.condition || variant.finish || "",
    }));
  }

  function applyCatalogVariantToVaultForm(variant = {}, product = {}) {
    setVaultForm((old) => ({
      ...old,
      catalogVariantId: variant.id || old.catalogVariantId || "",
      finish: variant.finish || old.finish || "",
      printing: variant.printing || old.printing || "",
      language: variant.language || product.language || old.language || "English",
      condition: product.catalogType === "card" ? old.condition || "Near Mint" : old.condition,
    }));
  }

  async function loadCatalogProductExtras(productId) {
    if (!productId || !isSupabaseConfigured || !supabase || catalogDetailExtras[productId]) return;
    try {
      const [identifierResult, variantResult, cardDetailResult] = await Promise.all([
        supabase.from("product_identifiers").select("*").eq("catalog_product_id", productId).order("identifier_type", { ascending: true }),
        supabase.from("catalog_product_variants").select("*").eq("catalog_product_id", productId).order("is_default", { ascending: false }).order("variant_name", { ascending: true }),
        supabase.from("tcg_card_details").select("*").eq("catalog_product_id", productId).maybeSingle(),
      ]);

      setCatalogDetailExtras((current) => ({
        ...current,
        [productId]: {
          identifiers: identifierResult.error ? [] : (identifierResult.data || []).map((identifier) => ({
            id: identifier.id,
            catalogProductId: identifier.catalog_product_id,
            identifierType: identifier.identifier_type,
            identifierValue: identifier.identifier_value,
            retailer: identifier.retailer || "",
            source: identifier.source,
            sourceUrl: identifier.source_url,
            confidence: identifier.confidence,
            confidenceScore: identifier.confidence_score,
            status: identifier.status || "",
            isVerified: Boolean(identifier.is_verified),
          })),
          variants: variantResult.error ? [] : (variantResult.data || []).map((variant) => ({
            id: variant.id,
            catalogProductId: variant.catalog_product_id,
            variantName: variant.variant_name,
            printing: variant.printing || "",
            finish: variant.finish || "",
            language: variant.language || "English",
            tcgplayerSkuId: variant.tcgplayer_sku_id || "",
            conditionId: variant.condition_id || "",
            conditionName: variant.condition_name || "",
            isDefault: Boolean(variant.is_default),
          })),
          cardDetails: cardDetailResult.error ? null : mapCatalog({ id: productId, name: cardDetailResult.data?.card_name, card_details: cardDetailResult.data }).cardDetails,
        },
      }));
    } catch {
      setCatalogDetailExtras((current) => ({ ...current, [productId]: { identifiers: [], variants: [], cardDetails: null } }));
    }
  }

  function rememberCatalogProduct(product = {}) {
    if (!product?.id) return;
    setCatalogProducts((current) => {
      const exists = current.some((item) => String(item.id) === String(product.id));
      if (exists) {
        return current.map((item) => String(item.id) === String(product.id) ? { ...item, ...product } : item);
      }
      return [product, ...current];
    });
  }

  function openCatalogDetails(productId) {
    const product = typeof productId === "object" ? productId : null;
    const resolvedProductId = product?.id || productId;
    if (!resolvedProductId) return;
    if (product?.id) rememberCatalogProduct(product);
    setSelectedCatalogDetailId(resolvedProductId);
    setTideTradrLookupId(resolvedProductId);
    loadCatalogProductExtras(resolvedProductId);
  }

  function getCatalogMarketSourceLabel(product = {}) {
    const marketInfo = getTideTradrMarketInfo(product);
    const raw = [
      marketInfo.sourceName,
      marketInfo.marketStatus,
      product.marketSource,
      product.sourceType,
      product.sourceName,
      product.priceSource,
    ].filter(Boolean).join(" ").toLowerCase();
    if (raw.includes("live")) return "Live";
    if (raw.includes("estimated") || raw.includes("mock") || raw.includes("demo")) return "Estimated";
    if (raw.includes("manual") || raw.includes("admin")) return "Manual";
    if (raw.includes("cached") || raw.includes("cache") || raw.includes("tcgcsv") || raw.includes("tcgplayer") || raw.includes("pokemon tcg") || raw.includes("supabase")) return "Cached";
    return "Unknown";
  }

  function getCatalogIdentifierBundle(product = {}) {
    return getCatalogIdentifiers(product).map((identifier) => [identifier.label, identifier.value]);
  }

  function hasCatalogMarketPrice(product = {}) {
    const marketInfo = getTideTradrMarketInfo(product);
    return Number(marketInfo.currentMarketValue || product.marketPrice || product.market_price || product.midPrice || product.mid_price || 0) > 0;
  }

  function hasCatalogUpcSku(product = {}) {
    return getCatalogIdentifiers(product).some((identifier) => ["UPC", "EAN", "GTIN", "RETAILER_SKU", "BEST_BUY_SKU", "TARGET_TCIN", "WALMART_ITEM_ID", "WALMART_SKU", "GAMESTOP_SKU", "POKEMON_CENTER_SKU", "POKEMON_CENTER_ID"].includes(identifier.label));
  }

  function copyCatalogProductIdentifiers(product = {}) {
    const identifiers = getCatalogIdentifierBundle(product);
    if (!identifiers.length) {
      setVaultToast("UPC/SKU missing. You can suggest UPC/SKU from Product Detail.");
      return;
    }
    const text = identifiers.map(([label, value]) => `${label}: ${value}`).join("\n");
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => setVaultToast("UPC/SKU copied."))
        .catch(() => setVaultToast(text));
      return;
    }
    setVaultToast(text);
  }

  function suggestCatalogMissingPrice(product = {}) {
    submitUniversalSuggestion({
      suggestionType: SUGGESTION_TYPES.CORRECT_PRODUCT_METADATA,
      targetTable: "product_market_price_current",
      targetRecordId: product.id,
      submittedData: {
        name: catalogTitle(product),
        requestedField: "market_price",
        marketPriceMissing: !hasCatalogMarketPrice(product),
        currentMarketPrice: getTideTradrMarketInfo(product).currentMarketValue || "",
      },
      currentDataSnapshot: product,
      notes: "User requested a market price review from TideTradr Product Detail.",
      source: "tidetradr-detail",
    });
  }

  function suggestCatalogCorrection(product = {}) {
    submitUniversalSuggestion({
      suggestionType: SUGGESTION_TYPES.CORRECT_CATALOG_PRODUCT,
      targetTable: "product_catalog",
      targetRecordId: product.id,
      submittedData: { name: catalogTitle(product), needsReview: true },
      currentDataSnapshot: product,
      notes: "User requested a full catalog detail correction review.",
      source: "tidetradr-detail",
    });
  }

  function suggestCatalogUpcSku(product = {}) {
    submitUniversalSuggestion({
      suggestionType: SUGGESTION_TYPES.ADD_UPC_SKU,
      targetTable: "product_identifiers",
      targetRecordId: product.id,
      submittedData: {
        name: catalogTitle(product),
        upc: product.upc || product.barcode || "",
        sku: product.sku || "",
        msrpPrice: product.msrpPrice || "",
        msrpSource: product.msrpSource || "",
        identifiers: getCatalogIdentifiers(product),
      },
      currentDataSnapshot: product,
      notes: "User requested UPC/SKU review for this catalog item.",
      source: "tidetradr-detail",
    });
  }

  function suggestCatalogWrongExpansion(product = {}) {
    submitUniversalSuggestion({
      suggestionType: SUGGESTION_TYPES.CORRECT_PRODUCT_METADATA,
      targetTable: "product_catalog",
      targetRecordId: product.id,
      submittedData: {
        name: catalogTitle(product),
        requestedField: "expansion_id",
        currentExpansion: catalogExpansionName(product),
        legacySetName: product.legacySetName || product.setName || "",
        sourceGroupName: product.sourceGroupName || "",
      },
      currentDataSnapshot: product,
      notes: "User reported that this product is linked to the wrong expansion.",
      source: "tidetradr-detail",
    });
  }

  function suggestCatalogWrongVersionPricing(product = {}) {
    submitUniversalSuggestion({
      suggestionType: SUGGESTION_TYPES.CORRECT_PRODUCT_METADATA,
      targetTable: "catalog_product_variants",
      targetRecordId: product.id,
      submittedData: {
        name: catalogTitle(product),
        selectedVariant: selectedCatalogDetailVariant,
        variants: getCatalogVariantOptions(product),
        requestedField: "variant_or_price_subtype",
      },
      currentDataSnapshot: product,
      notes: "User reported that the card version, finish, printing, or price variant needs review.",
      source: "tidetradr-detail",
    });
  }

  function scrollCatalogDetailToMarketHistory() {
    if (typeof document === "undefined") return;
    document.getElementById("catalog-market-history")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeCatalogDetail() {
    setSelectedCatalogDetailId("");
  }

  function addCatalogDetailToVault(product = selectedCatalogDetailProduct) {
    if (!product) return;
    openProductAddFlow({
      product,
      source: "catalog-detail-vault",
      destinations: { vault: true },
      seed: {
        variant: selectedCatalogDetailVariant?.variantName || "",
        vault: { vaultStatus: product.catalogType === "sealed" ? "sealed" : "personal_collection" },
      },
    });
    closeCatalogDetail();
  }

  function addCatalogDetailToForge(product = selectedCatalogDetailProduct) {
    if (!product) return;
    openProductAddFlow({
      product,
      source: "catalog-detail-forge",
      destinations: { forge: true },
      seed: {
        variant: selectedCatalogDetailVariant?.variantName || "",
        forge: { conditionName: selectedCatalogDetailCondition || "" },
      },
    });
    closeCatalogDetail();
  }

  function addCatalogDetailToScoutSighting(product = selectedCatalogDetailProduct) {
    if (!product) return;
    closeCatalogDetail();
    openWhatDidISee(product);
  }

  function addCatalogDetailToWatchlist(product = selectedCatalogDetailProduct) {
    if (!product) return;
    openProductAddFlow({
      product,
      source: "catalog-detail-watchlist",
      destinations: { wishlist: true },
      seed: {
        variant: selectedCatalogDetailVariant?.variantName || "",
        wishlist: { ...BLANK_MULTI_DESTINATION_FORM.wishlist, addToMarketWatch: true },
      },
    });
    closeCatalogDetail();
  }

  function checkCatalogDetailDeal(product = selectedCatalogDetailProduct) {
    if (!product) return;
    useCatalogProductInDeal(product.id);
    closeCatalogDetail();
  }

  function addCatalogItemToForge(productId) {
    const product = typeof productId === "object"
      ? productId
      : catalogProducts.find((p) => String(p.id) === String(productId));
    if (!product) return;
    openProductAddFlow({ product, source: "catalog-forge", destinations: { forge: true } });
  }

  function currentCatalogProductGroup() {
    if (catalogKindFilter === "card") return "Cards";
    if (catalogKindFilter === "sealed") return "Sealed";
    if (catalogKindFilter === "other") return "Other";
    return "All";
  }

  function canRunCatalogSearch(query = catalogSearch, barcode = catalogBarcodeSearch) {
    return hasCatalogSearchCriteria({
      query,
      barcode,
      productGroup: currentCatalogProductGroup(),
      productType: catalogTypeFilter,
      setName: catalogSetFilter,
      dataFilter: catalogDataFilter,
      rarity: catalogRarityFilter,
    });
  }

  function closeCatalogSuggestions() {
    setCatalogSuggestionCloseSignal((current) => current + 1);
  }

  function updateCatalogSearchInput(value) {
    setCatalogSearch(value);
    setCatalogBarcodeSearch("");
    setSubmittedCatalogSearch("");
    setSubmittedCatalogBarcodeSearch("");
    if (!String(value || "").trim()) {
      closeCatalogSuggestions();
    }
    setCatalogSearchHasRun(false);
    setCatalogPagedResultIds([]);
    setSupabaseCatalogStatus((current) => ({
      ...current,
      loading: false,
      loadedCount: 0,
      page: 1,
      hasMore: false,
      message: "",
      error: "",
      exactMatchCount: 0,
      exactBarcodeMiss: false,
    }));
  }

  function clearCatalogSearch() {
    supabaseCatalogRequestId.current += 1;
    closeCatalogSuggestions();
    setCatalogSearch("");
    setSubmittedCatalogSearch("");
    setCatalogBarcodeSearch("");
    setSubmittedCatalogBarcodeSearch("");
    setCatalogKindFilter("All");
    setCatalogDataFilter("All");
    setCatalogSetFilter("All");
    setCatalogTypeFilter("All");
    setCatalogRarityFilter("All");
    setCatalogSearchHasRun(false);
    setCatalogPagedResultIds([]);
    setCatalogProducts((current) => current.filter((product) => product.sourceType !== "supabase"));
    setSupabaseCatalogStatus({
      loading: false,
      loadedCount: 0,
      page: 1,
      pageSize: catalogPageSize,
      totalCount: null,
      hasMore: false,
      message: "",
      error: "",
      exactMatchCount: 0,
      exactBarcodeMiss: false,
      usedFallback: false,
    });
  }

  function submitCatalogSearch(event) {
    event?.preventDefault?.();
    closeCatalogSuggestions();
    if (!canRunCatalogSearch(catalogSearch, catalogBarcodeSearch)) {
      setCatalogSearchHasRun(false);
      setSupabaseCatalogStatus((current) => ({
        ...current,
        loading: false,
        message: "Search by at least 2 characters, enter a barcode, or choose a filter before searching.",
        error: "",
      }));
      return;
    }
    const nextQuery = String(catalogSearch || "").trim();
    setSubmittedCatalogSearch(nextQuery);
    setSubmittedCatalogBarcodeSearch(catalogBarcodeSearch);
    loadImportedPokemonCatalog(nextQuery, { page: 1, mode: "general", barcode: catalogBarcodeSearch });
  }

  function submitCatalogBarcodeSearch(event) {
    event?.preventDefault?.();
    closeCatalogSuggestions();
    const value = catalogBarcodeSearch || catalogSearch;
    if (!String(value || "").trim()) {
      setSupabaseCatalogStatus((current) => ({
        ...current,
        loading: false,
        message: "Enter or scan a barcode, SKU, TCGplayer product ID, external ID, or card number first.",
        error: "",
      }));
      return;
    }
    setSubmittedCatalogSearch(value);
    setSubmittedCatalogBarcodeSearch(value);
    loadImportedPokemonCatalog(value, { page: 1, mode: "barcode", barcode: value });
  }

  function activeCatalogSearchPayload() {
    const query = submittedCatalogSearch || catalogSearch;
    const barcode = submittedCatalogBarcodeSearch || catalogBarcodeSearch;
    return {
      query,
      barcode,
      mode: barcode ? "barcode" : "general",
    };
  }

  async function goToCatalogPage(page) {
    const { query, barcode, mode } = activeCatalogSearchPayload();
    const targetPage = tideTradrCatalogPageCount ? clampPage(page, tideTradrCatalogPageCount) : Math.max(1, Number(page || 1));
    await loadImportedPokemonCatalog(query, {
      page: targetPage,
      pageSize: catalogPageSize,
      mode,
      barcode,
    });
    scrollToResultsTop(catalogResultsRef);
  }

  function updateCatalogPageSize(nextPageSize) {
    const pageSize = clampPageSize(nextPageSize, catalogPageSize);
    setCatalogPageSize(pageSize);
    setSupabaseCatalogStatus((current) => ({
      ...current,
      page: 1,
      pageSize,
    }));
  }

  function selectCatalogRecommendation(recommendation) {
    const value = recommendation.searchValue || recommendation.label || catalogSearch;
    setCatalogSearch(value);
    setSubmittedCatalogSearch("");
    setSubmittedCatalogBarcodeSearch("");
    setCatalogSearchHasRun(false);
    setCatalogPagedResultIds([]);
    if (recommendation.product?.id) {
      if (recommendation.mode === "barcode" || recommendation.mode === "id" || recommendation.mode === "cardNumber") {
        setCatalogBarcodeSearch(value);
      }
      openCatalogDetails(recommendation.product);
      setSupabaseCatalogStatus((current) => ({
        ...current,
        loading: false,
        loadedCount: 0,
        page: 1,
        hasMore: false,
        message: "Product details opened.",
        error: "",
        exactMatchCount: 0,
        exactBarcodeMiss: false,
      }));
      return;
    }
    if (recommendation.mode === "barcode" || recommendation.mode === "id" || recommendation.mode === "cardNumber") {
      setCatalogBarcodeSearch(value);
      setSubmittedCatalogSearch(value);
      setSubmittedCatalogBarcodeSearch(value);
      loadImportedPokemonCatalog(value, { page: 1, mode: "barcode", barcode: value });
      return;
    }
    setCatalogBarcodeSearch("");
    setSubmittedCatalogSearch(value);
    setSubmittedCatalogBarcodeSearch("");
    loadImportedPokemonCatalog(value, { page: 1, mode: recommendation.mode || "general", barcode: "" });
  }

  function selectVaultCatalogRecommendation(recommendation) {
    const value = recommendation.searchValue || recommendation.label || "";
    updateVaultForm("tideTradrSearch", value);
    if (recommendation.product?.id) {
      setCatalogProducts((current) => [
        recommendation.product,
        ...current.filter((product) => String(product.id) !== String(recommendation.product.id)),
      ]);
      applyCatalogProductToVault(recommendation.product);
    }
  }

  function updateCatalogImageMeta(productId, updates) {
    setCatalogProducts((current) =>
      current.map((product) =>
        String(product.id) === String(productId)
          ? { ...product, ...updates, imageLastUpdated: new Date().toISOString(), lastUpdated: new Date().toISOString() }
          : product
      )
    );
  }

  function renderCatalogMeta(product = {}) {
    const marketInfo = getTideTradrMarketInfo(product);
  if (product.catalogType === "card") {
    return (
      <>
          <p>{catalogExpansionName(product) || "Expansion unavailable"} • #{product.cardNumber || "No number"} • {product.rarity || "No rarity"}</p>
          <p>Market: {hasCatalogMarketPrice(product) ? money(marketInfo.currentMarketValue) : "Market data unavailable"}</p>
      </>
    );
  }
  return (
    <>
        <p>{product.productType || "Sealed product"} • {catalogExpansionName(product) || product.productLine || "Expansion unavailable"}</p>
        <p>MSRP: {marketInfo.msrp ? money(marketInfo.msrp) : "MSRP unavailable"} • Market: {hasCatalogMarketPrice(product) ? money(marketInfo.currentMarketValue) : "Market data unavailable"}</p>
    </>
  );
}

  function getSharedScoutData() {
    try {
      return sanitizeScoutLocalData(JSON.parse(localStorage.getItem(SCOUT_STORAGE_KEY) || "{}"));
    } catch {
      return {};
    }
  }

  function saveSharedScoutData(nextScout) {
    localStorage.setItem(SCOUT_STORAGE_KEY, JSON.stringify(nextScout));
    setScoutSnapshot((current) => ({ ...current, ...nextScout }));
  }

  function toggleScoutSection(key) {
    setScoutSectionsOpen((current) => ({ ...current, [key]: !current[key] }));
  }

  function deleteScoutReport(report) {
    const reportId = getScoutReportId(report);
    if (!reportId) return;
    const scoutData = getSharedScoutData();
    const nextReports = (scoutData.reports || scoutSnapshot.reports || []).filter((candidate) => getScoutReportId(candidate) !== reportId);
    saveSharedScoutData({ ...scoutData, reports: nextReports });
    setScoutReportDeleteTarget(null);
    setSelectedScoutReport(null);
    setScoutReportsPage(1);
    setVaultToast("Scout report deleted.");
  }

  function editScoutReport(report) {
    const reportId = getScoutReportId(report);
    setScoutSubTabTarget({
      tab: "reports",
      action: "editReport",
      reportId,
      storeId: report.storeId || report.store_id || "",
      id: Date.now(),
    });
    setScoutView("submit");
  }

  function renderScoutFilterControls() {
    return (
      <div className="scout-compact-filterbar">
        <label>
          <span>Filter</span>
          <select value={scoutReportFilter} onChange={(event) => {
            const filter = event.target.value;
            if (filter === "Nearby" && !requestScoutLocation()) return;
            setScoutReportFilter(filter);
          }}>
            {["Nearby", "Latest", "Verified", "My Reports", "Needs Review"].map((filter) => (
              <option key={filter} value={filter}>{filter}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select value={scoutReportSort} onChange={(event) => setScoutReportSort(event.target.value)}>
            {["Newest first", "Closest first", "Verified first"].map((sort) => (
              <option key={sort} value={sort}>{sort}</option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  function renderScoutReportCard(report, { compact = false } = {}) {
    const store = getScoutReportStore(report);
    const itemsSeen = normalizeScoutReportItems(report);
    const visibleItems = itemsSeen.slice(0, 3);
    const extraCount = Math.max(0, itemsSeen.length - visibleItems.length);
    const reportId = getScoutReportId(report);
    const storeName = store.name || store.nickname || report.storeName || report.store_name || "Store not selected";
    const retailer = store.chain || store.retailer || report.retailer || "Retailer not added";
    const area = [store.city || report.city, store.region || report.region].filter(Boolean).join(" / ");
    const statusLabel = scoutReportStatusLabel(report);
    const note = report.note || report.notes || report.reportText || report.report_text || "";
    const photo = report.imageUrl || report.image_url || report.photoUrl || report.photo_url || "";
    return (
      <article className="scout-report-compact-card" key={reportId || `${storeName}-${note}`}>
        <div className="scout-report-card-main">
          <div className="scout-report-title-row">
            <div>
              <h3>{storeName}</h3>
              <p>{retailer}{area ? ` | ${area}` : ""}</p>
            </div>
            <span className={`status-badge scout-report-status ${statusClass(statusLabel)}`}>{statusLabel}</span>
          </div>
          <div className="scout-report-meta">
            <span>{scoutReportDateTimeLabel(report)}</span>
            <span>Submitted by {isCurrentUserScoutReport(report) ? "You" : (report.displayName || report.reportedBy || report.reported_by || "Scout user")}</span>
          </div>
          <div className="scout-report-items">
            <strong>Items seen</strong>
            {visibleItems.length ? (
              visibleItems.map((item, index) => (
                <p key={`${item.productName}-${index}`}>
                  {item.productName}
                  {item.quantity ? ` - Qty ${item.quantity}` : " - Qty unknown"}
                  {Number(item.price || 0) > 0 ? ` - ${money(item.price)}` : ""}
                  {item.note ? ` - ${item.note}` : ""}
                </p>
              ))
            ) : (
              <p>No item details added</p>
            )}
            {extraCount ? <p className="compact-subtitle">+ {extraCount} more item{extraCount === 1 ? "" : "s"}</p> : null}
          </div>
          {!compact ? <p className="scout-report-notes">{note || "No notes/details added."}</p> : null}
        </div>
        <div className="scout-report-side">
          {photo ? <img src={photo} alt="" /> : <span>No photo attached</span>}
          <OverflowMenu
            actions={[
              { label: "View", onClick: () => setSelectedScoutReport(report) },
              { label: "Edit", onClick: () => editScoutReport(report) },
            ]}
            onDelete={() => setScoutReportDeleteTarget(report)}
          />
        </div>
      </article>
    );
  }

  function renderScoutAccordionSection({ id, title, summary, children, defaultOpen = false }) {
    const open = scoutSectionsOpen[id] ?? defaultOpen;
    return (
      <section className={`scout-accordion-section ${open ? "open" : ""}`}>
        <button type="button" className="scout-accordion-header" onClick={() => toggleScoutSection(id)} aria-expanded={open}>
          <span>
            <strong>{title}</strong>
            <small>{summary}</small>
          </span>
          <b>{open ? "Close" : "Open"}</b>
        </button>
        {open ? <div className="scout-accordion-body">{children}</div> : null}
      </section>
    );
  }

  function updateSuggestionStatus(suggestion, status, adminNote = "") {
    const reviewer = currentUserProfile?.email || currentUserProfile?.displayName || "local-beta-admin";
    const next = updateSuggestionRecord(suggestion.id, {
      status,
      adminNote,
      reviewedBy: reviewer,
      reviewedAt: new Date().toISOString(),
    });
    appendAdminReviewLog({
      action: status,
      suggestionId: suggestion.id,
      reviewedBy: reviewer,
      notes: adminNote,
    });
    setSuggestions(next);
  }

  function applyApprovedSuggestion(suggestion, mode = "Approved") {
    const submitted = suggestion.submittedData || {};
    const scoutData = getSharedScoutData();
    const stores = scoutData.stores || scoutSnapshot.stores || [];
    const now = new Date().toISOString();

    if (suggestion.targetTable === "stores") {
      let nextStores = stores;
      if (suggestion.suggestionType === SUGGESTION_TYPES.ADD_MISSING_STORE) {
        const approvedStore = {
          ...submitted,
          id: submitted.id || makeId("store"),
          isActive: true,
          userAdded: false,
          reviewStatus: "approved",
          sourceType: "approved_user_suggestion",
          source: submitted.source || "user-approved",
          lastUpdated: now,
        };
        const exists = nextStores.some((store) => String(store.id) === String(approvedStore.id));
        nextStores = exists
          ? nextStores.map((store) => (String(store.id) === String(approvedStore.id) ? { ...store, ...approvedStore } : store))
          : [approvedStore, ...nextStores];
      } else if (suggestion.targetRecordId) {
        nextStores = nextStores.map((store) =>
          String(store.id) === String(suggestion.targetRecordId)
            ? { ...store, ...submitted, lastUpdated: now }
            : store
        );
      }
      saveSharedScoutData({ ...scoutData, stores: nextStores });
    }

    if (suggestion.targetTable === "catalog_items" || suggestion.targetTable === "product_catalog") {
      if (suggestion.suggestionType === SUGGESTION_TYPES.ADD_MISSING_CATALOG_PRODUCT) {
        const approvedProduct = {
          ...submitted,
          id: submitted.id || makeId("catalog"),
          sourceType: "approved_user_suggestion",
          lastUpdated: now,
        };
        setCatalogProducts((current) =>
          current.some((product) => String(product.id) === String(approvedProduct.id))
            ? current.map((product) => (String(product.id) === String(approvedProduct.id) ? { ...product, ...approvedProduct } : product))
            : [approvedProduct, ...current]
        );
      } else if (suggestion.targetRecordId) {
        setCatalogProducts((current) =>
          current.map((product) =>
            String(product.id) === String(suggestion.targetRecordId)
              ? { ...product, ...submitted, lastUpdated: now }
              : product
          )
        );
      }
    }

    if (suggestion.targetTable === "product_identifiers" && suggestion.targetRecordId) {
      setCatalogProducts((current) =>
        current.map((product) => {
          if (String(product.id) !== String(suggestion.targetRecordId)) return product;
          const approvedIdentifiers = [
            ...(Array.isArray(product.identifiers) ? product.identifiers : []),
            submitted.upc ? { id: makeId("identifier"), identifierType: "UPC", identifierValue: submitted.upc, source: "approved_user_suggestion", confidence: "user_submitted" } : null,
            submitted.ean ? { id: makeId("identifier"), identifierType: "EAN", identifierValue: submitted.ean, source: "approved_user_suggestion", confidence: "user_submitted" } : null,
            submitted.gtin ? { id: makeId("identifier"), identifierType: "GTIN", identifierValue: submitted.gtin, source: "approved_user_suggestion", confidence: "user_submitted" } : null,
            submitted.retailerSku ? { id: makeId("identifier"), identifierType: "RETAILER_SKU", identifierValue: submitted.retailerSku, source: "approved_user_suggestion", confidence: "user_submitted" } : null,
            submitted.pokemonCenterSku ? { id: makeId("identifier"), identifierType: "POKEMON_CENTER_SKU", identifierValue: submitted.pokemonCenterSku, source: "approved_user_suggestion", confidence: "user_submitted" } : null,
          ].filter(Boolean);
          const seen = new Set();
          const identifiers = approvedIdentifiers.filter((identifier) => {
            const key = `${identifier.identifierType}|${identifier.identifierValue}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          return {
            ...product,
            identifiers,
            upc: submitted.upc || product.upc,
            barcode: submitted.upc || product.barcode,
            msrpPrice: submitted.msrpPrice || product.msrpPrice,
            msrpSource: submitted.msrpPrice ? "approved_user_suggestion" : product.msrpSource,
            updatedAt: now,
          };
        })
      );
    }

    if (suggestion.targetTable === "catalog_product_variants" && suggestion.targetRecordId) {
      setCatalogProducts((current) =>
        current.map((product) => {
          if (String(product.id) !== String(suggestion.targetRecordId)) return product;
          const submittedVariants = Array.isArray(submitted.variants) ? submitted.variants : [];
          const variantName = submitted.variantName || submitted.selectedVariant?.variantName || "";
          const variants = submittedVariants.length
            ? submittedVariants
            : variantName
              ? [
                  ...(Array.isArray(product.variants) ? product.variants : []),
                  {
                    id: makeId("variant"),
                    variantName,
                    finish: submitted.finish || "",
                    printing: submitted.printing || "",
                    language: submitted.language || "English",
                    conditionName: "",
                    source: "approved_user_suggestion",
                  },
                ]
              : product.variants || [];
          return { ...product, variants, variantNames: variants.map((variant) => variant.variantName).filter(Boolean).join(", "), updatedAt: now };
        })
      );
    }

    if (suggestion.targetTable === "product_market_price_current" && suggestion.targetRecordId) {
      setCatalogProducts((current) =>
        current.map((product) =>
          String(product.id) === String(suggestion.targetRecordId)
            ? {
                ...product,
                marketPrice: Number(submitted.marketPrice || submitted.currentMarketPrice || product.marketPrice || 0),
                lowPrice: Number(submitted.lowPrice || product.lowPrice || 0),
                midPrice: Number(submitted.midPrice || submitted.marketPrice || product.midPrice || 0),
                highPrice: Number(submitted.highPrice || product.highPrice || 0),
                marketSource: submitted.source || product.marketSource || "approved_user_suggestion",
                marketStatus: "manual",
                updatedAt: now,
              }
            : product
        )
      );
    }

    if (suggestion.targetTable === "retailer_products") {
      const nextResults = [
        {
          id: submitted.id || makeId("bestbuy-sku"),
          bestBuySku: submitted.bestBuySku || submitted.sku || "",
          productName: submitted.productName || submitted.name || "Best Buy product suggestion",
          sourceType: "approved_user_suggestion",
          sourceStatus: "manual",
          lastChecked: now,
          lastUpdated: now,
        },
        ...(scoutData.bestBuyStockResults || scoutSnapshot.bestBuyStockResults || []),
      ];
      saveSharedScoutData({ ...scoutData, bestBuyStockResults: nextResults });
    }

    if (suggestion.targetTable === "store_intelligence" && suggestion.targetRecordId) {
      const nextStores = stores.map((store) =>
        String(store.id) === String(suggestion.targetRecordId)
          ? {
              ...store,
              restockDays: submitted.restockDays ?? store.restockDays,
              restockWindow: submitted.restockWindow ?? store.restockWindow,
              purchaseLimits: submitted.purchaseLimits ?? store.purchaseLimits,
              stockNotes: submitted.stockNotes ?? store.stockNotes,
              userTips: submitted.userTips ?? store.userTips,
              lastUpdated: now,
            }
          : store
      );
      saveSharedScoutData({ ...scoutData, stores: nextStores });
    }

    const nextProfile = {
      ...(scoutData.scoutProfile || scoutSnapshot.scoutProfile || {}),
      rewardPoints: Number((scoutData.scoutProfile || scoutSnapshot.scoutProfile || {}).rewardPoints || 0) + 5,
      approvedSuggestions: Number((scoutData.scoutProfile || scoutSnapshot.scoutProfile || {}).approvedSuggestions || 0) + 1,
    };
    saveSharedScoutData({ ...getSharedScoutData(), scoutProfile: nextProfile });
    updateSuggestionStatus(suggestion, mode, mode === "Merged" ? "Merged into shared data." : "Approved by admin.");
    setVaultToast(mode === "Merged" ? "Suggestion merged into shared data." : "Suggestion approved and applied.");
  }

  function reviewSuggestion(suggestion, action) {
    if (!canReviewSharedData) {
      setVaultToast("Admin role required to review shared data suggestions.");
      return;
    }
    if (!BETA_LOCAL_MODE && suggestion.userId === getSuggestionUserInfo().userId) {
      setVaultToast("Users cannot approve their own shared data suggestions.");
      return;
    }
    if (action === "approve") {
      applyApprovedSuggestion(suggestion, "Approved");
      return;
    }
    if (action === "merge") {
      applyApprovedSuggestion(suggestion, "Merged");
      return;
    }
    if (action === "reject") {
      updateSuggestionStatus(suggestion, "Rejected", "Rejected by admin.");
      setVaultToast("Suggestion rejected.");
      return;
    }
    if (action === "moreInfo") {
      updateSuggestionStatus(suggestion, "Needs More Info", "More details or proof are needed.");
      setVaultToast("Suggestion marked as needing more info.");
      return;
    }
    if (action === "duplicate") {
      updateSuggestionStatus(suggestion, "Merged", "Marked as a duplicate of an existing shared item.");
      setVaultToast("Suggestion marked duplicate.");
    }
  }

  function renderSuggestionPreview(value) {
    if (!value || typeof value !== "object") return <p className="compact-subtitle">No data attached.</p>;
    const rows = Object.entries(value)
      .filter(([, rowValue]) => rowValue !== undefined && rowValue !== null && String(rowValue).trim() !== "")
      .slice(0, 8);
    return (
      <dl className="suggestion-preview-list">
        {rows.map(([key, rowValue]) => (
          <div key={key}>
            <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
            <dd>{String(rowValue)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  function renderSuggestionCard(suggestion, adminMode = false) {
    return (
      <article className="suggestion-card compact-card" key={suggestion.id}>
        <div className="compact-card-header">
          <div>
            <span className="status-badge">{SUGGESTION_TYPE_LABELS[suggestion.suggestionType] || suggestion.suggestionType}</span>
            <h3>{suggestionTitle(suggestion)}</h3>
            <p>{suggestion.displayName || "Beta User"} - {new Date(suggestion.createdAt).toLocaleString()}</p>
          </div>
          <span className={`status-badge suggestion-status-${String(suggestion.status).toLowerCase().replaceAll(" ", "-")}`}>{suggestion.status}</span>
        </div>
        <div className="suggestion-two-column">
          <div>
            <h4>Suggested change</h4>
            {renderSuggestionPreview(suggestion.submittedData)}
          </div>
          {adminMode && suggestion.currentDataSnapshot ? (
            <div>
              <h4>Current shared record</h4>
              {renderSuggestionPreview(suggestion.currentDataSnapshot)}
            </div>
          ) : null}
        </div>
        {suggestion.notes ? <p className="compact-subtitle">Notes: {suggestion.notes}</p> : null}
        {suggestion.adminNote ? <p className="compact-subtitle">Admin note: {suggestion.adminNote}</p> : null}
        {adminMode ? (
          <div className="quick-actions suggestion-actions">
            <button type="button" onClick={() => reviewSuggestion(suggestion, "approve")}>Approve</button>
            <button type="button" className="secondary-button" onClick={() => reviewSuggestion(suggestion, "reject")}>Reject</button>
            <button type="button" className="secondary-button" onClick={() => reviewSuggestion(suggestion, "moreInfo")}>Request More Info</button>
            <button type="button" className="secondary-button" onClick={() => reviewSuggestion(suggestion, "merge")}>Merge</button>
            <button type="button" className="secondary-button" onClick={() => reviewSuggestion(suggestion, "duplicate")}>Mark Duplicate</button>
          </div>
        ) : null}
      </article>
    );
  }

  function renderMySuggestionsPage() {
    const userId = getSuggestionUserInfo().userId;
    const ownSuggestions = suggestions.filter((suggestion) => suggestion.userId === userId || BETA_LOCAL_MODE);
    const visibleSuggestions = mySuggestionFilter === "All"
      ? ownSuggestions
      : ownSuggestions.filter((suggestion) => suggestion.status === mySuggestionFilter);
    const pagedSuggestions = getPagedItems(visibleSuggestions, mySuggestionPage, LONG_LIST_PAGE_SIZE);
    return (
      <>
      <PageHeader
        className={getHeaderCardClass("panel suggestions-page-header")}
        title="My Suggestions"
        subtitle="Universal store, catalog, SKU, and Scout data suggestions you submitted for admin approval."
        actions={<button type="button" className="secondary-button" onClick={() => setActiveTab("dashboard")}>Back to Home</button>}
        tabs={["All", ...SUGGESTION_STATUSES].map((status) => ({ key: status, label: status }))}
        activeTab={mySuggestionFilter}
        onTabChange={setMySuggestionFilter}
      />
      <section className="panel approval-page">
        <div className="inventory-list compact-inventory-list">
          {visibleSuggestions.length ? pagedSuggestions.items.map((suggestion) => renderSuggestionCard(suggestion, false)) : (
            <div className="empty-state">
              <h3>No suggestions here yet</h3>
              <p>Use Suggest Missing Store, Suggest Correction, or Suggest UPC/SKU from Scout and TideTradr.</p>
            </div>
          )}
        </div>
        <PaginationControls
          label="Suggestions"
          page={pagedSuggestions.page}
          pageCount={pagedSuggestions.pageCount}
          totalCount={pagedSuggestions.total}
          pageSize={LONG_LIST_PAGE_SIZE}
          onPageChange={(page) => {
            setMySuggestionPage(page);
            scrollToResultsTop();
          }}
          compact
        />
      </section>
      </>
    );
  }

  function renderMarketSourceControls() {
    if (!adminToolsVisible) return null;
    return (
      <section className="settings-subsection marketplace-admin-review">
        <div className="compact-card-header">
          <div>
            <h3>Market Source Controls</h3>
            <p>Admin-only source status, sync actions, manual values, and market to-do items.</p>
          </div>
          <span className="status-badge">Admin only</span>
        </div>
        <div className="small-empty-state admin-only-note">
          <strong>Admin only.</strong>
          <span>Source credentials stay server-side; review import status before publishing shared market data.</span>
        </div>
        <div className="cards mini-cards">
          <div className="card"><p>Catalog Products</p><h2>{supabaseCatalogStatus.totalCount ?? catalogProducts.length}</h2></div>
          <div className="card"><p>Found Market Values</p><h2>{catalogMarketPriceCount}</h2></div>
          <div className="card"><p>Missing Market Prices</p><h2>{missingMarketPriceItems.length}</h2></div>
          <div className="card"><p>Needs Market Check</p><h2>{needsMarketCheckItems.length}</h2></div>
          <div className="card"><p>Cached Price Records</p><h2>{cachedMarketPriceCount}</h2></div>
          <div className="card"><p>Failed Matches</p><h2>{failedMarketMatches.length}</h2></div>
          <div className="card"><p>Last Sync</p><h2>{lastMarketSync === "Not synced yet" ? "None" : new Date(lastMarketSync).toLocaleDateString()}</h2></div>
          <div className="card"><p>Live API</p><h2>Unavailable</h2></div>
        </div>
        <p className="compact-subtitle">Market values are labeled Live, Cached, Manual, Estimated, or Unknown. Beta sync uses local/import-ready data unless a backend source is connected.</p>
        {marketSyncMessage ? <p className="compact-subtitle">{marketSyncMessage}</p> : null}
        <div className="quick-actions">
          <button type="button" onClick={() => refreshMarketCatalog("card")}>Sync Cards</button>
          <button type="button" className="secondary-button" onClick={() => refreshMarketCatalog("sealed")}>Sync Sealed Products</button>
          <button type="button" className="secondary-button" onClick={refreshMarketWatchlist}>Refresh Watchlist</button>
          <button type="button" className="secondary-button" onClick={refreshPinnedMarketWatch}>Refresh Pinned Market Watch</button>
        </div>
        <details className="scout-score-guidelines">
          <summary>Manual Price Entry</summary>
          <form className="form market-price-form" onSubmit={saveManualMarketPrice}>
            <Field label="Catalog Item">
              <select value={manualMarketForm.catalogItemId} onChange={(event) => setManualMarketForm((current) => ({ ...current, catalogItemId: event.target.value }))}>
                <option value="">Choose item</option>
                {catalogProducts.map((product) => (
                  <option key={product.id} value={product.id}>{catalogTitle(product)}</option>
                ))}
              </select>
            </Field>
            <Field label="Market Price">
              <input type="number" step="0.01" value={manualMarketForm.marketPrice} onChange={(event) => setManualMarketForm((current) => ({ ...current, marketPrice: event.target.value }))} placeholder="Manual market value" />
            </Field>
            <Field label="Low / Mid / High">
              <div className="inline-input-grid">
                <input type="number" step="0.01" value={manualMarketForm.lowPrice} onChange={(event) => setManualMarketForm((current) => ({ ...current, lowPrice: event.target.value }))} placeholder="Low" />
                <input type="number" step="0.01" value={manualMarketForm.midPrice} onChange={(event) => setManualMarketForm((current) => ({ ...current, midPrice: event.target.value }))} placeholder="Mid" />
                <input type="number" step="0.01" value={manualMarketForm.highPrice} onChange={(event) => setManualMarketForm((current) => ({ ...current, highPrice: event.target.value }))} placeholder="High" />
              </div>
            </Field>
            <button type="submit">Save Manual Price</button>
          </form>
        </details>
        <details className="scout-score-guidelines">
          <summary>Market To-Do</summary>
          {needsMarketCheckItems.length || missingMarketPriceItems.length || missingMsrpItems.length ? (
            <>
              <ActionReport title="Needs Market Check" items={needsMarketCheckItems} button="Update Market" action={startEditingItem} />
              <ActionReport title="Missing Market Price" items={missingMarketPriceItems} button="Add Market Price" action={startEditingItem} />
              <ActionReport title="Missing MSRP" items={missingMsrpItems} button="Add MSRP" action={startEditingItem} />
            </>
          ) : (
            <div className="empty-state">
              <h3>No items need review</h3>
              <p>Market to-do items will appear here when catalog prices or MSRP fields need attention.</p>
            </div>
          )}
        </details>
        <div className="market-source-list">
          {MARKET_SOURCES.map((source) => (
            <div className="market-source-row" key={source.key}>
              <strong>{source.label}</strong>
              <span>{source.status}</span>
              <p>{source.notes}</p>
            </div>
          ))}
        </div>
          <p className="compact-subtitle">Protected provider credentials are handled server-side. Some live source connectors may remain unavailable during private beta.</p>
      </section>
    );
  }

  function renderAdminReviewPage() {
    if (!canReviewSharedData) {
      return (
        <PageHeader
          className={getHeaderCardClass("panel admin-page-header")}
          title="Admin Review"
          subtitle="Admin role is required to approve shared data suggestions. Local beta users can submit suggestions, but cannot publish shared data directly."
          actions={<button type="button" className="secondary-button" onClick={() => setActiveTab("dashboard")}>Back to Home</button>}
        />
      );
    }
    const sections = ["All", ...Object.values(REVIEW_SECTION_LABELS), "Marketplace Listings", "Market Source Controls"];
    const visibleSuggestions = suggestions.filter((suggestion) => {
      if (adminReviewFilter === "All") return true;
      return REVIEW_SECTION_LABELS[getSuggestionReviewSection(suggestion)] === adminReviewFilter;
    });
    const openCount = suggestions.filter((suggestion) => ["Submitted", "Under Review", "Needs More Info"].includes(suggestion.status)).length;
    const listingReviewItems = marketplaceListings.filter((listing) => ["Pending Review", "Flagged"].includes(listing.status));
    const totalOpenCount = openCount + listingReviewItems.length;
    const pagedVisibleSuggestions = getPagedItems(visibleSuggestions, adminReviewPage, LONG_LIST_PAGE_SIZE);
    const pagedListingReviewItems = getPagedItems(listingReviewItems, marketplaceReviewPage, LONG_LIST_PAGE_SIZE);
    return (
      <>
      <PageHeader
        className={getHeaderCardClass("panel admin-page-header")}
        title="Admin Tools"
        subtitle="Import status, shared-data review, Marketplace moderation, and beta data controls in one place."
        actions={<span className="status-badge">{totalOpenCount} open</span>}
        summary={(
          <div className="settings-header-summary">
            <span>{adminReviewIdentityLabel}</span>
            <span>{currentUserProfile?.source || "admin"}</span>
          </div>
        )}
        tabs={sections.map((section) => ({ key: section, label: section }))}
        activeTab={adminReviewFilter}
        onTabChange={setAdminReviewFilter}
      />
      <section className="panel approval-page">
        <div className="drawer-info-card">
          <strong>{adminReviewIdentityLabel}</strong>
          <p className="compact-subtitle">{adminReviewIdentityDetail}</p>
          {currentUserProfile?.source ? <span className="status-badge">{currentUserProfile.source}</span> : null}
        </div>
        <section className="settings-subsection marketplace-admin-review">
          <div className="compact-card-header">
            <div>
              <h3>Pokemon Import Dashboard</h3>
              <p>Supabase-backed catalog, market price, image, and Virginia retailer ingestion status.</p>
            </div>
            <button type="button" className="secondary-button" onClick={loadSupabaseImportStatus}>
              {supabaseImportStatus.loading ? "Refreshing..." : "Refresh Status"}
            </button>
          </div>
          <div className="cards mini-cards">
            <div className="card"><p>Total Pokemon Products</p><h2>{supabaseImportStatus.totalPokemonProducts ?? "N/A"}</h2></div>
            <div className="card"><p>Sealed Products</p><h2>{supabaseImportStatus.sealedProducts ?? "N/A"}</h2></div>
            <div className="card"><p>Card Products</p><h2>{supabaseImportStatus.cards ?? "N/A"}</h2></div>
            <div className="card"><p>VA Stores</p><h2>{supabaseImportStatus.vaStores ?? "N/A"}</h2></div>
            <div className="card"><p>Market Price Rows</p><h2>{supabaseImportStatus.marketPriceRows ?? "N/A"}</h2></div>
            <div className="card"><p>Price History Rows</p><h2>{supabaseImportStatus.priceHistoryRows ?? "N/A"}</h2></div>
            <div className="card"><p>Products With History</p><h2>{supabaseImportStatus.productsWithHistory ?? "N/A"}</h2></div>
            <div className="card"><p>Latest History Snapshot</p><h2>{supabaseImportStatus.latestHistorySnapshot ? new Date(supabaseImportStatus.latestHistorySnapshot).toLocaleString() : "N/A"}</h2></div>
            <div className="card"><p>Current Price No History</p><h2>{supabaseImportStatus.currentPriceWithoutHistory ?? "N/A"}</h2></div>
            <div className="card"><p>Latest Last Price Checked</p><h2>{supabaseImportStatus.lastPriceChecked ? new Date(supabaseImportStatus.lastPriceChecked).toLocaleString() : "N/A"}</h2></div>
            <div className="card"><p>Products Missing Images</p><h2>{supabaseImportStatus.productsMissingImages ?? "N/A"}</h2></div>
            <div className="card"><p>Products Missing Market Price</p><h2>{supabaseImportStatus.productsMissingMarketPrices ?? "N/A"}</h2></div>
          </div>
          <p className="compact-subtitle">Market history import status is shown when the admin status table is available.</p>
          {supabaseImportStatus.errors.length ? (
            <div className="empty-state">
              <h3>Import status notes</h3>
              {supabaseImportStatus.errors.map((error) => {
                const safeError = /schema cache|could not find the table|service role/i.test(String(error || ""))
                  ? "Market history import status unavailable."
                  : error;
                return <p key={error}>{safeError}</p>;
              })}
            </div>
          ) : supabaseImportStatus.totalPokemonProducts === 0 && Number(supabaseImportStatus.marketPriceRows || 0) > 0 ? (
            <div className="empty-state">
              <h3>Catalog rows may be hidden by RLS</h3>
              <p>Market prices and stores are visible, but shared catalog rows are unavailable to the current client role. Check admin database access before expanding beta traffic.</p>
            </div>
          ) : (
            <p className="compact-subtitle">No import status errors reported by the current client. Protected imports remain server-side.</p>
          )}
        </section>
        <div className="cards mini-cards">
          {Object.entries(REVIEW_SECTION_LABELS).map(([key, label]) => (
            <button type="button" className="card suggestion-section-card" key={key} onClick={() => setAdminReviewFilter(label)}>
              <p>{label}</p>
              <h2>{suggestions.filter((suggestion) => getSuggestionReviewSection(suggestion) === key).length}</h2>
            </button>
          ))}
          <button type="button" className="card suggestion-section-card" onClick={() => setAdminReviewFilter("Marketplace Listings")}>
            <p>Marketplace Listings</p>
            <h2>{listingReviewItems.length}</h2>
          </button>
          {adminToolsVisible ? (
            <button type="button" className="card suggestion-section-card" onClick={() => setAdminReviewFilter("Market Source Controls")}>
              <p>Market Source Controls</p>
              <h2>{cachedMarketPriceCount}</h2>
            </button>
          ) : null}
        </div>
        {adminReviewFilter !== "Marketplace Listings" && adminReviewFilter !== "Market Source Controls" ? (
        <div className="inventory-list compact-inventory-list">
          {visibleSuggestions.length ? pagedVisibleSuggestions.items.map((suggestion) => renderSuggestionCard(suggestion, true)) : (
            <div className="empty-state">
              <h3>No review items</h3>
              <p>No suggestions here yet. Suggestions from stores, catalog items, UPC/SKU, market values, and corrections will appear here.</p>
            </div>
          )}
          <PaginationControls
            label="Review Items"
            page={pagedVisibleSuggestions.page}
            pageCount={pagedVisibleSuggestions.pageCount}
            totalCount={pagedVisibleSuggestions.total}
            pageSize={LONG_LIST_PAGE_SIZE}
            onPageChange={(page) => {
              setAdminReviewPage(page);
              scrollToResultsTop();
            }}
            compact
          />
        </div>
        ) : null}
        {(adminReviewFilter === "All" || adminReviewFilter === "Marketplace Listings") ? (
          <section className="settings-subsection marketplace-admin-review">
            <div className="compact-card-header">
              <div>
                <h3>Marketplace Listing Review</h3>
                <p>Approve public listings, reject unsafe listings, remove flagged listings, or mark strong listings as featured.</p>
              </div>
              <span className="status-badge">{listingReviewItems.length} listings</span>
            </div>
            <div className="inventory-list compact-inventory-list">
              {listingReviewItems.length ? pagedListingReviewItems.items.map((listing) => renderMarketplaceListingCard(listing, true)) : (
                <div className="empty-state">
                  <h3>No marketplace listings need review</h3>
                  <p>Submitted or flagged listings will appear here.</p>
                </div>
              )}
              <PaginationControls
                label="Listings"
                page={pagedListingReviewItems.page}
                pageCount={pagedListingReviewItems.pageCount}
                totalCount={pagedListingReviewItems.total}
                pageSize={LONG_LIST_PAGE_SIZE}
                onPageChange={(page) => {
                  setMarketplaceReviewPage(page);
                  scrollToResultsTop();
                }}
                compact
              />
            </div>
          </section>
        ) : null}
        {(adminReviewFilter === "All" || adminReviewFilter === "Market Source Controls") ? renderMarketSourceControls() : null}
      </section>
      </>
    );
  }

  function updateMarketplaceForm(field, value) {
    setMarketplaceForm((current) => ({ ...current, [field]: value }));
  }

  function listingFromSource(sourceType = "manual", source = {}) {
    const catalogProduct = sourceType === "catalog" ? source : catalogProducts.find((product) => String(product.id) === String(source.catalogProductId));
    const marketInfo = catalogProduct ? getTideTradrMarketInfo(catalogProduct) : {};
    const title =
      sourceType === "catalog"
        ? catalogTitle(source)
        : source.name || source.itemName || source.productName || source.title || "";
    return {
      ...BLANK_MARKETPLACE_FORM,
      title,
      description: source.notes || source.actionNotes || "",
      category: source.category || "Pokemon",
      productType: source.productType || catalogProduct?.productType || "",
      setName: source.expansion || source.setName || catalogProduct?.setName || catalogProduct?.expansion || "",
      condition: source.condition || source.sealedCondition || "Unknown",
      quantity: Number(source.quantity || 1),
      askingPrice: source.salePrice || source.plannedSalePrice || source.plannedSellingPrice || "",
      tradeValue: source.marketPrice || marketInfo.currentMarketValue || "",
      locationCity: locationSettings.manualLocation || "",
      locationState: "VA",
      photos: [source.itemImage || source.imageUrl || catalogImage(catalogProduct || source)].filter(Boolean),
      photoUrl: source.itemImage || source.imageUrl || catalogImage(catalogProduct || source) || "",
      catalogItemId: sourceType === "catalog" ? source.id : source.catalogProductId || catalogProduct?.id || "",
      upc: source.barcode || source.upc || catalogProduct?.barcode || catalogProduct?.upc || "",
      sku: source.sku || catalogProduct?.sku || "",
      sourceType,
      sourceItemId: source.id || "",
      sellerNotes: source.sourceLocation === "vault" ? "Copied from Vault." : "",
    };
  }

  function openMarketplaceCreate(sourceType = "manual", source = {}) {
    setMarketplaceSourcePicker(sourceType);
    setMarketplaceForm(listingFromSource(sourceType, source));
    setListingReviewOpen(false);
    openFlowModal("createListing", { size: "large", source: sourceType });
    setVaultToast("Marketplace listing draft ready. Review before submitting.");
  }

  function openVaultMarketplaceDecision(item) {
    setVaultListingDecision(item);
  }

  function handleVaultMarketplaceDecision(action) {
    if (!vaultListingDecision) return;
    const item = vaultListingDecision;
    setVaultListingDecision(null);
    if (action === "cancel") return;
    openMarketplaceCreate("vault", item);
    if (action === "move") {
      openVaultForgeTransfer(item, "move");
      setVaultToast("Listing draft created. Confirm the Forge move separately when you are ready.");
    }
  }

  function marketplaceFormReady() {
    return marketplaceForm.title.trim() && Number(marketplaceForm.quantity || 0) >= 1;
  }

  function buildMarketplaceListing(status = "Draft") {
    const now = new Date().toISOString();
    const photos = marketplaceForm.photoUrl
      ? [marketplaceForm.photoUrl, ...(marketplaceForm.photos || []).filter((photo) => photo !== marketplaceForm.photoUrl)]
      : marketplaceForm.photos || [];
    return {
      id: marketplaceForm.id || makeId("listing"),
      sellerUserId: currentUserProfile.userId || user?.id || "local-beta",
      sellerDisplayName: currentUserProfile.displayName || user?.email || "Local Seller",
      listingType: marketplaceForm.listingType,
      title: marketplaceForm.title.trim(),
      description: marketplaceForm.description,
      category: marketplaceForm.category,
      productType: marketplaceForm.productType,
      setName: marketplaceForm.setName,
      condition: marketplaceForm.condition,
      quantity: Number(marketplaceForm.quantity || 1),
      askingPrice: Number(marketplaceForm.askingPrice || 0),
      tradeValue: Number(marketplaceForm.tradeValue || 0),
      locationCity: marketplaceForm.locationCity,
      locationState: marketplaceForm.locationState || "VA",
      pickupOnly: Boolean(marketplaceForm.pickupOnly),
      shippingAvailable: Boolean(marketplaceForm.shippingAvailable),
      photos,
      catalogItemId: marketplaceForm.catalogItemId,
      upc: marketplaceForm.upc,
      sku: marketplaceForm.sku,
      intendedForKids: Boolean(marketplaceForm.intendedForKids || marketplaceForm.listingType === "Kid-friendly deal"),
      contactPreference: marketplaceForm.contactPreference || "Request contact",
      sellerNotes: marketplaceForm.sellerNotes || "",
      tags: marketplaceForm.tags || "",
      sourceType: marketplaceForm.sourceType || "manual",
      sourceItemId: marketplaceForm.sourceItemId || "",
      status,
      featured: Boolean(marketplaceForm.featured),
      reportCount: 0,
      createdAt: marketplaceForm.createdAt || now,
      updatedAt: now,
    };
  }

  function saveMarketplaceListing(status = "Draft") {
    if (!marketplaceFormReady()) {
      setVaultToast(!marketplaceForm.title.trim() ? "Listing title is required." : "Quantity must be at least 1.");
      return;
    }
    const finalStatus = status === "Submit" ? "Pending Review" : status;
    const listing = buildMarketplaceListing(finalStatus);
    setMarketplaceListings((current) =>
      current.some((item) => item.id === listing.id)
        ? current.map((item) => (item.id === listing.id ? listing : item))
        : [listing, ...current]
    );
    setMarketplaceForm(BLANK_MARKETPLACE_FORM);
    setListingReviewOpen(false);
    setMarketplaceSourcePicker("manual");
    setMarketplaceView("my");
    if (activeFlowModal?.type === "createListing") closeFlowModal({ force: true, reset: false });
    setVaultToast(finalStatus === "Draft" ? "Listing draft saved." : "Listing submitted for review.");
  }

  function updateMarketplaceListing(listingId, updates = {}) {
    setMarketplaceListings((current) =>
      current.map((listing) =>
        listing.id === listingId ? { ...listing, ...updates, updatedAt: new Date().toISOString() } : listing
      )
    );
  }

  function editMarketplaceListing(listing = {}) {
    setMarketplaceForm({
      ...BLANK_MARKETPLACE_FORM,
      ...listing,
      photoUrl: listing.photos?.[0] || listing.photoUrl || "",
      photos: Array.isArray(listing.photos) ? listing.photos : [],
    });
    setMarketplaceSourcePicker(listing.sourceType || "manual");
    setListingReviewOpen(false);
    setSelectedListingId("");
    openFlowModal("createListing", { size: "large", source: "edit" });
    setVaultToast("Listing opened for editing.");
  }

  function approveMarketplaceListing(listingId) {
    updateMarketplaceListing(listingId, { status: "Active", reviewedBy: currentUserProfile.email || "local-beta-admin", reviewedAt: new Date().toISOString() });
    setVaultToast("Marketplace listing approved.");
  }

  function rejectMarketplaceListing(listingId) {
    updateMarketplaceListing(listingId, { status: "Removed", reviewedBy: currentUserProfile.email || "local-beta-admin", reviewedAt: new Date().toISOString() });
    setVaultToast("Marketplace listing rejected/removed.");
  }

  function reportMarketplaceListing(event) {
    event.preventDefault();
    if (!listingReportTarget) return;
    const report = {
      id: makeId("listing-report"),
      listingId: listingReportTarget.id,
      reason: listingReportReason,
      reportedBy: currentUserProfile.userId || "local-beta",
      createdAt: new Date().toISOString(),
      status: "Open",
    };
    setMarketplaceReports((current) => [report, ...current]);
    updateMarketplaceListing(listingReportTarget.id, {
      status: "Flagged",
      reportCount: Number(listingReportTarget.reportCount || 0) + 1,
    });
    setListingReportTarget(null);
    setListingReportReason("Wrong item");
    setVaultToast("Listing reported for admin review.");
  }

  function toggleSavedListing(listingId) {
    setMarketplaceSavedIds((current) =>
      current.includes(listingId) ? current.filter((id) => id !== listingId) : [listingId, ...current]
    );
  }

  function getListingMarketReference(listing = {}) {
    const product = catalogProducts.find((item) => String(item.id) === String(listing.catalogItemId));
    return product ? getTideTradrMarketInfo(product) : { currentMarketValue: Number(listing.tradeValue || 0), msrp: 0 };
  }

  function renderMarketplaceListingCard(listing, adminMode = false) {
    const marketInfo = getListingMarketReference(listing);
    const percentOfMarket = marketInfo.currentMarketValue > 0 ? (Number(listing.askingPrice || 0) / marketInfo.currentMarketValue) * 100 : 0;
    return (
      <article className="marketplace-listing-card compact-card" key={listing.id}>
        <div className="marketplace-listing-row">
          {listing.photos?.[0] ? <img className="marketplace-thumb" src={listing.photos[0]} alt="" /> : <div className="marketplace-thumb placeholder">No photo</div>}
          <div>
            <div className="marketplace-badges">
              <span className="status-badge">{listing.listingType}</span>
              <span className="status-badge">{listing.status}</span>
              {listing.intendedForKids ? <span className="status-badge">Kid-Friendly</span> : null}
            </div>
            <h3>{listing.title}</h3>
            <p className="compact-subtitle">{listing.condition || "Unknown condition"} | {listing.locationCity || "Local"} {listing.locationState || ""}</p>
            <p><strong>{listing.listingType === "For Trade" ? "Trade value" : "Asking price"}:</strong> {money(listing.listingType === "For Trade" ? listing.tradeValue : listing.askingPrice)}</p>
            {marketInfo.currentMarketValue ? <p className="compact-subtitle">Market reference: {money(marketInfo.currentMarketValue)} {percentOfMarket ? `| ${percentOfMarket.toFixed(0)}% of market` : ""}</p> : null}
          </div>
        </div>
        <div className="quick-actions">
          <button type="button" onClick={() => setSelectedListingId(listing.id)}>View</button>
          <button type="button" className="secondary-button" onClick={() => toggleSavedListing(listing.id)}>{marketplaceSavedIds.includes(listing.id) ? "Saved" : "Save"}</button>
          <button type="button" className="secondary-button" onClick={() => setListingReportTarget(listing)}>Report</button>
          {listing.sellerUserId === (currentUserProfile.userId || user?.id) || adminUser ? (
            <button type="button" className="secondary-button" onClick={() => updateMarketplaceListing(listing.id, { status: "Sold" })}>Mark Sold</button>
          ) : null}
          {adminMode ? (
            <>
              <button type="button" className="secondary-button" onClick={() => approveMarketplaceListing(listing.id)}>Approve</button>
              <button type="button" className="secondary-button" onClick={() => rejectMarketplaceListing(listing.id)}>Reject</button>
              <button type="button" className="secondary-button" onClick={() => updateMarketplaceListing(listing.id, { status: "Removed" })}>Remove</button>
              <button type="button" className="secondary-button" onClick={() => updateMarketplaceListing(listing.id, { status: "Flagged" })}>Flag</button>
              <button type="button" className="secondary-button" onClick={() => updateMarketplaceListing(listing.id, { featured: true })}>Feature</button>
            </>
          ) : null}
        </div>
      </article>
    );
  }

  function renderMarketplaceSection() {
    const normalizedSearch = marketplaceSearch.trim().toLowerCase();
    const currentSellerId = currentUserProfile.userId || user?.id;
    const publicListings = marketplaceListings.filter((listing) => listing.status === "Active");
    const myListings = marketplaceListings.filter((listing) => listing.sellerUserId === currentSellerId);
    const draftListings = myListings.filter((listing) => listing.status === "Draft");
    const pendingReviewListings = marketplaceListings.filter((listing) =>
      listing.status === "Pending Review" && (listing.sellerUserId === currentSellerId || canReviewSharedData)
    );
    const visibleMarketplaceListings = marketplaceListings.filter((listing) =>
      listing.status === "Active" || listing.sellerUserId === currentSellerId || canReviewSharedData
    );
    const filteredListings = visibleMarketplaceListings.filter((listing) => {
      const matchesStatus =
        marketplaceStatusFilter === "All"
          ? true
          : marketplaceStatusFilter === "Active"
            ? listing.status === "Active"
            : listing.status === marketplaceStatusFilter;
      const matchesType = marketplaceTypeFilter === "All" || listing.listingType === marketplaceTypeFilter;
      const matchesSearch = !normalizedSearch || [listing.title, listing.description, listing.productType, listing.setName, listing.upc, listing.sku, listing.locationCity]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      return matchesStatus && matchesType && matchesSearch;
    });
    const savedListings = visibleMarketplaceListings.filter((listing) => marketplaceSavedIds.includes(listing.id));
    const marketplacePanelTitle =
      marketplaceView === "my" ? "My Listings" :
      marketplaceView === "saved" ? "Saved Listings" :
      marketplaceView === "drafts" ? "Drafts" :
      marketplaceView === "pending" ? "Pending Review" :
      "Browse Listings";
    const marketplacePanelDescription =
      marketplaceView === "my" ? "Drafts, pending review, and active listings you created." :
      marketplaceView === "saved" ? "Listings you saved for later." :
      marketplaceView === "drafts" ? "Listing drafts that have not been submitted yet." :
      marketplaceView === "pending" ? "Listings waiting for admin review before becoming public." :
      "Approved community listings only. Pending listings stay private to seller/admin.";
    const panelListings =
      marketplaceView === "my" ? myListings :
      marketplaceView === "saved" ? savedListings :
      marketplaceView === "drafts" ? draftListings :
      marketplaceView === "pending" ? pendingReviewListings :
      filteredListings;
    const selectedListing = marketplaceListings.find((listing) => listing.id === selectedListingId);
    const reviewListing = buildMarketplaceListing("Pending Review");

    return (
      <div className="marketplace-section">
        <div className="marketplace-beta-note">
          <strong>Marketplace is in beta.</strong>
          <span>Payments and shipping are not handled by the app yet. Meet safely, verify items, and do not send payment outside trusted methods.</span>
        </div>
        <div className="cards mini-cards">
          <div className="card"><p>Active Listings</p><h2>{publicListings.length}</h2></div>
          <div className="card"><p>Pending Review</p><h2>{marketplaceListings.filter((listing) => listing.status === "Pending Review").length}</h2></div>
          <div className="card"><p>My Listings</p><h2>{myListings.length}</h2></div>
          <div className="card"><p>Saved</p><h2>{marketplaceSavedIds.length}</h2></div>
        </div>

        <div className="quick-actions marketplace-nav-actions">
          {[
            ["create", "Create Listing"],
            ["browse", "Browse Listings"],
            ["my", "My Listings"],
            ["saved", "Saved Listings"],
            ["drafts", "Drafts"],
            ["pending", "Pending Review"],
          ].map(([view, label]) => (
            <button
              key={view}
              type="button"
              className={(view === "create" ? activeFlowModal?.type === "createListing" : marketplaceView === view) ? "primary" : "secondary-button"}
              onClick={() => {
                if (view === "create") {
                  openMarketplaceCreate("manual", {});
                  return;
                }
                setMarketplaceView(view);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {marketplaceView === "landing" ? (
          <div className="empty-state">
            <h3>Choose a Marketplace tool</h3>
            <p>Create a listing, browse approved listings, review your listings, or open saved listings. Public listings go to review first.</p>
          </div>
        ) : null}

        {false && marketplaceView === "create" ? (
        <div className="marketplace-create-panel">
          <div className="compact-card-header">
            <div>
              <h3>Create Listing</h3>
              <p>Draft a listing from Vault, TideTradr Catalog, Forge, or manual entry. Public listings go to review first.</p>
            </div>
          </div>
          <div className="quick-action-rail">
            {["forge", "vault", "catalog", "manual"].map((source) => (
              <button key={source} type="button" className={marketplaceSourcePicker === source ? "primary" : "secondary-button"} onClick={() => {
                setMarketplaceSourcePicker(source);
                if (source === "manual") setMarketplaceForm(BLANK_MARKETPLACE_FORM);
              }}>
                {source === "forge" ? "List from Forge" : source === "vault" ? "List from Vault" : source === "catalog" ? "List from Catalog" : "Create Manual Listing"}
              </button>
            ))}
          </div>
          {marketplaceSourcePicker === "forge" ? (
            <Field label="Forge item">
              <select onChange={(event) => {
                const item = forgeInventoryItems.find((candidate) => candidate.id === event.target.value);
                if (item) setMarketplaceForm(listingFromSource("forge", item));
              }}>
                <option value="">Choose Forge inventory</option>
                {forgeInventoryItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
          ) : null}
          {marketplaceSourcePicker === "vault" ? (
            <Field label="Vault item">
              <select onChange={(event) => {
                const item = vaultItems.find((candidate) => candidate.id === event.target.value);
                if (item) openVaultMarketplaceDecision(item);
              }}>
                <option value="">Choose Vault item</option>
                {vaultItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
          ) : null}
          {marketplaceSourcePicker === "catalog" ? (
            <Field label="Catalog item">
              <select onChange={(event) => {
                const product = catalogProducts.find((candidate) => candidate.id === event.target.value);
                if (product) setMarketplaceForm(listingFromSource("catalog", product));
              }}>
                <option value="">Choose catalog item</option>
                {catalogProducts.map((product) => <option key={product.id} value={product.id}>{catalogTitle(product)}</option>)}
              </select>
            </Field>
          ) : null}
          <form className="form marketplace-form" onSubmit={(event) => { event.preventDefault(); setListingReviewOpen(true); }}>
            <Field label="Listing Type">
              <select value={marketplaceForm.listingType} onChange={(event) => updateMarketplaceForm("listingType", event.target.value)}>
                {MARKETPLACE_LISTING_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
            </Field>
            <Field label="Title">
              <input value={marketplaceForm.title} onChange={(event) => updateMarketplaceForm("title", event.target.value)} placeholder="Product or card name" />
            </Field>
            <Field label="Quantity">
              <input type="number" min="1" value={marketplaceForm.quantity} onChange={(event) => updateMarketplaceForm("quantity", event.target.value)} />
            </Field>
            <Field label="Asking Price">
              <input type="number" step="0.01" value={marketplaceForm.askingPrice} onChange={(event) => updateMarketplaceForm("askingPrice", event.target.value)} />
            </Field>
            <Field label="Condition">
              <input value={marketplaceForm.condition} onChange={(event) => updateMarketplaceForm("condition", event.target.value)} placeholder="Near Mint, Sealed, Box damage..." />
            </Field>
            <Field label="Photo URL">
              <input value={marketplaceForm.photoUrl} onChange={(event) => updateMarketplaceForm("photoUrl", event.target.value)} placeholder="Optional beta photo URL" />
            </Field>
            <details className="scout-score-guidelines">
              <summary>More Listing Details</summary>
              <div className="form">
                <Field label="Product Type"><input value={marketplaceForm.productType} onChange={(event) => updateMarketplaceForm("productType", event.target.value)} /></Field>
                <Field label="Set / Collection"><input value={marketplaceForm.setName} onChange={(event) => updateMarketplaceForm("setName", event.target.value)} /></Field>
                <Field label="Trade Value"><input type="number" step="0.01" value={marketplaceForm.tradeValue} onChange={(event) => updateMarketplaceForm("tradeValue", event.target.value)} /></Field>
                <Field label="City"><input value={marketplaceForm.locationCity} onChange={(event) => updateMarketplaceForm("locationCity", event.target.value)} /></Field>
                <Field label="Tags"><input value={marketplaceForm.tags || ""} onChange={(event) => updateMarketplaceForm("tags", event.target.value)} placeholder="sealed, trade, local pickup..." /></Field>
                <Field label="Seller Notes"><input value={marketplaceForm.sellerNotes || ""} onChange={(event) => updateMarketplaceForm("sellerNotes", event.target.value)} /></Field>
                <Field label="Description"><textarea value={marketplaceForm.description} onChange={(event) => updateMarketplaceForm("description", event.target.value)} /></Field>
                <label className="toggle-row"><span>Pickup only</span><input type="checkbox" checked={marketplaceForm.pickupOnly} onChange={(event) => updateMarketplaceForm("pickupOnly", event.target.checked)} /></label>
                <label className="toggle-row"><span>Shipping available</span><input type="checkbox" checked={marketplaceForm.shippingAvailable} onChange={(event) => updateMarketplaceForm("shippingAvailable", event.target.checked)} /></label>
                <label className="toggle-row"><span>Intended for kids/families</span><input type="checkbox" checked={marketplaceForm.intendedForKids} onChange={(event) => updateMarketplaceForm("intendedForKids", event.target.checked)} /></label>
              </div>
            </details>
            <details className="marketplace-safety-rules">
              <summary>Community listing rules</summary>
              <p>No fake/counterfeit items, misleading prices, stolen items, unsafe meetups, harassment, or off-topic items. Admin may remove listings.</p>
            </details>
            <div className="quick-actions marketplace-form-footer">
              <button type="submit" disabled={!marketplaceFormReady()}>Review Listing</button>
              <button type="button" className="secondary-button" onClick={() => saveMarketplaceListing("Draft")}>Save Draft</button>
            </div>
          </form>
        </div>
        ) : null}

        {["browse", "my", "saved", "drafts", "pending"].includes(marketplaceView) ? (
        <div className="marketplace-browse-panel">
          <div className="compact-card-header">
            <div>
              <h3>{marketplacePanelTitle}</h3>
              <p>{marketplacePanelDescription}</p>
            </div>
          </div>
          {marketplaceView === "browse" ? (
          <div className="filter-grid">
            <Field label="Search">
              <input value={marketplaceSearch} onChange={(event) => setMarketplaceSearch(event.target.value)} placeholder="Search title, set, UPC, SKU, city..." />
            </Field>
            <Field label="Listing Type">
              <select value={marketplaceTypeFilter} onChange={(event) => setMarketplaceTypeFilter(event.target.value)}>
                <option>All</option>
                {MARKETPLACE_LISTING_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={marketplaceStatusFilter} onChange={(event) => setMarketplaceStatusFilter(event.target.value)}>
                <option>Active</option>
                <option>All</option>
                {MARKETPLACE_STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
            </Field>
          </div>
          ) : null}
          <div className="inventory-list compact-inventory-list">
            {panelListings.length ? panelListings.map((listing) => renderMarketplaceListingCard(listing)) : (
              <div className="empty-state">
                <h3>No marketplace listings yet</h3>
                <p>
                  {marketplaceView === "saved"
                    ? "Saved listings will appear here."
                    : marketplaceView === "my"
                      ? "Create a listing draft to see it here."
                      : marketplaceView === "drafts"
                        ? "Saved drafts will appear here."
                        : marketplaceView === "pending"
                          ? "Listings submitted for admin review will appear here."
                          : "Approved listings will appear here after admin review."}
                </p>
              </div>
            )}
          </div>
        </div>
        ) : null}

        {false && myListings.length ? (
          <details className="scout-score-guidelines">
            <summary>My Listings</summary>
            <div className="inventory-list compact-inventory-list">
              {myListings.map((listing) => renderMarketplaceListingCard(listing))}
            </div>
          </details>
        ) : null}

        {selectedListing ? (
          <div className="marketplace-detail-panel compact-card">
            <div className="compact-card-header">
              <div>
                <h3>{selectedListing.title}</h3>
                <p>{selectedListing.listingType} | {selectedListing.status}</p>
              </div>
              <button type="button" className="secondary-button" onClick={() => setSelectedListingId("")}>Close</button>
            </div>
            {selectedListing.photos?.[0] ? <img className="catalog-detail-image" src={selectedListing.photos[0]} alt={selectedListing.title} /> : null}
            <div className="catalog-detail-grid">
              <DetailItem label="Price" value={money(selectedListing.askingPrice)} />
              <DetailItem label="Market Value" value={money(getListingMarketReference(selectedListing).currentMarketValue)} />
              <DetailItem label="MSRP" value={money(getListingMarketReference(selectedListing).msrp)} />
              <DetailItem label="Condition" value={selectedListing.condition} />
              <DetailItem label="Quantity" value={selectedListing.quantity} />
              <DetailItem label="Location" value={`${selectedListing.locationCity || "Local"} ${selectedListing.locationState || ""}`} />
              <DetailItem label="Pickup / Shipping" value={`${selectedListing.pickupOnly ? "Pickup" : "Pickup optional"}${selectedListing.shippingAvailable ? " / Shipping available" : ""}`} />
              <DetailItem label="Seller Contact" value={selectedListing.contactPreference || "Request contact"} />
            </div>
            <p>{selectedListing.description || "No description yet."}</p>
            <p className="compact-subtitle">Meet safely, verify items, and do not send payment outside trusted methods. Message system is coming later.</p>
            <div className="quick-actions">
              <button type="button" onClick={() => setVaultToast("Contact request saved for beta. Messaging is coming soon.")}>Contact Seller</button>
              <button type="button" className="secondary-button" onClick={() => toggleSavedListing(selectedListing.id)}>Save Listing</button>
              <button type="button" className="secondary-button" disabled>Make Offer Later</button>
              <button type="button" className="secondary-button" onClick={() => setListingReportTarget(selectedListing)}>Report</button>
              {selectedListing.sellerUserId === (currentUserProfile.userId || user?.id) || adminUser ? (
              <button type="button" className="secondary-button" onClick={() => updateMarketplaceListing(selectedListing.id, { status: "Sold" })}>Mark Sold</button>
              ) : null}
              {selectedListing.sellerUserId === (currentUserProfile.userId || user?.id) || adminUser ? (
                <>
                  <button type="button" className="secondary-button" onClick={() => editMarketplaceListing(selectedListing)}>Edit Listing</button>
                  <button type="button" className="secondary-button" onClick={() => updateMarketplaceListing(selectedListing.id, { status: "Archived" })}>Archive</button>
                </>
              ) : null}
              {adminUser ? (
                <>
                  <button type="button" className="secondary-button" onClick={() => approveMarketplaceListing(selectedListing.id)}>Approve</button>
                  <button type="button" className="secondary-button" onClick={() => rejectMarketplaceListing(selectedListing.id)}>Remove</button>
                  <button type="button" className="secondary-button" onClick={() => updateMarketplaceListing(selectedListing.id, { status: "Flagged" })}>Flag</button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {false && listingReviewOpen ? (
          <div className="location-modal-backdrop" role="presentation" onClick={() => setListingReviewOpen(false)}>
            <section className="location-modal marketplace-review-modal" role="dialog" aria-modal="true" aria-labelledby="listing-review-title" onClick={(event) => event.stopPropagation()}>
              <div>
                <h2 id="listing-review-title">Review Listing</h2>
                <p>Public listings are submitted for review before they appear in Marketplace.</p>
              </div>
              {renderMarketplaceListingCard(reviewListing)}
              <div className="location-modal-actions">
                <button type="button" onClick={() => saveMarketplaceListing("Submit")}>Submit Listing</button>
                <button type="button" className="secondary-button" onClick={() => saveMarketplaceListing("Draft")}>Save Draft</button>
                <button type="button" className="secondary-button" onClick={() => setListingReviewOpen(false)}>Edit</button>
                <button type="button" className="ghost-button" onClick={() => setListingReviewOpen(false)}>Cancel</button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    );
  }

  function renderTidepoolCommunity() {
    const sourceLabel = BETA_LOCAL_MODE ? "Private Beta" : "Cloud";
    const tidepoolStats = [
      { label: "Posts", value: tidepoolPosts.length },
      { label: "Comments", value: tidepoolComments.length },
      { label: "Reactions", value: tidepoolReactions.length },
      { label: "Source", value: sourceLabel },
    ];

    return (
      <>
        <PageHeader
          className={getHeaderCardClass("panel tidepool-community-header")}
          title="Tidepool"
          subtitle="Community feed for posts, questions, sightings, events, comments, confirmations, and replies."
          actions={(
            <>
              <button type="button" onClick={openTidepoolCreatePostFlow}>Create Post</button>
              <button type="button" className="secondary-button" onClick={() => setActiveTab("dashboard")}>Close Tidepool</button>
            </>
          )}
          summary={(
            <div className="tidepool-stat-grid" aria-label="Tidepool stats">
            {tidepoolStats.map((stat) => (
              <div className="tidepool-stat-card" key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
          )}
          tabs={visibleTidepoolFilters.map((filter) => ({ key: filter, label: filter }))}
          activeTab={tidepoolFilter}
          onTabChange={setTidepoolFilter}
        />

        <section className="panel tidepool-community">
          <div className="compact-card-header">
            <div>
              <h2>Community Feed</h2>
              <p>Browse posts, react, save, flag, and comment without moderation controls crowding the feed.</p>
            </div>
            <span className="status-badge">{tidepoolFilter}</span>
          </div>

          <div className="tidepool-feed-grid">
            {filteredTidepoolPosts.length === 0 ? (
              <div className="empty-state tidepool-empty-state">
                <h3>No posts yet. Create the first private beta post.</h3>
                <p>Create a post or change filters.</p>
                <button type="button" onClick={openTidepoolCreatePostFlow}>Create Post</button>
              </div>
            ) : null}
            {pagedTidepoolPosts.items.map((post) => {
              const postComments = tidepoolComments.filter((comment) => comment.postId === post.postId && !comment.parentCommentId && comment.status !== "removed");
              const locationParts = [post.city, post.state].filter(Boolean);
              const locationLabel = locationParts.length ? locationParts.join(", ") : post.zip ? `ZIP ${post.zip}` : "Community post";
              const postDate = post.createdAt ? new Date(post.createdAt).toLocaleDateString() : "No date";
              const preview = post.body || "No post body yet.";
              const sourceBadge = post.sourceType === "mock" || post.sourceType === "demo" ? "Demo" : post.sourceType === "admin" ? "Admin" : "User";
              return (
                <article className="tidepool-post-card compact-card" key={post.postId}>
                  <div className="tidepool-post-top">
                    <div className="tidepool-badge-row">
                      <span className={statusClass(post.postType)}>{post.postType}</span>
                      <span className={statusClass(post.verificationStatus)}>{post.verificationStatus}</span>
                      {post.flagged ? <span className="status-badge needs-review">Needs Review</span> : null}
                      {post.sourceType !== "user" ? <span className={statusClass(sourceBadge)}>{sourceBadge}</span> : null}
                    </div>
                    {adminToolsVisible ? (
                      <details className="tidepool-moderation-menu">
                        <summary>Moderation</summary>
                        <div>
                          <button type="button" className="secondary-button" onClick={() => updateTidepoolPost(post.postId, { verificationStatus: "verified", sourceType: "admin" })}>Verify Post</button>
                          <button type="button" className="secondary-button" onClick={() => updateTidepoolPost(post.postId, { verificationStatus: "disputed" })}>Mark Disputed</button>
                          <button type="button" className="secondary-button" onClick={() => updateTidepoolPost(post.postId, { status: "hidden" })}>Hide Post</button>
                          <button type="button" className="secondary-button" onClick={() => updateTidepoolPost(post.postId, { status: "removed" })}>Remove Post</button>
                          <button type="button" className="secondary-button" onClick={() => updateTidepoolPost(post.postId, { commentsLocked: true })}>Lock Comments</button>
                        </div>
                      </details>
                    ) : null}
                  </div>
                  <div className="tidepool-post-copy">
                    <h3>{post.title || post.postType}</h3>
                    <p className="tidepool-post-meta">{locationLabel} | {postDate}</p>
                    <p>{preview}</p>
                    {post.photoUrl ? <img className="tidepool-post-image" src={post.photoUrl} alt="" /> : null}
                  </div>
                  <div className="tidepool-post-counts">
                    <span>{post.commentCount} comment{post.commentCount === 1 ? "" : "s"}</span>
                    <span>{post.reactionCount} reaction{post.reactionCount === 1 ? "" : "s"}</span>
                    <span>Source: {sourceBadge}</span>
                  </div>
                  <div className="tidepool-post-actions">
                    <button type="button" className="secondary-button" onClick={() => addTidepoolReaction(post.postId, "helpful")}>Helpful</button>
                    <button type="button" className="secondary-button" onClick={() => addTidepoolReaction(post.postId, "confirmed")}>Confirm</button>
                    <button type="button" className="secondary-button" onClick={() => addTidepoolReaction(post.postId, "disputed")}>Dispute</button>
                    <button type="button" className="secondary-button" onClick={() => updateTidepoolPost(post.postId, { saved: !post.saved })}>{post.saved ? "Saved" : "Save"}</button>
                    <button type="button" className="secondary-button" onClick={() => updateTidepoolPost(post.postId, { flagged: true, status: "pending" })}>{post.flagged ? "Flagged" : "Flag"}</button>
                    <button type="button" className="secondary-button" onClick={() => document.getElementById(`tidepool-comment-${post.postId}`)?.focus()}>Comment</button>
                  </div>
                  <div className="tidepool-comments">
                    <div className="tidepool-comments-header">
                      <strong>Comments</strong>
                      <span>{postComments.length}</span>
                    </div>
                    {postComments.length ? (
                      <div className="tidepool-comment-list">
                        {postComments.slice(0, 3).map((comment) => {
                          const replies = tidepoolComments.filter((reply) => reply.parentCommentId === comment.commentId && reply.status !== "removed");
                          return (
                            <div className="tidepool-comment" key={comment.commentId}>
                              <p><strong>{comment.displayName}</strong>: {comment.body}</p>
                              {replies.slice(0, 2).map((reply) => (
                                <p className="compact-subtitle tidepool-reply" key={reply.commentId}><strong>{reply.displayName}</strong>: {reply.body}</p>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="compact-subtitle">No comments yet.</p>
                    )}
                    {post.commentsLocked ? (
                      <p className="compact-subtitle">Comments are locked for this post.</p>
                    ) : (
                      <div className="tidepool-comment-box">
                        <input id={`tidepool-comment-${post.postId}`} value={tidepoolCommentDrafts[post.postId] || ""} onChange={(event) => setTidepoolCommentDrafts((current) => ({ ...current, [post.postId]: event.target.value }))} placeholder="Add a comment..." />
                        <button type="button" onClick={() => addTidepoolComment(post.postId)}>Comment</button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <PaginationControls
            label="Posts"
            page={pagedTidepoolPosts.page}
            pageCount={pagedTidepoolPosts.pageCount}
            totalCount={pagedTidepoolPosts.total}
            pageSize={LONG_LIST_PAGE_SIZE}
            onPageChange={(page) => {
              setTidepoolPage(page);
              scrollToResultsTop();
            }}
            compact
          />

          <div className="tidepool-rules-card">
            <strong>Community rules</strong>
            <p>No fake reports, spam, harassment, or unsafe meetup details. Restock claims can be confirmed or disputed, and flagged posts go to review.</p>
          </div>
        </section>
      </>
    );
  }

  function flowModalMeta() {
    if (activeFlowModal?.type === "forgeQuickAdd") {
      return {
        title: "Quick Add",
        description: "Create or import Forge records without leaving the current page.",
        size: "small",
      };
    }
    if (activeFlowModal?.type === "forgeImport") {
      return {
        title: "Import File",
        description: "Upload a sales, inventory, expense, or marketplace file and preview the mapping before saving.",
        size: "large",
      };
    }
    if (activeFlowModal?.type === "vaultQuickAdd") {
      return {
        title: "Vault Quick Add",
        description: "Search TideTradr, scan, manually add, import, or save a wishlist item.",
        size: "small",
      };
    }
    if (activeFlowModal?.type === "vaultCatalogSearch") {
      return {
        title: "Search TideTradr Catalog",
        description: "Search by product, card, set, UPC, SKU, or shorthand, then prefill your Vault item.",
        size: "large",
      };
    }
    if (activeFlowModal?.type === "vaultScan") {
      return {
        title: "Scan to Vault",
        description: "Scan is being prepared for private beta. Use search or UPC/SKU entry when scanning is not available.",
        size: "small",
      };
    }
    if (activeFlowModal?.type === "vaultImportCollection") {
      return {
        title: "Import Collection",
        description: "Collection import is being prepared for private beta. Search or manual add is ready now.",
        size: "small",
      };
    }
    if (activeFlowModal?.type === "quickFind") {
      return {
        title: "Quick Find",
        description: "Search TideTradr, scan a product, enter a UPC/SKU, or start a manual lookup.",
        size: "small",
      };
    }
    if (activeFlowModal?.type === "multiDestinationAdd") {
      return {
        title: "Add to Multiple Places",
        description: "Send one item to Vault, Wishlist, Forge, and/or TideTradr with separate destination settings.",
        size: "large",
      };
    }
    if (activeFlowModal?.type === "vaultMoveToForge") {
      return {
        title: "Move Item to Forge",
        description: "Choose a Vault item to move into business inventory.",
        size: "medium",
      };
    }
    if (activeFlowModal?.type === "tidepoolCreatePost") {
      return {
        title: "Create Tidepool Post",
        description: "Share a question, sighting, deal, event, or store tip with the community.",
        size: "medium",
      };
    }
    if (activeFlowModal?.type === "addInventory") {
      return {
        title: editingItemId ? "Edit Forge Inventory" : "Add Forge Inventory",
        description: "Build a sellable inventory record from catalog data, scan review, or manual entry.",
        size: "large",
      };
    }
    if (activeFlowModal?.type === "addSale") {
      return {
        title: editingSaleId ? "Edit Sale" : "Add Sale",
        description: "Choose inventory, record sale details, and preview profit before saving.",
        size: "medium",
      };
    }
    if (activeFlowModal?.type === "addExpense") {
      return {
        title: editingExpenseId ? "Edit Expense" : "Add Business Expense",
        description: "Track receipts, fees, supplies, shipping, marketing, and other business costs.",
        size: "medium",
      };
    }
    if (activeFlowModal?.type === "addMileage") {
      return {
        title: editingTripId ? "Edit Mileage Trip" : "Add Mileage Trip",
        description: "Log business miles and vehicle costs without leaving the current Forge view.",
        size: "medium",
      };
    }
    if (activeFlowModal?.type === "createListing") {
      return {
        title: "Create Marketplace Listing",
        description: "Draft a listing from Vault, TideTradr, Forge, or manual entry. Public listings go to review first.",
        size: "large",
      };
    }
    if (activeFlowModal?.type === "scoutSubmit") {
      return {
        title: "Submit Scout Report",
        description: "Add a restock report, product sighting, correction, or store note while staying in context.",
        size: "large",
      };
    }
    return { title: "Add", description: "Create a new record.", size: activeFlowModal?.size || "medium" };
  }

  function renderAddInventoryFlowContent() {
    return (
      <div className="flow-modal-stack">
        <div className="flow-modal-top-actions">
          <button type="button" className="secondary-button" onClick={() => beginScanProduct("forge")}>
            Scan Product
          </button>
        </div>
        <details className="forge-form-step forge-optional-details">
          <summary>Quick TideTradr catalog picker</summary>
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
                unitCost: newItem.paidPriceEach || product?.msrpPrice || old.unitCost || "",
                salePrice: newItem.sellingPriceEach || product?.marketPrice || old.salePrice || "",
                status: "In Stock",
              }));
            }}
          />
        </details>
        <InventoryForm
          form={itemForm}
          setForm={updateItemForm}
          catalogProducts={catalogProducts}
          purchasers={purchaserOptions}
          onCreatePurchaser={addPurchaserName}
          applyCatalogProduct={applyCatalogProduct}
          handleImageUpload={handleImageUpload}
          onSubmit={editingItemId ? saveEditedItem : addItem}
          submitLabel={editingItemId ? "Save Item" : "Add Item"}
        />
      </div>
    );
  }

  function renderAddSaleFlowContent() {
    return (
      <form onSubmit={addSale} className="form forge-sale-form">
        <div className="forge-sale-fields-grid">
          <Field label="Item Sold">
            <select value={saleForm.itemId} onChange={(e) => updateSaleForm("itemId", e.target.value)}>
              <option value="">Choose item</option>
              {forgeInventoryItems.filter((i) => i.quantity > 0).map((i) => <option key={i.id} value={i.id}>{i.name} - Qty {i.quantity} - {i.sku}</option>)}
            </select>
          </Field>
          {selectedSaleItem ? (
            <div className="forge-sale-product-summary">
              {selectedSaleItem.itemImage ? <img src={selectedSaleItem.itemImage} alt="" /> : <span>Item</span>}
              <div>
                <strong>{selectedSaleItem.name}</strong>
                <small>Qty owned: {selectedSaleItem.quantity} | Cost basis: {money(saleCostBasis)}</small>
                <small>Market: {money(selectedSaleItem.marketPrice)} | Planned: {money(selectedSaleItem.salePrice)}</small>
              </div>
            </div>
          ) : (
            <div className="small-empty-state forge-sale-helper">
              <strong>Choose an inventory item to calculate cost basis and profit.</strong>
            </div>
          )}
          <Field label="Platform"><select value={saleForm.platform} onChange={(e) => updateSaleForm("platform", e.target.value)}>{PLATFORMS.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Quantity Sold"><input type="number" min="1" value={saleForm.quantitySold} onChange={(e) => updateSaleForm("quantitySold", e.target.value)} /></Field>
          <Field label="Sale Price Each"><input type="number" step="0.01" value={saleForm.finalSalePrice} onChange={(e) => updateSaleForm("finalSalePrice", e.target.value)} /></Field>
          <Field label="Shipping Charged"><input type="number" step="0.01" value={saleForm.shippingCharged} onChange={(e) => updateSaleForm("shippingCharged", e.target.value)} /></Field>
          <Field label="Shipping Cost"><input type="number" step="0.01" value={saleForm.shippingCost} onChange={(e) => updateSaleForm("shippingCost", e.target.value)} /></Field>
          <Field label="Fees"><input type="number" step="0.01" value={saleForm.platformFees} onChange={(e) => updateSaleForm("platformFees", e.target.value)} /></Field>
          <Field label="Notes"><input value={saleForm.notes} onChange={(e) => updateSaleForm("notes", e.target.value)} /></Field>
        </div>
        <div className="profit-preview forge-profit-preview">
          <h3>Estimated Profit</h3>
          <div className="preview-grid">
            <div><span>Gross Sale</span><strong>{money(saleGrossPreview)}</strong></div>
            <div><span>Cost Basis</span><strong>{money(saleCostBasis)}</strong></div>
            <div><span>Shipping + Fees</span><strong>{money(saleShippingCost + saleFees)}</strong></div>
            <div><span>Net Profit</span><strong>{money(saleProfitPreview)}</strong></div>
          </div>
        </div>
        <div className="forge-form-footer">
          <button type="submit">{editingSaleId ? "Save Sale" : "Add Sale"}</button>
        </div>
      </form>
    );
  }

  function renderAddExpenseFlowContent() {
    return (
      <form onSubmit={addExpense} className="form flow-form-grid">
        <Field label="Date"><input type="date" value={expenseForm.date} onChange={(e) => updateExpenseForm("date", e.target.value)} /></Field>
        <Field label="Vendor / Store"><input value={expenseForm.vendor} onChange={(e) => updateExpenseForm("vendor", e.target.value)} /></Field>
        <Field label="Expense Category"><select value={expenseForm.category} onChange={(e) => updateExpenseForm("category", e.target.value)}>{EXPENSE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></Field>
        <Field label="Subcategory"><input value={expenseForm.subcategory} placeholder="Facebook ads, flyers, labels, domain..." onChange={(e) => updateExpenseForm("subcategory", e.target.value)} /></Field>
        <Field label="Who Paid?"><select value={expenseForm.buyer} onChange={(e) => updateExpenseForm("buyer", e.target.value)}>{peopleOptions.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Amount"><input type="number" step="0.01" value={expenseForm.amount} onChange={(e) => updateExpenseForm("amount", e.target.value)} /></Field>
        <Field label="Payment Method"><input value={expenseForm.paymentMethod} placeholder="Card, cash, PayPal, business account..." onChange={(e) => updateExpenseForm("paymentMethod", e.target.value)} /></Field>
        <Field label="Linked Forge Item"><select value={expenseForm.linkedItemId} onChange={(e) => updateExpenseForm("linkedItemId", e.target.value)}><option value="">None</option>{forgeInventoryItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Linked Sale"><select value={expenseForm.linkedSaleId} onChange={(e) => updateExpenseForm("linkedSaleId", e.target.value)}><option value="">None</option>{sales.map((sale) => <option key={sale.id} value={sale.id}>{sale.itemName} - {sale.platform}</option>)}</select></Field>
        {expenseForm.category === "Marketing" ? (
          <>
            <Field label="Campaign Name"><input value={expenseForm.campaignName} placeholder="Spring restock ads, giveaway push..." onChange={(e) => updateExpenseForm("campaignName", e.target.value)} /></Field>
            <Field label="Marketing Platform"><select value={expenseForm.platform} onChange={(e) => updateExpenseForm("platform", e.target.value)}><option value="">Select platform</option>{MARKETING_PLATFORMS.map((platform) => <option key={platform}>{platform}</option>)}</select></Field>
            <Field label="Goal"><select value={expenseForm.goal} onChange={(e) => updateExpenseForm("goal", e.target.value)}><option value="">Select goal</option>{MARKETING_GOALS.map((goal) => <option key={goal} value={goal}>{goal}</option>)}</select></Field>
            <Field label="Campaign Start"><input type="date" value={expenseForm.startDate} onChange={(e) => updateExpenseForm("startDate", e.target.value)} /></Field>
            <Field label="Campaign End"><input type="date" value={expenseForm.endDate} onChange={(e) => updateExpenseForm("endDate", e.target.value)} /></Field>
            <Field label="Linked Sales / Results"><input value={expenseForm.linkedSales} placeholder="Sale IDs, totals, or notes for later ROI tracking" onChange={(e) => updateExpenseForm("linkedSales", e.target.value)} /></Field>
            <Field label="Results Notes"><input value={expenseForm.resultsNotes} placeholder="Clicks, messages, followers, sales lift..." onChange={(e) => updateExpenseForm("resultsNotes", e.target.value)} /></Field>
          </>
        ) : null}
        <Field label="Notes"><input value={expenseForm.notes} onChange={(e) => updateExpenseForm("notes", e.target.value)} /></Field>
        <label className="toggle-row"><span>Tax deductible</span><input type="checkbox" checked={!!expenseForm.taxDeductible} onChange={(e) => updateExpenseForm("taxDeductible", e.target.checked)} /></label>
        <Field label="Receipt / Screenshot"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => updateExpenseForm("receiptImage", url), "expenses")} /></Field>
        {expenseForm.receiptImage ? <div className="receipt-preview"><p>Receipt</p><img src={expenseForm.receiptImage} alt="Receipt" /></div> : null}
        <div className="flow-form-footer">
          <button type="submit">{editingExpenseId ? "Save Expense" : "Add Expense"}</button>
        </div>
      </form>
    );
  }

  function renderAddMileageFlowContent() {
    return (
      <form onSubmit={addTrip} className="form flow-form-grid">
        <Field label="Trip Purpose"><input value={tripForm.purpose} onChange={(e) => updateTripForm("purpose", e.target.value)} /></Field>
        <Field label="Driver"><select value={tripForm.driver} onChange={(e) => updateTripForm("driver", e.target.value)}>{peopleOptions.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Vehicle"><select value={tripForm.vehicleId} onChange={(e) => updateTripForm("vehicleId", e.target.value)}><option value="">No vehicle selected</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} - {v.averageMpg} MPG</option>)}</select></Field>
        <Field label="Starting Odometer"><input type="number" value={tripForm.startMiles} onChange={(e) => updateTripForm("startMiles", e.target.value)} /></Field>
        <Field label="Ending Odometer"><input type="number" value={tripForm.endMiles} onChange={(e) => updateTripForm("endMiles", e.target.value)} /></Field>
        <Field label="Gas Price Paid"><input type="number" step="0.01" value={tripForm.gasPrice} onChange={(e) => updateTripForm("gasPrice", e.target.value)} /></Field>
        <Field label="Gas Receipt"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => updateTripForm("gasReceiptImage", url), "gas")} /></Field>
        {tripForm.gasReceiptImage ? <div className="receipt-preview"><p>Gas Receipt</p><img src={tripForm.gasReceiptImage} alt="Gas Receipt" /></div> : null}
        <Field label="Notes"><input value={tripForm.notes} onChange={(e) => updateTripForm("notes", e.target.value)} /></Field>
        <div className="flow-form-footer">
          <button type="submit">{editingTripId ? "Save Trip" : "Add Mileage Trip"}</button>
        </div>
      </form>
    );
  }

  function renderMarketplaceCreateFlowContent() {
    return (
      <div className="marketplace-create-panel flow-create-panel">
        <div className="quick-action-rail">
          {["forge", "vault", "catalog", "manual"].map((source) => (
            <button key={source} type="button" className={marketplaceSourcePicker === source ? "primary" : "secondary-button"} onClick={() => {
              setMarketplaceSourcePicker(source);
              if (source === "manual") setMarketplaceForm(BLANK_MARKETPLACE_FORM);
            }}>
              {source === "forge" ? "List from Forge" : source === "vault" ? "List from Vault" : source === "catalog" ? "List from Catalog" : "Create Manual Listing"}
            </button>
          ))}
        </div>
        {marketplaceSourcePicker === "forge" ? (
          <Field label="Forge item">
            <select onChange={(event) => {
              const item = forgeInventoryItems.find((candidate) => candidate.id === event.target.value);
              if (item) setMarketplaceForm(listingFromSource("forge", item));
            }}>
              <option value="">Choose Forge inventory</option>
              {forgeInventoryItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        ) : null}
        {marketplaceSourcePicker === "vault" ? (
          <Field label="Vault item">
            <select onChange={(event) => {
              const item = vaultItems.find((candidate) => candidate.id === event.target.value);
              if (item) openVaultMarketplaceDecision(item);
            }}>
              <option value="">Choose Vault item</option>
              {vaultItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        ) : null}
        {marketplaceSourcePicker === "catalog" ? (
          <Field label="Catalog item">
            <select onChange={(event) => {
              const product = catalogProducts.find((candidate) => candidate.id === event.target.value);
              if (product) setMarketplaceForm(listingFromSource("catalog", product));
            }}>
              <option value="">Choose catalog item</option>
              {catalogProducts.map((product) => <option key={product.id} value={product.id}>{catalogTitle(product)}</option>)}
            </select>
          </Field>
        ) : null}
        <form className="form marketplace-form" onSubmit={(event) => { event.preventDefault(); setListingReviewOpen(true); }}>
          <Field label="Listing Type"><select value={marketplaceForm.listingType} onChange={(event) => updateMarketplaceForm("listingType", event.target.value)}>{MARKETPLACE_LISTING_TYPES.map((type) => <option key={type}>{type}</option>)}</select></Field>
          <Field label="Title"><input value={marketplaceForm.title} onChange={(event) => updateMarketplaceForm("title", event.target.value)} placeholder="Product or card name" /></Field>
          <Field label="Quantity"><input type="number" min="1" value={marketplaceForm.quantity} onChange={(event) => updateMarketplaceForm("quantity", event.target.value)} /></Field>
          <Field label="Asking Price"><input type="number" step="0.01" value={marketplaceForm.askingPrice} onChange={(event) => updateMarketplaceForm("askingPrice", event.target.value)} /></Field>
          <Field label="Condition"><input value={marketplaceForm.condition} onChange={(event) => updateMarketplaceForm("condition", event.target.value)} placeholder="Near Mint, Sealed, Box damage..." /></Field>
          <Field label="Photo URL"><input value={marketplaceForm.photoUrl} onChange={(event) => updateMarketplaceForm("photoUrl", event.target.value)} placeholder="Optional beta photo URL" /></Field>
          <details className="scout-score-guidelines">
            <summary>More Listing Details</summary>
            <div className="form">
              <Field label="Product Type"><input value={marketplaceForm.productType} onChange={(event) => updateMarketplaceForm("productType", event.target.value)} /></Field>
              <Field label="Set / Collection"><input value={marketplaceForm.setName} onChange={(event) => updateMarketplaceForm("setName", event.target.value)} /></Field>
              <Field label="Trade Value"><input type="number" step="0.01" value={marketplaceForm.tradeValue} onChange={(event) => updateMarketplaceForm("tradeValue", event.target.value)} /></Field>
              <Field label="City"><input value={marketplaceForm.locationCity} onChange={(event) => updateMarketplaceForm("locationCity", event.target.value)} /></Field>
              <Field label="Tags"><input value={marketplaceForm.tags || ""} onChange={(event) => updateMarketplaceForm("tags", event.target.value)} placeholder="sealed, trade, local pickup..." /></Field>
              <Field label="Seller Notes"><input value={marketplaceForm.sellerNotes || ""} onChange={(event) => updateMarketplaceForm("sellerNotes", event.target.value)} /></Field>
              <Field label="Description"><textarea value={marketplaceForm.description} onChange={(event) => updateMarketplaceForm("description", event.target.value)} /></Field>
              <label className="toggle-row"><span>Pickup only</span><input type="checkbox" checked={marketplaceForm.pickupOnly} onChange={(event) => updateMarketplaceForm("pickupOnly", event.target.checked)} /></label>
              <label className="toggle-row"><span>Shipping available</span><input type="checkbox" checked={marketplaceForm.shippingAvailable} onChange={(event) => updateMarketplaceForm("shippingAvailable", event.target.checked)} /></label>
              <label className="toggle-row"><span>Intended for kids/families</span><input type="checkbox" checked={marketplaceForm.intendedForKids} onChange={(event) => updateMarketplaceForm("intendedForKids", event.target.checked)} /></label>
            </div>
          </details>
          <details className="marketplace-safety-rules">
            <summary>Community listing rules</summary>
            <p>No fake/counterfeit items, misleading prices, stolen items, unsafe meetups, harassment, or off-topic items. Admin may remove listings.</p>
          </details>
          <div className="quick-actions marketplace-form-footer">
            <button type="submit" disabled={!marketplaceFormReady()}>Review Listing</button>
            <button type="button" className="secondary-button" onClick={() => saveMarketplaceListing("Draft")}>Save Draft</button>
          </div>
        </form>
      </div>
    );
  }

  function renderTidepoolCreatePostFlowContent() {
    return (
      <form className="form flow-form-grid tidepool-create-form" onSubmit={submitTidepoolPost}>
        <Field label="Post Type">
          <select value={tidepoolPostForm.postType} onChange={(event) => setTidepoolPostForm((current) => ({ ...current, postType: event.target.value }))}>
            {TIDEPOOL_POST_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </Field>
        <Field label="Title">
          <input value={tidepoolPostForm.title} onChange={(event) => setTidepoolPostForm((current) => ({ ...current, title: event.target.value }))} placeholder="Optional title" />
        </Field>
        <Field label="Post">
          <textarea value={tidepoolPostForm.body} onChange={(event) => setTidepoolPostForm((current) => ({ ...current, body: event.target.value }))} placeholder="Ask a question, share a sighting, post an event, or start a discussion." />
        </Field>
        <Field label="City">
          <input value={tidepoolPostForm.city} onChange={(event) => setTidepoolPostForm((current) => ({ ...current, city: event.target.value }))} placeholder="Optional" />
        </Field>
        <Field label="ZIP">
          <input value={tidepoolPostForm.zip} onChange={(event) => setTidepoolPostForm((current) => ({ ...current, zip: event.target.value }))} placeholder="Optional" />
        </Field>
        <Field label="Photo URL">
          <input value={tidepoolPostForm.photoUrl} onChange={(event) => setTidepoolPostForm((current) => ({ ...current, photoUrl: event.target.value }))} placeholder="Optional beta image URL" />
        </Field>
        <div className="flow-form-footer">
          <button type="submit" disabled={!tidepoolPostForm.body.trim() && !tidepoolPostForm.title.trim()}>Post to Tidepool</button>
        </div>
      </form>
    );
  }

  function renderScoutSubmitFlowContent() {
    return (
      <section className="embedded-page flow-embedded-page">
        <Scout
          targetSubTab={{ ...scoutSubTabTarget, tab: "reports" }}
          compact
          adminMode={adminUser}
          supabase={supabase}
          isSupabaseConfigured={isSupabaseConfigured}
          mapCatalogRow={mapCatalog}
          money={money}
        />
      </section>
    );
  }

  function renderForgeQuickAddFlowContent() {
    const options = [
      { key: "inventory", title: "Add Inventory", helper: "Track a sellable item.", onClick: () => openProductAddFlow({ source: "forge-quick-add-inventory", destinations: { forge: true } }) },
      { key: "sale", title: "Add Sale", helper: "Record revenue and profit.", onClick: () => openAddSaleFlow() },
      { key: "expense", title: "Add Expense", helper: "Receipts, fees, supplies.", onClick: () => openAddExpenseFlow() },
      { key: "mileage", title: "Add Mileage", helper: "Business trip tracking.", onClick: () => openAddMileageFlow() },
      { key: "listing", title: "Add Marketplace Listing", helper: "Draft a Marketplace listing.", onClick: () => openMarketplaceCreate("manual", {}) },
      { key: "import", title: "Import File", helper: "Import sales, inventory, or expense files.", onClick: () => openForgeImportFlow() },
    ];

    return (
      <div className="forge-quick-add-panel">
        <div className="forge-quick-add-grid">
          {options.map((option) => (
            <button key={option.key} type="button" className="forge-quick-add-option" onClick={option.onClick}>
              <strong>{option.title}</strong>
              <span>{option.helper}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderVaultQuickAddFlowContent() {
    const runVaultQuickAction = (action) => {
      if (!closeFlowModal({ force: true })) return;
      action();
    };
    const options = [
      {
        key: "catalog",
        title: "Search TideTradr Catalog",
        helper: "Search catalog and prefill item data.",
        onClick: () => runVaultQuickAction(() => openVaultCatalogSearchFlow({ source: "vault" })),
      },
      {
        key: "scan",
        title: "Scan to Vault",
        helper: "Scan a card, product, UPC, or barcode.",
        onClick: () => runVaultQuickAction(() => openVaultScanFlow()),
      },
      {
        key: "picture",
        title: "Look Up by Picture",
        helper: "Use a product/card photo without requiring a UPC.",
        onClick: () => runVaultQuickAction(() => openPictureLookupFlow("vault")),
      },
      {
        key: "add",
        title: "Manual Add",
        helper: "Add an item with your own details.",
        onClick: () => runVaultQuickAction(() => openMultiDestinationAddFlow({
          source: "vault-manual",
          seed: { destinations: { vault: true, wishlist: false, forge: false, tidetradr: false } },
        })),
      },
      {
        key: "collection-import",
        title: "Import Collection",
        helper: "Upload or map a collection file.",
        onClick: () => runVaultQuickAction(() => openVaultImportCollectionFlow()),
      },
      {
        key: "wishlist",
        title: "Add Wishlist Item",
        helper: "Save wants and future buys.",
        onClick: () => runVaultQuickAction(() => openMultiDestinationAddFlow({
          source: "vault-wishlist",
          seed: {
            destinations: { vault: false, wishlist: true, forge: false, tidetradr: false },
            wishlist: { ...BLANK_MULTI_DESTINATION_FORM.wishlist, addToMarketWatch: true },
          },
        })),
      },
    ];

    return (
      <div className="vault-quick-add-panel">
        <div className="vault-quick-add-grid">
          {options.map((option) => (
            <button key={option.key} type="button" className="vault-quick-add-option" onClick={option.onClick}>
              <strong>{option.title}</strong>
              <span>{option.helper}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderCatalogPickerCard(product, onSelect) {
    const marketInfo = getTideTradrMarketInfo(product);
    const imageUrl = catalogImage(product);
    return (
      <button key={product.id || catalogTitle(product)} type="button" className="catalog-picker-card" onClick={() => onSelect(product)}>
        <div className="catalog-thumb">
          {imageUrl ? <img src={imageUrl} alt="" /> : (
            <div className="image-needed-placeholder">
              <span>No image</span>
            </div>
          )}
        </div>
        <span className="catalog-picker-copy">
          <strong>{catalogTitle(product)}</strong>
          <small>{catalogProductTypeLabel(product)}{catalogExpansionName(product) ? ` | ${catalogExpansionName(product)}` : ""}</small>
          <small>{marketInfo.currentMarketValue ? `Market: ${money(marketInfo.currentMarketValue)}` : "Market data unavailable"}</small>
          {product._matchReason ? <em>{product._matchReason}</em> : null}
        </span>
      </button>
    );
  }

  function renderVaultCatalogSearchFlowContent() {
    const query = String(vaultCatalogSearchQuery || "").trim();
    const results = getCatalogPickerResults(query, 12);
    const recentSearches = [submittedCatalogSearch, catalogSearch, "151 upc", "pr evo etb", "sv8 booster"]
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index)
      .slice(0, 5);

    return (
      <div className="flow-modal-stack vault-catalog-search-flow">
        <form className="catalog-search-form" onSubmit={runVaultCatalogSearch}>
          <Field label="Search TideTradr Catalog">
            <SmartCatalogSearchBox
              value={vaultCatalogSearchQuery}
              onChange={setVaultCatalogSearchQuery}
              onSearch={(value) => runVaultCatalogSearch(null, value)}
              onSelectSuggestion={selectVaultCatalogSearchSuggestion}
              supabase={supabase}
              isSupabaseConfigured={isSupabaseConfigured}
              mapRow={mapCatalog}
              productGroup="All"
              dataFilter="All"
              placeholder="Search by product, card, set, UPC, SKU, or shorthand..."
              maxSuggestions={8}
              money={money}
            />
          </Field>
          <p className="compact-subtitle">Try: 151 upc, pr evo etb, sv8 booster, zard, pika</p>
          <button type="submit">Search TideTradr</button>
        </form>

        {!query ? (
          <div className="empty-state small-empty-state">
            <h3>Search TideTradr to prefill your Vault item.</h3>
            <p>Use a product name, card name, set, UPC, SKU, or shorthand.</p>
          </div>
        ) : null}

        {!query && recentSearches.length ? (
          <div className="catalog-chip-row" aria-label="Recent catalog searches">
            {recentSearches.map((value) => (
              <button key={value} type="button" className="secondary-button" onClick={() => {
                setVaultCatalogSearchQuery(value);
                runVaultCatalogSearch(null, value);
              }}>
                {value}
              </button>
            ))}
          </div>
        ) : null}

        {query && supabaseCatalogStatus.loading ? (
          <div className="small-empty-state">
            <strong>Searching TideTradr...</strong>
            <span>Looking for catalog matches and shorthand aliases.</span>
          </div>
        ) : null}

        {query && results.length ? (
          <div className="catalog-picker-grid">
            {results.map((product) => renderCatalogPickerCard(product, selectVaultCatalogSearchProduct))}
          </div>
        ) : null}

        {query && !supabaseCatalogStatus.loading && !results.length ? (
          <div className="empty-state small-empty-state">
            <h3>No match found.</h3>
            <p>Continue manual entry or submit a TideTradr suggestion for admin review.</p>
            <div className="flow-modal-top-actions catalog-selector-actions">
              <button type="button" className="secondary-button" onClick={() => openMultiDestinationAddFlow({
                source: "vault-catalog-manual",
                seed: {
                  itemName: vaultCatalogSearchQuery,
                  catalogSearchQuery: vaultCatalogSearchQuery,
                  destinations: { vault: true, wishlist: false, forge: false, tidetradr: false },
                },
              })}>
                Continue manual entry
              </button>
              <button type="button" onClick={() => openMultiDestinationAddFlow({
                source: "vault-catalog-suggestion",
                seed: {
                  itemName: vaultCatalogSearchQuery,
                  catalogSearchQuery: vaultCatalogSearchQuery,
                  destinations: { vault: false, wishlist: false, forge: false, tidetradr: true },
                  tidetradr: { ...BLANK_MULTI_DESTINATION_FORM.tidetradr, action: "suggest" },
                },
              })}>
                Suggest to TideTradr
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function renderVaultScanFlowContent() {
    return (
      <div className="flow-modal-stack vault-placeholder-flow">
        <div className="small-empty-state">
          <strong>Scanning is being prepared for private beta.</strong>
          <span>For now, you can search TideTradr or enter UPC/SKU manually.</span>
        </div>
        <div className="forge-quick-add-grid quick-find-options">
          <button type="button" className="forge-quick-add-option" onClick={() => openVaultCatalogSearchFlow({ source: "vault-scan" })}>
            <strong>Search TideTradr</strong>
            <span>Find a catalog item and prefill the add flow.</span>
          </button>
          <button type="button" className="forge-quick-add-option" onClick={() => openVaultCatalogSearchFlow({ source: "vault-upc" })}>
            <strong>Enter UPC/SKU</strong>
            <span>Type an identifier into catalog search.</span>
          </button>
          <button type="button" className="forge-quick-add-option" onClick={() => {
            if (!closeFlowModal({ force: true, reset: false })) return;
            beginScanProduct("vault");
          }}>
            <strong>Open Scanner</strong>
            <span>Use the camera scanner when permissions are available.</span>
          </button>
          <button type="button" className="forge-quick-add-option" onClick={() => {
            if (!closeFlowModal({ force: true, reset: false })) return;
            openPictureLookupFlow("vault");
          }}>
            <strong>Look Up by Picture</strong>
            <span>Upload a product/card photo and confirm a match.</span>
          </button>
        </div>
      </div>
    );
  }

  function renderVaultImportCollectionFlowContent() {
    return (
      <div className="flow-modal-stack vault-placeholder-flow">
        <div className="small-empty-state">
          <strong>Collection import is being prepared for private beta.</strong>
          <span>You can manually add items or search TideTradr for now.</span>
        </div>
        <div className="forge-quick-add-grid quick-find-options">
          <button type="button" className="forge-quick-add-option" onClick={() => openVaultCatalogSearchFlow({ source: "vault-import" })}>
            <strong>Search TideTradr</strong>
            <span>Prefill one item from the catalog.</span>
          </button>
          <button type="button" className="forge-quick-add-option" onClick={() => openMultiDestinationAddFlow({
            source: "vault-import-manual",
            seed: { destinations: { vault: true, wishlist: false, forge: false, tidetradr: false } },
          })}>
            <strong>Manual Add</strong>
            <span>Add an item with your own details.</span>
          </button>
        </div>
      </div>
    );
  }

  function renderQuickFindFlowContent() {
    const runOption = (action) => {
      if (!closeFlowModal({ force: true, reset: false })) return;
      action();
      setQuickFindForm(BLANK_QUICK_FIND_FORM);
    };

    return (
      <form className="form quick-find-flow" onSubmit={(event) => runQuickFindSearch(event, "general")}>
        <Field label="Catalog Search / UPC / SKU">
          <input
            value={quickFindForm.lookup}
            onChange={(event) => setQuickFindForm({ lookup: event.target.value })}
            placeholder="Search product, card, UPC, SKU, or TCGplayer ID..."
          />
        </Field>
        <div className="forge-quick-add-grid quick-find-options">
          <button type="submit" className="forge-quick-add-option">
            <strong>Search Catalog</strong>
            <span>Run the TideTradr catalog search.</span>
          </button>
          <button type="button" className="forge-quick-add-option" onClick={() => runOption(() => beginScanProduct("none"))}>
            <strong>Scan Product/Card</strong>
            <span>Scan a product or card barcode.</span>
          </button>
          <button type="button" className="forge-quick-add-option" onClick={() => runOption(() => openPictureLookupFlow("none"))}>
            <strong>Look Up by Picture</strong>
            <span>Match from a photo without requiring a UPC.</span>
          </button>
          <button type="button" className="forge-quick-add-option" onClick={() => runQuickFindSearch(null, "barcode")}>
            <strong>Enter UPC/SKU</strong>
            <span>Lookup by identifier when you have one.</span>
          </button>
          <button type="button" className="forge-quick-add-option" onClick={() => runQuickFindSearch(null, "general")}>
            <strong>Manual Lookup</strong>
            <span>Use the search text as a manual catalog query.</span>
          </button>
        </div>
      </form>
    );
  }

  function renderMultiDestinationAddFlowContent() {
    const selectedCatalog = catalogProducts.find((product) => String(product.id) === String(multiDestinationForm.catalogProductId));
    const catalogMatchQuery = String(multiDestinationCatalogQuery || "").trim();
    const catalogMatchResults = getCatalogPickerResults(catalogMatchQuery, 8);
    const destinationOptions = [
      {
        key: "vault",
        title: "Add to Vault",
        helper: "Owned collection or stored item.",
      },
      {
        key: "wishlist",
        title: "Add to Wishlist",
        helper: "Wanted item, not owned yet.",
      },
      {
        key: "forge",
        title: "Add to Forge",
        helper: "Business inventory or seller tracking.",
      },
      {
        key: "tidetradr",
        title: "Add / Suggest to TideTradr",
        helper: "Catalog, watchlist, or product suggestion.",
      },
    ];
    return (
      <form id="multi-destination-add-form" className="form multi-destination-flow" onSubmit={submitMultiDestinationAdd}>
        <section className="flow-form-section">
          <h3>Shared Item Details</h3>
          <div className="flow-form-grid">
            <div className="catalog-selector-panel">
              {selectedCatalog && !multiDestinationMatchSearchOpen ? (
                <div className="selected-product-card selected-match-card">
                  <div className="catalog-thumb selected-match-thumb">
                    {catalogImage(selectedCatalog) ? <img src={catalogImage(selectedCatalog)} alt="" /> : (
                      <div className="image-needed-placeholder"><span>No image</span></div>
                    )}
                  </div>
                  <div className="selected-match-copy">
                    <strong>{catalogTitle(selectedCatalog)}</strong>
                    <span>{catalogExpansionName(selectedCatalog) || "Expansion unavailable"} | {catalogProductTypeLabel(selectedCatalog)}</span>
                    <small>{hasCatalogMarketPrice(selectedCatalog) ? `Market: ${money(getTideTradrMarketInfo(selectedCatalog).currentMarketValue)}` : "Market data unavailable"}</small>
                  </div>
                  <div className="selected-match-actions">
                    <button type="button" className="secondary-button" onClick={() => setMultiDestinationMatchSearchOpen(true)}>
                      Change match
                    </button>
                    <button type="button" className="ghost-button" onClick={clearMultiDestinationCatalogProduct}>
                      Clear match
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <Field label="Product / Card Match">
                    <SmartCatalogSearchBox
                      value={multiDestinationCatalogQuery}
                      onChange={setMultiDestinationCatalogQuery}
                      onSearch={(value) => {
                        setMultiDestinationCatalogQuery(value);
                        if (String(value || "").trim()) {
                          loadImportedPokemonCatalog(value, {
                            page: 1,
                            pageSize: Math.min(24, catalogPageSize || 24),
                            mode: "general",
                            barcode: "",
                            forceSearch: true,
                          });
                        }
                      }}
                      onSelectSuggestion={selectMultiDestinationCatalogSuggestion}
                      supabase={supabase}
                      isSupabaseConfigured={isSupabaseConfigured}
                      mapRow={mapCatalog}
                      productGroup="All"
                      dataFilter="All"
                      placeholder="Search TideTradr by product, set, UPC, SKU, or shorthand..."
                      maxSuggestions={8}
                      money={money}
                    />
                  </Field>
                  <div className="catalog-selector-actions match-tools">
                    <button type="button" className="secondary-button" onClick={() => {
                      const lookup = String(multiDestinationForm.upcSku || multiDestinationCatalogQuery || "").trim();
                      if (lookup) {
                        setMultiDestinationCatalogQuery(lookup);
                        loadImportedPokemonCatalog(lookup, { page: 1, pageSize: Math.min(24, catalogPageSize || 24), mode: "barcode", barcode: lookup, forceSearch: true });
                      }
                    }}>
                      Enter UPC/SKU
                    </button>
                    <button type="button" className="secondary-button" onClick={() => {
                      const destination = multiDestinationForm.destinations.forge ? "forge" : multiDestinationForm.destinations.wishlist ? "wishlist" : multiDestinationForm.destinations.vault ? "vault" : "none";
                      closeFlowModal({ force: true, reset: false });
                      openPictureLookupFlow(destination);
                    }}>
                      Look Up by Picture
                    </button>
                    {selectedCatalog ? (
                      <button type="button" className="secondary-button" onClick={() => setMultiDestinationMatchSearchOpen(false)}>
                        Done
                      </button>
                    ) : null}
                  </div>
                </>
              )}
              {!selectedCatalog ? (
                <p className="compact-subtitle">No TideTradr match selected. Search above, continue manual entry, or suggest a missing product.</p>
              ) : null}
              {catalogMatchQuery && catalogMatchResults.length && (!selectedCatalog || multiDestinationMatchSearchOpen) ? (
                <div className="catalog-selector-results">
                  {catalogMatchResults.map((product) => renderCatalogPickerCard(product, selectMultiDestinationCatalogProduct))}
                </div>
              ) : null}
              {catalogMatchQuery && !catalogMatchResults.length && !selectedCatalog ? (
                <div className="small-empty-state catalog-selector-empty">
                  <strong>No match found.</strong>
                  <span>Continue manual entry or submit this item for TideTradr review.</span>
                  <div className="catalog-selector-actions">
                    <button type="button" className="secondary-button" onClick={() => setMultiDestinationCatalogQuery("")}>
                      Continue manual entry
                    </button>
                    <button type="button" onClick={markMultiDestinationMissingCatalog}>
                      Suggest to TideTradr
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <Field label="Item Name">
              <input
                value={multiDestinationForm.itemName}
                onChange={(event) => updateMultiDestinationField("itemName", event.target.value)}
                placeholder="Destined Rivals Elite Trainer Box"
                required
              />
            </Field>
            <Field label="Type / Category">
              <input
                value={multiDestinationForm.productType}
                onChange={(event) => updateMultiDestinationField("productType", event.target.value)}
                placeholder="Elite Trainer Box, Single Card, Booster Bundle..."
              />
            </Field>
            <Field label="Set / Expansion if known">
              <input
                value={multiDestinationForm.setName}
                onChange={(event) => updateMultiDestinationField("setName", event.target.value)}
                placeholder="Prismatic Evolutions, 151, Surging Sparks..."
              />
            </Field>
            <Field label="Variant if card">
              <input
                value={multiDestinationForm.variant}
                onChange={(event) => updateMultiDestinationField("variant", event.target.value)}
                placeholder="Normal, Holofoil, Reverse Holofoil, promo..."
              />
            </Field>
            <Field label="UPC / SKU if known">
              <input
                value={multiDestinationForm.upcSku}
                onChange={(event) => updateMultiDestinationField("upcSku", event.target.value)}
                placeholder="UPC, retail SKU, or other identifier"
              />
            </Field>
            <Field label="MSRP">
              <input
                type="number"
                min="0"
                step="0.01"
                value={multiDestinationForm.msrpPrice}
                onChange={(event) => updateMultiDestinationField("msrpPrice", event.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label="Market Price">
              <input
                type="number"
                min="0"
                step="0.01"
                value={multiDestinationForm.marketPrice}
                onChange={(event) => updateMultiDestinationField("marketPrice", event.target.value)}
                placeholder="0.00"
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              value={multiDestinationForm.notes}
              onChange={(event) => updateMultiDestinationField("notes", event.target.value)}
              placeholder="Condition notes, source notes, or anything the destination should remember."
            />
          </Field>
        </section>

        <section className="flow-form-section">
          <h3>Destinations</h3>
          <div className="destination-checkbox-grid">
            {destinationOptions.map((option) => {
              const checked = Boolean(multiDestinationForm.destinations[option.key]);
              return (
                <label className={`destination-checkbox ${checked ? "is-selected" : ""}`} key={option.key}>
                  <input type="checkbox" checked={checked} onChange={(event) => updateMultiDestinationToggle(option.key, event.target.checked)} />
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.helper}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        {multiDestinationForm.destinations.vault ? (
          <section className="flow-form-section destination-settings">
            <h3>Vault Settings</h3>
            <div className="flow-form-grid">
              <Field label="Quantity for Vault">
                <input type="number" min="1" value={multiDestinationForm.vault.quantity} onChange={(event) => updateMultiDestinationSection("vault", "quantity", event.target.value)} />
              </Field>
              <Field label="Status / Location">
                <select value={multiDestinationForm.vault.vaultStatus} onChange={(event) => updateMultiDestinationSection("vault", "vaultStatus", event.target.value)}>
                  {VAULT_STATUS_OPTIONS.filter((status) => status.value !== "all").map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Collection Category">
                <input value={multiDestinationForm.vault.vaultCategory} onChange={(event) => updateMultiDestinationSection("vault", "vaultCategory", event.target.value)} />
              </Field>
              <Field label="Cost Basis">
                <input type="number" min="0" step="0.01" value={multiDestinationForm.vault.unitCost} onChange={(event) => updateMultiDestinationSection("vault", "unitCost", event.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Purchase Date">
                <input type="date" value={multiDestinationForm.vault.purchaseDate} onChange={(event) => updateMultiDestinationSection("vault", "purchaseDate", event.target.value)} />
              </Field>
              <Field label="Storage Location">
                <input value={multiDestinationForm.vault.storageLocation} onChange={(event) => updateMultiDestinationSection("vault", "storageLocation", event.target.value)} placeholder="Binder, shelf, box, display case..." />
              </Field>
              <Field label="Vault Notes">
                <textarea value={multiDestinationForm.vault.notes} onChange={(event) => updateMultiDestinationSection("vault", "notes", event.target.value)} placeholder="Owned item notes for Vault only." />
              </Field>
            </div>
          </section>
        ) : null}

        {multiDestinationForm.destinations.wishlist ? (
          <section className="flow-form-section destination-settings">
            <h3>Wishlist Settings</h3>
            <p className="compact-subtitle">
              Wishlist quantity is wanted quantity only. It does not count as owned Vault inventory or collection value.
            </p>
            <div className="flow-form-grid">
              <Field label="Quantity Wanted">
                <input type="number" min="1" value={multiDestinationForm.wishlist.quantity} onChange={(event) => updateMultiDestinationSection("wishlist", "quantity", event.target.value)} />
              </Field>
              <Field label="Priority">
                <select value={multiDestinationForm.wishlist.priority} onChange={(event) => updateMultiDestinationSection("wishlist", "priority", event.target.value)}>
                  {["Low", "Medium", "High", "Grail"].map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </Field>
              <Field label="Target Price">
                <input type="number" min="0" step="0.01" value={multiDestinationForm.wishlist.targetPrice} onChange={(event) => updateMultiDestinationSection("wishlist", "targetPrice", event.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Desired Condition">
                <select value={multiDestinationForm.wishlist.desiredCondition} onChange={(event) => updateMultiDestinationSection("wishlist", "desiredCondition", event.target.value)}>
                  <option value="">Any condition</option>
                  {VAULT_CONDITIONS.filter(Boolean).map((condition) => (
                    <option key={condition} value={condition}>{condition}</option>
                  ))}
                </select>
              </Field>
              <Field label="Wishlist Notes">
                <textarea value={multiDestinationForm.wishlist.notes} onChange={(event) => updateMultiDestinationSection("wishlist", "notes", event.target.value)} placeholder="Why you want it, preferred edition, gift idea, etc." />
              </Field>
              <div className="flow-checkbox-stack">
                <label>
                  <input type="checkbox" checked={Boolean(multiDestinationForm.wishlist.alertMarketPrice)} onChange={(event) => updateMultiDestinationSection("wishlist", "alertMarketPrice", event.target.checked)} />
                  <span>Alert / watch market price when supported</span>
                </label>
                <label>
                  <input type="checkbox" checked={Boolean(multiDestinationForm.wishlist.addToMarketWatch)} onChange={(event) => updateMultiDestinationSection("wishlist", "addToMarketWatch", event.target.checked)} />
                  <span>Add to Market Watch if this item is linked to TideTradr</span>
                </label>
              </div>
            </div>
          </section>
        ) : null}

        {multiDestinationForm.destinations.forge ? (
          <section className="flow-form-section destination-settings">
            <h3>Forge Settings</h3>
            <div className="flow-form-grid">
              <Field label="Quantity for Forge">
                <input type="number" min="1" value={multiDestinationForm.forge.quantity} onChange={(event) => updateMultiDestinationSection("forge", "quantity", event.target.value)} />
              </Field>
              <Field label="Cost Basis">
                <input type="number" min="0" step="0.01" value={multiDestinationForm.forge.unitCost} onChange={(event) => updateMultiDestinationSection("forge", "unitCost", event.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Planned Sell Price">
                <input type="number" min="0" step="0.01" value={multiDestinationForm.forge.plannedSellPrice} onChange={(event) => updateMultiDestinationSection("forge", "plannedSellPrice", event.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Source / Purchase Location">
                <input value={multiDestinationForm.forge.source} onChange={(event) => updateMultiDestinationSection("forge", "source", event.target.value)} placeholder="Target, Best Buy, show, trade..." />
              </Field>
              <Field label="Business Category">
                <input value={multiDestinationForm.forge.businessCategory} onChange={(event) => updateMultiDestinationSection("forge", "businessCategory", event.target.value)} />
              </Field>
              <Field label="Condition">
                <select value={multiDestinationForm.forge.conditionName} onChange={(event) => updateMultiDestinationSection("forge", "conditionName", event.target.value)}>
                  <option value="">Near Mint / Sealed by default</option>
                  {VAULT_CONDITIONS.filter(Boolean).map((condition) => (
                    <option key={condition} value={condition}>{condition}</option>
                  ))}
                </select>
              </Field>
              <Field label="Forge Notes">
                <textarea value={multiDestinationForm.forge.notes} onChange={(event) => updateMultiDestinationSection("forge", "notes", event.target.value)} placeholder="Business inventory notes for Forge only." />
              </Field>
            </div>
          </section>
        ) : null}

        {multiDestinationForm.destinations.tidetradr ? (
          <section className="flow-form-section destination-settings">
            <h3>TideTradr Settings</h3>
            <p className="compact-subtitle">
              TideTradr is catalog and market data. Normal users submit new universal catalog items for review; admins can create directly.
            </p>
            <div className="flow-form-grid">
              <div className="selected-product-card tide-tradr-link-card">
                <div>
                  <strong>{selectedCatalog ? "Link to existing TideTradr product" : "Suggest missing product"}</strong>
                  <span>{selectedCatalog ? catalogTitle(selectedCatalog) : "No existing product selected. Search Product / Card Match above to link one."}</span>
                </div>
                {selectedCatalog ? (
                  <button type="button" className="secondary-button" onClick={clearMultiDestinationCatalogProduct}>
                    Clear
                  </button>
                ) : (
                  <button type="button" className="secondary-button" onClick={markMultiDestinationMissingCatalog}>
                    Use as suggestion
                  </button>
                )}
              </div>
              <Field label="MSRP">
                <input type="number" min="0" step="0.01" value={multiDestinationForm.tidetradr.msrpPrice} onChange={(event) => updateMultiDestinationSection("tidetradr", "msrpPrice", event.target.value)} placeholder="Optional" />
              </Field>
              <Field label="UPC">
                <input value={multiDestinationForm.tidetradr.upc} onChange={(event) => updateMultiDestinationSection("tidetradr", "upc", event.target.value)} />
              </Field>
              <Field label="SKU">
                <input value={multiDestinationForm.tidetradr.sku} onChange={(event) => updateMultiDestinationSection("tidetradr", "sku", event.target.value)} />
              </Field>
              <Field label="Set / Expansion">
                <input value={multiDestinationForm.tidetradr.setName} onChange={(event) => updateMultiDestinationSection("tidetradr", "setName", event.target.value)} />
              </Field>
              <Field label="Product Type">
                <input value={multiDestinationForm.tidetradr.productType} onChange={(event) => updateMultiDestinationSection("tidetradr", "productType", event.target.value)} />
              </Field>
              <Field label="Release Date / Year">
                <input value={multiDestinationForm.tidetradr.releaseDate} onChange={(event) => updateMultiDestinationSection("tidetradr", "releaseDate", event.target.value)} placeholder="2026-05-30 or 2026" />
              </Field>
              <Field label="Source / Proof URL">
                <input value={multiDestinationForm.tidetradr.sourceUrl} onChange={(event) => updateMultiDestinationSection("tidetradr", "sourceUrl", event.target.value)} placeholder="Official, retailer, or price source URL" />
              </Field>
              <Field label="Correction Notes">
                <textarea value={multiDestinationForm.tidetradr.correctionNotes} onChange={(event) => updateMultiDestinationSection("tidetradr", "correctionNotes", event.target.value)} placeholder="What should TideTradr/admin review?" />
              </Field>
            </div>
          </section>
        ) : null}

        <p className="compact-subtitle">Cancel and Add Item stay available in the modal footer.</p>
      </form>
    );
  }

  function renderVaultMoveToForgeFlowContent() {
    const movableVaultItems = activeVaultItems.filter((item) => normalizeVaultStatus(item) !== "wishlist");

    if (!movableVaultItems.length) {
      return (
        <div className="empty-state small-empty-state vault-move-empty">
          <h3>No movable Vault items yet.</h3>
          <p>Add a personal collection or sealed item first, then move it into Forge when it becomes business inventory.</p>
          <button type="button" onClick={() => {
            if (!closeFlowModal({ force: true })) return;
            openVaultQuickAdd({ category: "Personal collection", subTab: "collection" });
          }}>
            Add Item to Vault
          </button>
        </div>
      );
    }

    return (
      <div className="vault-move-panel">
        <p className="compact-subtitle">Pick the item you want to transfer. You will review quantity and cost before confirming.</p>
        <div className="vault-move-list">
          {movableVaultItems.slice(0, 10).map((item) => (
            <button key={item.id} type="button" className="vault-move-option" onClick={() => {
              if (!closeFlowModal({ force: true })) return;
              setSelectedVaultDetailId(item.id);
              openVaultForgeTransfer(item, "move");
            }}>
              <span>
                <strong>{item.name}</strong>
                <small>{vaultStatusLabel(normalizeVaultStatus(item))} | Qty {item.quantity || 1}</small>
              </span>
              <em>{money(Number(item.marketPrice || 0) * Number(item.quantity || 1))}</em>
            </button>
          ))}
        </div>
        {movableVaultItems.length > 10 ? (
          <p className="compact-subtitle">Showing 10 of {movableVaultItems.length}. Use Vault Items filters to open a specific item.</p>
        ) : null}
      </div>
    );
  }

  function renderForgeImportFlowContent() {
    const previewRows = forgeImportForm.previewRows || [];
    return (
      <form className="form forge-import-flow" onSubmit={confirmForgeImportFile}>
        <div className="flow-form-grid">
          <Field label="Upload File">
            <input type="file" accept=".csv,.xlsx,.xls,.json,.txt,.tsv" onChange={handleForgeImportFileUpload} />
          </Field>
          <Field label="Import Type">
            <select value={forgeImportForm.importType} onChange={(event) => setForgeImportForm((current) => ({ ...current, importType: event.target.value }))}>
              <option>Inventory</option>
              <option>Sales</option>
              <option>Expenses</option>
              <option>Marketplace listings</option>
              <option>Mixed/auto-detect</option>
            </select>
          </Field>
          <Field label="Source / App Name">
            <input
              value={forgeImportForm.sourceApp}
              onChange={(event) => setForgeImportForm((current) => ({ ...current, sourceApp: event.target.value }))}
              placeholder="eBay, Whatnot, Google Sheets, Collectr..."
            />
          </Field>
          <Field label="Selected File">
            <input value={forgeImportForm.fileName || "No file selected"} readOnly />
          </Field>
        </div>

        <details className="forge-import-mapping" open={Boolean(forgeImportForm.detectedColumns.length || previewRows.length)}>
          <summary>Preview detected columns and mapping</summary>
          {forgeImportForm.detectedColumns.length ? (
            <div className="forge-import-columns">
              {forgeImportForm.detectedColumns.map((column) => <span key={column}>{column}</span>)}
            </div>
          ) : (
            <p className="compact-subtitle">Choose a CSV or JSON file to preview columns. XLSX is accepted, but CSV gives the cleanest beta preview.</p>
          )}
          <Field label="Mapping Notes">
            <textarea
              value={forgeImportForm.mappingNotes}
              onChange={(event) => setForgeImportForm((current) => ({ ...current, mappingNotes: event.target.value }))}
              placeholder="Example: title maps to item name, paid maps to cost, sold_at maps to sale date..."
            />
          </Field>
        </details>

        {previewRows.length ? (
          <div className="forge-import-preview-list">
            {previewRows.slice(0, 5).map((row) => (
              <div className="inventory-card compact-card" key={row.importedItemId}>
                <div>
                  <h3>{row.itemName}</h3>
                  <p>{row.productType || row.setName || "Imported row"}</p>
                  <small>{row.possibleMatchName ? `Catalog match: ${row.possibleMatchName}` : "No catalog match yet"} | Qty {row.quantity || 1}</small>
                </div>
                <span className="status-badge">{row.sourceType}</span>
              </div>
            ))}
            {previewRows.length > 5 ? <p className="compact-subtitle">Showing 5 of {previewRows.length} rows.</p> : null}
          </div>
        ) : (
          <div className="empty-state small-empty-state">
            <h3>Choose a file to preview before saving.</h3>
            <p>CSV and JSON can preview columns now. XLSX is accepted for beta planning and works best after exporting to CSV.</p>
          </div>
        )}

        <div className="flow-form-footer">
          <button type="submit" disabled={!forgeImportForm.fileName}>Import / Save</button>
        </div>
      </form>
    );
  }

  function renderFlowModalContent() {
    if (activeFlowModal?.type === "forgeQuickAdd") return renderForgeQuickAddFlowContent();
    if (activeFlowModal?.type === "forgeImport") return renderForgeImportFlowContent();
    if (activeFlowModal?.type === "vaultQuickAdd") return renderVaultQuickAddFlowContent();
    if (activeFlowModal?.type === "vaultCatalogSearch") return renderVaultCatalogSearchFlowContent();
    if (activeFlowModal?.type === "vaultScan") return renderVaultScanFlowContent();
    if (activeFlowModal?.type === "vaultImportCollection") return renderVaultImportCollectionFlowContent();
    if (activeFlowModal?.type === "quickFind") return renderQuickFindFlowContent();
    if (activeFlowModal?.type === "multiDestinationAdd") return renderMultiDestinationAddFlowContent();
    if (activeFlowModal?.type === "vaultMoveToForge") return renderVaultMoveToForgeFlowContent();
    if (activeFlowModal?.type === "addInventory") return renderAddInventoryFlowContent();
    if (activeFlowModal?.type === "addSale") return renderAddSaleFlowContent();
    if (activeFlowModal?.type === "addExpense") return renderAddExpenseFlowContent();
    if (activeFlowModal?.type === "addMileage") return renderAddMileageFlowContent();
    if (activeFlowModal?.type === "createListing") return renderMarketplaceCreateFlowContent();
    if (activeFlowModal?.type === "tidepoolCreatePost") return renderTidepoolCreatePostFlowContent();
    if (activeFlowModal?.type === "scoutSubmit") return renderScoutSubmitFlowContent();
    return null;
  }

  useEffect(() => {
    if (!activeFlowModal) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      const focusable = flowModalRef.current?.querySelector("button, [href], input, select, textarea, summary, [tabindex]:not([tabindex='-1'])");
      focusable?.focus?.();
    });
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [activeFlowModal?.id]);

  useEffect(() => {
    const modalIsOpen = Boolean(activeFlowModal || showInventoryScanner || listingReviewOpen || dealFinderOpen || showVaultAddForm || selectedCatalogDetailId || scoutScoreModalOpen || feedbackDialog);
    if (!modalIsOpen) return undefined;
    function handleModalKeyDown(event) {
      if (event.key === "Tab" && activeFlowModal && flowModalRef.current) {
        const focusable = [...flowModalRef.current.querySelectorAll("button, [href], input, select, textarea, summary, [tabindex]:not([tabindex='-1'])")]
          .filter((node) => !node.disabled && node.offsetParent !== null);
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
      if (event.key !== "Escape") return;
      if (showInventoryScanner) {
        event.preventDefault();
        setShowInventoryScanner(false);
        setScanReview(null);
        setScanMatches([]);
        setScanInput("");
        return;
      }
      if (listingReviewOpen) {
        event.preventDefault();
        setListingReviewOpen(false);
        return;
      }
      if (activeFlowModal) {
        event.preventDefault();
        closeFlowModal();
        return;
      }
      if (dealFinderOpen) {
        event.preventDefault();
        setDealFinderOpen(false);
        return;
      }
      if (showVaultAddForm) {
        event.preventDefault();
        closeVaultAddModal();
        return;
      }
      if (selectedCatalogDetailId) {
        event.preventDefault();
        setSelectedCatalogDetailId("");
        return;
      }
      if (scoutScoreModalOpen) {
        event.preventDefault();
        setScoutScoreModalOpen(false);
        return;
      }
      if (selectedScoutReport) {
        event.preventDefault();
        setSelectedScoutReport(null);
        return;
      }
      if (scoutReportDeleteTarget) {
        event.preventDefault();
        setScoutReportDeleteTarget(null);
        return;
      }
      if (feedbackDialog) {
        event.preventDefault();
        closeFeedbackDialog();
      }
    }
    document.addEventListener("keydown", handleModalKeyDown);
    return () => document.removeEventListener("keydown", handleModalKeyDown);
  }, [activeFlowModal, showInventoryScanner, listingReviewOpen, dealFinderOpen, showVaultAddForm, selectedCatalogDetailId, scoutScoreModalOpen, selectedScoutReport, scoutReportDeleteTarget, feedbackDialog, feedbackForm, itemForm, saleForm, expenseForm, tripForm, marketplaceForm, forgeImportForm, tidepoolPostForm]);

  if (!user) {
    return (
      <div className={`app app-${String(activeMainTab || activeTab || "home").toLowerCase()}`}>
        <header className="header app-shell-header app-shell-header--full">
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
    <div className={`app app-${String(activeMainTab || activeTab || "home").toLowerCase()} app-header-${headerMode}`}>
    <header className={`header app-shell-header app-shell-header--${headerMode}`}>
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

  <p>{activeTabLabel} | {BETA_LOCAL_MODE ? "Private Beta" : `Cloud sync: ${user.email}`}</p>

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
    className="topbar-brand"
    aria-label="Go to Home"
    onClick={() => {
      setQuickAddMenuOpen(false);
      setSearchExpanded(false);
      setActiveTab("dashboard");
    }}
  >
    E&amp;T TCG
  </button>
  <button
    type="button"
    className="menu-button"
    onClick={() => {
      setQuickAddMenuOpen(false);
      setMenuOpen(true);
    }}
  >
    ☰ Menu
  </button>
  <select
    className="topbar-section-select"
    aria-label="Switch app section"
    value={topbarSectionValue}
    onChange={(event) => navigateTopbarSection(event.target.value)}
  >
    {topbarSectionOptions.map((option) => (
      <option key={option.key} value={option.key}>{option.label}</option>
    ))}
  </select>

  <button
    type="button"
    className="topbar-market-link"
    onClick={() => {
      setQuickAddMenuOpen(false);
      openTidepoolCommunity("Latest");
    }}
  >
    Tidepool
  </button>
  <button
    type="button"
    className="topbar-mobile-scan"
    onClick={() => {
      setQuickAddMenuOpen(false);
      beginScanProduct(activeTab === "vault" ? "vault" : activeTab === "inventory" ? "forge" : "none");
    }}
  >
    Scan
  </button>
  <button
    type="button"
    className="topbar-mobile-add"
    onClick={() => {
      setQuickAddMenuOpen(false);
      openMultiDestinationAddFlow({ source: "topbar" });
    }}
  >
    Add
  </button>

  <div className={searchExpanded ? "app-search expanded" : "app-search"}>
    {searchExpanded ? (
      <div className="app-search-mobile-header">
        <strong>{activeTab === "market" ? "Quick Find" : "Search"}</strong>
        <button type="button" className="modal-icon-close" aria-label="Close search" onClick={closeSearchResults}>X</button>
      </div>
    ) : null}
    <button
      type="button"
      className="app-search-toggle"
      aria-label={activeTab === "market" ? "Quick Find TideTradr" : "Search E&T TCG"}
      onClick={() => {
        setQuickAddMenuOpen(false);
        if (activeTab === "market") {
          openQuickFindFlow({ source: "market" });
          return;
        }
        setSearchExpanded((current) => !current);
      }}
    >
      {activeTab === "market" ? "Quick Find" : "Search"}
    </button>
    <input
      value={appSearchQuery}
      onFocus={() => setSearchExpanded(true)}
      onChange={(event) => {
        setQuickAddMenuOpen(false);
        setAppSearchQuery(event.target.value);
        setSearchExpanded(true);
      }}
      placeholder="Try: sv8 etb, 151 zard, evs booster..."
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
          <div>
            <p className="compact-subtitle">No matches yet. Try: sv8 etb, 151 zard, evs booster, crz tin, pri etb, 199/165, target greenbrier.</p>
            {appSearchSuggestion ? (
              <button type="button" className="secondary-button" onClick={() => setAppSearchQuery(appSearchSuggestion)}>
                Did you mean {appSearchSuggestion}?
              </button>
            ) : null}
          </div>
        ) : (
          <div className="app-search-list">
            {appSearchResults.map((result) => (
              <div className="app-search-result" key={result.id}>
                <button type="button" className="app-search-result-main" onClick={() => viewSearchResult(result)}>
                  {(result.category === "Products" || result.category === "Cards") && getCatalogImage(result.source) ? (
                    <img className="app-search-thumb" src={getCatalogImage(result.source)} alt="" />
                  ) : null}
                  <span>{result.category}</span>
                  <strong>{result.title}</strong>
                  <small>{result.subtitle}{result.reason ? ` • ${result.reason}` : ""}</small>
                </button>
                <div className="app-search-actions">
                  {renderSearchActions(result)}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="compact-subtitle">Try: pri etb, 151 bundle, zard 199, gengar sir, walmart greenbrier, mini tin.</p>
      </div>
    ) : null}
  </div>
</div>

      <nav className="main-tabs app-main-tabs" aria-label="E&T TCG main tabs">
        {mainTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeMainTab === tab.key ? "main-tab active" : "main-tab"}
            onClick={() => navigateMainTab(tab)}
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
              {renderMenuPullDown("account", "Account", "App version, sign-in, private beta status, and account actions", (
                <div className="drawer-links">
                  <div className="drawer-info-card account-status-card">
                    <div>
                      <h3>{accountStatusTitle}</h3>
                      <p className="compact-subtitle">{accountStatusDescription}</p>
                    </div>
                    <dl className="drawer-status-list">
                      <div><dt>App Version</dt><dd>E&T TCG beta web app</dd></div>
                      <div><dt>Account</dt><dd>{signedInWithSupabase ? "Supabase" : "Private beta"}</dd></div>
                      <div><dt>Role</dt><dd>{adminUser ? "Admin" : "User"}</dd></div>
                      <div><dt>Tier</dt><dd>{TIER_LABELS[currentTier] || "Free"}</dd></div>
                      <div><dt>Data</dt><dd>{cloudSyncPreference === "cloud" ? "Local now, cloud sync requested" : "Stored on this device"}</dd></div>
                    </dl>
                    {adminUser ? <span className="status-badge">Admin</span> : null}
                  </div>
                  {!signedInWithSupabase ? (
                    <form className="drawer-info-card" onSubmit={handleAuth}>
                      <strong>{authMode === "login" ? "Sign in with Supabase" : "Create Supabase account"}</strong>
                      <p className="compact-subtitle">Sign in for admin tools and future cloud sync. User-owned beta data stays local for now.</p>
                      {!isSupabaseConfigured ? <p className="compact-subtitle danger-text">Supabase anon auth is not configured in this frontend.</p> : null}
                      <input
                        className="drawer-field"
                        type="email"
                        value={authEmail}
                        onChange={(event) => setAuthEmail(event.target.value)}
                        placeholder="Email"
                        autoComplete="email"
                      />
                      <input
                        className="drawer-field"
                        type="password"
                        value={authPassword}
                        onChange={(event) => setAuthPassword(event.target.value)}
                        placeholder="Password"
                        autoComplete={authMode === "login" ? "current-password" : "new-password"}
                      />
                      <div className="drawer-inline-actions">
                        <button type="submit" className="drawer-link" disabled={authLoading || !isSupabaseConfigured}>
                          {authLoading ? "Working..." : authMode === "login" ? "Sign In" : "Create Account"}
                        </button>
                        <button type="button" className="drawer-link" onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}>
                          {authMode === "login" ? "Create Account" : "Use Login"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="drawer-info-card">
                      <strong>{adminUser ? "Signed in as Admin" : "Signed in"}</strong>
                      <p className="compact-subtitle">Supabase session is active. Log out only clears the account session; it does not erase private beta records on this device.</p>
                      <button type="button" className="drawer-link logout-link" onClick={() => runMenuAction(signOut)}>Log Out</button>
                    </div>
                  )}
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("mySuggestions"))}>My Suggestions</button>
                  <div className="drawer-danger-zone">
                    <strong>Danger zone</strong>
                    <p className="compact-subtitle">Resetting private beta data clears saved beta records on this device. Export first if you want a backup.</p>
                    <button type="button" className="drawer-link drawer-danger-link" onClick={resetBetaLocalData}>Reset Private Beta Data</button>
                  </div>
                </div>
              ), "Acct")}
              {renderMenuPullDown("settings", "Settings", "Appearance, location, notifications, and dashboard display", (
                <div className="drawer-links">
                  <div className="drawer-info-card">
                    <strong>Appearance</strong>
                    <p className="compact-subtitle">Current density: {dashboardCardStyle}. Keep the beta compact on mobile, or switch to a roomier card style.</p>
                    <div className="drawer-inline-actions">
                      {DASHBOARD_CARD_STYLES.map((style) => (
                        <button
                          key={style}
                          type="button"
                          className={dashboardCardStyle === style ? "drawer-link active" : "drawer-link"}
                          onClick={() => updateDashboardCardStyle(style)}
                        >
                          {style.charAt(0).toUpperCase() + style.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="drawer-info-card">
                    <strong>Location</strong>
                    <p className="compact-subtitle">Location is used for nearby Scout stores and alerts. Device location stays off unless you enable it.</p>
                    <input
                      className="drawer-field"
                      value={locationSettings.manualLocation}
                      onChange={(event) => updateLocationSettings({ mode: "manual", manualLocation: event.target.value, trackingEnabled: false })}
                      placeholder="ZIP or city"
                    />
                    <div className="drawer-inline-actions">
                      <button type="button" className="drawer-link" onClick={saveManualLocation}>Save Location</button>
                      <button type="button" className="drawer-link" onClick={enableLocationTracking}>Use Device Location</button>
                      <button type="button" className="drawer-link" onClick={disableLocationTracking}>Turn Off Location</button>
                    </div>
                  </div>
                  <div className="drawer-info-card">
                    <strong>Notifications</strong>
                    <p className="compact-subtitle">Push/text notifications are coming soon. These local preferences keep the Scout Alerts flow ready for beta.</p>
                    <div className="menu-toggle-list">
                      {notificationPreferenceRows.map((row) => (
                        <label className="toggle-row" key={row.key}>
                          <span>
                            <strong>{row.label}</strong>
                            <small>{row.description}</small>
                          </span>
                          <input
                            type="checkbox"
                            checked={scoutSnapshot.alertSettings?.[row.key] !== false}
                            onChange={(event) => updateScoutAlertPreference(row.key, event.target.checked)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="drawer-info-card">
                    <strong>Dashboard Display Settings</strong>
                    <p className="compact-subtitle">Choose which Home cards and sections are visible. This only changes the dashboard display, not your saved data.</p>
                    <div className="menu-toggle-list">
                      {menuHomeStatRows.map((row) => (
                        <label className="toggle-row" key={row.key}>
                          <span><strong>{row.label}</strong></span>
                          <input
                            type="checkbox"
                            checked={
                              row.key === "alerts"
                                ? scoutSnapshot.alertSettings?.showHomeActiveAlerts !== false
                                : row.key === "marketUpdates"
                                  ? scoutSnapshot.alertSettings?.showHomeMarketUpdates !== false
                                  : homeStatsEnabled[row.key] !== false
                            }
                            onChange={(event) => {
                              if (row.key === "alerts") {
                                updateScoutAlertPreference("showHomeActiveAlerts", event.target.checked);
                                return;
                              }
                              if (row.key === "marketUpdates") {
                                updateScoutAlertPreference("showHomeMarketUpdates", event.target.checked);
                                return;
                              }
                              updateHomeStatsEnabled({ [row.key]: event.target.checked });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    <details className="drawer-subdetails">
                      <summary>Home sections</summary>
                      <div className="menu-toggle-list">
                        {menuDashboardSectionRows.map((row) => {
                          const section = dashboardSectionState(row.key);
                          return (
                            <label className="toggle-row" key={row.key}>
                              <span><strong>{row.label}</strong></span>
                              <input
                                type="checkbox"
                                checked={section.enabled !== false}
                                onChange={(event) => updateDashboardSection(row.key, { enabled: event.target.checked })}
                              />
                            </label>
                          );
                        })}
                      </div>
                    </details>
                  </div>
                </div>
              ), "Gear")}
              {renderMenuPullDown("data", "Data & Backup", "Export, import, clear private beta data, and storage status", (
                <>
                  <div className="drawer-info-card">
                    <strong>Optional Cloud Sync</strong>
                    <p className="compact-subtitle">Your beta data is stored on this device unless you export it or connect cloud sync. Cloud sync is not active yet.</p>
                    <dl className="drawer-status-list">
                      <div><dt>Current mode</dt><dd>{BETA_LOCAL_MODE ? "Private beta" : "Cloud-ready"}</dd></div>
                      <div><dt>Preference</dt><dd>{cloudSyncPreference === "cloud" ? "Cloud sync access requested" : "Keep local"}</dd></div>
                    </dl>
                    <div className="drawer-inline-actions">
                      <button type="button" className={cloudSyncPreference === "local" ? "drawer-link active" : "drawer-link"} onClick={() => updateCloudSyncPreference("local")}>Keep Private Beta Local</button>
                      <button type="button" className={cloudSyncPreference === "cloud" ? "drawer-link active" : "drawer-link"} onClick={() => updateCloudSyncPreference("cloud")}>Request Cloud Sync Access</button>
                    </div>
                  </div>
                  <BackupExportImport
                    storageStatus={storageStatus}
                    importPreview={backupImportPreview}
                    importMessage={backupImportMessage}
                    onExport={downloadBackup}
                    onImportFile={handleBackupFileUpload}
                    onApplyImport={applyBetaBackupImport}
                    onClearDemoData={resetBetaLocalData}
                  />
                  {adminToolsVisible ? (
                    <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("adminReview"))}>
                      Admin Review Queue
                    </button>
                  ) : null}
                </>
              ), "Data")}
              {renderMenuPullDown("feedback", "Feedback / Help", "Send feedback, report bugs, and app help", (
                <div className="drawer-links">
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openFeedbackDialog("feedback"))}>Send Feedback</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openFeedbackDialog("bug"))}>Report a Bug</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openFeedbackDialog("feature"))}>Request a Feature</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openFeedbackDialog("catalog_data"))}>Report Bad Catalog Data</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openFeedbackDialog("store_data"))}>Report Bad Store Data</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openFeedbackDialog("market_data"))}>Report Wrong Market Price</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setVaultToast("How to Use App guide is coming soon for beta testers."))}>How to Use App</button>
                </div>
              ), "Help")}
              {renderMenuPullDown("community", "Community / Tidepool", "Tidepool, guidelines, and community rules", (
                <div className="drawer-links">
                  <div className="drawer-info-card">
                    <strong>Tidepool</strong>
                    <p className="compact-subtitle">Community hub for reports, guidelines, questions, and future Discord/community tools.</p>
                  </div>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openTidepoolCommunity("Latest"))}>Open Tidepool</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setVaultToast("Report Guidelines are coming soon for beta."))}>Report Guidelines</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setVaultToast("Community Rules are coming soon for beta."))}>Community Rules</button>
                  <button type="button" className="drawer-link disabled-link" disabled>Discord Coming Soon</button>
                </div>
              ), "Chat")}
              {renderMenuPullDown("subscription", "Plans & Features", "Free vs paid features and beta planning", (
                <div className="drawer-links">
                  <div className="drawer-info-card">
                    <strong>Paid plans are not active yet.</strong>
                    <p className="compact-subtitle">This is a preview for beta planning. Preview only. Plans are not active.</p>
                  </div>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("dashboard"))}>Free vs Paid Feature Preview</button>
                  <button type="button" className="drawer-link disabled-link" disabled>Upgrade Coming Soon</button>
                </div>
              ), "Plan")}
              {adminToolsVisible ? renderMenuPullDown("admin", "Admin Tools", "Admin moderation, imports, suggestions, and shared data controls", (
                <div className="drawer-links">
                  <div className="drawer-info-card">
                    <strong>{adminUser ? "Admin Tools" : "Private Beta Admin Tools"}</strong>
                    <p className="compact-subtitle">{adminUser ? "Admin tools for moderation, imports, suggestions, and shared data controls." : "Private beta admin mode is enabled for testing review queues."} Protected credentials stay server-side.</p>
                  </div>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("adminReview"))}>Open Admin Dashboard</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("All"); setActiveTab("adminReview"); })}>Import Status & Review Queue</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openTidepoolCommunity("Needs Review"))}>Tidepool Moderation</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("Market Source Controls"); setActiveTab("adminReview"); })}>Market Source Controls</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("Marketplace Listings"); setActiveTab("adminReview"); })}>Marketplace Listing Review</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("Store Suggestions"); setActiveTab("adminReview"); })}>Store Correction Review</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("Catalog Suggestions"); setActiveTab("adminReview"); })}>Catalog Correction Review</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("SKU / UPC Suggestions"); setActiveTab("adminReview"); })}>Best Buy SKU Review</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("Scout Report Review"); setActiveTab("adminReview"); })}>Scout Report Review</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("Store Intelligence Suggestions"); setActiveTab("adminReview"); })}>Store Intelligence Suggestions</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("Flagged / Duplicate Items"); setActiveTab("adminReview"); })}>Flagged / Duplicate Items</button>
                </div>
              ), "Admin") : null}
            </div>
            <div className="drawer-footer-card">
              <span>E&T TCG beta web app</span>
              {signedInWithSupabase ? (
                <button type="button" className="logout-link" onClick={() => runMenuAction(signOut)}>Log Out</button>
              ) : (
                <button type="button" className="secondary-button" onClick={() => { setAuthMode("login"); setMenuSectionsOpen({ account: true }); }}>
                  Sign In
                </button>
              )}
            </div>
          </aside>
        </>
      ) : null}

      {activeFlowModal ? (
        <div className="location-modal-backdrop flow-modal-backdrop" role="presentation" onClick={() => closeFlowModal()}>
          <section
            ref={flowModalRef}
            className={`location-modal flow-modal flow-modal-${flowModalMeta().size || activeFlowModal.size || "medium"}`}
            data-flow={activeFlowModal?.type || ""}
            role="dialog"
            aria-modal="true"
            aria-labelledby="flow-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-title-row modal-sticky-header">
              <div>
                <h2 id="flow-modal-title">{flowModalMeta().title}</h2>
                <p>{flowModalMeta().description}</p>
              </div>
              <button type="button" className="modal-close-button" aria-label={`Close ${flowModalMeta().title}`} onClick={() => closeFlowModal()}>
                X
              </button>
            </div>
            <div className="flow-modal-body">
              {renderFlowModalContent()}
            </div>
            <div className="location-modal-actions modal-sticky-footer flow-modal-footer">
              <button type="button" className="secondary-button" onClick={() => closeFlowModal()}>
                {["addInventory", "addSale", "addExpense", "addMileage", "createListing", "forgeImport", "scoutSubmit", "tidepoolCreatePost", "multiDestinationAdd"].includes(activeFlowModal?.type) || isFlowModalDirty() ? "Cancel" : "Close"}
              </button>
              {activeFlowModal?.type === "multiDestinationAdd" ? (
                <button type="submit" form="multi-destination-add-form">Add Item</button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {listingReviewOpen ? (
        <div className="location-modal-backdrop" role="presentation" onClick={() => setListingReviewOpen(false)}>
          <section className="location-modal marketplace-review-modal" role="dialog" aria-modal="true" aria-labelledby="listing-review-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title-row modal-sticky-header">
              <div>
                <h2 id="listing-review-title">Review Listing</h2>
                <p>Public listings are submitted for review before they appear in Marketplace.</p>
              </div>
              <button type="button" className="modal-close-button" aria-label="Close listing review" onClick={() => setListingReviewOpen(false)}>X</button>
            </div>
            {renderMarketplaceListingCard(buildMarketplaceListing("Pending Review"))}
            <div className="location-modal-actions modal-sticky-footer">
              <button type="button" onClick={() => saveMarketplaceListing("Submit")}>Submit for Review</button>
              <button type="button" className="secondary-button" onClick={() => setListingReviewOpen(false)}>Cancel</button>
            </div>
          </section>
        </div>
      ) : null}

      {feedbackDialog ? (
        <div className="location-modal-backdrop" role="presentation" onClick={() => closeFeedbackDialog()}>
          <form
            className="location-modal feedback-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-dialog-title"
            onSubmit={submitFeedbackDialog}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-title-row">
              <div>
                <h2 id="feedback-dialog-title">{feedbackDialogCopy.title}</h2>
                <p>{feedbackDialogCopy.intro}</p>
              </div>
              <button type="button" className="modal-close-button" aria-label={`Close ${feedbackDialogCopy.title}`} onClick={() => closeFeedbackDialog()}>
                X
              </button>
            </div>
            <Field label={feedbackDialogCopy.label}>
              <textarea
                value={feedbackForm.whatHappened}
                onChange={(event) => setFeedbackForm((current) => ({ ...current, whatHappened: event.target.value }))}
                placeholder={feedbackDialogCopy.placeholder}
              />
            </Field>
            <Field label="Page / screen">
              <input
                value={feedbackForm.page}
                onChange={(event) => setFeedbackForm((current) => ({ ...current, page: event.target.value }))}
                placeholder="Home, Scout, The Vault..."
              />
            </Field>
            <Field label={feedbackDialogCopy.stepsLabel}>
              <textarea
                value={feedbackForm.steps}
                onChange={(event) => setFeedbackForm((current) => ({ ...current, steps: event.target.value }))}
                placeholder={feedbackDialogCopy.stepsPlaceholder}
              />
            </Field>
            <div className="small-empty-state">
              <strong>Optional screenshot - coming soon</strong>
              <p>Screenshot upload is not connected yet. For now, describe what you saw or export beta data if support needs details.</p>
            </div>
            <dl className="drawer-status-list feedback-metadata">
              <div><dt>Version</dt><dd>{feedbackForm.metadata?.appVersion || "Beta"}</dd></div>
              <div><dt>Screen</dt><dd>{feedbackForm.metadata?.route || activeTab}</dd></div>
              <div><dt>Device</dt><dd>{feedbackForm.metadata?.device || "Unknown"}</dd></div>
              <div><dt>Time</dt><dd>{feedbackForm.metadata?.timestamp ? new Date(feedbackForm.metadata.timestamp).toLocaleString() : "Now"}</dd></div>
            </dl>
            <div className="location-modal-actions">
              <button type="submit">{feedbackDialogCopy.submit}</button>
              <button type="button" className="secondary-button" onClick={() => closeFeedbackDialog()}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}

      {suggestionConflict ? (
        <div className="location-modal-backdrop" role="presentation" onClick={() => resolveSuggestionConflict("cancel")}>
          <section className="location-modal suggestion-conflict-modal" role="dialog" aria-modal="true" aria-labelledby="suggestion-conflict-title" onClick={(event) => event.stopPropagation()}>
            <div>
              <h2 id="suggestion-conflict-title">Similar suggestion under review</h2>
              <p>A similar suggestion is already under review. You can add your confirmation, submit a separate suggestion, or cancel.</p>
            </div>
            <div className="drawer-info-card">
              <strong>{suggestionTitle(suggestionConflict.duplicate)}</strong>
              <p className="compact-subtitle">{SUGGESTION_TYPE_LABELS[suggestionConflict.duplicate.suggestionType] || suggestionConflict.duplicate.suggestionType} - {suggestionConflict.duplicate.status}</p>
            </div>
            <div className="location-modal-actions">
              <button type="button" onClick={() => resolveSuggestionConflict("confirm")}>Add My Confirmation</button>
              <button type="button" className="secondary-button" onClick={() => resolveSuggestionConflict("new")}>Submit New Suggestion Anyway</button>
              <button type="button" className="ghost-button" onClick={() => resolveSuggestionConflict("cancel")}>Cancel</button>
            </div>
          </section>
        </div>
      ) : null}

      {vaultListingDecision ? (
        <div className="location-modal-backdrop" role="presentation" onClick={() => handleVaultMarketplaceDecision("cancel")}>
          <section className="location-modal" role="dialog" aria-modal="true" aria-labelledby="vault-listing-title" onClick={(event) => event.stopPropagation()}>
            <div>
              <h2 id="vault-listing-title">Create listing from Vault?</h2>
              <p>Do you want to copy this item to a listing or move it out of Vault first?</p>
            </div>
            <div className="drawer-info-card">
              <strong>{vaultListingDecision.name}</strong>
              <p className="compact-subtitle">Qty {vaultListingDecision.quantity || 1} | {vaultStatusLabel(normalizeVaultStatus(vaultListingDecision))}</p>
            </div>
            <div className="location-modal-actions">
              <button type="button" onClick={() => handleVaultMarketplaceDecision("copy")}>Create Listing Only</button>
              <button type="button" className="secondary-button" onClick={() => handleVaultMarketplaceDecision("move")}>Move to Forge and List</button>
              <button type="button" className="ghost-button" onClick={() => handleVaultMarketplaceDecision("cancel")}>Cancel</button>
            </div>
          </section>
        </div>
      ) : null}

      {listingReportTarget ? (
        <div className="location-modal-backdrop" role="presentation" onClick={() => setListingReportTarget(null)}>
          <form className="location-modal" role="dialog" aria-modal="true" aria-labelledby="listing-report-title" onSubmit={reportMarketplaceListing} onClick={(event) => event.stopPropagation()}>
            <div>
              <h2 id="listing-report-title">Report Listing</h2>
              <p>Reports go to admin/mod review. This does not process payments or disputes.</p>
            </div>
            <div className="drawer-info-card">
              <strong>{listingReportTarget.title}</strong>
              <p className="compact-subtitle">{listingReportTarget.listingType} | {listingReportTarget.status}</p>
            </div>
            <Field label="Reason">
              <select value={listingReportReason} onChange={(event) => setListingReportReason(event.target.value)}>
                {MARKETPLACE_REPORT_REASONS.map((reason) => <option key={reason}>{reason}</option>)}
              </select>
            </Field>
            <div className="location-modal-actions">
              <button type="submit">Submit Report</button>
              <button type="button" className="secondary-button" onClick={() => setListingReportTarget(null)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}

      {locationPromptOpen ? (
        <div className="location-modal-backdrop" role="presentation" onClick={() => setLocationPromptOpen(false)}>
          <form className="location-modal" role="dialog" aria-modal="true" aria-labelledby="location-needed-title" onSubmit={savePromptLocation} onClick={(event) => event.stopPropagation()}>
            <div>
              <h2 id="location-needed-title">Location Needed</h2>
              <p>Set a location to see nearby stores, reports, and alerts.</p>
            </div>
            <input
              value={locationPromptZip}
              onChange={(event) => setLocationPromptZip(event.target.value)}
              placeholder="Enter ZIP or city"
              aria-label="ZIP or city"
            />
            <div className="location-modal-actions">
              <button type="button" className="secondary-button" onClick={openLocationSettingsFromPrompt}>Open Location Settings</button>
              <button type="submit">Enter ZIP</button>
              <button type="button" className="ghost-button" onClick={() => setLocationPromptOpen(false)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}

      {scoutScoreModalOpen ? (
        <div className="location-modal-backdrop" role="presentation" onClick={() => setScoutScoreModalOpen(false)}>
          <section className="location-modal scout-score-modal" role="dialog" aria-modal="true" aria-labelledby="scout-score-title" onClick={(event) => event.stopPropagation()}>
            <div className="compact-card-header">
              <div>
                <h2 id="scout-score-title">Scout Score</h2>
                <p>Scout Score increases when reports are accurate and verified. False or spam reports lower trust.</p>
              </div>
              <div className="summary-pill-row">
                {scoutSnapshot.scoutProfile?.badgeLevel ? <span className="status-badge">{scoutSnapshot.scoutProfile.badgeLevel}</span> : null}
                <button type="button" className="modal-icon-close" aria-label="Close Scout Score" onClick={() => setScoutScoreModalOpen(false)}>X</button>
              </div>
            </div>
            <div className="scout-score-grid">
              <div className="scout-score-stat"><p>Trust score</p><h3>{scoutSnapshot.scoutProfile?.trustScore || 72}</h3></div>
              <div className="scout-score-stat"><p>Verified reports</p><h3>{scoutSnapshot.scoutProfile?.verifiedReportCount || 0}</h3></div>
              <div className="scout-score-stat"><p>Reward points</p><h3>{scoutSnapshot.scoutProfile?.rewardPoints || 0}</h3></div>
              <div className="scout-score-stat"><p>Report streak</p><h3>{scoutSnapshot.scoutProfile?.reportStreak || 0}</h3></div>
              <div className="scout-score-stat"><p>Warnings</p><h3>{scoutSnapshot.scoutProfile?.warningCount || 0}</h3></div>
              <div className="scout-score-stat"><p>Cooldown</p><h3>{scoutSnapshot.scoutProfile?.cooldownUntil ? "Active" : "None"}</h3></div>
            </div>
            <details className="forge-purchaser-totals">
              <summary>Guidelines</summary>
              <p>Verified reports increase score. Helpful reports and report streaks add reward points. Bad reports, warnings, spam, or disputed posts can reduce score. Cooldown can happen after too many rejected reports. Add photos when possible and do not report old information as current.</p>
            </details>
          </section>
        </div>
      ) : null}

      {selectedScoutReport ? (
        <div className="location-modal-backdrop" role="presentation" onClick={() => setSelectedScoutReport(null)}>
          <section className="location-modal scout-report-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="scout-report-detail-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title-row modal-sticky-header">
              <div>
                <h2 id="scout-report-detail-title">Scout Report</h2>
                <p>{getScoutReportStore(selectedScoutReport).name || selectedScoutReport.storeName || "Store not selected"}</p>
              </div>
              <button type="button" className="modal-close-button" aria-label="Close Scout report" onClick={() => setSelectedScoutReport(null)}>X</button>
            </div>
            {renderScoutReportCard(selectedScoutReport)}
            <div className="location-modal-actions modal-sticky-footer">
              <button type="button" onClick={() => editScoutReport(selectedScoutReport)}>Edit</button>
              <button type="button" className="delete-button" onClick={() => setScoutReportDeleteTarget(selectedScoutReport)}>Delete</button>
              <button type="button" className="ghost-button" onClick={() => setSelectedScoutReport(null)}>Close</button>
            </div>
          </section>
        </div>
      ) : null}

      {scoutReportDeleteTarget ? (
        <div className="location-modal-backdrop" role="presentation" onClick={() => setScoutReportDeleteTarget(null)}>
          <section className="location-modal scout-delete-confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="scout-delete-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title-row modal-sticky-header">
              <div>
                <h2 id="scout-delete-title">Delete Scout report?</h2>
                <p>This will delete {normalizeScoutReportItems(scoutReportDeleteTarget)[0]?.productName || "this report"} from your private beta Scout data.</p>
              </div>
              <button type="button" className="modal-close-button" aria-label="Close delete confirmation" onClick={() => setScoutReportDeleteTarget(null)}>X</button>
            </div>
            <div className="location-modal-actions modal-sticky-footer">
              <button type="button" className="delete-button" onClick={() => deleteScoutReport(scoutReportDeleteTarget)}>Delete</button>
              <button type="button" className="ghost-button" onClick={() => setScoutReportDeleteTarget(null)}>Cancel</button>
            </div>
          </section>
        </div>
      ) : null}

      {dealFinderOpen ? (
        <div className="location-modal-backdrop deal-finder-backdrop" role="presentation" onClick={() => setDealFinderOpen(false)}>
          <section className="location-modal deal-finder-modal" role="dialog" aria-modal="true" aria-labelledby="deal-finder-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title-row modal-sticky-header">
              <div>
                <h2 id="deal-finder-title">Deal Finder</h2>
                <p>Check asking price against market and MSRP before you buy, keep, or pass.</p>
              </div>
              <button type="button" className="modal-close-button" aria-label="Close Deal Finder" onClick={() => setDealFinderOpen(false)}>X</button>
            </div>
            {renderDealFinderContent()}
            <div className="location-modal-actions modal-sticky-footer">
              <button type="button" className="secondary-button" onClick={() => setDealFinderOpen(false)}>Close</button>
            </div>
          </section>
        </div>
      ) : null}

      {vaultToast ? (
        <div className="vault-toast" role="status">
          <span>{vaultToast}</span>
          <button type="button" className="ghost-button" onClick={() => setVaultToast("")}>Dismiss</button>
        </div>
      ) : null}

      {legacyVaultAddModalEnabled && showVaultAddForm ? (
        <div className="location-modal-backdrop vault-add-backdrop" role="presentation" onClick={() => closeVaultAddModal()}>
          <section className="location-modal vault-add-modal" role="dialog" aria-modal="true" aria-labelledby="vault-add-title" onClick={(event) => event.stopPropagation()}>
            <div className="compact-card-header">
              <div>
                <h2 id="vault-add-title">Add Item to Vault</h2>
                <p>Search TideTradr, scan, import, or enter a card/product manually.</p>
              </div>
              <button type="button" className="modal-icon-close" aria-label="Close Add Item to Vault" onClick={() => closeVaultAddModal()}>X</button>
            </div>
            <div className="quick-action-rail vault-add-tabs">
              {[
                ["catalog", "Search TideTradr"],
                ["scan", "Scan to Vault"],
                ["manual", "Manual Add"],
                ["import", "Import Collection"],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={vaultAddMode === mode ? "primary vault-add-tab active" : "secondary-button vault-add-tab"}
                  onClick={() => {
                    setVaultAddMode(mode);
                    if (mode === "manual") setVaultFormSections((current) => ({ ...current, basic: true, pricing: false, status: false, extra: false }));
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="vault-add-modal-body">
            {vaultAddMode === "catalog" ? (
              <div className="vault-add-tab-panel">
                <Field label="Search TideTradr catalog">
                  <SmartCatalogSearchBox
                    value={vaultForm.tideTradrSearch || ""}
                    onChange={(value) => updateVaultForm("tideTradrSearch", value)}
                    onSelectSuggestion={selectVaultCatalogRecommendation}
                    supabase={supabase}
                    isSupabaseConfigured={isSupabaseConfigured}
                    mapRow={mapCatalog}
                    productGroup="All"
                    dataFilter="All"
                    placeholder="Search products, cards, set, UPC, or SKU"
                    money={money}
                  />
                </Field>
                <div className="small-empty-state">
                  <strong>TideTradr catalog connection is in beta.</strong>
                  <span>Use Manual Add or Scan for now if the item is not easy to find here.</span>
                </div>
                {supabaseCatalogStatus.loading ? (
                  <div className="small-empty-state vault-catalog-state">
                    <strong>Searching catalog...</strong>
                    <span>Checking TideTradr for matching products.</span>
                  </div>
                ) : null}
                {tideTradrLookupProduct ? (
                  <div className="vault-catalog-recent">
                    <span className="compact-subtitle">Recently viewed</span>
                    {[tideTradrLookupProduct].map((product) => {
                      const marketInfo = getTideTradrMarketInfo(product);
                      const productImage = catalogImage(product);
                      return (
                        <article className="vault-catalog-product-card" key={product.id}>
                          <button type="button" className="vault-catalog-product-main" onClick={() => applyCatalogProductToVault(product.id)}>
                            <div className="catalog-thumb">
                              {productImage ? (
                                <>
                                  <img
                                    src={productImage}
                                    alt=""
                                    onError={(event) => {
                                      event.currentTarget.style.display = "none";
                                      event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                                    }}
                                  />
                                  <div className="image-needed-placeholder" hidden>
                                    <strong>{catalogTitle(product)}</strong>
                                    <span>Image needed</span>
                                  </div>
                                </>
                              ) : (
                                <div className="image-needed-placeholder">
                                  <strong>{catalogTitle(product)}</strong>
                                  <span>Image needed</span>
                                </div>
                              )}
                            </div>
                            <div>
                              <strong>{catalogTitle(product)}</strong>
                              <span>{product.setName || product.expansion || product.productType || "Catalog item"}</span>
                              <span>Market: {money(marketInfo.currentMarketValue || 0)}</span>
                            </div>
                          </button>
                          <div className="vault-catalog-product-actions">
                            <button type="button" onClick={() => applyCatalogProductToVault(product.id)}>Add selected item to Vault</button>
                            <button type="button" className="secondary-button" onClick={() => { applyCatalogProductToVault(product.id); setVaultAddMode("manual"); }}>Review in Manual Form</button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : null}
                <div className="inventory-list compact-inventory-list vault-catalog-results">
                  {vaultSuggestedCatalogItems.map((product) => {
                    const marketInfo = getTideTradrMarketInfo(product);
                    const productImage = catalogImage(product);
                    return (
                      <article className="vault-catalog-product-card" key={product.id}>
                        <button type="button" className="vault-catalog-product-main" onClick={() => applyCatalogProductToVault(product.id)}>
                          <div className="catalog-thumb">
                            {productImage ? (
                              <>
                                <img
                                  src={productImage}
                                  alt=""
                                  onError={(event) => {
                                    event.currentTarget.style.display = "none";
                                    event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                                  }}
                                />
                                <div className="image-needed-placeholder" hidden>
                                  <strong>{catalogTitle(product)}</strong>
                                  <span>Image needed</span>
                                </div>
                              </>
                            ) : (
                              <div className="image-needed-placeholder">
                                <strong>{catalogTitle(product)}</strong>
                                <span>Image needed</span>
                              </div>
                            )}
                          </div>
                          <div>
                            <strong>{catalogTitle(product)}</strong>
                            <span>{product.setName || product.expansion || product.productType || "Catalog item"}</span>
                            <span>Market: {money(marketInfo.currentMarketValue || 0)}</span>
                          </div>
                        </button>
                        <div className="vault-catalog-product-actions">
                          <button type="button" onClick={() => applyCatalogProductToVault(product.id)}>Add selected item to Vault</button>
                          <button type="button" className="secondary-button" onClick={() => { applyCatalogProductToVault(product.id); setVaultAddMode("manual"); }}>Review in Manual Form</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {!supabaseCatalogStatus.loading && vaultSuggestedCatalogItems.length === 0 && !tideTradrLookupProduct ? (
                  <div className="small-empty-state vault-catalog-state">
                    <strong>No TideTradr products selected yet.</strong>
                    <span>Search above to find products, or switch to Manual Add.</span>
                  </div>
                ) : null}
                <div className="vault-form-actions">
                  <button type="button" disabled={!vaultForm.catalogProductId || !isVaultDraftReady(vaultForm) || vaultSaving} onClick={addVaultItem}>
                    {vaultSaving ? "Saving..." : "Add selected item to Vault"}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setVaultAddMode("manual")}>Review in Manual Form</button>
                </div>
              </div>
            ) : null}

            {vaultAddMode === "scan" ? (
              <div className="vault-add-tab-panel">
                <div className="small-empty-state">
                  <strong>Scan first, review second.</strong>
                  <span>Scanning opens a review screen before anything is saved to Vault or Forge.</span>
                </div>
                <button type="button" onClick={() => { if (closeVaultAddModal()) beginScanProduct("vault"); }}>Open Scan Review</button>
              </div>
            ) : null}

            {vaultAddMode === "import" ? (
              <div className="vault-add-tab-panel">
                <div className="small-empty-state">
                  <strong>Collection import is coming soon.</strong>
                  <span>For now, add items manually or scan them.</span>
                </div>
              </div>
            ) : null}

            {vaultAddMode === "manual" ? (
            <form
              onSubmit={addVaultItem}
              className="vault-collapsible-form"
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") event.preventDefault();
              }}
            >
              <div className="vault-form-section">
                <button type="button" className="vault-section-toggle" onClick={() => toggleVaultFormSection("basic")}>
                  <span>Basic Info</span>
                  <b>{vaultFormSections.basic ? "Hide" : "Show"}</b>
                </button>
                {vaultFormSections.basic ? (
                  <div className="form vault-form-grid">
                    <Field label="Item Type">
                      <select value={vaultForm.productType || ""} onChange={(e) => updateVaultForm("productType", e.target.value)}>
                        <option value="">Choose type</option>
                        <option value="Sealed Product">Sealed Product</option>
                        <option value="Individual Card">Individual Card</option>
                      </select>
                    </Field>
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
                    <Field label="Vault Status">
                      <select value={vaultForm.vaultStatus || normalizeVaultStatus(vaultForm)} onChange={(e) => updateVaultForm("vaultStatus", e.target.value)}>
                        {VAULT_STATUS_OPTIONS.map((status) => (
                          <option key={status.value} value={status.value}>{status.label}</option>
                        ))}
                      </select>
                    </Field>
                    <div className="vault-status-definitions">
                      {VAULT_STATUS_OPTIONS.filter((status) => status.description).map((status) => (
                        <p key={status.value}><strong>{status.label}:</strong> {status.description}</p>
                      ))}
                    </div>
                    <Field label="Vault Category">
                      <select value={vaultForm.vaultCategory} onChange={(e) => updateVaultForm("vaultCategory", e.target.value)}>
                        {VAULT_CATEGORIES.map((category) => (
                          <option key={category} value={category}>{category}</option>
                        ))}
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
                    <Field label="Storage Location">
                      <select value={vaultForm.storageLocation || ""} onChange={(e) => updateVaultForm("storageLocation", e.target.value)}>
                        {VAULT_STORAGE_LOCATIONS.map((location) => <option key={location || "blank"} value={location}>{location || "Not set"}</option>)}
                      </select>
                    </Field>
                    <Field label="Condition">
                      <select value={vaultForm.condition || ""} onChange={(e) => updateVaultForm("condition", e.target.value)}>
                        {VAULT_CONDITIONS.map((condition) => <option key={condition || "blank"} value={condition}>{condition || "Not set"}</option>)}
                      </select>
                    </Field>
                    <Field label="Card Condition">
                      <select value={vaultForm.conditionName || "Near Mint"} onChange={(e) => {
                        updateVaultForm("conditionName", e.target.value);
                        updateVaultForm("condition", e.target.value);
                      }}>
                        {["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"].map((condition) => <option key={condition} value={condition}>{condition}</option>)}
                      </select>
                    </Field>
                    <Field label="Finish / Version">
                      <input value={vaultForm.finish || ""} onChange={(e) => updateVaultForm("finish", e.target.value)} placeholder="Normal, Holofoil, Reverse Holofoil..." />
                    </Field>
                    <Field label="Printing">
                      <input value={vaultForm.printing || ""} onChange={(e) => updateVaultForm("printing", e.target.value)} placeholder="1st Edition, Unlimited..." />
                    </Field>
                    <Field label="Language">
                      <input value={vaultForm.language || "English"} onChange={(e) => updateVaultForm("language", e.target.value)} />
                    </Field>
                    <Field label="Sealed Condition">
                      <select value={vaultForm.sealedCondition || ""} onChange={(e) => updateVaultForm("sealedCondition", e.target.value)}>
                        {VAULT_CONDITIONS.map((condition) => <option key={condition || "blank"} value={condition}>{condition || "Not set"}</option>)}
                      </select>
                    </Field>
                    <Field label="Source">
                      <select value={vaultForm.sourceType || "Manual"} onChange={(e) => updateVaultForm("sourceType", e.target.value)}>
                        {VAULT_SOURCE_OPTIONS.map((source) => <option key={source} value={source}>{source}</option>)}
                      </select>
                    </Field>
                    <Field label="UPC">
                      <input value={vaultForm.upc || ""} onChange={(e) => updateVaultForm("upc", e.target.value)} placeholder="Optional barcode / UPC" />
                    </Field>
                    <Field label="SKU">
                      <input value={vaultForm.sku || ""} onChange={(e) => updateVaultForm("sku", e.target.value)} placeholder="Optional SKU" />
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
                    <Field label="Condition Notes">
                      <input value={vaultForm.conditionNotes || ""} onChange={(e) => updateVaultForm("conditionNotes", e.target.value)} placeholder="Box damage, missing wrap, card notes..." />
                    </Field>
                  </div>
                ) : null}
              </div>

              <div className="vault-form-actions">
                <button type="submit" disabled={!isVaultDraftReady(vaultForm) || vaultSaving}>
                  {vaultSaving ? "Saving..." : "Add Item to Vault"}
                </button>
                <button type="button" className="secondary-button" onClick={() => closeVaultAddModal()}>Cancel</button>
              </div>
            </form>
            ) : null}
            </div>
            <div className="location-modal-actions modal-sticky-footer">
              <button type="button" className="secondary-button" onClick={() => closeVaultAddModal()}>Cancel</button>
            </div>
          </section>
        </div>
      ) : null}

      {vaultPotentialDuplicate?.candidate ? (
        <div className="location-modal-backdrop" role="presentation" onClick={() => resolveVaultPotentialDuplicate("cancel")}>
          <section className="location-modal vault-transfer-modal" role="dialog" aria-modal="true" aria-labelledby="vault-duplicate-warning-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-sticky-header">
              <h2 id="vault-duplicate-warning-title">This item may already be in your Vault.</h2>
              <p>{vaultPotentialDuplicate.duplicate?.name || "Matching Vault item"} already matches this name, UPC, SKU, or TideTradr product ID.</p>
            </div>
            <div className="vault-transfer-summary">
              <strong>{vaultPotentialDuplicate.candidate.name}</strong>
              <span>New quantity: {vaultPotentialDuplicate.candidate.quantity || 1}</span>
              <span>Existing quantity: {vaultPotentialDuplicate.duplicate?.quantity || 0}</span>
            </div>
            <div className="location-modal-actions modal-sticky-footer">
              <button type="button" onClick={() => resolveVaultPotentialDuplicate("increase")}>Increase Quantity</button>
              <button type="button" className="secondary-button" onClick={() => resolveVaultPotentialDuplicate("separate")}>Add as Separate Item</button>
              <button type="button" className="ghost-button" onClick={() => resolveVaultPotentialDuplicate("cancel")}>Cancel</button>
            </div>
          </section>
        </div>
      ) : null}

      {vaultForgeTransfer?.item ? (
        <div className="location-modal-backdrop" role="presentation" onClick={() => setVaultForgeTransfer(null)}>
          <form className="location-modal vault-transfer-modal" role="dialog" aria-modal="true" aria-labelledby="vault-forge-transfer-title" onSubmit={(event) => { event.preventDefault(); confirmVaultForgeTransfer(vaultForgeTransfer.mode); }} onClick={(event) => event.stopPropagation()}>
            <div>
              <h2 id="vault-forge-transfer-title">{vaultForgeTransfer.mode === "copy" ? "Copy this item to Forge?" : "Move item to Forge?"}</h2>
              <p>{vaultForgeTransfer.mode === "copy" ? "This keeps the Vault item active and creates a Forge inventory copy." : "This will add this Vault item to Forge inventory for business/sales tracking."}</p>
            </div>
            <div className="vault-transfer-summary">
              <strong>{vaultForgeTransfer.item.name}</strong>
              <span>Owned quantity: {vaultForgeTransfer.item.quantity || 1}</span>
            </div>
            <Field label={vaultForgeTransfer.mode === "copy" ? "Copy quantity" : "How many do you want to move to Forge?"}>
              <input
                type="number"
                min="1"
                max={Math.max(1, Number(vaultForgeTransfer.item.quantity || 1))}
                value={vaultForgeTransfer.quantityToMove}
                onChange={(event) => setVaultForgeTransfer((current) => ({ ...current, quantityToMove: event.target.value }))}
              />
            </Field>
            <Field label="Cost Paid">
              <input
                type="number"
                step="0.01"
                value={vaultForgeTransfer.costPaid}
                onChange={(event) => setVaultForgeTransfer((current) => ({ ...current, costPaid: event.target.value }))}
                placeholder="Unknown is okay"
              />
            </Field>
            {String(vaultForgeTransfer.item.catalogProductId || "") && items.some((item) => item.id !== vaultForgeTransfer.item.id && !item.vaultStatus && String(item.catalogProductId || "") === String(vaultForgeTransfer.item.catalogProductId || "")) ? (
              <Field label="Duplicate Handling">
                <select value={vaultForgeTransfer.duplicateMode} onChange={(event) => setVaultForgeTransfer((current) => ({ ...current, duplicateMode: event.target.value }))}>
                  <option value="existing">Add to existing Forge item</option>
                  <option value="create">Create separate Forge entry</option>
                </select>
              </Field>
            ) : null}
            <div className="location-modal-actions">
              <button type="button" disabled={vaultMoving || Number(vaultForgeTransfer.item.quantity || 0) < 1} onClick={() => confirmVaultForgeTransfer("copy", 1)}>
                {vaultMoving ? "Copying..." : "Copy 1 to Forge"}
              </button>
              <button type="button" disabled={vaultMoving || Number(vaultForgeTransfer.item.quantity || 0) < 1} className="secondary-button" onClick={() => confirmVaultForgeTransfer("move", Math.max(1, Number(vaultForgeTransfer.item.quantity || 1)))}>
                {vaultMoving ? "Moving..." : "Move Entire Quantity to Forge"}
              </button>
              <button type="button" className="ghost-button" onClick={() => setVaultForgeTransfer(null)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}

      {vaultDuplicateItem?.item ? (
        <div className="location-modal-backdrop" role="presentation" onClick={() => setVaultDuplicateItem(null)}>
          <form className="location-modal vault-transfer-modal" role="dialog" aria-modal="true" aria-labelledby="vault-duplicate-title" onSubmit={confirmVaultDuplicateItem} onClick={(event) => event.stopPropagation()}>
            <div>
              <h2 id="vault-duplicate-title">Duplicate Item</h2>
              <p>Useful when you have multiples and want a separate Vault record.</p>
            </div>
            <div className="vault-transfer-summary">
              <strong>{vaultDuplicateItem.item.name}</strong>
              <span>Current quantity: {vaultDuplicateItem.item.quantity || 1}</span>
            </div>
            <label className="vault-check-row">
              <input type="checkbox" checked={vaultDuplicateItem.sameItem} onChange={(event) => setVaultDuplicateItem((current) => ({ ...current, sameItem: event.target.checked }))} />
              Same item
            </label>
            <Field label="New quantity">
              <input type="number" min="1" value={vaultDuplicateItem.quantity} onChange={(event) => setVaultDuplicateItem((current) => ({ ...current, quantity: event.target.value }))} />
            </Field>
            <label className="vault-check-row">
              <input type="checkbox" checked={vaultDuplicateItem.samePrice} onChange={(event) => setVaultDuplicateItem((current) => ({ ...current, samePrice: event.target.checked }))} />
              Same price
            </label>
            <label className="vault-check-row">
              <input type="checkbox" checked={vaultDuplicateItem.sameStatus} onChange={(event) => setVaultDuplicateItem((current) => ({ ...current, sameStatus: event.target.checked }))} />
              Same status
            </label>
            <div className="location-modal-actions">
              <button type="submit">Duplicate Item</button>
              <button type="button" className="ghost-button" onClick={() => setVaultDuplicateItem(null)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}

      {showInventoryScanner ? (
        <div className="location-modal-backdrop" role="presentation" onClick={closeInventoryScanner}>
          <section className="scanner-review-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-review-title" onClick={(event) => event.stopPropagation()}>
            <div className="compact-card-header">
              <div>
                <h2 id="scanner-review-title">Scan Product/Card</h2>
                <p>{scanReview ? "Confirm the match, then choose where this item should go. Nothing is saved automatically." : "Scan a barcode, UPC, SKU label, card, or product image. You can always search manually."}</p>
              </div>
              <button type="button" className="secondary-button" onClick={closeInventoryScanner}>Cancel</button>
            </div>
            <div className="quick-action-rail">
              {[
                ["upc", "Barcode / UPC"],
                ["card", "Card"],
                ["picture", "Look Up by Picture"],
                ["manual", "Manual"],
              ].map(([key, label]) => (
                <button key={key} type="button" className={scanMode === key ? "primary" : ""} onClick={() => setScanMode(key)}>
                  {label}
                </button>
              ))}
            </div>
            {scanMode === "picture" ? (
              <div className="picture-lookup-panel">
                <div className="small-empty-state">
                  <strong>Look Up by Picture</strong>
                  <span>Upload or take a picture of a card, box, tin, pack, shelf tag, or product label. Do not upload receipts, personal documents, addresses, faces, or private information during beta.</span>
                </div>
                <div className="picture-lookup-actions">
                  <label className="secondary-button file-action-label">
                    Take / Upload Photo
                    <input type="file" accept="image/*" capture="environment" onChange={handlePictureLookupFile} />
                  </label>
                  <button type="button" className="secondary-button" onClick={() => setScanMode("manual")}>Search manually instead</button>
                </div>
                {pictureLookup.imageUrl ? (
                  <div className="picture-lookup-preview">
                    <img src={pictureLookup.imageUrl} alt="Uploaded product lookup preview" />
                    <span>{pictureLookup.fileName || "Photo preview"}</span>
                  </div>
                ) : null}
                <Field label="Visible text or UPC/SKU from picture">
                  <input
                    value={pictureLookup.text}
                    onChange={(event) => setPictureLookup((current) => ({ ...current, text: event.target.value }))}
                    placeholder="Product name, set, UPC, SKU, TCIN, or shorthand"
                  />
                </Field>
                <div className="quick-actions">
                  <button type="button" onClick={runPictureLookupSearch}>Find matches</button>
                  <button type="button" className="secondary-button" onClick={() => {
                    const destinations = scanDestination === "vault" ? { vault: true } : scanDestination === "forge" ? { forge: true } : scanDestination === "wishlist" ? { wishlist: true } : {};
                    closeInventoryScanner();
                    openProductAddFlow({ source: "picture-lookup-manual", destinations });
                  }}>Add manually</button>
                  <button type="button" className="secondary-button" onClick={() => { setScanMode("manual"); setPictureLookup((current) => ({ ...current, message: "Enter a product name, set, UPC, SKU, or shorthand to search TideTradr." })); }}>Search TideTradr</button>
                </div>
                {pictureLookup.message ? <p className="compact-subtitle">{pictureLookup.message}</p> : null}
                <p className="compact-subtitle">Tip: use good lighting, avoid glare, and include the product name, barcode, or collector number when possible.</p>
              </div>
            ) : scanMode === "upc" ? (
              <BarcodeScanner onScan={handleCatalogScanMatch} onClose={() => setScanMode("manual")} />
            ) : null}
            {scanMode === "manual" || scanMode === "card" || scanMode === "upc" ? (
              <div className="form">
                <Field label={scanMode === "card" ? "Card name, collector number, or set code" : "Enter UPC, SKU, TCIN, barcode, product name, or shorthand"}>
                  <input
                    value={scanReview?.rawValue || scanInput}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setScanInput(nextValue);
                      if (!nextValue.trim()) {
                        setScanMatches([]);
                        setScanReview(null);
                        setScanMessage("");
                        return;
                      }
                      const matches = getBestCatalogMatches(nextValue, catalogProducts);
                      setScanMatches(matches);
                      setScanReview(buildScanReview(nextValue, matches, scanDestination));
                    }}
                    placeholder={scanMode === "card" ? "Try 199/165, zard sir, sv8 card 159" : "Try 151 upc, pr evo etb, Target TCIN, or UPC/SKU"}
                  />
                </Field>
                <button type="button" onClick={() => handleCatalogScanMatch(scanReview?.rawValue || scanInput)}>Search Item</button>
                <p className="compact-subtitle">Scanner matching checks verified UPC/EAN/GTIN and retailer identifiers before lower-confidence name or alias matches.</p>
              </div>
            ) : null}

            {!scanReview ? (
              <div className="small-empty-state scanner-start-state">
                <strong>No item detected yet.</strong>
                <span>Use the camera, enter a UPC/SKU, or type a product name. Nothing is saved until you review the match and choose a destination.</span>
              </div>
            ) : null}

            {scanReview ? (
              <div className="scanner-review-card">
                <div className="compact-card-header">
                  <div>
                    <h3>{scanReview.itemName}</h3>
                    <p>{scanReview.setName || "No set"} | {scanReview.productType || scanReview.catalogType}</p>
                  </div>
                  <span className="status-badge">{scanReview.matchConfidence}% match</span>
                </div>
                {scanReview.imageUrl ? <img className="scanner-review-image" src={scanReview.imageUrl} alt={scanReview.itemName} /> : null}
                <div className="catalog-detail-grid">
                  <DetailItem label="UPC / SKU" value={[scanReview.upc, scanReview.sku].filter(Boolean).join(" / ") || "Unknown"} />
                  <DetailItem label="Market Value" value={scanReview.marketValue ? money(scanReview.marketValue) : "Unknown" } />
                  <DetailItem label="MSRP" value={scanReview.msrp ? money(scanReview.msrp) : "Unknown" } />
                  <DetailItem label="Source" value={scanReview.sourceType || "unknown"} />
                </div>
                <Field label="Destination">
                  <select value={scanDestination} onChange={(event) => setScanDestination(event.target.value)}>
                    {SCAN_DESTINATIONS.map((destination) => (
                      <option key={destination.value} value={destination.value}>{destination.label}</option>
                    ))}
                  </select>
                </Field>
                {scanMessage ? <p className="compact-subtitle">{scanMessage}</p> : null}
                <div className="quick-actions">
                  <button type="button" onClick={() => { setScanDestination("vault"); confirmScannerDestination("vault"); }}>Review in Add Flow</button>
                  <button type="button" className="secondary-button" onClick={() => { setScanDestination("forge"); confirmScannerDestination("forge"); }}>Review for Forge</button>
                  <button type="button" className="secondary-button" onClick={confirmScannerDestination}>Confirm Destination</button>
                  <button type="button" className="secondary-button" onClick={() => { setActiveTab("market"); closeInventoryScanner(); }}>Search TideTradr</button>
                  <button type="button" className="ghost-button" onClick={closeInventoryScanner}>Cancel</button>
                </div>
              </div>
            ) : null}

            {scanMatches.length > 1 ? (
              <div className="inventory-list compact-inventory-list">
                <h3>Possible matches</h3>
                {scanMatches.slice(0, 5).map((match) => (
                  <button type="button" className="catalog-picker-card scanner-match-row" key={match.item.id} onClick={() => confirmScanMatch(match.item.id)}>
                    <div className="catalog-thumb">
                      {catalogImage(match.item) ? <img src={catalogImage(match.item)} alt="" /> : <div className="image-needed-placeholder"><span>No image</span></div>}
                    </div>
                    <span className="catalog-picker-copy">
                      <strong>{match.item.name || match.item.productName || match.item.cardName}</strong>
                      <small>{match.item.setName || match.item.expansion || "No set"} | {match.item.productType || match.item.catalogType || "Product"}</small>
                      <small>{match.confidencePercent}% | {match.explanation || "Possible match"}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      <main className={`main dashboard-card-style-${dashboardCardStyle}`}>
        {activeTabLocked ? (
          <UpgradeScreen featureKey={activeTabFeature} subscriptionsLive={SUBSCRIPTIONS_LIVE} onBack={() => setActiveTab("dashboard")} />
        ) : null}
        {!activeTabLocked && activeTab === "tidepool" && renderTidepoolCommunity()}
        {!activeTabLocked && activeTab === "mySuggestions" && renderMySuggestionsPage()}
        {!activeTabLocked && activeTab === "adminReview" && renderAdminReviewPage()}
        {!activeTabLocked && activeTab === "dashboard" && (
          <div className="dashboard-layout home-clean-layout">
            <PageHeader
              className={getHeaderCardClass("panel page-summary-card home-summary-card")}
              title="Home"
              subtitle="Your collection, business, and scouting overview."
              actions={(
                <>
                  <button type="button" onClick={() => {
                    setShowTopbarActions(true);
                    openMultiDestinationAddFlow({ source: "home" });
                  }}>+ Add</button>
                  <button type="button" className="secondary-button" onClick={() => setSearchExpanded(true)}>Search</button>
                </>
              )}
              summary={(
                <div className="home-summary-stats" aria-label="Home metrics">
                {homeStatsEnabled.collection_value !== false ? (
                <button type="button" className="home-metric-card" onClick={() => setActiveTab("vault")}>
                  <p>Collection Value</p>
                  <h2>{money(vaultValue)}</h2>
                </button>
                ) : null}
                {homeStatsEnabled.monthly_spending !== false ? (
                <button type="button" className="home-metric-card" onClick={() => setActiveTab("reports")}>
                  <p>Monthly Spending</p>
                  <h2>{money(monthlySpending)}</h2>
                </button>
                ) : null}
                {scoutSnapshot.alertSettings?.showHomeMarketUpdates !== false ? (
                <button type="button" className="home-metric-card" onClick={() => {
                  setActiveTab("market");
                  setTideTradrSubTab("watch");
                }}>
                  <p>Market Updates</p>
                  <h2>{recentMarketUpdates.length}</h2>
                </button>
                ) : null}
                {scoutSnapshot.alertSettings?.showHomeActiveAlerts !== false ? (
                <button type="button" className="home-metric-card" onClick={() => {
                  setActiveTab("scout");
                  setScoutSubTabTarget({ tab: "alerts", id: Date.now() });
                  setScoutView("alerts");
                }}>
                  <p>Active Alerts</p>
                  <h2>{activeHomeAlertCount}</h2>
                </button>
                ) : null}
              </div>
              )}
            />

            {dashboardSectionState("home_stats").enabled !== false ? (
            <section className="panel home-today-panel">
              <div className="compact-card-header">
                <div>
                  <h2>Today / Overview</h2>
                  <p>The few things worth checking first.</p>
                </div>
              </div>
              <div className="home-today-grid">
                <button type="button" className="home-today-tile" onClick={() => {
                  if (activeVaultItems[0]?.id) setSelectedVaultDetailId(activeVaultItems[0].id);
                  setActiveTab("vault");
                }}>
                  <span>Active Item</span>
                  <strong>{activeVaultItems.length} active item{activeVaultItems.length === 1 ? "" : "s"}</strong>
                  <small>{money(vaultValue)} collection value</small>
                </button>
                <button type="button" className="home-today-tile" onClick={() => setActiveTab("inventory")}>
                  <span>Inventory Item</span>
                  <strong>{forgeInventoryItems.length} inventory item{forgeInventoryItems.length === 1 ? "" : "s"}</strong>
                  <small>{money(totalMarketValue)} market value</small>
                </button>
                <button type="button" className="home-today-tile" onClick={() => {
                  setActiveTab("scout");
                  setScoutView("main");
                }}>
                  <span>Recent Reports</span>
                  <strong>{(scoutSnapshot.reports || []).length} recent report{(scoutSnapshot.reports || []).length === 1 ? "" : "s"}</strong>
                  <small>{scoutSnapshot.stores.length} stores available</small>
                </button>
                <button type="button" className="home-today-tile" onClick={() => setActiveTab("market")}>
                  <span>Wishlist Item</span>
                  <strong>{tideTradrWatchlist.length} watchlist item{tideTradrWatchlist.length === 1 ? "" : "s"}</strong>
                  <small>{missingMarketPriceItems.length} missing prices</small>
                </button>
              </div>
            </section>
            ) : null}

            {dashboardSectionState("action_center").enabled !== false ? (
            <section className="panel beta-path-panel">
              <div className="compact-card-header">
                <div>
                  <h2>Beta Tester Path</h2>
                  <p>Core flow: Scout a store, submit a report, save collection items to Vault, search TideTradr for market values, then use Forge when an item becomes business inventory.</p>
                </div>
              </div>
              <QuickActionGrid
                className="home-quick-action-grid"
                ariaLabel="Home quick actions"
                actions={[
                  { key: "submit-scout-report", title: "Submit Scout Report", subtitle: "Log a store check", onClick: () => openQuickAddAction("storeReport") },
                  { key: "add-to-vault", title: "Add to Vault", subtitle: "Save collection item", onClick: () => openQuickAddAction("vaultItem") },
                  { key: "search-tidetradr", title: "Search TideTradr", subtitle: "Find values and products", onClick: () => { setActiveTab("market"); setTideTradrSubTab("overview"); } },
                  { key: "check-deal", title: "Check Deal", subtitle: "Compare asking price", onClick: () => { setActiveTab("market"); openDealFinderModal(); } },
                  { key: "add-to-forge", title: "Add to Forge", subtitle: "Create business inventory", onClick: () => openQuickAddAction("inventory") },
                  { key: "export-backup", title: "Export Backup", subtitle: "Save private beta data", onClick: () => { setMenuSectionsOpen({ data: true }); setMenuOpen(true); } },
                ]}
              />
            </section>
            ) : null}

            {dashboardSectionState("recent_inventory").enabled !== false ? (
            <section className="panel">
              <div className="compact-card-header">
                <div>
                  <h2>Recent Activity</h2>
                  <p>Latest Scout, Vault, TideTradr, and Forge updates.</p>
                </div>
              </div>
              <div className="home-list compact-home-list">
                {homeRecentActivity.length === 0 ? (
                  <div className="empty-state small-empty-state">
                    <h3>No recent activity yet.</h3>
                    <p>Add inventory, submit a report, or pin a market item to start building your daily view.</p>
                  </div>
                ) : (
                  homeRecentActivity.map((activity) => (
                    <button type="button" className="home-list-row home-timeline-row" key={activity.id} onClick={activity.action}>
                      <span className="activity-source-badge">{activity.label}</span>
                      <span>
                        <strong>{activity.title}</strong>
                        <small>{activity.detail}</small>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>
            ) : null}

            {(dashboardSectionState("purchaser_spending").enabled !== false || dashboardSectionState("market_summary").enabled !== false) ? (
            <section className="home-grid home-preview-grid">
              {dashboardSectionState("purchaser_spending").enabled !== false ? (
              <div className="panel">
                <div className="compact-card-header">
                  <div>
                    <h2>Recent Purchases</h2>
                    <p>Newest Vault or Forge entries.</p>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("inventory")}>View</button>
                </div>
                <div className="home-list compact-home-list">
                  {recentPurchases.length === 0 ? (
                    <div className="small-empty-state">
                      <p>No purchases logged yet.</p>
                      <button type="button" className="secondary-button" onClick={() => openProductAddFlow({ source: "home-recent-purchase", destinations: { forge: true } })}>Add Purchase</button>
                    </div>
                  ) : (
                    recentPurchases.slice(0, 3).map((item) => (
                      <button type="button" className="home-list-row" key={item.id} onClick={() => startEditingItem(item)}>
                        <span>
                          <strong>{item.name}</strong>
                          <small>{shortDate(item.createdAt)} | Qty {item.quantity || 1}</small>
                        </span>
                        <b>{money(Number(item.quantity || 0) * Number(item.unitCost || 0))}</b>
                      </button>
                    ))
                  )}
                </div>
              </div>
              ) : null}

              {dashboardSectionState("market_summary").enabled !== false ? (
              <div className="panel">
                <div className="compact-card-header">
                  <div>
                    <h2>Market Updates</h2>
                    <p>Latest TideTradr catalog values.</p>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("market")}>View</button>
                </div>
                <div className="home-list compact-home-list">
                  {recentMarketUpdates.length === 0 ? (
                    <div className="small-empty-state">
                      <p>No market updates yet.</p>
                      <button type="button" className="secondary-button" disabled>Refresh Market</button>
                    </div>
                  ) : (
                    recentMarketUpdates.slice(0, 3).map((product) => (
                      <button type="button" className="home-list-row" key={product.id} onClick={() => setActiveTab("market")}>
                        <span>
                          <strong>{product.name || product.productName || product.cardName}</strong>
                          <small>{product.productType || product.rarity || "Catalog item"} | {product.setName || "No set"}</small>
                        </span>
                        <b>{money(product.marketPrice || product.marketValue || 0)}</b>
                      </button>
                    ))
                  )}
                </div>
              </div>
              ) : null}
            </section>
            ) : null}

            {dashboardSectionState("watchlist").enabled !== false ? (
            <section className="feature-dropdown-stack home-optional-sections">
              <CollapsibleFeatureSection
                title="Pinned Market Watch"
                summary="Pinned products from TideTradr"
                open={isFeatureSectionOpen("home_tidetradr")}
                onToggle={() => toggleFeatureSection("home_tidetradr")}
              >
                {pinnedMarketWatchItems.length === 0 ? (
                  <p className="compact-subtitle">Pin products from TideTradr to watch market updates here.</p>
                ) : (
                  <div className="home-list compact-home-list">
                    {pinnedMarketWatchItems.map((item) => (
                      <button type="button" className="home-list-row" key={item.id} onClick={() => setActiveTab("market")}>
                        <span>
                          <strong>{item.name || item.productName || item.cardName}</strong>
                          <small>{item.setName || item.productType || "Pinned market item"}</small>
                        </span>
                        <b>{money(item.marketPrice || item.marketValue || 0)}</b>
                      </button>
                    ))}
                  </div>
                )}
              </CollapsibleFeatureSection>

            </section>
            ) : null}
          </div>
        )}
        {!activeTabLocked && false && activeTab === "dashboard" && (
          <div className="dashboard-layout">
            {renderPageChrome({
              title: "Home",
              subtitle: "Today at a glance: key totals, pinned market watch, and fast actions.",
              primary: { label: "Search", onClick: () => setSearchExpanded(true) },
              secondary: null,
              quickActions: [
                { label: "Add Inventory", onClick: () => openProductAddFlow({ source: "home-quick-inventory", destinations: { forge: true } }) },
                { label: "Add Report", onClick: () => openScoutSubmitFlow() },
                { label: "Add Expense", onClick: () => openAddExpenseFlow() },
                { label: "Search", onClick: () => setSearchExpanded(true) },
              ],
              tabs: [
                { key: "overview", label: "Overview" },
                { key: "activity", label: "Activity" },
                { key: "goals", label: "Goals" },
                { key: "settings", label: "Settings" },
              ],
              activeSubTab: homeSubTab,
              setActiveSubTab: setHomeSubTab,
            })}
            <section className="feature-dropdown-stack">
            {homeSubTab === "overview" ? (
              <>
            <CollapsibleFeatureSection
                title="Today / Overview"
                summary="The few Home numbers that matter most right now"
                open={isFeatureSectionOpen("home_dashboard_cards")}
                onToggle={() => toggleFeatureSection("home_dashboard_cards")}
              >
            {dashboardSectionEnabled("home_stats") ? (
            <section className="cards dashboard-section" style={dashboardSectionStyle("home_stats")}>
              {visibleCoreHomeStats.length === 0 ? (
                <div className="card">
                  <p>Home Page Stats</p>
                  <h2>Hidden</h2>
                </div>
              ) : (
                visibleCoreHomeStats.map((stat) => (
                  <div className="card" key={stat.key}>
                    <p>{stat.label}</p>
                    <h2>{stat.value}</h2>
                  </div>
                ))
              )}
            </section>
            ) : null}
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection
                title="Quick Actions"
                summary="Common actions without opening every tool"
                open={isFeatureSectionOpen("home_quick_actions")}
                onToggle={() => toggleFeatureSection("home_quick_actions")}
              >
            {dashboardSectionEnabled("quick_actions") ? (
            <section className="panel dashboard-section" style={dashboardSectionStyle("quick_actions")}>
              <h2>Quick Actions</h2>
              <div className="quick-actions home-inline-actions">
                <button type="button" onClick={() => openProductAddFlow({ source: "home-forge-item", destinations: { forge: true } })}>Add Forge Item</button>
                <button type="button" onClick={() => {
                  openScoutSubmitFlow();
                }}>Submit Scout Report</button>
                <button type="button" onClick={() => { setActiveTab("market"); openDealFinderModal(); }}>Check Deal</button>
                <button type="button" onClick={() => setActiveTab("catalog")}>Search Catalog</button>
              </div>
            </section>
            ) : null}
              </CollapsibleFeatureSection>
              <CollapsibleFeatureSection title="Pinned Market Watch" summary="Pinned products, watchlist count, and market value snapshot" open={isFeatureSectionOpen("home_tidetradr")} onToggle={() => toggleFeatureSection("home_tidetradr")}>
                <div className="cards mini-cards">
                  <div className="card"><p>Catalog</p><h2>{catalogProducts.length}</h2></div>
                  <div className="card"><p>Watchlist</p><h2>{tideTradrWatchlist.length}</h2></div>
                  <div className="card"><p>Market Value</p><h2>{money(totalMarketValue)}</h2></div>
                </div>
                <div className="quick-actions">
                  <button type="button" onClick={() => setActiveTab("market")}>Open TideTradr</button>
                  <button type="button" className="secondary-button" onClick={() => setTideTradrSubTab("watch")}>View Watchlist</button>
                </div>
              </CollapsibleFeatureSection>
              <section className="panel dashboard-section">
                <div className="compact-card-header">
                  <div>
                    <h2>Recent Activity</h2>
                    <p>Latest Scout, Vault, TideTradr, and Forge updates.</p>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => setHomeSubTab("activity")}>View All</button>
                </div>
                <div className="inventory-list compact-inventory-list">
                  {[...items.map((item) => ({ id: `item-${item.id}`, title: item.name, detail: `Vault/Forge item | ${money(Number(item.quantity || 0) * Number(item.unitCost || 0))}`, createdAt: item.createdAt })),
                    ...sales.map((sale) => ({ id: `sale-${sale.id}`, title: sale.itemName || "Sale", detail: `Sale | ${money(sale.grossSale)}`, createdAt: sale.createdAt })),
                    ...expenses.map((expense) => ({ id: `expense-${expense.id}`, title: expense.vendor || "Expense", detail: `${expense.category} | ${money(expense.amount)}`, createdAt: expense.createdAt })),
                  ]
                    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                    .slice(0, 5)
                    .map((activity) => (
                      <div className="compact-list-row" key={activity.id}>
                        <div>
                          <strong>{activity.title}</strong>
                          <p className="compact-subtitle">{activity.detail}</p>
                        </div>
                      </div>
                    ))}
                  {!forgeInventoryItems.length && !vaultItems.length && !sales.length && !expenses.length ? <p>No recent activity yet.</p> : null}
                  {!forgeInventoryItems.length && !vaultItems.length && !sales.length && !expenses.length ? <p className="compact-subtitle">Add a Vault item, Forge inventory, Scout report, or market watch to start building your dashboard.</p> : null}
                </div>
              </section>
              </>
            ) : null}
            {homeSubTab === "activity" ? (
              <>
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
              <section className="panel dashboard-section">
                <h2>All Home Metrics</h2>
                <p>These stay out of the default Home overview. Use Customize Dashboard to choose which ones appear on Home.</p>
                <div className="cards mini-cards">
                  {visibleDashboardStats.map((stat) => (
                    <div className="card" key={stat.key}>
                      <p>{stat.label}</p>
                      <h2>{stat.value}</h2>
                    </div>
                  ))}
                </div>
              </section>
              </>
            ) : null}
            {homeSubTab === "goals" ? (
              <>
              <CollapsibleFeatureSection
                title="Profit/Loss Overview"
                summary="Paid Forge metrics and seller summaries"
                open={isFeatureSectionOpen("home_profit_loss")}
                onToggle={() => toggleFeatureSection("home_profit_loss")}
              >
                <div className="cards mini-cards">
                  <div className="card"><p>Monthly Profit/Loss</p><h2>{money(monthlyProfitLoss)}</h2></div>
                  <div className="card"><p>Expenses</p><h2>{money(totalExpenses)}</h2></div>
                  <div className="card"><p>Marketing Spend</p><h2>{money(totalMarketingSpend)}</h2></div>
                  <div className="card"><p>After Marketing</p><h2>{money(estimatedProfitAfterMarketing)}</h2></div>
                </div>
              </CollapsibleFeatureSection>
              </>
            ) : null}
            {homeSubTab === "settings" ? (
              <>
              <CollapsibleFeatureSection
                title="Settings / Customize Dashboard"
                summary="Choose which Home metrics are visible and reset the dashboard layout"
                open={isFeatureSectionOpen("home_display_settings")}
                onToggle={() => toggleFeatureSection("home_display_settings")}
              >
            <section className="panel dashboard-section" style={dashboardSectionStyle("settings")}>
              <h2>Beta Settings</h2>
              <p>
                Ember & Tide TCG is running in private beta mode. Your beta data is stored in this browser.
              </p>
              <div className="quick-actions">
                <button type="button" className="secondary-button" onClick={resetBetaLocalData}>
                  Reset Private Beta Data
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
                  <div className="card"><p>Role</p><h2>{adminUser ? "Admin" : "User"}</h2></div>
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
                <p className="compact-subtitle">
                  {currentUserProfile.source === "local-beta"
                    ? "Private beta mode: admin/tier features require sign-in or a localhost dev override."
                    : `Profile source: ${currentUserProfile.source || "local"}. Email: ${currentUserProfile.email || "Unknown"}.`}
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
                  {Object.entries(HOME_VIEW_PRESETS).map(([key, preset]) => (
                    <button key={key} type="button" className="secondary-button" onClick={() => applyHomeViewPreset(key)}>
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="settings-toolbar">
                  <Field label="User Mode">
                    <select value={userType} onChange={(event) => updateUserType(event.target.value)}>
                      {USER_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type === "all_in_one" ? "All-in-one" : type.charAt(0).toUpperCase() + type.slice(1)}
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

                <div className="settings-toolbar">
                  <button type="button" className="secondary-button" onClick={() => updateDashboardCardStyle(dashboardCardStyle === "compact" ? "comfortable" : "compact")}>
                    {dashboardCardStyle === "compact" ? "Comfortable Mode" : "Compact Mode"}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setDashboardSectionsEnabled(["market_summary", "watchlist", "deal_checker"], false)}>
                    Hide Market Data
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setDashboardSectionsEnabled(["store_reports", "nearby_stores", "restock_calendar", "alerts"], false)}>
                    Hide Scout Data
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setDashboardSectionsEnabled(["recent_sales", "expenses_summary", "mileage_summary", "action_center", "purchaser_spending"], false)}>
                    Hide Forge Tools
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setDashboardSectionsEnabled(["wishlist", "catalog_shortcut", "recent_inventory"], false)}>
                    Hide Vault Tools
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
              </>
            ) : null}
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
                      <button type="button" className="home-list-row" key={sale.id} onClick={() => startEditingSale(sale)}>
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
            {renderVaultHeader()}

            <section id="vault-items-section" className="panel">
              <div className="compact-card-header">
                <div>
                  <h2>Vault Items</h2>
                  <p>Filter, search, and sort personal collection records without turning Vault into sales inventory.</p>
                </div>
                <div className="vault-toolbar">
                  <input className="vault-search-input" value={vaultSearch} onChange={(event) => setVaultSearch(event.target.value)} placeholder="Search by name, set, UPC, SKU, or notes." />
                  <select className="vault-filter-select" value={vaultFilter} onChange={(event) => setVaultFilter(event.target.value)}>
                    {VAULT_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <select className="vault-filter-select" value={vaultSort} onChange={(event) => setVaultSort(event.target.value)}>
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="name">Name A-Z</option>
                    <option value="highestMarket">Highest Market Value</option>
                    <option value="lowestMarket">Lowest Market Value</option>
                    <option value="highestRoi">Highest ROI</option>
                    <option value="quantity">Quantity</option>
                  </select>
                </div>
              </div>
              <details className="vault-status-help">
                <summary>Status definitions</summary>
                <div>
                  {VAULT_STATUS_OPTIONS.filter((status) => status.description).map((status) => (
                    <p key={status.value}><strong>{status.label}:</strong> {status.description}</p>
                  ))}
                </div>
              </details>
              <details className="vault-status-help">
                <summary>Bulk edit later</summary>
                <p>Select multiple items, move selected to Forge, change status, delete selected, and export selected are structured as future beta workflow controls.</p>
              </details>
              {editingItemId && vaultItems.some((item) => item.id === editingItemId) && (
                <VaultEditForm
                  form={itemForm}
                  setForm={updateItemForm}
                  item={vaultItems.find((item) => item.id === editingItemId)}
                  catalogProducts={catalogProducts}
                  purchasers={purchaserOptions}
                  onCreatePurchaser={addPurchaserName}
                  applyCatalogProduct={applyCatalogProduct}
                  handleImageUpload={handleImageUpload}
                  onSubmit={saveEditedItem}
                  onCancel={() => cancelVaultEdit()}
                  onMoveToForge={(item) => openVaultForgeTransfer(item, "move")}
                />
              )}
              {selectedVaultDetailId ? (
                <VaultItemDetail
                  item={vaultItems.find((item) => item.id === selectedVaultDetailId)}
                  onClose={() => setSelectedVaultDetailId("")}
                  onEdit={startEditingVaultItem}
                  onDelete={async (item) => { const deleted = await deleteItem(item.id); if (deleted) setSelectedVaultDetailId(""); }}
                  onMoveToForge={(item) => openVaultForgeTransfer(item, "move")}
                  onCopyToForge={(item) => openVaultForgeTransfer(item, "copy")}
                  onCreateListing={openVaultMarketplaceDecision}
                  onDuplicate={openVaultDuplicateItem}
                  onRefreshMarket={refreshVaultMarket}
                />
              ) : null}
              <div className="inventory-list compact-inventory-list">
                {vaultItems.length === 0 ? (
                  <div className="empty-state vault-empty-state">
                    <h3>Your Vault is empty.</h3>
                    <p>Add personal collection items, sealed products, or cards you want to hold.</p>
                    <div className="quick-actions">
                      <button type="button" onClick={openVaultQuickAddFlow}>Quick Add</button>
                    </div>
                  </div>
                ) : (
                  pagedVaultItems.items.map((item) => (
                    <CompactInventoryCard
                      key={item.id}
                      item={item}
                      variant="vault"
                      onRestock={prepareRestock}
                      onViewDetails={(vaultItem) => setSelectedVaultDetailId(vaultItem.id)}
                      onEdit={startEditingVaultItem}
                      onDelete={deleteItem}
                      onStatusChange={updateItemStatus}
                      onMoveToForge={(vaultItem) => openVaultForgeTransfer(vaultItem, "move")}
                      onCopyToForge={(vaultItem) => openVaultForgeTransfer(vaultItem, "copy")}
                      onDuplicate={openVaultDuplicateItem}
                    />
                  ))
                )}
                {vaultItems.length > 0 && visibleVaultItems.length === 0 ? (
                  <div className="empty-state">
                    <h3>No {VAULT_FILTER_OPTIONS.find((option) => option.value === vaultFilter)?.label || "Vault"} items yet</h3>
                    <p>Switch filters or add an item with this Vault status.</p>
                  </div>
                ) : null}
              </div>
              <PaginationControls
                label="Vault Items"
                page={pagedVaultItems.page}
                pageCount={pagedVaultItems.pageCount}
                totalCount={pagedVaultItems.total}
                pageSize={LONG_LIST_PAGE_SIZE}
                onPageChange={(page) => {
                  setVaultPage(page);
                  scrollToResultsTop();
                }}
                compact
              />
            </section>
          </>
        )}

        {activeTab === "scout" && (
          <>
            {renderScoutHeader()}

            {scoutView === "reports" ? (
              <>
                <section className="panel" ref={scoutReportsRef} tabIndex={-1}>
                  <div className="compact-card-header">
                    <div>
                      <h2>Reports</h2>
                      <p>Filter recent reports without leaving Scout.</p>
                    </div>
                    <div className="summary-pill-row">
                      <span className="status-badge">{filteredScoutReports.length} shown</span>
                      <button type="button" className="secondary-button" onClick={() => {
                        setScoutView("main");
                        setScoutSubTabTarget({ tab: "overview", id: Date.now() });
                        loadScoutSnapshot();
                      }}>Back to Scout</button>
                      <button type="button" onClick={() => {
                        openScoutSubmitFlow();
                      }}>Submit Report</button>
                    </div>
                  </div>
                  {renderScoutFilterControls()}
                  <div className="inventory-list compact-inventory-list">
                    {filteredScoutReports.length === 0 ? (
                      <div className="empty-state">
                        <h3>No Scout reports yet</h3>
                        <p>Submit a report after checking a store so Scout can learn what matters nearby.</p>
                      </div>
                    ) : null}
                    {pagedScoutReports.items.map((report) => renderScoutReportCard(report))}
                  </div>
                  <PaginationControls
                    label="Reports"
                    page={pagedScoutReports.page}
                    pageCount={pagedScoutReports.pageCount}
                    totalCount={pagedScoutReports.total}
                    pageSize={LONG_LIST_PAGE_SIZE}
                    onPageChange={(page) => {
                      setScoutReportsPage(page);
                      scrollToResultsTop(scoutReportsRef);
                    }}
                    compact
                  />
                </section>
              </>
            ) : scoutView === "submit" ? (
              <>
                <section className="embedded-page">
              <Scout
                targetSubTab={{ ...scoutSubTabTarget, tab: "reports" }}
                compact
                adminMode={adminUser}
                supabase={supabase}
                isSupabaseConfigured={isSupabaseConfigured}
                mapCatalogRow={mapCatalog}
                money={money}
              />
                </section>
              </>
            ) : scoutView === "alerts" ? (
              <>
                <section className="embedded-page">
              <Scout
                targetSubTab={{ tab: "alerts", id: scoutSubTabTarget.id }}
                compact
                onLocationRequired={requestScoutLocation}
                adminMode={adminUser}
                supabase={supabase}
                isSupabaseConfigured={isSupabaseConfigured}
                mapCatalogRow={mapCatalog}
                money={money}
              />
                </section>
              </>
            ) : scoutView === "stores" ? (
              <>
                <section className="embedded-page">
              <Scout
                targetSubTab={{ ...scoutSubTabTarget, tab: "stores" }}
                compact
                onLocationRequired={requestScoutLocation}
                adminMode={adminUser}
                supabase={supabase}
                isSupabaseConfigured={isSupabaseConfigured}
                mapCatalogRow={mapCatalog}
                money={money}
              />
                </section>
              </>
            ) : (
            <>
            {false ? (
            <section className={getHeaderCardClass("tab-summary panel")}>
              <div>
                <h2>Scout</h2>
                <p>Find stores, submit reports, and check alerts near you.</p>
              </div>
              <QuickActionGrid
                className="scout-main-actions"
                ariaLabel="Scout quick actions"
                actions={[
                  {
                    key: "scout-submit",
                    title: "Submit Report",
                    subtitle: "Restock or sighting",
                    onClick: () => {
                      openScoutSubmitFlow();
                    },
                  },
                  {
                    key: "scout-stores",
                    title: "Stores",
                    subtitle: `${scoutSnapshot.stores.length} nearby entries`,
                    onClick: () => {
                      if (!requestScoutLocation()) return;
                      setScoutSubTabTarget({ tab: "stores", id: Date.now() });
                      setScoutView("stores");
                    },
                  },
                  {
                    key: "scout-reports",
                    title: "Reports",
                    subtitle: `${(scoutSnapshot.reports || []).length} recent`,
                    onClick: () => {
                      setScoutReportFilter("Latest");
                      setScoutView("reports");
                    },
                  },
                  {
                    key: "scout-alerts",
                    title: "Alerts",
                    subtitle: `${(scoutSnapshot.bestBuyAlerts || []).length} active`,
                    onClick: () => {
                      setScoutSubTabTarget({ tab: "alerts", id: Date.now() });
                      setScoutView("alerts");
                    },
                  },
                  {
                    key: "scout-score",
                    title: "Scout Score",
                    subtitle: `${scoutSnapshot.scoutProfile?.trustScore || 72} trust score`,
                    onClick: () => setScoutScoreModalOpen(true),
                  },
                ]}
              />
              <div className="cards mini-cards">
                <button type="button" className="card stat-button-card" onClick={() => {
                  if (!requestScoutLocation()) return;
                  setScoutSubTabTarget({ tab: "stores", id: Date.now() });
                  setScoutView("stores");
                }}><p>Nearby stores</p><h2>{scoutSnapshot.stores.length}</h2></button>
                <button type="button" className="card stat-button-card" onClick={() => {
                  setScoutReportFilter("Latest");
                  setScoutView("reports");
                }}><p>Recent reports</p><h2>{(scoutSnapshot.reports || []).length}</h2></button>
                <button type="button" className="card stat-button-card" onClick={() => {
                  setScoutSubTabTarget({ tab: "alerts", id: Date.now() });
                  setScoutView("alerts");
                }}><p>Active alerts</p><h2>{(scoutSnapshot.bestBuyAlerts || []).length}</h2></button>
                <button type="button" className="card stat-button-card" onClick={() => {
                  setScoutScoreModalOpen(true);
                }}><p>Scout score</p><h2>{scoutSnapshot.scoutProfile?.trustScore || 72}</h2></button>
              </div>
            </section>
            ) : null}

            <div className="scout-accordion-stack">
              {renderScoutAccordionSection({
                id: "quickActions",
                title: "Quick Actions",
                summary: "Submit or suggest",
                children: (
                  <div className="scout-quick-action-grid">
                    <button type="button" onClick={() => openScoutSubmitFlow()}>Submit Report</button>
                    <button type="button" className="secondary-button" onClick={() => {
                      setScoutSubTabTarget({ tab: "stores", action: "missingStore", id: Date.now() });
                      setScoutView("stores");
                    }}>Add Store Suggestion</button>
                  </div>
                ),
              })}

              {renderScoutAccordionSection({
                id: "reports",
                title: "Reports",
                summary: `${filteredScoutReports.length} shown`,
                children: (
                  <div ref={scoutReportsRef} tabIndex={-1}>
                    {renderScoutFilterControls()}
                    <div className="inventory-list compact-inventory-list">
                      {filteredScoutReports.length === 0 ? (
                        <div className="empty-state">
                          <h3>No Scout reports yet</h3>
                          <p>Submit a report after checking a store so Scout can learn what matters nearby.</p>
                        </div>
                      ) : null}
                      {pagedScoutReports.items.map((report) => renderScoutReportCard(report))}
                    </div>
                    <PaginationControls
                      label="Reports"
                      page={pagedScoutReports.page}
                      pageCount={pagedScoutReports.pageCount}
                      totalCount={pagedScoutReports.total}
                      pageSize={LONG_LIST_PAGE_SIZE}
                      onPageChange={(page) => {
                        setScoutReportsPage(page);
                        scrollToResultsTop(scoutReportsRef);
                      }}
                      compact
                    />
                  </div>
                ),
              })}

              {renderScoutAccordionSection({
                id: "alerts",
                title: "Alerts",
                summary: `${(scoutSnapshot.bestBuyAlerts || []).length} active`,
                children: (
                  <div className="small-empty-state">
                    <strong>{(scoutSnapshot.bestBuyAlerts || []).length ? "Active alerts available" : "0 active alerts"}</strong>
                    <span>Open Alerts for watchlist, store, and source notifications.</span>
                    <button type="button" className="secondary-button" onClick={() => {
                      setScoutSubTabTarget({ tab: "alerts", id: Date.now() });
                      setScoutView("alerts");
                    }}>Open Alerts</button>
                  </div>
                ),
              })}

              {renderScoutAccordionSection({
                id: "stores",
                title: "Stores",
                summary: "Nearby stores",
                children: (
                  <div className="small-empty-state">
                    <strong>{scoutSnapshot.stores.length} stores available</strong>
                    <span>Group stores by retailer, city, distance, or favorites.</span>
                    <button type="button" className="secondary-button" onClick={() => {
                      if (!requestScoutLocation()) return;
                      setScoutSubTabTarget({ tab: "stores", id: Date.now() });
                      setScoutView("stores");
                    }}>Open Stores</button>
                  </div>
                ),
              })}

              {renderScoutAccordionSection({
                id: "predictions",
                title: "Predictions",
                summary: "Restock patterns",
                children: (
                  <div className="small-empty-state">
                    <strong>Prediction windows are based on verified report history.</strong>
                    <span>Submit consistent store reports to make this more useful during beta.</span>
                  </div>
                ),
              })}

              {renderScoutAccordionSection({
                id: "myReports",
                title: "My Reports",
                summary: "Your submissions",
                children: (
                  <div className="inventory-list compact-inventory-list">
                    {filteredScoutReports.filter(isCurrentUserScoutReport).slice(0, 4).map((report) => renderScoutReportCard(report, { compact: true }))}
                    {!filteredScoutReports.filter(isCurrentUserScoutReport).length ? <p className="compact-subtitle">You have not submitted a report yet.</p> : null}
                  </div>
                ),
              })}

              {renderScoutAccordionSection({
                id: "needsReview",
                title: "Needs Review",
                summary: `${scoutReportRows.filter((report) => scoutReportStatusLabel(report) === "Needs Review" || scoutReportStatusLabel(report) === "Pending").length} pending`,
                children: (
                  <div className="inventory-list compact-inventory-list">
                    {scoutReportRows.filter((report) => scoutReportStatusLabel(report) === "Needs Review" || scoutReportStatusLabel(report) === "Pending").slice(0, 4).map((report) => renderScoutReportCard(report, { compact: true }))}
                    {!scoutReportRows.filter((report) => scoutReportStatusLabel(report) === "Needs Review" || scoutReportStatusLabel(report) === "Pending").length ? <p className="compact-subtitle">0 pending review items.</p> : null}
                  </div>
                ),
              })}
            </div>
            </>
            )}
          </>
        )}

        {activeTab === "menu" && (
          <>
            <PageHeader
              className={getHeaderCardClass("panel settings-page-header")}
              title="Settings"
              subtitle="Account, mode, dashboard, alerts, and subscription."
              actions={<button type="button" onClick={() => setMenuOpen(true)}>Open Menu</button>}
              summary={(
                <div className="settings-header-summary">
                  <span>{TIER_LABELS[currentTier] || currentPlan}</span>
                  <span>{user.email}</span>
                </div>
              )}
            />
          </>
        )}

        {activeTab === "market" && (
          <>
            {renderTideTradrHeader()}
            {tideTradrSubTab === "deal" ? (
              <section className="panel">
                <div className="empty-state">
                  <h3>Deal Finder opens in a focused sheet.</h3>
                  <p>Use the TideTradr header action to check product, quantity, asking price, and recommendation without changing the page.</p>
                  <button type="button" onClick={() => openDealFinderModal()}>Open Deal Finder</button>
                </div>
              </section>
            ) : tideTradrSubTab === "watch" ? (
              <>
                {false ? (
                <section className={getHeaderCardClass("tab-summary panel")}>
                  <div>
                    <h2>TideTradr &gt; Market Watch</h2>
                    <p>Watched products, pinned items, recent value checks, and deal shortcuts.</p>
                  </div>
                  <div className="summary-pill-row">
                    <button type="button" className="secondary-button" onClick={() => setTideTradrSubTab("overview")}>Back to TideTradr</button>
                  </div>
                </section>
                ) : null}
                {false ? (
                <section className={getHeaderCardClass("tab-summary panel")}>
                  <div>
                    <h2>Market Watch</h2>
                    <p>Watched products, pinned items, recent value checks, and deal shortcuts.</p>
                  </div>
                </section>
                ) : null}
                <section className="panel tidetradr-watch-panel">
                  <div className="compact-card-header">
                    <div>
                      <h2>Market Watch</h2>
                      <p>{tideTradrWatchlist.length} watched item{tideTradrWatchlist.length === 1 ? "" : "s"}.</p>
                    </div>
                    <span className="status-badge">{tideTradrWatchlist.filter((item) => item.pinned || item.isPinned).length} pinned</span>
                  </div>
                  <div className="quick-actions tidetradr-watch-actions">
                    <button type="button" onClick={refreshPinnedMarketWatch}>Refresh Values</button>
                    <button type="button" className="secondary-button" onClick={refreshMarketWatchlist}>Refresh Watchlist</button>
                    <button type="button" className="secondary-button" onClick={() => setTideTradrSubTab("overview")}>Search Catalog</button>
                  </div>
                  {tideTradrWatchlist.length === 0 ? (
                    <div className="empty-state">
                      <h3>No watched products yet</h3>
                      <p>Add products from TideTradr search to track market values here.</p>
                      <button type="button" onClick={() => setTideTradrSubTab("overview")}>Search Catalog</button>
                    </div>
                  ) : (
                    <div className="inventory-list tidetradr-watch-list">
                      {pagedMarketWatchItems.items.map((item) => (
                        <div className="inventory-card compact-card tidetradr-watch-card" key={item.id}>
                          <div className="compact-card-header">
                            <div>
                              <h3>{item.name}</h3>
                              <p>{item.setName || "No set"} | {item.productType || "No type"}</p>
                            </div>
                            <span className="status-badge">{item.pinned ? "Pinned" : MARKET_STATUS_LABELS[item.marketStatus] || "Watchlist"}</span>
                          </div>
                          <p>Market: {money(item.marketValue)} | MSRP: {money(item.msrp)}</p>
                          <p className="compact-subtitle">Source: {item.sourceName || "Unknown"} | Last updated: {item.lastUpdated ? new Date(item.lastUpdated).toLocaleDateString() : "Unknown"}</p>
                          <div className="quick-actions tidetradr-watch-actions">
                            <button type="button" onClick={() => useCatalogProductInDeal(item.productId)}>Check Deal</button>
                            <button type="button" className="secondary-button" onClick={() => openWatchlistProductDetails(item)}>View Details</button>
                            <button type="button" className="secondary-button" onClick={() => removeTideTradrWatchlistItem(item.id)}>Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <PaginationControls
                    label="Watched Products"
                    page={pagedMarketWatchItems.page}
                    pageCount={pagedMarketWatchItems.pageCount}
                    totalCount={pagedMarketWatchItems.total}
                    pageSize={LONG_LIST_PAGE_SIZE}
                    onPageChange={(page) => {
                      setMarketWatchPage(page);
                      scrollToResultsTop();
                    }}
                    compact
                  />
                </section>
              </>
            ) : tideTradrSubTab === "recent" ? (
              <section className="panel tidetradr-results-panel">
                <div className="compact-card-header">
                  <div>
                    <h2>Recent Checks</h2>
                    <p>Recently viewed products and value checks from TideTradr.</p>
                  </div>
                  <span className="status-badge">{tideTradrLookupProduct ? "1 recent" : "No recent checks"}</span>
                </div>
                {tideTradrLookupProduct ? (
                  <div className="catalog-results-list">
                    <div className="catalog-result-card">
                      <button type="button" className="catalog-result-main" onClick={() => openCatalogDetails(tideTradrLookupProduct.id)}>
                        <div className="catalog-thumb">
                          {catalogImage(tideTradrLookupProduct) ? (
                            <>
                              <img
                                src={catalogImage(tideTradrLookupProduct)}
                                alt=""
                                onError={(event) => {
                                  event.currentTarget.style.display = "none";
                                  event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                                }}
                              />
                              <div className="image-needed-placeholder" hidden>
                                <strong>{catalogTitle(tideTradrLookupProduct)}</strong>
                                <span>Image needed</span>
                              </div>
                            </>
                          ) : (
                            <div className="image-needed-placeholder">
                              <strong>{catalogTitle(tideTradrLookupProduct)}</strong>
                              <span>Image needed</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <span className="catalog-pill">{tideTradrLookupProduct.catalogType === "card" ? "Card" : "Sealed"}</span>
                          <h3>{catalogTitle(tideTradrLookupProduct)}</h3>
                          <p>{tideTradrLookupProduct.productType || "Product"} | {tideTradrLookupProduct.setName || tideTradrLookupProduct.expansion || "No set"}</p>
                          <p>Market: {money(getTideTradrMarketInfo(tideTradrLookupProduct).currentMarketValue)}</p>
                        </div>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <h3>No recent checks yet</h3>
                    <p>Search TideTradr and open a product to start building recent checks.</p>
                  </div>
                )}
              </section>
            ) : (
              <>
                {false ? (
                <section className={getHeaderCardClass("tab-summary panel tidetradr-summary-card")}>
                  <div>
                    <h2>TideTradr</h2>
                    <p>Search products, check market values, watch items, and compare deals.</p>
                  </div>
                  <form className="catalog-search-form" onSubmit={submitCatalogSearch}>
                    <SmartCatalogSearchBox
                      value={catalogSearch}
                      onChange={updateCatalogSearchInput}
                      onSearch={() => submitCatalogSearch()}
                      onSelectSuggestion={selectCatalogRecommendation}
                      supabase={supabase}
                      isSupabaseConfigured={isSupabaseConfigured}
                      mapRow={mapCatalog}
                      productGroup={currentCatalogProductGroup()}
                      dataFilter={catalogDataFilter}
                      inputClassName="search-input"
                      placeholder="Search by name, set, product type, card number, or scanned barcode..."
                      closeSignal={catalogSuggestionCloseSignal}
                      maxSuggestions={5}
                      money={money}
                    />
                    <button type="submit">Search</button>
                  </form>
                  <QuickActionGrid
                    className="tidetradr-shortcut-grid"
                    ariaLabel="TideTradr quick actions"
                    actions={[
                      {
                        key: "tidetradr-search",
                        title: "Search Catalog",
                        subtitle: catalogSearchHasRun ? `${supabaseCatalogStatus.totalCount ?? tideTradrCatalogResults.length} results` : "Search first",
                        onClick: () => submitCatalogSearch(),
                      },
                      {
                        key: "tidetradr-watch",
                        title: "Market Watch",
                        subtitle: `${tideTradrWatchlist.length} watched`,
                        onClick: () => setTideTradrSubTab("watch"),
                      },
                      {
                        key: "tidetradr-deal",
                        title: "Deal Finder",
                        subtitle: "Check Deal",
                        ariaLabel: "Check Deal",
                        onClick: () => {
                          const currentQuery = String(catalogSearch || "").trim();
                          if (currentQuery) {
                            setDealForm((current) => ({ ...current, title: current.title || currentQuery }));
                          }
                          setTideTradrSubTab("deal");
                        },
                      },
                      {
                        key: "tidetradr-watchlist",
                        title: "Watchlist",
                        subtitle: `${tideTradrWatchlist.filter((item) => item.pinned || item.isPinned).length} pinned`,
                        onClick: () => setTideTradrSubTab("watch"),
                      },
                      {
                        key: "tidetradr-recent",
                        title: "Recent Checks",
                        subtitle: tideTradrLookupProduct ? catalogTitle(tideTradrLookupProduct) : "No recent check yet",
                        onClick: () => tideTradrLookupProduct ? openCatalogDetails(tideTradrLookupProduct.id) : setTideTradrSubTab("watch"),
                      },
                    ]}
                  />
                </section>
                ) : null}

                {false ? (
                <section className="tidetradr-hub-grid">
                  <article className="compact-card tidetradr-preview-card">
                    <div>
                      <h3>Market Watch</h3>
                      <p>{tideTradrWatchlist.length ? `${tideTradrWatchlist.length} watched item${tideTradrWatchlist.length === 1 ? "" : "s"}.` : "No watched products yet."}</p>
                      <p className="compact-subtitle">
                        {tideTradrWatchlist.filter((item) => item.pinned || item.isPinned).length} pinned | {tideTradrWatchlist.filter((item) => item.lastUpdated).length} recent checks | {tideTradrWatchlist.filter((item) => Number(item.marketValue || 0) <= 0).length} missing prices
                      </p>
                    </div>
                    {tideTradrWatchlist.length ? (
                      <div className="tidetradr-preview-list">
                        {tideTradrWatchlist.slice(0, 2).map((item) => (
                          <button type="button" key={item.id} onClick={() => openWatchlistProductDetails(item)}>
                            <strong>{item.name}</strong>
                            <span>{money(item.marketValue)} | {item.setName || item.productType || "Watchlist item"}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="compact-subtitle">Add products from search to watch market updates here.</p>
                    )}
                    <button type="button" onClick={() => setTideTradrSubTab("watch")}>Open Market Watch</button>
                  </article>
                  <article className="compact-card tidetradr-preview-card">
                    <div>
                      <h3>Deal Finder</h3>
                      <p>Check asking price against market and MSRP.</p>
                    </div>
                    <button type="button" onClick={() => setTideTradrSubTab("deal")}>Open Deal Finder</button>
                  </article>
                </section>
                ) : null}

                <section ref={catalogResultsRef} className={`panel tidetradr-results-panel ${!catalogSearchHasRun && !supabaseCatalogStatus.loading ? "tidetradr-results-panel--prompt" : ""}`}>
                  <div className="compact-card-header">
                    <div>
                      <h2>Product Results</h2>
                      <p>
                        {catalogSearchHasRun
                          ? `${tideTradrCatalogResults.length} shown from the current paged search.`
                          : "Search TideTradr to load catalog results."}
                      </p>
                    </div>
                    <span className="status-badge">{supabaseCatalogStatus.loading ? "Searching..." : catalogSearchHasRun ? `${supabaseCatalogStatus.totalCount ?? tideTradrCatalogResults.length} results` : "Search first"}</span>
                  </div>

                  {catalogSearchHasRun ? (
                  <div className="catalog-results-toolbar">
                    <Field label="Sort">
                      <select value={catalogSort} onChange={(e) => setCatalogSort(e.target.value)}>
                        {CATALOG_SORT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </Field>
                    <div className="catalog-view-toggle" role="group" aria-label="Catalog result view">
                      <button
                        type="button"
                        className={catalogViewMode === "grid" ? "active" : ""}
                        aria-pressed={catalogViewMode === "grid"}
                        onClick={() => setCatalogViewMode("grid")}
                      >
                        Grid
                      </button>
                      <button
                        type="button"
                        className={catalogViewMode === "list" ? "active" : ""}
                        aria-pressed={catalogViewMode === "list"}
                        onClick={() => setCatalogViewMode("list")}
                      >
                        List
                      </button>
                    </div>
                    <div className="quick-actions">
                      <button type="button" className="secondary-button" onClick={clearCatalogSearch}>Clear</button>
                    </div>
                  </div>
                  ) : null}

                  {catalogSearchHasRun ? (
                  <div className="quick-action-rail">
                    {[
                      ["All", "All"],
                      ["card", "Cards"],
                      ["sealed", "Sealed"],
                      ["other", "Other"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={catalogKindFilter === value ? "primary" : ""}
                        onClick={() => setCatalogKindFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                    {["Has market price", "Has image", "Missing price"].map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        className={catalogDataFilter === filter ? "primary" : ""}
                        onClick={() => setCatalogDataFilter(catalogDataFilter === filter ? "All" : filter)}
                      >
                        {filter}
                      </button>
                    ))}
                    <button type="button" className="secondary-button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, market_filters: !current.market_filters }))}>More Filters</button>
                    <button type="button" className="secondary-button" onClick={openWhatDidISee}>Add Scout Sighting</button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        if (adminUser) {
                          setActiveTab("catalog");
                          setFeatureSectionsOpen((current) => ({ ...current, catalog_manual: true }));
                          return;
                        }
                        submitUniversalSuggestion({
                          suggestionType: SUGGESTION_TYPES.ADD_MISSING_CATALOG_PRODUCT,
                          targetTable: "catalog_items",
                          submittedData: { searchTerm: catalogSearch, productType: catalogTypeFilter, setName: catalogSetFilter },
                          notes: "User suggested a missing catalog product from TideTradr search.",
                          source: "tidetradr-search",
                        });
                      }}
                    >
                      {adminUser ? "Add Catalog Item" : "Suggest Missing Product"}
                    </button>
                  </div>
                  ) : null}

                  {catalogSearchHasRun && isFeatureSectionOpen("market_filters") ? (
                    <div className="filter-grid">
                      <Field label="Set / Expansion">
                        <select value={catalogSetFilter} onChange={(e) => setCatalogSetFilter(e.target.value)}>
                          {catalogSetOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </Field>
                      <Field label="Product Type">
                        <select value={catalogTypeFilter} onChange={(e) => setCatalogTypeFilter(e.target.value)}>
                          {catalogTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </Field>
                      <Field label="Rarity">
                        <select value={catalogRarityFilter} onChange={(e) => setCatalogRarityFilter(e.target.value)}>
                          {catalogRarityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </Field>
                      <Field label="Image / Price">
                        <select value={catalogDataFilter} onChange={(e) => setCatalogDataFilter(e.target.value)}>
                          <option>All</option>
                          <option>Has market price</option>
                          <option>Has image</option>
                          <option>Missing price</option>
                        </select>
                      </Field>
                    </div>
                  ) : null}

                  {(catalogSearchHasRun || supabaseCatalogStatus.loading) ? (
                    <p className="compact-subtitle">Search runs against Supabase with pagination. It does not load the full 52,000+ product catalog into the browser.</p>
                  ) : null}
                  {supabaseCatalogStatus.message ? <p className="compact-subtitle">{supabaseCatalogStatus.message}</p> : null}
                  {supabaseCatalogStatus.error ? <p className="compact-subtitle danger-text">{supabaseCatalogStatus.error}</p> : null}
                  {supabaseCatalogStatus.exactBarcodeMiss ? <p className="compact-subtitle">No exact barcode match found. Partial catalog matches may still appear below.</p> : null}

                  {!catalogSearchHasRun && !supabaseCatalogStatus.loading ? (
                    <div className="small-empty-state tidetradr-search-prompt">
                      <strong>Search TideTradr to load catalog results.</strong>
                      <span>Use the header search for product names, sets, UPC, SKU, IDs, card numbers, and shorthand.</span>
                    </div>
                  ) : null}

                  {supabaseCatalogStatus.loading ? (
                    <div className="catalog-results-list catalog-results-grid catalog-results-loading" aria-label="Loading catalog results">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div className="catalog-result-card catalog-result-skeleton" key={`catalog-loading-${index}`}>
                          <div className="catalog-thumb" />
                          <span />
                          <strong />
                          <em />
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {catalogSearchHasRun && !supabaseCatalogStatus.loading && tideTradrCatalogResults.length === 0 ? (
                    <div className="empty-state">
                      <h3>No matching products found</h3>
                      <p>Try a different name, set, barcode, product type, or card number.</p>
                    </div>
                  ) : null}

                  {catalogSearchHasRun && tideTradrCatalogResults.length > 0 ? (
                    <div className={`catalog-results-list catalog-results-${catalogViewMode}`}>
                      {tideTradrCatalogResults.map((p) => {
                        const marketInfo = getTideTradrMarketInfo(p);
                        const lowPrice = Number(p.lowPrice || 0);
                        const midPrice = Number(p.midPrice || p.marketPrice || 0);
                        const highPrice = Number(p.highPrice || 0);
                        const resultGroup = p.catalogType === "card" ? "Card" : p.catalogType === "sealed" ? "Sealed" : p.catalogGroup || "Other";
                        return (
                          <div className="catalog-result-card" key={p.id}>
                            <button type="button" className="catalog-result-main" onClick={() => openCatalogDetails(p.id)}>
                              <div className="catalog-thumb">
                                {catalogImage(p) ? (
                                  <>
                                    <img
                                      src={catalogImage(p)}
                                      alt=""
                                      onError={(event) => {
                                        event.currentTarget.style.display = "none";
                                        event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                                      }}
                                    />
                                    <div className="image-needed-placeholder" hidden>
                                      <strong>{catalogTitle(p)}</strong>
                                      <span>Image needed</span>
                                    </div>
                                  </>
                                ) : (
                                  <div className="image-needed-placeholder">
                                    <strong>{catalogTitle(p)}</strong>
                                    <span>Image needed</span>
                                  </div>
                                )}
                              </div>
                              <div>
                                <span className="catalog-pill">{resultGroup}</span>
                                <h3>{catalogTitle(p)}</h3>
                                <p className="catalog-result-detail-line">
                                  {p.productType || resultGroup} | {catalogExpansionName(p) || "Expansion unavailable"}
                                  {p.cardNumber ? ` | #${p.cardNumber}` : ""}
                                </p>
                                {(p.barcode || p.sku || p.externalProductId || p.tcgplayerProductId) ? (
                                  <p className="compact-subtitle catalog-result-id-line">Barcode/SKU: {p.barcode || p.upc || p.sku || p.externalProductId || p.tcgplayerProductId}</p>
                                ) : null}
                                <p className="catalog-result-price-line">
                                  Market: {hasCatalogMarketPrice(p) ? money(marketInfo.currentMarketValue) : "Market data unavailable"}
                                  {p.catalogType !== "card" ? ` | MSRP: ${marketInfo.msrp ? money(marketInfo.msrp) : "MSRP unavailable"}` : ""}
                                </p>
                                <p className="compact-subtitle catalog-result-source-line">Source: {p.marketSource || p.sourceType || "Unknown"}{p.priceSubtype ? ` | ${p.priceSubtype}` : ""}</p>
                                {p.historySnapshotCount > 0 ? (
                                  <p className="compact-subtitle catalog-result-history-line">History available: {p.historySnapshotCount} snapshot{p.historySnapshotCount === 1 ? "" : "s"}</p>
                                ) : null}
                                <span className="status-badge">{MARKET_STATUS_LABELS[marketInfo.marketStatus] || "Unknown"}</span>
                              </div>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {catalogSearchHasRun ? (
                    <PaginationControls
                      label="Results"
                      page={supabaseCatalogStatus.page || 1}
                      pageCount={tideTradrCatalogPageCount || (supabaseCatalogStatus.hasMore ? (supabaseCatalogStatus.page || 1) + 1 : 1)}
                      totalCount={supabaseCatalogStatus.totalCount ?? tideTradrCatalogResults.length}
                      pageSize={supabaseCatalogStatus.pageSize || catalogPageSize}
                      pageSizeOptions={CATALOG_PAGE_SIZE_OPTIONS}
                      onPageChange={goToCatalogPage}
                      onPageSizeChange={updateCatalogPageSize}
                      disabled={supabaseCatalogStatus.loading}
                    />
                  ) : null}
                </section>

                <section className="feature-dropdown-stack">
                  {false ? (
                  <CollapsibleFeatureSection title="Market Watch" summary="Watchlist, pinned market items, and recent value checks" open={isFeatureSectionOpen("market_watchlist")} onToggle={() => toggleFeatureSection("market_watchlist")}>
                    <div className="quick-actions">
                      <button type="button" onClick={refreshPinnedMarketWatch}>Refresh Market Values</button>
                      <button type="button" className="secondary-button" onClick={refreshMarketWatchlist}>Refresh Watchlist</button>
                    </div>
                    {tideTradrWatchlist.length === 0 ? <p>No watched TideTradr products yet.</p> : null}
                    <div className="inventory-list">
                      {tideTradrWatchlist.map((item) => (
                        <div className="inventory-card compact-card" key={item.id}>
                          <h3>{item.name}</h3>
                          <p>{item.setName || "No set"} | {item.productType || "No type"}</p>
                          <p>Market: {money(item.marketValue)} | MSRP: {money(item.msrp)}</p>
                          <p>Status: {MARKET_STATUS_LABELS[item.marketStatus] || "Unknown"} | {item.sourceName}</p>
                          <div className="quick-actions">
                            <button type="button" onClick={() => useCatalogProductInDeal(item.productId)}>Check Deal</button>
                            <button type="button" className="secondary-button" onClick={() => removeTideTradrWatchlistItem(item.id)}>Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleFeatureSection>
                  ) : null}

                  {false ? (
                  <section className="tidetradr-tool-grid">
                    <article className="compact-card tidetradr-tool-card">
                      <div>
                        <h3>Deal Finder</h3>
                        <p>Check asking price against market and MSRP before you buy, keep, or pass.</p>
                      </div>
                      <button type="button" onClick={() => setTideTradrSubTab("deal")}>Open Deal Finder</button>
                    </article>
                  </section>
                  ) : null}

                  {false && adminUser ? (
                  <CollapsibleFeatureSection title="Market Sources / Admin" summary="Admin-only source, sync, manual value, and market to-do tools" open={isFeatureSectionOpen("market_sources")} onToggle={() => toggleFeatureSection("market_sources")}>
                    <div className="small-empty-state admin-only-note">
                      <strong>Admin only.</strong>
                      <span>Protected provider credentials stay server-side. Only safe source status is shown here.</span>
                    </div>
                    <div className="cards mini-cards">
                      <div className="card"><p>Cached Price Records</p><h2>{cachedMarketPriceCount}</h2></div>
                      <div className="card"><p>Failed Matches</p><h2>{failedMarketMatches.length}</h2></div>
                      <div className="card"><p>Last Sync</p><h2>{lastMarketSync === "Not synced yet" ? "None" : new Date(lastMarketSync).toLocaleDateString()}</h2></div>
                      <div className="card"><p>Live API</p><h2>Not connected</h2></div>
                    </div>
                    <p className="compact-subtitle">Market values are labeled Live, Cached, Manual, Estimated, or Unknown. Beta sync uses local/import-ready data unless a backend source is connected.</p>
                    {marketSyncMessage ? <p className="compact-subtitle">{marketSyncMessage}</p> : null}
                    <div className="quick-actions">
                      <button type="button" onClick={() => refreshMarketCatalog("card")}>Sync Cards</button>
                      <button type="button" className="secondary-button" onClick={() => refreshMarketCatalog("sealed")}>Sync Sealed Products</button>
                      <button type="button" className="secondary-button" onClick={refreshMarketWatchlist}>Refresh Watchlist</button>
                      <button type="button" className="secondary-button" onClick={refreshPinnedMarketWatch}>Refresh Pinned Market Watch</button>
                    </div>
                    <details className="scout-score-guidelines">
                      <summary>Manual Price Entry</summary>
                      <form className="form market-price-form" onSubmit={saveManualMarketPrice}>
                        <Field label="Catalog Item">
                          <select value={manualMarketForm.catalogItemId} onChange={(event) => setManualMarketForm((current) => ({ ...current, catalogItemId: event.target.value }))}>
                            <option value="">Choose item</option>
                            {catalogProducts.map((product) => (
                              <option key={product.id} value={product.id}>{catalogTitle(product)}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Market Price">
                          <input type="number" step="0.01" value={manualMarketForm.marketPrice} onChange={(event) => setManualMarketForm((current) => ({ ...current, marketPrice: event.target.value }))} placeholder="Manual market value" />
                        </Field>
                        <Field label="Low / Mid / High">
                          <div className="inline-input-grid">
                            <input type="number" step="0.01" value={manualMarketForm.lowPrice} onChange={(event) => setManualMarketForm((current) => ({ ...current, lowPrice: event.target.value }))} placeholder="Low" />
                            <input type="number" step="0.01" value={manualMarketForm.midPrice} onChange={(event) => setManualMarketForm((current) => ({ ...current, midPrice: event.target.value }))} placeholder="Mid" />
                            <input type="number" step="0.01" value={manualMarketForm.highPrice} onChange={(event) => setManualMarketForm((current) => ({ ...current, highPrice: event.target.value }))} placeholder="High" />
                          </div>
                        </Field>
                        <button type="submit">Save Manual Price</button>
                      </form>
                    </details>
                    <details className="scout-score-guidelines">
                      <summary>Market To-Do</summary>
                      {needsMarketCheckItems.length || missingMarketPriceItems.length || missingMsrpItems.length ? (
                        <>
                          <ActionReport title="Needs Market Check" items={needsMarketCheckItems} button="Update Market" action={startEditingItem} />
                          <ActionReport title="Missing Market Price" items={missingMarketPriceItems} button="Add Market Price" action={startEditingItem} />
                          <ActionReport title="Missing MSRP" items={missingMsrpItems} button="Add MSRP" action={startEditingItem} />
                        </>
                      ) : (
                        <div className="empty-state">
                          <h3>No items need review</h3>
                          <p>Market to-do items will appear here when catalog prices or MSRP fields need attention.</p>
                        </div>
                      )}
                    </details>
                    <div className="market-source-list">
                      {MARKET_SOURCES.map((source) => (
                        <div className="market-source-row" key={source.key}>
                          <strong>{source.label}</strong>
                          <span>{source.status}</span>
                          <p>{source.notes}</p>
                        </div>
                      ))}
                    </div>
                    <p className="compact-subtitle">Protected provider credentials are handled server-side. Some live source connectors may remain unavailable during private beta.</p>
                  </CollapsibleFeatureSection>
                  ) : null}
                </section>
              </>
            )}
          </>
        )}

        {false && activeTab === "market" && (
          <>
            {renderPageChrome({
              title: "TideTradr",
              subtitle: "Search catalog, check deals, watch markets, imports, and market sources.",
              primary: { label: "Check Deal", onClick: () => { setTideTradrSubTab("deal"); setFeatureSectionsOpen((current) => ({ ...current, market_deal_finder: true })); } },
              secondary: { label: "Search Catalog", onClick: () => setActiveTab("catalog") },
              quickActions: [
                { label: "Check Deal", onClick: () => { setTideTradrSubTab("deal"); setFeatureSectionsOpen((current) => ({ ...current, market_deal_finder: true })); } },
                { label: "Search Catalog", onClick: () => setActiveTab("catalog") },
              ],
              tabs: [
                { key: "overview", label: "Overview" },
                { key: "catalog", label: "Search" },
                { key: "deal", label: "Deal Finder" },
                { key: "listings", label: "Listings" },
                { key: "watch", label: "Market Watch" },
              ],
              activeSubTab: tideTradrSubTab,
              setActiveSubTab: setTideTradrSubTab,
            })}

            <section className="feature-dropdown-stack">
              {tideTradrSubTab === "overview" || tideTradrSubTab === "catalog" ? (
              <CollapsibleFeatureSection title="Search & Catalog" summary="Search products/cards with filters for card, sealed, set, type, year, and rarity" open={isFeatureSectionOpen("market_summary")} onToggle={() => toggleFeatureSection("market_summary")}>
                <div className="cards">
                  <div className="card"><p>Catalog Products</p><h2>{catalogProducts.length}</h2></div>
                  <div className="card"><p>Forge Market Value</p><h2>{money(totalMarketValue)}</h2></div>
                  <div className="card"><p>Missing Market Prices</p><h2>{missingMarketPriceItems.length}</h2></div>
                  <div className="card"><p>Needs Market Check</p><h2>{needsMarketCheckItems.length}</h2></div>
                </div>
                <div className="quick-actions">
                  <button type="button" onClick={() => setActiveTab("catalog")}>Search Catalog</button>
                  <button type="button" className="secondary-button" onClick={() => { setActiveTab("catalog"); setFeatureSectionsOpen((current) => ({ ...current, catalog_manual: true })); }}>Add Catalog Item</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("catalog")}>Filters</button>
                </div>
              </CollapsibleFeatureSection>
              ) : null}

              {tideTradrSubTab === "overview" || tideTradrSubTab === "watch" ? (
              <CollapsibleFeatureSection title="Market Watch" summary="Watchlist, pinned market items, recently updated values, and market updates" open={isFeatureSectionOpen("market_lookup")} onToggle={() => toggleFeatureSection("market_lookup")}>
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
                <p className="compact-subtitle">
                  Source: {tideTradrMarketInfo.sourceName} | Status: {MARKET_STATUS_LABELS[tideTradrMarketInfo.marketStatus] || "Unknown"} | Confidence: {tideTradrMarketInfo.confidenceLevel} | Last Updated: {tideTradrMarketInfo.lastUpdated}
                  {tideTradrMarketInfo.needsReview ? " | Needs Review" : ""}
                </p>
                <div className="quick-actions">
                  {tideTradrLookupProduct ? <button type="button" onClick={() => openProductAddFlow({ product: tideTradrLookupProduct, source: "tidetradr-preview-forge", destinations: { forge: true } })}>Add to Forge</button> : null}
                  {tideTradrLookupProduct ? <button type="button" className="secondary-button" onClick={() => openProductAddFlow({ product: tideTradrLookupProduct, source: "tidetradr-preview-vault", destinations: { vault: true } })}>Add to Vault</button> : null}
                  {tideTradrLookupProduct ? <button type="button" className="secondary-button" onClick={() => openProductAddFlow({
                    product: tideTradrLookupProduct,
                    source: "tidetradr-preview-wishlist",
                    destinations: { wishlist: true },
                    seed: { wishlist: { ...BLANK_MULTI_DESTINATION_FORM.wishlist, addToMarketWatch: true } },
                  })}>Add to Watchlist</button> : null}
                </div>
              </CollapsibleFeatureSection>
              ) : null}

              {tideTradrSubTab === "overview" || tideTradrSubTab === "deal" ? (
              <>
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
                <div className="quick-actions">
                  <button type="button" onClick={openDealFinderAddItem}>Add item from this deal</button>
                </div>
              </CollapsibleFeatureSection>

              <CollapsibleFeatureSection title="Pinned Market Watch" summary="Saved watchlist products and pinned market items" open={isFeatureSectionOpen("market_watchlist")} onToggle={() => toggleFeatureSection("market_watchlist")}>
                <div className="quick-actions">
                  <button type="button" onClick={refreshPinnedMarketWatch}>Refresh Pinned Market Watch</button>
                  <button type="button" className="secondary-button" onClick={refreshMarketWatchlist}>Refresh Watchlist</button>
                </div>
                {tideTradrWatchlist.length === 0 ? <p>No watched TideTradr products yet.</p> : null}
                <div className="inventory-list">
                  {tideTradrWatchlist.map((item) => (
                    <div className="inventory-card compact-card" key={item.id}>
                      <h3>{item.name}</h3>
                      <p>{item.setName || "No set"} | {item.productType || "No type"}</p>
                      <p>Market: {money(item.marketValue)} | MSRP: {money(item.msrp)}</p>
                      {Number(item.previousMarketValue || 0) > 0 ? <p>Change: {money(Number(item.marketValue || 0) - Number(item.previousMarketValue || 0))}</p> : null}
                      <p>Source: {item.sourceName}</p>
                      <p>Status: {MARKET_STATUS_LABELS[item.marketStatus] || "Unknown"} | Confidence: {item.confidenceLabel || "Beta"}{item.needsReview ? " | Needs Review" : ""}</p>
                      <p>Last Updated: {item.lastUpdated}</p>
                      <div className="quick-actions">
                        <button type="button" onClick={() => useCatalogProductInDeal(item.productId)}>Check Deal</button>
                        <button type="button" className="secondary-button" onClick={() => removeTideTradrWatchlistItem(item.id)}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleFeatureSection>
              </>
              ) : null}

              {false && tideTradrSubTab === "catalog" ? (
              <>
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
              </>
              ) : null}

              {adminToolsVisible && (tideTradrSubTab === "overview" || tideTradrSubTab === "watch") ? (
              <CollapsibleFeatureSection title="Market Sources" summary="Manual Values, Cached Values, Estimated Values, and Live API Setup" open={isFeatureSectionOpen("market_sources")} onToggle={() => toggleFeatureSection("market_sources")}>
                <div className="cards mini-cards">
                  <div className="card"><p>Cached Price Records</p><h2>{cachedMarketPriceCount}</h2></div>
                  <div className="card"><p>Failed Matches</p><h2>{failedMarketMatches.length}</h2></div>
                  <div className="card"><p>Last Sync</p><h2>{lastMarketSync === "Not synced yet" ? "None" : new Date(lastMarketSync).toLocaleDateString()}</h2></div>
                  <div className="card"><p>Live API</p><h2>Not connected</h2></div>
                </div>
                <p className="compact-subtitle">Market values are labeled Live, Cached, Manual, Estimated, or Unknown. Beta sync uses local/import-ready data unless a backend source is connected.</p>
                {marketSyncMessage ? <p className="compact-subtitle">{marketSyncMessage}</p> : null}
                <div className="quick-actions">
                  <button type="button" onClick={() => refreshMarketCatalog("card")}>Sync Cards</button>
                  <button type="button" className="secondary-button" onClick={() => refreshMarketCatalog("sealed")}>Sync Sealed Products</button>
                  <button type="button" className="secondary-button" onClick={refreshMarketWatchlist}>Refresh Watchlist</button>
                  <button type="button" className="secondary-button" onClick={refreshPinnedMarketWatch}>Refresh Pinned Market Watch</button>
                </div>
                <form className="form market-price-form" onSubmit={saveManualMarketPrice}>
                  <h3>Manual Price Entry</h3>
                  <Field label="Catalog Item">
                    <select value={manualMarketForm.catalogItemId} onChange={(event) => setManualMarketForm((current) => ({ ...current, catalogItemId: event.target.value }))}>
                      <option value="">Choose item</option>
                      {catalogProducts.map((product) => (
                        <option key={product.id} value={product.id}>{catalogTitle(product)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Market Price">
                    <input type="number" step="0.01" value={manualMarketForm.marketPrice} onChange={(event) => setManualMarketForm((current) => ({ ...current, marketPrice: event.target.value }))} placeholder="Manual market value" />
                  </Field>
                  <Field label="Low / Mid / High">
                    <div className="inline-input-grid">
                      <input type="number" step="0.01" value={manualMarketForm.lowPrice} onChange={(event) => setManualMarketForm((current) => ({ ...current, lowPrice: event.target.value }))} placeholder="Low" />
                      <input type="number" step="0.01" value={manualMarketForm.midPrice} onChange={(event) => setManualMarketForm((current) => ({ ...current, midPrice: event.target.value }))} placeholder="Mid" />
                      <input type="number" step="0.01" value={manualMarketForm.highPrice} onChange={(event) => setManualMarketForm((current) => ({ ...current, highPrice: event.target.value }))} placeholder="High" />
                    </div>
                  </Field>
                  <Field label="External Source / ID">
                    <div className="inline-input-grid">
                      <select value={manualMarketForm.externalSource} onChange={(event) => setManualMarketForm((current) => ({ ...current, externalSource: event.target.value }))}>
                        {MARKET_SOURCES.map((source) => <option key={source.key} value={source.label}>{source.label}</option>)}
                      </select>
                      <input value={manualMarketForm.externalId} onChange={(event) => setManualMarketForm((current) => ({ ...current, externalId: event.target.value }))} placeholder="External ID optional" />
                    </div>
                  </Field>
                  <Field label="Source URL">
                    <input value={manualMarketForm.sourceUrl} onChange={(event) => setManualMarketForm((current) => ({ ...current, sourceUrl: event.target.value }))} placeholder="Optional source link" />
                  </Field>
                  <button type="submit">Save Manual Price</button>
                </form>
                <div className="market-source-list">
                  {MARKET_SOURCES.map((source) => (
                    <div className="market-source-row" key={source.key}>
                      <strong>{source.label}</strong>
                      <span>{source.status}</span>
                      <p>{source.notes}</p>
                    </div>
                  ))}
                </div>
                {failedMarketMatches.length > 0 ? (
                  <div className="market-source-list">
                    <h3>Needs Market Match</h3>
                    {failedMarketMatches.slice(0, 8).map((match) => (
                      <div className="market-source-row" key={`${match.catalogItemId}-${match.reason}`}>
                        <strong>{match.name || match.catalogItemId}</strong>
                        <span>Needs Review</span>
                        <p>{match.reason}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                <p className="compact-subtitle">Protected provider credentials are handled server-side. Some live source connectors may remain unavailable during private beta.</p>
              </CollapsibleFeatureSection>
              ) : null}

              {tideTradrSubTab === "overview" || tideTradrSubTab === "listings" ? (
              <CollapsibleFeatureSection title="Market To-Do List" summary="Items missing market values, MSRP, or checks" open={isFeatureSectionOpen("market_todo")} onToggle={() => toggleFeatureSection("market_todo")}>
                <ActionReport title="Needs Market Check" items={needsMarketCheckItems} button="Update Market" action={startEditingItem} />
                <ActionReport title="Missing Market Price" items={missingMarketPriceItems} button="Add Market Price" action={startEditingItem} />
                <ActionReport title="Missing MSRP" items={missingMsrpItems} button="Add MSRP" action={startEditingItem} />
              </CollapsibleFeatureSection>
              ) : null}
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
                Market values are labeled Live, Cached, Manual, or Estimated. Estimated values stay labeled until live or cached sources are connected.
              </p>
              <div className="cards mini-cards">
                <div className="card"><p>Sealed Products</p><h2>{sealedCatalogCount}</h2></div>
                <div className="card"><p>Individual Cards</p><h2>{cardCatalogCount}</h2></div>
                <div className="card"><p>Watchlist</p><h2>{tideTradrWatchlist.length}</h2></div>
              </div>
            </section>
            {adminUser ? (
            <section className="panel">
              <h2>Catalog Admin / Data Tools</h2>
              <p className="compact-subtitle">Beta/dev structure for future imports from Pokemon TCG API/Scrydex, TCGdex, TCGCSV, official Pokemon product data, and manual CSVs. No live keys are required.</p>
              <div className="cards mini-cards">
                <div className="card"><p>Set Records</p><h2>{POKEMON_SETS.length}</h2></div>
                <div className="card"><p>Catalog Rows</p><h2>{POKEMON_PRODUCTS.length}</h2></div>
                <div className="card"><p>Imported Cards</p><h2>{CATALOG_IMPORT_STATUS.cardsImported || 0}</h2></div>
                <div className="card"><p>Imported Sealed</p><h2>{CATALOG_IMPORT_STATUS.sealedProductsImported || 0}</h2></div>
                <div className="card"><p>UPC/SKU Links</p><h2>{catalogUpcCount}</h2></div>
                <div className="card"><p>Market Price Rows</p><h2>{catalogMarketPriceCount}</h2></div>
                <div className="card"><p>Duplicate Warnings</p><h2>{catalogDuplicateWarnings.length}</h2></div>
                <div className="card"><p>Validation Warnings</p><h2>{catalogValidationWarnings.length}</h2></div>
              </div>
              <p className="compact-subtitle">
                Last catalog import: {CATALOG_IMPORT_STATUS.lastImportedAt ? new Date(CATALOG_IMPORT_STATUS.lastImportedAt).toLocaleString() : "No generated import yet"}.
                Source: {CATALOG_IMPORT_STATUS.source || "local catalog"}.
              </p>
              <div className="quick-action-rail">
                {CATALOG_IMPORT_SOURCES.map((source) => (
                  <button type="button" className="secondary-button" key={source} disabled>{source}</button>
                ))}
              </div>
              <p className="compact-subtitle">Provider import buttons stay disabled until approved API/CSV sources are connected. CSV/manual catalog import remains available below.</p>
            </section>
            ) : (
            <section className="panel">
              <h2>Catalog Status</h2>
              <p className="compact-subtitle">Catalog import and data-control tools are admin-only. Search and add-to-Vault/Forge stay available based on tier access.</p>
              <div className="cards mini-cards">
                <div className="card"><p>Set Records</p><h2>{POKEMON_SETS.length}</h2></div>
                <div className="card"><p>Catalog Rows</p><h2>{catalogProducts.length}</h2></div>
              </div>
            </section>
            )}
          <CollapsibleFeatureSection title={adminUser ? "Manual Catalog Item" : "Catalog Suggestions"} summary={adminUser ? "Add or edit missing sealed products and individual cards locally" : "Suggest missing products, UPC/SKU links, and corrections for admin review"} open={isFeatureSectionOpen("catalog_manual")} onToggle={() => toggleFeatureSection("catalog_manual")}>
          {adminUser ? (
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
          </>
          ) : (
            <div className="small-empty-state">
              <strong>Suggestions only for beta users.</strong>
              <span>Catalog changes are universal data. Submit missing products or corrections below so an admin can review them.</span>
            </div>
          )}
            <section className="panel">
              <h2>{adminUser ? (editingCatalogId ? "Edit Catalog Product" : "Add Product Catalog Item") : (editingCatalogId ? "Suggest Product Correction" : "Suggest Missing Product")}</h2>
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
                <Field label="Upload Photo"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => {
                  updateCatalogForm("imageUrl", url);
                  updateCatalogForm("imageSource", "user");
                  updateCatalogForm("imageStatus", "user");
                  updateCatalogForm("imageLastUpdated", new Date().toISOString());
                  updateCatalogForm("imageNeedsReview", false);
                }, "catalog-products")} /></Field>
                <Field label="Manual Image URL"><input value={catalogForm.imageUrl} onChange={(e) => {
                  updateCatalogForm("imageUrl", e.target.value);
                  updateCatalogForm("imageSource", e.target.value ? "manual" : "placeholder");
                  updateCatalogForm("imageStatus", e.target.value ? "manual" : "placeholder");
                  updateCatalogForm("imageLastUpdated", e.target.value ? new Date().toISOString() : "");
                }} placeholder="Paste image URL" /></Field>
                <Field label="Image Source"><select value={catalogForm.imageSource} onChange={(e) => updateCatalogForm("imageSource", e.target.value)}>
                  <option value="pokemon_tcg_api">Pokemon TCG API</option>
                  <option value="tcgdex">TCGdex</option>
                  <option value="best_buy">Best Buy</option>
                  <option value="ebay">Marketplace / eBay</option>
                  <option value="tcgcsv">TCGCSV</option>
                  <option value="user">User uploaded</option>
                  <option value="manual">Manual URL</option>
                  <option value="estimated">Estimated</option>
                  {adminToolsVisible ? <option value="mock">Estimated fallback</option> : null}
                  <option value="placeholder">Placeholder</option>
                  <option value="unknown">Unknown</option>
                </select></Field>
                <Field label="Image Status"><select value={catalogForm.imageStatus} onChange={(e) => updateCatalogForm("imageStatus", e.target.value)}>
                  <option value="official">Official/API</option>
                  <option value="api">API</option>
                  <option value="retailer">Retailer</option>
                  <option value="marketplace">Marketplace</option>
                  <option value="user">User</option>
                  <option value="manual">Manual</option>
                  <option value="estimated">Estimated</option>
                  {adminToolsVisible ? <option value="mock">Estimated fallback</option> : null}
                  <option value="placeholder">Placeholder</option>
                  <option value="unknown">Unknown</option>
                </select></Field>
                <Field label="Image Source URL"><input value={catalogForm.imageSourceUrl} onChange={(e) => updateCatalogForm("imageSourceUrl", e.target.value)} placeholder="Source or product page URL" /></Field>
                <label className="toggle-row">
                  <input type="checkbox" checked={Boolean(catalogForm.imageNeedsReview)} onChange={(e) => updateCatalogForm("imageNeedsReview", e.target.checked)} />
                  Image needs review
                </label>
                {catalogForm.imageUrl ? (
                  <div className="receipt-preview">
                    <p>Catalog Photo • {getImageSourceLabel(catalogForm)}</p>
                    <img src={catalogForm.imageUrl} alt="Catalog" />
                    <button type="button" className="secondary-button" onClick={() => {
                      updateCatalogForm("imageUrl", "");
                      updateCatalogForm("imageSmall", "");
                      updateCatalogForm("imageLarge", "");
                      updateCatalogForm("imageSource", "placeholder");
                      updateCatalogForm("imageStatus", "placeholder");
                      updateCatalogForm("imageNeedsReview", false);
                    }}>Remove Image</button>
                  </div>
                ) : null}
                <Field label="TideTradr Product ID"><input value={catalogForm.externalProductId} onChange={(e) => updateCatalogForm("externalProductId", e.target.value)} /></Field>
                <Field label="Market Source URL"><input value={catalogForm.marketUrl} onChange={(e) => updateCatalogForm("marketUrl", e.target.value)} /></Field>
                <Field label="Market Data Label"><select value={catalogForm.sourceType} onChange={(e) => updateCatalogForm("sourceType", e.target.value)}><option value="manual">Manual</option><option value="estimated">Estimated</option>{adminToolsVisible ? <option value="mock">Mock</option> : null}<option value="cached">Cached</option><option value="live">Live</option></select></Field>
                <Field label="Market Source Name"><input value={catalogForm.marketSource} onChange={(e) => updateCatalogForm("marketSource", e.target.value)} placeholder="Manual, Estimated, TCGPlayer, PriceCharting..." /></Field>
                <Field label="Confidence"><input value={catalogForm.marketConfidenceLevel} onChange={(e) => updateCatalogForm("marketConfidenceLevel", e.target.value)} placeholder="Manual, Estimated, Low, Medium, High" /></Field>
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
                <button type="submit">{adminUser ? (editingCatalogId ? "Save Catalog Product" : "Add Catalog Product") : "Submit for Review"}</button>
                {editingCatalogId && <button type="button" className="secondary-button" onClick={() => { setEditingCatalogId(null); setCatalogForm(blankCatalog); }}>Cancel Edit</button>}
              </form>
            </section>
          </CollapsibleFeatureSection>
            <section className="panel">
              <h2>Product Catalog</h2>
              <input className="search-input" value={catalogSearch} onChange={(e) => updateCatalogSearchInput(e.target.value)} placeholder="Search products, cards, Pokemon, set, UPC, SKU, rarity..." />
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
                <Field label="Price History">
                  <select value={catalogHistoryFilter} onChange={(e) => setCatalogHistoryFilter(e.target.value)}>
                    <option>All</option>
                    <option>Has price history</option>
                    <option>Missing price history</option>
                    <option>Price changed recently</option>
                    <option>High volatility</option>
                    <option>Low volatility</option>
                  </select>
                </Field>
                <Field label="Min Market Value">
                  <input type="number" step="0.01" value={catalogMinValue} onChange={(e) => setCatalogMinValue(e.target.value)} />
                </Field>
                <Field label="Max Market Value">
                  <input type="number" step="0.01" value={catalogMaxValue} onChange={(e) => setCatalogMaxValue(e.target.value)} />
                </Field>
              </div>
              <p>
                {catalogSearchHasRun
                  ? `Showing ${filteredCatalogProducts.length} paged search results.`
                  : "Search from TideTradr first before browsing imported catalog rows."}
              </p>
              <Field label="Sort Catalog">
                <select
                  value={catalogSort}
                  onChange={(e) => setCatalogSort(e.target.value)}
                >
                  {CATALOG_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
              <div className="catalog-results-list">
                {(catalogSearchHasRun ? filteredCatalogProducts : []).map((p) => (
                  <div className="catalog-result-card" key={p.id}>
                    <button type="button" className="catalog-result-main" onClick={() => openCatalogDetails(p.id)}>
                      <div className="catalog-thumb">
                        {catalogImage(p) ? (
                          <>
                            <img
                              src={catalogImage(p)}
                              alt=""
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                                event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                              }}
                            />
                            <span className="image-needed-placeholder" hidden>
                              <strong>{p.catalogType === "card" ? "Card" : "Sealed"}</strong>
                              <small>Image needed</small>
                            </span>
                          </>
                        ) : (
                          <span className="image-needed-placeholder">
                            <strong>{p.catalogType === "card" ? "Card" : "Sealed"}</strong>
                            <small>Image needed</small>
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="catalog-pill">{p.catalogType === "card" ? "Card" : "Sealed"}</span>
                        <h3>{catalogTitle(p)}</h3>
                        {renderCatalogMeta(p)}
                        <p className="image-source-line">
                          Image: {getImageSourceLabel(p)}
                          {p.imageNeedsReview ? " • Needs review" : ""}
                        </p>
                        <p className="compact-subtitle">Source: {p.marketSource || p.sourceType || "Unknown"}{p.priceSubtype ? ` | ${p.priceSubtype}` : ""}</p>
                        {p.historySnapshotCount > 0 ? (
                          <p className="compact-subtitle">History available: {p.historySnapshotCount} snapshot{p.historySnapshotCount === 1 ? "" : "s"}</p>
                        ) : null}
                      </div>
                    </button>
                  </div>
                ))}
                {!catalogSearchHasRun ? (
                  <div className="empty-state">
                    <h3>Search first</h3>
                    <p>Imported catalog rows are not listed by default. Use TideTradr Search & Catalog to search by name, set, card number, product ID, or barcode.</p>
                  </div>
                ) : null}
              </div>
            </section>
          </>
        )}

        {["addInventory", "inventory", "addSale", "sales", "expenses", "mileage", "reports"].includes(activeTab) ? renderForgeHeader() : null}

        {activeTab === "addInventory" && (
  <section className="panel forge-add-inventory-panel">
    <div className="compact-card-header forge-form-page-header">
      <div>
        <h2>Add Forge Inventory</h2>
        <p>Build a sellable inventory record from catalog data, scan review, or manual entry.</p>
      </div>
      <button type="button" className="secondary-button" onClick={() => beginScanProduct("forge")}>
        Scan Product
      </button>
    </div>

    <details className="forge-form-step forge-optional-details">
      <summary>Quick TideTradr catalog picker</summary>
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
    </details>

    {false && showInventoryScanner && (
      <section className="panel">
        <h3>Scan to Add</h3>
        <p className="compact-subtitle">Choose what you are scanning. Beta uses UPC/card number/manual matching against the local TideTradr catalog.</p>
        <div className="quick-action-rail">
          {[
            ["upc", "Scan UPC / barcode"],
            ["card", "Scan card"],
            ["receipt", "Receipt/screenshot"],
            ["manual", "Manual lookup"],
          ].map(([key, label]) => (
            <button key={key} type="button" className={scanMode === key ? "primary" : ""} onClick={() => setScanMode(key)}>
              {label}
            </button>
          ))}
        </div>
        {scanMode === "receipt" ? (
          <p className="compact-subtitle">Receipt and screenshot OCR is coming soon. For beta, paste the item list or use manual lookup/import.</p>
        ) : scanMode === "manual" || scanMode === "card" ? (
          <div className="form">
            <Field label={scanMode === "card" ? "Card name, card number, or set code" : "Product name, UPC, SKU, shorthand, or set code"}>
              <input
                value={itemForm.barcode}
                onChange={(event) => {
                  updateItemForm("barcode", event.target.value);
                  setScanMatches(getBestCatalogMatches(event.target.value, catalogProducts));
                }}
                placeholder={scanMode === "card" ? "Try 199/165, zard sir, sv8 card 159" : "Try pri etb, 151 bundle, UPC/SKU"}
              />
            </Field>
          </div>
        ) : (
          <BarcodeScanner
            onScan={handleCatalogScanMatch}
            onClose={() => setShowInventoryScanner(false)}
          />
        )}
        {scanMatches.length > 0 ? (
          <div className="inventory-list">
            {scanMatches.slice(0, 5).map((match) => (
              <div className="inventory-card compact-card" key={match.item.id}>
                <h3>{match.item.name || match.item.productName || match.item.cardName}</h3>
                <p>{match.item.setName || match.item.expansion || "No set"} | {match.item.productType || match.item.rarity || "Catalog item"}</p>
                <p>{match.explanation || explainCatalogMatch(match)} | Confidence: {match.confidencePercent}%</p>
                <div className="quick-actions">
                  <button type="button" onClick={() => confirmScanMatch(match.item.id)}>Confirm Match</button>
                  <button type="button" className="secondary-button" onClick={() => applyCatalogProductToVault(match.item.id)}>Add to Vault</button>
                  <button type="button" className="secondary-button" onClick={() => useCatalogProductInDeal(match.item.id)}>Check Deal</button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
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
          forgeSubTab === "marketplace" ? (
            <>
              <PageHeader
                className={getHeaderCardClass("panel marketplace-page-heading")}
                title="Forge > Marketplace"
                subtitle="Create listings from Forge inventory, Vault items, TideTradr catalog products, or manual entry."
                actions={(
                  <button type="button" className="secondary-button" onClick={() => {
                    setMarketplaceView("browse");
                    setForgeSubTab("overview");
                  }}>Back to Forge</button>
                )}
              />
              {renderMarketplaceSection()}
            </>
          ) : (
          <>
          <section id="forge-inventory-section" className="panel forge-home-inventory-section">
            <div className="forge-toolbar">
              <div>
                <h2>The Forge Inventory</h2>
                <p>Search and manage business inventory. Full product details stay inside item detail.</p>
              </div>
              <div className="summary-pill-row">
                <button type="button" onClick={() => openProductAddFlow({ source: "forge-toolbar-inventory", destinations: { forge: true } })}>Add Inventory</button>
                <button type="button" className="secondary-button" onClick={() => setActiveTab("catalog")}>Import from TideTradr</button>
              </div>
            </div>
            {importAssistantContext === "Forge" ? renderInventoryImportAssistant() : null}
            <input className="search-input" value={inventorySearch} onChange={(e) => setInventorySearch(e.target.value)} placeholder="Search Forge inventory..." />
            <details className="forge-purchaser-totals">
              <summary>Purchaser Totals</summary>
            <div className="buyer-grid">
              {monthlyPurchaserSpending.slice(0, 4).map((row) => (
                <div className="buyer-card" key={row.name}>
                  <p>{row.name}</p>
                  <h3>{money(row.amount)}</h3>
                  <small>This month · Total {money(row.total)}</small>
                </div>
              ))}
            </div>
            </details>
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

            <details className="forge-more-filters">
              <summary>More Filters</summary>
              <div className="chip-row compact-chip-row">
                {advancedInventoryFilters.map((filter) => (
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
              <div className="filter-grid forge-filter-grid">
                <Field label="Purchaser">
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
              </div>
            </details>

            <div className="filter-summary">
              <p>Current filter: {inventoryStatusFilter}</p>
              <p>Purchaser: {inventoryPurchaserFilter === "All" ? "All" : purchasers.find((purchaser) => purchaser.id === inventoryPurchaserFilter)?.name || inventoryPurchaserFilter}</p>

              <p>
              Showing {pagedForgeInventory.start || 0}-{pagedForgeInventory.end || 0} of {sortedFilteredItems.length} filtered inventory records
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
            {selectedForgeDetailId ? (
              <ForgeItemDetail
                item={forgeInventoryItems.find((item) => item.id === selectedForgeDetailId)}
                onClose={() => setSelectedForgeDetailId("")}
                onEdit={startEditingItem}
                onDelete={(item) => { deleteItem(item.id); setSelectedForgeDetailId(""); }}
                onCreateListing={(item) => openMarketplaceCreate("forge", item)}
                onSell={(item) => {
                  setSaleForm((current) => ({
                    ...current,
                    itemId: item.id,
                    quantitySold: 1,
                    finalSalePrice: item.salePrice || item.marketPrice || "",
                  }));
                  openAddSaleFlow({ preserveForm: true, source: "inventory" });
                }}
              />
            ) : null}
            <div className="inventory-list compact-inventory-list">
              {sortedFilteredItems.length === 0 ? (
                <div className="inventory-card compact-card">
                  <h3>No Forge items found</h3>
                  <p>Add inventory, import a receipt/list, or select a TideTradr catalog item to start tracking seller inventory.</p>
                  <button type="button" className="edit-button" onClick={() => openProductAddFlow({ source: "forge-empty-inventory", destinations: { forge: true } })}>
                    Add Forge Item
                  </button>
                </div>
              ) : pagedForgeInventory.items.map((item) => (
                <CompactInventoryCard
                  key={item.id}
                  item={item}
                  onRestock={prepareRestock}
                  onViewDetails={(forgeItem) => setSelectedForgeDetailId(forgeItem.id)}
                  onEdit={startEditingItem}
                  onDelete={deleteItem}
                  onStatusChange={updateItemStatus}
                  onCreateListing={(forgeItem) => openMarketplaceCreate("forge", forgeItem)}
                  onSell={(forgeItem) => {
                    setSaleForm((current) => ({
                      ...current,
                      itemId: forgeItem.id,
                      quantitySold: 1,
                      finalSalePrice: forgeItem.salePrice || forgeItem.marketPrice || "",
                    }));
                    openAddSaleFlow({ preserveForm: true, source: "inventory" });
                  }}
                />
              ))}
            </div>
            <PaginationControls
              label="Inventory Records"
              page={pagedForgeInventory.page}
              pageCount={pagedForgeInventory.pageCount}
              totalCount={pagedForgeInventory.total}
              pageSize={LONG_LIST_PAGE_SIZE}
              onPageChange={(page) => {
                setForgeInventoryPage(page);
                scrollToResultsTop();
              }}
              compact
            />
          </section>
          </>
          )
        )}

        {activeTab === "addSale" && (
          <section className="panel forge-add-sale-panel">
            <div className="compact-card-header">
              <div>
                <h2>{editingSaleId ? "Edit Sale" : "Add Sale"}</h2>
                <p>Choose inventory, record sale details, and preview profit before saving.</p>
              </div>
            </div>
            <form onSubmit={addSale} className="form forge-sale-form">
              <div className="forge-sale-fields-grid">
              <Field label="Item Sold">
                <select value={saleForm.itemId} onChange={(e) => updateSaleForm("itemId", e.target.value)}>
                  <option value="">Choose item</option>
                  {forgeInventoryItems.filter((i) => i.quantity > 0).map((i) => <option key={i.id} value={i.id}>{i.name} — Qty {i.quantity} — {i.sku}</option>)}
                </select>
              </Field>
              {selectedSaleItem ? (
                <div className="forge-sale-product-summary">
                  {selectedSaleItem.itemImage ? <img src={selectedSaleItem.itemImage} alt="" /> : <span>Item</span>}
                  <div>
                    <strong>{selectedSaleItem.name}</strong>
                    <small>Qty owned: {selectedSaleItem.quantity} | Cost basis: {money(saleCostBasis)}</small>
                    <small>Market: {money(selectedSaleItem.marketPrice)} | Planned: {money(selectedSaleItem.salePrice)}</small>
                  </div>
                </div>
              ) : (
                <div className="small-empty-state forge-sale-helper">
                  <strong>Choose an inventory item to calculate cost basis and profit.</strong>
                </div>
              )}
              <Field label="Platform"><select value={saleForm.platform} onChange={(e) => updateSaleForm("platform", e.target.value)}>{PLATFORMS.map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Quantity Sold"><input type="number" min="1" value={saleForm.quantitySold} onChange={(e) => updateSaleForm("quantitySold", e.target.value)} /></Field>
              <Field label="Sale Price Each"><input type="number" step="0.01" value={saleForm.finalSalePrice} onChange={(e) => updateSaleForm("finalSalePrice", e.target.value)} /></Field>
              <Field label="Shipping Charged"><input type="number" step="0.01" value={saleForm.shippingCharged} onChange={(e) => updateSaleForm("shippingCharged", e.target.value)} /></Field>
              <Field label="Shipping Cost"><input type="number" step="0.01" value={saleForm.shippingCost} onChange={(e) => updateSaleForm("shippingCost", e.target.value)} /></Field>
              <Field label="Fees"><input type="number" step="0.01" value={saleForm.platformFees} onChange={(e) => updateSaleForm("platformFees", e.target.value)} /></Field>
              <Field label="Notes"><input value={saleForm.notes} onChange={(e) => updateSaleForm("notes", e.target.value)} /></Field>
              </div>
              <div className="profit-preview forge-profit-preview">
                <h3>Estimated Profit</h3>
                <div className="preview-grid">
                  <div><span>Gross Sale</span><strong>{money(saleGrossPreview)}</strong></div>
                  <div><span>Cost Basis</span><strong>{money(saleCostBasis)}</strong></div>
                  <div><span>Shipping + Fees</span><strong>{money(saleShippingCost + saleFees)}</strong></div>
                  <div><span>Net Profit</span><strong>{money(saleProfitPreview)}</strong></div>
                </div>
              </div>
              <div className="forge-form-footer">
                <button type="submit">{editingSaleId ? "Save Sale" : "Add Sale"}</button>
                {editingSaleId && <button type="button" className="secondary-button" onClick={() => { setEditingSaleId(null); setSaleForm({ itemId: "", platform: "eBay", quantitySold: 1, finalSalePrice: "", shippingCharged: "", shippingCost: "", platformFees: "", notes: "" }); }}>Cancel Edit</button>}
              </div>
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
                  onEdit={() => startEditingSale(sale)}
                  onDelete={() => deleteSale(sale.id)}
                />
              </div>
            ))}
          </ListPanel>
        )}

        {!activeTabLocked && activeTab === "expenses" && (
          <>
            <section className="panel">
              <div className="compact-card-header">
                <div>
                  <h2>Business Expenses</h2>
                  <p>Review expenses here. Add or edit expense records in a focused popout.</p>
                </div>
                <button type="button" onClick={() => openAddExpenseFlow()}>Add Expense</button>
              </div>
            </section>
            {false && (
            <section className="panel">
              <h2>{editingExpenseId ? "Edit Expense" : "Add Business Expense"}</h2>
              <form onSubmit={addExpense} className="form">
                <Field label="Date"><input type="date" value={expenseForm.date} onChange={(e) => updateExpenseForm("date", e.target.value)} /></Field>
                <Field label="Vendor / Store"><input value={expenseForm.vendor} onChange={(e) => updateExpenseForm("vendor", e.target.value)} /></Field>
                <Field label="Expense Category"><select value={expenseForm.category} onChange={(e) => updateExpenseForm("category", e.target.value)}>{EXPENSE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></Field>
                <Field label="Subcategory"><input value={expenseForm.subcategory} placeholder="Facebook ads, flyers, labels, domain..." onChange={(e) => updateExpenseForm("subcategory", e.target.value)} /></Field>
                <Field label="Who Paid?"><select value={expenseForm.buyer} onChange={(e) => updateExpenseForm("buyer", e.target.value)}>{peopleOptions.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Amount"><input type="number" step="0.01" value={expenseForm.amount} onChange={(e) => updateExpenseForm("amount", e.target.value)} /></Field>
                <Field label="Payment Method"><input value={expenseForm.paymentMethod} placeholder="Card, cash, PayPal, business account..." onChange={(e) => updateExpenseForm("paymentMethod", e.target.value)} /></Field>
                <Field label="Linked Forge Item"><select value={expenseForm.linkedItemId} onChange={(e) => updateExpenseForm("linkedItemId", e.target.value)}><option value="">None</option>{forgeInventoryItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="Linked Sale"><select value={expenseForm.linkedSaleId} onChange={(e) => updateExpenseForm("linkedSaleId", e.target.value)}><option value="">None</option>{sales.map((sale) => <option key={sale.id} value={sale.id}>{sale.itemName} - {sale.platform}</option>)}</select></Field>
                {expenseForm.category === "Marketing" && (
                  <>
                    <Field label="Campaign Name"><input value={expenseForm.campaignName} placeholder="Spring restock ads, giveaway push..." onChange={(e) => updateExpenseForm("campaignName", e.target.value)} /></Field>
                    <Field label="Marketing Platform"><select value={expenseForm.platform} onChange={(e) => updateExpenseForm("platform", e.target.value)}><option value="">Select platform</option>{MARKETING_PLATFORMS.map((platform) => <option key={platform}>{platform}</option>)}</select></Field>
                    <Field label="Goal"><select value={expenseForm.goal} onChange={(e) => updateExpenseForm("goal", e.target.value)}><option value="">Select goal</option>{MARKETING_GOALS.map((goal) => <option key={goal} value={goal}>{goal}</option>)}</select></Field>
                    <Field label="Campaign Start"><input type="date" value={expenseForm.startDate} onChange={(e) => updateExpenseForm("startDate", e.target.value)} /></Field>
                    <Field label="Campaign End"><input type="date" value={expenseForm.endDate} onChange={(e) => updateExpenseForm("endDate", e.target.value)} /></Field>
                    <Field label="Linked Sales / Results"><input value={expenseForm.linkedSales} placeholder="Sale IDs, totals, or notes for later ROI tracking" onChange={(e) => updateExpenseForm("linkedSales", e.target.value)} /></Field>
                    <Field label="Results Notes"><input value={expenseForm.resultsNotes} placeholder="Clicks, messages, followers, sales lift..." onChange={(e) => updateExpenseForm("resultsNotes", e.target.value)} /></Field>
                  </>
                )}
                <Field label="Notes"><input value={expenseForm.notes} onChange={(e) => updateExpenseForm("notes", e.target.value)} /></Field>
                <label className="toggle-row">
                  <span>Tax deductible</span>
                  <input type="checkbox" checked={!!expenseForm.taxDeductible} onChange={(e) => updateExpenseForm("taxDeductible", e.target.checked)} />
                </label>
                <Field label="Receipt / Screenshot"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => updateExpenseForm("receiptImage", url), "expenses")} /></Field>
                {expenseForm.receiptImage && <div className="receipt-preview"><p>Receipt</p><img src={expenseForm.receiptImage} alt="Receipt" /></div>}
                <button type="submit">{editingExpenseId ? "Save Expense" : "Add Expense"}</button>
                {editingExpenseId && <button type="button" className="secondary-button" onClick={() => { setEditingExpenseId(null); setExpenseForm(blankExpense); }}>Cancel Edit</button>}
              </form>
            </section>
            )}
            <ListPanel title="Business Expenses" emptyText="No expenses added yet.">
              {expenses.map((expense) => (
                <div className="inventory-card" key={expense.id}>
                  <h3>{expense.vendor}</h3>
                  {expense.date && <p>Date: {expense.date}</p>}
                  <p>Category: {expense.category}</p>
                  {expense.subcategory && <p>Subcategory: {expense.subcategory}</p>}
                  <p>Paid By: {expense.buyer}</p>
                  <p>Amount: {money(expense.amount)}</p>
                  {expense.paymentMethod && <p>Payment: {expense.paymentMethod}</p>}
                  {expense.taxDeductible && <p>Tax Deductible: Yes</p>}
                  {expense.category === "Marketing" && (
                    <>
                      {expense.campaignName && <p>Campaign: {expense.campaignName}</p>}
                      {expense.platform && <p>Platform: {expense.platform}</p>}
                      {expense.goal && <p>Goal: {expense.goal}</p>}
                      {(expense.startDate || expense.endDate) && <p>Campaign Dates: {expense.startDate || "?"} to {expense.endDate || "?"}</p>}
                      {expense.resultsNotes && <p>Results: {expense.resultsNotes}</p>}
                    </>
                  )}
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
              <div className="compact-card-header">
                <div>
                  <h2>Mileage Trips</h2>
                  <p>Review business miles here. Add or edit mileage records in a focused popout.</p>
                </div>
                <button type="button" onClick={() => openAddMileageFlow()}>Add Mileage</button>
              </div>
            </section>
            {false && (
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
            )}
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
                  <h2>{forgeInventoryItems.reduce((s, i) => s + i.quantity, 0)}</h2>
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
                  <p>Total Expenses</p>
                  <h2>{money(totalExpenses)}</h2>
                </div>

                <div className="card">
                  <p>Marketing Spend</p>
                  <h2>{money(totalMarketingSpend)}</h2>
                </div>

                <div className="card">
                  <p>After Marketing</p>
                  <h2>{money(estimatedProfitAfterMarketing)}</h2>
                </div>

                <div className="card">
                  <p>After All Expenses</p>
                  <h2>{money(estimatedProfitAfterExpenses)}</h2>
                </div>

                <div className="card">
                  <p>Monthly Marketing</p>
                  <h2>{money(monthlyMarketingSpend)}</h2>
                </div>

                <div className="card">
                  <p>Marketing ROI</p>
                  <h2>Unavailable</h2>
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
                <section className="panel">
                  <h2>Marketing Summary</h2>
                  <p>All-time Marketing Spend: {money(totalMarketingSpend)}</p>
                  <p>Monthly Marketing Spend: {money(monthlyMarketingSpend)}</p>
                  <p>Profit After Marketing: {money(estimatedProfitAfterMarketing)}</p>
                  <p>Marketing ROI: Unavailable until linked sales are connected.</p>
                </section>
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

        {selectedCatalogDetailProduct ? (
          <>
            <div className="drawer-backdrop catalog-detail-backdrop" onClick={() => setSelectedCatalogDetailId("")} />
            <aside className="catalog-detail-drawer" aria-label="Catalog item details">
              <div className="drawer-header catalog-detail-header">
                <div>
                  <p>{selectedCatalogDetailProduct.catalogType === "card" ? "Individual Card" : "Sealed Product"}</p>
                  <h3>{catalogTitle(selectedCatalogDetailProduct)}</h3>
                </div>
                <button type="button" className="drawer-close-button" aria-label="Close product detail" onClick={() => setSelectedCatalogDetailId("")}>X</button>
              </div>
              <div className="catalog-detail-body">
                <section className="catalog-detail-hero">
                  <div className="catalog-detail-media-panel">
                    {catalogImage(selectedCatalogDetailProduct) ? (
                      <>
                        <img
                          className="catalog-detail-image"
                          src={catalogImage(selectedCatalogDetailProduct)}
                          alt={catalogTitle(selectedCatalogDetailProduct)}
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                            event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                          }}
                        />
                        <div className="catalog-detail-image placeholder" hidden>
                          <b>Image needed</b>
                          <span>Suggest an image correction if this looks wrong.</span>
                        </div>
                      </>
                    ) : (
                      <div className="catalog-detail-image placeholder">
                        <b>Image needed</b>
                        <span>Suggest an image correction if this looks wrong.</span>
                      </div>
                    )}
                    <div className="image-source-panel">
                      <span>Image source: {getImageSourceLabel(selectedCatalogDetailProduct)}</span>
                      {selectedCatalogDetailProduct.imageNeedsReview ? <strong>Image needs review</strong> : null}
                      <div className="quick-actions">
                        {adminUser ? (
                          <>
                            <button type="button" className="secondary-button" onClick={() => updateCatalogImageMeta(selectedCatalogDetailProduct.id, { imageNeedsReview: false, imageStatus: selectedCatalogDetailProduct.imageStatus || "manual" })}>Mark Correct</button>
                            <button type="button" className="secondary-button" onClick={() => updateCatalogImageMeta(selectedCatalogDetailProduct.id, { imageNeedsReview: true })}>Mark Incorrect</button>
                            <button type="button" className="secondary-button" onClick={() => updateCatalogImageMeta(selectedCatalogDetailProduct.id, { imageUrl: "", imageSmall: "", imageLarge: "", imageSource: "placeholder", imageStatus: "placeholder", imageSourceUrl: "", imageNeedsReview: false })}>Remove Image</button>
                          </>
                        ) : (
                          <button type="button" className="secondary-button" onClick={() => submitUniversalSuggestion({
                            suggestionType: SUGGESTION_TYPES.CORRECT_CATALOG_PRODUCT,
                            targetTable: "product_catalog",
                            targetRecordId: selectedCatalogDetailProduct.id,
                            submittedData: { name: catalogTitle(selectedCatalogDetailProduct), imageNeedsReview: true },
                            currentDataSnapshot: selectedCatalogDetailProduct,
                            notes: "User flagged catalog image for admin review.",
                            source: "tidetradr-image-review",
                          })}>Suggest Image Review</button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="catalog-detail-core-panel">
                    <span className="catalog-pill">{selectedCatalogDetailProduct.catalogType === "card" ? "Card" : selectedCatalogDetailProduct.productType || "Product"}</span>
                    {selectedCatalogDetailProduct.expansionSymbolUrl || selectedCatalogDetailProduct.expansionLogoUrl ? (
                      <div className="catalog-expansion-banner">
                        <img src={selectedCatalogDetailProduct.expansionSymbolUrl || selectedCatalogDetailProduct.expansionLogoUrl} alt="" />
                        <span>{catalogExpansionName(selectedCatalogDetailProduct)}</span>
                      </div>
                    ) : null}
                    <div className="catalog-detail-grid catalog-detail-core-grid">
                      <DetailItem label="Product Type" value={selectedCatalogDetailProduct.productType || selectedCatalogDetailProduct.catalogType} />
                      <DetailItem label="Set / Expansion" value={catalogExpansionName(selectedCatalogDetailProduct)} />
                      <DetailItem label="Market Price" value={hasCatalogMarketPrice(selectedCatalogDetailProduct) ? money(selectedCatalogDetailMarketInfo?.currentMarketValue) : "Market price missing"} />
                      <DetailItem label="MSRP" value={selectedCatalogDetailMarketInfo?.msrp ? money(selectedCatalogDetailMarketInfo.msrp) : "Unknown"} />
                      <DetailItem label="Low / Mid / High" value={`${money(selectedCatalogDetailProduct.lowPrice)} / ${money(selectedCatalogDetailProduct.midPrice)} / ${money(selectedCatalogDetailProduct.highPrice)}`} />
                      <DetailItem label="Source Label" value={getCatalogMarketSourceLabel(selectedCatalogDetailProduct)} />
                      <DetailItem label="Last Updated" value={selectedCatalogDetailMarketInfo?.lastUpdated || selectedCatalogDetailProduct.lastPriceChecked || selectedCatalogDetailProduct.updatedAt} />
                    </div>
                    {selectedCatalogDetailVariants.length ? (
                      <div className="catalog-version-picker">
                        <span>Version / Finish</span>
                        <div className="catalog-version-buttons">
                          {selectedCatalogDetailVariants.map((variant) => (
                            <button
                              key={variant.id}
                              type="button"
                              className={String(selectedCatalogDetailVariant?.id) === String(variant.id) ? "primary compact-action active" : "secondary-button compact-action"}
                              onClick={() => setCatalogVariantSelection((current) => ({ ...current, [selectedCatalogDetailProduct.id]: variant.id }))}
                            >
                              {variant.variantName}
                            </button>
                          ))}
                        </div>
                        <div className="form compact-form-grid">
                          <Field label="Condition">
                            <select
                              value={selectedCatalogDetailCondition}
                              onChange={(event) => setCatalogConditionSelection((current) => ({ ...current, [selectedCatalogDetailProduct.id]: event.target.value }))}
                            >
                              {["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"].map((condition) => (
                                <option key={condition} value={condition}>{condition}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Language">
                            <input value={selectedCatalogDetailVariant?.language || selectedCatalogDetailProduct.language || "English"} readOnly />
                          </Field>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </section>
                <div className="catalog-detail-action-group catalog-detail-primary-actions">
                  <button type="button" onClick={() => addCatalogDetailToVault(selectedCatalogDetailProduct)}>Add to Vault</button>
                  <button type="button" onClick={() => addCatalogDetailToForge(selectedCatalogDetailProduct)}>Add to Forge</button>
                  <button type="button" onClick={() => addCatalogDetailToWatchlist(selectedCatalogDetailProduct)}>Add to Watchlist</button>
                  <button type="button" onClick={() => checkCatalogDetailDeal(selectedCatalogDetailProduct)}>Check Deal</button>
                  <button type="button" onClick={() => addCatalogDetailToScoutSighting(selectedCatalogDetailProduct)}>Add to Scout Sighting</button>
                </div>
                <div className="catalog-detail-action-group catalog-detail-secondary-actions">
                  <button type="button" className="secondary-button" onClick={scrollCatalogDetailToMarketHistory}>View Market History</button>
                  <button type="button" className="secondary-button" onClick={() => suggestCatalogMissingPrice(selectedCatalogDetailProduct)}>Suggest Missing Price</button>
                  <button type="button" className="secondary-button" onClick={() => suggestCatalogCorrection(selectedCatalogDetailProduct)}>Suggest Catalog Correction</button>
                  <button type="button" className="secondary-button" onClick={() => suggestCatalogWrongExpansion(selectedCatalogDetailProduct)}>Wrong Expansion?</button>
                  <button type="button" className="secondary-button" onClick={() => suggestCatalogWrongVersionPricing(selectedCatalogDetailProduct)}>Wrong Version/Pricing?</button>
                  <button type="button" className="secondary-button" onClick={() => copyCatalogProductIdentifiers(selectedCatalogDetailProduct)}>Copy UPC/SKU</button>
                  <button type="button" className="secondary-button" onClick={() => suggestCatalogUpcSku(selectedCatalogDetailProduct)}>Wrong UPC/SKU/MSRP?</button>
                </div>
                {(!hasCatalogMarketPrice(selectedCatalogDetailProduct) || !hasCatalogUpcSku(selectedCatalogDetailProduct)) ? (
                  <div className="catalog-detail-warning-list">
                    {!hasCatalogMarketPrice(selectedCatalogDetailProduct) ? (
                      <div className="catalog-detail-warning">
                        <strong>Market price missing</strong>
                        <span>Suggest a missing price so admins can review the catalog data.</span>
                        <button type="button" className="secondary-button" onClick={() => suggestCatalogMissingPrice(selectedCatalogDetailProduct)}>Suggest Missing Price</button>
                      </div>
                    ) : null}
                    {!hasCatalogUpcSku(selectedCatalogDetailProduct) ? (
                      <div className="catalog-detail-warning">
                        <strong>UPC/SKU missing</strong>
                        <span>Add a suggestion if you know the barcode, SKU, or product ID.</span>
                        <button type="button" className="secondary-button" onClick={() => suggestCatalogUpcSku(selectedCatalogDetailProduct)}>Suggest UPC/SKU</button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <h3 className="catalog-detail-section-title">Details</h3>
                <div className="catalog-detail-grid catalog-detail-overview-grid">
                  <DetailItem label="Card Number" value={selectedCatalogDetailProduct.cardNumber ? `#${selectedCatalogDetailProduct.cardNumber}` : ""} />
                  <DetailItem label="UPC / Barcode" value={getCatalogIdentifiers(selectedCatalogDetailProduct).filter((identifier) => ["UPC", "EAN", "GTIN"].includes(identifier.label)).map((identifier) => `${identifier.label}: ${identifier.value}`).join(" | ")} />
                  <DetailItem label="SKU / External IDs" value={getCatalogIdentifiers(selectedCatalogDetailProduct).filter((identifier) => ["RETAILER_SKU", "BEST_BUY_SKU", "TARGET_TCIN", "WALMART_ITEM_ID", "WALMART_SKU", "GAMESTOP_SKU", "POKEMON_CENTER_SKU", "POKEMON_CENTER_ID", "OTHER"].includes(identifier.label)).map((identifier) => `${identifier.label}: ${identifier.value}`).join(" | ")} />
                  <DetailItem label="TCGplayer ID" value={selectedCatalogDetailProduct.tcgplayerProductId || getCatalogIdentifiers(selectedCatalogDetailProduct).find((identifier) => identifier.label === "TCGPLAYER_PRODUCT_ID")?.value} />
                  <DetailItem label="Selected Version" value={selectedCatalogDetailVariant?.variantName} />
                  <DetailItem label="Finish / Printing" value={[selectedCatalogDetailVariant?.finish, selectedCatalogDetailVariant?.printing].filter(Boolean).join(" | ")} />
                  <DetailItem label="MSRP" value={selectedCatalogDetailMarketInfo?.msrp ? money(selectedCatalogDetailMarketInfo.msrp) : "MSRP unavailable"} />
                  <DetailItem label="Market Price" value={hasCatalogMarketPrice(selectedCatalogDetailProduct) ? money(selectedCatalogDetailMarketInfo?.currentMarketValue) : "Market data unavailable"} />
                  <DetailItem label="Low / Mid / High" value={`${money(selectedCatalogDetailProduct.lowPrice)} / ${money(selectedCatalogDetailProduct.midPrice)} / ${money(selectedCatalogDetailProduct.highPrice)}`} />
                  <DetailItem label="Source Label" value={getCatalogMarketSourceLabel(selectedCatalogDetailProduct)} />
                  <DetailItem label="Last Updated" value={selectedCatalogDetailMarketInfo?.lastUpdated || selectedCatalogDetailProduct.lastPriceChecked || selectedCatalogDetailProduct.updatedAt} />
                  <DetailItem label="Notes / Warnings" value={[
                    selectedCatalogDetailProduct.notes,
                    !hasCatalogMarketPrice(selectedCatalogDetailProduct) ? "Market price missing" : "",
                    !hasCatalogUpcSku(selectedCatalogDetailProduct) ? "UPC/SKU missing" : "",
                  ].filter(Boolean).join(" | ")} />
                </div>
                <details className="catalog-source-details">
                  <summary>Source Details</summary>
                  <div className="catalog-detail-grid">
                    <DetailItem label="Source Name" value={getTideTradrMarketInfo(selectedCatalogDetailProduct).sourceName || selectedCatalogDetailProduct.marketSource || selectedCatalogDetailProduct.sourceType} />
                    <DetailItem label="Source Product ID" value={selectedCatalogDetailProduct.externalProductId || selectedCatalogDetailProduct.tcgplayerProductId} />
                    <DetailItem label="Price Type" value={selectedCatalogDetailProduct.priceSubtype} />
                    <DetailItem label="Image Source" value={getImageSourceLabel(selectedCatalogDetailProduct)} />
                  </div>
                  {catalogSourceUrl(selectedCatalogDetailProduct) ? (
                    <a className="secondary-button" href={catalogSourceUrl(selectedCatalogDetailProduct)} target="_blank" rel="noreferrer">Open Source</a>
                  ) : null}
                </details>
                <details className="catalog-source-details">
                  <summary>Full Product Data</summary>
                  <div className="catalog-detail-grid">
                  {selectedCatalogDetailProduct.catalogType === "card" ? (
                    <>
                      <DetailItem label="Card Name" value={catalogTitle(selectedCatalogDetailProduct)} />
                      <DetailItem label="Set" value={catalogExpansionName(selectedCatalogDetailProduct)} />
                      <DetailItem label="Series" value={selectedCatalogDetailProduct.expansionSeries || selectedCatalogDetailProduct.productLine} />
                      <DetailItem label="Stage" value={catalogCardDetails(selectedCatalogDetailProduct).stage} />
                      <DetailItem label="Evolves From" value={catalogCardDetails(selectedCatalogDetailProduct).evolvesFrom} />
                      <DetailItem label="Type" value={(catalogCardDetails(selectedCatalogDetailProduct).types || []).join(", ")} />
                      <DetailItem label="HP" value={catalogCardDetails(selectedCatalogDetailProduct).hp} />
                      <DetailItem label="Ability" value={(catalogCardDetails(selectedCatalogDetailProduct).abilities || []).map((ability) => `${ability.name || "Ability"}: ${ability.text || ""}`).join(" | ")} />
                      <DetailItem label="Attacks" value={(catalogCardDetails(selectedCatalogDetailProduct).attacks || []).map((attack) => `${attack.name || "Attack"} ${attack.damage || ""} ${attack.text || ""}`).join(" | ")} />
                      <DetailItem label="Weakness" value={(catalogCardDetails(selectedCatalogDetailProduct).weaknesses || []).map((entry) => `${entry.type || ""} ${entry.value || ""}`.trim()).join(", ")} />
                      <DetailItem label="Resistance" value={(catalogCardDetails(selectedCatalogDetailProduct).resistances || []).map((entry) => `${entry.type || ""} ${entry.value || ""}`.trim()).join(", ")} />
                      <DetailItem label="Retreat Cost" value={(catalogCardDetails(selectedCatalogDetailProduct).retreatCost || []).join(", ")} />
                      <DetailItem label="Card Number" value={catalogCardDetails(selectedCatalogDetailProduct).cardNumber || selectedCatalogDetailProduct.cardNumber} />
                      <DetailItem label="Printed Total" value={catalogCardDetails(selectedCatalogDetailProduct).printedTotal || selectedCatalogDetailProduct.printedTotal} />
                      <DetailItem label="Rarity" value={catalogCardDetails(selectedCatalogDetailProduct).rarity || selectedCatalogDetailProduct.rarity} />
                      <DetailItem label="Illustrator" value={catalogCardDetails(selectedCatalogDetailProduct).artist} />
                      <DetailItem label="Regulation Mark" value={catalogCardDetails(selectedCatalogDetailProduct).regulationMark} />
                      <DetailItem label="Flavor Text" value={catalogCardDetails(selectedCatalogDetailProduct).flavorText} />
                      <DetailItem label="Pokedex #" value={(catalogCardDetails(selectedCatalogDetailProduct).nationalPokedexNumbers || []).join(", ")} />
                      <DetailItem label="Variants" value={selectedCatalogDetailVariants.map((variant) => variant.variantName).join(", ")} />
                      <DetailItem label="Market Price" value={money(getTideTradrMarketInfo(selectedCatalogDetailProduct).currentMarketValue)} />
                      <DetailItem label="Low / Mid / High" value={`${money(selectedCatalogDetailProduct.lowPrice)} / ${money(selectedCatalogDetailProduct.midPrice)} / ${money(selectedCatalogDetailProduct.highPrice)}`} />
                      <DetailItem label="Last Price Update" value={getTideTradrMarketInfo(selectedCatalogDetailProduct).lastUpdated} />
                      <DetailItem label="Source" value={getTideTradrMarketInfo(selectedCatalogDetailProduct).sourceName} />
                      <DetailItem label="Market Status" value={MARKET_STATUS_LABELS[getTideTradrMarketInfo(selectedCatalogDetailProduct).marketStatus] || "Unknown"} />
                      <DetailItem label="Source Product ID" value={selectedCatalogDetailProduct.externalProductId || selectedCatalogDetailProduct.tcgplayerProductId} />
                      <DetailItem label="Price Type" value={selectedCatalogDetailProduct.priceSubtype} />
                      <DetailItem label="Needs Review" value={getTideTradrMarketInfo(selectedCatalogDetailProduct).needsReview ? "Yes" : "No"} />
                      <DetailItem label="Image Source" value={getImageSourceLabel(selectedCatalogDetailProduct)} />
                      <DetailItem label="Image Last Updated" value={selectedCatalogDetailProduct.imageLastUpdated || "Unknown"} />
                    </>
                  ) : (
                    <>
                      <DetailItem label="Product Name" value={catalogTitle(selectedCatalogDetailProduct)} />
                      <DetailItem label="Product Type" value={selectedCatalogDetailProduct.sealedProductType || selectedCatalogDetailProduct.productType} />
                      <DetailItem label="Product Category" value={selectedCatalogDetailProduct.productCategory || selectedCatalogDetailProduct.category} />
                      <DetailItem label="Set / Series" value={catalogExpansionName(selectedCatalogDetailProduct)} />
                      <DetailItem label="Release Date" value={selectedCatalogDetailProduct.releaseDate} />
                      <DetailItem label="MSRP" value={getTideTradrMarketInfo(selectedCatalogDetailProduct).msrp ? money(getTideTradrMarketInfo(selectedCatalogDetailProduct).msrp) : "MSRP unavailable"} />
                      <DetailItem label="Market Price" value={hasCatalogMarketPrice(selectedCatalogDetailProduct) ? money(getTideTradrMarketInfo(selectedCatalogDetailProduct).currentMarketValue) : "Market data unavailable"} />
                      <DetailItem label="Low / High Price" value={`${money(selectedCatalogDetailProduct.lowPrice)} / ${money(selectedCatalogDetailProduct.highPrice)}`} />
                      <DetailItem label="Pack Count" value={selectedCatalogDetailProduct.packCount} />
                      <DetailItem label="Contents" value={typeof selectedCatalogDetailProduct.contents === "object" ? Object.entries(selectedCatalogDetailProduct.contents || {}).map(([key, value]) => `${key}: ${value}`).join(" | ") : selectedCatalogDetailProduct.contents} />
                      <DetailItem label="UPC / EAN / GTIN" value={getCatalogIdentifiers(selectedCatalogDetailProduct).filter((identifier) => ["UPC", "EAN", "GTIN"].includes(identifier.label)).map((identifier) => identifier.value).join(" | ")} />
                      <DetailItem label="Retail / Pokemon Center SKU" value={getCatalogIdentifiers(selectedCatalogDetailProduct).filter((identifier) => ["RETAILER_SKU", "POKEMON_CENTER_SKU"].includes(identifier.label)).map((identifier) => `${identifier.label}: ${identifier.value}`).join(" | ")} />
                      <DetailItem label="TCGplayer Product ID" value={selectedCatalogDetailProduct.tcgplayerProductId || getCatalogIdentifiers(selectedCatalogDetailProduct).find((identifier) => identifier.label === "TCGPLAYER_PRODUCT_ID")?.value} />
                      <DetailItem label="TCGplayer SKU ID" value={selectedCatalogDetailVariant?.tcgplayerSkuId || getCatalogIdentifiers(selectedCatalogDetailProduct).find((identifier) => identifier.label === "TCGPLAYER_SKU_ID")?.value} />
                      <DetailItem label="Pokemon Center Exclusive" value={selectedCatalogDetailProduct.isPokemonCenterExclusive ? "Yes" : ""} />
                      <DetailItem label="Price Type" value={selectedCatalogDetailProduct.priceSubtype} />
                      <DetailItem label="Retailer Exclusivity" value={selectedCatalogDetailProduct.retailerExclusive ? "Retailer exclusive" : "Not listed"} />
                      <DetailItem label="Retailer Name" value={selectedCatalogDetailProduct.retailerName} />
                      <DetailItem label="Last Price Update" value={getTideTradrMarketInfo(selectedCatalogDetailProduct).lastUpdated} />
                      <DetailItem label="Source" value={getTideTradrMarketInfo(selectedCatalogDetailProduct).sourceName} />
                      <DetailItem label="Market Status" value={MARKET_STATUS_LABELS[getTideTradrMarketInfo(selectedCatalogDetailProduct).marketStatus] || "Unknown"} />
                      <DetailItem label="Needs Review" value={getTideTradrMarketInfo(selectedCatalogDetailProduct).needsReview ? "Yes" : "No"} />
                      <DetailItem label="Image Source" value={getImageSourceLabel(selectedCatalogDetailProduct)} />
                      <DetailItem label="Image Last Updated" value={selectedCatalogDetailProduct.imageLastUpdated || "Unknown"} />
                    </>
                  )}
                  </div>
                </details>
                <div id="catalog-market-history">
                  <MarketPriceHistoryPanel
                  catalogProductId={selectedCatalogDetailProduct.id}
                  tcgplayerProductId={selectedCatalogDetailProduct.tcgplayerProductId}
                  externalProductId={selectedCatalogDetailProduct.externalProductId}
                  productName={catalogTitle(selectedCatalogDetailProduct)}
                  currentMarketPrice={getTideTradrMarketInfo(selectedCatalogDetailProduct).currentMarketValue}
                  currentLowPrice={selectedCatalogDetailProduct.lowPrice}
                  currentMidPrice={selectedCatalogDetailProduct.midPrice}
                  currentHighPrice={selectedCatalogDetailProduct.highPrice}
                  lastPriceChecked={selectedCatalogDetailProduct.lastPriceChecked || selectedCatalogDetailProduct.marketLastUpdated}
                  money={money}
                  />
                </div>
                {selectedCatalogDetailProduct.notes ? <p className="compact-subtitle">{selectedCatalogDetailProduct.notes}</p> : null}
              </div>
            </aside>
          </>
        ) : null}

      </main>
      <button
        type="button"
        className={showBackToTop ? "back-to-top-button is-visible" : "back-to-top-button"}
        aria-label="Back to top"
        onClick={scrollToPageTop}
      >
        <span aria-hidden="true">↑</span>
        <b>Top</b>
      </button>
      <nav className="mobile-bottom-nav" aria-label="Mobile main navigation">
        {mobileBottomTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeMainTab === tab.key ? "active" : ""}
            aria-current={activeMainTab === tab.key ? "page" : undefined}
            onClick={() => navigateMainTab(tab)}
          >
            <span aria-hidden="true">
              {tab.key === "home" ? "H" : tab.key === "forge" ? "F" : tab.key === "vault" ? "V" : tab.key === "scout" ? "S" : "T"}
            </span>
            <b>{tab.label}</b>
          </button>
        ))}
      </nav>
    </div>
  );
}

function ForgeItemDetail({ item, onClose, onEdit, onDelete, onSell, onCreateListing }) {
  if (!item) return null;
  const details = [
    ["Quantity", item.quantity],
    ["Cost Paid", hasValue(item.unitCost) ? money(item.unitCost) : ""],
    ["Total Cost", hasValue(item.unitCost) ? money(Number(item.quantity || 0) * Number(item.unitCost || 0)) : ""],
    ["MSRP", hasValue(item.msrpPrice) ? money(item.msrpPrice) : ""],
    ["Market Value", hasValue(item.marketPrice) ? money(item.marketPrice) : ""],
    ["Product Type", item.productType],
    ["Set / Collection", item.expansion],
    ["Release Year", item.releaseYear],
    ["Pack Count", item.packCount],
    ["UPC / Barcode", item.barcode],
    ["SKU", item.sku],
    ["Purchase Date", item.purchaseDate ? String(item.purchaseDate).slice(0, 10) : ""],
    ["Store", item.store],
    ["Purchaser", itemPurchaserName(item)],
    ["Notes", item.notes],
    ["Planned Selling Price", hasValue(item.salePrice) ? money(item.salePrice) : ""],
    ["Source", item.sourceLocation || item.externalProductSource],
    ["Original Vault Item", item.originalVaultItemId],
    ["Moved From Vault", item.movedFromVaultAt || item.dateMovedToForge],
    ["Catalog Link", item.catalogProductName],
  ].filter(([, value]) => hasValue(value));

  return (
    <div className="vault-detail-card forge-detail-card">
      <div className="compact-card-header">
        <div>
          <h3>{item.name}</h3>
          <p className="compact-subtitle">Full Forge item details and selling actions.</p>
        </div>
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
      </div>
      {item.itemImage ? <img className="vault-detail-image" src={item.itemImage} alt={item.name} /> : null}
      <div className="catalog-detail-grid">
        {details.map(([label, value]) => (
          <DetailItem key={label} label={label} value={value} />
        ))}
      </div>
      <MarketPriceHistoryPanel
        compact
        catalogProductId={item.catalogProductId || item.catalogItemId}
        tcgplayerProductId={item.tcgplayerProductId || item.sku}
        externalProductId={item.externalProductId || item.sku}
        productName={item.name}
        currentMarketPrice={item.marketPrice}
        currentLowPrice={item.lowPrice}
        currentMidPrice={item.midPrice}
        currentHighPrice={item.highPrice}
        lastPriceChecked={item.lastPriceChecked || item.marketLastUpdated}
        money={money}
      />
      <div className="quick-actions">
        <button type="button" onClick={() => onSell(item)}>Sell</button>
        <button type="button" className="secondary-button" onClick={() => onCreateListing?.(item)}>Create Listing</button>
        <button type="button" className="secondary-button" onClick={() => onEdit(item)}>Edit</button>
        <button type="button" className="secondary-button" onClick={() => onDelete(item)}>Delete</button>
      </div>
    </div>
  );
}

function VaultItemDetail({ item, onClose, onEdit, onDelete, onMoveToForge, onCopyToForge, onCreateListing, onDuplicate, onRefreshMarket }) {
  if (!item) return null;
  const details = [
    ["Quantity", item.quantity],
    ["Cost Paid", hasValue(item.unitCost) ? money(item.unitCost) : ""],
    ["MSRP", hasValue(item.msrpPrice) ? money(item.msrpPrice) : ""],
    ["Market Value", hasValue(item.marketPrice) ? money(item.marketPrice) : ""],
    ["Set / Collection", item.expansion],
    ["Product Type", item.productType],
    ["Planned Selling Price", hasValue(item.salePrice) ? money(item.salePrice) : ""],
    ["Source", item.sourceType || item.source || item.sourceLocation || item.externalProductSource],
    ["SKU", item.sku],
    ["UPC / Barcode", item.barcode],
    ["Status", vaultStatusLabel(normalizeVaultStatus(item))],
  ].filter(([, value]) => hasValue(value));

  return (
    <div className="vault-detail-card">
      <div className="compact-card-header">
        <div>
          <h3>{item.name}</h3>
          <p className="compact-subtitle">Full Vault details and Forge transfer actions.</p>
        </div>
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
      </div>
      {item.itemImage ? <img className="vault-detail-image" src={item.itemImage} alt={item.name} /> : null}
      <div className="catalog-detail-grid">
        {details.map(([label, value]) => (
          <DetailItem key={label} label={label} value={value} />
        ))}
      </div>
      <MarketPriceHistoryPanel
        compact
        catalogProductId={item.catalogProductId || item.catalogItemId}
        tcgplayerProductId={item.tcgplayerProductId || item.sku}
        externalProductId={item.externalProductId || item.sku}
        productName={item.name}
        currentMarketPrice={item.marketPrice}
        currentLowPrice={item.lowPrice}
        currentMidPrice={item.midPrice}
        currentHighPrice={item.highPrice}
        lastPriceChecked={item.lastPriceChecked || item.marketLastUpdated}
        money={money}
      />
      <div className="quick-actions">
        <button type="button" disabled={Number(item.quantity || 0) < 1} onClick={() => onMoveToForge(item)}>Move to Forge</button>
        <button type="button" className="secondary-button" onClick={() => onCopyToForge(item)}>Copy to Forge</button>
        <button type="button" className="secondary-button" onClick={() => onCreateListing?.(item)}>Create Listing</button>
        <button type="button" className="secondary-button" onClick={() => onEdit(item)}>Edit</button>
        <button type="button" className="secondary-button" onClick={() => onDelete(item)}>Delete Item</button>
      </div>
      <details className="vault-status-help">
        <summary>Selling / Forge</summary>
        <p>Vault is for collection tracking. Use Move to Forge or Copy to Forge when this item becomes business inventory.</p>
      </details>
    </div>
  );
}

function CompactInventoryCard({
  item,
  variant = "forge",
  onRestock,
  onViewDetails,
  onEdit,
  onDelete,
  onStatusChange,
  onMoveToForge,
  onCopyToForge,
  onDuplicate,
  onSell,
  onCreateListing,
}) {
  const quantity = Number(item.quantity || 0);
  const unitCost = Number(item.unitCost || 0);
  const marketPrice = Number(item.marketPrice || 0);
  const salePrice = Number(item.salePrice || 0);

  const marketProfit = quantity * marketPrice - quantity * unitCost;
  const plannedProfit = quantity * salePrice - quantity * unitCost;

  const roiPercent =
    unitCost > 0 ? ((marketPrice - unitCost) / unitCost) * 100 : 0;
  const isVault = variant === "vault";
  const packCount = Number(item.packCount || 0);
  if (isVault) {
    return (
      <div className="inventory-card compact-card vault-item-card">
        <div className="compact-card-header">
          <div className="compact-title-block">
            <h3>{item.name}</h3>
            <p className="compact-subtitle">Qty {quantity || 1}</p>
          </div>
          <span className={statusClass(vaultStatusLabel(normalizeVaultStatus(item)))}>{vaultStatusLabel(normalizeVaultStatus(item))}</span>
        </div>

        {item.itemImage ? (
          <div className="compact-image-wrap vault-image-wrap">
            <img src={item.itemImage} alt={item.name} />
          </div>
        ) : null}

        <div className="vault-card-facts">
          {packCount > 0 ? <p><strong>Pack Count:</strong> {packCount}</p> : null}
          <p><strong>Market Value:</strong> {money(quantity * marketPrice)}</p>
          <p><strong>Source:</strong> {item.sourceType || item.source || item.sourceLocation || "Manual"}</p>
        </div>

        <div className="compact-actions vault-card-actions">
          <button type="button" className="secondary-button" onClick={() => onViewDetails?.(item)}>View Details</button>
          <button type="button" className="secondary-button" disabled={quantity < 1} onClick={() => onMoveToForge?.(item)}>Move to Forge</button>
          <OverflowMenu
            buttonLabel="More"
            actions={[
              { label: "Edit", onClick: () => onEdit?.(item) },
              { label: "Copy to Forge", onClick: () => onCopyToForge?.(item) },
              { label: "Duplicate Item", onClick: () => onDuplicate?.(item) },
              { label: "Mark Traded", onClick: () => onStatusChange?.(item, "traded") },
              { label: "Change Status", onClick: () => onEdit(item) },
            ]}
            onDelete={() => onDelete(item.id)}
          />
        </div>
      </div>
    );
  }
  return (
    <div className="inventory-card compact-card forge-inventory-card">
      <div className="compact-card-header">
        <div className="compact-title-block">
          <h3>{item.name}</h3>
          <p className="compact-subtitle forge-card-quantity">Qty {item.quantity || 0}</p>
          <p className="compact-subtitle forge-card-meta-legacy">
            {item.category} • {item.buyer} • Qty {item.quantity}
          </p>
        </div>
        <span className={statusClass(item.status)}>{item.status || "In Stock"}</span>
      </div>

      {item.itemImage ? (
        <div className="compact-image-wrap">
          <img src={item.itemImage} alt={item.name} />
          <span>{getImageSourceLabel(item)}{item.itemImageNeedsReview ? " • Needs review" : ""}</span>
        </div>
      ) : (
        <div className="compact-image-wrap placeholder">
          <strong>{item.name}</strong>
          <small>{item.expansion || item.productType || "Item photo"}</small>
          <b>Image needed</b>
        </div>
      )}

  <div className="compact-metrics">
    <div>
      <span>Avg Cost</span>
      <strong>{money(item.unitCost)}</strong>
    </div>
    <div>
      <span>Market</span>
      <strong>{money(item.marketPrice)}</strong>
    </div>
    <div>
      <span>Planned Sale</span>
      <strong>{money(item.salePrice)}</strong>
    </div>
    <div>
      <span>Profit Est.</span>
      <strong>{money(plannedProfit || marketProfit)}</strong>
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
        <button type="button" className="secondary-button" onClick={() => onViewDetails?.(item)}>View</button>
        <button type="button" className="secondary-button" onClick={() => onEdit(item)}>Edit</button>
        <button type="button" className="secondary-button" onClick={() => onSell?.(item)}>Sell</button>
        <button type="button" className="secondary-button" onClick={() => onCreateListing?.(item)}>List</button>
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

function VaultEditForm({
  form,
  setForm,
  item,
  purchasers = createDefaultPurchasers(),
  onCreatePurchaser,
  handleImageUpload,
  onSubmit,
  onCancel,
  onMoveToForge,
}) {
  const [sections, setSections] = useState({
    basic: true,
    pricing: true,
    market: false,
    photos: false,
    forge: false,
    notes: false,
    advanced: false,
  });
  const [showNewPurchaser, setShowNewPurchaser] = useState(false);
  const [newPurchaserName, setNewPurchaserName] = useState("");

  const quantity = Number(form.quantity || 0);
  const unitCost = Number(form.unitCost || 0);
  const msrpPrice = Number(form.msrpPrice || 0);
  const marketPrice = Number(form.marketPrice || 0);
  const salePrice = Number(form.salePrice || 0);
  const totalPaid = quantity * unitCost;
  const totalMarket = quantity * marketPrice;
  const totalPlannedSale = quantity * salePrice;
  const estimatedMarketProfit = totalMarket - totalPaid;
  const estimatedPlannedProfit = totalPlannedSale - totalPaid;

  const currentPurchaserId =
    form.purchaserId ||
    purchasers.find((purchaser) => purchaser.name === form.purchaserName || purchaser.name === form.buyer)?.id ||
    "";
  function toggle(section) {
    setSections((current) => ({ ...current, [section]: !current[section] }));
  }

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

  function setVaultStatus(value) {
    setForm("vaultStatus", value);
    setForm("status", vaultStatusLabel(value));
  }

  function setCollection(value) {
    setForm("expansion", value);
    setForm("setName", value);
  }

  function renderSection(key, title, children) {
    return (
      <div className="vault-form-section" key={key}>
        <button type="button" className="vault-section-toggle" onClick={() => toggle(key)}>
          <span>{title}</span>
          <b>{sections[key] ? "Hide" : "Show"}</b>
        </button>
        {sections[key] ? children : null}
      </div>
    );
  }

  return (
    <section className="panel vault-edit-panel">
      <div className="compact-card-header">
        <div>
          <h2>Edit Vault Item</h2>
          <p>Vault is for personal collection and held items. Move to Forge when it becomes selling inventory.</p>
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="vault-collapsible-form vault-edit-form"
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") event.preventDefault();
        }}
      >
        {renderSection("basic", "Basic Info", (
          <div className="form vault-form-grid">
            <Field label="Vault Status">
              <select value={form.vaultStatus || normalizeVaultStatus(form)} onChange={(event) => setVaultStatus(event.target.value)}>
                {VAULT_STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Item Name">
              <input value={form.name || ""} onChange={(event) => setForm("name", event.target.value)} />
            </Field>
            <Field label="Category">
              <select value={form.category || "Pokemon"} onChange={(event) => setForm("category", event.target.value)}>
                {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </Field>
            <Field label="Product Type">
              <input value={form.productType || ""} onChange={(event) => setForm("productType", event.target.value)} />
            </Field>
            <Field label="Set / Collection">
              <input value={form.expansion || form.setName || ""} onChange={(event) => setCollection(event.target.value)} />
            </Field>
            <Field label="Quantity">
              <input type="number" min="1" value={form.quantity || 1} onChange={(event) => setForm("quantity", event.target.value)} />
            </Field>
            <Field label="Barcode / UPC">
              <input value={form.barcode || form.upc || ""} onChange={(event) => { setForm("barcode", event.target.value); setForm("upc", event.target.value); }} />
            </Field>
            <Field label="Store / Source">
              <input value={form.store || ""} onChange={(event) => setForm("store", event.target.value)} />
            </Field>
            <Field label="Purchased By">
              <select value={currentPurchaserId} onChange={(event) => selectPurchaser(event.target.value)}>
                <option value="">Unassigned</option>
                {purchasers.map((purchaser) => (
                  <option key={purchaser.id} value={purchaser.id}>{purchaser.name}</option>
                ))}
                <option value="__add__">Add New Purchaser</option>
              </select>
            </Field>
            {showNewPurchaser ? (
              <div className="inline-form">
                <input value={newPurchaserName} onChange={(event) => setNewPurchaserName(event.target.value)} placeholder="New purchaser name" />
                <button type="button" onClick={createInlinePurchaser}>Save Purchaser</button>
                <button type="button" className="secondary-button" onClick={() => setShowNewPurchaser(false)}>Cancel</button>
              </div>
            ) : null}
          </div>
        ))}

        {renderSection("pricing", "Pricing", (
          <div className="form vault-form-grid">
            <Field label="Unit Cost">
              <input type="number" step="0.01" value={form.unitCost || ""} onChange={(event) => setForm("unitCost", event.target.value)} />
            </Field>
            <Field label="MSRP">
              <input type="number" step="0.01" value={form.msrpPrice || ""} onChange={(event) => setForm("msrpPrice", event.target.value)} />
            </Field>
            <Field label="Market Price">
              <input type="number" step="0.01" value={form.marketPrice || ""} onChange={(event) => setForm("marketPrice", event.target.value)} />
            </Field>
            <Field label="Planned Sale Price">
              <input type="number" step="0.01" value={form.salePrice || ""} onChange={(event) => setForm("salePrice", event.target.value)} />
            </Field>
            <div className="profit-preview vault-profit-preview">
              <h3>Profit Preview</h3>
              <div className="preview-grid">
                <div><span>Total Paid</span><strong>{money(totalPaid)}</strong></div>
                <div><span>Total Market</span><strong>{money(totalMarket)}</strong></div>
                <div><span>Market Profit</span><strong>{money(estimatedMarketProfit)}</strong></div>
                <div><span>Planned Profit</span><strong>{money(estimatedPlannedProfit)}</strong></div>
                <div><span>Planned Sale Total</span><strong>{money(totalPlannedSale)}</strong></div>
                <div><span>MSRP Each</span><strong>{money(msrpPrice)}</strong></div>
              </div>
            </div>
          </div>
        ))}

        {renderSection("market", "Market Data", (
          <div className="form vault-form-grid">
            <Field label="Market Source">
              <input value={form.marketSource || form.sourceType || "Manual"} onChange={(event) => setForm("marketSource", event.target.value)} />
            </Field>
            <Field label="Market Last Updated">
              <input value={form.marketLastUpdated || form.lastPriceChecked || "Unknown"} readOnly />
            </Field>
            <div className="small-empty-state">
              Market refresh is not connected yet. Current values are manually entered or estimated beta data.
            </div>
          </div>
        ))}

        {renderSection("photos", "Photos", (
          <div className="form vault-form-grid">
            <Field label="Product Photo">
              <input type="file" accept="image/*" onChange={(event) => handleImageUpload(event, (url) => {
                setForm("itemImage", url);
                setForm("itemImageSource", "user");
                setForm("itemImageStatus", "user");
                setForm("itemImageLastUpdated", new Date().toISOString());
              }, "vault-items")} />
            </Field>
            <Field label="Manual Image URL">
              <input value={form.itemImage || ""} onChange={(event) => {
                setForm("itemImage", event.target.value);
                setForm("itemImageSource", event.target.value ? "manual" : "placeholder");
                setForm("itemImageStatus", event.target.value ? "manual" : "placeholder");
              }} />
            </Field>
            {form.itemImage ? (
              <div className="receipt-preview">
                <p>Product Photo</p>
                <img src={form.itemImage} alt="Product" />
                <button type="button" className="secondary-button" onClick={() => setForm("itemImage", "")}>Remove Product Photo</button>
              </div>
            ) : null}
            <Field label="Receipt / Screenshot">
              <input type="file" accept="image/*" onChange={(event) => handleImageUpload(event, (url) => setForm("receiptImage", url), "vault-receipts")} />
            </Field>
            {form.receiptImage ? (
              <div className="receipt-preview">
                <p>Receipt / Screenshot</p>
                <img src={form.receiptImage} alt="Receipt" />
                <button type="button" className="secondary-button" onClick={() => setForm("receiptImage", "")}>Remove Receipt</button>
              </div>
            ) : null}
          </div>
        ))}

        {renderSection("forge", "Selling / Forge", (
          <div className="form vault-form-grid">
            <Field label="Planned Sale Price">
              <input type="number" step="0.01" value={form.salePrice || ""} onChange={(event) => setForm("salePrice", event.target.value)} />
            </Field>
            <Field label="Listing Platform">
              <input value={form.listingPlatform || ""} onChange={(event) => setForm("listingPlatform", event.target.value)} />
            </Field>
            <Field label="Listing URL">
              <input value={form.listingUrl || ""} onChange={(event) => setForm("listingUrl", event.target.value)} />
            </Field>
            <Field label="Listed Price">
              <input type="number" step="0.01" value={form.listedPrice || ""} onChange={(event) => setForm("listedPrice", event.target.value)} />
            </Field>
            <Field label="Action Notes">
              <input value={form.actionNotes || ""} onChange={(event) => setForm("actionNotes", event.target.value)} />
            </Field>
            <button type="button" className="secondary-button" disabled={!item} onClick={() => item && onMoveToForge(item)}>Move to Forge</button>
          </div>
        ))}

        {renderSection("notes", "Notes", (
          <div className="form vault-form-grid">
            <Field label="Personal Notes">
              <textarea value={form.notes || ""} onChange={(event) => setForm("notes", event.target.value)} />
            </Field>
            <Field label="Condition Notes">
              <textarea value={form.conditionNotes || ""} onChange={(event) => setForm("conditionNotes", event.target.value)} />
            </Field>
            <Field label="Storage Location">
              <select value={form.storageLocation || ""} onChange={(event) => setForm("storageLocation", event.target.value)}>
                {VAULT_STORAGE_LOCATIONS.map((location) => <option key={location || "blank"} value={location}>{location || "Not set"}</option>)}
              </select>
            </Field>
            <Field label="Condition">
              <select value={form.condition || ""} onChange={(event) => setForm("condition", event.target.value)}>
                {VAULT_CONDITIONS.map((condition) => <option key={condition || "blank"} value={condition}>{condition || "Not set"}</option>)}
              </select>
            </Field>
            <Field label="Sealed Condition">
              <select value={form.sealedCondition || ""} onChange={(event) => setForm("sealedCondition", event.target.value)}>
                {VAULT_CONDITIONS.map((condition) => <option key={condition || "blank"} value={condition}>{condition || "Not set"}</option>)}
              </select>
            </Field>
          </div>
        ))}

        {renderSection("advanced", "Advanced", (
          <div className="form vault-form-grid">
            <Field label="TideTradr Product ID">
              <input value={form.externalProductId || form.tideTradrProductId || ""} onChange={(event) => { setForm("externalProductId", event.target.value); setForm("tideTradrProductId", event.target.value); }} />
            </Field>
            <Field label="Market Source URL">
              <input value={form.tideTradrUrl || ""} onChange={(event) => setForm("tideTradrUrl", event.target.value)} />
            </Field>
            <Field label="Product Line">
              <input value={form.productLine || ""} onChange={(event) => setForm("productLine", event.target.value)} />
            </Field>
            <Field label="Expansion">
              <input value={form.expansion || ""} onChange={(event) => setForm("expansion", event.target.value)} />
            </Field>
            <Field label="Pack Count">
              <input type="number" min="0" value={form.packCount || ""} onChange={(event) => setForm("packCount", event.target.value)} />
            </Field>
            <Field label="Low Price">
              <input type="number" step="0.01" value={form.lowPrice || ""} onChange={(event) => setForm("lowPrice", event.target.value)} />
            </Field>
            <Field label="Mid Price">
              <input type="number" step="0.01" value={form.midPrice || ""} onChange={(event) => setForm("midPrice", event.target.value)} />
            </Field>
            <Field label="High Price">
              <input type="number" step="0.01" value={form.highPrice || ""} onChange={(event) => setForm("highPrice", event.target.value)} />
            </Field>
          </div>
        ))}

        <div className="vault-form-actions">
          <button type="submit">Save Changes</button>
          <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </section>
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
  statusOptions = STATUSES,
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
  const selectedCatalogProduct = catalogProducts.find((product) => String(product.id) === String(form.catalogProductId));
  const selectedCatalogImage = selectedCatalogProduct ? getCatalogImage(selectedCatalogProduct) : "";
  const selectedCatalogName = selectedCatalogProduct
    ? selectedCatalogProduct.name || selectedCatalogProduct.productName || selectedCatalogProduct.cardName || "Catalog product"
    : "";
  const selectedCatalogVariants = Array.isArray(selectedCatalogProduct?.variants)
    ? selectedCatalogProduct.variants.filter((variant) => variant.variantName || variant.variant_name)
    : [];

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
    <form onSubmit={onSubmit} className="form forge-inventory-form">
      <section className="forge-form-step forge-product-step">
        <div className="forge-step-heading">
          <span>Step 1</span>
          <div>
            <h3>Product</h3>
            <p>Start from TideTradr when possible, or enter the item manually.</p>
          </div>
        </div>
      <Field label="Choose Saved Catalog Product">
        <select value={form.catalogProductId} onChange={(e) => applyCatalogProduct(e.target.value)}>
          <option value="">No catalog product selected</option>
          {catalogProducts.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.marketPrice)}</option>)}
        </select>
      </Field>
      {selectedCatalogProduct ? (
        <div className="forge-selected-product-card">
          <div className="catalog-thumb">
            {selectedCatalogImage ? <img src={selectedCatalogImage} alt="" /> : <span className="image-needed-placeholder">Image needed</span>}
          </div>
          <div>
            <strong>{selectedCatalogName}</strong>
            <span>{selectedCatalogProduct.setName || selectedCatalogProduct.expansion || selectedCatalogProduct.productType || "Catalog product"}</span>
            <span>Market: {money(selectedCatalogProduct.marketPrice || selectedCatalogProduct.marketValue || 0)} | MSRP: {selectedCatalogProduct.msrpPrice || selectedCatalogProduct.msrp ? money(selectedCatalogProduct.msrpPrice || selectedCatalogProduct.msrp) : "Unknown"}</span>
          </div>
        </div>
      ) : null}
      {selectedCatalogVariants.length ? (
        <div className="form compact-form-grid">
          <Field label="Version / Finish">
            <select
              value={form.catalogVariantId || ""}
              onChange={(event) => {
                const variant = selectedCatalogVariants.find((candidate) => String(candidate.id) === String(event.target.value));
                setForm("catalogVariantId", event.target.value);
                setForm("finish", variant?.finish || "");
                setForm("printing", variant?.printing || "");
                setForm("language", variant?.language || "English");
              }}
            >
              <option value="">Choose version</option>
              {selectedCatalogVariants.map((variant) => (
                <option key={variant.id || variant.variantName || variant.variant_name} value={variant.id || ""}>
                  {variant.variantName || variant.variant_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Condition">
            <select value={form.conditionName || "Near Mint"} onChange={(event) => {
              setForm("conditionName", event.target.value);
              setForm("condition", event.target.value);
            }}>
              {["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"].map((condition) => (
                <option key={condition} value={condition}>{condition}</option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}
      <Field label="Item Name"><input value={form.name} onChange={(e) => setForm("name", e.target.value)} /></Field>
      <Field label="Product Type"><input value={form.productType} onChange={(e) => setForm("productType", e.target.value)} /></Field>
      <Field label="Pack Count"><input type="number" value={form.packCount} onChange={(e) => setForm("packCount", e.target.value)} /></Field>
      <Field label="Product Photo"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => {
        setForm("itemImage", url);
        setForm("itemImageSource", "user");
        setForm("itemImageStatus", "user");
        setForm("itemImageLastUpdated", new Date().toISOString());
        setForm("itemImageNeedsReview", false);
      }, "item-photos")} /></Field>
      <Field label="Manual Image URL"><input value={form.itemImage || ""} onChange={(e) => {
        setForm("itemImage", e.target.value);
        setForm("itemImageSource", e.target.value ? "manual" : "placeholder");
        setForm("itemImageStatus", e.target.value ? "manual" : "placeholder");
        setForm("itemImageLastUpdated", e.target.value ? new Date().toISOString() : "");
      }} placeholder="Paste image URL" /></Field>
      {form.itemImage && (
        <div className="receipt-preview">
          <p>Product Photo • {getImageSourceLabel(form)}</p>
          <img src={form.itemImage} alt="Product" />
          <button type="button" className="secondary-button" onClick={() => {
            setForm("itemImage", "");
            setForm("itemImageSource", "placeholder");
            setForm("itemImageStatus", "placeholder");
            setForm("itemImageNeedsReview", false);
          }}>Remove Image</button>
        </div>
      )}
      </section>
      <section className="forge-form-step forge-quantity-step">
        <div className="forge-step-heading">
          <span>Step 2</span>
          <div>
            <h3>Quantity & Cost</h3>
            <p>Track quantity, cost, source, and purchaser.</p>
          </div>
        </div>
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
      </section>
      <section className="forge-form-step forge-selling-step">
        <div className="forge-step-heading">
          <span>Step 3</span>
          <div>
            <h3>Selling Plan</h3>
            <p>Set a status, planned sale price, and profit expectation.</p>
          </div>
        </div>
      <Field label="Planned Sale Price"><input type="number" step="0.01" value={form.salePrice} onChange={(e) => setForm("salePrice", e.target.value)} /></Field>
      <Field label="Status"><select value={form.status} onChange={(e) => setForm("status", e.target.value)}>{statusOptions.map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Listing Platform"><input value={form.listingPlatform} onChange={(e) => setForm("listingPlatform", e.target.value)} placeholder="eBay, Whatnot, Marketplace..." /></Field>
      <Field label="TideTradr Market Price"><input type="number" step="0.01" value={form.marketPrice} onChange={(e) => setForm("marketPrice", e.target.value)} /></Field>
      <Field label="MSRP Price">
  <input
    type="number"
    step="0.01"
    value={form.msrpPrice}
    onChange={(e) => setForm("msrpPrice", e.target.value)}
  />
</Field>
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
      </section>
      <details className="forge-form-step forge-optional-details">
        <summary>Step 4: Optional Details</summary>
      <Field label="Location"><input value={form.storageLocation || ""} onChange={(e) => setForm("storageLocation", e.target.value)} placeholder="Shelf, tote, case, storage bin..." /></Field>
      <Field label="Notes"><input value={form.notes || ""} onChange={(e) => setForm("notes", e.target.value)} /></Field>
      <Field label="Condition"><input value={form.condition || ""} onChange={(e) => setForm("condition", e.target.value)} placeholder="Sealed, damaged box, NM, LP..." /></Field>
      <Field label="Tags"><input value={form.tags || ""} onChange={(e) => setForm("tags", e.target.value)} placeholder="restock, promo, hold, bundle..." /></Field>
      <Field label="TideTradr Product ID"><input value={form.externalProductId} onChange={(e) => setForm("externalProductId", e.target.value)} /></Field>
      <Field label="Market Source URL"><input value={form.tideTradrUrl} onChange={(e) => setForm("tideTradrUrl", e.target.value)} /></Field>
      <Field label="MSRP Reference">
  <input
    type="number"
    step="0.01"
    value={form.msrpPrice}
    onChange={(e) => setForm("msrpPrice", e.target.value)}
  />
</Field>

<Field label="Product Type Detail">
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

<Field label="Pack Count Detail">
  <input
    type="number"
    value={form.packCount}
    onChange={(e) => setForm("packCount", e.target.value)}
  />
</Field>
      <Field label="Market Price Detail"><input type="number" step="0.01" value={form.marketPrice} onChange={(e) => setForm("marketPrice", e.target.value)} /></Field>
      <Field label="Low Price"><input type="number" step="0.01" value={form.lowPrice} onChange={(e) => setForm("lowPrice", e.target.value)} /></Field>
      <Field label="Mid Price"><input type="number" step="0.01" value={form.midPrice} onChange={(e) => setForm("midPrice", e.target.value)} /></Field>
      <Field label="High Price"><input type="number" step="0.01" value={form.highPrice} onChange={(e) => setForm("highPrice", e.target.value)} /></Field>
      <Field label="Listing URL"><input value={form.listingUrl} onChange={(e) => setForm("listingUrl", e.target.value)} /></Field>
      <Field label="Listed Price"><input type="number" step="0.01" value={form.listedPrice} onChange={(e) => setForm("listedPrice", e.target.value)} /></Field>
      <Field label="Action Notes"><input value={form.actionNotes} onChange={(e) => setForm("actionNotes", e.target.value)} /></Field>
      <Field label="Receipt / Screenshot"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => setForm("receiptImage", url), "inventory")} /></Field>
      {form.receiptImage && <div className="receipt-preview"><p>Receipt</p><img src={form.receiptImage} alt="Receipt" /></div>}
      </details>
      <div className="forge-form-footer">
        <button type="submit">{submitLabel}</button>
      </div>
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
