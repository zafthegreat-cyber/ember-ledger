import assets from "../data/cardBackAssets.json" with { type: "json" };
import { NATIVE_BUILD } from "../config/nativeLaunchScope.js";
import reviewed from "../data/reviewedCardBacks.json" with { type: "json" };
import reviewedFronts from "../data/reviewedCardFronts.json" with { type: "json" };
import { getRecordGame } from "./collectibleGames.mjs";

const key = value => typeof value === "string" ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() : "";
const english = new Set(["en", "eng", "english", "en us", "en gb", "en uk"]);
const englishCatalogs = new Set(["tcgcsv", "pokemon tcg api", "pokemon tcg api json", "pokemontcg io"]);
const nonCardKinds = new Set(["sealed", "sealed product", "accessory", "code card", "booster pack", "booster box", "elite trainer box", "collection box", "tin", "deck", "bundle"]);
const packagingTitle = /\b(?:box|collection|bundle|booster|tin|tins|deck|kit|pack|packs|blister|chest|case|display|sleeves|binder|album|playmat)\b/;
const ordinaryMetalTitle = /^(?:(?:basic|dark|magnetic) )?metal energy\b|^metal (?:cube 01|frying pan|goggles|core barrier|saucer)\b|^full metal lab\b/;

export function nonCardProduct(product = {}, titles = [product.name, product.cardName, product.productName, product.title].map(key).filter(Boolean)) {
  if (product.isSealed || product.is_sealed || product.isAccessory || product.isCodeCard) return true;
  const kinds = [product.catalogType, product.catalogItemType, product.productClassification, product.productKind, product.productType, product.rarity].map(key);
  if (kinds.some(value => nonCardKinds.has(value)) || [...titles, ...kinds].some(value => /\bcode card\b/.test(value))) return true;
  // Some imported "card" rows are actually packaging. A real collector number
  // keeps normal titles such as Surprise Box or Deck Shield eligible.
  const numbered = [product.cardNumber, product.card_number, product.collectorNumber, product.collector_number, product.setNumber].some(value => String(value ?? "").trim());
  const prizeEnergy = value => key(product.setName || product.set_name) === "prize pack series cards"
    && /^(?:basic )?(?:grass|fire|water|lightning|psychic|fighting|darkness|metal|fairy) energy prize pack series \d+(?: cosmos holo)?$/.test(value);
  const championshipTrainer = value => key(product.setName || product.set_name) === "world championship decks"
    && /^secret box 20\d{2} [a-z]/.test(value);
  const firstBattlePackage = value => key(product.setName || product.set_name) === "my first battle"
    && /^(?:my first battle charmander and squirtle|my first battle pikachu and bulbasaur)$/.test(value);
  if (!numbered && titles.some(firstBattlePackage)) return true;
  return !numbered && titles.some(value => packagingTitle.test(value) && !prizeEnergy(value) && !championshipTrainer(value));
}

// Stock artwork is for visual inspection only. A saved/photographed back is
// resolved first by the caller; no record or condition assessment is updated.
export function standardCardBack(product = {}) {
  if (getRecordGame(product) !== "pokemon") return null;
  const titles = [product.name, product.cardName, product.productName, product.title].map(key).filter(Boolean);
  if (nonCardProduct(product, titles)) return null;
  const context = [product.setName, product.set_name, product.printing, product.variant, product.material].map(key).join(" ");
  const identity = [context, ...titles.filter(value => !/^jumbo ice cream(?: secret)?$/.test(value))].join(" ");
  if (product.isProxy || product.isCustom || /world champion|championship deck|my first battle|ancient mew|pocket|topps|gold plated|jumbo|oversized|proxy|playtest/.test(identity)) return null;
  // Metal Energy and Melmetal are card names, not physical metal. Preserve
  // explicit material/printing exclusions and only exempt known ordinary names.
  if (/\b(?:metal|custom)\b/.test(context)) return null;
  if (titles.some(value => /\bmetal\b/.test(value) && !ordinaryMetalTitle.test(value))) return null;
  if (titles.some(value => /\bcustom\b/.test(value) && !/^custom catcher(?: secret)?$/.test(value))) return null;
  const languages = [product.language, product.cardLanguage, product.card_language, product.languageCode, product.language_code, product.lang].map(key).filter(Boolean);
  if (languages.length) return languages.every(value => english.has(value)) ? assets.pokemonInternational : null;
  // Only the existing English catalog feeds establish a missing language.
  const sources = [product.source, product.sourceType, product.source_type, product.catalogSource].map(key);
  return sources.some(source => englishCatalogs.has(source)) ? assets.pokemonInternational : null;
}

// Special printings need an explicitly reviewed identity. A year or a matching
// name alone cannot give an unknown card another printing's reverse artwork.
function reviewedCardArtwork(product, match, artworkAssets) {
  if (!match) return null;
  if (getRecordGame(product) !== "pokemon" || nonCardProduct(product) || product.isProxy || product.isCustom) return null;
  const names = [product.name, product.cardName, product.productName, product.title].map(key).filter(Boolean);
  if (!names.length || names.some(value => value !== key(match.name))) return null;
  const sets = [product.setName, product.set_name].map(key).filter(Boolean);
  if (!sets.length || sets.some(value => value !== key(match.setName))) return null;
  const numbers = [product.cardNumber, product.card_number, product.collectorNumber, product.collector_number, product.setNumber].map(value => String(value ?? "").trim()).filter(Boolean);
  if (numbers.some(value => value !== match.cardNumber)) return null;
  if ([product.printing, product.variant, product.material].map(key).some(value => /proxy|custom|metal|jumbo|oversized/.test(value))) return null;
  const year = match.name.match(/\b20\d{2}\b/)?.[0];
  if ([product.printing, product.variant, product.edition].map(key).some(value => /world|championship/.test(value) && [...value.matchAll(/20\d{2}/g)].some(found => found[0] !== year))) return null;
  const languages = [product.language, product.cardLanguage, product.card_language, product.languageCode, product.language_code, product.lang].map(key).filter(Boolean);
  if (languages.length ? !languages.every(value => english.has(value)) : ![product.source, product.sourceType, product.source_type, product.catalogSource].map(key).some(source => englishCatalogs.has(source))) return null;
  return artworkAssets[match.asset] || null;
}

export function inspectionCardBack(product = {}, { native = NATIVE_BUILD } = {}) {
  // Phone apps ship without /assets/inspection (official artwork; see native-build.mjs).
  if (native) return null;
  const match = reviewed.products[String(product.tcgplayerProductId ?? "")];
  return match ? reviewedCardArtwork(product, match, reviewed.assets) : standardCardBack(product);
}

// Used only after existing front-image candidates fail. An exact signed printing
// can never lend its photographed front to an ordinary or gold-stamped variant.
export function inspectionCardFront(product = {}, { native = NATIVE_BUILD } = {}) {
  if (native) return null;
  return reviewedCardArtwork(product, reviewedFronts.products[String(product.tcgplayerProductId ?? "")], reviewedFronts.assets);
}
