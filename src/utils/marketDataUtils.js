import { normalizeCatalogName } from "./catalogSearchUtils";

export function findMarketPriceForProduct(product = {}, marketData = []) {
  return marketData.find((price) =>
    price.itemType !== "card" &&
    [price.productId, price.tcgplayerProductId, price.upc, price.sku, normalizeCatalogName(price.name)]
      .filter(Boolean)
      .some((value) => [product.productId, product.id, product.tcgplayerProductId, product.upc, product.barcode, product.sku, normalizeCatalogName(product.name || product.productName)].includes(value))
  );
}

export function findMarketPriceForCard(card = {}, marketData = []) {
  return marketData.find((price) =>
    price.itemType === "card" &&
    [price.cardId, price.productId, price.cardNumber, normalizeCatalogName(price.name)]
      .filter(Boolean)
      .some((value) => [card.cardId, card.id, card.tcgplayerProductId, card.cardNumber, normalizeCatalogName(card.name || card.cardName)].includes(value))
  );
}

export function estimateMarketConfidence(item = {}, priceData = {}) {
  if (!priceData) return "Missing";
  if (priceData.source === "live") return "Live";
  if (priceData.source === "cached") return "Cached";
  if (priceData.source === "manual") return "Manual";
  if (item.sourceType === "mock" || priceData.source === "mock") return "Mock";
  return priceData.confidence || "Beta";
}

export function updateCatalogMarketPrice(itemId, itemType, priceData = {}, catalog = []) {
  const now = new Date().toISOString();
  return catalog.map((item) => {
    const matches = String(item.id || item.productId || item.cardId) === String(itemId);
    if (!matches) return item;
    return {
      ...item,
      catalogType: item.catalogType || itemType,
      marketPrice: Number(priceData.marketPrice || item.marketPrice || 0),
      lowPrice: Number(priceData.lowPrice || item.lowPrice || 0),
      midPrice: Number(priceData.midPrice || priceData.marketPrice || item.midPrice || 0),
      highPrice: Number(priceData.highPrice || item.highPrice || 0),
      msrpPrice: Number(priceData.msrp || item.msrpPrice || 0),
      marketSource: priceData.source || item.marketSource || "Manual",
      marketLastUpdated: priceData.priceDate || now,
      lastMarketUpdate: priceData.priceDate || now,
      marketConfidenceLevel: estimateMarketConfidence(item, priceData),
    };
  });
}

export function importMarketPricesFromCsv(csvText = "") {
  const lines = String(csvText).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line, index) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const get = (name, fallback = "") => {
      const pos = headers.findIndex((header) => header.includes(name));
      return pos >= 0 ? cells[pos] : fallback;
    };
    return {
      priceId: `import-price-${Date.now()}-${index}`,
      productId: get("product"),
      itemType: get("type", "sealed"),
      source: get("source", "manual"),
      marketPrice: Number(get("market", 0)),
      lowPrice: Number(get("low", 0)),
      midPrice: Number(get("mid", get("market", 0))),
      highPrice: Number(get("high", 0)),
      msrp: Number(get("msrp", 0)),
      priceDate: get("date", new Date().toISOString()),
      confidence: get("confidence", "Manual"),
    };
  });
}
