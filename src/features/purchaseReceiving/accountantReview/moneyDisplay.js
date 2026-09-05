import { formatMoneyForDisplay, minorUnitsToMajorString } from "../../intelligence/money.js";

export function formatAccountantReviewMoney(minorUnits, currency = "USD", { signed = false, locale = "en-US" } = {}) {
  if (!Number.isSafeInteger(minorUnits)) return "Not available";

  const sign = signed && minorUnits !== 0 ? (minorUnits > 0 ? "+" : "−") : "";
  const magnitude = signed ? Number(minorUnits < 0 ? -BigInt(minorUnits) : BigInt(minorUnits)) : minorUnits;

  try {
    return `${sign}${formatMoneyForDisplay({ minorUnits: magnitude, currency }, locale)}`;
  } catch {
    try {
      return `${sign}${minorUnitsToMajorString(magnitude)} ${String(currency || "USD").trim().toUpperCase()}`;
    } catch {
      return "Not available";
    }
  }
}
