// Printings and multi-card scanning helpers (Nov 17 2026).
import assert from "node:assert/strict";
import { test } from "node:test";
import { printingLabel, printingChoices, combinePrinting, SPECIAL_PRINTINGS } from "../src/utils/cardPrintings.mjs";
import { binderCells, BINDER_LAYOUTS, pocketLabel } from "../src/utils/binderPage.mjs";

test("catalog printing names collapse to one tidy label", () => {
  for (const [raw, label] of [["Normal", "Normal"], ["normal", "Normal"], ["Holofoil", "Holo"], ["holofoil", "Holo"], ["Reverse Holofoil", "Reverse Holo"], ["reverseHolofoil", "Reverse Holo"],
    ["1st Edition", "1st Edition"], ["1stEdition", "1st Edition"], ["1st Edition Holofoil", "1st Edition Holo"], ["1stEditionHolofoil", "1st Edition Holo"], ["Unlimited Holofoil", "Unlimited Holo"], ["unlimitedHolofoil", "Unlimited Holo"], ["Non-Holo", "Normal"]]) {
    assert.equal(printingLabel(raw), label, raw);
  }
});

test("choices list the card's own printings first, then the common finishes, without duplicates", () => {
  const choices = printingChoices(["holofoil", "Reverse Holofoil", "Holofoil"]);
  assert.deepEqual(choices.map((c) => c.label), ["Holo", "Reverse Holo", "Normal"]);
  assert.deepEqual(choices.map((c) => c.fromCatalog), [true, true, false]);
  assert.deepEqual(printingChoices([]).map((c) => c.label), ["Normal", "Holo", "Reverse Holo"]);
});

test("special printings include Trick or Treat and combine with the finish", () => {
  assert.ok(SPECIAL_PRINTINGS.some((s) => /Trick or Treat/.test(s.label)));
  assert.equal(combinePrinting("Reverse Holo", "trick-or-treat"), "Reverse Holo · Trick or Treat");
  assert.equal(combinePrinting("Holo", "first-edition"), "1st Edition Holo");
  assert.equal(combinePrinting("Normal", "poke-ball-reverse"), "Poké Ball reverse holo");
  assert.equal(combinePrinting("Holo", ""), "Holo");
});

test("binder page splits into one cell per pocket, inside the photo", () => {
  const cells = binderCells(3000, 4000, { columns: 3, rows: 3 });
  assert.equal(cells.length, 9);
  assert.ok(cells.every((c) => c.x >= 0 && c.y >= 0 && c.x + c.width <= 3000 && c.y + c.height <= 4000));
  assert.equal(pocketLabel(cells[5]), "Row 2, pocket 3");
  assert.ok(BINDER_LAYOUTS.some((l) => l.key === "4x3"));
  assert.deepEqual(binderCells(0, 100), []);
});
