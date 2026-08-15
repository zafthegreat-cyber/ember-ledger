export function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";
  const normalized = Array.isArray(value)
    ? value.join(" | ")
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  return /[",\r\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
}

export function recordsToCsv(records = [], columns = []) {
  const safeRecords = Array.isArray(records) ? records : [];
  const resolvedColumns = columns.length
    ? columns.map((column) => typeof column === "string" ? { key: column, label: column } : column)
    : Array.from(new Set(safeRecords.flatMap((record) => Object.keys(record || {})))).map((key) => ({ key, label: key }));
  if (!resolvedColumns.length) return "";
  const header = resolvedColumns.map((column) => escapeCsvValue(column.label)).join(",");
  const rows = safeRecords.map((record) => resolvedColumns.map((column) => {
    const raw = typeof column.value === "function" ? column.value(record) : record?.[column.key];
    return escapeCsvValue(raw);
  }).join(","));
  return [header, ...rows].join("\r\n");
}

export const CSV_COLUMNS = {
  deals: ["id", "marketplace", "externalListingId", "listingUrl", "title", "productClassification", "askingPrice", "purchaseShipping", "estimatedTax", "buyerPremium", "status", "confidence", "riskFlags", "dateDiscovered", "auctionEndTime", "notes", "createdAt", "updatedAt"],
  auctions: ["id", "source", "url", "title", "auctionType", "location", "distance", "startDate", "endDateTime", "currentBid", "myMaximumBid", "buyerPremiumPercentage", "taxRate", "taxBase", "fixedFees", "estimatedTravelCost", "estimatedLaborCost", "estimatedDisposalCost", "estimatedResaleLow", "estimatedResaleMid", "estimatedResaleHigh", "riskLevel", "watchStatus", "outcome", "notes"],
  purchases: ["id", "source", "purchaseDate", "originalListing", "totalPurchaseCost", "title", "notes", "createdAt"],
  inventory: ["id", "purchaseId", "lotId", "name", "quantity", "productClassification", "pokemonName", "setName", "cardNumber", "language", "condition", "gradingCompany", "grade", "certificationNumber", "purchaseSource", "purchaseDate", "totalPurchaseCost", "allocatedItemCost", "status", "storageLocation", "intendedSalesChannel", "projectedResaleLow", "projectedResaleMid", "projectedResaleHigh", "notes"],
  sales: ["id", "inventoryItemId", "quantitySold", "salesChannel", "saleDate", "grossSalePrice", "discounts", "sellingFees", "paymentFees", "shippingChargedToBuyer", "actualOutboundShipping", "packaging", "refunds", "otherCosts", "allocatedCostOfGoodsSold", "netProceeds", "realizedProfit", "realizedRoi", "status", "notes"],
  expenses: ["id", "date", "category", "merchant", "description", "amount", "paymentMethod", "businessPercentage", "relatedRecordType", "relatedRecordId", "receiptReference", "notes"],
  mileage: ["id", "date", "startLocation", "destination", "purpose", "miles", "relatedRecordType", "relatedRecordId", "notes"],
};

export function downloadTextFile(filename, contents, mimeType = "text/plain;charset=utf-8") {
  if (typeof document === "undefined" || typeof URL === "undefined") return false;
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}
