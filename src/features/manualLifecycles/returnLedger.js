import { canonicalStringify } from "../backup/canonicalJson.js";

// Customer returns release previously allocated units. Acquisition quantities and
// original sale money remain historical facts; no replacement Inventory is made.
const fail = (message) => { throw new Error(message); };
export const completedSale = (sale) => !["draft", "cancelled"].includes(String(sale?.status || "").trim().toLowerCase());
export const returnApplications = (sale) => sale?.returnApplications || [];
export const returnCorrections = (sale) => sale?.returnCorrections || [];
export const hasAppliedReturns = (itemId, sales = []) => sales.some((sale) => sale.inventoryItemId === itemId && returnApplications(sale).length);
export function exactMinor(value, label = "Amount", signed = false) {
  if (!new RegExp(signed ? "^-?\\d+(?:\\.\\d{1,2})?$" : "^\\d+(?:\\.\\d{1,2})?$").test(String(value ?? ""))) fail(`${label} must have an explicit exact amount with at most two decimal places.`);
  const source = String(value); const negative = source.startsWith("-");
  const [whole, fraction = ""] = source.replace(/^-/, "").split(".");
  const amount = Number((BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) * (negative ? -1n : 1n));
  if (!Number.isSafeInteger(amount)) fail(`${label} is outside the exact supported range.`);
  return amount;
}
export function exactSum(values) {
  if (values.some((value) => !Number.isSafeInteger(value))) fail("An exact value is invalid.");
  const result = Number(values.reduce((total, value) => total + BigInt(value), 0n));
  if (!Number.isSafeInteger(result)) fail("The exact total is outside the supported range.");
  return result;
}
export function saleAmountMinor(sale, field) {
  const value = sale[field];
  return exactMinor(field !== "grossSalePrice" && (value == null || value === "") ? 0 : value, `Sale ${field}`);
}
export function saleNetMinor(sale) {
  if (Number.isSafeInteger(sale.netProceedsMinorUnits)) return sale.netProceedsMinorUnits;
  if (sale.netProceeds != null && sale.netProceeds !== "") {
    try { return exactMinor(sale.netProceeds, "Recorded sale net proceeds", true); } catch { /* Verify a legacy floating-point derivative against exact source fields. */ }
  }
  const derived = exactSum([saleAmountMinor(sale, "grossSalePrice"), saleAmountMinor(sale, "shippingChargedToBuyer"), ...["discounts", "sellingFees", "paymentFees", "actualOutboundShipping", "packaging", "refunds", "otherCosts"].map((field) => -saleAmountMinor(sale, field))]);
  if (sale.netProceeds != null && sale.netProceeds !== "" && (!Number.isFinite(Number(sale.netProceeds)) || Math.abs(Number(sale.netProceeds) - derived / 100) > 1e-8)) fail("Recorded sale net proceeds do not reconcile to exact source amounts.");
  return derived;
}
export function itemUnitCosts(item) {
  const quantity = typeof item.quantity === "string" && /^(?:0|[1-9]\d*)$/.test(item.quantity) ? Number(item.quantity) : item.quantity;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000) fail("Stock restoration requires a supported whole-unit Inventory quantity.");
  if (item.provenanceManaged === true) {
    const costs = item.unitAcquisitionCostsMinorUnits;
    if (item.costAuthority !== "INTEGER_MINOR_UNITS" || !Array.isArray(costs) || costs.length !== quantity || costs.some((cost) => !Number.isSafeInteger(cost) || cost < 0) || exactSum(costs) !== item.acquisitionCostMinorUnits) fail("Owner-confirmed Inventory cost authority is invalid.");
    return costs.slice();
  }
  const total = exactMinor(item.actualPurchasePrice ?? item.allocatedItemCost ?? item.totalPurchaseCost, "Inventory acquisition cost");
  const base = Math.floor(total / quantity); const remainder = total % quantity;
  return Array.from({ length: quantity }, (_, index) => base + (index < remainder ? 1 : 0));
}
export function orderedItemSales(itemId, sales = []) {
  return sales.filter((sale) => sale.inventoryItemId === itemId && completedSale(sale)).slice().sort((left, right) => {
    const a = left.returnSaleAllocation?.sequence ?? left.inventoryAllocationSequence;
    const b = right.returnSaleAllocation?.sequence ?? right.inventoryAllocationSequence;
    if (Number.isSafeInteger(a) && Number.isSafeInteger(b)) return a - b;
    if (left.returnSaleAllocation && !right.returnSaleAllocation) return 1;
    if (right.returnSaleAllocation && !left.returnSaleAllocation) return -1;
    return `${left.createdAt || left.saleDate || ""}\0${left.id}`.localeCompare(`${right.createdAt || right.saleDate || ""}\0${right.id}`);
  });
}
export function returnedQuantity(sale) {
  return exactSum(returnApplications(sale).map((event) => effectiveReturnApplication(sale, event).restockedQuantity));
}
export function applicationValues(event) {
  return { refundMinor: event.refundMinor, refundReference: event.refundReference, restockedQuantity: event.restockedQuantity, cogsReversalMinor: event.cogsReversalMinor, unitIndexes: event.unitIndexes.slice(), disposition: event.disposition };
}
export function effectiveReturnApplication(sale, application) {
  const corrections = returnCorrections(sale).filter((event) => event.applicationId === application.id).slice().sort((a, b) => a.sequence - b.sequence);
  return { ...applicationValues(application), ...(corrections.at(-1)?.after || {}), correctionIds: corrections.map((event) => event.id) };
}
export function returnMoneyProjection(sale) {
  const applications = returnApplications(sale);
  const events = applications.map((event) => effectiveReturnApplication(sale, event));
  return Object.freeze({ refundMinor: exactSum(events.map((event) => event.refundMinor)), cogsReversalMinor: exactSum(events.map((event) => event.cogsReversalMinor)), restockedQuantity: returnedQuantity(sale), applicationIds: applications.map((event) => event.id), correctionIds: returnCorrections(sale).map((event) => event.id) });
}

export function inventoryUnitLedger(item, sales = []) {
  const costs = itemUnitCosts(item);
  const available = new Set(costs.map((_, index) => index));
  const allocations = new Map();
  const returnedBySale = new Map();
  const effectiveApplications = new Map();
  const stockCreditOwners = new Map();
  const unitConsumers = new Map();
  const ordered = orderedItemSales(item.id, sales);
  if (new Set(ordered.map((sale) => sale.id)).size !== ordered.length) fail("Return allocations require unique sale identities.");
  const events = ordered.flatMap((sale) => returnApplications(sale)).sort((a, b) => a.sequence - b.sequence);
  const corrections = ordered.flatMap((sale) => returnCorrections(sale)).sort((a, b) => a.sequence - b.sequence);
  if (events.some((event, index) => event.sequence !== index + 1 || event.afterSaleCount < 1 || event.afterSaleCount > ordered.length || (index && event.afterSaleCount < events[index - 1].afterSaleCount))) fail("Return application order is invalid.");
  if (corrections.some((event, index) => event.sequence !== index + 1 || event.afterSaleCount < 1 || event.afterSaleCount > ordered.length || event.afterApplicationCount < 1 || event.afterApplicationCount > events.length || (index && (event.afterSaleCount < corrections[index - 1].afterSaleCount || event.afterApplicationCount < corrections[index - 1].afterApplicationCount)))) fail("Return correction order is invalid.");
  let applicationCount = 0;
  let latestActionAt = "";
  for (const [index, sale] of ordered.entries()) {
    const quantity = Number(sale.quantitySold);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > available.size) fail("Historical sale units exceed Inventory availability.");
    const expected = [...available].sort((a, b) => a - b).slice(0, quantity);
    const recorded = sale.returnSaleAllocation;
    if (recorded && (Object.keys(recorded).length !== 3 || Object.keys(recorded).some((key) => !["sequence", "unitIndexes", "unitCostsMinor"].includes(key)) || recorded.sequence !== index + 1 || JSON.stringify(recorded.unitIndexes) !== JSON.stringify(expected) || JSON.stringify(recorded.unitCostsMinor) !== JSON.stringify(expected.map((unit) => costs[unit])))) fail("A recycled sale must retain its exact reviewed unit allocation.");
    allocations.set(sale.id, expected); expected.forEach((unit) => { available.delete(unit); stockCreditOwners.delete(unit); unitConsumers.set(unit, sale.id); });
    const actions = [
      ...events.filter((entry) => entry.afterSaleCount === index + 1).map((event) => ({ event, order: event.sequence * 2, correction: false })),
      ...corrections.filter((entry) => entry.afterSaleCount === index + 1).map((event) => ({ event, order: event.afterApplicationCount * 2 + 1, correction: true })),
    ].sort((a, b) => a.order - b.order || a.event.sequence - b.event.sequence);
    for (const action of actions) {
      const event = action.event;
      if (event.appliedAt < latestActionAt) fail("Return history cannot move backwards in time.");
      latestActionAt = event.appliedAt;
      if (action.correction) {
        const application = events.find((entry) => entry.id === event.applicationId);
        const before = effectiveApplications.get(event.applicationId);
        if (!application || !before || applicationCount !== event.afterApplicationCount || canonicalStringify(before) !== canonicalStringify(event.before)) fail("Correction does not follow its reviewed application state.");
        const removed = before.unitIndexes.filter((unit) => !event.after.unitIndexes.includes(unit));
        const added = event.after.unitIndexes.filter((unit) => !before.unitIndexes.includes(unit));
        if (JSON.stringify(removed) !== JSON.stringify(event.removedUnitIndexes) || JSON.stringify(added) !== JSON.stringify(event.addedUnitIndexes)) fail("Correction unit deltas do not match the reviewed target.");
        for (const unit of removed) {
          if (!available.has(unit) || stockCreditOwners.get(unit) !== application.id) fail("Returned units already resold or attributed to a later return cannot be removed by this correction.");
          available.delete(unit); stockCreditOwners.delete(unit); unitConsumers.set(unit, application.saleId);
        }
        for (const unit of added) {
          if (available.has(unit) || unitConsumers.get(unit) !== application.saleId) fail("This correction cannot recredit a unit consumed by another sale or already in stock.");
          available.add(unit); stockCreditOwners.set(unit, application.id); unitConsumers.delete(unit);
        }
        effectiveApplications.set(application.id, event.after);
        continue;
      }
      applicationCount++;
      const source = allocations.get(event.saleId);
      if (!source) fail("A return cannot precede its sale.");
      const previous = returnedBySale.get(event.saleId) || new Set();
      const availableReturn = source.filter((unit) => !previous.has(unit));
      const claimed = availableReturn.slice(0, event.quantity);
      const selected = claimed.slice(0, event.restockedQuantity);
      if (claimed.length !== event.quantity || JSON.stringify(event.returnedUnitIndexes) !== JSON.stringify(claimed) || selected.length !== event.restockedQuantity || JSON.stringify(event.unitIndexes) !== JSON.stringify(selected) || JSON.stringify(event.unitCostsMinor) !== JSON.stringify(selected.map((unit) => costs[unit])) || event.cogsReversalMinor !== exactSum(selected.map((unit) => costs[unit]))) fail("Return stock or exact cost does not match the original sold units.");
      for (const unit of selected) {
        if (available.has(unit)) fail("A returned unit is already available.");
        available.add(unit); stockCreditOwners.set(unit, event.id); unitConsumers.delete(unit);
      }
      claimed.forEach((unit) => previous.add(unit));
      returnedBySale.set(event.saleId, previous);
      effectiveApplications.set(event.id, applicationValues(event));
    }
  }
  return { costs, allocations, returnedBySale, ordered, events, corrections, effectiveApplications, stockCreditOwners, unitConsumers, available: [...available].sort((a, b) => a - b) };
}

export function nextReturnSaleAllocation(item, sales, quantity) {
  const ledger = inventoryUnitLedger(item, sales);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > ledger.available.length) fail("The sale exceeds returned Inventory availability.");
  const unitIndexes = ledger.available.slice(0, quantity);
  return { sequence: ledger.ordered.length + 1, unitIndexes, unitCostsMinor: unitIndexes.map((unit) => ledger.costs[unit]) };
}
