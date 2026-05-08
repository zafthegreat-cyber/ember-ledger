import { normalizeCatalogName } from "../utils/catalogSearchUtils";

export function matchExternalProductId(product = {}, externalProducts = []) {
  const ids = [product.externalSourceId, product.externalProductId, product.tcgplayerProductId, product.upc, product.barcode, product.sku]
    .filter(Boolean)
    .map(String);
  const exactId = externalProducts.find((external) =>
    [external.externalId, external.productId, external.tcgplayerProductId, external.upc, external.barcode, external.sku]
      .filter(Boolean)
      .map(String)
      .some((id) => ids.includes(id))
  );
  if (exactId) return { match: exactId, confidenceScore: 98, reason: "Exact external ID / UPC / SKU match" };

  const name = normalizeCatalogName(product.name || product.productName);
  const setName = normalizeCatalogName(product.setName || product.expansion);
  const productType = normalizeCatalogName(product.productType);
  const exactName = externalProducts.find((external) =>
    normalizeCatalogName(external.name || external.productName) === name &&
    (!setName || normalizeCatalogName(external.setName) === setName) &&
    (!productType || normalizeCatalogName(external.productType) === productType)
  );
  if (exactName) return { match: exactName, confidenceScore: 90, reason: "Exact product name + set/type match" };

  const fuzzy = externalProducts.find((external) => {
    const haystack = normalizeCatalogName(`${external.name || external.productName} ${external.setName} ${external.productType}`);
    return name && name.split(" ").filter((token) => token.length > 2).every((token) => haystack.includes(token));
  });
  return fuzzy
    ? { match: fuzzy, confidenceScore: 62, reason: "Fuzzy product name match - needs review" }
    : { match: null, confidenceScore: 0, reason: "No external product match found" };
}

export function matchExternalCardId(card = {}, externalCards = []) {
  const ids = [card.externalSourceId, card.externalProductId, card.tcgplayerProductId, card.cardId]
    .filter(Boolean)
    .map(String);
  const exactId = externalCards.find((external) =>
    [external.externalId, external.cardId, external.productId, external.tcgplayerProductId].filter(Boolean).map(String).some((id) => ids.includes(id))
  );
  if (exactId) return { match: exactId, confidenceScore: 98, reason: "Exact external card ID match" };

  const cardNumber = normalizeCatalogName(card.cardNumber);
  const setCode = normalizeCatalogName(card.setCode);
  const exactNumber = externalCards.find((external) =>
    cardNumber &&
    normalizeCatalogName(external.cardNumber) === cardNumber &&
    (!setCode || normalizeCatalogName(external.setCode) === setCode)
  );
  if (exactNumber) return { match: exactNumber, confidenceScore: 92, reason: "Exact card number + set code match" };

  const name = normalizeCatalogName(card.name || card.cardName);
  const setName = normalizeCatalogName(card.setName || card.expansion);
  const exactName = externalCards.find((external) =>
    normalizeCatalogName(external.name || external.cardName) === name &&
    (!setName || normalizeCatalogName(external.setName) === setName)
  );
  if (exactName) return { match: exactName, confidenceScore: 86, reason: "Exact card name + set match" };

  return { match: null, confidenceScore: 0, reason: "No external card match found" };
}

export function syncPokemonTcgPrices(catalog = []) {
  const now = new Date().toISOString();
  const prices = catalog
    .filter((item) => item.catalogType === "card" && Number(item.marketPrice || item.marketValueNearMint || item.marketValueRaw || 0) > 0)
    .map((item) => ({
      catalogItemId: item.id,
      catalogType: "card",
      externalSource: item.externalSourceId ? "Pokemon TCG API / Scrydex" : "Pokemon TCG local cached structure",
      externalId: item.externalSourceId || item.cardId || item.tcgplayerProductId || item.id,
      sourceUrl: item.sourceUrl || item.marketUrl || "",
      priceType: "market",
      condition: item.condition || "Near Mint",
      variant: item.variant || "",
      currency: "USD",
      marketPrice: Number(item.marketValueNearMint || item.marketPrice || item.marketValueRaw || 0),
      lowPrice: Number(item.lowPrice || 0),
      midPrice: Number(item.midPrice || item.marketValueNearMint || item.marketPrice || 0),
      highPrice: Number(item.highPrice || item.marketValueGraded || 0),
      timestamp: now,
      marketStatus: item.sourceType === "live" ? "live" : item.sourceType === "manual" ? "manual" : item.sourceType === "mock" ? "mock" : "cached",
      confidenceScore: item.externalSourceId || item.cardId ? 78 : 58,
    }));
  return { prices, failedMatches: [] };
}

export function syncTcgCsvProductPrices(catalog = []) {
  const now = new Date().toISOString();
  const failedMatches = [];
  const prices = catalog
    .filter((item) => item.catalogType !== "card")
    .map((item) => {
      const price = Number(item.marketPrice || item.marketValue || item.midPrice || 0);
      if (!price) {
        failedMatches.push({
          catalogItemId: item.id,
          name: item.name || item.productName,
          catalogType: "sealed",
          reason: "No local TCGCSV/manual price available yet",
          needsReview: true,
        });
        return null;
      }
      return {
        catalogItemId: item.id,
        catalogType: "sealed",
        externalSource: item.tcgplayerProductId ? "TCGCSV / TCGplayer product" : "TCGCSV local cached structure",
        externalId: item.tcgplayerProductId || item.externalSourceId || item.externalProductId || item.upc || item.barcode || item.id,
        sourceUrl: item.sourceUrl || item.marketUrl || "",
        priceType: "market",
        currency: "USD",
        marketPrice: price,
        lowPrice: Number(item.lowPrice || 0),
        midPrice: Number(item.midPrice || price || 0),
        highPrice: Number(item.highPrice || 0),
        timestamp: now,
        marketStatus: item.sourceType === "live" ? "live" : item.sourceType === "manual" ? "manual" : item.sourceType === "mock" ? "mock" : "cached",
        confidenceScore: item.upc || item.barcode || item.tcgplayerProductId ? 76 : 55,
      };
    })
    .filter(Boolean);
  return { prices, failedMatches };
}
