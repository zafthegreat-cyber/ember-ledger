import assert from "node:assert/strict";

import {
  buildDropRadarPriceDisplay,
  buildInventoryPriceReliabilityExportRows,
  buildMarketplacePriceWarning,
  buildPriceReliabilityCards,
  buildPriceReliabilitySummary,
  buildPriceReviewFields,
  classifyPriceConfidence,
  formatPriceDisplay,
  normalizePriceSource,
} from "../src/utils/pricingReliabilityUtils.js";

const money = (value) => `$${Number(value).toFixed(2)}`;
const now = new Date("2026-05-21T12:00:00.000Z");

assert.equal(normalizePriceSource("TCGCSV import"), "imported");
assert.equal(normalizePriceSource("manual review"), "manual");
assert.equal(normalizePriceSource("planned sale"), "planned");
assert.equal(normalizePriceSource("unknown placeholder"), "fallback");

assert.equal(classifyPriceConfidence({ value: "", source: "catalog", now }), "Missing");
assert.equal(classifyPriceConfidence({ value: 24, source: "manual", now }), "Manual");
assert.equal(classifyPriceConfidence({ value: 24, source: "catalog", updatedAt: "2026-05-01T00:00:00.000Z", now }), "Estimated");
assert.equal(classifyPriceConfidence({ value: 24, source: "catalog", updatedAt: "2026-01-01T00:00:00.000Z", now }), "Stale");
assert.equal(classifyPriceConfidence({ value: 24, source: "unknown", now }), "Needs Review");

assert.equal(formatPriceDisplay("", { moneyFormatter: money }), "Unknown");
assert.equal(formatPriceDisplay(0, { moneyFormatter: money, missingLabel: "Not set" }), "Not set");
assert.equal(formatPriceDisplay(19.99, { moneyFormatter: money }), "$19.99");

const fields = buildPriceReviewFields(
  {
    unitCost: 12,
    msrpPrice: 49.99,
    msrpSource: "msrp",
    marketPrice: 60,
    marketValueSource: "catalog",
    marketValueUpdatedAt: "2026-05-10T00:00:00.000Z",
    salePrice: 72,
    plannedSalePriceSource: "manual",
  },
  { context: "forge", now, moneyFormatter: money }
);
assert.equal(fields.find((field) => field.role === "msrp").displayValue, "$49.99");
assert.equal(fields.find((field) => field.role === "market").confidence, "Estimated");
assert.equal(fields.find((field) => field.role === "planned").confidence, "Manual");
assert.notEqual(fields.find((field) => field.role === "msrp").value, fields.find((field) => field.role === "market").value);

const summary = buildPriceReliabilitySummary(
  [
    { id: "known", unitCost: 50, marketPrice: 60, marketValueSource: "catalog", marketValueUpdatedAt: "2026-05-01T00:00:00.000Z", salePrice: 70 },
    { id: "manual", unitCost: 24, marketPrice: 42, marketValueSource: "manual", marketPriceReviewedAt: "2026-05-10T00:00:00.000Z" },
    { id: "missing-market", unitCost: 5, salePrice: 12 },
    { id: "stale", marketPrice: 20, marketValueSource: "catalog", lastPriceChecked: "2026-01-01T00:00:00.000Z" },
  ],
  { context: "forge", now }
);

assert.equal(summary.totalRecords, 4);
assert.equal(summary.missingMarketValueCount, 1);
assert.equal(summary.missingPlannedSalePriceCount, 2);
assert.equal(summary.manualPriceCount >= 1, true);
assert.equal(summary.stalePriceCount, 1);
assert.equal(summary.knownCostPercent, 75);
assert.equal(summary.knownMarketValuePercent, 75);
assert.ok(buildPriceReliabilityCards(summary).some((card) => card.label === "Missing market value"));

const exportRows = buildInventoryPriceReliabilityExportRows(summary, { sectionPrefix: "Forge price reliability" });
assert.ok(exportRows.some((row) => row.label === "Manual price records"));
assert.ok(exportRows.some((row) => row.label === "Missing planned sale price"));
assert.ok(exportRows.every((row) => !/guaranteed|official tax/i.test(`${row.label} ${row.notes}`)));

assert.equal(buildMarketplacePriceWarning({ askingPrice: 200 }, {}).trim(), "");
assert.match(buildMarketplacePriceWarning({ askingPrice: 200 }, { marketValue: 100 }), /Double-check this price/i);
assert.match(buildMarketplacePriceWarning({ askingPrice: 5 }, { msrp: 49.99 }), /unusually low/i);

const dropUnknown = buildDropRadarPriceDisplay({}, { moneyFormatter: money });
assert.equal(dropUnknown.msrpDisplay, "MSRP unknown");
assert.equal(dropUnknown.marketDisplay, "Market value unknown");

const dropKnown = buildDropRadarPriceDisplay({ msrpPrice: 49.99, marketPrice: 55, marketValueSource: "catalog" }, { moneyFormatter: money });
assert.equal(dropKnown.msrpDisplay, "$49.99");
assert.equal(dropKnown.marketDisplay, "$55.00");

console.log("Pricing reliability tests passed.");
