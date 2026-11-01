// Business inventory quantity and valuation helpers (feedback findings
// F12–F14, 2026-10-31). Pure and read-only: nothing here changes a record.
//
// F12 – quantity aliases (`ownedQuantity`, `quantity_on_hand`, …) are honored
//        and an unknown quantity stays unknown (null) instead of becoming 0,
//        so a record is never shown as "sold out" just because the count was
//        never saved.
// F13 – the available cost of an ordinary record is the cost of the units
//        still in stock, not the full purchase cost after some units sold.
// F14 – projected resale totals multiply the per-unit midpoint by the
//        remaining quantity, keep an explicit $0 estimate, and report how
//        many records had no estimate so the total can disclose it.

const QUANTITY_FIELDS = [
  "quantity", "qty", "ownedQuantity", "owned_quantity", "quantityOwned", "quantity_owned",
  "quantityOnHand", "quantity_on_hand", "onHand", "on_hand", "count", "units",
];

function finite(value) {
  if (value === "" || value === null || value === undefined || typeof value === "boolean") return null;
  const parsed = typeof value === "string" ? Number(value.trim()) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Saved quantity, honoring common aliases; null when no quantity was saved. */
export function recordQuantity(record = {}) {
  if (!record || typeof record !== "object") return null;
  for (const field of QUANTITY_FIELDS) {
    if (!(field in record)) continue;
    const value = finite(record[field]);
    if (value !== null) return Math.max(0, Math.floor(value));
  }
  return null;
}

/**
 * Units still available. `soldQuantity` comes from the sales ledger. Returns
 * null when the saved quantity is unknown (nothing sold → still unknown; the
 * caller shows "Not recorded" instead of 0).
 */
export function availableQuantity(record = {}, soldQuantity = 0) {
  const saved = recordQuantity(record);
  if (saved === null) return null;
  const sold = Math.max(0, finite(soldQuantity) ?? 0);
  return Math.max(0, saved - sold);
}

export function quantityLabel(available, { unknown = "Not recorded" } = {}) {
  return available === null || available === undefined ? unknown : String(available);
}

/** True only when a saved quantity has been fully sold. Unknown is never sold out. */
export function isSoldOut(record = {}, soldQuantity = 0) {
  const available = availableQuantity(record, soldQuantity);
  return available !== null && available === 0;
}

/**
 * Sum saved quantities across records. `missing` counts records without a
 * saved quantity so the total can say so instead of silently reading 0.
 */
export function unitsOnHandTotal(records = [], soldQuantityFor = () => 0) {
  let total = 0;
  let missing = 0;
  for (const record of records) {
    const available = availableQuantity(record, soldQuantityFor(record));
    if (available === null) missing += 1;
    else total += available;
  }
  return { total, missing, counted: records.length - missing };
}

/** Per-unit projected resale midpoint; null when not saved, 0 kept as 0. */
export function projectedUnitValue(record = {}) {
  return finite(record?.projectedResaleMid ?? record?.projectedResale ?? record?.estimatedValue ?? record?.marketValue);
}

/**
 * Projected resale total = Σ per-unit midpoint × remaining quantity. Records
 * with no saved quantity count as one unit (and are reported under
 * `assumedSingle`); records with no estimate are reported under `missing`.
 */
export function projectedResaleTotal(records = [], soldQuantityFor = () => 0) {
  let total = 0;
  let covered = 0;
  let missing = 0;
  let assumedSingle = 0;
  for (const record of records) {
    const unit = projectedUnitValue(record);
    if (unit === null) { missing += 1; continue; }
    let available = availableQuantity(record, soldQuantityFor(record));
    if (available === null) { available = 1; assumedSingle += 1; }
    total += unit * available;
    covered += 1;
  }
  return { total, covered, missing, assumedSingle, hasEstimates: covered > 0, partial: covered > 0 && missing > 0 };
}

export function projectedResaleTotalNote({ covered = 0, missing = 0, assumedSingle = 0 } = {}) {
  const parts = [];
  if (missing > 0) parts.push(`${missing} of ${covered + missing} item${covered + missing === 1 ? "" : "s"} ${missing === 1 ? "has" : "have"} no estimate yet`);
  if (assumedSingle > 0) parts.push(`${assumedSingle} counted as 1 unit (no quantity saved)`);
  return parts.length ? `Covers ${covered} item${covered === 1 ? "" : "s"}: ${parts.join("; ")}.` : "";
}

/**
 * F13 – remaining-stock cost for an ordinary record: the saved total cost
 * scaled by the share of units still available. Returns null when no cost
 * was saved. Exact per-unit costs and append-only provenance records are
 * handled by the caller (they already have ledger-backed cost functions).
 */
export function remainingStockCost(record = {}, soldQuantity = 0) {
  const cost = finite(record?.allocatedItemCost ?? record?.allocatedCost ?? record?.totalPurchaseCost ?? record?.purchasePrice ?? record?.actualPurchasePrice);
  if (cost === null) return null;
  const saved = recordQuantity(record);
  const sold = Math.max(0, finite(soldQuantity) ?? 0);
  if (saved === null || saved <= 0) return sold > 0 ? 0 : cost;
  const available = Math.max(0, saved - sold);
  return Math.round(cost * (available / saved) * 100) / 100;
}
