import assert from "node:assert/strict";
import {
  ACCOUNTANT_REVIEW_CATEGORIES,
  ACCOUNTANT_REVIEW_FILING_STATUSES,
  ACCOUNTANT_REVIEW_PERIOD_FLAGS,
  ACCOUNTANT_REVIEW_SEVERITIES,
  deriveAccountantReviewPreview,
  filterAccountantReviewItems,
} from "../src/features/purchaseReceiving/accountantReview/index.js";
import { inventoryAdjustmentSemanticDigest } from "../src/features/purchaseReceiving/inventoryCreation/contracts.js";
import { FLIP_SCOUT_STORAGE_KEY, RECORD_COLLECTIONS } from "../src/features/flipScout/constants.js";
import { createFlipScoutRepository } from "../src/features/flipScout/storageRepository.js";
import { PURCHASE_EVENT_TYPES, PURCHASE_RECEIVING_STORAGE_KEY } from "../src/features/purchaseReceiving/constants.js";
import { createEmptyPurchaseReceivingState } from "../src/features/purchaseReceiving/repository.js";
import { INVENTORY_CORRECTION_CATEGORIES } from "../src/features/purchaseReceiving/inventoryCorrection/constants.js";
import { inventoryReconciliationEventSemanticDigest } from "../src/features/purchaseReceiving/inventoryReconciliation/contracts.js";
import {
  INVENTORY_RECONCILIATION_CATEGORIES,
} from "../src/features/purchaseReceiving/inventoryReconciliation/constants.js";
import {
  confirmReconciliation,
  appendManagedSale,
  costProposal,
  createSoldManagedInventory,
  reconciliationProposal,
} from "./inventory-reconciliation-test-helpers.mjs";
import {
  confirmCorrection,
  correctionProposal as inventoryCorrectionProposal,
  createManagedInventory,
  storedInventory,
} from "./inventory-correction-test-helpers.mjs";

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const ok = (actual, message) => { assert.ok(actual, message); assertions += 1; };

function emptyInventoryState() {
  return {
    inventory: [], inventoryLots: [], inventoryCreationApplications: [], inventoryCreationEvents: [],
    inventoryAdjustments: [], inventoryReconciliationEvents: [], sales: [], returns: [],
  };
}

async function costReview({ id, saleDate, quantity = 3, totalMinorUnits = 1000, soldQuantity = 1, targetMinorUnits = 1100, sales } = {}) {
  const harness = await createSoldManagedInventory({
    id,
    quantity,
    totalMinorUnits,
    soldQuantity,
    sales: sales || [{ quantity: soldQuantity, saleDate }],
  });
  await confirmReconciliation(harness.service, harness.inventoryItem, costProposal(id, targetMinorUnits));
  return { harness, state: harness.repository.load(), preview: deriveAccountantReviewPreview({ inventoryState: harness.repository.load() }) };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function recolorCurrency(state, currency) {
  const next = clone(state);
  for (const collection of ["inventory", "inventoryLots", "inventoryCreationApplications", "inventoryCreationEvents", "inventoryAdjustments", "inventoryReconciliationEvents"]) {
    for (const record of next[collection] || []) {
      if ("currency" in record) record.currency = currency;
      if (record.previousState) record.previousState.currency = currency;
      if (record.resultingState) record.resultingState.currency = currency;
    }
  }
  for (const adjustment of next.inventoryAdjustments) adjustment.semanticDigest = inventoryAdjustmentSemanticDigest(adjustment);
  for (const event of next.inventoryReconciliationEvents) event.semanticDigest = inventoryReconciliationEventSemanticDigest(event);
  return next;
}

{
  const preview = deriveAccountantReviewPreview({ inventoryState: emptyInventoryState() });
  equal(preview.items.length, 0, "an empty local state produces an empty review without provenance failures");
  equal(preview.summary.reviewItemCount, 0);
  equal(preview.summary.currency, null);
  equal(preview.summary.netCogsAdjustmentMinorUnits, 0);
  equal(preview.readOnly, true);
}

{
  const { state, preview } = await costReview({ id: "prior-year", saleDate: "2025-12-31", targetMinorUnits: 1100 });
  const item = preview.items[0];
  equal(preview.authoritative, false);
  equal(preview.persisted, false);
  equal(preview.readOnly, true);
  equal(preview.createsAccountingLedger, false);
  equal(preview.postsJournalEntries, false);
  equal(preview.mutatesHistoricalSales, false);
  equal(item.category, ACCOUNTANT_REVIEW_CATEGORIES.PRIOR_PERIOD_COGS_ADJUSTMENT);
  equal(item.severity, ACCOUNTANT_REVIEW_SEVERITIES.HIGH_ATTENTION);
  equal(item.taxReviewFlag, ACCOUNTANT_REVIEW_PERIOD_FLAGS.PRIOR_YEAR_REVIEW);
  equal(item.filingStatus, ACCOUNTANT_REVIEW_FILING_STATUSES.UNKNOWN);
  equal(item.originalPeriod.yearKey, "2025");
  equal(item.correctionPeriod.yearKey, "2026");
  equal(item.originalCogsMinorUnits, 334);
  equal(item.reconciliationAdjustmentMinorUnits, 33);
  equal(item.cogsAdjustmentMinorUnits, 33);
  equal(item.reconciliationAdjustment.minorUnits, 33);
  equal(item.effectiveCogsMinorUnits, 367);
  equal(item.priorEffectiveCogsMinorUnits + item.cogsAdjustmentMinorUnits, item.resultingEffectiveCogsMinorUnits);
  equal(item.currentEffectiveCogsMinorUnits, 367);
  equal(item.originalProfitMinorUnits, 1666);
  equal(item.profitAdjustmentMinorUnits, -33);
  equal(item.effectiveProfitMinorUnits, 1633);
  equal(item.inventoryLotId, item.lotId);
  equal(preview.summary.currency, "USD");
  equal(preview.summary.netCogsAdjustmentMinorUnits, 33);
  equal(preview.summary.salesAffected, 1);
  equal(preview.summary.lotsAffected, 1);
  equal(preview.summary.priorYearItems, 1);
  equal(preview.saleReviews[0].historicalSaleMutable, false);
  equal(preview.lotReviews[0].originalLotCostMinorUnits, 1000);
  equal(preview.lotReviews[0].effectiveLotCostMinorUnits, 1100);
  equal(preview.lotReviews[0].realizedCogsEffectMinorUnits, 33);
  equal(preview.lotReviews[0].remainingInventoryEffectMinorUnits, 67);
  equal(preview.lotReviews[0].reconciliationAdjustmentMinorUnits, 100);
  equal(preview.lotReviews[0].latestReconciliationDate, item.correctionDate);
  equal(preview.lotReviews[0].exactCostConserved, true);
  equal(preview.periodSummaries.years[0].currency, "USD");
  equal(preview.periodSummaries.years[0].periodKey, "2025");
  equal(preview.periodSummaries.years[0].currentEffectiveCogsMinorUnits, 367);
  equal(preview.periodSummaries.years[0].label, "Current projection including later corrections");
  ok(preview.filterOptions.years.includes("2025"));
  ok(preview.filterOptions.years.includes("2026"));
  equal(filterAccountantReviewItems(preview.items, { severity: "HIGH_ATTENTION" }).length, 1);
  equal(filterAccountantReviewItems(preview.items, { year: "2024" }).length, 0);
  equal(deriveAccountantReviewPreview({ inventoryState: state }, { saleId: item.saleId }).items.length, 1);
  ok(Object.isFrozen(preview));
  ok(Object.isFrozen(preview.items));
  ok(Object.isFrozen(item));
  ok(Object.isFrozen(item.reconciliationAdjustment));
}

{
  const { harness, state } = await costReview({ id: "refund-return", saleDate: "2026-08-15", targetMinorUnits: 1100 });
  await harness.service.recordPurchaseEvent(harness.purchase.id, {
    type: PURCHASE_EVENT_TYPES.REFUND_RECORDED,
    idempotencyKey: "purchase-event.accountant-review-refund.test",
    amount: { minorUnits: 100, currency: "USD" },
    reason: "Synthetic partial refund review.",
  });
  const refundState = JSON.parse(harness.purchaseStorage.values.get(PURCHASE_RECEIVING_STORAGE_KEY));
  const beforeInventory = JSON.stringify(state);
  const beforePurchases = JSON.stringify(refundState);
  const refundPreview = deriveAccountantReviewPreview({ inventoryState: state, purchaseReceivingState: refundState });
  const refundItem = refundPreview.items.find((entry) => entry.category === ACCOUNTANT_REVIEW_CATEGORIES.REFUND_ACCOUNTING_REVIEW);
  equal(refundItem.movementClassification, "PARTIAL_REFUND");
  equal(refundItem.refundAmountMinorUnits, 100);
  equal(refundItem.originalTransactionDate, refundState.purchases[0].purchasedAt);
  equal(refundItem.physicalInventoryMoved, false);
  equal(JSON.stringify(state), beforeInventory, "review does not mutate Inventory input");
  equal(JSON.stringify(refundState), beforePurchases, "review does not mutate Purchase input");

  await harness.service.recordPurchaseEvent(harness.purchase.id, {
    type: PURCHASE_EVENT_TYPES.RETURN_INITIATED,
    idempotencyKey: "purchase-event.accountant-review-return.test",
    lineItemId: harness.purchase.lineItems[0].lineItemId,
    quantity: 1,
    reason: "Synthetic return review.",
  });
  const refundAndReturnState = JSON.parse(harness.purchaseStorage.values.get(PURCHASE_RECEIVING_STORAGE_KEY));
  const combinedPreview = deriveAccountantReviewPreview({ inventoryState: harness.repository.load(), purchaseReceivingState: refundAndReturnState });
  const movementItems = combinedPreview.items.filter((entry) => [
    ACCOUNTANT_REVIEW_CATEGORIES.REFUND_ACCOUNTING_REVIEW,
    ACCOUNTANT_REVIEW_CATEGORIES.RETURN_ACCOUNTING_REVIEW,
  ].includes(entry.category));
  equal(movementItems.length, 2);
  ok(movementItems.every((entry) => entry.movementClassification === "REFUND_AND_RETURN"));
  ok(movementItems.every((entry) => entry.originalTransactionDate === refundAndReturnState.purchases[0].purchasedAt));
}

{
  const harness = await createManagedInventory({ id: "refund-without-reconciliation", quantity: 1, totalMinorUnits: 1000 });
  await harness.service.recordPurchaseEvent(harness.purchase.id, {
    type: PURCHASE_EVENT_TYPES.REFUND_RECORDED,
    idempotencyKey: "purchase-event.refund-without-reconciliation.test",
    amount: { minorUnits: 100, currency: "USD" },
    reason: "Synthetic refund-only review without an Inventory reconciliation.",
  });
  const purchaseState = JSON.parse(harness.purchaseStorage.values.get(PURCHASE_RECEIVING_STORAGE_KEY));
  const preview = deriveAccountantReviewPreview({ inventoryState: storedInventory(harness.inventoryStorage), purchaseReceivingState: purchaseState });
  equal(preview.items.length, 1);
  equal(preview.items[0].category, ACCOUNTANT_REVIEW_CATEGORIES.REFUND_ACCOUNTING_REVIEW);
  equal(preview.lotReviews.length, 1, "purchase-only review may safely include its single canonical lot");
  equal(preview.lotReviews[0].reconciliationAdjustmentMinorUnits, 0);
  equal(preview.lotReviews[0].reconciliationEventIds.length, 0);
  equal(preview.lotReviews[0].preReconciliationCostMinorUnits, preview.lotReviews[0].effectiveLotCostMinorUnits);
}

{
  const harness = await createManagedInventory({ id: "physical-partial-return-review", quantity: 2, totalMinorUnits: 1001 });
  const beforePurchase = JSON.parse(harness.purchaseStorage.values.get(PURCHASE_RECEIVING_STORAGE_KEY));
  const returned = await confirmCorrection(
    harness.service,
    harness.created.inventoryItem,
    inventoryCorrectionProposal(INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, "physical-partial-return-review", { quantity: 1 }),
  );
  const inventoryState = storedInventory(harness.inventoryStorage);
  const purchaseState = JSON.parse(harness.purchaseStorage.values.get(PURCHASE_RECEIVING_STORAGE_KEY));
  const beforeInventoryBytes = JSON.stringify(inventoryState);
  const beforePurchaseBytes = JSON.stringify(purchaseState);
  const preview = deriveAccountantReviewPreview({ inventoryState, purchaseReceivingState: purchaseState });
  const disposition = preview.items.find((item) => item.sourceKind === "INVENTORY_DISPOSITION");
  equal(disposition.category, ACCOUNTANT_REVIEW_CATEGORIES.RETURN_ACCOUNTING_REVIEW);
  equal(disposition.quantity, 1);
  equal(disposition.physicalInventoryMoved, true);
  equal(disposition.movementClassification, "PARTIAL_RETURN");
  equal(disposition.cogsAdjustmentMinorUnits, 0, "an unsold physical return is not mislabeled as realized COGS");
  equal(disposition.originalCogsMinorUnits, null);
  equal(disposition.inventoryCostAdjustmentMinorUnits, returned.result.adjustment.costEffectMinorUnits);
  equal(disposition.remainingInventoryEffectMinorUnits, returned.result.adjustment.costEffectMinorUnits);
  equal(preview.saleReviews.length, 0);
  equal(preview.lotReviews.length, 1);
  equal(preview.lotReviews[0].priorCorrectionEffectMinorUnits, returned.result.adjustment.costEffectMinorUnits);
  equal(preview.lotReviews[0].reconciliationAdjustmentMinorUnits, 0);
  equal(preview.summary.netCogsAdjustmentMinorUnits, 0);
  equal(JSON.stringify(inventoryState), beforeInventoryBytes, "physical return review leaves Inventory byte-equivalent");
  equal(JSON.stringify(purchaseState), beforePurchaseBytes, "physical return review leaves Purchase state byte-equivalent");
  equal(beforePurchase.purchases[0].id, purchaseState.purchases[0].id);

  await harness.service.recordPurchaseEvent(harness.purchase.id, {
    type: PURCHASE_EVENT_TYPES.REFUND_RECORDED,
    idempotencyKey: "purchase-event.physical-partial-return-refund.test",
    amount: { minorUnits: 100, currency: "USD" },
    reason: "Synthetic refund following a physical partial return.",
  });
  const refundedPurchaseState = JSON.parse(harness.purchaseStorage.values.get(PURCHASE_RECEIVING_STORAGE_KEY));
  const refunded = deriveAccountantReviewPreview({ inventoryState, purchaseReceivingState: refundedPurchaseState });
  const movementItems = refunded.items.filter((item) => [
    ACCOUNTANT_REVIEW_CATEGORIES.REFUND_ACCOUNTING_REVIEW,
    ACCOUNTANT_REVIEW_CATEGORIES.RETURN_ACCOUNTING_REVIEW,
  ].includes(item.category));
  equal(movementItems.length, 2);
  ok(movementItems.every((item) => item.movementClassification === "REFUND_AND_RETURN"), "money and physical movement remain distinct but related");
  equal(movementItems.filter((item) => item.physicalInventoryMoved).length, 1);

  const reversalProposal = inventoryCorrectionProposal(INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION, "physical-partial-return-reversal", {
    reversesAdjustmentId: returned.result.adjustment.id,
  });
  await confirmCorrection(harness.service, returned.result.inventoryItem, reversalProposal);
  const reversedInventory = storedInventory(harness.inventoryStorage);
  const reversedPreview = deriveAccountantReviewPreview({ inventoryState: reversedInventory, purchaseReceivingState: refundedPurchaseState });
  equal(reversedPreview.items.filter((item) => item.sourceKind === "INVENTORY_DISPOSITION").length, 0, "a reversed return is not presented as current physical movement");
  equal(reversedPreview.items.find((item) => item.category === ACCOUNTANT_REVIEW_CATEGORIES.REFUND_ACCOUNTING_REVIEW).movementClassification, "PARTIAL_REFUND");
}

{
  const harness = await createManagedInventory({ id: "physical-full-return-review", quantity: 1, totalMinorUnits: 700 });
  await confirmCorrection(
    harness.service,
    harness.created.inventoryItem,
    inventoryCorrectionProposal(INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER, "physical-full-return-review"),
  );
  const preview = deriveAccountantReviewPreview({
    inventoryState: storedInventory(harness.inventoryStorage),
    purchaseReceivingState: JSON.parse(harness.purchaseStorage.values.get(PURCHASE_RECEIVING_STORAGE_KEY)),
  });
  equal(preview.items.length, 1);
  equal(preview.items[0].sourceKind, "INVENTORY_DISPOSITION");
  equal(preview.items[0].movementClassification, "RETURN_ONLY");
  equal(preview.items[0].quantity, 1);
  equal(preview.items[0].physicalInventoryMoved, true);
}

{
  const harness = await createManagedInventory({ id: "unsold-cost-review", quantity: 2, totalMinorUnits: 1000 });
  const increased = await confirmCorrection(
    harness.service,
    harness.created.inventoryItem,
    inventoryCorrectionProposal(INVENTORY_CORRECTION_CATEGORIES.ACQUISITION_COST_CORRECTION, "unsold-cost-review", { targetTotalCostMinorUnits: 1100 }),
  );
  const purchaseState = JSON.parse(harness.purchaseStorage.values.get(PURCHASE_RECEIVING_STORAGE_KEY));
  purchaseState.purchases[0].purchasedAt = "2025-12-31T12:00:00.000Z";
  const inventoryState = storedInventory(harness.inventoryStorage);
  const preview = deriveAccountantReviewPreview({ inventoryState, purchaseReceivingState: purchaseState });
  equal(preview.items.length, 1);
  equal(preview.items[0].sourceKind, "INVENTORY_COST_CORRECTION");
  equal(preview.items[0].category, ACCOUNTANT_REVIEW_CATEGORIES.INVENTORY_COST_REVIEW);
  equal(preview.items[0].inventoryCostAdjustmentMinorUnits, 100);
  equal(preview.items[0].remainingInventoryEffectMinorUnits, 100);
  equal(preview.items[0].cogsAdjustmentMinorUnits, 0);
  equal(preview.items[0].originalCogsMinorUnits, null);
  equal(preview.items[0].originalProfitMinorUnits, null);
  equal(preview.items[0].physicalInventoryMoved, false);
  equal(preview.items[0].taxReviewFlag, ACCOUNTANT_REVIEW_PERIOD_FLAGS.PRIOR_YEAR_REVIEW);
  equal(preview.lotReviews.length, 1);
  equal(preview.lotReviews[0].originalLotCostMinorUnits, 1000);
  equal(preview.lotReviews[0].effectiveLotCostMinorUnits, 1100);
  equal(preview.lotReviews[0].priorCorrectionEffectMinorUnits, 100);
  equal(preview.summary.netCogsAdjustmentMinorUnits, 0);
  equal(preview.summary.lotsAffected, 1);

  const reversal = inventoryCorrectionProposal(INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION, "unsold-cost-review-reversal", {
    reversesAdjustmentId: increased.result.adjustment.id,
  });
  await confirmCorrection(harness.service, increased.result.inventoryItem, reversal);
  const reversed = deriveAccountantReviewPreview({
    inventoryState: storedInventory(harness.inventoryStorage),
    purchaseReceivingState: purchaseState,
  });
  equal(reversed.items.filter((item) => item.sourceKind === "INVENTORY_COST_CORRECTION").length, 0, "a reversed unsold cost correction is absent from the current review projection");
}

{
  const harness = await createManagedInventory({ id: "unsold-negative-cost-review", quantity: 2, totalMinorUnits: 1000 });
  await confirmCorrection(
    harness.service,
    harness.created.inventoryItem,
    inventoryCorrectionProposal(INVENTORY_CORRECTION_CATEGORIES.ACQUISITION_COST_CORRECTION, "unsold-negative-cost-review", { targetTotalCostMinorUnits: 900 }),
  );
  const preview = deriveAccountantReviewPreview({
    inventoryState: storedInventory(harness.inventoryStorage),
    purchaseReceivingState: JSON.parse(harness.purchaseStorage.values.get(PURCHASE_RECEIVING_STORAGE_KEY)),
  });
  equal(preview.items[0].inventoryCostAdjustmentMinorUnits, -100, "negative unsold cost correction remains an exact signed Inventory effect");
  equal(preview.lotReviews[0].originalLotCostMinorUnits + preview.items[0].inventoryCostAdjustmentMinorUnits, preview.lotReviews[0].effectiveLotCostMinorUnits);
  equal(preview.summary.netCogsAdjustmentMinorUnits, 0, "unsold cost corrections never enter realized COGS totals");
}

{
  const harness = await createSoldManagedInventory({
    id: "represented-return-review",
    quantity: 3,
    totalMinorUnits: 900,
    soldQuantity: 1,
    sales: [{ quantity: 1, saleDate: "2026-01-10" }],
  });
  await confirmReconciliation(
    harness.service,
    harness.inventoryItem,
    reconciliationProposal(INVENTORY_RECONCILIATION_CATEGORIES.RETURN_AFTER_SALE_RECONCILIATION, "represented-return-review", { quantity: 1 }),
  );
  const preview = deriveAccountantReviewPreview({
    inventoryState: harness.repository.load(),
    purchaseReceivingState: JSON.parse(harness.purchaseStorage.values.get(PURCHASE_RECEIVING_STORAGE_KEY)),
  });
  equal(preview.items.filter((item) => item.sourceKind === "INVENTORY_DISPOSITION").length, 0, "a return represented by historical Sale reconciliation is not duplicated");
  equal(preview.items.filter((item) => item.sourceKind === "SALE_RECONCILIATION").length, 1);
}

{
  let sourceSequence = 0;
  let targetSequence = 0;
  const source = await createSoldManagedInventory({
    id: "product-chain-source",
    quantity: 2,
    soldQuantity: 1,
    productReference: "catalog.product-chain-source.test",
    idFactory: (prefix) => `${prefix}.product-chain-source.${sourceSequence += 1}.test`,
    sales: [{ quantity: 1, saleDate: "2025-01-15" }],
  });
  const target = await createManagedInventory({
    id: "product-chain-target",
    productReference: "catalog.product-chain-target.test",
    idFactory: (prefix) => `${prefix}.product-chain-target.${targetSequence += 1}.test`,
  });
  const sourceInventory = storedInventory(source.inventoryStorage);
  const targetInventory = storedInventory(target.inventoryStorage);
  const mergedInventory = { ...sourceInventory };
  for (const collection of RECORD_COLLECTIONS) {
    mergedInventory[collection] = [...(sourceInventory[collection] || []), ...(targetInventory[collection] || [])];
  }
  source.inventoryStorage.values.set(FLIP_SCOUT_STORAGE_KEY, JSON.stringify(mergedInventory));
  const sourcePurchases = JSON.parse(source.purchaseStorage.values.get(PURCHASE_RECEIVING_STORAGE_KEY));
  const targetPurchases = JSON.parse(target.purchaseStorage.values.get(PURCHASE_RECEIVING_STORAGE_KEY));
  const mergedPurchases = { ...sourcePurchases };
  for (const collection of ["purchaseDrafts", "purchases", "purchaseEvents", "receivingEvents", "activity"]) {
    mergedPurchases[collection] = [...sourcePurchases[collection], ...targetPurchases[collection]];
  }
  source.purchaseStorage.values.set(PURCHASE_RECEIVING_STORAGE_KEY, JSON.stringify(mergedPurchases));
  const sourceItem = source.repository.load().inventory.find((entry) => entry.id === source.inventoryItem.id);
  const correctionProposal = reconciliationProposal(
    INVENTORY_RECONCILIATION_CATEGORIES.SALE_PRODUCT_RECONCILIATION,
    "product-chain-correction",
    { targetProductReference: "catalog.product-chain-target.test", targetProductTitle: "Synthetic corrected product" },
  );
  const corrected = await confirmReconciliation(source.service, sourceItem, correctionProposal);
  const reversalProposal = reconciliationProposal(
    INVENTORY_RECONCILIATION_CATEGORIES.PRIOR_CORRECTION_REVERSAL,
    "product-chain-reversal",
    { reversesReconciliationEventId: corrected.result.reconciliationEvent.id },
  );
  await confirmReconciliation(source.service, corrected.result.inventoryItem, reversalProposal);
  const preview = deriveAccountantReviewPreview({ inventoryState: source.repository.load() });
  const saleReview = preview.saleReviews.find((entry) => entry.saleId === source.sales[0].id);
  equal(saleReview.reversalChain.length, 2);
  equal(saleReview.reversalChain[0].originalProductReference, "catalog.product-chain-source.test");
  equal(saleReview.reversalChain[0].correctedProductReference, "catalog.product-chain-target.test");
  equal(saleReview.reversalChain[1].originalProductReference, "catalog.product-chain-target.test");
  equal(saleReview.reversalChain[1].correctedProductReference, "catalog.product-chain-source.test");
  equal(saleReview.originalProductReference, "catalog.product-chain-source.test");
  equal(saleReview.effectiveProductReference, "catalog.product-chain-source.test", "the final chain derives effective product without rewriting original Sale identity");
  equal(source.repository.load().sales[0].inventoryItemId, source.sales[0].inventoryItemId);
}

{
  const { preview } = await costReview({
    id: "negative-full-sale",
    saleDate: "2025-10-10",
    quantity: 2,
    totalMinorUnits: 1101,
    soldQuantity: 2,
    targetMinorUnits: 1000,
  });
  equal(preview.items[0].reconciliationAdjustmentMinorUnits, -101, "negative COGS delta remains signed exact minor units");
  equal(preview.items[0].profitAdjustmentMinorUnits, 101);
  equal(preview.lotReviews[0].remainingInventoryEffectMinorUnits, 0);
  equal(preview.summary.netCogsAdjustmentMinorUnits, -101);
}

{
  const harness = await createManagedInventory({ id: "pre-reconciliation-cost", quantity: 3, totalMinorUnits: 900 });
  const corrected = await confirmCorrection(
    harness.service,
    harness.created.inventoryItem,
    inventoryCorrectionProposal(INVENTORY_CORRECTION_CATEGORIES.ACQUISITION_COST_CORRECTION, "pre-reconciliation-cost", {
      targetTotalCostMinorUnits: 1000,
    }),
  );
  const repository = createFlipScoutRepository(harness.inventoryStorage);
  appendManagedSale(repository, corrected.result.inventoryItem, {
    id: "sale.pre-reconciliation-cost.test",
    quantity: 1,
    saleDate: "2025-06-01",
  });
  await confirmReconciliation(harness.service, corrected.result.inventoryItem, costProposal("pre-reconciliation-cost", 1100));
  const preview = deriveAccountantReviewPreview({
    inventoryState: repository.load(),
    purchaseReceivingState: JSON.parse(harness.purchaseStorage.values.get(PURCHASE_RECEIVING_STORAGE_KEY)),
  });
  equal(
    preview.items.filter((item) => item.sourceKind === "INVENTORY_COST_CORRECTION").length,
    1,
    "the earlier effective cost correction remains independently reviewable when canonical Purchase context is supplied",
  );
  const lot = preview.lotReviews[0];
  equal(lot.originalLotCostMinorUnits, 900, "original acquisition remains visible");
  equal(lot.preReconciliationCostMinorUnits, 1000, "a qualifying earlier Phase 2C-C correction forms the reconciliation baseline");
  equal(lot.priorCorrectionEffectMinorUnits, 100);
  equal(lot.reconciliationAdjustmentMinorUnits, 100);
  equal(lot.totalEffectiveAdjustmentMinorUnits, 200);
  equal(lot.effectiveLotCostMinorUnits, 1100);
  equal(lot.preReconciliationCostMinorUnits + lot.reconciliationAdjustmentMinorUnits, lot.effectiveLotCostMinorUnits);
  assert.throws(
    () => deriveAccountantReviewPreview({
      inventoryState: repository.load(),
      purchaseReceivingState: createEmptyPurchaseReceivingState(() => "2026-04-01T00:00:00.000Z"),
    }),
    (error) => error.code === "PURCHASE_REFERENCE_MISSING" && error.message.includes("Inventory adjustment"),
    "an explicitly supplied but inconsistent Purchase store fails closed with generalized adjustment copy",
  );
  assertions += 1;
}

{
  const harness = await createSoldManagedInventory({
    id: "post-reconciliation-return",
    quantity: 3,
    totalMinorUnits: 1000,
    soldQuantity: 1,
    sales: [{ quantity: 1, saleDate: "2025-06-15" }],
  });
  const reconciled = await confirmReconciliation(harness.service, harness.inventoryItem, costProposal("post-reconciliation-return", 1100));
  await confirmCorrection(
    harness.service,
    reconciled.result.inventoryItem,
    inventoryCorrectionProposal(INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, "post-reconciliation-return", { quantity: 1 }),
  );
  const preview = deriveAccountantReviewPreview({
    inventoryState: harness.repository.load(),
    purchaseReceivingState: JSON.parse(harness.purchaseStorage.values.get(PURCHASE_RECEIVING_STORAGE_KEY)),
  });
  const lot = preview.lotReviews[0];
  equal(lot.originalLotCostMinorUnits, 1000);
  equal(lot.preReconciliationCostMinorUnits, 1000);
  equal(lot.reconciliationAdjustmentMinorUnits, 100);
  equal(lot.otherInventoryAdjustmentMinorUnits, -366, "a later physical disposition is separated from reconciliation-only cost effects");
  equal(lot.laterInventoryAdjustmentMinorUnits, -366);
  equal(lot.effectiveLotCostMinorUnits, 734);
  equal(lot.preReconciliationCostMinorUnits + lot.reconciliationAdjustmentMinorUnits + lot.otherInventoryAdjustmentMinorUnits, lot.effectiveLotCostMinorUnits);
  equal(lot.otherInventoryAdjustmentIds.length, 1);
}

{
  const { preview } = await costReview({
    id: "multi-sale",
    saleDate: "2025-11-01",
    quantity: 5,
    totalMinorUnits: 1003,
    targetMinorUnits: 1011,
    sales: [
      { id: "sale.accountant-review.first.test", quantity: 2, saleDate: "2025-11-01" },
      { id: "sale.accountant-review.second.test", quantity: 1, saleDate: "2025-11-20" },
    ],
  });
  equal(preview.items.length, 2);
  equal(preview.saleReviews.length, 2);
  equal(preview.lotReviews.length, 1);
  equal(preview.summary.salesAffected, 2);
  equal(preview.lotReviews[0].realizedCogsEffectMinorUnits + preview.lotReviews[0].remainingInventoryEffectMinorUnits, 8);
  equal(preview.periodSummaries.months[0].saleCount, 2);
}

{
  const today = new Date().toISOString().slice(0, 10);
  const harness = await createSoldManagedInventory({ id: "reversal-chain", quantity: 3, totalMinorUnits: 1000, sales: [{ quantity: 1, saleDate: today }] });
  const first = await confirmReconciliation(harness.service, harness.inventoryItem, costProposal("reversal-chain-first", 1100));
  const reversal = reconciliationProposal(INVENTORY_RECONCILIATION_CATEGORIES.PRIOR_CORRECTION_REVERSAL, "reversal-chain-second", {
    reversesReconciliationEventId: first.result.reconciliationEvent.id,
  });
  await confirmReconciliation(harness.service, first.result.inventoryItem, reversal);
  const preview = deriveAccountantReviewPreview({ inventoryState: harness.repository.load() });
  equal(preview.items.length, 2);
  equal(preview.saleReviews[0].reversalChain.length, 2);
  equal(preview.saleReviews[0].reconciliationAdjustmentMinorUnits, 0);
  equal(preview.saleReviews[0].originalCogsMinorUnits, preview.saleReviews[0].effectiveCogsMinorUnits);
  equal(preview.summary.netCogsAdjustmentMinorUnits, 0);
  ok(preview.items.some((item) => item.category === ACCOUNTANT_REVIEW_CATEGORIES.RECONCILIATION_REVERSAL_REVIEW));
  equal(preview.items.find((item) => item.category === ACCOUNTANT_REVIEW_CATEGORIES.RECONCILIATION_REVERSAL_REVIEW).reversesReconciliationEventId, first.result.reconciliationEvent.id);
  ok(preview.items.every((item) => item.priorEffectiveCogsMinorUnits + item.cogsAdjustmentMinorUnits === item.resultingEffectiveCogsMinorUnits), "each event row reconciles its own before/delta/after values");
  equal(preview.items[0].currentEffectiveCogsMinorUnits, preview.saleReviews[0].effectiveCogsMinorUnits);
  equal(preview.items[1].currentEffectiveCogsMinorUnits, preview.saleReviews[0].effectiveCogsMinorUnits);
  const reversalOnly = deriveAccountantReviewPreview(
    { inventoryState: harness.repository.load() },
    { category: ACCOUNTANT_REVIEW_CATEGORIES.RECONCILIATION_REVERSAL_REVIEW },
  );
  equal(reversalOnly.items.length, 1, "category filtering selects only the reversal review row");
  equal(reversalOnly.summary.scope, "FILTERED_REVIEW_ITEMS");
  equal(reversalOnly.summary.netCogsAdjustmentMinorUnits, reversalOnly.items[0].cogsAdjustmentMinorUnits, "filtered summary reports the selected event delta only");
  equal(reversalOnly.summary.originalCogsMinorUnits, null, "filtered event selection does not mix full-chain original COGS into a partial equation");
  equal(reversalOnly.summary.currentEffectiveCogsMinorUnits, null, "filtered event selection does not mislabel the full-chain result as a partial projection");
  equal(reversalOnly.summary.historicalProjectionAvailable, false);
  equal(reversalOnly.periodSummaries.months.length, 0, "period totals are withheld when event-level filters would make a partial chain");
  equal(reversalOnly.periodSummaries.quarters.length, 0);
  equal(reversalOnly.periodSummaries.years.length, 0);
}

{
  const { state } = await costReview({ id: "inexact-profit", saleDate: "2025-08-01" });
  const inexact = clone(state);
  inexact.sales[0].netProceeds = "not-exact";
  inexact.sales[0].grossSalePrice = "not-exact";
  const preview = deriveAccountantReviewPreview({ inventoryState: inexact });
  equal(preview.items[0].netProceedsMinorUnits, null);
  equal(preview.items[0].grossRevenueMinorUnits, null);
  equal(preview.items[0].originalProfitMinorUnits, null);
  equal(preview.items[0].effectiveProfitMinorUnits, null);
  ok(preview.items[0].warnings.includes("SALE_NET_PROCEEDS_NOT_EXACT"));
  ok(preview.items[0].warnings.includes("SALE_GROSS_REVENUE_NOT_EXACT"));
  equal(preview.summary.originalProfitMinorUnits, null);
}

{
  const { state } = await costReview({ id: "missing-gross", saleDate: "2025-08-02" });
  const missingGross = clone(state);
  delete missingGross.sales[0].grossSalePrice;
  delete missingGross.sales[0].grossSalePriceMinorUnits;
  const preview = deriveAccountantReviewPreview({ inventoryState: missingGross });
  equal(preview.items[0].grossRevenueMinorUnits, null, "net proceeds are never relabeled as missing gross revenue");
  ok(preview.items[0].warnings.includes("SALE_GROSS_REVENUE_NOT_EXACT"));
  ok(Number.isSafeInteger(preview.items[0].netProceedsMinorUnits), "exact net proceeds remain independently available for profit");
}

{
  const usd = (await costReview({ id: "currency-usd", saleDate: "2025-07-01", targetMinorUnits: 1100 })).state;
  const eurSource = (await costReview({ id: "currency-eur", saleDate: "2025-07-02", targetMinorUnits: 1200 })).state;
  const eur = recolorCurrency(eurSource, "EUR");
  const mixed = emptyInventoryState();
  for (const collection of Object.keys(mixed)) mixed[collection] = [...(usd[collection] || []), ...(eur[collection] || [])];
  const preview = deriveAccountantReviewPreview({ inventoryState: mixed });
  equal(preview.summary.mixedCurrencies, true);
  equal(preview.summary.currency, null);
  equal(preview.summary.netCogsAdjustmentMinorUnits, null, "mixed currencies are never silently added");
  equal(preview.summary.currencySummaries.length, 2);
  assert.deepEqual(preview.summary.currencySummaries.map((entry) => entry.currency), ["EUR", "USD"]); assertions += 1;
  equal(preview.periodSummaries.years.length, 2, "period totals are separated by currency");
  ok(preview.periodSummaries.years.every((entry) => ["EUR", "USD"].includes(entry.currency)));
}

console.log(`Code 3 Accountant Review domain: ${assertions} assertions passed.`);
