import assets from "../data/cardBackAssets.json" with { type: "json" };
import { getRecordGame } from "./collectibleGames.mjs";

const key = value => typeof value === "string" ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() : "";
const english = new Set(["en", "eng", "english", "en us", "en gb", "en uk"]);
const englishCatalogs = new Set(["tcgcsv", "pokemon tcg api", "pokemon tcg api json", "pokemontcg io"]);

// Stock artwork is for visual inspection only. A saved/photographed back is
// resolved first by the caller; no record or condition assessment is updated.
export function standardCardBack(product = {}) {
  if (getRecordGame(product) !== "pokemon") return null;
  const identity = [product.setName, product.set_name, product.name, product.cardName, product.printing, product.variant, product.material].map(key).join(" ");
  if (product.isProxy || product.isCustom || /world champion|championship deck|my first battle|ancient mew|pocket|topps|metal|gold plated|jumbo|oversized|custom|proxy|playtest/.test(identity)) return null;
  const languages = [product.language, product.cardLanguage, product.card_language, product.languageCode, product.language_code, product.lang].map(key).filter(Boolean);
  if (languages.length) return languages.every(value => english.has(value)) ? assets.pokemonInternational : null;
  // Only the existing English catalog feeds establish a missing language.
  const sources = [product.source, product.sourceType, product.source_type, product.catalogSource].map(key);
  return sources.some(source => englishCatalogs.has(source)) ? assets.pokemonInternational : null;
}
