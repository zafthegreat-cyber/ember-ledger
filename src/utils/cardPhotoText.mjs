// Card reader text rules (Nov 17 2026). Pure: turns the text read from a card
// photo into a catalog search such as "Charizard ex 125/197" or
// "Monkey.D.Luffy OP01-024". It never decides the card: the person reviews the
// catalog matches. No finish, grade, language, condition or price is inferred.

export const CARD_PHOTO_LIMITS = Object.freeze({ maxTextLength: 20_000, maxQueryLength: 180 });

const clean = (value = "") => String(value).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, CARD_PHOTO_LIMITS.maxTextLength);
const squash = (value = "") => String(value).replace(/\s+/g, " ").trim();
const linesOf = (value = "") => clean(value).split("\n").map(squash).filter(Boolean);

// Letters OCR often reads in place of digits, used only inside a number token.
const DIGIT_LOOKALIKES = { O: "0", o: "0", D: "0", Q: "0", I: "1", l: "1", i: "1", "|": "1", "!": "1", L: "1", Z: "2", z: "2", S: "5", s: "5", B: "8", G: "6", b: "6", g: "9", q: "9", T: "7" };
const toDigits = (token = "") => [...token].map((ch) => DIGIT_LOOKALIKES[ch] ?? ch).join("");
const LOOKALIKE_CLASS = "0-9OoDQIli|!LZzSsBGbgqT";

/**
 * Printed collector numbers, most specific first:
 * - One Piece and similar: OP01-024, ST10-001, EB01-012, PRB01-001, P-041
 * - Fractions: 125/197, 058/102, TG04/TG30, GG35/GG70, SV049/SV122, 12/204
 * - Promo codes: SWSH123, SVP 085, SM210, XY124, BW45 (number alone, no total)
 */
export function findCardNumbers(text = "") {
  const out = [];
  const seen = new Set();
  const add = (value, kind) => {
    const key = value.toUpperCase();
    if (!value || seen.has(key)) return;
    seen.add(key);
    out.push({ value, kind });
  };
  for (const line of linesOf(text)) {
    for (const match of line.matchAll(/\b((?:OP|ST|EB|PRB)\s?[0-9OoIl]{2})\s?[-–]\s?([0-9OoIlSB]{3})\b/gi)) {
      add(`${match[1].replace(/\s/g, "").toUpperCase().replace(/^([A-Z]+)(.*)$/, (_, a, b) => a + toDigits(b))}-${toDigits(match[2])}`, "code");
    }
    for (const match of line.matchAll(/\bP\s?[-–]\s?([0-9OoIl]{3})\b/g)) add(`P-${toDigits(match[1])}`, "code");
    const fraction = new RegExp(`(?:^|[^A-Za-z0-9])((?:TG|GG|SV|RC|H)?[${LOOKALIKE_CLASS}]{1,3}[a-z]?)\\s*[/7]\\s*((?:TG|GG|SV|RC|H)?[${LOOKALIKE_CLASS}]{2,3})(?![A-Za-z0-9])`, "g");
    for (const match of line.matchAll(fraction)) {
      const [first, second] = [match[1], match[2]];
      const prefix = (first.match(/^(TG|GG|SV|RC|H)/) || [""])[0];
      const left = prefix + toDigits(first.slice(prefix.length));
      const rightPrefix = (second.match(/^(TG|GG|SV|RC|H)/) || [""])[0];
      const right = rightPrefix + toDigits(second.slice(rightPrefix.length));
      const leftDigits = left.replace(/^(TG|GG|SV|RC|H)/, "");
      const rightDigits = right.replace(/^(TG|GG|SV|RC|H)/, "");
      if (!/^\d{1,3}[a-z]?$/.test(leftDigits) || !/^\d{2,3}$/.test(rightDigits)) continue;
      // A "/" read as "7" is only accepted when the result still looks like a set total.
      if (match[0].includes("7") && !match[0].includes("/") && Number(rightDigits) < 20) continue;
      if (Number(rightDigits) === 0) continue;
      add(`${left}/${right}`, "fraction");
    }
    for (const match of line.matchAll(/\b(SWSH|SVP|SM|XY|BW|DP|HGSS)\s?([0-9OoIl]{2,3})\b/g)) add(`${match[1]}${toDigits(match[2])}`, "promo");
  }
  return out;
}

const NOT_A_NAME = /^(?:basic|stage\s*[12i]|stage|trainer|item|supporter|stadium|tool|pok[eé]mon(?:\s+tool)?|energy|special energy|evolves from\b.*|put\b.*|ability\b.*|weakness\b.*|resistance\b.*|retreat\b.*|illus\.?\b.*|leader|character|event|stage|don!*|counter\b.*|trigger\b.*|creature\b.*|instant|sorcery|enchantment|artifact|land|legendary\b.*|song|action|ink\b.*|lore\b.*|tera|mega|ancient|future|rule\b.*|ace spec|prism star|radiant)$/i;
const SUFFIX = /\b(ex|EX|GX|V|VMAX|VSTAR|V-UNION|LV\.?\s?X|BREAK|Prime|LEGEND|Star|δ)\b/;

/** Card name from the name strip: the first line that reads like a name. */
export function findCardName(text = "") {
  const candidates = [];
  for (const raw of linesOf(text)) {
    let line = raw
      .replace(/\b(?:HP|hp|Hp)\s?[0-9OoIlS]{2,3}\b.*$/, "")
      .replace(/\b[0-9OoIl]{2,3}\s?HP\b.*$/i, "")
      .replace(/^[^A-Za-zÀ-ž]+/, "")
      .replace(/[^A-Za-zÀ-ž0-9.'’:\- ]+$/, "")
      .replace(/[|_~=*«»“”"`]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    line = line.replace(/^(?:basic|stage\s*[12i]?)\s+/i, "");
    if (!line || NOT_A_NAME.test(line)) continue;
    const letters = (line.match(/[A-Za-zÀ-ž]/g) || []).length;
    if (letters < 3 || letters / line.replace(/\s/g, "").length < 0.6) continue;
    if (line.length > 40) continue;
    // Real names have a vowel and are not one letter repeated ("EE", "LLY", "III").
    if (!/[aeiouàâäéèêëïîôöüûAEIOU]/.test(line) || /^(.)\1+$/i.test(line.replace(/[^A-Za-z]/g, ""))) continue;
    const words = line.split(" ");
    // Short stray tokens from art and borders: keep known suffixes, drop other 1-2 letter bits.
    const kept = words.filter((word, index) => word.length > 2 || SUFFIX.test(word) || (index > 0 && /^[A-Z][a-z]?\.?$/.test(word)));
    if (!kept.length) continue;
    candidates.push(kept.join(" "));
  }
  return candidates;
}

/**
 * Builds the reviewed search from the three reads of one card photo.
 * @param {{ nameText?: string, numberText?: string, fullText?: string }} reads
 */
export function parseCardPhotoText({ nameText = "", numberText = "", fullText = "" } = {}) {
  const names = [...findCardName(nameText), ...findCardName(fullText).slice(0, 2)];
  const numbers = [...findCardNumbers(numberText), ...findCardNumbers(fullText)];
  const seen = new Set();
  const suggestions = [];
  const add = (type, value, label) => {
    const query = squash(value).slice(0, CARD_PHOTO_LIMITS.maxQueryLength);
    if (!query || seen.has(query.toLowerCase())) return;
    seen.add(query.toLowerCase());
    suggestions.push({ type, value: query, label });
  };
  for (const number of numbers.slice(0, 3)) add("card-number", number.value, "Card number");
  for (const name of names.slice(0, 3)) add("text", name, "Card name");
  const name = names[0] || "";
  const number = numbers[0]?.value || "";
  const query = squash([name, number].filter(Boolean).join(" ")).slice(0, CARD_PHOTO_LIMITS.maxQueryLength);
  const found = (name ? 1 : 0) + (number ? 1 : 0);
  return {
    query,
    name,
    number,
    suggestions: suggestions.slice(0, 6),
    certainty: found === 2 ? "name-and-number" : number ? "number-only" : name ? "name-only" : "none",
    text: clean([nameText, numberText, fullText].filter(Boolean).join("\n---\n")).trim(),
  };
}
