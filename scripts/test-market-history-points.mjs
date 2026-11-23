// Price history chart points from the 2-year weekly market history.
import test from "node:test";
import assert from "node:assert/strict";
import { weeklyHistoryPoints, preferredPrintings } from "../src/utils/marketHistoryPoints.mjs";

const rows = [
  { price_subtype: "Holofoil", dates: ["2024-02-08", "2024-02-15", "2024-02-22"], market_cents: [12000, null, 13550] },
  { price_subtype: "Reverse Holofoil", dates: ["2024-02-08", "2024-02-15"], market_cents: [450, 0] },
];

test("weekly rows become dated dollar points, gaps and zeros skipped", () => {
  const points = weeklyHistoryPoints(rows);
  assert.equal(points.length, 3);
  assert.deepEqual(points.map((p) => [p.condition, p.marketPrice]), [["Holofoil", 120], ["Reverse Holofoil", 4.5], ["Holofoil", 135.5]]);
  assert.ok(points.every((p) => !Number.isNaN(Date.parse(p.date))));
  assert.deepEqual(weeklyHistoryPoints(null), []);
});

test("the item's own printing is shown first, otherwise the one with most history", () => {
  const points = weeklyHistoryPoints(rows);
  assert.deepEqual(preferredPrintings(points, "Reverse Holo"), ["Reverse Holofoil", "Holofoil"]);
  assert.deepEqual(preferredPrintings(points, "Holofoil"), ["Holofoil", "Reverse Holofoil"]);
  assert.deepEqual(preferredPrintings(points, ""), ["Holofoil", "Reverse Holofoil"]);
});

test("daily and weekly prices for the same day are drawn once", () => {
  const points = weeklyHistoryPoints([
    { price_subtype: "Holofoil", dates: ["2026-11-12", "2026-11-13"], market_cents: [1000, 1010] },
    { price_subtype: "Holofoil", dates: ["2026-11-05", "2026-11-12"], market_cents: [990, 1000] },
  ]);
  assert.deepEqual(points.map((p) => p.date.slice(0, 10)), ["2026-11-05", "2026-11-12", "2026-11-13"]);
});
