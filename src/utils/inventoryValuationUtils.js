import {
  buildInventoryPriceReliabilityExportRows,
  buildPriceReliabilityCards,
  buildPriceReliabilitySummary,
} from "./pricingReliabilityUtils.js";

const UNKNOWN_PURCHASER_LABEL = "Unassigned purchaser";

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toNumber(value, fallback = 0) {
  const cleaned = typeof value === "string" ? value.replace(/[$,%\s,]/g, "") : value;
  const number = Number.parseFloat(cleaned);
  return Number.isFinite(number) ? number : fallback;
}

function hasOwnValue(record = {}, keys = []) {
  return keys.some((key) => {
    const value = record?.[key];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
}

function firstKnownNumber(record = {}, keys = []) {
  for (const key of keys) {
    if (!hasOwnValue(record, [key])) continue;
    const value = toNumber(record[key], NaN);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

export function inventoryQuantity(item = {}) {
  if (hasOwnValue(item, ["quantity", "qty", "ownedQuantity", "forgeQuantity"])) {
    return Math.max(0, toNumber(item.quantity ?? item.qty ?? item.ownedQuantity ?? item.forgeQuantity, 0));
  }
  return 1;
}

export function inventoryPurchaserName(item = {}) {
  return cleanText(item.purchaserName || item.purchaser_name || item.buyer || item.ownerName || "") || UNKNOWN_PURCHASER_LABEL;
}

export function inventoryUnitCost(item = {}) {
  return firstKnownNumber(item, ["unitCost", "unit_cost", "costPaid", "cost_paid", "costEach", "cost_each", "purchasePrice", "purchase_price"]);
}

export function inventoryMarketValueEach(item = {}) {
  return firstKnownNumber(item, ["marketPrice", "market_price", "marketValue", "market_value", "estimatedMarketValue", "estimated_market_value"]);
}

export function inventoryMsrpEach(item = {}) {
  return firstKnownNumber(item, ["msrpPrice", "msrp_price", "msrp", "retailPrice", "retail_price"]);
}

export function inventoryPlannedSaleEach(item = {}) {
  return firstKnownNumber(item, ["salePrice", "sale_price", "plannedSalePrice", "planned_sale_price", "plannedPrice", "planned_price", "listedPrice", "listed_price"]);
}

export function inventoryHasReceipt(item = {}) {
  return Boolean(
    cleanText(item.receiptImage) ||
    cleanText(item.receiptImageUrl) ||
    cleanText(item.receiptUrl) ||
    cleanText(item.receiptId) ||
    cleanText(item.receipt_id) ||
    cleanText(item.receiptReference) ||
    cleanText(item.referenceId)
  );
}

export function inventoryHasPhoto(item = {}) {
  return Boolean(
    cleanText(item.itemImage) ||
    cleanText(item.imageUrl) ||
    cleanText(item.photoUrl) ||
    cleanText(item.image_url) ||
    cleanText(item.displayImage) ||
    cleanText(item.catalogImageUrl) ||
    cleanText(item.productImageUrl)
  );
}

export function inventoryEntries(itemOrEntries = []) {
  if (Array.isArray(itemOrEntries)) return itemOrEntries.filter(Boolean);
  if (Array.isArray(itemOrEntries?.rawItems) && itemOrEntries.rawItems.length) return itemOrEntries.rawItems.filter(Boolean);
  return itemOrEntries ? [itemOrEntries] : [];
}

export function buildInventoryItemValuation(item = {}, { context = "forge" } = {}) {
  const entries = inventoryEntries(item);
  const rows = entries.length ? entries : [item];
  let quantity = 0;
  let costKnownQuantity = 0;
  let marketKnownQuantity = 0;
  let msrpKnownQuantity = 0;
  let plannedKnownQuantity = 0;
  let totalCostBasis = 0;
  let estimatedMarketValue = 0;
  let msrpTotal = 0;
  let plannedSaleTotal = 0;
  let receiptCount = 0;
  let photoCount = 0;
  let missingCostCount = 0;
  let missingMarketValueCount = 0;
  let missingMsrpCount = 0;
  let missingPlannedSalePriceCount = 0;
  let missingReceiptCount = 0;
  let missingPhotoCount = 0;

  rows.forEach((row) => {
    const rowQuantity = inventoryQuantity(row);
    quantity += rowQuantity;

    const unitCost = inventoryUnitCost(row);
    const marketValue = inventoryMarketValueEach(row);
    const msrp = inventoryMsrpEach(row);
    const plannedSale = inventoryPlannedSaleEach(row);
    const hasReceipt = inventoryHasReceipt(row);
    const hasPhoto = inventoryHasPhoto(row);

    if (unitCost !== null) {
      totalCostBasis += rowQuantity * unitCost;
      costKnownQuantity += rowQuantity;
    } else {
      missingCostCount += 1;
    }

    if (marketValue !== null) {
      estimatedMarketValue += rowQuantity * marketValue;
      marketKnownQuantity += rowQuantity;
    } else {
      missingMarketValueCount += 1;
    }

    if (msrp !== null) {
      msrpTotal += rowQuantity * msrp;
      msrpKnownQuantity += rowQuantity;
    } else {
      missingMsrpCount += 1;
    }

    if (plannedSale !== null) {
      plannedSaleTotal += rowQuantity * plannedSale;
      plannedKnownQuantity += rowQuantity;
    } else if (context === "forge") {
      missingPlannedSalePriceCount += 1;
    }

    if (hasReceipt) receiptCount += 1;
    else missingReceiptCount += 1;

    if (hasPhoto) photoCount += 1;
    else missingPhotoCount += 1;
  });

  const estimatedUnrealizedGainLoss = marketKnownQuantity > 0 ? estimatedMarketValue - totalCostBasis : null;
  const estimatedProfitAtPlannedPrice = plannedKnownQuantity > 0 ? plannedSaleTotal - totalCostBasis : null;

  return {
    context,
    recordCount: rows.length,
    totalQuantity: quantity,
    totalCostBasis,
    estimatedMarketValue,
    msrpTotal,
    plannedSaleTotal,
    estimatedUnrealizedGainLoss,
    estimatedProfitAtPlannedPrice,
    averageCostPerItem: costKnownQuantity > 0 ? totalCostBasis / costKnownQuantity : null,
    costKnownQuantity,
    marketKnownQuantity,
    msrpKnownQuantity,
    plannedKnownQuantity,
    receiptCoverage: {
      total: rows.length,
      withReceipt: receiptCount,
      missingReceipt: missingReceiptCount,
    },
    photoCoverage: {
      total: rows.length,
      withPhoto: photoCount,
      missingPhoto: missingPhotoCount,
    },
    missingCostCount,
    missingMarketValueCount,
    missingMsrpCount,
    missingPlannedSalePriceCount,
    missingReceiptCount,
    missingPhotoCount,
  };
}

function addPurchaserTotals(acc, item, valuation) {
  const name = inventoryPurchaserName(item);
  if (!acc.has(name)) {
    acc.set(name, {
      key: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "unassigned",
      name,
      quantity: 0,
      totalCostBasis: 0,
      estimatedMarketValue: 0,
      plannedSaleTotal: 0,
      missingCostCount: 0,
      missingMarketValueCount: 0,
      missingPlannedSalePriceCount: 0,
      records: [],
    });
  }
  const group = acc.get(name);
  group.quantity += valuation.totalQuantity;
  group.totalCostBasis += valuation.totalCostBasis;
  group.estimatedMarketValue += valuation.estimatedMarketValue;
  group.plannedSaleTotal += valuation.plannedSaleTotal;
  group.missingCostCount += valuation.missingCostCount;
  group.missingMarketValueCount += valuation.missingMarketValueCount;
  group.missingPlannedSalePriceCount += valuation.missingPlannedSalePriceCount;
  group.records.push(item);
}

function addLabelCount(acc, key, fallback = "Uncategorized") {
  const label = cleanText(key) || fallback;
  acc[label] = (acc[label] || 0) + 1;
}

export function summarizeInventoryValuation(items = [], { context = "forge", salesSummary = null } = {}) {
  const summary = {
    context,
    itemCount: items.length,
    totalQuantity: 0,
    totalCostBasis: 0,
    estimatedMarketValue: 0,
    msrpTotal: 0,
    plannedSaleTotal: 0,
    estimatedUnrealizedGainLoss: null,
    estimatedProfitAtPlannedPrice: null,
    averageCostPerItem: null,
    costKnownQuantity: 0,
    marketKnownQuantity: 0,
    msrpKnownQuantity: 0,
    plannedKnownQuantity: 0,
    missingCostCount: 0,
    missingMarketValueCount: 0,
    missingMsrpCount: 0,
    missingPlannedSalePriceCount: 0,
    missingReceiptCount: 0,
    missingPhotoCount: 0,
    receiptCoverage: { total: 0, withReceipt: 0, missingReceipt: 0 },
    photoCoverage: { total: 0, withPhoto: 0, missingPhoto: 0 },
    priceReliabilitySummary: null,
    purchaserBreakdown: [],
    topProductTypes: [],
    topSets: [],
    salesSummary,
  };

  const purchaserGroups = new Map();
  const productTypes = {};
  const sets = {};

  items.forEach((item) => {
    const valuation = buildInventoryItemValuation(item, { context });
    summary.totalQuantity += valuation.totalQuantity;
    summary.totalCostBasis += valuation.totalCostBasis;
    summary.estimatedMarketValue += valuation.estimatedMarketValue;
    summary.msrpTotal += valuation.msrpTotal;
    summary.plannedSaleTotal += valuation.plannedSaleTotal;
    summary.costKnownQuantity += valuation.costKnownQuantity;
    summary.marketKnownQuantity += valuation.marketKnownQuantity;
    summary.msrpKnownQuantity += valuation.msrpKnownQuantity;
    summary.plannedKnownQuantity += valuation.plannedKnownQuantity;
    summary.missingCostCount += valuation.missingCostCount;
    summary.missingMarketValueCount += valuation.missingMarketValueCount;
    summary.missingMsrpCount += valuation.missingMsrpCount;
    summary.missingPlannedSalePriceCount += valuation.missingPlannedSalePriceCount;
    summary.missingReceiptCount += valuation.missingReceiptCount;
    summary.missingPhotoCount += valuation.missingPhotoCount;
    summary.receiptCoverage.total += valuation.receiptCoverage.total;
    summary.receiptCoverage.withReceipt += valuation.receiptCoverage.withReceipt;
    summary.receiptCoverage.missingReceipt += valuation.receiptCoverage.missingReceipt;
    summary.photoCoverage.total += valuation.photoCoverage.total;
    summary.photoCoverage.withPhoto += valuation.photoCoverage.withPhoto;
    summary.photoCoverage.missingPhoto += valuation.photoCoverage.missingPhoto;
    addPurchaserTotals(purchaserGroups, item, valuation);
    addLabelCount(productTypes, item.productType || item.product_type || item.category, "Uncategorized");
    addLabelCount(sets, item.setName || item.set_name || item.expansion || item.productLine, "No set");
  });

  summary.estimatedUnrealizedGainLoss = summary.marketKnownQuantity > 0 ? summary.estimatedMarketValue - summary.totalCostBasis : null;
  summary.estimatedProfitAtPlannedPrice = summary.plannedKnownQuantity > 0 ? summary.plannedSaleTotal - summary.totalCostBasis : null;
  summary.averageCostPerItem = summary.costKnownQuantity > 0 ? summary.totalCostBasis / summary.costKnownQuantity : null;
  summary.purchaserBreakdown = [...purchaserGroups.values()]
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
  summary.topProductTypes = Object.entries(productTypes)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 5);
  summary.topSets = Object.entries(sets)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 5);
  summary.priceReliabilitySummary = buildPriceReliabilitySummary(items, { context });

  return summary;
}

export function buildGroupedInventoryValuation(item = {}, options = {}) {
  return buildInventoryItemValuation(item, options);
}

export function formatPurchaserTally(rows = []) {
  return rows
    .filter((row) => Number(row.quantity || 0) > 0)
    .map((row) => `${row.name || UNKNOWN_PURCHASER_LABEL} - ${Number(row.quantity || 0)}`)
    .join(" / ");
}

export function buildInventoryMissingDataPrompts(summary = {}, { context = "forge", includeExport = false } = {}) {
  const prompts = [];
  if (Number(summary.missingCostCount || 0) > 0) {
    prompts.push({ key: "cost", label: "Add cost", count: summary.missingCostCount, tone: "warning" });
  }
  if (Number(summary.missingMarketValueCount || 0) > 0) {
    prompts.push({ key: "market", label: "Review market value", count: summary.missingMarketValueCount, tone: "info" });
  }
  const reliability = summary.priceReliabilitySummary || {};
  if (Number(reliability.stalePriceCount || 0) > 0) {
    prompts.push({ key: "stale-price", label: "Review stale price", count: reliability.stalePriceCount, tone: "warning" });
  }
  if (Number(reliability.manualPriceCount || 0) > 0) {
    prompts.push({ key: "manual-price", label: "Manual price", count: reliability.manualPriceCount, tone: "info" });
  }
  if (context === "forge" && Number(summary.missingPlannedSalePriceCount || 0) > 0) {
    prompts.push({ key: "planned", label: "Add planned sale price", count: summary.missingPlannedSalePriceCount, tone: "warning" });
  }
  if (Number(summary.missingReceiptCount || summary.receiptCoverage?.missingReceipt || 0) > 0) {
    prompts.push({ key: "receipt", label: "Attach receipt", count: summary.missingReceiptCount || summary.receiptCoverage?.missingReceipt, tone: "info" });
  }
  if (Number(summary.missingPhotoCount || summary.photoCoverage?.missingPhoto || 0) > 0) {
    prompts.push({ key: "photo", label: "Add product photo", count: summary.missingPhotoCount || summary.photoCoverage?.missingPhoto, tone: "info" });
  }
  if (context === "forge" && includeExport) {
    prompts.push({ key: "export", label: "Export records", count: 0, tone: "neutral" });
  }
  return prompts;
}

function defaultMoney(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "Unknown";
  return `$${Number(value || 0).toFixed(2)}`;
}

export function buildInventoryInsightCards(summary = {}, { context = "forge", moneyFormatter = defaultMoney } = {}) {
  const money = moneyFormatter;
  const reliabilityCards = buildPriceReliabilityCards(summary.priceReliabilitySummary || { context }).slice(0, context === "forge" ? 2 : 1);
  if (context === "vault") {
    return [
      { key: "quantity", label: "Total items", value: Number(summary.totalQuantity || 0), helper: `${Number(summary.itemCount || 0)} grouped record(s)` },
      { key: "cost", label: "Total cost tracked", value: money(summary.totalCostBasis || 0), helper: `${Number(summary.missingCostCount || 0)} missing cost` },
      { key: "market", label: "Estimated collection value", value: summary.marketKnownQuantity > 0 ? money(summary.estimatedMarketValue || 0) : "Price data unavailable", helper: "Known market values only" },
      { key: "gain", label: "Estimated gain/loss", value: summary.estimatedUnrealizedGainLoss === null ? "Unknown" : money(summary.estimatedUnrealizedGainLoss), helper: "Market value minus tracked cost" },
      { key: "photos", label: "Missing photos", value: Number(summary.missingPhotoCount || 0), helper: "Use clean fallback until added" },
      { key: "purchasers", label: "Purchaser breakdown", value: summary.purchaserBreakdown?.length || 0, helper: formatPurchaserTally((summary.purchaserBreakdown || []).slice(0, 2)) || "No purchasers yet" },
      ...reliabilityCards,
    ];
  }
  return [
    { key: "quantity", label: "Forge quantity", value: Number(summary.totalQuantity || 0), helper: `${Number(summary.itemCount || 0)} grouped record(s)` },
    { key: "cost", label: "Cost basis", value: money(summary.totalCostBasis || 0), helper: `${Number(summary.missingCostCount || 0)} missing cost` },
    { key: "planned", label: "Planned sale total", value: money(summary.plannedSaleTotal || 0), helper: `${Number(summary.missingPlannedSalePriceCount || 0)} missing planned price` },
    { key: "market", label: "Estimated market value", value: money(summary.estimatedMarketValue || 0), helper: `${Number(summary.missingMarketValueCount || 0)} missing market value` },
    { key: "profit", label: "Estimated profit", value: summary.estimatedProfitAtPlannedPrice === null ? "Unknown" : money(summary.estimatedProfitAtPlannedPrice), helper: "At planned sale price, before final sale details" },
    { key: "receipts", label: "Receipt coverage", value: `${Number(summary.receiptCoverage?.withReceipt || 0)}/${Number(summary.receiptCoverage?.total || 0)}`, helper: `${Number(summary.receiptCoverage?.missingReceipt || 0)} missing receipt(s)` },
    ...reliabilityCards,
  ];
}

export function buildInventoryValuationExportRows(summary = {}, { sectionPrefix = "Inventory valuation" } = {}) {
  const rows = [
    { section: sectionPrefix, label: "Total quantity", value: summary.totalQuantity || 0, count: summary.itemCount || 0, notes: "Inventory valuation summary" },
    { section: sectionPrefix, label: "Cost basis", value: summary.totalCostBasis || 0, count: summary.costKnownQuantity || 0, notes: `${summary.missingCostCount || 0} missing cost record(s)` },
    { section: sectionPrefix, label: "Estimated market value", value: summary.estimatedMarketValue || 0, count: summary.marketKnownQuantity || 0, notes: `${summary.missingMarketValueCount || 0} missing market value record(s)` },
    { section: sectionPrefix, label: "MSRP total", value: summary.msrpTotal || 0, count: summary.msrpKnownQuantity || 0, notes: `${summary.missingMsrpCount || 0} missing MSRP record(s)` },
    { section: sectionPrefix, label: "Planned sale total", value: summary.plannedSaleTotal || 0, count: summary.plannedKnownQuantity || 0, notes: `${summary.missingPlannedSalePriceCount || 0} missing planned sale price record(s)` },
    { section: sectionPrefix, label: "Receipt coverage", value: summary.receiptCoverage?.withReceipt || 0, count: summary.receiptCoverage?.total || 0, notes: `${summary.receiptCoverage?.missingReceipt || 0} missing receipt(s)` },
    ...buildInventoryPriceReliabilityExportRows(summary, { sectionPrefix: `${sectionPrefix} price reliability` }),
  ];

  (summary.purchaserBreakdown || []).forEach((row) => {
    rows.push({
      section: `${sectionPrefix} purchaser`,
      label: row.name,
      value: row.totalCostBasis || 0,
      count: row.quantity || 0,
      notes: `Estimated market value ${row.estimatedMarketValue || 0}; planned sale total ${row.plannedSaleTotal || 0}`,
    });
  });

  return rows;
}

export const INVENTORY_VALUATION_COPY = {
  vaultDisclaimer: "Estimated collection value is based only on items with known market values.",
  forgeDisclaimer: "Forge estimates are for planning and record review, not tax advice.",
};
