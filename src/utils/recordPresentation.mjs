// Read-only presentation boundary for saved record amounts (feedback finding
// F18, 2026-10-31). Records are never rewritten here: the original bytes stay
// as saved, and only what is *shown* changes.
//
// A saved amount is presented as money only when it is a real, finite,
// non-negative number (or a plain numeric string). Booleans, whitespace-only
// strings, negative amounts, Infinity and objects are shown as unknown instead
// of being coerced to $1, $0 or a negative price. A legitimate numeric zero is
// preserved and shown as $0.00.

const NUMERIC_TEXT = /^\s*\$?\s*\d[\d,]*(?:\.\d+)?\s*$/;

/** Returns the amount as a number, or null when it cannot honestly be shown as money. */
export function presentAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === "string") {
    if (!NUMERIC_TEXT.test(value)) return null;
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

/** Why an amount is not shown, for helper copy and tests. */
export function amountIssue(value) {
  if (value === "" || value === null || value === undefined) return "missing";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string" && !value.trim()) return "blank";
  if (typeof value === "number" && !Number.isFinite(value)) return "not_finite";
  const amount = typeof value === "number" ? value : typeof value === "string" && NUMERIC_TEXT.test(value) ? Number(value.replace(/[$,\s]/g, "")) : NaN;
  if (Number.isNaN(amount)) return "not_numeric";
  if (amount < 0) return "negative";
  return null;
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Format an amount for display, or return `unknown` when it cannot be shown as money. */
export function presentMoney(value, { unknown = "Not recorded", formatter = USD } = {}) {
  const amount = presentAmount(value);
  return amount === null ? unknown : formatter.format(amount);
}

/**
 * Saved currency code for a record's price/estimate fields, upper-cased, or
 * "" when none was saved. Explicit price currency wins over a general one.
 */
export function recordCurrency(record = {}) {
  const raw = record?.priceCurrency ?? record?.price_currency ?? record?.estimateCurrency ?? record?.estimate_currency
    ?? record?.marketCurrency ?? record?.market_currency ?? record?.currency ?? "";
  const code = String(raw || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "";
}

export function isUsdOrUnspecified(record = {}) {
  const code = recordCurrency(record);
  return !code || code === "USD";
}
