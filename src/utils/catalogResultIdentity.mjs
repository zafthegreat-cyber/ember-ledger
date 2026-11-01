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
  if ((number ? normalizedNumber(number) : titleNumber) !== identity.collectorNumber) return false;
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
