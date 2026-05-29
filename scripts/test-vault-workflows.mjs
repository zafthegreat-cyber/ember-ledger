import assert from "node:assert/strict";
import { buildWishlistAddSeed, buildWishlistToOwnedRecord } from "../src/utils/vaultWorkflowUtils.js";

const now = "2026-05-29T00:00:00.000Z";
const wishlistItem = {
  id: "wish-001",
  name: "Umbreon ex",
  category: "Pokemon",
  productType: "Individual Card",
  setName: "Prismatic Evolutions",
  cardNumber: "060",
  quantityWanted: 2,
  targetPrice: 45,
  vaultStatus: "wishlist",
  status: "Wishlist",
  recordType: "wishlist_item",
  destinationScope: ["wishlist"],
  isWishlist: true,
  actionNotes: "Tracked wishlist item.",
};

const owned = buildWishlistToOwnedRecord(wishlistItem, { now });
assert.equal(owned.id, wishlistItem.id, "Mark owned should update the existing wishlist record, not create a duplicate.");
assert.deepEqual(owned.destinationScope, ["vault"]);
assert.equal(owned.recordType, "vault_item");
assert.equal(owned.isWishlist, false);
assert.equal(owned.quantity, 2);
assert.equal(owned.quantityWanted, 0);
assert.equal(owned.vaultStatus, "personal_collection");
assert.equal(owned.status, "Personal Collection");
assert.equal(owned.wishlistConvertedAt, now);
assert.match(owned.actionNotes, /Marked owned from wishlist/);
assert.equal(owned.vaultHistory.at(-1).type, "wishlist_marked_owned");

const seed = buildWishlistAddSeed(wishlistItem);
assert.equal(seed.itemName, "Umbreon ex");
assert.equal(seed.setName, "Prismatic Evolutions");
assert.equal(seed.cardNumber, "060");
assert.equal(seed.marketPrice, "");

console.log("Vault workflow tests passed.");
