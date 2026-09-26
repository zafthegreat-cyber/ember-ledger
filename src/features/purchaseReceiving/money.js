import {
  addMoney,
  assertMoney,
  assertSameCurrency,
  createMoney,
  normalizeCurrency,
  parseMajorMoney,
} from "../intelligence/money.js";

export class PurchaseMoneyError extends Error {
  constructor(code, message, field = "money") {
    super(message);
    this.name = "PurchaseMoneyError";
    this.code = code;
    this.field = field;
  }
}

/** Bare numbers are intentionally rejected: integer minor units must be explicit money objects. */
export function normalizePurchaseMoney(value, options = {}) {
  const field = options.field || "money";
  try {
    if (typeof value === "string") {
      return parseMajorMoney(value, { field, currency: options.currency || "USD" });
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return assertMoney(value, { field, allowNegative: Boolean(options.allowNegative) });
    }
  } catch (error) {
    if (error?.code) throw error;
    throw new PurchaseMoneyError("INVALID_MONEY", `${field} is not valid exact money.`, field);
  }
  throw new PurchaseMoneyError(
    "EXPLICIT_MONEY_REQUIRED",
    `${field} must be a decimal string or an object containing safe integer minorUnits and currency.`,
    field,
  );
}

export function zeroPurchaseMoney(currency = "USD", field = "money") {
  return createMoney(0, normalizeCurrency(currency), { field });
}

export function multiplyMoney(value, quantity, options = {}) {
  const field = options.field || "money";
  const money = normalizePurchaseMoney(value, { field, allowNegative: Boolean(options.allowNegative) });
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new PurchaseMoneyError("INVALID_QUANTITY", `${options.quantityField || "quantity"} must be a non-negative safe integer.`, options.quantityField || "quantity");
  }
  const product = BigInt(money.minorUnits) * BigInt(quantity);
  const minorUnits = Number(product);
  if (!Number.isSafeInteger(minorUnits)) {
    throw new PurchaseMoneyError("MONEY_OUT_OF_RANGE", `${field} multiplication exceeds safe integer precision.`, field);
  }
  return createMoney(minorUnits, money.currency, { field, allowNegative: Boolean(options.allowNegative) });
}

export function sumPurchaseMoney(values, options = {}) {
  try {
    return addMoney(
      values.map((value, index) => normalizePurchaseMoney(value, {
        field: `${options.field || "money"}[${index}]`,
        allowNegative: Boolean(options.allowNegative),
      })),
      { field: options.field || "money", currency: options.currency || "USD", allowNegative: Boolean(options.allowNegative) },
    );
  } catch (error) {
    if (error?.code) throw error;
    throw new PurchaseMoneyError("INVALID_MONEY_SUM", "Money values could not be summed exactly.", options.field || "money");
  }
}

export function comparePurchaseMoney(left, right, field = "money") {
  const normalizedLeft = normalizePurchaseMoney(left, { field: `${field}.left`, allowNegative: true });
  const normalizedRight = normalizePurchaseMoney(right, { field: `${field}.right`, allowNegative: true });
  assertSameCurrency([normalizedLeft, normalizedRight], field);
  return Math.sign(normalizedLeft.minorUnits - normalizedRight.minorUnits);
}

function optionalMoney(value, currency, field) {
  if (value == null) return zeroPurchaseMoney(currency, field);
  const normalizedValue = value && typeof value === "object" && !Array.isArray(value)
    && !("minorUnits" in value) && "amount" in value
    ? value.amount
    : value;
  return normalizePurchaseMoney(normalizedValue, { currency, field });
}

function safeArithmetic(values, signs, currency, field) {
  let total = 0n;
  values.forEach((money, index) => {
    total += BigInt(money.minorUnits) * BigInt(signs[index]);
  });
  const minorUnits = Number(total);
  if (!Number.isSafeInteger(minorUnits) || minorUnits < 0) {
    throw new PurchaseMoneyError(
      minorUnits < 0 ? "NEGATIVE_GRAND_TOTAL" : "MONEY_OUT_OF_RANGE",
      `${field} cannot be negative or exceed safe integer precision.`,
      field,
    );
  }
  return createMoney(minorUnits, currency, { field });
}

/** Normalizes positive components; discounts/refunds are stored as positive amounts with explicit semantics. */
export function normalizePurchaseMoneySummary(value = {}, options = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PurchaseMoneyError("MONEY_SUMMARY_REQUIRED", "Purchase money summary must be an object.", options.field || "money");
  }
  const field = options.field || "money";
  const currency = normalizeCurrency(value.currency || options.currency || "USD", `${field}.currency`);
  const computedSubtotal = options.lineItems
    ? sumPurchaseMoney(options.lineItems.map((line) => line.lineAmount), { currency, field: `${field}.lineSubtotal` })
    : null;
  const subtotal = value.subtotal == null && computedSubtotal
    ? computedSubtotal
    : normalizePurchaseMoney(value.subtotal, { currency, field: `${field}.subtotal` });
  const discount = optionalMoney(value.discount, currency, `${field}.discount`);
  const coupon = optionalMoney(value.coupon, currency, `${field}.coupon`);
  const promotion = optionalMoney(value.promotion, currency, `${field}.promotion`);
  const tax = optionalMoney(value.tax, currency, `${field}.tax`);
  const shipping = optionalMoney(value.shipping, currency, `${field}.shipping`);
  const fees = optionalMoney(value.fees, currency, `${field}.fees`);
  const refunded = optionalMoney(value.refunded ?? value.refund, currency, `${field}.refunded`);
  assertSameCurrency([subtotal, discount, coupon, promotion, tax, shipping, fees, refunded], field);
  const totalDiscount = sumPurchaseMoney([discount, coupon, promotion], { currency, field: `${field}.totalDiscount` });
  const computedGrandTotal = safeArithmetic(
    [subtotal, totalDiscount, tax, shipping, fees],
    [1, -1, 1, 1, 1],
    currency,
    `${field}.computedGrandTotal`,
  );
  const suppliedTotal = value.grandTotal ?? value.total;
  const grandTotal = suppliedTotal == null
    ? computedGrandTotal
    : normalizePurchaseMoney(suppliedTotal, { currency, field: `${field}.grandTotal` });
  if (refunded.minorUnits > grandTotal.minorUnits) {
    throw new PurchaseMoneyError("REFUND_EXCEEDS_PAID", "Refunded money cannot exceed the Purchase grand total.", `${field}.refunded`);
  }
  const warnings = [];
  if (computedSubtotal && computedSubtotal.minorUnits !== subtotal.minorUnits) warnings.push("SUBTOTAL_LINE_MISMATCH");
  if (computedGrandTotal.minorUnits !== grandTotal.minorUnits) warnings.push("GRAND_TOTAL_MISMATCH");
  return Object.freeze({
    currency,
    subtotal,
    discount,
    coupon,
    promotion,
    totalDiscount,
    tax,
    shipping,
    fees,
    grandTotal,
    refunded,
    computedGrandTotal,
    warnings: Object.freeze(warnings),
  });
}
