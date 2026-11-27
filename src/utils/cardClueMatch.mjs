// Picks a card when its printed number could not be read (Nov 26 2026, owner's
// inventory scans: "make it so even the scanner can"). Foil patterns, sleeves, glare
// and scanner jams hide the small number at the bottom of a card, but the rest of
// the card still says which printing it is: the name, the year on the copyright
// line, the HP, the attack names and whatever pieces of the number did come through.
// This weighs those clues against the catalog's printings of the card and picks one
// only when it clearly fits best and nothing read from the card disagrees with it.
// Pure, for tests. The catalog rows and their facts are fetched by cardClueLookup.js.

import {
  catalogCardNameKey, catalogPrintingKey, catalogRowName, catalogRowNumber, catalogRowSet, isSpecialPrintSet,
} from "./catalogResultIdentity.mjs";

const plainText = (value = "") => String(value).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\r/g, "");
const lettersOf = (value = "") => String(value).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
const stripZeros = (value = "") => String(value).toLowerCase().replace(/^([a-z]*)0+(?=\d)/, "$1");

/**
 * What the catalog knows about one card, from its tcg_card_details row:
 * { published: "2021-06-18T00:00:00", facts: [{ name: "HP", value: "150" }, { name: "Attack 1", value: "[2P] Reinforced Punch (60+)..." }] }
 * becomes { year: 2021, hp: 150, attacks: ["Reinforced Punch", "Megaton Fall"] }.
 * A row from the other source has { released: "2011/03/01" } and nothing else: { year: 2011, hp: 0, attacks: [] }.
 */
export function cardFactsFromDetails(row = {}) {
  const list = Array.isArray(row?.facts) ? row.facts.filter((entry) => entry && typeof entry === "object") : [];
  const valueOf = (name) => list.find((entry) => entry.name === name)?.value;
  const attacks = [];
  const addAttack = (name) => {
    const tidy = String(name || "").replace(/\s+/g, " ").trim();
    if (lettersOf(tidy).replace(/ /g, "").length < 4 || tidy.split(" ").length > 4) return;
    if (!attacks.some((known) => known.toLowerCase() === tidy.toLowerCase())) attacks.push(tidy);
  };
  for (const entry of list) {
    if (/^Attack \d$/.test(String(entry.name || ""))) {
      // "[2P] Reinforced Punch (60+)", "C][C][C] Fighting Fist (120+)", "<b>Gentle Slap -- 40</b>"
      addAttack(plainText(entry.value).split("\n")[0].trim().replace(/^(?:\[[^\]]*\]|[A-Z0-9]{1,6}\])+\s*/, "").replace(/\s*(?:\(|--|—|–).*$/, ""));
    } else if (entry.name === "CardText") {
      for (const match of plainText(entry.value).matchAll(/(?:Ability|Pok[eé]-?\s?(?:Power|Body)|Ancient Trait)\s*[—–:-]+\s*([^\n]+)/gi)) addAttack(match[1]);
    }
  }
  // Nov 27 2026: about 120 cards have their details from the other source, which keeps only
  // the set's release date ("2011/03/01" in released) and no HP or attacks. The year alone
  // still rules such a card in or out (a 2011 promo against a card read as 2026).
  const year = Number(String(row?.published || row?.released || "").slice(0, 4));
  return { year: year >= 1996 && year <= 2099 ? year : 0, hp: Number(valueOf("HP")) || 0, attacks };
}

function editsWithin(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length] <= limit;
}

/** True when an attack or ability name is in the text read from the card, allowing one misread letter in a long word. */
export function attackIsInText(attack = "", textLetters = "", textWords = new Set()) {
  const phrase = lettersOf(attack);
  if (phrase.replace(/ /g, "").length < 5) return false;
  if (textLetters.includes(phrase)) return true;
  // A long name broken up by stray spaces ("Mega Pun ch").
  const joined = phrase.replace(/ /g, "");
  if (joined.length >= 8 && textLetters.replace(/ /g, "").includes(joined)) return true;
  const words = phrase.split(" ").filter((word) => word.length >= 3);
  if (!words.length || !words.some((word) => word.length >= 5)) return false;
  return words.every((word) => textWords.has(word) || (word.length >= 6 && [...textWords].some((seen) => editsWithin(word, seen, 1))));
}

const differingPlaces = (a, b) => (a.length === b.length ? [...a].filter((ch, index) => ch !== b[index]).length : Infinity);

/**
 * How well the pieces of a number read from the card fit a catalog number.
 * 8 the whole number; 5 the card's own number with a total one digit off ("185/208"
 * for 185/202) or the number and total run together ("12877198" for 128/198);
 * 4 one digit off in the card's own number, or the total cut short ("73/1" for 73/106);
 * 3 the end of the number with the whole total ("4/102" for 34/102); 2 the total alone.
 */
export function numberPieceScore(cardNumber = "", parts = [], digitRuns = []) {
  const [rawNumber = "", rawTotal = ""] = String(cardNumber || "").toLowerCase().replace(/\s+/g, "").split("/");
  const own = stripZeros(rawNumber), total = stripZeros(rawTotal);
  if (!own) return 0;
  let best = 0;
  for (const part of parts) {
    const [readNumber = "", readTotal = ""] = String(part || "").toLowerCase().replace(/\s+/g, "").split("/");
    const n = stripZeros(readNumber), t = stripZeros(readTotal);
    let points = 0;
    if (n && t && total) {
      if (n === own && t === total) points = 8;
      else if (n === own && n.length >= 2 && differingPlaces(t, total) === 1) points = 5;
      else if (t === total && t.length >= 2 && differingPlaces(n, own) === 1 && own.length >= 2) points = 4;
      else if (n === own && n.length >= 2 && t.length < total.length && total.startsWith(t)) points = 4;
      else if (t === total && t.length >= 2 && n.length < own.length && own.endsWith(n)) points = 3;
      else if (t === total && t.length >= 2) points = 2;
    } else if (t && total) {
      if (t === total && t.length >= 2) points = 2;
    } else if (n && !readTotal) {
      if (n === own && n.length >= 2) points = 2;
    }
    best = Math.max(best, points);
  }
  if (total.length >= 2 && /^\d+$/.test(total)) {
    for (const run of digitRuns) {
      const digits = String(run || "");
      if (total.length >= 3 && digits === rawTotal) best = Math.max(best, 2);
      const joined = rawNumber.length + rawTotal.length;
      if (rawNumber.length >= 2 && digits.length >= joined && digits.length <= joined + 2 && digits.startsWith(rawNumber) && digits.endsWith(rawTotal)) best = Math.max(best, 5);
    }
  }
  return best;
}

// A first print or stamped run of a card that also has a main printing.
const VARIANT_SET = /\(shadowless\)|shadowless|1st edition/i;

/**
 * The catalog card that the clues point to.
 *   read        { name, otherNames, number, clues, text } from the card reader. otherNames are
 *               card names found in the card's text; a card found under one of those needs
 *               an attack name or a number piece to agree, because a card's text also names other cards.
 *   candidates  catalog rows (mapped or raw) for those names
 *   factsById   Map of catalog id -> cardFactsFromDetails()
 * Returns { card, sure, others, why, choices, nameFromText }. card is null when no printing
 * stands out; choices then lists up to four printings that fit equally well.
 * sure is true when a piece of the number agrees, or two different kinds of clue do.
 * A pick resting on one kind alone (only the year, say) is right when the catalog has
 * every printing of the card, and the catalog does not: it is offered, not filed.
 * A printing the catalog has no facts for (a new set) cannot be ruled out by year, HP
 * or attacks, so it stays level with the best fit on those and only a number piece separates them.
 *
 * Nov 26 2026 (dark foil cards whose name bar cannot be read):
 *   species   read.species is the species from the card's Pokédex line. When the name read is
 *             just that species, any card of it is a candidate ("Skitty" also fits "Erika's Skitty").
 *   set       a set code read from the card that is the candidate's own set counts for it; a
 *             code that matches nothing was misread and counts for nothing.
 *   modern    clues.modern (a Pokédex line with "HT:" and "WT:") rules out 1999-2003 printings.
 */
export function pickCardByClues({ name = "", otherNames = [], number = "", clues = {}, text = "", species = "" } = {}, candidates = [], factsById = new Map()) {
  const none = { card: null, sure: false, others: 0, why: [], choices: [], nameFromText: false };
  const mainKey = catalogCardNameKey(name);
  const textKeys = new Set((otherNames || []).map((other) => catalogCardNameKey(other)).filter((key) => key && key !== mainKey));
  const speciesWords = lettersOf(species);
  const bySpecies = Boolean(speciesWords) && (!mainKey || mainKey === catalogCardNameKey(species));
  // A card of several Pokémon ("Togepi & Cleffa & Igglybuff-GX") has no Pokédex line of its own.
  const ofSpecies = (row) => bySpecies && !String(catalogRowName(row)).includes("&") && ` ${lettersOf(catalogRowName(row).replace(/\s*\([^)]*\)/g, ""))} `.includes(` ${speciesWords} `);
  if (!mainKey && !textKeys.size && !bySpecies) return none;
  const setCodes = new Set((clues?.setCodes || []).map((code) => String(code).toUpperCase()));
  const textLetters = lettersOf(text);
  const textWords = new Set(textLetters.split(" ").filter((word) => word.length >= 3));
  const years = (clues?.years || []).map(Number).filter(Boolean);
  const parts = [...(clues?.numberParts || []), ...(String(number).includes("/") ? [number] : [])];
  const digitRuns = clues?.digitRuns || [];

  const byPrinting = new Map();
  for (const row of candidates) {
    if (!row) continue;
    const nameKey = catalogCardNameKey(catalogRowName(row));
    const named = nameKey === mainKey || ofSpecies(row);
    const fromText = !named;
    if (fromText && !textKeys.has(nameKey)) continue;
    if (!String(catalogRowNumber(row) || "").trim()) continue; // sealed products and rows with no number are not cards to pick here
    const facts = factsById.get(String(row.id)) || factsById.get(row.id) || null;
    const key = `${catalogPrintingKey(row)}|${String(catalogRowName(row)).includes("(") ? catalogRowName(row) : ""}`;
    const known = byPrinting.get(key);
    if (!known || (!known.facts && facts)) byPrinting.set(key, { row, facts, fromText });
  }
  if (!byPrinting.size) return none;

  const scoredAll = [...byPrinting.values()].map((entry) => {
    const why = new Set();
    let score = 0, conflicts = 0;
    const numberPoints = numberPieceScore(catalogRowNumber(entry.row), parts, digitRuns);
    if (numberPoints) { score += numberPoints; why.add(numberPoints >= 3 ? "number" : "total"); }
    const facts = entry.facts;
    if (facts?.year) {
      if (years.length) {
        const gap = Math.min(...years.map((year) => Math.abs(year - facts.year)));
        if (gap === 0) { score += 3; why.add("year"); }
        else if (gap >= 2) { score -= 4; conflicts += 1; }
      } else if (clues?.wizards) {
        if (facts.year >= 1999 && facts.year <= 2003) { score += 2; why.add("year"); }
        else { score -= 4; conflicts += 1; }
      } else if (clues?.modern && facts.year <= 2003) { score -= 4; conflicts += 1; }
    }
    const rowCode = String(entry.row.setCode ?? entry.row.set_code ?? "").toUpperCase();
    if (rowCode && setCodes.has(rowCode)) { score += 3; why.add("set"); }
    if (facts?.hp && clues?.hp) {
      if (facts.hp === Number(clues.hp)) { score += 2; why.add("hp"); }
      else { score -= 3; conflicts += 1; }
    }
    const attackHits = (facts?.attacks || []).filter((attack) => attackIsInText(attack, textLetters, textWords)).length;
    if (attackHits) { score += Math.min(2, attackHits) * 3; why.add("attack"); }
    const blind = !facts || (!facts.year && !facts.hp && !(facts.attacks || []).length);
    return { ...entry, score, conflicts, why, numberPoints, blind };
  });
  const bestOther = Math.max(0, ...scoredAll.filter((entry) => !entry.blind && !entry.fromText).map((entry) => entry.score - entry.numberPoints));
  const scored = scoredAll.map((entry) => (entry.blind && !entry.fromText && bestOther > 0 ? { ...entry, score: entry.numberPoints + bestOther } : entry))
    .filter((entry) => !entry.fromText || ((entry.why.has("attack") || entry.why.has("number")) && entry.score >= 5));
  if (!scored.length) return none;

  const top = Math.max(...scored.map((entry) => entry.score));
  if (top < 2) return none;
  // Every printing within two points of the best one still fits about as well.
  const close = scored.filter((entry) => entry.score > top - 2);
  const narrow = (list, keep) => { const kept = list.filter(keep); return kept.length ? kept : list; };
  let list = close;
  // The plain card rather than a variant row, the main set rather than a stamped
  // reprint or first print run: the same order of choices pickScannedCard makes.
  list = narrow(list, (entry) => !String(catalogRowName(entry.row)).includes("("));
  list = narrow(list, (entry) => !isSpecialPrintSet(entry.row));
  list = narrow(list, (entry) => !VARIANT_SET.test(catalogRowSet(entry.row)));
  // Nov 26 2026: a reprint under another number that fits just as well (a trainer-kit copy
  // of a main-set card) is set aside above, but with no piece of the number read it cannot
  // be told from the main-set card, so it is offered beside it instead of being dropped.
  // Only a reprint the catalog has facts for: one it knows nothing about (a World
  // Championship copy with no card details) ties on the benefit of the doubt alone, and
  // stays set aside as before.
  const numberOf = (entry) => String(catalogRowNumber(entry.row) || "").toLowerCase().replace(/\s+/g, "").split("/").map(stripZeros).join("/");
  const listed = new Set(list);
  const listedNumbers = new Set(list.map(numberOf));
  const setAside = close.filter((entry) => !listed.has(entry) && !entry.blind && !entry.conflicts && entry.score >= top && !listedNumbers.has(numberOf(entry)));
  // Cards the catalog has facts for come before ones it knows nothing about.
  const choicesOf = (entries) => [...entries].sort((a, b) => Number(a.blind) - Number(b.blind) || b.score - a.score).slice(0, 4).map((entry) => entry.row);
  // The HP alone, or the set total alone: never a pick, but a few printings that fit equally are worth offering.
  if (top < 3) return { ...none, choices: list.length <= 4 ? choicesOf(list) : [] };
  // Picked only when one printing is left and nothing read from the card disagrees with it.
  if (list.length !== 1 || list[0].conflicts) return { ...none, choices: list.length > 1 ? choicesOf([...list, ...setAside]) : [] };
  const picked = list[0];
  if (setAside.length && !picked.why.has("number")) return { ...none, choices: choicesOf([picked, ...setAside]) };
  const others = new Set(close.filter((entry) => entry !== picked).map((entry) => catalogPrintingKey(entry.row))).size;
  // The year and the set code say the same thing (which set), so together they are one kind.
  const kinds = new Set([...picked.why].map((kind) => (kind === "set" ? "year" : kind)));
  const sure = picked.why.has("number") || kinds.size >= 2;
  return { card: picked.row, sure, others, why: [...picked.why], choices: [], nameFromText: picked.fromText };
}

// "Iono's Kilowattrel - 055/159 (Cosmos Holo) [Staff]" -> "Iono's Kilowattrel"
const plainCardName = (value = "") => String(value).replace(/\s*\([^)]*\)/g, "").replace(/\s*\[[^\]]*\]/g, "").replace(/\s+-\s+.*$/, "").trim();
const sameCardNumber = (a, b) => {
  const tidy = (value) => String(value || "").toLowerCase().replace(/\s+/g, "").split("/").map(stripZeros).join("/");
  return Boolean(tidy(a)) && tidy(a) === tidy(b);
};

/**
 * True when a card's name is in what was read from the card (the name that was read, or
 * the card's text). A long name counts when its letters are there however they were spaced
 * or punctuated ("Iono's Kilowattrel" read as "Ionos Kilowattrel"); a short one ("Lass",
 * "Seel") only as a whole word, because four letters turn up inside other words.
 */
export function nameIsInText(cardName = "", textLetters = "", textWords = new Set()) {
  const letters = lettersOf(plainCardName(cardName));
  const joined = letters.replace(/ /g, "");
  if (joined.length < 3) return false;
  if (joined.length >= 7 && textLetters.replace(/ /g, "").includes(joined)) return true;
  const words = letters.split(" ").filter((word) => word.length >= 3);
  return words.length > 0 && words.every((word) => textWords.has(word) || (word.length >= 6 && [...textWords].some((seen) => editsWithin(word, seen, 1))));
}

/**
 * The catalog card for a number that was read in full when the name was not (Nov 27 2026).
 * Measured on camera pictures of the owner's scanned cards: in about 7 of 100 reads the
 * number is right and the name is wrong. Trainer cards, whose name sits elsewhere; "Iono's"
 * read as "Ionos"; the "Evolves from" name taken for the card's own. A printed number
 * belongs to very few cards (055/159 is Iono's Kilowattrel and one Zeraora), so the number
 * finds the card and the rest of what was read says which of them it is.
 *   read        { name, number, clues, text } from the card reader
 *   candidates  catalog rows with that number (other rows are ignored)
 *   factsById   Map of catalog id -> cardFactsFromDetails()
 * Returns { card, sure, others, why, choices }. sure is true when the card's name is in
 * what was read, or two different kinds of clue agree. A card that is the only one with the
 * number, with nothing else to go on, is offered as a choice and not filed.
 */
export function pickCardByNumber({ name = "", number = "", clues = {}, text = "" } = {}, candidates = [], factsById = new Map()) {
  const none = { card: null, sure: false, others: 0, why: [], choices: [] };
  if (!String(number || "").trim()) return none;
  const textLetters = lettersOf(`${name}\n${text}`);
  const textWords = new Set(textLetters.split(" ").filter((word) => word.length >= 3));
  const years = (clues?.years || []).map(Number).filter(Boolean);

  const byPrinting = new Map();
  for (const row of candidates) {
    if (!row || !sameCardNumber(catalogRowNumber(row), number)) continue;
    const facts = factsById.get(String(row.id)) || factsById.get(row.id) || null;
    const key = `${catalogPrintingKey(row)}|${String(catalogRowName(row)).includes("(") ? catalogRowName(row) : ""}`;
    const known = byPrinting.get(key);
    if (!known || (!known.facts && facts)) byPrinting.set(key, { row, facts });
  }
  if (!byPrinting.size) return none;

  const scored = [...byPrinting.values()].map((entry) => {
    const why = new Set();
    let score = 0, conflicts = 0;
    if (nameIsInText(catalogRowName(entry.row), textLetters, textWords)) { score += 5; why.add("name"); }
    const facts = entry.facts;
    if (facts?.year) {
      if (years.length) {
        const gap = Math.min(...years.map((year) => Math.abs(year - facts.year)));
        if (gap === 0) { score += 3; why.add("year"); }
        else if (gap >= 2) { score -= 4; conflicts += 1; }
      } else if (clues?.wizards) {
        if (facts.year >= 1999 && facts.year <= 2003) { score += 2; why.add("year"); }
        else { score -= 4; conflicts += 1; }
      }
    }
    if (facts?.hp && clues?.hp) {
      if (facts.hp === Number(clues.hp)) { score += 2; why.add("hp"); }
      else { score -= 3; conflicts += 1; }
    }
    const attackHits = (facts?.attacks || []).filter((attack) => attackIsInText(attack, textLetters, textWords)).length;
    if (attackHits) { score += Math.min(2, attackHits) * 3; why.add("attack"); }
    return { ...entry, score, conflicts, why };
  });

  const narrow = (list, keep) => { const kept = list.filter(keep); return kept.length ? kept : list; };
  // The plain card rather than a variant row, the main set rather than a stamped reprint.
  const mainPrintings = (list) => {
    let kept = narrow(list, (entry) => !String(catalogRowName(entry.row)).includes("("));
    kept = narrow(kept, (entry) => !isSpecialPrintSet(entry.row));
    return narrow(kept, (entry) => !VARIANT_SET.test(catalogRowSet(entry.row)));
  };
  // Different cards that share the number: 055/159 is two cards, each with reprint rows of its own.
  const cardsWithNumber = new Set(scored.map((entry) => catalogCardNameKey(plainCardName(catalogRowName(entry.row))))).size;
  const top = Math.max(...scored.map((entry) => entry.score));
  if (top < 2) {
    // Nothing read says which card it is. When the number belongs to one card only, that card is offered.
    const only = mainPrintings(scored);
    return cardsWithNumber === 1 && only.length ? { ...none, choices: [only[0].row] } : none;
  }
  const list = mainPrintings(scored.filter((entry) => entry.score > top - 2));
  const choices = [...list].sort((a, b) => b.score - a.score).slice(0, 4).map((entry) => entry.row);
  if (list.length !== 1) return { ...none, choices };
  const picked = list[0];
  // Something read disagrees (an HP misread, say): offered, not filed.
  if (picked.conflicts) return { ...none, choices: [picked.row] };
  const others = new Set(scored.filter((entry) => entry !== picked && entry.score > top - 2).map((entry) => catalogPrintingKey(entry.row))).size;
  const sure = picked.why.has("name") || picked.why.size >= 2;
  return { card: picked.row, sure, others, why: [...picked.why], choices: [] };
}

/**
 * The clue match for one scanned row: which catalog rows to fetch, and what to make of them.
 *   row         the scan list's row: cardName, cardNumber, setName (typed by the person), scanClues, scanText
 *   fetchCards  ({ names, species, setCodes }) => Promise<{ rows, facts }>
 *   mapCard     turns a catalog row into the app's card
 * Returns { card, others, byClues, choices }. card is set only for a sure pick; an unsure one
 * is the single entry of choices.
 *
 * Two ways in: the name read from the card with the names found in its text, and (Nov 26
 * 2026, dark foil cards) the species from the Pokédex line when the name read is just that
 * species or missing. A card whose number was read and whose name was not is pickCardByNumber's.
 */
export async function matchScanRowByClues(row = {}, { fetchCards, mapCard = (card) => card } = {}) {
  const none = { card: null, others: 0, byClues: false, choices: [] };
  const clues = row?.scanClues;
  if (!clues || typeof clues !== "object" || typeof fetchCards !== "function") return none;
  const name = String(row.cardName || "").trim();
  const number = String(row.cardNumber || "").trim();
  const species = String(clues.species || "").trim();
  const bySpecies = Boolean(species) && (!name || name.toLowerCase() === species.toLowerCase());
  const names = [name, ...(Array.isArray(clues.namesInText) ? clues.namesInText : [])].filter(Boolean);
  if (!names.length && !bySpecies) return none;
  const typedSet = String(row.setName || "").trim().toLowerCase();
  const { rows, facts } = await fetchCards({ names, species: bySpecies ? species : "", setCodes: clues.setCodes || [] });
  const factsById = new Map((facts || []).map((detail) => [String(detail.catalog_product_id), cardFactsFromDetails(detail)]));
  const cards = (rows || []).map(mapCard).filter((card) => !typedSet || String(card.setName || card.set_name || card.expansion || "").toLowerCase().includes(typedSet));
  const picked = pickCardByClues({ name, otherNames: clues.namesInText, number, clues, text: row.scanText, species: bySpecies ? species : "" }, cards, factsById);
  // A pick resting on one kind of clue alone is offered as a choice, not filed.
  if (picked.card && !picked.sure) return { ...none, choices: [picked.card] };
  return { card: picked.card, others: picked.others, byClues: Boolean(picked.card), choices: picked.choices || [] };
}
