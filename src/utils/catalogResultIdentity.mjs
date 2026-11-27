import { POKEMON_SET_ALIAS_ROWS } from "../data/catalogSearchAliases.mjs";

const NUMBER = "(?:[a-z]{1,4})?\\d{1,4}[a-z]?";
const COLLECTOR_FRACTION = new RegExp(`(^|[^a-z0-9])#?(${NUMBER})\\s*[/／]\\s*(${NUMBER})(?![a-z0-9])`, "i");
const normalizedNumber = value => String(value || "").toLowerCase().replace(/\s+/g, "").replace(/／/g, "/").split("/").map(part => part.replace(/(^[a-z]*)0+(?=\d)/, "$1")).join("/");
const words = value => String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || []; // any script: Japanese, Korean, Chinese names count too (Nov 24 2026)
const GENERIC_WORDS = new Set(["pokemon", "tcg", "the", "and", "of"]);
// Black Star promo numbers have no set total: SWSH050, SM210, XY124, BW45, DP50,
// HGSS18, and SVP 085 (often printed "SVP EN 085"). Nov 24 2026.
const PROMO_CODE = /(^|[^a-z0-9])(swsh|svp|sm|xy|bw|dp|hgss)\s?(?:en\s?)?-?\s?(\d{1,3})(?![a-z0-9])/i;
// Set ids that look like promo numbers ("sm12" is Cosmic Eclipse, "swsh45" Shining
// Fates). Typed without a leading zero they mean the set, not a promo card.
const SET_IDS_LIKE_PROMOS = new Set([
  ...Array.from({ length: 13 }, (_, n) => `sm${n}`), "sm35", "sm75", "sm115",
  ...Array.from({ length: 13 }, (_, n) => `xy${n}`),
  ...Array.from({ length: 12 }, (_, n) => `bw${n}`),
  ...Array.from({ length: 8 }, (_, n) => `dp${n}`),
  ...Array.from({ length: 5 }, (_, n) => `hgss${n}`),
  ...Array.from({ length: 13 }, (_, n) => `swsh${n}`), "swsh35", "swsh45",
]);
// Printed set codes and language codes at the bottom of a card ("MEW EN") are not
// part of the name (Nov 24 2026). Built on first use: the alias module imports this one.
let printedCodes = null;
const PRINTED_CODES = () => (printedCodes ||= new Set([
  ...POKEMON_SET_ALIAS_ROWS.map(set => String(set.ptcgoCode || "").toLowerCase()).filter(Boolean),
  "en", "jp", "ja", "kr", "ko", "zh", "fr", "de", "it", "es", "pt",
]));

/** Drops the last printed code from the name words, keeping at least one real name word ("Mew ex MEW" keeps "mew"). */
function nameWordsOnly(list) {
  const result = [...list];
  for (let index = result.length - 1; index >= 0; index -= 1) {
    if (!PRINTED_CODES().has(result[index])) continue;
    const without = [...result.slice(0, index), ...result.slice(index + 1)];
    if (without.some(word => word.length >= 3 && !/^\d+$/.test(word))) result.splice(index, 1);
  }
  return result;
}

// "Pikachu #25": the card's own number with no set total (Nov 24 2026).
const HASH_NUMBER = /(^|[^a-z0-9])#\s?(\d{1,4})(?![a-z0-9/])/i;

// Promo series whose catalog rows store only the digits ("085") in a promo set.
const BARE_DIGIT_PROMOS = new Set(["svp"]);

function promoCollectorQuery(value) {
  const match = PROMO_CODE.exec(value);
  if (!match) return null;
  const prefix = match[2].toLowerCase();
  if (SET_IDS_LIKE_PROMOS.has(`${prefix}${match[3]}`)) return null;
  const digits = String(Number(match[3]));
  const remainder = value.slice(0, match.index) + match[1] + value.slice(match.index + match[0].length);
  return { collectorNumber: `${prefix}${digits}`, promoPrefix: prefix, promoDigits: digits, requiredWords: nameWordsOnly(words(remainder).filter(word => !GENERIC_WORDS.has(word))) };
}

const rowIsPromo = row => /promo/i.test([row.setName, row.set_name, row.expansion].filter(Boolean).join(" ")) || /^(svp|pr|swsd)$/i.test(String(row.setCode ?? row.set_code ?? ""));

export function getCatalogCollectorQuery(query) {
  const value = String(query || "").trim();
  const match = COLLECTOR_FRACTION.exec(value);
  if (!match) return promoCollectorQuery(value) || hashCollectorQuery(value);
  const collectorText = `${match[2]}/${match[3]}`;
  const remainder = value.slice(0, match.index) + match[1] + value.slice(match.index + match[0].length);
  return { collectorNumber: normalizedNumber(collectorText), requiredWords: nameWordsOnly(words(remainder).filter(word => !GENERIC_WORDS.has(word))) };
}

function hashCollectorQuery(value) {
  const match = HASH_NUMBER.exec(value);
  if (!match) return null;
  const remainder = value.slice(0, match.index) + match[1] + value.slice(match.index + match[0].length);
  return { collectorNumber: String(Number(match[2])), numberOnly: true, requiredWords: nameWordsOnly(words(remainder).filter(word => !GENERIC_WORDS.has(word))) };
}

/** A card number alone is not evidence that a different named card matches. */
export function catalogCardQueryMatchesRow(query, row = {}) {
  const identity = getCatalogCollectorQuery(query);
  if (!identity) return true;
  const number = row.cardNumber ?? row.card_number ?? row.collectorNumber ?? row.collector_number;
  const name = [row.name, row.productName, row.product_name, row.cardName, row.card_name].filter(Boolean).join(" ");
  const titleNumber = getCatalogCollectorQuery(name)?.collectorNumber;
  const rowNumber = number ? normalizedNumber(number) : titleNumber;
  if (!rowNumber) return false;
  // A104/A105 (2026-11-01): catalog rows often store only the card's own
  // number ("4", "004") without the set total. "Charizard 4/102" must match
  // such a row by its first number; a row that does carry a total must match
  // the whole fraction.
  const [queryNumber, queryTotal] = identity.collectorNumber.split("/");
  const [rowFirst, rowTotal] = rowNumber.split("/");
  // "SVP 085" is stored as 085 in the Scarlet & Violet promo set.
  const barePromoMatch = Boolean(identity.promoPrefix) && BARE_DIGIT_PROMOS.has(identity.promoPrefix) && !rowTotal && rowFirst === identity.promoDigits && rowIsPromo(row);
  if (barePromoMatch) { /* number matches */ }
  else if (identity.numberOnly) { if (rowFirst !== queryNumber) return false; }
  else if (rowTotal) { if (rowNumber !== identity.collectorNumber) return false; }
  else if (rowFirst !== queryNumber) return false;
  else if (queryTotal) {
    const printedTotal = row.setTotal ?? row.set_total ?? row.printedTotal ?? row.printed_total ?? row.totalCards ?? row.total_cards;
    if (printedTotal && normalizedNumber(String(printedTotal)) !== queryTotal) return false;
  }
  const rowWords = [...new Set(words([name, row.setName, row.set_name, row.expansion, row.setCode, row.set_code, row.language, row.variant, row.variantName, row.rarity].filter(Boolean).join(" ")))];
  return nameWordsMatch(identity.requiredWords, rowWords, words(name));
}

/** Levenshtein distance, stopping early once it passes `limit`. */
function editDistance(a, b, limit) {
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

// Allowed misreads per word: none for short words, one for 4-6 letters, two for longer.
const allowedEdits = word => (word.length >= 7 ? 2 : word.length >= 4 ? 1 : 0);
const wordMatches = (word, rowWords) => rowWords.some(rowWord => rowWord === word || (allowedEdits(word) && editDistance(word, rowWord, allowedEdits(word)) <= allowedEdits(word)));

/**
 * Name check once the number already matches (scanner, Nov 23 2026). Photo text
 * misreads letters ("Charizarb") and picks up stray marks ("Eo", "LBASIC"), so:
 * words of 1-2 characters are ignored, each word may be a near miss, and at least
 * half of the remaining words must match, and at least one of them must match the
 * card's own name (not only its set). A different card that shares the number and
 * set still fails, because none of its name words are close.
 */
export function nameWordsMatch(requiredWords = [], rowWords = [], rowNameWords = rowWords) {
  const meaningful = requiredWords.filter(word => word.length >= 3 || /\d/.test(word));
  if (!meaningful.length) return requiredWords.every(word => rowWords.includes(word));
  const matched = meaningful.filter(word => wordMatches(word, rowWords)).length;
  const matchesName = meaningful.some(word => wordMatches(word, rowNameWords));
  return matchesName && matched * 2 >= meaningful.length;
}

/** An empty server result page must stay empty, even with older cached items. */
export function getCatalogPageProducts({ hasRun, pagedIds = [], products = [], productsById, usePagedResults = true }) {
  if (!hasRun) return [];
  if (!pagedIds.length) return usePagedResults ? [] : products;
  const index = productsById || new Map(products.map(product => [String(product.id), product]));
  return pagedIds.map(id => index.get(String(id))).filter(Boolean);
}

// Reprints with a stamp or a special box: a scanned card is far more often the
// main-set card, so these only win when nothing else fits (Nov 24 2026).
const SPECIAL_PRINT_SETS = /prize pack|world championship|jumbo|miscellaneous|league|championship|deck exclusive|battle academy|blister|trick or trade|first partner|countdown calendar|burger king|mcdonald|trainer kit|southeast asia|professor program|alternate art promos|classic collection|build & battle|prerelease/i;
const nameKeyOf = value => words(String(value || "")
  .replace(/\s*\([^)]*\)/g, "")
  .replace(/\s*-\s*#?[a-z]{0,4}\d+[a-z]?(?:\s*\/\s*[a-z]{0,4}\d+)?\s*$/i, "")).join("");
const rowNameOf = row => row.name ?? row.productName ?? row.product_name ?? row.cardName ?? row.card_name ?? "";
const rowSetOf = row => [row.setName, row.set_name, row.expansion].filter(Boolean).join(" ");
// "SWSH08: Fusion Strike" and "Fusion Strike" are one set from two sources.
const setKeyOf = row => words(rowSetOf(row).replace(/^[a-z0-9&. ]{1,12}:s+/i, "")).join("");
const printingKeyOf = row => `${words(rowNameOf(row)).join("")}|${setKeyOf(row)}|${normalizedNumber(rowNumberOf(row)).split("/")[0]}`;
const rowNumberOf = row => row.cardNumber ?? row.card_number ?? row.collectorNumber ?? row.collector_number ?? "";

/**
 * The one catalog card a scanned name and number most likely are (Nov 24 2026,
 * owner: "competitive"). The catalog holds the same card from two sources (one
 * stores "4", the other "004/102"), stamped reprints and variant rows ("(Black
 * Dot Error)"). Each step keeps only the rows that fit better, when any do:
 *   1. a set the user typed, 2. the full printed number, 3. the exact card name,
 *   4. the plain card rather than a variant row, 5. the main set rather than a stamped reprint.
 * Returns { card, others } where others counts the other printings left out, or
 * { card: null } when two different cards still fit (the user picks).
 */
export function pickScannedCard({ name = "", number = "", setName = "" } = {}, candidates = []) {
  const query = `${String(name).trim()} ${String(number).trim()}`.trim();
  const identity = getCatalogCollectorQuery(query);
  if (!identity || !String(name).trim()) return { card: null, others: 0 };
  const verified = candidates.filter(row => row && catalogCardQueryMatchesRow(query, row));
  const narrow = (list, keep) => { const kept = list.filter(keep); return kept.length ? kept : list; };
  let list = verified;
  const typedSet = String(setName || "").trim().toLowerCase();
  if (typedSet) {
    list = list.filter(row => rowSetOf(row).toLowerCase().includes(typedSet));
    return { card: list.length === 1 ? list[0] : null, others: 0 };
  }
  if (identity.collectorNumber.includes("/")) list = narrow(list, row => normalizedNumber(rowNumberOf(row)) === identity.collectorNumber);
  const sameNumber = list; // other printings are counted from these
  const wanted = nameKeyOf(name);
  if (wanted) list = narrow(list, row => nameKeyOf(rowNameOf(row)) === wanted);
  // "Charizard (Black Dot Error)" is a variant of the plain card, not the card itself.
  if (!String(name).includes("(")) list = narrow(list, row => !String(rowNameOf(row)).includes("("));
  list = narrow(list, row => !SPECIAL_PRINT_SETS.test(rowSetOf(row)));
  if (list.length !== 1) return { card: null, others: 0 };
  const picked = printingKeyOf(list[0]);
  const others = new Set(sameNumber.map(printingKeyOf).filter(key => key !== picked)).size;
  return { card: list[0], others };
}

// Shared with cardClueMatch.mjs (Nov 26 2026) so a card picked from clues follows the
// same name, set and number rules as a card picked from its name and number.
export { nameKeyOf as catalogCardNameKey, rowNameOf as catalogRowName, rowSetOf as catalogRowSet, rowNumberOf as catalogRowNumber, printingKeyOf as catalogPrintingKey };
export const isSpecialPrintSet = (row) => SPECIAL_PRINT_SETS.test(rowSetOf(row));

/**
 * Every way the catalog may spell one printed number: "75/102" is stored as "75/102" or
 * "075/102", "TG10/TG30" as written (capitals). The lookup asks for these exact spellings,
 * which the catalog has an index for (33 ms on Nov 27 2026); a case-blind pattern makes it
 * read every row (6.5 s, past the 3 s allowed to someone who is not signed in).
 * A number with no set total is only looked up when it is a promo code ("SWSH174"); bare
 * digits ("85") belong to hundreds of cards. [] when there is nothing to look up.
 */
export function exactNumberSpellings(number = "") {
  const tidy = String(number || "").toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9/]/g, "");
  const [first = "", second = "", extra] = tidy.split("/");
  if (extra !== undefined) return [];
  const spellings = (part) => {
    const match = /^([a-z]{0,4})(\d{1,4})([a-z]?)$/.exec(part);
    if (!match) return [];
    const digits = String(Number(match[2]));
    return [...new Set([digits, digits.padStart(2, "0"), digits.padStart(3, "0")])].map((value) => `${match[1]}${value}${match[3]}`);
  };
  const owns = spellings(first);
  if (!owns.length) return [];
  let list;
  if (!second) list = /^[a-z]/.test(first) ? owns : [];
  else {
    const totals = spellings(second);
    list = owns.flatMap((own) => totals.map((total) => `${own}/${total}`));
  }
  // Letters are printed in capitals on the card and stored that way; a few rows are lower case.
  return [...new Set(list.flatMap((value) => (/[a-z]/.test(value) ? [value.toUpperCase(), value] : [value])))];
}

/**
 * The name to show for a card the scanner offers. Some catalog rows carry the number in
 * the name ("Iono - 080/091", "Rayquaza V 100/159"); the number is shown beside the name,
 * so it is dropped from the end. A name that is nothing but a number is kept as it is.
 */
export function cardNameForChoice(name = "") {
  const text = String(name || "").replace(/\s+/g, " ").trim();
  const short = text.replace(/(?:^|\s)(?:-\s*)?#?[a-z]{0,4}\d{1,4}[a-z]?\/[a-z]{0,4}\d{1,4}$/i, "").trim();
  return short || text;
}

/**
 * Which match a scanned row takes when both ways of finding its card were tried:
 * byNumber (the printed number, then what else was read) and byClues (the name that
 * was read, then pieces of the number, year, HP, attacks). Each is { card, choices, ... }.
 *   1. The number's card whose name is also in what was read: nothing fits better.
 *   2. A card of the name that was read. It comes before a card found by number alone,
 *      because a misread number can be another card's number.
 *   3. The number's card, when the name that was read led nowhere at all.
 *   4. Otherwise nothing is filed: the cards either way found are offered, the number's first.
 * choicesBy says what to tell the person: "number" (the name was hard to read),
 * "" (the number was hard to read) or "either".
 */
export function settleScanMatch(byNumber = {}, byClues = {}) {
  const numberChoices = byNumber?.choices || [], clueChoices = byClues?.choices || [];
  if (byNumber?.card && byNumber.nameAgrees) return byNumber;
  if (byClues?.card) return byClues;
  if (byNumber?.card && !clueChoices.length) return byNumber;
  const offered = [...(byNumber?.card ? [byNumber.card] : numberChoices), ...clueChoices];
  const choices = offered.filter((card, index) => card && offered.findIndex((other) => String(other?.id) === String(card.id)) === index).slice(0, 4);
  const fromNumber = Boolean(byNumber?.card || numberChoices.length), fromClues = clueChoices.length > 0;
  return { card: null, others: 0, choices, choicesBy: fromNumber && fromClues ? "either" : fromNumber ? "number" : "" };
}
