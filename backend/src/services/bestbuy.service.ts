import { catalogService } from "./catalog.service";

const apiKey = process.env.BESTBUY_API_KEY;
const baseUrl = process.env.BESTBUY_API_BASE_URL || "https://api.bestbuy.com/v1";

function missingKeyResponse() {
  return {
    error: true,
    message: "Best Buy API key is not configured yet.",
    sourceStatus: "unknown",
  };
}

export const bestBuyService = {
  searchProducts(query: string) {
    if (!apiKey) return missingKeyResponse();
    return {
      message: "Best Buy official API search is ready to connect.",
      query,
      baseUrl,
      sourceStatus: "live-ready",
    };
  },
  getProductBySku(sku: string) {
    if (!apiKey) return missingKeyResponse();
    return {
      message: "Best Buy official SKU lookup is ready to connect.",
      sku,
      baseUrl,
      sourceStatus: "live-ready",
    };
  },
  checkOnlineAvailability(sku: string) {
    if (!apiKey) return missingKeyResponse();
    return {
      message: "Best Buy online availability check is ready to connect.",
      sku,
      sourceStatus: "live-ready",
    };
  },
  checkLocalAvailability(sku: string, zip?: string) {
    if (!apiKey) return missingKeyResponse();
    return {
      message: "Best Buy local availability check is ready to connect.",
      sku,
      zip,
      sourceStatus: "live-ready",
    };
  },
  matchBestBuySkuToCatalogItem(sku: string, productName?: string) {
    const matches = catalogService.search(productName || sku);
    return {
      sku,
      matched: matches.length > 0,
      bestMatch: matches[0] || null,
      matches,
      matchConfidence: matches.length ? "medium" : "low",
    };
  },
};

