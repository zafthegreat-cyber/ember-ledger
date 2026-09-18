const EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MARKETPLACE_ID = "EBAY_US";
const TOKEN_EXPIRY_SAFETY_MS = 60_000;
const DATA_SOURCE_EXPLANATION =
  "eBay Browse API active-listing data. Asking prices and current bids are not sold comparables or market values.";

export type EbayEnvironment = "production" | "sandbox";
export type EbayErrorCode =
  | "missing_configuration"
  | "invalid_request"
  | "authentication_error"
  | "rate_limited"
  | "timeout"
  | "upstream_error";

export type EbayFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface EbayBrowseConfig {
  clientId: string;
  clientSecret: string;
  environment: EbayEnvironment;
  marketplaceId: string;
  timeoutMs: number;
}

export interface EbaySearchInput {
  keywords?: string;
  categoryId?: string;
  gtin?: string;
  minimumPrice?: number | string;
  maximumPrice?: number | string;
  currency?: string;
  conditionIds?: string[] | string;
  buyingOptions?: string[] | string;
  deliveryCountry?: string;
  deliveryPostalCode?: string;
  localPickupOnly?: boolean;
  pickupCountry?: string;
  pickupPostalCode?: string;
  pickupRadius?: number | string;
  pickupRadiusUnit?: "mi" | "km";
  excludeKeywords?: string[] | string;
  productClassifications?: string[];
  newlyListedHours?: number | string;
  maximumDistance?: number | string;
  maximumPurchaseAmount?: number | string;
  minimumProjectedProfit?: number | string;
  minimumRoi?: number | string;
  minimumConfidence?: string;
  offset?: number | string;
  limit?: number | string;
}

type TokenCacheEntry = {
  accessToken: string;
  expiresAt: number;
};

type EbayDependencies = {
  fetchImpl?: EbayFetch;
  now?: () => number;
};

type EbayAmount = {
  value?: string | number;
  currency?: string;
};

type EbayItemSummary = Record<string, unknown> & {
  itemId?: string;
  legacyItemId?: string;
  title?: string;
  shortDescription?: string;
  itemWebUrl?: string;
  itemCreationDate?: string;
  itemOriginDate?: string;
  itemEndDate?: string;
  price?: EbayAmount;
  currentBidPrice?: EbayAmount;
  bidCount?: number;
  buyingOptions?: string[];
  condition?: string;
  conditionId?: string;
  listingMarketplaceId?: string;
  image?: { imageUrl?: string };
  thumbnailImages?: { imageUrl?: string }[];
  additionalImages?: { imageUrl?: string }[];
  itemLocation?: Record<string, unknown>;
  seller?: Record<string, unknown>;
  shippingOptions?: Record<string, unknown>[];
  pickupOptions?: Record<string, unknown>[];
  distanceFromPickupLocation?: Record<string, unknown>;
  adultOnly?: boolean;
};

const tokenCache = new Map<string, TokenCacheEntry>();
const tokenRequests = new Map<string, Promise<TokenCacheEntry>>();

export class EbayApiError extends Error {
  code: EbayErrorCode;
  status: number;
  retryAfterSeconds?: number;

  constructor(code: EbayErrorCode, message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "EbayApiError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function cleanString(value: unknown, maxLength = 500): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optionalNumber(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

function listValue(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[|,\n]/) : [];
  return values.slice(0, 50).map((entry) => cleanString(entry, 120)).filter(Boolean);
}

function tokenCacheKey(config: EbayBrowseConfig): string {
  return `${config.environment}:${config.clientId}`;
}

function apiHost(environment: EbayEnvironment): string {
  return environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
}

function safeUpstreamMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const body = payload as Record<string, unknown>;
  const errors = Array.isArray(body.errors) ? body.errors : [];
  const first = errors[0] && typeof errors[0] === "object" ? errors[0] as Record<string, unknown> : null;
  return cleanString(first?.message || body.error_description || body.message, 240) || fallback;
}

function errorForResponse(response: Response, payload: unknown, operation: string): EbayApiError {
  const message = safeUpstreamMessage(payload, `eBay ${operation} failed.`);
  if (response.status === 401 || response.status === 403) {
    return new EbayApiError("authentication_error", `eBay authentication failed. ${message}`, 502);
  }
  if (response.status === 429) {
    const retryAfter = boundedInteger(response.headers.get("retry-after"), 60, 1, 86_400);
    return new EbayApiError("rate_limited", `eBay rate limit reached. ${message}`, 429, retryAfter);
  }
  if (response.status >= 400 && response.status < 500) {
    return new EbayApiError("invalid_request", `eBay rejected the search request. ${message}`, 400);
  }
  return new EbayApiError("upstream_error", `eBay ${operation} is temporarily unavailable. ${message}`, 502);
}

async function fetchJson(
  url: string,
  init: RequestInit,
  config: EbayBrowseConfig,
  dependencies: EbayDependencies,
  operation: string,
): Promise<{ response: Response; payload: unknown }> {
  const fetchImpl = dependencies.fetchImpl || fetch;
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new EbayApiError("timeout", `eBay ${operation} timed out after ${config.timeoutMs} ms.`, 504));
    }, config.timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetchImpl(url, { ...init, signal: controller.signal }),
      timeout,
    ]);
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return { response, payload };
  } catch (error) {
    if (error instanceof EbayApiError) throw error;
    if ((error as Error)?.name === "AbortError") {
      throw new EbayApiError("timeout", `eBay ${operation} timed out after ${config.timeoutMs} ms.`, 504);
    }
    throw new EbayApiError("upstream_error", `eBay ${operation} could not be reached.`, 502);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function readEbayConfig(env: NodeJS.ProcessEnv = process.env): {
  configured: boolean;
  missing: string[];
  config: EbayBrowseConfig;
} {
  const clientId = cleanString(env.EBAY_CLIENT_ID, 300);
  const clientSecret = cleanString(env.EBAY_CLIENT_SECRET, 500);
  const requestedEnvironment = cleanString(env.EBAY_ENVIRONMENT, 20).toLowerCase();
  const environment: EbayEnvironment = requestedEnvironment === "sandbox" ? "sandbox" : "production";
  const marketplaceId = /^EBAY_[A-Z]{2,5}$/.test(cleanString(env.EBAY_MARKETPLACE_ID, 20).toUpperCase())
    ? cleanString(env.EBAY_MARKETPLACE_ID, 20).toUpperCase()
    : DEFAULT_MARKETPLACE_ID;
  const timeoutMs = boundedInteger(env.EBAY_REQUEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1_000, 30_000);
  const missing = [
    !clientId ? "EBAY_CLIENT_ID" : "",
    !clientSecret ? "EBAY_CLIENT_SECRET" : "",
  ].filter(Boolean);

  return {
    configured: missing.length === 0,
    missing,
    config: { clientId, clientSecret, environment, marketplaceId, timeoutMs },
  };
}

export function clearEbayTokenCache(): void {
  tokenCache.clear();
  tokenRequests.clear();
}

export function invalidateEbayToken(config: EbayBrowseConfig): void {
  tokenCache.delete(tokenCacheKey(config));
}

async function requestApplicationToken(
  config: EbayBrowseConfig,
  dependencies: EbayDependencies,
): Promise<TokenCacheEntry> {
  const now = dependencies.now || Date.now;
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64");
  const body = new URLSearchParams({ grant_type: "client_credentials", scope: EBAY_SCOPE });
  const { response, payload } = await fetchJson(
    `${apiHost(config.environment)}/identity/v1/oauth2/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
    config,
    dependencies,
    "token request",
  );

  if (!response.ok) throw errorForResponse(response, payload, "token request");
  const tokenPayload = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const accessToken = cleanString(tokenPayload.access_token, 8_000);
  const expiresIn = boundedInteger(tokenPayload.expires_in, 0, 0, 86_400);
  if (!accessToken || !expiresIn) {
    throw new EbayApiError("authentication_error", "eBay returned an invalid application token response.", 502);
  }
  return { accessToken, expiresAt: now() + expiresIn * 1_000 };
}

export async function getEbayApplicationToken(
  config: EbayBrowseConfig,
  dependencies: EbayDependencies = {},
  forceRefresh = false,
): Promise<{ accessToken: string; expiresAt: number; fromCache: boolean }> {
  if (!config.clientId || !config.clientSecret) {
    throw new EbayApiError("missing_configuration", "eBay credentials are not configured on the server.", 503);
  }
  const now = dependencies.now || Date.now;
  const key = tokenCacheKey(config);
  const cached = tokenCache.get(key);
  if (!forceRefresh && cached && cached.expiresAt - TOKEN_EXPIRY_SAFETY_MS > now()) {
    return { ...cached, fromCache: true };
  }
  if (!forceRefresh && tokenRequests.has(key)) {
    const pending = await tokenRequests.get(key)!;
    return { ...pending, fromCache: true };
  }

  const pending = requestApplicationToken(config, dependencies);
  tokenRequests.set(key, pending);
  try {
    const entry = await pending;
    tokenCache.set(key, entry);
    return { ...entry, fromCache: false };
  } finally {
    tokenRequests.delete(key);
  }
}

function sanitizeSearchInput(input: EbaySearchInput): Required<Pick<EbaySearchInput, "offset" | "limit">> & EbaySearchInput {
  const keywords = cleanString(input.keywords, 100);
  const categoryId = cleanString(input.categoryId, 30).replace(/[^0-9,]/g, "");
  const gtin = cleanString(input.gtin, 32).replace(/[^0-9]/g, "");
  if (!keywords && !categoryId && !gtin) {
    throw new EbayApiError("invalid_request", "Enter keywords, an eBay category ID, or a GTIN.", 400);
  }
  return {
    ...input,
    keywords,
    categoryId,
    gtin,
    offset: boundedInteger(input.offset, 0, 0, 9_999),
    limit: boundedInteger(input.limit, 25, 1, 200),
  };
}

export function buildEbaySearchRequest(input: EbaySearchInput, config: EbayBrowseConfig): {
  url: string;
  headers: Record<string, string>;
  normalizedInput: EbaySearchInput;
} {
  const normalizedInput = sanitizeSearchInput(input);
  const params = new URLSearchParams({
    sort: "newlyListed",
    limit: String(normalizedInput.limit),
    offset: String(normalizedInput.offset),
    fieldgroups: "EXTENDED",
  });
  if (normalizedInput.keywords) params.set("q", normalizedInput.keywords);
  if (normalizedInput.categoryId) params.set("category_ids", normalizedInput.categoryId);
  if (normalizedInput.gtin) params.set("gtin", normalizedInput.gtin);

  const filters: string[] = [];
  const minimumPrice = optionalNumber(normalizedInput.minimumPrice);
  const maximumPrice = optionalNumber(normalizedInput.maximumPrice);
  if (minimumPrice !== null && maximumPrice !== null && minimumPrice > maximumPrice) {
    throw new EbayApiError("invalid_request", "Minimum price cannot be greater than maximum price.", 400);
  }
  if (minimumPrice !== null || maximumPrice !== null) {
    const currency = /^[A-Z]{3}$/.test(cleanString(normalizedInput.currency, 3).toUpperCase())
      ? cleanString(normalizedInput.currency, 3).toUpperCase()
      : "USD";
    const range = minimumPrice !== null && maximumPrice !== null
      ? `${minimumPrice}..${maximumPrice}`
      : minimumPrice !== null ? String(minimumPrice) : `..${maximumPrice}`;
    filters.push(`price:[${range}]`, `priceCurrency:${currency}`);
  }

  const conditionIds = listValue(normalizedInput.conditionIds).map((value) => value.replace(/\D/g, "")).filter(Boolean);
  if (conditionIds.length) filters.push(`conditionIds:{${conditionIds.join("|")}}`);
  const allowedBuyingOptions = new Set(["FIXED_PRICE", "AUCTION", "BEST_OFFER", "CLASSIFIED_AD"]);
  const buyingOptions = listValue(normalizedInput.buyingOptions).map((value) => value.toUpperCase()).filter((value) => allowedBuyingOptions.has(value));
  if (buyingOptions.length) filters.push(`buyingOptions:{${buyingOptions.join("|")}}`);

  const deliveryCountry = cleanString(normalizedInput.deliveryCountry, 2).toUpperCase();
  const deliveryPostalCode = cleanString(normalizedInput.deliveryPostalCode, 18).replace(/[^a-z0-9 -]/gi, "");
  if (deliveryCountry) filters.push(`deliveryCountry:${deliveryCountry}`);
  if (deliveryCountry && deliveryPostalCode) filters.push(`deliveryPostalCode:${deliveryPostalCode}`);

  if (normalizedInput.localPickupOnly) {
    const pickupCountry = cleanString(normalizedInput.pickupCountry, 2).toUpperCase();
    const pickupPostalCode = cleanString(normalizedInput.pickupPostalCode, 18).replace(/[^a-z0-9 -]/gi, "");
    const pickupRadius = optionalNumber(normalizedInput.pickupRadius);
    if (!pickupCountry || !pickupPostalCode || pickupRadius === null) {
      throw new EbayApiError(
        "invalid_request",
        "Local pickup searches require a pickup country, postal code, and radius.",
        400,
      );
    }
    filters.push(
      "deliveryOptions:{SELLER_ARRANGED_LOCAL_PICKUP}",
      `pickupCountry:${pickupCountry}`,
      `pickupPostalCode:${pickupPostalCode}`,
      `pickupRadius:${pickupRadius}`,
      `pickupRadiusUnit:${normalizedInput.pickupRadiusUnit === "km" ? "km" : "mi"}`,
    );
  }
  if (filters.length) params.set("filter", filters.join(","));

  return {
    url: `${apiHost(config.environment)}/buy/browse/v1/item_summary/search?${params.toString()}`,
    headers: {
      Accept: "application/json",
      "X-EBAY-C-MARKETPLACE-ID": config.marketplaceId,
    },
    normalizedInput,
  };
}

function recordValue(record: Record<string, unknown> | undefined, key: string): string {
  return cleanString(record?.[key], 500);
}

function getShippingCost(options: Record<string, unknown>[] | undefined): { value: number | null; type: string } {
  if (!Array.isArray(options) || !options.length) return { value: null, type: "" };
  const costs = options.map((option) => {
    const amount = option.shippingCost && typeof option.shippingCost === "object"
      ? option.shippingCost as Record<string, unknown>
      : {};
    return optionalNumber(amount.value);
  }).filter((value): value is number => value !== null);
  return {
    value: costs.length ? Math.min(...costs) : null,
    type: recordValue(options[0], "shippingCostType"),
  };
}

function listingType(buyingOptions: string[] | undefined): string {
  const values = Array.isArray(buyingOptions) ? buyingOptions : [];
  if (values.includes("AUCTION")) return "Auction";
  if (values.includes("BEST_OFFER")) return "Best offer";
  if (values.includes("FIXED_PRICE")) return "Fixed price";
  return "Unknown";
}

export function classifyEbayListing(titleValue: unknown): string {
  const title = cleanString(titleValue, 300).toLowerCase();
  if (/\b(psa|bgs|cgc|sgc)\b|graded|slab/.test(title)) return "Graded card";
  if (/topps|burger king.*card|non[- ]tcg/.test(title)) return "Topps or vintage non-TCG";
  if (/sealed|booster (box|pack|bundle)|elite trainer|\betb\b|collection box|factory/.test(title)) return "Sealed product";
  if (/binder|collection/.test(title)) return "Binder or collection";
  if (/\bbulk\b/.test(title)) return "Bulk";
  if (/plush|figure|statue|toy|merch/.test(title)) return "Pokémon merchandise";
  if (/sleeves|playmat|deck box|card holder|toploader/.test(title)) return "Accessory";
  if (/\blot\b|mixed/.test(title)) return "Mixed lot";
  if (/\bcard\b|charizard|pikachu|pokemon|pokémon/.test(title)) return "Raw card";
  return "Unknown";
}

export function normalizeEbayListing(item: EbayItemSummary, checkedAt = new Date().toISOString()): Record<string, unknown> {
  const externalListingId = cleanString(item.itemId || item.legacyItemId, 200);
  const endTime = cleanString(item.itemEndDate, 50);
  const endTimestamp = endTime ? Date.parse(endTime) : Number.NaN;
  const checkedTimestamp = Date.parse(checkedAt);
  const expired = Number.isFinite(endTimestamp) && Number.isFinite(checkedTimestamp) && endTimestamp <= checkedTimestamp;
  const shipping = getShippingCost(item.shippingOptions);
  const location = item.itemLocation && typeof item.itemLocation === "object" ? item.itemLocation : {};
  const seller = item.seller && typeof item.seller === "object" ? item.seller : {};
  const distance = item.distanceFromPickupLocation && typeof item.distanceFromPickupLocation === "object"
    ? optionalNumber(item.distanceFromPickupLocation.value)
    : null;
  const imageReferences = [
    item.image?.imageUrl,
    ...(Array.isArray(item.thumbnailImages) ? item.thumbnailImages.map((image) => image?.imageUrl) : []),
    ...(Array.isArray(item.additionalImages) ? item.additionalImages.map((image) => image?.imageUrl) : []),
  ].map((value) => cleanString(value, 2_000)).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);
  const locationText = [
    recordValue(location, "city"),
    recordValue(location, "stateOrProvince"),
    recordValue(location, "postalCode"),
    recordValue(location, "country"),
  ].filter(Boolean).join(", ");
  const currentBid = optionalNumber(item.currentBidPrice?.value);
  const askingPrice = optionalNumber(item.price?.value);
  const riskFlags = [
    item.adultOnly ? "Adult-only listing" : "",
    askingPrice === null && currentBid === null ? "Price unavailable" : "",
  ].filter(Boolean);

  return {
    providerId: "ebay",
    marketplace: "eBay",
    externalListingId,
    legacyListingId: cleanString(item.legacyItemId, 100),
    listingUrl: cleanString(item.itemWebUrl, 2_000),
    originalListingUrl: cleanString(item.itemWebUrl, 2_000),
    title: cleanString(item.title, 300) || "Untitled eBay listing",
    description: cleanString(item.shortDescription, 4_000),
    sellerName: recordValue(seller, "username"),
    sellerRating: recordValue(seller, "feedbackPercentage"),
    sellerFeedbackScore: optionalNumber(seller.feedbackScore),
    listingType: listingType(item.buyingOptions),
    buyingOptions: Array.isArray(item.buyingOptions) ? item.buyingOptions.filter((value) => typeof value === "string") : [],
    productClassification: classifyEbayListing(item.title),
    condition: cleanString(item.condition, 120),
    conditionId: cleanString(item.conditionId, 40),
    askingPrice,
    priceCurrency: cleanString(item.price?.currency || item.currentBidPrice?.currency, 8),
    purchaseShipping: shipping.value,
    shippingCostType: shipping.type,
    estimatedTax: "",
    currentBid,
    numberOfBids: optionalNumber(item.bidCount),
    imageReferences,
    location: locationText,
    distance,
    distanceUnit: recordValue(item.distanceFromPickupLocation, "unit"),
    dateDiscovered: checkedAt.slice(0, 10),
    listingCreatedAt: cleanString(item.itemCreationDate || item.itemOriginDate, 50),
    listingOriginTime: cleanString(item.itemOriginDate, 50),
    auctionEndTime: endTime,
    localPickupAvailable: Array.isArray(item.pickupOptions) && item.pickupOptions.length > 0,
    riskFlags,
    tags: ["eBay Browse API"],
    confidence: "Low",
    status: expired ? "Expired" : "Needs Review",
    reviewStatus: "Pending Review",
    providerState: expired ? "Expired" : "Active",
    isExpired: expired,
    listingMarketplaceId: cleanString(item.listingMarketplaceId, 30),
    firstSeenAt: checkedAt,
    lastCheckedAt: checkedAt,
    dataSource: DATA_SOURCE_EXPLANATION,
  };
}

export function applyEbaySearchRuleFilters(
  listings: Record<string, unknown>[],
  input: EbaySearchInput,
  checkedAt = new Date().toISOString(),
): { listings: Record<string, unknown>[]; deferredFilters: string[] } {
  const excluded = listValue(input.excludeKeywords).map((value) => value.toLowerCase());
  const newlyListedHours = optionalNumber(input.newlyListedHours);
  const maximumDistance = optionalNumber(input.maximumDistance);
  const maximumPurchaseAmount = optionalNumber(input.maximumPurchaseAmount);
  const classifications = Array.isArray(input.productClassifications) ? input.productClassifications.filter(Boolean).slice(0, 20) : [];
  const checkedTimestamp = Date.parse(checkedAt);
  const filtered = listings.filter((listing) => {
    const searchable = `${cleanString(listing.title, 500)} ${cleanString(listing.description, 2_000)}`.toLowerCase();
    if (excluded.some((keyword) => searchable.includes(keyword))) return false;
    if (newlyListedHours !== null && newlyListedHours > 0) {
      const created = Date.parse(cleanString(listing.listingCreatedAt, 50));
      if (Number.isFinite(created) && Number.isFinite(checkedTimestamp) && checkedTimestamp - created > newlyListedHours * 3_600_000) return false;
    }
    const price = optionalNumber(listing.askingPrice);
    if (maximumPurchaseAmount !== null && price !== null && price > maximumPurchaseAmount) return false;
    const distance = optionalNumber(listing.distance);
    if (maximumDistance !== null && distance !== null && distance > maximumDistance) return false;
    if (classifications.length && !classifications.includes(String(listing.productClassification || "Unknown"))) return false;
    return true;
  });
  const deferredFilters = [
    optionalNumber(input.minimumProjectedProfit) !== null ? "minimumProjectedProfit" : "",
    optionalNumber(input.minimumRoi) !== null ? "minimumRoi" : "",
    cleanString(input.minimumConfidence, 30) ? "minimumConfidence" : "",
  ].filter(Boolean);
  return { listings: filtered, deferredFilters };
}

function deduplicateListings(listings: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  return listings.filter((listing) => {
    const key = `${listing.providerId}:${listing.externalListingId}`;
    if (!listing.externalListingId || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function requestSearchPage(
  input: EbaySearchInput,
  config: EbayBrowseConfig,
  dependencies: EbayDependencies,
  forceTokenRefresh = false,
): Promise<{ response: Response; payload: unknown; normalizedInput: EbaySearchInput }> {
  const token = await getEbayApplicationToken(config, dependencies, forceTokenRefresh);
  const request = buildEbaySearchRequest(input, config);
  const result = await fetchJson(
    request.url,
    {
      method: "GET",
      headers: { ...request.headers, Authorization: `Bearer ${token.accessToken}` },
    },
    config,
    dependencies,
    "Browse search",
  );
  return { ...result, normalizedInput: request.normalizedInput };
}

export async function searchEbayListings(
  input: EbaySearchInput,
  config: EbayBrowseConfig,
  dependencies: EbayDependencies = {},
): Promise<Record<string, unknown>> {
  const checkedAt = new Date((dependencies.now || Date.now)()).toISOString();
  let result = await requestSearchPage(input, config, dependencies);
  if (!result.response.ok && (result.response.status === 401 || result.response.status === 403)) {
    invalidateEbayToken(config);
    result = await requestSearchPage(input, config, dependencies, true);
  }
  if (!result.response.ok) throw errorForResponse(result.response, result.payload, "Browse search");
  const body = result.payload && typeof result.payload === "object" ? result.payload as Record<string, unknown> : {};
  const itemSummaries = Array.isArray(body.itemSummaries) ? body.itemSummaries as EbayItemSummary[] : [];
  const normalized = deduplicateListings(itemSummaries.map((item) => normalizeEbayListing(item, checkedAt)));
  const postFiltered = applyEbaySearchRuleFilters(normalized, result.normalizedInput, checkedAt);

  return {
    ok: true,
    providerId: "ebay",
    capabilityStatus: "Available",
    checkedAt,
    dataSource: DATA_SOURCE_EXPLANATION,
    listings: postFiltered.listings,
    pagination: {
      offset: boundedInteger(body.offset, Number(result.normalizedInput.offset), 0, 9_999),
      limit: boundedInteger(body.limit, Number(result.normalizedInput.limit), 1, 200),
      total: boundedInteger(body.total, postFiltered.listings.length, 0, Number.MAX_SAFE_INTEGER),
      hasNext: Boolean(body.next),
      hasPrevious: Boolean(body.prev) || Number(result.normalizedInput.offset) > 0,
    },
    deferredFilters: postFiltered.deferredFilters,
    warnings: Array.isArray(body.warnings) ? body.warnings.length : 0,
  };
}

export async function checkEbayHealth(
  verifyToken = false,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: EbayDependencies = {},
): Promise<Record<string, unknown>> {
  const { configured, missing, config } = readEbayConfig(env);
  const checkedAt = new Date((dependencies.now || Date.now)()).toISOString();
  if (!configured) {
    return {
      ok: false,
      configured: false,
      healthy: false,
      providerId: "ebay",
      capabilityStatus: "Not Configured",
      missing,
      environment: config.environment,
      marketplaceId: config.marketplaceId,
      checkedAt,
    };
  }
  if (!verifyToken) {
    return {
      ok: true,
      configured: true,
      healthy: null,
      providerId: "ebay",
      capabilityStatus: "Available",
      message: "Server configuration is present. Use Verify connection to test eBay authorization.",
      environment: config.environment,
      marketplaceId: config.marketplaceId,
      checkedAt,
    };
  }
  const token = await getEbayApplicationToken(config, dependencies);
  return {
    ok: true,
    configured: true,
    healthy: true,
    providerId: "ebay",
    capabilityStatus: "Available",
    message: token.fromCache ? "eBay authorization is healthy (cached application token)." : "eBay authorization is healthy.",
    environment: config.environment,
    marketplaceId: config.marketplaceId,
    tokenExpiresAt: new Date(token.expiresAt).toISOString(),
    checkedAt,
  };
}

export const EBAY_DATA_SOURCE_EXPLANATION = DATA_SOURCE_EXPLANATION;
