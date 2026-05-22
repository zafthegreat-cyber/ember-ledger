export function getProductImageUrl(product = {}) {
  return product.imageUrl ||
    product.image_url ||
    product.photoUrl ||
    product.photo_url ||
    product.productImage ||
    product.product_image ||
    product.imageLarge ||
    product.image_large ||
    product.imageSmall ||
    product.image_small ||
    product.images?.large ||
    product.images?.small ||
    "";
}

export function getProductDisplayTitle(product = {}) {
  return product.productName ||
    product.product_name ||
    product.cardName ||
    product.card_name ||
    product.name ||
    product.title ||
    "Pokemon product";
}

export function getProductSetLabel(product = {}) {
  return product.setName ||
    product.set_name ||
    product.expansionDisplayName ||
    product.expansion_display_name ||
    product.expansionOfficialName ||
    product.official_expansion_name ||
    product.expansion ||
    product.groupName ||
    product.group_name ||
    product.series ||
    product.productLine ||
    product.product_line ||
    "";
}

export function getProductTypeLabel(product = {}) {
  return product.productType ||
    product.product_type ||
    product.sealedProductType ||
    product.sealed_product_type ||
    product.catalogType ||
    product.catalog_type ||
    product.productKind ||
    product.product_kind ||
    "Product";
}

export function productHasUsableImage(product = {}) {
  return Boolean(getProductImageUrl(product));
}

export function getProductImageFallback(product = {}, overrides = {}) {
  const title = overrides.title || getProductDisplayTitle(product);
  const type = overrides.productType || getProductTypeLabel(product);
  const setName = overrides.setName || getProductSetLabel(product);
  const meta = [setName, type].filter(Boolean).join(" | ") || "Catalog product";
  return {
    title,
    meta,
    badge: type && type !== "Product" ? type : "Image needed",
    imageStatus: product.imageStatus || product.image_status || (productHasUsableImage(product) ? "available" : "fallback"),
  };
}

export function buildCatalogSelectionSnapshot(product = {}, overrides = {}) {
  const title = overrides.itemName || getProductDisplayTitle(product);
  const setName = overrides.setName || getProductSetLabel(product);
  const productType = overrides.productType || getProductTypeLabel(product);
  const imageUrl = overrides.imageUrl || getProductImageUrl(product);
  return {
    catalogProductId: product.id || product.catalogProductId || product.catalog_product_id || "",
    itemName: title,
    productName: title,
    setName,
    productType,
    imageUrl,
    photoUrl: imageUrl,
    imageStatus: imageUrl ? "catalog" : "fallback",
    marketPrice: product.marketPrice || product.market_price || product.marketValue || product.market_value || "",
    marketValueSource: product.marketValueSource || product.market_value_source || product.marketSource || product.market_source || product.sourceType || product.source_type || "",
    marketPriceConfidence: product.marketPriceConfidence || product.market_price_confidence || product.priceConfidence || product.price_confidence || "",
    marketValueUpdatedAt: product.marketValueUpdatedAt || product.market_value_updated_at || product.lastPriceChecked || product.last_price_checked || "",
    msrpPrice: product.msrpPrice || product.msrp_price || product.msrp || "",
    msrpSource: product.msrpSource || product.msrp_source || "",
    sourceProductId: product.sourceProductId || product.source_product_id || product.tcgplayerProductId || product.tcgplayer_product_id || "",
    destination: overrides.destination || "",
  };
}
