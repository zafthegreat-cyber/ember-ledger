// Builds src/data/generated/cardNames.json: the distinct printed card names
// (Pokemon, Trainers, Energy) from the bundled card catalog, used by the
// scanner to correct misread names ("Charizarb" -> "Charizard"). Nov 24 2026.
// Run: node scripts/build-card-names.mjs
import { readFileSync, writeFileSync } from "node:fs";

const source = JSON.parse(readFileSync(new URL("../src/data/generated/pokemonTcgCards.json", import.meta.url), "utf8"));
const cards = Array.isArray(source) ? source : source.cards || [];

// Catalog names carry variant and listing words after the printed name.
const VARIANT_TAIL = /\s+(?:secret|full art|alternate(?: full)? art|alt art|non holo|reverse holo|cosmos holo|cracked ice holo|holo|shiny|staff|prerelease|league promo|promo|black star promo|master ball pattern|poke ball pattern|pokeball pattern|jumbo|oversized|error|stamped|1st edition|shadowless|unlimited|delta species|gold|rainbow|special illustration rare|illustration rare|hyper rare|ultra rare|double rare|ace spec|radiant|trainer gallery|galarian gallery)$/i;
const SEALED = /\b(?:box|pack|packs|case|bundle|collection|tin|deck|binder|sleeves|set of|blister|booster|display|portfolio|kit)\b/i;

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

const names = new Map();
for (const card of cards) {
  const name = printedCardName(card.cardName || card.name);
  if (name.length < 3 || !/[a-z]/i.test(name) || SEALED.test(name) || name.split(" ").length > 6) continue;
  const key = name.toLowerCase();
  if (!names.has(key)) names.set(key, name);
}
const list = [...names.values()].sort((a, b) => a.localeCompare(b));
writeFileSync(new URL("../src/data/generated/cardNames.json", import.meta.url), `${JSON.stringify(list)}\n`);
console.log(`${list.length} card names`);
