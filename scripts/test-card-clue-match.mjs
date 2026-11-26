// Picking a card when its printed number could not be read (Nov 26 2026, owner's
// inventory scans). The catalog rows and facts below are the real ones for the
// cards that could not be matched by number: reverse holo cards whose foil pattern
// hid the number, a Base Set card with tiny print, and a scan that jammed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { attackIsInText, cardFactsFromDetails, numberPieceScore, pickCardByClues } from "../src/utils/cardClueMatch.mjs";
import { createNameIndex, snapCardName, trimToCardName } from "../src/utils/cardNameSnap.mjs";
import { findCardClues, isGenericCardWord, parseCardPhotoText } from "../src/utils/cardPhotoText.mjs";
import { findUnsmearedSpan } from "../src/utils/cardPhotoReader.mjs";

const names = JSON.parse(readFileSync(new URL("../src/data/generated/cardNames.json", import.meta.url), "utf8"));
const index = createNameIndex(names);

// name | set | number | year | hp | attacks
const CATALOG = `
Golurk|Noble Victories|72/101|2011|130|Hammer Arm;Hurricane Punch
Golurk|Dragons Exalted|59/124|2012|130|Devolution Punch;Ghost Hammer
Golurk|Plasma Blast|46/101|2013|130|Iron Fist of Justice;Shadow Punch
Golurk|SM - Cosmic Eclipse|90/236|2019|140|Rock Tumble;Ancient Fist
Golurk|SWSH03: Darkness Ablaze|077/189|2020|150|Dynamic Chop;Golurk Hammer
Golurk|SWSH06: Chilling Reign|066/198|2021|150|Reinforced Punch;Megaton Fall
Golurk|SWSH09: Brilliant Stars|083/172|2022|150|Big Hand;Mega Punch
Golurk|SV: Black Bolt|043/086|2025|160|Double Smash;Golurk Hammer
Golurk (Master Ball Pattern)|SV: Black Bolt|043/086|2025|160|Double Smash;Golurk Hammer
Golurk - 46/101 (BW Plasma Blast)|Deck Exclusives|046/101|2016|130|Iron Fist of Justice;Shadow Punch
Golurk V|SWSH07: Evolving Skies|070/203|2021|220|Mega Punch;Rewind Beam
Sliggoo|XY - Flashfire|73/106|2014|80|Gooey;Gentle Slap
Sliggoo|XY - Phantom Forces|76/119|2014|80|Gooey;Gentle Slap
Sliggoo|XY - Ancient Origins|59/98|2015|70|Bubble;Melt
Sliggoo|SWSH08: Fusion Strike|196/264|2021|80|Melt;Body Slam
Vitality Band|SWSH01: Sword & Shield Base Set|185/202|2020|0|
Vitality Band|SV01: Scarlet & Violet Base Set|197/198|2023|0|
Greedent|SWSH02: Rebel Clash|152/192|2020|120|Greedy Tail;Tail Smack
Greedent|Shining Fates: Shiny Vault|SV100/SV122|2021|120|Greedy Tail;Tail Smack
Greedent|SWSH06: Chilling Reign|128/198|2021|120|Brazen Tail;Gnaw
Greedent|SWSH11: Lost Origin|151/196|2022|130|Collect;Spill out
Galarian Slowpoke|SWSH05: Battle Styles|054/163|2021|70|Tantalizing
Galarian Slowpoke|SWSH06: Chilling Reign|054/198|2021|70|Sharpness;Headbutt
Hatterene|SWSH02: Rebel Clash|085/192|2020|150|Mind Hat;Dripping Grudge
Hatterene|Shining Fates: Shiny Vault|SV056/SV122|2021|150|Mind Hat;Dripping Grudge
Hatterene|SWSH06: Chilling Reign|073/198|2021|130|Witch Rondo;Psychic
Hatterene|Trick or Trade BOOster Bundle|073/198|2022|130|Witch Rondo;Psychic
Zangoose|SM - Cosmic Eclipse|173/236|2019|100|Corkscrew Punch;Brutal Edge
Zangoose|SWSH06: Chilling Reign|120/198|2021|110|Gale Claws
Zangoose|SV08: Surging Sparks|149/191|2024|90|Fury Cutter
Machoke|Base Set|034/102|1999|80|Karate Chop;Submission
Machoke|Base Set (Shadowless)|034/102|1999|80|Karate Chop;Submission
Machoke|Base Set 2|049/130|2000|80|Karate Chop;Submission
Machoke|Legendary Collection|051/110|2002|80|Karate Chop;Submission
Machoke|Expedition|085/165|2002|80|Punch;Mega Kick
Machoke|XY - Evolutions|58/108|2016|90|Karate Chop;Submission
Abomasnow|SWSH02: Rebel Clash|013/192|2020|140|Soothing Scent;Megaton Lariat
Abomasnow|SWSH06: Chilling Reign|010/198|2021|140|Toughness Boost;Mega Punch
Abomasnow|SWSH10: Astral Radiance Trainer Gallery|TG01/TG30|2022|140|Toughness Boost;Mega Punch
Abomasnow|SWSH11: Lost Origin|043/196|2022|140|Icicle Punch;Double-Edge
Snover|SWSH06: Chilling Reign|009/198|2021|80|Whap Down
Shuppet|SWSH06: Chilling Reign|062/198|2021|50|Will-O-Wisp
Shuppet|ME: Ascended Heroes|090/217|2026|60|Spooky Shot
Shuppet|ME05: Pitch Black|033/084|0|0|
`.trim().split("\n").map((line, at) => {
  const [name, setName, cardNumber, year, hp, attacks] = line.split("|");
  return { row: { id: `card-${at}`, name, setName, cardNumber }, facts: { year: Number(year), hp: Number(hp), attacks: attacks ? attacks.split(";") : [] } };
});
const rows = CATALOG.map((entry) => entry.row);
const factsById = new Map(CATALOG.map((entry) => [entry.row.id, entry.facts]));
const pick = (read) => pickCardByClues(read, rows, factsById);
const labelOf = (result) => (result.card ? `${result.card.setName} ${result.card.cardNumber}` : "");

test("card facts come out of the catalog's detail row", () => {
  const facts = cardFactsFromDetails({
    published: "2021-06-18T00:00:00",
    facts: [
      { name: "HP", value: "140" },
      { name: "CardText", value: "<strong>Ability — Toughness Boost</strong>\r\n<br>Your Single Strike Pokemon in play, except any Abomasnow, get +50 HP." },
      { name: "Attack 1", value: "[2G] Mega Punch (90)" },
    ],
  });
  assert.deepEqual(facts, { year: 2021, hp: 140, attacks: ["Toughness Boost", "Mega Punch"] });
  const attacksOf = (...values) => cardFactsFromDetails({ facts: values.map((value, at) => ({ name: `Attack ${at + 1}`, value })) }).attacks;
  assert.deepEqual(attacksOf("[2P] Reinforced Punch (60+)\r\n<br>If this Pokemon has a Pokemon Tool attached", "[2PP] Megaton Fall (190)"), ["Reinforced Punch", "Megaton Fall"]);
  assert.deepEqual(attacksOf("<b>Gooey</b>\r\n<br>Heal 30 damage from this Pokémon.", "<b>Gentle Slap -- 40</b>"), ["Gooey", "Gentle Slap"]);
  assert.deepEqual(attacksOf("C][C][C][C] Fighting Fist (120+) \nIf your opponent’s Active", "[1] Focus Energy\r\n<br>During your next turn"), ["Fighting Fist", "Focus Energy"]);
  assert.deepEqual(cardFactsFromDetails({}), { year: 0, hp: 0, attacks: [] });
  assert.deepEqual(cardFactsFromDetails({ published: null, facts: null }), { year: 0, hp: 0, attacks: [] });
});

test("pieces of a number are weighed against a catalog number", () => {
  assert.equal(numberPieceScore("066/198", ["66/198"]), 8, "the whole number, leading zeros aside");
  assert.equal(numberPieceScore("185/202", ["185/208"]), 5, "total one digit off");
  assert.equal(numberPieceScore("128/198", [], ["12877198"]), 5, "number and total run together, slash misread");
  assert.equal(numberPieceScore("73/106", ["73/1"]), 4, "total cut short");
  assert.equal(numberPieceScore("034/102", ["4/102"]), 3, "end of the number with the whole total");
  assert.equal(numberPieceScore("054/198", [], ["198"]), 2, "the total alone");
  assert.equal(numberPieceScore("054/163", [], ["198"]), 0);
  assert.equal(numberPieceScore("76/119", ["73/1"]), 0, "a different card's number");
  assert.equal(numberPieceScore("197/198", ["185/208"]), 0);
  assert.equal(numberPieceScore("", ["12/34"]), 0);
});

test("an attack name is found in the text read from the card", () => {
  const words = (text) => new Set(text.split(" "));
  const inText = (attack, text) => attackIsInText(attack, text, words(text));
  assert.equal(inText("Mega Punch", "ability toughness boost mega punch"), true);
  assert.equal(inText("Mega Punch", "le strike mega pun ch"), true, "broken up by stray spaces");
  assert.equal(inText("Toughness Boost", "oughnesg boost ore than toughnes ss boose"), true, "one letter off in a long word");
  assert.equal(inText("Reinforced Punch", "this pokemon also does damage megaton fall"), false);
  assert.equal(inText("Bite", "a bitter rival"), false, "too short to trust");
});

test("the year alone settles a card printed once that year", () => {
  const golurk = pick({ name: "Golurk", clues: { years: [2021], evolvesFrom: "Golett" } });
  assert.equal(labelOf(golurk), "SWSH06: Chilling Reign 066/198");
  assert.deepEqual(golurk.why, ["year"]);
  assert.equal(labelOf(pick({ name: "Zangoose", clues: { years: [2021], hp: 110 } })), "SWSH06: Chilling Reign 120/198");
});

test("one kind of clue alone is offered, not filed; two kinds or a number piece are sure", () => {
  assert.equal(pick({ name: "Golurk", clues: { years: [2021] } }).sure, false, "the year alone: right only if the catalog has every printing");
  assert.equal(pick({ name: "Zangoose", clues: { years: [2021], hp: 110 } }).sure, true);
  assert.equal(pick({ name: "Sliggoo", clues: { numberParts: ["73/1"] } }).sure, true);
  assert.equal(pick({ name: "Golurk", clues: { years: [2021] }, text: "reinforced punch megaton fall" }).sure, true);
});

test("a printing the catalog knows nothing about cannot be ruled out by year or HP", () => {
  // Pitch Black's Shuppet has no facts yet. A 2026 Shuppet could be that one or Ascended Heroes'.
  const unsure = pick({ name: "Shuppet", clues: { years: [2026], hp: 60 } });
  assert.equal(unsure.card, null);
  assert.deepEqual(unsure.choices.map((card) => card.cardNumber).sort(), ["033/084", "090/217"]);
  assert.equal(labelOf(pick({ name: "Shuppet", clues: { years: [2026], hp: 60, numberParts: ["90/217"] } })), "ME: Ascended Heroes 090/217");
  assert.equal(labelOf(pick({ name: "Shuppet", clues: { numberParts: ["33/084"] } })), "ME05: Pitch Black 033/084", "a number piece still finds it");
  // A 2021 Shuppet with the set total read: the unknown printing's total does not fit.
  assert.equal(labelOf(pick({ name: "Shuppet", clues: { years: [2021], hp: 50, digitRuns: ["198"] } })), "SWSH06: Chilling Reign 062/198");
});

test("a card with the same name but another kind is never picked", () => {
  // Only "Golurk V" came out in 2021 besides Chilling Reign's Golurk; it is a different card.
  const result = pickCardByClues({ name: "Golurk", clues: { years: [2021] } }, rows.filter((row) => row.setName !== "SWSH06: Chilling Reign"), factsById);
  assert.equal(result.card, null);
});

test("a piece of the number settles it", () => {
  assert.equal(labelOf(pick({ name: "Sliggoo", clues: { numberParts: ["73/1", "/80"] } })), "XY - Flashfire 73/106");
  const band = pick({ name: "Vitality Band", number: "185/208", clues: { years: [2020], numberParts: ["185/208"] } });
  assert.equal(labelOf(band), "SWSH01: Sword & Shield Base Set 185/202");
  // "128/198" seen upside down in the turned-around read, turned back by the clue finder.
  const clues = findCardClues("©2021 Pokémon / Nintendo", { numberStripText: "E ie 12877198 %", turnedText: "x 861/821 oN" });
  assert.deepEqual(clues.numberParts, ["128/198"]);
  assert.equal(labelOf(pick({ name: "Greedent", clues })), "SWSH06: Chilling Reign 128/198");
});

test("two printings in one year need something more: the total, the HP or an attack", () => {
  assert.equal(pick({ name: "Galarian Slowpoke", clues: { years: [2021], hp: 70 } }).card, null);
  assert.deepEqual(pick({ name: "Galarian Slowpoke", clues: { years: [2021], hp: 70 } }).choices.map((card) => card.cardNumber), ["054/163", "054/198"]);
  assert.equal(labelOf(pick({ name: "Galarian Slowpoke", clues: { years: [2021], hp: 70, digitRuns: ["198"] } })), "SWSH06: Chilling Reign 054/198");
  assert.equal(pick({ name: "Hatterene", clues: { years: [2021] } }).card, null);
  assert.equal(labelOf(pick({ name: "Hatterene", clues: { years: [2021], hp: 130 } })), "SWSH06: Chilling Reign 073/198");
  assert.equal(labelOf(pick({ name: "Hatterene", clues: { years: [2021] }, text: "ability witch rondo once during your turn" })), "SWSH06: Chilling Reign 073/198");
});

test("a stamped reprint is left out, and counted as another printing", () => {
  const result = pick({ name: "Hatterene", clues: { hp: 130 }, text: "ability witch rondo once during your turn" });
  assert.equal(labelOf(result), "SWSH06: Chilling Reign 073/198");
  assert.equal(result.others, 1, "the Trick or Trade copy");
});

test("nothing is picked when what was read disagrees with the card", () => {
  assert.equal(pick({ name: "Zangoose", clues: { years: [2021], hp: 70 } }).card, null, "HP does not fit");
  assert.equal(pick({ name: "Zangoose", clues: { years: [2017] } }).card, null, "no Zangoose that year");
  assert.equal(pick({ name: "Zangoose", clues: {} }).card, null, "no clues at all");
  assert.equal(pick({ name: "", clues: { years: [2021] } }).card, null);
  assert.equal(pick({ name: "Missingno", clues: { years: [2021] } }).card, null);
});

test("an old card: the first print run is set aside, and the year picks between reprints", () => {
  const text = "evolves from machop karate chop does damage minus submission machoke does damage to itself";
  const unsure = pick({ name: "Machoke", clues: { wizards: true, hp: 80 }, text });
  assert.equal(unsure.card, null, "Base Set, Base Set 2 and Legendary Collection print the same card");
  assert.deepEqual(unsure.choices.map((card) => card.setName), ["Base Set", "Base Set 2", "Legendary Collection"]);
  assert.equal(labelOf(pick({ name: "Machoke", clues: { years: [1999], hp: 80 }, text })), "Base Set 034/102");
  assert.equal(labelOf(pick({ name: "Machoke", clues: { wizards: true, hp: 80, numberParts: ["4/102"] }, text })), "Base Set 034/102");
});

test("a name found only in the card's text needs an attack or number to agree", () => {
  const text = "le strike pokem toughness boost xcept any abomasnow mega punch";
  // The same card was printed again a year later with new art: without the year both fit.
  const unsure = pick({ name: "Isoog", otherNames: ["Abomasnow"], clues: {}, text });
  assert.equal(unsure.card, null);
  assert.deepEqual(unsure.choices.map((card) => card.cardNumber), ["010/198", "TG01/TG30"]);
  const jammed = pick({ name: "Isoog", otherNames: ["Abomasnow"], clues: { years: [2021] }, text });
  assert.equal(labelOf(jammed), "SWSH06: Chilling Reign 010/198");
  assert.equal(jammed.nameFromText, true);
  // "Evolves from Snover" names another card; with nothing else agreeing it is not picked.
  assert.equal(pick({ name: "Isoog", otherNames: ["Snover"], clues: { years: [2021] }, text: "evolves from snover" }).card, null);
  assert.equal(pick({ name: "Isoog", otherNames: ["Abomasnow"], clues: { years: [2021] }, text: "" }).card, null);
});

test("stray letters after a name do not hide it", () => {
  assert.equal(snapCardName("Greedentxk", index), "Greedent", "as close to Greedent ex and Greedent V: the shared start wins");
  assert.equal(snapCardName("Greedenty IA", index), "Greedent");
  assert.equal(trimToCardName("Greedenty IA", index), "Greedent");
  assert.equal(trimToCardName("Mewab", index), "", "short names are not trimmed to");
  assert.equal(snapCardName("Greedent ex", index), "Greedent ex");
  assert.equal(snapCardName("Charizarb ex", index), "Charizard ex");
  const read = parseCardPhotoText({ nameIndex: index, nameText: " Greedentxk | ~_| 4120 *", extraNameTexts: ["Greedenty IA] 4120 x", "STAGE ]   Gre"], fullText: "ey Pokémor" });
  assert.equal(read.name, "Greedent");
});

test("two reads that agree settle the name", () => {
  assert.equal(parseCardPhotoText({ nameIndex: index, nameText: "Golurk 150", extraNameTexts: ["STAGE 1\nGolurk"] }).nameAgreement, 2);
  assert.equal(parseCardPhotoText({ nameIndex: index, nameText: "Ether", extraNameTexts: ["|| _"] }).nameAgreement, 1);
  assert.equal(parseCardPhotoText({ nameIndex: index, nameText: "" }).nameAgreement, 0);
});

test("a stray word in the name bar cannot become the name", () => {
  // Owner's photo of a sideways Metang: "LARRY" read from the border is not the card Larry.
  assert.deepEqual(findCardClues("N  fo ie   LARRY CR Tk", { nameIndex: index }).namesInText, []);
  assert.deepEqual(findCardClues("Slowpoke 70 HP", { nameIndex: index, bodyText: "weakness resistance retreat" }).namesInText, [], "a word from the name bar cannot vouch for itself");
  assert.deepEqual(findCardClues("Slo 70", { nameIndex: index, bodyText: "Galarian Slowpoke eat the seeds" }).namesInText, ["Galarian Slowpoke"]);
});

test("words printed on every card are never the card's name", () => {
  assert.equal(isGenericCardWord("Pokemon"), true);
  assert.equal(isGenericCardWord("Pokémon"), true);
  assert.equal(isGenericCardWord("Pikachu"), false);
  const read = parseCardPhotoText({ nameIndex: index, nameText: "BY AF Tess", fullText: "BASIC\n\nPokémon\n\nretreat" });
  assert.notEqual(read.name.toLowerCase().replace("é", "e"), "pokemon");
});

test("clues: the 1999-2003 copyright line, digit runs, a number read upside down, names in the text", () => {
  const old = findCardClues("Illus. Ken Sugimori ©1995, 96, 98 Nintendo, Creatures\nEvolves from Machop Put Machoke on the Basic\nHP 80", { nameIndex: index, readName: "Machoke" });
  assert.equal(old.wizards, true);
  assert.deepEqual(old.years, []);
  assert.equal(old.hp, 80);
  assert.equal(old.evolvesFrom, "Machop");
  assert.equal(findCardClues("", { nameStripText: "| Hattered@®| ol B130 ©\n      _y   13", readName: "Hatterene" }).hp, 130, "read once, on the line with the name");
  assert.equal(findCardClues("", { nameStripText: "Golurk 150 and 60", readName: "Golurk" }).hp, 0, "two numbers on the line: not sure which");
  assert.equal(findCardClues("©1995, 96, 98 Nintendo ©1999 Wizards").wizards, false, "its own year was read");
  assert.deepEqual(findCardClues("©1995, 96, 98 Nintendo ©1999 Wizards").years, [1999]);
  const turned = findCardClues("", { numberStripText: "Ri GB 198 ©", turnedText: "® 861 Ed 3\nx 861/821 oN\n73/41" });
  assert.deepEqual(turned.digitRuns, ["198"]);
  assert.deepEqual(turned.numberParts, ["128/198"], "a number with a 3, 4 or 7 in it cannot be turned back");
  const inText = findCardClues("we. ause Gatarian Slowpoke cat the seeds\nLo - Galarian Slow@lleq", { nameIndex: index });
  assert.deepEqual(inText.namesInText, ["Galarian Slowpoke"], "not Galarian Slowbro from the half-read name");
  assert.deepEqual(findCardClues("mon in p, , except\n7 Ab OMasnoy,\nMega Pun ch", { nameIndex: index }).namesInText, ["Abomasnow"], "a name split by a stray space");
});

test("a jammed scan: only the part that is still a picture is kept", () => {
  const width = 40, height = 400;
  const grey = new Uint8Array(width * height);
  let seed = 7;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const line = Array.from({ length: width }, () => Math.round(random() * 255));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) grey[y * width + x] = y < 260 ? line[x] : Math.round(random() * 255); // one line repeated, then a picture
  }
  const span = findUnsmearedSpan(grey, width, height);
  assert.ok(span, "found the picture");
  assert.ok(Math.abs(span.top - 0.65) < 0.04 && span.bottom === 1, JSON.stringify(span));
  const picture = Uint8Array.from({ length: width * height }, () => Math.round(random() * 255));
  assert.equal(findUnsmearedSpan(picture, width, height), null, "an ordinary picture is left alone");
  assert.equal(findUnsmearedSpan(new Uint8Array(width * height), width, height), null, "a blank picture has nothing to keep");
});
