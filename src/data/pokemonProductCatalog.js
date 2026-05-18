import { PRODUCT_CATEGORY_TYPES } from "./productAliases";
import importedSealedProducts from "./generated/sealedProducts.json";

function normalizeSeedProduct(product = {}) {
  const productName = product.productName || product.name || "";
  const upc = product.upc || product.UPC || product.barcode || "";
  const sku = product.sku || product.SKU || "";
  const msrp = product.msrp || product.MSRP || "";
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
    marketPrice: Number(product.marketPrice || product.marketValue || 0),
    marketValue: Number(product.marketValue || product.marketPrice || 0),
    imageUrl: product.imageUrl || "",
    sourceType: product.sourceType || "local_catalog_seed",
    source: product.source || product.sourceType || "local_catalog_seed",
    marketSource: product.marketSource || "Catalog seed",
    dataConfidenceScore: product.dataConfidenceScore || 0.7,
    adminReviewStatus: product.adminReviewStatus || "seeded",
    notes: product.notes || "",
  };
}

export const POKEMON_PRODUCTS = importedSealedProducts.map(normalizeSeedProduct);

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
