import { CHAIN_CONFIDENCE_DEFAULTS, VIRGINIA_REGIONS } from "../data/storeGroups";
import { getStoreGroup, normalizeStoreGroup } from "./storeGroupingUtils";

const REGION_CITY_HINTS = {
  "Hampton Roads": ["suffolk", "chesapeake", "norfolk", "virginia beach", "portsmouth", "hampton", "newport news", "yorktown", "williamsburg", "smithfield", "carrollton"],
  "Richmond / Central Virginia": ["richmond", "henrico", "midlothian", "chesterfield", "mechanicsville", "glen allen", "short pump", "ashland"],
  "Northern Virginia": ["alexandria", "arlington", "fairfax", "vienna", "falls church", "manassas", "woodbridge", "lorton", "sterling", "ashburn", "leesburg", "fredericksburg", "stafford", "spotsylvania"],
  "Charlottesville / Central West": ["charlottesville", "albemarle", "waynesboro", "staunton"],
  "Roanoke / Southwest Virginia": ["roanoke", "salem", "blacksburg", "christiansburg", "radford", "bristol", "abingdon", "wytheville"],
  "Shenandoah Valley": ["winchester", "front royal", "harrisonburg", "woodstock"],
  "Southside Virginia": ["lynchburg", "danville", "farmville", "martinsville", "south boston"],
  "Eastern Shore": ["exmore", "onley", "chincoteague", "cape charles"],
};

export function normalizeChainName(value = "") {
  const text = String(value || "").trim();
  const lower = text.toLowerCase();
  if (lower.includes("walmart neighborhood")) return "Walmart Neighborhood Market";
  if (lower.includes("walmart")) return "Walmart";
  if (lower.includes("target")) return "Target";
  if (lower.includes("best buy")) return "Best Buy";
  if (lower.includes("barnes")) return "Barnes & Noble";
  if (lower.includes("game stop") || lower.includes("gamestop")) return "GameStop";
  if (lower.includes("sam")) return "Sam's Club";
  if (lower.includes("bj")) return "BJ's Wholesale Club";
  if (lower.includes("costco")) return "Costco";
  if (lower.includes("five below")) return "Five Below";
  if (lower.includes("dollar general")) return "Dollar General";
  if (lower.includes("family dollar")) return "Family Dollar";
  if (lower.includes("dollar tree")) return "Dollar Tree";
  if (lower.includes("walgreens")) return "Walgreens";
  if (lower.includes("cvs")) return "CVS";
  if (lower.includes("kroger")) return "Kroger";
  if (lower.includes("harris teeter")) return "Harris Teeter";
  return text;
}

export function inferVirginiaRegion(store = {}) {
  if (store.region) {
    if (store.region === "Hampton Roads / 757") return "Hampton Roads";
    if (VIRGINIA_REGIONS.includes(store.region)) return store.region;
  }
  const text = `${store.city || ""} ${store.county || ""}`.toLowerCase();
  const found = Object.entries(REGION_CITY_HINTS).find(([, cities]) => cities.some((city) => text.includes(city)));
  return found?.[0] || "Hampton Roads";
}

export function makeStoreId(store = {}) {
  return `store-${String(`${store.chain || ""}-${store.address || ""}-${store.zip || store.city || ""}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;
}

export function normalizeImportedStore(row = {}, defaults = {}) {
  const chain = normalizeChainName(row.chain || defaults.chain || row.retailer || row.banner || "");
  const confidence = CHAIN_CONFIDENCE_DEFAULTS[chain] || { carriesPokemonLikely: Boolean(row.carriesPokemonLikely ?? row.sells_pokemon), pokemonConfidence: "unknown" };
  const normalized = normalizeStoreGroup({
    storeId: row.storeId || row.id || "",
    id: row.id || row.storeId || "",
    name: row.name || row.official_name || "",
    nickname: row.nickname || "",
    chain,
    storeGroup: row.storeGroup || row.store_group || "",
    address: row.address || "",
    city: row.city || "",
    state: row.state || defaults.state || "VA",
    zip: String(row.zip || ""),
    phone: row.phone || "",
    latitude: row.latitude || "",
    longitude: row.longitude || "",
    region: inferVirginiaRegion({ ...row, region: row.region || defaults.region }),
    county: row.county || "",
    source: row.source || defaults.source || "manual-csv",
    sourceUrl: row.sourceUrl || row.source_url || defaults.sourceUrl || "",
    carriesPokemonLikely: row.carriesPokemonLikely ?? row.sells_pokemon ?? confidence.carriesPokemonLikely ?? false,
    pokemonConfidence: row.pokemonConfidence || row.pokemon_confidence || confidence.pokemonConfidence,
    restockConfidence: Number(row.restockConfidence || 0),
    lastVerified: row.lastVerified || row.last_verified || "",
    notes: row.notes || "Restock days: Unknown. Truck days: Unknown. Purchase limits: Unknown.",
    userAdded: Boolean(row.userAdded || row.user_added),
    userEdited: Boolean(row.userEdited || row.user_edited),
    isActive: row.isActive ?? row.active ?? true,
    distanceFromUser: row.distanceFromUser || row.distanceMiles || "",
    favorite: Boolean(row.favorite),
    avoided: Boolean(row.avoided),
    strictLimits: Boolean(row.strictLimits || row.strict_limits),
    truckDay: row.truckDay || row.truck_day || "Unknown",
    restockDay: row.restockDay || row.restock_day || "Unknown",
    stockDays: row.stockDays || row.usual_stock_days || [],
    truckDays: row.truckDays || row.usual_truck_days || [],
    lastReportDate: row.lastReportDate || row.last_report_date || "",
    tidepoolScore: Number(row.tidepoolScore || 0),
    type: row.storeType || row.store_type || row.type || "Retail",
    storeType: row.storeType || row.store_type || row.type || "Retail",
    status: row.status || "Unknown",
    limitPolicy: row.limitPolicy || row.limit_policy || "Unknown",
    priority: Boolean(row.priority),
    createdAt: row.createdAt || row.created_at || "seed",
    updatedAt: row.updatedAt || row.updated_at || "seed",
  });
  const id = normalized.id || normalized.storeId || makeStoreId(normalized);
  return { ...normalized, id, storeId: id };
}

export function normalizeImportedStoreBatch(rows = [], defaults = {}) {
  return rows.map((row) => normalizeImportedStore(row, defaults));
}

export function dedupeStoresByChainAddress(stores = []) {
  const byKey = new Map();
  stores.forEach((store) => {
    const normalized = normalizeImportedStore(store);
    const key = `${normalized.chain}|${normalized.address}|${normalized.zip}`.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, normalized);
    else {
      const existing = byKey.get(key);
      byKey.set(key, {
        ...normalized,
        ...existing,
        notes: existing.userEdited ? existing.notes : normalized.notes || existing.notes,
        userEdited: existing.userEdited || normalized.userEdited,
      });
    }
  });
  return [...byKey.values()];
}

export function parseStoreCsv(csvText = "") {
  const lines = String(csvText).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

export function flagStoreImportIssues(stores = []) {
  const seen = new Map();
  const issues = [];
  stores.forEach((store) => {
    const normalized = normalizeImportedStore(store);
    const key = `${normalized.chain}|${normalized.address}|${normalized.zip}`.toLowerCase();
    if (!normalized.address || !normalized.zip) issues.push({ type: "missing_address_or_zip", store: normalized });
    if (!normalized.pokemonConfidence || normalized.pokemonConfidence === "unknown") issues.push({ type: "unknown_pokemon_confidence", store: normalized });
    if (seen.has(key)) issues.push({ type: "possible_duplicate", store: normalized, duplicateOf: seen.get(key) });
    seen.set(key, normalized);
  });
  return issues;
}
