import assert from "node:assert/strict";
import { collectionCopyQuantity, groupCollectionCopies } from "../src/utils/collectionCopyGroups.mjs";

let assertions = 0;
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions += 1; }
function same(actual, expected, message) { assert.strictEqual(actual, expected, message); assertions += 1; }
function freeze(value) { if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }
const product = { name: "151 Poster Collection", tcgGame: "pokemon", productClassification: "Sealed product", setName: "151", catalogProductId: "pokemon-sealed-151-poster", tcgplayerProductId: "502005", language: "English", quantity: 1, marketPrice: 81.05 };
const pc = freeze({ ...product, id: "pc", _recordOrigin: "repository", ownedItemPurpose: "PERSONAL_COLLECTION", purchaseDate: "2026-10-01", allocatedItemCost: 15, storageLocation: "Shelf A", photoUrl: "private-one" });
const hold = freeze({ ...product, id: "hold", _recordOrigin: "legacy", ownedItemPurpose: "HOLD", purchaseDate: "2026-10-12", actualPurchasePrice: 20, storageLocation: "Shelf B", photoUrl: "private-two" });
const inputs = freeze([pc, hold]);
const before = JSON.stringify(inputs);
const [group] = groupCollectionCopies(inputs);
equal(group.quantity, 2, "matching acquisitions show their combined quantity");
same(group.item, pc, "the representative is the first original object, never a synthetic aggregate");
same(group.records[0], pc); same(group.records[1], hold);
equal(group.purposeCounts, [{ purpose: "PERSONAL_COLLECTION", label: "Personal collection", shortLabel: "PC", quantity: 1 }, { purpose: "HOLD", label: "Hold", shortLabel: "Hold", quantity: 1 }]);
equal(group.valuation.value, 162.1); equal(group.valuation.knownCount, 2); equal(group.valuation.totalCount, 2); equal(group.valuation.partial, false);
equal(JSON.stringify(inputs), before, "dates, costs, purpose, photos and original prices are unchanged");
equal(groupCollectionCopies(inputs)[0].key, group.key, "same input produces a deterministic key");
equal(groupCollectionCopies([hold, pc])[0].key, group.key, "product key is independent of acquisition ordering");
same(groupCollectionCopies([hold, pc])[0].item, hold);

for (const [label, patch] of Object.entries({
  game: { tcgGame: "magic" }, language: { language: "Japanese" }, variant: { variant: "Pokemon Center" }, edition: { edition: "First edition" },
  condition: { condition: "Damaged" }, finish: { finish: "Reverse holo" }, printing: { printing: "Reprint" }, classification: { productClassification: "Single card" },
  grader: { gradingCompany: "PSA" }, grade: { grade: "10" }, currency: { currency: "CAD" }, size: { productSize: "Large" }, packCount: { packCount: 6 }, sealedType: { sealedType: "Case" },
})) equal(groupCollectionCopies([pc, freeze({ ...hold, ...patch })]).length, 2, `${label} must stay distinct`);
equal(groupCollectionCopies([{ ...pc, currency: "USD" }, { ...hold, currency: "CAD" }]).length, 2, "explicit currencies cannot share a displayed value");
equal(groupCollectionCopies([{ ...pc, language: "EN" }, hold]).length, 1, "supported language aliases match");
equal(groupCollectionCopies([{ ...pc, tcgGame: "Pokémon" }, hold]).length, 1, "supported game aliases match");
equal(groupCollectionCopies([{ ...pc, productClassification: "sealed" }, hold]).length, 1, "sealed classification aliases match");
equal(groupCollectionCopies([{ ...pc, catalogProductId: "different-product" }, hold]).length, 2, "a matching secondary ID cannot bridge conflicting catalog IDs");
equal(groupCollectionCopies([{ ...pc, sku: "SKU-A" }, { ...hold, sku: "SKU-B" }]).length, 2, "matching titles and catalog IDs do not override conflicting SKUs");
equal(groupCollectionCopies([{ ...pc, tcgplayerProductId: "999" }, hold]).length, 2, "matching catalog ID does not override a conflicting source product ID");

const onlyCatalog = { ...pc, tcgplayerProductId: "" };
const onlyTcg = { ...hold, catalogProductId: "" };
equal(groupCollectionCopies([onlyCatalog, hold]).length, 1, "an omitted secondary ID can reconcile through an explicit shared ID");
equal(groupCollectionCopies([onlyCatalog, onlyTcg]).length, 2, "different ID namespaces are not interchangeable");
equal(groupCollectionCopies([{ ...onlyCatalog, catalogProductId: "502005" }, onlyTcg]).length, 2, "equal text in different ID namespaces is not a match");
equal(groupCollectionCopies([onlyCatalog, hold, onlyTcg]).length, 1, "an unambiguous linked catalog record can reconcile ID namespaces");
const ambiguous = [{ ...onlyCatalog, sku: "SKU-A" }, onlyCatalog, { ...onlyCatalog, sku: "SKU-B" }];
equal(groupCollectionCopies(ambiguous).length, 3, "a missing SKU cannot bridge incompatible SKUs");
equal(groupCollectionCopies(ambiguous.slice().reverse()).map((row) => row.key).sort(), groupCollectionCopies(ambiguous).map((row) => row.key).sort(), "ambiguous grouping is independent of input order");
equal(groupCollectionCopies([{ ...pc, catalogProductId: "one", catalog_product_id: "two" }, { ...hold, catalogProductId: "one" }]).length, 2, "internally conflicting alias fields are kept separate");

const manual = { ...pc, catalogProductId: "", tcgplayerProductId: "" };
equal(groupCollectionCopies([manual, { ...manual, id: "manual-2", purchaseDate: "2026-10-22", ownedItemPurpose: "HOLD" }]).length, 1, "complete manual product identity groups without using purchase metadata");
equal(groupCollectionCopies([manual, hold]).length, 1, "a full manual identity can join one unambiguous catalog product");
equal(groupCollectionCopies([{ ...manual, externalProductId: "unqualified-one" }, { ...manual, id: "other", externalProductId: "unqualified-two" }]).length, 2, "different unqualified external IDs are not discarded from manual identity");
equal(groupCollectionCopies([{ ...manual, externalProductId: "shared", source: "catalog-one" }, { ...manual, id: "other", externalProductId: "shared", source: "catalog-two" }]).length, 2, "external provider IDs retain their source namespace");
equal(groupCollectionCopies([manual, { ...hold, catalogProductId: "SKU1", tcgplayerProductId: "1" }, { ...hold, id: "other", catalogProductId: "SKU2", tcgplayerProductId: "2" }]).length, 3, "manual identity does not select between conflicting catalog products");
equal(groupCollectionCopies([{ ...manual, setName: "" }, { ...manual, setName: "", id: "manual-2" }]).length, 2, "title alone does not establish manual identity");
const incomplete = [{ id: "unidentified-a", name: "Unknown" }, { id: "unidentified-b", name: "Unknown" }];
equal(groupCollectionCopies(incomplete).map((row) => row.key).sort(), groupCollectionCopies(incomplete.slice().reverse()).map((row) => row.key).sort(), "incomplete identified row keys remain stable as display order changes");
equal(new Set(groupCollectionCopies([{ name: "Unknown" }, { name: "Unknown" }]).map((row) => row.key)).size, 2, "indistinguishable incomplete rows without IDs remain separate");
equal(groupCollectionCopies([{ ...manual, setName: "Different" }, manual]).length, 2, "different sets with the same title remain separate");
equal(groupCollectionCopies([{ ...manual, productClassification: "Single card", cardNumber: "1" }, { ...manual, productClassification: "Single card", cardNumber: "2" }]).length, 2, "manual cards require the same card number");
equal(groupCollectionCopies([{ ...manual, productClassification: "Single card" }, { ...manual, id: "other", productClassification: "Single card" }]).length, 2, "unnumbered manual cards remain separate");
equal(groupCollectionCopies([{ ...manual, tcgGame: "", setName: "Surging Sparks" }, { ...manual, tcgGame: "", setName: "Surging Sparks", id: "other" }]).length, 1, "a recognized exact set name can preserve existing inferred game semantics");
equal(groupCollectionCopies([{ ...manual, tcgGame: "", setName: "Custom set" }, { ...manual, tcgGame: "", setName: "Custom set", id: "other" }]).length, 2, "unidentified games do not merge based on title and set alone");
equal(groupCollectionCopies([{ ...pc, tcgGame: "Custom A" }, { ...hold, tcgGame: "Custom B" }]).length, 2, "unknown custom games remain separate");
const order = groupCollectionCopies([{ ...manual, id: "earliest" }, { ...pc, id: "another", catalogProductId: "separate", tcgplayerProductId: "separate", name: "Separate" }, hold]);
same(order[0].records[0].id, "earliest", "group ordering follows the first displayed original, including a manual acquisition");

const unknown = freeze({ ...hold, marketPrice: undefined });
const partial = groupCollectionCopies(freeze([pc, unknown]))[0];
equal(partial.valuation.value, 81.05); equal(partial.valuation.knownValue, 81.05); equal(partial.valuation.knownCount, 1); equal(partial.valuation.unknownCount, 1); equal(partial.valuation.partial, true); equal(partial.valuation.label, "Partial saved estimate");
const zero = groupCollectionCopies([{ ...pc, marketPrice: 0 }, { ...hold, marketPrice: 0 }])[0];
equal(zero.valuation.value, 0, "recorded zero stays known"); equal(zero.valuation.knownCount, 2); equal(zero.valuation.partial, false);
const allUnknown = groupCollectionCopies([{ ...pc, marketPrice: undefined }, unknown])[0];
equal(allUnknown.valuation.value, null); equal(allUnknown.valuation.knownCount, 0); equal(allUnknown.valuation.unknownCount, 2); equal(allUnknown.valuation.label, "Value not recorded");
equal(groupCollectionCopies([{ ...pc, marketPrice: "$50.00" }, { ...hold, marketPrice: "$30.00" }])[0].valuation.value, null, "formatted prices are not guessed into numeric estimates");
const mixed = groupCollectionCopies([{ ...pc, projectedResaleMid: "12" }, hold])[0];
equal(mixed.valuation.value, 93.05, "repository projected estimate keeps existing precedence over market price"); equal(mixed.valuation.source, "mixed"); equal(mixed.valuation.marketKnownCount, 1); equal(mixed.valuation.projectedKnownCount, 1);
equal(groupCollectionCopies([{ ...pc, quantity: 3 }, hold])[0].quantity, 4); equal(groupCollectionCopies([{ ...pc, quantity: 3 }, hold])[0].valuation.value, 324.2);
equal(collectionCopyQuantity({}), 1); equal(collectionCopyQuantity({ quantity: 0 }), 0); equal(collectionCopyQuantity({ quantity: "2" }), 2); equal(collectionCopyQuantity({ quantity: "invalid" }), 0); equal(collectionCopyQuantity({ qty: "2" }), 2); equal(collectionCopyQuantity({ ownedQuantity: 4 }), 4);
equal(groupCollectionCopies([{ ...pc, quantity: 0 }, hold])[0].purposeCounts[0].quantity, 0, "zero copies are not invented");
equal(groupCollectionCopies([null, undefined, "bad", [], pc]).length, 1); equal(groupCollectionCopies(null), []);
equal(JSON.stringify(inputs), before, "all original fields remain untouched after all grouping paths");
console.log(`Collection copy grouping: ${assertions} checks passed.`);
