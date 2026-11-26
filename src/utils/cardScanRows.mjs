// Rows in "Scan cards" (Nov 25 2026, owner: "continuous scanner improvement").
// Pure helpers so the rules for a stack of cards are tested:
// - the same card shown to the camera again is one more copy of it (x2), not a new line;
// - Undo takes back the newest scan of a card (one copy, or the whole line).

const clean = (value) => String(value || "").trim().toLowerCase();

/** Name and number together name a card. A row missing either has no key. */
export function cardScanRowKey(row = {}) {
  const name = clean(row.cardName);
  const number = clean(row.cardNumber);
  return name && number ? `${name}|${number}` : "";
}

/** How many copies a row stands for (at least 1, whole number). */
export function cardScanCopies(row = {}) {
  return Math.max(1, Math.floor(Number(row?.quantity) || 1));
}

/**
 * Adds newly created rows to the list. A row read by the camera (scanned: true)
 * that names a card already in the list, going to the same place, raises that
 * line's copies instead of adding a line. Binder pockets and typed rows are
 * always added as their own lines. Empty rows left over are dropped, except a
 * row the person opened to type by hand.
 */
export function mergeScannedCardRows(existing = [], created = []) {
  let rows = (Array.isArray(existing) ? existing : []).filter((row) => row.byHand || row.cardName || row.cardNumber || row.setName || row.variant || row.condition);
  for (const row of Array.isArray(created) ? created : []) {
    const key = row?.scanned ? cardScanRowKey(row) : "";
    const twin = key ? rows.find((candidate) => cardScanRowKey(candidate) === key && (candidate.destination || "vault") === (row.destination || "vault")) : null;
    rows = twin
      ? rows.map((candidate) => (candidate === twin ? { ...candidate, quantity: cardScanCopies(candidate) + 1 } : candidate))
      : [...rows, row];
  }
  return rows;
}

/**
 * Takes back the newest scan of a card: one copy when the line has several,
 * otherwise the line. Returns the same array when no line matches.
 */
export function undoScannedCardRow(rows = [], read = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const name = clean(read.cardName);
  const number = clean(read.cardNumber);
  if (!name && !number) return list;
  let index = -1;
  for (let position = list.length - 1; position >= 0; position -= 1) {
    if (clean(list[position].cardName) === name && clean(list[position].cardNumber) === number) { index = position; break; }
  }
  if (index < 0) return list;
  const copies = cardScanCopies(list[index]);
  return copies > 1
    ? list.map((row, position) => (position === index ? { ...row, quantity: copies - 1 } : row))
    : list.filter((_, position) => position !== index);
}
