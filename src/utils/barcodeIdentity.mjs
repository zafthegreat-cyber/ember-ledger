// Preserve SKU letters. Only numeric UPC/EAN/GTIN formatting may lose spaces/dashes.
export function normalizeBarcodeValue(value = "") {
  const raw = String(value ?? "").trim();
  return /^[\d\s-]+$/.test(raw) ? raw.replace(/[\s-]/g, "") : raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isLikelyBarcodeValue(value = "") {
  const raw = String(value ?? "").trim();
  return /^[\d\s-]+$/.test(raw) && [8, 12, 13, 14].includes(normalizeBarcodeValue(raw).length);
}

export function gtinKey(value = "") {
  if (!isLikelyBarcodeValue(value)) return "";
  const digits = normalizeBarcodeValue(value);
  if (/^0+$/.test(digits)) return "";
  let sum = 0;
  for (let i = digits.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) sum += Number(digits[i]) * weight;
  return (10 - sum % 10) % 10 === Number(digits.at(-1)) ? digits.padStart(14, "0") : "";
}

export function identifierEquivalents(value = "") {
  const normalized = normalizeBarcodeValue(value);
  if (!normalized) return [];
  const key = gtinKey(value);
  if (!key) return [normalized];
  const values = new Set([normalized, key]);
  for (const length of [13, 12, 8]) if (/^0*$/.test(key.slice(0, 14 - length))) values.add(key.slice(-length));
  return [...values];
}

export function identifiersMatch(left, right) {
  const a = normalizeBarcodeValue(left), b = normalizeBarcodeValue(right);
  if (!a || !b) return false;
  return a === b || Boolean(gtinKey(left) && gtinKey(left) === gtinKey(right));
}
