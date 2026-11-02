import assert from "node:assert/strict";
import { BUSINESS_INVENTORY_STOCK_FILTERS, filterBusinessInventory } from "../src/utils/businessInventorySearch.mjs";
import { soldQuantityForInventory } from "../src/features/flipScout/inventory.js";

// Read-only fixtures include pending sales, refunds and an inspected return.
// The caller supplies the same existing quantity function used by the cards.
const records = [
  { id: "stock", name: "Pokémon collector box", setName: "Prismatic Evolutions", quantity: 4, status: "In stock", storageLocation: "Shelf A", allocatedItemCost: 101.23, projectedResaleMid: 162.34 },
  { id: "listed", title: "Moon card", cardNumber: "025/100", quantity: 2, status: "Listed", storageLocation: "Binder B", allocatedItemCost: 0, projectedResaleMid: 42.18 },
  { id: "preparing", productName: "Trainer tin", quantity: 3, currentStatus: " Preparing ", status: "Listed", notes: "Needs a photo", allocatedItemCost: null },
  { id: "empty", name: "Sold box", quantity: 2, status: "Listed", projectedResaleMid: 81.09 },
  { id: "refunded", name: "Refunded item", quantity: 1, status: "In stock" },
  { id: "returned", name: "Inspected return", quantity: 1, status: "Listed" },
];
const sales = [
  { id: "stock-sold", inventoryItemId: "stock", quantitySold: 1, status: "Completed" },
  { id: "stock-draft", inventoryItemId: "stock", quantitySold: 3, status: "Draft" },
  { id: "listed-cancelled", inventoryItemId: "listed", quantitySold: 2, status: "Cancelled" },
  { id: "empty-sold", inventoryItemId: "empty", quantitySold: 2, status: "Completed" },
  { id: "refunded-sale", inventoryItemId: "refunded", quantitySold: 1, status: "Refunded" },
  { id: "returned-sale", inventoryItemId: "returned", quantitySold: 1, status: "Refunded", returnApplications: [{ id: "application", restockedQuantity: 1,
    refundMinor: 1000, refundReference: "synthetic-inspected-return", cogsReversalMinor: 500, unitIndexes: [0], disposition: "restock" }] },
];
// The return shape is read through the existing authority below; a refund
// without an inspected-restock application must never imply physical stock.
const original = JSON.stringify({ records, sales });
for (const row of [...records, ...sales]) Object.freeze(row);
Object.freeze(records); Object.freeze(sales);
const available = row => Math.max(0, Number(row.quantity) - soldQuantityForInventory(row.id, sales));
const find = options => filterBusinessInventory(records, { getAvailableQuantity: available, ...options });
const ids = rows => rows.map(row => row.id);
assert.deepEqual(BUSINESS_INVENTORY_STOCK_FILTERS.map(filter => filter.key), ["all", "available", "preparing", "listed", "sold-out"]);
assert.deepEqual(ids(find({})), records.map(row => row.id));
assert.deepEqual(ids(find({ query: "  POKEMON   prismatic shelf  " })), ["stock"], "Case, accents and whitespace do not hide a matching item");
assert.deepEqual(ids(find({ query: "025/100 binder" })), ["listed"], "Card number and storage terms can be combined");
assert.deepEqual(ids(find({ query: "photo" })), ["preparing"], "Saved descriptive details remain searchable");
assert.deepEqual(ids(find({ query: "prismatic binder" })), [], "All search terms must match the same row");
assert.deepEqual(ids(find({ stockFilter: "preparing" })), ["preparing"], "Current saved status takes precedence over a stale status field");
assert.deepEqual(ids(find({ stockFilter: "listed" })), ["listed", "returned"], "Listed stock excludes consumed quantities and includes inspected restocks");
assert.deepEqual(ids(find({ stockFilter: "available" })), ["stock", "listed", "preparing", "returned"], "Draft/cancelled sales do not consume units and inspected returns restore them");
assert.deepEqual(ids(find({ stockFilter: "sold-out" })), ["empty", "refunded"], "A refund without an inspected return must not restore stock");
assert.deepEqual(ids(find({ query: "box", stockFilter: "sold-out" })), ["empty"], "Search and stock filter intersect");
assert.deepEqual(ids(find({ stockFilter: "unknown" })), records.map(row => row.id), "Unknown display filters fall back to all inventory");
assert.throws(() => filterBusinessInventory(records, { stockFilter: "available" }), /existing quantity calculation/, "The view cannot replace authoritative quantity with a guessed field");
for (const invalidQuantity of [NaN, Infinity, -1]) assert.deepEqual(filterBusinessInventory(records, { stockFilter: "sold-out", getAvailableQuantity: () => invalidQuantity }), []);
assert.deepEqual(find({ query: "" })[0], records[0]);
assert.equal(find({ query: "" })[0], records[0], "Filtering retains exact row identities and order");
assert.equal(JSON.stringify({ records, sales }), original, "Search and stock filters leave every original record, sale, cost and price byte-identical");
assert.deepEqual(filterBusinessInventory([], { stockFilter: "listed", getAvailableQuantity: available }), []);
console.log("PASS Inventory multi-field search, stock/sale edge cases, exact row identity and unchanged costs/prices; no network or filesystem writes.");
