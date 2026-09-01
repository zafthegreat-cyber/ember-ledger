export const FLIP_SCOUT_SCHEMA_VERSION = 4;
export const FLIP_SCOUT_STORAGE_KEY = "ember-and-tide.flip-scout.v1";

export const RECORD_COLLECTIONS = [
  "deals",
  "appraisals",
  "auctions",
  "searchRules",
  "purchases",
  "lots",
  "costAllocations",
  "inventory",
  "inventoryLots",
  "inventoryCreationApplications",
  "inventoryCreationEvents",
  "inventoryAdjustments",
  "sales",
  "returns",
  "expenses",
  "mileage",
  "activity",
  "providerListings",
];

export const PRODUCT_CLASSIFICATIONS = [
  "Raw card",
  "Graded card",
  "Sealed product",
  "Binder or collection",
  "Bulk",
  "Topps or vintage non-TCG",
  "Pokémon merchandise",
  "Accessory",
  "Mixed lot",
  "Unknown",
  "Other",
];

export const DEAL_STATUSES = [
  "New",
  "Needs Review",
  "Strong Deal",
  "Worth an Offer",
  "Watching",
  "Offer Made",
  "Purchased",
  "Passed",
  "Expired",
  "Sold",
];

export const LISTING_TYPES = ["Fixed price", "Auction", "Best offer", "Local pickup", "Mixed", "Unknown"];

export const RECOMMENDATION_LABELS = [
  "Exceptional Deal",
  "Strong Buy",
  "Worth an Offer",
  "Fair Price",
  "Personal Collection Only",
  "Pass",
  "Insufficient Information",
];

export const CONFIDENCE_LEVELS = ["Low", "Medium", "High"];
export const RISK_LEVELS = ["Low", "Medium", "High", "Unknown"];

export const AUCTION_TYPES = [
  "Storage auction",
  "Estate auction",
  "Government surplus",
  "Police surplus",
  "Online auction",
  "Local auction",
  "Live auction",
  "Marketplace auction",
  "Other",
];

export const AUCTION_WATCH_STATUSES = ["New", "Researching", "Watching", "Bid planned", "Passed", "Expired"];
export const AUCTION_OUTCOMES = ["Pending", "Won", "Lost", "Cancelled"];
export const TAX_BASE_OPTIONS = [
  { value: "hammer", label: "Hammer price only" },
  { value: "hammer_plus_premium", label: "Hammer price plus buyer premium" },
  { value: "manual", label: "Manually entered taxable subtotal" },
];

export const COST_ALLOCATION_METHODS = [
  { value: "manual", label: "Manual allocation" },
  { value: "equal", label: "Equal allocation" },
  { value: "quantity", label: "Quantity-based allocation" },
  { value: "relative_value", label: "Relative estimated-value allocation" },
];

export const INVENTORY_STATUSES = ["In stock", "Preparing", "Listed", "Partially sold", "Sold", "Personal collection", "Disposed"];
export const SALE_STATUSES = ["Draft", "Completed", "Refunded", "Cancelled"];

export const EXPENSE_CATEGORIES = [
  "Inventory",
  "Shipping",
  "Packaging",
  "Marketplace fees",
  "Supplies",
  "Equipment",
  "Booth or shelf fees",
  "Advertising",
  "Software",
  "Mileage/travel",
  "Storage",
  "Professional services",
  "Other",
];

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "ending_soon", label: "Ending soon" },
  { value: "highest_profit", label: "Highest profit" },
  { value: "highest_roi", label: "Highest ROI" },
  { value: "lowest_risk", label: "Lowest risk" },
  { value: "highest_confidence", label: "Highest confidence" },
];

export const SEARCH_RULE_TEMPLATES = [
  "Childhood Pokémon collection",
  "Vintage Pokémon binder",
  "Pokémon card lot",
  "Pokémon sealed collection",
  "Misspelled Pokémon listings",
  "Charizard misspellings",
  "Vintage Topps Pokémon",
  "Poorly photographed binder",
  "Local pickup Pokémon collection",
  "Graded card lot",
  "Bulk with visible vintage cards",
].map((name) => ({
  id: `template-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
  ruleName: name,
  enabled: false,
  marketplace: "Any approved source",
  includeKeywords: name.replace(/misspelled|poorly photographed/gi, "Pokémon").split(/\s+/).join(", "),
  excludeKeywords: "digital, proxy, custom",
  commonMisspellings: /misspelled|charizard/i.test(name) ? "pokeman, pokémonn, charzard, charizardd" : "",
  productClassifications: /binder|collection|lot|bulk/i.test(name) ? ["Binder or collection", "Mixed lot"] : [],
  minimumPrice: "",
  maximumPrice: "",
  maximumDistance: /local pickup/i.test(name) ? 35 : "",
  localPickupOnly: /local pickup/i.test(name),
  buyItNow: true,
  auction: true,
  newlyListedWindow: "24 hours",
  minimumProjectedProfit: "",
  minimumRoi: "",
  minimumConfidence: "Medium",
  maximumPurchaseAmount: "",
  priority: "Normal",
  notes: "Optional template only. Review and enable after a real connector is configured.",
}));

export function createEmptyFlipScoutState(now = new Date().toISOString()) {
  return {
    schemaVersion: FLIP_SCOUT_SCHEMA_VERSION,
    updatedAt: now,
    deals: [],
    appraisals: [],
    auctions: [],
    searchRules: [],
    purchases: [],
    lots: [],
    costAllocations: [],
    inventory: [],
    inventoryLots: [],
    inventoryCreationApplications: [],
    inventoryCreationEvents: [],
    inventoryAdjustments: [],
    sales: [],
    returns: [],
    expenses: [],
    mileage: [],
    activity: [],
    providerListings: [],
  };
}
