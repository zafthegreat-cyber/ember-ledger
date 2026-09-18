import { nonNegative, safeNumber } from "./calculations.js";

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
  const weights = items.map((item) => itemWeight(item, method));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  if (totalWeight <= 0) return items.map((item) => ({ ...item, allocatedItemCost: 0 }));
  return items.map((item, index) => ({
    ...item,
    allocatedItemCost: safeTotal * (weights[index] / totalWeight),
  }));
}

export function reconcileLotAllocations(totalCost, items = [], tolerance = 0.005) {
  const safeTotal = nonNegative(totalCost);
  const allocatedCost = items.reduce((total, item) => total + nonNegative(item.allocatedItemCost), 0);
  const unallocatedCost = safeTotal - allocatedCost;
  const reconciled = Math.abs(unallocatedCost) <= tolerance;
  return {
    totalCost: safeTotal,
    allocatedCost,
    unallocatedCost: reconciled ? 0 : unallocatedCost,
    reconciled,
    warning: reconciled ? "" : `${Math.abs(unallocatedCost).toFixed(2)} is ${unallocatedCost > 0 ? "unallocated" : "over-allocated"}.`,
  };
}

export function soldQuantityForInventory(inventoryItemId, sales = [], editingSaleId = "") {
  return sales.reduce((total, sale) => {
    if (sale.id === editingSaleId || sale.inventoryItemId !== inventoryItemId) return total;
    // A refund does not prove that the physical item returned to Inventory.
    // Only a draft or cancelled sale is non-consuming; restock requires an explicit disposition workflow.
    if (["draft", "cancelled"].includes(String(sale.status || "").trim().toLowerCase())) return total;
    return total + nonNegative(sale.quantitySold);
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
