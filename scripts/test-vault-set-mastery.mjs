import assert from "node:assert/strict";
import {
  buildSetCardRows,
  classifyItemAsSingleOrSealed,
  compareSetMasteryRows,
  deriveSetCompletion,
  deriveSetCompletionSummary,
  findSetSummaryForItem,
  getCardNumber,
  getCanonicalCardKey,
  getOwnedQuantity,
  getSetCatalogItems,
  getSetSealedProducts,
  getSetKey,
  getUserOwnedItemsForSet,
  getVariantKey,
  getWishlistItemsForSet,
  groupItemsBySet,
  groupVariantsByCard,
  normalizeSetName,
  searchSetsByName,
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
  {
    code: "CRZ",
    name: "Crown Zenith",
    total: 160,
    setAliases: ["Crown Zenith"],
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
    id: "owned-057-reverse",
    catalogProductId: "cat-057-reverse",
    name: "Pikachu ex",
    setName: "Prismatic Evolutions",
    productType: "Individual Card",
    cardNumber: "057",
    priceSubtype: "Reverse Holofoil",
    quantity: 1,
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
    id: "cat-057-reverse",
    name: "Pikachu ex",
    setName: "Prismatic Evolutions",
    catalogType: "card",
    productType: "Individual Card",
    cardNumber: "057",
    priceSubtype: "Reverse Holofoil",
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
    id: "cat-pre-booster-bundle",
    name: "Prismatic Evolutions Booster Bundle",
    setName: "Prismatic Evolutions",
    catalogType: "sealed",
    productType: "Booster Bundle",
  },
  {
    id: "cat-mystery-sealed",
    name: "Mystery Booster Box",
    catalogType: "sealed",
    productType: "Booster Box",
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
assert.equal(classifyItemAsSingleOrSealed(ownedItems[3]), "sealed");
assert.equal(classifyItemAsSingleOrSealed({
  name: "Pikachu",
  setName: "Prismatic Evolutions",
  productType: "Single Card",
  status: "Personal Collection",
  cardNumber: "057",
}), "single");
assert.equal(classifyItemAsSingleOrSealed({
  name: "Pikachu Single Card",
  setName: "Prismatic Evolutions",
  category: "Single card",
  status: "sealed",
  condition: "Keep sealed",
}), "single");
assert.equal(classifyItemAsSingleOrSealed({
  name: "Mystery Pikachu",
  setName: "Prismatic Evolutions",
  category: "Pokemon",
}), "unknown");
assert.equal(classifyItemAsSingleOrSealed({
  name: "Prismatic Evolutions Elite Trainer Box",
  productType: "Elite Trainer Box",
}), "sealed");
assert.equal(getVariantKey(ownedItems[0]), "holo");
assert.equal(getVariantKey(ownedItems[1]), "reverse_holo");
assert.equal(getVariantKey({ productType: "Individual Card", cardNumber: "001" }), "unknown");
assert.equal(getOwnedQuantity(ownedItems.slice(0, 3)), 4);
assert.equal(getCanonicalCardKey(ownedItems[0]), getCanonicalCardKey(ownedItems[1]));

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
assert.equal(prismatic.ownedSealedItems.some((item) => item.id === "owned-057"), false);
assert.equal(prismatic.ownedCardItems.some((item) => item.id === "owned-057"), true);
assert.equal(prismatic.checklistAvailable, false);
assert.equal(prismatic.missingSupported, false);
assert.equal(prismatic.missingCount, null);
assert.equal(prismatic.missingCountLabel, "Missing count needs checklist data.");
assert.equal(prismatic.percent, 50);
assert.equal(prismatic.completionLabel, "50% completion estimate");
assert.equal(prismatic.wishlistItems.length, 1);
assert.equal(prismatic.sealedProducts.length, 1, "Explicit catalog sealed products should stay tied to their set.");
assert.equal(findSetSummaryForItem(ownedItems[0], summary).name, "Prismatic Evolutions");
assert.equal(findSetSummaryForItem(wishlistItems[0], summary).name, "Prismatic Evolutions");

assert.equal(getSetCatalogItems(prismatic, catalogProducts).length, 4);
assert.equal(getSetSealedProducts(prismatic, catalogProducts).length, 1);
assert.equal(getSetSealedProducts(prismatic, [...catalogProducts, {
  id: "cat-pre-pikachu-single",
  name: "Pikachu Single Card",
  setName: "Prismatic Evolutions",
  productType: "Single Card",
  cardNumber: "057",
}]).some((product) => product.id === "cat-pre-pikachu-single"), false);
assert.equal(getUserOwnedItemsForSet(prismatic, ownedItems).filter((item) => classifyItemAsSingleOrSealed(item) === "single").length, 3);
assert.equal(getWishlistItemsForSet(prismatic, wishlistItems).length, 1);

const prismaticCardRows = buildSetCardRows(prismatic);
const pikachuRow = prismaticCardRows.find((row) => row.title === "Pikachu ex");
assert.equal(pikachuRow.ownedQuantity, 3);
assert.equal(pikachuRow.variantCount, 2);
assert.equal(pikachuRow.variantOwnedCount, 2);
assert.deepEqual(pikachuRow.variants.map((variant) => variant.key).sort(), ["holo", "reverse_holo"]);
assert.equal(pikachuRow.missing, false);
assert.equal(pikachuRow.variantCompletionLabel, "Variant checklist unavailable.");
const umbreonRow = prismaticCardRows.find((row) => row.title === "Umbreon ex");
assert.equal(umbreonRow.wishlistQuantity, 1);
assert.equal(umbreonRow.status, "wishlist");

const complete = summary.find((row) => row.name === "Checklist Complete");
assert.equal(complete.checklistAvailable, true);
assert.equal(complete.missingSupported, true);
assert.equal(complete.missingCount, 3);
assert.equal(complete.completionLabel, "0% complete");

const unknown = summary.find((row) => row.name === "Set unknown");
assert.equal(unknown.unknownSet, true);
assert.equal(unknown.trackedSealedCount, 1);
assert.equal(unknown.completionLabel, "1 tracked");
assert.equal(findSetSummaryForItem(ownedItems[4], summary).name, "Set unknown");

const fullLibrary = deriveSetCompletion({ items: ownedItems, wishlistItems, catalogProducts, knownSets, includeEmptyKnownSets: true });
assert.equal(searchSetsByName("Crown Zenith", fullLibrary)[0].name, "Crown Zenith");
const crown = fullLibrary.find((row) => row.name === "Crown Zenith");
assert.equal(crown.trackedItemCount, 0);
assert.equal(crown.completionLabel, "0 tracked");
assert.equal(crown.missingSupported, false);

console.log("Vault Set Mastery tests passed.");
