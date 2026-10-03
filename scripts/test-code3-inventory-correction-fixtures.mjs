import assert from "node:assert/strict";
import {
  PHASE2CC_FIXTURE_COUNT,
  PHASE2CC_FIXTURES,
} from "../src/features/purchaseReceiving/inventoryCorrection/fixtures/phase2ccFixtures.js";
import { INVENTORY_CORRECTION_CATEGORIES } from "../src/features/purchaseReceiving/inventoryCorrection/constants.js";

let assertions = 0;
assert.equal(PHASE2CC_FIXTURE_COUNT, 40); assertions += 1;
assert.equal(new Set(PHASE2CC_FIXTURES.map((entry) => entry.key)).size, PHASE2CC_FIXTURE_COUNT); assertions += 1;
for (const fixture of PHASE2CC_FIXTURES) {
  assert.equal(fixture.synthetic, true); assertions += 1;
  assert.match(fixture.key, /^phase2cc-[a-z0-9-]+\.test$/); assertions += 1;
  assert.ok(fixture.title.length > 3 && fixture.title.length < 100); assertions += 1;
  assert.ok(fixture.expected); assertions += 1;
  assert.doesNotMatch(JSON.stringify(fixture), /password|bearer|cookie|credit.?card|cvv|api.?key|token/i); assertions += 1;
  if (fixture.category) {
    assert.ok(Object.values(INVENTORY_CORRECTION_CATEGORIES).includes(fixture.category)); assertions += 1;
  }
}
for (const required of [
  "PRODUCT_RESOLUTION_CORRECTION", "CONDITION_CORRECTION", "QUANTITY_CORRECTION", "RETURN_TO_RETAILER", "PARTIAL_RETURN",
  "DAMAGED_AFTER_RECEIVING", "WRONG_ITEM_RESOLUTION", "SUBSTITUTION_RESOLUTION", "REPLACEMENT_RECEIVED",
  "UNEXPECTED_EXTRA_RESOLUTION", "ACQUISITION_COST_CORRECTION", "REVERSAL_CORRECTION",
]) {
  assert.ok(PHASE2CC_FIXTURES.some((entry) => entry.category === required), `${required} fixture exists`); assertions += 1;
}
console.log(`Code 3 Inventory Correction fixtures: ${PHASE2CC_FIXTURE_COUNT}/${PHASE2CC_FIXTURE_COUNT} fixtures, ${assertions} assertions passed.`);
