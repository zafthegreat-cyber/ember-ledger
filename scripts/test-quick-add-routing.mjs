import assert from "node:assert/strict";
import {
  buildQuickAddSuccessMessage,
  calendarEventToQuickAddSeed,
  findQuickAddCatalogMatch,
  normalizeQuickAddDestinations,
  quickAddDestinationNames,
} from "../src/utils/quickAddRouting.js";

assert.deepEqual(
  normalizeQuickAddDestinations({ forge: true, vault: false, ignored: true }),
  { vault: false, wishlist: false, forge: true, tidetradr: false }
);

assert.deepEqual(
  normalizeQuickAddDestinations({ vault: true }),
  { vault: true, wishlist: false, forge: false, tidetradr: false }
);

assert.deepEqual(quickAddDestinationNames({ vault: true, forge: true }), ["Vault", "Forge"]);

const releaseEvent = {
  title: "Chaos Rising Booster Bundle",
  productName: "Chaos Rising Booster Bundle",
  eventType: "Product Release",
  dateKey: "2026-09-18",
  sourceLabel: "Confirmed Release",
  sourceUrl: "https://www.pokemon.com/",
};
const seed = calendarEventToQuickAddSeed(releaseEvent, { vault: true });
assert.equal(seed.itemName, "Chaos Rising Booster Bundle");
assert.equal(seed.destinations.vault, true);
assert.equal(seed.destinations.forge, false);
assert.match(seed.notes, /Confirmed Release/);

const catalogMatch = findQuickAddCatalogMatch([
  { id: "a", name: "Prismatic Evolutions Elite Trainer Box", setName: "Prismatic Evolutions", productType: "Elite Trainer Box" },
  { id: "b", name: "Chaos Rising Booster Bundle", setName: "Mega Evolution", productType: "Booster Bundle" },
], releaseEvent);
assert.equal(catalogMatch.id, "b");

assert.equal(
  buildQuickAddSuccessMessage({
    itemName: "Prismatic Evolutions Booster Bundle",
    entries: [{ destination: "Forge", quantity: 3, purchaserName: "Zena" }],
  }),
  "Prismatic Evolutions Booster Bundle saved to Forge x3 (Zena)."
);

assert.equal(
  buildQuickAddSuccessMessage({
    itemName: "Collector Chest",
    entries: [
      { destination: "Vault", quantity: 1 },
      { destination: "Forge", quantity: 2, purchaserName: "Dillon" },
    ],
  }),
  "Collector Chest saved to Vault x1 and Forge x2 (Dillon)."
);

console.log("Quick Add routing tests passed.");
