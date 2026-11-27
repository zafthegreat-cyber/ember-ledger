// One rule for "is this catalog row a single card?", shared by every importer.
//
// A product name is not evidence: "Dratini", "Mantine", "Victini", "Fighting
// Energy" and "Nemona's Backpack" all contain tin, box or pack. What a source
// only ever gives a single card is a rarity, a collector number and a card
// type, so those decide first. Sealed products (tins, boxes, booster packs)
// carry none of them.
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

// A card type (Pokemon, Trainer - Supporter, Basic Fighting Energy) is printed
// on a card only. On 2026-11-27 every one of the 28,585 catalog rows whose
// TCGCSV data has a "Card Type" was a card; none of the 4,263 sealed rows had
// one. World Championship deck cards need it: TCGCSV lists them with rarity
// "None" and no number, so "Brock's Scouting" and "Basic Fighting Energy"
// (both hold "tin") were filed as tins.
function hasCardType(value) {
  const cardType = text(value);
  return Boolean(cardType) && !/code card|sealed/i.test(cardType);
}

// A card rarity settles it. So does a card type, unless the rarity says code
// card or sealed. With no rarity at all, a card-style collector number settles
// it. A not-a-card rarity ("Code Card") otherwise leaves it to the caller.
// The SQL function takes no card type: the database tables keep it only inside
// raw_source.
function isSingleCard({ cardNumber, rarity, cardType } = {}) {
  if (isCardRarity(rarity)) return true;
  if (hasCardType(cardType) && !/code card|sealed/i.test(text(rarity))) return true;
  return !text(rarity) && hasCardCollectorNumber(cardNumber);
}

// Reads the fields the TCGCSV and pokemontcg.io payloads use. Extended data
// keys arrive as card_type (both importers) or "card type" (lower-cased names).
function singleCardEvidence(product = {}, extendedData = {}) {
  const cardNumber =
    extendedData.number ?? extendedData.card_number ?? extendedData.card_no ??
    product.cardNumber ?? product.card_number ?? product.number;
  const rarity = extendedData.rarity ?? product.rarity;
  const cardType =
    extendedData.card_type ?? extendedData["card type"] ?? extendedData.cardtype ??
    product.cardType ?? product.card_type;
  return { cardNumber: text(cardNumber), rarity: text(rarity), cardType: text(cardType) };
}

module.exports = {
  CARD_COLLECTOR_NUMBER,
  NOT_A_CARD_RARITY,
  hasCardCollectorNumber,
  hasCardType,
  isCardRarity,
  isSingleCard,
  singleCardEvidence,
};
