import assert from "node:assert/strict";
import {
  RETAILER_DROP_CALENDAR_EVENT_TYPES,
  buildRetailerSourceProfiles,
  normalizeRetailerDrop,
  normalizeRetailerDropConfidence,
  retailerDropCalendarEventType,
  retailerDropToCalendarEvent,
  summarizeRetailerSources,
} from "../src/utils/retailerDropSources.mjs";

const profilesWithoutKeys = buildRetailerSourceProfiles({ env: {}, checkedAt: "2026-05-20T00:00:00.000Z" });
const names = profilesWithoutKeys.map((profile) => profile.retailerName);

for (const retailer of [
  "Best Buy",
  "Target",
  "Walmart",
  "Pokemon Center",
  "GameStop",
  "Barnes & Noble",
  "Costco",
  "Sam's Club",
  "BJ's Wholesale Club",
  "Walgreens",
  "CVS",
  "Dollar General",
  "Family Dollar",
  "Dollar Tree",
  "Five Below",
  "DICK'S Sporting Goods",
  "Hobby Lobby",
  "Michaels",
  "Kohl's",
  "Hot Topic",
  "BoxLunch",
  "Meijer",
  "Kroger",
  "Publix",
  "Wegmans",
  "Local card shops",
  "Local hobby/game stores",
  "Other/manual retailer",
]) {
  assert.ok(names.includes(retailer), `${retailer} source profile should exist`);
}

const bestBuyMissing = profilesWithoutKeys.find((profile) => profile.retailerName === "Best Buy");
assert.equal(bestBuyMissing.sourceType, "official-api");
assert.equal(bestBuyMissing.connected, false);
assert.equal(bestBuyMissing.status, "missing-key");
assert.deepEqual(bestBuyMissing.optionalEnvKeys, ["BEST_BUY_API_KEY"]);

const bestBuyConnected = buildRetailerSourceProfiles({ env: { BEST_BUY_API_KEY: "present" } }).find((profile) => profile.retailerName === "Best Buy");
assert.equal(bestBuyConnected.connected, true);
assert.equal(bestBuyConnected.status, "connected");

const manualSummary = summarizeRetailerSources(profilesWithoutKeys);
assert.equal(manualSummary.total, 28);
assert.equal(manualSummary.connected, 0);
assert.equal(manualSummary["missing-key"], 1);
assert.equal(manualSummary["manual-only"], 27);
assert.ok(manualSummary.optionalEnvKeys.has("BEST_BUY_API_KEY"));

const manualDrop = normalizeRetailerDrop({
  retailer: "Target",
  productName: "Pokemon TCG ETB",
  confidence: "in stock",
  sourceType: "manual-watch",
  productUrl: "https://example.test/manual-target-watch",
});

assert.equal(manualDrop.confidence, "manual");
assert.equal(manualDrop.sourceLabel, "Manual Watch");
assert.equal(retailerDropCalendarEventType(manualDrop), "Manual Watch Reminder");

const officialDrop = normalizeRetailerDrop({
  retailer: "Best Buy",
  productName: "Pokemon TCG Booster Bundle",
  retailerSku: "123456",
  onlineAvailability: "In Stock",
  confidence: "confirmed",
  sourceType: "official-api",
  productUrl: "https://example.test/best-buy-pokemon",
  lastSeenInStockAt: "2026-05-23T10:00:00.000Z",
}, { profiles: buildRetailerSourceProfiles({ env: { BEST_BUY_API_KEY: "present" } }) });

assert.equal(officialDrop.confidence, "confirmed");
assert.equal(officialDrop.sourceLabel, "Official API");
assert.equal(retailerDropCalendarEventType(officialDrop), "Confirmed Online Drop");

const adminDrop = normalizeRetailerDrop({
  retailer: "Local card shops",
  productName: "Journey Together ETB",
  confidence: "confirmed",
  sourceType: "admin-confirmed",
  store: "Family Friendly Card Shop",
});
assert.equal(adminDrop.confidence, "confirmed");
assert.equal(retailerDropCalendarEventType(adminDrop), "Admin Confirmed Drop");

const communityDrop = normalizeRetailerDrop({
  retailer: "Barnes & Noble",
  productName: "Pokemon tins",
  confidence: "community report",
  sourceType: "community-report",
});
assert.equal(communityDrop.confidence, "community");
assert.equal(retailerDropCalendarEventType(communityDrop), "Community Reported Drop");

const calendarEvent = retailerDropToCalendarEvent(officialDrop);
assert.equal(calendarEvent.eventType, "Confirmed Online Drop");
assert.equal(calendarEvent.confidenceLabel, "Confirmed");
assert.equal(calendarEvent.verified, true);
assert.equal(calendarEvent.sourceUrl, "https://example.test/best-buy-pokemon");

assert.equal(normalizeRetailerDropConfidence("confirmed", { sourceType: "manual-watch" }), "manual");
assert.equal(normalizeRetailerDropConfidence("confirmed", { sourceType: "official-api" }), "confirmed");

for (const eventType of [
  "Online Drop Watch",
  "Confirmed Online Drop",
  "Store Availability Watch",
  "Admin Confirmed Drop",
  "Community Reported Drop",
  "Manual Watch Reminder",
]) {
  assert.ok(RETAILER_DROP_CALENDAR_EVENT_TYPES.includes(eventType), `${eventType} should be supported`);
}

console.log("Retailer drop source framework tests passed.");
