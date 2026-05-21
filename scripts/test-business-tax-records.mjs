import assert from "node:assert/strict";

import {
  buildTaxRecordExportRows,
  buildYearEndTaxSummary,
  groupExpensesByVendor,
  groupMileageByVehicle,
  normalizeBusinessVendor,
  summarizePurchaserInventory,
} from "../src/utils/businessTaxRecords.js";

assert.equal(normalizeBusinessVendor("Walmart Store #1234").label, "Walmart");
assert.equal(normalizeBusinessVendor("Target location 456").label, "Target");

const expenses = [
  { id: "e1", vendor: "Walmart Store #1234", amount: 40, category: "Inventory", buyer: "Zena", date: "2026-02-01", receiptImage: "receipt-a.png" },
  { id: "e2", vendor: "Wal-Mart Supercenter", amount: 15, category: "Shipping", buyer: "Dillon", date: "2026-02-02" },
  { id: "e3", vendor: "Target", amount: 20, category: "Supplies", buyer: "Zena", date: "2025-12-31" },
];

const expenseGroups = groupExpensesByVendor(expenses.slice(0, 2));
assert.equal(expenseGroups.length, 1);
assert.equal(expenseGroups[0].vendorName, "Walmart");
assert.equal(expenseGroups[0].count, 2);
assert.equal(expenseGroups[0].total, 55);
assert.equal(expenseGroups[0].missingReceiptCount, 1);

const mileageGroups = groupMileageByVehicle([
  { id: "m1", vehicleId: "prius", vehicleName: "Toyota Prius", businessMiles: 12.5, totalVehicleCost: 4, mileageValue: 8, date: "2026-03-01" },
  { id: "m2", vehicleId: "prius", vehicleName: "Toyota Prius", businessMiles: 7.5, totalVehicleCost: 3, mileageValue: 5, date: "2026-03-02" },
  { id: "m3", vehicleName: "Honda Van", businessMiles: 10, totalVehicleCost: 6, mileageValue: 7, date: "2026-03-03" },
]);
assert.equal(mileageGroups.length, 2);
assert.equal(mileageGroups.find((group) => group.vehicleName === "Toyota Prius").tripCount, 2);
assert.equal(mileageGroups.find((group) => group.vehicleName === "Toyota Prius").totalMiles, 20);

const purchaserTotals = summarizePurchaserInventory([
  { id: "i1", name: "ETB", purchaserName: "Zena", quantity: 4, unitCost: 50, marketPrice: 55, salePrice: 60 },
  { id: "i2", name: "ETB", purchaserName: "Dillon", quantity: 3, unitCost: 48, marketPrice: 54, salePrice: 59 },
]);
assert.equal(purchaserTotals.find((row) => row.name === "Zena").quantity, 4);
assert.equal(purchaserTotals.find((row) => row.name === "Dillon").costBasis, 144);

const summary = buildYearEndTaxSummary({
  year: "2026",
  expenses,
  mileageTrips: mileageGroups.flatMap((group) => group.trips),
  vehicles: [],
  inventoryItems: [
    { id: "i1", name: "ETB", purchaserName: "Zena", quantity: 4, unitCost: 50, marketPrice: 55, salePrice: 60, createdAt: "2026-01-05" },
    { id: "i2", name: "ETB", purchaserName: "Dillon", quantity: 3, unitCost: 48, marketPrice: 54, salePrice: 59, createdAt: "2026-01-06" },
  ],
  sales: [{ id: "s1", grossSale: 120, netProfit: 32, createdAt: "2026-04-01" }],
});

assert.equal(summary.expenses.count, 2);
assert.equal(summary.expenses.total, 55);
assert.equal(summary.mileage.totalMiles, 30);
assert.equal(summary.inventory.quantity, 7);
assert.equal(summary.inventory.costBasis, 344);
assert.equal(summary.sales.revenue, 120);
assert.match(summary.disclaimer, /tax professional/i);

const rows = buildTaxRecordExportRows(summary);
assert.ok(rows.some((row) => row.section === "Expense vendor" && row.label === "Walmart"));
assert.ok(rows.some((row) => row.section === "Mileage vehicle" && row.label === "Toyota Prius"));
assert.ok(rows.some((row) => row.section === "Inventory purchaser" && row.label === "Zena"));

console.log("Business tax record tests passed.");
