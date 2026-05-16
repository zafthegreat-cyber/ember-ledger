import { compareCatalogProducts } from "../utils/catalogSortUtils";
import {
  analyzeCatalogSearch,
  buildCatalogAliasSuggestions,
  buildLegacyCatalogSearchAliases,
  expandCatalogSearchQueries,
  normalizeSearchQuery,
  scoreCatalogSearchRow,
} from "../data/catalogSearchAliases.mjs";

const TEXT_SEARCH_FIELDS = [
  "name",
  "product_name",
  "set_name",
  "product_type",
  "set_code",
];

const LEGACY_TEXT_SEARCH_FIELDS = [
  "name",
  "set_name",
  "expansion",
  "product_type",
  "product_line",
  "barcode",
  "external_product_id",
  "tcgplayer_product_id",
  "card_number",
  "set_code",
];

const EXACT_FIELDS = [
  "barcode",
  "upc",
  "sku",
  "tcgplayer_product_id",
  "external_product_id",
  "card_number",
];

const LEGACY_EXACT_FIELDS = [
  "barcode",
  "tcgplayer_product_id",
  "external_product_id",
  "card_number",
];

const EXACT_IDENTIFIER_TYPES = [
  "UPC",
  "EAN",
  "GTIN",
  "SKU",
  "RETAILER_SKU",
  "BEST_BUY_SKU",
  "TARGET_TCIN",
  "WALMART_ITEM_ID",
  "WALMART_SKU",
  "GAMESTOP_SKU",
  "POKEMON_CENTER_SKU",
  "POKEMON_CENTER_ID",
  "TCGPLAYER_PRODUCT_ID",
  "TCGPLAYER_SKU_ID",
  "POKEMONTCG_IO_ID",
  "OTHER",
];

const CATALOG_SELECT_FIELDS = [
  "id",
  "master_catalog_item_id",
  "name",
  "product_name",
  "category",
  "catalog_item_type",
  "catalog_type",
  "set_name",
  "series",
  "product_type",
  "barcode",
  "upc",
  "sku",
  "external_product_id",
  "tcgplayer_product_id",
  "market_price",
  "low_price",
  "mid_price",
  "high_price",
  "image_url",
  "market_url",
  "last_price_checked",
  "set_code",
  "release_date",
  "expansion",
  "product_line",
  "retailer_skus",
  "contents",
  "related_cards",
  "card_number",
  "rarity",
  "msrp_price",
  "is_sealed",
  "variant_count",
  "variant_names",
  "default_variant_id",
  "source",
  "source_url",
  "admin_review_status",
  "is_verified",
  "duplicate_of",
  "price_confidence",
  "market_source_count",
  "data_confidence_score",
  "last_verified_at",
].join(",");

const LEGACY_CATALOG_SELECT_FIELDS = [
  "id",
  "name",
  "category",
  "set_name",
  "product_type",
  "barcode",
  "external_product_id",
  "tcgplayer_product_id",
  "market_price",
  "low_price",
  "mid_price",
  "high_price",
  "image_url",
  "market_url",
  "last_price_checked",
  "set_code",
  "expansion",
  "product_line",
  "card_number",
  "rarity",
  "msrp_price",
  "is_sealed",
].join(",");

export const CATALOG_PAGE_SIZE = 50;
export const CATALOG_RECOMMENDATION_LIMIT = 12;
export const CATALOG_SEARCH_DEFAULT_LIMIT = 30;
export const CATALOG_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const CATALOG_SEARCH_CACHE_MAX_ENTRIES = 80;
const CATALOG_IN_FLIGHT_MAX_ENTRIES = 40;

export const CATALOG_SEARCH_ALIASES = buildLegacyCatalogSearchAliases();

const catalogRecommendationCache = new Map();
const catalogSearchCache = new Map();
const catalogInFlightRequests = new Map();

export function cleanCatalogSearch(value) {
  return normalizeSearchQuery(value).slice(0, 140);
/*
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/pokémon/gi, "pokemon")
    .trim()
    .replace(/[,%()'"]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 140);
*/
}

export function normalizeCatalogQuery(input) {
  return normalizeSearchQuery(input);
}

const CODE_CARD_TEXT_TERMS = [
  "code card",
  "pokemon tcg live",
  "pokemon tcg online",
  "digital booster pack",
  "pokemon.com/redeem",
  "online code",
  "booster pack code",
  "redeem",
];

const CODE_CARD_DB_OR_CLAUSE = [
  "name.ilike.%code card%",
  "product_type.ilike.%code card%",
  "product_line.ilike.%code card%",
  "name.ilike.%pokemon tcg live%",
  "product_type.ilike.%pokemon tcg live%",
  "name.ilike.%pokemon tcg online%",
  "product_type.ilike.%pokemon tcg online%",
  "name.ilike.%digital booster pack%",
  "product_type.ilike.%digital booster pack%",
  "name.ilike.%pokemon.com/redeem%",
  "name.ilike.%online code%",
  "product_type.ilike.%online code%",
  "name.ilike.%booster pack code%",
  "product_type.ilike.%booster pack code%",
].join(",");

const SEALED_PRODUCT_DB_OR_CLAUSE = [
  "is_sealed.eq.true",
  "name.ilike.%sealed%",
  "product_type.ilike.%sealed%",
  "name.ilike.%elite trainer box%",
  "product_type.ilike.%elite trainer box%",
  "name.ilike.%pokemon center elite trainer box%",
  "product_type.ilike.%pokemon center elite trainer box%",
  "name.ilike.%booster box%",
  "product_type.ilike.%booster box%",
  "name.ilike.%booster bundle%",
  "product_type.ilike.%booster bundle%",
  "name.ilike.%booster pack%",
  "product_type.ilike.%booster pack%",
  "name.ilike.%sleeved booster%",
  "product_type.ilike.%sleeved booster%",
  "name.ilike.%blister%",
  "product_type.ilike.%blister%",
  "name.ilike.%mini tin%",
  "product_type.ilike.%mini tin%",
  "name.ilike.% tin%",
  "product_type.ilike.% tin%",
  "name.ilike.%collection box%",
  "product_type.ilike.%collection box%",
  "name.ilike.%premium collection%",
  "product_type.ilike.%premium collection%",
  "name.ilike.%special collection%",
  "product_type.ilike.%special collection%",
  "name.ilike.%ultra-premium collection%",
  "name.ilike.%ultra premium collection%",
  "product_type.ilike.%ultra premium collection%",
  "name.ilike.%build & battle%",
  "name.ilike.%build and battle%",
  "product_type.ilike.%build and battle%",
  "name.ilike.%trainer toolkit%",
  "product_type.ilike.%trainer toolkit%",
  "name.ilike.%battle deck%",
  "product_type.ilike.%battle deck%",
  "name.ilike.%retail bundle%",
  "product_type.ilike.%retail bundle%",
  "name.ilike.%costco%",
  "name.ilike.%sam's%",
  "name.ilike.%sams%",
  "name.ilike.%bj's%",
  "name.ilike.%case%",
  "product_type.ilike.%case%",
  "name.ilike.%display%",
  "product_type.ilike.%display%",
].join(",");

function catalogClassificationText(value = {}) {
  const source = value || {};
  return normalizeCatalogQuery([
    source.name,
    source.productName,
    source.product_name,
    source.cardName,
    source.card_name,
    source.productType,
    source.product_type,
    source.catalogItemType,
    source.catalog_item_type,
    source.catalogType,
    source.catalog_type,
    source.productLine,
    source.product_line,
    source.setName,
    source.set_name,
    source.expansion,
  ].filter(Boolean).join(" "));
}

function isCatalogCodeCardRow(row = {}) {
  const text = catalogClassificationText(row);
  if (!text) return false;
  return CODE_CARD_TEXT_TERMS.some((term) => text.includes(term));
}

function isRowMarkedSealed(row = {}) {
  return row.is_sealed === true || String(row.is_sealed || "").toLowerCase() === "true";
}

function rowHasAnyValue(...values) {
  return values.some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
}

function rowSourceSuggestsSealed(row = {}) {
  const typeText = normalizeCatalogQuery([
    row.catalog_type,
    row.catalogType,
    row.catalog_group,
    row.catalogGroup,
    row.catalog_item_type,
    row.catalogItemType,
    row.product_type,
    row.productType,
    row.sealed_product_type,
    row.sealedProductType,
    row.product_kind,
    row.productKind,
  ].filter(Boolean).join(" "));
  return (
    isRowMarkedSealed(row) ||
    /\bsealed\b|\bbooster\s*(box|bundle|pack)?\b|\belite\s+trainer\b|\bcollection\s+box\b|\bpremium\s+collection\b|\bspecial\s+collection\b|\bultra\s?premium\b|\bmini\s+tin\b|\btin\b|\bblister\b|\bbuild\s*&?\s*battle\b|\btrainer'?s?\s+toolkit\b|\bleague\s+battle\s+deck\b|\btheme\s+deck\b|\bstarter\s+deck\b/.test(typeText)
  );
}

function rowHasStrongCardIndicators(row = {}) {
  const details = row.card_details || row.cardDetails || row.tcg_card_details || row.tcgCardDetails || {};
  const cardNumber = row.card_number || row.cardNumber || details.card_number || details.cardNumber;
  const printedTotal = row.printed_total || row.printedTotal || details.printed_total || details.printedTotal;
  const rarity = row.rarity || details.rarity;
  const supertype = row.supertype || details.supertype;
  const cardTypeText = normalizeCatalogQuery([
    supertype,
    row.card_subtype,
    row.cardSubtype,
    details.stage,
    Array.isArray(details.subtypes) ? details.subtypes.join(" ") : details.subtypes,
    Array.isArray(details.types) ? details.types.join(" ") : details.types,
    row.catalog_item_type,
    row.catalogItemType,
    row.product_type,
    row.productType,
  ].filter(Boolean).join(" "));
  const numberPatternText = normalizeCatalogQuery([
    cardNumber,
    row.display_number,
    row.displayNumber,
    row.collector_number,
    row.collectorNumber,
    row.name,
    row.card_name,
    row.cardName,
  ].filter(Boolean).join(" "));
  const explicitKindText = normalizeCatalogQuery([
    row.catalog_type,
    row.catalogType,
    row.catalog_group,
    row.catalogGroup,
    row.catalog_item_type,
    row.catalogItemType,
    row.product_kind,
    row.productKind,
  ].filter(Boolean).join(" "));
  const sourceSaysCard =
    row.catalog_type === "card" ||
    row.catalogType === "card" ||
    /\bsingle\s?card\b|\bindividual\s+card\b|\bpromo\s+card\b/.test(explicitKindText) ||
    (/\bcard\b/.test(explicitKindText) && rowHasAnyValue(cardNumber, printedTotal, rarity, supertype));
  const explicitCardType =
    /\b(pokemon|trainer|item|supporter|stadium|tool|energy)\b/.test(cardTypeText) &&
    !/\bsealed\b|\bbooster\b|\bbox\b|\bbundle\b|\btin\b|\bcollection\b|\bpack\b|\bblister\b|\bdeck\b|\belite\s+trainer\s+box\b/.test(cardTypeText);

  return Boolean(
    sourceSaysCard ||
    /\b[a-z]{0,3}\d{1,4}[a-z]?\/[a-z]{0,3}\d{1,4}[a-z]?\b/.test(numberPatternText) ||
    rowHasAnyValue(cardNumber, printedTotal, rarity, supertype, row.hp, details.hp, row.artist, details.artist) ||
    explicitCardType
  );
}

function getCatalogSearchRowKind(row = {}) {
  if (isCatalogCodeCardRow(row)) return "code_card";
  if (rowHasStrongCardIndicators(row)) return "card";
  if (rowSourceSuggestsSealed(row)) return "sealed";
  return "other";
}

function rowMatchesProductGroup(row = {}, productGroup = "All") {
  const kind = getCatalogSearchRowKind(row);
  if (productGroup === "Cards") return kind === "card" || kind === "code_card";
  if (productGroup === "Sealed") return kind === "sealed";
  if (productGroup === "Other") return kind === "other";
  return true;
}

function filterRowsByProductGroup(rows = [], filters = {}) {
  const productGroup = filters.productGroup || "All";
  if (productGroup === "All") return rows;
  return rows.filter((row) => rowMatchesProductGroup(row, productGroup));
}

export function isCatalogSearchDebugEnabled() {
  return Boolean(
    import.meta.env?.DEV ||
    import.meta.env?.VITE_SEARCH_DEBUG === "true" ||
    import.meta.env?.VITE_QA_UNLOCK_PAID_FEATURES === "true"
  );
}

function debugCatalogSearch(event, payload = {}) {
  if (!isCatalogSearchDebugEnabled()) return;
  const safePayload = {
    query: payload.query,
    normalizedQuery: payload.normalizedQuery,
    mode: payload.mode,
    sourceName: payload.sourceName,
    rows: payload.rows,
    elapsedMs: payload.elapsedMs,
    cache: payload.cache,
    fallback: payload.fallback,
    phase: payload.phase,
  };
  console.info(`[catalog-search] ${event}`, safePayload);
}

function nowMs() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

function pruneMap(map, maxEntries) {
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    map.delete(oldestKey);
  }
}

function withAbortSignal(query, signal) {
  return signal && typeof query.abortSignal === "function" ? query.abortSignal(signal) : query;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function expandCatalogAliases(input) {
  return expandCatalogSearchQueries(input, 16);
/*
  const normalized = normalizeCatalogQuery(input);
  if (!normalized) return [];
  const variants = new Set([normalized]);
  const sortedAliases = [...CATALOG_SEARCH_ALIASES].sort((a, b) => b.alias.length - a.alias.length);

  for (const entry of sortedAliases) {
    const alias = normalizeCatalogQuery(entry.alias);
    const pattern = new RegExp(`(^|\\s)${escapeRegExp(alias)}(?=\\s|$)`, "i");
    const currentVariants = [...variants];
    for (const variant of currentVariants) {
      if (!pattern.test(variant)) continue;
      for (const expansion of entry.expansions) {
        const expanded = variant.replace(pattern, (match, prefix) => `${prefix}${normalizeCatalogQuery(expansion)}`).replace(/\s+/g, " ").trim();
        if (expanded && expanded !== variant) variants.add(expanded);
      }
    }
  }

  variants.delete(normalized);
  return [...variants].slice(0, 8);
*/
}

export function detectCatalogSearchMode(input) {
  const normalized = normalizeCatalogQuery(input);
  if (!normalized) return "general";
  if (/^\d{8,}$/.test(normalized)) return "barcode";
  if (/^(tg|gg|svp|h|rc)?\d{1,4}(\/(tg|gg|svp|h|rc)?\d{1,4})?$/i.test(normalized)) return "cardNumber";
  if (/^\d{5,}$/.test(normalized)) return "id";
  if (analyzeCatalogSearch(normalized).hasStructuredAlias) return "shorthand";
  return "general";
}

export function hasCatalogSearchCriteria({
  query = "",
  barcode = "",
  productGroup = "All",
  productType = "All",
  setName = "All",
  dataFilter = "All",
  rarity = "All",
} = {}) {
  return (
    cleanCatalogSearch(query).length >= 2 ||
    cleanCatalogSearch(barcode).length > 0 ||
    productGroup !== "All" ||
    productType !== "All" ||
    setName !== "All" ||
    dataFilter !== "All" ||
    rarity !== "All"
  );
}

function applyFilters(query, filters = {}) {
  const {
    productGroup = "All",
    productType = "All",
    setName = "All",
    dataFilter = "All",
    rarity = "All",
  } = filters;

  let next = query.eq("category", "Pokemon");

  if (productType !== "All") next = next.eq("product_type", productType);
  if (setName !== "All") next = next.eq("set_name", setName);
  if (rarity !== "All") next = next.eq("rarity", rarity);
  if (dataFilter === "Has market price") next = next.gt("market_price", 0);
  if (dataFilter === "Missing price") next = next.or("market_price.is.null,market_price.eq.0");
  if (dataFilter === "Has image") next = next.not("image_url", "is", null).neq("image_url", "");
  if (productGroup === "Sealed") next = next.or(SEALED_PRODUCT_DB_OR_CLAUSE);

  return next;
}

function applyTextSearch(query, term, fields = TEXT_SEARCH_FIELDS) {
  if (term.length < 2) return query;
  const safeTerm = String(term || "").replace(/[%,()]/g, " ").replace(/\s+/g, " ").trim();
  if (safeTerm.length < 2) return query;
  const like = `%${safeTerm}%`;
  return query.or(fields.map((field) => `${field}.ilike.${like}`).join(","));
}

function exactPriority(product = {}, term = "") {
  const cleaned = String(term || "").trim().toLowerCase();
  if (!cleaned) return 999;
  const values = {
    barcode: product.barcode || product.upc,
    sku: product.sku,
    tcgplayer: product.tcgplayerProductId || product.tcgplayer_product_id,
    external: product.externalProductId || product.external_product_id,
    card: product.cardNumber || product.card_number,
    name: product.name || product.productName || product.product_name || product.cardName || product.card_name,
  };
  if (String(values.barcode || "").toLowerCase() === cleaned) return 1;
  if (String(values.sku || "").toLowerCase() === cleaned) return 2;
  if (String(values.tcgplayer || "").toLowerCase() === cleaned) return 3;
  if (String(values.external || "").toLowerCase() === cleaned) return 4;
  if (String(product.identifier_search || "").toLowerCase().includes(cleaned)) return 3;
  if (String(values.card || "").toLowerCase() === cleaned) return 5;
  if (String(values.name || "").toLowerCase() === cleaned) return 6;
  if (String(values.name || "").toLowerCase().includes(cleaned)) return 6;
  if (String(product.official_expansion_name || product.expansion_display_name || product.setName || product.set_name || product.expansion || "").toLowerCase().includes(cleaned)) return 7;
  if (String(product.sealed_product_type || product.productType || product.product_type || "").toLowerCase().includes(cleaned)) return 8;
  return 999;
}

function catalogRowTitle(row = {}) {
  return String(row.product_name || row.card_name || row.name || "Unknown product").trim();
}

function catalogRowImage(row = {}) {
  return row.image_url || row.image_large || row.image_small || "";
}

function catalogRowMarketPrice(row = {}) {
  return Number(row.market_price ?? row.market_value ?? row.mid_price ?? row.market_value_near_mint ?? 0);
}

function catalogRowSet(row = {}) {
  return row.official_expansion_name || row.expansion_display_name || row.set_name || row.expansion || row.product_line || "";
}

function catalogRowProductType(row = {}) {
  return row.sealed_product_type || row.product_type || row.catalog_group || "";
}

function catalogRowKindLabel(row = {}) {
  const kind = getCatalogSearchRowKind(row);
  if (kind === "code_card") return "Code Card";
  if (kind === "card") return "Card";
  if (kind === "sealed") return "Sealed Product";
  return catalogRowProductType(row) || "Product";
}

function rowMatchesExactId(row = {}, term = "") {
  const cleaned = normalizeCatalogQuery(term);
  if (!cleaned) return "";
  if (normalizeCatalogQuery(row.barcode || row.upc) === cleaned) return "Barcode";
  if (normalizeCatalogQuery(row.sku) === cleaned) return "SKU";
  if (normalizeCatalogQuery(row.tcgplayer_product_id || row.tcgplayerProductId) === cleaned) return "TCGplayer ID";
  if (normalizeCatalogQuery(row.external_product_id || row.externalProductId) === cleaned) return "External ID";
  if (normalizeCatalogQuery(row.identifier_search).includes(cleaned)) return "Identifier";
  return "";
}

function rowMatchesCardNumber(row = {}, term = "") {
  const cleaned = normalizeCatalogQuery(term).replace(/\s/g, "");
  const cardNumber = normalizeCatalogQuery(row.card_number || row.cardNumber).replace(/\s/g, "");
  return Boolean(cleaned && cardNumber && (cardNumber === cleaned || cardNumber.startsWith(cleaned)));
}

function makeProductSuggestion(row, section, query, index = 0) {
  const title = catalogRowTitle(row);
  const setName = catalogRowSet(row);
  const productType = catalogRowKindLabel(row);
  const marketPrice = catalogRowMarketPrice(row);
  const exactIdLabel = rowMatchesExactId(row, query);
  return {
    id: `product-${row.id || row.external_product_id || row.tcgplayer_product_id || title}-${section}-${index}`,
    section,
    type: section === "Card Numbers" ? "Card #" : exactIdLabel || "Product",
    label: title,
    description: [
      productType,
      setName,
      row.card_number ? `#${row.card_number}` : "",
      exactIdLabel ? `${exactIdLabel}: ${row.barcode || row.upc || row.sku || row.tcgplayer_product_id || row.external_product_id}` : "",
    ].filter(Boolean).join(" | "),
    badge: exactIdLabel || (row.card_number && rowMatchesCardNumber(row, query) ? "Card #" : productType || "Product"),
    searchValue: exactIdLabel ? String(row.barcode || row.upc || row.sku || row.tcgplayer_product_id || row.external_product_id || title) : title,
    mode: exactIdLabel ? "barcode" : rowMatchesCardNumber(row, query) ? "cardNumber" : "general",
    product: row,
    imageUrl: catalogRowImage(row),
    marketPrice,
  };
}

function dedupeRecommendations(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.section}|${item.type}|${normalizeCatalogQuery(item.label)}|${normalizeCatalogQuery(item.searchValue)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildStaticAliasSuggestions(input) {
  return buildCatalogAliasSuggestions(input, 8).map((entry, index) => ({
    id: `alias-${normalizeCatalogQuery(entry.searchValue || entry.label)}-${index}`,
    ...entry,
  }));
}

export function getCatalogRecommendationCacheKey({
  query = "",
  productGroup = "All",
  dataFilter = "All",
  limit = CATALOG_RECOMMENDATION_LIMIT,
} = {}) {
  return JSON.stringify({
    query: cleanCatalogSearch(query),
    productGroup,
    dataFilter,
    limit,
  });
}

export function getCachedCatalogRecommendations(options = {}) {
  const entry = catalogRecommendationCache.get(getCatalogRecommendationCacheKey(options));
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CATALOG_SEARCH_CACHE_TTL_MS) {
    catalogRecommendationCache.delete(getCatalogRecommendationCacheKey(options));
    return null;
  }
  return entry.payload;
}

function setCachedCatalogRecommendations(options = {}, payload = {}) {
  catalogRecommendationCache.set(getCatalogRecommendationCacheKey(options), {
    cachedAt: Date.now(),
    payload,
  });
  pruneMap(catalogRecommendationCache, CATALOG_SEARCH_CACHE_MAX_ENTRIES);
}

function catalogSearchCacheKey({
  sourceName = "catalog_search_lightweight",
  query = "",
  barcode = "",
  mode = "general",
  productGroup = "All",
  productType = "All",
  setName = "All",
  dataFilter = "All",
  rarity = "All",
  sort = "bestMatch",
  page = 1,
  pageSize = CATALOG_SEARCH_DEFAULT_LIMIT,
  force = false,
  allowCompatibilityFallback = true,
} = {}) {
  return JSON.stringify({
    sourceName,
    query: cleanCatalogSearch(query),
    barcode: cleanCatalogSearch(barcode),
    mode,
    productGroup,
    productType,
    setName,
    dataFilter,
    rarity,
    sort,
    page: Number(page || 1),
    pageSize: Number(pageSize || CATALOG_SEARCH_DEFAULT_LIMIT),
    force: Boolean(force),
    allowCompatibilityFallback: Boolean(allowCompatibilityFallback),
  });
}

function getCachedCatalogSearch(key) {
  const entry = catalogSearchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CATALOG_SEARCH_CACHE_TTL_MS) {
    catalogSearchCache.delete(key);
    return null;
  }
  return { ...entry.payload, cacheHit: true, cacheState: "hit" };
}

function setCachedCatalogSearch(key, payload) {
  catalogSearchCache.set(key, {
    cachedAt: Date.now(),
    payload,
  });
  pruneMap(catalogSearchCache, CATALOG_SEARCH_CACHE_MAX_ENTRIES);
}

function isExactIdentifierMode(mode, term) {
  const normalized = normalizeCatalogQuery(term);
  return mode === "barcode" || mode === "id" || /^\d{8,}$/.test(normalized);
}

function identifierTerms(term = "") {
  const normalized = normalizeCatalogQuery(term);
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  const withoutLeadingZeroes = compact.replace(/^0+/, "");
  return [...new Set([normalized, compact, withoutLeadingZeroes].filter((value) => value && value.length >= 3))].slice(0, 4);
}

function safeOrTerm(term = "") {
  return String(term || "").replace(/[%,()]/g, " ").replace(/\s+/g, " ").trim();
}

function buildSearchTerms(term, mode) {
  const cleaned = cleanCatalogSearch(term);
  if (!cleaned) return [];
  if (isExactIdentifierMode(mode, cleaned)) return [cleaned];
  return [cleaned, ...expandCatalogAliases(cleaned)]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .slice(0, 4);
}

function applyDbSort(query, sortKey = "bestMatch") {
  if (sortKey === "nameAsc") return query.order("name", { ascending: true, nullsFirst: false });
  if (sortKey === "marketHigh") return query.order("market_price", { ascending: false, nullsFirst: false }).order("name", { ascending: true, nullsFirst: false });
  if (sortKey === "marketLow") return query.order("market_price", { ascending: true, nullsFirst: false }).order("name", { ascending: true, nullsFirst: false });
  if (sortKey === "setAsc" || sortKey === "cardNumber") return query.order("set_name", { ascending: true, nullsFirst: false }).order("card_number", { ascending: true, nullsFirst: false }).order("name", { ascending: true, nullsFirst: false });
  return query.order("last_price_checked", { ascending: false, nullsFirst: false }).order("name", { ascending: true, nullsFirst: false });
}

function dedupeRows(rows = []) {
  const rowsByKey = new Map();
  for (const row of rows || []) {
    const key = String(row.id || row.master_catalog_item_id || `${row.market_source || ""}-${row.external_product_id || row.tcgplayer_product_id || row.name}`).toLowerCase();
    if (!rowsByKey.has(key)) rowsByKey.set(key, row);
  }
  return [...rowsByKey.values()];
}

function rankRows(rows, analysis, exactTerm, sort) {
  return [...rows].sort((a, b) => {
    if (sort === "bestMatch") {
      const aScore = scoreCatalogSearchRow(a, analysis, exactTerm).score;
      const bScore = scoreCatalogSearchRow(b, analysis, exactTerm).score;
      return bScore - aScore || exactPriority(a, exactTerm) - exactPriority(b, exactTerm) || compareCatalogProducts(a, b, "bestMatch");
    }
    return compareCatalogProducts(a, b, sort);
  });
}

async function runViewRowsByMasterIds({ supabase, sourceName, masterIds, selectFields, pageSize, signal }) {
  const uniqueIds = [...new Set((masterIds || []).filter(Boolean))].slice(0, Math.max(pageSize * 2, 20));
  if (!uniqueIds.length) return [];
  let dbQuery = supabase
    .from(sourceName)
    .select(selectFields)
    .in("master_catalog_item_id", uniqueIds)
    .limit(pageSize);
  dbQuery = withAbortSignal(dbQuery, signal);
  const { data, error } = await dbQuery;
  if (error) throw error;
  return data || [];
}

async function runExactIdentifierSearch({ supabase, sourceName, query, barcode, mode, filters, sort, page, pageSize, selectFields = CATALOG_SELECT_FIELDS, exactFields = EXACT_FIELDS, signal }) {
  const cleanedQuery = cleanCatalogSearch(query);
  const cleanedBarcode = cleanCatalogSearch(barcode);
  const exactTerm = mode === "barcode" ? cleanedBarcode || cleanedQuery : cleanedQuery || cleanedBarcode;
  const terms = identifierTerms(exactTerm);
  if (!terms.length) {
    return { rows: [], count: 0, exactCount: 0, exactMiss: false, phase: "exact" };
  }

  const analysis = analyzeCatalogSearch(exactTerm);
  const directClauses = terms.flatMap((term) => exactFields.map((field) => `${field}.eq.${safeOrTerm(term)}`));
  let directQuery = supabase
    .from(sourceName)
    .select(selectFields, { count: "estimated" });
  directQuery = applyFilters(directQuery, filters);
  directQuery = directQuery.or(directClauses.join(",")).limit(Math.max(pageSize, 20));
  directQuery = withAbortSignal(directQuery, signal);

  const [directResult, identifierResult] = await Promise.all([
    directQuery,
    (async () => {
      try {
        let identifierQuery = supabase
          .from("master_catalog_identifiers")
          .select("catalog_item_id,identifier_type,identifier_value")
          .in("identifier_type", EXACT_IDENTIFIER_TYPES)
          .in("identifier_value", terms)
          .neq("status", "rejected")
          .limit(Math.max(pageSize * 2, 40));
        identifierQuery = withAbortSignal(identifierQuery, signal);
        return await identifierQuery;
      } catch (error) {
        return { data: [], error };
      }
    })(),
  ]);

  if (directResult.error) throw directResult.error;

  const identifierRows = identifierResult.error ? [] : identifierResult.data || [];
  const identifierMasterIds = identifierRows.map((row) => row.catalog_item_id);
  const identifierMatches = await runViewRowsByMasterIds({ supabase, sourceName, masterIds: identifierMasterIds, selectFields, pageSize, signal });
  const rankedRows = rankRows(
    filterRowsByProductGroup(dedupeRows([...(directResult.data || []), ...identifierMatches]), filters),
    analysis,
    exactTerm,
    sort,
  );
  const rows = rankedRows.slice(0, pageSize);

  return {
    rows,
    count: Math.max(rankedRows.length, rows.length),
    exactCount: rows.length,
    exactMiss: rows.length === 0,
    aliasHints: analysis.didYouMean,
    phase: "exact",
  };
}

async function runTextSearchAgainstSource({ supabase, sourceName, query, barcode, mode, filters, sort, page, pageSize, selectFields = CATALOG_SELECT_FIELDS, textFields = TEXT_SEARCH_FIELDS, matchMode = "fuzzy", signal }) {
  const cleanedQuery = cleanCatalogSearch(query);
  const cleanedBarcode = cleanCatalogSearch(barcode);
  const exactTerm = mode === "barcode" ? cleanedBarcode || cleanedQuery : cleanedQuery || cleanedBarcode;
  const analysis = analyzeCatalogSearch(exactTerm);
  const pageOffset = Math.max(0, (page - 1) * pageSize);
  const searchTerms = buildSearchTerms(cleanedQuery || cleanedBarcode, mode);
  const structuredSealedSetSearch = filters.productGroup === "Sealed" && (analysis.setMatches || []).length > 0;
  const candidateLimit = structuredSealedSetSearch
    ? Math.min(Math.max(pageSize * Math.max(page, 1) * 6, 120), 300)
    : sort === "bestMatch" && searchTerms.length > 1
      ? Math.min(Math.max(pageSize * Math.max(page, 1) * 3, 60), 180)
      : pageSize;
  const rangeStart = searchTerms.length > 1 ? 0 : pageOffset;
  const rangeEnd = rangeStart + candidateLimit - 1;
  let dbQuery = supabase
    .from(sourceName)
    .select(selectFields, { count: "estimated" });
  dbQuery = applyFilters(dbQuery, filters);
  if (searchTerms.length) {
    const orClauses = searchTerms.flatMap((term) =>
      textFields.map((field) => `${field}.ilike.${matchMode === "prefix" ? `${safeOrTerm(term)}%` : `%${safeOrTerm(term)}%`}`)
    );
    dbQuery = dbQuery.or(orClauses.join(","));
  }
  dbQuery = sort === "bestMatch"
    ? dbQuery.order("last_verified_at", { ascending: false, nullsFirst: false }).order("name", { ascending: true, nullsFirst: false })
    : applyDbSort(dbQuery, sort);
  dbQuery = withAbortSignal(dbQuery.range(rangeStart, rangeEnd), signal);
  const { data, error, count } = await dbQuery;
  if (error) throw error;

  const rankedRows = rankRows(filterRowsByProductGroup(dedupeRows(data || []), filters), analysis, exactTerm, sort);
  const rows = rankedRows
    .slice(searchTerms.length > 1 ? pageOffset : 0)
    .slice(0, pageSize);

  const filteredCount = filters.productGroup && filters.productGroup !== "All"
    ? Math.max(rankedRows.length, pageOffset + rows.length)
    : searchTerms.length > 1
      ? Math.max(rankedRows.length, pageOffset + rows.length)
      : count || rows.length;

  return {
    rows,
    count: filteredCount,
    exactCount: 0,
    exactMiss: false,
    aliasHints: analysis.didYouMean,
    phase: matchMode,
  };
}

async function runFastCatalogRpcSearch({ supabase, query, barcode, mode, filters, sort, page, pageSize, signal }) {
  const cleanedQuery = cleanCatalogSearch(query);
  const cleanedBarcode = cleanCatalogSearch(barcode);
  const exactTerm = mode === "barcode" ? cleanedBarcode || cleanedQuery : cleanedQuery || cleanedBarcode;
  if (page !== 1 || sort !== "bestMatch") return null;
  if (filters.productType !== "All" || filters.setName !== "All" || filters.dataFilter !== "All" || filters.rarity !== "All") return null;
  if (isExactIdentifierMode(mode, exactTerm)) return null;
  if ((cleanedQuery || cleanedBarcode).length < 2) return null;

  let rpcQuery = supabase.rpc("search_catalog_fast", {
    search_text: cleanedQuery || cleanedBarcode,
    product_group: filters.productGroup || "All",
    max_results: pageSize,
  });
  rpcQuery = withAbortSignal(rpcQuery, signal);
  const { data, error } = await rpcQuery;
  if (error) {
    if (/search_catalog_fast|function .* does not exist|schema cache/i.test(error.message || "")) return null;
    throw error;
  }

  const rows = dedupeRows(data || []).slice(0, pageSize);
  return {
    rows,
    count: rows.length,
    exactCount: 0,
    exactMiss: false,
    aliasHints: analyzeCatalogSearch(exactTerm).didYouMean,
    phase: "rpc",
  };
}

async function runSearchAgainstSource({ supabase, sourceName, query, barcode, mode, filters, sort, page, pageSize, selectFields = CATALOG_SELECT_FIELDS, textFields = TEXT_SEARCH_FIELDS, exactFields = EXACT_FIELDS, signal }) {
  const exactTerm = mode === "barcode" ? cleanCatalogSearch(barcode) || cleanCatalogSearch(query) : cleanCatalogSearch(query) || cleanCatalogSearch(barcode);
  if (isExactIdentifierMode(mode, exactTerm)) {
    const exactResult = await runExactIdentifierSearch({ supabase, sourceName, query, barcode, mode, filters, sort, page, pageSize, selectFields, exactFields, signal });
    if (exactResult.rows.length) return exactResult;
    const fallbackResult = await runTextSearchAgainstSource({
      supabase,
      sourceName,
      query: exactTerm,
      barcode: "",
      mode: "general",
      filters,
      sort,
      page,
      pageSize,
      selectFields,
      textFields,
      matchMode: "fuzzy",
      signal,
    });
    return {
      ...fallbackResult,
      exactMiss: true,
      phase: "exact+catalog-fallback",
    };
  }

  // The RPC path is fast when tuned, but a timed-out RPC surfaces as a noisy
  // browser 500 during beta. The lightweight view search is safer for mobile
  // add flows and still preserves pagination/filtering.

  return runTextSearchAgainstSource({ supabase, sourceName, query, barcode, mode, filters, sort, page, pageSize, selectFields, textFields, matchMode: "fuzzy", signal });
}

export async function searchPokemonCatalog({
  supabase,
  query = "",
  barcode = "",
  mode = "general",
  productGroup = "All",
  productType = "All",
  setName = "All",
  dataFilter = "All",
  rarity = "All",
  sort = "bestMatch",
  page = 1,
  pageSize = CATALOG_PAGE_SIZE,
  force = false,
  signal,
  allowCompatibilityFallback = true,
} = {}) {
  const filters = { productGroup, productType, setName, dataFilter, rarity };
  if (!force && !hasCatalogSearchCriteria({ query, barcode, ...filters })) {
    return {
      skipped: true,
      rows: [],
      count: 0,
      page,
      pageSize,
      hasMore: false,
      exactCount: 0,
      exactMiss: false,
    };
  }

  const normalizedPageSize = Math.min(Math.max(1, Number(pageSize || CATALOG_SEARCH_DEFAULT_LIMIT)), 50);
  const cacheKey = catalogSearchCacheKey({ query, barcode, mode, productGroup, productType, setName, dataFilter, rarity, sort, page, pageSize: normalizedPageSize, force, allowCompatibilityFallback });
  const cached = getCachedCatalogSearch(cacheKey);
  if (cached) {
    debugCatalogSearch("cache-hit", {
      query,
      normalizedQuery: cleanCatalogSearch(query || barcode),
      mode,
      sourceName: cached.sourceName,
      rows: cached.rows?.length || 0,
      elapsedMs: cached.elapsedMs,
      cache: "hit",
      fallback: cached.usedFallback,
      phase: cached.searchPhase,
    });
    return cached;
  }
  if (catalogInFlightRequests.has(cacheKey)) return catalogInFlightRequests.get(cacheKey);

  const startedAt = nowMs();
  const searchPromise = (async () => {
  try {
    const result = await runSearchAgainstSource({
      supabase,
      sourceName: "catalog_search_lightweight",
      query,
      barcode,
      mode,
      filters,
      sort,
      page,
      pageSize: normalizedPageSize,
      signal,
    });
    const payload = {
      ...result,
      page,
      pageSize: normalizedPageSize,
      hasMore: page * normalizedPageSize < result.count,
      usedFallback: false,
      sourceName: "catalog_search_lightweight",
      searchMode: mode,
      searchPhase: result.phase,
      elapsedMs: Math.round(nowMs() - startedAt),
      cacheHit: false,
      cacheState: "miss",
    };
    setCachedCatalogSearch(cacheKey, payload);
    debugCatalogSearch("complete", {
      query,
      normalizedQuery: cleanCatalogSearch(query || barcode),
      mode,
      sourceName: payload.sourceName,
      rows: payload.rows.length,
      elapsedMs: payload.elapsedMs,
      cache: "miss",
      fallback: false,
      phase: payload.searchPhase,
    });
    return payload;
  } catch (error) {
    const missingNewView = /catalog_search_lightweight|master_catalog|column .* does not exist|schema cache/i.test(error?.message || "");
    if (!missingNewView || !allowCompatibilityFallback) throw error;
    const result = await runSearchAgainstSource({
      supabase,
      sourceName: "pokemon_catalog_browse",
      query,
      barcode,
      mode,
      filters,
      sort,
      page,
      pageSize: normalizedPageSize,
      signal,
      selectFields: LEGACY_CATALOG_SELECT_FIELDS,
      textFields: LEGACY_TEXT_SEARCH_FIELDS,
      exactFields: LEGACY_EXACT_FIELDS,
    });
    const payload = {
      ...result,
      page,
      pageSize: normalizedPageSize,
      hasMore: page * normalizedPageSize < result.count,
      usedFallback: true,
      sourceName: "pokemon_catalog_browse",
      searchMode: mode,
      searchPhase: result.phase,
      elapsedMs: Math.round(nowMs() - startedAt),
      cacheHit: false,
      cacheState: "miss",
    };
    setCachedCatalogSearch(cacheKey, payload);
    debugCatalogSearch("complete", {
      query,
      normalizedQuery: cleanCatalogSearch(query || barcode),
      mode,
      sourceName: payload.sourceName,
      rows: payload.rows.length,
      elapsedMs: payload.elapsedMs,
      cache: "miss",
      fallback: true,
      phase: payload.searchPhase,
    });
    return payload;
  }
  })().finally(() => catalogInFlightRequests.delete(cacheKey));

  catalogInFlightRequests.set(cacheKey, searchPromise);
  pruneMap(catalogInFlightRequests, CATALOG_IN_FLIGHT_MAX_ENTRIES);
  return searchPromise;
}

export async function getCatalogRecommendations({
  supabase,
  query = "",
  limit = CATALOG_RECOMMENDATION_LIMIT,
  productGroup = "All",
  dataFilter = "All",
  mapRow,
  signal,
} = {}) {
  const cleaned = cleanCatalogSearch(query);
  const normalized = normalizeCatalogQuery(cleaned);
  const mode = detectCatalogSearchMode(cleaned);

  const exactIdentifier = isExactIdentifierMode(mode, cleaned);
  if (!supabase || (!normalized || (normalized.length < 2 && !exactIdentifier))) {
    return {
      query: cleaned,
      mode,
      suggestions: [],
      usedFallback: false,
      cached: false,
    };
  }

  const cached = getCachedCatalogRecommendations({ query: cleaned, productGroup, dataFilter, limit });
  if (cached) return { ...cached, cached: true };

  const aliasSuggestions = buildStaticAliasSuggestions(cleaned);
  const expandedTerms = expandCatalogAliases(cleaned);
  const result = await searchPokemonCatalog({
    supabase,
    query: cleaned,
    barcode: exactIdentifier ? cleaned : "",
    mode: mode === "id" ? "barcode" : mode,
    productGroup,
    dataFilter,
    sort: "bestMatch",
    page: 1,
    pageSize: Math.max(10, limit * 2),
    force: true,
    signal,
  });

  const rows = result.rows || [];
  const suggestions = [];
  const exactRows = rows.filter((row) =>
    rowMatchesExactId(row, cleaned) ||
    normalizeCatalogQuery(catalogRowTitle(row)) === normalized ||
    rowMatchesCardNumber(row, cleaned)
  );

  suggestions.push(...exactRows.slice(0, 3).map((row, index) => makeProductSuggestion(row, "Exact Matches", cleaned, index)));

  const barcodeRows = rows.filter((row) => rowMatchesExactId(row, cleaned));
  suggestions.push(...barcodeRows.slice(0, 2).map((row, index) => makeProductSuggestion(row, "Barcode / ID Matches", cleaned, index)));

  const cardRows = rows.filter((row) => row.card_number && rowMatchesCardNumber(row, cleaned));
  suggestions.push(...cardRows.slice(0, 3).map((row, index) => makeProductSuggestion(row, "Card Numbers", cleaned, index)));

  const productRows = rows
    .filter((row) => !exactRows.includes(row))
    .slice(0, 5);
  suggestions.push(...productRows.map((row, index) => makeProductSuggestion(row, "Products", cleaned, index)));

  const setNames = new Map();
  for (const row of rows) {
    const setName = catalogRowSet(row);
    if (!setName) continue;
    const setKey = normalizeCatalogQuery(setName);
    const matches = [normalized, ...expandedTerms.map(normalizeCatalogQuery)].some((term) => term && (setKey.includes(term) || term.includes(setKey)));
    if (!matches && setNames.size >= 3) continue;
    if (!setNames.has(setKey)) {
      setNames.set(setKey, {
        id: `set-${setKey}`,
        section: "Sets / Expansions",
        type: "Set",
        label: setName,
        description: "Search this set or expansion",
        badge: "Set",
        searchValue: setName,
        mode: "set",
      });
    }
  }
  suggestions.push(...[...setNames.values()].slice(0, 3));

  const productTypes = new Map();
  for (const row of rows) {
    const productType = catalogRowProductType(row);
    if (!productType) continue;
    const typeKey = normalizeCatalogQuery(productType);
    if (!productTypes.has(typeKey)) {
      productTypes.set(typeKey, {
        id: `type-${typeKey}`,
        section: "Product Types",
        type: "Product Type",
        label: productType,
        description: "Filter by this product type",
        badge: "Type",
        searchValue: productType,
        mode: "productType",
      });
    }
  }
  suggestions.push(...[...productTypes.values()].slice(0, 3));
  suggestions.push(...aliasSuggestions);

  const order = {
    "Exact Matches": 1,
    "Barcode / ID Matches": 2,
    "Card Numbers": 3,
    Products: 4,
    "Sets / Expansions": 5,
    "Product Types": 6,
    "Did You Mean?": 7,
    "Suggested Shorthand": 8,
  };

  const uniqueSuggestions = dedupeRecommendations(suggestions)
    .sort((a, b) => (order[a.section] || 99) - (order[b.section] || 99))
    .slice(0, limit)
    .map((suggestion) => ({
      ...suggestion,
      product: suggestion.product && mapRow ? mapRow(suggestion.product) : suggestion.product,
    }));

  const payload = {
    query: cleaned,
    mode,
    suggestions: uniqueSuggestions,
    usedFallback: Boolean(result.usedFallback),
    cached: false,
    elapsedMs: result.elapsedMs,
    sourceName: result.sourceName,
    searchPhase: result.searchPhase,
    cacheState: result.cacheState,
  };
  setCachedCatalogRecommendations({ query: cleaned, productGroup, dataFilter, limit }, payload);
  return payload;
}
