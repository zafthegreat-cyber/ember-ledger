import assert from "node:assert/strict";
import { filterRestockFeed, restockReportObservedLabel, restockReportObservedTimestamp, restockReportSearchText, restockReportStockGroup, restockReportTrustLabel } from "../src/utils/restockFeedPresentation.mjs";

const now = Date.parse("2026-10-19T12:00:00.000Z");
const reports = [
  { id: "stock", stockStatus: "in_stock", observedAt: "2026-10-19T10:00:00.000Z", storeName: "North Collectibles", itemsSeen: [{ productName: "Aurora Booster Bundle" }], marketValue: 37.25 },
  { id: "low", stock_status: "low_stock", observed_at: "2026-10-18T15:00:00.000Z", store_name: "Harbor Cards", items_seen: [{ product_name: "Collector Tin" }] },
  { id: "empty", stockStatus: "empty", reportedAt: "2026-10-17T10:00:00.000Z", storeName: "North Collectibles", note: "Empty shelf at the front" },
  { id: "old-observation", stockStatus: "stock_seen", observedAt: "2026-08-19T10:00:00.000Z", submittedAt: "2026-10-19T11:00:00.000Z", productName: "Aurora Booster Bundle" },
  { id: "unknown-date", stockStatus: "behind_counter", observedAt: "not-a-date", productName: "Aurora Booster Bundle" },
  { id: "future", stockStatus: "in_stock", observedAt: "2026-10-20T10:00:00.000Z" },
  { id: "legacy-date", stockStatus: "no_stock", reportDate: "2026-10-18", reportTime: "09:00", createdAt: "2026-10-19T11:00:00.000Z" },
];
const before = JSON.stringify(reports);
const entries = reports.map((report) => ({ report, stockGroup: restockReportStockGroup(report), observedAt: restockReportObservedTimestamp(report), searchText: restockReportSearchText(report, { nickname: report.id === "stock" ? "North shop" : "", city: report.id === "stock" ? "Norfolk" : "" }) }));
const ids = (filters) => filterRestockFeed(entries, filters, now).map(({ report }) => report.id);
assert.deepEqual(ids({}), reports.map(({ id }) => id), "Any time retains older, unknown and future-dated records without changing input order");
assert.deepEqual(ids({ search: "  NORFOLK aurora  " }), ["stock"], "Search combines terms across resolved store and product fields");
assert.deepEqual(ids({ search: "collector tin" }), ["low"], "Snake-case item names remain searchable");
assert.deepEqual(ids({ search: "empty shelf" }), ["empty"], "Observation notes remain searchable");
assert.deepEqual(ids({ stock: "low" }), ["low"]);
assert.deepEqual(ids({ stock: "empty" }), ["empty", "legacy-date"], "Legacy empty-stock aliases remain filterable");
assert.deepEqual(ids({ stock: "stock", period: "24h" }), ["stock"], "Recent stock excludes old observations newly submitted, invalid dates and future dates");
assert.deepEqual(ids({ period: "7d" }), ["stock", "low", "empty", "legacy-date"]);
assert.deepEqual(ids({ stock: "empty", search: "North", period: "24h" }), [], "All filters compose");
assert.equal(restockReportStockGroup({ stockStatus: "vendor_seen" }), "other", "A vendor sighting alone is not a stock sighting");
assert.equal(restockReportStockGroup({ stockStatus: "customer_service" }), "other", "Directions to a desk alone do not confirm stock");
assert.equal(restockReportStockGroup({ stockStatus: "unknown" }), "other", "Unknown stock is not advertised as available");
assert.equal(restockReportObservedTimestamp(reports[3]), Date.parse(reports[3].observedAt), "Observation time takes priority over upload time");
assert.equal(restockReportObservedTimestamp(reports[4]), null, "Malformed observations do not gain a recent timestamp");
assert.equal(restockReportObservedTimestamp(reports[6]), new Date("2026-10-18T09:00").getTime(), "Legacy visit date/time takes priority over creation time");
assert.equal(restockReportObservedTimestamp({}), null);
assert.equal(restockReportSearchText({}, {}), "");
assert.equal(JSON.stringify(reports), before, "Filters never change stored records, quantities or prices");
assert.equal(reports[0].marketValue, 37.25, "The bundled market value is retained");
assert.equal(restockReportTrustLabel({ verificationStatus: "unverified" }), "Needs confirmation");
assert.equal(restockReportTrustLabel({ verificationStatus: "not_verified" }), "Needs confirmation");
assert.equal(restockReportTrustLabel({ verificationStatus: "pending" }, true), "Photo attached");
assert.equal(restockReportTrustLabel({ verificationStatus: "verified" }), "Verified");
assert.equal(restockReportTrustLabel({ verified: true }), "Verified");
assert.equal(restockReportTrustLabel({ sourceType: "historical_import", verified: true }), "Historical import");
assert.match(restockReportObservedLabel(reports[3], now), /^Observed Aug/, "The card label uses the old observation, not the recent upload");
assert.match(restockReportObservedLabel(reports[5], now), /^Future observation date/, "A future observation never says just now");
assert.equal(restockReportObservedLabel(reports[4], now), "Observation time unavailable");
assert.ok(restockReportSearchText({ catalogProductSnapshot: { productName: "Snapshot Booster" } }).includes("snapshot booster"));
assert.ok(restockReportSearchText({ catalog_product_snapshot: { cardName: "Legacy Snapshot Card" } }).includes("legacy snapshot card"));
console.log("Restock feed presentation: 30 checks passed; local filtering leaves every source report unchanged.");
