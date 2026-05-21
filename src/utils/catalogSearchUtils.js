import { PRODUCT_TYPE_ALIASES, POKEMON_NAME_ALIASES, RARITY_VARIANT_ALIASES } from "../data/productAliases";
import { getSetByCodeOrAlias } from "../data/pokemonSetCatalog";
import generatedSearchAliases from "../data/generated/searchAliases.json";
import { getProductImageUrl } from "./productDisplayUtils";

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

  return [...expansions].filter(Boolean);
}

export function scoreCatalogItem(query, item) {
  const normalized = normalizeCatalogName(query);
  const tokens = catalogTokens(query);
  const expansions = getAliasExpansions(query);
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
  const haystack = normalizeCatalogName(fields.join(" "));

  if ([item.upc, item.barcode, item.sku].filter(Boolean).some((id) => normalizeCatalogName(id) === normalized)) {
    return { score: 1000, reason: "Exact UPC/SKU/barcode match" };
  }
  if (item.cardNumber && normalizeCatalogName(item.cardNumber) === normalized) {
    return { score: 940, reason: "Exact card number match" };
  }
  if (item.setCode && tokens.includes(normalizeCatalogName(item.setCode))) {
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
    const sourceText = normalizeCatalogName([
      item.source,
      item.sourceType,
      item.source_type,
      item.imageSource,
      item.imageStatus,
      item.setName,
      item.set_name,
    ].filter(Boolean).join(" "));
    const hasImage = Boolean(getProductImageUrl(item));
    const genericPlaceholder =
      !hasImage &&
      /recovery|placeholder|assorted|image unavailable|image needed/.test(sourceText);
    const setSpecific = Boolean(item.setName || item.set_name || item.expansion || item.productLine || item.product_line);
    const titleText = normalizeCatalogName([item.name, item.productName, item.cardName].filter(Boolean).join(" "));
    const productTypeText = normalizeCatalogName([
      item.productType,
      item.product_type,
      item.sealedProductType,
      item.sealed_product_type,
      item.catalogGroup,
      item.catalog_group,
    ].filter(Boolean).join(" "));
    const queryWantsCodeCard = normalized.includes("code card") || tokens.includes("code");
    const looksLikeCodeCard = titleText.includes("code card") || productTypeText.includes("code card");
    if (hasImage) score += 48;
    if (setSpecific && !/assorted/.test(sourceText)) score += 18;
    if (expansions.some((term) => term.length > 2 && productTypeText.includes(term))) score += 120;
    if (genericPlaceholder && !normalized.includes("back to school")) score -= 72;
    if (looksLikeCodeCard && !queryWantsCodeCard) score -= 520;
  }

  return { score, reason: score >= 160 ? "Alias/shorthand match" : score > 0 ? "Partial catalog match" : "" };
}

export function searchCatalog(query, catalog = [], limit = 24) {
  if (!normalizeCatalogName(query)) return [];
  return catalog
    .map((item) => ({ item, ...scoreCatalogItem(query, item) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
