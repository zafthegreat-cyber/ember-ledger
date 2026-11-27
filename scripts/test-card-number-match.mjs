// Matching a scanned card by its number when the name was not read (Nov 27 2026).
// The reads below are real ones: the app's reader on camera pictures made from the
// owner's scanned cards got the number right and the name wrong for about 7 in 100.
// The catalog rows are the real rows that share each number.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { nameIsInText, pickCardByNumber } from "../src/utils/cardClueMatch.mjs";
import { cardNameForChoice, exactNumberSpellings } from "../src/utils/catalogResultIdentity.mjs";

// name | set | number | year | hp | attacks
const CATALOG = `
Tyrantrum - 045/088 (Cosmos Holo)|Blister Exclusives|045/088|||
Tyrantrum|Deck Exclusives|045/088|2016|180|Wreak Havoc
Tyrantrum|ME03: Perfect Order|045/088|2026|180|Wreak Havoc
Iono's Kilowattrel - 055/159|Deck Exclusives|055/159|2016|120|Mach Bolt
Iono's Kilowattrel - 055/159|Prize Pack Series Cards|055/159|2022|120|Mach Bolt
Iono's Kilowattrel - 055/159|SV09: Journey Together|055/159|2025|120|Mach Bolt
Zeraora VSTAR|SWSH: Crown Zenith|055/159|2023|270|Crushing Beat
Lass|Base Set|075/102|1999||
Lass|Base Set (Shadowless)|075/102|1999||
Shuppet|Triumphant|75/102|2010|60|Disable;Haunt
Iono - 080/091|SV: Paldean Fates|080/091|2024||
Rayquaza V 100/159|Jumbo Cards|100/159|2015|210|Dragon Pulse;Spiral Burst
Lokix|SV09: Journey Together|100/159|2025|120|Low Sweep
Rayquaza V|SWSH: Crown Zenith|100/159|2023|210|Dragon Pulse;Spiral Burst
Misty's Determination - 104/122 (Regional Championships)|League & Championship Cards|104/122|2016||
Misty's Determination - 104/122 (Regional Championships) [Staff]|League & Championship Cards|104/122|2016||
Misty's Determination|XY - BREAKpoint|104/122|2016||
Roserade (15)|Dragons Exalted|15/124|2012|90|Squeeze
Seel|XY - Fates Collide|15/124|2016|80|Icy Snow
Tandemaus - 153/182|SV04: Paradox Rift|153/182|2023|30|Damage Rush
Team Rocket's Porygon|SV10: Destined Rivals|153/182|2025|60|Hacking
Lokix|SV02: Paldea Evolved|021/193|2023|120|Assaulting Kick;Speed Attack
`.trim().split("\n").map((line, index) => {
  const [name, set, number, year, hp, attacks] = line.split("|");
  return { row: { id: `c${index}`, name, set_name: set, card_number: number }, facts: year || hp || attacks ? { year: Number(year) || 0, hp: Number(hp) || 0, attacks: attacks ? attacks.split(";") : [] } : null };
});
const rows = CATALOG.map((entry) => entry.row);
const factsById = new Map(CATALOG.filter((entry) => entry.facts).map((entry) => [entry.row.id, entry.facts]));
const pick = (read) => pickCardByNumber(read, rows, factsById);
const labelOf = (card) => (card ? `${card.name} | ${card.set_name}` : null);

test("the number finds the card when the name was read wrong", () => {
  // "Evolves from Nymble" was taken for the card's own name.
  const lokix = pick({ name: "Nymble", number: "100/159", clues: { hp: 120, years: [] }, text: "STAGE 1 Nymble Evolves from Nymble 120\nLow Sweep 60" });
  assert.equal(labelOf(lokix.card), "Lokix | SV09: Journey Together");
  assert.equal(lokix.sure, true, "HP and an attack name both agree");
  assert.deepEqual(lokix.why.sort(), ["attack", "hp"]);
  // "Iono's" read without its apostrophe: no card is called "Ionos Kilowattrel".
  const kilowattrel = pick({ name: "Ionos Kilowattrel", number: "055/159", clues: { hp: 120 }, text: "" });
  assert.equal(labelOf(kilowattrel.card), "Iono's Kilowattrel - 055/159 | SV09: Journey Together", "the main set, not the prize pack or deck reprint, and not Zeraora VSTAR");
  assert.equal(kilowattrel.sure, true);
  assert.ok(kilowattrel.why.includes("name"));
  // A name with a stray piece in front of it.
  const seel = pick({ name: "FEE /Seel", number: "15/124", clues: { hp: 80, years: [2016] }, text: "" });
  assert.equal(labelOf(seel.card), "Seel | XY - Fates Collide");
  assert.equal(seel.sure, true);
  // Zeros in the number do not matter.
  assert.equal(labelOf(pick({ name: "Seel", number: "015/124", clues: {}, text: "" }).card), "Seel | XY - Fates Collide");
});

test("one kind of clue alone picks the card but is not sure of it", () => {
  // A trainer card: the name sits elsewhere and was not read. Only the year tells Lass from Shuppet.
  const lass = pick({ name: "You and your opponent show", number: "75/102", clues: { years: [1999] }, text: "You and your opponent show each other your hands" });
  assert.equal(labelOf(lass.card), "Lass | Base Set", "Base Set, not the Shadowless first print");
  assert.equal(lass.sure, false);
  assert.deepEqual(lass.why, ["year"]);
  // HP alone tells Team Rocket's Porygon from Tandemaus; with an attack name as well it is sure.
  const porygon = pick({ name: "Team Rockets", number: "153/182", clues: { hp: 60 }, text: "" });
  assert.equal(labelOf(porygon.card), "Team Rocket's Porygon | SV10: Destined Rivals");
  assert.equal(porygon.sure, false);
  assert.equal(pick({ name: "Team Rockets", number: "153/182", clues: { hp: 60 }, text: "Hacking Flip a coin" }).sure, true);
  const misty = pick({ name: "N Supporter", number: "104/122", clues: { years: [2016] }, text: "" });
  assert.equal(labelOf(misty.card), "Misty's Determination | XY - BREAKpoint", "the set card, not the championship stamps");
  assert.equal(misty.sure, false);
});

test("with nothing else read, the only card with that number is offered, never filed", () => {
  const iono = pick({ name: "Pee Ewes", number: "080/091", clues: {}, text: "" });
  assert.equal(iono.card, null);
  assert.deepEqual(iono.choices.map(labelOf), ["Iono - 080/091 | SV: Paldean Fates"]);
  // Two different cards share 100/159 and nothing says which: no guess.
  const either = pick({ name: "", number: "100/159", clues: {}, text: "" });
  assert.equal(either.card, null);
  assert.deepEqual(either.choices, []);
  // The HP was misread (150 for 180): the one card with the number is offered, not filed.
  const tyrantrum = pick({ name: "Tyrunt", number: "045/088", clues: { hp: 150 }, text: "" });
  assert.equal(tyrantrum.card, null);
  assert.deepEqual(tyrantrum.choices.map(labelOf), ["Tyrantrum | ME03: Perfect Order"]);
});

test("a number the catalog does not have, or no number, finds nothing", () => {
  assert.equal(pick({ name: "Lokix", number: "100/160", clues: { hp: 120 }, text: "" }).card, null, "another number is another card");
  assert.deepEqual(pick({ name: "Lokix", number: "100/160", clues: { hp: 120 }, text: "" }).choices, []);
  assert.equal(pick({ name: "Lokix", number: "", clues: { hp: 120 }, text: "" }).card, null);
  assert.equal(pickCardByNumber({ name: "Lokix", number: "100/159" }, [], new Map()).card, null);
});

test("a card's name is found in what was read, however it was spaced", () => {
  const words = (text) => new Set(text.split(" ").filter((word) => word.length >= 3));
  const has = (name, text) => nameIsInText(name, text, words(text));
  assert.equal(has("Iono's Kilowattrel - 055/159", "ionos kilowattrel"), true);
  assert.equal(has("Team Rocket's Porygon", "team rockets"), false, "half a name is not the name");
  assert.equal(has("Seel", "fee seel"), true);
  assert.equal(has("Lass", "your opponent shows a class of cards"), false, "four letters inside another word");
  assert.equal(has("Charizard ex", "charizaid ex 330"), true, "one misread letter in a long word");
  assert.equal(has("Charizard ex", "chansey ex 330"), false, "another card's name is not it");
  assert.equal(has("N", "n supporter"), false, "too short to mean anything");
});

test("the catalog is asked for the number in every way it is spelled", () => {
  assert.deepEqual(exactNumberSpellings("75/102"), ["75/102", "075/102"]);
  assert.deepEqual(exactNumberSpellings("055/159"), ["55/159", "055/159"]);
  assert.deepEqual(exactNumberSpellings("4/95"), ["4/95", "4/095", "04/95", "04/095", "004/95", "004/095"]);
  assert.deepEqual(exactNumberSpellings("tg10/tg30"), ["TG10/TG30", "tg10/tg30", "TG10/TG030", "tg10/tg030", "TG010/TG30", "tg010/tg30", "TG010/TG030", "tg010/tg030"], "capitals first: that is how the catalog stores them");
  assert.deepEqual(exactNumberSpellings("SWSH174"), ["SWSH174", "swsh174"], "a promo code has no total");
  assert.deepEqual(exactNumberSpellings("85"), [], "bare digits belong to hundreds of cards");
  assert.deepEqual(exactNumberSpellings(""), []);
  assert.deepEqual(exactNumberSpellings("1/2/3"), []);
  assert.deepEqual(exactNumberSpellings("75/102),name.eq.x"), [], "nothing but a number gets through");
  // The lookup must ask for these exact spellings. A pattern (ilike) made the live catalog read
  // every row: 6.5 s on Nov 27 2026, an error for anyone not signed in. Exact spellings took 33 ms.
  const service = readFileSync(new URL("../src/services/pokemonCatalogSearch.js", import.meta.url), "utf8").replace(/\s+/g, " ");
  assert.ok(service.includes('.select(CATALOG_SELECT_FIELDS).in("card_number", spellings).limit(limit)'), "the by-number lookup uses exact spellings");
});

test("wiring: the app tries the number before the clues, and says the name was hard to read", () => {
  // Line endings and spacing are flattened, and a miss says which piece is gone (not the whole file).
  const flat = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\s+/g, " ");
  const has = (source, piece, why) => assert.ok(source.includes(piece), `${why}: missing "${piece}"`);
  const app = flat("../src/App.jsx");
  has(app, "try { numbered = await fetchCardsByNumberOnDemand({ supabase, number }); } catch { numbered = null; }", "the exact number is looked up first, and a failure falls through to the old search");
  has(app, "const quick = pickScannedCard({ name, number, setName: row.setName }, numbered.rows.map(mapCatalog)); if (quick.card) return quick;", "the quick rows settle a name-and-number match by the same rule as before");
  has(app, "const byNumber = await matchScannedCardByNumber(row, name, number, numbered); // The number and the letters of the name point at the same card: nothing fits better. if (byNumber.card && byNumber.nameAgrees) return byNumber; const byClues = await matchScannedCardByClues(row, name, number);", "the number is tried before the clues, and only its name-backed card is taken outright");
  has(app, "numbered || fetchCardsByNumberOnDemand({ supabase, number }),", "the rows are not fetched twice");
  has(app, "return settleScanMatch(byNumber, byClues);", "the two matches are settled by the tested rule");
  has(app, 'if (picked.card && !picked.sure) return { card: null, others: 0, choices: [picked.card], choicesBy: "number" };', "an unsure pick is offered, not filed");
  has(app, 'nameAgrees: picked.why.includes("name")', "the app knows when the name agrees");
  // Seen on the owner's Raticate 40/102 (Nov 27 2026): name and number both read right, the
  // card picked among those sharing the number, and the row still said the name was hard to read.
  has(app, 'matchedBy: byClues ? "clues" : byNumber && !nameAgrees ? "numberOnly" : "number"', "the row says the name was hard to read only when the name did not agree");
  has(app, "byNumber = false, nameAgrees = false, choices = []", "the row is told whether the name agreed");
  has(app, 'const fullNumber = String(row.cardNumber || "").includes("/");', "a row with a full number and no name is still matched");
  has(app, "The card name was hard to read, so the card was matched from its number and other details.", "the saved note says how");
  const screen = flat("../src/features/deferredViews/AddAnythingContent.jsx");
  has(screen, "The name was hard to read, so check this is your card", "matched row wording");
  has(screen, "The name was hard to read. Is this your card?", "one choice wording");
  has(screen, "This card was hard to read. Which one is your card?", "choices from both ways wording");
  // On the live site (Nov 27 2026) an offered card read "SV09: Journey Together · 100/159 · $0.11":
  // no name, the one thing the person needed to answer "Is this your card?".
  has(app, "name: cardNameForChoice(catalogTitle(card)),", "each offered card carries its name");
  has(screen, '{(row.matchedChoicesBy === "number" || row.matchedChoicesBy === "either") && choice.name ? `${choice.name} · ` : ""}{choice.short}', "an offered card shows its name when the name was hard to read");
});

test("an offered card is named without the number some catalog rows put in the name", () => {
  assert.equal(cardNameForChoice("Lokix"), "Lokix");
  assert.equal(cardNameForChoice("Iono - 080/091"), "Iono");
  assert.equal(cardNameForChoice("Rayquaza V 100/159"), "Rayquaza V");
  assert.equal(cardNameForChoice("Pikachu - TG10/TG30"), "Pikachu");
  assert.equal(cardNameForChoice("Mew ex #151/165"), "Mew ex");
  assert.equal(cardNameForChoice("Porygon2"), "Porygon2", "a digit in the name stays");
  assert.equal(cardNameForChoice("Charizard V 4"), "Charizard V 4", "only a full number is dropped");
  assert.equal(cardNameForChoice("  Nidoran   F  "), "Nidoran F");
  assert.equal(cardNameForChoice("080/091"), "080/091", "a name that is only a number is kept");
  assert.equal(cardNameForChoice(""), "");
  assert.equal(cardNameForChoice(null), "");
});

test("the search for a number with any set total has an index it can use", () => {
  // The older search asks for card_number ilike '100' or ilike '100/%'. Without an index
  // ordered character by character the catalog read every row for it: 1.4 s for the rows
  // and 1.0 s for the count on Nov 27 2026 (10 ms and 7 ms with the index).
  const flat = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\s+/g, " ");
  const service = flat("../src/services/pokemonCatalogSearch.js");
  assert.ok(service.includes("`card_number.ilike.${value}`, `card_number.ilike.${value}/%`"), "the search still asks by the start of the number");
  const migration = flat("../supabase/migrations/20261127050000_catalog_card_number_prefix_index.sql");
  assert.ok(migration.includes("create index if not exists master_catalog_items_card_number_prefix_idx on public.master_catalog_items (card_number text_pattern_ops);"), "the index compares character by character and covers every row");
});

test("a row that stores only the card's own number needs the exact name", async () => {
  const { pickScannedCard } = await import("../src/utils/catalogResultIdentity.mjs");
  // Real catalog rows (Nov 27 2026). The owner's Articuno 032/159 was read as "032/250".
  const promo = { id: "promo", name: "Articuno ex - 032 (EX Collector's Window Tins)", setName: "Nintendo Promos", cardNumber: "032" };
  assert.equal(pickScannedCard({ name: "Articuno", number: "032/250" }, [promo]).card, null, "filed at $214.90 before");
  // A row with only the card's own number still matches when the name is exactly its name.
  const bare = { id: "bare", name: "Charizard", setName: "Base Set", cardNumber: "4" };
  assert.equal(pickScannedCard({ name: "Charizard", number: "4/102" }, [bare]).card, bare);
  assert.equal(pickScannedCard({ name: "Charizard", number: "4/102" }, [promo, bare]).card, bare);
  // A full number on a row is still taken on the usual near-miss name rules.
  const full = { id: "full", name: "Charizard", setName: "Base Set", cardNumber: "004/102" };
  assert.equal(pickScannedCard({ name: "Charizarb", number: "4/102" }, [full, bare]).card, full);
  // Without the full number on any row, a near miss is not enough for a bare row.
  assert.equal(pickScannedCard({ name: "Charizarb", number: "4/102" }, [bare]).card, null);
  // "Pikachu" is not "Pikachu V".
  assert.equal(pickScannedCard({ name: "Pikachu", number: "25/185" }, [{ id: "v", name: "Pikachu V", setName: "Vivid Voltage Promos", cardNumber: "25" }]).card, null);
});

test("a card found by number never overrides a good match on the name that was read", async () => {
  const { settleScanMatch } = await import("../src/utils/catalogResultIdentity.mjs");
  const lokix = { id: "lokix" }, nymble = { id: "nymble" }, diglett = { id: "diglett" }, grookey = { id: "grookey" };
  // The number's card, with its name in what was read, is taken outright.
  assert.equal(settleScanMatch({ card: lokix, byNumber: true, nameAgrees: true }, { card: nymble, byClues: true }).card, lokix);
  // "Grookey 076/198" for 016/198: 076/198 is a Diglett. The Grookey that the clues found wins.
  const misread = settleScanMatch({ card: diglett, byNumber: true, nameAgrees: false }, { card: grookey, byClues: true });
  assert.equal(misread.card, grookey);
  assert.equal(misread.byClues, true);
  // "Nymble 100/159" for Lokix: no Nymble fits, so the number's card stands.
  const evolves = settleScanMatch({ card: lokix, byNumber: true, nameAgrees: false, others: 1 }, { card: null, choices: [] });
  assert.equal(evolves.card, lokix);
  assert.equal(evolves.byNumber, true);
  // Both ways only have guesses: nothing is filed, and the number's card is offered first.
  const unsure = settleScanMatch({ card: diglett, byNumber: true, nameAgrees: false }, { card: null, choices: [grookey, { id: "grookey-2" }] });
  assert.equal(unsure.card, null);
  assert.deepEqual(unsure.choices.map((card) => card.id), ["diglett", "grookey", "grookey-2"]);
  assert.equal(unsure.choicesBy, "either");
  // Only the number has something to offer: the name was the hard part.
  const onlyNumber = settleScanMatch({ card: null, choices: [lokix], choicesBy: "number" }, { card: null, choices: [] });
  assert.deepEqual(onlyNumber.choices, [lokix]);
  assert.equal(onlyNumber.choicesBy, "number");
  // Only the clues do: the number was the hard part, as before.
  const onlyClues = settleScanMatch({ card: null, choices: [] }, { card: null, choices: [grookey] });
  assert.deepEqual(onlyClues.choices, [grookey]);
  assert.equal(onlyClues.choicesBy, "");
  // The same card offered both ways appears once; four at most.
  const same = settleScanMatch({ card: null, choices: [grookey] }, { card: null, choices: [grookey, lokix, nymble, diglett, { id: "x" }] });
  assert.deepEqual(same.choices.map((card) => card.id), ["grookey", "lokix", "nymble", "diglett"]);
  // Nothing either way.
  assert.deepEqual(settleScanMatch({ card: null, others: 0 }, { card: null, others: 0 }), { card: null, others: 0, choices: [], choicesBy: "" });
  assert.deepEqual(settleScanMatch(), { card: null, others: 0, choices: [], choicesBy: "" });
});
