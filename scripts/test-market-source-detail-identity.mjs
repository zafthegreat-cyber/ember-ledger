import assert from "node:assert/strict";
import { buildMarketSourceDetailItem } from "../src/utils/marketSourceDetailIdentity.mjs";

const freeze = value => { Object.freeze(value); for (const child of Object.values(value)) if (child && typeof child === "object" && !Object.isFrozen(child)) freeze(child); return value; };
const catalog = freeze([{ id: "linked-exact", name: "Catalog label", tcgplayerProductId: "51234", groupId: "250", tcgplayer_category_id: "3", tcgdexCardId: "sv01-001", marketPrice: 999, quantity: 900, condition: "Near Mint", variant: "Normal", language: "English", grade: "Ungraded", msrp: 99, source: "TCGCSV" }]);
const owned = freeze({ id: "owned", catalogProductId: "linked-exact", name: "Saved name", quantity: 2, condition: "Lightly Played", variant: "Reverse Holofoil", language: "Japanese", grade: "PSA 9", marketPrice: 42, marketValue: 41, unitCost: 18, msrp: 30, salePrice: 49, marketValueSource: "manual", notes: "Keep my note" });
const before = JSON.stringify({ owned, catalog });
const detail = buildMarketSourceDetailItem(owned, catalog);
assert.equal(detail.tcgplayerProductId, "51234");
assert.equal(detail.tcgplayerGroupId, "250");
assert.equal(detail.tcgplayerCategoryId, "3");
assert.equal(detail.tcgdexCardId, "sv01-001");
for (const key of Object.keys(owned)) assert.deepEqual(detail[key], owned[key], `${key} must remain the owned value`);
assert.equal(JSON.stringify({ owned, catalog }), before, "Neither the owned record nor the catalog is changed");
assert.notEqual(detail, owned, "A detail overlay is separate from the saved record");

const overrides = freeze({ ...owned, tcgplayer_product_id: "777", tcgplayerGroupId: "888", tcgplayer_category_id: "999", tcgdexId: "base1-4" });
const explicit = buildMarketSourceDetailItem(overrides, catalog);
assert.equal(explicit.tcgplayer_product_id, "777"); assert.equal(explicit.tcgplayerProductId, undefined);
assert.equal(explicit.tcgplayerGroupId, "888"); assert.equal(explicit.tcgplayerCategoryId, undefined);
assert.equal(explicit.tcgplayer_category_id, "999"); assert.equal(explicit.tcgdexId, "base1-4"); assert.equal(explicit.tcgdexCardId, undefined);
assert.equal(buildMarketSourceDetailItem({ ...owned, catalogProductId: "", catalog_product_id: "linked-exact" }, catalog).tcgplayerProductId, "51234");
assert.equal(buildMarketSourceDetailItem({ ...owned, catalogProductId: undefined, catalog_product_id: "linked-exact" }, catalog).tcgplayerProductId, "51234");

for (const record of [
  { id: "linked-exact", name: "Catalog label", sku: "51234" },
  { name: "Catalog label", sku: "51234", barcode: "12345678" },
  { ...owned, catalogProductId: "LINKED-EXACT" },
  { ...owned, catalogProductId: " linked-exact " },
  { ...owned, catalogProductId: "missing" },
]) assert.equal(buildMarketSourceDetailItem(freeze(record), catalog), record, "Unlinked and nonexact matches remain untouched");
assert.equal(buildMarketSourceDetailItem(owned, [...catalog, { ...catalog[0] }]), owned, "Duplicate catalog IDs are ambiguous");
assert.equal(buildMarketSourceDetailItem(owned, [{ id: "linked-exact", sku: "123", externalProductId: "234", cardId: "sv01-002" }]).tcgplayerProductId, undefined, "Generic identifiers are not provider IDs");
assert.equal(buildMarketSourceDetailItem({ ...owned, tcgplayerProductId: " " }, catalog).tcgplayerProductId, "51234");
assert.equal(buildMarketSourceDetailItem({ ...owned, tcgplayerProductId: 0 }, catalog).tcgplayerProductId, 0, "Invalid but explicit owned identities are not silently corrected");
const genericOwn = buildMarketSourceDetailItem({ ...owned, groupId: "old-group", categoryId: "old-category" }, catalog);
assert.equal(genericOwn.tcgplayerGroupId, undefined); assert.equal(genericOwn.tcgplayerCategoryId, undefined);
assert.deepEqual(buildMarketSourceDetailItem(null, catalog), {});
assert.equal(buildMarketSourceDetailItem(owned, null), owned);
console.log("Market source detail identity checks passed: explicit links fill only missing provider IDs; owned data and prices stay unchanged.");
