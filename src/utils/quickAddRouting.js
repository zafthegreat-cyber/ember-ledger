export const QUICK_ADD_DESTINATIONS = ["vault", "wishlist", "forge", "tidetradr"];

export function normalizeQuickAddDestinations(destinations = {}) {
  return QUICK_ADD_DESTINATIONS.reduce((next, key) => {
    next[key] = Boolean(destinations[key]);
    return next;
  }, {});
}

export function quickAddDestinationNames(destinations = {}) {
  const labels = {
    vault: "Vault",
    wishlist: "Wishlist",
    forge: "Forge",
    tidetradr: "Market",
  };
  return QUICK_ADD_DESTINATIONS
    .filter((key) => Boolean(destinations[key]))
    .map((key) => labels[key]);
}

export function buildQuickAddSuccessMessage({ itemName = "Item", entries = [] } = {}) {
  const safeName = String(itemName || "Item").trim() || "Item";
  const details = entries
    .filter((entry) => entry?.destination)
    .map((entry) => {
      const quantity = Math.max(1, Number(entry.quantity || 1));
      const purchaser = String(entry.purchaserName || "").trim();
      return `${entry.destination} x${quantity}${purchaser ? ` (${purchaser})` : ""}`;
    });
  if (!details.length) return `${safeName} saved.`;
  return `${safeName} saved to ${details.join(" and ")}.`;
}

export function normalizeQuickAddText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/pok[eé]mon/g, "pokemon")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9/.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function calendarEventToQuickAddSeed(event = {}, destinations = { vault: true }) {
  const productName = event.productName || event.product || event.products?.[0] || event.title || "";
  const setName = event.setName || event.group || event.expansion || event.subtitle || "";
  const productType = event.productType || event.category || event.eventType || "Sealed Product";
  const notes = [
    event.sourceLabel ? `Release calendar source: ${event.sourceLabel}.` : "",
    event.sourceUrl ? `Source: ${event.sourceUrl}` : "",
    event.dateKey ? `Calendar date: ${event.dateKey}` : "",
  ].filter(Boolean).join(" ");

  return {
    itemName: productName,
    category: "Pokemon",
    productType,
    setName,
    marketPrice: event.marketPrice || event.marketValue || "",
    msrpPrice: event.msrpPrice || event.msrp || "",
    notes,
    catalogSearchQuery: productName || event.title || "",
    destinations: normalizeQuickAddDestinations(destinations),
  };
}

export function findQuickAddCatalogMatch(catalogProducts = [], event = {}) {
  const names = [
    event.productName,
    event.product,
    ...(Array.isArray(event.products) ? event.products : []),
    event.title,
  ].map(normalizeQuickAddText).filter(Boolean);
  if (!names.length) return null;

  return catalogProducts.find((product) => {
    const title = normalizeQuickAddText(product.productName || product.name || product.cardName);
    const setName = normalizeQuickAddText(product.setName || product.expansion || product.group || product.series);
    const haystack = `${title} ${setName} ${normalizeQuickAddText(product.productType || product.sealedProductType || "")}`.trim();
    return names.some((name) => title === name || haystack.includes(name) || name.includes(title));
  }) || null;
}
