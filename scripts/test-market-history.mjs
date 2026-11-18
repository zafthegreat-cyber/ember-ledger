// Market price history: weekly for every product, daily for popular products.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { historyDays, nextWeeklyDays, popularKeys } from "./build-market-history.mjs";

test("weekly days stay on the grid from the first archive", () => {
  assert.deepEqual(historyDays("2024-02-08", "2024-02-29"), ["2024-02-08", "2024-02-15", "2024-02-22", "2024-02-29"]);
  assert.deepEqual(historyDays("2024-02-08", "2024-03-02"), ["2024-02-08", "2024-02-15", "2024-02-22", "2024-02-29"]);
  assert.deepEqual(nextWeeklyDays([], "2024-02-20"), ["2024-02-08", "2024-02-15"]);
  assert.deepEqual(nextWeeklyDays(["2024-02-08", "2024-02-15"], "2024-02-28"), ["2024-02-22"]);
  assert.deepEqual(nextWeeklyDays(["2024-02-08", "2024-02-15"], "2024-02-21"), [], "nothing new until the next week");
});

test("more than two years back to the first archive is about 145 weekly files", () => {
  const days = historyDays("2024-02-08", "2026-11-16");
  assert.ok(days.length > 104 && days.length < 160, String(days.length));
});

test("popular = newest sets + highest value + biggest movers", () => {
  const latest = new Map([["1|Normal", 100], ["2|Holofoil", 90000], ["3|Normal", 2000], ["4|Normal", 800], ["5|Normal", 300]]);
  const groupOf = new Map([["1|Normal", "500"], ["2|Holofoil", "100"], ["3|Normal", "101"], ["4|Normal", "102"], ["5|Normal", "103"]]);
  const weekAgo = new Map([["3|Normal", 1000], ["4|Normal", 790], ["5|Normal", 100]]);
  const keys = popularKeys(latest, groupOf, weekAgo, { newestSets: 1, topValue: 1, topMovers: 1, minMoverCents: 500 });
  assert.ok(keys.has("1|Normal"), "newest set");
  assert.ok(keys.has("2|Holofoil"), "highest value");
  assert.ok(keys.has("3|Normal"), "doubled this week");
  assert.ok(!keys.has("4|Normal"), "barely moved");
  assert.ok(!keys.has("5|Normal"), "cheap movers are ignored");
});

test("the workflow writes only to the data branch, never force-pushes, and keeps its cache", () => {
  const workflow = readFileSync(new URL("../.github/workflows/market-history.yml", import.meta.url), "utf8");
  assert.match(workflow, /git push origin market-history/);
  assert.doesNotMatch(workflow, /push\s+(-f|--force)/);
  assert.match(workflow, /actions\/cache\/save@[^\n]*\n\s+if: always\(\)/, "progress is kept even when a run fails");
});
