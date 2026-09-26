import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  EbayApiError,
  applyEbaySearchRuleFilters,
  buildEbaySearchRequest,
  checkEbayHealth,
  clearEbayTokenCache,
  getEbayApplicationToken,
  normalizeEbayListing,
  searchEbayListings,
} = require("../dist/services/ebayBrowse.service.js");
const { createMockEbayFetch } = require("../dist/services/ebayBrowse.mock.js");

const fixtureRoot = fileURLToPath(new URL("./fixtures/ebay/", import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(`${fixtureRoot}${name}`, "utf8"));
const nowValue = Date.parse("2026-08-13T14:00:00.000Z");
const now = () => nowValue;
const config = {
  clientId: "fixture-client-id",
  clientSecret: "fixture-client-secret",
  environment: "production",
  marketplaceId: "EBAY_US",
  timeoutMs: 100,
};

beforeEach(() => clearEbayTokenCache());

test("retrieves an application token with the client-credentials request", async () => {
  const mock = createMockEbayFetch([{ method: "POST", urlIncludes: "/identity/v1/oauth2/token", body: fixture("token-success.json") }]);
  const token = await getEbayApplicationToken(config, { fetchImpl: mock, now });
  assert.equal(token.fromCache, false);
  assert.equal(token.accessToken, "TEST_APPLICATION_TOKEN_NOT_A_REAL_CREDENTIAL");
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].method, "POST");
  assert.match(mock.calls[0].headers.get("authorization") || "", /^Basic /);
  assert.match(mock.calls[0].body, /grant_type=client_credentials/);
  assert.match(mock.calls[0].body, /scope=https%3A%2F%2Fapi\.ebay\.com%2Foauth%2Fapi_scope/);
});

test("caches a valid application token until its expiration safety window", async () => {
  const mock = createMockEbayFetch([{ method: "POST", urlIncludes: "/identity/v1/oauth2/token", body: fixture("token-success.json") }]);
  await getEbayApplicationToken(config, { fetchImpl: mock, now });
  const second = await getEbayApplicationToken(config, { fetchImpl: mock, now });
  assert.equal(second.fromCache, true);
  assert.equal(mock.calls.length, 1);
});

test("refreshes an application token inside the expiration safety window", async () => {
  let currentTime = nowValue;
  const changingNow = () => currentTime;
  const mock = createMockEbayFetch([{ method: "POST", urlIncludes: "/identity/v1/oauth2/token", body: fixture("token-success.json") }]);
  await getEbayApplicationToken(config, { fetchImpl: mock, now: changingNow });
  currentTime += 7_150_000;
  const refreshed = await getEbayApplicationToken(config, { fetchImpl: mock, now: changingNow });
  assert.equal(refreshed.fromCache, false);
  assert.equal(mock.calls.length, 2);
});

test("constructs documented Browse search query parameters and filters", () => {
  const request = buildEbaySearchRequest({
    keywords: "pokemon binder",
    categoryId: "183454",
    gtin: "012345678905",
    minimumPrice: 25,
    maximumPrice: 250,
    currency: "USD",
    conditionIds: ["3000", "4000"],
    buyingOptions: ["FIXED_PRICE", "AUCTION"],
    deliveryCountry: "US",
    deliveryPostalCode: "23510",
    localPickupOnly: true,
    pickupCountry: "US",
    pickupPostalCode: "23510",
    pickupRadius: 35,
    pickupRadiusUnit: "mi",
    limit: 50,
    offset: 100,
  }, config);
  const url = new URL(request.url);
  assert.equal(url.pathname, "/buy/browse/v1/item_summary/search");
  assert.equal(url.searchParams.get("q"), "pokemon binder");
  assert.equal(url.searchParams.get("category_ids"), "183454");
  assert.equal(url.searchParams.get("gtin"), "012345678905");
  assert.equal(url.searchParams.get("sort"), "newlyListed");
  assert.equal(url.searchParams.get("limit"), "50");
  assert.equal(url.searchParams.get("offset"), "100");
  assert.match(url.searchParams.get("filter") || "", /price:\[25\.\.250\],priceCurrency:USD/);
  assert.match(url.searchParams.get("filter") || "", /conditionIds:\{3000\|4000\}/);
  assert.match(url.searchParams.get("filter") || "", /deliveryOptions:\{SELLER_ARRANGED_LOCAL_PICKUP\}/);
});

test("normalizes supplied eBay listing fields without inventing a market value", () => {
  const raw = fixture("search-success.json").itemSummaries[0];
  const listing = normalizeEbayListing(raw, new Date(nowValue).toISOString());
  assert.equal(listing.providerId, "ebay");
  assert.equal(listing.externalListingId, "v1|123456789012|0");
  assert.equal(listing.askingPrice, 125.5);
  assert.equal(listing.purchaseShipping, 12.95);
  assert.equal(listing.sellerName, "fixture-seller");
  assert.equal(listing.productClassification, "Binder or collection");
  assert.equal(listing.listingCreatedAt, "2026-08-13T12:00:00.000Z");
  assert.equal(listing.auctionEndTime, "2026-08-20T12:00:00.000Z");
  assert.equal("marketValue" in listing, false);
  assert.match(String(listing.dataSource), /not sold comparables or market values/i);
});

test("returns pagination metadata and deduplicates provider listing IDs", async () => {
  const mock = createMockEbayFetch([
    { method: "POST", urlIncludes: "/identity/v1/oauth2/token", body: fixture("token-success.json") },
    { method: "GET", urlIncludes: "/item_summary/search", body: fixture("search-success.json") },
  ]);
  const result = await searchEbayListings({ keywords: "pokemon", limit: 2 }, config, { fetchImpl: mock, now });
  assert.equal(result.listings.length, 2);
  assert.deepEqual(result.pagination, { offset: 0, limit: 2, total: 3, hasNext: true, hasPrevious: false });
});

test("maps a request timeout without waiting for live eBay", async () => {
  const neverFetch = () => new Promise(() => undefined);
  await assert.rejects(
    getEbayApplicationToken({ ...config, timeoutMs: 15 }, { fetchImpl: neverFetch, now }),
    (error) => error instanceof EbayApiError && error.code === "timeout" && error.status === 504,
  );
});

test("maps authentication errors without exposing credentials", async () => {
  const mock = createMockEbayFetch([{ method: "POST", urlIncludes: "/identity/v1/oauth2/token", status: 401, body: fixture("auth-error.json") }]);
  await assert.rejects(
    getEbayApplicationToken(config, { fetchImpl: mock, now }),
    (error) => error instanceof EbayApiError && error.code === "authentication_error" && !error.message.includes(config.clientSecret),
  );
});

test("maps eBay rate limits and preserves Retry-After", async () => {
  const mock = createMockEbayFetch([
    { method: "POST", urlIncludes: "/identity/v1/oauth2/token", body: fixture("token-success.json") },
    { method: "GET", urlIncludes: "/item_summary/search", status: 429, headers: { "Retry-After": "120" }, body: fixture("rate-limit-error.json") },
  ]);
  await assert.rejects(
    searchEbayListings({ keywords: "pokemon" }, config, { fetchImpl: mock, now }),
    (error) => error instanceof EbayApiError && error.code === "rate_limited" && error.retryAfterSeconds === 120,
  );
});

test("reports missing server configuration without attempting a request", async () => {
  const health = await checkEbayHealth(false, {}, { now });
  assert.equal(health.configured, false);
  assert.deepEqual(health.missing, ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"]);
  assert.equal(health.capabilityStatus, "Not Configured");
});

test("handles an empty Browse result page", async () => {
  const mock = createMockEbayFetch([
    { method: "POST", urlIncludes: "/identity/v1/oauth2/token", body: fixture("token-success.json") },
    { method: "GET", urlIncludes: "/item_summary/search", body: fixture("search-empty.json") },
  ]);
  const result = await searchEbayListings({ keywords: "no-results" }, config, { fetchImpl: mock, now });
  assert.deepEqual(result.listings, []);
  assert.equal(result.pagination.hasNext, false);
});

test("marks a listing expired when its supplied ending time has passed", () => {
  const listing = normalizeEbayListing({
    itemId: "v1|expired|0",
    title: "Expired listing fixture",
    itemEndDate: "2026-08-12T14:00:00.000Z",
    price: { value: "20", currency: "USD" },
  }, new Date(nowValue).toISOString());
  assert.equal(listing.isExpired, true);
  assert.equal(listing.status, "Expired");
  assert.equal(listing.providerState, "Expired");
});

test("applies supported Search Rules filters and defers appraisal-only thresholds", () => {
  const candidates = [
    { title: "Vintage Pokemon binder", description: "real cards", listingCreatedAt: "2026-08-13T13:00:00.000Z", askingPrice: 100, distance: 10, productClassification: "Binder or collection" },
    { title: "Pokemon binder proxy set", description: "custom", listingCreatedAt: "2026-08-13T13:00:00.000Z", askingPrice: 50, distance: 5, productClassification: "Binder or collection" },
    { title: "Vintage Pokemon binder", description: "older result", listingCreatedAt: "2026-08-10T13:00:00.000Z", askingPrice: 90, distance: 10, productClassification: "Binder or collection" },
  ];
  const result = applyEbaySearchRuleFilters(candidates, {
    excludeKeywords: "proxy, custom",
    newlyListedHours: 24,
    maximumDistance: 35,
    maximumPurchaseAmount: 150,
    productClassifications: ["Binder or collection"],
    minimumProjectedProfit: 40,
    minimumRoi: 25,
    minimumConfidence: "Medium",
  }, new Date(nowValue).toISOString());
  assert.equal(result.listings.length, 1);
  assert.deepEqual(result.deferredFilters, ["minimumProjectedProfit", "minimumRoi", "minimumConfidence"]);
});
