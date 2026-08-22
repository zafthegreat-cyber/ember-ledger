import { nonNegative, safeNumber } from "./calculations.js";

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
    if (["draft", "cancelled", "refunded"].includes(String(sale.status || "").toLowerCase())) return total;
    return total + nonNegative(sale.quantitySold);
  }, 0);
}

export function validateSaleQuantity({ inventoryItem, sales = [], saleDraft = {}, editingSaleId = "" } = {}) {
  if (!inventoryItem) return { valid: false, availableQuantity: 0, message: "Choose an inventory item or lot." };
  const stocked = nonNegative(inventoryItem.quantity);
  const sold = soldQuantityForInventory(inventoryItem.id, sales, editingSaleId);
  const availableQuantity = Math.max(0, stocked - sold);
  const requested = nonNegative(saleDraft.quantitySold);
  const isDraft = String(saleDraft.status || "").toLowerCase() === "draft";
  if (isDraft) return { valid: true, availableQuantity, requestedQuantity: requested, message: "Draft saved; inventory quantity is unchanged." };
  if (requested <= 0) return { valid: false, availableQuantity, requestedQuantity: requested, message: "Quantity sold must be greater than zero." };
  if (requested > availableQuantity) {
    return { valid: false, availableQuantity, requestedQuantity: requested, message: `Only ${availableQuantity} unit${availableQuantity === 1 ? " is" : "s are"} available to sell.` };
  }
  return { valid: true, availableQuantity, requestedQuantity: requested, message: "Quantity is available." };
}
