import assert from "node:assert/strict";
import { test } from "node:test";
import { filterRestockFeed, prepareRestockFeedEntries, restockFeedBrowseState, restockFeedLocationOptions } from "../src/utils/restockFeedPresentation.mjs";

const now = Date.parse("2026-10-19T12:00:00.000Z");
const hour = 60 * 60 * 1000;
const observed = (hours) => new Date(now - hours * hour).toISOString();
const reports = [
  { id: "stock-a", stockStatus: "in_stock", observedAt: observed(2), storeId: "norfolk-a", productName: "Aurora Bundle", quantity: 3, marketValue: 114.65 },
  { id: "low-a", stockStatus: "low_stock", observedAt: observed(3), storeId: "norfolk-a", productName: "Aurora Tin" },
  { id: "empty-b", stockStatus: "no_stock", observedAt: observed(25), storeId: "norfolk-b", productName: "Aurora Bundle" },
  { id: "stock-other-state", stockStatus: "stock_seen", observedAt: observed(5), storeId: "other-norfolk", productName: "Aurora Bundle" },
  { id: "future", stockStatus: "in_stock", observedAt: observed(-1), storeId: "norfolk-a", productName: "Aurora Bundle" },
  { id: "invalid", stockStatus: "in_stock", observedAt: "bad-date", storeId: "norfolk-a", productName: "Aurora Bundle" },
  { id: "unknown", stockStatus: "customer_service", retailer: "Independent", city: "Richmond", region: "VA" },
];
const stores = {
  "norfolk-a": { chain: "  Target ", city: "Norfolk", region: "VA" },
  "norfolk-b": { retailer: "Walmart", city: " NORFOLK ", region: "va" },
  "other-norfolk": { chain: "target", city: "Norfolk", region: "NE" },
  "private-unrelated": { chain: "Private retailer", city: "Private City", region: "VA" },
};
const resolveStore = (report) => stores[report.storeId];
const entries = prepareRestockFeedEntries(reports, resolveStore);
const cityVA = JSON.stringify(["norfolk", "va"]);
const ids = (rows) => rows.map(({ report }) => report.id);

test("area choices are deduplicated and limited to supplied visible reports", () => {
  const options = restockFeedLocationOptions(entries);
  assert.deepEqual(options.retailers.map(({ value }) => value).sort(), ["independent", "target", "walmart"]);
  assert.equal(options.cities.length, 3);
  assert.ok(options.cities.some(({ value }) => value === cityVA));
  assert.ok(options.cities.some(({ value }) => value === JSON.stringify(["norfolk", "ne"])));
  assert.ok(!JSON.stringify(options).includes("Private"), "Unrelated directory entries never produce an option or count");
});

test("retailer, city, status, time and product filters compose", () => {
  assert.deepEqual(ids(filterRestockFeed(entries, { retailer: "target", city: cityVA, search: "aurora", stock: "stock", period: "24h" }, now)), ["stock-a"]);
  assert.deepEqual(ids(filterRestockFeed(entries, { city: cityVA, stock: "empty" }, now)), ["empty-b"]);
  assert.deepEqual(filterRestockFeed(entries, { retailer: "no-longer-visible" }, now), [], "An unavailable selection does not silently widen the feed");
});

test("stock counts keep other filters and include no invented inventory", () => {
  const result = restockFeedBrowseState(entries, { retailer: "target", city: cityVA, period: "24h", stock: "low" }, now);
  assert.deepEqual(result.counts, { all: 2, stock: 1, low: 1, empty: 0 });
  assert.deepEqual(ids(result.matches), ["low-a"]);
  assert.equal(result.recentCount, 1);
  const all = restockFeedBrowseState(entries, {}, now);
  assert.equal(all.counts.all, reports.length, "Unknown status still counts as a report");
  assert.equal(all.counts.stock, 4, "Counts describe observations, including explicitly future/undated reports in Any time");
  assert.equal(all.counts.low + all.counts.stock + all.counts.empty, reports.length - 1, "A desk direction does not become stock seen");
});

test("freshness is based on observation time; never upload time or future dates", () => {
  const edges = prepareRestockFeedEntries([
    { id: "boundary", observedAt: observed(24) },
    { id: "past-boundary", observedAt: new Date(now - 24 * hour - 1).toISOString() },
    { id: "now", observedAt: new Date(now).toISOString() },
    { id: "future", observedAt: new Date(now + 1).toISOString() },
    { id: "missing" },
    { id: "invalid", observedAt: "invalid", submittedAt: new Date(now).toISOString() },
    { id: "old-observed-new-upload", observedAt: observed(25), submittedAt: new Date(now).toISOString() },
    { id: "offset", observedAt: "2026-10-19T09:00:00-03:00" },
  ]);
  const result = restockFeedBrowseState(edges, {}, now);
  assert.equal(result.recentCount, 3, "Includes exact 24h boundary, current instant and equivalent timezone offset");
  assert.equal(result.undatedCount, 2);
  assert.deepEqual(new Set(ids(filterRestockFeed(edges, { period: "24h" }, now))), new Set(["boundary", "now", "offset"]));
  assert.equal(restockFeedBrowseState(edges, { search: "no match" }, now).recentCount, 0);
});

test("seven-day edge and legacy date/time retain established semantics", () => {
  const edges = prepareRestockFeedEntries([
    { id: "week", observedAt: observed(168) },
    { id: "older", observedAt: new Date(now - 168 * hour - 1).toISOString() },
    { id: "legacy", reportDate: "2026-10-18", reportTime: "09:00", createdAt: observed(-1) },
  ]);
  assert.deepEqual(new Set(ids(filterRestockFeed(edges, { period: "7d" }, now))), new Set(["week", "legacy"]));
  assert.equal(edges.find(({ report }) => report.id === "legacy").observedAt, new Date("2026-10-18T09:00").getTime());
});

test("null stores, absent area data and empty inputs remain usable", () => {
  const rows = prepareRestockFeedEntries([{ id: "none" }, { id: "fallback", retailer: "Local Cards", city: "Town" }], () => null);
  assert.equal(restockFeedLocationOptions(rows).retailers.length, 1);
  assert.equal(filterRestockFeed(rows, {}, now).length, 2);
  assert.deepEqual(restockFeedBrowseState([], {}, now), { matches: [], counts: { all: 0, stock: 0, low: 0, empty: 0 }, recentCount: 0, undatedCount: 0 });
});

test("preparation and repeated filter review never mutate records, prices or store data", () => {
  const before = JSON.stringify({ reports, stores });
  const originalOrder = reports.map(({ id }) => id);
  for (const filters of [{}, { retailer: "target", city: cityVA }, { stock: "empty", period: "7d" }, { search: "aurora bundle" }]) {
    const rows = prepareRestockFeedEntries(reports, resolveStore);
    restockFeedLocationOptions(rows);
    restockFeedBrowseState(rows, filters, now);
  }
  assert.equal(JSON.stringify({ reports, stores }), before);
  assert.deepEqual(reports.map(({ id }) => id), originalOrder);
  assert.equal(reports[0].quantity, 3);
  assert.equal(reports[0].marketValue, 114.65);
});
