import { normalizeCatalogName, searchCatalog } from "./catalogSearchUtils";

export function normalizeScanInput(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function itemUpc(item) {
  return normalizeScanInput(item.upc || item.barcode || item.productUpc);
}

function itemSku(item) {
  return normalizeScanInput(item.sku || item.externalProductId || item.tcgplayerProductId);
}

export function matchUpcToProduct(upc, catalog = []) {
  const normalized = normalizeScanInput(upc);
  if (!normalized) return [];
  return catalog
    .filter((item) => item.catalogType !== "card" && itemUpc(item) === normalized)
    .map((item) => ({ item, score: 1000, matchType: "upc", confidence: 0.99 }));
}

export function matchSkuToProduct(sku, catalog = []) {
  const normalized = normalizeScanInput(sku);
  if (!normalized) return [];
  return catalog
    .filter((item) => item.catalogType !== "card" && itemSku(item) === normalized)
    .map((item) => ({ item, score: 920, matchType: "sku", confidence: 0.9 }));
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
  if (match.matchType === "upc") return "Exact UPC/barcode match.";
  if (match.matchType === "sku") return "Exact SKU/product ID match.";
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
