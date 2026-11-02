const NUMBER = "(?:[a-z]{1,4})?\\d{1,4}[a-z]?";
const COLLECTOR_FRACTION = new RegExp(`(^|[^a-z0-9])#?(${NUMBER})\\s*[/／]\\s*(${NUMBER})(?![a-z0-9])`, "i");
const normalizedNumber = value => String(value || "").toLowerCase().replace(/\s+/g, "").replace(/／/g, "/").split("/").map(part => part.replace(/(^[a-z]*)0+(?=\d)/, "$1")).join("/");
const words = value => String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/[a-z0-9]+/g) || [];
const GENERIC_WORDS = new Set(["pokemon", "tcg", "the", "and", "of"]);

export function getCatalogCollectorQuery(query) {
  const value = String(query || "").trim();
  const match = COLLECTOR_FRACTION.exec(value);
  if (!match) return null;
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
  if (rowTotal) { if (rowNumber !== identity.collectorNumber) return false; }
  else if (rowFirst !== queryNumber) return false;
  else if (queryTotal) {
    const printedTotal = row.setTotal ?? row.set_total ?? row.printedTotal ?? row.printed_total ?? row.totalCards ?? row.total_cards;
    if (printedTotal && normalizedNumber(String(printedTotal)) !== queryTotal) return false;
  }
  const rowWords = new Set(words([name, row.setName, row.set_name, row.expansion, row.setCode, row.set_code, row.language, row.variant, row.variantName, row.rarity].filter(Boolean).join(" ")));
  return identity.requiredWords.every(word => rowWords.has(word));
}

/** An empty server result page must stay empty, even with older cached items. */
export function getCatalogPageProducts({ hasRun, pagedIds = [], products = [], productsById, usePagedResults = true }) {
  if (!hasRun) return [];
  if (!pagedIds.length) return usePagedResults ? [] : products;
  const index = productsById || new Map(products.map(product => [String(product.id), product]));
  return pagedIds.map(id => index.get(String(id))).filter(Boolean);
}
