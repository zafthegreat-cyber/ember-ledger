import assert from "node:assert/strict";
import {
  classifyItemAsSingleOrSealed,
  compareSetMasteryRows,
  deriveSetCompletionSummary,
  findSetSummaryForItem,
  getCardNumber,
  getOwnedQuantity,
  getSetKey,
  getVariantKey,
  groupItemsBySet,
  groupVariantsByCard,
  normalizeSetName,
} from "../src/utils/vaultSetMastery.js";

const knownSets = [
  {
    code: "PRE",
    name: "Prismatic Evolutions",
    total: 4,
    setAliases: ["Prismatic Evolutions"],
  },
  {
    code: "TST",
    name: "Checklist Complete",
    total: 3,
    checklistComplete: true,
  },
];

const ownedItems = [
  {
    id: "owned-057",
    catalogProductId: "cat-057",
    name: "Pikachu ex",
    setName: "Prismatic Evolutions",
    productType: "Individual Card",
    cardNumber: "057",
    priceSubtype: "Holofoil",
    quantity: 2,
  },
  {
    id: "owned-058",
    name: "Eevee",
    setCode: "PRE",
    productType: "Individual Card",
    cardNumber: "058",
    priceSubtype: "Reverse Holofoil",
    quantity: 1,
  },
  {
    id: "owned-sealed",
    name: "Prismatic Evolutions Booster Bundle",
    productType: "Booster Bundle",
    status: "sealed",
    quantity: 1,
  },
  {
    id: "unknown-sealed",
    name: "Mystery Booster Box",
    productType: "Booster Box",
    status: "sealed",
    quantity: 1,
  },
];

const wishlistItems = [
  {
    id: "wishlist-060",
    name: "Umbreon ex",
    setName: "Prismatic Evolutions",
    productType: "Individual Card",
    cardNumber: "060",
    priceSubtype: "Normal",
  },
];

const catalogProducts = [
  {
    id: "cat-057",
    name: "Pikachu ex",
    setName: "Prismatic Evolutions",
    catalogType: "card",
    productType: "Individual Card",
    cardNumber: "057",
    priceSubtype: "Holofoil",
  },
  {
    id: "cat-058",
    name: "Eevee",
    setName: "Prismatic Evolutions",
    catalogType: "card",
    productType: "Individual Card",
    cardNumber: "058",
  },
  {
    id: "cat-060",
    name: "Umbreon ex",
    setName: "Prismatic Evolutions",
    catalogType: "card",
    productType: "Individual Card",
    cardNumber: "060",
  },
  {
    id: "cat-complete-001",
    name: "Complete One",
    setName: "Checklist Complete",
    catalogType: "card",
    productType: "Individual Card",
    cardNumber: "001",
  },
  {
    id: "cat-complete-002",
    name: "Complete Two",
    setName: "Checklist Complete",
    catalogType: "card",
    productType: "Individual Card",
    cardNumber: "002",
  },
  {
    id: "cat-complete-003",
    name: "Complete Three",
    setName: "Checklist Complete",
    catalogType: "card",
    productType: "Individual Card",
    cardNumber: "003",
  },
];

assert.equal(normalizeSetName("Pok\u00e9mon 151"), "pokemon 151");
assert.equal(getSetKey({ setCode: "PRE" }), "set:pre");
assert.equal(getSetKey({ setName: "Prismatic Evolutions" }), "set:prismatic-evolutions");
assert.equal(getCardNumber({ card_details: { number: "123/091" } }), "123/091");

assert.equal(classifyItemAsSingleOrSealed(ownedItems[0]), "single");
assert.equal(classifyItemAsSingleOrSealed(ownedItems[2]), "sealed");
assert.equal(getVariantKey(ownedItems[0]), "holo");
assert.equal(getVariantKey(ownedItems[1]), "reverse_holo");
assert.equal(getVariantKey({ productType: "Individual Card", cardNumber: "001" }), "unknown");
assert.equal(getOwnedQuantity(ownedItems.slice(0, 2)), 3);

const variants = groupVariantsByCard([
  ownedItems[0],
  { ...ownedItems[0], id: "owned-057-normal", priceSubtype: "Normal", quantity: 1 },
]);
assert.equal(variants.length, 1);
assert.equal(variants[0].quantity, 3);
assert.deepEqual(variants[0].variants.map((variant) => variant.key).sort(), ["holo", "normal"]);

assert.equal(compareSetMasteryRows({ cardNumber: "2" }, { cardNumber: "10" }, "cardNumber") < 0, true);

const groups = groupItemsBySet(ownedItems, catalogProducts, knownSets);
const unknownGroup = groups.find((group) => group.descriptor.name === "Set unknown");
assert.equal(Boolean(unknownGroup), true);
assert.equal(unknownGroup.items.some((item) => item.id === "unknown-sealed"), true);

const summary = deriveSetCompletionSummary({ items: ownedItems, wishlistItems, catalogProducts, knownSets });
const prismatic = summary.find((row) => row.name === "Prismatic Evolutions");
assert.equal(prismatic.ownedCount, 2);
assert.equal(prismatic.ownedQuantity, 4);
assert.equal(prismatic.trackedSealedCount, 1);
assert.equal(prismatic.checklistAvailable, false);
assert.equal(prismatic.missingSupported, false);
assert.equal(prismatic.missingCount, null);
assert.equal(prismatic.missingCountLabel, "Missing count needs checklist data.");
assert.equal(prismatic.percent, 50);
assert.equal(prismatic.completionLabel, "50% completion estimate");
assert.equal(prismatic.wishlistItems.length, 1);
assert.equal(prismatic.sealedProducts.length, 0, "No catalog sealed product should be forced into the set without safe data.");
assert.equal(findSetSummaryForItem(ownedItems[0], summary).name, "Prismatic Evolutions");
assert.equal(findSetSummaryForItem(wishlistItems[0], summary).name, "Prismatic Evolutions");

const complete = summary.find((row) => row.name === "Checklist Complete");
assert.equal(complete.checklistAvailable, true);
assert.equal(complete.missingSupported, true);
assert.equal(complete.missingCount, 3);
assert.equal(complete.completionLabel, "0% complete");

const unknown = summary.find((row) => row.name === "Set unknown");
assert.equal(unknown.unknownSet, true);
assert.equal(unknown.trackedSealedCount, 1);
assert.equal(unknown.completionLabel, "1 tracked");
assert.equal(findSetSummaryForItem(ownedItems[3], summary).name, "Set unknown");

console.log("Vault Set Mastery tests passed.");
