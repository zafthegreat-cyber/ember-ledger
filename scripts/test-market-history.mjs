// Weekly market price history: which days are taken from the TCGCSV archives.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { historyDays } from "./build-market-history.mjs";

test("weekly days from the first archive, plus the newest day", () => {
  assert.deepEqual(historyDays("2024-02-08", "2024-02-29", 7), ["2024-02-08", "2024-02-15", "2024-02-22", "2024-02-29"]);
  assert.deepEqual(historyDays("2024-02-08", "2024-03-02", 7), ["2024-02-08", "2024-02-15", "2024-02-22", "2024-02-29", "2024-03-02"]);
  assert.deepEqual(historyDays("2024-03-07", "2024-03-02", 7), [], "nothing new");
});

test("more than two years back to the first archive is about 145 weekly files", () => {
  const days = historyDays("2024-02-08", "2026-11-16", 7);
  assert.ok(days.length > 104 && days.length < 160, String(days.length));
});

test("the workflow only writes to the data branch and never force-pushes", () => {
  const workflow = readFileSync(new URL("../.github/workflows/market-history.yml", import.meta.url), "utf8");
  assert.match(workflow, /git push origin market-history/);
  assert.doesNotMatch(workflow, /push\s+(-f|--force)/);
  assert.match(workflow, /actions\/cache@/, "archives are cached, not downloaded twice");
});
