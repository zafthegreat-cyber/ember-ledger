import { isKnownCardName, snapCardName } from "./cardNameSnap.mjs";
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
      // Nov 24 2026: attack damage and HP ("120 60", "1207 30") are not collector
      // numbers. A card's own number is at most about twice its set total (secret
      // rares such as 230/193 stay in range); a "7" standing in for "/" must be closer still.
      const leftNumber = Number(leftDigits.replace(/[a-z]$/, ""));
      if (leftNumber > Number(rightDigits) * 2 + 10) continue;
      if (match[0].includes("7") && !match[0].includes("/") && leftNumber > Number(rightDigits) + 20) continue;
      add(`${left}/${right}`, "fraction");
    }
    for (const match of line.matchAll(/\b(SWSH|SVP|SM|XY|BW|DP|HGSS)\s?(?:EN\s?)?([0-9OoIl]{2,3})\b/g)) add(`${match[1]}${toDigits(match[2])}`, "promo");
  }
  return out;
}

const NOT_A_NAME = /^(?:basic|stage\s*[12i]|stage|trainer|item|supporter|stadium|tool|pok[eé]mon(?:\s+tool)?|energy|special energy|evolves from\b.*|put\b.*|ability\b.*|weakness\b.*|resistance\b.*|retreat\b.*|illus\.?\b.*|leader|character|event|stage|don!*|counter\b.*|trigger\b.*|creature\b.*|instant|sorcery|enchantment|artifact|land|legendary\b.*|song|action|ink\b.*|lore\b.*|tera|mega|ancient|future|rule\b.*|ace spec|prism star|radiant)$/i;
const SUFFIX = /\b(ex|EX|GX|V|VMAX|VSTAR|V-UNION|LV\.?\s?X|BREAK|Prime|LEGEND|Star|δ)\b/;
const GENERIC_NAME = /^(?:pok[eé]mon|basic|stage|trainer|item|supporter|stadium|energy|ability|weakness|resistance|retreat)$/i;

/** True for a word printed on every card ("Pokémon", "Basic") that is never a card's own name. */
export const isGenericCardWord = (name = "") => GENERIC_NAME.test(String(name).trim());

// A number read with the card turned around: "128/198" upside down reads "861/821".
const TURNED_DIGIT = { 0: "0", 1: "1", 2: "2", 5: "5", 6: "9", 8: "8", 9: "6", "/": "/" };
const turnDigits = (value = "") => [...String(value)].reverse().map((ch) => TURNED_DIGIT[ch] ?? "?").join("");

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
    // Drop number/symbol tokens ("100", "+60", ".70", "HE.@") and a stray
    // stage label fragment in front of the name ("BAS", "LBASIC").
    const words = line.split(" ")
      .filter((word) => (word.match(/[A-Za-zÀ-ž]/g) || []).length >= Math.max(1, word.replace(/[’'.-]/g, "").length * 0.6))
      .filter((word, index, all) => !(index === 0 && all.length > 1 && /^l?bas(?:ic?)?$/i.test(word)));
    // Short stray tokens from art and borders: keep known suffixes, drop other 1-2 letter bits.
    const kept = words.filter((word, index) => {
      if (SUFFIX.test(word)) return true;
      // A short all-caps fragment after the name ("HE.", "BT") is border noise.
      if (index > 0 && /^[A-Z]{1,3}\.?$/.test(word)) return false;
      return word.length > 2 || (index > 0 && /^[A-Z][a-z]?\.?$/.test(word));
    });
    if (!kept.length) continue;
    candidates.push(kept.join(" "));
  }
  return candidates;
}

/**
 * Builds the reviewed search from the three reads of one card photo.
 * @param {{ nameText?: string, numberText?: string, fullText?: string }} reads
 */
/**
 * Ranks name candidates. A name that more than one read agrees on wins over
 * the first line read; real names look like words (capital letter, 4+ letters).
 */
export function rankCardNames(candidateLists = []) {
  const scores = new Map();
  const display = new Map();
  candidateLists.forEach((list, readIndex) => {
    list.forEach((name, position) => {
      const key = name.toLowerCase().replace(/[^a-z0-9à-ž]/g, "");
      if (key.length < 3) return;
      const entry = scores.get(key) || { reads: new Set(), best: Infinity };
      entry.reads.add(readIndex);
      entry.best = Math.min(entry.best, position);
      scores.set(key, entry);
      if (!display.has(key) || /^[A-Z]/.test(name)) display.set(key, name);
    });
  });
  const rank = (key) => {
    const name = display.get(key);
    const entry = scores.get(key);
    const letters = key.replace(/[^a-zà-ž]/g, "").length;
    return entry.reads.size * 3
      + (/^[A-ZÀ-Ž]/.test(name) ? 1 : 0)
      + (letters >= 4 ? 1 : 0) + (letters >= 6 ? 0.5 : 0)
      - (name === name.toUpperCase() && letters <= 4 ? 1.5 : 0)
      - entry.best * 0.25;
  };
  return [...scores.keys()].sort((a, b) => rank(b) - rank(a)).map((key) => display.get(key));
}

/**
 * Other things printed on a card that tell its printings apart when the collector
 * number is hidden by foil, a sleeve or glare (Nov 26 2026, owner's inventory scans).
 * Pure. Nothing here decides the card; cardClueMatch.mjs weighs these against the catalog.
 *   years          the print year(s) on the copyright line: [2021], [1999, 2000]
 *   hp             the HP printed beside the name
 *   evolvesFrom    the name after "Evolves from"
 *   numberParts    pieces of a collector number: "73/1", "4/102", "/198"
 *   namesInText    known card names found anywhere in the text (needs the name index)
 *   wizards        true for the 1999-2003 copyright line ("©1995, 96, 98 Nintendo") when its own year was not read
 *   digitRuns      runs of digits from the bottom of the card ("12877198" is 128/198 with the slash misread)
 * nameStripText is what was read from the top of the card: a bare "70" or "130" there is the HP.
 * numberStripText is what was read from the bottom of the card. turnedText is what was read with
 * the card turned around: a number in it is upside down, so it is turned back ("861/821" is 128/198).
 * bodyText, when given, is where names are looked for: the card's text without its name bar, so a
 * stray word read from the name bar cannot vouch for itself.
 * Nov 26 2026 (dark foil cards whose name bar cannot be read):
 *   dex, species   the number on the Pokédex line under the picture ("NO. 0300 Kitten Pokémon HT: 2'00"")
 *                  and, with dexNames (index 0 is number 1), the species it stands for
 *   setCodes       set codes printed beside the number on current cards ("ASC EN 165/217"), as read
 *   modern         true when the Pokédex line has "HT:" and "WT:", which no 1999-2003 card has
 */
export function findCardClues(text = "", { nameIndex = null, nameStripText = "", numberStripText = "", turnedText = "", bodyText = null, readName = "", dexNames = null } = {}) {
  const body = clean(text);
  const years = new Set();
  const addYears = (first, second) => {
    const from = Number(first);
    if (!(from >= 1996 && from <= 2099)) return;
    years.add(from);
    if (second) {
      const to = Number(String(second).length === 2 ? String(first).slice(0, 2) + second : second);
      if (to > from && to - from <= 3) for (let year = from + 1; year <= to; year += 1) years.add(year);
    }
  };
  // Wizards-era cards print the game's first years too ("©1995, 96, 98 Nintendo ... ©1999-2000 Wizards"):
  // only the Wizards year is when the card was printed.
  const wizards = [...body.matchAll(/((?:19|20)\d{2})(?:\s?[-–—]\s?((?:19|20)?\d{2}))?\s*Wizards/gi)];
  if (wizards.length) for (const match of wizards) addYears(match[1], match[2]);
  else {
    for (const match of body.matchAll(/(?:©|\(c\)|@)\s?((?:19|20)\d{2})(?:\s?[-–—]\s?((?:19|20)?\d{2}))?/gi)) addYears(match[1], match[2]);
    for (const match of body.matchAll(/\b((?:19|20)\d{2})\s*Pok[eé]mon\b/gi)) addYears(match[1]);
    for (const match of body.matchAll(/\b((?:19|20)\d{2})\b[^\n]{0,14}Nintendo/gi)) addYears(match[1]);
  }
  const wizardsEra = !years.size && /19\s?95[.,]?\s*96[.,]?\s*98/.test(body);
  const hpMatch = body.match(/\bHP\s?([1-3]?\d0)\b/) || body.match(/\b([1-3]?\d0)\s?HP\b/);
  let hp = hpMatch ? Number(hpMatch[1]) : 0;
  if (!hp && nameStripText) {
    // The small "HP" is often lost; the big number after the name is what is left ("Golurk ... 150").
    const counts = new Map();
    for (const match of clean(nameStripText).matchAll(/(?:^|[^0-9])([1-3]?[3-9]0|[1-3][0-2]0)(?![0-9])/g)) counts.set(match[1], (counts.get(match[1]) || 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 2) hp = Number(best[0]);
    // Read once, but on the line that has the card's name ("Hatterene ... B130"): the only number printed there is the HP.
    const start = String(readName || "").toLowerCase().replace(/[^a-zà-ž]/g, "").slice(0, 5);
    if (!hp && start.length === 5) {
      for (const line of linesOf(nameStripText)) {
        if (!line.toLowerCase().replace(/[^a-zà-ž]/g, "").includes(start)) continue;
        const seen = [...line.matchAll(/(?:^|[^0-9])([1-3]?[3-9]0|[1-3][0-2]0)(?![0-9])/g)].map((match) => match[1]);
        if (seen.length === 1) { hp = Number(seen[0]); break; }
      }
    }
  }
  let evolvesFrom = "";
  // Old cards go on with "Put Machoke on the Basic Pokémon": the name ends before "Put".
  // The start of "Evolves" is often lost ("ves from Electabuzz"); what follows "from" is still not this card.
  const evolves = body.match(/(?:\bEvolves|\b[A-Za-z]{0,3}ves)\s+from\s+((?!Put\b)[A-Z][A-Za-zÀ-ž'’.\-]*(?: (?!Put\b)[A-Z][A-Za-zÀ-ž'’.\-]*){0,2})/);
  if (evolves) {
    evolvesFrom = squash(evolves[1]).replace(/[.,]+$/, "");
    if (nameIndex) {
      // "Electabuzz EN": short stray words after a name that is a card on its own are dropped.
      const [first, ...rest] = evolvesFrom.split(" ");
      evolvesFrom = rest.length && rest.every((word) => word.length <= 3) && isKnownCardName(first, nameIndex) ? first : snapCardName(evolvesFrom, nameIndex) || evolvesFrom;
    }
  }
  // The Pokédex line: "NO. 0300 Kitten Pokémon HT: 2'00"". The number must be followed closely by
  // the species phrase, "Pokémon" and "HT" with no sentence mark between (the line is often read
  // in pieces), so a stray "NO. 102 ... : ... this Pokémon" elsewhere is not taken.
  let dex = 0;
  const dexLine = body.match(/(?:\bN[Oo0]|\b[1Il]0)[\s.,:_]{0,5}(?:\[\d\][\s_]{0,2})?(\d{3,4})\b[^.:;,]{0,28}?(?:Pok[eé]mon|[eé]mon)[\s._]{0,3}H[T1I]\b/);
  if (dexLine && Number(dexLine[1]) >= 1 && Number(dexLine[1]) <= 1025) dex = Number(dexLine[1]);
  const species = dex && Array.isArray(dexNames) ? String(dexNames[dex - 1] || "") : "";
  const modern = /\bH[T1][.:]\s?\d[^\n]{0,16}\bW[TI1][.:]/.test(body);
  // Set codes: three capitals straight before "EN" or before the number. A misread one ("OSH")
  // matches no set and does no harm, so every one seen is kept, the most often seen first.
  const codes = new Map();
  for (const match of body.matchAll(/\b([A-Z]{3})(?:\s?EN\b|en\b)|\b([A-Z]{3})\s\d{1,3}\s?\/\s?\d{2,3}\b/g)) {
    const code = match[1] || match[2];
    if (!NOT_A_SET_CODE.test(code)) codes.set(code, (codes.get(code) || 0) + 1);
  }
  const setCodes = [...codes.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code).slice(0, 4);
  // Pieces of a collector number. A full "125/197" is here too, so one rule weighs them all.
  const numberParts = [];
  const seenParts = new Set();
  for (const line of linesOf(body)) {
    for (const match of line.matchAll(/(?:^|[^0-9A-Za-z])(\d{0,3})\s?\/\s?(\d{0,3})(?![0-9])/g)) {
      const [numerator, total] = [match[1], match[2]];
      if (numerator.length + total.length < 2 || (!total && numerator.length < 2)) continue;
      if (total.length >= 2 && Number(total) === 0) continue;
      const part = `${numerator}/${total}`;
      if (!seenParts.has(part)) { seenParts.add(part); numberParts.push(part); }
    }
  }
  const digitRuns = [];
  for (const match of clean(numberStripText).matchAll(/(?:^|[^0-9])(\d{3,8})(?![0-9])/g)) if (!digitRuns.includes(match[1]) && digitRuns.length < 12) digitRuns.push(match[1]);
  for (const match of clean(turnedText).matchAll(/(?:^|[^0-9])(\d{2,3}\s?\/\s?\d{1,3}|\d{3})(?![0-9])/g)) {
    const turned = turnDigits(match[1].replace(/\s/g, ""));
    if (turned.includes("?")) continue;
    if (turned.includes("/")) { if (!seenParts.has(turned)) { seenParts.add(turned); numberParts.push(turned); } }
    else if (!digitRuns.includes(turned) && digitRuns.length < 12) digitRuns.push(turned);
  }
  // Known card names anywhere on the card ("...except any Abomasnow"), for when the name bar is unreadable.
  const namesInText = [];
  if (nameIndex) {
    const words = (bodyText === null ? body : clean(bodyText)).replace(/[^A-Za-zÀ-ž'’ \n-]/g, " ").split(/\s+/).map((word) => word.replace(/^-+|-+$/g, "")).filter(Boolean);
    const counts = new Map();
    const skip = new Set([evolvesFrom.toLowerCase(), evolvesFrom.split(" ")[0].toLowerCase(), String(readName || "").toLowerCase(), "pokemon", "pokémon"]);
    for (let i = 0; i < words.length; i += 1) {
      // Two words first ("Galarian Slowpoke"), a near miss allowed ("Gatarian Slowpoke"); then one word, exact.
      const pair = words.slice(i, i + 2).join(" ");
      let found = "";
      if (words[i + 1] && /^[A-ZÀ-Ž]/.test(pair) && pair.replace(/[^A-Za-zÀ-ž]/g, "").length >= 9) {
        const snapped = snapCardName(pair, nameIndex);
        const wordsFit = (name) => { const [a, b] = [name.split(" "), pair.split(" ")]; return a.length === b.length && a.every((word, at) => closeWord(word, b[at])); };
        if (snapped && snapped.includes(" ") && isKnownCardName(snapped, nameIndex) && wordsFit(snapped)) found = snapped;
        // One name split by a stray space ("Ab OMasnoy" for Abomasnow): the two pieces together are the name.
        else if (snapped && !snapped.includes(" ") && snapped.length >= 8 && words[i].length >= 2 && words[i + 1].length >= 3 && closeWord(snapped, pair.replace(/ /g, ""))) found = snapped;
      }
      // One word: six letters or more, and not all capitals ("LARRY" read from a border is not the card Larry).
      if (!found && /^[A-ZÀ-Ž]/.test(words[i]) && !/^[A-ZÀ-Ž'’-]+$/.test(words[i]) && words[i].replace(/[^A-Za-zÀ-ž]/g, "").length >= 6 && isKnownCardName(words[i], nameIndex)) found = words[i];
      if (!found || skip.has(found.toLowerCase())) continue;
      counts.set(found, (counts.get(found) || 0) + 1);
    }
    // A one-word name that is only part of a longer name found here ("Slowpoke" in "Galarian Slowpoke") is dropped.
    const longer = [...counts.keys()].filter((name) => name.includes(" "));
    for (const [name, count] of [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)) {
      if (!name.includes(" ") && longer.some((full) => full.toLowerCase().split(" ").includes(name.toLowerCase()))) continue;
      namesInText.push(name);
      if (namesInText.length >= 5) break;
      void count;
    }
  }
  return { years: [...years].sort((a, b) => a - b), wizards: wizardsEra, hp, evolvesFrom, numberParts: numberParts.slice(0, 10), digitRuns, namesInText, dex, species, setCodes, modern };
}

// Three capitals before "EN" that are words, not set codes.
const NOT_A_SET_CODE = /^(?:THE|AND|FOR|YOU|ALL|ANY|ONE|TWO|PUT|HAS|NOT|ITS|MAY|CAN|GET|END|HIT|ASK|USE|OWN|OUT|OFF|NEW|OLD|BIG|TOP|GEN)$/;

// One word against another: the same letters, or one letter off in a word of six or more.
function closeWord(a = "", b = "") {
  const [x, y] = [a, b].map((word) => word.toLowerCase().replace(/[^a-zà-ž]/g, ""));
  if (x === y) return true;
  if (x.length < 6 || Math.abs(x.length - y.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (x.length > y.length) i += 1; else if (y.length > x.length) j += 1; else { i += 1; j += 1; }
  }
  return edits + (x.length - i) + (y.length - j) <= 1;
}

export function parseCardPhotoText({ nameText = "", numberText = "", fullText = "", extraNameTexts = [], nameIndex = null } = {}) {
  // Nov 24 2026: with the catalog's card names loaded, each read name is corrected to
  // the real name it is closest to ("Charizarb" -> "Charizard"), so separate reads
  // agree and a real name is put first.
  const snapList = (list) => (nameIndex ? list.map((name) => snapCardName(name, nameIndex) || name) : list);
  // Nov 26 2026: "Pokémon", "Basic" and "Energy" are printed on every card and are in the
  // catalog's name list (product rows); read alone they are never this card's name.
  const real = (list) => list.filter((name) => !GENERIC_NAME.test(name));
  const lists = [findCardName(nameText), ...extraNameTexts.map((text) => findCardName(text)), findCardName(fullText).slice(0, 4)].map(snapList).map(real);
  let names = rankCardNames(lists);
  if (nameIndex) {
    const known = names.findIndex((name) => isKnownCardName(name, nameIndex));
    if (known > 0) names = [names[known], ...names.slice(0, known), ...names.slice(known + 1)];
  }
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
  const nameKey = (value) => String(value).toLowerCase().replace(/[^a-z0-9à-ž]/g, "");
  // How many separate reads gave this name: two agreeing reads make it settled.
  const nameAgreement = name ? lists.filter((list) => list.some((item) => nameKey(item) === nameKey(name))).length : 0;
  const number = numbers[0]?.value || "";
  const query = squash([name, number].filter(Boolean).join(" ")).slice(0, CARD_PHOTO_LIMITS.maxQueryLength);
  // Nov 24 2026: when the number strip was read but held no number, a number found
  // elsewhere on the card (attack damage, HP, flavour text) is only a guess. It stays
  // in the search text, but the read is not called certain, so nothing searches on its own.
  const numberIsGuess = Boolean(number) && Boolean(String(numberText).trim()) && !findCardNumbers(numberText).length;
  const found = (name ? 1 : 0) + (number && !numberIsGuess ? 1 : 0);
  return {
    query,
    name,
    nameAgreement,
    number,
    suggestions: suggestions.slice(0, 6),
    certainty: found === 2 ? "name-and-number" : number && !numberIsGuess ? "number-only" : name ? "name-only" : number ? "number-only" : "none",
    text: clean([nameText, numberText, fullText].filter(Boolean).join("\n---\n")).trim(),
  };
}
