import assert from "node:assert/strict";
import { preserveLegacyReportZeros } from "../src/utils/restockDetailItems.mjs";

const originalItem = Object.freeze({ productName: "Legacy bundle", quantity: "", price: "", note: "Retained note", catalogProductSnapshot: Object.freeze({ id: "kept", marketValue: 37.25 }) });
const items = Object.freeze([originalItem]);
const cases = [
  [{ quantitySeen: 0, price: 0 }, 0, 0],
  [{ quantity_seen: 0 }, 0, ""],
  [{ quantitySeen: "", quantity_seen: 0 }, 0, ""],
  [{ quantitySeen: 2, quantity_seen: 0, price: 0 }, "", 0],
  [{ price: 0 }, "", 0],
];
for (const [input, quantity, price] of cases) {
  const report = Object.freeze(input);
  const before = JSON.stringify({ report, items });
  const result = preserveLegacyReportZeros(report, items);
  assert.equal(result[0].quantity, quantity);
  assert.equal(result[0].price, price);
  assert.equal(result[0].note, originalItem.note);
  assert.equal(result[0].catalogProductSnapshot, originalItem.catalogProductSnapshot);
  assert.equal(JSON.stringify({ report, items }), before);
}
assert.equal(preserveLegacyReportZeros({ itemsSeen: [{ quantity: 3 }], price: 0 }, items), items, "Per-item arrays keep their own fields");
assert.equal(preserveLegacyReportZeros({ items_seen: [{ quantity: 3 }], price: 0 }, items), items, "Legacy per-item arrays also retain authority");
assert.equal(preserveLegacyReportZeros({ quantitySeen: "0", price: "0" }, items), items, "String values are already handled by the existing normalizer");
assert.equal(preserveLegacyReportZeros({ quantitySeen: 3, price: 12 }, items), items, "This helper does not reinterpret nonzero values");
const empty = Object.freeze([]);
assert.equal(preserveLegacyReportZeros({ price: 0 }, empty), empty, "Do not invent a product row");
assert.equal(originalItem.catalogProductSnapshot.marketValue, 37.25);
console.log("Legacy report detail values: 11 scenarios passed; source records, item arrays and prices remain unchanged.");
