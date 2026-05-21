import assert from "node:assert/strict";

import {
  buildSalesExportRows,
  buildSalesRecordFromDraft,
  calculateSalesRecordTotals,
  normalizeSalesPlatform,
  summarizeSalesRecords,
  validateManualSaleDraft,
} from "../src/utils/businessTaxRecords.js";

assert.equal(normalizeSalesPlatform("what not"), "Whatnot");
assert.equal(normalizeSalesPlatform("tcg player"), "TCGplayer");
assert.equal(normalizeSalesPlatform("card show"), "Local card show/event");
assert.equal(normalizeSalesPlatform("Ember and Tide"), "Ember & Tide");

const linkedItem = {
  id: "forge-item-1",
  name: "Prismatic Evolutions ETB",
  sku: "PE-ETB",
  unitCost: 49.99,
  workspaceId: "workspace-ember-tide",
  workspaceName: "Ember & Tide",
};

const totals = calculateSalesRecordTotals({
  quantitySold: 2,
  finalSalePrice: 64.99,
  shippingCharged: 5,
  platformFees: 8,
  paymentProcessingFees: 2.5,
  shippingCost: 4.25,
  suppliesCost: 1.25,
  discountsRefunds: 3,
}, linkedItem);

assert.equal(totals.quantitySold, 2);
assert.equal(totals.grossSale, 134.98);
assert.equal(totals.totalFees, 10.5);
assert.equal(totals.costBasis, 99.98);
assert.equal(Number(totals.netProceeds.toFixed(2)), 115.98);
assert.equal(Number(totals.estimatedProfitLoss.toFixed(2)), 16);

const invalid = validateManualSaleDraft({ platform: "eBay", quantitySold: 0, finalSalePrice: "" });
assert.equal(invalid.valid, false);
assert.match(invalid.errors.itemName, /item name/i);
assert.match(invalid.errors.quantitySold, /greater than zero/i);
assert.match(invalid.errors.grossSale, /sale amount/i);

const manual = buildSalesRecordFromDraft({
  manualItemName: "Manual Pokemon bundle",
  saleDate: "2026-05-12",
  platform: "fb marketplace",
  quantitySold: 1,
  finalSalePrice: 40,
  shippingCharged: 0,
  platformFees: 0,
  paymentProcessingFees: 0,
  shippingCost: 0,
  suppliesCost: 2,
  discountsRefunds: 0,
  costBasis: 22,
  referenceId: "LOCAL-1",
  notes: "Porch pickup",
}, {}, { id: "sale-manual", workspaceId: "workspace-personal", workspaceName: "Personal Forge" });

assert.equal(manual.valid, true);
assert.equal(manual.sale.itemName, "Manual Pokemon bundle");
assert.equal(manual.sale.platform, "Facebook Marketplace");
assert.equal(manual.sale.inventoryAdjustmentMode, "manual_inventory_adjustment");
assert.match(manual.sale.notes, /manual/i);
assert.equal(manual.sale.estimatedProfitLoss, 16);

const linked = buildSalesRecordFromDraft({
  itemId: linkedItem.id,
  saleDate: "2026-05-13",
  platform: "Whatnot",
  quantitySold: 2,
  finalSalePrice: 64.99,
  shippingCharged: 5,
  platformFees: 8,
  paymentProcessingFees: 2.5,
  shippingCost: 4.25,
  suppliesCost: 1.25,
  discountsRefunds: 3,
  referenceId: "WN-22",
}, linkedItem, { id: "sale-linked", workspaceId: "workspace-ember-tide", workspaceName: "Ember & Tide" });

assert.equal(linked.valid, true);
assert.equal(linked.sale.inventoryAdjustmentMode, "linked_inventory_quantity");
assert.equal(linked.sale.costBasis, 99.98);
assert.equal(Number(linked.sale.netProceeds.toFixed(2)), 115.98);

const summary = summarizeSalesRecords([manual.sale, linked.sale], { year: "2026" });
assert.equal(summary.count, 2);
assert.equal(summary.itemsSold, 3);
assert.equal(Number(summary.grossSales.toFixed(2)), 174.98);
assert.equal(Number(summary.estimatedProfitLoss.toFixed(2)), 32);
assert.equal(summary.byPlatform.some((row) => row.label === "Whatnot"), true);
assert.equal(summary.receiptCoverage.withReference, 2);
assert.equal(summary.receiptCoverage.missingReference, 0);

const rows = buildSalesExportRows([manual.sale, linked.sale]);
assert.equal(rows.length, 2);
assert.ok(rows.some((row) => row.platform === "Whatnot" && row.receiptOrReference === "Attached/reference present"));
assert.ok(rows.every((row) => row.section === "Sale record"));

console.log("Sales record tests passed.");
