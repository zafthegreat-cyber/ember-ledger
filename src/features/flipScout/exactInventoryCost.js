import { nonNegative } from "./calculations.js";
import { hasValidManagedExactCost, soldQuantityForInventory } from "./inventory.js";

function exactUnitCosts(item = {}) {
  if (item.provenanceManaged !== true || !hasValidManagedExactCost(item)) return null;
  return item.unitAcquisitionCostsMinorUnits;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function countsAgainstInventory(sale = {}) {
  return !["draft", "cancelled"].includes(String(sale.status || "").trim().toLowerCase());
}

function saleOrder(left, right) {
  const leftSequence = Number(left.inventoryAllocationSequence);
  const rightSequence = Number(right.inventoryAllocationSequence);
  if (Number.isSafeInteger(leftSequence) && Number.isSafeInteger(rightSequence) && leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }
  const leftKey = `${left.createdAt || left.saleDate || ""}\u0000${left.id || ""}`;
  const rightKey = `${right.createdAt || right.saleDate || ""}\u0000${right.id || ""}`;
  return leftKey.localeCompare(rightKey);
}

function exactMajorUnitsToMinorUnits(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [major, fraction = ""] = text.split(".");
  const minor = BigInt(major) * 100n + BigInt(fraction.padEnd(2, "0"));
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

export function suggestedInventorySaleCogsMinorUnits(item = {}, sales = [], quantity = 0, editingSaleId = "") {
  const exact = exactUnitCosts(item);
  if (!exact || !Number.isSafeInteger(quantity) || quantity < 1) return null;
  const active = sales
    .filter((sale) => sale.inventoryItemId === item.id && sale.id !== editingSaleId && countsAgainstInventory(sale));
  const editingSale = sales.find((sale) => sale.id === editingSaleId);
  const editingHasAllocation = editingSale && countsAgainstInventory(editingSale) && Number.isSafeInteger(editingSale.inventoryAllocationSequence);
  const prior = editingHasAllocation
    ? active.filter((sale) => saleOrder(sale, editingSale) < 0)
    : active;
  const sold = prior.reduce((total, sale) => total + (Number.isSafeInteger(Number(sale.quantitySold)) ? Number(sale.quantitySold) : Number.NaN), 0);
  if (!Number.isSafeInteger(sold) || sold < 0 || sold + quantity > exact.length) return null;
  return sum(exact.slice(sold, sold + quantity));
}

export function validateManagedInventorySales(state = {}) {
  const managedItems = new Map((state.inventory || []).filter((item) => item.provenanceManaged === true).map((item) => [item.id, item]));
  const linkedSales = (state.sales || []).filter((sale) => managedItems.has(sale.inventoryItemId));
  const linkedIds = linkedSales.map((sale) => String(sale.id || "").trim());
  if (linkedIds.some((id) => !id) || new Set(linkedIds).size !== linkedIds.length) {
    throw new Error("Sales linked to owner-confirmed Inventory require unique stable identities.");
  }
  for (const item of managedItems.values()) {
    const exact = exactUnitCosts(item);
    if (!exact) throw new Error("Owner-confirmed Inventory has an invalid exact cost basis.");
    const active = (state.sales || [])
      .filter((sale) => sale.inventoryItemId === item.id && countsAgainstInventory(sale))
      .sort(saleOrder);
    let offset = 0;
    for (const [index, sale] of active.entries()) {
      const quantity = Number(sale.quantitySold);
      if (sale.inventoryAllocationSequence !== index + 1
        || !Number.isFinite(new Date(sale.inventoryAllocationAt).getTime())) {
        throw new Error("A completed sale must retain its repository-assigned Inventory allocation order.");
      }
      if (!Number.isSafeInteger(quantity) || quantity < 1 || offset + quantity > exact.length) {
        throw new Error("A completed sale exceeds owner-confirmed Inventory availability.");
      }
      const expectedMinorUnits = sum(exact.slice(offset, offset + quantity));
      if (sale.costAuthority !== "INTEGER_MINOR_UNITS"
        || sale.allocatedCostOfGoodsSoldMinorUnits !== expectedMinorUnits
        || exactMajorUnitsToMinorUnits(sale.allocatedCostOfGoodsSold) !== expectedMinorUnits) {
        throw new Error("A completed sale must retain the exact owner-confirmed Inventory cost slice.");
      }
      offset += quantity;
    }
  }
  return true;
}

export function hasExactInventoryCost(item) {
  return exactUnitCosts(item) !== null;
}

export function inventoryRecordCostMajorUnits(item = {}) {
  const exact = exactUnitCosts(item);
  if (exact) return sum(exact) / 100;
  if (item.provenanceManaged === true) return null;
  const legacy = item.actualPurchasePrice ?? item.allocatedItemCost ?? item.totalPurchaseCost;
  return nonNegative(legacy);
}

export function availableInventoryCostMajorUnits(item = {}, sales = []) {
  const exact = exactUnitCosts(item);
  const sold = soldQuantityForInventory(item.id, sales);
  if (exact) {
    if (!Number.isSafeInteger(sold) || sold < 0 || sold > exact.length) return 0;
    return sum(exact.slice(sold)) / 100;
  }
  if (item.provenanceManaged === true) return 0;
  const quantity = Math.max(1, nonNegative(item.quantity || 1));
  const available = Math.max(0, quantity - sold);
  return inventoryRecordCostMajorUnits(item) * (available / quantity);
}

export function suggestedInventorySaleCogsMajorUnits(item = {}, sales = [], quantity = 0, editingSaleId = "") {
  const exact = exactUnitCosts(item);
  if (exact) return (suggestedInventorySaleCogsMinorUnits(item, sales, quantity, editingSaleId) ?? 0) / 100;
  const sold = soldQuantityForInventory(item.id, sales, editingSaleId);
  if (item.provenanceManaged === true) return 0;
  const stocked = nonNegative(item.quantity);
  return stocked > 0 ? (inventoryRecordCostMajorUnits(item) / stocked) * nonNegative(quantity) : 0;
}
