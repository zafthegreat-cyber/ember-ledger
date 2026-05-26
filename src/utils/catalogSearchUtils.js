import { PRODUCT_TYPE_ALIASES, POKEMON_NAME_ALIASES, RARITY_VARIANT_ALIASES } from "../data/productAliases";
import { getSetByCodeOrAlias } from "../data/pokemonSetCatalog";
import generatedSearchAliases from "../data/generated/searchAliases.json";
import { getProductImageUrl } from "./productDisplayUtils";

const QUERY_EXPANSION_CACHE_LIMIT = 160;
const queryExpansionCache = new Map();
const catalogIndexCache = new WeakMap();

export function normalizeCatalogName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/pok[eé]mon/g, "pokemon")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9/.\s-]/g, " ")
    .replace(/\bcollector s\b/g, "collector")
    .replace(/\bcollectors\b/g, "collector")
    .replace(/\s+/g, " ")
    .trim();
}

export function catalogTokens(value) {
  return normalizeCatalogName(value).split(/\s+/).filter(Boolean);
}

function searchValuesFrom(value) {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(searchValuesFrom);
  if (typeof value === "object") return Object.values(value).flatMap(searchValuesFrom);
  return [value];
}

function compactIdentifier(value) {
  return normalizeCatalogName(value).replace(/[^a-z0-9]/g, "");
}

function identifierVariants(...values) {
  const variants = new Set();
  values.flatMap(searchValuesFrom).forEach((value) => {
    const normalized = normalizeCatalogName(value);
    const compact = compactIdentifier(value);
    const noLeadingZeroes = compact.replace(/^0+/, "");
    [normalized, compact, noLeadingZeroes].forEach((variant) => {
      if (variant && variant.length >= 3) variants.add(variant);
    });
  });
  return [...variants];
}

export function getAliasExpansions(value) {
  const query = normalizeCatalogName(value);
  if (queryExpansionCache.has(query)) return queryExpansionCache.get(query);
  const expansions = new Set([query, ...catalogTokens(query)]);
  const setMatch = getSetByCodeOrAlias(query);
  if (setMatch) {
    expansions.add(normalizeCatalogName(setMatch.name));
    expansions.add(normalizeCatalogName(setMatch.code));
    (setMatch.setAliases || []).forEach((alias) => expansions.add(normalizeCatalogName(alias)));
  }

  [PRODUCT_TYPE_ALIASES, POKEMON_NAME_ALIASES, RARITY_VARIANT_ALIASES].forEach((map) => {
    Object.entries(map).forEach(([canonical, aliases]) => {
      const normalizedAliases = aliases.map(normalizeCatalogName);
      if (normalizedAliases.some((alias) => query.includes(alias) || catalogTokens(query).includes(alias))) {
        expansions.add(normalizeCatalogName(canonical));
        catalogTokens(canonical).forEach((token) => expansions.add(token));
      }
    });
  });

  generatedSearchAliases.forEach((aliasRow) => {
    const alias = normalizeCatalogName(aliasRow.alias);
    if (alias && (query.includes(alias) || catalogTokens(query).includes(alias))) {
      expansions.add(normalizeCatalogName(aliasRow.targetName));
      if (aliasRow.targetId) expansions.add(normalizeCatalogName(aliasRow.targetId));
    }
  });

  const result = [...expansions].filter(Boolean);
  queryExpansionCache.set(query, result);
  if (queryExpansionCache.size > QUERY_EXPANSION_CACHE_LIMIT) {
    queryExpansionCache.delete(queryExpansionCache.keys().next().value);
  }
  return result;
}

function buildCatalogSearchIndex(catalog = []) {
  if (!Array.isArray(catalog)) return [];
  const cached = catalogIndexCache.get(catalog);
  if (cached) return cached;
  const indexed = catalog.map((item) => {
    const fields = [
      item.name,
      item.productName,
      item.product_name,
      item.cleanName,
      item.searchName,
      item.search_name,
      item.cardName,
      item.card_name,
      item.pokemonName,
      item.pokemon_name,
      item.setName,
      item.set_name,
      item.expansion,
      item.expansionDisplayName,
      item.expansion_display_name,
      item.officialExpansionName,
      item.official_expansion_name,
      item.productLine,
      item.product_line,
      item.setCode,
      item.set_code,
      item.cardNumber,
      item.card_number,
      item.productType,
      item.product_type,
      item.sealedProductType,
      item.sealed_product_type,
      item.catalogItemType,
      item.catalog_item_type,
      item.catalogType,
      item.catalog_type,
      item.productKind,
      item.product_kind,
      item.productCategory,
      item.upc,
      item.barcode,
      item.sku,
      item.externalProductId,
      item.external_product_id,
      item.tcgplayerProductId,
      item.tcgplayer_product_id,
      item.identifierSearch,
      item.identifier_search,
      item.retailerSkus,
      item.retailer_skus,
      item.retailerSkusSearch,
      item.retailer_skus_search,
      ...(item.aliases || []),
      ...(item.searchTokens || []),
    ].flatMap(searchValuesFrom).filter(Boolean);
    const sourceText = normalizeCatalogName([
      item.source,
      item.sourceType,
      item.source_type,
      item.imageSource,
      item.imageStatus,
      item.setName,
      item.set_name,
    ].filter(Boolean).join(" "));
    const haystack = normalizeCatalogName(fields.join(" "));
    return {
      item,
      haystack,
      haystackTokens: catalogTokens(haystack),
      exactIds: identifierVariants(item.upc, item.barcode, item.sku, item.externalProductId, item.external_product_id, item.tcgplayerProductId, item.tcgplayer_product_id, item.identifierSearch, item.identifier_search, item.retailerSkus, item.retailer_skus),
      cardNumber: normalizeCatalogName(item.cardNumber || item.card_number),
      setCode: normalizeCatalogName(item.setCode || item.set_code),
      sourceText,
      hasImage: Boolean(getProductImageUrl(item)),
      setSpecific: Boolean(item.setName || item.set_name || item.expansion || item.productLine || item.product_line),
      titleText: normalizeCatalogName([item.name, item.productName, item.cardName].filter(Boolean).join(" ")),
      productTypeText: normalizeCatalogName([
        item.productType,
        item.product_type,
        item.sealedProductType,
        item.sealed_product_type,
        item.catalogGroup,
        item.catalog_group,
      ].filter(Boolean).join(" ")),
    };
  });
  catalogIndexCache.set(catalog, indexed);
  return indexed;
}

function buildCatalogQueryMeta(query) {
  const normalized = normalizeCatalogName(query);
  const tokens = catalogTokens(query);
  return {
    normalized,
    tokens,
    expansions: getAliasExpansions(query),
    queryWantsCodeCard: normalized.includes("code card") || tokens.includes("code"),
  };
}

function indexedItemMayMatch(queryMeta, indexed) {
  const { normalized, tokens, expansions } = queryMeta;
  if (!normalized) return false;
  const compact = compactIdentifier(normalized);
  if (indexed.exactIds.some((id) => id === normalized || id === compact)) return true;
  if (indexed.cardNumber && indexed.cardNumber === normalized) return true;
  if (indexed.setCode && tokens.includes(indexed.setCode)) return true;
  if (normalized.length > 3 && indexed.haystack.includes(normalized)) return true;
  if (tokens.length && tokens.every((token) => catalogTokenMatches(indexed, token))) return true;
  return expansions.some((term) => term && indexed.haystack.includes(term));
}

function levenshteinWithin(a = "", b = "", maxDistance = 1) {
  if (!a || !b) return false;
  if (Math.abs(a.length - b.length) > maxDistance) return false;
  if (a === b) return true;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previousDiagonal = previous[0];
    previous[0] = i;
    let rowMin = previous[0];
    for (let j = 1; j <= b.length; j += 1) {
      const temp = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        previousDiagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      previousDiagonal = temp;
      rowMin = Math.min(rowMin, previous[j]);
    }
    if (rowMin > maxDistance) return false;
  }
  return previous[b.length] <= maxDistance;
}

function catalogTokenMatches(indexed, token) {
  if (!token) return false;
  if (indexed.haystack.includes(token)) return true;
  if (token.length < 5) return false;
  const maxDistance = token.length > 8 ? 2 : 1;
  return (indexed.haystackTokens || catalogTokens(indexed.haystack)).some((candidate) =>
    candidate.length >= 4 && levenshteinWithin(token, candidate, maxDistance)
  );
}

function scoreIndexedCatalogItem(queryMeta, indexed) {
  const { normalized, tokens, expansions, queryWantsCodeCard } = queryMeta;
  const { item, haystack } = indexed;

  const compact = compactIdentifier(normalized);
  if (indexed.exactIds.some((id) => id === normalized || id === compact)) {
    return { item, score: 1000, reason: "Exact UPC/SKU/barcode match" };
  }
  if (indexed.cardNumber && indexed.cardNumber === normalized) {
    return { item, score: 940, reason: "Exact card number match" };
  }
  if (indexed.setCode && tokens.includes(indexed.setCode)) {
    return { item, score: 760, reason: "Set code match" };
  }

  let score = 0;
  if (normalized.length > 3 && haystack.includes(normalized)) {
    score += 900;
  }
  expansions.forEach((term) => {
    if (!term) return;
    if (haystack === term) score += 220;
    else if (haystack.includes(term)) score += term.length > 2 ? 80 : 25;
  });
  tokens.forEach((token) => {
    if (haystack.includes(token)) score += token.length > 2 ? 35 : 10;
    else if (catalogTokenMatches(indexed, token)) score += token.length > 5 ? 18 : 8;
  });
  if (score > 0) {
    const genericPlaceholder =
      !indexed.hasImage &&
      /recovery|placeholder|assorted|image unavailable|image needed/.test(indexed.sourceText);
    const looksLikeCodeCard = indexed.titleText.includes("code card") || indexed.productTypeText.includes("code card");
    if (indexed.hasImage) score += 48;
    if (indexed.setSpecific && !/assorted/.test(indexed.sourceText)) score += 18;
    if (expansions.some((term) => term.length > 2 && indexed.productTypeText.includes(term))) score += 120;
    if (genericPlaceholder && !normalized.includes("back to school")) score -= 72;
    if (looksLikeCodeCard && !queryWantsCodeCard) score -= 520;
  }

  return { item, score, reason: score >= 160 ? "Alias/shorthand match" : score > 0 ? "Partial catalog match" : "" };
}

export function scoreCatalogItem(query, item) {
  const { score, reason } = scoreIndexedCatalogItem(buildCatalogQueryMeta(query), buildCatalogSearchIndex([item])[0]);
  return { score, reason };
}

export function searchCatalog(query, catalog = [], limit = 24) {
  const queryMeta = buildCatalogQueryMeta(query);
  if (!queryMeta.normalized) return [];
  const indexedCatalog = buildCatalogSearchIndex(catalog);
  return indexedCatalog
    .filter((indexed) => indexedItemMayMatch(queryMeta, indexed))
    .map((indexed) => scoreIndexedCatalogItem(queryMeta, indexed))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
