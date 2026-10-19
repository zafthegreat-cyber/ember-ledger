// The legacy editor normalizes top-level numeric zero to an empty string.
// Recover only those explicit saved zeros for this read-only detail view.
export function preserveLegacyReportZeros(report = {}, items = []) {
  const rawItems = Array.isArray(report.itemsSeen) ? report.itemsSeen : Array.isArray(report.items_seen) ? report.items_seen : [];
  if (rawItems.length || !items[0] || typeof items[0] !== "object") return items;
  const quantity = report.quantitySeen === "" ? report.quantity_seen : (report.quantitySeen ?? report.quantity_seen);
  if (quantity !== 0 && report.price !== 0) return items;
  return items.map((item, index) => index ? item : {
    ...item,
    ...(quantity === 0 ? { quantity: 0 } : {}),
    ...(report.price === 0 ? { price: 0 } : {}),
  });
}
