import assert from "node:assert/strict";

import {
  buildManualFallbackItemSeed,
  catalogIdentifiersForProduct,
  findCatalogProductByBarcode,
  isLikelyBarcodeValue,
  normalizeBarcodeValue,
  validateManualFallbackDraft,
} from "../src/utils/inventoryImportUtils.js";

const prismaticEtb = {
  id: "pe-etb",
  name: "Prismatic Evolutions Elite Trainer Box",
  barcode: "0820650857555",
  sku: "PKU-PE-ETB",
  identifiers: [
    { identifierType: "UPC", identifierValue: "0-820650-857555", confidence: "verified" },
    { type: "TARGET_TCIN", value: "94412345" },
  ],
};

assert.equal(normalizeBarcodeValue("0-820650-857555"), "0820650857555");
assert.equal(normalizeBarcodeValue(" sku pe etb "), "SKUPEETB");
assert.equal(isLikelyBarcodeValue("0-820650-857555"), true);
assert.equal(isLikelyBarcodeValue("PE ETB"), false);

assert.ok(catalogIdentifiersForProduct(prismaticEtb).includes("0820650857555"));
assert.ok(catalogIdentifiersForProduct(prismaticEtb).includes("PKUPEETB"));
assert.ok(catalogIdentifiersForProduct(prismaticEtb).includes("94412345"));

assert.equal(findCatalogProductByBarcode([prismaticEtb], "0 820650 857555")?.id, "pe-etb");
assert.equal(findCatalogProductByBarcode([prismaticEtb], "PKU-PE-ETB")?.id, "pe-etb");
assert.equal(findCatalogProductByBarcode([prismaticEtb], "000000000000"), null);

const fallback = buildManualFallbackItemSeed({
  rawValue: "000000000000",
  destination: "forge",
});
assert.equal(fallback.upcSku, "000000000000");
assert.equal(fallback.destinations.forge, true);
assert.match(fallback.itemName, /Unmatched UPC/);

const manualValidation = validateManualFallbackDraft({
  itemName: "Unmatched UPC 000000000000",
  quantity: 1,
  destination: "Forge",
  cost: 0,
});
assert.equal(manualValidation.valid, true);

assert.equal(validateManualFallbackDraft({ itemName: "", quantity: 0 }).valid, false);

console.log("Barcode lookup tests passed.");
