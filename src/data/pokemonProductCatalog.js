import { SHARED_POKEMON_PRODUCTS } from "./sharedPokemonCatalog";
import { PRODUCT_CATEGORY_TYPES, PRODUCT_TYPE_ALIASES } from "./productAliases";

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeProductType(type) {
  if (!type) return "Miscellaneous";
  if (PRODUCT_CATEGORY_TYPES.includes(type)) return type;
  if (type === "Ex Box") return "Collection Box";
  if (type === "First Partner Pack") return "Booster Pack";
  if (type === "Mystery/Bundle item") return "Third-Party Product";
  if (type === "Trainer's Toolkit") return "Trainer Toolkit";
  return type;
}

export const POKEMON_PRODUCTS = SHARED_POKEMON_PRODUCTS
  .filter((item) => item.catalogType !== "card")
  .map((item, index) => {
    const name = item.productName || item.name || "";
    const productType = normalizeProductType(item.productType);
    return {
      productId: item.productId || item.id || `sealed-${slug(name)}-${index + 1}`,
      name,
      normalizedName: slug(name),
      setId: item.setCode || slug(item.setName),
      setName: item.setName || "",
      series: item.series || item.era || "",
      productType,
      productCategory: productType,
      releaseDate: item.releaseDate || "",
      msrp: item.msrp ?? item.msrpPrice ?? "Unknown",
      marketPrice: Number(item.marketValue || item.marketPrice || 0),
      lowPrice: Number(item.lowPrice || 0),
      highPrice: Number(item.highPrice || 0),
      retailPrice: item.msrp ?? "Unknown",
      packCount: item.packCount ?? "Unknown",
      contents: item.contents || "",
      upc: item.upc && item.upc !== "Unknown" ? item.upc : "",
      sku: item.sku && item.sku !== "Unknown" ? item.sku : "",
      tcgplayerProductId: item.tcgplayerProductId || "",
      imageUrl: item.imageUrl || "",
      imageSmall: item.imageSmall || "",
      imageLarge: item.imageLarge || item.imageUrl || "",
      imageSource: item.imageSource || (item.imageUrl ? "manual" : "placeholder"),
      imageSourceUrl: item.imageSourceUrl || item.sourceUrl || "",
      imageStatus: item.imageStatus || (item.imageUrl ? "manual" : "placeholder"),
      imageLastUpdated: item.imageLastUpdated || item.lastUpdated || "",
      imageNeedsReview: Boolean(item.imageNeedsReview),
      retailerExclusive: Boolean(item.retailerExclusive),
      retailerName: item.retailerName || "",
      isSealed: true,
      isThirdParty: productType === "Third-Party Product",
      aliases: [...(item.aliases || []), ...(PRODUCT_TYPE_ALIASES[productType] || []), ...(item.setAliases || [])],
      searchTokens: [name, item.setName, item.setCode, productType, ...(item.setAliases || [])].filter(Boolean),
      lastMarketUpdate: item.marketLastUpdated || "",
      lastMsrpUpdate: item.lastMsrpUpdate || "",
      source: item.sourceType || "local-beta-seed",
    };
  });

export const POKEMON_PRODUCT_UPCS = POKEMON_PRODUCTS
  .filter((product) => product.upc || product.sku)
  .map((product) => ({
    upc: product.upc,
    sku: product.sku,
    productId: product.productId,
    productName: product.name,
    retailerName: product.retailerName,
    source: product.source,
    confidence: product.upc ? 0.98 : 0.75,
  }));

export const POKEMON_PRODUCT_RETAILER_ALIASES = [];
export { PRODUCT_CATEGORY_TYPES };
