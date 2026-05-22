import assert from "node:assert/strict";

import {
  buildSalesRecordFromDraft,
  buildTaxRecordExportRows,
  buildYearEndTaxSummary,
} from "../src/utils/businessTaxRecords.js";

const sale = buildSalesRecordFromDraft({
  manualItemName: "Surging Sparks Booster Bundle",
  saleDate: "2026-04-15",
  platform: "TCGplayer",
  quantitySold: 1,
  finalSalePrice: 38,
  platformFees: 4,
  paymentProcessingFees: 1,
  shippingCost: 3,
  suppliesCost: 1,
  costBasis: 24,
  referenceId: "TCG-100",
}, {}, { id: "sale-1", workspaceId: "workspace-ember-tide" }).sale;

const summary = buildYearEndTaxSummary({
  year: "2026",
  expenses: [
    { id: "expense-1", vendor: "Target Store #123", amount: 50, category: "Inventory/Product Cost", buyer: "Zena", date: "2026-02-01", receiptImage: "target.png" },
    { id: "expense-2", vendor: "USPS", amount: 12, category: "Shipping", buyer: "Dillon", date: "2026-02-02" },
  ],
  mileageTrips: [
    { id: "trip-1", vehicleId: "prius", vehicleName: "Toyota Prius", businessMiles: 14, mileageValue: 9, totalVehicleCost: 4, date: "2026-03-01", purpose: "Shipping/drop-off" },
  ],
  vehicles: [{ id: "prius", name: "Toyota Prius" }],
  inventoryItems: [
    { id: "item-1", name: "Prismatic Evolutions ETB", purchaserName: "Zena", quantity: 2, unitCost: 50, marketPrice: 60, salePrice: 65, createdAt: "2026-01-05" },
  ],
  sales: [sale],
});

assert.equal(summary.sales.count, 1);
assert.equal(summary.sales.itemsSold, 1);
assert.equal(summary.sales.grossSales, 38);
assert.equal(summary.sales.estimatedFees, 5);
assert.equal(summary.sales.estimatedShippingCosts, 3);
assert.equal(summary.sales.estimatedNetProceeds, 29);
assert.equal(summary.sales.estimatedProfitLoss, 5);
assert.equal(summary.sales.receiptCoverage.withReference, 1);
assert.equal(summary.inventory.valuationSummary.totalCostBasis, 100);
assert.equal(summary.inventory.valuationSummary.estimatedMarketValue, 120);
assert.equal(summary.inventory.valuationSummary.plannedSaleTotal, 130);
assert.equal(summary.inventory.receiptCoverage.missingReceipt, 1);
assert.match(summary.disclaimer, /tax professional/i);
assert.doesNotMatch(summary.disclaimer, /deduction|IRS-ready|official tax report/i);

const rows = buildTaxRecordExportRows(summary);
assert.ok(rows.some((row) => row.section === "Expenses" && row.label === "Total expenses"));
assert.ok(rows.some((row) => row.section === "Mileage" && row.label === "Business miles"));
assert.ok(rows.some((row) => row.section === "Inventory" && row.label === "Cost basis"));
assert.ok(rows.some((row) => row.section === "Inventory valuation" && row.label === "Estimated market value"));
assert.ok(rows.some((row) => row.section === "Inventory valuation price reliability" && row.label === "Missing market value"));
assert.ok(rows.some((row) => row.section === "Inventory valuation price reliability" && row.label === "Manual price records"));
assert.ok(rows.some((row) => row.section === "Documentation coverage" && row.label === "Inventory receipts"));
assert.ok(rows.some((row) => row.section === "Sales" && row.label === "Sales revenue"));
assert.ok(rows.some((row) => row.section === "Sales platform" && row.label === "TCGplayer"));
assert.ok(rows.some((row) => row.section === "Documentation coverage" && row.label === "Sales references"));
assert.ok(rows.every((row) => !/guaranteed deduction|tax filing complete|IRS-ready|official tax report/i.test(`${row.label} ${row.notes}`)));

console.log("Year-end export tests passed.");
