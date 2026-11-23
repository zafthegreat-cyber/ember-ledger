import assert from "node:assert/strict";
import { test } from "node:test";
import { countPricedLines, pdfTextItemsToLines } from "../src/utils/receiptPdf.mjs";

const item = (str, x, y, size = 10) => ({ str, transform: [size, 0, 0, size, x, y] });

test("PDF text items become receipt lines, top to bottom and left to right", () => {
  const lines = pdfTextItemsToLines([
    item("12.99", 300, 700),
    item("Surging Sparks ETB", 40, 700.5),
    item("CARD SHOP", 40, 760, 14),
    item("Total", 40, 600),
    item("54.99", 300, 600),
    item(" ", 10, 650),
  ]);
  assert.deepEqual(lines, ["CARD SHOP", "Surging Sparks ETB 12.99", "Total 54.99"]);
});

test("priced lines are counted for the review message", () => {
  assert.equal(countPricedLines("CARD SHOP\nBooster 4.99\nTotal 4,99\nThanks"), 2);
  assert.equal(countPricedLines(""), 0);
});
