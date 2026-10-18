const text = (value) => String(value ?? "").trim();
const words = (value) => text(value).replaceAll("_", " ").toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());

export function orderBrowserRows(records = [], kind = "purchase") {
  return records.map((record) => {
    const inventory = kind === "inventory";
    const receipt = kind === "receipt";
    const retailer = text(record.retailerLabel || record.vendorName || record.vendorLabel || record.retailerId || record.vendorId) || "Retailer not recorded";
    const order = text(record.externalOrderId || record.externalReferenceId || record.orderId);
    const items = record.lineItems || record.items || [];
    const title = inventory ? text(record.title || record.productTitle || record.name || record.productReference) || "Inventory item" : retailer;
    const status = receipt ? record.savedStatus || "REVIEW_NEEDED" : inventory ? record.inventoryDispositionState || record.condition || "UNKNOWN" : kind === "draft" ? record.status || record.reviewState || "DRAFT" : record.receivingStatus || record.status || "NOT_RECEIVED";
    const amount = record.total || record.money?.total || record.moneySummary?.total || record.grandTotal || record.money?.grandTotal || record.moneySummary?.grandTotal || (receipt && Number.isSafeInteger(record.totalMinorUnits) && record.currency ? { minorUnits: record.totalMinorUnits, currency: record.currency } : null);
    const date = record.purchasedAt || record.orderedAt || record.orderDate || record.purchaseDate || (inventory ? record.updatedAt : "") || "";
    return {
      id: text(record.id || record.sourceId), record, title, retailer, order, date, amount,
      status, statusLabel: words(status), subtitle: order || (inventory ? text(record.purchaseId) : "Order number not recorded"),
      itemCount: items.length,
      searchText: [title, retailer, order, record.id, record.sourceId, record.purchaseId, record.productTitle, record.productReference, ...items.flatMap((item) => [item.title, item.description, item.sku, item.tcin, item.upc, item.productReference])].map(text).join(" ").toLocaleLowerCase(),
    };
  });
}

export function filterOrderRows(rows, { query = "", retailer = "", status = "" } = {}) {
  const terms = text(query).toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => (!retailer || row.retailer === retailer) && (!status || row.status === status) && terms.every((term) => row.searchText.includes(term)));
}

export function orderFilterOptions(rows) {
  const counts = (field) => [...new Set(rows.map((row) => row[field]))].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: field === "status" ? words(value) : value, count: rows.filter((row) => row[field] === value).length }));
  return { retailers: counts("retailer"), statuses: counts("status") };
}
