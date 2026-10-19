import assert from "node:assert/strict";
import {
  buildPortfolioCsv, createEmptyPortfolioState, createPortfolioStore,
  getPortfolioItemKey, getPortfolioItemValuation, portfolioNumber,
  portfolioSeries, rankPortfolioItems, selectPortfolioItems,
  summarizePortfolio, validatePortfolioState,
} from "../src/utils/collectionPortfolio.mjs";

let passed = 0;
const test = (name, run) => { run(); passed += 1; console.log(`PASS ${name}`); };
const freeze = (value) => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
function memory(initial = {}) {
  const rows = new Map(Object.entries(initial));
  return { rows, writes: 0, getItem(key) { return rows.has(key) ? rows.get(key) : null; }, setItem(key, value) { this.writes += 1; rows.set(key, value); }, removeItem(key) { this.writes += 1; rows.delete(key); } };
}
const state = () => ({ ...createEmptyPortfolioState(), portfolios: [{ id: "main", name: "Main", favorite: true }, { id: "bought", name: "Bought or traded", favorite: false }] });
const records = freeze([
  { id: "same", _recordOrigin: "repository", name: "Projected box", quantity: 3, projectedResaleMid: "10.25", marketPrice: 999, totalPurchaseCost: 500 },
  { id: "same", _recordOrigin: "legacy", name: "Saved market card", quantity: 2, marketPrice: "20.50", projectedResaleMid: "1" },
  { id: "zero", _recordOrigin: "legacy", name: "Saved zero", quantity: 1, marketPrice: 0, marketValue: 100 },
  { id: "unknown", _recordOrigin: "repository", name: "Unknown", quantity: 4, allocatedItemCost: 888, totalPurchaseCost: 999 },
]);

test("stable item membership distinguishes repository and legacy identity", () => {
  assert.equal(getPortfolioItemKey(records[0]), "repository:same");
  assert.equal(getPortfolioItemKey(records[1]), "legacy:same");
  assert.equal(getPortfolioItemKey({ id: 0, _recordOrigin: "legacy" }), "legacy:0");
  assert.equal(getPortfolioItemKey({ id: "same" }), "");
  assert.equal(getPortfolioItemKey({ id: "", _recordOrigin: "repository" }), "");
});
test("main, all, and custom select references without duplicating or editing originals", () => {
  const prefs = freeze({ ...state(), memberships: { "repository:same": "bought" } });
  const before = JSON.stringify(records);
  assert.deepEqual(selectPortfolioItems(records, prefs, "bought"), [records[0]]);
  assert.deepEqual(selectPortfolioItems(records, prefs, "main"), records.slice(1));
  assert.deepEqual(selectPortfolioItems(records, prefs, "all"), records);
  assert.equal(JSON.stringify(records), before);
  assert.equal(selectPortfolioItems(records, prefs, "bought")[0], records[0]);
});
test("deleted or unknown portfolio references remain visible in main", () => {
  const prefs = { ...state(), portfolios: createEmptyPortfolioState().portfolios, memberships: { "repository:same": "deleted" } };
  assert.deepEqual(selectPortfolioItems(records, prefs, "main"), records);
  assert.deepEqual(selectPortfolioItems(records, prefs, "deleted"), records);
  assert.throws(() => validatePortfolioState(prefs), /membership/);
});
test("returning to main removes only membership metadata", () => {
  const prefs = state(); prefs.memberships[getPortfolioItemKey(records[0])] = "bought";
  delete prefs.memberships[getPortfolioItemKey(records[0])];
  assert.equal(selectPortfolioItems(records, prefs, "main").length, records.length);
  assert.equal(records[0].totalPurchaseCost, 500);
});
test("per-unit repository projections and legacy saved market estimates use quantity", () => {
  assert.deepEqual(getPortfolioItemValuation(records[0]), { value: 30.75, unitValue: 10.25, quantity: 3, source: "projected", label: "Saved projected estimate" });
  assert.equal(getPortfolioItemValuation(records[1]).value, 41);
  assert.equal(getPortfolioItemValuation(records[1]).source, "market");
  assert.equal(getPortfolioItemValuation({ _recordOrigin: "repository", quantity: 2, marketPrice: 7 }).value, 14);
});
test("numeric zero remains known while missing estimates never fall back to costs", () => {
  assert.equal(getPortfolioItemValuation(records[2]).value, 0);
  assert.equal(getPortfolioItemValuation(records[3]).value, null);
  assert.equal(getPortfolioItemValuation({ quantity: 0, marketPrice: 10 }).value, 0);
  assert.equal(getPortfolioItemValuation({ marketPrice: "0" }).value, 0);
});
test("strict monetary parser rejects blanks, currency formatting, booleans, and nonfinite values", () => {
  for (const value of ["", " ", "$12", "1,000", "1e3", "0x10", "+1", "-1", true, false, null, undefined, NaN, Infinity, -1, {}, []]) assert.equal(portfolioNumber(value), null, String(value));
  assert.equal(portfolioNumber("12.50"), 12.5);
  assert.equal(portfolioNumber(0), 0);
  assert.equal(getPortfolioItemValuation({ quantity: "bad", marketPrice: 12 }).value, null);
});
test("summary reports coverage and mixed estimate sources independent of later display filtering", () => {
  const summary = summarizePortfolio(records);
  assert.deepEqual(summary, { total: 71.75, knownCount: 3, totalCount: 4, quantity: 10, isValid: true, marketKnownCount: 2, projectedKnownCount: 1, unknownCount: 1, valuationLabel: "Saved market and projected estimates" });
  const searched = records.filter((row) => row.name.includes("Unknown"));
  assert.equal(searched.length, 1); assert.deepEqual(summarizePortfolio(records), summary);
});
test("ranking uses full holding value, retains known zero and omits unknown prices", () => {
  const ranked = rankPortfolioItems(records);
  assert.deepEqual(ranked.map((row) => row.item.id), ["same", "same", "zero"]);
  assert.equal(ranked[0].item, records[1]);
  assert.equal(ranked[1].value, 30.75);
});
test("aggregate quantity or value overflow is explicit and never Infinity", () => {
  const summary = summarizePortfolio([{ quantity: 1, marketPrice: Number.MAX_SAFE_INTEGER / 100 }, { quantity: 1, marketPrice: Number.MAX_SAFE_INTEGER / 100 }]);
  assert.equal(summary.total, null); assert.equal(summary.isValid, false); assert.equal(Number.isFinite(summary.total), false);
  const quantities = summarizePortfolio([{ quantity: Number.MAX_SAFE_INTEGER / 100 }, { quantity: Number.MAX_SAFE_INTEGER / 100 }]);
  assert.equal(quantities.quantity, null); assert.equal(quantities.isValid, false);
});
const snapshot = (id, at, total, extra = {}) => ({ id, at, portfolioId: "main", total, knownCount: 3, totalCount: 4, quantity: 10, ...extra });
const now = Date.parse("2026-10-19T12:00:00.000Z");
const snapshots = freeze([
  snapshot("old", "2026-03-01T12:00:00.000Z", 50),
  snapshot("first", "2026-10-01T12:00:00.000Z", 70),
  snapshot("last", "2026-10-19T11:00:00.000Z", 77),
  snapshot("future", "2026-10-20T12:00:00.000Z", 999),
]);
test("chart points come only from real dated in-window snapshots", () => {
  const series = portfolioSeries(snapshots, { portfolioId: "main", period: "1M", now });
  assert.deepEqual(series.points.map((row) => row.id), ["first", "last"]);
  assert.equal(series.hasHistory, true); assert.equal(series.change, 7); assert.equal(series.percentChange, 10);
  assert.match(series.coverageLabel, /not investment return/);
  assert.equal(portfolioSeries(snapshots, { portfolioId: "main", period: "1d", now }).hasHistory, false);
  assert.equal(portfolioSeries(snapshots, { portfolioId: "main", period: "max", now }).points.length, 3);
});
test("all six periods filter truthfully and never synthesize missing history", () => {
  for (const period of ["1d", "7d", "1m", "3m", "6m", "max"]) assert.equal(portfolioSeries([], { portfolioId: "main", period, now }).points.length, 0);
  const one = portfolioSeries([snapshots[2]], { portfolioId: "main", now });
  assert.equal(one.change, null); assert.equal(one.percentChange, null); assert.equal(one.hasHistory, false);
  assert.match(one.coverageLabel, /two dated/);
});
test("changed quantity or price coverage is labeled and zero baseline has no percentage", () => {
  const series = portfolioSeries([snapshot("one", "2026-10-01T00:00:00Z", 0), snapshot("two", "2026-10-18T00:00:00Z", 20, { quantity: 11 })], { portfolioId: "main", now });
  assert.equal(series.percentChange, null); assert.equal(series.comparableCoverage, false); assert.match(series.coverageLabel, /not directly comparable/);
});
test("invalid/future dates and other portfolio snapshots never leak into a series", () => {
  const rows = [...snapshots, snapshot("bad", "not a date", 1), snapshot("impossible", "2026-02-31T00:00:00Z", 1), snapshot("other", "2026-10-18T00:00:00Z", 1, { portfolioId: "other" }), snapshot("nan", "2026-10-18T00:00:00Z", NaN)];
  assert.deepEqual(portfolioSeries(rows, { portfolioId: "main", now }).points.map((row) => row.id), ["first", "last"]);
  assert.equal(portfolioSeries(rows, { portfolioId: "main", now: "bad" }).points.length, 0);
});
test("snapshot validation rejects impossible dates and unlabeled local times", () => {
  for (const at of ["2026-02-31T00:00:00Z", "2026-10-19T24:00:00Z", "2026-10-19T00:00:00", "2026-10-19", "2026-10-19T00:99:00Z"]) {
    assert.throws(() => validatePortfolioState({ ...state(), snapshots: [snapshot("invalid", at, 1)] }), /snapshot/);
  }
  validatePortfolioState({ ...state(), snapshots: [snapshot("valid", "2024-02-29T00:00:00.000Z", 1)] });
});
test("one timestamp cannot fabricate a two-point history", () => {
  const rows = [snapshot("one", "2026-10-18T00:00:00Z", 20), snapshot("two", "2026-10-18T00:00:00Z", 30)];
  const series = portfolioSeries(rows, { portfolioId: "main", now });
  assert.equal(series.points.length, 1); assert.equal(series.hasHistory, false);
});
test("unpriced nonempty snapshots are not charted as zero value", () => {
  const rows = [snapshot("unpriced", "2026-10-01T00:00:00Z", 0, { knownCount: 0 }), snapshot("empty", "2026-10-02T00:00:00Z", 0, { knownCount: 0, totalCount: 0, quantity: 0 })];
  const series = portfolioSeries(rows, { portfolioId: "main", now });
  assert.deepEqual(series.points.map((row) => row.id), ["empty"]); assert.equal(series.hasHistory, false);
});
test("CSV exports only presentation columns and neutralizes spreadsheet formulas", () => {
  const csv = buildPortfolioCsv([{ ...records[0], name: ' =HYPERLINK("private")', notes: "PRIVATE", cardNumber: "PRIVATE-CERT", email: "PRIVATE-EMAIL" }]);
  assert.match(csv, /"' =HYPERLINK\(""private""\)"/);
  assert.match(csv, /30.75/); assert.doesNotMatch(csv, /PRIVATE|totalPurchaseCost|repository:/);
  const hidden = buildPortfolioCsv(records, { includeValues: false });
  assert.doesNotMatch(hidden, /"(?:30\.75|41|71\.75)"|Unit estimate USD|Total estimate USD|Estimate source/);
  assert.equal(hidden.split("\r\n")[0], '"Name","Game","Classification","Set","Quantity"');
  assert.match(buildPortfolioCsv([{ ...records[0], tcgGame: "magic" }]), /"Magic: The Gathering"/);
  assert.match(buildPortfolioCsv([{ ...records[0], tcgGame: "=PRIVATE-GAME()" }]), /"'=PRIVATE-GAME\(\)"/);
});
test("loading empty scoped storage performs no write", () => {
  const storage = memory(); const store = createPortfolioStore({ storage, scope: "account:one|workspace:one" });
  const result = store.load(); assert.equal(result.ok, true); assert.equal(result.writable, true); assert.deepEqual(result.state, createEmptyPortfolioState()); assert.equal(storage.writes, 0);
});
test("valid metadata writes verify and reload without changing records", () => {
  const storage = memory(); const store = createPortfolioStore({ storage, scope: "one" }); store.load();
  const result = store.update((draft) => { draft.portfolios.push({ id: "custom", name: "Trade favorites", favorite: false }); draft.memberships["repository:same"] = "custom"; return draft; });
  assert.equal(result.ok, true); assert.equal(storage.writes, 1); assert.equal(createPortfolioStore({ storage, scope: "one" }).load().state.memberships["repository:same"], "custom");
  assert.equal(records[0].quantity, 3); assert.equal(records[0].totalPurchaseCost, 500);
});
test("selected portfolio survives reload and cannot refer to a removed group", () => {
  const storage = memory(); const store = createPortfolioStore({ storage, scope: "one" }); store.load();
  assert.equal(store.update(() => ({ ...state(), selectedPortfolioId: "bought" })).ok, true);
  assert.equal(createPortfolioStore({ storage, scope: "one" }).load().state.selectedPortfolioId, "bought");
  assert.equal(store.update((draft) => { draft.portfolios = draft.portfolios.filter((row) => row.id !== "bought"); }).ok, false);
  assert.equal(store.update((draft) => { draft.selectedPortfolioId = "all"; }).ok, true);
});
test("account and workspace keys remain isolated without implicit fallback scope", () => {
  const storage = memory(); const a = createPortfolioStore({ storage, scope: "account-a:workspace-a" }); const b = createPortfolioStore({ storage, scope: "account-b:workspace-a" }); const c = createPortfolioStore({ storage, scope: "account-a:workspace-b" });
  a.load(); a.update((draft) => { draft.portfolios[0].name = "Private A"; });
  assert.equal(b.load().state.portfolios[0].name, "Main"); assert.equal(c.load().state.portfolios[0].name, "Main");
  const missing = createPortfolioStore({ storage }); assert.equal(missing.load().writable, false); assert.equal(missing.update(() => state()).ok, false); assert.equal(missing.key, "");
});
test("corrupt and unsupported copies are kept byte-for-byte and cannot be overwritten", () => {
  for (const raw of ["not json", "", JSON.stringify({ ...createEmptyPortfolioState(), version: 2 }), '{"version":1,"portfolios":[],"memberships":{},"snapshots":[],"__proto__":{}}']) {
    const storage = memory(); const store = createPortfolioStore({ storage, scope: "one" }); storage.rows.set(store.key, raw);
    const result = store.load(); assert.equal(result.ok, false); assert.equal(result.writable, false); assert.equal(store.update(() => state()).ok, false); assert.equal(storage.rows.get(store.key), raw); assert.equal(storage.writes, 0);
  }
});
test("storage read denial never attempts a default save", () => {
  const storage = { getItem() { throw new Error("Read denied"); }, setItem() { throw new Error("Unexpected write"); } };
  const store = createPortfolioStore({ storage, scope: "one" }); assert.equal(store.load().ok, false); assert.equal(store.update(() => state()).ok, false);
});
test("quota error preserves old bytes and UI state", () => {
  const storage = memory(); const store = createPortfolioStore({ storage, scope: "one" }); store.load(); store.update(() => state()); const raw = storage.rows.get(store.key);
  storage.setItem = () => { throw new Error("Quota exceeded"); };
  const result = store.update((draft) => { draft.portfolios[0].name = "Changed"; });
  assert.equal(result.ok, false); assert.match(result.error, /Quota/); assert.equal(result.state.portfolios[0].name, "Main"); assert.equal(storage.rows.get(store.key), raw);
});
test("cross-tab stale save fails until explicitly reloaded", () => {
  const storage = memory(); const a = createPortfolioStore({ storage, scope: "one" }); const b = createPortfolioStore({ storage, scope: "one" }); a.load(); b.load();
  a.update((draft) => { draft.portfolios[0].name = "Other tab"; }); const raw = storage.rows.get(a.key);
  const result = b.update((draft) => { draft.portfolios[0].name = "Stale"; }); assert.equal(result.ok, false); assert.match(result.error, /another tab/); assert.equal(storage.rows.get(a.key), raw);
  assert.equal(b.load().state.portfolios[0].name, "Other tab"); assert.equal(b.update((draft) => { draft.portfolios[0].favorite = false; }).ok, true);
});
test("failed verified write rolls back only its own bytes", () => {
  const storage = memory(); const store = createPortfolioStore({ storage, scope: "one" }); store.load(); store.update(() => state()); const original = storage.rows.get(store.key); const baseGet = storage.getItem.bind(storage); const baseSet = storage.setItem.bind(storage); let nextVerification = false;
  storage.setItem = (key, value) => { baseSet(key, value); nextVerification = true; };
  storage.getItem = (key) => { if (nextVerification) { nextVerification = false; throw new Error("Verification read failed"); } return baseGet(key); };
  const result = store.update((draft) => { draft.portfolios[0].name = "Unconfirmed"; }); assert.equal(result.ok, false); assert.equal(storage.rows.get(store.key), original);
});
test("another writer's bytes during verification are never rolled back", () => {
  const storage = memory(); const store = createPortfolioStore({ storage, scope: "one" }); store.load(); const external = JSON.stringify({ ...state(), portfolios: [{ id: "main", name: "External", favorite: true }, state().portfolios[1]] });
  storage.setItem = (key) => { storage.rows.set(key, external); };
  const result = store.update(() => state()); assert.equal(result.ok, false); assert.equal(storage.rows.get(store.key), external);
});
test("invalid updates are rejected before any write", () => {
  const storage = memory(); const store = createPortfolioStore({ storage, scope: "one" }); store.load();
  for (const mutate of [
    (draft) => { draft.portfolios = []; },
    (draft) => { draft.portfolios[0].name = "x".repeat(61); },
    (draft) => { draft.portfolios.push({ id: "other", name: "main", favorite: false }); },
    (draft) => { draft.memberships["repository:same"] = "main"; },
    (draft) => { draft.snapshots.push(snapshot("bad", "2026-10-19T00:00:00Z", Infinity)); },
    (draft) => { draft.snapshots = Array.from({ length: 501 }, (_, i) => snapshot(`s${i}`, "2026-10-19T00:00:00Z", 1)); },
    (draft) => { draft.memberships = JSON.parse('{"__proto__":"main"}'); },
  ]) assert.equal(store.update(mutate).ok, false);
  assert.equal(storage.writes, 0);
});
test("frozen original record bytes, prices, purpose, and binders remain untouched", () => {
  const record = freeze({ ...records[0], ownedItemPurpose: "PERSONAL_COLLECTION", purposeHistory: [{ reason: "Original" }], binderId: "binder-one", marketPrice: 999 }); const before = JSON.stringify(record);
  getPortfolioItemValuation(record); summarizePortfolio([record]); rankPortfolioItems([record]); buildPortfolioCsv([record]); selectPortfolioItems([record], state(), "all");
  assert.equal(JSON.stringify(record), before);
});

console.log(`\n${passed} collection portfolio scenarios passed.`);
