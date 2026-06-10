import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildPlannedSalePricePatch,
  deriveGradeAssistReadiness,
  GRADE_ASSIST_DISCLAIMER,
  normalizeGradeAssistChecklist,
  groupedInventoryEntryIds,
  inventoryProductIdentityGroupKey,
  plannedSalePriceUpdateSummary,
} from "../src/utils/inventoryDetailUtils.js";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

const groupedItem = {
  id: "group-primary",
  salePrice: 40,
  rawItems: [
    { id: "zena-1", salePrice: 40, plannedSalePriceHistory: [{ price: 40, previousPrice: 35, changedAt: "2026-05-01", source: "test" }] },
    { id: "dillon-1", salePrice: 42 },
  ],
};

assert.deepEqual(groupedInventoryEntryIds(groupedItem), ["zena-1", "dillon-1"]);
assert.equal(plannedSalePriceUpdateSummary(groupedItem), "2 saved entries");
assert.equal(plannedSalePriceUpdateSummary({ id: "single" }), "1 saved entry");

const changedAt = "2026-05-21T00:00:00.000Z";
const patch = buildPlannedSalePricePatch(groupedItem.rawItems[0], 55, changedAt);
assert.equal(patch.salePrice, 55);
assert.equal(patch.plannedSalePrice, 55);
assert.equal(patch.planned_sale_price, 55);
assert.equal(patch.updatedAt, changedAt);
assert.equal(patch.plannedSalePriceHistory.length, 2);
assert.deepEqual(patch.plannedSalePriceHistory[1], {
  price: 55,
  previousPrice: 40,
  changedAt,
  source: "quick_update",
});

assert.equal(GRADE_ASSIST_DISCLAIMER, "Grade Assist is an estimate, not a guaranteed grade.");
assert.match(appSource, /Manual collector note, not a professional grade\./);
assert.match(appSource, /vault-card-condition-note/);

const emptyChecklist = normalizeGradeAssistChecklist({});
assert.equal(emptyChecklist.checks.centering, "not_checked");
assert.equal(deriveGradeAssistReadiness(emptyChecklist).label, "Not enough info yet");

const strongChecklist = normalizeGradeAssistChecklist({
  checks: {
    centering: "looks_clean",
    corners: "looks_clean",
    edges: "looks_clean",
    surface: "looks_clean",
    printQuality: "looks_clean",
  },
});
assert.equal(deriveGradeAssistReadiness(strongChecklist).label, "Strong candidate");

const reviewChecklist = normalizeGradeAssistChecklist({
  checks: {
    centering: "looks_clean",
    corners: "minor_issue",
    edges: "major_issue",
    surface: "looks_clean",
    printQuality: "looks_clean",
  },
  notes: "Whitening on one corner.",
});
assert.equal(reviewChecklist.notes, "Whitening on one corner.");
assert.equal(deriveGradeAssistReadiness(reviewChecklist).label, "Manual review recommended");

const vaultPikachuHolo = {
  id: "vault-pikachu-holo",
  catalogProductId: "catalog-pikachu-holo",
  name: "Pikachu",
  setName: "Scarlet & Violet Promo",
  productType: "Single Card",
  cardNumber: "027",
  variant: "Holo",
};
const vaultPikachuReverse = {
  ...vaultPikachuHolo,
  id: "vault-pikachu-reverse",
  catalogProductId: "catalog-pikachu-reverse",
  variant: "Reverse Holo",
};
const vaultDifferentCard = {
  ...vaultPikachuHolo,
  id: "vault-raichu-holo",
  catalogProductId: "catalog-raichu-holo",
  name: "Raichu",
};

assert.equal(
  inventoryProductIdentityGroupKey(vaultPikachuHolo, "vault"),
  inventoryProductIdentityGroupKey(vaultPikachuReverse, "vault"),
  "Vault card grouping should keep variants under one canonical card identity"
);
assert.notEqual(
  inventoryProductIdentityGroupKey(vaultPikachuHolo, "vault"),
  inventoryProductIdentityGroupKey(vaultDifferentCard, "vault"),
  "Vault card grouping should not merge unrelated cards with the same set and number"
);
assert.notEqual(
  inventoryProductIdentityGroupKey(vaultPikachuHolo, "inventory"),
  inventoryProductIdentityGroupKey(vaultPikachuReverse, "inventory"),
  "Non-vault inventory grouping should continue separating variant-specific product ids"
);

console.log("Inventory detail tests passed.");
