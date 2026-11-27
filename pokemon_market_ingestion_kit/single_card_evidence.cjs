// One rule for "is this catalog row a single card?", shared by every importer.
//
// A product name is not evidence: "Dratini", "Mantine", "Victini", "Fighting
// Energy" and "Nemona's Backpack" all contain tin, box or pack. What a source
// only ever gives a single card is a rarity and a collector number, so those
// decide first. Sealed products (tins, boxes, booster packs) carry neither.
//
// The same rule lives in SQL as public.catalog_is_single_card(card_number, rarity)
// (supabase/migrations/20261126090000_catalog_single_cards_not_sealed.sql).
// Keep the two in step; scripts/test-catalog-single-card-rule.mjs checks both.

// 026/102, 26/97, SWSH026, XY184, GG69/GG70, S1/S4, TG12/TG30, 177a/168, 006.
// SQL: the same pattern with [a-z] and ~*.
const CARD_COLLECTOR_NUMBER = /^[a-z]{0,6}[- ]?[0-9]{1,4}[a-z]{0,2}(\s*\/\s*[a-z]{0,6}[- ]?[0-9]{1,4}[a-z]{0,2})?$/i;

// Rarity values a source uses for things that are not single cards.
const NOT_A_CARD_RARITY = /^(code card|none|n\/?a)$/i;

function text(value) {
  return String(value ?? "").trim();
}

function hasCardCollectorNumber(value) {
  return CARD_COLLECTOR_NUMBER.test(text(value));
}

function isCardRarity(value) {
  const rarity = text(value);
  return Boolean(rarity) && !NOT_A_CARD_RARITY.test(rarity) && !/sealed/i.test(rarity);
}

// A card rarity settles it. With no rarity at all, a card-style collector
// number settles it. A not-a-card rarity ("Code Card") leaves it to the caller.
function isSingleCard({ cardNumber, rarity } = {}) {
  if (isCardRarity(rarity)) return true;
  return !text(rarity) && hasCardCollectorNumber(cardNumber);
}

// Reads the fields the TCGCSV and pokemontcg.io payloads use.
function singleCardEvidence(product = {}, extendedData = {}) {
  const cardNumber =
    extendedData.number ?? extendedData.card_number ?? extendedData.card_no ??
    product.cardNumber ?? product.card_number ?? product.number;
  const rarity = extendedData.rarity ?? product.rarity;
  return { cardNumber: text(cardNumber), rarity: text(rarity) };
}

module.exports = {
  CARD_COLLECTOR_NUMBER,
  NOT_A_CARD_RARITY,
  hasCardCollectorNumber,
  isCardRarity,
  isSingleCard,
  singleCardEvidence,
};
