const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const MAJOR_MONEY_PATTERN = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

export class IntelligenceMoneyError extends Error {
  constructor(code, message, field = "money") {
    super(message);
    this.name = "IntelligenceMoneyError";
    this.code = code;
    this.field = field;
  }
}

export function normalizeCurrency(value, field = "currency") {
  const currency = String(value || "").trim().toUpperCase();
  if (!CURRENCY_PATTERN.test(currency)) {
    throw new IntelligenceMoneyError("INVALID_CURRENCY", `${field} must be a three-letter currency code.`, field);
  }
  return currency;
}

function assertSafeMinorUnits(value, field, allowNegative) {
  if (!Number.isSafeInteger(value)) {
    throw new IntelligenceMoneyError("INVALID_MINOR_UNITS", `${field} must use safe integer minor units.`, field);
  }
  if (!allowNegative && value < 0) {
    throw new IntelligenceMoneyError("NEGATIVE_MONEY", `${field} cannot be negative.`, field);
  }
}

export function createMoney(minorUnits, currency = "USD", options = {}) {
  const field = options.field || "money";
  assertSafeMinorUnits(minorUnits, field, Boolean(options.allowNegative));
  return Object.freeze({ minorUnits, currency: normalizeCurrency(currency, `${field}.currency`) });
}

export function parseMajorMoney(value, options = {}) {
  const field = options.field || "money";
  if (typeof value !== "string") {
    throw new IntelligenceMoneyError("MAJOR_STRING_REQUIRED", `${field} must be supplied as a decimal string.`, field);
  }
  const text = value.trim();
  const match = MAJOR_MONEY_PATTERN.exec(text);
  if (!match) {
    const overPrecision = /^\d+\.\d{3,}$/.test(text);
    throw new IntelligenceMoneyError(
      overPrecision ? "EXCESS_PRECISION" : "MALFORMED_MONEY",
      overPrecision ? `${field} has more than two decimal places.` : `${field} is not a valid non-negative money value.`,
      field,
    );
  }
  const whole = Number(match[1]);
  const fraction = (match[2] || "").padEnd(2, "0");
  const minorUnits = (whole * 100) + Number(fraction || 0);
  if (!Number.isSafeInteger(minorUnits)) {
    throw new IntelligenceMoneyError("MONEY_OUT_OF_RANGE", `${field} exceeds safe integer precision.`, field);
  }
  return createMoney(minorUnits, options.currency || "USD", { field });
}

export function assertMoney(value, options = {}) {
  const field = options.field || "money";
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IntelligenceMoneyError("MONEY_OBJECT_REQUIRED", `${field} must be a money object.`, field);
  }
  return createMoney(value.minorUnits, value.currency, {
    field,
    allowNegative: Boolean(options.allowNegative),
  });
}

export function assertSameCurrency(values, field = "money") {
  const currencies = new Set(values.filter(Boolean).map((value) => assertMoney(value, { field, allowNegative: true }).currency));
  if (currencies.size > 1) {
    throw new IntelligenceMoneyError("CURRENCY_MISMATCH", `${field} values must use one currency.`, field);
  }
  return currencies.values().next().value || null;
}

export function addMoney(values, options = {}) {
  const present = values.filter((value) => value !== null && value !== undefined);
  const currency = assertSameCurrency(present, options.field || "money") || normalizeCurrency(options.currency || "USD");
  const minorUnits = present.reduce((sum, value, index) => {
    const normalized = assertMoney(value, { field: `${options.field || "money"}[${index}]`, allowNegative: true });
    const next = sum + normalized.minorUnits;
    if (!Number.isSafeInteger(next)) throw new IntelligenceMoneyError("MONEY_OUT_OF_RANGE", "Money total exceeds safe integer precision.");
    return next;
  }, 0);
  return createMoney(minorUnits, currency, { allowNegative: Boolean(options.allowNegative), field: options.field });
}

export function subtractMoney(left, right, options = {}) {
  const currency = assertSameCurrency([left, right], options.field || "money");
  const result = assertMoney(left, { allowNegative: true }).minorUnits - assertMoney(right, { allowNegative: true }).minorUnits;
  return createMoney(result, currency, { allowNegative: options.allowNegative !== false, field: options.field });
}

export function calculateBasisPointAmount(amount, rateBasisPoints, options = {}) {
  const field = options.field || "rateBasisPoints";
  const normalized = assertMoney(amount, { field: options.amountField || "amount", allowNegative: Boolean(options.allowNegative) });
  if (!Number.isSafeInteger(rateBasisPoints) || rateBasisPoints < 0 || rateBasisPoints > (options.maxBasisPoints || 100_000)) {
    throw new IntelligenceMoneyError("INVALID_RATE", `${field} must be a bounded non-negative integer.`, field);
  }

  const numerator = BigInt(normalized.minorUnits) * BigInt(rateBasisPoints);
  const denominator = 10_000n;
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  const minorUnits = Number(rounded);
  if (!Number.isSafeInteger(minorUnits)) {
    throw new IntelligenceMoneyError("MONEY_OUT_OF_RANGE", "Calculated percentage exceeds safe integer precision.");
  }

  return {
    amount: createMoney(minorUnits, normalized.currency, { allowNegative: Boolean(options.allowNegative) }),
    rounding: Object.freeze({
      method: "HALF_UP_TO_MINOR_UNIT",
      rateBasisPoints,
      discardedNumerator: Number(remainder),
      denominator: Number(denominator),
      direction: remainder === 0n ? "EXACT" : (remainder * 2n >= denominator ? "UP" : "DOWN"),
    }),
  };
}

export function calculateRatioBasisPoints(numerator, denominator, field = "ratio") {
  const left = assertMoney(numerator, { field: `${field}.numerator`, allowNegative: true });
  const right = assertMoney(denominator, { field: `${field}.denominator`, allowNegative: true });
  assertSameCurrency([left, right], field);
  if (right.minorUnits <= 0) return null;
  const result = (BigInt(left.minorUnits) * 10_000n) / BigInt(right.minorUnits);
  const numeric = Number(result);
  if (!Number.isSafeInteger(numeric)) throw new IntelligenceMoneyError("RATIO_OUT_OF_RANGE", `${field} exceeds safe precision.`, field);
  return numeric;
}

export function minimumMoney(values, field = "money") {
  const present = values.map((value, index) => assertMoney(value, { field: `${field}[${index}]`, allowNegative: true }));
  const currency = assertSameCurrency(present, field);
  return createMoney(Math.min(...present.map((value) => value.minorUnits)), currency, { allowNegative: true, field });
}

export function maximumMoney(values, field = "money") {
  const present = values.map((value, index) => assertMoney(value, { field: `${field}[${index}]`, allowNegative: true }));
  const currency = assertSameCurrency(present, field);
  return createMoney(Math.max(...present.map((value) => value.minorUnits)), currency, { allowNegative: true, field });
}

export function minorUnitsToMajorString(value, field = "minorUnits") {
  assertSafeMinorUnits(value, field, true);
  const minorUnits = BigInt(value);
  const negative = minorUnits < 0n;
  const absolute = negative ? -minorUnits : minorUnits;
  const whole = absolute / 100n;
  const fraction = absolute % 100n;
  return `${negative ? "-" : ""}${whole}.${fraction.toString().padStart(2, "0")}`;
}

export function formatMoneyForDisplay(value, locale = "en-US") {
  const money = assertMoney(value, { allowNegative: true });
  const exactMajorUnits = minorUnitsToMajorString(money.minorUnits);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
  }).format(exactMajorUnits);
}

export function formatMoneyForExplanation(value) {
  const money = assertMoney(value, { allowNegative: true });
  const exactMajorUnits = minorUnitsToMajorString(money.minorUnits);
  return exactMajorUnits.startsWith("-")
    ? `-${money.currency} ${exactMajorUnits.slice(1)}`
    : `${money.currency} ${exactMajorUnits}`;
}
