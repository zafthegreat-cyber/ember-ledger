import { createMoney } from "../intelligence/money.js";
import { normalizePurchaseMoney } from "./money.js";

export class PurchaseAllocationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PurchaseAllocationError";
    this.code = code;
    this.details = details;
  }
}

function normalizeEntries(entries, options = {}) {
  if (!Array.isArray(entries) || !entries.length) {
    throw new PurchaseAllocationError("ALLOCATION_ENTRIES_REQUIRED", "At least one allocation entry is required.");
  }
  const seen = new Set();
  return entries.map((entry, index) => {
    const id = String(entry?.id ?? entry?.lineItemId ?? "").trim();
    if (!id || seen.has(id)) {
      throw new PurchaseAllocationError(seen.has(id) ? "DUPLICATE_ALLOCATION_ID" : "ALLOCATION_ID_REQUIRED", "Allocation entries require unique stable IDs.", { index });
    }
    seen.add(id);
    const rawWeight = options.weightAccessor ? options.weightAccessor(entry, index) : (entry.weightMinorUnits ?? entry.weight);
    if (!Number.isSafeInteger(rawWeight) || rawWeight < 0) {
      throw new PurchaseAllocationError("INVALID_ALLOCATION_WEIGHT", "Allocation weights must be non-negative safe integers.", { id });
    }
    return { id, stableKey: String(entry.stableKey ?? id), weightMinorUnits: rawWeight, index };
  });
}

/**
 * Allocates integer minor units by exact BigInt proportional arithmetic.
 * Floors are calculated first; remaining pennies go to largest remainders, then stable key/index.
 */
export function allocateMinorUnitsProportionally(amount, entries, options = {}) {
  const money = normalizePurchaseMoney(amount, { field: options.field || "allocation.amount" });
  const normalized = normalizeEntries(entries, options);
  const totalWeight = normalized.reduce((sum, entry) => sum + BigInt(entry.weightMinorUnits), 0n);
  if (totalWeight > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PurchaseAllocationError("ALLOCATION_WEIGHT_OUT_OF_RANGE", "Combined allocation weight exceeds safe integer precision.");
  }
  if (totalWeight === 0n && money.minorUnits !== 0) {
    throw new PurchaseAllocationError("ZERO_ALLOCATION_WEIGHT", "A non-zero amount cannot be allocated across zero-weight entries.");
  }

  const amountMinor = BigInt(money.minorUnits);
  const working = normalized.map((entry) => {
    const numerator = amountMinor * BigInt(entry.weightMinorUnits);
    const floor = totalWeight === 0n ? 0n : numerator / totalWeight;
    const remainder = totalWeight === 0n ? 0n : numerator % totalWeight;
    return { ...entry, floor, remainder, extra: 0n };
  });
  const floorTotal = working.reduce((sum, entry) => sum + entry.floor, 0n);
  const remaining = amountMinor - floorTotal;
  const ranked = [...working].sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    const keyOrder = left.stableKey.localeCompare(right.stableKey);
    return keyOrder || left.index - right.index;
  });
  for (let cursor = 0n; cursor < remaining; cursor += 1n) ranked[Number(cursor)].extra = 1n;

  const allocations = working.map((entry) => {
    const minorUnits = Number(entry.floor + entry.extra);
    if (!Number.isSafeInteger(minorUnits)) throw new PurchaseAllocationError("ALLOCATION_OUT_OF_RANGE", "Allocated money exceeds safe integer precision.");
    return Object.freeze({
      id: entry.id,
      lineItemId: entry.id,
      weightMinorUnits: entry.weightMinorUnits,
      amount: createMoney(minorUnits, money.currency, { field: `${options.field || "allocation"}.${entry.id}` }),
      roundingAdjustmentMinorUnits: Number(entry.extra),
    });
  });
  const allocatedTotal = allocations.reduce((sum, entry) => sum + entry.amount.minorUnits, 0);
  if (allocatedTotal !== money.minorUnits) throw new PurchaseAllocationError("ALLOCATION_DID_NOT_RECONCILE", "Allocated minor units did not reconcile exactly.");
  return Object.freeze({
    method: "PROPORTIONAL_LARGEST_REMAINDER_STABLE",
    amount: money,
    totalWeightMinorUnits: Number(totalWeight),
    allocations: Object.freeze(allocations),
    reconciles: true,
  });
}

function mapAllocations(result) {
  return new Map(result.allocations.map((entry) => [entry.lineItemId, entry]));
}

function exactSignedCost(parts, currency, lineItemId) {
  const total = BigInt(parts.lineAmount.minorUnits)
    - BigInt(parts.discount.amount.minorUnits)
    + BigInt(parts.tax.amount.minorUnits)
    + BigInt(parts.shipping.amount.minorUnits)
    + BigInt(parts.fees.amount.minorUnits);
  const minorUnits = Number(total);
  if (!Number.isSafeInteger(minorUnits) || minorUnits < 0) {
    throw new PurchaseAllocationError("NEGATIVE_LINE_ACQUISITION_COST", "Allocated line acquisition cost cannot be negative.", { lineItemId });
  }
  return createMoney(minorUnits, currency, { field: `lineItems.${lineItemId}.allocatedAcquisitionCost` });
}

/** Pure cost-basis preview. It does not mutate Purchase lines or Inventory. */
export function allocatePurchaseCosts(purchaseOrLines, moneySummary) {
  const lineItems = Array.isArray(purchaseOrLines) ? purchaseOrLines : purchaseOrLines?.lineItems;
  const money = Array.isArray(purchaseOrLines) ? moneySummary : (purchaseOrLines?.money || moneySummary);
  if (!Array.isArray(lineItems) || !lineItems.length || !money) {
    throw new PurchaseAllocationError("PURCHASE_ALLOCATION_INPUT_REQUIRED", "Purchase line items and a money summary are required.");
  }
  const currency = money.currency || money.grandTotal?.currency || "USD";
  let entries = lineItems.map((line, index) => ({
    id: String(line.lineItemId || line.id || ""),
    stableKey: String(line.lineItemId || line.id || index),
    weightMinorUnits: normalizePurchaseMoney(line.lineAmount, { field: `lineItems[${index}].lineAmount` }).minorUnits,
  }));
  if (entries.every((entry) => entry.weightMinorUnits === 0)) {
    entries = entries.map((entry, index) => ({
      ...entry,
      weightMinorUnits: Number.isSafeInteger(lineItems[index].quantityOrdered) && lineItems[index].quantityOrdered > 0
        ? lineItems[index].quantityOrdered
        : 1,
    }));
  }
  const components = Object.fromEntries(["discount", "tax", "shipping", "fees"].map((field) => {
    const value = field === "discount" ? (money.totalDiscount || money.discount) : money[field];
    return [field, mapAllocations(allocateMinorUnitsProportionally(
      value || createMoney(0, currency),
      entries,
      { field: `money.${field}` },
    ))];
  }));
  const rows = lineItems.map((line) => {
    const lineItemId = String(line.lineItemId || line.id);
    const parts = {
      lineAmount: normalizePurchaseMoney(line.lineAmount, { field: `lineItems.${lineItemId}.lineAmount` }),
      discount: components.discount.get(lineItemId),
      tax: components.tax.get(lineItemId),
      shipping: components.shipping.get(lineItemId),
      fees: components.fees.get(lineItemId),
    };
    return Object.freeze({
      lineItemId,
      discountAllocation: parts.discount.amount,
      taxAllocation: parts.tax.amount,
      shippingAllocation: parts.shipping.amount,
      feeAllocation: parts.fees.amount,
      allocatedAcquisitionCost: exactSignedCost(parts, currency, lineItemId),
      roundingAdjustments: Object.freeze({
        discount: parts.discount.roundingAdjustmentMinorUnits,
        tax: parts.tax.roundingAdjustmentMinorUnits,
        shipping: parts.shipping.roundingAdjustmentMinorUnits,
        fees: parts.fees.roundingAdjustmentMinorUnits,
      }),
    });
  });
  const totalAllocated = rows.reduce((sum, row) => sum + row.allocatedAcquisitionCost.minorUnits, 0);
  const expected = money.computedGrandTotal || money.grandTotal;
  if (!expected || totalAllocated !== expected.minorUnits) {
    throw new PurchaseAllocationError("PURCHASE_ALLOCATION_DID_NOT_RECONCILE", "Line acquisition costs do not reconcile to the computed Purchase total.");
  }
  return Object.freeze({
    method: "PROPORTIONAL_LARGEST_REMAINDER_STABLE",
    currency,
    lineItems: Object.freeze(rows),
    totalAllocated: createMoney(totalAllocated, currency),
    reconciles: true,
    inventoryMutationPerformed: false,
  });
}
