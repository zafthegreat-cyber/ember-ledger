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

/**
 * How different two card thumbnails are (0 = the same), ignoring overall
 * brightness so the camera adjusting its exposure does not count.
 */
export function thumbDifference(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return Infinity;
  let meanA = 0, meanB = 0;
  for (let index = 0; index < a.length; index += 1) { meanA += a[index]; meanB += b[index]; }
  meanA /= a.length; meanB /= b.length;
  let total = 0;
  for (let index = 0; index < a.length; index += 1) total += Math.abs((a[index] - meanA) - (b[index] - meanB));
  return total / a.length;
}

/**
 * After a picture is taken: tells when the next card is in view.
 * When the card was found in the picture (shotThumb), the card itself is compared:
 * - "next": the card left the view for a moment, so whatever comes back is counted
 *   (also a second copy of the same card);
 * - "maybe-same": a card that looks different is in view. It is taken, but if it
 *   reads as the card just added it is that card again (tilted, new glare), not a copy;
 * - "": the same card, even if the hand drifted. Nothing is taken.
 * Without a found card (busy table) it falls back to the whole view: a big change is
 * "next", a small steady change is "maybe-same".
 * differentCard (Nov 26 2026) is 14, was 10. Measured on 552 of the owner's scanned cards
 * drawn into the camera's small view: two different cards in a row differ by 19.5 or more
 * for 99 in 100 pairs, while the same card moved, turned up to 6 degrees, lit brighter or
 * with a patch of glare stays under 14 for 97 in 100 looks. At 10 the same card was taken
 * again for 11 in 100 such looks; at 14 for 3, and a different next card is missed for 1 in 500.
 */
export function createNextCardWatcher({ bigChange = 18, smallChange = 7, stillThreshold = 6, holdLooks = 3, differentCard = 14, differentLooks = 2, missingLooks = 3 } = {}) {
  let shot = null;
  let shotThumb = null;
  let previous = null;
  let steadyDifferent = 0;
  let differentRun = 0;
  let missingRun = 0;
  return {
    start(sample, thumb = null) { shot = sample; shotThumb = thumb; previous = sample; steadyDifferent = 0; differentRun = 0; missingRun = 0; },
    // thumb: the card found, and settled, in this look. cardFound: a card outline is in view at all.
    push(sample, thumb = null, { cardFound = Boolean(thumb) } = {}) {
      if (!shot) return "next";
      if (shotThumb) {
        if (thumb) { missingRun = 0; differentRun = thumbDifference(shotThumb, thumb) > differentCard ? differentRun + 1 : 0; }
        else if (!cardFound) { missingRun += 1; differentRun = 0; }
        if (missingRun >= missingLooks) return "next";
        return differentRun >= differentLooks ? "maybe-same" : "";
      }
      const fromShot = frameDifference(shot, sample);
      if (fromShot > bigChange) return "next";
      const still = frameDifference(previous, sample) <= stillThreshold;
      previous = sample;
      steadyDifferent = fromShot > smallChange && still ? steadyDifferent + 1 : 0;
      return steadyDifferent >= holdLooks ? "maybe-same" : "";
    },
  };
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

/** Totals for one side of a trade: item count, value, and which lines still need a value. */
export function tradeSideSummary(lines = []) {
  let count = 0;
  let total = 0;
  let missing = 0;
  for (const line of lines) {
    const quantity = Math.max(1, Number(line.quantity) || 1);
    const value = toNumber(line.value);
    count += quantity;
    if (Number.isFinite(value)) total += value * quantity;
    else missing += 1;
  }
  const names = lines.map((line) => `${line.name}${Number(line.quantity) > 1 ? ` x${line.quantity}` : ""}`).join(", ");
  return { count, total: Math.round(total * 100) / 100, missing, names };
}

const setNameKey = (value) => String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

/**
 * Finds a set summary row from a typed or scanned set name ("151", "MEW",
 * "Scarlet & Violet 151"): exact name, id, code or alias first, then a unique
 * row whose name contains the typed words.
 */
export function findSetRowByName(rows = [], setName = "") {
  const wanted = setNameKey(setName);
  if (!wanted) return null;
  const keysFor = (row) => [row.name, row.id, row.key?.replace(/^set:/, ""), row.code, row.setCode, ...(Array.isArray(row.aliases) ? row.aliases : [])].map(setNameKey).filter(Boolean);
  const exact = rows.find((row) => keysFor(row).includes(wanted));
  if (exact) return exact;
  const words = String(setName).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const partial = rows.filter((row) => {
    const nameWords = String(row.name || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return words.every((word) => nameWords.includes(word));
  });
  return partial.length === 1 ? partial[0] : null;
}

const numberKey = (value) => String(value || "").toLowerCase().replace(/^0+/, "").replace(/\/.*$/, "").replace(/[^a-z0-9]/g, "");

/**
 * Set progress for scanned cards: for each set in the scan, how many you have,
 * how many the scan adds, and what is still missing afterwards.
 * `findSummary(row)` returns the app's set summary for a scanned row (or null).
 */
export function scanSetProgress(rows = [], findSummary = () => null, { missingPreview = 12 } = {}) {
  const groups = new Map();
  for (const row of rows) {
    const setName = String(row.setName || "").trim();
    if (!setName || !(row.cardName || row.cardNumber)) continue;
    const summary = findSummary(row);
    if (!summary || summary.unknownSet) continue;
    const key = summary.key || setName.toLowerCase();
    if (!groups.has(key)) groups.set(key, { summary, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()].map(({ summary, rows: setRows }) => {
    const ownedNumbers = new Set((summary.ownedCardItems || []).map((item) => numberKey(item.cardNumber || item.card_number || item.number)).filter(Boolean));
    const newNumbers = new Set();
    for (const row of setRows) {
      const key = numberKey(row.cardNumber);
      if (key && !ownedNumbers.has(key)) newNumbers.add(key);
    }
    const owned = Number(summary.ownedCount) || 0;
    const total = Number(summary.totalCards) || 0;
    const after = owned + newNumbers.size;
    const missingAfter = (summary.missingCards || []).filter((card) => !newNumbers.has(numberKey(card.cardNumber || card.card_number || card.number)));
    return {
      key: summary.key,
      setName: summary.name,
      owned,
      total,
      adds: newNumbers.size,
      scanned: setRows.length,
      after: total ? Math.min(after, total) : after,
      percentAfter: total ? Math.min(100, Math.round((after / total) * 100)) : null,
      missingSupported: Boolean(summary.missingSupported),
      missingAfterCount: summary.missingSupported ? missingAfter.length : null,
      missingPreview: missingAfter.slice(0, missingPreview).map((card) => ({ number: card.cardNumber || card.card_number || card.number || "", name: card.name || card.cardName || "" })),
    };
  });
}

/** Running tally for rapid barcode scanning: the same code adds to its count. */
export function tallyBarcode(batch = [], { code, itemName = "", catalogItemId = "", marketValue = "" } = {}) {
  const clean = String(code || "").trim();
  if (!clean) return batch;
  const existing = batch.find((row) => row.code === clean);
  if (existing) return batch.map((row) => (row === existing ? { ...row, count: row.count + 1, ...(itemName ? { itemName } : {}), ...(catalogItemId ? { catalogItemId } : {}), ...(marketValue ? { marketValue } : {}) } : row));
  return [{ code: clean, itemName, catalogItemId, marketValue, count: 1 }, ...batch];
}
