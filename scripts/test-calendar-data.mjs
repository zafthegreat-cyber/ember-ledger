import assert from "node:assert/strict";
import {
  calendarConfidenceKey,
  filterCalendarEventsForViewer,
  normalizeDropCalendarEvent,
  normalizeReleaseCalendarEvent,
} from "../src/utils/calendarDataUtils.mjs";

const catalogProducts = [
  {
    id: "tcgcsv-chaos-bundle",
    productName: "Mega Evolution Chaos Rising Booster Bundle",
    productType: "Booster Bundle",
    imageUrl: "https://example.test/chaos.jpg",
  },
];

const release = normalizeReleaseCalendarEvent({
  title: "Pokemon TCG: Mega Evolution-Chaos Rising Booster Bundle",
  releaseDate: "2026-05-22",
  confidence: "confirmed",
  sourceUrl: "https://www.pokemon.com/us/pokemon-tcg/product-gallery/mega-evolution-chaos-rising-booster-bundle",
}, catalogProducts);

assert.equal(release.eventType, "Product Release");
assert.equal(release.confidenceLabel, "Confirmed Release");
assert.equal(release.dateKey, "2026-05-22");
assert.equal(release.productImage, "https://example.test/chaos.jpg");
assert.equal(release.catalogProductId, "tcgcsv-chaos-bundle");

const drop = normalizeDropCalendarEvent({
  dateKey: "2026-05-25",
  storeName: "Redmill Target",
  retailer: "Target",
  confidence: "possible",
  trainingCount: 1,
  visibility: "admin_only",
});

assert.equal(drop.eventType, "Predicted Drop Window");
assert.equal(drop.confidenceKey, "predicted");
assert.equal(drop.adminOnly, true);
assert.equal(filterCalendarEventsForViewer([release, drop], { admin: false }).length, 1);
assert.equal(filterCalendarEventsForViewer([release, drop], { admin: true }).length, 2);

assert.equal(calendarConfidenceKey("Official Pokemon release"), "confirmed");
assert.equal(calendarConfidenceKey("Rumored community note"), "rumored");
assert.equal(calendarConfidenceKey("Needs data"), "predicted");

console.log("Calendar data normalization tests passed.");
