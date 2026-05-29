function positiveQuantity(...values) {
  for (const value of values) {
    const quantity = Number(value);
    if (Number.isFinite(quantity) && quantity > 0) return Math.max(1, Math.round(quantity));
  }
  return 1;
}

export function buildWishlistToOwnedRecord(item = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const quantity = positiveQuantity(item.ownedQuantity, item.quantityOwned, item.quantityWanted, item.wantedQuantity, item.quantity);
  const actionNotes = [
    item.actionNotes || item.action_notes,
    "Marked owned from wishlist.",
  ].filter(Boolean).join(" | ");

  return {
    ...item,
    destinationScope: ["vault"],
    itemScope: ["vault"],
    recordType: "vault_item",
    record_type: "vault_item",
    isWishlist: false,
    is_wishlist: false,
    quantity,
    ownedQuantity: quantity,
    quantityWanted: 0,
    wantedQuantity: 0,
    status: "Personal Collection",
    vaultStatus: "personal_collection",
    vault_status: "personal_collection",
    vaultCategory: "Personal Collection",
    storageLocation: item.storageLocation === "Wishlist" ? "" : item.storageLocation,
    actionNotes,
    wishlistConvertedAt: now,
    updatedAt: now,
    vaultHistory: [
      ...(Array.isArray(item.vaultHistory) ? item.vaultHistory : []),
      { type: "wishlist_marked_owned", date: now, quantity },
    ],
  };
}

export function buildWishlistAddSeed(source = {}) {
  const sourceLooksCatalogProduct = Boolean(
    source.catalogType ||
    source.catalog_type ||
    source.productName ||
    source.product_name ||
    source.cardName ||
    source.card_name ||
    source.tcgplayerProductId ||
    source.tcgplayer_product_id
  );
  return {
    itemName: source.name || source.itemName || source.productName || source.cardName || "",
    category: source.category || "Pokemon",
    productType: source.productType || source.product_type || "",
    setName: source.setName || source.set_name || source.expansion || "",
    expansion: source.expansion || source.setName || source.set_name || "",
    cardNumber: source.cardNumber || source.card_number || "",
    catalogProductId: source.catalogProductId || source.catalog_product_id || (sourceLooksCatalogProduct ? source.id : "") || "",
    marketPrice: source.marketPrice || source.market_price || "",
    msrpPrice: source.msrpPrice || source.msrp_price || "",
  };
}
