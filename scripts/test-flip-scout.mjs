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
import { availableInventoryCostMajorUnits, inventoryRecordCostMajorUnits, suggestedInventorySaleCogsMajorUnits, suggestedInventorySaleCogsMinorUnits, validateManagedInventorySales } from "../src/features/flipScout/exactInventoryCost.js";
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

const exactInventory = {
  id: "inventory-item.exact.test",
  provenanceManaged: true,
  costAuthority: "INTEGER_MINOR_UNITS",
  quantity: 3,
  acquisitionCostMinorUnits: 1000,
  unitAcquisitionCostsMinorUnits: [334, 333, 333],
};
assert.equal(inventoryRecordCostMajorUnits(exactInventory), 10, "exact Inventory cost is projected from integer minor units");
assert.equal(suggestedInventorySaleCogsMajorUnits(exactInventory, [], 1), 3.34, "the first sale receives the deterministic remainder unit");
assert.equal(suggestedInventorySaleCogsMajorUnits(exactInventory, [{ id: "sale-exact-1", inventoryItemId: exactInventory.id, quantitySold: 1, status: "Completed" }], 2), 6.66, "later sales consume the next exact unit-cost slice");
assert.equal(availableInventoryCostMajorUnits(exactInventory, [{ id: "sale-exact-1", inventoryItemId: exactInventory.id, quantitySold: 1, status: "Completed" }]), 6.66, "available Inventory cost excludes already sold exact units");
assert.equal(validateSaleQuantity({ inventoryItem: exactInventory, sales: [], saleDraft: { quantitySold: 1.5, status: "Completed" } }).valid, false, "provenance-managed Inventory rejects fractional unit sales");
assert.equal(
  validateSaleQuantity({
    inventoryItem: { ...exactInventory, unitAcquisitionCostsMinorUnits: [0, 0, 0] },
    sales: [],
    saleDraft: { quantitySold: 1, status: "Completed" },
  }).valid,
  false,
  "provenance-managed Inventory with inconsistent exact costs cannot record a completed sale",
);

class MemoryStorage {
  constructor(entries = {}, { failBefore = 0, failAfter = 0 } = {}) { this.map = new Map(Object.entries(entries)); this.writes = 0; this.failBefore = failBefore; this.failAfter = failAfter; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) {
    this.writes += 1;
    if (this.failBefore > 0) { this.failBefore -= 1; throw new Error("Synthetic write failed before persistence."); }
    this.map.set(key, String(value));
    if (this.failAfter > 0) { this.failAfter -= 1; throw new Error("Synthetic response failed after persistence."); }
  }
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
assert.equal(imported.state.schemaVersion, 3, "Older backups migrate to the Phase 2C-B schema without changing the storage key");
assert.deepEqual(imported.state.inventoryLots, [], "older Business state receives an empty acquisition-lot collection");
assert.deepEqual(imported.state.inventoryCreationEvents, [], "older Business state receives an empty Inventory creation history");
assert.deepEqual(imported.state.providerListings, []);

function managedSaleInput({ id, quantity = 1, minorUnits, status = "Completed", inventoryItemId = exactInventory.id }) {
  return {
    id,
    inventoryItemId,
    quantitySold: quantity,
    status,
    allocatedCostOfGoodsSoldMinorUnits: minorUnits,
    allocatedCostOfGoodsSold: minorUnits / 100,
    costAuthority: "INTEGER_MINOR_UNITS",
  };
}

function exactManagedState() {
  return {
    ...createEmptyFlipScoutState("2026-09-01T12:00:00.000Z"),
    inventory: [{ ...exactInventory, productClassification: "Sealed product", condition: "SEALED" }],
  };
}

{
  const storage = new MemoryStorage({ [FLIP_SCOUT_STORAGE_KEY]: JSON.stringify(exactManagedState()) });
  const exactRepository = createFlipScoutRepository(storage);
  const wrong = exactRepository.upsert("sales", managedSaleInput({ id: "sale-managed-wrong.test", minorUnits: 333 }));
  assert.match(wrong.error, /exact owner-confirmed Inventory cost slice/);
  assert.equal(storage.writes, 0, "wrong managed COGS is rejected before persistence");

  const activity = { id: "activity.sale-managed-1.test", type: "SALE_RECORDED", title: "Sale recorded", detail: "Synthetic exact-cost sale.", occurredAt: "2026-09-01T12:00:00.000Z" };
  const first = exactRepository.upsert("sales", managedSaleInput({ id: "sale-managed-1.test", minorUnits: 334 }), { activityRecord: activity });
  assert.equal(first.error, "");
  assert.equal(storage.writes, 1, "managed sale and activity persist atomically in one Business-state write");
  assert.equal(first.state.sales.length, 1);
  assert.equal(first.state.activity.length, 1);
  assert.equal(first.record.inventoryAllocationSequence, 1);
  assert.equal(first.record.allocatedCostOfGoodsSoldMinorUnits, 334);

  const oversell = exactRepository.upsert("sales", managedSaleInput({ id: "sale-managed-oversell.test", quantity: 3, minorUnits: 999 }));
  assert.match(oversell.error, /exceeds owner-confirmed Inventory availability/);
  assert.equal(storage.writes, 1, "oversell rejection performs no write");

  const cancelled = exactRepository.upsert("sales", managedSaleInput({ id: "sale-managed-cancelled.test", quantity: 999, minorUnits: 0, status: " Cancelled " }));
  assert.equal(cancelled.error, "");
  assert.equal(cancelled.record.status, "Cancelled", "managed sale status is canonicalized at the repository boundary");
  assert.equal(cancelled.record.inventoryAllocationSequence, undefined, "cancelled sale consumes no exact-cost slice");

  const refundedMinor = suggestedInventorySaleCogsMinorUnits(exactInventory, exactRepository.load().sales, 1);
  const refunded = exactRepository.upsert("sales", managedSaleInput({ id: "sale-managed-refunded.test", minorUnits: refundedMinor, status: "Refunded" }));
  assert.equal(refunded.error, "");
  assert.equal(refunded.record.inventoryAllocationSequence, 2, "refund without an explicit return still consumes physical Inventory");
  assert.equal(refunded.record.allocatedCostOfGoodsSoldMinorUnits, 333);

  const draft = exactRepository.upsert("sales", { id: "sale-managed-draft.test", inventoryItemId: exactInventory.id, quantitySold: 1, status: "Draft" });
  assert.equal(draft.error, "");
  assert.equal(draft.record.inventoryAllocationSequence, undefined);
  const completionMinor = suggestedInventorySaleCogsMinorUnits(exactInventory, exactRepository.load().sales, 1, draft.record.id);
  const completedDraft = exactRepository.upsert("sales", { ...draft.record, status: "Completed", allocatedCostOfGoodsSoldMinorUnits: completionMinor, allocatedCostOfGoodsSold: completionMinor / 100, costAuthority: "INTEGER_MINOR_UNITS" });
  assert.equal(completedDraft.error, "");
  assert.equal(completedDraft.record.inventoryAllocationSequence, 3, "a later-completed draft receives the next repository allocation sequence");
  assert.equal(completedDraft.record.allocatedCostOfGoodsSoldMinorUnits, 333);
  assert.equal(validateManagedInventorySales(completedDraft.state), true);

  const activeSnapshot = exactRepository.load();
  const removedActive = { ...activeSnapshot, sales: activeSnapshot.sales.filter((sale) => sale.id !== first.record.id) };
  assert.match(exactRepository.save(removedActive).error, /append-only/);
  assert.match(exactRepository.replace(removedActive).error, /append-only/);
  assert.match(exactRepository.importJson(JSON.stringify(removedActive)).error, /cannot be replaced/);
  assert.throws(() => exactRepository.remove("sales", first.record.id), /append-only correction workflow/);
  assert.throws(() => exactRepository.upsert("sales", { ...first.record, quantitySold: 2 }), /append-only/);

  const duplicateIds = { ...activeSnapshot, sales: [...activeSnapshot.sales, { ...first.record }] };
  assert.match(exactRepository.save(duplicateIds).error, /unique stable identities/);
}

{
  const initial = exactManagedState();
  const storage = new MemoryStorage({ [FLIP_SCOUT_STORAGE_KEY]: JSON.stringify(initial) }, { failBefore: 1 });
  const exactRepository = createFlipScoutRepository(storage);
  const result = exactRepository.upsert("sales", managedSaleInput({ id: "sale-managed-fail-before.test", minorUnits: 334 }), { activityRecord: { id: "activity.fail-before.test", title: "Sale recorded" } });
  assert.ok(result.error);
  assert.equal(exactRepository.load().sales.length, 0);
  assert.equal(exactRepository.load().activity.length, 0);
}

{
  const storage = new MemoryStorage({ [FLIP_SCOUT_STORAGE_KEY]: JSON.stringify(exactManagedState()) }, { failAfter: 1 });
  const exactRepository = createFlipScoutRepository(storage);
  const result = exactRepository.upsert("sales", managedSaleInput({ id: "sale-managed-ambiguous.test", minorUnits: 334 }), { activityRecord: { id: "activity.ambiguous.test", title: "Sale recorded" } });
  assert.equal(result.error, "", "exact read-back resolves a storage response failure after persistence");
  assert.equal(result.verifiedAfterAmbiguousWrite, true);
  assert.equal(exactRepository.load().sales.length, 1);
  assert.equal(exactRepository.load().activity.length, 1);
}

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
const exactDashboard = getDashboardSummary({
  ...createEmptyFlipScoutState(),
  inventory: [exactInventory],
  sales: [{ id: "sale-exact-dashboard", inventoryItemId: exactInventory.id, quantitySold: 1, status: "Completed" }],
});
assert.equal(exactDashboard.inventoryCost, 6.66, "dashboard cost preserves unsold exact minor-unit provenance");

{
  const storage = new MemoryStorage({ [FLIP_SCOUT_STORAGE_KEY]: JSON.stringify(exactManagedState()) });
  const repository = createFlipScoutRepository(storage);
  let submitting = false;
  let releaseFirst;
  const pendingStorage = new Promise((resolve) => { releaseFirst = resolve; });
  const guardedBlankIdSale = async () => {
    if (submitting) return null;
    submitting = true;
    try {
      await pendingStorage;
      return repository.upsert("sales", managedSaleInput({ id: undefined, minorUnits: 334 }));
    } finally {
      submitting = false;
    }
  };
  const firstSubmit = guardedBlankIdSale();
  const queuedDuplicate = guardedBlankIdSale();
  releaseFirst();
  const [firstResult, duplicateResult] = await Promise.all([firstSubmit, queuedDuplicate]);
  assert.equal(firstResult.error, "");
  assert.equal(duplicateResult, null, "a synchronous in-flight guard rejects a queued blank-ID duplicate submit");
  assert.equal(repository.load().sales.length, 1, "one intended managed sale creates exactly one repository record");
}

console.log("Flip Scout calculation, allocation, sale validation, storage, and CSV tests passed.");
