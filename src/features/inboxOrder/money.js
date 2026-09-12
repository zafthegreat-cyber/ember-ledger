import {
  IntelligenceMoneyError,
  addMoney,
  assertMoney,
  assertSameCurrency,
  createMoney,
  normalizeCurrency,
  parseMajorMoney,
  subtractMoney,
} from "../intelligence/money.js";
import { INBOX_ORDER_LIMITS } from "./constants.js";

export class InboxOrderMoneyError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "InboxOrderMoneyError";
    this.code = code;
    this.details = details;
  }
}

function wrapMoneyError(error, field) {
  if (error instanceof InboxOrderMoneyError) throw error;
  if (error instanceof IntelligenceMoneyError) {
    throw new InboxOrderMoneyError(error.code, error.message, { field: error.field || field });
  }
  throw error;
}

export function normalizeOrderMoney(value, field, options = {}) {
  if (value == null || value === "") return null;
  try {
    if (typeof value === "string") {
      if (!options.currency) {
        throw new InboxOrderMoneyError("CURRENCY_REQUIRED", `${field} requires an explicit currency.`);
      }
      return parseMajorMoney(value, { field, currency: normalizeCurrency(options.currency, `${field}.currency`) });
    }
    return assertMoney(value, { field, allowNegative: false });
  } catch (error) {
    return wrapMoneyError(error, field);
  }
}

function multiplyMoney(value, quantity, field) {
  const money = assertMoney(value, { field });
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new InboxOrderMoneyError("INVALID_QUANTITY", `${field} quantity must be a positive safe integer.`, { field });
  }
  const result = BigInt(money.minorUnits) * BigInt(quantity);
  const minorUnits = Number(result);
  if (!Number.isSafeInteger(minorUnits)) {
    throw new InboxOrderMoneyError("MONEY_OUT_OF_RANGE", `${field} exceeds safe integer precision.`, { field });
  }
  return createMoney(minorUnits, money.currency, { field });
}

function normalizeLineItem(item, index, currency) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new InboxOrderMoneyError("INVALID_LINE_ITEM", `lineItems[${index}] must be an object.`);
  }
  const quantity = Number(item.quantity ?? 1);
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new InboxOrderMoneyError("INVALID_QUANTITY", `lineItems[${index}].quantity must be a positive safe integer.`);
  }
  const title = String(item.title || item.productName || "").trim();
  if (!title || title.length > 500) {
    throw new InboxOrderMoneyError("INVALID_LINE_TITLE", `lineItems[${index}].title is required and must be bounded.`);
  }
  const unitPrice = normalizeOrderMoney(item.unitPrice, `lineItems[${index}].unitPrice`, { currency });
  const suppliedLineTotal = normalizeOrderMoney(item.lineTotal, `lineItems[${index}].lineTotal`, { currency });
  const computedLineTotal = unitPrice ? multiplyMoney(unitPrice, quantity, `lineItems[${index}].lineTotal`) : null;
  const warnings = [];
  if (!unitPrice && !suppliedLineTotal) warnings.push("LINE_ITEM_MONEY_MISSING");
  if (suppliedLineTotal && computedLineTotal && suppliedLineTotal.minorUnits !== computedLineTotal.minorUnits) {
    warnings.push("LINE_ITEM_TOTAL_MISMATCH");
  }
  return {
    lineItemId: String(item.lineItemId || item.providerLineId || `line-${index + 1}`).trim().slice(0, 160),
    providerLineId: item.providerLineId ? String(item.providerLineId).trim().slice(0, 300) : null,
    title,
    productReference: item.productReference ? String(item.productReference).trim().slice(0, 500) : null,
    sku: item.sku ? String(item.sku).trim().slice(0, 160) : null,
    upc: item.upc ? String(item.upc).trim().slice(0, 80) : null,
    quantity,
    unitPrice,
    lineTotal: suppliedLineTotal || computedLineTotal,
    warnings,
  };
}

function inferCurrency(input) {
  if (input.currency) return normalizeCurrency(input.currency, "currency");
  const values = [input.subtotal, input.discounts, input.tax, input.shipping, input.total, input.refundAmount];
  for (const value of values) {
    if (value && typeof value === "object" && value.currency) return normalizeCurrency(value.currency, "currency");
  }
  for (const item of input.lineItems || []) {
    for (const value of [item?.unitPrice, item?.lineTotal]) {
      if (value && typeof value === "object" && value.currency) return normalizeCurrency(value.currency, "currency");
    }
  }
  return null;
}

/** Normalize order arithmetic without silently rounding or changing supplied totals. */
export function normalizeOrderAmounts(input = {}) {
  const rawItems = input.lineItems == null ? [] : input.lineItems;
  if (!Array.isArray(rawItems) || rawItems.length > INBOX_ORDER_LIMITS.maximumLineItems) {
    throw new InboxOrderMoneyError("LINE_ITEM_LIMIT", "Order line items must be a bounded array.");
  }
  const currency = inferCurrency(input);
  const hasStringMoney = [input.subtotal, input.discounts, input.tax, input.shipping, input.total, input.refundAmount]
    .some((value) => typeof value === "string")
    || rawItems.some((item) => typeof item?.unitPrice === "string" || typeof item?.lineTotal === "string");
  if (hasStringMoney && !currency) {
    throw new InboxOrderMoneyError("CURRENCY_REQUIRED", "Decimal-string order money requires an explicit currency.");
  }

  const lineItems = rawItems.map((item, index) => normalizeLineItem(item, index, currency));
  const lineTotals = lineItems.map((item) => item.lineTotal).filter(Boolean);
  const suppliedSubtotal = normalizeOrderMoney(input.subtotal, "subtotal", { currency });
  const computedLineSubtotal = lineTotals.length
    ? addMoney(lineTotals, { field: "lineItems", currency: currency || undefined })
    : null;
  const subtotal = suppliedSubtotal || computedLineSubtotal;
  const discounts = normalizeOrderMoney(input.discounts, "discounts", { currency });
  const tax = normalizeOrderMoney(input.tax, "tax", { currency });
  const shipping = normalizeOrderMoney(input.shipping, "shipping", { currency });
  const total = normalizeOrderMoney(input.total, "total", { currency });
  const refundAmount = normalizeOrderMoney(input.refundAmount, "refundAmount", { currency });
  const present = [subtotal, discounts, tax, shipping, total, refundAmount, ...lineTotals].filter(Boolean);
  if (present.length) assertSameCurrency(present, "orderAmounts");
  const resolvedCurrency = present[0]?.currency || currency;
  const zero = resolvedCurrency ? createMoney(0, resolvedCurrency) : null;
  let computedExpectedTotal = null;
  if (subtotal && zero) {
    const afterDiscount = subtractMoney(subtotal, discounts || zero, { field: "expectedTotal", allowNegative: true });
    computedExpectedTotal = addMoney([afterDiscount, tax || zero, shipping || zero], {
      field: "expectedTotal",
      allowNegative: true,
    });
  }

  const warnings = lineItems.flatMap((item) => item.warnings.map((code) => `${code}:${item.lineItemId}`));
  if (suppliedSubtotal && computedLineSubtotal && suppliedSubtotal.minorUnits !== computedLineSubtotal.minorUnits) {
    warnings.push("SUBTOTAL_LINE_SUM_MISMATCH");
  }
  if (total && computedExpectedTotal && total.minorUnits !== computedExpectedTotal.minorUnits) {
    warnings.push("ORDER_TOTAL_MISMATCH");
  }
  if (computedExpectedTotal?.minorUnits < 0) warnings.push("DISCOUNT_EXCEEDS_ORDER_VALUE");

  return Object.freeze({
    currency: resolvedCurrency,
    lineItems,
    subtotal,
    discounts,
    tax,
    shipping,
    total,
    refundAmount,
    computedLineSubtotal,
    computedExpectedTotal,
    warnings: [...new Set(warnings)],
  });
}
