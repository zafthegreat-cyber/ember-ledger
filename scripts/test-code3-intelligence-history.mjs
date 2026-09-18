import assert from "node:assert/strict";
import {
  INTELLIGENCE_ANALYSIS_FORMAT,
  INTELLIGENCE_ANALYSIS_RECORD_TYPE,
  assertAnalysisInputHasNoAuthorityFields,
  compareAdjacentAnalyses,
  createLocalAnalysisHistory,
  hashAnalysisInput,
} from "../src/features/intelligence/analysisHistory.js";
import { normalizeEbayActiveListingEvidence } from "../src/features/intelligence/providerAdapters/ebayEvidence.js";
import { normalizeScannerEvidence } from "../src/features/intelligence/providerAdapters/scannerEvidence.js";
import { buildConditionAwareValuation } from "../src/features/intelligence/valuation.js";

class StateRepository {
  constructor(state) {
    this.state = structuredClone(state);
    this.writes = 0;
  }

  load() {
    return structuredClone(this.state);
  }

  save(nextState) {
    this.writes += 1;
    this.state = structuredClone(nextState);
    return { state: this.load(), error: "" };
  }
}

let assertions = 0;
async function test(name, callback) {
  await callback();
  assertions += 1;
  process.stdout.write(`ok ${assertions} - ${name}\n`);
}

const fixedNow = () => "2026-08-25T14:00:00.000Z";
const ids = ["analysis-one", "correction-one", "analysis-two", "analysis-three", "correction-two"];
const repository = new StateRepository({
  appraisals: [
    {
      id: "legacy-appraisal",
      title: "Existing Deal Analysis",
      recommendation: "Worth an Offer",
      createdAt: "2026-08-20T10:00:00.000Z",
    },
  ],
});
const history = createLocalAnalysisHistory({ repository, now: fixedNow, idFactory: () => ids.shift() });

const firstInput = {
  card: { name: "Example card", set: "Example Set", number: "001" },
  images: [{ side: "FRONT", referenceId: "front-1" }],
};
const secondInput = {
  images: [{ referenceId: "front-1", side: "FRONT" }, { referenceId: "back-1", side: "BACK" }],
  card: { number: "001", set: "Example Set", name: "Example card" },
};
const thirdInput = {
  ...secondInput,
  card: { ...secondInput.card, name: "Corrected example card" },
};
const firstHash = await hashAnalysisInput(firstInput);
const reorderedHash = await hashAnalysisInput({ images: firstInput.images, card: { number: "001", name: "Example card", set: "Example Set" } });
const secondHash = await hashAnalysisInput(secondInput);
const thirdHash = await hashAnalysisInput(thirdInput);

await test("history factory is fixed to LOCAL_ONLY", async () => {
  assert.equal(history.mode, "LOCAL_ONLY");
  assert.equal(history.persistenceTarget, "LOCAL");
  assert.equal("remove" in history, false);
  assert.equal("delete" in history, false);
  assert.equal("archive" in history, false);
});

await test("caller-selected persistence modes are refused, including caller-selected LOCAL_ONLY", async () => {
  assert.throws(
    () => createLocalAnalysisHistory({ repository, mode: "LOCAL_ONLY" }),
    (error) => error.code === "PERSISTENCE_MODE_NOT_CALLER_SELECTABLE",
  );
  assert.throws(
    () => createLocalAnalysisHistory({ repository, mode: "REMOTE_ACTIVE" }),
    (error) => error.code === "PERSISTENCE_MODE_NOT_CALLER_SELECTABLE",
  );
});

await test("a remote adapter is never called or accepted", async () => {
  let remoteCalls = 0;
  const remoteDataSource = {
    list() { remoteCalls += 1; },
    getById() { remoteCalls += 1; },
    create() { remoteCalls += 1; },
    update() { remoteCalls += 1; },
    archive() { remoteCalls += 1; },
  };
  assert.throws(
    () => createLocalAnalysisHistory({ repository, remoteDataSource }),
    (error) => error.code === "PERSISTENCE_MODE_NOT_CALLER_SELECTABLE",
  );
  assert.equal(remoteCalls, 0);
});

await test("canonical input hashing is deterministic", async () => {
  assert.equal(firstHash, reorderedHash);
  assert.notEqual(firstHash, secondHash);
  assert.match(firstHash, /^[a-f0-9]{64}$/);
});

await test("nested owner, role, session, token, and security authority is rejected", async () => {
  const unsafe = [
    { nested: { ownerSubject: "forged" } },
    { nested: [{ role: "OWNER" }] },
    { nested: { session: { value: "forged" } } },
    { nested: { access_token: "forged" } },
    { nested: { securityContext: { permitted: true } } },
  ];
  unsafe.forEach((value) => {
    assert.throws(
      () => assertAnalysisInputHasNoAuthorityFields(value),
      (error) => error.code === "AUTHORITY_FIELD_REJECTED",
    );
  });
  assert.doesNotThrow(() => assertAnalysisInputHasNoAuthorityFields({ ownerCorrections: [], ownerConfirmedCondition: "LP" }));
  const sharedEvidence = { sourceId: "shared-source" };
  assert.doesNotThrow(() => assertAnalysisInputHasNoAuthorityFields({ first: sharedEvidence, second: sharedEvidence }));
  const cycle = {};
  cycle.self = cycle;
  assert.throws(
    () => assertAnalysisInputHasNoAuthorityFields(cycle),
    (error) => error.code === "CYCLIC_ANALYSIS_INPUT",
  );
});

let first;
await test("initial analysis appends a tagged immutable system revision", async () => {
  first = await history.createAnalysis({
    analysisType: "CARD",
    methodologyVersion: "code3.card-analysis.v1",
    inputHash: firstHash,
    normalizedInput: firstInput,
    workflowSnapshot: { title: "Saved workflow", purchasePrice: "20.00" },
    evidence: { observations: [{ defect: "EDGE_WHITENING", severity: "MINOR" }] },
    warnings: [],
    systemResult: {
      condition: {
        proposedCondition: "LP",
        ownerConfirmedCondition: null,
        resolvedCondition: "LP",
        explanation: "Minor edge whitening was observed.",
      },
      valuation: { conditionAdjustedValue: { minorUnits: 4200, currency: "USD" } },
    },
  });
  assert.equal(first.id, "analysis-one");
  assert.equal(first.format, INTELLIGENCE_ANALYSIS_FORMAT);
  assert.equal(first.recordType, INTELLIGENCE_ANALYSIS_RECORD_TYPE);
  assert.equal(first.analysisSeriesId, "analysis-series:analysis-one");
  assert.equal(first.revision, 1);
  assert.equal(first.previousAnalysisId, null);
  assert.equal(first.recordVersion, 1);
  assert.deepEqual(first.workflowSnapshot, { title: "Saved workflow", purchasePrice: "20.00" });
  assert.equal(first.ownerReview.status, "PENDING");
});

await test("legacy appraisals remain stored but are ignored by intelligence history", async () => {
  assert.equal((await history.listAnalyses()).length, 1);
  assert.equal(await history.getAnalysis("legacy-appraisal"), null);
  assert.ok(repository.state.appraisals.some((record) => record.id === "legacy-appraisal"));
});

await test("analysis create cannot smuggle owner scope through nested source data", async () => {
  await assert.rejects(
    () => history.createAnalysis({
      analysisType: "CARD",
      methodologyVersion: "code3.card-analysis.v1",
      inputHash: firstHash,
      normalizedInput: { listing: { owner_id: "forged" } },
      systemResult: { condition: "LP" },
    }),
    (error) => error.code === "AUTHORITY_FIELD_REJECTED",
  );
});

await test("analysis creation verifies normalized and system-result input hashes before writing", async () => {
  const writesBefore = repository.writes;
  await assert.rejects(
    () => history.createAnalysis({
      analysisType: "CARD",
      methodologyVersion: "code3.card-analysis.v1",
      inputHash: "0".repeat(64),
      normalizedInput: firstInput,
      systemResult: { condition: "LP" },
    }),
    (error) => error.code === "INPUT_HASH_MISMATCH",
  );
  await assert.rejects(
    () => history.createAnalysis({
      analysisType: "CARD",
      methodologyVersion: "code3.card-analysis.v1",
      inputHash: firstHash,
      normalizedInput: firstInput,
      systemResult: { inputHash: "0".repeat(64), condition: "LP" },
    }),
    (error) => error.code === "SYSTEM_RESULT_INPUT_HASH_MISMATCH",
  );
  await assert.rejects(
    () => history.createAnalysis({
      analysisType: "CARD",
      methodologyVersion: "code3.card-analysis.v1",
      inputHash: firstHash,
      normalizedInput: firstInput,
      systemResult: { inputHash: firstHash, normalizedInput: secondInput, condition: "LP" },
    }),
    (error) => error.code === "SYSTEM_RESULT_INPUT_MISMATCH",
  );
  await assert.rejects(
    () => history.createAnalysis({
      analysisType: "CARD",
      methodologyVersion: "code3.card-analysis.v1",
      inputHash: firstHash,
      systemResult: { condition: "LP" },
    }),
    (error) => error.code === "NORMALIZED_INPUT_REQUIRED",
  );
  assert.equal(repository.writes, writesBefore);
});

let corrected;
await test("owner correction is version-checked and does not mutate the system proposal", async () => {
  corrected = await history.recordOwnerCorrection(first.id, {
    confirmedCondition: "NM",
    manualValues: { estimatedValue: { minorUnits: 4500, currency: "USD" } },
    dismissedWarningCodes: ["IMAGE_GLARE", "STALE_COMPARABLES"],
    note: "Owner inspected the card outside the sleeve.",
    reviewStatus: "CONFIRMED",
  }, first.recordVersion);
  assert.equal(corrected.recordVersion, 2);
  assert.equal(corrected.ownerReview.ownerConfirmedCondition, "NM");
  assert.equal(corrected.ownerReview.corrections[0].source, "OWNER_ENTERED");
  assert.deepEqual(corrected.ownerReview.corrections[0].changes.ownerConfirmedCondition, {
    previousValue: null,
    newValue: "NM",
  });
  assert.deepEqual(corrected.ownerReview.corrections[0].changes.manualValues.estimatedValue, {
    previousValue: null,
    newValue: { minorUnits: 4500, currency: "USD" },
  });
  assert.equal(corrected.systemResult.condition.proposedCondition, "LP");
  assert.equal(corrected.systemResult.valuation.conditionAdjustedValue.minorUnits, 4200);
  assert.deepEqual(corrected.ownerReview.dismissedWarningCodes, ["IMAGE_GLARE", "STALE_COMPARABLES"]);
  await assert.rejects(
    () => history.recordOwnerCorrection(first.id, { confirmedCondition: "MP" }, first.recordVersion),
    (error) => error.code === "VERSION_CONFLICT",
  );
});

await test("owner manual estimated value enforces exact minor-unit money and analysis currency", async () => {
  const writesBefore = repository.writes;
  for (const estimatedValue of [
    { minorUnits: 1.5, currency: "USD" },
    { minorUnits: Number.NaN, currency: "USD" },
    { minorUnits: Number.MAX_SAFE_INTEGER + 1, currency: "USD" },
    { minorUnits: -1, currency: "USD" },
    { minorUnits: 100, currency: "US" },
    { amountMinor: 100, currency: "USD" },
  ]) {
    await assert.rejects(
      () => history.recordOwnerCorrection(first.id, { manualValues: { estimatedValue } }, corrected.recordVersion),
      (error) => error.code === "INVALID_MANUAL_ESTIMATED_VALUE",
    );
  }
  await assert.rejects(
    () => history.recordOwnerCorrection(first.id, {
      manualValues: { estimatedValue: { minorUnits: 4_500, currency: "EUR" } },
    }, corrected.recordVersion),
    (error) => error.code === "MANUAL_VALUE_CURRENCY_MISMATCH",
  );
  assert.equal(repository.writes, writesBefore);
});

await test("nested authority fields in a manual correction are rejected", async () => {
  await assert.rejects(
    () => history.recordOwnerCorrection(first.id, { manualValues: { metadata: { permissions: ["OWNER"] } } }, corrected.recordVersion),
    (error) => error.code === "AUTHORITY_FIELD_REJECTED",
  );
});

let second;
await test("reanalysis appends a revision and explicitly carries prior owner confirmation", async () => {
  second = await history.reanalyze(first.id, {
    analysisType: "CARD",
    methodologyVersion: "code3.card-analysis.v1",
    inputHash: secondHash,
    normalizedInput: secondInput,
    evidence: { observations: [{ defect: "SURFACE_SCRATCH", severity: "MODERATE" }] },
    systemResult: {
      condition: {
        proposedCondition: "MP",
        ownerConfirmedCondition: null,
        resolvedCondition: "MP",
        explanation: "Additional back-image whitening and surface wear were observed.",
      },
      valuation: { conditionAdjustedValue: { minorUnits: 3100, currency: "USD" } },
    },
  });
  assert.equal(second.revision, 2);
  assert.equal(second.previousAnalysisId, first.id);
  assert.equal(second.analysisSeriesId, first.analysisSeriesId);
  assert.equal(second.ownerReview.ownerConfirmedCondition, "NM");
  assert.equal(second.ownerReview.status, "REVIEW_REQUIRED_AFTER_REANALYSIS");
  assert.equal(second.ownerReview.carriedFrom.analysisId, first.id);
  assert.equal(second.systemResult.condition.proposedCondition, "MP");
  const unchangedPrior = await history.getAnalysis(first.id);
  assert.equal(unchangedPrior.ownerReview.ownerConfirmedCondition, "NM");
  assert.equal(unchangedPrior.systemResult.condition.proposedCondition, "LP");
});

await test("reanalysis rejects normalized-input and system-result hash mismatches without writing", async () => {
  const writesBefore = repository.writes;
  await assert.rejects(
    () => history.reanalyze(second.id, {
      analysisType: "CARD",
      methodologyVersion: "code3.card-analysis.v1",
      inputHash: firstHash,
      normalizedInput: thirdInput,
      systemResult: { condition: "MP" },
    }),
    (error) => error.code === "INPUT_HASH_MISMATCH",
  );
  await assert.rejects(
    () => history.reanalyze(second.id, {
      analysisType: "CARD",
      methodologyVersion: "code3.card-analysis.v1",
      inputHash: thirdHash,
      normalizedInput: thirdInput,
      systemResult: { inputHash: secondHash, condition: "MP" },
    }),
    (error) => error.code === "SYSTEM_RESULT_INPUT_HASH_MISMATCH",
  );
  assert.equal(repository.writes, writesBefore);
});

await test("stale reanalysis bases cannot fork history", async () => {
  await assert.rejects(
    () => history.reanalyze(first.id, {
      analysisType: "CARD",
      methodologyVersion: "code3.card-analysis.v1",
      inputHash: secondHash,
      systemResult: { condition: "MP" },
    }),
    (error) => error.code === "HISTORY_BASE_NOT_LATEST",
  );
});

await test("adjacent comparison is deterministic and explains the new result", async () => {
  const comparison = compareAdjacentAnalyses(await history.getAnalysis(first.id), second);
  assert.deepEqual(comparison.changes, ["CONDITION", "VALUE", "INPUT"]);
  assert.match(comparison.summary, /Previous analysis: LP \/ \$42\.00/);
  assert.match(comparison.summary, /Current analysis: MP \/ \$31\.00/);
  assert.equal(comparison.previous.resolvedCondition, "NM");
  assert.equal(comparison.current.resolvedCondition, "NM");
  assert.equal(comparison.previous.resolvedValue.amountMinor, 4500);
  assert.equal(comparison.current.resolvedValue.amountMinor, 4500);
  assert.match(comparison.reason, /Additional back-image whitening/i);
  assert.deepEqual(await history.compareWithPrevious(second.id), comparison);
  assert.throws(
    () => compareAdjacentAnalyses(second, awaitableFakeRecord()),
    (error) => error.code === "ANALYSES_NOT_ADJACENT",
  );
});

await test("owner review can explicitly clear values and replace dismissed warnings with provenance", async () => {
  const cleared = await history.recordOwnerCorrection(second.id, {
    confirmedCondition: "",
    manualValues: { estimatedValue: null },
    dismissedWarningCodes: [],
    note: "Owner cleared the prior review after reconsidering the new evidence.",
    reviewStatus: "CONFIRMED",
  }, second.recordVersion);
  assert.equal(cleared.ownerReview.ownerConfirmedCondition, null);
  assert.equal(Object.prototype.hasOwnProperty.call(cleared.ownerReview.manualValues, "estimatedValue"), false);
  assert.deepEqual(cleared.ownerReview.dismissedWarningCodes, []);
  const lastCorrection = cleared.ownerReview.corrections.at(-1);
  assert.deepEqual(lastCorrection.changes.ownerConfirmedCondition, { previousValue: "NM", newValue: null });
  assert.deepEqual(lastCorrection.changes.manualValues.estimatedValue, {
    previousValue: { minorUnits: 4500, currency: "USD" },
    newValue: null,
  });
  assert.deepEqual(lastCorrection.changes.dismissedWarningCodes, {
    previousValue: ["IMAGE_GLARE", "STALE_COMPARABLES"],
    newValue: [],
  });
  assert.equal(lastCorrection.source, "OWNER_ENTERED");
});

function comparisonRecord({ id, revision, previousAnalysisId, inputHash, valueMinor }) {
  return {
    id,
    format: INTELLIGENCE_ANALYSIS_FORMAT,
    recordType: INTELLIGENCE_ANALYSIS_RECORD_TYPE,
    analysisSeriesId: "analysis-series:comparison",
    revision,
    previousAnalysisId,
    inputHash,
    systemResult: {
      condition: {
        proposedCondition: "LP",
        explanation: "Minor edge whitening was observed.",
      },
      valuation: {
        predictedResale: {
          median: { minorUnits: valueMinor, currency: "USD" },
        },
      },
      dealIntelligence: {
        expectedResaleValue: { minorUnits: valueMinor, currency: "USD" },
      },
    },
    ownerReview: {},
  };
}

await test("UI-shaped value-only comparison uses expected resale and a value-specific reason", async () => {
  const prior = comparisonRecord({ id: "comparison-one", revision: 1, previousAnalysisId: null, inputHash: "same-input", valueMinor: 4_200 });
  const current = comparisonRecord({ id: "comparison-two", revision: 2, previousAnalysisId: prior.id, inputHash: "same-input", valueMinor: 3_100 });
  const comparison = compareAdjacentAnalyses(prior, current);
  assert.deepEqual(comparison.changes, ["VALUE"]);
  assert.match(comparison.summary, /Previous analysis: LP \/ \$42\.00/);
  assert.match(comparison.summary, /Current analysis: LP \/ \$31\.00/);
  assert.match(comparison.reason, /valuation evidence or assumptions changed/i);
  assert.doesNotMatch(comparison.reason, /edge whitening/i);
});

await test("history comparison preserves exact cents near the safe integer boundary", async () => {
  const prior = comparisonRecord({ id: "boundary-one", revision: 1, previousAnalysisId: null, inputHash: "same-boundary-input", valueMinor: Number.MAX_SAFE_INTEGER - 1 });
  const current = comparisonRecord({ id: "boundary-two", revision: 2, previousAnalysisId: prior.id, inputHash: "same-boundary-input", valueMinor: Number.MAX_SAFE_INTEGER });
  const comparison = compareAdjacentAnalyses(prior, current);
  assert.match(comparison.summary, /Previous analysis: LP \/ \$90,071,992,547,409\.90/);
  assert.match(comparison.summary, /Current analysis: LP \/ \$90,071,992,547,409\.91/);
});

await test("adjacent comparison reports changed identity fields with an identity-specific reason", async () => {
  const prior = {
    ...comparisonRecord({ id: "identity-one", revision: 1, previousAnalysisId: null, inputHash: "identity-input-one", valueMinor: 4_200 }),
    sourceInput: { identity: { productName: "Example card", set: "Example Set", cardNumber: "001", variant: "Holo" } },
  };
  const current = {
    ...comparisonRecord({ id: "identity-two", revision: 2, previousAnalysisId: prior.id, inputHash: "identity-input-two", valueMinor: 4_200 }),
    sourceInput: { identity: { productName: "Corrected card", set: "Example Set", cardNumber: "002", variant: "Holo" } },
  };
  const comparison = compareAdjacentAnalyses(prior, current);
  assert.deepEqual(comparison.changes, ["IDENTITY", "INPUT"]);
  assert.deepEqual(comparison.identityFieldsChanged, ["cardNumber", "productName"]);
  assert.match(comparison.reason, /product identity changed/i);
  assert.match(comparison.reason, /cardNumber/);
  assert.equal(comparison.previous.identity.productName, "Example card");
  assert.equal(comparison.current.identity.productName, "Corrected card");
});

await test("no-op reanalysis does not claim a condition-change rationale", async () => {
  const prior = comparisonRecord({ id: "no-op-one", revision: 1, previousAnalysisId: null, inputHash: "unchanged", valueMinor: 4_200 });
  const current = comparisonRecord({ id: "no-op-two", revision: 2, previousAnalysisId: prior.id, inputHash: "unchanged", valueMinor: 4_200 });
  const comparison = compareAdjacentAnalyses(prior, current);
  assert.deepEqual(comparison.changes, []);
  assert.match(comparison.reason, /did not materially change/i);
  assert.doesNotMatch(comparison.reason, /edge whitening/i);
});

function awaitableFakeRecord() {
  return {
    ...structuredClone(second),
    id: "not-adjacent",
    revision: 5,
    previousAnalysisId: "another-record",
  };
}

await test("history listing returns only tagged records with newest revision first", async () => {
  const records = await history.listAnalyses({ analysisType: "CARD" });
  assert.deepEqual(records.map((record) => record.id), [second.id, first.id]);
  assert.equal(records.every((record) => record.format === INTELLIGENCE_ANALYSIS_FORMAT), true);
  assert.equal(repository.state.appraisals.length, 3);
});

await test("eBay evidence stays active-listing evidence and never becomes a sold comparable", async () => {
  const evidence = normalizeEbayActiveListingEvidence({
    id: "provider-row-1",
    externalListingId: "v1|123|0",
    originalListingUrl: "https://www.ebay.com/itm/123",
    title: "Example listing",
    description: "Provider description",
    productClassification: "Raw card",
    condition: "Used",
    askingPrice: 29.99,
    currentBid: "24.50",
    purchaseShipping: 4.5,
    priceCurrency: "USD",
    imageReferences: ["https://i.ebayimg.com/example.jpg"],
    providerState: "Active",
    lastCheckedAt: "2026-08-25T13:00:00.000Z",
  });
  assert.equal(evidence.sourceKind, "ACTIVE_LISTING_SNAPSHOT");
  assert.equal(evidence.listingState, "ACTIVE");
  assert.deepEqual(evidence.valuationEvidence.soldComparables, []);
  assert.equal(evidence.coverage.completedSaleEvidence, false);
  assert.equal(evidence.valuationEvidence.activeListings[0].amount.minorUnits, 2999);
  assert.equal(evidence.valuationEvidence.activeListings[0].type, "ACTIVE_LISTING");
  assert.equal(evidence.valuationEvidence.activeListings[0].priceRole, "ASKING_PRICE");
  assert.equal(evidence.valuationEvidence.activeListings[0].shipping.minorUnits, 450);
  assert.equal(evidence.imageReferences[0].imageAnalysisPerformed, false);
  assert.ok(evidence.limitations.some((text) => /not a completed sale/i.test(text)));
  const valuation = buildConditionAwareValuation({
    evidence: evidence.valuationEvidence.activeListings,
    asOf: "2026-08-25T14:00:00.000Z",
    condition: "LP",
  });
  assert.equal(valuation.completedSales.count, 0);
  assert.equal(valuation.activeListings.count, 2);
  assert.equal(valuation.conditionAdjustedValue, null);
  assert.ok(valuation.warnings.some((warning) => /active asking prices/i.test(warning)));
});

await test("eBay adapter preserves unavailable and unsupported money honestly", async () => {
  const evidence = normalizeEbayActiveListingEvidence({
    title: "Missing provider fields",
    askingPrice: "12.345",
    priceCurrency: "USD",
  });
  assert.equal(evidence.externalIdentity.externalListingId, null);
  assert.equal(evidence.observedAt, null);
  assert.equal(evidence.valuationEvidence.activeListings.length, 0);
  assert.ok(evidence.warnings.some((warning) => warning.code === "INVALID_ACTIVE_ASKING_PRICE"));
  assert.ok(evidence.warnings.some((warning) => warning.code === "MISSING_EXTERNAL_LISTING_ID"));
});

await test("eBay evidence cannot override owner scope", async () => {
  assert.throws(
    () => normalizeEbayActiveListingEvidence({ title: "Unsafe", nested: { ownerSubject: "forged" } }),
    (error) => error.code === "AUTHORITY_FIELD_REJECTED",
  );
});

await test("scanner boundary preserves four distinct provenance classes and claims no image model", async () => {
  const evidence = normalizeScannerEvidence({
    scanId: "scan-1",
    observedAt: "2026-08-25T13:30:00.000Z",
    barcode: { value: "012345678901", symbology: "UPC_A", confidence: "HIGH" },
    catalogMatch: { name: "Catalog product", sourceId: "catalog:record-1", confidence: "MEDIUM" },
    providerEvidence: { language: "English", sourceId: "provider:record-1" },
    ownerEvidence: { variant: "Holo", confidence: "HIGH" },
    inferredEvidence: { printing: "Possible first printing", confidence: "LOW" },
    imageReferences: [{ url: "blob:local-front", side: "FRONT", ownerEntered: true }],
  });
  assert.deepEqual(
    [...new Set(evidence.observations.map((observation) => observation.provenance.kind))].sort(),
    ["INFERRED", "MACHINE_OBSERVED", "OWNER_ENTERED", "PROVIDER_SUPPLIED"].sort(),
  );
  assert.equal(evidence.capabilities.computerVision, false);
  assert.equal(evidence.capabilities.ocr, false);
  assert.equal(evidence.capabilities.conditionAssessment, false);
  assert.equal(evidence.imageReferences[0].imageAnalysisPerformed, false);
  assert.ok(evidence.warnings.some((warning) => warning.code === "IMAGES_NOT_ANALYZED"));
});

await test("scanner boundary cannot smuggle a browser role or token", async () => {
  assert.throws(
    () => normalizeScannerEvidence({ ownerEvidence: { note: "Unsafe", metadata: { role: "OWNER" } } }),
    (error) => error.code === "AUTHORITY_FIELD_REJECTED",
  );
  assert.throws(
    () => normalizeScannerEvidence({ inferredEvidence: { accessToken: "forged" } }),
    (error) => error.code === "AUTHORITY_FIELD_REJECTED",
  );
});

console.log(`Code 3 intelligence history/provider tests passed (${assertions} cases; LOCAL_ONLY, append-only revisions, owner provenance, and honest provider evidence).`);
