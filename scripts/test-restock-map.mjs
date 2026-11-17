// Restock map rows (src/features/restocks/restockMapRows.js): which stores get
// pins, in what order, and that only the latest recent public report is used.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRestockMapRows, describeLatestReport, RESTOCK_MAP_RECENT_HOURS } from "../src/features/restocks/restockMapRows.js";

const now = Date.parse("2026-11-17T18:00:00Z");
const hoursAgo = (h) => new Date(now - h * 3600000).toISOString();
const stores = [
  { id: "a", name: "Alpha Target", city: "Norfolk", state: "VA", latitude: 36.85, longitude: -76.28 },
  { id: "b", name: "Beta Games", city: "Chesapeake", state: "VA" },
  { id: "c", name: "Gamma Walmart", city: "Suffolk", state: "VA", latitude: 36.72, longitude: -76.58 },
  { id: "d", name: "No place" },
  { id: "a", name: "Duplicate" },
];

test("stores with a recent report come first, then followed, then exact, then by-city", () => {
  const rows = buildRestockMapRows({ stores, now, isFollowed: (s) => s.id === "b",
    reports: [{ storeId: "c", status: "confirmed", productName: "Booster box", observedAt: hoursAgo(3) }] });
  assert.deepEqual(rows.map((r) => r.id), ["c", "b", "a"]);
  assert.equal(rows[0].report.productName, "Booster box");
  assert.equal(rows[1].exact, false);
  assert.equal(rows[1].latitude, undefined, "no invented coordinates; the map places by city");
  assert.equal(rows.some((r) => r.id === "d"), false, "a store with no coordinates and no city is left off");
});

test("only the latest public report inside the window is used", () => {
  const rows = buildRestockMapRows({ stores, now, reports: [
    { storeId: "a", productName: "Old", observedAt: hoursAgo(RESTOCK_MAP_RECENT_HOURS + 1) },
    { storeId: "a", productName: "Private", observedAt: hoursAgo(1), visibility: "private" },
    { storeId: "a", productName: "Archived", observedAt: hoursAgo(1), archivedAt: hoursAgo(0.5) },
    { storeId: "a", productName: "Earlier", observedAt: hoursAgo(20) },
    { storeId: "a", productName: "Latest", observedAt: hoursAgo(5) },
    { storeId: "a", productName: "Future", observedAt: hoursAgo(-5) },
  ] });
  assert.equal(rows.find((r) => r.id === "a").report.productName, "Latest");
  const none = buildRestockMapRows({ stores, now, reports: [{ storeId: "a", productName: "Old", observedAt: hoursAgo(72) }] });
  assert.equal(none.find((r) => r.id === "a").report, null);
});

test("pin limit and report wording", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, name: `Store ${i}`, city: "Norfolk" }));
  assert.equal(buildRestockMapRows({ stores: many, now }).length, 12);
  assert.match(describeLatestReport(null).headline, /No report/);
  assert.match(describeLatestReport({ status: "confirmed", productName: "ETB", observedAt: hoursAgo(2) }, now).headline, /^Confirmed/);
  const empty = describeLatestReport({ reportType: "no_stock", productName: "ETB", observedAt: hoursAgo(2) }, now);
  assert.equal(empty.tone, "empty");
  assert.doesNotMatch(JSON.stringify(describeLatestReport({ status: "reported", productName: "ETB", quantity: 14, observedAt: hoursAgo(2) }, now)), /14/, "no stock quantities");
});
