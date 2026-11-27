// Builds src/data/generated/cardNames.json: the distinct printed card names
// (Pokemon, Trainers, Energy) from the bundled card catalog, used by the
// scanner to correct misread names ("Charizarb" -> "Charizard"). Nov 24 2026.
// Run: node scripts/build-card-names.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import singleCardRule from "../pokemon_market_ingestion_kit/single_card_evidence.cjs";

const { isSingleCard } = singleCardRule;

// Catalog names carry variant and listing words after the printed name.
const VARIANT_TAIL = /\s+(?:secret|full art|alternate(?: full)? art|alt art|non holo|reverse holo|cosmos holo|cracked ice holo|holo|shiny|staff|prerelease|league promo|promo|black star promo|master ball pattern|poke ball pattern|pokeball pattern|jumbo|oversized|error|stamped|1st edition|shadowless|unlimited|delta species|gold|rainbow|special illustration rare|illustration rare|hyper rare|ultra rare|double rare|ace spec|radiant|trainer gallery|galarian gallery)$/i;
const SEALED = /\b(?:box|pack|packs|case|bundle|collection|tin|deck|binder|sleeves|set of|blister|booster|display|portfolio|kit)\b/i;
const CODE_CARD = /\bcode card\b/i;

export function printedCardName(raw = "") {
  let name = String(raw)
    .replace(/[\(\[].*?[\)\]]/g, " ")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  // Everything from the first word holding a digit is a number, year or artist.
  name = name.split(" ").reduce((kept, word) => (kept.stop || /\d/.test(word) ? { words: kept.words, stop: true } : { words: [...kept.words, word], stop: false }), { words: [], stop: false }).words.join(" ");
  name = name.replace(/\s*-\s*$/, "");
  for (let guard = 0; guard < 4 && VARIANT_TAIL.test(name); guard += 1) name = name.replace(VARIANT_TAIL, "");
  return name.trim();
}

/** The sorted list of printed card names in these catalog rows. */
export function buildCardNameList(cards = []) {
  const names = new Map();
  const withProductWord = new Map();
  for (const card of cards) {
    // A code card is an online redemption code, not a card anyone scans; the card file
    // holds 149 of them ("Code Card Paradox Rift").
    if (/^code card$/i.test(String(card.rarity || "").trim()) || CODE_CARD.test(card.cardName || card.name || "")) continue;
    const name = printedCardName(card.cardName || card.name);
    if (name.length < 3 || !/[a-z]/i.test(name) || name.split(" ").length > 6) continue;
    const key = name.toLowerCase();
    if (SEALED.test(name)) {
      // A sealed product, unless the row is a single card (it carries a card rarity, number or type).
      if (isSingleCard({ cardNumber: card.cardNumber, rarity: card.rarity, cardType: card.cardType }) && !withProductWord.has(key)) withProductWord.set(key, name);
      continue;
    }
    if (!names.has(key)) names.set(key, name);
  }
  // A real card name can hold a product word: Iron Bundle, Secret Box, Tool Box. So can a
  // listing of some other card: "Bisharp Darkrai Deck", "Fire Energy Prize Pack Series",
  // "Iron Bundle Holiday Calendar". A listing starts with a name already on the list, so,
  // shortest first, a name is kept only when no known name leads it.
  const shortestFirst = [...withProductWord].sort((a, b) => a[0].split(" ").length - b[0].split(" ").length || a[0].localeCompare(b[0]));
  for (const [key, name] of shortestFirst) {
    const words = key.split(" ");
    const listsAnotherCard = words.slice(0, -1).some((_, index) => names.has(words.slice(0, index + 1).join(" ")));
    if (!listsAnotherCard) names.set(key, name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

// Only when run as a script (node scripts/build-card-names.mjs); importing it builds nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = JSON.parse(readFileSync(new URL("../src/data/generated/pokemonTcgCards.json", import.meta.url), "utf8"));
  const list = buildCardNameList(Array.isArray(source) ? source : source.cards || []);
  writeFileSync(new URL("../src/data/generated/cardNames.json", import.meta.url), `${JSON.stringify(list)}\n`);
  console.log(`${list.length} card names`);
}
