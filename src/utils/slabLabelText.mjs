// Graded slab labels (Nov 17 2026, owner: "scan slabs").
// Reads the grading company, grade, certification number and the card's name
// and number from the text on a slab label (PSA, CGC, Beckett/BGS, SGC, TAG,
// ACE, AGS, GMA). Pure. The person confirms every value before saving; the
// cert number can be checked on the grader's own site.
import { findCardNumbers } from "./cardPhotoText.mjs";

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
        .replace(/\b(?:POKEMON|POKÉMON|JAPANESE|ENGLISH|HOLO|REV(?:ERSE)?\.?\s*(?:HOLO|FOIL)?|1ST\s*EDITION|SHADOWLESS|PROMO|FULL\s*ART|SECRET|GEM\s*MT|MINT|NM[-\s]?MT|PRISTINE|BLACK\s*LABEL|PSA|CGC|BGS|SGC|TAG|CERT\w*)\b/gi, " ")
        .replace(/[^A-Za-zÀ-ž' .-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
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
  const grader = GRADERS.find((item) => item.match.test(all));
  const grade = findGrade(all);
  const certificationNumber = findCertNumber(all, grader?.key || "");
  const card = findSlabCard(all);
  const query = [card.name, card.number].filter(Boolean).join(" ").slice(0, 180);
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
