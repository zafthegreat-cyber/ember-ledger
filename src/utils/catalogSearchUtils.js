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
      item.cleanName,
      item.searchName,
      item.search_name,
      item.cardName,
      item.pokemonName,
      item.setName,
      item.setCode,
      item.cardNumber,
      item.productType,
      item.productCategory,
      item.upc,
      item.barcode,
      item.sku,
      ...(item.aliases || []),
      ...(item.searchTokens || []),
    ].filter(Boolean);
    const sourceText = normalizeCatalogName([
      item.source,
      item.sourceType,
      item.source_type,
      item.imageSource,
      item.imageStatus,
      item.setName,
      item.set_name,
    ].filter(Boolean).join(" "));
    return {
      item,
      haystack: normalizeCatalogName(fields.join(" ")),
      exactIds: [item.upc, item.barcode, item.sku].filter(Boolean).map(normalizeCatalogName),
      cardNumber: normalizeCatalogName(item.cardNumber),
      setCode: normalizeCatalogName(item.setCode),
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
  if (indexed.exactIds.some((id) => id === normalized)) return true;
  if (indexed.cardNumber && indexed.cardNumber === normalized) return true;
  if (indexed.setCode && tokens.includes(indexed.setCode)) return true;
  if (normalized.length > 3 && indexed.haystack.includes(normalized)) return true;
  return expansions.some((term) => term && indexed.haystack.includes(term));
}

function scoreIndexedCatalogItem(queryMeta, indexed) {
  const { normalized, tokens, expansions, queryWantsCodeCard } = queryMeta;
  const { item, haystack } = indexed;

  if (indexed.exactIds.some((id) => id === normalized)) {
    return { score: 1000, reason: "Exact UPC/SKU/barcode match" };
  }
  if (indexed.cardNumber && indexed.cardNumber === normalized) {
    return { score: 940, reason: "Exact card number match" };
  }
  if (indexed.setCode && tokens.includes(indexed.setCode)) {
    return { score: 760, reason: "Set code match" };
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
