import { catalogService } from "./catalog.service";

const apiKey = process.env.BESTBUY_API_KEY;
const baseUrl = process.env.BESTBUY_API_BASE_URL || "https://api.bestbuy.com/v1";
const DEFAULT_SHOW_FIELDS = [
  "sku",
  "name",
  "salePrice",
  "regularPrice",
  "onlineAvailability",
  "onlineAvailabilityUpdateDate",
  "inStoreAvailability",
  "inStoreAvailabilityUpdateDate",
  "inStorePickup",
  "orderable",
  "upc",
  "modelNumber",
  "url",
  "image",
  "active",
  "releaseDate",
  "condition",
].join(",");

type BestBuyProduct = Record<string, unknown>;
type BestBuyStore = Record<string, unknown>;

function stringValue(source: BestBuyProduct | BestBuyStore | undefined, key: string): string {
  const value = source?.[key];
  return value === undefined || value === null ? "" : String(value);
}

function numberValue(source: BestBuyProduct | undefined, key: string): number {
  const value = source?.[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boolValue(source: BestBuyProduct | undefined, key: string): boolean {
  return source?.[key] === true || String(source?.[key] || "").toLowerCase() === "true";
}

function splitSearchTerms(term: string): string[] {
  return String(term || "")
    .toLowerCase()
    .replace(/pok[e\u00e9]mon/g, "pokemon")
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .slice(0, 6);
}

async function fetchBestBuyJson(path: string, params: Record<string, string | number | undefined> = {}) {
  if (!apiKey) return missingKeyResponse();
  const searchParams = new URLSearchParams({
    format: "json",
    apiKey,
  });
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") searchParams.set(key, String(value));
  }
  const response = await fetch(`${baseUrl}${path}?${searchParams.toString()}`);
  if (!response.ok) {
    return {
      error: true,
      message: `Best Buy API request failed: ${response.status}`,
      sourceStatus: "error",
    };
  }
  return response.json();
}

function statusFromBestBuyProduct(product: BestBuyProduct | undefined, stores: BestBuyStore[] = []) {
  const onlineAvailable = boolValue(product, "onlineAvailability");
  const storeAvailable = stores.some((store) => !store.error);
  const orderable = stringValue(product, "orderable").toLowerCase();

  if (onlineAvailable || storeAvailable) return "In Stock";
  if (orderable.includes("pre")) return "Preorder";
  if (orderable.includes("back")) return "Backorder";
  if (orderable.includes("coming") || orderable.includes("soon")) return "Coming Soon";
  if (product?.active === false) return "Loaded / Not Buyable";
  return "Out of Stock";
}

function rawStatus(product: BestBuyProduct | undefined) {
  if (!product) return "";
  return [
    "orderable",
    "onlineAvailability",
    "onlineAvailabilityUpdateDate",
    "inStoreAvailability",
    "inStoreAvailabilityUpdateDate",
    "inStorePickup",
    "active",
    "releaseDate",
  ]
    .filter((key) => key in product)
    .map((key) => `${key}=${stringValue(product, key)}`)
    .join("; ");
}

function normalizeStore(store: BestBuyStore, zipChecked = "") {
  return {
    storeId: stringValue(store, "storeID") || stringValue(store, "storeId"),
    storeName: stringValue(store, "name") || stringValue(store, "longName"),
    storeAddress: stringValue(store, "address") || stringValue(store, "storeAddress"),
    city: stringValue(store, "city"),
    state: stringValue(store, "state"),
    zip: stringValue(store, "postalCode") || stringValue(store, "zip"),
    distance: stringValue(store, "distance"),
    zipChecked,
  };
}

function normalizeBestBuyProduct(product: BestBuyProduct | undefined, stores: BestBuyStore[] = [], zipChecked = "") {
  const firstStore = stores.find((store) => !store.error);
  const status = statusFromBestBuyProduct(product, stores);
  return {
    retailer: "Best Buy",
    bestBuySku: stringValue(product, "sku"),
    sku: stringValue(product, "sku"),
    upc: stringValue(product, "upc"),
    productName: stringValue(product, "name") || "Unknown Best Buy product",
    name: stringValue(product, "name") || "Unknown Best Buy product",
    productUrl: stringValue(product, "url"),
    url: stringValue(product, "url"),
    imageUrl: stringValue(product, "image"),
    price: numberValue(product, "regularPrice") || numberValue(product, "salePrice"),
    salePrice: numberValue(product, "salePrice"),
    onlineAvailability: boolValue(product, "onlineAvailability") ? "In Stock" : "Out of Stock",
    pickupAvailability: boolValue(product, "inStorePickup") ? "Available for Pickup" : "Check Store",
    shippingAvailability: boolValue(product, "onlineAvailability") ? "Shipping Available" : "Out of Stock",
    storeAvailability: stores.some((store) => !store.error) ? "Available for Pickup" : "Check Store",
    stockStatus: status,
    sourceType: "bestbuy_api",
    sourceStatus: "live",
    rawStatus: rawStatus(product),
    storeId: firstStore ? stringValue(firstStore, "storeID") || stringValue(firstStore, "storeId") : "",
    storeName: firstStore ? stringValue(firstStore, "name") || stringValue(firstStore, "longName") : "",
    storeAddress: firstStore ? stringValue(firstStore, "address") || stringValue(firstStore, "storeAddress") : "",
    city: firstStore ? stringValue(firstStore, "city") : "",
    state: firstStore ? stringValue(firstStore, "state") || "VA" : "VA",
    zipChecked,
    stores: stores.map((store) => normalizeStore(store, zipChecked)),
    lastChecked: new Date().toISOString(),
    lastStatusChange: new Date().toISOString(),
  };
}

async function getRawProductBySku(sku: string) {
  return fetchBestBuyJson(`/products/${encodeURIComponent(String(sku))}.json`, {
    show: DEFAULT_SHOW_FIELDS,
  });
}

function missingKeyResponse() {
  return {
    error: true,
    message: "Best Buy API key is not configured yet.",
    sourceStatus: "unknown",
  };
}

export const bestBuyService = {
  async searchProducts(query: string) {
    if (!apiKey) return missingKeyResponse();
    const tokens = splitSearchTerms(query || "pokemon tcg");
    if (!tokens.length) return { products: [], query, sourceStatus: "live" };
    const search = tokens.map((token) => `search=${encodeURIComponent(token)}`).join("&");
    const data = await fetchBestBuyJson(`/products(${search})`, {
      show: DEFAULT_SHOW_FIELDS,
      pageSize: 50,
      page: 1,
    });
    if (data.error) return data;
    const products: BestBuyProduct[] = Array.isArray(data.products) ? data.products : [];
    return {
      query,
      products: products.map((product) => normalizeBestBuyProduct(product)),
      total: Number(data.total || products.length),
      sourceStatus: "live",
    };
  },
  async getProductBySku(sku: string) {
    if (!apiKey) return missingKeyResponse();
    const data = await getRawProductBySku(sku);
    if (data.error) return data;
    return normalizeBestBuyProduct(data);
  },
  async checkOnlineAvailability(sku: string) {
    if (!apiKey) return missingKeyResponse();
    return this.getProductBySku(sku);
  },
  async checkLocalAvailability(sku: string, zip?: string) {
    if (!apiKey) return missingKeyResponse();
    const product = await getRawProductBySku(sku);
    if (product.error) return product;
    if (!zip) return normalizeBestBuyProduct(product);
    const storesData = await fetchBestBuyJson(`/products/${encodeURIComponent(String(sku))}/stores.json`, {
      postalCode: zip,
    });
    if (storesData.error) {
      return {
        ...normalizeBestBuyProduct(product),
        storeAvailability: "Check Store",
        sourceStatus: "live",
        storeLookupError: storesData.message,
      };
    }
    const stores = Array.isArray(storesData.stores) ? storesData.stores : [];
    return normalizeBestBuyProduct(product, stores, zip);
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
