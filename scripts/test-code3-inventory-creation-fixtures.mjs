import assert from "node:assert/strict";
import { PHASE2CB_FIXTURE_COUNT, PHASE2CB_QA_FIXTURES } from "../src/features/purchaseReceiving/inventoryCreation/fixtures/phase2cbFixtures.js";

let assertions = 0;
assert.equal(PHASE2CB_FIXTURE_COUNT, 39); assertions += 1;
assert.equal(new Set(PHASE2CB_QA_FIXTURES.map((fixture) => fixture.id)).size, PHASE2CB_FIXTURE_COUNT); assertions += 1;
for (const fixture of PHASE2CB_QA_FIXTURES) {
  assert.equal(fixture.synthetic, true); assertions += 1;
  assert.match(fixture.sourceReference, /\.test$/); assertions += 1;
  assert.equal(Object.isFrozen(fixture), true); assertions += 1;
  assert.equal(Object.isFrozen(fixture.expected), true); assertions += 1;
  assert.doesNotMatch(JSON.stringify(fixture), /(?:gmail|outlook|hayha|stellar.*token|password|cookie|cvv|cardnumber|@(?:gmail|outlook)\.com)/i); assertions += 1;
}
console.log(`Code 3 Inventory Creation fixtures: ${PHASE2CB_FIXTURE_COUNT}/${PHASE2CB_FIXTURE_COUNT} fixtures, ${assertions} assertions passed.`);
