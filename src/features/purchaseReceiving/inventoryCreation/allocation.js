import { INVENTORY_CREATION_LIMITS } from "./constants.js";

export class InventoryCreationAllocationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "InventoryCreationAllocationError";
    this.code = code;
    this.details = details;
  }
}
function safeInteger(value, field, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new InventoryCreationAllocationError("INVALID_INTEGER", `${field} must be a bounded safe integer.`, { field });
  }
  return value;
}

/**
 * Exact unit allocation. Earlier deterministic unit positions receive the remainder.
 * Example: 1000 minor units / 3 -> [334, 333, 333].
 */
export function allocateAcquisitionCostToUnits(totalMinorUnits, quantity) {
  const total = safeInteger(totalMinorUnits, "totalMinorUnits");
  const count = safeInteger(quantity, "quantity", 1, INVENTORY_CREATION_LIMITS.maximumUnitCosts);
  const totalBigInt = BigInt(total);
  const countBigInt = BigInt(count);
  const base = totalBigInt / countBigInt;
  const remainder = Number(totalBigInt % countBigInt);
  return Object.freeze(Array.from({ length: count }, (_, index) => {
    const value = base + (index < remainder ? 1n : 0n);
    const minorUnits = Number(value);
    if (!Number.isSafeInteger(minorUnits)) {
      throw new InventoryCreationAllocationError("UNIT_COST_OUT_OF_RANGE", "A unit acquisition cost exceeds safe integer precision.");
    }
    return minorUnits;
  }));
}

export function sumMinorUnits(values, field = "minorUnits") {
  if (!Array.isArray(values) || values.length > INVENTORY_CREATION_LIMITS.maximumUnitCosts) {
    throw new InventoryCreationAllocationError("INVALID_UNIT_COSTS", `${field} must be a bounded array.`);
  }
  const total = values.reduce((sum, value, index) => sum + BigInt(safeInteger(value, `${field}[${index}]`)), 0n);
  const result = Number(total);
  if (!Number.isSafeInteger(result)) throw new InventoryCreationAllocationError("TOTAL_COST_OUT_OF_RANGE", `${field} exceeds safe integer precision.`);
  return result;
}

/** Returns the exact deterministic unit-cost slice assigned to one Receiving entry. */
export function allocateReceivingCostSlice({ totalMinorUnits, accountableQuantity, precedingReceivedQuantity, receivedQuantity }) {
  const totalUnits = safeInteger(accountableQuantity, "accountableQuantity", 1, INVENTORY_CREATION_LIMITS.maximumQuantity);
  const offset = safeInteger(precedingReceivedQuantity, "precedingReceivedQuantity", 0, totalUnits);
  const count = safeInteger(receivedQuantity, "receivedQuantity", 1, totalUnits);
  if (offset + count > totalUnits) {
    throw new InventoryCreationAllocationError("RECEIVING_COST_OVERFLOW", "Receiving cost allocation exceeds the accountable Purchase quantity.");
  }
  const allUnitCosts = allocateAcquisitionCostToUnits(totalMinorUnits, totalUnits);
  const unitCostsMinorUnits = Object.freeze(allUnitCosts.slice(offset, offset + count));
  return Object.freeze({
    unitOffset: offset,
    quantity: count,
    unitCostsMinorUnits,
    totalCostMinorUnits: sumMinorUnits(unitCostsMinorUnits),
  });
}
