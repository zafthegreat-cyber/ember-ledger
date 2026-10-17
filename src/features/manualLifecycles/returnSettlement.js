import { canonicalStringify } from "../backup/canonicalJson.js";
import { effectiveManagedSaleCogsMinorUnits, inventoryReconciliationVersion } from "../purchaseReceiving/inventoryReconciliation/contracts.js";
import { buildLifecycleRecord } from "./contracts.js";
import { completedSale, effectiveReturnApplication, exactMinor, exactSum, hasAppliedReturns, inventoryUnitLedger, returnApplications, returnCorrections, returnMoneyProjection, saleAmountMinor, saleNetMinor } from "./returnLedger.js";
import { validateReturnCorrectionRecords } from "./returnCorrectionContracts.js";

const fail = (message) => { throw new Error(message); };
const equal = (left, right) => canonicalStringify(left) === canonicalStringify(right);
const eventKeys = ["id", "format", "returnId", "reviewedReturnVersion", "closedReturnVersion", "saleId", "inventoryItemId", "currency", "sequence", "afterSaleCount", "appliedAt", "quantity", "restockedQuantity", "refundMinor", "refundReference", "disposition", "inspection", "returnedUnitIndexes", "unitIndexes", "unitCostsMinor", "cogsReversalMinor"];
const integer = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
const withoutReturns = (sale) => { const copy = { ...sale }; delete copy.returnApplications; delete copy.returnCorrections; return copy; };
const money = saleAmountMinor;
export function returnApplicationFor(state, returnId) { return (state.sales || []).flatMap(returnApplications).find((event) => event.returnId === returnId) || null; }

function saleCost(sale, state) {
  return sale.costAuthority === "INTEGER_MINOR_UNITS"
    ? effectiveManagedSaleCogsMinorUnits(sale, state.inventoryReconciliationEvents || [])
    : exactMinor(sale.allocatedCostOfGoodsSold, "Original sale cost of goods");
}
export function verifiedReturnLedger(item, state) {
  const ledger = inventoryUnitLedger(item, state.sales);
  for (const sale of ledger.ordered) {
    const date = typeof sale.saleDate === "string" ? sale.saleDate : "";
    const parsed = Date.parse(date.length === 10 ? `${date}T00:00:00.000Z` : date);
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}\.\d{3}Z)?$/.test(date) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date.slice(0, 10)) fail("A valid original sale date is required before applying a return.");
    const allocated = exactSum(ledger.allocations.get(sale.id).map((unit) => ledger.costs[unit]));
    if (saleCost(sale, state) !== allocated) fail("The original sale cost does not match its exact Inventory units. Reconcile that cost before applying the return.");
    const returns = returnMoneyProjection(sale);
    const net = saleNetMinor(sale);
    const originalRecordedCogs = sale.costAuthority === "INTEGER_MINOR_UNITS" ? sale.allocatedCostOfGoodsSoldMinorUnits : exactMinor(sale.allocatedCostOfGoodsSold, "Original sale cost");
    exactSum([net, -originalRecordedCogs]);
    exactSum([net, -saleCost(sale, state)]);
    const effectiveNet = exactSum([net, -returns.refundMinor]);
    const effectiveCogs = exactSum([saleCost(sale, state), -returns.cogsReversalMinor]);
    exactSum([effectiveNet, -effectiveCogs]);
  }
  return ledger;
}

export function previewSaleReturn(state, returnId) {
  const record = (state.manualLifecycles || []).find((row) => row.id === returnId && row.type === "saleReturn");
  if (!record) fail("The return record is missing. Reload before review.");
  const sale = state.sales.find((row) => row.id === record.saleId);
  const item = state.inventory.find((row) => row.id === sale?.inventoryItemId);
  if (!sale || !completedSale(sale) || !item) fail("The completed sale and its original Inventory record are required.");
  if (!/^[A-Z]{3}$/.test(item.currency || "USD")) fail("An explicit supported currency code is required before return review.");
  if (!["Inspected", "Closed"].includes(record.status) || !record.inspection.trim()) fail("Receive and inspect the return before applying stock or refund changes.");
  const existing = returnApplicationFor(state, returnId);
  const ledger = verifiedReturnLedger(item, state);
  if (existing) {
    const effective = effectiveReturnApplication(sale, existing);
    return Object.freeze({ ...existing, ...effective, status: "APPLIED", canApply: false, alreadyApplied: true, application: existing, effective, corrections: returnCorrections(sale).filter((event) => event.applicationId === existing.id), returnId, saleId: sale.id, inventoryItemId: item.id, availableBefore: ledger.available.length, availableAfter: ledger.available.length, blockers: [], currency: item.currency || "USD" });
  }
  if (record.disposition === "Quarantine") fail("Choose an inspected disposition before applying the return.");
  const related = ledger.events.filter((event) => event.saleId === sale.id);
  if (exactSum(related.map((event) => event.quantity)) + record.quantity > Number(sale.quantitySold)) fail("Applied returns exceed the original sale quantity.");
  const refundLimitMinor = exactSum([money(sale, "grossSalePrice"), money(sale, "shippingChargedToBuyer"), -money(sale, "discounts"), -money(sale, "refunds")]);
  if (!integer(record.refundMinor) || exactSum([returnMoneyProjection(sale).refundMinor, record.refundMinor]) > refundLimitMinor) fail("Applied refunds exceed the original recorded payment.");
  const restockedQuantity = record.disposition === "Restock review" ? record.quantity : 0;
  const used = ledger.returnedBySale.get(sale.id) || new Set();
  const returnedUnitIndexes = ledger.allocations.get(sale.id).filter((unit) => !used.has(unit)).slice(0, record.quantity);
  const unitIndexes = returnedUnitIndexes.slice(0, restockedQuantity);
  if (unitIndexes.length !== restockedQuantity) fail("Those sale units have already been restored.");
  const unitCostsMinor = unitIndexes.map((unit) => ledger.costs[unit]);
  const priorMoney = returnMoneyProjection(sale);
  const projectedNetMinor = exactSum([saleNetMinor(sale), -priorMoney.refundMinor, -record.refundMinor]);
  const projectedCogsMinor = exactSum([saleCost(sale, state), -priorMoney.cogsReversalMinor, -exactSum(unitCostsMinor)]);
  exactSum([projectedNetMinor, -projectedCogsMinor]);
  const snapshot = { record, item, sales: ledger.ordered, reconciliation: (state.inventoryReconciliationEvents || []).filter((event) => event.inventoryItemId === item.id) };
  return Object.freeze({ status: "READY", canApply: true, alreadyApplied: false, returnId, saleId: sale.id, inventoryItemId: item.id, expectedVersion: inventoryReconciliationVersion(snapshot), quantity: record.quantity, restockedQuantity, refundMinor: record.refundMinor, refundReference: record.refundReference, cogsReversalMinor: exactSum(unitCostsMinor), returnedUnitIndexes, unitIndexes, unitCostsMinor, availableBefore: ledger.available.length, availableAfter: ledger.available.length + restockedQuantity, afterSaleCount: ledger.ordered.length, sequence: ledger.events.length + 1, blockers: [], currency: item.currency || "USD", disposition: record.disposition, inspection: record.inspection });
}

export function buildSaleReturnApplication(state, { returnId, expectedVersion, confirmed }, at) {
  if (confirmed !== true) fail("Review and explicitly confirm the return before applying it.");
  const preview = previewSaleReturn(state, returnId);
  if (preview.alreadyApplied) return { state, application: preview.application, alreadyApplied: true };
  if (!expectedVersion || expectedVersion !== preview.expectedVersion) fail("The return, sale or Inventory changed after review. Refresh the preview before applying.");
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(at) || new Date(at).toISOString() !== at) fail("A valid application time is required.");
  const record = state.manualLifecycles.find((row) => row.id === returnId);
  if (at < record.updatedAt) fail("Return application cannot predate its inspection.");
  const closed = buildLifecycleRecord("saleReturn", { status: "Closed" }, record, { id: record.id, at });
  const application = Object.freeze({ id: `sale-return:${returnId}`, format: "CODE3_LOCAL_SALE_RETURN_V1", returnId, reviewedReturnVersion: record.recordVersion, closedReturnVersion: closed.recordVersion, saleId: preview.saleId, inventoryItemId: preview.inventoryItemId, currency: preview.currency, sequence: preview.sequence, afterSaleCount: preview.afterSaleCount, appliedAt: at, quantity: preview.quantity, restockedQuantity: preview.restockedQuantity, refundMinor: preview.refundMinor, refundReference: preview.refundReference, disposition: preview.disposition, inspection: preview.inspection, returnedUnitIndexes: preview.returnedUnitIndexes, unitIndexes: preview.unitIndexes, unitCostsMinor: preview.unitCostsMinor, cogsReversalMinor: preview.cogsReversalMinor });
  const next = { ...state, sales: state.sales.map((sale) => sale.id === preview.saleId ? { ...sale, returnApplications: [...returnApplications(sale), application] } : sale), manualLifecycles: state.manualLifecycles.map((row) => row.id === returnId ? closed : row) };
  validateReturnState(next);
  return { state: next, application, alreadyApplied: false };
}

export function validateReturnState(state) {
  validateReturnCorrectionRecords(state);
  const ids = new Set();
  for (const sale of state.sales || []) {
    if (sale.returnApplications != null && !Array.isArray(sale.returnApplications)) fail("Saved return applications are unreadable and have been preserved.");
    for (const event of returnApplications(sale)) {
      if (!event || Object.keys(event).length !== eventKeys.length || Object.keys(event).some((key) => !eventKeys.includes(key)) || event.format !== "CODE3_LOCAL_SALE_RETURN_V1" || event.id !== `sale-return:${event.returnId}` || ids.has(event.id)) fail("Saved return application identity is invalid.");
      ids.add(event.id);
      if (!/^[A-Z]{3}$/.test(event.currency || "") || event.currency !== ((state.inventory || []).find((item) => item.id === sale.inventoryItemId)?.currency || "USD")) fail("Return currency no longer matches its original Inventory authority.");
      if (event.saleId !== sale.id || event.inventoryItemId !== sale.inventoryItemId || !completedSale(sale) || !integer(event.quantity, 1) || !integer(event.restockedQuantity) || event.restockedQuantity > event.quantity || !integer(event.refundMinor) || !integer(event.cogsReversalMinor) || !integer(event.sequence, 1) || !integer(event.afterSaleCount, 1) || !Array.isArray(event.unitIndexes) || !Array.isArray(event.unitCostsMinor)) fail("Saved return application values are invalid.");
      const record = (state.manualLifecycles || []).find((row) => row.id === event.returnId && row.type === "saleReturn");
      const reviewed = record?.history?.[event.reviewedReturnVersion - 1];
      if (!record || record.saleId !== sale.id || record.status !== "Closed" || record.recordVersion !== event.closedReturnVersion || event.closedReturnVersion !== event.reviewedReturnVersion + 1 || !["Inspected", "Closed"].includes(reviewed?.values?.status) || record.updatedAt !== event.appliedAt || event.appliedAt < reviewed.at || !equal({ ...reviewed.values, status: "Closed" }, record.history.at(-1).values)) fail("The return application no longer matches its immutable reviewed inspection.");
      if (["quantity", "refundMinor", "refundReference", "disposition", "inspection"].some((key) => record[key] !== event[key]) || event.restockedQuantity !== (record.disposition === "Restock review" ? record.quantity : 0) || record.disposition === "Quarantine" || !record.inspection.trim() || (event.refundMinor && !record.refundReference.trim())) fail("Return application money or disposition does not match its review.");
    }
    if (returnApplications(sale).length) {
      if (exactSum(returnApplications(sale).map((event) => event.quantity)) > Number(sale.quantitySold)) fail("Applied returns exceed the original sale quantity.");
      const paid = exactSum([money(sale, "grossSalePrice"), money(sale, "shippingChargedToBuyer"), -money(sale, "discounts"), -money(sale, "refunds")]);
      if (returnMoneyProjection(sale).refundMinor > paid) fail("Applied refunds exceed the original recorded payment.");
    }
  }
  for (const item of state.inventory || []) if (hasAppliedReturns(item.id, state.sales)) verifiedReturnLedger(item, state);
  for (const sale of state.sales || []) if (returnApplications(sale).length && !(state.inventory || []).some((item) => item.id === sale.inventoryItemId)) fail("Returned stock cannot lose its original Inventory record.");
  return true;
}

export function validateReturnTransition(current, next, { applicationId = "", correctionId = "", saleAppendId = "" } = {}) {
  validateReturnState(next);
  for (const sale of current.sales) {
    const saved = next.sales.find((row) => row.id === sale.id);
    const oldEvents = returnApplications(sale); const newEvents = returnApplications(saved);
    const previousCorrections = returnCorrections(sale); const nextCorrections = returnCorrections(saved);
    if (!equal(nextCorrections.slice(0, previousCorrections.length), previousCorrections)) fail("Applied correction history cannot be removed or rewritten.");
    if (nextCorrections.length !== previousCorrections.length && (nextCorrections.length !== previousCorrections.length + 1 || nextCorrections.at(-1).id !== correctionId)) fail("Corrections require the reviewed correction workflow.");
    if (oldEvents.length && (!saved || !equal(newEvents.slice(0, oldEvents.length), oldEvents))) fail("Applied return history cannot be removed or rewritten.");
    if (newEvents.length !== oldEvents.length && (newEvents.length !== oldEvents.length + 1 || newEvents.at(-1).id !== applicationId)) fail("Return applications require the reviewed apply workflow.");
    if ((completedSale(sale) && hasAppliedReturns(sale.inventoryItemId, current.sales)) || newEvents.length) {
      if (!saved || !equal(withoutReturns(saved), withoutReturns(sale))) fail("Sales supporting returned stock are immutable; original money and quantities must remain unchanged.");
    }
  }
  for (const sale of next.sales.filter((row) => !current.sales.some((before) => before.id === row.id && completedSale(before)))) {
    if (returnApplications(sale).length) fail("A new sale cannot invent prior return applications.");
    if (returnCorrections(sale).length) fail("A new sale cannot invent prior return corrections.");
    if ((sale.returnSaleAllocation || (completedSale(sale) && hasAppliedReturns(sale.inventoryItemId, current.sales))) && (sale.id !== saleAppendId || !sale.returnSaleAllocation)) fail("Recycled units must be allocated by the verified sale writer.");
  }
  for (const item of current.inventory) if (hasAppliedReturns(item.id, current.sales)) {
    const saved = next.inventory.find((row) => row.id === item.id);
    const protectedFields = ["quantity", "currency", "actualPurchasePrice", "allocatedItemCost", "totalPurchaseCost", "acquisitionCostMinorUnits", "unitAcquisitionCostsMinorUnits", "provenanceManaged", "costAuthority", "productReference", "inventoryLotId", "inventoryCreationApplicationId"];
    if (!saved || protectedFields.some((key) => !equal(saved[key] ?? null, item[key] ?? null))) fail("Inventory with applied customer returns requires a return-aware correction; its stock and cost basis cannot be changed generically.");
  }
}
