// Rows in "Scan cards" (Nov 25 2026, owner: "continuous scanner improvement").
// Pure helpers so the rules for a stack of cards are tested:
// - the same card shown to the camera again is one more copy of it (x2), not a new line;
// - Undo takes back the newest scan of a card (one copy, or the whole line).
import { cardNameForChoice } from "./catalogResultIdentity.mjs";
import { cardScanDetailsKey, cardScanGradeLabel, isCardScanGraded } from "./cardScanDetails.mjs";

const clean = (value) => String(value || "").trim().toLowerCase();
const certOf = (row) => clean(row?.certificationNumber).replace(/\s+/g, "");

/**
 * A slab whose certificate number is already on a line (Nov 27 2026). One certificate is
 * one slab, so a slab shown to the camera again is not a second copy of it.
 */
export function sameSlabListed(rows = [], row = {}) {
  const cert = certOf(row);
  return Boolean(cert) && (Array.isArray(rows) ? rows : []).some((candidate) => certOf(candidate) === cert);
}

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
 * line's copies instead of adding a line, unless that line was marked another
 * kind of copy (a condition, printing or grade set on it, Nov 27 2026): then the
 * new copy is its own line. Binder pockets and typed rows are
 * always added as their own lines. Empty rows left over are dropped, except a
 * row the person opened to type by hand.
 */
export function mergeScannedCardRows(existing = [], created = []) {
  let rows = (Array.isArray(existing) ? existing : []).filter((row) => row.byHand || row.cardName || row.cardNumber || row.setName || row.variant || row.condition);
  for (const row of Array.isArray(created) ? created : []) {
    // The same slab again (its certificate is already listed) adds nothing.
    if (row?.scanned && sameSlabListed(rows, row)) continue;
    const key = row?.scanned ? cardScanRowKey(row) : "";
    const twin = key ? rows.find((candidate) => cardScanRowKey(candidate) === key && (candidate.destination || "vault") === (row.destination || "vault") && cardScanDetailsKey(candidate) === cardScanDetailsKey(row)) : null;
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

/**
 * What the strip under the camera says about the newest scanned row (Nov 27 2026).
 *   name, title: the card as the strip names it. Once the row has its card this is the
 *     card that was filed ("Iono · 080/091"), not what the reader made of the name
 *     ("Zqgxv Wopl"), so a wrong match can be seen at a glance.
 *   matched: the row has its card; detail is its set.
 *   offer: the one card the list offers for the row ("Is this your card?"), when there is
 *     exactly one and the strip is able to file it (canPick). detail asks the question by
 *     name. Two or more cards are picked in the list, where there is room for them.
 * The screen adds the prices.
 */
export function lastScanSummary(row, { canPick = false } = {}) {
  if (!row) return { matched: false, offer: null, detail: "", name: "", title: "" };
  const tidy = (value) => String(value || "").trim();
  // A slab's grade is part of what was scanned ("Palafin ex · 151/131 · PSA 9").
  const grade = isCardScanGraded(row) ? cardScanGradeLabel(row) : "";
  const titled = (name, number) => ({ name, title: [name, number, grade].filter(Boolean).join(" · ") });
  const read = titled(tidy(row.cardName), tidy(row.cardNumber));
  const current = row.matchedFor === `${row.cardName}|${row.cardNumber}`;
  if (current && row.matchState === "matched") {
    const card = row.matchedProduct || {};
    const filed = titled(cardNameForChoice(card.cardName || card.name) || read.name, tidy(card.cardNumber) || tidy(row.cardNumber));
    return { matched: true, offer: null, detail: String(card.setName || card.expansion || row.matchedLabel || "Matched"), ...filed };
  }
  const inReview = current && row.matchState === "review";
  const choices = inReview && Array.isArray(row.matchedChoices) ? row.matchedChoices.filter((choice) => choice?.product) : [];
  if (canPick && choices.length === 1) {
    const [offer] = choices;
    return { matched: false, offer, detail: `Is this ${tidy(offer.name) || "your card"}? ${tidy(offer.short)}`.trim(), ...read };
  }
  if (choices.length > 1) return { matched: false, offer: null, detail: "Not sure which card this is. Pick it in the list below.", ...read };
  if (row.scanNote) return { matched: false, offer: null, detail: `${row.scanNote}. Check it in the list below.`, ...read };
  return { matched: false, offer: null, detail: inReview ? "Not sure which card this is. Check it in the list below." : "Finding its price…", ...read };
}
