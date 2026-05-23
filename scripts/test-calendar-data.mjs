import assert from "node:assert/strict";
import {
  CALENDAR_EVENT_TYPES,
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
  sourceVerificationStatus: "official_fetch_success",
  sourceUrl: "https://www.pokemon.com/us/pokemon-tcg/product-gallery/mega-evolution-chaos-rising-booster-bundle",
}, catalogProducts);

assert.equal(release.eventType, "Product Release");
assert.equal(release.confidenceLabel, "Confirmed Release");
assert.equal(release.dateKey, "2026-05-22");
assert.equal(release.productImage, "https://example.test/chaos.jpg");
assert.equal(release.catalogProductId, "tcgcsv-chaos-bundle");

const unverifiedRelease = normalizeReleaseCalendarEvent({
  title: "Pokemon TCG: Example Watch Item",
  releaseDate: "2026-06-01",
  confidence: "unconfirmed",
  sourceVerificationStatus: "source_unavailable",
  sourceUrl: "https://www.pokemon.com/example",
});

assert.equal(unverifiedRelease.confidenceKey, "rumored");
assert.equal(unverifiedRelease.confidenceLabel, "Rumored/Unconfirmed");
assert.equal(unverifiedRelease.verified, false);
assert.notEqual(unverifiedRelease.confidenceLabel, "Confirmed Release");

const staleConfirmedRelease = normalizeReleaseCalendarEvent({
  title: "Pokemon TCG: Stale Confirmed Row",
  releaseDate: "2026-06-07",
  confidence: "confirmed",
  sourceVerificationStatus: "source_unavailable",
  dateSource: "configured_fallback_needs_review",
});

assert.equal(staleConfirmedRelease.confidenceKey, "rumored");
assert.equal(staleConfirmedRelease.verified, false);

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
assert.equal(drop.confidenceLabel, "Predicted Drop Window");

const confirmedDrop = normalizeDropCalendarEvent({
  dateKey: "2026-05-25",
  storeName: "Greenbrier Barnes & Noble",
  retailer: "Barnes & Noble",
  eventType: "Confirmed Restock",
  confidence: "confirmed",
  trainingCount: 3,
});

assert.equal(confirmedDrop.eventType, "Confirmed Restock");
assert.equal(confirmedDrop.confidenceLabel, "Confirmed Restock");
assert.equal(confirmedDrop.verified, true);

const rumoredDrop = normalizeDropCalendarEvent({
  dateKey: "2026-05-26",
  storeName: "Community watch",
  eventType: "Community Event",
  confidence: "unconfirmed",
});

assert.equal(rumoredDrop.confidenceKey, "rumored");
assert.equal(rumoredDrop.confidenceLabel, "Rumored/Unconfirmed");
assert.equal(filterCalendarEventsForViewer([release, drop], { admin: false }).length, 1);
assert.equal(filterCalendarEventsForViewer([release, drop], { admin: true }).length, 2);

assert.equal(calendarConfidenceKey("Official Pokemon release"), "confirmed");
assert.equal(calendarConfidenceKey("Rumored community note"), "rumored");
assert.equal(calendarConfidenceKey("unconfirmed"), "rumored");
assert.equal(calendarConfidenceKey("unverified source"), "rumored");
assert.equal(calendarConfidenceKey("Needs data"), "predicted");

for (const eventType of [
  "Product Release",
  "Set Release",
  "Preorder Window",
  "Confirmed Restock",
  "Predicted Drop Window",
  "Local Store Watch",
  "Online Drop Watch",
  "Confirmed Online Drop",
  "Store Availability Watch",
  "Admin Confirmed Drop",
  "Community Reported Drop",
  "Manual Watch Reminder",
  "Kids Program Event",
  "Community Event",
  "Admin/Internal Reminder",
]) {
  assert.ok(CALENDAR_EVENT_TYPES.includes(eventType), `${eventType} should be supported`);
}

console.log("Calendar data normalization tests passed.");
