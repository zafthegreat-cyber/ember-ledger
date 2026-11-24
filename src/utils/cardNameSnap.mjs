// Card name correction (Nov 24 2026, owner: "it needs to be really good"). Photo
// text misreads a letter or two ("Charizarb", "Pikaehu", "Gardevolr"). The scanner
// compares each read name with the printed card names in the catalog
// (src/data/generated/cardNames.json, built by scripts/build-card-names.mjs) and
// uses the real name when exactly one is close enough. Pure, for tests.

const keyOf = (value = "") => String(value).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Misreads allowed for a name of this many letters: none below 5, then about one in five.
export const allowedNameEdits = (length) => (length < 5 ? 0 : length < 8 ? 1 : length < 12 ? 2 : 3);

function distance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, current[j]);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

/** Builds the lookup once per name list: key -> printed name. */
export function createNameIndex(names = []) {
  const byKey = new Map();
  for (const name of names) {
    const key = keyOf(name);
    if (key.length >= 3 && !byKey.has(key)) byKey.set(key, name);
  }
  return { byKey, keys: [...byKey.keys()] };
}

/**
 * The printed card name a read name most likely is, or "" when none is close or
 * two are equally close. Exact matches (ignoring case and punctuation) win.
 */
export function snapCardName(read = "", index) {
  if (!index?.byKey) return "";
  const key = keyOf(read);
  if (key.length < 3) return "";
  const exact = index.byKey.get(key);
  // The catalog list has no apostrophes ("Bosss Orders"); keep the card's own spelling then.
  if (exact) return /['’]/.test(read) ? String(read).replace(/\s+/g, " ").trim() : exact;
  const limit = allowedNameEdits(key.length);
  if (!limit) return "";
  let best = limit + 1, bestKey = "", tie = false;
  for (const candidate of index.keys) {
    const d = distance(key, candidate, Math.min(limit, best));
    if (d < best) { best = d; bestKey = candidate; tie = false; }
    else if (d === best && d <= limit) tie = true;
  }
  return best <= limit && !tie ? index.byKey.get(bestKey) : "";
}

export const isKnownCardName = (name = "", index) => Boolean(index?.byKey?.has(keyOf(name)));
