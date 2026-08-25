import assert from "node:assert/strict";

import {
  OWNED_ITEM_PURPOSES,
  changeOwnedItemPurpose,
  inferOwnedItemPurpose,
  normalizeOwnedItem,
  ownedItemWorkspace,
  summarizePurposeCompatibility,
} from "../src/features/ownedItems/ownedItemPurpose.js";
import { canAccessOwnerCenter } from "../src/features/ownerCenter/ownerAuthorization.js";
import {
  OWNER_CENTER_STORAGE_KEY,
  createOwnerCenterRepository,
  deserializeOwnerCenterState,
  serializeOwnerCenterState,
} from "../src/features/ownerCenter/ownerCenterRepository.js";
import {
  buildOpportunityFeed,
  filterAndSortOpportunities,
  isEndingSoon,
  restockPatternSummary,
  searchRulePerformance,
  sourcePerformance,
} from "../src/features/ownerCenter/ownerCenterModel.js";
import { pathFromActiveTab, routeStateFromPath } from "../src/utils/appRouteState.js";

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
}

const legacyCollection = { id: "collection-1", recordType: "vault_item", totalPurchaseCost: 75, itemImage: "image.jpg", source: "Local seller", notes: "Keep history" };
const legacyResale = { id: "resale-1", recordType: "forge_inventory", unitCost: 22, businessInventory: true };
const unknown = { id: "unknown-1", title: "Unmapped record" };
assert.equal(inferOwnedItemPurpose(legacyCollection), OWNED_ITEM_PURPOSES.PERSONAL_COLLECTION);
assert.equal(inferOwnedItemPurpose(legacyResale), OWNED_ITEM_PURPOSES.FOR_RESALE);
assert.equal(inferOwnedItemPurpose({ status: "Wishlist" }), OWNED_ITEM_PURPOSES.HOLD);
assert.equal(inferOwnedItemPurpose({ recordType: "kids_pack" }), OWNED_ITEM_PURPOSES.KIDS_COMMUNITY);
assert.equal(inferOwnedItemPurpose(unknown), OWNED_ITEM_PURPOSES.UNASSIGNED);
assert.equal(ownedItemWorkspace(legacyCollection), "collection");
assert.equal(ownedItemWorkspace(legacyResale), "business");
assert.equal(normalizeOwnedItem(legacyCollection).purposeSource, "legacy-compatibility");

const moved = changeOwnedItemPurpose(legacyCollection, OWNED_ITEM_PURPOSES.FOR_RESALE, { at: "2026-08-14T12:00:00.000Z", changedBy: "owner-1", reason: "Sell This Item" });
assert.equal(moved.ownedItemPurpose, OWNED_ITEM_PURPOSES.FOR_RESALE);
assert.equal(moved.totalPurchaseCost, 75, "purpose changes preserve original acquisition cost");
assert.equal(moved.itemImage, "image.jpg", "purpose changes preserve images");
assert.equal(moved.source, "Local seller", "purpose changes preserve source");
assert.equal(moved.notes, "Keep history", "purpose changes preserve notes");
assert.deepEqual(moved.purposeHistory[0], {
  id: "purpose-collection-1-2026-08-14T12:00:00.000Z",
  type: "OWNED_ITEM_PURPOSE_CHANGED",
  from: "PERSONAL_COLLECTION",
  to: "FOR_RESALE",
  at: "2026-08-14T12:00:00.000Z",
  changedBy: "owner-1",
  reason: "Sell This Item",
});
assert.throws(() => changeOwnedItemPurpose(legacyCollection, "INVALID"), /valid owned-item purpose/);
assert.deepEqual(summarizePurposeCompatibility([legacyCollection, legacyResale, unknown]), {
  byPurpose: { PERSONAL_COLLECTION: 1, FOR_RESALE: 1, HOLD: 0, KIDS_COMMUNITY: 0, UNASSIGNED: 1 },
  explicitCount: 0,
  compatibilityCount: 3,
  unmappedCount: 1,
});

assert.equal(canAccessOwnerCenter({ guestPreview: true, session: { authenticated: true, ownerAuthorized: true } }), false, "guest preview is never owner-authorized");
assert.equal(canAccessOwnerCenter({ session: { authenticated: true, ownerAuthorized: true } }), true, "a server-verified owner session grants the UI guard");
assert.equal(canAccessOwnerCenter({ session: { authenticated: true, ownerAuthorized: false }, currentUserProfile: { appRole: "owner" } }), false, "a browser role cannot override server authorization");
assert.equal(canAccessOwnerCenter({ session: { authenticated: false, ownerAuthorized: true } }), false, "authorization without a verified principal is denied");
assert.equal(canAccessOwnerCenter({}), false);

const memory = new MemoryStorage();
const ownerRepository = createOwnerCenterRepository(memory);
assert.deepEqual(ownerRepository.load().restockEvents, []);
const storedEvent = ownerRepository.upsert("restockEvents", { store: "Target", product: "Booster bundle", confirmationStatus: "Confirmed" });
assert.equal(storedEvent.state.restockEvents.length, 1);
assert.ok(memory.getItem(OWNER_CENTER_STORAGE_KEY));
const ownerRoundTrip = deserializeOwnerCenterState(serializeOwnerCenterState(storedEvent.state));
assert.equal(ownerRoundTrip.error, "");
assert.equal(ownerRoundTrip.state.restockEvents[0].store, "Target");
const malformed = deserializeOwnerCenterState("{bad json");
assert.ok(malformed.error);
assert.deepEqual(malformed.state.restockEvents, []);

const now = Date.parse("2026-08-14T12:00:00.000Z");
assert.equal(isEndingSoon({ auctionEndTime: "2026-08-14T20:00:00.000Z" }, now), true);
assert.equal(isEndingSoon({ auctionEndTime: "2026-08-16T20:00:00.000Z" }, now), false);
const flipState = {
  deals: [{ id: "deal-1", marketplace: "Local sellers", title: "Binder", askingPrice: 100, expectedResaleMid: 200, confidence: "High", riskLevel: "Low", status: "Needs Review", dateDiscovered: "2026-08-14T10:00:00.000Z" }],
  auctions: [{ id: "auction-1", source: "Estate auction", title: "Card lot", currentBid: 50, endDateTime: "2026-08-14T20:00:00.000Z", watchStatus: "Watching" }],
  providerListings: [{ id: "ebay-1", providerId: "ebay", externalListingId: "123", title: "Sealed box", askingPrice: 80, importStatus: "New" }, { id: "ebay-duplicate", providerId: "ebay", externalListingId: "123", title: "Duplicate", askingPrice: 80 }],
  purchases: [{ id: "purchase-1", purchaseSource: "Local sellers", totalPurchaseCost: 100 }],
  inventory: [],
  sales: [{ id: "sale-1", purchaseId: "purchase-1", netProceeds: 180, realizedProfit: 80 }],
  searchRules: [{ id: "rule-1", ruleName: "Binder" }],
};
const opportunities = buildOpportunityFeed(flipState);
assert.equal(opportunities.length, 3, "provider/external listing identity is deduplicated in the cross-source feed");
assert.equal(filterAndSortOpportunities(opportunities, { minimumProfit: "50" }, "profit")[0].title, "Binder");
assert.deepEqual(filterAndSortOpportunities(opportunities, { source: "No source" }, "best"), []);
const sources = sourcePerformance(flipState);
const localSource = sources.find((row) => row.source === "Local sellers");
assert.equal(localSource.purchases, 1);
assert.equal(localSource.realizedProfit, 80);
assert.equal(searchRulePerformance(flipState.searchRules[0], flipState).recommendation, "Not Enough Data", "rule recommendations require a minimum sample");

const insufficientPattern = restockPatternSummary({ events: [{ eventTime: "2026-08-01T14:00:00.000Z", confirmationStatus: "Confirmed" }] });
assert.equal(insufficientPattern.patternStability, "Not enough data");
assert.equal(insufficientPattern.profitPerTrip, null);
assert.deepEqual(insufficientPattern.missingProfitRequirements, ["realized profit attributed to restock purchases"]);
const pattern = restockPatternSummary({
  events: [
    { eventTime: "2026-08-01T14:00:00.000Z", confirmationStatus: "Confirmed" },
    { eventTime: "2026-08-08T15:00:00.000Z", confirmationStatus: "Confirmed" },
    { eventTime: "2026-08-15T14:30:00.000Z", confirmationStatus: "Confirmed" },
  ],
  visits: [{ successful: true, miles: 10, timeSpentHours: 1 }, { successful: false, miles: 10, timeSpentHours: 1 }],
  predictions: [{ outcome: "Correct", timingErrorHours: 1 }, { outcome: "Missed", timingErrorHours: 3 }],
  purchases: [{ realizedProfit: 100 }],
});
assert.equal(pattern.patternStability, "Moderate-confidence pattern");
assert.equal(pattern.mostCommonWeekday, "Saturday");
assert.equal(pattern.successfulTripRate, 0.5);
assert.equal(pattern.profitPerTrip, 50);
assert.equal(pattern.profitPerMile, 5);
assert.equal(pattern.profitPerHour, 50);

const stalePattern = restockPatternSummary({
  events: [0, 7, 14, 21, 28, 35].map((days) => ({
    eventTime: new Date(Date.UTC(2025, 1, 8, 10) - days * 86_400_000).toISOString(),
    confirmationStatus: "Confirmed",
  })),
});
assert.notEqual(stalePattern.patternStability, "High-confidence pattern", "a large but stale sample must not bypass shared intelligence confidence");
assert.equal(stalePattern.intelligence.dataFreshness.stale, true);

assert.deepEqual(routeStateFromPath("/collection/grading"), { activeTab: "collectionWorkspace", collectionWorkspaceView: "grading" });
assert.deepEqual(routeStateFromPath("/inventory"), { activeTab: "businessWorkspace", businessWorkspaceView: "inventory" });
assert.deepEqual(routeStateFromPath("/sell"), { activeTab: "businessWorkspace", businessWorkspaceView: "sales" });
assert.deepEqual(routeStateFromPath("/business/money/mileage"), { activeTab: "businessWorkspace", businessWorkspaceView: "money", businessMoneyView: "mileage" });
assert.deepEqual(routeStateFromPath("/owner-center/restocks/live"), { activeTab: "ownerCenter", ownerCenterSection: "restocks", ownerCenterSubview: "live" });
assert.deepEqual(routeStateFromPath("/owner-center/controls/data-backup"), { activeTab: "ownerCenter", ownerCenterSection: "controls", ownerCenterSubview: "data-backup" });
assert.deepEqual(routeStateFromPath("/settings/data-backup"), { activeTab: "ownerCenter", ownerCenterSection: "controls", ownerCenterSubview: "data-backup" });
assert.equal(pathFromActiveTab("collectionWorkspace", { collectionWorkspaceView: "wishlist" }), "/collection/wishlist");
assert.equal(pathFromActiveTab("businessWorkspace", { businessWorkspaceView: "money", businessMoneyView: "reports" }), "/business/money/reports");
assert.equal(pathFromActiveTab("ownerCenter", { ownerCenterSection: "performance" }), "/owner-center/performance");

console.log("Owner Center authorization, purpose, storage, sourcing, restock, performance, and route tests passed.");
