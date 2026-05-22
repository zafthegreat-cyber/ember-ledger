import assert from "node:assert/strict";

import {
  INVENTORY_VALUATION_COPY,
  buildGroupedInventoryValuation,
  buildInventoryInsightCards,
  buildInventoryMissingDataPrompts,
  formatPurchaserTally,
  summarizeInventoryValuation,
} from "../src/utils/inventoryValuationUtils.js";

const items = [
  {
    id: "item-zena",
    name: "Prismatic Evolutions ETB",
    purchaserName: "Zena",
    quantity: 2,
    unitCost: 50,
    marketPrice: 60,
    msrpPrice: 49.99,
    salePrice: 70,
    productType: "Elite Trainer Box",
    setName: "Prismatic Evolutions",
    receiptImage: "receipt.png",
    itemImage: "photo.png",
  },
  {
    id: "item-dillon",
    name: "Prismatic Evolutions ETB",
    purchaserName: "Dillon",
    quantity: 3,
    salePrice: 55,
    productType: "Elite Trainer Box",
    setName: "Prismatic Evolutions",
  },
];

const forgeSummary = summarizeInventoryValuation(items, { context: "forge" });
assert.equal(forgeSummary.totalQuantity, 5);
assert.equal(forgeSummary.totalCostBasis, 100);
assert.equal(forgeSummary.estimatedMarketValue, 120);
assert.equal(forgeSummary.plannedSaleTotal, 305);
assert.equal(forgeSummary.estimatedProfitAtPlannedPrice, 205);
assert.equal(forgeSummary.missingCostCount, 1);
assert.equal(forgeSummary.missingMarketValueCount, 1);
assert.equal(forgeSummary.missingPlannedSalePriceCount, 0);
assert.equal(forgeSummary.receiptCoverage.withReceipt, 1);
assert.equal(forgeSummary.receiptCoverage.missingReceipt, 1);
assert.equal(forgeSummary.photoCoverage.missingPhoto, 1);
assert.equal(forgeSummary.topProductTypes[0].label, "Elite Trainer Box");
assert.equal(forgeSummary.topSets[0].label, "Prismatic Evolutions");

assert.equal(formatPurchaserTally(forgeSummary.purchaserBreakdown), "Dillon - 3 / Zena - 2");
assert.equal(forgeSummary.purchaserBreakdown.find((row) => row.name === "Dillon").missingCostCount, 1);
assert.equal(forgeSummary.purchaserBreakdown.find((row) => row.name === "Zena").totalCostBasis, 100);

const grouped = buildGroupedInventoryValuation({ rawItems: items, quantity: 5 }, { context: "forge" });
assert.equal(grouped.recordCount, 2);
assert.equal(grouped.totalQuantity, 5);
assert.equal(grouped.estimatedProfitAtPlannedPrice, 205);

const prompts = buildInventoryMissingDataPrompts(forgeSummary, { context: "forge", includeExport: true });
assert.ok(prompts.some((prompt) => prompt.label === "Add cost" && prompt.count === 1));
assert.ok(prompts.some((prompt) => prompt.label === "Review market value" && prompt.count === 1));
assert.ok(prompts.some((prompt) => prompt.label === "Attach receipt" && prompt.count === 1));
assert.ok(prompts.some((prompt) => prompt.label === "Export records"));

const vaultCards = buildInventoryInsightCards(forgeSummary, { context: "vault", moneyFormatter: (value) => `$${Number(value).toFixed(2)}` });
const forgeCards = buildInventoryInsightCards(forgeSummary, { context: "forge", moneyFormatter: (value) => `$${Number(value).toFixed(2)}` });
assert.ok(vaultCards.some((card) => card.label === "Estimated collection value"));
assert.ok(forgeCards.some((card) => card.label === "Planned sale total"));
assert.match(INVENTORY_VALUATION_COPY.forgeDisclaimer, /not tax advice/i);
assert.doesNotMatch(INVENTORY_VALUATION_COPY.forgeDisclaimer, /guaranteed|official tax/i);

console.log("Inventory valuation tests passed.");
