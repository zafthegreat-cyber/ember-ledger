import assert from "node:assert/strict";
import {
  PHASE2CE_FIXTURE_COUNT,
  PHASE2CE_QA_FIXTURES,
} from "../src/features/purchaseReceiving/accountantReview/index.js";

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const ok = (actual, message) => { assert.ok(actual, message); assertions += 1; };

equal(PHASE2CE_FIXTURE_COUNT, 27, "the fixture registry covers every required review boundary and two safety boundaries");
equal(PHASE2CE_QA_FIXTURES.length, PHASE2CE_FIXTURE_COUNT);
equal(new Set(PHASE2CE_QA_FIXTURES.map((entry) => entry.id)).size, PHASE2CE_FIXTURE_COUNT, "fixture identities are unique");
for (const fixture of PHASE2CE_QA_FIXTURES) {
  equal(fixture.synthetic, true, `${fixture.id} remains synthetic`);
  ok(fixture.sourceReference.endsWith(".test"), `${fixture.id} uses a reserved test reference`);
  ok(Object.isFrozen(fixture), `${fixture.id} is immutable`);
  ok(Object.isFrozen(fixture.expected), `${fixture.id} expected result is immutable`);
}
ok(PHASE2CE_QA_FIXTURES.some((entry) => entry.scenario === "PRIOR_YEAR_SALE"));
ok(PHASE2CE_QA_FIXTURES.some((entry) => entry.scenario === "REFUND_AND_RETURN"));
ok(PHASE2CE_QA_FIXTURES.some((entry) => entry.scenario === "PROTOTYPE_POLLUTION"));
ok(PHASE2CE_QA_FIXTURES.every((entry) => !JSON.stringify(entry).includes("@")), "fixtures contain no mailbox identities");

console.log(`Code 3 Accountant Review fixtures: ${assertions} assertions passed across ${PHASE2CE_FIXTURE_COUNT} synthetic descriptors.`);
