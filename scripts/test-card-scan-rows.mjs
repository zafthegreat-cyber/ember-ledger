import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cardScanCopies, cardScanRowKey, lastScanSummary, mergeScannedCardRows, undoScannedCardRow } from "../src/utils/cardScanRows.mjs";

// Scan cards, continuous scanning (Nov 25 2026).
const row = (id, cardName, cardNumber, extra = {}) => ({ id, cardName, cardNumber, destination: "vault", ...extra });

assert.equal(cardScanRowKey(row("a", " Pikachu ", "025/165")), "pikachu|025/165");
assert.equal(cardScanRowKey(row("a", "Pikachu", "")), "", "A row without a number has no key");
assert.equal(cardScanCopies({}), 1);
assert.equal(cardScanCopies({ quantity: "3" }), 3);
assert.equal(cardScanCopies({ quantity: 0 }), 1);
assert.equal(cardScanCopies({ quantity: 2.9 }), 2);

// The same card scanned again is one more copy, not a new line.
let rows = mergeScannedCardRows([], [row("a", "Pikachu", "025/165", { scanned: true })]);
assert.equal(rows.length, 1);
rows = mergeScannedCardRows(rows, [row("b", "pikachu", "025/165", { scanned: true })]);
assert.equal(rows.length, 1, "Same name and number joins the first line");
assert.equal(rows[0].id, "a");
assert.equal(rows[0].quantity, 2);
rows = mergeScannedCardRows(rows, [row("c", "Pikachu", "025/165", { scanned: true })]);
assert.equal(rows[0].quantity, 3);

// A different card, or the same name with another number, is its own line.
rows = mergeScannedCardRows(rows, [row("d", "Pikachu", "173/165", { scanned: true }), row("e", "Charizard ex", "125/197", { scanned: true })]);
assert.deepEqual(rows.map((entry) => entry.id), ["a", "d", "e"]);

// A read with no number never merges (it cannot name one card).
rows = mergeScannedCardRows(rows, [row("f", "Pikachu", "", { scanned: true }), row("g", "Pikachu", "", { scanned: true })]);
assert.deepEqual(rows.map((entry) => entry.id), ["a", "d", "e", "f", "g"]);

// Binder pockets and typed rows are not merged.
const binder = mergeScannedCardRows([row("a", "Pikachu", "025/165")], [row("p1", "Pikachu", "025/165", { pocket: "Row 1, pocket 1" })]);
assert.equal(binder.length, 2, "A binder pocket stays its own line");

// A line going somewhere else is not merged.
const elsewhere = mergeScannedCardRows([row("a", "Pikachu", "025/165", { destination: "wishlist" })], [row("b", "Pikachu", "025/165", { scanned: true })]);
assert.equal(elsewhere.length, 2);

// Empty leftovers are dropped; a row opened to type by hand is kept.
const kept = mergeScannedCardRows([row("blank", "", ""), row("hand", "", "", { byHand: true })], [row("b", "Eevee", "133/165", { scanned: true })]);
assert.deepEqual(kept.map((entry) => entry.id), ["hand", "b"]);

// Inputs are not changed in place.
const before = [row("a", "Pikachu", "025/165", { quantity: 1 })];
const frozen = JSON.stringify(before);
mergeScannedCardRows(before, [row("b", "Pikachu", "025/165", { scanned: true })]);
assert.equal(JSON.stringify(before), frozen);

// Undo: one copy off a line with several, otherwise the line goes.
let list = [row("a", "Pikachu", "025/165", { quantity: 2 }), row("e", "Charizard ex", "125/197")];
list = undoScannedCardRow(list, { cardName: "Pikachu", cardNumber: "025/165" });
assert.equal(list.length, 2);
assert.equal(list[0].quantity, 1);
list = undoScannedCardRow(list, { cardName: "PIKACHU", cardNumber: "025/165" });
assert.deepEqual(list.map((entry) => entry.id), ["e"]);
const same = undoScannedCardRow(list, { cardName: "Mew", cardNumber: "151/165" });
assert.equal(same, list, "No match leaves the list as it is");
assert.equal(undoScannedCardRow(list, {}), list);

// Undo takes the newest line when a name-only card was scanned twice.
const nameOnly = undoScannedCardRow([row("f", "Pikachu", ""), row("g", "Pikachu", "")], { cardName: "Pikachu", cardNumber: "" });
assert.deepEqual(nameOnly.map((entry) => entry.id), ["f"]);

// The strip under the camera (Nov 27 2026): one offered card is asked about right there.
{
  const lokix = { product: { id: "lokix" }, name: "Lokix", short: "SV09: Journey Together · 100/159", label: "Lokix · SV09: Journey Together · 100/159", value: 0.11 };
  const rayquaza = { product: { id: "ray" }, name: "Rayquaza V", short: "SWSH: Crown Zenith · 100/159", value: 2 };
  const scanned = (extra = {}) => ({ id: "s", cardName: "Nymble", cardNumber: "100/159", matchedFor: "Nymble|100/159", ...extra });
  assert.deepEqual(lastScanSummary(null), { matched: false, offer: null, detail: "", name: "", title: "" });
  // The strip names the card that was filed, not the misread name; before that, what was read.
  const filed = lastScanSummary(scanned({ cardName: "Zqgxv Wopl", cardNumber: "080/091", matchedFor: "Zqgxv Wopl|080/091", matchState: "matched", matchedProduct: { name: "Iono - 080/091", setName: "SV: Paldean Fates", cardNumber: "080/091" } }));
  assert.deepEqual([filed.title, filed.name, filed.detail], ["Iono · 080/091", "Iono", "SV: Paldean Fates"]);
  assert.equal(lastScanSummary(scanned({ cardName: "Pikachu", cardNumber: "", matchedFor: "Pikachu|", matchState: "matched", matchedProduct: { cardName: "Pikachu", cardNumber: "025/165" } })).title, "Pikachu · 025/165", "a number the reader missed comes from the card");
  assert.equal(lastScanSummary(scanned({ matchState: "matched", matchedProduct: {} })).title, "Nymble · 100/159", "a card with no name of its own keeps what was read");
  assert.equal(lastScanSummary(scanned({ matchState: "review", matchedChoices: [lokix] }), { canPick: true }).title, "Nymble · 100/159", "not filed yet: what was read");
  assert.equal(lastScanSummary({ cardName: " ", cardNumber: " 12/34 " }).title, "12/34");
  assert.equal(lastScanSummary(scanned({ matchedFor: "" })).detail, "Finding its price…");
  // Matched: the set, as before.
  const matched = lastScanSummary(scanned({ matchState: "matched", matchedProduct: { setName: "SV09: Journey Together" } }), { canPick: true });
  assert.deepEqual([matched.matched, matched.offer, matched.detail], [true, null, "SV09: Journey Together"]);
  // One card offered: asked by name, and Yes can file it.
  const one = lastScanSummary(scanned({ matchState: "review", matchedChoices: [lokix] }), { canPick: true });
  assert.equal(one.offer, lokix);
  assert.equal(one.detail, "Is this Lokix? SV09: Journey Together · 100/159");
  assert.equal(one.matched, false);
  // The offer comes before "Name not read": the question is the useful line.
  assert.equal(lastScanSummary(scanned({ matchState: "review", matchedChoices: [lokix], scanNote: "Name not read" }), { canPick: true }).detail, "Is this Lokix? SV09: Journey Together · 100/159");
  // A choice saved before names were kept still asks a question.
  assert.equal(lastScanSummary(scanned({ matchState: "review", matchedChoices: [{ product: { id: "x" }, short: "Set · 1/2" }] }), { canPick: true }).detail, "Is this your card? Set · 1/2");
  // Nothing to file it with: no offer, the list is pointed at.
  const noPick = lastScanSummary(scanned({ matchState: "review", matchedChoices: [lokix] }));
  assert.deepEqual([noPick.offer, noPick.detail], [null, "Not sure which card this is. Check it in the list below."]);
  // Two cards: picked in the list.
  const two = lastScanSummary(scanned({ matchState: "review", matchedChoices: [lokix, rayquaza] }), { canPick: true });
  assert.deepEqual([two.offer, two.detail], [null, "Not sure which card this is. Pick it in the list below."]);
  // A choice with no card behind it does not count.
  assert.equal(lastScanSummary(scanned({ matchState: "review", matchedChoices: [lokix, { product: null }] }), { canPick: true }).offer, lokix);
  // No choices: as before.
  assert.equal(lastScanSummary(scanned({ matchState: "review", matchedChoices: [] }), { canPick: true }).detail, "Not sure which card this is. Check it in the list below.");
  assert.equal(lastScanSummary(scanned({ matchState: "review", scanNote: "Number not read" }), { canPick: true }).detail, "Number not read. Check it in the list below.");
  // An answer for an older reading of the row (the name was edited since) is not used.
  assert.equal(lastScanSummary(scanned({ matchState: "review", matchedChoices: [lokix], matchedFor: "Nymbel|100/159" }), { canPick: true }).offer, null);
}

// Wiring: the scanner reads in the background and the app uses these helpers.
const scanner = readFileSync(new URL("../src/components/MultiCardScanner.jsx", import.meta.url), "utf8");
{
  const flatScanner = scanner.replace(/\s+/g, " ");
  const flatScreen = readFileSync(new URL("../src/features/deferredViews/AddAnythingContent.jsx", import.meta.url), "utf8").replace(/\s+/g, " ");
  const has = (source, piece, why) => assert.ok(source.includes(piece), `${why}: missing "${piece}"`);
  has(flatScanner, "lastScanSummary(lastRow, { canPick: Boolean(onPick) })", "the strip uses the tested summary");
  has(flatScanner, "<strong>{lastTitle}", "the strip shows the summary's title");
  has(flatScanner, 'className="multi-card-scanner__yes" aria-label={`Yes, this is ${lastOffer.name || "my card"}`} onClick={() => { onPick(lastRow, lastOffer);', "Yes files the offered card");
  has(flatScreen, "onPick={pickCardScanChoice}", "the list hands the scanner its own pick step");
  has(flatScreen, "onClick={() => pickCardScanChoice(row, choice)}", "the list buttons use the same step");
}
assert.match(scanner, /queueRef\.current\.push\(/, "Pictures join a line to be read");
assert.match(scanner, /<CardCameraFrame continuous retryKey=\{retryKey\}/, "The camera stays free and can retry a failed read once");
assert.match(scanner, /below=\{lastCard \|\| reading/, "The last card shows straight under the camera picture");
assert.match(scanner, /warmCardReader/,"The reader is loaded while the first card is lined up");
assert.doesNotMatch(scanner, /blank row was added/, "A card that could not be read adds nothing");
const camera = readFileSync(new URL("../src/components/CardCameraFrame.jsx", import.meta.url), "utf8");
assert.match(camera, /Got it\. Show the next card\./);
assert.match(camera, /createNextCardWatcher\(\)/, "A similar-looking next card re-arms auto-scan");
assert.match(camera, /sameCardGuard: guardNext/);
assert.match(scanner, /job\.sameCardGuard && key === lastKeyRef\.current/, "A drifted card is not counted twice");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
// Nov 27 2026: a page left open across an update could not load the scanner's catalog code
// (the old file name is gone) and every card came back "Not sure", with nothing said.
{
  const flatApp = app.replace(/\s+/g, " ");
  const flatScreen = readFileSync(new URL("../src/features/deferredViews/AddAnythingContent.jsx", import.meta.url), "utf8").replace(/\s+/g, " ");
  const has = (source, piece, why) => assert.ok(source.includes(piece), `${why}: missing "${piece}"`);
  has(flatApp, 'pokemonCatalogSearchModulePromise = import("./services/pokemonCatalogSearch").catch((error) => { pokemonCatalogSearchModulePromise = null; throw error; });', "a failed load is tried again");
  has(flatApp, 'Promise.all([loadPokemonCatalogSearchModule(), import("./utils/cardClueMatch.mjs")])', "the catalog code loads as the scanner opens");
  has(flatApp, "if (active && isLikelyChunkLoadError(error)) setScanLookupStale(true);", "a page too old to load it is noticed");
  has(flatApp, "scanLookupStale, onRefreshApp: handleSafeAppRefresh,", "the scan screen is told, with the app's safe refresh");
  has(flatScreen, "{scanLookupStale ? (", "the scan screen says so");
  has(flatScreen, "{appendQuickAddCardScanRows && !scanLookupStale ? <MultiCardScanner", "without a camera that could not match a card");
  has(flatScreen, 'onClick={() => onRefreshApp()}>Refresh</button>', "and offers a refresh");
  // What the browsers say when the file is gone (Chrome, Safari, Firefox).
  const { isLikelyChunkLoadError } = await import("../src/utils/appFallbackContent.js");
  assert.ok(isLikelyChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://code3tcg.app/assets/pokemonCatalogSearch-Czb2WLcx.js")));
  assert.ok(isLikelyChunkLoadError(new TypeError("Importing a module script failed.")));
  assert.ok(isLikelyChunkLoadError(new TypeError("error loading dynamically imported module: https://code3tcg.app/assets/cardClueMatch-C3GrI2WB.js")));
  assert.ok(!isLikelyChunkLoadError(new Error("statement timeout")), "a slow catalog is not an old page");
}
assert.match(app, /mergeScannedCardRows\(/);
assert.match(app, /undoScannedCardRow\(/);
assert.match(app, /quantity: copies, ownedQuantity: copies/, "Save all saves each line's copies");

// Condition, printing and grading in one tap (Nov 27 2026, owner: "Make changing the condition
// or marking it as a graded or changing the type (holo, reverse holo) if needed very simple").
{
  const details = await import("../src/utils/cardScanDetails.mjs");
  const { readLegacyGradingMetadata } = await import("../src/utils/legacyGradingMetadata.mjs");
  const {
    applyCardScanDetailToAll, cardScanCondition, cardScanDetailsKey, cardScanFinishChoices, cardScanGradeLabel,
    cardScanGradingPatch, cardScanPrinting, cardScanPrintingParts, cardScanPrintingWith, cardScanRowsToChange,
    cardScanSavedDetails, isCardScanGraded,
  } = details;
  // What the buttons say before anything is picked: what Save stores.
  assert.equal(cardScanCondition({}), "Near Mint");
  assert.equal(cardScanCondition({ condition: "lp" }), "Lightly Played", "short forms read as the button names");
  assert.equal(cardScanCondition({ condition: " damaged " }), "Damaged");
  assert.equal(cardScanCondition({ condition: "Signed" }), "Signed", "typed words are kept");
  assert.equal(cardScanPrinting({}), "", "no printing chosen: none is claimed");
  assert.equal(cardScanPrinting({ variant: "reverse holofoil" }), "Reverse Holo");
  assert.equal(cardScanGradeLabel({}), "Not graded");
  assert.equal(cardScanGradeLabel({ graded: true, gradingCompany: "PSA", grade: "10" }), "PSA 10");
  assert.equal(cardScanGradeLabel({ gradingCompany: "CGC" }), "CGC");
  assert.equal(cardScanGradeLabel({ grade: "9" }), "Grade 9");
  assert.equal(cardScanGradeLabel({ graded: true }), "Graded");
  assert.equal(isCardScanGraded({ certificationNumber: "123" }), true);
  assert.equal(isCardScanGraded({ graded: false }), false);
  // Picking a company marks it graded; Not graded clears every grading detail.
  assert.deepEqual(cardScanGradingPatch({}, "PSA"), { graded: true, gradingCompany: "PSA" });
  assert.deepEqual(cardScanGradingPatch({ gradingCompany: "PSA", grade: "10" }, ""), { graded: false, gradingCompany: "", grade: "", certificationNumber: "" });
  // Finishes: the card's own printings first, then Normal, Holo, Reverse Holo.
  assert.deepEqual(cardScanFinishChoices(null), ["Normal", "Holo", "Reverse Holo"]);
  assert.deepEqual(cardScanFinishChoices({ variants: [{ variant: "1stEditionHolofoil" }, { variant: "holofoil" }] }), ["1st Edition Holo", "Holo", "Normal", "Reverse Holo"]);
  // A finish keeps a stamp, a stamp keeps the finish, None takes the stamp off.
  assert.deepEqual(cardScanPrintingParts("Reverse Holo · Trick or Treat"), { finish: "Reverse Holo", special: "trick-or-treat" });
  assert.deepEqual(cardScanPrintingParts("Poké Ball reverse holo"), { finish: "Reverse Holo", special: "poke-ball-reverse" });
  assert.deepEqual(cardScanPrintingParts("1st Edition Holo"), { finish: "Holo", special: "first-edition" });
  assert.equal(cardScanPrintingWith("", { finish: "Holo" }), "Holo");
  assert.equal(cardScanPrintingWith("Reverse Holo", { special: "trick-or-treat" }), "Reverse Holo · Trick or Treat");
  assert.equal(cardScanPrintingWith("Reverse Holo · Trick or Treat", { finish: "Normal" }), "Normal · Trick or Treat");
  assert.equal(cardScanPrintingWith("Reverse Holo · Trick or Treat", { special: "" }), "Reverse Holo");
  assert.equal(cardScanPrintingWith("Holo", { special: "first-edition" }), "1st Edition Holo");
  assert.equal(cardScanPrinting({ variant: "Reverse Holo · Trick or Treat" }), "Reverse Holo · Trick or Treat", "a stamp is shown as written");
  // "Use ... for the other cards": condition and printing only, graded rows keep their grade.
  const list = [{ id: "a", condition: "Lightly Played" }, { id: "b" }, { id: "c", gradingCompany: "PSA", grade: "10" }];
  assert.equal(cardScanRowsToChange(list, "a", "condition", "Lightly Played"), 1, "only the raw card that differs");
  const all = applyCardScanDetailToAll(list, "condition", "Lightly Played");
  assert.equal(all[0], list[0], "a row already set is left as it is");
  assert.equal(all[1].condition, "Lightly Played");
  assert.equal(all[2], list[2], "a slab's condition is not changed");
  assert.deepEqual(applyCardScanDetailToAll(list, "variant", "Reverse Holo").map((entry) => entry.variant), ["Reverse Holo", "Reverse Holo", "Reverse Holo"]);
  assert.equal(applyCardScanDetailToAll(list, "grade", "10")[2], list[2], "a grade is never copied to other cards");
  // Save: the printing reaches the server column, grading reaches the notes line the app reads back.
  assert.deepEqual(cardScanSavedDetails({}), { variant: "", printing: "", conditionName: "Near Mint" }, "nothing picked saves as before");
  assert.deepEqual(cardScanSavedDetails({ variant: "reverse holo", condition: "MP" }), { variant: "Reverse Holo", printing: "Reverse Holo", conditionName: "Moderately Played" });
  const slab = cardScanSavedDetails({ variant: "Holo", gradingCompany: " PSA ", grade: "9", certificationNumber: "81234567" }, "Added from Scan several cards (Save all).");
  assert.equal(slab.graded, true);
  assert.deepEqual([slab.gradingCompany, slab.grade, slab.certificationNumber], ["PSA", "9", "81234567"]);
  assert.ok(slab.actionNotes.startsWith("Added from Scan several cards (Save all).\n"), "the scan note is kept");
  assert.deepEqual(readLegacyGradingMetadata(slab.actionNotes), { gradingCompany: "PSA", grade: "9", certificationNumber: "81234567", graded: true }, "the grade comes back after a reload");
  // A copy marked another way is its own line when the same card is scanned again.
  assert.equal(cardScanDetailsKey({}), cardScanDetailsKey({ condition: "near mint" }), "Near Mint picked is the same as nothing picked");
  assert.notEqual(cardScanDetailsKey({}), cardScanDetailsKey({ variant: "Reverse Holo" }));
  const slabLine = mergeScannedCardRows([row("a", "Pikachu", "025/165", { gradingCompany: "PSA", grade: "10" })], [row("b", "Pikachu", "025/165", { scanned: true })]);
  assert.deepEqual(slabLine.map((entry) => [entry.id, entry.quantity]), [["a", undefined], ["b", undefined]], "a raw copy never joins a PSA 10 line");
  const reverseLine = mergeScannedCardRows([row("a", "Pikachu", "025/165", { variant: "Reverse Holo" }), row("n", "Pikachu", "025/165")], [row("b", "Pikachu", "025/165", { scanned: true })]);
  assert.deepEqual(reverseLine.map((entry) => [entry.id, entry.quantity]), [["a", undefined], ["n", 2]], "it joins the line it matches");
  // Wiring: the buttons sit on every row, outside Edit details, and Save uses the tested details.
  const flatScreen = readFileSync(new URL("../src/features/deferredViews/AddAnythingContent.jsx", import.meta.url), "utf8").replace(/\s+/g, " ");
  const flatApp = app.replace(/\s+/g, " ");
  const flatRowDetails = readFileSync(new URL("../src/components/CardScanRowDetails.jsx", import.meta.url), "utf8").replace(/\s+/g, " ");
  const has = (source, piece, why) => assert.ok(source.includes(piece), `${why}: missing "${piece}"`);
  has(flatScreen, `<CardScanRowDetails row={row} rows={rows} cardTitle={title} onChange={(patch) => updateCardScanRow(row.id, patch)} onApplyToAll={applyCardScanDetailToAllRows} /> <details className="quick-add-card-scan-edit"`, "the buttons come before Edit details");
  assert.ok(!flatScreen.includes('<Field label="Variant">') && !flatScreen.includes('<Field label="Condition">'), "no second, typed copy of the same fields");
  has(flatApp, "const details = cardScanSavedDetails(row, scanNotes);", "Save stores what the row shows");
  has(flatApp, '...details, language: "English",', "the details go on the saved copy");
  has(flatApp, "gradedCertificateError({ id: row.id, ...shared }, [...items, ...records])", "a certificate already saved is not added twice");
  has(flatRowDetails, "{!graded ? (", "a slab shows its grade instead of a condition");
  has(flatRowDetails, 'aria-expanded={open === "printing"}', "each button says when its choices are open");
}

console.log("Card scan rows checks passed.");
