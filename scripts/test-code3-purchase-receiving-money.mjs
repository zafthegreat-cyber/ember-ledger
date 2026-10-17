import assert from "node:assert/strict";
import {
  comparePurchaseMoney,
  multiplyMoney,
  normalizePurchaseMoney,
  normalizePurchaseMoneySummary,
  sumPurchaseMoney,
  zeroPurchaseMoney,
} from "../src/features/purchaseReceiving/money.js";
import {
  allocateMinorUnitsProportionally,
  allocatePurchaseCosts,
} from "../src/features/purchaseReceiving/allocation.js";

let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function deepEqual(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function throws(callback, code, message) {
  assert.throws(callback, (error) => error?.code === code, message);
  assertions += 1;
}

deepEqual(normalizePurchaseMoney("12.34"), { minorUnits: 1234, currency: "USD" });
deepEqual(normalizePurchaseMoney("0.00"), { minorUnits: 0, currency: "USD" });
deepEqual(normalizePurchaseMoney("1", { currency: "CAD" }), { minorUnits: 100, currency: "CAD" });
deepEqual(normalizePurchaseMoney({ minorUnits: 1234, currency: "USD" }), { minorUnits: 1234, currency: "USD" });
deepEqual(zeroPurchaseMoney("usd"), { minorUnits: 0, currency: "USD" });

for (const value of [12, 12.34, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, [], true]) {
  throws(() => normalizePurchaseMoney(value), "EXPLICIT_MONEY_REQUIRED", "bare/non-money input is rejected");
}
for (const value of ["12.345", "-1.00", "not-money", "1e3", "", "900719925474099.99"]) {
  assert.throws(() => normalizePurchaseMoney(value));
  assertions += 1;
}
throws(() => normalizePurchaseMoney({ minorUnits: 100.5, currency: "USD" }), "INVALID_MINOR_UNITS");
throws(() => normalizePurchaseMoney({ minorUnits: -1, currency: "USD" }), "NEGATIVE_MONEY");
deepEqual(normalizePurchaseMoney({ minorUnits: -1, currency: "USD" }, { allowNegative: true }), { minorUnits: -1, currency: "USD" });

deepEqual(multiplyMoney({ minorUnits: 333, currency: "USD" }, 3), { minorUnits: 999, currency: "USD" });
deepEqual(multiplyMoney("1.25", 4), { minorUnits: 500, currency: "USD" });
for (const quantity of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
  throws(() => multiplyMoney("1.00", quantity), "INVALID_QUANTITY");
}
throws(() => multiplyMoney({ minorUnits: Number.MAX_SAFE_INTEGER, currency: "USD" }, 2), "MONEY_OUT_OF_RANGE");

deepEqual(
  sumPurchaseMoney([{ minorUnits: 101, currency: "USD" }, { minorUnits: 202, currency: "USD" }]),
  { minorUnits: 303, currency: "USD" },
);
throws(
  () => sumPurchaseMoney([{ minorUnits: 101, currency: "USD" }, { minorUnits: 202, currency: "CAD" }]),
  "CURRENCY_MISMATCH",
);
equal(comparePurchaseMoney("1.00", "2.00"), -1);
equal(comparePurchaseMoney("2.00", "2.00"), 0);
equal(comparePurchaseMoney("3.00", "2.00"), 1);

const summary = normalizePurchaseMoneySummary({
  currency: "USD",
  subtotal: "100.00",
  discount: "15.00",
  coupon: "5.00",
  tax: "6.00",
  shipping: "10.00",
  fees: "2.00",
  total: "98.00",
  refund: "8.00",
});
equal(summary.subtotal.minorUnits, 10000);
equal(summary.totalDiscount.minorUnits, 2000);
equal(summary.tax.minorUnits, 600);
equal(summary.shipping.minorUnits, 1000);
equal(summary.fees.minorUnits, 200);
equal(summary.computedGrandTotal.minorUnits, 9800);
equal(summary.grandTotal.minorUnits, 9800);
equal(summary.refunded.minorUnits, 800);
deepEqual(summary.warnings, []);

const mismatch = normalizePurchaseMoneySummary({
  currency: "USD",
  subtotal: "10.00",
  total: "10.01",
}, {
  lineItems: [
    { lineAmount: { minorUnits: 500, currency: "USD" } },
    { lineAmount: { minorUnits: 499, currency: "USD" } },
  ],
});
ok(mismatch.warnings.includes("SUBTOTAL_LINE_MISMATCH"));
ok(mismatch.warnings.includes("GRAND_TOTAL_MISMATCH"));

throws(
  () => normalizePurchaseMoneySummary({ currency: "USD", subtotal: "10.00", total: "10.00", refund: "10.01" }),
  "REFUND_EXCEEDS_PAID",
);
throws(
  () => normalizePurchaseMoneySummary({ currency: "USD", subtotal: "1.00", discount: "2.00", total: "0.00" }),
  "NEGATIVE_GRAND_TOTAL",
);
throws(
  () => normalizePurchaseMoneySummary({ currency: "USD", subtotal: "1.00", tax: { minorUnits: 1, currency: "CAD" } }),
  "CURRENCY_MISMATCH",
);

const pennyAllocation = allocateMinorUnitsProportionally(
  { minorUnits: 2, currency: "USD" },
  [
    { id: "line-c.test", stableKey: "c", weightMinorUnits: 1 },
    { id: "line-a.test", stableKey: "a", weightMinorUnits: 1 },
    { id: "line-b.test", stableKey: "b", weightMinorUnits: 1 },
  ],
);
equal(pennyAllocation.method, "PROPORTIONAL_LARGEST_REMAINDER_STABLE");
equal(pennyAllocation.reconciles, true);
equal(pennyAllocation.allocations.reduce((sum, row) => sum + row.amount.minorUnits, 0), 2);
equal(pennyAllocation.allocations.find((row) => row.id === "line-a.test").amount.minorUnits, 1, "stable key gets first remainder penny");
equal(pennyAllocation.allocations.find((row) => row.id === "line-b.test").amount.minorUnits, 1, "stable key gets second remainder penny");
equal(pennyAllocation.allocations.find((row) => row.id === "line-c.test").amount.minorUnits, 0, "remaining stable row retains its floor");

const weightedAllocation = allocateMinorUnitsProportionally(
  { minorUnits: 10, currency: "USD" },
  [
    { id: "small.test", weightMinorUnits: 1 },
    { id: "large.test", weightMinorUnits: 3 },
  ],
);
equal(weightedAllocation.allocations.find((row) => row.id === "small.test").amount.minorUnits, 2);
equal(weightedAllocation.allocations.find((row) => row.id === "large.test").amount.minorUnits, 8);
equal(weightedAllocation.allocations.reduce((sum, row) => sum + row.amount.minorUnits, 0), 10);

throws(() => allocateMinorUnitsProportionally("1.00", []), "ALLOCATION_ENTRIES_REQUIRED");
throws(() => allocateMinorUnitsProportionally("1.00", [{ id: "same", weight: 1 }, { id: "same", weight: 1 }]), "DUPLICATE_ALLOCATION_ID");
throws(() => allocateMinorUnitsProportionally("1.00", [{ id: "bad", weight: -1 }]), "INVALID_ALLOCATION_WEIGHT");
throws(() => allocateMinorUnitsProportionally("1.00", [{ id: "zero", weight: 0 }]), "ZERO_ALLOCATION_WEIGHT");

const costSummary = normalizePurchaseMoneySummary({
  currency: "USD",
  subtotal: { minorUnits: 3, currency: "USD" },
  discount: { minorUnits: 1, currency: "USD" },
  tax: { minorUnits: 1, currency: "USD" },
  shipping: { minorUnits: 1, currency: "USD" },
  fees: { minorUnits: 0, currency: "USD" },
  total: { minorUnits: 4, currency: "USD" },
});
const costPreview = allocatePurchaseCosts([
  { lineItemId: "line-c.test", lineAmount: { minorUnits: 1, currency: "USD" } },
  { lineItemId: "line-a.test", lineAmount: { minorUnits: 1, currency: "USD" } },
  { lineItemId: "line-b.test", lineAmount: { minorUnits: 1, currency: "USD" } },
], costSummary);
equal(costPreview.reconciles, true);
equal(costPreview.inventoryMutationPerformed, false, "cost allocation is a preview, not inventory mutation");
equal(costPreview.totalAllocated.minorUnits, 4);
equal(costPreview.lineItems.reduce((sum, row) => sum + row.allocatedAcquisitionCost.minorUnits, 0), 4);
ok(costPreview.lineItems.every((row) => Number.isSafeInteger(row.allocatedAcquisitionCost.minorUnits)));
equal(Object.isFrozen(costPreview), true);
equal(Object.isFrozen(costPreview.lineItems), true);

console.log(`Code 3 Purchase/Receiving exact money: ${assertions} assertions passed.`);
