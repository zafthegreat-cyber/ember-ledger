import { normalizeCatalogName, searchCatalog } from "./catalogSearchUtils";

export function normalizeScanInput(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[^\w]+/g, "");
}

function scanVariants(value) {
  const normalized = normalizeScanInput(value);
  if (!normalized) return [];
  const withoutLeadingZeroes = normalized.replace(/^0+/, "");
  return [...new Set([normalized, withoutLeadingZeroes].filter(Boolean))];
}

function normalizeIdentifierType(value) {
  return String(value || "").trim().toUpperCase();
}

function productIdentifiers(item = {}) {
  const explicit = Array.isArray(item.identifiers) ? item.identifiers : [];
  const fallback = [
    item.upc || item.barcode ? { identifierType: "UPC", identifierValue: item.upc || item.barcode, confidence: "imported" } : null,
    item.sku ? { identifierType: "RETAILER_SKU", identifierValue: item.sku, confidence: "imported" } : null,
    item.externalProductId ? { identifierType: "OTHER", identifierValue: item.externalProductId, confidence: "imported" } : null,
    item.tcgplayerProductId ? { identifierType: "TCGPLAYER_PRODUCT_ID", identifierValue: item.tcgplayerProductId, confidence: "imported" } : null,
  ].filter(Boolean);
  const fromSearch = String(item.identifierSearch || "")
    .split(/[,\s|]+/)
    .map((identifierValue) => ({ identifierType: "OTHER", identifierValue, confidence: "imported" }))
    .filter((entry) => entry.identifierValue);
  return [...explicit, ...fallback, ...fromSearch]
    .map((identifier) => ({
      type: normalizeIdentifierType(identifier.identifierType || identifier.identifier_type || identifier.type || identifier.label),
      value: identifier.identifierValue || identifier.identifier_value || identifier.value || "",
      source: identifier.source || identifier.retailer || "",
      confidence: identifier.confidence || identifier.status || "",
      isVerified: Boolean(identifier.isVerified || identifier.is_verified || /verified/i.test(String(identifier.confidence || identifier.status || ""))),
    }))
    .filter((identifier) => identifier.value);
}

function identifierMatches(input, identifierValue) {
  const lookup = scanVariants(input);
  const candidate = scanVariants(identifierValue);
  return lookup.some((value) => candidate.includes(value));
}

export function matchUpcToProduct(upc, catalog = []) {
  const normalized = normalizeScanInput(upc);
  if (!normalized) return [];
  const upcTypes = new Set(["UPC", "EAN", "GTIN"]);
  return catalog
    .flatMap((item) => productIdentifiers(item)
      .filter((identifier) => upcTypes.has(identifier.type) && identifierMatches(normalized, identifier.value))
      .map((identifier) => ({
        item,
        score: identifier.isVerified ? 1200 : 1080,
        matchType: "upc",
        confidence: identifier.isVerified ? 0.99 : 0.93,
        identifier,
      })));
}

export function matchSkuToProduct(sku, catalog = []) {
  const normalized = normalizeScanInput(sku);
  if (!normalized) return [];
  const skuTypes = new Set([
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
  ]);
  return catalog
    .flatMap((item) => productIdentifiers(item)
      .filter((identifier) => skuTypes.has(identifier.type) && identifierMatches(normalized, identifier.value))
      .map((identifier) => ({
        item,
        score: identifier.isVerified ? 1030 : 940,
        matchType: "sku",
        confidence: identifier.isVerified ? 0.94 : 0.86,
        identifier,
      })));
}

export function matchCardNumberToCard(cardNumber, setCode, catalog = []) {
  const normalizedNumber = normalizeCatalogName(cardNumber);
  const normalizedSet = normalizeCatalogName(setCode);
  if (!normalizedNumber) return [];
  return catalog
    .filter((item) => item.catalogType === "card")
    .filter((item) => normalizeCatalogName(item.cardNumber) === normalizedNumber)
    .filter((item) => !normalizedSet || normalizeCatalogName(item.setCode) === normalizedSet || normalizeCatalogName(item.setName).includes(normalizedSet))
    .map((item) => ({ item, score: normalizedSet ? 980 : 880, matchType: "card-number", confidence: normalizedSet ? 0.97 : 0.82 }));
}

export function matchProductByAlias(input, catalog = []) {
  return searchCatalog(input, catalog, 12).map((result) => ({
    item: result.item,
    score: result.score,
    matchType: "alias",
    confidence: Math.min(0.88, Math.max(0.35, result.score / 500)),
    reason: result.reason,
  }));
}

export function calculateMatchConfidence(match) {
  if (!match) return 0;
  if (typeof match.confidence === "number") return Math.round(match.confidence * 100);
  return Math.min(99, Math.round(Number(match.score || 0) / 10));
}

export function explainCatalogMatch(match) {
  if (!match) return "No catalog match yet.";
  if (match.matchType === "upc") return match.identifier?.isVerified ? "Verified UPC/EAN/GTIN match." : "Exact UPC/EAN/GTIN match, needs review.";
  if (match.matchType === "sku") return match.identifier?.type ? `Exact ${match.identifier.type.replaceAll("_", " ")} match.` : "Exact SKU/product ID match.";
  if (match.matchType === "card-number") return "Exact card number match.";
  return match.reason || "Best alias/name match.";
}

export function getBestCatalogMatches(input, catalog = []) {
  const normalized = normalizeScanInput(input);
  const cardNumberLike = /[a-z]*\d+[a-z]*\/?[a-z]*\d*/i.test(String(input || ""));
  const matches = [
    ...matchUpcToProduct(normalized, catalog),
    ...matchSkuToProduct(normalized, catalog),
    ...(cardNumberLike ? matchCardNumberToCard(input, "", catalog) : []),
    ...matchProductByAlias(input, catalog),
  ];
  const seen = new Set();
  return matches
    .sort((a, b) => b.score - a.score)
    .filter((match) => {
      const id = match.item.id || match.item.productId || match.item.cardId || match.item.name;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((match) => ({
      ...match,
      confidencePercent: calculateMatchConfidence(match),
      explanation: explainCatalogMatch(match),
    }));
}
