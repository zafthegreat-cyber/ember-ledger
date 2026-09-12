import assert from "node:assert/strict";
import {
  AUCTION_TAX_MODE,
  CARD_CONDITION,
  DEAL_RECOMMENDATION,
  DEFECT_SEVERITY,
  DEFECT_TYPE,
  EVIDENCE_PROVENANCE,
  IMAGE_SIDE,
  INTELLIGENCE_CONFIDENCE,
  LOT_ITEM_CERTAINTY,
  RESTOCK_LIKELIHOOD,
  RESTOCK_OBSERVATION_TYPE,
  VALUE_EVIDENCE_TYPE,
  IntelligenceContractError,
  IntelligenceMoneyError,
  addMoney,
  analyzeAuctionIntelligence,
  analyzeDealIntelligence,
  analyzeMultiItemLot,
  analyzeRestockIntelligence,
  assessCardCondition,
  buildConditionAwareValuation,
  calculateBasisPointAmount,
  createCardAnalysisPipeline,
  createMoney,
  evaluateConfidence,
  formatMoneyForDisplay,
  formatMoneyForExplanation,
  minorUnitsToMajorString,
  parseMajorMoney,
} from "../src/features/intelligence/index.js";
import { hashCanonicalJson } from "../src/features/backup/canonicalJson.js";

let assertions = 0;
function test(name, callback) {
  try {
    callback();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function asyncTest(name, callback) {
  try {
    await callback();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function equal(actual, expected, message) {
  assertions += 1;
  assert.equal(actual, expected, message);
}

function ok(value, message) {
  assertions += 1;
  assert.ok(value, message);
}

function throws(callback, ErrorClass, code) {
  assertions += 1;
  assert.throws(callback, (error) => error instanceof ErrorClass && (!code || error.code === code));
}

const usd = (minorUnits) => createMoney(minorUnits, "USD");
const image = (side, quality = INTELLIGENCE_CONFIDENCE.HIGH, effects = {}) => ({
  imageId: `${side.toLowerCase()}-${quality.toLowerCase()}`,
  reference: `local://${side.toLowerCase()}`,
  side,
  quality,
  effects,
  provenance: EVIDENCE_PROVENANCE.OWNER_ENTERED,
});
const defect = (defectType, severity, extra = {}) => ({
  defectType,
  severity,
  confidence: INTELLIGENCE_CONFIDENCE.HIGH,
  provenance: EVIDENCE_PROVENANCE.OWNER_ENTERED,
  side: IMAGE_SIDE.FRONT,
  ...extra,
});
const completeImages = [image(IMAGE_SIDE.FRONT), image(IMAGE_SIDE.BACK)];

test("pristine complete inspection proposes NM without grading claim", () => {
  const result = assessCardCondition({ images: completeImages, observations: [], inspectionComplete: true });
  equal(result.proposedCondition, CARD_CONDITION.NM);
  equal(result.professionalGradePrediction, null);
  ok(result.explanation.includes("unseen defects"));
});

test("minor edge whitening proposes LP", () => {
  const result = assessCardCondition({
    images: completeImages,
    observations: [defect(DEFECT_TYPE.WHITENING, DEFECT_SEVERITY.MINOR, { side: IMAGE_SIDE.BACK, locations: ["top edge"] })],
    inspectionComplete: true,
  });
  equal(result.proposedCondition, CARD_CONDITION.LP);
  ok(result.explanation.includes("whitening"));
});

test("cumulative moderate wear proposes MP", () => {
  const result = assessCardCondition({
    images: completeImages,
    observations: [
      defect(DEFECT_TYPE.EDGE_WEAR, DEFECT_SEVERITY.MODERATE, { side: IMAGE_SIDE.BACK }),
      defect(DEFECT_TYPE.SURFACE_SCRATCHES, DEFECT_SEVERITY.MODERATE),
    ],
    inspectionComplete: true,
  });
  equal(result.proposedCondition, CARD_CONDITION.MP);
});

test("severe cumulative wear proposes HP", () => {
  const result = assessCardCondition({
    images: completeImages,
    observations: [
      defect(DEFECT_TYPE.EDGE_WEAR, DEFECT_SEVERITY.SEVERE),
      defect(DEFECT_TYPE.HOLO_SCRATCHING, DEFECT_SEVERITY.SEVERE),
    ],
    inspectionComplete: true,
  });
  equal(result.proposedCondition, CARD_CONDITION.HP);
});

test("severe crease forces DMG", () => {
  const result = assessCardCondition({
    images: completeImages,
    observations: [defect(DEFECT_TYPE.CREASES, DEFECT_SEVERITY.SEVERE, { structuralDamage: true })],
    inspectionComplete: true,
  });
  equal(result.proposedCondition, CARD_CONDITION.DMG);
  equal(result.structuralDamageIdentified, true);
});

test("moderate tear or cut forces DMG", () => {
  equal(assessCardCondition({ images: completeImages, observations: [defect(DEFECT_TYPE.TEARS, DEFECT_SEVERITY.MODERATE)] }).proposedCondition, CARD_CONDITION.DMG);
  equal(assessCardCondition({ images: completeImages, observations: [defect(DEFECT_TYPE.CUTS, DEFECT_SEVERITY.MODERATE)] }).proposedCondition, CARD_CONDITION.DMG);
});

test("conflicting observations reduce confidence and remain visible", () => {
  const shared = { side: IMAGE_SIDE.BACK, locations: ["top edge"] };
  const result = assessCardCondition({
    images: completeImages,
    observations: [
      defect(DEFECT_TYPE.WHITENING, DEFECT_SEVERITY.MODERATE, shared),
      defect(DEFECT_TYPE.WHITENING, DEFECT_SEVERITY.MINOR, { ...shared, observed: false }),
    ],
    inspectionComplete: true,
  });
  equal(result.contradictions.length, 1);
  ok(result.uncertainty.some((value) => value.includes("conflicts")));
});

test("poor incomplete imagery yields no unsupported condition", () => {
  const result = assessCardCondition({
    images: [image(IMAGE_SIDE.FRONT, INTELLIGENCE_CONFIDENCE.LOW, { glare: true, sleeve: true })],
    observations: [],
    inspectionComplete: false,
  });
  equal(result.proposedCondition, null);
  equal(result.confidence, INTELLIGENCE_CONFIDENCE.INSUFFICIENT);
  ok(result.defectsNotAssessable.length >= 2);
});

test("centering alone does not lower condition", () => {
  const result = assessCardCondition({
    images: completeImages,
    observations: [defect(DEFECT_TYPE.CENTERING_OBSERVATION, DEFECT_SEVERITY.SEVERE)],
    inspectionComplete: true,
  });
  equal(result.proposedCondition, CARD_CONDITION.NM);
  equal(result.centeringObservations.length, 1);
});

test("strict major-unit parsing preserves exact minor units", () => {
  equal(parseMajorMoney("42.07", { currency: "USD" }).minorUnits, 4_207);
  equal(parseMajorMoney("1", { currency: "USD" }).minorUnits, 100);
  throws(() => parseMajorMoney(42.07), IntelligenceMoneyError, "MAJOR_STRING_REQUIRED");
  throws(() => parseMajorMoney("1.001"), IntelligenceMoneyError, "EXCESS_PRECISION");
  throws(() => parseMajorMoney("NaN"), IntelligenceMoneyError, "MALFORMED_MONEY");
});

test("money rejects currency mixing and calculates fees with declared rounding", () => {
  throws(() => addMoney([usd(100), createMoney(100, "CAD")]), IntelligenceMoneyError, "CURRENCY_MISMATCH");
  const fee = calculateBasisPointAmount(usd(101), 250);
  equal(fee.amount.minorUnits, 3);
  equal(fee.rounding.method, "HALF_UP_TO_MINOR_UNIT");
  equal(fee.rounding.direction, "UP");
});

test("money formatting preserves exact cents at both safe-integer boundaries", () => {
  equal(minorUnitsToMajorString(Number.MAX_SAFE_INTEGER), "90071992547409.91");
  equal(minorUnitsToMajorString(Number.MIN_SAFE_INTEGER), "-90071992547409.91");
  equal(formatMoneyForExplanation(usd(Number.MAX_SAFE_INTEGER)), "USD 90071992547409.91");
  equal(formatMoneyForExplanation(createMoney(Number.MIN_SAFE_INTEGER, "USD", { allowNegative: true })), "-USD 90071992547409.91");
  equal(formatMoneyForDisplay(usd(Number.MAX_SAFE_INTEGER)), "$90,071,992,547,409.91");
});

const sold = (id, amount, daysAgo, extra = {}) => ({
  evidenceId: id,
  type: VALUE_EVIDENCE_TYPE.SOLD_COMPARABLE,
  amount: usd(amount),
  shipping: usd(extra.shipping ?? 0),
  soldAt: new Date(Date.UTC(2026, 7, 25) - daysAgo * 86_400_000).toISOString(),
  verifiedCompletedSale: true,
  sourceId: id,
  underlyingSourceId: extra.underlyingSourceId || id,
  sourceQuality: Object.prototype.hasOwnProperty.call(extra, "sourceQuality") ? extra.sourceQuality : INTELLIGENCE_CONFIDENCE.HIGH,
  condition: Object.prototype.hasOwnProperty.call(extra, "condition") ? extra.condition : CARD_CONDITION.NM,
});

test("valuation keeps active asking prices separate from sold evidence", () => {
  const valuation = buildConditionAwareValuation({
    evidence: [
      sold("sale-1", 4_000, 10),
      sold("sale-2", 4_200, 8),
      sold("sale-3", 4_100, 5),
      { evidenceId: "ask", type: VALUE_EVIDENCE_TYPE.ACTIVE_LISTING, amount: usd(99_900), observedAt: "2026-08-24T00:00:00.000Z", sourceId: "market" },
    ],
    condition: CARD_CONDITION.NM,
    identityConfidence: INTELLIGENCE_CONFIDENCE.HIGH,
    conditionConfidence: INTELLIGENCE_CONFIDENCE.HIGH,
    asOf: "2026-08-25T00:00:00.000Z",
  });
  equal(valuation.completedSales.median.minorUnits, 4_100);
  equal(valuation.activeListings.median.minorUnits, 99_900);
  equal(valuation.rawReferenceValue.minorUnits, 4_100);
  ok(valuation.warnings.some((warning) => warning.includes("Active asking")));
});

test("valuation calculates an even-sample median without overflowing safe minor units", () => {
  const valuation = buildConditionAwareValuation({
    evidence: [
      sold("boundary-sale-1", Number.MAX_SAFE_INTEGER - 1, 2),
      sold("boundary-sale-2", Number.MAX_SAFE_INTEGER, 1),
    ],
    condition: CARD_CONDITION.NM,
    identityConfidence: INTELLIGENCE_CONFIDENCE.HIGH,
    conditionConfidence: INTELLIGENCE_CONFIDENCE.HIGH,
    asOf: "2026-08-25T00:00:00.000Z",
  });
  equal(valuation.completedSales.median.minorUnits, Number.MAX_SAFE_INTEGER);
  equal(valuation.completedSales.medianRounding.exactWhenEven, false);
  equal(valuation.conditionAdjustedValue.minorUnits, Number.MAX_SAFE_INTEGER);
});

test("valuation excludes a clear outlier and accounts for shipping", () => {
  const valuation = buildConditionAwareValuation({
    evidence: [sold("s1", 4_000, 1, { shipping: 500 }), sold("s2", 4_100, 2, { shipping: 500 }), sold("s3", 4_200, 3, { shipping: 500 }), sold("s4", 4_300, 4, { shipping: 500 }), sold("outlier", 50_000, 5)],
    condition: CARD_CONDITION.LP,
    identityConfidence: INTELLIGENCE_CONFIDENCE.HIGH,
    conditionConfidence: INTELLIGENCE_CONFIDENCE.MEDIUM,
    asOf: "2026-08-25T00:00:00.000Z",
  });
  equal(valuation.outlierTreatment.excludedEvidenceIds[0], "outlier");
  equal(valuation.completedSales.median.minorUnits, 4_650);
  equal(valuation.conditionAdjustedValue.minorUnits, 3_953);
  equal(valuation.conditionBasis.mode, "NM_BASELINE_ADJUSTED");
});

test("matched-condition completed sales are not adjusted a second time", () => {
  const valuation = buildConditionAwareValuation({
    evidence: [
      sold("mp-1", 3_000, 3, { condition: CARD_CONDITION.MP }),
      sold("mp-2", 3_200, 2, { condition: CARD_CONDITION.MP }),
    ],
    condition: CARD_CONDITION.MP,
    identityConfidence: INTELLIGENCE_CONFIDENCE.HIGH,
    conditionConfidence: INTELLIGENCE_CONFIDENCE.HIGH,
    asOf: "2026-08-25T00:00:00.000Z",
  });
  equal(valuation.completedSales.median.minorUnits, 3_100);
  equal(valuation.conditionAdjustedValue.minorUnits, 3_100);
  equal(valuation.conditionAdjustmentBasisPoints, 10_000);
  equal(valuation.conditionBasis.mode, "MATCHED_CONDITION");
  equal(valuation.conditionBasis.doubleAdjustmentPrevented, true);
});

test("mixed and unknown comparable conditions are excluded transparently", () => {
  const valuation = buildConditionAwareValuation({
    evidence: [
      sold("matched-mp", 3_000, 2, { condition: CARD_CONDITION.MP }),
      sold("incompatible-lp", 4_000, 2, { condition: CARD_CONDITION.LP }),
      sold("unknown-condition", 5_000, 2, { condition: null }),
      sold("lower-priority-nm", 5_500, 2, { condition: CARD_CONDITION.NM }),
    ],
    condition: CARD_CONDITION.MP,
    asOf: "2026-08-25T00:00:00.000Z",
  });
  equal(valuation.completedSales.count, 1);
  equal(valuation.conditionAdjustedValue.minorUnits, 3_000);
  equal(valuation.sourceCoverage.verifiedCompletedSaleCount, 4);
  equal(valuation.sourceCoverage.conditionBasisExcludedCount, 3);
  ok(valuation.warnings.some((warning) => /condition basis is unknown/i.test(warning)));
  ok(valuation.warnings.some((warning) => /condition was incompatible/i.test(warning)));
  ok(valuation.warnings.some((warning) => /matched-condition sales take priority/i.test(warning)));
});

test("unknown or incompatible-only comparable conditions decline a condition estimate", () => {
  const unknown = buildConditionAwareValuation({
    evidence: [sold("unknown-only", 4_000, 2, { condition: null })],
    condition: CARD_CONDITION.LP,
    asOf: "2026-08-25T00:00:00.000Z",
  });
  equal(unknown.conditionAdjustedValue, null);
  equal(unknown.conditionBasis.mode, "NO_COMPATIBLE_COMPLETED_SALES");
  equal(unknown.confidence.band, INTELLIGENCE_CONFIDENCE.INSUFFICIENT);

  const incompatible = buildConditionAwareValuation({
    evidence: [sold("mp-only", 3_000, 2, { condition: CARD_CONDITION.MP })],
    condition: CARD_CONDITION.LP,
    asOf: "2026-08-25T00:00:00.000Z",
  });
  equal(incompatible.conditionAdjustedValue, null);
  equal(incompatible.conditionBasis.mode, "NO_COMPATIBLE_COMPLETED_SALES");
});

test("valuation validates subject condition, comparable condition, and source quality vocabularies", () => {
  throws(() => buildConditionAwareValuation({ evidence: [], condition: "MINT" }), Error);
  throws(() => buildConditionAwareValuation({
    evidence: [sold("invalid-condition", 4_000, 2, { condition: "EXCELLENT" })],
    condition: CARD_CONDITION.LP,
  }), Error);
  throws(() => buildConditionAwareValuation({
    evidence: [sold("invalid-quality", 4_000, 2, { sourceQuality: "TRUST_ME" })],
    condition: CARD_CONDITION.LP,
  }), Error);
  throws(() => buildConditionAwareValuation({
    evidence: [sold("numeric-quality", 4_000, 2, { sourceQuality: 0 })],
    condition: CARD_CONDITION.LP,
  }), Error);
});

test("valuation never manufactures market value without verified sales", () => {
  const valuation = buildConditionAwareValuation({
    evidence: [
      { type: VALUE_EVIDENCE_TYPE.ACTIVE_LISTING, amount: usd(5_000), observedAt: "2026-08-24", sourceId: "ask" },
      { type: VALUE_EVIDENCE_TYPE.REFERENCE_PRICE, amount: usd(4_500), observedAt: "2026-08-24", sourceId: "guide" },
    ],
    condition: CARD_CONDITION.NM,
    asOf: "2026-08-25T00:00:00.000Z",
  });
  equal(valuation.rawReferenceValue, null);
  equal(valuation.conditionAdjustedValue, null);
  equal(valuation.sampleSize, 0);
});

function deal(overrides = {}) {
  return analyzeDealIntelligence({
    askingPrice: usd(1_000),
    expectedResaleValue: usd(10_000),
    sellingFeeBasisPoints: 0,
    minimumProfit: usd(2_000),
    strongProfit: usd(5_000),
    minimumRoiBasisPoints: 2_000,
    strongRoiBasisPoints: 4_000,
    confidence: INTELLIGENCE_CONFIDENCE.HIGH,
    completedSaleSampleSize: 5,
    ...overrides,
  });
}

test("deal intelligence emits STRONG_BUY with advisory rationale", () => {
  const result = deal();
  equal(result.recommendation, DEAL_RECOMMENDATION.STRONG_BUY);
  equal(result.advisoryOnly, true);
  equal(result.automaticPurchaseAllowed, false);
  ok(result.rationale.includes("estimated net profit"));
});

test("deal intelligence emits BUY, WATCH, PASS, and INSUFFICIENT_DATA", () => {
  equal(deal({ askingPrice: usd(5_000), strongProfit: usd(6_000) }).recommendation, DEAL_RECOMMENDATION.BUY);
  equal(deal({ confidence: INTELLIGENCE_CONFIDENCE.LOW }).recommendation, DEAL_RECOMMENDATION.WATCH);
  equal(deal({ askingPrice: usd(12_000) }).recommendation, DEAL_RECOMMENDATION.PASS);
  equal(analyzeDealIntelligence({ askingPrice: usd(1_000) }).recommendation, DEAL_RECOMMENDATION.INSUFFICIENT_DATA);
});

test("deal calculations include shipping, fees, exact ROI, and negative profit", () => {
  const result = deal({ askingPrice: usd(5_000), purchaseShipping: usd(500), sellingFeeBasisPoints: 1_000, outboundShipping: usd(500) });
  equal(result.estimatedAcquisitionCost.minorUnits, 5_500);
  equal(result.estimatedSellingFees.minorUnits, 1_000);
  equal(result.expectedNetProceeds.minorUnits, 8_500);
  equal(result.estimatedNetProfit.minorUnits, 3_000);
  equal(result.estimatedRoiBasisPoints, 5_454);
  ok(deal({ askingPrice: usd(12_000) }).estimatedNetProfit.minorUnits < 0);
});

test("major risks cap or reject an otherwise profitable deal", () => {
  equal(deal({ risks: [{ code: "UNKNOWN_CONTENTS", severity: "HIGH" }] }).recommendation, DEAL_RECOMMENDATION.WATCH);
  equal(deal({ risks: [{ code: "AUTHENTICITY", severity: "CRITICAL" }] }).recommendation, DEAL_RECOMMENDATION.PASS);
});

test("owner thresholds change deal recommendation without changing formulas", () => {
  const result = deal({ askingPrice: usd(5_000), minimumProfit: usd(7_000), minimumRoiBasisPoints: 15_000 });
  equal(result.recommendation, DEAL_RECOMMENDATION.WATCH);
  equal(result.assumptions.minimumProfit.minorUnits, 7_000);
});

test("insufficient comparable coverage is disclosed", () => {
  const result = deal({ confidence: INTELLIGENCE_CONFIDENCE.LOW, completedSaleSampleSize: 0, valueSource: "OWNER_ENTERED" });
  equal(result.recommendation, DEAL_RECOMMENDATION.WATCH);
  ok(result.warnings.some((warning) => warning.includes("No verified")));
});

test("multi-item lot avoids optimistic retail summing for expected value", () => {
  const lot = analyzeMultiItemLot({
    items: [
      { itemId: "known", certainty: LOT_ITEM_CERTAINTY.IDENTIFIED, quantity: 2, conservativeValueEach: usd(1_000), expectedValueEach: usd(2_000), optimisticValueEach: usd(3_000), sellThroughBasisPoints: 5_000, confidence: INTELLIGENCE_CONFIDENCE.HIGH },
      { itemId: "unknown", certainty: LOT_ITEM_CERTAINTY.UNKNOWN, quantity: 10, conservativeValueEach: usd(1_000), expectedValueEach: usd(2_000), optimisticValueEach: usd(10_000) },
    ],
    shippingBurden: usd(500),
    laborBurden: usd(500),
  });
  equal(lot.scenarios.expected.grossValue.minorUnits, 2_000);
  equal(lot.scenarios.optimistic.grossValue.minorUnits, 6_000);
  equal(lot.unknownContentsValuePolicy, "ZERO_UNLESS_OWNER_SUPPLIES_BULK_VALUE");
  ok(lot.spreadDrivers.some((driver) => driver.includes("unidentified")));
});

test("explicit owner bulk input is haircutted in expected lot value", () => {
  const lot = analyzeMultiItemLot({
    items: [{ certainty: LOT_ITEM_CERTAINTY.UNKNOWN, quantity: 20 }],
    ownerBulkValue: usd(2_000),
  });
  equal(lot.scenarios.expected.grossValue.minorUnits, 1_000);
  equal(lot.scenarios.optimistic.grossValue.minorUnits, 2_000);
});

test("repeated lot lines from one underlying source cannot create high confidence", () => {
  const lot = analyzeMultiItemLot({
    items: Array.from({ length: 8 }, (_, index) => ({
      itemId: `line-${index + 1}`,
      sourceId: `observation-${index + 1}`,
      underlyingSourceId: "one-owner-photo-set",
      certainty: LOT_ITEM_CERTAINTY.IDENTIFIED,
      expectedValueEach: usd(1_000),
      confidence: INTELLIGENCE_CONFIDENCE.HIGH,
    })),
  });
  equal(lot.confidence.independentSourceCount, 1);
  ok(lot.confidence.band !== INTELLIGENCE_CONFIDENCE.HIGH);
});

test("multi-item lot rejects confidence labels outside the shared vocabulary", () => {
  assertions += 1;
  assert.throws(() => analyzeMultiItemLot({
    items: [{ certainty: LOT_ITEM_CERTAINTY.IDENTIFIED, expectedValueEach: usd(1_000), confidence: "CERTAIN" }],
  }), /confidence is unsupported/);
});

test("auction includes premium, shipping, pickup, tax and solves an explainable maximum", () => {
  const result = analyzeAuctionIntelligence({
    currentBid: usd(1_000),
    expectedLotValue: usd(20_000),
    conservativeLotValue: usd(10_000),
    buyerPremiumBasisPoints: 2_000,
    taxMode: AUCTION_TAX_MODE.HAMMER_PLUS_PREMIUM,
    taxBasisPoints: 600,
    shipping: usd(1_000),
    pickupTravel: usd(500),
    labor: usd(500),
    sellingFeeBasisPoints: 1_000,
    sellingFixedCosts: usd(1_000),
    minimumProfit: usd(2_000),
    targetRoiBasisPoints: 2_000,
    confidence: INTELLIGENCE_CONFIDENCE.MEDIUM,
    ownerEnteredMaximum: usd(7_000),
    unknownContentsCount: 2,
  });
  equal(result.currentBidCostBreakdown.buyerPremium.minorUnits, 200);
  equal(result.currentBidCostBreakdown.tax.minorUnits, 72);
  equal(result.currentTotalAcquisitionCost.minorUnits, 3_272);
  ok(result.maximumRecommendedBid.minorUnits > 0);
  equal(result.ownerEnteredMaximum.minorUnits, 7_000);
  equal(result.automaticBidAllowed, false);
  ok(result.explanation.includes("highest bid"));
  ok(result.explanation.includes("tax on the winning bid and buyer premium"));
  ok(!result.explanation.includes("HAMMER_PLUS_PREMIUM"));
  ok(result.warnings.some((warning) => warning.includes("Unknown contents")));
  ok(result.downside.profitAtRecommendedBid.minorUnits < result.profitAtMaximumBid.minorUnits);
});

test("auction declines a bid ceiling without value evidence", () => {
  const result = analyzeAuctionIntelligence({ currentBid: usd(100) });
  equal(result.maximumRecommendedBid, null);
  equal(result.confidence, INTELLIGENCE_CONFIDENCE.INSUFFICIENT);
});

test("auction declines a misleading zero-dollar ceiling when net proceeds are negative", () => {
  const result = analyzeAuctionIntelligence({
    currentBid: usd(0),
    expectedLotValue: usd(1_000),
    sellingFixedCosts: usd(2_000),
    minimumProfit: usd(2_000),
    targetRoiBasisPoints: 2_000,
  });
  equal(result.expectedNetProceeds.minorUnits, -1_130);
  equal(result.maximumRecommendedBid, null);
  equal(result.profitAtMaximumBid, null);
  equal(result.roiAtMaximumBidBasisPoints, null);
  equal(result.confidence, INTELLIGENCE_CONFIDENCE.INSUFFICIENT);
  ok(result.explanation.includes("No maximum bid is proposed"));
});

test("auction flags current and owner bids above the explainable ceiling", () => {
  const assumptions = {
    expectedLotValue: usd(10_000),
    sellingFeeBasisPoints: 1_000,
    minimumProfit: usd(2_000),
    targetRoiBasisPoints: 2_000,
  };
  const baseline = analyzeAuctionIntelligence({ ...assumptions, currentBid: usd(0) });
  const unsafeBid = createMoney(baseline.maximumRecommendedBid.minorUnits + 1, "USD");
  const unsafeOwnerMaximum = createMoney(baseline.maximumRecommendedBid.minorUnits + 2, "USD");
  const result = analyzeAuctionIntelligence({
    ...assumptions,
    currentBid: unsafeBid,
    ownerEnteredMaximum: unsafeOwnerMaximum,
  });
  ok(result.warnings.some((warning) => /current bid exceeds/i.test(warning)));
  ok(result.warnings.some((warning) => /owner-entered maximum exceeds/i.test(warning)));
  ok(result.riskFlags.includes("CURRENT_BID_ABOVE_RECOMMENDED_MAXIMUM"));
  ok(result.riskFlags.includes("OWNER_MAXIMUM_ABOVE_RECOMMENDED_MAXIMUM"));
});

const restockObservation = (id, type, occurredAt, extra = {}) => ({
  observationId: id,
  type,
  storeId: "store-1",
  productId: "product-1",
  occurredAt,
  sourceId: id,
  underlyingSourceId: extra.underlyingSourceId || id,
  confidence: extra.confidence || INTELLIGENCE_CONFIDENCE.HIGH,
});

test("restock no-data and sparse-history results avoid fake precision", () => {
  const none = analyzeRestockIntelligence({ storeId: "store-1", productId: "product-1", asOf: "2026-08-25T12:00:00Z", observations: [] });
  equal(none.likelihoodBand, RESTOCK_LIKELIHOOD.INSUFFICIENT);
  equal(none.probability, null);
  const sparse = analyzeRestockIntelligence({
    storeId: "store-1",
    productId: "product-1",
    asOf: "2026-08-25T12:00:00Z",
    observations: [restockObservation("one", RESTOCK_OBSERVATION_TYPE.STOCK_OBSERVED, "2026-08-20T10:00:00Z")],
  });
  equal(sparse.likelihoodBand, RESTOCK_LIKELIHOOD.LOW);
  equal(sparse.expectedWindow, null);
});

test("strong recurring restock history produces a coarse high band", () => {
  const observations = [0, 7, 14, 21, 28, 35].map((days, index) => restockObservation(
    `weekly-${index}`,
    RESTOCK_OBSERVATION_TYPE.RESTOCK_EVIDENCE,
    new Date(Date.UTC(2026, 7, 24, 10) - days * 86_400_000).toISOString(),
  ));
  const result = analyzeRestockIntelligence({ storeId: "store-1", productId: "product-1", asOf: "2026-08-25T12:00:00Z", observations });
  equal(result.likelihoodBand, RESTOCK_LIKELIHOOD.HIGH);
  equal(result.confidence, INTELLIGENCE_CONFIDENCE.HIGH);
  equal(result.expectedWindow.timeBand, "MORNING");
  equal(result.expectedWindow.timeBasis, "UTC");
  equal(result.precisionPolicy, "COARSE_BANDS_ONLY");
  ok(result.warnings.some((warning) => /use UTC/i.test(warning)));
});

test("restock observations reject confidence labels outside the shared vocabulary", () => {
  assertions += 1;
  assert.throws(() => analyzeRestockIntelligence({
    storeId: "store-1",
    productId: "product-1",
    asOf: "2026-08-25T12:00:00Z",
    observations: [restockObservation("invalid-confidence", RESTOCK_OBSERVATION_TYPE.STOCK_OBSERVED, "2026-08-24T10:00:00Z", { confidence: "CERTAIN" })],
  }), /confidence is unsupported/);
});

test("restock observations reject invalid quantities instead of treating them as evidence", () => {
  for (const observedQuantity of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assertions += 1;
    assert.throws(() => analyzeRestockIntelligence({
      asOf: "2026-08-25T12:00:00Z",
      observations: [{
        ...restockObservation("invalid-quantity", RESTOCK_OBSERVATION_TYPE.STOCK_OBSERVED, "2026-08-24T10:00:00Z"),
        observedQuantity,
      }],
    }), /finite non-negative number/);
  }
});

test("stale or conflicting restock history is reduced", () => {
  const stale = analyzeRestockIntelligence({
    asOf: "2026-08-25T12:00:00Z",
    observations: [restockObservation("old", RESTOCK_OBSERVATION_TYPE.STOCK_OBSERVED, "2025-01-01T10:00:00Z")],
  });
  equal(stale.likelihoodBand, RESTOCK_LIKELIHOOD.LOW);
  equal(stale.dataFreshness.stale, true);
  const conflicting = analyzeRestockIntelligence({
    asOf: "2026-08-25T12:00:00Z",
    observations: [
      restockObservation("positive", RESTOCK_OBSERVATION_TYPE.STOCK_OBSERVED, "2026-08-24T10:00:00Z"),
      restockObservation("empty-1", RESTOCK_OBSERVATION_TYPE.EMPTY_SHELF, "2026-08-24T11:00:00Z"),
      restockObservation("empty-2", RESTOCK_OBSERVATION_TYPE.VISIT_UNSUCCESSFUL, "2026-08-24T12:00:00Z"),
    ],
  });
  equal(conflicting.likelihoodBand, RESTOCK_LIKELIHOOD.LOW);
  equal(conflicting.contradictoryEvidence.length, 2);
});

test("fresh contradictory evidence does not refresh a stale positive restock pattern", () => {
  const oldPositives = [0, 7, 14, 21, 28, 35].map((days, index) => restockObservation(
    `old-weekly-${index}`,
    RESTOCK_OBSERVATION_TYPE.RESTOCK_EVIDENCE,
    new Date(Date.UTC(2025, 1, 8, 10) - days * 86_400_000).toISOString(),
  ));
  const result = analyzeRestockIntelligence({
    asOf: "2026-08-25T12:00:00Z",
    observations: [
      ...oldPositives,
      restockObservation("fresh-empty", RESTOCK_OBSERVATION_TYPE.EMPTY_SHELF, "2026-08-24T12:00:00Z"),
    ],
  });
  equal(result.dataFreshness.newestObservationAgeDays, 1);
  ok(result.dataFreshness.newestPositiveAgeDays > 500);
  equal(result.dataFreshness.stale, true);
  equal(result.likelihoodBand, RESTOCK_LIKELIHOOD.LOW);
});

test("repeated restock observations from one underlying source cannot be promoted to high confidence", () => {
  const observations = [0, 7, 14, 21, 28, 35].map((days, index) => restockObservation(
    `same-feed-${index}`,
    RESTOCK_OBSERVATION_TYPE.RESTOCK_EVIDENCE,
    new Date(Date.UTC(2026, 7, 24, 10) - days * 86_400_000).toISOString(),
    { underlyingSourceId: "one-underlying-feed" },
  ));
  const result = analyzeRestockIntelligence({ asOf: "2026-08-25T12:00:00Z", observations });
  equal(result.sourceIndependenceCount, 1);
  equal(result.confidence, result.confidenceDetails.band);
  ok(result.confidence !== INTELLIGENCE_CONFIDENCE.HIGH);
});

test("duplicate sources do not create high confidence", () => {
  const confidence = evaluateConfidence({
    sources: Array.from({ length: 10 }, (_, index) => ({ sourceId: `copy-${index}`, underlyingSourceId: "one-feed", quality: "HIGH" })),
    sampleSize: 10,
    freshness: 1,
    identityConfidence: "HIGH",
    conditionConfidence: "HIGH",
    completeness: 1,
  });
  equal(confidence.independentSourceCount, 1);
  ok(confidence.band !== INTELLIGENCE_CONFIDENCE.HIGH);
});

await asyncTest("pipeline is deterministic by normalized input and preserves owner condition", async () => {
  const pipeline = createCardAnalysisPipeline({ clock: () => "2026-08-25T12:00:00.000Z" });
  const base = {
    identity: { productName: "Test Card", set: "Sample", cardNumber: "001", source: EVIDENCE_PROVENANCE.OWNER_ENTERED, confidence: INTELLIGENCE_CONFIDENCE.HIGH },
    images: completeImages,
    observations: [defect(DEFECT_TYPE.CREASES, DEFECT_SEVERITY.SEVERE)],
    inspectionComplete: true,
    ownerCorrections: { confirmedCondition: CARD_CONDITION.LP, correctedAt: "2026-08-24T12:00:00Z" },
    valuationEvidence: [sold("pipeline-sale", 4_000, 2)],
  };
  const first = await pipeline.analyze(base);
  const second = await pipeline.analyze({
    valuationEvidence: base.valuationEvidence,
    ownerCorrections: base.ownerCorrections,
    inspectionComplete: true,
    observations: base.observations,
    images: base.images,
    identity: { confidence: INTELLIGENCE_CONFIDENCE.HIGH, source: EVIDENCE_PROVENANCE.OWNER_ENTERED, cardNumber: "001", set: "Sample", productName: "Test Card" },
  });
  equal(first.inputHash, second.inputHash);
  equal(await hashCanonicalJson(first.normalizedInput), first.inputHash);
  equal(first.analysisVersion, 1);
  equal(first.condition.proposedCondition, CARD_CONDITION.DMG);
  equal(first.condition.ownerConfirmedCondition, CARD_CONDITION.LP);
  equal(first.condition.resolvedCondition, CARD_CONDITION.LP);
  equal(first.persistence.persisted, false);
});

await asyncTest("owner resale assumptions cannot borrow completed-sale confidence", async () => {
  const pipeline = createCardAnalysisPipeline({ clock: () => "2026-08-25T12:00:00.000Z" });
  const result = await pipeline.analyze({
    identity: { productName: "Owner Assumption Card", source: EVIDENCE_PROVENANCE.OWNER_ENTERED, confidence: INTELLIGENCE_CONFIDENCE.HIGH },
    images: completeImages,
    observations: [],
    inspectionComplete: true,
    valuationEvidence: [0, 1, 2, 3, 4].map((index) => sold(`owner-assumption-sale-${index}`, 1_000, index + 1)),
    dealAssumptions: {
      askingPrice: usd(1_000),
      expectedResaleValue: usd(10_000),
      sellingFeeBasisPoints: 0,
      minimumProfit: usd(2_000),
      minimumRoiBasisPoints: 2_000,
    },
  });
  equal(result.valuation.confidence.band, INTELLIGENCE_CONFIDENCE.HIGH);
  equal(result.valuation.conditionAdjustedValue.minorUnits, 1_000);
  equal(result.dealIntelligence.expectedResaleValue.minorUnits, 10_000);
  equal(result.dealIntelligence.confidence, INTELLIGENCE_CONFIDENCE.LOW);
  equal(result.dealIntelligence.recommendation, DEAL_RECOMMENDATION.WATCH);
  equal(result.dealIntelligence.assumptions.valueSource, "OWNER_ASSUMPTION");
});

await asyncTest("pipeline uses explicit adapters and only persists when requested", async () => {
  let persisted = 0;
  const pipeline = createCardAnalysisPipeline({
    clock: () => "2026-08-25T12:00:00.000Z",
    identityResolver: async (input) => ({ ...input.identity, productName: "Resolved Card", source: EVIDENCE_PROVENANCE.PROVIDER_SUPPLIED }),
    evidenceExtractor: async (input) => ({ images: input.images, observations: input.observations }),
    persistAnalysis: async (result) => { persisted += 1; return { id: result.inputHash.slice(0, 12) }; },
  });
  const result = await pipeline.analyze({ identity: {}, images: completeImages, inspectionComplete: true }, { persist: true });
  equal(result.identity.productName, "Resolved Card");
  equal(result.evidence.extractionAdapterUsed, true);
  equal(result.persistence.persisted, true);
  equal(persisted, 1);
});

await asyncTest("analysis inputs cannot assert authoritative owner scope", async () => {
  const pipeline = createCardAnalysisPipeline();
  for (const unsafe of [
    { identity: {}, ownerSubject: "browser-controlled" },
    { identity: { metadata: { role: "OWNER" } } },
    { images: [{ reference: "local://image", metadata: { session: "forged" } }] },
    { dealAssumptions: { nested: { access_token: "forged" } } },
  ]) {
    assertions += 1;
    await assert.rejects(
      pipeline.analyze(unsafe),
      (error) => error instanceof IntelligenceContractError && error.code === "AUTHORITATIVE_OWNER_SCOPE_PROHIBITED",
    );
  }
  const unsafeAdapter = createCardAnalysisPipeline({
    evidenceExtractor: async () => ({ observations: [{ metadata: { token: "forged" } }] }),
  });
  assertions += 1;
  await assert.rejects(
    unsafeAdapter.analyze({ identity: {} }),
    (error) => error instanceof IntelligenceContractError && error.code === "AUTHORITATIVE_OWNER_SCOPE_PROHIBITED",
  );
});

console.log(`Code 3 intelligence domain: ${assertions} assertions passed.`);
