import assert from "node:assert/strict";

import {
  analyzeListing,
  calculateExpectedNetProceeds,
  calculateExpectedProfit,
  calculateLandedCost,
  calculateMaximumAuctionBid,
  calculateMaximumPurchasePrice,
  calculateRoi,
  safeNumber,
} from "../src/features/flipScout/calculations.js";
import { allocateLotCost, reconcileLotAllocations, validateSaleQuantity } from "../src/features/flipScout/inventory.js";
import { escapeCsvValue, recordsToCsv } from "../src/features/flipScout/csv.js";
import { FLIP_SCOUT_STORAGE_KEY, createEmptyFlipScoutState } from "../src/features/flipScout/constants.js";
import { createFlipScoutRepository, deserializeFlipScoutState, normalizeFlipScoutState, serializeFlipScoutState } from "../src/features/flipScout/storageRepository.js";
import { getDashboardSummary } from "../src/features/flipScout/selectors.js";
import { findDealForProviderListing, mergeProviderListings, providerListingToDeal } from "../src/features/flipScout/ebayDiscovery.js";
import { pathFromActiveTab, routeStateFromPath } from "../src/utils/appRouteState.js";

function closeTo(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}`);
}

const acquisition = {
  purchasePrice: 100,
  purchaseShipping: 10,
  purchaseTax: 6,
  buyerPremium: 5,
  fixedBuyerFees: 2,
  travelOrPickupCost: 3,
  preparationCost: 4,
  otherAcquisitionCosts: 1,
};
assert.equal(calculateLandedCost(acquisition), 131, "landed cost includes every acquisition cost");
assert.equal(calculateLandedCost({ purchasePrice: "", purchaseShipping: "invalid", purchaseTax: -5 }), 0, "blank, invalid, and negative acquisition values are safe");

const selling = {
  expectedResalePrice: 200,
  sellingFeePercentage: 10,
  fixedSellingFees: 5,
  outboundShipping: 10,
  packagingCost: 2,
  returnOrFraudReserve: 3,
  otherSellingCosts: 1,
};
assert.equal(calculateExpectedNetProceeds(selling), 159, "expected net deducts percentage and fixed selling costs");
assert.equal(calculateExpectedProfit({ ...acquisition, ...selling }), 28, "profit subtracts landed cost from expected net");
closeTo(calculateRoi(28, 131), 28 / 131);
assert.equal(calculateRoi(10, 0), null, "zero landed cost cannot produce a misleading ROI");
assert.equal(calculateRoi(10, -2), null, "negative landed cost cannot produce a misleading ROI");
assert.equal(safeNumber("NaN"), 0);
assert.equal(safeNumber(Infinity), 0);

const maximum = calculateMaximumPurchasePrice({
  ...acquisition,
  ...selling,
  minimumDesiredProfit: 30,
  minimumDesiredRoi: 25,
});
closeTo(maximum.allowableByRoi, 127.2);
assert.equal(maximum.allowableByProfit, 129);
closeTo(maximum.maximumLandedCost, 127.2);
closeTo(maximum.maximumBasePurchasePrice, 96.2);
assert.equal(maximum.maximumRecommendedOffer, maximum.maximumBasePurchasePrice, "offer does not invent an unsupported negotiating discount");

const appraisal = analyzeListing({
  ...acquisition,
  expectedResaleLow: 160,
  expectedResaleMidpoint: 200,
  expectedResaleHigh: 250,
  ...selling,
  expectedResalePrice: undefined,
  minimumDesiredProfit: 20,
  minimumDesiredRoi: 15,
  confidence: "Medium",
  riskNotes: "poor photos, no returns",
});
assert.equal(appraisal.landedCost, 131);
assert.equal(appraisal.midpoint.netProceeds, 159);
assert.equal(appraisal.midpoint.profit, 28);
assert.equal(appraisal.meetsBoth, true);
assert.equal(appraisal.confidence, "Medium");
assert.deepEqual(appraisal.riskFlags, ["poor photos", "no returns"]);
assert.equal(analyzeListing({ purchasePrice: "", expectedResaleMidpoint: "" }).label, "Insufficient Information");

const auctionBase = {
  estimatedResaleMid: 500,
  sellingFeePercentage: 10,
  fixedSellingFees: 5,
  outboundShipping: 20,
  packagingCost: 5,
  desiredProfit: 100,
  desiredRoi: 50,
  buyerPremiumPercentage: 10,
  taxRate: 6,
  fixedFees: 10,
  estimatedTravelCost: 20,
  estimatedLaborCost: 30,
  estimatedDisposalCost: 5,
};
const premiumTaxAuction = calculateMaximumAuctionBid({ ...auctionBase, taxBase: "hammer_plus_premium" });
closeTo(premiumTaxAuction.maximumTotalAcquisitionCost, 280);
closeTo(premiumTaxAuction.maximumHammerBid, 215 / 1.166);
closeTo(premiumTaxAuction.totalCostAtMaximum, 280);
closeTo(premiumTaxAuction.buyerPremiumAtMaximum, premiumTaxAuction.maximumHammerBid * 0.1);
closeTo(premiumTaxAuction.taxAtMaximum, (premiumTaxAuction.maximumHammerBid + premiumTaxAuction.buyerPremiumAtMaximum) * 0.06);

const hammerTaxAuction = calculateMaximumAuctionBid({ ...auctionBase, taxBase: "hammer" });
closeTo(hammerTaxAuction.maximumHammerBid, 215 / 1.16);
closeTo(hammerTaxAuction.taxAtMaximum, hammerTaxAuction.maximumHammerBid * 0.06);

const manualTaxAuction = calculateMaximumAuctionBid({ ...auctionBase, taxBase: "manual", manualTaxableSubtotal: 100 });
closeTo(manualTaxAuction.maximumHammerBid, 209 / 1.1);
assert.equal(manualTaxAuction.taxAtMaximum, 6);
closeTo(manualTaxAuction.totalCostAtMaximum, 280);
assert.equal(calculateMaximumAuctionBid({}).maximumHammerBid, 0, "empty auction inputs are safe");

const items = [{ id: "a", quantity: 1, estimatedValue: 20 }, { id: "b", quantity: 3, estimatedValue: 20 }];
const equal = allocateLotCost({ totalCost: 100, items, method: "equal" });
assert.deepEqual(equal.map((item) => item.allocatedItemCost), [50, 50]);
const quantity = allocateLotCost({ totalCost: 100, items, method: "quantity" });
assert.deepEqual(quantity.map((item) => item.allocatedItemCost), [25, 75]);
const relative = allocateLotCost({ totalCost: 100, items: [{ id: "a", quantity: 1, estimatedValue: 50 }, { id: "b", quantity: 2, estimatedValue: 25 }], method: "relative_value" });
assert.deepEqual(relative.map((item) => item.allocatedItemCost), [50, 50]);
assert.deepEqual(allocateLotCost({ totalCost: "invalid", items, method: "quantity" }).map((item) => item.allocatedItemCost), [0, 0]);
assert.equal(reconcileLotAllocations(100, quantity).reconciled, true);
const unreconciled = reconcileLotAllocations(100, [{ allocatedItemCost: 60 }]);
assert.equal(unreconciled.reconciled, false);
assert.equal(unreconciled.unallocatedCost, 40);
assert.match(unreconciled.warning, /unallocated/);
const overAllocated = reconcileLotAllocations(100, [{ allocatedItemCost: 120 }]);
assert.match(overAllocated.warning, /over-allocated/);

const inventoryItem = { id: "inv-1", quantity: 3 };
const completedSales = [{ id: "sale-1", inventoryItemId: "inv-1", quantitySold: 2, status: "Completed" }];
assert.equal(validateSaleQuantity({ inventoryItem, sales: completedSales, saleDraft: { quantitySold: 1, status: "Completed" } }).valid, true);
const duplicateSale = validateSaleQuantity({ inventoryItem, sales: completedSales, saleDraft: { quantitySold: 2, status: "Completed" } });
assert.equal(duplicateSale.valid, false);
assert.equal(duplicateSale.availableQuantity, 1);
assert.match(duplicateSale.message, /Only 1 unit is available/);
const draftSale = validateSaleQuantity({ inventoryItem, sales: completedSales, saleDraft: { quantitySold: 20, status: "Draft" } });
assert.equal(draftSale.valid, true);
assert.match(draftSale.message, /inventory quantity is unchanged/);

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}
const memory = new MemoryStorage();
const repository = createFlipScoutRepository(memory);
assert.deepEqual(repository.load().deals, []);
assert.deepEqual(repository.load().providerListings, []);
const saved = repository.upsert("deals", { title: "Real listing", status: "New" });
assert.equal(saved.error, "");
assert.equal(saved.state.deals.length, 1);
assert.ok(saved.record.id);
assert.ok(memory.getItem(FLIP_SCOUT_STORAGE_KEY));
const roundTrip = deserializeFlipScoutState(serializeFlipScoutState(saved.state));
assert.equal(roundTrip.error, "");
assert.equal(roundTrip.state.deals[0].title, "Real listing");
assert.deepEqual(normalizeFlipScoutState({ deals: "bad", sales: [null, { id: "s" }] }).deals, []);
assert.deepEqual(normalizeFlipScoutState({ deals: "bad", sales: [null, { id: "s" }] }).sales, [{ id: "s" }]);
const malformed = deserializeFlipScoutState("{not valid json");
assert.ok(malformed.error);
assert.deepEqual(malformed.state, createEmptyFlipScoutState(malformed.state.updatedAt));
const imported = repository.importJson(JSON.stringify({ schemaVersion: 1, deals: [{ id: "deal-import", title: "Imported" }] }));
assert.equal(imported.error, "");
assert.equal(imported.state.deals[0].title, "Imported");
assert.equal(imported.state.schemaVersion, 2, "Phase 1 backups migrate to the Phase 2 schema without changing the storage key");
assert.deepEqual(imported.state.providerListings, []);

const firstDiscovery = {
  providerId: "ebay",
  externalListingId: "v1|phase2-test|0",
  title: "Pokemon binder",
  askingPrice: 100,
  auctionEndTime: "2099-01-01T00:00:00.000Z",
  lastCheckedAt: "2026-08-13T12:00:00.000Z",
  dataSource: "eBay Browse API active-listing data. Asking prices are not sold comparables.",
};
const firstMerge = mergeProviderListings([], [firstDiscovery, firstDiscovery], "2026-08-13T12:00:00.000Z");
assert.equal(firstMerge.listings.length, 1, "provider and external listing ID are deduplicated");
assert.equal(firstMerge.added, 1);
const updatedMerge = mergeProviderListings(firstMerge.listings, [{ ...firstDiscovery, askingPrice: 90, lastCheckedAt: "2026-08-13T13:00:00.000Z" }], "2026-08-13T13:00:00.000Z");
assert.equal(updatedMerge.updated, 1);
assert.deepEqual(updatedMerge.listings[0].updatedFields, ["askingPrice"]);
const importedDeal = providerListingToDeal(updatedMerge.listings[0], null, "2026-08-13T13:05:00.000Z");
assert.equal(importedDeal.status, "Needs Review");
assert.equal(importedDeal.askingPrice, 90);
assert.equal(findDealForProviderListing([importedDeal], updatedMerge.listings[0]), importedDeal);
const refreshedDeal = providerListingToDeal({ ...updatedMerge.listings[0], askingPrice: 85 }, { ...importedDeal, estimatedTax: 7, notes: "Owner note", status: "Watching" });
assert.equal(refreshedDeal.askingPrice, 85, "provider-supplied changes refresh the Deal Inbox record");
assert.equal(refreshedDeal.estimatedTax, 7, "provider refresh preserves manually entered financial assumptions");
assert.equal(refreshedDeal.notes, "Owner note", "provider refresh preserves owner notes");
assert.equal(refreshedDeal.status, "Watching", "provider refresh preserves an active owner decision status");

assert.equal(escapeCsvValue("plain"), "plain");
assert.equal(escapeCsvValue("hello, world"), '"hello, world"');
assert.equal(escapeCsvValue('a "quote"'), '"a ""quote"""');
const csv = recordsToCsv([{ title: "Binder, vintage", notes: "line one\nline two", tags: ["pokemon", "binder"] }], ["title", "notes", "tags"]);
assert.equal(csv, 'title,notes,tags\r\n"Binder, vintage","line one\nline two",pokemon | binder');
assert.equal(recordsToCsv([], ["id", "title"]), "id,title", "empty CSV keeps the requested header");

assert.deepEqual(routeStateFromPath("/scout/flip-scout"), { activeTab: "flipScout", flipScoutView: "deals" });
assert.equal(pathFromActiveTab("flipScout"), "/find/deals");
const dashboard = getDashboardSummary({
  ...createEmptyFlipScoutState(),
  inventory: [{ id: "inv-dashboard", quantity: 4, allocatedItemCost: 100, projectedResaleMid: 40 }],
  sales: [{ id: "sale-dashboard", inventoryItemId: "inv-dashboard", quantitySold: 1, status: "Completed", grossSalePrice: 40, allocatedCostOfGoodsSold: 25 }],
});
assert.equal(dashboard.inventoryCost, 75, "inventory cost reflects only the unsold portion of a record allocation");
assert.equal(dashboard.projectedInventoryValue, 120);

console.log("Flip Scout calculation, allocation, sale validation, storage, and CSV tests passed.");
