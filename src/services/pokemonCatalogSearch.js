import { applyCatalogDbSort, compareCatalogProducts } from "../utils/catalogSortUtils";

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
  "name",
];

export const CATALOG_PAGE_SIZE = 50;
export const CATALOG_RECOMMENDATION_LIMIT = 12;

export const CATALOG_SEARCH_ALIASES = [
  { alias: "etb", expansions: ["elite trainer box"], label: "Elite Trainer Box", type: "Product Type" },
  { alias: "pc etb", expansions: ["pokemon center elite trainer box"], label: "Pokemon Center Elite Trainer Box", type: "Product Type" },
  { alias: "pkmn center", expansions: ["pokemon center"], label: "Pokemon Center", type: "Product Type" },
  { alias: "upc", expansions: ["ultra premium collection", "ultra-premium collection"], label: "Ultra-Premium Collection", type: "Product Type" },
  { alias: "bb", expansions: ["booster box", "booster bundle"], label: "Booster Box / Booster Bundle", type: "Product Type" },
  { alias: "booster b", expansions: ["booster bundle", "booster box"], label: "Booster Bundle / Booster Box", type: "Product Type" },
  { alias: "bndl", expansions: ["bundle", "booster bundle"], label: "Bundle", type: "Product Type" },
  { alias: "tin", expansions: ["tin"], label: "Tin", type: "Product Type" },
  { alias: "mini tin", expansions: ["mini tin"], label: "Mini Tin", type: "Product Type" },
  { alias: "collection box", expansions: ["collection", "collection box"], label: "Collection Box", type: "Product Type" },
  { alias: "prem coll", expansions: ["premium collection"], label: "Premium Collection", type: "Product Type" },
  { alias: "sv", expansions: ["scarlet violet", "scarlet & violet"], label: "Scarlet & Violet", type: "Set" },
  { alias: "svi", expansions: ["scarlet violet base", "scarlet & violet base"], label: "Scarlet & Violet Base", type: "Set" },
  { alias: "pe", expansions: ["prismatic evolutions"], label: "Prismatic Evolutions", type: "Set" },
  { alias: "pr evo", expansions: ["prismatic evolutions"], label: "Prismatic Evolutions", type: "Set" },
  { alias: "prism evo", expansions: ["prismatic evolutions"], label: "Prismatic Evolutions", type: "Set" },
  { alias: "ss", expansions: ["surging sparks", "silver tempest"], label: "Surging Sparks / Silver Tempest", type: "Set" },
  { alias: "sur spark", expansions: ["surging sparks"], label: "Surging Sparks", type: "Set" },
  { alias: "obs flames", expansions: ["obsidian flames"], label: "Obsidian Flames", type: "Set" },
  { alias: "pal evo", expansions: ["paldea evolved"], label: "Paldea Evolved", type: "Set" },
  { alias: "temp forces", expansions: ["temporal forces"], label: "Temporal Forces", type: "Set" },
  { alias: "twm", expansions: ["twilight masquerade"], label: "Twilight Masquerade", type: "Set" },
  { alias: "mew", expansions: ["scarlet violet 151", "scarlet & violet 151", "mew"], label: "Mew / Scarlet & Violet 151", type: "Set" },
  { alias: "zard", expansions: ["charizard"], label: "Charizard", type: "Pokemon" },
  { alias: "char", expansions: ["charizard"], label: "Charizard", type: "Pokemon" },
  { alias: "pika", expansions: ["pikachu"], label: "Pikachu", type: "Pokemon" },
  { alias: "gren", expansions: ["greninja"], label: "Greninja", type: "Pokemon" },
];

export function cleanCatalogSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/pokémon/gi, "pokemon")
    .trim()
    .replace(/[,%()'"]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 140);
}

export function normalizeCatalogQuery(input) {
  return cleanCatalogSearch(input).toLowerCase().replace(/[&+-]/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function expandCatalogAliases(input) {
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
}

export function detectCatalogSearchMode(input) {
  const normalized = normalizeCatalogQuery(input);
  if (!normalized) return "general";
  if (/^\d{8,}$/.test(normalized)) return "barcode";
  if (/^(tg|gg|svp|h|rc)?\d{1,4}(\/(tg|gg|svp|h|rc)?\d{1,4})?$/i.test(normalized)) return "cardNumber";
  if (/^\d{5,}$/.test(normalized)) return "id";
  if (CATALOG_SEARCH_ALIASES.some((entry) => normalizeCatalogQuery(entry.alias) === normalized || normalized.includes(normalizeCatalogQuery(entry.alias)))) return "shorthand";
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

function applyFilters(query, filters = {}, useBrowseView = true) {
  const {
    productGroup = "All",
    productType = "All",
    setName = "All",
    dataFilter = "All",
    rarity = "All",
  } = filters;

  let next = query.eq("category", "Pokemon");

  if (productGroup === "Cards") next = useBrowseView ? next.eq("catalog_group", "Cards") : next.eq("product_type", "Card");
  if (productGroup === "Sealed") next = useBrowseView ? next.eq("catalog_group", "Sealed") : next.eq("is_sealed", true);
  if (productGroup === "Other" && useBrowseView) next = next.eq("catalog_group", "Other");
  if (productType !== "All") next = next.eq("product_type", productType);
  if (setName !== "All") next = next.eq("set_name", setName);
  if (rarity !== "All") next = next.eq("rarity", rarity);
  if (dataFilter === "Has market price") next = next.gt("market_price", 0);
  if (dataFilter === "Missing price") next = next.or("market_price.is.null,market_price.eq.0");
  if (dataFilter === "Has image") next = next.not("image_url", "is", null).neq("image_url", "");

  return next;
}

function applyTextSearch(query, term) {
  if (term.length < 2) return query;
  const like = `%${term}%`;
  return query.or(TEXT_SEARCH_FIELDS.map((field) => `${field}.ilike.${like}`).join(","));
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
  if (String(values.card || "").toLowerCase() === cleaned) return 4;
  if (String(values.name || "").toLowerCase() === cleaned) return 5;
  if (String(values.name || "").toLowerCase().includes(cleaned)) return 6;
  if (String(product.setName || product.set_name || product.expansion || "").toLowerCase().includes(cleaned)) return 7;
  if (String(product.productType || product.product_type || "").toLowerCase().includes(cleaned)) return 8;
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
  return row.set_name || row.expansion || row.product_line || "";
}

function catalogRowProductType(row = {}) {
  return row.product_type || row.catalog_group || "";
}

function rowMatchesExactId(row = {}, term = "") {
  const cleaned = normalizeCatalogQuery(term);
  if (!cleaned) return "";
  if (normalizeCatalogQuery(row.barcode || row.upc) === cleaned) return "Barcode";
  if (normalizeCatalogQuery(row.tcgplayer_product_id || row.tcgplayerProductId) === cleaned) return "TCGplayer ID";
  if (normalizeCatalogQuery(row.external_product_id || row.externalProductId) === cleaned) return "External ID";
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
  const normalized = normalizeCatalogQuery(input);
  if (!normalized) return [];
  const directMatches = CATALOG_SEARCH_ALIASES.filter((entry) => {
    const alias = normalizeCatalogQuery(entry.alias);
    const label = normalizeCatalogQuery(entry.label);
    return alias.includes(normalized) || normalized.includes(alias) || label.includes(normalized);
  });
  const expandedMatches = expandCatalogAliases(input).map((expansion) => ({
    alias: input,
    expansions: [expansion],
    label: expansion.replace(/\b\w/g, (letter) => letter.toUpperCase()),
    type: "Shorthand",
  }));

  return [...directMatches, ...expandedMatches].slice(0, 5).map((entry, index) => ({
    id: `alias-${normalizeCatalogQuery(entry.alias)}-${index}`,
    section: "Suggested Shorthand",
    type: entry.type || "Shorthand",
    label: entry.label,
    description: `${entry.alias} -> ${entry.expansions.join(" / ")}`,
    badge: "Shorthand",
    searchValue: entry.expansions[0],
    mode: "shorthand",
  }));
}

async function runSearchAgainstSource({ supabase, sourceName, useBrowseView, query, barcode, mode, filters, sort, page, pageSize }) {
  const cleanedQuery = cleanCatalogSearch(query);
  const cleanedBarcode = cleanCatalogSearch(barcode);
  const exactTerm = mode === "barcode" ? cleanedBarcode || cleanedQuery : cleanedQuery || cleanedBarcode;
  const pageOffset = Math.max(0, (page - 1) * pageSize);
  const exactRows = [];
  let exactMiss = false;

  if (exactTerm) {
    let exactQuery = supabase
      .from(sourceName)
      .select("*")
      .limit(pageSize);
    exactQuery = applyFilters(exactQuery, filters, useBrowseView);
    exactQuery = exactQuery.or(EXACT_FIELDS.map((field) => `${field}.eq.${exactTerm}`).join(","));
    const { data, error } = await exactQuery;
    if (error) throw error;
    exactRows.push(...(data || []));
    exactMiss = mode === "barcode" && exactRows.length === 0;
  }

  let broadQuery = supabase
    .from(sourceName)
    .select("*", { count: "exact" });
  broadQuery = applyFilters(broadQuery, filters, useBrowseView);
  broadQuery = applyTextSearch(broadQuery, cleanedQuery || cleanedBarcode);
  broadQuery = applyCatalogDbSort(broadQuery, sort === "bestMatch" ? "bestMatch" : sort, useBrowseView).range(pageOffset, pageOffset + pageSize - 1);
  const { data, error, count } = await broadQuery;
  if (error) throw error;

  const rowsByKey = new Map();
  for (const row of [...exactRows, ...(data || [])]) {
    const key = String(row.id || `${row.market_source || ""}-${row.external_product_id || row.tcgplayer_product_id || row.name}`).toLowerCase();
    if (!rowsByKey.has(key)) rowsByKey.set(key, row);
  }

  const rows = [...rowsByKey.values()]
    .sort((a, b) => {
      if (sort === "bestMatch") {
        return exactPriority(a, exactTerm) - exactPriority(b, exactTerm) || compareCatalogProducts(a, b, "bestMatch");
      }
      return compareCatalogProducts(a, b, sort);
    })
    .slice(0, pageSize);

  return {
    rows,
    count: count ?? rows.length,
    exactCount: exactRows.length,
    exactMiss,
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

  try {
    const result = await runSearchAgainstSource({
      supabase,
      sourceName: "pokemon_catalog_browse",
      useBrowseView: true,
      query,
      barcode,
      mode,
      filters,
      sort,
      page,
      pageSize,
    });
    return { ...result, page, pageSize, hasMore: page * pageSize < result.count, usedFallback: false };
  } catch (error) {
    const result = await runSearchAgainstSource({
      supabase,
      sourceName: "product_catalog",
      useBrowseView: false,
      query,
      barcode,
      mode,
      filters: { ...filters, productGroup: filters.productGroup === "Other" ? "All" : filters.productGroup },
      sort: sort === "bestMatch" ? "recentlyChecked" : sort,
      page,
      pageSize,
    });
    return {
      ...result,
      page,
      pageSize,
      hasMore: page * pageSize < result.count,
      usedFallback: true,
      fallbackReason: error.message,
    };
  }
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

  if (!supabase || (!normalized || (normalized.length < 2 && !["barcode", "id", "cardNumber"].includes(mode)))) {
    return {
      query: cleaned,
      mode,
      suggestions: [],
      usedFallback: false,
    };
  }

  const aliasSuggestions = buildStaticAliasSuggestions(cleaned);
  const expandedTerms = expandCatalogAliases(cleaned);
  const searchTerms = [cleaned, ...expandedTerms].filter(Boolean).slice(0, 4);
  const rowsByKey = new Map();
  let usedFallback = false;

  for (const term of searchTerms) {
    if (rowsByKey.size >= 20) break;
    try {
      const result = await searchPokemonCatalog({
        supabase,
        query: term,
        barcode: ["barcode", "id", "cardNumber"].includes(mode) ? term : "",
        mode: mode === "id" ? "barcode" : mode,
        productGroup,
        dataFilter,
        sort: "bestMatch",
        page: 1,
        pageSize: 10,
        force: true,
      });
      usedFallback = usedFallback || Boolean(result.usedFallback);
      for (const row of result.rows || []) {
        const key = String(row.id || row.external_product_id || row.tcgplayer_product_id || row.barcode || catalogRowTitle(row)).toLowerCase();
        if (!rowsByKey.has(key)) rowsByKey.set(key, row);
      }
    } catch {
      // Recommendation failures should not block the main search box.
    }
  }

  const rows = [...rowsByKey.values()];
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
    "Suggested Shorthand": 7,
  };

  const uniqueSuggestions = dedupeRecommendations(suggestions)
    .sort((a, b) => (order[a.section] || 99) - (order[b.section] || 99))
    .slice(0, limit)
    .map((suggestion) => ({
      ...suggestion,
      product: suggestion.product && mapRow ? mapRow(suggestion.product) : suggestion.product,
    }));

  return {
    query: cleaned,
    mode,
    suggestions: uniqueSuggestions,
    usedFallback,
  };
}
