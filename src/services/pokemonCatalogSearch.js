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
  "tcgplayer_product_id",
  "external_product_id",
  "card_number",
];

const CATALOG_SELECT_FIELDS = [
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

export const CATALOG_SEARCH_ALIASES = buildLegacyCatalogSearchAliases();

const catalogRecommendationCache = new Map();

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

  if (productGroup === "Cards") next = next.eq("is_sealed", false);
  if (productGroup === "Sealed") next = next.eq("is_sealed", true);
  if (productType !== "All") next = next.eq("product_type", productType);
  if (setName !== "All") next = next.eq("set_name", setName);
  if (rarity !== "All") next = next.eq("rarity", rarity);
  if (dataFilter === "Has market price") next = next.gt("market_price", 0);
  if (dataFilter === "Missing price") next = next.or("market_price.is.null,market_price.eq.0");
  if (dataFilter === "Has image") next = next.not("image_url", "is", null).neq("image_url", "");

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
    tcgplayer: product.tcgplayerProductId || product.tcgplayer_product_id,
    external: product.externalProductId || product.external_product_id,
    card: product.cardNumber || product.card_number,
    name: product.name || product.productName || product.product_name || product.cardName || product.card_name,
  };
  if (String(values.barcode || "").toLowerCase() === cleaned) return 1;
  if (String(values.tcgplayer || "").toLowerCase() === cleaned) return 2;
  if (String(values.external || "").toLowerCase() === cleaned) return 3;
  if (String(product.identifier_search || "").toLowerCase().includes(cleaned)) return 3;
  if (String(values.card || "").toLowerCase() === cleaned) return 4;
  if (String(values.name || "").toLowerCase() === cleaned) return 5;
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

function rowMatchesExactId(row = {}, term = "") {
  const cleaned = normalizeCatalogQuery(term);
  if (!cleaned) return "";
  if (normalizeCatalogQuery(row.barcode || row.upc) === cleaned) return "Barcode";
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
  const productType = catalogRowProductType(row);
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
      exactIdLabel ? `${exactIdLabel}: ${row.barcode || row.tcgplayer_product_id || row.external_product_id}` : "",
    ].filter(Boolean).join(" | "),
    badge: exactIdLabel || (row.card_number && rowMatchesCardNumber(row, query) ? "Card #" : productType || "Product"),
    searchValue: exactIdLabel ? String(row.barcode || row.tcgplayer_product_id || row.external_product_id || title) : title,
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
  return catalogRecommendationCache.get(getCatalogRecommendationCacheKey(options)) || null;
}

function isExactIdentifierMode(mode, term) {
  const normalized = normalizeCatalogQuery(term);
  return mode === "barcode" || mode === "id" || /^\d{8,}$/.test(normalized);
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

async function runSearchAgainstSource({ supabase, sourceName, query, barcode, mode, filters, sort, page, pageSize }) {
  const cleanedQuery = cleanCatalogSearch(query);
  const cleanedBarcode = cleanCatalogSearch(barcode);
  const exactTerm = mode === "barcode" ? cleanedBarcode || cleanedQuery : cleanedQuery || cleanedBarcode;
  const analysis = analyzeCatalogSearch(exactTerm);
  const pageOffset = Math.max(0, (page - 1) * pageSize);
  const exactIdMode = isExactIdentifierMode(mode, exactTerm);
  const searchTerms = buildSearchTerms(cleanedQuery || cleanedBarcode, mode);
  const candidateLimit = sort === "bestMatch" && searchTerms.length > 1
    ? Math.min(Math.max(pageSize * Math.max(page, 1) * 3, 60), 180)
    : pageSize;
  const rangeStart = searchTerms.length > 1 ? 0 : pageOffset;
  const rangeEnd = rangeStart + candidateLimit - 1;
  let dbQuery = supabase
    .from(sourceName)
    .select(CATALOG_SELECT_FIELDS, { count: "estimated" });
  dbQuery = applyFilters(dbQuery, filters);
  if (exactIdMode && exactTerm) {
    dbQuery = dbQuery.or(EXACT_FIELDS.map((field) => `${field}.eq.${exactTerm}`).join(","));
  } else if (searchTerms.length) {
    const orClauses = searchTerms.flatMap((term) =>
      TEXT_SEARCH_FIELDS.map((field) => `${field}.ilike.%${String(term).replace(/[%,()]/g, " ").replace(/\s+/g, " ").trim()}%`)
    );
    dbQuery = dbQuery.or(orClauses.join(","));
  }
  dbQuery = applyDbSort(dbQuery, sort === "bestMatch" ? "recentlyChecked" : sort)
    .range(rangeStart, rangeEnd);
  const { data, error, count } = await dbQuery;
  if (error) throw error;

  const rowsByKey = new Map();
  for (const row of data || []) {
    const key = String(row.id || `${row.market_source || ""}-${row.external_product_id || row.tcgplayer_product_id || row.name}`).toLowerCase();
    if (!rowsByKey.has(key)) rowsByKey.set(key, row);
  }

  const rows = [...rowsByKey.values()]
    .sort((a, b) => {
      if (sort === "bestMatch") {
        const aScore = scoreCatalogSearchRow(a, analysis, exactTerm).score;
        const bScore = scoreCatalogSearchRow(b, analysis, exactTerm).score;
        return bScore - aScore || exactPriority(a, exactTerm) - exactPriority(b, exactTerm) || compareCatalogProducts(a, b, "bestMatch");
      }
      return compareCatalogProducts(a, b, sort);
    })
    .slice(searchTerms.length > 1 ? pageOffset : 0)
    .slice(0, pageSize);

  return {
    rows,
    count: searchTerms.length > 1 ? Math.max(rowsByKey.size, pageOffset + rows.length) : count || rows.length,
    exactCount: exactIdMode ? rows.length : 0,
    exactMiss: exactIdMode && rows.length === 0,
    aliasHints: analysis.didYouMean,
  };
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

  const result = await runSearchAgainstSource({
    supabase,
    sourceName: "pokemon_catalog_browse",
    query,
    barcode,
    mode,
    filters,
    sort,
    page,
    pageSize,
  });
  return { ...result, page, pageSize, hasMore: page * pageSize < result.count, usedFallback: false };
}

export async function getCatalogRecommendations({
  supabase,
  query = "",
  limit = CATALOG_RECOMMENDATION_LIMIT,
  productGroup = "All",
  dataFilter = "All",
  mapRow,
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

  const cacheKey = getCatalogRecommendationCacheKey({ query: cleaned, productGroup, dataFilter, limit });
  const cached = catalogRecommendationCache.get(cacheKey);
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
    usedFallback: false,
    cached: false,
  };
  catalogRecommendationCache.set(cacheKey, payload);
  return payload;
}
