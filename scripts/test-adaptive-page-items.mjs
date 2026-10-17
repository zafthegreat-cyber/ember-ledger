import assert from "node:assert/strict";
import { rankAdaptivePageItems, selectOwnAdaptiveReports } from "../src/utils/adaptivePageItems.js";

const now = Date.parse("2026-10-18T12:00:00Z");
const day = 24 * 60 * 60 * 1000;
const record = (id, daysAgo = 0, extra = {}) => ({ id, createdAt: new Date(now - daysAgo * day).toISOString(), ...extra });
const cards = ["collection", "market", "sales"].map((key) => ({ key, action: () => key }));
const keys = (rows) => rows.map((row) => row.key);
const tests = [];
function test(name, run) {
  try { run(); tests.push({ name, passed: true }); }
  catch (error) { tests.push({ name, passed: false, error: error.message }); }
}

test("new and inactive users retain the predictable baseline order", () => {
  assert.deepEqual(keys(rankAdaptivePageItems(cards, { now })), keys(cards));
  assert.deepEqual(keys(rankAdaptivePageItems(cards, { now, activity: { sales: [] } })), keys(cards));
});

test("recent saved activity promotes its existing shortcut", () => {
  const rows = rankAdaptivePageItems(cards, { now, activity: { sales: [record("sale")] } });
  assert.deepEqual(keys(rows), ["sales", "collection", "market"]);
  assert.equal(rows[0], cards[2]);
  assert.equal(rows[0].action(), "sales");
});

test("repeated recent use takes priority over a one-off save", () => {
  const rows = rankAdaptivePageItems(cards, { now, activity: {
    collection: [record("first")],
    market: [record("watch-1", 2), record("watch-2", 3), record("watch-3", 4)],
  } });
  assert.equal(rows[0].key, "market");
});

test("a large old collection cannot bury a new activity", () => {
  const rows = rankAdaptivePageItems(cards, { now, activity: {
    collection: Array.from({ length: 1000 }, (_, index) => record(`old-${index}`, 90)),
    sales: [record("new")],
  } });
  assert.equal(rows[0].key, "sales");
});

test("background updates do not turn old saved work into new activity", () => {
  const rows = rankAdaptivePageItems(cards, { now, activity: {
    collection: Array.from({ length: 20 }, (_, index) => record(`old-${index}`, 90, { updatedAt: new Date(now).toISOString() })),
    market: [record("watch", 10)],
  } });
  assert.equal(rows[0].key, "market");
});

test("turning smart recommendations off preserves the supplied order", () => {
  assert.deepEqual(keys(rankAdaptivePageItems(cards, { now, enabled: false, activity: { sales: [record("sale")] } })), keys(cards));
});

test("manual preferences take priority over inferred activity", () => {
  const options = { now, manualOrder: true, preferredKeys: ["market", "market", "unavailable"], activity: { sales: [record("sale")] } };
  assert.deepEqual(keys(rankAdaptivePageItems(cards, options)), ["market", "collection", "sales"]);
  assert.deepEqual(keys(rankAdaptivePageItems(cards, { ...options, enabled: false })), ["market", "collection", "sales"]);
});

test("activity and saved preferences cannot introduce missing or forbidden cards", () => {
  const rows = rankAdaptivePageItems(cards.slice(0, 2), { now, activity: { admin: [record("admin")], sales: [record("sale")] } });
  assert.deepEqual(keys(rows), ["collection", "market"]);
  assert.deepEqual(keys(rankAdaptivePageItems(cards.slice(0, 2), { manualOrder: true, preferredKeys: ["admin", "sales"] })), ["collection", "market"]);
});

test("duplicate saved versions do not inflate usage", () => {
  const repeated = record("duplicate", 1);
  const rows = rankAdaptivePageItems(cards, { now, activity: {
    collection: [repeated, repeated, { ...repeated }, { ...repeated }],
    market: [record("watch-a", 1), record("watch-b", 1)],
  } });
  assert.equal(rows[0].key, "market");
});

test("malformed and future timestamps do not count as recent activity", () => {
  const rows = rankAdaptivePageItems(cards, { now, activity: {
    collection: [record("future", -1), { id: "bad", createdAt: "not-a-date" }, { id: "undated" }, null, "2026-10-18"],
    market: [record("valid", 20)],
  } });
  assert.equal(rows[0].key, "market");
});

test("explicit activity buckets support page cards without multiplying their scores", () => {
  const rows = [{ key: "seller", activityKeys: ["sales", "expenses", "sales"] }, { key: "find", activityKeys: ["watchlist"] }];
  const ranked = rankAdaptivePageItems(rows, { now, activity: {
    sales: [record("sale", 2)], expenses: [record("expense", 2)],
    watchlist: [record("watch-a", 2), record("watch-b", 2)],
  } });
  assert.equal(ranked[0].key, "find");
});

test("ties stay stable and input records, arrays and preferences remain untouched", () => {
  const immutableCards = Object.freeze(cards.map(Object.freeze));
  const activity = Object.freeze({ market: Object.freeze([Object.freeze(record("watch"))]), sales: Object.freeze([Object.freeze(record("sale"))]) });
  const preferredKeys = Object.freeze(["sales", "market"]);
  assert.deepEqual(keys(rankAdaptivePageItems(immutableCards, { now, activity })), ["market", "sales", "collection"]);
  assert.deepEqual(keys(rankAdaptivePageItems(immutableCards, { now, activity, preferredKeys, manualOrder: true })), ["sales", "market", "collection"]);
  assert.deepEqual(keys(immutableCards), ["collection", "market", "sales"]);
});

test("record date aliases are supported and invalid clock values do not reorder", () => {
  assert.equal(rankAdaptivePageItems(cards, { now, activity: { sales: [{ id: "sale", saleDate: "2026-10-18" }] } })[0].key, "sales");
  assert.equal(rankAdaptivePageItems(cards, { now, activity: { market: [{ id: "report", submitted_at: new Date(now).toISOString() }] } })[0].key, "market");
  assert.deepEqual(keys(rankAdaptivePageItems(cards, { now: NaN, activity: { sales: [record("sale")] } })), keys(cards));
  assert.deepEqual(rankAdaptivePageItems(null), []);
});

test("shared reports count only when a current account identity matches", () => {
  const reports = [
    { id: "own", userId: "account" },
    { id: "alias", user_id: "profile" },
    { id: "other", userId: "another-account" },
    { id: "public-unowned" },
    { id: "email", guest_email: " COLLECTOR@example.test " },
  ];
  assert.deepEqual(selectOwnAdaptiveReports(reports, { userIds: ["account", "profile"], email: "collector@example.test" }).map((row) => row.id), ["own", "alias", "email"]);
  assert.deepEqual(selectOwnAdaptiveReports(reports), []);
});

test("conflicting report authors cannot be overridden by an email or local fallback", () => {
  const reports = [
    { id: "other", userId: "another-account", email: "collector@example.test" },
    { id: "conflicting-alias", userId: "account", user_id: "another-account" },
    { id: "email-other", email: "other@example.test" },
    { id: "local" },
  ];
  assert.deepEqual(selectOwnAdaptiveReports(reports, { userIds: ["account"], email: "collector@example.test", allowUnownedLocal: true }).map((row) => row.id), ["local"]);
  assert.deepEqual(selectOwnAdaptiveReports(reports, { userIds: ["account"], email: "collector@example.test", allowUnownedLocal: "true" }), []);
});

test("ownership selection returns original records without mutating inputs", () => {
  const own = Object.freeze({ id: "own", userId: "account" });
  const other = Object.freeze({ id: "other", userId: "other-account" });
  const reports = Object.freeze([own, other, null]);
  const scoped = selectOwnAdaptiveReports(reports, { userIds: Object.freeze(["account"]) });
  assert.deepEqual(scoped, [own]);
  assert.equal(scoped[0], own);
  assert.equal(reports.length, 3);
});

for (const result of tests) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.error ? `: ${result.error}` : ""}`);
console.log(`${tests.filter((result) => result.passed).length}/${tests.length} adaptive page tests passed`);
if (tests.some((result) => !result.passed)) process.exitCode = 1;
