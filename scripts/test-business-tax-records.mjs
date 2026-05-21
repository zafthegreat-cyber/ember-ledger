import assert from "node:assert/strict";

import {
  buildTaxRecordExportRows,
  buildMileageExportRows,
  buildYearEndTaxSummary,
  expenseFromReceiptLine,
  expenseHasReceipt,
  groupExpensesByVendor,
  groupMileageByVehicle,
  normalizeBusinessVendor,
  normalizeExpenseCategory,
  normalizeMileagePurpose,
  summarizePurchaserInventory,
} from "../src/utils/businessTaxRecords.js";

assert.equal(normalizeBusinessVendor("Walmart Store #1234").label, "Walmart");
assert.equal(normalizeBusinessVendor("Target location 456").label, "Target");

const expenses = [
  { id: "e1", vendor: "Walmart Store #1234", amount: 40, category: "Inventory", buyer: "Zena", date: "2026-02-01", receiptImage: "receipt-a.png" },
  { id: "e2", vendor: "Wal-Mart Supercenter", amount: 15, category: "Shipping", buyer: "Dillon", date: "2026-02-02" },
  { id: "e3", vendor: "Target", amount: 20, category: "Supplies", buyer: "Zena", date: "2025-12-31" },
];

assert.equal(expenseHasReceipt({ receiptImageUrl: "receipt.png" }), true);
assert.equal(expenseHasReceipt({}), false);
assert.equal(normalizeExpenseCategory("Pokemon booster packs"), "Inventory/Product Cost");
assert.equal(normalizeMileagePurpose("USPS drop-off"), "Shipping/drop-off");
assert.equal(normalizeMileagePurpose("Target restock check"), "Store restock check");

const receiptExpense = expenseFromReceiptLine(
  { id: "line-1", itemName: "Packing tape", quantity: 2, unitCost: 3.5, totalCost: 7, destination: "expense_only", rawText: "Packing tape 7.00" },
  { id: "receipt-1", storeName: "Target Store #456", purchaseDate: "2026-03-04", receiptImageUrl: "target-receipt.png", paymentMethod: "Card", tax: 0.42 },
  { id: "expense-from-line", buyer: "Zena", taxDeductible: true }
);
assert.equal(receiptExpense.vendor, "Target Store #456");
assert.equal(receiptExpense.amount, 7);
assert.equal(receiptExpense.receiptImage, "target-receipt.png");
assert.equal(receiptExpense.receiptId, "receipt-1");
assert.equal(receiptExpense.buyer, "Zena");
assert.equal(receiptExpense.taxDeductible, true);

const expenseGroups = groupExpensesByVendor(expenses.slice(0, 2));
assert.equal(expenseGroups.length, 1);
assert.equal(expenseGroups[0].vendorName, "Walmart");
assert.equal(expenseGroups[0].count, 2);
assert.equal(expenseGroups[0].total, 55);
assert.equal(expenseGroups[0].missingReceiptCount, 1);
assert.equal(expenseGroups[0].receiptCount, 1);

const mileageGroups = groupMileageByVehicle([
  { id: "m1", vehicleId: "prius", vehicleName: "Toyota Prius", businessMiles: 12.5, totalVehicleCost: 4, mileageValue: 8, date: "2026-03-01", purpose: "Inventory run" },
  { id: "m2", vehicleId: "prius", vehicleName: "Toyota Prius", businessMiles: 7.5, totalVehicleCost: 3, mileageValue: 5, date: "2026-03-02", purpose: "USPS drop-off" },
  { id: "m3", vehicleName: "Honda Van", businessMiles: 10, totalVehicleCost: 6, mileageValue: 7, date: "2026-03-03", purpose: "Marketplace meetup" },
], [], { year: "2026" });
assert.equal(mileageGroups.length, 2);
assert.equal(mileageGroups.find((group) => group.vehicleName === "Toyota Prius").tripCount, 2);
assert.equal(mileageGroups.find((group) => group.vehicleName === "Toyota Prius").totalMiles, 20);
assert.equal(mileageGroups.find((group) => group.vehicleName === "Toyota Prius").ytdMiles, 20);
assert.ok(mileageGroups.find((group) => group.vehicleName === "Toyota Prius").topPurposes.some((entry) => entry.purpose === "Shipping/drop-off"));

const mileageExportRows = buildMileageExportRows(mileageGroups);
assert.ok(mileageExportRows.some((row) => row.section === "Vehicle summary" && row.vehicle === "Toyota Prius"));
assert.ok(mileageExportRows.some((row) => row.section === "Trip" && row.purpose === "Shipping/drop-off"));

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
