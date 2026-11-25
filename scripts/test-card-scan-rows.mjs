import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cardScanCopies, cardScanRowKey, mergeScannedCardRows, undoScannedCardRow } from "../src/utils/cardScanRows.mjs";

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

// Wiring: the scanner reads in the background and the app uses these helpers.
const scanner = readFileSync(new URL("../src/components/MultiCardScanner.jsx", import.meta.url), "utf8");
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
assert.match(app, /mergeScannedCardRows\(/);
assert.match(app, /undoScannedCardRow\(/);
assert.match(app, /quantity: copies, ownedQuantity: copies/, "Save all saves each line's copies");

console.log("Card scan rows checks passed.");
