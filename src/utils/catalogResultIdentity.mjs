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
// Promo series whose catalog rows store only the digits ("085") in a promo set.
const BARE_DIGIT_PROMOS = new Set(["svp"]);

function promoCollectorQuery(value) {
  const match = PROMO_CODE.exec(value);
  if (!match) return null;
  const prefix = match[2].toLowerCase();
  if (SET_IDS_LIKE_PROMOS.has(`${prefix}${match[3]}`)) return null;
  const digits = String(Number(match[3]));
  const remainder = value.slice(0, match.index) + match[1] + value.slice(match.index + match[0].length);
  return { collectorNumber: `${prefix}${digits}`, promoPrefix: prefix, promoDigits: digits, requiredWords: words(remainder).filter(word => !GENERIC_WORDS.has(word)) };
}

const rowIsPromo = row => /promo/i.test([row.setName, row.set_name, row.expansion].filter(Boolean).join(" ")) || /^(svp|pr|swsd)$/i.test(String(row.setCode ?? row.set_code ?? ""));

export function getCatalogCollectorQuery(query) {
  const value = String(query || "").trim();
  const match = COLLECTOR_FRACTION.exec(value);
  if (!match) return promoCollectorQuery(value);
  const collectorText = `${match[2]}/${match[3]}`;
  const remainder = value.slice(0, match.index) + match[1] + value.slice(match.index + match[0].length);
  return { collectorNumber: normalizedNumber(collectorText), requiredWords: words(remainder).filter(word => !GENERIC_WORDS.has(word)) };
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
