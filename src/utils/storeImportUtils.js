import {
  CHAIN_CONFIDENCE_DEFAULTS,
  DEFAULT_VIRGINIA_REGION,
  POKEMON_STOCK_LIKELIHOOD_OPTIONS,
  VIRGINIA_REGION_CITY_HINTS,
  VIRGINIA_REGIONS,
  VIRGINIA_STORE_COUNTRY,
  VIRGINIA_STORE_STATE,
  VIRGINIA_STORE_STATE_CODE,
} from "../data/storeGroups.js";
import { getStoreGroup, normalizeStoreGroup } from "./storeGroupingUtils.js";
import { normalizeStoreExpansionFields } from "./storeExpansionUtils.js";

const REGION_ALIASES = {
  "hampton roads": DEFAULT_VIRGINIA_REGION,
  "hampton roads / 757": DEFAULT_VIRGINIA_REGION,
  "757": DEFAULT_VIRGINIA_REGION,
  "williamsburg / peninsula": DEFAULT_VIRGINIA_REGION,
  peninsula: DEFAULT_VIRGINIA_REGION,
  "richmond": "Richmond / Central Virginia",
  "central virginia": "Richmond / Central Virginia",
  "richmond / central virginia": "Richmond / Central Virginia",
  nova: "Northern Virginia",
  "northern va": "Northern Virginia",
  "northern virginia": "Northern Virginia",
  fredericksburg: "Fredericksburg",
  "fredericksburg / stafford / spotsylvania": "Fredericksburg",
  "charlottesville": "Charlottesville / Albemarle",
  "charlottesville / central west": "Charlottesville / Albemarle",
  "charlottesville / albemarle": "Charlottesville / Albemarle",
  "roanoke": "Roanoke / Southwest Virginia",
  "southwest virginia": "Roanoke / Southwest Virginia",
  "roanoke / new river valley": "Roanoke / Southwest Virginia",
  "roanoke / southwest virginia": "Roanoke / Southwest Virginia",
  lynchburg: "Lynchburg",
  "shenandoah": "Shenandoah Valley",
  "shenandoah valley": "Shenandoah Valley",
  "eastern shore": "Eastern Shore",
  "southside": "Southside Virginia",
  "southside virginia": "Southside Virginia",
  other: "Other Virginia",
  "other virginia": "Other Virginia",
};

const STORE_DIRECTORY_SOURCE_LABELS = {
  directory_match: "Directory match",
  local_seed: "Local seed",
  admin_store_management: "Admin managed",
  user_store_suggestion: "User suggested",
  unverified: "Unverified directory row",
};

function normalizeAliasText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueAliases(values = []) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = normalizeAliasText(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function getStoreDirectoryAliases(store = {}) {
  const chain = normalizeAliasText(store.chain || store.retailer || "");
  const text = normalizeAliasText([
    store.nickname,
    store.name,
    store.storeName,
    store.address,
    store.city,
    store.notes,
  ].filter(Boolean).join(" "));
  const aliases = Array.isArray(store.aliases)
    ? [...store.aliases]
    : String(store.aliases || store.searchAliases || store.search_aliases || "")
      .split(/[|,]/)
      .map((value) => value.trim());

  if (chain === "target" && /\b(redmill|red mill|red mill commons|nimmo)\b/.test(text)) {
    aliases.push("RM T", "Redmill T", "Redmill Target", "Red Mill Target");
  }
  if (chain === "target" && /\bpembroke\b/.test(text)) {
    aliases.push("Pem T", "Pembroke T", "Pembroke Target");
  }
  if (chain === "target" && /\b(first colonial|hilltop)\b/.test(text)) {
    aliases.push("FC", "FC Target", "First Colonial Target", "Hilltop Target");
  }
  if (chain === "target" && /\bgreenbrier\b/.test(text)) {
    aliases.push("GB", "GB Target", "Greenbrier", "Greenbrier Target");
  }
  if (chain === "barnes and noble" && /\bgreenbrier\b/.test(text)) {
    aliases.push("GB B&N", "GB Barnes", "Greenbrier Barnes", "Greenbrier Barnes & Noble");
  }

  return uniqueAliases(aliases);
}

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
  if (lower.includes("bj")) return "BJ's";
  if (lower.includes("costco")) return "Costco";
  if (lower.includes("five below")) return "Five Below";
  if (lower.includes("dollar general")) return "Dollar General";
  if (lower.includes("family dollar")) return "Family Dollar";
  if (lower.includes("dollar tree")) return "Dollar Tree";
  if (lower.includes("kohl")) return "Kohl's";
  if (lower.includes("michaels")) return "Michaels";
  if (lower.includes("hobby lobby")) return "Hobby Lobby";
  if (lower.includes("dick")) return "DICK'S Sporting Goods";
  if (lower.includes("walgreens")) return "Walgreens";
  if (lower.includes("cvs")) return "CVS";
  if (lower.includes("kroger")) return "Kroger";
  if (lower.includes("harris teeter")) return "Harris Teeter";
  if (lower.includes("local card")) return "Local Card Shops";
  if (lower.includes("local game") || lower.includes("game store")) return "Local Game Stores";
  if (lower.includes("toy")) return "Toy Stores";
  if (lower.includes("book")) return "Bookstores";
  if (lower.includes("pokemon") || lower.includes("pokémon")) return "Other Pokemon-carrying Retailers";
  return text;
}

export function normalizeStateLabel(value = "") {
  const text = String(value || "").trim();
  if (!text) return VIRGINIA_STORE_STATE;
  if (/^(va|virginia)$/i.test(text)) return VIRGINIA_STORE_STATE;
  return text;
}

export function normalizeVirginiaRegion(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (VIRGINIA_REGIONS.includes(text)) return text;
  const alias = REGION_ALIASES[text.toLowerCase()];
  if (alias) return alias;
  return text;
}

export function normalizePokemonStockLikelihood(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "unknown";
  if (["high", "medium", "low", "unknown"].includes(text)) return text;
  if (["medium/high", "high/medium", "likely"].includes(text)) return "high";
  if (["low/medium", "medium/low", "possible"].includes(text)) return "medium";
  if (["unlikely", "none", "false", "no"].includes(text)) return "low";
  return POKEMON_STOCK_LIKELIHOOD_OPTIONS.includes(text) ? text : "unknown";
}

export function inferVirginiaRegion(store = {}) {
  if (store.region) {
    const normalized = normalizeVirginiaRegion(store.region);
    if (VIRGINIA_REGIONS.includes(normalized)) return normalized;
  }
  const text = `${store.city || ""} ${store.county || ""}`.toLowerCase();
  const found = Object.entries(VIRGINIA_REGION_CITY_HINTS).find(([, cities]) => cities.some((city) => text.includes(city)));
  return found?.[0] || "Other Virginia";
}

export function makeStoreId(store = {}) {
  return `store-${String(`${store.retailerStoreId || store.storeNumber || ""}-${store.chain || store.retailer || ""}-${store.address || ""}-${store.zipCode || store.zip || store.city || ""}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;
}

export function normalizeImportedStore(row = {}, defaults = {}) {
  const chain = normalizeChainName(row.chain || defaults.chain || row.retailer || row.banner || "");
  const confidence = CHAIN_CONFIDENCE_DEFAULTS[chain] || { carriesPokemonLikely: Boolean(row.carriesPokemonLikely ?? row.sells_pokemon), pokemonConfidence: "unknown" };
  const storeName = row.storeName || row.store_name || row.name || row.official_name || "";
  const zipCode = String(row.zipCode || row.zip_code || row.postal_code || row.zip || "");
  const pokemonStockLikelihood = normalizePokemonStockLikelihood(row.pokemonStockLikelihood || row.pokemon_stock_likelihood || row.pokemonConfidence || row.pokemon_confidence || confidence.pokemonConfidence);
  const sourceConfidence = row.sourceConfidence || row.source_confidence || row.confidence || "unverified";
  const directorySourceLabel = row.directorySourceLabel || row.directory_source_label || STORE_DIRECTORY_SOURCE_LABELS[sourceConfidence] || STORE_DIRECTORY_SOURCE_LABELS.unverified;
  const normalized = normalizeStoreExpansionFields(normalizeStoreGroup({
    storeId: row.storeId || row.id || "",
    id: row.id || row.storeId || "",
    country: row.country || defaults.country || VIRGINIA_STORE_COUNTRY,
    name: storeName,
    storeName,
    nickname: row.nickname || "",
    chain,
    retailer: chain,
    storeGroup: row.storeGroup || row.store_group || "",
    address: row.address || "",
    city: row.city || "",
    state: normalizeStateLabel(row.state || defaults.state || VIRGINIA_STORE_STATE),
    stateCode: VIRGINIA_STORE_STATE_CODE,
    zip: zipCode,
    zipCode,
    phone: row.phone || "",
    latitude: row.latitude || "",
    longitude: row.longitude || "",
    region: inferVirginiaRegion({ ...row, region: row.region || defaults.region }),
    county: row.county || "",
    source: row.source || defaults.source || "manual-csv",
    sourceUrl: row.sourceUrl || row.source_url || defaults.sourceUrl || "",
    source_url: row.source_url || row.sourceUrl || defaults.sourceUrl || "",
    storeNumber: row.storeNumber || row.store_number || "",
    store_number: row.store_number || row.storeNumber || "",
    retailerStoreId: row.retailerStoreId || row.retailer_store_id || "",
    retailer_store_id: row.retailer_store_id || row.retailerStoreId || "",
    carriesPokemonLikely: row.carriesPokemonLikely ?? row.sells_pokemon ?? confidence.carriesPokemonLikely ?? false,
    pokemonConfidence: row.pokemonConfidence || row.pokemon_confidence || confidence.pokemonConfidence,
    pokemonStockLikelihood,
    pokemon_stock_likelihood: pokemonStockLikelihood,
    restockConfidence: Number(row.restockConfidence || 0),
    lastVerified: row.lastVerified || row.last_verified || row.lastVerifiedAt || row.last_verified_at || "",
    lastVerifiedAt: row.lastVerifiedAt || row.last_verified_at || row.lastVerified || row.last_verified || "",
    last_verified_at: row.last_verified_at || row.lastVerifiedAt || row.lastVerified || row.last_verified || "",
    verifiedBy: row.verifiedBy || row.verified_by || "",
    verified_by: row.verified_by || row.verifiedBy || "",
    confidence: row.confidence || sourceConfidence,
    sourceConfidence,
    source_confidence: sourceConfidence,
    directorySourceLabel,
    directory_source_label: directorySourceLabel,
    restockSignalStatus: row.restockSignalStatus || row.restock_signal_status || "not_verified_restock_signal",
    restock_signal_status: row.restock_signal_status || row.restockSignalStatus || "not_verified_restock_signal",
    notes: row.notes || "Restock days: Unknown. Truck days: Unknown. Purchase limits: Unknown.",
    userAdded: Boolean(row.userAdded || row.user_added),
    userEdited: Boolean(row.userEdited || row.user_edited),
    isActive: row.isActive ?? row.active ?? true,
    active: row.active ?? row.isActive ?? true,
    distanceFromUser: row.distanceFromUser || row.distanceMiles || "",
    favorite: Boolean(row.favorite),
    watched: Boolean(row.watched || row.favorite),
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
    familyFriendlyApproved: row.familyFriendlyApproved ?? row.family_friendly_approved ?? false,
    family_friendly_approved: row.family_friendly_approved ?? row.familyFriendlyApproved ?? false,
    supportsKidsAccess: row.supportsKidsAccess ?? row.supports_kids_access ?? false,
    supports_kids_access: row.supports_kids_access ?? row.supportsKidsAccess ?? false,
    supportsMsrpOrReasonablePricing: row.supportsMsrpOrReasonablePricing ?? row.supports_msrp_or_reasonable_pricing ?? false,
    supports_msrp_or_reasonable_pricing: row.supports_msrp_or_reasonable_pricing ?? row.supportsMsrpOrReasonablePricing ?? false,
    agreedToCommunityMotto: row.agreedToCommunityMotto ?? row.agreed_to_community_motto ?? false,
    agreed_to_community_motto: row.agreed_to_community_motto ?? row.agreedToCommunityMotto ?? false,
    offersKidEvents: row.offersKidEvents ?? row.offers_kid_events ?? false,
    offers_kid_events: row.offers_kid_events ?? row.offersKidEvents ?? false,
    offersTradeNights: row.offersTradeNights ?? row.offers_trade_nights ?? false,
    offers_trade_nights: row.offers_trade_nights ?? row.offersTradeNights ?? false,
    advertisingPartner: row.advertisingPartner ?? row.advertising_partner ?? false,
    advertising_partner: row.advertising_partner ?? row.advertisingPartner ?? false,
    featuredPartner: row.featuredPartner ?? row.featured_partner ?? false,
    featured_partner: row.featured_partner ?? row.featuredPartner ?? false,
    partnerNotes: row.partnerNotes || row.partner_notes || "",
    partner_notes: row.partner_notes || row.partnerNotes || "",
    status: row.status || "Unknown",
    limitPolicy: row.limitPolicy || row.limit_policy || "Unknown",
    priority: Boolean(row.priority),
    createdAt: row.createdAt || row.created_at || "seed",
    updatedAt: row.updatedAt || row.updated_at || "seed",
  }));
  const id = normalized.id || normalized.storeId || makeStoreId(normalized);
  const aliases = getStoreDirectoryAliases({ ...normalized, id, storeId: id });
  return { ...normalized, id, storeId: id, aliases, searchAliases: aliases, search_aliases: aliases };
}

export function normalizeImportedStoreBatch(rows = [], defaults = {}) {
  return rows.map((row) => normalizeImportedStore(row, defaults));
}

export function dedupeStoresByChainAddress(stores = []) {
  const byKey = new Map();
  stores.forEach((store) => {
    const normalized = normalizeImportedStore(store);
    const key = `${normalized.retailerStoreId || normalized.storeNumber || ""}|${normalized.chain}|${normalized.address}|${normalized.zip}`.toLowerCase();
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

function parseCsvRows(csvText = "") {
  const rows = [];
  let cell = "";
  let row = [];
  let quoted = false;
  const text = String(csvText || "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => String(value).trim())) rows.push(row);
  return rows;
}

export function parseStoreCsv(csvText = "") {
  const rows = parseCsvRows(csvText);
  if (!rows.length) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, String(cells[index] || "").trim()]))
  );
}

export function flagStoreImportIssues(stores = []) {
  const seen = new Map();
  const issues = [];
  stores.forEach((store) => {
    const normalized = normalizeImportedStore(store);
    const key = `${normalized.retailerStoreId || normalized.storeNumber || ""}|${normalized.chain}|${normalized.address}|${normalized.zip}`.toLowerCase();
    if (!normalized.address || !normalized.zip) issues.push({ type: "missing_address_or_zip", store: normalized });
    if (!normalized.region || normalized.region === "Other Virginia") issues.push({ type: "missing_or_uncertain_region", store: normalized });
    if (!normalized.source) issues.push({ type: "missing_source", store: normalized });
    if (!normalized.pokemonStockLikelihood || normalized.pokemonStockLikelihood === "unknown") issues.push({ type: "unknown_pokemon_stock_likelihood", store: normalized });
    if (seen.has(key)) issues.push({ type: "possible_duplicate", store: normalized, duplicateOf: seen.get(key) });
    seen.set(key, normalized);
  });
  return issues;
}
