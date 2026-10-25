export const BUSINESS_INVENTORY_STOCK_FILTERS = Object.freeze([
  Object.freeze({ key: "all", label: "All inventory" }),
  Object.freeze({ key: "available", label: "Available" }),
  Object.freeze({ key: "preparing", label: "Preparing" }),
  Object.freeze({ key: "listed", label: "Listed" }),
  Object.freeze({ key: "sold-out", label: "Sold out" }),
]);

function normalized(value) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim()
    : "";
}

// Presentation only. Quantity is supplied by the existing Inventory authority,
// including its sale/return treatment. Keep the original rows and their order.
export function filterBusinessInventory(records, { query = "", stockFilter = "all", getAvailableQuantity } = {}) {
  const terms = normalized(query).split(/\s+/).filter(Boolean);
  const stock = BUSINESS_INVENTORY_STOCK_FILTERS.some(filter => filter.key === stockFilter) ? stockFilter : "all";
  if (stock !== "all" && typeof getAvailableQuantity !== "function") throw new TypeError("Inventory stock filters require the existing quantity calculation.");
  return records.filter(record => {
    if (stock !== "all") {
      const quantity = getAvailableQuantity(record);
      if (!Number.isFinite(quantity) || quantity < 0) return false;
      if (stock === "sold-out" ? quantity !== 0 : quantity <= 0) return false;
      const status = normalized(normalized(record.currentStatus) || record.status);
      if (["preparing", "listed"].includes(stock) && status !== stock) return false;
    }
    if (!terms.length) return true;
    const text = [record.name, record.title, record.cardName, record.productName, record.description, record.setName, record.set_name,
      record.cardNumber, record.card_number, record.productClassification, record.pokemonName, record.storageLocation, record.intendedSalesChannel,
      record.purchaseSource, record.source, record.status, record.currentStatus, record.condition, record.grade, record.tcgGame, record.notes]
      .map(normalized).join(" ");
    return terms.every(term => text.includes(term));
  });
}
