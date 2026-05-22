import assert from "node:assert/strict";

import {
  RECEIPT_LINE_ENTRY_TYPES,
  buildManualFallbackItemSeed,
  classifyReceiptLineForEntry,
  normalizeBulkImportDestination,
  normalizeBulkImportRow,
  parseBulkImportText,
} from "../src/utils/inventoryImportUtils.js";
import { calendarEventToQuickAddSeed, normalizeQuickAddDestinations } from "../src/utils/quickAddRouting.js";
import { summarizePurchaserInventory } from "../src/utils/businessTaxRecords.js";

assert.equal(classifyReceiptLineForEntry({ name: "Prismatic Evolutions Booster Bundle 59.99" }).entryType, RECEIPT_LINE_ENTRY_TYPES.INVENTORY);
assert.equal(classifyReceiptLineForEntry({ name: "Packing tape 7.00" }).entryType, RECEIPT_LINE_ENTRY_TYPES.SUPPLIES);
assert.equal(classifyReceiptLineForEntry({ name: "Fuel pump 04 32.10" }).entryType, RECEIPT_LINE_ENTRY_TYPES.MILEAGE_REFERENCE);
assert.equal(classifyReceiptLineForEntry({ name: "Subtotal 99.99" }).entryType, RECEIPT_LINE_ENTRY_TYPES.IGNORED);
assert.equal(classifyReceiptLineForEntry({ name: "Coffee for sorting night 5.00" }).entryType, RECEIPT_LINE_ENTRY_TYPES.EXPENSE_ONLY);

assert.equal(normalizeBulkImportDestination("business inventory"), "Forge");
assert.equal(normalizeBulkImportDestination("personal collection"), "Vault");
assert.equal(normalizeBulkImportDestination("ignore"), "Skip");

const normalized = normalizeBulkImportRow({
  itemName: "Surging Sparks Booster Bundle",
  quantity: "2x",
  destination: "Forge",
  purchaser: "Zena",
  cost: "$27.50",
  vendor: "Target",
  date: "2026-05-20",
  upc: "0-820650-123456",
});
assert.equal(normalized.quantity, 2);
assert.equal(normalized.destination, "Forge");
assert.equal(normalized.purchaserName, "Zena");
assert.equal(normalized.unitCost, 27.5);
assert.equal(normalized.store, "Target");
assert.equal(normalized.purchaseDate, "2026-05-20");
assert.equal(normalized.upcSku, "0820650123456");

const rows = parseBulkImportText(`product name,quantity,destination,purchaser,unit cost,store,date,notes,upc
Prismatic Evolutions ETB,3,Forge,Dillon,49.99,GameStop,2026-05-10,Hold for Forge,0-820650-857555
Collector Chest,1,Vault,Zena,29.99,Target,2026-05-11,Personal,`);
assert.equal(rows.length, 2);
assert.equal(rows[0].destination, "Forge");
assert.equal(rows[0].purchaserName, "Dillon");
assert.equal(rows[0].upcSku, "0820650857555");
assert.equal(rows[1].destination, "Vault");

const looseRows = parseBulkImportText("2x Mini Portfolio $5.99 upc: 0-820650-222222", { destination: "Vault" });
assert.equal(looseRows[0].quantity, 2);
assert.equal(looseRows[0].destination, "Vault");
assert.equal(looseRows[0].upcSku, "0820650222222");

const fallback = buildManualFallbackItemSeed({ rawValue: "0-820650-333333", destination: "vault" });
assert.equal(fallback.upcSku, "0820650333333");
assert.equal(fallback.destinations.vault, true);

assert.deepEqual(normalizeQuickAddDestinations({ forge: true, vault: false }), {
  vault: false,
  wishlist: false,
  forge: true,
  tidetradr: false,
});
assert.deepEqual(normalizeQuickAddDestinations({ vault: true, forge: false }), {
  vault: true,
  wishlist: false,
  forge: false,
  tidetradr: false,
});

const dropSeed = calendarEventToQuickAddSeed({
  title: "Chaos Rising Booster Bundle",
  productName: "Chaos Rising Booster Bundle",
  dateKey: "2026-09-18",
  sourceLabel: "Drop Radar Release",
}, { vault: true });
assert.equal(dropSeed.destinations.vault, true);
assert.match(dropSeed.notes, /Drop Radar Release/);

const purchaserTallies = summarizePurchaserInventory([
  { name: "Prismatic Evolutions ETB", purchaserName: "Zena", quantity: 4, unitCost: 49.99 },
  { name: "Prismatic Evolutions ETB", purchaserName: "Dillon", quantity: 3, unitCost: 49.99 },
]);
assert.equal(purchaserTallies.find((entry) => entry.name === "Zena")?.quantity, 4);
assert.equal(purchaserTallies.find((entry) => entry.name === "Dillon")?.quantity, 3);

console.log("Inventory import tests passed.");
