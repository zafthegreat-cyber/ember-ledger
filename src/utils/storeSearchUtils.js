import { numericDistance } from "./routeUtils.js";

export function normalizeStoreSearch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const RETAILER_SEARCH_ALIASES = {
  target: ["t", "tgt", "target"],
  walmart: ["wm", "wally", "walmart", "walmart supercenter", "walmart neighborhood"],
  "barnes and noble": ["b n", "bn", "b and n", "barnes", "barnes noble", "barnes and noble"],
  gamestop: ["gs", "game stop", "gamestop"],
  "best buy": ["bb", "bbuy", "best buy"],
};

function storeAliasValues(store = {}) {
  return [
    ...(Array.isArray(store.aliases) ? store.aliases : []),
    ...(Array.isArray(store.searchAliases) ? store.searchAliases : []),
    ...(Array.isArray(store.search_aliases) ? store.search_aliases : []),
  ];
}

function retailerAliases(store = {}) {
  const retailer = normalizeStoreSearch(store.retailer || store.chain || store.storeGroup || store.store_group || "");
  return Object.entries(RETAILER_SEARCH_ALIASES)
    .filter(([canonical]) => retailer.includes(canonical) || canonical.includes(retailer))
    .flatMap(([, aliases]) => aliases);
}

function expandedStoreSearchTerms(query = "") {
  const search = normalizeStoreSearch(query);
  const compact = search.replace(/\s+/g, "");
  const terms = new Set([search, compact].filter(Boolean));
  if (["bn", "b n", "bandn", "barnes"].includes(compact) || search.includes("barnes")) {
    ["barnes and noble", "barnes noble", "b n", "bn"].forEach((term) => terms.add(normalizeStoreSearch(term)));
  }
  if (compact === "rmt" || search.includes("redmill") || search.includes("red mill")) {
    ["red mill target", "redmill target", "rm t"].forEach((term) => terms.add(normalizeStoreSearch(term)));
  }
  if (compact === "pemt" || search.includes("pembroke")) {
    ["pembroke target", "pem t"].forEach((term) => terms.add(normalizeStoreSearch(term)));
  }
  if (compact === "fc" || search.includes("first colonial") || search.includes("hilltop")) {
    ["first colonial", "first colonial target", "hilltop target", "fc target"].forEach((term) => terms.add(normalizeStoreSearch(term)));
  }
  if (compact === "gb" || search.includes("greenbrier")) {
    ["greenbrier", "greenbrier target", "greenbrier barnes and noble", "gb b n"].forEach((term) => terms.add(normalizeStoreSearch(term)));
  }
  return [...terms].filter(Boolean);
}

export function storeMatchesSearch(store = {}, query = "") {
  const search = normalizeStoreSearch(query);
  if (!search) return true;
  const haystackParts = [
    store.name,
    store.storeName,
    store.nickname,
    store.retailer,
    store.chain,
    store.storeGroup,
    store.address,
    store.city,
    store.county,
    store.region,
    store.state,
    store.country,
    store.zip,
    store.zipCode,
    store.storeNumber,
    store.retailerStoreId,
    store.phone,
    store.storeType,
    store.store_type,
    store.type,
    store.locationType,
    store.partnerNotes,
    store.partner_notes,
    store.familyFriendlyApproved ? "family friendly" : "",
    store.supportsKidsAccess ? "kids access" : "",
    store.supportsMsrpOrReasonablePricing ? "reasonable pricing" : "",
    store.offersKidEvents ? "kid events" : "",
    store.offersTradeNights ? "trade nights" : "",
    store.featuredPartner ? "featured partner" : "",
    store.advertisingPartner ? "advertising partner" : "",
    store.pokemonStockLikelihood,
    store.notes,
    ...storeAliasValues(store),
    ...retailerAliases(store),
  ];
  const haystack = normalizeStoreSearch(haystackParts.filter(Boolean).join(" "));
  const compactHaystack = haystack.replace(/\s+/g, "");
  return expandedStoreSearchTerms(query).some((term) => {
    const compactTerm = term.replace(/\s+/g, "");
    return haystack.includes(term) || (compactTerm && compactHaystack.includes(compactTerm));
  });
}

export function sortStores(stores = [], sortBy = "nickname") {
  return [...stores].sort((a, b) => {
    if (sortBy === "distance") return numericDistance(a) - numericDistance(b);
    if (sortBy === "city") return String(a.city || "").localeCompare(String(b.city || ""));
    if (sortBy === "lastReport" || sortBy === "last report") return new Date(b.lastReportDate || 0) - new Date(a.lastReportDate || 0);
    if (sortBy === "restockConfidence" || sortBy === "restock confidence") return Number(b.restockConfidence || 0) - Number(a.restockConfidence || 0);
    if (sortBy === "tidepoolScore" || sortBy === "tidepool score") return Number(b.tidepoolScore || 0) - Number(a.tidepoolScore || 0);
    return String(a.nickname || a.name || "").localeCompare(String(b.nickname || b.name || ""));
  });
}
