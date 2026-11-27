// Graded slab labels (Nov 17 2026, owner: "scan slabs").
// Reads the grading company, grade, certification number and the card's name
// and number from the text on a slab label (PSA, CGC, Beckett/BGS, SGC, TAG,
// ACE, AGS, GMA). Pure. The person confirms every value before saving; the
// cert number can be checked on the grader's own site.
import { findCardNumbers, isGenericCardWord } from "./cardPhotoText.mjs";
import { snapCardName } from "./cardNameSnap.mjs";

const clean = (value = "") => String(value).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, 20_000);
const linesOf = (value = "") => clean(value).split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);

export const GRADERS = Object.freeze([
  { key: "PSA", label: "PSA", match: /\bPSA\b|PROFESSIONAL SPORTS AUTHENTICATOR/i, cert: /^\d{7,9}$/ },
  { key: "CGC", label: "CGC", match: /\bCGC\b|CERTIFIED GUARANTY/i, cert: /^\d{10}$/ },
  { key: "BGS", label: "Beckett (BGS)", match: /\bBGS\b|\bBECKETT\b|\bBCCG\b/i, cert: /^\d{7,10}$/ },
  { key: "SGC", label: "SGC", match: /\bSGC\b/i, cert: /^\d{7,8}$/ },
  { key: "TAG", label: "TAG", match: /\bTAG\b(?!\s*team)/i, cert: /^[A-Z0-9]{8,12}$/ },
  { key: "ACE", label: "ACE", match: /\bACE\s*GRADING\b|\bACE\b/i, cert: /^\d{6,10}$/ },
  { key: "AGS", label: "AGS", match: /\bAGS\b/i, cert: /^[A-Z0-9]{7,12}$/ },
  { key: "GMA", label: "GMA", match: /\bGMA\b/i, cert: /^\d{6,10}$/ },
]);

// Grade words printed on labels, best first.
const GRADE_WORDS = [
  [/\bBLACK\s*LABEL\b/i, "10 Black Label"],
  [/\bPRISTINE\s*10\b|\bPRISTINE\b/i, "10 Pristine"],
  [/\bGEM\s*(?:MT|MINT)\s*10\b|\bGEM\s*(?:MT|MINT)\b/i, "10"],
  [/\bMINT\s*\+\s*9\.?5\b|\bMINT\+/i, "9.5"],
  [/\bNM[-\s]?MT\s*\+?\s*8\.5\b/i, "8.5"],
  [/\bNM[-\s]?MT\s*8\b/i, "8"],
];

/** Grade such as "10", "9.5", "10 Pristine" or "10 Black Label". */
export function findGrade(text = "") {
  const all = clean(text);
  // Nov 24 2026: Beckett prints "9.5 GEM MINT"; the number beside the words wins.
  // Same line only: "#4" on the line above "PRISTINE 10" is the card number, not the grade.
  const beside = all.match(/\b(10|[1-9](?:\.5)?)[ \t]*(?:GEM[ \t]*(?:MT|MINT)|PRISTINE|MINT[ \t]*\+?|NM[- \t]?MT[ \t]*\+?)(?![\w.])/i)
    || all.match(/\b(?:GEM[ \t]*(?:MT|MINT)|PRISTINE|NM[- \t]?MT|MINT)[ \t]*\+?[ \t]*(10|[1-9](?:\.5)?)(?![\d./])/i);
  if (beside && !/BLACK\s*LABEL/i.test(all)) {
    const number = beside[1];
    if (number === "10" && /\bPRISTINE\b/i.test(beside[0])) return "10 Pristine";
    return number;
  }
  for (const [pattern, grade] of GRADE_WORDS) if (pattern.test(all)) {
    if (grade === "10" || grade === "9.5" || grade === "8.5" || grade === "8") {
      const explicit = all.match(/\b(10|[1-9](?:\.5)?)\b(?!\s*\/)/);
      if (explicit && explicit[1] === grade) return grade;
    }
    return grade;
  }
  // A lone grade near a grade word: "MINT 9", "NM 7", "GRADE 8.5".
  const near = all.match(/\b(?:GEM\s*MT|MINT|NM[-\s]?MT|NM|EX[-\s]?MT|EX|VG[-\s]?EX|VG|GOOD|FAIR|POOR|GRADE)\s*\+?\s*(10|[1-9](?:\.5)?)\b/i);
  if (near) return near[1];
  return "";
}

/** Certification number: the longest digit run (or TAG/AGS code) that fits the grader's format. */
export function findCertNumber(text = "", graderKey = "") {
  const grader = GRADERS.find((item) => item.key === graderKey);
  const tokens = [...clean(text).matchAll(/(?:cert(?:ification)?\s*(?:#|no\.?|number)?\s*:?\s*)?([A-Z0-9]{6,13})/gi)].map((m) => m[1].toUpperCase())
    .filter((token) => !/^(19|20)\d{2}$/.test(token));
  const digitsFirst = tokens.filter((token) => /^\d+$/.test(token)).sort((a, b) => b.length - a.length);
  const pick = (list) => list.find((token) => (grader ? grader.cert.test(token) : /^\d{7,10}$/.test(token)));
  return pick(digitsFirst) || (grader && /A-Z/.test(grader.cert.source) ? pick(tokens.filter((token) => /\d/.test(token) && /[A-Z]/.test(token))) : "") || "";
}

/** Card name and number from the label: "#025 PIKACHU", "CHARIZARD EX - 199/165". */
export function findSlabCard(text = "") {
  let number = "";
  let name = "";
  for (const line of linesOf(text)) {
    if (!number) {
      const hash = line.match(/#\s?([A-Z]{0,4}\d{1,3}[a-z]?)\b/i);
      if (hash) number = hash[1].toUpperCase();
      else number = findCardNumbers(line)[0]?.value || "";
    }
    if (!name) {
      const candidate = line
        .replace(/#\s?[A-Z]{0,4}\d{1,3}[a-z]?\b/gi, " ")
        .replace(/\b(?:19|20)\d{2}\b/g, " ")
        .replace(/\b(?:ALT(?:ERNATE)?\.?\s*ART|SPECIAL\s*ILLUSTRATION\s*RARE|ILLUSTRATION\s*RARE|SPECIAL\s*ART\s*RARE|ULTRA\s*RARE|HYPER\s*RARE|RAINBOW\s*RARE|SECRET\s*RARE|DOUBLE\s*RARE|BECKETT|TRADING\s*CARDS?|COLLECTIBLES?|GRADING|POKEMON\s*GAME|GAME|BLACK\s*STAR)\b/gi, " ")
        .replace(/\b(?:POKEMON|POKÉMON|JAPANESE|ENGLISH|HOLO|REV(?:ERSE)?\.?\s*(?:HOLO|FOIL)?|1ST\s*EDITION|SHADOWLESS|PROMO|FULL\s*ART|SECRET|GEM\s*MT|MINT|NM[-\s]?MT|PRISTINE|BLACK\s*LABEL|PSA|CGC|BGS|SGC|TAG|CERT\w*)\b/gi, " ")
        .replace(/[^A-Za-zÀ-ž' .-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^[\s.'-]+|[\s.'-]+$/g, "");
      const looksLikeSet = /\b(?:SWSH|SV|SM|XY|BASE|JUNGLE|FOSSIL|EVOLVING|SKIES|FLAMES|CROWN|ZENITH|OBSIDIAN|PARADOX|SURGING|PRISMATIC|SCARLET|VIOLET|SWORD|SHIELD|CELEBRATIONS|151)\b/i.test(candidate);
      if (candidate.length >= 3 && /[AEIOUaeiou]/.test(candidate) && !looksLikeSet && candidate.split(" ").length <= 5) name = candidate;
    }
  }
  const tidyName = name.toLowerCase().replace(/\b([a-zà-ž])/g, (m) => m.toUpperCase()).replace(/\bEx\b/g, "ex").replace(/\bGx\b/g, "GX").replace(/\bVmax\b/g, "VMAX").replace(/\bVstar\b/g, "VSTAR");
  return { name: tidyName, number };
}

/** Everything a slab label says, plus a catalog search built from the card details. */
export function parseSlabLabel(text = "") {
  const all = clean(text);
  // Nov 24 2026: the PSA logo is often not read as text. "GEM MT" / "NM-MT" wording
  // with an 8-9 digit cert and no other grader named is a PSA label.
  const grader = GRADERS.find((item) => item.match.test(all))
    || (/\b(?:GEM\s*MT|NM[-\s]?MT|EX[-\s]?MT|VG[-\s]?EX)\b/i.test(all) && /(?<![\dA-Z])\d{8,9}(?![\dA-Z])/i.test(all) ? GRADERS[0] : undefined);
  const grade = findGrade(all);
  const certificationNumber = findCertNumber(all, grader?.key || "");
  const card = findSlabCard(all);
  // Nov 24 2026: a number without its set total ("#199") is searched as "#199" so the
  // match checks the card's own number; Black Star promo numbers get their series.
  const promoSeries = /\bBLACK\s*STAR\b|\bPROMO\b/i.test(all) ? (all.match(/\b(SVP|SV|SWSH|SM|XY|BW)\b(?=[^\n]*\b(?:BLACK\s*STAR|PROMO)\b)/i)?.[1] || "").toUpperCase() : "";
  const searchNumber = !card.number ? ""
    : /\//.test(card.number) || /^[A-Z]/.test(card.number) ? card.number
      : promoSeries ? (promoSeries === "SV" ? "SVP" : promoSeries) + card.number
        : "#" + card.number;
  const query = [card.name, searchNumber].filter(Boolean).join(" ").slice(0, 180);
  const found = [grader, grade, certificationNumber, card.name || card.number].filter(Boolean).length;
  return {
    gradingCompany: grader?.label || "",
    grade,
    certificationNumber,
    name: card.name,
    number: card.number,
    query,
    certainty: found >= 3 ? "most" : found ? "some" : "none",
    text: all.trim(),
  };
}

// --- A slab shown to the card camera (Nov 27 2026, owner's slab photos) ---------------
// "Scan several cards" reads whatever it is shown as a card. A slab held up to it puts the
// grading label where a card's name bar would be, so the label is what gets read there
// ("ILLUSTRATION RARE" for a PSA 9 Palafin ex). These rules tell a label from a card's own
// text and take what the label says. A raw card must never come out graded, so a label
// needs a grader named on it, or PSA's own wording, and a grade or a certificate number.

// Grader names that a raw card's own text never has. TAG and ACE only with "grading":
// "TAG TEAM" and "ACE SPEC" are printed on cards.
const LABEL_GRADERS = Object.freeze([
  ["PSA", /\bPSA\b|PROFESSIONAL\s*SPORTS\s*AUTHENTICATOR/i],
  ["CGC", /\bCGC\b|CERTIFIED\s*GUARANTY/i],
  ["BGS", /\bBGS\b|\bBECKETT\b/i],
  ["SGC", /\bSGC\b/],
  ["TAG", /\bTAG\s*GRADING\b/i],
  ["ACE", /\bACE\s*GRADING\b/i],
]);
// PSA's first label line, "2025 POKEMON PRE EN", in capitals. A card's copyright line
// reads "©2025 Pokémon": the sign before the year and the small letters rule it out.
const PSA_TOP_LINE = /(?:^|[ \t#])(?:19|20)\d{2}[ \t]+POKEMON\b/m;
// Grade words only PSA prints in short ("GEM MT"; Beckett and CGC write "GEM MINT").
const PSA_ONLY_WORDING = /\bGEM\s*-?\s*MT\b/;
const GRADE_WORDING = /\bGEM\s*-?\s*MT\b|\bNM\s*-\s*MT\b|\bEX\s*-\s*MT\b|\bVG\s*-\s*EX\b/;
// PSA puts the grade's word and its number on two lines ("MINT" over "9"); when only the
// word was read, the word says the grade.
const PSA_GRADE_WORDS = Object.freeze([[/\bGEM\s*-?\s*MT\b/, "10"], [/\bNM\s*-\s*MT\b/, "8"], [/\bEX\s*-\s*MT\b/, "6"], [/\bVG\s*-\s*EX\b/, "4"], [/\bMINT\b/, "9"]]);
// Label lines that are not the card's name, and the words around a name on its line.
const NOT_A_NAME_LINE = /CERTIFIED|GUARANTY|PROFESSIONAL|AUTHENTICATOR|BECKETT|GRADING|COLLECTIBLES|POK[EÉ]MON|\bPROMO\b/i;
const LABEL_WORDS = /\b(?:GEM\s*-?\s*(?:MT|MINT)|NM\s*-?\s*MT\s*\+?|EX\s*-?\s*MT|VG\s*-?\s*EX|MINT\s*\+?|PRISTINE|BLACK\s*LABEL|AUTHENTIC|(?:SPECIAL\s*)?ILLUSTRATION\s*RARE|(?:ULTRA|HYPER|SECRET|DOUBLE|CHARACTER|RAINBOW|SHINY|ART)\s*RARE|FULL\s*ART|ALT(?:ERNATE)?\.?\s*ART|REV(?:ERSE)?\.?\s*(?:HOLO|FOIL)|HOLO(?:FOIL)?|1ST\s*EDITION|SHADOWLESS|JAPANESE|ENGLISH)\b/gi;

/** The card's name on a label: the first label line whose words are a printed card name. */
export function findSlabCardName(text = "", nameIndex = null) {
  if (!nameIndex) return "";
  for (const line of linesOf(text)) {
    if (NOT_A_NAME_LINE.test(line)) continue;
    const words = line
      .replace(/#\s?[A-Z]{0,4}\d{1,3}[a-z]?\b/gi, " ")
      .replace(/\s[-–]\s.*$/, " ") // "Dark Phantasma - 077/071": the set and number after a dash
      .replace(LABEL_WORDS, " ")
      .replace(/[^A-Za-zÀ-ž' .-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (words.replace(/[^A-Za-zÀ-ž]/g, "").length < 4) continue;
    const name = snapCardName(words, nameIndex);
    if (name && !isGenericCardWord(name) && name.replace(/[^A-Za-zÀ-ž]/g, "").length >= 4) return name;
  }
  return "";
}

/** The label's card number as the scanner searches it: "151", "077/071", or "SVP051" for a promo. */
function labelCardNumber(all) {
  const { number } = findSlabCard(all);
  if (!number || /\//.test(number) || /^[A-Z]/.test(number)) return number;
  const series = /\bBLACK\s*STAR\b|\bPROMO\b/i.test(all) ? (all.match(/\b(SVP|SV|SWSH|SM|XY|BW)\b(?=[^\n]*\b(?:BLACK\s*STAR|PROMO)\b)/i)?.[1] || "").toUpperCase() : "";
  return series ? (series === "SV" ? "SVP" : series) + number : number;
}

/**
 * A grading label in text the card reader took from the top of a picture, or null when it
 * is not clearly one. Returns { gradingCompany, grade, certificationNumber, name, number };
 * gradingCompany is one of the scan rows' companies (PSA, CGC, BGS, SGC, TAG, ACE) or "".
 * nameIndex: the printed card names (cardNameSnap), so the name line is read as a real name.
 */
export function findSlabInCardText(text = "", { nameIndex = null } = {}) {
  const all = clean(text);
  if (!all.trim()) return null;
  const named = LABEL_GRADERS.find(([, pattern]) => pattern.test(all))?.[0] || "";
  const psaLine = PSA_TOP_LINE.test(all);
  const wording = GRADE_WORDING.test(all);
  const company = named || (psaLine || PSA_ONLY_WORDING.test(all) ? "PSA" : "");
  const certificationNumber = findCertNumber(all, company);
  let grade = findGrade(all);
  if (!grade && company === "PSA") grade = PSA_GRADE_WORDS.find(([pattern]) => pattern.test(all))?.[1] || "";
  const isLabel = named ? Boolean(grade || certificationNumber)
    : wording ? Boolean(grade || certificationNumber || psaLine)
      : psaLine && Boolean(certificationNumber && grade);
  if (!isLabel) return null;
  return { gradingCompany: company, grade, certificationNumber, name: findSlabCardName(all, nameIndex), number: labelCardNumber(all) };
}
