// Scanner extras (Nov 19 2026): deal check, recent scans and steady-hold detection.
// Pure helpers so they can be tested without a camera.

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return NaN;
  const number = typeof value === "number" ? value : Number.parseFloat(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(number) ? number : NaN;
};

const dollars = (value) => `$${Math.abs(value).toFixed(2).replace(/\.00$/, "")}`;

/**
 * Compares an asking price (plus shipping) to the market price.
 * Within 10% either way is "about market". Graded listings are not compared
 * with an ungraded market price, because the two are different things.
 */
export function dealVerdict({ price, shipping, market, graded = false } = {}) {
  const ask = toNumber(price);
  const ship = toNumber(shipping);
  const marketValue = toNumber(market);
  if (!Number.isFinite(ask) || ask <= 0) return null;
  const total = Math.round((ask + (Number.isFinite(ship) ? ship : 0)) * 100) / 100;
  if (graded) return { tone: "unknown", total, market: marketValue, label: "Graded listing", detail: "The market price here is for an ungraded card, so it is not compared with a graded price." };
  if (!Number.isFinite(marketValue) || marketValue <= 0) return { tone: "unknown", total, market: NaN, label: "No market price", detail: `Asking ${dollars(total)} in total. There is no market price to compare with yet.` };
  const difference = Math.round((marketValue - total) * 100) / 100;
  const percent = Math.round((Math.abs(difference) / marketValue) * 100);
  const shippingNote = Number.isFinite(ship) && ship > 0 ? ` (${dollars(ask)} + ${dollars(ship)} shipping)` : "";
  if (Math.abs(difference) <= marketValue * 0.1) {
    return { tone: "fair", total, market: marketValue, difference, percent, label: "About market", detail: `${dollars(total)}${shippingNote} vs market ${dollars(marketValue)}.` };
  }
  if (difference > 0) {
    return { tone: "good", total, market: marketValue, difference, percent, label: `${dollars(difference)} under market`, detail: `${dollars(total)}${shippingNote} vs market ${dollars(marketValue)}, ${percent}% below.` };
  }
  return { tone: "over", total, market: marketValue, difference, percent, label: `${dollars(difference)} over market`, detail: `${dollars(total)}${shippingNote} vs market ${dollars(marketValue)}, ${percent}% above.` };
}

/** Deal check for a listing read from a screenshot (price, shipping, graded). */
export function listingVerdict(listing, marketValue) {
  if (!listing) return null;
  return dealVerdict({ price: listing.price, shipping: listing.shipping, market: marketValue, graded: Boolean(listing.graded) });
}

export const RECENT_SCANS_KEY = "code3.scanner.recent.v1";
export const RECENT_SCANS_LIMIT = 20;

/** Adds a scan to the front of the recent list; the same item moves to the top instead of repeating. */
export function addRecentScan(list = [], entry = {}) {
  if (!entry || !(entry.rawValue || entry.itemName)) return Array.isArray(list) ? list : [];
  const key = (scan) => `${scan.catalogItemId || ""}|${String(scan.rawValue || scan.itemName || "").toLowerCase()}`;
  const next = { ...entry, at: entry.at || new Date().toISOString() };
  return [next, ...(Array.isArray(list) ? list : []).filter((scan) => key(scan) !== key(next))].slice(0, RECENT_SCANS_LIMIT);
}

export function readRecentScans(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(RECENT_SCANS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((scan) => scan && (scan.rawValue || scan.itemName)).slice(0, RECENT_SCANS_LIMIT) : [];
  } catch {
    return [];
  }
}

export function writeRecentScans(list, storage = globalThis.localStorage) {
  try { storage?.setItem(RECENT_SCANS_KEY, JSON.stringify((list || []).slice(0, RECENT_SCANS_LIMIT))); } catch { /* Storage is optional. */ }
}

/** Average change (0-255) between two same-size grayscale samples. */
export function frameDifference(previous, current) {
  if (!previous || !current || previous.length !== current.length || !current.length) return Infinity;
  let total = 0;
  for (let index = 0; index < current.length; index += 1) total += Math.abs(current[index] - previous[index]);
  return total / current.length;
}

/** Spread of brightness; a blank table or covered lens has almost none. */
export function frameDetail(sample) {
  if (!sample?.length) return 0;
  let sum = 0;
  for (const value of sample) sum += value;
  const mean = sum / sample.length;
  let variance = 0;
  for (const value of sample) variance += (value - mean) ** 2;
  return Math.sqrt(variance / sample.length);
}

/**
 * Steady-hold tracker: call with each sampled frame; returns true once the
 * view has stayed still (and has something in it) for `holdFrames` samples.
 */
export function createSteadyTracker({ threshold = 6, minDetail = 18, holdFrames = 4 } = {}) {
  let previous = null;
  let still = 0;
  return {
    push(sample) {
      const steady = frameDifference(previous, sample) <= threshold && frameDetail(sample) >= minDetail;
      previous = sample;
      still = steady ? still + 1 : 0;
      return still >= holdFrames;
    },
    reset() { previous = null; still = 0; },
    get progress() { return Math.min(1, still / holdFrames); },
  };
}

/** Running tally for rapid barcode scanning: the same code adds to its count. */
export function tallyBarcode(batch = [], { code, itemName = "", catalogItemId = "", marketValue = "" } = {}) {
  const clean = String(code || "").trim();
  if (!clean) return batch;
  const existing = batch.find((row) => row.code === clean);
  if (existing) return batch.map((row) => (row === existing ? { ...row, count: row.count + 1, ...(itemName ? { itemName } : {}), ...(catalogItemId ? { catalogItemId } : {}), ...(marketValue ? { marketValue } : {}) } : row));
  return [{ code: clean, itemName, catalogItemId, marketValue, count: 1 }, ...batch];
}
