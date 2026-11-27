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

test("competitive wiring: follow from the map, wants become alerts, value on Home", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const card = read("src/features/restocks/RestockMapCard.jsx");
  assert.match(card, /Follow for free alerts/);
  assert.match(card, /onFollowStore\(selected\.store\)/);
  const app = read("src/App.jsx");
  assert.match(app, /onFollowStore: \(store\) => favoriteSearchStore\(store\)/);
  assert.match(app, /addSavedSearch\(savedSearches, product\.name, \{ label: "From your wants" \}\)/);
  const home = read("src/pages/OperationsHome.jsx");
  assert.match(home, /!kidSafeView && collectionWorth\.knownCount > 0/, "no money shown in the kid-safe view");
});

test("wiring: Find > Restocks loads the state's store directory and the map waits for it", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const app = read("src/App.jsx");
  // Nov 27 2026: a fresh visit showed only five hand-typed stores, at guessed spots.
  assert.match(app, /\(activeTab === "flipScout" && flipScoutView === "restocks"\) \|\|/, "the directory loads on Find > Restocks");
  assert.match(app, /storesLoading: storeDirectorySeedStatus === "idle" \|\| storeDirectorySeedStatus === "loading"/);
  assert.match(read("src/features/flipScout/screens/RestocksScreen.jsx"), /storesLoading=\{Boolean\(restockMap\.storesLoading\)\}/);
  const card = read("src/features/restocks/RestockMapCard.jsx");
  assert.match(card, /pins=\{storesLoading \? \[\] : pins\}/, "no guessed pins while the directory loads");
  assert.match(card, /busiestPoints\(/, "with nothing reported or followed it opens on the busiest town");
  assert.doesNotMatch(card, /maxPins: 60\b/, "pins follow the map instead of a fixed 60");
});

test("with a chosen area, only nearby stores show, nearest first, followed stores kept", () => {
  const austin = { lat: 30.2672, lng: -97.7431, city: "Austin", state: "TX" };
  const stores = [
    { id: "far", name: "Virginia Beach Target", city: "Virginia Beach", state: "VA", latitude: 36.85, longitude: -75.98 },
    { id: "near", name: "Round Rock Target", city: "Round Rock", state: "TX", latitude: 30.5083, longitude: -97.6789 },
    { id: "closer", name: "Austin Walmart", city: "Austin", state: "TX", latitude: 30.30, longitude: -97.74 },
    { id: "nocoords", name: "Austin GameStop", city: "Austin", state: "TX" },
    { id: "followed-far", name: "Richmond Best Buy", city: "Richmond", state: "VA", latitude: 37.54, longitude: -77.43 },
  ];
  const rows = buildRestockMapRows({ stores, isFollowed: (store) => store.id === "followed-far", area: austin, radius: 25 });
  const ids = rows.map((row) => row.id);
  assert.ok(!ids.includes("far"), "stores outside the radius are left off");
  assert.ok(ids.includes("followed-far"), "followed stores always stay");
  assert.ok(ids.includes("nocoords"), "a store in the chosen city counts as nearby");
  assert.ok(ids.indexOf("closer") < ids.indexOf("near"), "nearest first");
  assert.equal(buildRestockMapRows({ stores: [stores[0]], area: austin }).length, 0, "nothing nearby gives an empty map, not far-away pins");
  assert.equal(buildRestockMapRows({ stores: [stores[0]] }).length, 1, "with no area chosen every store can show");
});
