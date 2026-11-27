// Card languages (Nov 27 2026, owner: "support non-English cards all the way through
// Collect, Find and Sell. Japanese first"). Pure rules, tested in scripts/test-card-language.mjs:
// - the language names a card can have (the same words inventory_items.language holds);
// - which catalog a language is matched in, and which price it shows;
// - what a scanned card says about its language (the code beside its number, a Japanese-style
//   set code, the word on a slab's label);
// - what a search says about the language wanted ("japanese", "jp", a Japanese set code).
//
// The catalog holds English cards and, since Nov 27 2026, Japanese cards (TCGCSV's Japanese
// catalog). French, German, Italian, Spanish and Portuguese cards are the English cards with
// the same set and number, and have no price of their own: they show the English card's price
// (owner, Nov 27 2026: "Yes, go ahead" to that default). Korean and Traditional Chinese cards
// print the Japanese set codes and numbers, so they are matched to the Japanese card, with no
// price. Simplified Chinese sets have no catalog to match.

export const DEFAULT_CARD_LANGUAGE = "English";

export const CARD_LANGUAGES = Object.freeze([
  "English",
  "Japanese",
  "Korean",
  "Chinese (Traditional)",
  "Chinese (Simplified)",
  "French",
  "German",
  "Italian",
  "Spanish",
  "Portuguese",
]);

// European printings of the English sets: same cards, same numbers.
const SAME_AS_ENGLISH = new Set(["French", "German", "Italian", "Spanish", "Portuguese"]);
// Printed with the Japanese set codes and numbers.
const SAME_AS_JAPANESE = new Set(["Korean", "Chinese (Traditional)"]);

const WORDS = new Map(Object.entries({
  en: "English", eng: "English", english: "English", "en-us": "English", "en-gb": "English",
  ja: "Japanese", jp: "Japanese", jpn: "Japanese", japanese: "Japanese", "ja-jp": "Japanese",
  ko: "Korean", kr: "Korean", kor: "Korean", korean: "Korean", "ko-kr": "Korean",
  "zh-tw": "Chinese (Traditional)", "zh-hk": "Chinese (Traditional)", "zh-hant": "Chinese (Traditional)", "t-chinese": "Chinese (Traditional)",
  "traditional chinese": "Chinese (Traditional)", "chinese (traditional)": "Chinese (Traditional)", "chinese traditional": "Chinese (Traditional)",
  "zh-cn": "Chinese (Simplified)", "zh-hans": "Chinese (Simplified)", "s-chinese": "Chinese (Simplified)",
  "simplified chinese": "Chinese (Simplified)", "chinese (simplified)": "Chinese (Simplified)", "chinese simplified": "Chinese (Simplified)",
  fr: "French", fra: "French", fre: "French", french: "French", "français": "French", francais: "French",
  de: "German", ger: "German", deu: "German", german: "German", deutsch: "German",
  it: "Italian", ita: "Italian", italian: "Italian", italiano: "Italian",
  es: "Spanish", spa: "Spanish", esp: "Spanish", spanish: "Spanish", "español": "Spanish", espanol: "Spanish",
  pt: "Portuguese", por: "Portuguese", portuguese: "Portuguese", "português": "Portuguese", portugues: "Portuguese", "pt-br": "Portuguese",
}));

/**
 * A language in the app's words ("jp" and "Japanese" are "Japanese"). Empty is English, as an
 * item saved before languages were picked. A language the list does not know is kept as typed.
 */
// What an import writes when its file named no language.
const isUnsaidLanguage = (language) => /^(unknown|not set|n\/a|none|-)$/i.test(language);

export function normalizeCardLanguage(value) {
  const typed = typeof value === "string" ? value.trim() : "";
  if (!typed) return DEFAULT_CARD_LANGUAGE;
  return WORDS.get(typed.toLowerCase()) || CARD_LANGUAGES.find((name) => name.toLowerCase() === typed.toLowerCase()) || typed;
}

export function isEnglishCard(value) {
  return normalizeCardLanguage(value) === DEFAULT_CARD_LANGUAGE;
}

/** The choices a language picker shows: the list, plus a language typed earlier that it lacks. */
export function cardLanguageChoices(current = "") {
  const language = normalizeCardLanguage(current);
  return CARD_LANGUAGES.includes(language) ? [...CARD_LANGUAGES] : [...CARD_LANGUAGES, language];
}

/**
 * The catalog a card in this language is matched in: "English" or "Japanese", or "" when the
 * catalog has no cards for it (Simplified Chinese). A language the list does not know is matched
 * as English, as before languages were picked.
 */
export function catalogLanguageFor(value) {
  const language = normalizeCardLanguage(value);
  if (language === "Japanese" || SAME_AS_JAPANESE.has(language)) return "Japanese";
  if (language === "Chinese (Simplified)") return "";
  return DEFAULT_CARD_LANGUAGE;
}

/** The catalog language of a catalog row (rows from before languages say nothing: English). */
export function catalogRowLanguage(row = {}) {
  return normalizeCardLanguage(row?.language);
}

/** The rows of the catalog a card in this language is matched in. */
export function rowsForCardLanguage(rows = [], language = DEFAULT_CARD_LANGUAGE) {
  const wanted = catalogLanguageFor(language);
  if (!wanted) return [];
  return (Array.isArray(rows) ? rows : []).filter((row) => catalogRowLanguage(row) === wanted);
}

/**
 * Which price a copy in this language shows.
 *   own      the catalog card's own price (English, Japanese)
 *   english  the English card's price, labelled so (French, German, Italian, Spanish,
 *            Portuguese, and a language the list does not know); counted in totals
 *   none     no price (Korean, Chinese): "No price for Korean copies yet"
 */
export function cardLanguagePriceRule(value) {
  const language = normalizeCardLanguage(value);
  if (language === DEFAULT_CARD_LANGUAGE || language === "Japanese" || isUnsaidLanguage(language)) return { source: "own", note: "" };
  if (SAME_AS_JAPANESE.has(language) || language === "Chinese (Simplified)") {
    const name = language.startsWith("Chinese") ? "Chinese" : language;
    return { source: "none", note: `No price for ${name} copies yet` };
  }
  return { source: "english", note: "English card's price" };
}

/** The price a copy shows: the catalog price, or 0 when its language has none. */
export function cardLanguagePrice(value, price) {
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return cardLanguagePriceRule(value).source === "none" ? 0 : amount;
}

/** The small label a card shows next to its name: "" for English, the language otherwise. */
export function cardLanguageBadge(value) {
  const language = normalizeCardLanguage(value);
  return language === DEFAULT_CARD_LANGUAGE || isUnsaidLanguage(language) ? "" : language;
}

/** A title with the language after it when it is not English ("Pikachu 025/165 Japanese"). */
export function titleWithCardLanguage(title = "", value) {
  const text = String(title || "").trim();
  const badge = cardLanguageBadge(value);
  if (!badge || !text || text.toLowerCase().includes(badge.toLowerCase())) return text;
  return `${text} ${badge}`;
}

/**
 * A copy's language once it is filed as a catalog card (or a version of one). The copy keeps
 * its language when that card is the one its language is matched to (a French copy of the
 * English card, a Korean copy of the Japanese card); otherwise it takes the card's language
 * (an English row filed as the Japanese card is Japanese, and the other way round).
 */
export function languageForCatalogCard(current, cardLanguage) {
  const card = normalizeCardLanguage(cardLanguage);
  const language = normalizeCardLanguage(current);
  return catalogLanguageFor(language) === card ? language : card;
}

// ---- What a scanned card says ----

const CODE_LANGUAGES = { EN: "English", FR: "French", DE: "German", IT: "Italian", ES: "Spanish", PT: "Portuguese" };
const SLAB_WORDS = [
  ["JAPANESE", "Japanese"], ["KOREAN", "Korean"], ["CHINESE", "Chinese (Traditional)"], ["FRENCH", "French"],
  ["GERMAN", "German"], ["ITALIAN", "Italian"], ["SPANISH", "Spanish"], ["PORTUGUESE", "Portuguese"],
];
// A Japanese set code straight before the number ("SV2a 025/165", "s12a 100/098", "M2a 210/193",
// "SM12a 001/173"). English cards print three capitals and a language code there ("MEW EN 025/165"),
// so the letters-and-digit codes are Japanese (or Korean or Traditional Chinese, which print the same).
const JAPANESE_CODE_BEFORE_NUMBER = /\b((?:SV|SM|S|M|XY|BW)\d{1,2}[A-Z+]?)[\s:.]{1,3}(\d{3})\s?\/\s?(\d{3})\b/gi;

/**
 * The language a scanned card shows.
 *   text   everything the reader read on the card (cardPhotoReader's text)
 *   slab   true when the card is in a graded slab whose label was read
 * Returns { language, source, check, setCode }:
 *   source "slab"      the slab's label names the language ("2023 POKEMON JAPANESE SV2a ...")
 *          "code"      the code beside the number ("MEW EN 025/165", "PAF FR 232/091")
 *          "set code"  a Japanese set code beside the number ("SV2a 025/165"): Japanese, with
 *                      check true, since Korean and Traditional Chinese cards print the same
 *          ""          nothing said: English, as before
 */
export function cardLanguageFromScan({ text = "", slab = false } = {}) {
  const body = String(text || "");
  const none = { language: DEFAULT_CARD_LANGUAGE, source: "", check: false, setCode: "" };
  if (!body.trim()) return none;
  if (slab) {
    const upper = body.toUpperCase();
    const found = SLAB_WORDS.find(([word]) => new RegExp(`\\b${word}\\b`).test(upper));
    if (found) return { language: found[1], source: "slab", check: found[1].startsWith("Chinese"), setCode: "" };
  }
  // Three capitals, then the language code: before the number, or on its own for EN (the
  // English code is the default anyway; it only rules out the Japanese one).
  const votes = new Map();
  for (const match of body.matchAll(/\b[A-Z]{3}\s?(EN|FR|DE|IT|ES|PT)\b(?:[\s.]{0,3}\d{1,3}\s?\/\s?\d{2,3})?/g)) {
    const followedByNumber = /\d/.test(match[0]);
    if (match[1] !== "EN" && !followedByNumber) continue;
    const language = CODE_LANGUAGES[match[1]];
    votes.set(language, (votes.get(language) || 0) + 1);
  }
  const voted = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  if (voted) return { language: voted[0], source: "code", check: false, setCode: "" };
  const codes = new Map();
  for (const match of body.matchAll(JAPANESE_CODE_BEFORE_NUMBER)) {
    const code = match[1];
    codes.set(code.toLowerCase(), { code, count: (codes.get(code.toLowerCase())?.count || 0) + 1 });
  }
  const best = [...codes.values()].sort((a, b) => b.count - a.count)[0];
  if (best) return { language: "Japanese", source: "set code", check: true, setCode: best.code };
  return none;
}

// ---- What a search says ----

const QUERY_LANGUAGE_WORDS = new Map(Object.entries({
  japanese: "Japanese", japan: "Japanese", jp: "Japanese", jpn: "Japanese",
  korean: "Korean", kr: "Korean",
  french: "French", german: "German", italian: "Italian", spanish: "Spanish", portuguese: "Portuguese",
  english: "English",
}));
// A Japanese set code typed in a search: letters and a number with a letter after it (sv2a,
// s12a, sm12a, sv4k), or an M-series code (m2a, m7). Plain "sv3" or "sm1" are also English set
// ids, so they say nothing.
const JAPANESE_SET_CODE_WORD = /^(?:(?:sv|sm|s|xy|bw)\d{1,2}[a-z+]|m\d{1,2}[a-z]?)$/i;

/** A search word that is a Japanese set code ("sv2a", "M2a"), or "". */
export function japaneseSetCodeIn(query = "") {
  for (const word of String(query || "").split(/[\s,]+/)) {
    if (JAPANESE_SET_CODE_WORD.test(word)) return word;
  }
  return "";
}

/**
 * The language a search asks for. "pikachu japanese" and "jp pikachu" ask for Japanese cards
 * (the language word is taken out of the search); "sv2a pikachu" names a Japanese set (the code
 * is taken out and returned as setCode, to filter by the set). Returns
 * { language, query, setCode }: language "" when the search says nothing.
 */
export function cardLanguageInQuery(query = "") {
  const words = String(query || "").split(/\s+/).filter(Boolean);
  let language = "";
  let setCode = "";
  const kept = [];
  for (const word of words) {
    const plain = word.toLowerCase().replace(/[.,]+$/g, "");
    if (!language && QUERY_LANGUAGE_WORDS.has(plain)) { language = QUERY_LANGUAGE_WORDS.get(plain); continue; }
    if (!setCode && JAPANESE_SET_CODE_WORD.test(plain)) { setCode = word.replace(/[.,]+$/g, ""); continue; }
    kept.push(word);
  }
  if (setCode && !language) language = "Japanese";
  // A search of only "japanese" is not a search for nothing: the word stays.
  if (language && !setCode && !kept.length) return { language: "", query: String(query || "").trim(), setCode: "" };
  return { language, query: kept.join(" "), setCode };
}
