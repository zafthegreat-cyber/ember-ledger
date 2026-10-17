import assert from "node:assert/strict";
import {
  PHASE_1C_QA_CLOCK,
  PHASE_1C_QA_FIXTURES,
  PHASE_1C_QA_FIXTURE_BY_ID,
  evaluatePhase1cQaFixture,
  getPhase1cQaFixture,
} from "../src/features/intelligence/fixtures/index.js";

let assertions = 0;
let cases = 0;

function equal(actual, expected, message) {
  assertions += 1;
  assert.equal(actual, expected, message);
}

function ok(value, message) {
  assertions += 1;
  assert.ok(value, message);
}

async function fixtureCase(fixtureId, callback) {
  const fixture = getPhase1cQaFixture(fixtureId);
  ok(fixture, `${fixtureId} must be registered.`);
  const result = await evaluatePhase1cQaFixture(fixture);
  await callback(result, fixture);
  cases += 1;
  process.stdout.write(`ok ${cases} - ${fixtureId}\n`);
}

const requiredIds = [
  "card-nm",
  "card-lp",
  "card-mp",
  "card-hp",
  "card-dmg",
  "card-insufficient-image",
  "deal-profitable",
  "deal-bad",
  "deal-insufficient-market",
  "auction-profitable",
  "auction-high-risk",
  "restock-high-confidence",
  "restock-low-confidence",
  "owner-corrected-analysis",
  "reanalysis-new-evidence",
];

equal(PHASE_1C_QA_FIXTURES.length, 15, "Exactly 15 required Phase 1C fixtures must be registered.");
equal(new Set(PHASE_1C_QA_FIXTURES.map((fixture) => fixture.fixtureId)).size, 15, "Fixture IDs must be unique.");
assertions += 1;
assert.deepEqual(PHASE_1C_QA_FIXTURES.map((fixture) => fixture.fixtureId), requiredIds);
equal(Object.keys(PHASE_1C_QA_FIXTURE_BY_ID).length, 15);
equal(Object.isFrozen(PHASE_1C_QA_FIXTURES), true);
equal(Object.isFrozen(PHASE_1C_QA_FIXTURE_BY_ID), true);
for (const fixture of PHASE_1C_QA_FIXTURES) {
  equal(Object.isFrozen(fixture), true, `${fixture.fixtureId} must be immutable.`);
  equal(Object.isFrozen(fixture.input), true, `${fixture.fixtureId} input must be immutable.`);
}

await fixtureCase("card-nm", async (result, fixture) => {
  equal(result.proposedCondition, fixture.expected.proposedCondition);
  equal(result.confidence, fixture.expected.confidence);
  equal(result.professionalGradePrediction, null);
});

await fixtureCase("card-lp", async (result, fixture) => {
  equal(result.proposedCondition, fixture.expected.proposedCondition);
  ok(result.explanation.includes("whitening"));
});

await fixtureCase("card-mp", async (result, fixture) => {
  equal(result.proposedCondition, fixture.expected.proposedCondition);
  equal(result.defectsObserved.length, 2);
});

await fixtureCase("card-hp", async (result, fixture) => {
  equal(result.proposedCondition, fixture.expected.proposedCondition);
  equal(result.structuralDamageIdentified, false);
});

await fixtureCase("card-dmg", async (result, fixture) => {
  equal(result.proposedCondition, fixture.expected.proposedCondition);
  equal(result.structuralDamageIdentified, true);
  ok(result.explanation.includes("Structural damage"));
});

await fixtureCase("card-insufficient-image", async (result, fixture) => {
  equal(result.proposedCondition, fixture.expected.proposedCondition);
  equal(result.confidence, fixture.expected.confidence);
  equal(result.imageCoverage.backAvailable, false);
  ok(result.defectsNotAssessable.length > 0);
});

await fixtureCase("deal-profitable", async (result, fixture) => {
  equal(result.recommendation, fixture.expected.recommendation);
  equal(result.estimatedNetProfit.minorUnits, fixture.expected.netProfitMinor);
  equal(result.automaticPurchaseAllowed, fixture.expected.automaticPurchaseAllowed);
  equal(result.advisoryOnly, true);
});

await fixtureCase("deal-bad", async (result, fixture) => {
  equal(result.recommendation, fixture.expected.recommendation);
  equal(result.estimatedNetProfit.minorUnits, fixture.expected.netProfitMinor);
  ok(result.estimatedNetProfit.minorUnits < 0);
});

await fixtureCase("deal-insufficient-market", async (result, fixture) => {
  equal(result.recommendation, fixture.expected.recommendation);
  equal(result.expectedResaleValue, fixture.expected.expectedResaleValue);
  ok(result.warnings.some((warning) => warning.includes("No supported expected resale value")));
});

await fixtureCase("auction-profitable", async (result, fixture) => {
  equal(result.maximumRecommendedBid.minorUnits > 0, fixture.expected.hasMaximumBid);
  equal(result.automaticBidAllowed, fixture.expected.automaticBidAllowed);
  equal(result.confidence, fixture.expected.confidence);
  equal(result.roiAtMaximumBidBasisPoints, result.assumptions.targetRoiBasisPoints);
});

await fixtureCase("auction-high-risk", async (result, fixture) => {
  equal(result.maximumRecommendedBid.minorUnits > 0, fixture.expected.hasMaximumBid);
  equal(result.automaticBidAllowed, fixture.expected.automaticBidAllowed);
  equal(result.confidence, fixture.expected.confidence);
  equal(result.riskFlags.length, fixture.expected.riskCount);
  ok(result.riskFlags.includes("CURRENT_BID_ABOVE_RECOMMENDED_MAXIMUM"));
  ok(result.riskFlags.includes("OWNER_MAXIMUM_ABOVE_RECOMMENDED_MAXIMUM"));
  ok(result.downside.profitAtRecommendedBid.minorUnits < 0);
  ok(result.warnings.some((warning) => warning.includes("Unknown contents")));
});

await fixtureCase("restock-high-confidence", async (result, fixture) => {
  equal(result.likelihoodBand, fixture.expected.likelihoodBand);
  equal(result.confidence, fixture.expected.confidence);
  equal(result.expectedWindow.timeBand, fixture.expected.timeBand);
  equal(result.probability, null);
});

await fixtureCase("restock-low-confidence", async (result, fixture) => {
  equal(result.likelihoodBand, fixture.expected.likelihoodBand);
  equal(result.expectedWindow, fixture.expected.expectedWindow);
  equal(result.probability, null);
  ok(result.warnings.some((warning) => warning.includes("sparse")));
});

await fixtureCase("owner-corrected-analysis", async (result, fixture) => {
  equal(result.proposedCondition, fixture.expected.proposedCondition);
  equal(result.ownerConfirmedCondition, "LP");
  equal(result.resolvedCondition, fixture.expected.resolvedCondition);
  ok(result.proposedCondition !== result.resolvedCondition);
});

await fixtureCase("reanalysis-new-evidence", async (result, fixture) => {
  equal(result.previous.analyzedAt, PHASE_1C_QA_CLOCK);
  equal(result.current.analyzedAt, PHASE_1C_QA_CLOCK);
  equal(result.previous.condition.proposedCondition, fixture.expected.previousCondition);
  equal(result.current.condition.proposedCondition, fixture.expected.currentCondition);
  equal(result.previous.valuation.conditionAdjustedValue.minorUnits, fixture.expected.previousValueMinor);
  equal(result.current.valuation.conditionAdjustedValue.minorUnits, fixture.expected.currentValueMinor);
  equal(result.previous.inputHash !== result.current.inputHash, fixture.expected.inputHashChanged);
  equal(result.previous.persistence.persisted, false);
  equal(result.current.persistence.persisted, false);
});

const serialized = JSON.stringify(PHASE_1C_QA_FIXTURES);
ok(!/(access[_-]?token|refresh[_-]?token|ownerSubject|authorization|clientSecret)/i.test(serialized), "Fixtures must not contain authority or credential fields.");

function assertIntegerMoney(value, path = "$") {
  if (!value || typeof value !== "object") return;
  if (Object.hasOwn(value, "minorUnits") && Object.hasOwn(value, "currency")) {
    ok(Number.isSafeInteger(value.minorUnits), `${path}.minorUnits must be a safe integer.`);
    equal(value.currency, "USD", `${path}.currency must be deterministic USD.`);
  }
  for (const [key, entry] of Object.entries(value)) assertIntegerMoney(entry, `${path}.${key}`);
}
assertIntegerMoney(PHASE_1C_QA_FIXTURES);

console.log(`Code 3 Phase 1C QA fixtures passed: ${cases}/15 cases, ${assertions} assertions.`);
