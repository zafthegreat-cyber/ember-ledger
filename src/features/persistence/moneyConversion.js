export const MONEY_PREVIEW_STATUS = Object.freeze({
  VALID: "VALID",
  WARNING: "WARNING",
  BLOCKED: "BLOCKED",
});

export const CURRENCY_MINOR_DIGITS = Object.freeze({
  USD: 2,
  CAD: 2,
  EUR: 2,
  GBP: 2,
  AUD: 2,
  JPY: 0,
});

export const LEGACY_MONEY_FIELDS = Object.freeze(new Set([
  "amount", "askingPrice", "asking_price", "purchasePrice", "purchase_price", "purchaseShipping", "purchase_shipping",
  "purchaseTax", "purchase_tax", "buyerPremium", "buyer_premium", "fixedBuyerFees", "fixed_buyer_fees", "travelCost",
  "travel_cost", "estimatedTravelCost", "tolls", "laborCost", "labor_cost", "estimatedLaborCost", "disposalCost",
  "disposal_cost", "estimatedDisposalCost", "cleaningCost", "cleaning_cost", "repairCost", "repair_cost",
  "preparationCost", "preparation_cost", "otherAcquisitionCosts", "other_acquisition_costs", "expectedResaleLow",
  "expected_resale_low", "expectedResale", "expected_resale", "expectedResaleMid", "expected_resale_mid",
  "expectedResaleHigh", "expected_resale_high", "projectedResaleValue", "projected_resale_value", "grossSalePrice",
  "gross_sale_price", "grossPrice", "gross_price", "shippingCharged", "shipping_charged", "shippingChargedToBuyer",
  "shipping_charged_to_buyer", "discounts", "sellingFees", "selling_fees", "paymentFees", "payment_fees",
  "fixedSellingFees", "fixed_selling_fees", "outboundShipping", "outbound_shipping", "actualShipping",
  "actual_shipping", "packaging", "insurance", "refunds", "returnCosts", "return_costs", "otherCosts", "other_costs",
  "totalCost", "total_cost", "totalPurchaseCost", "allocatedCost", "allocated_cost", "allocatedItemCost",
  "allocated_item_cost", "costOfGoodsSold", "cost_of_goods_sold", "netProceeds", "net_proceeds", "expectedProfit",
  "expected_profit", "realizedProfit", "realized_profit", "profit", "revenue", "budget", "deposit", "tax", "subtotal",
  "receiptTotal", "receipt_total", "unitPrice", "unit_price", "unitCost", "unit_cost", "lineTotal", "line_total",
  "marketValue", "market_value", "msrp", "minimumOffer", "minimum_offer", "maximumBid", "maximum_bid", "myMaximumBid",
  "currentBid", "current_bid", "outboundShippingCost", "packagingCost", "shipping", "price", "salePrice",
]));

const NEGATIVE_ALLOWED_FIELDS = new Set([
  "expectedProfit", "expected_profit", "realizedProfit", "realized_profit", "profit",
]);

function issue(code, message, severity = MONEY_PREVIEW_STATUS.BLOCKED) {
  return { code, message, severity };
}

function normalizeCurrency(currency, fallbackCurrency) {
  const value = String(currency || fallbackCurrency || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(value) ? value : "";
}

function scaleToMinorUnits(value, fractionDigits) {
  const factor = 10 ** fractionDigits;
  const scaled = value * factor;
  const rounded = Math.round(scaled);
  const tolerance = Math.max(Number.EPSILON * Math.abs(scaled) * 8, 1e-9);
  if (Math.abs(scaled - rounded) > tolerance) return { valid: false, scaled };
  if (!Number.isSafeInteger(rounded)) return { valid: false, unsafe: true, scaled };
  return { valid: true, amountMinor: rounded };
}

export function previewMoneyToMinor(value, options = {}) {
  const issues = [];
  const currencySupplied = options.currency !== undefined
    && options.currency !== null
    && String(options.currency).trim() !== "";
  const explicitCurrency = normalizeCurrency(options.currency, "");
  const fallbackCurrency = normalizeCurrency(options.defaultCurrency || "USD", "USD");
  const currency = explicitCurrency || (currencySupplied ? "" : fallbackCurrency);

  if (currencySupplied && !explicitCurrency) {
    issues.push(issue(
      "INVALID_EXPLICIT_CURRENCY",
      "The supplied currency is invalid and will not be replaced with a default.",
    ));
  } else if (!explicitCurrency) {
    issues.push(issue(
      "DEFAULT_CURRENCY_PROPOSED",
      `Currency was missing; ${fallbackCurrency} is proposed but must be confirmed before migration.`,
      MONEY_PREVIEW_STATUS.WARNING,
    ));
  }
  if (!currency || !(currency in CURRENCY_MINOR_DIGITS)) {
    issues.push(issue("UNSUPPORTED_CURRENCY", "Currency must be a supported three-letter code."));
  }
  if (options.expectedCurrency) {
    const expected = normalizeCurrency(options.expectedCurrency, "");
    if (expected && currency && expected !== currency) {
      issues.push(issue(
        "CURRENCY_MISMATCH",
        `Currency ${currency} does not match expected currency ${expected}.`,
        options.currencyMismatchBlocks === false ? MONEY_PREVIEW_STATUS.WARNING : MONEY_PREVIEW_STATUS.BLOCKED,
      ));
    }
  }

  if (typeof value === "string") {
    issues.push(issue("AMBIGUOUS_MONEY_STRING", "String money values require owner review and are not converted automatically."));
  } else if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push(issue("NON_FINITE_MONEY", "Money must be a finite numeric value."));
  } else if (value < 0 && options.allowNegative !== true) {
    issues.push(issue("NEGATIVE_MONEY_NOT_ALLOWED", "This money field cannot be negative."));
  }

  let proposedAmountMinor = null;
  if (!issues.some((entry) => entry.severity === MONEY_PREVIEW_STATUS.BLOCKED) && typeof value === "number") {
    const fractionDigits = CURRENCY_MINOR_DIGITS[currency];
    const scaled = scaleToMinorUnits(value, fractionDigits);
    if (!scaled.valid) {
      issues.push(issue(
        scaled.unsafe ? "MONEY_OUT_OF_SAFE_RANGE" : "EXCESS_CURRENCY_PRECISION",
        scaled.unsafe
          ? "The proposed minor-unit value exceeds the safe integer range."
          : `The value has more precision than ${currency} supports and will not be rounded.`,
      ));
    } else {
      proposedAmountMinor = scaled.amountMinor;
    }
  }

  const status = issues.some((entry) => entry.severity === MONEY_PREVIEW_STATUS.BLOCKED)
    ? MONEY_PREVIEW_STATUS.BLOCKED
    : issues.length
      ? MONEY_PREVIEW_STATUS.WARNING
      : MONEY_PREVIEW_STATUS.VALID;

  return {
    status,
    originalValue: value,
    currency: currency || null,
    proposedAmountMinor: status === MONEY_PREVIEW_STATUS.BLOCKED ? null : proposedAmountMinor,
    fractionDigits: currency && currency in CURRENCY_MINOR_DIGITS ? CURRENCY_MINOR_DIGITS[currency] : null,
    issues,
  };
}

function recordCurrency(record, inheritedCurrency = "") {
  return record?.currency || record?.currencyCode || record?.currency_code || inheritedCurrency;
}

export function inspectRecordMoney(record, options = {}) {
  const conversions = [];
  const warnings = [];
  const blockers = [];
  const rootPath = options.path || "$";
  const stack = [{ value: record, path: rootPath, currency: recordCurrency(record, options.currency) }];

  while (stack.length) {
    const current = stack.pop();
    if (Array.isArray(current.value)) {
      current.value.forEach((entry, index) => stack.push({
        value: entry,
        path: `${current.path}[${index}]`,
        currency: current.currency,
      }));
      continue;
    }
    if (!current.value || typeof current.value !== "object") continue;
    const currency = recordCurrency(current.value, current.currency);
    for (const [key, value] of Object.entries(current.value)) {
      if (LEGACY_MONEY_FIELDS.has(key) && value !== "" && value != null) {
        const conversion = previewMoneyToMinor(value, {
          currency,
          defaultCurrency: options.defaultCurrency,
          expectedCurrency: options.expectedCurrency,
          currencyMismatchBlocks: options.currencyMismatchBlocks,
          allowNegative: NEGATIVE_ALLOWED_FIELDS.has(key),
        });
        const finding = { path: `${current.path}.${key}`, field: key, ...conversion };
        conversions.push(finding);
        if (conversion.status === MONEY_PREVIEW_STATUS.BLOCKED) blockers.push(finding);
        else if (conversion.status === MONEY_PREVIEW_STATUS.WARNING) warnings.push(finding);
      }
      if (value && typeof value === "object") {
        stack.push({ value, path: `${current.path}.${key}`, currency });
      }
    }
  }

  return { conversions, warnings, blockers };
}

export function validateCanonicalMoney(value, options = {}) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: ["Money must contain amountMinor and currency."] };
  }
  if (!Number.isSafeInteger(value.amountMinor)) errors.push("amountMinor must be a safe integer.");
  if (value.amountMinor < 0 && options.allowNegative !== true) errors.push("amountMinor cannot be negative.");
  const currency = normalizeCurrency(value.currency, "");
  if (!currency || !(currency in CURRENCY_MINOR_DIGITS)) errors.push("currency must be a supported three-letter code.");
  return { valid: errors.length === 0, errors, amountMinor: value.amountMinor, currency: currency || null };
}
