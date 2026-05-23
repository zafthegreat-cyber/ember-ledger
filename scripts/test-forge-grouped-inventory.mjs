import assert from "node:assert/strict";

import {
  buildForgeGroupSaleHistory,
  groupedInventoryUnsoldEntryIds,
  inventoryProductIdentityGroupKey,
  saleMatchesInventoryGroup,
  summarizeForgeGroupedInventoryStatus,
} from "../src/utils/inventoryDetailUtils.js";

const miniTinZena = {
  id: "forge-zena-1",
  catalogProductId: "pe-mini-tin",
  name: "Prismatic Evolutions Mini Tin",
  setName: "Prismatic Evolutions",
  productType: "Mini Tin",
  condition: "Sealed",
  language: "English",
  finish: "Standard",
  quantity: 5,
  unitCost: 9.99,
  purchaserName: "Zena",
  store: "Redmill Target",
  purchaseDate: "2026-05-12",
};

const miniTinDillon = {
  ...miniTinZena,
  id: "forge-dillon-1",
  quantity: 3,
  purchaserName: "Dillon",
  store: "Pembroke Target",
  purchaseDate: "2026-05-14",
};

const differentFinish = {
  ...miniTinZena,
  id: "forge-zena-display",
  finish: "Display",
};

assert.equal(
  inventoryProductIdentityGroupKey(miniTinZena, "forge"),
  inventoryProductIdentityGroupKey(miniTinDillon, "forge"),
  "same catalog product and variant should group"
);
assert.notEqual(
  inventoryProductIdentityGroupKey(miniTinZena, "forge"),
  inventoryProductIdentityGroupKey(differentFinish, "forge"),
  "different finish/variant should not group"
);

const manualNameMatch = {
  id: "manual-1",
  name: "Prismatic Evolutions Mini Tin",
  setName: "Prismatic Evolutions",
  productType: "Mini Tin",
  condition: "Sealed",
  quantity: 1,
};
const manualNameMatchDifferentPurchaser = {
  ...manualNameMatch,
  id: "manual-2",
  purchaserName: "Dillon",
  quantity: 2,
};
assert.equal(
  inventoryProductIdentityGroupKey(manualNameMatch, "forge"),
  inventoryProductIdentityGroupKey(manualNameMatchDifferentPurchaser, "forge"),
  "manual fallback should group by normalized product identity, not purchaser"
);

const sales = [
  {
    id: "sale-1",
    itemId: "forge-zena-1",
    itemName: "Prismatic Evolutions Mini Tin",
    platform: "Whatnot",
    quantitySold: 1,
    finalSalePrice: 18,
    netProfit: 5,
    saleDate: "2026-05-18",
  },
  {
    id: "sale-2",
    linkedInventoryItemId: "forge-dillon-1",
    itemName: "Prismatic Evolutions Mini Tin",
    platform: "Local",
    quantitySold: 1,
    finalSalePrice: 16,
    estimatedProfitLoss: 3,
    saleDate: "2026-05-20",
  },
];

assert.equal(saleMatchesInventoryGroup(sales[0], [miniTinZena, miniTinDillon]), true);
const saleHistory = buildForgeGroupSaleHistory([miniTinZena, miniTinDillon], sales);
assert.equal(saleHistory.length, 2);
assert.equal(saleHistory[0].id, "sale-2", "sale history should sort latest activity first");

const statusSummary = summarizeForgeGroupedInventoryStatus(
  [{ ...miniTinZena, quantity: 4, status: "In Stock" }, { ...miniTinDillon, quantity: 2, status: "Listed" }],
  saleHistory
);
assert.equal(statusSummary.currentQuantity, 6);
assert.equal(statusSummary.soldQuantity, 2);
assert.equal(statusSummary.totalQuantity, 8);
assert.equal(statusSummary.listedQuantity, 2);

const groupedItem = {
  rawItems: [
    { id: "unsold-1", quantity: 2, status: "In Stock" },
    { id: "listed-1", quantity: 1, status: "Listed" },
    { id: "sold-1", quantity: 0, status: "Sold" },
  ],
};
assert.deepEqual(groupedInventoryUnsoldEntryIds(groupedItem), ["unsold-1", "listed-1"]);

console.log("Forge grouped inventory tests passed.");
