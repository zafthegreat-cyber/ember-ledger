import assert from "node:assert/strict";
import {
  buildPlannedSalePricePatch,
  groupedInventoryEntryIds,
  plannedSalePriceUpdateSummary,
} from "../src/utils/inventoryDetailUtils.js";

const groupedItem = {
  id: "group-primary",
  salePrice: 40,
  rawItems: [
    { id: "zena-1", salePrice: 40, plannedSalePriceHistory: [{ price: 40, previousPrice: 35, changedAt: "2026-05-01", source: "test" }] },
    { id: "dillon-1", salePrice: 42 },
  ],
};

assert.deepEqual(groupedInventoryEntryIds(groupedItem), ["zena-1", "dillon-1"]);
assert.equal(plannedSalePriceUpdateSummary(groupedItem), "2 saved entries");
assert.equal(plannedSalePriceUpdateSummary({ id: "single" }), "1 saved entry");

const changedAt = "2026-05-21T00:00:00.000Z";
const patch = buildPlannedSalePricePatch(groupedItem.rawItems[0], 55, changedAt);
assert.equal(patch.salePrice, 55);
assert.equal(patch.plannedSalePrice, 55);
assert.equal(patch.planned_sale_price, 55);
assert.equal(patch.updatedAt, changedAt);
assert.equal(patch.plannedSalePriceHistory.length, 2);
assert.deepEqual(patch.plannedSalePriceHistory[1], {
  price: 55,
  previousPrice: 40,
  changedAt,
  source: "quick_update",
});

console.log("Inventory detail tests passed.");
