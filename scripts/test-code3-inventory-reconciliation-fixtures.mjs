import assert from "node:assert/strict";
import {
  PHASE2CD_FIXTURE_COUNT,
  PHASE2CD_QA_FIXTURES,
} from "../src/features/purchaseReceiving/inventoryReconciliation/fixtures/phase2cdFixtures.js";

let assertions = 0;
assert.equal(PHASE2CD_FIXTURE_COUNT, 35); assertions += 1;
assert.equal(new Set(PHASE2CD_QA_FIXTURES.map((entry) => entry.id)).size, PHASE2CD_FIXTURE_COUNT); assertions += 1;

for (const fixture of PHASE2CD_QA_FIXTURES) {
  assert.equal(fixture.synthetic, true); assertions += 1;
  assert.match(fixture.id, /^[a-z0-9-]+$/); assertions += 1;
  assert.match(fixture.sourceReference, /^reconciliation\.[a-z0-9-]+\.test$/); assertions += 1;
  assert.ok(fixture.scenario.length >= 4 && fixture.scenario.length <= 80); assertions += 1;
  assert.ok(fixture.expected && typeof fixture.expected === "object"); assertions += 1;
  assert.doesNotMatch(JSON.stringify(fixture), /password|bearer|cookie|credit.?card|cvv|api.?key|oauth|session.?token|proxy.?url/i); assertions += 1;
}

for (const scenario of [
  "FULL_SALE_COST_INCREASE",
  "FULL_SALE_COST_DECREASE",
  "PARTIAL_SALE_COST",
  "PRODUCT_AFTER_SALE",
  "PRODUCT_AFTER_TRANSFER",
  "TRANSFER_CHAIN",
  "MULTI_HOP_TRANSFER",
  "OVER_RETURN",
  "RETURN_REMAINING",
  "REFUND_AFTER_SALE",
  "REPLACEMENT_PARTIAL_SALE",
  "PRIOR_CORRECTION_REVERSAL",
  "DUPLICATE_IDEMPOTENCY",
  "WRITE_INTERRUPTION",
  "JOURNAL_REPAIR",
  "CONCURRENT_CONFIRM",
  "NEGATIVE_COGS",
  "TAX_PROJECTION",
  "PRIOR_PERIOD",
  "SECRET_REJECTION",
  "PROTOTYPE_POLLUTION",
  "QUANTITY_CONSERVATION",
  "COST_CONSERVATION",
]) {
  assert.ok(PHASE2CD_QA_FIXTURES.some((entry) => entry.scenario === scenario), `${scenario} fixture exists`); assertions += 1;
}

console.log(`Code 3 Inventory Reconciliation fixtures: ${PHASE2CD_FIXTURE_COUNT}/${PHASE2CD_FIXTURE_COUNT} fixtures, ${assertions} assertions passed.`);
