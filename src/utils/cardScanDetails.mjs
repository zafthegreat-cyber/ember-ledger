// Condition, printing and grading on a scanned card (Nov 27 2026, owner: "Make changing
// the condition or marking it as a graded or changing the type (holo, reverse holo) if
// needed very simple"). Pure rules for the one-tap buttons on each row of Scan cards and
// for what Save stores, so both are tested.
import { COMMON_FINISHES, SPECIAL_PRINTINGS, combinePrinting, printingChoices, printingLabel } from "./cardPrintings.mjs";
import { buildLegacyGradingUpdate } from "./legacyGradingMetadata.mjs";

const tidy = (value) => (typeof value === "string" || typeof value === "number" ? String(value).trim() : "");

export const CARD_SCAN_CONDITIONS = Object.freeze(["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"]);
export const CARD_SCAN_GRADERS = Object.freeze(["PSA", "CGC", "BGS", "SGC", "TAG", "ACE"]);
export const CARD_SCAN_GRADES = Object.freeze(["10", "9.5", "9", "8.5", "8", "7", "6", "5"]);

/** What Save uses when no condition was picked (as before these buttons). */
export const CARD_SCAN_DEFAULT_CONDITION = "Near Mint";

const CONDITION_WORDS = {
  nm: "Near Mint", "near mint": "Near Mint", mint: "Near Mint",
  lp: "Lightly Played", "lightly played": "Lightly Played",
  mp: "Moderately Played", "moderately played": "Moderately Played", played: "Moderately Played",
  hp: "Heavily Played", "heavily played": "Heavily Played",
  dmg: "Damaged", damaged: "Damaged",
};

/** The row's condition as one of the buttons' names (typed words and short forms included). */
export function cardScanCondition(row = {}) {
  const typed = tidy(row.condition);
  if (!typed) return CARD_SCAN_DEFAULT_CONDITION;
  return CONDITION_WORDS[typed.toLowerCase()] || typed;
}

const specialName = (item) => item.label.replace(/ \(.*\)$/, "");

/** The chosen printing, tidied; "" when none was chosen (Save then stores no printing, as before). */
export function cardScanPrinting(row = {}) {
  const value = tidy(row.variant);
  // A special printing is kept as written ("Reverse Holo · Trick or Treat"), not re-capitalised.
  return cardScanPrintingParts(value).special ? value : printingLabel(value);
}

/** Splits a saved printing into its finish (Normal, Holo, Reverse Holo...) and a special printing or stamp. */
export function cardScanPrintingParts(variant = "") {
  const value = tidy(variant);
  const lower = value.toLowerCase();
  const special = SPECIAL_PRINTINGS.find((item) => lower.includes(specialName(item).toLowerCase())) || null;
  let rest = special ? value.replace(new RegExp(specialName(special).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "") : value;
  rest = rest.replace(/[·|,/-]+/g, " ").replace(/\s+/g, " ").trim();
  let finish = printingLabel(rest);
  // Some specials name their own foil.
  if (!finish && special?.key.endsWith("-reverse")) finish = "Reverse Holo";
  if (!finish && (special?.key === "cosmos-holo" || special?.key === "cracked-ice")) finish = "Holo";
  return { finish, special: special?.key || "" };
}

/** The printing after one tap: a finish keeps the special printing, a special keeps the finish. */
export function cardScanPrintingWith(variant = "", { finish, special } = {}) {
  const parts = cardScanPrintingParts(variant);
  const nextFinish = finish === undefined ? parts.finish : finish;
  const nextSpecial = special === undefined ? parts.special : special;
  if (!nextSpecial) return nextFinish;
  return combinePrinting(nextFinish, nextSpecial);
}

/**
 * Finishes offered for a card: its own printings from the catalog first (when the matched
 * card lists them), then Normal, Holo and Reverse Holo.
 */
export function cardScanFinishChoices(product = null) {
  const names = [
    ...(Array.isArray(product?.versions) ? product.versions : []),
    ...(Array.isArray(product?.variants) ? product.variants : []),
  ].map((version) => (typeof version === "string" ? version : version?.variant || version?.variantName || version?.finish || version?.label)).filter(Boolean);
  return printingChoices(names).map((choice) => choice.label);
}

/** Special printings and stamps, by the short names the buttons show. */
export const CARD_SCAN_SPECIAL_PRINTINGS = Object.freeze(SPECIAL_PRINTINGS.map((item) => Object.freeze({ key: item.key, label: specialName(item), hint: item.hint })));

export { COMMON_FINISHES };

/** A row is graded once a company, grade or certificate is set, or it was marked graded. */
export function isCardScanGraded(row = {}) {
  return Boolean(row.graded === true || tidy(row.gradingCompany) || tidy(row.grade) || tidy(row.certificationNumber));
}

/** The grading button's words: "Not graded", "PSA 10", "PSA", "Grade 9" or "Graded". */
export function cardScanGradeLabel(row = {}) {
  if (!isCardScanGraded(row)) return "Not graded";
  const company = tidy(row.gradingCompany);
  const grade = tidy(row.grade);
  if (company && grade) return `${company} ${grade}`;
  if (company) return company;
  if (grade) return `Grade ${grade}`;
  return "Graded";
}

/** Marks a row graded by a company, or clears every grading detail when company is "". */
export function cardScanGradingPatch(row = {}, company) {
  const name = tidy(company);
  if (!name) return { graded: false, gradingCompany: "", grade: "", certificationNumber: "" };
  return { graded: true, gradingCompany: name };
}

/** One text that says whether two rows hold the same kind of copy. */
export function cardScanDetailsKey(row = {}) {
  const graded = isCardScanGraded(row);
  return [
    graded ? "" : cardScanCondition(row).toLowerCase(),
    cardScanPrinting(row).toLowerCase(),
    graded ? ["graded", tidy(row.gradingCompany).toLowerCase(), tidy(row.grade).toLowerCase(), tidy(row.certificationNumber).toLowerCase()].join(":") : "raw",
  ].join("|");
}

/**
 * Sets one detail on every row ("Use Reverse Holo for every card"). Only condition and
 * printing: a grade belongs to one slab. Rows already set that way are left as they are.
 */
export function applyCardScanDetailToAll(rows = [], field, value) {
  const list = Array.isArray(rows) ? rows : [];
  if (field === "condition") {
    return list.map((row) => (isCardScanGraded(row) || cardScanCondition(row) === value ? row : { ...row, condition: value }));
  }
  if (field === "variant") {
    const wanted = cardScanPrinting({ variant: value });
    return list.map((row) => (cardScanPrinting(row) === wanted ? row : { ...row, variant: value }));
  }
  return list;
}

/** How many other rows a "for every card" tap would change. */
export function cardScanRowsToChange(rows = [], rowId, field, value) {
  const changed = applyCardScanDetailToAll(rows, field, value);
  return changed.filter((row, index) => row !== (Array.isArray(rows) ? rows : [])[index] && String(row.id) !== String(rowId)).length;
}

/**
 * What Save stores for a row's copy. The printing goes in both the variant and printing
 * fields: only "printing" reaches the server's inventory row, and "variant" is what the
 * screens read. Grading details are kept in the notes line the app already reads back
 * (readLegacyGradingMetadata), since the inventory table has no grading columns.
 */
export function cardScanSavedDetails(row = {}, notes = "") {
  const printing = cardScanPrinting(row);
  const graded = isCardScanGraded(row);
  const saved = { variant: printing, printing, conditionName: cardScanCondition(row) };
  if (!graded) return saved;
  const grading = { gradingCompany: tidy(row.gradingCompany), grade: tidy(row.grade), certificationNumber: tidy(row.certificationNumber) };
  const { actionNotes } = buildLegacyGradingUpdate({ notes: tidy(notes), grading });
  return { ...saved, graded: true, ...grading, actionNotes };
}
