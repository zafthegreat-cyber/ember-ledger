import { catalogCardQueryMatchesRow, getCatalogCollectorQuery } from "./catalogResultIdentity.mjs";

const normalizedTitle = value => String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

export function getMarketResultMatchLabel(query, product = {}) {
  const title = product.name || product.productName || product.cardName || "";
  const collector = getCatalogCollectorQuery(query);
  if (collector && catalogCardQueryMatchesRow(query, product)) {
    const nameWords = new Set(normalizedTitle(title).split(" "));
    return collector.requiredWords.some(word => nameWords.has(word)) ? "Name and collector number match" : "Collector number match";
  }
  return normalizedTitle(query) && normalizedTitle(query) === normalizedTitle(title) ? "Name match" : "Catalog suggestion";
}

export function buildManualMarketDraft(query) {
  const text = String(query || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 140);
  const explicitIdentifier = /^(?:upc|ean|gtin|sku)\s*[:#]?\s*([a-z0-9-]{3,80})$/i.exec(text);
  return {
    itemName: text,
    catalogSearchQuery: text,
    upcSku: explicitIdentifier?.[1] || (/^\d{8,14}$/.test(text) ? text : ""),
  };
}

export function getMarketQuoteContext(product = {}, info = {}) {
  const timestamp = info.marketDataUpdatedAt || product.lastPriceChecked || product.marketLastUpdated || "";
  const date = new Date(timestamp);
  const currency = String(product.marketCurrency || product.priceCurrency || product.currency || "").toUpperCase();
  return {
    source: info.sourceName || product.marketSource || product.sourceName || "Source not supplied",
    asOf: timestamp && Number.isFinite(date.getTime()) ? date.toISOString() : "",
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "",
    condition: product.condition || "Condition not specified",
    printing: product.variant || product.priceSubtype || "Printing not specified",
  };
}

export function formatMarketQuoteValue(product = {}, info = {}) {
  const value = Number(info.currentMarketValue ?? product.marketValue ?? product.marketPrice);
  if (!Number.isFinite(value) || value <= 0) return "Value unknown";
  const { currency } = getMarketQuoteContext(product, info);
  if (currency) return new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "code" }).format(value);
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}
