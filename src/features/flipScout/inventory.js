import { nonNegative, safeNumber } from "./calculations.js";
import { returnedQuantity } from "../manualLifecycles/returnLedger.js";

export function hasValidManagedExactCost(item = {}) {
  if (item.provenanceManaged !== true) return true;
  if (item.costAuthority !== "INTEGER_MINOR_UNITS" || !Number.isSafeInteger(item.quantity) || item.quantity < 0) return false;
  const unitCosts = item.unitAcquisitionCostsMinorUnits;
  if (!Array.isArray(unitCosts) || unitCosts.length !== item.quantity || unitCosts.some((value) => !Number.isSafeInteger(value) || value < 0)) return false;
  return Number.isSafeInteger(item.acquisitionCostMinorUnits)
    && item.acquisitionCostMinorUnits >= 0
    && unitCosts.reduce((total, value) => total + value, 0) === item.acquisitionCostMinorUnits;
}

function itemWeight(item, method) {
  const quantity = Math.max(0, safeNumber(item.quantity, 0));
  if (method === "quantity") return quantity;
  if (method === "relative_value") return quantity * nonNegative(item.projectedResaleMid ?? item.estimatedValue);
  return 1;
}

export function allocateLotCost({ totalCost, items = [], method = "manual" } = {}) {
  const safeTotal = nonNegative(totalCost);
  if (!Array.isArray(items) || !items.length) return [];
  if (method === "manual") {
    return items.map((item) => ({ ...item, allocatedItemCost: nonNegative(item.allocatedItemCost) }));
  }
  let weights = items.map((item) => itemWeight(item, method));
  // A119 (2026-11-01): a relative-value lot where some lines have no estimate
  // used to give those lines $0 and stall the lot. Lines without an estimate
  // now fall back to quantity weight so the lot still allocates; the
  // reconciliation names them so the owner can enter a real value.
  if (method === "relative_value" && weights.some((weight) => weight <= 0) && weights.some((weight) => weight > 0)) {
    const valued = items.map((item, index) => ({ item, index })).filter(({ index }) => weights[index] > 0);
    const averageUnitValue = valued.reduce((total, { index }) => total + weights[index], 0)
      / Math.max(1, valued.reduce((total, { item }) => total + Math.max(0, safeNumber(item.quantity, 0)), 0));
    weights = weights.map((weight, index) => weight > 0 ? weight : Math.max(0, safeNumber(items[index].quantity, 0)) * averageUnitValue);
  }
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  if (totalWeight <= 0) return items.map((item) => ({ ...item, allocatedItemCost: 0 }));
  // A120 (2026-11-01): allocate in whole cents with largest-remainder rounding
  // so the lines always add up to the lot total exactly.
  const cents = allocateCents(Math.round(safeTotal * 100), weights);
  return items.map((item, index) => ({
    ...item,
    allocatedItemCost: cents[index] / 100,
  }));
}

/** Split `totalCents` across `weights` in whole cents; the remainder goes to the largest fractional shares. */
export function allocateCents(totalCents, weights = []) {
  const total = Math.max(0, Math.round(Number(totalCents) || 0));
  const safeWeights = weights.map((weight) => Math.max(0, Number(weight) || 0));
  const totalWeight = safeWeights.reduce((sum, weight) => sum + weight, 0);
  if (!safeWeights.length || totalWeight <= 0) return safeWeights.map(() => 0);
  const exact = safeWeights.map((weight) => (total * weight) / totalWeight);
  const floors = exact.map((value) => Math.floor(value));
  let remainder = total - floors.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - floors[index], weight: safeWeights[index] }))
    .sort((left, right) => right.fraction - left.fraction || right.weight - left.weight || left.index - right.index);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floors[index] += 1;
    remainder -= 1;
  }
  return floors;
}

export function lotLinesMissingCost(items = [], method = "manual") {
  return items.filter((item) => {
    if (method === "relative_value") return nonNegative(item.projectedResaleMid ?? item.estimatedValue) <= 0;
    if (method === "manual") return item.allocatedItemCost === "" || item.allocatedItemCost == null || !Number.isFinite(Number(item.allocatedItemCost));
    return false;
  }).map((item) => item.id).filter(Boolean);
}

export function reconcileLotAllocations(totalCost, items = [], tolerance = 0.005) {
  const safeTotal = nonNegative(totalCost);
  const allocatedCost = items.reduce((total, item) => total + nonNegative(item.allocatedItemCost), 0);
  const unallocatedCost = safeTotal - allocatedCost;
  const reconciled = Math.abs(unallocatedCost) <= tolerance;
  // A119: name the lines that still have no cost so the warning says where the gap is.
  const missingItemIds = items.filter((item) => item.allocatedItemCost === "" || item.allocatedItemCost == null || !Number.isFinite(Number(item.allocatedItemCost))).map((item) => item.id).filter(Boolean);
  const missingNote = missingItemIds.length ? ` ${missingItemIds.length} line${missingItemIds.length === 1 ? " has" : "s have"} no cost yet.` : "";
  return {
    totalCost: safeTotal,
    allocatedCost,
    unallocatedCost: reconciled ? 0 : unallocatedCost,
    reconciled,
    missingItemIds,
    warning: reconciled ? "" : `${Math.abs(unallocatedCost).toFixed(2)} is ${unallocatedCost > 0 ? "unallocated" : "over-allocated"}.${missingNote}`,
  };
}

export function soldQuantityForInventory(inventoryItemId, sales = [], editingSaleId = "") {
  return sales.reduce((total, sale) => {
    if (sale.id === editingSaleId || sale.inventoryItemId !== inventoryItemId) return total;
    // A refund does not prove that the physical item returned to Inventory.
    // Only an immutable inspected-return application can release consumed units.
    if (["draft", "cancelled"].includes(String(sale.status || "").trim().toLowerCase())) return total;
    return total + nonNegative(sale.quantitySold) - returnedQuantity(sale);
  }, 0);
}

export function validateSaleQuantity({ inventoryItem, sales = [], saleDraft = {}, editingSaleId = "" } = {}) {
  if (!inventoryItem) return { valid: false, availableQuantity: 0, message: "Choose an inventory item or lot." };
  const stocked = nonNegative(inventoryItem.quantity);
  const sold = soldQuantityForInventory(inventoryItem.id, sales, editingSaleId);
  const availableQuantity = Math.max(0, stocked - sold);
  const requested = nonNegative(saleDraft.quantitySold);
  const normalizedStatus = String(saleDraft.status || "").trim().toLowerCase();
  const isDraft = normalizedStatus === "draft";
  if (normalizedStatus === "cancelled") {
    return { valid: true, availableQuantity, requestedQuantity: requested, message: "Cancelled sale saved; inventory quantity is unchanged." };
  }
  if (isDraft) return { valid: true, availableQuantity, requestedQuantity: requested, message: "Draft saved; inventory quantity is unchanged." };
  if (!hasValidManagedExactCost(inventoryItem)) {
    return { valid: false, availableQuantity, requestedQuantity: requested, message: "Owner-confirmed Inventory has an invalid exact cost basis and must be repaired before sale." };
  }
  if (inventoryItem.provenanceManaged === true && !Number.isSafeInteger(Number(saleDraft.quantitySold))) {
    return { valid: false, availableQuantity, requestedQuantity: requested, message: "Owner-confirmed Inventory must be sold in whole units." };
  }
  if (requested <= 0) return { valid: false, availableQuantity, requestedQuantity: requested, message: "Quantity sold must be greater than zero." };
  if (requested > availableQuantity) {
    return { valid: false, availableQuantity, requestedQuantity: requested, message: `Only ${availableQuantity} unit${availableQuantity === 1 ? " is" : "s are"} available to sell.` };
  }
  return { valid: true, availableQuantity, requestedQuantity: requested, message: "Quantity is available." };
}
