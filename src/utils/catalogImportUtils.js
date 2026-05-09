import { normalizeCatalogName } from "./catalogSearchUtils";

export const CATALOG_IMPORT_SOURCES = [
  "Pokemon TCG API / Scrydex cards JSON",
  "TCGdex cards/sets JSON",
  "TCGCSV products/prices CSV",
  "Official Pokemon product CSV",
  "Manual beta CSV",
];

export function normalizeImportedCatalogItem(row = {}, source = "manual") {
  const name = row.name || row.productName || row.cardName || row.product_name || row.card_name || "";
  const catalogType = row.catalogType || row.catalog_type || (row.cardNumber || row.card_number ? "card" : "sealed");
  return {
    ...row,
    id: row.id || row.productId || row.cardId || `${catalogType}-${normalizeCatalogName(name).replace(/\s+/g, "-")}`,
    catalogType,
    name,
    productName: catalogType === "card" ? "" : name,
    cardName: catalogType === "card" ? name : "",
    normalizedName: normalizeCatalogName(name),
    setName: row.setName || row.set_name || row.expansion || "",
    setCode: row.setCode || row.set_code || "",
    productType: row.productType || row.product_type || "",
    cardNumber: row.cardNumber || row.card_number || "",
    cardNumberPrefix: row.cardNumberPrefix || row.card_number_prefix || "",
    cardNumberSuffix: row.cardNumberSuffix || row.card_number_suffix || "",
    cardNumberSort: row.cardNumberSort ?? row.card_number_sort ?? null,
    printedTotal: row.printedTotal ?? row.printed_total ?? null,
    rarity: row.rarity || "",
    upc: row.upc || row.barcode || "",
    barcode: row.barcode || row.upc || "",
    sku: row.sku || "",
    marketPrice: Number(row.marketPrice || row.market_price || 0),
    msrpPrice: Number(row.msrpPrice || row.msrp || 0),
    source,
    sourceType: row.sourceType || source,
    lastUpdated: row.lastUpdated || new Date().toISOString(),
  };
}

export function mergeImportedCatalogData(existingCatalog = [], importedCatalog = []) {
  const byKey = new Map();
  existingCatalog.forEach((item) => {
    const key = String(item.id || `${item.catalogType}-${item.name}-${item.setName}-${item.cardNumber || item.productType}`).toLowerCase();
    byKey.set(key, item);
  });
  importedCatalog.forEach((item) => {
    const normalized = normalizeImportedCatalogItem(item, item.source || "import");
    const key = String(normalized.id || `${normalized.catalogType}-${normalized.name}-${normalized.setName}-${normalized.cardNumber || normalized.productType}`).toLowerCase();
    byKey.set(key, { ...(byKey.get(key) || {}), ...normalized });
  });
  return [...byKey.values()];
}

export function flagCatalogDuplicates(catalog = []) {
  const seenUpc = new Map();
  const seenNames = new Map();
  const duplicates = [];
  catalog.forEach((item) => {
    const upc = item.upc || item.barcode;
    const nameKey = normalizeCatalogName(`${item.catalogType} ${item.name || item.productName || item.cardName} ${item.setName} ${item.productType || item.cardNumber}`);
    if (upc) {
      if (seenUpc.has(upc)) duplicates.push({ type: "duplicate_upc", value: upc, items: [seenUpc.get(upc), item] });
      seenUpc.set(upc, item);
    }
    if (seenNames.has(nameKey)) duplicates.push({ type: "duplicate_name", value: nameKey, items: [seenNames.get(nameKey), item] });
    seenNames.set(nameKey, item);
  });
  return duplicates;
}

export function validateCatalogImport(catalog = []) {
  return catalog.flatMap((item) => {
    const warnings = [];
    if (!(item.id || item.productId || item.cardId)) warnings.push("missing productId/cardId");
    if (!(item.name || item.productName || item.cardName)) warnings.push("missing name");
    if (item.catalogType !== "card" && !item.productType) warnings.push("missing category");
    if (!item.source && !item.sourceType) warnings.push("missing source");
    if (Number(item.marketPrice || item.marketValue || 0) <= 0) warnings.push("missing price");
    return warnings.map((warning) => ({ warning, item }));
  });
}
