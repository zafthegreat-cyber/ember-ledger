import { PRODUCT_CATEGORY_TYPES } from "./productAliases";
import importedSealedProducts from "./generated/sealedProducts.json";
import catalogRecoveryProducts from "./catalogRecoveryProducts.json";

function normalizeMergeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/pok[e\u00e9]mon/g, "pokemon")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSeedProduct(product = {}) {
  const productName = product.productName || product.name || "";
  const upc = product.upc || product.UPC || product.barcode || "";
  const sku = product.sku || product.SKU || "";
  const msrp = product.msrp || product.MSRP || "";
  const marketPrice = Number(product.marketPrice || product.marketValue || 0);
  const imageUrl = product.imageUrl || product.image_url || product.photoUrl || product.photo_url || product.productImage || product.product_image || product.imageLarge || product.image_large || product.imageSmall || product.image_small || "";
  return {
    ...product,
    id: product.id || product.sourceId || `sealed-${productName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: product.name || productName,
    productName,
    category: product.category || "Pokemon",
    catalogType: product.catalogType || "sealed",
    catalogItemType: product.catalogItemType || "sealed",
    productKind: product.productKind || "sealed_product",
    isSealed: true,
    is_sealed: true,
    productType: product.productType || "Other sealed product",
    setName: product.setName || "",
    setCode: product.setCode || "",
    productLine: product.productLine || product.series || product.era || "",
    msrp,
    msrpPrice: Number(msrp || 0),
    upc,
    barcode: upc,
    sku,
    sourceProductId: product.sourceProductId || product.tcgplayerProductId || product.externalProductId || "",
    tcgplayerProductId: product.tcgplayerProductId || product.sourceProductId || "",
    productUrl: product.productUrl || product.marketUrl || product.sourceUrl || "",
    marketPrice,
    marketValue: Number(product.marketValue || product.marketPrice || 0),
    lowPrice: Number(product.lowPrice || 0),
    midPrice: Number(product.midPrice || 0),
    directLowPrice: Number(product.directLowPrice || product.directLow || 0),
    imageUrl,
    photoUrl: product.photoUrl || product.photo_url || imageUrl,
    imageSmall: product.imageSmall || product.image_small || imageUrl,
    imageLarge: product.imageLarge || product.image_large || imageUrl,
    imageConfidence: product.imageConfidence || (imageUrl ? "medium" : "unavailable"),
    sourceType: product.sourceType || "local_catalog_seed",
    source: product.source || product.sourceType || "local_catalog_seed",
    marketSource: product.marketSource || "Catalog seed",
    marketStatus: product.marketStatus || (marketPrice ? "cached" : "unknown"),
    pricingConfidence: product.pricingConfidence || (marketPrice ? "medium" : "unavailable"),
    marketLastUpdated: product.marketLastUpdated || product.sourceUpdatedAt || "",
    sourceUpdatedAt: product.sourceUpdatedAt || product.lastUpdated || "",
    dataConfidenceScore: product.dataConfidenceScore || 0.7,
    adminReviewStatus: product.adminReviewStatus || "seeded",
    notes: product.notes || "",
  };
}

function hasProductImage(product = {}) {
  return Boolean(product.imageUrl || product.photoUrl || product.imageLarge || product.imageSmall);
}

function mergeSeedProduct(existing = {}, candidate = {}) {
  const existingHasImage = hasProductImage(existing);
  const candidateHasImage = hasProductImage(candidate);
  const primary = !existingHasImage && candidateHasImage ? candidate : existing;
  const secondary = primary === existing ? candidate : existing;
  return {
    ...secondary,
    ...primary,
    imageUrl: primary.imageUrl || secondary.imageUrl || "",
    photoUrl: primary.photoUrl || primary.imageUrl || secondary.photoUrl || secondary.imageUrl || "",
    imageSmall: primary.imageSmall || primary.imageUrl || secondary.imageSmall || secondary.imageUrl || "",
    imageLarge: primary.imageLarge || primary.imageUrl || secondary.imageLarge || secondary.imageUrl || "",
    marketPrice: Number(primary.marketPrice || 0) || Number(secondary.marketPrice || 0) || 0,
    marketValue: Number(primary.marketValue || 0) || Number(secondary.marketValue || 0) || 0,
    lowPrice: Number(primary.lowPrice || 0) || Number(secondary.lowPrice || 0) || 0,
    midPrice: Number(primary.midPrice || 0) || Number(secondary.midPrice || 0) || 0,
    directLowPrice: Number(primary.directLowPrice || 0) || Number(secondary.directLowPrice || 0) || 0,
    msrpPrice: Number(primary.msrpPrice || 0) || Number(secondary.msrpPrice || 0) || 0,
    imageConfidence: primary.imageConfidence !== "unavailable" ? primary.imageConfidence : secondary.imageConfidence || primary.imageConfidence,
    pricingConfidence: primary.pricingConfidence !== "unavailable" ? primary.pricingConfidence : secondary.pricingConfidence || primary.pricingConfidence,
  };
}

function seedProductMergeKey(product = {}) {
  return [
    normalizeMergeText(product.productName || product.name),
    normalizeMergeText(product.setName || product.expansion || product.productLine),
    normalizeMergeText(product.productType),
  ].join("|");
}

function mergeDuplicateSeedProducts(products = []) {
  const merged = new Map();
  for (const product of products) {
    const key = seedProductMergeKey(product);
    if (!key.replace(/\|/g, "")) continue;
    merged.set(key, merged.has(key) ? mergeSeedProduct(merged.get(key), product) : product);
  }
  return [...merged.values()];
}

export const POKEMON_PRODUCTS = mergeDuplicateSeedProducts([
  ...catalogRecoveryProducts,
  ...importedSealedProducts,
].map(normalizeSeedProduct));

export const POKEMON_PRODUCT_UPCS = POKEMON_PRODUCTS
  .filter((product) => product.upc || product.barcode)
  .map((product) => ({
    productId: product.id,
    productName: product.productName || product.name,
    upc: product.upc || product.barcode,
    sku: product.sku || "",
  }));

export const POKEMON_PRODUCT_RETAILER_ALIASES = [];
export { PRODUCT_CATEGORY_TYPES };
