// Shared UPC / EAN / GTIN normaliser (SHOULD 19, board t107; 2026-11-14).
//
// One place that decides when two barcodes are "the same product":
//   - UPC-A (12) and the EAN-13 written as 0 + UPC-A are the same code.
//   - GTIN-14 with leading zeros collapses to the shorter form.
//   - UPC-E (8 digits starting with 0) expands to UPC-A.
//   - EAN-8 stays EAN-8 (it is not a zero-padded anything).
//   - Spaces, dashes and scanner prefixes are ignored; the check digit is
//     verified so a mistyped code is reported instead of silently matched.
// Importers, barcode lookup and catalog search all call `canonicalGtin` so a
// code entered from a Target app screenshot ("0 820650 85302 4") matches the
// same card as the one scanned at a Walmart ("820650853024").

export const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

export function gtinDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/** Mod-10 check digit for a GTIN body (every length). */
export function gtinCheckDigit(body) {
  const digits = gtinDigits(body);
  let sum = 0;
  // Weights 3,1,3,1… counted from the right of the body.
  for (let i = 0; i < digits.length; i += 1) {
    const digit = Number(digits[digits.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return String((10 - (sum % 10)) % 10);
}

export function isValidGtin(value) {
  const digits = gtinDigits(value);
  if (!GTIN_LENGTHS.has(digits.length)) return false;
  return gtinCheckDigit(digits.slice(0, -1)) === digits.at(-1);
}

/** UPC-E (8 digits, number system 0 or 1) → UPC-A (12 digits). */
export function expandUpcE(value) {
  const digits = gtinDigits(value);
  if (digits.length !== 8 || !/^[01]/.test(digits)) return null;
  const ns = digits[0];
  const check = digits[7];
  const [a, b, c, d, e, f] = digits.slice(1, 7);
  let body;
  if (f === "0" || f === "1" || f === "2") body = `${ns}${a}${b}${f}0000${c}${d}${e}`;
  else if (f === "3") body = `${ns}${a}${b}${c}00000${d}${e}`;
  else if (f === "4") body = `${ns}${a}${b}${c}${d}00000${e}`;
  else body = `${ns}${a}${b}${c}${d}${e}0000${f}`;
  return `${body}${check}`;
}

/**
 * Canonical form for comparisons: a 12-digit UPC-A when the code is one (or a
 * zero-padded one), otherwise the code's own length with leading GTIN-14
 * padding removed. Returns "" for anything that is not a GTIN-shaped number.
 */
export function canonicalGtin(value) {
  let digits = gtinDigits(value);
  if (!digits) return "";
  if (digits.length === 8 && /^[01]/.test(digits)) {
    const expanded = expandUpcE(digits);
    if (expanded && isValidGtin(expanded)) digits = expanded;
  }
  if (digits.length === 14 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 13 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 14 && digits.startsWith("00")) digits = digits.slice(2);
  if (!GTIN_LENGTHS.has(digits.length)) return "";
  return digits;
}

/** Every spelling that should hit the same index entry. */
export function gtinVariants(value) {
  const canonical = canonicalGtin(value);
  if (!canonical) return [];
  const variants = new Set([canonical]);
  if (canonical.length === 12) {
    variants.add(`0${canonical}`); // EAN-13 form
    variants.add(`00${canonical}`); // GTIN-14 form
  }
  if (canonical.length === 13) variants.add(`0${canonical}`);
  return [...variants];
}

export function gtinsMatch(a, b) {
  const left = canonicalGtin(a);
  const right = canonicalGtin(b);
  return Boolean(left && right && left === right);
}

/** Human-facing explanation for a code that will not match anything. */
export function describeGtinProblem(value) {
  const digits = gtinDigits(value);
  if (!digits) return "No digits found.";
  if (!GTIN_LENGTHS.has(digits.length)) return `${digits.length} digits is not a UPC/EAN length (8, 12, 13 or 14).`;
  if (!isValidGtin(digits)) return "The last digit does not check out; one digit is probably mistyped.";
  return "";
}
