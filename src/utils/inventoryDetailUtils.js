export function groupedInventoryEntryIds(item = {}) {
  const entries = Array.isArray(item.rawItems) && item.rawItems.length ? item.rawItems : [item];
  return entries.map((entry) => entry?.id).filter(Boolean);
}

export function buildPlannedSalePricePatch(entry = {}, nextPrice = 0, changedAt = new Date().toISOString()) {
  const previousPrice = Number(entry.salePrice || entry.plannedSalePrice || entry.planned_sale_price || 0);
  return {
    salePrice: nextPrice,
    plannedSalePrice: nextPrice,
    planned_sale_price: nextPrice,
    plannedSalePriceHistory: [
      ...(Array.isArray(entry.plannedSalePriceHistory) ? entry.plannedSalePriceHistory : []),
      {
        price: nextPrice,
        previousPrice,
        changedAt,
        source: "quick_update",
      },
    ],
    updatedAt: changedAt,
  };
}

export function plannedSalePriceUpdateSummary(item = {}) {
  const count = groupedInventoryEntryIds(item).length || 1;
  return count === 1 ? "1 saved entry" : `${count} saved entries`;
}
