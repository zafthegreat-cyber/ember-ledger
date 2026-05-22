import assert from "node:assert/strict";

import {
  buildInventoryValuationExportRows,
  summarizeInventoryValuation,
} from "../src/utils/inventoryValuationUtils.js";
import {
  buildTaxRecordExportRows,
  buildYearEndTaxSummary,
  summarizeSalesRecords,
} from "../src/utils/businessTaxRecords.js";
import { buildEmberAssistFallbackResponse, buildEmberAssistContext } from "../src/utils/emberAssist.js";

const salesSummary = summarizeSalesRecords([
  {
    id: "sale-1",
    itemName: "Prismatic Evolutions ETB",
    platform: "eBay",
    quantitySold: 1,
    grossSale: 75,
    totalFees: 8,
    shippingCost: 5,
    netProceeds: 62,
    costBasis: 50,
    estimatedProfitLoss: 12,
    saleDate: "2026-04-02",
  },
]);

const inventoryItems = [
  { id: "forge-1", name: "ETB", purchaserName: "Zena", quantity: 2, unitCost: 50, marketPrice: 60, salePrice: 70, receiptImage: "receipt.png", createdAt: "2026-01-05" },
  { id: "forge-2", name: "Booster Bundle", purchaserName: "Dillon", quantity: 1, unitCost: 24, salePrice: 32, createdAt: "2026-01-06" },
];

const valuationSummary = summarizeInventoryValuation(inventoryItems, { context: "forge", salesSummary });
assert.equal(valuationSummary.salesSummary.count, 1);
assert.equal(valuationSummary.salesSummary.estimatedProfitLoss, 12);
assert.equal(valuationSummary.totalCostBasis, 124);
assert.equal(valuationSummary.plannedSaleTotal, 172);
assert.equal(valuationSummary.estimatedProfitAtPlannedPrice, 48);

const valuationRows = buildInventoryValuationExportRows(valuationSummary, { sectionPrefix: "Forge planning summary" });
assert.ok(valuationRows.some((row) => row.section === "Forge planning summary" && row.label === "Estimated market value"));
assert.ok(valuationRows.some((row) => row.section === "Forge planning summary purchaser" && row.label === "Zena"));

const yearEndSummary = buildYearEndTaxSummary({
  year: "2026",
  inventoryItems,
  sales: salesSummary.records,
});
assert.equal(yearEndSummary.inventory.valuationSummary.totalCostBasis, 124);
assert.equal(yearEndSummary.inventory.missingMarketValueCount, 1);
assert.equal(yearEndSummary.inventory.receiptCoverage.missingReceipt, 1);

const exportRows = buildTaxRecordExportRows(yearEndSummary);
assert.ok(exportRows.some((row) => row.section === "Inventory valuation" && row.label === "Estimated market value"));
assert.ok(exportRows.some((row) => row.section === "Documentation coverage" && row.label === "Inventory receipts"));
assert.ok(exportRows.every((row) => !/guaranteed deduction|tax filing complete|IRS-ready|official tax report/i.test(`${row.label} ${row.notes}`)));

const profitAnswer = buildEmberAssistFallbackResponse(
  "What does estimated profit mean?",
  buildEmberAssistContext({ activeTab: "inventory" })
);
assert.match(profitAnswer.answer, /planning/i);
assert.match(profitAnswer.answer, /tax professional/i);
assert.doesNotMatch(profitAnswer.answer, /tax advice|guaranteed/i);

console.log("Profit dashboard tests passed.");
